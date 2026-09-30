import { beforeEach, describe, expect, it, vi } from "vitest";
import { Animation } from "../src/canvas-map/animation";

vi.mock("../src/rs-tooltip/tooltip-manager", () => ({
  tooltipManager: { showTooltip: vi.fn(), hideTooltip: vi.fn() },
}));

import { CanvasMap, DEATH_MARKER_MS, PING_LABEL_MS, PING_RING_MS } from "../src/canvas-map/canvas-map";
import { pingForEvent, defaultPingFilters } from "../src/map-page/map-page";
import { LiveEvents } from "../src/data/live-events";
import { pubsub } from "../src/data/pubsub";
import { selection } from "../src/data/selection";
import { sparklinePoints } from "../src/player-profile-view/player-profile-view";

function createMap() {
  const map = new CanvasMap();
  map.plane = 1;
  map.tileSize = 256;
  map.pixelsPerGameTile = 4;
  map.canvas = { width: 800, height: 600, getBoundingClientRect: () => ({ left: 0, top: 0 }) };
  map.camera = {
    x: new Animation({ current: 0, target: 0, progress: 1 }),
    y: new Animation({ current: 0, target: 0, progress: 1 }),
    zoom: new Animation({ current: 1, target: 1, progress: 1 }),
    maxZoom: 6,
    minZoom: 0.5,
    isDragging: false,
  };
  map.cursor = { x: 0, y: 0, frameX: [0], frameY: [0] };
  map.touch = {};
  map.playerMarkers = new Map();
  map.trails = new Map();
  map.pings = [];
  map.renderedPlayers = [];
  map.followingPlayer = {};
  map.coordinatesDisplay = { innerText: "" };
  map.style = {};
  map.classList = { add: vi.fn(), remove: vi.fn() };
  return map;
}

describe("player clusters and labels", () => {
  it("groups players that are close on screen, per plane", () => {
    const points = [
      { name: "a", x: 100, y: 100, plane: 0 },
      { name: "b", x: 110, y: 105, plane: 0 },
      { name: "c", x: 400, y: 100, plane: 0 },
      { name: "d", x: 101, y: 101, plane: 1 },
    ];
    const groups = CanvasMap.clusterMarkers(points, 34);
    const sizes = groups
      .map((group) =>
        group.members
          .map((m) => m.name)
          .sort()
          .join()
      )
      .sort();
    expect(sizes).toEqual(["a,b", "c", "d"]);
    const pair = groups.find((group) => group.members.length === 2);
    expect(pair.x).toBeCloseTo(105);
  });

  it("merges groups that straddle a cell border", () => {
    const groups = CanvasMap.clusterMarkers(
      [
        { name: "a", x: 33, y: 10, plane: 0 },
        { name: "b", x: 35, y: 10, plane: 0 },
      ],
      34
    );
    expect(groups).toHaveLength(1);
  });

  it("keeps the first of two overlapping labels", () => {
    const kept = CanvasMap.placeLabels([
      { key: "selected", x: 0, y: 0, width: 50, height: 16 },
      { key: "overlapping", x: 40, y: 5, width: 50, height: 16 },
      { key: "apart", x: 200, y: 0, width: 50, height: 16 },
    ]);
    expect([...kept].sort()).toEqual(["apart", "selected"]);
  });
});

describe("player hit testing and clicks", () => {
  beforeEach(() => pubsub.unpublishAll());

  it("finds the drawn player under the pointer", () => {
    const map = createMap();
    map.renderedPlayers = [
      { kind: "player", name: "Alice", x: 100, y: 100, r: 8 },
      { kind: "cluster", x: 300, y: 300, r: 14, members: [] },
    ];
    expect(map.getPlayerAtClient(104, 98).name).toBe("Alice");
    expect(map.getPlayerAtClient(310, 305).kind).toBe("cluster");
    expect(map.getPlayerAtClient(200, 200)).toBeNull();
  });

  it("selects a player on click but not after a drag", () => {
    const map = createMap();
    map.renderedPlayers = [{ kind: "player", name: "Alice", x: 100, y: 100, r: 8 }];
    const selected = [];
    pubsub.subscribe("player-selected", (value) => selected.push(value));

    map.onPointerDown({ clientX: 100, clientY: 100 });
    map.stopDragging();
    expect(selected).toEqual([{ name: "Alice", follow: true }]);

    map.onPointerDown({ clientX: 100, clientY: 100 });
    map.processPointerMove = vi.fn();
    map.startDragging = vi.fn();
    map.onPointerMove({ clientX: 140, clientY: 100 });
    expect(map.startDragging).toHaveBeenCalled();
    map.stopDragging();
    expect(selected).toHaveLength(1);
  });

  it("follows the player that gets selected", () => {
    const map = createMap();
    map.playerMarkers.set("Alice", { name: "Alice", coordinates: { x: 3200, y: 3200, plane: 0 } });
    map.handleSelected({ name: "Alice", follow: true });
    expect(map.followingPlayer.name).toBe("Alice");
    expect(map.selectedName).toBe("Alice");
    map.handleSelected(null);
    expect(map.selectedName).toBeNull();
  });
});

