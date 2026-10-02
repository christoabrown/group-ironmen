use crate::models::GroupMember;
use deadpool_postgres::Pool;
use futures_util::stream::{self, StreamExt};
use std::collections::HashMap;
use std::sync::OnceLock;
use tokio::sync::mpsc;
use tokio::time::{self, Duration, Instant};

static BATCH_SIZE: usize = 5000;
static CHUNK_SIZE: usize = 50;

/// A `<column>_last_update` means "when the map stored a new value": it is set
/// to NOW() only when a supplied value differs from the stored one. The site
/// polls for changes since a time, so resending unchanged data costs nothing.
/// Whether a player is online is tracked separately (`hub_online`).
///
/// The member columns the batcher writes; each has a `<column>_last_update`.
const COLUMNS: [(&str, &str); 6] = [
    ("stats", "int4[]"),
    ("coordinates", "int4[]"),
    ("skills", "int4[]"),
    ("inventory", "int4[]"),
    ("equipment", "int4[]"),
    ("hub_meta", "jsonb"),
];

/// Parameters per member update row: the group, the name and the columns.
/// With 8, the PostgreSQL parameter-count limit (65,535) allows a chunk of
/// 8191 rows with the VALUES approach.
const COLUMNS_PER_ROW: usize = 2 + COLUMNS.len();

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
    if newer.inventory.is_some() {
        older.inventory = newer.inventory.clone();
    }
    if newer.equipment.is_some() {
        older.equipment = newer.equipment.clone();
    }
    if newer.meta.is_some() {
        older.meta = newer.meta.clone();
    }

    older.name = newer.name.clone();
    older.group_id = newer.group_id;
}

static VALUES_STATEMENTS: OnceLock<HashMap<usize, String>> = OnceLock::new();

fn build_values_statement(size: usize) -> String {
    let values = (0..size)
        .map(|row| {
            let offset = row * COLUMNS_PER_ROW;
            let columns: Vec<String> = COLUMNS
                .iter()
                .enumerate()
                .map(|(i, (_, sql_type))| format!("${}::{}", offset + 3 + i, sql_type))
                .collect();
            format!(
                "(${}::int8,${}::text,{})",
                offset + 1,
                offset + 2,
                columns.join(",")
            )
        })
        .collect::<Vec<_>>()
        .join(",");

    let assignments = COLUMNS
        .iter()
        .map(|(column, _)| {
            format!(
                "  {column} = COALESCE(b.{column}, a.{column}),\n  \
                 {column}_last_update = CASE WHEN b.{column} IS NOT NULL \
                 AND b.{column} IS DISTINCT FROM a.{column} THEN NOW() \
                 ELSE a.{column}_last_update END"
            )
        })
        .collect::<Vec<_>>()
        .join(",\n");
    let column_names = COLUMNS
        .iter()
        .map(|(column, _)| *column)
        .collect::<Vec<_>>()
        .join(", ");

    format!(
        r#"
UPDATE groupironman.members AS a SET
{assignments}
FROM (VALUES {values}) AS b(group_id, member_name, {column_names})
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

    let client = match pool.get().await {
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

    let mut params: Vec<&(dyn tokio_postgres::types::ToSql + Sync)> =
        Vec::with_capacity(COLUMNS_PER_ROW * chunk_size);
    for member_data in buffer {
        params.push(&member_data.group_id);
        params.push(&member_data.name);
        params.push(&member_data.stats);
        params.push(&member_data.coordinates);
        params.push(&member_data.skills);
        params.push(&member_data.inventory);
        params.push(&member_data.equipment);
        params.push(&member_data.meta);
    }

    if let Err(e) = client.execute(&update_stmt, &params).await {
        log::error!("bulk update failed: chunk_size={} error={}", chunk_size, e);
    }

    Some(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::GroupMember;

    fn make_member(group_id: Option<i64>, name: &str) -> GroupMember {
        GroupMember {
            group_id,
            name: name.to_string(),
            ..Default::default()
        }
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
    fn test_merge_group_member_name_and_group_id_updated() {
        let mut older = make_member(Some(1), "old_name");

        let newer = make_member(Some(2), "new_name");

        merge_group_member(&mut older, &newer);
        assert_eq!(older.name, "new_name");
        assert_eq!(older.group_id, Some(2));
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
}
