import { pubsub } from "./data/pubsub";

class Appearance {
  constructor() {
    this.updateLayout();
  }

  setLayout(layout) {
    localStorage.setItem("layout-direction", layout);
    this.updateLayout();
  }

  getLayout() {
    return localStorage.getItem("layout-direction");
  }

  updateLayout() {
    const layoutDirection = this.getLayout();
    if (layoutDirection === "row-reverse")
      document.querySelector(".authed-section").style.flexDirection = "row-reverse";
    else document.querySelector(".authed-section").style.flexDirection = "row";
  }
}

const appearance = new Appearance();

export { appearance };
