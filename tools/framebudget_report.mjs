// Tables in Markdown from what tools/framebudget.mjs measured: where each view's frame time goes.
//
//   node tools/framebudget_report.mjs out/fb/budget.json > out/fb/tables.md
import fs from "fs";

const B = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const views = Object.keys(B.views);
const rates = B.rates;
const f = (x, d = 2) => (x === undefined || x === null || Number.isNaN(x) ? "–" : (+x).toFixed(d));
const out = [];
const p = (s = "") => out.push(s);
const table = (head, rows) => { p(`| ${head.join(" | ")} |`); p(`|${head.map(() => "---").join("|")}|`); for (const r of rows) p(`| ${r.join(" | ")} |`); p(); };
const draws = (m, pass) => (m?.passes?.[pass]?.[0] ?? 0);
const tris = (m, pass) => (m?.passes?.[pass]?.[1] ?? 0);
// grass cells are added after world.ts names the scene's parts: they are known by their attributes
const nice = (k) => k.replace("unnamed inst MeshLambertMaterial [aHead,aFlower]", "grass (cells round the player)").replace("unnamed inst MeshLambertMaterial [aFlower,aHead]", "grass (cells round the player)");

p(`Host: ${B.host.cpu}, ${B.host.cores} cores, ${B.host.memGB} GB. GPU: ${B.renderer.gpu} (timer queries ${B.renderer.timer ? "yes" : "NO"}). Canvas ${B.renderer.canvas.join("x")} in a ${B.size} window.`);
p(`Each number is the median of ${B.reps} runs of ${B.secs} s. Load average before/after each view: ${B.loads.map(([v, a, b]) => `${v} ${a}/${b}`).join(", ")}.`);
p();

for (const rate of rates) {
  p(`### Baseline, CPU x${rate}`);
  table(["view", "fps", "frame ms", "p95 ms", "JS ms", "GPU ms", "GPU shadow", "GPU world", "GPU gun", "GPU post", "draws world", "draws shadow", "draws gun", "ktris world", "ktris shadow", "heap MB"],
    views.filter((v) => B.views[v][`x${rate}`]?.base).map((v) => { const m = B.views[v][`x${rate}`].base; return [v, f(m.fps, 0), f(m.frameMs), f(m.p95Ms, 1), f(m.jsMs), f(m.gpuMs), f(m.gpuPass.shadow), f(m.gpuPass.world), f(m.gpuPass.gun), f(m.gpuPass.post), f(draws(m, "world"), 0), f(draws(m, "shadow"), 0), f(draws(m, "gun"), 0), f(tris(m, "world") / 1000, 0), f(tris(m, "shadow") / 1000, 0), m.heapMB]; }));
}

// the tree, rolled into one ranked list per view: each row's own time (what it spends outside the rows
// under it), so the rows add up to the JavaScript of the frame
function flat(tree, js) {
  const rows = [];
  const drawsBy = {};
  for (const [k, e] of Object.entries(tree)) {
    const parts = k.split(" > "), leaf = parts[parts.length - 1];
    if (leaf.startsWith("draw: ")) { const c = nice(leaf.slice(6)), pass = parts.find((x) => x.startsWith("render:"))?.replace("render: ", "").replace(" pass", "") ?? "?", inSh = parts.some((x) => x.startsWith("shadow map")); const key = `draws: ${c}${inSh ? " (shadow map)" : pass !== "world" ? ` (${pass})` : ""}`; drawsBy[key] = (drawsBy[key] ?? 0) + e.incl; continue; }
    rows.push([k, e.self, e.incl, e.calls]);
  }
  for (const [k, v] of Object.entries(drawsBy)) rows.push([k, v, v, null]);
  const covered = rows.reduce((a, r) => a + r[1], 0);
  rows.push(["(outside every timed call: the browser's frame scheduling, other callbacks' glue)", Math.max(0, js - covered), null, null]);
  return rows.sort((a, b) => b[1] - a[1]);
}
for (const rate of rates) {
  for (const v of views) {
    const at = B.views[v][`x${rate}`];
    if (!at?.tree) continue;
    const m = at.tree, base = at.base;
    p(`### Where the JavaScript goes: ${v}, CPU x${rate}`);
    p(`Frame ${f(base?.frameMs)} ms at ${f(base?.fps, 0)} fps; JavaScript ${f(base?.jsMs)} ms a frame untimed, ${f(m.jsMs)} ms with every call timed (the difference is the timing's own cost). GPU ${f(base?.gpuMs)} ms. The rest of the frame (${f((base?.frameMs ?? 0) - (base?.jsMs ?? 0))} ms) is the browser and waiting for the GPU.`);
    p();
    const rows = flat(m.tree, m.jsMs).filter((r) => r[1] >= 0.01).slice(0, 45);
    table(["own ms", "incl ms", "calls/frame", "where (call path)"], rows.map(([k, s, i, c]) => [f(s, 3), i === null ? "" : f(i, 3), c === null ? "" : f(c, 1), "`" + k.replace(/\|/g, "/") + "`"]));
  }
}

for (const rate of rates) {
  for (const v of views) {
    const pr = B.views[v][`x${rate}`]?.profile;
    if (!pr) continue;
    p(`### Sampling profile: ${v}, CPU x${rate} (ms per second of wall time)`);
    table(["self ms/s", "source file"], pr.selfSrc.slice(0, 25).map(([k, x]) => [f(x), "`" + k + "`"]));
    table(["incl ms/s", "function (source)"], pr.incl.filter(([k]) => !/^\(root\)|^\(program\)|^\(idle\)/.test(k)).slice(0, 40).map(([k, x]) => [f(x), "`" + k + "`"]));
    table(["self ms/s", "function (source)"], pr.self.slice(0, 30).map(([k, x]) => [f(x), "`" + k + "`"]));
  }
}

