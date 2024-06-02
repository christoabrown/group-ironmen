import { BaseElement } from "../base-element/base-element";
import { router } from "../router";

export class AppRoute extends BaseElement {
  constructor() {
    super();
  }

  html() {
    return `{{app-route.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    if (this.hasAttribute("route-wrapper")) {
      this.wrapper = document.querySelector(this.getAttribute("route-wrapper"));
    }

    let basePath = this.getAttribute("route-path");
    this.path = this.buildPath(basePath);
    this.aliasFor = this.getAttribute("alias-for");
    this.active = false;

    if (this.aliasFor) {
      router.aliasRoute(this.buildPath(this.aliasFor), this.path);
    } else {
      this.outletSelector = this.getAttribute("route-outlet");
      router.register(this.path, this);
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    router.unregister(this.path);
  }

  get outlet() {
    return document.querySelector(this.outletSelector);
  }

  enable() {
    const redirect = this.getAttribute("route-redirect");
    if (redirect) {
      window.history.pushState("", "", redirect);
      return;
    }
    if (this.active) return;
    this.active = true;
    if (this.wrapper) {
      this.wrapper.enable();
    }

    if (this.page === undefined) {
      const routeComponent = this.getAttribute("route-component");
      this.page = document.createElement(routeComponent);
    }

    this.outlet.appendChild(this.page);
  }

  disable() {
    if (!this.active) return;
    this.active = false;
    if (this.page) {
      this.outlet.removeChild(this.page);
      this.page.innerHTML = "";
    }
  }

  buildPath(basePath) {
    if (basePath.trim() === "/") basePath = "";
    let wrap = "";
    if (this.wrapper) {
      wrap = this.wrapper.getAttribute("route-path");
    }

    return `${wrap}${basePath}`;
  }
}
customElements.define("app-route", AppRoute);
