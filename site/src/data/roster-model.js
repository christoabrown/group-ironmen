// Filtering and sorting of players, shared by the roster and the players table.

/** The categories a player shares with the guild, or null when unknown. */
export function sharedCategories(member) {
  return member?.meta?.categories || null;
}

/** Whether the player shares a hub category; true while unknown. */
export function shares(member, category) {
  const categories = sharedCategories(member);
  return categories === null || categories.includes(category);
}

export function carriedValue(member) {
  const meta = member?.meta;
  if (!meta || (meta.inventory_value === undefined && meta.equipment_value === undefined)) return null;
  return (meta.inventory_value || 0) + (meta.equipment_value || 0);
}

export function totalLevel(member) {
  return member?.meta?.total_level ?? null;
}

export function overallXp(member) {
  return member?.meta?.overall_xp ?? member?.skills?.Overall?.xp ?? null;
}

export function world(member) {
  return member?.online ? member?.stats?.world || null : null;
}

const compareNames = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
const byNumber = (get) => (a, b) => (get(b) ?? -Infinity) - (get(a) ?? -Infinity) || compareNames(a, b);
const lastSeenTime = (member) => (member.lastSeen ? member.lastSeen.getTime() : null);

/** Sort orders by key; every order puts equal values in name order. */
export const SORTS = {
  status: {
    label: "Online first",
    compare: (a, b) => Number(b.online) - Number(a.online) || compareNames(a, b),
  },
  name: { label: "Name", compare: compareNames },
  total: { label: "Total level", compare: byNumber(totalLevel) },
  xp: { label: "Total XP", compare: byNumber(overallXp) },
  value: { label: "Carried value", compare: byNumber(carriedValue) },
  combat: { label: "Combat level", compare: byNumber((m) => m.combatLevel ?? null) },
  world: { label: "World", compare: (a, b) => (world(a) ?? Infinity) - (world(b) ?? Infinity) || compareNames(a, b) },
  lastSeen: {
    label: "Last seen",
    compare: (a, b) =>
      Number(b.online) - Number(a.online) ||
      (lastSeenTime(b) ?? -Infinity) - (lastSeenTime(a) ?? -Infinity) ||
      compareNames(a, b),
  },
};

/**
 * `status`: "all", "online" or "offline". `text` matches the name, the owner
 * and the region, case-insensitively.
 */
export function filterMembers(members, { text = "", status = "all" } = {}) {
  const query = text.trim().toLowerCase();
  return members.filter((member) => {
    if (status === "online" && !member.online) return false;
    if (status === "offline" && member.online) return false;
    if (!query) return true;
    return [member.name, member.meta?.owner, member.region]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(query));
  });
}

export function sortMembers(members, key = "status", descending = false) {
  const sort = SORTS[key] || SORTS.status;
  const sorted = [...members].sort(sort.compare);
  return descending ? sorted.reverse() : sorted;
}
