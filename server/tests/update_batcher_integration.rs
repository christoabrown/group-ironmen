use deadpool_postgres::{ManagerConfig, Object, Pool, RecyclingMethod};
use std::env;
use tokio_postgres::NoTls;

use server::config::Config;
use server::db;
use server::models::{CreateGroup, GroupMember, SHARED_MEMBER};
use server::update_batcher;

/// Serializes integration tests since they all share the same database
/// and each test drops/recreates the schema.
static TEST_MUTEX: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

/// Create a connection pool for the test database.
///
/// By default, reads connection parameters from `config.toml` (same file
/// the server uses) but overrides the database name to `group_ironmen_test`.
///
/// To use a completely custom connection string, set the `TEST_DATABASE_URL`
/// environment variable:
///
///   TEST_DATABASE_URL="postgres://postgres:password@localhost:5432/group_ironmen_test"
///
/// Integration tests require a running PostgreSQL instance with a
/// `group_ironmen_test` database. Run them with:
///
///   cargo test
async fn create_test_pool() -> Pool {
    let mut cfg = if let Ok(url) = env::var("TEST_DATABASE_URL") {
        let mut c = deadpool_postgres::Config::new();
        c.url = Some(url);
        c
    } else {
        let config = Config::from_env().expect("failed to read config.toml");
        let mut pg = config.pg.clone();
        pg.dbname = Some("group_ironmen_test".to_string());
        pg
    };

    cfg.manager = Some(ManagerConfig {
        recycling_method: RecyclingMethod::Fast,
    });

    cfg.create_pool(None, NoTls)
        .expect("failed to create test pool")
}

/// Set up a clean schema and a test group with members.
/// Returns (pool, group_id).
async fn setup_test_group(pool: &Pool) -> i64 {
    let mut client = pool.get().await.expect("failed to get client");

    // Drop and recreate schema for a clean slate
    client
        .execute("DROP SCHEMA IF EXISTS groupironman CASCADE", &[])
        .await
        .expect("failed to drop schema");
    client
        .execute("CREATE SCHEMA IF NOT EXISTS groupironman", &[])
        .await
        .expect("failed to create schema");

    // Create the groups table (normally created by schema.sql in production)
    client
        .execute(
            r#"CREATE TABLE groupironman.groups(
                group_id BIGSERIAL UNIQUE,
                group_name TEXT NOT NULL,
                group_token_hash CHAR(64) NOT NULL,
                PRIMARY KEY (group_name, group_token_hash)
            )"#,
            &[],
        )
        .await
        .expect("failed to create groups table");

    // Run schema migrations
    db::update_schema(&mut client)
        .await
        .expect("failed to update schema");

    // Create a test group with members using the server's own create_group
    // function (also creates the SHARED_MEMBER row automatically)
    let create_group = CreateGroup {
        name: "test_group".to_string(),
        member_names: vec!["alice".to_string(), "bob".to_string(), "carol".to_string()],
        captcha_response: String::new(),
        token: "test_token".to_string(),
    };
    db::create_group(&mut client, &create_group)
        .await
        .expect("failed to create test group");
    let group_id = db::get_group(&client, "test_group", "test_token")
        .await
        .expect("failed to get test group id");

    group_id
}

fn make_member(group_id: Option<i64>, name: &str) -> GroupMember {
    GroupMember {
        group_id,
        name: name.to_string(),
        stats: None,
        coordinates: None,
        skills: None,
        quests: None,
        inventory: None,
        equipment: None,
        bank: None,
        shared_bank: None,
        rune_pouch: None,
        interacting: None,
        seed_vault: None,
        deposited: None,
        diary_vars: None,
        collection_log_v2: None,
        potion_storage: None,
        last_updated: None,
    }
}

