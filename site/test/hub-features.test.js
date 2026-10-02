import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../src/data/api";
import { pubsub } from "../src/data/pubsub";
import { describeEvent, relativeTime } from "../src/data/hub-format";

describe("hub features", () => {
  beforeEach(() => {
    api.sessionToken = "session-token";
    globalThis.fetch = vi.fn();
  });

  it("publishes the server's features", async () => {
    const features = { hub_history: true };
    globalThis.fetch.mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue(features) });
    const publishSpy = vi.spyOn(pubsub, "publish");

    await expect(api.loadFeatures()).resolves.toEqual(features);

    expect(globalThis.fetch).toHaveBeenCalledWith("/api/group/features", {
      headers: { Authorization: "Bearer session-token" },
      credentials: "same-origin",
    });
    expect(publishSpy).toHaveBeenCalledWith("features", features);
  });

  it("falls back to no hub history when the server does not answer", async () => {
    globalThis.fetch.mockRejectedValue(new Error("offline"));
    await expect(api.loadFeatures()).resolves.toEqual({ hub_history: false });
  });

  it("builds hub history requests", async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue([]) });

    await api.getTrails(["Iron Man", "Zezima"], 7);
    await api.getHubGains("week");
    await api.getLootLeaderboard("week", 5);
    await api.getPlayerGains("Iron Man", "month");
    await api.getPlayerSessions("Iron Man");
    await api.getPlayerWealth("Iron Man");
    await api.getPlayerGearHistory("Iron Man");
    await api.getPlayerEvents("Iron Man", 20);
    await api.getTrailEvents("Iron Man", 7, 100000);

    const urls = globalThis.fetch.mock.calls.map(([url]) => url);
    expect(urls).toEqual([
      "/api/group/hub/trails?members=Iron+Man%2CZezima&days=7",
      "/api/group/hub/gains?period=week",
      "/api/group/hub/leaderboards/loot?period=week&limit=5",
      "/api/group/hub/players/Iron%20Man/gains?period=month",
      "/api/group/hub/players/Iron%20Man/sessions?days=7",
      "/api/group/hub/players/Iron%20Man/wealth?days=30",
      "/api/group/hub/players/Iron%20Man/equipment-history?days=30",
      "/api/group/hub/players/Iron%20Man/events?limit=20",
      "/api/group/hub/players/Iron%20Man/events?days=7&min_loot=100000",
    ]);
  });

  it("rejects with the status when the hub endpoint fails", async () => {
    globalThis.fetch.mockResolvedValue({ ok: false, status: 404 });
    await expect(api.getHubGains("day")).rejects.toMatchObject({ status: 404 });
  });
});

describe("hub wording", () => {
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

describe("admin hub key description", () => {
  it("describes service and personal keys", async () => {
    const { describeHubKey } = await import("../src/admin-portal/admin-portal");
    expect(
      describeHubKey({
        key_kind: "service",
        key_rate_limit_per_minute: 600,
        request_budget_per_min: 480,
        bulk_accounts: 50,
      })
    ).toBe("service key (600/min, using 480/min, 50 per bulk request)");
    expect(describeHubKey({ key_kind: null, request_budget_per_min: 100 })).toBe("not checked yet (budget 100/min)");
  });
});
