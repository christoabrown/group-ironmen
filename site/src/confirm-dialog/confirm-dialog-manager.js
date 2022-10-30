class ConfirmDialogManager {
  get globalConfirmDialog() {
    if (this._globalConfirmDialog) return this._globalConfirmDialog;
    this._globalConfirmDialog = document.querySelector("confirm-dialog");
    return this._globalConfirmDialog;
  }

  confirm(options) {
    const confirmDialog = this.globalConfirmDialog;
    confirmDialog.show(options);
  }
}

const confirmDialogManager = new ConfirmDialogManager();

export { confirmDialogManager };
