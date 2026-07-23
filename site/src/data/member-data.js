import { Quest, QuestState } from "./quest";
import { Item } from "./item";
import { Skill, SkillName } from "./skill";
import { pubsub } from "./pubsub";
import { utility } from "../utility";
import { AchievementDiary } from "./diaries";

const playerColors = [
  "hsl(41, 100%, 40%)", // yellow
  "hsl(151, 69%, 26%)", // green
  "hsl(210, 50%, 40%)", // blue
  "hsl(355, 76%, 36%)", // red
  "hsl(288, 65%, 45%)", // purple
];
let currentColor = 0;

export const memberInventoryFields = ["bank", "inventory", "equipment", "runePouch", "seedVault"];

const allItemSourceFields = [...memberInventoryFields, "potionStorage"];

const parsedFieldMappings = [
  {
    sourceKey: "stats",
    targetKey: "stats",
    parser: (value) => value,
    publishKey: "stats",
    updatedAttribute: "stats",
  },
  {
    sourceKey: "quests",
    targetKey: "quests",
    parser: Quest.parseQuestData,
    publishKey: "quests",
    updatedAttribute: "quests",
  },
  {
    sourceKey: "diary_vars",
    targetKey: "diaries",
    parser: AchievementDiary.parseDiaryData,
    publishKey: "diaries",
    updatedAttribute: "diaries",
  },
  {
    sourceKey: "collection_log_v2",
    targetKey: "collectionLog",
    parser: Item.parseItemData,
    publishKey: "collection_log_v2",
    publishValueKey: "collectionLog",
    updatedAttribute: "collection_log_v2",
  },
];

const itemFieldMappings = [
  {
    sourceKey: "inventory",
    targetKey: "inventory",
    inventoryName: "inventory",
    publishKey: "inventory",
    updatedAttribute: "inventory",
  },
  {
    sourceKey: "equipment",
    targetKey: "equipment",
    inventoryName: "equipment",
    publishKey: "equipment",
    updatedAttribute: "equipment",
  },
  {
    sourceKey: "bank",
    targetKey: "bank",
    inventoryName: "bank",
    publishKey: "bank",
    updatedAttribute: "bank",
  },
  {
    sourceKey: "rune_pouch",
    targetKey: "runePouch",
    inventoryName: "runePouch",
    publishKey: "runePouch",
    updatedAttribute: "runePouch",
  },
  {
    sourceKey: "seed_vault",
    targetKey: "seedVault",
    inventoryName: "seedVault",
    publishKey: "seedVault",
    updatedAttribute: "seedVault",
  },
  {
    sourceKey: "potion_storage",
    targetKey: "potionStorage",
    inventoryName: "potionStorage",
    publishKey: "potionStorage",
    updatedAttribute: "potion_storage",
  },
];

export class MemberData {
  constructor(name) {
    this.name = name;
    this.itemQuantities = {};
    for (const inventoryField of allItemSourceFields) {
      this.itemQuantities[inventoryField] = new Map();
    }
    this.inactive = false;

    this.color = playerColors[currentColor];
    currentColor = (currentColor + 1) % playerColors.length;
    // Store the hue for player-icon
    this.hue = this.color.substring(this.color.indexOf("(") + 1, this.color.indexOf(","));
  }

  update(memberData) {
    let updatedAttributes = new Set();

    for (const field of parsedFieldMappings) {
      this.applyParsedFieldUpdate(memberData, field, updatedAttributes);
    }

    if (memberData.last_updated) {
      this.lastUpdated = new Date(memberData.last_updated);
      const timeSinceLastUpdated = utility.timeSinceLastUpdate(memberData.last_updated);
      let wasInactive = this.inactive;

      this.inactive = !isNaN(timeSinceLastUpdated) && timeSinceLastUpdated > 300 * 1000;

      if (!wasInactive && this.inactive) {
        this.publishUpdate("inactive");
      } else if (wasInactive && !this.inactive) {
        this.publishUpdate("active");
      }
    }

    if (memberData.coordinates) {
      this.coordinates = memberData.coordinates;
      pubsub.publish("coordinates", this);
      updatedAttributes.add("coordinates");
    }

    if (memberData.skills) {
      const previousSkills = this.skills;
      this.skills = Skill.parseSkillData(memberData.skills);
      this.publishUpdate("skills");
      updatedAttributes.add("skills");

      this.computeXpDrops(previousSkills);
      this.computeCombatLevel();
    }

    for (const field of itemFieldMappings) {
      this.applyItemFieldUpdate(memberData, field, updatedAttributes);
    }

    this.applyInteractingUpdate(memberData, updatedAttributes);

    return updatedAttributes;
  }

