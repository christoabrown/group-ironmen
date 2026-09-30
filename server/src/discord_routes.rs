use crate::auth_routes::{session_cookie, SESSION_DURATION_HOURS};
use crate::config::Config;
use crate::db;
use crate::error::ApiError;
use crate::models::{
    DiscordCallbackRequest, DiscordEnabledResponse, DiscordGuild, DiscordTokenResponse,
    DiscordUser, LoginResponse,
};
use actix_web::{cookie, get, post, web, Error, HttpRequest, HttpResponse};
use chrono::{Duration, Utc};
use deadpool_postgres::Pool;
use serde::de::DeserializeOwned;
use tokio::task;

const DISCORD_API_BASE: &str = "https://discord.com/api/v10";
const DISCORD_OAUTH_AUTHORIZE: &str = "https://discord.com/api/oauth2/authorize";
const DISCORD_OAUTH_TOKEN: &str = "https://discord.com/api/oauth2/token";
const MAX_USERNAME_LEN: usize = 32;
const MAX_USERNAME_CREATION_ATTEMPTS: usize = 10;
// Reserve space for suffix like "_1234"
const MAX_USERNAME_PREFIX_LEN: usize = MAX_USERNAME_LEN - 5;

const OAUTH_STATE_COOKIE: &str = "discord_oauth_state";
const OAUTH_STATE_MAX_AGE_MINUTES: i64 = 10;

fn oauth_state_cookie(
    value: &str,
    max_age: cookie::time::Duration,
    config: &Config,
) -> cookie::Cookie<'static> {
    cookie::Cookie::build(OAUTH_STATE_COOKIE, value.to_owned())
        .path("/")
        .http_only(true)
        .secure(config.server.secure_cookies)
        .same_site(cookie::SameSite::Lax)
        .max_age(max_age)
        .finish()
}

