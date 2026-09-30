use std::collections::HashMap;
use std::sync::RwLock;
use std::time::{Duration, Instant};

/// In-memory per-token lockout map.
///
/// After a failed device-auth attempt the hashed token is blocked for
/// `lockout_duration`.  Subsequent requests carrying the same token are
/// rejected immediately with 429 (+ `Retry-After`) without touching the
/// database.  The map self-heals after a server restart: the first abusive
/// request will reach the DB, get rejected, and re-populate the entry.
pub struct TokenLockout {
    blocked: RwLock<HashMap<String, Instant>>,
    lockout_duration: Duration,
}

impl TokenLockout {
    pub fn new(lockout_duration: Duration) -> Self {
        Self {
            blocked: RwLock::new(HashMap::new()),
            lockout_duration,
        }
    }

    /// Returns the remaining lockout duration if the token is currently
    /// blocked, or `None` if it may proceed.
    pub fn check_blocked(&self, hashed_token: &str) -> Option<Duration> {
        let map = self
            .blocked
            .read()
            .expect("TokenLockout read lock poisoned");
        if let Some(&blocked_until) = map.get(hashed_token) {
            let now = Instant::now();
            if now < blocked_until {
                return Some(blocked_until - now);
            }
        }
        None
    }

    /// Block a token for the configured lockout duration and lazily prune
    /// any expired entries.
    pub fn block(&self, hashed_token: &str) {
        let mut map = self
            .blocked
            .write()
            .expect("TokenLockout write lock poisoned");
        map.insert(
            hashed_token.to_string(),
            Instant::now() + self.lockout_duration,
        );
        // Lazy cleanup – keeps memory bounded.
        let now = Instant::now();
        map.retain(|_, blocked_until| now < *blocked_until);
    }
}
