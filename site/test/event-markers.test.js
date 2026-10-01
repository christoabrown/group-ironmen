import { beforeEach, describe, expect, it } from "vitest";
import {
  EVENT_FADE_MS,
  EVENT_FRAME_MS,
  EVENT_LABEL_MS,
  EVENT_MARKERS_MAX,
  EVENT_MARKER_MS,
  EVENT_RING_MS,
  EVENT_WAKE_MS,
  EventMarkers,
  MARKER_RADIUS,
  MARKER_RADIUS_BIG,
  MARKER_RADIUS_COMPACT,
  clusterPoints,
  layoutMarkers,
  markerAlpha,
} from "../src/canvas-map/event-markers";
import { defaultEventFilters } from "../src/data/event-view";

const NOW = Date.parse("2026-10-01T12:00:00Z");
const MINUTE = 60000;

const event = (id, msAgo, extra = {}) => ({
  id,
  type: "loot",
  member: "Alice",
  value_gp: 250000,
  occurred_at: new Date(NOW - msAgo).toISOString(),
  ...extra,
});

/** Everyone stands on the same tile, and that is known to be where it happened. */
const here = () => ({ x: 3200, y: 3200, plane: 0, color: "red", known: true });
const somewhere = () => ({ x: 3200, y: 3200, plane: 0, color: "red", known: false });

/** A view in which a game tile is 4 px and tile (3200, 3200) is at (400, 300). */
const view = (extra = {}) => ({
  width: 800,
  height: 600,
  plane: 0,
  tile: 4,
  reducedMotion: false,
  toScreen: (x, y) => [400 + (x - 3200) * 4, 300 - (y - 3200) * 4],
  ...extra,
});

describe("clusterPoints", () => {
  it("groups points that are close on screen, per plane", () => {
    const groups = clusterPoints(
      [
        { name: "a", x: 100, y: 100, plane: 0 },
        { name: "b", x: 110, y: 105, plane: 0 },
        { name: "c", x: 400, y: 100, plane: 0 },
        { name: "d", x: 101, y: 101, plane: 1 },
      ],
      34
    );
    expect(groups.map((group) => group.members.length).sort()).toEqual([1, 1, 2]);
  });
});

describe("markerAlpha", () => {
  it("is full for most of a marker's time, then fades, then is gone", () => {
    expect(markerAlpha(0)).toBe(1);
    expect(markerAlpha(EVENT_MARKER_MS - EVENT_FADE_MS)).toBe(1);
    const fading = markerAlpha(EVENT_MARKER_MS - EVENT_FADE_MS / 2);
    expect(fading).toBeGreaterThan(0.15);
    expect(fading).toBeLessThan(1);
    expect(markerAlpha(EVENT_MARKER_MS - 1)).toBeGreaterThan(0);
    expect(markerAlpha(EVENT_MARKER_MS)).toBe(0);
  });
});

