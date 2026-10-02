//! Per-player history from the hub for the site's player profile: XP gains,
//! play sessions, carried wealth, worn-gear changes and recent events. A hub
//! 404 (the owner doesn't share that category) becomes `not_available`, which
//! the site shows as "not shared".
use crate::auth_middleware::Authenticated;
use crate::config::Config;
use crate::hub::client::{HubClient, HubError, Priority};
use crate::hub::convert::equipment;
use crate::hub::models::{
    HubAccountGains, HubEquipmentHistory, HubEvent, HubItems, HubSessions, HubWealth,
};
use crate::hub::proxy::{event_json, fetch_value, history_enabled, hub_error_response, parse};
use crate::hub::HubContext;
use actix_web::{get, web, Error, HttpResponse};
use chrono::{DateTime, Duration as ChronoDuration, Utc};
use serde::Deserialize;
use serde_json::Value;
use std::future::Future;
use std::sync::Arc;
use std::time::Duration;

const GAINS_TTL: Duration = Duration::from_secs(120);
const SESSIONS_TTL: Duration = Duration::from_secs(60);
const WEALTH_TTL: Duration = Duration::from_secs(300);
const GEAR_TTL: Duration = Duration::from_secs(120);
const EVENTS_TTL: Duration = Duration::from_secs(30);
/// The events along a trail. The site asks for them once per trail and again
/// every ten minutes; what happens in between reaches it with the live feed.
const RANGE_EVENTS_TTL: Duration = Duration::from_secs(120);
/// The longest trail there is, in days.
const RANGE_MAX_DAYS: i64 = 30;
/// Events per hub page (the hub's maximum), and how many are read for one
/// trail at most: of drops, and of everything else.
const RANGE_PAGE: usize = 500;
const RANGE_EVENTS_MAX: usize = 2000;
const LOOT_TYPES: &str = "loot,pk_loot";
const OTHER_TYPES: &str =
    "death,level_up,collection_log,superior_spawn,achievement_diary,combat_task";
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
    #[serde(default)]
    min_loot: Option<i64>,
}

