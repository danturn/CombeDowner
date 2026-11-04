// Shoots the big map with every zone drawn (?zonemap=1), for each map and each way of cutting the
// zones (?cut=, zones.ts), and writes each zone's order, name and size to summary.json. Serves a
// built game (web/dist) in a muted headless Chrome.
//
//   node tools/quiet.mjs -- node tools/zone_cuts_shot.mjs --out out-cuts --maps combe-down,cape-town --cuts streets,quiet
import { createRequire } from "module";
import fs from "fs";
import http from "http";
import path from "path";
import { MUTED_ARGS, silence, silenceContext, silenceNote } from "./quiet-guard.mjs";

const WEB = new URL("../web/", import.meta.url).pathname;
const { chromium } = (() => {
  if (process.env.PW) return createRequire(import.meta.url)(process.env.PW);
  try { return createRequire(WEB + "package.json")("playwright"); } catch { return createRequire(import.meta.url)("playwright"); }
})();

const argv = process.argv.slice(2);
const opt = { dist: WEB + "dist", out: "out-cuts", maps: "combe-down,bradford-on-avon,cape-town", cuts: "streets,quiet,heart,clock", size: "1280x900", timeout: "90" };
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) opt[argv[i].slice(2)] = argv[++i];
const [W, H] = opt.size.split("x").map(Number);
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

const browser = await chromium.launch({ headless: true, channel: "chrome", args: [...MUTED_ARGS, ...(process.platform === "darwin" ? ["--use-angle=metal", "--enable-gpu"] : [])] });
const context = await browser.newContext({ viewport: { width: W, height: H } });
await silenceContext(context);
await context.addInitScript(() => { try { localStorage.clear(); } catch {} });

const summaryFile = path.join(opt.out, "summary.json");
const summary = fs.existsSync(summaryFile) ? JSON.parse(fs.readFileSync(summaryFile, "utf8")) : {};
let note = "";
for (const map of opt.maps.split(",")) for (const cut of opt.cuts.split(",")) {
  const page = await context.newPage();
  await silence(page);
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/?map=${map}&cut=${cut}&zonemap=1&progression=1&net=local&time=11:00`);
  await page.waitForFunction(() => !document.getElementById("solo")?.disabled && document.getElementById("solo")?.offsetParent, null, { timeout: 120000 });
  await page.evaluate(() => document.getElementById("solo").click());
  await page.waitForFunction(() => window.__game && window.__game(), null, { timeout: 120000 });
  await page.evaluate(() => { window.__budget = 40; window.__cutCalm = window.__calm(12, 500); });
  const calm = await page.waitForFunction(() => window.__cutCalm.still(window.__tilesPending ?? 1), null, { timeout: +opt.timeout * 1000, polling: "raf" }).then(() => true, () => false);
  // the Chronicle and anything else that pops up on arrival goes, then the big map opens fully zoomed out
  await page.evaluate(() => {
    const g = window.__game();
    for (const id of ["chronicle", "daily", "news", "arrive"]) { const el = document.getElementById(id); if (el) el.hidden = true; }
    if (!g.mapOpen) g.toggleMap();
    g.minimap.resetFull();
    // only the streets under the zones: pins and blips hide the order
    g.minimap.off = new Set(["bendy", "cable", "challenges", "flags", "games", "markers", "pickups", "players", "pubs", "route", "search", "stops", "traps", "yours"]);
    Object.defineProperty(g.minimap, "jobs", { get: () => [], set: () => {} });
    window.__frames = 0;
    const tick = () => { window.__frames++; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  await page.addStyleTag({ content: "#chronicle,.toast,#toast,#arrive,#touch,#debug,#mapkey,#bigmapmine,#minimap,#np{display:none!important}" });
  await page.waitForFunction(() => window.__frames > 10, null, { polling: "raf" });
  await page.screenshot({ path: path.join(opt.out, `${map}-${cut}.png`) });
  const zones = await page.evaluate(() => window.__game().zones.list.map((z) => ({ order: z.i + 1, name: z.name, cells: z.cells, km2: +z.km2.toFixed(2), sockets: z.sockets, structure: z.home ? [Math.round(z.home.x), Math.round(-z.home.z)] : null })));
  const travel = await page.evaluate(() => window.__game().zones.travelPlan());
  // --probe "x,y;x,y": which zone each data point is in, for checking a cut by eye
  if (opt.probe) console.log(`  probe: ${await page.evaluate((pts) => pts.split(";").map((p) => { const [x, y] = p.split(",").map(Number); return `${p} -> ${window.__game().zones.zoneAt(x, -y) + 1}`; }).join(", "), opt.probe)}`);
  // what the first zone has in it: its pubs, its named places and where its structure stands
  const first = await page.evaluate(async (id) => {
    const g = window.__game(), Z = g.zones, m = g.map, inFirst = (x, y) => Z.zoneAt(x, -y) === 0;
    const pb = await fetch(`maps/${id}-pubs.json`).then((r) => (r.ok ? r.json() : { pb: [] })).catch(() => ({ pb: [] }));
    const pubs = (pb.pb ?? []).filter(([x, y]) => inFirst(x, y)).map((p) => p[2]);
    const places = [...new Set([...(m.d.pl ?? []), ...(m.wide?.d.pl ?? [])].filter((p) => p.n && p.r.length >= 3 && inFirst(p.r.reduce((s, q) => s + q[0], 0) / p.r.length, p.r.reduce((s, q) => s + q[1], 0) / p.r.length)).map((p) => p.n))];
    const mainRoads = [...new Set((m.wide?.rd ?? []).filter((r) => ["trunk", "primary", "secondary", "tertiary"].includes(r.c) && r.p.some((q) => inFirst(q[0], q[1]))).map((r) => r.n).filter(Boolean))];
    const h = Z.list[0].home;
    const sp = m.d.spawn ?? [[0, 0]];
    return { spawn: [Math.round(sp.reduce((s, p) => s + p[0], 0) / sp.length), Math.round(sp.reduce((s, p) => s + p[1], 0) / sp.length)], pubs, places, mainRoads, structure: h && { at: [Math.round(h.x), Math.round(-h.z)], on: h.n || "open ground" } };
  }, map);
  (summary[map] ??= {})[cut] = { zones, travel, first };
  console.log(`  first zone: spawn ${first.spawn}, ${first.pubs.length} pubs (${first.pubs.slice(0, 4).join(", ")}), places ${first.places.slice(0, 6).join(", ")}, main roads ${first.mainRoads.slice(0, 4).join(", ")}, structure on ${first.structure?.on}`);
  console.log(`${map} ${cut}${calm ? "" : " (not calm: timed out)"}: ${zones.map((z) => `${z.order}. ${z.name} (${z.km2} km²)`).join("; ")}; travel ${travel}; ${zones.filter((z) => z.sockets && !z.structure).length} zones lacking a structure${errs.length ? `  errors: ${errs.slice(0, 3).join(" | ")}` : ""}`);
  note = await silenceNote(page);
  await page.close();
}
fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 1));
console.log(note);
await browser.close();
server.close();
