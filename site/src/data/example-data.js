import { Item } from "./item";
import { SkillName } from "./skill";

class ExampleData {
  constructor() {
    this.seersVillageAgility = [
      { x: 2729, y: 3489, plane: 0 },
      { x: 2729, y: 3489, plane: 0 },
      { x: 2729, y: 3488, plane: 1 },
      { x: 2729, y: 3491, plane: 3 },
      { x: 2725, y: 3491, plane: 3 },
      { x: 2721, y: 3494, plane: 3 },
      { x: 2719, y: 3495, plane: 2 },
      { x: 2713, y: 3494, plane: 2 },
      { x: 2710, y: 3493, plane: 2 },
      { x: 2710, y: 3490, plane: 2 },
      { x: 2710, y: 3489, plane: 2 },
      { x: 2710, y: 3487, plane: 2 },
      { x: 2710, y: 3483, plane: 2 },
      { x: 2710, y: 3483, plane: 2 },
      { x: 2710, y: 3481, plane: 2 },
      { x: 2710, y: 3478, plane: 2 },
      { x: 2710, y: 3474, plane: 3 },
      { x: 2710, y: 3472, plane: 3 },
      { x: 2707, y: 3472, plane: 3 },
      { x: 2704, y: 3472, plane: 3 },
      { x: 2702, y: 3470, plane: 3 },
      { x: 2702, y: 3465, plane: 2 },
      { x: 2702, y: 3464, plane: 2 },
      { x: 2702, y: 3464, plane: 2 },
      { x: 2704, y: 3464, plane: 0 },
      { x: 2704, y: 3463, plane: 0 },
      { x: 2708, y: 3463, plane: 0 },
      { x: 2712, y: 3463, plane: 0 },
      { x: 2715, y: 3463, plane: 0 },
      { x: 2718, y: 3464, plane: 0 },
      { x: 2718, y: 3469, plane: 0 },
      { x: 2722, y: 3473, plane: 0 },
      { x: 2725, y: 3478, plane: 0 },
      { x: 2727, y: 3481, plane: 0 },
      { x: 2728, y: 3486, plane: 0 },
      { x: 2729, y: 3488, plane: 0 },
    ];
    this.currentSeersVillageCoordinate = 0;

    this.members = {
      Zezima: {
        bank: [{ id: 995, quantity: Math.floor(Math.random() * 25000000) }],
      },
      "group alt two": {
        coordinates: this.seersVillageAgility[this.currentSeersVillageCoordinate],
        stats: {
          hitpoints: { current: 55, max: 93 },
          prayer: { current: 13, max: 70 },
          energy: { current: 75, max: 100 },
          world: 330,
        },
        bank: [{ id: 995, quantity: Math.floor(Math.random() * 5000000) }],
        inventory: [
          { id: 26382, quantity: 1 },
          { id: 26384, quantity: 1 },
          { id: 26386, quantity: 1 },
          { id: 0, quantity: 0 },
          { id: 0, quantity: 0 },
          { id: 0, quantity: 0 },
          { id: 0, quantity: 0 },
          { id: 0, quantity: 0 },
          { id: 0, quantity: 0 },
          { id: 0, quantity: 0 },
          { id: 0, quantity: 0 },
          { id: 0, quantity: 0 },
          { id: 0, quantity: 0 },
          { id: 0, quantity: 0 },
          { id: 0, quantity: 0 },
          { id: 0, quantity: 0 },
          { id: 0, quantity: 0 },
          { id: 0, quantity: 0 },
          { id: 6685, quantity: 1 },
          { id: 6685, quantity: 1 },
          { id: 6685, quantity: 1 },
          { id: 6685, quantity: 1 },
          { id: 6685, quantity: 1 },
          { id: 6685, quantity: 1 },
          { id: 6685, quantity: 1 },
          { id: 6685, quantity: 1 },
          { id: 6685, quantity: 1 },
          { id: 995, quantity: Math.floor(Math.random() * 5000000) },
        ],
        equipment: [
          { id: 26382, quantity: 1 },
          { id: 0, quantity: 0 },
          { id: 0, quantity: 0 },
          { id: 0, quantity: 0 },
          { id: 26384, quantity: 1 },
          { id: 0, quantity: 0 },
          { id: 0, quantity: 0 },
          { id: 26386, quantity: 1 },
          { id: 0, quantity: 0 },
          { id: 0, quantity: 0 },
          { id: 0, quantity: 0 },
          { id: 0, quantity: 0 },
          { id: 0, quantity: 0 },
          { id: 0, quantity: 0 },
        ],
      },
      "Bank alt": {
        bank: [{ id: 995, quantity: Math.floor(Math.random() * 5000000) }],
        skills: Object.values(SkillName).reduce((acc, skillName) => {
          acc[skillName] = Math.floor(Math.random() * 14000000);
          return acc;
        }, {}),
      },
      "@SHARED": {
        bank: [{ id: 995, quantity: 1000000 }],
      },
    };

    Item.itemDetails = {
      995: {
        name: "Coins",
        highalch: 0,
        stacks: [
          {
            id: 996,
            count: 2,
          },
          {
            id: 997,
            count: 3,
          },
          {
            id: 998,
            count: 4,
          },
          {
            id: 999,
            count: 5,
          },
          {
            id: 1000,
            count: 25,
          },
          {
            id: 1001,
            count: 100,
          },
          {
            id: 1002,
            count: 250,
          },
          {
            id: 1003,
            count: 1000,
          },
          {
            id: 1004,
            count: 10000,
          },
        ],
        id: "995",
      },
      26382: {
        name: "Torva full helm",
        highalch: 120000,
        stacks: null,
        id: "26382",
      },
      26384: {
        name: "Torva platebody",
        highalch: 360000,
        stacks: null,
        id: "26384",
      },
      26386: {
        name: "Torva platelegs",
        highalch: 240000,
        stacks: null,
        id: "26386",
      },
      6685: {
        name: "Saradomin brew(4)",
        highalch: 120,
        stacks: null,
        id: "6685",
      },
    };
  }

