import { utility } from "../utility";
import { pubsub } from "./pubsub";

export const QuestState = {
  IN_PROGRESS: "IN_PROGRESS",
  NOT_STARTED: "NOT_STARTED",
  FINISHED: "FINISHED",
};

export class Quest {
  constructor(id, state) {
    this.id = id;

    if (QuestState[state] === undefined) {
      console.error(`Unrecognized quest state ${state}`);
    }
    this.state = state;
  }

  get name() {
    return Quest.questData[this.id].name || "UNKNOWN_QUEST";
  }

  get difficulty() {
    return Quest.questData[this.id].difficulty;
  }

  get icon() {
    const difficulty = this.difficulty;
    switch (difficulty) {
      case "Novice":
        return utility.image("/icons/3399-0.png");
      case "Intermediate":
        return utility.image("/icons/3400-0.png");
      case "Experienced":
        return utility.image("/icons/3402-0.png");
      case "Master":
        return utility.image("/icons/3403-0.png");
      case "Grandmaster":
        return utility.image("/icons/3404-0.png");
      case "Special":
        return utility.image("/icons/3404-0.png");
    }

    console.error(`Unknown quest difficulty for icon ${difficulty}`);
    return "";
  }

  get wikiLink() {
    const name = this.name;
    const wikiName = name.replaceAll(" ", "_");
    return `https://oldschool.runescape.wiki/w/${wikiName}/Quick_guide`;
  }

  get points() {
    if (this.state === QuestState.FINISHED) {
      return Quest.questData[this.id]?.points || 0;
    }
    return 0;
  }

  static parseQuestData(data) {
    const result = {};
    if (data) {
      for (const [questId, questState] of Object.entries(data)) {
        result[questId] = new Quest(questId, questState);
      }
    }

    return result;
  }

  static async loadQuests() {
    const response = await fetch("/data/quest_data.json");
    Quest.questData = await response.json();
    Quest.freeToPlayQuests = {};
    Quest.memberQuests = {};
    Quest.miniQuests = {};
    Quest.lookupByName = new Map();
    Quest.questIds = Object.keys(Quest.questData)
      .map((s) => parseInt(s))
      .sort((a, b) => a - b);
    let totalQuestPoints = 0;

    for (const [questId, questData] of Object.entries(Quest.questData)) {
      questData.sortName = utility.removeArticles(questData.name);
      questData.points = parseInt(questData.points);
      totalQuestPoints += questData.points;
      if (questData.miniquest) {
        Quest.miniQuests[questId] = questData;
      } else if (questData.member === false) {
        Quest.freeToPlayQuests[questId] = questData;
      } else {
        Quest.memberQuests[questId] = questData;
      }
      Quest.lookupByName.set(questData.name, questId);
    }

    Quest.totalPoints = totalQuestPoints;

    pubsub.publish("quest-data-loaded");
  }

  static randomQuestStates() {
    if (!Quest.questData) return;
    const result = [];
    const states = Object.keys(QuestState);
    let amount = 0;
    for (const questId of Object.keys(Quest.questData)) {
      amount = Math.max(parseInt(questId), amount);
    }

    for (let i = 0; i < amount; ++i) {
      result.push(Math.floor(Math.random() * states.length));
    }

    return result;
  }
}
