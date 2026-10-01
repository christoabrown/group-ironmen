import { describe, expect, it } from "vitest";
import { buildTrailModel } from "../src/canvas-map/trail-model";
import {
  arcPath,
  bezierHandles,
  buildGeometry,
  hitTest,
  lodForZoom,
  pointOnRun,
  smoothRun,
  tileCenter,
  vertexAtTime,
} from "../src/canvas-map/trail-geometry";

const T = 1_790_000_040;

function at(x, y, minute, extra = {}) {
  const t = T + minute * 60;
  return { x, y, plane: 0, t0: t, t1: t, boat: false, world: null, ...extra };
}

function vertices(run) {
  return Array.from({ length: run.count }, (_, i) => [run.xy[i * 2], run.xy[i * 2 + 1]]);
}

describe("tileCenter", () => {
  it("is the middle of the tile where the map draws it", () => {
    // CanvasMap.gamePositionToCanvas gives the tile's corner: [x * 4, -y * 4 + 256].
    expect(tileCenter(3200, 3201)).toEqual([3200 * 4 + 2, -3201 * 4 + 256 + 2]);
  });
});

describe("lodForZoom", () => {
  it("uses less detail the further the map is zoomed out", () => {
    expect([6, 2, 1.5, 1, 0.75, 0.5].map(lodForZoom)).toEqual([0, 0, 1, 1, 2, 2]);
  });
});

describe("bezierHandles", () => {
  it("keeps the handles short next to a much longer neighbouring segment", () => {
    const [c1x, c1y, c2x, c2y] = bezierHandles([0, 0], [1000, 0], [1010, 0], [1010, 800]);
    expect(Math.hypot(c1x - 1000, c1y)).toBeLessThanOrEqual(4 + 1e-6);
    expect(Math.hypot(c2x - 1010, c2y)).toBeLessThanOrEqual(4 + 1e-6);
  });
});

describe("smoothRun", () => {
  const hook = [at(3200, 3200, 0), at(3240, 3200, 1), at(3240, 3204, 2), at(3200, 3204, 3)];

  it("goes through every point, in order of time", () => {
    const run = smoothRun(hook, 0, 3, 0, false);
    const drawn = vertices(run);
    for (const point of hook) {
      const [x, y] = tileCenter(point.x, point.y);
      expect(drawn.some(([vx, vy]) => Math.abs(vx - x) < 0.01 && Math.abs(vy - y) < 0.01)).toBe(true);
    }
    expect(drawn[0]).toEqual(tileCenter(3200, 3200));
    expect(drawn[drawn.length - 1]).toEqual(tileCenter(3200, 3204));
    for (let i = 1; i < run.count; i++) expect(run.t[i]).toBeGreaterThanOrEqual(run.t[i - 1]);
    expect(run.count).toBeGreaterThan(hook.length);
  });

  it("rounds a sharp hook without swinging far outside it", () => {
    const run = smoothRun(hook, 0, 3, 0, false);
    const [left] = tileCenter(3200, 3200);
    const [right] = tileCenter(3240, 3200);
    for (const [x] of vertices(run)) {
      expect(x).toBeGreaterThanOrEqual(left - 0.01);
      // The turn is 4 tiles (16 px) wide; the curve may bulge by a fraction of that.
      expect(x).toBeLessThanOrEqual(right + 8);
    }
  });

  it("holds still for as long as the player stayed on a tile", () => {
    const points = [at(3200, 3200, 0), { ...at(3210, 3200, 1), t1: T + 600 }, at(3220, 3200, 11)];
    const run = smoothRun(points, 0, 2, 0, false);
    const [x, y] = tileCenter(3210, 3200);
    const there = [];
    for (let i = 0; i < run.count; i++) {
      if (run.xy[i * 2] === x && run.xy[i * 2 + 1] === y) there.push(run.t[i]);
    }
    expect(there).toEqual([T + 60, T + 600]);
    expect(pointOnRun(run, vertexAtTime(run, T + 300))).toEqual([x, y]);
  });

  it("draws a lone point as a single vertex", () => {
    const run = smoothRun([at(3200, 3200, 0)], 0, 0, 0, false);
    expect(run.count).toBe(1);
    expect(vertices(run)[0]).toEqual(tileCenter(3200, 3200));
  });

  it("remembers which point each vertex belongs to and its floor", () => {
    const points = [at(3200, 3200, 0), at(3210, 3200, 1, { plane: 1 }), at(3220, 3200, 2, { plane: 1 })];
    const run = smoothRun(points, 0, 2, 0, false);
    expect(run.src[0]).toBe(0);
    expect(run.src[run.count - 1]).toBe(2);
    expect(run.plane[0]).toBe(0);
    expect(run.plane[run.count - 1]).toBe(1);
  });

  it("drops detail when zoomed out, but never the ends", () => {
    const wiggle = Array.from({ length: 60 }, (_, i) => at(3200 + i, 3200 + (i % 2), i));
    const fine = smoothRun(wiggle, 0, 59, 0, false);
    const coarse = smoothRun(wiggle, 0, 59, 2, false);
    expect(coarse.count).toBeLessThan(fine.count / 3);
    expect(vertices(coarse)[0]).toEqual(tileCenter(3200, 3200));
    expect(vertices(coarse)[coarse.count - 1]).toEqual(tileCenter(3259, 3201));
  });

  it("makes waves of a boat trip, between the same two ends", () => {
    const trip = [at(3040, 3200, 0, { boat: true }), at(3040, 3140, 1, { boat: true })];
    const run = smoothRun(trip, 0, 1, 0, true);
    const drawn = vertices(run);
    const [x] = tileCenter(3040, 3200);
    expect(drawn[0]).toEqual(tileCenter(3040, 3200));
    expect(drawn[drawn.length - 1]).toEqual(tileCenter(3040, 3140));
    expect(Math.max(...drawn.map(([vx]) => Math.abs(vx - x)))).toBeGreaterThan(1);
    expect(smoothRun(trip, 0, 1, 2, true).count).toBe(2);
  });

  it("knows how far along each vertex is and what it spans", () => {
    const run = smoothRun([at(3200, 3200, 0), at(3210, 3200, 1)], 0, 1, 0, false);
    expect(run.cum[0]).toBe(0);
    expect(run.cum[run.count - 1]).toBeCloseTo(40, 3);
    const [x0, y0] = tileCenter(3200, 3200);
    expect(run.bbox).toEqual([x0, y0, x0 + 40, y0]);
    expect(run.chunks[0]).toMatchObject({ i0: 0 });
  });
});

