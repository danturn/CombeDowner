// A quick headless check of travelling between maps (main.ts's travel, game.ts's travelTo):
// start a solo game on Combe Down, travel to Bradford-on-Avon as the train would, and see that
<<<<<<< ours
// the game is now on the new map with the same connection, and that the prompt we boarded by
// went with it. The new Game fills the same page's boxes (web/src/show.ts), so a box that still
// holds a line about the map we left is the bug this guards: a note of what was last shown, kept
// by the game rather than read back from the element, starts empty and skips the new game's first
// write. Run from web/ with the committed build. Exits 1 if a check fails.
=======
// the game is now on the new map with the same connection, and that the old map's on-screen
// prompt went with it (the new Game shares the page's HUD elements, and each one it caches as
// "what I last showed" must start unwritten or the last map's prompt stays up for good).
// Run from web/ with the committed build. Exits 1 if a check fails.
>>>>>>> theirs
import { createRequire } from "module";
// playwright from PW if given, else the game's own (web/node_modules, after npm install), else
// wherever node can find it — as tools/shoot.mjs does
const { chromium } = (() => {
  if (process.env.PW) return createRequire(import.meta.url)(process.env.PW);
  const web = new URL("../web/", import.meta.url).pathname;
  try { return createRequire(web + "package.json")("playwright"); } catch { return createRequire(import.meta.url)("playwright"); }
})();
import http from "http";
import fs from "fs";
import path from "path";
import { MUTED_ARGS, silence } from "./quiet-guard.mjs";

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

const browser = await chromium.launch({ channel: "chrome", args: [...MUTED_ARGS, "--no-first-run"] });
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
await silence(page);
const errs = [];
page.on("pageerror", (e) => errs.push(String(e.message)));
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

/** What the middle of the screen is showing: the prompt the player reads, and whether it's up. */
const prompt = () => page.evaluate(() => {
  const el = document.getElementById("usehint");
  return el && !el.hidden ? (el.textContent ?? "").trim() : "";
});

