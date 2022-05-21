import { BaseElement } from "../base-element/base-element";
import { Item } from "../data/item";
import { groupData } from "../data/group-data";
import quickselect from "../quick-select";

export class InventoryPager extends BaseElement {
  constructor() {
    super();
    this.pageLimit = 50;
    this.currentPage = 1;
    this.numberOfItems = 0;
    this.compare = this.compareOnQuantity.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
    this.pageTarget = document.querySelector(".items-page__list");
    this.sortTarget = document.querySelector(".items-page__sort");
    this.itemCount = document.querySelector(".items-page__item-count");
    this.totalGeValue = document.querySelector(".items-page__total-ge-price");
    this.searchElement = document.querySelector(".items-page__search");
    this.showIndividualPricesInput = document.querySelector("#items-page__individual-items");
    this.showIndividualPrices = this.showIndividualPricesInput.checked;
    this.eventListener(this.searchElement, "input", this.handleSearch.bind(this));
    this.eventListener(this.sortTarget, "change", this.handleSortChange.bind(this));
    this.eventListener(this, "click", this.handleClick.bind(this));
    this.eventListener(this.showIndividualPricesInput, "change", this.handleIndividualPricesChange.bind(this));
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

  render() {
    super.render();
    if (this.numberOfItems !== undefined) {
      this.itemCount.innerHTML = this.numberOfItems.toLocaleString();
    }
  }

  handleIndividualPricesChange() {
    this.showIndividualPrices = this.showIndividualPricesInput.checked;
    this.maybeRenderPage(this.currentPage, true);
    this.render();
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
      this.compare = this.compareOnQuantity.bind(this);
    } else if (selectedSort === "highalch") {
      this.compare = this.compareOnHighAlch.bind(this);
    } else if (selectedSort === "geprice") {
      this.compare = this.compareOnGePrice.bind(this);
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

  compareOnQuantity(a, b) {
    return b.quantity - a.quantity;
  }

  compareOnHighAlch(a, b) {
    if (this.showIndividualPrices) {
      return b.highAlch - a.highAlch;
    }

    return b.quantity * b.highAlch - a.quantity * a.highAlch;
  }

  compareOnGePrice(a, b) {
    if (this.showIndividualPrices) {
      return b.gePrice - a.gePrice;
    }

    return b.quantity * b.gePrice - a.quantity * a.gePrice;
  }

  handleUpdatedItems() {
    const previousItemCount = this.numberOfItems;
    this.maybeRenderPage(this.currentPage);

    if (this.numberOfItems !== previousItemCount) {
      this.render();
    }
  }

  maybeRenderPage(pageNumber, forceRender = false) {
    const previousPageItems = this.pageItems;

    const items = Object.values(groupData.groupItems).filter((item) => item.visible);
    this.numberOfPages = Math.floor(items.length / this.pageLimit);
    this.numberOfItems = items.length;
    if (items.length - this.pageLimit * this.numberOfPages > 0) this.numberOfPages++;
    if (this.currentPage > this.numberOfPages) {
      this.currentPage = 1;
    }
    const newPageItems = this.getPage(this.currentPage, items);

    if (forceRender || this.pageUpdated(previousPageItems, newPageItems)) {
      this.pageItems = newPageItems;
      this.renderPage(newPageItems);
    }

    this.updateGeValue();
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
      items += `
<inventory-item item-id="${item.id}"
                ${this.showIndividualPrices ? "individual-prices" : ""}>
</inventory-item>
`;
    }

    this.pageTarget.innerHTML = items;
  }

  updateGeValue() {
    let totalGeValue = 0;
    for (const item of Object.values(groupData.groupItems)) {
      if (item.visible) {
        const gePrice = item.gePrice;
        totalGeValue += item.quantity * gePrice;
      }
    }

    this.totalGeValue.innerHTML = totalGeValue.toLocaleString();
  }
}
customElements.define("inventory-pager", InventoryPager);
