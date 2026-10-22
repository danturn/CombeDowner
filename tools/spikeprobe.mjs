// What happens on the frames that stutter. Drives the same way as tools/fpsprobe.mjs --route and
// records, for every frame over --over ms (33 by default), what was going on in it:
//   - the game's own JavaScript for the frame (so a spike with almost no JavaScript is something
//     outside the game: the browser, the compositor, another tab);
//   - a shader program being compiled and linked for the first time (three.js does this the first
//     time a material is drawn with it, and the compile is the stall);
//   - a square being added to the scene (its scenery's meshes going up to the graphics card);
//   - a square's map being made, set up or built (the game's own __tileStats, tiles.ts);
//   - a rubbish collection (a PerformanceObserver "gc" entry, which Chrome reports as a count).
//
//   cd web && npx vite build && node ../tools/spikeprobe.mjs --out spikes [--over 33] [--speed 20]
//
// Writes <out>/spikes.json and prints each spike, then a tally of what they were. Only reads the
// game; nothing here goes over the network.
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
const argv = process.argv.slice(2), opt = { dist: WEB + "dist", out: "spikes", over: "33", speed: "20", size: "1280x720" };
for (let i = 0; i < argv.length; i++) { const a = argv[i]; if (a.startsWith("--")) opt[a.slice(2)] = argv[++i]; }
const [W, H] = opt.size.split("x").map(Number);
const OVER = +opt.over, SPEED = +opt.speed, DIST = opt.dist;
fs.mkdirSync(opt.out, { recursive: true });

// The same way from Combe Down into town and back as fpsprobe.mjs (keep the two in step)
const ROUTE = [[0, 0], [154, 400], [-961, 1782], [-1010, 2105], [-930, 2220]];

const TYPES = { ".js": "text/javascript", ".html": "text/html", ".css": "text/css", ".json": "application/json" };
const server = http.createServer((q, res) => {
  let f = path.join(DIST, decodeURIComponent(q.url.split("?")[0]));
  if (f.endsWith("/")) f += "index.html";
  fs.readFile(f, (e, b) => { if (e) { res.statusCode = 404; return res.end(); } res.setHeader("content-type", TYPES[path.extname(f)] || "application/octet-stream"); res.end(b); });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

const linux = process.platform === "linux";
const bundled = linux && fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : null;
const exe = process.env.CHROME || bundled;
const browser = await chromium.launch({
  headless: true,
  ...(exe ? { executablePath: exe } : { channel: "chrome" }),
  args: [...MUTED_ARGS, "--disable-gpu-vsync", "--disable-frame-rate-limit",
    ...(linux ? ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
      : process.platform === "darwin" ? ["--use-angle=metal", "--enable-gpu"] : [])],
});
const page = await browser.newPage({ viewport: { width: W, height: H } });
// no sound can play: see tools/quiet-guard.mjs (and run the whole thing under tools/quiet.mjs)
await silence(page);
await page.addInitScript(() => {
  window.__gc = [];
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__gc.push(+e.startTime.toFixed(1)); }).observe({ entryTypes: ["gc"] });
  } catch { /* not supported */ }
  // what blocked the main thread, as the browser sees it (a long task is over 50 ms)
  window.__long = [];
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push({ t: +e.startTime.toFixed(1), ms: +e.duration.toFixed(1), name: e.name, attribution: (e.attribution ?? []).map((a) => a.name || a.containerType || "?").join(",") }); }).observe({ entryTypes: ["longtask"] });
  } catch { /* not supported */ }
  window.__tileStats = {};
  // time the game's own JavaScript for each frame (its animation-frame callback)
  window.__jsl = [];
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((t) => { const s = performance.now(); cb(t); window.__jsl.push(performance.now() - s); });
});
const complaints = [];
page.on("pageerror", (e) => { complaints.push(`error: ${e.message}`); console.log("pageerror", e.message); });
page.on("console", (m) => { if (m.type() === "error") console.log("console", m.text().slice(0, 200)); });

// (the menu backdrop only sets __dbg once it knows where to look from: an ?at= in the address)
const q = new URLSearchParams({ map: "combe-down", time: "11:00", at: `${ROUTE[0][0]},${ROUTE[0][1]},0,0` });
await page.goto(`http://127.0.0.1:${port}/?${q}`);
await page.evaluate(() => { window.__budget = 40; try { localStorage.clear(); } catch {} });
await page.waitForFunction(() => window.__dbg !== undefined, null, { timeout: 180000 });
await page.waitForFunction(() => !document.getElementById("solo")?.disabled, null, { timeout: 180000 });
await page.evaluate(() => document.getElementById("solo").click());
await page.waitForFunction(() => window.__game && window.__game(), null, { timeout: 180000 });
await page.addStyleTag({ content: "#menu,#pause,.toast{display:none!important}" });

