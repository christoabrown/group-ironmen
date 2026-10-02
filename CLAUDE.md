# ha-osrs-map

Guild live map for Old School RuneScape: a Rust backend (`server/`) that syncs players from
osrs-data-hub, and a web-component frontend (`site/`). The README has the overview and the commands.

## Seeing a change in a browser

Use the dev stack in [docs/DEV-STACK.md](docs/DEV-STACK.md): the checked-out code on
http://localhost:4100 with a throwaway database and the mock hub (`tools/mock-hub/server.js`), which
serves moving players, trails and a new event every few seconds. The document has the bring-up
steps, what the mock data looks like, how to test through the Browser pane, and the teardown.

Don't start the backend with `cargo run`, or from anywhere inside the repository, to look at a
change: it reads the repository's `.env`, which holds the real hub key and the real database. Ports
4000, 5080 and 55432 belong to the user's own docker stack; leave them alone.

With the `osrs-dev-stack` repository checked out next to this one, the same stack is one command,
and so is the map behind a real hub (`../osrs-dev-stack/README.md`):

```bash
node ../osrs-dev-stack/stack.mjs up map      # this checkout on :4100 with the mock hub
node ../osrs-dev-stack/stack.mjs up full     # the same map, reading from a local osrs-data-hub
node ../osrs-dev-stack/stack.mjs restart map # rebuilds backend and site after a change
node ../osrs-dev-stack/stack.mjs down
```

In both, "Log in with Discord" leads to a stand-in: pick Mock Admin. `up full` also starts Home
Assistant and a fake plugin that keeps three players walking; they reach the map through the hub.

## Chain tests: the map behind a real hub

The mock hub is written by hand after the hub's API, so it can drift from it, and the map's own
tests only know the mock. The dev stack's checks run the map against a real local hub and follow one
rule each from the plugin to this map. Before calling a change done, run what follows it:

| You changed | Run | What it proves |
| --- | --- | --- |
| The hub client, sync or conversion (`server/src/hub/`) | `up map` and `smoke map`, then `up full` and `smoke` | The map shows the mock hub's players, and a player sent through a real hub at the position it was sent. If only one of the two passes, the mock hub and the hub disagree |
| Login, sessions, the admin gate (`discord_routes.rs`, `auth_*.rs`, `hub/members.rs`) | `chain auth`, with `up map` and with `up full` | Admin, member and stranger get what they should; with a real hub, someone it has never seen is turned away |
| The roster, online and offline | `chain presence` (needs `up full`) | A client that stops without a logout goes offline here about a minute later |
| How a player's position is taken over from the hub | `chain privacy` (needs `up full`) | Where a player goes while their location is private in the hub never shows here |
| The site only | `restart map`, then look at http://localhost:4100/guild | |

`node ../osrs-dev-stack/stack.mjs smoke` and `… chain <name>` print `PASS` or `FAIL` per step and exit
1 on a failure. A `FAIL` is yours to explain before going on. A `KNOWN` line is a gap that is already
written down in the stack's README. One is about this repository: the map keeps showing the last
position of a player whose location was made private in the hub.

## Before committing

- `site/build.js` rewrites the tracked `site/public/data/map.json`: run
  `git checkout -- site/public/data/map.json` first, and don't `git add -A`.
- The server's integration tests drop the schema of their database. Always set `TEST_DATABASE_URL`
  to a throwaway one (see the traps in docs/DEV-STACK.md).
- Checks: `npm test`, `npm run lint` and `npm run format:check` in `site/`; `cargo test` in `server/`.
