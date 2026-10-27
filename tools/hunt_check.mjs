// Do treasure trails hide their tins fairly? Trails set up from pubs all over Bath, each as the
// game sets one up (trail.ts, as a go of your own), and every leg walked to in turn: each tin (the
// true one of a plaque's, each of twin tins, and the buried chest) is checked against every search
// circle a local could draw for it, from afar and once it's placed, and for being somewhere you can
// get to. Nothing is drawn but the map round each tin, and the game is silent throughout.
//
//   cd web && npx vite build --logLevel error && cd .. && node tools/hunt_check.mjs [--trails 30] [--from 0]
//
// Per tin it asserts:
//   - every circle holds it, at least 12 m in from the edge (circle radius minus distance from its middle);
//   - the circle drawn from afar, before the tin's placed, holds where it then turns out to be;
//   - it's placed the same way twice over (worked out afresh, nothing kept);
//   - it's not indoors (a building or a roof), not in the water, not in a wall, and can be walked to
//     from a street or path (a search of the ground round it, a metre at a time).
// Prints one line per trail, then the totals; exits 1 if anything failed.
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
const argv = process.argv.slice(2), opt = { dist: WEB + "dist", trails: "30", from: "0" };
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) opt[argv[i].slice(2)] = argv[++i];

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
const browser = await chromium.launch({ channel: "chrome", headless: true, args: [...MUTED_ARGS] });
let failed = false;
try {
  const context = await browser.newContext({ viewport: { width: 640, height: 360 } });
  await silenceContext(context);
  const page = await context.newPage();
  await silence(page);
  page.on("pageerror", (e) => console.error("page:", e.message));
  await page.goto(`http://127.0.0.1:${port}/?map=combe-down&time=11:00&fx=0&view=300`);
  // the menu's buttons are there before the game's code is: wait for that too, or the click goes nowhere
  await page.waitForFunction(() => window.__game && !document.getElementById("solo")?.disabled, null, { timeout: 180000 });
  await page.evaluate(() => document.getElementById("solo").click());
  await page.waitForFunction(() => window.__game && window.__game() && window.__game().quests, null, { timeout: 180000 });
  const n = Number(opt.trails), from = Number(opt.from), total = { tins: 0, circles: 0, bad: [], kinds: {}, margin: Infinity, far: 0, plaque: [], oldPlaque: 0, oldMissed: 0, slowest: 0 };
  for (let i = from; i < from + n; i++) {
    const r = await page.evaluate(check, i);
    if (!r) { console.log(`trail ${i}: no trail from that pub`); continue; }
    console.log(`trail ${i} from ${r.where} (${r.stars} star${r.stars > 1 ? "s" : ""}, ${r.legs} legs: ${r.steps.join(", ")}): ${r.tins} tins, ${r.circles} circles, tightest ${r.margin.toFixed(1)} m in${r.bad.length ? `\n   FAIL ${r.bad.join("\n   FAIL ")}` : ""}`);
    total.tins += r.tins; total.circles += r.circles; total.bad.push(...r.bad); total.far += r.far; total.plaque.push(...r.plaque); total.oldPlaque += r.oldPlaque; total.oldMissed += r.oldMissed; total.slowest = Math.max(total.slowest, r.slowest);
    total.margin = Math.min(total.margin, r.margin);
    for (const [k, v] of Object.entries(r.kinds)) total.kinds[k] = (total.kinds[k] ?? 0) + v;
  }
  console.log(`\n${total.tins} tins (${Object.entries(total.kinds).map(([k, v]) => `${v} ${k}`).join(", ")}), ${total.circles} circles checked (${total.far} drawn from afar)`);
  console.log(`tightest: a tin ${total.margin.toFixed(1)} m in from its circle's edge; the slowest tin took ${total.slowest.toFixed(0)} ms to place`);
  if (total.plaque.length) console.log(`plaque legs: the true tin stood ${Math.min(...total.plaque).toFixed(0)} to ${Math.max(...total.plaque).toFixed(0)} m from its plaque; drawn round the plaque as before, ${total.oldMissed} of ${total.oldPlaque} of their circles would have missed it`);
  console.log(total.bad.length ? `${total.bad.length} FAILED` : "all passed");
  failed = total.bad.length > 0;
  console.log(await silenceNote(page));
} finally {
  await browser.close();
  server.close();
}
process.exit(failed ? 1 : 0);

