import { skillIconUrl } from "./icons";

export const SkillName = {
  Agility: "Agility",
  Attack: "Attack",
  Construction: "Construction",
  Cooking: "Cooking",
  Crafting: "Crafting",
  Defence: "Defence",
  Farming: "Farming",
  Firemaking: "Firemaking",
  Fishing: "Fishing",
  Fletching: "Fletching",
  Herblore: "Herblore",
  Hitpoints: "Hitpoints",
  Hunter: "Hunter",
  Magic: "Magic",
  Mining: "Mining",
  Overall: "Overall",
  Prayer: "Prayer",
  Ranged: "Ranged",
  Runecraft: "Runecraft",
  Slayer: "Slayer",
  Smithing: "Smithing",
  Strength: "Strength",
  Thieving: "Thieving",
  Woodcutting: "Woodcutting",
  Sailing: "Sailing",
};

const levelLookup = new Map();
levelLookup.set(1, 0);
function xpForLevel(level) {
  let xp = 0;
  for (let i = 1; i <= level; ++i) {
    xp += Math.floor(i + 300 * 2 ** (i / 7));
  }
  return Math.floor(0.25 * xp);
}

for (let i = 1; i <= 126; ++i) {
  levelLookup.set(i + 1, xpForLevel(i));
}

export class Skill {
  constructor(name, xp) {
    this.name = SkillName[name];
    this.xp = xp;
    this.level = this.calculateLevel();
  }

  /** The skill's icon URL, or "" for Overall, unknown names, or when icons are disabled. */
  static getIcon(skillName) {
    if (skillName === SkillName.Overall || !Object.values(SkillName).includes(skillName)) return "";
    return skillIconUrl(skillName);
  }

  get icon() {
    return Skill.getIcon(this.name);
  }

  calculateLevel() {
    if (this.name === SkillName.Overall) return this.level;

    for (let i = 1; i <= 126; ++i) {
      const start = levelLookup.get(i);
      const end = levelLookup.get(i + 1);
      if (this.xp >= start && this.xp < end) {
        return i;
      }
    }
    return 1;
  }

  get levelProgress() {
    const currentLevel = this.level;
    const start = levelLookup.get(currentLevel);
    const end = levelLookup.get(currentLevel + 1);
    const xpInLevel = this.xp - start;
    return xpInLevel / (end - start);
  }

  get xpUntilNextLevel() {
    const nextLevelXp = levelLookup.get(this.level + 1);
    return nextLevelXp - this.xp;
  }

  static parseSkillData(skills) {
    const result = {};
    let overallLevel = 0;
    for (const [name, xp] of Object.entries(skills)) {
      const skill = new Skill(name, xp);
      result[name] = skill;
      if (name !== SkillName.Overall) overallLevel += Math.min(99, skill.level);
    }

    result[SkillName.Overall].level = overallLevel;
    return result;
  }
}
