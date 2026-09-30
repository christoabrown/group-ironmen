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

  async connectedCallback() {
    super.connectedCallback();
    // Attempt server-side logout
    try {
      await api.logout();
    } catch (e) {
      // Continue even if server logout fails
    }

    api.disable();
    storage.clearSession();
    window.history.pushState("", "", "/");
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }
}

customElements.define("logout-page", LogoutPage);