type HubRequest = (String, Vec<(&'static str, String)>);

/// Fetches the hub request `request` builds for the member's hub account,
/// through the cache, and parses it; or answers with the error response the
/// site expects. `what` tells the request apart from the member's others in
/// the cache, and holds nothing that changes with the time of asking: a key
/// with the start of a period in it would be a new one every time.
async fn fetch_for_member<T: serde::de::DeserializeOwned>(
    context: &HubContext,
    config: &Config,
    member: &str,
    ttl: Duration,
    what: &str,
    request: impl FnOnce(&str) -> HubRequest,
) -> Result<T, HttpResponse> {
    history_enabled(config)?;
    let Some(hub_id) = context.directory.hub_id(member) else {
        return Err(hub_error_response(HubError::NotFound));
    };
    let key = format!("player:{hub_id}:{what}");
    let client = Arc::clone(&context.client);
    context
        .cache
        .get_or_fetch(&key, ttl, || async move {
            let (path, query) = request(&urlencoding::encode(&hub_id));
            fetch_value::<Value>(&client, &path, &query).await
        })
        .await
        .and_then(|value| parse::<T>(&value))
        .map_err(hub_error_response)
}

/// How many days back to read: `days`, or `default` when not given, at most `max`.
fn clamp_days(days: Option<i64>, default: i64, max: i64) -> i64 {
    days.unwrap_or(default).clamp(1, max)
}

/// `from` for the last `days` days.
fn from_days(days: i64) -> String {
    (Utc::now() - ChronoDuration::days(days)).to_rfc3339()
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
        fetch_for_member(
            &context,
            &config,
            &path,
            GAINS_TTL,
            &format!("gains:{period}"),
            |id| (
                format!("/accounts/{id}/gains"),
                vec![("period", period.clone())]
            )
        )
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
    let days = clamp_days(query.days, 7, 30);
    let sessions: HubSessions = respond!(
        fetch_for_member(
            &context,
            &config,
            &path,
            SESSIONS_TTL,
            &format!("sessions:{days}"),
            |id| (
                format!("/accounts/{id}/sessions"),
                vec![("from", from_days(days))]
            )
        )
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
    let days = clamp_days(query.days, 30, 90);
    let wealth: HubWealth = respond!(
        fetch_for_member(
            &context,
            &config,
            &path,
            WEALTH_TTL,
            &format!("wealth:{days}"),
            |id| (
                format!("/accounts/{id}/wealth"),
                vec![("from", from_days(days))]
            )
        )
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
    let days = clamp_days(query.days, 30, 90);
    let history: HubEquipmentHistory = respond!(
        fetch_for_member(
            &context,
            &config,
            &path,
            GEAR_TTL,
            &format!("equipment-history:{days}"),
            |id| (
                format!("/accounts/{id}/equipment-history"),
                vec![("from", from_days(days))]
            )
        )
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

/// Whether a `next_cursor` is one of the hub's time-range cursors: base64url of
/// "r1:…". A hub from before the range read (hub D-98) ignores `from` and
/// answers with the feed's newest events and a feed cursor ("v1:…").
fn is_range_cursor(cursor: &str) -> bool {
    cursor.starts_with("cjE6")
}

fn occurred_at(event: &Value) -> Option<DateTime<Utc>> {
    event.get("occurred_at")?.as_str()?.parse().ok()
}

/// Reads the pages of a time range of `/events`, which come newest first,
/// until the last one or until there are `max` events. `page` fetches the
/// page after a cursor (the first without one) and gives its events and the
/// next cursor.
async fn read_range<F, Fut>(
    from: DateTime<Utc>,
    max: usize,
    mut page: F,
) -> Result<Vec<Value>, HubError>
where
    F: FnMut(Option<String>) -> Fut,
    Fut: Future<Output = Result<(Vec<Value>, Option<String>), HubError>>,
{
    let mut events: Vec<Value> = Vec::new();
    let mut cursor = None;
    // One page more than `max` takes, in case the hub hands out short pages.
    for _ in 0..=max.div_ceil(RANGE_PAGE) {
        let (mut batch, next) = page(cursor).await?;
        match next {
            // An older hub: the feed's newest events, oldest first, whatever
            // range was asked for. That is all there is to have from it.
            Some(next) if !is_range_cursor(&next) => {
                batch.reverse();
                batch.retain(|event| occurred_at(event).is_some_and(|at| at >= from));
                events.append(&mut batch);
                break;
            }
            next => {
                events.append(&mut batch);
                if next.is_none() || events.len() >= max {
                    break;
                }
                cursor = next;
            }
        }
    }
    events.truncate(max);
    Ok(events)
}

/// An account's events since `from`, newest first: only those of `types`
/// worth `min_value` or more when given.
async fn fetch_range(
    client: &Arc<HubClient>,
    account: &str,
    from: &str,
    types: Option<&str>,
    min_value: Option<i64>,
) -> Result<Vec<Value>, HubError> {
    let since: DateTime<Utc> = from
        .parse()
        .map_err(|err| HubError::Other(format!("bad range start {from}: {err}")))?;
    read_range(since, RANGE_EVENTS_MAX, |cursor| {
        let mut query = vec![
            ("accounts", account.to_owned()),
            ("from", from.to_owned()),
            ("limit", RANGE_PAGE.to_string()),
        ];
        if let Some(types) = types {
            query.push(("types", types.to_owned()));
        }
        if let Some(min_value) = min_value {
            query.push(("min_value", min_value.to_string()));
        }
        if let Some(cursor) = cursor {
            query.push(("cursor", cursor));
        }
        async move {
            let (events, meta) = client
                .get_data::<Vec<Value>>("/events", &query, Priority::Interactive)
                .await?;
            Ok((events, meta.next_cursor))
        }
    })
    .await
}

/// Newest first; events without a readable time last.
fn newest_first(mut events: Vec<Value>) -> Vec<Value> {
    events.sort_by_key(|event| std::cmp::Reverse(occurred_at(event)));
    events
}

/// The member's events of the last `days`, for their trail: every kind the
/// map shows, drops only from `min_loot` gp. Drops are read apart from the
/// rest, so that a month of small ones doesn't crowd out the levels and deaths.
async fn trail_events(
    context: &HubContext,
    config: &Config,
    member: &str,
    days: i64,
    min_loot: i64,
) -> Result<Vec<HubEvent>, HttpResponse> {
    history_enabled(config)?;
    let Some(hub_id) = context.directory.hub_id(member) else {
        return Err(hub_error_response(HubError::NotFound));
    };
    let days = days.clamp(1, RANGE_MAX_DAYS);
    let min_loot = min_loot.max(0);
    let key = format!("/events?accounts={hub_id}&days={days}&min_loot={min_loot}");
    let from = from_days(days);
    let client = Arc::clone(&context.client);
    context
        .cache
        .get_or_fetch(&key, RANGE_EVENTS_TTL, || async {
            let events = if min_loot > 0 {
                let mut events =
                    fetch_range(&client, &hub_id, &from, Some(LOOT_TYPES), Some(min_loot)).await?;
                events.extend(fetch_range(&client, &hub_id, &from, Some(OTHER_TYPES), None).await?);
                newest_first(events)
            } else {
                fetch_range(&client, &hub_id, &from, None, None).await?
            };
            Ok(Value::Array(events))
        })
        .await
        .and_then(|value| parse::<Vec<HubEvent>>(&value))
        .map_err(hub_error_response)
}

/// The member's most recent events from the hub (not only the buffered ones),
/// newest first: the newest `limit`, or with `days` those of that many days
/// (the events along a trail; see [`trail_events`]).
#[get("/hub/players/{member}/events")]
pub async fn get_player_events(
    _auth: Authenticated,
    path: web::Path<String>,
    query: web::Query<ProfileQuery>,
    config: web::Data<Config>,
    context: web::Data<HubContext>,
) -> Result<HttpResponse, Error> {
    if let Some(days) = query.days {
        let min_loot = query.min_loot.unwrap_or(0);
        let events = respond!(trail_events(&context, &config, &path, days, min_loot).await);
        let events: Vec<Value> = events
            .iter()
            .map(|event| event_json(None, event, &context.directory))
            .collect();
        return Ok(HttpResponse::Ok().json(events));
    }
    let limit = query.limit.unwrap_or(50).clamp(1, 200);
    let events: Vec<HubEvent> = respond!(
        fetch_for_member(
            &context,
            &config,
            &path,
            EVENTS_TTL,
            &format!("events:{limit}"),
            |id| (
                "/events".to_string(),
                vec![("accounts", id.to_owned()), ("limit", limit.to_string())]
            )
        )
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
    fn days_fall_back_to_the_default_and_stay_in_range() {
        assert_eq!(clamp_days(None, 7, 30), 7);
        assert_eq!(clamp_days(Some(500), 7, 30), 30);
        assert_eq!(clamp_days(Some(0), 7, 30), 1);
    }

    const RANGE_CURSOR: &str = "cjE6MTc5MDY5MDI4MjUxMToxNw";
    const FEED_CURSOR: &str = "djE6MQ";

    fn event(id: usize, minutes_ago: i64) -> Value {
        let at = Utc::now() - ChronoDuration::minutes(minutes_ago);
        serde_json::json!({ "id": id.to_string(), "occurred_at": at.to_rfc3339() })
    }

    fn ids(events: &[Value]) -> Vec<&str> {
        events
            .iter()
            .map(|event| event["id"].as_str().unwrap())
            .collect()
    }

    fn day_ago() -> DateTime<Utc> {
        Utc::now() - ChronoDuration::days(1)
    }

    #[test]
    fn tells_a_range_cursor_from_a_feed_cursor() {
        assert!(is_range_cursor(RANGE_CURSOR));
        assert!(!is_range_cursor(FEED_CURSOR));
    }

    #[tokio::test]
    async fn reads_every_page_of_a_range() {
        let mut asked = Vec::new();
        let events = read_range(day_ago(), 2000, |cursor| {
            asked.push(cursor.clone());
            async move {
                Ok(match cursor.as_deref() {
                    None => (
                        vec![event(1, 1), event(2, 2)],
                        Some(RANGE_CURSOR.to_owned()),
                    ),
                    Some(_) => (vec![event(3, 3)], None),
                })
            }
        })
        .await
        .unwrap();
        assert_eq!(ids(&events), ["1", "2", "3"]);
        assert_eq!(asked, [None, Some(RANGE_CURSOR.to_owned())]);
    }

    #[tokio::test]
    async fn stops_reading_a_range_at_the_most_it_keeps() {
        let mut pages = 0;
        let events = read_range(day_ago(), 1000, |_| {
            pages += 1;
            let first = (pages - 1) * RANGE_PAGE;
            async move {
                let batch = (first..first + RANGE_PAGE).map(|id| event(id, 1)).collect();
                Ok((batch, Some(RANGE_CURSOR.to_owned())))
            }
        })
        .await
        .unwrap();
        assert_eq!(events.len(), 1000);
        assert_eq!(pages, 2);
    }

    #[tokio::test]
    async fn gives_up_on_a_hub_that_keeps_handing_out_empty_pages() {
        let mut pages = 0;
        let events = read_range(day_ago(), 1000, |_| {
            pages += 1;
            async { Ok((Vec::new(), Some(RANGE_CURSOR.to_owned()))) }
        })
        .await
        .unwrap();
        assert!(events.is_empty());
        assert_eq!(pages, 3);
    }

    #[tokio::test]
    async fn makes_do_with_the_newest_events_of_a_hub_without_ranges() {
        let mut pages = 0;
        // The feed's page: oldest first, and not bound by the range.
        let events = read_range(day_ago(), 2000, |_| {
            pages += 1;
            async {
                let batch = vec![event(1, 3 * 24 * 60), event(2, 60), event(3, 5)];
                Ok((batch, Some(FEED_CURSOR.to_owned())))
            }
        })
        .await
        .unwrap();
        assert_eq!(ids(&events), ["3", "2"]);
        assert_eq!(pages, 1);
    }

    #[tokio::test]
    async fn passes_on_what_went_wrong_reading_a_range() {
        let result = read_range(day_ago(), 2000, |_| async { Err(HubError::NotFound) }).await;
        assert!(matches!(result, Err(HubError::NotFound)));
    }

    #[test]
    fn puts_drops_and_the_rest_in_one_order() {
        let merged = newest_first(vec![event(1, 10), event(2, 30), event(3, 5), event(4, 20)]);
        assert_eq!(ids(&merged), ["3", "1", "4", "2"]);
    }
}
