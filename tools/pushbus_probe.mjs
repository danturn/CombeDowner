// Plays Push the Bus (web/src/pushbus.ts, web/src/pensioners.ts) in the real game: a built game
// (web/dist) served to a muted headless Chrome, a bot heaving dead on every beat.
//
//   cd web && npx vite build --logLevel error && cd .. && node tools/quiet.mjs -- node tools/pushbus_probe.mjs --mode serve --out out-bus
//
// --mode serve    on your own: stop at every bus stop, sell the tickets, push on
// --mode ignore   on your own: push straight past every stop
// --mode team     two tabs in a local room (?net=local): one sells while the other pushes, and the
//                 host's and the guest's pensioners are compared as it goes
// --shots 1       pictures of the queue, the sale, bubbles, a thrown handbag, a cheer and the result
// Writes <out>/<mode>-report.txt and pictures; exits 1 if a check fails.
import { createRequire } from "module";
import fs from "fs";
import http from "http";
import path from "path";
import { MUTED_ARGS, silenceContext, silenceNote } from "./quiet-guard.mjs";

const WEB = new URL("../web/", import.meta.url).pathname;
const { chromium } = createRequire(WEB + "package.json")("playwright");
const argv = process.argv.slice(2), opt = { mode: "serve", out: "out-bus", map: "combe-down", shots: "0", seed: "", late: "0" };
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) opt[argv[i].slice(2)] = argv[++i];
fs.mkdirSync(opt.out, { recursive: true });

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
const browser = await chromium.launch({ headless: true, channel: "chrome",
  args: [...MUTED_ARGS, "--use-angle=metal", "--enable-gpu", "--disable-renderer-backgrounding", "--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows"] });
const context = await browser.newContext({ viewport: { width: 1100, height: 700 } });
await context.addInitScript(() => { try { localStorage.setItem("cd-mic", "off"); } catch { /* */ } });
await silenceContext(context);
const report = [], checks = [], errors = [];
const log = (s) => { report.push(s); console.log(s); };
const check = (name, ok, detail = "") => { checks.push(!!ok); log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ": " + detail : ""}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const room = "BUSPAX" + Math.floor(Math.random() * 1e5);

async function join(name) {
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  await page.goto(`http://127.0.0.1:${port}/?map=${opt.map}&net=local&room=${room}&time=11:00&fx=0`);
  await page.waitForFunction(() => !document.getElementById("play")?.disabled, null, { timeout: 180000 });
  await page.fill("#name", name);
  await page.click("#play");
  await page.waitForFunction(() => window.__game && window.__game() && window.__game().map, null, { timeout: 180000 });
  await page.addStyleTag({ content: "#menu,#pause,#debug,#touch,#micask,#scoreboard,#chronicle{display:none!important}" });
  await page.evaluate(() => {
    const g = window.__game(), u = g.update.bind(g);
    window.__bot = { heave: false, sell: false, beat: -1, heaves: 0, sold: 0, ev: [] };
    g.update = (dt) => {
      g.active = true;
      u(dt);
      const cam = window.__cam;
      if (cam) { g.camera.position.set(cam[0], cam[1], cam[2]); g.camera.lookAt(cam[3], cam[4], cam[5]); g.camera.updateMatrixWorld(); }
      const pb = window.__pushbus?.(), bot = window.__bot;
      if (!pb) return;
      // dead on the beat, once a beat
      const late = bot.late ?? 0, ph = (pb.ph - late + pb.period) % pb.period, beatNo = pb.ph < late ? pb.n - 1 : pb.n;
      if (bot.heave && pb.onBus && beatNo !== bot.beat && pb.period - ph < 0.03) {
        bot.beat = beatNo; bot.heaves++;
        dispatchEvent(new KeyboardEvent("keydown", { code: "Space" })); dispatchEvent(new KeyboardEvent("keyup", { code: "Space" }));
      }
      // at the door, the fare taken when it's exactly right
      const c = pb.pax.cnt;
      if (bot.sell && pb.pax.seller === g.net.selfId && c.i >= 0 && c.phase < 3 && c.k >= c.steps.length && c.v === pb.pax.pens[c.i].fare && !g.useKey) { bot.sold++; g.useKey = true; }
    };
    window.__state = () => {
      const pb = window.__pushbus?.();
      if (!pb) return null;
      const P = pb.pax;
      return { s: pb.s, v: pb.v, mode: pb.mode, onBus: pb.onBus, host: pb.host, el: pb.el, hill: pb.hill, door: pb.door, doorS: pb.doorS, rear: pb.rear, fx: pb.fx, fz: pb.fz,
        stops: P.stops.map((s) => ({ s: s.s, st: s.st, sold: s.sold })), pens: P.pens.map((p) => [p.k, p.st, +p.ang.toFixed(2)]), seller: P.seller, cnt: { i: P.cnt.i, v: P.cnt.v, k: P.cnt.k, n: P.cnt.steps.length, ph: P.cnt.phase }, hint: window.__game().quests.jobHint?.() ?? '',
        done: window.__game().quests.job?.done ?? null, self: window.__game().net.selfId, bot: window.__bot };
    };
    window.__stand = (x, z, yaw) => { const p = g.player; p.spawn(x, z, yaw); p.vel.set(0, 0, 0); };
  });
  return page;
}
async function settle(page) {
  await page.evaluate(() => new Promise((res) => {
    const c = globalThis.__calm(20, 1500), t0 = performance.now();
    const f = () => (c.still(window.__tilesPending ?? 0) || performance.now() - t0 > 90000 ? res() : requestAnimationFrame(f));
    f();
  }));
}
const st = (page) => page.evaluate(() => window.__state());
const use = (page) => page.evaluate(() => { window.__game().useKey = true; });
const key = (page, code) => page.evaluate((c) => { dispatchEvent(new KeyboardEvent("keydown", { code: c })); dispatchEvent(new KeyboardEvent("keyup", { code: c })); }, code);
const shot = async (page, name) => { if (opt.shots !== "0") await page.screenshot({ path: `${opt.out}/${name}.png` }); };
const bot = (page, o) => page.evaluate((o) => Object.assign(window.__bot, o), o);

