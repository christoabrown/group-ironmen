import { BaseElement } from "../base-element/base-element";
import { api } from "../data/api";
import { storage } from "../data/storage";
import { validCharacters, validLength } from "../validators";

export class CreateGroup extends BaseElement {
  constructor() {
    super();
  }

  html() {
    return `{{create-group.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.render();

    this.groupName = this.querySelector(".create-group__name");
    this.groupName.validators = [
      (value) => {
        return !validCharacters(value) ? "Group name has some unsupported special characters." : null;
      },
      (value) => {
        return !validLength(value) ? "Group name must be between 1 and 16 characters." : null;
      },
    ];

    this.eventListener(this.querySelector("#group-member-count"), "change", this.handleMemberCountChange.bind(this));
    this.eventListener(this.querySelector(".create-group__submit"), "click", this.createGroup.bind(this));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  resetMembersSection() {
    const membersSection = this.querySelector(".create-group__member-inputs");
    membersSection.innerHTML = "";
  }

  get memberNameInputs() {
    return Array.from(this.querySelectorAll(".create-group__member-inputs member-name-input"));
  }

  validateMemberNames() {
    const inputs = this.memberNameInputs;

    // NOTE: We want to loop through all of them here so all error messages display.
    let allValid = true;
    for (const input of inputs) {
      if (!input.valid) allValid = false;
    }
    return allValid;
  }

  displayMembersSection(memberCount) {
    this.resetMembersSection();
    const membersSection = this.querySelector(".create-group__member-inputs");

    const memberInputEls = document.createDocumentFragment();
    for (let i = 0; i < memberCount; ++i) {
      const memberInput = document.createElement("member-name-input");
      memberInput.setAttribute("member-number", i + 1);
      memberInputEls.appendChild(memberInput);
    }

    membersSection.innerHTML = "";
    membersSection.appendChild(memberInputEls);
    this.querySelector(".create-group__step-members").style.display = "block";
    this.querySelector(".create-group__submit").style.display = "block";
  }

  handleMemberCountChange(evt) {
    const target = evt.target;
    const memberCount = parseInt(target.value);

    this.displayMembersSection(memberCount);
  }

  async createGroup() {
    const errorEl = this.querySelector(".create-group__server-error");
    if (errorEl) errorEl.innerHTML = "";
    if (!this.groupName.valid || !this.validateMemberNames()) {
      return;
    }

    const groupName = this.groupName.value;
    const memberInputs = this.memberNameInputs;

    const memberNames = [];
    for (const input of memberInputs) {
      memberNames.push(input.value);
    }

    for (let i = memberNames.length; i < 5; ++i) {
      memberNames.push("");
    }

    const submitBtn = document.querySelector(".create-group__submit");
    try {
      submitBtn.disabled = true;
      const result = await api.createGroup(groupName, memberNames);
      if (!result.ok) {
        const message = await result.text();
        const errorEl = this.querySelector(".create-group__server-error");
        errorEl.innerHTML = `Error creating group: ${message}`;
      } else {
        const createdGroup = await result.json();

        storage.storeGroup(createdGroup.name, createdGroup.token);
        window.history.pushState("", "", "/setup-instructions");
      }
    } catch (err) {
      errorEl.innerHTML = `Error creating group: ${err}`;
    } finally {
      submitBtn.disabled = false;
    }
  }
}

customElements.define("create-group", CreateGroup);
