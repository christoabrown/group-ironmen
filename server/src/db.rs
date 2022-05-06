use crate::crypto::{token_hash, Crypter};
use crate::error::ApiError;
use crate::models::{
    Bank, CreateGroup, EncryptedData, GroupData, GroupMember, Item, SHARED_MEMBER,
};
use chrono::{DateTime, Utc};
use deadpool_postgres::Client;
use serde::{de::DeserializeOwned, Serialize};
use std::collections::HashMap;
use tokio_postgres::{error::Error, types::ToSql, Row};

pub async fn create_group(client: &mut Client, create_group: &CreateGroup) -> Result<(), ApiError> {
    let create_group_stmt = client.prepare_cached("INSERT INTO groupironman.groups (group_name, group_token_hash) VALUES($1, $2) RETURNING group_id").await?;
    let create_member_stmt = client
        .prepare_cached("INSERT INTO groupironman.members (group_id, member_name) VALUES($1, $2)")
        .await?;
    let transaction = client.transaction().await?;

    let hashed_token = token_hash(&create_group.token, &create_group.name);
    let group_id: i64 = transaction
        .query_one(&create_group_stmt, &[&create_group.name, &hashed_token])
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

pub async fn delete_group_member(
    client: &Client,
    group_id: i64,
    member_name: &str,
) -> Result<(), ApiError> {
    let stmt = client
        .prepare_cached("DELETE FROM groupironman.members WHERE group_id=$1 AND member_name=$2")
        .await?;
    client
        .execute(&stmt, &[&group_id, &member_name])
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

fn add_set_for_column<T>(
    sets: &mut std::vec::Vec<String>,
    param_pos: usize,
    column: &str,
    value: &Option<T>,
    crypter: &Crypter,
) -> Result<Option<String>, ApiError>
where
    T: Serialize,
{
    match value {
        Some(v) => {
            sets.push(format!(
                "{}=${}, {}_last_update=NOW()",
                column, param_pos, column
            ));

            let encrypted_data = crypter.encrypt(v)?;
            let encrypted_json = serde_json::to_string(&encrypted_data)?;
            Ok(Some(encrypted_json))
        }
        None => Ok(None),
    }
}

pub async fn update_group_member(
    client: &Client,
    group_id: i64,
    group_member: GroupMember,
    crypter: &Crypter,
) -> Result<(), ApiError> {
    let mut sets = vec![];
    let mut params: std::vec::Vec<&(dyn ToSql + Sync)> = Vec::with_capacity(10);
    let stats_json = add_set_for_column(
        &mut sets,
        params.len() + 1,
        "stats",
        &group_member.stats,
        &crypter,
    )?;
    if stats_json.is_some() {
        params.push(&stats_json);
    }
    let coordinates_json = add_set_for_column(
        &mut sets,
        params.len() + 1,
        "coordinates",
        &group_member.coordinates,
        &crypter,
    )?;
    if coordinates_json.is_some() {
        params.push(&coordinates_json);
    }
    let skills_json = add_set_for_column(
        &mut sets,
        params.len() + 1,
        "skills",
        &group_member.skills,
        &crypter,
    )?;
    if skills_json.is_some() {
        params.push(&skills_json);
    }
    let quests_json = add_set_for_column(
        &mut sets,
        params.len() + 1,
        "quests",
        &group_member.quests,
        &crypter,
    )?;
    if quests_json.is_some() {
        params.push(&quests_json);
    }
    let inventory_json = add_set_for_column(
        &mut sets,
        params.len() + 1,
        "inventory",
        &group_member.inventory,
        &crypter,
    )?;
    if inventory_json.is_some() {
        params.push(&inventory_json);
    }
    let equipment_json = add_set_for_column(
        &mut sets,
        params.len() + 1,
        "equipment",
        &group_member.equipment,
        &crypter,
    )?;
    if equipment_json.is_some() {
        params.push(&equipment_json);
    }
    let bank_json = add_set_for_column(
        &mut sets,
        params.len() + 1,
        "bank",
        &group_member.bank,
        &crypter,
    )?;
    if bank_json.is_some() {
        params.push(&bank_json);
    }
    let rune_pouch_json = add_set_for_column(
        &mut sets,
        params.len() + 1,
        "rune_pouch",
        &group_member.rune_pouch,
        &crypter,
    )?;
    if rune_pouch_json.is_some() {
        params.push(&rune_pouch_json);
    }
    let interacting_json = add_set_for_column(
        &mut sets,
        params.len() + 1,
        "interacting",
        &group_member.interacting,
        &crypter,
    )?;
    if interacting_json.is_some() {
        params.push(&interacting_json);
    }

    if !sets.is_empty() {
        let _stmt = format!(
            "UPDATE groupironman.members SET {} WHERE group_id=${} AND member_name=${}",
            sets.join(","),
            params.len() + 1,
            params.len() + 2
        );
        let stmt = client.prepare_cached(&_stmt).await?;
        client
            .execute(
                &stmt,
                &[params.as_slice(), &[&group_id], &[&group_member.name]].concat(),
            )
            .await
            .map_err(ApiError::UpdateGroupMemberError)?;
    }

    // Merge deposited items into bank
    match group_member.deposited {
        Some(deposited) => {
            deposit_items(client, group_id, &group_member.name, deposited, crypter).await?;
        }
        None => (),
    }

    match group_member.shared_bank {
        Some(shared_bank) => {
            let _stmt = "UPDATE groupironman.members SET bank=$1, bank_last_update=NOW() WHERE group_id=$2 AND member_name=$3";
            let stmt = client.prepare_cached(&_stmt).await?;
            let encrypted_data = crypter.encrypt(&shared_bank)?;
            let encrypted_json = serde_json::to_string(&encrypted_data)?;
            client
                .execute(&stmt, &[&encrypted_json, &group_id, &SHARED_MEMBER])
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
    crypter: &Crypter,
) -> Result<(), ApiError> {
    if deposited.len() == 0 {
        return Ok(());
    }

    let _get_bank_stmt =
        "SELECT bank FROM groupironman.members WHERE group_id=$1 AND member_name=$2";
    let get_bank_stmt = client.prepare_cached(&_get_bank_stmt).await?;
    let row = client
        .query_one(&get_bank_stmt, &[&group_id, &member_name])
        .await
        .map_err(ApiError::UpdateGroupMemberError)?;

    let opt_bank: Option<Bank> = parse_optional(&row, "bank", crypter)?;

    match opt_bank {
        Some(mut bank) => {
            let mut deposited_map = HashMap::new();
            for item in deposited {
                deposited_map.insert(item.id, item.quantity);
            }

            for item in &mut bank {
                if deposited_map.contains_key(&item.id) {
                    item.quantity += deposited_map.get(&item.id).unwrap_or(&0);
                    deposited_map.remove(&item.id);
                }
            }

            for id in deposited_map.keys() {
                if *id == 0 {
                    continue;
                }

                let item = Item {
                    id: *id,
                    quantity: *deposited_map.get(&id).unwrap_or(&0),
                };

                if item.quantity > 0 {
                    bank.push(item);
                }
            }

            let encrypted_bank = crypter.encrypt(bank)?;
            let encrypted_bank_json = serde_json::to_string(&encrypted_bank)?;
            let _update_bank_stmt = "UPDATE groupironman.members SET bank=$1, bank_last_update=NOW() WHERE group_id=$2 AND member_name=$3";
            let update_bank_stmt = client.prepare_cached(&_update_bank_stmt).await?;
            client
                .execute(
                    &update_bank_stmt,
                    &[&encrypted_bank_json, &group_id, &member_name],
                )
                .await
                .map_err(ApiError::UpdateGroupMemberError)?;
        }
        None => (),
    }

    Ok(())
}

pub async fn get_group_id(client: &Client, group_name: &str, token: &str) -> Result<i64, ApiError> {
    let stmt = client
        .prepare_cached(
            "SELECT group_id FROM groupironman.groups WHERE group_token_hash=$1 AND group_name=$2",
        )
        .await?;
    let hashed_token = token_hash(token, group_name);
    let group_id: Result<i64, Error> = client
        .query_one(&stmt, &[&hashed_token, &group_name])
        .await?
        .try_get(0);
    group_id.map_err(ApiError::GetGroupIdError)
}

fn parse_optional<T>(row: &Row, column: &str, crypter: &Crypter) -> Result<Option<T>, ApiError>
where
    T: Serialize + DeserializeOwned,
{
    let column_data = row.try_get(column).ok().unwrap_or("");
    if column_data.eq("") {
        return Ok(None);
    }
    let encrypted_data: EncryptedData = serde_json::from_str(column_data)?;
    let result: T = crypter.decrypt(encrypted_data)?;
    Ok(Some(result))
}

pub async fn get_group_data(
    client: &Client,
    group_id: i64,
    timestamp: &DateTime<Utc>,
    crypter: &Crypter,
) -> Result<GroupData, ApiError> {
    let stmt = client
        .prepare_cached(
            r#"
SELECT member_name,
GREATEST(stats_last_update, coordinates_last_update, skills_last_update,
quests_last_update, inventory_last_update, equipment_last_update, bank_last_update,
rune_pouch_last_update, interacting_last_update) as last_updated,
CASE WHEN stats_last_update >= $1::TIMESTAMPTZ THEN stats ELSE NULL END as stats,
CASE WHEN coordinates_last_update >= $1::TIMESTAMPTZ THEN coordinates ELSE NULL END as coordinates,
CASE WHEN skills_last_update >= $1::TIMESTAMPTZ THEN skills ELSE NULL END as skills,
CASE WHEN quests_last_update >= $1::TIMESTAMPTZ THEN quests ELSE NULL END as quests,
CASE WHEN inventory_last_update >= $1::TIMESTAMPTZ THEN inventory ELSE NULL END as inventory,
CASE WHEN equipment_last_update >= $1::TIMESTAMPTZ THEN equipment ELSE NULL END as equipment,
CASE WHEN bank_last_update >= $1::TIMESTAMPTZ THEN bank ELSE NULL END as bank,
CASE WHEN rune_pouch_last_update >= $1::TIMESTAMPTZ THEN rune_pouch ELSE NULL END as rune_pouch,
CASE WHEN interacting_last_update >= $1::TIMESTAMPTZ THEN interacting ELSE NULL END as interacting
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
        let group_member = GroupMember {
            name: member_name,
            stats: parse_optional(&row, "stats", crypter)?,
            coordinates: parse_optional(&row, "coordinates", crypter)?,
            skills: parse_optional(&row, "skills", crypter)?,
            quests: parse_optional(&row, "quests", crypter)?,
            inventory: parse_optional(&row, "inventory", crypter)?,
            equipment: parse_optional(&row, "equipment", crypter)?,
            bank: parse_optional(&row, "bank", crypter)?,
            shared_bank: None,
            rune_pouch: parse_optional(&row, "rune_pouch", crypter)?,
            interacting: parse_optional(&row, "interacting", crypter)?,
            deposited: None,
            last_updated: last_updated,
        };

        result.push(group_member);
    }

    Ok(result)
}

pub async fn update_schema(client: &Client) -> Result<(), ApiError> {
    let stmt = client
        .prepare(
            r#"
ALTER TABLE groupironman.members
ADD COLUMN IF NOT EXISTS rune_pouch_last_update TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS rune_pouch TEXT NOT NULL default '{}'::TEXT,
ADD COLUMN IF NOT EXISTS interacting_last_update TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS interacting TEXT NOT NULL default '{}'::TEXT
"#,
        )
        .await?;
    client.execute(&stmt, &[]).await?;

    Ok(())
}
