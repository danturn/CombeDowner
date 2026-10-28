// How much memory the streets game holds as you travel round Bath, for checking that squares left
// behind are let go of. It serves the built game (web/dist), starts a solo game in a muted headless
// Chrome (tools/quiet-guard.mjs), and takes the player along a fixed route: the village, the city
// centre, Lansdown, Larkhall, Twerton and back to the village. At each stop it waits until the
// squares round it are built, lets the game settle, collects the garbage, and logs the squares
// loaded, the JS heap, what the renderer holds and the frame time.
//
//   cd web && npm run build && cd .. && node tools/memory_probe.mjs --view 900 --out out/memory --tag before
//
// Options: --view <metres> (draw distance; 900 is the desktop normal), --squares <n> (the most
// squares built at once, as ?squares= does), --dist web/dist, --out <dir>,
// --tag <name>, --dwell <seconds> to stay at each stop (default 4), --sample (attribute what the trip
// added and still holds at the end to the code that made it, with the sampling heap profiler), --size 1280x720.
// Writes <out>/memory-<tag>.json and prints a table.
import { createRequire } from "module";
import fs from "fs";
import http from "http";
import path from "path";
import { execSync } from "child_process";
import { MUTED_ARGS, silence, silenceContext, silenceNote } from "./quiet-guard.mjs";

const WEB = new URL("../web/", import.meta.url).pathname;
const { chromium } = (() => {
  if (process.env.PW) return createRequire(import.meta.url)(process.env.PW);
  try { return createRequire(WEB + "package.json")("playwright"); } catch { return createRequire(import.meta.url)("playwright"); }
})();

const argv = process.argv.slice(2), opt = { dist: WEB + "dist", out: "out/memory", tag: "run", view: "900", dwell: "4", size: "1280x720", timeout: "120" };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--sample") opt.sample = true;
  else if (a.startsWith("--")) opt[a.slice(2)] = argv[++i];
}
const [W, H] = opt.size.split("x").map(Number);
fs.mkdirSync(opt.out, { recursive: true });

// data metres east and north of the map's centre (Combe Down)
const ROUTE = [
  ["village", -100, -120],
  ["centre", -976, 2128],
  ["lansdown", -1489, 3637],
  ["larkhall", -139, 3790],
  ["twerton", -3772, 1872],
  ["village again", -100, -120],
];

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

