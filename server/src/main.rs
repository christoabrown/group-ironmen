mod auth_middleware;
mod authed;
mod crypto;
mod db;
mod error;
mod models;
mod unauthed;
mod validators;
use crate::auth_middleware::AuthenticateMiddlewareFactory;

use actix_cors::Cors;
use actix_web::{http::header, middleware, web, App, HttpServer};
use tokio_postgres::NoTls;

mod config {
    pub use ::config::{ConfigError, File};
    use serde::Deserialize;
    #[derive(Deserialize)]
    pub struct Config {
        pub pg: deadpool_postgres::Config,
    }
    impl Config {
        pub fn from_env() -> Result<Self, ConfigError> {
            let cfg = ::config::Config::builder()
                .add_source(File::with_name("config"))
                .build()?;
            cfg.try_deserialize()
        }
    }
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    let config = crate::config::Config::from_env().unwrap();
    let pool = config.pg.create_pool(None, NoTls).unwrap();
    env_logger::init_from_env(env_logger::Env::new().default_filter_or("info"));

    let mut client = pool.get().await.unwrap();
    db::update_schema(&mut client).await.unwrap();

    unauthed::start_ge_updater();

    HttpServer::new(move || {
        let unauthed_scope = web::scope("/api")
            .service(unauthed::create_group)
            .service(unauthed::get_ge_prices);
        let authed_scope = web::scope("/api/group/{group_name}")
            .wrap(AuthenticateMiddlewareFactory::new())
            .service(authed::update_group_member)
            .service(authed::get_group_data)
            .service(authed::add_group_member)
            .service(authed::delete_group_member)
            .service(authed::rename_group_member)
            .service(authed::am_i_logged_in)
            .service(authed::am_i_in_group);
        let json_config = web::JsonConfig::default().limit(100000);
        let cors = Cors::default()
            .allow_any_origin()
            .send_wildcard()
            .allowed_methods(vec!["GET", "POST", "DELETE", "PUT"])
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
            .service(authed_scope)
            .service(unauthed_scope)
    })
    .bind(("0.0.0.0", 8080))?
    .run()
    .await
}
