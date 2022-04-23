import { BaseElement } from "../base-element/base-element";
import { api } from "../data/api";
import { storage } from "../data/storage";
import { exampleData } from "../data/example-data";

export class MenHomepage extends BaseElement {
  constructor() {
    super();
  }

  html() {
    return `{{men-homepage.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    exampleData.enable();
    api.exampleDataEnabled = true;
    api.enable();
    this.render();
    this.worldMap = this.querySelector("world-map");
    this.worldMap.startingLocation = { x: 2729, y: 3489 };
    this.worldMap.startingZoom = 6;
    this.worldMap.followingPlayer = "group alt two";
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    exampleData.disable();
    api.exampleDataEnabled = false;
    api.disable();
  }

  get hasLogin() {
    const group = storage.getGroup();
    return group && group.groupName && group.groupToken && group.groupName !== "@EXAMPLE";
  }
}

customElements.define("men-homepage", MenHomepage);
