import { BaseElement } from "../base-element/base-element";
import { appearance } from "../appearance";
import { describeEvent } from "../data/hub-format";
import { eventIconUrl, eventKind, eventTier } from "../data/event-view";

// How long a toast stays, and a big drop.
export const TOAST_MS = 8000;

export const TOAST_NOTABLE_MS = 15000;

export const TOAST_MAX = 4;

// The time a toast takes to fade out once it is done.
export const TOAST_LEAVE_MS = 250;

/**
 * Hub events as they happen, stacked in the corner of the map page: `show(event,
 * {color})` adds one, which goes away by itself. Holds on to them all while
 * the pointer is over one. Dispatches "toast-activated" with `{event}` when
 * one is clicked.
 */
export class EventToasts extends BaseElement {
  constructor() {
    super();
    this.toasts = [];
    this.held = false;
  }

  connectedCallback() {
    super.connectedCallback();
    this.setAttribute("aria-live", "polite");
    // The roster takes this corner when the settings dock it to the right.
    this.classList.toggle("event-toasts--roster-right", appearance.getLayout() === "row-reverse");
    this.eventListener(this, "click", this.handleClick.bind(this));
    this.eventListener(this, "mouseenter", () => this.hold(true));
    this.eventListener(this, "mouseleave", () => this.hold(false));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    for (const toast of this.toasts) window.clearTimeout(toast.timer);
    for (const timer of this.leaving || []) window.clearTimeout(timer);
    this.toasts = [];
    this.leaving = null;
    this.held = false;
    this.replaceChildren();
  }

  show(event, { color = null } = {}) {
    if (!this.isConnected || this.toasts.some((toast) => toast.event.id === event.id)) return;
    const tier = eventTier(event);
    const element = document.createElement("button");
    element.type = "button";
    element.className = `event-toasts__toast event-toasts__toast--${
      eventKind(event) || "other"
    } rsborder-tiny rsbackground`;
    if (tier) element.classList.add(`event-toasts__toast--tier-${tier}`);
    if (color) element.style.setProperty("--member-color", color);

    const iconUrl = eventIconUrl(event);
    if (iconUrl) {
      const icon = document.createElement("img");
      icon.className = "event-toasts__icon";
      icon.alt = "";
      icon.src = iconUrl;
      element.appendChild(icon);
    }
    const text = document.createElement("span");
    text.className = "event-toasts__text";
    text.textContent = describeEvent(event);
    element.appendChild(text);

    const toast = { event, element, remaining: tier === 2 ? TOAST_NOTABLE_MS : TOAST_MS, timer: null, since: 0 };
    this.toasts.push(toast);
    this.appendChild(element);
    while (this.toasts.length > TOAST_MAX) this.dismiss(this.toasts[0], { now: true });
    if (!this.held) this.run(toast);
  }

  run(toast) {
    toast.since = Date.now();
    toast.timer = window.setTimeout(() => this.dismiss(toast), toast.remaining);
  }

  /** Stops the toasts from going away (the pointer is over them), or lets them go on. */
  hold(held) {
    if (held === this.held) return;
    this.held = held;
    for (const toast of this.toasts) {
      if (held) {
        window.clearTimeout(toast.timer);
        toast.timer = null;
        toast.remaining = Math.max(toast.remaining - (Date.now() - toast.since), 0);
      } else {
        this.run(toast);
      }
    }
  }

  /** Takes a toast away: fading out, or at once (`now`) when it has to make room. */
  dismiss(toast, { now = false } = {}) {
    const index = this.toasts.indexOf(toast);
    if (index === -1) return;
    this.toasts.splice(index, 1);
    window.clearTimeout(toast.timer);
    if (now) {
      toast.element.remove();
      return;
    }
    toast.element.classList.add("event-toasts__toast--leaving");
    if (!this.leaving) this.leaving = new Set();
    const timer = window.setTimeout(() => {
      this.leaving?.delete(timer);
      toast.element.remove();
    }, TOAST_LEAVE_MS);
    this.leaving.add(timer);
  }

  handleClick(event) {
    const element = event.target.closest(".event-toasts__toast");
    const toast = this.toasts.find((candidate) => candidate.element === element);
    if (!toast) return;
    this.dismiss(toast, { now: true });
    this.dispatchEvent(new CustomEvent("toast-activated", { detail: { event: toast.event } }));
  }
}

customElements.define("event-toasts", EventToasts);
