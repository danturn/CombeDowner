// Does a station platform's side stop you? Walks the player into it from the track, with the
// game's own movement code, and reports whether they were held outside or ended up on top.
//
// The first version of this test asked map.collide() to push a point that it had placed 0.6 m
// *inside* the platform ring: a point further from every edge than its own radius has nothing to
// push it, so "it didn't move" meant nothing at all. This walks instead: the player starts on the
// track beside a platform edge, is walked straight at it for a few seconds, and if they end up
// inside the ring they went through the side.
//
//   node tools/quiet.mjs -- node tools/platform_probe.mjs --dist web/dist --station "Bath Spa"
//
// Options: --dist, --station, --map, --time, --secs (how long to walk, default 3), --out (a
// report.txt and probe.json; skipped if not given). Run it under tools/quiet.mjs: it opens the game.
//
// Exits 1 if the player ended up inside the platform, so it works as a check.
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

const argv = process.argv.slice(2);
const opt = { dist: WEB + "dist", station: "Bath Spa", map: "combe-down", time: "11:00", secs: "3", out: "" };
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) opt[argv[i].slice(2)] = argv[++i];
if (opt.out) fs.mkdirSync(opt.out, { recursive: true });

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
  headless: true, channel: "chrome",
  args: [...MUTED_ARGS,
    ...(linux ? ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
      : process.platform === "darwin" ? ["--use-angle=metal", "--enable-gpu"] : [])],
});
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
await silence(page);
const complaints = [];
page.on("pageerror", (e) => complaints.push(`error: ${e.message}`));

const q = new URLSearchParams({ map: opt.map });
if (opt.time !== "now") q.set("time", opt.time);
await page.goto(`http://127.0.0.1:${port}/?${q}`);
await page.evaluate(() => { window.__budget = 40; });
await page.waitForFunction(() => !document.getElementById("solo")?.disabled, null, { timeout: 120000 });
await page.evaluate(() => document.getElementById("solo").click());
await page.waitForFunction(() => window.__game && window.__game(), null, { timeout: 120000 });

