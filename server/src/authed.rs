//! What the map itself keeps of the members, for everyone who is signed in.
use crate::auth_middleware::Authenticated;
use crate::config::Config;
use crate::db;
use crate::error::ApiError;
use crate::hub::fetch::Period;
use crate::hub::HubContext;
use crate::models::{MembersResponse, SkillHistory};
use actix_web::{get, web, Error};
use chrono::{DateTime, Utc};
use deadpool_postgres::{Client, Pool};
use serde::Deserialize;
use std::collections::HashSet;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct MembersQuery {
    pub from_time: DateTime<Utc>,
}

/// The roster, and the data of the members that changed since `from_time`:
/// what every open page polls for.
#[get("/members")]
pub async fn get_members(
    _auth: Authenticated,
    db_pool: web::Data<Pool>,
    query: web::Query<MembersQuery>,
) -> Result<web::Json<MembersResponse>, Error> {
    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    Ok(web::Json(db::get_members(&client, &query.from_time).await?))
}

/// Players the skill graphs may ask for at once.
const MAX_SKILL_HISTORY_MEMBERS: usize = 10;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct SkillHistoryQuery {
    pub period: Period,
    /// Comma-separated member names; all members when left out.
    #[serde(default)]
    pub members: Option<String>,
}

/// XP per skill over a period, for the skill graphs.
#[get("/skill-history")]
pub async fn get_skill_history(
    _auth: Authenticated,
    db_pool: web::Data<Pool>,
    query: web::Query<SkillHistoryQuery>,
    config: web::Data<Config>,
    hub_context: web::Data<HubContext>,
) -> Result<web::Json<SkillHistory>, Error> {
    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    let aggregate_period = match query.period {
        Period::Day => db::AggregatePeriod::Day,
        Period::Week | Period::Month => db::AggregatePeriod::Month,
        Period::Year => db::AggregatePeriod::Year,
    };
    let members: Option<HashSet<String>> = query.members.as_deref().map(|members| {
        members
            .split(',')
            .map(|name| name.trim().to_lowercase())
            .filter(|name| !name.is_empty())
            .take(MAX_SKILL_HISTORY_MEMBERS)
            .collect()
    });
    let mut history = db::get_skills_for_period(&client, aggregate_period).await?;
    drop(client);
    if config.hub_history_enabled() {
        history =
            crate::hub::xp::merge_skill_data(&hub_context, query.period, history, members.as_ref())
                .await;
    } else if let Some(members) = &members {
        history.retain(|member| members.contains(&member.name.to_lowercase()));
    }
    Ok(web::Json(history))
}
