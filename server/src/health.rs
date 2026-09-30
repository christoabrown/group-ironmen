use actix_web::{get, web, HttpResponse};
use deadpool_postgres::Pool;
use std::time::Duration;

/// How long the check may take before it answers 503. Shorter than the pool's
/// wait timeout, so a probe gets an answer instead of timing out itself.
const CHECK_TIMEOUT: Duration = Duration::from_secs(2);

/// Liveness and readiness probe: 200 when a pooled connection answers
/// `SELECT 1`, 503 otherwise. No session, and kept out of the access log.
#[get("/health")]
pub async fn health(db_pool: web::Data<Pool>) -> HttpResponse {
    let check = async {
        let client = db_pool.get().await.ok()?;
        client.query_one("SELECT 1", &[]).await.ok()
    };
    match tokio::time::timeout(CHECK_TIMEOUT, check).await {
        Ok(Some(_)) => HttpResponse::Ok().json(serde_json::json!({"status": "ok"})),
        _ => HttpResponse::ServiceUnavailable().json(serde_json::json!({"status": "unavailable"})),
    }
}
