// Where a frame's time goes, all of it, for working out what to speed up on slower machines. It
// serves a build of the game (web/dist, built unminified with source maps so every cost can be traced
// back to a file and a function), starts a solo game in a muted headless Chrome on the real graphics
// card, holds the camera at each view (or moves it, for the drive), and measures:
//
//   base     frame rate, frame time, the JavaScript per frame, GPU time per pass (shadow map, world,
//            gun, post) by EXT_disjoint_timer_query, draws and triangles, memory
//   tree     the game's own JavaScript as a tree of timed calls: every method of the game and of every
//            object it holds (two levels down), wrapped without naming any of them by hand, plus each
//            render pass, the shadow map and the draw submission for each category of thing drawn
//   profile  a CPU sampling profile (CDP Profiler), mapped through the source maps and rolled up by
//            source file and by function, self and inclusive, so costs nobody named still show
//   trace    a Chrome trace of the renderer's main thread: script, GC, style, layout, paint, idle
//   cats     each category of thing drawn (the scene's parts as world.ts names them, else the field of
//            the game that holds it) left undrawn in turn, in the shadow map too: its GPU and CPU cost
//   settings shadows off / every frame / map sizes, resolutions, the colour grade, draw distance,
//            gun held, grass thinned or drawn nearer
//   hopper   the rifle's loose paintballs: the physics step on its own, standing, turning, walking,
//            firing and reloading, and drawing them
//   reload   page options that need a fresh load (?roofs=simple, ?squares=9)
//
//   cd web && npx vite build --minify false --sourcemap && node ../tools/framebudget.mjs --out ../out/fb
//     [--views a,b] [--phases base,tree,profile,trace,cats,settings,hopper,reload] [--throttle 1,4]
//     [--secs 3] [--reps 3] [--size 1920x1080] [--settings "shadows off,res 360 lines"]
//
// Each measurement is taken --reps times and the median kept. --throttle runs everything that
// concerns the CPU again with the page's CPU slowed that many times (Chrome's CPU throttling; the GPU
// can't be slowed). It waits for a quiet machine before each view. Writes <out>/budget.json; the
// report is made from that by tools/framebudget_report.mjs.
import { createRequire } from "module";
import fs from "fs";
import http from "http";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import { MUTED_ARGS, silence, silenceContext, silenceNote } from "./quiet-guard.mjs";

const WEB = new URL("../web/", import.meta.url).pathname;
const req = createRequire(WEB + "package.json");
const { chromium } = req("playwright");
const { SourceMapConsumer } = req("source-map-js");
const argv = process.argv.slice(2);
const opt = { dist: WEB + "dist", out: "fb", secs: "3", reps: "3", size: "1920x1080", views: "", phases: "census,base,tree,profile,trace,cats,settings,hopper,reload", throttle: "1,4" };
for (let i = 0; i < argv.length; i++) { const a = argv[i]; if (a.startsWith("--")) opt[a.slice(2)] = argv[++i]; }
const [W, H] = opt.size.split("x").map(Number);
const SECS = +opt.secs, REPS = +opt.reps, PHASES = new Set(opt.phases.split(",")), RATES = opt.throttle.split(",").map(Number);
fs.mkdirSync(opt.out, { recursive: true });

// east,north,bearing,tilt[,height above ground] as ?at=; move: m/s back and forth along the points
const VIEWS = {
  "combe-down": { at: "0,0,90,0", what: "Combe Down village street" },
  "abbey-yard": { at: "-1010,2105,90,0", what: "town centre, Abbey churchyard" },
  "milsom-street": { at: "-1165,2470,345,0", what: "Milsom Street, shops" },
  "park": { at: "-1940,2750,60,-3", what: "Royal Victoria Park lawns (grass)" },
  "paragon": { at: "-1040,2780,190,0", what: "The Paragon (A4), a busy main road" },
  "widcombe-hill": { at: "-200,1392,265,-3", what: "dense terraces on a hill" },
  "city-aerial": { at: "-950,1850,0,-20,80", what: "long view over the city from 80 m up" },
  "drive": { at: "0,0,0,0", move: { speed: 15, pts: [[0, 0], [154, 400]] }, what: "moving at car speed, Combe Down to Prior Park and back" },
};
const views = opt.views ? opt.views.split(",") : Object.keys(VIEWS);

