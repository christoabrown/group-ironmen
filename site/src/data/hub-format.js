// Formatting shared by the pages that show hub data.

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

/** Fallback text for events the hub did not describe. */
export function describeEvent(event) {
  if (event.line) return event.line;
  const who = event.member || "Someone";
  switch (event.type) {
    case "level_up":
      return `${who} reached level ${event.level ?? "?"} ${event.skill ?? ""}`.trim();
    case "death":
      return `${who} died`;
    default:
      return `${who}: ${event.title || event.type}`;
  }
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

/** An error from `api.getHubJson` as a sentence for the page. */
export function hubErrorMessage(error) {
  if (error?.status === 404) return "Not shared by this player.";
  if (error?.status === 503) return "The hub is busy, trying again shortly.";
  return "Could not load data from the hub.";
}
