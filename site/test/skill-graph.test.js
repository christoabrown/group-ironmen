import { describe, expect, it, vi } from "vitest";
import { SkillName } from "../src/data/skill";
import { SkillGraph } from "../src/skill-graph/skill-graph";

function assertConsecutiveDates(dates, nextDate) {
  for (let i = 1; i < dates.length; i += 1) {
    expect(dates[i].getTime()).toBe(nextDate(dates[i - 1]).getTime());
  }
}

describe("SkillGraph.datesForPeriod", () => {
  it("returns unique and consecutive buckets for each period", () => {
    vi.useFakeTimers();

    const cases = [
      {
        period: "Day",
        count: 24,
        now: "2026-11-01T23:30:00",
        nextDate: (date) => {
          const t = new Date(date);
          t.setTime(t.getTime() + 3600000);
          return t;
        },
      },
      {
        period: "Week",
        count: 7,
        now: "2026-11-02T23:30:00",
        nextDate: (date) => {
          const t = new Date(date);
          t.setDate(t.getDate() + 1);
          t.setHours(0, 0, 0, 0);
          return t;
        },
      },
      {
        period: "Month",
        count: 30,
        now: "2026-11-02T23:30:00",
        nextDate: (date) => {
          const t = new Date(date);
          t.setDate(t.getDate() + 1);
          t.setHours(0, 0, 0, 0);
          return t;
        },
      },
      {
        period: "Year",
        count: 12,
        now: "2026-01-31T12:00:00.000Z",
        nextDate: (date) => {
          const t = new Date(date);
          t.setMonth(t.getMonth() + 1, 1);
          t.setHours(0, 0, 0, 0);
          return t;
        },
      },
    ];

    for (const testCase of cases) {
      vi.setSystemTime(new Date(testCase.now));
      const dates = SkillGraph.datesForPeriod(testCase.period);
      const uniqueDates = new Set(dates.map((date) => date.getTime()));

      expect(dates).toHaveLength(testCase.count);
      expect(uniqueDates.size).toBe(testCase.count);
      assertConsecutiveDates(dates, testCase.nextDate);
    }
  });

  it("falls back to day buckets for unknown periods", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-01T23:30:00"));

    const dates = SkillGraph.datesForPeriod("InvalidPeriod");
    const graph = new SkillGraph();
    const labels = graph.labelsForPeriod("InvalidPeriod", dates);

    expect(dates).toHaveLength(24);
    expect(labels).toHaveLength(24);
  });

  it("keeps year buckets stable for month-end dates", () => {
    vi.useFakeTimers();

    const edgeDates = ["2025-12-31T12:00:00.000Z", "2026-01-31T12:00:00.000Z", "2026-08-31T12:00:00.000Z"];

    for (const edgeDate of edgeDates) {
      vi.setSystemTime(new Date(edgeDate));
      const dates = SkillGraph.datesForPeriod("Year");

      expect(dates).toHaveLength(12);
      expect(new Set(dates.map((date) => date.getTime())).size).toBe(12);
    }
  });
});

describe("SkillGraph.generateCompleteTimeSeries", () => {
  it("keeps newest snapshot when multiple records map to the same bucket", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-02T23:30:00"));

    const graph = new SkillGraph();
    graph.period = "Week";
    graph.dates = SkillGraph.datesForPeriod("Week");

    const skillName = SkillName.Attack;
    const bucketDate = new Date(graph.dates[graph.dates.length - 2]);
    const newerSnapshotTime = new Date(bucketDate);
    newerSnapshotTime.setHours(20, 15, 0, 0);
    const olderSnapshotTime = new Date(bucketDate);
    olderSnapshotTime.setHours(3, 15, 0, 0);

    const playerSkillData = [
      { time: newerSnapshotTime, data: { [skillName]: 200 } },
      { time: olderSnapshotTime, data: { [skillName]: 100 } },
    ];
    const currentSkillData = {
      [skillName]: { xp: 250 },
    };

    const completeSeries = graph.generateCompleteTimeSeries(playerSkillData, currentSkillData, skillName);
    const bucketTime = SkillGraph.truncatedDateForPeriod(newerSnapshotTime, "Week").getTime();
    const bucketIndex = graph.dates.findIndex((date) => date.getTime() === bucketTime);

    expect(completeSeries[bucketIndex]).toBe(200);
  });
});

describe("SkillGraph.createTable", () => {
  it("renders stable gradient values when total xp gain is zero", () => {
    const graph = new SkillGraph();
    graph.skillName = SkillName.Attack;
    graph.period = "Day";
    graph.tableContainer = document.createElement("div");
    graph.currentGroupData = { members: new Map() };

    graph.createTable([
      {
        label: "Player",
        data: [0],
        backgroundColor: "#fff",
        borderColor: "#fff",
        totalXpData: [0],
      },
    ]);

    expect(graph.tableContainer.innerHTML).not.toContain("NaN%");
    expect(graph.tableContainer.innerHTML).not.toContain("Infinity%");
  });
});
