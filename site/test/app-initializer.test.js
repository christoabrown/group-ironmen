import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../src/data/api";
import { Item } from "../src/data/item";
import { pubsub } from "../src/data/pubsub";
import { storage } from "../src/data/storage";
import { selection } from "../src/data/selection";
import "../src/app-initializer/app-initializer";

describe("app initializer", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    selection.reset();
  });

  // The map page asks for the trails as soon as it hears of them, which needs
  // the session and every component of the page in place: not the moment the
  // initializer itself is connected, while the rest of the bundle still loads.
  it("brings the remembered trails back once the session is set, not before", async () => {
    localStorage.setItem("map-trails", JSON.stringify(["Alice"]));
    vi.spyOn(Item, "loadItems").mockResolvedValue();
    vi.spyOn(Item, "loadGePrices").mockResolvedValue();
    vi.spyOn(storage, "getSession").mockReturnValue({ sessionToken: "token", username: "me", role: "member" });
    vi.spyOn(api, "loadFeatures").mockResolvedValue({ hub_history: false });
    vi.spyOn(api, "enable").mockResolvedValue();
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false });

    const sessionWhenPublished = [];
    pubsub.subscribe("trails-changed", () => sessionWhenPublished.push(api.sessionToken));
    api.sessionToken = null;
    document.body.appendChild(document.createElement("loading-screen"));
    document.body.appendChild(document.createElement("app-initializer"));
    expect(sessionWhenPublished).toEqual([]);

    await vi.waitFor(() => expect(sessionWhenPublished).toEqual(["token"]));
    expect(selection.hasTrail("Alice")).toBe(true);
    pubsub.publish("get-group-data");
  });
});
