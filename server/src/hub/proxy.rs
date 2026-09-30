//! Session-authenticated endpoints that serve the hub's history to the site.
//! The hub API key stays on the server; responses are cached (see `cache.rs`)
//! so the number of hub requests does not grow with the number of viewers.
use crate::auth_middleware::Authenticated;
use crate::authed::SkillDataPeriod;
use crate::config::Config;
use crate::db;
use crate::error::ApiError;
use crate::hub::client::{HubClient, HubError, Priority};
use crate::hub::models::{HubLeaderboards, HubLocations, HubXpLine, HubXpMulti};
use crate::hub::HubContext;
use crate::models::{AggregateSkillData, GroupSkillData, MemberSkillData};
use crate::osrs::{skill_index, SKILL_ORDER};
use actix_web::{get, web, Error, HttpResponse};
use chrono::{DateTime, Duration as ChronoDuration, Utc};
use deadpool_postgres::{Client, Pool};
use serde::Deserialize;
use serde_json::Value;
use std::collections::{BTreeSet, HashMap};
use std::sync::Arc;
use std::time::Duration;

type XpPoint = (DateTime<Utc>, i64);

/// A request naming more skills than this is retried without the unknown ones at most this often.
const MAX_UNKNOWN_SKILL_RETRIES: usize = 5;
const XP_TTL: Duration = Duration::from_secs(300);
const GAINS_TTL: Duration = Duration::from_secs(300);
const LOCATIONS_TTL: Duration = Duration::from_secs(60);
const MAX_TRAIL_POINTS: usize = 3000;

fn hub_client(context: &HubContext) -> Result<&Arc<HubClient>, HubError> {
    context.client.as_ref().ok_or(HubError::NotFound)
}

fn hub_error_response(err: HubError) -> HttpResponse {
    match err {
        HubError::NotFound => HttpResponse::NotFound().json(serde_json::json!({
            "error": "not_available",
            "message": "This data is not available from the hub."
        })),
        HubError::RateLimited(after) => HttpResponse::ServiceUnavailable()
            .insert_header(("Retry-After", after.as_secs().max(1).to_string()))
            .json(serde_json::json!({
                "error": "rate_limited",
                "message": "The hub is busy, try again shortly."
            })),
        HubError::Invalid(message) => {
            log::warn!("The hub rejected a request: {}", message);
            HttpResponse::BadGateway().json(serde_json::json!({
                "error": "hub_rejected",
                "message": "The hub rejected the request."
            }))
        }
        HubError::Unauthorized => {
            log::error!("The hub rejected the API key; check HUB_API_KEY");
            HttpResponse::BadGateway().json(serde_json::json!({
                "error": "hub_unauthorized",
                "message": "The hub rejected this server's API key."
            }))
        }
        HubError::Other(message) => {
            log::warn!("Hub request failed: {}", message);
            HttpResponse::BadGateway().json(serde_json::json!({
                "error": "hub_unavailable",
                "message": "The hub could not be reached."
            }))
        }
    }
}

fn history_enabled(config: &Config) -> Result<(), HttpResponse> {
    if config.hub_history_enabled() {
        Ok(())
    } else {
        Err(HttpResponse::NotFound().json(serde_json::json!({
            "error": "hub_disabled",
            "message": "Hub history is not enabled on this server."
        })))
    }
}

async fn fetch_value<T: serde::de::DeserializeOwned + serde::Serialize + Send + 'static>(
    client: &Arc<HubClient>,
    path: &str,
    query: &[(&str, String)],
) -> Result<Value, HubError> {
    let (data, _) = client
        .get_data::<T>(path, query, Priority::Interactive)
        .await?;
    serde_json::to_value(data).map_err(|err| HubError::Other(err.to_string()))
}

// ----------------------------------------------------------------------------
// XP graphs
// ----------------------------------------------------------------------------

