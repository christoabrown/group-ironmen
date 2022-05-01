import { BaseElement } from "../base-element/base-element";

export class RunePouch extends BaseElement {
  constructor() {
    super();
  }

  html() {
    return `{{rune-pouch.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    const playerName = this.getAttribute("player-name");
    this.subscribe(`runePouch:${playerName}`, this.handleUpdatedRunePouch.bind(this));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  handleUpdatedRunePouch(runePouch) {
    this.runePouch = runePouch;
    this.render();
  }
}

customElements.define("rune-pouch", RunePouch);