await page.evaluate((at) => { window.__at = at; }, `${ROUTE[0][0]},${ROUTE[0][1]},0,0`);
await page.evaluate(() => {
  const g = window.__game(), u = g.update.bind(g), m = g.map;
  g.update = (dt) => {
    const at = window.__route ? window.__route.at() : window.__at;
    const [e, n, b = 0, t = 0, h = 1.7] = at.split(",").map(Number), x = e, z = -n;
    g.player.pos.set(x, m.ground(x, z), z);
    u(dt);
    g.camera.position.set(x, m.ground(x, z) + h, z);
    g.camera.rotation.set(t * Math.PI / 180, -b * Math.PI / 180, 0, "YXZ");
    g.camera.updateMatrixWorld();
  };
});
await page.waitForFunction(() => window.__tilesPending === 0, null, { timeout: 120000, polling: "raf" }).catch(() => {});
await page.waitForTimeout(1200);

const out = { started: new Date().toISOString(), over: OVER, speed: SPEED, dist: DIST, route: [] };
for (const dir of ["out", "back"]) {
  const pts = dir === "out" ? ROUTE : [...ROUTE].reverse();
  await page.evaluate((p) => { window.__route = null; window.__at = `${p[0]},${p[1]},0,0`; window.__budget = 40; }, pts[0]);
  await page.waitForFunction(() => window.__tilesPending === 0, null, { timeout: 120000, polling: "raf" }).catch(() => {});
  await page.waitForTimeout(1000);

  const res = await page.evaluate(([pts, speed, OVER]) => new Promise((done) => {
    delete window.__budget;
    const segs = []; let L = 0;
    for (let i = 0; i < pts.length - 1; i++) { const [a, b] = [pts[i], pts[i + 1]], l = Math.hypot(b[0] - a[0], b[1] - a[1]); segs.push({ a, b, l, at: L }); L += l; }
    const R = window.__renderer, scene = window.__game().world.scene;
    const t0 = performance.now();
    window.__route = { at() {
      const s = Math.min(L, (performance.now() - t0) / 1000 * speed), g = segs.find((g) => s <= g.at + g.l) ?? segs[segs.length - 1], f = (s - g.at) / g.l;
      const e = g.a[0] + (g.b[0] - g.a[0]) * f, n = g.a[1] + (g.b[1] - g.a[1]) * f;
      return `${e},${n},${Math.atan2(g.b[0] - g.a[0], g.b[1] - g.a[1]) * 180 / Math.PI},0`;
    } };
    window.__tileStats = {};
    window.__gc = [];
    window.__jsl.length = 0;
    window.__tileTimes = { setup: 0, build: 0, worlds: 0 };
    window.__worldTimes = { veg: 0, grass: 0, lamps: 0, outskirts: 0 };
    window.__long.length = 0;
    // the game's own parts of a frame, so a spike can be blamed on one: the match update, the
    // scenery going up to the graphics card (the renderer's own render), and the shadow pass
    const S = window.__S ??= { upd: 0, render: 0, shadow: 0 };
    S.upd = S.render = S.shadow = 0;
    // (wrapped once: each leg resets S, and the wrappers must not stack up)
    if (!window.__wrapped) {
      window.__wrapped = true;
      const g = window.__game(), u = g.update.bind(g);
      g.update = (dt) => { const a = performance.now(); u(dt); S.upd += performance.now() - a; };
      let inShadow = false;
      const r = window.__renderer, smr = r.shadowMap.render.bind(r.shadowMap);
      r.shadowMap.render = (...a) => { const t = performance.now(); inShadow = true; smr(...a); inShadow = false; S.shadow += performance.now() - t; };
      const rr = r.render.bind(r);
      r.render = (...a) => { const t = performance.now(); rr(...a); if (!inShadow) S.render += performance.now() - t; };
    }
    // what is already in: programs, scene children, squares known
    // a program's cacheKey names the shader's parts (its defines and the material's kind), which
    // is what tells us which material caused the compile
    const shorten = (k) => {
      if (!k) return "unnamed";
      const parts = String(k).split(",").filter((s) => s && s !== "0" && s !== "false").slice(0, 4);
      return parts.join(" ") || String(k).slice(0, 40);
    };
    const seenProgs = new Set(R.info.programs ?? []);
    let sceneKids = scene.children.length, tileKeys = 0;
    const spikes = [], iv = [];
    let last = performance.now(), frame = 0;
    const f = () => {
      const now = performance.now(), frameStart = last, dt = now - last; last = now; frame++;
      // the game's JavaScript for the frame just gone (its rAF callback ran before this one)
      const jsl = window.__jsl.slice(); window.__jsl.length = 0;
      const js = jsl.reduce((a, b) => a + b, 0);
      const parts = { upd: +S.upd.toFixed(1), render: +S.render.toFixed(1), shadow: +S.shadow.toFixed(1) };
      S.upd = S.render = S.shadow = 0;
      const newProgs = [];
      for (const p of R.info.programs ?? []) if (!seenProgs.has(p)) { seenProgs.add(p); newProgs.push(p.name || shorten(p.cacheKey)); }
      const newKids = scene.children.length - sceneKids; sceneKids = scene.children.length;
      const tiles = window.__tileStats ?? {}, keys = Object.keys(tiles);
      const newTiles = keys.slice(tileKeys); tileKeys = keys.length;
      // a tree without the instrumented tiles.ts/world.ts simply has none of these: report zeroes
      const tt = window.__tileTimes;
      // read this frame's figures, then start them over, so a spike's numbers are its own frame's
      const grid = { setup: +(tt?.setup ?? 0).toFixed(1), build: +(tt?.build ?? 0).toFixed(1), worlds: +(tt?.worlds ?? 0).toFixed(1) };
      if (tt) tt.setup = tt.build = tt.worlds = 0;
      const wt = window.__worldTimes;
      const world = { veg: +(wt?.veg ?? 0).toFixed(1), grass: +(wt?.grass ?? 0).toFixed(1), lamps: +(wt?.lamps ?? 0).toFixed(1), outskirts: +(wt?.outskirts ?? 0).toFixed(1), skies: +(wt?.skies ?? 0).toFixed(1) };
      const gc = window.__gc.length; window.__gc = [];
      // long tasks the browser saw during this frame (over 50 ms), which the game's own timer misses
      const longs = window.__long.filter((l) => l.t >= frameStart && l.t < now);
      iv.push(dt);
      if (dt > OVER) spikes.push({
        frame, t: +(now - t0).toFixed(0), ms: +dt.toFixed(1), js: +js.toFixed(1),
        progs: newProgs, kids: newKids, tiles: newTiles, gc, parts, longs,
        grid,
        world,
      });
      if ((now - t0) / 1000 * speed < L) return requestAnimationFrame(f);
      const srt = [...iv].sort((a, b) => a - b);
      done({ metres: Math.round(L), frames: iv.length, worst: +srt[srt.length - 1].toFixed(1), over: iv.filter((x) => x > OVER).length, spikes });
    };
    requestAnimationFrame(f);
  }), [pts, SPEED, OVER]);

  await page.evaluate(() => { window.__route = null; });
  out.route.push({ dir, ...res });
  console.log(`route ${dir}: ${res.metres} m at ${SPEED} m/s, ${res.frames} frames, ${res.over} over ${OVER} ms, worst ${res.worst} ms`);
  for (const s of res.spikes) {
    const what = [
      s.progs.length ? `${s.progs.length} shader(s): ${s.progs.slice(0, 2).join(", ")}` : "",
      s.kids ? `${s.kids} scene object(s) added` : "",
      s.tiles.length ? `square(s) ${s.tiles.join(" ")}` : "",
      s.gc ? `gc x${s.gc}` : "",
    ].filter(Boolean).join(" | ") || "nothing the game did";
    const p = s.parts ?? {};
    const gr = s.grid ?? {};
    const grid = (gr.setup || gr.build || gr.worlds) ? ` | squares: setup ${gr.setup}, build ${gr.build}, worlds ${gr.worlds}` : "";
    const wo = s.world ?? {};
    const wpart = (wo.veg || wo.grass || wo.lamps || wo.outskirts || wo.skies) ? ` | world: trees ${wo.veg}, grass ${wo.grass}, lamps ${wo.lamps}, outskirts ${wo.outskirts}, sky/lamp-place ${wo.skies}` : "";
    const lg = (s.longs ?? []).length ? ` | long tasks: ${(s.longs ?? []).map((l) => `${l.ms} ms ${l.name}${l.attribution && l.attribution !== "?" ? " (" + l.attribution + ")" : ""}`).join(", ")}` : "";
    console.log(`   ${String(s.ms).padStart(7)} ms (js ${String(s.js).padStart(5)}: update ${p.upd ?? "?"}, shadow ${p.shadow ?? "?"}, draw ${p.render ?? "?"}) at ${String(s.t).padStart(6)} ms: ${what}${grid}${wpart}${lg}`);
  }
}

