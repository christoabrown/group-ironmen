import { BaseElement } from "../base-element/base-element";
import { api } from "../data/api";
import { describeEvent, relativeTime, hubErrorMessage } from "../data/hub-format";
import { eventIconUrl, eventPlace } from "../data/event-view";
import { selection } from "../data/selection";
import { groupData } from "../data/group-data";

const EVENT_FILTERS = [
  { label: "All", types: [] },
  { label: "Loot", types: ["loot", "pk_loot"] },
  { label: "Level ups", types: ["level_up"] },
  { label: "Collection log", types: ["collection_log"] },
  { label: "Deaths", types: ["death"] },
  { label: "Diaries & tasks", types: ["achievement_diary", "combat_task"] },
];

const PLAYER_REFRESH_MS = 30000;
const TIME_REFRESH_MS = 30000;

/**
 * A list of hub events. Without `player-name` it shows the whole guild's feed
 * from the shared live-events poller; with it, that player's recent events.
 * `filters` adds the type filter buttons, `limit` caps the rows (default 100).
 */
export class EventFeed extends BaseElement {
  constructor() {
    super();
    this.filterIndex = 0;
    this.events = [];
    this.newIds = new Set();
  }

  html() {
    return `{{event-feed.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.playerName = this.getAttribute("player-name");
    this.receivedLive = false;
    this.limit = parseInt(this.getAttribute("limit") || "100", 10);
    this.render();
    this.list = this.querySelector(".event-feed__list");
    this.status = this.querySelector(".event-feed__status");
    this.filtersEl = this.querySelector(".event-feed__filters");

    if (this.hasAttribute("filters")) {
      this.renderFilters();
      this.eventListener(this.filtersEl, "click", this.handleFilterClick.bind(this));
    } else {
      this.filtersEl.remove();
    }
    this.eventListener(this.list, "click", this.handleEventClick.bind(this));

    if (this.playerName) {
      this.status.textContent = "Loading...";
      this.loadPlayerEvents();
      this.refreshInterval = window.setInterval(() => this.loadPlayerEvents(), PLAYER_REFRESH_MS);
    } else {
      this.status.textContent = "Loading...";
      this.subscribe("live-events", this.handleLiveEvents.bind(this));
    }
    this.timeInterval = window.setInterval(() => this.refreshTimes(), TIME_REFRESH_MS);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.clearInterval(this.refreshInterval);
    window.clearInterval(this.timeInterval);
  }

  renderFilters() {
    this.filtersEl.replaceChildren(
      ...EVENT_FILTERS.map((filter, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "men-button small event-feed__filter";
        button.classList.toggle("active", index === this.filterIndex);
        button.dataset.index = String(index);
        button.textContent = filter.label;
        return button;
      })
    );
  }

  handleFilterClick(event) {
    const button = event.target.closest(".event-feed__filter");
    if (!button) return;
    this.filterIndex = parseInt(button.dataset.index, 10);
    this.renderFilters();
    this.renderEvents();
  }

  handleEventClick(event) {
    const row = event.target.closest(".event-feed__event");
    if (!row) return;
    const found = this.events.find((e) => e.id === row.dataset.id);
    if (!found) return;
    const place = eventPlace(found);
    if (place) selection.focusMap(place.x, place.y, place.plane);
    if (!this.playerName && groupData.members.has(found.member)) {
      selection.select(found.member, { follow: !place });
    }
  }

  handleLiveEvents({ events, added }) {
    this.events = events;
    // The first call replays the last poll; its events aren't new to this feed.
    this.newIds = this.receivedLive ? new Set(added.map((event) => event.id)) : new Set();
    this.receivedLive = true;
    this.renderEvents();
  }

  async loadPlayerEvents() {
    try {
      const events = await api.getPlayerEvents(this.playerName, this.limit);
      if (!this.isConnected) return;
      this.events = events;
      this.renderEvents();
    } catch (error) {
      if (!this.isConnected) return;
      this.list.replaceChildren();
      this.status.textContent = hubErrorMessage(error);
    }
  }

  visibleEvents() {
    const types = EVENT_FILTERS[this.filterIndex].types;
    return this.events.filter((event) => !types.length || types.includes(event.type)).slice(0, this.limit);
  }

  renderEvents() {
    const now = new Date();
    const events = this.visibleEvents();
    this.list.replaceChildren(...events.map((event) => this.eventRow(event, now)));
    this.status.textContent = events.length ? "" : "No events yet.";
  }

  eventRow(event, now) {
    const row = document.createElement("li");
    row.className = "event-feed__event";
    row.dataset.id = event.id;
    row.dataset.type = event.type;
    row.classList.toggle("event-feed__event--new", this.newIds.has(event.id));
    row.classList.toggle("event-feed__event--clickable", Boolean(event.location) || !this.playerName);

    const iconUrl = eventIconUrl(event);
    const icon = document.createElement("img");
    icon.className = "event-feed__icon";
    icon.loading = "lazy";
    icon.alt = "";
    if (iconUrl) {
      icon.src = iconUrl;
    } else {
      icon.style.visibility = "hidden";
    }

    const text = document.createElement("span");
    text.className = "event-feed__text";
    const member = groupData.members.get(event.member);
    if (member && !this.playerName) {
      text.style.setProperty("--member-color", member.lightColor);
    }
    text.textContent = describeEvent(event);

    const time = document.createElement("time");
    time.className = "event-feed__time";
    time.dateTime = event.occurred_at;
    time.title = new Date(event.occurred_at).toLocaleString();
    time.textContent = relativeTime(event.occurred_at, now);

    row.append(icon, text, time);
    return row;
  }

  refreshTimes() {
    const now = new Date();
    for (const time of this.querySelectorAll(".event-feed__time")) {
      time.textContent = relativeTime(time.dateTime, now);
    }
  }
}

customElements.define("event-feed", EventFeed);
