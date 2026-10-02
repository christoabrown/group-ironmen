//! Signing in: Discord says who someone is, the hub says whether they are a
//! member and an admin. Runs the real routes against an in-process stand-in
//! for both and a real PostgreSQL database (see `update_batcher_integration.rs`
//! for the database setup). Drops the test schema.
use actix_web::dev::ServiceResponse;
use actix_web::{test, web, App, HttpRequest, HttpResponse, HttpServer};
use deadpool_postgres::{ManagerConfig, Pool, RecyclingMethod};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::env;
use std::sync::{Arc, Mutex};
use tokio_postgres::NoTls;

use server::auth_middleware::SessionMiddlewareFactory;
use server::config::{Config, HubConfig};
use server::hub::client::HubClient;
use server::hub::{self, HubContext};
use server::models::GroupId;
use server::{admin_routes, auth_routes, db};

static TEST_MUTEX: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

const ALICE: &str = "200000000000000001";
const ADMIN: &str = "200000000000000002";
const STRANGER: &str = "200000000000000003";

async fn create_test_pool() -> Pool {
    let mut cfg = if let Ok(url) = env::var("TEST_DATABASE_URL") {
        let mut c = deadpool_postgres::Config::new();
        c.url = Some(url);
        c
    } else {
        let config = Config::from_env().expect("failed to read config");
        let mut pg = config.pg.clone();
        pg.dbname = Some("group_ironmen_test".to_string());
        pg
    };
    cfg.manager = Some(ManagerConfig {
        recycling_method: RecyclingMethod::Fast,
    });
    cfg.create_pool(None, NoTls)
        .expect("failed to create test pool")
}

// ----------------------------------------------------------------------------
// A stand-in for Discord and for the hub's /members
// ----------------------------------------------------------------------------

/// What the hub says of a Discord account: `(is_admin, name)`. An account that
/// isn't here is not a member.
#[derive(Default)]
struct Outside {
    members: HashMap<&'static str, (bool, &'static str)>,
    /// When set, `/members` answers with this status instead.
    members_status: Option<u16>,
    member_requests: usize,
}

type Shared = web::Data<Arc<Mutex<Outside>>>;

/// The code Discord hands the browser is "code-<discord id>" here, and the
/// access token is the id.
async fn discord_token(form: web::Form<HashMap<String, String>>) -> HttpResponse {
    match form.get("code").and_then(|code| code.strip_prefix("code-")) {
        Some(id) => HttpResponse::Ok().json(json!({"access_token": id, "token_type": "Bearer"})),
        None => HttpResponse::BadRequest().json(json!({"error": "invalid_grant"})),
    }
}

async fn discord_me(req: HttpRequest) -> HttpResponse {
    let id = req
        .headers()
        .get("Authorization")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .unwrap_or_default()
        .to_owned();
    HttpResponse::Ok()
        .json(json!({"id": id, "username": format!("user{id}"), "global_name": "From Discord"}))
}

async fn hub_member(req: HttpRequest, path: web::Path<String>, state: Shared) -> HttpResponse {
    assert_eq!(
        req.headers().get("Authorization").unwrap(),
        "Bearer ohub_test_key"
    );
    let mut outside = state.lock().unwrap();
    outside.member_requests += 1;
    if let Some(status) = outside.members_status {
        return HttpResponse::build(actix_web::http::StatusCode::from_u16(status).unwrap())
            .json(json!({"error": {"code": "not_found", "message": "no such endpoint"}}));
    }
    let id = path.into_inner();
    let member = outside.members.get(id.as_str());
    HttpResponse::Ok().json(json!({
        "data": {
            "discord_id": id,
            "member": member.is_some(),
            "is_admin": member.is_some_and(|(is_admin, _)| *is_admin),
            "name": member.map(|(_, name)| *name),
        },
        "meta": {"generated_at": chrono::Utc::now()}
    }))
}

