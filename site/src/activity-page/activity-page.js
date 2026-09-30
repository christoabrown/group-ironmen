import { BaseElement } from "../base-element/base-element";
import { api } from "../data/api";

// Kept for older imports; the helpers live in data/hub-format.js now.
export { relativeTime, describeEvent } from "../data/hub-format";

export class ActivityPage extends BaseElement {
  constructor() {
    super();
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

    this.eventListener(this.periodSelect, "change", () => this.loadGains());
    this.eventListener(this.skillSelect, "change", () => this.renderGains());

    this.loadGains();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.body.classList.remove("activity-page");
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
}

customElements.define("activity-page", ActivityPage);
