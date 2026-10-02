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
// Serves what the map's backend asks the hub for, following the hub's
// docs/API.md as of D-98: /me, /snapshot (ETag/If-None-Match, with
// game_state; always in full, whatever `since` says), an account's /gains,
// /sessions, /wealth and /equipment-history, the bulk /xp and /locations,
// /leaderboards/gains, /leaderboards/loot and /events (the cursor feed, and
// with `from` a time range read newest first; types, accounts, min_value).
// MOCK_HUB_EVENTS_RANGE=off mimics a hub from before the range read, which
// ignores `from`. /members/{discord_id} (D-100) says who may sign in to the
// map; MOCK_HUB_MEMBERS=off mimics a hub from before it. Under /discord there
// is a stand-in for Discord's OAuth, which asks whom to sign in as (see
// PEOPLE); MOCK_DISCORD_AUTO=<discord id> skips the question.
// Something happens every few seconds
// (MOCK_HUB_EVENT_MS, default 4000): mostly small drops and levels, now and
// then a big drop, PK loot, a collection log slot, a diary, a combat task, a
// superior spawn or a death.
//
// The first account follows a fixed 40-minute route instead (see `route`), with
// everything a trail can show: a walk, teleports, a boat trip, a floor change,
// a dungeon entrance, a death, a world hop and a logout, and the same events
// every lap: a level, a 14.5M drop, a collection log slot. MOCK_HUB_TRAIL_HOURS
// sets how far back trails go (default 6; 720 gives enough to need thinning).
const http = require("http");
const crypto = require("crypto");

const PORT = parseInt(process.env.PORT || "7070", 10);
const API_KEY = process.env.MOCK_HUB_KEY || "ohub_mock_key";
const ACCOUNT_COUNT = Math.max(1, parseInt(process.env.MOCK_HUB_ACCOUNTS || "12", 10));
const EVENT_EVERY_MS = parseInt(process.env.MOCK_HUB_EVENT_MS || "4000", 10);
const TRAIL_HOURS = Math.max(1, parseInt(process.env.MOCK_HUB_TRAIL_HOURS || "6", 10));
const EVENTS_RANGE = process.env.MOCK_HUB_EVENTS_RANGE !== "off";
const MEMBERS_ENDPOINT = process.env.MOCK_HUB_MEMBERS !== "off";
const DISCORD_AUTO = process.env.MOCK_DISCORD_AUTO || "";
// The people the stand-in for Discord signs in as, and what the hub says of
// them: an admin, a member, and someone who isn't in the guild.
const PEOPLE = [
  { id: "100000000000000001", name: "Mock Admin", member: true, admin: true },
  { id: "100000000000000002", name: "Mock Member", member: true, admin: false },
  { id: "100000000000000003", name: "Mock Stranger", member: false, admin: false },
];
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
  [4087, "Dragon platelegs", 160_000],
  [1149, "Dragon med helm", 58_000],
  [2363, "Runite bar", 12_000],
  [1617, "Uncut diamond", 2_500],
  [385, "Shark", 700],
  [995, "Coins", 1],
];
// Most drops are small; one in twelve is worth ten million or more.
const BIG_ITEMS = ITEMS.filter(([, , price]) => price >= 10_000_000);
const SMALL_ITEMS = ITEMS.filter(([, , price]) => price < 10_000_000);
const LOG_ITEMS = [
  [12073, "Elite clue scroll"],
  [11286, "Draconic visage"],
  [13576, "Dragon warhammer"],
];
const DIARIES = ["Lumbridge & Draynor", "Varrock", "Falador", "Ardougne", "Wilderness"];
const DIARY_TIERS = ["Easy", "Medium", "Hard", "Elite"];
const COMBAT_TASKS = [
  ["Noxious Foe", "Easy", 1],
  ["A Slow Death", "Medium", 2],
  ["Demonic Rebound", "Hard", 3],
  ["Perfect Zulrah", "Elite", 4],
];
const SUPERIORS = [
  [7410, "Greater abyssal demon"],
  [7406, "Abhorrent spectre"],
  [7402, "Screaming banshee"],
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
    routed: i === 0,
  };
});

