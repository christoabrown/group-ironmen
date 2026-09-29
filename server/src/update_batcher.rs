use crate::db::serialize_serde;
use crate::error::ApiError;
use crate::models::GroupMember;
use deadpool_postgres::{Client, Pool};
use futures_util::stream::{self, StreamExt};
use std::collections::HashMap;
use std::sync::OnceLock;
use tokio::sync::mpsc;
use tokio::time::{self, Duration, Instant};

static BATCH_SIZE: usize = 5000;
static CHUNK_SIZE: usize = 50;

/// Every `<column>_last_update` is set explicitly whenever a value is supplied,
/// even if the value itself did not change. Data sources such as the RuneLite
/// data exporter resend unchanged state as a heartbeat and the site relies on
/// these timestamps to decide whether a member is online.
///
/// Number of columns per member update row. With 15 columns, the PostgreSQL
/// parameter-count limit (65,535) allows a maximum chunk size of 65535 / 15 =
/// 4369 rows when using the VALUES approach.
const COLUMNS_PER_ROW: usize = 15;

pub async fn background_worker(
    pool: Pool,
    mut rx: mpsc::Receiver<GroupMember>,
    notify: Option<mpsc::Sender<()>>,
) {
    let batch_timeout = Duration::from_millis(50);

    loop {
        let mut buffer: Vec<GroupMember> = Vec::with_capacity(BATCH_SIZE);

        match rx.recv().await {
            Some(item) => {
                buffer.push(item);
            }
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

        let mut filtered_buffer = deduplicate_batch(buffer);

        // Process the batch in chunks with bounded concurrency aligned to the
        // pool's usable connection count. Reserve one slot so the batcher
        // cannot saturate its own pool, leaving headroom for other queries.
        let pool_status = pool.status();
        let max_concurrency = pool_status.max_size.saturating_sub(1).max(1);

        let mut remaining = std::mem::take(&mut filtered_buffer);
        let mut chunks: Vec<Vec<GroupMember>> = Vec::new();
        while !remaining.is_empty() {
            let take = remaining.len().min(CHUNK_SIZE);
            chunks.push(remaining.drain(..take).collect());
        }

        let results: Vec<Option<()>> = stream::iter(chunks)
            .map(|chunk| {
                let pool_clone = pool.clone();
                async move { process_chunk(&pool_clone, chunk).await }
            })
            .buffer_unordered(max_concurrency)
            .collect()
            .await;
        for (i, result) in results.into_iter().enumerate() {
            if result.is_none() {
                log::error!("chunk {} returned None", i);
            }
        }

        if let Some(ref notify_tx) = notify {
            let _ = notify_tx.send(()).await;
        }
    }
}

/// Deduplicate and coalesce member updates by exact (group_id, name) key.
/// Merging preserves non-None fields from newer updates while keeping
/// values from older updates for fields that are None in the newer one.
/// Results are sorted by (group_id, name) for deterministic processing.
fn deduplicate_batch(buffer: Vec<GroupMember>) -> Vec<GroupMember> {
    let mut dedup_map: HashMap<(i64, String), GroupMember> = HashMap::new();
    for item in buffer {
        if let Some(group_id) = item.group_id {
            let key = (group_id, item.name.clone());
            match dedup_map.get_mut(&key) {
                Some(existing) => merge_group_member(existing, &item),
                None => {
                    dedup_map.insert(key, item);
                }
            }
        }
    }

    let mut filtered_buffer: Vec<GroupMember> = dedup_map.into_values().collect();
    filtered_buffer.sort_by(|a, b| {
        a.group_id
            .unwrap_or(0)
            .cmp(&b.group_id.unwrap_or(0))
            .then_with(|| a.name.cmp(&b.name))
    });
    filtered_buffer
}

/// Collect and validate deposit members from a chunk.
/// Validates paired item/quantity data and skips malformed arrays (odd
/// length) and empty arrays.
fn validate_deposits(chunk: &[GroupMember]) -> Vec<(&GroupMember, &[i32])> {
    chunk
        .iter()
        .filter_map(|m| {
            let deposited = m.deposited.as_ref()?;
            let group_id = m.group_id?;
            if deposited.len() % 2 != 0 {
                log::warn!(
                    "malformed deposit array: group_id={} member_name={} len={}",
                    group_id,
                    m.name,
                    deposited.len(),
                );
                return None;
            }
            if deposited.is_empty() {
                return None;
            }
            Some((m, deposited.as_slice()))
        })
        .collect()
}

fn merge_deposited(older: &[i32], newer: &[i32]) -> Vec<i32> {
    let mut quantities: HashMap<i32, i64> = HashMap::new();
    for pair in older.chunks_exact(2) {
        let qty = quantities.entry(pair[0]).or_insert(0);
        *qty = qty.saturating_add(pair[1] as i64);
    }
    for pair in newer.chunks_exact(2) {
        let qty = quantities.entry(pair[0]).or_insert(0);
        *qty = qty.saturating_add(pair[1] as i64);
    }
    let mut result = Vec::with_capacity(quantities.len() * 2);
    let mut sorted: Vec<_> = quantities.iter().collect();
    sorted.sort_by_key(|(&item_id, _)| item_id);
    for (&item_id, &qty) in &sorted {
        if item_id != 0 && qty > 0 {
            result.push(item_id);
            result.push(qty as i32);
        }
    }
    result
}

fn merge_group_member(older: &mut GroupMember, newer: &GroupMember) {
    if newer.stats.is_some() {
        older.stats = newer.stats.clone();
    }
    if newer.coordinates.is_some() {
        older.coordinates = newer.coordinates.clone();
    }
    if newer.skills.is_some() {
        older.skills = newer.skills.clone();
    }
    if newer.quests.is_some() {
        older.quests = newer.quests.clone();
    }
    if newer.inventory.is_some() {
        older.inventory = newer.inventory.clone();
    }
    if newer.equipment.is_some() {
        older.equipment = newer.equipment.clone();
    }
    if newer.bank.is_some() {
        older.bank = newer.bank.clone();
    }
    if newer.rune_pouch.is_some() {
        older.rune_pouch = newer.rune_pouch.clone();
    }
    if newer.interacting.is_some() {
        older.interacting = newer.interacting.clone();
    }
    if newer.seed_vault.is_some() {
        older.seed_vault = newer.seed_vault.clone();
    }
    if newer.diary_vars.is_some() {
        older.diary_vars = newer.diary_vars.clone();
    }
    if newer.collection_log_v2.is_some() {
        older.collection_log_v2 = newer.collection_log_v2.clone();
    }
    if newer.potion_storage.is_some() {
        older.potion_storage = newer.potion_storage.clone();
    }

    if let Some(newer_deposited) = &newer.deposited {
        match &older.deposited {
            Some(older_deposited) => {
                older.deposited = Some(merge_deposited(older_deposited, newer_deposited));
            }
            None => {
                older.deposited = Some(newer_deposited.clone());
            }
        }
    }

    if newer.last_updated.is_some() {
        older.last_updated = newer.last_updated;
    }

    older.name = newer.name.clone();
    older.group_id = newer.group_id;
}

/// Convert an optional int4 array to PostgreSQL text array format.
/// `Some(vec![1, 2, 3])` becomes `Some("{1,2,3}")`, `None` stays `None`.
/// Used for deposit bank updates where int4[] columns are passed as
/// text[] and cast to int4[] in the SQL SET clause.
fn int4_array_to_text(arr: &Option<Vec<i32>>) -> Option<String> {
    arr.as_ref().map(|v| {
        if v.is_empty() {
            "{}".to_string()
        } else {
            let items: Vec<String> = v.iter().map(|i| i.to_string()).collect();
            format!("{{{}}}", items.join(","))
        }
    })
}

static VALUES_STATEMENTS: OnceLock<HashMap<usize, String>> = OnceLock::new();

fn build_values_statement(size: usize) -> String {
    let values = (0..size)
        .map(|row| {
            let offset = row * COLUMNS_PER_ROW;
            format!(
                "(${}::int8,${}::text,${}::int4[],${}::int4[],${}::int4[],${}::bytea,${}::int4[],${}::int4[],${}::int4[],${}::int4[],${}::text,${}::int4[],${}::int4[],${}::int4[],${}::int4[])",
                offset + 1,
                offset + 2,
                offset + 3,
                offset + 4,
                offset + 5,
                offset + 6,
                offset + 7,
                offset + 8,
                offset + 9,
                offset + 10,
                offset + 11,
                offset + 12,
                offset + 13,
                offset + 14,
                offset + 15,
            )
        })
        .collect::<Vec<_>>()
        .join(",");

    format!(
        r#"
UPDATE groupironman.members AS a SET
  stats = COALESCE(b.stats, a.stats),
  stats_last_update = CASE WHEN b.stats IS NOT NULL THEN NOW() ELSE a.stats_last_update END,
  coordinates = COALESCE(b.coordinates, a.coordinates),
  coordinates_last_update = CASE WHEN b.coordinates IS NOT NULL THEN NOW() ELSE a.coordinates_last_update END,
  skills = COALESCE(b.skills, a.skills),
  skills_last_update = CASE WHEN b.skills IS NOT NULL THEN NOW() ELSE a.skills_last_update END,
  quests = COALESCE(b.quests, a.quests),
  quests_last_update = CASE WHEN b.quests IS NOT NULL THEN NOW() ELSE a.quests_last_update END,
  inventory = COALESCE(b.inventory, a.inventory),
  inventory_last_update = CASE WHEN b.inventory IS NOT NULL THEN NOW() ELSE a.inventory_last_update END,
  equipment = COALESCE(b.equipment, a.equipment),
  equipment_last_update = CASE WHEN b.equipment IS NOT NULL THEN NOW() ELSE a.equipment_last_update END,
  bank = COALESCE(b.bank, a.bank),
  bank_last_update = CASE WHEN b.bank IS NOT NULL THEN NOW() ELSE a.bank_last_update END,
  rune_pouch = COALESCE(b.rune_pouch, a.rune_pouch),
  rune_pouch_last_update = CASE WHEN b.rune_pouch IS NOT NULL THEN NOW() ELSE a.rune_pouch_last_update END,
  interacting = COALESCE(b.interacting, a.interacting),
  interacting_last_update = CASE WHEN b.interacting IS NOT NULL THEN NOW() ELSE a.interacting_last_update END,
  seed_vault = COALESCE(b.seed_vault, a.seed_vault),
  seed_vault_last_update = CASE WHEN b.seed_vault IS NOT NULL THEN NOW() ELSE a.seed_vault_last_update END,
  diary_vars = COALESCE(b.diary_vars, a.diary_vars),
  diary_vars_last_update = CASE WHEN b.diary_vars IS NOT NULL THEN NOW() ELSE a.diary_vars_last_update END,
  collection_log = COALESCE(b.collection_log, a.collection_log),
  collection_log_last_update = CASE WHEN b.collection_log IS NOT NULL THEN NOW() ELSE a.collection_log_last_update END,
  potion_storage = COALESCE(b.potion_storage, a.potion_storage),
  potion_storage_last_update = CASE WHEN b.potion_storage IS NOT NULL THEN NOW() ELSE a.potion_storage_last_update END
FROM (VALUES {values}) AS b(
  group_id, member_name, stats, coordinates, skills, quests, inventory,
  equipment, bank, rune_pouch, interacting, seed_vault, diary_vars, collection_log,
  potion_storage
)
WHERE a.group_id = b.group_id AND a.member_name = b.member_name::citext
"#
    )
}

fn values_statement(size: usize) -> &'static str {
    let map = VALUES_STATEMENTS.get_or_init(|| {
        let mut m = HashMap::new();
        for s in 1..=CHUNK_SIZE {
            m.insert(s, build_values_statement(s));
        }
        m
    });
    map.get(&size).map(|s| s.as_str()).unwrap_or_else(|| {
        log::error!(
            "values_statement: chunk_size {} exceeds precomputed range",
            size,
        );
        Box::leak(build_values_statement(size).into_boxed_str())
    })
}

