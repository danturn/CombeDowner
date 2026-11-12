// Passages through buildings: an archway cut at ground level where a mapped street or path runs on
// through a building (an arch through a terrace into a mews, a castle's gatehouse). The map tools
// decide where (tools/partition/write_tile.py ways_out_of_buildings) and write each on its building
// as `ps`; here is the one reading of it, shared by the walls drawn (world.ts) and walked into
// (map.ts). Nothing here is decided over the network.
import type { Building } from "./map";

/** One passage: its opening's width and clear height over its floor, and its middle line from wall
 *  to wall as [x, y, floor height] (data metres, heights above sea level). */
export interface Passage { w: number; c: number; p: number[][] }

const parsed = new WeakMap<Building, Passage[]>();
const NONE: Passage[] = [];

export function passages(b: Building): Passage[] {
  if (!b.ps?.length) return NONE;
  let out = parsed.get(b);
  if (!out) {
    out = b.ps.filter((q) => q.length >= 8).map((q) => {
      const p: number[][] = [];
      for (let i = 2; i + 2 < q.length; i += 3) {
        // (a point on top of the one before would make a stretch with no length, and no sides)
        const last = p[p.length - 1];
        if (!last || Math.hypot(q[i] - last[0], q[i + 1] - last[1]) > 0.01) p.push([q[i], q[i + 1], q[i + 2]]);
      }
      return { w: q[0], c: q[1], p };
    });
    parsed.set(b, out);
  }
  return out;
}

/** The floor and the top of the opening (heights above sea level) where data (x, y) is in one of the
 *  building's passages, or null. */
export function passageAt(b: Building, x: number, y: number): [number, number] | null {
  for (const s of passages(b)) {
    const h = s.w / 2;
    for (let i = 0; i < s.p.length - 1; i++) {
      const a = s.p[i], q = s.p[i + 1], vx = q[0] - a[0], vy = q[1] - a[1], l2 = vx * vx + vy * vy || 1;
      const t = ((x - a[0]) * vx + (y - a[1]) * vy) / l2;
      // (the end stretches run a little past the walls, so a step through the doorway counts)
      const lo = i === 0 ? -0.6 / Math.sqrt(l2) : 0, hi = i === s.p.length - 2 ? 1 + 0.6 / Math.sqrt(l2) : 1;
      if (t < lo || t > hi) continue;
      if (Math.hypot(x - a[0] - vx * t, y - a[1] - vy * t) > h) continue;
      const z = a[2] + (q[2] - a[2]) * Math.min(1, Math.max(0, t));
      return [z, z + s.c];
    }
  }
  return null;
}

/** The stretches of the wall from data a to q opened by the building's passages: [from, to, the
 *  opening's top] with from and to in metres along the wall, the top a height above sea level. */
export function openingsAlong(b: Building, a: number[], q: number[], skip?: Passage): [number, number, number][] {
  const ex = q[0] - a[0], ey = q[1] - a[1], len = Math.hypot(ex, ey), out: [number, number, number][] = [];
  if (len < 1e-6) return out;
  for (const s of passages(b)) {
    if (s === skip) continue;
    const h = s.w / 2;
    for (let i = 0; i < s.p.length - 1; i++) {
      const A = s.p[i], B = s.p[i + 1], vx = B[0] - A[0], vy = B[1] - A[1], L = Math.hypot(vx, vy);
      if (L < 1e-6) continue;
      const ux = vx / L, uy = vy / L, s0 = i === 0 ? -0.6 : 0, s1 = i === s.p.length - 2 ? L + 0.6 : L;
      // the wall clipped to the stretch's rectangle: along it between s0 and s1, across within h
      let t0 = 0, t1 = len;
      const clip = (p0: number, dp: number, lo: number, hi: number) => {
        if (Math.abs(dp) < 1e-9) { if (p0 < lo || p0 > hi) t1 = -1; return; }
        let ta = (lo - p0) / dp, tb = (hi - p0) / dp;
        if (ta > tb) [ta, tb] = [tb, ta];
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      };
      const ax = a[0] - A[0], ay = a[1] - A[1];
      clip((ax * ux + ay * uy), (ex * ux + ey * uy) / len, s0, s1);
      clip((-ax * uy + ay * ux), (-ex * uy + ey * ux) / len, -h, h);
      if (t1 - t0 < 0.05) continue;
      const m = (t0 + t1) / 2, mx = a[0] + ex * m / len - A[0], my = a[1] + ey * m / len - A[1];
      const f = Math.min(1, Math.max(0, (mx * ux + my * uy) / L));
      out.push([t0, t1, A[2] + (B[2] - A[2]) * f + s.c]);
    }
  }
  out.sort((x, y) => x[0] - y[0]);
  return out;
}

