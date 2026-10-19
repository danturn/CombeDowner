// A check that the pub map's pubs are built into the game (web/src/game.ts, loadPubs): a built game
// (web/dist) served to a muted headless Chrome that can't make a sound or take the mouse (as
// tools/climb_probe.mjs does), twice, once with every request for a pub list refused, as on a poor signal.
// Both times the game must know every pub in the map (not only those signed in the village round the
// spawn), and today's jobs must be allowed to start.
//
//   cd web && npx vite build --logLevel error && cd .. && node tools/pub_probe.mjs
//
// Exits 1 if a check fails.
import { createRequire } from "module";
import fs from "fs";
import http from "http";
import path from "path";

const WEB = new URL("../web/", import.meta.url).pathname;
const { chromium } = (() => {
  if (process.env.PW) return createRequire(import.meta.url)(process.env.PW);
  try { return createRequire(WEB + "package.json")("playwright"); } catch { return createRequire(import.meta.url)("playwright"); }
})();
const dist = process.argv[2] ?? WEB + "dist";
const expected = JSON.parse(fs.readFileSync(WEB + "public/maps/combe-down-pubs.json", "utf8")).pb.length;

const TYPES = { ".js": "text/javascript", ".html": "text/html", ".css": "text/css", ".json": "application/json", ".wasm": "application/wasm" };
const server = http.createServer((q, res) => {
  let f = path.join(dist, decodeURIComponent(q.url.split("?")[0]));
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
  args: ["--mute-audio", "--disable-audio-output",
    ...(linux ? ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
      : process.platform === "darwin" ? ["--use-angle=metal", "--enable-gpu"] : [])],
});
let failed = 0;
for (const refuse of [false, true]) {
  const context = await browser.newContext({ viewport: { width: 900, height: 600 } });
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
  let asked = 0;
  if (refuse) await context.route("**/*-pubs.json", (r) => { asked++; r.abort(); });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/?map=combe-down&net=local&room=PUBTEST${Math.floor(Math.random() * 1000)}&fx=0`);
  await page.waitForFunction(() => !document.getElementById("play")?.disabled, null, { timeout: 120000 });
  await page.fill("#name", "pubtest");
  await page.click("#play");
  await page.waitForFunction(() => window.__game && window.__game() && window.__game().map, null, { timeout: 180000 });
  const got = await page.evaluate(() => { const g = window.__game(); return { n: g.pubList.length, ready: g.pubsReady, bear: g.pubList.some((p) => p.name === "The Bear"), rated: g.pubList.some((p) => p.rating != null) }; });
  const ok = got.n === expected && got.ready && got.bear && got.rated && errors.length === 0;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${refuse ? "pub lists refused" : "normal"}: ${got.n}/${expected} pubs, ready=${got.ready}, The Bear=${got.bear}, ratings=${got.rated}, asked for a list ${asked} times, page errors: ${errors.length ? errors.join("; ") : "none"}`);
  await context.close();
}
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
