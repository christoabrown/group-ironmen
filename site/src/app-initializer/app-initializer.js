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

    // Check for session-based auth first, then legacy
    const session = storage.getSession();
    const group = storage.getGroup();

    // Make sure this component is still connected after loading the above.
    if (this.isConnected) {
      if (group.groupName === "@EXAMPLE") {
        await this.loadExampleData();
      } else if (session.sessionToken) {
        await this.loadWithSession(session);
      } else if (group.groupName && group.groupToken) {
        await this.loadGroup(group);
      } else {
        // No credentials, redirect to login
        window.history.pushState("", "", "/login");
      }

      loadingScreenManager.hideLoadingScreen();
    }
  }

  async loadExampleData() {
    exampleData.enable();
    api.exampleDataEnabled = true;
    api.loadFeatures();
    await api.enable();
  }

  async loadWithSession(session) {
    api.setSession(session.sessionToken, session.username, session.role);
    api.loadFeatures();
    const firstDataEvent = pubsub.waitUntilNextEvent("get-group-data", false);
    await api.enable();
    await firstDataEvent;
  }

  async loadGroup(group) {
    const firstDataEvent = pubsub.waitUntilNextEvent("get-group-data", false);
    await api.enable(group.groupName, group.groupToken);
    await firstDataEvent;
  }
}

customElements.define("app-initializer", AppInitializer);
