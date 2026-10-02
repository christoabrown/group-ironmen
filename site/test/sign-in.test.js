import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../src/data/api";
import { pubsub } from "../src/data/pubsub";
import { session } from "../src/data/session";
import "../src/login-page/login-page";
import "../src/discord-callback/discord-callback";
import "../src/logout-page/logout-page";
import "../src/app-navigation/app-navigation";
import "../src/admin-portal/admin-portal";

const ok = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
const refused = (status, text) => ({ ok: false, status, json: async () => ({}), text: async () => text });

function mount(tag) {
  const element = document.createElement(tag);
  document.body.appendChild(element);
  return element;
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  session.clear();
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("who is signed in", () => {
  it("is what the server says, and nobody when it says so or can't be asked", async () => {
    const heard = [];
    pubsub.subscribe("session", (who) => heard.push(who));

    vi.spyOn(api, "getMe").mockResolvedValueOnce(ok({ name: "Alice", is_admin: true }));
    await expect(session.load()).resolves.toEqual({ name: "Alice", is_admin: true });
    expect(session.isAdmin).toBe(true);

    api.getMe.mockResolvedValueOnce(refused(401, "Not authenticated"));
    await expect(session.load()).resolves.toBeNull();
    expect(session.isAdmin).toBe(false);

    api.getMe.mockRejectedValueOnce(new Error("offline"));
    await expect(session.load()).resolves.toBeNull();

    expect(heard).toEqual([null, { name: "Alice", is_admin: true }, null, null]);
  });
});

describe("the login page", () => {
  it("asks where to sign in when the button is pressed, and goes there", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    vi.spyOn(api, "discordStart").mockResolvedValue({ auth_url: "https://discord.example/authorize?state=abc" });

    const page = mount("login-page");
    expect(api.discordStart).not.toHaveBeenCalled();
    page.querySelector(".login__discord-button").click();
    await settle();

    expect(assign).toHaveBeenCalledWith("https://discord.example/authorize?state=abc");
    vi.unstubAllGlobals();
  });

  it("says so when signing in can't be started", async () => {
    vi.spyOn(api, "discordStart").mockRejectedValue(new Error("Signing in can't be started (502)"));

    const page = mount("login-page");
    const button = page.querySelector(".login__discord-button");
    button.click();
    await settle();

    expect(page.querySelector(".login__error").textContent).toContain("502");
    expect(button.disabled).toBe(false);
  });
});

describe("coming back from Discord", () => {
  function comeBack(search) {
    window.history.replaceState("", "", `/login/discord${search}`);
    return mount("discord-callback");
  }

  it("signs in a member and opens the map", async () => {
    vi.spyOn(api, "discordCallback").mockResolvedValue(ok({ name: "Alice", is_admin: false }));
    const pushState = vi.spyOn(window.history, "pushState");

    comeBack("?code=the-code&state=the-state");
    await settle();

    expect(api.discordCallback).toHaveBeenCalledWith("the-code", "the-state");
    expect(session.current).toEqual({ name: "Alice", is_admin: false });
    expect(pushState).toHaveBeenCalledWith("", "", "/guild");
    // Nothing of the session is kept where a script could read it.
    expect(localStorage.length).toBe(0);
  });

  it("shows what the server says to someone the hub doesn't know", async () => {
    vi.spyOn(api, "discordCallback").mockResolvedValue(
      refused(403, "Sign in to the hub once first, then try again here."),
    );
    const pushState = vi.spyOn(window.history, "pushState");

    const page = comeBack("?code=the-code&state=the-state");
    await settle();

    expect(page.querySelector(".discord-callback__error").textContent).toContain("Sign in to the hub once first");
    // With a way back to try again.
    expect(page.querySelector(".discord-callback__retry").hidden).toBe(false);
    expect(session.current).toBeNull();
    expect(pushState).not.toHaveBeenCalled();
  });

  it("says why when Discord sent no code", async () => {
    vi.spyOn(api, "discordCallback");

    const page = comeBack("?error=access_denied");
    await settle();

    expect(api.discordCallback).not.toHaveBeenCalled();
    expect(page.querySelector(".discord-callback__error").textContent).toContain("access_denied");
  });
});

