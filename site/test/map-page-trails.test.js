import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../src/data/api";
import { pubsub } from "../src/data/pubsub";
import { selection } from "../src/data/selection";
import { colorForName } from "../src/data/player-colors";
import "../src/map-page/map-page";

const NOW_S = 1_790_000_000;

/** What the map page needs of the map: it records which trails are drawn. */
function fakeWorldMap() {
  const map = document.createElement("div");
  map.id = "background-worldmap";
  const drawn = new Set();
  Object.assign(map, {
    plane: 1,
    setTrail: vi.fn((name) => drawn.add(name)),
    clearTrail: vi.fn((name) => drawn.delete(name)),
    clearTrails: vi.fn(() => drawn.clear()),
    trailNames: () => [...drawn],
    setTrailDeaths: vi.fn(),
    addPing: vi.fn(),
    setReplayTime: vi.fn(),
    trailNextChange: vi.fn(() => null),
    // As the real map: nothing to replay until a trail is drawn.
    trailTimeline: () =>
      drawn.size ? { tMin: NOW_S - 3600, tMax: NOW_S, ticks: [] } : { tMin: null, tMax: null, ticks: [] },
  });
  return map;
}

function trailsResponse(names, extra = {}) {
  return {
    v: 2,
    days: 1,
    as_of: NOW_S,
    trails: names.map((member) => ({ member, shared: true, step: 60, points: [[3200, 3200, 0, NOW_S - 60]] })),
    ...extra,
  };
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function settle() {
  await vi.advanceTimersByTimeAsync(0);
}

describe("map page trails", () => {
  let worldMap, page;

  function mount() {
    page = document.createElement("map-page");
    document.body.appendChild(page);
    return page;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW_S * 1000);
    selection.reset();
    const authed = document.createElement("div");
    authed.className = "authed-section";
    worldMap = fakeWorldMap();
    document.body.append(authed, worldMap);
    pubsub.publish("features", { hub_history: true });
    vi.spyOn(api, "getHubEvents").mockResolvedValue([]);
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  // The page calls into these as soon as it is connected, which in the bundle
  // is the moment it is defined: they have to be defined before it.
  it("loads the components it drives", () => {
    expect(customElements.get("trail-scrubber")).toBeDefined();
    expect(customElements.get("canvas-map")).toBeDefined();
  });

  it("draws nothing when the trails are cleared while their request is under way", async () => {
    const request = deferred();
    vi.spyOn(api, "getTrails").mockReturnValue(request.promise);
    mount();
    selection.toggleTrail("Alice");
    selection.clearTrails();
    request.resolve(trailsResponse(["Alice"]));
    await settle();
    expect(worldMap.setTrail).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("takes a trail off the map as soon as it is switched off", async () => {
    vi.spyOn(api, "getTrails").mockResolvedValue(trailsResponse(["Alice", "Bob"]));
    mount();
    selection.toggleTrail("Alice");
    selection.toggleTrail("Bob");
    await settle();
    expect(worldMap.trailNames().sort()).toEqual(["Alice", "Bob"]);

    api.getTrails.mockReturnValue(deferred().promise);
    selection.toggleTrail("Bob");
    expect(worldMap.trailNames()).toEqual(["Alice"]);
  });

  it("keeps the drawn trails and says so when a refresh fails", async () => {
    vi.spyOn(api, "getTrails").mockResolvedValue(trailsResponse(["Alice"]));
    mount();
    selection.toggleTrail("Alice");
    await settle();

    api.getTrails.mockRejectedValue(Object.assign(new Error("busy"), { status: 503 }));
    await vi.advanceTimersByTimeAsync(60000);
    expect(worldMap.trailNames()).toEqual(["Alice"]);
    expect(page.querySelector(".map-page__trail-error").textContent).toBe("Hub busy");
  });

  it("tries again sooner after a failure than after a success", async () => {
    vi.spyOn(api, "getTrails").mockRejectedValue(new Error("down"));
    mount();
    selection.toggleTrail("Alice");
    await settle();
    expect(api.getTrails).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(api.getTrails).toHaveBeenCalledTimes(2);

    api.getTrails.mockResolvedValue(trailsResponse(["Alice"]));
    await vi.advanceTimersByTimeAsync(10000);
    expect(api.getTrails).toHaveBeenCalledTimes(3);
    expect(page.querySelector(".map-page__trail-error")).toBeNull();
    await vi.advanceTimersByTimeAsync(59000);
    expect(api.getTrails).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1000);
    expect(api.getTrails).toHaveBeenCalledTimes(4);
  });

  it("says when the hub's data is old", async () => {
    vi.spyOn(api, "getTrails").mockResolvedValue(trailsResponse(["Alice"], { as_of: NOW_S - 600 }));
    mount();
    selection.toggleTrail("Alice");
    await settle();
    expect(page.querySelector(".map-page__trail-error").textContent).toMatch(/^Hub data from \d/);
  });

  it("hands the map each shared trail with the player's colours and how far back it goes", async () => {
    const response = trailsResponse(["Alice"]);
    response.trails.push({ member: "Bob", shared: false });
    vi.spyOn(api, "getTrails").mockResolvedValue(response);
    mount();
    selection.toggleTrail("Alice");
    selection.toggleTrail("Bob");
    await settle();
    const { color, light } = colorForName("Alice");
    expect(worldMap.setTrail).toHaveBeenCalledTimes(1);
    expect(worldMap.setTrail).toHaveBeenCalledWith("Alice", response.trails[0], { color, light, windowS: 86400 });
    expect(page.querySelector('[data-name="Bob"]').textContent).toContain("not shared");
  });

  it("doesn't ask for trails while the server has the hub's history switched off", async () => {
    vi.spyOn(api, "getTrails").mockResolvedValue(trailsResponse(["Alice"]));
    pubsub.publish("features", { hub_history: false });
    mount();
    selection.toggleTrail("Alice");
    await vi.advanceTimersByTimeAsync(120000);
    expect(api.getTrails).not.toHaveBeenCalled();

    pubsub.publish("features", { hub_history: true });
    await settle();
    expect(api.getTrails).toHaveBeenCalledTimes(1);
    expect(worldMap.trailNames()).toEqual(["Alice"]);
  });

  it("says from when a trail runs that was too long to show whole", async () => {
    const response = trailsResponse(["Alice", "Bob"]);
    response.trails[0].truncated = true;
    response.trails[0].points = [
      [3200, 3200, 0, NOW_S - 5 * 86400],
      [3201, 3200, 0, NOW_S - 60],
    ];
    vi.spyOn(api, "getTrails").mockResolvedValue(response);
    mount();
    selection.toggleTrail("Alice");
    selection.toggleTrail("Bob");
    await settle();
    const since = new Date((NOW_S - 5 * 86400) * 1000).toLocaleDateString([], { day: "numeric", month: "short" });
    expect(page.querySelector('[data-name="Alice"]').textContent).toBe(`Alice (since ${since})`);
    expect(page.querySelector('[data-name="Bob"]').textContent).toBe("Bob");
  });

  describe("deaths", () => {
    const death = (id, member, secondsAgo) => ({
      id,
      type: "death",
      member,
      occurred_at: new Date((NOW_S - secondsAgo) * 1000).toISOString(),
      location: { x: 3142, y: 9958, plane: 0 },
    });

    beforeEach(() => {
      vi.spyOn(api, "getTrails").mockResolvedValue(trailsResponse(["Alice"]));
      api.getHubEvents.mockResolvedValue([death("a", "Alice", 300), death("b", "Bob", 200)]);
    });

    it("are marked on the trails shown", async () => {
      mount();
      selection.toggleTrail("Alice");
      await settle();
      expect(api.getHubEvents).toHaveBeenCalledWith({ types: ["death"], limit: 500 });
      expect(worldMap.setTrailDeaths).toHaveBeenLastCalledWith("Alice", [
        { id: "a", x: 3142, y: 9959, plane: 0, t: NOW_S - 300 },
      ]);
    });

    it("include one that happens while the map is open", async () => {
      mount();
      selection.toggleTrail("Alice");
      await settle();
      pubsub.publish("live-events", { events: [], added: [death("c", "Alice", 0)], initial: false });
      const [, marks] = worldMap.setTrailDeaths.mock.calls[worldMap.setTrailDeaths.mock.calls.length - 1];
      expect(marks.map((mark) => mark.id)).toEqual(["a", "c"]);
    });

    it("are left off while the Deaths filter is off", async () => {
      localStorage.setItem("map-event-filters", JSON.stringify({ death: false }));
      mount();
      selection.toggleTrail("Alice");
      await settle();
      expect(worldMap.setTrailDeaths).toHaveBeenLastCalledWith("Alice", []);

      const toggle = page.querySelector('.map-page__event-kinds input[name="death"]');
      toggle.checked = true;
      toggle.dispatchEvent(new Event("change", { bubbles: true }));
      const [, marks] = worldMap.setTrailDeaths.mock.calls[worldMap.setTrailDeaths.mock.calls.length - 1];
      expect(marks).toHaveLength(1);
    });

    it("don't hold up the trails when they can't be fetched", async () => {
      api.getHubEvents.mockRejectedValue(new Error("down"));
      mount();
      selection.toggleTrail("Alice");
      await settle();
      expect(worldMap.trailNames()).toEqual(["Alice"]);
      expect(page.querySelector(".map-page__trail-error")).toBeNull();
    });
  });

  describe("replay", () => {
    const replayButton = () => page.querySelector(".map-page__trails-replay");
    const scrubber = () => page.querySelector("trail-scrubber");

    beforeEach(async () => {
      vi.spyOn(api, "getTrails").mockResolvedValue(trailsResponse(["Alice"]));
      mount();
      selection.toggleTrail("Alice");
      await settle();
      worldMap.dispatchEvent(new CustomEvent("trail-timeline-changed"));
    });

    it("is closed to begin with", () => {
      expect(scrubber().hidden).toBe(true);
      expect(replayButton().getAttribute("aria-pressed")).toBe("false");
      expect(worldMap.setReplayTime).not.toHaveBeenCalled();
    });

    it("shows the map at the time of the timeline, and live again when closed", () => {
      replayButton().click();
      expect(scrubber().hidden).toBe(false);
      expect(replayButton().getAttribute("aria-pressed")).toBe("true");
      expect(worldMap.setReplayTime).toHaveBeenLastCalledWith(NOW_S, { follow: false });

      scrubber().seek(NOW_S - 600);
      expect(worldMap.setReplayTime).toHaveBeenLastCalledWith(NOW_S - 600, { follow: true });

      replayButton().click();
      expect(scrubber().hidden).toBe(true);
      expect(replayButton().getAttribute("aria-pressed")).toBe("false");
      expect(worldMap.setReplayTime).toHaveBeenLastCalledWith(null, { follow: false });
    });

    it("stops following the player once the map is dragged", () => {
      replayButton().click();
      worldMap.dispatchEvent(new CustomEvent("map-dragged"));
      expect(scrubber().querySelector(".trail-scrubber__follow input").checked).toBe(false);
      scrubber().seek(NOW_S - 600);
      expect(worldMap.setReplayTime).toHaveBeenLastCalledWith(NOW_S - 600, { follow: false });
    });

    it("closes when the last trail is switched off", () => {
      replayButton().click();
      selection.clearTrails();
      worldMap.dispatchEvent(new CustomEvent("trail-timeline-changed"));
      expect(scrubber().hidden).toBe(true);
      expect(worldMap.setReplayTime).toHaveBeenLastCalledWith(null, { follow: false });
    });

    it("asks the map what happens next on the trails", () => {
      scrubber().nextChange(NOW_S - 100);
      expect(worldMap.trailNextChange).toHaveBeenCalledWith(NOW_S - 100);
    });

    it("starts at a speed that suits the length of the trails", async () => {
      const select = page.querySelector(".map-page__trail-days");
      select.value = "30";
      select.dispatchEvent(new Event("change"));
      await settle();
      expect(scrubber().clock.speed).toBe(7200);
    });

    it("leaves the map live when the page is left", () => {
      replayButton().click();
      page.remove();
      expect(worldMap.setReplayTime).toHaveBeenLastCalledWith(null);
    });
  });

  it("remembers the trail length", async () => {
    vi.spyOn(api, "getTrails").mockResolvedValue(trailsResponse(["Alice"]));
    mount();
    selection.toggleTrail("Alice");
    await settle();
    const select = page.querySelector(".map-page__trail-days");
    select.value = "7";
    select.dispatchEvent(new Event("change"));
    await settle();
    expect(api.getTrails).toHaveBeenLastCalledWith(["Alice"], 7);

    page.remove();
    mount();
    await settle();
    expect(page.querySelector(".map-page__trail-days").value).toBe("7");
    expect(api.getTrails).toHaveBeenLastCalledWith(["Alice"], 7);
  });
});
