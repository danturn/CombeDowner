// Checks that Esc opens and closes the pause menu in the streets game, and that Esc in the
// settings page or the wardrobe goes back to the pause menu. It serves a built game (web/dist),
// starts a solo game in a muted headless Chrome that can't make a sound or take the mouse, presses
// Esc and reads what's on screen after each press. A browser lets go of a captured mouse itself on
// Esc rather than passing the key on, so where the mouse was captured this lets go of it instead.
//
//   cd web && npx vite build && node ../tools/esc_probe.mjs [--out shots]
//
// Prints each step and PASS or FAIL, writes <out>/esc-probe.json, and exits 1 on a failure.
import { createRequire } from "module";
import fs from "fs";
import http from "http";
import path from "path";

const WEB = new URL("../web/", import.meta.url).pathname;
const { chromium } = (() => {
  if (process.env.PW) return createRequire(import.meta.url)(process.env.PW);
  try { return createRequire(WEB + "package.json")("playwright"); } catch { return createRequire(import.meta.url)("playwright"); }
})();
const argv = process.argv.slice(2), out = argv.includes("--out") ? argv[argv.indexOf("--out") + 1] : "shots";
fs.mkdirSync(out, { recursive: true });

const TYPES = { ".js": "text/javascript", ".html": "text/html", ".css": "text/css", ".json": "application/json", ".wasm": "application/wasm" };
const server = http.createServer((q, res) => {
  let f = path.join(WEB + "dist", decodeURIComponent(q.url.split("?")[0]));
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
const exe = process.env.CHROME || (linux && fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : null);
const browser = await chromium.launch({
  headless: true,
  ...(exe ? { executablePath: exe } : { channel: "chrome" }),
  args: ["--mute-audio", "--disable-audio-output",
    ...(linux ? ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
      : process.platform === "darwin" ? ["--use-angle=metal", "--enable-gpu"] : [])],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.addInitScript(() => {
  class Silent extends OfflineAudioContext {
    constructor() { super(2, 44100, 44100); }
    resume() { return Promise.resolve(); }
    suspend() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
  }
  window.AudioContext = window.webkitAudioContext = Silent;
  HTMLMediaElement.prototype.play = () => Promise.resolve();
  if (window.speechSynthesis) window.speechSynthesis.speak = () => {};
});
const complaints = [];
page.on("pageerror", (e) => complaints.push(`error: ${e.message}`));

const steps = [];
let failed = false;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const state = () => page.evaluate(() => ({
  pause: !document.getElementById("pause").hidden,
  settings: !document.getElementById("settings").hidden,
  wardrobe: !!document.getElementById("wardrobe"),
  clickhint: !document.getElementById("clickhint").hidden,
  locked: !!document.pointerLockElement,
  active: !!window.__game()?.active,
}));
async function check(name, want) {
  const s = await state();
  const ok = Object.entries(want).every(([k, v]) => s[k] === v);
  if (!ok) failed = true;
  steps.push({ name, ok, want, got: s });
  console.log(`${ok ? "PASS" : "FAIL"} ${name} ${JSON.stringify(s)}`);
}
/** Esc as the player presses it: with the mouse captured the browser takes the key and lets go of the mouse. */
async function esc() {
  if (await page.evaluate(() => !!document.pointerLockElement)) await page.evaluate(() => document.exitPointerLock());
  else await page.keyboard.press("Escape");
  await wait(400);
}

await page.goto(`http://127.0.0.1:${port}/?map=combe-down&time=11:00`);
await page.waitForFunction(() => !document.getElementById("solo")?.disabled, null, { timeout: 120000 });
await page.click("#solo");
await page.waitForFunction(() => window.__game && window.__game(), null, { timeout: 120000 });
await wait(1500);
await check("playing after Solo", { pause: false, active: true });
await esc();
await check("Esc opens the pause menu", { pause: true, active: false });
await esc();
await check("Esc closes the pause menu, back to the game", { pause: false, active: true });
await esc();
await check("Esc opens it again", { pause: true, active: false });
await page.click("#settingsbtn2");
await wait(200);
await check("Settings open over the pause menu", { settings: true, pause: true });
await esc();
await check("Esc in settings goes back to the pause menu", { settings: false, pause: true, active: false });
await page.click("#wardrobebtn");
await wait(300);
await check("Wardrobe open over the pause menu", { wardrobe: true, pause: true });
await esc();
await check("Esc in the wardrobe goes back to the pause menu", { wardrobe: false, pause: true, active: false });
await esc();
await check("Esc closes the pause menu again", { pause: false, active: true });
await page.mouse.click(640, 360);
await wait(600);
await check("a click goes on playing (mouse captured if the browser allows)", { pause: false, active: true });

fs.writeFileSync(path.join(out, "esc-probe.json"), JSON.stringify({ steps, complaints: [...new Set(complaints)] }, null, 1));
console.log(`${failed ? "FAIL" : "PASS"}: ${steps.filter((s) => s.ok).length} of ${steps.length} steps; ${complaints.length} page errors`);
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
