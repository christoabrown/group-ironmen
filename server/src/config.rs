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
pub struct CaptchaConfig {
    pub enabled: bool,
    pub sitekey: String,
    #[serde(skip_serializing)]
    pub secret: String,
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
/// Where player data comes from.
#[derive(Deserialize, Serialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum DataSource {
    /// Players pair the RuneLite data exporter with this server.
    #[default]
    Direct,
    /// Players are imported from osrs-data-hub; direct pairing is disabled.
    Hub,
    /// Both; recent direct data wins over hub data for the same player.
    Both,
}
impl DataSource {
    pub fn uses_hub(self) -> bool {
        matches!(self, DataSource::Hub | DataSource::Both)
    }
    pub fn accepts_direct(self) -> bool {
        matches!(self, DataSource::Direct | DataSource::Both)
    }
    fn parse(value: &str) -> Option<Self> {
        match value.to_lowercase().as_str() {
            "direct" => Some(DataSource::Direct),
            "hub" => Some(DataSource::Hub),
            "both" => Some(DataSource::Both),
            _ => None,
        }
    }
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
    /// Requests per minute this server allows itself (the hub allows 120 per key by default).
    /// Requests per minute this server allows itself. When unset it follows the
    /// key's rate limit reported by the hub's `/me` (80 % of it).
    #[serde(default)]
    pub request_budget_per_min: Option<u32>,
    /// In `both` mode, hub data for a player is ignored for this long after direct data arrived.
    #[serde(default = "default_both_direct_grace_secs")]
    pub both_direct_grace_secs: u64,
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
            both_direct_grace_secs: default_both_direct_grace_secs(),
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
    15
}
fn default_both_direct_grace_secs() -> u64 {
    120
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
    #[serde(default = "default_captcha_config")]
    pub hcaptcha: CaptchaConfig,
    #[serde(default = "default_discord_config")]
    pub discord: DiscordConfig,
    #[serde(default)]
    pub server: ServerConfig,
    #[serde(default)]
    pub data_source: DataSource,
    #[serde(default)]
    pub hub: HubConfig,
}
fn default_logger_config() -> LoggerConfig {
    LoggerConfig {
        level: LogLevel::Info,
    }
}
fn default_captcha_config() -> CaptchaConfig {
    CaptchaConfig {
        enabled: false,
        sitekey: "".to_string(),
        secret: "".to_string(),
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
    /// Clamps values and falls back to `direct` when the hub is not usable.
    fn validate(&mut self) {
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

        if self.data_source.uses_hub() && !self.hub.is_configured() {
            // Runs before the logger is initialised.
            eprintln!(
                "DATA_SOURCE is {:?} but HUB_BASE_URL or HUB_API_KEY is missing; falling back to direct",
                self.data_source
            );
            self.data_source = DataSource::Direct;
        }
    }

    /// Whether the hub-backed history endpoints (XP graphs, trails, events) are active.
    pub fn hub_history_enabled(&self) -> bool {
        self.data_source.uses_hub() && self.hub.history_enabled
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

        if let Some(data_source) = env_string("DATA_SOURCE") {
            match DataSource::parse(&data_source) {
                Some(data_source) => self.data_source = data_source,
                None => eprintln!(
                    "Ignoring unknown DATA_SOURCE '{}' (expected direct, hub or both)",
                    data_source
                ),
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
        if let Some(value) = env_u64("HUB_BOTH_DIRECT_GRACE_SECS") {
            self.hub.both_direct_grace_secs = value;
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
