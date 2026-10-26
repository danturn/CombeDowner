// A headless, muted check of the strange structures (web/src/oddments.ts): that each stands solid
// and that nothing the game puts down lands on it. Starts a solo game and, at the first zone's
// structure:
// - walks into it from eight sides, rides into it, and drives a car into it, logging how near the
//   middle each got (it should stop at the plinth's edge);
// - fires a ray at it;
// - has an object turn up, picks it up, carries it to the structure and sets it in a socket;
// - lists, for several game days, the noticeboards, race starts and finishes, spawns and pickups
//   near it, with how far each is from its middle;
// - and shoots it.
//   cd web && npm run build && cd .. && node tools/structure_probe.mjs --out out/structure
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
const argv = process.argv.slice(2), opt = { out: "out/structure", map: "combe-down", days: "6" };
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) opt[argv[i].slice(2)] = argv[++i];
fs.mkdirSync(opt.out, { recursive: true });

const DIST = path.join(WEB, "dist");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/") p = "/index.html";
  const f = path.join(DIST, p);
  fs.readFile(f, (e, b) => {
    if (e) { res.writeHead(404); res.end("no"); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(f)] ?? "application/octet-stream" });
    res.end(b);
  });
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const browser = await chromium.launch({ channel: "chrome", headless: true, args: [...MUTED_ARGS, "--no-first-run", "--use-angle=metal"] });
const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
await silence(page);
const errs = [];
page.on("pageerror", (e) => errs.push(String(e.message)));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const lines = [];
const say = (s) => { console.log(s); lines.push(s); };

