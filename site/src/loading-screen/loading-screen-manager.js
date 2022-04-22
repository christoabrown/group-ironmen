class LoadingScreenManager {
  get globalLoadingScreen() {
    if (this._globalLoadingScreen) return this._globalLoadingScreen;
    this._globalLoadingScreen = document.querySelector("loading-screen");
    return this._globalLoadingScreen;
  }

  showLoadingScreen() {
    this.globalLoadingScreen.style.display = "block";
  }

  hideLoadingScreen() {
    this.globalLoadingScreen.style.display = "none";
  }
}

const loadingScreenManager = new LoadingScreenManager();

export { loadingScreenManager };
