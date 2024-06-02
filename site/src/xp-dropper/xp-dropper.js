import { BaseElement } from "../base-element/base-element";

export class XpDropper extends BaseElement {
  constructor() {
    super();
  }

  html() {
    return `{{xp-dropper.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    const playerName = this.getAttribute("player-name");
    this.render();
    this.subscribe(`xp:${playerName}`, this.handleNewXpDrops.bind(this));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  handleNewXpDrops(xpDrops) {
    let dropsHtml = "";
    for (const drop of xpDrops) {
      dropsHtml += `<div><img class="xp-droppper__skill-icon" src="${drop.icon}" />+${drop.xp}</div>`;
    }
    const dropContainer = document.createElement("div");
    dropContainer.classList.add("xp-dropper__drop");
    dropContainer.innerHTML = dropsHtml;
    dropContainer.style.paddingTop = this.offsetHeight + "px";
    dropContainer.addEventListener("animationend", () => dropContainer.remove());
    this.appendChild(dropContainer);
  }
}
customElements.define("xp-dropper", XpDropper);
