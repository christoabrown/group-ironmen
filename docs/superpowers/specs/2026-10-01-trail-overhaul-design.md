# Trail overhaul: live, teleports, comet ribbon, replay

## Context

The map's player trail is a plain polyline fed by a separate, slow data path. Three things are wrong with it today:

- **It is not live.** The trail refetches every 60 s behind a 60 s backend cache, on top of the hub storing one position per minute. Nothing appends the live marker position to the trail, so the line ends short of the player and can lag about 3 minutes. Trail selection is memory-only, so a reload starts with no trails.
- **Teleports are not represented.** The only handling is "break the line when two points are more than 40 tiles apart", and runs of fewer than 2 points are dropped. At one sample a minute, ordinary running (up to 200 tiles/min) is cut as if it were a teleport, which is why lines end and reappear and why a trail sometimes shows nothing.
- **It looks crude.** Straight `lineTo` segments, one flat colour, the timestamps are fetched but unused.

Intended outcome: a trail that always joins the player marker, survives reload, draws teleports instead of gaps, and looks good; plus hover inspection and a Hero's Path style replay.

### Decisions already made
- **No hub or plugin change.** Map backend and site only. The backend passes through `world` and `is_on_boat`, which the hub already returns and the backend currently drops.
- **Look:** "comet ribbon" live; "hero's path" while the replay scrubber is open.
- **Extras in scope:** hover to inspect, replay scrubber, sailing segments, other-floor ghosting, death marks from the events the map already receives.
- **Accepted limit:** with one sample a minute, a teleport shorter than about a minute's run cannot be told from a run with certainty (see "Classifying steps").

## Design

### Backend (`server/src/hub/`)
- `models.rs`: `HubLocationPoint` gains `#[serde(default)] world: Option<i32>` and `is_on_boat: Option<bool>`.
- `proxy.rs`: replace `thin_trail` with `merge_stays` + a break-aware `thin_trail`.
  - A point becomes `[x, y, plane, t, dwell?, flags?]`, trailing zeros omitted. `t` keeps today's meaning; `dwell` is seconds spent on the tile (today the arrival time is overwritten at `proxy.rs:419`); `flags` bit 0 is on-boat. The old site reads the first four values and ignores the rest, so backend and site can deploy in either order.
  - Per trail: `step` (thinning stride in seconds, 60 = not thinned), `truncated`, and `worlds` as a run-length list `[pointIndex, world]`.
  - Thinning never drops the first or last point or either end of a "break" (band change, boat change, world change, gap over 300 s, or distance over 0.75 × run speed × elapsed). Strides are taken on an absolute time grid so the result is stable as the window slides.
- `cache.rs`: `get_or_fetch_dated` returns the value with its age; the response gains `as_of`, so the site can say when it is showing stale hub data instead of serving it silently.
- The existing test `trail_drops_repeats_and_is_capped` (`proxy.rs:772`) uses non-monotonic timestamps and must be rewritten.

### Site modules (new, under `site/src/canvas-map/`)
`canvas-map.js` is already 1630 lines, so the trail moves out of it.

| File | Role |
|---|---|
| `trail-model.js` | Pure. Decode v1/v2 points, classify steps, merge history with live points, time lookup (`positionAt`, `nextChangeAfter`), death marks, timeline ticks. |
| `trail-geometry.js` | Pure. Smoothing, arcs, wave path, decimation by zoom, hit-testing. No `Path2D` (jsdom has none). |
| `trail-renderer.js` | Canvas only. `drawTrail` (world space) and `drawTrailOverlay` (screen space) for live and replay modes. |
| `trail-layer.js` | State. Owns trails, live buffers, replay time, hover; `draw()` returns whether it is animating. |

`CanvasMap` keeps thin delegates (`setTrail`, `clearTrail(s)`, `setTrailDeaths`, `setReplayTime`, `trailTimeline`, `getTrailAtClient`) and three hooks: `_update` (draw + overlay + frame gate), `handleUpdatedCoordinates`/`handleUpdatedMembers` (feed live points), `onPointerMove` (hover, after the link and player checks at `canvas-map.js:1464-1488`). `TRAIL_MAX_STEP_TILES`, `trailSegments` and the old `drawTrails` body are removed.

