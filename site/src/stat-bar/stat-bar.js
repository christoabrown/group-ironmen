import { BaseElement } from "../base-element/base-element";

export class StatBar extends BaseElement {
  constructor() {
    super();
  }

  html() {
    return `{{stat-bar.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.render();
    this.canvas = this.querySelector("canvas");
    this.color = this.hexToRgb(this.getAttribute("bar-color"));
    this.bgColor = this.darkenColor(this.color);
    this.ctx = this.canvas.getContext("2d", { alpha: false });
    this.resizeObserver = new ResizeObserver(this.handleContainerSizeChanged.bind(this));
    this.resizeObserver.observe(this);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.resizeObserver.disconnect();
    this.resizeObserver = null;
  }

  hexToRgb(hex) {
    // Expand shorthand form (e.g. "03F") to full form (e.g. "0033FF")
    var shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    hex = hex.replace(shorthandRegex, function (m, r, g, b) {
      return r + r + g + g + b + b;
    });

    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : null;
  }

  darkenColor(color) {
    const d = 3.0;
    return {
      r: Math.round(color.r / d),
      g: Math.round(color.g / d),
      b: Math.round(color.b / d),
    };
  }

  handleContainerSizeChanged() {
    this.updateSize();
  }

  updateSize() {
    const scaleX = this.clientWidth / this.canvas.width;
    const scaleY = this.clientHeight / this.canvas.height;
    this.canvas.style.transform = `scale(${scaleX}, ${scaleY})`;
  }

  update(ratio) {
    const width = Math.round(ratio * this.canvas.width);
    if (width === this.lastDrawnWidth) return;
    this.lastDrawnWidth = width;

    this.ctx.fillStyle = `rgb(${this.bgColor.r}, ${this.bgColor.g}, ${this.bgColor.b})`;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.fillStyle = `rgb(${this.color.r}, ${this.color.g}, ${this.color.b})`;
    this.ctx.fillRect(0, 0, width, this.canvas.height);
  }
}

customElements.define("stat-bar", StatBar);
