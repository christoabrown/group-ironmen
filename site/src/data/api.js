import { pubsub } from "./pubsub";
import { utility } from "../utility";
import { groupData } from "./group-data";

// The hub sync writes every 5 s; polling faster only costs requests.
const POLL_INTERVAL_MS = 2000;

class Api {
  constructor() {
    this.baseUrl = "/api";
    this.enabled = false;
    this.clockOffsetMs = 0;
  }

  /**
   * The time (ms) by the server's clock, which is the one the hub's samples
   * are stamped with: the browser's, corrected by what the last poll said.
   */
  serverNow() {
    return Date.now() + this.clockOffsetMs;
  }

  /**
   * A request to the backend; `body` is sent as JSON. Who is asking is in the
   * session cookie, which the browser adds by itself (see data/session.js).
   */
  request(path, { method = "GET", body } = {}) {
    const options = { method, credentials: "same-origin" };
    if (body !== undefined) {
      options.headers = { "Content-Type": "application/json" };
      options.body = JSON.stringify(body);
    }
    return fetch(`${this.baseUrl}${path}`, options);
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
    const response = await this.request(`/group/get-group-data?from_time=${this.nextCheck}`);
    if (!response.ok) {
      if (response.status === 401) {
        // The session ran out, or the hub no longer calls them a member.
        await this.disable();
        window.history.pushState("", "", "/login");
        pubsub.publish("get-group-data");
      }
      return;
    }

    const newGroupData = await response.json();
    const serverTime = Date.parse(newGroupData.cursor);
    if (!isNaN(serverTime)) this.clockOffsetMs = serverTime - Date.now();
    this.nextCheck = groupData.update(newGroupData).toISOString();
    pubsub.publish("get-group-data", groupData);
  }

  getGePrices() {
    return this.request("/ge-prices");
  }

  async getSkillData(period, members) {
    const params = new URLSearchParams({ period });
    if (members?.length) params.set("members", members.join(","));
    const response = await this.request(`/group/get-skill-data?${params}`);
    return response.json();
  }

  // --- Signing in ---

  /** Who is signed in: a response with `{name, is_admin}`, or a 401. */
  getMe() {
    return this.request("/auth/me");
  }

  /** Where to go to sign in with Discord: `{auth_url}`. */
  async discordStart() {
    const response = await this.request("/auth/discord/start");
    if (!response.ok) throw new Error(`Signing in can't be started (${response.status})`);
    return response.json();
  }

  /** Finishes signing in with what Discord sent the browser back with. */
  discordCallback(code, state) {
    return this.request("/auth/discord/callback", { method: "POST", body: { code, state } });
  }

  logout() {
    return this.request("/auth/logout", { method: "POST" });
  }

  // --- For the hub's admins ---

  adminListPlayers() {
    return this.request("/admin/players");
  }

  adminDeletePlayer(memberName) {
    return this.request(`/admin/players/${encodeURIComponent(memberName)}`, { method: "DELETE" });
  }

  adminSetPlayerHidden(memberName, hidden) {
    return this.request(`/admin/players/${encodeURIComponent(memberName)}/hidden`, { method: "PUT", body: { hidden } });
  }

  adminGetHubStatus() {
    return this.request("/admin/hub/status");
  }

  adminTestHub() {
    return this.request("/admin/hub/test", { method: "POST" });
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
      const response = await this.request("/group/features");
      if (response.ok) {
        features = await response.json();
      }
    } catch {
      // Keep the defaults.
    }
    pubsub.publish("features", features);
    return features;
  }

  /** The response of a hub history request; throws with its `status` when it failed. */
  async hubResponse(path) {
    const response = await this.request(`/group/hub/${path}`);
    if (!response.ok) {
      const error = new Error(`Hub request failed with status ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return response;
  }

  async getHubJson(path) {
    return (await this.hubResponse(path)).json();
  }

  /**
   * Location trails of several players: `{as_of, trails: [{member, shared,
   * points, step, truncated, worlds}]}`; see decodeTrail in trail-model.js
   * for what a trail holds.
   */
  async getTrails(memberNames, days) {
    const params = new URLSearchParams({ members: memberNames.join(","), days: String(days) });
    return this.getHubJson(`trails?${params}`);
  }

  /**
   * Buffered events, newest first, and the newest `seq` the server has
   * buffered (it restarts from 1 when the backend restarts). `after` is a
   * `seq` from an earlier response.
   */
  async getHubEventsPage(options = {}) {
    const params = new URLSearchParams({ limit: String(options.limit || 100) });
    if (options.after !== undefined && options.after !== null) params.set("after", String(options.after));
    const response = await this.hubResponse(`events?${params}`);
    const latest = parseInt(response.headers.get("X-Events-Latest"), 10);
    return { events: await response.json(), latest: isNaN(latest) ? null : latest };
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

  /**
   * A player's events of the last `days`, newest first, to mark along their
   * trail: every kind the map shows, drops only from `minLoot` gp. The server
   * reads at most a few thousand; for a busy player the oldest may be missing.
   */
  async getTrailEvents(memberName, days, minLoot = 0) {
    return this.getHubJson(`${this.playerPath(memberName, "events")}?days=${days}&min_loot=${minLoot}`);
  }
}

const api = new Api();

export { api };
