import { pubsub } from "./pubsub";
import { utility } from "../utility";
import { groupData } from "./group-data";
import { exampleData } from "./example-data";
import { storage } from "./storage";

class Api {
  constructor() {
    this.baseUrl = "/api";
    this.createGroupUrl = `${this.baseUrl}/create-group`;
    this.exampleDataEnabled = false;
    this.enabled = false;
    this.sessionToken = null;
    this.username = null;
    this.role = null;
  }

  get getGroupDataUrl() {
    return `${this.baseUrl}/group/get-group-data`;
  }

  get addMemberUrl() {
    return `${this.baseUrl}/group/add-group-member`;
  }

  get deleteMemberUrl() {
    return `${this.baseUrl}/group/delete-group-member`;
  }

  get renameMemberUrl() {
    return `${this.baseUrl}/group/rename-group-member`;
  }

  get amILoggedInUrl() {
    return `${this.baseUrl}/auth/me`;
  }

  get gePricesUrl() {
    return `${this.baseUrl}/ge-prices`;
  }

  get skillDataUrl() {
    return `${this.baseUrl}/group/get-skill-data`;
  }

  get captchaEnabledUrl() {
    return `${this.baseUrl}/captcha-enabled`;
  }

  get setupStatusUrl() {
    return `${this.baseUrl}/auth/setup-status`;
  }

  get setupUrl() {
    return `${this.baseUrl}/auth/setup`;
  }

  get loginUrl() {
    return `${this.baseUrl}/auth/login`;
  }

  get logoutUrl() {
    return `${this.baseUrl}/auth/logout`;
  }

  get changePasswordUrl() {
    return `${this.baseUrl}/auth/change-password`;
  }

  get meUrl() {
    return `${this.baseUrl}/auth/me`;
  }

  get discordEnabledUrl() {
    return `${this.baseUrl}/auth/discord/enabled`;
  }

  // Auth headers using session cookie + Bearer fallback
  authHeaders() {
    const headers = {};
    // Pages can mount before the app initializer has restored the session.
    const sessionToken = this.sessionToken || storage.getSession().sessionToken;
    if (sessionToken) {
      headers["Authorization"] = `Bearer ${sessionToken}`;
    }
    return headers;
  }

  setSession(sessionToken, username, role) {
    this.sessionToken = sessionToken;
    this.username = username;
    this.role = role;
  }

  // Legacy compat
  setCredentials(groupName, groupToken) {
    this.groupName = groupName;
    this.groupToken = groupToken;
  }

  async restart() {
    await this.enable();
  }

  async enable(groupName, groupToken) {
    await this.disable();
    this.nextCheck = new Date(0).toISOString();

    // Legacy compat
    if (groupName) {
      this.setCredentials(groupName, groupToken);
    }

    if (!this.enabled) {
      this.enabled = true;
      this.getGroupInterval = pubsub.waitForAllEvents("item-data-loaded", "quest-data-loaded").then(() => {
        return utility.callOnInterval(this.getGroupData.bind(this), 1000);
      });
    }

    await this.getGroupInterval;
  }