/// Fetch a specific member's data using the server's db::get_group_data function.
/// Uses epoch as the cutoff timestamp so all fields with non-null timestamps are included.
async fn get_member_from_db(client: &Object, group_id: i64, name: &str) -> GroupMember {
    let epoch = chrono::DateTime::from_timestamp(0, 0).unwrap();
    let members = db::get_group_data(client, group_id, &epoch)
        .await
        .expect("failed to get group data");
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

/// Convert a flat bank array to a map of item_id → quantity.
fn bank_to_map(bank: Vec<i32>) -> std::collections::HashMap<i32, i32> {
    bank.chunks_exact(2).map(|c| (c[0], c[1])).collect()
}

// ──────────────────────────────────────────────────────────────────────────
// Integration tests: concurrent updates to the same member
// ──────────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn test_concurrent_updates_same_member_no_lost_fields() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    let group_id = setup_test_group(&pool).await;

    let (tx, mut notify_rx) = spawn_worker(&pool);

    // Send two partial updates for the same member in the same batch
    let mut update1 = make_member(Some(group_id), "alice");
    update1.stats = Some(vec![1, 2, 3, 4, 5, 6, 7]);

    let mut update2 = make_member(Some(group_id), "alice");
    update2.skills = Some(vec![
        10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200,
        210, 220, 230, 240,
    ]);

    tx.send(update1).await.expect("failed to send update1");
    tx.send(update2).await.expect("failed to send update2");

    // Wait for the batch to process
    notify_rx.recv().await.expect("worker should process batch");

    // Verify both fields are present (no lost update)
    let client = pool.get().await.expect("failed to get client");
    let alice = get_member_from_db(&client, group_id, "alice").await;
    assert_eq!(alice.stats, Some(vec![1, 2, 3, 4, 5, 6, 7]));
    assert!(alice.skills.is_some(), "skills should not be lost");

    drop(tx);
}

#[tokio::test]
async fn test_concurrent_updates_different_members() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    let group_id = setup_test_group(&pool).await;

    let (tx, mut notify_rx) = spawn_worker(&pool);

    // Send updates for different members
    let mut alice = make_member(Some(group_id), "alice");
    alice.stats = Some(vec![1, 1, 1, 1, 1, 1, 1]);

    let mut bob = make_member(Some(group_id), "bob");
    bob.stats = Some(vec![2, 2, 2, 2, 2, 2, 2]);

    let mut carol = make_member(Some(group_id), "carol");
    carol.stats = Some(vec![3, 3, 3, 3, 3, 3, 3]);

    tx.send(alice).await.unwrap();
    tx.send(bob).await.unwrap();
    tx.send(carol).await.unwrap();

    notify_rx.recv().await.expect("worker should process batch");

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

    drop(tx);
}

// ──────────────────────────────────────────────────────────────────────────
// Integration tests: concurrent deposits
// ──────────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn test_concurrent_deposits_accumulate_correctly() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    let group_id = setup_test_group(&pool).await;

    // Set initial bank for alice
    let client = pool.get().await.expect("failed to get client");
    client
        .execute(
            "UPDATE groupironman.members SET bank = ARRAY[10, 5]::int4[] WHERE group_id=$1 AND member_name=$2",
            &[&group_id, &"alice"],
        )
        .await
        .expect("failed to set initial bank");

    let (tx, mut notify_rx) = spawn_worker(&pool);

    // Send two deposit updates for alice in the same batch
    let mut deposit1 = make_member(Some(group_id), "alice");
    deposit1.deposited = Some(vec![10, 3, 20, 7]);

    let mut deposit2 = make_member(Some(group_id), "alice");
    deposit2.deposited = Some(vec![10, 2, 30, 5]);

    tx.send(deposit1).await.unwrap();
    tx.send(deposit2).await.unwrap();

    notify_rx.recv().await.expect("worker should process batch");

    // Verify deposits accumulated: item 10 had 5, deposited 3+2=5, total=10
    // item 20 deposited 7, item 30 deposited 5
    let alice = get_member_from_db(&client, group_id, "alice").await;
    let bank_map = bank_to_map(alice.bank.unwrap_or_default());
    assert_eq!(
        bank_map.get(&10),
        Some(&10),
        "item 10 should have qty 10 (5 initial + 3 + 2)"
    );
    assert_eq!(bank_map.get(&20), Some(&7), "item 20 should have qty 7");
    assert_eq!(bank_map.get(&30), Some(&5), "item 30 should have qty 5");

    // Verify last_updated was set (bank trigger fires on deposit)
    assert!(
        alice.last_updated.is_some(),
        "last_updated should be set after deposit"
    );

    drop(tx);
}

