use chrono::{DateTime, Utc};
use lazy_static::lazy_static;
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
pub fn serialize_stats(stats: Stats) -> Vec<i32> {
    vec![
        stats.hitpoints.current,
        stats.hitpoints.max,
        stats.prayer.current,
        stats.prayer.max,
        stats.energy.current,
        stats.energy.max,
        stats.world,
    ]
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Coordinates {
    x: i32,
    y: i32,
    plane: i32,
}
pub fn serialize_coordinates(coordinates: Coordinates) -> Vec<i32> {
    vec![coordinates.x, coordinates.y, coordinates.plane]
}
#[allow(non_snake_case)]
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Skills {
    Agility: i32,
    Attack: i32,
    Construction: i32,
    Cooking: i32,
    Crafting: i32,
    Defence: i32,
    Farming: i32,
    Firemaking: i32,
    Fishing: i32,
    Fletching: i32,
    Herblore: i32,
    Hitpoints: i32,
    Hunter: i32,
    Magic: i32,
    Mining: i32,
    Overall: i32,
    Prayer: i32,
    Ranged: i32,
    Runecraft: i32,
    Slayer: i32,
    Smithing: i32,
    Strength: i32,
    Thieving: i32,
    Woodcutting: i32,
}
pub fn serialize_skills(skills: Skills) -> Vec<i32> {
    vec![
        skills.Agility,
        skills.Attack,
        skills.Construction,
        skills.Cooking,
        skills.Crafting,
        skills.Defence,
        skills.Farming,
        skills.Firemaking,
        skills.Fishing,
        skills.Fletching,
        skills.Herblore,
        skills.Hitpoints,
        skills.Hunter,
        skills.Magic,
        skills.Mining,
        skills.Overall,
        skills.Prayer,
        skills.Ranged,
        skills.Runecraft,
        skills.Slayer,
        skills.Smithing,
        skills.Strength,
        skills.Thieving,
        skills.Woodcutting,
    ]
}
#[allow(non_camel_case_types)]
#[derive(Serialize, Deserialize, Copy, Clone)]
pub enum QuestState {
    NOT_STARTED,
    FINISHED,
    IN_PROGRESS,
}
pub type Quests = std::collections::HashMap<String, QuestState>;
lazy_static! {
    static ref QUEST_IDS: Vec<String> = (0..180).map(|x| x.to_string()).collect();
}
pub fn serialize_quests(quests: &Option<Quests>) -> Option<Vec<u8>> {
    match quests {
        Some(v) => {
            let mut result: Vec<u8> = Vec::with_capacity(QUEST_IDS.len());
            for quest_id in QUEST_IDS.iter() {
                result.push(*v.get(quest_id).unwrap_or(&QuestState::NOT_STARTED) as u8);
            }
            Some(result)
        }
        None => None,
    }
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Item {
    pub id: i32,
    pub quantity: i32,
}
#[derive(Serialize, Deserialize)]
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

pub type Inventory = [Item; 28];
pub type Equipment = [Item; 14];
pub type RunePouch = [Item; 4];

pub type Bank = std::vec::Vec<Item>;
pub type SeedVault = std::vec::Vec<Item>;
pub fn serialize_item_slice(item_slice: &[Item]) -> Vec<i32> {
    let mut result = Vec::with_capacity(item_slice.len() * 2);
    for item in item_slice.iter() {
        result.push(item.id);
        result.push(item.quantity);
    }
    result
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RenameGroupMember {
    pub original_name: String,
    pub new_name: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GroupMember {
    pub name: String,
    pub stats: Option<Stats>,
    pub coordinates: Option<Coordinates>,
    pub skills: Option<Skills>,
    pub quests: Option<Quests>,
    pub inventory: Option<Inventory>,
    pub equipment: Option<Equipment>,
    pub bank: Option<Bank>,
    pub shared_bank: Option<Bank>,
    pub rune_pouch: Option<RunePouch>,
    pub interacting: Option<Interacting>,
    pub seed_vault: Option<SeedVault>,
    pub deposited: Option<Bank>,
}
pub type GroupData = std::vec::Vec<GroupMember>;
#[derive(Serialize)]
pub struct StoredGroupMember {
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
    pub last_updated: Option<DateTime<Utc>>,
}
pub type StoredGroupData = Vec<StoredGroupMember>;
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
    pub member_names: [String; 5],
    #[serde(default = "default_token")]
    #[serde(skip_deserializing)]
    pub token: String,
}
fn default_token() -> String {
    uuid::Uuid::new_v4().to_hyphenated().to_string()
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
