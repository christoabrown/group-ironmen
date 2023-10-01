import { ItemMappingList } from "./item-mapping-list";
import { ItemData } from "./item-data";

let mappings = null;

export function map(itemId) {
  if (!mappings) {
    let invertedVariations = {};

    Object.keys(ItemData.itemVariations()).forEach((key) => {
      if (key === "default") {
        return;
      }

      ItemData.itemVariations()[key].forEach((variation) => {
        ItemData.itemVariations()[key].forEach((id) => {
          invertedVariations[variation] = invertedVariations[variation] || [];
          invertedVariations[variation].push(id);
        });
      });
    });

    mappings = new Map();

    for (const item of Object.values(ItemMappingList.mapping())) {
      for (const itemId of item.untradableItems) {
        if (item.includeVariations) {
          const variations = invertedVariations[itemId] || [itemId];

          for (const variation of variations) {
            if (variation !== item.tradeableItem) {
              if (!mappings.has(variation)) {
                mappings.set(variation, []);
              }

              mappings.get(variation).push(item);
            }
          }
        } else {
          if (!mappings.has(itemId)) {
            mappings.set(itemId, []);
          }

          mappings.get(itemId).push(item);
        }
      }
    }
  }

  const mapping = mappings.get(itemId);
  return mapping && mapping.length > 0 ? mapping : null;
}
