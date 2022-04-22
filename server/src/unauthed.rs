use crate::db;
use crate::error::ApiError;
use crate::models::CreateGroup;
use crate::validators::valid_name;
use actix_web::{post, web, Error, HttpResponse};
use deadpool_postgres::{Client, Pool};

#[post("/create-group")]
pub async fn create_group(
    create_group: web::Json<CreateGroup>,
    db_pool: web::Data<Pool>,
) -> Result<HttpResponse, Error> {
    let mut create_group_inner = create_group.into_inner();
    create_group_inner.name = create_group_inner.name.trim().to_string();
    if !valid_name(&create_group_inner.name) {
        return Ok(HttpResponse::BadRequest().body("Provided group name is not valid"));
    }

    for i in 0..create_group_inner.member_names.len() {
        create_group_inner.member_names[i] = create_group_inner.member_names[i].trim().to_string();
        let member_name = &create_group_inner.member_names[i];
        if !member_name.is_empty() && !valid_name(&member_name) {
            return Ok(HttpResponse::BadRequest()
                .body(format!("Member name {} is not valid", member_name)));
        }
    }

    let mut client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    db::create_group(&mut client, &create_group_inner).await?;
    Ok(HttpResponse::Created().json(&create_group_inner))
}
