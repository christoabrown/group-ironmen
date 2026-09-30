#!/usr/bin/env node
// Builds public/data/regions.json (region id -> place name) from RuneLite's
// DiscordGameEventType.java, which names the map regions of cities, dungeons,
// bosses, minigames and raids. RuneLite is BSD-2-Clause licensed; the notice is
// kept in public/data/regions.NOTICE.
//
//   node scripts/generate-regions.js path/to/DiscordGameEventType.java
//
// The file is in RuneLite's client sources jar (net/runelite/client/plugins/
// discord/). When two entries name the same region, the first one wins; the
// file lists bosses before cities, dungeons, minigames, raids and wider regions.
const fs = require("fs");
const path = require("path");

const source = process.argv[2];
if (!source) {
  console.error("usage: node scripts/generate-regions.js path/to/DiscordGameEventType.java");
  process.exit(1);
}

const java = fs.readFileSync(source, "utf8");
const entry = /^\s*[A-Z0-9_]+\(\s*"([^"]+)"\s*,\s*DiscordAreaType\.([A-Z_]+)\s*,\s*([\d,\s]+)\)/gm;

const regions = {};
const counts = {};
let match;
while ((match = entry.exec(java)) !== null) {
  const [, name, type] = match;
  counts[type] = (counts[type] || 0) + 1;
  for (const id of match[3].split(",").map((value) => parseInt(value.trim(), 10))) {
    if (!isNaN(id) && !(id in regions)) regions[id] = name;
  }
}

const output = {
  source: "RuneLite DiscordGameEventType (BSD-2-Clause), see regions.NOTICE",
  regions,
};
const target = path.join(__dirname, "../public/data/regions.json");
fs.writeFileSync(target, JSON.stringify(output) + "\n");
console.log(`Wrote ${Object.keys(regions).length} regions to ${target}`, counts);
