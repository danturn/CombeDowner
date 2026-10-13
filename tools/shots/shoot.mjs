// Screenshots of the game from set viewpoints, for checking map changes. Muted: every audio context is a
// silent stub and Chrome runs headless with --mute-audio. Usage: node shoot.mjs <web/dist> <views.json> <out dir> <suffix>
import { chromium } from 'playwright';
import fs from 'fs'; import http from 'http'; import path from 'path';
const [dist, viewsFile, out, suffix] = process.argv.slice(2);
const views = JSON.parse(fs.readFileSync(viewsFile));
fs.mkdirSync(out, { recursive: true });
const sv = await new Promise(r => { const s = http.createServer((q, res) => {
  let f = path.join(dist, decodeURIComponent(q.url.split('?')[0])); if (f.endsWith('/')) f += 'index.html';
  fs.readFile(f, (e, b) => { if (e) { res.statusCode = 404; return res.end(); }
    res.setHeader('content-type', {'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json'}[path.extname(f)] || 'application/octet-stream'); res.end(b); }); }).listen(0, () => r(s)); });
const port = sv.address().port;
const exe = process.env.CHROME;
const args = ['--mute-audio', '--autoplay-policy=user-gesture-required'];
if (process.env.SWIFTSHADER) args.push('--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader');
const browser = await chromium.launch(exe ? { executablePath: exe, headless: true, args } : { channel: 'chrome', headless: true, args });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  // no sound at all: every audio context is a silent stub
  await page.addInitScript(() => {
    const Real = window.AudioContext || window.webkitAudioContext;
    class Silent extends Real { constructor(o) { super(o); this.suspend(); } resume() { return Promise.resolve(); } }
    window.AudioContext = Silent; window.webkitAudioContext = Silent;
    HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
    try { localStorage.setItem('cd-muted', '1'); } catch {}
  });
  page.on('pageerror', e => console.log('pageerror', e.message));
  await page.goto(`http://localhost:${port}/?map=combe-down&time=12:00&net=local`);
  await page.waitForFunction(() => document.getElementById('solo') && !document.getElementById('solo').disabled, null, { timeout: 120000 });
  await page.waitForTimeout(4000);
  await page.evaluate(() => document.getElementById('solo').click());
  await page.waitForFunction(() => window.__game && window.__game(), null, { timeout: 120000 });
  await page.evaluate(() => {
    const g = window.__game(); const orig = g.update.bind(g);
    g.update = (dt) => { orig(dt); const v = window.__view; if (!v) return;
      const p = g.player; p.pos.set(v.at[0], p.pos.y, -v.at[1]); p.vel.set(0, 0, 0); p.health = 100;
      const cam = g.camera; cam.position.set(v.eye[0], v.eye[2], -v.eye[1]); cam.lookAt(v.look[0], v.look[2], -v.look[1]); };
    for (const id of ['menu', 'pause', 'hud']) { const m = document.getElementById(id); if (m) m.style.display = 'none'; }
  });
  for (const [name, v] of Object.entries(views)) {
    await page.evaluate(v => { const g = window.__game(); g.player.spawn(v.at[0], -v.at[1], 0); window.__view = v; }, v);
    await page.waitForTimeout(+process.env.WAIT || 30000);
    await page.screenshot({ path: `${out}/${name}-${suffix}.png` });
    console.log('shot', name);
  }
} finally { await browser.close(); sv.close(); }