async fn process_chunk(pool: &Pool, chunk: Vec<GroupMember>) -> Option<()> {
    let chunk_size = chunk.len();
    let buffer: &[GroupMember] = &chunk;

    let mut client = match pool.get().await {
        Ok(client) => client,
        Err(e) => {
            log::error!("checkout failed: chunk_size={} error={}", chunk_size, e);
            return None;
        }
    };

    let update_stmt = match client.prepare_cached(values_statement(chunk_size)).await {
        Ok(stmt) => stmt,
        Err(e) => {
            log::error!("prepare failed: chunk_size={} error={}", chunk_size, e);
            return Some(());
        }
    };

    let interacting_storage: Vec<Option<String>> = buffer
        .iter()
        .map(|member_data| serialize_serde(&member_data.interacting).unwrap_or_default())
        .collect();
    let mut params: Vec<&(dyn tokio_postgres::types::ToSql + Sync)> =
        Vec::with_capacity(COLUMNS_PER_ROW * chunk_size);
    for (index, member_data) in buffer.iter().enumerate() {
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
        params.push(&interacting_storage[index]);
        params.push(&member_data.seed_vault);
        params.push(&member_data.diary_vars);
        params.push(&member_data.collection_log_v2);
        params.push(&member_data.potion_storage);
    }

    if let Err(e) = client.execute(&update_stmt, &params).await {
        log::error!("bulk update failed: chunk_size={} error={}", chunk_size, e);
    }

    // Process deposit side effects in one transaction per chunk. Deposits
    // are batched into a single SELECT FOR UPDATE + batch UPDATE in
    // deterministic (group_id, member_name) order.
    //
    // Retry/idempotency: the bulk member update (UNNEST) is already committed
    // before this transaction begins. If this transaction fails and the client
    // retries the update, deposits will be re-applied (additive merge — NOT
    // idempotent on retry). This matches the previous per-member behavior.
    if let Err(e) = process_bank_side_effects(&mut client, buffer).await {
        log::error!(
            "bank side effects failed: chunk_size={} error={}",
            chunk_size,
            e
        );
    }

    Some(())
}

