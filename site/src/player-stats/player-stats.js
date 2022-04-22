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
    this.statBarsCtx = {
      hitpoints: this.querySelector(".player-stats__hitpoints-bar").getContext("2d"),
      prayer: this.querySelector(".player-stats__prayer-bar").getContext("2d"),
      energy: this.querySelector(".player-stats__energy-bar").getContext("2d"),
    };

    this.statBarColors = {
      hitpoints: { r: 102, g: 146, b: 61 },
      prayer: { r: 41, g: 130, b: 153 },
      energy: { r: 169, g: 169, b: 169 },
    };
    this.updateStatBarSize("hitpoints");
    this.updateStatBarSize("prayer");
    this.updateStatBarSize("energy");
    this.subscribe(`stats:${this.playerName}`, this.handleUpdatedStats.bind(this));
    this.subscribe(`inactive:${this.playerName}`, this.handleWentInactive.bind(this));

    this.resizeObserver = new ResizeObserver(this.handleContainerSizeChanged.bind(this));
    this.resizeObserver.observe(this);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.resizeObserver.disconnect();
    this.resizeObserver = null;
  }

  handleContainerSizeChanged(entries) {
    this.updateStatBarSize("hitpoints");
    this.updateStatBarSize("prayer");
    this.updateStatBarSize("energy");
    this.redrawStat("hitpoints");
    this.redrawStat("prayer");
    this.redrawStat("energy");
  }

  handleUpdatedStats(stats, memberData) {
    this.updateStatBars(stats);
    this.updateWorld(stats.world, memberData.inactive);
  }

  handleWentInactive(inactive) {
    this.updateWorld(undefined, inactive);
  }

  updateWorld(world, isInactive) {
    if (isInactive) {
      if (this.world !== undefined) {
        this.worldEl.innerText = `INACTIVE`;
        this.world = undefined;
      }
      if (!this.classList.contains("player-stats__inactive")) {
        this.classList.add("player-stats__inactive");
      }
    } else if (this.world === undefined || this.world !== world) {
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
    this.updateStat(stats.hitpoints, "hitpoints");
    this.updateStat(stats.prayer, "prayer");
    this.updateStat(stats.energy, "energy");
  }

  updateStatBarSize(name) {
    const barContainer = this.querySelector(`.player-stats__${name}`);
    const canvas = this.statBarsCtx[name].canvas;

    const width = Math.round(barContainer.clientWidth);
    let height = Math.round(barContainer.clientHeight);
    if (name === "hitpoints" || name === "prayer") height += 1;
    canvas.width = width;
    canvas.height = height;
  }

  darkenColor(color) {
    const d = 3.0;
    return {
      r: Math.round(color.r / d),
      g: Math.round(color.g / d),
      b: Math.round(color.b / d),
    };
  }

  updateStat(stat, name) {
    const currentStat = this[name];
    if (currentStat === undefined || currentStat.current !== stat.current || currentStat.max !== stat.max) {
      this[name] = stat;
      this.redrawStat(name);
    }
  }

  redrawStat(name) {
    const ctx = this.statBarsCtx[name];
    const stat = this[name];
    if (ctx === undefined || stat === undefined) return;
    const width = Math.round((stat.current / stat.max) * ctx.canvas.width);
    const color = this.statBarColors[name];
    const clearColor = this.darkenColor(color);
    ctx.fillStyle = `rgb(${clearColor.r}, ${clearColor.g}, ${clearColor.b})`;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    ctx.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
    ctx.fillRect(0, 0, width, ctx.canvas.height);

    const numbers = this.querySelector(`.player-stats__${name}-numbers`);
    if (numbers) {
      numbers.innerText = `${stat.current} / ${stat.max}`;
    }
  }
}
customElements.define("player-stats", PlayerStats);
