// Drops a player on to building roofs and sees whether they stand where the roof is drawn. No
// browser: the game's own map.ts and player.ts are bundled for Node and run on the built map
// files, so what's tested is exactly what the game does when you land on a roof.
//
//   node tools/roof_probe.mjs --map combe-down [--per 40] [--squares "1,2 3,4"] [--near x,y,r] [--all] [--packed]
//
// --packed reads the map from the packs the game downloads (tools/pack_squares.mjs) rather than
// its JSON, through the game's own reader.
// For each building tested (--per of them in every square, spread evenly through its list; --all
// for every one; --near for those within r metres of data point x, y), it takes points over the
// roof as world.ts draws it (its lidar faces and the strips closing the slits between them, or
// the flat and pitched roofs both build from roofsFit) on a 1 m grid and at the middle of every
// face and strip, and at each one:
//   - drops a player from a metre above it at 60 frames a second, and from 8 m above at the
//     slowest frame the game allows (20 a second), and checks they end up standing on the drawn
//     roof (within --tol metres, default 0.15);
//   - looks for holes: points inside the building's outline with no roof drawn over them.
// Then it walks a player across the roof from a few of the points, four ways, checking they stay
// on it while they're over it.
// Only points inside the force field count: nobody can get to a roof past it.
// It prints the counts (buildings with each kind of fault, and points) and the worst places, and
// exits 1 if any building fails.
import fs from "fs";
import os from "os";
import path from "path";
import { createRequire } from "module";
import { pathToFileURL } from "url";

const here = path.dirname(new URL(import.meta.url).pathname), web = path.join(here, "..", "web");
const argv = process.argv.slice(2);
const opt = { map: "combe-down", per: "40", tol: "0.15", squares: "", near: "", all: false, list: "12", json: false, at: "", trace: false, packed: false, maps: path.join(web, "public", "maps"), src: path.join(web, "src") };
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) {
  const k = argv[i].slice(2);
  opt[k] = typeof opt[k] === "boolean" ? true : argv[++i];
}
const TOL = +opt.tol;

