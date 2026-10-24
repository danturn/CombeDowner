// A check on The Climb (web/src/theclimb.ts) in the real game: a built game (web/dist) served to
// a muted headless Chrome (as tools/shoot.mjs does), two tabs in a local test room (?net=local).
// The challenge is taken straight off a poster (no sockets needed), then:
// - where the face is on the map, and its holds and ledges;
// - grabbing a hold, climbing hold to hold to the first ledge, and the grip draining;
// - a boost: one crouches on a ledge, the other stands on their shoulders and takes a hold out of reach alone;
// - a pull-up: one on a ledge hauls the other up onto it;
// - a big fall knocks one out, the other picks them up and carries them to the team's ledge, and they're back;
// - both at the top together wins it.
// Shots of each step.
//
//   cd web && npx vite build --logLevel error && cd .. && node tools/climb_team_probe.mjs --map combe-down --out climbteam
//   node tools/climb_team_probe.mjs --map cape-town --survey 1     (just where the face is)
//
// Writes <out>/report.txt and <out>/*.png; exits 1 if a check fails.
import { createRequire } from "module";
import fs from "fs";
import http from "http";
import path from "path";
import { MUTED_ARGS, silenceContext, silenceNote } from "./quiet-guard.mjs";

const WEB = new URL("../web/", import.meta.url).pathname;
const { chromium } = (() => {
  if (process.env.PW) return createRequire(import.meta.url)(process.env.PW);
  try { return createRequire(WEB + "package.json")("playwright"); } catch { return createRequire(import.meta.url)("playwright"); }
})();

