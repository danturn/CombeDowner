// Automatic picture settings: how far you see, the resolution, and shadows, chosen for this machine
// and eased back while things are slow. Nothing here goes over the network.
//
// At start-up a short sum timed on the processor, and the graphics chip as the browser names it, give
// a first guess from what the game was measured to cost (tools/devicematrix.mjs). The governor then
// watches real frames, the menu's backdrop included, so it has usually settled before you play: after
// a few slow seconds it takes one step down, in the order that loses least: shadows redrawn less often,
// then the resolution a notch (only when the graphics chip is the one struggling: the retro look hides
// it), then the draw distance a step (never below FLOOR), then shadows off. It steps back up after a
// run of easy seconds, waiting longer each time a step has failed before, so it doesn't flicker. It
// never touches how much is drawn close by (trees, buildings, grass). Where it settled is kept on this
// computer, and the guess is made afresh when the game or the graphics chip changes.
//
// Choosing a draw distance, resolution or shadows yourself (Settings, or L in the debug panel) turns
// this off; the Automatic tickbox in Settings turns it back on. ?view= keeps that distance for the
// visit, ?quality=off turns it off for the visit. Safe graphics after a crash (safegfx.ts) caps it.
import { RES_STEPS } from "./post";
import { setView, view } from "./view";

declare const __BUILD__: number;

const KEY = "cd-auto", STATE_KEY = "cd-auto-state";
const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const put = (k: string, v: string | null) => {
  try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* private window */ }
};
const params = new URLSearchParams(location.search);

// Choices made before there was an automatic setting count as the player's own. (Read as this
// module loads, before the crash guard writes its own.)
const chosenBefore = get(KEY) === null && (get("cd-view") !== null || get("cd-res") !== null);
if (chosenBefore) put(KEY, "0");

/** The views the governor steps between, metres. */
const VIEWS = [500, 600, 750, 900, 1200, 1500, 2000];
const FLOOR = 500;

export interface Look { view: number; res: number; shadows: boolean; every: number }
type Step = "every" | "res" | "view" | "shadows" | "res2";

export interface Hooks {
  setRes: (i: number) => void;
  setShadows: (on: boolean) => void;
  resolution: () => number;
  shadows: () => boolean;
  /** The settings' tickbox and lists show what's in force. */
  shown: () => void;
}

// ---- what the game costs, measured on an M4 Max (tools/devicematrix.mjs) ----
// the processor's milliseconds a frame at each draw distance, shadows on and redrawn every other
// frame: the slowed-down devices' frame times divided by how much slower they were, averaged over
// the five spots (the worst spot is about a quarter slower)
const HOST_CPU: Record<number, number> = { 500: 4.2, 600: 4.4, 750: 4.4, 900: 4.4, 1200: 5.0, 1500: 5.6, 2000: 6.2 };
/** the shadow map's share of that, if it were drawn every frame */
const HOST_SHADOW = 0.8;
/** the graphics chip: fixed milliseconds at 900 m, and per million pixels drawn */
const HOST_GPU = { fixed: 2.4, perMpx: 0.7 };
const HOST_GFLOPS = 14000;
/** the start-up sum's milliseconds on that machine (bench()) */
const HOST_BENCH = 2.8;
const LINES = [270, 360, 540];

