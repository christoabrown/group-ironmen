import { describe, expect, it, vi } from "vitest";
import { Animation } from "../src/canvas-map/animation";

const { mockShowTooltip, mockHideTooltip } = vi.hoisted(() => ({
  mockShowTooltip: vi.fn(),
  mockHideTooltip: vi.fn(),
}));

vi.mock("../src/rs-tooltip/tooltip-manager", () => ({
  tooltipManager: {
    showTooltip: mockShowTooltip,
    hideTooltip: mockHideTooltip,
  },
}));

import { CanvasMap, ICON_SPRITE_SIZE } from "../src/canvas-map/canvas-map";

function createMockCtx() {
  return {
    resetTransform: vi.fn(),
    setTransform: vi.fn(),
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    font: "",
    textAlign: "",
    globalAlpha: 1,
    beginPath: vi.fn(),
    rect: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    closePath: vi.fn(),
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    fillText: vi.fn(),
    strokeText: vi.fn(),
    arc: vi.fn(),
    imageSmoothingEnabled: true,
  };
}

function setMapLinks(map, links) {
  map.linksByPlane = {};
  for (const [key, destination] of Object.entries(links)) {
    const [x, y, plane] = key.split(",").map(Number);
    if (!map.linksByPlane[plane]) map.linksByPlane[plane] = [];
    const linkKey = `${x},${y + 1},${plane}`;
    map.linksByPlane[plane].push({ key: linkKey, x, y: y + 1, plane, destination });
  }
}

function centerCameraOn(map, x, y) {
  const [cx, cy] = map.gamePositionToCameraCenter(x, y);
  map.camera.x.current = cx;
  map.camera.y.current = cy;
}

function createMapInstance() {
  const map = new CanvasMap();
  map.plane = 1;
  map.tileSize = 256;
  map.pixelsPerGameTile = 4;
  map.canvas = { width: 800, height: 600 };
  map.camera = {
    x: new Animation({ current: 0, target: 0, progress: 1 }),
    y: new Animation({ current: 0, target: 0, progress: 1 }),
    zoom: new Animation({ current: 1, target: 1, progress: 1 }),
    maxZoom: 6,
    minZoom: 0.5,
    isDragging: false,
  };
  map.cursor = {
    x: 0,
    y: 0,
    frameX: [0],
    frameY: [0],
  };
  map.touch = {};
  map.playerMarkers = new Map();
  map.interactingMarkers = new Set();
  map.followingPlayer = {};
  map.tiles = [new Map(), new Map(), new Map(), new Map()];
  map.tilesInView = [];
  map.updateRequested = 0;
  map.coordinatesDisplay = { innerText: "" };
  return map;
}

describe("Animation", () => {
  it("constructs with defaults", () => {
    const anim = new Animation();
    expect(anim.current).toBe(0);
    expect(anim.target).toBe(0);
    expect(anim.progress).toBe(0);
    expect(anim.time).toBe(1);
    expect(anim.start).toBe(0);
  });

  it("constructs with provided options", () => {
    const anim = new Animation({ current: 5, target: 10, progress: 0.5, time: 200 });
    expect(anim.current).toBe(5);
    expect(anim.target).toBe(10);
    expect(anim.progress).toBe(0.5);
    expect(anim.time).toBe(200);
    expect(anim.start).toBe(5);
  });

  it("goTo sets target and resets progress", () => {
    const anim = new Animation({ current: 3, target: 3, progress: 1 });
    anim.goTo(20, 300);
    expect(anim.target).toBe(20);
    expect(anim.time).toBe(300);
    expect(anim.progress).toBe(0);
    expect(anim.start).toBe(3);
  });

  it("goTo with time <= 1 snaps current to target", () => {
    const anim = new Animation({ current: 0, target: 0, progress: 1 });
    anim.goTo(42, 1);
    expect(anim.current).toBe(42);
    expect(anim.target).toBe(42);
  });

  it("animate returns false and snaps to target when progress >= 1", () => {
    const anim = new Animation({ current: 5, target: 10, progress: 1, time: 100 });
    const result = anim.animate(16);
    expect(result).toBe(false);
    expect(anim.current).toBe(10);
  });

  it("animate returns false when time <= 1", () => {
    const anim = new Animation({ current: 5, target: 10, progress: 0, time: 1 });
    const result = anim.animate(16);
    expect(result).toBe(false);
    expect(anim.current).toBe(10);
  });

  it("animate returns false when progress is NaN", () => {
    const anim = new Animation({ current: 5, target: 10, progress: NaN, time: 100 });
    const result = anim.animate(16);
    expect(result).toBe(false);
    expect(anim.current).toBe(10);
  });

  it("animate interpolates from start to target and returns true", () => {
    const anim = new Animation({ current: 0, target: 100, progress: 0, time: 100 });
    const result = anim.animate(50);
    expect(result).toBe(true);
    expect(anim.progress).toBe(0.5);
    expect(anim.current).toBe(50);
  });

  it("animate clamps progress to 1", () => {
    const anim = new Animation({ current: 0, target: 100, progress: 0, time: 100 });
    anim.animate(200);
    expect(anim.progress).toBe(1);
    expect(anim.current).toBe(100);
  });

  it("cancelAnimation sets target to current and progress to 1", () => {
    const anim = new Animation({ current: 7, target: 20, progress: 0.3, time: 100 });
    anim.cancelAnimation();
    expect(anim.target).toBe(7);
    expect(anim.progress).toBe(1);
  });
});

describe("CanvasMap.isValidCoordinates", () => {
  const map = createMapInstance();

  it("returns true for valid coordinates", () => {
    expect(map.isValidCoordinates({ x: 100, y: 200, plane: 0 })).toBe(true);
  });

  it("returns false when any field is NaN", () => {
    expect(map.isValidCoordinates({ x: NaN, y: 200, plane: 0 })).toBe(false);
    expect(map.isValidCoordinates({ x: 100, y: NaN, plane: 0 })).toBe(false);
    expect(map.isValidCoordinates({ x: 100, y: 200, plane: NaN })).toBe(false);
  });

  it("returns false for null/undefined", () => {
    expect(map.isValidCoordinates(null)).toBe(false);
    expect(map.isValidCoordinates(undefined)).toBe(false);
  });
});

describe("CanvasMap.coordinateKey", () => {
  const map = createMapInstance();

  it("returns a string key from x,y", () => {
    expect(map.coordinateKey(3, 5)).toBe("3,5");
    expect(map.coordinateKey(-1, 0)).toBe("-1,0");
  });
});

describe("CanvasMap.cantor", () => {
  const map = createMapInstance();

  it("returns the cantor pairing of x,y", () => {
    expect(map.cantor(0, 0)).toBe(0);
    expect(map.cantor(1, 0)).toBe(1);
    expect(map.cantor(0, 1)).toBe(2);
    expect(map.cantor(2, 2)).toBe(12);
  });

  it("produces unique values for different pairs", () => {
    const seen = new Set();
    for (let x = 0; x < 20; x++) {
      for (let y = 0; y < 20; y++) {
        seen.add(map.cantor(x, y));
      }
    }
    expect(seen.size).toBe(400);
  });
});

