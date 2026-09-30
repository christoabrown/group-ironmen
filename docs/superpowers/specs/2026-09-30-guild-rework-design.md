# Guild map rework: remove, scale, add

## Context

ha-osrs-map is a fork of group-ironmen, a tool for 5-player Group Ironman teams. It now serves a guild with 50+ players fed by osrs-data-hub, but much of the UI and backend still assumes the old model.

**What exploration and the live site on :4000 showed:**
- **Most per-player data is never filled.** In guild mode only 5 player fields are ever written: stats, position, skills, inventory and equipment. The Items page, the bank, and the Quests, Diaries and Collection-log tabs are empty for good. The hub doesn't store that data either.
- **The UI doesn't scale.**
  - One full panel per player is stacked in the side panel, and the Players page duplicates them.
  - There are 5 hard-coded player colours.
  - Map markers all look the same and have overlapping labels.
  - The graph draws one line per player.
  - The 1 s poll returns every player row each time and writes `users.last_seen` on every request.
- **Bugs and holes.**
  - A player imported while offline shows up empty until reload.
  - Any logged-in user can write any player's data (`/update-group-member`).
  - Titles say "OSRS Group Tracker", and the site still links to the upstream Ko-fi, GitHub and Discord.
- **The hub offers data the map doesn't use:** an events feed (loot, deaths with location, level ups, collection-log slots, diaries, combat tasks), sessions and playtime, wealth, gear history, bulk location history, account type, owner, total level and item values.

**Decisions made with the user:**
- Hub-only: direct pairing is removed.
- Drop the unused columns and tables, and use as much hub data as possible.
- Hub changes are allowed.
- Navigation: **Map** (landing page, with the roster) · **Clan** (overview that absorbs Activity) · **Players** (directory) · **Graphs** · **Admin** · **Settings**.
- Player details: a roster in the side panel plus a player profile drawer.
- New features: live events on the map, Clan overview ("who's where"), and multi-player trails.

**Defaults I've chosen, which you can override when approving:**
- Admins **Hide** a player the hub still shares. Deleting one would just re-import it.
- The loot leaderboard leaves out special worlds (leagues, deadman), the same way gains already do.
- Drop `BACKEND_SECRET` and `crypto.rs`, since nothing uses them after direct pairing goes.
- Drop `members.last_source`.

**Workflow:**
- Branch `red/guild-rework` off `master` in ha-osrs-map and `red/map-loot-leaderboard` in osrs-data-hub.
- First, save this plan as `docs/superpowers/specs/2026-09-30-guild-rework-design.md`.
- One commit or more per phase, each phase shippable on its own, then a PR per repo.

---

## Phase 1: Cleanup and hub-only

### Backend (`server/src`)

**Delete these files:** `device.rs`, `token_lockout.rs`, `sql/schema.sql`, and `crypto.rs` along with the `blake2` and `data-encoding` crates.

**`main.rs`:**
- Remove the device, pairing and captcha routes.
- Remove `authed::{add,delete,rename,update}_group_member`, `am_i_logged_in`, `am_i_in_group`, `get_collection_log`, and the `x-osrs-token` CORS header.
- Call `config.require_hub()?` right after `Config::from_env()`. It can't live inside `from_env`, because the integration tests call that.
- `HubContext.client` changes from `Option<Arc<HubClient>>` to `Arc<HubClient>`.

**`config.rs`:**
- Delete `DataSource`, `CaptchaConfig` and `both_direct_grace_secs`.
- A leftover `DATA_SOURCE` env value only prints a warning.
- Add `require_hub()`.

**`hub/`:**
- Delete `DirectSeen`, `HubStatus.data_source` and the "both" branch in `sync.rs:198-205`.
- `/features` returns `{hub_history}`.

**Auth and routes:**
- `auth_middleware.rs`: delete the group-token `AuthenticateMiddleware` and its cache (`:20-307`). Keep the session middleware and the extractors.
- `authed.rs`: keep only `get_group_data` and `get_skill_data`.
- `unauthed.rs`: delete `create_group`, the captcha code, and the stubs.
- `admin_routes.rs` `kick_user` and `discord_routes.rs:155`: remove device and pairing-code revocation.

**`db.rs`:**
- Delete the group, pairing, device and collection-log helpers.
- `get_group_data`, `list_players` and `TIMESTAMPED_MEMBER_COLUMNS` cover only the 5 fields.
- `get_or_create_singleton_group` uses a constant placeholder hash.

**`update_batcher.rs`:** delete the shared-bank deposit logic (`:140-249`, `:428-537`) and its tests. Rows hold only the 5 fields.

