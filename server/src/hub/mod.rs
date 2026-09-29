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
use serde::Serialize;
use std::collections::HashMap;
use std::sync::{Arc, Mutex, RwLock};
use std::time::{Duration, Instant};

/// Remembers when each player last sent data directly, so that in `both`
/// mode the (slower) hub copy does not overwrite fresher direct data.
#[derive(Clone, Default)]
pub struct DirectSeen(Arc<Mutex<HashMap<String, Instant>>>);

impl DirectSeen {
    pub fn record(&self, member_name: &str) {
        let mut seen = self.0.lock().expect("direct seen lock poisoned");
        if seen.len() > 10_000 {
            seen.retain(|_, at| at.elapsed() < Duration::from_secs(3600));
        }
        seen.insert(member_name.to_lowercase(), Instant::now());
    }

    pub fn seen_within(&self, member_name: &str, window: Duration) -> bool {
        self.0
            .lock()
            .expect("direct seen lock poisoned")
            .get(&member_name.to_lowercase())
            .is_some_and(|at| at.elapsed() < window)
    }
}

/// What the admin portal shows about the hub connection.
#[derive(Serialize, Clone, Default)]
pub struct HubStatus {
    pub data_source: String,
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
}

pub type SharedHubStatus = Arc<RwLock<HubStatus>>;

pub fn record_error(status: &SharedHubStatus, message: String) {
    if let Ok(mut status) = status.write() {
        status.last_error = Some(message);
        status.last_error_at = Some(Utc::now());
        status.consecutive_failures = status.consecutive_failures.saturating_add(1);
    }
}

/// Everything the hub endpoints need, registered as app data.
#[derive(Clone)]
pub struct HubContext {
    pub client: Option<Arc<client::HubClient>>,
    pub status: SharedHubStatus,
    pub cache: Arc<cache::TtlCache>,
    pub events: events::EventBuffer,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn direct_seen_is_case_insensitive() {
        let seen = DirectSeen::default();
        seen.record("Zezima");
        assert!(seen.seen_within("zezima", Duration::from_secs(60)));
        assert!(!seen.seen_within("other", Duration::from_secs(60)));
        assert!(!seen.seen_within("zezima", Duration::ZERO));
    }
}
