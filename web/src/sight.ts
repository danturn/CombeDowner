// What the critics can make out in a painting beyond its colours (critics.ts): where its weight
// sits, whether there's a horizon or one big subject, how the colours sit together, how the lines
// were drawn, and the things anyone would recognise in it: a sun, a bus, a cat, a face, gulls,
// houses, trees, a stick figure, writing, and the rude doodles every open exhibition gets.
//
// It's all plain shape tests on the separate patches of colour. Each patch is filled in (an outline
// drawing becomes the solid shape it encloses), patches that touch are also tried together (a red
// roof on stone walls is one house), and each shape is measured: how long against how wide, how
// round, where its corners and lumps are. No learning, nothing random: the same painting always
// reads the same, which matters because only the host looks and everyone else gets the words.
//
// Who decides what: the host, as part of staging the show; nothing here goes over the network.
import { C, H, W } from "./easel";

export type Thing = "sun" | "bus" | "cat" | "face" | "birds" | "house" | "tree" | "figure" | "writing";
export type Rude = "penis" | "boobs" | "bum" | "finale" | "phallic";

export interface Sight {
  /** How many of each thing it shows. */
  things: Partial<Record<Thing, number>>;
  rude: Partial<Record<Rude, number>>;
  /** Where the visual weight sits, 0..1 across and down. */
  wx: number; wy: number;
  /** The main subject's centre, if one shape stands out against the rest. */
  subject: [number, number] | null;
  /** The biggest stretch of clean, untouched canvas, as a share of it. */
  space: number;
  /** Where a horizon runs straight across, 0..1 down, or -1. */
  horizon: number;
  /** Colours from opposite sides of the wheel, all from one side, warm set against cool. */
  complement: boolean; analogous: boolean; warmcool: boolean;
  /** Lightest less darkest of the colours with a real share. */
  range: number;
  muddy: boolean;
  /** Coloured areas held in by black lines; strokes all going one way; ruler-straight lines. */
  outlined: boolean; hatched: boolean; straight: number;
}

const N = W * H;
const LUM = [1, 0, 0.5, 0.77, 0.55, 0.68, 0.88, 0.75, 0.35, 0.35, 0.7, 0.82, 0.5, 0.15, 0.4, 0.78];
// hue round the wheel, in degrees; -1 for the greys, which sit on no side of it
const HUE = [-1, -1, -1, -1, 0, 28, 52, 38, 25, 130, 108, 203, 224, 229, 276, 326];
const WARMS = [C.red, C.orange, C.yellow, C.stone, C.brown, C.pink];
const COOLS = [C.blue, C.sky, C.navy, C.green, C.dkgreen, C.purple];

interface Comp { c: number; n: number; x0: number; y0: number; x1: number; y1: number; sx: number; sy: number; at: number }

/** A shape: one patch or several touching, filled in, in its own little box. */
interface Obj {
  ids: Set<number>;
  x0: number; y0: number; w: number; h: number;
  m: Uint8Array; area: number; ink: number;
  cx: number; cy: number;
  /** The long axis's angle, and the spread along it and across it (standard deviations). */
  th: number; sa: number; sb: number;
  col: number;
  dt?: Uint8Array; maxDt?: number;
}

