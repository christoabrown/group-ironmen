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
    const top = Math.max(0, y - this.height);
    let left = x + 2;
    if (left >= document.body.clientWidth / 2) {
      left -= this.offsetWidth + 2;
    }

    this.style.transform = `translate(${left}px, ${top}px)`;
  }

  showTooltip(tooltipText) {
    this.tooltipText = tooltipText;
    this.eventListener(document.body, "mousemove", this.updatePosition.bind(this));
    this.render();
    this.height = this.offsetHeight;
  }

  hideTooltip() {
    this.tooltipText = null;
    this.unbindEvents();
    this.render();
  }
}
customElements.define("rs-tooltip", RsTooltip);
