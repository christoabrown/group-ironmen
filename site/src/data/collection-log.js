import { api } from "./api";

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

  async loadPlayer(playerName) {
    this.logs = await api.getCollectionLog(playerName);

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
    return this.unlockedItemsCountByPage.get(pageId) === this.pageItems.get(pageId).length;
  }

  completionStateClass(pageId) {
    const unlockedItemsCount = this.unlockedItemsCountByPage.get(pageId);
    const totalItemsInPage = this.pageItems.get(pageId).length;
    if (totalItemsInPage === unlockedItemsCount) {
      return "collection-log__complete";
    } else if (unlockedItemsCount > 0) {
      return "collection-log__in-progress";
    }

    return "collection-log__not-started";
  }
}

const collectionLog = new CollectionLog();

export { collectionLog };
