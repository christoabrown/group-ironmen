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
    this.completionStateClass = collectionLog.completionStateClass(this.pageId);

    const tab = this.pageInfo[0];
    if (tab === 2) {
      // Clues tab
      if (this.pageTitle.startsWith("Shared")) {
        this.pageTitleLink = "https://oldschool.runescape.wiki/w/Collection_log#Shared_Treasure_Trail_Rewards";
      } else {
        const difficulty = this.pageTitle.split(" ")[0].toLowerCase();
        this.pageTitleLink = `https://oldschool.runescape.wiki/w/Clue_scroll_(${difficulty})`;
      }
    } else {
      this.pageTitleLink = `https://oldschool.runescape.wiki/w/Special:Lookup?type=npc&name=${this.pageTitle}`;
    }

    this.render();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }
}

customElements.define("collection-log-page", CollectionLogPage);
