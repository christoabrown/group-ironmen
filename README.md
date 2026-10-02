# OSRS Guild Map

![Rust](https://img.shields.io/badge/Rust-CE422B?style=for-the-badge&logo=rust&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-336791?style=for-the-badge&logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)

A live map and tracker for an Old School RuneScape guild: where everyone is right now, what they carry and
wear, their skills and XP history, and what the guild has been up to.

It is a fork of [group-ironmen](https://github.com/christoabrown/group-ironmen), reworked for guilds instead
of Group Ironman teams:

- Player data comes from [osrs-data-hub](https://github.com/RedFirebreak/osrs-data-hub), which collects it
  from the [RuneLite HomeAssistant Data Exporter](https://github.com/xXD4rkDragonXx/runelite-homeassistant-data-exporter)
  plugin. Players pair the plugin with the hub and choose there what the guild may see.
- People log in with Discord, and the hub says who is a member of the guild and who is an admin. The map
  keeps no accounts of its own.
- There is no member limit, and the Group Ironman features (shared bank, combined items, quests, diaries,
  collection log) are gone: neither the hub nor the plugin sends that data.

## Features

- **Live map** of every online player in their own colour. Players close together merge into a counted
  bubble when zoomed out, names never overlap, and a click opens the player.
- **Events on the map**: loot, level ups, deaths, collection log slots, diaries, combat tasks and
  superior spawns each get a marker with their icon where they happened, which stays for half an hour;
  drops of a million and up and collection log slots get a gold ring, drops of ten million and up a
  bigger one. Markers on the same spot
  stack with a count. Hover one for what happened and when, click it to go there and open the player.
  A toast in the corner of the map page announces each event as it happens. Checkboxes above the map
  choose the kinds, the smallest drop worth showing and whether toasts appear. The events of the last
  half hour are back on the map after a reload.
- **Player list** next to the map: search by name, owner or place, filter online/offline, sort by place,
  total level, world or last seen. Each row shows the world, the place ("Lumbridge", "Wilderness (level
  24)") and HP.
- **Player profile**: vitals, total level and XP, carried value, gear and inventory, skills; XP gained
  today, this week, month or year; play time and sessions with their worlds; carried value over 30 days;
  gear changes; recent events. The map follows the player while it's open.
- **Trails** of up to eight players at once, each in the player's colour (24 hours, 7 or 30 days). A
  trail ends on the player's marker and grows as they move, fading with age. Teleports are drawn as arcs,
  boat trips as waves, and parts on another floor faintly. The player's events are marked along it,
  over the whole length of the trail (an event that doesn't say where it happened goes where the trail
  has the player at the time; of a very busy player the oldest may be missing, as at most 2000 drops
  and 2000 other events are read, or 2000 of all kinds together when every drop is shown). Hover a trail
  to see when the player was where, or press Replay to play the routes back on a timeline with ticks for
  the events and teleports (the 300 that matter most when there are more); the map follows the player
  while it plays, until you drag it,
  waits a moment wherever they teleport or go underground, and each event rings as the replay passes
  it. The trails you had on are still there after a reload.
- **Clan page**: who's online and where (click a place to see it on the map), which worlds, the top XP
  gainers, the biggest drops of the day, week or month, and the event feed.
- **Players page**: a sortable table of everyone, with type, owner, totals and carried value.
- **Graphs**: compare the XP of up to ten players over a day, week, month or year, from the hub's history.
- **Admin page**, for the hub's admins: hide a player the hub shares but the map shouldn't show, delete
  one the hub no longer shares, and see how the hub connection is doing.

A profile tab or trail says "not shared" when the player keeps that data private on the hub.

## Where player data comes from

Every player on the map comes from an osrs-data-hub. The backend mirrors the hub's accounts; players only
pair the RuneLite plugin with the hub. (Earlier versions could also pair the plugin with the map directly;
that is gone, and old direct pairings now get a 404.)

### How the hub integration works

```
RuneLite plugin ──pair/events──▶ osrs-data-hub ◀──GET /api/v1/snapshot (every 5 s)── map backend ──▶ site
                                        ▲                                                   │
                                        └──── /xp, /events, /locations, /leaderboards ◀─────┘ (cached)
```

- The backend polls the hub's `/api/v1/snapshot` with an API key that never leaves the server. It uses
  `ETag` and `since` for polling, and does a full refresh every two minutes.
- Only what changed is stored, whether the player is online or not. Presence comes from the hub's
  `online` and `last_seen`; if the sync stops for five minutes, everyone shows as offline.
- The site polls the backend every 2 seconds and gets the roster plus only the players whose data
  changed, so the cost stays small with 50+ players.
- Accounts are matched by hub account id, then by the plugin's account hash (service keys only), then by name. Renames on
  the hub are followed. Accounts that disappear from the hub are marked "not shared" and never deleted.
- XP graphs, trails, gains, profiles and the events feed are served by the backend from a short-lived
  cache, so the hub sees the same number of requests however many people view the site. See
  [docs/hub-integration](docs/hub-integration/HUB_INTEGRATION.md) for every endpoint the map calls.

**What the hub shares is up to each player.** The hub only exposes what an account's owner shares with
the guild, and the map shows exactly that. A player who keeps their location private stays off the map.

### Who can log in

The map has no accounts, passwords or roles of its own. Logging in goes through Discord, which only says
who someone is; the backend then asks the hub whether that Discord account is a member of the guild and
whether it is an admin (`GET /api/v1/members/{discord_id}`, hub D-100).

- A member of the hub gets in. Someone the hub doesn't know is told to sign in to the hub once first:
  that is where joining the guild happens.
- An admin on the hub is an admin on the map, and sees the Admin page.
- The hub is asked again every quarter of an hour for everyone who is logged in. Someone who left the
  guild, or was removed on the hub, is logged out of the map within that time; an admin who is no
  longer one loses the Admin page. While the hub can't be reached, whoever is logged in stays so.
- A login lasts three days. It is a cookie the page's scripts can't read.

This needs a hub with D-100 and a **service key**: the hub doesn't tell a personal key who is a member,
so with one nobody can log in.

#### Setting up the hub connection

1. Ask a hub admin to create a **service key** under **Admin → Integrations**
   ([osrs-data-hub](https://github.com/RedFirebreak/osrs-data-hub) D-88). A service key:
   - belongs to the guild rather than a person, so it keeps working when whoever created it leaves;
   - reads exactly what the guild may see;
   - allows 600 requests a minute and 50 accounts per history request;
   - is the only kind that sees the plugin's `account_hash`, and the only kind the hub tells who is a
     member.

   A personal API key from the hub's **API keys** page can read the players (120 requests a minute, 10
   accounts per request, no `account_hash` matching), but nobody can log in to a map that uses one.
2. Give the key at least these categories:
   - `activity` and `location_live` for the map and the player list;
   - `stats`, `equipment` and `inventory` for profiles and graphs;
   - `events` and `location_history` for the Clan page, the events on the map and trails.

   The Clan page's "Biggest drops" and the profile's game state need a hub with D-94
   (`/leaderboards/loot`, `game_state`); an older hub gets drops from recent events only. The events
   along a trail need a hub with D-98 (`/events?from=`); an older hub gives a player's newest 500.
3. Set these for the backend (it refuses to start without them):
   ```env
   HUB_BASE_URL=https://hub.example.com # without /api/v1
   HUB_API_KEY=ohub_xxxxxxxxxx_xxxxxxxx
   ```
   At start-up the backend asks the hub's `/me` what the key allows. It then uses 80 % of the key's
   rate limit and the key's bulk size, and logs an error when the key is a personal one.
4. Make a Discord application for the login (Discord Developer Portal → New Application → OAuth2), add
   `https://<your site>/login/discord` as a redirect, and set:
   ```env
   DISCORD_CLIENT_ID=...
   DISCORD_CLIENT_SECRET=...
   DISCORD_REDIRECT_URI=https://<your site>/login/discord
   ```
   The backend refuses to start without these too. The application only needs the `identify` scope; it
   can be the one the hub uses, with this redirect added to it.
5. Log in as a hub admin and open **Admin → Test connection** to check the key and see how many accounts
   it can read.

**Players choose what the map sees.** On the hub, equipment and inventory are private until their owner
shares them with the guild, and live location is shared with the guild by default. A player whose items
don't show up on the map should share them in the hub's sharing settings.

## Running it

### Docker (recommended)

```bash
cp .env.example .env   # set the database credentials, the hub URL and key, and the Discord application
docker compose up -d
```

The site listens on http://localhost:4000. Log in with Discord; the hub's admins get the Admin page. Images
are published to `ghcr.io/redfirebreak/ha-osrs-map-{frontend,backend}` when a release is cut (Actions →
Cut release), tagged with the version (`1.2.3`, `1.2`) and `latest`. Nothing is published on a push to
`master`; twice a week a patch release cuts itself when Renovate has merged dependency updates (see
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#images)).

To build the images from source instead, run `docker compose -f docker-compose-local.yml up --build`. For
plain `http://localhost` also set `COOKIE_SECURE=false`, or the browser will drop the login cookie.

### Kubernetes

Supported too. [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) lists what a deployment relies on: image tags,
users, ports, health endpoints, and why the backend must run as a single replica.

### Configuration

Every backend setting is an environment variable. `server/config.toml.example` shows the same settings as
a file for local development.

| Variable | Default | Purpose |
|---|---|---|
| `PG_USER`, `PG_PASSWORD`, `PG_HOST`, `PG_PORT`, `PG_DB` | | PostgreSQL connection. The schema is created on first start. |
| `PG_POOL_MAX_SIZE` | `16` | Database connection pool size. |
| `COOKIE_SECURE` | `true` | Mark session cookies `Secure`. Set to `false` only for plain HTTP. |
| `HUB_BASE_URL`, `HUB_API_KEY` | | The osrs-data-hub to read from, and its key (a service key). Required. |
| `HUB_POLL_INTERVAL_SECS` | `5` | Snapshot poll interval (at least 2). |
| `HUB_FULL_REFRESH_SECS` | `120` | How often the snapshot is read in full instead of only what changed. |
| `HUB_EVENTS_POLL_SECS` | `5` | How often the hub's events feed is read. |
| `HUB_TIMEOUT_SECS` | `10` | How long a hub request may take. |
| `HUB_HISTORY_ENABLED` | `true` | Serve graphs, trails, events and the profile's history from the hub. |
| `HUB_REQUEST_BUDGET` | 80 % of the key's limit | Hub requests per minute this server allows itself (the hub allows 120 per personal key, 600 per service key). |
| `RUST_LOG` | `info` | Log level of the backend (`warn`, `debug`, or per module, as `env_logger` reads it). |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI` | | The Discord application people log in with. Required. The redirect URI is `https://<site>/login/discord`. |
| `DISCORD_API_BASE` | `https://discord.com/api` | Only for development: a stand-in for Discord, such as the mock hub's (see [docs/DEV-STACK.md](docs/DEV-STACK.md)). Whoever answers there decides who logs in, so never set it on a real site. `DISCORD_AUTHORIZE_URL` overrides the page the browser is sent to, when the browser reaches the stand-in under another address than the backend does. |
| `HOST_URL`, `SITE_TITLE`, `SITE_NAME` | | Frontend: backend URL for its `/api` proxy, and branding. |
| `ICONS_BASE_URL` | `https://icons.scapekeeper.com` | Frontend: where browsers load item, skill and equipment-slot icons from (see [Icons](#icons)). Empty turns icons off. |

### Icons

Item, skill and equipment-slot icons are not part of this repository or the images. The page loads them
from the shared [osrs-icons](https://github.com/RedFirebreak/osrs-icons) CDN at
`https://icons.scapekeeper.com`, which follows each game update on its own. `ICONS_BASE_URL` changes that:

- leave it unset for the default;
- set it empty (`ICONS_BASE_URL=`) to turn icons off, for example on an offline install;
- point it at your own copy to self-host. Every osrs-icons release on GitHub has a
  `osrs-icons-rev….tar.gz` with the same layout as the CDN: extract it into any static web root, let it
  send `Access-Control-Allow-Origin: *`, and set `ICONS_BASE_URL` to that root's URL (no trailing slash
  needed).

Map tiles and labels are still served by the site itself.

## Development

Prerequisites: Rust (stable), Node.js 22+ and PostgreSQL 17.

```bash
# Backend (reads the repository's .env, server/config.toml or environment variables)
cd server
PG_USER=postgres PG_HOST=localhost PG_DB=osrs_tracker COOKIE_SECURE=false   HUB_BASE_URL=http://localhost:3000 HUB_API_KEY=ohub_... \
  DISCORD_CLIENT_ID=... DISCORD_CLIENT_SECRET=... DISCORD_REDIRECT_URI=http://localhost:4000/login/discord cargo run

# Frontend (http://localhost:4000, proxies /api to 127.0.0.1:8080)
cd site
npm install
npm start
```

To try the map without a hub, run the mock and point the backend at it. `MOCK_HUB_ACCOUNTS` sets how
many players it serves (default 12); every fourth keeps its inventory, equipment and trail private. The
first player walks a fixed 40-minute route with everything a trail can show (teleports, a boat trip,
stairs, a dungeon, a death, a logout) and the same events every lap (a level, a 14.5M drop, a collection
log slot); `MOCK_HUB_TRAIL_HOURS` sets how far back trails go (default 6). Every `MOCK_HUB_EVENT_MS`
(default 4000) a random online player gets an event of a random type. The mock also stands in for
Discord: with `DISCORD_API_BASE` pointed at it, "Log in with Discord" asks whether to come in as an
admin, a member, or someone the hub doesn't know.

```bash
MOCK_HUB_ACCOUNTS=60 node tools/mock-hub/server.js    # http://localhost:7070, key ohub_mock_key
HUB_BASE_URL=http://localhost:7070 HUB_API_KEY=ohub_mock_key \
  DISCORD_CLIENT_ID=mock DISCORD_CLIENT_SECRET=mock DISCORD_REDIRECT_URI=http://localhost:4000/login/discord \
  DISCORD_API_BASE=http://localhost:7070/discord cargo run
```

[docs/DEV-STACK.md](docs/DEV-STACK.md) has the whole recipe for a throwaway copy on port 4100 (its own
database, the mock hub) that runs beside a stack on port 4000, and how a Claude agent tests a change
with it in a browser.

Tests:

```bash
cd server && TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/guildmap_test cargo test
cd site && npm run check    # format:check, lint and test
```

The server's integration tests (`server/tests/`) drop and recreate the schema in the test database, so
point them at a database you don't mind wiping.

### Game data

The item list (`site/public/data/item_data.json`) and the map (`site/public/map/`, and `map_icons.json`,
`map_labels.json` and `map_links.json` beside the item list) are what group-ironmen had generated from the
game cache when this fork stopped merging from it. Nothing refreshes them: an item that is newer than the
list is left out of inventories and gear, and a new area is missing from the map, until those files are
generated again.

## Project structure

```
server/            Rust backend (actix-web, tokio-postgres)
  src/hub/         osrs-data-hub sync, client and history proxy
site/              Frontend (web components bundled with esbuild) and its Express server
tools/mock-hub/    Stand-in for the osrs-data-hub API
docs/              Deployment contract (DEPLOYMENT.md), the dev stack (DEV-STACK.md) and integration notes (hub-integration: what the map uses from the hub)
```

## Credits and license

- Original frontend and backend by [christoabrown](https://github.com/christoabrown/group-ironmen), BSD 2-Clause
  License (see [LICENSE](LICENSE)).
- RuneLite companion plugin by [xXD4rkDragonXx](https://github.com/xXD4rkDragonXx).
- Place names by map region from [RuneLite](https://github.com/runelite/runelite)'s Discord plugin,
  BSD 2-Clause License (see `site/public/data/regions.NOTICE`). Regenerate them with
  `node site/scripts/generate-regions.js path/to/DiscordGameEventType.java`.
