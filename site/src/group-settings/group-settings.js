import { BaseElement } from "../base-element/base-element";

export class GroupSettings extends BaseElement {
  constructor() {
    super();
  }

  html() {
    return `{{group-settings.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.theme = localStorage.getItem("theme");
    this.render();
    this.memberSection = this.querySelector(".group-settings__members");
    this.subscribe("members-updated", this.handleUpdatedMembers.bind(this));

    this.eventListener(this.querySelector(".group-settings__theme-group"), "change", this.updateTheme.bind(this));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  updateTheme(event) {
    const theme = event.target.value;
    localStorage.setItem("theme", theme);
    this.theme = theme;
    window.updateTheme();
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
