import { BaseElement } from "../base-element/base-element";

export class SearchElement extends BaseElement {
  constructor() {
    super();
  }

  connectedCallback() {
    super.connectedCallback();

    // TODO: Find a better spot to put this information, I don't like
    // having a big tooltip show everytime I mouse over the search box.
    //     if (!this.classList.contains("player-quests__filter")) {
    //       this.enableTooltip();
    //       this.setAttribute(
    //         "tooltip-text",
    //         `
    // Some special filtering can be done by entering any of:
    // <ul>
    //   <li>Item ID</li>
    //   <li>| to search multiple items (i.e., ruby | sapphire | diamond)</li>
    //   <li>Double quotes "s to do exact searches (i.e., "ruby" will show ruby but not ruby necklace)</li>
    // </ul>
    // `
    //       );
    //     }
    this.render();
    this.searchInput = this.querySelector(".search-element__input");

    if (this.hasAttribute("auto-focus")) {
      this.eventListener(document.body, "keydown", this.focusSearch.bind(this));
    }
  }

  html() {
    return `{{search-element.html}}`;
  }

  focusSearch(evt) {
    if (
      evt.key !== "Tab" &&
      document.activeElement !== this.searchInput &&
      document.activeElement.tagName.toLowerCase() !== "input"
    ) {
      this.searchInput.focus();
    }
  }

  get value() {
    return this.searchInput.value || "";
  }
}
customElements.define("search-element", SearchElement);
