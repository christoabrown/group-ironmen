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
    this.bar = this.querySelector(".stat-bar__current");
    this.color = this.getAttribute("bar-color");
    this.bgColor = this.getAttribute("bar-bgcolor");

    if (!this.bgColor && this.color.startsWith("#")) {
      const darkened = this.darkenColor(this.hexToRgb(this.color));
      this.bgColor = `rgb(${darkened.r}, ${darkened.g}, ${darkened.b})`;
    }

    if (this.color.startsWith("hsl")) {
      const [hue, saturation, lightness] = this.color.match(/\d+/g).map(Number);
      this.color = { hue, saturation, lightness };
    }

    const ratio = parseFloat(this.getAttribute("bar-ratio"), 10);
    if (!isNaN(ratio)) {
      this.update(ratio);
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
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

  getColor(ratio) {
    if (typeof this.color === "string") return this.color;

    const color = { ...this.color };
    color.hue = color.hue * ratio;
    return `hsl(${Math.round(color.hue)}, ${color.saturation}%, ${color.lightness}%)`;
  }

  update(ratio) {
    if (!this.isConnected) return;
    const x = ratio * 100;
    const color = this.getColor(ratio);
    // NOTE: Tried doing this using a canvas and a div with a scaled width, both of them would leave gaps between other
    // bars. This does not leave gaps.
    if (ratio === 1) {
      this.style.background = color;
    } else {
      this.style.background = `linear-gradient(90deg, ${color}, ${x}%, ${this.bgColor} ${x}%)`;
    }
  }
}

customElements.define("stat-bar", StatBar);
