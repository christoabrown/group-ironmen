use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// A member's player data. As an update (to the batcher) a `None` field is
/// left alone; in the poll response it means "unchanged since `from_time`".
#[derive(Deserialize, Serialize, Default, Debug)]
pub struct GroupMember {
    #[serde(skip)]
    pub group_id: Option<i64>,
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

/// `GET /api/group/get-group-data`.
#[derive(Serialize, Debug)]
pub struct GroupDataResponse {
    /// Pass as `from_time` next time.
    pub cursor: DateTime<Utc>,
    pub roster: Vec<RosterEntry>,
    /// Only members with data that changed at or after `from_time`.
    pub members: Vec<GroupMember>,
}
#[derive(Serialize)]
pub struct AggregateSkillData {
    pub time: DateTime<Utc>,
    pub data: Vec<i32>,
}
#[derive(Serialize)]
pub struct MemberSkillData {
    pub name: String,
    pub skill_data: Vec<AggregateSkillData>,
}
pub type GroupSkillData = Vec<MemberSkillData>;
#[derive(Deserialize)]
pub struct WikiGEPrice {
    pub high: Option<i64>,
    pub low: Option<i64>,
}
#[derive(Deserialize)]
pub struct WikiGEPrices {
    pub data: std::collections::HashMap<i32, WikiGEPrice>,
}
pub type GEPrices = std::collections::HashMap<i32, i64>;
// --- User management models ---

#[derive(Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Serialize)]
pub struct LoginResponse {
    pub ok: bool,
    pub session_token: String,
    pub role: String,
    pub username: String,
}

#[derive(Serialize)]
pub struct SessionUser {
    pub user_id: i64,
    pub username: String,
    pub role: String,
    pub enabled: bool,
}

#[derive(Deserialize)]
pub struct CreateUserRequest {
    pub username: String,
    pub password: String,
    #[serde(default = "default_role")]
    pub role: String,
}
fn default_role() -> String {
    "member".to_string()
}

#[derive(Deserialize)]
pub struct ChangePasswordRequest {
    pub current_password: String,
    pub new_password: String,
}

#[derive(Deserialize)]
pub struct AdminChangePasswordRequest {
    pub new_password: String,
}

#[derive(Deserialize)]
pub struct ChangeRoleRequest {
    pub role: String,
}

#[derive(Serialize)]
pub struct UserInfo {
    pub user_id: i64,
    pub username: String,
    pub role: String,
    pub enabled: bool,
    pub created_at: DateTime<Utc>,
    pub last_seen: Option<DateTime<Utc>>,
}

#[derive(Serialize)]
pub struct AuditLogEntry {
    pub log_id: i64,
    pub user_id: Option<i64>,
    pub action: String,
    pub target_user_id: Option<i64>,
    pub details: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Serialize)]
pub struct PlayerInfo {
    pub member_id: i64,
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

#[derive(Serialize)]
pub struct PlayerUserLink {
    pub user_id: i64,
    pub username: String,
    /// `hub` or `manual`.
    pub source: String,
}

#[derive(Deserialize)]
pub struct SetupRequest {
    pub username: String,
    pub password: String,
}

#[derive(Serialize)]
pub struct SetupStatusResponse {
    pub needs_setup: bool,
}

// --- Discord OAuth models ---

#[derive(Deserialize)]
pub struct DiscordCallbackRequest {
    pub code: String,
    #[serde(default)]
    pub state: Option<String>,
}

#[derive(Deserialize)]
pub struct DiscordTokenResponse {
    pub access_token: String,
    pub token_type: String,
}

#[derive(Deserialize)]
pub struct DiscordUser {
    pub id: String,
    pub username: String,
    #[allow(dead_code)]
    pub discriminator: String,
    #[serde(default)]
    pub global_name: Option<String>,
}

#[derive(Deserialize)]
pub struct DiscordGuild {
    pub id: String,
    #[allow(dead_code)]
    pub name: String,
}

#[derive(Serialize)]
pub struct DiscordEnabledResponse {
    pub enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth_url: Option<String>,
}
