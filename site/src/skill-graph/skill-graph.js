/* global Chart */
import { BaseElement } from "../base-element/base-element";
import { Skill, SkillName } from "../data/skill";

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

  tableDataForDataSet(dataSet) {
    let xpGain = dataSet.data[dataSet.data.length - 1];
    if (isNaN(xpGain)) xpGain = 0;
    return {
      xpGain,
      color: dataSet.backgroundColor,
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
        tableData[dataSet.label][skillName] = this.tableDataForDataSet(dataSet);
        totalXpGain += tableData[dataSet.label][skillName].xpGain;
      }

      for (const dataSet of dataSets) {
        tableData[dataSet.label][skillName].totalXpGain = totalXpGain;
      }
    }

    const row = (cls, label, data, totalXpGain) => {
      const xpGainPercent = Math.round((data.xpGain / totalXpGain) * 100);
      const skillIcon = Skill.getIcon(label);
      const skillImg = skillIcon.length ? `<img src="${Skill.getIcon(label)}" />` : "";
      return `
<tr class="${cls}" style="background: linear-gradient(90deg, ${
        data.color
      } ${xpGainPercent}%, transparent ${xpGainPercent}%)">
  <td>${skillImg}${label}</td>
  <td class="skill-graph__xp-change-data">${data.xpGain > 0 ? "+" : ""}${data.xpGain.toLocaleString()}</td>
</tr>
`;
    };

    let tableRows = [];
    for (const [name, x] of Object.entries(tableData)) {
      const totalXpGain = x[this.skillName].totalXpGain;
      tableRows.push(row("", name, x[this.skillName], totalXpGain));

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
    this.tableContainer.innerHTML = `
<table>
  ${tableRows.join("")}
</table>
`;
  }

  createChart(dataSets) {
    if (this.chart) this.chart.destroy();

    let min = Number.MAX_SAFE_INTEGER;
    let max = 0;
    for (let i = 0; i < dataSets.length; ++i) {
      min = Math.min(min, dataSets[i].data[0]);
      max = Math.max(max, dataSets[i].data[dataSets[i].data.length - 1]);
    }

    const scales = {
      x: {
        grid: {
          drawTicks: false,
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
    let result = [];
    for (let i = 0; i < this.skillDataForGroup.length; ++i) {
      const playerSkillData = this.skillDataForGroup[i];
      const [totalXpData, changeData, cumulativeChangeData] = this.dataForPlayer(
        playerSkillData,
        this.dates,
        skillName
      );
      const color = this.currentGroupData.members.get(playerSkillData.name).color;

      result.push({
        type: "line",
        label: playerSkillData.name,
        data: cumulativeChangeData,
        borderColor: color,
        backgroundColor: color,
        pointBorderWidth: 0,
        pointHoverBorderWidth: 0,
        pointHoverRadius: 3,
        pointRadius: 0,
        borderWidth: 2,
        changeData,
        totalXpData,
      });
    }

    return result;
  }

  dataForPlayer(playerSkillData, dates, skillName) {
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
      bucketedSkillData.set(date.getTime(), skillData.data);

      if (date < earliestDateInPeriod) {
        datesOutsideOfPeriod.push(skillData);
      }
    }

    let lastData = datesOutsideOfPeriod.length ? datesOutsideOfPeriod[0].data[skillName] : undefined;
    const result = [];

    for (let i = 0; i < this.dates.length; ++i) {
      const date = this.dates[i];
      const time = date.getTime();
      if (bucketedSkillData.has(time)) {
        let data = bucketedSkillData.get(time)[skillName];
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
    if (period === "Day") {
      return dates.map((date) => date.toLocaleTimeString([], { hour: "numeric" }));
    } else if (period === "Week" || period === "Month") {
      // NOTE: For the rest of these periods we don't know at exactly what time the events occured in the user's timezone
      // due to them being truncated. Just going to display the times in UTC
      return dates.map((date) => date.toLocaleDateString([], { timeZone: "UTC", day: "numeric", month: "short" }));
    } else if (period === "Year") {
      return dates.map((date) => date.toLocaleDateString([], { timeZone: "UTC", year: "numeric", month: "short" }));
    }
  }

  static datesForPeriod(period) {
    const stepInMillisecondsForPeriods = {
      Day: 3600000,
      Week: 86400000,
      Month: 86400000,
      Year: 2629800000,
    };
    const step = stepInMillisecondsForPeriods[period];
    const stepCountsForPeriods = {
      Day: 24,
      Week: 7,
      Month: 30,
      Year: 12,
    };
    const count = stepCountsForPeriods[period];

    const now = new Date();
    const result = [];

    for (let i = count - 1; i >= 0; --i) {
      const t = new Date(now.getTime() - i * step);
      result.push(SkillGraph.truncatedDateForPeriod(t, period));
    }

    return result;
  }

  static truncatedDateForPeriod(date, period) {
    const t = new Date(date);
    t.setMinutes(0, 0, 0);

    if (period !== "Day") {
      t.setHours(0);
    }

    if (period === "Year") {
      t.setMonth(t.getMonth(), 1);
    }

    return t;
  }
}

customElements.define("skill-graph", SkillGraph);
