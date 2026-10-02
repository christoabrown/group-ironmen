use crate::error::ApiError;
use crate::models::{
    AggregateSkillData, GroupDataResponse, GroupMember, GroupSkillData, MemberSkillData,
    PlayerInfo, RosterEntry, Session,
};
use chrono::{DateTime, Utc};
use deadpool_postgres::{Client, Transaction};
use std::collections::{HashMap, HashSet};

pub async fn delete_skills_data_for_member(
    transaction: &Transaction<'_>,
    period: AggregatePeriod,
    member_id: i64,
) -> Result<(), ApiError> {
    let s = format!(
        r#"
DELETE FROM groupironman.skills_{} WHERE member_id=$1
"#,
        match period {
            AggregatePeriod::Day => "day",
            AggregatePeriod::Month => "month",
            AggregatePeriod::Year => "year",
        }
    );
    let delete_skills_data_stmt = transaction.prepare_cached(&s).await?;
    transaction
        .execute(&delete_skills_data_stmt, &[&member_id])
        .await?;

    Ok(())
}

pub async fn get_member_id(
    client: &Client,
    group_id: i64,
    member_name: &str,
) -> Result<i64, ApiError> {
    let get_member_id_stmt = client
        .prepare_cached(
            "SELECT member_id FROM groupironman.members WHERE group_id=$1 AND member_name=$2",
        )
        .await?;
    let member_id: i64 = client
        .query_one(&get_member_id_stmt, &[&group_id, &member_name])
        .await
        .map_err(ApiError::DeleteGroupMemberError)?
        .try_get(0)?;
    Ok(member_id)
}

pub async fn delete_group_member(
    client: &mut Client,
    group_id: i64,
    member_name: &str,
) -> Result<(), ApiError> {
    let member_id = get_member_id(client, group_id, member_name).await?;
    let transaction = client.transaction().await?;
    delete_skills_data_for_member(&transaction, AggregatePeriod::Day, member_id).await?;
    delete_skills_data_for_member(&transaction, AggregatePeriod::Month, member_id).await?;
    delete_skills_data_for_member(&transaction, AggregatePeriod::Year, member_id).await?;
    let stmt = transaction
        .prepare_cached("DELETE FROM groupironman.members WHERE group_id=$1 AND member_name=$2")
        .await?;
    transaction
        .execute(&stmt, &[&group_id, &member_name])
        .await
        .map_err(ApiError::DeleteGroupMemberError)?;

    transaction
        .commit()
        .await
        .map_err(ApiError::DeleteGroupMemberError)?;

    Ok(())
}

/// A player counts as online while the hub says so and the sync has confirmed
/// it recently; if the sync stops (hub down), everyone goes offline.
pub const ONLINE_CONFIRMATION: &str = "interval '5 minutes'";

/// How far the returned cursor lags behind the database clock, so that updates
/// committed by a transaction that started just before the poll are not missed.
/// Re-sending them is harmless: the site merges by name.
const CURSOR_OVERLAP_MS: i64 = 2000;

