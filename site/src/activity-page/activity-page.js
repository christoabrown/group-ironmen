import { BaseElement } from "../base-element/base-element";
import { api } from "../data/api";
import { Item } from "../data/item";

const EVENTS_REFRESH_MS = 15000;
const EVENT_FILTERS = [
  { label: "All", types: [] },
  { label: "Loot", types: ["loot", "pk_loot"] },
  { label: "Level ups", types: ["level_up"] },
  { label: "Collection log", types: ["collection_log"] },
  { label: "Deaths", types: ["death"] },
  { label: "Diaries & tasks", types: ["achievement_diary", "combat_task"] },
];

export function relativeTime(date, now = new Date()) {
  const seconds = Math.max(0, Math.round((now.getTime() - new Date(date).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Fallback text for events the hub did not describe. */
export function describeEvent(event) {
  if (event.line) return event.line;
  const who = event.member || "Someone";
  switch (event.type) {
    case "level_up":
      return `${who} reached level ${event.level ?? "?"} ${event.skill ?? ""}`.trim();
    case "death":
      return `${who} died`;
    default:
      return `${who}: ${event.title || event.type}`;
  }
}

export class ActivityPage extends BaseElement {
  constructor() {
    super();
    this.filterIndex = 0;
    this.leaderboards = [];
  }

  html() {
    return `{{activity-page.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.render();
    document.body.classList.add("activity-page");
    this.periodSelect = this.querySelector(".activity-page__gains-period");
    this.skillSelect = this.querySelector(".activity-page__gains-skill");
    this.gainsList = this.querySelector(".activity-page__gains");
    this.gainsStatus = this.querySelector(".activity-page__gains-status");
    this.eventsList = this.querySelector(".activity-page__events");
    this.eventsStatus = this.querySelector(".activity-page__events-status");
    this.renderFilters();

    this.eventListener(this.periodSelect, "change", () => this.loadGains());
    this.eventListener(this.skillSelect, "change", () => this.renderGains());
    this.eventListener(this.querySelector(".activity-page__filters"), "click", this.handleFilterClick.bind(this));

    this.loadGains();
    this.loadEvents();
    this.refreshInterval = window.setInterval(() => this.loadEvents(), EVENTS_REFRESH_MS);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.body.classList.remove("activity-page");
    window.clearInterval(this.refreshInterval);
  }

  renderFilters() {
    const container = this.querySelector(".activity-page__filters");
    container.replaceChildren(
      ...EVENT_FILTERS.map((filter, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "men-button small activity-page__filter-btn";
        button.classList.toggle("active", index === this.filterIndex);
        button.dataset.index = String(index);
        button.textContent = filter.label;
        return button;
      })
    );
  }

  handleFilterClick(event) {
    const button = event.target.closest(".activity-page__filter-btn");
    if (!button) return;
    this.filterIndex = parseInt(button.dataset.index, 10);
    this.renderFilters();
    this.loadEvents();
  }

  statusMessage(error) {
    if (error?.status === 404) return "Not available: the hub is not connected or this data is not shared.";
    if (error?.status === 503) return "The hub is busy, trying again shortly.";
    return "Could not load data from the hub.";
  }

  async loadGains() {
    this.gainsStatus.textContent = "Loading...";
    try {
      const data = await api.getHubGains(this.periodSelect.value);
      if (!this.isConnected) return;
      this.leaderboards = data.leaderboards || [];
      const selected = this.skillSelect.value || "Overall";
      this.skillSelect.replaceChildren(
        ...this.leaderboards.map((board) => {
          const option = document.createElement("option");
          option.value = board.skill;
          option.textContent = board.skill;
          return option;
        })
      );
      if (this.leaderboards.some((board) => board.skill === selected)) {
        this.skillSelect.value = selected;
      }
      this.gainsStatus.textContent = "";
      this.renderGains();
    } catch (error) {
      if (!this.isConnected) return;
      this.leaderboards = [];
      this.gainsList.replaceChildren();
      this.gainsStatus.textContent = this.statusMessage(error);
    }
  }

  renderGains() {
    const board = this.leaderboards.find((b) => b.skill === this.skillSelect.value) || this.leaderboards[0];
    const entries = board?.entries || [];
    this.gainsList.replaceChildren(
      ...entries.map((entry) => {
        const item = document.createElement("li");
        const name = document.createElement("span");
        name.textContent = entry.name;
        const gain = document.createElement("span");
        gain.className = "activity-page__gain";
        gain.textContent = `+${entry.gain.toLocaleString()} xp`;
        item.append(name, gain);
        return item;
      })
    );
    if (!entries.length && !this.gainsStatus.textContent) {
      this.gainsStatus.textContent = "No XP gained in this period yet.";
    }
  }

  async loadEvents() {
    const filter = EVENT_FILTERS[this.filterIndex];
    try {
      const events = await api.getHubEvents({ types: filter.types, limit: 100 });
      if (!this.isConnected) return;
      this.renderEvents(events);
      this.eventsStatus.textContent = events.length ? "" : "No events yet.";
    } catch (error) {
      if (!this.isConnected) return;
      this.eventsStatus.textContent = this.statusMessage(error);
    }
  }

  renderEvents(events) {
    const now = new Date();
    this.eventsList.replaceChildren(
      ...events.map((event) => {
        const row = document.createElement("li");
        row.className = "activity-page__event";

        const icon = document.createElement("img");
        icon.className = "activity-page__event-icon";
        icon.loading = "lazy";
        icon.alt = "";
        if (event.item_id) {
          icon.src = Item.itemDetails?.[event.item_id]
            ? Item.imageUrl(event.item_id, 1)
            : `/icons/items/${event.item_id}.webp`;
        } else {
          icon.style.visibility = "hidden";
        }

        const text = document.createElement("span");
        text.className = "activity-page__event-text";
        text.textContent = describeEvent(event);

        const time = document.createElement("time");
        time.className = "activity-page__event-time";
        time.dateTime = event.occurred_at;
        time.title = new Date(event.occurred_at).toLocaleString();
        time.textContent = relativeTime(event.occurred_at, now);

        row.append(icon, text, time);
        return row;
      })
    );
  }
}

customElements.define("activity-page", ActivityPage);
