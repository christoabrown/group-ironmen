import { eventIsFresh, eventKind, eventLabel, eventPasses, eventTier, eventTimeMs } from "../data/event-view";

// How long an event stays on the live map, and over how much of the end of
// that it fades.
export const EVENT_MARKER_MS = 30 * 60 * 1000;

export const EVENT_FADE_MS = 5 * 60 * 1000;

// The rings of an event that just happened, and how long its words stay.
export const EVENT_RING_MS = 2400;

export const EVENT_LABEL_MS = 20000;

// Markers closer than this on screen are drawn as one, with a count.
const EVENT_STACK_PX = 24;

export const EVENT_MARKERS_MAX = 200;

// With nothing moving, the map is still redrawn this often so markers fade and go.
export const EVENT_WAKE_MS = 10000;

export const EVENT_FRAME_MS = 40;

// A replay that passes several events at once rings for the last few only.
export const REPLAY_POP_MAX = 3;

// The radius of a marker: an everyday event, a big drop, and one from longer
// ago on a trail.
export const MARKER_RADIUS = 13;

export const MARKER_RADIUS_BIG = 16;

export const MARKER_RADIUS_COMPACT = 8;

const FADED_ALPHA = 0.15;
const AHEAD_ALPHA = 0.3;
const OTHER_FLOOR_ALPHA = 0.35;
const OFFSCREEN_PAD = 60;

/**
 * Groups screen points that are close together. `points` are
 * `{x, y, plane, ...}`; returns `{x, y, plane, members}` with the members'
 * average position. Only points on the same plane are grouped.
 */
export function clusterPoints(points, cellPx) {
  const cells = new Map();
  for (const point of points) {
    const key = `${point.plane}:${Math.floor(point.x / cellPx)}:${Math.floor(point.y / cellPx)}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(point);
  }
  // Merge neighbouring cells whose groups are within one cell of each other.
  const groups = [...cells.values()].map((members) => ({ members }));
  const center = (members) => [
    members.reduce((sum, m) => sum + m.x, 0) / members.length,
    members.reduce((sum, m) => sum + m.y, 0) / members.length,
  ];
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        if (groups[i].members[0].plane !== groups[j].members[0].plane) continue;
        const [ax, ay] = center(groups[i].members);
        const [bx, by] = center(groups[j].members);
        if (Math.abs(ax - bx) < cellPx && Math.abs(ay - by) < cellPx) {
          groups[i].members.push(...groups[j].members);
          groups.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
  }
  return groups.map(({ members }) => {
    const [x, y] = center(members);
    return { x, y, plane: members[0].plane, members };
  });
}

/**
 * Stacks screen points that are within `px` of each other: `points` are
 * `{x, y, plane, ...}`; returns `{x, y, plane, members}`, each at the place of
 * its first member. One pass over the points, whatever their number: a
 * month of a trail's events is thousands of them.
 */
export function stackPoints(points, px) {
  const cells = new Map();
  const stacks = [];
  for (const point of points) {
    const cellX = Math.floor(point.x / px);
    const cellY = Math.floor(point.y / px);
    let stack = null;
    // A stack this close has its first member in this cell or one next to it.
    for (let dx = -1; dx <= 1 && !stack; dx++) {
      for (let dy = -1; dy <= 1 && !stack; dy++) {
        const near = cells.get(`${point.plane}:${cellX + dx}:${cellY + dy}`);
        stack = near?.find((other) => Math.abs(other.x - point.x) < px && Math.abs(other.y - point.y) < px) || null;
      }
    }
    if (stack) {
      stack.members.push(point);
      continue;
    }
    stack = { x: point.x, y: point.y, plane: point.plane, members: [point] };
    stacks.push(stack);
    const key = `${point.plane}:${cellX}:${cellY}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(stack);
  }
  return stacks;
}

/** How strongly a marker on the live map is drawn at an age: 1, fading towards its end, then 0. */
export function markerAlpha(ageMs) {
  if (ageMs >= EVENT_MARKER_MS) return 0;
  const left = EVENT_MARKER_MS - ageMs;
  if (left >= EVENT_FADE_MS) return 1;
  return FADED_ALPHA + (1 - FADED_ALPHA) * (left / EVENT_FADE_MS);
}

/**
 * The events on the map. Those of the last half hour, as the live feed brings
 * them (`add`), and those on the trails shown (`setTrailMarks`), which stay
 * for as long as their trail does. Times are in ms by one clock: the server's.
 */
export class EventMarkers {
  constructor() {
    this.live = new Map();
    this.trails = new Map();
    this.pops = new Map();
  }