fn generate_oauth_state() -> String {
    use rand::RngCore;
    let mut bytes = [0u8; 32];
    rand::rng().fill_bytes(&mut bytes);
    data_encoding::HEXLOWER.encode(&bytes)
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

#[get("/discord/enabled")]
pub async fn discord_enabled(config: web::Data<Config>) -> Result<HttpResponse, Error> {
    if !config.discord.enabled {
        return Ok(HttpResponse::Ok().json(DiscordEnabledResponse {
            enabled: false,
            auth_url: None,
        }));
    }

    // The state is bound to this browser through an HttpOnly cookie and checked
    // on callback, so a login started elsewhere (CSRF) is rejected.
    let state = generate_oauth_state();
    let auth_url = format!(
        "{}?client_id={}&redirect_uri={}&response_type=code&scope=identify%20guilds&state={}",
        DISCORD_OAUTH_AUTHORIZE,
        config.discord.client_id,
        urlencoding::encode(&config.discord.redirect_uri),
        state,
    );

    Ok(HttpResponse::Ok()
        .cookie(oauth_state_cookie(
            &state,
            cookie::time::Duration::minutes(OAUTH_STATE_MAX_AGE_MINUTES),
            &config,
        ))
        .json(DiscordEnabledResponse {
            enabled: true,
            auth_url: Some(auth_url),
        }))
}

#[post("/discord/callback")]
pub async fn discord_callback(
    req: HttpRequest,
    body: web::Json<DiscordCallbackRequest>,
    db_pool: web::Data<Pool>,
    config: web::Data<Config>,
) -> Result<HttpResponse, Error> {
    if !config.discord.enabled {
        return Ok(HttpResponse::BadRequest().body("Discord authentication is not enabled"));
    }

    let expected_state = req.cookie(OAUTH_STATE_COOKIE).map(|c| c.value().to_owned());
    let state_valid = match (&expected_state, &body.state) {
        (Some(expected), Some(received)) => {
            constant_time_eq(expected.as_bytes(), received.as_bytes())
        }
        _ => false,
    };
    let clear_state = oauth_state_cookie("", cookie::time::Duration::ZERO, &config);
    if !state_valid {
        return Ok(HttpResponse::BadRequest().cookie(clear_state).body(
            "Discord login expired or was not started from this browser. Please try again.",
        ));
    }

    let mut response = discord_login(&body.code, &db_pool, &config).await?;
    response.add_cookie(&clear_state)?;
    Ok(response)
}

async fn discord_login(code: &str, db_pool: &Pool, config: &Config) -> Result<HttpResponse, Error> {
    // Exchange the authorization code for an access token
    let token_data = match exchange_code(config, code).await? {
        Some(token_data) => token_data,
        None => {
            return Ok(HttpResponse::BadRequest().body("Failed to authenticate with Discord"));
        }
    };
    let authorization = format!("{} {}", token_data.token_type, token_data.access_token);

    // Fetch Discord user info
    let discord_user: DiscordUser = discord_get("/users/@me", &authorization).await?;

    let db_client = db_pool.get().await.map_err(ApiError::PoolError)?;

    // Check if Discord user already has a linked account
    if let Some((user_id, username, role, enabled)) =
        db::get_user_by_discord_id(&db_client, &discord_user.id).await?
    {
        if !enabled {
            return Ok(HttpResponse::Unauthorized().body("Account is disabled"));
        }

        // Check if existing user is still in an allowed Discord server
        // Without a configured server list there is no membership requirement
        // for accounts that are already linked.
        let is_in_allowed_server = if config.discord.autoreg_servers.is_empty() {
            true
        } else {
            let guilds: Vec<DiscordGuild> =
                discord_get("/users/@me/guilds", &authorization).await?;
            let user_guild_ids: Vec<&str> = guilds.iter().map(|g| g.id.as_str()).collect();
            config
                .discord
                .autoreg_servers
                .iter()
                .any(|allowed| user_guild_ids.contains(&allowed.as_str()))
        };

        if !is_in_allowed_server {
            // User is no longer in an allowed Discord server
            // Revoke their plugin tokens and deny login
            let _ = db::revoke_user_devices(&db_client, user_id).await;
            let _ = db::revoke_user_pairing_codes(&db_client, user_id).await;

            db::write_audit_log(
                &db_client,
                Some(user_id),
                "discord_login_failed_not_in_server",
                Some(user_id),
                Some(&format!(
                    "User '{}' attempted to login but is no longer in an allowed Discord server (discord_id: {})",
                    username, discord_user.id
                )),
            )
            .await?;

            return Ok(HttpResponse::Forbidden()
                .body("You are no longer a member of the required Discord server."));
        }

        // Existing user - create session and log in
        let _ = db::cleanup_expired_sessions(&db_client).await;
        let session_id = uuid::Uuid::new_v4().hyphenated().to_string();
        let expires_at = Utc::now() + Duration::hours(SESSION_DURATION_HOURS);
        db::create_session(&db_client, &session_id, user_id, &expires_at).await?;

        db::write_audit_log(
            &db_client,
            Some(user_id),
            "discord_login",
            None,
            Some(&format!(
                "User '{}' logged in via Discord (discord_id: {})",
                username, discord_user.id
            )),
        )
        .await?;

        let cookie = session_cookie(
            &session_id,
            cookie::time::Duration::hours(SESSION_DURATION_HOURS),
            config,
        );

        return Ok(HttpResponse::Ok().cookie(cookie).json(LoginResponse {
            ok: true,
            session_token: session_id,
            role,
            username,
        }));
    }

    // No existing link - check if auto-registration is allowed
    if !config.discord.auto_registration {
        return Ok(HttpResponse::Forbidden()
            .body("Auto-registration is disabled. Contact an admin to create your account."));
    }

    // Fetch user's guilds to check membership
    let guilds: Vec<DiscordGuild> = discord_get("/users/@me/guilds", &authorization).await?;

    // Check if user is in any allowed server
    let user_guild_ids: Vec<&str> = guilds.iter().map(|g| g.id.as_str()).collect();
    let is_in_allowed_server = config
        .discord
        .autoreg_servers
        .iter()
        .any(|allowed| user_guild_ids.contains(&allowed.as_str()));

    if !is_in_allowed_server {
        return Ok(HttpResponse::Forbidden()
            .body("You are not a member of any allowed Discord server for auto-registration."));
    }

    // Auto-register: create a new user account
    let display_name = discord_user
        .global_name
        .as_deref()
        .unwrap_or(&discord_user.username);
    // Sanitize username: only keep alphanumeric, underscore, hyphen; truncate to 32 chars
    let sanitized: String = display_name
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '_' || *c == '-')
        .take(MAX_USERNAME_LEN)
        .collect();
    let base_username = if sanitized.is_empty() {
        format!(
            "discord_{}",
            &discord_user.id[..8.min(discord_user.id.len())]
        )
    } else {
        sanitized
    };

    // Try to create user, appending suffix if username is taken
    let mut username = base_username.clone();
    let mut user_id: Option<i64> = None;
    for attempt in 0..MAX_USERNAME_CREATION_ATTEMPTS {
        match db::create_user_no_password(&db_client, &username, "member").await {
            Ok(id) => {
                user_id = Some(id);
                break;
            }
            Err(_) if attempt < MAX_USERNAME_CREATION_ATTEMPTS - 1 => {
                let suffix = &discord_user.id[discord_user.id.len().saturating_sub(4)..];
                username = format!(
                    "{}_{}",
                    &base_username[..base_username.len().min(MAX_USERNAME_PREFIX_LEN)],
                    suffix
                );
            }
            Err(e) => return Err(e.into()),
        }
    }

    let user_id = user_id
        .ok_or_else(|| ApiError::BadRequest("Could not create unique username".to_string()))?;

    // Link Discord account
    db::create_discord_user_link(
        &db_client,
        &discord_user.id,
        user_id,
        &discord_user.username,
    )
    .await?;

    // Write audit log
    let matched_servers: Vec<&str> = config
        .discord
        .autoreg_servers
        .iter()
        .filter(|s| user_guild_ids.contains(&s.as_str()))
        .map(|s| s.as_str())
        .collect();

    db::write_audit_log(
        &db_client,
        Some(user_id),
        "discord_auto_register",
        Some(user_id),
        Some(&format!(
            "User '{}' auto-registered via Discord (discord_id: {}, discord_user: {}, matched_servers: {:?})",
            username, discord_user.id, discord_user.username, matched_servers
        )),
    )
    .await?;

    // Create session for the new user
    let session_id = uuid::Uuid::new_v4().hyphenated().to_string();
    let expires_at = Utc::now() + Duration::hours(SESSION_DURATION_HOURS);
    db::create_session(&db_client, &session_id, user_id, &expires_at).await?;

    let cookie = session_cookie(
        &session_id,
        cookie::time::Duration::hours(SESSION_DURATION_HOURS),
        config,
    );

    Ok(HttpResponse::Ok().cookie(cookie).json(LoginResponse {
        ok: true,
        session_token: session_id,
        role: "member".to_string(),
        username,
    }))
}

