use serde::{Deserialize, Serialize};
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
#[derive(Serialize, Deserialize, Clone)]
pub struct DiscordConfig {
    pub enabled: bool,
    #[serde(skip_serializing)]
    pub client_id: String,
    #[serde(skip_serializing)]
    pub client_secret: String,
    pub redirect_uri: String,
    pub auto_registration: bool,
    #[serde(default)]
    pub autoreg_servers: Vec<String>,
}
#[derive(Deserialize, Clone)]
pub struct ServerConfig {
    /// Mark session cookies `Secure`. Disable only for plain-HTTP local development.
    #[serde(default = "default_true")]
    pub secure_cookies: bool,
    /// When set, creating the first admin (`POST /api/auth/setup`) requires this
    /// token, so a freshly deployed public site can't be claimed by a stranger.
    #[serde(default)]
    pub setup_token: Option<String>,
}
impl Default for ServerConfig {
    fn default() -> Self {
        ServerConfig {
            secure_cookies: true,
            setup_token: None,
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
    pub fn is_configured(&self) -> bool {
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
    #[serde(default = "default_discord_config")]
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
fn default_discord_config() -> DiscordConfig {
    DiscordConfig {
        enabled: false,
        client_id: "".to_string(),
        client_secret: "".to_string(),
        redirect_uri: "".to_string(),
        auto_registration: false,
        autoreg_servers: vec![],
    }
}

impl Config {
    /// Normalises the hub URL and clamps intervals to sane values.
    fn validate(&mut self) {
        // An empty token in config.toml means no token, as an unset SETUP_TOKEN does.
        self.server.setup_token = self
            .server
            .setup_token
            .take()
            .map(|token| token.trim().to_string())
            .filter(|token| !token.is_empty());
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
        if let Some(setup_token) = env_string("SETUP_TOKEN") {
            self.server.setup_token = Some(setup_token);
        }

        if let Some(data_source) = env_string("DATA_SOURCE") {
            if !data_source.eq_ignore_ascii_case("hub") {
                // Runs before the logger is initialised.
                eprintln!(
                    "Ignoring DATA_SOURCE '{}': player data only comes from osrs-data-hub now",
                    data_source
                );
            }
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
            self.discord.enabled = true;
            self.discord.client_id = client_id;

            if let Some(client_secret) = env_string("DISCORD_CLIENT_SECRET") {
                self.discord.client_secret = client_secret;
            }
            if let Some(redirect_uri) = env_string("DISCORD_REDIRECT_URI") {
                self.discord.redirect_uri = redirect_uri;
            }
            if let Some(auto_registration) = env_bool("DISCORD_AUTO_REGISTRATION") {
                self.discord.auto_registration = auto_registration;
            }
            if let Some(autoreg_servers) = env_string("DISCORD_AUTOREG_SERVERS") {
                self.discord.autoreg_servers = autoreg_servers
                    .split(',')
                    .map(|server| server.trim().to_string())
                    .filter(|server| !server.is_empty())
                    .collect();
            }
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
    fn a_blank_setup_token_means_no_token() {
        assert_eq!(parsed("").server.setup_token, None);
        let blank = parsed("[server]\nsetup_token = \"  \"");
        assert_eq!(blank.server.setup_token, None);
        let set = parsed("[server]\nsetup_token = \" abc \"");
        assert_eq!(set.server.setup_token.as_deref(), Some("abc"));
    }
}