/** The graphics chip's FP32 GFLOPS, roughly, from its name. Unknown chips are guessed low. */
export function gflops(gpu: string, mobile: boolean): number {
  const g = gpu.toLowerCase(), n = (re: RegExp) => Number(re.exec(g)?.[1] ?? 0);
  if (/swiftshader|llvmpipe|software|basic render/.test(g)) return 30;
  if (/apple m(\d)/.test(g)) {
    const gen = n(/apple m(\d)/), tier = /ultra/.test(g) ? 5 : /max/.test(g) ? 3.5 : /pro/.test(g) ? 1.8 : 1;
    return 2600 * (1 + 0.15 * (gen - 1)) * tier;
  }
  if (/apple/.test(g)) return mobile ? 900 : 2600;   // Safari says only "Apple GPU"
  if (/rtx\s*(\d{2})(\d{2})/.test(g)) return 8000 + (n(/rtx\s*\d{2}(\d{2})/) - 50) * 300;
  if (/gtx\s*16|gtx\s*10[67]|rx\s*5[5-9]0|rx\s*6[0-9]{2}/.test(g)) return 3500;
  if (/gtx|radeon rx|radeon pro|arc/.test(g)) return 2500;
  if (/iris\s*xe|radeon(?! hd)|vega/.test(g)) return 1500;
  if (/iris/.test(g)) return 800;
  // the Celerons' and Pentiums' cut-down chips, then the usual laptop ones
  if (/uhd graphics 60[05]|uhd graphics 610|hd graphics 50[05]|hd graphics 4[0-9]{2}\b/.test(g)) return 130;
  if (/uhd|hd graphics/.test(g)) return 400;
  if (/adreno/.test(g)) { const m = n(/adreno\D*(\d{3})/); return m >= 740 ? 2500 : m >= 730 ? 1800 : m >= 720 ? 1100 : m >= 700 ? 700 : m >= 660 ? 900 : m >= 640 ? 600 : 400; }
  if (/immortalis|mali-g7[1-9]|mali-g[6-9]\d{2}/.test(g)) return 1200;
  if (/mali/.test(g)) return 400;
  if (/powervr|imagination|xclipse/.test(g)) return 1000;
  return mobile ? 400 : 600;
}

/** A fixed sum of the kind a frame does (matrices, bounds), milliseconds, best of a few goes. */
export function bench(): number {
  const a = new Float32Array(16), b = new Float32Array(16), c = new Float32Array(16);
  for (let i = 0; i < 16; i++) { a[i] = Math.random(); b[i] = Math.random(); }
  let best = Infinity, sink = 0;
  for (let go = 0; go < 3; go++) {
    const t0 = performance.now();
    for (let k = 0; k < 50000; k++) {
      for (let r = 0; r < 4; r++) for (let q = 0; q < 4; q++) {
        let s = 0;
        for (let i = 0; i < 4; i++) s += a[r * 4 + i] * b[i * 4 + q];
        c[r * 4 + q] = s;
      }
      a[k & 15] = c[(k * 7) & 15] * 0.5 + 0.25;
      const o = { x: c[12], y: c[13], z: c[14], r: c[0] };
      sink += Math.hypot(o.x, o.y, o.z) > o.r ? 1 : 0;
    }
    best = Math.min(best, performance.now() - t0);
  }
  (globalThis as { __benchSink?: number }).__benchSink = sink;
  return best;
}

/** Predicted milliseconds a frame for the processor and the graphics chip. The chip's fixed part (drawing
 *  each thing, its corners) is scaled by the square root of the gap in GFLOPS: scaled by the whole gap
 *  it predicts a typical laptop chip at a dozen frames a second, which is far below what such chips do
 *  with scenes this size. The pixels are scaled by the whole gap. Rough either way: the governor
 *  corrects it on the device. */
function predict(l: Look, speed: number, gf: number, px: number) {
  const v = VIEWS.reduce((p, x) => (Math.abs(x - l.view) < Math.abs(p - l.view) ? x : p));
  const cpu = (HOST_CPU[v] - HOST_SHADOW / 2 + (l.shadows ? HOST_SHADOW / l.every : 0)) / speed;
  const gap = HOST_GFLOPS / gf, pixels = px * (LINES[l.res] / 540) ** 2 / 1e6;
  const gpu = HOST_GPU.fixed * (l.view / 900) ** 0.3 * (l.shadows ? 1 : 0.8) * Math.sqrt(gap) + HOST_GPU.perMpx * pixels * gap;
  return { cpu, gpu };
}

export interface Machine { gpu: string; mobile: boolean; risky: boolean; crashed: boolean; memGB: number; px: number }

/** The best this machine is allowed: the governor never goes above it. */
function cap(m: Machine): Look {
  const crashed = m.crashed || get("cd-crashed") !== null;
  if (crashed) return { view: 400, res: 1, shadows: false, every: 2 };
  // memory: iPads' tabs are killed well before 2 GB
  // (a 900 m view keeps about 0.8 GB, 1.5 km 1.8 GB, 3 km 2.9 GB; chips built into the processor share its memory)
  const view = m.mobile ? (m.memGB && m.memGB < 4 ? 750 : 900) : m.memGB && m.memGB < 8 ? 1200 : gflops(m.gpu, false) < 2000 ? 1500 : 2000;
  return { view, res: 2, shadows: !m.risky, every: 2 };
}

