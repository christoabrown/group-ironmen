import { GroupData } from "../data/group-data";

// What a player's trail is, apart from how it is drawn: the points the hub
// sampled (about one a minute) joined with the positions seen live, and what
// happened between each two of them. Everything here is in the site's
// coordinates (one tile north of what the plugin reports) and unix seconds.
//
// A point is `{x, y, plane, t0, t1, boat, world, live?}`: the player was on
// the tile from t0 to t1.
// The step from one point to the next is one of:
//   walk      near enough to have been on foot
//   stairs    the same, to another floor
//   sail      both ends on a boat
//   entrance  into or out of the underground, which the game puts 6400 tiles north
//   teleport  further than anyone could have run, or to another part of the map
//   unknown   a gap in the data, or far enough that it may have been either

export const TICK_S = 0.6;
// Running covers two tiles a game tick.
export const RUN_TILES_PER_S = 2 / TICK_S;
// A guess: nothing says how fast a boat goes or what the plugin reports on one.
export const BOAT_TILES_PER_S = 2 * RUN_TILES_PER_S;
// The hub keeps one sample per account per minute.
export const BUCKET_S = 60;
// A sample's time is the start of its minute, so more time may have passed
// than two samples say. Allowing the full minute would hide most teleports.
export const UNCERTAINTY_S = 20;
export const SLACK_TILES = 8;
// Up to this share of the distance a run could cover, it was a run for sure.
export const SURE_FRACTION = 0.75;
// Samples further apart than this are a gap: logged out, or not sharing.
export const GAP_S = 300;
const UNDERGROUND_OFFSET = 6400;
const FLAG_BOAT = 1;
const LIVE_MAX_POINTS = 240;
const LIVE_MAX_AGE_S = 3600;

/**
 * Reads a trail as the server sends it: `{step, points, worlds}` with points
 * `[x, y, plane, unixSeconds, dwell, flags]` (see the server's `trail_json`),
 * or the bare list of `[x, y, plane, unixSeconds]` an older server sends.
 */
export function decodeTrail(raw) {
  const rows = Array.isArray(raw) ? raw : raw?.points || [];
  const worlds = (!Array.isArray(raw) && raw?.worlds) || [];
  const points = [];
  let world = null;
  let nextWorld = 0;
  rows.forEach(([x, y, plane, time, dwell = 0, flags = 0], index) => {
    while (nextWorld < worlds.length && worlds[nextWorld][0] <= index) {
      world = worlds[nextWorld][1];
      nextWorld += 1;
    }
    const coordinates = GroupData.transformCoordinatesFromStorage([x, y, plane]);
    if (
      [coordinates.x, coordinates.y, coordinates.plane, time].some((value) => typeof value !== "number" || isNaN(value))
    ) {
      return;
    }
    points.push({ ...coordinates, t0: time - dwell, t1: time, boat: Boolean(flags & FLAG_BOAT), world });
  });
  return { points, step: (!Array.isArray(raw) && raw?.step) || BUCKET_S };
}

/**
 * The part of the map a tile is in. Each has its own coordinate range, so
 * going from one to another is never a walk across the map.
 */
export function band(x, y) {
  const storedY = y - 1;
  if (x >= 6400) return "instance";
  if (storedY < 4224) return "surface";
  if (storedY >= 8448 && storedY < 10624) return "under";
  return "other";
}

function distance(a, b, shiftY = 0) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - (b.y + shiftY)));
}

/** What happened between two consecutive points; see the top of this file. */
export function classifyStep(a, b, gapS = GAP_S) {
  const elapsed = Math.max(b.t0 - a.t1, 1);
  const speed = a.boat && b.boat ? BOAT_TILES_PER_S : RUN_TILES_PER_S;
  const sure = SURE_FRACTION * speed * elapsed + SLACK_TILES;
  const bandA = band(a.x, a.y);
  const bandB = band(b.x, b.y);
  if (bandA !== bandB) {
    if (bandA !== "instance" && bandB !== "instance" && (bandA === "under" || bandB === "under")) {
      const shift = bandB === "under" ? -UNDERGROUND_OFFSET : UNDERGROUND_OFFSET;
      if ((bandA === "surface" || bandB === "surface") && distance(a, b, shift) <= sure) return "entrance";
    }
    return "teleport";
  }
  const far = distance(a, b);
  if (far > speed * (elapsed + UNCERTAINTY_S) + SLACK_TILES) return "teleport";
  if (elapsed > gapS || far > sure) return "unknown";
  if (a.boat && b.boat) return "sail";
  if (a.plane !== b.plane) return "stairs";
  return "walk";
}

