//! Runs the hub sync against an in-process mock of the osrs-data-hub API and a
//! real PostgreSQL database (see `update_batcher_integration.rs` for setup).
use actix_web::{web, App, HttpRequest, HttpResponse, HttpServer};
use chrono::{DateTime, Duration as ChronoDuration, Utc};
use deadpool_postgres::{ManagerConfig, Pool, RecyclingMethod};
use serde_json::{json, Value};
use std::env;
use std::sync::{Arc, Mutex, RwLock};
use std::time::Duration;
use tokio::sync::mpsc;
use tokio_postgres::NoTls;

use server::config::{Config, HubConfig};
use server::db;
use server::hub::client::{HubClient, HubError};
use server::hub::directory::HubDirectory;
use server::hub::sync::{HubSync, SyncContext, SyncControl};
use server::hub::HubStatus;
use server::models::{GroupMember, RosterEntry};
use server::update_batcher;

static TEST_MUTEX: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

/// Room for the members one poll sends.
const UPDATE_CAPACITY: usize = 1000;

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

async fn setup_database(pool: &Pool) -> i64 {
    let mut client = pool.get().await.unwrap();
    client
        .execute("DROP SCHEMA IF EXISTS groupironman CASCADE", &[])
        .await
        .unwrap();
    db::update_schema(&mut client).await.unwrap();
    db::get_or_create_singleton_group(&mut client)
        .await
        .unwrap()
}

// ----------------------------------------------------------------------------
// Mock hub
// ----------------------------------------------------------------------------

#[derive(Default)]
struct MockHub {
    accounts: Vec<Value>,
    /// When set, every request gets this status (with Retry-After: 7).
    fail_with: Option<u16>,
    requests: Vec<(String, Option<String>)>,
}

impl MockHub {
    fn etag(&self) -> String {
        let body = serde_json::to_string(&self.accounts).unwrap();
        format!("W/\"{:x}\"", md5_like(&body))
    }
}

fn md5_like(text: &str) -> u64 {
    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    text.hash(&mut hasher);
    hasher.finish()
}

async fn snapshot(req: HttpRequest, state: web::Data<Arc<Mutex<MockHub>>>) -> HttpResponse {
    let mut hub = state.lock().unwrap();
    let if_none_match = req
        .headers()
        .get("If-None-Match")
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned);
    hub.requests
        .push((req.query_string().to_owned(), if_none_match.clone()));
    assert_eq!(
        req.headers().get("Authorization").unwrap(),
        "Bearer ohub_test_key"
    );
    if let Some(status) = hub.fail_with {
        return HttpResponse::build(actix_web::http::StatusCode::from_u16(status).unwrap())
            .insert_header(("Retry-After", "7"))
            .json(json!({"error": {"code": "rate_limited", "message": "slow down"}}));
    }
    let etag = hub.etag();
    if if_none_match.as_deref() == Some(etag.as_str()) {
        return HttpResponse::NotModified().finish();
    }
    HttpResponse::Ok()
        .insert_header(("ETag", etag))
        .json(json!({
            "data": hub.accounts,
            "meta": {"generated_at": Utc::now(), "count": hub.accounts.len(),
                     "last_modified": Utc::now()}
        }))
}

async fn start_mock_hub(state: Arc<Mutex<MockHub>>) -> String {
    let data = web::Data::new(state);
    let server = HttpServer::new(move || {
        App::new()
            .app_data(data.clone())
            .route("/api/v1/snapshot", web::get().to(snapshot))
    })
    .workers(1)
    .bind(("127.0.0.1", 0))
    .unwrap();
    let address = server.addrs()[0];
    tokio::spawn(server.run());
    format!("http://{}", address)
}

fn online_account(id: &str, name: &str, discord_id: Option<&str>) -> Value {
    json!({
        "id": id,
        "name": name,
        "type": 0,
        "type_label": "Normal",
        "categories": ["stats", "activity", "location_live", "equipment", "inventory"],
        "owner": discord_id.map(|d| json!({"name": "Owner", "discord_id": d})),
        "online": true,
        "world": 302,
        "special_world": false,
        "last_seen": Utc::now(),
        "hp": {"current": 80, "max": 99},
        "prayer": {"current": 70, "max": 99},
        "spellbook": "standard",
        "location": {"x": 3164, "y": 3487, "plane": 0, "is_on_boat": false, "stale": false,
                     "updated_at": Utc::now()},
        "skills": {"total_level": 100, "overall_xp": 1000, "skills": [
            {"skill": "Attack", "level": 50, "real_level": 50, "xp": 101333}
        ]},
        "equipment": {"value": 0, "items": [
            {"id": 4151, "name": "Abyssal whip", "quantity": 1, "ge_price": 0, "ha_price": 0,
             "equipment_slot": "WEAPON"}
        ]},
        "inventory": {"value": 0, "items": [
            {"id": 995, "name": "Coins", "quantity": 1000, "ge_price": 1, "ha_price": 1,
             "equipment_slot": null}
        ]}
    })
}