**Compiler-led cleanup:** `models.rs`, `validators.rs` and `error.rs`. Remove whatever is now unused.

**New migration `drop_group_ironman_data`** in `db::update_schema`, in one transaction:
1. First drop the 8 timestamp triggers and their functions. Postgres won't drop a column that a trigger's `WHEN` clause references.
2. Then drop these columns and their `*_last_update` columns: quests, bank, rune_pouch, interacting, seed_vault, diary_vars, collection_log, potion_storage, plus `last_source`.
3. Drop the tables `devices`, `pairing_codes`, `collection_log` and `collection_log_new`.
4. Change `user_player_links.source` from `device` to `manual`.

### Frontend (`site/src`)

**Delete these components** and remove them from `components.json` and `index.js`: create-group, demo-page, edit-member, member-name-input, items-page, inventory-item, inventory-pager, setup-instructions, donate-button, social-links, player-quests, player-diaries, diary-dialog, diary-completion, collection-log*, rune-pouch, player-interacting. Delete search-element too if nothing else uses it.

**Delete these data files:** `data/example-data.js`, `collection-log.js`, `quest.js` and `diaries.js`, plus the matching `public/data/*.json` files.

**`app-initializer.js` and `api.js`:**
- Load only items and GE prices.
- `api.enable()` must wait only for `item-data-loaded`. Today it also waits for `quest-data-loaded`, so polling would never start.
- Remove demo mode and the legacy group-token login (`storage.storeGroup/getGroup`, `setCredentials`, `loadGroup`).

**`member-data.js` and `group-data.js`:** remove the item aggregation (`groupItems`, potion storage) and the quest, diary, collection-log, interacting and bank transforms.

**Player panel and map:**
- `player-panel` keeps inventory, equipment and skills. `player-stats` loses the energy bar (the hub always sends 0) and `player-interacting`.
- `canvas-map.js`: remove `interactingMarkers`.

**Routes and navigation:**
- `index.html`: `/group` and `/group/map` both go to `map-page`. Remove the items and setup-instructions routes. Keep `/setup`, the first-admin setup page, and have `setup-page.js:83` redirect to `/group`.
- `app-navigation`: remove Items, Setup and the donate button.

**Wording:**
- The title is "OSRS Guild Map", or `SITE_NAME`.
- "Go to group" becomes "Open map".
- "Group total level" becomes "Combined total level".
- `scripts/server.js:48`: escape `SITE_NAME` with `JSON.stringify` and fix the defaults.

### Config, docs and tests

**Config:**
- `.env.example`: `HUB_*` is required; remove `DATA_SOURCE` and `BACKEND_SECRET`.
- `docker-compose-local.yml`: map postgres to `55432:5432`, because the hub's database uses 5432.

**Docs:**
- README: remove the data-source modes, the pairing and Items sections, and the `DATA_SOURCE` and `BACKEND_SECRET` rows.
- Update `docs/hub-integration/HUB_CHANGES_PROMPT.md`.

**Server tests:**
- `update_batcher_integration.rs`: use `get_or_create_singleton_group` and `ensure_member_exists`, and delete the deposit, bank and potion tests.
- `hub_sync_integration.rs`: remove `DataSource` and `DirectSeen` and the both-mode test. Rename the account-hash test to `matches_existing_member_by_account_hash`.
- New `tests/migration_integration.rs`: the columns, triggers and tables are gone, and running the migration twice is a no-op.

**Site tests:**
- Delete `diaries.test.js`.
- Prune `cache-data`, `group-data` (potion), `member-data`, `api` (legacy credentials) and `canvas-map:317-327` (interacting).
- Update `hub-features` for the new features shape.

---

## Phase 2: Scale and use more hub data

The poll response changes shape, so backend and frontend must deploy together.

### Backend

**Migration `add_presence_and_hub_meta`:** add these columns to `members`: `hub_online bool`, `hub_meta jsonb`, `hub_meta_last_update`, `hidden bool`.
- `hub_meta` holds display data: type and type_label, owner, categories, total_level, overall_xp, inventory and equipment value, spellbook, game_state, is_on_boat and special_world.
- Presence stays in real columns.

**Fixing the stale-timestamp bug:** presence and change stamps become separate things.
- `*_last_update` now always means "when the map stored a changed value". Remove `source_time`. The batcher stamps a field `NOW()` only when its value `IS DISTINCT FROM` the stored one.
- `sync.rs::process_account` sends changed sections whether the account is online or offline, and drops the heartbeat.
- New `db::set_hub_presence`, which replaces `set_hub_seen`. It writes when the online flag flips, and otherwise at most once every 60 s per account.