describe("EventMarkers", () => {
  let markers;
  const filters = defaultEventFilters();
  const visible = (now = NOW, extra = {}) => markers.visible({ filters, now, ...extra });

  beforeEach(() => {
    markers = new EventMarkers();
  });

  it("rings for what just happened, not for what is put back on the map", () => {
    markers.add([event("old", 5 * MINUTE)], { now: NOW, place: here, news: false });
    markers.add([event("new", 5000), event("late", 10 * MINUTE)], { now: NOW, place: here });
    const byId = Object.fromEntries(visible().map((marker) => [marker.id, marker]));
    expect(byId.old.ringAge).toBeNull();
    expect(byId.old.label).toBeNull();
    expect(byId.new.ringAge).toBe(0);
    expect(byId.new.label).toBe("250K gp");
    // It came in with the others, but it happened ten minutes ago.
    expect(byId.late.ringAge).toBeNull();
  });

  it("stops ringing, then drops its words", () => {
    markers.add([event("a", 0)], { now: NOW, place: here });
    expect(visible(NOW + EVENT_RING_MS - 1)[0].ringAge).toBe(EVENT_RING_MS - 1);
    expect(visible(NOW + EVENT_RING_MS)[0].ringAge).toBeNull();
    expect(visible(NOW + EVENT_LABEL_MS - 1)[0].label).toBe("250K gp");
    expect(visible(NOW + EVENT_LABEL_MS)[0].label).toBeNull();
  });

  it("shows an event once, however often it comes by", () => {
    expect(markers.add([event("a", 0)], { now: NOW, place: here })).toHaveLength(1);
    expect(markers.add([event("a", 0)], { now: NOW + 5000, place: here })).toHaveLength(0);
    expect(visible()).toHaveLength(1);
  });

  it("leaves out an event with no place, a type the map doesn't show, or one too old", () => {
    markers.add([event("nowhere", 0), event("odd", 0, { type: "something_new" }), event("ancient", EVENT_MARKER_MS)], {
      now: NOW,
      place: (e) => (e.id === "nowhere" ? null : here()),
    });
    expect(visible()).toEqual([]);
  });

  it("calls a place a guess only when the event is from a while ago", () => {
    markers.add([event("now", 1000)], { now: NOW, place: somewhere });
    markers.add([event("then", 10 * MINUTE), event("known", 10 * MINUTE)], {
      now: NOW,
      place: (e) => (e.id === "known" ? here() : somewhere()),
      news: false,
    });
    const byId = Object.fromEntries(visible().map((marker) => [marker.id, marker.approximate]));
    expect(byId).toEqual({ now: false, then: true, known: false });
  });

  it("fades a marker out and then forgets it", () => {
    markers.add([event("a", 0)], { now: NOW, place: here });
    expect(visible(NOW + EVENT_MARKER_MS - EVENT_FADE_MS)[0].alpha).toBe(1);
    expect(visible(NOW + EVENT_MARKER_MS - 1000)[0].alpha).toBeLessThan(0.2);
    expect(visible(NOW + EVENT_MARKER_MS)).toEqual([]);
    markers.prune(NOW + EVENT_MARKER_MS);
    expect(markers.live.size).toBe(0);
  });

  it("keeps the newest when there are too many", () => {
    const events = [];
    for (let i = 0; i < EVENT_MARKERS_MAX + 10; i++) events.push(event(`e${i}`, i * 1000));
    markers.add(events, { now: NOW, place: here });
    expect(markers.live.size).toBe(EVENT_MARKERS_MAX);
    expect(markers.live.has("e0")).toBe(true);
    expect(markers.live.has(`e${EVENT_MARKERS_MAX + 9}`)).toBe(false);
  });

  it("hides what the filters hide", () => {
    markers.add([event("small", 0, { value_gp: 500 }), event("level", 0, { type: "level_up" })], {
      now: NOW,
      place: here,
    });
    expect(visible().map((marker) => marker.id)).toEqual(["level"]);
    expect(markers.visible({ filters: { ...filters, minLoot: 0, level: false }, now: NOW })[0].id).toBe("small");
  });

  describe("on a trail", () => {
    const mark = (id, msAgo, extra = {}) => ({
      id,
      event: event(id, msAgo),
      x: 3210,
      y: 3200,
      plane: 0,
      t: (NOW - msAgo) / 1000,
      approximate: false,
      ...extra,
    });

    it("shows the event where the trail has it, not where the live map put it", () => {
      markers.add([event("a", 1000)], { now: NOW, place: here });
      markers.setTrailMarks("Alice", [mark("a", 1000)], "blue");
      const shown = visible();
      expect(shown).toHaveLength(1);
      expect(shown[0]).toMatchObject({ x: 3210, color: "blue", compact: false });
      // It still rings: it only just happened.
      expect(shown[0].ringAge).toBe(0);

      markers.keepTrails([]);
      expect(visible()[0]).toMatchObject({ x: 3200, color: "red" });
    });

    it("keeps events for as long as the trail is shown, small once they are old", () => {
      markers.setTrailMarks("Alice", [mark("recent", 10 * MINUTE), mark("old", 3 * 60 * MINUTE)], "blue");
      const byId = Object.fromEntries(visible().map((marker) => [marker.id, marker]));
      expect(byId.recent).toMatchObject({ compact: false, alpha: 1 });
      expect(byId.old).toMatchObject({ compact: true, alpha: 1 });
    });

    it("dims what a replay hasn't come to yet", () => {
      markers.setTrailMarks("Alice", [mark("before", 60 * MINUTE), mark("after", 20 * MINUTE)], "blue");
      const replayTime = (NOW - 50 * MINUTE) / 1000;
      const byId = Object.fromEntries(visible(NOW, { replayTime }).map((marker) => [marker.id, marker]));
      expect(byId.before).toMatchObject({ alpha: 1, compact: false });
      expect(byId.after.alpha).toBeLessThan(0.5);
      expect(byId.after.compact).toBe(true);
    });

    it("rings again when a replay passes it", () => {
      markers.setTrailMarks("Alice", [mark("a", 60 * MINUTE), mark("b", 40 * MINUTE)], "blue");
      const from = (NOW - 61 * MINUTE) / 1000;
      const to = (NOW - 59 * MINUTE) / 1000;
      const passed = markers.trailMarksBetween(from, to, filters);
      expect(passed.map((m) => m.id)).toEqual(["a"]);
      markers.pop(
        passed.map((m) => m.id),
        NOW
      );
      const byId = Object.fromEntries(visible(NOW + 100, { replayTime: to }).map((marker) => [marker.id, marker]));
      expect(byId.a.ringAge).toBe(100);
      expect(byId.a.label).toBe("250K gp");
      expect(byId.b.ringAge).toBeNull();
      markers.prune(NOW + EVENT_RING_MS);
      expect(visible(NOW + EVENT_RING_MS, { replayTime: to })[0].ringAge).toBeNull();
    });

    it("finds a marker by its event", () => {
      markers.add([event("live", 1000)], { now: NOW, place: here });
      markers.setTrailMarks("Alice", [mark("trail", 5000)], "blue");
      expect(markers.find("live").x).toBe(3200);
      expect(markers.find("trail").x).toBe(3210);
      expect(markers.find("nope")).toBeNull();
    });
  });
});

