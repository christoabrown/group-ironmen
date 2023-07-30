import { BaseElement } from "../base-element/base-element";
import { storage } from "../data/storage";
import { api } from "../data/api";
import { exampleData } from "../data/example-data";
import { pubsub } from "../data/pubsub";

export class LogoutPage extends BaseElement {
  constructor() {
    super();
  }

  html() {
    return `{{logout-page.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    exampleData.disable();
    api.disable();
    storage.clearGroup();
    // Unpublish everything to prevent any data leaking over into another session
    pubsub.unpublishAll();
    window.history.pushState("", "", "/");
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }
}

customElements.define("logout-page", LogoutPage);
