// The words for what the hub sends: an event without a line of its own, and a
// request that failed. Times and amounts are in format.js.

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

/** An error from `api.getHubJson` as a sentence for the page. */
export function hubErrorMessage(error) {
  if (error?.status === 404) return "Not shared by this player.";
  if (error?.status === 503) return "The hub is busy, trying again shortly.";
  return "Could not load data from the hub.";
}
