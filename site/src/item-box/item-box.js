import { BaseElement } from "../base-element/base-element";
import { groupData } from "../data/group-data";
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
    this.noTooltip = this.hasAttribute("no-tooltip");
    this.playerName = this.getAttribute("player-name");
    this.veryShortQuantity = this.hasAttribute("very-short-quantity");
    this.quantity = this.item?.quantity || parseInt(this.getAttribute("item-quantity"));
    this.itemId = this.item?.id || parseInt(this.getAttribute("item-id"));

    if (!this.noTooltip) {
      this.enableTooltip();
      if (this.item) {
        const inventoryType = this.getAttribute("inventory-type");
        const totalInventoryQuantity = groupData.inventoryQuantityForItem(this.item.id, this.playerName, inventoryType);
        const stackHighAlch = totalInventoryQuantity * this.item.highAlch;
        const stackGePrice = totalInventoryQuantity * this.item.gePrice;

        this.tooltipText = `
${this.item.name} x ${totalInventoryQuantity}
<br />
HA: ${stackHighAlch.toLocaleString()}
<br />
GE: ${stackGePrice.toLocaleString()}`;
      } else {
        this.tooltipText = `${Item.itemName(this.itemId)} x ${this.quantity.toLocaleString()}`;
      }
    }

    this.render();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }
}
customElements.define("item-box", ItemBox);
