// A check on the climb up Bath Abbey (web/src/climb.ts, web/src/abbeyclimb.ts) in the real game: a
// built game (web/dist) served to a muted headless Chrome that can't make a sound or take the
// mouse (as tools/shoot.mjs does), in one tab, in a local test room. At the Abbey:
// - the Abbey's ladders are offered to the player, and the climb's noticeboard is up outside it;
// - E at the noticeboard takes the job, the countdown holds you on the line, then GO;
// - an angel coming down the ladder of angels knocks you off it;
// - waiting on each moulding for the stretch's angel to pass gets you up to the turret's crown;
// - from the nave's ridge a jump at the tower gets you onto its ledge;
// - a running jump clears the gap in the ledge;
// - stood up on the ledge while the bells ring shakes you off it, and crouching holds you on;
// - moving on the steeplejack's ladder while the bells ring shakes you off, and climbing it
//   between peals gets you to the top of the tower, where the clock stops.
// Shots of each step, and the frame rate at the west front.
//
//   cd web && npx vite build --logLevel error && cd .. && node tools/climb_probe.mjs --out climb
//
// Writes <out>/report.txt, <out>/probe.json and <out>/*.png; exits 1 if a check fails.
import { createRequire } from "module";
import fs from "fs";
import http from "http";
import path from "path";

const WEB = new URL("../web/", import.meta.url).pathname;
const { chromium } = (() => {
  if (process.env.PW) return createRequire(import.meta.url)(process.env.PW);
  try { return createRequire(WEB + "package.json")("playwright"); } catch { return createRequire(import.meta.url)("playwright"); }
})();

const argv = process.argv.slice(2), opt = { dist: WEB + "dist", out: "climb", room: "CLIMBTEST" + Math.floor(Math.random() * 1000) };
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
const complaints = [], checks = [], log = { started: new Date().toISOString() };
const check = (name, ok, detail = "") => { checks.push({ name, ok: !!ok, detail }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ": " + detail : ""}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** A tab in the test room, playing, with the player's movement live (no pointer lock headless). */
async function join(name) {
  const page = await context.newPage();
  page.on("pageerror", (e) => complaints.push(`${name} error: ${e.message}`));
  await page.goto(`http://127.0.0.1:${port}/?map=combe-down&net=local&room=${opt.room}&time=11:00&fx=0`);
  await page.evaluate(() => { window.__budget = 40; });
  await page.waitForFunction(() => !document.getElementById("play")?.disabled, null, { timeout: 120000 });
  await page.fill("#name", name);
  await page.click("#play");
  await page.waitForFunction(() => window.__game && window.__game() && window.__game().map, null, { timeout: 180000 });
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
    // the Abbey's frame, as web/src/abbeyclimb.ts works it out from its set piece's place
    const m = g.map, [lon0, lat0] = m.d.centre, kx = 111320 * Math.cos((lat0 * Math.PI) / 180), ky = 110574;
    const ox = (-2.358847 - lon0) * kx, oy = (51.3814293 - lat0) * ky, a = ((90 - 82.4) * Math.PI) / 180, ux = Math.cos(a), uy = Math.sin(a), y0 = 24.85 - m.z0;
    window.__ab = {
      at: (lx, ly, lz) => [ox + ux * lx + uy * lz, y0 + ly, -(oy + uy * lx - ux * lz)],
      local: (x, y, z) => { const dx = x - ox, dy = -z - oy; return [dx * ux + dy * uy, y - y0, dx * uy - dy * ux]; },
      yaw: (dlx, dlz) => { const dx = ux * dlx + uy * dlz, dz = -(uy * dlx - ux * dlz); return Math.atan2(-dx, -dz); },
    };
    /** Stand at (lx, ly, lz) in the Abbey's frame, facing (dlx, dlz) in it. */
    window.__stand = (lx, ly, lz, dlx, dlz, pitch = 0) => {
      const p = g.player, [x, y, z] = window.__ab.at(lx, ly, lz);
      window.__park = null; p.ladder = null;
      p.pos.set(x, y, z); p.vel.set(0, 0, 0); p.yaw = window.__ab.yaw(dlx, dlz); p.pitch = pitch; p.onGround = true;
    };
    /** Where you are in the Abbey's frame, and what you're doing. */
    window.__me = () => {
      const p = g.player, [lx, ly, lz] = window.__ab.local(p.pos.x, p.pos.y, p.pos.z), j = g.quests.job;
      return { lx, ly, lz, on: p.ladder ? (p.ladder === j?.ab?.jack ? "jack" : "angels") : "", g: p.onGround, crouch: p.crouch, stage: j?.stage ?? -1, over: !!j?.over };
    };
    /** Where the climb's angel on stretch k of ladder s is in its round: u seconds in, and how long it takes to come down. */
    window.__angel = (s, k) => {
      const j = g.quests.job, a = j?.angels.find((q) => q.s === s && q.k === k);
      if (!a) return null;
      const cycle = 2.5 + a.down + 2.5, now = j.tick;
      return { u: (((now + a.offset) % cycle) + cycle) % cycle, down: a.down, cycle };
    };
    window.__bells = () => { const j = g.quests.job; return j ? ((j.tick % 20) + 20) % 20 : -1; };
  });
  return page;
}

