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
    pubsub.publish("route-activated", "map");

    const received = [];
    pubsub.subscribe("route-activated", (...args) => received.push(args));

    expect(received).toEqual([["map"]]);
  });

  it("does not notify after unsubscribe", () => {
    const received = [];
    const subscriber = (...args) => received.push(args);
    pubsub.subscribe("roster-changed", subscriber, false);
    pubsub.unsubscribe("roster-changed", subscriber);
    pubsub.publish("roster-changed", "alice");

    expect(received).toEqual([]);
  });

  it("waitUntilNextEvent resolves once event publishes", async () => {
    const wait = pubsub.waitUntilNextEvent("item-data-loaded", false);

    pubsub.publish("item-data-loaded");

    await expect(wait).resolves.toBeUndefined();
  });

  it("waitForAllEvents resolves after all events fire", async () => {
    const wait = pubsub.waitForAllEvents("item-data-loaded", "features");

    pubsub.publish("item-data-loaded");
    pubsub.publish("features");

    await expect(wait).resolves.toEqual([undefined, undefined]);
  });
});
