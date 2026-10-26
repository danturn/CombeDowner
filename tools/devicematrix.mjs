// How the game would run on other machines, measured on this one: for the automatic quality
// settings (quality.ts). It serves the built game (web/dist), starts a solo game in a muted headless
// Chrome, stands at each spot and, for each draw distance and with shadows on and off, measures
// frames as they are here (CPU and GPU time, by EXT_disjoint_timer_query) and then with the page's
// CPU slowed down to each device's speed (Chrome's CPU throttling, calibrated against Geekbench 6
// single-core scores). The GPU can't be slowed, so each device's GPU time is estimated: this GPU's
// time at three resolutions gives a fixed part and a per-pixel part, scaled to the device's screen
// and by the ratio of the two chips' FP32 GFLOPS. Rough, by a factor of two either way.
//
//   cd web && npx vite build && node ../tools/devicematrix.mjs --out matrix [--spots a,b] [--views 600,900] [--devices m1air,uhd620] [--secs 3]
//
// Writes <out>/matrix.json, and a table to the console: for each device, the longest draw distance
// that holds its target frame rate at each spot.
import { createRequire } from "module";
import fs from "fs";
import http from "http";
import path from "path";
import os from "os";
import { MUTED_ARGS, silence, silenceNote } from "./quiet-guard.mjs";

const WEB = new URL("../web/", import.meta.url).pathname;
const { chromium } = createRequire(WEB + "package.json")("playwright");
const argv = process.argv.slice(2), opt = { dist: WEB + "dist", out: "matrix", secs: "3", spots: "", views: "600,900,1500,3000", devices: "" };
for (let i = 0; i < argv.length; i++) { const a = argv[i]; if (a.startsWith("--")) opt[a.slice(2)] = argv[++i]; }
fs.mkdirSync(opt.out, { recursive: true });

const SPOTS = {
  "stall-street": "-1053,2075,355,0",
  "milsom-street": "-1165,2470,345,0",
  "combe-down": "0,0,90,0",
  "wooded-road": "559,1318,300,0",
  "widcombe-hill": "-200,1392,290,-3",
};
// this machine: M4 Max (14-core CPU, 32-core GPU). Geekbench 6 single-core about 3,900; GPU about 14 TFLOPS FP32.
const HOST = { gb6: 3900, gflops: 14000 };
// gb6: Geekbench 6 single-core (published medians); gflops: FP32; px: the pixels the game draws at
// "Normal" on that device's usual screen (post.ts: a whole number of screen pixels per game pixel)
const DEVICES = {
  m1air:    { name: "M1 MacBook Air 8 GB",       gb6: 2350, gflops: 2600, px: 840 * 525,  memGB: 8,  target: 60 },
  uhd620:   { name: "Intel UHD 620 laptop",      gb6: 1200, gflops: 400,  px: 960 * 540,  memGB: 8,  target: 60, alt: 30 },
  gtx1650:  { name: "GTX 1650 PC, 4 cores",      gb6: 1550, gflops: 3000, px: 960 * 540,  memGB: 16, target: 60 },
  celeron:  { name: "Chromebook (Celeron N4020)", gb6: 390, gflops: 120,  px: 1366 * 768, memGB: 4,  target: 30 },
  ipad:     { name: "iPad (A13)",                gb6: 1450, gflops: 700,  px: 738 * 513,  memGB: 3,  target: 30 },
  android:  { name: "Mid Android (SD 7s Gen 2)", gb6: 1000, gflops: 600,  px: 1144 * 515, memGB: 6,  target: 30 },
  pixel10:  { name: "Pixel 10 (Tensor G5)",      gb6: 2300, gflops: 1200, px: 1144 * 515, memGB: 12, target: 30 },
};
const devs = opt.devices ? opt.devices.split(",") : Object.keys(DEVICES);
const spots = opt.spots ? opt.spots.split(",") : Object.keys(SPOTS);
const views = opt.views.split(",").map(Number);

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
  args: [...MUTED_ARGS, "--disable-gpu-vsync", "--disable-frame-rate-limit", "--use-angle=metal", "--enable-gpu", "--enable-precise-memory-info"],
});
// 1920x1080 at one pixel per CSS pixel: "Normal" draws 960x540, "Low" 640x360, "Lowest" 480x270
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await silence(page);
page.on("pageerror", (e) => console.log("pageerror", e.message));
const cdp = await page.context().newCDPSession(page);

