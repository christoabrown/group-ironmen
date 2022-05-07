import { utility } from "../utility";
import { pubsub } from "./pubsub";

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

  get imageUrl() {
    const itemDetails = Item.itemDetails[this.id];
    let imageId = itemDetails.id;
    if (itemDetails.stacks) {
      for (const stack of itemDetails.stacks) {
        if (this.quantity >= stack.count) {
          imageId = stack.id;
        }
      }
    }
    return `/icons/items/${imageId}.webp`;
  }

  get shortQuantity() {
    return utility.formatShortQuantity(this.quantity);
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

  isValid() {
    return this.id > 0;
  }

  static parseItemData(data) {
    const result = [];
    for (let i = 0; i < data.length; ++i) {
      if (data[i].id === 0) {
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

  static randomItem(quantity = null) {
    const keys = Object.keys(Item.itemDetails);
    const key = keys[(keys.length * Math.random()) << 0];
    const item = Item.itemDetails[key];
    return { id: item.id, quantity: quantity ? quantity : Math.round(Math.random() * 100000 + 1) };
  }

  static randomItems(count, quantity) {
    let result = [];
    for (let i = 0; i < count; ++i) {
      result.push(Item.randomItem(quantity));
    }
    return result;
  }
}
