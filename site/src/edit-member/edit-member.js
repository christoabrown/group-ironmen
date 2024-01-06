import { BaseElement } from "../base-element/base-element";
import { api } from "../data/api";
import { loadingScreenManager } from "../loading-screen/loading-screen-manager";
import { pubsub } from "../data/pubsub";
import { confirmDialogManager } from "../confirm-dialog/confirm-dialog-manager";

export class EditMember extends BaseElement {
  constructor() {
    super();
  }

  html() {
    return `{{edit-member.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.render();

    this.input = this.querySelector("member-name-input");
    this.error = this.querySelector(".edit-member__error");
    const renameButton = this.querySelector(".edit-member__rename");
    const removeButton = this.querySelector(".edit-member__remove");
    const addButton = this.querySelector(".edit-member__add");

    if (renameButton) {
      this.eventListener(renameButton, "click", this.renameMember.bind(this));
    }
    if (removeButton) {
      this.eventListener(removeButton, "click", this.removeMember.bind(this));
    }
    if (addButton) {
      this.eventListener(addButton, "click", this.addMember.bind(this));
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  hideError() {
    this.error.innerHTML = "";
  }

  showError(message) {
    this.error.innerHTML = message;
  }

  async renameMember() {
    this.hideError();
    if (!this.input.valid) return;
    const originalName = this.member.name;
    const newName = this.input.value;

    if (originalName === newName) {
      this.showError("New name is the same as the old name");
      return;
    }

    try {
      loadingScreenManager.showLoadingScreen();
      const result = await api.renameMember(originalName, newName);
      if (result.ok) {
        await api.restart();
        await pubsub.waitUntilNextEvent("get-group-data", false);
      } else {
        const message = await result.text();
        this.showError(`Failed to rename member ${message}`);
      }
    } catch (error) {
      this.showError(`Failed to rename member ${error}`);
    } finally {
      loadingScreenManager.hideLoadingScreen();
    }
  }

  removeMember() {
    this.hideError();
    confirmDialogManager.confirm({
      headline: `Delete ${this.member.name}?`,
      body: "All player data will be lost and cannot be recovered.",
      yesCallback: async () => {
        try {
          loadingScreenManager.showLoadingScreen();
          const result = await api.removeMember(this.member.name);
          if (result.ok) {
            await api.restart();
            await pubsub.waitUntilNextEvent("get-group-data", false);
          } else {
            const message = await result.text();
            this.showError(`Failed to remove member ${message}`);
          }
        } catch (error) {
          this.showError(`Failed to remove member ${error}`);
        } finally {
          loadingScreenManager.hideLoadingScreen();
        }
      },
      noCallback: () => {},
    });
  }

  async addMember() {
    this.hideError();
    if (!this.input.valid) return;

    try {
      loadingScreenManager.showLoadingScreen();
      const result = await api.addMember(this.input.value);
      if (result.ok) {
        await api.restart();
        await pubsub.waitUntilNextEvent("get-group-data", false);
      } else {
        const message = await result.text();
        this.showError(`Failed to add member ${message}`);
      }
    } catch (error) {
      this.showError(`Failed to add member ${error}`);
    } finally {
      loadingScreenManager.hideLoadingScreen();
    }
  }
}

customElements.define("edit-member", EditMember);
