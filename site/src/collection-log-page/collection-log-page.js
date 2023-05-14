import { BaseElement } from "../base-element/base-element";
import { collectionLog } from "../data/collection-log";

export class CollectionLogPage extends BaseElement {
  constructor() {
    super();
  }

  html() {
    return `{{collection-log-page.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.pageId = parseInt(this.getAttribute("page-id"));
    this.pageInfo = collectionLog.info.pages.find((page) => page[1] === this.pageId);
    this.pageTitle = this.pageInfo[2];
    this.pageCountLabels = this.pageInfo[3];
    this.pageItems = collectionLog.pageItems.get(this.pageId);
    this.playerData = collectionLog.logs.find((log) => log.page_id === this.pageId);
    this.unlockedItems = collectionLog.unlockedItems;
    this.unlockedItemsCount = collectionLog.unlockedItemsCountByPage.get(this.pageId) || 0;

    this.completionStateClass = "collection-log__not-started";
    if (this.unlockedItemsCount === this.pageItems.length) {
      this.completionStateClass = "collection-log__complete";
    } else if (this.unlockedItemsCount > 0) {
      this.completionStateClass = "collection-log__in-progress";
    }

    this.render();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }
}

customElements.define("collection-log-page", CollectionLogPage);
