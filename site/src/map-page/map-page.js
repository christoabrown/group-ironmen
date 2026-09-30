import { BaseElement } from "../base-element/base-element";
import { api } from "../data/api";

const TRAIL_REFRESH_MS = 60000;

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
    this.trailControls = this.querySelector(".map-page__trail-controls");
    this.trailPlayerSelect = this.querySelector(".map-page__trail-player");
    this.trailDaysSelect = this.querySelector(".map-page__trail-days");
    this.trailStatus = this.querySelector(".map-page__trail-status");

    this.planeSelect.value = this.worldMap.plane || 1;

    this.subscribe("members-updated", this.handleUpdatedMembers.bind(this));
    this.eventListener(this.playerButtons, "click", this.handleFocusPlayer.bind(this));
    this.eventListener(this.planeSelect, "change", this.handlePlaneSelect.bind(this));
    this.eventListener(this.planeSelect, "wheel", this.handlePlaneWheel.bind(this), { passive: false });
    this.eventListener(this.worldMap, "plane-changed", this.handlePlaneChange.bind(this));
    this.eventListener(this.trailPlayerSelect, "change", this.loadTrail.bind(this));
    this.eventListener(this.trailDaysSelect, "change", this.loadTrail.bind(this));
    this.subscribe("features", this.handleFeatures.bind(this));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.clearInterval(this.trailRefresh);
    this.worldMap.clearTrails();
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

  handlePlaneWheel(event) {
    event.preventDefault();
    const current = this.getSelectedPlane();
    const direction = event.deltaY > 0 ? 1 : -1;
    const next = Math.min(Math.max(current + direction, 1), 4);
    if (next !== current) {
      this.planeSelect.value = next;
      this.handlePlaneSelect();
    }
  }

  handleFeatures(features) {
    this.trailControls.hidden = !features?.hub_history;
  }

  updateTrailPlayerOptions(members) {
    const selected = this.trailPlayerSelect.value;
    const options = [new Option("Trail: off", "")];
    for (const member of members) {
      options.push(new Option(member.name, member.name));
    }
    this.trailPlayerSelect.replaceChildren(...options);
    this.trailPlayerSelect.value = members.some((member) => member.name === selected) ? selected : "";
  }

  async loadTrail() {
    window.clearInterval(this.trailRefresh);
    const playerName = this.trailPlayerSelect.value;
    this.worldMap.clearTrails();
    this.trailStatus.textContent = "";
    if (!playerName) return;

    const days = parseInt(this.trailDaysSelect.value, 10);
    const requestId = (this.trailRequestId = (this.trailRequestId || 0) + 1);
    this.trailStatus.textContent = "Loading...";
    try {
      const trail = await api.getHubLocations(playerName, days);
      if (!this.isConnected || requestId !== this.trailRequestId) return;
      this.worldMap.setTrail(playerName, trail.points);
      this.trailStatus.textContent = trail.points.length ? "" : "No locations";
      this.trailRefresh = window.setInterval(() => this.loadTrail(), TRAIL_REFRESH_MS);
    } catch (error) {
      if (!this.isConnected || requestId !== this.trailRequestId) return;
      this.trailStatus.textContent = error.status === 404 ? "Not shared" : "Unavailable";
    }
  }

  handleUpdatedMembers(members) {
    this.updateTrailPlayerOptions(members);
    let playerButtons = "";
    for (const member of members) {
      if (!member.inactive) {
        playerButtons += `<button type="button" class="men-button" player-name="${member.name}">${member.name}</button>`;
      }
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
