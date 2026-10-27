// A check on speed limits in the real game (web/src/limits.ts, drivingtest.ts): a built game
// (web/dist) in a muted headless Chrome, solo. It takes the Driving Test, sits in the learner car and
// drives it round the examiner's route by hand (placing it along the route each frame at a set
// speed, signalling and looking round at the turns, easing off at junctions), going over the limit on
// purpose on one 20 mph stretch (28 mph) and on one 30 mph-or-faster stretch (35 mph), and just
// under it everywhere else. The examiner's speed faults must name the street's own limit and come
// exactly where it says they should. It also reads the roundel by the speedo against the route's
// limits, and shoots it on the A4 London Road.
//
//   cd web && npx vite build --logLevel error && cd .. && node tools/limit_probe.mjs [--out limits]
//
// Bumps and kerbs the hand-placed car can't help are left out of the marking (they aren't what this
// checks). Writes <out>/report.txt and <out>/*.png; exits 1 if a check fails.
import { createRequire } from "module";
import fs from "fs";
import http from "http";
import path from "path";
import { MUTED_ARGS, silenceContext, silenceReport } from "./quiet-guard.mjs";

const WEB = new URL("../web/", import.meta.url).pathname;
const { chromium } = (() => {
  if (process.env.PW) return createRequire(import.meta.url)(process.env.PW);
  try { return createRequire(WEB + "package.json")("playwright"); } catch { return createRequire(import.meta.url)("playwright"); }
})();
const argv = process.argv.slice(2), opt = { dist: WEB + "dist", out: "limits", seeds: "12" };
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) opt[argv[i].slice(2)] = argv[++i];
fs.mkdirSync(opt.out, { recursive: true });

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

const report = [], checks = [];
const log = (s) => { report.push(s); console.log(s); };
const check = (name, ok, detail = "") => { checks.push(!!ok); log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ": " + detail : ""}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ channel: "chrome", headless: true, args: [...MUTED_ARGS] });
const context = await browser.newContext({ viewport: { width: 960, height: 540 } });
await silenceContext(context);
const page = await context.newPage();
page.on("pageerror", (e) => log(`page error: ${e.message}`));
try {
  await page.goto(`http://127.0.0.1:${port}/?map=combe-down&objects=1&time=11:00&fx=0&zone=9&view=400`);
  await page.waitForFunction(() => !document.getElementById("solo")?.disabled, null, { timeout: 180000 });
  await page.evaluate(() => document.getElementById("solo").click());
  await page.waitForFunction(() => window.__game && window.__game() && window.__game().map?.wide, null, { timeout: 180000 });
  await page.addStyleTag({ content: "#menu,#pause,#debug,#micask,#scoreboard{display:none!important}" });
  await page.evaluate(installDriver);

  // ---- what the wide map says about the A4 and the rest ----
  const survey = await page.evaluate(() => {
    const rd = window.__game().map.wide.rd, by = {};
    for (const r of rd) {
      if (!["primary", "secondary", "tertiary", "residential", "unclassified"].includes(r.c)) continue;
      const k = `${r.c} ${r.ms ?? "-"}`;
      by[k] = (by[k] ?? 0) + 1;
    }
    const a4 = rd.filter((r) => r.n === "London Road").map((r) => r.ms ?? 0);
    return { by, a4: [...new Set(a4)], a4n: a4.length, withMs: rd.filter((r) => r.ms).length, all: rd.length };
  });
  log(`wide map: ${survey.withMs} of ${survey.all} road pieces carry a limit; by class and limit: ${JSON.stringify(survey.by)}`);
  check("the wide map's roads carry their limits", survey.withMs > 1000);
  check("the A4 London Road carries OpenStreetMap's 20 mph", survey.a4.length === 1 && survey.a4[0] === 20, `${survey.a4n} pieces, limits ${survey.a4}`);

  // ---- the test: find a day whose first route has both kinds of stretch ----
  let plan = null;
  for (let seed = 1; seed <= Number(opt.seeds) && !plan; seed++) {
    plan = await page.evaluate(async (seed) => window.__takeTest(seed), seed);
    if (plan?.error) { log(`seed ${seed}: ${plan.error}`); plan = null; }
    else if (plan && (!plan.a || !plan.b)) { log(`seed ${seed}: no use (${JSON.stringify(plan)})`); plan = null; }
  }
  check("a test route with a 20 mph stretch and a faster one", !!plan, plan ? JSON.stringify(plan) : "");
  if (!plan) throw new Error("no route");

  // the roundel on the A4 London Road, before the test starts
  const shotAt = await page.evaluate(() => window.__parkOn("London Road"));
  await wait(1500);
  const shown = await page.evaluate(() => document.getElementById("limit").hidden ? "" : document.getElementById("limit").textContent);
  check("the roundel on the A4 London Road says 20", shown === "20", `shows "${shown}" at ${JSON.stringify(shotAt)}`);
  await page.screenshot({ path: `${opt.out}/roundel-london-road.png` });
  const box = await page.evaluate(() => { const r = document.getElementById("drive").getBoundingClientRect(); return { x: r.x - 10, y: r.y - 10, width: r.width + 20, height: r.height + 20 }; });
  await page.screenshot({ path: `${opt.out}/roundel-close.png`, clip: box });
  await page.evaluate(() => window.__backToCentre());
  await page.waitForFunction(() => window.__drivingTest.phase() === 2, null, { timeout: 60000 });

  // ---- drive it ----
  await page.evaluate((plan) => window.__startDrive(plan), plan);
  await page.waitForFunction(() => window.__drv.done, null, { timeout: 600000, polling: 500 });
  const res = await page.evaluate(() => window.__drv.result());
  for (const f of res.faults) log(`fault at ${f.s.toFixed(0)} m (${f.stage}, ${f.mph.toFixed(1)} mph, street limit ${f.lim}): ${f.x}`);
  const speed = res.faults.filter((f) => f.x.startsWith("Speed"));
  const named = (f) => Number(/in a (\d+)/.exec(f.x)?.[1]);
  check("every speed fault names the street's own limit", speed.every((f) => named(f) === f.lim), speed.map((f) => `${named(f)} vs ${f.lim}`).join(", "));
  const in20 = speed.filter((f) => f.stage === "a");
  check("28 mph on a 20 stretch is a speed fault", in20.length === 1 && named(in20[0]) === 20, in20.map((f) => f.x).join("; "));
  const fast = speed.filter((f) => f.stage === "b");
  const want = plan.b.lim + 3 < 35;
  check(`35 mph on a ${plan.b.lim} stretch is ${want ? "" : "not "}a speed fault`, want ? fast.length === 1 : fast.length === 0, fast.map((f) => f.x).join("; ") || "none");
  const under = speed.filter((f) => f.stage === "under");
  check("just under the limit everywhere else: no speed faults", under.length === 0, under.map((f) => f.x).join("; ") || "none");
  check("the roundel agrees with the route's limit", res.hud.agree / Math.max(1, res.hud.n) > 0.9, `${res.hud.agree} of ${res.hud.n} samples; differing: ${JSON.stringify(res.hud.diff.slice(0, 6))}`);
  log(`drove ${res.s.toFixed(0)} m of ${res.len.toFixed(0)} m; test phase at the end ${res.phase}`);
  log(await silenceReport(page));
} catch (e) {
  log(`stopped: ${e.message}`);
  checks.push(false);
} finally {
  fs.writeFileSync(`${opt.out}/report.txt`, report.join("\n") + "\n");
  await browser.close();
  server.close();
}
process.exit(checks.every(Boolean) ? 0 : 1);

