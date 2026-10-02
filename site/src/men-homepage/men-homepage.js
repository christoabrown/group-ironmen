import { BaseElement } from "../base-element/base-element";

export class MenHomepage extends BaseElement {
  constructor() {
    super();
  }

  html() {
    return `{{men-homepage.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.render();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }
}

customElements.define("men-homepage", MenHomepage);
