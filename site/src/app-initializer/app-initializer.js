import { BaseElement } from "../base-element/base-element";
import { Item } from "../data/item";
import { Quest } from "../data/quest";
import { api } from "../data/api";
import { storage } from "../data/storage";
import { pubsub } from "../data/pubsub";
import { loadingScreenManager } from "../loading-screen/loading-screen-manager";
import { exampleData } from "../data/example-data";
import { AchievementDiary } from "../data/diaries";
import { ItemData } from '../data/item-data';

export class AppInitializer extends BaseElement {
  constructor() {
    super();
  }

  html() {
    return `{{app-initializer.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();

    this.initializeApp();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    api.disable();
  }

  async initializeApp() {
    loadingScreenManager.showLoadingScreen();
    await Promise.all([ItemData.loadItems(), Item.loadGePrices(), Quest.loadQuests(), AchievementDiary.loadDiaries()]);
    const group = storage.getGroup();

    if (group.groupName === "@EXAMPLE") {
      exampleData.enable();
      api.exampleDataEnabled = true;
      api.enable();
      loadingScreenManager.hideLoadingScreen();
      return;
    } else {
      exampleData.disable();
      api.exampleDataEnabled = false;
    }

    if (this.isConnected) {
      const firstDataEvent = pubsub.waitUntilNextEvent("get-group-data", false);
      api.enable(group.groupName, group.groupToken);
      await firstDataEvent;
      loadingScreenManager.hideLoadingScreen();
    }
  }
}

customElements.define("app-initializer", AppInitializer);
