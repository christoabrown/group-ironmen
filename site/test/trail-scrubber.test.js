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

  describe("after a hop", () => {
    // The player lands somewhere else at T + 20.
    const landing = (from, to) => (from < T + 20 && to >= T + 20 ? T + 20 : null);

    beforeEach(() => {
      clock.seek(T);
      clock.speed = 300;
      clock.play();
    });

    it("stops where the player landed and waits a moment before going on", () => {
      const asked = vi.fn(landing);
      expect(clock.tick(100, null, asked)).toBe(true);
      expect(asked).toHaveBeenCalledWith(T, T + 30);
      expect(clock.time).toBe(T + 20);
      expect(clock.playing).toBe(true);

      // A second and a half, in frames of a quarter of a second.
      for (let i = 0; i < 6; i++) {
        expect(clock.tick(250, null, landing)).toBe(false);
        expect(clock.time).toBe(T + 20);
      }
      clock.tick(100, null, landing);
      expect(clock.time).toBe(T + 50);
    });

    it("doesn't wait when a time is looked up by hand, or after a pause", () => {
      clock.tick(100, null, landing);
      clock.seek(T + 100);
      clock.tick(100, null, landing);
      expect(clock.time).toBe(T + 130);

      clock.seek(T);
      clock.tick(100, null, landing);
      clock.pause();
      clock.play();
      clock.tick(100, null, landing);
      expect(clock.time).toBe(T + 50);
    });

    it("also stops at a landing it would have skipped to", () => {
      // Nothing happens until the player turns up elsewhere at T + 2000.
      clock.tick(
        100,
        () => T + 2000,
        (from, to) => (from < T + 2000 && to >= T + 2000 ? T + 2000 : null),
      );
      expect(clock.time).toBe(T + 1970);
      for (let i = 0; i < 3; i++)
        clock.tick(
          40,
          () => T + 2000,
          (from, to) => (from < T + 2000 && to >= T + 2000 ? T + 2000 : null),
        );
      expect(clock.time).toBe(T + 2000);
    });
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

  it("offers six speeds and starts at five minutes a second", () => {
    const speed = scrubber.querySelector(".trail-scrubber__speed");
    expect([...speed.options].map((option) => [option.value, option.textContent])).toEqual([
      ["60", "1 min/s"],
      ["120", "2 min/s"],
      ["300", "5 min/s"],
      ["1800", "30 min/s"],
      ["3600", "1 h/s"],
      ["7200", "2 h/s"],
    ]);
    expect(speed.value).toBe("300");
    expect(scrubber.clock.speed).toBe(300);
  });

  it("plays faster at a higher speed", () => {
    const speed = scrubber.querySelector(".trail-scrubber__speed");
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

  it("marks the other events by their kind, the notable ones more", () => {
    const color = "hsl(1, 70%, 45%)";
    scrubber.setTimeline({
      ...timeline,
      ticks: [
        { t: T + 360, kind: "loot", tier: 0, color },
        { t: T + 720, kind: "loot", tier: 2, color },
        { t: T + 1080, kind: "level", tier: 0, color },
        { t: T + 1440, kind: "other", tier: 1, color },
      ],
    });
    const classes = [...scrubber.querySelectorAll(".trail-scrubber__tick")].map((tick) =>
      tick.className.replace(/trail-scrubber__tick(--)?/g, "").trim(),
    );
    expect(classes).toEqual(["loot", "loot notable", "level", "other notable"]);
  });

  it("keeps deaths, then notable events, then teleports when there are too many to mark", () => {
    const color = "hsl(1, 70%, 45%)";
    const ticks = [];
    for (let i = 0; i < 400; i++) ticks.push({ t: T + i, kind: "level", tier: 0, color });
    for (let i = 0; i < 100; i++) ticks.push({ t: T + 1000 + i, kind: "teleport", color });
    for (let i = 0; i < 50; i++) ticks.push({ t: T + 2000 + i, kind: "loot", tier: 1, color });
    for (let i = 0; i < 20; i++) ticks.push({ t: T + 3000 + i, kind: "death", tier: 0, color });
    scrubber.setTimeline({ ...timeline, ticks });
    const count = (kind) => scrubber.querySelectorAll(`.trail-scrubber__tick--${kind}`).length;
    expect(scrubber.querySelectorAll(".trail-scrubber__tick")).toHaveLength(300);
    expect([count("death"), count("notable"), count("teleport"), count("level")]).toEqual([20, 50, 100, 130]);
  });

  it("follows the trails as they grow, and closes when there are none left", () => {
    scrubber.open();
    scrubber.setTimeline({ ...timeline, tMax: T + 3660 });
    expect(changes[changes.length - 1]).toBe(T + 3660);
    scrubber.setTimeline({ tMin: null, tMax: null, ticks: [] });
    expect(scrubber.hidden).toBe(true);
    expect(changes[changes.length - 1]).toBeNull();
  });

  it("holds the replay for a moment where the player lands after a hop", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
    scrubber.nextHold = vi.fn((from, to) => (from < T + 300 && to >= T + 300 ? T + 300 : null));
    scrubber.open();
    scrubber.querySelector(".trail-scrubber__skip input").click();
    playButton().click();
    // At five minutes a second the landing is reached within a second or so.
    vi.advanceTimersByTime(1500);
    expect(changes[changes.length - 1]).toBe(T + 300);
    vi.advanceTimersByTime(800);
    expect(changes[changes.length - 1]).toBe(T + 300);
    vi.advanceTimersByTime(2000);
    expect(changes[changes.length - 1]).toBeGreaterThan(T + 300);
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
