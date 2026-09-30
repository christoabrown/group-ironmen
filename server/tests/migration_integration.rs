//! Checks the schema migrations against a real PostgreSQL database (see
//! `update_batcher_integration.rs` for setup). Drops the test schema.
use deadpool_postgres::{ManagerConfig, Pool, RecyclingMethod};
use std::env;
use tokio_postgres::NoTls;

use server::config::Config;
use server::db;

static TEST_MUTEX: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

async fn create_test_pool() -> Pool {
    let mut cfg = if let Ok(url) = env::var("TEST_DATABASE_URL") {
        let mut c = deadpool_postgres::Config::new();
        c.url = Some(url);
        c
    } else {
        let config = Config::from_env().expect("failed to read config");
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

async fn member_columns(client: &deadpool_postgres::Object) -> Vec<String> {
    client
        .query(
            "SELECT column_name::text FROM information_schema.columns \
             WHERE table_schema='groupironman' AND table_name='members'",
            &[],
        )
        .await
        .unwrap()
        .iter()
        .map(|row| row.get(0))
        .collect()
}

#[tokio::test]
async fn group_ironman_data_is_dropped_and_migrations_are_idempotent() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    let mut client = pool.get().await.unwrap();
    client
        .execute("DROP SCHEMA IF EXISTS groupironman CASCADE", &[])
        .await
        .unwrap();

    db::update_schema(&mut client).await.unwrap();
    // A second run finds every migration recorded and changes nothing.
    db::update_schema(&mut client).await.unwrap();

    let columns = member_columns(&client).await;
    for dropped in db::DROPPED_MEMBER_COLUMNS {
        assert!(!columns.contains(&dropped.to_string()), "{dropped} kept");
        let stamp = format!("{dropped}_last_update");
        assert!(!columns.contains(&stamp), "{stamp} kept");
    }
    assert!(!columns.contains(&"last_source".to_string()));
    for kept in db::TIMESTAMPED_MEMBER_COLUMNS {
        assert!(columns.contains(&kept.to_string()), "{kept} missing");
    }

    let mut triggers: Vec<String> = client
        .query(
            "SELECT tgname::text FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid \
             JOIN pg_namespace n ON n.oid = c.relnamespace \
             WHERE n.nspname='groupironman' AND c.relname='members' AND NOT t.tgisinternal",
            &[],
        )
        .await
        .unwrap()
        .iter()
        .map(|row| row.get(0))
        .collect();
    triggers.sort();
    let mut expected: Vec<String> = db::TIMESTAMPED_MEMBER_COLUMNS
        .iter()
        .map(|name| format!("set_{name}_timestamp"))
        .collect();
    expected.sort();
    assert_eq!(triggers, expected);

    for table in [
        "devices",
        "pairing_codes",
        "collection_log",
        "collection_log_new",
    ] {
        let exists: bool = client
            .query_one(
                "SELECT to_regclass('groupironman.' || $1) IS NOT NULL",
                &[&table],
            )
            .await
            .unwrap()
            .get(0);
        assert!(!exists, "{table} still exists");
    }

    let runs: i64 = client
        .query_one(
            "SELECT COUNT(*) FROM groupironman.migrations WHERE name='drop_group_ironman_data'",
            &[],
        )
        .await
        .unwrap()
        .get(0);
    assert_eq!(runs, 1);
}
