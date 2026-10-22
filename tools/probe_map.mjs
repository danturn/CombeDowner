// A record of what the game makes of the village, for proving a change to how the map loads leaves
// it the same. It serves a built game (web/dist) in a muted headless Chrome that can't make a sound
// or take the mouse, goes to the middle of each of the village's nine squares in turn from the
// menu's backdrop, waits until everything round there has loaded, and asks the game's own map,
// every 7 m, what is there: the ground, what you'd stand on, the tallest roof, whether it's
// indoors or blocked, the tunnel floor. Every 25 m it also casts a ray straight down and one east
// at chest height. Then it counts what the map holds inside the village (buildings, roads, trees,
// street things...) and how long its roads, walls and paths are, so a road cut in two at a square's
// edge still adds up the same.
//
//   cd web && npx vite build && cd .. && node tools/probe_map.mjs --out probe/before
//   node tools/probe_map.mjs --out probe/after
//   node tools/probe_map.mjs --compare probe/before probe/after      (no browser: reads the two)
//
// It asks the map through window.__map (web/src/main.ts) and the methods the game itself calls
// (map.ts: ground, floor, indoors, collide, tunnelFloor, raycast, detailedAt, areas), so it sees what
// a player would. Each square's things are counted while you're in the middle of it. Options:
// --dist web/dist, --map combe-down, --step 7, --ray 25, --timeout 120 (seconds a square may take
// to load). PW=<path to playwright> and CHROME=<a Chrome> as for shoot.mjs.
//
// The comparison sorts each difference by where it is: within 3 m of a seam between two of the
// village's squares, within 3 m of the village's outer edge, or anywhere else. Some differences at
// seams and the edge are expected (see the plan); anywhere else, a difference is a bug.
import { createRequire } from "module";
import fs from "fs";
import http from "http";
import path from "path";
import { MUTED_ARGS, silence, silenceContext } from "./quiet-guard.mjs";

// the village: nine squares of 261 cells of about 4 m, from (-1975, -1345), as tiles.json has them
const X0 = -1975, Y0 = -1345, S = 261 * 3.9974457215836527;
const BOX = [X0, Y0, X0 + 3 * S, Y0 + 3 * S];

const argv = process.argv.slice(2), opt = { dist: new URL("../web/dist", import.meta.url).pathname, out: "probe", map: "combe-down", step: "7", ray: "25", timeout: "120" };
const given = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--compare") opt.compare = true;
  else if (a.startsWith("--")) opt[a.slice(2)] = argv[++i];
  else given.push(a);
}
if (opt.compare) { compare(given[0], given[1]); process.exit(0); }

