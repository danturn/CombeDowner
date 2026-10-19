// A check on who's drawn sat in a vehicle, with three players (tabs in one muted headless Chrome, a
// local test room, as tools/ladder_probe.mjs): a player with only a name tag showing is one the game
// thinks is in a seat. Three players join; one gets in a car and out again; then a seat's made to go
// stale on purpose (the host's list says someone's in a car they've left, as when their getting out
// never reached the host). The others should still draw them, and the host should give the seat up.
//
//   cd web && npx vite build --logLevel error && cd .. && node tools/seat_probe.mjs --out seats
//
// Writes <out>/report.txt, <out>/probe.json and <out>/*.png; exits 1 if a check fails.
import { createRequire } from "module";
import fs from "fs";
import http from "http";
import path from "path";
import { MUTED_ARGS, silence, silenceContext } from "./quiet-guard.mjs";

const WEB = new URL("../web/", import.meta.url).pathname;
const { chromium } = (() => {
  if (process.env.PW) return createRequire(import.meta.url)(process.env.PW);
  try { return createRequire(WEB + "package.json")("playwright"); } catch { return createRequire(import.meta.url)("playwright"); }
})();

const argv = process.argv.slice(2), opt = { dist: WEB + "dist", out: "seats", room: "SEATTEST" + Math.floor(Math.random() * 1000) };
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) opt[argv[i].slice(2)] = argv[++i];
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
const bundled = linux && fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : null;
const exe = process.env.CHROME || bundled;
const browser = await chromium.launch({
  headless: true,
  ...(exe ? { executablePath: exe } : { channel: "chrome" }),
  // both tabs keep running at full speed, though only one is in front
  args: [...MUTED_ARGS, "--disable-renderer-backgrounding", "--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows",
    ...(linux ? ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
      : process.platform === "darwin" ? ["--use-angle=metal", "--enable-gpu"] : [])],
});
const context = await browser.newContext({ viewport: { width: 1100, height: 700 } });
await silenceContext(context);
const complaints = [], checks = [], log = { started: new Date().toISOString(), spots: [] };
const check = (name, ok, detail = "") => { checks.push({ name, ok: !!ok, detail }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ": " + detail : ""}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** A tab in the test room, playing, with the player's movement live (no pointer lock headless). */
async function join(name) {
  const page = await context.newPage();
  page.on("pageerror", (e) => complaints.push(`${name} error: ${e.message}`));
  await page.goto(`http://127.0.0.1:${port}/?map=combe-down&net=local&room=${opt.room}&time=11:00&fx=0`);
  await page.evaluate(() => { window.__budget = 40; });
  await page.waitForFunction(() => !document.getElementById("play")?.disabled, null, { timeout: 120000 });
  await page.fill("#name", name);
  await page.click("#play");
  await page.waitForFunction(() => window.__game && window.__game() && window.__game().map, null, { timeout: 180000 }).catch(async (e) => {
    // say what the menu was showing when it gave up
    const menu = await page.evaluate(() => ["menuerr", "lookupmsg"].map((id) => `${id}: ${document.getElementById(id)?.textContent?.trim() ?? "-"}`).join(" | "));
    throw new Error(`${name} never got into the game (${menu}): ${e.message}`);
  });
  await page.addStyleTag({ content: "#menu,#pause,#debug,#touch,#micask{display:none!important}" });
  await page.evaluate(() => {
    const g = window.__game(), u = g.update.bind(g);
    g.update = (dt) => {
      g.active = true;
      const p = window.__park;
      if (p) { g.player.pos.set(p[0], p[1], p[2]); g.player.vel.set(0, 0, 0); }
      u(dt);
      const c = window.__cam;
      if (c) { g.camera.position.set(c[0], c[1], c[2]); g.camera.lookAt(c[3], c[4], c[5]); g.camera.updateMatrixWorld(); }
      if (g.weapon) g.weapon.scene.visible = !c;
    };
    window.__key = (code, down) => dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { code }));
  });
  return page;
}


log.steps = [];
// what each tab makes of everyone else: in a seat on its list, drawn sat, body drawn, name tag
const look = (page) => page.evaluate(() => {
  const g = window.__game();
  return { me: g.net.selfId, host: g.hostId, riding: !!g.ride, others: [...g.remotes.values()].map((r) => ({
    id: r.id, name: r.name, listed: !!g.vehicles.of(r.id), seated: r.avatar.seated, body: r.avatar.root.visible && r.avatar.body.visible,
    tag: r.avatar.root.visible && r.avatar.label.visible, said: r.inCar ?? null })) };
});
const views = async (tabs, step) => {
  const v = {};
  for (const [n, t] of Object.entries(tabs)) v[n] = await look(t);
  log.steps.push({ step, v });
  return v;
};
const of = (v, id) => v.others.find((o) => o.id === id);

