// Walks a player into the water and shoots what they see from their own eyes, for checking how
// wading in looks. It serves the built game (web/dist), starts a solo game in a muted headless
// Chrome (tools/quiet-guard.mjs), and for each spot finds the nearest bank, then stands the player
// a few metres out on the bank and at several steps in, facing the water, and lets the game place
// them as it would. Each shot's name says how far in it is; the log says where the player's feet
// and eyes are against the water's level.
//
//   cd web && npm run build && node ../tools/water_probe.mjs --map combe-down --out shots/water --tag before -- "avon:-232.6,3147.9" "pond:191.5,1541.3"
//
// A spot is name:east,north, a point in the water. Options: --map, --out, --tag, --size 960x540,
// --steps "-3,2,5,10,20" (metres in from the bank; negative is on the bank), --pitch -0.08 (radians, up from level), --prone (lying down, eyes half a metre up).
import { createRequire } from "module";
import fs from "fs";
import http from "http";
import path from "path";
import { MUTED_ARGS, silence, silenceContext, silenceNote } from "./quiet-guard.mjs";

const WEB = new URL("../web/", import.meta.url).pathname;
const { chromium } = createRequire(WEB + "package.json")("playwright");
const argv = process.argv.slice(2), opt = { dist: WEB + "dist", out: "shots/water", tag: "", map: "combe-down", size: "960x540", steps: "-3,2,5,10,20", pitch: "-0.08" };
const spots = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--") continue;
  if (a === "--prone") { opt.prone = true; continue; }
  if (a.startsWith("--")) opt[a.slice(2)] = argv[++i];
  else { const [name, at] = a.split(":"); spots.push({ name, at: at.split(",").map(Number) }); }
}
const steps = opt.steps.split(",").map(Number);
const [W, H] = opt.size.split("x").map(Number);
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

const browser = await chromium.launch({ headless: true, channel: "chrome", args: [...MUTED_ARGS, "--use-angle=metal", "--enable-gpu"] });
const context = await browser.newContext({ viewport: { width: W, height: H } });
await silenceContext(context);
const page = await context.newPage();
await silence(page);
const complaints = [];
page.on("pageerror", (e) => complaints.push(`error: ${e.message}`));

const first = spots[0].at;
await page.goto(`http://127.0.0.1:${port}/?map=${opt.map}&time=11:00&at=${first[0]},${first[1]},0,0`);
await page.evaluate(() => { window.__budget = 40; });
await page.waitForFunction(() => !document.getElementById("solo")?.disabled, null, { timeout: 180000 });
await page.evaluate(() => document.getElementById("solo").click());
await page.waitForFunction(() => window.__game && window.__game(), null, { timeout: 180000 });
// the zones' wall would hold the player back from water outside the part of the map open so far
await page.evaluate(() => { window.__game().map.zoneFence = null; });
await page.addStyleTag({ content: "#menu,#hud,.toast,#pause,#debug,#touch,#arrive{display:none!important}" });
const settle = async () => {
  await page.evaluate(() => { window.__shootCalm = window.__calm(20, 800); });
  return page.waitForFunction(() => window.__shootCalm.still(window.__tilesPending ?? 1), null, { timeout: 90000, polling: "raf" }).then(() => true, () => false);
};

const log = [];
for (const s of spots) {
  const [e, n] = s.at;
  // stand there first so its squares load, then find the bank from them
  await page.evaluate(([x, z]) => { const p = window.__game().player; p.pos.set(x, 400, z); p.vel.set(0, 0, 0); }, [e, -n]);
  await settle();
  const bank = await page.evaluate(([x, z]) => {
    const m = window.__game().map;
    let best = null;
    for (let k = 0; k < 32; k++) {
      const a = (k / 32) * Math.PI * 2, dx = Math.sin(a), dz = -Math.cos(a);
      for (let r = 0; r < 400; r += 0.5) if (!m.inWater(x + dx * r, z + dz * r)) { if (!best || r < best.r) best = { r, dx, dz }; break; }
    }
    return best;
  }, [e, -n]);
  if (!bank) { console.log(`${s.name}: no bank found`); continue; }
  for (const d of steps) {
    if (d > bank.r) continue;
    const r = bank.r - d, x = e + bank.dx * r, z = -n + bank.dz * r;
    // facing back into the water, along the line from the bank
    const yaw = Math.atan2(bank.dx, bank.dz);
    await page.evaluate(([x, z, yaw, pitch, prone]) => {
      const g = window.__game(), p = g.player;
      p.pos.set(x, g.map.ground(x, z) + 3, z); p.vel.set(0, 0, 0); p.yaw = yaw; p.pitch = pitch; p.proneLatch = prone;
    }, [x, z, yaw, +opt.pitch, !!opt.prone]);
    await settle();
    const at = await page.evaluate(([x, z]) => {
      const g = window.__game(), m = g.map, p = g.player;
      let level = null;
      for (const t of [m, ...m.tilesNear(x, z, 10)]) for (const w of [...(t === m ? m.wide?.wp ?? [] : []), ...(t.d.wp ?? [])]) {
        const ring = w.r[0];
        let inside = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const [xi, yi] = ring[i], [xj, yj] = ring[j];
          if (yi > -z !== yj > -z && x < ((xj - xi) * (-z - yi)) / (yj - yi) + xi) inside = !inside;
        }
        if (inside) level = w.z - m.z0;
      }
      return { feet: +p.pos.y.toFixed(2), eye: +g.camera.position.y.toFixed(2), ground: +m.ground(p.pos.x, p.pos.z).toFixed(2), level: level === null ? null : +level.toFixed(2), inWater: m.inWater(p.pos.x, p.pos.z) };
    }, [x, z]);
    const file = path.join(opt.out, `${s.name}-${d < 0 ? "bank" + -d : "in" + d}${opt.tag ? "-" + opt.tag : ""}.png`);
    await page.screenshot({ path: file });
    log.push({ spot: s.name, metresIn: d, file, ...at });
    console.log(s.name, d, JSON.stringify(at));
  }
}
fs.writeFileSync(path.join(opt.out, `water${opt.tag ? "-" + opt.tag : ""}.json`), JSON.stringify({ log, complaints }, null, 1));
console.log(await silenceNote(page));
await browser.close();
server.close();
