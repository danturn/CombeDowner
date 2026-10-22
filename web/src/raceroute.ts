// A race's way through Bath: its start and finish put on the nearest proper street (so the rides
// that are no good on grass get a fair go), the streets between them found through the whole
// city's road network, and checkpoints spaced along that way.
//
// Nothing here goes over the network. The roads come from the map everyone loads whole (the
// detailed map's own and the wider map's for the rest of Bath, never the squares streamed in round
// one player), so every player works out the same route from the same race.
import type { GameMap, Road } from "./map";
import { KERBED, roadHalf } from "./map";

/** A way along the streets: scene x, z pairs, the street's half width at each point, and how far
 *  along each point is. */
export interface RacePath { pts: number[]; half: number[]; cum: number[]; len: number }
/** A point on a path, which way it runs there (a unit vector), and the street's half width. */
export interface PathPoint { x: number; z: number; dx: number; dz: number; half: number }

/** How much slower each kind of way is than a street, for finding the route: steps are out. */
const COST: Record<string, number> = { service: 1.15, pedestrian: 1.3, cycleway: 1.2, living_street: 1.05, footway: 1.7, path: 1.8, track: 2.2, bridleway: 2.2, unknown: 1.4 };
const JOIN = 4;            // metres: a road's loose end this near another road's point meets it
const CELL = 64;           // metres: the squares the streets are filed under, for finding the nearest
const SNAP = 350;          // metres round a start or finish to look for a street

interface Graph {
  x: number[]; z: number[];
  to: number[][]; w: number[][]; h: number[][];
  /** Streets fit to start or finish on: ax, az, bx, bz, node a, node b, half width; filed by square. */
  segs: number[]; cells: Map<number, number[]>;
}

const graphs = new WeakMap<GameMap, Graph>();
const ckey = (i: number, j: number) => (i + 4096) * 8192 + (j + 4096);

/** Every road there is, the same for everyone: the detailed map's and the wider map's beyond it. */
function allRoads(map: GameMap): Road[] {
  const wide = map.wide?.rd ?? [];
  return [...map.d.rd, ...wide.filter((r) => !r.p.some((q) => map.inGrid(q[0], -q[1])))];
}

function graphOf(map: GameMap): Graph {
  const had = graphs.get(map);
  if (had) return had;
  const g: Graph = { x: [], z: [], to: [], w: [], h: [], segs: [], cells: new Map() };
  const ids = new Map<number, number>();
  const node = (x: number, z: number) => {
    const k = (Math.round(x * 10) + 600000) * 1200000 + (Math.round(z * 10) + 600000);
    let n = ids.get(k);
    if (n === undefined) { n = g.x.length; ids.set(k, n); g.x.push(x); g.z.push(z); g.to.push([]); g.w.push([]); g.h.push([]); }
    return n;
  };
  const link = (a: number, b: number, cost: number, half: number) => {
    if (a === b) return;
    const d = Math.hypot(g.x[b] - g.x[a], g.z[b] - g.z[a]) * cost;
    g.to[a].push(b); g.w[a].push(d); g.h[a].push(half);
    g.to[b].push(a); g.w[b].push(d); g.h[b].push(half);
  };
  const ends: number[] = [];
  for (const r of allRoads(map)) {
    if (r.c === "steps" || r.p.length < 2) continue;
    const cost = KERBED.has(r.c) && r.c !== "living_street" ? 1 : COST[r.c] ?? 1.4, half = roadHalf(r.c, r.w);
    const street = KERBED.has(r.c) && !r.bridge;
    let prev = -1;
    for (const q of r.p) {
      const n = node(q[0], -q[1]);
      if (prev >= 0 && prev !== n) {
        link(prev, n, cost, half);
        if (street) {
          const s = g.segs.length / 7;
          g.segs.push(g.x[prev], g.z[prev], g.x[n], g.z[n], prev, n, half);
          const i0 = Math.floor(Math.min(g.x[prev], g.x[n]) / CELL), i1 = Math.floor(Math.max(g.x[prev], g.x[n]) / CELL);
          const j0 = Math.floor(Math.min(g.z[prev], g.z[n]) / CELL), j1 = Math.floor(Math.max(g.z[prev], g.z[n]) / CELL);
          for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
            const c = g.cells.get(ckey(i, j));
            if (c) c.push(s); else g.cells.set(ckey(i, j), [s]);
          }
        }
      }
      prev = n;
    }
    ends.push(node(r.p[0][0], -r.p[0][1]), node(r.p[r.p.length - 1][0], -r.p[r.p.length - 1][1]));
  }
  // a road that stops just short of another (two squares' data meeting, or a path to a pavement) joins it
  const near = new Map<number, number[]>();
  for (let n = 0; n < g.x.length; n++) {
    const k = ckey(Math.floor(g.x[n] / JOIN), Math.floor(g.z[n] / JOIN));
    const c = near.get(k);
    if (c) c.push(n); else near.set(k, [n]);
  }
  for (const n of ends) {
    if (g.to[n].length !== 1) continue;
    const ci = Math.floor(g.x[n] / JOIN), cj = Math.floor(g.z[n] / JOIN);
    let best = -1, bd = JOIN;
    for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
      for (const m of near.get(ckey(i, j)) ?? []) {
        if (m === n || g.to[n].includes(m)) continue;
        const d = Math.hypot(g.x[m] - g.x[n], g.z[m] - g.z[n]);
        if (d < bd) { bd = d; best = m; }
      }
    }
    if (best >= 0) link(n, best, 1.2, g.h[n][0]);
  }
  graphs.set(map, g);
  return g;
}

