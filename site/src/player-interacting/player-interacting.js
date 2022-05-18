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
    const playerName = this.getAttribute("player-name");
    this.subscribe(`interacting:${playerName}`, this.handleInteracting.bind(this));
    this.subscribe("map-shown", this.handleMapShown.bind(this));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.clearTimeout(this.hideTimeout);
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

  handleMapShown() {
    if (this.interacting) this.addMapMarker();
  }

  addMapMarker() {
    if (!this.visible) return;
    const map = this.map;
    if (map) {
      if (this.marker && map.map.hasLayer(this.marker)) {
        this.marker.setLatLng(map.gamePositionToLatLong(this.interacting.location.x, this.interacting.location.y));
        this.marker.getTooltip().setContent(this.interacting.name);
      } else {
        this.marker = map.addInteractingMarker(
          this.interacting.location.x,
          this.interacting.location.y,
          this.interacting.name
        );
      }
    }
  }

  removeMapMarker() {
    const map = this.map;
    if (map && this.marker) {
      map.map.removeLayer(this.marker);
    }
    this.marker = null;
  }

  get map() {
    return document.querySelector("world-map");
  }

  get visible() {
    return this.style.visibility === "visible";
  }

  hide() {
    this.style.visibility = "hidden";
    this.removeMapMarker();
  }

  show() {
    this.style.visibility = "visible";
    this.addMapMarker();
  }
}

customElements.define("player-interacting", PlayerInteracting);
