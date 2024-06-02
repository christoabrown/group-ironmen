import { BaseElement } from "../base-element/base-element";
import { AchievementDiary } from "../data/diaries";
import { Skill } from "../data/skill";

export class DiaryDialog extends BaseElement {
  constructor() {
    super();
  }

  html() {
    return `{{diary-dialog.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.diaryName = this.getAttribute("diary-name");
    this.playerName = this.getAttribute("player-name");
    this.render();
    this.background = this.querySelector(".dialog__visible");

    this.subscribeOnce(`diaries:${this.playerName}`, this.handleDiaries.bind(this));
    this.eventListener(this.querySelector(".dialog__close"), "click", this.close.bind(this));
    this.eventListener(this.background, "click", this.closeIfBackgroundClick.bind(this));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  closeIfBackgroundClick(evt) {
    if (evt.target === this.background) {
      this.close();
    }
  }

  close() {
    this.remove();
  }

  handleDiaries(playerDiaries, player) {
    const diary = AchievementDiary.diaries[this.diaryName];
    let completeTiers = 0;

    for (const [tierName, tasks] of Object.entries(diary)) {
      const taskSection = document.createDocumentFragment();
      const completionData = playerDiaries.completion[this.diaryName][tierName];
      let complete = 0;
      for (let i = 0; i < tasks.length; ++i) {
        const task = tasks[i];
        const completed = completionData[i];
        const taskEl = document.createElement("div");
        taskEl.classList.add("diary-dialog__task");
        taskEl.innerText = task.task;

        if (completed) {
          taskEl.classList.add("diary-dialog__task-complete");
          ++complete;
        }

        const requirementsHtml = [];
        const combatRequirement = task.requirements?.combat;
        if (combatRequirement) {
          const playerCombat = player.combatLevel;
          const hasCombatRequirement = playerCombat >= combatRequirement;
          requirementsHtml.push(`
<span class="${hasCombatRequirement ? "diary-dialog__requirement-met" : ""}">
  ${playerCombat}/${combatRequirement} Combat
</span>`);
        }

        const skillRequirements = task.requirements?.skills;
        if (skillRequirements) {
          for (const [skillName, level] of Object.entries(skillRequirements)) {
            const playerLevel = player.skills[skillName].level;
            const hasSkillRequirement = playerLevel >= level;
            requirementsHtml.push(`
<span class="${hasSkillRequirement ? "diary-dialog__requirement-met" : ""}">
  ${playerLevel}/${level} <img title="${skillName}" alt="${skillName}" src="${Skill.getIcon(skillName)}" />
</span>
`);
          }
        }

        const questRequirements = task.requirements?.quests;
        if (questRequirements) {
          for (const quest of questRequirements) {
            const questComplete = player.hasQuestComplete(quest);
            requirementsHtml.push(
              `<span class="${questComplete ? "diary-dialog__requirement-met" : ""}">${quest}</span>`
            );
          }
        }

        if (requirementsHtml.length > 0) {
          const requirementsEl = document.createElement("div");
          requirementsEl.classList.add("diary-dialog__requirements");
          requirementsEl.innerHTML = `&nbsp;(${requirementsHtml.join(",&nbsp;")})`;
          taskEl.appendChild(requirementsEl);
        }

        taskSection.appendChild(taskEl);
      }

      const section = this.querySelector(`.diary-dialog__section[diary-tier="${tierName}"]`);
      const header = section.querySelector("h2");
      const sectionLink = `https://oldschool.runescape.wiki/w/${this.diaryName.replace(/ /g, "_")}_Diary#${tierName}`;
      header.innerHTML = `<a href="${sectionLink}" target="_blank">${header.innerText} - ${complete} / ${tasks.length}</a>`;
      if (complete === tasks.length) {
        section.classList.add("diary-dialog__tier-complete");
        ++completeTiers;
      }

      section.appendChild(taskSection);
    }

    if (completeTiers === 4) {
      this.classList.add("diary-dialog__diary-complete");
    }

    this.classList.add("dialog__visible");
  }
}

customElements.define("diary-dialog", DiaryDialog);
