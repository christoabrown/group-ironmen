import { utility } from "../utility";
import { pubsub } from "./pubsub";
import { api } from "./api";
import { itemIconUrl } from "./icons";

export class Item {
  constructor(id, quantity) {
    if (typeof id === "string") {
      this.id = parseInt(id);
    } else {
      this.id = id;
    }
    this.quantity = quantity;
  }

  static imageUrl(itemId, quantity) {
    const itemDetails = Item.itemDetails?.[itemId];
    let imageId = itemDetails?.id ?? itemId;
    if (itemDetails?.stacks) {
      for (const stack of itemDetails.stacks) {
        if (quantity >= stack.count) {
          imageId = stack.id;
        }
      }
    }
    return itemIconUrl(imageId);
  }

  static shortQuantity(quantity) {
    return utility.formatShortQuantity(quantity);
  }

  get name() {
    return Item.itemDetails[this.id].name;
  }

  get highAlch() {
    return Item.itemDetails[this.id].highalch;
  }

  get gePrice() {
    return Item.gePrices[this.id] || 0;
  }

  isValid() {
    return this.id > 0;
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
        result.push(new Item(0, 0));
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
}
