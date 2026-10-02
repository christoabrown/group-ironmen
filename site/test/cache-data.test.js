import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

const dataDir = path.resolve(__dirname, "../public/data");

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

let itemData, mapData, mapIcons, mapLabels;

beforeAll(() => {
  itemData = loadJson("item_data.json");
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
});
