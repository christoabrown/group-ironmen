import { pubsub } from "./pubsub";

// Which player is selected (their profile is open and the map follows them)
// and whose trails are shown. Components talk through these topics:
//   player-selected  {name, follow} | null
//   trails-changed   Set of member names
//   map-focus        {x, y, plane, zoom?}   (a place to show on the map)

export const MAX_TRAILS = 8;
const TRAILS_KEY = "map-trails";

class Selection {
  constructor() {
    this.trails = new Set();
  }

  get selected() {
    return pubsub.getMostRecent("player-selected")?.[0]?.name || null;
  }

  select(name, { follow = true } = {}) {
    pubsub.publish("player-selected", { name, follow });
  }

  clear() {
    if (this.selected !== null) {
      pubsub.publish("player-selected", null);
    }
  }

  hasTrail(name) {
    return this.trails.has(name);
  }

  /** Shows or hides a player's trail. Returns false when the limit is reached. */
  toggleTrail(name) {
    if (this.trails.has(name)) {
      this.trails.delete(name);
    } else {
      if (this.trails.size >= MAX_TRAILS) return false;
      this.trails.add(name);
    }
    this.trailsChanged();
    return true;
  }

  clearTrails() {
    this.trails.clear();
    this.trailsChanged();
  }

  /** Forgets players that left the roster. */
  retainTrails(names) {
    // An empty roster is one that hasn't loaded yet, not one everybody left.
    if (!names.size) return;
    let changed = false;
    for (const name of [...this.trails]) {
      if (!names.has(name)) {
        this.trails.delete(name);
        changed = true;
      }
    }
    if (changed) this.trailsChanged();
  }

  trailsChanged() {
    try {
      localStorage.setItem(TRAILS_KEY, JSON.stringify([...this.trails]));
    } catch {
      // Not remembered in private mode.
    }
    pubsub.publish("trails-changed", new Set(this.trails));
  }

  /** Shows the trails that were on before the page was reloaded. */
  restore() {
    let names = [];
    try {
      names = JSON.parse(localStorage.getItem(TRAILS_KEY) || "[]");
    } catch {
      // Start without trails.
    }
    if (!Array.isArray(names)) names = [];
    this.trails = new Set(names.filter((name) => typeof name === "string").slice(0, MAX_TRAILS));
    if (this.trails.size) pubsub.publish("trails-changed", new Set(this.trails));
  }

  focusMap(x, y, plane = 0, zoom) {
    pubsub.publish("map-focus", { x, y, plane, zoom });
  }

  /** Forgets the trails for this page, not the ones remembered for the next. */
  reset() {
    this.trails.clear();
  }
}

export const selection = new Selection();
