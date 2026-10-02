import { EVENT_MARKER_MS } from "./event-markers";
import { remember, remembered } from "../data/storage";

export const EVENT_PLACES_KEY = "map-event-places";

/**
 * Where events were put on the map that don't say where they happened: the
 * place their player was at the time. Remembered in this browser for as long
 * as a marker lasts, so a reload puts them back where they were instead of
 * where the player has got to since.
 */
export class EventPlaces {
  constructor() {
    this.places = null;
  }

  load() {
    if (this.places) return this.places;
    this.places = new Map();
    for (const [id, place] of Object.entries(remembered(EVENT_PLACES_KEY, {}) || {})) {
      if (Array.isArray(place) && place.length === 4 && place.every((value) => Number.isFinite(value))) {
        this.places.set(id, place);
      }
    }
    return this.places;
  }

  /** `{x, y, plane}` of an event, or null when it isn't remembered. */
  get(id) {
    const place = this.load().get(id);
    return place ? { x: place[0], y: place[1], plane: place[2] } : null;
  }

  /** Remembers where markers (`{id, x, y, plane, at}`) are, and forgets the ones whose time is up at `now`. */
  remember(markers, now) {
    const places = this.load();
    for (const marker of markers) places.set(marker.id, [marker.x, marker.y, marker.plane, marker.at]);
    for (const [id, place] of places) {
      if (now - place[3] >= EVENT_MARKER_MS) places.delete(id);
    }
    remember(EVENT_PLACES_KEY, Object.fromEntries(places));
  }
}
