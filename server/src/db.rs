use crate::crypto::token_hash;
use crate::error::ApiError;
use crate::models::{
    AggregateSkillData, AuditLogEntry, CreateGroup, GroupMember, GroupSkillData, MemberSkillData,
    PlayerInfo, SessionUser, UserInfo,
};
use chrono::{DateTime, Utc};
use deadpool_postgres::{Client, Transaction};
use serde::{de::DeserializeOwned, Serialize};
use std::collections::{HashMap, HashSet};
use tokio_postgres::{error::SqlState, Row};

const CURRENT_GROUP_VERSION: i32 = 2;
pub async fn create_group(client: &mut Client, create_group: &CreateGroup) -> Result<(), ApiError> {
    let create_group_stmt = client.prepare_cached("INSERT INTO groupironman.groups (group_name, group_token_hash, version) VALUES($1, $2, $3) RETURNING group_id").await?;
    let create_member_stmt = client
        .prepare_cached("INSERT INTO groupironman.members (group_id, member_name) VALUES($1, $2)")
        .await?;
    let transaction = client.transaction().await?;

    let hashed_token = token_hash(&create_group.token, &create_group.name);
    let group_id: i64 = transaction
        .query_one(
            &create_group_stmt,
            &[&create_group.name, &hashed_token, &CURRENT_GROUP_VERSION],
        )
        .await?
        .try_get(0)
        .map_err(ApiError::GroupCreationError)?;

    for member_name in &create_group.member_names {
        transaction
            .execute(&create_member_stmt, &[&group_id, &member_name])
            .await
            .map_err(ApiError::GroupCreationError)?;
    }

    transaction
        .commit()
        .await
        .map_err(ApiError::GroupCreationError)
}

pub async fn add_group_member(
    client: &Client,
    group_id: i64,
    member_name: &str,
) -> Result<(), ApiError> {
    let create_member_stmt = client
        .prepare_cached("INSERT INTO groupironman.members (group_id, member_name) VALUES($1, $2)")
        .await?;
    client
        .execute(&create_member_stmt, &[&group_id, &member_name])
        .await
        .map_err(ApiError::AddMemberError)?;
    Ok(())
}

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

