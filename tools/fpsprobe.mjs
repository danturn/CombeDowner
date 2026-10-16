// Where the frame time goes, for finding what's worth speeding up. It serves a built game
// (web/dist), starts a solo game in a muted headless Chrome (no sound can play, the mouse is never
// taken), stands at each spot, waits for the squares round it to be built, then measures a few
// seconds of frames with each setting changed in turn: frame rate (uncapped), the JavaScript time
// split into the game's update, the shadow map and the rest of drawing, draw calls and triangles,
// and which kinds of things the draw calls go on.
//
//   cd web && npx vite build && node ../tools/fpsprobe.mjs --out probe [--secs 4] [--size 1280x720] [--noaa]
//
// --noaa asks for a canvas without antialiasing (to see what that costs). Writes <out>/probe.json and prints a table.
// --route drives a fixed way from Combe Down into town and back at --speed m/s (20 by default) after
// the spots, with the game's own building budget, and reports the frame times on the move and how
// long each square took to set up and build (its longest single slice too). --spots none skips the spots.
import { createRequire } from "module";
import fs from "fs";
import http from "http";
import path from "path";

const WEB = new URL("../web/", import.meta.url).pathname;
const { chromium } = (() => {
  if (process.env.PW) return createRequire(import.meta.url)(process.env.PW);
  try { return createRequire(WEB + "package.json")("playwright"); } catch { return createRequire(import.meta.url)("playwright"); }
})();
const argv = process.argv.slice(2), opt = { dist: WEB + "dist", out: "probe", secs: "4", size: "1280x720", spots: "", variants: "" };
for (let i = 0; i < argv.length; i++) { const a = argv[i]; if (a === "--noaa") opt.noaa = true; else if (a.startsWith("--")) opt[a.slice(2)] = argv[++i]; }
const [W, H] = opt.size.split("x").map(Number);
fs.mkdirSync(opt.out, { recursive: true });

// east,north,bearing,tilt[,height] as ?at=
const SPOTS = {
  "abbey-yard": "-1010,2105,90,0",
  "roman-baths": "-990,2015,0,0",
  "grand-parade": "-930,2220,45,0",
  "southgate": "-961,1782,0,0",
  "prior-park": "154,400,180,-3",
  "combe-down": "0,0,90,0",
  "town-aerial": "-950,1850,0,-20,80",
};
// novillage: hide the village's whole-area merged meshes (each nearly 2 km across, so never culled), to
// see what cutting them into pieces the camera can cull would save out in town
const VARIANTS = ["base", "noshadow", "shadow2", "shadow1024", "nolights", "novillage", "res360", "res270", "view600", "view1200", "pr1", "all"];
const spots = opt.spots === "none" ? [] : opt.spots ? opt.spots.split(",") : Object.keys(SPOTS);
// east,north points of the drive: Combe Down, Prior Park, down to Southgate, the Abbey, Grand Parade
const ROUTE = [[0, 0], [154, 400], [-961, 1782], [-1010, 2105], [-930, 2220]];
const variants = opt.variants ? opt.variants.split(",") : VARIANTS;

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
  args: ["--mute-audio", "--disable-audio-output", "--disable-gpu-vsync", "--disable-frame-rate-limit",
    ...(linux ? ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
      : process.platform === "darwin" ? ["--use-angle=metal", "--enable-gpu"] : [])],
});
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.addInitScript((noaa) => {
  class Silent extends OfflineAudioContext {
    constructor() { super(2, 44100, 44100); }
    resume() { return Promise.resolve(); } suspend() { return Promise.resolve(); } close() { return Promise.resolve(); }
  }
  window.AudioContext = window.webkitAudioContext = Silent;
  HTMLMediaElement.prototype.play = () => Promise.resolve();
  if (window.speechSynthesis) window.speechSynthesis.speak = () => {};
  if (noaa) {
    const gc = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (t, a) { if (t === "webgl2" && this.id === "view") a = { ...(a || {}), antialias: false }; return gc.call(this, t, a); };
  }
  // time every animation frame's callback (the whole of the game's JavaScript for a frame)
  const raf = window.requestAnimationFrame.bind(window);
  window.__js = 0;
  window.__tileStats = {};   // (tiles.ts fills it in)
  window.requestAnimationFrame = (cb) => raf((t) => { const s = performance.now(); cb(t); const d = performance.now() - s; window.__js += d; window.__jsl?.push(d); });
}, !!opt.noaa);
const complaints = [];
page.on("pageerror", (e) => { complaints.push(`error: ${e.message}`); console.log("pageerror", e.message); });
page.on("console", (m) => { if (m.type() === "error") console.log("console", m.text().slice(0, 200)); });

