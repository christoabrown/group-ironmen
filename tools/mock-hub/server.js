#!/usr/bin/env node
// A tiny stand-in for osrs-data-hub's /api/v1, for trying the hub integration
// locally without a real hub. No dependencies: `node tools/mock-hub/server.js`.
//
//   DATA_SOURCE=hub HUB_BASE_URL=http://localhost:7070 HUB_API_KEY=ohub_mock_key
//
// Three accounts walk around Lumbridge; one is offline. It serves /me,
// /snapshot (with ETag/If-None-Match and `since`), /xp, /accounts/{id}/locations,
// /leaderboards/gains and /events with a cursor, following docs/API.md of the hub.
const http = require("http");
const crypto = require("crypto");

const PORT = parseInt(process.env.PORT || "7070", 10);
const API_KEY = process.env.MOCK_HUB_KEY || "ohub_mock_key";
const SKILLS = [
  "Agility", "Attack", "Construction", "Cooking", "Crafting", "Defence", "Farming", "Firemaking",
  "Fishing", "Fletching", "Herblore", "Hitpoints", "Hunter", "Magic", "Mining", "Prayer", "Ranged",
  "Runecraft", "Slayer", "Smithing", "Strength", "Thieving", "Woodcutting", "Sailing",
];
const started = Date.now();

const accounts = [
  { id: "mockAcct0001", name: "Mock Alpha", online: true, origin: [3222, 3218], radius: 12, xp: 30_000_000 },
  { id: "mockAcct0002", name: "Mock Bravo", online: true, origin: [3165, 3487], radius: 8, xp: 12_000_000 },
  { id: "mockAcct0003", name: "Mock Charlie", online: false, origin: [2964, 3378], radius: 0, xp: 5_000_000 },
];

function position(account, t = Date.now()) {
  // One lap every 7 minutes, so the once-a-minute trail points differ.
  const angle = ((t - started) / 420_000) * Math.PI * 2 + accounts.indexOf(account);
  return {
    x: Math.round(account.origin[0] + Math.cos(angle) * account.radius),
    y: Math.round(account.origin[1] + Math.sin(angle) * account.radius),
  };
}

function skillXp(account, index, t = Date.now()) {
  const growth = account.online ? Math.floor((t - started) / 1000) * (index + 1) : 0;
  return Math.floor(account.xp / (index + 2)) + growth;
}

function snapshotAccount(account) {
  const now = new Date();
  const { x, y } = position(account);
  const lastSeen = account.online ? now : new Date(started - 3 * 3600_000);
  return {
    id: account.id,
    name: account.name,
    type: 0,
    type_label: "Normal",
    categories: ["stats", "events", "activity", "location_live", "location_history", "equipment", "inventory"],
    owner: { name: account.name, discord_id: null },
    online: account.online,
    world: 302 + accounts.indexOf(account),
    special_world: false,
    last_seen: lastSeen.toISOString(),
    hp: { current: 90, max: 99 },
    prayer: { current: 43, max: 70 },
    spellbook: "standard",
    location: { x, y, plane: 0, is_on_boat: false, stale: !account.online, updated_at: lastSeen.toISOString() },
    skills: {
      total_level: 1500,
      overall_xp: account.xp,
      skills: SKILLS.map((skill, i) => ({ skill, level: 70, real_level: 70, xp: skillXp(account, i) })),
    },
    equipment: {
      value: 0,
      items: [
        { id: 4151, name: "Abyssal whip", quantity: 1, ge_price: 0, ha_price: 0, equipment_slot: "WEAPON" },
        { id: 10828, name: "Helm of neitiznot", quantity: 1, ge_price: 0, ha_price: 0, equipment_slot: "HEAD" },
      ],
    },
    inventory: {
      value: 0,
      items: [
        { id: 995, name: "Coins", quantity: 1234567, ge_price: 1, ha_price: 1, equipment_slot: null },
        { id: 385, name: "Shark", quantity: 1, ge_price: 0, ha_price: 0, equipment_slot: null },
      ],
    },
  };
}

const events = [];
function addEvent(type, account, extra) {
  const occurredAt = new Date().toISOString();
  events.push({
    id: crypto.randomUUID(),
    type,
    account: { id: account.id, name: account.name },
    occurred_at: occurredAt,
    received_at: occurredAt,
    value_gp: null,
    item_id: null,
    npc_id: null,
    skill: null,
    level: null,
    tier: null,
    points: null,
    special_world: false,
    data: {},
    title: type,
    line: `${account.name} did ${type}`,
    ...extra,
  });
}
addEvent("loot", accounts[0], { value_gp: 2_500_000, item_id: 4151, line: "Mock Alpha received Abyssal whip (2.5M) from Abyssal demon" });
addEvent("level_up", accounts[1], { skill: "Attack", level: 80, line: "Mock Bravo reached level 80 Attack" });
setInterval(() => {
  const account = accounts[Math.floor(Math.random() * 2)];
  addEvent("loot", account, { value_gp: 50_000, item_id: 385, line: `${account.name} received Shark from a chest` });
}, 30_000);

