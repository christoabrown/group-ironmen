import { BaseElement } from "../base-element/base-element";
import { storage } from "../data/storage";

export class SetupInstructions extends BaseElement {
  constructor() {
    super();
  }

  /* eslint-disable no-unused-vars */
  html() {
    const group = storage.getGroup();
    return `{{setup-instructions.html}}`;
  }
  /* eslint-enable no-unused-vars */

  connectedCallback() {
    super.connectedCallback();
    this.render();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }
}

customElements.define("setup-instructions", SetupInstructions);