  /**
   * Puts events on the live map that aren't on it yet. `place(event)` says
   * where: `{x, y, plane, color, known}` in the site's coordinates (`known`
   * when that is where it happened, not merely where the player is now), or
   * null when there is no telling. With `news`, events that only just
   * happened get their rings and their words. Returns the markers added.
   */
  add(events, { now, place, news = true }) {
    const added = [];
    for (const event of events) {
      const at = eventTimeMs(event);
      if (!event.id || at === null || this.live.has(event.id) || now - at >= EVENT_MARKER_MS) continue;
      if (!eventKind(event)) continue;
      const where = place(event);
      if (!where) continue;
      const fresh = news && eventIsFresh(event, now);
      const marker = {
        id: event.id,
        event,
        x: where.x,
        y: where.y,
        plane: where.plane,
        color: where.color,
        at,
        // A place that isn't the event's own is right for an event that just
        // happened, and a guess for one from a while ago.
        approximate: !where.known && !fresh,
        arrived: fresh ? now : null,
      };
      this.live.set(event.id, marker);
      added.push(marker);
    }
    if (this.live.size > EVENT_MARKERS_MAX) {
      const oldestFirst = [...this.live.values()].sort((a, b) => a.at - b.at);
      for (const marker of oldestFirst.slice(0, this.live.size - EVENT_MARKERS_MAX)) this.live.delete(marker.id);
    }
    return added;
  }

  /** Takes every live marker off the map; the ones on trails stay. */
  clearLive() {
    this.live.clear();
  }

  /** Forgets the live markers that have had their time. */
  prune(now) {
    for (const [id, marker] of this.live) {
      if (now - marker.at >= EVENT_MARKER_MS) this.live.delete(id);
    }
    for (const [id, started] of this.pops) {
      if (now - started >= EVENT_RING_MS) this.pops.delete(id);
    }
  }

  /**
   * The events on a player's trail: `[{id, event, x, y, plane, t, approximate}]`
   * (`t` in unix seconds), drawn in `color`.
   */
  setTrailMarks(name, marks, color) {
    this.trails.set(
      name,
      marks.map((mark) => ({ ...mark, color, at: mark.t * 1000, trail: name }))
    );
  }

  /** Drops the marks of every trail but the ones named. */
  keepTrails(names) {
    const keep = new Set(names);
    for (const name of [...this.trails.keys()]) {
      if (!keep.has(name)) this.trails.delete(name);
    }
  }

  /** The marker of an event, wherever it is shown. */
  find(id) {
    for (const marks of this.trails.values()) {
      const mark = marks.find((candidate) => candidate.id === id);
      if (mark) return mark;
    }
    return this.live.get(id) || null;
  }

  /** Lets events ring again, as when a replay passes them. */
  pop(ids, now) {
    for (const id of ids) this.pops.set(id, now);
  }

  /**
   * The trail marks between two replay times (unix seconds, `from` excluded),
   * oldest first: what a replay passes when it moves from one to the other.
   */
  trailMarksBetween(from, to, filters) {
    const passed = [];
    for (const marks of this.trails.values()) {
      for (const mark of marks) {
        if (mark.t > from && mark.t <= to && eventPasses(mark.event, filters)) passed.push(mark);
      }
    }
    return passed.sort((a, b) => a.t - b.t);
  }

  /**
   * What to draw: every marker the filters let through, with how it is
   * shown at `now`. `replayTime` (unix seconds, or null when live) is the
   * time the trails are shown at. `within(x, y)`, when given, says whether a
   * place in the game is in view: what isn't is left out early.
   */
  visible({ filters, now, replayTime = null, within = null }) {
    const shown = [];
    const onTrail = new Set();
    const trailNow = replayTime === null ? now : replayTime * 1000;
    for (const marks of this.trails.values()) {
      for (const mark of marks) {
        if (onTrail.has(mark.id) || !eventPasses(mark.event, filters)) continue;
        onTrail.add(mark.id);
        if (within && !within(mark.x, mark.y)) continue;
        const age = trailNow - mark.at;
        // Not yet reached by the replay.
        const ahead = age < 0;
        const live = this.live.get(mark.id);
        shown.push(
          this.display(mark, now, {
            alpha: ahead ? AHEAD_ALPHA : 1,
            compact: ahead || age >= EVENT_MARKER_MS,
            arrived: replayTime === null ? live?.arrived ?? null : null,
          })
        );
      }
    }
    for (const marker of this.live.values()) {
      if (onTrail.has(marker.id) || !eventPasses(marker.event, filters)) continue;
      if (within && !within(marker.x, marker.y)) continue;
      const alpha = markerAlpha(now - marker.at);
      if (alpha > 0) shown.push(this.display(marker, now, { alpha, compact: false, arrived: marker.arrived }));
    }
    return shown;
  }

