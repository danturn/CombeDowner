// Checks the automatic picture settings (web/src/quality.ts) as other machines would see them. For
// each device it opens the built game afresh in a muted headless Chrome with the processor slowed
// to that device's speed (as tools/devicematrix.mjs calibrates it), the browser telling the page that
// device's graphics chip, memory and touch screen, and the window its usual size. It notes what the
// start-up guess chose, then plays solo at a busy spot for --secs seconds and logs each second's
// frame rate and the settings in force, counting the governor's steps down and up.
//
// The graphics chip can't be slowed, so each frame is held back for the time the device's chip would
// take (estimated as devicematrix.mjs does) without that wait counting as the game's own work: as the
// browser waits on a busy chip.
//
//   cd web && npx vite build && node ../tools/autoprobe.mjs --out auto [--devices m1air,celeron] [--secs 90] [--spot stall-street] [--shots]
//
// --claim m4max has the browser name that device's chip instead, so the guess overshoots and the
// governor has to bring it down.
import { createRequire } from "module";
import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import { MUTED_ARGS, silence, silenceNote } from "./quiet-guard.mjs";

const WEB = new URL("../web/", import.meta.url).pathname;
const { chromium } = createRequire(WEB + "package.json")("playwright");
const argv = process.argv.slice(2), opt = { dist: WEB + "dist", out: "auto", secs: "90", devices: "", spot: "stall-street" };
for (let i = 0; i < argv.length; i++) { const a = argv[i]; if (a === "--shots") opt.shots = true; else if (a.startsWith("--")) opt[a.slice(2)] = argv[++i]; }
fs.mkdirSync(opt.out, { recursive: true });

const SPOTS = {
  "stall-street": "-1053,2075,355,0", "milsom-street": "-1165,2470,345,0", "combe-down": "0,0,90,0",
  "wooded-road": "559,1318,300,0", "widcombe-hill": "-200,1392,290,-3",
};
const HOST = { gb6: 3900, gflops: 14000 };
// gpu: the renderer string the browser would give; w x h, dpr: the window; touch: a phone or tablet
const DEVICES = {
  m4max:   { gb6: 3900, gflops: 14000, gpu: "ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Max, Unspecified Version)", w: 1512, h: 945, dpr: 2, mem: 8 },
  m1air:   { gb6: 2350, gflops: 2600, gpu: "ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)", w: 1440, h: 900, dpr: 2, mem: 8 },
  uhd620:  { gb6: 1200, gflops: 400, gpu: "ANGLE (Intel, Intel(R) UHD Graphics 620 (0x00005917) Direct3D11 vs_5_0 ps_5_0, D3D11)", w: 1536, h: 864, dpr: 1.25, mem: 8 },
  gtx1650: { gb6: 1550, gflops: 3000, gpu: "ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 (0x00001F82) Direct3D11 vs_5_0 ps_5_0, D3D11)", w: 1920, h: 1080, dpr: 1, mem: 8 },
  celeron: { gb6: 390, gflops: 120, gpu: "ANGLE (Intel, Mesa Intel(R) UHD Graphics 600 (GLK 2), OpenGL ES 3.2)", w: 1366, h: 768, dpr: 1, mem: 4 },
  ipad:    { gb6: 1450, gflops: 700, gpu: "Apple GPU", w: 1180, h: 820, dpr: 2, touch: "ipad" },
  android: { gb6: 1000, gflops: 600, gpu: "ANGLE (Qualcomm, Adreno (TM) 710, OpenGL ES 3.2)", w: 915, h: 412, dpr: 2.6, mem: 6, touch: "android" },
  // not a real device: a quick processor with a feeble graphics chip, to make the governor work (with --claim)
  weakgpu: { gb6: 2350, gflops: 150, gpu: "ANGLE (Intel, Intel(R) HD Graphics 500 Direct3D11 vs_5_0 ps_5_0, D3D11)", w: 1440, h: 900, dpr: 2, mem: 8 },
  pixel10: { gb6: 2300, gflops: 1200, gpu: "ANGLE (Imagination Technologies, PowerVR D-Series DXT-48-1536 MC1, OpenGL ES 3.2)", w: 915, h: 412, dpr: 2.6, mem: 8, touch: "android" },
};
// the GPU model's two parts measured on the M4 Max (devicematrix.mjs), shadows on at 900 m
// (the fixed part scaled by the square root of the gap in GFLOPS, the pixels by the whole gap, as quality.ts guesses)
const GPU_FIT = { fixed: 2.4, perMpx: 0.7 };
const devs = opt.devices ? opt.devices.split(",") : Object.keys(DEVICES).filter((k) => k !== "weakgpu");