const TYPES = { ".js": "text/javascript", ".html": "text/html", ".css": "text/css", ".json": "application/json", ".map": "application/json", ".wasm": "application/wasm" };
const server = http.createServer((q, res) => {
  let f = path.join(opt.dist, decodeURIComponent(q.url.split("?")[0]));
  if (f.endsWith("/")) f += "index.html";
  fs.readFile(f, (e, b) => { if (e) { res.statusCode = 404; return res.end(); } res.setHeader("content-type", TYPES[path.extname(f)] || "application/octet-stream"); res.end(b); });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

// ---- source maps: a function's place in the bundle back to its file and line in the source ----
const maps = new Map();
function origin(url, line, col) {
  const file = url.split("?")[0].split("/").pop();
  if (!file || !file.endsWith(".js")) return null;
  if (!maps.has(file)) {
    const p = path.join(opt.dist, "assets", file + ".map");
    maps.set(file, fs.existsSync(p) ? new SourceMapConsumer(JSON.parse(fs.readFileSync(p, "utf8"))) : null);
  }
  const m = maps.get(file);
  if (!m) return { src: file, line: line + 1 };
  const o = m.originalPositionFor({ line: line + 1, column: col });
  if (!o.source) return { src: file, line: line + 1 };
  return { src: o.source.replace(/^.*?node_modules\//, "node_modules/").replace(/^(\.\.\/)+/, "").replace(/^web\//, ""), line: o.line, name: o.name };
}

// ---- the machine must be quiet for numbers to mean anything ----
const busy = () => { try { return execSync("ps aux | grep -E 'mac_build|prep_tiles|prep_map|shoot.mjs|fpsprobe|devicematrix|spikeprobe' | grep -v grep | wc -l").toString().trim() !== "0"; } catch { return false; } };
const load = () => +os.loadavg()[0].toFixed(2);
async function waitQuiet() {
  for (let k = 0; busy() || load() > os.cpus().length * +(opt.quiet ?? 0.35); k++) {
    console.log(`  waiting for a quiet machine (load ${load()}, other jobs ${busy()})`);
    await new Promise((r) => setTimeout(r, 30000));
    if (k > 40) { console.log("  still busy after 20 min: carrying on, noted in the results"); return false; }
  }
  return true;
}

const browser = await chromium.launch({
  headless: true, channel: "chrome",
  args: [...MUTED_ARGS, "--disable-gpu-vsync", "--disable-frame-rate-limit", "--use-angle=metal", "--enable-gpu", "--enable-precise-memory-info", "--js-flags=--expose-gc"],
});
const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await silenceContext(context);
await context.addInitScript(() => {
  // the same random numbers every run, so traffic, naughty boys and cats start the same way
  let s = 0x2f6b9c1d;
  Math.random = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  // every animation-frame callback timed, by name: the whole of the page's JavaScript per frame
  const raf = window.requestAnimationFrame.bind(window);
  window.__raf0 = raf;
  const R = (window.__R = { on: false, frames: [], byCb: {}, cur: null, lastT: -1 });
  window.requestAnimationFrame = (cb) => raf((t) => {
    if (!R.on) return cb(t);
    const s = performance.now(); cb(t); const d = performance.now() - s;
    if (t !== R.lastT) { R.frames.push(0); R.lastT = t; }
    R.frames[R.frames.length - 1] += d;
    const k = cb.name || "(anonymous)"; R.byCb[k] = (R.byCb[k] ?? 0) + d;
  });
});
const page = await context.newPage();
await silence(page);
const complaints = [];
page.on("pageerror", (e) => complaints.push(e.message));
page.on("console", (m) => { if (m.type() === "error") complaints.push(m.text().slice(0, 200)); if (process.env.FB_DEBUG) console.log("console", m.type(), m.text().slice(0, 200)); });
const cdp = await context.newCDPSession(page);

async function startGame(extra = {}) {
  const v = VIEWS[views[0]];
  const q = new URLSearchParams({ map: "combe-down", time: "11:00", at: v.at, quality: "off", view: "900", ...extra });
  await page.goto(`http://127.0.0.1:${port}/?${q}`);
  await page.evaluate(() => { window.__budget = 40; });
  await page.waitForFunction(() => !document.getElementById("solo")?.disabled, null, { timeout: 240000 });
  // (a click that lands before the menu is wired up does nothing, so keep clicking until a game starts)
  const t0 = Date.now();
  for (let started = false; !started;) {
    await page.evaluate(() => { const fr = document.getElementById("menu-freeroam"); if (fr && !fr.checked) { fr.checked = true; fr.dispatchEvent(new Event("change")); } document.getElementById("solo").click(); });
    started = await page.waitForFunction(() => !!(window.__game && window.__game()), null, { polling: 500, timeout: 15000 }).then(() => true, () => false);
    if (!started && Date.now() - t0 > 300000) { console.log("the game didn't start:", complaints.slice(0, 10)); await page.screenshot({ path: path.join(opt.out, "nostart.png") }); throw new Error("no game"); }
  }
  await page.addStyleTag({ content: "#menu,#pause,.toast,#scoreboard{display:none!important}" });
  await page.evaluate(INSTALL);
}

// ---- what goes into the page once a game is running ----
function INSTALL() {
  const g = window.__game(), r = window.__renderer, gl = r.getContext();
  // the camera held at the view (or moved along it), after the game's own update so nothing else moves it
  const u = g.update.bind(g);
  window.__hold = true;
  const V = (window.__V = { at: "0,0,0,0", move: null, t0: 0, turn: 0, yaw: 0 });
  g.update = function update(dt) {
    if (!window.__hold) return u(dt);
    let [e, n, b = 0, t = 0, h = 1.7] = V.at.split(",").map(Number);
    if (V.move) {
      const { speed, pts } = V.move, segs = []; let L = 0;
      for (let i = 0; i < pts.length - 1; i++) { const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); segs.push({ a: pts[i], b: pts[i + 1], l, at: L }); L += l; }
      let s = ((performance.now() - V.t0) / 1000 * speed) % (2 * L); const back = s > L; if (back) s = 2 * L - s;
      const sg = segs.find((x) => s <= x.at + x.l) ?? segs[segs.length - 1], f = (s - sg.at) / sg.l;
      e = sg.a[0] + (sg.b[0] - sg.a[0]) * f; n = sg.a[1] + (sg.b[1] - sg.a[1]) * f;
      b = Math.atan2(sg.b[0] - sg.a[0], sg.b[1] - sg.a[1]) * 180 / Math.PI + (back ? 180 : 0);
    }
    V.yaw += V.turn * dt; b += V.yaw;
    const x = e, z = -n, m = g.map;
    g.player.pos.set(x, m.ground(x, z), z);
    u(dt);
    if (window.__calmOn) window.__calmOn();
    g.camera.position.set(x, m.ground(x, z) + h, z);
    g.camera.rotation.set(t * Math.PI / 180, -b * Math.PI / 180, 0, "YXZ");
    g.camera.updateMatrixWorld();
  };

  // ---- GPU time per pass: one timer query open at a time ----
  const tq = gl.getExtension("EXT_disjoint_timer_query_webgl2");
  const G = (window.__G = { on: !!tq, pending: [], open: null, frame: 0, done: [] });
  const seg = (label) => {
    if (!tq) return;
    if (G.open) { gl.endQuery(tq.TIME_ELAPSED_EXT); G.pending.push(G.open); G.open = null; }
    if (label) { const q = gl.createQuery(); gl.beginQuery(tq.TIME_ELAPSED_EXT, q); G.open = { q, label, f: G.frame }; }
  };
  const poll = () => {
    if (!tq) return;
    const disjoint = gl.getParameter(tq.GPU_DISJOINT_EXT), keep = [];
    for (const p of G.pending) {
      if (!gl.getQueryParameter(p.q, gl.QUERY_RESULT_AVAILABLE)) { keep.push(p); continue; }
      if (!disjoint) G.done.push([p.f, p.label, gl.getQueryParameter(p.q, gl.QUERY_RESULT) / 1e6]);
      gl.deleteQuery(p.q);
    }
    G.pending = keep;
  };
  const tick = () => { G.frame++; poll(); window.__raf0(tick); };
  window.__raf0(tick);

  // ---- the call tree: a stack of timed calls ----
  const P = (window.__P = { on: false, tree: {}, stack: [], wrapped: [] });
  const timed = (label, f) => {
    const w = function (...a) {
      if (!P.on) return f.apply(this, a);
      const parent = P.stack[P.stack.length - 1], key = parent ? parent.key + " > " + label : label;
      const fr = { key, child: 0 };
      P.stack.push(fr);
      const t0 = performance.now();
      try { return f.apply(this, a); } finally {
        const d = performance.now() - t0;
        P.stack.pop();
        const e = (P.tree[key] ??= { incl: 0, child: 0, n: 0 });
        e.incl += d; e.child += fr.child; e.n++;
        if (parent) parent.child += d;
      }
    };
    w.__orig = f;
    return w;
  };
  window.__timed = timed;

  // the render passes, the shadow map, and the scene's matrices, permanently (cheap when off)
  let inShadow = false, pass = "main";
  const sm = r.shadowMap, smr = sm.render.bind(sm);
  const smt = timed("shadow map (three)", smr);
  sm.render = (...a) => { inShadow = true; const was = G.open?.label; seg("shadow"); smt(...a); seg(was); inShadow = false; };
  const rr = r.render.bind(r);
  const passes = {};
  r.render = (scene, cam) => {
    const gm = window.__game();
    pass = scene === gm.world.scene ? "world" : scene === gm.weapon?.scene ? "gun" : "post";
    const f = (passes[pass] ??= timed(`render: ${pass} pass`, rr));
    seg(pass); f(scene, cam); seg(null);
  };
  const scene = g.world.scene, um = scene.updateMatrixWorld.bind(scene);
  scene.updateMatrixWorld = timed("scene matrices (three)", um);

  // ---- what a draw is of: the nearest named thing above it, else the field of the game holding it ----
  const owner = new Map();
  const top = (o) => { while (o.parent && o.parent !== scene) o = o.parent; return o.parent === scene ? o : null; };
  const label = () => {
    const seen = new Set();
    const dig = (v, k, d) => {
      if (!v || typeof v !== "object" || seen.has(v) || d > 4) return;
      seen.add(v);
      if (v.isObject3D) { const t = top(v); if (t && !t.name && !owner.has(t)) owner.set(t, k); return; }
      if (v.isMaterial || v.isBufferGeometry || v.isTexture || ArrayBuffer.isView(v) || v instanceof Node) return;
      const vals = v instanceof Map ? [...v.values()] : v instanceof Set ? [...v] : Array.isArray(v) ? v : Object.values(v);
      for (const x of vals.slice(0, 400)) dig(x, k, d + 1);
    };
    for (const [k, v] of Object.entries(g)) if (k !== "world" && k !== "map") dig(v, k, 0);
    for (const [k, v] of Object.entries(g.world)) if (k !== "scene") dig(v, "world." + k, 0);
  };
  window.__label = () => { owner.clear(); kinds = new WeakMap(); label(); };
  // --calm: only the scenery is drawn and nothing that walks or drives about is moved, so two builds
  // of the game can be compared without the people and traffic about differing from run to run
  const MARKS = new Set(["sky", "ground", "roads", "buildings", "walls-fences", "trees", "outskirts", "woods", "doors-bays", "landmarks-tunnels", "furniture", "shops", "pitches", "face-cells", "grass-build", "grass", "lamps", "field"]);
  const scenery = (c) => MARKS.has(c.name) || c.isLight || c.children.some((k) => MARKS.has(k.name) || k.children.some((j) => MARKS.has(j.name)));
  window.__stillAll = () => {
    label();
    const stilled = new Set();
    for (const c of scene.children) {
      if (scenery(c)) continue;
      const k = owner.get(c);
      if (k && !/^(player|weapon|world|map|camera|hud)/.test(k) && !stilled.has(k)) {
        const sys = k.split(".").reduce((o, f) => o?.[f], g);
        if (sys && typeof sys.update === "function") { sys.update = () => {}; stilled.add(k); }
      }
    }
    // (what those own is hidden; the squares, the sky and the light, which no system of the game owns, are left)
    window.__calmOn = () => { for (const c of scene.children) { const k = owner.get(c); if (k && (stilled.has(k) || /^(traffic|world\.vehicles|player)/.test(k)) && !scenery(c)) c.visible = false; } };
    return [...stilled];
  };
  let kinds = new WeakMap();
  const kind = (o, mat, geo) => {
    let k = kinds.get(o);
    if (k) return k;
    for (let p = o; p && !k; p = p.parent) if (p.name) k = p.name;
    if (!k) { const t = top(o); if (t && owner.has(t)) k = "game." + owner.get(t); }
    if (!k && pass === "gun") k = "gun (first person)";
    // (things added after world.ts named its parts, such as the grass cells made as you move, are
    // known by their material and their own vertex attributes, which say what they are)
    if (!k) { const own = Object.keys(geo?.attributes ?? {}).filter((a) => !/^(position|normal|uv|color|uv1|uv2)$/.test(a)); k = `unnamed ${o.isInstancedMesh ? "inst " : ""}${mat.type}${own.length ? " [" + own.join(",") + "]" : ""}`; }
    kinds.set(o, k);
    return k;
  };
  window.__label();
  // per frame: draws and triangles by pass and category; in the tree, the time to hand each over
  const S = (window.__S = { on: false, skip: null, skipObj: null, cats: {}, passes: {} });
  const rbd = r.renderBufferDirect.bind(r);
  r.renderBufferDirect = (cam, sc, geo, mat, obj, grp) => {
    if (!S.on && !S.skip && !S.skipObj && !P.on) return rbd(cam, sc, geo, mat, obj, grp);
    const k = pass === "gun" ? "gun: " + (obj.name || (obj.isInstancedMesh ? "inst " : "") + (mat.type ?? "")) : kind(obj, mat, geo);
    if (S.skip && (k === S.skip || (S.skip === "gun (all)" && pass === "gun"))) return;
    if (S.skipObj && obj === S.skipObj) return;
    if (S.on) {
      const n = geo.index ? geo.index.count : geo.attributes.position?.count ?? 0;
      const tris = (grp ? grp.count : n) / 3 * (obj.isInstancedMesh ? obj.count : 1);
      const ps = inShadow ? "shadow" : pass;
      const e = ((S.cats[k] ??= {})[ps] ??= [0, 0]); e[0]++; e[1] += tris;
      const p = (S.passes[ps] ??= [0, 0]); p[0]++; p[1] += tris;
    }
    if (!P.on) return rbd(cam, sc, geo, mat, obj, grp);
    const parent = P.stack[P.stack.length - 1], key = (parent ? parent.key + " > " : "") + "draw: " + k;
    const t0 = performance.now();
    rbd(cam, sc, geo, mat, obj, grp);
    const d = performance.now() - t0, e = (P.tree[key] ??= { incl: 0, child: 0, n: 0 });
    e.incl += d; e.n++; if (parent) parent.child += d;
  };

  // ---- every method of the game, and of everything it holds two levels down, timed ----
  const SKIP = /^(constructor|toString|toJSON|valueOf|hasOwnProperty)$/;
  const isThree = (o) => Object.keys(o).some((k) => /^is[A-Z]/.test(k) && o[k] === true) || o.isObject3D || o.isVector3 || o.isMaterial || o.isBufferGeometry;
  const methods = (o) => {
    const out = new Map();
    for (let p = o; p && p !== Object.prototype && p !== Function.prototype; p = Object.getPrototypeOf(p))
      for (const name of Object.getOwnPropertyNames(p)) {
        if (out.has(name) || SKIP.test(name)) continue;
        const d = Object.getOwnPropertyDescriptor(p, name);
        if (d && typeof d.value === "function" && !d.get && (p === o ? d.writable : true)) out.set(name, d.value);
      }
    return out;
  };
  window.__wrapAll = () => {
    if (P.wrapped.length) return P.wrapped.length;
    const seen = new Set([window, document]);
    const visit = (o, path, depth) => {
      if (!o || typeof o !== "object" || seen.has(o) || o instanceof Node || ArrayBuffer.isView(o) || Array.isArray(o) || o instanceof Map || o instanceof Set || o instanceof Promise) return;
      if (o !== g && isThree(o)) return;
      seen.add(o);
      for (const [name, f] of methods(o)) {
        if (f.__orig || (o === g && name === "update")) continue;
        const own = Object.prototype.hasOwnProperty.call(o, name);
        try { o[name] = timed(`${path}.${name}`, f); P.wrapped.push([o, name, own, f, `${path}.${name}`]); } catch { /* frozen */ }
      }
      if (depth >= 2) return;
      for (const [k, v] of Object.entries(o)) visit(v, path === "game" ? k : `${path}.${k}`, depth + 1);
    };
    visit(g, "game", 0);
    // (the world is a plain object of closures: its own functions are its methods)
    return P.wrapped.length;
  };
  // methods called so often that timing each call would cost more than they do are put back
  window.__unwrapHot = (perFrame, frames) => {
    const calls = {};
    for (const [key, e] of Object.entries(P.tree)) { const l = key.split(" > ").pop(); calls[l] = (calls[l] ?? 0) + e.n; }
    const before = P.wrapped.length;
    P.wrapped = P.wrapped.filter(([o, name, own, f, lbl]) => {
      if ((calls[lbl] ?? 0) / frames <= perFrame) return true;
      if (own) o[name] = f; else delete o[name];
      return false;
    });
    return before - P.wrapped.length;
  };
  window.__unwrapAll = () => { for (const [o, name, own, f] of P.wrapped) { if (own) o[name] = f; else delete o[name]; } P.wrapped = []; };
}

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
    return ++c.frames >= 12 && performance.now() - c.t > 1000;
  }, null, { timeout: 240000, polling: "raf" }).then(() => true, () => false);
}
async function setView(name) {
  const v = VIEWS[name];
  await page.evaluate(([at, move]) => { const V = window.__V; V.at = at; V.move = move; V.t0 = performance.now(); V.turn = 0; V.yaw = 0; }, [v.at, v.move ?? null]);
}

