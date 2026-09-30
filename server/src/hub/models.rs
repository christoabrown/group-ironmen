//! The subset of the osrs-data-hub `/api/v1` wire format this server reads.
//!
//! Every field the hub may leave out (a category the key cannot read) or send as
//! `null` (readable but never sent by the plugin) is an `Option`, and unknown
//! fields are ignored because v1 only changes additively.
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Deserialize, Debug)]
pub struct Envelope<T> {
    pub data: T,
    #[serde(default)]
    pub meta: Meta,
}

#[derive(Deserialize, Debug, Default)]
pub struct Meta {
    #[serde(default)]
    pub last_modified: Option<String>,
    #[serde(default)]
    pub next_cursor: Option<String>,
}

#[derive(Deserialize, Debug)]
pub struct ErrorEnvelope {
    pub error: ErrorBody,
}

#[derive(Deserialize, Debug)]
pub struct ErrorBody {
    pub code: String,
    #[serde(default)]
    pub message: String,
}

#[derive(Deserialize, Serialize, Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Meter {
    pub current: i32,
    pub max: i32,
}

#[derive(Deserialize, Debug, Clone, PartialEq)]
pub struct HubLocation {
    pub x: i32,
    pub y: i32,
    pub plane: i32,
    #[serde(default)]
    pub stale: bool,
}

#[derive(Deserialize, Debug, Clone)]
pub struct HubSkill {
    pub skill: String,
    #[serde(default)]
    pub xp: Option<i64>,
}

#[derive(Deserialize, Debug, Clone)]
pub struct HubSkills {
    #[serde(default)]
    pub skills: Vec<HubSkill>,
}

#[derive(Deserialize, Debug, Clone)]
pub struct HubItem {
    pub id: i32,
    pub quantity: i64,
    #[serde(default)]
    pub equipment_slot: Option<String>,
    /// Inventory slot 0–27, sent by plugin 1.5.1 and later (hub D-86).
    #[serde(default)]
    pub inventory_slot: Option<usize>,
}

#[derive(Deserialize, Debug, Clone)]
pub struct HubItems {
    #[serde(default)]
    pub items: Vec<HubItem>,
}

/// The account owner, sent by hubs that support integration keys.
#[derive(Deserialize, Debug, Clone)]
pub struct HubOwner {
    #[serde(default)]
    pub discord_id: Option<String>,
}

/// One account of `GET /snapshot`.
#[derive(Deserialize, Debug, Clone)]
pub struct HubAccount {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub account_hash: Option<String>,
    #[serde(default)]
    pub owner: Option<HubOwner>,
    #[serde(default)]
    pub online: Option<bool>,
    #[serde(default)]
    pub world: Option<i32>,
    #[serde(default)]
    pub special_world: Option<bool>,
    #[serde(default)]
    pub last_seen: Option<DateTime<Utc>>,
    #[serde(default)]
    pub hp: Option<Meter>,
    #[serde(default)]
    pub prayer: Option<Meter>,
    #[serde(default)]
    pub location: Option<HubLocation>,
    #[serde(default)]
    pub skills: Option<HubSkills>,
    #[serde(default)]
    pub equipment: Option<HubItems>,
    #[serde(default)]
    pub inventory: Option<HubItems>,
}

/// `GET /me`.
#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct HubMe {
    pub key: HubMeKey,
    #[serde(default)]
    pub visible_accounts: Option<i64>,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct HubMeKey {
    pub name: String,
    #[serde(default)]
    pub kind: Option<String>,
    #[serde(default)]
    pub categories: Vec<String>,
    /// Requests per minute the hub allows this key (hub D-88).
    #[serde(default)]
    pub rate_limit_per_minute: Option<u32>,
    #[serde(default)]
    pub expires_at: Option<String>,
}

impl HubMeKey {
    /// Service (integration) keys belong to the guild, not to a person (hub D-88).
    pub fn is_service_key(&self) -> bool {
        self.kind.as_deref() == Some("service")
    }
}

#[derive(Deserialize, Debug, Clone)]
pub struct HubAccountRef {
    pub id: String,
    pub name: String,
}

/// `GET /xp?accounts=`.
#[derive(Deserialize, Debug)]
pub struct HubXpMulti {
    pub accounts: Vec<HubXpSeries>,
}

#[derive(Deserialize, Debug)]
pub struct HubXpSeries {
    pub account: HubAccountRef,
    pub series: Vec<HubXpLine>,
}

#[derive(Deserialize, Debug)]
pub struct HubXpLine {
    pub skill: String,
    pub points: Vec<(DateTime<Utc>, i64)>,
}

/// `GET /accounts/{id}/locations`.
#[derive(Deserialize, Debug)]
pub struct HubLocations {
    pub points: Vec<HubLocationPoint>,
}

#[derive(Deserialize, Debug)]
pub struct HubLocationPoint {
    pub at: DateTime<Utc>,
    pub x: i32,
    pub y: i32,
    pub plane: i32,
}

/// `GET /leaderboards/gains`.
#[derive(Deserialize, Debug)]
pub struct HubLeaderboards {
    pub period: String,
    pub leaderboards: Vec<HubLeaderboard>,
}

#[derive(Deserialize, Debug)]
pub struct HubLeaderboard {
    pub skill: String,
    pub entries: Vec<HubLeaderboardEntry>,
}

#[derive(Deserialize, Debug)]
pub struct HubLeaderboardEntry {
    pub rank: i32,
    pub account: HubAccountRef,
    pub gain: i64,
}

/// One event of `GET /events`.
#[derive(Deserialize, Debug, Clone)]
pub struct HubEvent {
    pub id: String,
    #[serde(rename = "type")]
    pub event_type: String,
    pub account: HubAccountRef,
    pub occurred_at: DateTime<Utc>,
    #[serde(default)]
    pub value_gp: Option<i64>,
    #[serde(default)]
    pub item_id: Option<i32>,
    #[serde(default)]
    pub skill: Option<String>,
    #[serde(default)]
    pub level: Option<i32>,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub line: Option<String>,
}