// the browser globals map.ts and player.ts touch, and fetch reading the built maps from disk
globalThis.location = { search: "" };
globalThis.addEventListener = () => {};
// landmarks paint their textures on canvases as they're shaped: here they paint on nothing
const nothing = new Proxy(function () {}, { get: (_, k) => (k === Symbol.toPrimitive ? () => 0 : nothing), apply: () => nothing, set: () => true });
globalThis.document = { getElementById: () => null, createElement: () => ({ width: 0, height: 0, getContext: () => nothing, style: {} }) };
globalThis.window = globalThis;
globalThis.fetch = async (u) => {
  const f = path.join(opt.maps, String(u).replace(/^\/?maps\//, ""));
  if (!fs.existsSync(f) || (!opt.packed && f.endsWith(".pack.gz"))) return { ok: false, status: 404, json: async () => null, text: async () => "" };
  const b = fs.readFileSync(f), text = () => b.toString("utf8");
  return { ok: true, status: 200, json: async () => JSON.parse(text()), text: async () => text(), arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.length) };
};

const esbuild = createRequire(path.join(web, "package.json"))("esbuild");
const entry = `
export { GameMap, loadMap, tileKey, roofSeams } from "./map";
export { Player } from "./player";
export { unpackSurfaces, readSquare } from "./sfpack";
export { maskSetPieces } from "./landmarks/setpieces";
`;
const out = path.join(os.tmpdir(), `roof_probe_${process.pid}.mjs`);
await esbuild.build({ stdin: { contents: entry, resolveDir: path.resolve(opt.src), loader: "ts" }, nodePaths: [path.join(web, "node_modules")], bundle: true, platform: "node", format: "esm", outfile: out, logLevel: "error" });
const G = await import(pathToFileURL(out).href);
fs.rmSync(out);

const maps = opt.maps;
const wideFile = `maps/${opt.map}-wide.json`, coreFile = `maps/${opt.map}.json`;
const index = fs.existsSync(path.join(maps, opt.map, "tiles.json")) ? JSON.parse(fs.readFileSync(path.join(maps, opt.map, "tiles.json"), "utf8")) : null;
const core = await G.loadMap(coreFile, index ? wideFile : undefined, index ? `maps/${opt.map}/` : undefined);
const z0 = core.z0;

/** With --packed, the squares round (ti, tj) read from their packs, ready for square(). */
const unpacked = new Map();
async function readRound(ti, tj) {
  if (!opt.packed) return;
  for (let i = ti - 1; i <= ti + 1; i++) for (let j = tj - 1; j <= tj + 1; j++) {
    const k = G.tileKey(i, j), f = path.join(maps, opt.map, `${i}_${j}.pack.gz`);
    if (made.has(k) || unpacked.has(k) || !fs.existsSync(f)) continue;
    unpacked.set(k, await G.readSquare(new Uint8Array(fs.readFileSync(f))));
  }
}
/** A square as tiles.ts makes it: parsed, its set pieces masked, its setup run to the end. */
const made = new Map();
function square(ti, tj) {
  const k = G.tileKey(ti, tj);
  if (made.has(k)) return made.get(k);
  const f = path.join(maps, opt.map, `${ti}_${tj}.json`);
  let m = null;
  if (opt.packed ? unpacked.has(k) : fs.existsSync(f)) {
    let d = unpacked.get(k);
    unpacked.delete(k);
    if (!d) { d = JSON.parse(fs.readFileSync(f, "utf8")); G.unpackSurfaces(d); }
    G.maskSetPieces(d);
    m = new G.GameMap(d, null, true);
    while (m.setup && !m.setup.next().done);
    m.setup = null;
  }
  made.set(k, m);
  return m;
}
/** Just the 3 x 3 squares round (ti, tj) loaded in the core, as a player there would have them. */
function loadRound(ti, tj) {
  for (const k of [...core.tiles.keys()]) core.dropTile(k);
  for (const k of [...made.keys()]) {
    const i = Math.floor(k / 1024) - 512, j = (k % 1024) - 512;
    if (Math.abs(i - ti) > 1 || Math.abs(j - tj) > 1) made.delete(k);
  }
  for (let i = ti - 1; i <= ti + 1; i++) for (let j = tj - 1; j <= tj + 1; j++) {
    const m = square(i, j);
    if (m) core.addTile(G.tileKey(i, j), m);
  }
}

// ---- the roof as world.ts draws it ----
const triAt = (ax, ay, az, bx, by, bz, cx, cy, cz, x, y) => {
  const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
  if (Math.abs(d) < 1e-9) return null;
  const l1 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / d, l2 = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / d, l3 = 1 - l1 - l2;
  return l1 >= -1e-6 && l2 >= -1e-6 && l3 >= -1e-6 ? l1 * az + l2 * bz + l3 * cz : null;
};
/** Each building's drawn roof surfaces, as triangles [ax, ay, az, bx, ...] above sea level (null:
 *  a roof world.ts builds from roofsFit, the same as map.ts stands you on, so judged by that). */
const drawnCache = new WeakMap();
function drawnTris(b) {
  if (drawnCache.has(b)) return drawnCache.get(b);
  let tris = null;
  if (b.rm) {
    tris = [];
    const v = b.rm.v, t = b.rm.t;
    for (let i = 0; i < t.length; i += 3) tris.push([0, 1, 2].flatMap((k) => [v[3 * t[i + k]], v[3 * t[i + k] + 1], v[3 * t[i + k] + 2]]));
    const s = G.roofSeams(b);
    for (let i = 0; i < s.length; i += 12) {
      const q = [0, 3, 6, 9].map((k) => [s[i + k], s[i + k + 1], s[i + k + 2]]);
      // as world.ts: a strip that lies down is roof; one that stands up is a wall in a step
      const ex = q[2][0] - q[0][0], ey = q[2][1] - q[0][1], ez = q[2][2] - q[0][2], fx = q[3][0] - q[1][0], fy = q[3][1] - q[1][1], fz = q[3][2] - q[1][2];
      const nx = ey * fz - ez * fy, ny = ez * fx - ex * fz, nz = ex * fy - ey * fx, n = Math.hypot(nx, ny, nz);
      if (n < 1e-6 || Math.abs(nz) / n <= 0.7) continue;
      tris.push([...q[0], ...q[1], ...q[2]], [...q[0], ...q[2], ...q[3]]);
    }
  }
  drawnCache.set(b, tris);
  return tris;
}
/** The drawn roof's height over data (x, y) for building b, above sea level, or null if none is drawn there. */
function drawnAt(m, b, x, y) {
  const tris = drawnTris(b);
  if (!tris) {
    const h = m.roofAt(b, x, y);
    return h === -Infinity ? null : h + z0;
  }
  let best = null;
  for (const t of tris) {
    const h = triAt(...t, x, y);
    if (h !== null && (best === null || h > best)) best = h;
  }
  return best;
}
function bbox(b) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of b.r[0]) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
  for (const t of drawnTris(b) ?? []) for (let k = 0; k < 9; k += 3) { x0 = Math.min(x0, t[k]); y0 = Math.min(y0, t[k + 1]); x1 = Math.max(x1, t[k]); y1 = Math.max(y1, t[k + 1]); }
  return [x0, y0, x1, y1];
}
function inRing(r, x, y) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) if (r[i][1] > y !== r[j][1] > y && x < ((r[j][0] - r[i][0]) * (y - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) c = !c;
  return c;
}
const inside = (b, x, y) => inRing(b.r[0], x, y) && !b.r.slice(1).some((r) => inRing(r, x, y));

/** The highest drawn roof over (x, y) of any building near it in the loaded squares, or null. */
function drawnAny(x, y) {
  let best = null;
  for (const m of [core, ...core.tilesNear(x, -y, 60)]) for (const b of m.d.bl) {
    if (b.__box === undefined) b.__box = bbox(b);
    const [x0, y0, x1, y1] = b.__box;
    if (x < x0 || x > x1 || y < y0 || y > y1) continue;
    const h = drawnAt(m, b, x, y);
    if (h !== null && (best === null || h > best)) best = h;
  }
  return best;
}

/** The highest drawn roof of b within half a metre of (x, y), or null. */
function around(m, b, x, y) {
  let best = null;
  for (let k = 0; k < 16; k++) for (const r of [0.15, 0.3, 0.5]) {
    const h = drawnAt(m, b, x + r * Math.cos((k * Math.PI) / 8), y + r * Math.sin((k * Math.PI) / 8));
    if (h !== null && (best === null || h > best)) best = h;
  }
  return best;
}

// ---- dropping and walking a player ----
function newPlayer() {
  const p = new G.Player(core);
  return p;
}
const player = newPlayer();
function settle(p, dt, frames) {
  for (let f = 0; f < frames; f++) {
    p.update(dt, false);
    if (p.onGround && Math.abs(p.vel.y) < 1e-6 && f > 2) return true;
  }
  return p.onGround;
}
/** Drops the player from `above` metres over the drawn roof at (x, y); where they stand, as [x, y, height]. */
function drop(x, y, top, above, dt) {
  const p = player;
  p.pos.set(x, top - z0 + above, -y);
  p.vel.set(0, 0, 0);
  p.onGround = false;
  settle(p, dt, Math.ceil(4 / dt));
  return [p.pos.x, -p.pos.z, p.pos.y + z0];
}

const counts = { buildings: 0, points: 0, holes: 0, sink: 0, through: 0, fast: 0, walk: 0, high: 0 };
const bad = { holes: new Set(), sink: new Set(), through: new Set(), fast: new Set(), walk: new Set(), high: new Set() };
const worst = [];
const note = (kind, key, x, y, msg) => { counts[kind]++; bad[kind].add(key); if (worst.length < 100000) worst.push({ kind, key, x, y, msg }); };

function testBuilding(m, b, key) {
  counts.buildings++;
  const [x0, y0, x1, y1] = bbox(b);
  const pts = [];
  for (let x = Math.floor(x0) + 0.5; x < x1; x += 1) for (let y = Math.floor(y0) + 0.5; y < y1; y += 1) pts.push([x, y]);
  for (const t of drawnTris(b) ?? []) pts.push([(t[0] + t[3] + t[6]) / 3, (t[1] + t[4] + t[7]) / 3]);
  const ok = [];
  for (const [x, y] of pts) {
    if (core.fieldEdge(x, -y) < 1) continue;   // (past the force field: nobody gets there)
    let top = drawnAt(m, b, x, y);
    if (top === null) {
      if (!inside(b, x, y)) continue;
      // a crack between faces is still roof to stand on, at the faces' height beside it; a gap
      // wider than that is a hole
      top = around(m, b, x, y);
      if (top === null) { note("holes", key, x, y, "no roof drawn"); continue; }
    }
    // under a higher roof (one building's over another's) it's that one's to stand on
    const over = drawnAny(x, y);
    if (over !== null && over > top + 0.05) continue;
    counts.points++;
    for (const [above, dt, kind] of [[1, 1 / 60, "slow"], [8, 0.05, "fast"]]) {
      const [fx, fy, h] = drop(x, y, top, above, dt);
      const want = drawnAny(fx, fy) ?? (inside(b, fx, fy) ? around(m, b, fx, fy) : null);
      if (want === null) continue;   // pushed off the roof by a taller neighbour's wall
      if (h < want - TOL) {
        const kindOf = kind === "fast" ? "fast" : want - h > 1.5 ? "through" : "sink";
        note(kindOf, key, x, y, `stood at ${h.toFixed(2)}, roof drawn at ${want.toFixed(2)}`);
      } else if (h > want + TOL && kind === "slow") note("high", key, x, y, `stood at ${h.toFixed(2)}, roof drawn at ${want.toFixed(2)}`);
      else if (kind === "slow") ok.push([fx, fy]);
    }
  }
  // walks: from a few of the good points, four ways, at walking pace, while over this roof
  const p = player;
  for (let i = 0; i < Math.min(3, ok.length); i++) {
    const [sx, sy] = ok[Math.floor((i * ok.length) / 3)];
    for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const top = drawnAny(sx, sy);
      drop(sx, sy, top, 0.3, 1 / 60);
      p.yaw = yaw;
      p.keys.add("KeyW");
      for (let f = 0; f < 240; f++) {
        p.update(1 / 60, true);
        const x = p.pos.x, y = -p.pos.z, want = drawnAt(m, b, x, y);
        if (want === null) break;
        const any = drawnAny(x, y) ?? want;
        if (p.pos.y + z0 < any - 0.6) { note("walk", key, x, y, `walked down to ${(p.pos.y + z0).toFixed(2)}, roof drawn at ${any.toFixed(2)}`); break; }
      }
      p.keys.clear();
    }
  }
}

