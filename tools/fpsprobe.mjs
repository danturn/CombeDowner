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
const VARIANTS = ["base", "noshadow", "shadow1024", "nolights", "novillage", "res360", "res270", "view600", "pr1", "all"];
const spots = opt.spots ? opt.spots.split(",") : Object.keys(SPOTS);
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
  window.requestAnimationFrame = (cb) => raf((t) => { const s = performance.now(); cb(t); window.__js += performance.now() - s; });
}, !!opt.noaa);
const complaints = [];
page.on("pageerror", (e) => { complaints.push(`error: ${e.message}`); console.log("pageerror", e.message); });
page.on("console", (m) => { if (m.type() === "error") console.log("console", m.text().slice(0, 200)); });

const q = new URLSearchParams({ map: "combe-down", time: "11:00", at: SPOTS[spots[0]] });
await page.goto(`http://127.0.0.1:${port}/?${q}`);
await page.evaluate(() => { window.__budget = 40; try { localStorage.clear(); } catch {} });
await page.waitForFunction(() => window.__dbg !== undefined, null, { timeout: 180000 });
await page.waitForFunction(() => !document.getElementById("solo")?.disabled, null, { timeout: 180000 });
await page.evaluate(() => document.getElementById("solo").click());
await page.waitForFunction(() => window.__game && window.__game(), null, { timeout: 180000 });
await page.addStyleTag({ content: "#menu,#pause,.toast{display:none!important}" });
// hold the player and camera at the spot, and count what's drawn
await page.evaluate((at) => { window.__at = at; }, SPOTS[spots[0]]);
await page.evaluate(() => {
  const g = window.__game(), u = g.update.bind(g), r = window.__renderer;
  const S = (window.__S = { upd: 0, shadow: 0, render: 0, calls: 0, tris: 0, shCalls: 0, shTris: 0, frames: 0, kinds: {}, shKinds: {} });
  g.update = (dt) => {
    const at = window.__at, m = g.map, t0 = performance.now();
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
  if (v === "noshadow" || v === "all") await setv("set-shadows", false);
  if (v === "res360" || v === "all") await setv("set-res", 1);
  if (v === "res270") await setv("set-res", 0);
  if (v === "view600" || v === "all") await setv("set-view", 600);
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
    const top = (K) => Object.entries(K).sort((a, b) => b[1][0] - a[1][0]).slice(0, 12).map(([k, [c, t]]) => [k, +(c / n).toFixed(1), Math.round(t / n)]);
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
    await page.waitForTimeout(1200);
    const m = await measure();
    out.results[s][v] = m;
    console.log(`${s.padEnd(13)} ${v.padEnd(9)} ${String(m.fps).padStart(6)} fps  med ${m.medMs} p95 ${m.p95Ms} ms | js ${m.jsMs} (upd ${m.updMs}, shadow ${m.shadowMs}, draw ${m.renderMs}) | calls ${m.calls} + ${m.shCalls} shadow, tris ${Math.round(m.tris / 1000)}k + ${Math.round(m.shTris / 1000)}k`);
  }
  out.results[s].biggest = await page.evaluate(async () => { const S = window.__S; S.objs = {}; S.grab = true; await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); S.grab = false; return Object.values(S.objs).sort((a, b) => (b.tris + b.sh) - (a.tris + a.sh)).slice(0, 40); });
  await page.screenshot({ path: path.join(opt.out, `${s}.png`), timeout: 120000 }).catch(() => {});
}
out.complaints = [...new Set(complaints)];
fs.writeFileSync(path.join(opt.out, "probe.json"), JSON.stringify(out, null, 1));
await browser.close();
server.close();