for (const v of views) {
  const t = B.views[v][`x${rates[0]}`]?.trace;
  if (!t?.main) continue;
  p(`### Trace of the main thread: ${v} (${t.main.spanMs} ms, ${t.main.frames} animation frames)`);
  table(["ms total", "ms / frame", "event"], t.main.by.slice(0, 20).map(([k, x]) => [f(x, 1), f(x / Math.max(1, t.main.frames), 3), k]));
}

// each category left undrawn (and out of the shadow map): what it cost, measured in turns against the game with it
for (const v of views) {
  const at = B.views[v].x1;
  if (!at?.cats) continue;
  const base = at.base, tr = at.tree?.tree ?? {};
  const submit = {};
  for (const [k, e] of Object.entries(tr)) { const leaf = k.split(" > ").pop(); if (leaf.startsWith("draw: ")) submit[leaf.slice(6)] = (submit[leaf.slice(6)] ?? 0) + e.incl; }
  p(`### What each category of thing drawn costs: ${v}`);
  p(`Base: GPU ${f(base.gpuMs)} ms (world ${f(base.gpuPass.world)}, shadow ${f(base.gpuPass.shadow)}), JS ${f(base.jsMs)} ms, frame ${f(base.frameMs)} ms. "Saved" is the median, over ${B.reps} turns, of the game as it is minus the game with that category not drawn (in the shadow map too). CPU submit is the time three.js takes to hand its draws over (from the call tree).`);
  p();
  const rows = Object.entries(at.cats).map(([c, r]) => {
    const pc = base.cats[c] ?? {}, d = r.saved;
    return [nice(c), f(pc.world?.[0] ?? pc.gun?.[0] ?? 0, 0), f(pc.shadow?.[0] ?? 0, 0), f(((pc.world?.[1] ?? pc.gun?.[1] ?? 0)) / 1000, 0), f(((pc.shadow?.[1] ?? 0)) / 1000, 0), f(submit[c] ?? 0, 3), f(d.gpuMs), f(d.gpuShadow), f(d.jsMs), f(d.frameMs)];
  }).sort((a, b) => +b[6] - +a[6]);
  table(["category", "draws", "shadow draws", "ktris", "shadow ktris", "CPU submit ms", "GPU saved ms", "of which shadow", "JS saved ms", "frame saved ms"], rows);
}

for (const rate of rates) {
  const vs = views.filter((v) => B.views[v][`x${rate}`]?.settings);
  if (!vs.length) continue;
  p(`### Settings, CPU x${rate}: frame ms with it (saved frame ms / saved JS ms / saved GPU ms, negative = costs more)`);
  const labels = [...new Set(vs.flatMap((v) => Object.keys(B.views[v][`x${rate}`].settings)))];
  table(["setting", ...vs], [["(as the game is)", ...vs.map((v) => { const m = B.views[v][`x${rate}`].base; return `${f(m.frameMs)} (JS ${f(m.jsMs)}, GPU ${f(m.gpuMs)})`; })],
    ...labels.map((l) => [l, ...vs.map((v) => { const r = B.views[v][`x${rate}`].settings[l]; return r ? `${f(r.with.frameMs)} (${f(r.saved.frameMs)} / ${f(r.saved.jsMs)} / ${f(r.saved.gpuMs)})` : "–"; })])]);
}

if (B.hopper) {
  p("### The rifle's hopper");
  const rows = Object.entries(B.hopper).filter(([, m]) => m.stepMs !== undefined);
  table(["CPU, how the gun moves", "player m/s", "balls", "physics steps/frame", "pair checks/frame", "physics ms/frame", "hopper.update ms (physics + matrices)", "shakeHopper ms (all of it)", "frame ms", "GPU gun pass ms"],
    rows.map(([k, m]) => [k, f(m.playerSpeed, 1), f(m.balls, 1), f(m.stepsPerFrame, 1), f(m.pairChecks, 0), f(m.stepMs, 4), f(m.updateMs, 4), f(m.shakeMs, 4), f(m.frameMs), f(m.gunGpu, 3)]));
  for (const rate of rates) {
    for (const what of ["hopper balls not drawn", "gun not drawn"]) {
      const r = B.hopper[`x${rate} ${what}`];
      if (r) p(`- x${rate}, ${what}: saves GPU ${f(r.saved.gpuMs, 3)} ms (gun pass ${f(r.saved.gpuGun, 3)}), JS ${f(r.saved.jsMs, 3)} ms, frame ${f(r.saved.frameMs, 3)} ms (gun pass GPU with it: ${f(r.without.gpuGun, 3)} ms).`);
    }
  }
  p();
}

if (B.reload) {
  p("### Options that need a fresh page");
  const vs = [...new Set(Object.values(B.reload).flatMap((o) => Object.keys(o)))];
  table(["option", ...vs.map((v) => `${v} frame ms (JS/GPU), draws`)], Object.entries(B.reload).map(([l, o]) => [l, ...vs.map((v) => { const m = o[v]; return m ? `${f(m.frameMs)} (${f(m.jsMs)}/${f(m.gpuMs)}), ${f(draws(m, "world"), 0)}+${f(draws(m, "shadow"), 0)}` : "–"; })]));
}
console.log(out.join("\n"));
