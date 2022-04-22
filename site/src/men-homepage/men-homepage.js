import { BasePage } from "../base-page/base-page";
import { api } from "../data/api";
import { storage } from "../data/storage";

export class MenHomepage extends BasePage {
  constructor() {
    super();
  }

  html() {
    return `{{men-homepage.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
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
    api.exampleDataEnabled = false;
    api.disable();
  }

  get hasLogin() {
    const group = storage.getGroup();
    return group && group.groupName && group.groupToken;
  }
}

customElements.define("men-homepage", MenHomepage);
