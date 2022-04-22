import { Quest } from "./quest";
import { Item } from "./item";
import { Skill, SkillName } from "./skill";
import { pubsub } from "./pubsub";

export class MemberData {
  constructor(name) {
    this.name = name;
    this.itemQuantities = {
      bank: new Map(),
      inventory: new Map(),
      equipment: new Map(),
    };
    this.inactive = false;
  }

  update(memberData) {
    let updatedAttributes = new Set();

    if (memberData.last_updated) {
      this.lastUpdated = new Date(memberData.last_updated);
      const now = new Date();
      let wasInactive = this.inactive;
      this.inactive = !isNaN(this.lastUpdated.getTime()) && now.getTime() - this.lastUpdated.getTime() > 300 * 1000;

      if (!wasInactive && this.inactive) {
        this.publishUpdate("inactive");
      }
    }

    if (memberData.stats) {
      this.stats = memberData.stats;
      this.publishUpdate("stats");
      updatedAttributes.add("stats");
    }

    if (memberData.coordinates) {
      this.coordinates = memberData.coordinates;
      pubsub.publish("coordinates", this);
      updatedAttributes.add("coordinates");
    }

    if (memberData.quests) {
      this.quests = Quest.parseQuestData(memberData.quests);
      this.publishUpdate("quests");
      updatedAttributes.add("quests");
    }

    if (memberData.skills) {
      const previousSkills = this.skills;
      this.skills = Skill.parseSkillData(memberData.skills);
      this.publishUpdate("skills");
      updatedAttributes.add("skills");

      if (previousSkills) {
        this.computeXpDrops(previousSkills);
      }
    }

    if (memberData.inventory) {
      this.inventory = Item.parseItemData(memberData.inventory);
      this.updateItemQuantitiesIn("inventory");
      this.publishUpdate("inventory");
      updatedAttributes.add("inventory");
    }

    if (memberData.equipment) {
      this.equipment = Item.parseItemData(memberData.equipment);
      this.updateItemQuantitiesIn("equipment");
      this.publishUpdate("equipment");
      updatedAttributes.add("equipment");
    }

    if (memberData.bank) {
      this.bank = Item.parseItemData(memberData.bank);
      this.updateItemQuantitiesIn("bank");
      this.publishUpdate("bank");
      updatedAttributes.add("bank");
    }

    return updatedAttributes;
  }

  publishUpdate(attributeName) {
    pubsub.publish(`${attributeName}:${this.name}`, this[attributeName], this);
  }

  totalItemQuantity(itemId) {
    return (
      (this.itemQuantities.bank.get(itemId) || 0) +
      (this.itemQuantities.equipment.get(itemId) || 0) +
      (this.itemQuantities.inventory.get(itemId) || 0)
    );
  }

  updateItemQuantitiesIn(inventoryName) {
    this.itemQuantities[inventoryName] = new Map();
    for (const item of this.itemsIn(inventoryName)) {
      const x = this.itemQuantities[inventoryName];
      x.set(item.id, (x.get(item.id) || 0) + item.quantity);
    }
  }

  *allItems() {
    const yieldedIds = new Set();
    for (const item of this.itemsIn("inventory", "bank", "equipment")) {
      if (!yieldedIds.has(item.id)) {
        yieldedIds.add(item.id);
        yield item;
      }
    }
  }

  *itemsIn(...inventoryNames) {
    for (const inventoryName of inventoryNames) {
      if (this[inventoryName] === undefined) continue;
      for (const item of this[inventoryName]) {
        if (item.isValid()) yield item;
      }
    }
  }

  computeXpDrops(previousSkills) {
    const xpDrops = [];
    for (const skillName of Object.values(SkillName)) {
      if (skillName === "Overall") continue;
      if (!this.skills[skillName] || !previousSkills[skillName]) continue;
      const xpDiff = this.skills[skillName].xp - previousSkills[skillName].xp;
      if (xpDiff > 0) xpDrops.push(new Skill(skillName, xpDiff));
    }

    if (xpDrops.length > 0) {
      pubsub.publish(`xp:${this.name}`, xpDrops);
    }
  }
}