pub async fn delete_collection_log_data_for_member(
    transaction: &Transaction<'_>,
    member_id: i64,
) -> Result<(), ApiError> {
    let delete_queries = [
        "DELETE FROM groupironman.collection_log WHERE member_id=$1",
        "DELETE FROM groupironman.collection_log_new WHERE member_id=$1",
    ];

    for (idx, query) in delete_queries.iter().enumerate() {
        let savepoint = format!("sp_collection_log_{}", idx);
        transaction
            .execute(&format!("SAVEPOINT {}", savepoint), &[])
            .await?;

        match transaction.execute(*query, &[&member_id]).await {
            Ok(_) => {
                transaction
                    .execute(&format!("RELEASE SAVEPOINT {}", savepoint), &[])
                    .await?;
            }
            Err(err) if err.code() == Some(&SqlState::UNDEFINED_TABLE) => {
                log::debug!(
                    "Skipping collection-log cleanup for missing table: {}",
                    query
                );
                transaction
                    .execute(&format!("ROLLBACK TO SAVEPOINT {}", savepoint), &[])
                    .await?;
            }
            Err(err) => {
                transaction
                    .execute(&format!("ROLLBACK TO SAVEPOINT {}", savepoint), &[])
                    .await?;
                return Err(err.into());
            }
        }
    }

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
    delete_collection_log_data_for_member(&transaction, member_id).await?;

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

pub async fn rename_group_member(
    client: &Client,
    group_id: i64,
    original_name: &str,
    new_name: &str,
) -> Result<(), ApiError> {
    let stmt = client
        .prepare_cached(
            "UPDATE groupironman.members SET member_name=$1 WHERE group_id=$2 AND member_name=$3",
        )
        .await?;
    client
        .execute(&stmt, &[&new_name, &group_id, &original_name])
        .await
        .map_err(ApiError::RenameGroupMemberError)?;
    Ok(())
}

pub async fn is_member_in_group(
    client: &Client,
    group_id: i64,
    member_name: &str,
) -> Result<bool, ApiError> {
    let stmt = client.prepare_cached("SELECT COUNT(member_name) FROM groupironman.members WHERE group_id=$1 AND member_name=$2").await?;
    let member_count: i64 = client
        .query_one(&stmt, &[&group_id, &member_name])
        .await?
        .try_get(0)
        .map_err(ApiError::IsMemberInGroupError)?;
    Ok(member_count > 0)
}

pub fn serialize_serde<T>(value: &Option<T>) -> Result<Option<String>, ApiError>
where
    T: Serialize,
{
    match value {
        Some(v) => {
            let result = serde_json::to_string(&v)?;
            Ok(Some(result))
        }
        None => Ok(None),
    }
}

pub async fn get_group(client: &Client, group_name: &str, token: &str) -> Result<i64, ApiError> {
    let stmt = client
        .prepare_cached(
            "SELECT group_id FROM groupironman.groups WHERE group_token_hash=$1 AND group_name=$2",
        )
        .await?;
    let hashed_token = token_hash(token, group_name);
    let group: Row = client
        .query_one(&stmt, &[&hashed_token, &group_name])
        .await
        .map_err(ApiError::GetGroupError)?;
    Ok(group.try_get(0)?)
}

fn try_deserialize_json_column<T>(row: &Row, column: &str) -> Result<Option<T>, ApiError>
where
    T: DeserializeOwned,
{
    match row.try_get(column) {
        Ok(column_data) => Ok(serde_json::from_str(column_data).ok()),
        Err(_) => Ok(None),
    }
}

pub async fn get_group_data(
    client: &Client,
    group_id: i64,
    timestamp: &DateTime<Utc>,
) -> Result<Vec<GroupMember>, ApiError> {
    let stmt = client
        .prepare_cached(
            r#"
SELECT member_name,
GREATEST(stats_last_update, coordinates_last_update, skills_last_update,
quests_last_update, inventory_last_update, equipment_last_update, bank_last_update,
rune_pouch_last_update, interacting_last_update, seed_vault_last_update, diary_vars_last_update,
collection_log_last_update, potion_storage_last_update) as last_updated,
CASE WHEN stats_last_update >= $1::TIMESTAMPTZ THEN stats ELSE NULL END as stats,
CASE WHEN coordinates_last_update >= $1::TIMESTAMPTZ THEN coordinates ELSE NULL END as coordinates,
CASE WHEN skills_last_update >= $1::TIMESTAMPTZ THEN skills ELSE NULL END as skills,
CASE WHEN quests_last_update >= $1::TIMESTAMPTZ THEN quests ELSE NULL END as quests,
CASE WHEN inventory_last_update >= $1::TIMESTAMPTZ THEN inventory ELSE NULL END as inventory,
CASE WHEN equipment_last_update >= $1::TIMESTAMPTZ THEN equipment ELSE NULL END as equipment,
CASE WHEN bank_last_update >= $1::TIMESTAMPTZ THEN bank ELSE NULL END as bank,
CASE WHEN rune_pouch_last_update >= $1::TIMESTAMPTZ THEN rune_pouch ELSE NULL END as rune_pouch,
CASE WHEN interacting_last_update >= $1::TIMESTAMPTZ THEN interacting ELSE NULL END as interacting,
CASE WHEN seed_vault_last_update >= $1::TIMESTAMPTZ THEN seed_vault ELSE NULL END as seed_vault,
CASE WHEN diary_vars_last_update >= $1::TIMESTAMPTZ THEN diary_vars ELSE NULL END as diary_vars,
CASE WHEN collection_log_last_update >= $1::TIMESTAMPTZ THEN collection_log ELSE NULL END as collection_log,
CASE WHEN potion_storage_last_update >= $1::TIMESTAMPTZ THEN potion_storage ELSE NULL END as potion_storage
FROM groupironman.members WHERE group_id=$2
"#,
        )
        .await?;

    let rows = client
        .query(&stmt, &[&timestamp, &group_id])
        .await
        .map_err(ApiError::GetGroupDataError)?;
    let mut result = Vec::with_capacity(rows.len());
    for row in rows {
        let member_name = row.try_get("member_name")?;
        let last_updated: Option<DateTime<Utc>> = row.try_get("last_updated").ok();
        let group_member = GroupMember {
            group_id: Some(group_id),
            name: member_name,
            last_updated,
            stats: row.try_get("stats").ok(),
            coordinates: row.try_get("coordinates").ok(),
            skills: row.try_get("skills").ok(),
            quests: row.try_get("quests")?,
            inventory: row.try_get("inventory").ok(),
            equipment: row.try_get("equipment").ok(),
            bank: row.try_get("bank").ok(),
            rune_pouch: row.try_get("rune_pouch").ok(),
            seed_vault: row.try_get("seed_vault").ok(),
            interacting: try_deserialize_json_column(&row, "interacting")?,
            diary_vars: row.try_get("diary_vars").ok(),
            deposited: Option::None,
            collection_log_v2: row.try_get("collection_log").ok(),
            potion_storage: row.try_get("potion_storage").ok(),
            source_time: None,
        };
        result.push(group_member);
    }

    Ok(result)
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
WHERE m.group_id=$1
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

pub async fn store_pairing_code(
    client: &Client,
    code: &str,
    group_id: i64,
    expires_at: &DateTime<Utc>,
) -> Result<(), ApiError> {
    let stmt = client
        .prepare_cached(
            "INSERT INTO groupironman.pairing_codes (code, group_id, expires_at) VALUES($1, $2, $3)",
        )
        .await?;
    client
        .execute(&stmt, &[&code, &group_id, &expires_at])
        .await?;
    Ok(())
}

pub async fn consume_pairing_code(client: &Client, code: &str) -> Result<i64, ApiError> {
    let stmt = client
        .prepare_cached(
            "DELETE FROM groupironman.pairing_codes WHERE code=$1 AND expires_at > NOW() RETURNING group_id",
        )
        .await?;
    let row = client
        .query_one(&stmt, &[&code])
        .await
        .map_err(ApiError::PairingCodeError)?;
    Ok(row.try_get(0)?)
}

pub async fn store_device(
    client: &Client,
    device_id: &str,
    group_id: i64,
    token_hash: &str,
) -> Result<(), ApiError> {
    let stmt = client
        .prepare_cached(
            "INSERT INTO groupironman.devices (device_id, group_id, token_hash) VALUES($1, $2, $3)",
        )
        .await?;
    client
        .execute(&stmt, &[&device_id, &group_id, &token_hash])
        .await?;
    Ok(())
}

pub async fn get_device_group(client: &Client, token_hash: &str) -> Result<i64, ApiError> {
    let stmt = client
        .prepare_cached(
            "SELECT d.group_id FROM groupironman.devices d \
             JOIN groupironman.users u ON d.user_id = u.user_id \
             WHERE d.token_hash=$1 AND u.enabled = TRUE",
        )
        .await?;
    let row = client
        .query_one(&stmt, &[&token_hash])
        .await
        .map_err(ApiError::DeviceAuthError)?;
    Ok(row.try_get(0)?)
}

pub async fn cleanup_expired_pairing_codes(client: &Client) -> Result<(), ApiError> {
    let stmt = client
        .prepare_cached("DELETE FROM groupironman.pairing_codes WHERE expires_at <= NOW()")
        .await?;
    client.execute(&stmt, &[]).await?;
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
SELECT member_id, member_name,
GREATEST(stats_last_update, coordinates_last_update, skills_last_update,
quests_last_update, inventory_last_update, equipment_last_update, bank_last_update,
rune_pouch_last_update, interacting_last_update, seed_vault_last_update, diary_vars_last_update,
collection_log_last_update) as last_updated
FROM groupironman.members WHERE group_id=$1
ORDER BY member_name
"#,
        )
        .await?;
    let rows = client.query(&stmt, &[&group_id]).await?;
    let mut result = Vec::with_capacity(rows.len());
    for row in rows {
        result.push(PlayerInfo {
            member_id: row.try_get("member_id")?,
            member_name: row.try_get("member_name")?,
            last_updated: row.try_get("last_updated").ok(),
        });
    }
    Ok(result)
}

/// Member data columns that carry a `<column>_last_update` timestamp.
pub const TIMESTAMPED_MEMBER_COLUMNS: [&str; 13] = [
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
    -- Keep a timestamp the statement set itself (e.g. the source time of
    -- imported data); only stamp now() when it was left unchanged.
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

    if !has_migration_run(client, "migrate_collection_log_v2").await?
        && has_migration_run(client, "add_collection_log").await?
    {
        println!("beginning migration migrate_collection_log_v2");
        let transaction = client.transaction().await?;

        // collect the data to migrate
        let rows = transaction
            .query("SELECT member_id, items FROM groupironman.collection_log WHERE cardinality(items) > 0", &[])
            .await
            .unwrap();
        let mut member_data: HashMap<i64, Vec<i32>> = HashMap::new();
        for row in rows {
            let member_id: i64 = row.try_get("member_id")?;
            let items: Vec<i32> = row.try_get("items")?;

            match member_data.get_mut(&member_id) {
                Some(collection_log) => {
                    collection_log.extend(items.iter());
                }
                None => {
                    member_data.insert(member_id, items);
                }
            };
        }
        println!("need to migrate {} members", member_data.len());

        // breakup into chunks
        let chunk_size = 100;
        let member_data_list: Vec<(i64, Vec<i32>)> = member_data.into_iter().collect();
        let mut chunks = Vec::new();
        for chunk_slice in member_data_list.chunks(chunk_size) {
            let chunk_map: HashMap<i64, Vec<i32>> = chunk_slice.iter().cloned().collect();
            chunks.push(chunk_map);
        }
        println!("split into {} chunks of size {}", chunks.len(), chunk_size);

        // update new collection log column
        for (i, chunk) in chunks.iter().enumerate() {
            println!(
                "migrating chunk {}/{} size {}",
                i + 1,
                chunks.len(),
                chunk.len()
            );
            let mut values_clause = String::new();
            for i in 0..chunk.len() {
                values_clause.push_str(&format!(
                    "(${}::BIGINT, ${}::INTEGER[])",
                    i * 2 + 1,
                    i * 2 + 2
                ));
                if i < chunk.len() - 1 {
                    values_clause.push_str(", ");
                }
            }
            let mut params: Vec<&(dyn tokio_postgres::types::ToSql + Sync)> = Vec::new();
            for (member_id, items) in chunk.iter() {
                params.push(member_id);
                params.push(items);
            }

            // timestamp is set to value that will return on the initial frontend request, but does not show the player as online
            let update_query = format!(
                r#"
UPDATE groupironman.members as a SET collection_log=b.collection_log, collection_log_last_update='epoch'::timestamptz + INTERVAL '5 days'
FROM (VALUES {}) AS b(member_id, collection_log)
WHERE a.member_id=b.member_id
"#,
                values_clause
            );

            transaction.execute(&update_query, &params).await?;
        }

        commit_migration(&transaction, "migrate_collection_log_v2").await?;
        transaction.commit().await?;
        println!("finished migration migrate_collection_log_v2");
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

    Ok(())
}

// ===================== User Management Functions =====================

pub async fn user_count(client: &Client) -> Result<i64, ApiError> {
    let stmt = client
        .prepare_cached("SELECT COUNT(*) FROM groupironman.users")
        .await?;
    let row = client.query_one(&stmt, &[]).await?;
    Ok(row.try_get(0)?)
}

pub async fn create_user(
    client: &Client,
    username: &str,
    password_hash: &str,
    role: &str,
) -> Result<i64, ApiError> {
    let stmt = client
        .prepare_cached(
            "INSERT INTO groupironman.users (username, password_hash, role) VALUES($1, $2, $3) RETURNING user_id",
        )
        .await?;
    let row = client
        .query_one(&stmt, &[&username, &password_hash, &role])
        .await
        .map_err(|_| ApiError::BadRequest("Username already exists".to_string()))?;
    Ok(row.try_get(0)?)
}

pub async fn get_user_by_username(
    client: &Client,
    username: &str,
) -> Result<(i64, String, String, bool), ApiError> {
    let stmt = client
        .prepare_cached(
            "SELECT user_id, password_hash, role, enabled FROM groupironman.users WHERE username=$1",
        )
        .await?;
    let row = client
        .query_one(&stmt, &[&username])
        .await
        .map_err(|_| ApiError::Unauthorized)?;
    Ok((
        row.try_get(0)?,
        row.try_get(1)?,
        row.try_get(2)?,
        row.try_get(3)?,
    ))
}

pub async fn get_user_by_id(client: &Client, user_id: i64) -> Result<UserInfo, ApiError> {
    let stmt = client
        .prepare_cached(
            "SELECT user_id, username, role, enabled, created_at, last_seen FROM groupironman.users WHERE user_id=$1",
        )
        .await?;
    let row = client
        .query_one(&stmt, &[&user_id])
        .await
        .map_err(|_| ApiError::BadRequest("User not found".to_string()))?;
    Ok(UserInfo {
        user_id: row.try_get(0)?,
        username: row.try_get(1)?,
        role: row.try_get(2)?,
        enabled: row.try_get(3)?,
        created_at: row.try_get(4)?,
        last_seen: row.try_get(5).ok(),
    })
}

pub async fn list_users(client: &Client) -> Result<Vec<UserInfo>, ApiError> {
    let stmt = client
        .prepare_cached(
            "SELECT user_id, username, role, enabled, created_at, last_seen FROM groupironman.users ORDER BY user_id",
        )
        .await?;
    let rows = client.query(&stmt, &[]).await?;
    let mut users = Vec::with_capacity(rows.len());
    for row in rows {
        users.push(UserInfo {
            user_id: row.try_get(0)?,
            username: row.try_get(1)?,
            role: row.try_get(2)?,
            enabled: row.try_get(3)?,
            created_at: row.try_get(4)?,
            last_seen: row.try_get(5).ok(),
        });
    }
    Ok(users)
}

pub async fn update_user_role(client: &Client, user_id: i64, role: &str) -> Result<(), ApiError> {
    let stmt = client
        .prepare_cached("UPDATE groupironman.users SET role=$1 WHERE user_id=$2")
        .await?;
    client.execute(&stmt, &[&role, &user_id]).await?;
    Ok(())
}

pub async fn update_user_enabled(
    client: &Client,
    user_id: i64,
    enabled: bool,
) -> Result<(), ApiError> {
    let stmt = client
        .prepare_cached("UPDATE groupironman.users SET enabled=$1 WHERE user_id=$2")
        .await?;
    client.execute(&stmt, &[&enabled, &user_id]).await?;
    Ok(())
}

pub async fn update_user_password(
    client: &Client,
    user_id: i64,
    password_hash: &str,
) -> Result<(), ApiError> {
    let stmt = client
        .prepare_cached("UPDATE groupironman.users SET password_hash=$1 WHERE user_id=$2")
        .await?;
    client.execute(&stmt, &[&password_hash, &user_id]).await?;
    Ok(())
}

pub async fn update_user_last_seen(client: &Client, user_id: i64) -> Result<(), ApiError> {
    let stmt = client
        .prepare_cached("UPDATE groupironman.users SET last_seen=NOW() WHERE user_id=$1")
        .await?;
    client.execute(&stmt, &[&user_id]).await?;
    Ok(())
}

pub async fn delete_user(client: &Client, user_id: i64) -> Result<(), ApiError> {
    let stmt = client
        .prepare_cached("DELETE FROM groupironman.users WHERE user_id=$1")
        .await?;
    client.execute(&stmt, &[&user_id]).await?;
    Ok(())
}

// Session management

pub async fn create_session(
    client: &Client,
    session_id: &str,
    user_id: i64,
    expires_at: &DateTime<Utc>,
) -> Result<(), ApiError> {
    let stmt = client
        .prepare_cached(
            "INSERT INTO groupironman.sessions (session_id, user_id, expires_at) VALUES($1, $2, $3)",
        )
        .await?;
    client
        .execute(&stmt, &[&session_id, &user_id, &expires_at])
        .await?;
    Ok(())
}

pub async fn get_session_user(client: &Client, session_id: &str) -> Result<SessionUser, ApiError> {
    let stmt = client
        .prepare_cached(
            r#"
SELECT u.user_id, u.username, u.role, u.enabled
FROM groupironman.sessions s
JOIN groupironman.users u ON s.user_id = u.user_id
WHERE s.session_id=$1 AND s.expires_at > NOW() AND u.enabled = TRUE
"#,
        )
        .await?;
    let row = client
        .query_one(&stmt, &[&session_id])
        .await
        .map_err(|_| ApiError::Unauthorized)?;
    Ok(SessionUser {
        user_id: row.try_get(0)?,
        username: row.try_get(1)?,
        role: row.try_get(2)?,
        enabled: row.try_get(3)?,
    })
}

pub async fn delete_session(client: &Client, session_id: &str) -> Result<(), ApiError> {
    let stmt = client
        .prepare_cached("DELETE FROM groupironman.sessions WHERE session_id=$1")
        .await?;
    client.execute(&stmt, &[&session_id]).await?;
    Ok(())
}

pub async fn delete_user_sessions(client: &Client, user_id: i64) -> Result<(), ApiError> {
    let stmt = client
        .prepare_cached("DELETE FROM groupironman.sessions WHERE user_id=$1")
        .await?;
    client.execute(&stmt, &[&user_id]).await?;
    Ok(())
}

pub async fn cleanup_expired_sessions(client: &Client) -> Result<(), ApiError> {
    let stmt = client
        .prepare_cached("DELETE FROM groupironman.sessions WHERE expires_at <= NOW()")
        .await?;
    client.execute(&stmt, &[]).await?;
    Ok(())
}

// Audit log

pub async fn write_audit_log(
    client: &Client,
    user_id: Option<i64>,
    action: &str,
    target_user_id: Option<i64>,
    details: Option<&str>,
) -> Result<(), ApiError> {
    let stmt = client
        .prepare_cached(
            "INSERT INTO groupironman.audit_log (user_id, action, target_user_id, details) VALUES($1, $2, $3, $4)",
        )
        .await?;
    let user_id_ref: Option<&i64> = user_id.as_ref();
    let target_ref: Option<&i64> = target_user_id.as_ref();
    client
        .execute(&stmt, &[&user_id_ref, &action, &target_ref, &details])
        .await?;
    Ok(())
}

pub async fn get_audit_log(client: &Client, limit: i64) -> Result<Vec<AuditLogEntry>, ApiError> {
    let stmt = client
        .prepare_cached(
            "SELECT log_id, user_id, action, target_user_id, details, created_at FROM groupironman.audit_log ORDER BY created_at DESC LIMIT $1",
        )
        .await?;
    let rows = client.query(&stmt, &[&limit]).await?;
    let mut entries = Vec::with_capacity(rows.len());
    for row in rows {
        entries.push(AuditLogEntry {
            log_id: row.try_get(0)?,
            user_id: row.try_get(1).ok(),
            action: row.try_get(2)?,
            target_user_id: row.try_get(3).ok(),
            details: row.try_get(4).ok(),
            created_at: row.try_get(5)?,
        });
    }
    Ok(entries)
}

// Per-user pairing code management

pub async fn store_pairing_code_for_user(
    client: &Client,
    code: &str,
    group_id: i64,
    user_id: i64,
    expires_at: &DateTime<Utc>,
) -> Result<(), ApiError> {
    let stmt = client
        .prepare_cached(
            "INSERT INTO groupironman.pairing_codes (code, group_id, user_id, expires_at) VALUES($1, $2, $3, $4)",
        )
        .await?;
    client
        .execute(&stmt, &[&code, &group_id, &user_id, &expires_at])
        .await?;
    Ok(())
}

pub async fn consume_pairing_code_with_user(
    client: &Client,
    code: &str,
) -> Result<(i64, Option<i64>), ApiError> {
    let stmt = client
        .prepare_cached(
            "DELETE FROM groupironman.pairing_codes WHERE code=$1 AND expires_at > NOW() RETURNING group_id, user_id",
        )
        .await?;
    let row = client
        .query_one(&stmt, &[&code])
        .await
        .map_err(ApiError::PairingCodeError)?;
    let group_id: i64 = row.try_get(0)?;
    let user_id: Option<i64> = row.try_get(1).ok();
    Ok((group_id, user_id))
}

pub async fn store_device_for_user(
    client: &Client,
    device_id: &str,
    group_id: i64,
    user_id: Option<i64>,
    token_hash: &str,
) -> Result<(), ApiError> {
    let stmt = client
        .prepare_cached(
            "INSERT INTO groupironman.devices (device_id, group_id, user_id, token_hash) VALUES($1, $2, $3, $4)",
        )
        .await?;
    let user_id_ref: Option<&i64> = user_id.as_ref();
    client
        .execute(&stmt, &[&device_id, &group_id, &user_id_ref, &token_hash])
        .await?;
    Ok(())
}

pub async fn revoke_user_devices(client: &Client, user_id: i64) -> Result<u64, ApiError> {
    let stmt = client
        .prepare_cached("DELETE FROM groupironman.devices WHERE user_id=$1")
        .await?;
    let count = client.execute(&stmt, &[&user_id]).await?;
    Ok(count)
}

pub async fn revoke_user_pairing_codes(client: &Client, user_id: i64) -> Result<u64, ApiError> {
    let stmt = client
        .prepare_cached("DELETE FROM groupironman.pairing_codes WHERE user_id=$1")
        .await?;
    let count = client.execute(&stmt, &[&user_id]).await?;
    Ok(count)
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
    let placeholder_hash = token_hash("singleton", "singleton");
    let row = client
        .query_one(&create_stmt, &[&"clan", &placeholder_hash])
        .await?;
    Ok(row.try_get(0)?)
}

// User-player link tracking

pub async fn get_device_user_id(
    client: &Client,
    token_hash: &str,
) -> Result<Option<i64>, ApiError> {
    let stmt = client
        .prepare_cached("SELECT user_id FROM groupironman.devices WHERE token_hash=$1")
        .await?;
    let row = client
        .query_one(&stmt, &[&token_hash])
        .await
        .map_err(ApiError::DeviceAuthError)?;
    Ok(row.try_get::<_, Option<i64>>(0)?)
}

pub async fn upsert_user_player_link(
    client: &Client,
    user_id: i64,
    member_name: &str,
    group_id: i64,
) -> Result<(), ApiError> {
    let stmt = client
        .prepare_cached(
            r#"
INSERT INTO groupironman.user_player_links (user_id, member_name, group_id, last_updated)
VALUES($1, $2, $3, NOW())
ON CONFLICT (user_id, member_name, group_id) DO UPDATE SET last_updated = NOW()
"#,
        )
        .await?;
    client
        .execute(&stmt, &[&user_id, &member_name, &group_id])
        .await?;
    Ok(())
}

pub async fn get_players_for_user(
    client: &Client,
    user_id: i64,
    group_id: i64,
) -> Result<Vec<String>, ApiError> {
    let stmt = client
        .prepare_cached(
            "SELECT member_name FROM groupironman.user_player_links WHERE user_id=$1 AND group_id=$2 ORDER BY member_name",
        )
        .await?;
    let rows = client.query(&stmt, &[&user_id, &group_id]).await?;
    let mut result = Vec::with_capacity(rows.len());
    for row in rows {
        result.push(row.try_get(0)?);
    }
    Ok(result)
}

pub async fn get_users_for_player(
    client: &Client,
    member_name: &str,
    group_id: i64,
) -> Result<Vec<String>, ApiError> {
    let stmt = client
        .prepare_cached(
            r#"
SELECT u.username FROM groupironman.user_player_links l
JOIN groupironman.users u ON l.user_id = u.user_id
WHERE l.member_name=$1 AND l.group_id=$2
ORDER BY u.username
"#,
        )
        .await?;
    let rows = client.query(&stmt, &[&member_name, &group_id]).await?;
    let mut result = Vec::with_capacity(rows.len());
    for row in rows {
        result.push(row.try_get(0)?);
    }
    Ok(result)
}

// ===================== Discord User Functions =====================

pub async fn get_user_by_discord_id(
    client: &Client,
    discord_id: &str,
) -> Result<Option<(i64, String, String, bool)>, ApiError> {
    let stmt = client
        .prepare_cached(
            r#"
SELECT u.user_id, u.username, u.role, u.enabled
FROM groupironman.discord_users d
JOIN groupironman.users u ON d.user_id = u.user_id
WHERE d.discord_id=$1
"#,
        )
        .await?;
    let row = client.query_opt(&stmt, &[&discord_id]).await?;
    match row {
        Some(r) => Ok(Some((
            r.try_get(0)?,
            r.try_get(1)?,
            r.try_get(2)?,
            r.try_get(3)?,
        ))),
        None => Ok(None),
    }
}

pub async fn create_discord_user_link(
    client: &Client,
    discord_id: &str,
    user_id: i64,
    discord_username: &str,
) -> Result<(), ApiError> {
    let stmt = client
        .prepare_cached(
            "INSERT INTO groupironman.discord_users (discord_id, user_id, discord_username) VALUES($1, $2, $3) ON CONFLICT (discord_id) DO UPDATE SET discord_username=$3",
        )
        .await?;
    client
        .execute(&stmt, &[&discord_id, &user_id, &discord_username])
        .await?;
    Ok(())
}

pub async fn create_user_no_password(
    client: &Client,
    username: &str,
    role: &str,
) -> Result<i64, ApiError> {
    let stmt = client
        .prepare_cached(
            "INSERT INTO groupironman.users (username, password_hash, role) VALUES($1, '', $2) RETURNING user_id",
        )
        .await?;
    let row = client
        .query_one(&stmt, &[&username, &role])
        .await
        .map_err(|_| ApiError::BadRequest("Username already exists".to_string()))?;
    Ok(row.try_get(0)?)
}

// ===================== Hub Sync Functions =====================

/// A member row as seen by the hub sync.
pub struct HubMemberRow {
    pub member_name: String,
    pub hub_account_id: Option<String>,
    pub hub_last_seen: Option<DateTime<Utc>>,
    /// Whether the member already has player data from any source.
    pub has_data: bool,
}

fn hub_member_row(row: &tokio_postgres::Row) -> Result<HubMemberRow, ApiError> {
    Ok(HubMemberRow {
        member_name: row.try_get("member_name")?,
        hub_account_id: row.try_get("hub_account_id")?,
        hub_last_seen: row.try_get("hub_last_seen")?,
        has_data: row.try_get("has_data")?,
    })
}

pub async fn get_member_by_hub_id(
    client: &Client,
    group_id: i64,
    hub_account_id: &str,
) -> Result<Option<HubMemberRow>, ApiError> {
    let stmt = client
        .prepare_cached(
            "SELECT member_name::text, hub_account_id, hub_last_seen, (GREATEST(stats_last_update, \
             coordinates_last_update, skills_last_update) IS NOT NULL) AS has_data \
             FROM groupironman.members \
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
                "SELECT member_name::text, hub_account_id, hub_last_seen, (GREATEST(stats_last_update, \
             coordinates_last_update, skills_last_update) IS NOT NULL) AS has_data \
             FROM groupironman.members \
                 WHERE group_id=$1 AND account_hash=$2 ORDER BY member_id LIMIT 1",
            )
            .await?;
        if let Some(row) = client.query_opt(&stmt, &[&group_id, &account_hash]).await? {
            return Ok(Some(hub_member_row(&row)?));
        }
    }
    let stmt = client
        .prepare_cached(
            "SELECT member_name::text, hub_account_id, hub_last_seen, (GREATEST(stats_last_update, \
             coordinates_last_update, skills_last_update) IS NOT NULL) AS has_data \
             FROM groupironman.members \
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

pub async fn set_hub_seen(
    client: &Client,
    group_id: i64,
    member_name: &str,
    hub_last_seen: Option<DateTime<Utc>>,
) -> Result<(), ApiError> {
    let stmt = client
        .prepare_cached(
            "UPDATE groupironman.members SET hub_last_seen=COALESCE($3, hub_last_seen, NOW()), \
             last_source='hub' WHERE group_id=$1 AND member_name=$2",
        )
        .await?;
    client
        .execute(&stmt, &[&group_id, &member_name, &hub_last_seen])
        .await?;
    Ok(())
}

/// Records that a member was last updated by direct plugin ingest.
pub async fn set_direct_source(
    client: &Client,
    group_id: i64,
    member_name: &str,
    account_hash: Option<&str>,
) -> Result<(), ApiError> {
    let stmt = client
        .prepare_cached(
            "UPDATE groupironman.members SET last_source='direct', \
             account_hash=COALESCE($3, account_hash) WHERE group_id=$1 AND member_name=$2",
        )
        .await?;
    client
        .execute(&stmt, &[&group_id, &member_name, &account_hash])
        .await?;
    Ok(())
}

/// Renames a member that is bound to a hub account, keeping user links in step.
pub async fn rename_hub_member(
    client: &mut Client,
    group_id: i64,
    original_name: &str,
    new_name: &str,
) -> Result<(), ApiError> {
    let transaction = client.transaction().await?;
    transaction
        .execute(
            "UPDATE groupironman.members SET member_name=$3 WHERE group_id=$1 AND member_name=$2",
            &[&group_id, &original_name, &new_name],
        )
        .await?;
    transaction
        .execute(
            "UPDATE groupironman.user_player_links SET member_name=$3 \
             WHERE group_id=$1 AND member_name=$2",
            &[&group_id, &original_name, &new_name],
        )
        .await?;
    transaction.commit().await?;
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
            "UPDATE groupironman.members SET hub_orphaned_at=NOW() \
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

/// Member name and hub account id of every member bound to the hub.
pub async fn get_hub_bindings(
    client: &Client,
    group_id: i64,
) -> Result<Vec<(String, String)>, ApiError> {
    let stmt = client
        .prepare_cached(
            "SELECT member_name::text, hub_account_id FROM groupironman.members \
             WHERE group_id=$1 AND hub_account_id IS NOT NULL",
        )
        .await?;
    let rows = client.query(&stmt, &[&group_id]).await?;
    rows.iter()
        .map(|row| Ok((row.try_get(0)?, row.try_get(1)?)))
        .collect()
}

pub async fn get_user_id_by_discord_id(
    client: &Client,
    discord_id: &str,
) -> Result<Option<i64>, ApiError> {
    let stmt = client
        .prepare_cached(
            "SELECT d.user_id FROM groupironman.discord_users d \
             JOIN groupironman.users u ON u.user_id = d.user_id \
             WHERE d.discord_id=$1 AND u.enabled = TRUE",
        )
        .await?;
    let row = client.query_opt(&stmt, &[&discord_id]).await?;
    Ok(row.map(|row| row.try_get(0)).transpose()?)
}

/// Links a user to a player, recording where the link came from
/// (`device`, `hub` or `manual`). An existing link keeps its source.
pub async fn upsert_user_player_link_with_source(
    client: &Client,
    user_id: i64,
    member_name: &str,
    group_id: i64,
    source: &str,
) -> Result<(), ApiError> {
    let stmt = client
        .prepare_cached(
            r#"
INSERT INTO groupironman.user_player_links (user_id, member_name, group_id, last_updated, source)
VALUES($1, $2, $3, NOW(), $4)
ON CONFLICT (user_id, member_name, group_id) DO UPDATE SET last_updated = NOW()
"#,
        )
        .await?;
    client
        .execute(&stmt, &[&user_id, &member_name, &group_id, &source])
        .await?;
    Ok(())
}

pub async fn delete_user_player_link(
    client: &Client,
    user_id: i64,
    member_name: &str,
    group_id: i64,
) -> Result<u64, ApiError> {
    let stmt = client
        .prepare_cached(
            "DELETE FROM groupironman.user_player_links \
             WHERE user_id=$1 AND member_name=$2 AND group_id=$3",
        )
        .await?;
    Ok(client
        .execute(&stmt, &[&user_id, &member_name, &group_id])
        .await?)
}
