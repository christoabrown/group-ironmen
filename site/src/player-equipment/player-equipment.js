import { BaseElement } from "../base-element/base-element";

const EquipmentSlot = {
  Head: 0,
  Back: 1,
  Neck: 2,
  Weapon: 3,
  Torso: 4,
  Shield: 5,
  Legs: 7,
  Gloves: 9,
  Boots: 10,
  Ring: 12,
  Ammo: 13,
};

export class PlayerEquipment extends BaseElement {
  constructor() {
    super();
    this.emptySlotImages = {
      [EquipmentSlot.Head]: "156-0.png",
      [EquipmentSlot.Back]: "157-0.png",
      [EquipmentSlot.Neck]: "158-0.png",
      [EquipmentSlot.Weapon]: "159-0.png",
      [EquipmentSlot.Torso]: "161-0.png",
      [EquipmentSlot.Shield]: "162-0.png",
      [EquipmentSlot.Legs]: "163-0.png",
      [EquipmentSlot.Gloves]: "164-0.png",
      [EquipmentSlot.Boots]: "165-0.png",
      [EquipmentSlot.Ring]: "160-0.png",
      [EquipmentSlot.Ammo]: "166-0.png",
    };
  }

  html() {
    return `{{player-equipment.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.render();
    this.playerName = this.getAttribute("player-name");
    this.slotEls = {
      [EquipmentSlot.Head]: this.querySelector(".equipment-head"),
      [EquipmentSlot.Back]: this.querySelector(".equipment-cape"),
      [EquipmentSlot.Neck]: this.querySelector(".equipment-neck"),
      [EquipmentSlot.Weapon]: this.querySelector(".equipment-weapon"),
      [EquipmentSlot.Torso]: this.querySelector(".equipment-torso"),
      [EquipmentSlot.Shield]: this.querySelector(".equipment-shield"),
      [EquipmentSlot.Legs]: this.querySelector(".equipment-legs"),
      [EquipmentSlot.Gloves]: this.querySelector(".equipment-gloves"),
      [EquipmentSlot.Boots]: this.querySelector(".equipment-boots"),
      [EquipmentSlot.Ring]: this.querySelector(".equipment-ring"),
      [EquipmentSlot.Ammo]: this.querySelector(".equipment-ammo"),
    };
    this.subscribe(`equipment:${this.playerName}`, this.handleUpdatedEquipment.bind(this));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  handleUpdatedEquipment(equipment) {
    for (let position = 0; position < equipment.length; ++position) {
      const el = this.slotEls[position];
      // NOTE: Not every position has an equipment slot
      if (el === undefined) continue;
      const item = equipment[position];

      if (item.isValid()) {
        const itemEl = document.createElement("item-box");
        itemEl.item = item;
        itemEl.setAttribute("player-name", this.playerName);
        itemEl.setAttribute("inventory-type", "equipment");
        el.innerHTML = "";
        el.appendChild(itemEl);
      } else {
        el.innerHTML = `<img loading="lazy" src="/ui/${this.emptySlotImages[position]}" />`;
      }
    }
  }
}
customElements.define("player-equipment", PlayerEquipment);
