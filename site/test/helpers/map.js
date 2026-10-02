import { Animation } from "../../src/canvas-map/animation";
import { CanvasMap } from "../../src/canvas-map/canvas-map";

/**
 * The map as the tests use it: never connected to a page, with what
 * `connectedCallback` would have set up put in by hand. An 800 by 600 canvas
 * at zoom 1, the ground floor, nobody on it. A test that draws gives it a
 * `ctx` of its own.
 */
export function createMap() {
  const map = new CanvasMap();
  map.plane = 1;
  map.tileSize = 256;
  map.pixelsPerGameTile = 4;
  map.canvas = { width: 800, height: 600, getBoundingClientRect: () => ({ left: 0, top: 0 }) };
  map.camera = {
    x: new Animation({ current: 0, target: 0, progress: 1 }),
    y: new Animation({ current: 0, target: 0, progress: 1 }),
    zoom: new Animation({ current: 1, target: 1, progress: 1 }),
    maxZoom: 6,
    minZoom: 0.5,
    isDragging: false,
  };
  map.cursor = { x: 0, y: 0, frameX: [0], frameY: [0] };
  map.touch = {};
  map.playerMarkers = new Map();
  map.renderedPlayers = [];
  map.renderedEvents = [];
  map.followingPlayer = {};
  map.tiles = [new Map(), new Map(), new Map(), new Map()];
  map.tilesInView = [];
  map.updateRequested = 0;
  map.coordinatesDisplay = { innerText: "" };
  return map;
}

/** Puts a game tile in the middle of the map, at once. */
export function centerOn(map, x, y) {
  const [cx, cy] = map.gamePositionToCameraCenter(x, y);
  map.camera.x.current = cx;
  map.camera.y.current = cy;
}
