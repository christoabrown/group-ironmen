use crate::auth_middleware::Authenticated;
use crate::config::Config;
use crate::db;
use crate::error::ApiError;
use crate::hub::HubContext;
use crate::models::{GroupDataResponse, GroupSkillData};
use actix_web::{get, web, Error};
use chrono::{DateTime, Utc};
use deadpool_postgres::{Client, Pool};
use serde::Deserialize;
use std::collections::HashSet;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GetGroupDataQuery {
    pub from_time: DateTime<Utc>,
}
#[get("/get-group-data")]
pub async fn get_group_data(
    auth: Authenticated,
    db_pool: web::Data<Pool>,
    query: web::Query<GetGroupDataQuery>,
) -> Result<web::Json<GroupDataResponse>, Error> {
    let from_time = query.from_time;
    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    let group_data = db::get_group_data(&client, auth.group_id, &from_time).await?;
    Ok(web::Json(group_data))
}

/// Players the skill graphs may ask for at once.
const MAX_SKILL_DATA_MEMBERS: usize = 10;

#[derive(Deserialize)]
pub enum SkillDataPeriod {
    Day,
    Week,
    Month,
    Year,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GetSkillDataQuery {
    pub period: SkillDataPeriod,
    /// Comma-separated member names; all members when left out.
    #[serde(default)]
    pub members: Option<String>,
}
#[get("/get-skill-data")]
pub async fn get_skill_data(
    auth: Authenticated,
    db_pool: web::Data<Pool>,
    query: web::Query<GetSkillDataQuery>,
    config: web::Data<Config>,
    hub_context: web::Data<HubContext>,
) -> Result<web::Json<GroupSkillData>, Error> {
    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    let aggregate_period = match query.period {
        SkillDataPeriod::Day => db::AggregatePeriod::Day,
        SkillDataPeriod::Week => db::AggregatePeriod::Month,
        SkillDataPeriod::Month => db::AggregatePeriod::Month,
        SkillDataPeriod::Year => db::AggregatePeriod::Year,
    };
    let members: Option<HashSet<String>> = query.members.as_deref().map(|members| {
        members
            .split(',')
            .map(|name| name.trim().to_lowercase())
            .filter(|name| !name.is_empty())
            .take(MAX_SKILL_DATA_MEMBERS)
            .collect()
    });
    let mut group_skill_data =
        db::get_skills_for_period(&client, auth.group_id, aggregate_period).await?;
    drop(client);
    if config.hub_history_enabled() {
        group_skill_data = crate::hub::proxy::merge_skill_data(
            &hub_context,
            &query.period,
            group_skill_data,
            members.as_ref(),
        )
        .await;
    } else if let Some(members) = &members {
        group_skill_data.retain(|member| members.contains(&member.name.to_lowercase()));
    }
    Ok(web::Json(group_skill_data))
}