async fn start_outside(state: Arc<Mutex<Outside>>) -> String {
    let data = web::Data::new(state);
    let server = HttpServer::new(move || {
        App::new()
            .app_data(data.clone())
            .route("/discord/oauth2/token", web::post().to(discord_token))
            .route("/discord/v10/users/@me", web::get().to(discord_me))
            .route("/api/v1/members/{discord_id}", web::get().to(hub_member))
    })
    .workers(1)
    .bind(("127.0.0.1", 0))
    .unwrap();
    let address = server.addrs()[0];
    actix_web::rt::spawn(server.run());
    format!("http://{}", address)
}

// ----------------------------------------------------------------------------
// The map, as far as signing in goes
// ----------------------------------------------------------------------------

struct Harness {
    pool: Pool,
    outside: Arc<Mutex<Outside>>,
    config: Config,
    hub: web::Data<HubContext>,
    group_id: i64,
}

async fn harness() -> Harness {
    let pool = create_test_pool().await;
    let group_id = {
        let mut client = pool.get().await.unwrap();
        client
            .execute("DROP SCHEMA IF EXISTS groupironman CASCADE", &[])
            .await
            .unwrap();
        db::update_schema(&mut client).await.unwrap();
        db::get_or_create_singleton_group(&mut client)
            .await
            .unwrap()
    };

    let outside = Arc::new(Mutex::new(Outside::default()));
    {
        let mut outside = outside.lock().unwrap();
        outside.members.insert(ALICE, (false, "Alice"));
        outside.members.insert(ADMIN, (true, "The Admin"));
    }
    let base_url = start_outside(Arc::clone(&outside)).await;

    let mut config: Config = basic_toml::from_str("").unwrap();
    config.discord.client_id = "client".to_string();
    config.discord.client_secret = "secret".to_string();
    config.discord.redirect_uri = "http://localhost:4000/login/discord".to_string();
    config.discord.api_base = format!("{base_url}/discord");
    let hub_config = HubConfig {
        base_url,
        api_key: "ohub_test_key".to_string(),
        ..HubConfig::default()
    };
    let hub = web::Data::new(HubContext {
        client: HubClient::new(&hub_config),
        status: Default::default(),
        cache: Arc::new(hub::cache::TtlCache::new()),
        events: Default::default(),
        capabilities: Default::default(),
        directory: Default::default(),
        sync_control: Default::default(),
    });

    Harness {
        pool,
        outside,
        config,
        hub,
        group_id,
    }
}

macro_rules! map_app {
    ($h:expr) => {
        test::init_service(
            App::new()
                .app_data(web::Data::new($h.pool.clone()))
                .app_data(web::Data::new($h.config.clone()))
                .app_data(web::Data::new(GroupId($h.group_id)))
                .app_data($h.hub.clone())
                .configure(auth_routes::configure)
                .service(
                    web::scope("/api/admin")
                        .wrap(SessionMiddlewareFactory)
                        .service(admin_routes::list_players),
                )
                .service(
                    web::scope("/api/group")
                        .wrap(SessionMiddlewareFactory)
                        .service(hub::routes::get_features),
                ),
        )
        .await
    };
}

fn cookie_of<B>(response: &ServiceResponse<B>, name: &str) -> Option<String> {
    response
        .response()
        .cookies()
        .find(|cookie| cookie.name() == name)
        .map(|cookie| cookie.value().to_owned())
}

/// Presses the button and comes back from Discord as `$discord_id`. (Macros,
/// not functions: the type of a test app can't be named.)
macro_rules! sign_in {
    ($app:expr, $discord_id:expr) => {{
        let start = test::call_service(
            $app,
            test::TestRequest::get()
                .uri("/api/auth/discord/start")
                .to_request(),
        )
        .await;
        assert_eq!(start.status(), 200);
        let state = cookie_of(&start, "discord_oauth_state").expect("a state cookie");
        let body: Value = test::read_body_json(start).await;
        let auth_url = body["auth_url"].as_str().unwrap();
        assert!(auth_url.contains("scope=identify&"), "{auth_url}");
        assert!(auth_url.ends_with(&format!("state={state}")), "{auth_url}");

        test::call_service(
            $app,
            test::TestRequest::post()
                .uri("/api/auth/discord/callback")
                .cookie(actix_web::cookie::Cookie::new(
                    "discord_oauth_state",
                    state.clone(),
                ))
                .set_json(json!({"code": format!("code-{}", $discord_id), "state": state}))
                .to_request(),
        )
        .await
    }};
}

