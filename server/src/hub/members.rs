//! Who may use the map. The map keeps no accounts of its own: someone signs
//! in with Discord, and the hub says whether that Discord account is a member
//! of the guild and whether it is an admin (`GET /members/{discord_id}`, hub
//! D-100, for service keys only).
//!
//! The hub is asked when someone signs in, and again every now and then for
//! as long as they have a session, by a background task: a request never
//! waits for the hub. Someone the hub no longer calls a member loses their
//! sessions; when the hub can't be asked, the sessions are left as they are.
use crate::db;
use crate::error::ApiError;
use crate::hub::client::{HubClient, HubError, Priority};
use crate::hub::models::HubMember;
use chrono::{Duration as ChronoDuration, Utc};
use deadpool_postgres::Pool;
use std::sync::Arc;
use std::time::Duration;

/// How often the sessions are looked through for ones to ask the hub about.
const SWEEP_INTERVAL: Duration = Duration::from_secs(60);
/// A session's member is asked about again this long after the last time.
const VERIFY_AFTER_MINUTES: i64 = 15;
/// Members asked about per sweep, so that it never takes much of the hub budget.
const SWEEP_MEMBERS: i64 = 50;

/// What the hub says of a Discord account. `HubError::NotFound` means the hub
/// has no such endpoint for this key: it is from before D-100, or the key is
/// a personal one.
pub async fn lookup(client: &Arc<HubClient>, discord_id: &str) -> Result<HubMember, HubError> {
    let path = format!("/members/{}", urlencoding::encode(discord_id));
    let (member, _) = client
        .get_data::<HubMember>(&path, &[], Priority::Interactive)
        .await?;
    Ok(member)
}

pub fn start(pool: Pool, client: Arc<HubClient>) {
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(SWEEP_INTERVAL).await;
            if let Err(err) = reverify_once(&pool, &client).await {
                log::warn!("Could not check the sessions against the hub: {}", err);
            }
        }
    });
}

/// Asks the hub about the members whose sessions weren't checked lately.
/// Returns how many were asked about. Public for the integration tests.
pub async fn reverify_once(pool: &Pool, client: &Arc<HubClient>) -> Result<usize, ApiError> {
    let due = {
        let db_client = pool.get().await?;
        db::cleanup_expired_sessions(&db_client).await?;
        let verified_before = Utc::now() - ChronoDuration::minutes(VERIFY_AFTER_MINUTES);
        db::sessions_to_verify(&db_client, &verified_before, SWEEP_MEMBERS).await?
        // The connection goes back to the pool: the hub may take its time.
    };
    let mut asked = 0;
    for discord_id in due {
        let member = match lookup(client, &discord_id).await {
            Ok(member) => member,
            Err(err) => {
                // Not an answer about anyone: the rest waits for the next sweep.
                log::warn!("The hub didn't say who is a member: {}", err);
                break;
            }
        };
        asked += 1;
        let db_client = pool.get().await?;
        if member.member {
            db::refresh_sessions(
                &db_client,
                &discord_id,
                member.name.as_deref(),
                member.is_admin,
            )
            .await?;
        } else {
            let ended = db::delete_sessions_of(&db_client, &discord_id).await?;
            log::info!(
                "Discord account {} is no longer a member on the hub: ended {} session(s)",
                discord_id,
                ended
            );
        }
    }
    Ok(asked)
}
