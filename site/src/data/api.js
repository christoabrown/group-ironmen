import { pubsub } from "./pubsub";
import { utility } from "../utility";
import { groupData } from "./group-data";
import { storage } from "./storage";

// The hub sync writes every 5 s; polling faster only costs requests.
export const POLL_INTERVAL_MS = 2000;

class Api {
  constructor() {
    this.baseUrl = "/api";
    this.enabled = false;
    this.sessionToken = null;
    this.username = null;
    this.role = null;
  }

  get getGroupDataUrl() {
    return `${this.baseUrl}/group/get-group-data`;
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

  async restart() {
    await this.enable();
  }

  async enable() {
    await this.disable();
    this.nextCheck = new Date(0).toISOString();

    if (!this.enabled) {
      this.enabled = true;
      this.getGroupInterval = pubsub.waitForAllEvents("item-data-loaded").then(() => {
        return utility.callOnInterval(this.getGroupData.bind(this), POLL_INTERVAL_MS);
      });
    }

    await this.getGroupInterval;
  }

  async disable() {
    this.enabled = false;
    groupData.members = new Map();
    if (this.getGroupInterval) {
      window.clearInterval(await this.getGroupInterval);
    }
  }

  async getGroupData() {
    const nextCheck = this.nextCheck;
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

  async getSkillData(period, members) {
    const params = new URLSearchParams({ period });
    if (members?.length) params.set("members", members.join(","));
    const response = await fetch(`${this.skillDataUrl}?${params}`, {
      headers: this.authHeaders(),
      credentials: "same-origin",
    });
    return response.json();
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

  async adminSetPlayerHidden(memberName, hidden) {
    const response = await fetch(`${this.baseUrl}/admin/players/${encodeURIComponent(memberName)}/hidden`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...this.authHeaders(),
      },
      credentials: "same-origin",
      body: JSON.stringify({ hidden }),
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

  // --- Hub history ---

  /**
   * Loads whether the hub-backed history (graphs, trails, events) is
   * available, and publishes it as "features". Defaults to no history when
   * the server does not answer.
   */
  async loadFeatures() {
    let features = { hub_history: false };
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

  /**
   * Location trails of several players: `{days, trails: [{member, shared,
   * points: [[x, y, plane, unixSeconds]]}]}`.
   */
  async getTrails(memberNames, days) {
    const params = new URLSearchParams({ members: memberNames.join(","), days: String(days) });
    return this.getHubJson(`trails?${params}`);
  }

  /**
   * Like getHubEvents, plus the newest `seq` the server has buffered (it
   * restarts from 1 when the backend restarts).
   */
  async getHubEventsPage(options = {}) {
    const params = new URLSearchParams({ limit: String(options.limit || 100) });
    if (options.after !== undefined && options.after !== null) params.set("after", String(options.after));
    const response = await fetch(`${this.baseUrl}/group/hub/events?${params}`, {
      headers: this.authHeaders(),
      credentials: "same-origin",
    });
    if (!response.ok) {
      const error = new Error(`Hub request failed with status ${response.status}`);
      error.status = response.status;
      throw error;
    }
    const latest = parseInt(response.headers.get("X-Events-Latest"), 10);
    return { events: await response.json(), latest: isNaN(latest) ? null : latest };
  }

  /** Buffered events, newest first. `after` is a `seq` from an earlier response. */
  async getHubEvents({ types = [], member, limit = 100, after, minValue } = {}) {
    const params = new URLSearchParams({ limit: String(limit) });
    if (types.length) params.set("types", types.join(","));
    if (member) params.set("member", member);
    if (after !== undefined && after !== null) params.set("after", String(after));
    if (minValue) params.set("min_value", String(minValue));
    return this.getHubJson(`events?${params}`);
  }

  async getHubGains(period) {
    return this.getHubJson(`gains?period=${encodeURIComponent(period)}`);
  }

  /** The period's most valuable drops: `{period, partial, entries: [{rank, event}]}`. */
  async getLootLeaderboard(period, limit = 10) {
    return this.getHubJson(`leaderboards/loot?period=${encodeURIComponent(period)}&limit=${limit}`);
  }

  playerPath(memberName, what) {
    return `players/${encodeURIComponent(memberName)}/${what}`;
  }

  async getPlayerGains(memberName, period) {
    return this.getHubJson(`${this.playerPath(memberName, "gains")}?period=${encodeURIComponent(period)}`);
  }

  async getPlayerSessions(memberName, days = 7) {
    return this.getHubJson(`${this.playerPath(memberName, "sessions")}?days=${days}`);
  }

  async getPlayerWealth(memberName, days = 30) {
    return this.getHubJson(`${this.playerPath(memberName, "wealth")}?days=${days}`);
  }

  async getPlayerGearHistory(memberName, days = 30) {
    return this.getHubJson(`${this.playerPath(memberName, "equipment-history")}?days=${days}`);
  }

  async getPlayerEvents(memberName, limit = 50) {
    return this.getHubJson(`${this.playerPath(memberName, "events")}?limit=${limit}`);
  }
}

const api = new Api();

export { api };
