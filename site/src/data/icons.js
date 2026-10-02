// Item, skill and equipment-slot icons come from the shared icon CDN (osrs-icons), not from this
// repository. The server injects the base URL as window.siteConfig.iconsBaseUrl (ICONS_BASE_URL).
// An empty base URL turns icons off: every helper then returns "".

const DEFAULT_ICONS_BASE_URL = "https://icons.scapekeeper.com";

export const SLOT_SLUGS = [
  "head",
  "cape",
  "amulet",
  "weapon",
  "body",
  "shield",
  "legs",
  "gloves",
  "boots",
  "ring",
  "ammo",
];

let cachedConfigured;
let cachedBase;

/** The configured icon base URL without trailing slashes, or "" when icons are disabled. */
export function iconsBase() {
  const configured = typeof window === "undefined" ? undefined : window.siteConfig?.iconsBaseUrl;
  if (cachedBase === undefined || configured !== cachedConfigured) {
    cachedConfigured = configured;
    cachedBase = String(configured ?? DEFAULT_ICONS_BASE_URL)
      .trim()
      .replace(/\/+$/, "");
  }
  return cachedBase;
}

/** The icon for an item id as-is (resolve stack variants before calling this). */
export function itemIconUrl(id) {
  const base = iconsBase();
  if (!base || id === null || id === undefined || id === "") return "";
  const itemId = Number(id);
  if (!Number.isInteger(itemId) || itemId < 0) return "";
  return `${base}/items/${itemId}.webp`;
}

/** "Attack" / "attack" → …/skills/attack.png. Overall has no icon. */
export function skillIconUrl(skillName) {
  const base = iconsBase();
  if (!base || !skillName) return "";
  const slug = String(skillName).toLowerCase();
  if (slug === "overall" || !/^[a-z]+$/.test(slug)) return "";
  return `${base}/skills/${slug}.png`;
}

/** An empty equipment-slot silhouette; `slot` is one of SLOT_SLUGS (case-insensitive). */
export function slotIconUrl(slot) {
  const base = iconsBase();
  if (!base || !slot) return "";
  const slug = String(slot).toLowerCase();
  if (!SLOT_SLUGS.includes(slug)) return "";
  return `${base}/slots/${slug}.png`;
}
