//! Mirrors the hub's `/api/v1/snapshot` into the members table.
//!
//! - Polls with `since` and `If-None-Match`, and fetches the full snapshot at
//!   start-up and every `full_refresh_secs` to notice accounts that left the
//!   key's reach (they are marked orphaned, never deleted).
//! - Sections that changed since they were last sent go to the batcher, whether
//!   the account is online or not; the batcher stamps what really changed.
//! - Presence (online, last seen) is written separately: when it flips, and
//!   otherwise at most once a minute per account.
//! - Members an admin hid are left alone.
use crate::config::HubConfig;
use crate::db;
use crate::error::ApiError;
use crate::hub::client::{Fetched, HubClient, HubError, Priority};
use crate::hub::convert::{section_changed, MemberSections, SECTIONS};
use crate::hub::directory::HubDirectory;
use crate::hub::models::HubAccount;
use crate::hub::{record_error, SharedHubStatus};
use crate::models::GroupMember;
use crate::validators::valid_name;
use chrono::Utc;
use deadpool_postgres::{Client, Pool};
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::sync::mpsc;

const UNAUTHORIZED_RETRY: Duration = Duration::from_secs(300);
const MAX_BACKOFF: Duration = Duration::from_secs(60);
/// How often an unchanged presence is written again, which keeps `hub_last_seen`
/// fresh enough for the site's five-minute online check.
const PRESENCE_REFRESH: Duration = Duration::from_secs(60);

pub struct SyncContext {
    pub pool: Pool,
    pub client: Arc<HubClient>,
    pub sender: mpsc::Sender<GroupMember>,
    pub group_id: i64,
    pub config: HubConfig,
    pub status: SharedHubStatus,
    pub directory: HubDirectory,
    pub control: SyncControl,
}

/// Lets admin actions tell the running sync to forget what it knows about a
/// member, so that the next poll resolves it again from the database.
#[derive(Clone, Default)]
pub struct SyncControl(Arc<Mutex<Vec<String>>>);

impl SyncControl {
    /// Called after a member was deleted, hidden or shown again.
    pub fn forget_member(&self, member_name: &str) {
        self.0
            .lock()
            .expect("sync control lock poisoned")
            .push(member_name.to_lowercase());
    }

    fn take(&self) -> Vec<String> {
        std::mem::take(&mut *self.0.lock().expect("sync control lock poisoned"))
    }
}

/// What the sync remembers about a hub account between polls.
struct KnownAccount {
    member_name: String,
    hidden: bool,
    /// The sections last sent to the batcher.
    sent: Option<MemberSections>,
    /// The presence last written, and when.
    presence: Option<(bool, Instant)>,
}

pub fn start(context: SyncContext) {
    tokio::spawn(async move {
        let mut sync = HubSync::new(context);
        sync.run().await;
    });
}

pub struct HubSync {
    context: SyncContext,
    known: HashMap<String, KnownAccount>,
    invalid_names: HashSet<String>,
    etag: Option<String>,
    since: Option<String>,
    last_full: Option<Instant>,
    failures: u32,
}

impl HubSync {
    pub fn new(context: SyncContext) -> Self {
        HubSync {
            context,
            known: HashMap::new(),
            invalid_names: HashSet::new(),
            etag: None,
            since: None,
            last_full: None,
            failures: 0,
        }
    }

    async fn run(&mut self) {
        log::info!(
            "Hub sync started: polling {} every {}s",
            self.context.config.base_url,
            self.context.config.poll_interval_secs
        );
        let poll_interval = Duration::from_secs(self.context.config.poll_interval_secs);
        loop {
            let wait = match self.poll_once().await {
                Ok(()) => {
                    self.failures = 0;
                    poll_interval
                }
                Err(err) => {
                    self.failures += 1;
                    let wait = match &err {
                        HubError::Unauthorized => UNAUTHORIZED_RETRY,
                        HubError::RateLimited(after) => (*after).max(poll_interval),
                        _ => backoff(self.failures),
                    };
                    log::warn!("Hub sync failed ({}), retrying in {}s", err, wait.as_secs());
                    record_error(&self.context.status, err.to_string());
                    wait
                }
            };
            tokio::time::sleep(wait).await;
        }
    }