try {
  await page.addInitScript(() => { try { localStorage.clear(); } catch {} });
  await page.goto(`http://127.0.0.1:${port}/?map=${opt.map}&net=local&objects=1&time=13`);
  await page.waitForSelector("#solo", { state: "visible", timeout: 90000 });
  await page.click("#solo");
  await page.waitForFunction(() => !!(window.__game && window.__game()), null, { timeout: 90000 });
  await wait(4000);
  const S = await page.evaluate(() => {
    const g = window.__game();
    window.__offset = 0;
    const now = Date.now.bind(Date);
    Date.now = () => now() + window.__offset;
    return g.oddments.structs.map((t) => ({ x: t.x, y: t.y, z: t.z, zone: t.zone.name, place: t.zone.home.n, sockets: t.zone.sockets }));
  });
  for (const s of S) say(`structure in ${s.zone}: ${s.place || "?"} at scene (${s.x.toFixed(1)}, ${s.z.toFixed(1)}), ${s.sockets} sockets`);
  const c = S[0];
  say(`\nkeepClear: ${JSON.stringify(await page.evaluate(() => window.__game().map.keepClear.map((k) => [Math.round(k.x), Math.round(k.z), k.r])))}`);

  // walk in from eight sides
  say("\nwalking at it (nearest the middle got; solid radius 3.3, player 0.35):");
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    await page.evaluate(({ c, a }) => {
      const g = window.__game(), px = c.x + Math.cos(a) * 9, pz = c.z + Math.sin(a) * 9;
      g.player.spawn(px, pz, Math.atan2(px - c.x, pz - c.z));
      g.player.keys.clear(); g.player.keys.add("KeyW");
      window.__near = 99;
      window.__watch = setInterval(() => { const p = g.player.pos; window.__near = Math.min(window.__near, Math.hypot(p.x - c.x, p.z - c.z)); }, 16);
    }, { c, a });
    await wait(3000);
    const near = await page.evaluate(() => { clearInterval(window.__watch); window.__game().player.keys.clear(); return window.__near; });
    say(`  from ${Math.round((a * 180) / Math.PI)}°: ${near.toFixed(2)} m ${near > 3.3 ? "BLOCKED" : "THROUGH"}`);
  }
  await page.screenshot({ path: `${opt.out}/1-walked-into-it.png` });

  // on a ride
  say("\nriding at it:");
  for (const ride of ["bmx", "scooter"]) {
    await page.evaluate(({ c, ride }) => {
      const g = window.__game(), px = c.x + 14, pz = c.z;
      g.player.spawn(px, pz, Math.atan2(px - c.x, pz - c.z));
      g.giveRide(ride); if (!g.riding) g.toggleRide();
      g.player.keys.clear(); g.player.keys.add("KeyW");
      window.__near = 99;
      window.__watch = setInterval(() => { const p = g.player.pos; window.__near = Math.min(window.__near, Math.hypot(p.x - c.x, p.z - c.z)); }, 16);
    }, { c, ride });
    await wait(3500);
    const r = await page.evaluate(() => { clearInterval(window.__watch); const g = window.__game(); g.player.keys.clear(); const on = g.riding; if (g.riding) g.toggleRide(); return { near: window.__near, on }; });
    say(`  ${ride} (riding: ${r.on}): ${r.near.toFixed(2)} m ${r.near > 3.3 ? "BLOCKED" : "THROUGH"}`);
  }

  // in a car
  say("\ndriving at it:");
  const drove = await page.evaluate(async (c) => {
    const g = window.__game(), p = g.player.pos;
    const v = g.vehicles.list.filter((o) => o.kind !== "bus" && !o.driver).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
    if (!v) return { err: "no car" };
    v.x = c.x + 22; v.z = c.z; v.a = Math.atan2(-(c.z - v.z), c.x - v.x);
    const at = v.exitSpot(0);
    g.player.spawn(at.x, at.z, 0);
    await new Promise((r) => setTimeout(r, 1500));
    g.useVehicle();
    await new Promise((r) => setTimeout(r, 2000));
    g.player.keys.clear(); g.player.keys.add("KeyW");
    let near = 99, speed = 0;
    const t0 = performance.now();
    await new Promise((r) => { const id = setInterval(() => { near = Math.min(near, Math.hypot(v.x - c.x, v.z - c.z)); speed = Math.max(speed, Math.abs(v.speed ?? v.v ?? 0)); if (performance.now() - t0 > 6000) { clearInterval(id); r(); } }, 16); });
    g.player.keys.clear();
    return { name: v.name, near, hw: v.hw, hl: v.hl, inside: !!g.car || !!g.ride, speed };
  }, c);
  say(`  ${JSON.stringify(drove)}  ${drove.near > 3.3 + (drove.hw ?? 0) - 0.05 ? "BLOCKED" : "THROUGH"} (the car's middle should stop about 3.3 + its half width/length off)`);
  await page.screenshot({ path: `${opt.out}/2-drove-into-it.png` });
  await page.evaluate(() => { const g = window.__game(); if (g.car || g.ride) g.useVehicle(); });
  await wait(1500);

  // a round at it
  const ray = await page.evaluate((c) => { const h = window.__game().map.raycast(c.x + 12, c.y + 1.2, c.z, -1, 0, 0, 30); return h && { dist: h.dist, kind: h.kind }; }, c);
  say(`\nray from 12 m off at chest height: ${JSON.stringify(ray)} ${ray && ray.dist < 9.5 ? "HITS IT" : "MISSES"}`);

  // an object to the socket
  say("\nan object to a socket:");
  const fill = await page.evaluate(async (c) => {
    const g = window.__game(), O = g.oddments, wait = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < 20 && !O.s.o.length; i++) await wait(500);
    const o = O.s.o[0];
    if (!o) return { err: "no object turned up" };
    g.player.spawn(o[1] + 0.5, o[3], 0);
    await wait(800);
    const took = O.use(g.woodMe(), g.isHost);
    await wait(500);
    const carrying = O.carrying(g.net.selfId);
    // stand against the plinth, facing it, and set it
    g.player.spawn(c.x + 6, c.z, Math.atan2(6, 0));
    g.player.keys.add("KeyW"); await wait(1500); g.player.keys.clear();
    const d = Math.hypot(g.player.pos.x - c.x, g.player.pos.z - c.z);
    const hint = O.hint(g.woodMe()), before = O.filled;
    const set = O.use(g.woodMe(), g.isHost);
    await wait(800);
    // and a drop against it lands outside it
    return { took, carrying, standingAt: d, hint, set, filled: [before, O.filled] };
  }, c);
  say(`  ${JSON.stringify(fill)}`);
  await page.screenshot({ path: `${opt.out}/3-socket-filled.png` });
  const drop = await page.evaluate(async (c) => {
    const g = window.__game(), O = g.oddments, wait = (ms) => new Promise((r) => setTimeout(r, ms));
    O.ask(g.net.selfId, { op: "spawn", n: 1, x: c.x + 12, z: c.z }, g.net.selfId, [g.woodMe()]);
    await wait(500);
    const o = O.s.o.find((q) => !q[4]);
    if (!o) return { err: "none to drop" };
    g.player.spawn(o[1], o[3], 0); await wait(500);
    O.use(g.woodMe(), g.isHost); await wait(300);
    g.player.spawn(c.x + 6, c.z, Math.atan2(6, 0));
    g.player.keys.add("KeyW"); await wait(1500); g.player.keys.clear();
    O.drop(g.woodMe(), g.isHost); await wait(300);
    const q = O.s.o.find((x) => x[0] === o[0]);
    g.player.spawn(q[1] + (q[1] - c.x) * 0.3, q[3] + (q[3] - c.z) * 0.3, 0); await wait(300);
    const back = O.use(g.woodMe(), g.isHost); await wait(300);
    return { droppedAt: Math.hypot(q[1] - c.x, q[3] - c.z), pickedBackUp: back && O.carrying(g.net.selfId) };
  }, c);
  say(`  dropped against it: ${JSON.stringify(drop)}`);

  // what's put down round it, over several days
  say(`\nwhat's put down within 60 m of it, ${opt.days} game days (distance from its middle; kept clear inside 9 m):`);
  const spawns = await page.evaluate((c) => window.__game().spawns.map(([x, z]) => Math.hypot(x - c.x, z - c.z)).sort((a, b) => a - b).slice(0, 3), c);
  say(`  spawns, nearest three: ${spawns.map((d) => d.toFixed(1)).join(", ")}`);
  const places = await page.evaluate((c) => {
    const g = window.__game(), w = g.quests.w, out = [];
    for (const p of [...g.map.d.pl ?? [], ...g.map.wide?.d.pl ?? []]) {
      if (!p.n || p.r.length < 3) continue;
      const x = p.r.reduce((s, q) => s + q[0], 0) / p.r.length, z = -p.r.reduce((s, q) => s + q[1], 0) / p.r.length;
      if (Math.hypot(x - c.x, z - c.z) < 60) { const at = w.places().find((q) => q.n === p.n); out.push(`${p.n}: middle ${Math.hypot(x - c.x, z - c.z).toFixed(1)} m off, its spot for boards and races now ${at ? Math.hypot(at.x - c.x, at.z - c.z).toFixed(1) : "?"} m off`); }
    }
    return out;
  }, c);
  for (const p of places) say(`  place ${p}`);
  let worst = 99;
  for (let day = 0; day < +opt.days; day++) {
    const r = await page.evaluate(async ({ c, day }) => {
      const g = window.__game(), Q = g.quests, wait = (ms) => new Promise((r) => setTimeout(r, ms));
      window.__offset = day * 1440 * 1000;
      g.player.spawn(c.x + 12, c.z, 0);
      Q.repost();
      await wait(1500);
      const near = (x, z) => Math.hypot(x - c.x, z - c.z);
      const out = { day: Q.day, boards: [], races: [], pickups: [] };
      for (const p of Q.posts) {
        if (near(p.x, p.z) > 400) continue;
        out.boards.push(`${p.kind.id}@${p.offer.where} ${near(p.x, p.z).toFixed(1)} (offer ${near(p.offer.x, p.offer.z).toFixed(1)})`);
        if (p.kind.id === "race") {
          try {
            const R = p.kind.start(p.offer, Q.w, Date.now(), g.net.selfId, true);
            out.races.push({ where: p.offer.where, to: R.rt.to.n, line: near(R.line.x, R.line.z), grid: near(R.start.x, R.start.z), finish: near(R.fin.x, R.fin.z), gates: Math.min(...R.gates.map((q) => near(q.x, q.z))) });
            R.end?.();
          } catch (e) { out.races.push({ err: String(e) }); }
        }
      }
      for (const it of g.pickups.items.values()) if (near(it.x, it.z) < 60) out.pickups.push(near(it.x, it.z).toFixed(1));
      return out;
    }, { c, day });
    say(`  day ${r.day}: boards ${r.boards.join("; ") || "none within 400 m"}`);
    for (const x of r.races) { say(`    race ${JSON.stringify(x)}`); if (!x.err) worst = Math.min(worst, x.line, x.grid, x.finish, x.gates); }
    if (r.pickups.length) say(`    pickups within 60 m: ${r.pickups.join(", ")}`);
    for (const b of r.boards) { const m = b.match(/ ([\d.]+) \(offer/); if (m) worst = Math.min(worst, +m[1]); }
  }
  // and races posted at the place the structure stands on, which the days above may not have drawn
  const forced = await page.evaluate((c) => {
    const g = window.__game(), Q = g.quests, w = Q.w, near = (x, z) => Math.hypot(x - c.x, z - c.z);
    const at = w.places().sort((a, b) => near(a.x, a.z) - near(b.x, b.z))[0];
    const kind = Q.posts.find((p) => p.kind.id === "race")?.kind;
    if (!at || !kind) return [{ err: "no place or no race kind" }];
    const out = [];
    for (let k = 1; k <= 5; k++) {
      let seed = k * 9301;
      const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const o = kind.offer(r, { x: at.x, z: at.z, name: at.n, pub: false }, w);
      if (!o) continue;
      const R = kind.start(o, w, Date.now(), g.net.selfId, true);
      out.push({ where: o.where, board: +near(o.x, o.z).toFixed(1), line: +near(R.line.x, R.line.z).toFixed(1), grid: +near(R.start.x, R.start.z).toFixed(1), finish: +near(R.fin.x, R.fin.z).toFixed(1), gates: +Math.min(...R.gates.map((q) => near(q.x, q.z))).toFixed(1) });
      R.end?.();
    }
    return out;
  }, c);
  for (const x of forced) { say(`  race posted at the structure's own place: ${JSON.stringify(x)}`); if (!x.err) worst = Math.min(worst, x.board, x.line, x.grid, x.finish, x.gates); }
  say(`  nearest board, race line, grid, gate or finish to the middle: ${worst.toFixed(1)} m ${worst >= 9 ? "(all outside)" : "(INSIDE the kept ground)"}`);
  await page.evaluate(() => { window.__offset = 0; });

  // a look at it
  await page.evaluate((c) => { const g = window.__game(); if (g.riding) g.toggleRide(); g.player.spawn(c.x + 8, c.z + 5, Math.atan2(8, 5)); g.player.pitch = 0.1; }, c);
  await wait(2000);
  await page.screenshot({ path: `${opt.out}/4-structure.png` });
  say("\n" + await silenceNote(page));
} catch (e) {
  errs.push(`probe: ${e.stack ?? e}`);
} finally {
  if (errs.length) say(`errors: ${errs.slice(0, 8).join("\n")}`);
  fs.writeFileSync(`${opt.out}/report.txt`, lines.join("\n") + "\n");
  await browser.close();
  server.close();
}
