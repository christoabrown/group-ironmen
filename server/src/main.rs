use server::config::Config;
use server::hub::{self, HubContext, HubStatus};
use server::{api, db, models, unauthed, update_batcher};
use std::sync::{Arc, RwLock};
use std::time::Duration;

use actix_cors::Cors;
use actix_web::{http::header, middleware, web, App, HttpServer};
use deadpool_postgres::Runtime;
use tokio::sync::mpsc;
use tokio_postgres::NoTls;

use mimalloc::MiMalloc;

#[global_allocator]
static GLOBAL: MiMalloc = MiMalloc;

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    let config = Config::from_env().unwrap();
    if let Err(err) = config.require_hub().and(config.require_discord()) {
        eprintln!("{}", err);
        std::process::exit(1);
    }
    let pool = config.pg.create_pool(Some(Runtime::Tokio1), NoTls).unwrap();
    env_logger::init_from_env(
        env_logger::Env::new().default_filter_or(config.logger.level.to_string()),
    );

    let mut client = pool.get().await.unwrap();
    if let Err(err) = db::update_schema(&mut client).await {
        eprintln!("{}", err);
        std::process::exit(1);
    }
    if !config.discord.is_discord() {
        log::warn!(
            "Signing in goes through {} instead of Discord: anyone who can answer there can \
             sign in as anyone. Only for a stand-in on a development machine.",
            config.discord.api_base
        );
    }

    unauthed::start_ge_updater();
    unauthed::start_skills_aggregator(pool.clone());

    let update_batcher_pool = config.pg.create_pool(Some(Runtime::Tokio1), NoTls).unwrap();
    let (tx, rx) = mpsc::channel::<models::MemberData>(10000);
    tokio::spawn(async move {
        update_batcher::background_worker(update_batcher_pool, rx, None).await;
    });

    let hub_status = Arc::new(RwLock::new(HubStatus {
        history_enabled: config.hub_history_enabled(),
        base_url: config.hub.base_url.clone(),
        ..Default::default()
    }));
    let hub_client = hub::client::HubClient::new(&config.hub);
    let hub_events = hub::events::EventBuffer::default();
    let hub_directory = hub::directory::HubDirectory::load(&client).await.unwrap();
    let sync_control = hub::sync::SyncControl::default();
    let hub_capabilities = hub::SharedKeyCapabilities::default();
    if let Some(status) = hub_status.write().ok().as_mut() {
        status.request_budget_per_min = hub_client.budget_per_min();
        status.bulk_accounts = hub::USER_KEY_BULK_ACCOUNTS;
    }
    hub::start_key_discovery(
        Arc::clone(&hub_client),
        config.hub.request_budget_per_min,
        Arc::clone(&hub_capabilities),
        Arc::clone(&hub_status),
    );
    hub::sync::start(hub::sync::SyncContext {
        pool: pool.clone(),
        client: Arc::clone(&hub_client),
        sender: tx.clone(),
        config: config.hub.clone(),
        status: Arc::clone(&hub_status),
        directory: hub_directory.clone(),
        control: sync_control.clone(),
    });
    hub::members::start(pool.clone(), Arc::clone(&hub_client));
    if config.hub_history_enabled() {
        hub::events::start(
            Arc::clone(&hub_client),
            hub_events.clone(),
            Duration::from_secs(config.hub.events_poll_secs),
            Arc::clone(&hub_status),
        );
    }
    let hub_context = web::Data::new(HubContext {
        client: hub_client,
        status: hub_status,
        cache: Arc::new(hub::cache::TtlCache::new()),
        events: hub_events,
        capabilities: hub_capabilities,
        directory: hub_directory,
        sync_control,
    });

    HttpServer::new(move || {
        let json_config = web::JsonConfig::default().limit(100000);
        let cors = Cors::default()
            .allowed_origin("http://localhost:4000")
            .allowed_origin("http://127.0.0.1:4000")
            .allowed_origin("http://localhost:8080")
            .allowed_origin("http://127.0.0.1:8080")
            .allowed_methods(vec!["GET", "POST", "DELETE", "PUT", "OPTIONS"])
            .allowed_headers(vec![
                header::AUTHORIZATION,
                header::ACCEPT,
                header::CONTENT_TYPE,
                header::CONTENT_LENGTH,
                header::COOKIE,
            ])
            .supports_credentials()
            .max_age(3600);
        App::new()
            .wrap(
                middleware::Logger::new("\"%r\" %s %b \"%{User-Agent}i\" %D")
                    .exclude(api::MEMBERS_PATH)
                    .exclude(api::HEALTH_PATH),
            )
            .wrap(middleware::Compress::default())
            .wrap(cors)
            .app_data(web::PayloadConfig::new(100000))
            .app_data(json_config)
            .app_data(web::Data::new(pool.clone()))
            .app_data(web::Data::new(config.clone()))
            .app_data(hub_context.clone())
            .configure(api::configure)
    })
    .bind(("0.0.0.0", 8080))?
    .run()
    .await
}