fn xp_window(period: &SkillDataPeriod, now: DateTime<Utc>) -> (DateTime<Utc>, &'static str) {
    match period {
        SkillDataPeriod::Day => (now - ChronoDuration::hours(25), "1h"),
        SkillDataPeriod::Week => (now - ChronoDuration::days(8), "1d"),
        SkillDataPeriod::Month => (now - ChronoDuration::days(31), "1d"),
        SkillDataPeriod::Year => (now - ChronoDuration::days(366), "1d"),
    }
}

fn period_key(period: &SkillDataPeriod) -> &'static str {
    match period {
        SkillDataPeriod::Day => "day",
        SkillDataPeriod::Week => "week",
        SkillDataPeriod::Month => "month",
        SkillDataPeriod::Year => "year",
    }
}

/// Turns the hub's per-skill XP series (points only where XP changed) into the
/// rows the skill graphs expect: one row per point in time with the XP of all
/// skills in `SKILL_ORDER`, carrying each skill's last value forward.
pub fn xp_series_to_rows(series: &[HubXpLine]) -> Vec<AggregateSkillData> {
    let lines: Vec<(usize, &[XpPoint])> = series
        .iter()
        .filter_map(|line| skill_index(&line.skill).map(|index| (index, line.points.as_slice())))
        .collect();
    let times: BTreeSet<DateTime<Utc>> = lines
        .iter()
        .flat_map(|(_, points)| points.iter().map(|(at, _)| *at))
        .collect();

    let mut positions = vec![0usize; lines.len()];
    let mut current = vec![0i32; SKILL_ORDER.len()];
    let mut rows = Vec::with_capacity(times.len());
    for time in times {
        for (line_index, (skill, points)) in lines.iter().enumerate() {
            while positions[line_index] < points.len() && points[positions[line_index]].0 <= time {
                current[*skill] = points[positions[line_index]].1.clamp(0, i32::MAX as i64) as i32;
                positions[line_index] += 1;
            }
        }
        rows.push(AggregateSkillData {
            time,
            data: current.clone(),
        });
    }
    rows
}

/// The skill name a hub 400 complains about ("unknown skill: Sailing").
fn unknown_skill(message: &str) -> Option<String> {
    let (_, name) = message.split_once("unknown skill:")?;
    let name = name.trim();
    (!name.is_empty()).then(|| name.to_owned())
}

/// The skills to request: every skill the site knows, minus those the hub has
/// said it has never seen (the hub rejects the whole request for one of those).
fn requested_skills(context: &HubContext) -> Vec<&'static str> {
    let capabilities = context
        .capabilities
        .read()
        .expect("capabilities lock poisoned");
    SKILL_ORDER
        .iter()
        .copied()
        .filter(|skill| {
            !capabilities
                .unknown_skills
                .iter()
                .any(|unknown| unknown.eq_ignore_ascii_case(skill))
        })
        .collect()
}

async fn fetch_xp_chunk(
    context: &HubContext,
    ids: &[String],
    period: &SkillDataPeriod,
) -> Result<Arc<Value>, HubError> {
    let client = hub_client(context)?;
    let key = format!("xp:{}:{}", period_key(period), ids.join(","));
    let (from, resolution) = xp_window(period, Utc::now());
    context
        .cache
        .get_or_fetch(&key, XP_TTL, || async {
            let mut retries = 0;
            loop {
                let query = vec![
                    ("accounts", ids.join(",")),
                    ("skills", requested_skills(context).join(",")),
                    ("from", from.to_rfc3339()),
                    ("resolution", resolution.to_string()),
                ];
                match client
                    .get_data::<Value>("/xp", &query, Priority::Interactive)
                    .await
                {
                    Ok((data, _)) => return Ok(data),
                    Err(HubError::Invalid(message)) if retries < MAX_UNKNOWN_SKILL_RETRIES => {
                        let Some(skill) = unknown_skill(&message) else {
                            return Err(HubError::Invalid(message));
                        };
                        log::info!("The hub has no XP data for {} yet; leaving it out", skill);
                        context
                            .capabilities
                            .write()
                            .expect("capabilities lock poisoned")
                            .unknown_skills
                            .insert(skill);
                        retries += 1;
                    }
                    Err(err) => return Err(err),
                }
            }
        })
        .await
}

