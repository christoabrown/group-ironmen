use lazy_static::lazy_static;
use std::collections::HashMap;

lazy_static! {
    // Seems runelite plugins can rename the value we pass for the page. This remaps
    // known plugin boss renaming. Is there a better way to handle this?
    pub static ref COLLECTION_PAGE_REMAP: HashMap<String, String> = HashMap::from([
        ("The Grumbler".to_string(), "Phantom Muspah".to_string())
    ]);

    pub static ref COLLECTION_ITEM_REMAP: HashMap<String, String> = HashMap::from([
        ("Pharaoh's sceptre".to_string(), "Pharaoh's sceptre (uncharged)".to_string())
    ]);

    pub static ref COLLECTION_ITEM_ID_REMAP: HashMap<i32, i32> = HashMap::from([
        (25627, 12019), // coal bag
        (25628, 12020), // gem bag
        (25629, 24882), // plank sack
        (25617, 10859), // tea flask
        (25618, 10877), // plain satchel
        (25619, 10878), // green satchel
        (25620, 10879), // red satchel
        (25621, 10880), // black stachel
        (25622, 10881), // gold satchel
        (25623, 10882), // rune satchel
        (25624, 13273), // unsired pet
        (25630, 12854), // Flamtaer bag
        (29992, 29990), // Alchemist's amulet
        (30805, 30803), // Dossier
    ]);

    pub static ref COLLECTION_LOG_DATA: String = {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/collection_log_info.json");
        std::fs::read_to_string(path).expect(&format!("Could not read collection log info file at {}", path))
    };
}
