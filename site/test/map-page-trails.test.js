import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../src/data/api";
import { pubsub } from "../src/data/pubsub";
import { selection } from "../src/data/selection";
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
  });

  afterEach(() => {
    document.body.innerHTML = "";
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