/** Where a line from data a to q (the side of a passage) is inside the building, as runs of
 *  fractions along it. */
function insideRuns(b: Building, a: number[], q: number[]): [number, number][] {
  const ts = [0, 1];
  for (const ring of b.r) for (let i = 0; i < ring.length; i++) {
    const c = ring[i], d = ring[(i + 1) % ring.length];
    const rx = q[0] - a[0], ry = q[1] - a[1], sx = d[0] - c[0], sy = d[1] - c[1], den = rx * sy - ry * sx;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / den, u = ((c[0] - a[0]) * ry - (c[1] - a[1]) * rx) / den;
    if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
  }
  ts.sort((x, y) => x - y);
  const out: [number, number][] = [];
  for (let k = 0; k < ts.length - 1; k++) {
    const m = (ts[k] + ts[k + 1]) / 2, x = a[0] + (q[0] - a[0]) * m, y = a[1] + (q[1] - a[1]) * m;
    if (ts[k + 1] - ts[k] > 1e-4 && insideAll(b, x, y)) out.push([ts[k], ts[k + 1]]);
  }
  return out;
}

function insideAll(b: Building, x: number, y: number): boolean {
  let inside = false;
  for (const ring of b.r) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** A passage's insides, stretch by stretch, cut where they meet this building's walls: its side
 *  walls, each [start, end], and the floor and ceiling between them, [left start, left end, right
 *  start, right end], points as [x, y, floor height]. A side outside this building (a passage under
 *  two houses of a row, along their party wall) has no wall here: the other house has it. */
export function passageSides(b: Building, s: Passage): { walls: number[][][]; span: number[][] }[] {
  const out: { walls: number[][][]; span: number[][] }[] = [], h = s.w / 2, n = s.p.length;
  for (let i = 0; i < n - 1; i++) {
    const A = s.p[i], B = s.p[i + 1], vx = B[0] - A[0], vy = B[1] - A[1], L = Math.hypot(vx, vy);
    if (L < 1e-6) continue;
    const ux = vx / L, uy = vy / L, nx = -uy, ny = ux;
    // the end stretches reach past the walls, to be cut where each side meets them, and the others
    // just past their bends, so neighbouring stretches overlap there instead of leaving a crack
    const pa = i === 0 ? 2 : h + 0.05, pb = i === n - 2 ? 2 : h + 0.05, T = L + pa + pb;
    const at = (f: number, o: number) => {
      const d = f * T - pa;
      return [A[0] + ux * d + nx * o, A[1] + uy * d + ny * o, A[2] + (B[2] - A[2]) * Math.min(1, Math.max(0, d / L))];
    };
    // (past a mouth a side runs only as far as this building's own wall there: where the mouth is in
    // another building's wall, a side going on through this one would stand out in the open)
    const side = (o: number): [number, number] | null => {
      const runs = insideRuns(b, at(0, o), at(1, o));
      if (!runs.length) return null;
      const f0 = Math.max(runs[0][0], (pa - (i === 0 ? mouthReach(b, A, [-ux, -uy], [nx, ny], o) : turn(s, i, o))) / T);
      const f1 = Math.min(runs[runs.length - 1][1], (pa + L + (i === n - 2 ? mouthReach(b, B, [ux, uy], [nx, ny], o) : turn(s, i + 1, o))) / T);
      return f1 > f0 ? [f0, f1] : null;
    };
    const l = side(h), c = side(0), r = side(-h);
    const fl = l ?? c ?? r, fr = r ?? c ?? l;
    if (!fl || !fr) continue;
    // (a side is left open where another passage through the building crosses it)
    const walls: number[][][] = [];
    for (const [f, o] of [[l, h], [r, -h]] as const) {
      if (!f) continue;
      const p = at(f[0], o), q = at(f[1], o), len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      let t = 0;
      const piece = (t0: number, t1: number) => { if (t1 - t0 > 0.05) walls.push([lerp(p, q, t0 / len), lerp(p, q, t1 / len)]); };
      for (const [o0, o1] of openingsAlong(b, p, q, s)) { piece(t, o0); t = Math.max(t, o1); }
      piece(t, len);
    }
    out.push({ walls, span: [at(fl[0], h), at(fl[1], h), at(fr[0], -h), at(fr[1], -h)] });
  }
  return out;
}

const lerp = (p: number[], q: number[], t: number) => p.map((v, k) => v + (q[k] - v) * t);

/** How far a passage's side `o` off its middle runs out past its mouth at E (heading `out`) to meet
 *  this building's wall there; a hair if the mouth is not in this building's wall. */
function mouthReach(b: Building, E: number[], out: number[], n: number[], o = 0): number {
  let wall: number[][] | null = null, best = 0.5;
  for (const ring of b.r) for (let i = 0; i < ring.length; i++) {
    const c = ring[i], d = ring[(i + 1) % ring.length], sx = d[0] - c[0], sy = d[1] - c[1], l2 = sx * sx + sy * sy || 1;
    const t = Math.max(0, Math.min(1, ((E[0] - c[0]) * sx + (E[1] - c[1]) * sy) / l2));
    const dist = Math.hypot(E[0] - c[0] - sx * t, E[1] - c[1] - sy * t);
    if (dist < best) { best = dist; wall = [c, d]; }
  }
  if (!wall) return 0.05;
  const [c, d] = wall, wx = d[0] - c[0], wy = d[1] - c[1];
  const den = out[0] * wy - out[1] * wx;
  if (Math.abs(den) < 1e-9) return 0.05;
  const px = c[0] - E[0] - n[0] * o, py = c[1] - E[1] - n[1] * o;
  return Math.max(0.05, Math.min(2, (px * wy - py * wx) / den + 0.05));
}

/** How far past the bend at point i the side `o` off the middle runs to meet the next stretch's
 *  side: on past it on the outside of the bend, short of it on the inside (where the two sides
 *  cross), and a hair more either way so they overlap instead of leaving a crack. */
function turn(s: Passage, i: number, o: number): number {
  const [a, b, c] = [s.p[i - 1], s.p[i], s.p[i + 1]];
  const t1 = Math.atan2(b[1] - a[1], b[0] - a[0]), t2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
  const bend = Math.atan2(Math.sin(t2 - t1), Math.cos(t2 - t1));
  const reach = Math.min(Math.abs(o), Math.abs(o) * Math.tan(Math.abs(bend) / 2));
  return (o * bend > 0 ? -reach : reach) + 0.05;
}

/** Whether data (x, y) is in one of the building's courtyards (a hole in its footprint) and the
 *  building has a passage, which may lead into it: open ground, not shut in. */
export function inOpenCourt(b: Building, x: number, y: number): boolean {
  if (!b.ps?.length || b.r.length < 2) return false;
  for (let k = 1; k < b.r.length; k++) {
    const ring = b.r[k];
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; i++, j = i - 1) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    if (inside) return true;
  }
  return false;
}
