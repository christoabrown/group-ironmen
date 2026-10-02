//! Converts hub snapshot accounts into the member arrays the site understands,
//! plus the display details (`HubMeta`) the site shows next to them.
use crate::hub::models::{HubAccount, HubItems};
use crate::models::GroupMember;
use crate::osrs::{equipment_slot_index, skill_index, SKILL_ORDER};
use serde::{Deserialize, Serialize};

/// Details about an account the site shows but doesn't compute with. Stored
/// as one JSON column so the hub can add fields without a migration.
#[derive(Debug, Default, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub(crate) struct HubMeta {
    /// Ironman type (0 normal … 6) and its display name.
    #[serde(rename = "type", skip_serializing_if = "Option::is_none")]
    pub account_type: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub type_label: Option<String>,
    /// The owner's display name on the hub.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub owner: Option<String>,
    /// The categories the owner shares with the guild; the site tells
    /// "not shared" apart from "empty" with them.
    #[serde(default)]
    pub categories: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_level: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub overall_xp: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub inventory_value: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub equipment_value: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub spellbook: Option<String>,
    /// The last game state the plugin sent; `online` is the one to trust.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub game_state: Option<String>,
    #[serde(default)]
    pub is_on_boat: bool,
    #[serde(default)]
    pub special_world: bool,
}

impl HubMeta {
    /// On a special world the hub's totals and item values describe that
    /// world, so the main game's values from before are kept.
    fn from_account(account: &HubAccount, previous: Option<&HubMeta>) -> Self {
        let special_world = account.special_world.unwrap_or(false);
        let main_game = |current: Option<i64>, pick: fn(&HubMeta) -> Option<i64>| {
            if special_world {
                previous.and_then(pick)
            } else {
                current
            }
        };
        HubMeta {
            account_type: account.account_type,
            type_label: account.type_label.clone(),
            owner: account.owner.as_ref().and_then(|owner| owner.name.clone()),
            categories: account.categories.clone(),
            total_level: main_game(
                account
                    .skills
                    .as_ref()
                    .and_then(|skills| skills.total_level),
                |meta| meta.total_level,
            ),
            overall_xp: main_game(
                account.skills.as_ref().and_then(|skills| skills.overall_xp),
                |meta| meta.overall_xp,
            ),
            inventory_value: main_game(
                account.inventory.as_ref().and_then(|items| items.value),
                |meta| meta.inventory_value,
            ),
            equipment_value: main_game(
                account.equipment.as_ref().and_then(|items| items.value),
                |meta| meta.equipment_value,
            ),
            spellbook: account.spellbook.clone(),
            game_state: account.game_state.clone(),
            is_on_boat: account
                .location
                .as_ref()
                .and_then(|location| location.is_on_boat)
                .unwrap_or(false),
            special_world,
        }
    }
}

/// The member arrays built from one hub account. `None` means the hub did not
/// send that section (category not readable, or never sent by the plugin).
#[derive(Debug, Default, Clone, PartialEq, Eq, Hash)]
pub(crate) struct MemberSections {
    pub stats: Option<Vec<i32>>,
    pub coordinates: Option<Vec<i32>>,
    pub skills: Option<Vec<i32>>,
    pub inventory: Option<Vec<i32>>,
    pub equipment: Option<Vec<i32>>,
    pub meta: Option<HubMeta>,
}

impl MemberSections {
    /// `previous` is what was sent for the account before, if anything.
    pub(crate) fn from_account(account: &HubAccount, previous: Option<&MemberSections>) -> Self {
        let special_world = account.special_world.unwrap_or(false);
        MemberSections {
            stats: stats(account),
            coordinates: account
                .location
                .as_ref()
                .filter(|location| !location.stale)
                .map(|location| vec![location.x, location.y, location.plane]),
            // Seasonal or other special worlds have their own XP and items;
            // keep them from overwriting the main game's data.
            skills: if special_world {
                None
            } else {
                account.skills.as_ref().map(|skills| {
                    let mut xp = vec![0i32; SKILL_ORDER.len()];
                    for skill in &skills.skills {
                        if let (Some(index), Some(value)) = (skill_index(&skill.skill), skill.xp) {
                            xp[index] = clamp_i32(value);
                        }
                    }
                    xp
                })
            },
            inventory: if special_world {
                None
            } else {
                account.inventory.as_ref().map(inventory)
            },
            equipment: if special_world {
                None
            } else {
                account.equipment.as_ref().map(equipment)
            },
            meta: Some(HubMeta::from_account(
                account,
                previous.and_then(|previous| previous.meta.as_ref()),
            )),
        }
    }

