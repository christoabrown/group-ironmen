import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../src/data/api";
import { pubsub } from "../src/data/pubsub";
import { utility } from "../src/utility";
import { groupData } from "../src/data/group-data";
import { exampleData } from "../src/data/example-data";

describe("api", () => {
  beforeEach(() => {
    api.enabled = false;
    api.exampleDataEnabled = false;
    api.groupName = undefined;
    api.groupToken = undefined;
    api.getGroupInterval = undefined;
    api.nextCheck = undefined;
    api.sessionToken = null;

    groupData.members = new Map();
    groupData.groupItems = {};
    groupData.filters = ["existing"];

    globalThis.fetch = vi.fn();
  });

  it("exposes session-scoped urls", () => {
    expect(api.getGroupDataUrl).toBe("/api/group/get-group-data");
    expect(api.addMemberUrl).toBe("/api/group/add-group-member");
    expect(api.deleteMemberUrl).toBe("/api/group/delete-group-member");
    expect(api.renameMemberUrl).toBe("/api/group/rename-group-member");
    expect(api.amILoggedInUrl).toBe("/api/auth/me");
    expect(api.skillDataUrl).toBe("/api/group/get-skill-data");
  });

  it("sends the session token as a bearer header", () => {
    expect(api.authHeaders()).toEqual({});
    api.setSession("session-token", "alice", "member");
    expect(api.authHeaders()).toEqual({ Authorization: "Bearer session-token" });
  });

  it("enable waits for data-load events and starts polling once", async () => {
    const waitForAllEventsSpy = vi.spyOn(pubsub, "waitForAllEvents").mockResolvedValue();
    const callOnIntervalSpy = vi.spyOn(utility, "callOnInterval").mockReturnValue(37);

    await api.enable("gim", "token");

    expect(waitForAllEventsSpy).toHaveBeenCalledWith("item-data-loaded", "quest-data-loaded");
    expect(callOnIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 1000);
    expect(api.enabled).toBe(true);
    expect(api.groupName).toBe("gim");
    expect(api.groupToken).toBe("token");
    expect(api.nextCheck).toBe(new Date(0).toISOString());
  });

  it("disable clears credentials, group caches, and polling interval", async () => {
    const clearIntervalSpy = vi.spyOn(window, "clearInterval");
    api.groupName = "gim";
    api.groupToken = "token";
    api.enabled = true;
    api.getGroupInterval = Promise.resolve(99);
    groupData.members = new Map([["Alice", {}]]);
    groupData.groupItems = { 4151: { id: 4151, quantity: 1 } };

    await api.disable();

    expect(clearIntervalSpy).toHaveBeenCalledWith(99);
    expect(api.enabled).toBe(false);
    expect(api.groupName).toBeUndefined();
    expect(api.groupToken).toBeUndefined();
    expect(groupData.members.size).toBe(0);
    expect(groupData.groupItems).toEqual({});
    expect(groupData.filters).toEqual([""]);
  });

  it("getGroupData publishes updated group data after successful fetch", async () => {
    api.setSession("session-token", "alice", "member");
    api.nextCheck = "2026-03-30T00:00:00.000Z";

    const payload = [{ name: "Alice" }];
    const responseJson = vi.fn().mockResolvedValue(payload);
    globalThis.fetch.mockResolvedValue({ ok: true, json: responseJson });

    const updateSpy = vi.spyOn(groupData, "update").mockReturnValue(new Date("2026-03-30T00:00:05.000Z"));
    const publishSpy = vi.spyOn(pubsub, "publish");

    await api.getGroupData();

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/group/get-group-data?from_time=2026-03-30T00:00:00.000Z",
      {
        headers: { Authorization: "Bearer session-token" },
        credentials: "same-origin",
      },
    );
    expect(updateSpy).toHaveBeenCalledWith(payload);
    expect(api.nextCheck).toBe("2026-03-30T00:00:05.000Z");
    expect(publishSpy).toHaveBeenCalledWith("get-group-data", groupData);
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

  it("uses example data path for group and skill data when enabled", async () => {
    api.exampleDataEnabled = true;

    const groupPayload = [{ name: "Example" }];
    const skillPayload = [{ name: "Example", skill_data: [] }];
    vi.spyOn(exampleData, "getGroupData").mockReturnValue(groupPayload);
    vi.spyOn(exampleData, "getSkillData").mockReturnValue(skillPayload);
    const updateSpy = vi.spyOn(groupData, "update").mockReturnValue(new Date("2026-03-30T00:00:01.000Z"));
    const publishSpy = vi.spyOn(pubsub, "publish");

    await api.getGroupData();
    const skillData = await api.getSkillData("week");

    expect(updateSpy).toHaveBeenCalledWith(groupPayload);
    expect(publishSpy).toHaveBeenCalledWith("get-group-data", groupData);
    expect(skillData).toBe(skillPayload);
    expect(exampleData.getSkillData).toHaveBeenCalledWith("week", groupData);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("sends expected request shapes for member and auth helper endpoints", async () => {
    api.setSession("session-token", "alice", "member");
    const auth = { Authorization: "Bearer session-token" };

    const response = { ok: true, json: vi.fn().mockResolvedValue({ enabled: true }) };
    globalThis.fetch.mockResolvedValue(response);

    await api.addMember("Charlie");
    await api.removeMember("Charlie");
    await api.renameMember("Charlie", "Charlotte");
    await api.amILoggedIn();
    await api.getGePrices();
    await api.getCaptchaEnabled();

    expect(globalThis.fetch).toHaveBeenNthCalledWith(1, "/api/group/add-group-member", {
      body: JSON.stringify({ name: "Charlie" }),
      headers: { "Content-Type": "application/json", ...auth },
      credentials: "same-origin",
      method: "POST",
    });
    expect(globalThis.fetch).toHaveBeenNthCalledWith(2, "/api/group/delete-group-member", {
      body: JSON.stringify({ name: "Charlie" }),
      headers: { "Content-Type": "application/json", ...auth },
      credentials: "same-origin",
      method: "DELETE",
    });
    expect(globalThis.fetch).toHaveBeenNthCalledWith(3, "/api/group/rename-group-member", {
      body: JSON.stringify({ original_name: "Charlie", new_name: "Charlotte" }),
      headers: { "Content-Type": "application/json", ...auth },
      credentials: "same-origin",
      method: "PUT",
    });
    expect(globalThis.fetch).toHaveBeenNthCalledWith(4, "/api/auth/me", {
      headers: auth,
      credentials: "same-origin",
    });
    expect(globalThis.fetch).toHaveBeenNthCalledWith(5, "/api/ge-prices");
    expect(globalThis.fetch).toHaveBeenNthCalledWith(6, "/api/captcha-enabled");
  });

  it("restart re-enables polling", async () => {
    const enableSpy = vi.spyOn(api, "enable").mockResolvedValue();

    await api.restart();

    expect(enableSpy).toHaveBeenCalledTimes(1);
  });
});
