# OSRS Guild Map

![Rust](https://img.shields.io/badge/Rust-CE422B?style=for-the-badge&logo=rust&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-336791?style=for-the-badge&logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)

A live map and tracker for an Old School RuneScape guild: where everyone is right now, what they carry and
wear, their skills and XP history, and what the guild has been up to.

It is a fork of [group-ironmen](https://github.com/christoabrown/group-ironmen), reworked for guilds instead
of Group Ironman teams:

- Player data comes from the [RuneLite HomeAssistant Data Exporter](https://github.com/xXD4rkDragonXx/runelite-homeassistant-data-exporter)
  plugin, either directly or through [osrs-data-hub](https://github.com/RedFirebreak/osrs-data-hub).
- Users log in with an account or with Discord (optionally limited to members of your Discord server), and
  an admin portal manages users and players.
- There is no member limit and no shared group bank.

## Features

- **Live map** of every online player, with world, HP and prayer, and an optional location trail
  (24 hours, 7 or 30 days) when the hub is connected.
- **Items**: combined inventory and equipment of everyone online, searchable.
- **Players**: everyone who ever reported, with online status.
- **Graphs**: XP per skill over a day, week, month or year. With the hub connected the history comes from
  the hub, so it includes play from before a player joined the map.
- **Activity** (hub only): top XP gainers and a feed of loot, level ups, collection log slots, deaths,
  diaries and combat tasks.
- **Admin portal**: users and roles, players and who they belong to, the audit log, and the hub connection.

## Where player data comes from

The backend's `DATA_SOURCE` setting picks one of three modes:

| Mode | How players get on the map |
|---|---|
| `direct` (default) | Each player pairs the RuneLite plugin with this site using a 5-digit code from the Setup page. |
| `hub` | The backend mirrors players from an osrs-data-hub. Players only pair with the hub; direct pairing is off. |
| `both` | Both. When a player sends data directly, that data wins over the hub copy for the next two minutes. |

### How the hub integration works

```
RuneLite plugin ──pair/events──▶ osrs-data-hub ◀──GET /api/v1/snapshot (every 5 s)── map backend ──▶ site
                                        ▲                                                   │
                                        └──── /xp, /events, /locations, /leaderboards ◀─────┘ (cached)
```

- The backend polls the hub's `/api/v1/snapshot` with an API key that never leaves the server. It uses
  `ETag` and `since` for polling, and does a full refresh every two minutes.
- Online players get fresh data. Offline players are imported once with the hub's `last_seen`, so they
  show as offline instead of briefly appearing online.
- Accounts are matched by hub account id, then by the plugin's account hash (service keys only), then by name. Renames on
  the hub are followed. Accounts that disappear from the hub are marked "not shared" and never deleted.
- When the hub reports an account owner's Discord id, the player is linked to the map user who logged
  in with that Discord account. Admins can also link players by hand.
- XP graphs, trails, gains and the events feed are served by the backend from a short-lived cache, so
  the hub sees the same number of requests however many people view the site.

**What the hub shares is up to each player.** The hub only exposes what an account's owner shares with
the guild, and the map shows exactly that. A player who keeps their location private stays off the map.

#### Setting up the hub connection

1. Ask a hub admin to create a **service key** under **Admin → Integrations**
   ([osrs-data-hub](https://github.com/RedFirebreak/osrs-data-hub) D-88). A service key:
   - belongs to the guild rather than a person, so it keeps working when whoever created it leaves;
   - reads exactly what the guild may see;
   - allows 600 requests a minute and 50 accounts per history request;
   - is the only kind that sees the plugin's `account_hash`.

   A personal API key from the hub's **API keys** page also works, with limits: 120 requests a minute,
   10 accounts per request, no `account_hash` matching, and it dies with its creator's membership.
2. Give the key at least these categories:
   - `activity` and `location_live` for the map;
   - `stats`, `equipment` and `inventory` for player panels, items and graphs;
   - optionally `events` and `location_history` for the Activity page and trails.
3. Set these for the backend:
   ```env
   DATA_SOURCE=hub                      # or both
   HUB_BASE_URL=https://hub.example.com # without /api/v1
   HUB_API_KEY=ohub_xxxxxxxxxx_xxxxxxxx
   ```
   At start-up the backend asks the hub's `/me` what the key allows. It then uses 80 % of the key's
   rate limit and the key's bulk size, and logs a warning when the key is a personal one.
4. Open **Admin → All Players → Test connection** to check the key and see how many accounts it can read.

**Players choose what the map sees.** On the hub, equipment and inventory are private until their owner
shares them with the guild, and live location is shared with the guild by default. A player whose items
don't show up on the map should share them in the hub's sharing settings.

## Running it

### Docker (recommended)

```bash
cp .env.example .env   # set BACKEND_SECRET, database credentials and the data source
docker compose up -d
```

The site listens on http://localhost:4000. The first visit asks you to create the admin account. Images
are published to `ghcr.io/redfirebreak/ha-osrs-map-{frontend,backend}` on every push to `master`.

To build the images from source instead, run `docker compose -f docker-compose-local.yml up --build`. For
plain `http://localhost` also set `COOKIE_SECURE=false`, or the browser will drop the login cookie.

### Configuration

Every backend setting is an environment variable. `server/config.toml.example` shows the same settings as
a file for local development.

| Variable | Default | Purpose |
|---|---|---|
| `PG_USER`, `PG_PASSWORD`, `PG_HOST`, `PG_PORT`, `PG_DB` | | PostgreSQL connection. The schema is created on first start. |
| `PG_POOL_MAX_SIZE` | `16` | Database connection pool size. |
| `BACKEND_SECRET` | | Secret used to hash tokens. Changing it unpairs every device. |
| `COOKIE_SECURE` | `true` | Mark session cookies `Secure`. Set to `false` only for plain HTTP. |
| `DATA_SOURCE` | `direct` | `direct`, `hub` or `both`. |
| `HUB_BASE_URL`, `HUB_API_KEY` | | The osrs-data-hub to read from, and its key. |
| `HUB_POLL_INTERVAL_SECS` | `5` | Snapshot poll interval (at least 2). |
| `HUB_HISTORY_ENABLED` | `true` | Serve graphs, trails and the Activity page from the hub. |
| `HUB_REQUEST_BUDGET` | 80 % of the key's limit | Hub requests per minute this server allows itself (the hub allows 120 per personal key, 600 per service key). |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI` | | Enables "Log in with Discord". The redirect URI is `https://<site>/login/discord`. |
| `DISCORD_AUTO_REGISTRATION` | `false` | Let members of the servers below create an account by logging in. |
| `DISCORD_AUTOREG_SERVERS` | | Comma-separated Discord server ids. Linked users must remain a member of one of them. |
| `HOST_URL`, `SITE_TITLE`, `SITE_NAME` | | Frontend: backend URL for its `/api` proxy, and branding. |

### Pairing directly (`direct` or `both`)

1. Install the RuneLite HomeAssistant Data Exporter from the Plugin Hub.
2. Log in to the site and open **Setup**, then click **Generate Pairing Code**.
3. Enter the code in the plugin. The player appears on the map with the next update.

The plugin can pair with several endpoints at once, for example this site and the hub.

## Development

Prerequisites: Rust (stable), Node.js 22+ and PostgreSQL 16+.

```bash
# Backend (reads server/.env or environment variables; needs a secret)
cd server
echo "dev-secret" > secret
PG_USER=postgres PG_HOST=localhost PG_DB=osrs_tracker COOKIE_SECURE=false cargo run

# Frontend (http://localhost:4000, proxies /api to 127.0.0.1:8080)
cd site
npm install
npm start
```

To try the hub integration without a hub, run the mock and point the backend at it:

```bash
node tools/mock-hub/server.js    # http://localhost:7070, key ohub_mock_key
DATA_SOURCE=hub HUB_BASE_URL=http://localhost:7070 HUB_API_KEY=ohub_mock_key cargo run
```

Tests:

```bash
cd server && TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/group_ironmen_test cargo test
cd site && npm test && npm run lint && npm run format:check
```

The server's integration tests (`server/tests/`) drop and recreate the schema in the test database, so
point them at a database you don't mind wiping.

### Keeping up with group-ironmen

The upstream project keeps refreshing its game data (items, map tiles, quests). To bring that in:

```bash
git remote add upstream https://github.com/christoabrown/group-ironmen.git
git fetch upstream
git merge upstream/master
```

Generated data under `site/public/` merges without conflicts. Server changes may need porting, because
this fork replaced group tokens with sessions, removed the shared bank, and relies on
`*_last_update` timestamps being refreshed on every update.

## Project structure

```
server/            Rust backend (actix-web, tokio-postgres)
  src/hub/         osrs-data-hub sync, client and history proxy
site/              Frontend (web components bundled with esbuild) and its Express server
tools/mock-hub/    Stand-in for the osrs-data-hub API
backup/            Database backup script
docs/              Integration notes
```

## Credits and license

- Original frontend and backend by [christoabrown](https://github.com/christoabrown/group-ironmen), BSD 2-Clause
  License (see [LICENSE](LICENSE)).
- RuneLite companion plugin by [xXD4rkDragonXx](https://github.com/xXD4rkDragonXx).
