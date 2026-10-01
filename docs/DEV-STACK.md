# Dev stack: the map on :4100 with made-up live data

A throwaway copy of the map for looking at a change in a browser. It builds whatever is checked out,
keeps its own empty database, and gets its players from the mock hub (`tools/mock-hub/server.js`)
instead of a real osrs-data-hub: positions that move, trails, and a new event every few seconds.

It is made to run beside a normal stack (`docker-compose-local.yml`: frontend :4000, backend :5080,
postgres :55432) without touching it. That is why it doesn't use `cargo run` and `npm start`: those
take port 4000 and read the repository's `.env`, with the real hub key and the real database in it.

| Part     | Address               | What                                                 |
| -------- | --------------------- | ---------------------------------------------------- |
| Site     | http://localhost:4100 | `site/scripts/server.js --port 4100`                 |
| Backend  | http://localhost:8080 | `server/target/debug/server` (the port is fixed)     |
| Mock hub | http://localhost:7070 | `tools/mock-hub/server.js`, key `ohub_mock_key`      |
| Postgres | 127.0.0.1:55433       | container `map-dev-pg`, user and password `postgres` |

The ports are fixed, so there is one dev stack at a time. Before bringing one up, check that nothing
listens on 4100, 8080, 7070 or 55433; if something does, it is probably a dev stack someone left
running (see [Tear it down](#tear-it-down)).

## Bring it up

From the repository root, in a POSIX shell (Git Bash on Windows). The mock hub, the backend and the
site keep running, so each needs its own terminal or has to be started in the background.

1. **Database**

   ```bash
   docker run -d --name map-dev-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=osrs_tracker -p 127.0.0.1:55433:5432 postgres:17
   ```

2. **Mock hub** (keeps running)

   ```bash
   MOCK_HUB_TRAIL_HOURS=720 node tools/mock-hub/server.js
   ```

3. **Backend** (keeps running). Build it, then start the binary **from an empty directory**: started
   inside the repository it finds `.env` in a parent directory and `config.toml` in the current one,
   and connects to the real hub and database.

   ```bash
   (cd server && cargo build)
   ```

   ```bash
   REPO="$(pwd)" && cd "$(mktemp -d)" && PG_USER=postgres PG_PASSWORD=postgres PG_HOST=127.0.0.1 PG_PORT=55433 PG_DB=osrs_tracker COOKIE_SECURE=false HUB_BASE_URL=http://localhost:7070 HUB_API_KEY=ohub_mock_key "$REPO/server/target/debug/server"
   ```

   Its log should say `Hub sync started: polling http://localhost:7070 every 5s`. If it names another
   hub, stop it: it read a real configuration.

4. **Site** (keeps running). A fresh checkout or worktree needs `npm ci` in `site/` first.

   ```bash
   (cd site && node build.js)
   ```

   ```bash
   node site/scripts/server.js --backend http://127.0.0.1:8080 --port 4100
   ```

5. **Log in.** A new database has no users: open http://localhost:4100/setup and create the first
   admin with a made-up name and password. The login survives backend restarts for as long as the
   database container exists. If nobody remembers the password, remove the container and start over.

## What the mock hub serves

Everything about players is invented by the mock hub; nothing comes from a real hub and nothing is
stored, so a restart gives a new random history. The backend polls it every 5 seconds, as it would
the real one.

- **Accounts**: 12 (`MOCK_HUB_ACCOUNTS`), about 70 % online. Every fourth keeps its inventory,
  equipment and trail private.
- **Positions**: each account circles one place (Lumbridge, Varrock, Zulrah, ...) every 7 minutes.
  The position is a function of the clock, so a trail is computed when asked for, one point a minute,
  back to `MOCK_HUB_TRAIL_HOURS` (default 6; 720 is 30 days, enough to need thinning).
- **Zezima**, the first account, follows a fixed 40-minute lap instead. The minute in the lap is
  `(Date.now() / 60000) % 40`:

  | Minutes | Where                                                                |
  | ------- | -------------------------------------------------------------------- |
  | 0-8     | Walks north from Lumbridge; a level-up at 5                          |
  | 8-12    | Teleport to Falador, walks to Port Sarim                             |
  | 12-18   | Boat trip south                                                      |
  | 18-23   | Teleport to the Slayer Tower, upstairs from 20; a 14.5M drop at 21   |
  | 23-30   | Teleport to Edgeville, into the dungeon at 25; a collection log slot |
  |         | at 27, dies at 29.5                                                  |
  | 30-35   | Respawns in Lumbridge on another world, in Varrock from 32           |
  | 35-40   | Logged out                                                           |

- **Events**: one for a random online account every `MOCK_HUB_EVENT_MS` (default 4000): loot 45 %
  (one in twelve worth 10M or more), level-up 25 %, death 8 %, PK loot 5 %, collection log 5 %, diary
  4 %, combat task 4 %, superior spawn 4 %. At start it also adds 80 random events spread over the
  last 12 hours and Zezima's lap events for the whole trail window. Only deaths and superior spawns
  say where they happened.
- **Skills, XP series, sessions, wealth, equipment**: formulas over the account's number, the same
  on every request.

Not from the mock hub: the map tiles and labels (in `site/public`), the icons (the icon CDN, see the
README) and the Grand Exchange prices (the backend fetches them from prices.runescape.wiki).

## While it runs

- Site change: `node build.js` in `site/`, then reload the page.
- Backend change: `cargo build` in `server/`, then restart the binary (again from an empty directory).
- Mock hub change: restart it, and the backend with it. The backend keeps its place in the event
  feed in memory, and a restarted mock hub starts numbering its events again.
- Data that goes stale: stop the mock hub and wait about four minutes.

## For Claude agents: testing a change in the Browser pane

1. Bring the stack up as above, with the mock hub and the backend as background commands. Start the
   site with `preview_start` and the name `map-dev-site` from `.claude/launch.json` instead of a
   shell command, so it opens in the Browser pane. `preview_start` reads the `launch.json` of the
   folder the session was opened on: in a session opened on a parent folder, put a copy in that
   folder's `.claude/` with the path to `server.js` prefixed, and delete it afterwards.
2. Log in through `/setup`. Make the credentials up, keep them in a scratch file rather than in the
   chat, and give the user that file if they want to look for themselves.
3. Look at the feature. The map is at `/group`; the Players list is on the left, and a click on a
   row selects that player. Zezima is the one to test trails and replays with: work out the minute of
   his lap first, so you know what should be on screen.
4. Read text and structure with `read_page` or `get_page_text`. The map itself is a canvas and needs
   a screenshot.
5. **While the Browser pane is hidden the map does not redraw**: `requestAnimationFrame` does not
   fire, and a screenshot shows a stale or half-loaded canvas. `document.hidden` tells you. Pump
   frames by hand before a screenshot, or ask the user to show the pane:

   ```js
   const map = document.querySelector("canvas-map");
   for (let i = 1; i <= 30; i++) {
     map.updateRequested = 1;
     map._update(performance.now() + i * 16);
   }
   ```

6. Check `read_console_messages` for errors. The bundle defines components in the order of
   `site/src/index.js`, so a component that calls into another one when it connects has to import it;
   the jsdom tests don't catch that, the browser does.
7. Leave the stack running while the user looks, and tear it down when they say so.

## Tear it down

Stop the site (`preview_stop`, or Ctrl+C), the backend and the mock hub, then remove the database:

```bash
docker rm -f map-dev-pg
```

On Windows, a process that was left behind can be found by its port and killed by its PID:

```bash
netstat -ano | grep -E ":(4100|8080|7070) " | grep LISTENING
```

```bash
taskkill //F //PID <pid>
```

## Traps

- `site/build.js` rewrites the tracked `site/public/data/map.json`. Run
  `git checkout -- site/public/data/map.json` before committing, and don't `git add -A`.
- The server's integration tests drop the schema of the database they are pointed at, and without
  `TEST_DATABASE_URL` that is the one from `.env`. Give them a database of their own in the dev
  container: `docker exec map-dev-pg createdb -U postgres group_ironmen_test`, then
  `TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55433/group_ironmen_test cargo test`.
- On a Windows checkout `prettier --check` flags every file with CRLF line endings; run it with
  `--end-of-line auto`.
