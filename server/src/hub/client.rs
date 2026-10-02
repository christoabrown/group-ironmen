//! A small blocking HTTP client for the osrs-data-hub `/api/v1`, run on the
//! blocking thread pool, with a self-imposed request budget so the snapshot
//! sync always has room within the hub's per-key rate limit.
use crate::config::HubConfig;
use crate::hub::models::{Envelope, ErrorEnvelope, Meta};
use serde::de::DeserializeOwned;
use std::collections::VecDeque;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

const RESPONSE_BODY_LIMIT: u64 = 64 * 1024 * 1024;
const BUDGET_WINDOW: Duration = Duration::from_secs(60);
/// Budget until the hub's `/me` says what the key may use (a user key allows 120).
pub(crate) const DEFAULT_BUDGET_PER_MIN: usize = 100;

/// Who is asking. Background sync always goes first; interactive history
/// requests give up early so they never starve the sync.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Priority {
    Sync,
    Interactive,
}

#[derive(Debug)]
pub enum HubError {
    /// The key is missing, revoked, expired or its creator left the guild (401).
    Unauthorized,
    /// The account or resource is not visible to the key (404).
    NotFound,
    /// The hub rejected the request's parameters (400), with its message.
    Invalid(String),
    /// Rate limited by the hub or by our own budget; retry after the duration.
    RateLimited(Duration),
    /// Anything else: network errors, 5xx, unexpected bodies.
    Other(String),
}

impl std::fmt::Display for HubError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            HubError::Unauthorized => write!(f, "the hub rejected the API key (401)"),
            HubError::NotFound => write!(f, "not found on the hub (404)"),
            HubError::Invalid(message) => write!(f, "rejected by the hub (400): {}", message),
            HubError::RateLimited(after) => {
                write!(f, "rate limited, retry after {}s", after.as_secs().max(1))
            }
            HubError::Other(message) => write!(f, "{}", message),
        }
    }
}

pub(crate) type HubResult<T> = Result<T, HubError>;

/// The result of a conditional GET.
pub(crate) enum Fetched<T> {
    NotModified,
    Ok {
        data: T,
        meta: Meta,
        etag: Option<String>,
    },
}

struct Budget {
    sent: VecDeque<Instant>,
    blocked_until: Option<Instant>,
}

pub struct HubClient {
    agent: ureq::Agent,
    base_url: String,
    authorization: String,
    budget_per_min: AtomicUsize,
    budget: Mutex<Budget>,
}

/// Requests per minute kept free for the sync loop: a quarter of the budget,
/// at least 10, but never more than half, so interactive requests always get
/// some share even of a tiny budget.
fn interactive_reserve(budget_per_min: usize) -> usize {
    (budget_per_min / 4).max(10).min(budget_per_min / 2)
}

impl HubClient {
    pub fn new(config: &HubConfig) -> Arc<Self> {
        let agent = ureq::Agent::config_builder()
            .timeout_global(Some(Duration::from_secs(config.timeout_secs)))
            .http_status_as_error(false)
            .user_agent(crate::http::USER_AGENT)
            .build()
            .new_agent();
        let budget_per_min = config
            .request_budget_per_min
            .map(|budget| budget as usize)
            .unwrap_or(DEFAULT_BUDGET_PER_MIN);
        Arc::new(HubClient {
            agent,
            base_url: format!("{}/api/v1", config.base_url),
            authorization: format!("Bearer {}", config.api_key),
            budget_per_min: AtomicUsize::new(budget_per_min),
            budget: Mutex::new(Budget {
                sent: VecDeque::new(),
                blocked_until: None,
            }),
        })
    }

    /// Requests per minute this client allows itself.
    pub fn budget_per_min(&self) -> usize {
        self.budget_per_min.load(Ordering::Relaxed)
    }

    pub fn set_budget_per_min(&self, budget: usize) {
        self.budget_per_min.store(budget.max(1), Ordering::Relaxed);
    }

    /// Reserves a request slot, or says how long to wait.
    fn acquire(&self, priority: Priority) -> HubResult<()> {
        let mut budget = self.budget.lock().expect("hub budget lock poisoned");
        let now = Instant::now();
        if let Some(until) = budget.blocked_until {
            if until > now {
                return Err(HubError::RateLimited(until - now));
            }
            budget.blocked_until = None;
        }
        while budget
            .sent
            .front()
            .is_some_and(|sent| now.duration_since(*sent) >= BUDGET_WINDOW)
        {
            budget.sent.pop_front();
        }
        let budget_per_min = self.budget_per_min();
        let limit = match priority {
            Priority::Sync => budget_per_min,
            Priority::Interactive => budget_per_min - interactive_reserve(budget_per_min),
        };
        if budget.sent.len() >= limit {
            let wait = budget.sent.front().map_or(BUDGET_WINDOW, |oldest| {
                BUDGET_WINDOW.saturating_sub(now.duration_since(*oldest))
            });
            return Err(HubError::RateLimited(wait));
        }
        budget.sent.push_back(now);
        Ok(())
    }

    fn block_for(&self, duration: Duration) {
        let mut budget = self.budget.lock().expect("hub budget lock poisoned");
        let until = Instant::now() + duration;
        if budget.blocked_until.is_none_or(|current| current < until) {
            budget.blocked_until = Some(until);
        }
    }

