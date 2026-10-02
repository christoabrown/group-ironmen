//! Checks what `db::update_schema` does to a real PostgreSQL database (see
//! `common/mod.rs` for setup). Drops the test schema.
mod common;

use common::{create_test_pool, drop_schema, TEST_MUTEX};
use deadpool_postgres::Object;
use server::db;

/// The names a query gives, in order.
async fn names(client: &Object, sql: &str) -> Vec<String> {
    let rows = client.query(sql, &[]).await.unwrap();
    rows.iter().map(|row| row.get(0)).collect()
}

async fn count(client: &Object, sql: &str) -> i64 {
    client.query_one(sql, &[]).await.unwrap().get(0)
}

#[tokio::test]
async fn an_empty_database_gets_the_baseline_once() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    let mut client = pool.get().await.unwrap();
    drop_schema(&client).await;

    db::update_schema(&mut client).await.unwrap();
    db::ensure_member_exists(&client, "Alice").await.unwrap();
    // A second start finds the baseline recorded and changes nothing.
    db::update_schema(&mut client).await.unwrap();

    let tables = names(
        &client,
        "SELECT table_name::text FROM information_schema.tables \
         WHERE table_schema='guildmap' ORDER BY table_name",
    )
    .await;
    assert_eq!(
        tables,
        [
            "aggregation_info",
            "members",
            "migrations",
            "sessions",
            "skills_day",
            "skills_month",
            "skills_year"
        ]
    );
    assert_eq!(
        names(&client, "SELECT name FROM guildmap.migrations").await,
        ["baseline"]
    );
    assert_eq!(
        count(&client, "SELECT COUNT(*) FROM guildmap.members").await,
        1
    );

    // One installation is one guild, and the batcher stamps what it stores.
    let columns = names(
        &client,
        "SELECT column_name::text FROM information_schema.columns \
         WHERE table_schema='guildmap' AND table_name='members'",
    )
    .await;
    assert!(!columns.contains(&"group_id".to_string()));
    for column in [
        "stats",
        "coordinates",
        "skills",
        "inventory",
        "equipment",
        "hub_meta",
    ] {
        assert!(columns.contains(&column.to_string()), "{column} missing");
        let stamp = format!("{column}_last_update");
        assert!(columns.contains(&stamp), "{stamp} missing");
    }
    let triggers = count(
        &client,
        "SELECT COUNT(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid \
         JOIN pg_namespace n ON n.oid = c.relnamespace \
         WHERE n.nspname='guildmap' AND NOT t.tgisinternal",
    )
    .await;
    assert_eq!(triggers, 0);
}

#[tokio::test]
async fn a_member_is_one_name_whatever_the_capitals_and_takes_its_history_along() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    let mut client = pool.get().await.unwrap();
    drop_schema(&client).await;
    db::update_schema(&mut client).await.unwrap();

    db::ensure_member_exists(&client, "Alice").await.unwrap();
    db::ensure_member_exists(&client, "ALICE").await.unwrap();
    assert_eq!(
        count(&client, "SELECT COUNT(*) FROM guildmap.members").await,
        1
    );

    client
        .batch_execute(
            "INSERT INTO guildmap.skills_day (member_id, time, skills) \
             SELECT member_id, NOW(), ARRAY[1, 2, 3] FROM guildmap.members",
        )
        .await
        .unwrap();
    client
        .execute(
            "DELETE FROM guildmap.members WHERE member_name='alice'",
            &[],
        )
        .await
        .unwrap();
    assert_eq!(
        count(&client, "SELECT COUNT(*) FROM guildmap.skills_day").await,
        0
    );
}

/// The map began on the schema of the Group Ironmen tracker. A database that
/// still has it is neither converted nor touched.
#[tokio::test]
async fn a_database_of_an_earlier_version_is_refused_and_left_alone() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    let mut client = pool.get().await.unwrap();
    drop_schema(&client).await;
    client
        .batch_execute(
            "CREATE SCHEMA groupironman; \
             CREATE TABLE groupironman.members (member_name TEXT); \
             INSERT INTO groupironman.members VALUES ('Alice');",
        )
        .await
        .unwrap();

    let refusal = db::update_schema(&mut client)
        .await
        .unwrap_err()
        .to_string();
    assert!(
        refusal.contains("DROP SCHEMA groupironman CASCADE"),
        "{refusal}"
    );
    assert_eq!(
        count(&client, "SELECT COUNT(*) FROM groupironman.members").await,
        1
    );
    assert_eq!(
        count(
            &client,
            "SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name='guildmap'"
        )
        .await,
        0
    );

    // With the old schema out of the way the map starts.
    drop_schema(&client).await;
    db::update_schema(&mut client).await.unwrap();
}
