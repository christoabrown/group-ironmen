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
    this.playerName = this.getAttribute("player-name");
    this.renderSkillBoxes();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  renderSkillBoxes() {
    const skillBoxes = document.createDocumentFragment();
    const skills = [
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
    ];
    let zindex = skills.length;
    skills.forEach((skillName) => {
      const skillBox = document.createElement("skill-box");
      skillBox.setAttribute("player-name", this.playerName);
      skillBox.setAttribute("skill-name", skillName);

      // NOTE: Setting the z-index so levels over 99 will draw on top of the next box and not get hidden behind it
      skillBox.setAttribute("style", `z-index: ${zindex--}`);
      skillBoxes.appendChild(skillBox);
    });

    const overallSkillBox = document.createElement("total-level-box");
    overallSkillBox.setAttribute("player-name", this.playerName);
    skillBoxes.appendChild(overallSkillBox);
    this.innerHTML = "";
    this.appendChild(skillBoxes);
  }
}
customElements.define("player-skills", PlayerSkills);
