import { BaseElement } from "../base-element/base-element";
import { api } from "../data/api";
import { groupData, GroupData } from "../data/group-data";
import { selection } from "../data/selection";
import { colorForName } from "../data/player-colors";
import { formatGp } from "../data/hub-format";
import { deathMarks } from "../canvas-map/trail-model";
// The page drives these two from the moment it is connected, so they have to
// be defined before it is.
import "../canvas-map/canvas-map";
import "../trail-scrubber/trail-scrubber";

const TRAIL_REFRESH_MS = 60000;
// The first retry after a failed trail request; it doubles up to the normal refresh.
const TRAIL_RETRY_MS = 5000;
// Hub data older than this is the server's stale copy: the hub isn't answering.
const TRAIL_STALE_S = 180;
const TRAIL_DAYS_KEY = "map-trail-days";
// As many deaths as the server will give: it keeps the latest events only.
const TRAIL_DEATHS_LIMIT = 500;
const FILTERS_KEY = "map-event-filters";

/** "Hub data from 14:05" when `asOf` (unix seconds) is too long ago, else null. */
function staleNotice(asOf) {
  if (!asOf || Date.now() / 1000 - asOf < TRAIL_STALE_S) return null;
  const time = new Date(asOf * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `Hub data from ${time}`;
}

/** The day a trail (as the server sends it) starts, e.g. "26 Sep". */
function trailStartDay(trail) {
  const [, , , time, dwell = 0] = trail.points[0];
  return new Date((time - dwell) * 1000).toLocaleDateString([], { day: "numeric", month: "short" });
}

/** The trail length chosen last time, when the select still offers it. */
function storedTrailDays(select) {
  let stored = null;
  try {
    stored = localStorage.getItem(TRAIL_DAYS_KEY);
  } catch {
    // Private mode.
  }
  return [...select.options].some((option) => option.value === stored) ? stored : select.value;
}

/** Which hub events show on the map, and how. */
export const PING_KINDS = [
  { key: "loot", label: "Loot", types: ["loot", "pk_loot"] },
  { key: "level", label: "Levels", types: ["level_up"] },
  { key: "death", label: "Deaths", types: ["death"] },
  { key: "other", label: "Other", types: ["collection_log", "achievement_diary", "combat_task", "superior_spawn"] },
];

export const MIN_LOOT_OPTIONS = [
  [0, "Any drop"],
  [100000, "100K+"],
  [1000000, "1M+"],
  [10000000, "10M+"],
];

export function defaultPingFilters() {
  return { loot: true, level: true, death: true, other: true, minLoot: 100000 };
}

export function loadPingFilters() {
  try {
    return { ...defaultPingFilters(), ...JSON.parse(localStorage.getItem(FILTERS_KEY) || "{}") };
  } catch {
    return defaultPingFilters();
  }
}

/** The ping for a hub event, or null when the filters hide it or its place is unknown. */
export function pingForEvent(event, member, filters) {
  const kind = PING_KINDS.find((candidate) => candidate.types.includes(event.type));
  if (!kind || !filters[kind.key]) return null;
  if (kind.key === "loot" && (event.value_gp || 0) < (filters.minLoot || 0)) return null;

  let position = null;
  if (event.location) {
    position = GroupData.transformCoordinatesFromStorage([
      event.location.x,
      event.location.y,
      event.location.plane || 0,
    ]);
  } else if (member?.online && member.coordinates) {
    position = member.coordinates;
  }
  if (!position) return null;

  let label = null;
  if (kind.key === "loot") label = `${formatGp(event.value_gp)} gp`;
  else if (event.type === "level_up") label = `${event.level ?? ""} ${event.skill ?? ""}`.trim();
  else if (event.type === "collection_log") label = "New collection log";
  else if (event.type === "achievement_diary") label = "Diary";
  else if (event.type === "combat_task") label = "Combat task";
  return {
    x: position.x,
    y: position.y,
    plane: position.plane,
    color: member?.color || "#ff981f",
    kind: kind.key,
    label,
  };
}

export class MapPage extends BaseElement {
  constructor() {
    super();
    this.filters = loadPingFilters();
    this.trailData = new Map();
    this.deathEvents = [];
  }

  html() {
    return `{{map-page.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.render();
    this.worldMap = document.querySelector("#background-worldmap");
    document.querySelector(".authed-section").classList.add("no-pointer-events");
    this.worldMap.classList.add("interactable");
    this.planeSelect = this.querySelector(".map-page__plane-select");
    this.trailControls = this.querySelector(".map-page__trails");
    this.trailChips = this.querySelector(".map-page__trail-chips");
    this.trailDaysSelect = this.querySelector(".map-page__trail-days");
    this.replayButton = this.querySelector(".map-page__trails-replay");
    this.scrubber = this.querySelector("trail-scrubber");
    this.eventControls = this.querySelector(".map-page__events");

    this.planeSelect.value = this.worldMap.plane || 1;
    this.trailDaysSelect.value = storedTrailDays(this.trailDaysSelect);
    this.renderEventControls();
    this.scrubber.nextChange = (time) => this.worldMap.trailNextChange(time);
    this.scrubber.nextHold = (from, to) => this.worldMap.trailNextHop(from, to);
    this.scrubber.setWindowDays(parseInt(this.trailDaysSelect.value, 10));

    this.eventListener(this.planeSelect, "change", this.handlePlaneSelect.bind(this));
    this.eventListener(this.planeSelect, "wheel", this.handlePlaneWheel.bind(this), { passive: false });
    this.eventListener(this.worldMap, "plane-changed", this.handlePlaneChange.bind(this));
    this.eventListener(this.trailDaysSelect, "change", this.handleTrailDaysChange.bind(this));
    this.eventListener(this.trailChips, "click", this.handleTrailChipClick.bind(this));
    this.eventListener(this.replayButton, "click", this.handleReplayClick.bind(this));
    this.eventListener(this.scrubber, "replay-change", this.handleReplayChange.bind(this));
    this.eventListener(this.worldMap, "trail-timeline-changed", () =>
      this.scrubber.setTimeline(this.worldMap.trailTimeline())
    );
    // The replay follows the player until the map is moved by hand.
    this.eventListener(this.worldMap, "map-dragged", () => this.scrubber.setFollow(false));
    this.eventListener(this.querySelector(".map-page__trails-clear"), "click", () => selection.clearTrails());
    this.eventListener(this.querySelector(".map-page__roster-toggle"), "click", () =>
      document.body.classList.toggle("roster-open")
    );
    this.eventListener(this.eventControls, "change", this.handleEventFilterChange.bind(this));
    this.subscribe("features", this.handleFeatures.bind(this));
    this.subscribe("trails-changed", () => this.loadTrails());
    // Only events that arrive while the map is open ping; not the last batch again.
    this.subscribe("live-events", this.handleLiveEvents.bind(this), false);
    this.subscribe("player-selected", () => document.body.classList.remove("roster-open"));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.clearTimeout(this.trailRefresh);
    this.worldMap.setReplayTime(null);
    this.worldMap.clearTrails();
    this.worldMap.classList.remove("interactable");
    document.body.classList.remove("roster-open");
    document.querySelector(".authed-section")?.classList.remove("no-pointer-events");
  }

  getSelectedPlane() {
    return parseInt(this.planeSelect.value, 10);
  }

  handlePlaneChange(evt) {
    const plane = evt.detail.plane;
    if (this.getSelectedPlane() !== plane) {
      this.planeSelect.value = plane;
    }
  }

  handlePlaneSelect() {
    this.worldMap.stopFollowingPlayer();
    this.worldMap.showPlane(this.getSelectedPlane());
  }

  handlePlaneWheel(event) {
    event.preventDefault();
    const current = this.getSelectedPlane();
    const direction = event.deltaY > 0 ? 1 : -1;
    const next = Math.min(Math.max(current + direction, 1), 4);
    if (next !== current) {
      this.planeSelect.value = next;
      this.handlePlaneSelect();
    }
  }

  handleFeatures(features) {
    const history = Boolean(features?.hub_history);
    this.eventControls.hidden = !history;
    const switchedOn = history && this.historyEnabled === false;
    this.historyEnabled = history;
    if (switchedOn) this.loadTrails();
    this.renderTrailChips();
  }

  // ---------------------------------------------------------------------------
  // Trails
  // ---------------------------------------------------------------------------

  handleTrailDaysChange() {
    try {
      localStorage.setItem(TRAIL_DAYS_KEY, this.trailDaysSelect.value);
    } catch {
      // Not remembered in private mode.
    }
    this.scrubber.setWindowDays(parseInt(this.trailDaysSelect.value, 10));
    this.loadTrails();
  }

  handleReplayClick() {
    if (this.scrubber.isOpen) this.scrubber.close();
    else this.scrubber.open();
  }

  /** The replay shows a time on the trails, or was closed (null) and the map is live again. */
  handleReplayChange(event) {
    const { time, follow } = event.detail;
    this.replayButton.setAttribute("aria-pressed", String(time !== null));
    this.replayButton.classList.toggle("active", time !== null);
    this.worldMap.setReplayTime(time, { follow: Boolean(follow) });
  }

  /**
   * Fetches the selected trails and draws them, then again every minute. A
   * later call (another selection, another length) overtakes one whose
   * answer is still under way.
   */
  async loadTrails() {
    window.clearTimeout(this.trailRefresh);
    const requestId = (this.trailRequestId = (this.trailRequestId || 0) + 1);
    const names = [...selection.trails];
    // A trail that was switched off goes at once, whatever the request does.
    for (const name of this.worldMap.trailNames()) {
      if (!selection.hasTrail(name)) this.worldMap.clearTrail(name);
    }
    for (const name of [...this.trailData.keys()]) {
      if (!selection.hasTrail(name)) this.trailData.delete(name);
    }
    // Nothing to fetch, or (once the server has said so) no history to fetch it from.
    if (!names.length || this.historyEnabled === false) {
      this.trailError = null;
      this.trailFailures = 0;
      this.renderTrailChips();
      return;
    }
    this.renderTrailChips();

    const days = parseInt(this.trailDaysSelect.value, 10);
    let retryIn = TRAIL_REFRESH_MS;
    try {
      const data = await api.getTrails(names, days);
      if (!this.isConnected || requestId !== this.trailRequestId) return;
      this.trailData = new Map(data.trails.map((trail) => [trail.member, trail]));
      for (const trail of data.trails) {
        if (trail.shared) {
          const { color, light } = colorForName(trail.member);
          this.worldMap.setTrail(trail.member, trail, { color, light, windowS: days * 86400 });
        } else {
          this.worldMap.clearTrail(trail.member);
        }
      }
      this.trailFailures = 0;
      this.trailError = staleNotice(data.as_of);
      this.showTrailDeaths();
      this.loadTrailDeaths();
    } catch (error) {
      if (!this.isConnected || requestId !== this.trailRequestId) return;
      // What is drawn stays; it is only getting older.
      this.trailError = error.status === 503 ? "Hub busy" : "Trails unavailable";
      this.trailFailures = (this.trailFailures || 0) + 1;
      retryIn = Math.min(TRAIL_RETRY_MS * 2 ** (this.trailFailures - 1), TRAIL_REFRESH_MS);
    }
    this.renderTrailChips();
    this.trailRefresh = window.setTimeout(() => this.loadTrails(), retryIn);
  }

  /** Fetches the deaths the server still knows of, to mark them on the trails. */
  async loadTrailDeaths() {
    try {
      this.deathEvents = await api.getHubEvents({ types: ["death"], limit: TRAIL_DEATHS_LIMIT });
    } catch {
      // The trails are shown without them.
      return;
    }
    if (this.isConnected) this.showTrailDeaths();
  }

  /** Marks the deaths on the trails shown, unless deaths are filtered out of the map. */
  showTrailDeaths() {
    for (const name of this.worldMap.trailNames()) {
      this.worldMap.setTrailDeaths(name, this.filters.death ? deathMarks(this.deathEvents, name) : []);
    }
  }

  renderTrailChips() {
    const names = [...selection.trails];
    this.trailControls.hidden = !this.historyEnabled || names.length === 0;
    this.trailChips.replaceChildren(
      ...names.map((name) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "map-page__trail-chip";
        chip.dataset.name = name;
        chip.style.setProperty("--player-color", colorForName(name).color);
        const trail = this.trailData.get(name);
        const notShared = trail && !trail.shared;
        const empty = trail?.shared && trail.points.length === 0;
        // The server cuts a trail with more than it can send down to its newest part.
        const since = trail?.shared && trail.truncated && !empty ? trailStartDay(trail) : null;
        const note = notShared ? " (not shared)" : empty ? " (no points)" : since ? ` (since ${since})` : "";
        chip.textContent = `${name}${note}`;
        chip.classList.toggle("map-page__trail-chip--off", Boolean(notShared || empty));
        chip.title = since ? "Too much to show for the whole period. Remove this trail" : "Remove this trail";
        return chip;
      })
    );
    if (this.trailError) {
      const error = document.createElement("span");
      error.className = "map-page__trail-error";
      error.textContent = this.trailError;
      this.trailChips.appendChild(error);
    }
  }

  handleTrailChipClick(event) {
    const chip = event.target.closest(".map-page__trail-chip");
    if (chip) selection.toggleTrail(chip.dataset.name);
  }

  // ---------------------------------------------------------------------------
  // Event pings
  // ---------------------------------------------------------------------------

  renderEventControls() {
    const toggles = this.querySelector(".map-page__event-kinds");
    toggles.replaceChildren(
      ...PING_KINDS.map((kind) => {
        const label = document.createElement("label");
        label.className = "map-page__event-kind";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.name = kind.key;
        input.checked = Boolean(this.filters[kind.key]);
        label.append(input, document.createTextNode(kind.label));
        return label;
      })
    );
    const minLoot = this.querySelector(".map-page__event-min-loot");
    minLoot.replaceChildren(...MIN_LOOT_OPTIONS.map(([value, text]) => new Option(text, String(value))));
    minLoot.value = String(this.filters.minLoot);
  }

  handleEventFilterChange(event) {
    const target = event.target;
    if (target.classList.contains("map-page__event-min-loot")) {
      this.filters.minLoot = parseInt(target.value, 10);
    } else if (target.name) {
      this.filters[target.name] = target.checked;
    }
    try {
      localStorage.setItem(FILTERS_KEY, JSON.stringify(this.filters));
    } catch {
      // Not remembered in private mode.
    }
    this.showTrailDeaths();
  }

  handleLiveEvents({ added }) {
    for (const event of added) {
      const ping = pingForEvent(event, groupData.members.get(event.member), this.filters);
      if (ping) this.worldMap.addPing(ping);
    }
    const deaths = added.filter((event) => event.type === "death");
    if (deaths.length) {
      this.deathEvents = [...deaths, ...this.deathEvents];
      this.showTrailDeaths();
    }
  }
}
customElements.define("map-page", MapPage);
