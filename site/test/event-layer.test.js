import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventLayer } from "../src/canvas-map/event-layer";
import { EVENT_FRAME_MS } from "../src/canvas-map/event-markers";

describe("EventLayer, without a map", () => {
  const NOW = Date.parse("2026-10-01T12:00:00Z");
  const drop = (id, msAgo, extra = {}) => ({
    id,
    type: "loot",
    member: "Alice",
    value_gp: 2500000,
    occurred_at: new Date(NOW - msAgo).toISOString(),
    ...extra,
  });
  /** A canvas of 800 by 600 on which a tile is at its own coordinates. */
  const view = {
    width: 800,
    height: 600,
    plane: 0,
    tile: 4,
    reducedMotion: false,
    toScreen: (x, y) => [x, y],
    onScreen: (x, y, pad = 0) => x >= -pad && y >= -pad && x <= 800 + pad && y <= 600 + pad,
  };
  /** A canvas context that takes whatever is drawn on it. */
  const anyContext = () => new Proxy({}, { get: (target, key) => target[key] ?? (target[key] = vi.fn()) });

  let layer;
  let players;
  let changed;

  beforeEach(() => {
    players = new Map([["Alice", { color: "red", coordinates: { x: 100, y: 100, plane: 0 } }]]);
    changed = vi.fn();
    layer = new EventLayer({ playerOf: (name) => players.get(name), onChange: changed, now: () => NOW });
  });

  it("puts what the feed brings where its player is, and says the map changed", () => {
    layer.feed({ events: [drop("a", 60000)], added: [], initial: true });
    expect(layer.find("a")).toMatchObject({ x: 100, y: 100, plane: 0, color: "red" });
    expect(changed).toHaveBeenCalledTimes(1);

    // Nothing new to place: nothing to draw again.
    layer.placeLive();
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it("keeps an event for when its player turns up", () => {
    layer.feed({ events: [drop("b", 60000, { member: "Bob" })], added: [], initial: true });
    expect(layer.find("b")).toBeNull();

    players.set("Bob", { color: "blue", coordinates: { x: 200, y: 300, plane: 1 } });
    layer.placeLive();
    expect(layer.find("b")).toMatchObject({ x: 200, y: 300, plane: 1, color: "blue" });
  });

  it("draws what is in view, finds it under the pointer and says when to draw again", () => {
    const news = drop("a", 1000, { line: "Alice received a whip" });
    const far = drop("far", 1000, { member: "Bob" });
    players.set("Bob", { color: "blue", coordinates: { x: 5000, y: 5000, plane: 0 } });
    layer.feed({ events: [], added: [], initial: true });
    layer.feed({ events: [news, far], added: [news, far], initial: false });

    // The one that just happened rings: the next frame is wanted.
    expect(layer.draw(anyContext(), view)).toBe(EVENT_FRAME_MS);
    expect(layer.rendered).toHaveLength(1);
    const [marker] = layer.rendered;
    expect(layer.hitTest(marker.x, marker.y)).toBe(marker);
    expect(layer.hitTest(marker.x + 100, marker.y)).toBeNull();
    expect(layer.tooltip(marker)).toContain("Alice received a whip");
  });

  it("draws nothing of what the filters hide, and then has nothing to wait for", () => {
    layer.feed({ events: [drop("a", 60000)], added: [], initial: true });
    expect(layer.passes(drop("a", 0))).toBe(true);
    layer.setFilters({ ...layer.filters, loot: false });
    expect(layer.passes(drop("a", 0))).toBe(false);
    expect(layer.draw(anyContext(), view)).toBeNull();
    expect(layer.rendered).toEqual([]);
  });
});
