use serde::Deserialize;
use std::env;

#[derive(Deserialize, Clone)]
pub enum LogLevel {
    Info,
    Warn,
    Error,
}
impl LogLevel {
    pub fn to_string(&self) -> &'static str {
        match self {
            LogLevel::Info => "info",
            LogLevel::Warn => "warn",
            LogLevel::Error => "error",
        }
    }
}
#[derive(Deserialize, Clone)]
pub struct LoggerConfig {
    pub level: LogLevel,
}
/// The Discord application people sign in with. Discord only says who
/// someone is; whether they may use the map is the hub's to say.
#[derive(Deserialize, Clone)]
pub struct DiscordConfig {
    #[serde(default)]
    pub client_id: String,
    #[serde(default)]
    pub client_secret: String,
    /// The site's `/login/discord`, as registered in the Discord application.
    #[serde(default)]
    pub redirect_uri: String,
    /// Where Discord's API is. Only something else for a stand-in (the mock hub has one).
    #[serde(default = "default_discord_api_base")]
    pub api_base: String,
    /// The page a browser is sent to to sign in, when it isn't
    /// `{api_base}/oauth2/authorize`: a stand-in the browser reaches under
    /// another address than this server does.
    #[serde(default)]
    pub authorize_url: Option<String>,
}
impl Default for DiscordConfig {
    fn default() -> Self {
        DiscordConfig {
            client_id: String::new(),
            client_secret: String::new(),
            redirect_uri: String::new(),
            api_base: default_discord_api_base(),
            authorize_url: None,
        }
    }
}
impl DiscordConfig {
    pub(crate) fn is_configured(&self) -> bool {
        !self.client_id.is_empty()
            && !self.client_secret.is_empty()
            && !self.redirect_uri.is_empty()
    }

    /// Whether this is Discord itself and not a stand-in.
    pub fn is_discord(&self) -> bool {
        self.api_base == DISCORD_API_BASE
    }

    pub fn authorize_url(&self) -> String {
        self.authorize_url
            .clone()
            .unwrap_or_else(|| format!("{}/oauth2/authorize", self.api_base))
    }

    pub(crate) fn token_url(&self) -> String {
        format!("{}/oauth2/token", self.api_base)
    }

    pub(crate) fn user_url(&self) -> String {
        format!("{}/v10/users/@me", self.api_base)
    }
}
const DISCORD_API_BASE: &str = "https://discord.com/api";
fn default_discord_api_base() -> String {
    DISCORD_API_BASE.to_string()
}
#[derive(Deserialize, Clone)]
pub struct ServerConfig {
    /// Mark session cookies `Secure`. Disable only for plain-HTTP local development.
    #[serde(default = "default_true")]
    pub secure_cookies: bool,
}
impl Default for ServerConfig {
    fn default() -> Self {
        ServerConfig {
            secure_cookies: true,
        }
    }
}
fn default_true() -> bool {
    true
}
#[derive(Deserialize, Clone)]
pub struct HubConfig {
    /// Base URL of the hub, without `/api/v1`.
    #[serde(default)]
    pub base_url: String,
    #[serde(default)]
    pub api_key: String,
    #[serde(default = "default_poll_interval_secs")]
    pub poll_interval_secs: u64,
    #[serde(default = "default_full_refresh_secs")]
    pub full_refresh_secs: u64,
    #[serde(default = "default_events_poll_secs")]
    pub events_poll_secs: u64,
    /// Serve XP graphs, location trails and the events feed from the hub.
    #[serde(default = "default_true")]
    pub history_enabled: bool,
    /// Requests per minute this server allows itself. When unset it follows the
    /// key's rate limit reported by the hub's `/me` (80 % of it).
    #[serde(default)]
    pub request_budget_per_min: Option<u32>,
    #[serde(default = "default_timeout_secs")]
    pub timeout_secs: u64,
}
impl Default for HubConfig {
    fn default() -> Self {
        HubConfig {
            base_url: String::new(),
            api_key: String::new(),
            poll_interval_secs: default_poll_interval_secs(),
            full_refresh_secs: default_full_refresh_secs(),
            events_poll_secs: default_events_poll_secs(),
            history_enabled: true,
            request_budget_per_min: None,
            timeout_secs: default_timeout_secs(),
        }
    }
}
impl HubConfig {
    pub(crate) fn is_configured(&self) -> bool {
        !self.base_url.is_empty() && !self.api_key.is_empty()
    }
}
fn default_poll_interval_secs() -> u64 {
    5
}
fn default_full_refresh_secs() -> u64 {
    120
}
fn default_events_poll_secs() -> u64 {
    5
}
fn default_timeout_secs() -> u64 {
    10
}

