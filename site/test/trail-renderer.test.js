import { describe, expect, it } from "vitest";
import { buildTrailModel } from "../src/canvas-map/trail-model";
import { tileCenter } from "../src/canvas-map/map-space";
import { buildGeometry } from "../src/canvas-map/trail-geometry";
import { ageFraction, drawTrail } from "../src/canvas-map/trail-renderer";
import { recordingContext } from "./helpers/recording-context";

const NOW = 1_790_000_040;
const COLOR = "hsl(222, 70%, 45%)";
const LIGHT = "hsl(222, 85%, 70%)";

function at(x, y, minutesAgo, extra = {}) {
  const t = NOW - minutesAgo * 60;
  return { x, y, plane: 0, t0: t, t1: t, boat: false, world: null, ...extra };
}

/** A view of the map centred on a tile, 800 by 600 map pixels at zoom 1. */
function viewOf(x, y, extra = {}) {
  const [cx, cy] = tileCenter(x, y);
  return {
    zoom: 1,
    plane: 0,
    minX: cx - 400,
    maxX: cx + 400,
    minY: cy - 300,
    maxY: cy + 300,
    nowS: NOW,
    nowMs: 5000,
    reducedMotion: false,
    ...extra,
  };
}

function trailOf(points, extra = {}) {
  const model = buildTrailModel(points);
  return {
    model,
    geometry: buildGeometry(model, 1),
    color: COLOR,
    light: LIGHT,
    selected: false,
    online: false,
    hover: null,
    ...extra,
  };
}

const LIVE = { kind: "live", windowS: 86400 };
const walk = [at(3200, 3200, 3), at(3210, 3200, 2), at(3220, 3204, 1), at(3230, 3204, 0)];
const inColor = (ctx) => ctx.strokes.filter((stroke) => stroke.style === COLOR);
const longest = (strokes) => strokes.reduce((best, stroke) => (stroke.path.length > best.path.length ? stroke : best));

describe("ageFraction", () => {
  it("is 1 for now, 0 at the start of the window, and spends most of its range on the last hours", () => {
    expect(ageFraction(NOW, NOW, 86400)).toBe(1);
    expect(ageFraction(NOW - 86400, NOW, 86400)).toBe(0);
    expect(ageFraction(NOW - 3600, NOW, 86400)).toBeGreaterThan(0.5);
    expect(ageFraction(NOW - 3600, NOW, 86400)).toBeLessThan(0.75);
    expect(ageFraction(NOW + 500, NOW, 86400)).toBe(1);
  });
});

