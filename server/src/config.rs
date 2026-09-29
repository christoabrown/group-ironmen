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
pub struct Config {
    #[serde(default)]
    pub pg: deadpool_postgres::Config,
    #[serde(default = "default_logger_config")]
    pub logger: LoggerConfig,
    #[serde(default = "default_captcha_config")]
    pub hcaptcha: CaptchaConfig,
    #[serde(default = "default_discord_config")]
    pub discord: DiscordConfig,
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