/** One measurement of secs: frame times, JS per frame, GPU per pass, draws per pass and category. */
async function measure(secs = SECS, { tree = false } = {}) {
  await page.evaluate((tree) => {
    const R = window.__R, S = window.__S, P = window.__P;
    R.frames = []; R.byCb = {}; R.on = true; S.cats = {}; S.passes = {}; S.on = true; window.__G.done = [];
    P.tree = {}; P.on = tree;
    window.__iv = []; let l = performance.now(); window.__t0 = l;
    const f = () => { if (!window.__iv) return; const n = performance.now(); window.__iv.push(n - l); l = n; window.__raf0(f); };
    window.__raf0(f);
  }, tree);
  await page.waitForTimeout(secs * 1000);
  return page.evaluate(() => {
    const R = window.__R, S = window.__S, P = window.__P;
    R.on = false; S.on = false; P.on = false;
    const iv = window.__iv.slice(2).sort((a, b) => a - b); window.__iv = null;
    const n = Math.max(1, iv.length), secs = (performance.now() - window.__t0) / 1000;
    const pc = (a, p) => +(a[Math.min(a.length - 1, Math.floor(a.length * p))] ?? 0).toFixed(2);
    const js = R.frames.slice(2).sort((a, b) => a - b), nf = Math.max(1, R.frames.length);
    const gp = {}, gf = {};
    for (const [f, label, ms] of window.__G.done) { gp[label] = (gp[label] ?? 0) + ms; gf[f] = (gf[f] ?? 0) + ms; }
    const gfa = Object.values(gf).sort((a, b) => a - b), gn = Math.max(1, gfa.length);
    const per = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Array.isArray(v) ? v.map((x) => +(x / nf).toFixed(1)) : Object.fromEntries(Object.entries(v).map(([p, w]) => [p, w.map((x) => +(x / nf).toFixed(1))]))]));
    const mean = iv.reduce((a, b) => a + b, 0) / n;
    const mem = window.__renderer.info.memory;
    return {
      fps: +(1000 / mean).toFixed(1), frameMs: +mean.toFixed(2), medMs: pc(iv, 0.5), p95Ms: pc(iv, 0.95), p99Ms: pc(iv, 0.99), worstMs: pc(iv, 1),
      over33: iv.filter((x) => x > 33.3).length, frames: iv.length, secs: +secs.toFixed(2),
      jsMs: +(js.reduce((a, b) => a + b, 0) / Math.max(1, js.length)).toFixed(2), jsP95: pc(js, 0.95),
      byCb: Object.fromEntries(Object.entries(R.byCb).map(([k, v]) => [k, +(v / nf).toFixed(3)])),
      gpuMs: +(gfa.reduce((a, b) => a + b, 0) / gn).toFixed(2), gpuP95: pc(gfa, 0.95),
      gpuPass: Object.fromEntries(Object.entries(gp).map(([k, v]) => [k, +(v / gn).toFixed(3)])),
      passes: per(S.passes), cats: per(S.cats),
      tree: Object.keys(P.tree).length ? Object.fromEntries(Object.entries(P.tree).map(([k, e]) => [k, { incl: +(e.incl / nf).toFixed(4), self: +((e.incl - e.child) / nf).toFixed(4), calls: +(e.n / nf).toFixed(2) }])) : undefined,
      heapMB: Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1e6), geometries: mem.geometries, textures: mem.textures, programs: window.__renderer.info.programs.length,
    };
  });
}
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : 0; };
/** reps measurements, the median of each number (and of each tree row, each pass), plus all the runs. */
async function measureN(opts = {}, reps = REPS) {
  const runs = [];
  for (let i = 0; i < reps; i++) { await page.waitForTimeout(400); runs.push(await measure(SECS, opts)); }
  const m = { ...runs[0] };
  for (const k of ["fps", "frameMs", "medMs", "p95Ms", "p99Ms", "worstMs", "jsMs", "jsP95", "gpuMs", "gpuP95", "heapMB", "over33"]) m[k] = median(runs.map((r) => r[k]));
  m.gpuPass = Object.fromEntries(Object.keys(runs[0].gpuPass).map((p) => [p, median(runs.map((r) => r.gpuPass[p] ?? 0))]));
  if (runs[0].tree) {
    const keys = new Set(runs.flatMap((r) => Object.keys(r.tree)));
    m.tree = Object.fromEntries([...keys].map((k) => [k, { incl: median(runs.map((r) => r.tree[k]?.incl ?? 0)), self: median(runs.map((r) => r.tree[k]?.self ?? 0)), calls: median(runs.map((r) => r.tree[k]?.calls ?? 0)) }]));
  }
  m.byCb = Object.fromEntries(Object.keys(runs[0].byCb).map((k) => [k, median(runs.map((r) => r.byCb[k] ?? 0))]));
  m.spread = { fps: runs.map((r) => r.fps), gpuMs: runs.map((r) => r.gpuMs), jsMs: runs.map((r) => r.jsMs) };
  return m;
}

