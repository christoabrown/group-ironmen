/* global Chart */
import { BaseElement } from "../base-element/base-element";
import { Skill, SkillName } from "../data/skill";

function hslToHsla(color, alpha) {
  if (color.startsWith("hsl(")) {
    return color.replace("hsl(", "hsla(").replace(")", `, ${alpha})`);
  }
  return color;
}

const periodHours = {
  Day: 24,
  Week: 168,
  Month: 720,
  Year: 8760,
};

export class SkillGraph extends BaseElement {
  constructor() {
    super();
  }

  html() {
    return `{{skill-graph.html}}`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.period = this.getAttribute("data-period");
    this.skillName = this.getAttribute("skill-name");
    this.render();
    this.tableContainer = this.querySelector(".skill-graph__table-container");
    this.ctx = this.querySelector("canvas").getContext("2d");

    this.subscribeOnce("get-group-data", this.create.bind(this));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.chart) {
      this.chart.destroy();
    }
  }

  create(groupData) {
    if (!this.isConnected) return;
    this.currentGroupData = groupData;
    this.dates = SkillGraph.datesForPeriod(this.period);
    const dataSets = this.dataSets(this.skillName);

    this.createChart(dataSets);
    this.createTable(dataSets);
  }

  tableDataForDataSet(dataSet, skillName) {
    let xpGain = dataSet.data[dataSet.data.length - 1];
    if (isNaN(xpGain)) xpGain = 0;

    const totalXpData = dataSet.totalXpData || [];
    let startingXp;
    for (const xp of totalXpData) {
      if (xp !== undefined) {
        startingXp = xp;
        break;
      }
    }
    const endingXp = totalXpData[totalXpData.length - 1];

    let currentLevel = null;
    let levelsGained = 0;
    let xpToNextLevel = null;

    if (skillName !== SkillName.Overall && endingXp !== undefined) {
      const endSkill = new Skill(skillName, endingXp);
      currentLevel = Math.min(99, endSkill.level);
      xpToNextLevel = endSkill.xpUntilNextLevel;
      if (startingXp !== undefined) {
        const startSkill = new Skill(skillName, startingXp);
        levelsGained = Math.min(99, endSkill.level) - Math.min(99, startSkill.level);
      }
    }

    return {
      xpGain,
      color: dataSet.backgroundColor,
      borderColor: dataSet.borderColor,
      currentLevel,
      levelsGained,
      xpToNextLevel,
    };
  }

  createTable(dataSets) {
    const dataSetsSkills = {
      [this.skillName]: dataSets,
    };

    const skillNames = Object.values(SkillName)
      .filter((x) => x !== SkillName.Overall)
      .sort((a, b) => {
        return a.localeCompare(b);
      });
    if (this.skillName === SkillName.Overall) {
      for (const skillName of skillNames) {
        dataSetsSkills[skillName] = this.dataSets(skillName);
      }
    }

    const tableData = {};
    for (const [skillName, dataSets] of Object.entries(dataSetsSkills)) {
      let totalXpGain = 0;
      for (const dataSet of dataSets) {
        if (!tableData[dataSet.label]) {
          tableData[dataSet.label] = {};
        }
        tableData[dataSet.label][skillName] = this.tableDataForDataSet(dataSet, skillName);
        totalXpGain += tableData[dataSet.label][skillName].xpGain;
      }

      for (const dataSet of dataSets) {
        tableData[dataSet.label][skillName].totalXpGain = totalXpGain;
      }
    }

    const hours = periodHours[SkillGraph.normalizedPeriod(this.period)] ?? 1;

    const formatXp = (xp) => {
      if (xp === null || xp === undefined) return "\u2014";
      if (xp >= 1000000) return (xp / 1000000).toFixed(2) + "M";
      if (xp >= 10000) return (xp / 1000).toFixed(1) + "k";
      return xp.toLocaleString();
    };

    const formatLevel = (data) => {
      if (data.currentLevel === null) return "\u2014";
      if (data.levelsGained > 0) {
        return `${data.currentLevel - data.levelsGained} \u2192 ${data.currentLevel}`;
      }
      return `${data.currentLevel}`;
    };

    const formatXpToNext = (data) => {
      if (data.xpToNextLevel === null) return "\u2014";
      if (data.currentLevel !== null && data.currentLevel >= 99) return "Max";
      return formatXp(data.xpToNextLevel);
    };

    const row = (cls, label, data, totalXpGain, rank) => {
      const xpGainPercent = totalXpGain ? Math.round((data.xpGain / totalXpGain) * 100) : 0;
      const skillIcon = Skill.getIcon(label);
      const skillImg = skillIcon.length ? `<img src="${skillIcon}" />` : "";
      const colorDot = skillImg
        ? ""
        : `<span class="skill-graph__player-dot" style="background: ${data.borderColor}"></span>`;
      const xpHour = data.xpGain > 0 ? Math.round(data.xpGain / hours) : 0;
      const rankCell = rank !== undefined ? `<td class="skill-graph__rank">${rank}</td>` : `<td></td>`;
      const levelChange =
        data.levelsGained > 0 ? ` <span class="skill-graph__level-up">(+${data.levelsGained})</span>` : "";
      const gradientColor = data.borderColor ? hslToHsla(data.borderColor, 0.3) : data.color;
      return `
<tr class="${cls}" style="background: linear-gradient(90deg, ${gradientColor} ${xpGainPercent}%, transparent ${xpGainPercent}%)">
  ${rankCell}
  <td class="skill-graph__player-cell">${skillImg}${colorDot}${label}</td>
  <td class="skill-graph__level-data">${formatLevel(data)}${levelChange}</td>
  <td class="skill-graph__xp-change-data">${data.xpGain > 0 ? "+" : ""}${data.xpGain.toLocaleString()}</td>
  <td class="skill-graph__xp-hour-data">${xpHour > 0 ? "+" : ""}${xpHour.toLocaleString()}</td>
  <td class="skill-graph__xp-next-data">${formatXpToNext(data)}</td>
</tr>
`;
    };

    const playerNames = Object.keys(tableData).sort((a, b) => {
      return tableData[b][this.skillName].xpGain - tableData[a][this.skillName].xpGain;
    });

    let groupTotalXpGain = 0;
    let activeCount = 0;
    let topContributor = null;
    let topXpGain = 0;
    const tableRows = [];
    for (let rankIdx = 0; rankIdx < playerNames.length; rankIdx++) {
      const name = playerNames[rankIdx];
      const x = tableData[name];
      const xpGain = x[this.skillName].xpGain;
      groupTotalXpGain += xpGain;
      if (xpGain > 0) activeCount++;
      if (xpGain > topXpGain) {
        topXpGain = xpGain;
        topContributor = name;
      }
      const totalXpGain = x[this.skillName].totalXpGain;
      tableRows.push(row("skill-graph__player-row", name, x[this.skillName], totalXpGain, rankIdx + 1));

      if (this.skillName === SkillName.Overall) {
        const skillNamesSortedByXpGain = [...skillNames].sort((a, b) => x[b].xpGain - x[a].xpGain);
        for (const skillName of skillNamesSortedByXpGain) {
          const s = x[skillName];

          if (s.xpGain > 0) {
            tableRows.push(row("skill-graph__overall-skill-change", skillName, s, x[this.skillName].xpGain));
          }
        }
      }
    }

    const groupTotalSign = groupTotalXpGain > 0 ? "+" : "";
    const avgGain = playerNames.length > 0 ? Math.round(groupTotalXpGain / playerNames.length) : 0;

    let groupTotalLevel = 0;
    if (this.skillName === SkillName.Overall) {
      for (const name of playerNames) {
        const member = this.currentGroupData.members.get(name);
        if (member?.skills?.[SkillName.Overall]?.level) {
          groupTotalLevel += member.skills[SkillName.Overall].level;
        }
      }
    }

    const summaryParts = [
      `<span>Total XP: ${groupTotalSign}${groupTotalXpGain.toLocaleString()}</span>`,
      `<span>Avg: ${groupTotalSign}${avgGain.toLocaleString()}</span>`,
      `<span>Active: ${activeCount}/${playerNames.length}</span>`,
    ];
    if (topContributor) {
      summaryParts.push(`<span>Top: ${topContributor} (+${topXpGain.toLocaleString()})</span>`);
    }
    if (groupTotalLevel > 0) {
      summaryParts.push(`<span>Group total level: ${groupTotalLevel.toLocaleString()}</span>`);
    }

    this.tableContainer.innerHTML = `
<div class="skill-graph__summary">${summaryParts.join("")}</div>
<div class="skill-graph__table-scroll">
<table>
  <thead>
    <tr>
      <th class="skill-graph__rank-header">#</th>
      <th>Player</th>
      <th>Level</th>
      <th>XP Change</th>
      <th>XP/Hr</th>
      <th>XP to Next</th>
    </tr>
  </thead>
  <tbody>
    ${tableRows.join("")}
  </tbody>
</table>
</div>
`;
  }

  createChart(dataSets) {
    if (this.chart) this.chart.destroy();

    let min = Number.MAX_SAFE_INTEGER;
    let max = 0;
    for (const ds of dataSets) {
      min = Math.min(min, ds.data[0]);
      max = Math.max(max, ds.data[ds.data.length - 1]);
    }
    if (dataSets.length === 0) {
      min = 0;
      max = 1;
    }

    const scales = {
      x: {
        grid: {
          drawTicks: false,
          borderDash: [4, 4],
        },
      },
      y: {
        type: "linear",
        min,
        max: max + 1,
        title: {
          display: true,
          text: "XP Gain",
        },
        ticks: {
          callback: function (value) {
            if (value >= 1000000) return (value / 1000000).toFixed(1) + "M";
            if (value >= 1000) return (value / 1000).toFixed(1) + "k";
            return value;
          },
        },
        grid: {
          borderDash: [4, 4],
        },
      },
    };

    this.chart = new Chart(this.ctx, {
      type: "line",
      options: {
        maintainAspectRatio: false,
        animation: false,
        normalized: true,
        layout: {
          padding: 0,
        },
        plugins: {
          tooltip: {
            callbacks: {
              label: (tooltip) => {
                const xpChange = tooltip.dataset.changeData[tooltip.dataIndex];
                const xpChangeString = `${xpChange > 0 ? "+" : ""}${xpChange.toLocaleString()}`;
                const totalXp = tooltip.dataset.totalXpData[tooltip.dataIndex] || 0;
                return `${tooltip.dataset.label}: ${totalXp.toLocaleString()} (${xpChangeString})`;
              },
            },
          },
          title: {
            display: true,
            text: `${this.skillName} - ${this.period}`,
            font: {
              size: 18,
              family: "rsbold, ui-sans-serif, Arial, sans-serif",
            },
          },
        },
        interaction: {
          intersect: false,
          mode: "index",
        },
        scales,
      },
      data: {
        labels: this.labelsForPeriod(this.period, this.dates),
        datasets: dataSets,
      },
    });
  }

  dataSets(skillName) {
    const result = [];
    for (const playerSkillData of this.skillDataForGroup) {
      const [totalXpData, changeData, cumulativeChangeData] = this.dataForPlayer(playerSkillData, skillName);
      const color = this.currentGroupData.members.get(playerSkillData.name).color;

      result.push({
        type: "line",
        label: playerSkillData.name,
        data: cumulativeChangeData,
        borderColor: color,
        backgroundColor: hslToHsla(color, 0.12),
        fill: true,
        tension: 0.3,
        pointBorderWidth: 0,
        pointHoverBorderWidth: 2,
        pointHoverBorderColor: "white",
        pointHoverRadius: 5,
        pointRadius: 0,
        borderWidth: 2,
        changeData,
        totalXpData,
      });
    }

    return result;
  }

  dataForPlayer(playerSkillData, skillName) {
    const latestSkillData = this.currentGroupData.members.get(playerSkillData.name).skills;
    const completeTimeSeries = this.generateCompleteTimeSeries(playerSkillData.skill_data, latestSkillData, skillName);
    const changeData = [0];
    const cumulativeChangeData = [0];

    let s = 0;
    for (let i = 1; i < completeTimeSeries.length; ++i) {
      const previous = completeTimeSeries[i - 1];
      const current = completeTimeSeries[i];
      if (previous === undefined || current === undefined) {
        changeData.push(0);
        cumulativeChangeData.push(s);
      } else {
        changeData.push(current - previous);
        s += current - previous;
        cumulativeChangeData.push(s);
      }
    }

    return [completeTimeSeries, changeData, cumulativeChangeData];
  }

  generateCompleteTimeSeries(playerSkillData, currentSkillData, skillName) {
    const bucketedSkillData = new Map();
    const earliestDateInPeriod = SkillGraph.truncatedDateForPeriod(this.dates[0], this.period);
    const datesOutsideOfPeriod = [];
    for (const skillData of playerSkillData) {
      const date = SkillGraph.truncatedDateForPeriod(skillData.time, this.period);
      if (!bucketedSkillData.has(date.getTime())) {
        bucketedSkillData.set(date.getTime(), skillData.data);
      }

      if (date < earliestDateInPeriod) {
        datesOutsideOfPeriod.push(skillData);
      }
    }

    let lastData = datesOutsideOfPeriod.length ? datesOutsideOfPeriod[0].data[skillName] : undefined;
    const result = [];

    for (const date of this.dates) {
      const time = date.getTime();
      if (bucketedSkillData.has(time)) {
        const data = bucketedSkillData.get(time)[skillName];
        result.push(data);
        lastData = data;
      } else {
        result.push(lastData);
      }
    }

    result[result.length - 1] = currentSkillData[skillName].xp;
    return result;
  }

  labelsForPeriod(period, dates) {
    const normalizedPeriod = SkillGraph.normalizedPeriod(period);
    if (normalizedPeriod === "Day") {
      return dates.map((date) => date.toLocaleTimeString([], { hour: "numeric" }));
    }
    if (normalizedPeriod === "Year") {
      return dates.map((date) => date.toLocaleDateString([], { timeZone: "UTC", year: "numeric", month: "short" }));
    }
    // NOTE: For the rest of these periods we don't know at exactly what time the events occured in the user's timezone
    // due to them being truncated. Just going to display the times in UTC
    return dates.map((date) => date.toLocaleDateString([], { timeZone: "UTC", day: "numeric", month: "short" }));
  }

  static datesForPeriod(period) {
    const normalizedPeriod = SkillGraph.normalizedPeriod(period);
    const stepCountsForPeriods = {
      Day: 24,
      Week: 7,
      Month: 30,
      Year: 12,
    };
    const count = stepCountsForPeriods[normalizedPeriod];
    const now = SkillGraph.truncatedDateForPeriod(new Date(), normalizedPeriod);
    const result = [];

    for (let i = count - 1; i >= 0; --i) {
      const t = new Date(now);

      if (normalizedPeriod === "Day") {
        t.setTime(now.getTime() - i * 3600000);
        result.push(t);
        continue;
      }

      if (normalizedPeriod === "Week" || normalizedPeriod === "Month") {
        t.setDate(now.getDate() - i);
      } else if (normalizedPeriod === "Year") {
        t.setMonth(now.getMonth() - i, 1);
      }

      result.push(SkillGraph.truncatedDateForPeriod(t, normalizedPeriod));
    }

    return result;
  }

  static truncatedDateForPeriod(date, period) {
    const normalizedPeriod = SkillGraph.normalizedPeriod(period);
    const t = new Date(date);
    t.setMinutes(0, 0, 0);

    if (normalizedPeriod !== "Day") {
      t.setHours(0);
    }

    if (normalizedPeriod === "Year") {
      t.setMonth(t.getMonth(), 1);
    }

    return t;
  }

  static normalizedPeriod(period) {
    const periods = new Set(["Day", "Week", "Month", "Year"]);
    return periods.has(period) ? period : "Day";
  }
}

customElements.define("skill-graph", SkillGraph);