#[tokio::test]
async fn test_deposit_new_item_not_in_bank() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    let group_id = setup_test_group(&pool).await;

    let (tx, mut notify_rx) = spawn_worker(&pool);

    let mut deposit = make_member(Some(group_id), "alice");
    deposit.deposited = Some(vec![42, 99]);

    tx.send(deposit).await.unwrap();

    notify_rx.recv().await.expect("worker should process batch");

    let client = pool.get().await.expect("failed to get client");
    let alice = get_member_from_db(&client, group_id, "alice").await;
    let bank_map = bank_to_map(alice.bank.unwrap_or_default());
    assert_eq!(bank_map.get(&42), Some(&99));

    drop(tx);
}

// ──────────────────────────────────────────────────────────────────────────
// Integration tests: all field types round-trip through UNNEST
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
    alice.quests = Some(vec![0xDE, 0xAD, 0xBE, 0xEF]);
    alice.inventory = Some(vec![42; 56]);
    alice.equipment = Some(vec![99; 28]);
    alice.bank = Some(vec![1, 10, 2, 20, 3, 30]);
    alice.rune_pouch = Some(vec![5; 8]);
    alice.seed_vault = Some(vec![7, 14, 21, 28]);
    alice.diary_vars = Some(vec![1; 62]);
    alice.collection_log_v2 = Some(vec![100, 200, 300]);
    alice.potion_storage = Some(vec![101, 4, 102, 2]);
    alice.interacting = Some(
        serde_json::from_str(
            r#"{"name":"banker","scale":1,"ratio":2,"location":{"x":1,"y":2,"plane":0}}"#,
        )
        .unwrap(),
    );

    tx.send(alice).await.unwrap();
    notify_rx.recv().await.expect("worker should process batch");

    let client = pool.get().await.expect("failed to get client");
    let alice = get_member_from_db(&client, group_id, "alice").await;

    assert_eq!(alice.stats, Some(vec![1, 2, 3, 4, 5, 6, 7]));
    assert_eq!(alice.coordinates, Some(vec![100, 200, 0]));
    assert_eq!(alice.skills, Some(vec![10; 24]));
    assert_eq!(alice.quests, Some(vec![0xDE, 0xAD, 0xBE, 0xEF]));
    assert_eq!(alice.inventory, Some(vec![42; 56]));
    assert_eq!(alice.equipment, Some(vec![99; 28]));
    assert_eq!(alice.bank, Some(vec![1, 10, 2, 20, 3, 30]));
    assert_eq!(alice.rune_pouch, Some(vec![5; 8]));
    assert_eq!(alice.seed_vault, Some(vec![7, 14, 21, 28]));
    assert_eq!(alice.diary_vars, Some(vec![1; 62]));
    assert_eq!(alice.collection_log_v2, Some(vec![100, 200, 300]));
    assert_eq!(alice.potion_storage, Some(vec![101, 4, 102, 2]));
    assert!(alice.interacting.is_some(), "interacting should be set");
    let interacting_json = serde_json::to_string(&alice.interacting.unwrap()).unwrap();
    assert!(
        interacting_json.contains("banker"),
        "interacting should round-trip through serde, got: {}",
        interacting_json
    );

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
// Integration tests: deposit + regular field update in same batch
// ──────────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn test_deposit_and_field_update_same_batch() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    let group_id = setup_test_group(&pool).await;

    let (tx, mut notify_rx) = spawn_worker(&pool);

    // Send stats and deposit for same member in same batch
    let mut update1 = make_member(Some(group_id), "alice");
    update1.stats = Some(vec![1, 2, 3, 4, 5, 6, 7]);

    let mut update2 = make_member(Some(group_id), "alice");
    update2.deposited = Some(vec![10, 5]);

    tx.send(update1).await.unwrap();
    tx.send(update2).await.unwrap();
    notify_rx.recv().await.expect("worker should process batch");

    let client = pool.get().await.expect("failed to get client");
    let alice = get_member_from_db(&client, group_id, "alice").await;
    assert_eq!(
        alice.stats,
        Some(vec![1, 2, 3, 4, 5, 6, 7]),
        "stats should be set"
    );
    let bank_map = bank_to_map(alice.bank.unwrap_or_default());
    assert_eq!(
        bank_map.get(&10),
        Some(&5),
        "deposit should be applied to bank"
    );

    drop(tx);
}

