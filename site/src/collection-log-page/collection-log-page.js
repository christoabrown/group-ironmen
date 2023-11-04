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
    this.playerName = this.getAttribute("player-name");
    this.tabId = parseInt(this.getAttribute("tab-id"));
    this.pageName = this.getAttribute("page-name");
    this.pageInfo = collectionLog.pageInfo(this.pageName);
    this.pageTitle = this.pageInfo.name;
    this.pageCountLabels = this.pageInfo.completion_labels;
    this.pageItems = collectionLog.pageItems.get(this.pageName);

    const playerLog = collectionLog.playerLogs.get(this.playerName);
    this.completionCounts = playerLog?.getPage(this.pageName)?.completion_counts || [];
    this.unlockedItemsCount = collectionLog.completionCountForPage(this.playerName, this.pageName);
    this.completionStateClass = collectionLog.completionStateClass(this.playerName, this.pageName);

    if (this.tabId === 2) {
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