  enable() {
    this.doXpDrop();
    this.doCoordinateUpdate();
    this.doHealthUpdate();
    this.intervals = [];
    this.intervals.push(setInterval(this.doHealthUpdate.bind(this), 3000));
    this.intervals.push(setInterval(this.doXpDrop.bind(this), 2000));
    this.intervals.push(setInterval(this.doCoordinateUpdate.bind(this), 1000));
  }

  disable() {
    if (this.intervals) {
      for (const interval of this.intervals) {
        clearInterval(interval);
      }

      this.intervals = [];
    }
  }

  reset() {
    this.members = {
      "group alt two": {},
      Zezima: {},
      "Bank alt": {},
      "@SHARED": {},
    };
  }

  getGroupData() {
    const groupData = Object.entries(this.members).map(([name, data]) => {
      return { name, ...data };
    });
    this.reset();
    return groupData;
  }

  doXpDrop() {
    this.members["group alt two"].skills = {
      Agility: Math.floor(Math.random() * 100),
    };
  }

  doHealthUpdate() {
    this.members["group alt two"].stats = {
      hitpoints: { current: Math.floor(Math.max(1, Math.random() * 93)), max: 93 },
      prayer: { current: 13, max: 70 },
      energy: { current: 75, max: 100 },
      world: 330,
    };
  }

  doCoordinateUpdate() {
    this.currentSeersVillageCoordinate = (this.currentSeersVillageCoordinate + 1) % this.seersVillageAgility.length;
    const coordinate = this.seersVillageAgility[this.currentSeersVillageCoordinate];
    this.members["group alt two"].coordinates = coordinate;
  }
}

const exampleData = new ExampleData();

export { exampleData };
