use crate::collection_log::COLLECTION_LOG_DATA;
use crate::config::Config;
use crate::db;
use crate::error::ApiError;
use crate::models::{CaptchaVerifyResponse, CreateGroup, GEPrices, WikiGEPrices};
use crate::validators::valid_name;
use actix_web::{get, http::header::ContentType, post, web, Error, HttpResponse};
use arc_swap::{ArcSwap, ArcSwapAny};
use deadpool_postgres::{Client, Pool};
use lazy_static::lazy_static;
use std::sync::Arc;
use std::time::Duration;
use tokio::{task, time};

lazy_static! {
    static ref GE_PRICES: ArcSwapAny<Arc<String>> = ArcSwap::from(Arc::new(String::default()));
    static ref HTTP_CLIENT: reqwest::Client = reqwest::Client::new();
}

pub async fn fetch_latest_prices() -> Result<WikiGEPrices, ApiError> {
    let res = HTTP_CLIENT
        .get("https://prices.runescape.wiki/api/v1/osrs/latest")
        .header("User-Agent", "Group Ironmen - Dprk#8740")
        .send()
        .await
        .map_err(ApiError::ReqwestError)?;
    let wiki_ge_prices = res
        .json::<WikiGEPrices>()
        .await
        .map_err(ApiError::ReqwestError)?;

    Ok(wiki_ge_prices)
}

pub async fn update_ge_prices() -> Result<(), ApiError> {
    let wiki_ge_prices = fetch_latest_prices().await?;
    let mut ge_prices: GEPrices = std::collections::HashMap::new();
    for (item_id, wiki_ge_price) in wiki_ge_prices.data {
        let mut avg_ge_price: i64 = 0;
        match wiki_ge_price.high {
            Some(high) => avg_ge_price = high,
            None => (),
        }
        match wiki_ge_price.low {
            Some(low) => {
                if avg_ge_price > 0 {
                    avg_ge_price = (avg_ge_price + low) / 2
                } else {
                    avg_ge_price = low
                }
            }
            None => (),
        }

        ge_prices.insert(item_id, avg_ge_price);
    }

    GE_PRICES.store(Arc::new(serde_json::to_string(&ge_prices)?));

    Ok(())
}

pub fn start_ge_updater() {
    task::spawn(async {
        let mut interval = time::interval(Duration::from_secs(14400));

        loop {
            interval.tick().await;
            log::info!("Fetching latest ge prices");

            match update_ge_prices().await {
                Ok(_) => (),
                Err(err) => {
                    log::error!("Failed to fetch latest ge prices: {}", err);
                }
            }
        }
    });
}

pub fn start_skills_aggregator(db_pool: Pool) {
    task::spawn(async move {
        let mut interval = time::interval(Duration::from_secs(1800));

        loop {
            interval.tick().await;
            log::info!("Running skill aggregator");

            match db_pool.get().await {
                Ok(mut client) => {
                    match db::aggregate_skills(&mut client).await {
                        Ok(_) => (),
                        Err(err) => {
                            log::error!("Failed to aggregate skills: {}", err);
                        }
                    }

                    match db::apply_skills_retention(&mut client).await {
                        Ok(_) => (),
                        Err(err) => {
                            log::error!("Failed to apply skills retention: {}", err);
                        }
                    }
                }
                Err(err) => {
                    log::error!("Failed to get db client: {}", err);
                }
            }
        }
    });
}

#[get("/ge-prices")]
pub async fn get_ge_prices() -> Result<HttpResponse, Error> {
    let ge_prices_opt = GE_PRICES.load();
    let res: String = (&**ge_prices_opt).clone();

    Ok(HttpResponse::Ok()
        .append_header(("Cache-Control", "public, max-age=86400"))
        .content_type("application/json")
        .body(res))
}

pub async fn verify_captcha(
    response: &String,
    secret: &String,
) -> Result<CaptchaVerifyResponse, ApiError> {
    let body = [("response", response), ("secret", secret)];

    let res = HTTP_CLIENT
        .post("https://hcaptcha.com/siteverify")
        .form(&body)
        .send()
        .await
        .map_err(ApiError::ReqwestError)?;
    let captcha_verify_response = res
        .json::<CaptchaVerifyResponse>()
        .await
        .map_err(ApiError::ReqwestError)?;

    Ok(captcha_verify_response)
}

#[post("/create-group")]
pub async fn create_group(
    create_group: web::Json<CreateGroup>,
    db_pool: web::Data<Pool>,
    config: web::Data<Config>,
) -> Result<HttpResponse, Error> {
    let mut create_group_inner = create_group.into_inner();

    if config.hcaptcha.enabled {
        let captcha_verify_response = verify_captcha(
            &create_group_inner.captcha_response,
            &config.hcaptcha.secret,
        )
        .await?;
        if !captcha_verify_response.success {
            return Ok(HttpResponse::BadRequest().body("Captcha response verification failed"));
        }
    }

    if create_group_inner.member_names.len() > 5 {
        return Ok(HttpResponse::BadRequest().body("Too many member names provided"));
    }

    create_group_inner.name = create_group_inner.name.trim().to_string();
    if !valid_name(&create_group_inner.name) {
        return Ok(HttpResponse::BadRequest().body("Provided group name is not valid"));
    }

    create_group_inner
        .member_names
        .retain(|member_name| member_name.trim().len() > 0);
    for member_name in &create_group_inner.member_names {
        if !valid_name(&member_name) {
            return Ok(HttpResponse::BadRequest()
                .body(format!("Member name {} is not valid", member_name)));
        }
    }

    let mut client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;
    db::create_group(&mut client, &create_group_inner).await?;
    Ok(HttpResponse::Created().json(&create_group_inner))
}

#[get("captcha-enabled")]
pub async fn captcha_enabled(config: web::Data<Config>) -> Result<HttpResponse, Error> {
    Ok(HttpResponse::Ok().json(&config.hcaptcha))
}

#[get("collection-log-info")]
pub async fn collection_log_info() -> HttpResponse {
    HttpResponse::Ok()
        .content_type(ContentType::json())
        .body(&**COLLECTION_LOG_DATA)
}
