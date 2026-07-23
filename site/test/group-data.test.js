import { describe, expect, it, beforeEach } from "vitest";
import { GroupData } from "../src/data/group-data";
import { SkillName } from "../src/data/skill";
import { Quest } from "../src/data/quest";
import { Item } from "../src/data/item";
import { pubsub } from "../src/data/pubsub";

describe("group-data", () => {
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
    expect(result[SkillName.Overall]).toBe(
      packedSkills.reduce((sum, xp) => sum + xp, 0),
    );
  });

  it("transforms packed stats and coordinates", () => {
    expect(GroupData.transformStatsFromStorage([50, 99, 25, 70, 3500, 0, 328])).toEqual({
      hitpoints: { current: 50, max: 99 },
      prayer: { current: 25, max: 70 },
      energy: { current: 3500, max: 10000 },
      world: 328,
    });

    expect(GroupData.transformCoordinatesFromStorage([3200, 3200, 1])).toEqual({
      x: 3200,
      y: 3201,
      plane: 1,
    });
  });

  it("maps quest indexes to quest states", () => {
    Quest.questIds = [100, 101, 102];

    expect(GroupData.transformQuestsFromStorage([0, 2, 1])).toEqual({
      100: "IN_PROGRESS",
      101: "FINISHED",
      102: "NOT_STARTED",
    });
  });

  it("applies text filters with exact, partial, and id matching", () => {
    const data = new GroupData();
    data.groupItems = {
      1: { id: 1, name: "Rune scimitar", quantities: { Alice: 1 }, visible: false },
      2: { id: 2, name: "Dragon dagger", quantities: { Alice: 1 }, visible: false },
      4151: { id: 4151, name: "Abyssal whip", quantities: { Alice: 1 }, visible: false },
    };

    data.applyTextFilter("rune|\"dragon dagger\"|4151");

    expect(data.groupItems[1].visible).toBe(true);
    expect(data.groupItems[2].visible).toBe(true);
    expect(data.groupItems[4151].visible).toBe(true);

    data.applyTextFilter("\"dragon dagger\"");

    expect(data.groupItems[1].visible).toBe(false);
    expect(data.groupItems[2].visible).toBe(true);
    expect(data.groupItems[4151].visible).toBe(false);
  });

  describe("potion storage", () => {
    beforeEach(() => {
      Item.itemDetails = {
        244: { id: 244, name: "Attack potion(1)", highalch: 1 },
        245: { id: 245, name: "Strength potion(1)", highalch: 2 },
        4151: { id: 4151, name: "Abyssal whip", highalch: 100 },
      };
      Item.gePrices = { 244: 50, 245: 60, 4151: 1000 };
      pubsub.unpublishAll();
    });

    it("transforms packed potion_storage via transformItemsFromStorage", () => {
      expect(GroupData.transformItemsFromStorage([244, 6, 245, 3])).toEqual([
        { id: 244, quantity: 6 },
        { id: 245, quantity: 3 },
      ]);
    });

    it("aggregates per-member doses into group-level potion collection", () => {
      const data = new GroupData();
      data.update([
        { name: "Alice", potion_storage: [244, 4] },
        { name: "Bob", potion_storage: [244, 2, 245, 1] },
      ]);

      expect(data.potionStorageItems[244].quantity).toBe(6);
      expect(data.potionStorageItems[244].quantities.Alice).toBe(4);
      expect(data.potionStorageItems[244].quantities.Bob).toBe(2);
      expect(data.potionStorageItems[245].quantity).toBe(1);
      expect(data.potionStorageItems[244].source).toBe("potion-storage");
    });

    it("removes potion entries after an explicit empty update", () => {
      const data = new GroupData();
      data.update([{ name: "Alice", potion_storage: [244, 4] }]);
      expect(data.potionStorageItems[244]).toBeDefined();

      data.update([{ name: "Alice", potion_storage: [] }]);
      expect(data.potionStorageItems[244]).toBeUndefined();
    });

    it("publishes items-updated when potion storage changes", () => {
      const data = new GroupData();
      let itemsUpdated = false;
      pubsub.subscribe("items-updated", () => {
        itemsUpdated = true;
      });

      data.update([{ name: "Alice", potion_storage: [244, 4] }]);
      expect(itemsUpdated).toBe(true);
    });

    it("publishes source-specific potion-storage-item-update events", () => {
      const data = new GroupData();
      const events = [];
      pubsub.subscribe("potion-storage-item-update:244", (item) => {
        events.push(item);
      });

      data.update([{ name: "Alice", potion_storage: [244, 4] }]);
      expect(events).toHaveLength(1);
      expect(events[0].id).toBe(244);
      expect(events[0].quantity).toBe(4);
    });

    it("applies text filters to the potion storage collection", () => {
      const data = new GroupData();
      data.update([
        { name: "Alice", potion_storage: [244, 4, 245, 2] },
      ]);

      data.applyTextFilter("attack");
      expect(data.potionStorageItems[244].visible).toBe(true);
      expect(data.potionStorageItems[245].visible).toBe(false);
    });

    it("applies player filters to the potion storage collection", () => {
      const data = new GroupData();
      data.update([
        { name: "Alice", potion_storage: [244, 4] },
        { name: "Bob", potion_storage: [245, 2] },
      ]);

      data.applyPlayerFilter("Alice");
      expect(data.potionStorageItems[244].visible).toBe(true);
      expect(data.potionStorageItems[245].visible).toBe(false);
    });

    it("does not include potion doses in normal groupItems", () => {
      const data = new GroupData();
      data.update([{ name: "Alice", potion_storage: [244, 4] }]);

      expect(data.groupItems[244]).toBeUndefined();
    });
  });
});