fn offline_account(id: &str, name: &str, last_seen: DateTime<Utc>) -> Value {
    let mut account = online_account(id, name, None);
    account["online"] = json!(false);
    account["last_seen"] = json!(last_seen);
    account["location"]["stale"] = json!(true);
    account
}

// ----------------------------------------------------------------------------
// Harness
// ----------------------------------------------------------------------------

struct Harness {
    pool: Pool,
    group_id: i64,
    hub: Arc<Mutex<MockHub>>,
    sync: HubSync,
    /// What the sync sends; `poll` hands it to the batcher.
    updates: mpsc::Receiver<GroupMember>,
    sent: usize,
    control: SyncControl,
    directory: HubDirectory,
}

async fn harness() -> Harness {
    let pool = create_test_pool().await;
    let group_id = setup_database(&pool).await;
    let hub = Arc::new(Mutex::new(MockHub::default()));
    let base_url = start_mock_hub(Arc::clone(&hub)).await;

    let hub_config = HubConfig {
        base_url,
        api_key: "ohub_test_key".to_string(),
        full_refresh_secs: 3600,
        ..HubConfig::default()
    };

    // Nothing reads this channel while a poll runs, so it has to hold
    // everything one poll sends.
    let (tx, updates) = mpsc::channel::<GroupMember>(UPDATE_CAPACITY);

    let directory = HubDirectory::default();
    let control = SyncControl::default();
    let sync = HubSync::new(SyncContext {
        pool: pool.clone(),
        client: HubClient::new(&hub_config),
        sender: tx,
        group_id,
        config: hub_config,
        status: Arc::new(RwLock::new(HubStatus::default())),
        directory: directory.clone(),
        control: control.clone(),
    });

    Harness {
        pool,
        group_id,
        hub,
        sync,
        updates,
        sent: 0,
        control,
        directory,
    }
}

impl Harness {
    /// One poll, with everything it sent stored by the time this returns.
    ///
    /// The sync sends its accounts one by one with database work in between,
    /// and a running batcher closes a batch 50 ms after the first member
    /// arrives, so one poll can end up in several batches. Instead of guessing
    /// how many to wait for, the real batcher runs here over exactly what the
    /// poll sent, until it is done.
    async fn poll(&mut self) -> Result<(), HubError> {
        let result = self.sync.poll_once().await;
        let (batch_tx, batch_rx) = mpsc::channel::<GroupMember>(UPDATE_CAPACITY);
        while let Ok(member) = self.updates.try_recv() {
            self.sent += 1;
            batch_tx
                .try_send(member)
                .expect("as large as the channel it is filled from");
        }
        // With the sender gone the batcher returns once the channel is empty.
        drop(batch_tx);
        update_batcher::background_worker(self.pool.clone(), batch_rx, None).await;
        result
    }

    fn sent(&self) -> usize {
        self.sent
    }

    async fn member(&self, name: &str) -> Option<GroupMember> {
        let epoch = DateTime::from_timestamp(0, 0).unwrap();
        self.member_since(name, epoch).await
    }

    /// The member's data as a site polling since `from_time` gets it.
    async fn member_since(&self, name: &str, from_time: DateTime<Utc>) -> Option<GroupMember> {
        let client = self.pool.get().await.unwrap();
        db::get_group_data(&client, self.group_id, &from_time)
            .await
            .unwrap()
            .members
            .into_iter()
            .find(|member| member.name == name)
    }

    async fn roster(&self, name: &str) -> Option<RosterEntry> {
        let client = self.pool.get().await.unwrap();
        let epoch = DateTime::from_timestamp(0, 0).unwrap();
        db::get_group_data(&client, self.group_id, &epoch)
            .await
            .unwrap()
            .roster
            .into_iter()
            .find(|entry| entry.name == name)
    }

    async fn cursor(&self) -> DateTime<Utc> {
        let client = self.pool.get().await.unwrap();
        let epoch = DateTime::from_timestamp(0, 0).unwrap();
        db::get_group_data(&client, self.group_id, &epoch)
            .await
            .unwrap()
            .cursor
    }

