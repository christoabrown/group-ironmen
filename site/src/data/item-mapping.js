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
      for (let untradeableId of item.untradableItems) {
        untradeableId = parseInt(untradeableId);

        if (item.includeVariations) {
          const variations = invertedVariations[untradeableId] || [untradeableId];

          for (let variation of variations) {
            variation = parseInt(variation);

            if (variation != item.tradeableItem) {
              if (!mappings.has(variation)) {
                mappings.set(variation, []);
              }

              mappings.get(variation).push(item);
            }
          }
        } else {
          if (!mappings.has(untradeableId)) {
            mappings.set(untradeableId, []);
          }

          mappings.get(untradeableId).push(item);
        }
      }
    }

    // console.log(JSON.stringify(Object.fromEntries(mappings), null, 4));
  }

  const mapping = mappings.get(parseInt(itemId));
  if (!mapping || !mapping.length) {
    return null;
  }

  return mapping;
}
