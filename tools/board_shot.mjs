// Shoots a station's departure boards close up, for comparing two builds by eye.
//
// Serves a built game (web/dist), starts a solo game, finds the railway's boards through the page,
// and shoots each one from in front of its face. The board is a canvas texture, so a screenshot
// from a metre or two away is the only honest way to see what it says.
//
//   node tools/board_shot.mjs --dist /path/to/web/dist --out shots/canonical --tag canonical
//   node tools/board_shot.mjs --dist ... --out ... --station "Bath Spa" --size 1280x720
//
// Options: --dist, --out, --tag, --station (default "Bath Spa"), --size, --map, --time (default
// 11:00; "now" for the real clock), --range (how far in front of the face to stand, default 3.2),
// --fov. PW=<playwright> if it isn't installed where node can find it.
import { createRequire } from "module";
import fs from "fs";
import http from "http";
import path from "path";
import { MUTED_ARGS, silence, silenceNote } from "./quiet-guard.mjs";

const { chromium } = (() => {
  if (process.env.PW) return createRequire(import.meta.url)(process.env.PW);
  const web = new URL("../web/", import.meta.url).pathname;
  try { return createRequire(web + "package.json")("playwright"); } catch { return createRequire(import.meta.url)("playwright"); }
})();

const argv = process.argv.slice(2);
const opt = { dist: new URL("../web/dist", import.meta.url).pathname, out: "shots/boards", tag: "", station: "Bath Spa", size: "1280x720", map: "combe-down", time: "11:00", range: "3.2", fov: "55", await: "0" };
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) opt[argv[i].slice(2)] = argv[++i];

