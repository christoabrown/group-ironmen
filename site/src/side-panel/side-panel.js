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
    this.eventListener(this.querySelector(".side-panel__move"), "click", this.swapLayoutDirection.bind(this));
    this.sidePanels = this.querySelector(".side-panel__panels");
    this.subscribe("members-updated", this.handleUpdatedMembers.bind(this));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  handleUpdatedMembers(members) {
    let playerPanels = "";
    for (const member of members) {
      if (member.name === "@SHARED") {
        continue;
      }
      playerPanels += `<player-panel player-name="${member.name}"></player-panel>`;
    }

    this.sidePanels.innerHTML = playerPanels;
  }

  swapLayoutDirection() {
    if (localStorage.getItem("layout-direction")) {
      localStorage.removeItem("layout-direction");
    } else {
      localStorage.setItem("layout-direction", "row-reverse");
    }
    window.updateLayout();
  }
}
customElements.define("side-panel", SidePanel);