// ──────────────────────────────────────────────────────────────────────────
// Integration tests: bank overwrite + deposit in same batch
// ──────────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn test_bank_overwrite_and_deposit_same_batch() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    let group_id = setup_test_group(&pool).await;

    // Set an initial bank so we can verify the overwrite replaces it
    let client = pool.get().await.expect("failed to get client");
    client
        .execute(
            "UPDATE groupironman.members SET bank = ARRAY[99, 99, 88, 88]::int4[] WHERE group_id=$1 AND member_name=$2",
            &[&group_id, &"alice"],
        )
        .await
        .expect("failed to set initial bank");

    let (tx, mut notify_rx) = spawn_worker(&pool);

    // Send one update with both bank (overwrite) and deposited (additive)
    let mut alice = make_member(Some(group_id), "alice");
    alice.bank = Some(vec![1, 10, 2, 20]);
    alice.deposited = Some(vec![1, 5, 3, 30]);

    tx.send(alice).await.unwrap();
    notify_rx.recv().await.expect("worker should process batch");

    let alice = get_member_from_db(&client, group_id, "alice").await;
    let bank_map = bank_to_map(alice.bank.unwrap_or_default());

    // UNNEST overwrites bank to [1,10, 2,20], then deposits merge on top:
    // item 1: 10 + 5 = 15, item 2: 20 (no deposit), item 3: 30 (new)
    assert_eq!(
        bank_map.get(&1),
        Some(&15),
        "item 1 should be 10 (overwrite) + 5 (deposit) = 15"
    );
    assert_eq!(
        bank_map.get(&2),
        Some(&20),
        "item 2 should be 20 (overwrite only)"
    );
    assert_eq!(
        bank_map.get(&3),
        Some(&30),
        "item 3 should be 30 (deposit only)"
    );
    assert!(
        !bank_map.contains_key(&99),
        "old item 99 should be gone after overwrite"
    );
    assert!(
        !bank_map.contains_key(&88),
        "old item 88 should be gone after overwrite"
    );

    drop(tx);
}

#[tokio::test]
async fn test_bank_and_deposit_separate_updates_same_member() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    let group_id = setup_test_group(&pool).await;

    let (tx, mut notify_rx) = spawn_worker(&pool);

    // Two separate updates for the same member in the same batch:
    // update1 sets bank, update2 sets deposited — they get merged by deduplicate_batch
    let mut update1 = make_member(Some(group_id), "alice");
    update1.bank = Some(vec![10, 100, 20, 200]);

    let mut update2 = make_member(Some(group_id), "alice");
    update2.deposited = Some(vec![10, 50, 30, 300]);

    tx.send(update1).await.unwrap();
    tx.send(update2).await.unwrap();
    notify_rx.recv().await.expect("worker should process batch");

    let client = pool.get().await.expect("failed to get client");
    let alice = get_member_from_db(&client, group_id, "alice").await;
    let bank_map = bank_to_map(alice.bank.unwrap_or_default());

    // After merge: bank=[10,100, 20,200], deposited=[10,50, 30,300]
    // UNNEST writes bank, then deposits merge on top:
    // item 10: 100 + 50 = 150, item 20: 200 (no deposit), item 30: 300 (new)
    assert_eq!(
        bank_map.get(&10),
        Some(&150),
        "item 10 should be 100 (overwrite) + 50 (deposit) = 150"
    );
    assert_eq!(
        bank_map.get(&20),
        Some(&200),
        "item 20 should be 200 (overwrite only)"
    );
    assert_eq!(
        bank_map.get(&30),
        Some(&300),
        "item 30 should be 300 (deposit only)"
    );

    drop(tx);
}

