// Whether a player and a car stand on the street as it's drawn: starts a solo game in a muted
// headless Chrome, puts the player down at each spot along a line and lets them settle, drops a car
// there, and writes each one's height against the drawn surface (world.surface) there.
//
//   node tools/ground_probe.mjs [--dist web/dist] [--from e,n] [--to e,n] [--step 2]
//
// With --wall e0,n0,z0,e1,n1,z1[,height] it shoots at a wall's stretch instead: from 4 m off it at
// points along it, level shots just over and just under its drawn top, and where each stops.
//
// With --gate it finds the stone or brick garden gates within 40 m of --from and, for each, shoots
// level from 3 m out at a pillar and at the gate itself, and walks a player into the pillar.
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

if (opt.wall) {
  const [we0, wn0, wz0, we1, wn1, wz1, wh = 0.9] = opt.wall.split(",").map(Number);
  const out = await page.evaluate(([we0, wn0, wz0, we1, wn1, wz1, wh]) => {
    const g = window.__game(), m = g.map, z0 = m.z0, lines = [];
    const L = Math.hypot(we1 - we0, wn1 - wn0), ue = (we1 - we0) / L, un = (wn1 - wn0) / L;
    for (const f of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const e = we0 + (we1 - we0) * f, n = wn0 + (wn1 - wn0) * f, top = wz0 + (wz1 - wz0) * f + wh - z0;
      for (const side of [1, -1]) {
        // from 4 m off the wall square to it, on each side
        const se = e - un * 4 * side, sn = n + ue * 4 * side, dx = un * side, dz = ue * side;
        for (const dy of [0.15, -0.15]) {
          const h = m.raycast(se, top + dy, -sn, dx, 0, dz, 30);
          lines.push({ f, side, over: dy > 0, top, ground: m.ground(se, -sn), dist: h ? h.dist : null, kind: h ? h.kind : null });
        }
      }
    }
    return lines;
  }, [we0, wn0, wz0, we1, wn1, wz1, wh]);
  let wrong = 0;
  for (const r of out) {
    const stopped = r.dist !== null && r.dist < 4.4;
    const ok = r.over ? !stopped : stopped;
    if (!ok) wrong++;
    console.log(`at ${(r.f * 100).toFixed(0)}% side ${r.side > 0 ? "L" : "R"} ${r.over ? "over " : "under"} the drawn top (${r.top.toFixed(2)}): ${r.dist === null ? "nothing in 30 m" : `${r.kind} at ${r.dist.toFixed(2)} m`}${ok ? "" : "   <- wrong"}`);
  }
  console.log(`${wrong} of ${out.length} shots wrong (over should fly on past 4.4 m, under should stop at the wall)`);
  console.log(await silenceNote(page));
  await browser.close();
  server.close();
  process.exit(0);
}
if (opt.gate) {
  const gates = await page.evaluate(([ae, an]) => {
    const g = window.__game(), m = g.map;
    const all = [...(m.d.gt ?? []), ...[...(m.tiles?.values?.() ?? [])].flatMap((t) => t?.d?.gt ?? [])];
    return all.filter((q) => q[5] !== "open" && ["garden_wall", "stone_wall", "wall", "brick_wall", "brick_wall_low"].includes(q[5])
      && Math.hypot(q[0] - ae, q[1] - an) < 40).slice(0, 4);
  }, [ae, an]);
  for (const q of gates) {
    const r = await page.evaluate((q) => {
      const g = window.__game(), m = g.map, z0 = m.z0;
      const [x0, y0, x1, y1, z] = q, w = Math.hypot(x1 - x0, y1 - y0), ue = (x1 - x0) / w, un = (y1 - y0) / w;
      const mid = z - z0 + 0.6, out = {};
      // at the far pillar, square on from 3 m out on whichever side the ground lies below the shot,
      // and at the gate standing ajar by the first
      const side = g.world.surface(x1 - un * 3, -(y1 + ue * 3)) < g.world.surface(x1 + un * 3, -(y1 - ue * 3)) ? 1 : -1;
      for (const [name, e, n] of [["pillar", x1, y1], ["gate", x0 + ue * 0.5, y0 + un * 0.5]]) {
        const se = e - un * 3 * side, sn = n + ue * 3 * side, h = m.raycast(se, mid, -sn, un * side, 0, ue * side, 10);
        out[name] = h ? `${h.kind} at ${h.dist.toFixed(2)} m` : "nothing in 10 m";
      }
      // walked into the far pillar from 3 m out: how near its middle it ends up
      g.player.pos.set(x1 - un * 3, g.world.surface(x1 - un * 3, -(y1 + ue * 3)) + 0.1, -(y1 + ue * 3));
      window.__walk = { tx: x1, tz: -y1 };
      return out;
    }, q);
    for (let k = 0; k < 40; k++) {
      await page.evaluate(() => {
        const g = window.__game(), p = g.player.pos, t = window.__walk, dx = t.tx - p.x, dz = t.tz - p.z, d = Math.hypot(dx, dz) || 1;
        p.x += dx / d * 0.12; p.z += dz / d * 0.12;
      });
      await page.waitForTimeout(30);
    }
    const near = await page.evaluate(() => { const p = window.__game().player.pos, t = window.__walk; return Math.hypot(p.x - t.tx, p.z - t.tz); });
    console.log(`gate ${q.slice(0, 4).map((v) => v.toFixed(1)).join(",")} ${q[5]}: shot at the pillar from 3 m: ${r.pillar} (its face is 2.80 m); at the gate: ${r.gate}; walked into the pillar, stopped ${near.toFixed(2)} m from its middle`);
  }
  console.log(await silenceNote(page));
  await browser.close();
  server.close();
  process.exit(0);
}
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
