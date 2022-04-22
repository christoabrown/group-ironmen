import { MenInput } from "../men-input/men-input";
import { validCharacters, validLength } from "../validators";

export class MemberNameInput extends MenInput {
  constructor() {
    super();
  }

  connectedCallback() {
    this.memberNumber = parseInt(this.getAttribute("member-number"));
    this.setAttribute("placeholder-text", "Player name");
    this.setAttribute("input-id", `member-name${this.memberNumber}`);
    this.setAttribute("input-label", `Name of member ${this.memberNumber}`);
    this.validators = [
      (value) => {
        return !validCharacters(value) ? "Character name has some unsupported special characters." : null;
      },
      (value) => {
        return !validLength(value) ? "Character name must be between 1 and 16 characters." : null;
      },
    ];
    super.connectedCallback();

    // this.subscribe("members-updated", this.handleUpdatedMembers.bind(this));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  handleUpdatedMembers(members) {
    members = members.filter((member) => member.name !== "@SHARED");
    if (!isNaN(this.memberNumber)) {
      const member = members[this.memberNumber - 1];
      if (member) {
        this.input.value = member.name;
        this.member = member;
      }
    }
  }
}

customElements.define("member-name-input", MemberNameInput);
