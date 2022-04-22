import { BaseElement } from "../base-element/base-element";

export class BasePage extends BaseElement {
  constructor() {
    super();
    this.active = false;
  }

  connectedCallback() {
    super.connectedCallback();
    this.active = true;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.active = false;
  }
}
