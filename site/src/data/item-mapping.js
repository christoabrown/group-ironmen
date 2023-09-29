import { itemMappings } from "./item-mapping-list";
let invertedVariations = {};

Object.keys(Item.itemVariations).forEach(key => {
    if (key === 'default') {
        return;
    }

    Item.itemVariations[key].forEach(variation => {
        Item.itemVariations[key].forEach(id => {
            invertedVariations[variation] = invertedVariations[variation] || [];
            invertedVariations[variation].push(id);
        });
    });
});

const mappings = new Map();

for (const item of Object.values(itemMappings)) {
  for (const itemId of item.untradableItems) {
    if (item.includeVariations) {
      const variations = invertedVariations[itemId] || [itemId];
      
      for (const variation of variations) {
        if (variation !== item.tradeableItem) {
          if (! mappings.has(variation)) {
            mappings.set(variation, []);
          }

          mappings.get(variation).push(item);
        }
      }
    } else {
      if (! mappings.has(itemId)) {
        mappings.set(itemId, []);
      }

      mappings.get(itemId).push(item);
    }
  }
}

export function map(Item, itemId) {
  const mapping = mappings.get(itemId);
  return mapping && mapping.length > 0 ? mapping : null;
}
