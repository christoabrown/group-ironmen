import { pubsub } from "./data/pubsub";

class Appearance {
  constructor() {
    if (window.matchMedia) {
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
        this.updateTheme();
        pubsub.publish("theme");
      });
    }

    this.updateLayout();
    this.updateTheme();
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
    if (layoutDirection === "row-reverse") document.querySelector(".authed-section").style.flexDirection = "row";
    else document.querySelector(".authed-section").style.flexDirection = "row-reverse";
  }

  setTheme(theme) {
    localStorage.setItem("theme", theme);
    this.updateTheme();
  }

  getTheme() {
    let theme = localStorage.getItem("theme");

    if (!theme && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      theme = "dark";
    }

    return theme;
  }

  updateTheme() {
    const theme = this.getTheme();

    if (theme === "dark") {
      document.documentElement.classList.add("dark-mode");
    } else {
      document.documentElement.classList.remove("dark-mode");
    }
  }
}

const appearance = new Appearance();

export { appearance };
