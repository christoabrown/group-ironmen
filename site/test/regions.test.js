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

  it("starts the wilderness north of the ditch", () => {
    // The ditch runs along y 3522.
    expect(String(regionName(3100, 3521))).not.toMatch(/Wilderness/);
    expect(regionName(3100, 3523)).toBe("Wilderness (level 1)");
    expect(regionName(3100, 3528)).toBe("Wilderness (level 2)");
  });

  it("names the safe Ferox Enclave instead of a wilderness level", () => {
    expect(regionName(3137, 3623)).toBe("Ferox Enclave");
    expect(regionName(3130, 3632)).toBe("Ferox Enclave");
    // The obelisk east of the enclave.
    expect(regionName(3160, 3623)).toBe("Wilderness (level 13)");
  });

  it("gives the wilderness dungeons the level of the surface above them", () => {
    // Edgeville Dungeon past the gate, the Revenant Caves, both halves of the
    // Wilderness Slayer Cave and the Deep Wilderness Dungeon.
    expect(regionName(3110, 9952)).toBe("Wilderness (level 5)");
    expect(String(regionName(3110, 9921))).not.toMatch(/Wilderness/);
    expect(regionName(3200, 10100)).toBe("Wilderness (level 23)");
    expect(regionName(3340, 10160)).toBe("Wilderness (level 31)");
    expect(regionName(3410, 10065)).toBe("Wilderness (level 19)");
    expect(regionName(3040, 10330)).toBe("Wilderness (level 52)");
  });

  it("gives the wilderness boss lairs their own level", () => {
    expect(regionName(3359, 10329)).toBe("Wilderness (level 40)"); // Callisto's Den
    expect(regionName(3295, 10203)).toBe("Wilderness (level 35)"); // Vet'ion's Rest
    expect(regionName(3423, 10204)).toBe("Wilderness (level 35)"); // Silk Chasm
    expect(regionName(3360, 10270)).toBe("Wilderness (level 30-42)"); // Escape Caves
    expect(regionName(1760, 11550)).toBe("Wilderness (level 21)"); // Hunter's End
    expect(regionName(1888, 11550)).toBe("Wilderness (level 21)"); // Skeletal Tomb
    expect(regionName(1632, 11550)).toBe("Wilderness (level 29)"); // Web Chasm
  });

  it("does not call the dungeons beside the wilderness dungeons wilderness", () => {
    setRegionNames({ 13723: "Slayer Tower", 12700: "Ferox Enclave Dungeon" });
    expect(regionName(3420, 9945)).toBe("Slayer Tower");
    expect(regionName(3168, 10016)).toBe("Ferox Enclave Dungeon");
    // Under Asgarnia and Misthalin, without a name of their own.
    for (const [x, y] of [
      [2970, 9950],
      [3050, 9950],
      [3220, 9935],
    ]) {
      expect(String(regionName(x, y))).not.toMatch(/Wilderness/);
    }
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

  it("names the Slayer Tower basement", () => {
    setRegionNames(JSON.parse(fs.readFileSync(file, "utf8")).regions);
    expect(regionName(3420, 9945)).toBe("Slayer Tower");
    expect(regionName(3428, 3537)).toBe("Slayer Tower");
  });
});
