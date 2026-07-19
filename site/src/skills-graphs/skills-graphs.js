/* global Chart */
import { BaseElement } from "../base-element/base-element";
import { api } from "../data/api";
import { SkillName } from "../data/skill";
import { GroupData } from "../data/group-data";

export class SkillsGraphs extends BaseElement {
  constructor() {
    super();
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
    this.selectedSkill = this.skillSelect.value;
    this.periodButtons.forEach((btn) => {
      this.eventListener(btn, "click", this.handlePeriodChange.bind(this));
    });
    this.eventListener(this.refreshButton, "click", this.handleRefreshClicked.bind(this));
    this.eventListener(this.skillSelect, "change", this.handleSkillSelectChange.bind(this));

    this.subscribeOnce("get-group-data", this.createChart.bind(this));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  handleSkillSelectChange() {
    this.selectedSkill = this.skillSelect.value;
    this.subscribeOnce("get-group-data", this.createChart.bind(this));
  }

  handlePeriodChange(event) {
    this.period = event.currentTarget.dataset.period;
    this.periodButtons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.period === this.period);
    });
    this.subscribeOnce("get-group-data", this.createChart.bind(this));
  }

  handleRefreshClicked() {
    this.subscribeOnce("get-group-data", this.createChart.bind(this));
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
      const [skillDataForGroup] = await Promise.all([api.getSkillData(this.period), this.waitForChartjs()]);
      if (generation !== this.chartGeneration) return;
      skillDataForGroup.sort((a, b) => a.name.localeCompare(b.name));
      skillDataForGroup.forEach((playerSkillData) => {
        playerSkillData.skill_data.forEach((x) => {
          x.time = new Date(x.time);
          x.data = GroupData.transformSkillsFromStorage(x.data);
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
      skillGraph.skillDataForGroup = skillDataForGroup;
      skillGraph.setAttribute("data-period", this.period);
      skillGraph.setAttribute("skill-name", this.selectedSkill);
      this.chartContainer.appendChild(skillGraph);
    } catch (err) {
      overlay.remove();
      console.error(err);
      this.chartContainer.innerHTML = `Failed to load ${err}`;
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
