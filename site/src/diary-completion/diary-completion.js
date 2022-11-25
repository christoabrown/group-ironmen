import { BaseElement } from "../base-element/base-element";

export class DiaryCompletion extends BaseElement {
  constructor() {
    super();
  }

  html() {
    return `{{diary-completion.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.playerName = this.getAttribute("player-name");
    this.diaryName = this.getAttribute("diary-name");
    const tierCompletions = {
      Easy: {
        total: 0,
        complete: 0,
      },
      Medium: {
        total: 0,
        complete: 0,
      },
      Hard: {
        total: 0,
        complete: 0,
      },
      Elite: {
        total: 0,
        complete: 0,
      },
    };

    for (const [tierName, completionState] of Object.entries(tierCompletions)) {
      const tierData = this.diaryCompletion[tierName];
      for (const completed of tierData) {
        ++completionState.total;
        if (completed) {
          ++completionState.complete;
        }
      }
    }

    this.tierCompletions = tierCompletions;
    this.total =
      tierCompletions.Easy.total +
      tierCompletions.Medium.total +
      tierCompletions.Hard.total +
      tierCompletions.Elite.total;
    this.totalComplete =
      tierCompletions.Easy.complete +
      tierCompletions.Medium.complete +
      tierCompletions.Hard.complete +
      tierCompletions.Elite.complete;
    this.render();

    this.eventListener(this, "click", this.openDiaryDialog.bind(this));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  openDiaryDialog() {
    const diaryDialogEl = document.createElement("diary-dialog");
    diaryDialogEl.setAttribute("player-name", this.playerName);
    diaryDialogEl.setAttribute("diary-name", this.diaryName);
    document.body.appendChild(diaryDialogEl);
  }
}

customElements.define("diary-completion", DiaryCompletion);
