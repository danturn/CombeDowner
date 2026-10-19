// Hunts the non-finite value that reaches a sound's setTargetAtTime and throws, which used to
// freeze the game (main.ts's frame loop stops when update() throws).
//
// It crosses the map, because the value is in the ambience (the wind, the traffic, the woods),
// which only moves as you travel; and it drives the cars, in case the engine note is the one. It
// reports, from the game's own checks (switched on by __ambHunt and __dtHunt):
//   - the frame clock going non-finite, and what it was made from (main.ts)
//   - an ambience value going non-finite, and the values it was made from (ambience.ts)
//   - a car's numbers going bad (vehicles.ts, __badVehicleHunt)
// plus any page error naming a non-finite value, so a run says whether they agree.
//
//   cd web && npx vite build && node ../tools/nanhunt.mjs --out nan [--secs 120] [--speed 20]
//
// Sound is off by construction: this imports tools/quiet-guard.mjs, as every tool that opens the
// game in Chrome does.
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
const argv = process.argv.slice(2), opt = { dist: WEB + "dist", out: "nan", secs: "140", speed: "24", size: "1024x640" };
for (let i = 0; i < argv.length; i++) { const a = argv[i]; if (a.startsWith("--")) opt[a.slice(2)] = argv[++i]; }
const [W, H] = opt.size.split("x").map(Number);
fs.mkdirSync(opt.out, { recursive: true });

// A way across the map and back, so the ambience's town/woods/open all move a lot.
const ROUTE = [[0, 0], [154, 400], [-961, 1782], [-1010, 2105], [-930, 2220], [-961, 1782], [154, 400], [0, 0]];

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
// switched on before any game code runs, so every check in the game is live
await page.addInitScript(() => {
  globalThis.__ambHunt = true; globalThis.__dtHunt = true; globalThis.__badVehicleHunt = true; globalThis.__paramHunt = true;
  globalThis.__badAmbience = []; globalThis.__badDt = []; globalThis.__badVehicle = []; globalThis.__badParam = [];
  window.__budget = 40;
});
const errors = [];
page.on("pageerror", (e) => errors.push(String(e.message)));

await page.goto(`http://127.0.0.1:${port}/?map=combe-down&net=local&time=11:00`);
await page.waitForFunction(() => !document.getElementById("solo")?.disabled, null, { timeout: 180000 });
await page.evaluate(() => document.getElementById("solo").click());
await page.waitForFunction(() => window.__game && window.__game(), null, { timeout: 180000 });
await page.addStyleTag({ content: "#menu,#pause,.toast{display:none!important}" });
await page.waitForFunction(() => window.__tilesPending === 0, null, { timeout: 180000, polling: "raf" }).catch(() => {});

// Walk the route: hold the player and camera on it, as the frame-rate probe does, so the ambience
// sees the same travel a player would.
const speed = +opt.speed;
await page.evaluate(([pts, speed]) => {
  const g = window.__game(), u = g.update.bind(g), m = g.map;
  const segs = []; let L = 0;
  for (let i = 0; i < pts.length - 1; i++) { const [a, b] = [pts[i], pts[i + 1]], l = Math.hypot(b[0] - a[0], b[1] - a[1]); segs.push({ a, b, l, at: L }); L += l; }
  const t0 = performance.now();
  window.__route = { at() {
    const s = Math.min(L, (performance.now() - t0) / 1000 * speed), g2 = segs.find((q) => s <= q.at + q.l) ?? segs[segs.length - 1], f = (s - g2.at) / g2.l;
    const e = g2.a[0] + (g2.b[0] - g2.a[0]) * f, n = g2.a[1] + (g2.b[1] - g2.a[1]) * f;
    return `${e},${n},${Math.atan2(g2.b[0] - g2.a[0], g2.b[1] - g2.a[1]) * 180 / Math.PI},0`;
  } };
  g.update = (dt) => {
    const at = window.__route.at(), [e, n, b2 = 0, t = 0, h = 1.7] = at.split(",").map(Number), x = e, z = -n;
    g.player.pos.set(x, m.ground(x, z), z);
    u(dt);
    g.camera.position.set(x, m.ground(x, z) + h, z);
    g.camera.rotation.set(t * Math.PI / 180, -b2 * Math.PI / 180, 0, "YXZ");
    g.camera.updateMatrixWorld();
  };
}, [ROUTE, speed]);

console.log(`crossing the map for ${opt.secs}s at ${speed} m/s`);
const seconds = +opt.secs;
let found = false;
for (let t = 0; t < seconds; t += 4) {
  await page.waitForTimeout(4000);
  const n = await page.evaluate(() => (globalThis.__badAmbience ?? []).length + (globalThis.__badDt ?? []).length + (globalThis.__badVehicle ?? []).length + (globalThis.__badParam ?? []).length);
  if (n) { console.log(`  something went bad after ~${t}s`); found = true; break; }
}

const r = await page.evaluate(() => ({
  amb: globalThis.__badAmbience ?? [], dt: globalThis.__badDt ?? [], veh: globalThis.__badVehicle ?? [], param: globalThis.__badParam ?? [],
}));
const nanErrors = errors.filter((e) => /non-finite|setTargetAtTime/.test(e));
console.log(`\nframe clock bad: ${r.dt.length}`);
for (const b of r.dt) console.log(`  ${b}`);
console.log(`ambience bad: ${r.amb.length}`);
for (const b of r.amb) console.log(`  ${b}`);
console.log(`vehicle bad: ${r.veh.length}`);
for (const b of r.veh) console.log(`  ${b}`);
console.log(`audio param bad: ${r.param.length}`);
for (const b of r.param) console.log(`  ${b}`);
console.log(`\naudio errors naming a non-finite value: ${nanErrors.length}`);
for (const e of nanErrors.slice(0, 3)) console.log(`  ${e}`);
const out = { started: new Date().toISOString(), secs: seconds, speed, ...r, nanErrors, errors, found, audio: await silenceNote(page) };
console.log(out.audio);
fs.writeFileSync(path.join(opt.out, "nanhunt.json"), JSON.stringify(out, null, 1));
await browser.close();
server.close();
process.exit(r.amb.length + r.dt.length + r.veh.length + r.param.length + nanErrors.length ? 0 : 2);