// ──────────────────────────────────────────────────────────────────────────
// Integration tests: multiple members with deposits in same batch
// ──────────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn test_multiple_members_deposits_same_batch() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    let group_id = setup_test_group(&pool).await;

    let (tx, mut notify_rx) = spawn_worker(&pool);

    let mut alice = make_member(Some(group_id), "alice");
    alice.deposited = Some(vec![1, 10, 2, 20]);

    let mut bob = make_member(Some(group_id), "bob");
    bob.deposited = Some(vec![3, 30, 4, 40]);

    let mut carol = make_member(Some(group_id), "carol");
    carol.deposited = Some(vec![5, 50]);

    tx.send(alice).await.unwrap();
    tx.send(bob).await.unwrap();
    tx.send(carol).await.unwrap();
    notify_rx.recv().await.expect("worker should process batch");

    let client = pool.get().await.expect("failed to get client");

    let alice = get_member_from_db(&client, group_id, "alice").await;
    let alice_bank = bank_to_map(alice.bank.unwrap_or_default());
    assert_eq!(alice_bank.get(&1), Some(&10));
    assert_eq!(alice_bank.get(&2), Some(&20));

    let bob = get_member_from_db(&client, group_id, "bob").await;
    let bob_bank = bank_to_map(bob.bank.unwrap_or_default());
    assert_eq!(bob_bank.get(&3), Some(&30));
    assert_eq!(bob_bank.get(&4), Some(&40));

    let carol = get_member_from_db(&client, group_id, "carol").await;
    let carol_bank = bank_to_map(carol.bank.unwrap_or_default());
    assert_eq!(carol_bank.get(&5), Some(&50));

    drop(tx);
}

// ──────────────────────────────────────────────────────────────────────────
// Integration tests: batch exceeding CHUNK_SIZE
// ──────────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn test_batch_exceeding_chunk_size() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    let group_id = setup_test_group(&pool).await;

    // Create extra members so we can send >50 updates in one batch.
    // setup_test_group creates alice, bob, carol + @SHARED = 4 rows.
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

    let (tx, mut notify_rx) = spawn_worker(&pool);

    // Send 55 updates (exceeds CHUNK_SIZE of 50)
    for i in 0..55u32 {
        let name = if i < 3 {
            ["alice", "bob", "carol"][i as usize].to_string()
        } else {
            format!("extra{}", i - 3)
        };
        let mut m = make_member(Some(group_id), &name);
        m.stats = Some(vec![i as i32; 7]);
        tx.send(m).await.unwrap();
    }

    notify_rx.recv().await.expect("worker should process batch");

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

    drop(tx);
}

// ──────────────────────────────────────────────────────────────────────────
// Integration tests: deposit with zero item_id and zero quantity filtered
// ──────────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn test_deposit_zero_item_id_and_quantity_filtered() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    let group_id = setup_test_group(&pool).await;

    let (tx, mut notify_rx) = spawn_worker(&pool);

    // Deposit includes item_id=0 (should be filtered) and qty=0 (should be filtered)
    let mut deposit = make_member(Some(group_id), "alice");
    deposit.deposited = Some(vec![0, 99, 1, 0, 42, 10]);

    tx.send(deposit).await.unwrap();
    notify_rx.recv().await.expect("worker should process batch");

    let client = pool.get().await.expect("failed to get client");
    let alice = get_member_from_db(&client, group_id, "alice").await;
    let bank_map = bank_to_map(alice.bank.unwrap_or_default());

    assert!(
        !bank_map.contains_key(&0),
        "item_id 0 should be filtered out"
    );
    assert!(
        !bank_map.contains_key(&1),
        "item with qty 0 should be filtered out"
    );
    assert_eq!(bank_map.get(&42), Some(&10), "valid item should be in bank");

    drop(tx);
}

// ──────────────────────────────────────────────────────────────────────────
// Integration tests: shared bank update + regular member update in same batch
// ──────────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn test_shared_bank_and_member_update_same_batch() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    let group_id = setup_test_group(&pool).await;

    let (tx, mut notify_rx) = spawn_worker(&pool);

    // Alice sends a regular stats update
    let mut alice = make_member(Some(group_id), "alice");
    alice.stats = Some(vec![1, 2, 3, 4, 5, 6, 7]);

    // Bob sends a shared bank update
    let mut bob = make_member(Some(group_id), "bob");
    bob.shared_bank = Some(vec![100, 200, 300]);
    bob.last_updated = Some(chrono::DateTime::from_timestamp(5000, 0).unwrap());

    tx.send(alice).await.unwrap();
    tx.send(bob).await.unwrap();
    notify_rx.recv().await.expect("worker should process batch");

    let client = pool.get().await.expect("failed to get client");

    // Alice's stats should be set
    let alice = get_member_from_db(&client, group_id, "alice").await;
    assert_eq!(alice.stats, Some(vec![1, 2, 3, 4, 5, 6, 7]));

    // Shared bank should be set
    let shared = get_member_from_db(&client, group_id, SHARED_MEMBER).await;
    assert_eq!(shared.bank, Some(vec![100, 200, 300]));

    drop(tx);
}

