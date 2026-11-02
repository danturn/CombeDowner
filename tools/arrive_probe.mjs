// Arriving somewhere new, headless and muted: start a solo game, jump across the map (the debug
// panel's Go to), come back to life, go to a pub, and on Bath take the train to Bradford-on-Avon.
// After each jump it shoots the screen about every 100 ms for a few seconds, and logs how long the
// arrival cover (arrive.ts) stayed up and how many squares were still coming in, so a run before a
// change and one after it can be laid side by side.
//
//   node tools/arrive_probe.mjs --map combe-down --out shots/arrive --tag after [--dist web/dist] [--secs 4]
//
// --cases goto,respawn,pub,travel picks which jumps follow the start; --query "at=-820,1736" adds to the
// address (start somewhere else, so coming back to life is a jump to unbuilt streets).
// Writes <out>/<map>-<case>-<tag>-NN.png and <out>/<map>-<tag>.json.
import { createRequire } from "module";
import fs from "fs";
import http from "http";
import path from "path";
import { MUTED_ARGS, silence, silenceContext, silenceNote } from "./quiet-guard.mjs";

const WEB = new URL("../web/", import.meta.url).pathname;
const { chromium } = (() => {
  if (process.env.PW) return createRequire(import.meta.url)(process.env.PW);
  try { return createRequire(WEB + "package.json")("playwright"); } catch { return createRequire(import.meta.url)("playwright"); }
})();

const argv = process.argv.slice(2), opt = { dist: WEB + "dist", out: "shots/arrive", tag: "", map: "combe-down", secs: "4", size: "960x540", cases: "goto,respawn,pub,travel" };
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) opt[argv[i].slice(2)] = argv[++i];
const want = new Set(opt.cases.split(","));
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

const browser = await chromium.launch({ headless: true, channel: "chrome",
  args: [...MUTED_ARGS, ...(process.platform === "darwin" ? ["--use-angle=metal", "--enable-gpu"] : [])] });
const context = await browser.newContext({ viewport: { width: W, height: H } });
await silenceContext(context);
const page = await context.newPage();
await silence(page);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

const state = () => page.evaluate(() => {
  const el = document.getElementById("arrive");
  return { pending: window.__tilesPending ?? -1, cover: !!el && !el.hidden && getComputedStyle(el).opacity !== "0",
    text: el && !el.hidden ? el.textContent.trim().replace(/\s+/g, " ") : "" };
});

/** Shoot the screen about every 100 ms from now for secs, logging the cover and the squares. */
async function burst(name, secs = +opt.secs) {
  const t0 = Date.now(), frames = [];
  let up = null, down = null, text = "";
  for (let i = 0; Date.now() - t0 < secs * 1000; i++) {
    const s = await state(), t = Date.now() - t0;
    if (s.cover && up === null) { up = t; text = s.text; }
    if (!s.cover && up !== null && down === null) down = t;
    const file = path.join(opt.out, `${opt.map}-${name}${opt.tag ? "-" + opt.tag : ""}-${String(i).padStart(2, "0")}.png`);
    await page.screenshot({ path: file });
    frames.push({ t, pending: s.pending, cover: s.cover, file });
    const wait = (i + 1) * 100 - (Date.now() - t0);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }
  // the cover can outlast the burst: keep watching (unshot) until it lifts
  while (up !== null && down === null && Date.now() - t0 < 15000) {
    if (!(await state()).cover) down = Date.now() - t0;
    else await new Promise((r) => setTimeout(r, 50));
  }
  const firstCalm = frames.find((f) => f.pending === 0 && frames.slice(frames.indexOf(f)).every((g) => g.pending === 0));
  const r = { name, coverUpMs: up, coverDownMs: down, coverText: text, calmFromMs: firstCalm?.t ?? null, frames };
  console.log(`${opt.map} ${name}: cover ${up === null ? "never up" : `up ${up}..${down} ms "${text}"`}; squares calm from ${r.calmFromMs ?? "never"} ms`);
  return r;
}

