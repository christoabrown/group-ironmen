import { buildTrailModel, decodeTrail, mergeTrail, nextChangeAfter, observeLive, timelineTicks } from "./trail-model";
import { buildGeometry, hitTest, lodForZoom, placeAtTime } from "./trail-geometry";
import { drawTrail } from "./trail-renderer";

const DAY_S = 86400;

/**
 * The trails on the map: for each player shown, the hub's history joined with
 * where they have been seen since, and the shapes to draw it with. Positions
 * are noted for every player, shown or not, so a trail that is switched on
 * already knows where its player is.
 */
export class TrailLayer {
  /** `now` gives the time in unix seconds, by the clock the hub's samples use. */
  constructor({ now = () => Date.now() / 1000 } = {}) {
    this.now = now;
    this.trails = new Map();
    this.seen = new Map();
    this.deaths = new Map();
    this.replayTime = null;
    this.hover = null;
  }

  /**
   * Shows (or refreshes) a player's trail from the server's answer; see
   * decodeTrail. `windowS` is how far back the trail was asked for.
   */
  setHistory(name, raw, { color, light, windowS = DAY_S }) {
    const { points, step } = decodeTrail(raw);
    this.trails.set(name, { history: points, step, color, light, windowS });
    this.rebuild(name);
  }

  remove(name) {
    if (this.hover?.name === name) this.hover = null;
    return this.trails.delete(name);
  }

  clear() {
    this.hover = null;
    this.trails.clear();
  }

  names() {
    return [...this.trails.keys()];
  }

  modelOf(name) {
    return this.trails.get(name)?.model || null;
  }

  isOnline(name) {
    return Boolean(this.seen.get(name)?.online);
  }

  /**
   * Notes where a player is (`{x, y, plane, boat, world}` in the site's
   * coordinates, or null when that isn't known) and whether they are online.
   * Returns whether a trail on the map changed.
   */
  observe(name, position, online) {
    let seen = this.seen.get(name);
    if (!seen) {
      seen = { buffer: [], position: null, online: false };
      this.seen.set(name, seen);
    }
    const wasOnline = seen.online;
    seen.online = Boolean(online);
    let moved = false;
    if (position) {
      seen.position = position;
      // Coming back online starts a new stay: the time away isn't time spent there.
      if (seen.online) moved = observeLive(seen.buffer, position, this.now(), { fresh: !wasOnline });
    }
    if (!this.trails.has(name)) return false;
    if (moved || wasOnline !== seen.online) {
      this.rebuild(name);
      return true;
    }
    return false;
  }

  /** The deaths to mark on a player's trail; see deathMarks. */
  setDeaths(name, marks) {
    this.deaths.set(name, marks);
  }

  deathsOn(name, model) {
    if (model.tMin === null) return [];
    return (this.deaths.get(name) || []).filter((death) => death.t >= model.tMin - 60 && death.t <= model.tMax + 60);
  }

  rebuild(name) {
    const trail = this.trails.get(name);
    const seen = this.seen.get(name);
    const head = seen?.online && seen.position ? { ...seen.position, t: this.now() } : null;
    const points = mergeTrail(trail.history, seen?.buffer || [], head);
    trail.model = buildTrailModel(points, { step: trail.step });
    trail.geometries = [];
    if (this.hover?.name === name) this.hover = null;
  }

  geometryOf(trail, lod) {
    if (!trail.geometries[lod]) trail.geometries[lod] = buildGeometry(trail.model, lod);
    return trail.geometries[lod];
  }

  /** Shows the trails as they were at a time (unix seconds); null goes back to live. */
  setReplay(time) {
    this.replayTime = time;
  }

  /**
   * The time span of the trails shown and what happened in it:
   * `{tMin, tMax, ticks: [{t, kind, color}]}`, for the replay timeline.
   */
  timeline() {
    let tMin = null;
    let tMax = null;
    const ticks = [];
    for (const [name, trail] of this.trails) {
      const { model } = trail;
      if (model.tMin === null) continue;
      const end = this.isOnline(name) ? Math.max(model.tMax, this.now()) : model.tMax;
      tMin = tMin === null ? model.tMin : Math.min(tMin, model.tMin);
      tMax = tMax === null ? end : Math.max(tMax, end);
      for (const tick of timelineTicks(model, this.deathsOn(name, model))) {
        ticks.push({ ...tick, color: trail.color });
      }
    }
    ticks.sort((a, b) => a.t - b.t);
    return { tMin, tMax, ticks };
  }

  /**
   * Where a player's ghost is drawn at a time of the replay, in map pixels:
   * `{x, y, plane}`; null when they have no trail or it starts later.
   */
  ghostAt(name, time, zoom) {
    const trail = this.trails.get(name);
    return trail ? placeAtTime(this.geometryOf(trail, lodForZoom(zoom)), time) : null;
  }

  /**
   * When, after `from` and up to `to`, a player next turns up somewhere else:
   * after a teleport, through an entrance, or across a jump that can't be
   * explained. Null when they don't in that span, or have no trail.
   */
  nextLanding(name, from, to) {
    const model = this.modelOf(name);
    if (!model) return null;
    for (const jump of model.jumps) {
      const landed = model.points[jump.from + 1].t0;
      if (landed > to) return null;
      if (landed > from) return landed;
    }
    return null;
  }

  /**
   * When something next happens on any of the trails at or after a time, or
   * null when nothing does; see nextChangeAfter.
   */
  nextChangeAfter(time) {
    let next = null;
    for (const trail of this.trails.values()) {
      const change = nextChangeAfter(trail.model, time);
      if (change !== null && (next === null || change < next)) next = change;
    }
    return next;
  }

  /**
   * Draws the trails, the selected player's on top. `view` is as the renderer
   * takes it. Returns whether something is animating.
   */
  draw(ctx, view, selectedName) {
    if (!this.trails.size) return false;
    const lod = lodForZoom(view.zoom);
    const names = this.names().sort((a, b) => Number(a === selectedName) - Number(b === selectedName));
    let animating = false;
    for (const name of names) {
      const trail = this.trails.get(name);
      const mode =
        this.replayTime === null ? { kind: "live", windowS: trail.windowS } : { kind: "replay", time: this.replayTime };
      const drawn = drawTrail(
        ctx,
        view,
        {
          model: trail.model,
          geometry: this.geometryOf(trail, lod),
          color: trail.color,
          light: trail.light,
          selected: name === selectedName,
          online: this.isOnline(name),
          deaths: this.deathsOn(name, trail.model),
          hover: this.hover?.name === name ? this.hover.point : null,
        },
        mode
      );
      animating = drawn || animating;
    }
    return animating;
  }

  /**
   * The trail point nearest to a place in map pixels, within `radius`:
   * `{name, index, point}`, or null.
   */
  hitTest(x, y, radius, zoom) {
    const lod = lodForZoom(zoom);
    let best = null;
    for (const [name, trail] of this.trails) {
      const hit = hitTest(this.geometryOf(trail, lod), x, y, radius);
      if (hit && (!best || hit.distance < best.distance)) {
        best = { name, index: hit.src, point: trail.model.points[hit.src], distance: hit.distance };
      }
    }
    return best;
  }

  /** Highlights a point (as hitTest gives it). Returns whether that changed anything. */
  setHover(hit) {
    const changed = this.hover?.name !== hit?.name || this.hover?.index !== hit?.index;
    this.hover = hit || null;
    return changed;
  }
}