/// XP history for every member bound to a hub account, keyed by member name.
async fn hub_skill_data(
    context: &HubContext,
    bindings: &[(String, String)],
    period: &SkillDataPeriod,
) -> HashMap<String, Vec<AggregateSkillData>> {
    let names_by_id: HashMap<&str, &str> = bindings
        .iter()
        .map(|(name, id)| (id.as_str(), name.as_str()))
        .collect();
    let mut ids: Vec<String> = bindings.iter().map(|(_, id)| id.clone()).collect();
    ids.sort();

    let batch = context
        .capabilities
        .read()
        .map(|capabilities| capabilities.bulk_accounts)
        .unwrap_or(crate::hub::USER_KEY_BULK_ACCOUNTS)
        .max(1);
    let mut result = HashMap::new();
    for chunk in ids.chunks(batch) {
        let values = match fetch_xp_chunk(context, chunk, period).await {
            Ok(value) => vec![value],
            // One unreadable account fails the whole request; retry one by one.
            Err(HubError::NotFound) if chunk.len() > 1 => {
                let mut values = Vec::new();
                for id in chunk {
                    if let Ok(value) =
                        fetch_xp_chunk(context, std::slice::from_ref(id), period).await
                    {
                        values.push(value);
                    }
                }
                values
            }
            Err(err) => {
                log::debug!("No hub XP history for {:?}: {}", chunk, err);
                continue;
            }
        };
        for value in values {
            let Ok(multi) = serde_json::from_value::<HubXpMulti>((*value).clone()) else {
                log::warn!("Unexpected /xp response from the hub");
                continue;
            };
            for account in multi.accounts {
                if let Some(name) = names_by_id.get(account.account.id.as_str()) {
                    result.insert((*name).to_owned(), xp_series_to_rows(&account.series));
                }
            }
        }
    }
    result
}

/// Local skill history with every hub-bound member replaced by the hub's history.
pub async fn merge_skill_data(
    context: &HubContext,
    client: &Client,
    group_id: i64,
    period: &SkillDataPeriod,
    local: GroupSkillData,
) -> Result<GroupSkillData, ApiError> {
    let bindings = db::get_hub_bindings(client, group_id).await?;
    if bindings.is_empty() {
        return Ok(local);
    }
    let mut hub = hub_skill_data(context, &bindings, period).await;
    let mut merged: GroupSkillData = local
        .into_iter()
        .map(|member| match hub.remove(&member.name) {
            Some(skill_data) if !skill_data.is_empty() => MemberSkillData {
                name: member.name,
                skill_data,
            },
            _ => member,
        })
        .collect();
    merged.extend(
        hub.into_iter()
            .filter(|(_, skill_data)| !skill_data.is_empty())
            .map(|(name, skill_data)| MemberSkillData { name, skill_data }),
    );
    Ok(merged)
}

// ----------------------------------------------------------------------------
// Gains leaderboards
// ----------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct GainsQuery {
    #[serde(default)]
    period: Option<String>,
}

