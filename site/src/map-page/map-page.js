import { BaseElement } from "../base-element/base-element";
import { api } from "../data/api";
import { groupData, GroupData } from "../data/group-data";
import { selection } from "../data/selection";
import { formatGp } from "../data/hub-format";

const TRAIL_REFRESH_MS = 60000;
const FILTERS_KEY = "map-event-filters";

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
    this.eventControls = this.querySelector(".map-page__events");

    this.planeSelect.value = this.worldMap.plane || 1;
    this.renderEventControls();

    this.eventListener(this.planeSelect, "change", this.handlePlaneSelect.bind(this));
    this.eventListener(this.planeSelect, "wheel", this.handlePlaneWheel.bind(this), { passive: false });
    this.eventListener(this.worldMap, "plane-changed", this.handlePlaneChange.bind(this));
    this.eventListener(this.trailDaysSelect, "change", () => this.loadTrails());
    this.eventListener(this.trailChips, "click", this.handleTrailChipClick.bind(this));
    this.eventListener(this.querySelector(".map-page__trails-clear"), "click", () => selection.clearTrails());
    this.eventListener(this.querySelector(".map-page__roster-toggle"), "click", () =>
      document.body.classList.toggle("roster-open")
    );
    this.eventListener(this.eventControls, "change", this.handleEventFilterChange.bind(this));
    this.subscribe("features", this.handleFeatures.bind(this));
    this.subscribe("trails-changed", () => this.loadTrails());
    this.subscribe("live-events", this.handleLiveEvents.bind(this));
    this.subscribe("player-selected", () => document.body.classList.remove("roster-open"));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.clearInterval(this.trailRefresh);
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
    this.historyEnabled = history;
    this.renderTrailChips();
  }

  // ---------------------------------------------------------------------------
  // Trails
  // ---------------------------------------------------------------------------

  async loadTrails() {
    window.clearInterval(this.trailRefresh);
    const names = [...selection.trails];
    this.renderTrailChips();
    if (!names.length) {
      this.trailData.clear();
      this.worldMap.clearTrails();
      return;
    }
    const days = parseInt(this.trailDaysSelect.value, 10);
    const requestId = (this.trailRequestId = (this.trailRequestId || 0) + 1);
    try {
      const data = await api.getTrails(names, days);
      if (!this.isConnected || requestId !== this.trailRequestId) return;
      this.trailData = new Map(data.trails.map((trail) => [trail.member, trail]));
      this.worldMap.clearTrails();
      for (const trail of data.trails) {
        if (!trail.shared) continue;
        const color = groupData.members.get(trail.member)?.color || "#f5d742";
        this.worldMap.setTrail(trail.member, trail.points, color);
      }
      this.trailError = null;
    } catch (error) {
      if (!this.isConnected || requestId !== this.trailRequestId) return;
      this.trailError = error.status === 503 ? "Hub busy" : "Trails unavailable";
    }
    this.renderTrailChips();
    this.trailRefresh = window.setInterval(() => this.loadTrails(), TRAIL_REFRESH_MS);
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
        chip.style.setProperty("--player-color", groupData.members.get(name)?.color || "#f5d742");
        const trail = this.trailData.get(name);
        const notShared = trail && !trail.shared;
        const empty = trail?.shared && trail.points.length === 0;
        chip.textContent = `${name}${notShared ? " (not shared)" : empty ? " (no points)" : ""}`;
        chip.classList.toggle("map-page__trail-chip--off", Boolean(notShared || empty));
        chip.title = "Remove this trail";
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
  }

  handleLiveEvents({ added }) {
    for (const event of added) {
      const ping = pingForEvent(event, groupData.members.get(event.member), this.filters);
      if (ping) this.worldMap.addPing(ping);
    }
  }
}
customElements.define("map-page", MapPage);