const res = await page.evaluate(([station, secs]) => {
  const g = window.__game(), m = g.map, pl = g.player, rail = g.world?.railway ?? g.railway;
  if (!rail) return { err: "no railway on the game" };
  const plats = (rail.plat ?? []).filter((p) => p.n === station);
  if (!plats.length) return { err: `no platforms at ${station}` };

  /** Is (x, z) inside this ring? Ray casting in the ring's own (x, north) space. */
  const inside = (ring, x, z) => {
    let hit = false;
    const yy = -z;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > yy) !== (yj > yy) && x < ((xj - xi) * (yy - yi)) / (yj - yi || 1e-9) + xi) hit = !hit;
    }
    return hit;
  };
  /** Every point of a ring, with its distance from (x, z) in scene space. */
  const nearest = (ring, x, z) => {
    let bd = Infinity, bx = 0, bz = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const ax = ring[j][0], ay = ring[j][1], bx2 = ring[i][0], by2 = ring[i][1];
      const vx = bx2 - ax, vy = by2 - ay, l2 = vx * vx + vy * vy || 1;
      const t = Math.min(1, Math.max(0, ((x - ax) * vx + (-z - ay) * vy) / l2));
      const px = ax + vx * t, py = ay + vy * t;
      const d = Math.hypot(x - px, -z - py);
      if (d < bd) { bd = d; bx = px; bz = -py; }
    }
    return { d: bd, x: bx, z: bz };
  };

  const walks = [];
  for (const p of plats) {
    const ring = p.r;
    // Sample a dozen points round the ring, and keep the ones whose outward side is open track:
    // there the player can stand beside the platform at its foot, which is the approach to test.
    const step = Math.max(1, Math.floor(ring.length / 12));
    for (let i = 0; i < ring.length; i += step) {
      const ax = ring[i][0], ay = ring[i][1], bx = ring[(i + step) % ring.length][0], by = ring[(i + step) % ring.length][1];
      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      // the ring's centroid, so "outward" is away from it
      let cx = 0, cy = 0;
      for (const v of ring) { cx += v[0]; cy += v[1]; }
      cx /= ring.length; cy /= ring.length;
      const ox = mx - cx, oy = my - cy, ol = Math.hypot(ox, oy) || 1;
      const startX = mx + (ox / ol) * 2.5, startZ = -(my + (oy / ol) * 2.5);
      // walk from outside, straight in at the edge
      // the game's yaw: 0 looks north (-z), turning left as yaw grows, so face from the start
      // towards the edge point (mx, -my)
      const yaw = Math.atan2(startX - mx, startZ - (-my));
      const y = m.ground(startX, startZ);
      const startInside = inside(ring, startX, startZ);
      if (startInside) continue;                        // started on the platform: not an approach
      const top = p.z;
      // only test approaches from near the platform's foot, where a side should be in the way
      if (Math.abs(y - (top - 1.0)) > 3) continue;
      // walk with the game's own movement
      pl.pos.set(startX, y + 0.1, startZ);
      pl.vel.set(0, 0, 0); pl.onGround = true; pl.keys.clear(); pl.yaw = yaw;
      pl.sprinting = false;
      pl.keys.add("KeyW");
      const log = [];
      const dt = 1 / 60, n = Math.round(+secs / dt);
      for (let k = 0; k < n; k++) {
        pl.update(dt, true);
        if (k % 15 === 0) log.push([+(k * dt).toFixed(2), +pl.pos.x.toFixed(1), +pl.pos.z.toFixed(1), +pl.pos.y.toFixed(2)]);
      }
      pl.keys.clear();
      const end = { x: pl.pos.x, y: pl.pos.y, z: pl.pos.z };
      const endInside = inside(ring, end.x, end.z);
      const onTop = end.y > top - 0.6;
      const near = nearest(ring, end.x, end.z);
      walks.push({
        plat: p.no ?? "", edge: i, from: [+startX.toFixed(1), +startZ.toFixed(1)],
        startGround: +y.toFixed(2), top: +top.toFixed(2),
        end: [+end.x.toFixed(1), +end.z.toFixed(1), +end.y.toFixed(2)],
        endInside, onTop, distFromEdge: +near.d.toFixed(2),
        through: endInside && !onTop, log,
      });
    }
  }
  return { walks };
}, [opt.station, opt.secs]);

if (res.err) { console.error(res.err); await browser.close(); server.close(); process.exit(1); }
const w = res.walks;
const through = w.filter((x) => x.through);
console.log(`platform sides: ${opt.station}   walks: ${w.length}   walked through: ${through.length}`);
for (const x of w) {
  const how = x.through ? "WALKED THROUGH THE SIDE" : x.onTop ? "up onto it" : "held outside";
  console.log(`  plat ${x.plat} edge ${x.edge}: ground ${x.startGround} top ${x.top} -> ended ${JSON.stringify(x.end)} ${how} (${x.distFromEdge} m from the edge)`);
}
console.log(`${through.length} of ${w.length} walks went through the platform's side`);
console.log(await silenceNote(page));
if (complaints.length) console.log(`  ${complaints.length} page complaint(s): ${complaints.slice(0, 3).join("; ")}`);

if (opt.out) {
  fs.writeFileSync(path.join(opt.out, "probe.json"), JSON.stringify({ station: opt.station, walks: w }, null, 1));
  const rows = [`platform sides: ${opt.station}`, `${through.length} of ${w.length} walks went through`];
  for (const x of w) rows.push(`  plat ${x.plat} edge ${x.edge}: ended ${JSON.stringify(x.end)} ${x.through ? "THROUGH" : x.onTop ? "on top" : "held"}`);
  fs.writeFileSync(path.join(opt.out, "report.txt"), rows.join("\n") + "\n");
}
await browser.close();
server.close();
process.exit(through.length ? 1 : 0);