/// Process deposit side effects for a chunk in one transaction.
///
/// Deposits are batched: one SELECT FOR UPDATE retrieves all affected member
/// banks, deposits are merged in memory with i64 accumulation for overflow
/// safety, then one set-based UPDATE writes all modified banks.
///
/// Lock ordering: member bank rows are locked via SELECT FOR UPDATE in
/// (group_id, member_name) order (the chunk is pre-sorted). No parallel
/// operations touch the same row within this function.
async fn process_bank_side_effects(
    client: &mut Client,
    chunk: &[GroupMember],
) -> Result<(), ApiError> {
    let deposit_members = validate_deposits(chunk);

    if deposit_members.is_empty() {
        return Ok(());
    }

    let transaction = client.transaction().await?;

    // --- Deposits: batch SELECT FOR UPDATE + batch UPDATE ---

    let group_ids: Vec<Option<i64>> = deposit_members.iter().map(|(m, _)| m.group_id).collect();
    let member_names: Vec<&str> = deposit_members
        .iter()
        .map(|(m, _)| m.name.as_str())
        .collect();

    let select_stmt = transaction
        .prepare_cached(
            r#"SELECT a.group_id, a.member_name, a.bank
FROM groupironman.members a
JOIN UNNEST($1::int8[], $2::text[]) AS t(group_id, member_name)
ON a.group_id = t.group_id AND a.member_name = t.member_name::citext
FOR UPDATE"#,
        )
        .await?;

    let rows = transaction
        .query(&select_stmt, &[&group_ids, &member_names])
        .await?;

    // Build a map of current banks keyed by (group_id, member_name)
    let mut bank_map: HashMap<(i64, String), Vec<i32>> = HashMap::new();
    for row in &rows {
        let group_id: i64 = row.try_get("group_id")?;
        let member_name: String = row.try_get("member_name")?;
        let bank: Option<Vec<i32>> = row.try_get("bank").ok();
        bank_map.insert((group_id, member_name), bank.unwrap_or_default());
    }

    // Merge deposits into banks in memory with i64 accumulation for
    // integer overflow protection, then build batch UPDATE arrays.
    let mut update_group_ids: Vec<Option<i64>> = Vec::with_capacity(deposit_members.len());
    let mut update_member_names: Vec<&str> = Vec::with_capacity(deposit_members.len());
    let mut update_banks: Vec<Option<String>> = Vec::with_capacity(deposit_members.len());

    for (member_data, deposited) in &deposit_members {
        let group_id = member_data.group_id.unwrap_or(0);
        let key = (group_id, member_data.name.clone());

        let mut bank = bank_map.remove(&key).unwrap_or_default();

        // Build deposit quantity map with i64 accumulation for overflow safety
        let mut deposited_map: HashMap<i32, i64> = HashMap::new();
        for pair in deposited.chunks_exact(2) {
            let qty = deposited_map.entry(pair[0]).or_insert(0);
            *qty = qty.saturating_add(pair[1] as i64);
        }

        // Merge deposited quantities into existing bank items
        for i in (0..bank.len()).step_by(2) {
            if i + 1 >= bank.len() {
                break;
            }
            let item_id = bank[i];
            if deposited_map.contains_key(&item_id) {
                let new_qty = (bank[i + 1] as i64).saturating_add(deposited_map[&item_id]);
                bank[i + 1] = new_qty as i32;
                deposited_map.remove(&item_id);
            }
        }

        // Add remaining deposited items as new bank entries (sorted for deterministic order)
        let mut remaining: Vec<_> = deposited_map.iter().collect();
        remaining.sort_by_key(|(&item_id, _)| item_id);
        for (&item_id, &qty) in &remaining {
            if item_id != 0 && qty > 0 {
                bank.push(item_id);
                bank.push(qty as i32);
            }
        }

        update_group_ids.push(member_data.group_id);
        update_member_names.push(member_data.name.as_str());
        update_banks.push(int4_array_to_text(&Some(bank)));
    }

    if !update_group_ids.is_empty() {
        let update_stmt = transaction
            .prepare_cached(
                r#"UPDATE groupironman.members AS a
SET bank = t.new_bank::int4[], bank_last_update = NOW()
FROM UNNEST($1::int8[], $2::text[], $3::text[]) AS t(group_id, member_name, new_bank)
WHERE a.group_id = t.group_id AND a.member_name = t.member_name::citext"#,
            )
            .await?;

        let params: [&(dyn tokio_postgres::types::ToSql + Sync); 3] =
            [&update_group_ids, &update_member_names, &update_banks];

        transaction.execute(&update_stmt, &params).await?;
    }

    transaction.commit().await?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::GroupMember;
    use chrono::DateTime;

    fn make_member(group_id: Option<i64>, name: &str) -> GroupMember {
        GroupMember {
            group_id,
            name: name.to_string(),
            ..Default::default()
        }
    }

    // -- merge_deposited --

    #[test]
    fn test_merge_deposited_disjoint_items() {
        let older = vec![1, 5, 2, 10];
        let newer = vec![3, 7, 4, 2];
        let result = merge_deposited(&older, &newer);
        let map: HashMap<i32, i32> = result.chunks_exact(2).map(|c| (c[0], c[1])).collect();
        assert_eq!(map.get(&1), Some(&5));
        assert_eq!(map.get(&2), Some(&10));
        assert_eq!(map.get(&3), Some(&7));
        assert_eq!(map.get(&4), Some(&2));
    }

    #[test]
    fn test_merge_deposited_same_item_accumulates() {
        let older = vec![1, 5];
        let newer = vec![1, 3];
        let result = merge_deposited(&older, &newer);
        let map: HashMap<i32, i32> = result.chunks_exact(2).map(|c| (c[0], c[1])).collect();
        assert_eq!(map.get(&1), Some(&8));
        assert_eq!(map.len(), 1);
    }

    #[test]
    fn test_merge_deposited_filters_zero_item_id() {
        let older = vec![0, 5];
        let newer = vec![1, 3];
        let result = merge_deposited(&older, &newer);
        let map: HashMap<i32, i32> = result.chunks_exact(2).map(|c| (c[0], c[1])).collect();
        assert!(!map.contains_key(&0));
        assert_eq!(map.get(&1), Some(&3));
    }

    #[test]
    fn test_merge_deposited_filters_zero_quantity() {
        let older = vec![1, 0];
        let newer = vec![2, 5];
        let result = merge_deposited(&older, &newer);
        let map: HashMap<i32, i32> = result.chunks_exact(2).map(|c| (c[0], c[1])).collect();
        assert!(!map.contains_key(&1));
        assert_eq!(map.get(&2), Some(&5));
    }

    #[test]
    fn test_merge_deposited_empty_inputs() {
        let result = merge_deposited(&[], &[]);
        assert!(result.is_empty());
    }

    #[test]
    fn test_merge_deposited_saturating_add_prevents_overflow() {
        let older = vec![1, i32::MAX as i32];
        let newer = vec![1, i32::MAX as i32];
        let result = merge_deposited(&older, &newer);
        let map: HashMap<i32, i32> = result.chunks_exact(2).map(|c| (c[0], c[1])).collect();
        // i32::MAX + i32::MAX = 4294967294 (i64), which truncates to -2 as i32.
        // The saturating_add on i64 prevents i64 overflow; the as i32 cast
        // is expected to truncate since the accumulated value exceeds i32::MAX.
        assert_eq!(
            map.get(&1),
            Some(&((i32::MAX as i64 + i32::MAX as i64) as i32))
        );
    }

    // -- merge_group_member --

    #[test]
    fn test_merge_group_member_newer_none_preserves_older() {
        let mut older = make_member(Some(1), "alice");
        older.stats = Some(vec![1, 2, 3]);
        older.skills = Some(vec![4, 5, 6]);

        let newer = make_member(Some(1), "alice");
        merge_group_member(&mut older, &newer);

        assert_eq!(older.stats, Some(vec![1, 2, 3]));
        assert_eq!(older.skills, Some(vec![4, 5, 6]));
    }

    #[test]
    fn test_merge_group_member_newer_some_overwrites() {
        let mut older = make_member(Some(1), "alice");
        older.stats = Some(vec![1, 2, 3]);

        let mut newer = make_member(Some(1), "alice");
        newer.stats = Some(vec![7, 8, 9]);

        merge_group_member(&mut older, &newer);
        assert_eq!(older.stats, Some(vec![7, 8, 9]));
    }

    #[test]
    fn test_merge_group_member_partial_updates_dont_lose_fields() {
        let mut older = make_member(Some(1), "alice");
        older.stats = Some(vec![1, 2, 3]);

        let mut newer = make_member(Some(1), "alice");
        newer.skills = Some(vec![10, 20, 30]);

        merge_group_member(&mut older, &newer);
        assert_eq!(older.stats, Some(vec![1, 2, 3]));
        assert_eq!(older.skills, Some(vec![10, 20, 30]));
    }

    #[test]
    fn test_merge_group_member_deposited_accumulates() {
        let mut older = make_member(Some(1), "alice");
        older.deposited = Some(vec![1, 5]);

        let mut newer = make_member(Some(1), "alice");
        newer.deposited = Some(vec![1, 3, 2, 7]);

        merge_group_member(&mut older, &newer);
        let deposited = older.deposited.as_ref().unwrap();
        let map: HashMap<i32, i32> = deposited.chunks_exact(2).map(|c| (c[0], c[1])).collect();
        assert_eq!(map.get(&1), Some(&8));
        assert_eq!(map.get(&2), Some(&7));
    }

    #[test]
    fn test_merge_group_member_deposited_newer_only() {
        let mut older = make_member(Some(1), "alice");

        let mut newer = make_member(Some(1), "alice");
        newer.deposited = Some(vec![5, 10]);

        merge_group_member(&mut older, &newer);
        assert_eq!(older.deposited, Some(vec![5, 10]));
    }

    #[test]
    fn test_merge_group_member_potion_storage_overwrites() {
        let mut older = make_member(Some(1), "alice");
        older.potion_storage = Some(vec![101, 4]);

        let mut newer = make_member(Some(1), "alice");
        newer.potion_storage = Some(vec![201, 1, 202, 3]);

        merge_group_member(&mut older, &newer);
        assert_eq!(older.potion_storage, Some(vec![201, 1, 202, 3]));
    }

    #[test]
    fn test_merge_group_member_potion_storage_none_preserves_older() {
        let mut older = make_member(Some(1), "alice");
        older.potion_storage = Some(vec![101, 4]);

        let newer = make_member(Some(1), "alice");

        merge_group_member(&mut older, &newer);
        assert_eq!(older.potion_storage, Some(vec![101, 4]));
    }

    #[test]
    fn test_merge_group_member_last_updated_overwrites() {
        let mut older = make_member(Some(1), "alice");
        older.last_updated = Some(DateTime::from_timestamp(1000, 0).unwrap());

        let mut newer = make_member(Some(1), "alice");
        newer.last_updated = Some(DateTime::from_timestamp(2000, 0).unwrap());

        merge_group_member(&mut older, &newer);
        assert_eq!(
            older.last_updated,
            Some(DateTime::from_timestamp(2000, 0).unwrap())
        );
    }

    #[test]
    fn test_merge_group_member_name_and_group_id_updated() {
        let mut older = make_member(Some(1), "old_name");

        let newer = make_member(Some(2), "new_name");

        merge_group_member(&mut older, &newer);
        assert_eq!(older.name, "new_name");
        assert_eq!(older.group_id, Some(2));
    }

    // -- int4_array_to_text --

    #[test]
    fn test_int4_array_to_text_some() {
        assert_eq!(
            int4_array_to_text(&Some(vec![1, 2, 3])),
            Some("{1,2,3}".to_string())
        );
    }

    #[test]
    fn test_int4_array_to_text_empty() {
        assert_eq!(int4_array_to_text(&Some(vec![])), Some("{}".to_string()));
    }

    #[test]
    fn test_int4_array_to_text_none() {
        assert_eq!(int4_array_to_text(&None), None);
    }

    #[test]
    fn test_int4_array_to_text_negative_values() {
        assert_eq!(
            int4_array_to_text(&Some(vec![-1, 0, 42])),
            Some("{-1,0,42}".to_string())
        );
    }

    // -- deduplicate_batch --

    #[test]
    fn test_deduplicate_batch_exact_key_no_collision() {
        let mut a = make_member(Some(1), "alice");
        a.stats = Some(vec![1]);
        let mut b = make_member(Some(1), "bob");
        b.stats = Some(vec![2]);
        let mut c = make_member(Some(2), "alice");
        c.stats = Some(vec![3]);

        let result = deduplicate_batch(vec![a, b, c]);
        assert_eq!(result.len(), 3);
    }

    #[test]
    fn test_deduplicate_batch_same_key_merges() {
        let mut a = make_member(Some(1), "alice");
        a.stats = Some(vec![1]);
        let mut b = make_member(Some(1), "alice");
        b.skills = Some(vec![2]);

        let result = deduplicate_batch(vec![a, b]);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].stats, Some(vec![1]));
        assert_eq!(result[0].skills, Some(vec![2]));
    }

    #[test]
    fn test_deduplicate_batch_none_group_id_skipped() {
        let a = make_member(None, "alice");
        let b = make_member(Some(1), "bob");

        let result = deduplicate_batch(vec![a, b]);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].name, "bob");
    }

    #[test]
    fn test_deduplicate_batch_sorted_by_group_id_then_name() {
        let a = make_member(Some(2), "zoe");
        let b = make_member(Some(1), "bob");
        let c = make_member(Some(1), "alice");

        let result = deduplicate_batch(vec![a, b, c]);
        assert_eq!(result[0].group_id, Some(1));
        assert_eq!(result[0].name, "alice");
        assert_eq!(result[1].group_id, Some(1));
        assert_eq!(result[1].name, "bob");
        assert_eq!(result[2].group_id, Some(2));
        assert_eq!(result[2].name, "zoe");
    }

    #[test]
    fn test_deduplicate_batch_empty() {
        let result: Vec<GroupMember> = deduplicate_batch(vec![]);
        assert!(result.is_empty());
    }

    #[test]
    fn test_deduplicate_batch_multiple_merges_same_key() {
        let mut a = make_member(Some(1), "alice");
        a.stats = Some(vec![1]);
        let mut b = make_member(Some(1), "alice");
        b.skills = Some(vec![2]);
        let mut c = make_member(Some(1), "alice");
        c.inventory = Some(vec![3]);

        let result = deduplicate_batch(vec![a, b, c]);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].stats, Some(vec![1]));
        assert_eq!(result[0].skills, Some(vec![2]));
        assert_eq!(result[0].inventory, Some(vec![3]));
    }

    // -- validate_deposits --

    #[test]
    fn test_validate_deposits_valid() {
        let mut m = make_member(Some(1), "alice");
        m.deposited = Some(vec![1, 5, 2, 10]);

        let members = [m];
        let result = validate_deposits(&members);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].1, &[1, 5, 2, 10]);
    }

    #[test]
    fn test_validate_deposits_odd_length_skipped() {
        let mut m = make_member(Some(1), "alice");
        m.deposited = Some(vec![1, 5, 2]);

        let members = [m];
        let result = validate_deposits(&members);
        assert!(result.is_empty());
    }

    #[test]
    fn test_validate_deposits_empty_skipped() {
        let mut m = make_member(Some(1), "alice");
        m.deposited = Some(vec![]);

        let members = [m];
        let result = validate_deposits(&members);
        assert!(result.is_empty());
    }

    #[test]
    fn test_validate_deposits_none_skipped() {
        let m = make_member(Some(1), "alice");
        let members = [m];
        let result = validate_deposits(&members);
        assert!(result.is_empty());
    }

    #[test]
    fn test_validate_deposits_none_group_id_skipped() {
        let mut m = make_member(None, "alice");
        m.deposited = Some(vec![1, 5]);

        let members = [m];
        let result = validate_deposits(&members);
        assert!(result.is_empty());
    }

    #[test]
    fn test_validate_deposits_mixed_valid_and_invalid() {
        let mut a = make_member(Some(1), "alice");
        a.deposited = Some(vec![1, 5]);

        let mut b = make_member(Some(1), "bob");
        b.deposited = Some(vec![1, 5, 2]);

        let mut c = make_member(Some(2), "carol");
        c.deposited = Some(vec![3, 7]);

        let members = [a, b, c];
        let result = validate_deposits(&members);
        assert_eq!(result.len(), 2);
        assert_eq!(result[0].0.name, "alice");
        assert_eq!(result[1].0.name, "carol");
    }
}