/** Wait till the squares round the player are loaded and built. */
async function settle(page) {
  const t0 = Date.now();
  await wait(1500);
  while (Date.now() - t0 < 90000) {
    if (await page.evaluate(() => (window.__tilesPending ?? 0) === 0)) break;
    await wait(500);
  }
  await wait(1500);
}

const key = (page, code, down) => page.evaluate(([c, d]) => window.__key(c, d), [code, down]);
const tap = async (page, code) => { await key(page, code, true); await wait(90); await key(page, code, false); };
const me = (page) => page.evaluate(() => window.__me());
const shot = (page, name) => page.screenshot({ path: `${opt.out}/${name}.png` });
/** Look from (lx, ly, lz) at (tx, ty, tz), in the Abbey's frame. */
const look = (page, c, t) => page.evaluate(([c, t]) => { const a = window.__ab.at(...c), b = window.__ab.at(...t); window.__cam = [...a, ...b]; }, [c, t]);
const unlook = (page) => page.evaluate(() => { window.__cam = null; });
/** Poll till f(state) or the time's up; returns the last state. */
async function until(page, secs, f) {
  const t0 = Date.now();
  let s = await me(page);
  while (Date.now() - t0 < secs * 1000 && !f(s)) { await wait(50); s = await me(page); }
  return s;
}