/// The status a GET gets, with the session cookie when there is one.
macro_rules! status_with {
    ($app:expr, $uri:expr, $session:expr) => {{
        let session: Option<&str> = $session;
        let mut request = test::TestRequest::get().uri($uri);
        if let Some(session) = session {
            request = request.cookie(actix_web::cookie::Cookie::new(
                "session",
                session.to_owned(),
            ));
        }
        test::call_service($app, request.to_request())
            .await
            .status()
            .as_u16()
    }};
}

async fn session_count(pool: &Pool) -> i64 {
    let client = pool.get().await.unwrap();
    client
        .query_one("SELECT COUNT(*) FROM groupironman.sessions", &[])
        .await
        .unwrap()
        .get(0)
}

// ----------------------------------------------------------------------------
// Tests
// ----------------------------------------------------------------------------

#[actix_web::test]
async fn a_member_of_the_hub_signs_in_and_is_no_admin() {
    let _guard = TEST_MUTEX.lock().await;
    let h = harness().await;
    let app = map_app!(h);

    let response = sign_in!(&app, ALICE);
    assert_eq!(response.status(), 200);
    let session = cookie_of(&response, "session").expect("a session cookie");
    let cookie = response
        .response()
        .cookies()
        .find(|cookie| cookie.name() == "session")
        .unwrap();
    assert_eq!(cookie.http_only(), Some(true));
    // Who they are comes from the hub, and the session id stays in the cookie.
    let body: Value = test::read_body_json(response).await;
    assert_eq!(body, json!({"name": "Alice", "is_admin": false}));

    let request = test::TestRequest::get()
        .uri("/api/auth/me")
        .cookie(actix_web::cookie::Cookie::new("session", session.clone()))
        .to_request();
    let me: Value = test::call_and_read_body_json(&app, request).await;
    assert_eq!(me, json!({"name": "Alice", "is_admin": false}));

    assert_eq!(
        status_with!(&app, "/api/group/features", Some(&session)),
        200
    );
    assert_eq!(
        status_with!(&app, "/api/admin/players", Some(&session)),
        403
    );
    assert_eq!(status_with!(&app, "/api/group/features", None), 401);

    // The session id only counts as a cookie.
    let request = test::TestRequest::get()
        .uri("/api/group/features")
        .insert_header(("Authorization", format!("Bearer {session}")))
        .to_request();
    assert_eq!(test::call_service(&app, request).await.status(), 401);
}

#[actix_web::test]
async fn an_admin_of_the_hub_is_an_admin_here() {
    let _guard = TEST_MUTEX.lock().await;
    let h = harness().await;
    let app = map_app!(h);

    let response = sign_in!(&app, ADMIN);
    let session = cookie_of(&response, "session").unwrap();
    let body: Value = test::read_body_json(response).await;
    assert_eq!(body, json!({"name": "The Admin", "is_admin": true}));
    assert_eq!(
        status_with!(&app, "/api/admin/players", Some(&session)),
        200
    );
}

#[actix_web::test]
async fn someone_the_hub_does_not_know_stays_out() {
    let _guard = TEST_MUTEX.lock().await;
    let h = harness().await;
    let app = map_app!(h);

    let response = sign_in!(&app, STRANGER);
    assert_eq!(response.status(), 403);
    assert_eq!(cookie_of(&response, "session"), None);
    let body = test::read_body(response).await;
    assert!(String::from_utf8_lossy(&body).contains("Sign in to the hub once first"));
    assert_eq!(session_count(&h.pool).await, 0);
}

#[actix_web::test]
async fn nobody_signs_in_while_the_hub_cannot_say_who_is_a_member() {
    let _guard = TEST_MUTEX.lock().await;
    let h = harness().await;
    let app = map_app!(h);

    // A hub from before the endpoint, or a personal key: 404.
    h.outside.lock().unwrap().members_status = Some(404);
    assert_eq!(sign_in!(&app, ALICE).status(), 503);
    // A hub that is down.
    h.outside.lock().unwrap().members_status = Some(500);
    assert_eq!(sign_in!(&app, ALICE).status(), 503);
    assert_eq!(session_count(&h.pool).await, 0);
}

