import { BaseElement } from "../base-element/base-element";
import { loadingScreenManager } from "../loading-screen/loading-screen-manager";
import { collectionLog } from "../data/collection-log";

export class CollectionLog extends BaseElement {
  constructor() {
    super();
  }

  html() {
    return `{{collection-log.html}}`;
  }

  async connectedCallback() {
    super.connectedCallback();
    loadingScreenManager.showLoadingScreen();
    this.playerName = this.getAttribute("player-name");
    await this.init();
    this.totalUniqueItems = collectionLog.totalUniqueItems;
    this.unlockedUniqueItems = collectionLog.totalUnlockedItems(this.playerName);
    this.render();

    this.tabContent = this.querySelector(".collection-log__tab-container");
    this.tabButtons = this.querySelector(".collection-log__tab-buttons");
    this.background = this.querySelector(".dialog__visible");
    this.showTab(0);

    this.eventListener(this.tabButtons, "click", this.handleTabClick.bind(this));
    this.eventListener(this.background, "click", this.closeIfBackgroundClick.bind(this));
    this.eventListener(this.querySelector(".dialog__close"), "click", this.close.bind(this));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    loadingScreenManager.hideLoadingScreen();
  }

  closeIfBackgroundClick(evt) {
    if (evt.target === this.background) {
      this.close();
    }
  }

  close() {
    this.remove();
  }

  async init() {
    await Promise.all([collectionLog.initLogInfo(), collectionLog.load()]);
    collectionLog.loadPlayer(this.playerName);
    loadingScreenManager.hideLoadingScreen();
  }

  handleTabClick(event) {
    const tabId = event?.target?.getAttribute("tab-id");
    if (tabId) {
      this.showTab(tabId);
    }
  }

  showTab(tabId) {
    this.tabButtons.querySelectorAll("button[tab-id]").forEach((button) => {
      if (button.getAttribute("tab-id") === `${tabId}`) button.classList.add("collection-log__tab-button-active");
      else button.classList.remove("collection-log__tab-button-active");
    });
    this.tabContent.innerHTML = `<collection-log-tab player-name="${this.playerName}" tab-id="${tabId}"></collection-log-tab>`;
  }
}

customElements.define("collection-log", CollectionLog);
