use crate::crypto::token_hash;
use crate::error::ApiError;
use crate::models::{
    serialize_coordinates, serialize_item_slice, serialize_quests, serialize_skills,
    serialize_stats, AggregateSkillData, Bank, CreateGroup, GroupMember, GroupSkillData, Item,
    MemberSkillData, StoredGroupData, StoredGroupMember, SHARED_MEMBER,
};
use chrono::{DateTime, Utc};
use deadpool_postgres::{Client, Transaction};
use serde::{de::DeserializeOwned, Serialize};
use std::collections::HashMap;
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
        if !member_name.is_empty() {
            transaction
                .execute(&create_member_stmt, &[&group_id, &member_name])
                .await
                .map_err(ApiError::GroupCreationError)?;
        }
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

pub async fn delete_group_member(
    client: &mut Client,
    group_id: i64,
    member_name: &str,
) -> Result<(), ApiError> {
    let transaction = client.transaction().await?;
    let get_member_id_stmt = transaction
        .prepare_cached(
            "SELECT member_id FROM groupironman.members WHERE group_id=$1 AND member_name=$2",
        )
        .await?;
    let member_id: i64 = transaction
        .query_one(&get_member_id_stmt, &[&group_id, &member_name])
        .await
        .map_err(ApiError::DeleteGroupMemberError)?
        .try_get(0)?;
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

fn serialize_serde<T>(value: &Option<T>) -> Result<Option<String>, ApiError>
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

pub async fn update_group_member(
    client: &Client,
    group_id: i64,
    group_member: GroupMember,
) -> Result<(), ApiError> {
    let stmt = client
        .prepare_cached(
            r#"
UPDATE groupironman.members SET
  stats = COALESCE($1, stats),
  stats_last_update = CASE WHEN $1 IS NULL THEN stats_last_update ELSE NOW() END,
  coordinates = COALESCE($2, coordinates),
  coordinates_last_update = CASE WHEN $2 IS NULL THEN coordinates_last_update ELSE NOW() END,
  skills = COALESCE($3, skills),
  skills_last_update = CASE WHEN $3 IS NULL THEN skills_last_update ELSE NOW() END,
  quests = COALESCE($4, quests),
  quests_last_update = CASE WHEN $4 IS NULL THEN quests_last_update ELSE NOW() END,
  inventory = COALESCE($5, inventory),
  inventory_last_update = CASE WHEN $5 IS NULL THEN inventory_last_update ELSE NOW() END,
  equipment = COALESCE($6, equipment),
  equipment_last_update = CASE WHEN $6 IS NULL THEN equipment_last_update ELSE NOW() END,
  bank = COALESCE($7, bank),
  bank_last_update = CASE WHEN $7 IS NULL THEN bank_last_update ELSE NOW() END,
  rune_pouch = COALESCE($8, rune_pouch),
  rune_pouch_last_update = CASE WHEN $8 IS NULL THEN rune_pouch_last_update ELSE NOW() END,
  interacting = COALESCE($9, interacting),
  interacting_last_update = CASE WHEN $9 IS NULL THEN interacting_last_update ELSE NOW() END,
  seed_vault = COALESCE($10, seed_vault),
  seed_vault_last_update = CASE WHEN $10 IS NULL THEN seed_vault_last_update ELSE NOW() END,
  diary_vars = COALESCE($11, diary_vars),
  diary_vars_last_update = CASE WHEN $11 IS NULL THEN diary_vars_last_update ELSE NOW() END,
  tackle_box = COALESCE($12, tackle_box),
  tackle_box_last_update = CASE WHEN $12 IS NULL THEN tackle_box_last_update ELSE NOW() END
  WHERE group_id=$13 AND member_name=$14
"#,
        )
        .await?;
    client
        .execute(
            &stmt,
            &[
                &group_member.stats.map(serialize_stats),
                &group_member.coordinates.map(serialize_coordinates),
                &group_member.skills.map(serialize_skills),
                &serialize_quests(&group_member.quests),
                &group_member
                    .inventory
                    .map(|x| serialize_item_slice(x.as_slice())),
                &group_member
                    .equipment
                    .map(|x| serialize_item_slice(x.as_slice())),
                &group_member
                    .bank
                    .map(|x| serialize_item_slice(x.as_slice())),
                &group_member
                    .rune_pouch
                    .map(|x| serialize_item_slice(x.as_slice())),
                &serialize_serde(&group_member.interacting)?,
                &group_member
                    .seed_vault
                    .map(|x| serialize_item_slice(x.as_slice())),
                &group_member.diary_vars,
                &group_member
                    .tackle_box
                    .map(|x| serialize_item_slice(x.as_slice())),
                &group_id,
                &group_member.name,
            ],
        )
        .await
        .map_err(ApiError::UpdateGroupMemberError)?;

    // Merge deposited items into bank
    match group_member.deposited {
        Some(deposited) => {
            deposit_items(client, group_id, &group_member.name, deposited).await?;
        }
        None => (),
    }

    match group_member.shared_bank {
        Some(shared_bank) => {
            let stmt = client
                .prepare_cached(
                    r#"
UPDATE groupironman.members SET
bank=$1, bank_last_update=NOW()
WHERE group_id=$2 AND member_name=$3"#,
                )
                .await?;

            client
                .execute(
                    &stmt,
                    &[
                        &serialize_item_slice(shared_bank.as_slice()),
                        &group_id,
                        &SHARED_MEMBER,
                    ],
                )
                .await
                .map_err(ApiError::UpdateGroupMemberError)?;
        }
        None => (),
    }

    Ok(())
}

pub async fn deposit_items(
    client: &Client,
    group_id: i64,
    member_name: &str,
    deposited: Bank,
) -> Result<(), ApiError> {
    if deposited.is_empty() {
        return Ok(());
    }

    let get_bank_stmt = client
        .prepare_cached(
            "SELECT bank FROM groupironman.members WHERE group_id=$1 AND member_name=$2",
        )
        .await?;
    let row = client
        .query_one(&get_bank_stmt, &[&group_id, &member_name])
        .await
        .map_err(ApiError::UpdateGroupMemberError)?;

    let opt_bank: Option<Vec<i32>> = row.try_get("bank").ok();

    match opt_bank {
        Some(mut bank) => {
            let mut deposited_map = HashMap::new();
            for item in deposited {
                deposited_map.insert(item.id, item.quantity);
            }

            for i in (0..bank.len()).step_by(2) {
                let item_id = bank[i];
                if deposited_map.contains_key(&item_id) {
                    bank[i + 1] += deposited_map.get(&item_id).unwrap_or(&0);
                    deposited_map.remove(&item_id);
                }
            }

            for id in deposited_map.keys() {
                if *id == 0 {
                    continue;
                }

                let item = Item {
                    id: *id,
                    quantity: *deposited_map.get(id).unwrap_or(&0),
                };

                if item.quantity > 0 {
                    bank.push(item.id);
                    bank.push(item.quantity);
                }
            }

            let update_bank_stmt = client
                .prepare_cached(
                    r#"
UPDATE groupironman.members SET bank=$1, bank_last_update=NOW() WHERE group_id=$2 AND member_name=$3
"#,
                )
                .await?;
            client
                .execute(&update_bank_stmt, &[&bank, &group_id, &member_name])
                .await
                .map_err(ApiError::UpdateGroupMemberError)?;
        }
        None => (),
    }

    Ok(())
}

pub async fn get_group(
    client: &Client,
    group_name: &str,
    token: &str,
) -> Result<(i64, i32), ApiError> {
    let stmt = client
        .prepare_cached(
            "SELECT group_id, version FROM groupironman.groups WHERE group_token_hash=$1 AND group_name=$2",
        )
        .await?;
    let hashed_token = token_hash(token, group_name);
    let group: Row = client
        .query_one(&stmt, &[&hashed_token, &group_name])
        .await
        .map_err(ApiError::GetGroupError)?;
    Ok((group.try_get(0)?, group.try_get(1)?))
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
) -> Result<StoredGroupData, ApiError> {
    let stmt = client
        .prepare_cached(
            r#"
SELECT member_name,
GREATEST(stats_last_update, coordinates_last_update, skills_last_update,
quests_last_update, inventory_last_update, equipment_last_update, bank_last_update,
rune_pouch_last_update, interacting_last_update, seed_vault_last_update, diary_vars_last_update, tackle_box_last_update) as last_updated,
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
CASE WHEN tackle_box_last_update >= $1::TIMESTAMPTZ THEN tackle_box ELSE NULL END as tackle_box
FROM groupironman.members WHERE group_id=$2
"#,
        )
        .await?;

    let rows = client
        .query(&stmt, &[&timestamp, &group_id])
        .await
        .map_err(ApiError::GetGroupDataError)?;
    let mut result = vec![];
    for row in rows {
        let member_name = row.try_get("member_name")?;
        let last_updated: Option<DateTime<Utc>> = row.try_get("last_updated").ok();
        let group_member = StoredGroupMember {
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
            tackle_box: row.try_get("tackle_box").ok(),
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

pub async fn update_schema(client: &mut Client) -> Result<(), ApiError> {
    let encrypted_member_table_exists: bool = client
        .query_one(
            r#"
SELECT EXISTS (
  SELECT FROM pg_tables WHERE schemaname='groupironman' AND tablename='members_encrypted'
);
"#,
            &[],
        )
        .await?
        .try_get(0)?;
    if !encrypted_member_table_exists {
        let transaction = client.transaction().await?;
        // Just in case the table does not exist
        transaction
            .execute(
                r#"
CREATE TABLE IF NOT EXISTS groupironman.members (
  group_id BIGSERIAL REFERENCES groupironman.groups(group_id),
  member_name TEXT,

  stats_last_update TIMESTAMPTZ,
  stats TEXT NOT NULL default '{}'::TEXT,

  coordinates_last_update TIMESTAMPTZ,
  coordinates TEXT NOT NULL default '{}'::TEXT,

  skills_last_update TIMESTAMPTZ,
  skills TEXT NOT NULL default '{}'::TEXT,

  quests_last_update TIMESTAMPTZ,
  quests TEXT NOT NULL default '{}'::TEXT,

  inventory_last_update TIMESTAMPTZ,
  inventory TEXT NOT NULL default '[]'::TEXT,

  equipment_last_update TIMESTAMPTZ,
  equipment TEXT NOT NULL default '[]'::TEXT,

  bank_last_update TIMESTAMPTZ,
  bank TEXT NOT NULL default '[]'::TEXT,

  rune_pouch_last_update TIMESTAMPTZ,
  rune_pouch TEXT NOT NULL default '{}'::TEXT,

  interacting_last_update TIMESTAMPTZ,
  interacting TEXT NOT NULL default '{}'::TEXT,

  seed_vault_last_update TIMESTAMPTZ,
  seed_vault TEXT NOT NULL default '{}'::TEXT,

  PRIMARY KEY (group_id, member_name)
);
"#,
                &[],
            )
            .await?;
        transaction
            .execute(
                r#"
ALTER TABLE groupironman.members RENAME TO members_encrypted
"#,
                &[],
            )
            .await?;
        transaction
            .execute(
                r#"
ALTER TABLE groupironman.members_encrypted
ADD COLUMN IF NOT EXISTS rune_pouch_last_update TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS rune_pouch TEXT NOT NULL default '{}'::TEXT,
ADD COLUMN IF NOT EXISTS interacting_last_update TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS interacting TEXT NOT NULL default '{}'::TEXT,
ADD COLUMN IF NOT EXISTS seed_vault_last_update TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS seed_vault TEXT NOT NULL default '{}'::TEXT
"#,
                &[],
            )
            .await?;
        transaction
            .execute(
                r#"
ALTER TABLE groupironman.groups ADD COLUMN IF NOT EXISTS version INTEGER default 1
"#,
                &[],
            )
            .await?;
        transaction.commit().await?;
    }

    client
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
    client.execute(r#"
CREATE UNIQUE INDEX IF NOT EXISTS members_groupid_name_idx ON groupironman.members (group_id, member_name);
"#, &[]).await?;

    // Adding new columns for new types of data
    client
        .execute(
            r#"
ALTER TABLE groupironman.members
ADD COLUMN IF NOT EXISTS diary_vars_last_update TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS diary_vars INTEGER[62],
ADD COLUMN IF NOT EXISTS tackle_box_last_update TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS tackle_box INTEGER[32]
"#,
            &[],
        )
        .await?;

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
        client.execute(&create_skills_aggregate, &[]).await?;
    }

    client
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
    client
        .execute(
            r#"
INSERT INTO groupironman.aggregation_info (type) VALUES ('skills')
ON CONFLICT (type) DO NOTHING
"#,
            &[],
        )
        .await?;

    Ok(())
}
