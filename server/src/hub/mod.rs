//! Integration with osrs-data-hub: a background sync that mirrors the hub's
//! `/api/v1/snapshot` into the members table, and session-authenticated proxy
//! endpoints that serve the hub's history (XP, gains, trails, events) to the
//! site without exposing the API key.
pub mod cache;
pub mod client;
pub mod convert;
pub mod events;
pub mod models;
pub mod proxy;
pub mod routes;
pub mod sync;

use chrono::{DateTime, Utc};
use client::{HubClient, HubError, Priority};
use models::HubMe;
use serde::Serialize;
use std::collections::HashSet;
use std::sync::{Arc, RwLock};
use std::time::Duration;

/// Accounts per bulk history request (`/xp?accounts=`): the hub allows 10 for
/// a personal key and 50 for a service key (hub D-92).
pub const USER_KEY_BULK_ACCOUNTS: usize = 10;
pub const SERVICE_KEY_BULK_ACCOUNTS: usize = 50;
/// Share of the key's hub rate limit this server uses when no budget is configured.
const BUDGET_SHARE_OF_HUB_LIMIT: f64 = 0.8;

/// What the admin portal shows about the hub connection.
#[derive(Serialize, Clone, Default)]
pub struct HubStatus {
    pub history_enabled: bool,
    pub base_url: String,
    pub last_success: Option<DateTime<Utc>>,
    pub last_full_sync: Option<DateTime<Utc>>,
    pub accounts_visible: usize,
    pub accounts_online: usize,
    pub members_orphaned: i64,
    pub last_error: Option<String>,
    pub last_error_at: Option<DateTime<Utc>>,
    pub consecutive_failures: u32,
    pub events_buffered: usize,
    pub events_last_poll: Option<DateTime<Utc>>,
    /// `service` or `user`, from the hub's `/me` (unknown until it answered).
    pub key_kind: Option<String>,
    pub key_rate_limit_per_minute: Option<u32>,
    pub request_budget_per_min: usize,
    pub bulk_accounts: usize,
}

pub type SharedHubStatus = Arc<RwLock<HubStatus>>;

pub fn record_error(status: &SharedHubStatus, message: String) {
    if let Ok(mut status) = status.write() {
        status.last_error = Some(message);
        status.last_error_at = Some(Utc::now());
        status.consecutive_failures = status.consecutive_failures.saturating_add(1);
    }
}

/// What the API key may do, learned from the hub's `/me`.
#[derive(Debug)]
pub struct KeyCapabilities {
    pub bulk_accounts: usize,
    /// Skill names the hub rejected as unknown; left out of later XP requests.
    pub unknown_skills: HashSet<String>,
}

impl Default for KeyCapabilities {
    fn default() -> Self {
        KeyCapabilities {
            bulk_accounts: USER_KEY_BULK_ACCOUNTS,
            unknown_skills: HashSet::new(),
        }
    }
}

pub type SharedKeyCapabilities = Arc<RwLock<KeyCapabilities>>;

/// Everything the hub endpoints need, registered as app data.
#[derive(Clone)]
pub struct HubContext {
    pub client: Arc<client::HubClient>,
    pub status: SharedHubStatus,
    pub cache: Arc<cache::TtlCache>,
    pub events: events::EventBuffer,
    pub capabilities: SharedKeyCapabilities,
}

/// The request budget to use for a key the hub allows `hub_limit` requests per minute.
pub fn request_budget(configured: Option<u32>, hub_limit: Option<u32>) -> usize {
    match (configured, hub_limit) {
        (Some(configured), Some(limit)) => configured.min(limit) as usize,
        (Some(configured), None) => configured as usize,
        (None, Some(limit)) => ((limit as f64 * BUDGET_SHARE_OF_HUB_LIMIT) as usize).max(1),
        (None, None) => client::DEFAULT_BUDGET_PER_MIN,
    }
}

