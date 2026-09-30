import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/data/api", () => ({
  api: {
    getGePrices: vi.fn(),
  },
}));

import { Item } from "../src/data/item";
import { api } from "../src/data/api";
import { pubsub } from "../src/data/pubsub";

describe("item", () => {
  beforeEach(() => {
    Item.itemDetails = {
      4151: {
        id: 4151,
        name: "Abyssal whip",
        highalch: 72000,
        stacks: [
          { count: 1, id: 4151 },
          { count: 10, id: 4152 },
        ],
      },
      995: {
        id: 995,
        name: "Coins",
        highalch: 0,
        stacks: null,
      },
    };
    Item.gePrices = { 4151: 2100000 };
  });

  it("derives image id from stack thresholds", () => {
    expect(Item.imageUrl(4151, 1)).toBe("/icons/items/4151.webp");
    expect(Item.imageUrl(4151, 10)).toBe("/icons/items/4152.webp");
  });

  it("parses item payloads replacing unknown ids with placeholders", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const parsed = Item.parseItemData([
      { id: 0, quantity: 0 },
      { id: 999999, quantity: 1 },
      { id: 4151, quantity: 2 },
    ]);

    expect(parsed).toHaveLength(3);
    expect(parsed[0].id).toBe(0);
    expect(parsed[0].quantity).toBe(0);
    expect(parsed[1].id).toBe(0);
    expect(parsed[1].quantity).toBe(0);
    expect(parsed[2].id).toBe(4151);
    expect(parsed[2].quantity).toBe(2);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("exposes computed item fields on instances", () => {
    const item = new Item("4151", 25);

    expect(item.id).toBe(4151);
    expect(item.imageUrl).toBe("/icons/items/4152.webp");
    expect(item.name).toBe("Abyssal whip");
    expect(item.highAlch).toBe(72000);
    expect(item.gePrice).toBe(2100000);
    expect(item.wikiLink).toContain("id=4151");
    expect(item.isValid()).toBe(true);
    expect(item.isRunePouch()).toBe(false);
    expect(new Item(12791, 1).isRunePouch()).toBe(true);
  });

  it("falls back ge price to zero when missing", () => {
    Item.gePrices = {};

    expect(new Item(995, 100).gePrice).toBe(0);
  });

  it("loads item metadata and publishes load event", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      json: async () => ({
        4151: { name: "Abyssal whip", stacks: [[1, 4151], [10, 4152]] },
      }),
    });

    await Item.loadItems();

    expect(Item.itemDetails[4151].id).toBe("4151");
    expect(Item.itemDetails[4151].stacks).toEqual([
      { count: 1, id: 4151 },
      { count: 10, id: 4152 },
    ]);
    expect(pubsub.getMostRecent("item-data-loaded")).toEqual([]);
  });

  it("loads ge prices from api response", async () => {
    api.getGePrices.mockResolvedValue({
      json: async () => ({ 4151: 123456 }),
    });

    await Item.loadGePrices();

    expect(Item.gePrices[4151]).toBe(123456);
  });

  it("generates random packed items with optional quantity", () => {
    Item.itemDetails = {
      1: { id: 1, name: "A" },
      2: { id: 2, name: "B" },
    };

    vi.spyOn(Math, "random")
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.5);

    expect(Item.randomItem(50)).toEqual([1, 50]);
    expect(Item.randomItem()).toEqual([1, 50001]);
  });

  it("expands randomItems into packed [id, quantity] pairs", () => {
    Item.itemDetails = {
      1: { id: 1, name: "A" },
      2: { id: 2, name: "B" },
    };
    vi.spyOn(Math, "random").mockReturnValue(0);

    expect(Item.randomItems(3, 7)).toEqual([1, 7, 1, 7, 1, 7]);
  });
});