### Classifying steps (`trail-model.js`)
Each step between consecutive points gets one kind, checked in this order:

1. **entrance** — crosses between the surface band (storage `y` < 4224) and the underground band (8448..10624), and is walkable once shifted by 6400. Drawn as a ring at each end.
2. **teleport** — any other band or instance (`x >= 6400`) crossing, or distance beyond `run × (dt + 20 s) + 8` tiles (about 275 tiles at 60 s). Drawn as a dashed arc with a burst at both ends. Cross-band teleports get a short fading stub at each end instead, since a full arc would span 6400 tiles.
3. **unknown** — a data gap over 5 minutes, or distance between `0.75 × run × dt + 8` (about 158 tiles at 60 s) and the teleport bound. Drawn as a faint dotted straight link: honest about not knowing. Lumbridge to Varrock (206 tiles) lands here.
4. **sail** — both ends on a boat. Wavy dashed sea line.
5. **stairs** — plane differs. Continues the ribbon; the other-plane part is drawn faint.
6. **walk** — everything else. Smooth ribbon.

Runs of walk/stairs/sail may be a single point, drawn as a dot, which fixes the "trail shows nothing" case. Smoothing is centripetal Catmull-Rom with handles clamped to 0.4 of the chord, per run only, never across a jump.

### Live updates
- `TrailLayer.observe(name, point, online)` records every member's live position (cap 240 points / 60 minutes), stamped with the server clock derived from the `cursor` in each `/get-group-data` response (`server/src/db.rs:174`), so no backend change is needed.
- `mergeTrail(history, live, head)`: hub history wins for any minute it has sampled; newer live points are appended; the marker position is always the last point while the member is online, so the head joins the marker.
- Live points are only drawn for members whose history came back `shared: true`, so a private `location_history` is not leaked through the live path.
- On logout the glow goes and a hollow end cap marks the last point.

### Reload and robustness fixes (`selection.js`, `map-page.js`, `app-initializer.js`)
- Persist selected names and the days window in localStorage; `selection.restore()` runs after `cleanup()` and publishes `trails-changed`.
- `loadTrails` bumps `trailRequestId` first (today the empty-selection path at `map-page.js:165-169` does not, so an in-flight response can redraw cleared trails).
- On fetch error keep drawn trails but mark the chips, show data age from `as_of`, and retry with backoff instead of a fixed interval.
- `retainTrails` ignores an empty roster so a slow first poll cannot wipe the restored selection.

