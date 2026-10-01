import { eventIconUrl } from "../data/event-view";
import { EVENT_RING_MS } from "./event-markers";

// The brown of the game's inventory, which its item sprites were drawn to stand out against.
const DISC = "rgba(62, 53, 41, 0.95)";
const OUTLINE = "#0a0f1e";
const GOLD = "#ffd700";
const COUNT = "#ff981f";
const FALLBACK = "#ff981f";
const LABEL_FONT = "16px rssmall";
const COUNT_FONT = "13px rssmall";

/** What stands for an event's kind where there is no icon to show. */
export const KIND_COLORS = { loot: GOLD, level: "#5bd45b", death: "#e0403a", other: "#f2f2f2" };

/** The rings of an event that just happened, spreading from its marker. */
function drawRings(ctx, item) {
  const offsets = item.tier === 2 ? [0, 0.25, 0.5] : [0, 0.35];
  ctx.lineWidth = item.tier === 2 ? 4 : 3;
  ctx.strokeStyle = item.tier ? GOLD : item.color || FALLBACK;
  for (const offset of offsets) {
    const t = (item.ringAge / EVENT_RING_MS + offset) % 1;
    ctx.beginPath();
    ctx.arc(item.x, item.y, item.r + 2 + t * (item.tier === 2 ? 44 : 34), 0, Math.PI * 2);
    ctx.globalAlpha = (1 - t) * 0.9 * item.alpha;
    ctx.stroke();
  }
  ctx.globalAlpha = item.alpha;
}

/** The line from the tile an event happened on down to its marker. */
function drawStem(ctx, item) {
  const top = item.anchorY + 2;
  const bottom = item.y - item.r;
  if (bottom <= top) return;
  ctx.beginPath();
  ctx.moveTo(item.anchorX, top);
  ctx.lineTo(item.x, bottom);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.strokeStyle = item.color || FALLBACK;
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawDisc(ctx, item) {
  const { x, y, r } = item;
  if (item.tier === 2) {
    ctx.shadowColor = GOLD;
    ctx.shadowBlur = 14;
  }
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = DISC;
  ctx.fill();
  ctx.shadowBlur = 0;

  // A guessed place gets a broken border.
  if (item.approximate) ctx.setLineDash([3, 3]);
  ctx.strokeStyle = item.color || FALLBACK;
  ctx.lineWidth = item.compact ? 1.5 : 2;
  ctx.stroke();
  if (item.approximate) ctx.setLineDash([]);

  if (item.tier) {
    ctx.beginPath();
    ctx.arc(x, y, r + 2.5, 0, Math.PI * 2);
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = item.tier === 2 ? 2.5 : 1.5;
    ctx.stroke();
  }
}

function drawIcon(ctx, item, icons) {
  const { x, y, r } = item;
  const event = item.top.event;
  const image = icons.get(eventIconUrl(event));
  if (!image) {
    ctx.beginPath();
    ctx.arc(x, y, r * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = KIND_COLORS[item.top.kind] || FALLBACK;
    ctx.fill();
    return;
  }
  // As large as fits in the disc, keeping the sprite's shape.
  const box = r * 1.5;
  const width = image.naturalWidth || image.width || box;
  const height = image.naturalHeight || image.height || box;
  const scale = Math.min(box / width, box / height);
  ctx.drawImage(image, x - (width * scale) / 2, y - (height * scale) / 2, width * scale, height * scale);
}

function drawCount(ctx, item) {
  if (item.count < 2) return;
  const x = item.x + item.r * 0.8;
  const y = item.y - item.r * 0.8;
  ctx.beginPath();
  ctx.arc(x, y, 7.5, 0, Math.PI * 2);
  ctx.fillStyle = COUNT;
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.font = COUNT_FONT;
  ctx.fillStyle = "black";
  ctx.fillText(item.count > 9 ? "9+" : String(item.count), x, y + 1);
}

function drawLabel(ctx, item) {
  if (!item.label || item.labelAlpha <= 0) return;
  const y = item.y + item.r + 11;
  ctx.globalAlpha = item.alpha * item.labelAlpha;
  ctx.font = LABEL_FONT;
  ctx.lineWidth = 3;
  ctx.strokeStyle = "black";
  ctx.strokeText(item.label, item.x, y);
  ctx.fillStyle = item.labelKind === "loot" ? GOLD : "white";
  ctx.fillText(item.label, item.x, y);
}

/**
 * Draws the events on the map, in screen pixels. `items` are as
 * layoutMarkers gives them, the ones to go on top last; `icons` gives the
 * image for a URL once it has loaded (see IconCache).
 */
export function drawEventMarkers(ctx, items, { icons }) {
  if (!items.length) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // The map's tiles are drawn pixel for pixel; a sprite scaled down to fit a marker isn't.
  ctx.imageSmoothingEnabled = true;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const item of items) {
    ctx.globalAlpha = item.alpha;
    if (item.ringAge !== null) drawRings(ctx, item);
    if (!item.compact) drawStem(ctx, item);
    drawDisc(ctx, item);
    drawIcon(ctx, item, icons);
    drawCount(ctx, item);
    drawLabel(ctx, item);
  }
  ctx.restore();
}
