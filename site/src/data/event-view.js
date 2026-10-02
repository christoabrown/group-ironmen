import { GroupData } from "./group-data";
import { Item } from "./item";
import { skillIconUrl } from "./icons";
import { describeEvent } from "./hub-format";
import { remember, remembered } from "./storage";
import { clockTime, escapeHtml, formatGp, relativeTime } from "./format";

// How a hub event looks wherever the map shows it: which kind it is, whether
// the filters let it through, how much of a fuss it deserves, its icon and
// its words.

/**
 * Which hub events show on the map, under which filter, and in which colour
 * where there is no icon to show. A new kind, or a new type in a kind, is added
 * here, and nowhere else on the site, with two things that can't read this
 * table:
 * - the server reads a trail's events by type (`LOOT_TYPES` and `OTHER_TYPES`
 *   in server/src/hub/profile.rs), so a new type goes there too;
 * - the replay's ticks and the toasts are coloured in CSS
 *   (trail-scrubber.css, event-toasts.css), by the kind's key.
 */
export const EVENT_KINDS = [
  { key: "loot", label: "Loot", color: "#ffd700", types: ["loot", "pk_loot"] },
  { key: "level", label: "Levels", color: "#5bd45b", types: ["level_up"] },
  { key: "death", label: "Deaths", color: "#e0403a", types: ["death"] },
  {
    key: "other",
    label: "Other",
    color: "#f2f2f2",
    types: ["collection_log", "achievement_diary", "combat_task", "superior_spawn"],
  },
];

/** The colour of each kind, by its key. */
export const KIND_COLORS = Object.fromEntries(EVENT_KINDS.map((kind) => [kind.key, kind.color]));

export const MIN_LOOT_OPTIONS = [
  [0, "Any drop"],
  [100000, "100K+"],
  [1000000, "1M+"],
  [10000000, "10M+"],
];

export const EVENT_FILTERS_KEY = "map-event-filters";

// A drop worth this much is notable (tier 1), or a big one (tier 2).
const EVENT_TIER_GP = [1000000, 10000000];

// An event this recent is news: it gets a ring on the map and a toast. Older
// ones that turn up (after the tab was hidden, say) are only put on the map.
const EVENT_FRESH_MS = 90000;

// Sprites this site serves itself, so they show with the icon CDN switched off too.
export const DEATH_ICON_URL = "/icons/1046-0.png";

export const COMBAT_TASK_ICON_URL = "/icons/3399-0.png";

const COLLECTION_LOG_ITEM = 22711;
const DIARY_CAPE_ITEM = 19476;
// A stack's tooltip names this many of its events.
const TOOLTIP_EVENTS = 5;
const TOOLTIP_ITEMS = 3;

/** Every kind on, drops from 100K, toasts on. */
export function defaultEventFilters() {
  return { ...Object.fromEntries(EVENT_KINDS.map((kind) => [kind.key, true])), minLoot: 100000, toasts: true };
}

/** The filters as they were last chosen in this browser. */
export function loadEventFilters() {
  return { ...defaultEventFilters(), ...remembered(EVENT_FILTERS_KEY, {}) };
}

export function saveEventFilters(filters) {
  remember(EVENT_FILTERS_KEY, filters);
}

/** "loot", "level", "death" or "other"; null for a type the map doesn't show. */
export function eventKind(event) {
  return EVENT_KINDS.find((kind) => kind.types.includes(event.type))?.key ?? null;
}

/** Whether the filters (see defaultEventFilters) let an event onto the map. */
export function eventPasses(event, filters) {
  const kind = eventKind(event);
  if (!kind || !filters[kind]) return false;
  return kind !== "loot" || (event.value_gp || 0) >= (filters.minLoot || 0);
}

/** 0 for an everyday event, 1 for a notable one, 2 for a big drop. */
export function eventTier(event) {
  const collectionLog = event.type === "collection_log";
  if (eventKind(event) !== "loot" && !collectionLog) return 0;
  const value = event.value_gp || 0;
  if (value >= EVENT_TIER_GP[1]) return 2;
  return value >= EVENT_TIER_GP[0] || collectionLog ? 1 : 0;
}

/** The image for an event: its item, or a sprite for its type. "" when there is none. */
export function eventIconUrl(event) {
  switch (event.type) {
    case "death":
      return DEATH_ICON_URL;
    case "combat_task":
      return COMBAT_TASK_ICON_URL;
    case "level_up":
      return skillIconUrl(event.skill);
    case "superior_spawn":
      return skillIconUrl("slayer");
    case "achievement_diary":
      return Item.imageUrl(DIARY_CAPE_ITEM, 1);
    case "loot":
    case "pk_loot":
    case "collection_log": {
      const itemId =
        event.item_id ?? event.items?.[0]?.id ?? (event.type === "collection_log" ? COLLECTION_LOG_ITEM : null);
      return itemId === null ? "" : Item.imageUrl(itemId, 1);
    }
    default:
      return "";
  }
}

