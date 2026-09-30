import { describe, expect, it } from "vitest";
import { carriedValue, filterMembers, shares, sortMembers, totalLevel, world } from "../src/data/roster-model";
import { colorForName, hashName } from "../src/data/player-colors";
import { formatDuration, formatGp, relativeTime } from "../src/data/hub-format";

const member = (name, fields = {}) => ({
  name,
  online: false,
  lastSeen: null,
  meta: null,
  ...fields,
});

describe("roster-model", () => {
  const members = [
    member("Zezima", {
      online: true,
      stats: { world: 330 },
      meta: { total_level: 2277, owner: "Zed", inventory_value: 10, equipment_value: 5 },
    }),
    member("alpha", { lastSeen: new Date("2026-09-30T09:00:00Z"), meta: { total_level: 1500 } }),
    member("Bravo", { online: true, stats: { world: 302 }, region: "Lumbridge", meta: { total_level: 1800 } }),
    member("Charlie", { lastSeen: new Date("2026-09-29T09:00:00Z") }),
  ];

  it("filters by status and by name, owner or place", () => {
    expect(filterMembers(members, { status: "online" }).map((m) => m.name)).toEqual(["Zezima", "Bravo"]);
    expect(filterMembers(members, { status: "offline" }).map((m) => m.name)).toEqual(["alpha", "Charlie"]);
    expect(filterMembers(members, { text: "zed" }).map((m) => m.name)).toEqual(["Zezima"]);
    expect(filterMembers(members, { text: "lumb" }).map((m) => m.name)).toEqual(["Bravo"]);
  });

  it("sorts online first, by numbers and by last seen", () => {
    expect(sortMembers(members, "status").map((m) => m.name)).toEqual(["Bravo", "Zezima", "alpha", "Charlie"]);
    expect(sortMembers(members, "name").map((m) => m.name)).toEqual(["alpha", "Bravo", "Charlie", "Zezima"]);
    expect(sortMembers(members, "total").map((m) => m.name)).toEqual(["Zezima", "Bravo", "alpha", "Charlie"]);
    expect(sortMembers(members, "world").map((m) => m.name)).toEqual(["Bravo", "Zezima", "alpha", "Charlie"]);
    expect(sortMembers(members, "lastSeen").map((m) => m.name)).toEqual(["Bravo", "Zezima", "alpha", "Charlie"]);
    expect(sortMembers(members, "name", true)[0].name).toBe("Zezima");
  });

  it("reads values from the hub's details", () => {
    expect(carriedValue(members[0])).toBe(15);
    expect(carriedValue(members[3])).toBeNull();
    expect(totalLevel(members[1])).toBe(1500);
    expect(world(members[0])).toBe(330);
    expect(world(members[1])).toBeNull();
  });

  it("treats unknown sharing as shared", () => {
    expect(shares(member("A"), "inventory")).toBe(true);
    expect(shares(member("A", { meta: { categories: ["stats"] } }), "inventory")).toBe(false);
    expect(shares(member("A", { meta: { categories: ["inventory"] } }), "inventory")).toBe(true);
  });
});

describe("player colours", () => {
  it("are stable per name, whatever the case", () => {
    expect(colorForName("Zezima")).toEqual(colorForName("zezima"));
    expect(hashName("a")).not.toBe(hashName("b"));
  });

  it("spread over the hues", () => {
    const hues = new Set(Array.from({ length: 60 }, (_, i) => Math.floor(colorForName(`Player ${i}`).hue / 30)));
    expect(hues.size).toBeGreaterThanOrEqual(10);
  });
});

describe("hub formatting", () => {
  it("formats gp amounts", () => {
    expect(formatGp(950)).toBe("950");
    expect(formatGp(1500)).toBe("1.5K");
    expect(formatGp(35237280)).toBe("35.2M");
    expect(formatGp(2000000000)).toBe("2B");
    expect(formatGp(null)).toBe("–");
  });

  it("formats durations", () => {
    expect(formatDuration(5 * 60000)).toBe("5m");
    expect(formatDuration(90 * 60000)).toBe("1h 30m");
    expect(formatDuration(26 * 3600000)).toBe("1d 2h");
  });

  it("formats relative times", () => {
    const now = new Date("2026-09-30T12:00:00Z");
    expect(relativeTime("2026-09-30T11:59:30Z", now)).toBe("just now");
    expect(relativeTime("2026-09-28T12:00:00Z", now)).toBe("2d ago");
    expect(relativeTime(null, now)).toBe("never");
  });
});
