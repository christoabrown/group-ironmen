import { describe, expect, it } from "vitest";
import {
  band,
  buildTrailModel,
  classifyStep,
  deathMarks,
  decodeTrail,
  formatTrailTime,
  mergeTrail,
  nextChangeAfter,
  observeLive,
  positionAt,
  timelineTicks,
} from "../src/canvas-map/trail-model";

const T = 1_790_000_040;

/** A point at a game tile as the plugin reports it, `minute` minutes in. */
function at(x, y, minute, extra = {}) {
  const t = T + minute * 60;
  return { x, y: y + 1, plane: 0, t0: t, t1: t, boat: false, world: null, ...extra };
}

describe("decodeTrail", () => {
  it("reads points with their dwell, boat flag and world", () => {
    const trail = decodeTrail({
      step: 120,
      points: [
        [3200, 3200, 0, T],
        [3201, 3200, 0, T + 120, 60],
        [3202, 3200, 1, T + 180, 0, 1],
      ],
      worlds: [
        [0, 302],
        [2, 330],
      ],
    });
    expect(trail.step).toBe(120);
    expect(trail.points).toEqual([
      { x: 3200, y: 3201, plane: 0, t0: T, t1: T, boat: false, world: 302 },
      { x: 3201, y: 3201, plane: 0, t0: T + 60, t1: T + 120, boat: false, world: 302 },
      { x: 3202, y: 3201, plane: 1, t0: T + 180, t1: T + 180, boat: true, world: 330 },
    ]);
  });

  it("reads a bare list of points from an older server and skips broken ones", () => {
    const trail = decodeTrail([
      [3200, 3200, 0, T],
      [NaN, 3200, 0, T + 60],
    ]);
    expect(trail.step).toBe(60);
    expect(trail.points).toEqual([{ x: 3200, y: 3201, plane: 0, t0: T, t1: T, boat: false, world: null }]);
  });
});

describe("band", () => {
  it("tells the surface, the underground, instances and the rest apart", () => {
    expect(band(3200, 3201)).toBe("surface");
    expect(band(3097, 9869)).toBe("under");
    expect(band(6500, 3001)).toBe("instance");
    expect(band(2400, 5101)).toBe("other");
  });
});

describe("classifyStep", () => {
  it("is a walk when the distance is comfortably runnable", () => {
    expect(classifyStep(at(3200, 3200, 0), at(3350, 3200, 1))).toBe("walk");
  });

  it("is a teleport when nobody could have run that far", () => {
    // Lumbridge to Ardougne within a minute.
    expect(classifyStep(at(3222, 3218, 0), at(2662, 3305, 1))).toBe("teleport");
  });

  it("is unknown when it could just have been a sprint", () => {
    // Lumbridge to Varrock: 206 tiles, a minute apart.
    expect(classifyStep(at(3222, 3218, 0), at(3212, 3424, 1))).toBe("unknown");
  });

  it("is an entrance when the other end is the same place 6400 tiles north", () => {
    expect(classifyStep(at(3097, 3468, 0), at(3097, 9868, 1))).toBe("entrance");
    expect(classifyStep(at(3107, 9888, 0), at(3100, 3470, 1))).toBe("entrance");
  });

  it("is a teleport when it crosses to another part of the map otherwise", () => {
    expect(classifyStep(at(3142, 9958, 0), at(3222, 3218, 1))).toBe("teleport");
    expect(classifyStep(at(3200, 3200, 0), at(6500, 3200, 1))).toBe("teleport");
  });

  it("is unknown across a gap in the data, however near", () => {
    expect(classifyStep(at(3200, 3200, 0), at(3201, 3200, 10))).toBe("unknown");
    expect(classifyStep(at(3200, 3200, 0), at(3201, 3200, 10), 1800)).toBe("walk");
    expect(classifyStep(at(3200, 3200, 0), at(4200, 3200, 10))).toBe("unknown");
  });

  it("is a sail between two points on a boat, which is faster than running", () => {
    const boat = { boat: true };
    expect(classifyStep(at(3040, 3200, 0, boat), at(3060, 3140, 1, boat))).toBe("sail");
    expect(classifyStep(at(3040, 3200, 0, boat), at(3040, 2900, 1, boat))).toBe("sail");
    expect(classifyStep(at(3040, 3210, 0), at(3040, 3200, 1, boat))).toBe("walk");
  });

  it("is stairs when only the floor changes", () => {
    expect(classifyStep(at(3432, 3538, 0), at(3436, 3540, 1, { plane: 1 }))).toBe("stairs");
  });

  it("counts the time from leaving one tile to reaching the next", () => {
    const stayed = { ...at(3200, 3200, 0), t1: T + 540 };
    expect(classifyStep(stayed, at(3210, 3200, 10))).toBe("walk");
  });
});

