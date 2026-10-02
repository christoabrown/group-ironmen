import { vi } from "vitest";

/**
 * A canvas context that records what was drawn, and how: `strokes` and
 * `fills` (style, alpha, the path, and for a stroke its width and dash),
 * `images` and `texts`. `save` and `restore` put back the alpha, the dash and
 * the styles as a canvas does, and `depth` is how many saves are still open.
 */
export function recordingContext() {
  const ctx = {
    strokes: [],
    fills: [],
    images: [],
    texts: [],
    depth: 0,
    globalAlpha: 1,
    strokeStyle: "",
    fillStyle: "",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    lineDashOffset: 0,
    imageSmoothingEnabled: false,
  };
  const KEPT = ["globalAlpha", "strokeStyle", "fillStyle", "lineWidth", "lineCap", "lineJoin", "lineDashOffset"];
  const saved = [];
  let path = [];
  let dash = [];
  ctx.beginPath = () => (path = []);
  ctx.moveTo = (x, y) => path.push([x, y]);
  ctx.lineTo = (x, y) => path.push([x, y]);
  ctx.arc = (x, y, r) => path.push([x, y, r]);
  ctx.closePath = () => {};
  ctx.setLineDash = (value) => (dash = value);
  ctx.getLineDash = () => dash;
  ctx.setTransform = vi.fn();
  ctx.save = () => {
    saved.push({ dash, state: Object.fromEntries(KEPT.map((key) => [key, ctx[key]])) });
    ctx.depth += 1;
  };
  ctx.restore = () => {
    const last = saved.pop();
    if (!last) return;
    dash = last.dash;
    Object.assign(ctx, last.state);
    ctx.depth -= 1;
  };
  ctx.stroke = () =>
    ctx.strokes.push({
      style: ctx.strokeStyle,
      width: ctx.lineWidth,
      alpha: ctx.globalAlpha,
      dash,
      path: path.slice(),
    });
  ctx.fill = () => ctx.fills.push({ style: ctx.fillStyle, alpha: ctx.globalAlpha, path: path.slice() });
  ctx.drawImage = (image, x, y, width, height) => ctx.images.push({ image, x, y, width, height });
  ctx.fillText = (text, x, y) => ctx.texts.push({ text, x, y, style: ctx.fillStyle, alpha: ctx.globalAlpha });
  ctx.strokeText = () => {};
  return ctx;
}
