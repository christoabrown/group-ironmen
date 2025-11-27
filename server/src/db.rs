use crate::crypto::token_hash;
use crate::error::ApiError;
use crate::models::{
    AggregateSkillData, CreateGroup, GroupMember, GroupSkillData, MemberSkillData, SHARED_MEMBER,
};
use chrono::{DateTime, Utc};
use deadpool_postgres::{Client, Transaction};
use serde::{de::DeserializeOwned, Serialize};
use std::collections::{HashMap, HashSet};
use tokio_postgres::Row;

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

    transaction
        .execute(&create_member_stmt, &[&group_id, &SHARED_MEMBER])
        .await
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
    let member_count_stmt = client
        .prepare_cached(
            "SELECT COUNT(*) FROM groupironman.members WHERE group_id=$1 AND member_name!=$2",
        )
        .await?;
    let member_count: i64 = client
        .query_one(&member_count_stmt, &[&group_id, &SHARED_MEMBER])
        .await?
        .try_get(0)
        .map_err(ApiError::AddMemberError)?;

    if member_count >= 5 {
        return Err(ApiError::GroupFullError);
    }

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
    let a = "DELETE FROM groupironman.collection_log WHERE member_id=$1";
    let delete_collection_stmt = transaction.prepare_cached(&a).await?;
    transaction
        .execute(&delete_collection_stmt, &[&member_id])
        .await?;

    let b = "DELETE FROM groupironman.collection_log_new WHERE member_id=$1";
    let delete_new_stmt = transaction.prepare_cached(&b).await?;
    transaction.execute(&delete_new_stmt, &[&member_id]).await?;

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
    let member_id = get_member_id(&client, group_id, member_name).await?;
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
collection_log_last_update) as last_updated,
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
CASE WHEN collection_log_last_update > $1::TIMESTAMPTZ THEN collection_log ELSE NULL END as collection_log
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
            shared_bank: Option::None,
            deposited: Option::None,
            collection_log_v2: row.try_get("collection_log").ok()
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

    Ok(if count > 0 { true } else { false })
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