const CONNECTED = new Set(["walk", "stairs", "sail"]);

/**
 * Classifies every step of a trail. `runs` are the stretches drawn as one
 * line (`{i0, i1, sail}`, point indices; a boat trip is its own run and
 * shares its end points with the walks around it; a run may be one point),
 * `jumps` the steps between runs (`{from, kind}`, from point `from` to the
 * next). `step` is the server's thinning stride, so that the wider spacing
 * of a thinned trail isn't taken for gaps.
 */
export function buildTrailModel(points, { step = BUCKET_S } = {}) {
  const gapS = Math.max(GAP_S, 3 * step);
  const kinds = [];
  for (let i = 0; i + 1 < points.length; i++) {
    kinds.push(classifyStep(points[i], points[i + 1], gapS));
  }
  const runs = [];
  const jumps = [];
  let start = 0;
  for (let i = 0; i < points.length; i++) {
    const kind = kinds[i];
    if (i === points.length - 1 || !CONNECTED.has(kind)) {
      if (i === start || kinds[start] === undefined) {
        runs.push({ i0: start, i1: i, sail: false });
      } else {
        // Split the chain wherever sailing starts or stops.
        let from = start;
        for (let j = start + 1; j <= i; j++) {
          if (j === i || (kinds[j] === "sail") !== (kinds[from] === "sail")) {
            runs.push({ i0: from, i1: j, sail: kinds[from] === "sail" });
            from = j;
          }
        }
      }
      if (i < points.length - 1) jumps.push({ from: i, kind });
      start = i + 1;
    }
  }
  return {
    points,
    kinds,
    runs,
    jumps,
    gapS,
    tMin: points.length ? points[0].t0 : null,
    tMax: points.length ? points[points.length - 1].t1 : null,
  };
}

function sameTile(a, b) {
  return a.x === b.x && a.y === b.y && a.plane === b.plane;
}

/**
 * Notes where a player is now in their buffer of live points. Returns whether
 * they moved to another tile.
 */
export function observeLive(buffer, coordinates, nowS, { maxPoints = LIVE_MAX_POINTS, maxAgeS = LIVE_MAX_AGE_S } = {}) {
  const last = buffer[buffer.length - 1];
  let moved = false;
  if (last && sameTile(last, coordinates) && last.boat === Boolean(coordinates.boat)) {
    last.t1 = Math.max(last.t1, nowS);
  } else {
    const time = last ? Math.max(nowS, last.t1) : nowS;
    buffer.push({
      x: coordinates.x,
      y: coordinates.y,
      plane: coordinates.plane,
      boat: Boolean(coordinates.boat),
      world: coordinates.world ?? null,
      t0: time,
      t1: time,
      live: true,
    });
    moved = true;
  }
  let drop = Math.max(0, buffer.length - maxPoints);
  while (drop < buffer.length - 1 && buffer[drop].t1 < nowS - maxAgeS) drop += 1;
  if (drop) buffer.splice(0, drop);
  return moved;
}

/**
 * The hub's history followed by what was seen live since. The hub wins for
 * every minute it has sampled; `head` (`{x, y, plane, boat, world, t}`, where
 * the marker is while the player is online) is always the last point, so the
 * trail ends on the marker.
 */
