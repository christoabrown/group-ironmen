//! Per-player history from the hub for the site's player profile: XP gains,
//! play sessions, carried wealth, worn-gear changes and recent events. A hub
//! 404 (the owner doesn't share that category) becomes `not_available`, which
//! the site shows as "not shared".
use crate::auth_middleware::Authenticated;
use crate::config::Config;
use crate::hub::client::HubError;
use crate::hub::convert::equipment;
use crate::hub::models::{
    HubAccountGains, HubEquipmentHistory, HubEvent, HubItems, HubSessions, HubWealth,
};
use crate::hub::proxy::{event_json, fetch_value, history_enabled, hub_error_response, parse};
use crate::hub::HubContext;
use actix_web::{get, web, Error, HttpResponse};
use chrono::{Duration as ChronoDuration, Utc};
use serde::Deserialize;
use serde_json::Value;
use std::sync::Arc;
use std::time::Duration;

const GAINS_TTL: Duration = Duration::from_secs(120);
const SESSIONS_TTL: Duration = Duration::from_secs(60);
const WEALTH_TTL: Duration = Duration::from_secs(300);
const GEAR_TTL: Duration = Duration::from_secs(120);
const EVENTS_TTL: Duration = Duration::from_secs(30);
/// Worn-gear changes returned at most; the site shows the most recent ones.
const MAX_GEAR_CHANGES: usize = 50;

#[derive(Deserialize)]
pub struct ProfileQuery {
    #[serde(default)]
    period: Option<String>,
    #[serde(default)]
    days: Option<i64>,
    #[serde(default)]
    limit: Option<u32>,
}

type HubRequest = (String, Vec<(&'static str, String)>);

/// Fetches the hub request `request` builds for the member's hub account,
/// through the cache, and parses it; or answers with the error response the
/// site expects.
async fn fetch_for_member<T: serde::de::DeserializeOwned>(
    context: &HubContext,
    config: &Config,
    member: &str,
    ttl: Duration,
    request: impl FnOnce(&str) -> HubRequest,
) -> Result<T, HttpResponse> {
    history_enabled(config)?;
    let Some(hub_id) = context.directory.hub_id(member) else {
        return Err(hub_error_response(HubError::NotFound));
    };
    let (path, query) = request(&urlencoding::encode(&hub_id));
    let key = format!(
        "{}?{}",
        path,
        query
            .iter()
            .map(|(name, value)| format!("{name}={value}"))
            .collect::<Vec<_>>()
            .join("&")
    );
    let client = Arc::clone(&context.client);
    context
        .cache
        .get_or_fetch(&key, ttl, || async {
            fetch_value::<Value>(&client, &path, &query).await
        })
        .await
        .and_then(|value| parse::<T>(&value))
        .map_err(hub_error_response)
}

/// `from` for the last `days` days (default and maximum given), rounded down
/// to the minute so that cached responses are reused.
fn from_days(days: Option<i64>, default: i64, max: i64) -> String {
    let days = days.unwrap_or(default).clamp(1, max);
    let from = Utc::now() - ChronoDuration::days(days);
    let from = from.timestamp() - from.timestamp() % 60;
    chrono::DateTime::from_timestamp(from, 0)
        .unwrap_or_default()
        .to_rfc3339()
}

macro_rules! respond {
    ($result:expr) => {
        match $result {
            Ok(value) => value,
            Err(response) => return Ok(response),
        }
    };
}

/// XP gained per skill, Overall first.
#[get("/hub/players/{member}/gains")]
pub async fn get_player_gains(
    _auth: Authenticated,
    path: web::Path<String>,
    query: web::Query<ProfileQuery>,
    config: web::Data<Config>,
    context: web::Data<HubContext>,
) -> Result<HttpResponse, Error> {
    let period = match query.period.as_deref().unwrap_or("day") {
        period @ ("day" | "week" | "month" | "year") => period.to_owned(),
        _ => return Ok(HttpResponse::BadRequest().body("period must be day, week, month or year")),
    };
    let gains: HubAccountGains = respond!(
        fetch_for_member(&context, &config, &path, GAINS_TTL, |id| (
            format!("/accounts/{id}/gains"),
            vec![("period", period)]
        ))
        .await
    );
    Ok(HttpResponse::Ok().json(gains))
}

/// Play sessions of the last `days` (default 7), newest first, and their total.
#[get("/hub/players/{member}/sessions")]
pub async fn get_player_sessions(
    _auth: Authenticated,
    path: web::Path<String>,
    query: web::Query<ProfileQuery>,
    config: web::Data<Config>,
    context: web::Data<HubContext>,
) -> Result<HttpResponse, Error> {
    let from = from_days(query.days, 7, 30);
    let sessions: HubSessions = respond!(
        fetch_for_member(&context, &config, &path, SESSIONS_TTL, |id| (
            format!("/accounts/{id}/sessions"),
            vec![("from", from)]
        ))
        .await
    );
    let total_ms: i64 = sessions
        .sessions
        .iter()
        .map(|session| session.duration_ms.unwrap_or(0))
        .sum();
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "sessions": sessions.sessions,
        "total_ms": total_ms,
    })))
}

