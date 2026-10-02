use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// A member's player data. As an update (to the batcher) a `None` field is
/// left alone; in the poll response it means "unchanged since `from_time`".
#[derive(Deserialize, Serialize, Default, Debug)]
pub struct MemberData {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stats: Option<Vec<i32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub coordinates: Option<Vec<i32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub skills: Option<Vec<i32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub inventory: Option<Vec<i32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub equipment: Option<Vec<i32>>,
    /// Display details from the hub (see `hub::convert::HubMeta`).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub meta: Option<serde_json::Value>,
    /// When any of the fields last changed.
    #[serde(skip)]
    pub last_updated: Option<DateTime<Utc>>,
}

/// Who is on the roster, sent in full on every poll: it is small, and it is
/// how the site learns about renames, removals and presence.
#[derive(Serialize, Debug, Clone)]
pub struct RosterEntry {
    pub name: String,
    pub online: bool,
    pub last_seen: Option<DateTime<Utc>>,
    /// The hub no longer shares this account.
    pub orphaned: bool,
}

/// `GET /api/members`.
#[derive(Serialize, Debug)]
pub struct MembersResponse {
    /// Pass as `from_time` next time.
    pub cursor: DateTime<Utc>,
    pub roster: Vec<RosterEntry>,
    /// Only members with data that changed at or after `from_time`.
    pub members: Vec<MemberData>,
}
#[derive(Serialize)]
pub(crate) struct AggregateSkillData {
    pub time: DateTime<Utc>,
    pub data: Vec<i32>,
}
#[derive(Serialize)]
pub(crate) struct MemberSkillData {
    pub name: String,
    pub skill_data: Vec<AggregateSkillData>,
}
/// `GET /api/skill-history`.
pub(crate) type SkillHistory = Vec<MemberSkillData>;
#[derive(Deserialize)]
pub(crate) struct WikiGEPrice {
    pub high: Option<i64>,
    pub low: Option<i64>,
}
#[derive(Deserialize)]
pub(crate) struct WikiGEPrices {
    pub data: std::collections::HashMap<i32, WikiGEPrice>,
}
pub(crate) type GEPrices = std::collections::HashMap<i32, i64>;

// --- Signing in ---

/// Who a session belongs to, as the hub knew them when it was last asked
/// (see `hub::members`). Also what `GET /api/auth/me` answers with.
#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
pub(crate) struct Session {
    #[serde(skip)]
    pub discord_id: String,
    pub name: String,
    pub is_admin: bool,
}

/// `POST /api/auth/discord/callback`: what Discord sent the browser back with.
#[derive(Deserialize)]
pub(crate) struct DiscordCallbackRequest {
    pub code: String,
    #[serde(default)]
    pub state: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct DiscordTokenResponse {
    pub access_token: String,
    pub token_type: String,
}

#[derive(Deserialize)]
pub(crate) struct DiscordUser {
    pub id: String,
    pub username: String,
    #[serde(default)]
    pub global_name: Option<String>,
}

// --- The admin page ---

#[derive(Serialize)]
pub(crate) struct PlayerInfo {
    pub member_name: String,
    pub last_updated: Option<DateTime<Utc>>,
    pub hub_linked: bool,
    /// Set when the hub no longer shows this player's account.
    pub hub_orphaned_at: Option<DateTime<Utc>>,
    pub online: bool,
    pub last_seen: Option<DateTime<Utc>>,
    /// Hidden by an admin: left out of the map and not synced.
    pub hidden: bool,
}
