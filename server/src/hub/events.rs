//! Follows the hub's `/events` cursor feed into a small in-memory buffer that
//! the site's events feed reads from. One follower serves every viewer, so the
//! feed costs a fixed number of hub requests regardless of traffic.
use crate::hub::client::{HubClient, HubError, Priority};
use crate::hub::models::HubEvent;
use crate::hub::{record_error, SharedHubStatus};
use chrono::Utc;
use serde_json::Value;
use std::collections::VecDeque;
use std::sync::{Arc, RwLock};
use std::time::Duration;

const CAPACITY: usize = 1000;
const INITIAL_EVENTS: u32 = 200;
const PAGE_SIZE: u32 = 200;

/// An event with the buffer's own increasing sequence number, which the site
/// passes back as `after` to get only newer events.
#[derive(Clone, Debug)]
pub struct BufferedEvent {
    pub seq: u64,
    pub event: HubEvent,
}

#[derive(Default)]
struct Inner {
    events: VecDeque<BufferedEvent>,
    next_seq: u64,
}

#[derive(Clone, Default)]
pub struct EventBuffer(Arc<RwLock<Inner>>);

/// What `EventBuffer::query` returns events for.
#[derive(Default)]
pub struct EventFilter<'a> {
    pub types: &'a [String],
    /// Only this hub account.
    pub account_id: Option<&'a str>,
    /// Only events newer than this sequence number.
    pub after: Option<u64>,
    pub min_value: Option<i64>,
}

impl EventBuffer {
    /// Appends events (oldest first), skipping ids already buffered.
    pub fn extend(&self, events: Vec<HubEvent>) -> usize {
        let mut inner = self.0.write().expect("event buffer lock poisoned");
        for event in events {
            if inner
                .events
                .iter()
                .rev()
                .take(PAGE_SIZE as usize)
                .any(|e| e.event.id == event.id)
            {
                continue;
            }
            inner.next_seq += 1;
            let seq = inner.next_seq;
            inner.events.push_back(BufferedEvent { seq, event });
            while inner.events.len() > CAPACITY {
                inner.events.pop_front();
            }
        }
        inner.events.len()
    }

    /// Newest first.
    pub fn query(&self, filter: &EventFilter, limit: usize) -> Vec<BufferedEvent> {
        let inner = self.0.read().expect("event buffer lock poisoned");
        inner
            .events
            .iter()
            .rev()
            .take_while(|buffered| filter.after.is_none_or(|after| buffered.seq > after))
            .filter(|buffered| {
                let event = &buffered.event;
                (filter.types.is_empty() || filter.types.iter().any(|t| t == &event.event_type))
                    && filter.account_id.is_none_or(|id| event.account.id == id)
                    && filter
                        .min_value
                        .is_none_or(|min| event.value_gp.is_some_and(|value| value >= min))
            })
            .take(limit)
            .cloned()
            .collect()
    }

    /// The sequence number of the newest buffered event (0 when empty).
    pub fn latest_seq(&self) -> u64 {
        self.0.read().expect("event buffer lock poisoned").next_seq
    }
}

