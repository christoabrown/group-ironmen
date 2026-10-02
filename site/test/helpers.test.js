import { afterEach, describe, expect, it, vi } from "vitest";
import { BaseElement } from "../src/base-element/base-element";
import { clockTime, escapeHtml, shortDay } from "../src/data/format";
import { remember, remembered } from "../src/data/storage";
import { el, reorder } from "../src/dom";
import { drawerInset, setDrawerSide } from "../src/player-profile/drawer-inset";

describe("what is written the same everywhere", () => {
  it("a time of day and a day, in the reader's own way of writing them", () => {
    const moment = new Date(2026, 8, 26, 14, 5);
    expect(clockTime(moment)).toBe(moment.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    expect(clockTime(moment.getTime())).toBe(clockTime(moment));
    expect(shortDay(moment)).toBe(moment.toLocaleDateString([], { day: "numeric", month: "short" }));
  });

  it("text from elsewhere, so that none of it is read as HTML", () => {
    expect(escapeHtml(`<img src=x onerror="alert('1')">&`)).toBe(
      "&#60;img src=x onerror=&#34;alert(&#39;1&#39;)&#34;&#62;&#38;"
    );
    expect(escapeHtml(42)).toBe("42");
  });

  it("an element with its text as text", () => {
    const element = el("span", "note", "<b>bold</b>");
    expect(element.className).toBe("note");
    expect(element.textContent).toBe("<b>bold</b>");
    expect(element.children).toHaveLength(0);
    expect(el("div").className).toBe("");
  });

  it("a list put in order, moving only what is out of place", () => {
    const list = el("ul");
    const [a, b, c, d] = ["a", "b", "c", "d"].map((name) => el("li", "", name));
    list.append(a, b, c, d);
    const moved = [];
    const insertBefore = list.insertBefore.bind(list);
    list.insertBefore = (node, before) => {
      moved.push(node.textContent);
      return insertBefore(node, before);
    };

    // d goes to the front and b leaves.
    reorder(list, [d, a, c]);
    expect([...list.children].map((li) => li.textContent)).toEqual(["d", "a", "c"]);
    expect(moved).toEqual(["d", "c"]);

    moved.length = 0;
    reorder(list, [d, a, c]);
    expect(moved).toEqual([]);
  });
});

describe("what the browser remembers", () => {
  it("comes back as it was put away", () => {
    remember("a-setting", { status: "online", sort: "name" });
    expect(remembered("a-setting")).toEqual({ status: "online", sort: "name" });
    remember("a-flag", false);
    expect(remembered("a-flag", true)).toBe(false);
  });

  it("is the fallback when there is nothing, or nothing readable", () => {
    expect(remembered("never-set")).toBeNull();
    expect(remembered("never-set", [])).toEqual([]);
    localStorage.setItem("broken", "{not json");
    expect(remembered("broken", { ok: true })).toEqual({ ok: true });
  });

  it("does without when the browser refuses", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("private mode");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("private mode");
    });
    expect(() => remember("a-setting", 1)).not.toThrow();
    expect(remembered("a-setting", "fallback")).toBe("fallback");
  });
});

describe("an element's interval", () => {
  class Ticker extends BaseElement {}
  customElements.define("test-ticker", Ticker);

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("runs while the element is on the page and stops when it leaves", () => {
    vi.useFakeTimers();
    const ticker = document.createElement("test-ticker");
    const tick = vi.fn();
    // Not on the page yet: nothing to keep going.
    ticker.every(1000, tick);
    document.body.appendChild(ticker);
    ticker.every(1000, tick);

    vi.advanceTimersByTime(3000);
    expect(tick).toHaveBeenCalledTimes(3);

    ticker.remove();
    vi.advanceTimersByTime(3000);
    expect(tick).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("the profile drawer", () => {
  afterEach(() => setDrawerSide(null));

  it("covers one side of a wide page while it is open, and none of a narrow one", () => {
    expect(drawerInset(1280)).toEqual({ left: 0, right: 0 });

    setDrawerSide("right");
    expect(document.body.classList.contains("profile-open")).toBe(true);
    expect(drawerInset(1280)).toEqual({ left: 0, right: 404 });
    // On a narrow screen it takes all of it: there is no side to keep clear of.
    expect(drawerInset(600)).toEqual({ left: 0, right: 0 });

    setDrawerSide("left");
    expect(document.body.className).toBe("profile-open-left");
    expect(drawerInset(1280)).toEqual({ left: 404, right: 0 });

    setDrawerSide(null);
    expect(document.body.className).toBe("");
  });
});
