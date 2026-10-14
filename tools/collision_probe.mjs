// A check on the set pieces' collision (landmarks/setpieces.ts): does every surface the game draws
// for a set piece have something under it to stand on, at the height it's drawn? It serves a built
// game (web/dist) to a muted headless Chrome that can't make a sound or take the mouse (as
// tools/shoot.mjs does), starts a solo game, and at each set piece:
// - lays a grid over it and, for every point, finds the surfaces the model draws there (looking
//   straight down through its triangles) and what the game would stand you on at each of them
//   (map.floor). A drawn surface facing up, with room to stand over it, that you'd sink more than
//   0.4 m into, or drop straight through, is a hole; holes are gathered into patches, biggest first;
// - drops the player onto the biggest patches from a metre above, with the real movement code;
// - walks the player along a few set routes (the Roman Baths' floors, Prior Park's roof), logging
//   their height, the ground's and the floor's under them every frame;
// - and shoots each patch and each walk's start from just above.
//
//   cd web && npx vite build --logLevel error && cd .. && node tools/collision_probe.mjs --out probe
//   node tools/collision_probe.mjs --out probe --only baths,priorpark
//
// Writes <out>/report.txt (the holes, set piece by set piece, with a ?at= for each), <out>/probe.json
// (everything, walks and drops frame by frame) and <out>/*.png.
import { createRequire } from "module";
import fs from "fs";
import http from "http";
import path from "path";

const WEB = new URL("../web/", import.meta.url).pathname;
const { chromium } = (() => {
  if (process.env.PW) return createRequire(import.meta.url)(process.env.PW);
  try { return createRequire(WEB + "package.json")("playwright"); } catch { return createRequire(import.meta.url)("playwright"); }
})();

const argv = process.argv.slice(2), opt = { dist: WEB + "dist", out: "probe", map: "combe-down", only: "", timeout: "90" };
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) opt[argv[i].slice(2)] = argv[++i];
fs.mkdirSync(opt.out, { recursive: true });

// The set pieces (setpieces.ts): kind, where (longitude, latitude, bearing), how far round its origin
// to look, and the walks: [name, start x, z in its frame, height above its origin, heading in its
// frame (degrees from its +x towards its +z), metres].
const PIECES = [
  { kind: "baths", at: [-2.359472, 51.380958, 73.6], r: 60, walks: [
    ["baths-court-north", -18, -12, 0, 0, 8], ["baths-into-pool", -5, -11.5, 0, 90, 6], ["baths-terrace", -15, -12.5, 4.4, 0, 8],
    ["baths-concert-room", 0, -33, 3.2, 90, 12], ["baths-stairs-up", -20.75, -1.2, 0, -90, 7], ["baths-court-east", 11.5, -12, 0, 90, 12],
  ] },
  { kind: "priorpark", at: [-2.3429515, 51.364536, 249.9], r: 170, walks: [
    ["prior-roof-along", -15, 0, 12.2, 0, 20], ["prior-roof-across", 0, -8, 12.2, 90, 16], ["prior-portico", 0, 12, 0.1, -90, 4],
  ] },
  { kind: "abbey", at: [-2.358847, 51.3814293, 82.4], r: 45 },
  { kind: "pulteney", at: [-2.357923, 51.38304, 60], r: 35 },
  { kind: "terraces", at: [-2.3561904, 51.3836327, 57.3], r: 320 },
  { kind: "colonnade", at: [-2.3581902, 51.3828459, 143.4], r: 90 },
  { kind: "sham", at: [-2.3375197, 51.3823083, 199.6], r: 25 },
  { kind: "holburne", at: [-2.3508842, 51.3857945, 147.3], r: 30 },
  { kind: "kingswood", at: [-2.3698235, 51.3988271, 333.7], r: 150 },
].filter((p) => !opt.only || opt.only.split(",").includes(p.kind));

