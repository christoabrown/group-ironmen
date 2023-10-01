import { utility } from "../utility";
import { api } from "./api";
import { map } from "./item-mapping";
import { ItemData } from "./item-data";

export class Item {
  constructor(id, quantity) {
    if (typeof id === "string") {
      this.id = parseInt(id);
    } else {
      this.id = id;
    }
    this.quantity = quantity;
    this.visible = true;
  }

  static imageUrl(itemId, quantity) {
    const itemDetails = ItemData.itemDetails()[itemId];
    let imageId = itemDetails.id;
    if (itemDetails.stacks) {
      for (const stack of itemDetails.stacks) {
        if (quantity >= stack.count) {
          imageId = stack.id;
        }
      }
    }
    return `/icons/items/${imageId}.webp`;
  }

  static itemName(itemId) {
    return ItemData.itemDetails()[itemId].name;
  }

  static itemId(runeliteKey) {
    return ItemData.runeliteKeyList()[runeliteKey];
  }

  static shortQuantity(quantity) {
    return utility.formatShortQuantity(quantity);
  }

  static veryShortQuantity(quantity) {
    return utility.formatVeryShortQuantity(quantity);
  }

  get imageUrl() {
    return Item.imageUrl(this.id, this.quantity);
  }

  get shortQuantity() {
    return Item.shortQuantity(this.quantity);
  }

  get veryShortQuantity() {
    return Item.veryShortQuantity(this.quantity);
  }

  get name() {
    return ItemData.itemDetails()[this.id].name;
  }

  get wikiLink() {
    return `https://oldschool.runescape.wiki/w/Special:Lookup?type=item&id=${this.id}`;
  }

  get highAlch() {
    return ItemData.itemDetails()[this.id].highalch;
  }

  get gePrice() {
    if (this.id == Item.itemId("COINS_995")) {
      return 1;
    }

    if (this.id == Item.itemId("PLATINUM_TOKEN")) {
      return 1000;
    }

    let price = 0;

    const mappedItems = map(this.id);
    if (this.id == 11849) {
      // console.log(mappedItems);
    }
    if (mappedItems === null) {
      price += Item.gePrices[this.id] || 0;
    } else {
      for (const mappedItem of mappedItems) {
        price += new Item(mappedItem.tradeableItem, 1).gePrice * mappedItem.quantity;
      }
    }

    return price;
  }

  isValid() {
    return this.id > 0;
  }

  isRunePouch() {
    return this.quantity === 1 && (this.id === 12791 || this.id === 27281);
  }

  static parseItemData(data) {
    const result = [];
    for (let i = 0; i < data.length; ++i) {
      if (data[i].id <= 0) {
        result.push(new Item(0, 0));
        continue;
      }

      if (!ItemData.itemDetails()[data[i].id]) {
        console.warn(`Unrecognized item id: ${data[i].id}`);
        continue;
      }

      const item = new Item(data[i].id, data[i].quantity);
      result.push(item);
    }

    return result;
  }

  static async loadGePrices() {
    const response = await api.getGePrices();
    Item.gePrices = await response.json();
  }

  static randomItem(quantity = null) {
    const keys = Object.keys(ItemData.itemDetails());
    const key = keys[(keys.length * Math.random()) << 0];
    const item = ItemData.itemDetails()[key];
    return [item.id, quantity ? quantity : Math.round(Math.random() * 100000 + 1)];
  }

  static randomItems(count, quantity) {
    let result = [];
    for (let i = 0; i < count; ++i) {
      result.push(...Item.randomItem(quantity));
    }
    return result;
  }
}
