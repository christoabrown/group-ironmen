import { Item } from "./item";
import { Skill, SkillName } from "./skill";
import { pubsub } from "./pubsub";
import { colorForName } from "./player-colors";
import { regionForMember } from "./regions";

export const memberInventoryFields = ["inventory", "equipment"];

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
];

export class MemberData {
  constructor(name) {
    this.name = name;
    this.itemQuantities = {};
    for (const inventoryField of memberInventoryFields) {
      this.itemQuantities[inventoryField] = new Map();
    }
    this.online = false;
    this.lastSeen = null;
    this.orphaned = false;
    this.meta = null;

    const { hue, color, light } = colorForName(name);
    this.hue = hue;
    this.color = color;
    this.lightColor = light;
  }

  /** Offline, for components written before presence came from the hub. */
  get inactive() {
    return !this.online;
  }

  /** Applies a roster entry. Returns whether anything changed. */
  updatePresence({ online, last_seen, orphaned }) {
    const lastSeen = last_seen ? new Date(last_seen) : null;
    const changed =
      this.online !== online ||
      this.orphaned !== Boolean(orphaned) ||
      (this.lastSeen?.getTime() ?? null) !== (lastSeen?.getTime() ?? null);
    const wentOnline = online && !this.online;
    const wentOffline = !online && this.online;
    this.online = online;
    this.lastSeen = lastSeen;
    this.orphaned = Boolean(orphaned);
    if (changed) this.publishUpdate("presence", "online");
    if (wentOnline) this.publishUpdate("active");
    if (wentOffline) this.publishUpdate("inactive");
    return changed;
  }

  update(memberData) {
    let updatedAttributes = new Set();

    if (memberData.stats) {
      this.stats = memberData.stats;
      this.publishUpdate("stats");
      updatedAttributes.add("stats");
    }

    if (memberData.meta) {
      this.meta = memberData.meta;
      this.publishUpdate("meta");
      updatedAttributes.add("meta");
    }

    if (memberData.coordinates) {
      this.coordinates = memberData.coordinates;
      this.updateRegion();
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

    return updatedAttributes;
  }

  /** Names the place the member is at. Returns whether it changed. */
  updateRegion() {
    const region = regionForMember(this);
    if (region === this.region) return false;
    this.region = region;
    this.publishUpdate("region");
    return true;
  }

  applyItemFieldUpdate(memberData, field, updatedAttributes) {
    if (!memberData[field.sourceKey]) return;
    this[field.targetKey] = Item.parseItemData(memberData[field.sourceKey]);
    this.updateItemQuantitiesIn(field.inventoryName);
    this.publishUpdate(field.publishKey);
    updatedAttributes.add(field.updatedAttribute);
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
}