// ---- serve the built game, and a muted headless Chrome (as tools/shoot.mjs) ---------------------
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
const bundled = linux && fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : null;
const exe = process.env.CHROME || bundled;
const browser = await chromium.launch({
  headless: true,
  ...(exe ? { executablePath: exe } : { channel: "chrome" }),
  args: ["--mute-audio", "--disable-audio-output",
    ...(linux ? ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
      : process.platform === "darwin" ? ["--use-angle=metal", "--enable-gpu"] : [])],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
await page.addInitScript(() => {
  class Silent extends OfflineAudioContext {
    constructor() { super(2, 44100, 44100); }
    resume() { return Promise.resolve(); }
    suspend() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
  }
  window.AudioContext = window.webkitAudioContext = Silent;
  HTMLMediaElement.prototype.play = () => Promise.resolve();
  if (window.speechSynthesis) window.speechSynthesis.speak = () => {};
});
const complaints = [];
page.on("pageerror", (e) => complaints.push(`error: ${e.message}`));

const out = { started: new Date().toISOString(), pieces: [] };
const report = [];
try {
  await page.goto(`http://127.0.0.1:${port}/?map=${opt.map}&time=11:00&fx=0`);
  await page.evaluate(() => { window.__budget = 40; });
  await page.waitForFunction(() => !document.getElementById("solo")?.disabled, null, { timeout: 120000 });
  await page.evaluate(() => document.getElementById("solo").click());
  await page.waitForFunction(() => window.__game && window.__game() && window.__game().map, null, { timeout: 120000 });
  await page.addStyleTag({ content: "#menu,#hud,.toast,#pause,#debug,#touch{display:none!important}" });
  // park the player where we're looking (so the squares round it load), and hold the camera there
  await page.evaluate(() => {
    const g = window.__game(), u = g.update.bind(g);
    g.update = (dt) => {
      const p = window.__park;
      if (p) { g.player.pos.set(p[0], p[1], p[2]); g.player.vel.set(0, 0, 0); }
      u(dt);
      const c = window.__cam;
      if (c) { g.camera.position.set(c[0], c[1], c[2]); g.camera.rotation.set(c[4], c[3], 0, "YXZ"); g.camera.updateMatrixWorld(); }
      if (g.weapon) g.weapon.scene.visible = false;
    };
  });

  for (const P of PIECES) {
    const t0 = Date.now();
    // the piece's frame, in scene coordinates, and park there till the squares round it are built
    const frame = await page.evaluate((P) => {
      const g = window.__game(), m = g.map, [lon0, lat0] = m.d.centre;
      const kx = 111320 * Math.cos((lat0 * Math.PI) / 180), ky = 110574;
      const ox = (P.at[0] - lon0) * kx, oy = (P.at[1] - lat0) * ky, a = ((90 - P.at[2]) * Math.PI) / 180;
      window.__park = [ox, m.ground(ox, -oy) + 300, -oy];
      window.__cam = [ox, m.ground(ox, -oy) + 60, -oy + 60, 0, -0.75];
      return { ox, oy, a };
    }, P);
    const ready = await settle();
    const res = await page.evaluate(({ P, F }) => {
      const g = window.__game(), m = g.map, scene = g.world.scene;
      const ux = Math.cos(F.a), uy = Math.sin(F.a);
      // its frame (x along it, z out of its front) to scene x, z
      const sx = (lx, lz) => F.ox + ux * lx + uy * lz, sz = (lx, lz) => -(F.oy + uy * lx - ux * lz);
      const lxOf = (x, z) => (x - F.ox) * ux + (-z - F.oy) * uy, lzOf = (x, z) => (x - F.ox) * uy - (-z - F.oy) * ux;
      // the set piece's own objects: those standing at its origin, turned its way
      const objs = [];
      scene.traverse((o) => { if (Math.abs(o.position.x - F.ox) < 0.05 && Math.abs(o.position.z + F.oy) < 0.05 && Math.abs(o.rotation.y - F.a) < 1e-3 && o.children.length) objs.push(o); });
      const y0 = objs.length ? objs[0].position.y : m.ground(F.ox, -F.oy);
      // a grid round the origin, in scene x, z
      const step = P.r > 100 ? 1 : 0.5, n = Math.ceil((2 * P.r) / step), gx0 = F.ox - P.r, gz0 = -F.oy - P.r;
      const cells = new Map();   // cell -> [height, up?, colour][]
      const mul = (a, b) => { const r = new Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; r[i * 4 + j] = s; } return r; };
      let tris = 0;
      const raster = (mesh, M) => {
        const geo = mesh.geometry, pos = geo.attributes?.position;
        if (!pos) return;
        const idx = geo.index?.array, nt = (idx ? idx.length : pos.count) / 3, col = mesh.material?.color?.getHexString?.() ?? "?";
        const T = (i) => { const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i); return [M[0] * x + M[4] * y + M[8] * z + M[12], M[1] * x + M[5] * y + M[9] * z + M[13], M[2] * x + M[6] * y + M[10] * z + M[14]]; };
        for (let t = 0; t < nt; t++) {
          const a = T(idx ? idx[3 * t] : 3 * t), b = T(idx ? idx[3 * t + 1] : 3 * t + 1), c = T(idx ? idx[3 * t + 2] : 3 * t + 2);
          // facing: the triangle's normal's upward part (wound anticlockwise from outside)
          const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
          const nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0], nl = Math.hypot(nx, ny, nz) || 1;
          if (Math.abs(ny / nl) < 0.2) continue;   // a wall: looking straight down never lands on it
          tris++;
          const i0 = Math.max(0, Math.ceil((Math.min(a[0], b[0], c[0]) - gx0) / step - 0.5)), i1 = Math.min(n - 1, Math.floor((Math.max(a[0], b[0], c[0]) - gx0) / step - 0.5));
          const j0 = Math.max(0, Math.ceil((Math.min(a[2], b[2], c[2]) - gz0) / step - 0.5)), j1 = Math.min(n - 1, Math.floor((Math.max(a[2], b[2], c[2]) - gz0) / step - 0.5));
          const d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
          if (Math.abs(d) < 1e-9) continue;
          for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
            const x = gx0 + (i + 0.5) * step, z = gz0 + (j + 0.5) * step;
            const w1 = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / d, w2 = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / d, w3 = 1 - w1 - w2;
            if (w1 < -1e-6 || w2 < -1e-6 || w3 < -1e-6) continue;
            const k = j * n + i;
            let L = cells.get(k); if (!L) cells.set(k, L = []);
            L.push([w1 * a[1] + w2 * b[1] + w3 * c[1], ny > 0, col]);
          }
        }
      };
      for (const o of objs) {
        o.updateMatrixWorld(true);
        o.traverse((mesh) => {
          if (!mesh.isMesh || !mesh.visible) return;
          const W = mesh.matrixWorld.elements;
          if (mesh.isInstancedMesh) {
            const A = mesh.instanceMatrix.array;
            for (let q = 0; q < mesh.count; q++) raster(mesh, mul(W, Array.from(A.slice(16 * q, 16 * q + 16))));
          } else raster(mesh, W);
        });
      }
      // every surface facing up with room to stand over it (1.8 m), and what the game stands you on there
      const WATER = new Set(["5d8f62"]);
      const hole = new Map(), stats = { surfaces: 0, holes: 0, water: 0, air: 0 };
      for (const [k, L] of cells) {
        const i = k % n, j = Math.floor(k / n), x = gx0 + (i + 0.5) * step, z = gz0 + (j + 0.5) * step;
        L.sort((p, q) => p[0] - q[0]);
        let topDrawn = -Infinity;
        for (let s = 0; s < L.length; s++) {
          const [h, up, col] = L[s];
          topDrawn = Math.max(topDrawn, h);
          if (!up) continue;
          let room = Infinity;
          for (let t = s + 1; t < L.length; t++) if (L[t][0] > h + 0.05) { room = L[t][0] - h; break; }
          if (room < 1.8) continue;
          if (WATER.has(col)) { stats.water++; continue; }
          stats.surfaces++;
          const f = m.floor(x, z, h + 0.05);
          if (f < h - 0.4) {
            stats.holes++;
            const prev = hole.get(k);
            if (!prev || h > prev.h) hole.set(k, { h, f, col });
          }
        }
        // standing on air: the game's floor from high above, well over anything drawn there (or the ground)
        const fTop = m.floor(x, z, 1e4);
        if (fTop > Math.max(topDrawn, m.ground(x, z)) + 0.5) stats.air++;
      }
      // patches of holes (neighbouring cells within 1 m of each other's height)
      const seen = new Set(), patches = [];
      for (const [k, H] of hole) {
        if (seen.has(k)) continue;
        const stack = [k], cs = []; seen.add(k);
        while (stack.length) {
          const c = stack.pop(), hc = hole.get(c); cs.push(c);
          const i = c % n, j = Math.floor(c / n);
          for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const q = (j + dj) * n + (i + di), hq = hole.get(q);
            if (hq && !seen.has(q) && Math.abs(hq.h - hc.h) < 1) { seen.add(q); stack.push(q); }
          }
        }
        let sx_ = 0, sz_ = 0, hs = 0, fs = 0, best = null, bd = Infinity;
        for (const c of cs) { const i = c % n, j = Math.floor(c / n), h = hole.get(c); sx_ += gx0 + (i + 0.5) * step; sz_ += gz0 + (j + 0.5) * step; hs += h.h; fs += h.f; }
        const cx = sx_ / cs.length, cz = sz_ / cs.length;
        for (const c of cs) { const i = c % n, j = Math.floor(c / n), d = Math.hypot(gx0 + (i + 0.5) * step - cx, gz0 + (j + 0.5) * step - cz); if (d < bd) { bd = d; best = c; } }
        const bi = best % n, bj = Math.floor(best / n), bx = gx0 + (bi + 0.5) * step, bz = gz0 + (bj + 0.5) * step, bh = hole.get(best);
        patches.push({ area: +(cs.length * step * step).toFixed(1), drawn: +(hs / cs.length - y0).toFixed(2), standsOn: +(fs / cs.length - y0).toFixed(2), colour: bh.col,
          at: { x: +bx.toFixed(1), z: +bz.toFixed(1), h: bh.h, lx: +lxOf(bx, bz).toFixed(1), lz: +lzOf(bx, bz).toFixed(1) } });
      }
      patches.sort((p, q) => q.area - p.area);
      // a map of it, in its own frame (x across, z down), a character a metre: # a hole, . stands, space nothing drawn
      const rows = [];
      const R = Math.min(P.r, 90);
      for (let lz = -R; lz <= R; lz += 1) {
        let row = "";
        for (let lx = -R; lx <= R; lx += 1) {
          const x = sx(lx, lz), z = sz(lx, lz), i = Math.floor((x - gx0) / step), j = Math.floor((z - gz0) / step), k = j * n + i;
          row += hole.has(k) ? "#" : cells.get(k)?.some((s) => s[1]) ? "." : " ";
        }
        rows.push(row.replace(/\s+$/, ""));
      }
      while (rows.length && !rows[0]) rows.shift();
      while (rows.length && !rows[rows.length - 1]) rows.pop();
      return { kind: P.kind, objects: objs.length, triangles: tris, y0: +y0.toFixed(2), origin: { east: +F.ox.toFixed(1), north: +F.oy.toFixed(1) }, stats, patches: patches.slice(0, 40), map: rows.join("\n") };
    }, { P, F: frame });
    res.ready = ready;

    // drop the player onto the biggest patches, and walk the routes, with the real movement code
    const sim = await page.evaluate(({ P, F, patches, y0 }) => {
      const g = window.__game(), m = g.map, pl = g.player, ux = Math.cos(F.a), uy = Math.sin(F.a);
      const sx = (lx, lz) => F.ox + ux * lx + uy * lz, sz = (lx, lz) => -(F.oy + uy * lx - ux * lz);
      const lxOf = (x, z) => (x - F.ox) * ux + (-z - F.oy) * uy, lzOf = (x, z) => (x - F.ox) * uy - (-z - F.oy) * ux;
      const keep = { park: window.__park };
      const run = (x, y, z, yaw, walk, secs, dt) => {
        pl.pos.set(x, y, z); pl.vel.set(0, 0, 0); pl.onGround = false; pl.keys.clear(); pl.yaw = yaw; pl.sprinting = false;
        if (walk) pl.keys.add("KeyW");
        const log = [];
        for (let i = 0; i < secs / dt; i++) {
          pl.update(dt, true);
          const p = pl.pos;
          log.push([+(i * dt).toFixed(3), +lxOf(p.x, p.z).toFixed(2), +lzOf(p.x, p.z).toFixed(2), +(p.y - y0).toFixed(2), +(m.ground(p.x, p.z) - y0).toFixed(2), +(m.floor(p.x, p.z, p.y + 0.3) - y0).toFixed(2), pl.onGround ? 1 : 0]);
        }
        return log;
      };
      const drops = patches.slice(0, 8).map((p) => {
        const log = run(p.at.x, p.at.h + 1, p.at.z, 0, false, 2, 1 / 60);
        return { patch: p, landed: log[log.length - 1][3], drawn: +(p.at.h - y0).toFixed(2) };
      });
      const walks = (P.walks ?? []).map(([name, lx, lz, h, head, metres]) => {
        // yaw: the game's 0 looks north (-z), turning left as yaw grows; face the heading in the piece's frame
        const hx = Math.cos((head * Math.PI) / 180), hz = Math.sin((head * Math.PI) / 180);
        const dx = sx(lx + hx, lz + hz) - sx(lx, lz), dz = sz(lx + hx, lz + hz) - sz(lx, lz), yaw = Math.atan2(-dx, -dz);
        const x = sx(lx, lz), z = sz(lx, lz), secs = metres / 4.5;
        const at60 = run(x, y0 + h + 0.05, z, yaw, true, secs, 1 / 60);
        const at30 = run(x, y0 + h + 0.05, z, yaw, true, secs, 1 / 30);
        const lowest = (log) => log.reduce((a, r) => Math.min(a, r[3]), Infinity);
        return { name, start: [lx, lz, h], heading: head, lowest60: lowest(at60), lowest30: lowest(at30), end60: at60[at60.length - 1], at60, at30, x, z, yaw };
      });
      window.__park = keep.park;
      return { drops, walks };
    }, { P, F: frame, patches: res.patches, y0: res.y0 });

    // pictures: each walk's start, and the biggest patches, from a few metres up and back
    const shots = [];
    const shoot = async (name, x, y, z, yaw, pitch) => {
      await page.evaluate(([x, y, z, yaw, pitch]) => { window.__park = [x, y + 40, z]; window.__cam = [x, y, z, yaw, pitch]; }, [x, y, z, yaw, pitch]);
      const ok = await settle();
      const file = path.join(opt.out, `${name}.png`);
      await page.screenshot({ path: file });
      shots.push({ name, file, ready: ok });
    };
    for (const w of sim.walks) await shoot(w.name, w.x + 4 * Math.sin(w.yaw), res.y0 + w.start[2] + 5, w.z + 4 * Math.cos(w.yaw), w.yaw, -0.6);
    for (const [i, p] of res.patches.slice(0, 4).entries()) await shoot(`${P.kind}-hole-${i + 1}`, p.at.x, p.at.h + 7, p.at.z + 6, 0, -0.85);
    out.pieces.push({ ...res, ...sim, shots, seconds: (Date.now() - t0) / 1000 });

    const r = report;
    r.push(`==== ${P.kind}: origin east ${res.origin.east}, north ${res.origin.north}, at ${res.y0} m in the scene; ${res.objects} objects, ${res.triangles} faces looked at${ready ? "" : " (NOT fully loaded)"}`);
    r.push(`surfaces to stand on: ${res.stats.surfaces} cells; holes: ${res.stats.holes}; water: ${res.stats.water}; floor over nothing drawn: ${res.stats.air}`);
    for (const p of res.patches.slice(0, 15)) r.push(`  hole ${String(p.area).padStart(7)} m2: drawn ${p.drawn} m, stands you on ${p.standsOn} m (frame x ${p.at.lx}, z ${p.at.lz}; colour ${p.colour}) ?at=${(p.at.x).toFixed(1)},${(-p.at.z).toFixed(1)},0,-30`);
    for (const d of sim.drops) r.push(`  drop on hole at frame x ${d.patch.at.lx}, z ${d.patch.at.lz}: drawn ${d.drawn}, landed ${d.landed}`);
    for (const w of sim.walks) r.push(`  walk ${w.name}: from ${w.start.join(",")} heading ${w.heading}: lowest ${w.lowest60} (60 fps), ${w.lowest30} (30 fps); ended at x ${w.end60[1]}, z ${w.end60[2]}, height ${w.end60[3]}`);
    r.push(res.map, "");
    fs.writeFileSync(path.join(opt.out, "report.txt"), report.join("\n"));
    console.log(`${P.kind}: ${res.stats.holes} hole cells in ${res.patches.length} patches (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  }
} finally {
  out.complaints = [...new Set(complaints)].slice(0, 50);
  fs.writeFileSync(path.join(opt.out, "probe.json"), JSON.stringify(out));
  fs.writeFileSync(path.join(opt.out, "report.txt"), report.join("\n"));
  await browser.close();
  server.close();
}

async function settle() {
  await page.evaluate(() => { window.__calm = null; });
  return page.waitForFunction(() => {
    const p = window.__tilesPending;
    if (p !== 0) { window.__calm = null; return false; }
    const c = (window.__calm ??= { frames: 0, t: performance.now() });
    return ++c.frames >= 12 && performance.now() - c.t > 500;
  }, null, { timeout: +opt.timeout * 1000, polling: "raf" }).then(() => true, () => false);
}
