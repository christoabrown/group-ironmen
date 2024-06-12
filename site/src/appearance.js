class Appearance {
  constructor() {
    if (window.matchMedia) {
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
        this.updateTheme();
      });
    }

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
    if (layoutDirection === "row-reverse") document.querySelector(".authed-section").style.flexDirection = "row";
    else {
      const authedSection = document.querySelector(".authed-section");
      if (authedSection) authedSection.style.flexDirection = "row-reverse";
    }
  }

  setTheme(theme) {
    localStorage.setItem("theme", theme);
    this.updateTheme();
  }

  getTheme() {
    return window.getTheme();
  }

  updateTheme() {
    window.updateTheme();
  }
}

const appearance = new Appearance();

export { appearance };
