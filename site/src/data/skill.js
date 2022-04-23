export const SkillName = {
  Hunter: "Hunter",
  Thieving: "Thieving",
  Runecraft: "Runecraft",
  Construction: "Construction",
  Cooking: "Cooking",
  Magic: "Magic",
  Fletching: "Fletching",
  Herblore: "Herblore",
  Firemaking: "Firemaking",
  Attack: "Attack",
  Fishing: "Fishing",
  Crafting: "Crafting",
  Hitpoints: "Hitpoints",
  Ranged: "Ranged",
  Mining: "Mining",
  Smithing: "Smithing",
  Agility: "Agility",
  Woodcutting: "Woodcutting",
  Slayer: "Slayer",
  Defence: "Defence",
  Strength: "Strength",
  Prayer: "Prayer",
  Farming: "Farming",
  Overall: "Overall",
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
  constructor(name, xp, overallLevel) {
    this.name = SkillName[name];
    this.xp = xp;
    this.overallLevel = overallLevel;
  }

  get icon() {
    switch (this.name) {
      case SkillName.Attack:
        return "/ui/197-0.png";
      case SkillName.Strength:
        return "/ui/198-0.png";
      case SkillName.Defence:
        return "/ui/199-0.png";
      case SkillName.Ranged:
        return "/ui/200-0.png";
      case SkillName.Prayer:
        return "/ui/201-0.png";
      case SkillName.Magic:
        return "/ui/202-0.png";
      case SkillName.Hitpoints:
        return "/ui/203-0.png";
      case SkillName.Agility:
        return "/ui/204-0.png";
      case SkillName.Herblore:
        return "/ui/205-0.png";
      case SkillName.Thieving:
        return "/ui/206-0.png";
      case SkillName.Crafting:
        return "/ui/207-0.png";
      case SkillName.Fletching:
        return "/ui/208-0.png";
      case SkillName.Mining:
        return "/ui/209-0.png";
      case SkillName.Smithing:
        return "/ui/210-0.png";
      case SkillName.Fishing:
        return "/ui/211-0.png";
      case SkillName.Cooking:
        return "/ui/212-0.png";
      case SkillName.Firemaking:
        return "/ui/213-0.png";
      case SkillName.Woodcutting:
        return "/ui/214-0.png";
      case SkillName.Runecraft:
        return "/ui/215-0.png";
      case SkillName.Slayer:
        return "/ui/216-0.png";
      case SkillName.Farming:
        return "/ui/217-0.png";
      case SkillName.Hunter:
        return "/ui/220-0.png";
      case SkillName.Construction:
        return "/ui/221-0.png";
    }
    return "";
  }

  get level() {
    if (this.name === SkillName.Overall) return this.overallLevel;

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

    if (result[SkillName.Overall]) {
      result[SkillName.Overall].overallLevel = overallLevel;
    }

    return result;
  }
}