**New poll response from `get-group-data`:**
- Shape: `{cursor, roster:[{name, online, last_seen, orphaned}], members:[only changed rows, including meta]}`.
- `online` is `hub_online AND hub_last_seen > now()-5 min`.
- `cursor` is `db_now - 2s`, which covers batcher transactions still in flight. Hidden players are left out.

**Hub models and conversion:**
- `hub/models.rs` and `convert.rs` parse the fields that are discarded today: type and type_label, categories, owner.name, spellbook, total_level and overall_xp, item `value`, `is_on_boat` and optional `game_state`.
- They build `MemberSections.meta`. On a special world, totals and values carry over from before.
- Events gain `npc_id`, `tier`, `points`, `received_at` and `data`.

**Scale fixes:**
- **Session middleware:** a shared `Arc<Mutex<HashMap<user_id, Instant>>>` limits `last_seen` writes to once every 60 s.
- **New `hub/directory.rs`:** an in-memory map from hub id to map name and back. Sync and admin actions keep it up to date. The gains, locations, skill-data and events proxies use it instead of querying the database on every request.
- **`SyncControl` in `sync.rs`:** a `forget` queue plus a `full` flag. Admin delete, hide and unhide call it, which fixes the `known` cache staying stale.
- **Admin `PUT /api/admin/players/{name}/hidden`:** sync skips hidden accounts and the poll leaves them out. Delete is only offered for orphaned players.
- **Events use map names:** the `member=` filter matches on the hub account id and the output uses the map name. This fixes `proxy.rs:512` and `events.rs:47`.

**New profile proxies in `hub/profile.rs`:**
- All live under `/api/group/hub/players/{member}/…`: `gains`, `sessions` (with `total_ms`), `wealth`, `equipment-history` and `events`.
- A hub 404 becomes `{error:"not_available"}`, which the UI shows as "Not shared".
- Cache TTLs are 30–300 s, and the cache cap goes from 500 to 2000.

**Other backend changes:**
- **`GET /api/group/hub/trails?members=A,B&days=`** (at most 8 players) uses bulk `/locations` in chunks. A 404 falls back to one request per account, the way `fetch_xp_chunk` does. Each player gets `{member, shared, points}`.
- **`get-skill-data`** accepts `members=` (up to 10).

**Tests:**
- Unit tests:
  - `convert.rs`: meta extraction and special-world carry-over.
  - `directory.rs`.
  - Event member filtering.
  - Trail chunking and the 404 fallback.
- Integration regression tests:
  - An offline import after the cursor still reaches the client with its data.
  - An unchanged snapshot bumps no timestamps.
  - Presence writes are throttled.
  - Rename, hide and forget work.

### Frontend

**Data layer:**
- `api.js`:
  - Poll every **2 s**; the hub only syncs every 5 s. The cursor comes from the response.
  - Add `getPlayerGains`, `getPlayerSessions`, `getPlayerWealth`, `getPlayerGearHistory`, `getPlayerEvents` and `getTrails`.
  - `getSkillData` gains a `members` argument.
- `group-data.js::update({cursor, roster, members})`:
  - Apply presence from the roster and delete players that are gone.
  - Force a full fetch when an unknown name appears, which handles renames and re-imports.
  - Publish `members-updated` when the set of names or any online flag changes, and `roster-changed` with the changed names.
- New `data/player-colors.js`: `colorForName(name)` hashes the name (FNV-1a) to a hue. The colour is stable across sessions and replaces the 5-colour counter in `member-data.js:8-15`.
- `member-data.js`: add `online`, `lastSeen`, `orphaned` and `meta`. `inactive` becomes a getter for `!online`.
- New `data/selection.js`: `select(name, {follow})` and `clear()` publish the sticky `player-selected` topic; `toggleTrail(name)` publishes `trails-changed` (at most 8).
- New `data/roster-model.js` (pure, tested): filter, sort, `formatGp` and `relativeTime`, moved out of the activity and players pages.

**Components:**
- **`player-roster`**, inside `side-panel`:
  - Search, Online/All/Not shared chips, and a sort select.
  - Rows are keyed by name and built once. Only changed rows are patched on `roster-changed`, and innerHTML is never rebuilt.
  - Each row shows a colour dot, name, world, a mini HP bar, total level and last seen.
  - Clicking a row selects the player.
