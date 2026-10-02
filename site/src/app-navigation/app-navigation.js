import { BaseElement } from "../base-element/base-element";
import { session } from "../data/session";

export class AppNavigation extends BaseElement {
  constructor() {
    super();
  }

  html() {
    return `{{app-navigation.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.render();
    this.nameEl = this.querySelector(".app-navigation__guild-name");
    this.adminLink = this.querySelector(".app-navigation__admin");
    this.handleSession(session.current);
    this.subscribe("route-activated", this.handleRouteActivated.bind(this));
    // Who is signed in is only known once the server has said so.
    this.subscribe("session", this.handleSession.bind(this));
  }

  handleSession(who) {
    this.nameEl.textContent = who?.name || window.siteConfig?.title || "Guild";
    this.adminLink.hidden = !who?.is_admin;
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
