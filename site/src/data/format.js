// How the site writes times, amounts and text that came from elsewhere. One
// place, so that a time or a value reads the same wherever it is shown.

/** Text made safe to put into HTML, in an element or an attribute. */
export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** The time of day of a moment (ms since the epoch, or a Date): "14:32". */
export function clockTime(time) {
  return new Date(time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** The day of a moment (ms since the epoch, or a Date): "26 Sep". */
export function shortDay(time) {
  return new Date(time).toLocaleDateString([], { day: "numeric", month: "short" });
}

/** How long ago a moment was: "just now", "45m ago", "3h ago", "2d ago". */
export function relativeTime(date, now = new Date()) {
  if (!date) return "never";
  const seconds = Math.max(0, Math.round((now.getTime() - new Date(date).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 365) return `${days}d ago`;
  return `${Math.floor(days / 365)}y ago`;
}

/** 1234 → "1.2K", 35237280 → "35.2M". */
export function formatGp(value) {
  if (value === null || value === undefined || isNaN(value)) return "–";
  const abs = Math.abs(value);
  const units = [
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  for (const [size, suffix] of units) {
    if (abs >= size) {
      const scaled = value / size;
      return `${scaled >= 100 ? Math.round(scaled) : scaled.toFixed(1).replace(/\.0$/, "")}${suffix}`;
    }
  }
  return String(Math.round(value));
}

/** 5430000 ms → "1h 30m". */
export function formatDuration(ms) {
  const minutes = Math.round((ms || 0) / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest ? `${hours}h ${rest}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}