- **`player-profile` drawer**, mounted once next to the side panel, about 380 px wide, and a full-screen sheet below 768 px:
  - The header shows name, type, owner, world or last seen, and game state.
  - Buttons: follow and show trail.
  - Tabs load lazily:
    - **Overview:** reuses `player-stats`, `player-skills`, `player-equipment` and `player-inventory`, plus carried and worn value. It shows "Not shared" when `meta.categories` doesn't include the category.
    - **Gains**
    - **Activity:** events plus sessions and playtime.
    - **Wealth:** a chart.
    - **Gear history**
  - Delete `player-panel` once the drawer covers it.
- **`event-feed`:** the feed and filter pieces taken out of `activity-page`, so the drawer and the Clan page can share them.

**Map (`canvas-map.js`):**
- Markers are drawn in each player's own colour, and the selected one gets a thicker outline and a label that's always shown.
- `getPlayerAtClient` hit-tests clicks and hovers. It reuses the map-link press and drag-threshold pattern, and hovering shows a name, world and HP tooltip.
- `player-selected` makes the map follow the player, using the existing `followPlayer`.
- New pure functions:
  - `clusterMarkers(points, cellPx)` shows count bubbles when zoomed out; clicking one zooms in.
  - `placeLabels` does greedy collision avoidance, replacing the same-tile-only grouping at `:624-658`.

**Other pages:**
- `map-page`: drop the per-player focus buttons and the single trail select.
- `players-page`: rewrite as a sortable table. Columns: name, status, world, type, owner, total level, XP, value and combat level. Rows are keyed, and clicking one selects the player.
- `skills-graphs` and `skill-graph`:
  - A player picker defaults to the period's top 5 gainers.
  - Fix the null crashes at `:342` and `:367`, and in `player-icon.js:16`.
- `admin-portal`: filter inputs above the users and players lists; hub-linked, online and last-seen columns; a Hide/Unhide action.

**Tests:**
- `member-data`: colours, presence and meta.
- `group-data`: roster deletions, forcing a full fetch, and the cursor.
- New `roster-model.test.js`.
- `canvas-map`: per-marker colour, hit-testing, a press without drag selects, clustering, label placement, and following on selection.
- `skill-graph`: a missing member doesn't throw.

**Mock hub (`tools/mock-hub/server.js`)**, extended now so there's data to test scale with:
- `MOCK_HUB_ACCOUNTS=60`: accounts spread over named regions, about 70% online.
- One in four accounts keeps `inventory`, `equipment` and `location_history` private.
- New endpoints: `/accounts/{id}` plus its gains, sessions, wealth and equipment-history.
- `/events` handles `types`, `accounts` and `min_value`, and includes a death location.

---

## Phase 3: Clan features

### Hub (osrs-data-hub; follow its `CLAUDE.md`: `docs/API.md`, `CHANGELOG.md`, and decision D-94 in `ARCHITECTURE.md`)

**(a) `game_state` on `/snapshot`:**
- `packages/server/src/api/snapshot.ts` sends it under the activity category.
- Add it to `apps/web/src/lib/api-v1/wire.ts`, `schemas.ts` and the docs.
- Tests: `read-models.test.ts` and `snapshot.test.ts`.

**(b) `GET /api/v1/leaderboards/loot?period=day|week|month&limit=1..50`:**
- Add `apiLootLeaderboard` to `packages/server/src/api/leaderboards.ts`.
  - It covers accounts whose `events` the key may read.
  - It uses `leaderboardStarts`, with the key creator's time zone for `day`.
  - It returns loot and pk_loot events ordered by `value_gp DESC` and skips special worlds.
  - Each row goes through `toApiEvent(toFeedEvent(...))`, so redaction is kept; export those from `events.ts`.
- Web layer: a new route `apps/web/src/app/api/v1/leaderboards/loot/route.ts` (copy the `gains/route.ts` pattern), plus schemas, wire, and an `openapi.ts` entry.
- Tests: `loot-leaderboard.test.ts` in the style of `events.test.ts`, plus a route-shape test.
- Mirror both (a) and (b) in the mock hub.

### Map backend

**Events buffer (`hub/events.rs`):**
- Follow hub events every **5 s** instead of 15.
- Give each buffered event a local, increasing `seq` and hold up to 1000 events.
- Trim each event on the server to its death location, top 3 items and source, instead of passing the raw `data`.

**`/hub/events`:**
- Accepts `after=<seq>`, `min_value` and `member`.
- Each item is `{seq, type, member, occurred_at, value_gp, item_id, skill, level, title, line, location?, items?}`.

**New `/api/group/hub/leaderboards/loot?period=`** (TTL 60 s):
- Player names are mapped through the directory.
- If the hub answers 404 (an older hub), fall back to computing it from the buffer and add `partial: true`.

### Frontend

