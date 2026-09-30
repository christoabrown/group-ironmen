import { beforeEach, describe, expect, it } from "vitest";
import { MemberData } from "../src/data/member-data";
import { Item } from "../src/data/item";
import { pubsub } from "../src/data/pubsub";

describe("member-data", () => {
  beforeEach(() => {
    Item.itemDetails = {
      4151: { id: 4151, name: "Abyssal whip" },
    };
  });

  it("parses inventory and equipment and publishes them on their own topics", () => {
    const member = new MemberData("Alice");

    const updated = member.update({
      inventory: [{ id: 4151, quantity: 2 }],
      equipment: [{ id: 4151, quantity: 1 }],
    });

    expect(updated.has("inventory")).toBe(true);
    expect(updated.has("equipment")).toBe(true);
    expect(member.itemQuantities.inventory.get(4151)).toBe(2);
    expect(member.totalItemQuantity(4151)).toBe(3);
    expect(pubsub.getMostRecent("inventory:Alice")[0][0].id).toBe(4151);
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
});
