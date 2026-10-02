//! The map's API: every route under `/api`, and who may use it. `main.rs`
//! and the integration tests mount it from here, so they serve the same.
use crate::auth_middleware::SessionMiddlewareFactory;
use crate::{admin_routes, auth_routes, authed, health, hub, unauthed};
use actix_web::web;

/// The poll every open page makes every couple of seconds; `main.rs` keeps it
/// out of the request log.
pub const MEMBERS_PATH: &str = "/api/members";
/// What Kubernetes probes.
pub const HEALTH_PATH: &str = "/api/health";

/// Mounts `/api`. Actix hands a request to the first scope whose prefix
/// matches and never falls through to the next, so what needs a session comes
/// last, as a nested scope without a prefix of its own.
pub fn configure(cfg: &mut web::ServiceConfig) {
    // For the hub's admins (the handlers ask for `AdminAuthenticated`).
    let admin = web::scope("/admin")
        .wrap(SessionMiddlewareFactory)
        .service(admin_routes::list_players)
        .service(admin_routes::delete_player)
        .service(admin_routes::set_player_hidden)
        .service(hub::routes::get_hub_status)
        .service(hub::routes::test_hub_connection);

    // For everyone who is signed in.
    let signed_in = web::scope("")
        .wrap(SessionMiddlewareFactory)
        .service(authed::get_members)
        .service(authed::get_skill_history)
        .service(hub::routes::get_features)
        .service(hub::leaderboards::get_gains)
        .service(hub::trails::get_trails)
        .service(hub::events::get_events)
        .service(hub::leaderboards::get_loot_leaderboard)
        .service(hub::profile::get_player_gains)
        .service(hub::profile::get_player_sessions)
        .service(hub::profile::get_player_wealth)
        .service(hub::profile::get_player_equipment_history)
        .service(hub::profile::get_player_events)
        .service(hub::profile::get_player_trail_events);

    cfg.service(
        web::scope("/api")
            // For anyone.
            .service(health::health)
            .service(unauthed::get_ge_prices)
            .configure(auth_routes::configure)
            .service(admin)
            .service(signed_in),
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use actix_web::{test, App};

    #[actix_web::test]
    async fn every_part_of_the_api_is_reached_and_only_the_open_part_without_a_session() {
        let app = test::init_service(App::new().configure(configure)).await;
        let status = |path: &'static str| {
            let request = test::TestRequest::get().uri(path).to_request();
            let app = &app;
            async move { test::call_service(app, request).await.status().as_u16() }
        };

        assert_eq!(status("/api/ge-prices").await, 200);
        // Rejected by the middleware, not a 404: the nested scopes are reached.
        for path in [
            "/api/auth/me",
            "/api/members?from_time=2026-01-01T00:00:00Z",
            "/api/skill-history?period=day",
            "/api/features",
            "/api/hub/events",
            "/api/hub/players/Alice/trail-events",
            "/api/admin/players",
            "/api/admin/hub/status",
        ] {
            assert_eq!(status(path).await, 401, "{path}");
        }
        // And what isn't there needs a session to find that out.
        assert_eq!(status("/api/nothing-here").await, 401);
    }
}