// --at x,y: what the game says is underfoot there, for looking into one place
if (opt.at && index) {
  const [x, y] = opt.at.split(",").map(Number), S = index.cells * index.dx;
  await readRound(Math.floor((x - index.x0) / S), Math.floor((y - index.y0) / S));
  loadRound(Math.floor((x - index.x0) / S), Math.floor((y - index.y0) / S));
  const top = drawnAny(x, y);
  console.log(`drawn ${top}`);
  for (const above of [3, 1, 0.3, 0]) console.log(`feet at ${(top + above).toFixed(2)}: floor ${(core.floor(x, -y, top - z0 + above) + z0).toFixed(2)}, ground ${(core.ground(x, -y) + z0).toFixed(2)}`);
  if (opt.trace) {
    const p = player;
    p.pos.set(x, top - z0 + 1, -y); p.vel.set(0, 0, 0); p.onGround = false;
    for (let f = 0; f < 120; f++) {
      p.update(1 / 60, false);
      if (f % 5 === 0) console.log(f, p.pos.x.toFixed(2), (-p.pos.z).toFixed(2), (p.pos.y + z0).toFixed(2), p.onGround, p.vel.x.toFixed(2), p.vel.y.toFixed(2), p.vel.z.toFixed(2));
    }
  }
  process.exit(0);
}

