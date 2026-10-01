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

// The regions of the dungeons under the wilderness that are wilderness too: the
// Edgeville Dungeon past its gate, the God Wars Dungeon, the Revenant Caves, the
// Slayer Cave, the Lava Maze and Deep Wilderness dungeons, the agility course's
// pit and Scorpia's cave. The other dungeons in that rectangle (the Slayer
// Tower's basement, the Ferox Enclave Dungeon) are not.
const WILDERNESS_DUNGEONS = new Set([
  12443, 12444, 12190, 12701, 12702, 12703, 12957, 12958, 12959, 13469, 13470, 13725, 13726, 12192, 12193, 11937, 12961,
]);

// The boss lairs and the caves between them: their level doesn't follow from
// where they are on the map.
const WILDERNESS_LAIRS = new Map([
  [13473, "40"], // Callisto's Den
  [13215, "35"], // Vet'ion's Rest
  [13727, "35"], // Silk Chasm
  [13472, "30-42"], // Escape Caves
  [7092, "21"], // Hunter's End
  [7604, "21"], // Skeletal Tomb
  [6580, "29"], // Web Chasm
]);

// The enclave is a safe zone inside the wilderness (its outline, roughly).
function inFeroxEnclave(x, y) {
  return x >= 3123 && x <= 3155 && y >= 3617 && y <= 3646;
}

function wildernessLevel(x, y) {
  const id = regionId(x, y);
  if (WILDERNESS_LAIRS.has(id)) return WILDERNESS_LAIRS.get(id);
  const dungeon = WILDERNESS_DUNGEONS.has(id);
  if (!dungeon && (x < 2944 || x >= 3392)) return null;
  // A wilderness dungeon has the level of the surface 6400 tiles south of it.
  const surfaceY = dungeon ? y - 6400 : y;
  // The ditch runs along y 3522; the levels count from two tiles south of it.
  if (surfaceY <= 3522 || surfaceY >= 3968) return null;
  return Math.floor((surfaceY - 3520) / 8) + 1;
}

/**
 * The name of the place at game tile (x, y) as the plugin reports it (the
 * site's stored coordinates are one tile north; see regionForMember).
 */
export function regionName(x, y) {
  if (inFeroxEnclave(x, y)) return "Ferox Enclave";
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