/** A change measured against the game without it, taken in turns (without, with, without, with ...)
 *  so a drift in the machine's speed falls on both alike: the medians of each, and of the savings. */
const CAT_SECS = Math.max(1.5, SECS - 1);
async function paired(on, off, secs) {
  const A = [], Bs = [];
  for (let i = 0; i < REPS; i++) {
    await page.waitForTimeout(300); A.push(await measure(secs));
    await on(); await page.waitForTimeout(300); Bs.push(await measure(secs)); await off();
  }
  const pick = (r) => ({ fps: r.fps, frameMs: r.frameMs, jsMs: r.jsMs, gpuMs: r.gpuMs, gpuShadow: r.gpuPass.shadow ?? 0, gpuWorld: r.gpuPass.world ?? 0, gpuGun: r.gpuPass.gun ?? 0, gpuPost: r.gpuPass.post ?? 0, p95Ms: r.p95Ms, drawsWorld: r.passes.world?.[0] ?? 0, drawsShadow: r.passes.shadow?.[0] ?? 0 });
  const med = (rs) => { const ps = rs.map(pick); return Object.fromEntries(Object.keys(ps[0]).map((k) => [k, +median(ps.map((p) => p[k])).toFixed(3)])); };
  const saved = Object.fromEntries(Object.keys(pick(A[0])).map((k) => [k, +median(A.map((a, i) => pick(a)[k] - pick(Bs[i])[k])).toFixed(3)]));
  return { without: med(A), with: { ...med(Bs), gpuPass: Bs[Bs.length - 1].gpuPass }, saved };
}

