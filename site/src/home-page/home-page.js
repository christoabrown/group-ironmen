import { BaseElement } from "../base-element/base-element";

export class HomePage extends BaseElement {
  constructor() {
    super();
  }

  html() {
    return `{{home-page.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.render();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }
}

customElements.define("home-page", HomePage);
