import { beforeEach, describe, expect, it } from "vitest";
import { TrailLayer } from "../src/canvas-map/trail-layer";
import { tileCenter } from "../src/canvas-map/trail-geometry";

const T = 1_790_000_040;
const COLORS = { color: "hsl(1, 70%, 45%)", light: "hsl(1, 85%, 70%)", windowS: 86400 };

/** A trail as the server sends it: one tile east per minute from (3200, 3200). */
function history(minutes = 3) {
  return {
    step: 60,
    points: Array.from({ length: minutes }, (_, i) => [3200 + i * 10, 3200, 0, T + i * 60]),
    worlds: [[0, 302]],
  };
}

const tile = (x, y = 3201, plane = 0) => ({ x, y, plane });

describe("TrailLayer", () => {
  let now, layer;

  beforeEach(() => {
    now = T + 130;
    layer = new TrailLayer({ now: () => now });
  });

  it("shows the trails it was given", () => {
    layer.setHistory("Alice", history(), COLORS);
    expect(layer.names()).toEqual(["Alice"]);
    expect(layer.modelOf("Alice").points).toHaveLength(3);
    layer.remove("Alice");
    expect(layer.names()).toEqual([]);
  });

  it("ends an online player's trail on their marker", () => {
    layer.setHistory("Alice", history(), COLORS);
    now = T + 200;
    expect(layer.observe("Alice", tile(3235), true)).toBe(true);
    const points = layer.modelOf("Alice").points;
    expect(points[points.length - 1]).toMatchObject({ x: 3235, y: 3201, t1: T + 200, live: true });
    expect(layer.isOnline("Alice")).toBe(true);
  });

  it("remembers where a player was seen before their trail was switched on", () => {
    layer.observe("Alice", tile(3235), true);
    layer.setHistory("Alice", history(), COLORS);
    const points = layer.modelOf("Alice").points;
    expect(points[points.length - 1]).toMatchObject({ x: 3235 });
  });

  it("does not report a change for a player whose trail isn't shown", () => {
    expect(layer.observe("Bob", tile(3000), true)).toBe(false);
    expect(layer.names()).toEqual([]);
  });

  it("ends an offline player's trail where the hub last saw them", () => {
    layer.observe("Alice", tile(3235), true);
    layer.setHistory("Alice", history(), COLORS);
    expect(layer.observe("Alice", null, false)).toBe(true);
    const points = layer.modelOf("Alice").points;
    expect(points[points.length - 1]).toMatchObject({ x: 3220 });
    expect(layer.isOnline("Alice")).toBe(false);
  });

  it("shows the time a player was logged out as a gap, not as standing still", () => {
    layer.setHistory("Alice", history(), COLORS);
    now = T + 300;
    layer.observe("Alice", tile(3230), true);
    now = T + 400;
    layer.observe("Alice", tile(3230), false);
    now = T + 1500;
    layer.observe("Alice", tile(3230), true);
    const model = layer.modelOf("Alice");
    expect(model.points.slice(-2).map((point) => [point.x, point.t0])).toEqual([
      [3230, T + 300],
      [3230, T + 1500],
    ]);
    expect(model.kinds[model.kinds.length - 1]).toBe("unknown");
  });

  it("keeps the live points when the history is fetched again", () => {
    layer.setHistory("Alice", history(), COLORS);
    for (const [seconds, x] of [
      [200, 3230],
      [260, 3240],
      [320, 3250],
    ]) {
      now = T + seconds;
      layer.observe("Alice", tile(x), true);
    }
    layer.setHistory("Alice", history(), COLORS);
    expect(layer.modelOf("Alice").points.map((point) => point.x)).toEqual([3200, 3210, 3220, 3230, 3240, 3250]);

    // The hub caught up with two of them: its samples replace the live ones.
    layer.setHistory("Alice", history(5), COLORS);
    expect(layer.modelOf("Alice").points.map((point) => point.x)).toEqual([3200, 3210, 3220, 3230, 3240, 3250]);
    expect(layer.modelOf("Alice").points.filter((point) => point.live)).toHaveLength(1);
  });

  it("gives the time span and the ticks of everything shown", () => {
    layer.setHistory("Alice", history(), COLORS);
    layer.setHistory(
      "Bob",
      {
        step: 60,
        points: [
          [3000, 3000, 0, T - 600],
          [2400, 3000, 0, T - 540],
        ],
      },
      COLORS
    );
    layer.setDeaths("Alice", [{ id: "d", x: 3205, y: 3201, plane: 0, t: T + 30 }]);
    const timeline = layer.timeline();
    expect([timeline.tMin, timeline.tMax]).toEqual([T - 600, T + 120]);
    expect(timeline.ticks).toEqual([
      { t: T - 540, kind: "teleport", color: COLORS.color },
      { t: T + 30, kind: "death", color: COLORS.color },
    ]);
    expect(new TrailLayer().timeline()).toEqual({ tMin: null, tMax: null, ticks: [] });
  });

  it("says when something next happens on any of the trails", () => {
    layer.setHistory("Alice", history(), COLORS);
    layer.setHistory(
      "Bob",
      {
        step: 60,
        points: [
          [3000, 3000, 0, T + 400, 700],
          [3010, 3000, 0, T + 460],
        ],
      },
      COLORS
    );
    // Alice is under way.
    expect(layer.nextChangeAfter(T + 30)).toBe(T + 30);
    // Alice is done; Bob stays where he is until T + 400.
    expect(layer.nextChangeAfter(T + 121)).toBe(T + 400);
    expect(layer.nextChangeAfter(T + 500)).toBeNull();
    expect(new TrailLayer().nextChangeAfter(T)).toBeNull();
  });

  it("leaves out deaths from before the trail starts", () => {
    layer.setHistory("Alice", history(), COLORS);
    layer.setDeaths("Alice", [{ id: "old", x: 3205, y: 3201, plane: 0, t: T - 5000 }]);
    expect(layer.timeline().ticks).toEqual([]);
  });

  it("finds the point of a trail under the pointer", () => {
    layer.setHistory("Alice", history(), COLORS);
    const [x, y] = tileCenter(3211, 3201);
    const hit = layer.hitTest(x, y + 2, 8, 2);
    expect(hit).toMatchObject({ name: "Alice", index: 1 });
    expect(hit.point).toMatchObject({ x: 3210, y: 3201, world: 302 });
    expect(layer.hitTest(x, y + 40, 8, 2)).toBeNull();
  });

  it("says where a player was at a time of the replay", () => {
    layer.setHistory("Alice", history(), COLORS);
    const [x, y] = tileCenter(3210, 3201);
    expect(layer.ghostAt("Alice", T + 60, 2)).toEqual({ x, y, plane: 0 });
    expect(layer.ghostAt("Alice", T - 100, 2)).toBeNull();
    expect(layer.ghostAt("Nobody", T + 60, 2)).toBeNull();
  });

  it("says whether the hovered point changed", () => {
    layer.setHistory("Alice", history(), COLORS);
    const [x, y] = tileCenter(3210, 3201);
    const hit = layer.hitTest(x, y, 8, 2);
    expect(layer.setHover(hit)).toBe(true);
    expect(layer.setHover(layer.hitTest(x, y, 8, 2))).toBe(false);
    expect(layer.setHover(null)).toBe(true);
  });

  it("draws nothing and wants no frames without trails", () => {
    expect(layer.draw({}, { zoom: 1 }, null)).toBe(false);
  });
});
