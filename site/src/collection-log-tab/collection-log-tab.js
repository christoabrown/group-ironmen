import { BaseElement } from "../base-element/base-element";
import { collectionLog } from "../data/collection-log";

export class CollectionLogTab extends BaseElement {
  constructor() {
    super();
  }

  html() {
    return `{{collection-log-tab.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.playerName = this.getAttribute("player-name");
    this.tabId = parseInt(this.getAttribute("tab-id"));
    this.pages = collectionLog.info[this.tabId].pages;
    this.render();

    this.pageContainer = this.querySelector(".collection-log__page-container");
    this.tabList = this.querySelector(".collection-log__tab-list");
    this.showPage(this.pages[0].name);
    this.eventListener(this.tabList, "click", this.handlePageClick.bind(this));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  handlePageClick(event) {
    const pageName = event.target.getAttribute("page-name");
    if (pageName) {
      this.showPage(pageName);
    }
  }

  showPage(pageName) {
    this.tabList.querySelectorAll("button[page-name]").forEach((button) => {
      if (button.getAttribute("page-name") === `${pageName}`) button.classList.add("collection-log__page-active");
      else button.classList.remove("collection-log__page-active");
    });
    this.pageContainer.innerHTML = `<collection-log-page player-name="${this.playerName}" page-name="${pageName}" tab-id="${this.tabId}"></collection-log-page>`;
  }
}

customElements.define("collection-log-tab", CollectionLogTab);
