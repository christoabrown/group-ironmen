import { band } from "./trail-model";

// The shapes a trail is drawn with, worked out once per trail and level of
// detail rather than every frame: a smoothed line per run and an arc per
// teleport. Positions are in the map's own pixels (four to a game tile, y
// down), which is the space the canvas draws in under the camera transform.

const PIXELS_PER_TILE = 4;
const TILE_SIZE = 256;
// How far a curve's handle may reach, as a share of its segment: enough to
// round a corner, too little to loop or swing wide next to a long neighbour.
const HANDLE_CLAMP = 0.4;
// Per level of detail: points nearer than this (tiles) to the last one kept
// are skipped; a curve gets a vertex per this many pixels, up to a maximum.
const LOD_TOLERANCE_TILES = [0, 1.5, 4];
const LOD_PIXELS_PER_VERTEX = [10, 24, Infinity];
const LOD_MAX_SUBDIVISIONS = [12, 6, 1];
// A boat trip is drawn as waves.
const WAVE_AMPLITUDE = 0.8 * PIXELS_PER_TILE;
const WAVE_LENGTH = 6 * PIXELS_PER_TILE;
const WAVE_PIXELS_PER_VERTEX = 4;
const CHUNK_VERTICES = 64;
const ARC_POINTS = 24;

/** The level of detail for a camera zoom: 0 is everything, 2 the least. */
export function lodForZoom(zoom) {
  if (zoom >= 2) return 0;
  if (zoom >= 1) return 1;
  return 2;
}

/** The middle of a game tile, in map pixels. */
export function tileCenter(x, y) {
  return [x * PIXELS_PER_TILE + PIXELS_PER_TILE / 2, -y * PIXELS_PER_TILE + TILE_SIZE + PIXELS_PER_TILE / 2];
}

/**
 * The two inner control points of the curve from p1 to p2 that continues
 * smoothly from p0 and on to p3 (Catmull-Rom), with the handles kept short.
 */
export function bezierHandles(p0, p1, p2, p3, clamp = HANDLE_CLAMP) {
  const limit = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) * clamp;
  const handle = (from, to) => {
    let x = (to[0] - from[0]) / 6;
    let y = (to[1] - from[1]) / 6;
    const length = Math.hypot(x, y);
    if (length > limit && length > 0) {
      x *= limit / length;
      y *= limit / length;
    }
    return [x, y];
  };
  const [ax, ay] = handle(p0, p2);
  const [bx, by] = handle(p1, p3);
  return [p1[0] + ax, p1[1] + ay, p2[0] - bx, p2[1] - by];
}

/** The indices of the points i0..i1 to draw at a level of detail; always both ends. */
function controlPoints(points, i0, i1, lod) {
  const tolerance = LOD_TOLERANCE_TILES[lod];
  const kept = [i0];
  for (let i = i0 + 1; i < i1; i++) {
    const last = points[kept[kept.length - 1]];
    const point = points[i];
    const apart = Math.max(Math.abs(point.x - last.x), Math.abs(point.y - last.y));
    if (apart >= tolerance || point.plane !== last.plane) kept.push(i);
  }
  if (i1 > i0) kept.push(i1);
  return kept;
}

function boundsOf(xy, from, to) {
  const box = [Infinity, Infinity, -Infinity, -Infinity];
  for (let i = from; i <= to; i++) {
    box[0] = Math.min(box[0], xy[i * 2]);
    box[1] = Math.min(box[1], xy[i * 2 + 1]);
    box[2] = Math.max(box[2], xy[i * 2]);
    box[3] = Math.max(box[3], xy[i * 2 + 1]);
  }
  return box;
}

/** Pushes the vertices sideways into waves that die out towards both ends. */
function makeWaves(xs, ys) {
  const count = xs.length;
  const along = [0];
  for (let i = 1; i < count; i++) {
    along.push(along[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]));
  }
  const total = along[count - 1];
  const waved = [];
  for (let i = 0; i < count; i++) {
    const before = Math.max(i - 1, 0);
    const after = Math.min(i + 1, count - 1);
    const dx = xs[after] - xs[before];
    const dy = ys[after] - ys[before];
    const length = Math.hypot(dx, dy) || 1;
    const fade = Math.min(1, along[i] / WAVE_LENGTH, (total - along[i]) / WAVE_LENGTH);
    const offset = WAVE_AMPLITUDE * fade * Math.sin((along[i] / WAVE_LENGTH) * Math.PI * 2);
    waved.push([xs[i] + (-dy / length) * offset, ys[i] + (dx / length) * offset]);
  }
  waved.forEach(([x, y], i) => {
    xs[i] = x;
    ys[i] = y;
  });
}

