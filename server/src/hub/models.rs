//! The subset of the osrs-data-hub `/api/v1` wire format this server reads.
//!
//! Every field the hub may leave out (a category the key cannot read) or send as
//! `null` (readable but never sent by the plugin) is an `Option`, and unknown
//! fields are ignored because v1 only changes additively.
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Deserialize, Debug)]
pub(crate) struct Envelope<T> {
    pub data: T,
    #[serde(default)]
    pub meta: Meta,
}

#[derive(Deserialize, Debug, Default)]
pub(crate) struct Meta {
    #[serde(default)]
    pub last_modified: Option<String>,
    #[serde(default)]
    pub next_cursor: Option<String>,
}

#[derive(Deserialize, Debug)]
pub(crate) struct ErrorEnvelope {
    pub error: ErrorBody,
}

#[derive(Deserialize, Debug)]
pub(crate) struct ErrorBody {
    pub code: String,
    #[serde(default)]
    pub message: String,
}

#[derive(Deserialize, Serialize, Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub(crate) struct Meter {
    pub current: i32,
    pub max: i32,
}

#[derive(Deserialize, Debug, Clone, PartialEq)]
pub(crate) struct HubLocation {
    pub x: i32,
    pub y: i32,
    pub plane: i32,
    #[serde(default)]
    pub stale: bool,
    #[serde(default)]
    pub is_on_boat: Option<bool>,
}

#[derive(Deserialize, Debug, Clone)]
pub(crate) struct HubSkill {
    pub skill: String,
    #[serde(default)]
    pub xp: Option<i64>,
}

#[derive(Deserialize, Debug, Clone)]
pub(crate) struct HubSkills {
    #[serde(default)]
    pub total_level: Option<i64>,
    #[serde(default)]
    pub overall_xp: Option<i64>,
    #[serde(default)]
    pub skills: Vec<HubSkill>,
}

#[derive(Deserialize, Debug, Clone)]
pub(crate) struct HubItem {
    pub id: i32,
    pub quantity: i64,
    #[serde(default)]
    pub equipment_slot: Option<String>,
    /// Inventory slot 0–27, sent by plugin 1.5.1 and later (hub D-86).
    #[serde(default)]
    pub inventory_slot: Option<usize>,
}

#[derive(Deserialize, Debug, Clone)]
pub(crate) struct HubItems {
    /// The items' value at GE prices.
    #[serde(default)]
    pub value: Option<i64>,
    #[serde(default)]
    pub items: Vec<HubItem>,
}

/// The account owner, sent by hubs that support integration keys.
#[derive(Deserialize, Debug, Clone)]
pub(crate) struct HubOwner {
    #[serde(default)]
    pub name: Option<String>,
}

/// `GET /members/{discord_id}` (hub D-100): whether a Discord account is an
/// active member of the guild, and an admin. Someone the hub doesn't know
/// and someone on their way out both come back as `member: false`.
#[derive(Deserialize, Debug, Clone)]
pub(crate) struct HubMember {
    pub member: bool,
    #[serde(default)]
    pub is_admin: bool,
    #[serde(default)]
    pub name: Option<String>,
}

