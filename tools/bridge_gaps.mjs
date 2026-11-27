// Gaps in the bridges whose decks are the squares' faces (?decks=1), measured on what the game draws.
// It serves a built game (web/dist, with the maps read from web/public/maps so a rebuilt map needs no
// new game build) in a muted headless Chrome, finds every deck in the squares' faces (`sf.lv`, one
// bridge to each piece of joined deck), goes to each from the menu's backdrop, waits until the squares
// there are built, and measures, for each bridge:
//  a. open edges: the edges of its stone and steel (deck sides, underside, parapets, piers, arches,
//     abutments) and of its deck's top that only one triangle uses, once corners within a centimetre are
//     one, and that nothing else drawn runs along or meets (within 5 cm; a bar's open end, under 20 cm across, isn't counted): a parapet left hollow at its
//     end, a hole in the underside, a slot. An edge lying on the ground or on a face, or sunk just under one, is not open.
//     Metres of edge.
//  b. see-through: every half metre over the deck where it stands a metre or more over the ground,
//     looking straight up from the ground: nothing seen before the deck's top is a hole in it from
//     below. Square metres.
//  c. unwalled drops: every half metre along the outer edge of every face on the deck and within 15 m
//     of it (the approaches), a walkable edge with more than 0.5 m down the other side (not into
//     water) and nothing drawn at waist or knee height across it. Metres, on the deck and off it.
//  d. headroom: every half metre along every way passing under the deck, on its line and inside its
//     edges, the room from its surface up to the first thing drawn over it, against what it needs
//     (a walker's head on a path, a cyclist's on a cycle track, a van on a road). Metres of way short,
//     and the least room.
//  w. watertight: the game's own count (?solids=1, world.ts bridgeSolid) of the edges of the bridge's
//     solid (its deck's top, underside and walls, and its parapets) that only one triangle uses, welded
//     to the centimetre, leaving out its edges along a square's side, where it runs on into the next.
//  f. floating ends: the game's own count (?solids=1) of the bridge's ends (where its deck meets the
//     street) that hang in the air: within 3 m of one, its outline stands more than 0.3 m over the
//     ground with no wall down to the bank under it, nothing passing under and no water.
//
//   cd web && npx vite build && cd .. && node tools/quiet.mjs -- node tools/bridge_gaps.mjs [--out gaps.json]
//       [--only "ti_tj ..."] [--near "x,y x,y"] [--map combe-down] [--maps web/public/maps] [--dist web/dist]
// Prints one row per bridge (name, square, a, b, c, d) and the whole map's totals; --out writes them as
// JSON with where each gap is. PW=<playwright> and CHROME=<a Chrome> as for shoot.mjs.
import { createRequire } from "module";
import fs from "fs";
import http from "http";
import path from "path";
import { MUTED_ARGS, silence, silenceContext, silenceNote } from "./quiet-guard.mjs";

const WEB = new URL("../web/", import.meta.url).pathname;
const { chromium } = (() => {
  if (process.env.PW) return createRequire(import.meta.url)(process.env.PW);
  try { return createRequire(WEB + "package.json")("playwright"); } catch { return createRequire(import.meta.url)("playwright"); }
})();
const argv = process.argv.slice(2), opt = { dist: WEB + "dist", maps: WEB + "public/maps", map: "combe-down", timeout: "90" };
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) opt[argv[i].slice(2)] = argv[++i];
const say = (s) => process.stderr.write(s);

// ---- every deck: the joined pieces of each square's level 1, with where it is ----------------------
const KINDS = ["road", "service", "pave", "path", "grass", "dirt", "gravel", "stone", "steel"];
const dir = path.join(opt.maps, opt.map);
const only = opt.only ? new Set(opt.only.split(/[ ]+/).map((s) => s.replace(",", "_"))) : null;
const near = opt.near ? opt.near.split(/[ ]+/).map((s) => s.split(",").map(Number)) : null;
const decks = [];
for (const f of fs.readdirSync(dir).filter((f) => /^-?\d+_-?\d+\.json$/.test(f)).sort()) {
  const sq = f.slice(0, -5);
  if (only && !only.has(sq)) continue;
  const d = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  if (!d.sf?.lv?.length || !d.sf.dk) continue;
  unpack(d.sf);
  for (const c of components(d.sf)) {
    if (near && !near.some(([x, y]) => Math.hypot(c.x - x, c.y - y) < 60)) continue;
    decks.push({ sq, ...c, name: nameOf(d.rd, c) });
  }
}
say(`${decks.length} decks\n`);
if (!decks.length) { console.log("[]"); process.exit(0); }

