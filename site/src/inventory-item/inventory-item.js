import { BaseElement } from "../base-element/base-element";
import { groupData } from "../data/group-data";

export class InventoryItem extends BaseElement {
  constructor() {
    super();
  }

  connectedCallback() {
    super.connectedCallback();
    const itemId = this.getAttribute("item-id");
    this.subscribe(`item-update:${itemId}`, this.handleUpdatedItem.bind(this));
  }

  html() {
    const item = this.item;
    let playerHtml = "";
    const totalQuantity = item.quantity;

    for (const [playerName, quantity] of Object.entries(item.quantities)) {
      if (quantity === 0) continue;
      const quantityPercent = Math.round((quantity / totalQuantity) * 100);
      playerHtml += `
<span class="${quantity === 0 ? "inventory-item__no-quantity" : ""}">${playerName}</span>
<span>${quantity.toLocaleString()}</span>
<div class="inventory-item__quantity-bar"
     style="transform: scaleX(${quantityPercent}%); background: hsl(${quantityPercent}, 100%, 40%);">
</div>
`;
    }

    return `{{inventory-item.html}}`;
  }

  handleUpdatedItem(item) {
    this.item = item;
    this.render();
  }
}
customElements.define("inventory-item", InventoryItem);