/// The parts of the plugin's event object the site shows: where a death or a
/// superior happened, and the most valuable items and the source of a drop.
pub fn event_details(event: &HubEvent) -> (Option<Value>, Option<Value>, Option<String>) {
    let Some(inner) = event.data.as_ref().and_then(|data| data.get("data")) else {
        return (None, None, None);
    };
    let location = inner
        .get("location")
        .filter(|location| location.get("x").is_some() && location.get("y").is_some())
        .map(|location| {
            serde_json::json!({
                "x": location.get("x"),
                "y": location.get("y"),
                "plane": location.get("plane").cloned().unwrap_or(Value::from(0)),
            })
        });
    let items = inner.get("items").and_then(Value::as_array).map(|items| {
        let mut items: Vec<&Value> = items.iter().collect();
        let value = |item: &Value| {
            let price = item.get("gePrice").and_then(Value::as_i64).unwrap_or(0);
            let quantity = item.get("quantity").and_then(Value::as_i64).unwrap_or(1);
            price.saturating_mul(quantity)
        };
        items.sort_by_key(|item| std::cmp::Reverse(value(item)));
        Value::from(
            items
                .into_iter()
                .take(3)
                .map(|item| {
                    serde_json::json!({
                        "id": item.get("id"),
                        "quantity": item.get("quantity"),
                    })
                })
                .collect::<Vec<_>>(),
        )
    });
    let source = inner
        .get("source")
        .and_then(|source| source.get("text").or(Some(source)))
        .and_then(Value::as_str)
        .map(str::to_owned);
    (location, items, source)
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

    fn event(id: &str, event_type: &str, account: &str) -> HubEvent {
        serde_json::from_value(serde_json::json!({
            "id": id,
            "type": event_type,
            "account": {"id": account, "name": account.to_uppercase()},
            "occurred_at": "2026-09-29T14:13:40.046Z",
            "value_gp": id.parse::<i64>().unwrap_or(0) * 1000,
            "line": format!("{} did {}", account, event_type),
        }))
        .unwrap()
    }

    fn ids(events: Vec<BufferedEvent>) -> Vec<String> {
        events.into_iter().map(|e| e.event.id).collect()
    }

    #[test]
    fn deduplicates_and_returns_newest_first() {
        let buffer = EventBuffer::default();
        buffer.extend(vec![event("1", "loot", "a"), event("2", "death", "b")]);
        buffer.extend(vec![event("2", "death", "b"), event("3", "level_up", "a")]);
        let all = buffer.query(&EventFilter::default(), 10);
        assert_eq!(ids(all.clone()), vec!["3", "2", "1"]);
        assert_eq!(all.iter().map(|e| e.seq).collect::<Vec<_>>(), vec![3, 2, 1]);
        assert_eq!(buffer.latest_seq(), 3);
    }

    #[test]
    fn filters_by_type_account_value_after_and_limit() {
        let buffer = EventBuffer::default();
        buffer.extend(vec![
            event("1", "loot", "a"),
            event("2", "loot", "b"),
            event("3", "death", "a"),
        ]);
        let types = ["loot".to_string()];
        let loot = EventFilter {
            types: &types,
            ..Default::default()
        };
        assert_eq!(buffer.query(&loot, 10).len(), 2);
        let account = EventFilter {
            account_id: Some("a"),
            ..Default::default()
        };
        assert_eq!(ids(buffer.query(&account, 10)), vec!["3", "1"]);
        let after = EventFilter {
            after: Some(1),
            ..Default::default()
        };
        assert_eq!(ids(buffer.query(&after, 10)), vec!["3", "2"]);
        let valuable = EventFilter {
            min_value: Some(2000),
            ..Default::default()
        };
        assert_eq!(ids(buffer.query(&valuable, 10)), vec!["3", "2"]);
        assert_eq!(ids(buffer.query(&EventFilter::default(), 1)), vec!["3"]);
    }

    #[test]
    fn keeps_at_most_capacity_events() {
        let buffer = EventBuffer::default();
        let events = (0..CAPACITY + 50)
            .map(|i| event(&i.to_string(), "loot", "a"))
            .collect();
        assert_eq!(buffer.extend(events), CAPACITY);
    }

    #[test]
    fn extracts_death_location_and_top_items() {
        let mut death = event("1", "death", "a");
        death.data = Some(serde_json::json!({"type": "death", "data": {
            "valueLost": 100, "location": {"x": 3200, "y": 3201, "plane": 1}
        }}));
        let (location, items, _) = event_details(&death);
        assert_eq!(location.unwrap()["plane"], 1);
        assert!(items.is_none());

        let mut loot = event("2", "loot", "a");
        loot.data = Some(serde_json::json!({"type": "loot", "data": {
            "source": {"text": "Kree'arra"},
            "items": [
                {"id": 1, "quantity": 10, "gePrice": 5},
                {"id": 2, "quantity": 1, "gePrice": 1000},
                {"id": 3, "quantity": 2, "gePrice": 200},
                {"id": 4, "quantity": 1, "gePrice": 1}
            ]
        }}));
        let (location, items, source) = event_details(&loot);
        assert!(location.is_none());
        let items = items.unwrap();
        let top: Vec<_> = items
            .as_array()
            .unwrap()
            .iter()
            .map(|i| i["id"].as_i64().unwrap())
            .collect();
        assert_eq!(top, vec![2, 3, 1]);
        assert_eq!(source.as_deref(), Some("Kree'arra"));
    }
}
