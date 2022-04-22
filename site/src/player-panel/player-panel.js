import { BaseElement } from "../base-element/base-element";

export class PlayerPanel extends BaseElement {
  constructor() {
    super();
  }

  html() {
    return `{{player-panel.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.playerName = this.getAttribute("player-name");
    this.render();
    this.contentArea = this.querySelector(".player-panel__content");
    this.eventListener(this.querySelector(".player-panel__minibar"), "click", this.handleMiniBarClick.bind(this));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  handleMiniBarClick(event) {
    const component = event.target.getAttribute("data-component");
    if (component && this.activeComponent !== component) {
      this.contentArea.innerHTML = `<${component} player-name="${this.playerName}"></${component}>`;

      if (this.activeComponent) {
        this.querySelector(`button[data-component="${this.activeComponent}"]`).classList.remove(
          "player-panel__tab-active"
        );
      }
      this.querySelector(`button[data-component="${component}"]`).classList.add("player-panel__tab-active");
      this.activeComponent = component;
    } else if (this.activeComponent && this.activeComponent === component) {
      this.contentArea.innerHTML = "";
      this.querySelector(`button[data-component="${this.activeComponent}"]`).classList.remove(
        "player-panel__tab-active"
      );
      this.activeComponent = null;
    }
  }
}
customElements.define("player-panel", PlayerPanel);
