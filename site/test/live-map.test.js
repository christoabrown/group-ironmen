import { beforeEach, describe, expect, it, vi } from "vitest";
import { Animation } from "../src/canvas-map/animation";

vi.mock("../src/rs-tooltip/tooltip-manager", () => ({
  tooltipManager: { showTooltip: vi.fn(), hideTooltip: vi.fn() },
}));

import { CanvasMap } from "../src/canvas-map/canvas-map";
import { EVENT_FRAME_MS, EVENT_MARKER_MS, EVENT_WAKE_MS } from "../src/canvas-map/event-markers";
import { EVENT_PLACES_KEY } from "../src/canvas-map/event-places";
import { api } from "../src/data/api";
import { defaultEventFilters } from "../src/data/event-view";
import { groupData } from "../src/data/group-data";
import { tooltipManager } from "../src/rs-tooltip/tooltip-manager";
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
  map.renderedEvents = [];
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

describe("events on the map", () => {
  const NOW = Date.parse("2026-10-01T12:00:00Z");
  const MINUTE = 60000;
  const drop = (id, msAgo, extra = {}) => ({
    id,
    type: "loot",
    member: "Alice",
    value_gp: 2500000,
    occurred_at: new Date(NOW - msAgo).toISOString(),
    ...extra,
  });
  const alice = { name: "Alice", color: "red", coordinates: { x: 3000, y: 3001, plane: 0 } };
  /** A canvas context that takes whatever is drawn on it. */
  const anyContext = () => new Proxy({}, { get: (target, key) => target[key] ?? (target[key] = vi.fn()) });

  let map;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    api.clockOffsetMs = 0;
    map = createMap();
    map.ctx = anyContext();
    map.playerMarkers.set("Alice", alice);
    centerOn(map, 3000, 3001);
  });

  function centerOn(target, x, y) {
    const [cx, cy] = target.gamePositionToCameraCenter(x, y);
    target.camera.x.current = cx;
    target.camera.y.current = cy;
  }

  it("are placed where they say they happened, or else where the player is", () => {
    map.handleLiveEvents({
      events: [
        drop("death", MINUTE, { type: "death", location: { x: 3200, y: 3200, plane: 1 } }),
        drop("loot", MINUTE),
        drop("offline", MINUTE, { member: "Bob" }),
      ],
      added: [],
      initial: true,
    });
    expect(map.eventMarkers.find("death")).toMatchObject({ x: 3200, y: 3201, plane: 1, color: "red" });
    expect(map.eventMarkers.find("loot")).toMatchObject({ x: 3000, y: 3001, plane: 0 });
    expect(map.eventMarkers.find("offline")).toBeNull();
  });

  it("are put back without a fuss when the map opens, and ring when they happen", () => {
    map.handleLiveEvents({ events: [drop("old", 5000)], added: [], initial: true });
    expect(map.eventMarkers.find("old")).toMatchObject({ arrived: null, approximate: true });

    const news = drop("new", 2000);
    map.handleLiveEvents({ events: [news, drop("old", 5000)], added: [news], initial: false });
    expect(map.eventMarkers.find("new")).toMatchObject({ arrived: NOW, approximate: false });
  });

  it("don't ring for the last poll, replayed to a map that is only now there", () => {
    const event = drop("a", 2000);
    map.handleLiveEvents({ events: [event], added: [event], initial: false });
    expect(map.eventMarkers.find("a").arrived).toBeNull();
  });

  it("turn up once their player does", () => {
    map.handleLiveEvents({ events: [drop("bob", MINUTE, { member: "Bob" })], added: [], initial: true });
    expect(map.eventMarkers.find("bob")).toBeNull();
    map.handleUpdatedMembers([{ name: "Bob", coordinates: { x: 3100, y: 3100, plane: 0 }, color: "blue" }]);
    expect(map.eventMarkers.find("bob")).toMatchObject({ x: 3100, y: 3100, color: "blue" });
  });

  describe("after a reload", () => {
    /** The map as a reload leaves it: nothing in memory, the player somewhere else by now. */
    function reloaded() {
      const fresh = createMap();
      fresh.ctx = anyContext();
      fresh.playerMarkers.set("Alice", { ...alice, coordinates: { x: 2500, y: 2500, plane: 0 } });
      return fresh;
    }

    it("are back where they were put when they happened", () => {
      const event = drop("a", 2000);
      map.handleLiveEvents({ events: [], added: [], initial: true });
      map.handleLiveEvents({ events: [event], added: [event], initial: false });

      vi.setSystemTime(NOW + 5 * MINUTE);
      const fresh = reloaded();
      fresh.handleLiveEvents({ events: [event], added: [], initial: true });
      expect(fresh.eventMarkers.find("a")).toMatchObject({ x: 3000, y: 3001, plane: 0, approximate: false });
      // Put back, not announced.
      expect(fresh.eventMarkers.find("a").arrived).toBeNull();
    });

    it("are where the player is now, as a guess, when this browser never saw them happen", () => {
      const fresh = reloaded();
      fresh.handleLiveEvents({ events: [drop("a", 5 * MINUTE)], added: [], initial: true });
      expect(fresh.eventMarkers.find("a")).toMatchObject({ x: 2500, y: 2500, approximate: true });
      expect(localStorage.getItem(EVENT_PLACES_KEY)).toBeNull();
    });

    it("forget the places of events whose time is up", () => {
      const first = drop("first", 1000);
      map.handleLiveEvents({ events: [], added: [], initial: true });
      map.handleLiveEvents({ events: [first], added: [first], initial: false });
      expect(Object.keys(JSON.parse(localStorage.getItem(EVENT_PLACES_KEY)))).toEqual(["first"]);

      vi.setSystemTime(NOW + EVENT_MARKER_MS);
      const second = { ...drop("second", 0), occurred_at: new Date(NOW + EVENT_MARKER_MS - 1000).toISOString() };
      map.handleLiveEvents({ events: [second, first], added: [second], initial: false });
      expect(Object.keys(JSON.parse(localStorage.getItem(EVENT_PLACES_KEY)))).toEqual(["second"]);
    });

    it("do without what was remembered when it can't be read", () => {
      localStorage.setItem(EVENT_PLACES_KEY, "{not json");
      const fresh = reloaded();
      fresh.handleLiveEvents({ events: [drop("a", 5 * MINUTE)], added: [], initial: true });
      expect(fresh.eventMarkers.find("a")).toMatchObject({ x: 2500, approximate: true });
    });
  });

  it("start over when the feed does", () => {
    map.handleLiveEvents({ events: [drop("a", MINUTE)], added: [], initial: true });
    map.handleLiveEvents({ events: [drop("b", MINUTE)], added: [], initial: true });
    expect(map.eventMarkers.find("a")).toBeNull();
    expect(map.eventMarkers.find("b")).not.toBeNull();
  });

  it("are drawn under their tile, and can be found there", () => {
    map.handleLiveEvents({ events: [drop("a", MINUTE)], added: [], initial: true });
    map.drawEvents();
    expect(map.renderedEvents).toHaveLength(1);
    const [x, y] = map.tileCenterOnScreen(3000, 3001);
    expect(map.renderedEvents[0]).toMatchObject({ anchorX: x, anchorY: y, count: 1 });
    expect(map.renderedEvents[0].y).toBeGreaterThan(y);
    expect(map.ctx.arc).toHaveBeenCalled();
  });

  it("go when the filters hide them", () => {
    map.handleLiveEvents({ events: [drop("a", MINUTE)], added: [], initial: true });
    map.setEventFilters({ ...defaultEventFilters(), loot: false });
    expect(map.updateRequested).toBe(1);
    map.drawEvents();
    expect(map.renderedEvents).toEqual([]);
  });

  it("have the map drawn again while they ring, and now and then while they fade", () => {
    const requested = vi.spyOn(map, "requestEventFrame");
    map.handleLiveEvents({ events: [], added: [], initial: true });
    map.drawEvents();
    expect(requested).not.toHaveBeenCalled();

    const event = drop("a", 1000);
    map.handleLiveEvents({ events: [event], added: [event], initial: false });
    map.drawEvents();
    expect(requested).toHaveBeenLastCalledWith(EVENT_FRAME_MS);

    vi.setSystemTime(NOW + 5 * MINUTE);
    map.drawEvents();
    expect(requested).toHaveBeenLastCalledWith(EVENT_WAKE_MS);
  });

  it("are forgotten after half an hour, without anything else happening", () => {
    map.handleLiveEvents({ events: [drop("a", 0)], added: [], initial: true });
    map.drawEvents();
    map.updateRequested = 0;
    vi.advanceTimersByTime(EVENT_WAKE_MS);
    expect(map.updateRequested).toBe(1);

    vi.setSystemTime(NOW + EVENT_MARKER_MS);
    map.drawEvents();
    expect(map.renderedEvents).toEqual([]);
    expect(map.eventMarkers.find("a")).toBeNull();
  });

  describe("under the pointer", () => {
    let x, y;

    beforeEach(() => {
      map.processPointerMove = vi.fn();
      map.handleLiveEvents({
        events: [
          drop("a", MINUTE, { line: "Alice received a whip" }),
          drop("b", 2 * MINUTE, { line: "Alice got more" }),
        ],
        added: [],
        initial: true,
      });
      map.drawEvents();
      ({ x, y } = map.renderedEvents[0]);
    });

    it("say what happened, once for as long as the pointer stays", () => {
      map.onPointerMove({ clientX: x, clientY: y });
      map.onPointerMove({ clientX: x + 2, clientY: y });
      expect(tooltipManager.showTooltip).toHaveBeenCalledTimes(1);
      const [html] = tooltipManager.showTooltip.mock.calls[0];
      expect(html).toContain("Alice received a whip");
      expect(html).toContain("Alice got more");
      expect(html).toContain("Position approximate");
      expect(map.style.cursor).toBe("pointer");

      map.onPointerMove({ clientX: x + 200, clientY: y });
      expect(tooltipManager.hideTooltip).toHaveBeenCalledTimes(1);
      expect(map.style.cursor).toBe("");
    });

    it("come after a player who is in the same spot", () => {
      map.renderedPlayers = [{ kind: "player", name: "Alice", x, y, r: 8, player: alice }];
      map.onPointerMove({ clientX: x, clientY: y });
      const [html] = tooltipManager.showTooltip.mock.calls[0];
      expect(html).toContain("<strong>Alice</strong>");
      expect(html).not.toContain("whip");
    });

    it("select their player and come to the middle of the map when clicked", () => {
      groupData.members = new Map([["Alice", {}]]);
      const selected = [];
      pubsub.subscribe("player-selected", (value) => selected.push(value));
      // Off to one side, but in view.
      centerOn(map, 3020, 3010);
      map.drawEvents();
      ({ x, y } = map.renderedEvents[0]);

      map.onPointerDown({ clientX: x, clientY: y });
      map.stopDragging();
      expect(selected).toEqual([{ name: "Alice", follow: false }]);
      const [cx, cy] = map.gamePositionToCameraCenter(3000, 3001);
      expect(map.camera.x.target).toBe(cx);
      expect(map.camera.y.target).toBe(cy);
    });

    it("leave the selection alone when the press turns into a drag", () => {
      groupData.members = new Map([["Alice", {}]]);
      const selected = [];
      pubsub.subscribe("player-selected", (value) => selected.push(value));
      map.startDragging = vi.fn();
      map.onPointerDown({ clientX: x, clientY: y });
      map.onPointerMove({ clientX: x + 40, clientY: y });
      expect(map.startDragging).toHaveBeenCalled();
      map.stopDragging();
      expect(selected).toEqual([]);
    });

    it("can be brought into view by their event", () => {
      centerOn(map, 3100, 3100);
      expect(map.focusEvent("a")).toBe(true);
      expect(map.camera.x.target).toBe(map.gamePositionToCameraCenter(3000, 3001)[0]);
      expect(map.focusEvent("nope")).toBe(false);
    });
  });

  it("draw nothing on a map no event has reached", () => {
    const bare = createMap();
    bare.ctx = anyContext();
    bare.drawEvents();
    expect(bare.ctx.save).not.toHaveBeenCalled();
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

  it("brings the trails back after a reload", () => {
    selection.toggleTrail("Alice");
    selection.toggleTrail("Bob");
    selection.toggleTrail("Bob");
    // A reload starts with nothing in memory.
    selection.reset();
    pubsub.unpublishAll();
    expect(selection.hasTrail("Alice")).toBe(false);

    selection.restore();
    expect([...selection.trails]).toEqual(["Alice"]);
    expect(pubsub.getMostRecent("trails-changed")[0]).toEqual(new Set(["Alice"]));
  });

  it("forgets cleared trails for the next reload too", () => {
    selection.toggleTrail("Alice");
    selection.clearTrails();
    selection.reset();
    selection.restore();
    expect(selection.trails.size).toBe(0);
  });

  it("starts without trails when what was stored is unreadable", () => {
    localStorage.setItem("map-trails", "{not json");
    selection.restore();
    expect(selection.trails.size).toBe(0);
    localStorage.setItem("map-trails", JSON.stringify({ a: 1 }));
    selection.restore();
    expect(selection.trails.size).toBe(0);
  });

  it("keeps the trails while the roster hasn't loaded yet", () => {
    selection.toggleTrail("Alice");
    selection.retainTrails(new Set());
    expect(selection.hasTrail("Alice")).toBe(true);
    selection.retainTrails(new Set(["Bob"]));
    expect(selection.hasTrail("Alice")).toBe(false);
  });
});

describe("wealth sparkline", () => {
  it("maps the lowest value to the bottom and the highest to the top", () => {
    const points = sparklinePoints([10, 20, 15], 100, 50, 0).split(" ");
    expect(points).toEqual(["0.0,50.0", "50.0,0.0", "100.0,25.0"]);
    expect(sparklinePoints([5], 100, 50)).toBe("");
  });
});
