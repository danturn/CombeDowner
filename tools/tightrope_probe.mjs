// A check on the Balloon Tightrope (web/src/tightrope.ts) in the real game: the dev server (so the
// probe can reach the challenge's own placing) served to a muted headless Chrome, three tabs in one
// local test room. Where the challenge goes on the map; then a run where both walkers get across
// (a steadying autopilot on each walker, and one on the pilot keeping the span right), which must
// win and leave one of the strange objects; then a run where the second walker keeps letting go:
// each fall costs the team one of its shared lives on every screen and puts the faller back in the
// first basket, and the last one brings the balloons down with a fail card and starts it again from
// scratch. Shots along the way.
//
//   node tools/tightrope_probe.mjs --out rope [--map combe-down] [--zone 9]   (opens the map up to that zone, so the field's in reach)
//
// Writes <out>/report.txt and <out>/*.png; exits 1 if a check fails.
import { createRequire } from "module";
import { spawn } from "child_process";
import fs from "fs";
import { MUTED_ARGS, silenceContext, silenceNote } from "./quiet-guard.mjs";

const WEB = new URL("../web/", import.meta.url).pathname;
const { chromium } = createRequire(WEB + "package.json")("playwright");
const argv = process.argv.slice(2), opt = { out: "rope", map: "combe-down", zone: "9", port: "5191", room: "ROPE" + Math.floor(Math.random() * 1000) };
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) opt[argv[i].slice(2)] = argv[++i];
fs.mkdirSync(opt.out, { recursive: true });

const vite = spawn("npx", ["vite", "--port", opt.port, "--strictPort"], { cwd: WEB, stdio: ["ignore", "pipe", "inherit"] });
await new Promise((r) => vite.stdout.on("data", (b) => { if (String(b).includes("Local")) r(); }));
const base = `http://localhost:${opt.port}`;

