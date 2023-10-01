import { pubsub } from "./pubsub";

export class ItemData {
  static async loadItems() {
    ItemData.items = {};

    const itemDataResponse = await fetch("/data/item_data.json");
    ItemData.items.itemDetails = await itemDataResponse.json();

    const itemVariationsResponse = await fetch("/data/item_variations.json");
    ItemData.items.itemVariations = await itemVariationsResponse.json();

    ItemData.items.runeliteKeyList = {};

    for (const [itemId, itemDetails] of Object.entries(ItemData.items.itemDetails)) {
      const stacks = itemDetails.stacks;
      itemDetails.stacks = stacks ? stacks.map((stack) => ({ id: stack[1], count: stack[0] })) : null;
      itemDetails.id = itemId;

      ItemData.items.runeliteKeyList[itemDetails.runeliteKey] = itemId;
    }

    pubsub.publish("item-data-loaded");
  }

  static itemDetails() {
    return ItemData.items.itemDetails;
  }

  static itemVariations() {
    return ItemData.items.itemVariations;
  }

  static runeliteKeyList() {
    return ItemData.items.runeliteKeyList;
  }
}
