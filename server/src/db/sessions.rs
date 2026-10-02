//! The sessions of who is signed in (see `hub::members` for who gets one).
use crate::error::ApiError;
use crate::models::Session;
use chrono::{DateTime, Utc};
use deadpool_postgres::Client;

/// Starts a session for someone the hub just called a member.
pub(crate) async fn create_session(
    client: &Client,
    session_id: &str,
    session: &Session,
    expires_at: &DateTime<Utc>,
) -> Result<(), ApiError> {
    let stmt = client
        .prepare_cached(
            "INSERT INTO guildmap.sessions (session_id, discord_id, name, is_admin, expires_at) \
             VALUES($1, $2, $3, $4, $5)",
        )
        .await?;
    client
        .execute(
            &stmt,
            &[
                &session_id,
                &session.discord_id,
                &session.name,
                &session.is_admin,
                expires_at,
            ],
        )
        .await?;
    Ok(())
}

/// Whose session this is; `Unauthorized` when there is none or it has run out.
pub(crate) async fn get_session(client: &Client, session_id: &str) -> Result<Session, ApiError> {
    let stmt = client
        .prepare_cached(
            "SELECT discord_id, name, is_admin FROM guildmap.sessions \
             WHERE session_id=$1 AND expires_at > NOW()",
        )
        .await?;
    let row = client
        .query_opt(&stmt, &[&session_id])
        .await?
        .ok_or(ApiError::Unauthorized)?;
    Ok(Session {
        discord_id: row.try_get(0)?,
        name: row.try_get(1)?,
        is_admin: row.try_get(2)?,
    })
}

pub(crate) async fn delete_session(client: &Client, session_id: &str) -> Result<(), ApiError> {
    let stmt = client
        .prepare_cached("DELETE FROM guildmap.sessions WHERE session_id=$1")
        .await?;
    client.execute(&stmt, &[&session_id]).await?;
    Ok(())
}

pub(crate) async fn cleanup_expired_sessions(client: &Client) -> Result<(), ApiError> {
    let stmt = client
        .prepare_cached("DELETE FROM guildmap.sessions WHERE expires_at <= NOW()")
        .await?;
    client.execute(&stmt, &[]).await?;
    Ok(())
}

/// The Discord ids with a session the hub was last asked about before
/// `verified_before`, longest ago first, at most `limit` of them.
pub(crate) async fn sessions_to_verify(
    client: &Client,
    verified_before: &DateTime<Utc>,
    limit: i64,
) -> Result<Vec<String>, ApiError> {
    let stmt = client
        .prepare_cached(
            "SELECT discord_id FROM guildmap.sessions WHERE expires_at > NOW() \
             GROUP BY discord_id HAVING MIN(verified_at) < $1 \
             ORDER BY MIN(verified_at) LIMIT $2",
        )
        .await?;
    let rows = client.query(&stmt, &[verified_before, &limit]).await?;
    rows.iter().map(|row| Ok(row.try_get(0)?)).collect()
}

/// Notes what the hub says of a member now on every session they have.
pub(crate) async fn refresh_sessions(
    client: &Client,
    discord_id: &str,
    name: Option<&str>,
    is_admin: bool,
) -> Result<(), ApiError> {
    let stmt = client
        .prepare_cached(
            "UPDATE guildmap.sessions SET name=COALESCE($2, name), is_admin=$3, \
             verified_at=NOW() WHERE discord_id=$1",
        )
        .await?;
    client
        .execute(&stmt, &[&discord_id, &name, &is_admin])
        .await?;
    Ok(())
}

/// Ends every session of someone who is no longer a member. Returns how many.
pub(crate) async fn delete_sessions_of(client: &Client, discord_id: &str) -> Result<u64, ApiError> {
    let stmt = client
        .prepare_cached("DELETE FROM guildmap.sessions WHERE discord_id=$1")
        .await?;
    Ok(client.execute(&stmt, &[&discord_id]).await?)
}
