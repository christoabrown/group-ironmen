use lazy_static::lazy_static;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct CollectionLog {
    pub tab: i16,
    pub page_name: String,
    pub completion_counts: Vec<i32>,
    pub items: Vec<i32>,
    #[serde(skip_deserializing)]
    pub new_items: Vec<i32>,
}

#[derive(Serialize, Clone)]
pub struct CollectionLogInfo {
    #[serde(skip_serializing)]
    page_name_to_id_lookup: HashMap<String, i16>,
    #[serde(skip_serializing)]
    page_id_item_set_lookup: HashMap<i16, HashSet<i32>>,
    #[serde(skip_serializing)]
    item_name_to_id_lookup: HashMap<String, i32>,
    #[serde(skip_serializing)]
    item_id_to_page_id_lookup: HashMap<i32, HashSet<i16>>,
}

#[derive(Deserialize)]
pub struct CollectionLogItemInfo {
    pub id: i32,
    pub name: String,
}

#[derive(Deserialize)]
pub struct CollectionLogPageInfo {
    pub name: String,
    pub items: Vec<CollectionLogItemInfo>,
}

#[allow(non_snake_case)]
#[derive(Deserialize)]
pub struct CollectionLogTabInfo {
    pub tabId: i16,
    pub pages: Vec<CollectionLogPageInfo>,
}

impl CollectionLogInfo {
    pub fn new(pages_db: Vec<(i16, i16, String)>) -> Self {
        let mut page_name_to_id_lookup = HashMap::new();
        for page in &pages_db {
            page_name_to_id_lookup.insert(page.2.clone(), page.1);
        }

        let mut item_id_to_page_id_lookup = HashMap::new();
        let mut item_name_to_id_lookup = HashMap::new();
        let mut page_id_item_set_lookup = HashMap::new();
        for tab in COLLECTION_LOG_INFO.iter() {
            for page in tab.pages.iter() {
                let page_id = page_name_to_id_lookup.get(&page.name).unwrap();
                if !page_id_item_set_lookup.contains_key(page_id) {
                    page_id_item_set_lookup.insert(*page_id, HashSet::new());
                }

                for item in page.items.iter() {
                    item_name_to_id_lookup.insert(item.name.clone(), item.id);

                    match page_id_item_set_lookup.get_mut(&page_id) {
                        Some(x) => x.insert(item.id),
                        None => true,
                    };

                    if !item_id_to_page_id_lookup.contains_key(&item.id) {
                        item_id_to_page_id_lookup.insert(item.id, HashSet::new());
                    }

                    match item_id_to_page_id_lookup.get_mut(&item.id) {
                        Some(x) => x.insert(*page_id),
                        None => true,
                    };
                }
            }
        }

        Self {
            page_name_to_id_lookup,
            page_id_item_set_lookup,
            item_name_to_id_lookup,
            item_id_to_page_id_lookup,
        }
    }

    pub fn page_name_to_id(&self, page_name: &String) -> Option<&i16> {
        match self.page_name_to_id_lookup.get(page_name) {
            Some(x) => Some(x),
            None => match COLLECTION_PAGE_REMAP.get(page_name) {
                Some(x) => self.page_name_to_id_lookup.get(x),
                None => None,
            },
        }
    }

    pub fn has_item(&self, page_id: i16, item_id: i32) -> bool {
        match self.page_id_item_set_lookup.get(&page_id) {
            None => false,
            Some(x) => x.contains(&item_id),
        }
    }

    pub fn remap_item_id(&self, item_id: i32) -> i32 {
        match COLLECTION_ITEM_ID_REMAP.get(&item_id) {
            Some(x) => *x,
            None => item_id,
        }
    }

    pub fn item_name_to_id(&self, item_name: &String) -> Option<&i32> {
        match self.item_name_to_id_lookup.get(item_name) {
            Some(x) => Some(x),
            None => match COLLECTION_ITEM_REMAP.get(item_name) {
                Some(x) => self.item_name_to_id_lookup.get(x),
                None => None,
            },
        }
    }

    pub fn page_ids_for_item(&self, item_id: i32) -> Option<&HashSet<i16>> {
        self.item_id_to_page_id_lookup.get(&item_id)
    }

    pub fn number_of_items_in_page(&self, page_id: i16) -> usize {
        match self.page_id_item_set_lookup.get(&page_id) {
            None => 0,
            Some(x) => x.len(),
        }
    }
}

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

    pub static ref COLLECTION_LOG_INFO: Vec<CollectionLogTabInfo> = {
        serde_json::from_str(&COLLECTION_LOG_DATA).unwrap()
    };
}
