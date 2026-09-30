import { pubsub } from "./pubsub";

// Which player is selected (their profile is open and the map follows them)
// and whose trails are shown. Components talk through these topics:
//   player-selected  {name, follow} | null
//   trails-changed   Set of member names
//   map-focus        {x, y, plane, zoom?}   (a place to show on the map)

export const MAX_TRAILS = 8;

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
    pubsub.publish("trails-changed", new Set(this.trails));
    return true;
  }

  clearTrails() {
    this.trails.clear();
    pubsub.publish("trails-changed", new Set());
  }

  /** Forgets players that left the roster. */
  retainTrails(names) {
    let changed = false;
    for (const name of [...this.trails]) {
      if (!names.has(name)) {
        this.trails.delete(name);
        changed = true;
      }
    }
    if (changed) pubsub.publish("trails-changed", new Set(this.trails));
  }

  focusMap(x, y, plane = 0, zoom) {
    pubsub.publish("map-focus", { x, y, plane, zoom });
  }

  reset() {
    this.trails.clear();
  }
}

export const selection = new Selection();
