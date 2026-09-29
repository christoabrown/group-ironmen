import { BaseElement } from "../base-element/base-element";
import { utility } from "../utility";

const ONLINE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function relativeTime(date) {
  if (!date) return "Never";
  const now = Date.now();
  const then = date.getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHr < 24) return `${diffHr} hour${diffHr !== 1 ? "s" : ""} ago`;
  if (diffDay < 30) return `${diffDay} day${diffDay !== 1 ? "s" : ""} ago`; // ~30 days/month approximation
  const diffMonth = Math.floor(diffDay / 30);
  return `${diffMonth} month${diffMonth !== 1 ? "s" : ""} ago`;
}

function isOnline(member) {
  if (!member.lastUpdated) return false;
  const timeSince = utility.timeSinceLastUpdate(member.lastUpdated);
  return !isNaN(timeSince) && timeSince <= ONLINE_THRESHOLD_MS;
}

export class PlayersPage extends BaseElement {
  constructor() {
    super();
    this.statusFilter = "all";
    this.nameFilter = "";
  }

  html() {
    return `{{players-page.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    document.body.classList.add("players-page");
    this.render();
    this.listEl = this.querySelector(".players-page__list");
    this.countEl = this.querySelector(".players-page__count");
    this.searchInput = this.querySelector(".players-page__search");

    this.eventListener(this.querySelector(".players-page__filters"), "click", this.handleFilterClick.bind(this));
    this.eventListener(this.searchInput, "input", this.handleSearchInput.bind(this));

    this.subscribe("members-updated", this.handleUpdatedMembers.bind(this));
    this.refreshInterval = setInterval(() => this.updateRelativeTimes(), 30000);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.body.classList.remove("players-page");
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  handleFilterClick(e) {
    const btn = e.target.closest("[data-filter]");
    if (!btn) return;
    this.statusFilter = btn.getAttribute("data-filter");

    this.querySelectorAll(".players-page__filter-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    this.renderPlayerList();
  }

  handleSearchInput() {
    this.nameFilter = this.searchInput.value.trim().toLowerCase();
    this.renderPlayerList();
  }

  handleUpdatedMembers(members) {
    this.members = members;
    this.renderPlayerList();
  }

  renderPlayerList() {
    if (!this.members || !this.listEl) return;

    const online = [];
    const offline = [];

    for (const member of this.members) {
      // Apply name filter
      if (this.nameFilter && !member.name.toLowerCase().includes(this.nameFilter)) {
        continue;
      }

      if (isOnline(member)) {
        online.push(member);
      } else {
        offline.push(member);
      }
    }

    // Sort offline by lastUpdated descending (most recently seen first)
    offline.sort((a, b) => {
      const aTime = a.lastUpdated ? a.lastUpdated.getTime() : 0;
      const bTime = b.lastUpdated ? b.lastUpdated.getTime() : 0;
      return bTime - aTime;
    });

    const showOnline = this.statusFilter === "all" || this.statusFilter === "online";
    const showOffline = this.statusFilter === "all" || this.statusFilter === "offline";

    let html = "";

    if (showOnline) {
      for (const member of online) {
        const safeName = escapeHtml(member.name);
        html += `
          <div class="players-page__player players-page__player--online rsborder rsbackground">
            <div class="players-page__player-header">
              <player-icon player-name="${safeName}"></player-icon>
              <span class="players-page__player-name">${safeName}</span>
              <span class="players-page__badge players-page__badge--online">Online</span>
              <span class="players-page__last-data" data-last-updated="${
                member.lastUpdated ? member.lastUpdated.toISOString() : ""
              }">Last data: ${relativeTime(member.lastUpdated)}</span>
            </div>
            <player-panel class="rsborder rsbackground" player-name="${safeName}"></player-panel>
          </div>`;
      }
    }

    if (showOffline) {
      for (const member of offline) {
        const safeName = escapeHtml(member.name);
        html += `
          <div class="players-page__player players-page__player--offline rsborder rsbackground">
            <div class="players-page__player-header">
              <player-icon player-name="${safeName}"></player-icon>
              <span class="players-page__player-name">${safeName}</span>
              <span class="players-page__badge players-page__badge--offline">Offline</span>
              <span class="players-page__last-data" data-last-updated="${
                member.lastUpdated ? member.lastUpdated.toISOString() : ""
              }">Last data: ${relativeTime(member.lastUpdated)}</span>
            </div>
          </div>`;
      }
    }

    this.listEl.innerHTML = html;

    // Update count
    const shownOnline = showOnline ? online.length : 0;
    const shownOffline = showOffline ? offline.length : 0;
    this.countEl.textContent = `${shownOnline + shownOffline} player${
      shownOnline + shownOffline !== 1 ? "s" : ""
    } (${shownOnline} online)`;
  }

  updateRelativeTimes() {
    const els = this.querySelectorAll(".players-page__last-data[data-last-updated]");
    for (const el of els) {
      const iso = el.getAttribute("data-last-updated");
      if (iso) {
        el.textContent = `Last data: ${relativeTime(new Date(iso))}`;
      }
    }
  }
}

customElements.define("players-page", PlayersPage);
