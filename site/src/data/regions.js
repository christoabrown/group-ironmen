import { pubsub } from "./pubsub";

// Names for the places players are, from the game's 64x64 map regions. The
// names come from `/data/regions.json` (see scripts/generate-regions.js); a
// region without a name borrows one from a neighbouring region, and a few
// areas are recognised from their coordinates.

let names = new Map();

export function regionId(x, y) {
  return ((x >> 6) << 8) | (y >> 6);
}

/** Sets the names by region id (for tests and after loading). */
export function setRegionNames(entries) {
  names = new Map(Object.entries(entries).map(([id, name]) => [Number(id), name]));
}

export async function loadRegions() {
  try {
    const response = await fetch("/data/regions.json");
    if (!response.ok) return;
    const data = await response.json();
    setRegionNames(data.regions || {});
    pubsub.publish("regions-loaded");
  } catch {
    // Without names, places fall back to the rules below.
  }
}

function wildernessLevel(x, y) {
  if (x >= 2944 && x < 3392 && y >= 3520 && y < 3968) return Math.floor((y - 3520) / 8) + 1;
  // The wilderness dungeons sit under it, 6400 tiles north.
  if (x >= 2944 && x < 3456 && y >= 9920 && y < 10560) return Math.floor((y - 9920) / 8) + 1;
  return null;
}

/**
 * The name of the place at game tile (x, y) as the plugin reports it (the
 * site's stored coordinates are one tile north; see regionForMember).
 */
export function regionName(x, y) {
  const level = wildernessLevel(x, y);
  if (level !== null) return `Wilderness (level ${level})`;
  const id = regionId(x, y);
  const exact = names.get(id);
  if (exact) return exact;
  // Instanced areas (raids, most bosses) are copied far east of the world.
  if (x >= 6400) return "An instance";
  for (const [dx, dy] of [
    [0, 1],
    [1, 0],
    [0, -1],
    [-1, 0],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ]) {
    const near = names.get(regionId(x + dx * 64, y + dy * 64));
    if (near) return `Near ${near}`;
  }
  return null;
}

/** The place of a member from the site's (y + 1) coordinates, or null. */
export function regionForMember(member) {
  const c = member?.coordinates;
  if (!c || isNaN(c.x) || isNaN(c.y)) return null;
  return regionName(c.x, c.y - 1);
}

/**
 * Online players with a location grouped by place, biggest group first:
 * `[{name, members, x, y, plane}]` where x, y, plane is where the first
 * member is (stored coordinates, for the map).
 */
export function groupByRegion(members) {
  const groups = new Map();
  for (const member of members) {
    if (!member.online || !member.coordinates) continue;
    const name = member.region || "Somewhere unnamed";
    if (!groups.has(name)) {
      groups.set(name, { name, members: [], ...member.coordinates });
    }
    groups.get(name).members.push(member);
  }
  return [...groups.values()].sort((a, b) => b.members.length - a.members.length || a.name.localeCompare(b.name));
}

/** Online players by world, busiest first: `[{world, members}]`. */
export function groupByWorld(members) {
  const worlds = new Map();
  for (const member of members) {
    const world = member.online ? member.stats?.world : null;
    if (!world) continue;
    if (!worlds.has(world)) worlds.set(world, []);
    worlds.get(world).push(member);
  }
  return [...worlds.entries()]
    .map(([world, list]) => ({ world, members: list }))
    .sort((a, b) => b.members.length - a.members.length || a.world - b.world);
}
