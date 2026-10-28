// A check on the Art Gallery (web/src/gallery.ts) in the real game: the dev server served to a
// muted, silenced headless Chrome. Where the gallery goes on the map; what the critics say about a
// set of made-up paintings of every kind (critics.ts, no game needed); a solo round where a painter
// paints with the mouse on the easel itself (fill, rectangles, ellipse, brush, spray, pencil), the
// show with the crowd and their speech bubbles, the verdict and the strange object; and a round in
// two tabs of one ?net=local room, with both paintings going across. Shots along the way.
//
// The ending is checked too: the verdict card stays up until it's put away, you can stay and look
// round after it, and leaving (or the gallery closing) puts you back on the pavement facing the door.
//
//   node tools/gallery_probe.mjs --out gallery [--map combe-down] [--only solo|duo|critics] [--time 22:30] [--eye slow|block]
//
// --eye tries the critics' eye (eye.ts) the hard way in the solo round: slow throttles the host's
// connection once the game's loaded, so the model is still downloading when the paintings are
// hung; block stops it downloading at all. Either way the show must go on without it.
//
// Writes <out>/report.txt and <out>/*.png; exits 1 if a check fails.
import { createRequire } from "module";
import { spawn } from "child_process";
import fs from "fs";
import { MUTED_ARGS, silence, silenceContext, silenceNote } from "./quiet-guard.mjs";

