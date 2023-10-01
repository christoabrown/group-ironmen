import { api } from "./api";

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

      this.unlockedItemsCountByPage.set(log.page_id, itemSet.size);
    }
  }

  isLogComplete(pageId) {
    return this.unlockedItemsCountByPage.get(pageId) === collectionLog.pageItems.get(pageId).length;
  }

  completionStateClass(pageId) {
    const unlockedItemsCount = this.unlockedItemsCountByPage.get(pageId);
    const totalItemsInPage = collectionLog.pageItems.get(pageId).length;
    if (totalItemsInPage === unlockedItemsCount) {
      return "collection-log__complete";
    } else if (unlockedItemsCount > 0) {
      return "collection-log__in-progress";
    }

    return "collection-log__not-started";
  }

  getPage(pageId) {
    return this.logs.find((log) => log.page_id === pageId);
  }
}

class CollectionLog {
  constructor() {}

  async initLogInfo() {
    if (this.info) return;
    this.info = await api.getCollectionLogInfo();

    this.pageItems = new Map();
    for (const item of this.info.items) {
      const pageId = item[0];
      const itemId = item[1];
      if (!this.pageItems.has(pageId)) this.pageItems.set(pageId, []);
      this.pageItems.get(pageId).push(itemId);
    }
  }

  async load() {
    this.playerLogs = new Map();

    const apiResponse = await api.getCollectionLog();
    for (const [playerName, logs] of Object.entries(apiResponse)) {
      this.playerLogs.set(playerName, new PlayerLog(playerName, logs));
    }

    this.playerNames = Array.from(this.playerLogs.keys());
  }

  loadPlayer(playerName) {
    // Storing this here so we don't have to create a bunch of copies in the collection-log-item component
    this.otherPlayers = this.playerNames.filter((x) => x !== playerName);
  }

  isLogComplete(playerName, pageId) {
    const playerLog = this.playerLogs.get(playerName);
    return playerLog?.isLogComplete(pageId) || false;
  }

  completionStateClass(playerName, pageId) {
    const playerLog = this.playerLogs.get(playerName);
    return playerLog?.completionStateClass(pageId) || "collection-log__not-started";
  }

  // The amount of unique items in the game's collection log, not from the player unlocks
  totalUniqueItems() {
    return new Set(this.info.items.map((item) => item[1])).size;
  }

  totalUnlockedItems(playerName) {
    const playerLog = this.playerLogs.get(playerName);
    return playerLog?.unlockedItems.size || 0;
  }

  pageSize(pageId) {
    return this.pageItems.get(pageId).length;
  }

  completionCountForPage(playerName, pageId) {
    const playerLog = this.playerLogs.get(playerName);
    return playerLog?.unlockedItemsCountByPage.get(pageId) || 0;
  }

  pageInfo(pageId) {
    return this.info.pages.find((page) => page[1] === pageId);
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
