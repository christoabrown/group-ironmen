import { BaseElement } from "../base-element/base-element";

export class SocialLinks extends BaseElement {
  constructor() {
    super();
  }

  html() {
    return `{{social-links.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.render();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }
}

customElements.define("social-links", SocialLinks);