/**
 * The line for the points i0..i1 of a trail: a smooth curve through them
 * (waves for a boat trip), as vertices with, per vertex, the time the player
 * was there (`t`), the floor (`plane`), the point it belongs to (`src`) and
 * the length of the line up to it (`cum`). A tile the player stayed on is two
 * vertices in one place, at the times of arriving and leaving. `chunks` are
 * stretches of the line with their bounding boxes, to skip what is off screen.
 */
export function smoothRun(points, i0, i1, lod, sail) {
  const control = controlPoints(points, i0, i1, lod);
  const centers = control.map((index) => tileCenter(points[index].x, points[index].y));
  const xs = [];
  const ys = [];
  const ts = [];
  const planes = [];
  const srcs = [];
  const push = (x, y, t, plane, src) => {
    xs.push(x);
    ys.push(y);
    ts.push(t);
    planes.push(plane);
    srcs.push(src);
  };
  const wavy = sail && lod < 2;
  const pixelsPerVertex = wavy ? WAVE_PIXELS_PER_VERTEX : LOD_PIXELS_PER_VERTEX[lod];
  const maxSubdivisions = wavy ? Infinity : LOD_MAX_SUBDIVISIONS[lod];

  control.forEach((index, k) => {
    const point = points[index];
    const [x, y] = centers[k];
    push(x, y, point.t0, point.plane, index);
    if (point.t1 > point.t0) push(x, y, point.t1, point.plane, index);
    if (k === control.length - 1) return;

    const next = points[control[k + 1]];
    const p1 = centers[k];
    const p2 = centers[k + 1];
    const [c1x, c1y, c2x, c2y] = bezierHandles(centers[k - 1] || p1, p1, p2, centers[k + 2] || p2);
    const chord = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const pieces = Math.max(1, Math.min(Math.ceil(chord / pixelsPerVertex), maxSubdivisions));
    for (let s = 1; s < pieces; s++) {
      const u = s / pieces;
      const v = 1 - u;
      const a = v * v * v;
      const b = 3 * v * v * u;
      const c = 3 * v * u * u;
      const d = u * u * u;
      push(
        a * p1[0] + b * c1x + c * c2x + d * p2[0],
        a * p1[1] + b * c1y + c * c2y + d * p2[1],
        point.t1 + (next.t0 - point.t1) * u,
        point.plane,
        u < 0.5 ? index : control[k + 1]
      );
    }
  });
  if (wavy) makeWaves(xs, ys);

  const count = xs.length;
  const xy = new Float32Array(count * 2);
  const cum = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    xy[i * 2] = xs[i];
    xy[i * 2 + 1] = ys[i];
    if (i > 0) cum[i] = cum[i - 1] + Math.hypot(xy[i * 2] - xy[i * 2 - 2], xy[i * 2 + 1] - xy[i * 2 - 1]);
  }
  const chunks = [];
  for (let from = 0; from < Math.max(count - 1, 1); from += CHUNK_VERTICES) {
    const to = Math.min(from + CHUNK_VERTICES, count - 1);
    chunks.push({ i0: from, i1: to, bbox: boundsOf(xy, from, to) });
  }
  return {
    i0,
    i1,
    sail,
    count,
    xy,
    t: Float64Array.from(ts),
    plane: Uint8Array.from(planes),
    src: Uint32Array.from(srcs),
    cum,
    chunks,
    bbox: boundsOf(xy, 0, count - 1),
  };
}

/**
 * The points `[x0, y0, x1, y1, ...]` of an arc from a to b that bulges to the
 * left of the direction of travel, so there and back don't overlap.
 */
