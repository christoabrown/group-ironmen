use crate::auth_middleware::Authenticated;
use crate::collection_log::{CollectionLog, CollectionLogInfo};
use crate::db;
use crate::error::ApiError;
use crate::models::{
    AmIInGroupRequest, GroupMember, GroupSkillData, RenameGroupMember, SHARED_MEMBER,
};
use crate::validators::{valid_name, validate_collection_log, validate_member_prop_length};
use actix_web::{delete, get, post, put, web, Error, HttpResponse};
use chrono::{DateTime, Utc};
use deadpool_postgres::{Client, Pool};
use serde::Deserialize;
use std::collections::HashMap;

#[post("/add-group-member")]
pub async fn add_group_member(
    auth: Authenticated,
    group_member: web::Json<GroupMember>,
    db_pool: web::Data<Pool>,
) -> Result<HttpResponse, Error> {
    if group_member.name.eq(SHARED_MEMBER) {
        return Ok(
            HttpResponse::BadRequest().body(format!("Member name {} not allowed", SHARED_MEMBER))
        );
    }

    if !valid_name(&group_member.name) {
        return Ok(HttpResponse::BadRequest()
            .body(format!("Member name {} is not valid", group_member.name)));
    }

    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    db::add_group_member(&client, auth.group_id, &group_member.name).await?;
    Ok(HttpResponse::Created().finish())
}

#[delete("/delete-group-member")]
pub async fn delete_group_member(
    auth: Authenticated,
    group_member: web::Json<GroupMember>,
    db_pool: web::Data<Pool>,
) -> Result<HttpResponse, Error> {
    if group_member.name.eq(SHARED_MEMBER) {
        return Ok(
            HttpResponse::BadRequest().body(format!("Member name {} not allowed", SHARED_MEMBER))
        );
    }

    let mut client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    db::delete_group_member(&mut client, auth.group_id, &group_member.name).await?;
    Ok(HttpResponse::Ok().finish())
}

#[put("/rename-group-member")]
pub async fn rename_group_member(
    auth: Authenticated,
    rename_member: web::Json<RenameGroupMember>,
    db_pool: web::Data<Pool>,
) -> Result<HttpResponse, Error> {
    if rename_member.original_name.eq(SHARED_MEMBER) || rename_member.new_name.eq(SHARED_MEMBER) {
        return Ok(
            HttpResponse::BadRequest().body(format!("Member name {} not allowed", SHARED_MEMBER))
        );
    }

    if !valid_name(&rename_member.new_name) {
        return Ok(HttpResponse::BadRequest().body(format!(
            "Member name {} is not valid",
            rename_member.new_name
        )));
    }

    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    db::rename_group_member(
        &client,
        auth.group_id,
        &rename_member.original_name,
        &rename_member.new_name,
    )
    .await?;
    Ok(HttpResponse::Ok().finish())
}

#[post("/update-group-member")]
pub async fn update_group_member(
    auth: Authenticated,
    group_member: web::Json<GroupMember>,
    db_pool: web::Data<Pool>,
    collection_log_info: web::Data<CollectionLogInfo>,
) -> Result<HttpResponse, Error> {
    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    let in_group: bool = db::is_member_in_group(&client, auth.group_id, &group_member.name).await?;
    if !in_group {
        return Ok(HttpResponse::Unauthorized().body("Player is not a member of this group"));
    }
    let mut group_member_inner: GroupMember = group_member.into_inner();

    validate_member_prop_length("stats", &group_member_inner.stats, 7, 7)?;
    validate_member_prop_length("coordinates", &group_member_inner.coordinates, 3, 3)?;
    validate_member_prop_length("skills", &group_member_inner.skills, 23, 24)?;
    validate_member_prop_length("quests", &group_member_inner.quests, 0, 220)?;
    validate_member_prop_length("inventory", &group_member_inner.inventory, 56, 56)?;
    validate_member_prop_length("equipment", &group_member_inner.equipment, 28, 28)?;
    validate_member_prop_length("bank", &group_member_inner.bank, 0, 3000)?;
    validate_member_prop_length("shared_bank", &group_member_inner.shared_bank, 0, 1000)?;
    validate_member_prop_length("rune_pouch", &group_member_inner.rune_pouch, 6, 8)?;
    validate_member_prop_length("seed_vault", &group_member_inner.seed_vault, 0, 500)?;
    validate_member_prop_length("deposited", &group_member_inner.deposited, 0, 200)?;
    validate_member_prop_length("diary_vars", &group_member_inner.diary_vars, 0, 62)?;
    validate_collection_log(&collection_log_info, &mut group_member_inner.collection_log)?;

    db::update_group_member(
        &client,
        auth.group_id,
        group_member_inner,
        collection_log_info,
    )
    .await?;
    Ok(HttpResponse::Ok().finish())
}

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
) -> Result<web::Json<Vec<GroupMember>>, Error> {
    let from_time = query.from_time;
    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    let group_members = db::get_group_data(&client, auth.group_id, &from_time).await?;
    Ok(web::Json(group_members))
}

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
}
#[get("/get-skill-data")]
pub async fn get_skill_data(
    auth: Authenticated,
    db_pool: web::Data<Pool>,
    query: web::Query<GetSkillDataQuery>,
) -> Result<web::Json<GroupSkillData>, Error> {
    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    let aggregate_period = match query.period {
        SkillDataPeriod::Day => db::AggregatePeriod::Day,
        SkillDataPeriod::Week => db::AggregatePeriod::Month,
        SkillDataPeriod::Month => db::AggregatePeriod::Month,
        SkillDataPeriod::Year => db::AggregatePeriod::Year,
    };
    let group_skill_data =
        db::get_skills_for_period(&client, auth.group_id, aggregate_period).await?;
    Ok(web::Json(group_skill_data))
}

#[get("/collection-log")]
pub async fn get_collection_log(
    auth: Authenticated,
    db_pool: web::Data<Pool>,
) -> Result<web::Json<HashMap<String, Vec<CollectionLog>>>, Error> {
    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    let collection_logs = db::get_collection_log_for_group(&client, auth.group_id).await?;
    Ok(web::Json(collection_logs))
}

#[get("/am-i-logged-in")]
pub async fn am_i_logged_in(_auth: Authenticated) -> Result<HttpResponse, Error> {
    Ok(HttpResponse::Ok().finish())
}

#[get("/am-i-in-group")]
pub async fn am_i_in_group(
    auth: Authenticated,
    db_pool: web::Data<Pool>,
    q: web::Query<AmIInGroupRequest>,
) -> Result<HttpResponse, Error> {
    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    let in_group: bool = db::is_member_in_group(&client, auth.group_id, &q.member_name).await?;

    if !in_group {
        return Ok(HttpResponse::Unauthorized().body("Player is not a member of this group"));
    }
    Ok(HttpResponse::Ok().finish())
}
