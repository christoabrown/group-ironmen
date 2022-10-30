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
    this.bgColor = this.darkenColor(this.hexToRgb(this.color));
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

  update(ratio) {
    const x = ratio * 100;
    // NOTE: Tried doing this using a canvas and a div with a scaled width, both of them would leave gaps between other
    // bars. This does not leave gaps.
    this.style.background = `linear-gradient(90deg, ${this.color}, ${x}%, rgb(${this.bgColor.r}, ${this.bgColor.g}, ${this.bgColor.b}) ${x}%)`;
  }
}

customElements.define("stat-bar", StatBar);
