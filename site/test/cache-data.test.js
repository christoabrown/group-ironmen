import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

const dataDir = path.resolve(__dirname, "../public/data");
const iconsDir = path.resolve(__dirname, "../public/icons/items");

const RAW_MASTER_BASE =
  "https://raw.githubusercontent.com/christoabrown/group-ironmen/master/site/public/data";

function loadJson(filename) {
  const raw = fs.readFileSync(path.join(dataDir, filename), "utf-8");
  return JSON.parse(raw);
}

function expectNumericKeys(obj) {
  for (const key of Object.keys(obj)) {
    expect(key).toMatch(/^\d+$/);
    expect(Number(key)).toBeGreaterThanOrEqual(0);
  }
}

let itemData, questData, collectionLog, collectionLogDuplicates, mapData, mapIcons, mapLabels;

beforeAll(() => {
  itemData = loadJson("item_data.json");
  questData = loadJson("quest_data.json");
  collectionLog = loadJson("collection_log_info.json");
  collectionLogDuplicates = loadJson("collection_log_duplicates.json");
  mapData = loadJson("map.json");
  mapIcons = loadJson("map_icons.json");
  mapLabels = loadJson("map_labels.json");
});

describe("cache data validation", () => {
  describe("item_data.json", () => {
    it("is valid JSON", () => {
      expect(itemData).toBeDefined();
      expect(typeof itemData).toBe("object");
    });

    it("has > 15000 entries", () => {
      expect(Object.keys(itemData).length).toBeGreaterThan(15000);
    });

    it("every entry has name and highalch", () => {
      for (const [key, item] of Object.entries(itemData)) {
        expect(typeof item.name).toBe("string");
        expect(item.name.trim().length).toBeGreaterThan(0);
        expect(typeof item.highalch).toBe("number");
        expect(item.highalch).toBeGreaterThanOrEqual(0);
      }
    });

    it("all keys are numeric strings representing positive integers", () => {
      expectNumericKeys(itemData);
    });

    it("optional stacks field is valid when present", () => {
      for (const item of Object.values(itemData)) {
        if (item.stacks === undefined || item.stacks === null) continue;
        expect(Array.isArray(item.stacks)).toBe(true);
        for (const pair of item.stacks) {
          expect(Array.isArray(pair)).toBe(true);
          expect(pair.length).toBe(2);
          expect(Number.isInteger(pair[0])).toBe(true);
          expect(pair[0]).toBeGreaterThan(0);
          expect(Number.isInteger(pair[1])).toBe(true);
          expect(pair[1]).toBeGreaterThan(0);
        }
      }
    });

    it("known items are present", () => {
      expect(itemData["4151"]).toBeDefined();
      expect(itemData["4151"].name).toBe("Abyssal whip");
      expect(itemData["995"]).toBeDefined();
      expect(itemData["995"].name).toBe("Coins");
      expect(itemData["1"]).toBeDefined();
      expect(itemData["1"].name).toBe("Toolkit");
    });
  });

  describe("quest_data.json", () => {
    const validDifficulties = [
      "Novice",
      "Intermediate",
      "Experienced",
      "Master",
      "Grandmaster",
      "Special",
    ];

    it("is valid JSON", () => {
      expect(questData).toBeDefined();
      expect(typeof questData).toBe("object");
    });

    it("has > 100 entries", () => {
      expect(Object.keys(questData).length).toBeGreaterThan(100);
    });

    it("every entry has valid schema", () => {
      for (const [key, quest] of Object.entries(questData)) {
        expect(typeof quest.name).toBe("string");
        expect(quest.name.length).toBeGreaterThan(0);
        expect(validDifficulties).toContain(quest.difficulty);
        expect(typeof quest.points).toBe("string");
        expect(parseInt(quest.points, 10)).toBeGreaterThanOrEqual(0);
        expect(typeof quest.member).toBe("boolean");
      }
    });

    it("optional fields are valid when present", () => {
      for (const quest of Object.values(questData)) {
        if (quest.hidden !== undefined) {
          expect(typeof quest.hidden).toBe("boolean");
        }
        if (quest.miniquest !== undefined) {
          expect(typeof quest.miniquest).toBe("boolean");
        }
      }
    });

    it("all keys are numeric strings representing non-negative integers", () => {
      expectNumericKeys(questData);
    });

    it("known quests are present", () => {
      expect(questData["0"]).toBeDefined();
      expect(questData["0"].name).toBe("Animal Magnetism");
      expect(questData["10"]).toBeDefined();
      expect(questData["10"].name).toBe("Black Knights' Fortress");
    });
  });

  describe("collection_log_info.json", () => {
    it("is valid JSON", () => {
      expect(Array.isArray(collectionLog)).toBe(true);
    });

    it("each tab/page/item has valid schema", () => {
      for (const tab of collectionLog) {
        expect(Number.isInteger(tab.tabId)).toBe(true);
        expect(tab.tabId).toBeGreaterThanOrEqual(0);
        expect(tab.tabId).toBeLessThanOrEqual(4);
        expect(Array.isArray(tab.pages)).toBe(true);
        expect(tab.pages.length).toBeGreaterThan(0);
        for (const page of tab.pages) {
          expect(typeof page.name).toBe("string");
          expect(page.name.length).toBeGreaterThan(0);
          expect(Array.isArray(page.items)).toBe(true);
          expect(page.items.length).toBeGreaterThan(0);
          for (const item of page.items) {
            expect(Number.isInteger(item.id)).toBe(true);
            expect(item.id).toBeGreaterThan(0);
            expect(typeof item.name).toBe("string");
            expect(item.name.length).toBeGreaterThan(0);
          }
        }
      }
    });

    it("tab IDs are unique", () => {
      const tabIds = collectionLog.map((t) => t.tabId);
      expect(new Set(tabIds).size).toBe(tabIds.length);
    });

    it("page names are unique across entire collection log", () => {
      const names = collectionLog.flatMap((t) => t.pages.map((p) => p.name));
      expect(new Set(names).size).toBe(names.length);
    });

    it("total items > 1000", () => {
      const total = collectionLog.reduce(
        (sum, tab) => sum + tab.pages.reduce((s, p) => s + p.items.length, 0),
        0,
      );
      expect(total).toBeGreaterThan(1000);
    });
  });

  describe("collection_log_duplicates.json", () => {
    it("is valid JSON", () => {
      expect(typeof collectionLogDuplicates).toBe("object");
      expect(collectionLogDuplicates).not.toBeNull();
    });

    it("all values are non-empty arrays of numbers", () => {
      for (const [key, value] of Object.entries(collectionLogDuplicates)) {
        expect(Array.isArray(value)).toBe(true);
        expect(value.length).toBeGreaterThan(0);
        for (const id of value) {
          expect(typeof id).toBe("number");
          expect(Number.isInteger(id)).toBe(true);
          expect(id).toBeGreaterThan(0);
        }
      }
    });

    it("all keys are numeric strings", () => {
      expectNumericKeys(collectionLogDuplicates);
    });

    it("parent IDs exist in item_data", () => {
      for (const key of Object.keys(collectionLogDuplicates)) {
        expect(itemData[key]).toBeDefined();
      }
    });

    it("referenced duplicate IDs exist in item_data", () => {
      for (const ids of Object.values(collectionLogDuplicates)) {
        for (const id of ids) {
          expect(itemData[String(id)]).toBeDefined();
        }
      }
    });
  });

  describe("map.json", () => {
    it("is valid JSON", () => {
      expect(typeof mapData).toBe("object");
      expect(mapData).not.toBeNull();
    });

    it("has tiles key with non-empty array", () => {
      expect(Array.isArray(mapData.tiles)).toBe(true);
      expect(mapData.tiles.length).toBeGreaterThan(0);
    });
  });

  describe("map_icons.json", () => {
    it("is valid JSON", () => {
      expect(typeof mapIcons).toBe("object");
      expect(mapIcons).not.toBeNull();
    });

    it("has nested structure with entries", () => {
      const regionKeys = Object.keys(mapIcons);
      expect(regionKeys.length).toBeGreaterThan(0);
      for (const region of regionKeys) {
        const planes = mapIcons[region];
        expect(typeof planes).toBe("object");
        expect(planes).not.toBeNull();
        const planeKeys = Object.keys(planes);
        expect(planeKeys.length).toBeGreaterThan(0);
      }
    });
  });

  describe("map_labels.json", () => {
    it("is valid JSON", () => {
      expect(typeof mapLabels).toBe("object");
      expect(mapLabels).not.toBeNull();
    });

    it("has nested structure with entries", () => {
      const regionKeys = Object.keys(mapLabels);
      expect(regionKeys.length).toBeGreaterThan(0);
      for (const region of regionKeys) {
        const planes = mapLabels[region];
        expect(typeof planes).toBe("object");
        expect(planes).not.toBeNull();
        const planeKeys = Object.keys(planes);
        expect(planeKeys.length).toBeGreaterThan(0);
      }
    });
  });

  describe("item icons", () => {
    it("icons exist for known items", () => {
      expect(fs.existsSync(path.join(iconsDir, "4151.webp"))).toBe(true);
      expect(fs.existsSync(path.join(iconsDir, "995.webp"))).toBe(true);
    });

    it("icons exist for a sample of collection log items", () => {
      const allItems = collectionLog.flatMap((t) =>
        t.pages.flatMap((p) => p.items.map((i) => i.id)),
      );
      const sample = allItems.filter((_, i) => i % 50 === 0).slice(0, 50);
      for (const id of sample) {
        expect(fs.existsSync(path.join(iconsDir, `${id}.webp`))).toBe(true);
      }
    });

    it("icon count > 15000", () => {
      const files = fs.readdirSync(iconsDir).filter((f) => f.endsWith(".webp"));
      expect(files.length).toBeGreaterThan(15000);
    });
  });

  describe("cross-file referential integrity", () => {
    it("every collection log item exists in item_data", () => {
      for (const tab of collectionLog) {
        for (const page of tab.pages) {
          for (const item of page.items) {
            expect(itemData[String(item.id)]).toBeDefined();
          }
        }
      }
    });
  });

  describe("no data regression vs master", () => {
    const filesToCheck = [
      { file: "item_data.json", countFn: (d) => Object.keys(d).length },
      { file: "quest_data.json", countFn: (d) => Object.keys(d).length },
      {
        file: "collection_log_info.json",
        countFn: (d) =>
          d.reduce((s, t) => s + t.pages.reduce((ss, p) => ss + p.items.length, 0), 0),
      },
      {
        file: "collection_log_duplicates.json",
        countFn: (d) => Object.keys(d).length,
      },
    ];

    for (const { file, countFn } of filesToCheck) {
      it(`${file} entry count has not dropped > 10% vs master`, async () => {
        const localData = loadJson(file);
        const localCount = countFn(localData);

        let masterData;
        try {
          const resp = await fetch(`${RAW_MASTER_BASE}/${file}`);
          if (!resp.ok) {
            console.warn(`Skipping regression check for ${file}: HTTP ${resp.status}`);
            return;
          }
          masterData = await resp.json();
        } catch (e) {
          console.warn(`Skipping regression check for ${file}: ${e.message}`);
          return;
        }

        const masterCount = countFn(masterData);
        const threshold = masterCount * 0.9;
        expect(localCount).toBeGreaterThanOrEqual(threshold);
      });
    }
  });
});
