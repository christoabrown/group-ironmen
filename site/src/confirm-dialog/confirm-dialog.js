import { BaseElement } from "../base-element/base-element";

export class ConfirmDialog extends BaseElement {
  constructor() {
    super();
  }

  html() {
    return `{{confirm-dialog.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  show(options) {
    this.headline = options.headline;
    this.body = options.body;
    this.render();

    const confirmYes = this.querySelector(".confirm-dialog__yes");
    const confirmNo = this.querySelector(".confirm-dialog__no");

    this.eventListener(confirmYes, "click", () => {
      this.unbindEvents();
      this.hide();
      options.yesCallback();
    });
    this.eventListener(confirmNo, "click", () => {
      this.unbindEvents();
      this.hide();
      options.noCallback();
    });

    this.classList.add("dialog__visible");
  }

  hide() {
    this.classList.remove("dialog__visible");
  }
}

customElements.define("confirm-dialog", ConfirmDialog);
