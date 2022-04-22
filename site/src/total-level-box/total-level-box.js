import { BaseElement } from "../base-element/base-element";

export class TotalLevelBox extends BaseElement {
  constructor() {
    super();
  }

  html() {
    this.setAttribute("tooltip-text", `Total XP: ${this.skill.xp.toLocaleString()}`);
    return `{{total-level-box.html}}`;
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
customElements.define("total-level-box", TotalLevelBox);
