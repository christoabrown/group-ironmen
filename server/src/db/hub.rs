//! What the hub sync reads and writes: which member is which hub account,
//! who is online, who is hidden.
use crate::error::ApiError;
use chrono::{DateTime, Utc};
use deadpool_postgres::Client;

/// A member row as seen by the hub sync.
pub(crate) struct HubMemberRow {
    pub member_name: String,
    pub hub_account_id: Option<String>,
    /// Hidden by an admin; the sync leaves it alone.
    pub hidden: bool,
}

fn hub_member_row(row: &tokio_postgres::Row) -> Result<HubMemberRow, ApiError> {
    Ok(HubMemberRow {
        member_name: row.try_get("member_name")?,
        hub_account_id: row.try_get("hub_account_id")?,
        hidden: row.try_get("hidden")?,
    })
}

pub(crate) async fn get_member_by_hub_id(
    client: &Client,
    group_id: i64,
    hub_account_id: &str,
) -> Result<Option<HubMemberRow>, ApiError> {
    let stmt = client
        .prepare_cached(
            "SELECT member_name::text, hub_account_id, hidden FROM groupironman.members \
             WHERE group_id=$1 AND hub_account_id=$2",
        )
        .await?;
    let row = client
        .query_opt(&stmt, &[&group_id, &hub_account_id])
        .await?;
    row.as_ref().map(hub_member_row).transpose()
}

/// Finds an existing member for a hub account that is not bound yet: first by
/// the plugin's account hash (stable across renames), then by name.
pub(crate) async fn find_member_for_hub_account(
    client: &Client,
    group_id: i64,
    account_hash: Option<&str>,
    name: &str,
) -> Result<Option<HubMemberRow>, ApiError> {
    if let Some(account_hash) = account_hash {
        let stmt = client
            .prepare_cached(
                "SELECT member_name::text, hub_account_id, hidden FROM groupironman.members \
                 WHERE group_id=$1 AND account_hash=$2 ORDER BY member_id LIMIT 1",
            )
            .await?;
        if let Some(row) = client.query_opt(&stmt, &[&group_id, &account_hash]).await? {
            return Ok(Some(hub_member_row(&row)?));
        }
    }
    let stmt = client
        .prepare_cached(
            "SELECT member_name::text, hub_account_id, hidden FROM groupironman.members \
             WHERE group_id=$1 AND member_name=$2",
        )
        .await?;
    let row = client.query_opt(&stmt, &[&group_id, &name]).await?;
    row.as_ref().map(hub_member_row).transpose()
}

/// Binds a hub account id to a member, taking it away from any other member first.
pub(crate) async fn bind_hub_account(
    client: &mut Client,
    group_id: i64,
    member_name: &str,
    hub_account_id: &str,
    account_hash: Option<&str>,
) -> Result<(), ApiError> {
    let transaction = client.transaction().await?;
    transaction
        .execute(
            "UPDATE groupironman.members SET hub_account_id=NULL \
             WHERE hub_account_id=$1 AND NOT (group_id=$2 AND member_name=$3)",
            &[&hub_account_id, &group_id, &member_name],
        )
        .await?;
    transaction
        .execute(
            "UPDATE groupironman.members SET hub_account_id=$3, \
             account_hash=COALESCE($4, account_hash), hub_orphaned_at=NULL \
             WHERE group_id=$1 AND member_name=$2",
            &[&group_id, &member_name, &hub_account_id, &account_hash],
        )
        .await?;
    transaction.commit().await?;
    Ok(())
}

/// Records whether the hub reports the member online, and when it was last seen.
pub(crate) async fn set_hub_presence(
    client: &Client,
    group_id: i64,
    member_name: &str,
    online: bool,
    last_seen: Option<DateTime<Utc>>,
) -> Result<(), ApiError> {
    let stmt = client
        .prepare_cached(
            "UPDATE groupironman.members SET hub_online=$3, \
             hub_last_seen=COALESCE($4, hub_last_seen, NOW()) \
             WHERE group_id=$1 AND member_name=$2",
        )
        .await?;
    client
        .execute(&stmt, &[&group_id, &member_name, &online, &last_seen])
        .await?;
    Ok(())
}

/// Hides a member from the map (and from the sync), or shows it again.
/// Returns whether the member exists.
pub async fn set_member_hidden(
    client: &Client,
    group_id: i64,
    member_name: &str,
    hidden: bool,
) -> Result<bool, ApiError> {
    let stmt = client
        .prepare_cached(
            "UPDATE groupironman.members SET hidden=$3 WHERE group_id=$1 AND member_name=$2",
        )
        .await?;
    Ok(client
        .execute(&stmt, &[&group_id, &member_name, &hidden])
        .await?
        > 0)
}

/// Renames a member that is bound to a hub account.
pub(crate) async fn rename_hub_member(
    client: &Client,
    group_id: i64,
    original_name: &str,
    new_name: &str,
) -> Result<(), ApiError> {
    client
        .execute(
            "UPDATE groupironman.members SET member_name=$3 WHERE group_id=$1 AND member_name=$2",
            &[&group_id, &original_name, &new_name],
        )
        .await?;
    Ok(())
}

/// Marks bound members whose hub account is no longer visible, and clears the
/// mark for those that are. Returns the number of orphaned members.
pub(crate) async fn mark_hub_orphans(
    client: &Client,
    group_id: i64,
    visible_ids: &[String],
) -> Result<i64, ApiError> {
    client
        .execute(
            "UPDATE groupironman.members SET hub_orphaned_at=NULL \
             WHERE group_id=$1 AND hub_account_id = ANY($2)",
            &[&group_id, &visible_ids],
        )
        .await?;
    client
        .execute(
            "UPDATE groupironman.members SET hub_orphaned_at=NOW(), hub_online=FALSE \
             WHERE group_id=$1 AND hub_account_id IS NOT NULL \
             AND NOT (hub_account_id = ANY($2)) AND hub_orphaned_at IS NULL",
            &[&group_id, &visible_ids],
        )
        .await?;
    let count: i64 = client
        .query_one(
            "SELECT COUNT(*) FROM groupironman.members \
             WHERE group_id=$1 AND hub_orphaned_at IS NOT NULL",
            &[&group_id],
        )
        .await?
        .try_get(0)?;
    Ok(count)
}

/// Member name, hub account id and hidden flag of every member bound to the hub.
pub(crate) async fn get_hub_bindings(
    client: &Client,
    group_id: i64,
) -> Result<Vec<(String, String, bool)>, ApiError> {
    let stmt = client
        .prepare_cached(
            "SELECT member_name::text, hub_account_id, hidden FROM groupironman.members \
             WHERE group_id=$1 AND hub_account_id IS NOT NULL",
        )
        .await?;
    let rows = client.query(&stmt, &[&group_id]).await?;
    rows.iter()
        .map(|row| Ok((row.try_get(0)?, row.try_get(1)?, row.try_get(2)?)))
        .collect()
}