#[derive(Deserialize, Clone)]
pub struct Config {
    #[serde(default)]
    pub pg: deadpool_postgres::Config,
    #[serde(default = "default_logger_config")]
    pub logger: LoggerConfig,
    #[serde(default)]
    pub discord: DiscordConfig,
    #[serde(default)]
    pub server: ServerConfig,
    #[serde(default)]
    pub hub: HubConfig,
}
fn default_logger_config() -> LoggerConfig {
    LoggerConfig {
        level: LogLevel::Info,
    }
}

impl Config {
    /// Normalises the hub URL and clamps intervals to sane values.
    fn validate(&mut self) {
        self.discord.api_base = self.discord.api_base.trim_end_matches('/').to_string();
        self.hub.base_url = self.hub.base_url.trim_end_matches('/').to_string();
        if let Some(stripped) = self.hub.base_url.strip_suffix("/api/v1") {
            self.hub.base_url = stripped.to_string();
        }
        self.hub.poll_interval_secs = self.hub.poll_interval_secs.max(2);
        self.hub.full_refresh_secs = self.hub.full_refresh_secs.max(30);
        self.hub.events_poll_secs = self.hub.events_poll_secs.max(5);
        self.hub.request_budget_per_min = self
            .hub
            .request_budget_per_min
            .map(|budget| budget.clamp(20, 10_000));
        self.hub.timeout_secs = self.hub.timeout_secs.clamp(2, 120);
    }

    /// Whether the hub-backed history endpoints (XP graphs, trails, events) are active.
    pub fn hub_history_enabled(&self) -> bool {
        self.hub.history_enabled
    }

    /// Player data only comes from osrs-data-hub, so the server can't run without it.
    pub fn require_hub(&self) -> Result<(), String> {
        if self.hub.is_configured() {
            Ok(())
        } else {
            Err("HUB_BASE_URL and HUB_API_KEY are required".to_string())
        }
    }

    /// Signing in with Discord is the only way in, so the server can't run without it.
    pub fn require_discord(&self) -> Result<(), String> {
        if self.discord.is_configured() {
            Ok(())
        } else {
            Err(
                "DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET and DISCORD_REDIRECT_URI are required"
                    .to_string(),
            )
        }
    }
}

const DEFAULT_POOL_MAX_SIZE: usize = 16;
const POOL_WAIT_TIMEOUT_SECS: u64 = 15;

