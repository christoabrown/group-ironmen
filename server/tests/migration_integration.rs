//! Checks the schema migrations against a real PostgreSQL database (see
//! `common/mod.rs` for setup). Drops the test schema.
mod common;

use common::{create_test_pool, drop_schema, TEST_MUTEX};
use server::db;

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
async fn what_the_map_no_longer_keeps_is_dropped_and_migrations_are_idempotent() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    let mut client = pool.get().await.unwrap();
    drop_schema(&client).await;

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
        // The map's own accounts (hub_decides_sessions).
        "users",
        "discord_users",
        "user_player_links",
        "audit_log",
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

    // A session holds what the hub said of who it belongs to.
    let session_columns: Vec<String> = client
        .query(
            "SELECT column_name::text FROM information_schema.columns \
             WHERE table_schema='groupironman' AND table_name='sessions' ORDER BY column_name",
            &[],
        )
        .await
        .unwrap()
        .iter()
        .map(|row| row.get(0))
        .collect();
    assert_eq!(
        session_columns,
        [
            "created_at",
            "discord_id",
            "expires_at",
            "is_admin",
            "name",
            "session_id",
            "verified_at"
        ]
    );
}

/// The accounts a database from before `hub_decides_sessions` holds go with
/// their tables: nobody can sign in with them any more.
#[tokio::test]
async fn accounts_the_map_kept_itself_go_with_their_tables() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = create_test_pool().await;
    let mut client = pool.get().await.unwrap();
    drop_schema(&client).await;
    db::update_schema(&mut client).await.unwrap();

    // Back to how it was: the old tables with someone in them, a session of
    // theirs, and the migration not yet recorded.
    client
        .batch_execute(
            r#"
DROP TABLE groupironman.sessions;
CREATE TABLE groupironman.users (
    user_id BIGSERIAL PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT,
    role TEXT NOT NULL DEFAULT 'member'
);
CREATE TABLE groupironman.sessions (
    session_id TEXT PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES groupironman.users(user_id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE groupironman.discord_users (
    discord_id TEXT PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES groupironman.users(user_id) ON DELETE CASCADE
);
CREATE TABLE groupironman.audit_log (
    log_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES groupironman.users(user_id) ON DELETE SET NULL
);
INSERT INTO groupironman.users (username, password_hash, role) VALUES ('admin', 'x', 'admin');
INSERT INTO groupironman.sessions VALUES ('old-session', 1, NOW() + interval '1 day');
INSERT INTO groupironman.discord_users VALUES ('1', 1);
INSERT INTO groupironman.audit_log (user_id) VALUES (1);
DELETE FROM groupironman.migrations WHERE name='hub_decides_sessions';
"#,
        )
        .await
        .unwrap();

    db::update_schema(&mut client).await.unwrap();

    let users: bool = client
        .query_one("SELECT to_regclass('groupironman.users') IS NOT NULL", &[])
        .await
        .unwrap()
        .get(0);
    assert!(!users);
    let sessions: i64 = client
        .query_one("SELECT COUNT(*) FROM groupironman.sessions", &[])
        .await
        .unwrap()
        .get(0);
    assert_eq!(sessions, 0, "an old session doesn't sign anyone in");
}