  display(marker, now, { alpha, compact, arrived }) {
    const popped = this.pops.get(marker.id) ?? null;
    const sinceArrival = arrived === null ? null : now - arrived;
    const sincePop = popped === null ? null : now - popped;
    let ringAge = null;
    if (sincePop !== null && sincePop < EVENT_RING_MS) ringAge = sincePop;
    else if (sinceArrival !== null && sinceArrival < EVENT_RING_MS) ringAge = sinceArrival;
    let labelLeft = null;
    if (sinceArrival !== null && sinceArrival < EVENT_LABEL_MS) labelLeft = EVENT_LABEL_MS - sinceArrival;
    else if (ringAge !== null) labelLeft = EVENT_RING_MS - ringAge;
    return {
      id: marker.id,
      event: marker.event,
      x: marker.x,
      y: marker.y,
      plane: marker.plane,
      color: marker.color,
      at: marker.at,
      approximate: Boolean(marker.approximate),
      kind: eventKind(marker.event),
      tier: eventTier(marker.event),
      alpha,
      compact,
      ringAge,
      label: labelLeft === null ? null : eventLabel(marker.event),
      labelLeft,
    };
  }
}

/**
 * Where the markers go on screen. `markers` are as `visible` gives them;
 * `view` is `{width, height, plane, tile, toScreen(x, y), reducedMotion}`:
 * the canvas size, the floor shown, the size of a game tile in pixels and the
 * screen position of a tile's centre.
 *
 * Returns `{items, nextMs}`. An item is one marker or a stack of them:
 * `{x, y, r, anchorX, anchorY, members, top, count, alpha, compact, tier,
 * color, ringAge, label, labelAlpha, approximate}` with `x, y` the centre of
 * its badge and `members` the most notable first, each with its place in the
 * game as `tileX, tileY`. `nextMs` is when the map
 * should be drawn again for their sake, or null when nothing changes.
 */
export function layoutMarkers(markers, view) {
  const points = [];
  for (const marker of markers) {
    const [x, y] = view.toScreen(marker.x, marker.y);
    if (x < -OFFSCREEN_PAD || y < -OFFSCREEN_PAD) continue;
    if (x > view.width + OFFSCREEN_PAD || y > view.height + OFFSCREEN_PAD) continue;
    points.push({ ...marker, x, y, tileX: marker.x, tileY: marker.y });
  }
  const items = stackPoints(points, EVENT_STACK_PX).map((group) => {
    const members = group.members.slice().sort((a, b) => b.tier - a.tier || b.at - a.at);
    const top = members[0];
    const compact = members.every((member) => member.compact);
    const tier = compact ? 0 : top.tier;
    const r = compact ? MARKER_RADIUS_COMPACT : tier === 2 ? MARKER_RADIUS_BIG : MARKER_RADIUS;
    const rings = members.filter((member) => member.ringAge !== null);
    const labelled = members.filter((member) => member.label).sort((a, b) => b.labelLeft - a.labelLeft)[0];
    const floor = group.plane === view.plane ? 1 : OTHER_FLOOR_ALPHA;
    return {
      // A full marker hangs below its tile, clear of the player and the name above them.
      x: group.x,
      y: compact ? group.y : group.y + Math.max(view.tile / 2, 10) + 3 + r,
      r,
      anchorX: group.x,
      anchorY: group.y,
      plane: group.plane,
      members,
      top,
      count: members.length,
      alpha: Math.max(...members.map((member) => member.alpha)) * floor,
      compact,
      tier,
      color: top.color,
      approximate: top.approximate,
      ringAge: view.reducedMotion || !rings.length ? null : Math.min(...rings.map((member) => member.ringAge)),
      label: labelled ? labelled.label : null,
      labelAlpha: labelled ? Math.min(1, labelled.labelLeft / 3000) : 0,
      labelKind: labelled ? labelled.kind : null,
    };
  });
  // The floor shown goes on top, and on it the notable ones.
  items.sort(
    (a, b) =>
      Number(a.plane === view.plane) - Number(b.plane === view.plane) ||
      Number(!a.compact) - Number(!b.compact) ||
      a.tier - b.tier ||
      a.top.at - b.top.at
  );

  let nextMs = null;
  if (items.some((item) => item.ringAge !== null)) nextMs = EVENT_FRAME_MS;
  else if (items.some((item) => item.label)) nextMs = 250;
  else if (items.some((item) => !item.compact)) nextMs = EVENT_WAKE_MS;
  return { items, nextMs };
}
