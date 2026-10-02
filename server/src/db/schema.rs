//! The schema, as a chain of migrations that each run once. A migration
//! stays as it was written: what it lists is what it did at the time.
use crate::error::ApiError;
use deadpool_postgres::{Client, Transaction};
use std::collections::HashSet;

pub(crate) async fn has_migration_run(client: &mut Client, name: &str) -> Result<bool, ApiError> {
    let count: i64 = client
        .query_one(
            "SELECT COUNT(*) FROM groupironman.migrations WHERE name=$1",
            &[&name],
        )
        .await?
        .try_get(0)?;

    Ok(count > 0)
}

pub(crate) async fn commit_migration(
    transaction: &Transaction<'_>,
    name: &str,
) -> Result<(), ApiError> {
    transaction
        .execute(
            "INSERT INTO groupironman.migrations (name, date) VALUES($1, NOW())",
            &[&name],
        )
        .await?;

    Ok(())
}

/// Member data columns that carry a `<column>_last_update` timestamp.
pub const TIMESTAMPED_MEMBER_COLUMNS: [&str; 5] =
    ["stats", "coordinates", "skills", "inventory", "equipment"];

/// Group Ironman data the guild map never receives (neither the hub nor the
/// plugin sends it), dropped by the `drop_group_ironman_data` migration.
pub const DROPPED_MEMBER_COLUMNS: [&str; 8] = [
    "quests",
    "bank",
    "rune_pouch",
    "interacting",
    "seed_vault",
    "diary_vars",
    "collection_log",
    "potion_storage",
];

async fn create_timestamp_trigger(
    transaction: &Transaction<'_>,
    name: &str,
) -> Result<(), ApiError> {
    let create_fn = format!(
        r#"
CREATE OR REPLACE FUNCTION groupironman.update_{0}_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    -- Keep a timestamp the statement set itself (the update batcher does);
    -- only stamp now() when it was left unchanged.
    IF NEW.{0}_last_update IS NOT DISTINCT FROM OLD.{0}_last_update THEN
        NEW.{0}_last_update = now();
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';
"#,
        name
    );
    transaction.execute(&create_fn, &[]).await?;

    let trigger_stmt = format!(
        r#"
DO
$$BEGIN
  CREATE TRIGGER set_{0}_timestamp
  BEFORE UPDATE ON groupironman.members
  FOR EACH ROW
  WHEN (OLD.{0} IS DISTINCT FROM NEW.{0})
  EXECUTE FUNCTION groupironman.update_{0}_timestamp();
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END;$$;
"#,
        name
    );
    transaction.execute(&trigger_stmt, &[]).await?;

    Ok(())
}

