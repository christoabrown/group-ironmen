import { BaseElement } from "../base-element/base-element";
import { appearance } from "../appearance";
import { selection } from "../data/selection";

/**
 * The drawer that shows the selected player. It sits on the side opposite the
 * roster, and covers the screen on narrow ones. The content for one player is
 * a `player-profile-view`, replaced when another player is selected.
 */
export class PlayerProfile extends BaseElement {
  constructor() {
    super();
  }

  html() {
    return `{{player-profile.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.render();
    this.content = this.querySelector(".player-profile__content");
    this.hidden = true;
    this.subscribe("player-selected", this.handleSelected.bind(this));
    this.subscribe("members-updated", this.handleMembersUpdated.bind(this));
    this.eventListener(document, "keydown", (event) => {
      if (event.key === "Escape" && !this.hidden) selection.clear();
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.body.classList.remove("profile-open", "profile-open-left");
  }

  handleSelected(selected) {
    const name = selected?.name;
    if (!name) {
      this.hidden = true;
      this.content.replaceChildren();
      this.currentName = null;
      document.body.classList.remove("profile-open", "profile-open-left");
      return;
    }
    // The roster is on the left unless the settings dock it to the right.
    const left = appearance.getLayout() === "row-reverse";
    this.classList.toggle("player-profile--left", left);
    // Pages keep their controls clear of the drawer.
    document.body.classList.toggle("profile-open", !left);
    document.body.classList.toggle("profile-open-left", left);
    this.hidden = false;
    if (this.currentName === name) return;
    this.currentName = name;
    const view = document.createElement("player-profile-view");
    view.setAttribute("player-name", name);
    this.content.replaceChildren(view);
  }

  handleMembersUpdated(members) {
    if (this.currentName && !members.some((member) => member.name === this.currentName)) {
      selection.clear();
    }
  }
}

customElements.define("player-profile", PlayerProfile);
