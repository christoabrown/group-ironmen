//! `/api/auth`: signing in (see `discord_routes`), who is signed in, and
//! signing out.
use crate::auth_middleware::{Authenticated, SessionMiddlewareFactory, SESSION_COOKIE};
use crate::config::Config;
use crate::db;
use crate::error::ApiError;
use crate::models::Session;
use actix_web::{cookie, get, post, web, Error, HttpRequest, HttpResponse};
use chrono::{Duration, Utc};
use deadpool_postgres::{Client, Pool};

pub const SESSION_DURATION_HOURS: i64 = 72;

/// Mounts `/api/auth`. Actix matches the first scope with a matching prefix
/// and never falls through to a second one with the same prefix, so the
/// session-protected route is a nested scope after the public ones.
pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/api/auth")
            .service(crate::discord_routes::discord_start)
            .service(crate::discord_routes::discord_callback)
            .service(logout)
            .service(web::scope("").wrap(SessionMiddlewareFactory).service(me)),
    );
}

/// Builds the `session` cookie. Every place that sets or clears the session
/// cookie goes through here so the attributes stay consistent.
fn session_cookie(
    value: &str,
    max_age: cookie::time::Duration,
    config: &Config,
) -> cookie::Cookie<'static> {
    cookie::Cookie::build(SESSION_COOKIE, value.to_owned())
        .path("/")
        .http_only(true)
        .secure(config.server.secure_cookies)
        .same_site(cookie::SameSite::Lax)
        .max_age(max_age)
        .finish()
}

/// Starts a session for someone the hub calls a member, and answers with the
/// cookie that carries it and with who they are.
pub async fn start_session(
    client: &Client,
    config: &Config,
    session: Session,
) -> Result<HttpResponse, ApiError> {
    // As good a moment as any to clear out the ones that have run out.
    let _ = db::cleanup_expired_sessions(client).await;
    let session_id = uuid::Uuid::new_v4().hyphenated().to_string();
    let expires_at = Utc::now() + Duration::hours(SESSION_DURATION_HOURS);
    db::create_session(client, &session_id, &session, &expires_at).await?;
    let cookie = session_cookie(
        &session_id,
        cookie::time::Duration::hours(SESSION_DURATION_HOURS),
        config,
    );
    Ok(HttpResponse::Ok().cookie(cookie).json(session))
}

/// Ends the session of the cookie, if there is one. Needs no session: someone
/// whose session has run out can still be rid of the cookie.
#[post("/logout")]
pub async fn logout(
    db_pool: web::Data<Pool>,
    config: web::Data<Config>,
    req: HttpRequest,
) -> Result<HttpResponse, Error> {
    if let Some(cookie) = req.cookie(SESSION_COOKIE) {
        let client = db_pool.get().await.map_err(ApiError::PoolError)?;
        db::delete_session(&client, cookie.value()).await?;
    }
    Ok(HttpResponse::Ok()
        .cookie(session_cookie("", cookie::time::Duration::ZERO, &config))
        .json(serde_json::json!({"ok": true})))
}

/// Who is signed in: `{name, is_admin}`.
#[get("/me")]
pub async fn me(session: Authenticated) -> Result<HttpResponse, Error> {
    Ok(HttpResponse::Ok().json(&*session))
}

#[cfg(test)]
mod tests {
    use super::*;
    use actix_web::{test, App};

    #[actix_web::test]
    async fn who_is_signed_in_needs_a_session() {
        let app = test::init_service(App::new().configure(configure)).await;
        // Rejected by the middleware, not a 404: the nested scope is reached.
        let request = test::TestRequest::get().uri("/api/auth/me").to_request();
        let response = test::call_service(&app, request).await;
        assert_eq!(response.status(), 401);
    }
}
