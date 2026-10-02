//! OSRS data layouts: the order of skills and of the slots of an inventory and of worn gear.

// Must match the iteration order of SkillName in site/src/data/skill.js
// (Object.keys order, excluding Overall)
pub(crate) const SKILL_ORDER: &[&str] = &[
    "Agility",
    "Attack",
    "Construction",
    "Cooking",
    "Crafting",
    "Defence",
    "Farming",
    "Firemaking",
    "Fishing",
    "Fletching",
    "Herblore",
    "Hitpoints",
    "Hunter",
    "Magic",
    "Mining",
    "Prayer",
    "Ranged",
    "Runecraft",
    "Slayer",
    "Smithing",
    "Strength",
    "Thieving",
    "Woodcutting",
    "Sailing",
];

/// Maps a RuneLite `EquipmentInventorySlot` name to its index in the 14-slot
/// equipment array the site expects.
pub(crate) fn equipment_slot_index(slot_name: &str) -> Option<usize> {
    match slot_name {
        "HEAD" => Some(0),
        "CAPE" => Some(1),
        "AMULET" => Some(2),
        "WEAPON" => Some(3),
        "BODY" => Some(4),
        "SHIELD" => Some(5),
        "LEGS" => Some(7),
        "GLOVES" => Some(9),
        "BOOTS" => Some(10),
        "RING" => Some(12),
        "AMMO" => Some(13),
        _ => None,
    }
}

/// Index of a skill name in [`SKILL_ORDER`], ignoring case.
pub(crate) fn skill_index(name: &str) -> Option<usize> {
    SKILL_ORDER
        .iter()
        .position(|skill| skill.eq_ignore_ascii_case(name))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn skill_order_has_every_skill_once() {
        assert_eq!(SKILL_ORDER.len(), 24);
        let unique: std::collections::HashSet<_> = SKILL_ORDER.iter().collect();
        assert_eq!(unique.len(), SKILL_ORDER.len());
    }

    #[test]
    fn skill_index_is_case_insensitive() {
        assert_eq!(skill_index("Agility"), Some(0));
        assert_eq!(skill_index("sailing"), Some(23));
        assert_eq!(skill_index("Overall"), None);
    }

    #[test]
    fn equipment_slots_map_to_site_indices() {
        assert_eq!(equipment_slot_index("HEAD"), Some(0));
        assert_eq!(equipment_slot_index("AMMO"), Some(13));
        assert_eq!(equipment_slot_index("NOPE"), None);
    }
}
