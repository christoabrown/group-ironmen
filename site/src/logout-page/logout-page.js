import { BaseElement } from "../base-element/base-element";
import { session } from "../data/session";
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
    // The server ends the session and takes the cookie back.
    try {
      await api.logout();
    } catch (e) {
      // Continue even if server logout fails
    }

    api.disable();
    session.clear();
    window.history.pushState("", "", "/");
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }
}

customElements.define("logout-page", LogoutPage);