describe("arcPath", () => {
  it("joins the two ends and bulges to the left of travel", () => {
    const there = arcPath(0, 0, 400, 0);
    const back = arcPath(400, 0, 0, 0);
    expect([there[0], there[1]]).toEqual([0, 0]);
    expect([there[there.length - 2], there[there.length - 1]]).toEqual([400, 0]);
    const middle = (path) => path[(path.length / 2) | 1];
    // Heading east, left is up the screen (smaller y); heading back it is below.
    expect(middle(there)).toBeLessThan(-10);
    expect(middle(back)).toBeGreaterThan(10);
  });
});

describe("buildGeometry", () => {
  const points = [
    at(3200, 3200, 0),
    at(3210, 3200, 1),
    // Teleport on the surface.
    at(2662, 3305, 2),
    at(2670, 3305, 3),
    // Too far to tell.
    at(2670, 3505, 4),
    // Down a trapdoor.
    at(2670, 9905, 5),
    // And out to somewhere else entirely.
    at(3222, 3218, 6),
  ];
  const geometry = buildGeometry(buildTrailModel(points), 0);

  it("has a line per run and a mark per jump", () => {
    expect(geometry.runs.map((run) => [run.i0, run.i1])).toEqual([
      [0, 1],
      [2, 3],
      [4, 4],
      [5, 5],
      [6, 6],
    ]);
    expect(geometry.jumps.map((jump) => jump.kind)).toEqual(["teleport", "unknown", "entrance", "teleport"]);
  });

  it("arcs a teleport only when both ends are on the same part of the map", () => {
    expect(geometry.jumps.map((jump) => Boolean(jump.arc))).toEqual([true, false, false, false]);
    expect(geometry.jumps.map((jump) => jump.crossBand)).toEqual([false, false, true, true]);
    const [first] = geometry.jumps;
    expect([first.ax, first.ay]).toEqual(tileCenter(3210, 3200));
    expect([first.bx, first.by]).toEqual(tileCenter(2662, 3305));
    expect([first.tA, first.tB]).toEqual([T + 60, T + 120]);
  });
});

describe("vertexAtTime", () => {
  const run = smoothRun([at(3200, 3200, 0), at(3210, 3200, 1)], 0, 1, 2, false);

  it("finds the place on the line for a time", () => {
    expect(vertexAtTime(run, T - 1)).toBeNull();
    expect(pointOnRun(run, vertexAtTime(run, T + 30))[0]).toBeCloseTo(tileCenter(3205, 3200)[0], 3);
    expect(vertexAtTime(run, T + 999)).toEqual({ i: run.count - 1, frac: 0 });
  });
});

describe("hitTest", () => {
  const model = buildTrailModel([at(3200, 3200, 0), at(3210, 3200, 1), at(3220, 3200, 2), at(2662, 3305, 3)]);
  const geometry = buildGeometry(model, 0);

  it("finds the nearest point of the line under the pointer", () => {
    const [x, y] = tileCenter(3211, 3200);
    expect(hitTest(geometry, x, y + 3, 8)).toMatchObject({ src: 1 });
    const [x2, y2] = tileCenter(3219, 3200);
    expect(hitTest(geometry, x2, y2 - 3, 8)).toMatchObject({ src: 2 });
  });

  it("finds a point that stands alone", () => {
    const [x, y] = tileCenter(2662, 3305);
    expect(hitTest(geometry, x + 2, y, 8)).toMatchObject({ src: 3 });
  });

  it("gives the latest visit where the trail passes the same place twice", () => {
    const there = [at(3200, 3200, 0), at(3210, 3200, 1), at(3220, 3200, 2)];
    const andAgain = [at(3200, 3200, 10), at(3210, 3200, 11), at(3220, 3200, 12)];
    const twice = buildGeometry(buildTrailModel([...there, at(2662, 3305, 5), ...andAgain]), 0);
    const [x, y] = tileCenter(3210, 3200);
    expect(hitTest(twice, x, y, 8)).toMatchObject({ src: 5 });
  });

  it("misses when the pointer is further away than the radius", () => {
    const [x, y] = tileCenter(3210, 3200);
    expect(hitTest(geometry, x, y + 20, 8)).toBeNull();
  });
});