/// The roster (every visible member with its presence) and the data of the
/// members that changed at or after `timestamp`.
pub async fn get_group_data(
    client: &Client,
    group_id: i64,
    timestamp: &DateTime<Utc>,
) -> Result<GroupDataResponse, ApiError> {
    let stmt = client
        .prepare_cached(&format!(
            r#"
SELECT member_name::text AS member_name, now() AS db_now,
(hub_online AND hub_last_seen > now() - {ONLINE_CONFIRMATION}) AS online,
hub_last_seen, hub_orphaned_at IS NOT NULL AS orphaned,
GREATEST(stats_last_update, coordinates_last_update, skills_last_update,
inventory_last_update, equipment_last_update, hub_meta_last_update) AS last_updated,
CASE WHEN stats_last_update >= $1::TIMESTAMPTZ THEN stats ELSE NULL END AS stats,
CASE WHEN coordinates_last_update >= $1::TIMESTAMPTZ THEN coordinates ELSE NULL END AS coordinates,
CASE WHEN skills_last_update >= $1::TIMESTAMPTZ THEN skills ELSE NULL END AS skills,
CASE WHEN inventory_last_update >= $1::TIMESTAMPTZ THEN inventory ELSE NULL END AS inventory,
CASE WHEN equipment_last_update >= $1::TIMESTAMPTZ THEN equipment ELSE NULL END AS equipment,
CASE WHEN hub_meta_last_update >= $1::TIMESTAMPTZ THEN hub_meta ELSE NULL END AS meta
FROM groupironman.members WHERE group_id=$2 AND NOT hidden
ORDER BY member_name
"#
        ))
        .await?;

    let rows = client
        .query(&stmt, &[&timestamp, &group_id])
        .await
        .map_err(ApiError::GetGroupDataError)?;
    let mut roster = Vec::with_capacity(rows.len());
    let mut members = Vec::new();
    let mut db_now: Option<DateTime<Utc>> = None;
    for row in rows {
        db_now = Some(row.try_get("db_now")?);
        let name: String = row.try_get("member_name")?;
        roster.push(RosterEntry {
            name: name.clone(),
            online: row.try_get("online")?,
            last_seen: row.try_get("hub_last_seen")?,
            orphaned: row.try_get("orphaned")?,
        });
        let last_updated: Option<DateTime<Utc>> = row.try_get("last_updated")?;
        if last_updated.is_none_or(|at| at < *timestamp) {
            continue;
        }
        members.push(GroupMember {
            group_id: Some(group_id),
            name,
            last_updated,
            stats: row.try_get("stats")?,
            coordinates: row.try_get("coordinates")?,
            skills: row.try_get("skills")?,
            inventory: row.try_get("inventory")?,
            equipment: row.try_get("equipment")?,
            meta: row.try_get("meta")?,
        });
    }

    let now = match db_now {
        Some(now) => now,
        None => client.query_one("SELECT now()", &[]).await?.try_get(0)?,
    };
    Ok(GroupDataResponse {
        cursor: now - chrono::Duration::milliseconds(CURSOR_OVERLAP_MS),
        roster,
        members,
    })
}

pub enum AggregatePeriod {
    Day,
    Month,
    Year,
}
async fn aggregate_skills_for_period(
    transaction: &Transaction<'_>,
    period: AggregatePeriod,
    last_aggregation: &DateTime<Utc>,
) -> Result<(), ApiError> {
    let s = format!(
        r#"
INSERT INTO groupironman.skills_{} (member_id, time, skills)
SELECT member_id, date_trunc('{}', skills_last_update), skills FROM groupironman.members
WHERE skills_last_update IS NOT NULL AND skills IS NOT NULL AND skills_last_update >= $1
ON CONFLICT (member_id, time)
DO UPDATE SET skills=excluded.skills;
"#,
        match period {
            AggregatePeriod::Day => "day",
            AggregatePeriod::Month => "month",
            AggregatePeriod::Year => "year",
        },
        match period {
            AggregatePeriod::Day => "hour",
            AggregatePeriod::Month => "day",
            AggregatePeriod::Year => "month",
        }
    );
    let aggregate_stmt = transaction.prepare_cached(&s).await?;
    transaction
        .execute(&aggregate_stmt, &[&last_aggregation])
        .await?;

    Ok(())
}

async fn apply_skills_retention_for_period(
    transaction: &Transaction<'_>,
    period: AggregatePeriod,
    last_aggregation: &DateTime<Utc>,
) -> Result<(), ApiError> {
    let s = format!(
        r#"
DELETE FROM groupironman.skills_{0}
WHERE time < ($1::timestamptz - interval '{1}') AND (member_id, time) NOT IN (
  SELECT member_id, max(time) FROM groupironman.skills_{0} WHERE time < ($1::timestamptz - interval '{1}') GROUP BY member_id
)
"#,
        match period {
            AggregatePeriod::Day => "day",
            AggregatePeriod::Month => "month",
            AggregatePeriod::Year => "year",
        },
        match period {
            AggregatePeriod::Day => "1 day",
            AggregatePeriod::Month => "1 month",
            AggregatePeriod::Year => "1 year",
        }
    );
    let delete_old_rows_stmt = transaction.prepare_cached(&s).await?;
    transaction
        .execute(&delete_old_rows_stmt, &[&last_aggregation])
        .await?;

    Ok(())
}

