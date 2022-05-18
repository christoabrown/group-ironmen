import { BaseElement } from "../base-element/base-element";
import { appearance } from "../appearance";

export class GroupSettings extends BaseElement {
  constructor() {
    super();
  }

  html() {
    return `{{group-settings.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.theme = appearance.getTheme();
    this.render();
    this.memberSection = this.querySelector(".group-settings__members");
    this.subscribe("members-updated", this.handleUpdatedMembers.bind(this));
    this.subscribe("theme", this.handleUpdatedTheme.bind(this));

    this.eventListener(this.querySelector(".group-settings__theme-group"), "change", this.updateTheme.bind(this));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  handleUpdatedTheme() {
    this.theme = appearance.getTheme();

    if (this.theme === "dark") {
      this.querySelector("#group-settings__theme-dark").checked = true;
    } else {
      this.querySelector("#group-settings__theme-light").checked = true;
    }
  }

  updateTheme(event) {
    const theme = event.target.value;
    appearance.setTheme(theme);
    this.theme = theme;
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
