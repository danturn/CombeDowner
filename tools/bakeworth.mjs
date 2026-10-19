// Is baking squares at build time (the plan's step 5) worth doing?
//
// The game already times each square three ways (tiles.ts's stat()): "made" (the file's turn —
// fetch, parse, masking, the GameMap), "setup" (collision: walls, streets, buildings solid) and
// "build" (the scenery: terrain, roads, roofs, walls, trees). Baking at build time could only
// remove the BUILD half — the geometry — because setup and the file still have to happen in the
// browser. So this crosses the map, waits for every square it meets, and adds up how the time
// splits. If build is the bulk, step 5 is worth its cost; if setup is, it is not.
//
//   cd web && npx vite build && node ../tools/bakeworth.mjs --out bake [--secs 200]
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
const argv = process.argv.slice(2), opt = { dist: WEB + "dist", out: "bake", secs: "200", speed: "30", size: "1024x640" };
for (let i = 0; i < argv.length; i++) { const a = argv[i]; if (a.startsWith("--")) opt[a.slice(2)] = argv[++i]; }
const [W, H] = opt.size.split("x").map(Number);
fs.mkdirSync(opt.out, { recursive: true });

// A long way about, so many squares load: the village, out to Prior Park, into town, and back.
const ROUTE = [[0, 0], [154, 400], [-400, 900], [-961, 1782], [-1010, 2105], [-930, 2220], [-400, 900], [0, 0]];

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
const browser = await chromium.launch({
  headless: true,
  ...(exe ? { executablePath: exe } : { channel: "chrome" }),
  args: [...MUTED_ARGS, "--disable-gpu-vsync",
    ...(linux ? ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
      : process.platform === "darwin" ? ["--use-angle=metal", "--enable-gpu"] : [])],
});
const page = await browser.newPage({ viewport: { width: W, height: H } });
await silence(page);
await page.addInitScript(() => { window.__tileStats = {}; window.__budget = 40; });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e.message)));

await page.goto(`http://127.0.0.1:${port}/?map=combe-down&net=local&time=11:00&at=${ROUTE[0][0]},${ROUTE[0][1]},0,0`);
await page.waitForFunction(() => !document.getElementById("solo")?.disabled, null, { timeout: 180000 });
await page.evaluate(() => document.getElementById("solo").click());
await page.waitForFunction(() => window.__game && window.__game(), null, { timeout: 180000 });
await page.addStyleTag({ content: "#menu,#pause,.toast{display:none!important}" });

const speed = +opt.speed;
await page.evaluate(([pts, speed]) => {
  const g = window.__game(), u = g.update.bind(g), m = g.map;
  const segs = []; let L = 0;
  for (let i = 0; i < pts.length - 1; i++) { const [a, b] = [pts[i], pts[i + 1]], l = Math.hypot(b[0] - a[0], b[1] - a[1]); segs.push({ a, b, l, at: L }); L += l; }
  const t0 = performance.now();
  window.__route = { at() {
    const s = Math.min(L, (performance.now() - t0) / 1000 * speed), q = segs.find((x) => s <= x.at + x.l) ?? segs[segs.length - 1], f = (s - q.at) / q.l;
    const e = q.a[0] + (q.b[0] - q.a[0]) * f, n = q.a[1] + (q.b[1] - q.a[1]) * f;
    return `${e},${n},${Math.atan2(q.b[0] - q.a[0], q.b[1] - q.a[1]) * 180 / Math.PI},0`;
  } };
  g.update = (dt) => {
    const at = window.__route.at(), [e, n, b = 0, t = 0, h = 1.7] = at.split(",").map(Number), x = e, z = -n;
    g.player.pos.set(x, m.ground(x, z), z);
    u(dt);
    g.camera.position.set(x, m.ground(x, z) + h, z);
    g.camera.rotation.set(t * Math.PI / 180, -b * Math.PI / 180, 0, "YXZ");
    g.camera.updateMatrixWorld();
  };
}, [ROUTE, speed]);

const seconds = +opt.secs;
console.log(`crossing the map for ${seconds}s at ${speed} m/s`);
for (let t = 0; t < seconds; t += 10) await page.waitForTimeout(10000);

const stats = await page.evaluate(() => window.__tileStats ?? {});
await browser.close();
server.close();

const rows = Object.entries(stats).map(([k, e]) => ({ square: k, made: e.made || 0, setup: e.setup || 0, build: e.build || 0, slices: e.slices || 0 }))
  .filter((r) => r.build > 0 || r.setup > 0);
const sum = (f) => rows.reduce((a, r) => a + f(r), 0);
const made = sum((r) => r.made), setup = sum((r) => r.setup), build = sum((r) => r.build);
const total = made + setup + build;
console.log(`\nsquares that loaded: ${rows.length}`);
console.log(`  made  (fetch, parse, mask, GameMap) ${made.toFixed(0).padStart(6)} ms total, mean ${(made / rows.length).toFixed(0)} ms a square`);
console.log(`  setup (collision)                   ${setup.toFixed(0).padStart(6)} ms total, mean ${(setup / rows.length).toFixed(0)} ms a square`);
console.log(`  build (the scenery geometry)        ${build.toFixed(0).padStart(6)} ms total, mean ${(build / rows.length).toFixed(0)} ms a square`);
console.log(`  -------------------------------------------------`);
console.log(`  all                                 ${total.toFixed(0).padStart(6)} ms total, mean ${(total / rows.length).toFixed(0)} ms a square`);
console.log(`\nbaking could remove the BUILD share only: ${(100 * build / total).toFixed(0)}% of the work (${(build / rows.length).toFixed(0)} ms a square)`);
console.log(`it would not touch: setup ${(100 * setup / total).toFixed(0)}%, the file ${(100 * made / total).toFixed(0)}%`);
const worst = [...rows].sort((a, b) => (b.build + b.setup) - (a.build + a.setup)).slice(0, 6);
console.log("busiest squares (setup + build):");
for (const w of worst) console.log(`  ${w.square.padEnd(7)} setup ${w.setup.toFixed(0).padStart(5)} ms  build ${w.build.toFixed(0).padStart(5)} ms`);
const out = { secs: seconds, speed, squares: rows.length, made, setup, build, total, rows, errors: errors.filter((e) => !/non-finite|setTargetAtTime/.test(e)), audio: await Promise.resolve("") };
console.log(errors.length ? `page errors: ${errors.slice(0, 2).join("; ")}` : "no page errors");
fs.writeFileSync(path.join(opt.out, "bakeworth.json"), JSON.stringify(out, null, 1));
