/* global Chart */
import { BaseElement } from "../base-element/base-element";
import { api } from "../data/api";
import { SkillName } from "../data/skill";
import { GuildData, guildData } from "../data/guild-data";
import { colorForName } from "../data/player-colors";
import { sortMembers } from "../data/roster-model";

const MAX_GRAPH_PLAYERS = 10;
const DEFAULT_GRAPH_PLAYERS = 5;
const HUB_PERIODS = { Day: "day", Week: "week", Month: "month", Year: "month" };

export class SkillsGraphs extends BaseElement {
  constructor() {
    super();
    // Names shown in the graph; null until the default selection is known.
    this.selectedNames = null;
  }

  /* eslint-disable no-unused-vars */
  html() {
    const skillNames = Object.values(SkillName).sort((a, b) => {
      if (a === "Overall") return -1;
      if (b === "Overall") return 1;
      return a.localeCompare(b);
    });
    return `{{skills-graphs.html}}`;
  }
  /* eslint-enable no-unused-vars */

  connectedCallback() {
    super.connectedCallback();
    this.render();
    this.period = "Day";
    this.chartGeneration = 0;

    this.chartContainer = this.querySelector(".skills-graphs__chart-container");
    this.periodButtons = this.querySelectorAll(".skills-graphs__period-btn");
    this.refreshButton = this.querySelector(".skills-graphs__refresh");
    this.skillSelect = this.querySelector(".skills-graphs__skill-select");
    this.chipsEl = this.querySelector(".skills-graphs__chips");
    this.playerSearch = this.querySelector(".skills-graphs__player-search");
    this.playerOptions = this.querySelector("datalist");
    this.pickerHint = this.querySelector(".skills-graphs__picker-hint");
    this.selectedSkill = this.skillSelect.value;
    this.periodButtons.forEach((btn) => {
      this.eventListener(btn, "click", this.handlePeriodChange.bind(this));
    });
    this.eventListener(this.refreshButton, "click", this.handleRefreshClicked.bind(this));
    this.eventListener(this.skillSelect, "change", this.handleSkillSelectChange.bind(this));
    this.eventListener(this.chipsEl, "click", this.handleChipClick.bind(this));
    this.eventListener(this.playerSearch, "input", this.handlePlayerSearchInput.bind(this));
    this.eventListener(this.playerSearch, "keydown", this.handlePlayerSearchKeyDown.bind(this));

    this.renderPicker();
    this.subscribe("members-updated", this.renderPlayerOptions.bind(this));
    this.subscribeOnce("members-polled", this.createChart.bind(this));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  handleSkillSelectChange() {
    this.selectedSkill = this.skillSelect.value;
    this.subscribeOnce("members-polled", this.createChart.bind(this));
  }

  handlePeriodChange(event) {
    this.period = event.currentTarget.dataset.period;
    this.periodButtons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.period === this.period);
    });
    this.subscribeOnce("members-polled", this.createChart.bind(this));
  }

  handleRefreshClicked() {
    this.subscribeOnce("members-polled", this.createChart.bind(this));
  }

  handleChipClick(event) {
    const remove = event.target.closest("[data-remove]");
    if (!remove || !this.selectedNames) return;
    this.setSelection(this.selectedNames.filter((name) => name !== remove.dataset.remove));
  }

  handlePlayerSearchInput(event) {
    // Only a pick from the datalist adds a player; typing waits for Enter so
    // "Bob" doesn't get added on the way to "Bobby".
    if (event.inputType && event.inputType !== "insertReplacementText") return;
    const name = this.findPlayer(this.playerSearch.value, true);
    if (name) this.addPlayer(name);
  }

  handlePlayerSearchKeyDown(event) {
    if (event.key !== "Enter") return;
    const name = this.findPlayer(this.playerSearch.value, false);
    if (name) this.addPlayer(name);
  }

  /** A player that is not selected yet whose name matches `text` exactly or, when `exact` is false, partly. */
  findPlayer(text, exact) {
    const query = text.trim().toLowerCase();
    if (!query) return null;
    const candidates = guildData.sortedMembers().filter((member) => !this.selectedNames?.includes(member.name));
    const match =
      candidates.find((member) => member.name.toLowerCase() === query) ||
      (exact ? null : candidates.find((member) => member.name.toLowerCase().includes(query)));
    return match?.name || null;
  }

  addPlayer(name) {
    if (!this.selectedNames || this.selectedNames.includes(name)) return;
    if (this.selectedNames.length >= MAX_GRAPH_PLAYERS) return;
    this.playerSearch.value = "";
    this.setSelection([...this.selectedNames, name]);
  }

  setSelection(names) {
    this.selectedNames = names;
    this.renderPicker();
    this.subscribeOnce("members-polled", this.createChart.bind(this));
  }

  renderPicker() {
    const names = this.selectedNames || [];
    const chips = names.map((name) => {
      const chip = document.createElement("span");
      chip.className = "skills-graphs__chip rsborder-tiny";
      const dot = document.createElement("span");
      dot.className = "skills-graphs__chip-dot";
      dot.style.background = SkillsGraphs.colorFor(name);
      const label = document.createElement("span");
      label.textContent = name;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "skills-graphs__chip-remove";
      remove.dataset.remove = name;
      remove.setAttribute("aria-label", `Remove ${name}`);
      remove.textContent = "×";
      chip.append(dot, label, remove);
      return chip;
    });
    this.chipsEl.replaceChildren(...chips);

    const full = names.length >= MAX_GRAPH_PLAYERS;
    this.playerSearch.disabled = this.selectedNames === null || full;
    this.playerSearch.placeholder = full ? `Max ${MAX_GRAPH_PLAYERS} players` : "Add player...";
    this.pickerHint.textContent = this.selectedNames === null ? "" : `${names.length}/${MAX_GRAPH_PLAYERS}`;
    this.renderPlayerOptions();
  }

  renderPlayerOptions() {
    const selected = new Set(this.selectedNames || []);
    const options = guildData
      .sortedMembers()
      .filter((member) => !selected.has(member.name))
      .map((member) => new Option(member.name, member.name));
    this.playerOptions.replaceChildren(...options);
  }

  static colorFor(name) {
    return guildData.members.get(name)?.color ?? colorForName(name).color;
  }

  /** The top gainers of the period on the hub, or the players with the most XP. */
  async defaultSelection() {
    const known = (name) => guildData.members.size === 0 || guildData.members.has(name);
    try {
      const gains = await api.getHubGains(HUB_PERIODS[this.period] || "day");
      const board = (gains?.leaderboards || []).find((b) => String(b.skill).toLowerCase() === "overall");
      const names = [...(board?.entries || [])]
        .sort((a, b) => a.rank - b.rank)
        .map((entry) => entry.name)
        .filter(known)
        .slice(0, DEFAULT_GRAPH_PLAYERS);
      if (names.length > 0) return names;
    } catch {
      // Fall back to the players with the most XP below.
    }
    return sortMembers([...guildData.members.values()], "xp")
      .slice(0, DEFAULT_GRAPH_PLAYERS)
      .map((member) => member.name);
  }

  async createChart() {
    const generation = ++this.chartGeneration;
    this.querySelector(".skills-graphs__loader-overlay")?.remove();
    const overlay = document.createElement("div");
    overlay.classList.add("skills-graphs__loader-overlay");
    const loader = document.createElement("div");
    loader.classList.add("loader");
    loader.innerHTML = "<div></div><div></div><div></div><div></div>";
    overlay.appendChild(loader);
    this.appendChild(overlay);

    try {
      if (this.selectedNames === null) {
        this.defaultSelectionRequest = this.defaultSelectionRequest || this.defaultSelection();
        const names = await this.defaultSelectionRequest;
        if (this.selectedNames === null) {
          this.selectedNames = names;
          this.renderPicker();
        }
        if (generation !== this.chartGeneration) return;
      }

      if (this.selectedNames.length === 0) {
        overlay.remove();
        this.chartContainer.textContent = "Add players above to compare their gains.";
        return;
      }

      const [skillData] = await Promise.all([api.getSkillData(this.period, this.selectedNames), this.waitForChartjs()]);
      if (generation !== this.chartGeneration) return;
      const skillDataForGuild = (Array.isArray(skillData) ? skillData : []).filter(
        (playerSkillData) => playerSkillData?.name && playerSkillData.skill_data?.length,
      );
      skillDataForGuild.sort((a, b) => a.name.localeCompare(b.name));
      skillDataForGuild.forEach((playerSkillData) => {
        playerSkillData.skill_data.forEach((x) => {
          x.time = new Date(x.time);
          x.data = GuildData.transformSkillsFromStorage(x.data);
        });
        playerSkillData.skill_data.sort((a, b) => b.time - a.time);
      });

      overlay.remove();
      this.chartContainer.innerHTML = "";
      Chart.defaults.scale.grid.borderColor = "rgba(255, 255, 255, 0)";
      const style = getComputedStyle(document.body);
      Chart.defaults.color = style.getPropertyValue("--primary-text");
      Chart.defaults.scale.grid.color = style.getPropertyValue("--graph-grid-border");

      const skillGraph = document.createElement("skill-graph");
      skillGraph.skillDataForGuild = skillDataForGuild;
      skillGraph.setAttribute("data-period", this.period);
      skillGraph.setAttribute("skill-name", this.selectedSkill);
      this.chartContainer.appendChild(skillGraph);
    } catch (err) {
      overlay.remove();
      console.error(err);
      this.chartContainer.textContent = `Failed to load ${err}`;
    }
  }

  async waitForChartjs() {
    if (!SkillsGraphs.chartJsScriptTag) {
      SkillsGraphs.chartJsScriptTag = document.createElement("script");
      SkillsGraphs.chartJsScriptTag.src = "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/3.9.1/chart.min.js";
      document.body.appendChild(SkillsGraphs.chartJsScriptTag);
    }

    while (typeof Chart === "undefined") {
      await new Promise((resolve) => setTimeout(() => resolve(true), 100));
    }
  }
}

customElements.define("skills-graphs", SkillsGraphs);
