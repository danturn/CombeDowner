// Whether a player and a car stand on the street as it's drawn: starts a solo game in a muted
// headless Chrome, puts the player down at each spot along a line and lets them settle, drops a car
// there, and writes each one's height against the drawn surface (world.surface) there.
//
//   node tools/ground_probe.mjs [--dist web/dist] [--from e,n] [--to e,n] [--step 2]
//
// Prints one line a spot and the worst gaps; nothing is decided over the network.
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
const argv = process.argv.slice(2), opt = { dist: WEB + "dist", from: "-380,282", to: "-404,296", step: "2" };
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) opt[argv[i].slice(2)] = argv[++i];
const [ae, an] = opt.from.split(",").map(Number), [be, bn] = opt.to.split(",").map(Number);
const spots = [];
const len = Math.hypot(be - ae, bn - an), step = +opt.step;
for (let s = 0; s <= len + 1e-6; s += step) spots.push([ae + (be - ae) * s / len, an + (bn - an) * s / len]);

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
const browser = await chromium.launch({
  headless: true, ...(process.env.CHROME ? { executablePath: process.env.CHROME } : { channel: "chrome" }),
  args: [...MUTED_ARGS, ...(process.platform === "darwin" ? ["--use-angle=metal", "--enable-gpu"] : [])],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
await silence(page);
await page.goto(`http://127.0.0.1:${port}/?map=combe-down&time=11:00&at=${ae},${an},0,0`);
await page.waitForFunction(() => !document.getElementById("solo")?.disabled, null, { timeout: 120000 });
await page.evaluate(() => document.getElementById("solo").click());
await page.waitForFunction(() => window.__game && window.__game(), null, { timeout: 120000 });
await page.waitForFunction(() => window.__tilesPending === 0, null, { timeout: 120000, polling: 500 });
await page.waitForTimeout(1500);

const rows = [];
for (const [e, n] of spots) {
  const x = e, z = -n;
  await page.evaluate(([x, z]) => {
    const g = window.__game(), s = g.world.surface(x, z);
    g.player.pos.set(x, s + 0.6, z);
    if (g.player.vel) g.player.vel.set(0, 0, 0);
    const v = g.vehicles.list.find((c) => !c.driver) ?? g.vehicles.list[0];
    window.__probeCar = v;
    v.place(x + 3, z, 0);
  }, [x, z]);
  await page.waitForTimeout(600);
  rows.push(await page.evaluate(([x, z]) => {
    const g = window.__game(), w = g.world, p = g.player.pos, v = window.__probeCar;
    return { x: p.x, z: p.z, player: p.y, drawn: w.surface(p.x, p.z), grid: g.map.trueGround ? g.map.trueGround(p.x, p.z) : g.map.ground(p.x, p.z),
             car: v.y, carDrawn: w.surface(v.x, v.z) };
  }, [x, z]));
}
let worstP = 0, worstC = 0;
for (const r of rows) {
  const dp = r.player - r.drawn, dc = r.car - r.carDrawn;
  worstP = Math.max(worstP, Math.abs(dp)); worstC = Math.max(worstC, Math.abs(dc));
  console.log(`e ${r.x.toFixed(1)} n ${(-r.z).toFixed(1)}  drawn ${r.drawn.toFixed(2)}  player ${r.player.toFixed(2)} (${dp >= 0 ? "+" : ""}${dp.toFixed(2)})  grid ${r.grid.toFixed(2)}  car ${dc >= 0 ? "+" : ""}${dc.toFixed(2)}`);
}
console.log(`worst: player ${worstP.toFixed(2)} m off the drawn surface, car ${worstC.toFixed(2)} m`);
console.log(await silenceNote(page));
await browser.close();
server.close();