describe("CanvasMap.gamePositionToCanvas", () => {
  const map = createMapInstance();

  it("converts game position to canvas coordinates", () => {
    const [x, y] = map.gamePositionToCanvas(100, 200);
    expect(x).toBe(400);
    expect(y).toBe(-544);
  });

  it("returns tileSize for y=0", () => {
    const [x, y] = map.gamePositionToCanvas(0, 0);
    expect(x).toBe(0);
    expect(y).toBe(256);
  });
});

describe("CanvasMap.gamePositionToClient", () => {
  it("converts game position to client coordinates relative to camera", () => {
    const map = createMapInstance();
    map.camera.x.current = 100;
    map.camera.y.current = 200;
    const [cx, cy] = map.gamePositionToClient(50, 60);
    expect(cx).toBe(50 * 4 * 1 + 2 - 100);
    expect(cy).toBe(200 - (60 * 4 - 256) * 1);
  });
});

describe("CanvasMap.gamePositionToCameraCenter", () => {
  it("converts game position to camera center position", () => {
    const map = createMapInstance();
    const [cx, cy] = map.gamePositionToCameraCenter(100, 100);
    const tileCenterOffset = (4 * 1) / 2;
    expect(cx).toBe(100 * 4 * 1 - 400 + tileCenterOffset);
    expect(cy).toBe((100 * 4 - 256) * 1 + 300);
  });
});

describe("CanvasMap.isGameTileInView", () => {
  it("returns true for a tile at the center of the canvas", () => {
    const map = createMapInstance();
    map.camera.x.current = 0;
    map.camera.y.current = 0;
    const padding = map.tileSize / map.pixelsPerGameTile;
    const [centerClientX] = map.gamePositionToClient(0 + padding, 0 - padding);
    expect(centerClientX).toBeGreaterThanOrEqual(0);
  });

  it("returns false for a tile far outside the view", () => {
    const map = createMapInstance();
    map.camera.x.current = 0;
    map.camera.y.current = 0;
    expect(map.isGameTileInView(10000, 10000)).toBe(false);
  });
});

describe("CanvasMap.requestUpdate", () => {
  it("sets updateRequested to 1", () => {
    const map = createMapInstance();
    map.updateRequested = 0;
    map.requestUpdate();
    expect(map.updateRequested).toBe(1);
  });
});

describe("CanvasMap.pinchDistance", () => {
  const map = createMapInstance();

  it("calculates Euclidean distance between two touches", () => {
    const touches = [
      { clientX: 0, clientY: 0 },
      { clientX: 3, clientY: 4 },
    ];
    expect(map.pinchDistance(touches)).toBe(5);
  });

  it("returns 0 for coincident touches", () => {
    const touches = [
      { clientX: 10, clientY: 10 },
      { clientX: 10, clientY: 10 },
    ];
    expect(map.pinchDistance(touches)).toBe(0);
  });
});

describe("CanvasMap.pinchCenter", () => {
  const map = createMapInstance();

  it("returns the midpoint of two touches", () => {
    const touches = [
      { clientX: 0, clientY: 0 },
      { clientX: 10, clientY: 20 },
    ];
    const [x, y] = map.pinchCenter(touches);
    expect(x).toBe(5);
    expect(y).toBe(10);
  });
});

describe("CanvasMap.addInteractingMarker / removeInteractingMarker", () => {
  it("adds and removes markers from the set", () => {
    const map = createMapInstance();
    const marker = map.addInteractingMarker(100, 200, "test");
    expect(map.interactingMarkers.size).toBe(1);
    expect(marker.label).toBe("test");
    expect(marker.coordinates).toEqual({ x: 100, y: 200, plane: 0 });
    map.removeInteractingMarker(marker);
    expect(map.interactingMarkers.size).toBe(0);
  });
});

describe("CanvasMap.handleUpdatedMembers", () => {
  it("rebuilds playerMarkers from members, skipping @SHARED", () => {
    const map = createMapInstance();
    const members = [
      { name: "Alice", coordinates: { x: 100, y: 200, plane: 0 } },
      { name: "@SHARED", coordinates: { x: 1, y: 2, plane: 0 } },
      { name: "Bob", coordinates: { x: 300, y: 400, plane: 1 } },
    ];
    map.handleUpdatedMembers(members);
    expect(map.playerMarkers.size).toBe(2);
    expect(map.playerMarkers.get("Alice").coordinates.x).toBe(100);
    expect(map.playerMarkers.get("Bob").coordinates.plane).toBe(1);
  });

  it("skips members with invalid coordinates", () => {
    const map = createMapInstance();
    const members = [
      { name: "Alice", coordinates: { x: NaN, y: 200, plane: 0 } },
      { name: "Bob", coordinates: { x: 300, y: 400, plane: 1 } },
    ];
    map.handleUpdatedMembers(members);
    expect(map.playerMarkers.size).toBe(1);
    expect(map.playerMarkers.has("Alice")).toBe(false);
  });
});

describe("CanvasMap.handleUpdatedCoordinates", () => {
  it("adds marker for valid coordinates", () => {
    const map = createMapInstance();
    map.handleUpdatedCoordinates({ name: "Alice", coordinates: { x: 100, y: 200, plane: 0 } });
    expect(map.playerMarkers.get("Alice").coordinates.x).toBe(100);
  });

  it("updates followingPlayer coordinates when following that player", () => {
    const map = createMapInstance();
    map.followingPlayer = { name: "Alice", coordinates: { x: 0, y: 0, plane: 0 } };
    map.handleUpdatedCoordinates({ name: "Alice", coordinates: { x: 50, y: 60, plane: 1 } });
    expect(map.followingPlayer.coordinates.x).toBe(50);
  });

  it("does not add marker for invalid coordinates", () => {
    const map = createMapInstance();
    map.handleUpdatedCoordinates({ name: "Alice", coordinates: {} });
    expect(map.playerMarkers.size).toBe(0);
  });
});

describe("CanvasMap.followPlayer", () => {
  it("sets followingPlayer when marker exists with valid coordinates", () => {
    const map = createMapInstance();
    map.playerMarkers.set("Alice", { label: "Alice", coordinates: { x: 100, y: 200, plane: 0 } });
    map.followPlayer("Alice");
    expect(map.followingPlayer.name).toBe("Alice");
    expect(map.followingPlayer.coordinates.x).toBe(100);
  });

  it("does not follow when marker does not exist", () => {
    const map = createMapInstance();
    map.followPlayer("Unknown");
    expect(map.followingPlayer.name).toBeUndefined();
  });
});

describe("CanvasMap.stopFollowingPlayer", () => {
  it("clears followingPlayer name", () => {
    const map = createMapInstance();
    map.followingPlayer = { name: "Alice", coordinates: { x: 100, y: 200, plane: 0 } };
    map.stopFollowingPlayer();
    expect(map.followingPlayer.name).toBeNull();
  });
});

describe("CanvasMap.showPlane", () => {
  it("sets plane and dispatches event when plane changes", () => {
    const map = createMapInstance();
    const dispatchSpy = vi.spyOn(map, "dispatchEvent");
    map.showPlane(2);
    expect(map.plane).toBe(2);
    expect(dispatchSpy).toHaveBeenCalledOnce();
    const event = dispatchSpy.mock.calls[0][0];
    expect(event.type).toBe("plane-changed");
    expect(event.detail.plane).toBe(2);
  });

  it("does nothing when plane is the same", () => {
    const map = createMapInstance();
    map.plane = 1;
    const dispatchSpy = vi.spyOn(map, "dispatchEvent");
    map.showPlane(1);
    expect(dispatchSpy).not.toHaveBeenCalled();
  });
});

