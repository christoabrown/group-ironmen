import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReplayClock } from "../src/trail-scrubber/replay-clock";
import "../src/trail-scrubber/trail-scrubber";

const T = 1_790_000_040;

describe("ReplayClock", () => {
  let clock;

  beforeEach(() => {
    clock = new ReplayClock();
    clock.setRange(T, T + 3600);
  });

  it("starts at the end of the range, paused", () => {
    expect(clock.time).toBe(T + 3600);
    expect(clock.playing).toBe(false);
    expect(clock.atEnd).toBe(true);
  });

  it("keeps a time that is looked up inside the range", () => {
    clock.seek(T + 100);
    expect(clock.time).toBe(T + 100);
    clock.seek(T - 500);
    expect(clock.time).toBe(T);
    clock.seek(T + 99999);
    expect(clock.time).toBe(T + 3600);
  });

  it("plays at its speed, in trail seconds per second", () => {
    clock.seek(T);
    clock.speed = 300;
    clock.play();
    expect(clock.tick(100)).toBe(true);
    expect(clock.time).toBe(T + 30);
  });

  it("doesn't leap ahead after a long pause between frames", () => {
    clock.seek(T);
    clock.speed = 300;
    clock.play();
    clock.tick(60000);
    expect(clock.time).toBe(T + 75);
  });

  it("stands still while paused", () => {
    clock.seek(T + 10);
    expect(clock.tick(100)).toBe(false);
    expect(clock.time).toBe(T + 10);
  });

  it("starts over when played from the end", () => {
    clock.play();
    expect(clock.time).toBe(T);
    expect(clock.playing).toBe(true);
  });

  it("stops at the end", () => {
    clock.seek(T + 3590);
    clock.speed = 300;
    clock.play();
    clock.tick(100);
    expect(clock.time).toBe(T + 3600);
    expect(clock.playing).toBe(false);
  });

  it("stays at the live end as it moves on, and keeps any other time", () => {
    clock.setRange(T, T + 3660);
    expect(clock.time).toBe(T + 3660);

    clock.seek(T + 100);
    clock.setRange(T, T + 3720);
    expect(clock.time).toBe(T + 100);

    clock.setRange(T + 600, T + 3720);
    expect(clock.time).toBe(T + 600);
  });

  it("skips to just before the next thing that happens", () => {
    clock.seek(T);
    clock.play();
    clock.tick(100, () => T + 2000);
    expect(clock.time).toBe(T + 2000 - 30);
  });

  it("doesn't skip a short wait, or anything when skipping is off", () => {
    clock.seek(T);
    clock.speed = 300;
    clock.play();
    clock.tick(100, () => T + 400);
    expect(clock.time).toBe(T + 30);

    clock.skipIdle = false;
    clock.tick(100, () => T + 3000);
    expect(clock.time).toBe(T + 60);
  });

  it("goes to the end when nothing more happens", () => {
    clock.seek(T);
    clock.play();
    clock.tick(100, () => null);
    expect(clock.time).toBe(T + 3600);
    expect(clock.playing).toBe(false);
  });
});