#[actix_web::test]
async fn a_sign_in_that_was_not_started_in_this_browser_is_refused() {
    let _guard = TEST_MUTEX.lock().await;
    let h = harness().await;
    let app = map_app!(h);

    for (label, cookie, state) in [
        ("another state", Some("abc"), Some("abd")),
        ("no cookie", None, Some("abc")),
        ("no state", Some("abc"), None),
    ] {
        let mut request = test::TestRequest::post()
            .uri("/api/auth/discord/callback")
            .set_json(json!({"code": format!("code-{ALICE}"), "state": state}));
        if let Some(cookie) = cookie {
            request = request.cookie(actix_web::cookie::Cookie::new(
                "discord_oauth_state",
                cookie,
            ));
        }
        let response = test::call_service(&app, request.to_request()).await;
        assert_eq!(response.status(), 400, "{label}");
    }
    assert_eq!(h.outside.lock().unwrap().member_requests, 0);
    assert_eq!(session_count(&h.pool).await, 0);
}

#[actix_web::test]
async fn signing_out_ends_the_session() {
    let _guard = TEST_MUTEX.lock().await;
    let h = harness().await;
    let app = map_app!(h);
    let session = cookie_of(&sign_in!(&app, ALICE), "session").unwrap();

    let request = test::TestRequest::post()
        .uri("/api/auth/logout")
        .cookie(actix_web::cookie::Cookie::new("session", session.clone()))
        .to_request();
    let response = test::call_service(&app, request).await;
    assert_eq!(response.status(), 200);
    assert_eq!(cookie_of(&response, "session").as_deref(), Some(""));
    assert_eq!(status_with!(&app, "/api/auth/me", Some(&session)), 401);

    // Without a session there is nothing to end, and that is fine.
    let request = test::TestRequest::post()
        .uri("/api/auth/logout")
        .to_request();
    assert_eq!(test::call_service(&app, request).await.status(), 200);
}

/// Makes every session look as if the hub was last asked about it long ago.
async fn age_sessions(pool: &Pool) {
    let client = pool.get().await.unwrap();
    client
        .execute(
            "UPDATE groupironman.sessions SET verified_at = NOW() - interval '1 hour'",
            &[],
        )
        .await
        .unwrap();
}

#[actix_web::test]
async fn sessions_follow_what_the_hub_says_later() {
    let _guard = TEST_MUTEX.lock().await;
    let h = harness().await;
    let app = map_app!(h);
    let alice = cookie_of(&sign_in!(&app, ALICE), "session").unwrap();
    let admin = cookie_of(&sign_in!(&app, ADMIN), "session").unwrap();

    // Asked about only a moment ago: nothing to do.
    let asked = hub::members::reverify_once(&h.pool, &h.hub.client)
        .await
        .unwrap();
    assert_eq!(asked, 0);

    // The hub can't be asked: the sessions stay as they are.
    age_sessions(&h.pool).await;
    h.outside.lock().unwrap().members_status = Some(500);
    hub::members::reverify_once(&h.pool, &h.hub.client)
        .await
        .unwrap();
    assert_eq!(session_count(&h.pool).await, 2);

    // Alice left the guild and the admin is no admin any more.
    {
        let mut outside = h.outside.lock().unwrap();
        outside.members_status = None;
        outside.members.remove(ALICE);
        outside.members.insert(ADMIN, (false, "Not The Admin"));
    }
    let asked = hub::members::reverify_once(&h.pool, &h.hub.client)
        .await
        .unwrap();
    assert_eq!(asked, 2);
    assert_eq!(status_with!(&app, "/api/group/features", Some(&alice)), 401);
    assert_eq!(status_with!(&app, "/api/admin/players", Some(&admin)), 403);
    let request = test::TestRequest::get()
        .uri("/api/auth/me")
        .cookie(actix_web::cookie::Cookie::new("session", admin))
        .to_request();
    let me: Value = test::call_and_read_body_json(&app, request).await;
    assert_eq!(me, json!({"name": "Not The Admin", "is_admin": false}));
}