    /// Drops what the sync knows about members an admin changed; a full
    /// snapshot then sends their accounts again.
    fn apply_control(&mut self) {
        let forgotten = self.context.control.take();
        if forgotten.is_empty() {
            return;
        }
        self.known
            .retain(|_, known| !forgotten.contains(&known.member_name.to_lowercase()));
        self.last_full = None;
    }

    /// One poll of the snapshot. Public for the integration tests.
    pub async fn poll_once(&mut self) -> Result<(), HubError> {
        self.apply_control();
        let full = self.last_full.is_none_or(|at| {
            at.elapsed() >= Duration::from_secs(self.context.config.full_refresh_secs)
        });
        let mut query = Vec::new();
        if !full {
            if let Some(since) = &self.since {
                query.push(("since", since.clone()));
            }
        }
        let if_none_match = if full { None } else { self.etag.clone() };

        let fetched = self
            .context
            .client
            .get::<Vec<HubAccount>>("/snapshot", &query, if_none_match, Priority::Sync)
            .await?;

        match fetched {
            Fetched::NotModified => {}
            Fetched::Ok { data, meta, etag } => {
                self.process(&data, full)
                    .await
                    .map_err(|err| HubError::Other(format!("storing hub data failed: {}", err)))?;
                self.etag = etag;
                if meta.last_modified.is_some() {
                    self.since = meta.last_modified;
                }
                if full {
                    self.last_full = Some(Instant::now());
                }
            }
        }

        if let Ok(mut status) = self.context.status.write() {
            status.last_success = Some(Utc::now());
            status.consecutive_failures = 0;
            if full {
                status.last_full_sync = Some(Utc::now());
            }
        }
        Ok(())
    }

    async fn process(&mut self, accounts: &[HubAccount], full: bool) -> Result<(), ApiError> {
        let mut client = self.context.pool.get().await?;
        let mut online = 0;
        for account in accounts {
            if account.online == Some(true) {
                online += 1;
            }
            if let Err(err) = self.process_account(&mut client, account).await {
                log::warn!("Hub sync skipped account {}: {}", account.name, err);
            }
        }

        if full {
            let visible: Vec<String> = accounts.iter().map(|a| a.id.clone()).collect();
            let visible_set: HashSet<&String> = visible.iter().collect();
            self.known.retain(|id, _| visible_set.contains(id));
            let orphaned = db::mark_hub_orphans(&client, self.context.group_id, &visible).await?;
            if let Ok(mut status) = self.context.status.write() {
                status.accounts_visible = accounts.len();
                status.accounts_online = online;
                status.members_orphaned = orphaned;
            }
        }
        Ok(())
    }

    async fn process_account(
        &mut self,
        client: &mut Client,
        account: &HubAccount,
    ) -> Result<(), ApiError> {
        if !valid_name(&account.name) {
            if self.invalid_names.insert(account.name.clone()) {
                log::warn!(
                    "Hub account '{}' has a name the map cannot store",
                    account.name
                );
            }
            return Ok(());
        }

        let group_id = self.context.group_id;
        let directory = &self.context.directory;
        if !self.known.contains_key(&account.id) {
            let known = resolve_member(client, group_id, account).await?;
            directory.set_hidden(&account.id, known.hidden);
            if known.hidden {
                directory.remove_member(&known.member_name);
            } else {
                directory.bind(&account.id, &known.member_name);
            }
            self.known.insert(account.id.clone(), known);
        }
        let known = self.known.get_mut(&account.id).expect("inserted above");
        if known.hidden {
            return Ok(());
        }

        if known.member_name != account.name {
            known.member_name =
                follow_rename(client, group_id, account, &known.member_name).await?;
            directory.bind(&account.id, &known.member_name);
            // A new name has no data on the site yet; send everything again.
            known.sent = None;
        }

        let sections = MemberSections::from_account(account, known.sent.as_ref());
        let changed: Vec<_> = SECTIONS
            .into_iter()
            .filter(|section| section_changed(known.sent.as_ref(), &sections, *section))
            .collect();
        if !changed.is_empty() {
            let member = sections.to_member(group_id, &known.member_name, |section| {
                changed.contains(&section)
            });
            if self.context.sender.send(member).await.is_err() {
                return Err(ApiError::HubError("update channel closed".to_string()));
            }
            known.sent = Some(sections);
        }

        let online = account
            .online
            .unwrap_or_else(|| account.location.as_ref().is_some_and(|l| !l.stale));
        let write_presence = match known.presence {
            None => true,
            Some((was_online, at)) => was_online != online || at.elapsed() >= PRESENCE_REFRESH,
        };
        if write_presence {
            db::set_hub_presence(
                client,
                group_id,
                &known.member_name,
                online,
                account.last_seen,
            )
            .await?;
            known.presence = Some((online, Instant::now()));
        }
        Ok(())
    }
}