/** The nearest point on a street (not a path, not up on a bridge) to scene (x, z). */
function snap(g: Graph, x: number, z: number): { x: number; z: number; a: number; b: number; half: number } | null {
  let best: { x: number; z: number; a: number; b: number; half: number } | null = null, bd = SNAP;
  const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL), reach = Math.ceil(SNAP / CELL);
  const seen = new Set<number>();
  for (let i = ci - reach; i <= ci + reach; i++) for (let j = cj - reach; j <= cj + reach; j++) {
    for (const s of g.cells.get(ckey(i, j)) ?? []) {
      if (seen.has(s)) continue;
      seen.add(s);
      const S = g.segs, o = s * 7, ax = S[o], az = S[o + 1], bx = S[o + 2], bz = S[o + 3];
      const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2)) : 0;
      const px = ax + vx * t, pz = az + vz * t, d = Math.hypot(px - x, pz - z);
      // the wider streets win a near tie: a race starts better on a road than down a cul-de-sac
      const score = d - S[o + 6] * 2;
      if (score < bd) { bd = score; best = { x: px, z: pz, a: S[o + 4], b: S[o + 5], half: S[o + 6] }; }
    }
  }
  return best;
}

/** A small binary heap of (cost, node). */
class Heap {
  private k: number[] = []; private v: number[] = [];
  get size() { return this.k.length; }
  push(k: number, v: number) {
    const K = this.k, V = this.v;
    let i = K.length;
    K.push(k); V.push(v);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (K[p] <= k) break;
      K[i] = K[p]; V[i] = V[p]; i = p;
    }
    K[i] = k; V[i] = v;
  }
  pop(): number {
    const K = this.k, V = this.v, top = V[0], lk = K.pop()!, lv = V.pop()!;
    if (K.length) {
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        if (l >= K.length) break;
        const c = r < K.length && K[r] < K[l] ? r : l;
        if (K[c] >= lk) break;
        K[i] = K[c]; V[i] = V[c]; i = c;
      }
      K[i] = lk; V[i] = lv;
    }
    return top;
  }
}

/** The way along the streets from near (ax, az) to near (bx, bz), with both ends on a street.
 *  Null if there's no street near either end, or no way between them. */
