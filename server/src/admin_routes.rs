//! What a hub admin can do on the map: see every player the hub shares, hide
//! one from the map, and delete one the hub no longer shares.
use crate::auth_middleware::AdminAuthenticated;
use crate::db;
use crate::error::ApiError;
use crate::hub::HubContext;
use crate::models::GroupId;
use actix_web::{delete, get, put, web, Error, HttpResponse};
use deadpool_postgres::{Client, Pool};

#[get("/players")]
pub async fn list_players(
    _admin: AdminAuthenticated,
    db_pool: web::Data<Pool>,
    group_id: web::Data<GroupId>,
) -> Result<HttpResponse, Error> {
    let client = db_pool.get().await.map_err(ApiError::PoolError)?;
    let players = db::list_players(&client, group_id.0).await?;
    Ok(HttpResponse::Ok().json(players))
}

#[derive(serde::Deserialize)]
pub struct PlayerPath {
    pub member_name: String,
}

#[delete("/players/{member_name}")]
pub async fn delete_player(
    admin: AdminAuthenticated,
    path: web::Path<PlayerPath>,
    db_pool: web::Data<Pool>,
    group_id: web::Data<GroupId>,
    hub: web::Data<HubContext>,
) -> Result<HttpResponse, Error> {
    let member_name = &path.member_name;
    let mut client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    db::delete_group_member(&mut client, group_id.0, member_name).await?;
    // A deleted member the hub still shares comes back with the next full sync.
    hub.directory.remove_member(member_name);
    hub.sync_control.forget_member(member_name);
    log::info!("Admin '{}' deleted player '{}'", admin.name, member_name);

    Ok(HttpResponse::Ok().json(serde_json::json!({"ok": true})))
}

#[derive(serde::Deserialize)]
pub struct SetHiddenRequest {
    pub hidden: bool,
}

/// Hides a player from the map (the hub keeps sharing it, the map ignores it),
/// or shows it again.
#[put("/players/{member_name}/hidden")]
pub async fn set_player_hidden(
    admin: AdminAuthenticated,
    path: web::Path<PlayerPath>,
    body: web::Json<SetHiddenRequest>,
    db_pool: web::Data<Pool>,
    group_id: web::Data<GroupId>,
    hub: web::Data<HubContext>,
) -> Result<HttpResponse, Error> {
    let member_name = &path.member_name;
    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    if !db::set_member_hidden(&client, group_id.0, member_name, body.hidden).await? {
        return Ok(HttpResponse::NotFound().body("No such player"));
    }
    // Hide the player's events and leaderboard entries at once, not only
    // after the sync has resolved the member again.
    if let Some(hub_id) = hub.directory.hub_id(member_name) {
        hub.directory.set_hidden(&hub_id, body.hidden);
    }
    hub.directory.remove_member(member_name);
    hub.sync_control.forget_member(member_name);
    log::info!(
        "Admin '{}' {} player '{}'",
        admin.name,
        if body.hidden { "hid" } else { "showed" },
        member_name
    );

    Ok(HttpResponse::Ok().json(serde_json::json!({"ok": true})))
}
