import { BaseElement } from "../base-element/base-element";
import { tooltipManager } from "../rs-tooltip/tooltip-manager";
import { utility } from "../utility";
import { Animation } from "./animation";

export const ICON_SPRITE_SIZE = 15;

export class CanvasMap extends BaseElement {
  html() {
    return `{{canvas-map.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.render();

    this.coordinatesDisplay = this.querySelector(".canvas-map__coordinates");
    this.canvas = this.querySelector("canvas");
    this.ctx = this.canvas.getContext("2d", { alpha: true });
    this.eventListener(this, "mousedown", this.onPointerDown.bind(this));
    this.eventListener(this, "touchstart", this.onTouchStart.bind(this), { passive: false });
    this.eventListener(this, "mouseup", this.stopDragging.bind(this));
    this.eventListener(this, "touchend", this.stopDragging.bind(this));
    this.eventListener(this, "mousemove", this.onPointerMove.bind(this));
    this.eventListener(this, "touchmove", this.onTouchMove.bind(this));
    this.eventListener(this, "wheel", this.onScroll.bind(this));
    this.eventListener(this, "mouseleave", this.onMouseLeave.bind(this));
    this.eventListener(this, "mouseenter", this.stopDragging.bind(this));
    this.eventListener(this, "touchcancel", this.stopDragging.bind(this));
    this.eventListener(window, "resize", this.onResize.bind(this));
    this.playerMarkers = new Map();
    this.interactingMarkers = new Set();
    this.subscribe("members-updated", this.handleUpdatedMembers.bind(this));
    this.subscribe("coordinates", this.handleUpdatedCoordinates.bind(this));

    this.plane = 1;
    this.tileSize = 256;
    this.pixelsPerGameTile = 4;
    this.tiles = [new Map(), new Map(), new Map(), new Map()];
    this.tilesInView = [];
    this.previousFrameTime = performance.now();
    this.followingPlayer = {};

    this.onResize();
    this.camera = {
      x: new Animation({
        current: 0,
        target: 0,
        progress: 1,
      }),
      y: new Animation({
        current: 0,
        target: 0,
        progress: 1,
      }),
      zoom: new Animation({
        current: 0.5,
        target: 0.5,
        progress: 0.5,
      }),
      maxZoom: 6,
      minZoom: 0.5,
      isDragging: false,
    };
    this.cursor = {
      x: 0,
      y: 0,
      frameX: [0],
      frameY: [0],
    };
    this.touch = {};

    const [startX, startY] = this.gamePositionToCameraCenter(3103, 3095);
    this.camera.x.goTo(startX, 1);
    this.camera.y.goTo(startY, 1);

    this.getMapJson();
    this.update = this._update.bind(this);
    this.requestUpdate();
    if (this.frameRequestId) {
      window.cancelAnimationFrame(this.frameRequestId);
    }
    this.frameRequestId = window.requestAnimationFrame(this.update);
  }

  disconnectedCallback() {
    if (this.frameRequestId) {
      window.cancelAnimationFrame(this.frameRequestId);
      this.frameRequestId = null;
    }
    this.hideMapLinkTooltip();
    super.disconnectedCallback();
  }

  async getMapJson() {
    let data;
    try {
      const response = await fetch("/data/map.json");
      if (!response.ok) {
        throw new Error(`failed to fetch map.json (${response.status})`);
      }
      data = await response.json();
    } catch (ex) {
      console.error("failed to load map data", ex);
      return;
    }

    this.validTiles = [];
    for (const x of data.tiles) {
      this.validTiles.push(new Set(x));
    }

    this.locations = this.parseIntKeys(data.icons);
    this.buildIconIndex();
    this.mapLabels = this.parseIntKeys(data.labels);

    this.locationIconsSheet = new Image();
    this.locationIconsSheet.src = "/map/icons/map_icons.webp";
    this.locationIconsSheet.onload = () => {
      this.requestUpdate();
    };

    this.loadMapLinks(data.links);
  }

  loadMapLinks(data) {
    try {
      this.linksByPlane = {};
      for (const [key, destination] of Object.entries(data || {})) {
        const parts = key.split(",");
        if (parts.length !== 3) {
          console.error(`malformed map link key "${key}"`);
          continue;
        }
        const x = parseInt(parts[0]);
        const y = parseInt(parts[1]);
        const plane = parseInt(parts[2]);
        if (isNaN(x) || isNaN(y) || isNaN(plane)) {
          console.error(`malformed map link key "${key}"`);
          continue;
        }
        if (!Array.isArray(destination) || destination.length !== 3 || !destination.every((v) => !isNaN(v))) {
          console.error(`malformed map link destination for key "${key}"`);
          continue;
        }
        const destTileX = Math.floor(destination[0] / (this.tileSize / this.pixelsPerGameTile));
        const destTileY = Math.floor(destination[1] / (this.tileSize / this.pixelsPerGameTile));
        if (!this.validTiles?.[destination[2]]?.has(this.cantor(destTileX, destTileY))) {
          continue;
        }
        const linkKey = this.positionKey(x, y + 1, plane);
        const dest = {
          x: destination[0],
          y: destination[1],
          plane: destination[2],
        };
        const parsed = { key: linkKey, x, y: y + 1, plane, destination: dest };
        if (!this.linksByPlane[plane]) this.linksByPlane[plane] = [];
        this.linksByPlane[plane].push(parsed);
      }
      this.buildLinkIconOverrides();
      this.requestUpdate();
    } catch (ex) {
      console.error("failed to load map links", ex);
    }
  }

  handleUpdatedMembers(members) {
    this.playerMarkers = new Map();

    for (const member of members) {
      if (member.name === "@SHARED") continue;
      this.handleUpdatedCoordinates(member);
    }
  }

  isValidCoordinates(coordinates) {
    return !isNaN(coordinates?.x) && !isNaN(coordinates?.y) && !isNaN(coordinates?.plane);
  }

  handleUpdatedCoordinates(member) {
    const coordinates = member.coordinates || {};
    if (this.isValidCoordinates(coordinates)) {
      this.playerMarkers.set(member.name, {
        label: member.name,
        coordinates,
      });

      if (this.followingPlayer.name === member.name) {
        this.followingPlayer.coordinates = coordinates;
      }

      const padPx = this.pixelsPerGameTile * this.camera.zoom.current;
      if (this.isGameTileInView(coordinates.x, coordinates.y, padPx)) {
        this.requestUpdate();
      }
    }
  }

  followPlayer(playerName) {
    const marker = this.playerMarkers.get(playerName);
    const coordinates = marker?.coordinates;
    if (this.isValidCoordinates(coordinates)) {
      this.followingPlayer.name = playerName;
      this.followingPlayer.coordinates = marker.coordinates;
      this.requestUpdate();
    }
  }

  stopFollowingPlayer() {
    this.followingPlayer.name = null;
  }

  // Converts a position in the runescape world to a camera position at the center of the canvas
  gamePositionToCameraCenter(x, y) {
    const tileCenterOffset = (this.pixelsPerGameTile * this.camera.zoom.current) / 2;
    return [
      x * this.pixelsPerGameTile * this.camera.zoom.current - this.canvas.width / 2 + tileCenterOffset,
      (y * this.pixelsPerGameTile - this.tileSize) * this.camera.zoom.current + this.canvas.height / 2,
    ];
  }

  // Converts a position in the runescape world to a client position relative to the camera.
  // If the result is between [0, canvas.height] and [0, canvas.width] then it is visible.
  gamePositionToClient(x, y) {
    const tileCenterOffset = (this.pixelsPerGameTile * this.camera.zoom.current) / 2;
    return [
      x * this.pixelsPerGameTile * this.camera.zoom.current + tileCenterOffset - this.camera.x.current,
      this.camera.y.current - (y * this.pixelsPerGameTile - this.tileSize) * this.camera.zoom.current,
    ];
  }

  // Converts a game position to a position on the canvas that we can use to draw on.
  gamePositionToCanvas(x, y) {
    return [x * this.pixelsPerGameTile, -y * this.pixelsPerGameTile + this.tileSize];
  }

  // Checks if a game tile's canvas draw position is currently visible on the screen.
  // padPx is padding in screen pixels to account for icon/marker sizes that extend beyond the tile corner.
  isGameTileInView(x, y, padPx = 0) {
    const zoom = this.camera.zoom.current;
    const screenX = x * this.pixelsPerGameTile * zoom - this.camera.x.current;
    const screenY = (-y * this.pixelsPerGameTile + this.tileSize) * zoom + this.camera.y.current;
    return (
      screenX >= -padPx &&
      screenX <= this.canvas.width + padPx &&
      screenY >= -padPx &&
      screenY <= this.canvas.height + padPx
    );
  }

  requestUpdate() {
    this.updateRequested = 1;
  }

  parseIntKeys(obj) {
    const result = {};
    for (const key of Object.keys(obj)) {
      const intKey = parseInt(key);
      const value = obj[key];
      result[intKey] = value && typeof value === "object" && !Array.isArray(value) ? this.parseIntKeys(value) : value;
    }
    return result;
  }

  coordinateKey(x, y) {
    return `${x},${y}`;
  }

  positionKey(x, y, plane) {
    return `${x},${y},${plane}`;
  }

  iconCanvasSize() {
    const scale = Math.min(this.camera.zoom.current, 3);
    return ICON_SPRITE_SIZE / scale;
  }

  mapLinkScreenCenter(x, y) {
    const [canvasX, canvasY] = this.gamePositionToCanvas(x, y);
    return [
      canvasX * this.camera.zoom.current - this.camera.x.current,
      canvasY * this.camera.zoom.current + this.camera.y.current,
    ];
  }

  linksOnCurrentPlane() {
    if (!this.linksByPlane) return [];
    return this.linksByPlane[this.plane - 1] || [];
  }

  buildIconIndex() {
    this.iconIndex = new Set();
    if (!this.locations) return;
    for (const regionX of Object.keys(this.locations)) {
      const regionYMap = this.locations[regionX];
      if (!regionYMap) continue;
      for (const regionY of Object.keys(regionYMap)) {
        const spriteMap = regionYMap[regionY];
        if (!spriteMap) continue;
        for (const coordinates of Object.values(spriteMap)) {
          for (let i = 0; i < coordinates.length; i += 3) {
            this.iconIndex.add(this.positionKey(coordinates[i], coordinates[i + 1], coordinates[i + 2]));
          }
        }
      }
    }
  }

  buildLinkIconOverrides() {
    this.linkIconOverrides = {};
    this.linkedIconPositions = new Set();
    if (!this.linksByPlane || !this.iconIndex) return;
    for (const links of Object.values(this.linksByPlane)) {
      for (const link of links) {
        const { key, x, y, plane } = link;
        if (this.iconIndex.has(this.positionKey(x, y, plane))) {
          this.linkIconOverrides[key] = { iconX: x, iconY: y };
          this.linkedIconPositions.add(this.positionKey(x, y, plane));
        } else if (this.iconIndex.has(this.positionKey(x, y + 1, plane))) {
          this.linkIconOverrides[key] = { iconX: x, iconY: y + 1 };
          this.linkedIconPositions.add(this.positionKey(x, y + 1, plane));
        }
      }
    }
  }

  getLinkAtClient(clientX, clientY) {
    const canvasRect = this.canvas.getBoundingClientRect();
    const cx = clientX - canvasRect.left;
    const cy = clientY - canvasRect.top;
    const canvasSize = this.iconCanvasSize();
    const halfSize = (canvasSize * this.camera.zoom.current) / 2;
    let bestLink = null;
    let bestDist = Infinity;
    for (const link of this.linksOnCurrentPlane()) {
      const override = this.linkIconOverrides?.[link.key];
      const hitX = override ? override.iconX : link.x;
      const hitY = override ? override.iconY : link.y;
      const [linkScreenX, linkScreenY] = this.mapLinkScreenCenter(hitX, hitY);
      const dx = cx - linkScreenX;
      const dy = cy - linkScreenY;
      if (Math.abs(dx) <= halfSize && Math.abs(dy) <= halfSize) {
        const dist = dx * dx + dy * dy;
        if (dist < bestDist) {
          bestDist = dist;
          bestLink = link;
        }
      }
    }
    return bestLink;
  }

  goToMapLink(destination) {
    this.stopFollowingPlayer();
    this.showPlane(destination.plane + 1);
    const [targetX, targetY] = this.gamePositionToCameraCenter(destination.x, destination.y);
    this.camera.x.goTo(targetX, 0);
    this.camera.y.goTo(targetY, 0);
    this.cursor.dx = 0;
    this.cursor.dy = 0;
    this.requestUpdate();
  }

  buildMapLinkTooltip(destination) {
    const mapSquareX = Math.floor(destination.x / 64);
    const mapSquareY = Math.floor(destination.y / 64);
    const url = `/map/${destination.plane}_${mapSquareX}_${mapSquareY}.webp`;
    const alt = `Destination: (${destination.x}, ${destination.y}) plane ${destination.plane + 1}`;
    const localX = destination.x - mapSquareX * 64;
    const localY = destination.y - mapSquareY * 64;
    const pctX = (localX / 64) * 100;
    const pctY = 100 - (localY / 64) * 100;
    return `<div class="map-link-tooltip__container">
      <img src="${url}" alt="${alt}" class="map-link-tooltip__image" />
      <div class="map-link-tooltip__marker" style="left: ${pctX}%; top: ${pctY}%"></div>
    </div>`;
  }

  hideMapLinkTooltip() {
    if (this.mapLinkTooltipShown) {
      this.mapLinkTooltipShown = false;
      tooltipManager.hideTooltip();
    }
  }

  showMapLinkTooltip(link, event) {
    this.mapLinkTooltipShown = true;
    tooltipManager.showTooltip(this.buildMapLinkTooltip(link.destination), event);
  }

  cantor(x, y) {
    return ((x + y) * (x + y + 1)) / 2 + y;
  }

  _update(timestamp) {
    let doAnotherUpdate = false;
    const elapsed = timestamp - this.previousFrameTime;
    this.previousFrameTime = timestamp;

    if (this.updateRequested-- > 0 && elapsed > 0) {
      // Handle the camera panning
      const panStopThreshold = 0.001;
      const speed = this.cursor.dx * this.cursor.dx + this.cursor.dy * this.cursor.dy;
      if (speed > panStopThreshold) {
        if (!this.camera.isDragging) {
          this.camera.x.goTo(this.camera.x.current + this.cursor.dx * elapsed, 1);
          this.camera.y.goTo(this.camera.y.current + this.cursor.dy * elapsed, 1);
        }
        this.cursor.dx /= elapsed * 0.005 + 1;
        this.cursor.dy /= elapsed * 0.005 + 1;
        // The camera's speed is still high enough to animate it for at least another frame
        doAnotherUpdate = true;
      }

      // Handle the camera zoom
      const zooming = this.camera.zoom.animate(elapsed);
      doAnotherUpdate = zooming || doAnotherUpdate;
      // Handle player following. We don't want to do it while a zoom is also happening since zoom
      // performs a translate to keep it centered on the cursor.
      if (!zooming && this.followingPlayer.name) {
        const [x, y] = this.gamePositionToCameraCenter(
          this.followingPlayer.coordinates.x,
          this.followingPlayer.coordinates.y
        );
        if (this.camera.x.target !== x) {
          this.camera.x.goTo(x, 100);
        }
        if (this.camera.y.target !== y) {
          this.camera.y.goTo(y, 100);
        }
        this.showPlane(this.followingPlayer.coordinates.plane + 1);
      }

      doAnotherUpdate = this.camera.x.animate(elapsed) || doAnotherUpdate;
      doAnotherUpdate = this.camera.y.animate(elapsed) || doAnotherUpdate;

      // Handle the 'fade in' animation for the map tiles
      for (let i = 0; i < this.tilesInView.length; ++i) {
        doAnotherUpdate = this.tilesInView[i].animation?.animate(elapsed) || doAnotherUpdate;
      }

      this.ctx.resetTransform();
      this.ctx.fillStyle = "black";

      this.ctx.setTransform(
        this.camera.zoom.current, // horizontalScaling
        0, // vertical skewing
        0, // horizontal skewing
        this.camera.zoom.current, // vertical scaling
        Math.round(-this.camera.x.current),
        Math.round(this.camera.y.current)
      );

      // Don't try to load tiles if we are panning a large distance
      const distanceLeftToTravel =
        (Math.abs((this.camera.x.target - this.camera.x.current) / this.camera.x.time) +
          Math.abs((this.camera.y.target - this.camera.y.current) / this.camera.y.time)) /
        this.camera.zoom.current;
      const isPanningABigDistance = !zooming && distanceLeftToTravel > 10;

      const s = this.tileSize * this.camera.zoom.current;
      const top = this.camera.y.current / s;
      const left = this.camera.x.current / s;
      const right = left + this.canvas.width / s;
      const bottom = top - this.canvas.height / s;
      this.view = {
        left: Math.floor(left),
        right: Math.ceil(right),
        top: Math.ceil(top),
        bottom: Math.floor(bottom),
      };

      this.drawMapSquaresInView(!isPanningABigDistance);
      this.drawLocations();
      this.drawMapAreaLabels(!isPanningABigDistance);
      this.drawMapLinks();

      this.drawTileMarkers(this.playerMarkers.values(), {
        fillColor: "#348feb",
        strokeColor: "#34d8eb",
        labelPosition: "top",
        labelFill: "yellow",
        labelStroke: "black",
      });
      this.drawTileMarkers(this.interactingMarkers.values(), {
        fillColor: "#a832a8",
        strokeColor: "#cc2ed1",
        labelPosition: "bottom",
        labelFill: "red",
        labelStroke: "black",
      });
      this.drawCursorTile();
    }

    this.updateRequested = doAnotherUpdate ? Math.max(1, this.updateRequested) : this.updateRequested;
    if (!this.isConnected) {
      this.frameRequestId = null;
      return;
    }

    this.frameRequestId = window.requestAnimationFrame(this.update);
  }

  addInteractingMarker(x, y, label) {
    const marker = {
      label,
      coordinates: { x, y, plane: 0 },
    };
    this.interactingMarkers.add(marker);
    return marker;
  }

  removeInteractingMarker(marker) {
    this.interactingMarkers.delete(marker);
  }

  drawGameTiles(positions, fillColor, strokeColor) {
    this.ctx.beginPath();
    this.ctx.fillStyle = fillColor;
    this.ctx.strokeStyle = strokeColor;
    this.ctx.lineWidth = 1;
    for (const position of positions) {
      this.ctx.rect(position.x, position.y, this.pixelsPerGameTile, this.pixelsPerGameTile);
    }
    this.ctx.stroke();
    this.ctx.fill();
    this.ctx.closePath();
  }

  drawLabels(labels, fillColor, strokeColor, position) {
    const groupedByTile = new Map();
    for (const label of labels) {
      const key = this.coordinateKey(label.x, label.y);
      if (!groupedByTile.has(key)) {
        groupedByTile.set(key, []);
      }
      groupedByTile.get(key).push(label);
    }

    this.ctx.fillStyle = fillColor;
    this.ctx.strokeStyle = strokeColor;
    this.ctx.font = `${20 / this.camera.zoom.current}px rssmall`;
    this.ctx.textAlign = "center";
    this.ctx.lineWidth = 1 / this.camera.zoom.current;
    const xOffset = this.pixelsPerGameTile / 2;
    const strokeOffset = 1 / this.camera.zoom.current;

    const yOffsets = {
      top: -18 / this.camera.zoom.current,
      bottom: 18 / this.camera.zoom.current,
    };

    for (const labelsOnTile of groupedByTile.values()) {
      let yOffset = position === "top" ? 0 : this.pixelsPerGameTile + yOffsets[position];
      for (const label of labelsOnTile) {
        let [x, y] = [label.x, label.y];
        x += xOffset;
        y += yOffset;
        yOffset += yOffsets[position];
        this.ctx.strokeText(label.text, x + strokeOffset, y + strokeOffset);
        this.ctx.fillText(label.text, x, y);
      }
    }
  }

  drawTileMarkers(markers, options) {
    const groupedByPlane = [[], [], [], []];
    for (const tileMarker of markers) {
      if (this.isValidCoordinates(tileMarker?.coordinates)) {
        groupedByPlane[tileMarker.coordinates.plane]?.push(tileMarker);
      }
    }

    for (let plane = 0; plane < groupedByPlane.length; ++plane) {
      const tilesOnPlane = groupedByPlane[plane];

      // Change the opacity based on distance to currently displayed plane
      this.ctx.globalAlpha = 1 - Math.abs(this.plane - 1 - plane) * 0.25;

      const positions = [];
      const labelPadPx = 64;
      const padPx = this.pixelsPerGameTile * this.camera.zoom.current + labelPadPx;
      for (const tileMarker of tilesOnPlane) {
        if (!this.isGameTileInView(tileMarker.coordinates.x, tileMarker.coordinates.y, padPx)) continue;
        const [x, y] = this.gamePositionToCanvas(tileMarker.coordinates.x, tileMarker.coordinates.y);
        positions.push({ x, y, text: tileMarker.label });
      }
      this.drawGameTiles(positions, options.fillColor, options.strokeColor);
      this.drawLabels(positions, options.labelFill, options.labelStroke, options.labelPosition);
    }

    this.ctx.globalAlpha = 1;
  }

  drawMapLinks() {
    const links = this.linksOnCurrentPlane().filter((l) => !this.linkIconOverrides?.[l.key]);
    if (links.length === 0) return;
    const destinationSize = this.iconCanvasSize();
    const padPx = (destinationSize * this.camera.zoom.current) / 2 + 2;
    for (const link of links) {
      if (!this.isGameTileInView(link.x, link.y, padPx)) continue;
      const [x, y] = this.gamePositionToCanvas(link.x, link.y);
      this.drawLinkHighlight(x, y, destinationSize, true);
    }
  }

  drawLinkHighlight(centerX, centerY, iconSize, filled) {
    const radius = iconSize / 2 + 2 / this.camera.zoom.current;
    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    if (filled) {
      this.ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
      this.ctx.fill();
    }
    this.ctx.strokeStyle = "rgb(255, 255, 255)";
    this.ctx.lineWidth = 2 / this.camera.zoom.current;
    this.ctx.stroke();
    this.ctx.closePath();
  }

  drawCursorTile() {
    this.drawGameTiles([{ x: this.cursor.canvasX, y: this.cursor.canvasY }], "#348feb", "#34d8eb");
  }

  drawLocations() {
    if (!this.locations) return;
    const imageSize = ICON_SPRITE_SIZE;
    const destinationSize = this.iconCanvasSize();
    const shift = destinationSize / 2;

    const currentPlane = this.plane - 1;
    for (const tile of this.tilesInView) {
      const locations = this.locations[tile.regionX]?.[tile.regionY];
      if (locations) {
        for (const [spriteIndex, coordinates] of Object.entries(locations)) {
          for (let i = 0; i < coordinates.length; i += 3) {
            if (coordinates[i + 2] !== currentPlane) continue;
            const iconX = coordinates[i];
            const iconY = coordinates[i + 1];
            const [x, y] = this.gamePositionToCanvas(iconX, iconY);
            const drawX = Math.round(x - shift);
            const drawY = Math.round(y - shift);
            try {
              this.ctx.drawImage(
                this.locationIconsSheet,
                imageSize * spriteIndex,
                0,
                imageSize,
                imageSize,
                drawX,
                drawY,
                destinationSize,
                destinationSize
              );
            } catch (ex) {
              console.error(`failed to draw map icon ${spriteIndex} ${coordinates}`, ex);
            }
            if (this.linkedIconPositions?.has(this.positionKey(iconX, iconY, currentPlane))) {
              this.drawLinkHighlight(drawX + destinationSize / 2, drawY + destinationSize / 2, destinationSize, false);
            }
          }
        }
      }
    }
  }

  drawMapAreaLabels(loadNewImages) {
    if (!this.mapLabels) return;
    this.mapLabelImages = this.mapLabelImages || new Map();
    const scale = Math.min(this.camera.zoom.current, 2);

    for (let tileX = this.view.left - 1; tileX < this.view.right + 1; ++tileX) {
      for (let tileY = this.view.top + 1; tileY > this.view.bottom; --tileY) {
        const labels = this.mapLabels[tileX]?.[tileY]?.[this.plane - 1];
        if (labels) {
          for (let i = 0; i < labels.length; i += 3) {
            const [x, y] = this.gamePositionToCanvas(labels[i], labels[i + 1]);
            const labelId = labels[i + 2];

            const key = this.coordinateKey(x, y);
            let mapLabelImage = this.mapLabelImages.get(key);
            if (!mapLabelImage) {
              if (!loadNewImages) continue;
              mapLabelImage = new Image();
              mapLabelImage.src = `/map/labels/${labelId}.webp`;
              this.mapLabelImages.set(key, mapLabelImage);
            }

            mapLabelImage.loaded = mapLabelImage.loaded || mapLabelImage.complete;
            if (mapLabelImage.loaded) {
              const width = mapLabelImage.width / scale;
              const height = mapLabelImage.height / scale;
              const shiftX = width / 2;

              try {
                this.ctx.drawImage(mapLabelImage, Math.round(x - shiftX), y, Math.round(width), Math.round(height));
              } catch (ex) {
                console.error(`failed to draw map image label ${labelId}`, ex);
              }
            } else if (!mapLabelImage.onload) {
              mapLabelImage.onload = () => {
                mapLabelImage.loaded = true;
                this.requestUpdate();
              };
            }
          }
        }
      }
    }
  }

  drawMapSquaresInView(loadNewTiles) {
    const top = this.view.top;
    const left = this.view.left;
    const right = this.view.right;
    const bottom = this.view.bottom;
    const tiles = this.tiles[this.plane - 1];
    const imageSize = this.tileSize;
    this.tilesInView = [];

    for (let tileX = left; tileX < right; ++tileX) {
      const tileWorldX = tileX * imageSize;
      for (let tileY = top; tileY > bottom; --tileY) {
        const i = this.cantor(tileX, tileY);
        const tileWorldY = tileY * imageSize;
        if (this.validTiles && !this.validTiles[this.plane - 1]?.has(i)) {
          this.ctx.clearRect(tileWorldX, -tileWorldY, imageSize, imageSize);
          continue;
        }
        let tile = tiles.get(i);

        if (!tile) {
          if (!loadNewTiles) continue;
          tile = new Image(this.tileSize, this.tileSize);
          const tileFileBaseName = `${this.plane - 1}_${tileX}_${tileY}`;
          tile.src = `/map/${tileFileBaseName}.webp`;
          tile.regionX = tileX;
          tile.regionY = tileY;
          tiles.set(i, tile);
        }

        this.tilesInView.push(tile);
        tile.loaded = tile.loaded || tile.complete;
        if (tile.loaded && tile.animation) {
          const alpha = tile.animation.current;
          this.ctx.globalAlpha = alpha;
          try {
            if (alpha < 1) {
              // NOTE: Clearing only the area of the image tile while it fades in. If we try
              // to clear the whole canvas instead, chromium browers will show a small border
              // around the tiles.
              this.ctx.clearRect(tileWorldX, -tileWorldY, imageSize, imageSize);
            }
            try {
              this.ctx.drawImage(tile, tileWorldX, -tileWorldY);
            } catch (ex) {
              console.error(`failed to draw map tile ${this.plane - 1}_${tileX}_${tileY}`, ex);
            }
          } catch {}
        } else if (!tile.onload) {
          tile.onload = () => {
            tile.animation = new Animation({ current: 0, target: 1, time: 300 });
            tile.loaded = true;
            this.requestUpdate();
          };
        } else {
          this.ctx.clearRect(tileWorldX, -tileWorldY, imageSize, imageSize);
        }
      }
    }

    this.ctx.globalAlpha = 1;
  }

  showPlane(plane) {
    if (this.plane !== plane) {
      this.plane = plane;
      this.dispatchEvent(
        new CustomEvent("plane-changed", {
          detail: {
            plane,
          },
        })
      );

      this.requestUpdate();
    }
  }

  onResize() {
    this.canvas.width = this.offsetWidth;
    this.canvas.height = this.offsetHeight;
    this.ctx.imageSmoothingEnabled = false;

    this.requestUpdate();
  }

  onMouseLeave() {
    this.pendingMapLink = null;
    this.pointerDragged = false;
    this.hoveredMapLink = null;
    this.hideMapLinkTooltip();
    this.style.cursor = "";
    this.stopDragging();
  }

  beginMapLinkPress(link, clientX, clientY) {
    this.pendingMapLink = link;
    this.pointerDownX = clientX;
    this.pointerDownY = clientY;
    this.pointerDragged = false;
  }

  checkMapLinkDragThreshold(clientX, clientY) {
    const dx = clientX - this.pointerDownX;
    const dy = clientY - this.pointerDownY;
    if (dx * dx + dy * dy > 25) {
      this.pointerDragged = true;
      this.pendingMapLink = null;
      this.hideMapLinkTooltip();
      this.style.cursor = "grabbing";
      this.startDragging(clientX, clientY);
      return true;
    }
    return false;
  }

  onPointerDown(event) {
    const link = this.getLinkAtClient(event.clientX, event.clientY);
    if (link) {
      this.beginMapLinkPress(link, event.clientX, event.clientY);
      return;
    }
    this.startDragging(event.clientX, event.clientY);
  }

  pinchDistance(touches) {
    const touch1 = touches[0];
    const touch2 = touches[1];
    const a = touch1.clientX - touch2.clientX;
    const b = touch1.clientY - touch2.clientY;

    return Math.sqrt(a * a + b * b);
  }

  pinchCenter(touches) {
    const touch1 = touches[0];
    const touch2 = touches[1];

    return [(touch1.clientX + touch2.clientX) / 2, (touch1.clientY + touch2.clientY) / 2];
  }

  onTouchStart(event) {
    if (event.touches.length === 1) {
      const touch = event.touches[0];
      const link = this.getLinkAtClient(touch.clientX, touch.clientY);
      if (link) {
        this.beginMapLinkPress(link, touch.clientX, touch.clientY);
        event.preventDefault();
        return;
      }
    } else if (event.touches.length === 2) {
      this.pendingMapLink = null;
      this.touch.startDistance = this.pinchDistance(event.touches);
      this.touch.startZoom = this.camera.zoom.current;
    }
  }

  startDragging(x, y) {
    this.classList.add("dragging");
    this.camera.isDragging = true;
    this.camera.x.cancelAnimation();
    this.camera.y.cancelAnimation();
    this.camera.zoom.cancelAnimation();
    this.cursor.frameX = [];
    this.cursor.frameY = [];
    this.cursor.dx = 0;
    this.cursor.dy = 0;
    this.cursor.previousX = x;
    this.cursor.previousY = y;
    this.cursor.lastPointerMoveTime = performance.now();
    this.stopFollowingPlayer();
    this.requestUpdate();
  }

  stopDragging() {
    if (this.pendingMapLink) {
      if (!this.pointerDragged) {
        this.goToMapLink(this.pendingMapLink.destination);
      }
      this.pendingMapLink = null;
      this.pointerDragged = false;
      return;
    }
    this.classList.remove("dragging");
    // To handle cases when the pointer stops moving before letting go
    const elapsed = performance.now() - this.cursor.lastPointerMoveTime;
    if (elapsed > 200) {
      this.cursor.dx = 0;
      this.cursor.dy = 0;
    }
    this.camera.isDragging = false;
    this.requestUpdate();
  }

  processPointerMove(x, y) {
    const dx = x - this.cursor.previousX || 0;
    const dy = y - this.cursor.previousY || 0;
    this.cursor.previousX = x;
    this.cursor.previousY = y;
    this.handleMovement(x, y, dx, dy);
  }

  onPointerMove(event) {
    if (this.pendingMapLink) {
      if (this.checkMapLinkDragThreshold(event.clientX, event.clientY)) {
        this.processPointerMove(event.clientX, event.clientY);
      }
      return;
    }
    this.processPointerMove(event.clientX, event.clientY);
    if (this.camera.isDragging) return;
    const link = this.getLinkAtClient(event.clientX, event.clientY);
    if (link) {
      if (this.hoveredMapLink?.key !== link.key) {
        this.hoveredMapLink = link;
        this.showMapLinkTooltip(link, event);
      }
      this.style.cursor = "pointer";
      return;
    }
    if (this.hoveredMapLink) {
      this.hoveredMapLink = null;
      this.hideMapLinkTooltip();
    }
    this.style.cursor = "";
  }

  onTouchMove(event) {
    if (event.touches.length === 1) {
      const touch = event.touches[0];
      if (this.pendingMapLink) {
        if (this.checkMapLinkDragThreshold(touch.clientX, touch.clientY)) {
          this.processPointerMove(touch.clientX, touch.clientY);
        }
        return;
      }
      if (!this.camera.isDragging) {
        this.startDragging(touch.clientX, touch.clientY);
      }
      this.processPointerMove(touch.clientX, touch.clientY);
    } else if (event.touches.length === 2) {
      this.stopDragging();
      const pinchDistance = this.pinchDistance(event.touches);

      const scale = pinchDistance / this.touch.startDistance;
      const a = scale * Math.pow(2, this.touch.startZoom);
      const zoom = Math.log(a) / Math.LN2;
      const [x, y] = this.pinchCenter(event.touches);
      this.zoomOntoPoint({
        x,
        y,
        zoom,
      });
    }
  }

  pushFrame(key, value, maxItems) {
    this.cursor[key].push(value);
    if (this.cursor[key].length > maxItems) {
      this.cursor[key] = this.cursor[key].slice(this.cursor[key].length - maxItems);
    }
  }

  handleMovement(x, y, dx, dy) {
    const elapsed = performance.now() - this.cursor.lastPointerMoveTime;
    this.cursor.lastPointerMoveTime = performance.now();

    // cursor.dx and cursor.dy are calculated as the average movement over the last 5 frames. This is used
    // to calculate the speed after dragging has stopped which is used to animate and convey momentum.
    if (elapsed) {
      const eventsToKeep = 5;
      this.pushFrame("frameX", -dx / elapsed, eventsToKeep);
      this.pushFrame("frameY", dy / elapsed, eventsToKeep);
    }

    if (this.camera.isDragging) {
      this.camera.x.goTo(this.camera.x.target - dx, 1);
      this.camera.y.goTo(this.camera.y.target + dy, 1);
      this.cursor.dx = utility.average(this.cursor.frameX) || 0;
      this.cursor.dy = utility.average(this.cursor.frameY) || 0;
    }

    const canvasRect = this.canvas.getBoundingClientRect();
    this.cursor.x = x - canvasRect.left;
    this.cursor.y = y - canvasRect.top;
    this.cursor.tileX = Math.floor((this.cursor.x + this.camera.x.current) / this.tileSize / this.camera.zoom.current);
    this.cursor.tileY = Math.floor(
      (this.camera.y.current - this.cursor.y + this.tileSize) / this.tileSize / this.camera.zoom.current
    );
    this.cursor.worldX = Math.floor(
      (this.cursor.x + this.camera.x.current) / this.pixelsPerGameTile / this.camera.zoom.current
    );
    this.cursor.worldY = Math.floor(
      (this.camera.y.current - this.cursor.y) / this.pixelsPerGameTile / this.camera.zoom.current +
        this.tileSize / this.pixelsPerGameTile
    );
    this.cursor.canvasX = this.cursor.worldX * this.pixelsPerGameTile;
    this.cursor.canvasY = -this.cursor.worldY * this.pixelsPerGameTile + this.tileSize - this.pixelsPerGameTile;

    this.requestUpdate();

    this.coordinatesDisplay.innerText = `${this.cursor.worldX}, ${this.cursor.worldY}`;
  }

  onScroll(event) {
    if (this.camera.isDragging) return;
    this.zoomOntoPoint({
      delta: -0.2 * Math.sign(event.deltaY) * this.camera.zoom.target,
      x: this.cursor.x,
      y: this.cursor.y,
      animationTime: 100,
    });
  }

  // Zooms and keeps a point at the same screen position during the zoom
  zoomOntoPoint(options) {
    if (this.camera.isDragging) return;
    this.cursor.dx = 0;
    this.cursor.dy = 0;

    let newZoom;
    if (options.zoom === undefined) {
      // Calculate a zoom change that keeps this.tileSize * zoom an integer value.
      // We don't want the canvas to have a zoom in the transform that makes the map tiles
      // a non integer size or it will cause black border to show around them.
      const targetTileSize = this.tileSize * options.delta;
      const delta = Math.round(targetTileSize) / this.tileSize;
      newZoom = Math.min(Math.max(this.camera.zoom.target + delta, this.camera.minZoom), this.camera.maxZoom);
    } else {
      // touch zoom
      newZoom = Math.min(Math.max(options.zoom, this.camera.minZoom), this.camera.maxZoom);
    }

    const zoomDelta = newZoom - this.camera.zoom.target;
    if (zoomDelta === 0) return;

    const width = this.canvas.width;
    const height = this.canvas.height;

    let x = options.x;
    let y = options.y;
    if (this.followingPlayer.name) {
      [x, y] = this.gamePositionToClient(this.followingPlayer.coordinates.x, this.followingPlayer.coordinates.y);
    }
    const wx = (-x - this.camera.x.target) / (width * this.camera.zoom.target);
    const wy = (y - this.camera.y.target) / (height * this.camera.zoom.target);

    this.camera.x.goTo(this.camera.x.target - wx * width * zoomDelta, options.animationTime || 1);
    this.camera.y.goTo(this.camera.y.target - wy * height * zoomDelta, options.animationTime || 1);
    this.camera.zoom.goTo(newZoom, options.animationTime || 1);
    this.requestUpdate();
  }
}

customElements.define("canvas-map", CanvasMap);
