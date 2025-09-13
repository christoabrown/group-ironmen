mod auth_middleware;
mod authed;
mod collection_log;
mod config;
mod crypto;
mod db;
mod error;
mod models;
mod unauthed;
mod validators;
use crate::auth_middleware::AuthenticateMiddlewareFactory;
use crate::collection_log::CollectionLogInfo;
use crate::config::Config;

use actix_cors::Cors;
use actix_web::{http::header, middleware, web, App, HttpServer};
use tokio_postgres::NoTls;

use mimalloc::MiMalloc;

#[global_allocator]
static GLOBAL: MiMalloc = MiMalloc;

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    let config = Config::from_env().unwrap();
    let pool = config.pg.create_pool(None, NoTls).unwrap();
    env_logger::init_from_env(
        env_logger::Env::new().default_filter_or(config.logger.level.to_string()),
    );

    let mut client = pool.get().await.unwrap();
    db::update_schema(&mut client).await.unwrap();
    let collection_log_info: CollectionLogInfo =
        db::get_collection_log_info(&client).await.unwrap();

    unauthed::start_ge_updater();
    unauthed::start_skills_aggregator(pool.clone());

    HttpServer::new(move || {
        let unauthed_scope = web::scope("/api")
            .service(unauthed::create_group)
            .service(unauthed::get_ge_prices)
            .service(unauthed::captcha_enabled)
            .service(unauthed::collection_log_info);
        let authed_scope = web::scope("/api/group/{group_name}")
            .wrap(AuthenticateMiddlewareFactory::new())
            .service(authed::update_group_member)
            .service(authed::get_group_data)
            .service(authed::add_group_member)
            .service(authed::delete_group_member)
            .service(authed::rename_group_member)
            .service(authed::am_i_logged_in)
            .service(authed::am_i_in_group)
            .service(authed::get_skill_data)
            .service(authed::get_collection_log);
        let json_config = web::JsonConfig::default().limit(100000);
        let cors = Cors::default()
            .allow_any_origin()
            .send_wildcard()
            .allowed_methods(vec!["GET", "POST", "DELETE", "PUT", "OPTIONS"])
            .allowed_headers(vec![
                header::AUTHORIZATION,
                header::ACCEPT,
                header::CONTENT_TYPE,
                header::CONTENT_LENGTH,
            ])
            .max_age(3600);
        App::new()
            .wrap(middleware::Logger::new(
                "\"%r\" %s %b \"%{User-Agent}i\" %D",
            ))
            .wrap(middleware::Compress::default())
            .wrap(cors)
            .app_data(web::PayloadConfig::new(100000))
            .app_data(json_config)
            .app_data(web::Data::new(pool.clone()))
            .app_data(web::Data::new(config.clone()))
            .app_data(web::Data::new(collection_log_info.clone()))
            .service(authed_scope)
            .service(unauthed_scope)
    })
    .bind(("0.0.0.0", 8080))?
    .run()
    .await
}