const q = new URLSearchParams({ map: "combe-down", time: "11:00", at: SPOTS[spots[0] ?? "combe-down"] });
await page.goto(`http://127.0.0.1:${port}/?${q}`);
await page.evaluate(() => { window.__budget = 40; try { localStorage.clear(); } catch {} });
await page.waitForFunction(() => window.__dbg !== undefined, null, { timeout: 180000 });
await page.waitForFunction(() => !document.getElementById("solo")?.disabled, null, { timeout: 180000 });
await page.evaluate(() => document.getElementById("solo").click());
await page.waitForFunction(() => window.__game && window.__game(), null, { timeout: 180000 });
await page.addStyleTag({ content: "#menu,#pause,.toast{display:none!important}" });
// hold the player and camera at the spot, and count what's drawn
await page.evaluate((at) => { window.__at = at; }, SPOTS[spots[0] ?? "combe-down"]);
await page.evaluate(() => {
  const g = window.__game(), u = g.update.bind(g), r = window.__renderer;
  const S = (window.__S = { upd: 0, shadow: 0, render: 0, calls: 0, tris: 0, shCalls: 0, shTris: 0, frames: 0, kinds: {}, shKinds: {} });
  g.update = (dt) => {
    const at = window.__route ? window.__route.at() : window.__at, m = g.map, t0 = performance.now();
    const [e, n, b = 0, t = 0, h = 1.7] = at.split(",").map(Number), x = e, z = -n;
    g.player.pos.set(x, m.ground(x, z), z);
    u(dt);
    g.camera.position.set(x, m.ground(x, z) + h, z);
    g.camera.rotation.set(t * Math.PI / 180, -b * Math.PI / 180, 0, "YXZ");
    g.camera.updateMatrixWorld();
    S.upd += performance.now() - t0; S.frames++;
  };
  let inShadow = false;
  const sm = r.shadowMap, smr = sm.render.bind(sm);
  sm.render = (...a) => { const t0 = performance.now(); inShadow = true; smr(...a); inShadow = false; S.shadow += performance.now() - t0; };
  const rr = r.render.bind(r);
  r.render = (...a) => { const t0 = performance.now(); rr(...a); S.render += performance.now() - t0; };
  const rbd = r.renderBufferDirect.bind(r);
  // what a draw is of: the nearest named thing above it, else its material's type
  const kind = (o, mat) => {
    for (let p = o; p; p = p.parent) if (p.name) return p.name;
    return `${o.isInstancedMesh ? "inst " : ""}${mat.type}${mat.map ? "+map" : ""}`;
  };
  r.renderBufferDirect = (cam, scene, geo, mat, obj, grp) => {
    const n = geo.index ? geo.index.count : geo.attributes.position?.count ?? 0;
    const inst = obj.isInstancedMesh ? obj.count : 1;
    const tris = (grp ? grp.count : n) / 3 * inst;
    if (S.census && !inShadow) { let top = obj; while (top.parent && top.parent.parent) top = top.parent; const k = `${geo.type}|${mat.type}${mat.color ? " #" + mat.color.getHexString() : ""}|top ${top.name || top.type}(${top.children.length})${obj.isInstancedMesh ? "|inst" : ""}`; S.groups[k] = (S.groups[k] ?? 0) + 1; }
    if (S.grab) { const e = (S.objs[obj.uuid] ??= { tris: 0, sh: 0, calls: 0, mat: mat.type + (mat.map ? "+map" : "") + (mat.color ? " #" + mat.color.getHexString() : ""), inst: obj.isInstancedMesh ? obj.count : 0, r: Math.round(geo.boundingSphere?.radius ?? -1), d: Math.round(obj.getWorldPosition ? Math.hypot(obj.matrixWorld.elements[12] + (geo.boundingSphere?.center.x ?? 0) - cam.position.x, obj.matrixWorld.elements[14] + (geo.boundingSphere?.center.z ?? 0) - cam.position.z) : -1), depth: (() => { let n = 0; for (let p = obj.parent; p; p = p.parent) n++; return n; })(), tag: obj.userData?.tag ?? obj.parent?.userData?.tag ?? "" }); if (inShadow) e.sh += tris; else { e.tris += tris; e.calls++; } }
    const k = kind(obj, mat), K = inShadow ? S.shKinds : S.kinds;
    const e = (K[k] ??= [0, 0]); e[0]++; e[1] += tris;
    if (inShadow) { S.shCalls++; S.shTris += tris; } else { S.calls++; S.tris += tris; }
    return rbd(cam, scene, geo, mat, obj, grp);
  };
});