// ---- the sampling profile, rolled up by source file and by function ----
async function profile(secs = SECS) {
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 100 });
  await cdp.send("Profiler.start");
  const t0 = Date.now();
  await page.waitForTimeout(secs * 1000);
  const { profile: pr } = await cdp.send("Profiler.stop");
  const wall = Date.now() - t0;
  const byId = new Map(pr.nodes.map((n) => [n.id, n])), parent = new Map();
  for (const n of pr.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const fnKey = new Map();
  const keyOf = (n) => {
    if (fnKey.has(n.id)) return fnKey.get(n.id);
    const f = n.callFrame, o = f.url ? origin(f.url, f.lineNumber, f.columnNumber) : null;
    const src = o ? o.src : f.functionName.startsWith("(") ? f.functionName : f.url ? f.url : "(native/browser)";
    const k = { fn: `${f.functionName || "(anon)"} ${o ? `${o.src}:${o.line}` : src}`, src };
    fnKey.set(n.id, k);
    return k;
  };
  const self = {}, selfSrc = {}, incl = {}, inclSrc = {};
  const dts = pr.timeDeltas ?? [];
  const total = dts.reduce((a, b) => a + b, 0) / 1000;
  pr.samples.forEach((id, i) => {
    const ms = (dts[i + 1] ?? dts[i] ?? 0) / 1000;
    const n = byId.get(id), k = keyOf(n);
    self[k.fn] = (self[k.fn] ?? 0) + ms; selfSrc[k.src] = (selfSrc[k.src] ?? 0) + ms;
    const seenF = new Set(), seenS = new Set();
    for (let x = id; x !== undefined; x = parent.get(x)) {
      const kk = keyOf(byId.get(x));
      if (!seenF.has(kk.fn)) { seenF.add(kk.fn); incl[kk.fn] = (incl[kk.fn] ?? 0) + ms; }
      if (!seenS.has(kk.src)) { seenS.add(kk.src); inclSrc[kk.src] = (inclSrc[kk.src] ?? 0) + ms; }
    }
  });
  const rank = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => [k, +(v / (wall / 1000)).toFixed(3)]);   // ms per second of wall time
  return { wallMs: wall, sampledMs: +total.toFixed(1), self: rank(self, 80), selfSrc: rank(selfSrc, 60), incl: rank(incl, 120), inclSrc: rank(inclSrc, 60) };
}

