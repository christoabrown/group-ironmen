# Map events that shine

## Context

Events on the map are easy to miss. An event is a 2.4 s ring plus a 20 s text label drawn on the canvas: no icon, no hover, nothing to click. Only deaths linger (10 minutes, a hand-drawn skull) and only deaths reach trails and replay (a red X). There is no toast system.

Intended outcome: events are first-class things on the map. They get an icon, stay for 30 minutes, sit on a player's trail, can be hovered and clicked, show up in replay, and announce themselves with a toast.

### Decisions already made
- **Marker lifetime** on the live map is 30 minutes, fading over the last 5.
- **Toasts** are on the map page only, about 8 s, using the map's filters plus a new Toasts checkbox.
- **Extras in scope:** click to jump, big-drop emphasis, replay integration, surviving a reload.
- **Out of scope:** hub API changes, site-wide toasts, sound.

### Limits accepted
- **History depth.** The hub gives a player's newest 200 events with no date range, and the backend buffers 1000 guild-wide. On 7 and 30 day trails the older stretch has no events. Fixing it needs a hub change.
- **Positions.** Only `death` and `superior_spawn` carry a location. Other events are placed where the player stands when the event arrives (live), or by timestamp along the trail (history, accurate to about a minute of movement). Marks placed by guesswork are flagged "approximate".

## Design

### One marker, two sizes
A dark disc with the player's colour as border and an icon inside.
- **Full badge** (26 px) for anything under 30 minutes old. It hangs just below the tile, where ping labels went, so it covers neither the player dot nor the name label above it.
- **Compact** (r = 8, centred on the tile) for older events on a trail, so a long trail isn't buried.
- The red X on trails and the hand-drawn skull are removed; this replaces both.

### Icons
No new assets.

| Event | Icon |
|---|---|
| loot, pk_loot, collection_log | item icon from `item_id`, else `items[0].id`; collection log falls back to item 22711 |
| level_up | skill icon |
| death | local `/icons/1046-0.png` (skull and crossbones) |
| superior_spawn | slayer skill icon |
| achievement_diary | item 19476 (Achievement diary cape) |
| combat_task | local `/icons/3399-0.png` (sword sprite) |

With icons disabled (`ICONS_BASE_URL=""`) the local ones still draw and the rest fall back to a plain coloured disc. Nothing reads pixels back from the map canvas, so cross-origin icons are drawn without `crossOrigin`.

### Tiers
- **Tier 1:** loot of 1M or more, or any collection log slot. Gold border.
- **Tier 2:** loot of 10M or more. Larger badge, gold glow, gold rings on arrival, toast stays 15 s.

Nothing pulses forever: animation runs only while an event is fresh, so an idle map does not redraw at 60 fps.

### Stacking
Markers within 24 px collapse into one badge with a count (five drops on one boss tile are otherwise exactly on top of each other, and zooming never separates them). The top of a stack is the highest tier, then the newest.

### Hover and click
- Hover shows the shared `rs-tooltip`: icon, the event line, time, value, up to 3 items, source, region, and "position approximate" where that applies. A stack lists its events.
- The tooltip is shown once per hovered marker, like the map-link tooltip, not on every mouse move: it holds an image.
- Click selects the player and centres the event.
- Hover priority: map link, player, event, trail.

### Toasts (`site/src/event-toasts/`)
Bottom-right, map page only. Icon, event line, player-colour edge, tier styling. 8 s (15 s for tier 2), pauses on hover, at most 4, click jumps to the event. It shifts left when the profile drawer or a right-docked roster occupies that corner.

### Fresh means recent
A ring and a toast fire only for events whose `occurred_at` is under 90 s old. A tab that was hidden can receive 200 events in one poll; those must not all fire.

### Trail and replay
- All event kinds sit on the trail, honouring the same filters.
- In replay, marks ahead of the cursor are dim and pop their ring as the ghost passes (at most 3 at once).
- All kinds become scrubber ticks. Under the tick cap, deaths are kept first, then tiered events, then teleports, then the rest.
- "Skip idle" stops before an event instead of jumping over it.

### Surviving a reload
`canvas-map` is mounted for the whole session, so it owns the markers and subscribes to `live-events` itself. Opening the map, or coming back from another page, shows the last 30 minutes with no rings and no toasts. Positions first placed in this browser are remembered in localStorage, so a reload restores them exactly.

### Site modules

| File | Role |
|---|---|
| `data/event-view.js` | Pure. Kinds, filters, tier, icon, label, place, tooltip HTML. |
| `canvas-map/event-markers.js` | Pure. The marker store, lifetime, stacking and layout. |
| `canvas-map/icon-cache.js` | Loaded images by URL, with an injectable image factory. |
| `canvas-map/event-marker-renderer.js` | Canvas only. Draws the laid-out markers in screen pixels. |
| `event-toasts/` | The toast stack. |

`canvas-map.js` loses `pings`, `addPing`, `pingAlive`, `drawPings` and `drawDeathMarker`. The trail modules lose `deathMarks`, `setDeaths`, `deathsOn` and `drawDeaths`.

### Constants

