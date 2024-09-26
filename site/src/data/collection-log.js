import { api } from "./api";
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
  constructor(playerName, logs) {
    this.logs = logs;
    this.unlockedItems = new Map();
    this.unlockedItemsCountByPage = new Map();
    for (const log of this.logs) {
      const items = log.items;
      const newItems = log.new_items;
      const itemSet = new Set();

      for (const itemId of newItems) {
        itemSet.add(itemId);
        this.unlockedItems.set(itemId, 1);
      }
      for (let i = 0; i < items.length; i += 2) {
        this.unlockedItems.set(items[i], items[i + 1]);
        itemSet.add(items[i]);
      }

      this.unlockedItemsCountByPage.set(log.page_name, itemSet.size);
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
    this.info = await api.getCollectionLogInfo();
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

  async load() {
    this.playerLogs = new Map();

    const apiResponse = await api.getCollectionLog();
    for (const [playerName, logs] of Object.entries(apiResponse)) {
      this.playerLogs.set(playerName, new PlayerLog(playerName, logs));
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
