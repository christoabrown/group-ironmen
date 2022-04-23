import { BaseElement } from "../base-element/base-element";
import { groupData } from "../data/group-data";

export class ItemBox extends BaseElement {
  constructor() {
    super();
  }

  html() {
    return `{{item-box.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.enableTooltip();
    const playerName = this.getAttribute("player-name");
    const inventoryType = this.getAttribute("inventory-type");
    const totalInventoryQuantity = groupData.inventoryQuantityForItem(this.item.id, playerName, inventoryType);
    const stackHighAlch = totalInventoryQuantity * this.item.highAlch;
    this.setAttribute(
      "tooltip-text",
      `${this.item.name} x ${totalInventoryQuantity}<br />HA: ${stackHighAlch.toLocaleString()}`
    );
    this.render();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }
}
customElements.define("item-box", ItemBox);
