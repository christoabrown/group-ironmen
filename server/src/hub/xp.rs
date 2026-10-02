//! XP history for the skill graphs, from the hub's `/xp`.
use crate::hub::client::{HubError, Priority};
use crate::hub::fetch::{bulk_accounts, bulk_or_each, parse, Period};
use crate::hub::models::{HubXpLine, HubXpMulti};
use crate::hub::HubContext;
use crate::models::{AggregateSkillData, MemberSkillData, SkillHistory};
use crate::osrs::{skill_index, SKILL_ORDER};
use chrono::{DateTime, Duration as ChronoDuration, Utc};
use serde_json::Value;
use std::collections::{BTreeSet, HashMap, HashSet};
use std::sync::Arc;
use std::time::Duration;

type XpPoint = (DateTime<Utc>, i64);

/// A request naming more skills than this is retried without the unknown ones at most this often.
const MAX_UNKNOWN_SKILL_RETRIES: usize = 5;
const XP_TTL: Duration = Duration::from_secs(300);

/// Where a graph of the period starts, one point before the period itself,
/// and the hub's resolution for it.
fn xp_window(period: Period, now: DateTime<Utc>) -> (DateTime<Utc>, &'static str) {
    match period {
        Period::Day => (now - ChronoDuration::hours(25), "1h"),
        period => (now - ChronoDuration::days(period.days() + 1), "1d"),
    }
}

/// Turns the hub's per-skill XP series (points only where XP changed) into the
/// rows the skill graphs expect: one row per point in time with the XP of all
/// skills in `SKILL_ORDER`, carrying each skill's last value forward.
pub(crate) fn xp_series_to_rows(series: &[HubXpLine]) -> Vec<AggregateSkillData> {
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
    period: Period,
) -> Result<Arc<Value>, HubError> {
    let client = &context.client;
    let key = format!("xp:{}:{}", period, ids.join(","));
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
    period: Period,
) -> HashMap<String, Vec<AggregateSkillData>> {
    let names_by_id: HashMap<&str, &str> = bindings
        .iter()
        .map(|(name, id)| (id.as_str(), name.as_str()))
        .collect();
    let mut ids: Vec<String> = bindings.iter().map(|(_, id)| id.clone()).collect();
    ids.sort();

    let mut result = HashMap::new();
    for chunk in ids.chunks(bulk_accounts(context)) {
        let fetch = |ids: Vec<String>| async move { fetch_xp_chunk(context, &ids, period).await };
        let values = match bulk_or_each(chunk, fetch).await {
            Ok(values) => values,
            // The members of this chunk keep their local history.
            Err(err) => {
                log::debug!("No hub XP history for {:?}: {}", chunk, err);
                continue;
            }
        };
        for value in values {
            let Ok(multi) = parse::<HubXpMulti>(&value) else {
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

/// Local skill history with every hub-bound member replaced by the hub's
/// history. With `members`, only those members (case-insensitive).
pub(crate) async fn merge_skill_data(
    context: &HubContext,
    period: Period,
    local: SkillHistory,
    members: Option<&HashSet<String>>,
) -> SkillHistory {
    let wanted = |name: &str| members.is_none_or(|members| members.contains(&name.to_lowercase()));
    let local: SkillHistory = local
        .into_iter()
        .filter(|member| wanted(&member.name))
        .collect();
    let bindings: Vec<(String, String)> = context
        .directory
        .bindings()
        .into_iter()
        .filter(|(name, _)| wanted(name))
        .collect();
    if bindings.is_empty() {
        return local;
    }
    let mut hub = hub_skill_data(context, &bindings, period).await;
    let mut merged: SkillHistory = local
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
    merged
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
    fn a_graph_starts_one_point_before_its_period() {
        let now = at("2026-09-29T12:00:00Z");
        assert_eq!(
            xp_window(Period::Day, now),
            (at("2026-09-28T11:00:00Z"), "1h")
        );
        assert_eq!(
            xp_window(Period::Week, now),
            (at("2026-09-21T12:00:00Z"), "1d")
        );
        assert_eq!(
            xp_window(Period::Month, now),
            (at("2026-08-29T12:00:00Z"), "1d")
        );
        assert_eq!(
            xp_window(Period::Year, now),
            (at("2025-09-28T12:00:00Z"), "1d")
        );
    }

    #[test]
    fn unknown_skill_is_read_from_the_hub_message() {
        assert_eq!(
            unknown_skill("unknown skill: Sailing").as_deref(),
            Some("Sailing")
        );
        assert_eq!(unknown_skill("too many accounts"), None);
    }
}
