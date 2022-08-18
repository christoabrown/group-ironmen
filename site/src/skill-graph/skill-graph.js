/* global Chart */
import { BaseElement } from "../base-element/base-element";
import { utility } from "../utility";
import { Skill } from "../data/skill";

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
    this.dataSetColors = [
      { line: "rgb(142, 68, 173)", bar: "rgba(142, 68, 173, 0.5)" },
      { line: "rgb(41, 128, 185)", bar: "rgba(41, 128, 185, 0.5)" },
      { line: "rgb(39, 174, 96)", bar: "rgba(39, 174, 96, 0.5)" },
      { line: "rgb(243, 156, 18)", bar: "rgba(243, 156, 18, 0.5)" },
      { line: "rgb(192, 57, 43)", bar: "rgba(192, 57, 43, 0.5)" },
    ];

    this.intersectionObserver = new IntersectionObserver((entries) => {
      const self = entries.find((x) => x.target === this);
      if (self && self.isIntersecting) {
        this.intersectionObserver.disconnect();
        this.subscribeOnce("get-group-data", this.create.bind(this));
      }
    }, {});
    this.intersectionObserver.observe(this);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.intersectionObserver.disconnect();
    if (this.chart) {
      this.chart.destroy();
    }
  }

  create(groupData) {
    if (!this.isConnected) return;
    this.currentGroupData = groupData;
    this.dates = SkillGraph.datesForPeriod(this.period);
    const dataSets = this.dataSets();

    this.createChart(dataSets);
    this.createTable(dataSets);
  }

  createTable(dataSets) {
    let totalXpGain = 0;
    const tableData = {};
    for (let i = 0; i < dataSets.length; ++i) {
      const lineDataSet = dataSets[i];
      if (lineDataSet.type !== "line") continue;

      let xpGain = lineDataSet.changeData.reduce((a, b) => a + b, 0);
      if (isNaN(xpGain)) xpGain = 0;
      totalXpGain += xpGain;
      tableData[lineDataSet.label] = {
        xpGain,
        color: lineDataSet.barColor,
      };
    }

    let tableRows = [];
    for (const [name, x] of Object.entries(tableData)) {
      const xpGainPercent = Math.round((x.xpGain / totalXpGain) * 100);
      tableRows.push(`
<tr style="background: linear-gradient(90deg, ${x.color} ${xpGainPercent}%, transparent ${xpGainPercent}%)">
  <td>${name}</td>
  <td class="skill-graph__xp-change-data">${x.xpGain > 0 ? "+" : ""}${x.xpGain.toLocaleString()}</td>
</tr>
`);
    }
    this.tableContainer.innerHTML = `
<table>
  ${tableRows.join("")}
</table>
`;
  }

  createChart(dataSets) {
    if (this.chart) this.chart.destroy();
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
          legend: {
            labels: {
              filter: (label) => !!label.text,
            },
          },
          tooltip: {
            filter: (tooltip) => tooltip.dataset.type === "line",
            callbacks: {
              label: (tooltip) => {
                const xpChange = tooltip.dataset.changeData[tooltip.dataIndex];
                const xpChangeString = `${xpChange > 0 ? "+" : ""}${xpChange.toLocaleString()}`;
                return `${tooltip.dataset.label}: ${tooltip.formattedValue} (${xpChangeString})`;
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
        scales: {
          x: {
            grid: {
              drawTicks: false,
            },
          },
          y: {
            type: "linear",
            position: "left",
            display: true,
            ticks: {
              callback: (value) => {
                return utility.formatShortQuantity(value);
              },
            },
            grid: {
              drawTicks: true,
            },
          },
          xpChange: {
            type: "linear",
            position: "right",
            display: false,
            ticks: {
              beginAtZero: true,
              callback: (value) => {
                return utility.formatShortQuantity(value);
              },
            },
            grid: {
              drawOnChartArea: false,
            },
          },
        },
      },
      data: {
        labels: this.labelsForPeriod(this.period, this.dates),
        datasets: dataSets,
      },
    });
  }

  dataSets() {
    let result = [];
    for (let i = 0; i < this.skillDataForGroup.length; ++i) {
      const playerSkillData = this.skillDataForGroup[i];
      const [stateData, changeData] = this.dataForPlayer(playerSkillData, this.dates);
      const color = this.dataSetColors[i];

      result.push({
        type: "line",
        label: playerSkillData.name,
        data: stateData,
        borderColor: color.line,
        backgroundColor: color.line,
        pointBorderWidth: 0,
        pointHoverBorderWidth: 0,
        pointHoverRadius: 3,
        pointRadius: 0,
        borderWidth: 2,
        changeData,
        barColor: color.bar,
      });
      result.push({
        type: "bar",
        data: changeData,
        borderColor: color.bar,
        backgroundColor: color.bar,
        borderWidth: 0,
        yAxisID: "xpChange",
      });
    }

    // NOTE: Sort the data sets so lines will draw on top of the bars
    result.sort((a, b) => (a.type === "line" ? -1 : 1));
    return result;
  }

  dataForPlayer(playerSkillData, dates) {
    const latestSkillData = this.currentGroupData.members.get(playerSkillData.name).skills;
    const completeTimeSeries = this.generateCompleteTimeSeries(playerSkillData.skill_data, latestSkillData);
    const changeData = [0];

    for (let i = 1; i < completeTimeSeries.length; ++i) {
      const previous = completeTimeSeries[i - 1];
      const current = completeTimeSeries[i];
      if (previous === undefined || current === undefined) changeData.push(0);
      else changeData.push(current - previous);
    }

    return [completeTimeSeries, changeData];
  }

  generateCompleteTimeSeries(playerSkillData, currentSkillData, skillName) {
    const bucketedSkillData = new Map();
    const earliestDateInPeriod = SkillGraph.truncatedDateForPeriod(this.dates[0], this.period);
    const datesOutsideOfPeriod = [];
    for (const skillData of playerSkillData) {
      const date = skillData.time;
      bucketedSkillData.set(date.getTime(), skillData.data);

      if (date < earliestDateInPeriod) {
        datesOutsideOfPeriod.push(skillData);
      }
    }

    let lastData = datesOutsideOfPeriod.length ? datesOutsideOfPeriod[0].data[this.skillName] : undefined;
    const result = [];

    for (let i = 0; i < this.dates.length; ++i) {
      const date = this.dates[i];
      const time = date.getTime();
      if (bucketedSkillData.has(time)) {
        let data = bucketedSkillData.get(time)[this.skillName];
        result.push(data);
        lastData = data;
      } else {
        result.push(lastData);
      }
    }

    result[result.length - 1] = currentSkillData[this.skillName].xp;
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
    t.setUTCMinutes(0, 0, 0);

    if (period !== "Day") {
      t.setUTCHours(0);
    }

    if (period === "Year") {
      t.setUTCMonth(t.getUTCMonth(), 1);
    }

    return t;
  }
}

customElements.define("skill-graph", SkillGraph);
