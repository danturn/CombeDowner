// How fair a race is: real routes from pubs round Bath, each set up as the game sets it up (a go
// of your own, race.ts), then ridden by a bot on the real ride handling (player.ts) along the
// route's line: once on the best line (pushing all the way, tucking downhill, braking for the
// corners) and once as a normal first go (a hesitant start, a slower hand on the steering, a
// crash every 700 m or so and one wrong turn). Each is held up against the medals, the gold-pace
// ghost and every checkpoint's time limit. Nothing is drawn and the bot runs faster than real time.
//
//   cd web && npx vite build --logLevel error && cd .. && node tools/race_probe.mjs [--routes 8] [--every 3 --from 1]
//
// (routes start from every 3rd pub, from the 1st: other numbers give other routes)
//
// The bot rides with the race's lift but no boost pads or slipstreams, and where the line runs
// through something it hops on a few metres and takes 3 s for it ("unstuck").
import { createRequire } from "module";
import fs from "fs";
import http from "http";
import path from "path";
import { MUTED_ARGS, silence, silenceNote } from "./quiet-guard.mjs";

const WEB = new URL("../web/", import.meta.url).pathname;
const { chromium } = (() => {
  if (process.env.PW) return createRequire(import.meta.url)(process.env.PW);
  try { return createRequire(WEB + "package.json")("playwright"); } catch { return createRequire(import.meta.url)("playwright"); }
})();
const argv = process.argv.slice(2), opt = { dist: WEB + "dist", routes: "8", skip: "0", every: "3", from: "1" };
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
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  await silence(page);
  page.on("pageerror", (e) => console.error("page:", e.message));
  await page.goto(`http://127.0.0.1:${port}/?map=combe-down&time=11:00&fx=0&view=300`);
  await page.waitForFunction(() => !document.getElementById("solo")?.disabled, null, { timeout: 180000 });
  await page.evaluate(() => document.getElementById("solo").click());
  await page.waitForFunction(() => window.__game && window.__game() && window.__game().quests, null, { timeout: 180000 });
  const rows = await page.evaluate(sim, [Number(opt.routes), Number(opt.skip), Number(opt.every), Number(opt.from)]);
  for (const r of rows) console.log(r);
  console.log(await silenceNote(page));
} finally {
  await browser.close();
  server.close();
}