const [W, H] = opt.size.split("x").map(Number);
const range = +opt.range;
fs.mkdirSync(opt.out, { recursive: true });

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
  channel: "chrome",
  args: [...MUTED_ARGS,
    ...(linux ? ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
      : process.platform === "darwin" ? ["--use-angle=metal", "--enable-gpu"] : [])],
});
const page = await browser.newPage({ viewport: { width: W, height: H } });
await silence(page);
const complaints = [];
page.on("pageerror", (e) => complaints.push(`error: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error") complaints.push(`error: ${m.text().slice(0, 200)}`); });

const q = new URLSearchParams({ map: opt.map });
if (opt.time !== "now") q.set("time", opt.time);
await page.goto(`http://127.0.0.1:${port}/?${q}`);
await page.evaluate(() => { window.__budget = 40; });
await page.waitForFunction(() => !document.getElementById("solo")?.disabled, null, { timeout: 120000 });
await page.evaluate(() => document.getElementById("solo").click());
await page.waitForFunction(() => window.__game && window.__game(), null, { timeout: 120000 });
await page.waitForFunction(() => window.__tilesPending === 0, null, { timeout: 180000, polling: "raf" }).catch(() => {});
await page.addStyleTag({ content: "#menu,#hud,.toast,#pause,#debug,#touch{display:none!important}" });
await page.evaluate(() => { const g = window.__game(); if (g.weapon) g.weapon.scene.visible = false; });
console.log(await silenceNote(page));

// The railway hangs the boards; find them whichever way this build names things. Each board ends
// up as { station, no, x, z, top, tx, tz }: scene x/z, the platform top's scene y, and the
// direction along the platform, which is where its face looks (both builds face the board along
// the track, so standing along it from the board reads the face).
const found = await page.evaluate((station) => {
  const g = window.__game();
  const rail = g.world?.railway ?? g.railway;
  if (!rail) return { err: "no railway on the game" };
  const plat = rail.plat ?? [];
  /** The tangent along the platform whose ring is nearest (x, z), from its two widest-apart points. */
  const tangentAt = (x, z) => {
    let best = null, bd = Infinity;
    for (const p of plat) {
      const r = p.r ?? [];
      if (!r.length) continue;
      const xs = r.map((q) => q[0]), ys = r.map((q) => q[1]);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
      const d = Math.hypot(cx - x, cy + z);
      if (d < bd) { bd = d; best = { p, cx, cy }; }
    }
    if (!best) return { d: null, top: null, no: "" };
    const r = best.p.r;
    // the two ring points furthest apart: the platform's ends, so the line between them is its long axis
    let a = r[0], b = r[0], far = -1;
    for (const q of r) for (const s of r) {
      const d2 = (q[0] - s[0]) ** 2 + (q[1] - s[1]) ** 2;
      if (d2 > far) { far = d2; a = q; b = s; }
    }
    const tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1;
    return { d: [tx / l, -ty / l], top: best.p.z ?? null, no: best.p.no ?? "", centre: [best.cx, best.cy] };
  };
  const out = [];
  for (const b of rail.boards ?? []) {
    if (b.at) {
      // beta: one entry per station, `at` the scene [x, z] of each of its boards, `plats` numbered
      for (let i = 0; i < b.at.length; i++) {
        const [x, z] = b.at[i];
        const t = tangentAt(x, z);
        if (!t.d) continue;
        out.push({ station: b.station, no: String(t.no || b.plats?.[i] || i + 1), x, z, top: t.top, tx: t.d[0], tz: t.d[1] });
      }
      continue;
    }
    // canonical: one entry per board, with `pl` into plat[]
    const p = plat[b.pl];
    if (!p) continue;
    const z = -b.y, t = tangentAt(b.x, z);
    out.push({ station: p.n, no: p.no ?? "", x: b.x, z, top: p.z ?? null, tx: t.d?.[0] ?? 0, tz: t.d?.[1] ?? 0 });
  }
  const mine = station ? out.filter((b) => b.station === station) : out;
  if (mine.length) return { boards: mine };
  return { err: `no boards found for ${station} (rail keys: ${Object.keys(rail).slice(0, 40).join(",")})` };
}, opt.station);

if (found.err) { console.error(found.err); await browser.close(); server.close(); process.exit(1); }
const boards = found.boards;
console.log(`found ${boards.length} board(s) at ${opt.station}`);

const log = { dist: opt.dist, station: opt.station, size: opt.size, shots: [] };
for (let i = 0; i < boards.length; i++) {
  const b = boards[i];
  // Stand in front of the board's face, at eye height on its platform, looking at the face centre.
  const shot = await page.evaluate(([b, range, fov]) => {
    const g = window.__game(), m = g.map;
    const bx = b.x, bz = b.z;
    const top = b.top ?? m.ground(bx, bz);
    const eye = top + 1.6;
    // the face is along the platform, so stand along the track from it and look back at the face
    let px = bx + b.tx * range, pz = bz + b.tz * range;
    if (m.ground(px, pz) < top - 0.6) { px = bx - b.tx * range; pz = bz - b.tz * range; }
    g.player.pos.set(px, m.ground(px, pz), pz);
    const cam = g.camera;
    cam.fov = fov; cam.updateProjectionMatrix();
    cam.position.set(px, eye, pz);
    cam.lookAt(bx, top + 2.6, bz);
    cam.updateMatrixWorld();
    if (g.weapon) g.weapon.scene.visible = false;
    // hold the camera still: the game moves it every frame
    const u = g.update.bind(g);
    g.update = (dt) => { u(dt); cam.position.set(px, eye, pz); cam.lookAt(bx, top + 2.6, bz); cam.fov = fov; cam.updateProjectionMatrix(); cam.updateMatrixWorld(); };
    return { px: +px.toFixed(1), pz: +pz.toFixed(1), eye: +eye.toFixed(2), station: b.station, no: b.no };
  }, [b, range, +opt.fov]);
  await page.waitForFunction(() => window.__tilesPending === 0, null, { timeout: 120000, polling: "raf" }).catch(() => {});
  await page.waitForTimeout(1600);   // the boards rewrite once a second; let them land
  // The "now at this platform" banner only shows while a train is dwelling (about a tenth of the
  // time), so wait for one if asked, and give up rather than hang.
  if (+opt.await > 0) {
    const got = await page.waitForFunction(([b]) => {
      const g = window.__game(), rail = g.world?.railway ?? g.railway;
      if (!rail) return false;
      const list = rail.departures(b.station, 4, b.no || undefined);
      const now = rail.clock ?? Date.now() / 1000;
      return !!list[0] && now >= list[0].at - 35;
    }, [b], { timeout: +opt.await * 1000, polling: 500 }).then(() => true, () => false);
    if (!got) console.log(`  (no train came to ${b.station} platform ${b.no} in ${opt.await}s)`);
    await page.waitForTimeout(1200);
  }
  const name = `${(b.station || "board").replace(/\W+/g, "-").toLowerCase()}-plat${b.no || i + 1}`;
  const file = path.join(opt.out, `${name}${opt.tag ? "-" + opt.tag : ""}.png`);
  await page.screenshot({ path: file });
  log.shots.push({ ...shot, file });
  console.log(`  shot ${path.basename(file)}  from (${shot.px}, ${shot.pz}) eye ${shot.eye}`);
}
log.complaints = [...new Set(complaints)];
fs.writeFileSync(path.join(opt.out, "boards.json"), JSON.stringify(log, null, 1));
console.log(`${boards.length} shot(s) in ${opt.out}; ${log.complaints.length} complaints`);
await browser.close();
server.close();
