import { BaseElement } from "../base-element/base-element";
import { storage } from "../data/storage";
import { api } from "../data/api";

export class LoginPage extends BaseElement {
  constructor() {
    super();
  }

  html() {
    return `{{login-page.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.render();

    const fieldRequiredValidator = (value) => {
      if (value.length === 0) {
        return "This field is required.";
      }
    };
    this.name = this.querySelector(".login__name");
    this.name.validators = [fieldRequiredValidator];
    this.token = this.querySelector(".login__token");
    this.token.validators = [fieldRequiredValidator];
    this.loginButton = this.querySelector(".login__button");
    this.error = this.querySelector(".login__error");
    this.eventListener(this.loginButton, "click", this.login.bind(this));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  async login() {
    if (!this.name.valid || !this.token.valid) return;
    try {
      this.error.innerHTML = "";
      this.loginButton.disabled = true;
      const name = this.name.value;
      const token = this.token.value;
      api.setCredentials(name, token);
      const response = await api.amILoggedIn();
      if (response.ok) {
        storage.storeGroup(name, token);
        window.history.pushState("", "", "/group");
      } else {
        if (response.status === 401) {
          this.error.innerHTML = "Group name or token is incorrect";
        } else {
          const body = await response.text();
          this.error.innerHTML = `Unable to login ${body}`;
        }
      }
    } catch (error) {
      this.error.innerHTML = `Unable to login ${error}`;
    } finally {
      this.loginButton.disabled = false;
    }
  }
}

customElements.define("login-page", LoginPage);
