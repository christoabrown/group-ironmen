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
      playerPanels += `<player-panel class="rsborder rsbackground" player-name="${member.name}"></player-panel>`;
    }

    this.sidePanels.innerHTML = playerPanels;
  }
}
customElements.define("side-panel", SidePanel);
