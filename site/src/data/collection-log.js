import { utility } from "../utility";

// NOTE: The collection log has duplicate versions of items on different pages with different
// items ids for some reason. Not sure how this is counted correctly in the game client, but
// here they are mapped and subtracted from the totals for the player unlocked counts.
const duplicateCollectionLogItems = new Map([
  // Duplicate mining outfit from volcanic mine and motherlode mine pages
  [29472, 12013], // Prospector helmet
  [29474, 12014], // Prospector jacket
  [29476, 12015], // Prospector legs
  [29478, 12016], // Prospector boots
]);

class PlayerLog {
  constructor(playerName, items) {
    this.unlockedItems = new Map();
    this.unlockedItemsCountByPage = new Map();
    if (items) {
      for (const item of items) {
        if (collectionLog.duplicateMapping.has(item.id)) {
          item.id = collectionLog.duplicateMapping.get(item.id);

          if (this.unlockedItems.has(item.id)) {
            item.quantity += this.unlockedItems.get(item.id);
          }
        }
        this.unlockedItems.set(item.id, item.quantity);
      }
    }

    for (const tab of collectionLog.info) {
      for (const page of tab.pages) {
        const pageItems = collectionLog.pageItems.get(page.name);
        let pageItemCount = 0;
        for (const item of pageItems) {
          if (this.unlockedItems.get(item.id) > 0) ++pageItemCount;
        }

        this.unlockedItemsCountByPage.set(page.name, pageItemCount);
      }
    }
  }

  isLogComplete(pageName) {
    return this.unlockedItemsCountByPage.get(pageName) === collectionLog.pageItems.get(pageName).length;
  }

  completionStateClass(pageName) {
    const unlockedItemsCount = this.unlockedItemsCountByPage.get(pageName);
    const totalItemsInPage = collectionLog.pageItems.get(pageName).length;
    if (totalItemsInPage === unlockedItemsCount) {
      return "collection-log__complete";
    } else if (unlockedItemsCount > 0) {
      return "collection-log__in-progress";
    }

    return "collection-log__not-started";
  }

  getPage(pageName) {
    return this.logs.find((log) => log.page_name === pageName);
  }
}

class CollectionLog {
  constructor() {}

  async initLogInfo() {
    if (this.info) return;
    const [collectionLogInfo, collectionLogDuplicates] = await Promise.all([
      fetch("/data/collection_log_info.json"),
      fetch("/data/collection_log_duplicates.json"),
    ]);

    const duplicateMapping = await collectionLogDuplicates.json();
    const reverseMapping = new Map();
    for (const [itemId, dupeItemIds] of Object.entries(duplicateMapping)) {
      for (const dupeItemId of dupeItemIds) {
        const a = parseInt(dupeItemId, 10);
        if (reverseMapping.has(a)) {
          continue;
        }
        reverseMapping.set(a, parseInt(itemId, 10));
      }
    }
    this.info = await collectionLogInfo.json();
    this.duplicateMapping = reverseMapping;
    this.pageItems = new Map();

    const uniqueItems = new Set();

    for (const tab of this.info) {
      for (const page of tab.pages) {
        page.items.forEach((item) => uniqueItems.add(item.id));
        this.pageItems.set(page.name, page.items);

        page.sortName = utility.removeArticles(page.name);
      }
    }

    this.totalUniqueItems = uniqueItems.size - duplicateCollectionLogItems.size;
  }

  async load(groupData) {
    this.playerLogs = new Map();

    for (const member of groupData.members.values()) {
      if (member.name === "@SHARED") continue;
      this.playerLogs.set(member.name, new PlayerLog(member.name, member.collectionLog));
    }

    this.playerNames = Array.from(this.playerLogs.keys());
  }

  tabName(tabId) {
    switch (tabId) {
      case 0:
        return "Bosses";
      case 1:
        return "Raids";
      case 2:
        return "Clues";
      case 3:
        return "Minigames";
      case 4:
        return "Other";
    }
  }

  loadPlayer(playerName) {
    // Storing this here so we don't have to create a bunch of copies in the collection-log-item component
    this.otherPlayers = this.playerNames.filter((x) => x !== playerName);
  }

  isLogComplete(playerName, pageName) {
    const playerLog = this.playerLogs.get(playerName);
    return playerLog?.isLogComplete(pageName) || false;
  }

  completionStateClass(playerName, pageName) {
    const playerLog = this.playerLogs.get(playerName);
    return playerLog?.completionStateClass(pageName) || "collection-log__not-started";
  }

  totalUnlockedItems(playerName) {
    const playerLog = this.playerLogs.get(playerName);

    const unlockedItems = playerLog?.unlockedItems;
    let unlockedItemsCount = 0;
    if (unlockedItems) {
      unlockedItemsCount = playerLog.unlockedItems.size;
      for (const [a, b] of duplicateCollectionLogItems.entries()) {
        if (unlockedItems.has(a) && unlockedItems.has(b)) {
          --unlockedItemsCount;
        }
      }
    }

    return unlockedItemsCount;
  }

  pageSize(pageName) {
    return this.pageItems.get(pageName).length;
  }

  completionCountForPage(playerName, pageName) {
    const playerLog = this.playerLogs.get(playerName);
    return playerLog?.unlockedItemsCountByPage.get(pageName) || 0;
  }

  pageInfo(pageName) {
    for (const tab of this.info) {
      for (const page of tab.pages) {
        if (page.name === pageName) return page;
      }
    }

    return null;
  }

  unlockedItemCount(playerName, itemId) {
    return this.playerLogs.get(playerName)?.unlockedItems.get(itemId) || 0;
  }

  isItemUnlocked(playerName, itemId) {
    return this.playerLogs.get(playerName)?.unlockedItems.has(itemId) || false;
  }
}

const collectionLog = new CollectionLog();

export { collectionLog };
