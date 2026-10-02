import { BaseElement } from "../base-element/base-element";
import { session } from "../data/session";
import { api } from "../data/api";

/**
 * Where Discord sends the browser back to after signing in there. The server
 * finishes it: it asks the hub whether this Discord account is a member, and
 * answers with who signed in or with why not.
 */
export class DiscordCallback extends BaseElement {
  constructor() {
    super();
  }

  html() {
    return `{{discord-callback.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.render();
    this.handleCallback();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  /** Says why signing in didn't work, with a way back to try again. */
  fail(message) {
    this.querySelector(".discord-callback__message").textContent = "";
    this.querySelector(".discord-callback__error").textContent = message;
    this.querySelector(".discord-callback__retry").hidden = false;
  }

  async handleCallback() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");

    if (!code) {
      const errorMsg = params.get("error_description") || params.get("error") || "No authorization code received";
      this.fail(`Discord login failed: ${errorMsg}`);
      return;
    }

    try {
      const response = await api.discordCallback(code, state);
      if (response.ok) {
        session.set(await response.json());
        window.history.pushState("", "", "/guild");
      } else {
        this.fail((await response.text()) || "Discord login failed");
      }
    } catch (error) {
      this.fail(`Discord login failed: ${error}`);
    }
  }
}

customElements.define("discord-callback", DiscordCallback);
