import { BasePage } from "../base-page/base-page";

export class ItemsPage extends BasePage {
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
