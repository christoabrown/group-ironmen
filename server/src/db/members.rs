//! The members: the roster, and the data of each that the site polls for.
use crate::error::ApiError;
use crate::models::{MemberData, MembersResponse, PlayerInfo, RosterEntry};
use chrono::{DateTime, Utc};
use deadpool_postgres::Client;

/// Takes a member off the map, with the skill history kept of it. Returns
/// whether there was such a member.
pub(crate) async fn delete_member(client: &Client, member_name: &str) -> Result<bool, ApiError> {
    let stmt = client
        .prepare_cached("DELETE FROM guildmap.members WHERE member_name=$1")
        .await?;
    let deleted = client
        .execute(&stmt, &[&member_name])
        .await
        .map_err(ApiError::DeleteMemberError)?;
    Ok(deleted > 0)
}

/// A player counts as online while the hub says so and the sync has confirmed
/// it recently; if the sync stops (hub down), everyone goes offline.
pub(crate) const ONLINE_CONFIRMATION: &str = "interval '5 minutes'";

/// The member columns the sync fills, with their SQL types. Each has a
/// `<column>_last_update`: when the map stored a new value (see the update
/// batcher, which writes them in this order).
pub(crate) const MEMBER_COLUMNS: [(&str, &str); 6] = [
    ("stats", "int4[]"),
    ("coordinates", "int4[]"),
    ("skills", "int4[]"),
    ("inventory", "int4[]"),
    ("equipment", "int4[]"),
    ("hub_meta", "jsonb"),
];

/// SQL for when the newest of a member's data was stored.
fn last_updated_sql() -> String {
    let stamps: Vec<String> = MEMBER_COLUMNS
        .iter()
        .map(|(column, _)| format!("{column}_last_update"))
        .collect();
    format!("GREATEST({})", stamps.join(", "))
}

/// How far the returned cursor lags behind the database clock, so that updates
/// committed by a transaction that started just before the poll are not missed.
/// Re-sending them is harmless: the site merges by name.
const CURSOR_OVERLAP_MS: i64 = 2000;

/// The roster (every visible member with its presence) and the data of the
/// members that changed at or after `timestamp`.
pub async fn get_members(
    client: &Client,
    timestamp: &DateTime<Utc>,
) -> Result<MembersResponse, ApiError> {
    // Each column only when it changed since the timestamp.
    let changed: Vec<String> = MEMBER_COLUMNS
        .iter()
        .map(|(column, _)| {
            format!(
                "CASE WHEN {column}_last_update >= $1::TIMESTAMPTZ THEN {column} END AS {column}"
            )
        })
        .collect();
    let stmt = client
        .prepare_cached(&format!(
            r#"
SELECT member_name::text AS member_name, now() AS db_now,
(hub_online AND hub_last_seen > now() - {ONLINE_CONFIRMATION}) AS online,
hub_last_seen, hub_orphaned_at IS NOT NULL AS orphaned,
{last_updated} AS last_updated,
{changed}
FROM guildmap.members WHERE NOT hidden
ORDER BY member_name
"#,
            last_updated = last_updated_sql(),
            changed = changed.join(",\n"),
        ))
        .await?;

    let rows = client
        .query(&stmt, &[&timestamp])
        .await
        .map_err(ApiError::GetMembersError)?;
    let mut roster = Vec::with_capacity(rows.len());
    let mut members = Vec::new();
    let mut db_now: Option<DateTime<Utc>> = None;
    for row in rows {
        db_now = Some(row.try_get("db_now")?);
        let name: String = row.try_get("member_name")?;
        roster.push(RosterEntry {
            name: name.clone(),
            online: row.try_get("online")?,
            last_seen: row.try_get("hub_last_seen")?,
            orphaned: row.try_get("orphaned")?,
        });
        let last_updated: Option<DateTime<Utc>> = row.try_get("last_updated")?;
        if last_updated.is_none_or(|at| at < *timestamp) {
            continue;
        }
        members.push(MemberData {
            name,
            last_updated,
            stats: row.try_get("stats")?,
            coordinates: row.try_get("coordinates")?,
            skills: row.try_get("skills")?,
            inventory: row.try_get("inventory")?,
            equipment: row.try_get("equipment")?,
            meta: row.try_get("hub_meta")?,
        });
    }

    let now = match db_now {
        Some(now) => now,
        None => client.query_one("SELECT now()", &[]).await?.try_get(0)?,
    };
    Ok(MembersResponse {
        cursor: now - chrono::Duration::milliseconds(CURSOR_OVERLAP_MS),
        roster,
        members,
    })
}

pub async fn ensure_member_exists(client: &Client, member_name: &str) -> Result<(), ApiError> {
    let stmt = client
        .prepare_cached(
            "INSERT INTO guildmap.members (member_name) VALUES($1) ON CONFLICT (member_name) DO NOTHING",
        )
        .await?;
    client.execute(&stmt, &[&member_name]).await?;
    Ok(())
}

pub(crate) async fn list_players(client: &Client) -> Result<Vec<PlayerInfo>, ApiError> {
    let stmt = client
        .prepare_cached(&format!(
            r#"
SELECT member_name::text AS member_name,
{last_updated} as last_updated,
hub_account_id IS NOT NULL as hub_linked, hub_orphaned_at,
(hub_online AND hub_last_seen > now() - {ONLINE_CONFIRMATION}) AS online,
hub_last_seen, hidden
FROM guildmap.members
ORDER BY member_name
"#,
            last_updated = last_updated_sql(),
        ))
        .await?;
    let rows = client.query(&stmt, &[]).await?;
    let mut result = Vec::with_capacity(rows.len());
    for row in rows {
        result.push(PlayerInfo {
            member_name: row.try_get("member_name")?,
            last_updated: row.try_get("last_updated")?,
            hub_linked: row.try_get("hub_linked")?,
            hub_orphaned_at: row.try_get("hub_orphaned_at")?,
            online: row.try_get("online")?,
            last_seen: row.try_get("hub_last_seen")?,
            hidden: row.try_get("hidden")?,
        });
    }
    Ok(result)
}
