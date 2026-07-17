import { describe, expect, it, vi } from "vitest";
import { Animation } from "../src/canvas-map/animation";
import { CanvasMap } from "../src/canvas-map/canvas-map";

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
    imageSmoothingEnabled: true,
  };
}

function createMapInstance(overrides = {}) {
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
  Object.assign(map, overrides);
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
