import { BaseElement } from "../base-element/base-element";

export class ItemsPage extends BaseElement {
  constructor() {
    super();
  }

  html() {
    return `{{items-page.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.render();

    this.subscribe("members-updated", this.handleUpdatedMembers.bind(this));
  }

  handleUpdatedMembers(members) {
    const playerFilter = this.querySelector(".items-page__player-filter");
    const selected = playerFilter.value;

    let playerOptions = `<option value="@ALL">All Players</option>`;
    for (const member of members) {
      playerOptions += `<option value="${member.name}" ${member.name === selected ? "selected" : ""}>${
        member.name
      }</option>`;
    }

    playerFilter.innerHTML = playerOptions;

    if (playerFilter.value !== selected) {
      playerFilter.dispatchEvent(new CustomEvent("change"));
    }
  }
}
customElements.define("items-page", ItemsPage);
