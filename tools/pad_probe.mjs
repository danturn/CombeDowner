// A check on the controller's Warzone layout, its prompts and its buttons in Settings, and the dive,
// with a made-up pad (a stubbed navigator.getGamepads) in a muted headless Chrome:
// - buttons saved under the old layout keep what was moved and take the new layout for the rest;
// - by a parked car the prompt names E after a key and □ after the pad, and a tap of □ gets in;
// - at the wheel R2 drives and △ gets out;
// - away from anything to use, a tap of □ reloads and a hold uses (and doesn't reload);
// - △ switches weapon; ○ tapped crouches and stands, held lies down;
// - sprinting (L3) and holding ○ dives forward and lands you flat;
// - down the mines: □ uses at once, △ switches weapon, ○ crouches, and crouching mid-sprint dives.
//
//   cd web && npx vite build --logLevel error && cd .. && node tools/pad_probe.mjs <out folder>
//
// Writes its shots to the folder; exits 1 if a check fails.
import { createRequire } from "module";
import fs from "fs";
import http from "http";
import path from "path";
import { MUTED_ARGS, silenceContext, silenceNote } from "./quiet-guard.mjs";
const WEB = new URL("../web/", import.meta.url).pathname;
const { chromium } = createRequire(WEB + "package.json")("playwright");
const OUT = process.argv[2] ?? "padprobe";
fs.mkdirSync(OUT, { recursive: true });
const dist = WEB + "dist";
const TYPES = { ".js": "text/javascript", ".html": "text/html", ".css": "text/css", ".json": "application/json" };
const server = http.createServer((q, res) => {
  let f = path.join(dist, decodeURIComponent(q.url.split("?")[0])); if (f.endsWith("/")) f += "index.html";
  fs.readFile(f, (e, b) => { if (e) { res.statusCode = 404; return res.end(); } res.setHeader("content-type", TYPES[path.extname(f)] || "application/octet-stream"); res.end(b); });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const browser = await chromium.launch({ headless: true, channel: "chrome", args: [...MUTED_ARGS, "--use-angle=metal", "--enable-gpu"] });
const context = await browser.newContext({ viewport: { width: 1100, height: 700 } });
await silenceContext(context);
await context.addInitScript(() => {
  window.__pad = { buttons: Array.from({ length: 18 }, () => ({ pressed: false, touched: false, value: 0 })), axes: [0, 0, 0, 0] };
  const g = () => ({ id: "Stub pad (STANDARD GAMEPAD)", index: 0, connected: true, mapping: "standard", timestamp: performance.now(), buttons: window.__pad.buttons, axes: window.__pad.axes });
  navigator.getGamepads = () => [g()];
  window.__keys = [];
  addEventListener("keydown", (e) => window.__keys.push(e.code), true);
});
const B = { cross: 0, circle: 1, square: 2, triangle: 3, r2: 7, l3: 10 };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const check = (n, ok, d = "") => { checks.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}: ${d}`); };
const page = await context.newPage();
page.on("pageerror", (e) => console.log("pageerror", e.message));
const silent = [];

async function enter() {
  await page.goto(`http://127.0.0.1:${port}/?map=combe-down&net=local&room=PADT${Math.floor(Math.random() * 1e4)}&time=11:00&fx=0`);
  await page.evaluate(() => localStorage.removeItem("cd-padbuttons"));
  await page.reload();
  await page.waitForFunction(() => !document.getElementById("play")?.disabled, null, { timeout: 120000 });
  await page.fill("#name", "Pad");
  await page.click("#play");
  await page.waitForFunction(() => window.__game && window.__game() && window.__game().map, null, { timeout: 180000 });
  await page.evaluate(() => {
    const g = window.__game(), u = g.update.bind(g);
    // __freeze holds the game still for a shot (the dive in mid-air)
    g.update = (dt) => { g.active = true; document.getElementById("pause").hidden = true; if (!window.__freeze) u(dt); };
  });
  await page.addStyleTag({ content: "#menu,#debug,#micask,#chronicle,#scoreboard{display:none!important}" });
  await wait(1500);
}
const toCar = () => page.evaluate(() => {
  const g = window.__game(), p = g.player.pos;
  const v = g.vehicles.list.filter((o) => o.kind !== "bus" && !o.driver).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
  const at = v.exitSpot(0); g.player.spawn(at.x, at.z, 0);
});
/** Somewhere open: the nearest spot with 12 m clear and level ahead, facing that way. */
const toOpen = (from) => page.evaluate((from) => {
  const g = window.__game(), m = g.map, p = g.player.pos, x0 = from?.[0] ?? p.x, z0 = from?.[1] ?? p.z;
  for (let r = 15; r < 600; r += 10) for (let a = 0; a < 24; a++) {
    const x = x0 + Math.cos(a / 24 * 6.283) * r, z = z0 + Math.sin(a / 24 * 6.283) * r;
    for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      let ok = !m.inWater(x, z) && !g.vehicles.nearest(x, z, m.ground(x, z), 8) && !g.traffic.nearest(x, z, m.ground(x, z), 8);
      for (let d = 0; ok && d <= 12; d += 0.5) {
        const qx = x - Math.sin(yaw) * d, qz = z - Math.cos(yaw) * d, q = { x: qx, z: qz };
        m.collide(q, m.ground(qx, qz), 0.5);
        if (Math.hypot(q.x - qx, q.z - qz) > 0.01 || Math.abs(m.ground(qx, qz) - m.ground(x, z)) > 0.5) ok = false;
      }
      if (!ok) continue;
      g.player.spawn(x, z, yaw);
      return [x, z, yaw];
    }
  }
  return null;
}, from);
const hint = () => page.evaluate(() => document.getElementById("usehint").textContent);
const press = (b, v = 1) => page.evaluate(([b, v]) => { window.__pad.buttons[b].pressed = v > 0; window.__pad.buttons[b].value = v; }, [b, v]);
const padHold = async (b, ms) => { await press(b); await wait(ms); await press(b, 0); await wait(300); };
const padTap = (b) => padHold(b, 120);
const nudge = async () => { await page.evaluate(() => { window.__pad.axes[2] = 0.5; }); await wait(150); await page.evaluate(() => { window.__pad.axes[2] = 0; }); await wait(300); };
const state = () => page.evaluate(() => {
  const g = window.__game(), p = g.player, w = g.weapon;
  return { driving: g.driving, kind: w.kind, ammo: w.ammo, reloading: +w.reloading.toFixed(2), crouch: p.crouchLatch, prone: p.proneLatch, diving: p.diving, x: +p.pos.x.toFixed(2), z: +p.pos.z.toFixed(2), speed: +p.speed.toFixed(2) };
});
const keysSince = () => page.evaluate(() => { const k = window.__keys; window.__keys = []; return k; });
const rows = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll(".padbind")].map((r) => [r.dataset.act, r.querySelector("kbd").textContent])));
const OLD = { fire: 7, aim: 6, jump: 0, use: 2, reload: 3, crouch: 1, prev: 4, next: 5, trick: 10, radio: 11, scores: 8, map: 17, torch: 12, ride: 13, bino: 14, mark: 15, horn: 5, view: 1, left: 14, right: 15 };