export function see(px: Uint8Array): Sight {
  // ---- the patches ----
  const lab = new Int32Array(N).fill(-1), comps: Comp[] = [], order = new Int32Array(N);
  let fill = 0;
  const stack: number[] = [];
  for (let s = 0; s < N; s++) {
    if (lab[s] >= 0) continue;
    const c = px[s], id = comps.length, at = fill;
    const k: Comp = { c, n: 0, x0: W, y0: H, x1: 0, y1: 0, sx: 0, sy: 0, at };
    lab[s] = id; stack.push(s);
    while (stack.length) {
      const i = stack.pop()!, x = i % W, y = (i - x) / W;
      order[fill++] = i;
      k.n++; k.sx += x; k.sy += y;
      if (x < k.x0) k.x0 = x; if (x > k.x1) k.x1 = x; if (y < k.y0) k.y0 = y; if (y > k.y1) k.y1 = y;
      if (x > 0 && lab[i - 1] < 0 && px[i - 1] === c) { lab[i - 1] = id; stack.push(i - 1); }
      if (x < W - 1 && lab[i + 1] < 0 && px[i + 1] === c) { lab[i + 1] = id; stack.push(i + 1); }
      if (y > 0 && lab[i - W] < 0 && px[i - W] === c) { lab[i - W] = id; stack.push(i - W); }
      if (y < H - 1 && lab[i + W] < 0 && px[i + W] === c) { lab[i + W] = id; stack.push(i + W); }
    }
    comps.push(k);
  }
  const pixOf = (id: number) => order.subarray(comps[id].at, comps[id].at + comps[id].n);
  // a painted ground, or a strip of sky or grass right across, is setting rather than a thing
  const bg = comps.map((k) => k.c !== C.white && k.n > 0.45 * N);
  const backdrop = comps.map((k) => (k.x1 - k.x0 >= 0.8 * W || k.y1 - k.y0 >= 0.8 * H) && k.n >= 0.06 * N);
  const isShape = (id: number) => comps[id].c !== C.white && !bg[id];

  // ---- filling a set of patches in ----
  function makeObj(ids: number[]): Obj {
    let x0 = W, y0 = H, x1 = 0, y1 = 0;
    for (const id of ids) { const k = comps[id]; x0 = Math.min(x0, k.x0); y0 = Math.min(y0, k.y0); x1 = Math.max(x1, k.x1); y1 = Math.max(y1, k.y1); }
    const w = x1 - x0 + 1, h = y1 - y0 + 1, gw = w + 2, gh = h + 2;
    const own = new Uint8Array(gw * gh), set = new Set(ids);
    let ink = 0;
    const tally = new Array(16).fill(0);
    for (const id of ids) {
      tally[comps[id].c] += comps[id].n; ink += comps[id].n;
      for (const i of pixOf(id)) { const x = i % W, y = (i - x) / W; own[(y - y0 + 1) * gw + x - x0 + 1] = 1; }
    }
    const out = new Uint8Array(gw * gh), st = [0];
    out[0] = 1;
    while (st.length) {
      const i = st.pop()!, x = i % gw;
      const nb = [x > 0 ? i - 1 : -1, x < gw - 1 ? i + 1 : -1, i - gw, i + gw];
      for (const j of nb) if (j >= 0 && j < gw * gh && !out[j] && !own[j]) { out[j] = 1; st.push(j); }
    }
    const m = new Uint8Array(w * h);
    let area = 0, sx = 0, sy = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!out[(y + 1) * gw + x + 1]) { m[y * w + x] = 1; area++; sx += x; sy += y; }
    const mx = sx / area, my = sy / area;
    let sxx = 0, syy = 0, sxy = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (m[y * w + x]) { const dx = x - mx, dy = y - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
    sxx /= area; syy /= area; sxy /= area;
    const th = 0.5 * Math.atan2(2 * sxy, sxx - syy), tr = (sxx + syy) / 2, dd = Math.sqrt(((sxx - syy) / 2) ** 2 + sxy * sxy);
    const col = tally.indexOf(Math.max(...tally));
    return { ids: set, x0, y0, w, h, m, area, ink, cx: x0 + mx, cy: y0 + my, th, sa: Math.sqrt(tr + dd), sb: Math.sqrt(Math.max(0.01, tr - dd)), col };
  }
  /** How far each filled pixel is from the shape's edge, in pixels (a 3-4 chamfer, so thirds). */
  function dist(o: Obj) {
    if (o.dt) return o.dt;
    const { w, h, m } = o, d = new Uint16Array(w * h);
    const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : d[y * w + x]);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!m[y * w + x]) continue;
      d[y * w + x] = Math.min(at(x - 1, y) + 3, at(x, y - 1) + 3, at(x - 1, y - 1) + 4, at(x + 1, y - 1) + 4);
    }
    let mx = 0;
    for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
      if (!m[y * w + x]) continue;
      const v = Math.min(d[y * w + x], at(x + 1, y) + 3, at(x, y + 1) + 3, at(x + 1, y + 1) + 4, at(x - 1, y + 1) + 4);
      d[y * w + x] = v; if (v > mx) mx = v;
    }
    o.dt = new Uint8Array(d.map((v) => Math.min(255, Math.round(v))));
    o.maxDt = mx / 3;
    return o.dt;
  }
  const thick = (o: Obj) => { dist(o); return o.maxDt!; };
  const inside = (o: Obj, x: number, y: number) => {
    const lx = Math.floor(x) - o.x0, ly = Math.floor(y) - o.y0;
    return lx >= 0 && ly >= 0 && lx < o.w && ly < o.h && !!o.m[ly * o.w + lx];
  };
  /** Its width across at an angle, through the given pixels (all of the shape if none given). */
  function extents(o: Obj, pick?: (i: number) => boolean) {
    const r: [number, number, number][] = [];
    for (let k = 0; k < 12; k++) {
      const a = (k * Math.PI) / 12, c = Math.cos(a), s = Math.sin(a);
      let lo = 1e9, hi = -1e9;
      for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) {
        const i = y * o.w + x;
        if (!o.m[i] || (pick && !pick(i))) continue;
        const u = x * c + y * s;
        if (u < lo) lo = u; if (u > hi) hi = u;
      }
      r.push([a, lo, hi + 1]);
    }
    return r;
  }
  const iso = (ex: [number, number, number][]) => {
    const d = ex.map(([, lo, hi]) => hi - lo);
    return Math.min(...d) / Math.max(...d);
  };
  /** Pixels inside the shape that belong to other patches (eyes in a face, windows in a bus). */
  function innerParts(o: Obj) {
    const cnt = new Map<number, number>();
    for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) {
      if (!o.m[y * o.w + x]) continue;
      const l = lab[(y + o.y0) * W + x + o.x0];
      if (!o.ids.has(l)) cnt.set(l, (cnt.get(l) ?? 0) + 1);
    }
    return [...cnt].filter(([l, n]) => n === comps[l].n).map(([l]) => l);
  }
  const centre = (id: number): [number, number] => [comps[id].sx / comps[id].n + 0.5, comps[id].sy / comps[id].n + 0.5];

  // ---- which shapes to try ----
  const shapeIds = comps.map((_, i) => i).filter((i) => isShape(i) && comps[i].n >= 12).sort((a, b) => comps[b].n - comps[a].n).slice(0, 90);
  const parent = comps.map((_, i) => i);
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i])));
  const joinable = (id: number) => isShape(id) && !backdrop[id];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, a = lab[i];
    if (!joinable(a)) continue;
    if (x < W - 1 && lab[i + 1] !== a && joinable(lab[i + 1])) parent[root(lab[i + 1])] = root(a);
    if (y < H - 1 && lab[i + W] !== a && joinable(lab[i + W])) parent[root(lab[i + W])] = root(a);
  }
  const groups = new Map<number, number[]>();
  comps.forEach((k, i) => { if (joinable(i) && k.n >= 3) { const r = root(i); (groups.get(r) ?? groups.set(r, []).get(r)!).push(i); } });
  const singles = shapeIds.map((id) => makeObj([id]));
  const clusters = [...groups.values()].filter((g) => g.length > 1 && g.reduce((s, i) => s + comps[i].n, 0) >= 40)
    .sort((a, b) => b.length - a.length).slice(0, 30).map(makeObj);
  const objs = [...singles, ...clusters];

  // ---- the things ----
  const things: Partial<Record<Thing, number>> = {}, rude: Partial<Record<Rude, number>> = {};
  const found: { k: string; x0: number; y0: number; x1: number; y1: number }[] = [];
  /** Count one, unless it's the same one seen again as part of a bigger group. */
  const spot = (k: Thing | Rude, o: { x0: number; y0: number; w: number; h: number; cx: number; cy: number }) => {
    if (found.some((f) => f.k === k && o.cx >= f.x0 && o.cx <= f.x1 && o.cy >= f.y0 && o.cy <= f.y1)) return false;
    found.push({ k, x0: o.x0, y0: o.y0, x1: o.x0 + o.w, y1: o.y0 + o.h });
    if (k in { penis: 1, boobs: 1, bum: 1, finale: 1, phallic: 1 }) rude[k as Rude] = (rude[k as Rude] ?? 0) + 1;
    else things[k as Thing] = (things[k as Thing] ?? 0) + 1;
    return true;
  };

  const nearly: Obj[] = [];
  for (const o of objs) {
    if (o.area < 60) continue;
    const p = phallus(o);
    if (p === "phallic") { nearly.push(o); continue; }
    if (!p) continue;
    if (!spot("penis", o)) continue;
    // anything flying off beyond the tip
    let drops = 0;
    for (let id = 0; id < comps.length; id++) {
      const k = comps[id];
      if (o.ids.has(id) || k.c === C.white || bg[id] || k.n > 90) continue;
      const [x, y] = centre(id), dx = x - p.tip[0], dy = y - p.tip[1];
      const d = dx * p.dir[0] + dy * p.dir[1], lat = Math.abs(-dx * p.dir[1] + dy * p.dir[0]);
      if (d > -1 && d < 1.4 * p.len && lat <= 0.55 * d + p.wid) drops++;
    }
    if (drops >= 3) spot("finale", o);
  }

  // two round lumps side by side, each with a dot near its middle
  const dots = comps.map((_, i) => i).filter((i) => {
    const k = comps[i];
    return k.c !== C.white && !bg[i] && k.n >= 2 && k.n <= 160 && k.x1 - k.x0 <= 16 && k.y1 - k.y0 <= 16;
  });
  const lump = dots.slice(0, 400).map((d) => {
    const [x, y] = centre(d);
    let best: Obj | null = null;
    for (const o of objs) if (!o.ids.has(d) && o.area > comps[d].n * 6 && inside(o, x, y) && (!best || o.area < best.area)) best = o;
    return best;
  });
  const used = new Set<number>();
  const held = lump.map((o, i) => (o ? i : -1)).filter((i) => i >= 0).slice(0, 60);
  for (const a of held) for (const b of held) {
    const oa = lump[a], ob = lump[b];
    if (a >= b || !oa || !ob || used.has(a) || used.has(b)) continue;
    const ka = comps[dots[a]], kb = comps[dots[b]];
    if (Math.max(ka.n, kb.n) > 3.5 * Math.min(ka.n, kb.n)) continue;
    const [ax, ay] = centre(dots[a]), [bx, by] = centre(dots[b]), D = Math.hypot(bx - ax, by - ay);
    const ra = roundAbout(oa, ax, ay, bx, by), rb = roundAbout(ob, bx, by, ax, ay);
    if (!ra || !rb) continue;
    const r = (ra + rb) / 2;
    if (Math.max(ra, rb) > 1.45 * Math.min(ra, rb) || D < 1.3 * r || D > 3.6 * r || r < 5) continue;
    if (Math.max(ka.n, kb.n) > 0.18 * Math.PI * r * r) continue;
    used.add(a); used.add(b);
    const x0 = Math.min(ax, bx) - r, y0 = Math.min(ay, by) - r;
    spot("boobs", { x0, y0, w: Math.abs(bx - ax) + 2 * r, h: Math.abs(by - ay) + 2 * r, cx: (ax + bx) / 2, cy: (ay + by) / 2 });
  }
  /** From a dot, is the shape round about it on the side away from its partner? Its radius if so. */
  function roundAbout(o: Obj, x: number, y: number, px2: number, py2: number) {
    const away = Math.atan2(py2 - y, px2 - x), rs: number[] = [];
    for (let k = 0; k < 24; k++) {
      const a = (k * Math.PI) / 12;
      let diff = Math.abs(a - away) % (2 * Math.PI);
      if (diff > Math.PI) diff = 2 * Math.PI - diff;
      if (diff < 1.4) continue;
      let r = 0;
      while (r < 200 && inside(o, x + Math.cos(a) * r, y + Math.sin(a) * r)) r += 0.5;
      rs.push(r);
    }
    const mean = rs.reduce((s, v) => s + v, 0) / rs.length;
    const sd = Math.sqrt(rs.reduce((s, v) => s + (v - mean) ** 2, 0) / rs.length);
    return sd / mean < 0.2 ? mean : 0;
  }

  for (const o of objs) {
    if (o.area < 80) continue;
    if (!found.some((f) => f.k === "boobs" && o.cx >= f.x0 && o.cx <= f.x1 && o.cy >= f.y0 && o.cy <= f.y1) && bum(o)) spot("bum", o);
    if (sun(o)) spot("sun", o);
    if (bus(o)) spot("bus", o);
    if (cat(o)) spot("cat", o);
    if (face(o)) spot("face", o);
    if (house(o)) spot("house", o);
    if (figure(o)) spot("figure", o);
  }

  // only something nobody could take for anything else gets the benefit of the doubt
  for (const o of nearly) if (!found.some((f) => o.cx >= f.x0 && o.cx <= f.x1 && o.cy >= f.y0 && o.cy <= f.y1)) spot("phallic", o);

  // trees: a brown upright with a green blob on top
  const greens = comps.map((_, i) => i).filter((i) => (comps[i].c === C.green || comps[i].c === C.dkgreen) && comps[i].n >= 20 && !bg[i] && !backdrop[i]);
  const tookGreen = new Set<number>();
  for (const t of shapeIds) {
    const k = comps[t];
    if (k.c !== C.brown && k.c !== C.black) continue;
    const tw = k.x1 - k.x0 + 1, th = k.y1 - k.y0 + 1;
    if (th < 6 || th < 1.3 * tw) continue;
    const [tx] = centre(t);
    for (const g of greens) {
      const q = comps[g], [gx, gy] = centre(g), gw = q.x1 - q.x0 + 1;
      if (tookGreen.has(g) || q.n < 0.6 * k.n || gw < 1.4 * tw) continue;
      if (gy < k.y0 + 0.3 * th && Math.abs(gx - tx) <= 0.6 * gw && q.y1 >= k.y0 - 3 && q.y0 < k.y0) {
        tookGreen.add(g);
        spot("tree", { x0: Math.min(k.x0, q.x0), y0: q.y0, w: Math.max(k.x1, q.x1) - Math.min(k.x0, q.x0) + 1, h: k.y1 - q.y0 + 1, cx: gx, cy: gy });
        break;
      }
    }
  }

  // writing first, so its letters aren't taken for gulls
  const marks = comps.map((_, i) => i).filter((i) => {
    const k = comps[i], h = k.y1 - k.y0 + 1, w = k.x1 - k.x0 + 1;
    return isShape(i) && k.n >= 3 && h >= 4 && h <= 28 && w <= 2.2 * h + 2 && k.n <= 2.5 * (w + h) * 2;
  });
  const lettered = new Set<number>();
  for (const s of marks) {
    if (lettered.has(s)) continue;
    const ks = comps[s], hs = ks.y1 - ks.y0 + 1, [, sy] = centre(s);
    const row = marks.filter((i) => {
      const k = comps[i], h = k.y1 - k.y0 + 1;
      return !lettered.has(i) && Math.abs(centre(i)[1] - sy) <= 0.45 * hs && Math.abs(h - hs) <= 0.6 * hs;
    }).sort((a, b) => comps[a].x0 - comps[b].x0);
    let run: number[] = [];
    const flush = () => {
      if (run.length >= 4) {
        const gaps = run.slice(1).map((i, j) => comps[i].x0 - comps[run[j]].x1);
        const mg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
        const sd = Math.sqrt(gaps.reduce((a, b) => a + (b - mg) ** 2, 0) / gaps.length);
        if (sd <= Math.max(2.5, 0.8 * mg)) {
          run.forEach((i) => lettered.add(i));
          const x0 = comps[run[0]].x0, x1 = comps[run[run.length - 1]].x1;
          spot("writing", { x0, y0: sy - hs, w: x1 - x0 + 1, h: 2 * hs, cx: (x0 + x1) / 2, cy: sy });
        }
      }
      run = [];
    };
    for (const i of row) {
      if (run.length && comps[i].x0 - comps[run[run.length - 1]].x1 > 1.6 * hs + 2) flush();
      run.push(i);
    }
    flush();
  }
  // joined-up: one long thin line going up and down all along
  for (const o of singles) {
    if (o.w < 4 * o.h || o.h < 5 || o.h > 30 || thick(o) > 2.4) continue;
    let cross = 0;
    const mid = Math.floor(o.h / 2);
    for (let x = 1; x < o.w; x++) if (o.m[mid * o.w + x] !== o.m[mid * o.w + x - 1]) cross++;
    if (cross >= 10 && cross >= o.w / o.h) spot("writing", o);
  }

  // gulls: little thin Vs, or flattened Ms
  for (let i = 0; i < comps.length; i++) {
    const k = comps[i], w = k.x1 - k.x0 + 1, h = k.y1 - k.y0 + 1;
    if (!isShape(i) || lettered.has(i) || k.n < 4 || k.n > 150 || w < 5 || w > 45 || h < 2 || w < 1.2 * h) continue;
    if (k.n > 2.2 * (w + h) * 2) continue;
    const top = new Array(w).fill(1e9);
    for (const p of pixOf(i)) { const x = p % W, y = (p - x) / W; top[x - k.x0] = Math.min(top[x - k.x0], y - k.y0); }
    let vi = Math.floor(0.3 * w);
    for (let x = vi; x <= Math.ceil(0.7 * w) - 1; x++) if (top[x] > top[vi]) vi = x;
    const dipL = top[vi] - Math.min(...top.slice(0, vi)), dipR = top[vi] - Math.min(...top.slice(vi + 1));
    // a gull flies alone: nothing else painted right round it
    let crowd = 0;
    for (let y = Math.max(0, k.y0 - 3); y <= Math.min(H - 1, k.y1 + 3); y++) for (let x = Math.max(0, k.x0 - 3); x <= Math.min(W - 1, k.x1 + 3); x++) {
      const j = y * W + x;
      if (lab[j] !== i && px[j] !== C.white && !bg[lab[j]]) crowd++;
    }
    if (crowd <= 2 && dipL >= 0.35 * h && dipR >= 0.35 * h && dipL >= 1.5 && dipR >= 1.5) {
      const o = makeObj([i]);
      if (thick(o) <= 2.4) spot("birds", o);
    }
  }

  // ---- composition ----
  let ws = 0, wxs = 0, wys = 0, cover = 0;
  for (let i = 0; i < N; i++) {
    if (px[i] === C.white) continue;
    cover++;
    if (bg[lab[i]]) continue;
    const x = i % W, y = (i - x) / W, wt = 1.15 - LUM[px[i]];
    ws += wt; wxs += wt * x; wys += wt * y;
  }
  const wx = ws ? wxs / ws / W : 0.5, wy = ws ? wys / ws / H : 0.5;
  const inCluster = new Set(clusters.flatMap((o) => [...o.ids]));
  const tops = [...clusters, ...singles.filter((o) => { const id = [...o.ids][0]; return !inCluster.has(id) && !backdrop[id]; })]
    .sort((a, b) => b.area - a.area);
  let subject: [number, number] | null = null;
  if (tops.length && tops[0].area >= 0.04 * N && tops[0].area <= 0.55 * N && (tops.length < 2 || tops[0].area >= 2.5 * tops[1].area)) {
    subject = [tops[0].cx / W, tops[0].cy / H];
  }
  let space = 0, specks = 0;
  comps.forEach((k, i) => {
    if (k.c === C.white) space = Math.max(space, k.n / N);
    else if (k.n <= 4 && !bg[i]) specks++;
  });
  if (specks > 12) space *= 0.5;
  let horizon = -1, best = 0;
  for (let y = Math.floor(0.15 * H); y < Math.floor(0.85 * H); y++) {
    let d = 0;
    for (let x = 0; x < W; x++) if (px[y * W + x] !== px[(y + 1) * W + x]) d++;
    if (d / W > best) { best = d / W; horizon = (y + 1) / H; }
  }
  if (best < 0.72) horizon = -1;

  // ---- colour ----
  const count = new Array(16).fill(0);
  for (let i = 0; i < N; i++) count[px[i]]++;
  const painted = Math.max(1, N - count[C.white]);
  const main = count.map((_, c) => c).filter((c) => HUE[c] >= 0 && count[c] / painted >= 0.06);
  const hueGap = (a: number, b: number) => { const d = Math.abs(HUE[a] - HUE[b]) % 360; return d > 180 ? 360 - d : d; };
  let complement = false, analogous = main.length >= 2;
  for (const a of main) for (const b of main) {
    if (a >= b) continue;
    const g = hueGap(a, b);
    if (g >= 140 && a !== C.stone && b !== C.stone && count[a] / painted >= 0.1 && count[b] / painted >= 0.1) complement = true;
    if (g > 60) analogous = false;
  }
  const grey = (count[C.black] + count[C.grey] + count[C.pale]) / painted;
  if (complement || grey > 0.5 || cover < 0.1 * N) analogous = false;
  const warmN = WARMS.reduce((s, c) => s + count[c], 0) / painted, coolN = COOLS.reduce((s, c) => s + count[c], 0) / painted;
  const warmcool = warmN >= 0.25 && coolN >= 0.25 && cover > 0.15 * N;
  const lums = count.map((n, c) => [n, c]).filter(([n]) => n / N >= 0.03).map(([, c]) => LUM[c]);
  const range = lums.length ? Math.max(...lums) - Math.min(...lums) : 0;
  const dull = [C.brown, C.grey, C.dkgreen, C.navy, C.purple, C.stone].reduce((s, c) => s + count[c], 0) / painted;
  const bright = [C.yellow, C.orange, C.red, C.green, C.sky, C.pink].reduce((s, c) => s + count[c], 0) / painted;
  const muddy = main.length + (count[C.grey] / painted > 0.06 ? 1 : 0) >= 3 && dull >= 0.6 && bright < 0.25 && cover > 0.3 * N;

  // ---- line ----
  let pairs = 0, blackPairs = 0, eh = 0, ev = 0, ed1 = 0, ed2 = 0;
  for (let y = 0; y < H - 1; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, a = px[i];
    if (x < W - 1 && a !== px[i + 1]) {
      eh++;
      const b = px[i + 1];
      if (a !== C.white && b !== C.white) { pairs++; if (a === C.black || b === C.black) blackPairs++; }
    }
    if (a !== px[i + W]) {
      ev++;
      const b = px[i + W];
      if (a !== C.white && b !== C.white) { pairs++; if (a === C.black || b === C.black) blackPairs++; }
    }
    if (x < W - 1 && a !== px[i + W + 1]) ed1++;
    if (x > 0 && a !== px[i + W - 1]) ed2++;
  }
  const fills = count.filter((n, c) => c !== C.white && c !== C.black && n / painted >= 0.04).length;
  const outlined = pairs >= 200 && blackPairs / pairs >= 0.55 && count[C.black] / painted >= 0.04 && count[C.black] / painted <= 0.45 && fills >= 2;
  const hvRatio = Math.max(eh, ev) / Math.max(1, Math.min(eh, ev)), dRatio = Math.max(ed1, ed2) / Math.max(1, Math.min(ed1, ed2));
  const hatched = eh + ev >= 1500 && (eh + ev) / (2 * N) >= 0.05 && (hvRatio >= 2.4 || dRatio >= 1.7);
  let straight = 0;
  for (const o of singles) if (o.sa * 3.46 >= 25 && o.sb <= 1.2 && thick(o) <= 2.4) straight++;

  if (muddy) complement = false;
  return { things, rude, wx, wy, subject, space, horizon, complement, analogous, warmcool, range, muddy, outlined, hatched, straight };

  // ---- the shape tests ----

  /** A long shape two to four times as long as it is wide, two round lumps at one end. Says
   *  "phallic" for one that's nearly there (a rocket, a mushroom...). */
  function phallus(o: Obj): { tip: [number, number]; dir: [number, number]; len: number; wid: number } | "phallic" | null {
    if (o.sa < 1.25 * o.sb) return null;
    const ex = Math.cos(o.th), ey = Math.sin(o.th);
    const us: number[] = [], vs: number[] = [];
    for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) {
      if (!o.m[y * o.w + x]) continue;
      const dx = x + o.x0 + 0.5 - o.cx, dy = y + o.y0 + 0.5 - o.cy;
      us.push(dx * ex + dy * ey); vs.push(-dx * ey + dy * ex);
    }
    let lo = Math.min(...us), hi = Math.max(...us);
    const L = hi - lo + 1;
    if (L < 16) return null;
    const K = 20, bin = (u: number) => Math.min(K - 1, Math.max(0, Math.floor(((u - lo) / L) * K)));
    const cnt = new Array(K).fill(0);
    for (const u of us) cnt[bin(u)]++;
    const a = cnt.slice(0, 6).reduce((s, v) => s + v, 0), b = cnt.slice(K - 6).reduce((s, v) => s + v, 0);
    // turn it so the wide end comes first
    const s = a >= b ? 1 : -1;
    if (s < 0) { for (let i = 0; i < us.length; i++) { us[i] = -us[i]; vs[i] = -vs[i]; } [lo, hi] = [-hi, -lo]; cnt.reverse(); }
    const wid = cnt.map((n) => n / (L / K));
    const mid = wid.slice(Math.floor(0.45 * K), Math.floor(0.85 * K)).sort((p, q) => p - q);
    const shaftW = mid[Math.floor(mid.length / 2)];
    if (shaftW < 4) return null;
    const mm = mid.reduce((p, q) => p + q, 0) / mid.length;
    const cv = Math.sqrt(mid.reduce((p, q) => p + (q - mm) ** 2, 0) / mid.length) / mm;
    if (cv > 0.35) return null;
    const ballW = Math.max(...wid.slice(0, Math.floor(0.4 * K)));
    const ratio = ballW / shaftW;
    if (ratio < 1.45 || ratio > 4) return null;
    let ballEnd = 0;
    for (let k = 0; k < 0.6 * K; k++) if (wid[k] >= 1.3 * shaftW) ballEnd = k;
    const shaftLen = (L * (K - ballEnd - 1)) / K, ballLen = (L * (ballEnd + 1)) / K;
    if (shaftLen < 1.2 * shaftW || shaftLen > 8 * shaftW) return null;
    // the lumps: how far each strip across reaches towards the end, looking for a dip in the middle
    let vc = 0, nc = 0;
    for (let i = 0; i < us.length; i++) if (bin(us[i]) >= 0.45 * K && bin(us[i]) < 0.85 * K) { vc += vs[i]; nc++; }
    vc /= Math.max(1, nc);
    const cut = lo + ballLen;
    let R = 0;
    for (let i = 0; i < us.length; i++) if (us[i] < cut) R = Math.max(R, Math.abs(vs[i] - vc));
    const B = 12, reach = new Array(B).fill(Infinity), side = [0, 0];
    for (let i = 0; i < us.length; i++) {
      if (us[i] >= cut) continue;
      const v = vs[i] - vc, k = Math.min(B - 1, Math.max(0, Math.floor(((v + R) / (2 * R + 1e-6)) * B)));
      reach[k] = Math.min(reach[k], us[i]);
      side[v < 0 ? 0 : 1]++;
    }
    const near = (ks: number[]) => ks.reduce((m, k) => (reach[k] < reach[m] ? k : m), ks[0]);
    const lk = near([0, 1, 2, 3, 4, 5]), rk = near([6, 7, 8, 9, 10, 11]);
    const centreReach = Math.min(reach[5], reach[6]);
    const dip = (Number.isFinite(centreReach) ? centreReach : cut) - Math.max(reach[lk], reach[rk]);
    const pos = (k: number) => Math.abs((k + 0.5) / B * 2 - 1);
    const twoLumps = dip >= Math.max(1.5, 0.035 * ballW) && Math.max(...side) <= 1.9 * Math.min(...side);
    // fins sit at the very edges; lumps sit halfway out
    if (!twoLumps || (pos(lk) >= 0.8 && pos(rk) >= 0.8)) {
      // nearly: a solid, even shaft with one wide end, like a rocket on its fins or a mushroom
      const solid = o.ink >= 0.6 * o.area || thick(o) >= 4;
      return solid && cv <= 0.2 && ratio >= 1.6 && ratio <= 3 && ballLen <= 1.3 * ballW && shaftW >= 6 && o.sa >= 1.6 * o.sb ? "phallic" : null;
    }
    const tipU = hi;
    const tip: [number, number] = [o.cx + s * (ex * tipU - ey * vc), o.cy + s * (ey * tipU + ex * vc)];
    return { tip, dir: [s * ex, s * ey], len: L, wid: shaftW };
  }

  /** Two round lumps side by side, with a dip both above and below where they meet. */
  function bum(o: Obj) {
    if (o.sa < 1.2 * o.sb || o.sa > 2.8 * o.sb) return false;
    const ang = Math.abs(Math.atan2(Math.sin(o.th), Math.cos(o.th)));
    if (Math.min(ang, Math.PI - ang) > 0.6) return false;
    const ex = Math.cos(o.th), ey = Math.sin(o.th), B = 16;
    let lo = Infinity, hi = -Infinity;
    const pts: [number, number][] = [];
    for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) {
      if (!o.m[y * o.w + x]) continue;
      const dx = x + o.x0 + 0.5 - o.cx, dy = y + o.y0 + 0.5 - o.cy, u = dx * ex + dy * ey;
      pts.push([u, -dx * ey + dy * ex]); lo = Math.min(lo, u); hi = Math.max(hi, u);
    }
    const top = new Array(B).fill(-Infinity), bot = new Array(B).fill(Infinity), half = [0, 0];
    for (const [u, v] of pts) {
      const k = Math.min(B - 1, Math.floor(((u - lo) / (hi - lo + 1e-6)) * B));
      top[k] = Math.max(top[k], v); bot[k] = Math.min(bot[k], v);
      half[u < (lo + hi) / 2 ? 0 : 1]++;
    }
    if (Math.max(...half) > 1.4 * Math.min(...half)) return false;
    const r = (hi - lo) / 4;
    const midTop = Math.max(top[7], top[8]), midBot = Math.min(bot[7], bot[8]);
    const peakTop = Math.min(Math.max(...top.slice(1, 7)), Math.max(...top.slice(9, 15)));
    const peakBot = Math.max(Math.min(...bot.slice(1, 7)), Math.min(...bot.slice(9, 15)));
    return peakTop - midTop >= 0.18 * r && midBot - peakBot >= 0.18 * r && r >= 5;
  }

  function sun(o: Obj) {
    if (o.col !== C.yellow && o.col !== C.orange) return false;
    if (o.cy > 0.48 * H || thick(o) < 4) return false;
    const dt = dist(o), core = 0.45 * o.maxDt! * 3;
    const ex = extents(o, (i) => dt[i] >= core);
    return iso(ex) >= 0.75;
  }

  function bus(o: Obj) {
    if (o.col !== C.red || o.area < 150) return false;
    const ex = extents(o);
    let bestA = Infinity, k = 0;
    ex.forEach(([, lo, hi], i) => { const j = (i + 6) % 12, a = (hi - lo) * (ex[j][2] - ex[j][1]); if (a < bestA) { bestA = a; k = i; } });
    const long = Math.max(ex[k][2] - ex[k][1], ex[(k + 6) % 12][2] - ex[(k + 6) % 12][1]);
    const short = Math.min(ex[k][2] - ex[k][1], ex[(k + 6) % 12][2] - ex[(k + 6) % 12][1]);
    const longAng = ex[k][2] - ex[k][1] >= ex[(k + 6) % 12][2] - ex[(k + 6) % 12][1] ? ex[k][0] : ex[(k + 6) % 12][0];
    const level = Math.min(longAng, Math.PI - longAng) <= 0.45;
    return o.area / bestA >= 0.8 && long / short >= 1.4 && long / short <= 4.5 && level;
  }

  /** A blob with two pointed ears on top. */
  function cat(o: Obj) {
    if (o.area < 120 || o.col === C.yellow || o.col === C.sky || o.col === C.green) return false;
    const dark = LUM[o.col] <= 0.55 || o.col === C.orange || o.ink < 0.5 * o.area;
    if (!dark) return false;
    const dt = dist(o);
    // look out from the middle of the head: the fattest point overall, and the fattest in the top half
    let ci = 0, hi = 0;
    for (let i = 0; i < dt.length; i++) {
      if (dt[i] > dt[ci]) ci = i;
      if (i < (o.h >> 1) * o.w && dt[i] > dt[hi]) hi = i;
    }
    return earsFrom(o, ci % o.w, Math.floor(ci / o.w), dt[ci] / 3) || earsFrom(o, hi % o.w, Math.floor(hi / o.w), dt[hi] / 3);
  }
  /** Round about a point on top, but for two points sticking up close together. */
  function earsFrom(o: Obj, cx: number, cy: number, rho: number) {
    if (rho < 6) return false;
    const B = 36, r = new Array(B).fill(0);
    for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) {
      if (!o.m[y * o.w + x]) continue;
      const a = Math.atan2(y - cy, x - cx), k = ((Math.round((a / (2 * Math.PI)) * B) % B) + B) % B;
      r[k] = Math.max(r[k], Math.hypot(x - cx, y - cy));
    }
    const at = (k: number) => r[((k % B) + B) % B];
    // bins 18..36 point up the canvas (y grows downwards); 27 is straight up
    const peaks: number[] = [];
    for (let k = 18; k < 36; k++) if (at(k) >= 1.35 * rho && at(k) <= 3.2 * rho && at(k) >= at(k - 1) && at(k) >= at(k + 1) && at(k) - Math.min(at(k - 2), at(k + 2)) >= 0.12 * rho) {
      if (peaks.length && k - peaks[peaks.length - 1] <= 2) { if (at(k) > at(peaks[peaks.length - 1])) peaks[peaks.length - 1] = k; continue; }
      peaks.push(k);
    }
    for (let i = 0; i < peaks.length; i++) for (let j = i + 1; j < peaks.length; j++) {
      const p = peaks[i], q = peaks[j], sep = (q - p) * 10;
      if (sep < 30 || sep > 115 || Math.abs((p + q) / 2 - 27) > 5) continue;
      if (Math.max(at(p), at(q)) > 1.5 * Math.min(at(p), at(q))) continue;
      let between = Infinity;
      for (let k = p + 1; k < q; k++) between = Math.min(between, at(k));
      if (between > 1.2 * rho) continue;
      // the rest of the top of the head is round
      let round = 0, n = 0;
      for (let k = 18; k < 36; k++) {
        if (Math.abs(k - p) <= 2 || Math.abs(k - q) <= 2) continue;
        n++;
        if (at(k) >= 0.8 * rho && at(k) <= 1.3 * rho) round++;
      }
      if (round >= 0.75 * n) return true;
    }
    return false;
  }

  /** Something round with two dots side by side and a line on the far side of them. */
  function face(o: Obj) {
    if (o.area < 150 || iso(extents(o)) < 0.7) return false;
    const d = Math.sqrt(o.area / Math.PI) * 2;
    const parts = innerParts(o).filter((l) => comps[l].n >= 2 && comps[l].n < 0.2 * o.area);
    for (const a of parts) for (const b of parts) {
      if (a >= b) continue;
      const na = comps[a].n, nb = comps[b].n;
      if (Math.max(na, nb) > 2.5 * Math.min(na, nb) || Math.max(na, nb) > 0.08 * o.area) continue;
      const [ax, ay] = centre(a), [bx, by] = centre(b), D = Math.hypot(bx - ax, by - ay);
      if (D < 0.18 * d || D > 0.7 * d) continue;
      const ux = (bx - ax) / D, uy = (by - ay) / D;
      for (const m of parts) {
        if (m === a || m === b) continue;
        const [mx, my] = centre(m), along = (mx - ax) * ux + (my - ay) * uy, off = -(mx - ax) * uy + (my - ay) * ux;
        if (Math.abs(off) < 0.15 * d || along < -0.2 * D || along > 1.2 * D) continue;
        const k = comps[m];
        // the mouth is wider along the eyes than it is tall
        const span = Math.abs(k.x1 - k.x0) * Math.abs(ux) + Math.abs(k.y1 - k.y0) * Math.abs(uy);
        if (span >= 0.3 * D) return true;
      }
    }
    return false;
  }

  /** Upright: a triangle of roof over straight walls. */
  function house(o: Obj) {
    if (o.h < 14 || o.w < 10) return false;
    const wy = new Array(o.h).fill(0);
    for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) wy[y] += o.m[y * o.w + x];
    // the walls: up from the bottom for as long as the width holds
    const low = wy.slice(Math.floor(0.8 * o.h)).sort((p, q) => p - q), bw = low[low.length >> 1];
    let base = o.h - 1;
    while (base > 0 && Math.abs(wy[base - 1] - bw) <= 0.03 * bw + 2) base--;
    if (base < 0.2 * o.h || base > 0.7 * o.h || bw < 8) return false;
    const roofW = Math.max(...wy.slice(0, base));
    if (roofW < 0.85 * bw || roofW > 1.5 * bw) return false;
    const topN = Math.max(1, Math.round(0.12 * o.h));
    if (wy.slice(0, topN).reduce((s, v) => s + v, 0) / topN > 0.45 * roofW) return false;
    let drops = 0;
    for (let y = 1; y < base; y++) if (wy[y] < wy[y - 1] - 2) drops++;
    if (drops > 1 + 0.15 * base) return false;
    // walls plumb and the roof's slopes straight, where blobs and domes bulge
    const edges = (y0: number, y1: number) => {
      const ys: number[] = [], ls: number[] = [], rs: number[] = [];
      for (let y = y0; y < y1; y++) {
        let l = -1, r = -1;
        for (let x = 0; x < o.w; x++) if (o.m[y * o.w + x]) { if (l < 0) l = x; r = x; }
        if (l >= 0) { ys.push(y); ls.push(l); rs.push(r); }
      }
      return [Math.max(wobble(ys, ls), wobble(ys, rs)), Math.max(Math.max(...ls) - Math.min(...ls), Math.max(...rs) - Math.min(...rs))];
    };
    const [wallBend, wallLean] = edges(base, o.h);
    if (wallBend > 1.5 || wallLean > 2 + 0.05 * (o.h - base) || edges(Math.floor(0.1 * o.h), Math.max(Math.floor(0.1 * o.h) + 3, base - 2))[0] > 1.6) return false;
    // and a roof slopes evenly, where a dome is steep at the top and flattens out
    const half = (y: number) => { let l = 0; while (l < o.w && !o.m[y * o.w + l]) l++; return l; };
    const t0 = Math.floor(0.1 * o.h), t2 = base - 2, t1 = (t0 + t2) >> 1;
    if (t2 - t0 >= 6) {
      const up = Math.abs(half(t1) - half(t0)) / (t1 - t0), down = Math.abs(half(t2) - half(t1)) / (t2 - t1);
      if (Math.max(up, down) > 1.8 * Math.max(0.2, Math.min(up, down))) return false;
    }
    let ax = 0, an = 0;
    for (let x = 0; x < o.w; x++) if (o.m[x]) { ax += x; an++; }
    return Math.abs(ax / an - o.w / 2) <= 0.3 * roofW;
  }

  /** How far a run of points strays from the straight line through them. */
  function wobble(xs: number[], ys: number[]) {
    const n = xs.length;
    if (n < 3) return 0;
    const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
    let sxx = 0, sxy = 0;
    for (let i = 0; i < n; i++) { sxx += (xs[i] - mx) ** 2; sxy += (xs[i] - mx) * (ys[i] - my); }
    const k = sxx ? sxy / sxx : 0;
    let e = 0;
    for (let i = 0; i < n; i++) e += (ys[i] - my - k * (xs[i] - mx)) ** 2;
    return Math.sqrt(e / n);
  }

  /** A stick man: thin lines, a round head on top, two legs apart at the bottom. */
  function figure(o: Obj) {
    if (o.h < 18 || o.h < 0.8 * o.w || o.ids.size > 3) return false;
    // the legs: two separate runs across the bottom rows
    let split = 0;
    const rows = Math.max(2, Math.round(0.15 * o.h));
    for (let y = o.h - rows; y < o.h; y++) {
      let runs = 0;
      for (let x = 0; x < o.w; x++) if (o.m[y * o.w + x] && (x === 0 || !o.m[y * o.w + x - 1])) runs++;
      if (runs >= 2) split++;
    }
    if (split < 0.6 * rows) return false;
    // the body's lines are thin; the head is the only filled-in round bit, near the top
    const dt = dist(o);
    let hx = 0, hy = 0, hn = 0, hx0 = o.w, hx1 = 0, hy0 = o.h, hy1 = 0;
    for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) {
      if (dt[y * o.w + x] < 7) continue;
      hx += x; hy += y; hn++;
      hx0 = Math.min(hx0, x); hx1 = Math.max(hx1, x); hy0 = Math.min(hy0, y); hy1 = Math.max(hy1, y);
    }
    if (!hn || hy / hn > 0.35 * o.h) return false;
    const hw = hx1 - hx0 + 1, hh = hy1 - hy0 + 1;
    if (hw > 1.8 * hh || hh > 1.8 * hw || hw > 0.7 * o.w) return false;
    // everything below the head is lines
    let thickBelow = 0;
    for (let y = Math.min(o.h, hy1 + 4); y < o.h; y++) for (let x = 0; x < o.w; x++) if (dt[y * o.w + x] >= 9) thickBelow++;
    return thickBelow <= 6;
  }
}
