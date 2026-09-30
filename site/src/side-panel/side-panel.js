import { BaseElement } from "../base-element/base-element";

export class SidePanel extends BaseElement {
  constructor() {
    super();
  }

  html() {
    return `{{side-panel.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.render();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }
}
customElements.define("side-panel", SidePanel);
