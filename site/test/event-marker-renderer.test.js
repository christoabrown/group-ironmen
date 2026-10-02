import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IconCache } from "../src/canvas-map/icon-cache";
import { drawEventMarkers } from "../src/canvas-map/event-marker-renderer";
import { KIND_COLORS } from "../src/data/event-view";
import { MARKER_RADIUS, MARKER_RADIUS_COMPACT } from "../src/canvas-map/event-markers";
import { DEATH_ICON_URL } from "../src/data/event-view";
import { recordingContext } from "./helpers/recording-context";

const GOLD = "#ffd700";

const item = (extra = {}) => ({
  x: 400,
  y: 326,
  r: MARKER_RADIUS,
  anchorX: 400,
  anchorY: 300,
  plane: 0,
  top: { event: { id: "a", type: "death" }, kind: "death" },
  count: 1,
  alpha: 1,
  compact: false,
  tier: 0,
  color: "blue",
  approximate: false,
  ringAge: null,
  label: null,
  labelAlpha: 0,
  labelKind: null,
  ...extra,
});

/** Icons that are there at once, 25 by 20 pixels. */
const loadedIcons = () => ({ get: (url) => (url ? { url, naturalWidth: 25, naturalHeight: 20 } : null) });
const noIcons = () => ({ get: () => null });

describe("IconCache", () => {
  it("gives an image once it has loaded, and says when", () => {
    const images = [];
    const onLoad = vi.fn();
    const cache = new IconCache({ createImage: () => (images.push({}), images[images.length - 1]), onLoad });
    expect(cache.get("/a.png")).toBeNull();
    expect(cache.get("/a.png")).toBeNull();
    expect(images).toHaveLength(1);
    expect(images[0].src).toBe("/a.png");

    images[0].onload();
    expect(onLoad).toHaveBeenCalledWith("/a.png");
    expect(cache.get("/a.png")).toBe(images[0]);
  });

  it("doesn't ask again for an image that can't be loaded, or for none", () => {
    const images = [];
    const cache = new IconCache({ createImage: () => (images.push({}), images[images.length - 1]) });
    cache.get("/gone.png");
    images[0].onerror();
    expect(cache.get("/gone.png")).toBeNull();
    expect(cache.get("")).toBeNull();
    expect(images).toHaveLength(1);
  });
});

describe("drawEventMarkers", () => {
  let ctx;

  beforeEach(() => {
    ctx = recordingContext();
  });

  afterEach(() => {
    expect(ctx.depth).toBe(0);
  });

  it("draws nothing, and leaves the canvas alone, without markers", () => {
    drawEventMarkers(ctx, [], { icons: noIcons() });
    expect(ctx.setTransform).not.toHaveBeenCalled();
    expect(ctx.fills).toEqual([]);
  });

  it("draws a dark disc with the player's colour around it, in screen pixels", () => {
    drawEventMarkers(ctx, [item()], { icons: loadedIcons() });
    expect(ctx.setTransform).toHaveBeenCalledWith(1, 0, 0, 1, 0, 0);
    expect(ctx.fills[0].path).toEqual([[400, 326, MARKER_RADIUS]]);
    const border = ctx.strokes.find((stroke) => stroke.style === "blue" && stroke.path[0].length === 3);
    expect(border.path).toEqual([[400, 326, MARKER_RADIUS]]);
    expect(border.dash).toEqual([]);
  });

  it("puts the event's icon in it, keeping its shape", () => {
    drawEventMarkers(ctx, [item()], { icons: loadedIcons() });
    expect(ctx.images).toHaveLength(1);
    const { image, x, y, width, height } = ctx.images[0];
    expect(image.url).toBe(DEATH_ICON_URL);
    expect(width).toBeCloseTo(MARKER_RADIUS * 1.5);
    expect(width / height).toBeCloseTo(25 / 20);
    expect(x + width / 2).toBeCloseTo(400);
    expect(y + height / 2).toBeCloseTo(326);
  });

  it("makes do with a dot in the colour of its kind until the icon is there", () => {
    drawEventMarkers(ctx, [item()], { icons: noIcons() });
    expect(ctx.images).toEqual([]);
    expect(ctx.fills.some((fill) => fill.style === KIND_COLORS.death)).toBe(true);
  });

  it("joins a marker to the tile it belongs to", () => {
    drawEventMarkers(ctx, [item()], { icons: noIcons() });
    const stem = ctx.strokes.find((stroke) => stroke.path.length === 2);
    expect(stem.path).toEqual([
      [400, 302],
      [400, 326 - MARKER_RADIUS],
    ]);
    ctx = recordingContext();
    drawEventMarkers(ctx, [item({ compact: true, y: 300, r: MARKER_RADIUS_COMPACT })], { icons: noIcons() });
    expect(ctx.strokes.some((stroke) => stroke.path.length === 2)).toBe(false);
  });

  it("gives a notable event a gold ring", () => {
    drawEventMarkers(ctx, [item()], { icons: noIcons() });
    expect(ctx.strokes.some((stroke) => stroke.style === GOLD)).toBe(false);
    drawEventMarkers(ctx, [item({ tier: 1 })], { icons: noIcons() });
    expect(ctx.strokes.some((stroke) => stroke.style === GOLD)).toBe(true);
  });

  it("breaks the border of a marker whose place is a guess", () => {
    drawEventMarkers(ctx, [item({ approximate: true })], { icons: noIcons() });
    const border = ctx.strokes.find((stroke) => stroke.style === "blue" && stroke.path[0].length === 3);
    expect(border.dash).toEqual([3, 3]);
  });

  it("rings around an event that just happened", () => {
    drawEventMarkers(ctx, [item()], { icons: noIcons() });
    const quiet = ctx.strokes.length;
    ctx = recordingContext();
    drawEventMarkers(ctx, [item({ ringAge: 600 })], { icons: noIcons() });
    expect(ctx.strokes.length).toBe(quiet + 2);
    expect(ctx.strokes[0].path[0][2]).toBeGreaterThan(MARKER_RADIUS);
    expect(ctx.strokes[0].alpha).toBeLessThan(1);
  });

  it("counts the events of a stack", () => {
    drawEventMarkers(ctx, [item({ count: 3 }), item({ count: 14, x: 500 })], { icons: noIcons() });
    expect(ctx.texts.map((text) => text.text)).toEqual(["3", "9+"]);
  });

  it("writes the words of a new event under it, gold for a drop, fading out", () => {
    drawEventMarkers(
      ctx,
      [item({ label: "2.5M gp", labelAlpha: 0.5, labelKind: "loot" }), item({ label: "99 Attack", labelAlpha: 1 })],
      { icons: noIcons() },
    );
    expect(ctx.texts).toEqual([
      { text: "2.5M gp", x: 400, y: 326 + MARKER_RADIUS + 11, style: GOLD, alpha: 0.5 },
      { text: "99 Attack", x: 400, y: 326 + MARKER_RADIUS + 11, style: "white", alpha: 1 },
    ]);
  });

  it("draws a faded marker faintly", () => {
    drawEventMarkers(ctx, [item({ alpha: 0.4 })], { icons: noIcons() });
    expect(ctx.fills.every((fill) => fill.alpha === 0.4)).toBe(true);
  });
});
