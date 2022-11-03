import { BaseElement } from "../base-element/base-element";

export class PanelsPage extends BaseElement {
  constructor() {
    super();
  }

  html() {
    return `{{panels-page.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    document.body.classList.add("panels-page");
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.body.classList.remove("panels-page");
  }
}

customElements.define("panels-page", PanelsPage);
