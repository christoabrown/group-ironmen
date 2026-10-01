import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TOAST_LEAVE_MS, TOAST_MAX, TOAST_MS, TOAST_NOTABLE_MS } from "../src/event-toasts/event-toasts";

const drop = (id, extra = {}) => ({
  id,
  type: "loot",
  member: "Alice",
  line: `Alice received drop ${id}`,
  value_gp: 250000,
  item_id: 4151,
  occurred_at: "2026-10-01T12:00:00Z",
  ...extra,
});

describe("event toasts", () => {
  let toasts;
  const shown = () => [...toasts.querySelectorAll(".event-toasts__toast:not(.event-toasts__toast--leaving)")];
  const texts = () => shown().map((toast) => toast.querySelector(".event-toasts__text").textContent);

  beforeEach(() => {
    vi.useFakeTimers();
    window.siteConfig = { iconsBaseUrl: "http://icons.test" };
    toasts = document.createElement("event-toasts");
    document.body.appendChild(toasts);
  });

  afterEach(() => {
    document.body.innerHTML = "";
    delete window.siteConfig;
  });

  it("waits for something to show without a timer running", () => {
    expect(shown()).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(toasts.getAttribute("aria-live")).toBe("polite");
  });

  it("shows an event with its icon and words, in the player's colour", () => {
    toasts.show(drop("a"), { color: "rgb(1, 2, 3)" });
    const [toast] = shown();
    expect(toast.tagName).toBe("BUTTON");
    expect(toast.querySelector(".event-toasts__text").textContent).toBe("Alice received drop a");
    expect(toast.querySelector("img").getAttribute("src")).toBe("http://icons.test/items/4151.webp");
    expect(toast.style.getPropertyValue("--member-color")).toBe("rgb(1, 2, 3)");
  });

  it("goes away after a while", () => {
    toasts.show(drop("a"));
    vi.advanceTimersByTime(TOAST_MS - 1);
    expect(shown()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(shown()).toHaveLength(0);
    vi.advanceTimersByTime(TOAST_LEAVE_MS);
    expect(toasts.children).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps a big drop for longer, and marks it", () => {
    toasts.show(drop("big", { value_gp: 35000000 }));
    expect(shown()[0].classList.contains("event-toasts__toast--tier-2")).toBe(true);
    vi.advanceTimersByTime(TOAST_MS);
    expect(shown()).toHaveLength(1);
    vi.advanceTimersByTime(TOAST_NOTABLE_MS - TOAST_MS);
    expect(shown()).toHaveLength(0);
  });

  it("holds on to everything while the pointer is over it", () => {
    toasts.show(drop("a"));
    vi.advanceTimersByTime(TOAST_MS - 1000);
    toasts.dispatchEvent(new Event("mouseenter"));
    vi.advanceTimersByTime(60000);
    expect(shown()).toHaveLength(1);

    toasts.dispatchEvent(new Event("mouseleave"));
    vi.advanceTimersByTime(999);
    expect(shown()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(shown()).toHaveLength(0);
  });

  it("holds a toast that arrives while the pointer is over the others", () => {
    toasts.dispatchEvent(new Event("mouseenter"));
    toasts.show(drop("a"));
    vi.advanceTimersByTime(TOAST_MS * 2);
    expect(shown()).toHaveLength(1);
  });

  it("drops the oldest when there are too many", () => {
    for (let i = 0; i < TOAST_MAX + 2; i++) toasts.show(drop(String(i)));
    expect(texts()).toEqual([
      "Alice received drop 2",
      "Alice received drop 3",
      "Alice received drop 4",
      "Alice received drop 5",
    ]);
  });

  it("shows an event once", () => {
    toasts.show(drop("a"));
    toasts.show(drop("a"));
    expect(shown()).toHaveLength(1);
  });

  it("says which event was clicked, and lets go of it", () => {
    const activated = [];
    toasts.addEventListener("toast-activated", (event) => activated.push(event.detail.event.id));
    toasts.show(drop("a"));
    toasts.show(drop("b"));
    shown()[1].click();
    expect(activated).toEqual(["b"]);
    expect(texts()).toEqual(["Alice received drop a"]);
  });

  it("leaves no timer behind when the page is left", () => {
    toasts.show(drop("a"));
    toasts.show(drop("b"));
    toasts.remove();
    expect(vi.getTimerCount()).toBe(0);
  });
});
