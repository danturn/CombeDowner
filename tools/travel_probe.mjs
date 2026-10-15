// A quick headless check of travelling between maps (main.ts's travel, game.ts's travelTo):
// start a solo game on Combe Down, travel to Bradford-on-Avon as the train would, and see that
// the game is now on the new map with the same connection. Run from web/ with the committed build.
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { chromium } = process.env.PW ? require(process.env.PW) : require("playwright");
import http from "http";
import fs from "fs";
import path from "path";

const DIST = path.join(new URL("../web/", import.meta.url).pathname, "dist");
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

const browser = await chromium.launch({ channel: "chrome", args: ["--mute-audio", "--no-first-run"] });
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
const errs = [];
page.on("pageerror", (e) => errs.push(String(e.message)));
// (audio stays quiet anyway: Chrome is launched with --mute-audio)
await page.goto(`http://127.0.0.1:${port}/?map=combe-down&net=local`);
page.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text().slice(0, 200)); });
page.on("requestfailed", (r) => errs.push("reqfail: " + r.url().slice(-40)));
// wait for the menu, then start a solo game
await page.waitForSelector("#solo", { state: "visible", timeout: 30000 }).catch(async () => {
  const html = await page.evaluate(() => ({ loading: document.getElementById("loading")?.textContent, menuHidden: document.getElementById("menu")?.hidden, body: document.body.innerHTML.length }));
  console.log("menu did not appear:", JSON.stringify(html), "errors:", errs.slice(0, 5));
  throw new Error("no menu");
});
await page.click("#solo");
await page.waitForFunction(() => !!(window.__game && window.__game()), null, { timeout: 30000 });
const before = await page.evaluate(() => window.__map().d.id);

// travel as boarding a train would: to berth at Bradford-on-Avon's station
const ok = await page.evaluate(() => {
  const g = window.__game();
  window.__before = g;
  const pl = g.world.railway?.platform("Bath Spa");
  g.pendingArrival = "Bradford-on-Avon";   // as boarding a train does
  return g.travelTo("bradford-on-avon", { x: pl ? pl.centre[0] : 0, z: 0, yaw: 0 });
});
const t1=Date.now();
await page.waitForFunction(() => window.__travelStage === 'built' || window.__travelError, null, { timeout: 15000 }).catch(()=>{});
const travelMs=Date.now()-t1;
const after = await page.evaluate(() => window.__map().d.id);
const travelError = await page.evaluate(() => window.__travelError ?? null);
const onPlat = await page.evaluate(() => {
  const g = window.__game();
  const rail = g.world.railway;
  const pl = rail?.platform("Bradford-on-Avon");
  const p = g.player.pos;
  return { hasRail: !!rail, plats: rail ? [...(rail.platforms?.keys?.() ?? [])] : null,
           pl: pl ? pl.centre : null, pos: [Math.round(p.x), Math.round(p.z)],
           railwayIsBoa: rail ? rail.d.platforms.every((q) => q.n === "Bradford-on-Avon") : null,
           sameGameObject: g === window.__before,
           railLink: rail ? (rail.d.links ?? []).map((l) => l.to) : null,
           stage: window.__travelStage ?? "never" };
});

console.log(JSON.stringify({ before, travelAccepted: ok, after, travelError, travelMs, arrival: onPlat, errors: errs.slice(0, 3) }));
await browser.close();
server.close();
