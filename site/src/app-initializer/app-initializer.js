import { BaseElement } from "../base-element/base-element";
import { Item } from "../data/item";
import { Quest } from "../data/quest";
import { api } from "../data/api";
import { storage } from "../data/storage";
import { pubsub } from "../data/pubsub";
import { loadingScreenManager } from "../loading-screen/loading-screen-manager";
import { exampleData } from "../data/example-data";
import { AchievementDiary } from "../data/diaries";

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
    this.cleanup();
  }

  cleanup() {
    api.disable();
    // Unpublish everything to prevent any data leaking over into another session
    pubsub.unpublishAll();
    exampleData.disable();
    api.exampleDataEnabled = false;
    loadingScreenManager.hideLoadingScreen();
  }

  async initializeApp() {
    this.cleanup();
    loadingScreenManager.showLoadingScreen();
    await Promise.all([Item.loadItems(), Item.loadGePrices(), Quest.loadQuests(), AchievementDiary.loadDiaries()]);
    const group = storage.getGroup();

    // Make sure this component is still connected after loading the above. We don't want to start
    // making requests for group data if the user navigated away before the preload completed.
    if (this.isConnected) {
      if (group.groupName === "@EXAMPLE") {
        await this.loadExampleData();
      } else {
        await this.loadGroup(group);
      }

      loadingScreenManager.hideLoadingScreen();
    }
  }

  async loadExampleData() {
    exampleData.enable();
    api.exampleDataEnabled = true;
    await api.enable();
  }

  async loadGroup(group) {
    const firstDataEvent = pubsub.waitUntilNextEvent("get-group-data", false);
    await api.enable(group.groupName, group.groupToken);
    await firstDataEvent;
  }
}

customElements.define("app-initializer", AppInitializer);
