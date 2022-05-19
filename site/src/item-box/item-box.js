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
    this.playerName = this.getAttribute("player-name");
    const inventoryType = this.getAttribute("inventory-type");
    const totalInventoryQuantity = groupData.inventoryQuantityForItem(this.item.id, this.playerName, inventoryType);
    const stackHighAlch = totalInventoryQuantity * this.item.highAlch;
    const stackGePrice = totalInventoryQuantity * this.item.gePrice;
    this.setAttribute(
      "tooltip-text",
      `
${this.item.name} x ${totalInventoryQuantity}
<br />
HA: ${stackHighAlch.toLocaleString()}
<br />
GE: ${stackGePrice.toLocaleString()}`
    );
    this.render();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }
}
customElements.define("item-box", ItemBox);
