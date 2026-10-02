import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../src/data/api";
import { Item } from "../src/data/item";
import { pubsub } from "../src/data/pubsub";
import { session } from "../src/data/session";
import { selection } from "../src/data/selection";
import "../src/app-initializer/app-initializer";

describe("app initializer", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    selection.reset();
  });

  function start({ signedIn }) {
    vi.spyOn(Item, "loadItems").mockResolvedValue();
    vi.spyOn(Item, "loadGePrices").mockResolvedValue();
    const who = { name: "Alice", is_admin: false };
    vi.spyOn(api, "getMe").mockResolvedValue(
      signedIn ? { ok: true, json: async () => who } : { ok: false, status: 401 },
    );
    vi.spyOn(api, "loadFeatures").mockResolvedValue({ hub_history: false });
    vi.spyOn(api, "enable").mockResolvedValue();
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false });
    document.body.appendChild(document.createElement("loading-screen"));
    document.body.appendChild(document.createElement("app-initializer"));
  }

  // The map page asks for the trails as soon as it hears of them, which needs
  // someone signed in and every component of the page in place: not the moment
  // the initializer itself is connected, while the rest of the bundle still loads.
  it("brings the remembered trails back once it is known who is signed in, not before", async () => {
    localStorage.setItem("map-trails", JSON.stringify(["Alice"]));
    const signedInWhenPublished = [];
    pubsub.subscribe("trails-changed", () => signedInWhenPublished.push(session.current?.name));
    session.clear();

    start({ signedIn: true });
    expect(signedInWhenPublished).toEqual([]);

    await vi.waitFor(() => expect(signedInWhenPublished).toEqual(["Alice"]));
    expect(selection.hasTrail("Alice")).toBe(true);
    pubsub.publish("get-group-data");
  });

  it("goes to the login page when nobody is signed in, and starts nothing", async () => {
    const pushState = vi.spyOn(window.history, "pushState");

    start({ signedIn: false });

    await vi.waitFor(() => expect(pushState).toHaveBeenCalledWith("", "", "/login"));
    expect(api.enable).not.toHaveBeenCalled();
    expect(session.current).toBeNull();
  });
});
