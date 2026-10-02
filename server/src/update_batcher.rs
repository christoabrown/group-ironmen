use crate::db::MEMBER_COLUMNS as COLUMNS;
use crate::models::MemberData;
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
/// Parameters per member update row: the name and the columns. With 7, the
/// PostgreSQL parameter-count limit (65,535) allows a chunk of 9362 rows with
/// the VALUES approach.
const COLUMNS_PER_ROW: usize = 1 + COLUMNS.len();

pub async fn background_worker(
    pool: Pool,
    mut rx: mpsc::Receiver<MemberData>,
    notify: Option<mpsc::Sender<()>>,
) {
    let batch_timeout = Duration::from_millis(50);

    loop {
        let mut buffer: Vec<MemberData> = Vec::with_capacity(BATCH_SIZE);

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
        let mut chunks: Vec<Vec<MemberData>> = Vec::new();
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

/// One update per member, in the order of their names: updates for the same
/// member are merged, a later one's fields over an earlier one's.
fn deduplicate_batch(buffer: Vec<MemberData>) -> Vec<MemberData> {
    let mut by_name: HashMap<String, MemberData> = HashMap::new();
    for update in buffer {
        match by_name.get_mut(&update.name) {
            Some(earlier) => merge_update(earlier, update),
            None => {
                by_name.insert(update.name.clone(), update);
            }
        }
    }

    let mut updates: Vec<MemberData> = by_name.into_values().collect();
    updates.sort_by(|a, b| a.name.cmp(&b.name));
    updates
}

/// Puts what a later update has over what an earlier one has; what it leaves
/// out stays as it was.
fn merge_update(earlier: &mut MemberData, later: MemberData) {
    if later.stats.is_some() {
        earlier.stats = later.stats;
    }
    if later.coordinates.is_some() {
        earlier.coordinates = later.coordinates;
    }
    if later.skills.is_some() {
        earlier.skills = later.skills;
    }
    if later.inventory.is_some() {
        earlier.inventory = later.inventory;
    }
    if later.equipment.is_some() {
        earlier.equipment = later.equipment;
    }
    if later.meta.is_some() {
        earlier.meta = later.meta;
    }
}

static VALUES_STATEMENTS: OnceLock<HashMap<usize, String>> = OnceLock::new();

fn build_values_statement(size: usize) -> String {
    let values = (0..size)
        .map(|row| {
            let offset = row * COLUMNS_PER_ROW;
            let columns: Vec<String> = COLUMNS
                .iter()
                .enumerate()
                .map(|(i, (_, sql_type))| format!("${}::{}", offset + 2 + i, sql_type))
                .collect();
            format!("(${}::text,{})", offset + 1, columns.join(","))
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
UPDATE guildmap.members AS a SET
{assignments}
FROM (VALUES {values}) AS b(member_name, {column_names})
WHERE a.member_name = b.member_name::citext
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

async fn process_chunk(pool: &Pool, chunk: Vec<MemberData>) -> Option<()> {
    let chunk_size = chunk.len();
    let buffer: &[MemberData] = &chunk;

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
    // The columns in the order of `MEMBER_COLUMNS`.
    for member_data in buffer {
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

    fn update(name: &str) -> MemberData {
        MemberData {
            name: name.to_string(),
            ..Default::default()
        }
    }

    #[test]
    fn a_later_update_leaves_what_it_does_not_have() {
        let mut earlier = update("alice");
        earlier.stats = Some(vec![1, 2, 3]);
        earlier.skills = Some(vec![4, 5, 6]);

        merge_update(&mut earlier, update("alice"));
        assert_eq!(earlier.stats, Some(vec![1, 2, 3]));
        assert_eq!(earlier.skills, Some(vec![4, 5, 6]));
    }

    #[test]
    fn a_later_update_goes_over_an_earlier_one() {
        let mut earlier = update("alice");
        earlier.stats = Some(vec![1, 2, 3]);
        let mut later = update("alice");
        later.stats = Some(vec![7, 8, 9]);
        later.skills = Some(vec![10, 20, 30]);

        merge_update(&mut earlier, later);
        assert_eq!(earlier.stats, Some(vec![7, 8, 9]));
        assert_eq!(earlier.skills, Some(vec![10, 20, 30]));
    }

    #[test]
    fn updates_for_one_member_become_one() {
        let mut a = update("alice");
        a.stats = Some(vec![1]);
        let mut b = update("alice");
        b.skills = Some(vec![2]);
        let mut c = update("alice");
        c.inventory = Some(vec![3]);

        let result = deduplicate_batch(vec![a, b, c]);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].stats, Some(vec![1]));
        assert_eq!(result[0].skills, Some(vec![2]));
        assert_eq!(result[0].inventory, Some(vec![3]));
    }

    #[test]
    fn a_batch_is_in_the_order_of_the_names() {
        let result = deduplicate_batch(vec![update("zoe"), update("bob"), update("alice")]);
        let names: Vec<&str> = result.iter().map(|member| member.name.as_str()).collect();
        assert_eq!(names, ["alice", "bob", "zoe"]);
        assert!(deduplicate_batch(vec![]).is_empty());
    }

    #[test]
    fn a_statement_has_a_name_and_every_column_per_row() {
        let statement = build_values_statement(2);
        assert!(statement.contains("($1::text,$2::int4[],"), "{statement}");
        assert!(
            statement.contains(",$7::jsonb),($8::text,$9::int4[],"),
            "{statement}"
        );
        assert!(statement.contains("$14::jsonb)"), "{statement}");
        assert!(!statement.contains("$15"), "{statement}");
    }
}