/// Carried value (inventory and equipment) per day, oldest first.
#[get("/hub/players/{member}/wealth")]
pub async fn get_player_wealth(
    _auth: Authenticated,
    path: web::Path<String>,
    query: web::Query<ProfileQuery>,
    config: web::Data<Config>,
    context: web::Data<HubContext>,
) -> Result<HttpResponse, Error> {
    let from = from_days(query.days, 30, 90);
    let wealth: HubWealth = respond!(
        fetch_for_member(&context, &config, &path, WEALTH_TTL, |id| (
            format!("/accounts/{id}/wealth"),
            vec![("from", from)]
        ))
        .await
    );
    Ok(HttpResponse::Ok().json(wealth))
}

/// Worn-gear changes, newest first, each as the 14 equipment slots (id/quantity
/// pairs, the same layout as the member's `equipment`).
#[get("/hub/players/{member}/equipment-history")]
pub async fn get_player_equipment_history(
    _auth: Authenticated,
    path: web::Path<String>,
    query: web::Query<ProfileQuery>,
    config: web::Data<Config>,
    context: web::Data<HubContext>,
) -> Result<HttpResponse, Error> {
    let from = from_days(query.days, 30, 90);
    let history: HubEquipmentHistory = respond!(
        fetch_for_member(&context, &config, &path, GEAR_TTL, |id| (
            format!("/accounts/{id}/equipment-history"),
            vec![("from", from)]
        ))
        .await
    );
    let changes: Vec<Value> = history
        .changes
        .into_iter()
        .take(MAX_GEAR_CHANGES)
        .map(|change| {
            serde_json::json!({
                "changed_at": change.changed_at,
                "equipment": equipment(&HubItems {
                    value: None,
                    items: change.items,
                }),
            })
        })
        .collect();
    Ok(HttpResponse::Ok().json(serde_json::json!({ "changes": changes })))
}

/// The member's most recent events from the hub (not only the buffered ones),
/// newest first.
#[get("/hub/players/{member}/events")]
pub async fn get_player_events(
    _auth: Authenticated,
    path: web::Path<String>,
    query: web::Query<ProfileQuery>,
    config: web::Data<Config>,
    context: web::Data<HubContext>,
) -> Result<HttpResponse, Error> {
    let limit = query.limit.unwrap_or(50).clamp(1, 200);
    let events: Vec<HubEvent> = respond!(
        fetch_for_member(&context, &config, &path, EVENTS_TTL, |id| (
            "/events".to_string(),
            vec![("accounts", id.to_owned()), ("limit", limit.to_string())]
        ))
        .await
    );
    // Without a cursor the hub returns the newest events oldest first.
    let events: Vec<Value> = events
        .iter()
        .rev()
        .map(|event| event_json(None, event, &context.directory))
        .collect();
    Ok(HttpResponse::Ok().json(events))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn from_days_is_clamped_and_rounded_to_the_minute() {
        let from: chrono::DateTime<Utc> = from_days(Some(500), 7, 30).parse().unwrap();
        let days = (Utc::now() - from).num_days();
        assert!((29..=30).contains(&days));
        assert_eq!(from.timestamp() % 60, 0);
    }
}