    /// GETs `path` (relative to `/api/v1`) with the given query parameters.
    pub(crate) async fn get<T: DeserializeOwned + Send + 'static>(
        self: &Arc<Self>,
        path: &str,
        query: &[(&str, String)],
        if_none_match: Option<String>,
        priority: Priority,
    ) -> HubResult<Fetched<T>> {
        self.acquire(priority)?;
        let mut url = format!("{}{}", self.base_url, path);
        for (index, (key, value)) in query.iter().enumerate() {
            url.push(if index == 0 { '?' } else { '&' });
            url.push_str(key);
            url.push('=');
            url.push_str(&urlencoding::encode(value));
        }
        let client = Arc::clone(self);
        tokio::task::spawn_blocking(move || client.get_blocking(&url, if_none_match))
            .await
            .map_err(|err| HubError::Other(format!("hub request task failed: {}", err)))?
    }

    /// Like [`HubClient::get`] without conditional requests.
    pub(crate) async fn get_data<T: DeserializeOwned + Send + 'static>(
        self: &Arc<Self>,
        path: &str,
        query: &[(&str, String)],
        priority: Priority,
    ) -> HubResult<(T, Meta)> {
        match self.get(path, query, None, priority).await? {
            Fetched::Ok { data, meta, .. } => Ok((data, meta)),
            Fetched::NotModified => Err(HubError::Other(format!(
                "unexpected 304 from the hub for {}",
                path
            ))),
        }
    }

    fn get_blocking<T: DeserializeOwned>(
        &self,
        url: &str,
        if_none_match: Option<String>,
    ) -> HubResult<Fetched<T>> {
        let mut request = self
            .agent
            .get(url)
            .header("Authorization", &self.authorization)
            .header("Accept", "application/json");
        if let Some(etag) = &if_none_match {
            request = request.header("If-None-Match", etag);
        }
        let mut response = request
            .call()
            .map_err(|err| HubError::Other(format!("hub request failed: {}", err)))?;

        let status = response.status().as_u16();
        let header = |name: &str| {
            response
                .headers()
                .get(name)
                .and_then(|value| value.to_str().ok())
                .map(str::to_owned)
        };
        let etag = header("etag");
        let retry_after = header("retry-after")
            .and_then(|value| value.trim().parse::<u64>().ok())
            .map(Duration::from_secs);

        match status {
            200 => {
                let body = response
                    .body_mut()
                    .with_config()
                    .limit(RESPONSE_BODY_LIMIT)
                    .read_to_string()
                    .map_err(|err| HubError::Other(format!("reading hub response: {}", err)))?;
                let envelope: Envelope<T> = serde_json::from_str(&body)
                    .map_err(|err| HubError::Other(format!("unexpected hub response: {}", err)))?;
                Ok(Fetched::Ok {
                    data: envelope.data,
                    meta: envelope.meta,
                    etag,
                })
            }
            304 => Ok(Fetched::NotModified),
            400 => {
                let body = response
                    .body_mut()
                    .with_config()
                    .limit(64 * 1024)
                    .read_to_string()
                    .unwrap_or_default();
                let message = serde_json::from_str::<ErrorEnvelope>(&body)
                    .map(|err| err.error.message)
                    .unwrap_or(body);
                Err(HubError::Invalid(message))
            }
            401 => Err(HubError::Unauthorized),
            404 => Err(HubError::NotFound),
            429 | 503 => {
                let after = retry_after.unwrap_or(Duration::from_secs(5));
                self.block_for(after);
                Err(HubError::RateLimited(after))
            }
            _ => {
                let body = response
                    .body_mut()
                    .with_config()
                    .limit(64 * 1024)
                    .read_to_string()
                    .unwrap_or_default();
                let message = serde_json::from_str::<ErrorEnvelope>(&body)
                    .map(|err| format!("{}: {}", err.error.code, err.error.message))
                    .unwrap_or(body);
                Err(HubError::Other(format!(
                    "hub returned {}: {}",
                    status, message
                )))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn client(budget: u32) -> Arc<HubClient> {
        HubClient::new(&HubConfig {
            base_url: "http://127.0.0.1:9".to_string(),
            api_key: "ohub_test".to_string(),
            request_budget_per_min: Some(budget),
            ..HubConfig::default()
        })
    }

    #[test]
    fn a_tiny_budget_still_allows_interactive_requests() {
        // A personal key the hub limits to 12 a minute gives a budget of 9.
        let client = client(20);
        client.set_budget_per_min(9);
        for _ in 0..5 {
            client.acquire(Priority::Interactive).unwrap();
        }
        assert!(matches!(
            client.acquire(Priority::Interactive),
            Err(HubError::RateLimited(_))
        ));
        client.acquire(Priority::Sync).unwrap();
        client.set_budget_per_min(1);
        assert!(matches!(
            client.acquire(Priority::Interactive),
            Err(HubError::RateLimited(_))
        ));
    }

    #[test]
    fn interactive_requests_leave_room_for_sync() {
        let client = client(20);
        // 20 per minute with a reserve of 10 for the sync loop.
        for _ in 0..10 {
            client.acquire(Priority::Interactive).unwrap();
        }
        assert!(matches!(
            client.acquire(Priority::Interactive),
            Err(HubError::RateLimited(_))
        ));
        for _ in 0..10 {
            client.acquire(Priority::Sync).unwrap();
        }
        assert!(matches!(
            client.acquire(Priority::Sync),
            Err(HubError::RateLimited(_))
        ));
    }

    #[test]
    fn retry_after_blocks_every_priority() {
        let client = client(100);
        client.block_for(Duration::from_secs(30));
        assert!(matches!(
            client.acquire(Priority::Sync),
            Err(HubError::RateLimited(after)) if after > Duration::from_secs(25)
        ));
    }
}
