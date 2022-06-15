import { pubsub } from "./pubsub";
import { MemberData } from "./member-data";
import quickselect from "../quick-select";
import { Item } from "./item";

class GroupData {
  constructor() {
    this.members = new Map();
    this.groupItems = {};
    this.textFilters = [""];
    this.playerFilter = "@ALL";
  }

  update(groupData) {
    groupData.sort((a, b) => a.name.localeCompare(b.name));
    let membersUpdated = false;
    const removedMembers = new Set(this.members.keys());

    let updatedAttributes = new Set();
    let lastUpdated = new Date(0);
    for (const memberData of groupData) {
      const memberName = memberData.name;
      removedMembers.delete(memberName);
      if (!this.members.has(memberName)) {
        this.members.set(memberName, new MemberData(memberName));
        membersUpdated = true;
      }

      const member = this.members.get(memberName);
      member.update(memberData).forEach((attribute) => updatedAttributes.add(attribute));

      if (member.lastUpdated && member.lastUpdated > lastUpdated) {
        lastUpdated = member.lastUpdated;
      }
    }

    for (const removedMember of removedMembers.values()) {
      this.members.delete(removedMember);
      membersUpdated = true;
    }

    let anyItemUpdates = false;
    if (removedMembers.size > 0) {
      for (const groupItem of Object.values(this.groupItems)) {
        for (const removedMember of removedMembers.values()) {
          if (groupItem.quantities?.[removedMember]) {
            groupItem.quantity -= groupItem.quantities[removedMember];

            if (groupItem.quantity === 0) {
              delete this.groupItems[groupItem.id];
            } else {
              delete groupItem.quantities[removedMember];
            }
            anyItemUpdates = true;
          }
        }
      }
    }

    let receivedItemData =
      updatedAttributes.has("inventory") ||
      updatedAttributes.has("bank") ||
      updatedAttributes.has("equipment") ||
      updatedAttributes.has("runePouch") ||
      updatedAttributes.has("seedVault");

    const encounteredItemIds = new Set();
    if (receivedItemData) {
      for (const item of this.allItems()) {
        encounteredItemIds.add(item.id);
        const previous = this.groupItems[item.id];
        const itemQuantities = this.itemQuantities(item.id);
        if (!this.quantitiesEqual(previous?.quantities, itemQuantities)) {
          let total = 0;
          for (const quantity of Object.values(itemQuantities)) {
            total += quantity;
          }

          let groupItem = this.groupItems[item.id];
          let applyFilter = false;
          if (!groupItem) {
            groupItem = new Item(item.id, 0);
            applyFilter = true;
          }
          groupItem.quantity = total;
          groupItem.quantities = itemQuantities;
          this.groupItems[item.id] = groupItem;

          if (applyFilter) {
            groupItem.visible = this.shouldItemBeVisible(groupItem, this.textFilters, this.playerFilter);
          }

          pubsub.publish(`item-update:${item.id}`, groupItem);
          anyItemUpdates = true;
        }
      }

      for (const item of Object.values(this.groupItems)) {
        if (!encounteredItemIds.has(item.id)) {
          delete this.groupItems[item.id];
          anyItemUpdates = true;
        }
      }
    }

    if (membersUpdated) {
      pubsub.publish("members-updated", [...this.members.values()]);
    }

    if (anyItemUpdates) {
      pubsub.publish("items-updated");
    }

    return new Date(lastUpdated.getTime() + 1);
  }

  convertFilterToFilterList(filter) {
    if (!filter.includes("|")) return [filter];
    const splitFilters = filter.split("|");
    const resultFilters = [];
    splitFilters.forEach((splitFilter) => {
      const trimmedFilter = splitFilter.trim();
      if (trimmedFilter.length !== 0) {
        resultFilters.push(trimmedFilter);
      }
    });
    return resultFilters;
  }

  isExactItem(item, filter) {
    const [_, filterWord, ...rest] = filter.split('"');

    // Normal item search
    if (item.name.toLowerCase() === filterWord || item.id.toString() === filterWord) {
      return true;
    }
    return false;
  }

  passesTextFilter(item, textFilters) {
    for (const filter of textFilters) {
      // Exact search
      if (filter.startsWith('"') && filter.endsWith('"') && this.isExactItem(item, filter)) {
        return true;
        // Normal item search
      } else if (filter.length === 0 || item.name.toLowerCase().includes(filter) || item.id.toString() === filter) {
        return true;
      }
    }
    return false;
  }

  passesPlayerFilter(item, playerFilter) {
    return playerFilter === "@ALL" || item.quantities[playerFilter] === undefined || item.quantities[playerFilter] > 0;
  }

  shouldItemBeVisible(item, textFilters, playerFilter) {
    if (!item || !item.quantities) return false;

    return this.passesTextFilter(item, textFilters) && this.passesPlayerFilter(item, playerFilter);
  }

  applyTextFilter(textFilter) {
    const textFilters = this.convertFilterToFilterList(textFilter);
    this.textFilters = textFilters;
    const items = Object.values(this.groupItems);
    for (const item of items) {
      item.visible = this.shouldItemBeVisible(item, textFilters, this.playerFilter);
    }
  }

  applyPlayerFilter(playerFilter) {
    this.playerFilter = playerFilter;
    const items = Object.values(this.groupItems);
    for (const item of items) {
      item.visible = this.shouldItemBeVisible(item, this.textFilters, playerFilter);
    }
  }

  itemQuantities(itemId) {
    let result = {};
    for (const member of this.members.values()) {
      result[member.name] = member.totalItemQuantity(itemId);
    }

    return result;
  }

  inventoryQuantityForItem(itemId, memberName, inventoryType) {
    return this.members.get(memberName)?.itemQuantities?.[inventoryType]?.get(itemId) || 0;
  }

  quantitiesEqual(a, b) {
    if (!a || !b) return false;
    for (const member of this.members.values()) {
      if (a[member.name] !== b[member.name]) return false;
    }
    return true;
  }

  *allItems() {
    const yieldedIds = new Set();
    for (const member of this.members.values()) {
      for (const item of member.allItems()) {
        if (!yieldedIds.has(item.id)) {
          yieldedIds.add(item.id);
          yield item;
        }
      }
    }
  }
}
const groupData = new GroupData();

export { groupData };