const ROUTE_MINUTES = 40;
const ROUTE_LOGOUT_MINUTE = 35;
const ROUTE_DEATH_MINUTE = 29.5;
// The rest of what happens to the routed account every lap.
const ROUTE_LEVEL_MINUTE = 5;
const ROUTE_DROP_MINUTE = 21;
const ROUTE_LOG_MINUTE = 27;

// Where the first account is at time t. The route depends on the wall clock
// only, so a trail is the same however often it is requested.
function route(t) {
  const p = (t / 60_000) % ROUTE_MINUTES;
  const at = (x, y, extra = {}) => ({ x: Math.round(x), y: Math.round(y), plane: 0, boat: false, world: 302, online: true, ...extra });
  // Lumbridge, north along the river.
  if (p < 8) return at(3222 + 25 * Math.sin(p * 1.3), 3218 + p * 40);
  // Teleport to Falador, walk to Port Sarim.
  if (p < 12) return at(2964 + (p - 8) * 19, 3378 - (p - 8) * 42);
  // Sail south.
  if (p < 18) return at(3040 + (p - 12) * 20, 3200 - (p - 12) * 60, { boat: true });
  // Teleport to the Slayer Tower, three minutes upstairs.
  if (p < 20) return at(3428 + (p - 18) * 4, 3538);
  if (p < 23) return at(3436 + (p - 20) * 3, 3540, { plane: 1 });
  // Teleport to Edgeville, down the trapdoor: the dungeon is 6400 tiles north.
  if (p < 25) return at(3094 + (p - 23) * 1.5, 3491 - (p - 23) * 11.5);
  if (p < 30) return at(3097 + (p - 25) * 10, 9868 + (p - 25) * 20);
  // Dies there, respawns in Lumbridge on another world.
  if (p < 32) return at(3222 + (p - 30) * 5, 3218 + (p - 30) * 8, { world: 330 });
  // In Varrock a minute later: too far to be sure it was on foot.
  if (p < ROUTE_LOGOUT_MINUTE) return at(3212 + (p - 32) * 6, 3424 + (p - 32) * 4, { world: 330 });
  // Logged out until the route starts over.
  return at(3230, 3436, { world: 330, online: false });
}

