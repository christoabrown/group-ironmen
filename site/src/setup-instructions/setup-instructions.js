import { BaseElement } from "../base-element/base-element";
import { api } from "../data/api";

export class SetupInstructions extends BaseElement {
  constructor() {
    super();
    this.codeExpiryTimer = null;
    this.codeExpiresAt = null;
  }

  html() {
    return `{{setup-instructions.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.render();
    this.eventListener(this.querySelector(".setup__pair-btn"), "click", this.handleGenerateCode.bind(this));
    this.showDataSource();
  }

  async showDataSource() {
    const features = await api.loadFeatures();
    if (!this.isConnected) return;
    for (const block of this.querySelectorAll(".setup__direct")) {
      block.hidden = !features.direct_pairing;
    }
    for (const block of this.querySelectorAll(".setup__hub")) {
      block.hidden = features.data_source !== "hub" && features.data_source !== "both";
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.clearExpiryTimer();
  }

  clearExpiryTimer() {
    if (this.codeExpiryTimer) {
      clearInterval(this.codeExpiryTimer);
      this.codeExpiryTimer = null;
    }
  }

  startExpiryTimer(expiresInSeconds) {
    this.clearExpiryTimer();
    this.codeExpiresAt = Date.now() + expiresInSeconds * 1000;

    const btn = this.querySelector(".setup__pair-btn");
    const timer = this.querySelector(".setup__pair-timer");

    const updateTimer = () => {
      const remaining = Math.max(0, Math.ceil((this.codeExpiresAt - Date.now()) / 1000));
      if (remaining <= 0) {
        this.clearExpiryTimer();
        timer.textContent = "";
        btn.disabled = false;
        btn.textContent = "Generate Pairing Code";
        this.querySelector(".setup__pair-result").textContent = "";
        this.codeExpiresAt = null;
        return;
      }
      const minutes = Math.floor(remaining / 60);
      const seconds = remaining % 60;
      timer.textContent = `(expires in ${minutes}:${seconds.toString().padStart(2, "0")})`;
    };

    updateTimer();
    this.codeExpiryTimer = setInterval(updateTimer, 1000);
  }

  async handleGenerateCode() {
    const btn = this.querySelector(".setup__pair-btn");
    const result = this.querySelector(".setup__pair-result");
    const error = this.querySelector(".setup__pair-error");
    const timer = this.querySelector(".setup__pair-timer");

    // Prevent generating while a code is still active
    if (this.codeExpiresAt && Date.now() < this.codeExpiresAt) {
      return;
    }

    btn.disabled = true;
    btn.textContent = "Generating...";
    error.textContent = "";
    result.textContent = "";
    timer.textContent = "";

    try {
      const response = await api.generatePairingCode();

      if (!response.ok) {
        const message = await response.text();
        error.textContent = `Error: ${message}`;
        btn.disabled = false;
        btn.textContent = "Generate Pairing Code";
      } else {
        const data = await response.json();
        result.textContent = data.code;
        this.startExpiryTimer(data.expires_in || 300);
      }
    } catch (e) {
      error.textContent = "Failed to generate pairing code.";
      btn.disabled = false;
      btn.textContent = "Generate Pairing Code";
    }
  }
}

customElements.define("setup-instructions", SetupInstructions);
