import { BaseElement } from "../base-element/base-element";
import { Item } from "../data/item";
import { groupData } from "../data/group-data";
import quickselect from "../quick-select";

export class InventoryPager extends BaseElement {
  constructor() {
    super();
    this.pageLimit = 50;
    this.currentPage = 1;
    this.compare = InventoryPager.compareOnQuantity;
  }

  connectedCallback() {
    super.connectedCallback();
    this.pageTarget = document.querySelector(".items-page__list");
    this.sortTarget = document.querySelector(".items-page__sort");
    this.searchElement = document.querySelector(".items-page__search");
    this.eventListener(this.searchElement, "input", this.handleSearch.bind(this));
    this.eventListener(this.sortTarget, "change", this.handleSortChange.bind(this));
    this.eventListener(this, "click", this.handleClick.bind(this));
    this.subscribe("items-updated", this.handleUpdatedItems.bind(this));
  }

  html() {
    let pageButtonsHtml = "";
    const numberOfPages = this.numberOfPages;
    for (let i = 0; i < numberOfPages; ++i) {
      const active = i === this.currentPage - 1 ? "active" : "";
      pageButtonsHtml += `<button class="${active} inventory-pager__button">${i + 1}</button>`;
    }
    return `{{inventory-pager.html}}`;
  }

  handleSearch() {
    const inputText = this.searchElement.value.trim().toLowerCase();
    groupData.applyItemFilter(inputText);
    this.maybeRenderPage(this.currentPage);
    this.render();
  }

  handleSortChange() {
    const selectedSort = this.sortTarget.value;
    if (selectedSort === "totalquantity") {
      this.compare = InventoryPager.compareOnQuantity;
    } else if (selectedSort === "highalch") {
      this.compare = InventoryPager.compareOnHighAlch;
    }

    this.maybeRenderPage(this.currentPage);
    this.render();
  }

  handleClick(evt) {
    const target = evt.target;
    if (target.className.trim() !== "inventory-pager__button") {
      return;
    }
    const pageNumber = parseInt(target.innerText);
    this.currentPage = pageNumber;
    this.maybeRenderPage(pageNumber);
    this.render();
  }

  static compareOnQuantity(a, b) {
    return b.quantity - a.quantity;
  }

  static compareOnHighAlch(a, b) {
    return b.highAlch - a.highAlch;
  }

  handleUpdatedItems() {
    this.maybeRenderPage(this.currentPage);
    this.render();
  }

  maybeRenderPage(pageNumber) {
    const previousPageItems = this.pageItems;

    const items = Object.values(groupData.groupItems).filter((item) => item.visible);
    this.numberOfPages = Math.floor(items.length / this.pageLimit);
    if (items.length - this.pageLimit * this.numberOfPages > 0) this.numberOfPages++;
    if (this.currentPage > this.numberOfPages) {
      this.currentPage = 1;
    }
    const newPageItems = this.getPage(this.currentPage, items);

    if (this.pageUpdated(previousPageItems, newPageItems)) {
      this.pageItems = newPageItems;
      this.renderPage(newPageItems);
    }
  }

  pageUpdated(previous, current) {
    if (previous === undefined) return true;
    if (previous.length !== current.length) return true;

    for (let i = 0; i < current.length; ++i) {
      if (current[i].id !== previous[i].id) return true;
    }
    return false;
  }

  getPage(pageNumber, items) {
    const compare = this.compare;
    for (let i = 0; i < pageNumber; ++i) {
      if (items.length <= this.pageLimit) break;
      quickselect(items, this.pageLimit, 0, items.length - 1, compare);

      if (i !== pageNumber - 1) {
        items = items.slice(this.pageLimit, items.length);
      }
    }

    items = items.slice(0, this.pageLimit);
    items.sort(compare);
    return items;
  }

  renderPage(page) {
    let items = "";
    for (const item of page) {
      items += `<inventory-item item-id="${item.id}"></inventory-item>`;
    }

    this.pageTarget.innerHTML = items;
  }
}
customElements.define("inventory-pager", InventoryPager);