/** In the page: set trail i up from a pub, walk to each leg, and check its tins and circles. */
async function check(i) {
  const g = window.__game(), w = g.questWorld(), map = w.map, MARGIN = 12;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // pubs across the whole of Bath, a different one each time
  const pubs = w.pubs().slice().sort((a, b) => a.x - b.x || a.z - b.z);
  const pub = pubs[(i * 53) % pubs.length];
  const o = { kind: "trail", seed: 70000 + i * 7919, stars: 1 + (i % 3), title: "", blurb: "", reward: "", x: pub.x, z: pub.z, where: pub.name,
    mode: (i % 4) * 2 + (i % 5 === 4 ? 1 : 0), legs: i % 4 === 0 ? 3 : undefined };
  g.player.spawn(pub.x, pub.z, 0);
  g.quests.begin(o, Date.now(), w.selfId, undefined, true);
  const job = g.quests.job;
  if (!job?.t?.legs?.length) { g.quests.clear(); return null; }
  const legs = job.t.legs, out = { where: pub.name, stars: o.stars, legs: legs.length, steps: legs.map((l, k) => (k === legs.length - 1 ? "chest" : l.twin ? "twin" : l.step)),
    tins: 0, circles: 0, far: 0, margin: Infinity, bad: [], kinds: {}, plaque: [], oldPlaque: 0, oldMissed: 0, slowest: 0 };
  const wet = (x, z) => {
    for (const m of [map, ...map.tilesNear(x, z, 10)]) for (const wp of [...(m === map ? map.wide?.wp ?? [] : []), ...(m.d.wp ?? [])]) {
      const ring = wp.r[0];
      if (!ring) continue;
      let inside = false;
      for (let a = 0, b = ring.length - 1; a < ring.length; b = a++) {
        const [xi, yi] = ring[a], [xj, yj] = ring[b];
        if (yi > -z !== yj > -z && x < ((xj - xi) * (-z - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) return true;
    }
    return false;
  };
  const passable = (x, z) => !map.indoors(x, z) && !wet(x, z) && !map.blocked(x, z, 0.25);
  // within 2 m of the line of any street or path loaded round here
  const onWay = (x, z) => {
    for (const m of [map, ...map.tilesNear(x, z, 5)]) for (const rd of m.d.rd) {
      const p = rd.p;
      for (let k = 1; k < p.length; k++) {
        const ax = p[k - 1][0], ay = -p[k - 1][1], bx = p[k][0], by = -p[k][1];
        if (Math.min(ax, bx) > x + 3 || Math.max(ax, bx) < x - 3 || Math.min(ay, by) > z + 3 || Math.max(ay, by) < z - 3) continue;
        const ex = bx - ax, ey = by - ay, l2 = ex * ex + ey * ey || 1, t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - ay) * ey) / l2));
        if (Math.hypot(ax + ex * t - x, ay + ey * t - z) < 2) return true;
      }
    }
    return false;
  };
  // walk out from the tin half a metre at a time (a gate's about a metre wide), round anything in the
  // way, till a street or path
  const reachable = (x, z) => {
    const R = 80, S = 0.5, seen = new Set(["0,0"]), q = [[0, 0]];
    while (q.length) {
      const [i0, j0] = q.shift();
      const px = x + i0 * S, pz = z + j0 * S;
      if (onWay(px, pz)) return true;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i0 + di, b = j0 + dj, k = `${a},${b}`;
        if (seen.has(k) || Math.hypot(a, b) * S > R) continue;
        seen.add(k);
        if (passable(x + a * S, z + b * S)) q.push([a, b]);
      }
    }
    return false;
  };
  for (let n = 0; n < legs.length; n++) {
    const leg = legs[n], last = n === legs.length - 1, kind = last ? "chest" : leg.twin ? "twin" : leg.step;
    const halves = leg.twin && !last ? [0, 1] : [0];
    if (leg.twin) job.twins.add(n);
    for (const h of halves) {
      const name = `leg ${n + 1}${halves.length > 1 ? (h ? "B" : "A") : ""} (${kind})`;
      // the first circle, from afar, if this part of Bath isn't loaded yet
      const farRing = job.targetOf(n, h) ? null : job.ringOf(n, h, 0);
      const aim = job.aim(n, h);
      g.player.spawn(aim.x, aim.z, 0);
      let at = null;
      for (let t = 0; t < 600 && !(at = job.targetOf(n, h)); t++) await sleep(200);
      if (!at) { out.bad.push(`${name}: never placed`); continue; }
      out.tins++; out.kinds[kind] = (out.kinds[kind] ?? 0) + 1;
      const inside = (ring, what) => {
        const m = ring.r - Math.hypot(ring.x - at.x, ring.z - at.z);
        out.circles++;
        out.margin = Math.min(out.margin, m);
        if (m < MARGIN) out.bad.push(`${name}: ${what} (${Math.round(ring.r)} m) holds the tin only ${m.toFixed(1)} m in`);
      };
      if (farRing) { out.far++; inside(farRing, "the circle drawn from afar"); }
      for (let k = 0; k <= job.maxRing(n); k++) inside(job.ringOf(n, h, k), `hint ${k + 1}'s circle`);
      if (leg.step === "word" && !last) {
        // the circles as they used to be drawn, round the plaque rather than its true tin (the same
        // seeded offset, so the same circle moved): how many would have missed it
        const p = job.spotOf(n, 0);
        out.plaque.push(Math.hypot(p.x - at.x, p.z - at.z));
        for (let k = 0; k <= job.maxRing(n); k++) {
          const ring = job.ringOf(n, h, k), cx = p.x + ring.x - at.x, cz = p.z + ring.z - at.z;
          out.oldPlaque++;
          if (Math.hypot(cx - at.x, cz - at.z) > ring.r) out.oldMissed++;
        }
      }
      // placed alike when worked out afresh
      for (const m of [job.spots, job.decoys, job.wordSpots, job.houses, job.paces]) m.clear();
      const t0 = performance.now(), again = job.targetOf(n, h);
      out.slowest = Math.max(out.slowest, performance.now() - t0);
      if (!again || Math.hypot(again.x - at.x, again.z - at.z) > 0.01) out.bad.push(`${name}: placed somewhere else the second time`);
      if (map.indoors(at.x, at.z)) out.bad.push(`${name}: indoors or on a roof`);
      if (wet(at.x, at.z)) out.bad.push(`${name}: in the water`);
      if (map.blocked(at.x, at.z, 0.3)) out.bad.push(`${name}: in a wall or a tree`);
      if (!reachable(at.x, at.z)) out.bad.push(`${name}: can't be walked to from a street or path (?at=${at.x.toFixed(1)},${(-at.z).toFixed(1)},0,-60,12)`);
    }
  }
  g.quests.clear();
  return out;
}
