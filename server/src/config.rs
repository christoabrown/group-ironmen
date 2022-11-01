use config::{ConfigError, File};
use serde::{Deserialize, Serialize};

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
#[derive(Deserialize, Clone)]
pub struct Config {
    pub pg: deadpool_postgres::Config,
    #[serde(default = "default_logger_config")]
    pub logger: LoggerConfig,
    #[serde(default = "default_captcha_config")]
    pub hcaptcha: CaptchaConfig,
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
impl Config {
    pub fn from_env() -> Result<Self, ConfigError> {
        let cfg = ::config::Config::builder()
            .add_source(File::with_name("config"))
            .build()?;
        cfg.try_deserialize()
    }
}
