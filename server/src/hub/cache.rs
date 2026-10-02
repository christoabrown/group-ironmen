//! A small TTL cache for hub history responses. Concurrent requests for the same
//! key share one upstream call, and when the hub is rate limited or down a
//! stale entry is served instead of an error.
use crate::hub::client::HubError;
use serde_json::Value;
use std::collections::HashMap;
use std::future::Future;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

const MAX_ENTRIES: usize = 2000;
/// How long an expired entry may still be served when the hub is unavailable.
const MAX_STALE: Duration = Duration::from_secs(3600);

#[derive(Default)]
pub struct TtlCache {
    entries: Mutex<HashMap<String, (Instant, Arc<Value>)>>,
    in_flight: Mutex<HashMap<String, Arc<tokio::sync::Mutex<()>>>>,
}

impl TtlCache {
    pub fn new() -> Self {
        Self::default()
    }

    /// The entry and how long ago it was stored, when younger than `max_age`.
    fn lookup(&self, key: &str, max_age: Duration) -> Option<(Arc<Value>, Duration)> {
        let entries = self.entries.lock().expect("hub cache lock poisoned");
        entries
            .get(key)
            .map(|(stored_at, value)| (Arc::clone(value), stored_at.elapsed()))
            .filter(|(_, age)| *age < max_age)
    }

    fn store(&self, key: &str, value: Arc<Value>) {
        let mut entries = self.entries.lock().expect("hub cache lock poisoned");
        if entries.len() >= MAX_ENTRIES {
            entries.retain(|_, (stored_at, _)| stored_at.elapsed() < MAX_STALE);
            if entries.len() >= MAX_ENTRIES {
                entries.clear();
            }
        }
        entries.insert(key.to_owned(), (Instant::now(), value));
    }

    pub(crate) async fn get_or_fetch<F, Fut>(
        &self,
        key: &str,
        ttl: Duration,
        fetch: F,
    ) -> Result<Arc<Value>, HubError>
    where
        F: FnOnce() -> Fut,
        Fut: Future<Output = Result<Value, HubError>>,
    {
        self.get_or_fetch_dated(key, ttl, fetch)
            .await
            .map(|(value, _)| value)
    }

    /// Like [`TtlCache::get_or_fetch`], with how long ago the value came from the hub.
    pub(crate) async fn get_or_fetch_dated<F, Fut>(
        &self,
        key: &str,
        ttl: Duration,
        fetch: F,
    ) -> Result<(Arc<Value>, Duration), HubError>
    where
        F: FnOnce() -> Fut,
        Fut: Future<Output = Result<Value, HubError>>,
    {
        if let Some(found) = self.lookup(key, ttl) {
            return Ok(found);
        }

        let lock = {
            let mut in_flight = self.in_flight.lock().expect("hub cache lock poisoned");
            Arc::clone(in_flight.entry(key.to_owned()).or_default())
        };
        let _guard = lock.lock().await;

        // Another request may have filled the entry while we waited.
        if let Some(found) = self.lookup(key, ttl) {
            return Ok(found);
        }

        let result = fetch().await;
        {
            let mut in_flight = self.in_flight.lock().expect("hub cache lock poisoned");
            if Arc::strong_count(&lock) <= 2 {
                in_flight.remove(key);
            }
        }
        match result {
            Ok(value) => {
                let value = Arc::new(value);
                self.store(key, Arc::clone(&value));
                Ok((value, Duration::ZERO))
            }
            Err(err @ (HubError::RateLimited(_) | HubError::Other(_))) => {
                self.lookup(key, MAX_STALE).ok_or(err)
            }
            Err(err) => Err(err),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[tokio::test]
    async fn concurrent_requests_share_one_fetch() {
        let cache = Arc::new(TtlCache::new());
        let calls = Arc::new(AtomicUsize::new(0));
        let mut handles = Vec::new();
        for _ in 0..20 {
            let cache = Arc::clone(&cache);
            let calls = Arc::clone(&calls);
            handles.push(tokio::spawn(async move {
                cache
                    .get_or_fetch("xp:day", Duration::from_secs(60), || async {
                        calls.fetch_add(1, Ordering::SeqCst);
                        tokio::time::sleep(Duration::from_millis(20)).await;
                        Ok(serde_json::json!({"ok": true}))
                    })
                    .await
            }));
        }
        for handle in handles {
            assert!(handle.await.unwrap().is_ok());
        }
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn serves_stale_value_when_rate_limited() {
        let cache = TtlCache::new();
        cache
            .get_or_fetch("gains", Duration::from_secs(60), || async {
                Ok(serde_json::json!(1))
            })
            .await
            .unwrap();
        let value = cache
            .get_or_fetch("gains", Duration::ZERO, || async {
                Err(HubError::RateLimited(Duration::from_secs(5)))
            })
            .await
            .unwrap();
        assert_eq!(*value, serde_json::json!(1));
    }

    #[tokio::test]
    async fn a_stale_entry_reports_its_age() {
        let cache = TtlCache::new();
        let (_, age) = cache
            .get_or_fetch_dated("trail", Duration::from_secs(60), || async {
                Ok(serde_json::json!(1))
            })
            .await
            .unwrap();
        assert!(age < Duration::from_millis(40));
        tokio::time::sleep(Duration::from_millis(60)).await;
        let (value, age) = cache
            .get_or_fetch_dated("trail", Duration::ZERO, || async {
                Err(HubError::Other("down".to_string()))
            })
            .await
            .unwrap();
        assert_eq!(*value, serde_json::json!(1));
        assert!(age >= Duration::from_millis(60));
    }

    #[tokio::test]
    async fn not_found_is_not_masked() {
        let cache = TtlCache::new();
        let result = cache
            .get_or_fetch("missing", Duration::from_secs(60), || async {
                Err(HubError::NotFound)
            })
            .await;
        assert!(matches!(result, Err(HubError::NotFound)));
    }
}
