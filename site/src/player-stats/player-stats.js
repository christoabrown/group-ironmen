import { BaseElement } from "../base-element/base-element";

export class PlayerStats extends BaseElement {
  constructor() {
    super();
    this.hitpoints = { current: 1, max: 1 };
    this.prayer = { current: 1, max: 1 };
    this.energy = { current: 1, max: 1 };
    this.world = 301;
  }

  html() {
    return `{{player-stats.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.playerName = this.getAttribute("player-name");
    this.render();
    this.worldEl = this.querySelector(".player-stats__world");

    this.hitpointsBar = this.querySelector(".player-stats__hitpoints-bar");
    this.prayerBar = this.querySelector(".player-stats__prayer-bar");
    this.energyBar = this.querySelector(".player-stats__energy-bar");

    this.subscribe(`stats:${this.playerName}`, this.handleUpdatedStats.bind(this));
    this.subscribe(`inactive:${this.playerName}`, this.handleWentInactive.bind(this));
    this.subscribe(`active:${this.playerName}`, this.handleWentActive.bind(this));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  handleUpdatedStats(stats, member) {
    this.updateStatBars(stats);
    this.updateWorld(stats.world, member.inactive, member.lastUpdated);
  }

  handleWentInactive(inactive, member) {
    this.updateWorld(undefined, inactive, member.lastUpdated);
  }

  handleWentActive(_, member) {
    this.world = undefined;
    this.updateWorld(member.stats.world, false);
  }

  updateWorld(world, isInactive, lastUpdated) {
    if (isInactive) {
      const locale = Intl?.DateTimeFormat()?.resolvedOptions()?.locale || undefined;
      this.worldEl.innerText = `${lastUpdated.toLocaleString(locale)}`;
      if (!this.classList.contains("player-stats__inactive")) {
        this.classList.add("player-stats__inactive");
      }
    } else if (this.world !== world) {
      this.world = world;
      if (this.classList.contains("player-stats__inactive")) {
        this.classList.remove("player-stats__inactive");
      }
      this.worldEl.innerText = `W${this.world}`;
    }
  }

  updateStatBars(stats) {
    if (stats.hitpoints === undefined || stats.prayer === undefined || stats.energy === undefined) {
      return;
    }

    this.updateText(stats.hitpoints, "hitpoints");
    this.updateText(stats.prayer, "prayer");

    window.requestAnimationFrame(() => {
      if (!this.isConnected) return;
      this.hitpointsBar.update(stats.hitpoints.current / stats.hitpoints.max);
      this.prayerBar.update(stats.prayer.current / stats.prayer.max);
      this.energyBar.update(stats.energy.current / stats.energy.max);
    });
  }

  updateText(stat, name) {
    const numbers = this.querySelector(`.player-stats__${name}-numbers`);
    if (!numbers) return;

    const currentStat = this[name];
    if (currentStat === undefined || currentStat.current !== stat.current || currentStat.max !== stat.max) {
      this[name] = stat;
      numbers.innerText = `${stat.current} / ${stat.max}`;
    }
  }
}
customElements.define("player-stats", PlayerStats);
