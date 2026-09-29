import { BaseElement } from "../base-element/base-element";
import { storage } from "../data/storage";
import { api } from "../data/api";

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

  async handleCallback() {
    const errorEl = this.querySelector(".discord-callback__error");
    const messageEl = this.querySelector(".discord-callback__message");

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");

    if (!code) {
      const errorMsg = params.get("error_description") || params.get("error") || "No authorization code received";
      if (messageEl) messageEl.textContent = "";
      if (errorEl) errorEl.textContent = `Discord login failed: ${errorMsg}`;
      return;
    }

    try {
      const response = await api.discordCallback(code, state);
      if (response.ok) {
        const data = await response.json();
        storage.storeSession(data.session_token, data.username, data.role);
        api.setSession(data.session_token, data.username, data.role);
        window.history.pushState("", "", "/group");
      } else {
        const body = await response.text();
        if (messageEl) messageEl.textContent = "";
        if (errorEl) errorEl.textContent = body || "Discord login failed";
      }
    } catch (error) {
      if (messageEl) messageEl.textContent = "";
      if (errorEl) errorEl.textContent = `Discord login failed: ${error}`;
    }
  }
}

customElements.define("discord-callback", DiscordCallback);
