import { pubsub } from "./pubsub";
import { utility } from "../utility";
import { groupData } from "./group-data";
import { exampleData } from "./example-data";

class Api {
  constructor() {
    this.baseUrl = "/api";
    this.createGroupUrl = `${this.baseUrl}/create-group`;
    this.exampleDataEnabled = false;
    this.enabled = false;
  }

  get getGroupDataUrl() {
    return `${this.baseUrl}/group/${this.groupName}/get-group-data`;
  }

  get addMemberUrl() {
    return `${this.baseUrl}/group/${this.groupName}/add-group-member`;
  }

  get deleteMemberUrl() {
    return `${this.baseUrl}/group/${this.groupName}/delete-group-member`;
  }

  get renameMemberUrl() {
    return `${this.baseUrl}/group/${this.groupName}/rename-group-member`;
  }

  get amILoggedInUrl() {
    return `${this.baseUrl}/group/${this.groupName}/am-i-logged-in`;
  }

  get gePricesUrl() {
    return `${this.baseUrl}/ge-prices`;
  }

  get skillDataUrl() {
    return `${this.baseUrl}/group/${this.groupName}/get-skill-data`;
  }

  get captchaEnabledUrl() {
    return `${this.baseUrl}/captcha-enabled`;
  }

  get collectionLogInfoUrl() {
    return `${this.baseUrl}/collection-log-info`;
  }

  collectionLogDataUrl(playerName) {
    return `${this.baseUrl}/group/${this.groupName}/collection-log?member_name=${playerName}`;
  }

  setCredentials(groupName, groupToken) {
    this.groupName = groupName;
    this.groupToken = groupToken;
  }

  async restart() {
    const groupName = this.groupName;
    const groupToken = this.groupToken;
    this.disable();
    this.enable(groupName, groupToken);
  }

  async enable(groupName, groupToken) {
    this.nextCheck = new Date(0).toISOString();
    this.setCredentials(groupName, groupToken);

    if (!this.enabled) {
      this.enabled = true;
      if (!this.exampleDataEnabled) {
        await pubsub.waitForAllEvents("item-data-loaded", "quest-data-loaded");
      }
      this.getGroupInterval = utility.callOnInterval(this.getGroupData.bind(this), 1000);
    }
  }

  disable() {
    this.enabled = false;
    this.groupName = undefined;
    this.groupToken = undefined;
    groupData.members = new Map();
    groupData.groupItems = {};
    groupData.filters = [""];
    if (this.getGroupInterval) {
      window.clearInterval(this.getGroupInterval);
    }
  }

  async getGroupData() {
    const nextCheck = this.nextCheck;

    if (this.exampleDataEnabled) {
      const newGroupData = exampleData.getGroupData();
      groupData.update(newGroupData);
      pubsub.publish("get-group-data", groupData);
    } else {
      const response = await fetch(`${this.getGroupDataUrl}?from_time=${nextCheck}`, {
        headers: {
          Authorization: this.groupToken,
        },
      });
      if (!response.ok) {
        if (response.status === 401) {
          this.disable();
          window.history.pushState("", "", "/login");
          pubsub.publish("get-group-data");
        }
        return;
      }

      const newGroupData = await response.json();
      this.nextCheck = groupData.update(newGroupData).toISOString();
      pubsub.publish("get-group-data", groupData);
    }
  }

  async createGroup(groupName, memberNames, captchaResponse) {
    const response = await fetch(this.createGroupUrl, {
      body: JSON.stringify({ name: groupName, member_names: memberNames, captcha_response: captchaResponse }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    return response;
  }

  async addMember(memberName) {
    const response = await fetch(this.addMemberUrl, {
      body: JSON.stringify({ name: memberName }),
      headers: {
        "Content-Type": "application/json",
        Authorization: this.groupToken,
      },
      method: "POST",
    });

    return response;
  }

  async removeMember(memberName) {
    const response = await fetch(this.deleteMemberUrl, {
      body: JSON.stringify({ name: memberName }),
      headers: {
        "Content-Type": "application/json",
        Authorization: this.groupToken,
      },
      method: "DELETE",
    });

    return response;
  }

  async renameMember(originalName, newName) {
    const response = await fetch(this.renameMemberUrl, {
      body: JSON.stringify({ original_name: originalName, new_name: newName }),
      headers: {
        "Content-Type": "application/json",
        Authorization: this.groupToken,
      },
      method: "PUT",
    });

    return response;
  }

  async amILoggedIn() {
    const response = await fetch(this.amILoggedInUrl, {
      headers: { Authorization: this.groupToken },
    });

    return response;
  }

  async getGePrices() {
    const response = await fetch(this.gePricesUrl);
    return response;
  }

  async getSkillData(period) {
    if (this.exampleDataEnabled) {
      const skillData = exampleData.getSkillData(period, groupData);
      return skillData;
    } else {
      const response = await fetch(`${this.skillDataUrl}?period=${period}`, {
        headers: {
          Authorization: this.groupToken,
        },
      });
      return response.json();
    }
  }

  async getCaptchaEnabled() {
    const response = await fetch(this.captchaEnabledUrl);
    return response.json();
  }

  async getCollectionLogInfo() {
    const response = await fetch(this.collectionLogInfoUrl);
    return response.json();
  }

  async getCollectionLog(playerName) {
    const response = await fetch(this.collectionLogDataUrl(playerName), {
      headers: {
        Authorization: this.groupToken,
      },
    });
    return response.json();
  }
}

const api = new Api();

export { api };