    async fn scalar<T: for<'a> tokio_postgres::types::FromSql<'a>>(&self, sql: &str) -> T {
        let client = self.pool.get().await.unwrap();
        client.query_one(sql, &[]).await.unwrap().get(0)
    }
}

// ----------------------------------------------------------------------------
// Tests
// ----------------------------------------------------------------------------

#[tokio::test]
async fn imports_online_and_offline_accounts() {
    let _guard = TEST_MUTEX.lock().await;
    let mut h = harness().await;

    // A map user whose Discord account owns the online hub account.
    {
        let client = h.pool.get().await.unwrap();
        client
            .batch_execute(
                "INSERT INTO groupironman.users (user_id, username, password_hash, role) \
                 VALUES (1, 'alice', '', 'member'); \
                 INSERT INTO groupironman.discord_users (discord_id, user_id, discord_username) \
                 VALUES ('d-alice', 1, 'alice');",
            )
            .await
            .unwrap();
    }

    let last_seen = (Utc::now() - ChronoDuration::days(2))
        .with_timezone(&Utc)
        .trunc_subsecs_ms();
    h.hub.lock().unwrap().accounts = vec![
        online_account("acc-alpha", "Alpha", Some("d-alice")),
        offline_account("acc-bravo", "Bravo", last_seen),
    ];
    h.poll().await.unwrap();

    let alpha = h.member("Alpha").await.expect("Alpha imported");
    assert_eq!(alpha.coordinates, Some(vec![3164, 3487, 0]));
    assert_eq!(alpha.stats, Some(vec![80, 99, 70, 99, 0, 0, 302]));
    assert_eq!(&alpha.equipment.as_ref().unwrap()[6..8], &[4151, 1]);
    assert!(Utc::now() - alpha.last_updated.unwrap() < ChronoDuration::seconds(30));

    assert_eq!(alpha.meta.as_ref().unwrap()["type_label"], "Normal");
    assert!(h.roster("Alpha").await.unwrap().online);

    let bravo = h.member("Bravo").await.expect("Bravo imported");
    assert!(bravo.skills.is_some());
    assert_eq!(bravo.coordinates, None, "stale locations are not imported");
    let bravo = h.roster("Bravo").await.unwrap();
    assert!(!bravo.online, "offline accounts show as offline");
    assert_eq!(bravo.last_seen, Some(last_seen));

    let bound: i64 = h
        .scalar("SELECT COUNT(*) FROM groupironman.members WHERE hub_account_id IS NOT NULL")
        .await;
    assert_eq!(bound, 2);
    let link_source: String = h
        .scalar("SELECT source FROM groupironman.user_player_links WHERE member_name='Alpha'")
        .await;
    assert_eq!(link_source, "hub");
}

#[tokio::test]
async fn unchanged_snapshots_send_nothing_and_offline_changes_are_sent() {
    let _guard = TEST_MUTEX.lock().await;
    let mut h = harness().await;
    h.hub.lock().unwrap().accounts = vec![offline_account(
        "acc-bravo",
        "Bravo",
        Utc::now() - ChronoDuration::hours(3),
    )];

    h.poll().await.unwrap();
    assert_eq!(h.sent(), 1);

    // Same content: the client sends If-None-Match and gets 304.
    h.poll().await.unwrap();
    let requests = h.hub.lock().unwrap().requests.clone();
    assert!(requests[1].1.is_some(), "second poll is conditional");
    assert_eq!(h.sent(), 1);

    // Changed while offline (e.g. the hub learnt the last world): sent.
    h.hub.lock().unwrap().accounts[0]["world"] = json!(420);
    h.poll().await.unwrap();
    assert_eq!(h.sent(), 2);
    assert_eq!(h.member("Bravo").await.unwrap().stats.unwrap()[6], 420);
}

#[tokio::test]
async fn offline_accounts_imported_later_reach_sites_that_are_already_polling() {
    let _guard = TEST_MUTEX.lock().await;
    let mut h = harness().await;
    h.hub.lock().unwrap().accounts = vec![online_account("acc-alpha", "Alpha", None)];
    h.poll().await.unwrap();
    let cursor = h.cursor().await;

    tokio::time::sleep(Duration::from_millis(20)).await;
    h.hub.lock().unwrap().accounts.push(offline_account(
        "acc-bravo",
        "Bravo",
        Utc::now() - ChronoDuration::days(30),
    ));
    h.poll().await.unwrap();

    let bravo = h
        .member_since("Bravo", cursor)
        .await
        .expect("a site polling since before the import gets Bravo");
    assert!(bravo.skills.is_some());
    assert!(!h.roster("Bravo").await.unwrap().online);
    assert!(
        h.member_since("Alpha", h.cursor().await + ChronoDuration::seconds(5))
            .await
            .is_none(),
        "unchanged members are left out"
    );
}