/// Finds or creates the member for a hub account and binds the account to it.
async fn resolve_member(
    client: &mut Client,
    group_id: i64,
    account: &HubAccount,
) -> Result<KnownAccount, ApiError> {
    let known = |member_name: String, hidden: bool| KnownAccount {
        member_name,
        hidden,
        sent: None,
        presence: None,
    };
    if let Some(row) = db::get_member_by_hub_id(client, group_id, &account.id).await? {
        return Ok(known(row.member_name, row.hidden));
    }

    let existing = db::find_member_for_hub_account(
        client,
        group_id,
        account.account_hash.as_deref(),
        &account.name,
    )
    .await?;
    let (member_name, hidden) = match existing {
        Some(row) => {
            if let Some(other) = &row.hub_account_id {
                log::warn!(
                    "Member '{}' was bound to hub account {}; rebinding it to {}",
                    row.member_name,
                    other,
                    account.id
                );
            }
            (row.member_name, row.hidden)
        }
        None => {
            db::ensure_member_exists(client, group_id, &account.name).await?;
            (account.name.clone(), false)
        }
    };
    db::bind_hub_account(
        client,
        group_id,
        &member_name,
        &account.id,
        account.account_hash.as_deref(),
    )
    .await?;
    Ok(known(member_name, hidden))
}

/// Follows a rename on the hub. Returns the member name to use from now on.
async fn follow_rename(
    client: &mut Client,
    group_id: i64,
    account: &HubAccount,
    current_name: &str,
) -> Result<String, ApiError> {
    let taken = db::find_member_for_hub_account(client, group_id, None, &account.name).await?;
    match taken {
        Some(row) if !row.member_name.eq_ignore_ascii_case(current_name) => {
            log::warn!(
                "Hub account {} was renamed from '{}' to '{}', which already exists; \
                 binding the account to the existing member. '{}' can be deleted by an admin.",
                account.id,
                current_name,
                account.name,
                current_name
            );
            db::bind_hub_account(
                client,
                group_id,
                &row.member_name,
                &account.id,
                account.account_hash.as_deref(),
            )
            .await?;
            Ok(row.member_name)
        }
        _ => {
            log::info!(
                "Hub account {} was renamed from '{}' to '{}'",
                account.id,
                current_name,
                account.name
            );
            db::rename_hub_member(client, group_id, current_name, &account.name).await?;
            Ok(account.name.clone())
        }
    }
}

fn backoff(failures: u32) -> Duration {
    let base = Duration::from_secs(2u64.saturating_pow(failures.min(6)));
    let jitter = Duration::from_millis(rand::random::<u64>() % 1000);
    base.min(MAX_BACKOFF) + jitter
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn backoff_grows_and_is_capped() {
        assert!(backoff(1) < Duration::from_secs(4));
        assert!(backoff(3) >= Duration::from_secs(8));
        assert!(backoff(20) <= MAX_BACKOFF + Duration::from_secs(1));
    }

    #[test]
    fn control_hands_over_forgotten_members_once() {
        let control = SyncControl::default();
        control.forget_member("Alpha");
        assert_eq!(control.take(), vec!["alpha".to_string()]);
        assert!(control.take().is_empty());
    }
}