pub async fn update_schema(client: &mut Client) -> Result<(), ApiError> {
    // Bootstrap the objects every migration below depends on, so a fresh
    // database needs no manual schema.sql step.
    client
        .batch_execute(
            r#"
CREATE SCHEMA IF NOT EXISTS groupironman;
CREATE TABLE IF NOT EXISTS groupironman.groups(
    group_id BIGSERIAL UNIQUE,
    group_name TEXT NOT NULL,
    group_token_hash CHAR(64) NOT NULL,
    PRIMARY KEY (group_name, group_token_hash)
);
"#,
        )
        .await?;

    client
        .execute(
            r#"
CREATE TABLE IF NOT EXISTS groupironman.migrations (
    name TEXT,
    date TIMESTAMPTZ
)
"#,
            &[],
        )
        .await?;

    if !has_migration_run(client, "add_groups_version_column").await? {
        let transaction = client.transaction().await?;
        transaction
            .execute(
                r#"
ALTER TABLE groupironman.groups ADD COLUMN IF NOT EXISTS version INTEGER default 1
"#,
                &[],
            )
            .await?;

        commit_migration(&transaction, "add_groups_version_column").await?;
        transaction.commit().await?;
    }

    if !has_migration_run(client, "create_members_table").await? {
        let transaction = client.transaction().await?;
        transaction
            .execute(
                r#"
CREATE TABLE IF NOT EXISTS groupironman.members (
  member_id BIGSERIAL PRIMARY KEY,
  group_id BIGSERIAL REFERENCES groupironman.groups(group_id),
  member_name TEXT NOT NULL,

  stats_last_update TIMESTAMPTZ,
  stats INTEGER[7],

  coordinates_last_update TIMESTAMPTZ,
  coordinates INTEGER[3],

  skills_last_update TIMESTAMPTZ,
  skills INTEGER[24],

  quests_last_update TIMESTAMPTZ,
  quests bytea,

  inventory_last_update TIMESTAMPTZ,
  inventory INTEGER[56],

  equipment_last_update TIMESTAMPTZ,
  equipment INTEGER[28],

  rune_pouch_last_update TIMESTAMPTZ,
  rune_pouch INTEGER[8],

  bank_last_update TIMESTAMPTZ,
  bank INTEGER[],

  seed_vault_last_update TIMESTAMPTZ,
  seed_vault INTEGER[],

  interacting_last_update TIMESTAMPTZ,
  interacting TEXT
);
"#,
                &[],
            )
            .await?;

        transaction.execute(r#"
CREATE UNIQUE INDEX IF NOT EXISTS members_groupid_name_idx ON groupironman.members (group_id, member_name);
"#, &[]).await?;

        commit_migration(&transaction, "create_members_table").await?;
        transaction.commit().await?;
    }

    if !has_migration_run(client, "add_diary_vars").await? {
        let transaction = client.transaction().await?;
        // Adding new columns for new types of data
        transaction
            .execute(
                r#"
ALTER TABLE groupironman.members
ADD COLUMN IF NOT EXISTS diary_vars_last_update TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS diary_vars INTEGER[62]
"#,
                &[],
            )
            .await?;

        commit_migration(&transaction, "add_diary_vars").await?;
        transaction.commit().await?;
    }

    if !has_migration_run(client, "add_skill_periods").await? {
        let transaction = client.transaction().await?;

        let periods = vec!["day", "month", "year"];
        for period in periods {
            let create_skills_aggregate = format!(
                r#"
CREATE TABLE IF NOT EXISTS groupironman.skills_{} (
    member_id BIGSERIAL REFERENCES groupironman.members(member_id),
    time TIMESTAMPTZ,
    skills INTEGER[24],

    PRIMARY KEY (member_id, time)
);
"#,
                period
            );
            transaction.execute(&create_skills_aggregate, &[]).await?;
        }

        transaction
            .execute(
                r#"
CREATE TABLE IF NOT EXISTS groupironman.aggregation_info (
    type TEXT PRIMARY KEY,
    last_aggregation TIMESTAMPTZ NOT NULL DEFAULT TIMESTAMP WITH TIME ZONE 'epoch'
);
"#,
                &[],
            )
            .await?;
        transaction
            .execute(
                r#"
INSERT INTO groupironman.aggregation_info (type) VALUES ('skills')
ON CONFLICT (type) DO NOTHING
"#,
                &[],
            )
            .await?;

        commit_migration(&transaction, "add_skill_periods").await?;
        transaction.commit().await?;
    }

    if !has_migration_run(client, "member_name_citext").await? {
        let transaction = client.transaction().await?;

        // We need to rename members in groups which would violate the unique constraint after
        // we make the column case insensitive.
        let duplicates = transaction
            .query(
                r#"
SELECT a.group_id, a.member_id, a.member_name FROM groupironman.members a
INNER JOIN (
	SELECT group_id, lower(member_name) as member_name, COUNT(*) FROM groupironman.members
	GROUP BY group_id, lower(member_name)
	HAVING COUNT(*) > 1
) b
ON a.group_id=b.group_id AND lower(a.member_name)=lower(b.member_name)
ORDER BY GREATEST(
	stats_last_update,
	coordinates_last_update,
	skills_last_update,
	quests_last_update,
	inventory_last_update,
	equipment_last_update,
	bank_last_update,
	rune_pouch_last_update,
	interacting_last_update,
	seed_vault_last_update,
	diary_vars_last_update
) ASC;
"#,
                &[],
            )
            .await?;

        let mut already_encounted: HashSet<String> = HashSet::new();
        for row in duplicates {
            let group_id: i64 = row.try_get("group_id")?;
            let member_id: i64 = row.try_get("member_id")?;
            let member_name: String = row.try_get("member_name")?;
            let member_name_lower: String = member_name.to_lowercase();

            let key = format!("{}::{}", group_id, member_name_lower);
            // Skip the first encounter with the duplicate name since that is the entry
            // with the most recent update.
            if !already_encounted.insert(key) {
                log::info!(
                    "Renaming duplicate member name '{}' in group '{}'",
                    member_name,
                    group_id
                );

                for _ in 1..5 {
                    let uuid = uuid::Uuid::new_v4().hyphenated().to_string();
                    let new_name = &uuid[..uuid.find("-").unwrap()];
                    log::info!("Trying new name '{}'", new_name);
                    if transaction
                        .execute(
                            "UPDATE groupironman.members SET member_name=$1 WHERE member_id=$2",
                            &[&new_name, &member_id],
                        )
                        .await
                        .is_ok()
                    {
                        break;
                    }
                }
            }
        }

        transaction
            .execute(
                "CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public",
                &[],
            )
            .await
            .ok();
        transaction
            .execute(
                "ALTER TABLE groupironman.members ALTER COLUMN member_name TYPE citext",
                &[],
            )
            .await?;

        commit_migration(&transaction, "member_name_citext").await?;
        transaction.commit().await?;
    }

    if !has_migration_run(client, "add_collection_log_member_column").await? {
        let transaction = client.transaction().await?;
        transaction
            .execute(
                r#"
ALTER TABLE groupironman.members
ADD COLUMN IF NOT EXISTS collection_log_last_update TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS collection_log INTEGER[]
"#,
                &[],
            )
            .await?;
        commit_migration(&transaction, "add_collection_log_member_column").await?;
        transaction.commit().await?;
    }

    if !has_migration_run(client, "update_timestamp_triggers").await? {
        let transaction = client.transaction().await?;

        let names = vec![
            "stats",
            "coordinates",
            "skills",
            "quests",
            "inventory",
            "equipment",
            "bank",
            "rune_pouch",
            "interacting",
            "seed_vault",
            "diary_vars",
            "collection_log",
        ];

        for name in names {
            create_timestamp_trigger(&transaction, name).await?;
        }

        commit_migration(&transaction, "update_timestamp_triggers").await?;
        transaction.commit().await?;
    }

    if !has_migration_run(client, "add_device_pairing_tables").await? {
        let transaction = client.transaction().await?;
        transaction
            .execute(
                r#"
CREATE TABLE IF NOT EXISTS groupironman.pairing_codes (
    code TEXT PRIMARY KEY,
    group_id BIGINT NOT NULL REFERENCES groupironman.groups(group_id),
    expires_at TIMESTAMPTZ NOT NULL
)
"#,
                &[],
            )
            .await?;
        transaction
            .execute(
                r#"
CREATE TABLE IF NOT EXISTS groupironman.devices (
    device_id TEXT PRIMARY KEY,
    group_id BIGINT NOT NULL REFERENCES groupironman.groups(group_id),
    token_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
"#,
                &[],
            )
            .await?;
        commit_migration(&transaction, "add_device_pairing_tables").await?;
        transaction.commit().await?;
    }

    if !has_migration_run(client, "add_user_management_tables").await? {
        let transaction = client.transaction().await?;
        transaction
            .execute(
                r#"
CREATE TABLE IF NOT EXISTS groupironman.users (
    user_id BIGSERIAL PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen TIMESTAMPTZ
)
"#,
                &[],
            )
            .await?;
        transaction
            .execute(
                r#"
CREATE TABLE IF NOT EXISTS groupironman.sessions (
    session_id TEXT PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES groupironman.users(user_id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
)
"#,
                &[],
            )
            .await?;
        transaction
            .execute(
                r#"
CREATE TABLE IF NOT EXISTS groupironman.audit_log (
    log_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES groupironman.users(user_id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    target_user_id BIGINT REFERENCES groupironman.users(user_id) ON DELETE SET NULL,
    details TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
"#,
                &[],
            )
            .await?;
        // Add user_id to pairing_codes and devices if not already present
        transaction
            .execute(
                "ALTER TABLE groupironman.pairing_codes ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES groupironman.users(user_id) ON DELETE CASCADE",
                &[],
            )
            .await?;
        transaction
            .execute(
                "ALTER TABLE groupironman.devices ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES groupironman.users(user_id) ON DELETE CASCADE",
                &[],
            )
            .await?;
        commit_migration(&transaction, "add_user_management_tables").await?;
        transaction.commit().await?;
    }

    if !has_migration_run(client, "add_user_player_links_table").await? {
        let transaction = client.transaction().await?;
        transaction
            .execute(
                r#"
CREATE TABLE IF NOT EXISTS groupironman.user_player_links (
    user_id BIGINT NOT NULL REFERENCES groupironman.users(user_id) ON DELETE CASCADE,
    member_name CITEXT NOT NULL,
    group_id BIGINT NOT NULL REFERENCES groupironman.groups(group_id),
    last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, member_name, group_id)
)
"#,
                &[],
            )
            .await?;
        commit_migration(&transaction, "add_user_player_links_table").await?;
        transaction.commit().await?;
    }

    if !has_migration_run(client, "add_discord_users_table").await? {
        let transaction = client.transaction().await?;
        transaction
            .execute(
                r#"
CREATE TABLE IF NOT EXISTS groupironman.discord_users (
    discord_id TEXT NOT NULL,
    user_id BIGINT NOT NULL REFERENCES groupironman.users(user_id) ON DELETE CASCADE,
    discord_username TEXT NOT NULL,
    linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (discord_id)
)
"#,
                &[],
            )
            .await?;
        transaction
            .execute(
                "CREATE INDEX IF NOT EXISTS idx_discord_users_user_id ON groupironman.discord_users(user_id)",
                &[],
            )
            .await?;
        commit_migration(&transaction, "add_discord_users_table").await?;
        transaction.commit().await?;
    }

    // Make password_hash nullable for Discord-only users
    if !has_migration_run(client, "make_password_hash_nullable").await? {
        let transaction = client.transaction().await?;
        transaction
            .execute(
                "ALTER TABLE groupironman.users ALTER COLUMN password_hash DROP NOT NULL",
                &[],
            )
            .await?;
        // Default empty string for new rows (e.g. Discord-only users) where no password is provided
        transaction
            .execute(
                "ALTER TABLE groupironman.users ALTER COLUMN password_hash SET DEFAULT ''",
                &[],
            )
            .await?;
        commit_migration(&transaction, "make_password_hash_nullable").await?;
        transaction.commit().await?;
    }

    if !has_migration_run(client, "add_potion_storage").await? {
        let transaction = client.transaction().await?;
        transaction
            .execute(
                r#"
ALTER TABLE groupironman.members
ADD COLUMN IF NOT EXISTS potion_storage_last_update TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS potion_storage INTEGER[]
"#,
                &[],
            )
            .await?;

        create_timestamp_trigger(&transaction, "potion_storage").await?;

        commit_migration(&transaction, "add_potion_storage").await?;
        transaction.commit().await?;
    }

    if !has_migration_run(client, "timestamp_triggers_respect_explicit").await? {
        let transaction = client.transaction().await?;
        for name in TIMESTAMPED_MEMBER_COLUMNS {
            create_timestamp_trigger(&transaction, name).await?;
        }
        commit_migration(&transaction, "timestamp_triggers_respect_explicit").await?;
        transaction.commit().await?;
    }

    if !has_migration_run(client, "add_hub_columns").await? {
        let transaction = client.transaction().await?;
        transaction
            .batch_execute(
                r#"
ALTER TABLE groupironman.members
ADD COLUMN IF NOT EXISTS hub_account_id TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS hub_last_seen TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS hub_orphaned_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS account_hash TEXT,
ADD COLUMN IF NOT EXISTS last_source TEXT;
CREATE INDEX IF NOT EXISTS idx_members_account_hash ON groupironman.members(account_hash);
ALTER TABLE groupironman.user_player_links
ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'device';
"#,
            )
            .await?;
        commit_migration(&transaction, "add_hub_columns").await?;
        transaction.commit().await?;
    }

    if !has_migration_run(client, "drop_group_ironman_data").await? {
        let transaction = client.transaction().await?;
        // The triggers' WHEN clauses depend on the columns, so they go first.
        for name in DROPPED_MEMBER_COLUMNS {
            transaction
                .batch_execute(&format!(
                    r#"
DROP TRIGGER IF EXISTS set_{0}_timestamp ON groupironman.members;
DROP FUNCTION IF EXISTS groupironman.update_{0}_timestamp();
ALTER TABLE groupironman.members
DROP COLUMN IF EXISTS {0},
DROP COLUMN IF EXISTS {0}_last_update;
"#,
                    name
                ))
                .await?;
        }
        transaction
            .batch_execute(
                r#"
ALTER TABLE groupironman.members DROP COLUMN IF EXISTS last_source;
DROP TABLE IF EXISTS groupironman.devices;
DROP TABLE IF EXISTS groupironman.pairing_codes;
DROP TABLE IF EXISTS groupironman.collection_log;
DROP TABLE IF EXISTS groupironman.collection_log_new;
UPDATE groupironman.user_player_links SET source='manual' WHERE source='device';
ALTER TABLE groupironman.user_player_links ALTER COLUMN source SET DEFAULT 'manual';
"#,
            )
            .await?;
        commit_migration(&transaction, "drop_group_ironman_data").await?;
        transaction.commit().await?;
    }

    if !has_migration_run(client, "add_presence_and_hub_meta").await? {
        let transaction = client.transaction().await?;
        transaction
            .batch_execute(
                r#"
ALTER TABLE groupironman.members
ADD COLUMN IF NOT EXISTS hub_online BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS hub_meta JSONB,
ADD COLUMN IF NOT EXISTS hub_meta_last_update TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT FALSE;
"#,
            )
            .await?;
        commit_migration(&transaction, "add_presence_and_hub_meta").await?;
        transaction.commit().await?;
    }

    // The map keeps no accounts of its own any more: people sign in with
    // Discord and the hub says who is a member and who an admin. A session
    // holds what the hub said.
    if !has_migration_run(client, "hub_decides_sessions").await? {
        let transaction = client.transaction().await?;
        transaction
            .batch_execute(
                r#"
DROP TABLE IF EXISTS groupironman.user_player_links;
DROP TABLE IF EXISTS groupironman.discord_users;
DROP TABLE IF EXISTS groupironman.audit_log;
DROP TABLE IF EXISTS groupironman.sessions;
DROP TABLE IF EXISTS groupironman.users;
CREATE TABLE groupironman.sessions (
    session_id TEXT PRIMARY KEY,
    discord_id TEXT NOT NULL,
    name TEXT NOT NULL,
    is_admin BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_sessions_discord_id ON groupironman.sessions(discord_id);
"#,
            )
            .await?;
        commit_migration(&transaction, "hub_decides_sessions").await?;
        transaction.commit().await?;
    }

    Ok(())
}