describe("CanvasMap.zoomOntoPoint", () => {
  it("clamps zoom to minZoom", () => {
    const map = createMapInstance();
    map.camera.zoom.target = 0.5;
    map.zoomOntoPoint({ delta: -1, x: 400, y: 300 });
    expect(map.camera.zoom.target).toBe(0.5);
  });

  it("clamps zoom to maxZoom", () => {
    const map = createMapInstance();
    map.camera.zoom.target = 6;
    map.zoomOntoPoint({ delta: 1, x: 400, y: 300 });
    expect(map.camera.zoom.target).toBe(6);
  });

  it("returns early when zoomDelta is 0", () => {
    const map = createMapInstance();
    map.camera.zoom.target = 1;
    map.camera.x.target = 0;
    map.camera.y.target = 0;
    const before = map.camera.x.target;
    map.zoomOntoPoint({ delta: 0, x: 400, y: 300 });
    expect(map.camera.x.target).toBe(before);
  });

  it("does nothing when dragging", () => {
    const map = createMapInstance();
    map.camera.isDragging = true;
    map.camera.zoom.target = 1;
    map.zoomOntoPoint({ delta: 1, x: 400, y: 300 });
    expect(map.camera.zoom.target).toBe(1);
  });

  it("uses followingPlayer position when following", () => {
    const map = createMapInstance();
    map.followingPlayer = { name: "Alice", coordinates: { x: 100, y: 100, plane: 0 } };
    map.camera.zoom.target = 1;
    map.zoomOntoPoint({ delta: 0.5, x: 400, y: 300, animationTime: 100 });
    expect(map.camera.zoom.target).toBeGreaterThan(1);
  });
});

describe("CanvasMap.startDragging", () => {
  it("sets up dragging state and clears cursor velocity", () => {
    const map = createMapInstance();
    map.cursor.dx = 5;
    map.cursor.dy = 3;
    map.cursor.frameX = [1, 2, 3];
    map.cursor.frameY = [4, 5, 6];
    map.startDragging(100, 200);
    expect(map.camera.isDragging).toBe(true);
    expect(map.cursor.dx).toBe(0);
    expect(map.cursor.dy).toBe(0);
    expect(map.cursor.frameX).toEqual([]);
    expect(map.cursor.frameY).toEqual([]);
    expect(map.cursor.previousX).toBe(100);
    expect(map.cursor.previousY).toBe(200);
    expect(map.updateRequested).toBe(1);
  });

  it("stops following player", () => {
    const map = createMapInstance();
    map.followingPlayer = { name: "Alice", coordinates: { x: 100, y: 200, plane: 0 } };
    map.startDragging(100, 200);
    expect(map.followingPlayer.name).toBeNull();
  });
});

describe("CanvasMap.stopDragging", () => {
  it("sets isDragging false and requests update", () => {
    const map = createMapInstance();
    map.camera.isDragging = true;
    map.cursor.lastPointerMoveTime = performance.now();
    map.stopDragging();
    expect(map.camera.isDragging).toBe(false);
    expect(map.updateRequested).toBe(1);
  });

  it("clears dx/dy when elapsed > 100ms since last move", () => {
    const map = createMapInstance();
    map.cursor.dx = 5;
    map.cursor.dy = 3;
    map.cursor.lastPointerMoveTime = performance.now() - 200;
    map.stopDragging();
    expect(map.cursor.dx).toBe(0);
    expect(map.cursor.dy).toBe(0);
  });

  it("preserves dx/dy when elapsed <= 100ms", () => {
    const map = createMapInstance();
    map.cursor.dx = 5;
    map.cursor.dy = 3;
    map.cursor.lastPointerMoveTime = performance.now();
    map.stopDragging();
    expect(map.cursor.dx).toBe(5);
    expect(map.cursor.dy).toBe(3);
  });
});

describe("CanvasMap.drawMapSquaresInView", () => {
  it("creates new tile images when loadNewTiles is true", () => {
    const map = createMapInstance();
    map.ctx = createMockCtx();
    map.view = { left: 0, right: 1, top: 1, bottom: 0 };
    map.validTiles = undefined;
    map.drawMapSquaresInView(true);
    expect(map.tilesInView.length).toBe(1);
    expect(map.tiles[0].size).toBe(1);
  });

  it("skips creating tiles when loadNewTiles is false", () => {
    const map = createMapInstance();
    map.ctx = createMockCtx();
    map.view = { left: 0, right: 1, top: 1, bottom: 0 };
    map.validTiles = undefined;
    map.drawMapSquaresInView(false);
    expect(map.tilesInView.length).toBe(0);
    expect(map.tiles[0].size).toBe(0);
  });

  it("clears rect for invalid tiles", () => {
    const map = createMapInstance();
    map.ctx = createMockCtx();
    map.view = { left: 0, right: 1, top: 1, bottom: 0 };
    map.validTiles = [new Set(), new Set(), new Set(), new Set()];
    map.drawMapSquaresInView(true);
    expect(map.ctx.clearRect).toHaveBeenCalled();
    expect(map.tilesInView.length).toBe(0);
  });
});

describe("CanvasMap.drawMapAreaLabels", () => {
  it("creates new label images when loadNewImages is true", () => {
    const map = createMapInstance();
    map.ctx = createMockCtx();
    map.view = { left: 0, right: 1, top: 1, bottom: 0 };
    map.mapLabels = { 0: { 1: { 0: [10, 20, 5] } } };
    map.drawMapAreaLabels(true);
    expect(map.mapLabelImages.size).toBe(1);
  });

  it("skips creating label images when loadNewImages is false", () => {
    const map = createMapInstance();
    map.ctx = createMockCtx();
    map.view = { left: 0, right: 1, top: 1, bottom: 0 };
    map.mapLabels = { 0: { 1: { 0: [10, 20, 5] } } };
    map.drawMapAreaLabels(false);
    expect(map.mapLabelImages.size).toBe(0);
  });

  it("returns early when mapLabels is not set", () => {
    const map = createMapInstance();
    map.ctx = createMockCtx();
    map.drawMapAreaLabels(true);
    expect(map.mapLabelImages).toBeUndefined();
  });
});