/** A few words to put next to an event's marker, or null. */
export function eventLabel(event) {
  switch (event.type) {
    case "loot":
    case "pk_loot":
      return `${formatGp(event.value_gp)} gp`;
    case "level_up":
      return `${event.level ?? ""} ${event.skill ?? ""}`.trim() || null;
    case "collection_log":
      return "New collection log";
    case "achievement_diary":
      return "Diary";
    case "combat_task":
      return "Combat task";
    case "superior_spawn":
      return "Superior";
    default:
      return null;
  }
}

/** Where an event says it happened, in the site's coordinates; null when it doesn't say. */
export function eventPlace(event) {
  const location = event.location;
  if (!location) return null;
  return GroupData.transformCoordinatesFromStorage([location.x, location.y, location.plane || 0]);
}

/** When an event happened, in ms since the epoch; null when it doesn't say. */
export function eventTimeMs(event) {
  const time = Date.parse(event.occurred_at);
  return Number.isNaN(time) ? null : time;
}

/** Whether an event happened so recently that it is news; `now` in ms, by the server's clock. */
export function eventIsFresh(event, now) {
  const time = eventTimeMs(event);
  return time !== null && now - time < EVENT_FRESH_MS;
}

function iconHtml(url, className) {
  return url ? `<img class="${className}" src="${escapeHtml(url)}" alt="" />` : "";
}

function whenHtml(event, now) {
  const time = eventTimeMs(event);
  if (time === null) return "";
  return `${relativeTime(event.occurred_at, new Date(now))} · ${clockTime(time)}`;
}

function detailLines(event, { now, place, approximate }) {
  const lines = [];
  const when = whenHtml(event, now);
  if (when) lines.push(when);
  const line = describeEvent(event);
  const worth = [];
  if (eventKind(event) === "loot" && event.value_gp) {
    worth.push(`<span class="event-tip__value">${formatGp(event.value_gp)} gp</span>`);
  }
  if (event.source && !line.includes(event.source)) worth.push(escapeHtml(event.source));
  if (worth.length) lines.push(worth.join(" · "));
  const items = (event.items || []).slice(0, TOOLTIP_ITEMS);
  if (items.length > 1) {
    const icons = items.map((item) => iconHtml(Item.imageUrl(item.id, item.quantity), "event-tip__item")).join("");
    if (icons) lines.push(`<span class="event-tip__items">${icons}</span>`);
  }
  if (place) lines.push(escapeHtml(place));
  if (approximate) lines.push("<em>Position approximate</em>");
  return lines;
}

/**
 * The tooltip for a marker's events (one, or the several of a stack), newest
 * or most notable first. `now` is in ms, `place` the name of where the marker
 * is, `approximate` whether that place is a guess.
 */
export function eventTooltipHtml(events, { now = Date.now(), place = null, approximate = false } = {}) {
  if (events.length === 1) {
    const [event] = events;
    const lines = [
      `<strong>${escapeHtml(describeEvent(event))}</strong>`,
      ...detailLines(event, { now, place, approximate }),
    ];
    return (
      `<div class="event-tip">${iconHtml(eventIconUrl(event), "event-tip__icon")}` +
      `<div class="event-tip__body">${lines.join("<br/>")}</div></div>`
    );
  }
  const rows = events.slice(0, TOOLTIP_EVENTS).map((event) => {
    const time = eventTimeMs(event);
    const ago =
      time === null ? "" : ` <span class="event-tip__ago">${relativeTime(event.occurred_at, new Date(now))}</span>`;
    return (
      `<div class="event-tip__row">${iconHtml(eventIconUrl(event), "event-tip__item")}` +
      `<span>${escapeHtml(describeEvent(event))}${ago}</span></div>`
    );
  });
  const more = events.length > TOOLTIP_EVENTS ? [`<div>and ${events.length - TOOLTIP_EVENTS} more</div>`] : [];
  const foot = [];
  if (place) foot.push(escapeHtml(place));
  if (approximate) foot.push("<em>Position approximate</em>");
  const footer = foot.length ? `<div class="event-tip__foot">${foot.join(" · ")}</div>` : "";
  return `<div class="event-tip event-tip--stack"><div class="event-tip__body">${rows.join("")}${more.join(
    ""
  )}${footer}</div></div>`;
}
