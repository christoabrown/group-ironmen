use crate::auth_middleware::AdminAuthenticated;
use crate::db;
use crate::error::ApiError;
use crate::models::{AdminChangePasswordRequest, ChangeRoleRequest, CreateUserRequest};
use actix_web::{delete, get, post, put, web, Error, HttpResponse};
use deadpool_postgres::{Client, Pool};

fn hash_password(password: &str) -> Result<String, ApiError> {
    bcrypt::hash(password, 12).map_err(ApiError::BcryptError)
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

fn validate_role(role: &str) -> Result<(), ApiError> {
    if role != "admin" && role != "member" {
        return Err(ApiError::BadRequest(
            "Role must be 'admin' or 'member'".to_string(),
        ));
    }
    Ok(())
}

#[get("/users")]
pub async fn list_users(
    _admin: AdminAuthenticated,
    db_pool: web::Data<Pool>,
) -> Result<HttpResponse, Error> {
    let client = db_pool.get().await.map_err(ApiError::PoolError)?;
    let users = db::list_users(&client).await?;
    Ok(HttpResponse::Ok().json(users))
}

#[post("/users")]
pub async fn create_user(
    admin: AdminAuthenticated,
    body: web::Json<CreateUserRequest>,
    db_pool: web::Data<Pool>,
) -> Result<HttpResponse, Error> {
    let client = db_pool.get().await.map_err(ApiError::PoolError)?;

    validate_username(&body.username)?;
    validate_password(&body.password)?;
    validate_role(&body.role)?;

    let password_hash = hash_password(&body.password)?;
    let user_id = db::create_user(&client, &body.username, &password_hash, &body.role).await?;

    db::write_audit_log(
        &client,
        Some(admin.user.user_id),
        "user_created",
        Some(user_id),
        Some(&format!(
            "Admin '{}' created user '{}' with role '{}'",
            admin.user.username, body.username, body.role
        )),
    )
    .await?;

    let user = db::get_user_by_id(&client, user_id).await?;
    Ok(HttpResponse::Created().json(user))
}

#[put("/users/{user_id}/role")]
pub async fn change_user_role(
    admin: AdminAuthenticated,
    path: web::Path<i64>,
    body: web::Json<ChangeRoleRequest>,
    db_pool: web::Data<Pool>,
) -> Result<HttpResponse, Error> {
    let target_user_id = path.into_inner();
    let client = db_pool.get().await.map_err(ApiError::PoolError)?;

    validate_role(&body.role)?;

    let target_user = db::get_user_by_id(&client, target_user_id).await?;
    db::update_user_role(&client, target_user_id, &body.role).await?;

    db::write_audit_log(
        &client,
        Some(admin.user.user_id),
        "role_changed",
        Some(target_user_id),
        Some(&format!(
            "Admin '{}' changed role of '{}' from '{}' to '{}'",
            admin.user.username, target_user.username, target_user.role, body.role
        )),
    )
    .await?;

    Ok(HttpResponse::Ok().json(serde_json::json!({"ok": true})))
}

#[put("/users/{user_id}/disable")]
pub async fn disable_user(
    admin: AdminAuthenticated,
    path: web::Path<i64>,
    db_pool: web::Data<Pool>,
) -> Result<HttpResponse, Error> {
    let target_user_id = path.into_inner();
    let client = db_pool.get().await.map_err(ApiError::PoolError)?;

    if target_user_id == admin.user.user_id {
        return Ok(HttpResponse::BadRequest().body("Cannot disable your own account"));
    }

    let target_user = db::get_user_by_id(&client, target_user_id).await?;
    db::update_user_enabled(&client, target_user_id, false).await?;
    db::delete_user_sessions(&client, target_user_id).await?;

    db::write_audit_log(
        &client,
        Some(admin.user.user_id),
        "user_disabled",
        Some(target_user_id),
        Some(&format!(
            "Admin '{}' disabled user '{}'",
            admin.user.username, target_user.username
        )),
    )
    .await?;

    Ok(HttpResponse::Ok().json(serde_json::json!({"ok": true})))
}

#[put("/users/{user_id}/enable")]
pub async fn enable_user(
    admin: AdminAuthenticated,
    path: web::Path<i64>,
    db_pool: web::Data<Pool>,
) -> Result<HttpResponse, Error> {
    let target_user_id = path.into_inner();
    let client = db_pool.get().await.map_err(ApiError::PoolError)?;

    let target_user = db::get_user_by_id(&client, target_user_id).await?;
    db::update_user_enabled(&client, target_user_id, true).await?;

    db::write_audit_log(
        &client,
        Some(admin.user.user_id),
        "user_enabled",
        Some(target_user_id),
        Some(&format!(
            "Admin '{}' enabled user '{}'",
            admin.user.username, target_user.username
        )),
    )
    .await?;

    Ok(HttpResponse::Ok().json(serde_json::json!({"ok": true})))
}

#[delete("/users/{user_id}")]
pub async fn kick_user(
    admin: AdminAuthenticated,
    path: web::Path<i64>,
    db_pool: web::Data<Pool>,
) -> Result<HttpResponse, Error> {
    let target_user_id = path.into_inner();
    let client = db_pool.get().await.map_err(ApiError::PoolError)?;

    if target_user_id == admin.user.user_id {
        return Ok(HttpResponse::BadRequest().body("Cannot delete your own account"));
    }

    let target_user = db::get_user_by_id(&client, target_user_id).await?;

    // Revoke all tokens and devices
    let devices_revoked = db::revoke_user_devices(&client, target_user_id).await?;
    let codes_revoked = db::revoke_user_pairing_codes(&client, target_user_id).await?;

    // Delete sessions
    db::delete_user_sessions(&client, target_user_id).await?;

    // Delete user
    db::delete_user(&client, target_user_id).await?;

    db::write_audit_log(
        &client,
        Some(admin.user.user_id),
        "user_kicked",
        None, // user already deleted
        Some(&format!(
            "Admin '{}' kicked/deleted user '{}' (devices revoked: {}, codes revoked: {})",
            admin.user.username, target_user.username, devices_revoked, codes_revoked
        )),
    )
    .await?;

    Ok(HttpResponse::Ok().json(serde_json::json!({"ok": true})))
}

#[put("/users/{user_id}/password")]
pub async fn admin_change_password(
    admin: AdminAuthenticated,
    path: web::Path<i64>,
    body: web::Json<AdminChangePasswordRequest>,
    db_pool: web::Data<Pool>,
) -> Result<HttpResponse, Error> {
    let target_user_id = path.into_inner();
    let client = db_pool.get().await.map_err(ApiError::PoolError)?;

    validate_password(&body.new_password)?;

    let target_user = db::get_user_by_id(&client, target_user_id).await?;
    let new_hash = hash_password(&body.new_password)?;
    db::update_user_password(&client, target_user_id, &new_hash).await?;

    // Invalidate all sessions for the target user
    db::delete_user_sessions(&client, target_user_id).await?;

    db::write_audit_log(
        &client,
        Some(admin.user.user_id),
        "admin_password_reset",
        Some(target_user_id),
        Some(&format!(
            "Admin '{}' reset password for user '{}'",
            admin.user.username, target_user.username
        )),
    )
    .await?;

    Ok(HttpResponse::Ok().json(serde_json::json!({"ok": true})))
}

#[get("/audit-log")]
pub async fn get_audit_log(
    _admin: AdminAuthenticated,
    db_pool: web::Data<Pool>,
) -> Result<HttpResponse, Error> {
    let client = db_pool.get().await.map_err(ApiError::PoolError)?;
    let entries = db::get_audit_log(&client, 200).await?;
    Ok(HttpResponse::Ok().json(entries))
}

#[get("/players")]
pub async fn list_players(
    _admin: AdminAuthenticated,
    db_pool: web::Data<Pool>,
    group_id: web::Data<i64>,
) -> Result<HttpResponse, Error> {
    let client = db_pool.get().await.map_err(ApiError::PoolError)?;
    let players = db::list_players(&client, **group_id).await?;
    Ok(HttpResponse::Ok().json(players))
}

#[derive(serde::Deserialize)]
pub struct DeletePlayerPath {
    pub member_name: String,
}

#[delete("/players/{member_name}")]
pub async fn delete_player(
    admin: AdminAuthenticated,
    path: web::Path<DeletePlayerPath>,
    db_pool: web::Data<Pool>,
    group_id: web::Data<i64>,
) -> Result<HttpResponse, Error> {
    let member_name = &path.member_name;
    let mut client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    db::delete_group_member(&mut client, **group_id, member_name).await?;

    db::write_audit_log(
        &client,
        Some(admin.user.user_id),
        "player_deleted",
        None,
        Some(&format!(
            "Admin '{}' deleted player '{}'",
            admin.user.username, member_name
        )),
    )
    .await?;

    Ok(HttpResponse::Ok().json(serde_json::json!({"ok": true})))
}

#[get("/users/{user_id}/players")]
pub async fn get_user_players(
    _admin: AdminAuthenticated,
    path: web::Path<i64>,
    db_pool: web::Data<Pool>,
    group_id: web::Data<i64>,
) -> Result<HttpResponse, Error> {
    let user_id = path.into_inner();
    let client = db_pool.get().await.map_err(ApiError::PoolError)?;
    let players = db::get_players_for_user(&client, user_id, **group_id).await?;
    Ok(HttpResponse::Ok().json(players))
}

#[derive(serde::Deserialize)]
pub struct PlayerLinksPath {
    pub member_name: String,
}

#[get("/players/{member_name}/users")]
pub async fn get_player_users(
    _admin: AdminAuthenticated,
    path: web::Path<PlayerLinksPath>,
    db_pool: web::Data<Pool>,
    group_id: web::Data<i64>,
) -> Result<HttpResponse, Error> {
    let member_name = &path.member_name;
    let client = db_pool.get().await.map_err(ApiError::PoolError)?;
    let users = db::get_users_for_player(&client, member_name, **group_id).await?;
    Ok(HttpResponse::Ok().json(users))
}

#[derive(serde::Deserialize)]
pub struct PlayerUserLinkPath {
    pub member_name: String,
    pub user_id: i64,
}

/// Links a user to a player by hand, e.g. for players imported from the hub.
#[post("/players/{member_name}/users/{user_id}")]
pub async fn link_player_user(
    admin: AdminAuthenticated,
    path: web::Path<PlayerUserLinkPath>,
    db_pool: web::Data<Pool>,
    group_id: web::Data<i64>,
) -> Result<HttpResponse, Error> {
    let client = db_pool.get().await.map_err(ApiError::PoolError)?;
    if !db::is_member_in_group(&client, **group_id, &path.member_name).await? {
        return Ok(HttpResponse::NotFound().body("Player not found"));
    }
    db::upsert_user_player_link_with_source(
        &client,
        path.user_id,
        &path.member_name,
        **group_id,
        "manual",
    )
    .await?;
    db::write_audit_log(
        &client,
        Some(admin.user.user_id),
        "player_linked",
        Some(path.user_id),
        Some(&format!(
            "Admin '{}' linked player '{}' to user {}",
            admin.user.username, path.member_name, path.user_id
        )),
    )
    .await?;
    Ok(HttpResponse::Ok().json(serde_json::json!({"ok": true})))
}

#[delete("/players/{member_name}/users/{user_id}")]
pub async fn unlink_player_user(
    admin: AdminAuthenticated,
    path: web::Path<PlayerUserLinkPath>,
    db_pool: web::Data<Pool>,
    group_id: web::Data<i64>,
) -> Result<HttpResponse, Error> {
    let client = db_pool.get().await.map_err(ApiError::PoolError)?;
    let removed =
        db::delete_user_player_link(&client, path.user_id, &path.member_name, **group_id).await?;
    if removed == 0 {
        return Ok(HttpResponse::NotFound().body("Link not found"));
    }
    db::write_audit_log(
        &client,
        Some(admin.user.user_id),
        "player_unlinked",
        Some(path.user_id),
        Some(&format!(
            "Admin '{}' unlinked player '{}' from user {}",
            admin.user.username, path.member_name, path.user_id
        )),
    )
    .await?;
    Ok(HttpResponse::Ok().json(serde_json::json!({"ok": true})))
}
