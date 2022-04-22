import { BaseElement } from "../base-element/base-element";
import { Item } from "../data/item";
import { Quest } from "../data/quest";
import { api } from "../data/api";
import { storage } from "../data/storage";
import { pubsub } from "../data/pubsub";
import { loadingScreenManager } from "../loading-screen/loading-screen-manager";

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
    const group = storage.getGroup();
    await Promise.all([Item.loadItems(), Quest.loadQuests()]);

    if (this.isConnected) {
      const firstDataEvent = pubsub.waitUntilNextEvent("get-group-data", false);
      api.enable(group.groupName, group.groupToken);
      await firstDataEvent;
      loadingScreenManager.hideLoadingScreen();
    }
  }
}

customElements.define("app-initializer", AppInitializer);
