use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

pub const SHARED_MEMBER: &str = "@SHARED";
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Stat {
    current: i32,
    max: i32,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Stats {
    hitpoints: Stat,
    prayer: Stat,
    energy: Stat,
    world: i32,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Coordinates {
    x: i32,
    y: i32,
    plane: i32,
}
#[allow(non_snake_case)]
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Skills {
    Hunter: i32,
    Overall: i32,
    Thieving: i32,
    Runecraft: i32,
    Construction: i32,
    Cooking: i32,
    Magic: i32,
    Fletching: i32,
    Herblore: i32,
    Firemaking: i32,
    Attack: i32,
    Fishing: i32,
    Crafting: i32,
    Hitpoints: i32,
    Ranged: i32,
    Mining: i32,
    Smithing: i32,
    Agility: i32,
    Woodcutting: i32,
    Slayer: i32,
    Defence: i32,
    Strength: i32,
    Prayer: i32,
    Farming: i32,
}
#[allow(non_camel_case_types)]
#[derive(Serialize, Deserialize)]
pub enum QuestState {
    NOT_STARTED,
    FINISHED,
    IN_PROGRESS,
}
pub type Quests = std::collections::HashMap<String, QuestState>;
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Item {
    id: i32,
    quantity: i32,
}
pub type Inventory = [Item; 28];
pub type Equipment = [Item; 14];
pub type Bank = std::vec::Vec<Item>;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RenameGroupMember {
    pub original_name: String,
    pub new_name: String,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GroupMember {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stats: Option<Stats>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub coordinates: Option<Coordinates>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub skills: Option<Skills>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quests: Option<Quests>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub inventory: Option<Inventory>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub equipment: Option<Equipment>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bank: Option<Bank>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shared_bank: Option<Bank>,
    #[serde(skip_deserializing)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_updated: Option<DateTime<Utc>>,
}
pub type GroupData = std::vec::Vec<GroupMember>;
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct CreateGroup {
    pub name: String,
    pub member_names: [String; 5],
    #[serde(default = "default_token")]
    #[serde(skip_deserializing)]
    pub token: String,
}
fn default_token() -> String {
    uuid::Uuid::new_v4().to_hyphenated().to_string()
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct QueryInfo {
    pub from_time: Option<String>,
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct EncryptedData {
    pub nonce: [u8; 12],
    pub ciphertext: std::vec::Vec<u8>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AmIInGroupRequest {
    pub member_name: String,
}
