import { BaseElement } from "../base-element/base-element";
import { guildData } from "../data/guild-data";
// eslint-disable-next-line no-unused-vars
import { Item } from "../data/item";

export class ItemBox extends BaseElement {
  constructor() {
    super();
  }

  html() {
    return `{{item-box.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.playerName = this.getAttribute("player-name");
    this.quantity = this.item.quantity;
    this.itemId = this.item.id;

    this.enableTooltip();
    const inventoryType = this.getAttribute("inventory-type");
    const totalInventoryQuantity = guildData.inventoryQuantityForItem(this.item.id, this.playerName, inventoryType);
    const stackHighAlch = totalInventoryQuantity * this.item.highAlch;
    const stackGePrice = totalInventoryQuantity * this.item.gePrice;

    this.tooltipText = `
${this.item.name} x ${totalInventoryQuantity}
<br />
HA: ${stackHighAlch.toLocaleString()}
<br />
GE: ${stackGePrice.toLocaleString()}`;

    this.render();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }
}
customElements.define("item-box", ItemBox);