describe("drawTrail, live", () => {
  it("draws nothing for a trail without points", () => {
    const ctx = recordingContext();
    expect(drawTrail(ctx, viewOf(3200, 3200), trailOf([]), LIVE)).toBe(false);
    expect(ctx.strokes).toHaveLength(0);
    expect(ctx.fills).toHaveLength(0);
  });

  it("lays a dark outline under the line in the player's colour", () => {
    const ctx = recordingContext();
    drawTrail(ctx, viewOf(3215, 3202), trailOf(walk), LIVE);
    const colored = inColor(ctx);
    expect(colored.length).toBeGreaterThan(0);
    const before = ctx.strokes.slice(0, ctx.strokes.indexOf(colored[0]));
    const outline = before.find((stroke) => JSON.stringify(stroke.path) === JSON.stringify(colored[0].path));
    expect(outline.style).not.toBe(COLOR);
    expect(outline.width).toBeGreaterThan(colored[0].width);
  });

  it("fades and thins the line the older it is", () => {
    const ctx = recordingContext();
    const points = [at(3200, 3200, 600), at(3210, 3200, 599), at(3220, 3200, 1), at(3230, 3200, 0)];
    const trail = trailOf(points);
    expect(trail.model.kinds).toEqual(["walk", "unknown", "walk"]);
    drawTrail(ctx, viewOf(3215, 3200), trail, LIVE);
    const [old, recent] = inColor(ctx).filter((stroke) => !stroke.dash.length);
    expect(old.alpha).toBeLessThan(recent.alpha);
    expect(old.width).toBeLessThan(recent.width);
  });

  it("leaves the canvas as it found it", () => {
    const ctx = recordingContext();
    const far = [...walk.slice(0, 2), at(2662, 3305, 0)];
    drawTrail(ctx, viewOf(3215, 3202), trailOf(far), LIVE);
    expect(ctx.depth).toBe(0);
    expect(ctx.getLineDash()).toEqual([]);
    expect(ctx.globalAlpha).toBe(1);
  });

  it("skips what is off screen", () => {
    const ctx = recordingContext();
    drawTrail(ctx, viewOf(1200, 1200), trailOf(walk), LIVE);
    expect(ctx.strokes).toHaveLength(0);
  });

  it("joins a teleport's two ends with a dashed arc and marks both", () => {
    const ctx = recordingContext();
    const points = [at(3200, 3200, 2), at(3210, 3200, 1), at(3210, 2900, 0)];
    const trail = trailOf(points);
    expect(trail.model.kinds).toEqual(["walk", "teleport"]);
    const [cx, cy] = tileCenter(3210, 3050);
    drawTrail(
      ctx,
      { ...viewOf(3210, 3050), minY: cy - 1000, maxY: cy + 1000, minX: cx - 1000, maxX: cx + 1000 },
      trail,
      LIVE
    );
    const dashed = ctx.strokes.filter((stroke) => stroke.dash.length && stroke.path.length > 20);
    expect(dashed.length).toBeGreaterThanOrEqual(1);
    const arc = dashed[dashed.length - 1].path;
    expect(arc[0]).toEqual(tileCenter(3210, 3200));
    expect(arc[arc.length - 1]).toEqual(tileCenter(3210, 2900));
    // A burst of rays around each end.
    const rays = ctx.strokes.filter((stroke) => stroke.path.length === 16);
    expect(rays.length).toBeGreaterThanOrEqual(2);
  });

  it("links the ends of a jump it can't explain with a dotted line", () => {
    const ctx = recordingContext();
    const points = [at(3200, 3200, 1), at(3200, 3400, 0)];
    const trail = trailOf(points);
    expect(trail.model.kinds).toEqual(["unknown"]);
    const [cx, cy] = tileCenter(3200, 3300);
    drawTrail(
      ctx,
      { ...viewOf(3200, 3300), minY: cy - 1000, maxY: cy + 1000, minX: cx - 500, maxX: cx + 500 },
      trail,
      LIVE
    );
    const dotted = ctx.strokes.filter((stroke) => stroke.dash.length && stroke.path.length === 2);
    expect(dotted.length).toBeGreaterThanOrEqual(1);
    expect(dotted[0].path).toEqual([tileCenter(3200, 3200), tileCenter(3200, 3400)]);
  });

  it("draws the part on another floor fainter", () => {
    const ctx = recordingContext();
    const points = [
      at(3200, 3200, 3),
      at(3210, 3200, 2),
      at(3214, 3200, 1, { plane: 1 }),
      at(3224, 3200, 0, { plane: 1 }),
    ];
    drawTrail(ctx, viewOf(3212, 3200), trailOf(points), LIVE);
    const alphas = inColor(ctx).map((stroke) => stroke.alpha);
    expect(Math.min(...alphas)).toBeLessThan(Math.max(...alphas) * 0.5);

    const upstairs = recordingContext();
    drawTrail(upstairs, viewOf(3212, 3200, { plane: 1 }), trailOf(points), LIVE);
    const last = inColor(upstairs).pop();
    expect(last.alpha).toBe(Math.max(...inColor(upstairs).map((stroke) => stroke.alpha)));
  });

  it("dashes a boat trip", () => {
    const ctx = recordingContext();
    const boat = { boat: true };
    drawTrail(ctx, viewOf(3040, 3180), trailOf([at(3040, 3200, 1, boat), at(3040, 3160, 0, boat)]), LIVE);
    expect(inColor(ctx).every((stroke) => stroke.dash.length > 0)).toBe(true);
  });

  it("marks a lone point with a dot", () => {
    const ctx = recordingContext();
    drawTrail(ctx, viewOf(3200, 3200), trailOf([at(3200, 3200, 0)]), LIVE);
    const [x, y] = tileCenter(3200, 3200);
    expect(ctx.fills.some((fill) => fill.style === COLOR && fill.path[0][0] === x && fill.path[0][1] === y)).toBe(true);
  });

  it("puts moving chevrons on the selected trail only", () => {
    const plain = recordingContext();
    expect(drawTrail(plain, viewOf(3215, 3202), trailOf(walk), LIVE)).toBe(false);

    const selected = recordingContext();
    expect(drawTrail(selected, viewOf(3215, 3202), trailOf(walk, { selected: true }), LIVE)).toBe(true);
    expect(selected.strokes.length).toBeGreaterThan(plain.strokes.length);

    const calm = recordingContext();
    const still = drawTrail(calm, viewOf(3215, 3202, { reducedMotion: true }), trailOf(walk, { selected: true }), LIVE);
    expect(still).toBe(false);
  });

  it("puts no chevron on a run that is too short for one", () => {
    const ctx = recordingContext();
    const short = [at(3200, 3200, 1), at(3202, 3200, 0)];
    expect(drawTrail(ctx, viewOf(3201, 3200), trailOf(short, { selected: true }), LIVE)).toBe(false);
    // A chevron is a path of three points.
    expect(ctx.strokes.filter((stroke) => stroke.style === LIGHT && stroke.path.length % 3 === 0)).toHaveLength(0);
  });

  it("keeps every chevron on the line", () => {
    const ctx = recordingContext();
    drawTrail(ctx, viewOf(3215, 3202), trailOf(walk, { selected: true }), LIVE);
    const chevrons = ctx.strokes.filter((stroke) => stroke.style === LIGHT && stroke.path.length % 3 === 0);
    expect(chevrons).toHaveLength(1);
    const [left] = tileCenter(3200, 3200);
    const [right] = tileCenter(3230, 3204);
    for (let i = 1; i < chevrons[0].path.length; i += 3) {
      expect(chevrons[0].path[i][0]).toBeGreaterThanOrEqual(left);
      expect(chevrons[0].path[i][0]).toBeLessThanOrEqual(right);
    }
  });

  it("only asks for frames for a teleport's moving dashes while they are on screen", () => {
    const points = [at(3200, 3200, 2), at(3210, 3200, 1), at(3210, 2900, 0)];
    const selected = () => trailOf(points, { selected: true });
    const [cx, cy] = tileCenter(3210, 2905);
    const atLanding = { ...viewOf(3210, 2905), minX: cx - 60, maxX: cx + 60, minY: cy - 60, maxY: cy + 60 };
    expect(drawTrail(recordingContext(), atLanding, selected(), LIVE)).toBe(true);
    expect(drawTrail(recordingContext(), viewOf(1200, 1200), selected(), LIVE)).toBe(false);
  });

  it("glows at the head while the player is online, and caps the end when not", () => {
    const [x, y] = tileCenter(3230, 3204);
    const atHead = (shape) => shape.path.length === 1 && shape.path[0][0] === x && shape.path[0][1] === y;

    const online = recordingContext();
    drawTrail(online, viewOf(3215, 3202), trailOf(walk, { online: true }), LIVE);
    expect(online.fills.filter((fill) => fill.style === LIGHT && atHead(fill)).length).toBeGreaterThanOrEqual(2);

    const offline = recordingContext();
    drawTrail(offline, viewOf(3215, 3202), trailOf(walk), LIVE);
    expect(offline.fills.filter((fill) => fill.style === LIGHT && atHead(fill))).toHaveLength(0);
    expect(offline.strokes.some(atHead)).toBe(true);
  });
});