// ──────────────────────────────────────────────────────────────────────────
// Integration tests: shared bank with None last_updated
// ──────────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn test_shared_bank_none_last_updated() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    let group_id = setup_test_group(&pool).await;

    let (tx, mut notify_rx) = spawn_worker(&pool);

    // Send shared bank update with no last_updated (None)
    let mut alice = make_member(Some(group_id), "alice");
    alice.shared_bank = Some(vec![7, 8, 9]);
    // last_updated is None

    tx.send(alice).await.unwrap();
    notify_rx.recv().await.expect("worker should process batch");

    let client = pool.get().await.expect("failed to get client");
    let shared = get_member_from_db(&client, group_id, SHARED_MEMBER).await;
    assert_eq!(
        shared.bank,
        Some(vec![7, 8, 9]),
        "shared bank should be written even when last_updated is None"
    );

    drop(tx);
}

// ──────────────────────────────────────────────────────────────────────────
// Integration tests: shared-bank writes
// ──────────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn test_shared_bank_coalesced_to_latest() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    let group_id = setup_test_group(&pool).await;

    let (tx, mut notify_rx) = spawn_worker(&pool);

    // Two members in the same group send shared_bank updates;
    // the one with the later last_updated should win.
    let mut alice_update = make_member(Some(group_id), "alice");
    alice_update.shared_bank = Some(vec![1, 2, 3]);
    alice_update.last_updated = Some(chrono::DateTime::from_timestamp(1000, 0).unwrap());

    let mut bob_update = make_member(Some(group_id), "bob");
    bob_update.shared_bank = Some(vec![9, 8, 7]);
    bob_update.last_updated = Some(chrono::DateTime::from_timestamp(2000, 0).unwrap());

    tx.send(alice_update).await.unwrap();
    tx.send(bob_update).await.unwrap();

    notify_rx.recv().await.expect("worker should process batch");

    let client = pool.get().await.expect("failed to get client");
    let shared = get_member_from_db(&client, group_id, SHARED_MEMBER).await;
    assert_eq!(
        shared.bank,
        Some(vec![9, 8, 7]),
        "shared bank should reflect the latest update"
    );

    drop(tx);
}

#[tokio::test]
async fn test_shared_bank_no_deadlock_different_groups() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    let group_id_1 = setup_test_group(&pool).await;

    // Create a second group using the server's create_group function
    let mut client = pool.get().await.expect("failed to get client");
    let create_group_2 = CreateGroup {
        name: "test_group_2".to_string(),
        member_names: vec!["dave".to_string(), "eve".to_string()],
        captcha_response: String::new(),
        token: "test_token_2".to_string(),
    };
    db::create_group(&mut client, &create_group_2)
        .await
        .expect("failed to create second test group");
    let group_id_2 = db::get_group(&client, "test_group_2", "test_token_2")
        .await
        .expect("failed to get second test group id");

    let (tx, mut notify_rx) = spawn_worker(&pool);

    // Send shared bank updates for both groups in the same batch
    let mut g1_update = make_member(Some(group_id_1), "alice");
    g1_update.shared_bank = Some(vec![100, 200]);
    g1_update.last_updated = Some(chrono::DateTime::from_timestamp(1000, 0).unwrap());

    let mut g2_update = make_member(Some(group_id_2), "dave");
    g2_update.shared_bank = Some(vec![300, 400]);
    g2_update.last_updated = Some(chrono::DateTime::from_timestamp(1000, 0).unwrap());

    tx.send(g1_update).await.unwrap();
    tx.send(g2_update).await.unwrap();

    // If there's a deadlock, the timeout will fail the test instead of hanging
    tokio::time::timeout(tokio::time::Duration::from_secs(10), notify_rx.recv())
        .await
        .expect("worker should process batch within 10s")
        .expect("worker should send notification");

    let client = pool.get().await.expect("failed to get client");
    let shared1 = get_member_from_db(&client, group_id_1, SHARED_MEMBER).await;
    let shared2 = get_member_from_db(&client, group_id_2, SHARED_MEMBER).await;
    assert_eq!(shared1.bank, Some(vec![100, 200]));
    assert_eq!(shared2.bank, Some(vec![300, 400]));

    drop(tx);
}

