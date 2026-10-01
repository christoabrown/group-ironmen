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

## Before committing

- `site/build.js` rewrites the tracked `site/public/data/map.json`: run
  `git checkout -- site/public/data/map.json` first, and don't `git add -A`.
- The server's integration tests drop the schema of their database. Always set `TEST_DATABASE_URL`
  to a throwaway one (see the traps in docs/DEV-STACK.md).
- Checks: `npm test`, `npm run lint` and `npm run format:check` in `site/`; `cargo test` in `server/`.