// (as web/src/sfpack.ts unpackSurfaces: the file's points are centimetre steps from the square's corner)
function unpack(sf) {
  if (!sf.o) return;
  const unstep = (a) => { let at = 0; return a.map((s) => (at += s)); };
  const at = [0, 0, 0], o = [sf.o[0], sf.o[1], 0];
  sf.v = sf.v.map((s, k) => o[k % 3] + (at[k % 3] += s) / 100);
  for (const lv of sf.lv) for (const k of KINDS) if (lv[k]) lv[k] = unstep(lv[k]);
}
function components(sf) {
  const V = sf.v, tris = [];
  for (const lv of sf.lv) for (const k of KINDS) { const T = lv[k] ?? []; for (let i = 0; i + 2 < T.length; i += 3) tris.push([T[i], T[i + 1], T[i + 2]]); }
  const up = new Map(), find = (a) => { while (up.has(a) && up.get(a) !== a) a = up.get(a); return a; };
  for (const t of tris) for (const v of t) if (!up.has(v)) up.set(v, v);
  for (const [a, b, c] of tris) { up.set(find(b), find(a)); up.set(find(c), find(a)); }
  const by = new Map();
  for (const t of tris) { const r = find(t[0]); (by.get(r) ?? by.set(r, []).get(r)).push(t); }
  const out = [];
  for (const ts of by.values()) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, area = 0, cx = 0, cy = 0;
    for (const t of ts) {
      const [a, b, c] = t.map((i) => [V[3 * i], V[3 * i + 1]]);
      const A = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
      area += A; cx += A * (a[0] + b[0] + c[0]) / 3; cy += A * (a[1] + b[1] + c[1]) / 3;
      for (const p of [a, b, c]) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    }
    if (area < 1) continue;
    out.push({ x: +(cx / area).toFixed(2), y: +(cy / area).toFixed(2), box: [x0, y0, x1, y1].map((v) => +v.toFixed(2)), area: +area.toFixed(1) });
  }
  return out;
}
function nameOf(rd, c) {
  let best = Infinity, got = "";
  for (const r of rd ?? []) for (let k = 0; k + 1 < r.p.length; k++) {
    const A = r.p[k], B = r.p[k + 1];
    if (!(A[3] || B[3])) continue;
    const vx = B[0] - A[0], vy = B[1] - A[1], t = Math.max(0, Math.min(1, ((c.x - A[0]) * vx + (c.y - A[1]) * vy) / (vx * vx + vy * vy || 1)));
    const dd = Math.hypot(c.x - A[0] - vx * t, c.y - A[1] - vy * t);
    if (dd < best) { best = dd; got = r.n || r.c; }
  }
  return got || "(unnamed)";
}

