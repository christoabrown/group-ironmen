use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};


#[derive(Serialize, Deserialize, Clone)]
#[serde(deny_unknown_fields)]
pub struct Coordinates {
    x: i32,
    y: i32,
    plane: i32,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(deny_unknown_fields)]
pub struct Interacting {
    name: String,
    scale: i32,
    ratio: i32,
    location: Coordinates,
    #[serde(default = "default_last_updated")]
    last_updated: DateTime<Utc>,
}
fn default_last_updated() -> DateTime<Utc> {
    Utc::now()
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RenameGroupMember {
    pub original_name: String,
    pub new_name: String,
}

#[derive(Deserialize, Serialize, Default)]
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
    pub quests: Option<Vec<u8>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub inventory: Option<Vec<i32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub equipment: Option<Vec<i32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bank: Option<Vec<i32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rune_pouch: Option<Vec<i32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub interacting: Option<Interacting>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub seed_vault: Option<Vec<i32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deposited: Option<Vec<i32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub diary_vars: Option<Vec<i32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub collection_log_v2: Option<Vec<i32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub potion_storage: Option<Vec<i32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_updated: Option<DateTime<Utc>>,
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
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct CreateGroup {
    pub name: String,
    pub member_names: Vec<String>,
    #[serde(default, skip_serializing)]
    pub captcha_response: String,
    #[serde(default = "default_token")]
    #[serde(skip_deserializing)]
    pub token: String,
}
fn default_token() -> String {
    uuid::Uuid::new_v4().hyphenated().to_string()
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AmIInGroupRequest {
    pub member_name: String,
}
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
#[derive(Deserialize)]
pub struct CaptchaVerifyResponse {
    pub success: bool,
    // NOTE: unused
    // #[serde(rename = "error-codes", default)]
    // pub error_codes: std::vec::Vec<String>,
}

#[derive(Serialize)]
pub struct PairCodeResponse {
    pub ok: bool,
    pub code: String,
    pub expires_in: u64,
}

#[derive(Deserialize)]
pub struct PairRequest {
    pub code: String,
}

#[derive(Serialize)]
pub struct PairResponse {
    pub ok: bool,
    pub device_id: String,
    pub token: String,
}

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

#[derive(Deserialize)]
pub struct IngestLocation {
    pub x: i32,
    pub y: i32,
    pub plane: i32,
}

#[derive(Deserialize)]
pub struct IngestHealthOrPrayer {
    pub current: i32,
    pub max: i32,
}

#[derive(Deserialize)]
#[allow(dead_code)]
pub struct IngestSpellbook {
    pub id: Option<i32>,
    pub name: Option<String>,
}

#[derive(Deserialize)]
#[allow(dead_code)]
pub struct IngestSkill {
    pub xp: Option<i32>,
    #[serde(default)]
    pub level: Option<i32>,
    #[serde(default)]
    pub boosted_level: Option<i32>,
}

#[derive(Deserialize)]
pub struct IngestStats {
    pub skills: Option<std::collections::HashMap<String, IngestSkill>>,
}

#[derive(Deserialize)]
pub struct IngestItem {
    pub id: Option<i32>,
    pub quantity: Option<i32>,
    #[serde(default)]
    pub slot: Option<usize>,
    #[serde(default, rename = "equipmentSlot")]
    pub equipment_slot: Option<String>,
}

#[derive(Deserialize)]
pub struct IngestItems {
    pub items: Option<Vec<IngestItem>>,
}

#[derive(Deserialize)]
#[allow(dead_code)]
pub struct IngestPlayer {
    pub name: String,
    #[serde(rename = "accountType")]
    pub account_type: Option<String>,
    pub world: Option<String>,
    pub location: Option<IngestLocation>,
    pub health: Option<IngestHealthOrPrayer>,
    #[serde(rename = "prayerPoints")]
    pub prayer_points: Option<IngestHealthOrPrayer>,
    pub spellbook: Option<IngestSpellbook>,
    pub stats: Option<IngestStats>,
    pub inventory: Option<IngestItems>,
    pub equipment: Option<IngestItems>,
}

#[derive(Deserialize)]
#[allow(dead_code)]
pub struct IngestPayload {
    pub player: IngestPlayer,
    #[serde(default)]
    pub events: Option<serde_json::Value>,
    pub state: Option<String>,
    #[serde(rename = "tickDelay")]
    pub tick_delay: Option<i32>,
}

// --- Discord OAuth models ---

#[derive(Deserialize)]
pub struct DiscordCallbackRequest {
    pub code: String,
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