/// Applies what `/me` says about the key: its kind decides the bulk request
/// size, its rate limit the request budget.
pub fn apply_key_info(
    me: &HubMe,
    configured_budget: Option<u32>,
    client: &HubClient,
    capabilities: &SharedKeyCapabilities,
    status: &SharedHubStatus,
) {
    let bulk_accounts = if me.key.is_service_key() {
        SERVICE_KEY_BULK_ACCOUNTS
    } else {
        USER_KEY_BULK_ACCOUNTS
    };
    let budget = request_budget(configured_budget, me.key.rate_limit_per_minute);
    client.set_budget_per_min(budget);
    if let Ok(mut capabilities) = capabilities.write() {
        capabilities.bulk_accounts = bulk_accounts;
    }
    if let Ok(mut status) = status.write() {
        status.key_kind = me.key.kind.clone();
        status.key_rate_limit_per_minute = me.key.rate_limit_per_minute;
        status.request_budget_per_min = budget;
        status.bulk_accounts = bulk_accounts;
    }
    if me.key.is_service_key() {
        log::info!(
            "Hub key '{}' is a service key: {} requests/min (using {}), {} accounts per bulk request",
            me.key.name,
            me.key
                .rate_limit_per_minute
                .map_or("?".to_string(), |limit| limit.to_string()),
            budget,
            bulk_accounts
        );
    } else {
        log::warn!(
            "Hub key '{}' is a personal key; it stops working when its creator leaves the guild. \
             Ask a hub admin for a service key (Admin -> Integrations).",
            me.key.name
        );
    }
}

/// Asks the hub's `/me` about the key once at start-up, retrying until it answers.
pub fn start_key_discovery(
    client: Arc<HubClient>,
    configured_budget: Option<u32>,
    capabilities: SharedKeyCapabilities,
    status: SharedHubStatus,
) {
    tokio::spawn(async move {
        loop {
            match client.get_data::<HubMe>("/me", &[], Priority::Sync).await {
                Ok((me, _)) => {
                    apply_key_info(&me, configured_budget, &client, &capabilities, &status);
                    return;
                }
                Err(err) => {
                    let wait = match err {
                        HubError::RateLimited(after) => after,
                        _ => Duration::from_secs(60),
                    };
                    log::warn!("Could not read the hub key's details from /me: {}", err);
                    tokio::time::sleep(wait).await;
                }
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn request_budget_follows_the_hub_limit() {
        assert_eq!(request_budget(None, None), client::DEFAULT_BUDGET_PER_MIN);
        assert_eq!(request_budget(None, Some(600)), 480);
        assert_eq!(request_budget(None, Some(120)), 96);
        assert_eq!(request_budget(Some(1000), Some(600)), 600);
        assert_eq!(request_budget(Some(50), Some(600)), 50);
        assert_eq!(request_budget(Some(50), None), 50);
    }

    #[test]
    fn service_keys_get_larger_bulk_requests() {
        let client = HubClient::new(&crate::config::HubConfig::default());
        let capabilities = SharedKeyCapabilities::default();
        let status = SharedHubStatus::default();
        let me: HubMe = serde_json::from_value(serde_json::json!({
            "key": {"id": "k", "kind": "service", "name": "Guild live map", "prefix": "p",
                    "categories": ["activity"], "account_scope": "all_visible",
                    "rate_limit_per_minute": 600, "expires_at": null},
            "user": null, "visible_accounts": 14
        }))
        .unwrap();
        apply_key_info(&me, None, &client, &capabilities, &status);
        assert_eq!(capabilities.read().unwrap().bulk_accounts, 50);
        assert_eq!(client.budget_per_min(), 480);
        assert_eq!(status.read().unwrap().key_kind.as_deref(), Some("service"));

        let me: HubMe = serde_json::from_value(serde_json::json!({
            "key": {"id": "k", "kind": "user", "name": "Mine", "prefix": "p", "categories": [],
                    "account_scope": "all_visible", "rate_limit_per_minute": 120, "expires_at": null},
            "user": {"name": "Owner"}, "visible_accounts": 2
        }))
        .unwrap();
        apply_key_info(&me, None, &client, &capabilities, &status);
        assert_eq!(capabilities.read().unwrap().bulk_accounts, 10);
        assert_eq!(client.budget_per_min(), 96);
    }
}