#[get("/hub/gains")]
pub async fn get_gains(
    auth: Authenticated,
    query: web::Query<GainsQuery>,
    config: web::Data<Config>,
    context: web::Data<HubContext>,
    db_pool: web::Data<Pool>,
) -> Result<HttpResponse, Error> {
    if let Err(response) = history_enabled(&config) {
        return Ok(response);
    }
    let period = match query.period.as_deref().unwrap_or("day") {
        period @ ("day" | "week" | "month") => period.to_owned(),
        _ => return Ok(HttpResponse::BadRequest().body("period must be day, week or month")),
    };
    let client = match hub_client(&context) {
        Ok(client) => Arc::clone(client),
        Err(err) => return Ok(hub_error_response(err)),
    };
    let value = context
        .cache
        .get_or_fetch(&format!("gains:{}", period), GAINS_TTL, || async {
            fetch_value::<Value>(
                &client,
                "/leaderboards/gains",
                &[("period", period.clone())],
            )
            .await
        })
        .await;
    let value = match value {
        Ok(value) => value,
        Err(err) => return Ok(hub_error_response(err)),
    };
    let leaderboards: HubLeaderboards = match serde_json::from_value((*value).clone()) {
        Ok(leaderboards) => leaderboards,
        Err(err) => return Ok(hub_error_response(HubError::Other(err.to_string()))),
    };

    let db_client = db_pool.get().await.map_err(ApiError::PoolError)?;
    let names: HashMap<String, String> = db::get_hub_bindings(&db_client, auth.group_id)
        .await?
        .into_iter()
        .map(|(name, id)| (id, name))
        .collect();

    let boards: Vec<Value> = leaderboards
        .leaderboards
        .into_iter()
        .map(|board| {
            serde_json::json!({
                "skill": board.skill,
                "entries": board.entries.into_iter().map(|entry| serde_json::json!({
                    "rank": entry.rank,
                    "name": names.get(&entry.account.id).cloned().unwrap_or(entry.account.name),
                    "gain": entry.gain,
                })).collect::<Vec<_>>(),
            })
        })
        .collect();
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "period": leaderboards.period,
        "leaderboards": boards,
    })))
}

// ----------------------------------------------------------------------------
// Location trails
// ----------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct LocationsQuery {
    #[serde(default)]
    days: Option<i64>,
}

/// Drops consecutive points on the same tile and evenly thins long trails,
/// always keeping the newest point. Output: `[x, y, plane, unix seconds]`.
pub fn thin_trail(points: &HubLocations, max_points: usize) -> Vec<[i64; 4]> {
    let mut trail: Vec<[i64; 4]> = Vec::with_capacity(points.points.len());
    for point in &points.points {
        let entry = [
            point.x as i64,
            point.y as i64,
            point.plane as i64,
            point.at.timestamp(),
        ];
        match trail.last_mut() {
            Some(last) if last[..3] == entry[..3] => last[3] = entry[3],
            _ => trail.push(entry),
        }
    }
    if trail.len() > max_points && max_points > 1 {
        let step = trail.len() as f64 / (max_points - 1) as f64;
        let last = *trail.last().expect("trail is not empty");
        let mut thinned: Vec<[i64; 4]> = (0..max_points - 1)
            .map(|i| trail[(i as f64 * step) as usize])
            .collect();
        thinned.push(last);
        trail = thinned;
    }
    trail
}

#[get("/hub/locations/{member}")]
pub async fn get_locations(
    auth: Authenticated,
    path: web::Path<String>,
    query: web::Query<LocationsQuery>,
    config: web::Data<Config>,
    context: web::Data<HubContext>,
    db_pool: web::Data<Pool>,
) -> Result<HttpResponse, Error> {
    if let Err(response) = history_enabled(&config) {
        return Ok(response);
    }
    let days = query.days.unwrap_or(1).clamp(1, 30);
    let member = path.into_inner();

    let db_client = db_pool.get().await.map_err(ApiError::PoolError)?;
    let hub_id = db::get_hub_bindings(&db_client, auth.group_id)
        .await?
        .into_iter()
        .find(|(name, _)| name.eq_ignore_ascii_case(&member))
        .map(|(_, id)| id);
    let Some(hub_id) = hub_id else {
        return Ok(hub_error_response(HubError::NotFound));
    };
    let client = match hub_client(&context) {
        Ok(client) => Arc::clone(client),
        Err(err) => return Ok(hub_error_response(err)),
    };

    let from = (Utc::now() - ChronoDuration::days(days)).to_rfc3339();
    let path = format!("/accounts/{}/locations", urlencoding::encode(&hub_id));
    let value = context
        .cache
        .get_or_fetch(
            &format!("locations:{}:{}", hub_id, days),
            LOCATIONS_TTL,
            || async { fetch_value::<Value>(&client, &path, &[("from", from.clone())]).await },
        )
        .await;
    let value = match value {
        Ok(value) => value,
        Err(err) => return Ok(hub_error_response(err)),
    };
    let locations: HubLocations = match serde_json::from_value((*value).clone()) {
        Ok(locations) => locations,
        Err(err) => return Ok(hub_error_response(HubError::Other(err.to_string()))),
    };
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "member": member,
        "days": days,
        "points": thin_trail(&locations, MAX_TRAIL_POINTS),
    })))
}

