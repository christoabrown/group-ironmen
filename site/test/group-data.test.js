import { describe, expect, it, beforeEach } from "vitest";
import { GroupData } from "../src/data/group-data";
import { SkillName } from "../src/data/skill";
import { Item } from "../src/data/item";
import { pubsub } from "../src/data/pubsub";

describe("group-data", () => {
  beforeEach(() => {
    Item.itemDetails = { 4151: { id: 4151, name: "Abyssal whip", highalch: 100 } };
    pubsub.unpublishAll();
  });

  it("transforms packed item data from storage", () => {
    expect(GroupData.transformItemsFromStorage([4151, 2, 995, 100])).toEqual([
      { id: 4151, quantity: 2 },
      { id: 995, quantity: 100 },
    ]);
  });

  it("transforms packed skill data and computes overall", () => {
    const skillNames = Object.keys(SkillName).filter((name) => name !== SkillName.Overall);
    const packedSkills = skillNames.map((_, index) => index + 1);

    const result = GroupData.transformSkillsFromStorage(packedSkills);

    expect(result[skillNames[0]]).toBe(1);
    expect(result[SkillName.Overall]).toBe(packedSkills.reduce((sum, xp) => sum + xp, 0));
  });

  it("transforms packed stats and coordinates", () => {
    expect(GroupData.transformStatsFromStorage([50, 99, 25, 70, 0, 0, 328])).toEqual({
      hitpoints: { current: 50, max: 99 },
      prayer: { current: 25, max: 70 },
      world: 328,
    });

    expect(GroupData.transformCoordinatesFromStorage([3200, 3200, 1])).toEqual({
      x: 3200,
      y: 3201,
      plane: 1,
    });
  });

  it("adds and removes members and publishes the member list when it changes", () => {
    const data = new GroupData();
    const published = [];
    pubsub.subscribe("members-updated", (members) => published.push(members.map((m) => m.name)));

    data.update([
      { name: "Bob", inventory: [4151, 1] },
      { name: "Alice", coordinates: [3200, 3200, 0] },
    ]);
    expect([...data.members.keys()]).toEqual(["Alice", "Bob"]);
    expect(data.members.get("Bob").inventory[0].id).toBe(4151);

    data.update([{ name: "Alice" }]);
    expect([...data.members.keys()]).toEqual(["Alice"]);
    expect(published).toEqual([["Alice", "Bob"], ["Alice"]]);
  });

  it("returns a cursor just after the newest update", () => {
    const data = new GroupData();
    const cursor = data.update([
      { name: "Alice", last_updated: "2026-09-30T10:00:00.000Z" },
      { name: "Bob", last_updated: "2026-09-30T11:00:00.000Z" },
    ]);
    expect(cursor.toISOString()).toBe("2026-09-30T11:00:00.001Z");
  });
});
