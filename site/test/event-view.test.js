import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  COMBAT_TASK_ICON_URL,
  DEATH_ICON_URL,
  EVENT_FILTERS_KEY,
  defaultEventFilters,
  eventIconUrl,
  eventKind,
  eventLabel,
  eventPasses,
  eventPlace,
  eventTier,
  eventTimeMs,
  eventTooltipHtml,
  loadEventFilters,
} from "../src/data/event-view";

const ICONS = "http://icons.test";

describe("event view", () => {
  beforeEach(() => {
    window.siteConfig = { iconsBaseUrl: ICONS };
    localStorage.clear();
  });

  afterEach(() => {
    delete window.siteConfig;
  });

  it("sorts the hub's event types into the map's kinds", () => {
    expect(eventKind({ type: "loot" })).toBe("loot");
    expect(eventKind({ type: "pk_loot" })).toBe("loot");
    expect(eventKind({ type: "level_up" })).toBe("level");
    expect(eventKind({ type: "death" })).toBe("death");
    for (const type of ["collection_log", "achievement_diary", "combat_task", "superior_spawn"]) {
      expect(eventKind({ type })).toBe("other");
    }
    expect(eventKind({ type: "something_new" })).toBeNull();
  });

  it("lets through what the filters ask for", () => {
    const filters = defaultEventFilters();
    expect(eventPasses({ type: "loot", value_gp: 2500000 }, filters)).toBe(true);
    expect(eventPasses({ type: "loot", value_gp: 5000 }, filters)).toBe(false);
    expect(eventPasses({ type: "loot", value_gp: 5000 }, { ...filters, minLoot: 0 })).toBe(true);
    expect(eventPasses({ type: "level_up" }, filters)).toBe(true);
    expect(eventPasses({ type: "level_up" }, { ...filters, level: false })).toBe(false);
    expect(eventPasses({ type: "something_new" }, filters)).toBe(false);
  });

  it("switches toasts on for filters stored before there were any", () => {
    expect(defaultEventFilters().toasts).toBe(true);
    localStorage.setItem(EVENT_FILTERS_KEY, JSON.stringify({ loot: false, minLoot: 0 }));
    expect(loadEventFilters()).toMatchObject({ loot: false, minLoot: 0, death: true, toasts: true });
    localStorage.setItem(EVENT_FILTERS_KEY, "{not json");
    expect(loadEventFilters()).toEqual(defaultEventFilters());
  });

  it("ranks big drops and new collection log slots", () => {
    expect(eventTier({ type: "loot", value_gp: 999999 })).toBe(0);
    expect(eventTier({ type: "loot", value_gp: 1000000 })).toBe(1);
    expect(eventTier({ type: "pk_loot", value_gp: 9999999 })).toBe(1);
    expect(eventTier({ type: "loot", value_gp: 10000000 })).toBe(2);
    expect(eventTier({ type: "collection_log" })).toBe(1);
    expect(eventTier({ type: "collection_log", value_gp: 25000000 })).toBe(2);
    expect(eventTier({ type: "level_up", level: 99 })).toBe(0);
    expect(eventTier({ type: "death", value_gp: 50000000 })).toBe(0);
  });

  it("picks an icon for every type", () => {
    expect(eventIconUrl({ type: "loot", item_id: 11832 })).toBe(`${ICONS}/items/11832.webp`);
    expect(eventIconUrl({ type: "pk_loot", items: [{ id: 4151, quantity: 1 }] })).toBe(`${ICONS}/items/4151.webp`);
    expect(eventIconUrl({ type: "collection_log" })).toBe(`${ICONS}/items/22711.webp`);
    expect(eventIconUrl({ type: "collection_log", item_id: 12073 })).toBe(`${ICONS}/items/12073.webp`);
    expect(eventIconUrl({ type: "level_up", skill: "Attack" })).toBe(`${ICONS}/skills/attack.png`);
    expect(eventIconUrl({ type: "superior_spawn" })).toBe(`${ICONS}/skills/slayer.png`);
    expect(eventIconUrl({ type: "achievement_diary" })).toBe(`${ICONS}/items/19476.webp`);
    expect(eventIconUrl({ type: "death" })).toBe(DEATH_ICON_URL);
    expect(eventIconUrl({ type: "combat_task" })).toBe(COMBAT_TASK_ICON_URL);
    expect(eventIconUrl({ type: "loot" })).toBe("");
    expect(eventIconUrl({ type: "something_new" })).toBe("");
  });

  it("keeps the icons this site serves itself when the icon CDN is off", () => {
    window.siteConfig = { iconsBaseUrl: "" };
    expect(eventIconUrl({ type: "loot", item_id: 11832 })).toBe("");
    expect(eventIconUrl({ type: "level_up", skill: "Attack" })).toBe("");
    expect(eventIconUrl({ type: "death" })).toBe(DEATH_ICON_URL);
    expect(eventIconUrl({ type: "combat_task" })).toBe(COMBAT_TASK_ICON_URL);
  });

  it("labels an event in a few words", () => {
    expect(eventLabel({ type: "loot", value_gp: 2500000 })).toBe("2.5M gp");
    expect(eventLabel({ type: "level_up", level: 99, skill: "Attack" })).toBe("99 Attack");
    expect(eventLabel({ type: "collection_log" })).toBe("New collection log");
    expect(eventLabel({ type: "achievement_diary" })).toBe("Diary");
    expect(eventLabel({ type: "combat_task" })).toBe("Combat task");
    expect(eventLabel({ type: "superior_spawn" })).toBe("Superior");
    expect(eventLabel({ type: "death" })).toBeNull();
  });

  it("reads the place and the time of an event", () => {
    expect(eventPlace({ location: { x: 3200, y: 3200, plane: 1 } })).toEqual({ x: 3200, y: 3201, plane: 1 });
    expect(eventPlace({ location: { x: 3200, y: 3200 } })).toEqual({ x: 3200, y: 3201, plane: 0 });
    expect(eventPlace({ location: null })).toBeNull();
    expect(eventTimeMs({ occurred_at: "2026-10-01T12:00:00Z" })).toBe(Date.parse("2026-10-01T12:00:00Z"));
    expect(eventTimeMs({})).toBeNull();
  });

  describe("tooltip", () => {
    const now = Date.parse("2026-10-01T12:00:00Z");
    const drop = {
      id: "1",
      type: "loot",
      member: "Alice",
      line: "Alice received Armadyl chestplate (35.2M) from Kree'arra",
      occurred_at: "2026-10-01T11:48:00Z",
      value_gp: 35200000,
      item_id: 11828,
      items: [
        { id: 11828, quantity: 1 },
        { id: 995, quantity: 15000 },
      ],
      source: "Kree'arra",
    };

    it("tells what happened, when and where", () => {
      const html = eventTooltipHtml([drop], { now, place: "God Wars Dungeon" });
      expect(html).toContain("Alice received Armadyl chestplate (35.2M) from Kree&#39;arra");
      expect(html).toContain("12m ago");
      expect(html).toContain("35.2M gp");
      expect(html).toContain("God Wars Dungeon");
      expect(html).toContain(`${ICONS}/items/11828.webp`);
      expect(html).not.toContain("approximate");
    });

    it("says when the place is a guess", () => {
      expect(eventTooltipHtml([drop], { now, approximate: true })).toContain("Position approximate");
    });

    it("lists the events of a stack, the first few of them", () => {
      const events = [];
      for (let i = 0; i < 8; i++) events.push({ ...drop, id: String(i), line: `Drop number ${i}` });
      const html = eventTooltipHtml(events, { now });
      expect(html).toContain("Drop number 0");
      expect(html).toContain("Drop number 4");
      expect(html).not.toContain("Drop number 5");
      expect(html).toContain("and 3 more");
    });

    it("escapes what the hub sent", () => {
      const html = eventTooltipHtml([{ ...drop, line: "<img src=x onerror=alert(1)>", source: "<b>boss</b>" }], {
        now,
        place: "<i>here</i>",
      });
      expect(html).not.toContain("<img src=x");
      expect(html).not.toContain("<b>boss</b>");
      expect(html).not.toContain("<i>here</i>");

      const unnamed = eventTooltipHtml([{ type: "death", member: "<script>", occurred_at: drop.occurred_at }], { now });
      expect(unnamed).not.toContain("<script>");
    });
  });
});
