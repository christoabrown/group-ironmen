// What the page remembers in this browser between visits: small settings,
// kept as JSON. A browser in private mode may refuse, and what is there may
// be unreadable; then nothing is remembered and nothing breaks.

/** What was remembered under `key`, or `fallback` when nothing (readable) was. */
export function remembered(key, fallback = null) {
  try {
    const stored = localStorage.getItem(key);
    return stored === null ? fallback : JSON.parse(stored);
  } catch {
    return fallback;
  }
}

/** Remembers `value` under `key` for the next visit, when the browser lets it. */
export function remember(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not remembered in private mode.
  }
}