### Rendering
- **Live (comet ribbon):** dark outline then player colour, alpha and width tapering with age in 12 bands, light core for the last 10 minutes, soft head glow, start dot. Flowing chevrons on the selected player's trail only, static under `prefers-reduced-motion`.
- **Replay (hero's path):** whole route faint; even bright line with a light core up to the scrub time; ghost marker at that time; arcs drawn by fraction elapsed.
- **Death marks:** red X, from `api.getHubEvents({types: ["death"], limit: 500})` plus live death events, respecting the existing "Deaths" filter.
- **Cost control:** geometry cached per trail and rebuilt only on change, chunked bounding boxes for view culling, decimation at low zoom, animation frames gated to about 25 fps and only while something animates.

### Hover
Screen-space nearest-point test within 8 px, priority link → player → trail. Tooltip: name, time (or time range for a stay), `regionName`, plane, world, "on a boat". Hover only; clicks are unchanged.

### Replay scrubber (`site/src/trail-scrubber/`, registered in `components.json`)
- A "Replay" toggle next to Clear in `.map-page__trails`; `<trail-scrubber>` as a second row in `.map-page__container`.
- Play/pause, native range (unix seconds) with tick marks for teleports and deaths, time readout, speed select (1 min/s to 2 h/s, default by window), "Skip idle", close.
- Pure `ReplayClock` (`replay-clock.js`): closed → paused → playing / scrubbing; follows the live edge when parked at the end.
- One shared clock for all selected trails, one ghost per trail. Window or selection changes keep the absolute time when it is still in range.
- Note: `BaseElement.eventListener` binds one handler per (element, event name) (`base-element.js:55-72`), so the scrubber must not double-bind.

### Mock hub (`tools/mock-hub/server.js`)
`trail()` currently regenerates shifted points on every call. Make timestamps minute-aligned and add a repeating itinerary for one account shared by snapshot and trail: walk, teleport, sail, plane change, dungeon entrance, death with respawn, and a 6-minute gap. `MOCK_HUB_TRAIL_HOURS` controls length (720 exercises thinning).

## Build sequence
Work on a new branch `trail-overhaul`, one commit per step, no push. Each step leaves CI green (`cargo fmt/test`; `npm run format:check`, `lint`, `test`, `bundle`). Site lint is `ecmaVersion: 2020`: no class fields or `??=`.

0. Spec at `docs/superpowers/specs/2026-10-01-trail-overhaul-design.md` (repo convention), from this plan.
1. Backend: models, `merge_stays`, break-aware thinning, v2 JSON, `as_of`, Rust tests. Old site keeps working.
2. Mock hub itinerary and stable timestamps.
3. Reload and robustness fixes. Reproduce "reload too fast" against the mock hub first, and confirm which candidate cause it is before fixing.
4. `trail-model.js` + tests.
5. `trail-geometry.js` + tests.
6. Renderer, layer, `CanvasMap` wiring for history: ribbon, jumps, faint planes, sail line, single-point runs.
7. Live append and head join.
8. Chevrons and frame gate.
9. Hover.
10. Death marks.
11. Scrubber and replay drawing.
12. Docs: `README.md`, `docs/hub-integration/HUB_INTEGRATION.md`, guild-rework spec lines 171 and 314-318.

## Tests
- New: `site/test/trail-model.test.js`, `trail-geometry.test.js`, `trail-renderer.test.js` (recording ctx), `trail-layer.test.js`, `trail-scrubber.test.js`, `map-page-trails.test.js`.
- Updated: `site/test/canvas-map.test.js:1454-1490` (trail block rewritten), `site/test/live-map.test.js` (persist/restore).
- Rust: stays keep dwell; both ends of a teleport survive thinning; boat/world transitions kept; stable under a sliding window; truncation; JSON omits trailing defaults; cache reports age.
- Existing tests build `new CanvasMap()` without `connectedCallback` and call `_update` with a minimal mock ctx (`canvas-map.test.js:587-621`), so trail hooks must be no-ops with no trails.

## Verification
1. `MOCK_HUB_TRAIL_HOURS=720 node tools/mock-hub/server.js`
2. Backend: `HUB_BASE_URL=http://localhost:7070 HUB_API_KEY=ohub_mock_key cargo run` in `server/`
3. `npm start` in `site/`, open the map in the browser pane.
4. Select a trail at 7 days, reload immediately: chips and trail return.
5. Check each itinerary feature: arc with bursts, dotted unknown link, sea line, faint other-floor part, entrance rings, red X.
6. Watch two minutes: the head stays on the marker across a refetch, with no jump.
7. Stop the mock hub: chips show the data age; trails stay drawn.
8. Hover the trail for time and place. Open Replay: play, drag, change speed, change window.
9. Full CI commands pass.

## Risks and limits
- Thresholds (158 / 275 tiles at 60 s) are estimates; calibrate on real trails once deployed.
- What coordinates the plugin reports on a boat is unverified; sail segments are classified by flag only.
- Chevrons redraw the whole map at 25 fps. Fallback if too heavy: a separate overlay canvas.
- Deaths older than the backend's 1000-event buffer are missing on 7 and 30 day trails.
- Thinned 7 and 30 day replays have coarse timing.
