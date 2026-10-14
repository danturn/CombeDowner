// A check of Seagull Attack (web/src/gulls.ts) starting in the real game: a built game (web/dist)
// served to a muted headless Chrome (every AudioContext silent, media play() stubbed, never takes
// the mouse; the browser and server are closed at the end). It takes the job from today's real
// noticeboard twice: once as the host, and once as a player who isn't host in a room whose host
// never runs the gulls (an older page), where the player should run them themselves after a few
// seconds rather than wait on "Setting the benches out..." for ever.
//
//   node tools/gulls_probe.mjs [--dist web/dist] [--out gulls]
//
// Writes <out>/report.txt and <out>/*.png; exits 1 if a check fails.
import { createRequire } from "module";
import fs from "fs";
import http from "http";
import path from "path";

const WEB = new URL("../web/", import.meta.url).pathname;
const { chromium } = (() => {
  if (process.env.PW) return createRequire(import.meta.url)(process.env.PW);
  try { return createRequire(WEB + "package.json")("playwright"); } catch { return createRequire(import.meta.url)("playwright"); }
})();

const argv = process.argv.slice(2), opt = { dist: WEB + "dist", out: "gulls" };
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
const complaints = [], lines = [];
let failed = false;
const check = (name, ok, detail = "") => { failed ||= !ok; const l = `${ok ? "PASS" : "FAIL"} ${name}${detail ? ": " + detail : ""}`; lines.push(l); console.log(l); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** One go: a fresh tab, solo, taking today's Seagull Attack from its noticeboard. */
async function go(name, notHost) {
  const page = await context.newPage();
  page.on("pageerror", (e) => complaints.push(`${name} error: ${e.message}`));
  await page.goto(`http://127.0.0.1:${port}/?map=combe-down&time=11:00&fx=0`);
  await page.waitForFunction(() => !document.getElementById("solo")?.disabled, null, { timeout: 120000 });
  await page.evaluate(() => document.getElementById("solo").click());
  await page.waitForFunction(() => window.__game && window.__game() && window.__game().quests.posts.length > 0, null, { timeout: 400000 });
  await page.addStyleTag({ content: "#menu,#pause,#debug,#touch,#micask{display:none!important}" });
  const at = await page.evaluate((notHost) => {
    const g = window.__game(), q = g.quests, u = g.update.bind(g);
    g.update = (dt) => { g.active = true; u(dt); };   // headless there's no pointer lock to keep it going
    // a host that never sends any gulls: as far as this page knows, someone else is host
    if (notHost) Object.defineProperty(q.w, "isHost", { get: () => false, configurable: true });
    const p = q.posts.find((p) => p.kind.id === "gulls");
    if (!p) return null;
    g.player.spawn(p.x + 1, p.z, 0);
    return p.offer.where;
  }, notHost);
  check(`${name}: today's Seagull Attack is on a noticeboard`, !!at, at ?? "");
  if (!at) { await page.close(); return; }
  await wait(3000);
  const took = await page.evaluate(() => window.__game().quests.use());
  check(`${name}: E at the noticeboard takes the job`, took);
  const read = () => page.evaluate(() => { const j = window.__game().quests.job; return j && { stray: j.stray, benches: j.S.tr.length, ph: j.S.ph, w: j.S.w, card: document.getElementById("jobcard").innerText.replace(/\n/g, " | ") }; });
  await wait(6000);
  let s = await read();
  check(`${name}: the benches are out within 6 s`, s && s.benches >= 3 && !/Setting the benches/.test(s.card), JSON.stringify(s));
  if (notHost) check(`${name}: with no gulls from the host, this player runs them`, s && s.stray);
  else check(`${name}: as host, nobody else needs to run them`, s && !s.stray);
  await page.evaluate(() => { const g = window.__game(), S = g.quests.job.S, a = Math.atan2(S.tr[0].z - S.cz, S.tr[0].x - S.cx) + 2.2;
    const x = S.cx + Math.cos(a) * 14, z = S.cz + Math.sin(a) * 14; g.player.spawn(x, z, Math.atan2(-(S.cx - x), -(S.cz - z))); g.player.pitch = 0.1; });
  await wait(14000);
  s = await read();
  check(`${name}: wave 1 comes in`, s && s.ph === 1 && s.w === 1, JSON.stringify(s));
  await page.screenshot({ path: path.join(opt.out, `${name}.png`) });
  const fps = await page.evaluate(() => new Promise((r) => { let n = 0; const t0 = performance.now(); const f = () => { if (++n < 60) requestAnimationFrame(f); else r(Math.round(60000 / (performance.now() - t0))); }; requestAnimationFrame(f); }));
  lines.push(`${name}: about ${fps} fps`);
  await page.close();
}

try {
  await go("host", false);
  await go("not-host", true);
} catch (e) { check("the probe ran to the end", false, String(e && e.stack || e)); }
lines.push(complaints.length ? complaints.join("\n") : "no page errors");
if (complaints.length) failed = true;
fs.writeFileSync(path.join(opt.out, "report.txt"), lines.join("\n") + "\n");
console.log(complaints.length ? complaints.join("\n") : "no page errors");
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
