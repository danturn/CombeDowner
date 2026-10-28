// Shots of a Wanted bounty as a first-time player meets it, in a muted headless Chrome: the
// splash, the poster brought back on the job control, the search circle from inside, outside and
// above, the big map, a clue's beam and its prompt, the call-out as the circle shrinks, the poster
// after a witness, the card beside the crosshair on a lookalike (up close and through binoculars),
// and the results card. Run with the keyboard, a made-up pad (a stubbed navigator.getGamepads) and a
// touch screen, at a desktop size and a phone's. Checks that no prompt names a raw key on a pad or
// touch screen.
//
//   cd web && npx vite build --logLevel error && cd .. && node tools/wanted_probe.mjs <out folder> [--only keys-1280]
//
// Writes the shots and index.txt (what each shot is) to the folder; exits 1 if a check fails.
import { createRequire } from "module";
import fs from "fs";
import http from "http";
import path from "path";
import { MUTED_ARGS, silence, silenceContext, silenceNote } from "./quiet-guard.mjs";

const WEB = new URL("../web/", import.meta.url).pathname;
const { chromium } = createRequire(WEB + "package.json")("playwright");
const argv = process.argv.slice(2);
const OUT = argv[0] ?? "wantedprobe";
const only = argv.includes("--only") ? argv[argv.indexOf("--only") + 1] : "";
fs.mkdirSync(OUT, { recursive: true });
const dist = WEB + "dist";
const TYPES = { ".js": "text/javascript", ".html": "text/html", ".css": "text/css", ".json": "application/json" };
const server = http.createServer((q, res) => {
  let f = path.join(dist, decodeURIComponent(q.url.split("?")[0])); if (f.endsWith("/")) f += "index.html";
  fs.readFile(f, (e, b) => { if (e) { res.statusCode = 404; return res.end(); } res.setHeader("content-type", TYPES[path.extname(f)] || "application/octet-stream"); res.end(b); });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const browser = await chromium.launch({ headless: true, channel: "chrome", args: [...MUTED_ARGS, "--use-angle=metal", "--enable-gpu"] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const index = [];
const checks = [];
const check = (n, ok, d = "") => { checks.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}: ${d}`); };
const RAW = /<b>[A-Z]<\/b>|\b(?:Press|press|Hold|hold) [A-Z]\b|\b[A-Z] to |\bW\/S\b|\bA\/D\b|\bSpace\b|\bEsc\b|\(J\)|\bJ brings/;

const RUNS = [
  { name: "keys-1280", mode: "keys", w: 1280, h: 720 },
  { name: "pad-1280", mode: "pad", w: 1280, h: 720 },
  { name: "keys-844", mode: "keys", w: 844, h: 390 },
  { name: "touch-844", mode: "touch", w: 844, h: 390 },
].filter((r) => !only || r.name === only);

try {
  for (const run of RUNS) {
    const context = await browser.newContext({ viewport: { width: run.w, height: run.h } });
    await silenceContext(context);
    await context.addInitScript(() => {
      window.__pad = { buttons: Array.from({ length: 18 }, () => ({ pressed: false, touched: false, value: 0 })), axes: [0, 0, 0, 0] };
      const g = () => ({ id: "Stub pad (STANDARD GAMEPAD)", index: 0, connected: true, mapping: "standard", timestamp: performance.now(), buttons: window.__pad.buttons, axes: window.__pad.axes });
      navigator.getGamepads = () => [g()];
    });
    const page = await context.newPage();
    await silence(page);
    page.on("pageerror", (e) => console.log("pageerror", e.message));
    const shot = async (what, about) => {
      const file = `${run.name}-${what}.png`;
      await page.screenshot({ path: `${OUT}/${file}` });
      index.push(`${file}: ${about}`);
      console.log("shot", file);
    };
    const pressPad = async (b, ms = 150) => {
      await page.evaluate((b) => { window.__pad.buttons[b].pressed = true; window.__pad.buttons[b].value = 1; }, b); await wait(ms);
      await page.evaluate((b) => { window.__pad.buttons[b].pressed = false; window.__pad.buttons[b].value = 0; }, b); await wait(300);
    };
    /** The job control, as this run's player would press it. */
    const job = async () => {
      if (run.mode === "keys") await page.keyboard.press("KeyJ");
      else if (run.mode === "pad") await pressPad(17, 600);
      else await page.evaluate(() => [...document.querySelectorAll("#touch button")].find((b) => b.textContent === "Poster" && !b.hidden)?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
      await wait(500);
    };
    const use = async () => {
      if (run.mode === "keys") { await page.keyboard.down("KeyE"); await wait(120); await page.keyboard.up("KeyE"); }
      else if (run.mode === "pad") await pressPad(2);
      else await page.evaluate(() => window.__game().useCar());
      await wait(400);
    };
    const text = (sel) => page.evaluate((s) => [...document.querySelectorAll(s)].filter((e) => !e.hidden).map((e) => e.textContent).join(" | "), sel);
    const named = async (where, sel) => {
      const t = await text(sel);
      if (run.mode !== "keys") check(`${run.name}: ${where} names no raw key`, !RAW.test(t), t.slice(0, 200));
      return t;
    };

    await page.goto(`http://127.0.0.1:${port}/?map=combe-down&time=11:00&fx=0`);
    console.log(await silenceNote(page));
    await page.waitForFunction(() => window.__game && !document.getElementById("solo")?.disabled, null, { timeout: 180000 });
    await page.evaluate(() => document.getElementById("solo").click());
    await page.waitForFunction(() => window.__game && window.__game() && window.__game().quests, null, { timeout: 180000 });
    await page.evaluate((mode) => {
      const g = window.__game(), u = g.update.bind(g);
      g.update = (dt) => { g.active = true; document.getElementById("pause").hidden = true; u(dt); };
      g.passive = true;   // nobody goes for you, so the shots aren't of a respawn
      if (mode === "touch") { g.freeMode = true; document.getElementById("touch").hidden = false; }
    }, run.mode);
    await page.addStyleTag({ content: "#menu,#debug,#micask,#chronicle,#scoreboard{display:none!important}" });
    await page.evaluate(() => { document.getElementById("scoreboard").hidden = true; });
    await wait(1500);
    if (run.mode === "pad") { await page.evaluate(() => { window.__pad.axes[2] = 0.5; }); await wait(150); await page.evaluate(() => { window.__pad.axes[2] = 0; }); await wait(300); }
    if (run.mode === "keys") { await page.mouse.move(run.w / 2, run.h / 2); await page.keyboard.press("ShiftLeft"); }

    // ---- start a bounty: today's poster if there is one, else one made up from a seed
    const started = await page.evaluate(() => {
      const g = window.__game(), q = g.quests;
      const p = q.posts.find((p) => p.offer.kind === "wanted");
      const me = g.player.pos;
      const o = p?.offer ?? { kind: "wanted", seed: 424242, stars: 2, title: "Wanted: the Duke of Disorder", blurb: "", reward: "", x: me.x, z: me.z, where: "" };
      q.take(o);
      return q.job ? `${q.job.offer.title} (${q.job.d.haunts.map((h) => h.label).join(" > ")})` : "no job";
    });
    check(`${run.name}: a bounty started`, !/no job/.test(started), started);
    await wait(2500);
    await shot("01-splash", "the splash as the bounty starts: the poster, his round, the clock and how to catch him");
    await named("the splash", ".wsc, #mprog");

    // ---- the poster again, on the job control
    await page.evaluate(() => window.__game().quests.job.recall() && window.__game().quests.job.recall());   // splash off
    await wait(300);
    await job();
    const up = await page.evaluate(() => !!document.querySelector(".tsc-card.wsc:not([hidden])"));
    check(`${run.name}: the job control brings the poster back`, up);
    await shot("02-poster", "the poster brought back with the job control");
    await named("the poster", ".tsc-card.wsc");
    await job();
    await wait(800);
    await shot("02b-far-minimap", "from the noticeboard, far from the circle: the minimap's rim arrow with how far to the circle");

    // ---- the circle: from inside, outside, above, and on the big map
    const toEdge = (inside) => page.evaluate((inside) => {
      const g = window.__game(), z = g.quests.job.zone, a = 0.6, d = inside ? z.r - 30 : z.r + 45;
      const x = z.x + Math.cos(a) * d, zz = z.z + Math.sin(a) * d;
      g.player.spawn(x, zz, 0);
      // facing the edge from inside, the middle from outside
      const dx = inside ? Math.cos(a) : -Math.cos(a), dz = inside ? Math.sin(a) : -Math.sin(a);
      g.player.yaw = Math.atan2(-dx, -dz); g.player.pitch = 0.02;
      return [Math.round(z.r), Math.round(x), Math.round(zz)];
    }, inside);
    const settle = (ms) => wait(ms);
    console.log("circle", await toEdge(true));
    await settle(7000);
    await shot("03-circle-inside", "the circle's edge from just inside it (wall of light, band on the ground), with the minimap");
    await named("the job card", "#mprog");
    await toEdge(false);
    await settle(5000);
    await shot("04-circle-outside", "the circle from just outside it, looking in; the search-area marker on the compass");
    await page.evaluate(() => {
      const g = window.__game(), p = g.player, up = p.update.bind(p), z = g.quests.job.zone;
      const x = z.x + Math.cos(0.6) * (z.r + 160), zz = z.z + Math.sin(0.6) * (z.r + 160);
      p.spawn(x, zz, 0);
      const y = g.map.ground(x, zz) + 140;
      p.yaw = Math.atan2(Math.cos(0.6), Math.sin(0.6)); p.pitch = -0.42;
      p.update = (...a) => { const r = up(...a); p.pos.set(x, y, zz); p.vel?.set?.(0, 0, 0); return r; };
      window.__unhover = () => { p.update = up; };
    });
    await settle(6000);
    await shot("05-circle-above", "the circle from 140 m up, looking down on it");
    await page.evaluate(() => window.__unhover());
    await toEdge(true);
    await settle(1500);
    if (run.mode === "keys") await page.keyboard.press("KeyM"); else if (run.mode === "pad") await pressPad(17, 120); else await page.evaluate(() => window.__game().toggleMap());
    await wait(1500);
    await shot("06-bigmap", "the big map with the circle, and the poster over it");
    if (run.mode === "keys") await page.keyboard.press("KeyM"); else if (run.mode === "pad") await page.evaluate(() => window.__game().toggleMap()); else await page.evaluate(() => window.__game().toggleMap());
    await wait(600);

    // ---- a clue: its beam from afar, its prompt, and the circle shrinking
    let clue = null;
    for (let t = 0; t < 30 && !clue; t++) {
      clue = await page.evaluate(() => {
        const j = window.__game().quests.job;
        const c = j.clues.find((c) => c.t === 1) ?? j.clues[0];
        if (!c) return null;
        c.t = 1;   // a witness, for the poster's sake
        return { n: c.n, x: c.x, z: c.z };
      });
      if (!clue) await wait(500);
    }
    check(`${run.name}: a clue placed in the circle`, !!clue, JSON.stringify(clue));
    if (clue) {
      await page.evaluate((c) => {
        const g = window.__game(), p = g.player, m = g.map;
        // somewhere 30 to 60 m off with a clear view of it
        let best = [c.x + 45, c.z + 20];
        for (let k = 0; k < 64; k++) {
          const a = k * 2.4, d = 30 + (k % 4) * 10, x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d, y = m.ground(x, z) + 1.7;
          if (m.indoors(x, z) || m.blocked(x, z, 0.5)) continue;
          const ty = m.ground(c.x, c.z) + 3, dx = c.x - x, dy = ty - y, dz = c.z - z, len = Math.hypot(dx, dy, dz);
          const hit = m.raycast(x, y, z, dx / len, dy / len, dz / len, len);
          if (!hit || hit.dist > len - 2) { best = [x, z]; break; }
        }
        p.spawn(best[0], best[1], 0);
        const dx = c.x - best[0], dz = c.z - best[1];
        p.yaw = Math.atan2(-dx, -dz); p.pitch = 0.1;
      }, clue);
      await settle(5000);
      await shot("07-clue-afar", "a clue 50 m off: its red beam with a ? over it, and on the compass");
      await page.evaluate((c) => {
        const g = window.__game(), j = g.quests.job, v = j.views.get(c.n) ?? c, p = g.player;
        p.spawn(v.x + 1.5, v.z, 0); p.yaw = Math.atan2(1, 0); p.pitch = -0.1;
      }, clue);
      await wait(1500);
      await shot("08-clue-prompt", "stood at a witness: the prompt to ask them");
      await named("the clue prompt", "#usehint");
      await use();
      await wait(700);
      await shot("09-shrink-callout", "the call-out as the circle shrinks: how small now, and what the witness said");
      await named("the call-out", ".tsc-call");
      await wait(4500);
      await job();
      await shot("10-poster-witness", "the poster after a witness: the third feature as they said it, not yet sworn");
      await job();
      await use();
      await wait(800);
      await job();
      await shot("11-poster-pressed", "the poster after the witness is pressed: ticked if they swore, crossed if they backed down");
      await job();
    }

    // ---- the lookalikes: up close, then through binoculars
    const stop = await page.evaluate(() => {
      const g = window.__game(), j = g.quests.job, [sx, sz] = j.stopOf(j.h);
      g.player.spawn(sx + 25, sz + 10, 0);
      return [sx, sz];
    });
    let crew = 0;
    for (let t = 0; t < 40 && !crew; t++) { await wait(500); crew = await page.evaluate(() => { const j = window.__game().quests.job; return j.ring ? j.crew.length + 1 : 0; }); }
    check(`${run.name}: he and his lookalikes turned up`, crew > 1, `${crew} men at ${stop.map(Math.round)}`);
    const aimAt = (who, from, zoom) => page.evaluate(([who, from, zoom]) => {
      const g = window.__game(), j = g.quests.job, ch = g.naughtyBoys, p = g.player;
      const list = [j.ring, ...j.crew].filter((c) => c && ch.at(c.i)?.alive);
      const c = who === "him" ? j.ring : list.find((c) => c !== j.ring && j.dressed().some((d) => d.i === c.i)) ?? list[1];
      if (!c) return "nobody";
      const b = ch.at(c.i), m = g.map;
      if (from) {
        // somewhere about that far off with a clear view of him
        let best = [b.x + from, b.z];
        for (let k = 0; k < 96; k++) {
          const ang = k * 2.4, d = from * (0.8 + (k % 3) * 0.2), x = b.x + Math.cos(ang) * d, z = b.z + Math.sin(ang) * d, y = m.ground(x, z) + 1.7;
          if (m.indoors(x, z) || m.blocked(x, z, 0.5)) continue;
          const ty = b.y + 1.2, dx = b.x - x, dy = ty - y, dz = b.z - z, len = Math.hypot(dx, dy, dz);
          const hit = m.raycast(x, y, z, dx / len, dy / len, dz / len, len);
          if (!hit || hit.dist > len - 1) { best = [x, z]; break; }
        }
        p.spawn(best[0], best[1], 0);
      }
      const look = () => {
        const b = ch.at(c.i); if (!b) return;
        const e = g.camera.position, dx = b.x - e.x, dz = b.z - e.z, dy = b.y + 1.2 - e.y;
        p.yaw = Math.atan2(-dx, -dz); p.pitch = Math.atan2(dy, Math.hypot(dx, dz));
      };
      clearInterval(window.__aim); window.__aim = setInterval(look, 30); look();
      if (zoom && !g.binoculars) g.toggleBinoculars();
      if (!zoom && g.binoculars) g.toggleBinoculars();
      return `${who} ${c.i}`;
    }, [who, from, zoom]);
    if (crew > 1) {
      console.log(await aimAt("decoy", 12, false));
      await wait(2500);
      await shot("12-lookalike-close", "looking at a lookalike up close: the card ticks off his features against the poster");
      await named("the lookalike card", ".wsc-tag");
      console.log(await aimAt("him", 0, false));
      await wait(1200);
      await shot("13-him-close", "looking at the real one: the card's verdict");
      console.log(await aimAt("decoy", 60, true));
      await wait(2500);
      await shot("14-lookalike-binoculars", "a lookalike through binoculars from 60 m");
      await page.evaluate(() => { clearInterval(window.__aim); const g = window.__game(); if (g.binoculars) g.toggleBinoculars(); });
    }

    // ---- the end: put down (or got away, on the phone runs)
    await page.evaluate((away) => {
      const g = window.__game(), j = g.quests.job;
      if (away || !j.ring) j.tell({ k: "away" });
      else j.naughtyBoyDown(j.ring.i, g.net.selfId);
    }, run.w < 1000);
    await wait(1800);
    await shot("15-results", "the results card at the end");
    await named("the results card", ".rsc-end");
    console.log(await silenceNote(page));
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
  fs.writeFileSync(`${OUT}/index.txt`, index.join("\n") + "\n");
}
const bad = checks.filter((c) => !c).length;
console.log(bad ? `${bad} FAILED` : "all passed");
process.exit(bad ? 1 : 0);
