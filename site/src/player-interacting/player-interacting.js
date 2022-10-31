import { BaseElement } from "../base-element/base-element";
import { utility } from "../utility";

export class PlayerInteracting extends BaseElement {
  constructor() {
    super();
    this.staleTimeout = 30 * 1000;
  }

  html() {
    return `{{player-interacting.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.render();

    this.hitpointsBar = this.querySelector("stat-bar");
    this.name = this.querySelector(".player-interacting__name");
    this.map = document.querySelector("#background-worldmap");
    const playerName = this.getAttribute("player-name");

    this.addMapMarker().then(() => {
      this.subscribe(`interacting:${playerName}`, this.handleInteracting.bind(this));
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.clearTimeout(this.hideTimeout);
    this.map.map.removeLayer(this.marker);
  }

  handleInteracting(interacting) {
    this.interacting = interacting;
    const timeSinceLastUpdate = utility.timeSinceLastUpdate(interacting.last_updated);

    const timeUntilHide = this.staleTimeout - timeSinceLastUpdate;

    if (timeUntilHide > 1000) {
      window.clearTimeout(this.hideTimeout);
      this.hideTimeout = window.setTimeout(this.hide.bind(this), this.staleTimeout);
      this.hitpointsBar.update(interacting.ratio / interacting.scale);
      this.name.innerHTML = interacting.name;
      this.show();
    }
  }

  async addMapMarker() {
    this.marker = await this.map.addInteractingMarker(0, 0, "");
  }

  hide() {
    this.style.visibility = "hidden";
    this.marker.setLatLng([-1000000, -1000000]);
  }

  show() {
    this.style.visibility = "visible";
    this.marker.setLatLng(this.map.gamePositionToLatLong(this.interacting.location.x, this.interacting.location.y));
    this.marker.getTooltip().setContent(this.interacting.name);
  }
}

customElements.define("player-interacting", PlayerInteracting);
