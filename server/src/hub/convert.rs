//! Converts hub snapshot accounts into the member arrays the site understands.
//! The layouts are the same as for direct plugin ingest (see `device.rs`).
use crate::hub::models::{HubAccount, HubItems};
use crate::models::GroupMember;
use crate::osrs::{equipment_slot_index, skill_index, SKILL_ORDER};

/// The member arrays built from one hub account. `None` means the hub did not
/// send that section (category not readable, or never sent by the plugin).
#[derive(Debug, Default, Clone, PartialEq, Eq, Hash)]
pub struct MemberSections {
    pub stats: Option<Vec<i32>>,
    pub coordinates: Option<Vec<i32>>,
    pub skills: Option<Vec<i32>>,
    pub inventory: Option<Vec<i32>>,
    pub equipment: Option<Vec<i32>>,
}

impl MemberSections {
    pub fn from_account(account: &HubAccount) -> Self {
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
        }
    }

    /// Builds the batcher update. Sections are only included when `include`
    /// says so, which lets the sync skip unchanged sections.
    pub fn to_member(
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
            ..Default::default()
        }
    }

    pub fn is_empty(&self) -> bool {
        self.stats.is_none()
            && self.coordinates.is_none()
            && self.skills.is_none()
            && self.inventory.is_none()
            && self.equipment.is_none()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Section {
    Stats,
    Coordinates,
    Skills,
    Inventory,
    Equipment,
}

/// Whether a section differs between the previously sent and the current data.
pub fn section_changed(
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
    }
}

/// `[hp, hp max, prayer, prayer max, energy, unused, world]`, as for direct ingest.
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
/// in the order the hub sends them, like direct ingest does.
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
fn equipment(items: &HubItems) -> Vec<i32> {
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
            "online": true,
            "world": 302,
            "special_world": false,
            "last_seen": "2026-09-29T14:13:42.046Z",
            "hp": {"current": 90, "max": 99},
            "prayer": {"current": 50, "max": 99},
            "location": {"x": 3164, "y": 3487, "plane": 0, "is_on_boat": false, "stale": false,
                         "updated_at": "2026-09-29T14:13:42.046Z"},
            "skills": {"total_level": 2277, "overall_xp": 100, "skills": [
                {"skill": "Attack", "level": 99, "real_level": 99, "xp": 13034431},
                {"skill": "Sailing", "level": 1, "real_level": 1, "xp": 0},
                {"skill": "Overall", "level": 2277, "real_level": 2277, "xp": 300000000}
            ]},
            "equipment": {"value": 1, "items": [
                {"id": 11832, "name": "Bandos chestplate", "quantity": 1, "ge_price": 1, "ha_price": 1, "equipment_slot": "BODY"},
                {"id": 11212, "name": "Dragon arrow", "quantity": 250, "ge_price": 1, "ha_price": 1, "equipment_slot": "AMMO"}
            ]},
            "inventory": {"value": 1, "items": [
                {"id": 995, "name": "Coins", "quantity": 5000000000i64, "ge_price": 1, "ha_price": 1, "equipment_slot": null},
                {"id": 385, "name": "Shark", "quantity": 1, "ge_price": 1, "ha_price": 1, "equipment_slot": null}
            ]}
        }))
    }

    #[test]
    fn converts_every_section() {
        let sections = MemberSections::from_account(&full_account());
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
        assert_eq!(MemberSections::from_account(&account).coordinates, None);
    }

    #[test]
    fn special_world_only_updates_stats_and_location() {
        let mut account = full_account();
        account.special_world = Some(true);
        let sections = MemberSections::from_account(&account);
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
        assert!(MemberSections::from_account(&account).is_empty());
    }

    #[test]
    fn to_member_filters_sections() {
        let sections = MemberSections::from_account(&full_account());
        let member = sections.to_member(7, "Alpha Main", |section| section == Section::Stats);
        assert_eq!(member.group_id, Some(7));
        assert!(member.stats.is_some());
        assert!(member.coordinates.is_none());
        assert!(member.skills.is_none());
    }

    #[test]
    fn section_changed_detects_differences() {
        let before = MemberSections::from_account(&full_account());
        let mut account = full_account();
        account.location.as_mut().unwrap().x += 1;
        let after = MemberSections::from_account(&account);
        assert!(section_changed(None, &after, Section::Skills));
        assert!(section_changed(Some(&before), &after, Section::Coordinates));
        assert!(!section_changed(Some(&before), &after, Section::Skills));
    }
}