const all = out.route.flatMap((r) => r.spikes);
const tally = {
  total: all.length,
  shaders: all.filter((s) => s.progs.length).length,
  sceneObjects: all.filter((s) => s.kids).length,
  squareWork: all.filter((s) => s.tiles.length).length,
  gc: all.filter((s) => s.gc).length,
  nothingFromTheGame: all.filter((s) => !s.progs.length && !s.kids && !s.tiles.length && !s.gc).length,
  jsOver10: all.filter((s) => s.js > 10).length,
};
console.log(`\nspikes over ${OVER} ms: ${all.length} — shaders ${tally.shaders}, scene objects added ${tally.sceneObjects}, square work ${tally.squareWork}, gc ${tally.gc}, nothing the game did ${tally.nothingFromTheGame}, game js over 10 ms ${tally.jsOver10}`);
const byProg = {};
for (const s of all) for (const p of s.progs) byProg[p] = (byProg[p] ?? 0) + 1;
if (Object.keys(byProg).length) console.log("shader programs first seen on a spike (name: count):", JSON.stringify(byProg, null, 1));
out.tally = tally; out.byProg = byProg; out.complaints = [...new Set(complaints)];
out.audio = await silenceNote(page);
console.log(out.audio);
fs.writeFileSync(path.join(opt.out, "spikes.json"), JSON.stringify(out, null, 1));
await browser.close();
server.close();