const WEB = new URL("../web/", import.meta.url).pathname;
const { chromium } = createRequire(WEB + "package.json")("playwright");
const argv = process.argv.slice(2), opt = { out: "gallery", map: "combe-down", port: "5193", only: "", time: "11:00", eye: "" };
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
const checks = [], complaints = [], report = [];
const check = (name, ok, detail = "") => { checks.push({ name, ok: !!ok, detail }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ": " + detail : ""}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const pages = [];

async function newContext() {
  const context = await browser.newContext({ viewport: { width: 1100, height: 700 } });
  await context.addInitScript(() => { try { localStorage.setItem("cd-mic", "off"); } catch { /* */ } });
  await silenceContext(context);
  return context;
}

async function join(context, name, room) {
  const page = await context.newPage();
  await silence(page);
  pages.push([name, page]);
  page.on("pageerror", (e) => complaints.push(`${name} error: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && /gallery|easel|critic/i.test(m.text())) complaints.push(`${name} console: ${m.text()}`); });
  await page.goto(`${base}/?map=${opt.map}&net=local&room=${room}&time=${opt.time}&fx=0&objects=0&zone=5&paint=30`);
  await page.waitForFunction(() => !document.getElementById("play")?.disabled, null, { timeout: 180000 });
  await page.fill("#name", name);
  await page.click("#play");
  await page.waitForFunction(() => window.__game && window.__game() && window.__game().map, null, { timeout: 180000 });
  await page.addStyleTag({ content: "#menu,#pause,#debug,#micask,#clickhint,#chronicle,#scoreboard{display:none!important}" });
  await page.evaluate(() => {
    const g = window.__game(), u = g.update.bind(g);
    g.update = (dt) => {
      g.active = true;
      u(dt);
      const c = window.__cam;
      if (c) { g.camera.position.set(c[0], c[1], c[2]); g.camera.lookAt(c[3], c[4], c[5]); g.camera.updateMatrixWorld(); }
    };
    window.__state = () => {
      const job = g.quests.running, p = g.player, G = window.__gallery;
      return { job: job?.offer.kind ?? "", done: job?.done ?? null, me: g.net.selfId, host: g.isHost, x: p.pos.x, y: p.pos.y, z: p.pos.z,
        phase: G?.phase?.() ?? "", works: G?.works?.() ?? 0, aboard: G?.aboard?.() ?? false, objects: g.oddments.s.o.length,
        easel: !!document.getElementById("easel"), card: !!document.getElementById("gallerycard"), yaw: p.yaw,
        ground: g.map.ground(p.pos.x, p.pos.z), hint: G && job && !job.done ? G.hint() : "", line: G && job && !job.done ? G.card().line + " | " + (G.card().sub ?? "") : "" };
    };
  });
  return page;
}
const state = (p) => p.evaluate(() => window.__state());
async function until(page, secs, f) {
  const t0 = Date.now();
  let s = await state(page);
  while (Date.now() - t0 < secs * 1000 && !f(s)) { await wait(300); s = await state(page); }
  return s;
}
async function settle(page) {
  const t0 = Date.now();
  await wait(1500);
  while (Date.now() - t0 < 90000) { if (await page.evaluate(() => (window.__tilesPending ?? 0) === 0)) break; await wait(500); }
  await wait(800);
}

/** Paint a sunny scene with the mouse, through the easel's own buttons. */
async function paintByHand(page) {
  const box = await page.locator("#easel canvas.art").boundingBox();
  const at = (x, y) => [box.x + (x / 240) * box.width, box.y + (y / 180) * box.height];
  const tool = (t) => page.click(`#easel button[data-t="${t}"]`);
  const colour = (c) => page.click(`#easel .pal button[data-c="${c}"]`);
  const drag = async (pts) => {
    const [x0, y0] = at(pts[0], pts[1]);
    await page.mouse.move(x0, y0); await page.mouse.down();
    for (let i = 2; i < pts.length; i += 2) { const [x, y] = at(pts[i], pts[i + 1]); await page.mouse.move(x, y, { steps: 6 }); }
    await page.mouse.up();
  };
  // sky, grass, the sun, a stone house with a red door, a tree, clouds, a gull
  await tool("rect"); await page.click('#easel button[data-m="solid"]');
  await colour(11); await drag([0, 0, 239, 110]);
  await colour(10); await drag([0, 111, 239, 179]);
  await tool("ellipse"); await colour(6); await drag([180, 12, 220, 50]);
  await tool("rect"); await colour(7); await drag([40, 70, 110, 130]);
  await colour(4); await drag([66, 104, 82, 130]);
  await colour(13); await drag([48, 80, 62, 94]); await drag([88, 80, 102, 94]);
  await tool("line"); await colour(8); await drag([36, 70, 75, 42]); await drag([75, 42, 114, 70]);
  await tool("brush"); await page.click('#easel button[data-s="6"]'); await colour(8); await drag([160, 150, 162, 100]);
  await colour(9); await drag([150, 95, 175, 92, 168, 80, 152, 86, 160, 100]);
  await tool("fill"); await colour(9); await page.mouse.click(...at(162, 90));
  await tool("spray"); await colour(3);
  for (const [x, y] of [[40, 25], [60, 20], [120, 30]]) { const [px, py] = at(x, y); await page.mouse.move(px, py); await page.mouse.down(); await wait(500); await page.mouse.move(px + 30, py + 4, { steps: 8 }); await page.mouse.up(); }
  await tool("pencil"); await colour(1); await drag([130, 50, 136, 46, 142, 50, 148, 46, 154, 50]);
}

async function cameraOn(page, which) {
  const G = await page.evaluate(() => ({ top: window.__gallery.top, C: window.__gallery.C, n: window.__gallery.painters().length }));
  const y = G.top + 1.75;
  if (which === "wall") await page.evaluate(([c]) => { window.__cam = c; }, [[G.C.x + 1.5, y + 0.6, G.C.z + 3.2, G.C.x - 0.5, y - 0.1, G.C.z - 6.5]]);
  else if (which === "door") await page.evaluate(([c]) => { window.__cam = c; }, [[G.C.x + 4, y + 0.3, G.C.z + 1.5, G.C.x + 10.3, y - 0.5, G.C.z - 2.2]]);
  else await page.evaluate(([c]) => { window.__cam = c; }, [[G.C.x + 9.5, y + 2.6, G.C.z + 5.5, G.C.x - 3, y - 0.6, G.C.z - 3]]);
}

async function takeAndEnter(tabs, spots, seed) {
  const [door] = spots;
  for (const [k, t] of tabs.entries()) await t.evaluate(([x, z, k]) => window.__game().player.spawn(x + k * 1.2, z + 0.8, 0), [door.x, door.z, k]);
  await settle(tabs[0]);
  await tabs[0].evaluate(([b, seed]) => {
    window.__game().quests.take({ kind: "gallery", seed, stars: 2, title: "The Art Gallery", blurb: "", reward: "", x: b.x, z: b.z, where: b.name });
  }, [door, seed]);
  for (const t of tabs) await until(t, 15, (s) => s.job === "gallery");
  const taker = await until(tabs[0], 5, (s) => s.aboard);
  check("one E: taking it on by the curator goes straight into the gallery", taker.aboard, JSON.stringify(taker));
  // everyone else goes in with E by the curator
  for (const t of tabs.slice(1)) await t.evaluate(() => window.__gallery.start());
}

function remarkLines(show, names) {
  return show.remarks.map((r) => `  [${r.at.toFixed(1)}s] ${r.name} on ${names[r.p]}'s: "${r.text}" ${r.mark}/10`);
}

try {
  // ---- what the critics make of paintings of every kind, straight from critics.ts ----
  const ctx0 = await newContext();
  const p0 = await ctx0.newPage();
  pages.push(["critics", p0]);
  p0.on("pageerror", (e) => complaints.push(`critics error: ${e.message}`));
  await p0.goto(`${base}/?map=${opt.map}`);
  const samples = await p0.evaluate(async () => {
    const K = await import("/src/critics.ts"), E = await import("/src/easel.ts");
    const W = E.W, H = E.H, C = E.C;
    const mk = (f) => { const px = new Uint8Array(W * H); f(px); return px; };
    const rect = (px, x0, y0, x1, y1, c) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) px[y * W + x] = c; };
    let s = 12345;
    const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const kinds = {
      "blank canvas": [mk(() => {}), 0],
      "all one colour (a flood fill of red)": [mk((p) => p.fill(C.red)), 1],
      "a scribble in black biro": [mk((p) => { let x = 120, y = 90; for (let i = 0; i < 3000; i++) { x = Math.max(0, Math.min(W - 1, x + Math.round((rnd() - 0.5) * 6))); y = Math.max(0, Math.min(H - 1, y + Math.round((rnd() - 0.5) * 6))); p[y * W + x] = C.black; } }), 14],
      "a careful landscape (sky, grass, sun, house, tree)": [mk((p) => { rect(p, 0, 0, W, 110, C.sky); rect(p, 0, 110, W, H, C.green); rect(p, 40, 70, 110, 130, C.stone); rect(p, 66, 104, 82, 130, C.red); for (let y = 12; y < 50; y++) for (let x = 180; x < 220; x++) if ((x - 200) ** 2 + (y - 31) ** 2 < 380) p[y * W + x] = C.yellow; rect(p, 158, 100, 164, 150, C.brown); for (let y = 70; y < 104; y++) for (let x = 140; x < 182; x++) if ((x - 161) ** 2 + (y - 87) ** 2 < 300) p[y * W + x] = C.dkgreen; for (let i = 0; i < 40; i++) rect(p, Math.floor(rnd() * 230), Math.floor(rnd() * 100), Math.floor(rnd() * 230) + 4, 0, C.pale); for (let k = 0; k < 30; k++) { const x = Math.floor(rnd() * 230), y = 115 + Math.floor(rnd() * 60); rect(p, x, y, x + 3, y + 3, [C.yellow, C.pink, C.red][k % 3]); } }), 46],
      "a rainbow of stripes": [mk((p) => { for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) p[y * W + x] = 1 + Math.floor(x / 16) % 15; }), 20],
      "a red and blue flag": [mk((p) => { rect(p, 30, 30, 210, 150, C.blue); rect(p, 30, 80, 210, 100, C.red); rect(p, 110, 30, 130, 150, C.red); }), 4],
      "a little grey seagull in the corner": [mk((p) => { rect(p, 10, 140, 40, 160, C.grey); rect(p, 36, 144, 44, 148, C.yellow); rect(p, 4, 135, 18, 142, C.pale); }), 3],
      "a gloomy night": [mk((p) => { rect(p, 0, 0, W, H, C.navy); rect(p, 0, 130, W, H, C.black); rect(p, 200, 20, 214, 34, C.pale); for (let i = 0; i < 60; i++) { const x = Math.floor(rnd() * W), y = Math.floor(rnd() * 120); p[y * W + x] = C.yellow; } }), 9],
    };
    const theme = K.THEMES[0];
    const names = Object.keys(kinds);
    const ps = names.map((n, i) => ({ id: "p" + i, name: n, px: kinds[n][0], strokes: kinds[n][1] }));
    const out = {};
    for (let seed = 1; seed <= 3; seed++) {
      const slot = (p) => [(p % 4) * 5 - 7.5, p < 4 ? -4 : 4];
      const sh = K.stageShow(ps, theme, theme.t, seed * 7777, slot, [10, 0]);
      const v = K.verdict(sh, ps, ps.map(() => 0), seed);
      sh.remarks.forEach((r) => { (out[names[r.p]] ??= []).push(`${K.visitor(r.v).name}: "${r.text}" (${r.mark}/10)`); });
      out["_marks" + seed] = names.map((n, i) => `${n}: ${sh.marks[i].toFixed(1)} (critics ${sh.critics[i].toFixed(1)}, public ${sh.punters[i].toFixed(1)}) traits ${K.traits(K.analyse(ps[i].px, ps[i].strokes, theme), theme).join(",")}`);
      out["_verdict" + seed] = `${v.headline}: ${v.score.toFixed(2)} vs ${v.bar}; prizes ${v.prizes.map((q) => `${q.title} -> ${names[q.p]}`).join("; ")}`;
      out["_cast" + seed] = sh.cast.map((c) => K.visitor(c).name).join(", ");
    }
    // the codec, both ways
    const round = ps.every((p) => { const back = E.decode(E.encode(p.px)); return back.every((v, i) => v === p.px[i]); });
    const sizes = ps.map((p) => E.encode(p.px).length);
    return { out, round, sizes };
  });
  check("a painting goes over the wire and comes back the same, every kind", samples.round, `encoded sizes ${samples.sizes.join(", ")} chars`);
  report.push("== What the critics say (subject: \"A seagull's revenge\", three different evenings)");
  for (const [k, v] of Object.entries(samples.out)) report.push(k.startsWith("_") ? `${k}: ${Array.isArray(v) ? "\n  " + v.join("\n  ") : v}` : `-- ${k}\n  ${v.join("\n  ")}`);
  report.push(`critics page ${await silenceNote(p0)}`);
  if (opt.only === "critics") throw "done";

  // ---- solo ----
  const room = "ART" + Math.floor(Math.random() * 10000);
  const ctx1 = await newContext();
  const ada = await join(ctx1, "Ada", room);
  await wait(2500);
  const spots = await ada.evaluate(async () => {
    const C = await import("/src/challenges.ts");
    const p = C.challengesOn(window.__game().map).find((p) => p.c.id === "gallery");
    return p ? [...p.spots.map((s) => ({ ...s })), { zone: p.zone + 1 }] : null;
  });
  check("the gallery finds a place on this map", !!spots, JSON.stringify(spots));
  if (!spots) throw new Error("no gallery");
  report.push(`spots: ${JSON.stringify(spots)}`);

  if (opt.only !== "duo") {
    if (opt.eye === "block") await ada.route(/huggingface\.co|hf\.co/, (r) => r.abort());
    if (opt.eye === "slow") {
      const cdp = await ada.context().newCDPSession(ada);
      await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 20, downloadThroughput: 250000, uploadThroughput: -1 });
    }
    await ada.evaluate(([x, z]) => window.__game().player.spawn(x - 3, z - 3, Math.atan2(3, 3)), [spots[0].x, spots[0].z]);
    await settle(ada);
    await ada.screenshot({ path: `${opt.out}/outside-curator.png` });
    // the curator's name label, from a few metres in front of him
    await ada.evaluate(([d, m]) => {
      let ux = m.x - d.x, uz = m.z - d.z; const l = Math.hypot(ux, uz) || 1; ux /= l; uz /= l;
      const cx = d.x - uz * 1.1 - ux * 0.3, cz = d.z + ux * 1.1 - uz * 0.3, g = window.__game(), y = g.map.ground(cx, cz);
      window.__cam = [cx + ux * 3.2 + uz * 0.8, y + 1.9, cz + uz * 3.2 - ux * 0.8, cx, y + 1.7, cz];
    }, [spots[0], spots[1]]);
    await wait(1000);
    await ada.screenshot({ path: `${opt.out}/curator-label.png` });
    await ada.evaluate(() => { window.__cam = null; });
    await takeAndEnter([ada], spots, 4242);
    const painting = await until(ada, 20, (s) => s.phase === "paint" && s.easel);
    check("solo: in the gallery, the painting starts and the easel comes up", painting.phase === "paint" && painting.easel, JSON.stringify(painting));
    await wait(500);
    await ada.screenshot({ path: `${opt.out}/easel-empty.png` });
    // a step back from the easel shows the room's panel, and on the host's screen how the critics' eye is getting on
    await ada.evaluate(() => window.__gallery.easel.hideAndRelock());
    await wait(2500);
    await ada.screenshot({ path: `${opt.out}/eye-loading.png` });
    report.push(`eye while painting: ${JSON.stringify(await ada.evaluate(async () => (await import("/src/eye.ts")).eyeState()))}`);
    await ada.evaluate(() => window.__gallery.start());
    await wait(500);
    await paintByHand(ada);
    await ada.screenshot({ path: `${opt.out}/easel-painted.png` });
    const strokes = await ada.evaluate(() => window.__gallery.easel.strokes);
    check("solo: the painter's strokes landed", strokes >= 15, `${strokes} strokes`);
    await ada.click("#easel button.hang");
    await wait(2500);
    await ada.screenshot({ path: `${opt.out}/eye-hanging.png` });
    const show = await until(ada, 40, (s) => s.phase === "show");
    const eyed = await ada.evaluate(async () => ({ ...(await import("/src/eye.ts")).eyeState(), eyes: window.__gallery.eyes() }));
    report.push(`eye at the show: ${JSON.stringify(eyed)}`);
    console.log("eye at the show:", JSON.stringify(eyed).slice(0, 400));
    check("solo: hanging it opens the private view", show.phase === "show", JSON.stringify(show));
    await wait(5500);
    await cameraOn(ada, "wall");
    await wait(1200);
    await ada.screenshot({ path: `${opt.out}/wall-critic.png` });
    await cameraOn(ada, "room");
    await wait(4000);
    await ada.screenshot({ path: `${opt.out}/room-crowd.png` });
    // the same with the room's own light switched off: the street's daylight (or night) instead
    await ada.evaluate(() => { window.__game().quests.indoors = () => false; });
    await wait(400);
    await ada.screenshot({ path: `${opt.out}/room-crowd-unlit.png` });
    await ada.evaluate(() => { delete window.__game().quests.indoors; });
    await cameraOn(ada, "wall");
    await wait(5000);
    await ada.screenshot({ path: `${opt.out}/wall-critic-2.png` });
    await ada.evaluate(() => { window.__cam = null; });
    const sh = await ada.evaluate(async () => { const K = await import("/src/critics.ts"); const s = window.__gallery.show(); return { remarks: s.remarks.map((r) => ({ ...r, name: K.visitor(r.v).name })), cast: s.cast.map((c) => K.visitor(c).name), dur: s.dur }; });
    report.push(`== Solo show (${sh.cast.length} visitors: ${sh.cast.join(", ")}; ${sh.dur.toFixed(0)} s)`, ...remarkLines(sh, ["Ada"]));
    const before = (await state(ada)).objects;
    await until(ada, 120, (s) => s.phase === "result" || !!s.done);
    const beat = await state(ada);
    check("solo: the critics confer before the verdict card comes up", beat.phase === "result" && !beat.card, JSON.stringify(beat));
    const carded = await until(ada, 10, (s) => s.card);
    await wait(1200);
    await ada.screenshot({ path: `${opt.out}/result-card.png` });
    const verdict = await ada.evaluate(() => window.__gallery.result());
    report.push(`solo verdict: ${JSON.stringify(verdict)}`);
    check("solo: the verdict comes in on a card", !!verdict && carded.card, JSON.stringify(carded));
    await wait(16000);
    const held = await state(ada);
    check("solo: the card stays up, and you stay in, until it's put away", held.card && held.aboard && !held.done, JSON.stringify(held));
    await ada.keyboard.press("Escape");
    await wait(600);
    const lingering = await state(ada);
    check("solo: Esc puts the card away, and you're still in the gallery", !lingering.card && lingering.aboard && !lingering.done
      && await ada.evaluate(() => document.getElementById("pause")?.hidden !== false), JSON.stringify(lingering));
    report.push(`lingering card: ${lingering.line}`);
    await cameraOn(ada, "wall");
    await wait(1200);
    await ada.screenshot({ path: `${opt.out}/linger-wall.png` });
    await ada.evaluate(() => { window.__cam = null; });
    // walk up to Mr Pettigrew by the exit and leave with E
    await ada.evaluate(() => { const G = window.__gallery, g = window.__game(); g.player.spawn(G.C.x + G.pettigrew[0] - 1.2, G.C.z + G.pettigrew[1], -Math.PI / 2); g.player.pos.y = G.top; });
    await wait(500);
    await cameraOn(ada, "door");
    await wait(800);
    await ada.screenshot({ path: `${opt.out}/linger-pettigrew.png` });
    await ada.evaluate(() => { window.__cam = null; });
    const byHim = await state(ada);
    check("solo: by Mr Pettigrew, E would leave", /Pettigrew|Leave/.test(byHim.hint), byHim.hint);
    await ada.evaluate(() => window.__gallery.start());
    const end = await until(ada, 30, (s) => !!s.done || !s.job);
    await wait(3000);
    const after = await state(ada);
    const toDoor = Math.atan2(-(spots[0].x - after.x), -(spots[0].z - after.z));
    const facing = Math.abs(((after.yaw - toDoor + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    check("solo: it ends back on the pavement, looking at the door", !after.aboard && Math.abs(after.y - after.ground) < 3 && facing < 0.6
      && Math.hypot(after.x - spots[0].x, after.z - spots[0].z) < 4, `y ${after.y.toFixed(1)} ground ${after.ground.toFixed(1)}, ${Math.hypot(after.x - spots[0].x, after.z - spots[0].z).toFixed(1)} m from the door, ${facing.toFixed(2)} rad off facing it`);
    await ada.screenshot({ path: `${opt.out}/outside-after.png` });
    if (verdict?.won) check("solo: a win leaves one of the strange objects", after.objects === before + 1, `${before} -> ${after.objects}, done ${JSON.stringify(end.done)}`);
    else report.push(`solo was lost (${verdict?.score} vs ${verdict?.bar}), so no object expected: ${before} -> ${after.objects}`);
    report.push(`Ada (solo) ${await silenceNote(ada)}`);
    await ada.close();
  }

  // ---- two tabs ----
  if (opt.only !== "solo") {
    const room2 = "ART" + Math.floor(Math.random() * 10000);
    const ctx2 = await newContext();
    const a = await join(ctx2, "Ada", room2), b = await join(ctx2, "Bea", room2);
    await wait(3000);
    await takeAndEnter([a, b], spots, 5151);
    const go = await Promise.all([a, b].map((t) => until(t, 25, (s) => s.phase === "paint" && s.easel)));
    check("duo: both in, both at their easels", go.every((s) => s.phase === "paint" && s.easel), JSON.stringify(go.map((s) => [s.phase, s.easel])));
    const host = (await state(a)).host ? a : b, other = host === a ? b : a;
    await paintByHand(a);
    // Bea paints a red and blue flag with the program's own tools, quickly
    await b.evaluate(() => {
      const e = window.__gallery.easel;
      e.apply({ tool: "rect", c: 12, solid: true, pts: [30, 30, 210, 150] });
      e.apply({ tool: "rect", c: 4, solid: true, pts: [30, 80, 210, 100] });
      e.apply({ tool: "rect", c: 4, solid: true, pts: [110, 30, 130, 150] });
      e.apply({ tool: "brush", c: 0, size: 6, pts: [40, 40, 200, 140] });
    });
    await b.screenshot({ path: `${opt.out}/duo-easel-bea.png` });
    await b.click("#easel button.hang");
    await wait(1500);
    const waiting = await state(b);
    check("duo: Bea's hung painting has reached the host", (await state(host)).works >= 1, `host works ${(await state(host)).works}, Bea phase ${waiting.phase}`);
    await a.click("#easel button.hang");
    const both = await Promise.all([a, b].map((t) => until(t, 30, (s) => s.phase === "show")));
    check("duo: both paintings hung on both screens and the show starts", both.every((s) => s.phase === "show" && s.works === 2), JSON.stringify(both.map((s) => [s.phase, s.works])));
    // each votes for the other's painting
    for (const [t, mine] of [[a, "Ada"], [b, "Bea"]]) {
      await t.evaluate(([mine]) => {
        const G = window.__gallery, g = window.__game(), ps = G.painters(), n = ps.length;
        const theirs = ps.findIndex((id) => g.quests.w?.nameOf?.(id) !== mine && id !== g.net.selfId);
        const north = n <= 4 ? n : Math.ceil(n / 2);
        const k = theirs < north ? theirs : theirs - north, m = theirs < north ? north : n - north, nz = theirs < north ? 1 : -1;
        const x = G.C.x + (k - (m - 1) / 2) * 5, z = G.C.z + (nz > 0 ? -6.5 + 2 : 6.5 - 2);
        g.player.spawn(x, z, nz > 0 ? 0 : Math.PI);
        g.player.pos.y = G.top;
      }, [mine]);
    }
    await wait(800);
    const voted = await Promise.all([a, b].map((t) => t.evaluate(() => window.__gallery.start())));
    check("duo: each votes for the other's painting with E", voted.every(Boolean), JSON.stringify(voted));
    await wait(4000);
    await cameraOn(other, "room");
    await wait(800);
    await other.screenshot({ path: `${opt.out}/duo-room.png` });
    await other.evaluate(() => { window.__cam = null; });
    const shB = await other.evaluate(async () => { const K = await import("/src/critics.ts"); const g = window.__game(); const s = window.__gallery.show(); return { remarks: s.remarks.map((r) => ({ ...r, name: K.visitor(r.v).name })), names: window.__gallery.painters().map((id) => id === g.net.selfId ? g.name : (g.remotes.get(id)?.name ?? id)) }; });
    report.push("== Two-tab show, as the second screen got it", ...remarkLines(shB, shB.names));
    const before = (await state(host)).objects;
    await Promise.all([a, b].map((t) => until(t, 150, (s) => s.phase === "result" || !!s.done)));
    const cards = await Promise.all([a, b].map((t) => until(t, 10, (s) => s.card)));
    check("duo: the verdict card comes up on both screens", cards.every((s) => s.card), JSON.stringify(cards.map((s) => [s.phase, s.card])));
    await wait(1000);
    await other.screenshot({ path: `${opt.out}/duo-result.png` });
    const vs = await Promise.all([a, b].map((t) => t.evaluate(() => window.__gallery.result())));
    check("duo: both screens have the same verdict", vs[0] && vs[1] && JSON.stringify(vs[0]) === JSON.stringify(vs[1]), JSON.stringify(vs[0]));
    check("duo: the room's votes were counted", vs[0] && vs[0].votes.reduce((s, x) => s + x, 0) === 2, JSON.stringify(vs[0]?.votes));
    // Ada puts it away with E, Bea with a click on the card
    await a.evaluate(() => window.__gallery.start());
    const hit = await b.evaluate(() => { const r = document.getElementById("gallerycard").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, on: document.elementsFromPoint(r.x + r.width / 2, r.y + r.height / 2).map((e) => e.id || e.tagName).slice(0, 4) }; });
    report.push(`what's under the middle of Bea's card: ${hit.on.join(" > ")}`);
    await b.mouse.click(hit.x, hit.y);
    await wait(600);
    const put = await Promise.all([a, b].map(state));
    check("duo: E and a click each put the card away, and both stay in", put.every((s) => !s.card && s.aboard && !s.done), JSON.stringify(put.map((s) => [s.card, s.aboard])));
    // Ada leaves by the exit; Bea stays on till the gallery closes
    await a.evaluate(() => { const G = window.__gallery, g = window.__game(); g.player.spawn(G.C.x + 10.4, G.C.z, -Math.PI / 2); g.player.pos.y = G.top; });
    await wait(500);
    const atExit = await state(a);
    check("duo: at the exit, E would leave", /Leave/.test(atExit.hint), atExit.hint);
    await a.evaluate(() => window.__gallery.start());
    const aOut = await until(a, 10, (s) => !s.aboard);
    check("duo: Ada's out on the pavement", !aOut.aboard && Math.abs(aOut.y - aOut.ground) < 3, `y ${aOut.y.toFixed(1)} ground ${aOut.ground.toFixed(1)}`);
    const bStill = await state(b);
    check("duo: Bea's still in the gallery after Ada's gone", bStill.aboard && !bStill.done, JSON.stringify(bStill));
    await b.evaluate(() => window.__gallery.closeIn(17000));
    await wait(3000);
    const closing = await state(b);
    report.push(`Bea's card as the gallery closes: ${closing.line}`);
    check("duo: the gallery's closing is counted down", /closes in 0:1/.test(closing.line), closing.line);
    await cameraOn(b, "room");
    await wait(600);
    await b.screenshot({ path: `${opt.out}/duo-closing.png` });
    await b.evaluate(() => { window.__cam = null; });
    const bOut = await until(b, 25, (s) => !s.aboard);
    check("duo: when it closes, Bea's put out on the pavement", !bOut.aboard && Math.abs(bOut.y - bOut.ground) < 3, `y ${bOut.y.toFixed(1)} ground ${bOut.ground.toFixed(1)}`);
    await Promise.all([a, b].map((t) => until(t, 30, (s) => !!s.done || !s.job)));
    await wait(3000);
    const after = await state(host);
    if (vs[0]?.won) check("duo: a win leaves one of the strange objects", after.objects === before + 1, `${before} -> ${after.objects}`);
    else report.push(`duo was lost (${vs[0]?.score} vs ${vs[0]?.bar}): ${before} -> ${after.objects}`);
    report.push(`Ada (duo) ${await silenceNote(a)}`, `Bea (duo) ${await silenceNote(b)}`);
  }
} catch (e) {
  if (e !== "done") complaints.push(String(e?.stack ?? e));
} finally {
  for (const [name, p] of pages) { try { if (!p.isClosed()) report.push(`${name}: ${await silenceNote(p)}`); } catch { /* */ } }
  const out = [...checks.map((c) => `${c.ok ? "PASS" : "FAIL"} ${c.name}${c.detail ? ": " + c.detail : ""}`), "", ...report, "", ...complaints].join("\n");
  fs.writeFileSync(`${opt.out}/report.txt`, out + "\n");
  console.log(complaints.join("\n"));
  await browser.close();
  vite.kill();
  process.exit(checks.every((c) => c.ok) && checks.length && !complaints.length ? 0 : 1);
}