// ---- which buildings ----
const S = index ? index.cells * index.dx : 0;
let squares = index ? index.tiles.map(([i, j]) => [i, j]) : [];
if (opt.squares) squares = opt.squares.trim().split(/\s+/).map((s) => s.split(",").map(Number));
const near = opt.near ? opt.near.split(",").map(Number) : null;
if (near && index) {
  // (a building can reach out of its own square into the next)
  const ti = Math.floor((near[0] - index.x0) / S), tj = Math.floor((near[1] - index.y0) / S);
  squares = squares.filter(([i, j]) => Math.abs(i - ti) <= 1 && Math.abs(j - tj) <= 1);
}
squares.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

/** Which of buildings bl to test: those near --near, all of them, or --per spread through the list. */
function pick(bl) {
  let out = bl.map((_, i) => i);
  if (near) out = out.filter((i) => { const [x0, y0, x1, y1] = bbox(bl[i]); return Math.hypot(Math.max(x0 - near[0], 0, near[0] - x1), Math.max(y0 - near[1], 0, near[1] - y1)) <= near[2]; });
  else if (!opt.all) { const n = Math.min(+opt.per, bl.length); out = Array.from({ length: n }, (_, k) => Math.floor(((k + 0.5) * bl.length) / n)); }
  return out;
}
const t0 = Date.now();
// the map's own first area (Combe Down's village), with no square loaded over it
if (!opt.squares && (!near || core.inGrid(near[0], -near[1]))) {
  if (near) squares = [];
  for (const i of pick(core.d.bl)) testBuilding(core, core.d.bl[i], `core#${i}`);
}
for (const [ti, tj] of index ? squares : []) {
  await readRound(ti, tj);
  loadRound(ti, tj);
  const m = square(ti, tj);
  if (!m) continue;
  const bl = m.d.bl;
  for (const i of pick(bl)) testBuilding(m, bl[i], `${ti}_${tj}#${i}`);
}