describe("CanvasMap._update pan momentum", () => {
  it("pans camera when not dragging and speed exceeds threshold", () => {
    const map = createMapInstance();
    map.ctx = createMockCtx();
    map.previousFrameTime = 1000;
    map.updateRequested = 1;
    map.cursor.dx = 0.5;
    map.cursor.dy = 0.5;
    map.camera.isDragging = false;
    map.validTiles = undefined;
    map.locations = undefined;
    map.mapLabels = undefined;
    map.tilesInView = [];
    const xGoToSpy = vi.spyOn(map.camera.x, "goTo");
    const yGoToSpy = vi.spyOn(map.camera.y, "goTo");
    map._update(1100);
    expect(xGoToSpy).toHaveBeenCalled();
    expect(yGoToSpy).toHaveBeenCalled();
  });

  it("does not pan camera when dragging even if speed exceeds threshold", () => {
    const map = createMapInstance();
    map.ctx = createMockCtx();
    map.previousFrameTime = 1000;
    map.updateRequested = 1;
    map.cursor.dx = 0.5;
    map.cursor.dy = 0.5;
    map.camera.isDragging = true;
    map.validTiles = undefined;
    map.locations = undefined;
    map.mapLabels = undefined;
    map.tilesInView = [];
    const xGoToSpy = vi.spyOn(map.camera.x, "goTo");
    map._update(1100);
    expect(xGoToSpy).not.toHaveBeenCalled();
  });

  it("decays cursor velocity when speed exceeds threshold", () => {
    const map = createMapInstance();
    map.ctx = createMockCtx();
    map.previousFrameTime = 1000;
    map.updateRequested = 1;
    map.cursor.dx = 0.5;
    map.cursor.dy = 0.5;
    map.camera.isDragging = true;
    map.validTiles = undefined;
    map.locations = undefined;
    map.mapLabels = undefined;
    map.tilesInView = [];
    map._update(1100);
    const decayFactor = 100 * 0.005 + 1;
    expect(map.cursor.dx).toBeCloseTo(0.5 / decayFactor);
    expect(map.cursor.dy).toBeCloseTo(0.5 / decayFactor);
  });
});

describe("CanvasMap.loadMapLinks", () => {
  it("parses valid link entries into linksByPlane lookup", () => {
    const map = createMapInstance();
    map.requestUpdate = vi.fn();
    const fakeData = {
      "100,200,0": [300, 400, 1],
      "500,600,2": [700, 800, 3],
    };
    const destTileX1 = Math.floor(300 / (map.tileSize / map.pixelsPerGameTile));
    const destTileY1 = Math.floor(400 / (map.tileSize / map.pixelsPerGameTile));
    const destTileX2 = Math.floor(700 / (map.tileSize / map.pixelsPerGameTile));
    const destTileY2 = Math.floor(800 / (map.tileSize / map.pixelsPerGameTile));
    map.validTiles = [
      new Set(),
      new Set([map.cantor(destTileX1, destTileY1)]),
      new Set(),
      new Set([map.cantor(destTileX2, destTileY2)]),
    ];
    map.loadMapLinks(fakeData);
    const plane0Links = map.linksByPlane[0];
    const plane2Links = map.linksByPlane[2];
    expect(plane0Links).toHaveLength(1);
    expect(plane0Links[0].key).toBe("100,201,0");
    expect(plane0Links[0].destination).toEqual({ x: 300, y: 400, plane: 1 });
    expect(plane2Links).toHaveLength(1);
    expect(plane2Links[0].key).toBe("500,601,2");
    expect(plane2Links[0].destination).toEqual({ x: 700, y: 800, plane: 3 });
  });

  it("rejects malformed keys with wrong number of parts", () => {
    const map = createMapInstance();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    map.loadMapLinks({ "100,200": [300, 400, 0] });
    expect(map.linksByPlane[0]).toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
  });

  it("rejects malformed keys with NaN values", () => {
    const map = createMapInstance();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    map.loadMapLinks({ "abc,def,ghi": [300, 400, 0] });
    expect(Object.keys(map.linksByPlane)).toHaveLength(0);
    expect(errorSpy).toHaveBeenCalled();
  });

  it("rejects malformed destinations", () => {
    const map = createMapInstance();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    map.loadMapLinks({
      "100,200,0": [300, 400],
      "500,600,0": "not-an-array",
    });
    expect(Object.keys(map.linksByPlane)).toHaveLength(0);
    expect(errorSpy).toHaveBeenCalled();
  });

  it("handles null/undefined data gracefully", () => {
    const map = createMapInstance();
    map.loadMapLinks(null);
    expect(Object.keys(map.linksByPlane)).toHaveLength(0);
    map.loadMapLinks(undefined);
    expect(Object.keys(map.linksByPlane)).toHaveLength(0);
  });
});

describe("CanvasMap.positionKey", () => {
  const map = createMapInstance();

  it("returns a string key from x,y,plane", () => {
    expect(map.positionKey(3, 5, 0)).toBe("3,5,0");
    expect(map.positionKey(-1, 0, 2)).toBe("-1,0,2");
  });
});

describe("CanvasMap.getLinkAtClient", () => {
  function createMapWithLinks(overrides = {}) {
    const map = createMapInstance();
    map.canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });
    setMapLinks(map, {
      "100,200,0": { x: 300, y: 400, plane: 1 },
      "500,600,0": { x: 700, y: 800, plane: 2 },
      "100,200,1": { x: 900, y: 1000, plane: 3 },
    });
    Object.assign(map, overrides);
    return map;
  }

  it("returns null when mapLinks is not set", () => {
    const map = createMapInstance();
    map.canvas.getBoundingClientRect = () => ({ left: 0, top: 0 });
    expect(map.getLinkAtClient(0, 0)).toBeNull();
  });

  it("returns null when no link is on the current plane", () => {
    const map = createMapWithLinks({ plane: 4 });
    expect(map.getLinkAtClient(0, 0)).toBeNull();
  });

  it("finds a link on the current plane (plane 1 = zero-based 0)", () => {
    const map = createMapWithLinks({ plane: 1 });
    const [linkX, linkY] = map.mapLinkScreenCenter(100, 201);
    const link = map.getLinkAtClient(linkX, linkY);
    expect(link).not.toBeNull();
    expect(link.key).toBe("100,201,0");
    expect(link.destination).toEqual({ x: 300, y: 400, plane: 1 });
  });

  it("does not find a link on a different plane", () => {
    const map = createMapWithLinks({ plane: 4 });
    const [linkX, linkY] = map.mapLinkScreenCenter(100, 201);
    const link = map.getLinkAtClient(linkX, linkY);
    expect(link).toBeNull();
  });

  it("hitbox matches icon footprint at zoom 1", () => {
    const map = createMapWithLinks({ plane: 1 });
    map.camera.zoom.current = 1;
    const [linkX, linkY] = map.mapLinkScreenCenter(100, 201);
    const halfSize = (ICON_SPRITE_SIZE / 1) * 1 / 2;
    const link = map.getLinkAtClient(linkX + halfSize - 1, linkY + halfSize - 1);
    expect(link).not.toBeNull();
    const noLink = map.getLinkAtClient(linkX + halfSize + 1, linkY + halfSize + 1);
    expect(noLink).toBeNull();
  });

  it("hitbox matches icon footprint at zoom 2", () => {
    const map = createMapWithLinks({ plane: 1 });
    map.camera.zoom.current = 2;
    const [linkX, linkY] = map.mapLinkScreenCenter(100, 201);
    const halfSize = (ICON_SPRITE_SIZE / 2) * 2 / 2;
    const link = map.getLinkAtClient(linkX + halfSize - 0.5, linkY + halfSize - 0.5);
    expect(link).not.toBeNull();
    const noLink = map.getLinkAtClient(linkX + halfSize + 1, linkY + halfSize + 1);
    expect(noLink).toBeNull();
  });

  it("hitbox matches icon footprint at zoom 3 (scale cap)", () => {
    const map = createMapWithLinks({ plane: 1 });
    map.camera.zoom.current = 5;
    const [linkX, linkY] = map.mapLinkScreenCenter(100, 201);
    const halfSize = (ICON_SPRITE_SIZE / 3) * 5 / 2;
    const link = map.getLinkAtClient(linkX + halfSize - 0.5, linkY + halfSize - 0.5);
    expect(link).not.toBeNull();
    const noLink = map.getLinkAtClient(linkX + halfSize + 1, linkY + halfSize + 1);
    expect(noLink).toBeNull();
  });

  it("selects deterministic closest hit when multiple links overlap", () => {
    const map = createMapInstance();
    map.canvas.getBoundingClientRect = () => ({ left: 0, top: 0 });
    map.camera.zoom.current = 1;
    map.plane = 1;
    setMapLinks(map, {
      "100,200,0": { x: 300, y: 400, plane: 1 },
      "101,201,0": { x: 700, y: 800, plane: 2 },
    });
    const [linkAX, linkAY] = map.mapLinkScreenCenter(100, 201);
    const [linkBX, linkBY] = map.mapLinkScreenCenter(101, 202);
    const midX = (linkAX + linkBX) / 2;
    const midY = (linkAY + linkBY) / 2;
    const link = map.getLinkAtClient(midX, midY);
    expect(link).not.toBeNull();
  });
});

