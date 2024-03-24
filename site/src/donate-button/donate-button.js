import { BaseElement } from "../base-element/base-element";

export class DonateButton extends BaseElement {
  constructor() {
    super();
  }

  html() {
    return `{{donate-button.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.render();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }
}

customElements.define("donate-button", DonateButton);
