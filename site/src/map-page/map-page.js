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
    this.worldMap = document.querySelector("#background-worldmap");
    document.querySelector(".authed-section").classList.add("no-pointer-events");
    this.worldMap.classList.add("interactable");
    this.playerButtons = this.querySelector(".map-page__focus-player-buttons");
    this.planeSelect = this.querySelector(".map-page__plane-select");

    this.planeSelect.value = this.worldMap.plane || 1;

    this.subscribe("members-updated", this.handleUpdatedMembers.bind(this));
    this.eventListener(this.playerButtons, "click", this.handleFocusPlayer.bind(this));
    this.eventListener(this.planeSelect, "change", this.handlePlaneSelect.bind(this));
    this.eventListener(this.worldMap, "plane-changed", this.handlePlaneChange.bind(this));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.worldMap.classList.remove("interactable");
    document.querySelector(".authed-section").classList.remove("no-pointer-events");
  }

  getSelectedPlane() {
    return parseInt(this.planeSelect.value, 10);
  }

  handlePlaneChange(evt) {
    const plane = evt.detail.plane;
    if (this.getSelectedPlane() !== plane) {
      this.planeSelect.value = plane;
    }
  }

  handlePlaneSelect() {
    this.worldMap.stopFollowingPlayer();
    this.worldMap.showPlane(this.getSelectedPlane());
  }

  handleUpdatedMembers(members) {
    let playerButtons = "";
    for (const member of members) {
      if (member.name === "@SHARED") continue;
      playerButtons += `<button type="button" class="men-button" player-name="${member.name}">${member.name}</button>`;
    }

    if (this.playerButtons) {
      this.playerButtons.innerHTML = playerButtons;
    }
  }

  handleFocusPlayer(event) {
    const target = event.target;
    const playerName = target.getAttribute("player-name");
    this.worldMap.followPlayer(playerName);
  }
}
customElements.define("map-page", MapPage);