// ----------------------------------------------------------------------------
// Events feed
// ----------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct EventsQuery {
    #[serde(default)]
    types: Option<String>,
    #[serde(default)]
    member: Option<String>,
    #[serde(default)]
    limit: Option<usize>,
}

#[get("/hub/events")]
pub async fn get_events(
    _auth: Authenticated,
    query: web::Query<EventsQuery>,
    config: web::Data<Config>,
    context: web::Data<HubContext>,
) -> Result<HttpResponse, Error> {
    if let Err(response) = history_enabled(&config) {
        return Ok(response);
    }
    let types: Vec<String> = query
        .types
        .as_deref()
        .unwrap_or("")
        .split(',')
        .map(str::trim)
        .filter(|t| !t.is_empty())
        .map(str::to_owned)
        .collect();
    let limit = query.limit.unwrap_or(100).clamp(1, 500);
    let events = context.events.query(&types, query.member.as_deref(), limit);
    let events: Vec<Value> = events
        .into_iter()
        .map(|event| {
            serde_json::json!({
                "id": event.id,
                "type": event.event_type,
                "member": event.account.name,
                "occurred_at": event.occurred_at,
                "value_gp": event.value_gp,
                "item_id": event.item_id,
                "skill": event.skill,
                "level": event.level,
                "title": event.title,
                "line": event.line,
            })
        })
        .collect();
    Ok(HttpResponse::Ok().json(events))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(s: &str) -> DateTime<Utc> {
        s.parse().unwrap()
    }

    #[test]
    fn xp_rows_forward_fill_each_skill() {
        let series = vec![
            HubXpLine {
                skill: "Attack".to_string(),
                points: vec![
                    (at("2026-09-28T00:00:00Z"), 100),
                    (at("2026-09-29T00:00:00Z"), 150),
                ],
            },
            HubXpLine {
                skill: "Sailing".to_string(),
                points: vec![
                    (at("2026-09-28T00:00:00Z"), 10),
                    (at("2026-09-28T12:00:00Z"), 20),
                ],
            },
            HubXpLine {
                skill: "Overall".to_string(),
                points: vec![(at("2026-09-28T00:00:00Z"), 999)],
            },
        ];
        let rows = xp_series_to_rows(&series);
        let attack = skill_index("Attack").unwrap();
        let sailing = skill_index("Sailing").unwrap();
        assert_eq!(rows.len(), 3);
        assert_eq!((rows[0].data[attack], rows[0].data[sailing]), (100, 10));
        assert_eq!((rows[1].data[attack], rows[1].data[sailing]), (100, 20));
        assert_eq!((rows[2].data[attack], rows[2].data[sailing]), (150, 20));
        assert!(rows.iter().all(|row| row.data.len() == 24));
    }

    #[test]
    fn unknown_skill_is_read_from_the_hub_message() {
        assert_eq!(
            unknown_skill("unknown skill: Sailing").as_deref(),
            Some("Sailing")
        );
        assert_eq!(unknown_skill("too many accounts"), None);
    }

    #[test]
    fn trail_drops_repeats_and_is_capped() {
        let points: HubLocations = serde_json::from_value(serde_json::json!({
            "points": (0..100).map(|i| serde_json::json!({
                "at": format!("2026-09-29T00:{:02}:00Z", i % 60),
                "x": 3200 + i / 2, "y": 3200, "plane": 0, "world": 302, "is_on_boat": false
            })).collect::<Vec<_>>()
        }))
        .unwrap();
        let trail = thin_trail(&points, 1000);
        assert_eq!(trail.len(), 50);
        let capped = thin_trail(&points, 10);
        assert_eq!(capped.len(), 10);
        assert_eq!(capped.last().unwrap()[0], 3249);
    }
}
