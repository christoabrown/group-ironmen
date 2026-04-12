import { describe, expect, it } from "vitest";
import { AchievementDiary } from "../src/data/diaries";

const allCompleteDiaryVars = () => {
  const vars = Array.from({ length: 62 }, () => 0xffffffff);

  vars[23] = 5;
  vars[24] = 1;
  vars[25] = 1;
  vars[26] = 1;
  vars[27] = 1;
  vars[28] = 1;
  vars[29] = 1;
  vars[30] = 5;
  vars[31] = 1;
  vars[32] = 1;

  for (let i = 33; i <= 58; i += 1) {
    vars[i] = 1;
  }
  vars[59] = 5;
  vars[60] = 1;
  vars[61] = 1;

  return vars;
};

describe("achievement diary", () => {
  it("maps every diary entry to a boolean completion value", () => {
    const emptyDiary = AchievementDiary.parseDiaryData(Array.from({ length: 62 }, () => 0)).completion;
    const completeDiary = AchievementDiary.parseDiaryData(allCompleteDiaryVars()).completion;

    for (const [region, tiers] of Object.entries(completeDiary)) {
      for (const [tier, entries] of Object.entries(tiers)) {
        expect(entries.length).toBeGreaterThan(0);

        entries.forEach((entryValue, index) => {
          expect(typeof entryValue).toBe("boolean");
          expect(emptyDiary[region][tier][index]).toBe(false);
          expect(entryValue).toBe(true);
        });
      }
    }
  });

  it("supports Desert medium completion via the alternate bit", () => {
    const vars = Array.from({ length: 62 }, () => 0);
    vars[3] = 1 << 9;

    const diary = AchievementDiary.parseDiaryData(vars).completion;

    expect(diary.Desert.Medium[10]).toBe(true);
  });
});
