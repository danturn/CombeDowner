// Puts the Flag Lads' banner outside pubs across Bath in a muted, headless solo game and measures
// whether each cable tie is inside a tree crown or hidden from the streets round it.
//   node tools/banner_probe.mjs [--dist web/dist] [--n 14] [--shots dir]
// Takes an even sample of the game\'s pubs. Prints one line per pub and a total.
import { createRequire } from "module";
import fs from "fs";
import http from "http";
import path from "path";
import { MUTED_ARGS, silence, silenceContext, silenceNote } from "./quiet-guard.mjs";

const WEB = new URL("../web/", import.meta.url).pathname;
const { chromium } = createRequire(WEB + "package.json")("playwright");
const argv = process.argv.slice(2), opt = { dist: WEB + "dist", n: "14" };
if (argv.includes("--trees")) { opt.trees = true; argv.splice(argv.indexOf("--trees"), 1); }
for (let i = 0; i < argv.length; i++) { if (argv[i].startsWith("--")) opt[argv[i].slice(2)] = argv[++i]; }
let pubs = [];
if (opt.shots) fs.mkdirSync(opt.shots, { recursive: true });

const TYPES = { ".js": "text/javascript", ".html": "text/html", ".css": "text/css", ".json": "application/json", ".wasm": "application/wasm" };
const server = http.createServer((q, res) => {
  let f = path.join(opt.dist, decodeURIComponent(q.url.split("?")[0]));
  if (f.endsWith("/")) f += "index.html";
  fs.readFile(f, (e, b) => { if (e) { res.statusCode = 404; return res.end(); } res.setHeader("content-type", TYPES[path.extname(f)] || "application/octet-stream"); res.end(b); });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await chromium.launch({ headless: true, channel: "chrome", args: [...MUTED_ARGS, "--use-angle=metal", "--enable-gpu"] });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await silenceContext(context);
const page = await context.newPage();
await silence(page);
page.on("pageerror", (e) => console.log("page error:", e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/?map=combe-down&time=11:00&fx=0`);
await page.waitForFunction(() => !document.getElementById("solo")?.disabled, null, { timeout: 120000 });
await page.evaluate(() => document.getElementById("solo").click());
await page.waitForFunction(() => window.__game && window.__game(), null, { timeout: 120000 });
await page.addStyleTag({ content: "#menu,#hud,.toast,#pause,#debug,#touch{display:none!important}" });

{
  const all = await page.evaluate(() => { const g = window.__game(); return g.pubList.filter((q) => g.map.fieldEdge(q.x, q.z) > 1).map((q) => ["", q.name, q.x, q.z]); });
  if (opt.trees) {
    // a stress test: banners asked for right beside big trees, across Bath
    const ts = await page.evaluate((n) => {
      const g = window.__game(), out = [];
      let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      const all = g.map.areas().flatMap((a) => a.d.tr.filter((t) => t[3] > 0.9 && g.map.fieldEdge(t[0], -t[1]) > 20 && !g.map.indoors(t[0], -t[1])));
      for (let i = 0; i < n && all.length; i++) { const t = all.splice(Math.floor(rnd() * all.length), 1)[0]; out.push(["", `Tree ${i}`, t[0] + 1.5, -t[1]]); }
      return out;
    }, Number(opt.n));
    pubs = ts;
  } else {
  const step = Math.max(1, Math.floor(all.length / Number(opt.n)));
  pubs = all.filter((_, i) => i % step === 0).slice(0, Number(opt.n));
  }
}
let totalCrown = 0, totalHidden = 0, totalTies = 0;
for (const [tile, name, x, z] of pubs) {
  const r = await page.evaluate(async ([x, z, name]) => {
    const g = window.__game(), m = g.map, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    g.alive = true;
    g.player.pos.set(x, m.ground(x, z), z);
    const t0 = Date.now();
    while (!m.detailedAt(x, z) && Date.now() - t0 < 40000) { g.player.pos.set(x, m.ground(x, z), z); await sleep(200); }
    g.player.pos.set(x, m.ground(x, z), z);
    await sleep(800);
    g.scars.add("pub", x, z, `${name}|Gaffer`);
    const s = g.scars.list[g.scars.list.length - 1];
    let v = null;
    for (let i = 0; i < 100 && !v; i++) { g.player.pos.set(x, m.ground(x, z), z); await sleep(100); v = g.scars.views.get(s.id); }
    if (!v && m.detailedAt(x, z)) { g.scars.build(s); v = g.scars.views.get(s.id); }
    if (!v) return { err: `not built detailed=${m.detailedAt(x, z)} list=${g.scars.list.length} host=${g.isHost} me=${JSON.stringify(g.scars.w.me())}` };
    // an independent check: trees as drawn, and every street point within 30 m
    const crowns = [], streets = [];
    for (const a of m.areas()) {
      for (const [tx, ty, tz, sc] of a.d.tr) if (Math.abs(tx - x) < 60 && Math.abs(-ty - z) < 60) crowns.push([tx, tz - a.z0 + 4.9 * sc, -ty, 2.8 * sc]);
      for (const rd of a.d.rd) for (let k = 0; k < rd.p.length - 1; k++) {
        const [ax, ay] = rd.p[k], [bx, by] = rd.p[k + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 2));
        for (let q = 0; q <= n; q++) { const px = ax + (bx - ax) * q / n, pz = -(ay + (by - ay) * q / n); if (Math.hypot(px - s.x, pz - s.z) < 30) streets.push([px, pz]); }
      }
    }
    const seg = (a, b, c) => { const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l2 = d[0] ** 2 + d[1] ** 2 + d[2] ** 2 || 1, t = Math.max(0, Math.min(1, ((c[0] - a[0]) * d[0] + (c[1] - a[1]) * d[1] + (c[2] - a[2]) * d[2]) / l2)); return Math.hypot(a[0] + d[0] * t - c[0], a[1] + d[1] * t - c[1], a[2] + d[2] * t - c[2]) < c[3]; };
    let inCrown = 0, hidden = 0;
    for (const t of v.tgts) {
      if (crowns.some((c) => Math.hypot(t.x - c[0], t.y - c[1], t.z - c[2]) < c[3])) inCrown++;
      let seen = false;
      for (const [sx, sz] of streets) {
        const d0 = Math.hypot(sx - t.x, sz - t.z);
        if (d0 < 3 || d0 > 30) continue;
        const e = [sx, m.ground(sx, sz) + 1.6, sz], dx = t.x - e[0], dy = t.y - e[1], dz = t.z - e[2], dist = Math.hypot(dx, dy, dz);
        const hit = m.raycast(e[0], e[1], e[2], dx / dist, dy / dist, dz / dist, dist);
        if ((hit && hit.dist < dist - 0.4) || crowns.some((c) => seg(e, [t.x, t.y, t.z], c))) continue;
        seen = true; break;
      }
      if (!seen) hidden++;
    }
    const b = v.g.position;
    return { n: v.tgts.length, inCrown, hidden, moved: Math.round(Math.hypot(b.x - s.x, b.z - s.z)), yawd: v.g.rotation.y * 180 / Math.PI, yaw: Math.round(v.g.rotation.y * 180 / Math.PI), at: [b.x, b.z, b.y], streets: streets.length };
  }, [x, z, name]);
  if (r.err) { console.log(`${tile} ${name}: ${r.err}`); continue; }
  totalCrown += r.inCrown; totalHidden += r.hidden; totalTies += r.n;
  console.log(`${name.padEnd(28)} ${tile.padEnd(9)} ties ${r.n}  in crown ${r.inCrown}  hidden ${r.hidden}  moved ${r.moved} m  yaw ${r.yaw}  streets ${r.streets}`);
  if (opt.shots) {
    await page.evaluate(([bx, bz, yaw]) => {
      const g = window.__game(), m = g.map, a = yaw * Math.PI / 180;
      if (!g.__held) {
        g.__held = true;
        const u = g.update.bind(g);
        g.update = (dt) => {
          const c = window.__cam;
          if (!c) return u(dt);
          g.player.pos.set(c.x, m.ground(c.x, c.z), c.z);
          u(dt);
          g.camera.position.set(c.x, m.ground(c.x, c.z) + 1.7, c.z);
          g.camera.lookAt(c.lx, m.ground(c.lx, c.lz) + 5.6, c.lz);
          g.camera.updateMatrixWorld();
          if (g.weapon) g.weapon.scene.visible = false;
        };
      }
      window.__cam = { x: bx + Math.sin(a) * 14, z: bz + Math.cos(a) * 14, lx: bx, lz: bz };
    }, [r.at[0], r.at[1], r.yawd]);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(opt.shots, `${name.replace(/\W+/g, "_")}.png`) });
  }
}
console.log(`TOTAL ties ${totalTies}  in crown ${totalCrown}  hidden ${totalHidden}`);
console.log(await silenceNote(page));
await browser.close(); server.close();
