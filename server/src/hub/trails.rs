//! Where players have been: the hub's location history as trails for the
//! map, with stays on one tile merged and long trails thinned.
use crate::auth_middleware::Authenticated;
use crate::config::Config;
use crate::hub::client::HubError;
use crate::hub::fetch::{
    bulk_accounts, bulk_or_each, fetch_json, history_enabled, list_param, parse, HistoryError,
};
use crate::hub::models::{HubLocationPoint, HubLocationsMulti};
use crate::hub::HubContext;
use actix_web::{get, web, HttpResponse};
use chrono::{Duration as ChronoDuration, Utc};
use serde::Deserialize;
use serde_json::Value;
use std::collections::HashMap;
use std::time::Duration;

const LOCATIONS_TTL: Duration = Duration::from_secs(60);
const MAX_TRAIL_POINTS: usize = 3000;
/// Trails requested at once; more lines than this are unreadable anyway.
pub(crate) const MAX_TRAILS: usize = 8;

/// The hub keeps one location sample per account per this many seconds.
const TRAIL_BUCKET_SECS: i64 = 60;
/// Samples further apart than this are a gap in the data (logged out, or not sharing).
const TRAIL_GAP_SECS: i64 = 300;
/// Running covers two tiles per 0.6 s game tick.
const RUN_TILES_PER_SEC: f64 = 2.0 / 0.6;
/// The strides (in minutes) tried in turn when a trail has too many points.
const THIN_STRIDES_MIN: [i64; 11] = [2, 3, 5, 10, 15, 20, 30, 60, 120, 180, 360];
const FLAG_BOAT: i64 = 1;

/// A stay on one tile, from the hub's `first` sample there to the `last` (unix seconds).
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct TrailPoint {
    pub x: i32,
    pub y: i32,
    pub plane: i32,
    pub first: i64,
    pub last: i64,
    pub boat: bool,
    pub world: Option<i32>,
}

/// A trail ready to send: `step` is the seconds between the points kept (the
/// hub's bucket when nothing was thinned); `truncated` when even that was too
/// much and the oldest points were dropped.
pub(crate) struct BuiltTrail {
    pub points: Vec<TrailPoint>,
    pub step: i64,
    pub truncated: bool,
}

/// The parts of the map with their own coordinate range: moving between them is
/// never done on foot. Caves and dungeons mirror the surface 6400 tiles north.
#[derive(PartialEq, Eq, Clone, Copy)]
enum Band {
    Surface,
    Underground,
    Instance,
    Other,
}

fn band(x: i32, y: i32) -> Band {
    if x >= 6400 {
        Band::Instance
    } else if y < 4224 {
        Band::Surface
    } else if (8448..10624).contains(&y) {
        Band::Underground
    } else {
        Band::Other
    }
}

/// Merges consecutive samples on the same tile into one stay.
pub(crate) fn merge_stays(points: &[HubLocationPoint]) -> Vec<TrailPoint> {
    let mut stays: Vec<TrailPoint> = Vec::with_capacity(points.len());
    for point in points {
        let at = point.at.timestamp();
        let boat = point.is_on_boat.unwrap_or(false);
        match stays.last_mut() {
            Some(stay)
                if (stay.x, stay.y, stay.plane) == (point.x, point.y, point.plane)
                    && stay.boat == boat
                    && stay.world == point.world
                    && at - stay.last <= TRAIL_GAP_SECS =>
            {
                stay.last = at
            }
            _ => stays.push(TrailPoint {
                x: point.x,
                y: point.y,
                plane: point.plane,
                first: at,
                last: at,
                boat,
                world: point.world,
            }),
        }
    }
    stays
}

/// Whether something other than walking on happened between two points: a
/// teleport, boarding a boat, a world hop or a gap in the data. Deliberately
/// more eager than the site's own classification, so thinning never removes a
/// point the site needs to draw one of those.
fn is_break(a: &TrailPoint, b: &TrailPoint) -> bool {
    let elapsed = (b.first - a.last).max(1);
    let distance = (a.x - b.x).abs().max((a.y - b.y).abs()) as f64;
    band(a.x, a.y) != band(b.x, b.y)
        || a.boat != b.boat
        || (a.world.is_some() && b.world.is_some() && a.world != b.world)
        || elapsed > TRAIL_GAP_SECS
        || distance > 0.75 * RUN_TILES_PER_SEC * elapsed as f64
}

