import { describe, expect, it, beforeEach } from "vitest";
import { GuildData } from "../src/data/guild-data";
import { SkillName } from "../src/data/skill";
import { Item } from "../src/data/item";
import { pubsub } from "../src/data/pubsub";

const roster = (...entries) =>
  entries.map(([name, online = true, lastSeen = "2026-09-30T10:00:00.000Z"]) => ({
    name,
    online,
    last_seen: lastSeen,
    orphaned: false,
  }));

describe("guild-data", () => {
  beforeEach(() => {
    Item.itemDetails = { 4151: { id: 4151, name: "Abyssal whip", highalch: 100 } };
    pubsub.unpublishAll();
  });

  it("transforms packed item data from storage", () => {
    expect(GuildData.transformItemsFromStorage([4151, 2, 995, 100])).toEqual([
      { id: 4151, quantity: 2 },
      { id: 995, quantity: 100 },
    ]);
  });

  it("transforms packed skill data and computes overall", () => {
    const skillNames = Object.keys(SkillName).filter((name) => name !== SkillName.Overall);
    const packedSkills = skillNames.map((_, index) => index + 1);

    const result = GuildData.transformSkillsFromStorage(packedSkills);

    expect(result[skillNames[0]]).toBe(1);
    expect(result[SkillName.Overall]).toBe(packedSkills.reduce((sum, xp) => sum + xp, 0));
  });

  it("transforms packed stats and coordinates", () => {
    expect(GuildData.transformStatsFromStorage([50, 99, 25, 70, 0, 0, 328])).toEqual({
      hitpoints: { current: 50, max: 99 },
      prayer: { current: 25, max: 70 },
      world: 328,
    });

    expect(GuildData.transformCoordinatesFromStorage([3200, 3200, 1])).toEqual({
      x: 3200,
      y: 3201,
      plane: 1,
    });
  });

  it("follows the roster: adds, updates and removes members", () => {
    const data = new GuildData();
    const published = [];
    pubsub.subscribe("members-updated", (members) => published.push(members.map((m) => m.name)));

    data.update({
      cursor: "2026-09-30T10:00:00.000Z",
      roster: roster(["Bob"], ["Alice", false]),
      members: [
        { name: "Bob", inventory: [4151, 1], meta: { total_level: 1500 } },
        { name: "Alice", coordinates: [3200, 3200, 0] },
      ],
    });
    expect([...data.members.keys()].sort()).toEqual(["Alice", "Bob"]);
    expect(data.members.get("Bob").inventory[0].id).toBe(4151);
    expect(data.members.get("Bob").meta.total_level).toBe(1500);
    expect(data.members.get("Bob").online).toBe(true);
    expect(data.members.get("Alice").online).toBe(false);
    expect(data.members.get("Alice").lastSeen).toEqual(new Date("2026-09-30T10:00:00.000Z"));

    data.update({ cursor: "2026-09-30T10:00:02.000Z", roster: roster(["Alice", false]), members: [] });
    expect([...data.members.keys()]).toEqual(["Alice"]);
    expect(published).toEqual([["Alice", "Bob"], ["Alice"]]);
  });

  it("counts an item per member and inventory, for the item tooltip", () => {
    const data = new GuildData();
    data.update({
      cursor: "2026-09-30T10:00:00.000Z",
      roster: roster(["Bob"]),
      members: [{ name: "Bob", inventory: [4151, 1, 4151, 2], equipment: [4151, 1] }],
    });

    expect(data.inventoryQuantityForItem(4151, "Bob", "inventory")).toBe(3);
    expect(data.inventoryQuantityForItem(4151, "Bob", "equipment")).toBe(1);
    expect(data.inventoryQuantityForItem(995, "Bob", "inventory")).toBe(0);
    expect(data.inventoryQuantityForItem(4151, "Nobody", "inventory")).toBe(0);
  });

  it("returns the server's cursor", () => {
    const data = new GuildData();
    const next = data.update({
      cursor: "2026-09-30T11:00:00.000Z",
      roster: roster(["Alice"]),
      members: [{ name: "Alice", stats: [1, 1, 1, 1, 0, 0, 301] }],
    });
    expect(next.toISOString()).toBe("2026-09-30T11:00:00.000Z");
  });

  it("asks for a full reload once when a new name arrives without data", () => {
    const data = new GuildData();
    data.update({
      cursor: "2026-09-30T11:00:00.000Z",
      roster: roster(["Alice"]),
      members: [{ name: "Alice", stats: [1, 1, 1, 1, 0, 0, 301] }],
    });

    // Renamed on the hub: the new name's data is older than the cursor.
    const next = data.update({ cursor: "2026-09-30T11:00:02.000Z", roster: roster(["Alice Two"]), members: [] });
    expect(next.getTime()).toBe(0);
    const after = data.update({ cursor: "2026-09-30T11:00:04.000Z", roster: roster(["Alice Two"]), members: [] });
    expect(after.toISOString()).toBe("2026-09-30T11:00:04.000Z");
  });

  it("publishes the names that changed and online flips in members-updated", () => {
    const data = new GuildData();
    const changed = [];
    let memberLists = 0;
    pubsub.subscribe("roster-changed", (names) => changed.push([...names].sort()));
    pubsub.subscribe("members-updated", () => memberLists++);

    data.update({
      cursor: "2026-09-30T11:00:00.000Z",
      roster: roster(["Alice"], ["Bob"]),
      members: [{ name: "Alice" }, { name: "Bob" }],
    });
    data.update({
      cursor: "2026-09-30T11:00:02.000Z",
      roster: roster(["Alice"], ["Bob"]),
      members: [{ name: "Bob", stats: [5, 10, 1, 1, 0, 0, 301] }],
    });
    expect(changed[1]).toEqual(["Bob"]);
    expect(memberLists).toBe(1);

    data.update({ cursor: "2026-09-30T11:00:04.000Z", roster: roster(["Alice", false], ["Bob"]), members: [] });
    expect(changed[2]).toEqual(["Alice"]);
    expect(memberLists).toBe(2);
  });
});
