#!/usr/bin/env node
// A stand-in for osrs-data-hub's /api/v1, for trying the map locally without a
// real hub. No dependencies: `node tools/mock-hub/server.js`, then run the
// backend with HUB_BASE_URL=http://localhost:7070 HUB_API_KEY=ohub_mock_key.
//
// MOCK_HUB_ACCOUNTS=60 sets the number of accounts (default 12). They walk
// around well-known places; about 70 % are online. Every fourth account keeps
// its inventory, equipment and location history private, like a player who
// never changed the hub's defaults, so its history endpoints answer 404.
//
// Serves /me, /snapshot (ETag/If-None-Match and `since`, with game_state),
// /accounts/{id} and its /xp, /gains, /sessions, /wealth, /equipment-history
// and /locations, the bulk /xp and /locations, /leaderboards/gains,
// /leaderboards/loot and /events (cursor, types, accounts, min_value), following
// the hub's docs/API.md as of D-94. A loot, level up or death happens every few
// seconds.
const http = require("http");
const crypto = require("crypto");

const PORT = parseInt(process.env.PORT || "7070", 10);
const API_KEY = process.env.MOCK_HUB_KEY || "ohub_mock_key";
const ACCOUNT_COUNT = Math.max(1, parseInt(process.env.MOCK_HUB_ACCOUNTS || "12", 10));
const EVENT_EVERY_MS = parseInt(process.env.MOCK_HUB_EVENT_MS || "4000", 10);
const SKILLS = [
  "Agility", "Attack", "Construction", "Cooking", "Crafting", "Defence", "Farming", "Firemaking",
  "Fishing", "Fletching", "Herblore", "Hitpoints", "Hunter", "Magic", "Mining", "Prayer", "Ranged",
  "Runecraft", "Slayer", "Smithing", "Strength", "Thieving", "Woodcutting", "Sailing",
];
// Skills the hub has seen. Set MOCK_HUB_UNKNOWN_SKILLS=Sailing to mimic a hub
// that has no data for a skill yet (it then rejects /xp requests naming it).
const UNKNOWN = new Set((process.env.MOCK_HUB_UNKNOWN_SKILLS || "").split(",").map((s) => s.trim().toLowerCase()));
const KNOWN_SKILLS = new Set(["overall", ...SKILLS.map((s) => s.toLowerCase())].filter((s) => !UNKNOWN.has(s)));
const ALL_CATEGORIES = ["stats", "events", "activity", "location_live", "location_history", "equipment", "inventory"];
const DEFAULT_CATEGORIES = ["stats", "events", "activity", "location_live"];
const TYPES = ["Normal", "Ironman", "Ultimate ironman", "Hardcore ironman", "Group ironman"];
const started = Date.now();

// [name, x, y, plane, radius]
const PLACES = [
  ["Lumbridge", 3222, 3218, 0, 10],
  ["Grand Exchange", 3164, 3487, 0, 6],
  ["Varrock", 3212, 3424, 0, 12],
  ["Falador", 2964, 3378, 0, 10],
  ["Edgeville", 3094, 3491, 0, 6],
  ["Wilderness", 3110, 3700, 0, 25],
  ["Catherby", 2809, 3436, 0, 8],
  ["Seers' Village", 2726, 3485, 0, 8],
  ["Ardougne", 2662, 3305, 0, 10],
  ["Zulrah", 2268, 3070, 0, 4],
  ["Theatre of Blood", 3650, 3219, 0, 5],
  ["Draynor Village", 3093, 3244, 0, 8],
  ["Slayer Tower", 3428, 3538, 1, 5],
];
const NAMES = [
  "Zezima", "Lynx Titan", "B0aty", "Woox", "Mmorpg", "Settled", "Framed", "Faux", "Coxie", "Sick Nerd",
  "Mammal", "Solo Mission", "Torvesta", "Odablock", "Skiddler", "Verf", "Rhys", "Bea5", "Crumpy", "Dino",
];
const ITEMS = [
  [11832, "Bandos chestplate", 14_500_000],
  [11834, "Bandos tassets", 28_000_000],
  [11828, "Armadyl chestplate", 35_000_000],
  [4151, "Abyssal whip", 1_500_000],
  [12002, "Occult necklace", 900_000],
  [13576, "Dragon warhammer", 38_000_000],
  [11286, "Draconic visage", 3_800_000],
  [385, "Shark", 700],
  [995, "Coins", 1],
];
const NPCS = [
  [2215, "General Graardor"],
  [3162, "Kree'arra"],
  [415, "Abyssal demon"],
  [2042, "Zulrah"],
  [7144, "Lizardman shaman"],
];

