// The time shown while trails are replayed: a point between the start and the
// end of the trails that can be dragged around or played, at a speed in trail
// seconds per real second.

// A frame that took longer than this (a hidden tab, a stall) counts as this long.
const MAX_FRAME_MS = 250;
// With idle time skipped: a wait longer than this is jumped over, up to this
// long before the next thing that happens.
const IDLE_SKIP_S = 600;
const IDLE_LEAD_S = 30;
// How long the replay stands still where a player landed after a hop, so the
// eye (and the camera) can catch up before it goes on.
const LANDING_HOLD_MS = 1500;

export const DEFAULT_SPEED = 300;

export class ReplayClock {
  constructor() {
    this.tMin = 0;
    this.tMax = 0;
    this.time = 0;
    this.playing = false;
    this.speed = DEFAULT_SPEED;
    this.skipIdle = true;
    this.holdMs = 0;
  }

  get atEnd() {
    return this.time >= this.tMax;
  }

  /**
   * Sets the span of the trails. A clock at the end stays at the end, which is
   * "now" for a player who is online; any other time is kept if it still can be.
   */
  setRange(tMin, tMax) {
    const follow = this.atEnd;
    this.tMin = tMin;
    this.tMax = tMax;
    this.time = follow ? tMax : Math.min(Math.max(this.time, tMin), tMax);
  }

  seek(time) {
    this.time = Math.min(Math.max(time, this.tMin), this.tMax);
    this.holdMs = 0;
  }

  /** Starts playing, from the start when the end had been reached. */
  play() {
    if (this.atEnd) this.time = this.tMin;
    this.playing = true;
  }

  pause() {
    this.playing = false;
    this.holdMs = 0;
  }

  /**
   * Moves on by a frame that took `elapsedMs`. `nextChange(time)` says when
   * something next happens on the trails (null: nothing more), so that waits
   * can be skipped. `nextHold(from, to)` says when, after `from` and up to
   * `to`, the player lands after a hop (null: not in that span): the clock
   * stops there and stands still for a moment. Returns whether the time
   * changed.
   */
  tick(elapsedMs, nextChange, nextHold) {
    if (!this.playing) return false;
    const frameMs = Math.min(elapsedMs, MAX_FRAME_MS);
    if (this.holdMs > 0) {
      this.holdMs -= frameMs;
      return false;
    }
    const before = this.time;
    const next = this.skipIdle && nextChange ? nextChange(this.time) : undefined;
    if (next === null) {
      this.time = this.tMax;
    } else if (next !== undefined && next - this.time > IDLE_SKIP_S) {
      this.time = Math.min(next - IDLE_LEAD_S, this.tMax);
    } else {
      this.time = Math.min(this.time + (frameMs / 1000) * this.speed, this.tMax);
    }
    const landing = nextHold ? nextHold(before, this.time) : null;
    if (landing !== null && landing > before && landing <= this.time) {
      this.time = landing;
      this.holdMs = LANDING_HOLD_MS;
    }
    if (this.atEnd) this.playing = false;
    return this.time !== before;
  }
}