describe("trail scrubber", () => {
  let scrubber, changes;
  const timeline = {
    tMin: T,
    tMax: T + 3600,
    ticks: [
      { t: T + 900, kind: "teleport", color: "hsl(1, 70%, 45%)" },
      { t: T + 1800, kind: "death", color: "hsl(1, 70%, 45%)" },
    ],
  };

  beforeEach(() => {
    scrubber = document.createElement("trail-scrubber");
    scrubber.hidden = true;
    document.body.appendChild(scrubber);
    changes = [];
    scrubber.addEventListener("replay-change", (event) => changes.push(event.detail.time));
    scrubber.setTimeline(timeline);
  });

  afterEach(() => {
    scrubber.close();
    document.body.innerHTML = "";
  });

  const range = () => scrubber.querySelector(".trail-scrubber__range");
  const playButton = () => scrubber.querySelector(".trail-scrubber__play");

  it("says nothing until it is opened, then shows the end of the trails", () => {
    expect(changes).toEqual([]);
    scrubber.open();
    expect(scrubber.hidden).toBe(false);
    expect(changes).toEqual([T + 3600]);
    expect([range().min, range().max, range().value]).toEqual([String(T), String(T + 3600), String(T + 3600)]);
    expect(scrubber.querySelector(".trail-scrubber__time").textContent).toMatch(/\d{1,2}[:.]\d{2}/);
  });

  it("goes back to live when it is closed", () => {
    scrubber.open();
    scrubber.querySelector(".trail-scrubber__close").click();
    expect(scrubber.hidden).toBe(true);
    expect(changes).toEqual([T + 3600, null]);
  });

  it("shows the time the slider is dragged to", () => {
    scrubber.open();
    range().value = String(T + 600);
    range().dispatchEvent(new Event("input"));
    expect(changes[changes.length - 1]).toBe(T + 600);
    expect(range().getAttribute("aria-valuetext")).toBe(scrubber.querySelector(".trail-scrubber__time").textContent);
  });

  it("plays and pauses", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
    scrubber.open();
    playButton().click();
    expect(playButton().getAttribute("aria-label")).toBe("Pause");
    scrubber.querySelector(".trail-scrubber__skip input").checked = false;
    scrubber.querySelector(".trail-scrubber__skip input").dispatchEvent(new Event("change", { bubbles: true }));
    vi.advanceTimersByTime(200);
    const reached = changes[changes.length - 1];
    expect(reached).toBeGreaterThan(T);
    expect(reached).toBeLessThan(T + 3600);

    playButton().click();
    expect(playButton().getAttribute("aria-label")).toBe("Play");
    vi.advanceTimersByTime(200);
    expect(changes[changes.length - 1]).toBe(reached);
  });

  describe("following", () => {
    let follows;
    const box = () => scrubber.querySelector(".trail-scrubber__follow input");
    const untick = (checked) => {
      box().checked = checked;
      box().dispatchEvent(new Event("change", { bubbles: true }));
    };

    beforeEach(() => {
      follows = [];
      scrubber.addEventListener("replay-change", (event) => follows.push(event.detail.follow));
    });

    it("is asked of the map when a time is looked up, not when the replay merely opens", () => {
      scrubber.open();
      expect(box().checked).toBe(true);
      scrubber.seek(T + 600);
      expect(follows).toEqual([false, true]);
    });

    it("is asked of the map on every step while playing", () => {
      vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
      scrubber.open();
      playButton().click();
      vi.advanceTimersByTime(100);
      expect(follows.length).toBeGreaterThan(2);
      expect(follows.slice(1).every((follow) => follow === true)).toBe(true);
    });

    it("can be switched off, and on again: the map then catches up at once", () => {
      scrubber.open();
      untick(false);
      scrubber.seek(T + 600);
      expect(follows).toEqual([false, false]);
      untick(true);
      expect(follows).toEqual([false, false, true]);
      expect(changes[changes.length - 1]).toBe(T + 600);
    });

    it("stops when the map was moved by hand, until the next replay", () => {
      scrubber.open();
      scrubber.setFollow(false);
      expect(box().checked).toBe(false);
      scrubber.seek(T + 600);
      expect(follows[follows.length - 1]).toBe(false);

      scrubber.close();
      scrubber.open();
      expect(box().checked).toBe(true);
    });

    it("stays off for the next replay when it was switched off by choice", () => {
      scrubber.open();
      untick(false);
      scrubber.close();
      scrubber.open();
      expect(box().checked).toBe(false);
      untick(true);
      scrubber.close();
      scrubber.open();
      expect(box().checked).toBe(true);
    });

    it("isn't asked for when the replay closes", () => {
      scrubber.open();
      scrubber.close();
      expect(follows).toEqual([false, false]);
    });
  });

  it("plays faster at a higher speed", () => {
    const speed = scrubber.querySelector(".trail-scrubber__speed");
    expect([...speed.options].map((option) => option.value)).toEqual(["60", "300", "1800", "7200"]);
    scrubber.setWindowDays(7);
    expect(speed.value).toBe("1800");
    speed.value = "7200";
    speed.dispatchEvent(new Event("change", { bubbles: true }));
    expect(scrubber.clock.speed).toBe(7200);
  });

  it("toggles playing with the K key", () => {
    scrubber.open();
    scrubber.dispatchEvent(new KeyboardEvent("keydown", { key: "k", bubbles: true }));
    expect(scrubber.clock.playing).toBe(true);
    scrubber.dispatchEvent(new KeyboardEvent("keydown", { key: "k", bubbles: true }));
    expect(scrubber.clock.playing).toBe(false);
  });

  it("marks teleports and deaths on the track", () => {
    const ticks = [...scrubber.querySelectorAll(".trail-scrubber__tick")];
    expect(ticks.map((tick) => tick.style.left)).toEqual(["25%", "50%"]);
    expect(ticks[1].classList.contains("trail-scrubber__tick--death")).toBe(true);
  });

  it("follows the trails as they grow, and closes when there are none left", () => {
    scrubber.open();
    scrubber.setTimeline({ ...timeline, tMax: T + 3660 });
    expect(changes[changes.length - 1]).toBe(T + 3660);
    scrubber.setTimeline({ tMin: null, tMax: null, ticks: [] });
    expect(scrubber.hidden).toBe(true);
    expect(changes[changes.length - 1]).toBeNull();
  });

  it("asks what happens next so that it can skip the waiting", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
    scrubber.nextChange = vi.fn(() => T + 3000);
    scrubber.open();
    playButton().click();
    vi.advanceTimersByTime(50);
    expect(scrubber.nextChange).toHaveBeenCalled();
    expect(changes[changes.length - 1]).toBeGreaterThanOrEqual(T + 2970);
  });
});
