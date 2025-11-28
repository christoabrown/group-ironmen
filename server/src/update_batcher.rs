use crate::models::{GroupMember, SHARED_MEMBER};
use deadpool_postgres::{Pool, Client};
use std::collections::{HashMap, HashSet};
use crate::db::serialize_serde;
use lazy_static::lazy_static;
use std::sync::Arc;
use tokio_postgres::types::Type;
use tokio::sync::mpsc;
use std::hash::{DefaultHasher, Hash, Hasher};
use crate::error::ApiError;
use tokio::time::{self, Instant, Duration};

static BATCH_SIZE: usize = 5000;
static CHUNK_SIZE: usize = 50;

pub async fn background_worker(pool: Pool, mut rx: mpsc::Receiver<GroupMember>) {
    let batch_timeout = Duration::from_millis(50);

    loop {
        let mut buffer: Vec<GroupMember> = Vec::with_capacity(BATCH_SIZE);

        match rx.recv().await {
            Some(item) => {
                buffer.push(item);
            },
            None => {
                break;
            }
        }

        let timeout_at = Instant::now() + batch_timeout;

        loop {
            let remaining_time = timeout_at.saturating_duration_since(Instant::now());
            if remaining_time.is_zero() || buffer.len() >= BATCH_SIZE {
                break;
            }

            let sleep = time::sleep(remaining_time);

            tokio::select! {
                item = rx.recv() => {
                    match item {
                        Some(data) => {
                            buffer.push(data);
                            if buffer.len() >= BATCH_SIZE {
                                break;
                            }
                        }
                        None => {
                            break;
                        }
                    }
                },
                _ = sleep => {
                    break;
                }
            }
        }

        if buffer.is_empty() {
            continue;
        }

        // Filter out duplicate member updates to avoid deadlocks
        let mut member_keys: HashSet<u64> = HashSet::new();
        let mut filtered_buffer: Vec<GroupMember> = buffer.into_iter().rev()
            .filter(|item| {
                item.group_id.map(|group_id| {
                    let mut s = DefaultHasher::new();

                    let key_ref = (group_id, &item.name);
                    key_ref.hash(&mut s);
                    let key: u64 = s.finish();

                    member_keys.insert(key)
                }).unwrap_or(false)
            }).collect();

        // process the batch in many chunks
        let mut tasks = Vec::new();
        let batch = Arc::new(std::mem::take(&mut filtered_buffer));
        let mut start_index = 0;
        for chunk_slice in batch.chunks(CHUNK_SIZE) {
            let end_index = start_index + chunk_slice.len();
            let pool_clone = pool.clone();
            let batch_clone = Arc::clone(&batch);

            let task = tokio::spawn(async move {
                process_chunk(
                    &pool_clone,
                    batch_clone,
                    start_index,
                    end_index
                ).await;
            });

            tasks.push(task);
            start_index = end_index;
        }

        futures_util::future::join_all(tasks).await;
    }
}

fn get_values_clause(size: usize) -> String {
    let value_amt = VALUE_CASTS.len();
    let mut values_clause = String::new();
    for i in 0..size {
        values_clause.push_str("(");
        for j in 0..VALUE_CASTS.len() {
            values_clause.push_str(&format!("${}", i * value_amt + j + 1));
            if j < VALUE_CASTS.len() - 1 {
                values_clause.push_str(",");
            }
        }
        values_clause.push_str(")");
        if i < size - 1 {
            values_clause.push_str(",");
        }
    }

    values_clause
}