export function racePath(map: GameMap, ax: number, az: number, bx: number, bz: number): RacePath | null {
  const g = graphOf(map);
  const s = snap(g, ax, az), f = snap(g, bx, bz);
  if (!s || !f) return null;
  const N = g.x.length, GOAL = N;
  const cost = new Float64Array(N + 1).fill(Infinity), prev = new Int32Array(N + 1).fill(-1), shut = new Uint8Array(N + 1);
  const heap = new Heap();
  const est = (n: number) => Math.hypot(g.x[n] - f.x, g.z[n] - f.z);
  for (const n of [s.a, s.b]) {
    const c = Math.hypot(g.x[n] - s.x, g.z[n] - s.z);
    if (c < cost[n]) { cost[n] = c; prev[n] = -2; heap.push(c + est(n), n); }
  }
  const goalFrom = new Map<number, number>([[f.a, Math.hypot(g.x[f.a] - f.x, g.z[f.a] - f.z)]]);
  const fb = Math.hypot(g.x[f.b] - f.x, g.z[f.b] - f.z);
  if (!goalFrom.has(f.b) || fb < goalFrom.get(f.b)!) goalFrom.set(f.b, fb);
  while (heap.size) {
    const n = heap.pop();
    if (shut[n]) continue;
    shut[n] = 1;
    if (n === GOAL) break;
    const gl = goalFrom.get(n);
    if (gl !== undefined && cost[n] + gl < cost[GOAL]) { cost[GOAL] = cost[n] + gl; prev[GOAL] = n; heap.push(cost[GOAL], GOAL); }
    const to = g.to[n], w = g.w[n];
    for (let k = 0; k < to.length; k++) {
      const m = to[k], c = cost[n] + w[k];
      if (c < cost[m]) { cost[m] = c; prev[m] = n; heap.push(c + est(m), m); }
    }
  }
  if (prev[GOAL] < 0) return null;
  const nodes: number[] = [];
  for (let n = prev[GOAL]; n >= 0; n = prev[n]) nodes.push(n);
  nodes.reverse();
  const xs = [s.x, ...nodes.map((n) => g.x[n]), f.x], zs = [s.z, ...nodes.map((n) => g.z[n]), f.z];
  const hs = [s.half];
  for (let k = 0; k < nodes.length; k++) {
    const a = k ? nodes[k - 1] : -1, i = a >= 0 ? g.to[a].indexOf(nodes[k]) : -1;
    hs.push(i >= 0 ? g.h[a][i] : s.half);
  }
  hs.push(f.half);
  // drop the points crowded together, keeping the ends
  const out: RacePath = { pts: [xs[0], zs[0]], half: [hs[0]], cum: [0], len: 0 };
  for (let k = 1; k < xs.length; k++) {
    const px = out.pts[out.pts.length - 2], pz = out.pts[out.pts.length - 1], d = Math.hypot(xs[k] - px, zs[k] - pz);
    if (d < 4 && k < xs.length - 1) continue;
    if (d < 0.01) continue;
    out.len += d;
    out.pts.push(xs[k], zs[k]); out.half.push(hs[k]); out.cum.push(out.len);
  }
  if (out.pts.length < 4) return null;
  return out;
}

/** The point s metres along a path; before its start or past its end it carries straight on. */
export function along(p: RacePath, s: number): PathPoint {
  const n = p.cum.length;
  let k = 0;
  if (s >= p.len) k = n - 2;
  else if (s > 0) { let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (p.cum[m] <= s) lo = m; else hi = m; } k = lo; }
  const ax = p.pts[k * 2], az = p.pts[k * 2 + 1], bx = p.pts[k * 2 + 2], bz = p.pts[k * 2 + 3];
  const l = Math.max(0.01, p.cum[k + 1] - p.cum[k]), dx = (bx - ax) / l, dz = (bz - az) / l, u = s - p.cum[k];
  return { x: ax + dx * u, z: az + dz * u, dx, dz, half: p.half[k + 1] };
}

/** How far along the checkpoints are: about one every 350 m, at least one, at most ten. */
export function gatesOf(p: RacePath): number[] {
  const n = Math.max(1, Math.min(10, Math.round(p.len / 350)));
  const out: number[] = [];
  for (let k = 1; k <= n; k++) out.push((p.len * k) / (n + 1));
  return out;
}