pub async fn get_last_skills_aggregation(client: &Client) -> Result<DateTime<Utc>, ApiError> {
    let last_aggregation_stmt = client
        .prepare_cached(
            r#"
SELECT last_aggregation FROM groupironman.aggregation_info WHERE type='skills'"#,
        )
        .await?;
    let last_aggregation: DateTime<Utc> = client
        .query_one(&last_aggregation_stmt, &[])
        .await?
        .try_get(0)?;

    Ok(last_aggregation)
}

pub async fn aggregate_skills(client: &mut Client) -> Result<(), ApiError> {
    let last_aggregation = get_last_skills_aggregation(client).await?;

    let transaction = client.transaction().await?;
    let update_last_aggregation_stmt = transaction
        .prepare_cached(
            r#"
UPDATE groupironman.aggregation_info SET last_aggregation=NOW() WHERE type='skills'"#,
        )
        .await?;
    transaction
        .execute(&update_last_aggregation_stmt, &[])
        .await?;

    aggregate_skills_for_period(&transaction, AggregatePeriod::Day, &last_aggregation).await?;
    aggregate_skills_for_period(&transaction, AggregatePeriod::Month, &last_aggregation).await?;
    aggregate_skills_for_period(&transaction, AggregatePeriod::Year, &last_aggregation).await?;
    transaction.commit().await?;

    Ok(())
}

pub async fn apply_skills_retention(client: &mut Client) -> Result<(), ApiError> {
    let last_aggregation = get_last_skills_aggregation(client).await?;

    let transaction = client.transaction().await?;
    apply_skills_retention_for_period(&transaction, AggregatePeriod::Day, &last_aggregation)
        .await?;
    apply_skills_retention_for_period(&transaction, AggregatePeriod::Month, &last_aggregation)
        .await?;
    apply_skills_retention_for_period(&transaction, AggregatePeriod::Year, &last_aggregation)
        .await?;
    transaction.commit().await?;

    Ok(())
}

pub async fn get_skills_for_period(
    client: &Client,
    group_id: i64,
    period: AggregatePeriod,
) -> Result<GroupSkillData, ApiError> {
    let s = format!(
        r#"
SELECT member_name, time, s.skills
FROM groupironman.skills_{} s
INNER JOIN groupironman.members m ON m.member_id=s.member_id
WHERE m.group_id=$1 AND NOT m.hidden
"#,
        match period {
            AggregatePeriod::Day => "day",
            AggregatePeriod::Month => "month",
            AggregatePeriod::Year => "year",
        }
    );
    let get_skills_stmt = client.prepare_cached(&s).await?;
    let rows = client
        .query(&get_skills_stmt, &[&group_id])
        .await
        .map_err(ApiError::GetSkillsDataError)?;

    let mut member_data = HashMap::new();
    for row in rows {
        let member_name: String = row.try_get("member_name")?;
        let skill_data = AggregateSkillData {
            time: row.try_get("time")?,
            data: row.try_get("skills")?,
        };

        if !member_data.contains_key(&member_name) {
            member_data.insert(
                member_name.clone(),
                MemberSkillData {
                    name: member_name,
                    skill_data: vec![skill_data],
                },
            );
        } else if let Some(member_skill_data) = member_data.get_mut(&member_name) {
            member_skill_data.skill_data.push(skill_data);
        }
    }

    Ok(member_data.into_values().collect())
}

pub async fn has_migration_run(client: &mut Client, name: &str) -> Result<bool, ApiError> {
    let count: i64 = client
        .query_one(
            "SELECT COUNT(*) FROM groupironman.migrations WHERE name=$1",
            &[&name],
        )
        .await?
        .try_get(0)?;

    Ok(count > 0)
}

pub async fn commit_migration(transaction: &Transaction<'_>, name: &str) -> Result<(), ApiError> {
    transaction
        .execute(
            "INSERT INTO groupironman.migrations (name, date) VALUES($1, NOW())",
            &[&name],
        )
        .await?;

    Ok(())
}

pub async fn ensure_member_exists(
    client: &Client,
    group_id: i64,
    member_name: &str,
) -> Result<(), ApiError> {
    let stmt = client
        .prepare_cached(
            "INSERT INTO groupironman.members (group_id, member_name) VALUES($1, $2) ON CONFLICT (group_id, member_name) DO NOTHING",
        )
        .await?;
    client.execute(&stmt, &[&group_id, &member_name]).await?;
    Ok(())
}

