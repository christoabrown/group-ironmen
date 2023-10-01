import { BaseElement } from "../base-element/base-element";
import { groupData } from "../data/group-data";

export class PlayerIcon extends BaseElement {
  constructor() {
    super();
  }

  html() {
    return `{{player-icon.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    const playerName = this.getAttribute("player-name");
    const hue = groupData.members.get(playerName).hue || 0;
    this.style.setProperty("--player-icon-color", `${hue}deg`);
    this.render();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }
}

customElements.define("player-icon", PlayerIcon);
