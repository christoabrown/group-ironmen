mod common;

use common::{create_test_pool, fresh_database, store, TEST_MUTEX};
use deadpool_postgres::{Object, Pool};

use server::db;
use server::models::GroupMember;
use server::update_batcher;

/// A clean schema and the group, with three members. Returns the group's id.
async fn setup_test_group(pool: &Pool) -> i64 {
    let group_id = fresh_database(pool).await;
    let client = pool.get().await.expect("failed to get client");
    for name in ["alice", "bob", "carol"] {
        db::ensure_member_exists(&client, group_id, name)
            .await
            .expect("failed to create member");
    }

    group_id
}

fn make_member(group_id: Option<i64>, name: &str) -> GroupMember {
    GroupMember {
        group_id,
        name: name.to_string(),
        ..Default::default()
    }
}

/// Fetch a specific member's data using the server's db::get_group_data function.
/// Uses epoch as the cutoff timestamp so all fields with non-null timestamps are included.
async fn get_member_from_db(client: &Object, group_id: i64, name: &str) -> GroupMember {
    let epoch = chrono::DateTime::from_timestamp(0, 0).unwrap();
    let members = db::get_group_data(client, group_id, &epoch)
        .await
        .expect("failed to get group data")
        .members;
    members
        .into_iter()
        .find(|m| m.name == name)
        .unwrap_or_else(|| panic!("member '{}' not found in group {}", name, group_id))
}

/// Spawn a background worker for testing and return the sender and notification receiver.
fn spawn_worker(
    pool: &Pool,
) -> (
    tokio::sync::mpsc::Sender<GroupMember>,
    tokio::sync::mpsc::Receiver<()>,
) {
    let (tx, rx) = tokio::sync::mpsc::channel::<GroupMember>(10000);
    let (notify_tx, notify_rx) = tokio::sync::mpsc::channel::<()>(16);
    let worker_pool = pool.clone();
    tokio::spawn(async move {
        update_batcher::background_worker(worker_pool, rx, Some(notify_tx)).await;
    });
    (tx, notify_rx)
}

#[tokio::test]
async fn test_concurrent_updates_same_member_no_lost_fields() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    let group_id = setup_test_group(&pool).await;

    // Send two partial updates for the same member in the same batch
    let mut update1 = make_member(Some(group_id), "alice");
    update1.stats = Some(vec![1, 2, 3, 4, 5, 6, 7]);

    let mut update2 = make_member(Some(group_id), "alice");
    update2.skills = Some(vec![
        10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200,
        210, 220, 230, 240,
    ]);

    store(&pool, vec![update1, update2]).await;

    // Verify both fields are present (no lost update)
    let client = pool.get().await.expect("failed to get client");
    let alice = get_member_from_db(&client, group_id, "alice").await;
    assert_eq!(alice.stats, Some(vec![1, 2, 3, 4, 5, 6, 7]));
    assert!(alice.skills.is_some(), "skills should not be lost");
}

#[tokio::test]
async fn test_concurrent_updates_different_members() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    let group_id = setup_test_group(&pool).await;

    // Send updates for different members
    let mut alice = make_member(Some(group_id), "alice");
    alice.stats = Some(vec![1, 1, 1, 1, 1, 1, 1]);

    let mut bob = make_member(Some(group_id), "bob");
    bob.stats = Some(vec![2, 2, 2, 2, 2, 2, 2]);

    let mut carol = make_member(Some(group_id), "carol");
    carol.stats = Some(vec![3, 3, 3, 3, 3, 3, 3]);

    store(&pool, vec![alice, bob, carol]).await;

    let client = pool.get().await.expect("failed to get client");
    assert_eq!(
        get_member_from_db(&client, group_id, "alice").await.stats,
        Some(vec![1, 1, 1, 1, 1, 1, 1])
    );
    assert_eq!(
        get_member_from_db(&client, group_id, "bob").await.stats,
        Some(vec![2, 2, 2, 2, 2, 2, 2])
    );
    assert_eq!(
        get_member_from_db(&client, group_id, "carol").await.stats,
        Some(vec![3, 3, 3, 3, 3, 3, 3])
    );
}

// ──────────────────────────────────────────────────────────────────────────
// Integration tests: every field, stored and read back
// ──────────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn test_all_field_types_round_trip() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    let group_id = setup_test_group(&pool).await;

    let (tx, mut notify_rx) = spawn_worker(&pool);

    let mut alice = make_member(Some(group_id), "alice");
    alice.stats = Some(vec![1, 2, 3, 4, 5, 6, 7]);
    alice.coordinates = Some(vec![100, 200, 0]);
    alice.skills = Some(vec![10; 24]);
    alice.inventory = Some(vec![42; 56]);
    alice.equipment = Some(vec![99; 28]);

    tx.send(alice).await.unwrap();
    notify_rx.recv().await.expect("worker should process batch");

    let client = pool.get().await.expect("failed to get client");
    let alice = get_member_from_db(&client, group_id, "alice").await;

    assert_eq!(alice.stats, Some(vec![1, 2, 3, 4, 5, 6, 7]));
    assert_eq!(alice.coordinates, Some(vec![100, 200, 0]));
    assert_eq!(alice.skills, Some(vec![10; 24]));
    assert_eq!(alice.inventory, Some(vec![42; 56]));
    assert_eq!(alice.equipment, Some(vec![99; 28]));

    drop(tx);
}