  applyParsedFieldUpdate(memberData, field, updatedAttributes) {
    if (!memberData[field.sourceKey]) return;
    this[field.targetKey] = field.parser(memberData[field.sourceKey]);
    this.publishUpdate(field.publishKey, field.publishValueKey);
    updatedAttributes.add(field.updatedAttribute);
  }

  applyItemFieldUpdate(memberData, field, updatedAttributes) {
    if (!memberData[field.sourceKey]) return;
    this[field.targetKey] = Item.parseItemData(memberData[field.sourceKey]);
    this.updateItemQuantitiesIn(field.inventoryName);
    this.publishUpdate(field.publishKey);
    updatedAttributes.add(field.updatedAttribute);
  }

  applyInteractingUpdate(memberData, updatedAttributes) {
    if (!Object.hasOwn(memberData, "interacting")) return;

    if (memberData.interacting) {
      memberData.interacting.name = utility.removeTags(memberData.interacting.name);
    }

    this.interacting = memberData.interacting;
    this.publishUpdate("interacting");
    updatedAttributes.add("interacting");
  }

  publishUpdate(attributeName, publishValueKey = attributeName) {
    pubsub.publish(`${attributeName}:${this.name}`, this[publishValueKey], this);
  }

  totalItemQuantity(itemId) {
    let total = 0;
    for (const inventoryField of memberInventoryFields) {
      total += this.itemQuantities[inventoryField].get(itemId) || 0;
    }
    return total;
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
    for (const item of this.itemsIn(...memberInventoryFields)) {
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
    if (!previousSkills) {
      for (const skillName of Object.values(SkillName)) {
        pubsub.publish(`${skillName}:${this.name}`, this.skills[skillName]);
      }
      return;
    }

    const xpDrops = [];
    for (const skillName of Object.values(SkillName)) {
      if (!this.skills[skillName] || !previousSkills[skillName]) continue;
      const xpDiff = this.skills[skillName].xp - previousSkills[skillName].xp;
      if (xpDiff > 0 && skillName !== "Overall") xpDrops.push(new Skill(skillName, xpDiff));
      if (xpDiff !== 0) pubsub.publish(`${skillName}:${this.name}`, this.skills[skillName]);
    }

    if (xpDrops.length > 0) {
      pubsub.publish(`xp:${this.name}`, xpDrops);
    }
  }

  computeCombatLevel() {
    const s = 0.325;
    const relevantSkillNames = ["Defence", "Hitpoints", "Prayer", "Attack", "Strength", "Ranged", "Magic"];
    const hasAllSkills = relevantSkillNames.every((skillName) => typeof this.skills?.[skillName]?.level === "number");
    if (!hasAllSkills) return;

    const defence = Math.min(this.skills.Defence.level, 99);
    const hitpoints = Math.min(this.skills.Hitpoints.level, 99);
    const prayer = Math.min(this.skills.Prayer.level, 99);
    const attack = Math.min(this.skills.Attack.level, 99);
    const strength = Math.min(this.skills.Strength.level, 99);
    const ranged = Math.min(this.skills.Ranged.level, 99);
    const magic = Math.min(this.skills.Magic.level, 99);

    const base = (defence + hitpoints + Math.floor(prayer / 2)) / 4;
    const melee = s * (attack + strength);
    const range = s * (Math.floor(ranged / 2) + ranged);
    const mage = s * (Math.floor(magic / 2) + magic);

    const combatLevel = Math.floor(base + Math.max(melee, range, mage));

    if (combatLevel !== this.combatLevel) {
      this.combatLevel = combatLevel;
      this.publishUpdate("combatLevel");
    }
  }

  hasQuestComplete(questName) {
    if (!Quest.lookupByName || !this.quests) return false;

    const questId = Quest.lookupByName.get(questName);

    if (!questId) {
      console.warn(`Unknown quest ${questName}`);
      return false;
    }

    const questComplete = this.quests[questId]?.state === QuestState.FINISHED;

    return questComplete;
  }
}