// ---- a trace of the renderer's main thread: script, GC, style, layout, paint, idle ----
async function trace(secs = 2) {
  const events = [];
  cdp.on("Tracing.dataCollected", (e) => events.push(...e.value));
  const done = new Promise((r) => cdp.once("Tracing.tracingComplete", r));
  await cdp.send("Tracing.start", { traceConfig: { includedCategories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "v8", "v8.execute", "disabled-by-default-v8.gc", "blink", "gpu", "cc", "viz"] }, transferMode: "ReportEvents" });
  await page.waitForTimeout(secs * 1000);
  await cdp.send("Tracing.end");
  await done;
  cdp.removeAllListeners("Tracing.dataCollected");
  const main = events.find((e) => e.name === "thread_name" && e.args?.name === "CrRendererMain");
  const gpuT = events.filter((e) => e.name === "thread_name" && /CrGpuMain|VizCompositorThread/.test(e.args?.name ?? ""));
  const sum = (pid, tid) => {
    const by = {};
    const open = [];
    let t0 = Infinity, t1 = 0, frames = 0;
    for (const e of events) {
      if (e.pid !== pid || e.tid !== tid) continue;
      if (e.ts) { t0 = Math.min(t0, e.ts); t1 = Math.max(t1, e.ts + (e.dur ?? 0)); }
      if (e.name === "FireAnimationFrame" && e.ph === "X") frames++;
      if (e.ph === "X" && e.dur) by[e.name] = (by[e.name] ?? 0) + e.dur / 1000;
      else if (e.ph === "B") open.push(e);
      else if (e.ph === "E") { const b = open.pop(); if (b) by[b.name] = (by[b.name] ?? 0) + (e.ts - b.ts) / 1000; }
    }
    return { spanMs: +((t1 - t0) / 1000).toFixed(1), frames, by: Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, v]) => [k, +v.toFixed(2)]) };
  };
  // only top-level events on the main thread add up to its busy time: RunTask is the scheduler's slice
  const m = main ? sum(main.pid, main.tid) : null;
  const gpu = gpuT.map((t) => ({ thread: t.args.name, ...sum(t.pid, t.tid) }));
  return { main: m, gpu, events: events.length };
}

const out = { started: new Date().toISOString(), size: opt.size, secs: SECS, reps: REPS, rates: RATES, host: { cpu: os.cpus()[0].model, cores: os.cpus().length, memGB: Math.round(os.totalmem() / 1e9) }, views: {}, loads: [] };
const outFile = path.join(opt.out, "budget.json");
const save = () => fs.writeFileSync(outFile, JSON.stringify(out, null, 1));

await waitQuiet();
await startGame();
out.renderer = await page.evaluate(() => { const gl = window.__renderer.getContext(); const i = gl.getExtension("WEBGL_debug_renderer_info"); return { gpu: gl.getParameter(i.UNMASKED_RENDERER_WEBGL), vendor: gl.getParameter(i.UNMASKED_VENDOR_WEBGL), timer: !!gl.getExtension("EXT_disjoint_timer_query_webgl2"), ua: navigator.userAgent, canvas: [window.__renderer.domElement.width, window.__renderer.domElement.height] }; });
console.log("renderer:", JSON.stringify(out.renderer));
console.log(await silenceNote(page));
await setv("set-shadows", true); await setv("set-res", 2); await setv("set-fx", true); await setv("set-view", 900);
if (opt.calm) { out.calm = await page.evaluate(() => window.__stillAll()); console.log("calm: stilled", out.calm.join(", ")); }
out.weapon = await page.evaluate(() => window.__game().weapon.kind);

// the tree's wrappers, calibrated once: anything called more than 200 times a frame is left alone
if (PHASES.has("tree")) {
  await setView(views[0]); await settle();
  const n = await page.evaluate(() => window.__wrapAll());
  const cal = await measure(2, { tree: true });
  const dropped = await page.evaluate(([f]) => window.__unwrapHot(200, f), [cal.frames]);
  out.wrapped = { methods: n, droppedHot: dropped };
  console.log(`tree: ${n} methods wrapped, ${dropped} put back as too hot to time`);
  await page.evaluate(() => window.__unwrapAll());
}

const SETTINGS = [
  ["shadows off", async () => setv("set-shadows", false)],
  ["shadows every frame", async () => page.evaluate(() => Object.defineProperty(window.__q, "shadowEvery", { get: () => 1, configurable: true }))],
  ["shadows every 4th frame", async () => page.evaluate(() => Object.defineProperty(window.__q, "shadowEvery", { get: () => 4, configurable: true }))],
  ["shadow map 1024", async () => page.evaluate(() => { const s = window.__game().world.sun.shadow; s.mapSize.set(1024, 1024); s.map?.dispose(); s.map = null; })],
  ["shadow map 4096", async () => page.evaluate(() => { const s = window.__game().world.sun.shadow; s.mapSize.set(4096, 4096); s.map?.dispose(); s.map = null; })],
  ["res 270 lines", async () => setv("set-res", 0)],
  ["res 360 lines", async () => setv("set-res", 1)],
  ["res 720 lines", async () => setv("set-res", 3)],
  ["res full (1080)", async () => setv("set-res", 4)],
  ["retro grade off", async () => setv("set-fx", false)],
  ["view 600 m", async () => { await setv("set-view", 600); await settle(); }],
  ["view 1200 m", async () => { await setv("set-view", 1200); await settle(); }],
  ["view 2000 m", async () => { await setv("set-view", 2000); await settle(); }],
  ["no gun drawn", async () => page.evaluate(() => { window.__S.skip = "gun (all)"; })],
  // nothing in your hands at all, as in a car or on a menu
  ["gun put away", async () => page.evaluate(() => { window.__game().weapon.scene.visible = false; })],
  ["fists", async () => page.evaluate(() => window.__game().weapon.select("fists"))],
  ["sniper", async () => page.evaluate(() => { const w = window.__game().weapon; w.giveSniper(); w.select("sniper"); })],
  ["grass half as thick", async () => page.evaluate(() => { window.__grassThin = 0.5; })],
  ["grass to 20 m", async () => page.evaluate(() => { window.__grassNear = 20; })],
  // every lit material loops over every light for each pixel or corner, lit or not (the lamps'
  // lights stay in the scene by day at nought brightness so nothing recompiles at dusk)
  ["point and spot lights out", async () => page.evaluate(() => { const sc = window.__game().world.scene; window.__lightsOff = []; sc.traverse((o) => { if ((o.isPointLight || o.isSpotLight) && o.visible) { o.visible = false; window.__lightsOff.push(o); } }); sc.traverse((o) => { for (const m of [].concat(o.material ?? [])) m.needsUpdate = true; }); })],
];
const CPU_SETTINGS = new Set(["shadows off", "shadows every frame", "view 600 m", "view 1200 m", "no gun drawn", "gun put away", "grass half as thick"]);
async function resetSettings() {
  await page.evaluate(() => {
    delete window.__q.shadowEvery; window.__S.skip = null; window.__S.skipObj = null;
    const s = window.__game().world.sun.shadow; if (s.mapSize.x !== 2048) { s.mapSize.set(2048, 2048); s.map?.dispose(); s.map = null; }
    window.__grassThin = 1; window.__grassNear = 0;
    if (window.__lightsOff?.length) { for (const l of window.__lightsOff) l.visible = true; window.__lightsOff = []; window.__game().world.scene.traverse((o) => { for (const m of [].concat(o.material ?? [])) m.needsUpdate = true; }); }
    const w = window.__game().weapon; if (w.kind !== "rifle") w.select("rifle");
    w.scene.visible = true;
  });
  await setv("set-shadows", true); await setv("set-res", 2); await setv("set-fx", true);
  const v = await page.evaluate(() => document.getElementById("set-view").value);
  if (v !== "900") { await setv("set-view", 900); await settle(); }
}
// grass thinned or drawn nearer, without touching the game: each grass cell's instance count cut, or
// cells further than r hidden, every frame (the game itself only touches them when you change cell)
await page.evaluate(() => {
  const scene = window.__game().world.scene;
  window.__grassThin = 1; window.__grassNear = 0;
  const cells = () => { const out = []; scene.traverse((o) => { if (o.isInstancedMesh && o.geometry.attributes.aFlower) out.push(o); }); return out; };
  const full = new WeakMap();
  let list = [], age = 0;
  const f = () => {
    if (window.__grassThin !== 1 || window.__grassNear || window.__grassWas) {
      const cam = window.__game().camera.position;
      if (age-- <= 0) { list = cells(); age = 30; }
      for (const m of list) {
        if (!full.has(m) || m.count > Math.ceil(full.get(m) * 0.99)) full.set(m, m.count);
        m.count = Math.round(full.get(m) * window.__grassThin);
        if (window.__grassNear) { m.geometry.boundingSphere ?? m.computeBoundingSphere(); const c = m.boundingSphere?.center; if (c) m.visible = Math.hypot(c.x - cam.x, c.z - cam.z) < window.__grassNear + 4; }
      }
      window.__grassWas = window.__grassThin !== 1 || !!window.__grassNear;
    }
    window.__raf0(f);
  };
  window.__raf0(f);
});

