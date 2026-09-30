use crate::auth_middleware::SessionAuthenticated;
use crate::crypto::token_hash;
use crate::db;
use crate::error::ApiError;
use crate::hub::DirectSeen;
use crate::models::{GroupMember, IngestPayload, PairCodeResponse, PairRequest, PairResponse};
use crate::osrs::{equipment_slot_index, SKILL_ORDER};
use crate::token_lockout::TokenLockout;
use crate::validators::valid_name;
use actix_web::{post, web, Error, HttpRequest, HttpResponse};
use chrono::{Duration, Utc};
use deadpool_postgres::{Client, Pool};
use tokio::sync::mpsc;

const DEVICE_TOKEN_SALT: &str = "osrs-device";

fn generate_pairing_code() -> String {
    use rand::Rng;
    let mut rng = rand::rng();
    let code: u32 = rng.random_range(10000..100000);
    code.to_string()
}

#[post("/pair/code")]
pub async fn create_pairing_code(
    session: SessionAuthenticated,
    db_pool: web::Data<Pool>,
) -> Result<HttpResponse, Error> {
    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;

    // Clean up expired codes
    let _ = db::cleanup_expired_pairing_codes(&client).await;

    let code = generate_pairing_code();
    let expires_at = Utc::now() + Duration::seconds(300);

    db::store_pairing_code_for_user(
        &client,
        &code,
        session.group_id,
        session.user.user_id,
        &expires_at,
    )
    .await?;

    Ok(HttpResponse::Ok().json(PairCodeResponse {
        ok: true,
        code,
        expires_in: 300,
    }))
}

#[post("/osrs-data/pair")]
pub async fn pair_device(
    body: web::Json<PairRequest>,
    db_pool: web::Data<Pool>,
) -> Result<HttpResponse, Error> {
    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;

    let (group_id, user_id) = db::consume_pairing_code_with_user(&client, &body.code).await?;

    let device_id = uuid::Uuid::new_v4().hyphenated().to_string();
    let raw_token = uuid::Uuid::new_v4().hyphenated().to_string();
    let hashed_token = token_hash(&raw_token, DEVICE_TOKEN_SALT);

    db::store_device_for_user(&client, &device_id, group_id, user_id, &hashed_token).await?;

    Ok(HttpResponse::Ok().json(PairResponse {
        ok: true,
        device_id,
        token: raw_token,
    }))
}

// Maps RuneLite equipmentSlot string names to frontend EquipmentSlot indices
// (see site/src/player-equipment/player-equipment.js)
fn convert_ingest_to_group_member(payload: &IngestPayload, group_id: i64) -> GroupMember {
    let player = &payload.player;

    let coordinates = player
        .location
        .as_ref()
        .map(|loc| vec![loc.x, loc.y, loc.plane]);

    let world: i32 = player
        .world
        .as_ref()
        .and_then(|w| w.parse().ok())
        .unwrap_or(0);

    // Stats array layout expected by frontend (see transformStatsFromStorage):
    // [0] hitpoints.current, [1] hitpoints.max,
    // [2] prayer.current, [3] prayer.max,
    // [4] energy.current, [5] (unused), [6] world
    let stats = {
        let hp = player.health.as_ref();
        let pr = player.prayer_points.as_ref();
        if hp.is_some() || pr.is_some() || world != 0 {
            Some(vec![
                hp.map(|h| h.current).unwrap_or(0),
                hp.map(|h| h.max).unwrap_or(0),
                pr.map(|p| p.current).unwrap_or(0),
                pr.map(|p| p.max).unwrap_or(0),
                0,
                0,
                world,
            ])
        } else {
            None
        }
    };

    let skills = player.stats.as_ref().and_then(|stats| {
        stats.skills.as_ref().map(|skill_map| {
            SKILL_ORDER
                .iter()
                .map(|name| skill_map.get(*name).and_then(|s| s.xp).unwrap_or(0))
                .collect()
        })
    });

    let inventory = player.inventory.as_ref().and_then(|inv| {
        inv.items.as_ref().map(|items| {
            let mut flat = vec![0i32; 56]; // 28 slots × 2
            let has_slots = items.iter().any(|item| item.slot.is_some());

            if has_slots {
                for item in items {
                    if let Some(slot) = item.slot {
                        if slot < 28 {
                            flat[slot * 2] = item.id.unwrap_or(0);
                            flat[slot * 2 + 1] = item.quantity.unwrap_or(0);
                        }
                    }
                }
            } else {
                for (i, item) in items.iter().take(28).enumerate() {
                    flat[i * 2] = item.id.unwrap_or(0);
                    flat[i * 2 + 1] = item.quantity.unwrap_or(0);
                }
            }
            flat
        })
    });

    let equipment = player.equipment.as_ref().and_then(|eq| {
        eq.items.as_ref().map(|items| {
            let mut flat = vec![0i32; 28]; // 14 slots × 2

            for item in items {
                // Prefer equipmentSlot name mapping, fall back to numeric slot
                let slot_idx = item
                    .equipment_slot
                    .as_ref()
                    .and_then(|name| equipment_slot_index(name))
                    .or(item.slot);

                if let Some(slot) = slot_idx {
                    if slot < 14 {
                        flat[slot * 2] = item.id.unwrap_or(0);
                        flat[slot * 2 + 1] = item.quantity.unwrap_or(0);
                    }
                }
            }
            flat
        })
    });

    GroupMember {
        group_id: Some(group_id),
        name: player.name.clone(),
        stats,
        coordinates,
        skills,
        inventory,
        equipment,
        ..Default::default()
    }
}