const kinds = ["holes", "sink", "through", "fast", "walk", "high"];
const words = { holes: "holes (outline with no roof drawn)", sink: "stood below the drawn roof", through: "fell through it (1.5 m or more)", fast: "fell through dropping fast", walk: "sank in walking across it", high: "stood above it" };
if (opt.json) {
  // for tools/check_more.py: one finding per building and kind, at its first bad point
  const RULE = { holes: "22 roof with a hole in it", sink: "22 roof stood on below where it's drawn", through: "22 roof you fall through", fast: "22 roof you fall through landing fast", walk: "22 roof you sink into walking over it" };
  const once = new Map();
  for (const w of worst) if (RULE[w.kind] && !once.has(`${w.kind} ${w.key}`)) once.set(`${w.kind} ${w.key}`, { rule: RULE[w.kind], score: 1, x: w.x, y: w.y, what: w.msg });
  console.log(JSON.stringify([...once.values()]));
  process.exit(0);
}
console.log(`${opt.map}: ${counts.buildings} buildings, ${counts.points} points dropped on, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
for (const k of kinds) console.log(`  ${words[k]}: ${bad[k].size} buildings, ${counts[k]} points`);
const failed = new Set(kinds.filter((k) => k !== "high").flatMap((k) => [...bad[k]]));
console.log(`  buildings failing: ${failed.size}`);
const seen = new Set();
for (const w of worst) {
  if (seen.size >= +opt.list) break;
  const k = `${w.kind} ${w.key}`;
  if (seen.has(k)) continue;
  seen.add(k);
  console.log(`  ${w.kind.padEnd(7)} ${w.key.padEnd(12)} at ${w.x.toFixed(1)},${w.y.toFixed(1)}: ${w.msg}`);
}
process.exit(failed.size ? 1 : 0);
