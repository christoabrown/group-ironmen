import { BaseElement } from "../base-element/base-element";

export class PlayerDiaries extends BaseElement {
  constructor() {
    super();
  }

  html() {
    return `{{player-diaries.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.render();
    this.playerName = this.getAttribute("player-name");
    this.completionsEl = this.querySelector(".player-diaries__completions");
    this.subscribe(`diaries:${this.playerName}`, this.handleDiaries.bind(this));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  handleDiaries(playerDiaries) {
    const completionEls = document.createDocumentFragment();

    for (const [diaryName, diaryCompletion] of Object.entries(playerDiaries.completion)) {
      const el = document.createElement("diary-completion");
      el.setAttribute("diary-name", diaryName);
      el.setAttribute("player-name", this.playerName);
      el.diaryCompletion = diaryCompletion;
      completionEls.appendChild(el);
    }

    this.completionsEl.innerHTML = "";
    this.completionsEl.appendChild(completionEls);
  }
}

customElements.define("player-diaries", PlayerDiaries);
