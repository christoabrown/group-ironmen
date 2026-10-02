import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../src/data/api";
import { pubsub } from "../src/data/pubsub";
import { utility } from "../src/utility";
import { groupData } from "../src/data/group-data";

describe("api", () => {
  beforeEach(() => {
    api.enabled = false;
    api.getGroupInterval = undefined;
    api.nextCheck = undefined;

    groupData.members = new Map();

    globalThis.fetch = vi.fn();
  });

  it("leaves who is asking to the session cookie", async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({}) });

    await api.getMe();
    await api.adminSetPlayerHidden("Iron Man", true);
    await api.logout();

    expect(globalThis.fetch.mock.calls).toEqual([
      ["/api/auth/me", { method: "GET", credentials: "same-origin" }],
      [
        "/api/admin/players/Iron%20Man/hidden",
        {
          method: "PUT",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hidden: true }),
        },
      ],
      ["/api/auth/logout", { method: "POST", credentials: "same-origin" }],
    ]);
  });

  it("asks where to sign in, and says so when that can't be done", async () => {
    globalThis.fetch.mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue({ auth_url: "https://d" }) });
    await expect(api.discordStart()).resolves.toEqual({ auth_url: "https://d" });

    globalThis.fetch.mockResolvedValueOnce({ ok: false, status: 502 });
    await expect(api.discordStart()).rejects.toThrow("502");
  });

  it("enable waits for data-load events and starts polling once", async () => {
    const waitForAllEventsSpy = vi.spyOn(pubsub, "waitForAllEvents").mockResolvedValue();
    const callOnIntervalSpy = vi.spyOn(utility, "callOnInterval").mockReturnValue(37);

    await api.enable();

    expect(waitForAllEventsSpy).toHaveBeenCalledWith("item-data-loaded");
    expect(callOnIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 2000);
    expect(api.enabled).toBe(true);
    expect(api.nextCheck).toBe(new Date(0).toISOString());
  });

  it("disable clears the members and the polling interval", async () => {
    const clearIntervalSpy = vi.spyOn(window, "clearInterval");
    api.enabled = true;
    api.getGroupInterval = Promise.resolve(99);
    groupData.members = new Map([["Alice", {}]]);

    await api.disable();

    expect(clearIntervalSpy).toHaveBeenCalledWith(99);
    expect(api.enabled).toBe(false);
    expect(groupData.members.size).toBe(0);
  });

  it("getGroupData publishes updated group data after successful fetch", async () => {
    api.nextCheck = "2026-03-30T00:00:00.000Z";

    const payload = [{ name: "Alice" }];
    const responseJson = vi.fn().mockResolvedValue(payload);
    globalThis.fetch.mockResolvedValue({ ok: true, json: responseJson });

    const updateSpy = vi.spyOn(groupData, "update").mockReturnValue(new Date("2026-03-30T00:00:05.000Z"));
    const publishSpy = vi.spyOn(pubsub, "publish");

    await api.getGroupData();

    expect(globalThis.fetch).toHaveBeenCalledWith("/api/members?from_time=2026-03-30T00:00:00.000Z", {
      method: "GET",
      credentials: "same-origin",
    });
    expect(updateSpy).toHaveBeenCalledWith(payload);
    expect(api.nextCheck).toBe("2026-03-30T00:00:05.000Z");
    expect(publishSpy).toHaveBeenCalledWith("get-group-data", groupData);
  });

  it("keeps time by the server's clock once it has answered", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-30T00:00:00.000Z"));
    expect(api.serverNow()).toBe(Date.now());

    // The browser's clock is an hour behind the server's.
    const cursor = "2026-03-30T01:00:00.000Z";
    globalThis.fetch.mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({ cursor }) });
    vi.spyOn(groupData, "update").mockReturnValue(new Date(cursor));
    await api.getGroupData();
    vi.advanceTimersByTime(5000);
    expect(api.serverNow()).toBe(Date.parse(cursor) + 5000);
  });

  it("getGroupData handles unauthorized responses by disabling and redirecting", async () => {
    const disableSpy = vi.spyOn(api, "disable").mockResolvedValue();
    const pushStateSpy = vi.spyOn(window.history, "pushState");
    const publishSpy = vi.spyOn(pubsub, "publish");

    globalThis.fetch.mockResolvedValue({ ok: false, status: 401 });

    await api.getGroupData();

    expect(disableSpy).toHaveBeenCalled();
    expect(pushStateSpy).toHaveBeenCalledWith("", "", "/login");
    expect(publishSpy).toHaveBeenCalledWith("get-group-data");
  });

  it("getGroupData ignores non-401 fetch errors", async () => {
    const disableSpy = vi.spyOn(api, "disable");
    const publishSpy = vi.spyOn(pubsub, "publish");

    globalThis.fetch.mockResolvedValue({ ok: false, status: 500 });

    await api.getGroupData();

    expect(disableSpy).not.toHaveBeenCalled();
    expect(publishSpy).not.toHaveBeenCalled();
  });
});
