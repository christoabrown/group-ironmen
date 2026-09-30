import { pubsub } from "./pubsub";
import { MemberData } from "./member-data";
import { SkillName } from "./skill";
import { utility } from "../utility";

export class GroupData {
  constructor() {
    this.members = new Map();
  }

  update(groupData) {
    this.transformFromStorage(groupData);
    groupData.sort((a, b) => a.name.localeCompare(b.name));
    const removedMembers = new Set(this.members.keys());

    let lastUpdated = new Date(0);
    let inactiveStatusChanged = false;
    for (const memberData of groupData) {
      const memberName = memberData.name;
      removedMembers.delete(memberName);
      if (!this.members.has(memberName)) {
        this.members.set(memberName, new MemberData(memberName));
      }

      const member = this.members.get(memberName);
      const wasInactive = member.inactive;
      member.update(memberData);
      if (wasInactive !== member.inactive) {
        inactiveStatusChanged = true;
      }

      if (member.lastUpdated && member.lastUpdated > lastUpdated) {
        lastUpdated = member.lastUpdated;
      }
    }

    for (const removedMember of removedMembers.values()) {
      this.members.delete(removedMember);
    }

    const [lastMemberListPublished] = pubsub.getMostRecent("members-updated") || [];
    const previousNames = lastMemberListPublished?.map((x) => x.name);
    const currentNames = [...this.members.values()].map((x) => x.name);
    const membersUpdated = !utility.setsEqual(new Set(currentNames), new Set(previousNames)) || inactiveStatusChanged;
    if (membersUpdated) {
      pubsub.publish("members-updated", [...this.members.values()]);
    }

    return new Date(lastUpdated.getTime() + 1);
  }

  static transformItemsFromStorage(items) {
    if (items === undefined || items === null) return;

    let result = [];
    for (let i = 0; i < items.length; i += 2) {
      result.push({
        id: items[i],
        quantity: items[i + 1],
      });
    }
    return result;
  }

  static transformSkillsFromStorage(skills) {
    if (skills === undefined || skills === null) return;

    let result = {};
    let i = 0;
    let overall = 0;
    for (const skillName of Object.keys(SkillName)) {
      if (skillName !== SkillName.Overall) {
        const xp = skills[i] ?? 0;
        result[skillName] = xp;
        overall += xp;
        i += 1;
      }
    }

    result[SkillName.Overall] = overall;
    return result;
  }

  static transformStatsFromStorage(stats) {
    if (stats === undefined || stats === null) return;

    return {
      hitpoints: {
        current: stats[0],
        max: stats[1],
      },
      prayer: {
        current: stats[2],
        max: stats[3],
      },
      world: stats[6],
    };
  }

  static transformCoordinatesFromStorage(coordinates) {
    if (coordinates === undefined || coordinates === null) return;

    // NOTE: need to offset Y for some reason
    const yOffset = 1;
    return {
      x: coordinates[0],
      y: coordinates[1] + yOffset,
      plane: coordinates[2],
    };
  }

  transformFromStorage(groupData) {
    for (const memberData of groupData) {
      for (const [fieldName, transform] of storageFieldTransformers) {
        memberData[fieldName] = transform(memberData[fieldName]);
      }
    }
  }
}

const storageFieldTransformers = [
  ["inventory", GroupData.transformItemsFromStorage],
  ["equipment", GroupData.transformItemsFromStorage],
  ["skills", GroupData.transformSkillsFromStorage],
  ["stats", GroupData.transformStatsFromStorage],
  ["coordinates", GroupData.transformCoordinatesFromStorage],
];

const groupData = new GroupData();

export { groupData };
