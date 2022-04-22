import { BaseElement } from "../base-element/base-element";
import { SkillName } from "../data/skill";

export class PlayerSkills extends BaseElement {
  constructor() {
    super();
  }

  html() {
    return `{{player-skills.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.render();
    const playerName = this.getAttribute("player-name");
    this.subscribe(`skills:${playerName}`, this.handleUpdatedSkills.bind(this));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  handleUpdatedSkills(skills) {
    const skillBoxes = document.createDocumentFragment();
    [
      SkillName.Attack,
      SkillName.Hitpoints,
      SkillName.Mining,
      SkillName.Strength,
      SkillName.Agility,
      SkillName.Smithing,
      SkillName.Defence,
      SkillName.Herblore,
      SkillName.Fishing,
      SkillName.Ranged,
      SkillName.Thieving,
      SkillName.Cooking,
      SkillName.Prayer,
      SkillName.Crafting,
      SkillName.Firemaking,
      SkillName.Magic,
      SkillName.Fletching,
      SkillName.Woodcutting,
      SkillName.Runecraft,
      SkillName.Slayer,
      SkillName.Farming,
      SkillName.Construction,
      SkillName.Hunter,
    ].forEach((skillName) => {
      const skillBox = document.createElement("skill-box");
      skillBox.skill = skills[skillName];
      skillBoxes.appendChild(skillBox);
    });

    const overallSkillBox = document.createElement("total-level-box");
    overallSkillBox.skill = skills[SkillName.Overall];
    skillBoxes.appendChild(overallSkillBox);
    this.innerHTML = "";
    this.appendChild(skillBoxes);
  }
}
customElements.define("player-skills", PlayerSkills);
