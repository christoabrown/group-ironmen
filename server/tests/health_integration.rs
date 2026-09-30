//! `GET /api/health`, the endpoint Kubernetes probes (see
//! `update_batcher_integration.rs` for the database setup). Touches no schema.
use actix_web::{test, web, App};
use deadpool_postgres::{ManagerConfig, Pool, RecyclingMethod};
use std::env;
use tokio_postgres::NoTls;

use server::config::Config;
use server::health;

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

/// Mounted as `main.rs` mounts it: inside the public `/api` scope.
async fn call_health(pool: Pool) -> (u16, serde_json::Value) {
    let app = test::init_service(
        App::new()
            .app_data(web::Data::new(pool))
            .service(web::scope("/api").service(health::health)),
    )
    .await;
    let request = test::TestRequest::get().uri("/api/health").to_request();
    let response = test::call_service(&app, request).await;
    let status = response.status().as_u16();
    let body: serde_json::Value = test::read_body_json(response).await;
    (status, body)
}

#[actix_web::test]
async fn health_is_ok_when_the_database_answers() {
    let (status, body) = call_health(create_test_pool().await).await;
    assert_eq!(status, 200);
    assert_eq!(body["status"], "ok");
}

#[actix_web::test]
async fn health_is_unavailable_without_a_database() {
    // Nothing listens on port 1, so every connection attempt fails.
    let mut cfg = deadpool_postgres::Config::new();
    cfg.url = Some("postgres://postgres:postgres@127.0.0.1:1/none".to_string());
    let pool = cfg.create_pool(None, NoTls).unwrap();

    let (status, body) = call_health(pool).await;
    assert_eq!(status, 503);
    assert_eq!(body["status"], "unavailable");
}