try {
  // ---- buttons kept from the old layout ----
  await page.goto(`http://127.0.0.1:${port}/?map=combe-down`);
  await page.evaluate((o) => localStorage.setItem("cd-padbuttons", JSON.stringify({ ...o, jump: 2, use: 0 })), OLD);
  await page.reload();
  await page.waitForSelector(".padbind", { state: "attached" });
  const moved = await rows();
  console.log("old list with Jump and Use swapped by hand reads:", JSON.stringify(moved));
  check("old list: moved Jump stays on □", moved.jump === "□", moved.jump);
  check("old list: moved Use stays on ✕ (as a hold)", moved.use === "hold ✕", moved.use);
  // nothing's free on a pad, so Reload goes where it can be a tap: with Use's hold on ✕, as it is on □ by default
  check("old list: Reload leaves □ to Jump, as the tap on Use's button", moved.reload === "✕", moved.reload);
  check("old list: △ switches weapon", moved.swap === "△", moved.swap);
  await page.evaluate((o) => localStorage.setItem("cd-padbuttons", JSON.stringify(o)), OLD);
  await page.reload();
  await page.waitForSelector(".padbind", { state: "attached" });
  const untouched = await rows();
  check("old list never moved: takes the new layout", untouched.reload === "□" && untouched.use === "hold □" && untouched.swap === "△" && untouched.prone === "hold ○" && untouched.out === "△", JSON.stringify(untouched));

  await enter();
  // ---- the Buttons list in Settings ----
  await nudge();
  // the list lifted out on its own, whole, for the shot (in Settings it scrolls)
  await page.evaluate(() => {
    const host = document.createElement("div");
    host.id = "shotbox";
    host.style.cssText = "position:fixed;left:0;top:0;width:460px;z-index:99999;background:#1b1b1d;padding:12px";
    const c = document.querySelector(".padbuttons").cloneNode(true);
    host.append(c); document.body.append(host);
  });
  await (await page.$("#shotbox")).screenshot({ path: `${OUT}/settings-buttons.png` });
  await page.evaluate(() => document.getElementById("shotbox").remove());

  // ---- by a car: □ at the prompt, then driving ----
  await toCar();
  await page.keyboard.press("KeyK"); await wait(300);
  check("keys: prompt names E", /^E Get in/.test(await hint()), await hint());
  await nudge();
  check("pad: prompt names □", /^□ /.test(await hint()), await hint());
  await page.screenshot({ path: `${OUT}/prompt-square.png` });
  const s0 = await state();
  await keysSince();
  await padTap(B.square); await wait(1200);
  let s1 = await state();
  const kIn = await keysSince();
  check("tap □ at the prompt uses it (gets in), no reload", s1.driving && kIn.includes("KeyE") && !kIn.includes("KeyR"), `keys ${kIn.join(",")} ${JSON.stringify(s1)}`);
  const dh = await page.evaluate(() => document.getElementById("drivehint").textContent);
  check("driving hint: △ out", /△ out/.test(dh), dh);
  await press(B.r2); await wait(2000);
  s1 = await state();
  await press(B.r2, 0);
  check("R2 drives", Math.hypot(s1.x - s0.x, s1.z - s0.z) > 1, `moved ${Math.hypot(s1.x - s0.x, s1.z - s0.z).toFixed(1)} m`);
  await page.screenshot({ path: `${OUT}/driving.png` });
  await wait(2500);
  await padTap(B.triangle); await wait(1200);
  check("△ gets out", !(await state()).driving, "");

  // ---- out in the open: tap reloads, hold uses, △ swaps, ○ crouches and lies down ----
  const open = await toOpen([s0.x, s0.z]);
  check("found open ground", !!open, JSON.stringify(open));
  await wait(1000);
  await page.evaluate(() => { const g = window.__game(); g.switchTo("rifle"); g.weapon.ammo = 3; g.weapon.reloading = 0; });
  await wait(300);
  check("no use prompt in the open", !(await page.evaluate(() => window.__game().useOffered)), await hint());
  await keysSince();
  await padTap(B.square);
  let k = await keysSince(); s1 = await state();
  check("tap □ reloads", k.includes("KeyR") && !k.includes("KeyE") && (s1.reloading > 0 || s1.ammo > 3), `keys ${k.join(",")} reloading ${s1.reloading}`);
  await wait(3000);
  await page.evaluate(() => { const w = window.__game().weapon; w.ammo = 3; w.reloading = 0; });
  await press(B.square); await wait(200);
  const early = await keysSince();
  await wait(400); await press(B.square, 0); await wait(300);
  k = await keysSince(); s1 = await state();
  check("hold □ uses (E once held) and doesn't reload", !early.length && k.includes("KeyE") && !k.includes("KeyR") && s1.reloading === 0 && s1.ammo === 3, `keys before 0.3 s: [${early}], after: [${k}]`);
  const kind0 = (await state()).kind;
  await padTap(B.triangle);
  check("△ switches weapon", (await state()).kind !== kind0, `${kind0} -> ${(await state()).kind}`);
  await padTap(B.circle);
  s1 = await state();
  check("tap ○ crouches", s1.crouch && !s1.prone, JSON.stringify(s1));
  await padTap(B.circle);
  s1 = await state();
  check("tap ○ again stands", !s1.crouch && !s1.prone, "");
  await padHold(B.circle, 600);
  s1 = await state();
  check("hold ○ lies down", s1.prone, JSON.stringify(s1));
  await padTap(B.circle);
  check("tap ○ gets up", !(await state()).prone, "");

  // ---- the dive: sprint with L3, then hold ○ ----
  await toOpen(); await wait(1000);
  await page.evaluate(() => {
    const g = window.__game(), p = g.player, u = g.update;
    window.__diveFrom = null; window.__diveMax = 0;
    g.update = (dt) => {
      u(dt);
      if (p.diving && !window.__diveFrom) window.__diveFrom = [p.pos.x, p.pos.z, p.pos.y];
      if (p.diving) window.__diveMax = Math.max(window.__diveMax, p.pos.y - window.__diveFrom[2]);
      if (p.diving && p.prone > 0.3 && !window.__froze) { window.__froze = true; window.__freeze = true; }
    };
  });
  await page.evaluate(() => { window.__pad.axes[1] = -1; });
  await padTap(B.l3);
  await wait(1200);
  check("sprinting before the dive", await page.evaluate(() => window.__game().player.sprinting), `${(await state()).speed} m/s`);
  await press(B.circle);
  await page.waitForFunction(() => window.__freeze, null, { timeout: 3000 }).catch(() => {});
  await page.screenshot({ path: `${OUT}/dive-mid.png` });
  const mid = await state();
  check("mid-dive", mid.diving, JSON.stringify(mid));
  await page.evaluate(() => { window.__freeze = false; });
  await wait(200);
  await press(B.circle, 0);
  await page.evaluate(() => { window.__pad.axes[1] = 0; });
  await wait(800);
  const after = await state();
  const [from, up] = await page.evaluate(() => [window.__diveFrom, window.__diveMax]);
  const dist = from ? Math.hypot(after.x - from[0], after.z - from[1]) : 0;
  check("dive lands flat", after.prone && !after.diving, JSON.stringify(after));
  check("dive goes about 2-3 m, a little up", dist > 1.8 && dist < 3.8 && up > 0.1 && up < 0.6, `${dist.toFixed(2)} m, ${up.toFixed(2)} m up`);
  await page.screenshot({ path: `${OUT}/dive-landed.png` });
  silent.push("streets: " + await silenceNote(page));

  // ---- down the mines ----
  await page.goto(`http://127.0.0.1:${port}/mines.html?go=1&class=mage&seed=padprobe&net=local&room=PADM${Math.floor(Math.random() * 1e4)}`);
  await page.waitForFunction(() => window.__mines && window.__mines() && window.__mines().player, null, { timeout: 120000 });
  await page.evaluate(() => { const g = window.__mines(), u = g.update.bind(g); g.update = (dt) => { g.active = true; document.getElementById("pause").hidden = true; document.getElementById("classpick").hidden = true; u(dt); }; });
  await wait(2500);
  await nudge();
  const mh = () => page.evaluate(() => window.__mines().held);
  const held0 = await mh();
  await padTap(B.triangle); await wait(200);
  check("mines: △ switches weapon", (await mh()) !== held0, `${held0} -> ${await mh()}`);
  await keysSince();
  await press(B.square); await wait(100);
  k = await keysSince();
  await press(B.square, 0); await wait(200);
  check("mines: □ uses at once", k.includes("KeyE"), k.join(","));
  await press(B.circle); await wait(400);
  check("mines: ○ crouches", await page.evaluate(() => window.__mines().player.crouch > 0.5), "");
  await press(B.circle, 0); await wait(400);
  await page.evaluate(() => { window.__pad.axes[1] = -1; });
  await padTap(B.l3); await wait(900);
  const spr = await page.evaluate(() => window.__mines().player.sprinting);
  await press(B.circle); await wait(60);
  const md = await page.evaluate(() => { const p = window.__mines().player; return p.diving || p.diveRest > 0; });
  await press(B.circle, 0);
  await page.evaluate(() => { window.__pad.axes[1] = 0; });
  check("mines: crouch mid-sprint dives", spr && md, `sprinting ${spr}, dived ${md}`);
  silent.push("mines: " + await silenceNote(page));
} finally {
  for (const l of silent) console.log(l);
  await browser.close(); server.close();
}
process.exit(checks.every(Boolean) ? 0 : 1);
