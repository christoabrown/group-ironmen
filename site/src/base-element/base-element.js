import { pubsub } from "../data/pubsub";
import { tooltipManager } from "../rs-tooltip/tooltip-manager";

export class BaseElement extends HTMLElement {
  constructor() {
    super();
    this.eventUnbinders = [];
    this.eventListeners = new Map();
  }

  connectedCallback() {}

  disconnectedCallback() {
    this.unbindEvents();
  }

  enableTooltip() {
    this.eventListener(this, "mouseover", this.handleMouseOver.bind(this));
    this.eventListener(this, "mouseout", this.handleMouseOut.bind(this));
  }

  updateTooltip(tooltipText) {
    this.setAttribute("tooltip-text", tooltipText);
    if (this.showingTooltip) {
      tooltipManager.showTooltip(tooltipText);
    }
  }

  handleMouseOver(mouseEvent) {
    const tooltipText = this.getAttribute("tooltip-text");
    if (tooltipText) {
      this.showingTooltip = true;
      this.updateTooltip(tooltipText.trim());
      mouseEvent.stopPropagation();
    }
  }

  handleMouseOut(mouseEvent) {
    this.showingTooltip = false;
    tooltipManager.hideTooltip();
  }

  unbindEvents() {
    for (const eventUnbinder of this.eventUnbinders) {
      eventUnbinder();
    }
    this.eventUnbinders = [];
    this.eventListeners = new Map();
  }

  eventListener(subject, eventName, handler) {
    if (!this.eventListeners.has(subject)) this.eventListeners.set(subject, new Set());
    if (!this.eventListeners.get(subject).has(eventName)) {
      this.eventListeners.get(subject).add(eventName);
      subject.addEventListener(eventName, handler);
      this.eventUnbinders.push(() => subject.removeEventListener(eventName, handler));
    }
  }

  subscribe(dataName, handler) {
    pubsub.subscribe(dataName, handler);
    this.eventUnbinders.push(() => pubsub.unsubscribe(dataName, handler));
  }

  html() {
    return "";
  }

  render() {
    this.innerHTML = this.html();
  }
}