try {
  const tabs = {};
  tabs.A = await join("Ann");
  await wait(2000);
  tabs.B = await join("Bob");
  await wait(2000);
  tabs.C = await join("Cat");
  await wait(4000);
  const ids = {};
  for (const [n, t] of Object.entries(tabs)) ids[n] = await t.evaluate(() => window.__game().net.selfId);
  let v = await views(tabs, "all three in");
  check("everyone sees the other two", Object.values(v).every((x) => x.others.length === 2), JSON.stringify(Object.fromEntries(Object.entries(v).map(([n, x]) => [n, x.others.length]))));
  const host = Object.entries(ids).find(([, id]) => id === v.A.host)?.[0];
  check("everyone agrees who's host", Object.values(v).every((x) => x.host === v.A.host), `host ${host}`);
  // Cat (not the first in, so not host) walks up to the nearest car and gets in
  const car = await tabs.C.evaluate(() => {
    const g = window.__game(), p = g.player.pos;
    const v = g.vehicles.list.filter((o) => o.kind !== "bus" && !o.driver).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
    const at = v.exitSpot(0);
    g.player.spawn(at.x, at.z, 0);
    return { i: v.i, name: v.name, x: v.x, z: v.z };
  });
  // the others stand a few metres off, looking at the car
  for (const n of ["A", "B"]) await tabs[n].evaluate(({ c, k }) => {
    const g = window.__game(); g.player.spawn(c.x + 7 + k * 2, c.z + 3, Math.atan2(7 + k * 2, 3)); g.player.pitch = -0.1;
  }, { c: car, k: n === "A" ? 0 : 1 });
  await wait(2500);
  await tabs.C.evaluate(() => window.__game().useVehicle());
  await wait(3000);
  v = await views(tabs, "Cat in the car");
  check("Cat's in the car", v.C.riding, car.name);
  check("the others draw Cat sat in it", ["A", "B"].every((n) => of(v[n], ids.C)?.seated && !of(v[n], ids.C)?.body && of(v[n], ids.C)?.tag), JSON.stringify([of(v.A, ids.C), of(v.B, ids.C)]));
  await tabs.A.screenshot({ path: `${opt.out}/1-cat-in-the-car.png` });
  await tabs.C.evaluate(() => window.__game().useVehicle());
  await wait(3000);
  v = await views(tabs, "Cat out again");
  check("Cat's out", !v.C.riding);
  check("the others draw Cat walking again", ["A", "B"].every((n) => !of(v[n], ids.C)?.listed && of(v[n], ids.C)?.body), JSON.stringify([of(v.A, ids.C), of(v.B, ids.C)]));
  await tabs.A.screenshot({ path: `${opt.out}/2-cat-out.png` });
  // now the stale seat: every list but Cat's own says Cat's still in the driver's seat, as if Cat's
  // getting out never reached anyone. Cat's game isn't told, so it never says it's out.
  for (const n of ["A", "B"]) await tabs[n].evaluate(({ c, id }) => { const g = window.__game(); g.vehicles.get(c.i).sit(0, id, "#888"); }, { c: car, id: ids.C });
  await wait(800);
  v = await views(tabs, "a stale seat, just after");
  check("with a stale seat, the others still draw Cat's body", ["A", "B"].every((n) => of(v[n], ids.C)?.body && of(v[n], ids.C)?.tag && of(v[n], ids.C)?.said === false), JSON.stringify([of(v.A, ids.C), of(v.B, ids.C)]));
  await tabs[host === "C" ? "B" : "A"].screenshot({ path: `${opt.out}/3-stale-seat.png` });
  await wait(4500);
  v = await views(tabs, "a stale seat, 5 s on");
  check("the host gives the stale seat up, and everyone's list follows", ["A", "B"].every((n) => !of(v[n], ids.C)?.listed), JSON.stringify([of(v.A, ids.C), of(v.B, ids.C)]));
  // the debug panel names each player's version and seat
  const dbg = await tabs.A.evaluate(() => { const el = document.getElementById("debug"); return el ? el.textContent : ""; });
  log.debugText = dbg.slice(0, 3000);
  // and during a stale seat the debug panel says so, on every tab but the stale player's own
  for (const n of ["A", "B"]) await tabs[n].evaluate(({ c, id }) => { const g = window.__game(); g.vehicles.get(c.i).sit(0, id, "#888"); }, { c: car, id: ids.C });
  await wait(1200);
  const flagged = await tabs[host === "A" ? "B" : "A"].evaluate((id) => {
    const r = window.__game().debugInfo().players.find((p) => p.id === id);
    return r ? { staleSeat: r.staleSeat, staleFor: r.staleFor } : null;
  }, ids.C);
  check("the debug panel flags the stale seat", flagged?.staleSeat && flagged.staleFor > 0.5, JSON.stringify(flagged));
} catch (e) {
  complaints.push(`probe: ${e.stack ?? e}`);
} finally {
  log.checks = checks; log.complaints = complaints;
  fs.writeFileSync(`${opt.out}/probe.json`, JSON.stringify(log, null, 1));
  const lines = [...checks.map((c) => `${c.ok ? "PASS" : "FAIL"} ${c.name}${c.detail ? ": " + c.detail : ""}`), "", complaints.length ? complaints.join("\n") : "no page errors"];
  fs.writeFileSync(`${opt.out}/report.txt`, lines.join("\n") + "\n");
  console.log(complaints.length ? complaints.join("\n") : "no page errors");
  await browser.close();
  server.close();
}
process.exit(checks.length && checks.every((c) => c.ok) && !complaints.length ? 0 : 1);
