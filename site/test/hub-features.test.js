import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../src/data/api";
import { pubsub } from "../src/data/pubsub";
import { describeEvent, relativeTime } from "../src/activity-page/activity-page";

describe("hub features", () => {
  beforeEach(() => {
    api.exampleDataEnabled = false;
    api.sessionToken = "session-token";
    globalThis.fetch = vi.fn();
  });

  it("publishes the server's features", async () => {
    const features = { data_source: "hub", direct_pairing: false, hub_history: true };
    globalThis.fetch.mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue(features) });
    const publishSpy = vi.spyOn(pubsub, "publish");

    await expect(api.loadFeatures()).resolves.toEqual(features);

    expect(globalThis.fetch).toHaveBeenCalledWith("/api/group/features", {
      headers: { Authorization: "Bearer session-token" },
      credentials: "same-origin",
    });
    expect(publishSpy).toHaveBeenCalledWith("features", features);
  });

  it("falls back to direct pairing without hub history", async () => {
    globalThis.fetch.mockRejectedValue(new Error("offline"));
    await expect(api.loadFeatures()).resolves.toEqual({
      data_source: "direct",
      direct_pairing: true,
      hub_history: false,
    });
  });

  it("builds hub history requests", async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue([]) });

    await api.getHubEvents({ types: ["loot", "pk_loot"], member: "Alice", limit: 50 });
    await api.getHubLocations("Iron Man", 7);
    await api.getHubGains("week");

    const urls = globalThis.fetch.mock.calls.map(([url]) => url);
    expect(urls).toEqual([
      "/api/group/hub/events?limit=50&types=loot%2Cpk_loot&member=Alice",
      "/api/group/hub/locations/Iron%20Man?days=7",
      "/api/group/hub/gains?period=week",
    ]);
  });

  it("rejects with the status when the hub endpoint fails", async () => {
    globalThis.fetch.mockResolvedValue({ ok: false, status: 404 });
    await expect(api.getHubGains("day")).rejects.toMatchObject({ status: 404 });
  });
});

describe("activity page helpers", () => {
  const now = new Date("2026-09-29T12:00:00Z");

  it("formats relative times", () => {
    expect(relativeTime("2026-09-29T11:59:30Z", now)).toBe("just now");
    expect(relativeTime("2026-09-29T11:15:00Z", now)).toBe("45m ago");
    expect(relativeTime("2026-09-29T09:00:00Z", now)).toBe("3h ago");
    expect(relativeTime("2026-09-27T12:00:00Z", now)).toBe("2d ago");
  });

  it("prefers the hub's line and falls back to a description", () => {
    expect(describeEvent({ line: "Alice received a drop", member: "Alice", type: "loot" })).toBe(
      "Alice received a drop"
    );
    expect(describeEvent({ member: "Bob", type: "level_up", skill: "Attack", level: 99 })).toBe(
      "Bob reached level 99 Attack"
    );
    expect(describeEvent({ member: "Bob", type: "death" })).toBe("Bob died");
  });
});