export function arcPath(ax, ay, bx, by, pieces = ARC_POINTS) {
  const dx = bx - ax;
  const dy = by - ay;
  const length = Math.hypot(dx, dy) || 1;
  const height = Math.min(Math.max(length * 0.18, 16), 600);
  const cx = (ax + bx) / 2 + (dy / length) * height;
  const cy = (ay + by) / 2 - (dx / length) * height;
  const path = new Float32Array((pieces + 1) * 2);
  for (let s = 0; s <= pieces; s++) {
    const u = s / pieces;
    const v = 1 - u;
    path[s * 2] = v * v * ax + 2 * v * u * cx + u * u * bx;
    path[s * 2 + 1] = v * v * ay + 2 * v * u * cy + u * u * by;
  }
  return path;
}

/**
 * Everything to draw a trail's model at one level of detail: `runs` (see
 * smoothRun) and `jumps`, `{kind, from, ax, ay, bx, by, planeA, planeB, tA,
 * tB, crossBand, arc}` from where the player left (a, at time tA) to where
 * they turned up (b, at tB). A teleport within one part of the map has an
 * `arc`; one to another part (`crossBand`) has ends too far apart to join.
 */
export function buildGeometry(model, lod) {
  const { points } = model;
  const runs = model.runs.map((run) => smoothRun(points, run.i0, run.i1, lod, run.sail));
  const jumps = model.jumps.map(({ from, kind }) => {
    const a = points[from];
    const b = points[from + 1];
    const [ax, ay] = tileCenter(a.x, a.y);
    const [bx, by] = tileCenter(b.x, b.y);
    const crossBand = band(a.x, a.y) !== band(b.x, b.y);
    return {
      kind,
      from,
      ax,
      ay,
      bx,
      by,
      planeA: a.plane,
      planeB: b.plane,
      tA: a.t1,
      tB: b.t0,
      crossBand,
      arc: kind === "teleport" && !crossBand ? arcPath(ax, ay, bx, by) : null,
    };
  });
  return { lod, runs, jumps };
}

/**
 * The place on a run's line at time t: `{i, frac}`, vertex i and how far on
 * to the next. Null before the run starts; its last vertex once it is over.
 */
export function vertexAtTime(run, t) {
  if (!run.count || t < run.t[0]) return null;
  let low = 0;
  let high = run.count - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (run.t[middle] <= t) low = middle;
    else high = middle - 1;
  }
  if (low === run.count - 1) return { i: low, frac: 0 };
  const span = run.t[low + 1] - run.t[low];
  return { i: low, frac: span > 0 ? (t - run.t[low]) / span : 0 };
}

/** The position `[x, y]` of a place on a run as vertexAtTime gives it. */
export function pointOnRun(run, { i, frac }) {
  const x = run.xy[i * 2];
  const y = run.xy[i * 2 + 1];
  if (!frac) return [x, y];
  return [x + (run.xy[i * 2 + 2] - x) * frac, y + (run.xy[i * 2 + 3] - y) * frac];
}

function outside(box, x, y, radius) {
  return x < box[0] - radius || y < box[1] - radius || x > box[2] + radius || y > box[3] + radius;
}

/**
 * The point of a trail nearest to (x, y), when its line passes within
 * `radius`: `{src, distance}` with `src` the index of the point.
 */
export function hitTest(geometry, x, y, radius) {
  let best = null;
  const consider = (distance, src) => {
    if (distance <= radius && (!best || distance < best.distance)) best = { src, distance };
  };
  for (const run of geometry.runs) {
    if (outside(run.bbox, x, y, radius)) continue;
    if (run.count === 1) {
      consider(Math.hypot(x - run.xy[0], y - run.xy[1]), run.src[0]);
      continue;
    }
    for (const chunk of run.chunks) {
      if (outside(chunk.bbox, x, y, radius)) continue;
      for (let i = chunk.i0; i < chunk.i1; i++) {
        const ax = run.xy[i * 2];
        const ay = run.xy[i * 2 + 1];
        const dx = run.xy[i * 2 + 2] - ax;
        const dy = run.xy[i * 2 + 3] - ay;
        const lengthSquared = dx * dx + dy * dy;
        const u = lengthSquared ? Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / lengthSquared)) : 0;
        consider(Math.hypot(x - (ax + dx * u), y - (ay + dy * u)), run.src[u < 0.5 ? i : i + 1]);
      }
    }
  }
  return best;
}
