// A colour per player that stays the same across sessions and devices: the
// hue comes from a hash of the lowercased name, so 50+ players get distinct
// colours without anyone keeping a palette.

/** FNV-1a, 32 bit. */
export function hashName(name) {
  let hash = 0x811c9dc5;
  const text = String(name).toLowerCase();
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/** `{hue, color, light}`: the marker colour and a lighter one for outlines and text. */
export function colorForName(name) {
  const hash = hashName(name);
  const hue = hash % 360;
  // Vary the lightness a little so neighbouring hues are easier to tell apart.
  const lightness = 45 + ((hash >>> 9) % 3) * 6;
  return {
    hue,
    color: `hsl(${hue}, 70%, ${lightness}%)`,
    light: `hsl(${hue}, 85%, ${Math.min(lightness + 25, 85)}%)`,
  };
}
