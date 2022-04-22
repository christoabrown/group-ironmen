import { BaseElement } from "../base-element/base-element";

export class LoadingScreen extends BaseElement {
  constructor() {
    super();
  }

  html() {
    return `{{loading-screen.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.render();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }
}

customElements.define("loading-screen", LoadingScreen);
