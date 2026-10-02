//! The schema. A database starts from the baseline below. What changes
//! after that is a migration of its own, added at the end of `update_schema`:
//! it runs once and then stays as it was written.
use crate::error::ApiError;
use deadpool_postgres::{Client, Transaction};

/// The schema of the Group Ironmen tracker the map began as, which earlier
/// versions of the map kept using. Its data is not carried over.
const OLD_SCHEMA: &str = "groupironman";

/// What the map keeps, as an empty database gets it. One installation is one
/// guild: there is no table of groups.
const BASELINE: &str = r#"
CREATE TABLE guildmap.members (
  member_id BIGSERIAL PRIMARY KEY,
  member_name CITEXT NOT NULL UNIQUE,
  -- Hidden by an admin: left off the map, and left alone by the sync.
  hidden BOOLEAN NOT NULL DEFAULT FALSE,

  -- The hub account this member is, and what the sync last saw of it.
  hub_account_id TEXT UNIQUE,
  account_hash TEXT,
  hub_online BOOLEAN NOT NULL DEFAULT FALSE,
  hub_last_seen TIMESTAMPTZ,
  hub_orphaned_at TIMESTAMPTZ,

  -- The member's data. A `_last_update` is when the map stored a new value;
  -- the update batcher sets it, there are no triggers.
  stats INTEGER[],
  stats_last_update TIMESTAMPTZ,
  coordinates INTEGER[],
  coordinates_last_update TIMESTAMPTZ,
  skills INTEGER[],
  skills_last_update TIMESTAMPTZ,
  inventory INTEGER[],
  inventory_last_update TIMESTAMPTZ,
  equipment INTEGER[],
  equipment_last_update TIMESTAMPTZ,
  hub_meta JSONB,
  hub_meta_last_update TIMESTAMPTZ
);
CREATE INDEX members_account_hash_idx ON guildmap.members (account_hash);

-- Skill history: a sample per hour, per day and per month. It goes with its member.
CREATE TABLE guildmap.skills_day (
  member_id BIGINT NOT NULL REFERENCES guildmap.members(member_id) ON DELETE CASCADE,
  time TIMESTAMPTZ NOT NULL,
  skills INTEGER[],
  PRIMARY KEY (member_id, time)
);
CREATE TABLE guildmap.skills_month (
  member_id BIGINT NOT NULL REFERENCES guildmap.members(member_id) ON DELETE CASCADE,
  time TIMESTAMPTZ NOT NULL,
  skills INTEGER[],
  PRIMARY KEY (member_id, time)
);
CREATE TABLE guildmap.skills_year (
  member_id BIGINT NOT NULL REFERENCES guildmap.members(member_id) ON DELETE CASCADE,
  time TIMESTAMPTZ NOT NULL,
  skills INTEGER[],
  PRIMARY KEY (member_id, time)
);
CREATE TABLE guildmap.aggregation_info (
  type TEXT PRIMARY KEY,
  last_aggregation TIMESTAMPTZ NOT NULL DEFAULT TIMESTAMP WITH TIME ZONE 'epoch'
);
INSERT INTO guildmap.aggregation_info (type) VALUES ('skills');

-- Who is signed in; see hub::members for who gets a session and keeps it.
CREATE TABLE guildmap.sessions (
  session_id TEXT PRIMARY KEY,
  discord_id TEXT NOT NULL,
  name TEXT NOT NULL,
  is_admin BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX sessions_discord_id_idx ON guildmap.sessions (discord_id);
"#;

async fn has_migration_run(client: &Client, name: &str) -> Result<bool, ApiError> {
    let count: i64 = client
        .query_one(
            "SELECT COUNT(*) FROM guildmap.migrations WHERE name=$1",
            &[&name],
        )
        .await?
        .try_get(0)?;
    Ok(count > 0)
}

async fn commit_migration(transaction: &Transaction<'_>, name: &str) -> Result<(), ApiError> {
    transaction
        .execute(
            "INSERT INTO guildmap.migrations (name, date) VALUES($1, NOW())",
            &[&name],
        )
        .await?;
    Ok(())
}

/// A database that an earlier version of the map used is left as it is: the
/// map neither converts nor drops it, and doesn't start next to it.
async fn refuse_old_schema(client: &Client) -> Result<(), ApiError> {
    let row = client
        .query_one(
            "SELECT to_regnamespace($1) IS NOT NULL, to_regclass('guildmap.members') IS NOT NULL",
            &[&OLD_SCHEMA],
        )
        .await?;
    let (has_old, has_new): (bool, bool) = (row.try_get(0)?, row.try_get(1)?);
    if has_old && !has_new {
        return Err(ApiError::Schema(format!(
            "This database has the schema of an earlier version of the map (`{OLD_SCHEMA}`), \
             which this version doesn't convert. Give the map an empty database, or drop the \
             old schema with `DROP SCHEMA {OLD_SCHEMA} CASCADE`: the players come back from the \
             hub. Players that were hidden have to be hidden again, and the skill history the \
             map kept itself is gone."
        )));
    }
    Ok(())
}

/// Brings the database up to date: the baseline on an empty one, then every
/// migration that hasn't run on it yet.
pub async fn update_schema(client: &mut Client) -> Result<(), ApiError> {
    refuse_old_schema(client).await?;
    client
        .batch_execute(
            r#"
CREATE EXTENSION IF NOT EXISTS citext;
CREATE SCHEMA IF NOT EXISTS guildmap;
CREATE TABLE IF NOT EXISTS guildmap.migrations (
  name TEXT PRIMARY KEY,
  date TIMESTAMPTZ NOT NULL
);
"#,
        )
        .await?;

    if !has_migration_run(client, "baseline").await? {
        let transaction = client.transaction().await?;
        transaction.batch_execute(BASELINE).await?;
        commit_migration(&transaction, "baseline").await?;
        transaction.commit().await?;
    }

    Ok(())
}