<<<<<<< ours
// board a real train: stand on Bath Spa's platform and wait for a Bradford train (the one east from
// platform 2, which goes on there: railway.ts's linkFor) to be dwelling there with its doors open, then board it, exactly as E does in the game
=======
// board a real train: stand on Bath Spa's platform and wait for a Bradford train to be dwelling
// there with its doors open, then board it, exactly as E does in the game
>>>>>>> theirs
const boarded = await page.evaluate(async () => {
  const g = window.__game();
  window.__before = g;
  const rail = g.world.railway;
  const pl = rail.platform("Bath Spa");
  // stand on the platform first, and let the game run a few frames so trains near here are made
  g.player.spawn(pl.centre[0], -pl.centre[1], 0);
  // Put a Bradford train at Bath Spa rather than waiting for one to happen along. The trains run to
  // the game's own clock (railway.ts's tick: this.clock += dt, eased back to the wall clock), so
  // pushing the clock on is the same as time passing, and the timetable puts the next dwell a
  // known distance ahead. Waiting was both slow (a 400 s headway) and flaky.
  // Two routes dwell at Bath Spa at once (the main line and the valley line, on different
  // platforms) and only one carries the link, so take the line the link names.
  const link = (rail.d.links ?? []).find((l) => l.to_station === "Bradford-on-Avon");
  const line = link?.line;
  // Step the clock on in half-second frames until that line's train is dwelling here with its doors
  // open. Find it stopped first, then keep stepping while the doors open: at the moment a train
  // arrives `into` is 0, so tr.open is still 0 for the first DOOR_OPEN seconds of the dwell.
  let dwell = null;
  const seeked = { frames: 0 };
  const dwelling = () => rail.trainsNow().find((t) => t.stop === "Bath Spa" && t.route === line);
  for (let i = 0; i < 2500 && !dwelling(); i++) {
    rail.update(0.5, g.player.pos.x, g.player.pos.y, g.player.pos.z, true);
    seeked.frames++;
  }
  for (let i = 0; i < 40 && !dwell; i++) {
    const t = rail.trainsNow().find((q) => q.stop === "Bath Spa" && q.route === line && q.open > 0.9);
    if (t) { dwell = t; break; }
    rail.update(0.25, g.player.pos.x, g.player.pos.y, g.player.pos.z, true);
    seeked.frames++;
  }
  if (dwell) {
    // Walk to a real doorway and stand at it, which is the one way onto a train now (doorAt): not
    // "somewhere near the carriage". Take the train we came for, not whichever one is nearest.
    let at = null;
    for (const tr of rail.trains.values()) {
      if (tr.route.name !== line || !tr.stop || tr.open < 0.9) continue;
      for (const c of tr.cars) {
        if (!c.mesh.visible || !c.doors.length) continue;
        // a doorway, on the platform side of the carriage
        const off = c.doors[Math.floor(c.doors.length / 2)];
        const cs = Math.cos(c.a), sn = Math.sin(c.a);
        const side = 1.2;
        const x = c.x + off * cs + side * sn, z = c.z - off * sn + side * cs;
        at = { x, z, y: c.y - 0.45, route: tr.route.name };
        break;
      }
      if (at) break;
    }
    if (!at) return { found: "no doorway on the Bradford train", at: dwell, line };
    g.player.spawn(at.x, at.z, 0);
    // the game's own test of "am I at a door": this is what E and the prompt both use now
    const route = rail.doorAt(g.player.pos.x, g.player.pos.z, g.player.pos.y, 0.35);
    if (!route) return { found: "stood at a doorway but doorAt found nothing", at, line };
    if (route.name !== line) return { found: "at the wrong train's door", wanted: line, got: route.name, at };
    // Press E here and now. The dwell is only DWELL (35 s) of the game's clock and we have just
    // stepped that clock to the doors opening, so pressing in a later frame risks finding the train
    // gone: board on the same tick, by the same path the key takes (trainUse with no argument asks
    // doorAt, exactly as a player's press does).
    g.useKey = true;
    g.update(1 / 60);
    return { route: route.name, stop: dwell.stop, open: dwell.open, found: "at a door", line,
             pressed: true, pending: g.pendingArrival ?? null };
  }
  return { found: "no Bradford train dwelling at Bath Spa", line, trains: rail.trainsNow().slice(0, 8) };
});
// the prompt we're about to board by: it must not outlive the map it belongs to, so remember it
// now, while we're stood at the train, rather than after the game has started the journey.
// Standing beside a dwelling train is what puts it up, so let a few frames of play draw it first.
let promptBefore = "";
for (let i = 0; i < 50 && !promptBefore; i++) {
  promptBefore = await prompt();
  if (!promptBefore) await new Promise((r) => setTimeout(r, 100));
}
const ok = await page.evaluate(() => {
  const g = window.__game();
  // Two things would otherwise let this check pass on code that still has the bug, so both are
  // settled before we board — the fault only shows itself if the last map's prompt survives the
  // swap intact for the new game to have to clear:
  //  - the Bath game keeps ticking through the journey and can clear its own prompt first, when the
  //    train we boarded shuts its doors or pulls out. Freeze its updates as the journey starts, so
  //    the prompt it left up is still there for the new game.
  const travel = g.onTravel;
  if (travel) g.onTravel = (toMap, carry) => { travel(toMap, carry); g.update = () => {}; };
  //  - the platform we arrive at can have a train of its own stood at it, and "Board the Bath Spa
  //    train" is a prompt the new map draws for real: it would take the stale one's place and hide
  //    the fault. Let only Bath answer at a train door, so nothing is drawn at the far end.
  const rail = g.world.railway;
  if (rail) {
    const proto = Object.getPrototypeOf(rail), door = proto.doorAt;
    proto.doorAt = function (x, z, y, r) { return window.__map().d.id === "combe-down" ? door.call(this, x, z, y, r) : null; };
  }
  return true;
});
const t1=Date.now();
<<<<<<< ours
// Watch the journey rather than sampling it once at the end: one reading can't tell "travel never
// started" from "travel started and was still fetching the far map when we looked", and it reads
// the wrong map when nothing swapped, because window.__map is current.map and current flips
// mid-journey.
const journey = [];
for (let i = 0; i < 200; i++) {
  const s = await page.evaluate(() => ({
    stage: window.__travelStage ?? "never",
    err: window.__travelError ?? null,
    map: window.__map()?.d?.id ?? null,
    pending: (() => { try { return window.__game()?.pendingArrival ?? null; } catch { return null; } })(),
  }));
  journey.push({ ms: Math.round(Date.now() - t1), ...s });
  if (s.stage === "built" || s.err) break;
  await new Promise((r) => setTimeout(r, 100));
}
const reachedBuilt = journey.some((j) => j.stage === "built");
const travelMs = journey.length ? journey[journey.length - 1].ms : 0;
// the stages it went through, in order, with the map each was on: this is what says whether travel
// was ever attempted at all
const stages = journey.filter((j, i) => i === 0 || j.stage !== journey[i - 1].stage || j.map !== journey[i - 1].map)
  .map((j) => `${j.stage}@${j.map}${j.pending ? `(arriving ${j.pending})` : ""}${j.err ? ` !${j.err}` : ""}`);
