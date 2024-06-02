import { BaseElement } from "../base-element/base-element";

export class PlayerInventory extends BaseElement {
  constructor() {
    super();
  }

  html() {
    return `{{player-inventory.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.render();
    this.inventoryEl = this.querySelector(".player-inventory__inventory");
    this.playerName = this.getAttribute("player-name");
    this.subscribe(`inventory:${this.playerName}`, this.handleUpdatedInventory.bind(this));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  handleUpdatedInventory(inventory) {
    const items = document.createDocumentFragment();
    for (let position = 0; position < inventory.length; ++position) {
      const item = inventory[position];
      if (!item.isValid()) continue;
      const row = Math.floor(position / 4);
      const column = position - row * 4;
      const itemEl = document.createElement("item-box");
      itemEl.style.gridColumn = `${column + 1} / ${column + 1}`;
      itemEl.style.gridRow = `${row + 1} / ${row + 1}`;
      itemEl.setAttribute("player-name", this.playerName);
      itemEl.setAttribute("inventory-type", "inventory");
      if (item.isRunePouch()) {
        itemEl.setAttribute("no-tooltip", "true");
      }
      itemEl.item = item;
      items.appendChild(itemEl);
    }

    this.inventoryEl.innerHTML = "";
    this.inventoryEl.appendChild(items);
  }
}
customElements.define("player-inventory", PlayerInventory);
