import { BaseElement } from "../base-element/base-element";
import { guildData } from "../data/guild-data";
import { colorForName } from "../data/player-colors";

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
    const hue = guildData.members.get(playerName)?.hue ?? colorForName(playerName).hue;
    this.style.setProperty("--player-icon-color", `${hue}deg`);
    this.render();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }
}

customElements.define("player-icon", PlayerIcon);
