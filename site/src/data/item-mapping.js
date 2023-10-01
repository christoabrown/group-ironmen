import { ItemMappingList } from './item-mapping-list';
import { ItemData } from './item-data';

export function map(Item, itemId) {
    if (! this.mappings) {
        let invertedVariations = {};

        Object.keys(ItemData.itemVariations()).forEach(key => {
            if (key === 'default') {
                return;
            }

            ItemData.itemVariations()[key].forEach(variation => {
                ItemData.itemVariations()[key].forEach(id => {
                    invertedVariations[variation] = invertedVariations[variation] || [];
                    invertedVariations[variation].push(id);
                });
            });
        });

        this.mappings = new Map();

        for (const item of Object.values(ItemMappingList.mapping())) {
            for (const itemId of item.untradableItems) {
                if (item.includeVariations) {
                    const variations = invertedVariations[itemId] || [itemId];

                    for (const variation of variations) {
                        if (variation !== item.tradeableItem) {
                            if (! this.mappings.has(variation)) {
                                this.mappings.set(variation, []);
                            }

                            this.mappings.get(variation).push(item);
                        }
                    }
                } else {
                    if (! this.mappings.has(itemId)) {
                        this.mappings.set(itemId, []);
                    }

                    this.mappings.get(itemId).push(item);
                }
            }
        }
    }

    const mapping = this.mappings.get(itemId);
    return mapping && mapping.length > 0 ? mapping : null;
}