const setv = (id, v) => page.evaluate(([id, v]) => {
  const el = document.getElementById(id);
  if (el.type === "checkbox") el.checked = v; else el.value = String(v);
  el.dispatchEvent(new Event("change"));
}, [id, v]);
async function apply(v) {
  // back to the defaults first
  await setv("set-shadows", true); await setv("set-res", 2); await setv("set-view", 900);
  await page.evaluate(() => { const r = window.__renderer; r.setPixelRatio(Math.min(devicePixelRatio, 1.75)); dispatchEvent(new Event("resize")); lights(true); function lights(on) { window.__game().world.scene.traverse((o) => { if ((o.isPointLight || o.isSpotLight)) o.visible = on; }); window.__game().world.scene.traverse((o) => { const m = o.material; if (m) for (const x of [].concat(m)) x.needsUpdate = true; }); } window.__lights = lights; });
  await page.evaluate((v) => {
    const w = window.__game().world, sun = w.sun, size = v === "shadow1024" ? 1024 : 2048;
    if (sun.shadow.mapSize.x !== size) { sun.shadow.mapSize.set(size, size); sun.shadow.map?.dispose(); sun.shadow.map = null; }
    // (layers rather than visible, which the distance culler keeps setting)
    for (const o of w.scene.children) if (o.isMesh && o.material?.type === "MeshLambertMaterial" && o.geometry?.boundingSphere?.radius > 1500) o.layers.mask = v === "novillage" ? 0 : 1;
  }, v);
  // shadow2: the shadow map redrawn every other frame instead of every frame
  await page.evaluate((on) => {
    const sm = window.__renderer.shadowMap;
    window.__sh0 ??= sm.autoUpdate;   // the game's own setting, put back for the other variants
    window.__sh2 = on; sm.autoUpdate = on ? false : window.__sh0; sm.needsUpdate = true;
    if (on && !window.__sh2loop) { window.__sh2loop = true; let k = 0; const f = () => { if (window.__sh2) { if (++k % 2) sm.needsUpdate = true; } requestAnimationFrame(f); }; requestAnimationFrame(f); }
  }, v === "shadow2");
  if (v === "noshadow" || v === "all") await setv("set-shadows", false);
  if (v === "res360" || v === "all") await setv("set-res", 1);
  if (v === "res270") await setv("set-res", 0);
  if (v === "all") await setv("set-view", 600);
  // viewNNNN: that draw distance, metres (view600, view3000, view6000 ...)
  if (/^view\d+$/.test(v)) await setv("set-view", +v.slice(4));
  if (v === "pr1") await page.evaluate(() => { window.__renderer.setPixelRatio(1); dispatchEvent(new Event("resize")); });
  if (v === "nolights" || v === "all") await page.evaluate(() => window.__lights(false));
}
async function settle() {
  await page.evaluate(() => { window.__calm = null; });
  return page.waitForFunction(() => {
    if (window.__tilesPending !== 0) { window.__calm = null; return false; }
    const c = (window.__calm ??= { frames: 0, t: performance.now() });
    return ++c.frames >= 12 && performance.now() - c.t > 800;
  }, null, { timeout: 120000, polling: "raf" }).then(() => true, () => false);
}
async function measure() {
  await page.evaluate(() => { const S = window.__S; for (const k of ["upd", "shadow", "render", "calls", "tris", "shCalls", "shTris", "frames"]) S[k] = 0; S.kinds = {}; S.shKinds = {}; window.__js = 0; window.__t0 = performance.now(); window.__iv = []; let l = performance.now(); const f = () => { if (!window.__iv) return; const n = performance.now(); window.__iv.push(n - l); l = n; requestAnimationFrame(f); }; requestAnimationFrame(f); });
  await page.waitForTimeout(+opt.secs * 1000);
  return page.evaluate(() => {
    const S = window.__S, n = Math.max(1, S.frames), secs = (performance.now() - window.__t0) / 1000;
    const iv = window.__iv.slice(1).sort((a, b) => a - b); window.__iv = null;
    const top = (K) => Object.entries(K).sort((a, b) => b[1][0] - a[1][0]).slice(0, 20).map(([k, [c, t]]) => [k, +(c / n).toFixed(1), Math.round(t / n)]);
    return {
      fps: +(S.frames / secs).toFixed(1), medMs: +iv[Math.floor(iv.length / 2)]?.toFixed(1), p95Ms: +iv[Math.floor(iv.length * 0.95)]?.toFixed(1),
      jsMs: +(window.__js / n).toFixed(2), updMs: +(S.upd / n).toFixed(2), shadowMs: +(S.shadow / n).toFixed(2), renderMs: +((S.render - S.shadow) / n).toFixed(2),
      calls: Math.round(S.calls / n), tris: Math.round(S.tris / n), shCalls: Math.round(S.shCalls / n), shTris: Math.round(S.shTris / n),
      progs: window.__renderer.info.programs.length, top: top(S.kinds), shTop: top(S.shKinds),
    };
  });
}