const A = await join("Climber");
try {
  // ---- to the Abbey ----------------------------------------------------------------------------
  await A.evaluate(() => { const [x, y, z] = window.__ab.at(-45, 0, 3); window.__park = [x, y + 150, z]; });
  await settle(A);
  await A.evaluate(() => window.__stand(-45, 0, 3, 1, 0));
  await A.evaluate(() => { const g = window.__game(), [x, , z] = window.__ab.at(-45, 0, 3), p = g.player; p.pos.y = g.map.floor(x, z, p.pos.y + 3); });
  await wait(800);
  const offered = await A.evaluate(() => {
    const g = window.__game(), p = g.player;
    return { rungs: p.ladders.length, posts: g.quests.posts.filter((q) => q.kind.id === "climb").map((q) => ({ x: q.x, z: q.z, title: q.offer.title })) };
  });
  check("the Abbey's ladders are there to climb", offered.rungs >= 7, `${offered.rungs} ladders offered at the west front`);
  check("the climb's noticeboard is up outside the west front", offered.posts.length === 1, JSON.stringify(offered.posts));
  // views of the west front, the turret's crown and the tower
  await look(A, [-70, 8, -2], [-34, 14, 0]); await wait(900); await shot(A, "1-west-front");
  await look(A, [-44, 30, -16], [-34.5, 23, -6.7]); await wait(700); await shot(A, "2-turret-crown");
  await look(A, [4, 31, -24], [5, 32, -6]); await wait(700); await shot(A, "3-tower-north-face");
  await look(A, [-7, 30, 6], [2.5, 27, -2.5]); await wait(700); await shot(A, "4-tower-ledge-gap");
  await unlook(A);

  // ---- take the job ----------------------------------------------------------------------------
  const post = offered.posts[0];
  if (post) {
    await A.evaluate((q) => { const g = window.__game(), p = g.player; p.pos.set(q.x + 1, g.map.floor(q.x + 1, q.z, p.pos.y + 3), q.z); p.vel.set(0, 0, 0); }, post);
    await wait(400);
    await tap(A, "KeyE");
    await wait(1200);
  }
  const taken = await A.evaluate(() => { const g = window.__game(), j = g.quests.job; return { kind: j?.offer.kind ?? null, held: !!j?.held?.(), angels: j?.angels?.length ?? 0 }; });
  check("E at the noticeboard takes the job, held on the line", taken.kind === "climb" && taken.held, JSON.stringify(taken));
  check("the angels are out", taken.angels === 6, `${taken.angels} angels`);
  await look(A, [-50, 6, -10], [-36, 10, -6.7]); await wait(600); await shot(A, "5-start-line-angels"); await unlook(A);
  await wait(8000);
  const go = await A.evaluate(() => { const j = window.__game().quests.job; return { held: !!j?.held?.(), t: j ? (Date.now() - j.myGo) / 1000 : null }; });
  check("GO after the countdown", go.t !== null && go.t >= 0 && !go.held, JSON.stringify(go));
  log.fps = await A.evaluate(() => window.__fps ?? null);

  // ---- the ladder of angels --------------------------------------------------------------------
  // straight up into an angel coming down: knocked off
  const foot = [-35.92 - 0.6, 0, -6.7];
  let knocked = false;
  for (let tries = 0; tries < 3 && !knocked; tries++) {
    // wait till the bottom stretch's angel is just setting off down
    const t0 = Date.now();
    while (Date.now() - t0 < 15000) { const a = await A.evaluate(() => window.__angel(0, 0)); if (a && a.u > 2.3 && a.u < 2.6) break; await wait(40); }
    await A.evaluate((f) => { window.__stand(f[0], 0, f[2], 1, 0); const g = window.__game(), [x, , z] = window.__ab.at(f[0], 0, f[2]); g.player.pos.y = g.map.floor(x, z, g.player.pos.y + 3); }, foot);
    await key(A, "KeyW", true);
    const t1 = Date.now();
    let was = false;
    while (Date.now() - t1 < 6000) {
      const q = await me(A);
      if (q.on) was = true;
      if (was && !q.on && q.ly < 8) { knocked = true; break; }
      if (q.ly > 8.1) break;
      await wait(40);
    }
    await key(A, "KeyW", false);
    if (knocked) await shot(A, "6-knocked-off-by-an-angel");
    await wait(2500);
  }
  check("an angel coming down the ladder knocks you off", knocked);

  // properly: from the foot, each stretch as soon as its angel has passed (you stop on each
  // moulding till you let go of W and press it again)
  const toFoot = () => A.evaluate((f) => { window.__stand(f[0], 0, f[2], 1, 0); const g = window.__game(), [x, , z] = window.__ab.at(f[0], 0, f[2]); g.player.pos.y = g.map.floor(x, z, g.player.pos.y + 3); }, foot);
  await toFoot();
  const tops = [8.2, 16.3, 24.5];
  let k = 0, falls = 0;
  const tl = Date.now();
  while (k < 3 && Date.now() - tl < 90000) {
    const a = await A.evaluate((k) => window.__angel(0, k), k);
    const after = a.u - 2.5 - a.down;
    if (after >= 0 && after < 0.6) {
      await key(A, "KeyW", true);
      const t2 = Date.now();
      let q = await me(A), was = false;
      while (Date.now() - t2 < 8000) {
        q = await me(A);
        if (q.on) was = true;
        if (was && !q.on) break;
        await wait(30);
      }
      await key(A, "KeyW", false);
      await wait(300);
      q = await me(A);
      if (q.ly > tops[k] - 0.3) { k++; if (k === 2) await shot(A, "7-on-the-moulding"); }
      else { falls++; await wait(2500); await toFoot(); k = 0; }
    }
    await wait(30);
  }
  const crown = await me(A);
  log.ladder = { secs: (Date.now() - tl) / 1000, falls, crown };
  check("waiting for each angel to pass gets you up to the turret's crown", k === 3 && crown.ly > 24.3, `${log.ladder.secs.toFixed(1)} s, ${falls} falls, at height ${crown.ly.toFixed(2)}, stage ${crown.stage}`);
  await shot(A, "8-on-the-crown");

  // ---- onto the tower's ledge -------------------------------------------------------------------
  await A.evaluate(() => window.__stand(-2, 25.05, 0, 1, 0));
  await key(A, "KeyW", true);
  await wait(1600);
  await tap(A, "Space");
  const ledge = await until(A, 3, (s) => s.g && s.ly > 27.3);
  await key(A, "KeyW", false);
  check("a jump at the tower from the ridge gets you onto its ledge", ledge.ly > 27.3 && ledge.ly < 27.8, `height ${ledge.ly.toFixed(2)}, stage ${ledge.stage}`);
  await shot(A, "9-on-the-ledge");

  // ---- the gap ---------------------------------------------------------------------------------
  let cleared = null;
  for (let tries = 0; tries < 4 && !cleared; tries++) {
    await A.evaluate(() => window.__stand(2.1, 27.55, 3, 0, -1));
    await key(A, "ShiftLeft", true); await key(A, "KeyW", true);
    await until(A, 3, (s) => s.lz < -0.9 + tries * 0.1);
    await tap(A, "Space");
    await wait(250);
    const s = await until(A, 2, (s) => s.g);
    await key(A, "KeyW", false); await key(A, "ShiftLeft", false);
    await wait(500);
    const e = await me(A);
    if (e.ly > 27.3 && e.lz < -4.2) cleared = e;
  }
  check("a running jump clears the gap in the ledge", !!cleared, cleared ? `landed at ${cleared.lz.toFixed(2)} along` : "missed every time");
  if (cleared) await shot(A, "10-over-the-gap");

  // ---- the bells on the ledge --------------------------------------------------------------------
  const peal = async () => { const t0 = Date.now(); while (Date.now() - t0 < 25000) { const b = await A.evaluate(() => window.__bells()); if (b >= 15.2 && b < 16) return true; await wait(50); } return false; };
  const quiet = async () => { const t0 = Date.now(); while (Date.now() - t0 < 25000) { const b = await A.evaluate(() => window.__bells()); if (b >= 0.2 && b < 1) return true; await wait(50); } return false; };
  await A.evaluate(() => window.__stand(3.0, 27.55, -6.4, 1, 0));
  await peal();
  const shaken = await until(A, 4, (s) => s.ly < 27.2);
  check("stood up on the ledge while the bells ring, you're shaken off", shaken.ly < 27.2, `height ${shaken.ly.toFixed(2)}`);
  await quiet();
  await A.evaluate(() => window.__stand(3.0, 27.55, -6.4, 1, 0));
  await key(A, "KeyC", true);
  await peal();
  const held = await until(A, 4, (s) => s.ly < 27.2);
  await shot(A, "11-crouched-in-the-bells");
  await key(A, "KeyC", false);
  check("crouched on the ledge, you hold on through the bells", held.ly > 27.3, `height ${held.ly.toFixed(2)}`);

  // ---- the steeplejack's ladder -----------------------------------------------------------------
  // on it just before a peal and keep climbing through it: shaken off
  const t3 = Date.now();
  while (Date.now() - t3 < 25000) { const b = await A.evaluate(() => window.__bells()); if (b >= 12.5 && b < 13) break; await wait(50); }
  await A.evaluate(() => window.__stand(3.7, 27.55, -6.45, 0, 1));
  await key(A, "KeyW", true);
  const shookOff = await (async () => { const t0 = Date.now(); let was = false; while (Date.now() - t0 < 8000) { const q = await me(A); if (q.on === "jack") was = true; if (was && !q.on) return q.ly < 39; await wait(40); } return false; })();
  await key(A, "KeyW", false);
  check("moving on the steeplejack's ladder while the bells ring shakes you off", shookOff);
  await quiet();
  await A.evaluate(() => window.__stand(3.7, 27.55, -6.45, 0, 1));
  await key(A, "KeyW", true);
  const top = await until(A, 10, (s) => s.over);
  await key(A, "KeyW", false);
  const fin = await A.evaluate(() => { const j = window.__game().quests.job; return { over: !!j?.over, results: j?.results ?? [], stage: j?.stage }; });
  check("up the steeplejack's ladder between peals to the top, where the clock stops", fin.over && fin.results.length === 1, JSON.stringify({ height: top.ly.toFixed(2), ...fin }));
  await look(A, [-6, 46, -14], [7, 40, 0]); await wait(700); await shot(A, "12-on-top-of-the-tower"); await unlook(A);
} catch (e) {
  complaints.push(`probe: ${e.stack ?? e}`);
} finally {
  log.checks = checks; log.complaints = complaints;
  fs.writeFileSync(`${opt.out}/probe.json`, JSON.stringify(log, null, 1));
  const lines = [...checks.map((c) => `${c.ok ? "PASS" : "FAIL"} ${c.name}${c.detail ? ": " + c.detail : ""}`), `fps at the west front: ${log.fps ?? "-"}`, "", complaints.length ? complaints.join("\n") : "no page errors"];
  fs.writeFileSync(`${opt.out}/report.txt`, lines.join("\n") + "\n");
  console.log(complaints.length ? complaints.join("\n") : "no page errors");
  await browser.close();
  server.close();
}
process.exit(checks.length && checks.every((c) => c.ok) && !complaints.length ? 0 : 1);
