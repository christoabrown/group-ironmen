import { utility } from "../utility";

export class AchievementDiary {
  constructor(completion) {
    this.completion = completion;
  }

  static randomDiaries() {
    // Does not give valid values for karamja easy, medium, hard. Just for example data
    // so am ok with this.
    return Array.from({ length: 62 }, () => Math.floor(Math.random() * 2 ** 32));
  }

  static async loadDiaries() {
    const response = await fetch("/data/diary_data.json");
    AchievementDiary.diaries = await response.json();
  }

  static parseDiaryData(diary_vars) {
    const bits = (varIndex, bitIndexes) =>
      bitIndexes.map((bitIndex) => utility.isBitSet(diary_vars[varIndex], bitIndex));
    const values = (checks) => checks.map(([varIndex, expectedValue]) => diary_vars[varIndex] === expectedValue);

    const result = {
      Ardougne: {
        Easy: bits(0, [0, 1, 2, 4, 5, 6, 7, 9, 11, 12]),
        Medium: bits(0, [13, 14, 15, 16, 17, 18, 19, 20, 21, 23, 24, 25]),
        Hard: [...bits(0, [26, 27, 28, 29, 30, 31]), ...bits(1, [0, 1, 2, 3, 4, 5])],
        Elite: bits(1, [6, 7, 9, 8, 10, 11, 12, 13]),
      },
      Desert: {
        Easy: bits(2, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
        Medium: [
          ...bits(2, [12, 13, 14, 15, 16, 17, 18, 19, 20, 21]),
          utility.isBitSet(diary_vars[2], 22) || utility.isBitSet(diary_vars[3], 9),
          ...bits(2, [23]),
        ],
        Hard: [...bits(2, [24, 25, 26, 27, 28, 29, 30, 31]), ...bits(3, [0, 1])],
        Elite: bits(3, [2, 4, 5, 6, 7, 8]),
      },
      Falador: {
        Easy: bits(4, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
        Medium: bits(4, [11, 12, 13, 14, 15, 16, 17, 18, 20, 21, 22, 23, 24, 25]),
        Hard: [...bits(4, [26, 27, 28, 29, 30, 31]), ...bits(5, [0, 1, 2, 3, 4])],
        Elite: bits(5, [5, 6, 7, 8, 9, 10]),
      },
      Fremennik: {
        Easy: bits(6, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
        Medium: bits(6, [11, 12, 13, 14, 15, 17, 18, 19, 20]),
        Hard: bits(6, [21, 23, 24, 25, 26, 27, 28, 29, 30]),
        Elite: [...bits(6, [31]), ...bits(7, [0, 1, 2, 3, 4])],
      },
      Kandarin: {
        Easy: bits(8, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
        Medium: bits(8, [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25]),
        Hard: [...bits(8, [26, 27, 28, 29, 30, 31]), ...bits(9, [0, 1, 2, 3, 4])],
        Elite: bits(9, [5, 6, 7, 8, 9, 10, 11]),
      },
      Karamja: {
        Easy: values([
          [23, 5],
          [24, 1],
          [25, 1],
          [26, 1],
          [27, 1],
          [28, 1],
          [29, 1],
          [30, 5],
          [31, 1],
          [32, 1],
        ]),
        Medium: values([
          [33, 1],
          [34, 1],
          [35, 1],
          [36, 1],
          [37, 1],
          [38, 1],
          [39, 1],
          [40, 1],
          [41, 1],
          [42, 1],
          [43, 1],
          [44, 1],
          [45, 1],
          [46, 1],
          [47, 1],
          [48, 1],
          [49, 1],
          [50, 1],
          [51, 1],
        ]),
        Hard: values([
          [52, 1],
          [53, 1],
          [54, 1],
          [55, 1],
          [56, 1],
          [57, 1],
          [58, 1],
          [59, 5],
          [60, 1],
          [61, 1],
        ]),
        Elite: bits(10, [1, 2, 3, 4, 5]),
      },
      "Kourend & Kebos": {
        Easy: bits(11, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
        Medium: bits(11, [25, 13, 14, 15, 21, 16, 17, 18, 19, 22, 20, 23, 24]),
        Hard: [...bits(11, [26, 27, 28, 29, 31, 30]), ...bits(12, [0, 1, 2, 3])],
        Elite: bits(12, [4, 5, 6, 7, 8, 9, 10, 11]),
      },
      "Lumbridge & Draynor": {
        Easy: bits(13, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
        Medium: bits(13, [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]),
        Hard: [...bits(13, [25, 26, 27, 28, 29, 30, 31]), ...bits(14, [0, 1, 2, 3])],
        Elite: bits(14, [4, 5, 6, 7, 8, 9]),
      },
      Morytania: {
        Easy: bits(15, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
        Medium: bits(15, [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22]),
        Hard: [...bits(15, [23, 24, 25, 26, 27, 28, 29, 30]), ...bits(16, [1, 2])],
        Elite: bits(16, [3, 4, 5, 6, 7, 8]),
      },
      Varrock: {
        Easy: bits(17, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]),
        Medium: bits(17, [15, 16, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28]),
        Hard: [...bits(17, [29, 30, 31]), ...bits(18, [0, 1, 2, 3, 4, 5, 6])],
        Elite: bits(18, [7, 8, 9, 10, 11]),
      },
      "Western Provinces": {
        Easy: bits(19, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
        Medium: bits(19, [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]),
        Hard: [...bits(19, [25, 26, 27, 28, 29, 30, 31]), ...bits(20, [0, 1, 2, 3, 4, 5])],
        Elite: bits(20, [6, 7, 8, 9, 12, 13, 14]),
      },
      Wilderness: {
        Easy: bits(21, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
        Medium: bits(21, [13, 14, 15, 16, 18, 19, 20, 21, 22, 23, 24]),
        Hard: [...bits(21, [25, 26, 27, 28, 29, 30, 31]), ...bits(22, [0, 1, 2])],
        Elite: bits(22, [3, 5, 7, 8, 9, 10, 11]),
      },
    };

    return new AchievementDiary(result);
  }
}
