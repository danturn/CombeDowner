// Checks that a square's file is really read off the main thread, and that squares still load.
//
// Loads the game, waits for the squares round the start to arrive, and reports:
//   - whether a worker was made (the game's own counter, __parseWorkers)
//   - every square that failed to load, by name
//   - the number of meshes in the scene, so a square that parsed to nothing shows up as a shortfall
//   - the longest main-thread block while a square is fetched, against the same figure with the
//     worker switched off (__parseOnMain), which is what it costs the old way
//
//   cd web && npx vite build && node ../tools/parsetest.mjs --out parses [--at "154,400,180,-3"]
//
// Sound is off: this imports tools/quiet-guard.mjs, as every tool that opens the game in Chrome does.
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
const argv = process.argv.slice(2), opt = { dist: WEB + "dist", out: "parses", at: "154,400,180,-3", size: "1024x640" };
for (let i = 0; i < argv.length; i++) { const a = argv[i]; if (a.startsWith("--")) opt[a.slice(2)] = argv[++i]; }
const [W, H] = opt.size.split("x").map(Number);
fs.mkdirSync(opt.out, { recursive: true });

const TYPES = { ".js": "text/javascript", ".html": "text/html", ".css": "text/css", ".json": "application/json" };
const server = http.createServer((q, res) => {
  let f = path.join(opt.dist, decodeURIComponent(q.url.split("?")[0]));
  if (f.endsWith("/")) f += "index.html";
  fs.readFile(f, (e, b) => { if (e) { res.statusCode = 404; return res.end(); } res.setHeader("content-type", TYPES[path.extname(f)] || "application/octet-stream"); res.end(b); });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

const linux = process.platform === "linux";
const bundled = linux && fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : null;
const exe = process.env.CHROME || bundled;

/** One run: load the game at a spot, stand still while the squares around it arrive, and report. */
async function run(label, onMain) {
  const browser = await chromium.launch({
    headless: true,
    ...(exe ? { executablePath: exe } : { channel: "chrome" }),
    args: [...MUTED_ARGS, "--disable-gpu-vsync",
      ...(linux ? ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
        : process.platform === "darwin" ? ["--use-angle=metal", "--enable-gpu"] : [])],
  });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await silence(page);
  await page.addInitScript((main) => {
    window.__budget = 40; window.__parseOnMain = main; window.__tileStats = {};
    window.__longs = [];
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__longs.push(+e.duration.toFixed(1)); }).observe({ entryTypes: ["longtask"] }); } catch {}
  }, onMain);
  const errors = [], warns = [];
  page.on("pageerror", (e) => errors.push(String(e.message)));
  page.on("console", (m) => { if (m.type() === "warning" || m.type() === "error") warns.push(m.text()); });

  await page.goto(`http://127.0.0.1:${port}/?map=combe-down&net=local&time=11:00&at=${opt.at}`);
  await page.waitForFunction(() => !document.getElementById("solo")?.disabled, null, { timeout: 180000 });
  await page.evaluate(() => document.getElementById("solo").click());
  await page.waitForFunction(() => window.__game && window.__game(), null, { timeout: 180000 });
  await page.evaluate(() => {
    globalThis.__ft = []; let last = performance.now();
    const f = () => { const n = performance.now(); globalThis.__ft.push(n - last); last = n; requestAnimationFrame(f); };
    requestAnimationFrame(f);
  });
  // stand at the spot; the squares round it load in around us
  await page.evaluate((at) => {
    const g = window.__game(), u = g.update.bind(g), m = g.map, [e, n, b, t, h = 1.7] = at.split(",").map(Number);
    g.update = (dt) => { g.player.pos.set(e, m.ground(e, -n), -n); u(dt);
      g.camera.position.set(e, m.ground(e, -n) + h, -n); g.camera.rotation.set(t * Math.PI / 180, -b * Math.PI / 180, 0, "YXZ"); g.camera.updateMatrixWorld(); };
  }, opt.at);
  await page.waitForFunction(() => window.__tilesPending === 0, null, { timeout: 180000, polling: "raf" }).catch(() => {});
  await page.waitForTimeout(8000);
  const r = await page.evaluate(() => {
    const g = window.__game(), scene = g.world.scene;
    let meshes = 0; scene.traverse((o) => { if (o.isMesh) meshes++; });
    const ft = (globalThis.__ft ?? []).slice(1).sort((a, b) => a - b);
    const q = (p) => ft.length ? +ft[Math.min(ft.length - 1, Math.floor(ft.length * p))].toFixed(1) : 0;
    const longs = (globalThis.__longs ?? []).slice().sort((a, b) => b - a);
    return { longs: longs.slice(0, 6), longTotal: +longs.reduce((a, b) => a + b, 0).toFixed(1), made: [], workers: globalThis.__parseWorkers ?? null, onMain: !!globalThis.__parseOnMain, meshes, tiles: g.map.tiles?.size ?? 0,
      worst: q(1), p99: q(0.99), over30: ft.filter((x) => x > 30).length, frames: ft.length };
  });
  await browser.close();
  const failed = warns.filter((w) => /couldn't load square/.test(w));
  return { label, ...r, failed: failed.slice(0, 5), failedCount: failed.length, errors: errors.filter((e) => !/non-finite|setTargetAtTime/.test(e)).slice(0, 3), audio: await Promise.resolve("(worker run)") };
}

console.log(`at ${opt.at}`);
const worker = await run("worker", false);
const main = await run("main thread", true);
for (const r of [worker, main]) {
  console.log(`\n${r.label}: ${r.tiles} square(s), ${r.meshes} meshes, workers made: ${r.workers ?? "n/a"}, forced to main thread: ${r.onMain}`);
  console.log(`  squares that failed to load: ${r.failedCount}${r.failed.length ? " — " + r.failed.join("; ") : ""}`);
  console.log(`  frames ${r.frames}, over 30 ms ${r.over30}, p99 ${r.p99} ms, worst ${r.worst} ms`);
  console.log(`  main-thread long tasks (over 50 ms): total ${r.longTotal} ms, biggest ${(r.longs ?? []).slice(0, 4).join(", ")}`);
  if (r.errors.length) console.log(`  page errors: ${r.errors.join("; ")}`);
}
const out = { at: opt.at, worker, main };
fs.writeFileSync(path.join(opt.out, "parsetest.json"), JSON.stringify(out, null, 1));
console.log("\nboth read the same squares if the mesh counts and square counts match.");
process.exit(worker.failedCount === 0 && worker.meshes > 0 ? 0 : 1);
