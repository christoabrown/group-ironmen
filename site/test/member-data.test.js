import { beforeEach, describe, expect, it } from "vitest";
import { MemberData } from "../src/data/member-data";
import { Item } from "../src/data/item";
import { Quest } from "../src/data/quest";
import { pubsub } from "../src/data/pubsub";

describe("member-data", () => {
  let originalLookupByName;

  beforeEach(() => {
    originalLookupByName = Quest.lookupByName;
    Item.itemDetails = {
      4151: { id: 4151, name: "Abyssal whip" },
    };
  });

  it("publishes parsed collection log payload on collection_log_v2 updates", () => {
    const member = new MemberData("Alice");

    member.update({
      collection_log_v2: [{ id: 4151, quantity: 2 }],
    });

    const event = pubsub.getMostRecent("collection_log_v2:Alice");
    expect(event).toBeDefined();
    expect(event[0]).toBe(member.collectionLog);
    expect(member.collectionLog).toHaveLength(1);
    expect(member.collectionLog[0].id).toBe(4151);
    expect(member.collectionLog[0].quantity).toBe(2);
  });

  it("publishes interacting updates when payload explicitly clears interacting", () => {
    const member = new MemberData("Alice");

    member.update({
      interacting: {
        name: "<col=ff0000>Goblin</col>",
        location: { x: 3200, y: 3200, plane: 0 },
        last_updated: new Date().toISOString(),
        ratio: 1,
        scale: 1,
      },
    });

    const updatedAttributes = member.update({
      interacting: null,
    });

    const event = pubsub.getMostRecent("interacting:Alice");
    expect(updatedAttributes.has("interacting")).toBe(true);
    expect(member.interacting).toBeNull();
    expect(event).toBeDefined();
    expect(event[0]).toBeNull();
  });

  it("returns false when quest lookup data is unavailable", () => {
    const member = new MemberData("Alice");
    member.quests = {};
    Quest.lookupByName = undefined;

    expect(member.hasQuestComplete("Cook's Assistant")).toBe(false);
  });

  it("returns false when member quest data is unavailable", () => {
    const member = new MemberData("Alice");
    Quest.lookupByName = new Map([["Cook's Assistant", "1"]]);

    expect(member.hasQuestComplete("Cook's Assistant")).toBe(false);
  });

  it("does not throw when combat level is computed with incomplete skills", () => {
    const member = new MemberData("Alice");
    member.skills = {
      Attack: { level: 99 },
      Strength: { level: 99 },
    };

    expect(() => member.computeCombatLevel()).not.toThrow();
    expect(member.combatLevel).toBeUndefined();
  });

  it("computes combat level when all required skills are present", () => {
    const member = new MemberData("Alice");
    member.skills = {
      Defence: { level: 99 },
      Hitpoints: { level: 99 },
      Prayer: { level: 99 },
      Attack: { level: 99 },
      Strength: { level: 99 },
      Ranged: { level: 99 },
      Magic: { level: 99 },
    };

    member.computeCombatLevel();

    expect(member.combatLevel).toBeGreaterThan(0);
  });

  afterEach(() => {
    Quest.lookupByName = originalLookupByName;
  });
});
