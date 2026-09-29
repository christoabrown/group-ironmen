import { BaseElement } from "../base-element/base-element";
import { Quest, QuestState } from "../data/quest";

export class PlayerQuests extends BaseElement {
  constructor() {
    super();
  }

  /* eslint-disable no-unused-vars */
  html() {
    const freeToPlayQuestsHtml = `
<h4 class="player-quests__section-header">Free Quests</h4>
${this.questSectionHtml(Quest.freeToPlayQuests)}
`;
    const memberQuestsHtml = `
<h4 class="player-quests__section-header">Members' Quests</h4>
${this.questSectionHtml(Quest.memberQuests)}
`;

    const miniQuestsHtml = `
<h4 class="player-quests__section-header">Miniquests</h4>
${this.questSectionHtml(Quest.miniQuests)}
`;

    return `{{player-quests.html}}`;
  }
  /* eslint-enable no-unused-vars */

  connectedCallback() {
    super.connectedCallback();
    const playerName = this.getAttribute("player-name");
    this.render();

    this.questListElements = new Map();
    const els = Array.from(this.querySelectorAll(".player-quests__quest"));
    for (const el of els) {
      const questId = parseInt(el.getAttribute("quest-id"));
      this.questListElements.set(questId, el);
    }
    this.currentQuestPointsEl = this.querySelector(".player-quests__current-points");
    this.subscribe(`quests:${playerName}`, this.handleUpdatedQuests.bind(this));
    this.searchElement = this.querySelector("search-element");
    this.eventListener(this.searchElement, "input", this.handleSearch.bind(this));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  questSectionHtml(questsData) {
    let result = "";
    const questsDataEntries = Object.entries(questsData).sort((a, b) => {
      return a[1].sortName.localeCompare(b[1].sortName);
    });

    // eslint-disable-next-line no-unused-vars
    for (const [questId, _questData] of questsDataEntries) {
      const quest = this.getQuestById(questId);
      result += `
<a href="${quest.wikiLink}" target="_blank" rel="noopener noreferrer">
  <div class="player-quests__quest" quest-id="${questId}">
    <img class="player-quests__difficulty-icon" src="${quest.icon}" alt="${quest.difficulty}" title="${quest.difficulty}" />
    ${quest.name}
  </div>
</a>
`;
    }

    return result;
  }

  get questPoints() {
    let result = 0;
    if (this.quests) {
      for (const quest of Object.values(this.quests)) {
        result += quest.points;
      }
    }
    return result;
  }

  classForQuestState(questState) {
    switch (questState) {
      case QuestState.NOT_STARTED:
        return "player-quests__not-started";
      case QuestState.IN_PROGRESS:
        return "player-quests__in-progress";
      case QuestState.FINISHED:
        return "player-quests__finished";
    }

    return "";
  }

  handleUpdatedQuests(quests) {
    const previousQuests = this.quests;
    this.quests = quests;
    for (const [questId, el] of this.questListElements.entries()) {
      const previousQuest = previousQuests?.[questId];
      const quest = this.quests?.[questId];

      const previousQuestState = this.classForQuestState(previousQuest?.state);
      const newQuestState = this.classForQuestState(quest?.state);

      if (previousQuestState !== newQuestState) {
        if (previousQuestState.length > 0) {
          el.classList.remove(previousQuestState);
        }
        el.classList.add(newQuestState);
      }
    }

    this.currentQuestPointsEl.innerHTML = this.questPoints;
  }

  getQuestById(questId) {
    return this.quests?.[questId] || new Quest(questId, QuestState.NOT_STARTED);
  }

  handleSearch() {
    const inputText = this.searchElement.value.trim().toLowerCase();
    for (const [questId, el] of this.questListElements.entries()) {
      const quest = this.getQuestById(questId);
      const name = quest.name;
      if (inputText.length === 0 || name.toLowerCase().includes(inputText)) {
        el.classList.remove("player-quests__hidden");
      } else {
        el.classList.add("player-quests__hidden");
      }
    }
  }
}
customElements.define("player-quests", PlayerQuests);
