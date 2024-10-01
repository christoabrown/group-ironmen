import { BaseElement } from "../base-element/base-element";
import { utility } from "../utility";
import { Animation } from "./animation";

export class CanvasMap extends BaseElement {
  constructor() {
    super();
  }

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
    this.eventListener(this, "touchstart", this.onTouchStart.bind(this));
    this.eventListener(this, "mouseup", this.onPointerUp.bind(this));
    this.eventListener(this, "touchend", this.onPointerUp.bind(this));
    this.eventListener(this, "mousemove", this.onPointerMove.bind(this));
    this.eventListener(this, "touchmove", this.onTouchMove.bind(this));
    this.eventListener(this, "wheel", this.onScroll.bind(this));
    this.eventListener(this, "mouseleave", this.stopDragging.bind(this));
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
        current: 1,
        target: 1,
        progress: 1,
      }),
      maxZoom: 6,
      minZoom: 1,
      isDragging: false,
    };
    this.cursor = {
      x: 0,
      y: 0,
      frameX: [0],
      frameY: [0],
    };
    this.touch = {
      pinchDistance: 0,
    };

    const [startX, startY] = this.gamePositionToCameraCenter(3103, 3095);
    this.camera.x.goTo(startX, 1);
    this.camera.y.goTo(startY, 1);

    this.getMapJson();
    this.update = this._update.bind(this);
    this.requestUpdate();
    window.requestAnimationFrame(this.update);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  async getMapJson() {
    const response = await fetch("/data/map.json");
    const data = await response.json();
    this.validTiles = [];
    for (const x of data.tiles) {
      this.validTiles.push(new Set(x));
    }

    this.locations = {};
    for (const tileRegionX of Object.keys(data.icons)) {
      const x = parseInt(tileRegionX);
      this.locations[x] = {};
      for (const tileRegionY of Object.keys(data.icons[tileRegionX])) {
        const y = parseInt(tileRegionY);
        this.locations[x][y] = {};
        for (const spriteIndex of Object.keys(data.icons[tileRegionX][tileRegionY])) {
          this.locations[x][y][parseInt(spriteIndex)] = data.icons[tileRegionX][tileRegionY][spriteIndex];
        }
      }
    }

    this.mapLabels = {};
    for (const tileRegionX of Object.keys(data.labels)) {
      const x = parseInt(tileRegionX);
      this.mapLabels[x] = {};
      for (const tileRegionY of Object.keys(data.labels[tileRegionX])) {
        const y = parseInt(tileRegionY);
        this.mapLabels[x][y] = {};
        for (const z of Object.keys(data.labels[tileRegionX][tileRegionY])) {
          this.mapLabels[x][y][parseInt(z)] = data.labels[tileRegionX][tileRegionY][z];
        }
      }
    }

    this.locationIconsSheet = new Image();
    this.locationIconsSheet.src = utility.image("/map/icons/map_icons.webp");
    this.locationIconsSheet.onload = () => {
      this.requestUpdate();
    };
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

      if (this.isGameTileInView(coordinates.x, coordinates.y)) {
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

  // Checks if a tile in the runescape world is currently visible on the canvas
  isGameTileInView(x, y) {
    const padding = this.tileSize / this.pixelsPerGameTile;
    const [clientLeft, clientTop] = this.gamePositionToClient(x + padding, y - padding);
    const [clientRight, clientBottom] = this.gamePositionToClient(x - padding, y + padding);
    return clientLeft >= 0 && clientRight <= this.canvas.width && clientTop >= 0 && clientBottom <= this.canvas.height;
  }

  requestUpdate() {
    this.updateRequested = 1;
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
      if (!this.camera.isDragging) {
        if (speed > panStopThreshold) {
          this.camera.x.goTo(this.camera.x.current + this.cursor.dx * elapsed, 1);
          this.camera.y.goTo(this.camera.y.current + this.cursor.dy * elapsed, 1);
        }
      }
      if (speed > panStopThreshold) {
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
    window.requestAnimationFrame(this.update);
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
      const x = this.cantor(label.x, label.y);
      if (!groupedByTile.has(x)) {
        groupedByTile.set(x, []);
      }
      groupedByTile.get(x).push(label);
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
        groupedByPlane[tileMarker.coordinates.plane].push(tileMarker);
      }
    }

    for (let plane = 0; plane < groupedByPlane.length; ++plane) {
      const tilesOnPlane = groupedByPlane[plane];

      // Change the opacity based on distance to currently displayed plane
      this.ctx.globalAlpha = 1 - Math.abs(this.plane - 1 - plane) * 0.25;

      const positions = [];
      for (const tileMarker of tilesOnPlane) {
        const [x, y] = this.gamePositionToCanvas(tileMarker.coordinates.x, tileMarker.coordinates.y);
        positions.push({ x, y, text: tileMarker.label });
      }
      this.drawGameTiles(positions, options.fillColor, options.strokeColor);
      this.drawLabels(positions, options.labelFill, options.labelStroke, options.labelPosition);
    }

    this.ctx.globalAlpha = 1;
  }

  drawCursorTile() {
    this.drawGameTiles([{ x: this.cursor.canvasX, y: this.cursor.canvasY }], "#348feb", "#34d8eb");
  }

  drawLocations() {
    if (!this.locations) return;
    const imageSize = 15;
    const imageSizeHalf = imageSize / 2;
    // Scale the location icons down with zoom down up to a maximum. Larger number here means a smaller icon.
    const scale = Math.min(this.camera.zoom.current, 3);
    const shift = imageSizeHalf / scale;
    const destinationSize = imageSize / scale;

    for (const tile of this.tilesInView) {
      const locations = this.locations[tile.regionX]?.[tile.regionY];
      if (locations) {
        for (const [spriteIndex, coordinates] of Object.entries(locations)) {
          for (let i = 0; i < coordinates.length; i += 2) {
            const [x, y] = this.gamePositionToCanvas(coordinates[i], coordinates[i + 1]);
            this.ctx.drawImage(
              this.locationIconsSheet,
              imageSize * spriteIndex,
              0,
              imageSize,
              imageSize,
              Math.round(x - shift),
              Math.round(y - shift),
              destinationSize,
              destinationSize
            );
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

            const key = this.cantor(x, y);
            let mapLabelImage = this.mapLabelImages.get(key);
            if (!mapLabelImage && loadNewImages) {
              mapLabelImage = new Image();
              mapLabelImage.src = utility.image(`/map/labels/${labelId}.webp`);
              this.mapLabelImages.set(key, mapLabelImage);
            } else if (!mapLabelImage && !loadNewImages) {
              continue;
            }

            mapLabelImage.loaded = mapLabelImage.loaded || mapLabelImage.complete;
            if (mapLabelImage.loaded) {
              const width = mapLabelImage.width / scale;
              const height = mapLabelImage.height / scale;
              const shiftX = width / 2;

              this.ctx.drawImage(mapLabelImage, Math.round(x - shiftX), y, Math.round(width), Math.round(height));
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
        if (this.validTiles && !this.validTiles[this.plane - 1].has(i)) {
          this.ctx.clearRect(tileWorldX, -tileWorldY, imageSize, imageSize);
          continue;
        }
        let tile = tiles.get(i);

        if (!tile && loadNewTiles) {
          tile = new Image(this.tileSize, this.tileSize);
          const tileFileBaseName = `${this.plane - 1}_${tileX}_${tileY}`;
          tile.src = utility.image(`/map/${tileFileBaseName}.webp`);
          tile.regionX = tileX;
          tile.regionY = tileY;
          tiles.set(i, tile);
        } else if (!tile && !loadNewTiles) {
          continue;
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
            this.ctx.drawImage(tile, tileWorldX, -tileWorldY);
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

  onPointerDown(event) {
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
    if (event.touches.length === 2) {
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

  onPointerUp() {
    this.stopDragging();
  }

  stopDragging() {
    this.classList.remove("dragging");
    // To handle cases when the pointer stops moving before letting go
    const elapsed = performance.now() - this.cursor.lastPointerMoveTime;
    if (elapsed > 100) {
      this.cursor.dx = 0;
      this.cursor.dy = 0;
    }
    this.camera.isDragging = false;
    this.requestUpdate();
  }

  onPointerMove(event) {
    const x = event.clientX;
    const y = event.clientY;
    const dx = x - this.cursor.previousX || 0;
    const dy = y - this.cursor.previousY || 0;
    this.cursor.previousX = x;
    this.cursor.previousY = y;
    this.handleMovement(x, y, dx, dy);
  }

  onTouchMove(event) {
    if (event.touches.length === 1) {
      const touch = event.touches[0];
      if (!this.camera.isDragging) {
        this.startDragging(touch.clientX, touch.clientY);
      }
      const x = touch.clientX;
      const y = touch.clientY;
      const dx = x - this.cursor.previousX || 0;
      const dy = y - this.cursor.previousY || 0;
      this.cursor.previousX = x;
      this.cursor.previousY = y;
      this.handleMovement(x, y, dx, dy);
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

  handleMovement(x, y, dx, dy) {
    const elapsed = performance.now() - this.cursor.lastPointerMoveTime;
    this.cursor.lastPointerMoveTime = performance.now();

    // cursor.dx and cursor.dy are calculated as the average movement over 10 frames. This is used
    // to calculate the speed after dragging has stopped which is used to animate and convey momentum.
    if (elapsed) {
      const eventsToKeep = 10;
      this.cursor.frameX.push(-dx / elapsed);
      if (this.cursor.frameX.length > eventsToKeep) {
        this.cursor.frameX = this.cursor.frameX.slice(this.cursor.frameX.length - eventsToKeep);
      }
      this.cursor.frameY.push(dy / elapsed);
      if (this.cursor.frameY.length > eventsToKeep) {
        this.cursor.frameY = this.cursor.frameY.slice(this.cursor.frameY.length - eventsToKeep);
      }
    }

    if (this.camera.isDragging) {
      this.camera.x.goTo(this.camera.x.target - dx, 1);
      this.camera.y.goTo(this.camera.y.target + dy, 1);
      this.cursor.dx = utility.average(this.cursor.frameX) || 0;
      this.cursor.dy = utility.average(this.cursor.frameY) || 0;
    }

    this.cursor.x = x - this.canvas.offsetTop;
    this.cursor.y = y - this.canvas.offsetLeft;
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
      if (options.delta > 0) {
        newZoom = Math.min(Math.max(this.camera.zoom.target + delta, this.camera.minZoom), this.camera.maxZoom);
      } else {
        newZoom = Math.min(Math.max(this.camera.zoom.target + delta, this.camera.minZoom), this.camera.maxZoom);
      }
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
