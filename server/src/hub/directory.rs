//! Which hub account belongs to which member, kept in memory so the history
//! endpoints don't query the database on every request. Loaded at start-up and
//! kept current by the sync (binds, renames) and by admin actions (delete,
//! hide).
use crate::db;
use crate::error::ApiError;
use deadpool_postgres::Client;
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, RwLock};

#[derive(Default)]
struct Bindings {
    name_by_id: HashMap<String, String>,
    id_by_name: HashMap<String, String>,
    /// Hub accounts of members an admin hid.
    hidden: HashSet<String>,
}

#[derive(Clone, Default)]
pub struct HubDirectory(Arc<RwLock<Bindings>>);

impl HubDirectory {
    pub async fn load(client: &Client, group_id: i64) -> Result<Self, ApiError> {
        let directory = HubDirectory::default();
        for (name, id, hidden) in db::get_hub_bindings(client, group_id).await? {
            directory.set_hidden(&id, hidden);
            if !hidden {
                directory.bind(&id, &name);
            }
        }
        Ok(directory)
    }

    /// Binds a hub account to a member, replacing earlier bindings of either.
    pub(crate) fn bind(&self, hub_id: &str, member_name: &str) {
        let mut bindings = self.0.write().expect("hub directory lock poisoned");
        if let Some(old_name) = bindings.name_by_id.remove(hub_id) {
            bindings.id_by_name.remove(&old_name.to_lowercase());
        }
        if let Some(old_id) = bindings.id_by_name.remove(&member_name.to_lowercase()) {
            bindings.name_by_id.remove(&old_id);
        }
        bindings
            .name_by_id
            .insert(hub_id.to_owned(), member_name.to_owned());
        bindings
            .id_by_name
            .insert(member_name.to_lowercase(), hub_id.to_owned());
    }

    /// Forgets a member (deleted or hidden).
    pub(crate) fn remove_member(&self, member_name: &str) {
        let mut bindings = self.0.write().expect("hub directory lock poisoned");
        if let Some(id) = bindings.id_by_name.remove(&member_name.to_lowercase()) {
            bindings.name_by_id.remove(&id);
        }
    }

    /// Records whether the member of a hub account is hidden.
    pub(crate) fn set_hidden(&self, hub_id: &str, hidden: bool) {
        let mut bindings = self.0.write().expect("hub directory lock poisoned");
        if hidden {
            bindings.hidden.insert(hub_id.to_owned());
        } else {
            bindings.hidden.remove(hub_id);
        }
    }

    /// Whether the member of a hub account is hidden (its events and
    /// leaderboard entries are left out too).
    pub fn is_hidden(&self, hub_id: &str) -> bool {
        self.0
            .read()
            .expect("hub directory lock poisoned")
            .hidden
            .contains(hub_id)
    }

    /// The member name for a hub account.
    pub(crate) fn member_name(&self, hub_id: &str) -> Option<String> {
        self.0
            .read()
            .expect("hub directory lock poisoned")
            .name_by_id
            .get(hub_id)
            .cloned()
    }

    /// The hub account of a member, case-insensitively.
    pub fn hub_id(&self, member_name: &str) -> Option<String> {
        self.0
            .read()
            .expect("hub directory lock poisoned")
            .id_by_name
            .get(&member_name.to_lowercase())
            .cloned()
    }

    /// Every binding as `(member name, hub id)`.
    pub(crate) fn bindings(&self) -> Vec<(String, String)> {
        self.0
            .read()
            .expect("hub directory lock poisoned")
            .name_by_id
            .iter()
            .map(|(id, name)| (name.clone(), id.clone()))
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn follows_binds_renames_and_removals() {
        let directory = HubDirectory::default();
        directory.bind("acc-1", "Alpha");
        directory.bind("acc-2", "Bravo");
        assert_eq!(directory.hub_id("ALPHA").as_deref(), Some("acc-1"));
        assert_eq!(directory.member_name("acc-2").as_deref(), Some("Bravo"));

        // A rename rebinds the account to the new name.
        directory.bind("acc-1", "Alpha Two");
        assert_eq!(directory.hub_id("Alpha"), None);
        assert_eq!(directory.member_name("acc-1").as_deref(), Some("Alpha Two"));

        // Binding a name to another account drops the old account's binding.
        directory.bind("acc-3", "Bravo");
        assert_eq!(directory.member_name("acc-2"), None);

        directory.remove_member("alpha two");
        assert_eq!(directory.member_name("acc-1"), None);
        assert_eq!(directory.bindings().len(), 1);

        directory.set_hidden("acc-3", true);
        assert!(directory.is_hidden("acc-3"));
        directory.set_hidden("acc-3", false);
        assert!(!directory.is_hidden("acc-3"));
    }
}