describe("signing out", () => {
  it("ends the session on the server and forgets who was signed in", async () => {
    session.set({ name: "Alice", is_admin: false });
    vi.spyOn(api, "logout").mockResolvedValue(ok({ ok: true }));
    vi.spyOn(api, "disable").mockResolvedValue();
    const pushState = vi.spyOn(window.history, "pushState");

    mount("logout-page");
    await settle();

    expect(api.logout).toHaveBeenCalled();
    expect(session.current).toBeNull();
    expect(pushState).toHaveBeenCalledWith("", "", "/");
  });
});

describe("the navigation", () => {
  it("shows the name and the Admin link once it is known who is signed in", () => {
    const nav = mount("app-navigation");
    const name = nav.querySelector(".app-navigation__guild-name");
    const admin = nav.querySelector(".app-navigation__admin");
    expect(admin.hidden).toBe(true);

    session.set({ name: "Alice", is_admin: false });
    expect(name.textContent).toBe("Alice");
    expect(admin.hidden).toBe(true);

    session.set({ name: "The Admin", is_admin: true });
    expect(name.textContent).toBe("The Admin");
    expect(admin.hidden).toBe(false);
  });
});

describe("the admin page", () => {
  const players = [
    { member_name: "Alpha", hub_linked: true, online: true, last_updated: new Date().toISOString(), hidden: false },
    {
      member_name: '<img src=x onerror="alert(1)">',
      hub_linked: true,
      hub_orphaned_at: "2026-09-01T00:00:00Z",
      online: false,
      last_seen: "2026-09-01T00:00:00Z",
      hidden: true,
    },
  ];
  const status = { base_url: "http://hub", accounts_visible: 2, accounts_online: 1, members_orphaned: 1 };

  beforeEach(() => {
    vi.spyOn(api, "adminListPlayers").mockResolvedValue(ok(players));
    vi.spyOn(api, "adminGetHubStatus").mockResolvedValue(ok(status));
  });

  it("waits until it is known who is signed in, and sends anyone but an admin away", async () => {
    const pushState = vi.spyOn(window.history, "pushState");
    const page = mount("admin-portal");
    expect(page.children).toHaveLength(0);
    expect(pushState).not.toHaveBeenCalled();

    session.set({ name: "Alice", is_admin: false });
    await settle();
    expect(pushState).toHaveBeenCalledWith("", "", "/guild");
    expect(api.adminListPlayers).not.toHaveBeenCalled();
  });

  it("lists the players for an admin, with what can be done to each", async () => {
    session.set({ name: "The Admin", is_admin: true });
    const page = mount("admin-portal");
    await settle();

    const rows = [...page.querySelectorAll(".admin-portal__player-row")];
    const actions = (row) => [...row.querySelectorAll("button")].map((button) => button.textContent);
    expect(rows).toHaveLength(2);
    // A shared player can be hidden; one the hub no longer shares can go.
    expect(actions(rows[0])).toEqual(["Hide"]);
    expect(actions(rows[1])).toEqual(["Show", "Delete"]);
    // A name is text, whatever is in it.
    expect(rows[1].querySelector(".admin-portal__player-name").textContent).toBe(players[1].member_name);
    expect(rows[1].querySelector("img")).toBeNull();
    expect(page.querySelector(".admin-portal__hub-status").textContent).toContain("http://hub");
  });

  it("hides a player and reads the list again", async () => {
    vi.spyOn(api, "adminSetPlayerHidden").mockResolvedValue(ok({ ok: true }));
    session.set({ name: "The Admin", is_admin: true });
    const page = mount("admin-portal");
    await settle();

    page.querySelector('[data-player-action="hide"]').click();
    await settle();

    expect(api.adminSetPlayerHidden).toHaveBeenCalledWith("Alpha", true);
    expect(api.adminListPlayers).toHaveBeenCalledTimes(2);
  });
});
