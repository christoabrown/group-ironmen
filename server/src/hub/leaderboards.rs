//! The guild's leaderboards from the hub: who gained the most XP, and the
//! most valuable drops.
use crate::auth_middleware::Authenticated;
use crate::config::Config;
use crate::hub::client::HubError;
use crate::hub::events::{event_json, EventFilter};
use crate::hub::fetch::{cached, history_enabled, HistoryError, Period};
use crate::hub::models::{HubEvent, HubLeaderboards, HubLootLeaderboard};
use crate::hub::HubContext;
use actix_web::{get, web, HttpResponse};
use chrono::{Duration as ChronoDuration, Utc};
use serde::Deserialize;
use serde_json::Value;
use std::time::Duration;

const GAINS_BOARD_TTL: Duration = Duration::from_secs(300);
const LOOT_BOARD_TTL: Duration = Duration::from_secs(60);
/// The drops asked of the hub; a request for fewer is cut from the same answer.
const LOOT_BOARD_SIZE: usize = 50;

#[derive(Deserialize)]
pub(crate) struct GainsQuery {
    #[serde(default)]
    period: Option<Period>,
}

/// The period of a leaderboard, which go back a month at most.
fn board_period(period: Option<Period>, default: Period) -> Result<Period, HistoryError> {
    match period.unwrap_or(default) {
        Period::Year => Err(HistoryError::BadRequest(
            "period must be day, week or month".to_owned(),
        )),
        period => Ok(period),
    }
}

#[get("/hub/gains")]
pub async fn get_gains(
    _auth: Authenticated,
    query: web::Query<GainsQuery>,
    config: web::Data<Config>,
    context: web::Data<HubContext>,
) -> Result<HttpResponse, HistoryError> {
    history_enabled(&config)?;
    let period = board_period(query.period, Period::Day)?;
    let leaderboards: HubLeaderboards = cached(
        &context,
        &format!("gains:{period}"),
        GAINS_BOARD_TTL,
        "/leaderboards/gains",
        &[("period", period.to_string())],
    )
    .await?;

    let directory = &context.directory;
    let boards: Vec<Value> = leaderboards
        .leaderboards
        .into_iter()
        .map(|board| {
            let entries: Vec<Value> = board
                .entries
                .into_iter()
                .filter(|entry| !directory.is_hidden(&entry.account.id))
                .map(|entry| {
                    serde_json::json!({
                        "rank": entry.rank,
                        "name": directory.member_name(&entry.account.id).unwrap_or(entry.account.name),
                        "gain": entry.gain,
                    })
                })
                .collect();
            serde_json::json!({ "skill": board.skill, "entries": entries })
        })
        .collect();
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "period": leaderboards.period,
        "leaderboards": boards,
    })))
}

#[derive(Deserialize)]
pub(crate) struct LootQuery {
    #[serde(default)]
    period: Option<Period>,
    #[serde(default)]
    limit: Option<usize>,
}

/// The period's most valuable drops. Falls back to the buffered events (marked
/// `partial`) when the hub predates `/leaderboards/loot`.
#[get("/hub/leaderboards/loot")]
pub async fn get_loot_leaderboard(
    _auth: Authenticated,
    query: web::Query<LootQuery>,
    config: web::Data<Config>,
    context: web::Data<HubContext>,
) -> Result<HttpResponse, HistoryError> {
    history_enabled(&config)?;
    let period = board_period(query.period, Period::Week)?;
    let limit = query.limit.unwrap_or(10).clamp(1, LOOT_BOARD_SIZE);
    let board = cached::<HubLootLeaderboard>(
        &context,
        &format!("loot:{period}"),
        LOOT_BOARD_TTL,
        "/leaderboards/loot",
        &[
            ("period", period.to_string()),
            ("limit", LOOT_BOARD_SIZE.to_string()),
        ],
    )
    .await;
    let (events, partial): (Vec<HubEvent>, bool) = match board {
        Ok(board) => (
            board.entries.into_iter().map(|entry| entry.event).collect(),
            false,
        ),
        Err(HubError::NotFound) => (loot_from_buffer(&context, period), true),
        Err(err) => return Err(err.into()),
    };
    let directory = &context.directory;
    let entries: Vec<Value> = events
        .iter()
        .filter(|event| !directory.is_hidden(&event.account.id))
        .take(limit)
        .enumerate()
        .map(|(index, event)| {
            serde_json::json!({ "rank": index + 1, "event": event_json(None, event, directory) })
        })
        .collect();
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "period": period.as_str(),
        "partial": partial,
        "entries": entries,
    })))
}

/// The most valuable buffered drops of the period, for hubs without the loot leaderboard.
fn loot_from_buffer(context: &HubContext, period: Period) -> Vec<HubEvent> {
    let since = Utc::now() - ChronoDuration::days(period.days());
    let types = ["loot".to_string(), "pk_loot".to_string()];
    let filter = EventFilter {
        types: &types,
        ..Default::default()
    };
    let mut events: Vec<HubEvent> = context
        .events
        .query(&filter, usize::MAX)
        .into_iter()
        .map(|buffered| buffered.event)
        .filter(|event| {
            event.occurred_at >= since
                && event.value_gp.is_some()
                && !event.special_world.unwrap_or(false)
        })
        .collect();
    events.sort_by_key(|event| std::cmp::Reverse((event.value_gp, event.occurred_at)));
    events
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_leaderboard_goes_back_a_month_at_most() {
        assert_eq!(board_period(None, Period::Week).unwrap(), Period::Week);
        assert_eq!(
            board_period(Some(Period::Month), Period::Day).unwrap(),
            Period::Month
        );
        assert!(board_period(Some(Period::Year), Period::Day).is_err());
    }
}
