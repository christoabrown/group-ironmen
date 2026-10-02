# What the guild map uses from osrs-data-hub

The map reads everything through the hub's `/api/v1` with one key, server-side; browsers never see it.
The consumer code is in `server/src/hub/`, and `tools/mock-hub/server.js` imitates the endpoints below
for local development.

## Endpoints

| Hub endpoint | Map use | Cached |
|---|---|---|
| `GET /me` | Key kind, rate limit and bulk size at start-up; admin "Test connection" | – |
| `GET /members/{discord_id}` | Who may log in, and who is an admin: asked when someone logs in with Discord, and again every 15 min per person with a session (at most 50 a minute). `member: false` ends their sessions; no answer leaves them. Service keys only: with a personal key, or a hub from before D-100, it is a 404 and nobody can log in | – |
| `GET /snapshot?since=` (ETag) | Mirrored into the members table every 5 s, full refresh every 2 min | – |
| `GET /events?cursor=` | One follower every 5 s into a 1000-event buffer: the Clan feed, the events on the map and its toasts | – |
| `GET /xp?accounts=` (≤50) | Graphs | 5 min |
| `GET /leaderboards/gains` | Clan page, the graphs' default players | 5 min |
| `GET /leaderboards/loot` | Clan page "Biggest drops" (falls back to the event buffer on older hubs) | 1 min |
| `GET /locations?accounts=` (≤50) | Trails of up to 8 players at once (one-by-one when one isn't shared). Each point's `world` and `is_on_boat` are passed on; a long trail is thinned to 3000 points, keeping both sides of every teleport, boat or world change and gap | 1 min |
| `GET /accounts/{id}/gains` | Profile → Gains | 2 min |
| `GET /accounts/{id}/sessions` | Profile → Activity (play time) | 1 min |
| `GET /accounts/{id}/wealth` | Profile → Wealth | 5 min |
| `GET /accounts/{id}/equipment-history` | Profile → Gear | 2 min |
| `GET /events?accounts=` | Profile → Activity (a player's recent events) | 30 s |
| `GET /events?accounts=&from=` | The events marked on a trail, over its length: pages of 500, newest first, until `next_cursor` is null or 2000 events. When the map leaves out small drops, drops (`types=loot,pk_loot&min_value=`, from the smallest drop the map shows) are read apart from the other kinds, so a trail costs 2 to 8 requests; with every drop shown it is one read of all kinds, 1 to 4 requests. The site asks once per trail and again every 10 min. A hub from before D-98 ignores `from` and hands back a feed cursor; the backend then keeps that one page | 2 min |

## Snapshot fields

`id`, `name`, `account_hash` (matching existing members),
`online`, `last_seen`, `world`, `special_world`, `hp`, `prayer`, `location`, `skills`, `inventory`,
`equipment`, plus the display details stored as `hub_meta`: `type`/`type_label`, `owner.name`,
`categories`, `skills.total_level`/`overall_xp`, `inventory.value`/`equipment.value`, `spellbook`,
`game_state` and `location.is_on_boat`.

Presence comes from `online` and `last_seen`. `game_state` is shown as a detail only: the hub doesn't
clear it when an account times out.

## Categories

A player who hasn't changed the hub's defaults shares `stats`, `events`, `activity` and `location_live`
with the guild. `inventory`, `equipment` and `location_history` are private by default, so their profile
tabs and trails show "not shared". The map reads `categories` to tell "not shared" from "empty".

## Hub changes made for the map

| Change | Hub decision | Where |
|---|---|---|
| Service keys owned by the guild | D-88, D-89 | osrs-data-hub PR #8 |
| `owner {name, discord_id}` | D-90 | PR #8 |
| `account_hash` for service keys | D-91 | PR #8 |
| Bulk `/xp` and `/locations` for 50 accounts | D-92 | PR #8 |
| `inventory_slot` on items | D-86 | earlier |
| `game_state` on `/snapshot` | D-94 | osrs-data-hub PRs #13 and #16 |
| `GET /leaderboards/loot` | D-94 | PRs #13 and #16 |
| `from`/`to` on `GET /events`: a time range, newest first | D-98 | osrs-data-hub PR #43 |
| `GET /members/{discord_id}`: whether a Discord account is a member and an admin | D-100 | osrs-data-hub PR #46 |

Push to keys (webhooks or a key-authenticated stream) was deferred (D-93); polling stays the contract.
