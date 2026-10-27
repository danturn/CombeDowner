// Frames of prompts named from the table of controls (web/src/controls.ts), on a made-up pad (a
// stubbed navigator.getGamepads) and on a touch screen, in a muted headless Chrome: Push the Bus
// (taking the call, and its job card), a balloon's basket and its flight, and a tin's lock.
// Checks each prompt names the pad's button or the touch word, not a key.
//
//   cd web && npx vite build --logLevel error && cd .. && node tools/prompt_probe.mjs <out folder>
//
// Exits 1 if a check fails.
import { createRequire } from "module";
import fs from "fs";
import http from "http";
import path from "path";
import { MUTED_ARGS, silenceContext, silenceNote } from "./quiet-guard.mjs";
const WEB = new URL("../web/", import.meta.url).pathname;
const { chromium } = createRequire(WEB + "package.json")("playwright");
const OUT = process.argv[2] ?? "promptprobe";
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
const context = await browser.newContext({ viewport: { width: 1100, height: 700 } });
await silenceContext(context);
await context.addInitScript(() => {
  window.__pad = { buttons: Array.from({ length: 18 }, () => ({ pressed: false, touched: false, value: 0 })), axes: [0, 0, 0, 0] };
  const g = () => ({ id: "Stub pad (STANDARD GAMEPAD)", index: 0, connected: true, mapping: "standard", timestamp: performance.now(), buttons: window.__pad.buttons, axes: window.__pad.axes });
  navigator.getGamepads = () => [g()];
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const check = (n, ok, d = "") => { checks.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}: ${d}`); };
const page = await context.newPage();
page.on("pageerror", (e) => console.log("pageerror", e.message));
const silent = [];
const RAW = /<b>[A-Z]<\/b>|\b(?:Press|press|Hold|hold) [A-Z]\b|\b[A-Z] to |\bW\/S\b|\bA\/D\b|\bSpace\b|\bEsc\b/;
const text = (id) => page.evaluate((id) => document.getElementById(id)?.innerText ?? "", id);
const tapPad = async (b) => { await page.evaluate((b) => { window.__pad.buttons[b].pressed = true; window.__pad.buttons[b].value = 1; }, b); await wait(150); await page.evaluate((b) => { window.__pad.buttons[b].pressed = false; window.__pad.buttons[b].value = 0; }, b); await wait(300); };

async function enter(mode) {
  await page.goto(`http://127.0.0.1:${port}/?map=combe-down&net=local&room=PRMP${Math.floor(Math.random() * 1e4)}&time=06:30&fx=0`);
  await page.waitForFunction(() => !document.getElementById("play")?.disabled, null, { timeout: 120000 });
  await page.fill("#name", "Pad");
  await page.click("#play");
  await page.waitForFunction(() => window.__game && window.__game() && window.__game().map, null, { timeout: 180000 });
  await page.evaluate((mode) => {
    const g = window.__game(), u = g.update.bind(g);
    g.update = (dt) => { g.active = true; document.getElementById("pause").hidden = true; u(dt); };
    if (mode === "touch") { g.freeMode = true; document.getElementById("touch").hidden = false; }
  }, mode);
  await page.addStyleTag({ content: "#menu,#debug,#micask,#chronicle,#scoreboard{display:none!important}" });
  await wait(1500);
  if (mode === "pad") { await page.evaluate(() => { window.__pad.axes[2] = 0.5; }); await wait(150); await page.evaluate(() => { window.__pad.axes[2] = 0; }); await wait(300); }
}
const named = (mode, s) => mode === "pad" ? /[□△○✕]|R1|R2|L2|d-pad|stick/.test(s) && !RAW.test(s) : !RAW.test(s);

try {
  for (const mode of ["pad", "touch"]) {
    await enter(mode);
    // ---- Push the Bus: at the back, on it with enough of you to call, and its card ----
    const bus = await page.evaluate(() => {
      const g = window.__game(), q = g.quests;
      const spots = q.posts?.filter?.((p) => p.offer?.kind === "pushbus") ?? [];
      const o = spots[0]?.offer ?? { kind: "pushbus", seed: 777, stars: 3, title: "Push the Bus", blurb: "", reward: "", x: 0, z: 0, where: "" };
      try { q.take(o); } catch (e) { return String(e); }
      return q.job ? "ok" : "no job";
    });
    check(`${mode}: Push the Bus started`, bus === "ok", bus);
    await wait(1500);
    if (bus === "ok") {
      // three of you, so the call's on offer, and you at the bus's back
      await page.evaluate(() => {
        const g = window.__game(), q = g.quests, w = q.w, real = w.players.bind(w);
        w.players = () => { const r = real(); return [...r, { ...r[0], id: "zz1", name: "Ann" }, { ...r[0], id: "zz2", name: "Bob" }]; };
      });
      for (let i = 0; i < 40 && !(await text("usehint")).includes("shoulder"); i++) {
        await page.evaluate((i) => {
          const g = window.__game(), o = g.quests.job?.obstacles?.()[0], bx = o?.x, bz = o?.z;
          const pts = []; for (let a = 0; a < 16; a++) for (const r of [3, 4.5, 6, 7.5]) pts.push([Math.cos(a / 16 * 6.283) * r, Math.sin(a / 16 * 6.283) * r]);
          const p = pts[i % pts.length];
          if (bx !== undefined) g.player.spawn(bx + p[0], bz + p[1], 0);
        }, i);
        await wait(250);
      }
      const atBack = await text("usehint");
      check(`${mode}: at the bus's back the prompt names use`, named(mode, atBack) && /shoulder/.test(atBack), atBack);
      await page.screenshot({ path: `${OUT}/${mode}-pushbus-back.png` });
      if (mode === "pad") await tapPad(2); else await page.evaluate(() => window.__game().useCar());
      await wait(800);
      const on = await text("usehint");
      check(`${mode}: on the bus, use takes the call`, /Take the call/.test(on) && named(mode, on), on);
      await page.screenshot({ path: `${OUT}/${mode}-pushbus-call.png` });
      const card = await text("mprog");
      check(`${mode}: the job card names controls`, !RAW.test(card), card.replace(/\n/g, " / ").slice(0, 160));
      await page.evaluate(() => { const q = window.__game().quests; q.job?.end?.(); q.job = null; });
    }

    // ---- a balloon: the basket's prompt, then flying it ----
    const b = await page.evaluate(() => {
      const g = window.__game(), list = g.balloons?.list ?? [], b = list.find((x) => x.home) ?? list[0];
      if (!b) return null;
      g.player.spawn(b.x + 1.6, b.z, 0);
      return [b.x, b.z, b.name];
    });
    if (b) {
      await wait(1200);
      const bh = await text("usehint");
      check(`${mode}: by a balloon the prompt names use`, named(mode, bh), bh);
      await page.screenshot({ path: `${OUT}/${mode}-balloon.png` });
    } else check(`${mode}: found a balloon`, false, "none on the map");

    // ---- a tin's lock (a treasure trail's), as it opens over the game ----
    const lk = await page.evaluate(() => {
      const g = window.__game(), q = g.quests;
      try { q.take({ kind: "trail", seed: 4321, stars: 2, title: "Treasure trail", blurb: "", reward: "", x: g.player.pos.x, z: g.player.pos.z, where: "" }); } catch (e) { return String(e); }
      const lock = q.job?.lock;
      if (!lock) return "no lock";
      lock.show({ ask: "How many windows on the front of the pub?", code: [1, 2, 3], onOpen() {}, onJam() {} });
      return "ok";
    });
    await wait(500);
    const lt = await text("tinlock");
    check(`${mode}: the tin lock shows its controls for the input`, lk === "ok" && !RAW.test(lt), `${lk}: ${lt.replace(/\n/g, " / ").slice(0, 160)}`);
    await page.screenshot({ path: `${OUT}/${mode}-tinlock.png` });
    silent.push(`${mode}: ${await silenceNote(page)}`);
  }
} finally {
  for (const l of silent) console.log(l);
  await browser.close(); server.close();
}
process.exit(checks.every(Boolean) ? 0 : 1);
