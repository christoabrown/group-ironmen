import { BaseElement } from "../base-element/base-element";

export class SearchElement extends BaseElement {
  constructor() {
    super();
  }

  connectedCallback() {
    super.connectedCallback();
    this.render();
    this.searchInput = this.querySelector(".search-element__input");
    this.eventListener(this.querySelector(".search-element__reset"), "click", this.resetSearch.bind(this));

    if (this.hasAttribute("auto-focus")) {
      this.eventListener(document.body, "keydown", this.focusSearch.bind(this));
    }
  }

  html() {
    return `{{search-element.html}}`;
  }

  resetSearch() {
    this.searchInput.value = "";
    this.searchInput.dispatchEvent(new Event("input", { bubbles: true }));
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