const q = new URLSearchParams({ map: "combe-down", time: "11:00", at: SPOTS[spots[0]], quality: "off" });
await page.goto(`http://127.0.0.1:${port}/?${q}`);
await page.evaluate(() => { window.__budget = 40; try { localStorage.clear(); } catch {} });
await page.waitForFunction(() => !document.getElementById("solo")?.disabled, null, { timeout: 180000 });
await page.evaluate(() => document.getElementById("solo").click());
await page.waitForFunction(() => window.__game && window.__game(), null, { timeout: 180000 });
await page.addStyleTag({ content: "#menu,#pause,.toast{display:none!important}" });
await page.evaluate((at) => {
  window.__at = at;
  const g = window.__game(), u = g.update.bind(g), r = window.__renderer;
  g.update = (dt) => {
    const [e, n, b = 0, t = 0, h = 1.7] = window.__at.split(",").map(Number), x = e, z = -n, m = g.map;
    g.player.pos.set(x, m.ground(x, z), z);
    u(dt);
    g.camera.position.set(x, m.ground(x, z) + h, z);
    g.camera.rotation.set(t * Math.PI / 180, -b * Math.PI / 180, 0, "YXZ");
    g.camera.updateMatrixWorld();
  };
  // GPU time per frame: one query round each top-level render (the shadow map is drawn inside the world's)
  const gl = r.getContext(), tq = gl.getExtension("EXT_disjoint_timer_query_webgl2");
  const G = (window.__G = { on: !!tq, pending: [], frame: 0, done: [] });
  const rr = r.render.bind(r);
  r.render = (s, c) => {
    if (!tq) return rr(s, c);
    const qq = gl.createQuery(); gl.beginQuery(tq.TIME_ELAPSED_EXT, qq); rr(s, c); gl.endQuery(tq.TIME_ELAPSED_EXT);
    G.pending.push([qq, G.frame]);
  };
  const raf = requestAnimationFrame.bind(window);
  const tick = () => {
    G.frame++;
    if (tq) {
      const dis = gl.getParameter(tq.GPU_DISJOINT_EXT), keep = [];
      for (const p of G.pending) {
        if (!gl.getQueryParameter(p[0], gl.QUERY_RESULT_AVAILABLE)) { keep.push(p); continue; }
        if (!dis) G.done.push([p[1], gl.getQueryParameter(p[0], gl.QUERY_RESULT) / 1e6]);
        gl.deleteQuery(p[0]);
      }
      G.pending = keep;
    }
    raf(tick);
  };
  raf(tick);
}, SPOTS[spots[0]]);

const setv = (id, v) => page.evaluate(([id, v]) => {
  const el = document.getElementById(id);
  if (el.type === "checkbox") el.checked = v; else el.value = String(v);
  el.dispatchEvent(new Event("change"));
}, [id, v]);
async function settle() {
  await page.evaluate(() => { window.__calm = null; });
  return page.waitForFunction(() => {
    if (window.__tilesPending !== 0) { window.__calm = null; return false; }
    const c = (window.__calm ??= { frames: 0, t: performance.now() });
    return ++c.frames >= 12 && performance.now() - c.t > 800;
  }, null, { timeout: 180000, polling: "raf" }).then(() => true, () => false);
}
async function measure(secs) {
  await page.evaluate(() => {
    window.__G.done = []; window.__iv = []; window.__t0 = performance.now();
    let l = performance.now();
    const f = () => { if (!window.__iv) return; const n = performance.now(); window.__iv.push(n - l); l = n; requestAnimationFrame(f); };
    requestAnimationFrame(f);
  });
  await page.waitForTimeout(secs * 1000);
  return page.evaluate(() => {
    const iv = window.__iv.slice(1).sort((a, b) => a - b); window.__iv = null;
    const pc = (a, p) => +(a[Math.min(a.length - 1, Math.floor(a.length * p))] ?? 0).toFixed(1);
    const gf = {}; for (const [f, ms] of window.__G.done) gf[f] = (gf[f] ?? 0) + ms;
    const ga = Object.values(gf).sort((a, b) => a - b);
    const mean = iv.reduce((a, b) => a + b, 0) / Math.max(1, iv.length);
    return { fps: +(1000 / mean).toFixed(1), med: pc(iv, 0.5), p95: pc(iv, 0.95), worst: pc(iv, 1), frames: iv.length,
      gpu: +(ga.reduce((a, b) => a + b, 0) / Math.max(1, ga.length)).toFixed(2), gpuP95: pc(ga, 0.95), calls: window.__renderer.info.render.calls };
  });
}
// the JavaScript heap, and what the scene's geometry and textures take on the graphics card
const memory = () => page.evaluate(() => {
  const seen = new Set(); let geo = 0, tex = 0;
  const add = (t) => { if (!t || seen.has(t)) return; seen.add(t); const i = t.image; if (i && i.width) tex += i.width * i.height * 4 * (t.generateMipmaps !== false ? 1.33 : 1); };
  window.__game().world.scene.traverse((o) => {
    const g = o.geometry;
    if (g && !seen.has(g)) { seen.add(g); for (const a of Object.values(g.attributes)) if (a.array && !seen.has(a.array)) { seen.add(a.array); geo += a.array.byteLength; } if (g.index?.array && !seen.has(g.index.array)) { seen.add(g.index.array); geo += g.index.array.byteLength; } }
    if (o.isInstancedMesh && !seen.has(o.instanceMatrix.array)) { seen.add(o.instanceMatrix.array); geo += o.instanceMatrix.array.byteLength; }
    for (const m of [].concat(o.material ?? [])) for (const k of ["map", "normalMap", "emissiveMap", "alphaMap"]) add(m[k]);
  });
  return { heapMB: Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1e6), geoMB: Math.round(geo / 1e6), texMB: Math.round(tex / 1e6) };
});
const RES = { 270: 0, 360: 1, 540: 2 };
const PX = { 270: 480 * 270, 360: 640 * 360, 540: 960 * 540 };

