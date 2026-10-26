// A headless check of the zones (web/src/zones.ts): for each map given, start a solo game and print
// its zones (names, cells, sizes, sockets, where each structure stands), where each challenge went
// and which zone each way of getting about opens with. Run from web/ after npm run build:
//   node ../tools/zones_probe.mjs combe-down cape-town bradford-on-avon
import { createRequire } from "module";
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

for (const id of process.argv.slice(2).length ? process.argv.slice(2) : ["combe-down"]) {
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
  await silence(page);
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.message)));
  await page.addInitScript(() => { try { localStorage.clear(); } catch {} });
  await page.goto(`http://127.0.0.1:${port}/?map=${id}&net=local&zones=1`);
  await page.waitForSelector("#solo", { state: "visible", timeout: 60000 });
  const t0 = Date.now();
  await page.click("#solo");
  await page.waitForFunction(() => !!(window.__game && window.__game()), null, { timeout: 60000 });
  const out = await page.evaluate(() => {
    const g = window.__game(), Z = g.zones;
    return {
      zones: Z.list.map((z) => ({ i: z.i + 1, name: z.name, cells: z.cells, km2: +z.km2.toFixed(1), sockets: z.sockets, home: z.home && `${z.home.n || "?"} (${Math.round(z.home.x)}, ${Math.round(-z.home.z)})` })),
      travel: Z.travelPlan(),
      debug: Z.describe(g.player.pos.x, g.player.pos.z, g.oddments.filled),
    };
  });
  const ch = await page.evaluate(() => window.__game().challengeZones());
  console.log(`\n== ${id} (game up in ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  for (const z of out.zones) console.log(`  ${z.i}. ${z.name}: ${z.cells} cells, ${z.km2} km², ${z.sockets} sockets, structure ${z.home ?? "none"}`);
  console.log("  challenges:", ch.join("; ") || "none");
  console.log("  travel:", out.travel);
  console.log("  ", out.debug);
  if (errs.length) console.log("  errors:", errs.slice(0, 5));
  await page.close();
}
await browser.close();
server.close();