for (const name of views) {
  const v = VIEWS[name], R = (out.views[name] = { what: v.what, at: v.at, move: v.move ?? null });
  R.quiet = await waitQuiet(); R.loadBefore = load();
  await resetSettings();
  await setView(name);
  R.built = await settle();
  if (opt.calm) await page.evaluate(() => window.__stillAll());
  await page.evaluate(() => window.__label());
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(opt.out, `${name}.png`) }).catch(() => {});
  // what the scene holds, by category: three.js walks every object each frame (to place it and to
  // cull it), drawn or not, so the count of objects matters as well as the draws
  if (PHASES.has("census")) {
    R.census = await page.evaluate(() => {
      const g = window.__game(), scene = g.world.scene, by = {};
      const cat = (o) => { for (let p = o; p && p !== scene; p = p.parent) if (p.name) return p.name; return "(unnamed)"; };
      let objects = 0, autoMatrix = 0, visibleMeshes = 0, meshes = 0, lights = 0;
      const walk = (o, shown) => {
        objects++; shown = shown && o.visible;
        if (o.matrixAutoUpdate || o.matrixWorldAutoUpdate) autoMatrix++;
        if (o.isLight) lights++;
        if (o.isMesh || o.isLine || o.isPoints || o.isSprite) {
          meshes++; if (shown) visibleMeshes++;
          const k = cat(o), e = (by[k] ??= { meshes: 0, shown: 0, instances: 0 });
          e.meshes++; if (shown) e.shown++; if (o.isInstancedMesh) e.instances += o.count;
        }
        for (const c of o.children) walk(c, shown);
      };
      walk(scene, true);
      let t = performance.now(); for (let i = 0; i < 20; i++) scene.updateMatrixWorld(); const matrixMs = (performance.now() - t) / 20;
      const lightKinds = {}; scene.traverse((o) => { if (o.isLight) { const k = `${o.type}${o.visible ? "" : " (hidden)"}${o.castShadow ? " casting shadow" : ""}`; lightKinds[k] = (lightKinds[k] ?? 0) + 1; } });
      return { lightKinds, objects, meshes, visibleMeshes, autoMatrix, lights, topChildren: scene.children.length, matrixMs: +matrixMs.toFixed(3), by };
    });
    console.log(`${name} census: ${R.census.objects} objects, ${R.census.meshes} meshes (${R.census.visibleMeshes} visible), ${R.census.lights} lights, matrices ${R.census.matrixMs} ms`);
    save();
  }
  for (const rate of RATES) {
    const at = (R[`x${rate}`] = {});
    await cdp.send("Emulation.setCPUThrottlingRate", { rate });
    await page.waitForTimeout(800);
    if (PHASES.has("base")) { at.base = await measureN(); console.log(`${name} x${rate} base: ${at.base.fps} fps, frame ${at.base.frameMs} ms (p95 ${at.base.p95Ms}), js ${at.base.jsMs} ms, gpu ${at.base.gpuMs} ms ${JSON.stringify(at.base.gpuPass)}, draws ${JSON.stringify(at.base.passes)} | load ${load()}`); save(); }
    if (PHASES.has("tree")) {
      await page.evaluate(() => { window.__wrapAll(); });
      const cal = await measure(1.5, { tree: true });
      await page.evaluate(([f]) => window.__unwrapHot(200, f), [cal.frames]);
      at.tree = await measureN({ tree: true });
      await page.evaluate(() => window.__unwrapAll());
      console.log(`${name} x${rate} tree: js ${at.tree.jsMs} ms with timing on (vs ${at.base?.jsMs} off), ${Object.keys(at.tree.tree).length} rows`);
      save();
    }
    if (PHASES.has("profile")) { at.profile = await profile(Math.max(3, SECS)); console.log(`${name} x${rate} profile: top files ${at.profile.selfSrc.slice(0, 6).map(([k, v]) => `${k} ${v}`).join(", ")}`); save(); }
    if (PHASES.has("trace") && rate === RATES[0]) { at.trace = await trace(2); save(); }
    if (PHASES.has("cats") && rate === 1) {
      const all = Object.entries(at.base?.cats ?? (await measure(1)).cats).map(([k, p]) => [k, Object.values(p).reduce((a, x) => a + x[0], 0), Object.values(p).reduce((a, x) => a + x[1], 0)]);
      const cats = all.filter(([, c, t]) => c >= 0.5).sort((a, b) => b[1] - a[1]).filter(([, c, t], i) => i < +(opt.cats ?? 16) || t > 20000).map(([k]) => k);
      at.cats = {};
      for (const c of cats) {
        at.cats[c] = await paired(async () => page.evaluate((c) => { window.__S.skip = c; }, c), async () => page.evaluate(() => { window.__S.skip = null; }), CAT_SECS);
        const d = at.cats[c].saved;
        console.log(`  skip ${c}: saves gpu ${d.gpuMs} (shadow ${d.gpuShadow}), js ${d.jsMs}, frame ${d.frameMs} ms`);
        save();
      }
    }
    if (PHASES.has("settings")) {
      at.settings = {};
      for (const [label, fn] of SETTINGS) {
        if (rate !== 1 && !CPU_SETTINGS.has(label)) continue;
        if (opt.settings && !opt.settings.split(",").includes(label)) continue;
        at.settings[label] = await paired(async () => { await fn(); await page.waitForTimeout(800); }, async () => { await resetSettings(); await page.waitForTimeout(500); }, SECS);
        const m = at.settings[label].with, d = at.settings[label].saved;
        console.log(`  ${label}: ${m.fps} fps, frame ${m.frameMs}, js ${m.jsMs}, gpu ${m.gpuMs} ${JSON.stringify(m.gpuPass)} | saves frame ${d.frameMs}, js ${d.jsMs}, gpu ${d.gpuMs}`);
        save();
      }
    }
  }
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  R.loadAfter = load();
  out.loads.push([name, R.loadBefore, R.loadAfter]);
  save();
}