const argv = process.argv.slice(2), opt = { dist: WEB + "dist", out: "climbteam", map: "combe-down", room: "CLIMBTEAM" + Math.floor(Math.random() * 1000) };
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
const exe = process.env.CHROME || (linux && fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : null);
const browser = await chromium.launch({
  headless: true,
  ...(exe ? { executablePath: exe } : { channel: "chrome" }),
  args: [...MUTED_ARGS, "--disable-renderer-backgrounding", "--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows",
    ...(linux ? ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
      : process.platform === "darwin" ? ["--use-angle=metal", "--enable-gpu"] : [])],
});
const context = await browser.newContext({ viewport: { width: 1100, height: 700 } });
await context.addInitScript(() => { try { localStorage.setItem("cd-mic", "off"); } catch { /* */ } });
if (opt.stacks) await context.addInitScript(() => { const e = console.error; console.error = (...a) => e(...a, new Error().stack); });
await silenceContext(context);
const complaints = [], checks = [];
const check = (name, ok, detail = "") => { checks.push({ name, ok: !!ok, detail }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ": " + detail : ""}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function join(name) {
  const page = await context.newPage();
  page.on("pageerror", (e) => complaints.push(`${name} error: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") complaints.push(`${name} console: ${m.text()}`); });
  await page.goto(`http://127.0.0.1:${port}/?map=${opt.map}&net=local&room=${opt.room}&time=11:00&fx=0`);
  await page.evaluate(() => { window.__budget = 40; });
  await page.waitForFunction(() => !document.getElementById("play")?.disabled, null, { timeout: 180000 });
  await page.fill("#name", name);
  await page.click("#play");
  await page.waitForFunction(() => window.__game && window.__game() && window.__game().map, null, { timeout: 180000 });
  await page.addStyleTag({ content: "#menu,#pause,#debug,#touch,#micask,#scoreboard{display:none!important}" });
  await page.evaluate(() => {
    const g = window.__game(), u = g.update.bind(g);
    g.update = (dt) => {
      g.active = true;
      const p = window.__park;
      if (p) { g.player.pos.set(p[0], p[1], p[2]); g.player.vel.set(0, 0, 0); }
      if (window.__auto) window.__auto(g.player, dt);
      u(dt);
      const c = window.__cam;
      if (c) { g.camera.position.set(c[0], c[1], c[2]); g.camera.lookAt(c[3], c[4], c[5]); g.camera.updateMatrixWorld(); }
      if (g.weapon) g.weapon.scene.visible = !c;
    };
    window.__key = (code, down) => dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { code }));
    window.__job = () => g.quests.job;
    window.__pr = () => g.quests.job?.probe;
    /** Where you are on the face: along it (s), out from it, feet height, and what the climb has you doing. */
    window.__me = () => {
      const p = g.player, pr = window.__pr();
      if (!pr) return null;
      const [s, out] = pr.local(p.pos.x, p.pos.z);
      return { s, out, y: p.pos.y, g: p.onGround, mode: pr.mode(), grip: pr.grip(), cap: pr.cap(), L: pr.L(), cp: pr.cp(), status: pr.status(), ropes: pr.ropes(), carrying: pr.carrying(), crouch: p.crouch, prone: p.prone, hint: g.quests.hint() };
    };
    /** Stand at (s, out) on the face at height y (on whatever's there), facing the face. */
    window.__stand = (s, out, y) => {
      const p = g.player, pr = window.__pr(), f = pr.face, [x, z] = pr.P(s, out);
      window.__park = null; window.__auto = null; p.keys.clear(); p.cling && (p.vel.set(0, 0, 0));
      p.pos.set(x, y, z); p.vel.set(0, 0, 0); p.onGround = true;
      p.pos.y = g.map.floor(x, z, y + 0.3);
      p.yaw = Math.atan2(f.nx, f.nz); p.pitch = 0.3;
    };
    window.__look = (s, out, y, ts, tout, ty) => { const pr = window.__pr(), [a, b] = pr.P(s, out), [c, d] = pr.P(ts, tout); window.__cam = [a, y, b, c, ty, d]; };
  });
  return page;
}

async function settle(page) {
  const t0 = Date.now();
  await wait(1500);
  while (Date.now() - t0 < 90000) {
    if (await page.evaluate(() => (window.__tilesPending ?? 0) === 0)) break;
    await wait(500);
  }
  await wait(1000);
}
const key = (page, code, down) => page.evaluate(([c, d]) => window.__key(c, d), [code, down]);
const tap = async (page, code, ms = 90) => { await key(page, code, true); await wait(ms); await key(page, code, false); };
const me = (page) => page.evaluate(() => window.__me());
const shot = (page, name) => page.screenshot({ path: `${opt.out}/${name}.png` });
async function until(page, secs, f) {
  const t0 = Date.now();
  let s = await me(page);
  while (Date.now() - t0 < secs * 1000 && !f(s)) { await wait(60); s = await me(page); }
  return s;
}
const use = (page) => page.evaluate(() => { window.__game().useKey = true; });

const A = await join("Ada");
const B = opt.survey || opt.views ? null : await join("Bo");
const report = [];
try {
  await wait(2000);
  // ---- take it ----
  if (opt.notake) { await wait(8000); throw new Error("survey only"); }
  await A.evaluate(() => {
    const g = window.__game();
    g.quests.take({ kind: "climb", seed: 4242, stars: 3, title: "The Climb", blurb: "", reward: "", x: 0, z: 0, where: "" });
  });
  await wait(500);
  const face = await A.evaluate(() => { const pr = window.__pr(); if (!pr) return null; const f = pr.face, r = pr.route(); return { ...f, ledges: r.ledges, holds: r.holds.length, boosts: r.holds.filter((h) => h.boost).length, n: r.n }; });
  check("the challenge starts with a face on this map", !!face, face ? `${face.crag ? "crag" : "building"} "${face.name}" at data (${face.ox.toFixed(0)}, ${(-face.oz).toFixed(0)}), ${(face.top - face.y0).toFixed(1)} m from plinth to top, ${face.ledges.length - 2} ledges between, ${face.holds} holds for ${face.n}` : "");
  if (face) report.push(`face: ${JSON.stringify({ ...face, ledges: face.ledges.map((l) => [l.y.toFixed(1), l.s0.toFixed(1), l.s1.toFixed(1)]) })}`);
  if (!face || opt.survey) throw new Error("survey only");
  const pr = await A.evaluate(() => { const f = window.__pr().face; return [f.ox, f.oz]; });
  await A.evaluate(([x, z]) => { window.__park = [x, 200, z]; }, pr);
  await settle(A);
  if (opt.views) {
    // just looking: [s, out, height above the plinth] to [s, out, height]
    const cams = { front: [[0, 13, 6], [0, 0, 12]], side: [[-9, 10, 4], [0, 0, 12]], high: [[5, 12, face.top - face.y0 + 4], [0, 0, 10]], up: [[0, 5, 1.6], [0, 0, 14]] };
    for (const [name, [c, t]] of Object.entries(cams)) {
      await A.evaluate(([c, t, y0]) => window.__look(c[0], c[1], y0 + c[2], t[0], t[1], y0 + t[2]), [c, t, face.y0]);
      await wait(800);
      await shot(A, `view-${name}`);
    }
    throw new Error("survey only");
  }

  await B.evaluate(([x, z]) => { window.__park = [x, 200, z]; }, pr);
  await settle(B);
  const fB = await B.evaluate(() => !!window.__pr());
  check("the second player has the climb too", fB);
  // the route set for two
  await wait(1500);
  const nA = await A.evaluate(() => window.__pr().route().n), nB = await B.evaluate(() => window.__pr().route().n);
  check("both set for the same number of climbers", nA === nB && nA === 2, `${nA} and ${nB}`);
  const route = await A.evaluate(() => { const r = window.__pr().route(); return { ledges: r.ledges, holds: r.holds }; });

  // ---- wide shot of the face ----
  await A.evaluate(() => window.__stand(0, 10, 300));
  await A.evaluate(([t, y0]) => window.__look(-5, 13, y0 + 5, 0, 0, (t + y0) / 2), [face.top, face.y0]);
  await wait(1200);
  await shot(A, "01-face");
  await A.evaluate(() => { window.__cam = null; });

  // ---- grab and climb to ledge 1 (autopilot on the route) ----
  const L0 = route.ledges[0], L1 = route.ledges[1];
  const first = route.holds.find((h) => h.y > L0.y && h.y < L0.y + 2.4);
  let s, sb;
  if (!first) report.push("no hold within reach of the plinth: it starts with a boost");
  else {
    await A.evaluate(([s, y]) => window.__stand(s, 0.9, y), [first.s, L0.y]);
    await wait(400);
    await key(A, "KeyW", true); await wait(300); await key(A, "KeyW", false);
    s = await until(A, 2, (m) => m.mode === 1);
    check("walking into the face takes a hold", s.mode === 1, `mode ${s.mode}, hint "${s.hint}"`);
    // climb by asking for up, steering at the next hold up the route, until on ledge 1
    await A.evaluate(([goal]) => {
      const g = window.__game();
      window.__auto = (p) => {
        const m = window.__me();
        p.keys.clear();
        if (!m || m.mode !== 1) return;
        const r = window.__pr().route();
        const hands = m.y + 2;
        const lip = r.ledges[goal];
        if (lip.y - hands < 2.1 && m.s >= lip.s0 - 0.3 && m.s <= lip.s1 + 0.3) { p.keys.add("KeyW"); return; }
        const next = r.holds.filter((h) => h.y > hands + 0.3 && Math.hypot(h.s - m.s, h.y - hands) < 2.2).sort((a, b) => b.y - a.y)[0];
        if (!next) { const want = (lip.s0 + lip.s1) / 2; p.keys.add(want > m.s ? "KeyD" : "KeyA"); return; }
        p.keys.add("KeyW");
        if (next.s > m.s + 0.6) p.keys.add("KeyD");
        if (next.s < m.s - 0.6) p.keys.add("KeyA");
        void g;
      };
    }, [1]);
    const g0 = s.grip;
    s = await until(A, 25, (m) => m.mode === 0 && m.g && m.L >= 1);
    await A.evaluate(() => { window.__auto = null; window.__game().player.keys.clear(); });
    check("climbing hold to hold reaches the first ledge", s.L >= 1, `L ${s.L}, at y ${s.y.toFixed(1)} (ledge ${L1.y.toFixed(1)})`);
    report.push(`grip from ${g0.toFixed(2)} down to ${s.grip.toFixed(2)} on the way up`);
    await A.evaluate(([y]) => window.__look(-5, 9, y + 3, 0, 0, y), [L1.y]);
    await wait(600);
    await shot(A, "02-on-ledge-1");
    await A.evaluate(() => { window.__cam = null; });
    s = await until(A, 4, (m) => m.cp >= 1);
    check("the host marks the team's ledge", s.cp >= 1, `cp ${s.cp}`);

    // ---- a shot of the two of them on the face: B on its way up, A waiting on the ledge ----
    const auto = (goal) => {
      window.__auto = (p) => {
        const m = window.__me();
        p.keys.clear();
        if (!m || m.mode !== 1) return;
        const r = window.__pr().route(), hands = m.y + 2, lip = r.ledges[goal];
        if (lip.y - hands < 2.1 && m.s >= lip.s0 - 0.3 && m.s <= lip.s1 + 0.3) { p.keys.add("KeyW"); return; }
        const next = r.holds.filter((h) => h.y > hands + 0.3 && Math.hypot(h.s - m.s, h.y - hands) < 2.2).sort((a, b) => b.y - a.y)[0];
        if (!next) { const want = (lip.s0 + lip.s1) / 2; p.keys.add(want > m.s ? "KeyD" : "KeyA"); return; }
        p.keys.add("KeyW");
        if (next.s > m.s + 0.6) p.keys.add("KeyD");
        if (next.s < m.s - 0.6) p.keys.add("KeyA");
      };
    };
    await B.evaluate(([s, y]) => window.__stand(s, 0.9, y), [first.s, L0.y]);
    await wait(300);
    await key(B, "KeyW", true); await wait(300); await key(B, "KeyW", false);
    await until(B, 2, (m) => m.mode === 1);
    await B.evaluate(auto, 1);
    await until(B, 6, (m) => m.y > L0.y + 3.5);
    await B.evaluate(() => { window.__auto = null; window.__game().player.keys.clear(); });
    await A.evaluate(([s, y]) => window.__stand(s, 1.2, y), [(L1.s0 + L1.s1) / 2, L1.y]);
    await wait(200);
    const bm = await me(B);
    await A.evaluate(([s, y]) => window.__look(s - 4, 11, y + 2, s, 0, y + 1.5), [bm.s, bm.y]);
    await wait(500);
    await shot(A, "00-on-the-face");
    await A.evaluate(() => { window.__cam = null; });
    await tap(B, "KeyC");
    await wait(1500);

    // ---- pull-up: A on ledge 1 at its lip hauls B up from below ----
    const ls = (L1.s0 + L1.s1) / 2;
    await A.evaluate(([s, y]) => window.__stand(s, 1.3, y), [ls, L1.y]);
    await B.evaluate(([s, y]) => { window.__stand(s, 2.2, y); }, [ls, L1.y - 3.2]);
    await B.evaluate(([s, y]) => { window.__park = [...window.__pr().P(s, 2.2)].length ? (() => { const [x, z] = window.__pr().P(s, 2.2); return [x, y, z]; })() : null; }, [ls, L1.y - 3.2]);
    await wait(1200);
    s = await me(A);
    check("the one on the ledge is offered to pull the other up", /Pull Bo up/.test(s.hint), `hint "${s.hint}"`);
    await B.evaluate(() => { window.__park = null; });
    await use(A);
    sb = await until(B, 4, (m) => m.L >= 1 && m.mode === 0);
    check("a pull-up hauls the mate onto the ledge", sb.L >= 1 && Math.abs(sb.y - L1.y) < 0.4, `B at y ${sb.y.toFixed(2)}, L ${sb.L}`);
    await A.evaluate(([y]) => window.__look(-4, 8, y + 2, 0, 0, y), [L1.y]);
    await wait(300);
    await shot(A, "03-pulled-up");
    await A.evaluate(() => { window.__cam = null; });
  }

  // ---- boost on ledge k with a boost hold ----
  const bh = route.holds.find((h) => h.boost);
  if (bh) {
    const k = route.ledges.findIndex((l, i) => i < route.ledges.length - 1 && l.y < bh.y && route.ledges[i + 1].y > bh.y);
    const Lk = route.ledges[k];
    // alone it's out of reach
    await A.evaluate(([s, y]) => window.__stand(s, 0.7, y), [bh.s, Lk.y]);
    await B.evaluate(([s, y]) => window.__stand(s, 3, y), [bh.s + 2, Lk.y]);
    await wait(400);
    s = await me(A);
    report.push(`at the boost gap A's hint: "${s.hint}"`);
    await key(A, "KeyW", true); await A.evaluate(() => window.__game().player.jump()); await wait(700); await key(A, "KeyW", false);
    s = await until(A, 1.5, (m) => m.mode === 1);
    check("the boost hold is out of reach alone", s.mode !== 1, `mode ${s.mode}`);
    await wait(800);
    // B crouches under it, A stands on B's shoulders and jumps for it
    await B.evaluate(([s, y]) => window.__stand(s, 0.7, y), [bh.s, Lk.y]);
    await key(B, "KeyC", true);
    await wait(900);
    await A.evaluate(([s, y]) => { window.__stand(s, 0.7, y + 1.0); }, [bh.s, Lk.y]);
    await wait(500);
    s = await me(A);
    check("standing on a crouched mate's shoulders", s.g && Math.abs(s.y - (Lk.y + 1.0)) < 0.25, `A's feet ${(s.y - Lk.y).toFixed(2)} m above the ledge`);
    await A.evaluate(([y]) => window.__look(-4, 6, y + 2.5, 0, 0.5, y + 2), [Lk.y]);
    await wait(300);
    await shot(A, "04-boost");
    await A.evaluate(() => { window.__cam = null; window.__stand; });
    await key(A, "KeyW", true); await A.evaluate(() => window.__game().player.jump()); await wait(700); await key(A, "KeyW", false);
    s = await until(A, 1.5, (m) => m.mode === 1 || m.L > k);
    check("off a mate's shoulders the boost hold is in reach", s.mode === 1 || s.L > k, `mode ${s.mode}, hands at ${(s.y + 2 - Lk.y).toFixed(2)}`);
    await key(B, "KeyC", false);
    await tap(A, "KeyC");
    await wait(1500);
  } else check("there's a boost hold for two", false);

  // ---- knock-out and carry ----
  const Lk = route.ledges[1];
  // drop B from high above ledge 0's ground in front
  await B.evaluate(([y]) => { window.__stand(0, 5, y); const p = window.__game().player; p.pos.y = y; p.onGround = false; }, [route.ledges[0].y + 14]);
  sb = await until(B, 5, (m) => m.status.some(([id, st]) => st.st === "ko"));
  check("a big fall knocks you out", sb.status.some(([, st]) => st.st === "ko") && sb.mode === 4, `B mode ${sb.mode}, prone ${sb.prone.toFixed(2)}`);
  await A.evaluate(([y]) => window.__look(-3, 9, y + 2, 0, 5, y), [route.ledges[0].y]);
  await wait(600);
  await shot(A, "05-knocked-out");
  await A.evaluate(() => { window.__cam = null; });
  // A comes down and picks B up
  const bpos = await B.evaluate(() => window.__me());
  await A.evaluate(([s, out, y]) => window.__stand(s + 0.8, out, y), [bpos.s, bpos.out, bpos.y]);
  await wait(800);
  s = await me(A);
  check("a mate beside you can be picked up", /Pick Bo up/.test(s.hint), `hint "${s.hint}"`);
  await use(A);
  sb = await until(B, 3, (m) => m.mode === 5);
  check("picked up and carried", sb.mode === 5, `B mode ${sb.mode}`);
  // carry up to the team's ledge: stand A there
  const cpNow = (await me(A)).cp, Lc = route.ledges[cpNow];
  report.push(`the team's ledge when carrying: ${cpNow}`);
  await A.evaluate(([s, y]) => window.__stand(s, 0.8, y), [(Lc.s0 + Lc.s1) / 2, Lc.y]);
  await A.evaluate(([y]) => window.__look(-4, 8, y + 2.5, 0, 0, y + 1), [Lc.y]);
  await wait(400);
  await shot(A, "06-carried-up");
  await A.evaluate(() => { window.__cam = null; });
  sb = await until(B, 5, (m) => m.mode === 0 && !m.status.length);
  check("carried up to the team's ledge, they're back on their feet", sb.mode === 0 && !sb.status.length && Math.abs(sb.y - Lc.y) < 0.5, `B mode ${sb.mode}, y ${sb.y.toFixed(1)} (ledge ${Lc.y.toFixed(1)})`);

  // ---- out: a ghost, till a rope from a new ledge brings them back ----
  await B.evaluate(([y]) => { window.__stand(0, 5, y); const p = window.__game().player; p.pos.y = y; p.onGround = false; }, [route.ledges[0].y + 14]);
  sb = await until(B, 5, (m) => m.mode === 4);
  await wait(500);
  await A.evaluate(() => window.__pr().hurry()); await B.evaluate(() => window.__pr().hurry());
  sb = await until(B, 5, (m) => m.mode === 6);
  check("not carried up in time, you're out: a ghost", sb.mode === 6, `B mode ${sb.mode}, hint "${sb.hint}"`);
  await B.evaluate(([y]) => window.__look(3, 10, y + 4, 0, 0, y + 3), [route.ledges[0].y]);
  await wait(300);
  await shot(B, "06b-ghost");
  await B.evaluate(() => { window.__cam = null; });

  // ---- a rope ----
  await A.evaluate(([s, y]) => window.__stand(s, 1.0, y), [route.ledges[1].rope, Lk.y]);
  await wait(400);
  s = await me(A);
  check("on a ledge you can drop a rope", /Drop a rope/.test(s.hint), `hint "${s.hint}"`);
  await use(A);
  sb = await until(B, 3, (m) => m.ropes.includes(1));
  check("the rope's down for everyone", sb.ropes.includes(1));
  sb = await until(B, 3, (m) => m.mode === 0 && !m.status.length);
  check("a rope dropped brings the ghost back in, on that ledge", sb.mode === 0 && Math.abs(sb.y - Lk.y) < 0.5, `B mode ${sb.mode}, y ${sb.y.toFixed(1)}`);
  // climbing the rope: B goes back down to the foot and up it
  const R1 = route.ledges[1];
  await B.evaluate(([s, y]) => window.__stand(s, 1.5, y), [R1.rope, route.ledges[0].y]);
  await wait(300);
  await key(B, "KeyW", true);
  sb = await until(B, 2, (m) => m.mode === 2);
  check("walking into a rope takes it", sb.mode === 2, `B mode ${sb.mode}`);
  sb = await until(B, 12, (m) => m.mode === 0 && m.g && Math.abs(m.y - R1.y) < 0.4);
  await key(B, "KeyW", false);
  check("up the rope and onto its ledge", Math.abs(sb.y - R1.y) < 0.4, `B at ${sb.y.toFixed(1)} (ledge ${R1.y.toFixed(1)})`);

  // ---- everyone down: back to the bottom ----
  for (const P of [A, B]) await P.evaluate(([y]) => { window.__stand(1, 5, y); const p = window.__game().player; p.pos.y = y; p.onGround = false; }, [route.ledges[0].y + 14]);
  sb = await until(B, 8, (m) => m.ropes.length === 0 && m.mode === 0 && m.L === 0);
  check("everyone down sends the team back to the bottom", sb.ropes.length === 0 && sb.mode === 0 && sb.L === 0 && sb.y < route.ledges[0].y + 1, `B mode ${sb.mode}, L ${sb.L}, ropes ${sb.ropes}, y ${sb.y.toFixed(1)}`);
  await wait(1000);

  // ---- both at the top ----
  const top = route.ledges[route.ledges.length - 1], S = route.ledges.length - 1;
  const below = route.ledges[S - 1];
  await A.evaluate(([s, y]) => window.__stand(s, 1.0, y), [(below.s0 + below.s1) / 2, below.y]);
  await B.evaluate(([s, y]) => window.__stand(s, 1.0, y), [(below.s0 + below.s1) / 2 + 1, below.y]);
  await wait(800);
  // nobody's on top to pull: from just under the top, grab its lip from mid-air
  await A.evaluate(([s, y]) => { window.__stand(s, 2.0, y - 2.6); window.__park = (() => { const [x, z] = window.__pr().P(s, 2.0); return [x, y - 2.6, z]; })(); }, [0, top.y]);
  await B.evaluate(([s, y]) => { window.__stand(s, 2.0, y - 2.6); window.__park = (() => { const [x, z] = window.__pr().P(s, 2.0); return [x, y - 2.6, z]; })(); }, [1.2, top.y]);
  await wait(400);
  // nobody's on top to pull: grab the lip from mid-air instead
  for (const P of [A, B]) {
    const pre = await me(P);
    await use(P);
    await wait(250);
    await P.evaluate(() => { window.__park = null; });
    await wait(100);
    const post = await me(P);
    report.push(`top grab: before y ${pre.y.toFixed(1)} hint "${pre.hint}" grip ${pre.grip.toFixed(2)} mode ${pre.mode}; after mode ${post.mode} y ${post.y.toFixed(1)}`);
    await key(P, "KeyW", true); await wait(900); await key(P, "KeyW", false);
  }
  const sa = await until(A, 4, (m) => m.L === S);
  sb = await until(B, 4, (m) => m.L === S);
  check("both on top", sa.L === S && sb.L === S, `A L ${sa.L} y ${sa.y.toFixed(1)}, B L ${sb.L} y ${sb.y.toFixed(1)}, top ${top.y.toFixed(1)}`);
  await A.evaluate(([y]) => window.__look(-6, 6, y + 3, 0, -1, y + 0.5), [top.y]);
  await wait(300);
  await shot(A, "07-top");
  const cl = await A.evaluate(() => window.__pr().climbers().length);
  check("both count as climbers, having taken holds", cl === 2, `${cl} climbers`);
  const done = await A.waitForFunction(() => window.__game().quests.job?.done?.won, null, { timeout: 8000 }).then(() => true).catch(() => false);
  check("the whole team on top together wins it", done);
  await wait(2500);
  const odd = await A.evaluate(() => window.__game().oddments.s.o.length);
  check("winning brings one of the strange objects", odd >= 1, `${odd} on the map`);
  await A.evaluate(() => { window.__cam = null; });
} catch (e) {
  if (e.message !== "survey only") { check("probe ran", false, e.stack); }
}
fs.writeFileSync(`${opt.out}/report.txt`, [...checks.map((c) => `${c.ok ? "PASS" : "FAIL"} ${c.name}${c.detail ? ": " + c.detail : ""}`), ...report, "", ...new Set(complaints)].join("\n"));
for (const r of report) console.log(r);
for (const c of new Set(complaints)) console.log("complaint:", c);
console.log(await silenceNote(A));
await browser.close();
server.close();
process.exit(checks.every((c) => c.ok) ? 0 : 1);