// ---- serve the built game ---------------------------------------------------------------------
const WEB = new URL("../web/", import.meta.url).pathname;
const { chromium } = (() => {
  if (process.env.PW) return createRequire(import.meta.url)(process.env.PW);
  try { return createRequire(WEB + "package.json")("playwright"); } catch { return createRequire(import.meta.url)("playwright"); }
})();
const TYPES = { ".js": "text/javascript", ".html": "text/html", ".css": "text/css", ".json": "application/json", ".wasm": "application/wasm" };
const server = http.createServer((q, res) => {
  let f = path.join(opt.dist, decodeURIComponent(q.url.split("?")[0]));
  if (f.endsWith("/")) f += "index.html";
  fs.readFile(f, (e, b) => {
    if (e) { res.statusCode = 404; return res.end(); }
    res.setHeader("content-type", TYPES[path.extname(f)] || "application/octet-stream");
    res.end(b);
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

// ---- a muted headless Chrome, with the page's sound switched off as well -----------------------
const linux = process.platform === "linux";
const exe = process.env.CHROME || (linux && fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : null);
const browser = await chromium.launch({
  headless: true,
  ...(exe ? { executablePath: exe } : { channel: "chrome" }),
  args: [...MUTED_ARGS,
    ...(linux ? ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
      : process.platform === "darwin" ? ["--use-angle=metal", "--enable-gpu"] : [])],
});
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
await silence(page);
const complaints = [];
page.on("pageerror", (e) => complaints.push(`error: ${e.message}`));

try {
  const centre = (ti, tj) => [X0 + (ti + 0.5) * S, Y0 + (tj + 0.5) * S];
  const [cx0, cy0] = centre(1, 1);
  await page.goto(`http://127.0.0.1:${port}/?map=${opt.map}&time=11:00&at=${cx0},${cy0},0,0`);
  await page.evaluate(() => { window.__budget = 40; });
  await page.waitForFunction(() => window.__map && window.__map() && window.__dbg !== undefined, null, { timeout: 120000 });

  const out = { started: new Date().toISOString(), map: opt.map, box: BOX, step: +opt.step, ray: +opt.ray, squares: [] };
  out.z0 = await page.evaluate(() => window.__map().z0);
  for (let tj = 0; tj < 3; tj++) for (let ti = 0; ti < 3; ti++) {
    const [cx, cy] = centre(ti, tj), t0 = Date.now();
    await page.evaluate((at) => { window.__at = at; }, `${cx},${cy},0,0`);
    const ready = await settle();
    // vehicles are things that move, not map, and a square only makes its own once a game is
    // running (or, in the one-file layout, the map makes them as it is built): sample with the
    // map's movers emptied, so the two layouts are compared like for like
    await page.evaluate(() => { const m = window.__map(); window.__savedMovers = m.movers.splice(0); });
    const sq = await page.evaluate(sample, { x0: X0 + ti * S, y0: Y0 + tj * S, x1: X0 + (ti + 1) * S, y1: Y0 + (tj + 1) * S, step: +opt.step, ray: +opt.ray, gx: X0, gy: Y0 });
    await page.evaluate(() => { const m = window.__map(); if (window.__savedMovers) m.movers.push(...window.__savedMovers); });
    // counted while this square and its neighbours are loaded, so every square's things are there
    const counted = await page.evaluate(count, [X0 + ti * S, Y0 + tj * S, X0 + (ti + 1) * S, Y0 + (tj + 1) * S]);
    out.squares.push({ ti, tj, ready, seconds: (Date.now() - t0) / 1000, counted, ...sq });
    console.log(`square ${ti},${tj}: ${sq.n} points, ${sq.rays.length / 6} rays in ${((Date.now() - t0) / 1000).toFixed(1)}s${ready ? "" : " (NOT fully loaded: timed out)"}`);
  }
  // the village's counts: each square's own, added up
  out.counts = { counts: {}, lengths: {}, areas: 0 };
  for (const q of out.squares) {
    for (const k of ["counts", "lengths"]) for (const [f, v] of Object.entries(q.counted[k])) out.counts[k][f] = (out.counts[k][f] ?? 0) + v;
    out.counts.areas = Math.max(out.counts.areas, q.counted.areas);
  }
  out.complaints = [...new Set(complaints)];
  fs.mkdirSync(opt.out, { recursive: true });
  fs.writeFileSync(path.join(opt.out, "probe.json"), JSON.stringify(out));
  console.log("counts:", JSON.stringify(out.counts));
  console.log(`written ${path.join(opt.out, "probe.json")}; ${out.complaints.length} page complaints`);
} finally {
  await browser.close();
  server.close();
}

/** Wait until every square in sight has loaded and been built, and has stayed so for a dozen frames. */
async function settle() {
  await page.evaluate(() => { window.__calm = null; });
  return page.waitForFunction(() => {
    const p = window.__tilesPending;
    if (p !== undefined && p !== 0) { window.__calm = null; return false; }
    const c = (window.__calm ??= { frames: 0, t: performance.now() });
    return ++c.frames >= 12 && performance.now() - c.t > 500;
  }, null, { timeout: +opt.timeout * 1000, polling: "raf" }).then(() => true, () => false);
}

/** In the page: every step metres over one square (on one grid for the whole village), what the map says. */
function sample({ x0, y0, x1, y1, step, ray, gx, gy }) {
  const m = window.__map(), r2 = (v) => Math.round(v * 100) / 100;
  const pts = [], g = [], f1 = [], f40 = [], ind = [], blk = [], tun = [], det = [];
  // the first point of a grid of spacing s laid from origin o, at or after a
  const first = (a, o, s) => Math.ceil((a - s / 2 - o) / s) * s + s / 2 + o;
  for (let y = first(y0, gy, step); y < y1; y += step) for (let x = first(x0, gx, step); x < x1; x += step) {
    const z = -y, h = m.ground(x, z);
    pts.push(r2(x), r2(y));
    g.push(r2(h));
    f1.push(r2(m.floor(x, z, h + 1)));
    f40.push(r2(m.floor(x, z, h + 40)));
    ind.push(m.indoors(x, z) ? 1 : 0);
    const p = { x, z };
    m.collide(p, h, 0.3);
    blk.push(Math.hypot(p.x - x, p.z - z) > 1e-3 ? 1 : 0);
    const t = m.tunnelFloor(x, z);
    tun.push(t === null ? null : r2(t));
    det.push(m.detailedAt(x, z) ? 1 : 0);
  }
  // rays: [x, y, down distance, down kind, east distance, east kind] (kind: g, b, w, t or - for none)
  const rays = [], k = (h) => (h ? h.kind[0] : "-");
  for (let y = first(y0, gy, ray); y < y1; y += ray) for (let x = first(x0, gx, ray); x < x1; x += ray) {
    const z = -y, h = m.ground(x, z);
    const dn = m.raycast(x, h + 60, z, 0, -1, 0, 80), ea = m.raycast(x, h + 1.5, z, 1, 0, 0, 25);
    rays.push(r2(x), r2(y), dn ? r2(dn.dist) : null, k(dn), ea ? r2(ea.dist) : null, k(ea));
  }
  return { n: g.length, pts, g, f1, f40, ind, blk, tun, det, rays };
}

/** In the page: what the map holds inside the box, counted by where each thing starts, and the
 *  lengths of its lines (which don't change when a line is cut at a square's edge). */
function count([bx0, by0, bx1, by1]) {
  const m = window.__map(), seen = new Set(), counts = {}, lengths = {};
  const xy = (v) => {
    if (Array.isArray(v)) {
      if (typeof v[0] === "number" && typeof v[1] === "number") return [v[0], v[1]];
      for (const e of v) if (typeof e !== "string") { const r = xy(e); if (r) return r; }
      return null;
    }
    if (v && typeof v === "object") return xy(v.r ?? v.p ?? null);
    return null;
  };
  const inside = (p) => p && p[0] >= bx0 && p[0] < bx1 && p[1] >= by0 && p[1] < by1;
  const KEYS = ["bl", "rd", "wp", "wl", "br", "tr", "gt", "fx", "mk", "sh", "lm", "dr", "sb", "fp", "dv", "by", "wr", "pi", "tn", "spawn"];
  for (const a of m.areas()) {
    if (seen.has(a)) continue;
    seen.add(a);
    // spawn is the one key the game reads from the root map alone (game.ts): the header and the
    // square both carry the ring, so counting every area counted it twice
    for (const key of KEYS) for (const f of a.d[key] ?? []) {
      if (key === "spawn" && a !== m) continue;
      if (!inside(xy(f))) continue;
      counts[key] = (counts[key] ?? 0) + 1;
      const p = Array.isArray(f) ? null : f.p;
      if (p) {
        let len = 0;
        for (let i = 1; i < p.length; i++) len += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
        lengths[key] = (lengths[key] ?? 0) + len;
      }
    }
  }
  for (const k of Object.keys(lengths)) lengths[k] = Math.round(lengths[k]);
  return { counts, lengths, areas: seen.size };
}

/** Read two probes and say where they differ, sorted by how near a seam or the edge each difference is. */
function compare(a, b) {
  const A = JSON.parse(fs.readFileSync(path.join(a, "probe.json"), "utf8")), B = JSON.parse(fs.readFileSync(path.join(b, "probe.json"), "utf8"));
  const seams = [X0 + S, X0 + 2 * S], seamsY = [Y0 + S, Y0 + 2 * S];
  const where = (x, y) => {
    if (Math.min(x - BOX[0], BOX[2] - x, y - BOX[1], BOX[3] - y) < 3) return "edge";
    if (seams.some((s) => Math.abs(x - s) < 3) || seamsY.some((s) => Math.abs(y - s) < 3)) return "seam";
    return "elsewhere";
  };
  const TOL = { g: 0.05, f1: 0.05, f40: 0.05, ind: 0, blk: 0, tun: 0.05, det: 0 };
  const diff = {}, worst = [];
  const add = (field, x, y, va, vb) => {
    const w = where(x, y), d = (diff[field] ??= { seam: 0, edge: 0, elsewhere: 0 });
    d[w]++;
    if (w === "elsewhere" && worst.length < 200) worst.push({ field, x, y, before: va, after: vb });
  };
  if (A.z0 !== B.z0) console.log(`z0 differs: ${A.z0} before, ${B.z0} after (heights are measured from it)`);
  for (let s = 0; s < A.squares.length; s++) {
    const sa = A.squares[s], sb = B.squares[s];
    if (sa.n !== sb.n) { console.log(`square ${sa.ti},${sa.tj}: ${sa.n} points before, ${sb.n} after: not comparable`); continue; }
    for (let i = 0; i < sa.n; i++) {
      const x = sa.pts[2 * i], y = sa.pts[2 * i + 1];
      for (const [f, tol] of Object.entries(TOL)) {
        const va = sa[f][i], vb = sb[f][i];
        if (va === vb) continue;
        if (va === null || vb === null || Math.abs(va - vb) > tol) add(f, x, y, va, vb);
      }
    }
    for (let i = 0; i < sa.rays.length; i += 6) {
      const x = sa.rays[i], y = sa.rays[i + 1];
      for (const [o, f] of [[2, "ray-down"], [4, "ray-east"]]) {
        const da = sa.rays[i + o], db = sb.rays[i + o];
        if (sa.rays[i + o + 1] !== sb.rays[i + o + 1] || (da !== db && (da === null || db === null || Math.abs(da - db) > 0.05))) add(f, x, y, `${da} ${sa.rays[i + o + 1]}`, `${db} ${sb.rays[i + o + 1]}`);
      }
    }
  }
  console.log("differences (points): field  seam  edge  elsewhere");
  for (const [f, d] of Object.entries(diff)) console.log(`  ${f.padEnd(9)} ${String(d.seam).padStart(5)} ${String(d.edge).padStart(5)} ${String(d.elsewhere).padStart(9)}`);
  if (!Object.keys(diff).length) console.log("  none");
  console.log("counts: before / after");
  for (const k of new Set([...Object.keys(A.counts.counts), ...Object.keys(B.counts.counts)])) {
    const ca = A.counts.counts[k] ?? 0, cb = B.counts.counts[k] ?? 0, la = A.counts.lengths[k], lb = B.counts.lengths[k];
    console.log(`  ${k.padEnd(6)} ${ca} / ${cb}${ca === cb ? "" : "  *"}${la !== undefined || lb !== undefined ? `   length ${la} / ${lb} m${la === lb ? "" : "  *"}` : ""}`);
  }
  if (worst.length) {
    console.log(`first ${worst.length} differences away from seams and the edge (bugs):`);
    for (const w of worst.slice(0, 40)) console.log(`  ${w.field} at ${w.x},${w.y}: ${w.before} -> ${w.after}`);
  }
  const ready = [...A.squares, ...B.squares].filter((s) => !s.ready).length;
  if (ready) console.log(`warning: ${ready} squares weren't fully loaded when probed`);
}
