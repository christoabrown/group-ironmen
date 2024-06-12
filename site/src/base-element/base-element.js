import { pubsub } from "../data/pubsub";
import { tooltipManager } from "../rs-tooltip/tooltip-manager";

export class BaseElement extends HTMLElement {
  constructor() {
    super();
    this.eventUnbinders = new Set();
    this.eventListeners = new Map();
  }

  connectedCallback() {}

  disconnectedCallback() {
    this.unbindEvents();
    if (this.showingTooltip) {
      this.showingTooltip = false;
      tooltipManager.hideTooltip();
    }
  }

  enableTooltip() {
    this.eventListener(this, "mouseover", this.handleMouseOver.bind(this));
    this.eventListener(this, "mouseout", this.handleMouseOut.bind(this));
  }

  updateTooltip(tooltipText) {
    this.tooltipText = tooltipText;
    if (this.showingTooltip) {
      tooltipManager.showTooltip(tooltipText);
    }
  }

  handleMouseOver(mouseEvent) {
    const tooltipText = this.tooltipText || this.getAttribute("tooltip-text");
    if (tooltipText) {
      this.showingTooltip = true;
      this.updateTooltip(tooltipText.trim());
      mouseEvent.stopPropagation();
    }
  }

  handleMouseOut() {
    this.showingTooltip = false;
    tooltipManager.hideTooltip();
  }

  unbindEvents() {
    this.eventUnbinders.forEach((eventUnbinder) => {
      eventUnbinder();
    });
    this.eventUnbinders = new Set();
    this.eventListeners = new Map();
  }

  eventListener(subject, eventName, handler, options = {}) {
    if (!this.isConnected) return;
    if (!this.eventListeners.has(subject)) this.eventListeners.set(subject, new Set());
    if (!this.eventListeners.get(subject).has(eventName)) {
      this.eventListeners.get(subject).add(eventName);
      subject.addEventListener(
        eventName,
        handler,
        Object.assign(
          {
            passive: true,
          },
          options
        )
      );
      this.eventUnbinders.add(() => subject.removeEventListener(eventName, handler));
    }
  }

  subscribe(dataName, handler) {
    if (!this.isConnected) return;
    pubsub.subscribe(dataName, handler);
    this.eventUnbinders.add(() => pubsub.unsubscribe(dataName, handler));
  }

  subscribeOnce(dataName, _handler) {
    let handler = (...args) => {
      if (this.eventUnbinders.has(unbinder)) {
        this.eventUnbinders.delete(unbinder);
        unbinder();
      }
      _handler(...args);
    };
    let unbinder = () => pubsub.unsubscribe(dataName, handler);
    this.eventUnbinders.add(unbinder);
    pubsub.subscribe(dataName, handler);
  }

  html() {
    return "";
  }

  render() {
    this.innerHTML = this.html();
  }
}