  async disable() {
    this.enabled = false;
    this.groupName = undefined;
    this.groupToken = undefined;
    groupData.members = new Map();
    groupData.groupItems = {};
    groupData.filters = [""];
    if (this.getGroupInterval) {
      window.clearInterval(await this.getGroupInterval);
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
        headers: this.authHeaders(),
        credentials: "same-origin",
      });
      if (!response.ok) {
        if (response.status === 401) {
          await this.disable();
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
        ...this.authHeaders(),
      },
      credentials: "same-origin",
      method: "POST",
    });

    return response;
  }

  async removeMember(memberName) {
    const response = await fetch(this.deleteMemberUrl, {
      body: JSON.stringify({ name: memberName }),
      headers: {
        "Content-Type": "application/json",
        ...this.authHeaders(),
      },
      credentials: "same-origin",
      method: "DELETE",
    });

    return response;
  }

  async renameMember(originalName, newName) {
    const response = await fetch(this.renameMemberUrl, {
      body: JSON.stringify({ original_name: originalName, new_name: newName }),
      headers: {
        "Content-Type": "application/json",
        ...this.authHeaders(),
      },
      credentials: "same-origin",
      method: "PUT",
    });

    return response;
  }

  async amILoggedIn() {
    const response = await fetch(this.meUrl, {
      headers: this.authHeaders(),
      credentials: "same-origin",
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
        headers: this.authHeaders(),
        credentials: "same-origin",
      });
      return response.json();
    }
  }

  async getCaptchaEnabled() {
    const response = await fetch(this.captchaEnabledUrl);
    return response.json();
  }

  async generatePairingCode() {
    const response = await fetch(`${this.baseUrl}/group/pair/code`, {
      method: "POST",
      headers: this.authHeaders(),
      credentials: "same-origin",
    });
    return response;
  }

  // --- User management API methods ---

  async getSetupStatus() {
    const response = await fetch(this.setupStatusUrl);
    return response.json();
  }

  async setup(username, password) {
    const response = await fetch(this.setupUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    return response;
  }

  async login(username, password) {
    const response = await fetch(this.loginUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ username, password }),
    });
    return response;
  }

  async logout() {
    const response = await fetch(this.logoutUrl, {
      method: "POST",
      headers: this.authHeaders(),
      credentials: "same-origin",
    });
    return response;
  }

  async changePassword(currentPassword, newPassword) {
    const response = await fetch(this.changePasswordUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...this.authHeaders(),
      },
      credentials: "same-origin",
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    });
    return response;
  }

  async getMe() {
    const response = await fetch(this.meUrl, {
      headers: this.authHeaders(),
      credentials: "same-origin",
    });
    return response;
  }

  async getDiscordEnabled() {
    const response = await fetch(this.discordEnabledUrl);
    return response.json();
  }

  get discordCallbackUrl() {
    return `${this.baseUrl}/auth/discord/callback`;
  }

  async discordCallback(code, state) {
    const response = await fetch(this.discordCallbackUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ code, state }),
    });
    return response;
  }

  // --- Admin API methods ---

  async adminListUsers() {
    const response = await fetch(`${this.baseUrl}/admin/users`, {
      headers: this.authHeaders(),
      credentials: "same-origin",
    });
    return response;
  }

  async adminCreateUser(username, password, role) {
    const response = await fetch(`${this.baseUrl}/admin/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...this.authHeaders(),
      },
      credentials: "same-origin",
      body: JSON.stringify({ username, password, role }),
    });
    return response;
  }

  async adminChangeUserRole(userId, role) {
    const response = await fetch(`${this.baseUrl}/admin/users/${userId}/role`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...this.authHeaders(),
      },
      credentials: "same-origin",
      body: JSON.stringify({ role }),
    });
    return response;
  }

  async adminDisableUser(userId) {
    const response = await fetch(`${this.baseUrl}/admin/users/${userId}/disable`, {
      method: "PUT",
      headers: this.authHeaders(),
      credentials: "same-origin",
    });
    return response;
  }

  async adminEnableUser(userId) {
    const response = await fetch(`${this.baseUrl}/admin/users/${userId}/enable`, {
      method: "PUT",
      headers: this.authHeaders(),
      credentials: "same-origin",
    });
    return response;
  }

  async adminKickUser(userId) {
    const response = await fetch(`${this.baseUrl}/admin/users/${userId}`, {
      method: "DELETE",
      headers: this.authHeaders(),
      credentials: "same-origin",
    });
    return response;
  }

  async adminChangeUserPassword(userId, newPassword) {
    const response = await fetch(`${this.baseUrl}/admin/users/${userId}/password`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...this.authHeaders(),
      },
      credentials: "same-origin",
      body: JSON.stringify({ new_password: newPassword }),
    });
    return response;
  }

  async adminGetAuditLog() {
    const response = await fetch(`${this.baseUrl}/admin/audit-log`, {
      headers: this.authHeaders(),
      credentials: "same-origin",
    });
    return response;
  }

  async adminListPlayers() {
    const response = await fetch(`${this.baseUrl}/admin/players`, {
      headers: this.authHeaders(),
      credentials: "same-origin",
    });
    return response;
  }

  async adminDeletePlayer(memberName) {
    const response = await fetch(`${this.baseUrl}/admin/players/${encodeURIComponent(memberName)}`, {
      method: "DELETE",
      headers: this.authHeaders(),
      credentials: "same-origin",
    });
    return response;
  }

  async adminGetUserPlayers(userId) {
    const response = await fetch(`${this.baseUrl}/admin/users/${userId}/players`, {
      headers: this.authHeaders(),
      credentials: "same-origin",
    });
    return response;
  }

  async adminGetPlayerUsers(memberName) {
    const response = await fetch(`${this.baseUrl}/admin/players/${encodeURIComponent(memberName)}/users`, {
      headers: this.authHeaders(),
      credentials: "same-origin",
    });
    return response;
  }

  async adminLinkPlayerUser(memberName, userId) {
    const response = await fetch(`${this.baseUrl}/admin/players/${encodeURIComponent(memberName)}/users/${userId}`, {
      method: "POST",
      headers: this.authHeaders(),
      credentials: "same-origin",
    });
    return response;
  }

  async adminUnlinkPlayerUser(memberName, userId) {
    const response = await fetch(`${this.baseUrl}/admin/players/${encodeURIComponent(memberName)}/users/${userId}`, {
      method: "DELETE",
      headers: this.authHeaders(),
      credentials: "same-origin",
    });
    return response;
  }

  async adminGetHubStatus() {
    const response = await fetch(`${this.baseUrl}/admin/hub/status`, {
      headers: this.authHeaders(),
      credentials: "same-origin",
    });
    return response;
  }

  async adminTestHub() {
    const response = await fetch(`${this.baseUrl}/admin/hub/test`, {
      method: "POST",
      headers: this.authHeaders(),
      credentials: "same-origin",
    });
    return response;
  }

  // --- Data source features and hub history ---

  /**
   * Loads which data source this server uses and whether hub history is
   * available, and publishes it as "features". Defaults to direct pairing
   * without hub history when the server does not answer.
   */
  async loadFeatures() {
    let features = { data_source: "direct", direct_pairing: true, hub_history: false };
    if (!this.exampleDataEnabled) {
      try {
        const response = await fetch(`${this.baseUrl}/group/features`, {
          headers: this.authHeaders(),
          credentials: "same-origin",
        });
        if (response.ok) {
          features = await response.json();
        }
      } catch {
        // Keep the defaults.
      }
    }
    pubsub.publish("features", features);
    return features;
  }

  async getHubJson(path) {
    const response = await fetch(`${this.baseUrl}/group/hub/${path}`, {
      headers: this.authHeaders(),
      credentials: "same-origin",
    });
    if (!response.ok) {
      const error = new Error(`Hub request failed with status ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return response.json();
  }

  /** The member's location trail as [x, y, plane, unixSeconds] points. */
  async getHubLocations(memberName, days) {
    return this.getHubJson(`locations/${encodeURIComponent(memberName)}?days=${days}`);
  }

  async getHubEvents({ types = [], member, limit = 100 } = {}) {
    const params = new URLSearchParams({ limit: String(limit) });
    if (types.length) params.set("types", types.join(","));
    if (member) params.set("member", member);
    return this.getHubJson(`events?${params}`);
  }

  async getHubGains(period) {
    return this.getHubJson(`gains?period=${encodeURIComponent(period)}`);
  }
}

const api = new Api();

export { api };