/** One step down from l, or null at the bottom. cpuBound: a lower resolution wouldn't help. */
function down(l: Look, floor: number, cpuBound: boolean): [Look, Step] | null {
  if (l.shadows && l.every < 4) return [{ ...l, every: l.every + 1 }, "every"];
  if (!cpuBound && l.res > 1) return [{ ...l, res: l.res - 1 }, "res"];
  const lower = [...VIEWS].reverse().find((v) => v < l.view);
  if (l.view > floor && lower) return [{ ...l, view: Math.max(floor, lower) }, "view"];
  if (l.shadows) return [{ ...l, shadows: false }, "shadows"];
  if (l.res > 0) return [{ ...l, res: l.res - 1 }, "res2"];
  return null;
}

interface Saved { b: number; gpu: string; trail: Look[]; target: number }

class Quality {
  auto = get(KEY) !== "0" && params.get("quality") !== "off";
  /** The draw distance the start-up guess chose (for telemetry), 0 when the player chose. */
  chosenView = 0;
  /** How many steps below the start the governor has been, at most, this visit. */
  deepest = 0;
  private hooks?: Hooks;
  private machine?: Machine;
  /** trail[0] is the best allowed; the last is what's in force. Stepping up drops the last. */
  private trail: Look[] = [];
  private startDepth = 0;
  private fails: number[] = [];
  private target = 60;
  private floor = FLOOR;
  private fixedView = Number(params.get("view")) > 0;
  // the current second's frames
  private secT = 0; private n = 0; private slow = 0; private js = 0;
  private slowSecs = 0; private goodSecs = 0; private calm = 3;
  /** the screen's refresh, ms: the quickest second seen (frames wait for it, so it hides headroom) */
  private refresh = 1000;

  get look(): Look | undefined { return this.trail[this.trail.length - 1]; }
  /** How often the shadow map is drawn afresh: every this many frames (main.ts). */
  get shadowEvery() { return this.auto ? this.look?.every ?? 2 : 2; }

  /** Pick the starting settings. Call once the renderer and Post exist. */
  start(m: Machine, hooks: Hooks) {
    this.machine = m; this.hooks = hooks;
    if (!this.auto) return;
    const top = cap(m);
    this.floor = Math.min(FLOOR, top.view);
    let saved: Saved | null = null;
    try { saved = JSON.parse(get(STATE_KEY) ?? "null"); } catch { /* start afresh */ }
    if (saved && saved.b === __BUILD__ && saved.gpu === m.gpu && saved.trail?.length && saved.trail[0].view === top.view) {
      this.trail = saved.trail; this.target = saved.target;
    } else this.guess(m, top);
    this.startDepth = this.trail.length - 1;
    this.chosenView = this.look!.view;
    this.apply();
  }

  private guess(m: Machine, top: Look) {
    const speed = HOST_BENCH / Math.max(0.2, bench()), gf = gflops(m.gpu, m.mobile);
    const fits = (l: Look, target: number) => { const p = predict(l, speed, gf, m.px); return Math.max(p.cpu * 1.2, p.gpu) <= 1000 / target * 0.95; };
    const walk = (target: number) => {
      const trail = [top];
      for (let l = top; !fits(l, target);) {
        const p = predict(l, speed, gf, m.px), d = down(l, this.floor, p.cpu * 1.2 > p.gpu);
        if (!d) break;
        trail.push((l = d[0]));
      }
      return trail;
    };
    // phones and tablets, and computers that would only hold 60 with a short view, aim for a steady 30
    let trail = walk(60);
    this.target = 60;
    if (m.mobile || trail[trail.length - 1].view < 900 || !fits(trail[trail.length - 1], 60)) { trail = walk(30); this.target = 30; }
    this.trail = trail;
    (globalThis as { __quality?: unknown }).__quality = { speed: +speed.toFixed(2), gflops: gf, target: this.target, look: this.look };
  }