/// Thins a long trail to at most `max_points`: the first point of every
/// `step` seconds (on a fixed grid, so the result barely changes as the window
/// slides), plus the ends of the trail and both sides of every break.
pub(crate) fn thin_trail(points: Vec<TrailPoint>, max_points: usize) -> BuiltTrail {
    if points.len() <= max_points || max_points < 2 {
        return BuiltTrail {
            points,
            step: TRAIL_BUCKET_SECS,
            truncated: false,
        };
    }
    let mut protected = vec![false; points.len()];
    protected[0] = true;
    protected[points.len() - 1] = true;
    for i in 1..points.len() {
        if is_break(&points[i - 1], &points[i]) {
            protected[i - 1] = true;
            protected[i] = true;
        }
    }

    let mut keep = Vec::new();
    let mut kept = 0;
    let mut step = TRAIL_BUCKET_SECS;
    for minutes in THIN_STRIDES_MIN {
        step = minutes * 60;
        let mut bucket = None;
        keep = points
            .iter()
            .zip(&protected)
            .map(|(point, protected)| {
                let first_of_bucket = bucket.replace(point.first.div_euclid(step))
                    != Some(point.first.div_euclid(step));
                *protected || first_of_bucket
            })
            .collect();
        kept = keep.iter().filter(|keep| **keep).count();
        if kept <= max_points {
            break;
        }
    }

    let truncated = kept > max_points;
    let mut drop = kept.saturating_sub(max_points);
    let points = points
        .into_iter()
        .zip(keep)
        .filter(|(_, keep)| *keep)
        .map(|(point, _)| point)
        .skip_while(|_| {
            let dropping = drop > 0;
            drop = drop.saturating_sub(1);
            dropping
        })
        .collect();
    BuiltTrail {
        points,
        step,
        truncated,
    }
}

/// A member's trail as the site gets it. A point is
/// `[x, y, plane, unix seconds, dwell, flags]`: the time is the last sample on
/// the tile, `dwell` the seconds since the first one, `flags` bit 0 is "on a
/// boat"; trailing zeros are left out. `worlds` lists `[point index, world]`
/// wherever the world changes.
pub(crate) fn trail_json(member: &str, trail: &BuiltTrail) -> Value {
    let mut worlds: Vec<[i64; 2]> = Vec::new();
    let points: Vec<Vec<i64>> = trail
        .points
        .iter()
        .enumerate()
        .map(|(index, point)| {
            if let Some(world) = point.world {
                if worlds.last().map(|last| last[1]) != Some(world as i64) {
                    worlds.push([index as i64, world as i64]);
                }
            }
            let mut entry = vec![
                point.x as i64,
                point.y as i64,
                point.plane as i64,
                point.last,
                point.last - point.first,
                if point.boat { FLAG_BOAT } else { 0 },
            ];
            while entry.len() > 4 && entry.last() == Some(&0) {
                entry.pop();
            }
            entry
        })
        .collect();
    serde_json::json!({
        "member": member,
        "shared": true,
        "step": trail.step,
        "truncated": trail.truncated,
        "points": points,
        "worlds": worlds,
    })
}

#[derive(Deserialize)]
pub(crate) struct TrailsQuery {
    #[serde(default)]
    members: Option<String>,
    #[serde(default)]
    days: Option<i64>,
}

/// Trails of several accounts from the hub's bulk `/locations`. Returns the
/// points per hub id (an account missing from the map isn't shared) and how
/// long ago the oldest part of the answer came from the hub.
async fn fetch_trails(
    context: &HubContext,
    ids: &[String],
    days: i64,
) -> Result<(HashMap<String, Vec<HubLocationPoint>>, Duration), HubError> {
    let from = (Utc::now() - ChronoDuration::days(days)).to_rfc3339();
    let fetch = |chunk: Vec<String>| {
        let accounts = chunk.join(",");
        let from = from.clone();
        async move {
            let key = format!("locations:{}:{}", days, accounts);
            let query = [("accounts", accounts), ("from", from)];
            context
                .cache
                .get_or_fetch_dated(&key, LOCATIONS_TTL, || {
                    fetch_json(&context.client, "/locations", &query)
                })
                .await
        }
    };

    let mut result = HashMap::new();
    let mut oldest = Duration::ZERO;
    for chunk in ids.chunks(bulk_accounts(context)) {
        for (value, age) in bulk_or_each(chunk, &fetch).await? {
            oldest = oldest.max(age);
            for account in parse::<HubLocationsMulti>(&value)?.accounts {
                result.insert(account.account.id, account.points);
            }
        }
    }
    Ok((result, oldest))
}