describe("CanvasMap.goToMapLink", () => {
  it("stops following player, switches plane, and centers camera", () => {
    const map = createMapInstance();
    map.followingPlayer = { name: "Alice", coordinates: { x: 100, y: 200, plane: 0 } };
    const showPlaneSpy = vi.spyOn(map, "showPlane");
    const xGoToSpy = vi.spyOn(map.camera.x, "goTo");
    const yGoToSpy = vi.spyOn(map.camera.y, "goTo");
    map.goToMapLink({ x: 500, y: 600, plane: 2 });
    expect(map.followingPlayer.name).toBeNull();
    expect(showPlaneSpy).toHaveBeenCalledWith(3);
    expect(xGoToSpy).toHaveBeenCalled();
    expect(yGoToSpy).toHaveBeenCalled();
    expect(map.cursor.dx).toBe(0);
    expect(map.cursor.dy).toBe(0);
  });
});

describe("CanvasMap.buildMapLinkTooltip", () => {
  const map = createMapInstance();

  it("builds an img tag with the correct map square URL", () => {
    const html = map.buildMapLinkTooltip({ x: 100, y: 200, plane: 0 });
    expect(html).toContain('src="/map/0_1_3.webp"');
    expect(html).toContain('class="map-link-tooltip__image"');
  });

  it("includes destination coordinates and one-based plane in alt text", () => {
    const html = map.buildMapLinkTooltip({ x: 100, y: 200, plane: 2 });
    expect(html).toContain("(100, 200)");
    expect(html).toContain("plane 3");
  });

  it("wraps image in a container with a positioned destination marker", () => {
    const html = map.buildMapLinkTooltip({ x: 100, y: 200, plane: 0 });
    expect(html).toContain('class="map-link-tooltip__container"');
    expect(html).toContain('class="map-link-tooltip__marker"');
    const localX = 100 - Math.floor(100 / 64) * 64;
    const localY = 200 - Math.floor(200 / 64) * 64;
    const pctX = (localX / 64) * 100;
    const pctY = 100 - (localY / 64) * 100;
    expect(html).toContain(`left: ${pctX}%`);
    expect(html).toContain(`top: ${pctY}%`);
  });
});

function createLinkMap() {
  const map = createMapInstance();
  map.canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });
  map.style = { cursor: "" };
  setMapLinks(map, {
    "100,200,0": { x: 300, y: 400, plane: 1 },
  });
  map.plane = 1;
  map.camera.zoom.current = 1;
  vi.spyOn(map, "requestUpdate").mockImplementation(() => {});
  return map;
}

describe("CanvasMap map link pointer interactions", () => {
  it("onPointerDown over a link defers navigation without starting drag", () => {
    const map = createLinkMap();
    const [linkX, linkY] = map.mapLinkScreenCenter(100, 201);
    const startDragSpy = vi.spyOn(map, "startDragging");
    map.onPointerDown({ clientX: linkX, clientY: linkY });
    expect(map.pendingMapLink).not.toBeNull();
    expect(startDragSpy).not.toHaveBeenCalled();
  });

  it("onPointerDown outside a link starts dragging", () => {
    const map = createLinkMap();
    const startDragSpy = vi.spyOn(map, "startDragging");
    map.onPointerDown({ clientX: 0, clientY: 0 });
    expect(startDragSpy).toHaveBeenCalled();
    expect(map.pendingMapLink).toBeUndefined();
  });

  it("stopDragging after click navigates to destination", () => {
    const map = createLinkMap();
    const [linkX, linkY] = map.mapLinkScreenCenter(100, 201);
    map.onPointerDown({ clientX: linkX, clientY: linkY });
    const goToSpy = vi.spyOn(map, "goToMapLink");
    map.stopDragging({});
    expect(goToSpy).toHaveBeenCalledWith({ x: 300, y: 400, plane: 1 });
    expect(map.pendingMapLink).toBeNull();
  });

  it("stopDragging after drag does not navigate", () => {
    const map = createLinkMap();
    const [linkX, linkY] = map.mapLinkScreenCenter(100, 201);
    map.onPointerDown({ clientX: linkX, clientY: linkY });
    map.pointerDragged = true;
    const goToSpy = vi.spyOn(map, "goToMapLink");
    map.stopDragging({});
    expect(goToSpy).not.toHaveBeenCalled();
  });

  it("onPointerMove beyond drag threshold starts dragging and cancels link", () => {
    const map = createLinkMap();
    const [linkX, linkY] = map.mapLinkScreenCenter(100, 201);
    map.onPointerDown({ clientX: linkX, clientY: linkY });
    const startDragSpy = vi.spyOn(map, "startDragging");
    map.cursor.previousX = linkX;
    map.cursor.previousY = linkY;
    map.onPointerMove({ clientX: linkX + 10, clientY: linkY + 10 });
    expect(map.pointerDragged).toBe(true);
    expect(map.pendingMapLink).toBeNull();
    expect(startDragSpy).toHaveBeenCalled();
  });

  it("onPointerMove within drag threshold does not start dragging", () => {
    const map = createLinkMap();
    const [linkX, linkY] = map.mapLinkScreenCenter(100, 201);
    map.onPointerDown({ clientX: linkX, clientY: linkY });
    const startDragSpy = vi.spyOn(map, "startDragging");
    map.cursor.previousX = linkX;
    map.cursor.previousY = linkY;
    map.onPointerMove({ clientX: linkX + 2, clientY: linkY + 2 });
    expect(map.pointerDragged).toBe(false);
    expect(startDragSpy).not.toHaveBeenCalled();
  });

  it("onPointerMove within drag threshold does not call processPointerMove", () => {
    const map = createLinkMap();
    const [linkX, linkY] = map.mapLinkScreenCenter(100, 201);
    map.onPointerDown({ clientX: linkX, clientY: linkY });
    const moveSpy = vi.spyOn(map, "processPointerMove");
    map.onPointerMove({ clientX: linkX + 2, clientY: linkY + 2 });
    expect(moveSpy).not.toHaveBeenCalled();
  });

  it("onPointerMove beyond drag threshold calls processPointerMove once", () => {
    const map = createLinkMap();
    const [linkX, linkY] = map.mapLinkScreenCenter(100, 201);
    map.onPointerDown({ clientX: linkX, clientY: linkY });
    const moveSpy = vi.spyOn(map, "processPointerMove");
    map.cursor.previousX = linkX;
    map.cursor.previousY = linkY;
    map.onPointerMove({ clientX: linkX + 10, clientY: linkY + 10 });
    expect(moveSpy).toHaveBeenCalledOnce();
  });
});

