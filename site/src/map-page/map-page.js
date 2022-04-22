import { BasePage } from "../base-page/base-page";

export class MapPage extends BasePage {
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
