// A check that the host's passive mode reaches everyone (game.ts: onState, setRoomPassive): two tabs
// in a local test room, in one muted headless Chrome (as tools/seat_probe.mjs). The host starts with
// passive mode on and the joiner with it off; the joiner should go passive within a few seconds. Then
// the host turns it off, and the joiner should follow. Logs what each tab thinks along the way: who's
// host, its passive mode, and the extras the host's state messages carry.
//
//   cd web && npx vite build --logLevel error && cd .. && node tools/passive_probe.mjs --out passive
//
// Writes <out>/report.txt and <out>/probe.json; exits 1 if a check fails.
import { createRequire } from "module";
import fs from "fs";
import http from "http";
import path from "path";

const WEB = new URL("../web/", import.meta.url).pathname;
const { chromium } = (() => {
  if (process.env.PW) return createRequire(import.meta.url)(process.env.PW);
  try { return createRequire(WEB + "package.json")("playwright"); } catch { return createRequire(import.meta.url)("playwright"); }
})();

const argv = process.argv.slice(2), opt = { dist: WEB + "dist", out: "passive", room: "PASSTEST" + Math.floor(Math.random() * 1000) };
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
  args: ["--mute-audio", "--disable-audio-output", "--disable-renderer-backgrounding", "--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows",
    ...(linux ? ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
      : process.platform === "darwin" ? ["--use-angle=metal", "--enable-gpu"] : [])],
});
const context = await browser.newContext({ viewport: { width: 1100, height: 700 } });
await context.addInitScript(() => {
  class Silent extends OfflineAudioContext {
    constructor() { super(2, 44100, 44100); }
    resume() { return Promise.resolve(); }
    suspend() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
  }
  window.AudioContext = window.webkitAudioContext = Silent;
  HTMLMediaElement.prototype.play = () => Promise.resolve();
  if (window.speechSynthesis) window.speechSynthesis.speak = () => {};
  try { localStorage.setItem("cd-mic", "off"); } catch { /* */ }
});
const complaints = [], checks = [], log = { started: new Date().toISOString(), spots: [] };
const check = (name, ok, detail = "") => { checks.push({ name, ok: !!ok, detail }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ": " + detail : ""}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** A tab in the test room, playing, with the player's movement live (no pointer lock headless). */
async function join(name, calm) {
  const page = await context.newPage();
  // each tab its own passive setting (they share one browser's storage): read as the page loads
  await page.addInitScript((on) => { try { localStorage.setItem("cd-passive", on ? "1" : "0"); } catch { /* */ } }, calm);
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


log.samples = [];
const peek = (page) => page.evaluate(() => {
  const g = window.__game();
  return { me: g.net.selfId, host: g.hostId, isHost: g.isHost, passive: g.passive, last: window.__lastSt ?? null };
});
try {
  const H = await join("Host", true);
  await wait(1500);
  const J = await join("Joiner", false);
  // the joiner keeps the last state message it had from each player, to see what the host sent
  await J.evaluate(() => {
    const g = window.__game(), on = g.onState.bind(g);
    window.__lastSt = {};
    g.onState = (d, from) => { window.__lastSt[from.slice(0, 6)] = Array.isArray(d) ? d.slice(12) : d; on(d, from); };
  });
  let ok = false;
  for (let t = 0; t < 16; t++) {
    await wait(500);
    const h = await peek(H), j = await peek(J);
    log.samples.push({ t: t / 2, h, j });
    if (j.passive) { ok = true; break; }
  }
  const h = await peek(H), j = await peek(J);
  check("the host is in passive mode", h.passive && h.isHost, JSON.stringify(h));
  check("the joiner agrees who's host", j.host === h.me, JSON.stringify({ joinerSays: j.host, host: h.me }));
  check("the joiner goes passive with the host", ok, JSON.stringify(j));
  // the host turns it off, the way the settings tickbox does
  await H.evaluate(() => { const b = document.getElementById("set-passive") ?? document.getElementById("menu-passive"); if (b) { b.checked = false; b.dispatchEvent(new Event("change", { bubbles: true })); b.dispatchEvent(new Event("input", { bubbles: true })); } });
  let off = false;
  for (let t = 0; t < 16 && !off; t++) { await wait(500); const s = await peek(J); log.samples.push({ t: "off " + t / 2, j: s }); off = !s.passive; }
  check("the joiner follows the host turning it off", off, JSON.stringify(await peek(H)));
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
  process.exit(checks.length && checks.every((c) => c.ok) && !complaints.length ? 0 : 1);
}