describe("event pings", () => {
  it("live as long as their kind needs", () => {
    const start = 1000;
    expect(CanvasMap.pingAlive({ start, kind: "level" }, start + PING_RING_MS - 1)).toBe(true);
    expect(CanvasMap.pingAlive({ start, kind: "level" }, start + PING_RING_MS + 1)).toBe(false);
    expect(CanvasMap.pingAlive({ start, kind: "loot", label: "1M gp" }, start + PING_LABEL_MS - 1)).toBe(true);
    expect(CanvasMap.pingAlive({ start, kind: "death" }, start + DEATH_MARKER_MS - 1)).toBe(true);
    expect(CanvasMap.pingAlive({ start, kind: "death" }, start + DEATH_MARKER_MS + 1)).toBe(false);
  });

  it("are placed at the event's location, or else where the player is", () => {
    const filters = defaultPingFilters();
    const member = { online: true, color: "red", coordinates: { x: 3000, y: 3001, plane: 0 } };
    const death = pingForEvent({ type: "death", location: { x: 3200, y: 3200, plane: 1 } }, member, filters);
    expect(death).toMatchObject({ x: 3200, y: 3201, plane: 1, kind: "death", color: "red" });

    const loot = pingForEvent({ type: "loot", value_gp: 2500000 }, member, filters);
    expect(loot).toMatchObject({ x: 3000, y: 3001, kind: "loot", label: "2.5M gp" });

    expect(pingForEvent({ type: "loot", value_gp: 5000 }, member, filters)).toBeNull();
    expect(pingForEvent({ type: "level_up", level: 99, skill: "Attack" }, { online: false }, filters)).toBeNull();
    expect(
      pingForEvent({ type: "level_up", level: 99, skill: "Attack" }, member, { ...filters, level: false })
    ).toBeNull();
  });
});

describe("live events", () => {
  beforeEach(() => pubsub.unpublishAll());

  it("treats the first load as history and later ones as new", () => {
    const live = new LiveEvents();
    const published = [];
    pubsub.subscribe("live-events", (value) => published.push(value));

    live.apply([
      { id: "b", seq: 2 },
      { id: "a", seq: 1 },
    ]);
    expect(published[0].added).toEqual([]);
    expect(live.latest).toBe(2);

    live.apply([{ id: "c", seq: 3 }]);
    expect(published[1].added.map((e) => e.id)).toEqual(["c"]);
    expect(published[1].events.map((e) => e.id)).toEqual(["c", "b", "a"]);

    live.apply([]);
    expect(published).toHaveLength(2);
  });
});

describe("selection", () => {
  beforeEach(() => {
    pubsub.unpublishAll();
    selection.reset();
  });

  it("caps the number of trails", () => {
    for (let i = 0; i < 8; i++) expect(selection.toggleTrail(`P${i}`)).toBe(true);
    expect(selection.toggleTrail("one more")).toBe(false);
    expect(selection.toggleTrail("P0")).toBe(true);
    expect(selection.hasTrail("P0")).toBe(false);
  });
});

describe("wealth sparkline", () => {
  it("maps the lowest value to the bottom and the highest to the top", () => {
    const points = sparklinePoints([10, 20, 15], 100, 50, 0).split(" ");
    expect(points).toEqual(["0.0,50.0", "50.0,0.0", "100.0,25.0"]);
    expect(sparklinePoints([5], 100, 50)).toBe("");
  });
});