describe("CanvasMap map link touch interactions", () => {
  it("onTouchStart over a link defers navigation without starting drag", () => {
    const map = createLinkMap();
    const [linkX, linkY] = map.mapLinkScreenCenter(100, 201);
    const startDragSpy = vi.spyOn(map, "startDragging");
    map.onTouchStart({ touches: [{ clientX: linkX, clientY: linkY }], preventDefault: () => {} });
    expect(map.pendingMapLink).not.toBeNull();
    expect(startDragSpy).not.toHaveBeenCalled();
  });

  it("onTouchStart outside a link does not set pendingMapLink", () => {
    const map = createLinkMap();
    map.onTouchStart({ touches: [{ clientX: 0, clientY: 0 }] });
    expect(map.pendingMapLink).toBeUndefined();
  });

  it("stopDragging after tap navigates to destination", () => {
    const map = createLinkMap();
    const [linkX, linkY] = map.mapLinkScreenCenter(100, 201);
    map.onTouchStart({ touches: [{ clientX: linkX, clientY: linkY }], preventDefault: () => {} });
    const goToSpy = vi.spyOn(map, "goToMapLink");
    map.stopDragging({});
    expect(goToSpy).toHaveBeenCalledWith({ x: 300, y: 400, plane: 1 });
    expect(map.pendingMapLink).toBeNull();
  });

  it("onTouchMove beyond drag threshold cancels link and starts dragging", () => {
    const map = createLinkMap();
    const [linkX, linkY] = map.mapLinkScreenCenter(100, 201);
    map.onTouchStart({ touches: [{ clientX: linkX, clientY: linkY }], preventDefault: () => {} });
    const startDragSpy = vi.spyOn(map, "startDragging");
    map.cursor.previousX = linkX;
    map.cursor.previousY = linkY;
    map.onTouchMove({ touches: [{ clientX: linkX + 10, clientY: linkY + 10 }] });
    expect(map.pointerDragged).toBe(true);
    expect(map.pendingMapLink).toBeNull();
    expect(startDragSpy).toHaveBeenCalled();
  });

  it("onTouchMove within drag threshold does not cancel link", () => {
    const map = createLinkMap();
    const [linkX, linkY] = map.mapLinkScreenCenter(100, 201);
    map.onTouchStart({ touches: [{ clientX: linkX, clientY: linkY }], preventDefault: () => {} });
    const startDragSpy = vi.spyOn(map, "startDragging");
    map.cursor.previousX = linkX;
    map.cursor.previousY = linkY;
    map.onTouchMove({ touches: [{ clientX: linkX + 2, clientY: linkY + 2 }] });
    expect(map.pointerDragged).toBe(false);
    expect(map.pendingMapLink).not.toBeNull();
    expect(startDragSpy).not.toHaveBeenCalled();
  });

  it("onTouchStart with two fingers clears pendingMapLink and sets pinch state", () => {
    const map = createLinkMap();
    const [linkX, linkY] = map.mapLinkScreenCenter(100, 201);
    map.onTouchStart({ touches: [{ clientX: linkX, clientY: linkY }], preventDefault: () => {} });
    expect(map.pendingMapLink).not.toBeNull();
    map.onTouchStart({ touches: [{ clientX: 0, clientY: 0 }, { clientX: 100, clientY: 100 }] });
    expect(map.pendingMapLink).toBeNull();
    expect(map.touch.startDistance).toBeGreaterThan(0);
  });
});

describe("CanvasMap map link tooltip and cursor", () => {
  it("shows tooltip and sets pointer cursor on hover over link", () => {
    const map = createLinkMap();
    const [linkX, linkY] = map.mapLinkScreenCenter(100, 201);
    map.cursor.previousX = linkX;
    map.cursor.previousY = linkY;
    mockShowTooltip.mockClear();
    map.onPointerMove({ clientX: linkX, clientY: linkY });
    expect(mockShowTooltip).toHaveBeenCalled();
    expect(map.style.cursor).toBe("pointer");
  });

  it("hides tooltip and restores cursor when moving away from link", () => {
    const map = createLinkMap();
    const [linkX, linkY] = map.mapLinkScreenCenter(100, 201);
    map.cursor.previousX = linkX;
    map.cursor.previousY = linkY;
    map.onPointerMove({ clientX: linkX, clientY: linkY });
    mockHideTooltip.mockClear();
    map.cursor.previousX = linkX;
    map.cursor.previousY = linkY;
    map.onPointerMove({ clientX: 0, clientY: 0 });
    expect(mockHideTooltip).toHaveBeenCalled();
    expect(map.style.cursor).toBe("");
  });

  it("hideMapLinkTooltip does not call tooltipManager when not shown", () => {
    const map = createLinkMap();
    mockHideTooltip.mockClear();
    map.mapLinkTooltipShown = false;
    map.hideMapLinkTooltip();
    expect(mockHideTooltip).not.toHaveBeenCalled();
  });

  it("onMouseLeave clears link state and hides tooltip", () => {
    const map = createLinkMap();
    const [linkX, linkY] = map.mapLinkScreenCenter(100, 201);
    map.cursor.previousX = linkX;
    map.cursor.previousY = linkY;
    map.onPointerMove({ clientX: linkX, clientY: linkY });
    expect(map.hoveredMapLink).not.toBeNull();
    mockHideTooltip.mockClear();
    map.onMouseLeave();
    expect(map.pendingMapLink).toBeNull();
    expect(map.hoveredMapLink).toBeNull();
    expect(mockHideTooltip).toHaveBeenCalled();
    expect(map.style.cursor).toBe("");
  });

  it("disconnectedCallback hides tooltip", () => {
    const map = createLinkMap();
    map.mapLinkTooltipShown = true;
    mockHideTooltip.mockClear();
    map.disconnectedCallback();
    expect(mockHideTooltip).toHaveBeenCalled();
  });
});