describe("layoutMarkers", () => {
  const filters = defaultEventFilters();
  const shown = (events, now = NOW, place = here) => {
    const markers = new EventMarkers();
    markers.add(events, { now, place });
    return markers.visible({ filters, now });
  };

  it("hangs a marker below its tile", () => {
    const { items } = layoutMarkers(shown([event("a", 5 * MINUTE)]), view());
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ anchorX: 400, anchorY: 300, x: 400, r: MARKER_RADIUS, count: 1 });
    expect(items[0].y).toBe(300 + 10 + 3 + MARKER_RADIUS);
  });

  it("stacks markers on the same spot, the most notable on top", () => {
    const events = [
      event("small", 1 * MINUTE),
      event("big", 9 * MINUTE, { value_gp: 35000000 }),
      event("medium", 5 * MINUTE, { value_gp: 2000000 }),
      event("newest", 1000),
    ];
    const { items } = layoutMarkers(shown(events), view());
    expect(items).toHaveLength(1);
    expect(items[0].count).toBe(4);
    expect(items[0].members.map((member) => member.id)).toEqual(["big", "medium", "newest", "small"]);
    expect(items[0]).toMatchObject({ tier: 2, r: MARKER_RADIUS_BIG });
  });

  it("keeps markers apart that are apart", () => {
    const places = { a: 3200, b: 3220 };
    const markers = shown([event("a", MINUTE), event("b", MINUTE)], NOW, (e) => ({ ...here(), x: places[e.id] }));
    expect(layoutMarkers(markers, view()).items).toHaveLength(2);
    // Zoomed out far enough, they are one.
    const far = view({ toScreen: (x, y) => [400 + (x - 3200) * 0.5, 300 - (y - 3200) * 0.5] });
    expect(layoutMarkers(markers, far).items).toHaveLength(1);
  });

  it("leaves out what is off screen", () => {
    const markers = shown([event("a", MINUTE)], NOW, () => ({ ...here(), x: 4000 }));
    expect(layoutMarkers(markers, view())).toEqual({ items: [], nextMs: null });
  });

  it("draws a marker on another floor faintly", () => {
    const markers = shown([event("a", MINUTE)], NOW, () => ({ ...here(), plane: 1 }));
    expect(layoutMarkers(markers, view()).items[0].alpha).toBeLessThan(0.5);
  });

  it("centres an old trail event on its tile, small", () => {
    const store = new EventMarkers();
    const old = event("old", 3 * 60 * MINUTE);
    store.setTrailMarks(
      "Alice",
      [{ id: "old", event: old, x: 3200, y: 3200, plane: 0, t: (NOW - 3 * 60 * MINUTE) / 1000 }],
      "blue"
    );
    const { items, nextMs } = layoutMarkers(store.visible({ filters, now: NOW }), view());
    expect(items[0]).toMatchObject({ x: 400, y: 300, r: MARKER_RADIUS_COMPACT, compact: true });
    // Nothing about it changes with time.
    expect(nextMs).toBeNull();
  });

  it("says when the map should be drawn again", () => {
    const fresh = [event("a", 0)];
    expect(layoutMarkers(shown(fresh), view()).nextMs).toBe(EVENT_FRAME_MS);
    expect(layoutMarkers(shown(fresh), view({ reducedMotion: true })).nextMs).toBe(250);

    const markers = new EventMarkers();
    markers.add(fresh, { now: NOW, place: here });
    const later = (ms) => layoutMarkers(markers.visible({ filters, now: NOW + ms }), view()).nextMs;
    expect(later(EVENT_RING_MS)).toBe(250);
    expect(later(EVENT_LABEL_MS)).toBe(EVENT_WAKE_MS);
    expect(later(EVENT_MARKER_MS)).toBeNull();
  });

  it("shows the words of the newest event of a stack", () => {
    const events = [event("big", 5 * MINUTE, { value_gp: 35000000 }), event("new", 0, { value_gp: 300000 })];
    const { items } = layoutMarkers(shown(events), view());
    expect(items[0].top.id).toBe("big");
    expect(items[0].label).toBe("300K gp");
    expect(items[0].ringAge).toBe(0);
  });
});