const linux = process.platform === "linux";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME ? { executablePath: process.env.CHROME } : { channel: "chrome" }),
  args: [...MUTED_ARGS, "--enable-precise-memory-info", "--js-flags=--expose-gc", `--memory-probe=${process.pid}`,
    ...(linux ? ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
      : process.platform === "darwin" ? ["--use-angle=metal", "--enable-gpu"] : [])],
});
const context = await browser.newContext({ viewport: { width: W, height: H } });
await silenceContext(context);
const page = await context.newPage();
await silence(page);
const complaints = [];
page.on("pageerror", (e) => complaints.push(`error: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error") complaints.push(`console: ${m.text().slice(0, 300)}`); });
const cdp = await context.newCDPSession(page);
await cdp.send("HeapProfiler.enable");

const q = new URLSearchParams({ map: "combe-down", time: "11:00", view: opt.view, at: `${ROUTE[0][1]},${ROUTE[0][2]},0,0`, quality: "off", progression: "0" });
if (opt.squares) q.set("squares", opt.squares);
await page.goto(`http://127.0.0.1:${port}/?${q}`);
await page.waitForFunction(() => !document.getElementById("solo")?.disabled, null, { timeout: 180000 });
await page.evaluate(() => document.getElementById("solo").click());
await page.waitForFunction(() => window.__game && window.__game(), null, { timeout: 180000 });
console.log(await silenceNote(page));
// each stop is reached the way the debug panel's Go to does it (game.ts goToSpot); if the player is
// knocked down meanwhile, they're sent back there once they're up again
await page.evaluate(() => {
  const g = window.__game(), u = g.update.bind(g);
  g.update = (dt) => {
    u(dt);
    const at = window.__at, p = g.player.pos;
    if (at && g.alive && Math.hypot(p.x - at[0], p.z - at[1]) > 60) g.goToSpot({ x: at[0], z: at[1], yaw: 0, pitch: 0 });
    // looking all round while at a stop, as a player does, so everything round them is drawn
    if (window.__spin) g.player.yaw += dt * Math.PI * 2 / window.__spin;
  };
});

/** What the whole browser holds, MB: the memory footprint of Chrome and every process under it
 *  (the page, its graphics and the rest), as macOS's top counts it, graphics memory included. */
function footprint() {
  if (process.platform !== "darwin") return null;
  const procs = execSync("top -l 1 -stats pid,ppid,mem", { encoding: "utf8" }).split("\n")
    .map((l) => l.trim().split(/\s+/)).filter((c) => c.length >= 3 && /^\d+$/.test(c[0]) && /^\d+$/.test(c[1]));
  const ours = new Set(execSync(`pgrep -f -- --memory-probe=${process.pid}`, { encoding: "utf8" }).split("\n").filter(Boolean));
  const parent = new Map(procs.map(([pid, ppid]) => [pid, ppid]));
  const root = [...ours].find((p) => !ours.has(parent.get(p)));
  if (!root) return null;
  const kids = new Map(), mem = new Map();
  const mb = (v) => { const m = /^([\d.]+)([KMG])?B?[+-]?$/.exec(v); return m ? +m[1] * ({ K: 1 / 1024, M: 1, G: 1024 }[m[2]] ?? 1 / 1048576) : 0; };
  for (const [pid, ppid, m] of procs) { kids.set(ppid, [...(kids.get(ppid) ?? []), pid]); mem.set(pid, mb(m)); }
  const kind = new Map(execSync("ps -axo pid=,command=", { encoding: "utf8", maxBuffer: 1 << 26 }).split("\n")
    .map((l) => /^\s*(\d+)\s+(.*)$/.exec(l)).filter(Boolean).map((m) => [m[1], /--type=([a-z-]+)/.exec(m[2])?.[1] ?? "browser"]));
  const by = {};
  const walk = (pid) => { const k = kind.get(pid) ?? "?"; by[k] = (by[k] ?? 0) + (mem.get(pid) ?? 0); for (const c of kids.get(pid) ?? []) walk(c); };
  walk(String(root));
  for (const k in by) by[k] = Math.round(by[k]);
  return by;
}

const rows = [];
const t0 = Date.now();
for (const [name, e, n] of ROUTE) {
  const s0 = Date.now();
  await page.evaluate(([x, z]) => { window.__at = [x, z]; window.__calm = null; }, [e, -n]);
  const ready = await page.waitForFunction(() => {
    const p = window.__tilesPending;
    if (p !== 0) { window.__calm = null; return false; }
    const c = (window.__calm ??= { frames: 0, t: performance.now() });
    return ++c.frames >= 12 && performance.now() - c.t > 500;
  }, null, { timeout: +opt.timeout * 1000, polling: "raf" }).then(() => true, () => false);
  const loadSecs = (Date.now() - s0) / 1000;
  // stay a while, turning round once, so squares left behind are dropped, everything round is
  // drawn and anything waiting on frames catches up
  await page.evaluate((secs) => { window.__spin = secs; }, +opt.dwell);
  const frames = await page.evaluate((secs) => new Promise((done) => {
    const d = []; let last = performance.now(); const end = last + secs * 1000;
    const step = (t) => { d.push(t - last); last = t; if (t < end) requestAnimationFrame(step); else done(d); };
    requestAnimationFrame(step);
  }), +opt.dwell);
  await page.evaluate(() => { window.__spin = 0; });
  frames.sort((a, b) => a - b);
  await cdp.send("HeapProfiler.collectGarbage");
  await cdp.send("HeapProfiler.collectGarbage");
  // how many squares' maps are still alive anywhere in the page, whether the game has them or not
  const proto = await cdp.send("Runtime.evaluate", { expression: "Object.getPrototypeOf(window.__game().map)" });
  const found = await cdp.send("Runtime.queryObjects", { prototypeObjectId: proto.result.objectId });
  const count = await cdp.send("Runtime.callFunctionOn", { objectId: found.objects.objectId, functionDeclaration: "function () { return this.length; }", returnByValue: true });
  await cdp.send("Runtime.releaseObject", { objectId: found.objects.objectId });
  await cdp.send("Runtime.releaseObject", { objectId: proto.result.objectId });
  await cdp.send("HeapProfiler.collectGarbage");
  const heap = await cdp.send("Runtime.getHeapUsage");
  const pg = await page.evaluate(() => {
    const g = window.__game(), r = window.__renderer, info = r.info, m = g.map;
    // what the scene's geometry and textures hold in the page (their arrays and canvases)
    const seen = new Set(); let geoBytes = 0, instBytes = 0, meshes = 0;
    const tex = new Set();
    const sizeOf = (a) => { if (!a) return 0; const arr = a.isInterleavedBufferAttribute ? a.data.array : a.array; if (!arr || seen.has(arr)) return 0; seen.add(arr); return arr.byteLength ?? 0; };
    g.world.scene.traverse((o) => {
      if (o.geometry) {
        meshes++;
        for (const a of Object.values(o.geometry.attributes)) geoBytes += sizeOf(a);
        geoBytes += sizeOf(o.geometry.index);
      }
      if (o.isInstancedMesh) instBytes += sizeOf(o.instanceMatrix) + sizeOf(o.instanceColor);
      for (const mat of o.material ? [].concat(o.material) : []) for (const v of Object.values(mat)) if (v && v.isTexture) tex.add(v);
    });
    let texBytes = 0;
    const texKinds = {};
    for (const t of tex) {
      const i = t.image; if (!i || !i.width) continue;
      const b = i.width * i.height * 4; texBytes += b;
      const k = `${i.width}x${i.height} ${i.constructor?.name ?? ""}`;
      const e = (texKinds[k] ??= [0, 0]); e[0]++; e[1] += b / 1048576;
    }
    // geometry by the kind of thing drawn: the material's type and the first texture it uses
    const geoKinds = {};
    const seen2 = new Set();
    g.world.scene.traverse((o) => {
      if (!o.geometry) return;
      let b = 0;
      for (const a of Object.values(o.geometry.attributes)) { const arr = a.isInterleavedBufferAttribute ? a.data.array : a.array; if (arr && !seen2.has(arr)) { seen2.add(arr); b += arr.byteLength; } }
      const ix = o.geometry.index?.array; if (ix && !seen2.has(ix)) { seen2.add(ix); b += ix.byteLength; }
      const mat = [].concat(o.material ?? [])[0];
      const k = `${o.isInstancedMesh ? "inst " : ""}${o.type} ${mat?.type ?? ""} ${o.name || mat?.name || ""}`.trim();
      const e = (geoKinds[k] ??= [0, 0]); e[0]++; e[1] += b / 1048576;
    });
    const top = (o) => Object.entries(o).sort((a, b) => b[1][1] - a[1][1]).slice(0, 12).map(([k, [n, mb]]) => `${k}: ${n} = ${mb.toFixed(1)} MB`);
    window.__memKinds = { tex: top(texKinds), geo: top(geoKinds) };
    const mem = performance.memory;
    return {
      tiles: m.tiles.size, where: [Math.round(g.player.pos.x), Math.round(g.player.pos.z)].join(","), tileKeys: [...m.tiles.keys()].map((k) => `${Math.floor(k / 1024) - 512}_${(k % 1024) - 512}`).join(" "),
      geometries: info.memory.geometries, textures: info.memory.textures,
      triangles: info.render.triangles, calls: info.render.calls,
      meshes, geoMB: geoBytes / 1048576, instMB: instBytes / 1048576, sceneTextures: tex.size, texMB: texBytes / 1048576,
      usedMB: mem ? mem.usedJSHeapSize / 1048576 : null, totalMB: mem ? mem.totalJSHeapSize / 1048576 : null,
    };
  });
  const row = {
    stop: name, ready, loadSecs: +loadSecs.toFixed(1),
    heapMB: +(heap.usedSize / 1048576).toFixed(0), maps: count.result.value, ...(() => { const f = footprint(); return f ? { chromeMB: Object.values(f).reduce((a, b) => a + b, 0), chromeBy: f } : {}; })(),
    ...Object.fromEntries(Object.entries(pg).map(([k, v]) => [k, typeof v === "number" ? +v.toFixed(1) : v])),
    frameMs: +frames[Math.floor(frames.length / 2)].toFixed(1), frameP95: +frames[Math.floor(frames.length * 0.95)].toFixed(1),
  };
  row.kinds = await page.evaluate(() => window.__memKinds);
  rows.push(row);
  // from the first stop on, so what it finds still held at the end is what the trip added
  if (opt.sample && rows.length === 1) await cdp.send("HeapProfiler.startSampling", { samplingInterval: 32768 });
  console.log(`${name.padEnd(14)} ${ready ? "" : "(timed out) "}squares ${row.tiles} (maps alive ${row.maps}), heap ${row.heapMB} MB, Chrome ${row.chromeMB} MB ${JSON.stringify(row.chromeBy)}, geometries ${row.geometries}, textures ${row.textures}, `
    + `at ${row.where} [${row.tileKeys}] ${(row.triangles / 1e6).toFixed(2)}M tris, ${row.calls} calls, geo arrays ${row.geoMB} MB, frame ${row.frameMs} ms (p95 ${row.frameP95}), in ${row.loadSecs}s`);
}

let sample = null;
if (opt.sample) {
  const { profile } = await cdp.send("HeapProfiler.getSamplingProfile");
  await cdp.send("HeapProfiler.stopSampling");
  // live bytes by the function that allocated them, and by the deepest game-code frame on the way
  const self = new Map(), game = new Map();
  const walk = (node, stack) => {
    const f = node.callFrame, label = `${f.functionName || "(anon)"} ${path.basename(f.url || "")}:${f.lineNumber + 1}`;
    const s = [...stack, label];
    const bytes = node.selfSize;
    if (bytes) {
      self.set(label, (self.get(label) ?? 0) + bytes);
      const own = [...s].reverse().find((l) => /index-|\.ts|assets/.test(l)) ?? label;
      game.set(own, (game.get(own) ?? 0) + bytes);
    }
    for (const c of node.children) walk(c, s);
  };
  walk(profile.head, []);
  const top = (m) => [...m].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => [k, +(v / 1048576).toFixed(1)]);
  sample = { self: top(self), game: top(game) };
  console.log("still held at the end, by allocating function (MB):");
  for (const [k, v] of sample.self) console.log(`  ${String(v).padStart(7)}  ${k}`);
}

const out = { tag: opt.tag, view: +opt.view, started: new Date(t0).toISOString(), seconds: (Date.now() - t0) / 1000, rows, sample, complaints: [...new Set(complaints)].slice(0, 30) };
const file = path.join(opt.out, `memory-${opt.tag}.json`);
fs.writeFileSync(file, JSON.stringify(out, null, 1));
console.log(`peak heap ${Math.max(...rows.map((r) => r.heapMB))} MB, end ${rows[rows.length - 1].heapMB} MB; peak Chrome ${Math.max(...rows.map((r) => r.chromeMB ?? 0))} MB; ${complaints.length} page complaints; written to ${file}`);
console.log(await silenceNote(page));
// (closing Chrome can hang after the heap profiler has been used, so it isn't waited on for long)
await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 5000))]);
server.close();
process.exit(0);
