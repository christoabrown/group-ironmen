import { BaseElement } from "../base-element/base-element";
import { storage } from "../data/storage";

export class DemoPage extends BaseElement {
  constructor() {
    super();
  }

  html() {
    return `{{demo-page.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    storage.storeGroup("@EXAMPLE", "00000000-0000-0000-0000-000000000000");
    window.history.pushState("", "", "/group");
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }
}

customElements.define("demo-page", DemoPage);
