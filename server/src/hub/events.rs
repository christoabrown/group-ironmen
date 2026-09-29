//! Follows the hub's `/events` cursor feed into a small in-memory buffer that
//! the site's events feed reads from. One follower serves every viewer, so the
//! feed costs a fixed number of hub requests regardless of traffic.
use crate::hub::client::{HubClient, HubError, Priority};
use crate::hub::models::HubEvent;
use crate::hub::{record_error, SharedHubStatus};
use chrono::Utc;
use std::collections::VecDeque;
use std::sync::{Arc, RwLock};
use std::time::Duration;

const CAPACITY: usize = 500;
const INITIAL_EVENTS: u32 = 200;
const PAGE_SIZE: u32 = 200;

#[derive(Clone, Default)]
pub struct EventBuffer(Arc<RwLock<VecDeque<HubEvent>>>);

impl EventBuffer {
    /// Appends events (oldest first), skipping ids already buffered.
    pub fn extend(&self, events: Vec<HubEvent>) -> usize {
        let mut buffer = self.0.write().expect("event buffer lock poisoned");
        for event in events {
            if buffer
                .iter()
                .rev()
                .take(PAGE_SIZE as usize)
                .any(|e| e.id == event.id)
            {
                continue;
            }
            buffer.push_back(event);
            while buffer.len() > CAPACITY {
                buffer.pop_front();
            }
        }
        buffer.len()
    }

    /// Newest first, filtered by type and account name.
    pub fn query(&self, types: &[String], member: Option<&str>, limit: usize) -> Vec<HubEvent> {
        let buffer = self.0.read().expect("event buffer lock poisoned");
        buffer
            .iter()
            .rev()
            .filter(|event| types.is_empty() || types.iter().any(|t| t == &event.event_type))
            .filter(|event| member.is_none_or(|name| event.account.name.eq_ignore_ascii_case(name)))
            .take(limit)
            .cloned()
            .collect()
    }
}

pub fn start(
    client: Arc<HubClient>,
    buffer: EventBuffer,
    interval: Duration,
    status: SharedHubStatus,
) {
    tokio::spawn(async move {
        let mut cursor: Option<String> = None;
        loop {
            let mut query = vec![(
                "limit",
                if cursor.is_some() {
                    PAGE_SIZE
                } else {
                    INITIAL_EVENTS
                }
                .to_string(),
            )];
            if let Some(cursor) = &cursor {
                query.push(("cursor", cursor.clone()));
            }
            let wait = match client
                .get_data::<Vec<HubEvent>>("/events", &query, Priority::Sync)
                .await
            {
                Ok((events, meta)) => {
                    let full_page = events.len() >= PAGE_SIZE as usize;
                    let buffered = buffer.extend(events);
                    if let Some(next) = meta.next_cursor {
                        cursor = Some(next);
                    }
                    if let Ok(mut status) = status.write() {
                        status.events_buffered = buffered;
                        status.events_last_poll = Some(Utc::now());
                    }
                    // Catch up quickly after a burst, otherwise wait for the next poll.
                    if full_page {
                        Duration::from_secs(1)
                    } else {
                        interval
                    }
                }
                Err(HubError::RateLimited(after)) => after.max(interval),
                Err(HubError::Unauthorized) => Duration::from_secs(300),
                Err(err) => {
                    log::warn!("Hub events poll failed: {}", err);
                    record_error(&status, format!("events: {}", err));
                    interval * 4
                }
            };
            tokio::time::sleep(wait).await;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn event(id: &str, event_type: &str, name: &str) -> HubEvent {
        serde_json::from_value(serde_json::json!({
            "id": id,
            "type": event_type,
            "account": {"id": "a1", "name": name},
            "occurred_at": "2026-09-29T14:13:40.046Z",
            "line": format!("{} did {}", name, event_type),
        }))
        .unwrap()
    }

    #[test]
    fn deduplicates_and_returns_newest_first() {
        let buffer = EventBuffer::default();
        buffer.extend(vec![
            event("1", "loot", "Alice"),
            event("2", "death", "Bob"),
        ]);
        buffer.extend(vec![
            event("2", "death", "Bob"),
            event("3", "level_up", "Alice"),
        ]);
        let ids: Vec<_> = buffer
            .query(&[], None, 10)
            .into_iter()
            .map(|e| e.id)
            .collect();
        assert_eq!(ids, vec!["3", "2", "1"]);
    }

    #[test]
    fn filters_by_type_member_and_limit() {
        let buffer = EventBuffer::default();
        buffer.extend(vec![
            event("1", "loot", "Alice"),
            event("2", "loot", "Bob"),
            event("3", "death", "alice"),
        ]);
        assert_eq!(buffer.query(&["loot".to_string()], None, 10).len(), 2);
        assert_eq!(buffer.query(&[], Some("ALICE"), 10).len(), 2);
        assert_eq!(buffer.query(&[], None, 1)[0].id, "3");
    }

    #[test]
    fn keeps_at_most_capacity_events() {
        let buffer = EventBuffer::default();
        let events = (0..CAPACITY + 50)
            .map(|i| event(&i.to_string(), "loot", "Alice"))
            .collect();
        assert_eq!(buffer.extend(events), CAPACITY);
    }
}