fn get_update_statement(size: usize) -> String {
    let values_clause = get_values_clause(size);
    let statement = format!(r#"
UPDATE groupironman.members as a SET
  stats = COALESCE(b.stats, a.stats),
  coordinates = COALESCE(b.coordinates, a.coordinates),
  skills = COALESCE(b.skills, a.skills),
  quests = COALESCE(b.quests, a.quests),
  inventory = COALESCE(b.inventory, a.inventory),
  equipment = COALESCE(b.equipment, a.equipment),
  bank = COALESCE(b.bank, a.bank),
  rune_pouch = COALESCE(b.rune_pouch, a.rune_pouch),
  interacting = COALESCE(b.interacting, a.interacting),
  seed_vault = COALESCE(b.seed_vault, a.seed_vault),
  diary_vars = COALESCE(b.diary_vars, a.diary_vars),
  collection_log = COALESCE(b.collection_log, a.collection_log)
FROM (VALUES {}) AS b(
  group_id,
  member_name,
  stats,
  coordinates,
  skills,
  quests,
  inventory,
  equipment,
  bank,
  rune_pouch,
  interacting,
  seed_vault,
  diary_vars,
  collection_log
)
WHERE a.group_id=b.group_id AND a.member_name=b.member_name::citext
"#, values_clause);

    statement
}

lazy_static! {
    pub static ref VALUES_STATEMENTS: HashMap<usize, String> = {
        let mut result: HashMap<usize, String> = HashMap::new();

        for i in 1..=CHUNK_SIZE {
            result.insert(i, get_update_statement(i));
        }

        result
    };
    pub static ref VALUE_CASTS: Vec<Type> = vec![
        Type::INT8, // group_id
        Type::UNKNOWN, // member_name
        Type::INT4_ARRAY, // stats
        Type::INT4_ARRAY, // coordinates
        Type::INT4_ARRAY, // skills
        Type::BYTEA, // quests
        Type::INT4_ARRAY, // inventory
        Type::INT4_ARRAY, // equipment
        Type::INT4_ARRAY, // bank
        Type::INT4_ARRAY, // rune pouch
        Type::TEXT, // interacting
        Type::INT4_ARRAY, // seed_vault
        Type::INT4_ARRAY, // diary_vars
        Type::INT4_ARRAY // collection_log
    ];
}

fn get_types(size: usize) -> Vec<Type> {
    let mut result = Vec::with_capacity(size * VALUE_CASTS.len());
    for _ in 0..size {
        result.extend_from_slice(&VALUE_CASTS);
    }

    result
}

async fn process_chunk(pool: &Pool, batch: Arc<Vec<GroupMember>>, start_index: usize, end_index: usize) {
    let buffer: &[GroupMember] = match batch.get(start_index..end_index) {
        Some(buffer) => buffer,
        None => {
            log::error!("Failed to process batch start_index={} end_index={}", start_index, end_index);
            return;
        }
    };
    let client = match pool.get().await {
        Ok(client) => client,
        Err(e) => {
            log::error!("Failed to get DB connection: {}", e);
            return;
        }
    };

    let update_stmt_str = match VALUES_STATEMENTS.get(&buffer.len()) {
        Some(s) => s,
        None => {
            log::error!("Failed to get value statement: buffer_size={}", buffer.len());
            return;
        }
    };

    let update_stmt_f = client.prepare_typed(
        update_stmt_str,
        &get_types(buffer.len())
    ).await;

    let update_stmt = match update_stmt_f {
        Ok(stmt) => stmt,
        Err(e) => {
            log::error!("Failed to prepare statement: {}", e);
            return;
        }
    };

    let mut params: Vec<&(dyn tokio_postgres::types::ToSql + Sync)> = Vec::with_capacity(VALUE_CASTS.len() * buffer.len());
    let interacting_storage: Vec<Option<String>> = buffer.iter()
        .map(|member_data| {
            match serialize_serde(&member_data.interacting) {
                Ok(interacting) => interacting,
                Err(_) => None::<String>,
            }
        })
        .collect();
    for (i, member_data) in buffer.iter().enumerate() {
        params.push(&member_data.group_id);
        params.push(&member_data.name);
        params.push(&member_data.stats);
        params.push(&member_data.coordinates);
        params.push(&member_data.skills);
        params.push(&member_data.quests);
        params.push(&member_data.inventory);
        params.push(&member_data.equipment);
        params.push(&member_data.bank);
        params.push(&member_data.rune_pouch);
        params.push(&interacting_storage[i]);
        params.push(&member_data.seed_vault);
        params.push(&member_data.diary_vars);
        params.push(&member_data.collection_log_v2);
    }

    match client.execute(&update_stmt, &params).await {
        Ok(_) => (),
        Err(e) => log::error!("Error executing bulk update: {}", e),
    };

    for member_data in buffer.iter() {
        // merge deposited items into bank
        match (&member_data.deposited, member_data.group_id) {
            (Some(deposited), Some(group_id)) => {
                match deposit_items(&client, group_id, &member_data.name, deposited).await {
                    Ok(_) => (),
                    Err(e) => log::error!("Error depositing items: {}", e)
                };
            }
            _ => ()
        };

        // update shared bank
        match (&member_data.shared_bank, member_data.group_id) {
            (Some(shared_bank), Some(group_id)) => {
                match update_shared_bank(&client, group_id, shared_bank).await {
                    Ok(_) => (),
                    Err(e) => log::error!("Error updating shared bank: {}", e)
                }
            },
            _ => {}
        };
    }
}

async fn deposit_items(
    client: &Client,
    group_id: i64,
    member_name: &str,
    deposited: &Vec<i32>,
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

    // Merge the deposited items into the bank data
    match opt_bank {
        Some(mut bank) => {
            let mut deposited_map = HashMap::new();
            for i in (0..deposited.len()).step_by(2) {
                deposited_map.insert(deposited[i], deposited[i + 1]);
            }

            // Add the quantity of a deposited item to an item already in the bank
            for i in (0..bank.len()).step_by(2) {
                let item_id = bank[i];
                if deposited_map.contains_key(&item_id) {
                    bank[i + 1] += deposited_map.get(&item_id).unwrap_or(&0);
                    deposited_map.remove(&item_id);
                }
            }

            // Add the rest of the deposted items as new items into the bank
            for id in deposited_map.keys() {
                if *id == 0 {
                    continue;
                }

                let quantity = *deposited_map.get(id).unwrap_or(&0);

                if quantity > 0 {
                    bank.push(*id);
                    bank.push(quantity);
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

async fn update_shared_bank(
    client: &Client,
    group_id: i64,
    shared_bank: &Vec<i32>,
) -> Result<(), ApiError> {
    let stmt = client
        .prepare_cached(
            r#"
UPDATE groupironman.members SET
bank=$1, bank_last_update=NOW()
WHERE group_id=$2 AND member_name=$3"#,
        )
        .await?;

    client
        .execute(&stmt, &[&shared_bank, &group_id, &SHARED_MEMBER])
        .await
        .map_err(ApiError::UpdateGroupMemberError)?;

    Ok(())
}
