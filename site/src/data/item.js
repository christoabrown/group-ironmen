import { utility } from "../utility";
import { pubsub } from "./pubsub";
import { api } from "./api";

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
    const itemDetails = Item.itemDetails[itemId];
    let imageId = itemDetails.id;
    if (itemDetails.stacks) {
      for (const stack of itemDetails.stacks) {
        if (quantity >= stack.count) {
          imageId = stack.id;
        }
      }
    }
    return utility.image(`/icons/items/${imageId}.webp`);
  }

  static itemName(itemId) {
    return Item.itemDetails[itemId].name;
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
    return Item.itemDetails[this.id].name;
  }

  get wikiLink() {
    return `https://oldschool.runescape.wiki/w/Special:Lookup?type=item&id=${this.id}`;
  }

  get highAlch() {
    return Item.itemDetails[this.id].highalch;
  }

  get gePrice() {
    if (this.id == 995) {
      // coin
      return 1;
    }

    if (this.id == 13204) {
      // platinum token
      return 1000;
    }

    const mapping = Item.itemDetails[this.id].mapping;

    if (!mapping) {
      return Item.gePrices[this.id] || 0;
    }

    return mapping.reduce((total, mapping) => {
      return total + new Item(mapping.id, 1).gePrice * mapping.quantity;
    }, 0);
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

      if (!Item.itemDetails[data[i].id]) {
        console.warn(`Unrecognized item id: ${data[i].id}`);
        continue;
      }

      const item = new Item(data[i].id, data[i].quantity);
      result.push(item);
    }

    return result;
  }

  static async loadItems() {
    const response = await fetch("/data/item_data.json");
    Item.itemDetails = await response.json();
    for (const [itemId, itemDetails] of Object.entries(Item.itemDetails)) {
      const stacks = itemDetails.stacks;
      itemDetails.stacks = stacks ? stacks.map((stack) => ({ id: stack[1], count: stack[0] })) : null;
      itemDetails.id = itemId;
    }

    pubsub.publish("item-data-loaded");
  }

  static async loadGePrices() {
    const response = await api.getGePrices();
    Item.gePrices = await response.json();
  }

  static randomItem(quantity = null) {
    const keys = Object.keys(Item.itemDetails);
    const key = keys[(keys.length * Math.random()) << 0];
    const item = Item.itemDetails[key];
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
