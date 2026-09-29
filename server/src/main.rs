use server::auth_middleware::{AuthenticateMiddlewareFactory, SessionMiddlewareFactory};
use server::config::Config;
use server::{
    admin_routes, auth_routes, authed, db, device, discord_routes, models, token_lockout, unauthed,
    update_batcher,
};

use actix_cors::Cors;
use actix_web::{http::header, middleware, web, App, HttpServer};
use tokio::sync::mpsc;
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

    // Get or create singleton group
    let group_id = db::get_or_create_singleton_group(&mut client)
        .await
        .unwrap();
    log::info!("Singleton group_id: {}", group_id);

    unauthed::start_ge_updater();
    unauthed::start_skills_aggregator(pool.clone());

    let update_batcher_pool = config.pg.create_pool(None, NoTls).unwrap();
    let (tx, rx) = mpsc::channel::<models::GroupMember>(10000);
    tokio::spawn(async move {
        update_batcher::background_worker(update_batcher_pool, rx, None).await;
    });
    let auth_cache = std::sync::Arc::new(server::auth_middleware::AuthenticationCache::new());

    let token_lockout = web::Data::new(token_lockout::TokenLockout::new(
        std::time::Duration::from_secs(15 * 60),
    ));

    HttpServer::new(move || {
        // Public auth endpoints (no session required)
        let auth_scope = web::scope("/api/auth")
            .service(auth_routes::setup_status)
            .service(auth_routes::setup)
            .service(auth_routes::login)
            .service(discord_routes::discord_enabled)
            .service(discord_routes::discord_callback);

        // Session-protected auth endpoints
        let session_auth_scope = web::scope("/api/auth")
            .wrap(SessionMiddlewareFactory::new())
            .service(auth_routes::logout)
            .service(auth_routes::me)
            .service(auth_routes::change_password);

        // Admin routes (session + admin role required)
        let admin_scope = web::scope("/api/admin")
            .wrap(SessionMiddlewareFactory::new())
            .service(admin_routes::list_users)
            .service(admin_routes::create_user)
            .service(admin_routes::change_user_role)
            .service(admin_routes::disable_user)
            .service(admin_routes::enable_user)
            .service(admin_routes::kick_user)
            .service(admin_routes::admin_change_password)
            .service(admin_routes::get_audit_log)
            .service(admin_routes::list_players)
            .service(admin_routes::delete_player)
            .service(admin_routes::get_user_players)
            .service(admin_routes::get_player_users);

        // Session-protected group data routes
        let session_group_scope = web::scope("/api/group")
            .wrap(SessionMiddlewareFactory::new())
            .service(authed::get_group_data)
            .service(authed::add_group_member)
            .service(authed::delete_group_member)
            .service(authed::rename_group_member)
            .service(authed::update_group_member)
            .service(authed::am_i_logged_in)
            .service(authed::am_i_in_group)
            .service(authed::get_skill_data)
            .service(authed::get_collection_log)
            .service(device::create_pairing_code);

        // Legacy group token auth scope (backward compat)
        let legacy_authed_scope = web::scope("/api/group/{group_name}")
            .wrap(AuthenticateMiddlewareFactory::new(auth_cache.clone()))
            .service(authed::update_group_member)
            .service(authed::get_group_data)
            .service(authed::add_group_member)
            .service(authed::delete_group_member)
            .service(authed::rename_group_member)
            .service(authed::am_i_logged_in)
            .service(authed::am_i_in_group)
            .service(authed::get_skill_data)
            .service(authed::get_collection_log)
            .service(device::create_pairing_code_legacy);

        // Public endpoints
        let unauthed_scope = web::scope("/api")
            .service(unauthed::create_group)
            .service(unauthed::get_ge_prices)
            .service(unauthed::captcha_enabled)
            .service(device::pair_device)
            .service(device::ingest);

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
                header::HeaderName::from_static("x-osrs-token"),
            ])
            .supports_credentials()
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
            .app_data(web::Data::new(tx.clone()))
            .app_data(web::Data::new(group_id))
            .app_data(token_lockout.clone())
            .service(auth_scope)
            .service(session_auth_scope)
            .service(admin_scope)
            .service(session_group_scope)
            .service(legacy_authed_scope)
            .service(unauthed_scope)
    })
    .bind(("0.0.0.0", 8080))?
    .run()
    .await
}
