import { BaseElement } from "../base-element/base-element";
import { Item } from "../data/item";
import { api } from "../data/api";
import { storage } from "../data/storage";
import { pubsub } from "../data/pubsub";
import { loadingScreenManager } from "../loading-screen/loading-screen-manager";
import { liveEvents } from "../data/live-events";
import { selection } from "../data/selection";
import { loadRegions } from "../data/regions";
import { groupData } from "../data/group-data";

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
    liveEvents.stop();
    selection.reset();
    // Unpublish everything to prevent any data leaking over into another session
    pubsub.unpublishAll();
    loadingScreenManager.hideLoadingScreen();
  }

  async initializeApp() {
    this.cleanup();
    loadingScreenManager.showLoadingScreen();
    await Promise.all([Item.loadItems(), Item.loadGePrices()]);
    // Place names aren't needed to show the map; fill them in when they arrive.
    loadRegions().then(() => groupData.refreshRegions());

    const session = storage.getSession();

    // Make sure this component is still connected after loading the above.
    if (this.isConnected) {
      if (session.sessionToken) {
        await this.loadWithSession(session);
      } else {
        window.history.pushState("", "", "/login");
      }

      loadingScreenManager.hideLoadingScreen();
    }
  }

  async loadWithSession(session) {
    api.setSession(session.sessionToken, session.username, session.role);
    api.loadFeatures().then((features) => {
      if (features.hub_history && this.isConnected) liveEvents.start();
    });
    const firstDataEvent = pubsub.waitUntilNextEvent("get-group-data", false);
    await api.enable();
    await firstDataEvent;
  }
}

customElements.define("app-initializer", AppInitializer);
