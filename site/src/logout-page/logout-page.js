import { BaseElement } from "../base-element/base-element";
import { storage } from "../data/storage";
import { api } from "../data/api";

export class LogoutPage extends BaseElement {
  constructor() {
    super();
  }

  html() {
    return `{{logout-page.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    api.disable();
    storage.clearGroup();
    window.history.pushState("", "", "/");
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }
}

customElements.define("logout-page", LogoutPage);