describe("buildTrailModel", () => {
  it("chains walked points into runs and lists the jumps between them", () => {
    const points = [at(3200, 3200, 0), at(3210, 3200, 1), at(3220, 3200, 2), at(2662, 3305, 3), at(2670, 3305, 4)];
    const model = buildTrailModel(points);
    expect(model.kinds).toEqual(["walk", "walk", "teleport", "walk"]);
    expect(model.runs).toEqual([
      { i0: 0, i1: 2, sail: false },
      { i0: 3, i1: 4, sail: false },
    ]);
    expect(model.jumps).toEqual([{ from: 2, kind: "teleport" }]);
    expect([model.tMin, model.tMax]).toEqual([T, T + 240]);
  });

  it("keeps a point that stands alone between two jumps as a run of its own", () => {
    const model = buildTrailModel([at(3200, 3200, 0), at(2662, 3305, 1), at(3200, 3200, 2)]);
    expect(model.runs).toEqual([
      { i0: 0, i1: 0, sail: false },
      { i0: 1, i1: 1, sail: false },
      { i0: 2, i1: 2, sail: false },
    ]);
  });

  it("gives a boat trip its own run, joined to the walks on either side", () => {
    const boat = { boat: true };
    const points = [
      at(3030, 3220, 0),
      at(3040, 3210, 1),
      at(3040, 3200, 2, boat),
      at(3060, 3140, 3, boat),
      at(3062, 3136, 4),
    ];
    expect(buildTrailModel(points).runs).toEqual([
      { i0: 0, i1: 2, sail: false },
      { i0: 2, i1: 3, sail: true },
      { i0: 3, i1: 4, sail: false },
    ]);
  });

  it("does not call the spacing of a thinned trail a gap", () => {
    const points = [at(3200, 3200, 0), at(3300, 3200, 10), at(3400, 3200, 20)];
    expect(buildTrailModel(points).kinds).toEqual(["unknown", "unknown"]);
    expect(buildTrailModel(points, { step: 600 }).kinds).toEqual(["walk", "walk"]);
  });

  it("is empty for no points", () => {
    expect(buildTrailModel([])).toMatchObject({ points: [], runs: [], jumps: [], tMin: null, tMax: null });
  });
});

describe("mergeTrail", () => {
  const history = [at(3200, 3200, 0), at(3210, 3200, 1)];
  const live = (x, y, seconds) => ({
    x,
    y: y + 1,
    plane: 0,
    t0: T + seconds,
    t1: T + seconds,
    boat: false,
    world: null,
    live: true,
  });

  it("lets the hub's samples win for the minutes it has, and adds what came after", () => {
    const merged = mergeTrail(history, [live(3205, 3200, 30), live(3212, 3200, 100), live(3220, 3200, 130)], null);
    expect(merged.map((point) => point.x)).toEqual([3200, 3210, 3220]);
    expect(merged[2].live).toBe(true);
  });

  it("always ends on the marker while the player is online", () => {
    const head = { x: 3230, y: 3201, plane: 0, boat: false, world: 302, t: T + 200 };
    const merged = mergeTrail(history, [], head);
    expect(merged[merged.length - 1]).toMatchObject({ x: 3230, t0: T + 200, t1: T + 200, live: true });
  });

  it("stretches the last stay when the marker is still on it", () => {
    const head = { x: 3210, y: 3201, plane: 0, boat: false, world: 302, t: T + 200 };
    const merged = mergeTrail(history, [], head);
    expect(merged).toHaveLength(2);
    expect(merged[1]).toMatchObject({ t0: T + 60, t1: T + 200 });
    expect(history[1].t1).toBe(T + 60);
  });

  it("keeps a return to the same tile after an absence apart from the stay before it", () => {
    const before = { ...live(3220, 3200, 200), t1: T + 260 };
    const merged = mergeTrail(history, [before, live(3220, 3200, 9000)], null);
    expect(merged.map((point) => [point.t0, point.t1])).toEqual([
      [T, T],
      [T + 60, T + 60],
      [T + 200, T + 260],
      [T + 9000, T + 9000],
    ]);
  });

  it("counts an online player as still there, however long ago they were last seen to move", () => {
    const head = { x: 3210, y: 3201, plane: 0, boat: false, world: 302, t: T + 9000 };
    const merged = mergeTrail(history, [], head);
    expect(merged).toHaveLength(2);
    expect(merged[1].t1).toBe(T + 9000);
  });

  it("is only the live points when the hub has none yet", () => {
    expect(mergeTrail([], [live(3200, 3200, 10)], null)).toHaveLength(1);
  });
});