const TYPES = { ".js": "text/javascript", ".html": "text/html", ".css": "text/css", ".json": "application/json" };
const server = http.createServer((q, res) => {
  let f = path.join(opt.dist, decodeURIComponent(q.url.split("?")[0]));
  if (f.endsWith("/")) f += "index.html";
  fs.readFile(f, (e, b) => { if (e) { res.statusCode = 404; return res.end(); } res.setHeader("content-type", TYPES[path.extname(f)] || "application/octet-stream"); res.end(b); });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const browser = await chromium.launch({
  headless: true, channel: "chrome",
  args: [...MUTED_ARGS, "--disable-gpu-vsync", "--disable-frame-rate-limit", "--use-angle=metal", "--enable-gpu"],
});

const UA = {
  ipad: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
  android: "Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
};
const out = { started: new Date().toISOString(), gpuFit: GPU_FIT, results: {} };
for (const id of devs) {
  const D = { ...DEVICES[id], ...(opt.claim ? { gpu: DEVICES[opt.claim].gpu, mem: DEVICES[opt.claim].mem } : {}) }, rate = +(HOST.gb6 / D.gb6).toFixed(2);
  const context = await browser.newContext({ viewport: { width: D.w, height: D.h }, deviceScaleFactor: D.dpr, ...(D.touch ? { userAgent: UA[D.touch], hasTouch: true } : {}) });
  const page = await context.newPage();
  await silence(page);
  await page.addInitScript(([D, fit, host]) => {
    if (D.touch) Object.defineProperty(Navigator.prototype, "maxTouchPoints", { get: () => 5 });
    Object.defineProperty(Navigator.prototype, "deviceMemory", { get: () => D.mem, configurable: true });
    if (!D.mem) delete Navigator.prototype.deviceMemory;
    for (const C of [WebGLRenderingContext, WebGL2RenderingContext]) {
      const gp = C.prototype.getParameter;
      C.prototype.getParameter = function (p) { return p === 0x9246 ? D.gpu : gp.call(this, p); };
    }
    // hold each frame back for the device's graphics chip, outside the game's own time
    const raf = window.requestAnimationFrame.bind(window);
    let last = performance.now();
    window.requestAnimationFrame = (cb) => {
      const q = window.__q, l = q?.look;
      let wait = 0;
      if (l && window.__game?.()) {
        const lines = [270, 360, 540][l.res] ?? 540, px = window.__px ?? 960 * 540;
        const gap = host.gflops / D.gflops;
        const gpu = fit.fixed * (l.view / 900) ** 0.3 * (l.shadows ? 1 : 0.8) * Math.sqrt(gap) + fit.perMpx * px * (lines / 540) ** 2 / 1e6 * gap;
        wait = gpu - (performance.now() - last);
      }
      const go = () => raf((t) => { last = performance.now(); cb(t); });
      if (wait > 1) setTimeout(go, wait); else go();
      return 0;
    };
  }, [D, GPU_FIT, HOST]);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate });
  const at = SPOTS[opt.spot];
  await page.goto(`http://127.0.0.1:${port}/?${new URLSearchParams({ map: "combe-down", time: "11:00", at })}`);
  await page.waitForFunction(() => window.__q, null, { timeout: 300000 });
  const guess = await page.evaluate(() => ({ ...window.__quality, auto: window.__q.auto, look: window.__q.look }));
  // the pixels a frame draws at Normal here, for the chip's estimate
  await page.evaluate(() => {
    const r = Math.min(devicePixelRatio, navigator.maxTouchPoints > 1 ? 1.25 : 1.75), f = Math.max(1, Math.round(innerHeight * r / 540));
    window.__px = Math.ceil(innerWidth * r / f) * Math.ceil(innerHeight * r / f);
  });
  await page.waitForFunction(() => !document.getElementById("solo")?.disabled, null, { timeout: 600000 });
  await page.evaluate(() => document.getElementById("solo").click());
  await page.waitForFunction(() => window.__game && window.__game(), null, { timeout: 300000 });
  await page.addStyleTag({ content: "#menu,#pause,.toast{display:none!important}" });
  await page.evaluate((at) => {
    const g = window.__game(), u = g.update.bind(g);
    g.update = (dt) => {
      const [e, n, b = 0, t = 0, h = 1.7] = at.split(",").map(Number), x = e, z = -n, m = g.map;
      g.player.pos.set(x, m.ground(x, z), z);
      u(dt);
      g.camera.position.set(x, m.ground(x, z) + h, z);
      g.camera.rotation.set(t * Math.PI / 180, -b * Math.PI / 180, 0, "YXZ");
    };
    window.__log = [];
    let n = 0, t0 = performance.now();
    const f = () => {
      n++;
      const now = performance.now();
      if (now - t0 >= 1000) {
        const q = window.__q, l = q.look ?? {};
        window.__log.push({ fps: +(n * 1000 / (now - t0)).toFixed(1), view: l.view, res: l.res, shadows: l.shadows, every: l.every, depth: q.trail?.length - 1, building: window.__tilesPending ?? 0 });
        n = 0; t0 = now;
      }
      requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  }, at);
  const load0 = os.loadavg()[0];
  await page.waitForTimeout(+opt.secs * 1000);
  const log = await page.evaluate(() => window.__log);
  const key = (r) => `${r.view}/${r.res}/${r.shadows ? 1 : 0}/${r.every}`;
  let downs = 0, ups = 0;
  for (let i = 1; i < log.length; i++) if (key(log[i]) !== key(log[i - 1])) (log[i].depth > log[i - 1].depth ? downs++ : ups++);
  const tail = log.slice(-20), fpsTail = tail.reduce((a, r) => a + r.fps, 0) / Math.max(1, tail.length);
  const fin = log[log.length - 1] ?? {};
  out.results[id] = { rate, guess, log, downs, ups, final: fin, fpsLast20s: +fpsTail.toFixed(1), load: [+load0.toFixed(1), +os.loadavg()[0].toFixed(1)] };
  console.log(`${id.padEnd(8)} x${rate} | guess ${JSON.stringify(guess.look)} (speed ${guess.speed}, ${guess.gflops} GFLOPS, target ${guess.target}) | after ${opt.secs}s ${key(fin)} depth ${fin.depth}, ${downs} down ${ups} up, last 20 s ${fpsTail.toFixed(1)} fps | load ${load0.toFixed(0)}-${os.loadavg()[0].toFixed(0)}`);
  console.log("   fps by second:", log.map((r) => Math.round(r.fps)).join(" "));
  if (opt.shots) {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    for (const [name, a] of Object.entries(SPOTS).filter(([k]) => ["stall-street", "wooded-road"].includes(k))) {
      await page.evaluate((a) => {
        const g = window.__game(), base = Object.getPrototypeOf(g).update.bind(g);
        g.update = (dt) => {
          const [e, n, b = 0, t = 0, h = 1.7] = a.split(",").map(Number), x = e, z = -n, m = g.map;
          g.player.pos.set(x, m.ground(x, z), z); base(dt);
          g.camera.position.set(x, m.ground(x, z) + h, z); g.camera.rotation.set(t * Math.PI / 180, -b * Math.PI / 180, 0, "YXZ");
        };
        window.__q.auto = false;   // hold the settings still for the picture
      }, a);
      await page.waitForTimeout(1000);   // (the count of squares waiting is only brought up to date by the next frames)
      const t0 = Date.now(), ok = await page.waitForFunction(() => window.__tilesPending === 0, null, { timeout: 180000, polling: 500 }).then(() => true, () => false);
      console.log(`   ${name}: squares ${ok ? "built" : "NOT all built"} after ${((Date.now() - t0) / 1000).toFixed(0)} s (${await page.evaluate(() => window.__tilesPending)} waiting)`);
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(opt.out, `${id}-${name}.png`) });
    }
  }
  console.log("  ", await silenceNote(page));
  fs.writeFileSync(path.join(opt.out, "auto.json"), JSON.stringify(out, null, 1));
  await context.close();
}
await browser.close();
server.close();
