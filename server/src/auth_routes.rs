use crate::auth_middleware::SessionAuthenticated;
use crate::db;
use crate::error::ApiError;
use crate::models::{
    ChangePasswordRequest, LoginRequest, LoginResponse, SetupRequest, SetupStatusResponse,
};
use actix_web::{cookie, get, post, web, Error, HttpResponse};
use chrono::{Duration, Utc};
use deadpool_postgres::Pool;

const SESSION_DURATION_HOURS: i64 = 72;

fn hash_password(password: &str) -> Result<String, ApiError> {
    bcrypt::hash(password, 12).map_err(ApiError::BcryptError)
}

fn verify_password(password: &str, hash: &str) -> Result<bool, ApiError> {
    bcrypt::verify(password, hash).map_err(ApiError::BcryptError)
}

fn validate_password(password: &str) -> Result<(), ApiError> {
    if password.len() < 8 {
        return Err(ApiError::BadRequest(
            "Password must be at least 8 characters".to_string(),
        ));
    }
    if password.len() > 128 {
        return Err(ApiError::BadRequest(
            "Password must be at most 128 characters".to_string(),
        ));
    }
    Ok(())
}

fn validate_username(username: &str) -> Result<(), ApiError> {
    let trimmed = username.trim();
    if trimmed.is_empty() || trimmed.len() > 32 {
        return Err(ApiError::BadRequest(
            "Username must be between 1 and 32 characters".to_string(),
        ));
    }
    if !trimmed
        .chars()
        .all(|c| c.is_alphanumeric() || c == '_' || c == '-')
    {
        return Err(ApiError::BadRequest(
            "Username may only contain alphanumeric characters, underscores, and hyphens"
                .to_string(),
        ));
    }
    Ok(())
}

#[get("/setup-status")]
pub async fn setup_status(db_pool: web::Data<Pool>) -> Result<HttpResponse, Error> {
    let client = db_pool.get().await.map_err(ApiError::PoolError)?;
    let count = db::user_count(&client).await?;
    Ok(HttpResponse::Ok().json(SetupStatusResponse {
        needs_setup: count == 0,
    }))
}

#[post("/setup")]
pub async fn setup(
    body: web::Json<SetupRequest>,
    db_pool: web::Data<Pool>,
) -> Result<HttpResponse, Error> {
    let client = db_pool.get().await.map_err(ApiError::PoolError)?;

    // Only allow setup if no users exist
    let count = db::user_count(&client).await?;
    if count > 0 {
        return Ok(HttpResponse::BadRequest().body("Setup already completed"));
    }

    validate_username(&body.username)?;
    validate_password(&body.password)?;

    let password_hash = hash_password(&body.password)?;
    let user_id = db::create_user(&client, &body.username, &password_hash, "admin").await?;

    db::write_audit_log(
        &client,
        Some(user_id),
        "setup_admin_created",
        Some(user_id),
        Some(&format!("Initial admin user '{}' created", body.username)),
    )
    .await?;

    // Auto-login after setup
    let session_id = uuid::Uuid::new_v4().hyphenated().to_string();
    let expires_at = Utc::now() + Duration::hours(SESSION_DURATION_HOURS);
    db::create_session(&client, &session_id, user_id, &expires_at).await?;

    let cookie = cookie::Cookie::build("session", session_id.clone())
        .path("/")
        .http_only(true)
        .same_site(cookie::SameSite::Lax)
        .max_age(cookie::time::Duration::hours(SESSION_DURATION_HOURS))
        .finish();

    Ok(HttpResponse::Ok().cookie(cookie).json(LoginResponse {
        ok: true,
        session_token: session_id,
        role: "admin".to_string(),
        username: body.username.clone(),
    }))
}

#[post("/login")]
pub async fn login(
    body: web::Json<LoginRequest>,
    db_pool: web::Data<Pool>,
) -> Result<HttpResponse, Error> {
    let client = db_pool.get().await.map_err(ApiError::PoolError)?;

    let (user_id, password_hash, role, enabled) =
        db::get_user_by_username(&client, &body.username).await?;

    if !enabled {
        return Ok(HttpResponse::Unauthorized().body("Account is disabled"));
    }

    let valid = verify_password(&body.password, &password_hash)?;
    if !valid {
        return Ok(HttpResponse::Unauthorized().body("Invalid username or password"));
    }

    // Clean up expired sessions periodically
    let _ = db::cleanup_expired_sessions(&client).await;

    let session_id = uuid::Uuid::new_v4().hyphenated().to_string();
    let expires_at = Utc::now() + Duration::hours(SESSION_DURATION_HOURS);
    db::create_session(&client, &session_id, user_id, &expires_at).await?;

    let cookie = cookie::Cookie::build("session", session_id.clone())
        .path("/")
        .http_only(true)
        .same_site(cookie::SameSite::Lax)
        .max_age(cookie::time::Duration::hours(SESSION_DURATION_HOURS))
        .finish();

    Ok(HttpResponse::Ok().cookie(cookie).json(LoginResponse {
        ok: true,
        session_token: session_id,
        role,
        username: body.username.clone(),
    }))
}

#[post("/logout")]
pub async fn logout(
    session: SessionAuthenticated,
    db_pool: web::Data<Pool>,
    req: actix_web::HttpRequest,
) -> Result<HttpResponse, Error> {
    let client = db_pool.get().await.map_err(ApiError::PoolError)?;

    // Extract session token from cookie to delete the specific session
    if let Some(cookie) = req.cookie("session") {
        let _ = db::delete_session(&client, cookie.value()).await;
    }

    db::write_audit_log(
        &client,
        Some(session.user.user_id),
        "logout",
        None,
        Some(&format!("User '{}' logged out", session.user.username)),
    )
    .await?;

    let cookie = cookie::Cookie::build("session", "")
        .path("/")
        .http_only(true)
        .same_site(cookie::SameSite::Lax)
        .max_age(cookie::time::Duration::ZERO)
        .finish();

    Ok(HttpResponse::Ok()
        .cookie(cookie)
        .json(serde_json::json!({"ok": true})))
}

#[get("/me")]
pub async fn me(session: SessionAuthenticated) -> Result<HttpResponse, Error> {
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "user_id": session.user.user_id,
        "username": session.user.username,
        "role": session.user.role,
    })))
}

#[post("/change-password")]
pub async fn change_password(
    session: SessionAuthenticated,
    body: web::Json<ChangePasswordRequest>,
    db_pool: web::Data<Pool>,
) -> Result<HttpResponse, Error> {
    let client = db_pool.get().await.map_err(ApiError::PoolError)?;

    // Verify current password
    let (_, current_hash, _, _) = db::get_user_by_username(&client, &session.user.username).await?;
    let valid = verify_password(&body.current_password, &current_hash)?;
    if !valid {
        return Ok(HttpResponse::BadRequest().body("Current password is incorrect"));
    }

    validate_password(&body.new_password)?;

    let new_hash = hash_password(&body.new_password)?;
    db::update_user_password(&client, session.user.user_id, &new_hash).await?;

    db::write_audit_log(
        &client,
        Some(session.user.user_id),
        "password_changed",
        Some(session.user.user_id),
        Some(&format!(
            "User '{}' changed their password",
            session.user.username
        )),
    )
    .await?;

    Ok(HttpResponse::Ok().json(serde_json::json!({"ok": true})))
}
