import { BaseElement } from "../base-element/base-element";
import { appearance } from "../appearance";

export class GroupSettings extends BaseElement {
  constructor() {
    super();
  }

  /* eslint-disable no-unused-vars */
  html() {
    const selectedPanelDockSide = appearance.getLayout();
    const style = appearance.getTheme();
    return `{{group-settings.html}}`;
  }
  /* eslint-enable no-unused-vars */

  connectedCallback() {
    super.connectedCallback();
    this.render();
    this.memberSection = this.querySelector(".group-settings__members");
    this.panelDockSide = this.querySelector(".group-settings__panels");
    this.appearanceStyle = this.querySelector(".group-settings__style");
    this.subscribe("members-updated", this.handleUpdatedMembers.bind(this));
    this.eventListener(this.panelDockSide, "change", this.handlePanelDockSideChange.bind(this));
    this.eventListener(this.appearanceStyle, "change", this.handleStyleChange.bind(this));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  handleStyleChange() {
    const style = this.querySelector(`input[name="appearance-style"]:checked`).value;
    appearance.setTheme(style);
  }

  handlePanelDockSideChange() {
    const side = this.querySelector(`input[name="panel-dock-side"]:checked`).value;

    if (side === "right") {
      appearance.setLayout("row-reverse");
    } else {
      appearance.setLayout("row");
    }
  }

  handleUpdatedMembers(members) {
    members = members.filter((member) => member.name !== "@SHARED");
    let memberEdits = document.createDocumentFragment();
    for (let i = 0; i < members.length; ++i) {
      const member = members[i];
      const memberEdit = document.createElement("edit-member");
      memberEdit.member = member;
      memberEdit.memberNumber = i + 1;

      memberEdits.appendChild(memberEdit);
    }

    if (members.length < 5) {
      const addMember = document.createElement("edit-member");
      addMember.memberNumber = members.length + 1;
      memberEdits.appendChild(addMember);
    }

    this.memberSection.innerHTML = "";
    this.memberSection.appendChild(memberEdits);
  }
}

customElements.define("group-settings", GroupSettings);