describe("drawTrail, replay", () => {
  const replayAt = (minutesAgo) => ({ kind: "replay", time: NOW - minutesAgo * 60 });

  it("shows the whole route faintly and the part up to the time brightly", () => {
    const early = recordingContext();
    drawTrail(early, viewOf(3215, 3202), trailOf(walk), replayAt(2.5));
    const late = recordingContext();
    drawTrail(late, viewOf(3215, 3202), trailOf(walk), replayAt(0.5));

    const faint = longest(inColor(early).filter((stroke) => stroke.alpha < 0.5));
    const bright = (ctx) => longest(inColor(ctx).filter((stroke) => stroke.alpha > 0.9));
    expect(faint.path.length).toBeGreaterThan(bright(early).path.length);
    expect(bright(late).path.length).toBeGreaterThan(bright(early).path.length);
    expect(bright(early).width).toBe(bright(late).width);
  });

  it("puts a ghost where the player was at that time", () => {
    const ctx = recordingContext();
    drawTrail(ctx, viewOf(3215, 3202), trailOf(walk), replayAt(2.5));
    const ghost = ctx.fills.filter((fill) => fill.style === COLOR && fill.path.length === 1 && fill.path[0][2] > 5);
    expect(ghost).toHaveLength(1);
    const [x0] = tileCenter(3200, 3200);
    const [x1] = tileCenter(3210, 3200);
    expect(ghost[0].path[0][0]).toBeGreaterThan(x0);
    expect(ghost[0].path[0][0]).toBeLessThan(x1);
  });

  it("draws nothing bright before the trail starts", () => {
    const ctx = recordingContext();
    drawTrail(ctx, viewOf(3215, 3202), trailOf(walk), replayAt(10));
    expect(inColor(ctx).filter((stroke) => stroke.alpha > 0.9)).toHaveLength(0);
    expect(ctx.fills.filter((fill) => fill.style === COLOR)).toHaveLength(0);
  });

  it("never asks for more frames by itself", () => {
    const ctx = recordingContext();
    expect(drawTrail(ctx, viewOf(3215, 3202), trailOf(walk, { selected: true }), replayAt(1))).toBe(false);
  });
});