const accounts = Array.from({ length: ACCOUNT_COUNT }, (_, i) => {
  const place = PLACES[i % PLACES.length];
  const name = i < NAMES.length ? NAMES[i] : `Mock ${String(i + 1).padStart(2, "0")}`;
  return {
    id: `mockAcct${String(i + 1).padStart(4, "0")}`,
    name,
    online: (i * 7) % 10 < 7,
    place,
    radius: place[4],
    phase: i,
    xp: 5_000_000 + ((i * 7_654_321) % 150_000_000),
    type: i % 7 === 3 ? 2 : i % 5 === 1 ? 1 : 0,
    categories: i % 4 === 3 ? DEFAULT_CATEGORIES : ALL_CATEGORIES,
  };
});

function position(account, t = Date.now()) {
  // One lap every 7 minutes, so the once-a-minute trail points differ.
  const angle = ((t - started) / 420_000) * Math.PI * 2 + account.phase;
  return {
    x: Math.round(account.place[1] + Math.cos(angle) * account.radius),
    y: Math.round(account.place[2] + Math.sin(angle) * account.radius),
    plane: account.place[3],
  };
}

function skillXp(account, index, t = Date.now()) {
  const growth = account.online ? Math.floor((t - started) / 1000) * (index + 1) : 0;
  return Math.floor(account.xp / (index + 2)) + growth;
}

function level(xp) {
  let points = 0;
  for (let lvl = 1; lvl < 99; lvl++) {
    points += Math.floor(lvl + 300 * Math.pow(2, lvl / 7));
    if (Math.floor(points / 4) > xp) return lvl;
  }
  return 99;
}

const shares = (account, category) => account.categories.includes(category);
const lastSeen = (account) => (account.online ? new Date() : new Date(started - (3 + account.phase) * 3600_000));

function equipmentItems(account) {
  return [
    { id: 4151, name: "Abyssal whip", quantity: 1, ge_price: 1_500_000, ha_price: 72_000, equipment_slot: "WEAPON", inventory_slot: null },
    { id: 10828, name: "Helm of neitiznot", quantity: 1, ge_price: 45_000, ha_price: 30_000, equipment_slot: "HEAD", inventory_slot: null },
    ...(account.phase % 2
      ? [{ id: 11832, name: "Bandos chestplate", quantity: 1, ge_price: 14_500_000, ha_price: 159_000, equipment_slot: "BODY", inventory_slot: null }]
      : []),
  ];
}

function inventoryItems(account) {
  return [
    { id: 995, name: "Coins", quantity: 1_000_000 * (account.phase + 1), ge_price: 1, ha_price: 1, equipment_slot: null, inventory_slot: 0 },
    { id: 385, name: "Shark", quantity: 1, ge_price: 700, ha_price: 0, equipment_slot: null, inventory_slot: 27 },
  ];
}

const value = (items) => items.reduce((sum, item) => sum + item.ge_price * item.quantity, 0);

