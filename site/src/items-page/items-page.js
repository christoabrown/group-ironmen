import { BaseElement } from "../base-element/base-element";

export class ItemsPage extends BaseElement {
  constructor() {
    super();
  }

  html() {
    return `{{items-page.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.render();
  }
}
customElements.define("items-page", ItemsPage);
