// Close-up shots of every kind of thing to pick up, set out in a row and held still, to check
// they look the same after a change to how they're drawn. Serves web/dist, muted headless Chrome
// (no sound can play, the mouse is never taken), closes everything itself.
//
//   cd web && npx vite build && node ../tools/pickupshots.mjs --out shots
import { createRequire } from "module";
import fs from "fs";
import http from "http";
import path from "path";
import { MUTED_ARGS, silence, silenceContext } from "./quiet-guard.mjs";

const WEB = new URL("../web/", import.meta.url).pathname;
const { chromium } = (() => { try { return createRequire(WEB + "package.json")("playwright"); } catch { return createRequire(import.meta.url)("playwright"); } })();
const argv = process.argv.slice(2), opt = { out: "shots" };
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) opt[argv[i].slice(2)] = argv[++i];
fs.mkdirSync(opt.out, { recursive: true });
const TYPES = { ".js": "text/javascript", ".html": "text/html", ".css": "text/css", ".json": "application/json" };
const server = http.createServer((q, res) => {
  let f = path.join(WEB + "dist", decodeURIComponent(q.url.split("?")[0]));
  if (f.endsWith("/")) f += "index.html";
  fs.readFile(f, (e, b) => { if (e) { res.statusCode = 404; return res.end(); } res.setHeader("content-type", TYPES[path.extname(f)] || "application/octet-stream"); res.end(b); });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const linux = process.platform === "linux";
const browser = await chromium.launch({ headless: true, ...(linux && fs.existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : { channel: "chrome" }),
  args: [...MUTED_ARGS, ...(process.platform === "darwin" ? ["--use-angle=metal", "--enable-gpu"] : [])] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await silence(page);
  page.on("pageerror", (e) => console.log("pageerror", e.message));
  // a quiet bit of the Firs Field, by day
  await page.goto(`http://127.0.0.1:${server.address().port}/?map=combe-down&time=11:00&fx=0&res=full&at=0,0,90,0`);
  await page.evaluate(() => { window.__budget = 40; });
  await page.waitForFunction(() => !document.getElementById("solo")?.disabled, null, { timeout: 180000 });
  await page.evaluate(() => document.getElementById("solo").click());
  await page.waitForFunction(() => window.__game && window.__game() && window.__tilesPending === 0, null, { timeout: 180000 });
  await page.addStyleTag({ content: "#menu,#pause,.toast,#hud,.hud{display:none!important}" });
  const kinds = await page.evaluate(() => {
    const g = window.__game(), P = g.pickups, m = g.map;
    for (const id of [...P.items.keys()]) P.take(id);
    const K = ["sniper", "pint", "fizz", "ammo", "sammo", "boost", "bike", "bmx", "blades", "board", "scooter", "pogo", "trolley", "ladder"];
    const x0 = 0, z0 = -6;
    K.forEach((k, i) => P.place(x0 + i * 2.2, z0, k, 1e9));
    P.update = () => { for (const it of P.items.values()) { const s = it.obj.children[0].children[0]; s.rotation.y = 0.6; s.position.y = 0.55; } };
    const u = g.update.bind(g);
    window.__cam = [x0, z0];
    g.update = (dt) => { u(dt); const [x, z] = window.__cam; g.player.pos.set(x, m.ground(x, z + 4), z + 4); g.camera.position.set(x, m.ground(x, z) + 1.6, z + 3.2); g.camera.rotation.set(-0.3, 0, 0, "YXZ"); g.camera.updateMatrixWorld(); };
    return K;
  });
  for (let i = 0; i < kinds.length; i++) {
    await page.evaluate((x) => { window.__cam = [x, -6]; }, i * 2.2);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(opt.out, `${kinds[i]}.png`) });
  }
  console.log("shot", kinds.join(", "));
} finally {
  await browser.close();
  server.close();
}
