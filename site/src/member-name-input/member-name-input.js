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
    this.setAttribute("no-trim", "true");
    this.validators = [
      (value) => {
        return !validCharacters(value) ? "Character name has some unsupported special characters." : null;
      },
      (value) => {
        return !validLength(value) ? "Character name must be between 1 and 16 characters." : null;
      },
    ];
    super.connectedCallback();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }
}

customElements.define("member-name-input", MemberNameInput);