// ──────────────────────────────────────────────────────────────────────────
// Integration tests: multiple sequential batches
// ──────────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn test_multiple_sequential_batches() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    let group_id = setup_test_group(&pool).await;

    let (tx, mut notify_rx) = spawn_worker(&pool);

    // Batch 1: set stats
    let mut alice = make_member(Some(group_id), "alice");
    alice.stats = Some(vec![1, 2, 3, 4, 5, 6, 7]);
    tx.send(alice).await.unwrap();
    notify_rx
        .recv()
        .await
        .expect("worker should process batch 1");

    // Batch 2: set skills (stats should persist)
    let mut alice2 = make_member(Some(group_id), "alice");
    alice2.skills = Some(vec![10; 24]);
    tx.send(alice2).await.unwrap();
    notify_rx
        .recv()
        .await
        .expect("worker should process batch 2");

    let client = pool.get().await.expect("failed to get client");
    let alice = get_member_from_db(&client, group_id, "alice").await;
    assert_eq!(
        alice.stats,
        Some(vec![1, 2, 3, 4, 5, 6, 7]),
        "stats from batch 1 should persist"
    );
    assert_eq!(
        alice.skills,
        Some(vec![10; 24]),
        "skills from batch 2 should be set"
    );

    drop(tx);
}

// ──────────────────────────────────────────────────────────────────────────
// Integration tests: more updates than fit one statement
// ──────────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn test_batch_exceeding_chunk_size() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    let group_id = setup_test_group(&pool).await;

    // Create extra members so we can send >50 updates in one batch.
    // setup_test_group creates alice, bob, carol = 3 rows.
    // We send 55 updates: 3 named members + 52 extra (extra0..extra51).
    let client = pool.get().await.expect("failed to get client");
    for i in 0..52u32 {
        let name = format!("extra{}", i);
        let create_stmt = client
            .prepare_cached(
                "INSERT INTO groupironman.members (group_id, member_name) VALUES ($1, $2)",
            )
            .await
            .expect("failed to prepare insert");
        client
            .execute(&create_stmt, &[&group_id, &name])
            .await
            .expect("failed to insert extra member");
    }

    // Send 55 updates (exceeds CHUNK_SIZE of 50)
    let mut updates = Vec::new();
    for i in 0..55u32 {
        let name = if i < 3 {
            ["alice", "bob", "carol"][i as usize].to_string()
        } else {
            format!("extra{}", i - 3)
        };
        let mut m = make_member(Some(group_id), &name);
        m.stats = Some(vec![i as i32; 7]);
        updates.push(m);
    }
    store(&pool, updates).await;

    let client = pool.get().await.expect("failed to get client");

    // Verify a sample of members from both sides of the chunk boundary
    for i in [0usize, 25, 49, 54] {
        let name = if i < 3 {
            ["alice", "bob", "carol"][i].to_string()
        } else {
            format!("extra{}", i - 3)
        };
        let member = get_member_from_db(&client, group_id, &name).await;
        assert_eq!(
            member.stats,
            Some(vec![i as i32; 7]),
            "member {} (index {}) should have correct stats",
            name,
            i
        );
    }
}

// ──────────────────────────────────────────────────────────────────────────
// Integration tests: updates that change nothing
// ──────────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn test_non_member_update_is_silent_noop() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    let group_id = setup_test_group(&pool).await;

    // Send an update for a real member and a non-member in the same batch
    let mut alice = make_member(Some(group_id), "alice");
    alice.stats = Some(vec![1, 2, 3, 4, 5, 6, 7]);

    let mut ghost = make_member(Some(group_id), "ghost");
    ghost.stats = Some(vec![9, 9, 9, 9, 9, 9, 9]);

    // Batch should process without error
    store(&pool, vec![alice, ghost]).await;

    let client = pool.get().await.expect("failed to get client");

    // Alice's update should be applied
    let alice = get_member_from_db(&client, group_id, "alice").await;
    assert_eq!(alice.stats, Some(vec![1, 2, 3, 4, 5, 6, 7]));

    // "ghost" should not exist in the database — the UPDATE WHERE clause
    // silently matched no rows
    let epoch = chrono::DateTime::from_timestamp(0, 0).unwrap();
    let members = db::get_group_data(&client, group_id, &epoch)
        .await
        .expect("failed to get group data")
        .roster;
    assert!(
        !members.iter().any(|m| m.name == "ghost"),
        "non-member 'ghost' should not appear in group data"
    );
}

#[tokio::test]
async fn test_resending_unchanged_value_keeps_timestamp() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    let group_id = setup_test_group(&pool).await;

    let (tx, mut notify_rx) = spawn_worker(&pool);

    let mut alice1 = make_member(Some(group_id), "alice");
    alice1.stats = Some(vec![10, 10, 5, 5, 0, 0, 301]);

    tx.send(alice1).await.unwrap();
    notify_rx
        .recv()
        .await
        .expect("worker should process batch 1");

    let client = pool.get().await.expect("failed to get client");
    let alice_after_1 = get_member_from_db(&client, group_id, "alice").await;
    let ts1 = alice_after_1.last_updated.unwrap();

    let mut alice2 = make_member(Some(group_id), "alice");
    alice2.stats = Some(vec![10, 10, 5, 5, 0, 0, 301]);

    tx.send(alice2).await.unwrap();
    notify_rx
        .recv()
        .await
        .expect("worker should process batch 2");

    let alice_after_2 = get_member_from_db(&client, group_id, "alice").await;
    let ts2 = alice_after_2.last_updated.unwrap();

    // The site polls for changes since a time; resent unchanged data must
    // not look like a change.
    assert_eq!(
        ts2, ts1,
        "timestamp should stay when an identical value is resent"
    );
    assert_eq!(alice_after_2.stats, Some(vec![10, 10, 5, 5, 0, 0, 301]));

    drop(tx);
}
