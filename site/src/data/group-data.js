import { pubsub } from "./pubsub";
import { MemberData } from "./member-data";
import { SkillName } from "./skill";
import { utility } from "../utility";

export class GroupData {
  constructor() {
    this.members = new Map();
  }

  /**
   * Applies one poll of `/api/members`:
   * `{cursor, roster: [{name, online, last_seen, orphaned}], members: [changed data]}`.
   * Publishes "members-updated" (all members) when the set of names or anyone's
   * online state changes, and "roster-changed" (a Set of names) whenever any
   * member changed at all. Returns the `from_time` for the next poll, or epoch
   * when a full reload is needed (a name appeared whose data we don't have).
   */
  update({ cursor, roster = [], members = [] }) {
    this.transformFromStorage(members);
    const changed = new Set();
    let onlineChanged = false;
    let needsFullReload = false;

    const onRoster = new Set();
    for (const entry of roster) {
      onRoster.add(entry.name);
      let member = this.members.get(entry.name);
      if (!member) {
        member = new MemberData(entry.name);
        this.members.set(entry.name, member);
        changed.add(entry.name);
        onlineChanged = true;
        needsFullReload = true;
      }
      const wasOnline = member.online;
      if (member.updatePresence(entry)) changed.add(entry.name);
      if (wasOnline !== member.online) onlineChanged = true;
    }

    for (const memberData of members) {
      const member = this.members.get(memberData.name);
      if (!member) continue;
      if (member.update(memberData).size > 0) changed.add(member.name);
      member.hasData = true;
    }
    // Everyone new gets their data with the members of this same poll, unless
    // it arrived in an earlier one (a rename or re-import is caught here). A
    // member without any data would ask for a reload on every poll, so each
    // member asks once.
    if (needsFullReload) {
      needsFullReload = false;
      for (const member of this.members.values()) {
        if (!member.hasData && !member.reloadRequested) {
          member.reloadRequested = true;
          needsFullReload = true;
        }
      }
    }

    for (const name of [...this.members.keys()]) {
      if (!onRoster.has(name)) {
        this.members.delete(name);
        changed.add(name);
        onlineChanged = true;
      }
    }

    const [lastMemberListPublished] = pubsub.getMostRecent("members-updated") || [];
    const previousNames = lastMemberListPublished?.map((x) => x.name);
    const currentNames = [...this.members.keys()];
    const membersUpdated =
      !lastMemberListPublished || !utility.setsEqual(new Set(currentNames), new Set(previousNames)) || onlineChanged;
    if (membersUpdated) {
      pubsub.publish("members-updated", this.sortedMembers());
    }
    if (changed.size > 0) {
      pubsub.publish("roster-changed", changed);
    }

    return needsFullReload ? new Date(0) : new Date(cursor || 0);
  }

  /** Renames every member's place, after the region names loaded. */
  refreshRegions() {
    const changed = new Set();
    for (const member of this.members.values()) {
      if (member.updateRegion()) changed.add(member.name);
    }
    if (changed.size > 0) pubsub.publish("roster-changed", changed);
  }

  sortedMembers() {
    return [...this.members.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  /** How many of an item one member has in their inventory or their equipment. */
  inventoryQuantityForItem(itemId, memberName, inventoryType) {
    return this.members.get(memberName)?.itemQuantities?.[inventoryType]?.get(itemId) || 0;
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

  transformFromStorage(members) {
    for (const memberData of members) {
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