const browser = await chromium.launch({
  headless: true, channel: "chrome",
  args: [...MUTED_ARGS, "--disable-renderer-backgrounding", "--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows",
    ...(process.platform === "darwin" ? ["--use-angle=metal", "--enable-gpu"] : ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])],
});
const context = await browser.newContext({ viewport: { width: 960, height: 600 } });
await context.addInitScript(() => { try { localStorage.setItem("cd-mic", "off"); } catch { /* */ } });
await silenceContext(context);
const checks = [], complaints = [];
const check = (name, ok, detail = "") => { checks.push({ name, ok: !!ok, detail }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ": " + detail : ""}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function join(name) {
  const page = await context.newPage();
  page.on("pageerror", (e) => complaints.push(`${name} error: ${e.message}`));
  await page.goto(`${base}/?map=${opt.map}&net=local&room=${opt.room}&time=11:00&fx=0&zone=${opt.zone}`);
  await page.waitForFunction(() => !document.getElementById("play")?.disabled, null, { timeout: 180000 });
  await page.fill("#name", name);
  await page.click("#play");
  await page.waitForFunction(() => window.__game && window.__game() && window.__game().map, null, { timeout: 180000 });
  await page.addStyleTag({ content: "#menu,#pause,#debug,#micask{display:none!important}" });
  await page.evaluate(() => {
    const g = window.__game(), u = g.update.bind(g);
    let rz = 0, th0 = 0;
    g.update = (dt) => {
      g.active = true;
      const job = g.quests.running, pr = job?.progress?.(), p = g.player, me = g.net.selfId;
      p.joy.x = 0; p.joy.y = 0;
      if (pr && pr.ph === "cross" && !window.__hands) {
        const R = Math.min(42, 22 + 4 * (pr.wk.length - 1)), span = R * 0.985 + pr.u[0] + pr.u[1];
        const pi = pr.p.indexOf(me);
        // a pilot keeping the span about right
        if (pi >= 0) p.joy.y = Math.max(-1, Math.min(1, -(span - R * 0.985) * 1.2));
        // a walker steadying themselves and edging on, unless told to let go
        if (pr.wk[pr.n] === me && !pr.f && window.__walk !== "drop") {
          const th = -rz / 0.9, om = (th - th0) / Math.max(1e-3, dt);
          p.joy.x = Math.max(-1, Math.min(1, -(2.6 * th + 0.9 * om)));
          p.joy.y = Math.abs(th) < 0.25 ? -0.9 : 0;
          th0 = th;
        }
      }
      u(dt);
      rz = g.camera.rotation.z;
      const c = window.__cam;
      if (c) { g.camera.position.set(c[0], c[1], c[2]); g.camera.lookAt(c[3], c[4], c[5]); g.camera.updateMatrixWorld(); }
    };
    window.__state = () => {
      const job = g.quests.running, p = g.player;
      return { job: job?.offer.kind ?? "", pr: job?.progress?.() ?? null, done: job?.done ?? null, me: g.net.selfId, host: g.isHost,
        x: p.pos.x, y: p.pos.y, z: p.pos.z, up: p.pos.y - g.map.ground(p.pos.x, p.pos.z), objects: g.oddments.s.o.map((o) => [o[1], o[3]]) };
    };
  });
  return page;
}

async function settle(page) {
  const t0 = Date.now();
  await wait(1500);
  while (Date.now() - t0 < 90000) { if (await page.evaluate(() => (window.__tilesPending ?? 0) === 0)) break; await wait(500); }
  await wait(1000);
}
const state = (p) => p.evaluate(() => window.__state());
async function until(page, secs, f) {
  const t0 = Date.now();
  let s = await state(page);
  while (Date.now() - t0 < secs * 1000 && !f(s)) { await wait(250); s = await state(page); }
  return s;
}

const tabs = opt.only === "place" ? [await join("Ada")] : [await join("Ada"), await join("Bea"), await join("Cyd")];
const report = [];
try {
  await wait(3000);
  const spots = await tabs[0].evaluate(async () => {
    const C = await import("/src/challenges.ts");
    return C.challengesOn(window.__game().map).find((p) => p.c.id === "tightrope")?.spots ?? null;
  });
  check("the tightrope finds a field on this map", !!spots, JSON.stringify(spots));
  if (!spots) throw new Error("no field");
  report.push(`spots: ${JSON.stringify(spots)}`);
  if (opt.only === "place") throw "placed";
  const [board] = spots;
  for (const [k, t] of tabs.entries()) await t.evaluate(([x, z, k]) => window.__game().player.spawn(x + k * 2, z, 0), [board.x, board.z, k]);
  await settle(tabs[0]);

  const run = async (label, drop) => {
    for (const [k, t] of tabs.entries()) await t.evaluate(([x, z, k]) => { window.__walk = ""; window.__cam = null; window.__game().player.spawn(x + k * 2, z, 0); }, [board.x, board.z, k]);
    await wait(1000);
    await tabs[0].evaluate(([b, seed]) => {
      const g = window.__game();
      g.quests.take({ kind: "tightrope", seed, stars: 3, title: "The Balloon Tightrope", blurb: "", reward: "", x: b.x, z: b.z, where: b.name });
    }, [board, 1000 + Math.floor(Math.random() * 1e6)]);
    const up = await until(tabs[0], 60, (s) => s.pr && s.pr.ph !== "gather");
    if (up.pr?.ph === "gather") report.push(`${label} gather: ${JSON.stringify(await Promise.all(tabs.map((t) => state(t).then((s) => [s.x - board.x, s.z - board.z, s.up]))))}`);
    check(`${label}: everyone gathered and the balloons go up`, up.pr?.ph === "rise" || up.pr?.ph === "cross", JSON.stringify(up.pr));
    const roles = up.pr;
    const ss = await Promise.all(tabs.map(state));
    const pilotTab = tabs[ss.findIndex((s) => roles.p.includes(s.me))], walkTabs = roles.wk.map((id) => tabs[ss.findIndex((s) => s.me === id)]);
    report.push(`${label} roles: pilots ${JSON.stringify(roles.p)} walkers ${JSON.stringify(roles.wk)}`);
    await until(pilotTab, 30, (s) => s.pr?.ph === "cross");
    await wait(1500);
    const pil = await state(pilotTab);
    check(`${label}: the pilot is up with the balloon`, pil.up > 50, `${pil.up.toFixed(1)} m over the ground`);
    const w0 = await state(walkTabs[0]);
    check(`${label}: the first walker stands at the rope's end`, w0.up > 50, `${w0.up.toFixed(1)} m up`);
    if (label === "win") {
      // a wide view of the two balloons and the rope, and the walker's own view
      await wait(6000);
      await walkTabs[0].screenshot({ path: `${opt.out}/walker-first-person.png` });
      await walkTabs[1].screenshot({ path: `${opt.out}/spectator-follow-cam.png` });
      await pilotTab.screenshot({ path: `${opt.out}/pilot-basket.png` });
    }
    const first = await until(walkTabs[0], 150, (s) => (s.pr?.c ?? []).includes(roles.wk[0]) || !!s.pr?.f || !!s.done);
    check(`${label}: the first walker gets across`, first.pr?.c?.includes(roles.wk[0]), JSON.stringify(first.pr));
    if (drop) await walkTabs[1].evaluate(() => { window.__walk = "drop"; });
    if (drop) {
      // every fall costs the team a life, the faller goes back to the first basket, and the last one starts it all again
      const most = (await state(tabs[0])).pr?.mx ?? 0;
      check(`${label}: the team starts with its lives`, most === 3, `${most} lives for ${roles.wk.length} walkers`);
      for (let k = 1; k <= most; k++) {
        const off = await until(walkTabs[1], 60, (s) => !!s.pr?.f);
        check(`${label}: fall ${k}: the second walker, letting go, falls`, off.pr?.f === roles.wk[1]);
        const lv = await until(tabs[0], 5, (s) => s.pr?.lv === most - k);
        const all = await Promise.all(tabs.map(state));
        check(`${label}: fall ${k} costs one life, the same on every screen`, all.every((s) => s.pr?.lv === most - k), all.map((s) => s.pr?.lv).join(", "));
        if (k === 1) {
          await wait(1500);
          await tabs[ss.findIndex((s) => s.me === roles.wk[0])].screenshot({ path: `${opt.out}/fall-watched.png` });
          await walkTabs[1].screenshot({ path: `${opt.out}/fall-first-person.png` });
        }
        if (k < most) {
          const back = await until(walkTabs[1], 12, (s) => !s.pr?.f && s.up > 50);
          check(`${label}: after fall ${k} the faller's back in the first basket and on again`, !back.pr?.f && back.up > 50, `${back.up.toFixed(1)} m up, walker ${back.pr?.wk?.[back.pr?.n]}`);
          void lv;
        }
      }
      const fail = await until(tabs[0], 12, (s) => s.pr?.ph === "down");
      const cards = await Promise.all(tabs.map((t) => t.evaluate(() => !!document.querySelector(".msc-end.failed"))));
      check(`${label}: out of lives, the balloons come down with a fail card on every screen`, fail.pr?.ph === "down" && cards.every(Boolean), `phase ${fail.pr?.ph}, cards ${cards.join(",")}`);
      await walkTabs[1].screenshot({ path: `${opt.out}/fail-card.png` });
      for (const t of tabs) await t.evaluate(() => { window.__walk = ""; });
      const again = await until(tabs[0], 40, (s) => s.pr?.ph === "rise" || s.pr?.ph === "cross");
      check(`${label}: then it starts again from scratch with the lives back`, !!again.pr && again.pr.ph !== "gather" && again.pr.wk.length === roles.wk.length && again.pr.lv === most && again.pr.c.length === 0 && !again.done, JSON.stringify(again.pr));
      if (again.pr?.ph === "gather") report.push(`${label} regather: ${JSON.stringify(await Promise.all(tabs.map((t) => t.evaluate(() => { const g = window.__game(), j = g.quests.running; return { card: j?.card().progress, alive: g.alive, me: g.net.selfId, players: g.questWorld ? null : null, x: g.player.pos.x, z: g.player.pos.z }; }))))}`);
      await tabs[0].evaluate(() => window.__game().quests.callOff());
      report.push(`${label} restarted: ${JSON.stringify(again.pr)}`);
    } else {
      const before = (await state(tabs[0])).objects.length;
      const end = await until(tabs[0], 200, (s) => !!s.done);
      check(`${label}: everyone across wins`, end.done?.won === true, JSON.stringify(end.done));
      await wait(3000);
      const after = await state(tabs[0]);
      check(`${label}: winning leaves one of the strange objects`, after.objects.length === before + 1, `${before} -> ${after.objects.length}, ${JSON.stringify(after.objects.slice(-1))} done at ${end.done?.x?.toFixed?.(1)},${end.done?.z?.toFixed?.(1)}`);
    }
    await until(tabs[0], 15, (s) => !s.job);
    await wait(2000);
  };
  await run("win", false);
  await run("fall", true);
} catch (e) {
  if (e !== "placed") complaints.push(String(e?.stack ?? e));
} finally {
  for (const t of tabs) report.push(await silenceNote(t).catch((e) => `audio: no report (${e.message})`));
  const out = [...checks.map((c) => `${c.ok ? "PASS" : "FAIL"} ${c.name}${c.detail ? ": " + c.detail : ""}`), "", ...report, "", ...complaints].join("\n");
  fs.writeFileSync(`${opt.out}/report.txt`, out + "\n");
  console.log(complaints.join("\n"));
  console.log(report.filter((l) => l.startsWith("audio")).join("\n"));
  await browser.close();
  vite.kill();
  process.exit(checks.every((c) => c.ok) && checks.length && !complaints.length ? 0 : 1);
}