#[tokio::test]
async fn test_bank_last_update_set_after_deposit() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    let group_id = setup_test_group(&pool).await;

    // Verify last_updated is null initially
    let client = pool.get().await.expect("failed to get client");
    let alice_before = get_member_from_db(&client, group_id, "alice").await;
    assert!(
        alice_before.last_updated.is_none(),
        "last_updated should be null initially"
    );

    let (tx, mut notify_rx) = spawn_worker(&pool);

    let mut deposit = make_member(Some(group_id), "alice");
    deposit.deposited = Some(vec![1, 1]);

    tx.send(deposit).await.unwrap();

    notify_rx.recv().await.expect("worker should process batch");

    let alice_after = get_member_from_db(&client, group_id, "alice").await;
    assert!(
        alice_after.last_updated.is_some(),
        "last_updated should be set after deposit"
    );

    drop(tx);
}

// ──────────────────────────────────────────────────────────────────────────
// Integration tests: non-member update is a silent no-op
// ──────────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn test_non_member_update_is_silent_noop() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    let group_id = setup_test_group(&pool).await;

    let (tx, mut notify_rx) = spawn_worker(&pool);

    // Send an update for a real member and a non-member in the same batch
    let mut alice = make_member(Some(group_id), "alice");
    alice.stats = Some(vec![1, 2, 3, 4, 5, 6, 7]);

    let mut ghost = make_member(Some(group_id), "ghost");
    ghost.stats = Some(vec![9, 9, 9, 9, 9, 9, 9]);

    tx.send(alice).await.unwrap();
    tx.send(ghost).await.unwrap();

    // Batch should process without error
    notify_rx.recv().await.expect("worker should process batch");

    let client = pool.get().await.expect("failed to get client");

    // Alice's update should be applied
    let alice = get_member_from_db(&client, group_id, "alice").await;
    assert_eq!(alice.stats, Some(vec![1, 2, 3, 4, 5, 6, 7]));

    // "ghost" should not exist in the database — the UPDATE WHERE clause
    // silently matched no rows
    let epoch = chrono::DateTime::from_timestamp(0, 0).unwrap();
    let members = db::get_group_data(&client, group_id, &epoch)
        .await
        .expect("failed to get group data");
    assert!(
        !members.iter().any(|m| m.name == "ghost"),
        "non-member 'ghost' should not appear in group data"
    );

    drop(tx);
}

// ──────────────────────────────────────────────────────────────────────────
// Integration tests: potion storage
// ──────────────────────────────────────────────────────────────────────────

#[tokio::test]
async fn test_potion_storage_partial_update() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    let group_id = setup_test_group(&pool).await;

    let (tx, mut notify_rx) = spawn_worker(&pool);

    let mut alice = make_member(Some(group_id), "alice");
    alice.potion_storage = Some(vec![101, 4, 102, 2]);

    tx.send(alice).await.unwrap();
    notify_rx.recv().await.expect("worker should process batch");

    let client = pool.get().await.expect("failed to get client");
    let alice = get_member_from_db(&client, group_id, "alice").await;
    assert_eq!(alice.potion_storage, Some(vec![101, 4, 102, 2]));
    assert!(
        alice.last_updated.is_some(),
        "last_updated should be set after potion_storage update"
    );

    drop(tx);
}