const after = reachedBuilt ? await page.evaluate(() => window.__map().d.id) : null;
=======
// Step off to open ground, well clear of the platform and any train, where the new map has nothing
// to prompt about. Done here, the instant the new game exists, so that nothing the arrival itself
// would prompt about (the train we came in on, stood at the platform) is ever drawn: a prompt that
// changes makes the stale one look updated, and hides the fault we're checking for.
await page.waitForFunction(() => {
  if (window.__travelError) return true;
  if (window.__travelStage !== 'built') return false;
  const g = window.__game(), pl = g.world.railway?.platform("Bradford-on-Avon");
  const away = 300;
  g.player.spawn(pl ? pl.centre[0] + away : g.player.pos.x + away, pl ? -pl.centre[1] : g.player.pos.z, 0);
  return true;
}, null, { timeout: 15000 }).catch(()=>{});
const travelMs=Date.now()-t1;
const after = await page.evaluate(() => window.__map().d.id);
>>>>>>> theirs
const travelError = await page.evaluate(() => window.__travelError ?? null);
const onPlat = await page.evaluate(() => {
  const g = window.__game();
  const rail = g.world.railway;
  const pl = rail?.platform("Bradford-on-Avon");
  const p = g.player.pos;
  // a linked train should be dwelling at the platform we've stepped off onto, doors open, just
  // behind us (railway.ts's linkPhase puts its dwell on the same grid as the one at Bath Spa)
  const here = rail ? rail.trainsNow().filter((t) => t.stop === "Bradford-on-Avon" && t.open > 0.9 && Math.hypot(t.x - p.x, t.z - p.z) < 60) : [];
  return { hasRail: !!rail, plats: rail ? rail.d.platforms.map((q) => q.n) : null,
           pl: pl ? pl.centre : null, pos: [Math.round(p.x), Math.round(p.z)],
           railwayIsBoa: rail ? rail.d.platforms.every((q) => q.n === "Bradford-on-Avon") : null,
           sameGameObject: g === window.__before,
           railLink: rail ? (rail.d.links ?? []).map((l) => l.to) : null,
           trainHere: here.length ? { stop: here[0].stop, open: here[0].open, dist: Math.round(Math.hypot(here[0].x - p.x, here[0].z - p.z)) } : null,
           stage: window.__travelStage ?? "never" };
});

// The prompt must go now we're stood where the new map has nothing to prompt about, or it's the one
// we boarded by at Bath, still up because this game shares the page's one set of HUD elements.
let promptAfter = promptBefore;
for (let i = 0; i < 60 && promptAfter; i++) {
  promptAfter = await prompt();
  if (promptAfter) await new Promise((r) => setTimeout(r, 100));
}
const stalePrompt = promptAfter !== "";
<<<<<<< ours
const noTrain = !onPlat.trainHere;
console.log(JSON.stringify({ before, boarded, travelAccepted: ok, after, reachedBuilt, stages, travelError, travelMs, arrival: onPlat, promptBefore, promptAfter, errors: errs.slice(0, 3) }));
console.log(`journey: ${stages.join(" -> ") || "(no stage change)"} in ${travelMs} ms`);
// Everything below only means anything if the map actually swapped: reading the arrival platform
// while still in Bath says nothing about arriving.
if (!reachedBuilt) {
  console.log(`FAIL travel never completed (last stage "${journey[journey.length - 1]?.stage ?? "never"}", map "${journey[journey.length - 1]?.map ?? "?"}")`);
  await browser.close();
  server.close();
  process.exit(1);
}
console.log(`${stalePrompt ? "FAIL" : "PASS"} the prompt went with the map (was "${promptBefore}", now "${promptAfter}")`);
console.log(`${noTrain ? "FAIL" : "PASS"} a train is at the platform we stepped off onto (${onPlat.trainHere ? `${onPlat.trainHere.stop}, doors open, ${onPlat.trainHere.dist} m behind` : "none dwelling"})`);
await browser.close();
server.close();
process.exit(stalePrompt || noTrain ? 1 : 0);
=======
console.log(JSON.stringify({ before, boarded, travelAccepted: ok, after, travelError, travelMs, arrival: onPlat, promptBefore, promptAfter, errors: errs.slice(0, 3) }));
console.log(`${stalePrompt ? "FAIL" : "PASS"} the prompt went with the map (was "${promptBefore}", now "${promptAfter}")`);
await browser.close();
server.close();
process.exit(stalePrompt ? 1 : 0);
>>>>>>> theirs
