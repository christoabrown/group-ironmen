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
| Egress | The hub (`HUB_BASE_URL`); `prices.runescape.wiki` for Grand Exchange prices; `discord.com` when Discord login is on. |

**The backend is a singleton.** It runs the schema migrations in-process at start-up
(`db::update_schema`), polls the hub, and keeps state in memory: the event buffer, the hub directory and
the update batcher. Run exactly one replica with the `Recreate` strategy, never two at once, including
during a rollout. If that ever changes, this page changes first.

## Database

| | |
|---|---|
| Image | `postgres:17`, the same major as `docker-compose.yml`, `docker-compose-local.yml` and CI. Renovate bumps all three together. A major upgrade needs a dump and restore and never comes in that group. |
| Data | `/var/lib/postgresql/data` |
| Schema | `groupironman`, created and migrated by the backend at start-up |
| Settings | `PG_HOST`, `PG_PORT`, `PG_DB`, `PG_USER`, `PG_PASSWORD`, `PG_POOL_MAX_SIZE` |

The migrations run `CREATE EXTENSION IF NOT EXISTS citext`. `citext` is a trusted extension, so the
app's role needs `CONNECT` and `CREATE` on its database but not superuser (checked on `postgres:17`
with a role that has only those two privileges). The database owner has both.

## osrs-data-hub

| | |
|---|---|
| `HUB_BASE_URL` | Base URL of the hub, without `/api/v1`. In the cluster, the hub's in-cluster Service, not its public hostname. |
| `HUB_API_KEY` | A service (integration) key from the hub's Admin → Integrations. |
| Minimum hub | `v1.0.0` |

Two things the map uses came after hub `v1.0.0` (hub PRs #13 and #16, D-94) and are in the first hub
release cut after it:

- `GET /api/v1/leaderboards/loot`. Without it, the Clan page's loot leaderboard is built from the drops
  the backend has buffered since it started, and is marked partial.
- `game_state` on `/snapshot`. Without it, player profiles leave the game state out.

Everything else works the same against hub `v1.0.0`.

## Other settings the deployment sets

- `COOKIE_SECURE=true` (the default) behind TLS. `false` only for plain HTTP.
- `DISCORD_REDIRECT_URI` is the frontend's public URL plus `/login/discord`, and must match the
  redirect registered in the Discord app.
- `SETUP_TOKEN`: set it whenever the site is reachable before the first admin exists. `POST
  /api/auth/setup` (which makes the caller the admin while there are no users) then requires the token,
  in the `X-Setup-Token` header or the `setup_token` body field, and the setup page asks for it. Unset,
  whoever opens the site first becomes the admin.