#[tokio::test]
async fn test_potion_storage_last_write_wins() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    let group_id = setup_test_group(&pool).await;

    let (tx, mut notify_rx) = spawn_worker(&pool);

    let mut alice1 = make_member(Some(group_id), "alice");
    alice1.potion_storage = Some(vec![101, 4, 102, 2]);

    let mut alice2 = make_member(Some(group_id), "alice");
    alice2.potion_storage = Some(vec![201, 1, 202, 3]);

    tx.send(alice1).await.unwrap();
    tx.send(alice2).await.unwrap();
    notify_rx.recv().await.expect("worker should process batch");

    let client = pool.get().await.expect("failed to get client");
    let alice = get_member_from_db(&client, group_id, "alice").await;
    assert_eq!(
        alice.potion_storage,
        Some(vec![201, 1, 202, 3]),
        "last potion_storage snapshot should win"
    );

    drop(tx);
}

#[tokio::test]
async fn test_potion_storage_empty_array() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    let group_id = setup_test_group(&pool).await;

    let (tx, mut notify_rx) = spawn_worker(&pool);

    let mut alice1 = make_member(Some(group_id), "alice");
    alice1.potion_storage = Some(vec![101, 4]);

    tx.send(alice1).await.unwrap();
    notify_rx
        .recv()
        .await
        .expect("worker should process batch 1");

    let mut alice2 = make_member(Some(group_id), "alice");
    alice2.potion_storage = Some(vec![]);

    tx.send(alice2).await.unwrap();
    notify_rx
        .recv()
        .await
        .expect("worker should process batch 2");

    let client = pool.get().await.expect("failed to get client");
    let alice = get_member_from_db(&client, group_id, "alice").await;
    assert_eq!(
        alice.potion_storage,
        Some(vec![]),
        "empty array should replace previous snapshot, not retain it"
    );

    drop(tx);
}

#[tokio::test]
async fn test_potion_storage_incremental_reads() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    let group_id = setup_test_group(&pool).await;

    let (tx, mut notify_rx) = spawn_worker(&pool);

    let mut alice = make_member(Some(group_id), "alice");
    alice.potion_storage = Some(vec![101, 4]);

    tx.send(alice).await.unwrap();
    notify_rx.recv().await.expect("worker should process batch");

    let client = pool.get().await.expect("failed to get client");
    let alice_after = get_member_from_db(&client, group_id, "alice").await;
    let ts_after = alice_after.last_updated.unwrap();

    // Cutoff after the update — potion_storage should be omitted
    let after_ts = ts_after + chrono::Duration::seconds(10);
    let members_after_cutoff = db::get_group_data(&client, group_id, &after_ts)
        .await
        .expect("failed to get group data");
    let alice_after_cutoff = members_after_cutoff
        .iter()
        .find(|m| m.name == "alice")
        .expect("alice not found");
    assert!(
        alice_after_cutoff.potion_storage.is_none(),
        "potion_storage should be omitted for cutoff after its update timestamp"
    );

    // Cutoff at the update timestamp — potion_storage should be present
    let members_at = db::get_group_data(&client, group_id, &ts_after)
        .await
        .expect("failed to get group data");
    let alice_at = members_at
        .iter()
        .find(|m| m.name == "alice")
        .expect("alice not found");
    assert_eq!(
        alice_at.potion_storage,
        Some(vec![101, 4]),
        "potion_storage should be included for cutoff at its update timestamp"
    );

    drop(tx);
}

#[tokio::test]
async fn test_potion_storage_idempotent_resend() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    let group_id = setup_test_group(&pool).await;

    let (tx, mut notify_rx) = spawn_worker(&pool);

    let mut alice1 = make_member(Some(group_id), "alice");
    alice1.potion_storage = Some(vec![101, 4]);

    tx.send(alice1).await.unwrap();
    notify_rx
        .recv()
        .await
        .expect("worker should process batch 1");

    let client = pool.get().await.expect("failed to get client");
    let alice_after_1 = get_member_from_db(&client, group_id, "alice").await;
    let ts1 = alice_after_1.last_updated.unwrap();

    let mut alice2 = make_member(Some(group_id), "alice");
    alice2.potion_storage = Some(vec![101, 4]);

    tx.send(alice2).await.unwrap();
    notify_rx
        .recv()
        .await
        .expect("worker should process batch 2");

    let alice_after_2 = get_member_from_db(&client, group_id, "alice").await;
    let ts2 = alice_after_2.last_updated.unwrap();

    assert_eq!(
        ts1, ts2,
        "timestamp should not change when identical potion_storage is resent"
    );

    drop(tx);
}
