import { BaseElement } from "../base-element/base-element";
import { collectionLog } from "../data/collection-log";

export class GroupCollectionLogPage extends BaseElement {
  constructor() {
    super();
  }

  html() {
    return `{{group-collection-log-page.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.playerName = collectionLog.groupLogName;
    this.render();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }
}

customElements.define("group-collection-log-page", GroupCollectionLogPage);
