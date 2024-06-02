import { BaseElement } from "../base-element/base-element";
// eslint-disable-next-line no-unused-vars
import { Skill } from "../data/skill";

export class SkillBox extends BaseElement {
  constructor() {
    super();
  }

  html() {
    return `{{skill-box.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.enableTooltip();
    this.skillName = this.getAttribute("skill-name");
    this.playerName = this.getAttribute("player-name");
    this.render();
    this.currentLevel = this.querySelector(".skill-box__current-level");
    this.baseLevel = this.querySelector(".skill-box__baseline-level");
    this.progressBar = this.querySelector(".skill-box__progress-bar");
    this.subscribe(`${this.skillName}:${this.playerName}`, this.handleUpdatedSkill.bind(this));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  handleUpdatedSkill(skill) {
    this.currentLevel.innerHTML = Math.min(99, skill.level);
    this.baseLevel.innerHTML = skill.level;
    const levelProgress = skill.levelProgress;
    this.progressBar.style.transform = `scaleX(${levelProgress})`;
    this.progressBar.style.background = `hsl(${levelProgress * 100}, 100%, 50%)`;

    this.updateTooltip(
      `Total XP: ${skill.xp.toLocaleString()}<br />XP until next level: ${skill.xpUntilNextLevel.toLocaleString()}`
    );
  }
}
customElements.define("skill-box", SkillBox);