async function takeBus(page) {
  return page.evaluate((seed) => {
    const g = window.__game(), q = g.quests;
    const spots = q.posts?.filter?.((p) => p.offer?.kind === "pushbus") ?? [];
    const o = spots[0]?.offer;
    if (!o) return "no Push the Bus on this map";
    if (seed) o.seed = +seed;
    q.take(o);
    return "ok";
  }, opt.seed);
}
async function untilJob(page, secs = 40) {
  const t0 = Date.now();
  while (Date.now() - t0 < secs * 1000) { if (await st(page)) return true; await wait(300); }
  return false;
}
async function grab(page) {
  const s = await st(page);
  if (s.onBus) return true;
  await page.evaluate(([x, z, fx, fz]) => window.__stand(x - fx * 1.2, z - fz * 1.2, Math.atan2(-fx, -fz)), [s.rear.x, s.rear.z, s.fx, s.fz]);
  await wait(300);
  await use(page);
  await wait(400);
  return (await st(page)).onBus;
}
async function toDoor(page) {
  const s = await st(page);
  await key(page, "KeyS");
  await wait(200);
  await page.evaluate(([x, z, fx, fz]) => window.__stand(x + fx * 1.3 + fz * 0.5, z + fz * 1.3 - fx * 0.5, Math.atan2(fx, fz)), [s.door.x, s.door.z, s.fx, s.fz]);
  await wait(300);
  await use(page);
  await wait(400);
  return (await st(page)).seller === s.self;
}

