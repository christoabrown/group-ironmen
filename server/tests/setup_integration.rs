//! The first-run admin claim (`/api/auth/setup`) with and without `SETUP_TOKEN`
//! (see `update_batcher_integration.rs` for the database setup). Drops the test schema.
use actix_web::{test, web, App};
use deadpool_postgres::{ManagerConfig, Pool, RecyclingMethod};
use serde_json::json;
use std::env;
use tokio_postgres::NoTls;

use server::auth_middleware::LastSeenThrottle;
use server::auth_routes;
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

/// A fresh schema with no users, so setup is open.
async fn empty_database() -> Pool {
    let pool = create_test_pool().await;
    let mut client = pool.get().await.unwrap();
    client
        .execute("DROP SCHEMA IF EXISTS groupironman CASCADE", &[])
        .await
        .unwrap();
    db::update_schema(&mut client).await.unwrap();
    pool
}

fn config_with_setup_token(setup_token: Option<&str>) -> Config {
    let mut config: Config = basic_toml::from_str("").unwrap();
    config.server.setup_token = setup_token.map(str::to_string);
    config
}

async fn user_count(pool: &Pool) -> i64 {
    db::user_count(&pool.get().await.unwrap()).await.unwrap()
}

macro_rules! auth_app {
    ($pool:expr, $config:expr) => {
        test::init_service(
            App::new()
                .app_data(web::Data::new($pool.clone()))
                .app_data(web::Data::new($config))
                .configure(|cfg| auth_routes::configure(cfg, LastSeenThrottle::default())),
        )
        .await
    };
}

fn setup_body(setup_token: Option<&str>) -> serde_json::Value {
    let mut body = json!({"username": "admin", "password": "correct horse"});
    if let Some(token) = setup_token {
        body["setup_token"] = json!(token);
    }
    body
}

#[actix_web::test]
async fn setup_requires_the_token_when_one_is_configured() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = empty_database().await;
    let app = auth_app!(pool, config_with_setup_token(Some("s3cret-token")));

    let request = test::TestRequest::get()
        .uri("/api/auth/setup-status")
        .to_request();
    let status: serde_json::Value = test::call_and_read_body_json(&app, request).await;
    assert_eq!(status, json!({"needs_setup": true, "token_required": true}));

    for (label, header, body) in [
        ("no token", None, setup_body(None)),
        ("wrong body token", None, setup_body(Some("s3cret-tokeN"))),
        ("wrong header token", Some("nope"), setup_body(None)),
        ("prefix of the token", Some("s3cret"), setup_body(None)),
    ] {
        let mut request = test::TestRequest::post()
            .uri("/api/auth/setup")
            .set_json(body);
        if let Some(header) = header {
            request = request.insert_header((auth_routes::SETUP_TOKEN_HEADER, header));
        }
        let response = test::call_service(&app, request.to_request()).await;
        assert_eq!(response.status(), 403, "{label}");
    }
    assert_eq!(user_count(&pool).await, 0);

    // The header works as well as the body field.
    let request = test::TestRequest::post()
        .uri("/api/auth/setup")
        .insert_header((auth_routes::SETUP_TOKEN_HEADER, "s3cret-token"))
        .set_json(setup_body(None))
        .to_request();
    let response = test::call_service(&app, request).await;
    assert_eq!(response.status(), 200);
    assert_eq!(user_count(&pool).await, 1);
}

#[actix_web::test]
async fn setup_accepts_the_token_in_the_body() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = empty_database().await;
    let app = auth_app!(pool, config_with_setup_token(Some("s3cret-token")));

    let request = test::TestRequest::post()
        .uri("/api/auth/setup")
        .set_json(setup_body(Some("s3cret-token")))
        .to_request();
    let response = test::call_service(&app, request).await;
    assert_eq!(response.status(), 200);
    assert_eq!(user_count(&pool).await, 1);
}

#[actix_web::test]
async fn setup_is_open_without_a_configured_token() {
    let _guard = TEST_MUTEX.lock().await;
    let pool = empty_database().await;
    let app = auth_app!(pool, config_with_setup_token(None));

    let request = test::TestRequest::get()
        .uri("/api/auth/setup-status")
        .to_request();
    let status: serde_json::Value = test::call_and_read_body_json(&app, request).await;
    assert_eq!(
        status,
        json!({"needs_setup": true, "token_required": false})
    );

    let request = test::TestRequest::post()
        .uri("/api/auth/setup")
        .set_json(setup_body(None))
        .to_request();
    let response = test::call_service(&app, request).await;
    assert_eq!(response.status(), 200);
    assert_eq!(user_count(&pool).await, 1);

    // Once an admin exists, setup is closed.
    let request = test::TestRequest::post()
        .uri("/api/auth/setup")
        .set_json(setup_body(None))
        .to_request();
    let response = test::call_service(&app, request).await;
    assert_eq!(response.status(), 400);
}
