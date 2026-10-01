import { BaseElement } from "../base-element/base-element";
import { formatTrailTime } from "../canvas-map/trail-model";
import { ReplayClock } from "./replay-clock";

// More ticks than this on the timeline are only clutter.
const MAX_TICKS = 300;
const FOLLOW_KEY = "map-replay-follow";
// The speed a replay starts at, by how many days of trail are shown.
const SPEED_FOR_DAYS = [
  [1, 300],
  [7, 1800],
  [Infinity, 7200],
];

/**
 * The replay controls of the map's trails: a timeline to drag, play and
 * pause, a speed, whether to skip the time in which nothing happened and
 * whether the map should follow the player.
 * Dispatches "replay-change" with `{time, follow}`: the time to show the
 * trails at (unix seconds), or null when the replay is closed and the map is
 * live again; `follow` when the map should keep the player in view, which it
 * is asked to whenever a time is looked up or played, not when the replay
 * opens or the trails grow.
 *
 * `setTimeline({tMin, tMax, ticks})` gives it the span of the trails and the
 * moments to mark; `nextChange(time)`, when set, says when something next
 * happens on the trails.
 */
export class TrailScrubber extends BaseElement {
  constructor() {
    super();
    this.clock = new ReplayClock();
    this.timeline = { tMin: null, tMax: null, ticks: [] };
    this.nextChange = null;
    this.follow = wantsFollow();
  }

  html() {
    return `{{trail-scrubber.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.render();
    this.playButton = this.querySelector(".trail-scrubber__play");
    this.range = this.querySelector(".trail-scrubber__range");
    this.ticks = this.querySelector(".trail-scrubber__ticks");
    this.timeLabel = this.querySelector(".trail-scrubber__time");
    this.speedSelect = this.querySelector(".trail-scrubber__speed");
    this.skipInput = this.querySelector(".trail-scrubber__skip input");
    this.followInput = this.querySelector(".trail-scrubber__follow input");
    this.speedSelect.value = String(this.clock.speed);
    this.followInput.checked = this.follow;

    this.eventListener(this.playButton, "click", () => this.togglePlaying());
    this.eventListener(this.range, "input", () => this.seek(Number(this.range.value)));
    this.eventListener(this.querySelector(".trail-scrubber__close"), "click", () => this.close());
    this.eventListener(this, "change", this.handleChange.bind(this));
    this.eventListener(this, "keydown", this.handleKeyDown.bind(this), { passive: false });
    this.frame = this.frame.bind(this);
    this.show();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.stopFrames();
  }

  get isOpen() {
    return !this.hidden;
  }

  /** Shows the controls, paused at the end of the trails: what the map shows anyway. */
  open() {
    if (this.timeline.tMin === null) return;
    this.hidden = false;
    this.clock.pause();
    this.clock.seek(this.clock.tMax);
    // Dragging the map only let go of the player for the replay it happened in.
    this.setFollow(wantsFollow());
    this.show();
    this.emit(false);
  }

  /** Hides the controls and lets the map show the trails live again. */
  close() {
    const wasOpen = this.isOpen;
    this.clock.pause();
    this.stopFrames();
    this.hidden = true;
    this.show();
    if (wasOpen) this.dispatchEvent(new CustomEvent("replay-change", { detail: { time: null, follow: false } }));
  }

  setTimeline(timeline) {
    this.timeline = timeline;
    if (timeline.tMin === null) {
      this.close();
      return;
    }
    const before = this.clock.time;
    this.clock.setRange(timeline.tMin, timeline.tMax);
    this.renderTicks();
    this.show();
    if (this.isOpen && this.clock.time !== before) this.emit(false);
  }

  /** Switches following on or off for this replay, as dragging the map does. */
  setFollow(follow) {
    this.follow = follow;
    if (this.followInput) this.followInput.checked = follow;
  }

  /** Picks the speed that suits a trail of this many days. */
  setWindowDays(days) {
    this.clock.speed = SPEED_FOR_DAYS.find(([upTo]) => days <= upTo)[1];
    if (this.speedSelect) this.speedSelect.value = String(this.clock.speed);
  }

  seek(time) {
    this.clock.seek(time);
    this.show();
    this.emit();
  }

  togglePlaying() {
    if (this.clock.playing) {
      this.clock.pause();
      this.stopFrames();
    } else {
      this.clock.play();
      this.lastFrame = performance.now();
      this.frameRequest = window.requestAnimationFrame(this.frame);
      this.emit();
    }
    this.show();
  }

  frame(now) {
    this.frameRequest = null;
    if (this.clock.tick(now - this.lastFrame, this.nextChange)) this.emit();
    this.lastFrame = now;
    this.show();
    if (this.clock.playing) this.frameRequest = window.requestAnimationFrame(this.frame);
  }

  stopFrames() {
    if (this.frameRequest) window.cancelAnimationFrame(this.frameRequest);
    this.frameRequest = null;
  }

  handleChange(event) {
    if (event.target === this.speedSelect) this.clock.speed = Number(this.speedSelect.value);
    if (event.target === this.skipInput) this.clock.skipIdle = this.skipInput.checked;
    if (event.target === this.followInput) {
      // Chosen by hand, so it holds for the next replay too.
      this.follow = this.followInput.checked;
      try {
        localStorage.setItem(FOLLOW_KEY, String(this.follow));
      } catch {
        // Not remembered in private mode.
      }
      if (this.follow && this.isOpen) this.emit();
    }
  }

  handleKeyDown(event) {
    // Space on the slider or K anywhere in the controls, as in video players.
    const space = event.key === " " && event.target === this.range;
    if (!space && event.key.toLowerCase() !== "k") return;
    event.preventDefault();
    this.togglePlaying();
  }

  emit(follow = this.follow) {
    this.dispatchEvent(new CustomEvent("replay-change", { detail: { time: this.clock.time, follow } }));
  }

  /** Brings the controls in line with the clock. */
  show() {
    if (!this.range) return;
    const { tMin, tMax, time, playing } = this.clock;
    this.range.min = String(tMin);
    this.range.max = String(tMax);
    this.range.value = String(Math.round(time));
    const label = formatTrailTime(time, time);
    this.timeLabel.textContent = label;
    this.range.setAttribute("aria-valuetext", label);
    this.playButton.classList.toggle("trail-scrubber__play--playing", playing);
    this.playButton.setAttribute("aria-label", playing ? "Pause" : "Play");
  }

  renderTicks() {
    if (!this.ticks) return;
    const { tMin, tMax, ticks } = this.timeline;
    const span = Math.max(tMax - tMin, 1);
    // Deaths go last, so they are kept when there are too many to show.
    const shown = ticks
      .slice()
      .sort((a, b) => Number(a.kind === "death") - Number(b.kind === "death"))
      .slice(-MAX_TICKS);
    this.ticks.replaceChildren(
      ...shown
        .sort((a, b) => a.t - b.t)
        .map((tick) => {
          const mark = document.createElement("span");
          mark.className = `trail-scrubber__tick trail-scrubber__tick--${tick.kind}`;
          mark.style.left = `${((tick.t - tMin) / span) * 100}%`;
          mark.style.setProperty("--player-color", tick.color);
          return mark;
        })
    );
  }
}

/** Whether the map follows the player in a replay, unless that was switched off by hand. */
function wantsFollow() {
  try {
    return localStorage.getItem(FOLLOW_KEY) !== "false";
  } catch {
    return true;
  }
}

customElements.define("trail-scrubber", TrailScrubber);
