//! Signing in. Discord says who someone is (OAuth, scope `identify`); the hub
//! says whether that Discord account is a member of the guild and an admin
//! (see `hub::members`). The map keeps no accounts of its own.
use crate::auth_routes::start_session;
use crate::config::Config;
use crate::error::ApiError;
use crate::http;
use crate::hub::client::HubError;
use crate::hub::{members, HubContext};
use crate::models::{DiscordCallbackRequest, DiscordTokenResponse, DiscordUser, Session};
use actix_web::{cookie, get, post, web, Error, HttpRequest, HttpResponse};
use deadpool_postgres::Pool;
use subtle::ConstantTimeEq;

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

/// Where to send the browser to sign in: `{auth_url}`. Asked for when the
/// button is pressed, so the state it comes with is fresh.
#[get("/discord/start")]
pub async fn discord_start(config: web::Data<Config>) -> Result<HttpResponse, Error> {
    // The state is bound to this browser through an HttpOnly cookie and checked
    // on callback, so a login started elsewhere (CSRF) is rejected.
    let state = generate_oauth_state();
    let discord = &config.discord;
    let auth_url = format!(
        "{}?client_id={}&redirect_uri={}&response_type=code&scope=identify&state={}",
        discord.authorize_url(),
        urlencoding::encode(&discord.client_id),
        urlencoding::encode(&discord.redirect_uri),
        state,
    );

    Ok(HttpResponse::Ok()
        .cookie(oauth_state_cookie(
            &state,
            cookie::time::Duration::minutes(OAUTH_STATE_MAX_AGE_MINUTES),
            &config,
        ))
        .json(serde_json::json!({ "auth_url": auth_url })))
}

/// Finishes signing in with the code Discord sent the browser back with.
#[post("/discord/callback")]
pub async fn discord_callback(
    req: HttpRequest,
    body: web::Json<DiscordCallbackRequest>,
    db_pool: web::Data<Pool>,
    config: web::Data<Config>,
    hub: web::Data<HubContext>,
) -> Result<HttpResponse, Error> {
    let expected_state = req.cookie(OAUTH_STATE_COOKIE).map(|c| c.value().to_owned());
    let state_valid = match (&expected_state, &body.state) {
        (Some(expected), Some(received)) => {
            bool::from(expected.as_bytes().ct_eq(received.as_bytes()))
        }
        _ => false,
    };
    let clear_state = oauth_state_cookie("", cookie::time::Duration::ZERO, &config);
    if !state_valid {
        return Ok(HttpResponse::BadRequest().cookie(clear_state).body(
            "Discord login expired or was not started from this browser. Please try again.",
        ));
    }

    let mut response = discord_login(&body.code, &db_pool, &config, &hub).await?;
    response.add_cookie(&clear_state)?;
    Ok(response)
}

async fn discord_login(
    code: &str,
    db_pool: &Pool,
    config: &Config,
    hub: &HubContext,
) -> Result<HttpResponse, Error> {
    let Some(token) = exchange_code(config, code).await? else {
        return Ok(HttpResponse::BadRequest().body("Failed to authenticate with Discord"));
    };
    let authorization = format!("{} {}", token.token_type, token.access_token);
    let discord_user = discord_user(config, &authorization).await?;

    let member = match members::lookup(&hub.client, &discord_user.id).await {
        Ok(member) => member,
        Err(HubError::NotFound) => {
            log::error!(
                "The hub has no /members for this key: it needs a hub with D-100 and a service \
                 key, so nobody can sign in"
            );
            return Ok(HttpResponse::ServiceUnavailable()
                .body("The hub this map reads from can't say who is a member yet."));
        }
        Err(err) => {
            log::warn!("The hub didn't say whether someone is a member: {}", err);
            return Ok(HttpResponse::ServiceUnavailable()
                .insert_header(("Retry-After", "10"))
                .body("The hub can't be reached right now. Try again in a moment."));
        }
    };
    if !member.member {
        log::info!(
            "Discord account {} ({}) signed in but is not a member on the hub",
            discord_user.id,
            discord_user.username
        );
        return Ok(HttpResponse::Forbidden().body(
            "The hub doesn't know this Discord account as a member of the guild. \
             Sign in to the hub once first, then try again here.",
        ));
    }

    let session = Session {
        name: member
            .name
            .or(discord_user.global_name)
            .unwrap_or(discord_user.username),
        discord_id: discord_user.id,
        is_admin: member.is_admin,
    };
    log::info!(
        "'{}' signed in (Discord account {}{})",
        session.name,
        session.discord_id,
        if session.is_admin { ", admin" } else { "" }
    );
    let db_client = db_pool.get().await.map_err(ApiError::PoolError)?;
    Ok(start_session(&db_client, config, session).await?)
}

/// Exchanges an OAuth authorization code for an access token.
/// Returns `Ok(None)` when Discord rejects the code.
async fn exchange_code(
    config: &Config,
    code: &str,
) -> Result<Option<DiscordTokenResponse>, ApiError> {
    let discord = config.discord.clone();
    let code = code.to_owned();

    http::blocking(move |agent| {
        let response = agent.post(discord.token_url()).send_form([
            ("client_id", discord.client_id.as_str()),
            ("client_secret", discord.client_secret.as_str()),
            ("grant_type", "authorization_code"),
            ("code", code.as_str()),
            ("redirect_uri", discord.redirect_uri.as_str()),
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
}

/// Who the access token belongs to.
async fn discord_user(config: &Config, authorization: &str) -> Result<DiscordUser, ApiError> {
    let url = config.discord.user_url();
    let authorization = authorization.to_owned();
    http::blocking(move |agent| {
        let mut response = agent
            .get(url)
            .header("Authorization", authorization.as_str())
            .call()?;
        Ok(response.body_mut().read_json::<DiscordUser>()?)
    })
    .await
}
