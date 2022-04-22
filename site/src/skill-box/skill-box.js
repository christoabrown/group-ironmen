import { BaseElement } from "../base-element/base-element";
import { SkillName, Skill } from "../data/skill";
import { utility } from "../utility";

export class SkillBox extends BaseElement {
  constructor() {
    super();
  }

  html() {
    this.setAttribute(
      "tooltip-text",
      `Total XP: ${this.skill.xp.toLocaleString()}\nXP until next level: ${this.skill.xpUntilNextLevel.toLocaleString()}`
    );
    return `{{skill-box.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.enableTooltip();
    this.render();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }
}
customElements.define("skill-box", SkillBox);
