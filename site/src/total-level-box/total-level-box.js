import { BaseElement } from "../base-element/base-element";

export class TotalLevelBox extends BaseElement {
  constructor() {
    super();
  }

  html() {
    return `{{total-level-box.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.enableTooltip();
    this.playerName = this.getAttribute("player-name");
    this.render();
    this.totalLevel = this.querySelector(".total-level-box__level");
    this.subscribe(`Overall:${this.playerName}`, this.handleUpdatedTotalXp.bind(this));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  handleUpdatedTotalXp(skill) {
    this.totalLevel.innerHTML = skill.level;
    this.updateTooltip(`Total XP: ${skill.xp.toLocaleString()}`);
  }
}
customElements.define("total-level-box", TotalLevelBox);
