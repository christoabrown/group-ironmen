import { BaseElement } from "../base-element/base-element";
import { api } from "../data/api";
import { groupData } from "../data/group-data";
import { selection } from "../data/selection";
import { Item } from "../data/item";
import { Skill, SkillName } from "../data/skill";
import { carriedValue, shares, totalLevel, world } from "../data/roster-model";
import { formatDuration, formatGp, hubErrorMessage, relativeTime } from "../data/hub-format";
import { ACCOUNT_TYPE_BADGES } from "../player-roster/player-roster";

export const PROFILE_TABS = [
  ["overview", "Overview"],
  ["gains", "Gains"],
  ["activity", "Activity"],
  ["wealth", "Wealth"],
  ["gear", "Gear"],
];

const GAIN_PERIODS = [
  ["day", "Today"],
  ["week", "7 days"],
  ["month", "30 days"],
  ["year", "Year"],
];

const GAME_STATES = {
  HOPPING: "Hopping worlds",
  LOADING: "Loading",
  CONNECTION_LOST: "Connection lost",
  LOGIN_SCREEN: "At the login screen",
};

// The last opened tab and gains period, kept while switching players.
let lastTab = "overview";
let lastGainsPeriod = "day";

/** An element with a class and optional text. */
function el(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

/**
 * Points for an SVG polyline of `values` in a `width` x `height` box, with the
 * lowest value at the bottom. Returns "" for fewer than two values.
 */
export function sparklinePoints(values, width, height, padding = 2) {
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values
    .map((value, index) => {
      const x = padding + (index / (values.length - 1)) * (width - padding * 2);
      const y = height - padding - ((value - min) / span) * (height - padding * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

/** One player's profile: header, actions and tabs. */
export class PlayerProfileView extends BaseElement {
  constructor() {
    super();
  }

  html() {
    return `{{player-profile-view.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.playerName = this.getAttribute("player-name");
    this.render();
    const member = this.member;
    this.style.setProperty("--player-color", member?.color || "#888");
    this.style.setProperty("--player-light", member?.lightColor || "#ccc");
    this.querySelector(".player-profile-view__name").textContent = this.playerName;
    this.statusEl = this.querySelector(".player-profile-view__status");
    this.detailsEl = this.querySelector(".player-profile-view__details");
    this.badgeEl = this.querySelector(".player-profile-view__badge");
    this.body = this.querySelector(".player-profile-view__body");
    this.tabsEl = this.querySelector(".player-profile-view__tabs");
    this.followButton = this.querySelector(".player-profile-view__follow");
    this.trailButton = this.querySelector(".player-profile-view__trail");

    this.tabsEl.replaceChildren(
      ...PROFILE_TABS.map(([key, label]) => {
        const button = el("button", "player-profile-view__tab", label);
        button.type = "button";
        button.dataset.tab = key;
        return button;
      })
    );

    this.eventListener(this.querySelector(".player-profile-view__close"), "click", () => selection.clear());
    this.eventListener(this.tabsEl, "click", (event) => {
      const tab = event.target.closest("[data-tab]");
      if (tab) this.showTab(tab.dataset.tab);
    });
    this.eventListener(this.followButton, "click", () => selection.select(this.playerName, { follow: true }));
    this.eventListener(this.trailButton, "click", () => {
      if (!selection.toggleTrail(this.playerName)) {
        this.trailButton.title = "At most 8 trails at once";
      }
    });

    for (const topic of ["presence", "stats", "meta", "region"]) {
      this.subscribe(`${topic}:${this.playerName}`, () => this.updateHeader());
    }
    this.subscribe("trails-changed", (trails) => {
      const on = trails.has(this.playerName);
      this.trailButton.classList.toggle("active", on);
      this.trailButton.textContent = on ? "Hide trail" : "Show trail";
    });
    this.subscribe("features", (features) => {
      this.trailButton.hidden = !features?.hub_history;
    });
    this.timeInterval = window.setInterval(() => this.updateHeader(), 30000);

    this.updateHeader();
    this.showTab(lastTab);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.clearInterval(this.timeInterval);
  }

  get member() {
    return groupData.members.get(this.playerName);
  }

  updateHeader() {
    const member = this.member;
    if (!member) return;
    const badge = ACCOUNT_TYPE_BADGES[member.meta?.type];
    this.badgeEl.textContent = badge?.text || "";
    this.badgeEl.title = member.meta?.type_label || "";

    const parts = [];
    if (member.orphaned) {
      parts.push("Not shared with the guild any more");
    } else if (member.online) {
      const currentWorld = world(member);
      parts.push(currentWorld ? `Online · W${currentWorld}` : "Online");
      if (member.region) parts.push(member.region);
      const gameState = GAME_STATES[member.meta?.game_state];
      if (gameState) parts.push(gameState);
      if (member.meta?.special_world) parts.push("special world");
    } else {
      parts.push(member.lastSeen ? `Offline · seen ${relativeTime(member.lastSeen)}` : "Offline");
    }
    this.statusEl.textContent = parts.join(" · ");
    this.statusEl.classList.toggle("online", member.online);

    const details = [];
    if (member.meta?.owner) details.push(`Owner: ${member.meta.owner}`);
    if (member.meta?.type_label && member.meta.type) details.push(member.meta.type_label);
    this.detailsEl.textContent = details.join(" · ");
    this.followButton.disabled = !member.online || !member.coordinates;
  }

  showTab(tab) {
    if (!PROFILE_TABS.some(([key]) => key === tab)) tab = "overview";
    lastTab = tab;
    for (const button of this.tabsEl.children) {
      button.classList.toggle("active", button.dataset.tab === tab);
    }
    this.body.replaceChildren();
    this.body.scrollTop = 0;
    const render = {
      overview: () => this.renderOverview(),
      gains: () => this.renderGains(),
      activity: () => this.renderActivity(),
      wealth: () => this.renderWealth(),
      gear: () => this.renderGear(),
    }[tab];
    render();
  }

  section(title) {
    const section = el("section", "player-profile-view__section");
    if (title) section.appendChild(el("h5", "player-profile-view__section-title", title));
    this.body.appendChild(section);
    return section;
  }

  notShared(section, what) {
    section.appendChild(
      el("p", "player-profile-view__note", `${this.playerName} doesn't share ${what} with the guild.`)
    );
  }

  /** Runs `load` into `section`, showing a loading note and hub errors. */
  async load(section, load) {
    const note = el("p", "player-profile-view__note", "Loading...");
    section.appendChild(note);
    try {
      await load(section);
      note.remove();
    } catch (error) {
      if (!this.isConnected) return;
      note.textContent = error?.status === 404 ? `Not shared by ${this.playerName}.` : hubErrorMessage(error);
    }
  }

  renderOverview() {
    const member = this.member;
    const vitals = this.section();
    const stats = document.createElement("player-stats");
    stats.setAttribute("player-name", this.playerName);
    vitals.appendChild(stats);

    const facts = el("dl", "player-profile-view__facts");
    const fact = (label, value) => {
      if (value === null || value === undefined || value === "") return;
      facts.append(el("dt", "", label), el("dd", "", value));
    };
    fact("Total level", totalLevel(member)?.toLocaleString());
    fact("Total XP", member?.meta?.overall_xp?.toLocaleString());
    fact("Combat", member?.combatLevel);
    const value = carriedValue(member);
    fact("Carried", value === null ? null : `${formatGp(value)} gp`);
    fact("Spellbook", member?.meta?.spellbook);
    vitals.appendChild(facts);

    const gear = this.section("Worn and carried");
    const gearRow = el("div", "player-profile-view__gear-row");
    for (const [component, category] of [
      ["player-equipment", "equipment"],
      ["player-inventory", "inventory"],
    ]) {
      if (shares(member, category)) {
        const element = document.createElement(component);
        element.setAttribute("player-name", this.playerName);
        gearRow.appendChild(element);
      } else {
        gearRow.appendChild(
          el("p", "player-profile-view__note", `${category[0].toUpperCase()}${category.slice(1)} not shared.`)
        );
      }
    }
    gear.appendChild(gearRow);

    const skills = this.section("Skills");
    if (shares(member, "stats")) {
      const element = document.createElement("player-skills");
      element.setAttribute("player-name", this.playerName);
      skills.appendChild(element);
    } else {
      this.notShared(skills, "skills");
    }
  }

  renderGains() {
    const section = this.section();
    const controls = el("div", "player-profile-view__controls");
    const select = el("select");
    select.setAttribute("aria-label", "Period");
    for (const [value, label] of GAIN_PERIODS) select.appendChild(new Option(label, value));
    select.value = lastGainsPeriod;
    controls.appendChild(select);
    section.appendChild(controls);
    const list = el("ol", "player-profile-view__gains");
    section.appendChild(list);

    const load = () => {
      lastGainsPeriod = select.value;
      list.replaceChildren();
      this.load(section, async () => {
        const data = await api.getPlayerGains(this.playerName, select.value);
        if (!this.isConnected) return;
        const gains = (data.gains || []).filter((gain) => gain.xp > 0);
        const overall = gains.find((gain) => gain.skill === "Overall");
        const skills = gains.filter((gain) => gain.skill !== "Overall").sort((a, b) => b.xp - a.xp);
        if (!skills.length) {
          list.appendChild(el("li", "player-profile-view__note", "No XP gained in this period."));
          return;
        }
        const max = skills[0].xp;
        if (overall) list.appendChild(this.gainRow("Overall", overall.xp, null));
        for (const gain of skills) list.appendChild(this.gainRow(gain.skill, gain.xp, gain.xp / max));
      });
    };
    select.addEventListener("change", load);
    load();
  }

  gainRow(skill, xp, ratio) {
    const row = el("li", "player-profile-view__gain");
    const icon = el("img", "player-profile-view__gain-icon");
    icon.alt = "";
    icon.src = skill === SkillName.Overall ? "/ui/3579-0.png" : Skill.getIcon(skill);
    const name = el("span", "player-profile-view__gain-skill", skill);
    const amount = el("span", "player-profile-view__gain-xp", `+${xp.toLocaleString()}`);
    row.append(icon, name, amount);
    if (ratio !== null) {
      const bar = el("div", "player-profile-view__gain-bar");
      bar.style.transform = `scaleX(${ratio})`;
      row.appendChild(bar);
    } else {
      row.classList.add("player-profile-view__gain--overall");
    }
    return row;
  }

  renderActivity() {
    const sessions = this.section("Play time, last 7 days");
    this.load(sessions, async () => {
      const data = await api.getPlayerSessions(this.playerName, 7);
      if (!this.isConnected) return;
      const list = data.sessions || [];
      sessions.appendChild(
        el(
          "p",
          "player-profile-view__summary",
          list.length
            ? `${formatDuration(data.total_ms)} in ${list.length} session${list.length === 1 ? "" : "s"}`
            : "Hasn't played in the last 7 days."
        )
      );
      const ul = el("ul", "player-profile-view__sessions");
      for (const session of list.slice(0, 15)) {
        const started = new Date(session.started_at);
        const row = el("li");
        const when = el(
          "span",
          "",
          `${started.toLocaleDateString(undefined, {
            weekday: "short",
            day: "numeric",
            month: "short",
          })} ${started.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`
        );
        const length = el(
          "span",
          "player-profile-view__session-length",
          session.ended_at ? formatDuration(session.duration_ms) : "now"
        );
        const worlds = el(
          "span",
          "player-profile-view__session-worlds",
          (session.worlds || []).map((w) => `W${w}`).join(", ")
        );
        row.append(when, worlds, length);
        ul.appendChild(row);
      }
      sessions.appendChild(ul);
    });

    const events = this.section("Recent events");
    const feed = document.createElement("event-feed");
    feed.setAttribute("player-name", this.playerName);
    feed.setAttribute("limit", "30");
    events.appendChild(feed);
  }

  renderWealth() {
    const section = this.section("Carried value, last 30 days");
    if (!shares(this.member, "inventory")) {
      this.notShared(section, "their inventory");
      return;
    }
    this.load(section, async () => {
      const data = await api.getPlayerWealth(this.playerName, 30);
      if (!this.isConnected) return;
      const days = (data.days || []).filter((day) => day.last_value !== null);
      if (!days.length) {
        section.appendChild(el("p", "player-profile-view__note", "No values recorded yet."));
        return;
      }
      const values = days.map((day) => day.last_value);
      const current = values[values.length - 1];
      const change = current - values[0];
      const width = 340;
      const height = 90;
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
      svg.setAttribute("class", "player-profile-view__sparkline");
      svg.setAttribute("role", "img");
      svg.setAttribute("aria-label", `Carried value from ${formatGp(values[0])} to ${formatGp(current)}`);
      const line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      line.setAttribute("points", sparklinePoints(values, width, height, 4));
      svg.appendChild(line);
      section.appendChild(svg);

      const facts = el("dl", "player-profile-view__facts");
      facts.append(
        el("dt", "", "Now"),
        el("dd", "", `${formatGp(current)} gp`),
        el("dt", "", "30 days"),
        el("dd", change >= 0 ? "positive" : "negative", `${change >= 0 ? "+" : ""}${formatGp(change)} gp`),
        el("dt", "", "Peak"),
        el("dd", "", `${formatGp(Math.max(...days.map((day) => day.max_value ?? day.last_value)))} gp`)
      );
      section.appendChild(facts);
    });
  }

  renderGear() {
    const section = this.section("Gear changes, last 30 days");
    if (!shares(this.member, "equipment")) {
      this.notShared(section, "their equipment");
      return;
    }
    this.load(section, async () => {
      const data = await api.getPlayerGearHistory(this.playerName, 30);
      if (!this.isConnected) return;
      const changes = data.changes || [];
      if (!changes.length) {
        section.appendChild(el("p", "player-profile-view__note", "No changes recorded."));
        return;
      }
      const list = el("ul", "player-profile-view__gear-changes");
      for (const change of changes) {
        const row = el("li");
        const time = el("time", "", relativeTime(change.changed_at));
        time.title = new Date(change.changed_at).toLocaleString();
        const items = el("div", "player-profile-view__gear-items");
        const equipment = change.equipment || [];
        for (let i = 0; i < equipment.length; i += 2) {
          const id = equipment[i];
          if (!id) continue;
          const img = el("img");
          img.loading = "lazy";
          img.alt = Item.itemDetails?.[id]?.name || "";
          img.title = img.alt;
          img.src = Item.imageUrl(id, equipment[i + 1]);
          items.appendChild(img);
        }
        row.append(time, items);
        list.appendChild(row);
      }
      section.appendChild(list);
    });
  }
}

customElements.define("player-profile-view", PlayerProfileView);