  private apply() {
    const l = this.look, h = this.hooks;
    if (!l || !h) return;
    if (!this.fixedView && view.fogFar !== l.view) setView(l.view);
    if (h.resolution() !== l.res) h.setRes(l.res);
    if (h.shadows() !== l.shadows) h.setShadows(l.shadows);
    this.calm = 3;
    h.shown();
    put(STATE_KEY, JSON.stringify({ b: __BUILD__, gpu: this.machine?.gpu ?? "", trail: this.trail, target: this.target } satisfies Saved));
  }

  /** The player chose a setting themselves: automatic is off until they tick it again. */
  manual() {
    if (!this.auto) return;
    this.auto = false;
    put(KEY, "0");
    // what automatic had chosen stays, now as the player's own
    const h = this.hooks;
    if (!this.fixedView) put("cd-view", String(view.fogFar));
    if (h) { put("cd-res", String(RES_STEPS[h.resolution()].lines)); put("cd-shadows", h.shadows() ? "1" : "0"); }
    this.hooks?.shown();
  }

  /** Automatic back on: guess afresh. */
  automatic() {
    this.auto = true;
    put(KEY, "1"); put(STATE_KEY, null);
    if (this.machine && this.hooks) this.start(this.machine, this.hooks);
  }

  /** Each frame: raw seconds since the last, and the milliseconds its JavaScript took. */
  frame(raw: number, jsMs: number) {
    if (!this.auto || !this.look) return;
    // a hidden tab, a stall or a dialog says nothing about how fast the game draws
    if (raw > 0.25 || document.hidden) { this.secT = 0; this.n = this.slow = this.js = 0; return; }
    const budget = 1000 / this.target * 1.12;
    this.n++; this.js += jsMs; this.secT += raw;
    if (raw * 1000 > budget) this.slow++;
    if (this.secT < 1) return;
    this.second(budget);
    this.secT = 0; this.n = this.slow = this.js = 0;
  }

  private second(budget: number) {
    if (this.calm > 0) { this.calm--; return; }
    const js = this.js / this.n, interval = this.secT * 1000 / this.n, period = 1000 / this.target;
    this.refresh = Math.max(4, Math.min(this.refresh, interval));
    const building = ((globalThis as { __tilesPending?: number }).__tilesPending ?? 0) > 0;
    // a third of the second's frames late is slow (on a 60 Hz screen that's under about 50 a second).
    // Squares being built make frames slower for a while on their own.
    if (this.slow > this.n / 3) {
      this.goodSecs = 0;
      const need = this.slow > this.n * 0.9 ? 2 : building ? 6 : 3;
      if (++this.slowSecs >= need) this.stepDown(js > budget * 0.7);
      return;
    }
    this.slowSecs = 0;
    // easy: hardly a late frame, the JavaScript well inside the time, and frames comfortably quicker than
    // the aim, or waiting on the screen's refresh (which hides how much quicker they could be)
    const roomy = interval <= period * 0.9 || interval <= this.refresh * 1.05;
    if (this.slow <= this.n * 0.03 && js < budget * 0.6 && roomy && !building) {
      const depth = this.trail.length - 1;
      if (depth > 0 && ++this.goodSecs >= Math.min(300, 12 * 2 ** (this.fails[depth - 1] ?? 0))) this.stepUp();
    } else this.goodSecs = 0;
  }

  private stepDown(cpuBound: boolean) {
    this.slowSecs = 0;
    const d = down(this.look!, this.floor, cpuBound);
    // turned right down and still short of 60: aim for a steady 30 instead, from here
    if (!d) { if (this.target === 60) { this.target = 30; this.apply(); } return; }
    const depth = this.trail.length - 1;
    this.fails[depth] = (this.fails[depth] ?? 0) + 1;
    this.trail.push(d[0]);
    this.deepest = Math.max(this.deepest, this.trail.length - 1 - this.startDepth);
    this.apply();
  }

  private stepUp() {
    this.goodSecs = 0;
    this.trail.pop();
    this.apply();
  }
}

export const quality = new Quality();
(globalThis as { __q?: Quality }).__q = quality;
