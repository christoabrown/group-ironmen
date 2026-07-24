import { BaseElement } from "../base-element/base-element";

export class RsTooltip extends BaseElement {
  constructor() {
    super();
  }

  html() {
    if (this.tooltipText) {
      this.style.display = "block";
      return `{{rs-tooltip.html}}`;
    } else {
      this.style.display = "none";
      return "";
    }
  }

  connectedCallback() {
    super.connectedCallback();
    this.render();
    RsTooltip.globalTooltip = this;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  updatePosition(mouseEvent) {
    const x = mouseEvent.clientX;
    const y = mouseEvent.clientY;
    const tooltipWidth = this.offsetWidth;
    const tooltipHeight = this.offsetHeight;
    const viewportWidth = document.body.clientWidth;
    const viewportHeight = window.innerHeight;
    const top = Math.max(0, Math.min(y - tooltipHeight, viewportHeight - tooltipHeight));
    let left = x + 2;
    if (left + tooltipWidth > viewportWidth) {
      left = x - tooltipWidth - 2;
    }
    left = Math.max(0, Math.min(left, viewportWidth - tooltipWidth));

    this.style.transform = `translate(${left}px, ${top}px)`;
  }

  showTooltip(tooltipText, mouseEvent) {
    this.tooltipText = tooltipText;
    this.eventListener(document.body, "mousemove", this.updatePosition.bind(this));
    this.render();
    if (mouseEvent) {
      this.updatePosition(mouseEvent);
    }
  }

  hideTooltip() {
    this.tooltipText = null;
    this.unbindEvents();
    this.render();
  }
}
customElements.define("rs-tooltip", RsTooltip);
