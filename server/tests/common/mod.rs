//! What the integration tests share: the test database, and the batcher run
//! to its end.
//!
//! The tests need a running PostgreSQL with a database of their own: every
//! test that touches the schema drops it first. By default the connection is
//! the one of `config.toml` (the file the server reads) with the database
//! name `guildmap_test`. To use another one, set `TEST_DATABASE_URL`:
//!
//!   TEST_DATABASE_URL="postgres://postgres:password@localhost:5432/guildmap_test"
#![allow(dead_code)] // Each test file uses its own part of this.

use deadpool_postgres::{ManagerConfig, Object, Pool, RecyclingMethod};
use server::config::Config;
use server::models::MemberData;
use server::{db, update_batcher};
use tokio::sync::mpsc;
use tokio_postgres::NoTls;

/// One test at a time: the tests of a file share the database, and each
/// drops and recreates the schema.
pub static TEST_MUTEX: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

pub async fn create_test_pool() -> Pool {
    let mut cfg = if let Ok(url) = std::env::var("TEST_DATABASE_URL") {
        let mut c = deadpool_postgres::Config::new();
        c.url = Some(url);
        c
    } else {
        let config = Config::from_env().expect("failed to read config.toml");
        let mut pg = config.pg.clone();
        pg.dbname = Some("guildmap_test".to_string());
        pg
    };
    cfg.manager = Some(ManagerConfig {
        recycling_method: RecyclingMethod::Fast,
    });
    cfg.create_pool(None, NoTls)
        .expect("failed to create test pool")
}

/// Drops what the map keeps, and the schema an earlier version kept it in:
/// a test database from before the baseline may still have that one.
pub async fn drop_schema(client: &Object) {
    client
        .batch_execute(
            "DROP SCHEMA IF EXISTS guildmap CASCADE; DROP SCHEMA IF EXISTS groupironman CASCADE",
        )
        .await
        .expect("failed to drop schema");
}

/// The database as a new installation has it.
pub async fn fresh_database(pool: &Pool) {
    let mut client = pool.get().await.expect("failed to get client");
    drop_schema(&client).await;
    db::update_schema(&mut client)
        .await
        .expect("failed to update schema");
}

/// Runs the batcher over `updates` and returns when all of them are stored.
///
/// A running batcher closes a batch 50 ms after the first update arrives, so
/// updates sent one after another can end up in more than one batch, and one
/// notification does not say that the last of them is written. Here the real
/// batcher runs over exactly these updates, until it is done.
pub async fn store(pool: &Pool, updates: Vec<MemberData>) {
    let (tx, rx) = mpsc::channel::<MemberData>(updates.len().max(1));
    for update in updates {
        tx.try_send(update).expect("the channel holds every update");
    }
    // With the sender gone the batcher returns once the channel is empty.
    drop(tx);
    update_batcher::background_worker(pool.clone(), rx, None).await;
}