#[tokio::test]
async fn only_changed_sections_are_stamped() {
    let _guard = TEST_MUTEX.lock().await;
    let mut h = harness().await;
    h.hub.lock().unwrap().accounts = vec![online_account("acc-alpha", "Alpha", None)];
    h.poll().await.unwrap();
    let first = h.member("Alpha").await.unwrap();

    // Only last_seen moved: nothing to send.
    tokio::time::sleep(Duration::from_millis(50)).await;
    h.hub.lock().unwrap().accounts[0]["last_seen"] = json!(Utc::now());
    h.poll().await.unwrap();
    assert_eq!(h.sent(), 1);

    h.hub.lock().unwrap().accounts[0]["hp"] = json!({"current": 10, "max": 99});
    h.poll().await.unwrap();
    assert_eq!(h.sent(), 2);

    let client = h.pool.get().await.unwrap();
    let row = client
        .query_one(
            "SELECT stats_last_update, skills_last_update FROM groupironman.members \
             WHERE member_name='Alpha'",
            &[],
        )
        .await
        .unwrap();
    let stats_updated: DateTime<Utc> = row.get(0);
    let skills_updated: DateTime<Utc> = row.get(1);
    assert!(stats_updated > first.last_updated.unwrap(), "stats changed");
    assert!(
        skills_updated < stats_updated,
        "unchanged skills keep their stamp"
    );
}

#[tokio::test]
async fn presence_follows_the_hub() {
    let _guard = TEST_MUTEX.lock().await;
    let mut h = harness().await;
    h.hub.lock().unwrap().accounts = vec![online_account("acc-alpha", "Alpha", None)];
    h.poll().await.unwrap();
    assert!(h.roster("Alpha").await.unwrap().online);

    h.hub.lock().unwrap().accounts[0]["online"] = json!(false);
    h.poll().await.unwrap();
    assert!(
        !h.roster("Alpha").await.unwrap().online,
        "a flip is written at once"
    );
}

#[tokio::test]
async fn hidden_members_are_left_alone_until_shown_again() {
    let _guard = TEST_MUTEX.lock().await;
    let mut h = harness().await;
    h.hub.lock().unwrap().accounts = vec![online_account("acc-alpha", "Alpha", None)];
    h.poll().await.unwrap();
    assert_eq!(h.directory.hub_id("Alpha").as_deref(), Some("acc-alpha"));

    {
        let client = h.pool.get().await.unwrap();
        db::set_member_hidden(&client, h.group_id, "Alpha", true)
            .await
            .unwrap();
    }
    h.control.forget_member("Alpha");
    h.hub.lock().unwrap().accounts[0]["hp"] = json!({"current": 1, "max": 99});
    h.poll().await.unwrap();
    assert_eq!(h.sent(), 1, "nothing is sent for a hidden member");
    assert!(
        h.roster("Alpha").await.is_none(),
        "hidden members are not on the roster"
    );
    assert!(h.directory.is_hidden("acc-alpha"));

    {
        let client = h.pool.get().await.unwrap();
        db::set_member_hidden(&client, h.group_id, "Alpha", false)
            .await
            .unwrap();
    }
    h.control.forget_member("Alpha");
    h.poll().await.unwrap();
    assert_eq!(h.sent(), 2, "shown again: everything is sent");
    assert_eq!(h.member("Alpha").await.unwrap().stats.unwrap()[0], 1);
    assert!(!h.directory.is_hidden("acc-alpha"));
}

