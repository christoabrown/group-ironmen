import { api } from "./api";
import { pubsub } from "./pubsub";
import { utility } from "../utility";

// One poller for the hub events every page uses (the map's markers, the event
// feeds, the clan overview). Publishes "live-events" with
// `{events, added, initial}`: `events` are the newest KEEP events, newest
// first; `added` are the ones that arrived with this poll (empty on the first
// load, so old events don't look new). The first load asks for all it keeps:
// the map shows the events of the last half hour.

const LIVE_EVENTS_POLL_MS = 5000;
const KEEP = 300;

/**
 * For a subscriber of "live-events": a function that says, for each call it
 * gets, whether that call brings news. The first one doesn't: it is the last
 * poll played back to whoever subscribes, or the first load. Nor does a feed
 * that starts over.
 */
export function newsTracker() {
  let heard = false;
  return ({ initial }) => {
    const news = heard && !initial;
    heard = true;
    return news;
  };
}

export class LiveEvents {
  constructor() {
    this.events = [];
    this.latest = null;
    this.interval = null;
  }

  start() {
    if (this.interval !== null) return;
    this.events = [];
    this.latest = null;
    this.interval = utility.callOnInterval(() => this.poll(), LIVE_EVENTS_POLL_MS);
  }

  stop() {
    if (this.interval !== null) window.clearInterval(this.interval);
    this.interval = null;
    this.events = [];
    this.latest = null;
  }

  async poll() {
    let page;
    try {
      page = await api.getHubEventsPage({ limit: this.latest === null ? KEEP : 200, after: this.latest });
    } catch {
      return;
    }
    // The backend restarted and counts from 1 again: start over.
    if (this.latest !== null && page.latest !== null && page.latest < this.latest) {
      this.latest = null;
      this.events = [];
      return this.poll();
    }
    this.apply(page.events, page.latest);
  }

  apply(batch, serverLatest = null) {
    const initial = this.latest === null;
    const newest = batch.reduce((max, event) => Math.max(max, event.seq || 0), 0);
    this.latest = Math.max(this.latest ?? 0, newest, initial ? (serverLatest ?? 0) : 0);
    if (!initial && batch.length === 0) return;
    const known = new Set(this.events.map((event) => event.id));
    const fresh = batch.filter((event) => !known.has(event.id));
    this.events = [...fresh, ...this.events].slice(0, KEEP);
    pubsub.publish("live-events", { events: this.events, added: initial ? [] : fresh, initial });
  }
}

export const liveEvents = new LiveEvents();