export function mergeTrail(history, live, head) {
  const merged = history.slice();
  const cutoff = history.length ? history[history.length - 1].t1 + BUCKET_S : -Infinity;
  const append = (point) => {
    const last = merged[merged.length - 1];
    if (last && sameTile(last, point) && last.boat === point.boat) {
      merged[merged.length - 1] = { ...last, t1: Math.max(last.t1, point.t1) };
    } else {
      const t0 = last ? Math.max(point.t0, last.t1) : point.t0;
      merged.push({ ...point, t0, t1: Math.max(point.t1, t0) });
    }
  };
  for (const point of live) {
    if (point.t1 > cutoff) append(point);
  }
  if (head) {
    const { t, ...position } = head;
    append({ world: null, ...position, boat: Boolean(head.boat), t0: t, t1: t, live: true });
  }
  return merged;
}

/** The index of the last point reached by time t, or -1. */
export function indexAt(points, t) {
  let low = 0;
  let high = points.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (points[middle].t0 <= t) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
}

/**
 * Where the player was at time t: `{index, frac, kind, x, y, plane, moving}`.
 * On a tile `frac` is 0; under way it is how far the step from point `index`
 * to the next has got (0..1) and `kind` what that step is. The position is
 * interpolated on steps that are drawn as a line and stays at the start of a
 * jump. Null before the trail starts.
 */
export function positionAt(model, t) {
  const { points, kinds } = model;
  const index = indexAt(points, t);
  if (index < 0) return null;
  const point = points[index];
  const next = points[index + 1];
  if (!next || t <= point.t1) {
    return { index, frac: 0, kind: null, x: point.x, y: point.y, plane: point.plane, moving: false };
  }
  const frac = (t - point.t1) / Math.max(next.t0 - point.t1, 1e-9);
  const kind = kinds[index];
  const along = CONNECTED.has(kind) ? frac : 0;
  return {
    index,
    frac,
    kind,
    x: point.x + (next.x - point.x) * along,
    y: point.y + (next.y - point.y) * along,
    plane: along < 1 ? point.plane : next.plane,
    moving: true,
  };
}

/**
 * When something next happens on the trail at or after t: t itself while the
 * player is under way, the end of the stay or of the gap in the data while
 * nothing is happening, null after the last point.
 */
export function nextChangeAfter(model, t) {
  const { points, kinds, gapS } = model;
  if (!points.length) return null;
  const index = indexAt(points, t);
  if (index < 0) return points[0].t0;
  const next = points[index + 1];
  if (!next) return null;
  if (t <= points[index].t1) return points[index].t1;
  if (kinds[index] === "unknown" && next.t0 - points[index].t1 > gapS) return next.t0;
  return t;
}

/** A member's deaths that have a place: `[{id, x, y, plane, t}]`, from hub events. */
export function deathMarks(events, member) {
  const marks = [];
  for (const event of events) {
    if (event.type !== "death" || event.member !== member || !event.location) continue;
    const position = GroupData.transformCoordinatesFromStorage([
      event.location.x,
      event.location.y,
      event.location.plane || 0,
    ]);
    const t = Date.parse(event.occurred_at) / 1000;
    if (isNaN(t) || isNaN(position.x) || isNaN(position.y)) continue;
    marks.push({ id: event.id, ...position, t });
  }
  return marks.sort((a, b) => a.t - b.t);
}

/** The moments worth a tick on the replay timeline: `[{t, kind}]`, oldest first. */
export function timelineTicks(model, deaths = []) {
  const ticks = model.jumps
    .filter((jump) => jump.kind === "teleport")
    .map((jump) => ({ t: model.points[jump.from + 1].t0, kind: "teleport" }));
  for (const death of deaths) ticks.push({ t: death.t, kind: "death" });
  return ticks.sort((a, b) => a.t - b.t);
}

/** "14:32", or "14:10 – 14:32" for a stay; with the day when it wasn't today. */
export function formatTrailTime(t0, t1, nowS = Date.now() / 1000) {
  const today = new Date(nowS * 1000).toDateString();
  const format = (t, withDay) => {
    const date = new Date(t * 1000);
    const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (!withDay || date.toDateString() === today) return time;
    return `${date.toLocaleDateString([], { day: "numeric", month: "short" })} ${time}`;
  };
  if (t1 - t0 < BUCKET_S) return format(t1, true);
  const sameDay = new Date(t0 * 1000).toDateString() === new Date(t1 * 1000).toDateString();
  return `${format(t0, true)} – ${format(t1, !sameDay)}`;
}