function send(res, status, body, headers = {}) {
  const payload = body === undefined ? "" : JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(payload);
}

function ok(res, data, meta = {}, headers = {}) {
  send(res, 200, { data, meta: { generated_at: new Date().toISOString(), ...meta } }, headers);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname.replace(/^\/api\/v1/, "");
  console.log(`${req.method} ${url.pathname}${url.search}`);

  if (req.headers.authorization !== `Bearer ${API_KEY}`) {
    return send(res, 401, { error: { code: "unauthorized", message: "Missing or invalid key" } });
  }

  if (path === "/me") {
    return ok(res, {
      key: { id: "k1", name: "Mock integration key", kind: "service", prefix: "mock", categories: ["stats", "events", "activity", "location_live", "location_history", "equipment", "inventory"], account_scope: "all_visible", expires_at: null },
      user: null,
      visible_accounts: accounts.length,
    });
  }

  if (path === "/snapshot") {
    const data = accounts.map(snapshotAccount);
    const etag = `W/"${crypto.createHash("sha1").update(JSON.stringify(data)).digest("hex")}"`;
    if (req.headers["if-none-match"] === etag) {
      res.writeHead(304);
      return res.end();
    }
    return ok(res, data, { count: data.length, last_modified: new Date().toISOString() }, { ETag: etag });
  }

  if (path === "/xp") {
    const ids = (url.searchParams.get("accounts") || "").split(",");
    const from = new Date(url.searchParams.get("from") || Date.now() - 7 * 86400_000).getTime();
    const step = url.searchParams.get("resolution") === "1h" ? 3600_000 : 86400_000;
    const selected = accounts.filter((a) => ids.includes(a.id));
    if (selected.length !== ids.length) {
      return send(res, 404, { error: { code: "not_found", message: "Unknown account" } });
    }
    return ok(res, {
      resolution: step === 3600_000 ? "1h" : "1d",
      from: new Date(from).toISOString(),
      to: new Date().toISOString(),
      accounts: selected.map((account) => ({
        account: { id: account.id, name: account.name },
        resolution: "1d",
        series: SKILLS.map((skill, i) => {
          const points = [];
          for (let t = from, n = 0; t <= Date.now(); t += step, n++) {
            points.push([new Date(t).toISOString(), Math.floor(account.xp / (i + 2)) - (40 - n) * 1000 * (i + 1)]);
          }
          return { skill, points };
        }),
      })),
    });
  }

  const locations = path.match(/^\/accounts\/([^/]+)\/locations$/);
  if (locations) {
    const account = accounts.find((a) => a.id === decodeURIComponent(locations[1]));
    if (!account) return send(res, 404, { error: { code: "not_found", message: "Unknown account" } });
    const points = [];
    for (let t = Date.now() - 3600_000; t <= Date.now(); t += 60_000) {
      const { x, y } = position(account, t);
      points.push({ at: new Date(t).toISOString(), x, y, plane: 0, world: 302, is_on_boat: false });
    }
    return ok(res, { account: { id: account.id, name: account.name }, from: "", to: "", points });
  }

  if (path === "/leaderboards/gains") {
    const period = url.searchParams.get("period") || "day";
    const online = accounts.filter((a) => a.online);
    return ok(res, {
      period,
      from: "",
      to: "",
      leaderboards: ["Overall", "Attack", "Slayer"].map((skill) => ({
        skill,
        entries: online.map((account, i) => ({ rank: i + 1, account: { id: account.id, name: account.name }, gain: (online.length - i) * 125_000 })),
      })),
    });
  }

  if (path === "/events") {
    const cursor = url.searchParams.get("cursor");
    const limit = parseInt(url.searchParams.get("limit") || "100", 10);
    const start = cursor ? parseInt(Buffer.from(cursor, "base64url").toString(), 10) : Math.max(0, events.length - limit);
    const page = events.slice(start, start + limit);
    const next = Buffer.from(String(start + page.length)).toString("base64url");
    return ok(res, page, { count: page.length, next_cursor: next });
  }

  return send(res, 404, { error: { code: "not_found", message: `No mock for ${path}` } });
});

server.listen(PORT, () => console.log(`Mock osrs-data-hub listening on http://localhost:${PORT}/api/v1 (key: ${API_KEY})`));