/** Until the squares round the view are in and have stayed so a while, as tools/shoot.mjs waits. */
async function settle() {
  await page.evaluate(() => { window.__probeCalm = window.__calm ? window.__calm(30, 1500) : null; });
  await page.waitForFunction(() => {
    const p = window.__tilesPending;
    if (window.__probeCalm) return window.__probeCalm.still(p ?? 1);
    if (p !== 0) { window.__c = null; return false; }   // a build from before the shared test
    const c = (window.__c ??= { frames: 0, t: performance.now() });
    return ++c.frames >= 30 && performance.now() - c.t > 1500;
  }, null, { timeout: 30000, polling: "raf" }).catch(() => console.log("  (not settled)"));
}

const log = { map: opt.map, tag: opt.tag, cases: [] };
await page.goto(`http://127.0.0.1:${port}/?map=${opt.map}&time=11:00${opt.query ? "&" + opt.query : ""}`);
await page.waitForFunction(() => !document.getElementById("solo")?.disabled, null, { timeout: 120000 });
await page.addStyleTag({ content: "#scoreboard{display:none!important}" });   // the Chronicle on joining covers the view
await page.evaluate(() => document.getElementById("solo").click());
log.cases.push(await burst("start", +opt.secs + 2));
await settle();

// as far across the map as there's a pub inside the force field: the debug panel's Go to, then a respawn back where everyone starts, then a pub
const spots = await page.evaluate(() => {
  const g = window.__game(), far = g.pubs().sort((a, b) => b.far - a.far);
  return { go: far[0] ? g.outside(g.pubList[far[0].i]) : null, pubs: far.length, far: Math.round(far[0]?.far ?? 0) };
});
if (want.has("goto")) {
console.log("  goto now", await page.evaluate((at) => { const g = window.__game(); const a = [g.alive, Math.round(g.player.pos.x)]; g.goToSpot({ x: at.x, z: at.z, yaw: 0, pitch: 0 }); return [...a, Math.round(g.player.pos.x), Math.round(g.player.pos.z)]; }, spots.go));
log.cases.push(await burst("goto"));
console.log("  at", await page.evaluate(() => { const p = window.__game().player.pos; return [Math.round(p.x), Math.round(-p.z)]; }), "asked", spots);
await settle();
}
if (want.has("respawn")) {
// --respawn-at "east,north" comes back to life there, as a train or the mines' door would set you down
await page.evaluate((at) => { const g = window.__game(); g.alive = false; g.respawn(at ? { x: at[0], z: -at[1], yaw: 0 } : undefined); },
  opt["respawn-at"] ? opt["respawn-at"].split(",").map(Number) : null);
log.cases.push(await burst("respawn"));
await settle();
}
if (want.has("pub")) {
const pubAt = await page.evaluate(() => {
  const g = window.__game(), far = g.pubs().sort((a, b) => b.far - a.far)[0];
  return far ? `${g.goTo(far.i) ?? "ok"}, ${Math.round(far.far)} m` : "no pubs";
});
console.log(`  pub: ${pubAt}`);
log.cases.push(await burst("pub"));
await settle();
}
if (want.has("travel") && opt.map === "combe-down") {
  await page.evaluate(() => {
    const g = window.__game();
    g.pendingArrival = "Bradford-on-Avon";
    g.blackout("Bath Spa to Bradford-on-Avon");
    g.travelTo("bradford-on-avon", { x: g.player.pos.x, z: g.player.pos.z, yaw: 0 }, 0);
  });
  log.cases.push(await burst("travel", +opt.secs + 4));
}
log.errors = [...new Set(errors)];
log.audio = await silenceNote(page);
console.log(log.audio);
fs.writeFileSync(path.join(opt.out, `${opt.map}${opt.tag ? "-" + opt.tag : ""}.json`), JSON.stringify(log, null, 1));
await browser.close();
server.close();
