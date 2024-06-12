import { pubsub } from "./pubsub";
import { MemberData } from "./member-data";
import { Item } from "./item";
import { SkillName } from "./skill";
import { QuestState, Quest } from "./quest";
import { utility } from "../utility";

export class GroupData {
  constructor() {
    this.members = new Map();
    this.groupItems = {};
    this.textFilter = "";
    this.textFilters = [""];
    this.playerFilter = "@ALL";
  }

  update(groupData) {
    this.transformFromStorage(groupData);
    groupData.sort((a, b) => a.name.localeCompare(b.name));
    const removedMembers = new Set(this.members.keys());

    let updatedAttributes = new Set();
    let lastUpdated = new Date(0);
    for (const memberData of groupData) {
      const memberName = memberData.name;
      removedMembers.delete(memberName);
      if (!this.members.has(memberName)) {
        this.members.set(memberName, new MemberData(memberName));
      }

      const member = this.members.get(memberName);
      member.update(memberData).forEach((attribute) => updatedAttributes.add(attribute));

      if (member.lastUpdated && member.lastUpdated > lastUpdated) {
        lastUpdated = member.lastUpdated;
      }
    }

    for (const removedMember of removedMembers.values()) {
      this.members.delete(removedMember);
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

    const [lastMemberListPublished] = pubsub.getMostRecent("members-updated") || [];
    const previousNames = lastMemberListPublished?.map((x) => x.name);
    const currentNames = [...this.members.values()].map((x) => x.name);
    const membersUpdated = !utility.setsEqual(new Set(currentNames), new Set(previousNames));
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
    const filterWord = filter.replaceAll('"', "");

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
    this.textFilter = textFilter || "";
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

  static transformItemsFromStorage(items) {
    if (items === undefined || items === null) return;

    let result = [];
    for (let i = 0; i < items.length; i += 2) {
      result.push({
        id: items[i],
        quantity: items[i + 1],
      });
    }
    return result;
  }

  static transformSkillsFromStorage(skills) {
    if (skills === undefined || skills === null) return;

    let result = {};
    let i = 0;
    let overall = 0;
    // NOTE: Overall xp was removed from the API response, but keeping this here so it still
    // works for data that was stored before that change.
    const hasOverallXp = skills.length !== 23;
    for (const skillName of Object.keys(SkillName)) {
      if (skillName !== SkillName.Overall || hasOverallXp) {
        result[skillName] = skills[i];

        if (skillName !== SkillName.Overall) {
          overall += skills[i];
        }

        i += 1;
      }
    }

    result[SkillName.Overall] = overall;
    return result;
  }

  static transformStatsFromStorage(stats) {
    if (stats === undefined || stats === null) return;

    return {
      hitpoints: {
        current: stats[0],
        max: stats[1],
      },
      prayer: {
        current: stats[2],
        max: stats[3],
      },
      energy: {
        current: stats[4],
        max: 10000,
      },
      world: stats[6],
    };
  }

  static transformCoordinatesFromStorage(coordinates) {
    if (coordinates === undefined || coordinates === null) return;

    // NOTE: The coordinates from runelite seems to have changed? Need to
    // offset them now to line them up with the map.
    const xOffset = 128;
    const yOffset = 1;
    return {
      x: coordinates[0] + xOffset,
      y: coordinates[1] + yOffset,
      plane: coordinates[2],
    };
  }

  static transformQuestsFromStorage(quests) {
    if (quests === undefined || quests === null) return;

    const result = {};
    const questStates = Object.keys(QuestState);
    const questIds = Quest.questIds;
    for (let i = 0; i < quests.length; ++i) {
      const questState = quests[i];
      const questId = questIds[i];
      result[questId] = questStates[questState];
    }
    return result;
  }

  transformFromStorage(groupData) {
    for (const memberData of groupData) {
      memberData.inventory = GroupData.transformItemsFromStorage(memberData.inventory);
      memberData.bank = GroupData.transformItemsFromStorage(memberData.bank);
      memberData.equipment = GroupData.transformItemsFromStorage(memberData.equipment);
      memberData.rune_pouch = GroupData.transformItemsFromStorage(memberData.rune_pouch);
      memberData.seed_vault = GroupData.transformItemsFromStorage(memberData.seed_vault);
      memberData.skills = GroupData.transformSkillsFromStorage(memberData.skills);
      memberData.stats = GroupData.transformStatsFromStorage(memberData.stats);
      memberData.coordinates = GroupData.transformCoordinatesFromStorage(memberData.coordinates);
      memberData.quests = GroupData.transformQuestsFromStorage(memberData.quests);

      if (memberData.interacting) {
        memberData.interacting.location = GroupData.transformCoordinatesFromStorage([
          memberData.interacting.location.x,
          memberData.interacting.location.y,
          memberData.interacting.location.plane,
        ]);
      }
    }
  }
}
const groupData = new GroupData();

export { groupData };
