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
    this.pouchName = this.getAttribute("pouch-name");
    this.subscribe(`runePouch:${playerName}`, this.handleUpdatedRunePouch.bind(this));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  handleUpdatedRunePouch(runePouch) {
    this.runePouch = runePouch;
    this.render();

    let runeEls = document.createDocumentFragment();
    let tooltipRunes = [];
    for (const rune of this.runePouch) {
      const runeEl = document.createElement("div");
      runeEl.classList.add("rune-pouch__rune");

      if (rune.id > 0) {
        const itemBox = document.createElement("item-box");
        itemBox.setAttribute("very-short-quantity", "true");
        itemBox.setAttribute("no-tooltip", "true");
        itemBox.item = rune;
        runeEl.appendChild(itemBox);

        tooltipRunes.push(`${rune.quantity.toLocaleString()} ${rune.name}`);
      }

      runeEls.appendChild(runeEl);
    }

    this.appendChild(runeEls);

    this.enableTooltip();
    this.tooltipText = `${this.pouchName}<br />${tooltipRunes.join("<br />")}`;
  }
}

customElements.define("rune-pouch", RunePouch);