| Name | Value |
|---|---|
| `EVENT_MARKER_MS` | 30 min |
| `EVENT_FADE_MS` | 5 min |
| `EVENT_RING_MS` | 2400 |
| `EVENT_LABEL_MS` | 20 s |
| `EVENT_FRESH_MS` | 90 s |
| `EVENT_STACK_PX` | 24 |
| `EVENT_MARKERS_MAX` | 200 |
| `EVENT_WAKE_MS` | 10 s |
| `REPLAY_POP_MAX` | 3 |
| `EVENT_TIER_GP` | 1M, 10M |
| `TOAST_MS` / `TOAST_NOTABLE_MS` / `TOAST_MAX` | 8 s / 15 s / 4 |
| `TRAIL_EVENTS_LIMIT` | 200 |
| `TRAIL_EVENTS_REFRESH_MS` | 10 min |

Removed: `PING_RING_MS`, `PING_LABEL_MS`, `DEATH_MARKER_MS`, `TRAIL_DEATHS_LIMIT`, `DEATH_RED`.

## Build sequence
Branch `red/map-events`, one commit per step, tests first in each. Each step leaves CI green (`npm run format:check`, `lint`, `test`, `bundle`).

0. This spec.
1. `event-view.js` and tests; `event-feed` uses its icons.
2. Mock hub: the missing event types, cheaper drops, fixed events on the routed account's lap.
3. Toasts, the Toasts checkbox, and the checkbox markup fix.
4. Marker store and layout.
5. Icon cache and renderer.
6. Canvas integration: markers replace pings; the first live-events load asks for 300.
7. Hover and click.
8. Trail events: marks from per-player events, placed by time.
9. Replay: pops, dimming, ticks, skip-idle.
10. Remembered positions.
11. Docs.

## Tests
- New: `site/test/event-view.test.js`, `event-toasts.test.js`, `event-markers.test.js`, `event-marker-renderer.test.js`.
- Updated: `live-map.test.js` (the "event pings" block), `map-page-trails.test.js`, `trail-model.test.js`, `trail-layer.test.js`, `trail-renderer.test.js`, `trail-scrubber.test.js`, `canvas-map.test.js`.
- Existing tests build `new CanvasMap()` without `connectedCallback`, so the marker store is created lazily and the marker pass returns early when it is empty.
- `map-page-trails.test.js` asserts no timers are left running, so `map-page` starts no interval of its own.

## Verification
1. `MOCK_HUB_EVENT_MS=3000 node tools/mock-hub/server.js`
2. Backend against the mock: `HUB_BASE_URL=http://localhost:7070 HUB_API_KEY=ohub_mock_key`.
3. Open the map. A badge with an icon appears under a player, with a ring and a label; a toast appears bottom-right; the name label stays readable.
4. Hover shows the tooltip without flicker; click selects the player and centres the event; a toast click does the same.
5. Loot, minimum drop and Toasts toggles hide and restore markers, and the checkboxes show their state.
6. Open a profile, then dock the roster right: toasts move clear both times.
7. Visit another page for a minute and return: that minute's events sit where they happened. Reload: markers return with no rings or toasts.
8. Switch on the routed account's trail: events sit on the path with no duplicate at the head. Replay with Skip idle: marks ahead are dim, pop as the ghost passes, and match the ticks.
9. `ICONS_BASE_URL=""`: the skull still draws, other kinds fall back to discs.

## As built
Where the implementation differs from the plan above:
- **The marker's disc is the brown of the game's inventory**, not dark blue: item sprites were drawn against it, and dark ones (a draconic visage) vanished on the dark disc.
- **A clicked event comes to the middle of what the profile drawer leaves of the map.** The click selects the player, which opens the drawer over the middle of a narrow window.
- **A marker has a short stem** from the tile it belongs to down to its badge.
- **The feed starting over clears the live markers.** That is a backend restart or a log-in to another group; remembered places put them back where they were.
- **An event whose player isn't on the map yet is placed when they turn up**, on the next roster update, as a guess unless it only just happened.
- **`trail-layer` keeps the raw events and places them itself** (`setEvents`, `marksOn`), so marks follow the trail as it grows; `canvas-map` copies them into the marker store whenever the trails change. The map page hands over events with `setTrailEvents(Map)`.
- **The scrubber's tick classes** are `--loot`, `--level`, `--other`, `--death` and `--notable`.
- **`event-places.js`** holds the remembered places (localStorage `map-event-places`).
- **The replay doesn't hold on an event.** It rings (at most three at once) and goes on.
- **The filter checkboxes had no visible state**, as suspected: the input sat inside its label. Fixed here and for the replay's Follow and Skip idle.

Checked in a browser against the mock hub: markers, stacks, the tooltip, click and toast click, the Toasts toggle, toasts beside the profile drawer and beside a roster docked right, a reload, another page and back, events on a trail, and the replay's ticks, dimming and rings. Not checked in a browser, only in tests: expiry after half an hour and `ICONS_BASE_URL=""`.

## Risks and limits
- Whether `occurred_at` and the browser clock agree well enough for the 90 s freshness test is unverified.
- Which `item_id` a real `collection_log` event carries, and the hub's `tier` strings, are unverified; the mock invents both.
- ~~Events older than a player's newest 200 are missing on long trails.~~ Lifted with the hub's time-range read of `/events` (hub D-98): the backend now reads a trail's events over its whole length, at most 2000 drops and 2000 other events per player. Markers are stacked in one pass and culled to the view first, so that many of them don't slow the map.