// numbers taken on a busy machine mean nothing: wait for a quiet one
const quiet = () => os.loadavg()[0] < os.cpus().length * 0.5;
const waitQuiet = async () => { while (!quiet()) { console.log(`waiting for a quiet machine (load ${os.loadavg()[0].toFixed(0)})`); await new Promise((r) => setTimeout(r, 60000)); } };
await waitQuiet();
const out = { started: new Date().toISOString(), host: HOST, devices: DEVICES, results: [] };
console.log(await silenceNote(page));
for (const s of spots) {
  await page.evaluate((at) => { window.__at = at; }, SPOTS[s]);
  for (const v of views) {
    await waitQuiet();
    await setv("set-shadows", true); await setv("set-res", 2); await setv("set-view", v);
    const built = await settle();
    const mem = await memory();
    for (const sh of [true, false]) {
      await setv("set-shadows", sh);
      const host = {};
      for (const lines of [540, 360, 270]) {
        await setv("set-res", RES[lines]);
        await page.waitForTimeout(600);
        host[lines] = await measure(+opt.secs);
      }
      await setv("set-res", 2);
      // GPU ms = a + b x pixels, from the three resolutions
      const xs = [540, 360, 270].map((l) => PX[l]), ys = [540, 360, 270].map((l) => host[l].gpu);
      const mx = xs.reduce((a, b) => a + b) / 3, my = ys.reduce((a, b) => a + b) / 3;
      const b = Math.max(0, xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / xs.reduce((a, x) => a + (x - mx) ** 2, 0));
      const a = Math.max(0, my - b * mx);
      const row = { spot: s, view: v, shadows: sh, built, mem, load: +os.loadavg()[0].toFixed(1), host, gpuFit: { fixed: +a.toFixed(2), perMpx: +(b * 1e6).toFixed(2) }, dev: {} };
      for (const d of devs) {
        const D = DEVICES[d], rate = +(HOST.gb6 / D.gb6).toFixed(2), gap = HOST.gflops / D.gflops;
        await cdp.send("Emulation.setCPUThrottlingRate", { rate });
        await page.waitForTimeout(800);
        const m = await measure(+opt.secs);
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
        // the GPU estimate at Normal, Low and Lowest on that device's screen
        const scale = D.px / PX[540];
        const gpu = Object.fromEntries([540, 360, 270].map((l) => [l, +((a + b * PX[l] * scale) * gap).toFixed(1)]));
        const frame = Object.fromEntries([540, 360, 270].map((l) => [l, +Math.max(m.med, gpu[l]).toFixed(1)]));
        row.dev[d] = { rate, cpu: m, gpu, frame };
      }
      out.results.push(row);
      const h = host[540];
      console.log(`${s.padEnd(13)} ${String(v).padStart(4)} m shadows ${sh ? "on " : "off"} | here ${h.fps} fps p95 ${h.p95} worst ${h.worst}, gpu ${h.gpu} ms (${host[360].gpu}/${host[270].gpu} at 360/270), ${h.calls} draws | heap ${mem.heapMB} MB geo ${mem.geoMB} tex ${mem.texMB}${built ? "" : " (NOT all built)"} | load ${row.load}`);
      for (const d of devs) { const r = row.dev[d]; console.log(`     ${d.padEnd(8)} x${r.rate} cpu med ${r.cpu.med} p95 ${r.cpu.p95} worst ${r.cpu.worst} | gpu est ${r.gpu[540]}/${r.gpu[360]}/${r.gpu[270]} | frame ${r.frame[540]}/${r.frame[360]}/${r.frame[270]} ms`); }
      fs.writeFileSync(path.join(opt.out, "matrix.json"), JSON.stringify(out, null, 1));
    }
  }
}
console.log(await silenceNote(page));
await browser.close();
server.close();