**Regions (for "who's where"):**
- Generate `site/public/data/regions.json` from RuneLite's `DiscordGameEventType.java` (BSD-2, with attribution in the README and a NOTICE file) using a new `scripts/generate-regions.js`. I'll ask before downloading that source file.
- New `data/regions.js`: `regionId(x,y) = ((x>>6)<<8)|(y>>6)`. `regionName` tries an exact match, then the 8 neighbouring regions, then a Wilderness bounding box, then "Instance" when x ≥ 6400, and otherwise "Elsewhere".
- The roster shows the region name.

**`data/live-events.js`:**
- One shared poller that asks for new events with `after=` every 5 s while the tab is visible.
- The first fetch only sets the cursor, so old events don't ping.
- It publishes `live-events` and replaces the Activity page's own 15 s poll.

**Live layer on the map (`canvas-map`):**
- An animated ping appears at the player's position; deaths use `event.location`.
- A skull stays at a death for 10 minutes, and big loot gets a gp label.
- The map only animates while pings are active.
- Filters for type and minimum value are in `map-page` and stored in localStorage.

**`clan-page` at `/group/clan`:**
- `/group/activity` becomes an alias. `activity-page` is deleted and its helpers move to `data/hub-format.js`.
- Sections:
  - Tiles: online / total, active worlds, and the biggest drop today.
  - **Who's where:** `groupByRegion`; clicking a region publishes `map-focus` and opens the map there.
  - Worlds list: `groupByWorld`, with a special-world badge.
  - Top gainers.
  - Biggest drops, from the loot leaderboard.
  - The event feed.
- Nav: Map · Clan · Players · Graphs · Admin · Settings.

**Multi-player trails:**
- Trail toggles in roster rows and in the drawer (at most 8).
- A trails control on the map page: the days select, a chip per trail in the player's colour, and clear-all.
- One `getTrails` call per change, refreshed every 60 s. Chips show "not shared" for private trails.
- The selected player's trail is drawn thicker, with an end-point dot.

**Tests:**
- `regions.test.js`; `cache-data` validates `regions.json`.
- Pure tests for `groupByRegion` and `groupByWorld`.
- Pings: expiry, the death-location fallback, and no pings on the first load.
- Move the `hub-features` test imports to `hub-format.js`.

---

## Verification (after each phase)

**Checks:**
- Server:
  ```bash
  cd server && cargo fmt --check && cargo build --all-targets
  ```
- Then run `cargo test -- --test-threads=1` against a throwaway postgres, `docker run -p 55432:5432 postgres:17`, with `TEST_DATABASE_URL`.
- Site: `cd site && npm run format:check && npm run lint && npm test && npm run bundle`.
- Hub (Phase 3):
  ```bash
  pnpm typecheck && pnpm lint && pnpm vitest run --project server && pnpm vitest run --project web && pnpm format:check
  ```

**Migration on real data:** before starting the new backend on the Docker database, dump it with `pg_dump` (via `backup/`). Then check that `\d groupironman.members` shows only the kept columns.

**End to end:**
- Rebuild with `docker compose -f docker-compose-local.yml up --build` on :4000, pointed first at the mock hub (`MOCK_HUB_ACCOUNTS=60`), then at the real hub (`pnpm dev` in osrs-data-hub on :3000, via `host.docker.internal`).
- Drive both in the browser pane, logged in with the dev account.

**What to check in the browser:**
- Login lands on the map. The nav has no Items or Setup, and the console has no errors.
- The poll runs every 2 s and returns small `members` arrays.
- An offline player imported by the mock shows up with data, without a reload.
- Selecting a player from the roster, the table or a marker opens the drawer and the map follows.
- Zoomed out, clusters and labels don't overlap.
- Private categories show "Not shared".
- Hide and unhide work.
- A mock loot or death event pings in the right place within about 15 s.
- The Clan page groups players by region, and clicking a group zooms the map there.
- Biggest drops are sorted by value.
- Three trails draw in three colours.
- `game_state` shows in the drawer header against the real hub.

**Scale:** keep DevTools Performance open while 60 mock players update. The roster should cause no long tasks. `pg_stat_user_tables.n_tup_upd` on `users` and `members` should grow slowly with several tabs open.

## Risks and notes

- Old paired plugins get 404s from `/api/osrs-data/*`. Mention it in the release notes.
- If the hub is down for more than 5 minutes, everyone shows offline. This is intentional.
- Event pings lag by the hub's settle time of about 10–20 s.
- Instanced areas show as "Instance".
- Deleting a player also deletes their local skill history. That's why Hide is the default.
- The skill-history tables (`skills_day/month/year`) and the `groups`/`group_id` model stay as they are, to avoid churn.