pub async fn update_schema(client: &mut Client) -> Result<(), ApiError> {
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

//     if !has_migration_run(client, "add_collection_log").await? {
//         let transaction = client.transaction().await?;

//         transaction
//             .execute(
//                 r#"
// CREATE TABLE IF NOT EXISTS groupironman.collection_tab (
//     tab_id SMALLSERIAL PRIMARY KEY,
//     name TEXT NOT NULL
// )
// "#,
//                 &[],
//             )
//             .await?;
//         transaction
//             .execute(
//                 r#"
// INSERT INTO groupironman.collection_tab (tab_id, name) VALUES
//     (0, 'Bosses'),
//     (1, 'Raids'),
//     (2, 'Clues'),
//     (3, 'Minigames'),
//     (4, 'Other')
// ON CONFLICT (tab_id) DO NOTHING
// "#,
//                 &[],
//             )
//             .await?;

//         transaction
//             .execute(
//                 r#"
// CREATE TABLE IF NOT EXISTS groupironman.collection_page (
//     page_id SMALLSERIAL PRIMARY KEY,
//     tab_id SMALLSERIAL REFERENCES groupironman.collection_tab(tab_id),
//     page_name TEXT NOT NULL,

//     UNIQUE(tab_id, page_name)
// )
// "#,
//                 &[],
//             )
//             .await?;

//         for tab in COLLECTION_LOG_INFO.iter() {
//             for page in tab.pages.iter() {
//                 transaction
//                     .execute(
//                         r#"
// INSERT INTO groupironman.collection_page (tab_id, page_name) VALUES ($1, $2)
// ON CONFLICT (tab_id, page_name) DO NOTHING
// "#,
//                         &[&tab.tabId, &page.name],
//                     )
//                     .await?;
//             }
//         }

//         transaction
//             .execute(
//                 r#"
// CREATE TABLE IF NOT EXISTS groupironman.collection_log (
//     member_id BIGSERIAL REFERENCES groupironman.members(member_id),
//     page_id SMALLSERIAL REFERENCES groupironman.collection_page(page_id),
//     items INTEGER[],
//     counts INTEGER[],
//     last_updated TIMESTAMPTZ,


//     PRIMARY KEY (member_id, page_id)
// )
// "#,
//                 &[],
//             )
//             .await?;

//         transaction
//             .execute(
//                 r#"
// CREATE TABLE IF NOT EXISTS groupironman.collection_log_new (
//     member_id BIGSERIAL REFERENCES groupironman.members(member_id),
//     page_id SMALLSERIAL REFERENCES groupironman.collection_page(page_id),
//     new_items INTEGER[],
//     last_updated TIMESTAMPTZ,


//     PRIMARY KEY (member_id, page_id)
// )
// "#,
//                 &[],
//             )
//             .await?;

//         transaction
//             .execute(
//                 r#"
// DROP TABLE IF EXISTS groupironman.collection_items;
// "#,
//                 &[],
//             )
//             .await?;

//         // Adding group id column to collection_log table so we can query the whole group's log
//         add_group_id_column(&transaction, "collection_log").await?;
//         add_group_id_column(&transaction, "collection_log_new").await?;

//         commit_migration(&transaction, "add_collection_log").await?;
//         transaction.commit().await?;
//     }

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
                    match transaction
                        .execute(
                            "UPDATE groupironman.members SET member_name=$1 WHERE member_id=$2",
                            &[&new_name, &member_id],
                        )
                        .await
                    {
                        Ok(_) => break,
                        Err(_) => (),
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

//     {
//         let transaction = client.transaction().await?;

//         for tab in COLLECTION_LOG_INFO.iter() {
//             for page in tab.pages.iter() {
//                 transaction
//                     .execute(
//                         r#"
// INSERT INTO groupironman.collection_page (tab_id, page_name) VALUES ($1, $2)
// ON CONFLICT (tab_id, page_name) DO NOTHING
// "#,
//                         &[&tab.tabId, &page.name],
//                     )
//                     .await?;
//             }
//         }

//         transaction.commit().await?;
//     }

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

    if !has_migration_run(client, "migrate_collection_log_v2").await? {
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
                Some(collection_log) => { collection_log.extend(items.iter()); }
                None => { member_data.insert(member_id, items); }
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
            println!("migrating chunk {}/{} size {}", i + 1, chunks.len(), chunk.len());
            let mut values_clause = String::new();
            for i in 0..chunk.len() {
                values_clause.push_str(&format!("(${}::BIGINT, ${}::INTEGER[])", i * 2 + 1, i * 2 + 2));
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
            let update_query = format!(r#"
UPDATE groupironman.members as a SET collection_log=b.collection_log, collection_log_last_update='epoch'::timestamptz + INTERVAL '5 days'
FROM (VALUES {}) AS b(member_id, collection_log)
WHERE a.member_id=b.member_id
"#, values_clause);

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
            "collection_log"
        ];

        for name in names {
            let create_update_timestamp_fn = format!(r#"
CREATE OR REPLACE FUNCTION groupironman.update_{}_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.{}_last_update = now();
    RETURN NEW;
END;
$$ language 'plpgsql';
"#, name, name);
            transaction.execute(&create_update_timestamp_fn, &[]).await?;

            let trigger_stmt = format!(r#"
DO
$$BEGIN
  CREATE TRIGGER set_{}_timestamp
  BEFORE UPDATE ON groupironman.members
  FOR EACH ROW
  WHEN (OLD.{} IS DISTINCT FROM NEW.{})
  EXECUTE FUNCTION groupironman.update_{}_timestamp();
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END;$$;
"#, name, name, name, name);
            transaction.execute(&trigger_stmt, &[]).await?;
        }

        commit_migration(&transaction, "update_timestamp_triggers").await?;
        transaction.commit().await?;
    }

    Ok(())
}
