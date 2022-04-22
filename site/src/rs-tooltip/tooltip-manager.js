class TooltipManager {
  get globalTooltip() {
    if (this._globalTooltip) return this._globalTooltip;
    this._globalTooltip = document.querySelector("rs-tooltip");
    return this._globalTooltip;
  }

  showTooltip(tooltipText) {
    this.globalTooltip.showTooltip(tooltipText);
  }

  hideTooltip() {
    this.globalTooltip.hideTooltip();
  }
}
const tooltipManager = new TooltipManager();

export { tooltipManager };