function snapshotAccount(account) {
  const seen = lastSeen(account);
  const { x, y, plane } = position(account);
  const skills = SKILLS.map((skill, i) => {
    const xp = skillXp(account, i);
    return { skill, level: level(xp), real_level: level(xp), xp };
  });
  const out = {
    id: account.id,
    name: account.name,
    type: account.type,
    type_label: TYPES[account.type],
    categories: account.categories,
    account_hash: crypto.createHash("sha224").update(account.id).digest("hex"),
    owner: { name: `${account.name.split(" ")[0]}'s owner`, discord_id: null },
    online: account.online,
    world: 302 + (account.phase % 40),
    special_world: false,
    game_state: account.online ? (Math.random() < 0.03 ? "HOPPING" : "LOGGED_IN") : "LOGIN_SCREEN",
    last_seen: seen.toISOString(),
    hp: { current: 60 + (account.phase % 39), max: 99 },
    prayer: { current: 20 + (account.phase % 50), max: 70 },
    spellbook: ["standard", "ancient", "lunar", "arceuus"][account.phase % 4],
    location: { x, y, plane, is_on_boat: false, stale: !account.online, updated_at: seen.toISOString() },
    skills: {
      total_level: skills.reduce((sum, s) => sum + s.level, 0),
      overall_xp: skills.reduce((sum, s) => sum + s.xp, 0),
      skills,
    },
  };
  if (shares(account, "equipment")) {
    const items = equipmentItems(account);
    out.equipment = { value: value(items), items };
  }
  if (shares(account, "inventory")) {
    const items = inventoryItems(account);
    out.inventory = { value: value(items), items };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

const events = [];
let seq = 0;
function addEvent(type, account, extra, at = new Date()) {
  const occurredAt = at.toISOString();
  events.push({
    seq: ++seq,
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

const pick = (list) => list[Math.floor(Math.random() * list.length)];

function randomEvent(account, at) {
  const roll = Math.random();
  if (roll < 0.55) {
    const [itemId, itemName, price] = pick(ITEMS);
    const [npcId, npcName] = pick(NPCS);
    const quantity = itemId === 995 ? 50_000 : itemId === 385 ? 5 : 1;
    const total = price * quantity;
    addEvent(
      "loot",
      account,
      {
        value_gp: total,
        item_id: itemId,
        npc_id: npcId,
        title: "Loot",
        line: `${account.name} received ${itemName} (${(total / 1e6).toFixed(1)}M) from ${npcName}`,
        data: {
          type: "loot",
          data: {
            type: "NPC",
            npcId,
            source: { text: npcName },
            totalValue: total,
            items: [
              { id: itemId, name: itemName, gePrice: price, quantity },
              { id: 385, name: "Shark", gePrice: 700, quantity: 3 },
            ],
          },
        },
      },
      at
    );
  } else if (roll < 0.85) {
    const skill = pick(SKILLS);
    const lvl = 60 + Math.floor(Math.random() * 39);
    addEvent("level_up", account, { skill, level: lvl, title: "Level up", line: `${account.name} reached level ${lvl} ${skill}` }, at);
  } else {
    const { x, y, plane } = position(account, at.getTime());
    const location = shares(account, "location_live") ? { x, y, plane } : undefined;
    addEvent(
      "death",
      account,
      {
        value_gp: 250_000,
        title: "Death",
        line: `${account.name} died`,
        data: { type: "death", data: { valueLost: 250_000, danger: "DANGEROUS", ...(location ? { location } : {}) } },
      },
      at
    );
  }
}

// Some history, then something new every few seconds.
for (let i = 0; i < 80; i++) {
  randomEvent(pick(accounts), new Date(started - (80 - i) * 9 * 60_000));
}
setInterval(() => {
  const online = accounts.filter((a) => a.online);
  if (online.length) randomEvent(pick(online), new Date());
}, EVENT_EVERY_MS);

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

function send(res, status, body, headers = {}) {
  const payload = body === undefined ? "" : JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(payload);
}

function ok(res, data, meta = {}, headers = {}) {
  send(res, 200, { data, meta: { generated_at: new Date().toISOString(), ...meta } }, headers);
}

const notFound = (res, message = "Unknown account") => send(res, 404, { error: { code: "not_found", message } });
const ref = (account) => ({ id: account.id, name: account.name });
const findAccount = (id) => accounts.find((a) => a.id === decodeURIComponent(id));
const fromParam = (url, days) => new Date(url.searchParams.get("from") || Date.now() - days * 86400_000).getTime();

function periodStart(period) {
  const now = new Date();
  if (period === "day") return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).getTime();
  return Date.now() - ({ week: 7, month: 30, year: 365 }[period] || 1) * 86400_000;
}

function trail(account, from) {
  const points = [];
  const start = Math.max(from, Date.now() - 6 * 3600_000);
  for (let t = start; t <= Date.now(); t += 60_000) {
    const { x, y, plane } = position(account, t);
    points.push({ at: new Date(t).toISOString(), x, y, plane, world: 302, is_on_boat: false });
  }
  return points;
}

function xpSeries(account, requestedSkills, from, step) {
  return SKILLS.filter((skill) => requestedSkills.some((r) => r.toLowerCase() === skill.toLowerCase())).map((skill) => {
    const i = SKILLS.indexOf(skill);
    const points = [];
    for (let t = from, n = 0; t <= Date.now(); t += step, n++) {
      points.push([new Date(t).toISOString(), Math.floor(account.xp / (i + 2)) - (40 - n) * 1000 * (i + 1)]);
    }
    return { skill, points };
  });
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
      key: {
        id: "k1",
        kind: "service",
        name: "Mock integration key",
        prefix: "mock",
        categories: ALL_CATEGORIES,
        account_scope: "all_visible",
        rate_limit_per_minute: 600,
        expires_at: null,
      },
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
    if (ids.length > 50) return send(res, 400, { error: { code: "invalid", message: "at most 50 accounts" } });
    const requestedSkills = (url.searchParams.get("skills") || "Overall").split(",");
    const unknown = requestedSkills.find((name) => !KNOWN_SKILLS.has(name.trim().toLowerCase()));
    if (unknown) return send(res, 400, { error: { code: "invalid", message: `unknown skill: ${unknown}` } });
    const from = fromParam(url, 7);
    const step = url.searchParams.get("resolution") === "1h" ? 3600_000 : 86400_000;
    const selected = ids.map(findAccount);
    if (selected.some((a) => !a)) return notFound(res);
    return ok(res, {
      resolution: step === 3600_000 ? "1h" : "1d",
      from: new Date(from).toISOString(),
      to: new Date().toISOString(),
      accounts: selected.map((account) => ({ account: ref(account), series: xpSeries(account, requestedSkills, from, step) })),
    });
  }

  if (path === "/locations") {
    const ids = (url.searchParams.get("accounts") || "").split(",");
    if (ids.length > 50) return send(res, 400, { error: { code: "invalid", message: "at most 50 accounts" } });
    const selected = ids.map(findAccount);
    if (selected.some((a) => !a || !shares(a, "location_history"))) return notFound(res);
    const from = fromParam(url, 30);
    return ok(res, {
      from: new Date(from).toISOString(),
      to: new Date().toISOString(),
      accounts: selected.map((account) => ({ account: ref(account), points: trail(account, from) })),
    });
  }

  const accountPath = path.match(/^\/accounts\/([^/]+)(\/[a-z-]+)?$/);
  if (accountPath) {
    const account = findAccount(accountPath[1]);
    const sub = accountPath[2] || "";
    if (!account) return notFound(res);
    const base = { account: ref(account), from: "", to: new Date().toISOString() };

    if (sub === "") {
      const snapshot = snapshotAccount(account);
      return ok(res, {
        ...ref(account),
        first_seen: new Date(started - 90 * 86400_000).toISOString(),
        categories: account.categories,
        presence: { online: snapshot.online, world: snapshot.world, game_state: snapshot.game_state, last_seen: snapshot.last_seen },
      });
    }
    if (sub === "/locations") {
      if (!shares(account, "location_history")) return notFound(res);
      return ok(res, { ...base, points: trail(account, fromParam(url, 30)) });
    }
    if (sub === "/gains") {
      const period = url.searchParams.get("period") || "day";
      const scale = { day: 1, week: 6, month: 25, year: 250 }[period] || 1;
      const gains = SKILLS.map((skill, i) => ({ skill, xp: account.online || scale > 1 ? ((i * 3571 + account.phase * 997) % 40_000) * scale : 0 }));
      return ok(res, { ...base, period, gains: [{ skill: "Overall", xp: gains.reduce((sum, g) => sum + g.xp, 0) }, ...gains] });
    }
    if (sub === "/sessions") {
      const from = fromParam(url, 30);
      const sessions = [];
      for (let day = 0; day * 86400_000 < Date.now() - from; day++) {
        if ((day + account.phase) % 3 === 2) continue;
        const start = Date.now() - day * 86400_000 - (2 + (account.phase % 5)) * 3600_000;
        const duration = (40 + ((day * 37 + account.phase * 11) % 200)) * 60_000;
        const open = day === 0 && account.online;
        sessions.push({
          id: crypto.randomUUID(),
          started_at: new Date(start).toISOString(),
          ended_at: open ? null : new Date(start + duration).toISOString(),
          last_seen_at: new Date(open ? Date.now() : start + duration).toISOString(),
          duration_ms: open ? Date.now() - start : duration,
          worlds: [302 + (account.phase % 40), 330 + (day % 10)],
          end_reason: open ? null : "logout",
        });
      }
      return ok(res, { ...base, sessions });
    }
    if (sub === "/wealth") {
      if (!shares(account, "inventory")) return notFound(res);
      const days = [];
      const now = value(inventoryItems(account)) + value(equipmentItems(account));
      for (let d = 29; d >= 0; d--) {
        const day = new Date(Date.now() - d * 86400_000).toISOString().slice(0, 10);
        const v = Math.round(now * (0.6 + 0.4 * ((30 - d) / 30)) + ((d * 7919) % 2_000_000));
        days.push({ day, last_value: v, max_value: v + 500_000 });
      }
      return ok(res, { ...base, days });
    }
    if (sub === "/equipment-history") {
      if (!shares(account, "equipment")) return notFound(res);
      const current = equipmentItems(account);
      return ok(res, {
        ...base,
        changes: [
          { changed_at: new Date(Date.now() - 3600_000).toISOString(), items: current },
          { changed_at: new Date(Date.now() - 2 * 86400_000).toISOString(), items: current.slice(0, 1) },
        ],
      });
    }
    return notFound(res, `No mock for ${path}`);
  }

  if (path === "/leaderboards/gains") {
    const period = url.searchParams.get("period") || "day";
    const online = accounts.filter((a) => a.online).slice(0, 10);
    return ok(res, {
      period,
      from: new Date(periodStart(period)).toISOString(),
      to: new Date().toISOString(),
      leaderboards: ["Overall", "Attack", "Slayer"].map((skill) => ({
        skill,
        entries: online.map((account, i) => ({ rank: i + 1, account: ref(account), gain: (online.length - i) * 125_000 })),
      })),
    });
  }

  if (path === "/leaderboards/loot") {
    const period = url.searchParams.get("period") || "day";
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") || "10", 10)));
    const from = periodStart(period);
    const entries = events
      .filter((e) => (e.type === "loot" || e.type === "pk_loot") && e.value_gp !== null && new Date(e.occurred_at).getTime() >= from)
      .sort((a, b) => b.value_gp - a.value_gp || b.occurred_at.localeCompare(a.occurred_at))
      .slice(0, limit)
      .map((event, i) => ({ rank: i + 1, event: { ...event, seq: undefined } }));
    return ok(res, { period, from: new Date(from).toISOString(), to: new Date().toISOString(), entries });
  }

  if (path === "/events") {
    const cursor = url.searchParams.get("cursor");
    const limit = parseInt(url.searchParams.get("limit") || "100", 10);
    const types = (url.searchParams.get("types") || "").split(",").filter(Boolean);
    const ids = (url.searchParams.get("accounts") || "").split(",").filter(Boolean);
    const minValue = url.searchParams.get("min_value");
    const matching = events.filter(
      (e) =>
        (!types.length || types.includes(e.type)) &&
        (!ids.length || ids.includes(e.account.id)) &&
        (minValue === null || (e.value_gp ?? -1) >= Number(minValue))
    );
    let page;
    if (cursor === "now") {
      page = [];
    } else if (cursor) {
      const after = parseInt(Buffer.from(cursor, "base64url").toString(), 10);
      page = matching.filter((e) => e.seq > after).slice(0, limit);
    } else {
      page = matching.slice(-limit);
    }
    const last = page.length ? page[page.length - 1].seq : cursor && cursor !== "now" ? parseInt(Buffer.from(cursor, "base64url").toString(), 10) : seq;
    const next = Buffer.from(String(last)).toString("base64url");
    return ok(
      res,
      page.map((e) => ({ ...e, seq: undefined })),
      { count: page.length, next_cursor: next }
    );
  }

  return notFound(res, `No mock for ${path}`);
});

server.listen(PORT, () =>
  console.log(`Mock osrs-data-hub with ${ACCOUNT_COUNT} accounts on http://localhost:${PORT}/api/v1 (key: ${API_KEY})`)
);