/** On your own: push, and at each stop (serve) let go, sell the tickets, and push on. */
async function solo(page, serve) {
  const t0 = Date.now();
  let lastLog = 0, shotQueue = false, shotSale = false, shotBubble = false, forced = false, took = -1;
  check("on the bus at the start", await grab(page));
  await bot(page, { heave: true, sell: true });
  while (Date.now() - t0 < +(opt.secs ?? 420) * 1000) {
    const s = await st(page);
    if (!s || s.done) break;
    const next = s.stops.findIndex((p) => p.st < 2);
    if (Date.now() - lastLog > 5000) { lastLog = Date.now(); log(`t ${s.el}s s ${s.s.toFixed(1)}/${s.hill.top.toFixed(0)} v ${s.v.toFixed(2)} stops ${s.stops.map((p) => p.st).join("")} pens ${s.pens.map((p) => p[1]).join("")} tempers ${s.pens.filter((p) => p[1] === 3).map((p) => p[2]).join(",")} seller ${s.seller === s.self ? 'me' : s.seller} cnt ${JSON.stringify(s.cnt)} sold ${s.bot.sold} hint ${s.hint}`); }
    if (!shotQueue && opt.shots !== "0" && next >= 0 && s.stops[next].s - s.doorS < 25) {
      shotQueue = true;
      await page.evaluate(() => {
        const P = window.__pushbus().pax, i = P.pens.findIndex((p) => p.st === 0), h = P.posAt.get(i), pb = window.__pushbus();
        if (h) window.__cam = [h.x - pb.fx * 6 - pb.fz * 3.5, h.y + 0.8, h.z - pb.fz * 6 + pb.fx * 3.5, h.x + pb.fx * 1.5, h.y - 0.6, h.z + pb.fz * 1.5];
      });
      await wait(400);
      await shot(page, `${opt.mode}-01-stop-queue`);
      await page.evaluate(() => { window.__cam = null; });
    }
    if (!shotBubble && opt.shots !== "0" && s.pens.some((p) => p[1] === 3) && s.onBus) {
      shotBubble = true;
      await page.evaluate(() => { const P = window.__pushbus().pax, i = P.pens.findIndex((p) => p.st === 3); P.pens[i].ang = 0.7; P.speak(i, "I fought in the war for this!"); });
      await wait(700);
      await shot(page, `${opt.mode}-03-speech-bubble`);
    }
    if (!forced && opt.shots !== "0" && s.pens.filter((p) => p[1] === 3).length >= 2 && s.onBus && s.v > 0.3) {
      forced = true;
      // a handbag thrown at you, then a cheer, for the pictures
      await page.evaluate(() => { const P = window.__pushbus().pax, g = window.__game(), i = P.pens.findIndex((p) => p.st === 3); P.event({ k: "px", i, it: 0, to: g.net.selfId }, g.net.selfId, 2.4); });
      await wait(400);
      await shot(page, `${opt.mode}-04a-handbag-flying`);
      await wait(700);
      await shot(page, `${opt.mode}-04b-handbag-splat`);
      await wait(2500);
      await page.evaluate(() => { const P = window.__pushbus().pax, g = window.__game(), i = P.pens.findIndex((p) => p.st === 3); P.event({ k: "pc", i }, g.net.selfId, 2.4); });
      await wait(500);
      await shot(page, `${opt.mode}-05-cheer`);
    }
    const gap = next >= 0 ? s.stops[next].s - s.doorS : 99;
    const waiting = next >= 0 ? s.pens.filter((p) => p[0] === next && p[1] <= 2).length : 0;
    if (serve && waiting) {
      if (s.onBus) {
        // ease off in time for the door to come to rest by the stop
        const want = gap > 2 + 4 * Math.max(0, s.v) || gap <= -5;
        if (want !== s.bot.heave) await bot(page, { heave: want });
        if (!s.bot.heave && Math.abs(s.v) < 0.5 && Math.abs(gap) < 5) { await key(page, "KeyS"); await wait(150); }
      } else if (s.mode <= 1 && s.seller !== s.self && Math.abs(gap) < 5) {
        if (took !== next) { took = next; check(`at stop ${next + 1}: took the door`, await toDoor(page)); } else await toDoor(page);
      } else if (s.mode <= 1 && s.seller === s.self && !shotSale && s.pens.some((p) => p[1] === 2)) {
        shotSale = true; await wait(900); await shot(page, `${opt.mode}-02-ticket-sale`);
      } else if (s.mode <= 1 && s.seller !== s.self) { if (await grab(page)) await bot(page, { heave: true }); }
    } else if (!s.onBus && s.mode <= 1) { if (await grab(page)) await bot(page, { heave: true }); }
    else if (!s.bot.heave) await bot(page, { heave: true });
    await wait(100);
  }
  return st(page);
}

async function result(page, label) {
  await wait(1500);
  const s = await st(page);
  const card = await page.evaluate(() => document.querySelector(".msc-result")?.innerText ?? "");
  log(`${label}: done ${JSON.stringify(s?.done ? { won: s.done.won, title: s.done.title, grade: s.done.grade, card: s.done.card } : null)}`);
  log(`${label}: card text: ${card.replace(/\n+/g, " / ")}`);
  await shot(page, `${opt.mode}-06-result-${label}`);
  return { s, card };
}