function position(account, t = Date.now()) {
  if (account.routed) return route(t);
  // One lap every 7 minutes, so the once-a-minute trail points differ.
  const angle = ((t - started) / 420_000) * Math.PI * 2 + account.phase;
  return {
    x: Math.round(account.place[1] + Math.cos(angle) * account.radius),
    y: Math.round(account.place[2] + Math.sin(angle) * account.radius),
    plane: account.place[3],
    boat: false,
    world: 302 + (account.phase % 40),
    online: account.online,
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

function lastSeen(account, online) {
  if (online) return new Date();
  if (account.routed) {
    const lap = Math.floor(Date.now() / 60_000 / ROUTE_MINUTES) * ROUTE_MINUTES;
    return new Date((lap + ROUTE_LOGOUT_MINUTE) * 60_000);
  }
  return new Date(started - (3 + account.phase) * 3600_000);
}

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
  const { x, y, plane, boat, world, online } = position(account);
  const seen = lastSeen(account, online);
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
    online,
    world,
    special_world: false,
    game_state: online ? (Math.random() < 0.03 ? "HOPPING" : "LOGGED_IN") : "LOGIN_SCREEN",
    last_seen: seen.toISOString(),
    hp: { current: 60 + (account.phase % 39), max: 99 },
    prayer: { current: 20 + (account.phase % 50), max: 70 },
    spellbook: ["standard", "ancient", "lunar", "arceuus"][account.phase % 4],
    location: { x, y, plane, is_on_boat: boat, stale: !online, updated_at: seen.toISOString() },
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

function loot(account, at, [itemId, itemName, price], type = "loot") {
  const [npcId, npcName] = pick(NPCS);
  const quantity = itemId === 995 ? 50_000 : itemId === 385 ? 5 : 1;
  const total = price * quantity;
  const worth = total >= 1e6 ? `${(total / 1e6).toFixed(1)}M` : `${Math.round(total / 1e3)}K`;
  const pk = type === "pk_loot";
  const from = pk ? pick(NAMES) : npcName;
  addEvent(
    type,
    account,
    {
      value_gp: total,
      item_id: itemId,
      npc_id: pk ? null : npcId,
      title: pk ? "PK loot" : "Loot",
      line: pk
        ? `${account.name} looted ${itemName} (${worth}) from ${from}`
        : `${account.name} received ${itemName} (${worth}) from ${from}`,
      data: {
        type,
        data: {
          type: pk ? "PLAYER" : "NPC",
          ...(pk ? {} : { npcId }),
          source: { text: from },
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
}

function levelUp(account, at) {
  const skill = pick(SKILLS);
  const lvl = 60 + Math.floor(Math.random() * 39);
  addEvent("level_up", account, { skill, level: lvl, title: "Level up", line: `${account.name} reached level ${lvl} ${skill}` }, at);
}

function collectionLog(account, at) {
  const [itemId, itemName] = pick(LOG_ITEMS);
  addEvent(
    "collection_log",
    account,
    { item_id: itemId, title: "Collection log", line: `${account.name} added ${itemName} to their collection log` },
    at
  );
}

function diary(account, at) {
  const tier = pick(DIARY_TIERS);
  const area = pick(DIARIES);
  addEvent(
    "achievement_diary",
    account,
    { tier, title: "Achievement diary", line: `${account.name} completed the ${tier} ${area} diary` },
    at
  );
}

function combatTask(account, at) {
  const [task, tier, points] = pick(COMBAT_TASKS);
  addEvent(
    "combat_task",
    account,
    { tier, points, title: "Combat task", line: `${account.name} completed the ${tier} combat task ${task}` },
    at
  );
}

// One of the two types that say where they happened (when the account shares that).
function superiorSpawn(account, at) {
  const [npcId, npcName] = pick(SUPERIORS);
  const { x, y, plane } = position(account, at.getTime());
  const location = shares(account, "location_live") ? { x, y, plane } : undefined;
  addEvent(
    "superior_spawn",
    account,
    {
      npc_id: npcId,
      title: "Superior spawn",
      line: `A ${npcName} appeared for ${account.name}`,
      data: { type: "superior_spawn", data: { npcId, ...(location ? { location } : {}) } },
    },
    at
  );
}

function randomEvent(account, at) {
  const roll = Math.random();
  if (roll < 0.45) {
    loot(account, at, pick(Math.random() < 1 / 12 ? BIG_ITEMS : SMALL_ITEMS));
  } else if (roll < 0.5) {
    loot(account, at, pick(SMALL_ITEMS), "pk_loot");
  } else if (roll < 0.75) {
    levelUp(account, at);
  } else if (roll < 0.8) {
    collectionLog(account, at);
  } else if (roll < 0.84) {
    diary(account, at);
  } else if (roll < 0.88) {
    combatTask(account, at);
  } else if (roll < 0.92) {
    superiorSpawn(account, at);
  } else if (!account.routed) {
    death(account, at);
  }
}

function death(account, at) {
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

// What happens to the routed account every lap, at the same minute and so at
// the same place every time: a level, a big drop upstairs in the Slayer
// Tower, a new collection log slot in the dungeon, and a death.
const ROUTE_EVENTS = [
  [ROUTE_LEVEL_MINUTE, levelUp],
  [ROUTE_DROP_MINUTE, (account, at) => loot(account, at, ITEMS[0])],
  [ROUTE_LOG_MINUTE, collectionLog],
  [ROUTE_DEATH_MINUTE, death],
];
let routeEventsUntil = started - TRAIL_HOURS * 3600_000;
function addRouteEvents() {
  const account = accounts.find((a) => a.routed);
  const now = Date.now();
  if (!account) return;
  const lapMs = ROUTE_MINUTES * 60_000;
  for (let lap = Math.floor(routeEventsUntil / lapMs); lap * lapMs <= now; lap++) {
    for (const [minute, add] of ROUTE_EVENTS) {
      const at = lap * lapMs + minute * 60_000;
      if (at > routeEventsUntil && at <= now) add(account, new Date(at));
    }
  }
  routeEventsUntil = now;
}

// Some history, then something new every few seconds.
for (let i = 0; i < 80; i++) {
  randomEvent(pick(accounts), new Date(started - (80 - i) * 9 * 60_000));
}
addRouteEvents();
events.sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
events.forEach((event, i) => (event.seq = i + 1));
setInterval(addRouteEvents, 10_000);
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

// The cursor of a time-range read of /events: the last event served.
const rangeCursor = (event) =>
  Buffer.from(`r1:${Date.parse(event.occurred_at)}:${event.seq}`).toString("base64url");

function parseRangeCursor(cursor) {
  const match = /^r1:(\d+):(\d+)$/.exec(Buffer.from(cursor, "base64url").toString());
  return match ? { at: Number(match[1]), seq: Number(match[2]) } : null;
}

const invalid = (res, message) => send(res, 400, { error: { code: "invalid", message } });

function periodStart(period) {
  const now = new Date();
  if (period === "day") return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).getTime();
  return Date.now() - ({ week: 7, month: 30, year: 365 }[period] || 1) * 86400_000;
}

// One sample per minute, on the minute like the hub's, and none while logged out.
function trail(account, from) {
  const points = [];
  const start = Math.ceil(Math.max(from, Date.now() - TRAIL_HOURS * 3600_000) / 60_000) * 60_000;
  for (let t = start; t <= Date.now(); t += 60_000) {
    const { x, y, plane, boat, world, online } = position(account, t);
    if (account.routed && !online) continue;
    points.push({ at: new Date(t).toISOString(), x, y, plane, world, is_on_boat: boat });
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

// ---------------------------------------------------------------------------
// A stand-in for Discord's OAuth, so the map's own sign-in can be gone through
// without Discord: start the backend with DISCORD_API_BASE=<this>/discord.
// The code it hands out, and the token after it, is just "mock-<discord id>".
// ---------------------------------------------------------------------------

const escapeHtml = (text) => String(text).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const personOfToken = (token) => PEOPLE.find((person) => `mock-${person.id}` === token);

function discord(req, res, url) {
  const path = url.pathname.replace(/^\/discord/, "");

  if (path === "/oauth2/authorize") {
    const back = (person) => {
      const target = new URL(url.searchParams.get("redirect_uri"));
      target.searchParams.set("code", `mock-${person.id}`);
      target.searchParams.set("state", url.searchParams.get("state") || "");
      return target.toString();
    };
    const auto = PEOPLE.find((person) => person.id === DISCORD_AUTO);
    if (auto) {
      res.writeHead(302, { Location: back(auto) });
      return res.end();
    }
    const links = PEOPLE.map(
      (person) =>
        `<li><a href="${escapeHtml(back(person))}">${escapeHtml(person.name)}</a> (${
          person.member ? (person.admin ? "a member and an admin" : "a member") : "not a member"
        } of the mock hub)</li>`
    ).join("");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(`<!doctype html><title>Mock Discord</title><h1>Mock Discord</h1><p>Sign in as:</p><ul>${links}</ul>`);
  }

  if (path === "/oauth2/token" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const code = new URLSearchParams(body).get("code");
      if (!personOfToken(code)) return send(res, 400, { error: "invalid_grant" });
      send(res, 200, { access_token: code, token_type: "Bearer", expires_in: 600, scope: "identify" });
    });
    return;
  }

  if (path === "/v10/users/@me") {
    const person = personOfToken((req.headers.authorization || "").replace(/^Bearer /, ""));
    if (!person) return send(res, 401, { message: "401: Unauthorized", code: 0 });
    return send(res, 200, {
      id: person.id,
      username: person.name.toLowerCase().replace(/ /g, "."),
      global_name: person.name,
      discriminator: "0",
    });
  }

  return send(res, 404, { message: "404: Not Found", code: 0 });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname.replace(/^\/api\/v1/, "");
  console.log(`${req.method} ${url.pathname}${url.search}`);

  if (url.pathname.startsWith("/discord/")) return discord(req, res, url);

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

  // Whether a Discord account is a member of the guild, and an admin (hub D-100).
  const memberPath = path.match(/^\/members\/([^/]+)$/);
  if (memberPath && MEMBERS_ENDPOINT) {
    const id = decodeURIComponent(memberPath[1]);
    if (!/^\d{15,22}$/.test(id)) {
      return send(res, 400, { error: { code: "invalid_request", message: "discord_id is not a Discord id" } });
    }
    const person = PEOPLE.find((p) => p.id === id && p.member);
    return ok(res, {
      discord_id: id,
      member: Boolean(person),
      is_admin: Boolean(person?.admin),
      name: person ? person.name : null,
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
    if (ids.length > 50) return invalid(res, "at most 50 accounts");
    const requestedSkills = (url.searchParams.get("skills") || "Overall").split(",");
    const unknown = requestedSkills.find((name) => !KNOWN_SKILLS.has(name.trim().toLowerCase()));
    if (unknown) return invalid(res, `unknown skill: ${unknown}`);
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
    if (ids.length > 50) return invalid(res, "at most 50 accounts");
    const selected = ids.map(findAccount);
    if (selected.some((a) => !a || !shares(a, "location_history"))) return notFound(res);
    const from = fromParam(url, 30);
    return ok(res, {
      from: new Date(from).toISOString(),
      to: new Date().toISOString(),
      accounts: selected.map((account) => ({ account: ref(account), points: trail(account, from) })),
    });
  }

  const accountPath = path.match(/^\/accounts\/([^/]+)(\/[a-z-]+)$/);
  if (accountPath) {
    const account = findAccount(accountPath[1]);
    const sub = accountPath[2];
    if (!account) return notFound(res);
    const base = { account: ref(account), from: "", to: new Date().toISOString() };

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
    const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get("limit") || "100", 10)));
    const types = (url.searchParams.get("types") || "").split(",").filter(Boolean);
    const ids = (url.searchParams.get("accounts") || "").split(",").filter(Boolean);
    const minValue = url.searchParams.get("min_value");
    const matching = events.filter(
      (e) =>
        (!types.length || types.includes(e.type)) &&
        (!ids.length || ids.includes(e.account.id)) &&
        (minValue === null || (e.value_gp ?? -1) >= Number(minValue))
    );
    // With from: the events that occurred since then, newest first, paged on
    // (occurred_at, seq) until next_cursor is null (hub D-98). The hub also
    // takes `to`; the map never sends it.
    const from = url.searchParams.get("from");
    if (EVENTS_RANGE && from !== null) {
      const after = cursor === null ? null : parseRangeCursor(cursor);
      if (cursor !== null && !after) return invalid(res, "cursor is not a cursor of a time range");
      const start = Date.parse(from);
      if (Number.isNaN(start)) return invalid(res, "from is not a time");
      const at = (e) => Date.parse(e.occurred_at);
      const older = matching
        .filter((e) => at(e) >= start)
        .filter((e) => !after || at(e) < after.at || (at(e) === after.at && e.seq < after.seq))
        .sort((a, b) => at(b) - at(a) || b.seq - a.seq);
      const range = older.slice(0, limit);
      return ok(
        res,
        range.map((e) => ({ ...e, seq: undefined })),
        { count: range.length, next_cursor: older.length > limit ? rangeCursor(range[range.length - 1]) : null }
      );
    }
    if (EVENTS_RANGE && cursor && parseRangeCursor(cursor)) {
      return invalid(res, "cursor is not a cursor from this feed");
    }
    // The feed: the newest events, or the ones after the cursor's, oldest first.
    const after = cursor ? parseInt(Buffer.from(cursor, "base64url").toString(), 10) : null;
    const page = after === null ? matching.slice(-limit) : matching.filter((e) => e.seq > after).slice(0, limit);
    const last = page.length ? page[page.length - 1].seq : after ?? seq;
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
