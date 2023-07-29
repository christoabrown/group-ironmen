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
    this.pages = collectionLog.info.pages.filter((page) => page[0] === this.tabId);
    this.pages.sort((a, b) => a[2].localeCompare(b[2]));
    this.render();

    this.pageContainer = this.querySelector(".collection-log__page-container");
    this.tabList = this.querySelector(".collection-log__tab-list");
    this.showPage(this.pages[0][1]);
    this.eventListener(this.tabList, "click", this.handlePageClick.bind(this));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  handlePageClick(event) {
    const pageId = event.target.getAttribute("page-id");
    if (pageId) {
      this.showPage(pageId);
    }
  }

  showPage(pageId) {
    this.tabList.querySelectorAll("button[page-id]").forEach((button) => {
      if (button.getAttribute("page-id") === `${pageId}`) button.classList.add("collection-log__page-active");
      else button.classList.remove("collection-log__page-active");
    });
    this.pageContainer.innerHTML = `<collection-log-page player-name="${this.playerName}" page-id="${pageId}"></collection-log-page>`;
  }
}

customElements.define("collection-log-tab", CollectionLogTab);