#[post("/osrs-data/events")]
pub async fn ingest(
    req: HttpRequest,
    body: web::Json<IngestPayload>,
    db_pool: web::Data<Pool>,
    sender: web::Data<mpsc::Sender<GroupMember>>,
    lockout: web::Data<TokenLockout>,
    direct_seen: web::Data<DirectSeen>,
) -> Result<HttpResponse, Error> {
    let token = match req.headers().get("X-Osrs-Token") {
        Some(header) => match header.to_str() {
            Ok(t) => t,
            Err(_) => {
                return Ok(HttpResponse::BadRequest().body("Invalid X-Osrs-Token header"));
            }
        },
        None => {
            return Ok(HttpResponse::Unauthorized().body("X-Osrs-Token header required"));
        }
    };

    let hashed_token = token_hash(token, DEVICE_TOKEN_SALT);

    // Early deny: if this token was recently rejected, return 429 immediately
    // without touching the database.
    if let Some(remaining) = lockout.check_blocked(&hashed_token) {
        let retry_after = remaining.as_secs().max(1);
        return Ok(HttpResponse::TooManyRequests()
            .insert_header(("Retry-After", retry_after.to_string()))
            .body("Too many failed attempts. Try again later."));
    }

    let client: Client = db_pool.get().await.map_err(ApiError::PoolError)?;

    let group_id = match db::get_device_group(&client, &hashed_token).await {
        Ok(id) => id,
        Err(e @ ApiError::DeviceAuthError(_)) => {
            lockout.block(&hashed_token);
            return Err(e.into());
        }
        Err(e) => return Err(e.into()),
    };

    let player_name = &body.player.name;
    if !valid_name(player_name) {
        return Ok(HttpResponse::BadRequest().body(format!("Invalid player name: {}", player_name)));
    }

    db::ensure_member_exists(&client, group_id, player_name).await?;
    direct_seen.record(player_name);
    let account_hash = body
        .player
        .account_hash
        .as_deref()
        .filter(|hash| !hash.is_empty() && hash.len() <= 128);
    db::set_direct_source(&client, group_id, player_name, account_hash).await?;

    // Track user-player link
    if let Ok(Some(user_id)) = db::get_device_user_id(&client, &hashed_token).await {
        let _ = db::upsert_user_player_link(&client, user_id, player_name, group_id).await;
    }

    let group_member = convert_ingest_to_group_member(&body, group_id);

    match sender.send(group_member).await {
        Ok(_) => Ok(HttpResponse::Ok().json(serde_json::json!({"ok": true}))),
        Err(_) => Ok(HttpResponse::InternalServerError().body("Failed to submit player update")),
    }
}