try {
  const A = await join("Ann");
  await settle(A);
  if (opt.mode === "team") {
    const B = await join("Bob");
    await settle(B);
    check("took the bus", (await takeBus(A)) === "ok");
    for (let k = 0; k < 6; k++) { await use(A); await use(B); await wait(500); }
    check("both in it", (await untilJob(A, 60)) && (await untilJob(B, 60)));
    await wait(5000);
    const a0 = await st(A), host = a0.host ? A : B, guest = a0.host ? B : A;
    log(`host is ${a0.host ? "Ann" : "Bob"}`);
    check("host on the bus", await grab(host));
    check("guest on the bus", await grab(guest));
    await bot(host, { heave: true }); await bot(guest, { heave: true, sell: true });
    const t0 = Date.now();
    let diffs = 0, samples = 0, sales = 0, lastLog = 0, shotTeam = false;
    while (Date.now() - t0 < 420000) {
      const h = await st(host), g = await st(guest);
      if (!h || !g || h.done || g.done) break;
      samples++;
      const hs = h.pens.map((p) => p[1]).join(""), gs = g.pens.map((p) => p[1]).join("");
      if (hs !== gs) diffs++;
      const next = h.stops.findIndex((p) => p.st < 2);
      if (Date.now() - lastLog > 5000) { lastLog = Date.now(); log(`t ${h.el}s s ${h.s.toFixed(1)}/${h.hill.top.toFixed(0)} v ${h.v.toFixed(2)} host ${hs} guest ${gs} seller ${h.seller ? (h.seller === g.self ? "guest" : "host") : "-"}`); }
      if (next >= 0) {
        const gap = h.stops[next].s - h.doorS;
        const waiting = h.pens.filter((p) => p[0] === next && p[1] <= 2).length;
        // the host eases off as the door comes up to the stop, and holds it there with steady shoving
        const easing = waiting && gap < 2 + 4 * Math.max(0, h.v) && gap > -6;
        // easing off coming up to the stop, then heaving just well enough to hold it there while the guest sells
        await bot(host, { heave: !easing || h.v < 0.2, late: easing ? 0.11 : 0 });
        if (g.onBus && waiting && Math.abs(gap) < 6) { await key(guest, "KeyS"); await wait(150); check(`team stop ${next + 1}: guest took the door`, await toDoor(guest)); }
        else if (!g.onBus && g.seller !== g.self && waiting && Math.abs(gap) < 6) await toDoor(guest);
        if (!shotTeam && g.seller === g.self && g.pens.some((p) => p[1] === 2)) { shotTeam = true; await wait(800); await shot(guest, "team-02-guest-selling"); await shot(host, "team-02-host-view"); }
      }
      if (!g.onBus && g.seller !== g.self && !h.pens.some((p) => p[1] <= 2 && h.stops[p[0]].st === 1)) { if (await grab(guest)) await bot(guest, { heave: true }); }
      if (!h.onBus && h.mode <= 1) await grab(host);
      sales = h.pens.filter((p) => p[1] === 3).length;
      await wait(150);
    }
    check("host and guest agree on the pensioners", diffs / Math.max(1, samples) < 0.1, `${diffs} of ${samples} samples differed (a state in flight)`);
    log(`sold ${sales}`);
    const rh = await result(host, "host"), rg = await result(guest, "guest");
    check("both get the same result card", !!rh.card && rh.card === rg.card, "");
    log(`silence: ${await silenceNote(A)} / ${await silenceNote(B)}`);
  } else {
    check("took the bus", (await takeBus(A)) === "ok");
    check("in it", await untilJob(A, 60));
    await bot(A, { late: +opt.late });
    await wait(4500);
    const s0 = await st(A);
    log(`hill ${JSON.stringify(s0.hill)} stops ${s0.stops.map((p) => p.s.toFixed(0)).join(", ")} pensioners ${s0.pens.length}`);
    await solo(A, opt.mode === "serve");
    await result(A, "solo");
    log(`silence: ${await silenceNote(A)}`);
  }
} finally {
  if (errors.length) log(`page errors:\n  ${errors.slice(0, 10).join("\n  ")}`);
  check("no page errors", !errors.length, String(errors.length));
  fs.writeFileSync(`${opt.out}/${opt.mode}-report.txt`, report.join("\n") + "\n");
  await browser.close(); server.close();
}
process.exit(checks.every(Boolean) ? 0 : 1);
