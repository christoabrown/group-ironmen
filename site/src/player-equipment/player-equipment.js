import { BaseElement } from "../base-element/base-element";
import { slotIconUrl } from "../data/icons";

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
    // Empty-slot silhouettes, by the icon CDN's slot names.
    this.emptySlotNames = {
      [EquipmentSlot.Head]: "head",
      [EquipmentSlot.Back]: "cape",
      [EquipmentSlot.Neck]: "amulet",
      [EquipmentSlot.Weapon]: "weapon",
      [EquipmentSlot.Torso]: "body",
      [EquipmentSlot.Shield]: "shield",
      [EquipmentSlot.Legs]: "legs",
      [EquipmentSlot.Gloves]: "gloves",
      [EquipmentSlot.Boots]: "boots",
      [EquipmentSlot.Ring]: "ring",
      [EquipmentSlot.Ammo]: "ammo",
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
        const src = slotIconUrl(this.emptySlotNames[position]);
        el.innerHTML = src ? `<img loading="lazy" src="${src}" />` : "";
      }
    }
  }
}
customElements.define("player-equipment", PlayerEquipment);
