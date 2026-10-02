import { BaseElement } from "../base-element/base-element";
import { api } from "../data/api";

/**
 * Signing in goes through Discord: the button asks the server where to go and
 * sends the browser there. Discord sends it back to /login/discord (see
 * discord-callback), where the hub's verdict comes in.
 */
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
    this.button = this.querySelector(".login__discord-button");
    this.error = this.querySelector(".login__error");
    this.eventListener(this.button, "click", this.login.bind(this));
  }

  async login() {
    this.error.textContent = "";
    this.button.disabled = true;
    try {
      const { auth_url } = await api.discordStart();
      window.location.assign(auth_url);
    } catch (error) {
      this.error.textContent = `Unable to log in: ${error.message}`;
      this.button.disabled = false;
    }
  }
}

customElements.define("login-page", LoginPage);
