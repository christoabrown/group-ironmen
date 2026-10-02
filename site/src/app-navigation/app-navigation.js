import { BaseElement } from "../base-element/base-element";
import { storage } from "../data/storage";

export class AppNavigation extends BaseElement {
  constructor() {
    super();
  }

  /* eslint-disable no-unused-vars */
  html() {
    return `{{app-navigation.html}}`;
  }
  /* eslint-enable no-unused-vars */

  get displayName() {
    const session = storage.getSession();
    if (session && session.username) return session.username;
    return window.siteConfig?.title || "Guild";
  }

  get isAdmin() {
    const session = storage.getSession();
    return session && session.role === "admin";
  }

  connectedCallback() {
    super.connectedCallback();
    this.render();
    this.subscribe("route-activated", this.handleRouteActivated.bind(this));
  }

  handleRouteActivated(route) {
    const routeComponent = route.getAttribute("route-component");

    const buttons = Array.from(this.querySelectorAll("button"));
    for (const button of buttons) {
      const c = button.getAttribute("route-component");
      if (routeComponent === c) {
        button.classList.add("active");
      } else {
        button.classList.remove("active");
      }
    }
  }
}
customElements.define("app-navigation", AppNavigation);