pub async fn list_players(client: &Client, group_id: i64) -> Result<Vec<PlayerInfo>, ApiError> {
    let stmt = client
        .prepare_cached(
            r#"
SELECT member_name,
GREATEST(stats_last_update, coordinates_last_update, skills_last_update,
inventory_last_update, equipment_last_update) as last_updated,
hub_account_id IS NOT NULL as hub_linked, hub_orphaned_at,
(hub_online AND hub_last_seen > now() - interval '5 minutes') AS online,
hub_last_seen, hidden
FROM groupironman.members WHERE group_id=$1
ORDER BY member_name
"#,
        )
        .await?;
    let rows = client.query(&stmt, &[&group_id]).await?;
    let mut result = Vec::with_capacity(rows.len());
    for row in rows {
        result.push(PlayerInfo {
            member_name: row.try_get("member_name")?,
            last_updated: row.try_get("last_updated").ok(),
            hub_linked: row.try_get("hub_linked")?,
            hub_orphaned_at: row.try_get("hub_orphaned_at")?,
            online: row.try_get("online")?,
            last_seen: row.try_get("hub_last_seen")?,
            hidden: row.try_get("hidden")?,
        });
    }
    Ok(result)
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

// ===================== Sessions =====================

/// Starts a session for someone the hub just called a member.
pub async fn create_session(
    client: &Client,
    session_id: &str,
    session: &Session,
    expires_at: &DateTime<Utc>,
) -> Result<(), ApiError> {
    let stmt = client
        .prepare_cached(
            "INSERT INTO groupironman.sessions (session_id, discord_id, name, is_admin, expires_at) \
             VALUES($1, $2, $3, $4, $5)",
        )
        .await?;
    client
        .execute(
            &stmt,
            &[
                &session_id,
                &session.discord_id,
                &session.name,
                &session.is_admin,
                expires_at,
            ],
        )
        .await?;
    Ok(())
}

/// Whose session this is; `Unauthorized` when there is none or it has run out.
pub async fn get_session(client: &Client, session_id: &str) -> Result<Session, ApiError> {
    let stmt = client
        .prepare_cached(
            "SELECT discord_id, name, is_admin FROM groupironman.sessions \
             WHERE session_id=$1 AND expires_at > NOW()",
        )
        .await?;
    let row = client
        .query_opt(&stmt, &[&session_id])
        .await?
        .ok_or(ApiError::Unauthorized)?;
    Ok(Session {
        discord_id: row.try_get(0)?,
        name: row.try_get(1)?,
        is_admin: row.try_get(2)?,
    })
}

pub async fn delete_session(client: &Client, session_id: &str) -> Result<(), ApiError> {
    let stmt = client
        .prepare_cached("DELETE FROM groupironman.sessions WHERE session_id=$1")
        .await?;
    client.execute(&stmt, &[&session_id]).await?;
    Ok(())
}

pub async fn cleanup_expired_sessions(client: &Client) -> Result<(), ApiError> {
    let stmt = client
        .prepare_cached("DELETE FROM groupironman.sessions WHERE expires_at <= NOW()")
        .await?;
    client.execute(&stmt, &[]).await?;
    Ok(())
}

/// The Discord ids with a session the hub was last asked about before
/// `verified_before`, longest ago first, at most `limit` of them.
pub async fn sessions_to_verify(
    client: &Client,
    verified_before: &DateTime<Utc>,
    limit: i64,
) -> Result<Vec<String>, ApiError> {
    let stmt = client
        .prepare_cached(
            "SELECT discord_id FROM groupironman.sessions WHERE expires_at > NOW() \
             GROUP BY discord_id HAVING MIN(verified_at) < $1 \
             ORDER BY MIN(verified_at) LIMIT $2",
        )
        .await?;
    let rows = client.query(&stmt, &[verified_before, &limit]).await?;
    rows.iter().map(|row| Ok(row.try_get(0)?)).collect()
}

/// Notes what the hub says of a member now on every session they have.
pub async fn refresh_sessions(
    client: &Client,
    discord_id: &str,
    name: Option<&str>,
    is_admin: bool,
) -> Result<(), ApiError> {
    let stmt = client
        .prepare_cached(
            "UPDATE groupironman.sessions SET name=COALESCE($2, name), is_admin=$3, \
             verified_at=NOW() WHERE discord_id=$1",
        )
        .await?;
    client
        .execute(&stmt, &[&discord_id, &name, &is_admin])
        .await?;
    Ok(())
}

/// Ends every session of someone who is no longer a member. Returns how many.
pub async fn delete_sessions_of(client: &Client, discord_id: &str) -> Result<u64, ApiError> {
    let stmt = client
        .prepare_cached("DELETE FROM groupironman.sessions WHERE discord_id=$1")
        .await?;
    Ok(client.execute(&stmt, &[&discord_id]).await?)
}

// Singleton group: get or create the single group for this instance
pub async fn get_or_create_singleton_group(client: &mut Client) -> Result<i64, ApiError> {
    // Try to find the first group
    let stmt = client
        .prepare_cached("SELECT group_id FROM groupironman.groups ORDER BY group_id LIMIT 1")
        .await?;
    let row = client.query_opt(&stmt, &[]).await?;
    if let Some(row) = row {
        return Ok(row.try_get(0)?);
    }
    // Create a singleton group
    let create_stmt = client
        .prepare_cached(
            "INSERT INTO groupironman.groups (group_name, group_token_hash) VALUES($1, $2) RETURNING group_id",
        )
        .await?;
    // Left over from group tokens; nothing authenticates against it.
    let placeholder_hash = "0".repeat(64);
    let row = client
        .query_one(&create_stmt, &[&"clan", &placeholder_hash])
        .await?;
    Ok(row.try_get(0)?)
}

// ===================== Hub Sync Functions =====================

/// A member row as seen by the hub sync.
pub struct HubMemberRow {
    pub member_name: String,
    pub hub_account_id: Option<String>,
    /// Hidden by an admin; the sync leaves it alone.
    pub hidden: bool,
}

fn hub_member_row(row: &tokio_postgres::Row) -> Result<HubMemberRow, ApiError> {
    Ok(HubMemberRow {
        member_name: row.try_get("member_name")?,
        hub_account_id: row.try_get("hub_account_id")?,
        hidden: row.try_get("hidden")?,
    })
}

pub async fn get_member_by_hub_id(
    client: &Client,
    group_id: i64,
    hub_account_id: &str,
) -> Result<Option<HubMemberRow>, ApiError> {
    let stmt = client
        .prepare_cached(
            "SELECT member_name::text, hub_account_id, hidden FROM groupironman.members \
             WHERE group_id=$1 AND hub_account_id=$2",
        )
        .await?;
    let row = client
        .query_opt(&stmt, &[&group_id, &hub_account_id])
        .await?;
    row.as_ref().map(hub_member_row).transpose()
}

/// Finds an existing member for a hub account that is not bound yet: first by
/// the plugin's account hash (stable across renames), then by name.
pub async fn find_member_for_hub_account(
    client: &Client,
    group_id: i64,
    account_hash: Option<&str>,
    name: &str,
) -> Result<Option<HubMemberRow>, ApiError> {
    if let Some(account_hash) = account_hash {
        let stmt = client
            .prepare_cached(
                "SELECT member_name::text, hub_account_id, hidden FROM groupironman.members \
                 WHERE group_id=$1 AND account_hash=$2 ORDER BY member_id LIMIT 1",
            )
            .await?;
        if let Some(row) = client.query_opt(&stmt, &[&group_id, &account_hash]).await? {
            return Ok(Some(hub_member_row(&row)?));
        }
    }
    let stmt = client
        .prepare_cached(
            "SELECT member_name::text, hub_account_id, hidden FROM groupironman.members \
             WHERE group_id=$1 AND member_name=$2",
        )
        .await?;
    let row = client.query_opt(&stmt, &[&group_id, &name]).await?;
    row.as_ref().map(hub_member_row).transpose()
}

/// Binds a hub account id to a member, taking it away from any other member first.
pub async fn bind_hub_account(
    client: &mut Client,
    group_id: i64,
    member_name: &str,
    hub_account_id: &str,
    account_hash: Option<&str>,
) -> Result<(), ApiError> {
    let transaction = client.transaction().await?;
    transaction
        .execute(
            "UPDATE groupironman.members SET hub_account_id=NULL \
             WHERE hub_account_id=$1 AND NOT (group_id=$2 AND member_name=$3)",
            &[&hub_account_id, &group_id, &member_name],
        )
        .await?;
    transaction
        .execute(
            "UPDATE groupironman.members SET hub_account_id=$3, \
             account_hash=COALESCE($4, account_hash), hub_orphaned_at=NULL \
             WHERE group_id=$1 AND member_name=$2",
            &[&group_id, &member_name, &hub_account_id, &account_hash],
        )
        .await?;
    transaction.commit().await?;
    Ok(())
}

/// Records whether the hub reports the member online, and when it was last seen.
pub async fn set_hub_presence(
    client: &Client,
    group_id: i64,
    member_name: &str,
    online: bool,
    last_seen: Option<DateTime<Utc>>,
) -> Result<(), ApiError> {
    let stmt = client
        .prepare_cached(
            "UPDATE groupironman.members SET hub_online=$3, \
             hub_last_seen=COALESCE($4, hub_last_seen, NOW()) \
             WHERE group_id=$1 AND member_name=$2",
        )
        .await?;
    client
        .execute(&stmt, &[&group_id, &member_name, &online, &last_seen])
        .await?;
    Ok(())
}

/// Hides a member from the map (and from the sync), or shows it again.
/// Returns whether the member exists.
pub async fn set_member_hidden(
    client: &Client,
    group_id: i64,
    member_name: &str,
    hidden: bool,
) -> Result<bool, ApiError> {
    let stmt = client
        .prepare_cached(
            "UPDATE groupironman.members SET hidden=$3 WHERE group_id=$1 AND member_name=$2",
        )
        .await?;
    Ok(client
        .execute(&stmt, &[&group_id, &member_name, &hidden])
        .await?
        > 0)
}

/// Renames a member that is bound to a hub account.
pub async fn rename_hub_member(
    client: &Client,
    group_id: i64,
    original_name: &str,
    new_name: &str,
) -> Result<(), ApiError> {
    client
        .execute(
            "UPDATE groupironman.members SET member_name=$3 WHERE group_id=$1 AND member_name=$2",
            &[&group_id, &original_name, &new_name],
        )
        .await?;
    Ok(())
}

/// Marks bound members whose hub account is no longer visible, and clears the
/// mark for those that are. Returns the number of orphaned members.
pub async fn mark_hub_orphans(
    client: &Client,
    group_id: i64,
    visible_ids: &[String],
) -> Result<i64, ApiError> {
    client
        .execute(
            "UPDATE groupironman.members SET hub_orphaned_at=NULL \
             WHERE group_id=$1 AND hub_account_id = ANY($2)",
            &[&group_id, &visible_ids],
        )
        .await?;
    client
        .execute(
            "UPDATE groupironman.members SET hub_orphaned_at=NOW(), hub_online=FALSE \
             WHERE group_id=$1 AND hub_account_id IS NOT NULL \
             AND NOT (hub_account_id = ANY($2)) AND hub_orphaned_at IS NULL",
            &[&group_id, &visible_ids],
        )
        .await?;
    let count: i64 = client
        .query_one(
            "SELECT COUNT(*) FROM groupironman.members \
             WHERE group_id=$1 AND hub_orphaned_at IS NOT NULL",
            &[&group_id],
        )
        .await?
        .try_get(0)?;
    Ok(count)
}

/// Member name, hub account id and hidden flag of every member bound to the hub.
pub async fn get_hub_bindings(
    client: &Client,
    group_id: i64,
) -> Result<Vec<(String, String, bool)>, ApiError> {
    let stmt = client
        .prepare_cached(
            "SELECT member_name::text, hub_account_id, hidden FROM groupironman.members \
             WHERE group_id=$1 AND hub_account_id IS NOT NULL",
        )
        .await?;
    let rows = client.query(&stmt, &[&group_id]).await?;
    rows.iter()
        .map(|row| Ok((row.try_get(0)?, row.try_get(1)?, row.try_get(2)?)))
        .collect()
}
