import { utility } from "../utility";
import { pubsub } from "./pubsub";

export class Item {
  constructor(id, quantity) {
    this.id = id;
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
    for (let i = 0; i < data.length; ++i) {
      data[i] = new Item(data[i].id, data[i].quantity);
    }

    return data;
  }

  static async loadItems() {
    const response = await fetch("/data/item_data.json");
    Item.itemDetails = await response.json();
    for (const [itemId, itemDetails] of Object.entries(Item.itemDetails)) {
      const stacks = itemDetails.stacks;
      const duplicates = itemDetails.duplicates || [];
      itemDetails.stacks = stacks ? stacks.map((stack) => ({ id: stack[1], count: stack[0] })) : null;
      itemDetails.id = itemId;
      for (const duplicateId of duplicates) {
        Item.itemDetails[duplicateId] = itemDetails;
      }
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
