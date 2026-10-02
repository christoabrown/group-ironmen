# Deployment

Docker Compose (`docker-compose.yml`, see the README) and Kubernetes are both supported targets. The
Kubernetes manifests live outside this repository; this page lists what they rely on. **A change to
anything below is a breaking change for that deployment: update this page in the same pull request and
say so in its description.**

The full list of settings is [`.env.example`](../.env.example); it is not repeated here.

## Images

| | |
|---|---|
| Frontend | `ghcr.io/redfirebreak/ha-osrs-map-frontend:<x.y.z>` |
| Backend | `ghcr.io/redfirebreak/ha-osrs-map-backend:<x.y.z>` |

- Published only when a release is cut (Actions → Cut release, or a pushed `v*` tag), by
  [`release.yml`](../.github/workflows/release.yml). Git tag `v1.2.3` gives image tags `1.2.3`, `1.2`
  and `latest`. Nothing is published on a push to `master`.
- A patch release also cuts itself on Wednesday 15:00 and Sunday 09:00 (Europe/Amsterdam) when Renovate
  has merged a dependency update under `server/` or `site/` since the last release and CI is green on
  `master`. It releases `master` as it is, so a feature merged in the meantime ships with it.
- Pull by exact version. `latest` exists for Compose users only.
- `linux/amd64` only.
- Both packages are public, so pulls need no credentials.

## Frontend

| | |
|---|---|
| User | uid `1000` (`node`), non-root |
| Port | `4000` |
| Health | `GET /healthz` → `200 ok`. Answered by the Node process itself; it never calls the backend, so a backend restart doesn't take the frontend out of rotation. Not in the request log. |
| API | Proxies `/api/*` to `HOST_URL`. In the cluster that is the backend Service, for example `http://<backend-service>:8080`. |
| Settings | `HOST_URL`, `SITE_TITLE`, `SITE_NAME`, `ICONS_BASE_URL` |
| Icons | Item, skill and slot icons are not in the image. Browsers load them from `ICONS_BASE_URL` (default `https://icons.scapekeeper.com`); the server only passes the URL to the page. |
| Shutdown | Exits on `SIGTERM`/`SIGINT` once open connections close, at most 10 s later. |
| Filesystem | Writes nothing; runs with a read-only root filesystem and all capabilities dropped. |

Only the frontend should be reachable from outside. The browser talks to the backend through the
frontend's `/api` proxy, so the session cookie is set for the frontend's hostname.

## Backend

| | |
|---|---|
| User | uid/gid `10001`, non-root |
| Port | `8080` |
| Health | `GET /api/health` → `200` when a pooled `SELECT 1` succeeds, `503` otherwise (also after 2 s, so give the probe a `timeoutSeconds` of 3 or more). No session needed. Not in the access log. |
| Shutdown | actix-web's graceful shutdown on `SIGTERM`: stops accepting, lets in-flight requests finish, then exits. |
| Filesystem | Writes nothing: settings come from the environment (`config.toml` is optional and not in the image). Runs with a read-only root filesystem and all capabilities dropped. |
| Egress | The hub (`HUB_BASE_URL`); `prices.runescape.wiki` for Grand Exchange prices; `discord.com` for logging in. |

**The backend is a singleton.** It brings the schema up to date in-process at start-up
(`db::update_schema`), polls the hub, and keeps state in memory: the event buffer, the hub directory and
the update batcher. Run exactly one replica with the `Recreate` strategy, never two at once, including
during a rollout. If that ever changes, this page changes first.

## Database

| | |
|---|---|
| Image | `postgres:17`, the same major as `docker-compose.yml`, `docker-compose-local.yml` and CI. Renovate bumps all three together. A major upgrade needs a dump and restore and never comes in that group. |
| Data | `/var/lib/postgresql/data` |
| Schema | `guildmap`, created by the backend at start-up on an empty database, and migrated by it from then on |
| Settings | `PG_HOST`, `PG_PORT`, `PG_DB`, `PG_USER`, `PG_PASSWORD`, `PG_POOL_MAX_SIZE` |
| Backup | `pg_dump` of the one database, for example `docker compose exec postgres pg_dump -U "$PG_USER" "$PG_DB" > map.sql` under Compose. What is lost without one is the hidden players and the local skill history; the players themselves come back from the hub. |

At start-up the backend runs `CREATE EXTENSION IF NOT EXISTS citext`. `citext` is a trusted extension, so the
app's role needs `CONNECT` and `CREATE` on its database but not superuser (checked on `postgres:17`
with a role that has only those two privileges). The database owner has both.

**A database from before the `guildmap` schema is not converted.** Earlier versions kept their data in
the schema `groupironman`, which they had from the Group Ironmen tracker. The backend refuses to start
on a database that still has it and says so; it never drops it. Give the map an empty database, or run
`DROP SCHEMA groupironman CASCADE`. The players come back from the hub with the first sync. What does
not come back: which players were hidden, the skill history the map aggregated itself, and the
sessions, so everyone logs in again.

## osrs-data-hub

| | |
|---|---|
| `HUB_BASE_URL` | Base URL of the hub, without `/api/v1`. In the cluster, the hub's in-cluster Service, not its public hostname. |
| `HUB_API_KEY` | A service (integration) key from the hub's Admin → Integrations. A personal key reads the players but lets nobody log in. |
| Minimum hub | The first release after `v2.0.0`: it has `GET /api/v1/members/{discord_id}` (hub PR #46, D-100). |

**Nobody can log in against an older hub.** The map has no accounts of its own: it asks the hub whether
the Discord account that logs in is a member of the guild and an admin. A hub without that endpoint, or a
personal key, gets a 404 there, and logging in answers 503.

Without these the map works, with less:

- `GET /api/v1/leaderboards/loot` and `game_state` on `/snapshot` (D-94). Without them the Clan page's
  loot leaderboard is built from the drops the backend has buffered since it started, and is marked
  partial, and player profiles leave the game state out.
- `from` on `GET /api/v1/events` (D-98). Without it a trail shows a player's newest events only.

## Logging in

| | |
|---|---|
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | A Discord application (OAuth2, scope `identify`). Required: the backend exits at start-up without them. |
| `DISCORD_REDIRECT_URI` | The frontend's public URL plus `/login/discord`. It must be one of the redirects registered in the Discord application. Required. |
| `COOKIE_SECURE` | `true` (the default) behind TLS. `false` only for plain HTTP. |
| Session | A cookie named `session`: `HttpOnly`, `SameSite=Lax`, three days. Sessions are rows in the database, so they survive a restart of the backend. |

- Leave `DISCORD_API_BASE` and `DISCORD_AUTHORIZE_URL` unset. They point the login at a stand-in for
  Discord for development, and whoever answers there decides who logs in. The backend logs a warning at
  start-up when `DISCORD_API_BASE` isn't Discord's.
- An admin is whoever the hub calls one. There is no first admin to create and nothing to claim on a
  freshly deployed site.
- The map has no accounts of its own any more. `SETUP_TOKEN`, `DISCORD_AUTO_REGISTRATION` and `DISCORD_AUTOREG_SERVERS` are no longer read.