/** In the page: set races up, ride them, and say how each rider fared. */
function sim([want, skip, every, from]) {
  const g = window.__game(), w = g.questWorld(), map = w.map, Player = g.player.constructor;
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const f = (t) => (t === undefined || !Number.isFinite(t) ? "-" : `${Math.floor(Math.round(t) / 60)}:${String(Math.round(t) % 60).padStart(2, "0")}`);
  const out = [];
  const starts = w.pubs().filter((p, k) => k % every === from);
  let found = 0;
  for (let k = 0; out.length < want && k < starts.length; k++) {
    const s = starts[k];
    const o = { kind: "race", seed: 5000 + k, stars: 1, title: "", blurb: "", reward: "", x: s.x, z: s.z, where: s.name };
    let race;
    try { g.quests.begin(o, Date.now(), w.selfId, undefined, true); race = g.quests.job; } catch { continue; }
    if (!race || !race.path || !race.rt) { g.quests.clear(); continue; }
    if (found++ < skip) { g.quests.clear(); continue; }
    const rt = race.rt, path = race.path, gates = race.gates, legs = race.legs.slice(), m = race.medal;
    const spec = g.player.ride, start = race.start;
    const par = race.ghosts.get("@par");
    g.quests.clear();
    if (!spec) continue;
    // the ghost: how far it's gone 3 s and 6 s after GO
    const ghostAt = (t) => { if (!par) return NaN; const i = Math.min(par.pts.length / 2 - 1, Math.round(t / par.b.e)); return Math.hypot(par.pts[i * 2] - start.x, par.pts[i * 2 + 1] - start.z); };
    const clean = ride(spec, path, gates, start, false), normal = ride(spec, path, gates, start, true);
    const verdict = (run) => {
      let dl = 0;
      for (let i = 0; i < run.at.length; i++) {
        dl += legs[i];
        if (run.at[i] > dl) return `OUT at checkpoint ${i + 1}/${gates.length} (${(run.at[i] - dl).toFixed(0)} s over)`;
      }
      return run.at.length < gates.length ? "never finished" : `in with ${(dl - run.at[run.at.length - 1]).toFixed(0)} s to spare`;
    };
    const medalOf = (t) => (t < rt.author ? "author" : t < m.gold ? "gold" : t < m.silver ? "silver" : t < m.bronze ? "bronze" : "none");
    const sum = legs.reduce((a, b) => a + b, 0), crow = Math.hypot(rt.to.x - s.x, rt.to.z - s.z);
    const ct = clean.at[gates.length - 1], nt = normal.at[gates.length - 1];
    out.push(`${rt.name} to ${rt.to.n} (${spec.kind}): ${Math.round(path.len)} m by the streets, ${Math.round(crow)} m as the crow flies, ${gates.length - 1} checkpoints\n`
      + `   author ${f(rt.author)}, gold ${f(m.gold)}, silver ${f(m.silver)}, bronze ${f(m.bronze)}; clock allows ${f(sum)} in all, ${legs[0].toFixed(0)} s to the first checkpoint\n`
      + `   gold ghost: ${(path.len / m.gold * 3.6).toFixed(0)} km/h on average, ${ghostAt(3).toFixed(0)} m off the grid at 3 s, ${ghostAt(6).toFixed(0)} m at 6 s; best-line bot ${clean.d3.toFixed(0)} m at 3 s, ${clean.d6.toFixed(0)} m at 6 s\n`
      + `   best line ${f(ct)} (${medalOf(ct)}, ${(path.len / ct * 3.6).toFixed(0)} km/h${clean.stucks ? `, ${clean.stucks} unstuck` : ""}): ${verdict(clean)}\n`
      + `   normal go ${f(nt)} (${medalOf(nt)}; ${normal.crashes} crashes, a wrong turn${normal.stucks ? `, ${normal.stucks} unstuck` : ""}): ${verdict(normal)}`);
  }
  return out;

  function ride(spec, path, gates, start, sloppy) {
    const p = new Player(map);
    p.paved = (x, z) => g.world.paved(x, z);
    p.spawn(start.x, start.z, start.yaw);
    p.mount(spec);
    p.rideMul = 1.3;
    const dt = 1 / 60, at = [];
    let t = 0, s = 0, next = 0, crashes = 0, stucks = 0, react = 0, side = 0, stuckT = 0, d3 = 0, d6 = 0;
    // where on the route the grid is
    let best = 1e9;
    for (let q = 0; q < Math.min(path.len, 80); q += 0.5) { const a = along(path, q), d = Math.hypot(a.x - start.x, a.z - start.z); if (d < best) { best = d; s = q; } }
    let lastS = s;
    const crashEvery = 700, wrongAt = path.len * (0.15 + rnd() * 0.3);
    let nextCrash = s + crashEvery * (0.5 + rnd()), wronged = false;
    while (t < 1500 && next < gates.length) {
      let near = 1e9, s1 = s;
      for (let q = s - 4; q < s + 30; q += 0.5) { const a = along(path, q), d = Math.hypot(a.x - p.pos.x, a.z - p.pos.z); if (d < near) { near = d; s1 = q; } }
      s = Math.max(s, s1);
      const v = Math.abs(p.rideV);
      const look = along(path, s + Math.max(5, v * 0.6));
      const wantH = Math.atan2(-(look.x - p.pos.x), -(look.z - p.pos.z));
      // the bend coming up: slow for it if it's tighter than the ride can turn at this speed
      const ahead = Math.max(12, v * 1.6), a0 = along(path, s), a1 = along(path, s + ahead);
      const bend = Math.abs(wrap(Math.atan2(-a1.dx, -a1.dz) - Math.atan2(-a0.dx, -a0.dz)));
      const vcap = bend > 0.05 ? spec.turn * Math.max(4, ahead / bend) * (sloppy ? 0.7 : 0.9) : 99;
      p.keys.clear();
      const hesitant = sloppy && t < 2.5;
      if (!hesitant) {
        if (v > vcap + 1.5) p.keys.add("KeyS");
        else if (v < vcap) p.keys.add("KeyW");
      }
      if (spec.pogo) p.yaw = wantH;
      else {
        if ((react -= dt) <= 0) { const e = wrap(wantH - p.heading); side = e > 0.04 ? -1 : e < -0.04 ? 1 : 0; react = sloppy ? 0.15 : 0.03; }
        if (side < 0) p.keys.add("KeyA"); else if (side > 0) p.keys.add("KeyD");
      }
      if (!sloppy && p.grade < -0.03 && (spec.verb === "tuck" || spec.verb === "lean") && v > 3 && !p.keys.has("KeyS")) { p.keys.delete("KeyW"); p.keys.add("Space"); }
      p.update(dt, true);
      if (sloppy && s > nextCrash && p.tumble <= 0) { p.knock(); crashes++; nextCrash = s + crashEvery * (0.6 + rnd() * 0.8); }
      if (sloppy && !wronged && s > wrongAt) { wronged = true; t += 12; p.rideV = 0; }   // down the wrong street and back
      t += dt;
      const dg = Math.hypot(p.pos.x - start.x, p.pos.z - start.z);
      if (t <= 3) d3 = dg;
      if (t <= 6) d6 = dg;
      const gt = gates[next];
      if (Math.hypot(gt.x - p.pos.x, gt.z - p.pos.z) < Math.max(12, gt.half + 6)) { at.push(t); next++; }
      if (s > lastS + 3) { lastS = s; stuckT = 0; }
      else if ((stuckT += dt) > 4) {
        const a = along(path, s + 8);
        p.pos.set(a.x, map.ground(a.x, a.z), a.z); p.heading = p.yaw = Math.atan2(-a.dx, -a.dz); p.rideV = 0;
        t += 3; stuckT = 0; stucks++; s += 8; lastS = s;
      }
    }
    return { at, crashes, stucks, d3, d6 };
  }

  function along(p, s) {
    s = Math.max(0, Math.min(p.len, s));
    const n = p.cum.length;
    let k = 0;
    if (s >= p.len) k = n - 2;
    else if (s > 0) { let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (p.cum[m] <= s) lo = m; else hi = m; } k = lo; }
    const ax = p.pts[k * 2], az = p.pts[k * 2 + 1], bx = p.pts[k * 2 + 2], bz = p.pts[k * 2 + 3];
    const l = Math.max(0.01, p.cum[k + 1] - p.cum[k]), dx = (bx - ax) / l, dz = (bz - az) / l, u = s - p.cum[k];
    return { x: ax + dx * u, z: az + dz * u, dx, dz, half: p.half[k + 1] };
  }
}