/** In the page: the hooks the probe drives the test with. */
function installDriver() {
  const g = window.__game(), u = g.update.bind(g), MPH = 2.237;
  const posAt = (rt, s) => {
    const P = rt.pts;
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1];
      if (b.s >= s && b.s > a.s) { const t = (s - a.s) / (b.s - a.s); return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, fx: (b.x - a.x) / (b.s - a.s), fz: (b.z - a.z) / (b.s - a.s), pt: a }; }
    }
    return null;
  };
  const put = (car, x, z, fx, fz, v) => { car.x = x; car.z = z; car.a = Math.atan2(-fz, fx); car.vx = fx * v; car.vz = fz * v; car.moved = true; };
  g.update = (dt) => {
    g.active = true;
    const D = window.__drv;
    if (D && !D.done) D.step(dt, true);
    u(dt);
    if (D && !D.done) D.step(dt, false);
  };
  const sit = () => {
    const T = window.__drivingTest, car = T.car;
    g.player.pos.set(car.x + Math.cos(car.a + Math.PI / 2) * 2.2, g.player.pos.y, car.z - Math.sin(car.a + Math.PI / 2) * 2.2);
    g.useVehicle();
  };
  window.__takeTest = async (seed) => {
    g.quests.clear?.();
    g.quests.take({ kind: "drivingtest", seed: 7000 + seed, stars: 2, title: "The Driving Test", blurb: "", reward: "", x: 0, z: 0, where: "" });
    const T = window.__drivingTest;
    if (!T) return { error: "the test didn't start" };
    const job = g.quests.job, ev = job.event.bind(job);
    window.__faults = [];
    // bumps and kerbs: a hand-placed car can't help them, and they aren't what this checks
    job.event = (d, from) => {
      if (d.k === "bump" || d.k === "kerb") return;
      if (d.k === "f") window.__faults.push({ x: d.x, g: d.g, t: performance.now() });
      return ev(d, from);
    };
    for (let k = 0; k < 40 && T.car.seats[0] !== g.net.selfId; k++) { sit(); await new Promise((r) => setTimeout(r, 250)); }
    if (T.car.seats[0] !== g.net.selfId) return { error: "couldn't get in the driver's seat" };
    window.__centre = { x: T.car.x, z: T.car.z, a: T.car.a };
    for (let k = 0; k < 40 && T.phase() < 1; k++) await new Promise((r) => setTimeout(r, 250));
    if (T.phase() < 1) return { error: "the test didn't begin" };
    const rt = T.route();
    // stretches of one limit, long enough to be over it for a few seconds
    const runs = [];
    for (let i = 0; i < rt.pts.length - 1; i++) {
      const p = rt.pts[i], last = runs[runs.length - 1];
      if (last && last.lim === p.ms) last.e = rt.pts[i + 1].s; else runs.push({ lim: p.ms, s: p.s, e: rt.pts[i + 1].s, n: p.n });
    }
    const gives = rt.steps.map((st) => st.s);
    const clear = (r, a, b) => !gives.some((s) => s > a - 20 && s < b + 20) && b < r.e;
    const pick = (ok, len, after) => {
      for (const r of runs) {
        if (!ok(r.lim)) continue;
        for (let a = Math.max(r.s + 15, after); a + len < r.e - 10; a += 10) if (clear(r, a, a + len)) return { lim: r.lim, s0: a, s1: a + len, n: r.n };
      }
      return null;
    };
    const a = pick((l) => l === 20, 75, 60);
    const b = pick((l) => l >= 30, 95, a ? a.s1 + 220 : 60) ?? pick((l) => l >= 30, 95, 60);
    return { seed, len: rt.len, runs: runs.map((r) => `${r.lim}:${Math.round(r.e - r.s)}`).join(" "), a, b };
  };
  window.__parkOn = (name) => {
    const T = window.__drivingTest, rd = g.map.wide.rd.filter((r) => r.n === name && r.p.length > 1);
    const r = rd[Math.floor(rd.length / 2)], p = r.p[0], q = r.p[1], L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
    put(T.car, p[0], -p[1], (q[0] - p[0]) / L, -(q[1] - p[1]) / L, 0);
    return { x: p[0], y: p[1], ms: r.ms };
  };
  window.__backToCentre = () => { const T = window.__drivingTest, c = window.__centre; T.car.place(c.x, c.z, c.a); };
  window.__startDrive = (plan) => {
    const T = window.__drivingTest, car = T.car, rt = T.route(), job = g.quests.job;
    const seed = job.offer.seed;
    let s = 0, mir = 0, stage = "under", t = 0;
    const hud = { n: 0, agree: 0, diff: [] };
    const faultsAt = [];
    const D = window.__drv = {
      done: false,
      step(dt, before) {
        if (T.phase() !== 2 && t > 1) { D.done = true; return; }
        const here = posAt(rt, s);
        if (!here || s > rt.len - 150) { D.done = true; return; }
        if (!before) {
          t += dt;
          if ((mir -= dt) <= 0) { mir = 1.5; job.event({ k: "mir", s: seed }, g.net.selfId); }
          // how fast: over on purpose on the two stretches, just under everywhere else, and slow at junctions
          stage = plan.a && s >= plan.a.s0 && s < plan.a.s1 ? "a" : plan.b && s >= plan.b.s0 && s < plan.b.s1 ? "b" : "under";
          let mph = stage === "a" ? 28 : stage === "b" ? 35 : Math.max(8, (here.pt.ms || 20) - 4);
          const near = rt.steps.find((st) => s > st.s - 18 && s < st.s + 3);
          if (near && stage === "under") mph = 3.5;
          car.signal = rt.steps.find((st) => st.dir && s > st.s - 34 && s < st.s + 3)?.dir ?? 0;
          s += (mph / MPH) * dt;
          D.v = mph / MPH;
          const el = document.getElementById("limit"), shown = el.hidden ? 0 : Number(el.textContent);
          if (t > 2 && Math.floor(t * 4) !== Math.floor((t - dt) * 4)) {
            hud.n++;
            if (shown === here.pt.ms) hud.agree++; else hud.diff.push({ s: Math.round(s), shown, route: here.pt.ms, n: here.pt.n });
          }
          for (const f of window.__faults.splice(0)) faultsAt.push({ ...f, s, stage, mph, lim: here.pt.ms });
        }
        const at = posAt(rt, s);
        if (at) put(car, at.x, at.z, at.fx, at.fz, D.v ?? 0);
      },
      result: () => ({ faults: faultsAt, hud, s, len: rt.len, phase: T.phase() }),
    };
  };
}