/// Exchanges an OAuth authorization code for an access token.
/// Returns `Ok(None)` when Discord rejects the code.
async fn exchange_code(
    config: &Config,
    code: &str,
) -> Result<Option<DiscordTokenResponse>, ApiError> {
    let client_id = config.discord.client_id.clone();
    let client_secret = config.discord.client_secret.clone();
    let redirect_uri = config.discord.redirect_uri.clone();
    let code = code.to_owned();

    task::spawn_blocking(move || {
        let response = ureq::post(DISCORD_OAUTH_TOKEN).send_form([
            ("client_id", client_id.as_str()),
            ("client_secret", client_secret.as_str()),
            ("grant_type", "authorization_code"),
            ("code", code.as_str()),
            ("redirect_uri", redirect_uri.as_str()),
        ]);
        match response {
            Ok(mut response) => response
                .body_mut()
                .read_json::<DiscordTokenResponse>()
                .map(Some)
                .map_err(ApiError::UreqError),
            Err(ureq::Error::StatusCode(status)) => {
                log::error!("Discord token exchange failed: {}", status);
                Ok(None)
            }
            Err(err) => Err(ApiError::UreqError(err)),
        }
    })
    .await
    .map_err(|err| ApiError::BadRequest(format!("Discord request task failed: {}", err)))?
}

async fn discord_get<T: DeserializeOwned + Send + 'static>(
    path: &'static str,
    authorization: &str,
) -> Result<T, ApiError> {
    let authorization = authorization.to_owned();
    task::spawn_blocking(move || {
        ureq::get(format!("{}{}", DISCORD_API_BASE, path))
            .header("Authorization", authorization.as_str())
            .call()
            .map_err(ApiError::UreqError)?
            .body_mut()
            .read_json::<T>()
            .map_err(ApiError::UreqError)
    })
    .await
    .map_err(|err| ApiError::BadRequest(format!("Discord request task failed: {}", err)))?
}