describe("observeLive", () => {
  const coords = (x, y) => ({ x, y, plane: 0, boat: false, world: 302 });

  it("adds a point per tile and stretches it while the player stays", () => {
    const buffer = [];
    expect(observeLive(buffer, coords(3200, 3201), T)).toBe(true);
    expect(observeLive(buffer, coords(3200, 3201), T + 5)).toBe(false);
    expect(observeLive(buffer, coords(3201, 3201), T + 10)).toBe(true);
    expect(buffer).toEqual([
      { x: 3200, y: 3201, plane: 0, boat: false, world: 302, t0: T, t1: T + 5, live: true },
      { x: 3201, y: 3201, plane: 0, boat: false, world: 302, t0: T + 10, t1: T + 10, live: true },
    ]);
  });

  it("starts a new stay on the same tile when told the player was away", () => {
    const buffer = [];
    observeLive(buffer, coords(3200, 3201), T);
    expect(observeLive(buffer, coords(3200, 3201), T + 1500, { fresh: true })).toBe(true);
    expect(buffer.map((point) => [point.t0, point.t1])).toEqual([
      [T, T],
      [T + 1500, T + 1500],
    ]);
  });

  it("forgets what is too old or too much", () => {
    const buffer = [];
    for (let i = 0; i < 10; i++)
      observeLive(buffer, coords(3200 + i, 3201), T + i * 60, { maxPoints: 5, maxAgeS: 3600 });
    expect(buffer.map((point) => point.x)).toEqual([3205, 3206, 3207, 3208, 3209]);
    observeLive(buffer, coords(3300, 3201), T + 9 * 60 + 3550, { maxPoints: 5, maxAgeS: 3600 });
    expect(buffer.map((point) => point.x)).toEqual([3209, 3300]);
  });
});

describe("time on a trail", () => {
  const stay = { ...at(3210, 3200, 1), t1: T + 180 };
  const model = buildTrailModel([at(3200, 3200, 0), stay, at(3220, 3200, 4), at(2662, 3305, 5), at(2670, 3305, 6)]);

  it("finds where the player was", () => {
    expect(positionAt(model, T - 1)).toBeNull();
    expect(positionAt(model, T + 30)).toMatchObject({ index: 0, frac: 0.5, kind: "walk", x: 3205, moving: true });
    expect(positionAt(model, T + 100)).toMatchObject({ index: 1, frac: 0, x: 3210, moving: false });
    expect(positionAt(model, T + 270)).toMatchObject({ index: 2, frac: 0.5, kind: "teleport", x: 3220, moving: true });
    expect(positionAt(model, T + 9999)).toMatchObject({ index: 4, frac: 0, x: 2670, moving: false });
  });

  it("knows when the player next moves", () => {
    expect(nextChangeAfter(model, T + 30)).toBe(T + 30);
    expect(nextChangeAfter(model, T + 100)).toBe(T + 180);
    expect(nextChangeAfter(model, T + 9999)).toBeNull();
  });

  it("waits out a long absence however the player came back", () => {
    // Logged out in an instance, back on the surface eight hours later.
    const away = buildTrailModel([at(6500, 3200, 0), at(3222, 3218, 480)]);
    expect(away.kinds).toEqual(["teleport"]);
    expect(nextChangeAfter(away, T + 100)).toBe(T + 480 * 60);
  });

  it("waits out a gap in the data", () => {
    const gappy = buildTrailModel([at(3200, 3200, 0), at(3200, 3210, 60)]);
    expect(nextChangeAfter(gappy, T + 30)).toBe(T + 3600);
  });
});

describe("deaths and the timeline", () => {
  const events = [
    {
      id: "a",
      type: "death",
      member: "Alice",
      occurred_at: new Date((T + 90) * 1000).toISOString(),
      location: { x: 3142, y: 9958, plane: 0 },
    },
    {
      id: "b",
      type: "death",
      member: "Bob",
      occurred_at: new Date((T + 95) * 1000).toISOString(),
      location: { x: 1, y: 1, plane: 0 },
    },
    { id: "c", type: "loot", member: "Alice", occurred_at: new Date((T + 99) * 1000).toISOString() },
    { id: "d", type: "death", member: "Alice", occurred_at: new Date((T + 400) * 1000).toISOString() },
  ];

  it("marks a player's deaths that have a place", () => {
    expect(deathMarks(events, "Alice")).toEqual([{ id: "a", x: 3142, y: 9959, plane: 0, t: T + 90 }]);
  });

  it("lists teleports and deaths on the timeline, in order", () => {
    const model = buildTrailModel([at(3200, 3200, 0), at(2662, 3305, 1), at(2670, 3305, 2)]);
    expect(timelineTicks(model, deathMarks(events, "Alice"))).toEqual([
      { t: T + 60, kind: "teleport" },
      { t: T + 90, kind: "death" },
    ]);
  });
});

describe("formatTrailTime", () => {
  it("shows one time for a passing point and a range for a stay", () => {
    expect(formatTrailTime(T, T, T + 600)).toMatch(/^\d{1,2}[:.]\d{2}( [AP]M)?$/i);
    expect(formatTrailTime(T, T + 600, T + 600)).toContain(" – ");
  });

  it("adds the day when it was not today", () => {
    const short = formatTrailTime(T, T, T + 600);
    expect(formatTrailTime(T, T, T + 3 * 86400).length).toBeGreaterThan(short.length);
  });
});
