/* global L */
/* global WeakRef */
import { BaseElement } from "../base-element/base-element";
import { pubsub } from "../data/pubsub";
import { utility } from "../utility";

function cantor(x, y) {
  return ((x + y) * (x + y + 1)) / 2 + y;
}

let validCoordsInitialized = false;

export class WorldMap extends BaseElement {
  constructor() {
    super();
    this.playerMarkers = new Map();
    this.mapDataFilesLoaded = false;
  }

  html() {
    return `{{world-map.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.render();
    this.loadMapDataFiles()
      .then(() => this.initMap())
      .then(() => this.initIcons())
      .then(() => {
        this.subscribe("members-updated", this.handleUpdatedMembers.bind(this));
        this.subscribe("coordinates", this.handleUpdatedMember.bind(this));
        this.currentPlane = 1;
        this.initialized = true;
      });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.map.remove();
  }

  async loadMapDataFiles() {
    if (this.mapDataFilesLoaded) return;
    this.mapDataFilesLoaded = true;
    const mapData = WorldMap.mapData || (await fetch("/data/map_data.json").then((f) => f.json()));
    WorldMap.mapData = mapData;

    this.iconDefs = mapData.icons;
    this.iconLocations = mapData.locations;

    this.validCoords = [new Set(), new Set(), new Set(), new Set()];
    for (const region of mapData.regions) {
      const plane = parseInt(region[0]);
      const x = parseInt(region[1]);
      const y = parseInt(region[2]);
      this.validCoords[plane].add(cantor(x, y));
    }
  }

  handleUpdatedMembers(members) {
    for (const marker of this.playerMarkers.values()) {
      this.map.removeLayer(marker);
    }
    this.playerMarkers = new Map();

    for (const member of members) {
      if (member.name === "@SHARED") continue;
      this.handleUpdatedMember(member);
    }
  }

  handleUpdatedMember(member) {
    if (!this.map) return;
    const coordinates = member.coordinates || {};
    if (!isNaN(coordinates.x) && !isNaN(coordinates.y) && !isNaN(coordinates.plane)) {
      this.drawPlayerPoint(coordinates.x, coordinates.y, coordinates.plane, member.name);
    }
  }

  createMapPlaneLayer(plane) {
    const tileLayer = L.tileLayer(`/map/${plane}_{x}_{y}.webp`, {
      tileSize: 256,
      attribution: "Me :)",
      id: "rsmap",
      maxNativeZoom: 5,
      minNativeZoom: 5,
      minZoom: 5,
      maxZoom: 8,
      zoomOffset: -5,
      tms: true,
    });
    const _addTile = tileLayer._addTile;
    tileLayer._addTile = (coords, container) => {
      const invertedY = tileLayer._globalTileRange.max.y - coords.y;
      if (coords.x >= 0 && invertedY >= 0 && this.validCoords[plane].has(cantor(coords.x, invertedY))) {
        return _addTile.apply(tileLayer, [coords, container]);
      }
    };
    return tileLayer;
  }

  async initMap() {
    await this.waitForLeaflet();
    const CRSPixel = L.Util.extend(L.CRS.Simple, {
      transformation: new L.Transformation(1, 0, 1, 0),
      infinite: false,
    });
    const getProjectedBounds = CRSPixel.getProjectedBounds;
    CRSPixel.getProjectedBounds = (...args) => {
      const bounds = getProjectedBounds.apply(CRSPixel, args);
      bounds.min.x = 18 * 256;
      bounds.min.y = 19 * 256;
      bounds.max.x = (66 + 1) * 256;
      bounds.max.y = (196 + 1) * 256;
      return bounds;
    };
    const startingLocation = this.startingLocation
      ? this.gamePositionToLatLong(this.startingLocation.x, this.startingLocation.y)
      : this.gamePositionToLatLong(3103, 3095);
    const startingZoom = this.startingZoom || 5;
    // const addControls = !this.hasAttribute("no-controls");
    const map = L.map(this.querySelector(".world-map__map"), {
      crs: CRSPixel,
      attributionControl: false,
      zoomControl: false,
      zoomSnap: 0,
    }).setView(startingLocation, startingZoom, { animate: false });

    this.map = map;
    this.tileLayers = [];
    for (let i = 0; i < 4; ++i) {
      this.tileLayers.push(this.createMapPlaneLayer(i));
    }
    this.tileLayers[0].addTo(map);

    map.on("mousedown", () => {
      this.followingPlayer = null;
    });

    const Position = L.Control.extend({
      _container: null,
      options: {
        position: "bottomleft",
      },

      onAdd: function (map) {
        this._xy = L.DomUtil.create("div", "world-map__mouse-position");
        return this._xy;
      },

      updateHTML: function (x, y) {
        this._xy.innerHTML = `(${x}, ${y})`;
      },
    });
    this.position = new Position();
    this.map.addControl(this.position);
    this.map.addEventListener("mousemove", (event) => {
      const [x, y] = this.latLongToGamePosition(event.latlng.lat, event.latlng.lng);
      this.position.updateHTML(x, y);
    });
  }

  async initIcons() {
    await this.waitForLeaflet();
    if (WorldMap.icons === undefined) {
      WorldMap.icons = {};
      for (const [iconName, fileName] of Object.entries(this.iconDefs)) {
        WorldMap.icons[iconName] = L.icon({
          iconUrl: `/icons/${fileName}`,
          iconSize: [15, 15],
          iconAnchor: [7.5, 7.5],
        });
      }
    }
    if (WorldMap.locationMarkers === undefined) {
      WorldMap.locationMarkers = [];
      for (const [icon, coordinates] of Object.entries(this.iconLocations)) {
        for (const coordinate of coordinates) {
          const latlng = this.gamePositionToLatLong(coordinate[0], coordinate[1]);
          WorldMap.locationMarkers.push(
            L.marker(latlng, {
              icon: WorldMap.icons[icon],
              keyboard: false,
              interactive: false,
            })
          );
        }
      }
    }
    this.map.on(
      "move",
      utility.throttle(() => {
        this.drawMapMarkersInBounds();
      }, 250)
    );

    this.playerIcon = L.icon({
      iconUrl: "/icons/3561-0.png",
      iconSize: [27 / 1.5, 33 / 1.5],
      iconAnchor: [27 / 3, 33 / 3],
    });

    this.interactingIcon = L.icon({
      iconUrl: "/icons/1046-0.png",
      iconSize: [20, 20],
      iconAnchor: [20 / 2, 20 / 2],
    });

    this.drawMapMarkersInBounds();
  }

  drawMapMarkersInBounds() {
    const mapBounds = this.map.getBounds();
    for (const marker of WorldMap.locationMarkers) {
      const shouldBeVisible = mapBounds.contains(marker.getLatLng());
      const isVisible = this.map.hasLayer(marker);
      if (shouldBeVisible && !isVisible) {
        this.map.addLayer(marker);
      } else if (!shouldBeVisible && isVisible) {
        this.map.removeLayer(marker);
      }
    }
  }

  latLongToGamePosition(lat, long) {
    const latUnitsPerTile = 8;
    const pixelsPerGameTile = 4;
    const unitsPerPixel = latUnitsPerTile / 256;
    const unitsPerGameTile = unitsPerPixel * pixelsPerGameTile;

    const y = -(2 * lat + unitsPerGameTile - 3152) / (2 * unitsPerGameTile);
    const x = -(unitsPerGameTile - 2 * long) / (2 * unitsPerGameTile);
    return [Math.round(x), Math.round(y)];
  }

  gamePositionToLatLong(x, y) {
    const latUnitsPerTile = 8;
    const pixelsPerGameTile = 4;
    const unitsPerPixel = latUnitsPerTile / 256;
    const unitsPerGameTile = unitsPerPixel * pixelsPerGameTile;
    const latlng = L.latLng(
      197 * 8 - y * unitsPerGameTile - unitsPerGameTile / 2,
      x * unitsPerGameTile + unitsPerGameTile / 2
    );
    return latlng;
  }

  drawPlayerPoint(x, y, plane, name) {
    if (this.playerMarkers.has(name)) {
      this.map.removeLayer(this.playerMarkers.get(name));
      this.playerMarkers.delete(name);
    }
    const latlng = this.gamePositionToLatLong(x, y);
    const marker = new L.Marker(latlng, {
      icon: this.playerIcon,
      interactive: false,
    })
      .bindTooltip(name, {
        permanent: true,
        opacity: 1,
        className: "player-label",
        offset: [0, 0],
        direction: "top",
      })
      .openTooltip();
    marker.addTo(this.map);
    marker.plane = plane;
    this.playerMarkers.set(name, marker);
    if (this.followingPlayer === name) {
      this.panToPlayer(name);
    }
  }

  async addInteractingMarker(x, y, name) {
    await this.waitUntilInitialized();
    const latlng = this.gamePositionToLatLong(x, y);
    const marker = new L.Marker(latlng, {
      icon: this.interactingIcon,
      interactive: false,
    })
      .bindTooltip(name, {
        permanent: true,
        opacity: 1,
        className: "interacting-label",
        offset: [0, -5],
        direction: "bottom",
      })
      .openTooltip();
    marker.addTo(this.map);
    return marker;
  }

  async followPlayer(name) {
    if (!this.playerMarkers.has(name)) return;
    this.followingPlayer = null;
    await this.flyToPlayer(name);
    this.followingPlayer = name;
  }

  panToPlayer(name) {
    const marker = this.playerMarkers.get(name);
    if (!marker) return;
    this.showPlane(marker.plane + 1);
    this.map.panTo(marker.getLatLng());
  }

  flyToPlayer(name) {
    const marker = this.playerMarkers.get(name);
    if (!marker) return;
    this.showPlane(marker.plane + 1);
    return new Promise((resolve) => {
      const duration = 0.25;
      this.map.flyTo(marker.getLatLng(), 7, {
        duration,
      });
      setTimeout(() => resolve(true), duration * 1000);
    });
  }

  async waitUntilInitialized() {
    while (!this.initialized) {
      await new Promise((resolve) => setTimeout(() => resolve(true), 100));
    }
  }

  async waitForLeaflet() {
    if (!WorldMap.leafletScriptTag) {
      WorldMap.leafletScriptTag = document.createElement("script");
      WorldMap.leafletScriptTag.src = "https://unpkg.com/leaflet@1.9.2/dist/leaflet.js";
      document.body.appendChild(WorldMap.leafletScriptTag);
    }
    while (typeof L !== "object") {
      await new Promise((resolve) => setTimeout(() => resolve(true), 100));
    }
    if (navigator.userAgent.search("Chrome") > 0) {
      /*
       * Workaround for 1px lines appearing in some browsers due to fractional transforms
       * and resulting anti-aliasing.
       * https://github.com/Leaflet/Leaflet/issues/3575*/
      const originalInitTile = L.GridLayer.prototype._initTile;
      L.GridLayer.include({
        _initTile: function (tile) {
          originalInitTile.call(this, tile);
          const tilePadding = 2;
          const tileSize = this.getTileSize();
          tile.style.width = tileSize.x + tilePadding + "px";
          tile.style.height = tileSize.y + tilePadding + "px";
        },
      });
    }
  }

  showPlane(plane) {
    for (let i = 1; i < plane; ++i) {
      if (!this.map.hasLayer(this.tileLayers[i])) {
        this.tileLayers[i].addTo(this.map);
      }
    }
    for (let i = plane; i < 4; ++i) {
      if (this.map.hasLayer(this.tileLayers[i])) {
        this.tileLayers[i].remove();
      }
    }

    this.currentPlane = plane;

    this.dispatchEvent(
      new CustomEvent("plane-changed", {
        detail: {
          plane,
        },
      })
    );
  }
}
customElements.define("world-map", WorldMap);