// ---- the rifle's hopper: its physics on its own, in each way the gun moves ----
if (PHASES.has("hopper")) {
  await resetSettings();
  await setView("combe-down"); await settle();
  const H = (out.hopper = {});
  await page.evaluate(() => {
    const w = window.__game().weapon, h = w.hopper, T = (window.__H = { update: 0, step: 0, steps: 0, n: 0, frames: 0, on: false });
    const up = h.update.bind(h), st = h.step.bind(h), shake = w.shakeHopper.bind(w);
    h.update = (...a) => { if (!T.on) return up(...a); const t = performance.now(); up(...a); T.update += performance.now() - t; T.n += h.n; T.frames++; };
    h.step = (...a) => { if (!T.on) return st(...a); const t = performance.now(); st(...a); T.step += performance.now() - t; T.steps++; };
    w.shakeHopper = (...a) => { if (!T.on) return shake(...a); const t = performance.now(); shake(...a); T.shake = (T.shake ?? 0) + performance.now() - t; };
    window.__hopperMesh = h.mesh;
  });
  const modes = {
    standing: async () => {},
    turning: async () => page.evaluate(() => { window.__V.turn = 120; }),
    walking: async () => page.evaluate(() => { window.__hold = false; }),
    running: async () => page.evaluate(() => { window.__hold = false; }),
    firing: async () => page.evaluate(() => { window.__fireT = setInterval(() => { const w = window.__game().weapon; if (w.rounds <= 0) w.startReload(); else if (w.canFire) w.fire(); }, 100); }),
  };
  for (const rate of RATES) {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate });
    for (const [mode, fn] of Object.entries(modes)) {
      await page.evaluate(() => { const w = window.__game().weapon; w.select("rifle"); w.ammo = 30; window.__hold = true; window.__V.turn = 0; });
      await fn();
      if (mode === "walking" || mode === "running") { if (mode === "running") await page.keyboard.down("ShiftLeft"); await page.keyboard.down("KeyW"); }
      await page.waitForTimeout(800);
      const res = [];
      for (let i = 0; i < REPS; i++) {
        await page.evaluate(() => { Object.assign(window.__H, { update: 0, step: 0, steps: 0, n: 0, frames: 0, shake: 0, on: true }); });
        const m = await measure(SECS, { tree: false });
        const h = await page.evaluate(() => { const T = window.__H; T.on = false; return { ...T }; });
        const f = Math.max(1, h.frames);
        const sp = await page.evaluate(() => window.__game().player.speed ?? 0);
        res.push({ playerSpeed: sp, fps: m.fps, jsMs: m.jsMs, frameMs: m.frameMs, gunGpu: m.gpuPass.gun ?? 0, updateMs: h.update / f, stepMs: h.step / f, shakeMs: (h.shake ?? 0) / f, stepsPerFrame: h.steps / f, balls: h.n / f, pairChecks: Math.round((h.n / f) * ((h.n / f) - 1) / 2 * 3 * (h.steps / f)) });
      }
      if (mode === "walking" || mode === "running") { await page.keyboard.up("KeyW"); await page.keyboard.up("ShiftLeft"); }
      await page.evaluate(() => { clearInterval(window.__fireT); window.__hold = true; window.__V.turn = 0; });
      const med = Object.fromEntries(Object.keys(res[0]).map((k) => [k, +median(res.map((r) => r[k])).toFixed(4)]));
      H[`x${rate} ${mode}`] = med;
      console.log(`hopper x${rate} ${mode}: ${JSON.stringify(med)}`);
    }
    // drawing it: the balls left undrawn, and the whole gun pass
    H[`x${rate} hopper balls not drawn`] = await paired(async () => page.evaluate(() => { window.__S.skipObj = window.__hopperMesh; }), async () => page.evaluate(() => { window.__S.skipObj = null; }), SECS);
    H[`x${rate} gun not drawn`] = await paired(async () => page.evaluate(() => { window.__S.skip = "gun (all)"; }), async () => page.evaluate(() => { window.__S.skip = null; }), SECS);
    save();
  }
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  await setView("combe-down"); await settle();
}

console.log(await silenceNote(page));
out.audio = await silenceNote(page);

// ---- options that need a fresh page ----
if (PHASES.has("reload")) {
  out.reload = {};
  for (const [label, extra] of [["?roofs=simple", { roofs: "simple" }], ["?squares=9", { squares: "9" }], ["default (reloaded)", {}]]) {
    await waitQuiet();
    await startGame(extra);
    await setv("set-shadows", true); await setv("set-res", 2); await setv("set-fx", true); await setv("set-view", 900);
    for (const name of ["abbey-yard", "milsom-street"].filter((v) => views.includes(v))) {
      await setView(name); await settle(); await page.waitForTimeout(1500);
      const m = await measureN();
      (out.reload[label] ??= {})[name] = m;
      console.log(`${label} ${name}: ${m.fps} fps, frame ${m.frameMs}, js ${m.jsMs}, gpu ${m.gpuMs}, draws ${JSON.stringify(m.passes)}`);
      save();
    }
    console.log(await silenceNote(page));
  }
}

out.complaints = [...new Set(complaints)].slice(0, 50);
out.finished = new Date().toISOString();
save();
await browser.close();
server.close();
console.log("wrote", outFile);