/// One account of `GET /snapshot`.
#[derive(Deserialize, Debug, Clone)]
pub(crate) struct HubAccount {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub account_hash: Option<String>,
    /// Ironman type (0 normal … 6); `type_label` is its display name.
    #[serde(default, rename = "type")]
    pub account_type: Option<i32>,
    #[serde(default)]
    pub type_label: Option<String>,
    #[serde(default)]
    pub owner: Option<HubOwner>,
    /// The categories the key may read on this account.
    #[serde(default)]
    pub categories: Vec<String>,
    #[serde(default)]
    pub online: Option<bool>,
    #[serde(default)]
    pub world: Option<i32>,
    #[serde(default)]
    pub special_world: Option<bool>,
    /// The last game state the plugin sent (hub D-94); `online` is the one to trust.
    #[serde(default)]
    pub game_state: Option<String>,
    #[serde(default)]
    pub last_seen: Option<DateTime<Utc>>,
    #[serde(default)]
    pub spellbook: Option<String>,
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
pub(crate) struct HubMe {
    pub key: HubMeKey,
    #[serde(default)]
    pub visible_accounts: Option<i64>,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub(crate) struct HubMeKey {
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
    pub(crate) fn is_service_key(&self) -> bool {
        self.kind.as_deref() == Some("service")
    }
}

#[derive(Deserialize, Debug, Clone)]
pub(crate) struct HubAccountRef {
    pub id: String,
    pub name: String,
}

/// `GET /xp?accounts=`.
#[derive(Deserialize, Debug)]
pub(crate) struct HubXpMulti {
    pub accounts: Vec<HubXpSeries>,
}

#[derive(Deserialize, Debug)]
pub(crate) struct HubXpSeries {
    pub account: HubAccountRef,
    pub series: Vec<HubXpLine>,
}

#[derive(Deserialize, Debug)]
pub(crate) struct HubXpLine {
    pub skill: String,
    pub points: Vec<(DateTime<Utc>, i64)>,
}

#[derive(Deserialize, Debug)]
pub(crate) struct HubLocationPoint {
    pub at: DateTime<Utc>,
    pub x: i32,
    pub y: i32,
    pub plane: i32,
    #[serde(default)]
    pub world: Option<i32>,
    #[serde(default)]
    pub is_on_boat: Option<bool>,
}

/// `GET /leaderboards/gains`.
#[derive(Deserialize, Debug)]
pub(crate) struct HubLeaderboards {
    pub period: String,
    pub leaderboards: Vec<HubLeaderboard>,
}

#[derive(Deserialize, Debug)]
pub(crate) struct HubLeaderboard {
    pub skill: String,
    pub entries: Vec<HubLeaderboardEntry>,
}

#[derive(Deserialize, Debug)]
pub(crate) struct HubLeaderboardEntry {
    pub rank: i32,
    pub account: HubAccountRef,
    pub gain: i64,
}

/// One event of `GET /events` (and of `/leaderboards/loot`).
#[derive(Deserialize, Debug, Clone)]
pub(crate) struct HubEvent {
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
    pub npc_id: Option<i32>,
    #[serde(default)]
    pub skill: Option<String>,
    #[serde(default)]
    pub level: Option<i32>,
    #[serde(default)]
    pub tier: Option<String>,
    #[serde(default)]
    pub points: Option<i32>,
    #[serde(default)]
    pub special_world: Option<bool>,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub line: Option<String>,
    /// The plugin's event object, passed through by the hub.
    #[serde(default)]
    pub data: Option<serde_json::Value>,
}

/// `GET /leaderboards/loot` (hub D-94).
#[derive(Deserialize, Debug)]
pub(crate) struct HubLootLeaderboard {
    pub entries: Vec<HubLootEntry>,
}

#[derive(Deserialize, Debug)]
pub(crate) struct HubLootEntry {
    pub event: HubEvent,
}

/// `GET /accounts/{id}/gains`.
#[derive(Deserialize, Serialize, Debug)]
pub(crate) struct HubAccountGains {
    #[serde(default)]
    pub period: Option<String>,
    /// Passed through to the site as sent.
    #[serde(default)]
    pub from: Option<String>,
    #[serde(default)]
    pub to: Option<String>,
    pub gains: Vec<HubSkillGain>,
}

#[derive(Deserialize, Serialize, Debug)]
pub(crate) struct HubSkillGain {
    pub skill: String,
    pub xp: i64,
}

/// `GET /accounts/{id}/sessions`.
#[derive(Deserialize, Debug)]
pub(crate) struct HubSessions {
    pub sessions: Vec<HubSession>,
}

#[derive(Deserialize, Serialize, Debug, Clone)]
pub(crate) struct HubSession {
    pub started_at: DateTime<Utc>,
    #[serde(default)]
    pub ended_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub last_seen_at: Option<DateTime<Utc>>,
    #[serde(default)]
    pub duration_ms: Option<i64>,
    #[serde(default)]
    pub worlds: Vec<i32>,
    #[serde(default)]
    pub end_reason: Option<String>,
}

/// `GET /accounts/{id}/wealth`.
#[derive(Deserialize, Serialize, Debug)]
pub(crate) struct HubWealth {
    pub days: Vec<HubWealthDay>,
}

#[derive(Deserialize, Serialize, Debug)]
pub(crate) struct HubWealthDay {
    pub day: String,
    #[serde(default)]
    pub last_value: Option<i64>,
    #[serde(default)]
    pub max_value: Option<i64>,
}

/// `GET /accounts/{id}/equipment-history`.
#[derive(Deserialize, Debug)]
pub(crate) struct HubEquipmentHistory {
    pub changes: Vec<HubEquipmentChange>,
}

#[derive(Deserialize, Debug)]
pub(crate) struct HubEquipmentChange {
    pub changed_at: DateTime<Utc>,
    #[serde(default)]
    pub items: Vec<HubItem>,
}

/// `GET /locations?accounts=`.
#[derive(Deserialize, Debug)]
pub(crate) struct HubLocationsMulti {
    pub accounts: Vec<HubAccountLocations>,
}

#[derive(Deserialize, Debug)]
pub(crate) struct HubAccountLocations {
    pub account: HubAccountRef,
    pub points: Vec<HubLocationPoint>,
}
