import { describe, expect, it } from "vitest";
import { utility } from "../src/utility";

describe("utility", () => {
  it("formats quantities with K/M/B suffixes", () => {
    expect(utility.formatShortQuantity(99999)).toBe(99999);
    expect(utility.formatShortQuantity(100000)).toBe("100K");
    expect(utility.formatShortQuantity(10000000)).toBe("10M");
    expect(utility.formatShortQuantity(1000000000)).toBe("1B");
  });

  it("compares sets for equality", () => {
    expect(utility.setsEqual(new Set([1, 2]), new Set([2, 1]))).toBe(true);
    expect(utility.setsEqual(new Set([1, 2]), new Set([1]))).toBe(false);
    expect(utility.setsEqual(undefined, new Set([1]))).toBe(false);
  });

  it("computes array average", () => {
    expect(utility.average([2, 4, 6, 8])).toBe(5);
  });
});
