import { BaseElement } from "../base-element/base-element";

export class WrapRoutes extends BaseElement {
  constructor() {
    super();
  }

  html() {
    return `{{wrap-routes.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.template = this.querySelector("template");
    this.path = this.getAttribute("route-path");
    this.active = false;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  enable() {
    if (!this.active) {
      this.active = true;
      this.appendChild(this.template.cloneNode(true).content);
      this.style.display = "flex";
    }
  }

  disable() {
    if (this.active) {
      this.active = false;
      this.innerHTML = "";
      this.style.display = "none";
    }
  }
}

customElements.define("wrap-routes", WrapRoutes);