fn env_string(name: &str) -> Option<String> {
    env::var(name)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn env_bool(name: &str) -> Option<bool> {
    env_string(name)
        .map(|value| matches!(value.to_lowercase().as_str(), "1" | "true" | "yes" | "on"))
}

impl Config {
    /// Loads `config.toml` (optional) and then applies environment variable overrides.
    pub fn from_env() -> Result<Self, Box<dyn std::error::Error>> {
        let _ = dotenvy::dotenv();

        let config_str = match std::fs::read_to_string("config.toml") {
            Ok(contents) => contents,
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => String::new(),
            Err(err) => return Err(err.into()),
        };
        let mut parsed: Config = basic_toml::from_str(&config_str)?;
        parsed.apply_env_overrides();
        parsed.validate();
        Ok(parsed)
    }

    fn apply_env_overrides(&mut self) {
        if let Some(user) = env_string("PG_USER") {
            self.pg.user = Some(user);
        }
        if let Ok(password) = env::var("PG_PASSWORD") {
            if !password.is_empty() {
                self.pg.password = Some(password);
            }
        }
        if let Some(host) = env_string("PG_HOST") {
            self.pg.host = Some(host);
        }
        if let Some(port) = env_string("PG_PORT").and_then(|port| port.parse().ok()) {
            self.pg.port = Some(port);
        }
        if let Some(dbname) = env_string("PG_DB") {
            self.pg.dbname = Some(dbname);
        }
        let pool_max_size = env_string("PG_POOL_MAX_SIZE").and_then(|size| size.parse().ok());
        let pool = self.pg.pool.get_or_insert_with(|| {
            deadpool_postgres::PoolConfig::new(pool_max_size.unwrap_or(DEFAULT_POOL_MAX_SIZE))
        });
        if let Some(max_size) = pool_max_size {
            pool.max_size = max_size;
        }
        // Fail requests instead of waiting forever when the pool is exhausted.
        if pool.timeouts.wait.is_none() {
            pool.timeouts.wait = Some(std::time::Duration::from_secs(POOL_WAIT_TIMEOUT_SECS));
        }

        if let Some(secure_cookies) = env_bool("COOKIE_SECURE") {
            self.server.secure_cookies = secure_cookies;
        }

        if let Some(base_url) = env_string("HUB_BASE_URL") {
            self.hub.base_url = base_url;
        }
        if let Some(api_key) = env_string("HUB_API_KEY") {
            self.hub.api_key = api_key;
        }
        let env_u64 = |name: &str| env_string(name).and_then(|value| value.parse::<u64>().ok());
        if let Some(value) = env_u64("HUB_POLL_INTERVAL_SECS") {
            self.hub.poll_interval_secs = value;
        }
        if let Some(value) = env_u64("HUB_FULL_REFRESH_SECS") {
            self.hub.full_refresh_secs = value;
        }
        if let Some(value) = env_u64("HUB_EVENTS_POLL_SECS") {
            self.hub.events_poll_secs = value;
        }
        if let Some(value) = env_u64("HUB_REQUEST_BUDGET") {
            self.hub.request_budget_per_min = Some(value as u32);
        }
        if let Some(value) = env_u64("HUB_TIMEOUT_SECS") {
            self.hub.timeout_secs = value;
        }
        if let Some(history_enabled) = env_bool("HUB_HISTORY_ENABLED") {
            self.hub.history_enabled = history_enabled;
        }

        if let Some(client_id) = env_string("DISCORD_CLIENT_ID") {
            self.discord.client_id = client_id;
        }
        if let Some(client_secret) = env_string("DISCORD_CLIENT_SECRET") {
            self.discord.client_secret = client_secret;
        }
        if let Some(redirect_uri) = env_string("DISCORD_REDIRECT_URI") {
            self.discord.redirect_uri = redirect_uri;
        }
        if let Some(api_base) = env_string("DISCORD_API_BASE") {
            self.discord.api_base = api_base;
        }
        if let Some(authorize_url) = env_string("DISCORD_AUTHORIZE_URL") {
            self.discord.authorize_url = Some(authorize_url);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parsed(toml: &str) -> Config {
        let mut config: Config = basic_toml::from_str(toml).unwrap();
        config.validate();
        config
    }

    #[test]
    fn discord_is_discord_unless_told_otherwise() {
        let discord = parsed("").discord;
        assert!(discord.is_discord());
        assert!(!discord.is_configured());
        assert_eq!(
            discord.authorize_url(),
            "https://discord.com/api/oauth2/authorize"
        );
        assert_eq!(discord.token_url(), "https://discord.com/api/oauth2/token");
        assert_eq!(discord.user_url(), "https://discord.com/api/v10/users/@me");
    }

    #[test]
    fn a_stand_in_for_discord_can_be_reached_under_two_addresses() {
        let discord = parsed(
            "[discord]\nclient_id = \"id\"\nclient_secret = \"secret\"\n\
             redirect_uri = \"http://localhost:4100/login/discord\"\n\
             api_base = \"http://mock:7070/discord/\"\n\
             authorize_url = \"http://localhost:7070/discord/oauth2/authorize\"",
        )
        .discord;
        assert!(discord.is_configured());
        assert!(!discord.is_discord());
        assert_eq!(discord.token_url(), "http://mock:7070/discord/oauth2/token");
        assert_eq!(
            discord.authorize_url(),
            "http://localhost:7070/discord/oauth2/authorize"
        );
    }
}