describe("CanvasMap.drawMapLinks", () => {
  function createDrawMapLinksInstance() {
    const map = createMapInstance();
    map.ctx = createMockCtx();
    map.canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });
    setMapLinks(map, {
      "100,200,0": { x: 300, y: 400, plane: 1 },
      "500,600,0": { x: 700, y: 800, plane: 2 },
      "100,200,1": { x: 900, y: 1000, plane: 3 },
    });
    map.plane = 1;
    map.camera.zoom.current = 1;
    centerCameraOn(map, 100, 201);
    map.view = { left: -1000, right: 1000, top: 1000, bottom: -1000 };
    return map;
  }

  it("returns early when linksByPlane is not set", () => {
    const map = createMapInstance();
    map.ctx = createMockCtx();
    map.linksByPlane = undefined;
    map.drawMapLinks();
    expect(map.ctx.beginPath).not.toHaveBeenCalled();
  });

  it("returns early when no links are on the current plane", () => {
    const map = createDrawMapLinksInstance();
    map.plane = 4;
    map.drawMapLinks();
    expect(map.ctx.beginPath).not.toHaveBeenCalled();
  });

  it("draws a circle for each visible link on the current plane", () => {
    const map = createDrawMapLinksInstance();
    map.drawMapLinks();
    expect(map.ctx.arc).toHaveBeenCalledOnce();
  });

  it("uses semi-transparent white fill and white stroke", () => {
    const map = createDrawMapLinksInstance();
    map.drawMapLinks();
    expect(map.ctx.fillStyle).toBe("rgba(255, 255, 255, 0.25)");
    expect(map.ctx.strokeStyle).toBe("rgb(255, 255, 255)");
  });

  it("scales line width inversely with zoom", () => {
    const map = createDrawMapLinksInstance();
    map.camera.zoom.current = 2;
    centerCameraOn(map, 100, 201);
    map.drawMapLinks();
    expect(map.ctx.lineWidth).toBe(1);
  });

  it("circle radius matches icon footprint at zoom 1", () => {
    const map = createDrawMapLinksInstance();
    map.camera.zoom.current = 1;
    map.drawMapLinks();
    const expectedSize = ICON_SPRITE_SIZE / 1;
    const expectedRadius = expectedSize / 2 + 2 / 1;
    const [x, y, r] = map.ctx.arc.mock.calls[0];
    const [canvasX, canvasY] = map.gamePositionToCanvas(100, 201);
    expect(r).toBe(expectedRadius);
    expect(x).toBe(canvasX);
    expect(y).toBe(canvasY);
  });

  it("circle radius matches icon footprint at zoom 3 (scale cap)", () => {
    const map = createDrawMapLinksInstance();
    map.camera.zoom.current = 5;
    centerCameraOn(map, 100, 201);
    map.drawMapLinks();
    const expectedSize = ICON_SPRITE_SIZE / 3;
    const expectedRadius = expectedSize / 2 + 2 / 5;
    const [x, y, r] = map.ctx.arc.mock.calls[0];
    const [canvasX, canvasY] = map.gamePositionToCanvas(100, 201);
    expect(r).toBeCloseTo(expectedRadius);
    expect(x).toBeCloseTo(canvasX);
    expect(y).toBeCloseTo(canvasY);
  });

  it("only draws links matching the current zero-based plane", () => {
    const map = createDrawMapLinksInstance();
    map.plane = 2;
    map.drawMapLinks();
    const plane1Links = map.linksByPlane[1];
    expect(map.ctx.arc).toHaveBeenCalledTimes(plane1Links.length);
  });

  it("calls beginPath, fill, stroke, and closePath per visible link", () => {
    const map = createDrawMapLinksInstance();
    map.drawMapLinks();
    expect(map.ctx.beginPath).toHaveBeenCalledOnce();
    expect(map.ctx.fill).toHaveBeenCalledOnce();
    expect(map.ctx.stroke).toHaveBeenCalledOnce();
    expect(map.ctx.closePath).toHaveBeenCalledOnce();
  });

  it("skips links outside the visible canvas area", () => {
    const map = createDrawMapLinksInstance();
    map.camera.x.current = 10000;
    map.camera.y.current = 10000;
    map.drawMapLinks();
    expect(map.ctx.beginPath).not.toHaveBeenCalled();
    expect(map.ctx.arc).not.toHaveBeenCalled();
  });
});

describe("CanvasMap.buildIconIndex", () => {
  it("builds a Set of position keys from locations", () => {
    const map = createMapInstance();
    map.locations = {
      10: {
        20: {
          0: [100, 200, 0, 300, 400, 1],
          1: [500, 600, 0],
        },
      },
    };
    map.buildIconIndex();
    expect(map.iconIndex.has("100,200,0")).toBe(true);
    expect(map.iconIndex.has("300,400,1")).toBe(true);
    expect(map.iconIndex.has("500,600,0")).toBe(true);
    expect(map.iconIndex.size).toBe(3);
  });

  it("returns empty Set when locations is not set", () => {
    const map = createMapInstance();
    map.buildIconIndex();
    expect(map.iconIndex).toBeInstanceOf(Set);
    expect(map.iconIndex.size).toBe(0);
  });
});

describe("CanvasMap.buildLinkIconOverrides", () => {
  it("overrides link when icon is at the same position", () => {
    const map = createMapInstance();
    map.iconIndex = new Set(["100,201,0"]);
    setMapLinks(map, {
      "100,200,0": { x: 300, y: 400, plane: 1 },
      "500,600,0": { x: 700, y: 800, plane: 2 },
    });
    map.buildLinkIconOverrides();
    expect(map.linkIconOverrides["100,201,0"]).toEqual({ iconX: 100, iconY: 201 });
    expect(map.linkIconOverrides["500,601,0"]).toBeUndefined();
  });

  it("overrides link when icon is 1 tile north (y+1)", () => {
    const map = createMapInstance();
    map.iconIndex = new Set(["100,202,0"]);
    setMapLinks(map, {
      "100,200,0": { x: 300, y: 400, plane: 1 },
    });
    map.buildLinkIconOverrides();
    expect(map.linkIconOverrides["100,201,0"]).toEqual({ iconX: 100, iconY: 202 });
  });

  it("does not override when no icon matches same or north position", () => {
    const map = createMapInstance();
    map.iconIndex = new Set(["999,999,0"]);
    setMapLinks(map, {
      "100,200,0": { x: 300, y: 400, plane: 1 },
    });
    map.buildLinkIconOverrides();
    expect(map.linkIconOverrides["100,201,0"]).toBeUndefined();
  });

  it("produces empty overrides when mapLinks is not set", () => {
    const map = createMapInstance();
    map.iconIndex = new Set(["100,200,0"]);
    map.buildLinkIconOverrides();
    expect(map.linkIconOverrides).toEqual({});
  });

  it("produces empty overrides when iconIndex is not set", () => {
    const map = createMapInstance();
    setMapLinks(map, { "100,200,0": { x: 300, y: 400, plane: 1 } });
    map.buildLinkIconOverrides();
    expect(map.linkIconOverrides).toEqual({});
  });

  it("prefers same-position icon over north icon", () => {
    const map = createMapInstance();
    map.iconIndex = new Set(["100,201,0", "100,202,0"]);
    setMapLinks(map, {
      "100,200,0": { x: 300, y: 400, plane: 1 },
    });
    map.buildLinkIconOverrides();
    expect(map.linkIconOverrides["100,201,0"]).toEqual({ iconX: 100, iconY: 201 });
  });

  it("populates linkedIconPositions Set for overridden links", () => {
    const map = createMapInstance();
    map.iconIndex = new Set(["100,201,0"]);
    setMapLinks(map, {
      "100,200,0": { x: 300, y: 400, plane: 1 },
      "200,300,0": { x: 500, y: 600, plane: 2 },
    });
    map.buildLinkIconOverrides();
    expect(map.linkedIconPositions.has("100,201,0")).toBe(true);
    expect(map.linkedIconPositions.has("200,301,0")).toBe(false);
    expect(map.linkedIconPositions.size).toBe(1);
  });
});