const out = { started: new Date().toISOString(), size: opt.size, noaa: !!opt.noaa, ua: await page.evaluate(() => navigator.userAgent), results: {} };
for (const s of spots) {
  await page.evaluate((at) => { window.__at = at; }, SPOTS[s]);
  await apply("base");
  const ready = await settle();
  out.results[s] = { ready };
  for (const v of variants) {
    await apply(v);
    // a longer draw distance has more squares to build first: wait for them, and say how long they took
    const t0 = Date.now(), long = /^view\d+$/.test(v) && +v.slice(4) > 900;
    const built = long ? await settle() : true, loadS = +((Date.now() - t0) / 1000).toFixed(1);
    await page.waitForTimeout(1200);
    const m = await measure();
    if (long) Object.assign(m, { built, loadS });
    m.heapMB = await page.evaluate(() => Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1e6));
    m.gpuMB = await page.evaluate(() => { const i = window.__renderer.info.memory; return { geometries: i.geometries, textures: i.textures }; });
    out.results[s][v] = m;
    console.log(`${s.padEnd(13)} ${v.padEnd(9)} ${String(m.fps).padStart(6)} fps  med ${m.medMs} p95 ${m.p95Ms} ms | js ${m.jsMs} (upd ${m.updMs}, shadow ${m.shadowMs}, draw ${m.renderMs}) | calls ${m.calls} + ${m.shCalls} shadow, tris ${Math.round(m.tris / 1000)}k + ${Math.round(m.shTris / 1000)}k | heap ${m.heapMB} MB, ${m.gpuMB.geometries} geoms${m.loadS !== undefined ? ` | built in ${m.loadS} s${m.built ? "" : " (NOT all built)"}` : ""}`);
    if (v === "base") { console.log("   draws by kind (calls, ktris):", m.top.map(([k, c, t]) => `${k} ${c}/${Math.round(t / 1000)}`).join(", ")); console.log("   shadow draws by kind:", m.shTop.map(([k, c, t]) => `${k} ${c}/${Math.round(t / 1000)}`).join(", ")); }
  }
  out.results[s].biggest = await page.evaluate(async () => { const S = window.__S; S.objs = {}; S.grab = true; await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); S.grab = false; return Object.values(S.objs).sort((a, b) => (b.tris + b.sh) - (a.tris + a.sh)).slice(0, 40); });
  // what the draws are of, what's in the scene, and what keeping its positions up to date costs each frame
  out.results[s].census = await page.evaluate(async () => {
    const S = window.__S; S.groups = {}; S.census = true;
    await new Promise((r) => requestAnimationFrame(r)); S.census = false;
    const scene = window.__game().world.scene;
    const c = { objects: 0, meshes: 0, shownMeshes: 0, autoMatrix: 0, lights: 0, groupsTop: 0 };
    const walk = (o, shown) => { c.objects++; shown = shown && o.visible; if (o.isMesh) { c.meshes++; if (shown) c.shownMeshes++; } if (o.matrixAutoUpdate) c.autoMatrix++; if (o.isLight) c.lights++; for (const k of o.children) walk(k, shown); };
    walk(scene, true); c.groupsTop = scene.children.length;
    let t = performance.now(); for (let i = 0; i < 20; i++) scene.updateMatrixWorld(); c.matrixMs = +((performance.now() - t) / 20).toFixed(3);
    c.draws = Object.entries(S.groups).sort((a, b) => b[1] - a[1]).slice(0, 40);
    return c;
  });
  { const c = out.results[s].census; console.log(`${s} census: ${c.objects} objects, ${c.meshes} meshes (${c.shownMeshes} shown), ${c.autoMatrix} with auto matrices, ${c.lights} lights, matrix update ${c.matrixMs} ms`); for (const [k, n] of c.draws.slice(0, 25)) console.log(`   ${String(n).padStart(4)}  ${k}`); }
  await page.screenshot({ path: path.join(opt.out, `${s}.png`), timeout: 120000 }).catch(() => {});
}
if (opt.route) {
  const speed = +(opt.speed ?? 20);
  // how long the browser takes to read a square's file (on the main thread, outside the building budget)
  out.parse = await page.evaluate(async () => {
    const r = [];
    for (const k of ["0_0", "-1_2", "-2_2", "1_4"]) {
      const txt = await (await fetch(`maps/combe-down/${k}.json`)).text().catch(() => "");
      if (!txt) continue;
      const t0 = performance.now(); JSON.parse(txt); r.push({ square: k, mb: +(txt.length / 1e6).toFixed(2), parseMs: +(performance.now() - t0).toFixed(1) });
    }
    return r;
  });
  console.log("reading a square's file:", out.parse.map((p) => `${p.square} ${p.mb} MB in ${p.parseMs} ms`).join(", "));
  out.route = {};
  for (const dir of ["out", "back"]) {
    const pts = dir === "out" ? ROUTE : [...ROUTE].reverse();
    // stand at the start until everything round it is built (quickly), then drive with the game's own budget
    await page.evaluate((p) => { window.__route = null; window.__at = `${p[0]},${p[1]},0,0`; window.__budget = 40; }, pts[0]);
    await apply("base");
    await settle();
    const res = await page.evaluate(([pts, speed]) => new Promise((done) => {
      delete window.__budget;
      const segs = []; let L = 0;
      for (let i = 0; i < pts.length - 1; i++) { const [a, b] = [pts[i], pts[i + 1]], l = Math.hypot(b[0] - a[0], b[1] - a[1]); segs.push({ a, b, l, at: L }); L += l; }
      const t0 = performance.now();
      window.__route = { at() {
        const s = Math.min(L, (performance.now() - t0) / 1000 * speed), g = segs.find((g) => s <= g.at + g.l) ?? segs[segs.length - 1], f = (s - g.at) / g.l;
        const e = g.a[0] + (g.b[0] - g.a[0]) * f, n = g.a[1] + (g.b[1] - g.a[1]) * f;
        return `${e},${n},${Math.atan2(g.b[0] - g.a[0], g.b[1] - g.a[1]) * 180 / Math.PI},0`;
      } };
      window.__tileStats = {};
      const S = window.__S; S.upd = 0; S.frames = 0;
      window.__jsl = []; const iv = []; let last = performance.now();
      const f = () => {
        const n = performance.now(); iv.push(n - last); last = n;
        if ((n - t0) / 1000 * speed < L) return requestAnimationFrame(f);
        const js = window.__jsl; window.__jsl = null;
        const srt = [...iv].sort((a, b) => a - b), q = (p) => +srt[Math.min(srt.length - 1, Math.floor(srt.length * p))].toFixed(1);
        const jsr = [...js].sort((a, b) => a - b), qj = (p) => +jsr[Math.min(jsr.length - 1, Math.floor(jsr.length * p))].toFixed(1);
        const secs = (n - t0) / 1000;
        done({ metres: Math.round(L), secs: +secs.toFixed(1), fps: +(iv.length / secs).toFixed(1), med: q(0.5), p95: q(0.95), p99: q(0.99), worst: q(1),
          over17: iv.filter((x) => x > 16.7).length, over33: iv.filter((x) => x > 33.3).length, frames: iv.length,
          jsMed: qj(0.5), jsP95: qj(0.95), jsP99: qj(0.99), updMs: +(S.upd / Math.max(1, S.frames)).toFixed(2), squares: window.__tileStats });
      };
      requestAnimationFrame(f);
    }), [pts, speed]);
    await page.evaluate(() => { window.__route = null; });
    out.route[dir] = res;
    const sq = Object.entries(res.squares);
    console.log(`route ${dir} ${res.metres} m at ${speed} m/s: ${res.fps} fps, frame med ${res.med} p95 ${res.p95} p99 ${res.p99} worst ${res.worst} ms, ${res.over17} frames over 16.7 ms and ${res.over33} over 33 ms of ${res.frames}; js med ${res.jsMed} p95 ${res.jsP95} p99 ${res.jsP99} ms`);
    for (const [k, e] of sq) console.log(`   square ${k.padEnd(6)} made ${e.made.toFixed(1)} ms, setup ${e.setup.toFixed(1)} ms (longest slice ${e.setupMax.toFixed(1)}), build ${e.build.toFixed(1)} ms (longest slice ${e.buildMax.toFixed(1)}), ${e.slices} slices`);
  }
}
out.complaints = [...new Set(complaints)];
fs.writeFileSync(path.join(opt.out, "probe.json"), JSON.stringify(out, null, 1));
await browser.close();
server.close();
