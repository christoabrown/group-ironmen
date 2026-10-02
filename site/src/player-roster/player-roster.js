import { BaseElement } from "../base-element/base-element";
import { groupData } from "../data/group-data";
import { reorder } from "../dom";
import { filterMembers, sortLabel, sortMembers, totalLevel, world } from "../data/roster-model";
import { relativeTime } from "../data/format";
import { selection, MAX_TRAILS } from "../data/selection";
import { remember, remembered } from "../data/storage";

// The sort orders (see roster-model.js) this narrow list offers.
const SORT_OPTIONS = ["status", "name", "region", "total", "world", "lastSeen"];
const TIME_REFRESH_MS = 30000;
const SETTINGS_KEY = "roster-settings";

/** Short labels for the hub's account types (0 is a normal account). */
export const ACCOUNT_TYPE_BADGES = {
  1: { text: "IM", title: "Ironman" },
  2: { text: "UIM", title: "Ultimate ironman" },
  3: { text: "HCIM", title: "Hardcore ironman" },
  4: { text: "GIM", title: "Group ironman" },
  5: { text: "HCGIM", title: "Hardcore group ironman" },
  6: { text: "UGIM", title: "Unranked group ironman" },
};

function loadSettings() {
  return { status: "all", sort: "status", ...remembered(SETTINGS_KEY, {}) };
}

/**
 * The side panel's list of every player: one compact row each, updated in
 * place as data arrives. Clicking a row opens the player's profile and follows
 * them on the map.
 */
export class PlayerRoster extends BaseElement {
  constructor() {
    super();
    this.rows = new Map();
    this.order = [];
    const settings = loadSettings();
    this.status = settings.status;
    this.sort = settings.sort;
    this.text = "";
  }