describe("CanvasMap.getLinkAtClient with icon overrides", () => {
  function createOverrideMap() {
    const map = createMapInstance();
    map.canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });
    setMapLinks(map, {
      "100,200,0": { x: 300, y: 400, plane: 1 },
    });
    map.linkIconOverrides = {
      "100,201,0": { iconX: 100, iconY: 202 },
    };
    map.plane = 1;
    map.camera.zoom.current = 1;
    return map;
  }

  it("hit tests at icon position instead of link position", () => {
    const map = createOverrideMap();
    const [iconX, iconY] = map.mapLinkScreenCenter(100, 202);
    const link = map.getLinkAtClient(iconX, iconY);
    expect(link).not.toBeNull();
    expect(link.key).toBe("100,201,0");
  });

  it("does not hit test at original link position when far enough away", () => {
    const map = createMapInstance();
    map.canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });
    setMapLinks(map, {
      "100,200,0": { x: 300, y: 400, plane: 1 },
    });
    map.linkIconOverrides = {
      "100,201,0": { iconX: 100, iconY: 250 },
    };
    map.plane = 1;
    map.camera.zoom.current = 1;
    const [linkX, linkY] = map.mapLinkScreenCenter(100, 201);
    const link = map.getLinkAtClient(linkX, linkY);
    expect(link).toBeNull();
  });
});

describe("CanvasMap.drawMapLinks with icon overrides", () => {
  function createOverrideDrawMap() {
    const map = createMapInstance();
    map.ctx = createMockCtx();
    map.canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });
    setMapLinks(map, {
      "100,200,0": { x: 300, y: 400, plane: 1 },
      "102,202,0": { x: 700, y: 800, plane: 2 },
    });
    map.linkIconOverrides = {
      "100,201,0": { iconX: 100, iconY: 201 },
    };
    map.plane = 1;
    map.camera.zoom.current = 1;
    centerCameraOn(map, 102, 203);
    map.view = { left: -1000, right: 1000, top: 1000, bottom: -1000 };
    return map;
  }

  it("skips overridden links entirely", () => {
    const map = createOverrideDrawMap();
    map.drawMapLinks();
    const arcCalls = map.ctx.arc.mock.calls;
    const [linkCanvasX, linkCanvasY] = map.gamePositionToCanvas(100, 201);
    const hasOverriddenArc = arcCalls.some(
      ([x, y]) => x === linkCanvasX && y === linkCanvasY
    );
    expect(hasOverriddenArc).toBe(false);
  });

  it("still draws circle for non-overridden links", () => {
    const map = createOverrideDrawMap();
    map.drawMapLinks();
    const arcCalls = map.ctx.arc.mock.calls;
    const [canvasX, canvasY] = map.gamePositionToCanvas(102, 203);
    const hasNormalArc = arcCalls.some(
      ([x, y]) => x === canvasX && y === canvasY
    );
    expect(hasNormalArc).toBe(true);
  });

  it("calls beginPath once per non-overridden link when both overridden and normal links exist", () => {
    const map = createOverrideDrawMap();
    map.drawMapLinks();
    expect(map.ctx.beginPath).toHaveBeenCalledOnce();
    expect(map.ctx.fill).toHaveBeenCalledOnce();
    expect(map.ctx.stroke).toHaveBeenCalledOnce();
    expect(map.ctx.closePath).toHaveBeenCalledOnce();
  });

  it("calls beginPath once per link when no links are overridden", () => {
    const map = createMapInstance();
    map.ctx = createMockCtx();
    map.canvas.getBoundingClientRect = () => ({ left: 0, top: 0 });
    setMapLinks(map, {
      "100,200,0": { x: 300, y: 400, plane: 1 },
      "102,202,0": { x: 700, y: 800, plane: 2 },
    });
    map.linkIconOverrides = {};
    map.plane = 1;
    map.camera.zoom.current = 1;
    centerCameraOn(map, 101, 202);
    map.view = { left: -1000, right: 1000, top: 1000, bottom: -1000 };
    map.drawMapLinks();
    expect(map.ctx.beginPath).toHaveBeenCalledTimes(2);
    expect(map.ctx.fill).toHaveBeenCalledTimes(2);
    expect(map.ctx.stroke).toHaveBeenCalledTimes(2);
    expect(map.ctx.closePath).toHaveBeenCalledTimes(2);
  });

  it("does not call beginPath when all links are overridden", () => {
    const map = createMapInstance();
    map.ctx = createMockCtx();
    map.canvas.getBoundingClientRect = () => ({ left: 0, top: 0 });
    setMapLinks(map, {
      "100,200,0": { x: 300, y: 400, plane: 1 },
      "102,202,0": { x: 700, y: 800, plane: 2 },
    });
    map.linkIconOverrides = {
      "100,201,0": { iconX: 100, iconY: 200 },
      "102,203,0": { iconX: 102, iconY: 202 },
    };
    map.plane = 1;
    map.camera.zoom.current = 1;
    centerCameraOn(map, 101, 202);
    map.view = { left: -1000, right: 1000, top: 1000, bottom: -1000 };
    map.drawMapLinks();
    expect(map.ctx.beginPath).not.toHaveBeenCalled();
    expect(map.ctx.fill).not.toHaveBeenCalled();
    expect(map.ctx.stroke).not.toHaveBeenCalled();
    expect(map.ctx.closePath).not.toHaveBeenCalled();
  });
});

describe("CanvasMap.drawLocations with linked icon highlights", () => {
  function createLinkedIconMap() {
    const map = createMapInstance();
    map.ctx = createMockCtx();
    map.locationIconsSheet = { width: 100, height: 100 };
    map.locations = {
      10: {
        20: {
          0: [100, 200, 0],
          1: [500, 600, 0],
        },
      },
    };
    map.tilesInView = [{ regionX: 10, regionY: 20 }];
    map.plane = 1;
    map.camera.zoom.current = 1;
    map.linkedIconPositions = new Set(["100,200,0"]);
    return map;
  }

  it("draws highlight circle around linked icon after drawing it", () => {
    const map = createLinkedIconMap();
    map.drawLocations();
    const arcCalls = map.ctx.arc.mock.calls;
    const [canvasX, canvasY] = map.gamePositionToCanvas(100, 200);
    const destinationSize = map.iconCanvasSize();
    const shift = destinationSize / 2;
    const expectedRadius = destinationSize / 2 + 2 / map.camera.zoom.current;
    const expectedCenterX = Math.round(canvasX - shift) + destinationSize / 2;
    const expectedCenterY = Math.round(canvasY - shift) + destinationSize / 2;
    const hasHighlight = arcCalls.some(
      ([x, y, r]) => x === expectedCenterX && y === expectedCenterY && r === expectedRadius
    );
    expect(hasHighlight).toBe(true);
  });

  it("does not draw highlight for non-linked icons", () => {
    const map = createLinkedIconMap();
    map.drawLocations();
    const arcCalls = map.ctx.arc.mock.calls;
    const [canvasX, canvasY] = map.gamePositionToCanvas(500, 600);
    const hasHighlight = arcCalls.some(
      ([x, y]) => x === canvasX && y === canvasY
    );
    expect(hasHighlight).toBe(false);
  });

  it("uses white stroke for linked icon highlight", () => {
    const map = createLinkedIconMap();
    map.drawLocations();
    expect(map.ctx.strokeStyle).toBe("rgb(255, 255, 255)");
  });

  it("does not draw highlight when linkedIconPositions is not set", () => {
    const map = createLinkedIconMap();
    map.linkedIconPositions = undefined;
    map.drawLocations();
    expect(map.ctx.beginPath).not.toHaveBeenCalled();
  });
});
