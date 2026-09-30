import { BaseElement } from "../base-element/base-element";
import { api } from "../data/api";
import { groupData } from "../data/group-data";
import { Item } from "../data/item";
import { itemIconUrl } from "../data/icons";
import { selection } from "../data/selection";
import { groupByRegion, groupByWorld } from "../data/regions";
import { describeEvent, formatGp, relativeTime } from "../data/hub-format";

const REFRESH_MS = 60000;
const GAIN_PERIODS = [
  ["day", "Today"],
  ["week", "This week"],
  ["month", "This month"],
];
const LOOT_PERIODS = [
  ["day", "Today"],
  ["week", "This week"],
  ["month", "This month"],
];

function el(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function statusMessage(error) {
  if (error?.status === 404) return "Not available: the hub isn't connected or doesn't share this.";
  if (error?.status === 503) return "The hub is busy, trying again shortly.";
  return "Could not load data from the hub.";
}

/**
 * The guild at a glance: who is online and where, which worlds, the day's top
 * gainers and drops, and the event feed.
 */
export class ClanPage extends BaseElement {
  constructor() {
    super();
    this.leaderboards = [];
  }

  html() {
    return `{{clan-page.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    // The route keeps this element and connects it again on every visit.
    this.historyLoaded = false;
    this.leaderboards = [];
    this.topDrop = null;
    this.render();
    document.body.classList.add("clan-page");
    this.querySelector(".clan-page__title").textContent = window.siteConfig?.title || "Clan";

    this.tiles = this.querySelector(".clan-page__tiles");
    this.regionsList = this.querySelector(".clan-page__regions");
    this.worldsList = this.querySelector(".clan-page__worlds");
    this.gainsPeriod = this.querySelector(".clan-page__gains-period");
    this.gainsSkill = this.querySelector(".clan-page__gains-skill");
    this.gainsList = this.querySelector(".clan-page__gains");
    this.gainsStatus = this.querySelector(".clan-page__gains-status");
    this.lootPeriod = this.querySelector(".clan-page__loot-period");
    this.lootList = this.querySelector(".clan-page__loot");
    this.lootStatus = this.querySelector(".clan-page__loot-status");

    for (const [select, options, value] of [
      [this.gainsPeriod, GAIN_PERIODS, "day"],
      [this.lootPeriod, LOOT_PERIODS, "week"],
    ]) {
      select.replaceChildren(...options.map(([key, label]) => new Option(label, key)));
      select.value = value;
    }

    this.eventListener(this.gainsPeriod, "change", () => this.loadGains());
    this.eventListener(this.gainsSkill, "change", () => this.renderGains());
    this.eventListener(this.lootPeriod, "change", () => this.loadLoot());
    this.eventListener(this.regionsList, "click", this.handleRegionClick.bind(this));
    this.eventListener(this.worldsList, "click", this.handlePlayerClick.bind(this));
    this.eventListener(this.gainsList, "click", this.handlePlayerClick.bind(this));
    this.eventListener(this.lootList, "click", this.handlePlayerClick.bind(this));

    this.subscribe("members-updated", () => this.renderPresence());
    this.subscribe("roster-changed", () => this.schedulePresence());
    this.subscribe("features", (features) => {
      this.querySelector(".clan-page__history").hidden = !features?.hub_history;
      if (features?.hub_history && !this.historyLoaded) {
        this.historyLoaded = true;
        this.loadGains();
        this.loadLoot();
      }
    });
    this.refreshInterval = window.setInterval(() => {
      if (!this.historyLoaded) return;
      this.loadGains();
      this.loadLoot();
    }, REFRESH_MS);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.body.classList.remove("clan-page");
    window.clearInterval(this.refreshInterval);
    window.cancelAnimationFrame(this.presenceFrame);
    this.presenceFrame = null;
  }

  /** Presence changes arrive every poll; redraw at most once a frame. */
  schedulePresence() {
    if (this.presenceFrame) return;
    this.presenceFrame = window.requestAnimationFrame(() => {
      this.presenceFrame = null;
      if (this.isConnected) this.renderPresence();
    });
  }

  playerChip(member) {
    const chip = el("button", "clan-page__player", member.name);
    chip.type = "button";
    chip.dataset.name = member.name;
    chip.style.setProperty("--player-color", member.color);
    chip.style.setProperty("--player-light", member.lightColor);
    return chip;
  }

  renderPresence() {
    const members = [...groupData.members.values()];
    const online = members.filter((member) => member.online);
    const regions = groupByRegion(members);
    const worlds = groupByWorld(members);

    const tile = (value, label) => {
      const box = el("div", "clan-page__tile rsborder-tiny rsbackground");
      box.append(el("div", "clan-page__tile-value", value), el("div", "clan-page__tile-label", label));
      return box;
    };
    const tiles = [
      tile(`${online.length}`, `online of ${members.length}`),
      tile(`${worlds.length}`, worlds.length === 1 ? "world in use" : "worlds in use"),
      tile(`${regions.length}`, regions.length === 1 ? "place" : "places"),
    ];
    if (this.topDrop) tiles.push(tile(`${formatGp(this.topDrop.value_gp)}`, `best drop · ${this.topDrop.member}`));
    this.tiles.replaceChildren(...tiles);

    this.regionsList.replaceChildren(
      ...regions.map((region) => {
        const row = el("li", "clan-page__region");
        const header = el("button", "clan-page__region-name");
        header.type = "button";
        header.title = "Show on the map";
        header.dataset.x = region.x;
        header.dataset.y = region.y;
        header.dataset.plane = region.plane;
        header.append(el("span", "", region.name), el("span", "clan-page__count", `${region.members.length}`));
        const players = el("div", "clan-page__players");
        players.append(...region.members.map((member) => this.playerChip(member)));
        row.append(header, players);
        return row;
      })
    );
    if (!regions.length) {
      this.regionsList.appendChild(el("li", "clan-page__empty", "Nobody is online with a shared location."));
    }

    this.worldsList.replaceChildren(
      ...worlds.map(({ world, members: here }) => {
        const row = el("li", "clan-page__world");
        row.append(el("span", "clan-page__world-number", `W${world}`));
        const players = el("div", "clan-page__players");
        players.append(...here.map((member) => this.playerChip(member)));
        row.appendChild(players);
        return row;
      })
    );
    if (!worlds.length) this.worldsList.appendChild(el("li", "clan-page__empty", "Nobody is online."));
  }

  handleRegionClick(event) {
    if (this.handlePlayerClick(event)) return;
    const header = event.target.closest(".clan-page__region-name");
    if (!header) return;
    // Stored coordinates are one tile north of the plugin's.
    selection.focusMap(Number(header.dataset.x), Number(header.dataset.y) - 1, Number(header.dataset.plane), 2);
    window.history.pushState("", "", "/group");
  }

  handlePlayerClick(event) {
    const chip = event.target.closest("[data-name]");
    if (!chip) return false;
    if (groupData.members.has(chip.dataset.name)) selection.select(chip.dataset.name, { follow: false });
    return true;
  }

  // ---------------------------------------------------------------------------
  // Gains
  // ---------------------------------------------------------------------------

  async loadGains() {
    this.gainsStatus.textContent = this.leaderboards.length ? "" : "Loading...";
    try {
      const data = await api.getHubGains(this.gainsPeriod.value);
      if (!this.isConnected) return;
      this.leaderboards = data.leaderboards || [];
      const selected = this.gainsSkill.value || "Overall";
      this.gainsSkill.replaceChildren(...this.leaderboards.map((board) => new Option(board.skill, board.skill)));
      if (this.leaderboards.some((board) => board.skill === selected)) this.gainsSkill.value = selected;
      this.gainsStatus.textContent = "";
      this.renderGains();
    } catch (error) {
      if (!this.isConnected) return;
      this.leaderboards = [];
      this.gainsList.replaceChildren();
      this.gainsStatus.textContent = statusMessage(error);
    }
  }

  renderGains() {
    const board = this.leaderboards.find((b) => b.skill === this.gainsSkill.value) || this.leaderboards[0];
    const entries = board?.entries || [];
    this.gainsList.replaceChildren(
      ...entries.map((entry) => {
        const row = el("li", "clan-page__gain");
        const member = groupData.members.get(entry.name);
        const name = member ? this.playerChip(member) : el("span", "", entry.name);
        row.append(name, el("span", "clan-page__gain-xp", `+${entry.gain.toLocaleString()} xp`));
        return row;
      })
    );
    if (!entries.length && !this.gainsStatus.textContent) {
      this.gainsStatus.textContent = "No XP gained in this period yet.";
    }
  }

  // ---------------------------------------------------------------------------
  // Biggest drops
  // ---------------------------------------------------------------------------

  async loadLoot() {
    this.lootStatus.textContent = this.lootList.children.length ? "" : "Loading...";
    try {
      const [board, today] = await Promise.all([
        api.getLootLeaderboard(this.lootPeriod.value, 10),
        this.lootPeriod.value === "day" ? null : api.getLootLeaderboard("day", 1).catch(() => null),
      ]);
      if (!this.isConnected) return;
      const entries = board.entries || [];
      this.topDrop = (this.lootPeriod.value === "day" ? entries[0] : today?.entries?.[0])?.event || null;
      this.renderPresence();
      this.lootList.replaceChildren(...entries.map((entry) => this.lootRow(entry)));
      this.lootStatus.textContent = entries.length
        ? board.partial
          ? "The hub doesn't rank drops yet; showing the recent ones this server saw."
          : ""
        : "No drops in this period yet.";
    } catch (error) {
      if (!this.isConnected) return;
      this.lootList.replaceChildren();
      this.lootStatus.textContent = statusMessage(error);
    }
  }

  lootRow({ rank, event }) {
    const row = el("li", "clan-page__drop");
    row.appendChild(el("span", "clan-page__rank", `${rank}`));
    const icon = el("img", "clan-page__drop-icon");
    icon.alt = "";
    icon.loading = "lazy";
    const iconUrl = event.item_id
      ? Item.itemDetails?.[event.item_id]
        ? Item.imageUrl(event.item_id, 1)
        : itemIconUrl(event.item_id)
      : "";
    if (iconUrl) {
      icon.src = iconUrl;
    } else {
      icon.style.visibility = "hidden";
    }
    const text = el("div", "clan-page__drop-text");
    const line = el("div", "", describeEvent(event));
    const when = el("time", "clan-page__when", relativeTime(event.occurred_at));
    when.title = new Date(event.occurred_at).toLocaleString();
    text.append(line, when);
    const value = el("span", "clan-page__drop-value", `${formatGp(event.value_gp)}`);
    const member = groupData.members.get(event.member);
    if (member) row.dataset.name = member.name;
    row.append(icon, text, value);
    return row;
  }
}

customElements.define("clan-page", ClanPage);