// ---- the game ------------------------------------------------------------------------------------
const TYPES = { ".js": "text/javascript", ".html": "text/html", ".css": "text/css", ".json": "application/json", ".wasm": "application/wasm" };
const server = http.createServer((q, res) => {
  const u = decodeURIComponent(q.url.split("?")[0]);
  let f = u.startsWith("/maps/") ? path.join(opt.maps, u.slice(6)) : path.join(opt.dist, u);
  if (f.endsWith("/")) f += "index.html";
  fs.readFile(f, (e, b) => { if (e) { res.statusCode = 404; return res.end(); } res.setHeader("content-type", TYPES[path.extname(f)] || "application/octet-stream"); res.end(b); });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const exe = process.env.CHROME;
const browser = await chromium.launch({ headless: true, ...(exe ? { executablePath: exe } : { channel: "chrome" }),
  args: [...MUTED_ARGS, ...(process.platform === "darwin" ? ["--use-angle=metal", "--enable-gpu"] : process.platform === "linux" ? ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : [])] });
const context = await browser.newContext({ viewport: { width: 640, height: 360 } });
await silenceContext(context);
const page = await context.newPage();
await silence(page);
await page.addInitScript(() => { globalThis.__keepArrays = true; });
const at = (d) => `${d.x},${d.y},0,-30,40`;
await page.goto(`http://127.0.0.1:${server.address().port}/?map=${opt.map}&decks=1&solids=1&at=${at(decks[0])}`);
await page.evaluate(() => { window.__budget = 40; });
await page.waitForFunction(() => window.__map && window.__map() && window.__renderer, null, { timeout: 120000 });
await page.evaluate(() => {
  const r = window.__renderer, render = r.render.bind(r);
  window.__scenes = new Set();
  r.render = (s, c) => { if (s.isScene) window.__scenes.add(s); return render(s, c); };
});
await page.evaluate(probe);

// (decks near each other are measured from one view)
if (opt.tris) {
  // (--tris "x,y,h": the triangles with an edge within 0.4 m of that point, to see what an open edge
  // is meant to meet)
  for (const s of opt.tris.split(/ +/)) {
    const [x, y, h] = s.split(",").map(Number);
    await page.evaluate((a) => { window.__at = a; }, `${x},${y},0,-30,40`);
    await settle();
    console.log(s);
    for (const l of await page.evaluate(([x, y, h]) => window.__trisNear(x, y, h), [x, y, h])) console.log(" ", JSON.stringify(l));
  }
  await browser.close(); server.close(); process.exit(0);
}
if (opt.probe) {
  for (const s of opt.probe.split(/ +/)) {
    const [x, y] = s.split(",").map(Number);
    await page.evaluate((a) => { window.__at = a; }, `${x},${y},0,-30,40`);
    await settle();
    console.log(s, JSON.stringify(await page.evaluate(([x, y]) => window.__upHits(x, y), [x, y])));
  }
  await browser.close(); server.close(); process.exit(0);
}
const rows = [];
let late = 0, view = null;
for (const [i, d] of decks.entries()) {
  if (!view || Math.hypot(view.x - d.x, view.y - d.y) > 150) {
    view = d;
    await page.evaluate((a) => { window.__at = a; }, at(d));
    if (!(await settle())) late++;
  }
  const got = await page.evaluate((d) => window.__gaps(d), d);
  // (the game's own count of its solid's open edges: world.ts bridgeSolid, with ?solids=1)
  const w = await page.evaluate((d) => {
    let best = null, far = 40;
    for (const s of Object.values(window.__solidStats ?? {})) { const dd = Math.hypot(s.x - d.x, s.y - d.y); if (dd < far) { far = dd; best = s; } }
    return best;
  }, d);
  rows.push({ name: d.name, sq: d.sq, x: d.x, y: d.y, area: d.area, ...got, w: w ? w.open : null, wm: w ? w.metres : null, wat: w?.at, f: w ? w.floating ?? 0 : null, fm: w ? w.floatingM ?? 0 : 0, fat: w?.fat });
  say(`\r${i + 1}/${decks.length} decks${late ? ` (${late} views timed out)` : ""}   `);
}
say(`\n${await silenceNote(page)}\n`);
await browser.close();
server.close();

const f1 = (v) => (v ? v.toFixed(1) : "0");
const head = `${"bridge".padEnd(34)} ${"square".padEnd(6)} ${"a open m".padStart(9)} ${"b see m2".padStart(9)} ${"c deck m".padStart(9)} ${"c appr m".padStart(9)} ${"d short m".padStart(9)} ${"d least".padStart(8)} ${"w open".padStart(7)} ${"f ends".padStart(7)}`;
console.log(head);
for (const r of rows.sort((p, q) => (q.a + q.b + q.cDeck + q.cOff + q.d) - (p.a + p.b + p.cDeck + p.cOff + p.d)))
  console.log(`${`${r.name} (${Math.round(r.x)},${Math.round(r.y)})`.slice(0, 34).padEnd(34)} ${r.sq.padEnd(6)} ${f1(r.a).padStart(9)} ${f1(r.b).padStart(9)} ${f1(r.cDeck).padStart(9)} ${f1(r.cOff).padStart(9)} ${f1(r.d).padStart(9)} ${(r.least === null ? "-" : r.least.toFixed(2)).padStart(8)} ${(r.w === null ? "-" : String(r.w)).padStart(7)} ${(r.f === null ? "-" : String(r.f)).padStart(7)}`);
const tot = (k) => rows.reduce((s, r) => s + r[k], 0);
const totals = { decks: rows.length, a: +tot("a").toFixed(1), b: +tot("b").toFixed(1), cDeck: +tot("cDeck").toFixed(1), cOff: +tot("cOff").toFixed(1), d: +tot("d").toFixed(1),
  w: rows.reduce((s, r) => s + (r.w ?? 0), 0), wm: +rows.reduce((s, r) => s + (r.wm ?? 0), 0).toFixed(1), withW: rows.filter((r) => r.w > 0).length, f: rows.reduce((s, r) => s + (r.f ?? 0), 0), fm: +rows.reduce((s, r) => s + (r.fm ?? 0), 0).toFixed(1), withF: rows.filter((r) => r.f > 0).length, unmeasuredW: rows.filter((r) => r.w === null).length,
  withA: rows.filter((r) => r.a > 0).length, withB: rows.filter((r) => r.b > 0).length, withC: rows.filter((r) => r.cDeck + r.cOff > 0).length, withD: rows.filter((r) => r.d > 0).length };
console.log(`total over ${totals.decks} decks: a ${totals.a} m open edge (${totals.withA} decks), b ${totals.b} m2 see-through (${totals.withB}), c ${totals.cDeck} m on decks + ${totals.cOff} m on approaches unwalled (${totals.withC}), d ${totals.d} m of way short of headroom (${totals.withD}), w ${totals.w} open edges of the solids, ${totals.wm} m (${totals.withW} decks; ${totals.unmeasuredW} not reported), f ${totals.f} floating ends, ${totals.fm} m (${totals.withF} decks)`);
if (opt.out) fs.writeFileSync(opt.out, JSON.stringify({ totals, rows }, null, 1));

async function settle() {
  await page.evaluate(() => { window.__calm = null; });
  return page.waitForFunction(() => {
    if (window.__tilesPending !== 0) { window.__calm = null; return false; }
    const c = (window.__calm ??= { frames: 0, t: performance.now() });
    return ++c.frames >= 12 && performance.now() - c.t > 500;
  }, null, { timeout: +opt.timeout * 1000, polling: "raf" }).then(() => true, () => false);
}

/** In the page: window.__gaps(deck) measures the deck whose middle is at data (deck.x, deck.y). */
function probe() {
  const KINDS = ["road", "service", "pave", "path", "grass", "dirt", "gravel", "stone", "steel"];
  // (as map.ts DECK_LIFT and FACE_LIFT: how far over its points each kind of face is drawn)
  const DECK_LIFT = { road: 0.07, service: 0.07, pave: 0.17, path: 0.17, grass: 0.17, dirt: 0.17, gravel: 0.17, stone: 0.17, steel: 0.17 };
  // what a way under a bridge needs over its surface: a walker's head (player.ts EYE + HEAD), a cyclist's, a van's
  const NEED = { footway: 1.8, path: 1.8, steps: 1.8, pedestrian: 1.8, bridleway: 2.4, cycleway: 2.4, track: 2.4 };
  const ROAD_NEED = 4.0;
  const PATHC = new Set(["footway", "path", "steps", "cycleway", "bridleway", "track", "pedestrian"]);
  const RW = { trunk: 9, primary: 8.5, secondary: 8, tertiary: 7, residential: 6, unclassified: 5.5, living_street: 5, service: 3.5, pedestrian: 6, footway: 1.6, steps: 1.8, cycleway: 2, path: 1.4, track: 2.8, bridleway: 2 };
  const SKIP = new Set(["sky", "trees", "woods", "outskirts", "field", "lamps", "grass", "grass-build", "furniture", "shops", "face-cells"]);
  const skipped = (o) => { for (let p = o; p; p = p.parent) if (p.name && SKIP.has(p.name)) return true; return false; };
  const C = 1;
  const MET = 0.05;   // metres: a slit narrower than this between two faces is not seen
  const cell = (i, j) => i * 100003 + j;

  // every triangle drawn round a box (scene coords), binned by metre square: corners, whether it shows from both sides, and what it is
  function trianglesIn(x0, z0, x1, z1) {
    const scene = [...window.__scenes].reduce((a, s) => (!a || s.children.length > a.children.length ? s : a), null);
    const tris = [], grid = new Map();
    scene.updateMatrixWorld();
    scene.traverseVisible((m) => {
      if (!m.isMesh || m.isInstancedMesh || m.isSkinnedMesh || !m.geometry?.attributes?.position?.array || (m.geometry.index && !m.geometry.index.array)) return;
      if (skipped(m)) return;
      const g = m.geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      const bb = g.boundingBox.clone().applyMatrix4(m.matrixWorld);
      if (bb.max.x < x0 || bb.min.x > x1 || bb.max.z < z0 || bb.min.z > z1) return;
      const pos = g.attributes.position, idx = g.index, cnt = idx ? idx.count : pos.count, e = m.matrixWorld.elements;
      const two = (Array.isArray(m.material) ? m.material[0] : m.material).side === 2, what = m.userData.what ?? "";
      const structure = what === "stone" || what === "steel";
      const mat = Array.isArray(m.material) ? m.material[0] : m.material;
      let named = what;
      for (let p = m; p; p = p.parent) named += " " + (p.name ?? "");
      // (the water: world.ts waterMaterial, the one material drawn with that offset)
      const clear = /water|stream|canal|river/.test(named) || (mat.side === 2 && mat.polygonOffsetFactor === -2 && mat.polygonOffsetUnits === -4);
      for (let t = 0; t + 2 < cnt; t += 3) {
        const v = new Float64Array(9);
        for (let k = 0; k < 3; k++) {
          const i = idx ? idx.getX(t + k) : t + k, X = pos.getX(i), Y = pos.getY(i), Z = pos.getZ(i);
          v[3 * k] = e[0] * X + e[4] * Y + e[8] * Z + e[12]; v[3 * k + 1] = e[1] * X + e[5] * Y + e[9] * Z + e[13]; v[3 * k + 2] = e[2] * X + e[6] * Y + e[10] * Z + e[14];
        }
        const ax = Math.min(v[0], v[3], v[6]), bx = Math.max(v[0], v[3], v[6]), az = Math.min(v[2], v[5], v[8]), bz = Math.max(v[2], v[5], v[8]);
        if (bx < x0 || ax > x1 || bz < z0 || az > z1) continue;
        const n = tri(v, two, structure, clear);
        if (n) n.what = named.trim();
        if (!n) continue;
        const id = tris.push(n) - 1;
        for (let i = Math.floor(ax / C); i <= Math.floor(bx / C); i++) for (let j = Math.floor(az / C); j <= Math.floor(bz / C); j++) {
          const k = cell(i, j); (grid.get(k) ?? grid.set(k, []).get(k)).push(id);
        }
      }
    });
    return { tris, grid };
  }
  function tri(v, two, structure, clear = false) {
    const ux = v[3] - v[0], uy = v[4] - v[1], uz = v[5] - v[2], wx = v[6] - v[0], wy = v[7] - v[1], wz = v[8] - v[2];
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx, l = Math.hypot(nx, ny, nz);
    if (l < 1e-9) return null;
    return { v, two, structure, clear, n: [nx / l, ny / l, nz / l], lo: Math.min(v[1], v[4], v[7]), hi: Math.max(v[1], v[4], v[7]) };
  }
  const near = (T, x0, z0, x1, z1) => {
    const out = new Set();
    for (let i = Math.floor(Math.min(x0, x1) / C); i <= Math.floor(Math.max(x0, x1) / C); i++)
      for (let j = Math.floor(Math.min(z0, z1) / C); j <= Math.floor(Math.max(z0, z1) / C); j++) for (const t of T.grid.get(cell(i, j)) ?? []) out.add(t);
    return out;
  };
  // the closest point to p on triangle v (Ericson, Real-Time Collision Detection 5.1.5)
  function closest(p, v) {
    const a = [v[0], v[1], v[2]], b = [v[3], v[4], v[5]], c = [v[6], v[7], v[8]];
    const sub = (x, y) => [x[0] - y[0], x[1] - y[1], x[2] - y[2]], dot = (x, y) => x[0] * y[0] + x[1] * y[1] + x[2] * y[2];
    const add = (x, s, y) => [x[0] + s * y[0], x[1] + s * y[1], x[2] + s * y[2]];
    const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a), d1 = dot(ab, ap), d2 = dot(ac, ap);
    if (d1 <= 0 && d2 <= 0) return a;
    const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
    if (d3 >= 0 && d4 <= d3) return b;
    const vc = d1 * d4 - d3 * d2;
    if (vc <= 0 && d1 >= 0 && d3 <= 0) return add(a, d1 / (d1 - d3), ab);
    const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
    if (d6 >= 0 && d5 <= d6) return c;
    const vb = d5 * d2 - d1 * d6;
    if (vb <= 0 && d2 >= 0 && d6 <= 0) return add(a, d2 / (d2 - d6), ac);
    const va = d3 * d6 - d5 * d4;
    if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return add(b, (d4 - d3) / ((d4 - d3) + (d5 - d6)), sub(c, b));
    const den = 1 / (va + vb + vc);
    return add(add(a, vb * den, ab), vc * den, ac);
  }
  // where a segment from o along dir (length len) first meets a triangle: the distance, or Infinity
  function hit(t, o, dir, len) {
    const v = t.v, e1 = [v[3] - v[0], v[4] - v[1], v[5] - v[2]], e2 = [v[6] - v[0], v[7] - v[1], v[8] - v[2]];
    const p = [dir[1] * e2[2] - dir[2] * e2[1], dir[2] * e2[0] - dir[0] * e2[2], dir[0] * e2[1] - dir[1] * e2[0]];
    const det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2];
    if (Math.abs(det) < 1e-12) return Infinity;
    const inv = 1 / det, s = [o[0] - v[0], o[1] - v[1], o[2] - v[2]], u = (s[0] * p[0] + s[1] * p[1] + s[2] * p[2]) * inv;
    if (u < 0 || u > 1) return Infinity;
    const q = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]], w = (dir[0] * q[0] + dir[1] * q[1] + dir[2] * q[2]) * inv;
    if (w < 0 || u + w > 1) return Infinity;
    const d = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) * inv;
    return d >= 0 && d <= len ? d : Infinity;
  }
  // (a face turned away from where you look from is not drawn, unless it shows from both sides)
  const seenFrom = (t, dir) => t.two || t.n[0] * dir[0] + t.n[1] * dir[1] + t.n[2] * dir[2] < 0;
  const firstHit = (T, o, dir, len, seen = true) => {
    let best = Infinity;
    for (const k of near(T, o[0], o[2], o[0] + dir[0] * len, o[2] + dir[2] * len)) {
      const t = T.tris[k];
      if (seen && !seenFrom(t, dir)) continue;
      const d = hit(t, o, dir, len);
      if (d < best) best = d;
    }
    return best;
  };

  // going up from below everything at (x, z) to y1 (just under the deck's top), is there a place you
  // could stand (a metre of air over a face turned up) with nothing seen over you? A face turned down
  // over the air closes it; climbing through the ground or an abutment, you come out on its top.
  function seeThrough(T, x, z, y1) {
    const y0 = y1 - 60, hits = [];
    for (const k of near(T, x, z, x, z)) {
      const t = T.tris[k];
      if (t.clear || t.hi < y0 || t.lo > y1) continue;
      const d = hit(t, [x, y0, z], [0, 1, 0], y1 - y0);
      if (d < Infinity) hits.push([y0 + d, t]);
    }
    hits.sort((p, q) => p[0] - q[0]);
    let floor = null;
    for (const [y, t] of hits) {
      if (floor !== null && (t.two || t.n[1] < -0.05)) return false;
      floor = t.n[1] > 0.05 || t.two ? y : null;
    }
    return floor !== null && y1 - floor >= 1.0;
  }

  // is the first thing drawn below (x, y, z) water (the canal's, a river's)?
  function wet(T, x, z, y) {
    let best = Infinity, clear = false;
    for (const k of near(T, x, z, x, z)) {
      const t = T.tris[k];
      if (t.lo > y) continue;
      const d = hit(t, [x, y, z], [0, -1, 0], 30);
      if (d < best) { best = d; clear = t.clear; }
    }
    return clear;
  }

  window.__trisNear = (x, y, h) => {
    const map = window.__map(), z = -y, Y = h - (map.z0 ?? 0), T = trianglesIn(x - 1, z - 1, x + 1, z + 1), out = [];
    for (const t of T.tris) {
      const v = t.v;
      const seg = (a, b) => { const d = [v[b] - v[a], v[b + 1] - v[a + 1], v[b + 2] - v[a + 2]], l2 = d[0] ** 2 + d[1] ** 2 + d[2] ** 2 || 1, f = Math.max(0, Math.min(1, ((x - v[a]) * d[0] + (Y - v[a + 1]) * d[1] + (z - v[a + 2]) * d[2]) / l2)); return Math.hypot(v[a] + d[0] * f - x, v[a + 1] + d[1] * f - Y, v[a + 2] + d[2] * f - z); };
      if (Math.min(seg(0, 3), seg(3, 6), seg(6, 0)) > 0.4) continue;
      out.push([t.what, t.n.map((q) => +q.toFixed(2)), [0, 3, 6].map((k) => [+v[k].toFixed(2), +(-v[k + 2]).toFixed(2), +(v[k + 1] + (map.z0 ?? 0)).toFixed(2)])]);
    }
    return out;
  };
  // (--probe "x,y ...": everything drawn straight over data (x, y), from the ground up, to see what a sample met)
  window.__upHits = (x, y) => {
    const map = window.__map(), z = -y, T = trianglesIn(x - 2, z - 2, x + 2, z + 2), g = map.ground(x, z), out = [];
    for (const k of near(T, x, z, x, z)) {
      const t = T.tris[k], d = hit(t, [x, g - 5, z], [0, 1, 0], 40);
      if (d < Infinity) out.push([+(g - 5 + d + (map.z0 ?? 0)).toFixed(2), +t.n[1].toFixed(2), t.two ? "two" : "one", t.structure ? "structure" : t.clear ? "clear" : "other", t.what]);
    }
    return { ground: +(g + (map.z0 ?? 0)).toFixed(2), hits: out.sort((p, q) => p[0] - q[0]) };
  };
  window.__gaps = (deck) => {
    const map = window.__map(), maps = [map, ...map.tiles.values()].filter((m) => m.d?.sf?.lv?.length);
    // the deck again, from the square that has it: its triangles in scene coords, at their drawn heights
    let own = null, at = null;
    for (const m of maps) {
      const sf = m.d.sf, V = sf.v, z0 = m.z0 ?? 0, tris = [];
      for (const lv of sf.lv) for (const k of KINDS) { const T = lv[k] ?? []; for (let i = 0; i + 2 < T.length; i += 3) tris.push([T[i], T[i + 1], T[i + 2], DECK_LIFT[k]]); }
      const up = new Map(), find = (a) => { while (up.has(a) && up.get(a) !== a) a = up.get(a); return a; };
      for (const t of tris) for (let k = 0; k < 3; k++) if (!up.has(t[k])) up.set(t[k], t[k]);
      for (const [a, b, c] of tris) { up.set(find(b), find(a)); up.set(find(c), find(a)); }
      const by = new Map();
      for (const t of tris) { const r = find(t[0]); (by.get(r) ?? by.set(r, []).get(r)).push(t); }
      for (const ts of by.values()) {
        let area = 0, cx = 0, cy = 0;
        for (const [a, b, c] of ts) {
          const A = Math.abs((V[3 * b] - V[3 * a]) * (V[3 * c + 1] - V[3 * a + 1]) - (V[3 * c] - V[3 * a]) * (V[3 * b + 1] - V[3 * a + 1])) / 2;
          area += A; cx += A * (V[3 * a] + V[3 * b] + V[3 * c]) / 3; cy += A * (V[3 * a + 1] + V[3 * b + 1] + V[3 * c + 1]) / 3;
        }
        if (area >= 1 && Math.hypot(cx / area - deck.x, cy / area - deck.y) < 0.05) { own = ts.map(([a, b, c, lift]) => [a, b, c].flatMap((i) => [V[3 * i], V[3 * i + 2] - z0 + lift, -V[3 * i + 1]])); at = m; }
      }
    }
    if (!own) return { a: 0, b: 0, cDeck: 0, cOff: 0, d: 0, least: null, missing: true, where: {} };
    const [bx0, by0, bx1, by1] = deck.box, R = 15;
    const T = trianglesIn(bx0 - R - 2, -by1 - R - 2, bx1 + R + 2, -by0 + R + 2);
    const where = { a: [], b: [], c: [], d: [] };
    const inBox = (x, z, r) => x > bx0 - r && x < bx1 + r && -z > by0 - r && -z < by1 + r;
    const ground = (x, z) => map.ground(x, z), top = (x, z, y) => map.walkTop(x, z, y);
    const ownT = own.map((v) => tri(Float64Array.from(v), false, false)).filter(Boolean);
    // the deck's top over scene (x, z), or null off it
    const ownGrid = new Map();
    ownT.forEach((t, id) => {
      const v = t.v;
      for (let i = Math.floor(Math.min(v[0], v[3], v[6])); i <= Math.floor(Math.max(v[0], v[3], v[6])); i++)
        for (let j = Math.floor(Math.min(v[2], v[5], v[8])); j <= Math.floor(Math.max(v[2], v[5], v[8])); j++) { const k = cell(i, j); (ownGrid.get(k) ?? ownGrid.set(k, []).get(k)).push(id); }
    });
    const deckTop = (x, z) => {
      let h = null;
      for (const id of ownGrid.get(cell(Math.floor(x), Math.floor(z))) ?? []) {
        const v = ownT[id].v, ux = v[3] - v[0], uz = v[5] - v[2], wx = v[6] - v[0], wz = v[8] - v[2], d = ux * wz - uz * wx;
        if (Math.abs(d) < 1e-9) continue;
        const px = x - v[0], pz = z - v[2], s = (px * wz - pz * wx) / d, u = (ux * pz - uz * px) / d;
        if (s < -1e-6 || u < -1e-6 || s + u > 1 + 1e-6) continue;
        const y = v[1] + s * (v[4] - v[1]) + u * (v[7] - v[1]);
        if (h === null || y > h) h = y;
      }
      return h;
    };

    // a. open edges of the bridge's own stone and steel and its deck's top
    const bridgeT = [...ownT];
    for (const t of T.tris) if (t.structure) {
      const v = t.v, mx = (v[0] + v[3] + v[6]) / 3, mz = (v[2] + v[5] + v[8]) / 3;
      if (inBox(mx, mz, 3)) bridgeT.push(t);
    }
    const key = (v, k) => `${Math.round(v[3 * k] * 100)},${Math.round(v[3 * k + 1] * 100)},${Math.round(v[3 * k + 2] * 100)}`;
    const uses = new Map();
    bridgeT.forEach((t, id) => {
      for (let k = 0; k < 3; k++) {
        const a = key(t.v, k), b = key(t.v, (k + 1) % 3), e = a < b ? `${a}|${b}` : `${b}|${a}`;
        const u = uses.get(e); if (u) u.n++; else uses.set(e, { n: 1, id, k });
      }
    });
    let a = 0;
    for (const { n, id, k } of uses.values()) {
      if (n !== 1) continue;
      const t = bridgeT[id], v = t.v, A = [v[3 * k], v[3 * k + 1], v[3 * k + 2]], B = [v[3 * ((k + 1) % 3)], v[3 * ((k + 1) % 3) + 1], v[3 * ((k + 1) % 3) + 2]];
      const len = Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]);
      // (the open ends of a railing's or a truss's bars, a few centimetres across, are not seen)
      if (len < 0.2) continue;
      const cx = (v[0] + v[3] + v[6]) / 3, cy = (v[1] + v[4] + v[7]) / 3, cz = (v[2] + v[5] + v[8]) / 3;
      let open = 0;
      for (const f of [0.2, 0.5, 0.8]) {
        const p = [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f, A[2] + (B[2] - A[2]) * f];
        // (on or in the ground, or lying on a face: met by it)
        const g = ground(p[0], p[2]);
        if (p[1] < g + 0.05) continue;
        if (Math.abs(top(p[0], p[2], p[1] + 0.05) - p[1]) < 0.05) continue;
        // (or just under a face walked on, sunk into the deck it stands on: a parapet's foot)
        const over = top(p[0], p[2], p[1] + 0.3);
        if (over > p[1] && over <= p[1] + 0.3) continue;
        let met = false;
        for (const o of near(T, p[0] - MET, p[2] - MET, p[0] + MET, p[2] + MET)) {
          const u = T.tris[o];
          if (p[1] < u.lo - MET || p[1] > u.hi + MET) continue;
          const q = closest(p, u.v);
          if (Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) > MET) continue;
          // (the same face drawn again, on the same side of the edge, doesn't close it)
          const par = Math.abs(u.n[0] * t.n[0] + u.n[1] * t.n[1] + u.n[2] * t.n[2]) > 0.97;
          if (par) {
            const ux = (u.v[0] + u.v[3] + u.v[6]) / 3 - p[0], uy = (u.v[1] + u.v[4] + u.v[7]) / 3 - p[1], uz = (u.v[2] + u.v[5] + u.v[8]) / 3 - p[2];
            const sx = cx - p[0], sy = cy - p[1], sz = cz - p[2];
            if (ux * sx + uy * sy + uz * sz > 0) continue;
          }
          met = true; break;
        }
        if (!met) open++;
      }
      if (open >= 2) { a += len; if (where.a.length < 400) where.a.push([+((A[0] + B[0]) / 2).toFixed(1), +(-(A[2] + B[2]) / 2).toFixed(1), +((A[1] + B[1]) / 2 + (map.z0 ?? 0)).toFixed(1), +len.toFixed(2), t.what ?? "deck", t.n.map((v) => +v.toFixed(2)), +(Math.abs(B[1] - A[1]) / len).toFixed(2)]); }
    }

    // b. see-through from below
    let b = 0;
    const UP = [0, 1, 0];
    for (let x = Math.ceil(bx0 * 2) / 2; x <= bx1; x += 0.5) for (let y = Math.ceil(by0 * 2) / 2; y <= by1; y += 0.5) {
      const z = -y, h = deckTop(x, z);
      if (h === null) continue;
      const g = ground(x, z);
      if (h - g < 1.0) continue;
      if (seeThrough(T, x, z, h - 0.02)) { b += 0.25; if (where.b.length < 400) where.b.push([x, y]); }
    }

    // c. unwalled drops along the faces' outer edges, on the deck and on its approaches
    let cDeck = 0, cOff = 0;
    const seenC = new Set();
    const edges = [];
    for (const m of maps.concat([...map.tiles.values()].filter((m) => m.d?.sf && !maps.includes(m)))) {
      const sf = m.d.sf, V = sf.v, z0 = m.z0 ?? 0;
      const lists = [[sf.e, false], ...(m === at ? (sf.lv ?? []).map((lv) => [lv.e, true]) : [])];
      for (const [E, onDeck] of lists) for (const e of E ?? []) for (let k = 0; k + 1 < e.i.length; k++) {
        const i = e.i[k], j = e.i[k + 1], ax = V[3 * i], ay = V[3 * i + 1], bx = V[3 * j], by = V[3 * j + 1];
        if (!inBox((ax + bx) / 2, -(ay + by) / 2, R)) continue;
        edges.push([ax, ay, V[3 * i + 2] - z0, bx, by, V[3 * j + 2] - z0, onDeck]);
      }
    }
    for (const [ax, ay, az, bx, by, bz, onDeck] of edges) {
      const L = Math.hypot(bx - ax, by - ay);
      if (L < 0.05) continue;
      const tx = (bx - ax) / L, ty = (by - ay) / L, nx = -ty, ny = tx;
      for (let s = 0.25; s < L; s += 0.5) {
        const x = ax + tx * s, y = ay + ty * s, h = az + (bz - az) * s / L;
        const k = `${Math.round(x * 4)},${Math.round(y * 4)}`;
        if (seenC.has(k)) continue;
        for (const side of [1, -1]) {
          const ix = x + nx * 0.2 * side, iy = y + ny * 0.2 * side, ox = x - nx * 0.4 * side, oy = y - ny * 0.4 * side;
          const ti = top(ix, -iy, h + 0.5);
          if (Math.abs(ti - h) > 0.35) continue;
          const to = top(ox, -oy, ti + 0.3);
          if (ti - to <= 0.5) continue;
          if (map.inWater(ox, -oy) || wet(T, ox, -oy, ti)) continue;
          const dir = [-nx * side, 0, ny * side];
          // (every 5 cm from knee to chest, so a railing's bars stop it too; from a metre in, so a ledge
          // outside a parapet, behind it from the walk, is walled too)
          const jx = x + nx * 1.0 * side, jy = y + ny * 1.0 * side;
          const walled = Array.from({ length: 19 }, (_, k) => 0.25 + 0.05 * k).some((up) => firstHit(T, [ix, ti + up, -iy], dir, 0.8, false) < Infinity || firstHit(T, [jx, ti + up, -jy], dir, 1.6, false) < Infinity);
          if (walled) continue;
          seenC.add(k);
          if (onDeck || deckTop(x, -y) !== null) cDeck += 0.5; else cOff += 0.5;
          if (where.c.length < 400) where.c.push([+x.toFixed(1), +y.toFixed(1), +(ti - to).toFixed(2), onDeck ? 1 : 0]);
          break;
        }
      }
    }

    // d. headroom for the ways passing under
    let d = 0, least = null;
    const seenD = new Set();
    for (const m of [map, ...map.tiles.values()]) for (const r of m.d?.rd ?? []) {
      if (r.p.length < 2) continue;
      const z0 = m.z0 ?? 0, half = (r.w ?? RW[r.c] ?? 4) / 2, need = PATHC.has(r.c) ? NEED[r.c] ?? 1.8 : ROAD_NEED;
      for (let k = 0; k + 1 < r.p.length; k++) {
        const A = r.p[k], B = r.p[k + 1];
        if (A[3] && B[3]) continue;
        if (!inBox(A[0], -A[1], half + 30) && !inBox(B[0], -B[1], half + 30)) continue;
        const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
        if (L < 0.01) continue;
        const tx = (B[0] - A[0]) / L, ty = (B[1] - A[1]) / L;
        for (let s = 0; s < L; s += 0.5) {
          let short = false;
          for (const off of [0, half - 0.3, -(half - 0.3)]) {
            const x = A[0] + tx * s - ty * off, y = A[1] + ty * s + tx * off, z = -y;
            const h = deckTop(x, z);
            if (h === null) continue;
            const way = A[2] + (B[2] - A[2]) * s / L - z0;
            if (h - way < 1.0) continue;
            const surf = top(x, z, way + 0.3);
            if (h - surf < 1.0) continue;
            // (from a hand's breadth over the way, so its own face and kerb, a few centimetres over the
            // ground the walk stands on, aren't taken for a ceiling)
            const base = Math.max(surf, way), room = firstHit(T, [x, base + 0.25, z], UP, h - base, false) + 0.25;
            if (least === null || room < least) { least = room; where.least = [+x.toFixed(1), +y.toFixed(1), off === 0 ? "middle" : "edge", +(base + map.z0).toFixed(2), +(h + map.z0).toFixed(2), r.n || r.c]; }
            if (room < need) short = true;
          }
          const sk = `${Math.round((A[0] + tx * s) * 2)},${Math.round((A[1] + ty * s) * 2)}`;
          if (short && !seenD.has(sk)) { seenD.add(sk); d += 0.5; if (where.d.length < 400) where.d.push([+(A[0] + tx * s).toFixed(1), +(A[1] + ty * s).toFixed(1), r.n || r.c]); }
        }
      }
    }
    return { a: +a.toFixed(2), b, cDeck, cOff, d, least: least === null ? null : +least.toFixed(2), where };
  };
}
