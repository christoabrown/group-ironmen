import { beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import {
  groupByRegion,
  groupByWorld,
  regionForMember,
  regionId,
  regionName,
  setRegionNames,
} from "../src/data/regions";

describe("regions", () => {
  beforeEach(() => {
    setRegionNames({ 12850: "Lumbridge", 12598: "Grand Exchange" });
  });

  it("computes the game's region ids", () => {
    expect(regionId(3222, 3218)).toBe(12850);
    expect(regionId(3164, 3487)).toBe(12598);
  });

  it("names a place, a neighbour, the wilderness and instances", () => {
    expect(regionName(3222, 3218)).toBe("Lumbridge");
    // One region east of Lumbridge has no name of its own.
    expect(regionName(3222 + 64, 3218)).toBe("Near Lumbridge");
    expect(regionName(3100, 3530)).toBe("Wilderness (level 2)");
    expect(regionName(3100, 3960)).toBe("Wilderness (level 56)");
    expect(regionName(9000, 5000)).toBe("An instance");
    expect(regionName(1000, 1000)).toBeNull();
  });

  it("uses the plugin's coordinates for a member", () => {
    // The site stores y one tile north.
    expect(regionForMember({ coordinates: { x: 3222, y: 3219, plane: 0 } })).toBe("Lumbridge");
    expect(regionForMember({})).toBeNull();
  });

  it("groups online players by place and by world", () => {
    const members = [
      { name: "A", online: true, region: "Lumbridge", coordinates: { x: 1, y: 2, plane: 0 }, stats: { world: 302 } },
      { name: "B", online: true, region: "Lumbridge", coordinates: { x: 3, y: 4, plane: 0 }, stats: { world: 330 } },
      {
        name: "C",
        online: true,
        region: "Grand Exchange",
        coordinates: { x: 5, y: 6, plane: 0 },
        stats: { world: 302 },
      },
      { name: "D", online: false, region: "Lumbridge", coordinates: { x: 7, y: 8, plane: 0 }, stats: { world: 302 } },
      { name: "E", online: true, stats: { world: 420 } },
    ];
    const places = groupByRegion(members);
    expect(places.map((p) => [p.name, p.members.map((m) => m.name)])).toEqual([
      ["Lumbridge", ["A", "B"]],
      ["Grand Exchange", ["C"]],
    ]);
    expect(places[0]).toMatchObject({ x: 1, y: 2, plane: 0 });

    const worlds = groupByWorld(members);
    expect(worlds.map((w) => [w.world, w.members.length])).toEqual([
      [302, 2],
      [330, 1],
      [420, 1],
    ]);
  });
});

describe("regions.json", () => {
  const file = path.join(__dirname, "../public/data/regions.json");

  it("maps region ids to names", () => {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    const entries = Object.entries(data.regions);
    expect(entries.length).toBeGreaterThan(500);
    for (const [id, name] of entries) {
      expect(Number.isInteger(Number(id))).toBe(true);
      expect(typeof name).toBe("string");
      expect(name.length).toBeGreaterThan(0);
    }
    expect(data.regions[12850]).toBe("Lumbridge");
    expect(fs.existsSync(path.join(__dirname, "../public/data/regions.NOTICE"))).toBe(true);
  });
});
