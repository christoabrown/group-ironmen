//! Feature flags for the site and the admin view of the hub connection.
use crate::auth_middleware::{AdminAuthenticated, Authenticated};
use crate::config::Config;
use crate::hub::client::{HubError, Priority};
use crate::hub::models::HubMe;
use crate::hub::HubContext;
use actix_web::{get, post, web, Error, HttpResponse};

/// What the site should show: pairing instructions, hub-backed history, or both.
#[get("/features")]
pub async fn get_features(
    _auth: Authenticated,
    config: web::Data<Config>,
) -> Result<HttpResponse, Error> {
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "data_source": config.data_source,
        "direct_pairing": config.data_source.accepts_direct(),
        "hub_history": config.hub_history_enabled(),
    })))
}

#[get("/hub/status")]
pub async fn get_hub_status(
    _admin: AdminAuthenticated,
    context: web::Data<HubContext>,
) -> Result<HttpResponse, Error> {
    let status = context
        .status
        .read()
        .map(|status| status.clone())
        .unwrap_or_default();
    Ok(HttpResponse::Ok().json(status))
}

/// Checks the API key against the hub's `/me`.
#[post("/hub/test")]
pub async fn test_hub_connection(
    _admin: AdminAuthenticated,
    context: web::Data<HubContext>,
) -> Result<HttpResponse, Error> {
    let Some(client) = &context.client else {
        return Ok(HttpResponse::Ok().json(serde_json::json!({
            "ok": false,
            "message": "The hub is not configured (set DATA_SOURCE, HUB_BASE_URL and HUB_API_KEY)."
        })));
    };
    let response = match client.get_data::<HubMe>("/me", &[], Priority::Sync).await {
        Ok((me, _)) => serde_json::json!({
            "ok": true,
            "key": me.key,
            "visible_accounts": me.visible_accounts,
        }),
        Err(HubError::Unauthorized) => serde_json::json!({
            "ok": false,
            "message": "The hub rejected the API key. It may be revoked or expired."
        }),
        Err(err) => serde_json::json!({ "ok": false, "message": err.to_string() }),
    };
    Ok(HttpResponse::Ok().json(response))
}
