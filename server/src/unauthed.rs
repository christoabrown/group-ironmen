use crate::config::Config;
use crate::db;
use crate::error::ApiError;
use crate::models::{CaptchaVerifyResponse, CreateGroup, GEPrices, WikiGEPrices};
use crate::validators::valid_name;
use actix_web::{get, post, web, Error, HttpResponse};
use arc_swap::{ArcSwap, ArcSwapAny};
use deadpool_postgres::{Client, Pool};
use std::sync::Arc;
use std::sync::LazyLock;
use std::time::Duration;
use tokio::{task, time};

static GE_PRICES: LazyLock<ArcSwapAny<Arc<String>>> =
    LazyLock::new(|| ArcSwap::from(Arc::new(String::default())));
pub async fn fetch_latest_prices() -> Result<WikiGEPrices, ApiError> {
    let wiki_ge_prices = task::spawn_blocking(|| {
        ureq::get("https://prices.runescape.wiki/api/v1/osrs/latest")
            .header("User-Agent", "Group Ironmen - Dprk#8740")
            .call()
            .map_err(ApiError::UreqError)?
            .body_mut()
            .read_json::<WikiGEPrices>()
            .map_err(ApiError::UreqError)
    })
    .await
    .unwrap()?;

    Ok(wiki_ge_prices)
}

pub async fn update_ge_prices() -> Result<(), ApiError> {
    let wiki_ge_prices = fetch_latest_prices().await?;
    let mut ge_prices: GEPrices = std::collections::HashMap::new();
    for (item_id, wiki_ge_price) in wiki_ge_prices.data {
        let mut avg_ge_price: i64 = 0;
        if let Some(high) = wiki_ge_price.high {
            avg_ge_price = high
        }
        if let Some(low) = wiki_ge_price.low {
            if avg_ge_price > 0 {
                avg_ge_price = (avg_ge_price + low) / 2
            } else {
                avg_ge_price = low
            }
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
    let res: String = (**ge_prices_opt).clone();

    Ok(HttpResponse::Ok()
        .append_header(("Cache-Control", "public, max-age=86400"))
        .content_type("application/json")
        .body(res))
}

pub async fn verify_captcha(
    response: &str,
    secret: &str,
) -> Result<CaptchaVerifyResponse, ApiError> {
    let response = response.to_owned();
    let secret = secret.to_owned();
    let captcha_verify_response = task::spawn_blocking(move || {
        ureq::post("https://hcaptcha.com/siteverify")
            .send_form([("response", response.as_str()), ("secret", secret.as_str())])
            .map_err(ApiError::UreqError)?
            .body_mut()
            .read_json::<CaptchaVerifyResponse>()
            .map_err(ApiError::UreqError)
    })
    .await
    .unwrap()?;

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
        .retain(|member_name| !member_name.trim().is_empty());
    for member_name in &create_group_inner.member_names {
        if !valid_name(member_name) {
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
