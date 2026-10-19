// Hunts the non-finite number that reaches a car's engine sound (and makes setTargetAtTime throw,
// which used to freeze the game: web/src/audio.ts). Plays a solo game, drives about town for a
// while with plenty of traffic, and reports every vehicle that went bad, with the values that did
// it — from web/src/vehicles.ts's own check, which is switched on by globalThis.__badVehicleHunt.
//
//   cd web && npx vite build && node ../tools/nanhunt.mjs --out nan [--secs 120]
//
// It also catches the audio error itself (a page error naming setTargetAtTime), so a run says
// whether the two agree: a car reported bad, and the sound that threw.
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
const argv = process.argv.slice(2), opt = { dist: WEB + "dist", out: "nan", secs: "120", size: "1024x640" };
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
const browser = await chromium.launch({
  headless: true,
  ...(exe ? { executablePath: exe } : { channel: "chrome" }),
  args: [...MUTED_ARGS, "--disable-gpu-vsync",
    ...(linux ? ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
      : process.platform === "darwin" ? ["--use-angle=metal", "--enable-gpu"] : [])],
});
const page = await browser.newPage({ viewport: { width: W, height: H } });
await silence(page);
// switched on before any game code runs, so vehicles.ts's check is live
await page.addInitScript(() => { globalThis.__badVehicleHunt = true; globalThis.__badVehicle = []; window.__budget = 40; });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e.message)));

await page.goto(`http://127.0.0.1:${port}/?map=combe-down&net=local&time=11:00`);
await page.waitForFunction(() => !document.getElementById("solo")?.disabled, null, { timeout: 180000 });
await page.evaluate(() => document.getElementById("solo").click());
await page.waitForFunction(() => window.__game && window.__game(), null, { timeout: 180000 });
await page.addStyleTag({ content: "#menu,#pause,.toast{display:none!important}" });
await page.waitForFunction(() => window.__tilesPending === 0, null, { timeout: 180000, polling: "raf" }).catch(() => {});

// Drive: pick a car in town, get in, and drive it about; also shove the parked cars and let the
// traffic run, since the bad number is in the cars' own physics.
const started = await page.evaluate(() => {
  const g = window.__game();
  const cars = g.vehicles?.list ?? [];
  const count = cars.length;
  // stand in town where there is traffic, not out in the village
  g.player.pos.set(-961, g.map.ground(-961, -1782), -1782);
  // work every car's physics hard, through the same call the game uses to drive one: full throttle,
  // sweeping steering, and the handbrake flicked on and off
  window.__drive = (t) => {
    const ga = g;
    ga.player.pos.set(-961, ga.map.ground(-961, -1782), -1782);
    for (const c of ga.vehicles?.list ?? []) {
      try {
        c.drive(0.016, { throttle: 1, steer: Math.sin(t * 2.1) * 0.9, handbrake: Math.sin(t * 0.7) > 0.8, horn: false },
          (x, z) => ga.world.paved(x, z));
      } catch (e) { /* the throw we are hunting: reported through pageerror */ }
    }
  };
  return { count };
});
console.log(`driving for ${opt.secs}s; ${started.count} vehicle(s) in the world`);

const seconds = +opt.secs;
for (let t = 0; t < seconds; t += 2) {
  await page.evaluate((tt) => { if (window.__drive) window.__drive(tt); }, t);
  await page.waitForTimeout(2000);
  const n = await page.evaluate(() => (globalThis.__badVehicle ?? []).length);
  if (n) { console.log(`  a bad car after ~${t}s`); break; }
}

const bad = await page.evaluate(() => globalThis.__badVehicle ?? []);
const nanErrors = errors.filter((e) => /non-finite|setTargetAtTime/.test(e));
console.log(`\ncars that went bad: ${bad.length}`);
for (const b of bad) console.log(`  ${b}`);
console.log(`audio errors naming a non-finite value: ${nanErrors.length}`);
for (const e of nanErrors.slice(0, 3)) console.log(`  ${e}`);
console.log(`other page errors: ${errors.filter((e) => !/non-finite|setTargetAtTime/.test(e)).length}`);
const out = { started: new Date().toISOString(), secs: seconds, vehicles: started.count, bad, nanErrors, errors, audio: await silenceNote(page) };
console.log(out.audio);
fs.writeFileSync(path.join(opt.out, "nanhunt.json"), JSON.stringify(out, null, 1));
await browser.close();
server.close();
process.exit(bad.length || nanErrors.length ? 0 : 2);