  html() {
    return `{{player-roster.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.render();
    this.list = this.querySelector(".player-roster__list");
    this.countEl = this.querySelector(".player-roster__count");
    this.searchEl = this.querySelector(".player-roster__search");
    this.sortEl = this.querySelector(".player-roster__sort");
    this.chipsEl = this.querySelector(".player-roster__chips");

    this.sortEl.replaceChildren(...SORT_OPTIONS.map((key) => new Option(sortLabel(key), key)));
    this.sortEl.value = this.sort;
    this.updateChips();

    this.eventListener(this.searchEl, "input", () => {
      this.text = this.searchEl.value;
      this.refreshOrder();
    });
    this.eventListener(this.sortEl, "change", () => {
      this.sort = this.sortEl.value;
      this.saveSettings();
      this.refreshOrder();
    });
    this.eventListener(this.chipsEl, "click", (event) => {
      const chip = event.target.closest("[data-status]");
      if (!chip) return;
      this.status = chip.dataset.status;
      this.saveSettings();
      this.updateChips();
      this.refreshOrder();
    });
    this.eventListener(this.list, "click", this.handleListClick.bind(this));

    this.subscribe("members-updated", this.handleMembersUpdated.bind(this));
    this.subscribe("roster-changed", this.handleRosterChanged.bind(this));
    this.subscribe("player-selected", this.handleSelected.bind(this));
    this.subscribe("trails-changed", this.handleTrailsChanged.bind(this));
    this.every(TIME_REFRESH_MS, () => this.refreshTimes());
  }

  saveSettings() {
    remember(SETTINGS_KEY, { status: this.status, sort: this.sort });
  }

  updateChips() {
    for (const chip of this.chipsEl.querySelectorAll("[data-status]")) {
      chip.classList.toggle("active", chip.dataset.status === this.status);
    }
  }

  handleMembersUpdated(members) {
    const names = new Set(members.map((member) => member.name));
    for (const [name, row] of this.rows) {
      if (!names.has(name)) {
        row.remove();
        this.rows.delete(name);
      }
    }
    for (const member of members) {
      if (!this.rows.has(member.name)) {
        this.rows.set(member.name, this.createRow(member));
      }
      this.updateRow(member);
    }
    selection.retainTrails(names);
    this.refreshOrder();
  }

  handleRosterChanged(names) {
    for (const name of names) {
      const member = groupData.members.get(name);
      if (member && this.rows.has(name)) this.updateRow(member);
    }
    this.refreshOrder();
  }

  handleSelected(selected) {
    for (const [name, row] of this.rows) {
      row.classList.toggle("player-roster__row--selected", selected?.name === name);
    }
    const row = selected && this.rows.get(selected.name);
    if (row && row.isConnected) {
      row.scrollIntoView({ block: "nearest" });
    }
  }

  handleTrailsChanged(trails) {
    for (const [name, row] of this.rows) {
      const on = trails.has(name);
      row.trailButton.classList.toggle("active", on);
      row.trailButton.title = on ? "Hide trail" : "Show trail";
    }
  }

  handleListClick(event) {
    const row = event.target.closest(".player-roster__row");
    if (!row) return;
    const name = row.dataset.name;
    if (event.target.closest(".player-roster__trail")) {
      if (!selection.toggleTrail(name)) {
        row.trailButton.title = `At most ${MAX_TRAILS} trails at once`;
      }
      return;
    }
    if (selection.selected === name) {
      selection.clear();
    } else {
      selection.select(name);
    }
  }

  createRow(member) {
    const row = document.createElement("li");
    row.className = "player-roster__row";
    row.dataset.name = member.name;
    row.innerHTML = `
      <span class="player-roster__dot"></span>
      <div class="player-roster__main">
        <div class="player-roster__line">
          <span class="player-roster__name"></span>
          <span class="player-roster__badge"></span>
          <span class="player-roster__world"></span>
        </div>
        <div class="player-roster__line player-roster__line--sub">
          <span class="player-roster__place"></span>
          <span class="player-roster__level"></span>
        </div>
        <div class="player-roster__bar player-roster__bar--hitpoints"><div class="player-roster__bar-fill"></div></div>
        <div class="player-roster__bar player-roster__bar--prayer"><div class="player-roster__bar-fill"></div></div>
      </div>
      <button type="button" class="player-roster__trail" title="Show trail" aria-label="Show trail"></button>`;
    row.style.setProperty("--player-color", member.color);
    row.style.setProperty("--player-light", member.lightColor);
    row.querySelector(".player-roster__name").textContent = member.name;
    row.placeEl = row.querySelector(".player-roster__place");
    row.worldEl = row.querySelector(".player-roster__world");
    row.levelEl = row.querySelector(".player-roster__level");
    row.badgeEl = row.querySelector(".player-roster__badge");
    row.hitpointsBar = row.querySelector(".player-roster__bar--hitpoints");
    row.prayerBar = row.querySelector(".player-roster__bar--prayer");
    row.trailButton = row.querySelector(".player-roster__trail");
    row.trailButton.classList.toggle("active", selection.hasTrail(member.name));
    if (selection.selected === member.name) row.classList.add("player-roster__row--selected");
    return row;
  }

  updateRow(member) {
    const row = this.rows.get(member.name);
    if (!row) return;
    row.classList.toggle("player-roster__row--offline", !member.online);
    row.classList.toggle("player-roster__row--orphaned", member.orphaned);

    const currentWorld = world(member);
    row.worldEl.textContent = currentWorld ? `W${currentWorld}` : "";

    row.placeEl.textContent = this.placeText(member);
    row.placeEl.title = member.lastSeen ? `Last seen ${member.lastSeen.toLocaleString()}` : "";

    const level = totalLevel(member);
    row.levelEl.textContent = level ? level.toLocaleString() : "";
    row.levelEl.title = level ? "Total level" : "";

    const badge = ACCOUNT_TYPE_BADGES[member.meta?.type];
    row.badgeEl.textContent = badge?.text || "";
    row.badgeEl.title = badge?.title || "";
    row.badgeEl.dataset.type = member.meta?.type ?? "";

    this.updateBar(row.hitpointsBar, "Hitpoints", member.online && member.stats?.hitpoints);
    this.updateBar(row.prayerBar, "Prayer", member.online && member.stats?.prayer);
  }

  /** `stat` is `{ current, max }`; anything else empties the bar. */
  updateBar(bar, label, stat) {
    const known = Boolean(stat?.max);
    const ratio = known ? Math.max(0, Math.min(1, stat.current / stat.max)) : 0;
    bar.firstElementChild.style.transform = `scaleX(${ratio})`;
    bar.title = known ? `${label} ${stat.current} / ${stat.max}` : "";
  }

  placeText(member, now = new Date()) {
    if (member.orphaned) return "Not shared any more";
    if (!member.online) return member.lastSeen ? `Offline · ${relativeTime(member.lastSeen, now)}` : "Offline";
    if (member.meta?.special_world) return "On a special world";
    return member.region || (member.coordinates ? "Online" : "Online · location private");
  }

  refreshTimes() {
    const now = new Date();
    for (const [name, row] of this.rows) {
      const member = groupData.members.get(name);
      if (member && !member.online) row.placeEl.textContent = this.placeText(member, now);
    }
  }

  refreshOrder() {
    const members = [...this.rows.keys()].map((name) => groupData.members.get(name)).filter(Boolean);
    const visible = filterMembers(members, { text: this.text, status: this.status });
    const order = sortMembers(visible, this.sort).map((member) => member.name);

    const online = members.filter((member) => member.online).length;
    this.countEl.textContent = `${online} online · ${members.length} players`;

    if (order.length === this.order.length && order.every((name, i) => name === this.order[i])) return;
    this.order = order;
    // Rows that are filtered out leave the list; they stay in `rows`.
    reorder(
      this.list,
      order.map((name) => this.rows.get(name))
    );
    this.querySelector(".player-roster__empty").hidden = order.length > 0;
  }
}

customElements.define("player-roster", PlayerRoster);
