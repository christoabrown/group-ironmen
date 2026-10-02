import { BaseElement } from "../base-element/base-element";
import { el } from "../dom";
import { api } from "../data/api";
import { relativeTime } from "../data/format";

const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function describeHubKey(status) {
  if (!status.key_kind) return `not checked yet (budget ${status.request_budget_per_min}/min)`;
  const kind = status.key_kind === "service" ? "service key" : "personal key";
  const limit = status.key_rate_limit_per_minute ? `${status.key_rate_limit_per_minute}/min, ` : "";
  return `${kind} (${limit}using ${status.request_budget_per_min}/min, ${status.bulk_accounts} per bulk request)`;
}

const ago = (time) => (time ? relativeTime(time) : "never");

function badge(kind, text, title) {
  const element = el("span", `admin-portal__badge admin-portal__badge--${kind}`, text);
  if (title) element.title = title;
  return element;
}

/**
 * For the hub's admins: every player the hub shares (hide one from the map,
 * delete one the hub no longer shares) and the state of the hub connection.
 * Who is an admin is the hub's to say; the server checks it on every request.
 */
export class AdminPortal extends BaseElement {
  constructor() {
    super();
  }

  html() {
    return `{{admin-portal.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.subscribe("session", this.handleSession.bind(this));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.shown = false;
  }

  handleSession(who) {
    // Not known yet, or nobody: the page is on its way to the login then.
    if (!who) return;
    if (!who.is_admin) {
      window.history.pushState("", "", "/group");
      return;
    }
    if (this.shown) return;
    this.shown = true;
    this.render();
    this.playerFilter = this.querySelector(".admin-portal__player-filter");
    this.eventListener(this.playerFilter, "input", () => this.applyFilter());
    this.loadHubStatus();
    this.loadPlayers();
  }

  /** Hides the players whose name doesn't contain the filter text. */
  applyFilter() {
    const query = this.playerFilter.value.trim().toLowerCase();
    for (const row of this.querySelectorAll(".admin-portal__player-list [data-filter-name]")) {
      row.hidden = query !== "" && !row.dataset.filterName.toLowerCase().includes(query);
    }
  }

  async loadHubStatus() {
    const container = this.querySelector(".admin-portal__hub-status");
    try {
      const response = await api.adminGetHubStatus();
      if (!response.ok) return;
      const status = await response.json();
      this.renderHubStatus(container, status);
    } catch {
      // The box stays empty.
    }
  }

  renderHubStatus(container, status) {
    const rows = [
      ["Hub", status.base_url],
      ["Last sync", ago(status.last_success)],
      ["Accounts", `${status.accounts_visible} visible, ${status.accounts_online} online`],
      ["Key", describeHubKey(status)],
      ["Orphaned", String(status.members_orphaned)],
      ["History", status.history_enabled ? `on (${status.events_buffered} events buffered)` : "off"],
    ];

    const list = document.createElement("dl");
    for (const [label, value] of rows) {
      const dt = document.createElement("dt");
      dt.textContent = label;
      const dd = document.createElement("dd");
      dd.textContent = value ?? "";
      list.append(dt, dd);
    }
    const children = [list];

    if (status.last_error && status.consecutive_failures > 0) {
      const error = document.createElement("div");
      error.className = "admin-portal__hub-error";
      error.textContent = `Last error (${ago(status.last_error_at)}): ${status.last_error}`;
      children.push(error);
    }

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
        if (!test.ok) {
          result.textContent = test.message;
        } else {
          const kind = test.key.kind === "service" ? "service key" : "personal key";
          const limit = test.key.rate_limit_per_minute ? `, ${test.key.rate_limit_per_minute}/min` : "";
          result.textContent =
            `OK: ${kind} "${test.key.name}"${limit} (${test.key.categories.join(", ")}), ` +
            `${test.visible_accounts ?? "?"} accounts visible` +
            (test.key.kind === "service"
              ? ""
              : ". Nobody can sign in with a personal key: the hub only tells a service key who is a member.");
        }
      } catch {
        result.textContent = "The test request failed.";
      }
      button.disabled = false;
    });
    children.push(button, result);
    container.replaceChildren(...children);
  }

  async loadPlayers() {
    try {
      const response = await api.adminListPlayers();
      if (!response.ok) return;
      const players = await response.json();
      this.renderPlayers(players);
    } catch {
      // The list stays as it is.
    }
  }

  renderPlayers(players) {
    const container = this.querySelector(".admin-portal__player-list");
    if (!container) return;

    if (players.length === 0) {
      container.replaceChildren(el("p", "", "No players yet."));
      return;
    }
    container.replaceChildren(...players.map((player) => this.playerRow(player)));
    this.applyFilter();
  }

  playerRow(player) {
    const name = player.member_name;
    const row = el("div", "admin-portal__player-row");
    row.dataset.filterName = name;
    row.append(el("span", "admin-portal__player-name", name));

    const lastData = player.last_updated ? new Date(player.last_updated) : null;
    if (!lastData || Date.now() - lastData.getTime() > STALE_THRESHOLD_MS) row.append(badge("stale", "stale"));
    if (player.hub_orphaned_at) row.append(badge("orphaned", "not shared", "No longer visible on the hub"));
    if (player.hidden) row.append(badge("hidden", "hidden", "Hidden from the guild's map and pages"));
    row.append(el("span", "admin-portal__player-spacer"));

    const actions = el("div", "admin-portal__player-actions");
    const presence = player.online
      ? "online"
      : player.last_seen
        ? `offline · ${relativeTime(player.last_seen)}`
        : "offline";
    const seen = badge(
      "time",
      presence,
      [
        player.last_seen ? `Last seen: ${new Date(player.last_seen).toLocaleString()}` : "",
        lastData ? `Last data: ${lastData.toLocaleString()}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
    seen.classList.toggle("admin-portal__badge--online", Boolean(player.online));
    actions.append(seen);
    if (player.hub_linked) actions.append(this.actionButton(player.hidden ? "show" : "hide", name));
    // The hub brings back a player it still shares, so only the others can go.
    if (player.hub_orphaned_at || !player.hub_linked) actions.append(this.actionButton("delete", name));
    row.append(actions);
    return row;
  }

  actionButton(action, playerName) {
    const button = el("button", "men-button", action[0].toUpperCase() + action.slice(1));
    button.type = "button";
    button.dataset.playerAction = action;
    button.addEventListener("click", () => this.handlePlayerAction(action, playerName));
    return button;
  }

  async handlePlayerAction(action, playerName) {
    if (
      action === "delete" &&
      !window.confirm(
        `Are you sure you want to delete player '${playerName}'? All player data will be permanently deleted.`,
      )
    ) {
      return;
    }
    try {
      const response =
        action === "delete"
          ? await api.adminDeletePlayer(playerName)
          : await api.adminSetPlayerHidden(playerName, action === "hide");
      if (response.ok) this.loadPlayers();
    } catch {
      // The list stays as it is.
    }
  }
}

customElements.define("admin-portal", AdminPortal);
