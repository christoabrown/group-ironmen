import { BaseElement } from "../base-element/base-element";
import { reorder } from "../dom";
import { groupData } from "../data/group-data";
import { carriedValue, filterMembers, overallXp, sortMembers, totalLevel, world } from "../data/roster-model";
import { formatGp, relativeTime } from "../data/format";
import { selection } from "../data/selection";

const DASH = "—";
const REFRESH_TIMES_MS = 30000;
// Sorts whose natural order runs A→Z; the others put the biggest value first.
const ASCENDING_SORTS = new Set(["name"]);

function setText(el, text) {
  if (el.textContent !== text) el.textContent = text;
}

function formatNumber(value) {
  return value === null || value === undefined ? DASH : value.toLocaleString();
}

// A directory of every player: one table row per player, created once and
// patched in place when that player's data changes.
export class PlayersPage extends BaseElement {
  constructor() {
    super();
    this.status = "all";
    this.text = "";
    this.sortKey = "status";
    this.descending = false;
  }

  html() {
    return `{{players-page.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    document.body.classList.add("players-page");
    this.render();
    this.rows = new Map();
    this.order = [];
    this.tbody = this.querySelector("tbody");
    this.countEl = this.querySelector(".players-page__count");
    this.emptyEl = this.querySelector(".players-page__empty");
    this.searchInput = this.querySelector(".players-page__search");
    this.searchInput.value = this.text;

    this.eventListener(this.searchInput, "input", this.handleSearchInput.bind(this));
    this.eventListener(this.querySelector(".players-page__chips"), "click", this.handleStatusClick.bind(this));
    this.eventListener(this.querySelector("thead"), "click", this.handleSortClick.bind(this));
    this.eventListener(this.tbody, "click", this.handleRowClick.bind(this));
    this.eventListener(this.tbody, "keydown", this.handleRowKeyDown.bind(this));

    this.updateStatusChips();
    this.updateSortHeaders();
    this.syncRows();
    this.subscribe("members-updated", this.syncRows.bind(this));
    this.subscribe("roster-changed", this.patchRows.bind(this));
    this.every(REFRESH_TIMES_MS, () => this.refreshTimes());
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.body.classList.remove("players-page");
  }

  handleSearchInput() {
    this.text = this.searchInput.value;
    this.applyOrder();
  }

  handleStatusClick(event) {
    const chip = event.target.closest("[data-status]");
    if (!chip) return;
    this.status = chip.dataset.status;
    this.updateStatusChips();
    this.applyOrder();
  }

  handleSortClick(event) {
    const header = event.target.closest("th[data-sort]");
    if (!header) return;
    const key = header.dataset.sort;
    if (key === this.sortKey) {
      this.descending = !this.descending;
    } else {
      this.sortKey = key;
      this.descending = false;
    }
    this.updateSortHeaders();
    this.applyOrder();
  }

  handleRowClick(event) {
    const row = event.target.closest("tr[data-name]");
    if (row) selection.select(row.dataset.name);
  }

  handleRowKeyDown(event) {
    if (event.key !== "Enter") return;
    this.handleRowClick(event);
  }

  updateStatusChips() {
    for (const chip of this.querySelectorAll(".players-page__chip")) {
      const active = chip.dataset.status === this.status;
      chip.classList.toggle("active", active);
      chip.setAttribute("aria-pressed", String(active));
    }
  }

  updateSortHeaders() {
    for (const header of this.querySelectorAll("th[data-sort]")) {
      const key = header.dataset.sort;
      const arrow = header.querySelector(".players-page__arrow");
      if (key !== this.sortKey) {
        header.classList.remove("players-page__sorted");
        header.removeAttribute("aria-sort");
        arrow.textContent = "";
        continue;
      }
      const ascending = ASCENDING_SORTS.has(key) !== this.descending;
      header.classList.add("players-page__sorted");
      header.setAttribute("aria-sort", ascending ? "ascending" : "descending");
      arrow.textContent = ascending ? " ▲" : " ▼";
    }
  }

  /** Adds rows for new players and drops the rows of players that left. */
  syncRows() {
    for (const member of groupData.members.values()) {
      if (!this.rows.has(member.name)) this.createRow(member);
    }
    for (const [name, row] of this.rows) {
      if (!groupData.members.has(name)) {
        row.tr.remove();
        this.rows.delete(name);
      }
    }
    this.applyOrder();
  }

  /** Updates only the rows of the players in `names`. */
  patchRows(names) {
    for (const name of names) {
      const member = groupData.members.get(name);
      const row = this.rows.get(name);
      if (!member) {
        row?.tr.remove();
        this.rows.delete(name);
      } else if (row) {
        this.patchRow(row, member);
      } else {
        this.createRow(member);
      }
    }
    this.applyOrder();
  }

  createRow(member) {
    const tr = document.createElement("tr");
    tr.className = "players-page__row";
    tr.dataset.name = member.name;
    tr.tabIndex = 0;

    const cell = (className) => {
      const td = document.createElement("td");
      if (className) td.className = className;
      tr.appendChild(td);
      return td;
    };

    const nameCell = document.createElement("span");
    nameCell.className = "players-page__name";
    cell().appendChild(nameCell);
    const dot = document.createElement("span");
    dot.className = "players-page__dot";
    dot.style.background = member.color;
    const name = document.createElement("span");
    name.className = "players-page__player-name";
    name.textContent = member.name;
    nameCell.append(dot, name);

    const status = cell("players-page__status");
    const statusText = document.createElement("span");
    const orphanedBadge = document.createElement("span");
    orphanedBadge.className = "players-page__badge";
    orphanedBadge.textContent = "not shared";
    orphanedBadge.title = "No longer shared with the guild on the hub";
    status.append(statusText, orphanedBadge);

    const row = {
      tr,
      status,
      statusText,
      orphanedBadge,
      type: cell("players-page__col-type"),
      owner: cell("players-page__col-owner"),
      total: cell("players-page__num"),
      xp: cell("players-page__num players-page__col-xp"),
      value: cell("players-page__num players-page__col-value"),
      combat: cell("players-page__num"),
    };
    this.rows.set(member.name, row);
    this.patchRow(row, member);
    return row;
  }

  patchRow(row, member) {
    row.tr.classList.toggle("players-page__row--offline", !member.online);
    this.patchStatus(row, member);
    setText(row.type, member.meta?.type_label || DASH);
    setText(row.owner, member.meta?.owner || DASH);
    setText(row.total, formatNumber(totalLevel(member)));
    setText(row.xp, formatNumber(overallXp(member)));
    const value = carriedValue(member);
    setText(row.value, value === null ? DASH : formatGp(value));
    setText(row.combat, formatNumber(member.combatLevel));
  }

  patchStatus(row, member) {
    row.status.classList.toggle("players-page__status--online", member.online);
    row.orphanedBadge.hidden = !member.orphaned;
    if (member.online) {
      const w = world(member);
      setText(row.statusText, w ? `Online W${w}` : "Online");
      row.status.title = "";
    } else {
      setText(row.statusText, member.lastSeen ? relativeTime(member.lastSeen) : "Offline");
      row.status.title = member.lastSeen ? `Last seen ${member.lastSeen.toLocaleString()}` : "";
    }
  }

  refreshTimes() {
    for (const [name, row] of this.rows) {
      const member = groupData.members.get(name);
      if (member) this.patchStatus(row, member);
    }
  }

  /** Puts the visible rows in sort order, moving only rows that are out of place. */
  applyOrder() {
    const members = [...groupData.members.values()];
    const visible = sortMembers(
      filterMembers(members, { text: this.text, status: this.status }),
      this.sortKey,
      this.descending
    );
    const order = visible.map((member) => member.name).filter((name) => this.rows.has(name));

    const changed = order.length !== this.order.length || order.some((name, i) => name !== this.order[i]);
    if (changed) {
      this.order = order;
      reorder(
        this.tbody,
        order.map((name) => this.rows.get(name).tr)
      );
    }

    const online = members.filter((member) => member.online).length;
    let count = `${members.length} player${members.length === 1 ? "" : "s"} (${online} online)`;
    if (order.length !== members.length) count += ` · ${order.length} shown`;
    setText(this.countEl, count);

    this.emptyEl.hidden = order.length > 0;
    setText(this.emptyEl, members.length === 0 ? "No players yet." : "No players match.");
  }
}

customElements.define("players-page", PlayersPage);
