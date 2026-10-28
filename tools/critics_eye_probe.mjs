// A check on the critics' eye (web/src/eye.ts): paintings from a folder of PNGs (the ones
// tools/critics_probe.mjs --out writes) fed through the model in a muted headless Chrome, with what
// it recognised and how well each fits the subjects written up as a page.
//
//   node tools/critics_eye_probe.mjs <png folder> <out folder> [--wasm]
//
// It starts its own dev server, times the first load (download included, unless the browser's cache
// already has the model) and each painting on its own.
import { spawn } from "child_process";
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { MUTED_ARGS, silenceContext, silenceNote } from "./quiet-guard.mjs";

const WEB = new URL("../web/", import.meta.url).pathname;
const { chromium } = createRequire(WEB + "package.json")("playwright");
const [src, outDir] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const wasm = process.argv.includes("--wasm");
fs.mkdirSync(outDir, { recursive: true });
const pngs = fs.readdirSync(src).filter((f) => f.endsWith(".png")).sort();

const PORT = 5199;
const vite = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], { cwd: WEB, stdio: "pipe" });
await new Promise((ok) => vite.stdout.on("data", (d) => String(d).includes("Local") && ok()));
const browser = await chromium.launch({ channel: "chrome", headless: true, args: [...MUTED_ARGS, "--use-angle=metal", "--enable-gpu", ...(wasm ? [] : ["--enable-unsafe-webgpu"])] });
const context = await browser.newContext();
await silenceContext(context);
const page = await context.newPage();
page.on("console", (m) => m.type() !== "debug" && console.log("  page:", m.text().slice(0, 200)));
if (wasm) await page.addInitScript(() => { delete Navigator.prototype.gpu; });
await page.goto(`http://localhost:${PORT}/critics-eye.json`);

const load = await page.evaluate(async () => {
  const eye = await import("/src/eye.ts");
  window.__eye = eye;
  const t0 = performance.now();
  const ok = await eye.wake();
  return { ok, ms: performance.now() - t0, ...eye.eyeState() };
});
console.log("load:", load);
if (!load.ok) process.exit(1);

const rows = [];
for (const f of pngs) {
  const url = "data:image/png;base64," + fs.readFileSync(path.join(src, f)).toString("base64");
  const r = await page.evaluate(async (url) => {
    const { PALETTE, W, H } = await import("/src/easel.ts");
    const img = new Image(); img.src = url; await img.decode();
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d"); g.imageSmoothingEnabled = false; g.drawImage(img, 0, 0, W, H);
    const d = g.getImageData(0, 0, W, H).data, rgb = PALETTE.map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
    const px = new Uint8Array(W * H);
    for (let i = 0; i < px.length; i++) {
      let best = 0, bd = 1e9;
      rgb.forEach((q, k) => { const e = (q[0] - d[i * 4]) ** 2 + (q[1] - d[i * 4 + 1]) ** 2 + (q[2] - d[i * 4 + 2]) ** 2; if (e < bd) { bd = e; best = k; } });
      px[i] = best;
    }
    const t0 = performance.now();
    const [e] = await window.__eye.judge([px], "A cat who owns the street");
    return { ms: performance.now() - t0, ...e };
  }, url);
  rows.push({ f, ...r });
  console.log(f.padEnd(32), `${r.ms.toFixed(0)}ms`, "seen:", r.seen.map((s) => `${s.word} ${(s.p * 100).toFixed(0)}%`).join(", ") || "-", "| top:", r.top.slice(0, 3).map((t) => `${t.ask} ${(t.p * 100).toFixed(0)}%`).join(", "));
  fs.copyFileSync(path.join(src, f), path.join(outDir, f));
}
console.log(await silenceNote(page));
const ms = rows.map((r) => r.ms).sort((a, b) => a - b);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const pct = (p) => `${(p * 100).toFixed(0)}%`;
fs.writeFileSync(path.join(outDir, "index.html"), `<!doctype html><meta charset="utf-8"><title>Critics' eye</title>
<style>body{font:14px system-ui;margin:16px;background:#f4f1ea;color:#222}h1{font-size:20px}.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}
.c{background:#fff;padding:8px;border-radius:6px}.c img{width:100%;border:1px solid #ccc}.seen{font-weight:600;color:#a0124b}ol{margin:4px 0 4px 18px;padding:0}small{color:#666}</style>
<h1>The critics' eye: ${esc(load.device)} , first load ${(load.ms / 1000).toFixed(1)} s, median ${ms[ms.length >> 1].toFixed(0)} ms a painting</h1>
<p>Each painting's top five guesses from the bank (share of belief), what the visitors would be told it saw (bold), and the three subjects it fits best (0..1).</p>
<div class="g">${rows.map((r) => `<div class="c"><img src="${r.f}"><div><b>${esc(r.f)}</b> <small>${r.ms.toFixed(0)} ms</small></div>
<div class="seen">Seen: ${r.seen.map((s) => `${esc(s.word)} ${pct(s.p)}`).join(", ") || "nothing it's sure of"}</div>
<ol>${r.top.map((t) => `<li>${esc(t.ask)} <small>${pct(t.p)}</small></li>`).join("")}</ol>
<small>Fits: ${r.fits.map(([k, v]) => `${esc(k)} ${v.toFixed(2)}`).join("; ")}</small></div>`).join("")}</div>`);
await browser.close();
vite.kill();
