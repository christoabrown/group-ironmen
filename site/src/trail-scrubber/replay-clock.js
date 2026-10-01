// The time shown while trails are replayed: a point between the start and the
// end of the trails that can be dragged around or played, at a speed in trail
// seconds per real second.

// A frame that took longer than this (a hidden tab, a stall) counts as this long.
const MAX_FRAME_MS = 250;
// With idle time skipped: a wait longer than this is jumped over, up to this
// long before the next thing that happens.
const IDLE_SKIP_S = 600;
const IDLE_LEAD_S = 30;

export const DEFAULT_SPEED = 300;

export class ReplayClock {
  constructor() {
    this.tMin = 0;
    this.tMax = 0;
    this.time = 0;
    this.playing = false;
    this.speed = DEFAULT_SPEED;
    this.skipIdle = true;
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
  }

  /** Starts playing, from the start when the end had been reached. */
  play() {
    if (this.atEnd) this.time = this.tMin;
    this.playing = true;
  }

  pause() {
    this.playing = false;
  }

  /**
   * Moves on by a frame that took `elapsedMs`. `nextChange(time)` says when
   * something next happens on the trails (null: nothing more), so that waits
   * can be skipped. Returns whether the time changed.
   */
  tick(elapsedMs, nextChange) {
    if (!this.playing) return false;
    const before = this.time;
    const next = this.skipIdle && nextChange ? nextChange(this.time) : undefined;
    if (next === null) {
      this.time = this.tMax;
    } else if (next !== undefined && next - this.time > IDLE_SKIP_S) {
      this.time = Math.min(next - IDLE_LEAD_S, this.tMax);
    } else {
      this.time = Math.min(this.time + (Math.min(elapsedMs, MAX_FRAME_MS) / 1000) * this.speed, this.tMax);
    }
    if (this.atEnd) this.playing = false;
    return this.time !== before;
  }
}