#[get("/hub/trails")]
pub async fn get_trails(
    _auth: Authenticated,
    query: web::Query<TrailsQuery>,
    config: web::Data<Config>,
    context: web::Data<HubContext>,
) -> Result<HttpResponse, HistoryError> {
    history_enabled(&config)?;
    let days = query.days.unwrap_or(1).clamp(1, 30);
    let members = list_param(query.members.as_deref());
    if members.is_empty() || members.len() > MAX_TRAILS {
        return Err(HistoryError::BadRequest(format!(
            "give 1 to {} members",
            MAX_TRAILS
        )));
    }
    let ids: Vec<(String, Option<String>)> = members
        .into_iter()
        .map(|member| {
            let id = context.directory.hub_id(&member);
            (member, id)
        })
        .collect();
    let known: Vec<String> = ids.iter().filter_map(|(_, id)| id.clone()).collect();
    let (mut points, age) = if known.is_empty() {
        (HashMap::new(), Duration::ZERO)
    } else {
        fetch_trails(&context, &known, days).await?
    };
    let trails: Vec<Value> = ids
        .into_iter()
        .map(|(member, id)| match id.and_then(|id| points.remove(&id)) {
            Some(trail) => trail_json(&member, &thin_trail(merge_stays(&trail), MAX_TRAIL_POINTS)),
            None => serde_json::json!({ "member": member, "shared": false }),
        })
        .collect();
    // `as_of` is when the hub last answered: older than a minute means the
    // hub is unreachable and this is the cache's stale copy.
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "v": 2,
        "days": days,
        "bucket": TRAIL_BUCKET_SECS,
        "as_of": Utc::now().timestamp() - age.as_secs() as i64,
        "trails": trails,
    })))
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::DateTime;
    use std::collections::HashSet;

    /// A minute boundary, like the hub's sample times.
    const TRAIL_START: i64 = 1_790_000_040;

    fn sample(minute: i64, x: i32, y: i32) -> HubLocationPoint {
        HubLocationPoint {
            at: DateTime::from_timestamp(TRAIL_START + minute * 60, 0).unwrap(),
            x,
            y,
            plane: 0,
            world: Some(302),
            is_on_boat: Some(false),
        }
    }

    /// A walk of a few tiles a minute that never looks like a break.
    fn walk(minutes: std::ops::Range<i64>) -> Vec<HubLocationPoint> {
        minutes
            .map(|i| sample(i, 3000 + (i % 100) as i32, 3200 + (i / 100) as i32))
            .collect()
    }

    #[test]
    fn location_points_parse_with_and_without_the_newer_fields() {
        let points: Vec<HubLocationPoint> = serde_json::from_value(serde_json::json!([
            {"at": "2026-09-29T00:00:00Z", "x": 1, "y": 2, "plane": 0},
            {"at": "2026-09-29T00:01:00Z", "x": 1, "y": 3, "plane": 0, "world": 330, "is_on_boat": true}
        ]))
        .unwrap();
        assert_eq!((points[0].world, points[0].is_on_boat), (None, None));
        assert_eq!(
            (points[1].world, points[1].is_on_boat),
            (Some(330), Some(true))
        );
    }

    #[test]
    fn stays_on_a_tile_are_merged_with_their_dwell() {
        let points = vec![
            sample(0, 3200, 3200),
            sample(1, 3200, 3200),
            sample(2, 3200, 3200),
            sample(3, 3201, 3200),
        ];
        let stays = merge_stays(&points);
        assert_eq!(stays.len(), 2);
        assert_eq!(
            (stays[0].first, stays[0].last),
            (TRAIL_START, TRAIL_START + 120)
        );
        assert_eq!(
            (stays[1].first, stays[1].last),
            (TRAIL_START + 180, TRAIL_START + 180)
        );
    }

    #[test]
    fn a_stay_is_not_merged_across_a_gap_in_the_data() {
        let points = vec![sample(0, 3200, 3200), sample(10, 3200, 3200)];
        assert_eq!(merge_stays(&points).len(), 2);
    }

    #[test]
    fn short_trails_are_not_thinned() {
        let built = thin_trail(merge_stays(&walk(0..50)), 1000);
        assert_eq!(built.points.len(), 50);
        assert_eq!((built.step, built.truncated), (60, false));
    }

    #[test]
    fn thinning_keeps_both_ends_of_a_teleport() {
        let mut points = walk(0..2500);
        // A teleport far away, then walking on from there.
        points.extend((2500..5000).map(|i| sample(i, 1500 + (i % 100) as i32, 3500)));
        let built = thin_trail(merge_stays(&points), 3000);
        assert!(built.points.len() <= 3000);
        assert!(built.step > 60 && !built.truncated);
        assert_eq!(built.points.first().unwrap().first, TRAIL_START);
        assert_eq!(built.points.last().unwrap().last, TRAIL_START + 4999 * 60);
        let landed = built
            .points
            .iter()
            .position(|point| point.first == TRAIL_START + 2500 * 60)
            .expect("the first point after the teleport is kept");
        assert_eq!(built.points[landed - 1].last, TRAIL_START + 2499 * 60);
    }

    #[test]
    fn thinning_keeps_boat_and_world_changes() {
        let mut points = walk(0..5000);
        for point in &mut points[1001..1500] {
            point.is_on_boat = Some(true);
        }
        for point in &mut points[3001..] {
            point.world = Some(330);
        }
        let built = thin_trail(merge_stays(&points), 3000);
        let times: HashSet<i64> = built.points.iter().map(|point| point.first).collect();
        for minute in [1000, 1001, 1499, 1500, 3000, 3001] {
            assert!(
                times.contains(&(TRAIL_START + minute * 60)),
                "minute {}",
                minute
            );
        }
    }

    #[test]
    fn thinning_is_stable_as_the_window_slides() {
        let earlier = thin_trail(merge_stays(&walk(0..5000)), 3000);
        let later = thin_trail(merge_stays(&walk(120..5120)), 3000);
        assert_eq!(earlier.step, later.step);
        let known: HashSet<i64> = earlier.points.iter().map(|point| point.first).collect();
        // The window's own first and last points aside, the same samples are kept.
        let shared = &later.points[1..later.points.len() - 1];
        let moved = shared
            .iter()
            .filter(|point| point.first < TRAIL_START + 5000 * 60 - later.step)
            .filter(|point| !known.contains(&point.first))
            .count();
        assert_eq!(moved, 0);
    }

    #[test]
    fn a_trail_of_only_teleports_is_cut_to_the_newest_points() {
        let points: Vec<HubLocationPoint> = (0..100)
            .map(|i| sample(i, if i % 2 == 0 { 1200 } else { 3200 }, 3200))
            .collect();
        let built = thin_trail(merge_stays(&points), 10);
        assert_eq!(built.points.len(), 10);
        assert!(built.truncated);
        assert_eq!(built.points.last().unwrap().last, TRAIL_START + 99 * 60);
    }

    #[test]
    fn trail_json_leaves_out_trailing_defaults_and_lists_world_changes() {
        let mut points = vec![
            sample(0, 3200, 3200),
            sample(1, 3201, 3200),
            sample(2, 3201, 3200),
            sample(3, 3202, 3200),
            sample(4, 3203, 3200),
        ];
        points[3].is_on_boat = Some(true);
        points[3].world = Some(330);
        points[4].world = Some(330);
        let json = trail_json("Zezima", &thin_trail(merge_stays(&points), 1000));
        assert_eq!(json["member"], "Zezima");
        assert_eq!(json["shared"], true);
        assert_eq!(json["step"], 60);
        assert_eq!(json["truncated"], false);
        assert_eq!(
            json["points"],
            serde_json::json!([
                [3200, 3200, 0, TRAIL_START],
                [3201, 3200, 0, TRAIL_START + 120, 60],
                [3202, 3200, 0, TRAIL_START + 180, 0, 1],
                [3203, 3200, 0, TRAIL_START + 240],
            ])
        );
        assert_eq!(json["worlds"], serde_json::json!([[0, 302], [2, 330]]));
    }
}
