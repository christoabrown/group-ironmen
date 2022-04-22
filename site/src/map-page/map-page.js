import { BaseElement } from "../base-element/base-element";

export class MapPage extends BaseElement {
  constructor() {
    super();
  }

  html() {
    return `{{map-page.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.render();
    this.worldMap = this.querySelector("world-map");
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }
}
customElements.define("map-page", MapPage);
