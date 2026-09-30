import { describe, expect, it } from "vitest";
import { pubsub } from "../src/data/pubsub";

describe("pubsub", () => {
  it("publishes to active subscribers", () => {
    const received = [];
    pubsub.subscribe("members-updated", (...args) => received.push(args), false);

    pubsub.publish("members-updated", "alice", 2);

    expect(received).toEqual([["alice", 2]]);
  });

  it("replays most recent event to new subscribers by default", () => {
    pubsub.publish("route-activated", "items");

    const received = [];
    pubsub.subscribe("route-activated", (...args) => received.push(args));

    expect(received).toEqual([["items"]]);
  });

  it("does not notify after unsubscribe", () => {
    const subscriber = () => {};
    pubsub.subscribe("items-updated", subscriber, false);
    pubsub.unsubscribe("items-updated", subscriber);

    expect(pubsub.anyoneListening("items-updated")).toBe(false);
  });

  it("waitUntilNextEvent resolves once event publishes", async () => {
    const wait = pubsub.waitUntilNextEvent("item-data-loaded", false);

    pubsub.publish("item-data-loaded");

    await expect(wait).resolves.toBeUndefined();
    expect(pubsub.anyoneListening("item-data-loaded")).toBe(false);
  });

  it("waitForAllEvents resolves after all events fire", async () => {
    const wait = pubsub.waitForAllEvents("item-data-loaded", "quest-data-loaded");

    pubsub.publish("item-data-loaded");
    pubsub.publish("quest-data-loaded");

    await expect(wait).resolves.toEqual([undefined, undefined]);
  });
});
