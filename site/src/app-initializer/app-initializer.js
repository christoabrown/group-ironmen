import { BaseElement } from "../base-element/base-element";
import { Item } from "../data/item";
import { api } from "../data/api";
import { session } from "../data/session";
import { pubsub } from "../data/pubsub";
import { loadingScreenManager } from "../loading-screen/loading-screen-manager";
import { liveEvents } from "../data/live-events";
import { selection } from "../data/selection";
import { loadRegions } from "../data/regions";
import { guildData } from "../data/guild-data";

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
    // The server says who is signed in. When nobody is, the login page is next.
    const [who] = await Promise.all([session.load(), Item.loadItems(), Item.loadGePrices()]);
    // Place names aren't needed to show the map; fill them in when they arrive.
    loadRegions().then(() => guildData.refreshRegions());

    // Make sure this component is still connected after loading the above.
    if (this.isConnected) {
      if (who) {
        await this.loadSignedIn();
      } else {
        window.history.pushState("", "", "/login");
      }

      loadingScreenManager.hideLoadingScreen();
    }
  }

  async loadSignedIn() {
    // Only now: the map page fetches the trails as soon as it hears of them,
    // which takes someone being signed in and the rest of the page being loaded.
    selection.restore();
    api.loadFeatures().then((features) => {
      if (features.hub_history && this.isConnected) liveEvents.start();
    });
    const firstDataEvent = pubsub.waitUntilNextEvent("members-polled", false);
    await api.enable();
    await firstDataEvent;
  }
}

customElements.define("app-initializer", AppInitializer);
