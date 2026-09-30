import { BaseElement } from "../base-element/base-element";
import { api } from "../data/api";
import { storage } from "../data/storage";

export class SetupPage extends BaseElement {
  constructor() {
    super();
  }

  html() {
    return `{{setup-page.html}}`;
  }

  async connectedCallback() {
    super.connectedCallback();

    // Check if setup is actually needed
    try {
      const status = await api.getSetupStatus();
      if (!status.needs_setup) {
        window.history.pushState("", "", "/login");
        return;
      }
    } catch (e) {
      // Continue to render setup page
    }

    this.render();

    const fieldRequiredValidator = (value) => {
      if (value.length === 0) return "This field is required.";
    };

    this.usernameInput = this.querySelector(".setup-page__username");
    this.usernameInput.validators = [
      fieldRequiredValidator,
      (value) => {
        if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
          return "Username may only contain letters, numbers, underscores, and hyphens.";
        }
      },
    ];

    this.passwordInput = this.querySelector(".setup-page__password");
    this.passwordInput.validators = [
      fieldRequiredValidator,
      (value) => {
        if (value.length < 8) return "Password must be at least 8 characters.";
      },
    ];

    this.passwordConfirmInput = this.querySelector(".setup-page__password-confirm");
    this.passwordConfirmInput.validators = [fieldRequiredValidator];

    this.submitButton = this.querySelector(".setup-page__submit");
    this.error = this.querySelector(".setup-page__error");
    this.eventListener(this.submitButton, "click", this.handleSubmit.bind(this));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  async handleSubmit() {
    if (!this.usernameInput.valid || !this.passwordInput.valid || !this.passwordConfirmInput.valid) {
      return;
    }

    if (this.passwordInput.value !== this.passwordConfirmInput.value) {
      this.error.innerHTML = "Passwords do not match";
      return;
    }

    this.error.innerHTML = "";
    this.submitButton.disabled = true;

    try {
      const response = await api.setup(this.usernameInput.value, this.passwordInput.value);
      if (response.ok) {
        const data = await response.json();
        storage.storeSession(data.session_token, data.username, data.role);
        api.setSession(data.session_token, data.username, data.role);
        window.history.pushState("", "", "/group");
      } else {
        const body = await response.text();
        this.error.innerHTML = `Error: ${body}`;
      }
    } catch (e) {
      this.error.innerHTML = `Error: ${e}`;
    } finally {
      this.submitButton.disabled = false;
    }
  }
}

customElements.define("setup-page", SetupPage);
