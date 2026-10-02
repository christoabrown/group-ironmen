import { BaseElement } from "../base-element/base-element";

export class AppLink extends BaseElement {
  constructor() {
    super();
  }

  html() {
    this.href = this.getAttribute("link-href");
    return `{{app-link.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.render();
    this.eventListener(this.querySelector("a"), "click", this.navigate.bind(this), { passive: false });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  navigate(evt) {
    evt.preventDefault();
    window.history.pushState("", "", this.href);
  }
}

customElements.define("app-link", AppLink);
