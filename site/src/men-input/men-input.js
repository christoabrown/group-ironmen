import { BaseElement } from "../base-element/base-element";

export class MenInput extends BaseElement {
  constructor() {
    super();
  }

  html() {
    const id = this.getAttribute("input-id");
    const placeholder = this.getAttribute("placeholder-text");
    const label = this.getAttribute("input-label");
    const isPassword = this.hasAttribute("type-password");
    const maxLength = parseInt(this.getAttribute("max-length")) || 16;
    return `{{men-input.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.render();

    this.input = this.querySelector("input");
    const initialValue = this.getAttribute("input-value")?.trim();
    if (initialValue) {
      this.input.value = initialValue;
    }
    this.validationError = this.querySelector(".validation-error");
    this.eventListener(this.input, "blur", this.handleBlurEvent.bind(this));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  handleBlurEvent() {
    this.updateValueAndValidity();
  }

  makeInvalid(invalidReason) {
    this.input.classList.add("invalid");
    this.validationError.innerHTML = invalidReason;
  }

  makeValid() {
    this.input.classList.remove("invalid");
    this.validationError.innerHTML = "";
  }

  get value() {
    return this.input.value.trim();
  }

  get valid() {
    return this.updateValueAndValidity();
  }

  updateValueAndValidity() {
    this.input.value = this.input.value.trim();
    if (this.validators) {
      for (const validator of this.validators) {
        const invalidReason = validator(this.input.value);

        if (invalidReason) {
          this.makeInvalid(invalidReason);
          return false;
        }
      }
    }

    this.makeValid();
    return true;
  }
}

customElements.define("men-input", MenInput);