#[tokio::test]
async fn follows_renames() {
    let _guard = TEST_MUTEX.lock().await;
    let mut h = harness().await;
    h.hub.lock().unwrap().accounts = vec![online_account("acc-alpha", "Alpha", None)];
    h.poll().await.unwrap();
    {
        let client = h.pool.get().await.unwrap();
        client
            .batch_execute(
                "INSERT INTO groupironman.users (user_id, username, password_hash, role) \
                 VALUES (1, 'alice', '', 'member'); \
                 INSERT INTO groupironman.user_player_links (user_id, member_name, group_id) \
                 SELECT 1, 'Alpha', group_id FROM groupironman.groups LIMIT 1;",
            )
            .await
            .unwrap();
    }

    h.hub.lock().unwrap().accounts[0]["name"] = json!("Alpha Two");
    h.poll().await.unwrap();

    assert!(h.member("Alpha").await.is_none());
    assert!(h.member("Alpha Two").await.unwrap().skills.is_some());
    assert_eq!(
        h.directory.hub_id("Alpha Two").as_deref(),
        Some("acc-alpha")
    );
    let linked: String = h
        .scalar("SELECT member_name::text FROM groupironman.user_player_links")
        .await;
    assert_eq!(linked, "Alpha Two");
}

#[tokio::test]
async fn rate_limits_are_reported_with_retry_after() {
    let _guard = TEST_MUTEX.lock().await;
    let mut h = harness().await;
    h.hub.lock().unwrap().fail_with = Some(429);
    match h.poll().await {
        Err(HubError::RateLimited(after)) => assert_eq!(after, Duration::from_secs(7)),
        other => panic!("expected a rate limit, got {:?}", other.err()),
    }
    // The client honours Retry-After without calling the hub again.
    let before = h.hub.lock().unwrap().requests.len();
    assert!(matches!(h.poll().await, Err(HubError::RateLimited(_))));
    assert_eq!(h.hub.lock().unwrap().requests.len(), before);
}

#[tokio::test]
async fn places_inventory_by_slot_and_accepts_accounts_without_owner() {
    let _guard = TEST_MUTEX.lock().await;
    let mut h = harness().await;
    let mut account = online_account("acc-alpha", "Alpha", None);
    // Shape of osrs-data-hub PR #8: `owner` is null without an active owner and
    // inventory items carry `inventory_slot` (D-86, D-90).
    account["owner"] = Value::Null;
    account["inventory"]["items"] = json!([
        {"id": 4151, "name": "Abyssal whip", "quantity": 1, "ge_price": 0, "ha_price": 0,
         "equipment_slot": null, "inventory_slot": 0},
        {"id": 385, "name": "Shark", "quantity": 1, "ge_price": 0, "ha_price": 0,
         "equipment_slot": null, "inventory_slot": 27}
    ]);
    h.hub.lock().unwrap().accounts = vec![account];
    h.poll().await.unwrap();

    let inventory = h.member("Alpha").await.unwrap().inventory.unwrap();
    assert_eq!(&inventory[0..2], &[4151, 1]);
    assert_eq!(&inventory[54..56], &[385, 1]);
    let links: i64 = h
        .scalar("SELECT COUNT(*) FROM groupironman.user_player_links")
        .await;
    assert_eq!(links, 0);
}

#[tokio::test]
async fn matches_existing_member_by_account_hash() {
    let _guard = TEST_MUTEX.lock().await;
    let mut h = harness().await;
    // An existing member carries the plugin's accountHash (from an earlier
    // import); on the hub the account goes by a newer name.
    {
        let client = h.pool.get().await.unwrap();
        db::ensure_member_exists(&client, h.group_id, "Old Name")
            .await
            .unwrap();
        client
            .execute(
                "UPDATE groupironman.members SET account_hash='hash-123' WHERE member_name='Old Name'",
                &[],
            )
            .await
            .unwrap();
    }
    let mut account = online_account("acc-alpha", "New Name", None);
    account["account_hash"] = json!("hash-123");
    h.hub.lock().unwrap().accounts = vec![account];
    h.poll().await.unwrap();

    assert!(
        h.member("Old Name").await.is_none(),
        "renamed, not duplicated"
    );
    assert!(h.member("New Name").await.unwrap().coordinates.is_some());
    let bound: String = h
        .scalar(
            "SELECT member_name::text FROM groupironman.members WHERE hub_account_id='acc-alpha'",
        )
        .await;
    assert_eq!(bound, "New Name");
    let members: i64 = h.scalar("SELECT COUNT(*) FROM groupironman.members").await;
    assert_eq!(members, 1);
}

trait TruncSubsecsMs {
    fn trunc_subsecs_ms(self) -> Self;
}
impl TruncSubsecsMs for DateTime<Utc> {
    /// PostgreSQL keeps microseconds; the hub sends milliseconds.
    fn trunc_subsecs_ms(self) -> Self {
        DateTime::from_timestamp_millis(self.timestamp_millis()).unwrap()
    }
}
