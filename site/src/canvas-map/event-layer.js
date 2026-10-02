import { api } from "../data/api";
import { eventPasses, eventPlace, eventTooltipHtml, loadEventFilters } from "../data/event-view";
import { newsTracker } from "../data/live-events";
import { colorForName } from "../data/player-colors";
import { regionName } from "../data/regions";
import { drawEventMarkers } from "./event-marker-renderer";
import { EventMarkers, REPLAY_POP_MAX, layoutMarkers } from "./event-markers";
import { EventPlaces } from "./event-places";
import { IconCache } from "./icon-cache";

// A long trail has thousands of events; only those this close to the canvas
// are laid out.
const LAYOUT_PAD_PX = 80;
// The pointer is on a marker from this far outside it.
const HIT_SLACK_PX = 3;

/**
 * The hub's events on the map: those of the last half hour, as the live feed
 * brings them, and those along the trails shown. This is where they go, how
 * they are drawn and which is under the pointer; which there are and how each
 * looks at a time is EventMarkers'. Times are in ms, by the server's clock.
 *
 * `playerOf(name)` gives a player on the map (`{coordinates, color}`) or
 * nothing, and `onChange()` is called when the map has to be drawn again.
 */
export class EventLayer {
  constructor({ playerOf, onChange, now = () => api.serverNow() }) {
    this.playerOf = playerOf;
    this.onChange = onChange;
    this.now = now;
    this.markers = new EventMarkers();
    this.icons = new IconCache({ onLoad: onChange });
    this.places = new EventPlaces();
    /** Which events are shown; see defaultEventFilters. */
    this.filters = loadEventFilters();
    /** What was drawn last, as layoutMarkers gives it: the last on top. */
    this.rendered = [];
    this.live = [];
    this.bringsNews = newsTracker();
    this.isNews = false;
  }

  setFilters(filters) {
    this.filters = { ...filters };
  }

  passes(event) {
    return eventPasses(event, this.filters);
  }

  /**
   * The hub's events as the live feed has them. The map is there for the
   * whole session, on whichever page: what happens while another page is
   * open is on the map, where it happened, when the map is looked at again.
   */
  feed(feed) {
    // What isn't news is put on the map, not announced.
    this.isNews = this.bringsNews(feed);
    // A feed that starts over may be another group's.
    if (feed.initial) this.markers.clearLive();
    this.live = feed.events;
    this.placeLive();
  }

  /**
   * Puts the live events on the map that aren't on it yet: also the ones that
   * were waiting for their player to turn up.
   */
  placeLive() {
    if (!this.live.length) return;
    const now = this.now();
    const added = this.markers.add(this.live, {
      now,
      place: (event) => this.placeOf(event),
      news: this.isNews,
    });
    if (!added.length) return;
    // Where the player was when it happened is only known now: after a reload it would be a guess.
    const placedByPlayer = added.filter((marker) => !marker.approximate && !marker.event.location);
    if (placedByPlayer.length) this.places.remember(placedByPlayer, now);
    this.onChange();
  }

  /**
   * Where an event goes on the map, and in which colour: where it says it
   * happened or where it was put when it did, or else where its player is
   * now (`known: false`). Null when none of those is known.
   */
  placeOf(event) {
    const player = this.playerOf(event.member);
    const color = player?.color || colorForName(event.member).color;
    const place = eventPlace(event) || this.places.get(event.id);
    if (place) return { ...place, color, known: true };
    const { x, y, plane } = player?.coordinates || {};
    if (isNaN(x) || isNaN(y) || isNaN(plane)) return null;
    return { x, y, plane, color, known: false };
  }

  /**
   * The trails on the map changed (`trails` is the TrailLayer): a trail's
   * events move with it, and go when it does.
   */
  syncTrails(trails) {
    const names = trails.names();
    for (const name of names) this.markers.setTrailMarks(name, trails.marksOn(name), trails.colorOf(name));
    this.markers.keepTrails(names);
  }

  /**
   * The replay went from one time to another (unix seconds, null for live).
   * What it passes on its way forward rings as it did when it happened.
   */
  replayMoved(from, to) {
    if (from === null || to === null || to <= from) return;
    const passed = this.markers.trailMarksBetween(from, to, this.filters);
    if (!passed.length) return;
    this.markers.pop(
      passed.slice(-REPLAY_POP_MAX).map((mark) => mark.id),
      this.now(),
    );
  }

  /** The marker of an event, wherever it is shown, or null. */
  find(id) {
    return this.markers.find(id);
  }

  /**
   * Draws the events as `view` sees them (see CanvasMap.viewport), at the
   * time the trails are shown at (`replayTime`, unix seconds, null for
   * live). Returns in how many ms the map should be drawn again for their
   * sake, or null when nothing about them changes by itself.
   */
  draw(ctx, view, replayTime = null) {
    const now = this.now();
    this.markers.prune(now);
    const shown = this.markers.visible({
      filters: this.filters,
      now,
      replayTime,
      within: (x, y) => view.onScreen(...view.toScreen(x, y), LAYOUT_PAD_PX),
    });
    const { items, nextMs } = layoutMarkers(shown, view);
    drawEventMarkers(ctx, items, { icons: this.icons });
    this.rendered = items;
    return nextMs;
  }

  /** The drawn event (or stack of events) at a place on the canvas, if any; see layoutMarkers. */
  hitTest(x, y) {
    // The last drawn is on top.
    for (let i = this.rendered.length - 1; i >= 0; i--) {
      const marker = this.rendered[i];
      const reach = marker.r + HIT_SLACK_PX;
      if ((marker.x - x) ** 2 + (marker.y - y) ** 2 <= reach * reach) return marker;
    }
    return null;
  }

  tooltip(marker) {
    const { tileX, tileY } = marker.top;
    return eventTooltipHtml(
      marker.members.map((member) => member.event),
      { now: this.now(), place: regionName(tileX, tileY - 1), approximate: marker.approximate },
    );
  }
}
