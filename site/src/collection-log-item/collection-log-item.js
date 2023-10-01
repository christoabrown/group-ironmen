import { BaseElement } from "../base-element/base-element";
import { collectionLog } from "../data/collection-log";
import { Item } from "../data/item";

export class CollectionLogItem extends BaseElement {
  constructor() {
    super();
  }

  html() {
    return `{{collection-log-item.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.playerName = this.getAttribute("player-name");
    this.itemId = parseInt(this.getAttribute("item-id"));
    this.enableTooltip();

    let tooltipLines = [Item.itemName(this.itemId)];
    for (const playerName of collectionLog.playerNames) {
      const quantity = collectionLog.unlockedItemCount(playerName, this.itemId);
      if (quantity > 0) {
        tooltipLines.push(`<player-icon player-name="${playerName}"></player-icon> ${playerName} - ${quantity}`);
      }
    }
    this.tooltipText = tooltipLines.join("<br >");

    this.otherPlayers = collectionLog.otherPlayers;
    this.render();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }
}

customElements.define("collection-log-item", CollectionLogItem);
