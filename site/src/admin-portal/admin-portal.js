import { BaseElement } from "../base-element/base-element";
import { api } from "../data/api";
import { storage } from "../data/storage";

const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function relativeTime(dateStr) {
  if (!dateStr) return "Never";
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHr < 24) return `${diffHr} hour${diffHr !== 1 ? "s" : ""} ago`;
  if (diffDay < 30) return `${diffDay} day${diffDay !== 1 ? "s" : ""} ago`;
  const diffMonth = Math.floor(diffDay / 30);
  return `${diffMonth} month${diffMonth !== 1 ? "s" : ""} ago`;
}

export class AdminPortal extends BaseElement {
  constructor() {
    super();
  }

  html() {
    return `{{admin-portal.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();

    const session = storage.getSession();
    if (session.role !== "admin") {
      window.history.pushState("", "", "/group");
      return;
    }

    api.setSession(session.sessionToken, session.username, session.role);
    this.render();
    this.loadUsers();
    this.loadHubStatus();
    this.loadPlayers();
    this.loadAuditLog();
    this.setupCreateUser();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  setupCreateUser() {
    const createBtn = this.querySelector(".admin-portal__create-btn");
    if (createBtn) {
      this.eventListener(createBtn, "click", this.handleCreateUser.bind(this));
    }
  }

  async handleCreateUser() {
    const usernameInput = this.querySelector(".admin-portal__new-username");
    const passwordInput = this.querySelector(".admin-portal__new-password");
    const roleSelect = this.querySelector(".admin-portal__role-dropdown");
    const errorEl = this.querySelector(".admin-portal__create-error");

    if (!usernameInput.valid || !passwordInput.valid) {
      errorEl.innerHTML = "Please fill in all required fields.";
      return;
    }

    errorEl.innerHTML = "";
    try {
      const response = await api.adminCreateUser(usernameInput.value, passwordInput.value, roleSelect.value);
      if (response.ok) {
        usernameInput.value = "";
        passwordInput.value = "";
        this.loadUsers();
        this.loadAuditLog();
      } else {
        const body = await response.text();
        errorEl.innerHTML = `Error: ${body}`;
      }
    } catch (e) {
      errorEl.innerHTML = `Error: ${e}`;
    }
  }

  async loadUsers() {
    try {
      const response = await api.adminListUsers();
      if (!response.ok) return;
      const users = await response.json();
      this.renderUsers(users);
    } catch (e) {
      // ignore
    }
  }

  renderUsers(users) {
    const container = this.querySelector(".admin-portal__user-list");
    if (!container) return;

    const session = storage.getSession();

    container.innerHTML = users
      .map((user) => {
        const roleBadge =
          user.role === "admin"
            ? `<span class="admin-portal__badge admin-portal__badge--admin">admin</span>`
            : `<span class="admin-portal__badge admin-portal__badge--member">member</span>`;
        const disabledBadge = !user.enabled
          ? `<span class="admin-portal__badge admin-portal__badge--disabled">disabled</span>`
          : "";
        const lastSeen = user.last_seen ? new Date(user.last_seen).toLocaleString() : "";
        const lastSeenRelative = relativeTime(user.last_seen);
        const isSelf = user.username === session.username;

        let actions = "";
        if (!isSelf) {
          if (user.enabled) {
            actions += `<button class="men-button" data-action="disable" data-user-id="${user.user_id}">Disable</button>`;
          } else {
            actions += `<button class="men-button" data-action="enable" data-user-id="${user.user_id}">Enable</button>`;
          }
          const newRole = user.role === "admin" ? "member" : "admin";
          actions += `<button class="men-button" data-action="role" data-user-id="${user.user_id}" data-role="${newRole}">Make ${newRole}</button>`;
          actions += `<button class="men-button" data-action="kick" data-user-id="${user.user_id}">Kick</button>`;
        }
        actions += `<button class="men-button" data-action="show-players" data-user-id="${user.user_id}">Players</button>`;

        return `
          <div class="admin-portal__user-row">
            <div class="admin-portal__user-info">
              <strong>${escapeHtml(user.username)}</strong>
              ${roleBadge}
              ${disabledBadge}
              <span style="font-size:0.85rem;color:#999" title="${escapeHtml(lastSeen)}">Last seen: ${escapeHtml(
          lastSeenRelative
        )}</span>
            </div>
            <div class="admin-portal__user-actions">${actions}</div>
          </div>
          <div class="admin-portal__linked-list" data-user-players-id="${user.user_id}" style="display:none"></div>
        `;
      })
      .join("");

    // Bind action buttons
    container.querySelectorAll("button[data-action]").forEach((btn) => {
      btn.addEventListener("click", () => this.handleUserAction(btn));
    });
  }

  async handleUserAction(btn) {
    const action = btn.dataset.action;
    const userId = parseInt(btn.dataset.userId);

    if (action === "show-players") {
      await this.toggleUserPlayers(userId);
      return;
    }

    try {
      let response;
      switch (action) {
        case "disable":
          response = await api.adminDisableUser(userId);
          break;
        case "enable":
          response = await api.adminEnableUser(userId);
          break;
        case "role":
          response = await api.adminChangeUserRole(userId, btn.dataset.role);
          break;
        case "kick":
          if (
            !confirm("Are you sure you want to kick this user? This will delete their account and revoke all tokens.")
          ) {
            return;
          }
          response = await api.adminKickUser(userId);
          break;
      }

      if (response && response.ok) {
        this.loadUsers();
        this.loadAuditLog();
      }
    } catch (e) {
      // ignore
    }
  }

  async toggleUserPlayers(userId) {
    const el = this.querySelector(`[data-user-players-id="${userId}"]`);
    if (!el) return;

    if (el.style.display !== "none") {
      el.style.display = "none";
      el.innerHTML = "";
      return;
    }

    try {
      const response = await api.adminGetUserPlayers(userId);
      if (!response.ok) return;
      const players = await response.json();
      if (players.length === 0) {
        el.innerHTML = "No linked players";
      } else {
        el.innerHTML = `<strong>Linked players:</strong> ${players.map((p) => escapeHtml(p)).join(", ")}`;
      }
      el.style.display = "";
    } catch (e) {
      // ignore
    }
  }

  async loadAuditLog() {
    try {
      const response = await api.adminGetAuditLog();
      if (!response.ok) return;
      const entries = await response.json();
      this.renderAuditLog(entries);
    } catch (e) {
      // ignore
    }
  }

  renderAuditLog(entries) {
    const container = this.querySelector(".admin-portal__audit-log");
    if (!container) return;

    if (entries.length === 0) {
      container.innerHTML = "<p>No audit entries yet.</p>";
      return;
    }

    container.innerHTML = entries
      .map((entry) => {
        const time = new Date(entry.created_at).toLocaleString();
        const timeRelative = relativeTime(entry.created_at);
        const details = entry.details || entry.action;
        return `
          <div class="admin-portal__audit-entry">
            <span class="admin-portal__audit-time" title="${escapeHtml(time)}">${escapeHtml(timeRelative)}</span>
            <span>${escapeHtml(details)}</span>
          </div>
        `;
      })
      .join("");
  }

  async loadHubStatus() {
    const container = this.querySelector(".admin-portal__hub-status");
    if (!container) return;
    try {
      const response = await api.adminGetHubStatus();
      if (!response.ok) return;
      const status = await response.json();
      this.renderHubStatus(container, status);
    } catch (e) {
      // ignore
    }
  }

  renderHubStatus(container, status) {
    container.hidden = false;
    const usesHub = status.data_source === "hub" || status.data_source === "both";
    const rows = [["Data source", status.data_source || "direct"]];
    if (usesHub) {
      rows.push(
        ["Hub", status.base_url],
        ["Last sync", relativeTime(status.last_success)],
        ["Accounts", `${status.accounts_visible} visible, ${status.accounts_online} online`],
        ["Orphaned", String(status.members_orphaned)],
        ["History", status.history_enabled ? `on (${status.events_buffered} events buffered)` : "off"]
      );
    }

    const heading = document.createElement("h4");
    heading.textContent = "Data source";
    const list = document.createElement("dl");
    for (const [label, value] of rows) {
      const dt = document.createElement("dt");
      dt.textContent = label;
      const dd = document.createElement("dd");
      dd.textContent = value ?? "";
      list.append(dt, dd);
    }
    const children = [heading, list];

    if (usesHub && status.last_error && status.consecutive_failures > 0) {
      const error = document.createElement("div");
      error.className = "admin-portal__hub-error";
      error.textContent = `Last error (${relativeTime(status.last_error_at)}): ${status.last_error}`;
      children.push(error);
    }

    if (usesHub) {
      const button = document.createElement("button");
      button.className = "men-button";
      button.textContent = "Test connection";
      const result = document.createElement("div");
      button.addEventListener("click", async () => {
        button.disabled = true;
        result.textContent = "Testing...";
        try {
          const response = await api.adminTestHub();
          const test = await response.json();
          result.textContent = test.ok
            ? `OK: key "${test.key.name}" (${test.key.categories.join(", ")}), ` +
              `${test.visible_accounts ?? "?"} accounts visible`
            : test.message;
        } catch (e) {
          result.textContent = "The test request failed.";
        }
        button.disabled = false;
      });
      children.push(button, result);
    }
    container.replaceChildren(...children);
  }

  async loadPlayers() {
    try {
      const response = await api.adminListPlayers();
      if (!response.ok) return;
      const players = await response.json();
      this.renderPlayers(players);
    } catch (e) {
      // ignore
    }
  }

  renderPlayers(players) {
    const container = this.querySelector(".admin-portal__player-list");
    if (!container) return;

    if (players.length === 0) {
      container.innerHTML = "<p>No players yet.</p>";
      return;
    }

    container.innerHTML = players
      .map((player) => {
        const lastUpdated = player.last_updated ? new Date(player.last_updated).toLocaleString() : "";
        const lastUpdatedRelative = relativeTime(player.last_updated);
        const isStale = player.last_updated
          ? Date.now() - new Date(player.last_updated).getTime() > STALE_THRESHOLD_MS
          : true;
        const staleBadge = isStale ? `<span class="admin-portal__badge admin-portal__badge--stale">stale</span>` : "";
        const sourceBadge = player.hub_linked
          ? `<span class="admin-portal__badge admin-portal__badge--hub" title="Synced from osrs-data-hub">hub</span>`
          : "";
        const orphanedBadge = player.hub_orphaned_at
          ? `<span class="admin-portal__badge admin-portal__badge--orphaned" title="No longer visible on the hub">not shared</span>`
          : "";

        return `
          <div class="admin-portal__player-row">
            <span class="admin-portal__player-name">${escapeHtml(player.member_name)}</span>
            ${staleBadge}
            ${sourceBadge}
            ${orphanedBadge}
            <span class="admin-portal__player-spacer"></span>
            <div class="admin-portal__player-actions">
              <span class="admin-portal__badge admin-portal__badge--time" title="${escapeHtml(
                lastUpdated
              )}">${escapeHtml(lastUpdatedRelative)}</span>
              <button class="men-button" data-player-action="show-users" data-player-name="${escapeHtml(
                player.member_name
              )}">Users</button>
              <button class="men-button" data-player-action="delete" data-player-name="${escapeHtml(
                player.member_name
              )}">Remove</button>
            </div>
          </div>
          <div class="admin-portal__linked-list" data-player-users-name="${escapeHtml(
            player.member_name
          )}" style="display:none"></div>
        `;
      })
      .join("");

    container.querySelectorAll("button[data-player-action]").forEach((btn) => {
      btn.addEventListener("click", () => this.handlePlayerAction(btn));
    });
  }

  async handlePlayerAction(btn) {
    const action = btn.dataset.playerAction;
    const playerName = btn.dataset.playerName;

    if (action === "show-users") {
      await this.togglePlayerUsers(playerName);
      return;
    }

    if (action === "delete") {
      if (
        !confirm(`Are you sure you want to remove player '${playerName}'? All player data will be permanently deleted.`)
      ) {
        return;
      }
      try {
        const response = await api.adminDeletePlayer(playerName);
        if (response && response.ok) {
          this.loadPlayers();
          this.loadAuditLog();
        }
      } catch (e) {
        // ignore
      }
    }
  }

  async togglePlayerUsers(playerName) {
    const el = this.querySelector(`[data-player-users-name="${CSS.escape(playerName)}"]`);
    if (!el) return;

    if (el.style.display !== "none") {
      el.style.display = "none";
      el.replaceChildren();
      return;
    }

    await this.renderPlayerUsers(el, playerName);
    el.style.display = "";
  }

  async renderPlayerUsers(el, playerName) {
    try {
      const [linksResponse, usersResponse] = await Promise.all([
        api.adminGetPlayerUsers(playerName),
        api.adminListUsers(),
      ]);
      if (!linksResponse.ok) return;
      const links = await linksResponse.json();
      const users = usersResponse.ok ? await usersResponse.json() : [];

      const linked = document.createElement("div");
      const label = document.createElement("strong");
      label.textContent = links.length ? "Linked users: " : "No linked users";
      linked.append(label);
      for (const link of links) {
        const item = document.createElement("span");
        item.className = "admin-portal__linked-user";
        item.textContent = `${link.username} (${link.source})`;
        const unlink = document.createElement("button");
        unlink.className = "men-button small";
        unlink.textContent = "Unlink";
        unlink.addEventListener("click", async () => {
          const response = await api.adminUnlinkPlayerUser(playerName, link.user_id);
          if (response.ok) {
            await this.renderPlayerUsers(el, playerName);
            this.loadAuditLog();
          }
        });
        item.append(unlink);
        linked.append(item);
      }

      const linkedIds = new Set(links.map((link) => link.user_id));
      const candidates = users.filter((user) => !linkedIds.has(user.user_id));
      const children = [linked];
      if (candidates.length) {
        const form = document.createElement("div");
        form.className = "admin-portal__link-user";
        const select = document.createElement("select");
        for (const user of candidates) {
          select.append(new Option(user.username, String(user.user_id)));
        }
        const link = document.createElement("button");
        link.className = "men-button small";
        link.textContent = "Link user";
        link.addEventListener("click", async () => {
          const response = await api.adminLinkPlayerUser(playerName, select.value);
          if (response.ok) {
            await this.renderPlayerUsers(el, playerName);
            this.loadAuditLog();
          }
        });
        form.append(select, link);
        children.push(form);
      }
      el.replaceChildren(...children);
    } catch (e) {
      // ignore
    }
  }
}

customElements.define("admin-portal", AdminPortal);