    /// Builds the batcher update. Sections are only included when `include`
    /// says so, which lets the sync skip unchanged sections.
    pub(crate) fn to_member(
        &self,
        group_id: i64,
        name: &str,
        include: impl Fn(Section) -> bool,
    ) -> GroupMember {
        GroupMember {
            group_id: Some(group_id),
            name: name.to_owned(),
            stats: self.stats.clone().filter(|_| include(Section::Stats)),
            coordinates: self
                .coordinates
                .clone()
                .filter(|_| include(Section::Coordinates)),
            skills: self.skills.clone().filter(|_| include(Section::Skills)),
            inventory: self
                .inventory
                .clone()
                .filter(|_| include(Section::Inventory)),
            equipment: self
                .equipment
                .clone()
                .filter(|_| include(Section::Equipment)),
            meta: self
                .meta
                .as_ref()
                .filter(|_| include(Section::Meta))
                .and_then(|meta| serde_json::to_value(meta).ok()),
            ..Default::default()
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Section {
    Stats,
    Coordinates,
    Skills,
    Inventory,
    Equipment,
    Meta,
}

pub(crate) const SECTIONS: [Section; 6] = [
    Section::Stats,
    Section::Coordinates,
    Section::Skills,
    Section::Inventory,
    Section::Equipment,
    Section::Meta,
];

/// Whether a section differs between the previously sent and the current data.
pub(crate) fn section_changed(
    previous: Option<&MemberSections>,
    current: &MemberSections,
    section: Section,
) -> bool {
    let Some(previous) = previous else {
        return true;
    };
    match section {
        Section::Stats => previous.stats != current.stats,
        Section::Coordinates => previous.coordinates != current.coordinates,
        Section::Skills => previous.skills != current.skills,
        Section::Inventory => previous.inventory != current.inventory,
        Section::Equipment => previous.equipment != current.equipment,
        Section::Meta => previous.meta != current.meta,
    }
}

/// `[hp, hp max, prayer, prayer max, energy, unused, world]` (the hub has no
/// run energy; the layout is kept from the Group Ironman plugin).
fn stats(account: &HubAccount) -> Option<Vec<i32>> {
    if account.hp.is_none() && account.prayer.is_none() && account.world.is_none() {
        return None;
    }
    Some(vec![
        account.hp.map(|hp| hp.current).unwrap_or(0),
        account.hp.map(|hp| hp.max).unwrap_or(0),
        account.prayer.map(|prayer| prayer.current).unwrap_or(0),
        account.prayer.map(|prayer| prayer.max).unwrap_or(0),
        0,
        0,
        account.world.unwrap_or(0),
    ])
}

/// 28 inventory slots as id/quantity pairs. Items are placed by their
/// `inventory_slot` when the hub sends one (plugin 1.5.1 and later), otherwise
/// in the order the hub sends them.
fn inventory(items: &HubItems) -> Vec<i32> {
    let mut flat = vec![0i32; 56];
    let has_slots = items.items.iter().any(|item| item.inventory_slot.is_some());
    for (index, item) in items.items.iter().enumerate() {
        let slot = if has_slots {
            match item.inventory_slot {
                Some(slot) => slot,
                None => continue,
            }
        } else {
            index
        };
        if slot < 28 && item.id > 0 {
            flat[slot * 2] = item.id;
            flat[slot * 2 + 1] = clamp_i32(item.quantity);
        }
    }
    flat
}

/// 14 equipment slots as id/quantity pairs, placed by slot name.
pub(crate) fn equipment(items: &HubItems) -> Vec<i32> {
    let mut flat = vec![0i32; 28];
    for item in &items.items {
        let Some(slot) = item
            .equipment_slot
            .as_deref()
            .and_then(equipment_slot_index)
        else {
            continue;
        };
        if slot < 14 && item.id > 0 {
            flat[slot * 2] = item.id;
            flat[slot * 2 + 1] = clamp_i32(item.quantity);
        }
    }
    flat
}

fn clamp_i32(value: i64) -> i32 {
    value.clamp(0, i32::MAX as i64) as i32
}

#[cfg(test)]
mod tests {
    use super::*;

    fn account(json: serde_json::Value) -> HubAccount {
        serde_json::from_value(json).unwrap()
    }

    fn full_account() -> HubAccount {
        account(serde_json::json!({
            "id": "oC8RsqiTuyak",
            "name": "Alpha Main",
            "type": 0,
            "type_label": "Normal",
            "owner": {"name": "Owner", "discord_id": "1"},
            "categories": ["activity", "stats", "equipment", "inventory"],
            "online": true,
            "world": 302,
            "special_world": false,
            "game_state": "LOGGED_IN",
            "last_seen": "2026-09-29T14:13:42.046Z",
            "spellbook": "lunar",
            "hp": {"current": 90, "max": 99},
            "prayer": {"current": 50, "max": 99},
            "location": {"x": 3164, "y": 3487, "plane": 0, "is_on_boat": false, "stale": false,
                         "updated_at": "2026-09-29T14:13:42.046Z"},
            "skills": {"total_level": 2277, "overall_xp": 100, "skills": [
                {"skill": "Attack", "level": 99, "real_level": 99, "xp": 13034431},
                {"skill": "Sailing", "level": 1, "real_level": 1, "xp": 0},
                {"skill": "Overall", "level": 2277, "real_level": 2277, "xp": 300000000}
            ]},
            "equipment": {"value": 2500000, "items": [
                {"id": 11832, "name": "Bandos chestplate", "quantity": 1, "ge_price": 1, "ha_price": 1, "equipment_slot": "BODY"},
                {"id": 11212, "name": "Dragon arrow", "quantity": 250, "ge_price": 1, "ha_price": 1, "equipment_slot": "AMMO"}
            ]},
            "inventory": {"value": 5000100, "items": [
                {"id": 995, "name": "Coins", "quantity": 5000000000i64, "ge_price": 1, "ha_price": 1, "equipment_slot": null},
                {"id": 385, "name": "Shark", "quantity": 1, "ge_price": 1, "ha_price": 1, "equipment_slot": null}
            ]}
        }))
    }

    #[test]
    fn converts_every_section() {
        let sections = MemberSections::from_account(&full_account(), None);
        assert_eq!(sections.stats, Some(vec![90, 99, 50, 99, 0, 0, 302]));
        assert_eq!(sections.coordinates, Some(vec![3164, 3487, 0]));

        let skills = sections.skills.unwrap();
        assert_eq!(skills.len(), 24);
        assert_eq!(skills[skill_index("Attack").unwrap()], 13034431);
        assert_eq!(skills.iter().filter(|xp| **xp > 0).count(), 1);

        let equipment = sections.equipment.unwrap();
        assert_eq!(&equipment[8..10], &[11832, 1]);
        assert_eq!(&equipment[26..28], &[11212, 250]);

        let inventory = sections.inventory.unwrap();
        assert_eq!(&inventory[0..4], &[995, i32::MAX, 385, 1]);
        assert!(inventory[4..].iter().all(|value| *value == 0));
    }

    #[test]
    fn meta_carries_the_account_details() {
        let meta = MemberSections::from_account(&full_account(), None)
            .meta
            .unwrap();
        assert_eq!(meta.account_type, Some(0));
        assert_eq!(meta.type_label.as_deref(), Some("Normal"));
        assert_eq!(meta.owner.as_deref(), Some("Owner"));
        assert_eq!(meta.total_level, Some(2277));
        assert_eq!(meta.overall_xp, Some(100));
        assert_eq!(meta.inventory_value, Some(5000100));
        assert_eq!(meta.equipment_value, Some(2500000));
        assert_eq!(meta.spellbook.as_deref(), Some("lunar"));
        assert_eq!(meta.game_state.as_deref(), Some("LOGGED_IN"));
        let json = serde_json::to_value(&meta).unwrap();
        assert_eq!(json["type"], 0);
        assert_eq!(json["categories"][0], "activity");
    }

    #[test]
    fn special_world_keeps_the_main_game_totals() {
        let before = MemberSections::from_account(&full_account(), None);
        let mut account = full_account();
        account.special_world = Some(true);
        account.skills.as_mut().unwrap().total_level = Some(32);
        let meta = MemberSections::from_account(&account, Some(&before))
            .meta
            .unwrap();
        assert!(meta.special_world);
        assert_eq!(meta.total_level, Some(2277));
        assert_eq!(meta.inventory_value, Some(5000100));
    }

    #[test]
    fn inventory_is_placed_by_slot_when_the_hub_sends_slots() {
        let items: HubItems = serde_json::from_value(serde_json::json!({"value": 0, "items": [
            {"id": 4151, "name": "Abyssal whip", "quantity": 1, "ge_price": 0, "ha_price": 0,
             "equipment_slot": null, "inventory_slot": 0},
            {"id": 385, "name": "Shark", "quantity": 1, "ge_price": 0, "ha_price": 0,
             "equipment_slot": null, "inventory_slot": 27}
        ]}))
        .unwrap();
        let flat = inventory(&items);
        assert_eq!(&flat[0..2], &[4151, 1]);
        assert_eq!(&flat[54..56], &[385, 1]);
        assert!(flat[2..54].iter().all(|value| *value == 0));
    }

    #[test]
    fn stale_location_is_not_sent() {
        let mut account = full_account();
        account.location.as_mut().unwrap().stale = true;
        assert_eq!(
            MemberSections::from_account(&account, None).coordinates,
            None
        );
    }

    #[test]
    fn special_world_only_updates_stats_and_location() {
        let mut account = full_account();
        account.special_world = Some(true);
        let sections = MemberSections::from_account(&account, None);
        assert!(sections.stats.is_some());
        assert!(sections.coordinates.is_some());
        assert_eq!(sections.skills, None);
        assert_eq!(sections.inventory, None);
        assert_eq!(sections.equipment, None);
    }

    #[test]
    fn missing_categories_produce_no_sections() {
        let account = account(serde_json::json!({
            "id": "abc", "name": "Private", "type": 0, "categories": []
        }));
        let sections = MemberSections::from_account(&account, None);
        assert_eq!(sections.stats, None);
        assert_eq!(sections.coordinates, None);
        assert_eq!(sections.skills, None);
        assert_eq!(sections.inventory, None);
        assert_eq!(sections.equipment, None);
        assert!(sections.meta.unwrap().categories.is_empty());
    }

    #[test]
    fn to_member_filters_sections() {
        let sections = MemberSections::from_account(&full_account(), None);
        let member = sections.to_member(7, "Alpha Main", |section| section == Section::Stats);
        assert_eq!(member.group_id, Some(7));
        assert!(member.stats.is_some());
        assert!(member.coordinates.is_none());
        assert!(member.skills.is_none());
        assert!(member.meta.is_none());
        let member = sections.to_member(7, "Alpha Main", |section| section == Section::Meta);
        assert_eq!(member.meta.unwrap()["owner"], "Owner");
    }

    #[test]
    fn section_changed_detects_differences() {
        let before = MemberSections::from_account(&full_account(), None);
        let mut account = full_account();
        account.location.as_mut().unwrap().x += 1;
        let after = MemberSections::from_account(&account, Some(&before));
        assert!(section_changed(None, &after, Section::Skills));
        assert!(section_changed(Some(&before), &after, Section::Coordinates));
        assert!(!section_changed(Some(&before), &after, Section::Skills));
        assert!(!section_changed(Some(&before), &after, Section::Meta));
    }
}
