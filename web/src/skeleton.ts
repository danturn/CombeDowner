// A hipped roof over any outline, as a roofer would lay it: the straight skeleton. Every wall's
// slope rises inwards from its eaves at the same pitch, and where two slopes meet they make a hip,
// a valley or a ridge. Worked out by shrinking the outline, every wall moving in at the same speed
// (a gable end not moving at all, so the slopes either side of it meet over it), and noting the
// moments the shrinking outline changes: a wall shrinking away to nothing, or a corner pointing in
// running into the far side of the outline and cutting it in two (or, round a courtyard, joining
// the courtyard's ring to the outer one). Between those moments each wall sweeps out a band of
// roof. Pure geometry, used by map.ts (hipWhole); nothing here knows about the game.

/** The roof over rings (the outline anticlockwise, any courtyards clockwise), in metres: tris, the
 *  roof's triangles (x, y, height above the eaves, nine numbers each, anticlockwise from above);
 *  gables, for each wall of the first ring marked as a gable end, the points along it where the
 *  roof meets it (x, y, height). The roof rises k metres for each metre in, and stops rising at
 *  top: what's left there is flat. Null where the outline defeats it (it then keeps today's roof). */
export interface Skeleton { tris: number[]; gables: Map<number, number[][]> }

/** Walls whose directions differ by less than this (the sine of the angle) are taken as in line. */
const PARALLEL = 1e-3;

interface Edge { ax: number; ay: number; nx: number; ny: number; dx: number; dy: number; c: number; w: number }
interface Vert { x: number; y: number; t: number; vx: number; vy: number; ein: number; eout: number; bt: number }

export function straightSkeleton(rings: number[][][], gable: boolean[], k: number, top: number): Skeleton | null {
  const E: Edge[] = [];
  const live: Vert[][] = [];
  for (const [ri, ring] of rings.entries()) {
    const first = E.length;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (l < 1e-6) return null;
      const dx = (b[0] - a[0]) / l, dy = (b[1] - a[1]) / l, nx = -dy, ny = dx;
      E.push({ ax: a[0], ay: a[1], nx, ny, dx, dy, c: nx * a[0] + ny * a[1], w: ri === 0 && gable[i] ? 0 : 1 });
    }
    const n = ring.length;
    const vs: Vert[] = [];
    for (let i = 0; i < n; i++) {
      const v = vert(E, ring[i][0], ring[i][1], 0, first + ((i + n - 1) % n), first + i);
      if (!v) return null;
      vs.push(v);
    }
    live.push(vs);
  }
  const tris: number[] = [];
  const gables = new Map<number, number[][]>();
  const at = (v: Vert, t: number) => [v.x + v.vx * (t - v.t), v.y + v.vy * (t - v.t)];
  const noteGables = (t: number) => {
    for (const ring of live) for (const v of ring) for (const e of [v.ein, v.eout]) {
      if (E[e].w !== 0 || e >= rings[0].length) continue;
      const p = at(v, t);
      (gables.get(e) ?? gables.set(e, []).get(e)!).push([p[0], p[1], t]);
    }
  };
  /** The band of roof wall u→w swept from t0 to t1. Each band is laid in one piece from the moment
   *  its two corners last changed, so a roof has a few faces per wall rather than one per event. */
  const band = (u: Vert, w: Vert, t0: number, t1: number) => {
    if (E[u.eout].w === 0 || t1 <= t0) return;
    const a = at(u, t0), b = at(w, t0), c = at(w, t1), d = at(u, t1);
    tri(tris, a, t0, b, t0, c, t1);
    tri(tris, a, t0, c, t1, d, t1);
  };
  const nexts = () => {
    const m = new Map<Vert, Vert>();
    for (const ring of live) ring.forEach((v, i) => m.set(v, ring[(i + 1) % ring.length]));
    return m;
  };
  noteGables(0);
  let T = 0, guard = 0;
  const limit = 40 * E.length + 40;
  while (live.length) {
    if (++guard > limit) return null;
    const ev = nextEvent(E, live, T, at);
    const tEnd = top / k;
    if (!ev && !isFinite(tEnd)) return null;
    if (!ev || ev.t >= tEnd) {
      for (const [u, w] of nexts()) band(u, w, u.bt, tEnd);
      noteGables(tEnd);
      if (!flatTop(live, tEnd, at, tris)) return null;
      break;
    }
    if (ev.t > T) { T = ev.t; noteGables(T); }
    const before = nexts();
    if (!apply(E, live, ev, T, at)) return null;
    const after = nexts();
    for (const [u, w] of before) {
      if (after.get(u) === w) continue;
      band(u, w, u.bt, T);
      u.bt = T;
    }
  }
  for (let i = 2; i < tris.length; i += 3) tris[i] *= k;
  for (const pts of gables.values()) for (const p of pts) p[2] *= k;
  return { tris, gables };
}

/** A corner where walls ein and eout meet, at (x, y) at time t, moving as both walls do. */
function vert(E: Edge[], x: number, y: number, t: number, ein: number, eout: number): Vert | null {
  const a = E[ein], b = E[eout];
  const det = a.nx * b.ny - a.ny * b.nx;
  let vx: number, vy: number;
  if (Math.abs(det) > PARALLEL) {
    vx = (a.w * b.ny - b.w * a.ny) / det;
    vy = (b.w * a.nx - a.w * b.nx) / det;
  } else if (a.nx * b.nx + a.ny * b.ny > 0) {
    // walls in line: the corner slides in with them
    vx = a.nx * Math.max(a.w, b.w); vy = a.ny * Math.max(a.w, b.w);
  } else { vx = 0; vy = 0; }     // walls face to face: this part has shrunk to nothing
  if (!isFinite(vx) || !isFinite(vy) || Math.hypot(vx, vy) > 1e4) return null;
  return { x, y, t, vx, vy, ein, eout, bt: t };
}

/** Whether corner v's two walls face each other along one line. */
function facing(E: Edge[], v: Vert): boolean {
  const a = E[v.ein], b = E[v.eout];
  return v.ein !== v.eout && Math.abs(a.nx * b.ny - a.ny * b.nx) <= PARALLEL && a.nx * b.nx + a.ny * b.ny < 0;
}

type Event = { t: number; kind: 0 | 1; r: number; i: number; s?: number; j?: number };

function nextEvent(E: Edge[], live: Vert[][], T: number, at: (v: Vert, t: number) => number[]): Event | null {
  let best: Event | null = null;
  const take = (e: Event) => { if (!best || e.t < best.t - 1e-9 || (Math.abs(e.t - best.t) <= 1e-9 && e.kind < best.kind)) best = e; };
  live.forEach((ring, r) => {
    for (let i = 0; i < ring.length; i++) {
      const u = ring[i], w = ring[(i + 1) % ring.length], e = E[u.eout];
      // a wall shrinking to nothing
      const pu = at(u, T), pw = at(w, T);
      const L = (pw[0] - pu[0]) * e.dx + (pw[1] - pu[1]) * e.dy;
      const rate = (w.vx - u.vx) * e.dx + (w.vy - u.vy) * e.dy;
      if (L <= 1e-7) take({ t: T, kind: 0, r, i });
      else if (rate < -1e-12) take({ t: T + L / -rate, kind: 0, r, i });
      // a corner pointing in running into another wall
      const a = E[u.ein], cr = a.dx * e.dy - a.dy * e.dx;
      if (cr >= -1e-9) continue;
      live.forEach((ring2, s) => {
        for (let j = 0; j < ring2.length; j++) {
          const p = ring2[j], q = ring2[(j + 1) % ring2.length];
          if (p === u || q === u) continue;
          const f = E[p.eout];
          const f0 = pu[0] * f.nx + pu[1] * f.ny - f.w * T - f.c;
          const fr = u.vx * f.nx + u.vy * f.ny - f.w;
          if (f0 < -1e-7 || fr > -1e-12) continue;
          const th = T + Math.max(0, f0) / -fr;
          if (best && th > best.t + 1e-9) continue;
          const h = at(u, th), pp = at(p, th), pq = at(q, th);
          const len = (pq[0] - pp[0]) * f.dx + (pq[1] - pp[1]) * f.dy;
          if (len <= 1e-7) continue;
          const sp = ((h[0] - pp[0]) * f.dx + (h[1] - pp[1]) * f.dy) / len;
          if (sp < -1e-6 || sp > 1 + 1e-6) continue;
          take({ t: th, kind: 1, r, i, s, j });
        }
      });
    }
  });
  return best;
}

function apply(E: Edge[], live: Vert[][], ev: Event, T: number, at: (v: Vert, t: number) => number[]): boolean {
  const ring = live[ev.r];
  if (ev.kind === 0) {
    const i = ev.i, j = (i + 1) % ring.length, u = ring[i], w = ring[j];
    const pu = at(u, T), pw = at(w, T);
    const nv = vert(E, (pu[0] + pw[0]) / 2, (pu[1] + pw[1]) / 2, T, u.ein, w.eout);
    if (!nv) return false;
    if (j === 0) { ring.splice(i, 1); ring.splice(0, 1, nv); } else ring.splice(i, 2, nv);
  } else {
    const u = ring[ev.i], s = ev.s!, ring2 = live[s], p = ring2[ev.j!], h = at(u, T);
    const r1 = vert(E, h[0], h[1], T, u.ein, p.eout), r2 = vert(E, h[0], h[1], T, p.eout, u.eout);
    if (!r1 || !r2) return false;
    const from = (a: Vert[], k: number) => a.slice(k).concat(a.slice(0, k));
    const R = from(ring, ev.i);                 // u, its next, ..., its previous
    if (s === ev.r) {
      const ia = R.indexOf(p);                   // ..., p, p's next, ...
      const one = [r1, ...R.slice(ia + 1)], two = [r2, ...R.slice(1, ia + 1)];
      live.splice(ev.r, 1, one, two);
    } else {
      const S = from(ring2, (ev.j! + 1) % ring2.length);   // p's next, ..., p
      const merged = [r1, ...S, r2, ...R.slice(1)];
      const [lo, hi] = ev.r < s ? [ev.r, s] : [s, ev.r];
      live.splice(hi, 1); live.splice(lo, 1, merged);
    }
  }
  // where a part has shrunk to a line (the two sides of a wing meeting along its ridge), the corner
  // at its tip has its two walls face to face: the line is roof already swept, so the outline goes
  // straight past it, from whichever neighbour is nearer the tip
  for (const g of live) {
    for (let n = 0; n < 4 * g.length && g.length >= 3; n++) {
      const i = g.findIndex((v) => facing(E, v));
      if (i < 0) break;
      const v = g[i], a = g[(i + g.length - 1) % g.length], b = g[(i + 1) % g.length];
      const pv = at(v, T), pa = at(a, T), pb = at(b, T);
      const nearA = Math.hypot(pa[0] - pv[0], pa[1] - pv[1]) <= Math.hypot(pb[0] - pv[0], pb[1] - pv[1]);
      const keep = nearA ? a : b, p = at(keep, T);
      const nv = nearA ? vert(E, p[0], p[1], T, a.ein, v.eout) : vert(E, p[0], p[1], T, v.ein, b.eout);
      if (!nv) return false;
      g.splice(g.indexOf(keep), 1, nv);
      g.splice(g.indexOf(v), 1);
    }
  }
  // what's shrunk to nothing goes
  for (let k = live.length - 1; k >= 0; k--) {
    const g = live[k];
    if (g.length < 3 || Math.abs(signedArea(g.map((v) => at(v, T)))) < 1e-6) live.splice(k, 1);
  }
  return true;
}

/** What's left of the outline at the roof's top, flat: each ring anticlockwise with the clockwise
 *  ones inside it as holes, cut into triangles by ear clipping after bridging the holes in. */
function flatTop(live: Vert[][], t: number, at: (v: Vert, t: number) => number[], tris: number[]): boolean {
  const rings = live.map((g) => g.map((v) => at(v, t)));
  const outers = rings.filter((g) => signedArea(g) > 1e-6), holes = rings.filter((g) => signedArea(g) < -1e-6);
  for (const o of outers) {
    let poly = o;
    for (const h of holes) if (inPoly(o, h[0][0], h[0][1])) poly = bridge(poly, h);
    const got = earClip(poly);
    if (!got) return false;
    for (const [a, b, c] of got) tri(tris, a, t, b, t, c, t);
  }
  return true;
}

function tri(out: number[], a: number[], ta: number, b: number[], tb: number, c: number[], tc: number) {
  const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  if (area <= 1e-8) return;
  out.push(a[0], a[1], ta, b[0], b[1], tb, c[0], c[1], tc);
}

function signedArea(p: number[][]): number {
  let s = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) s += p[j][0] * p[i][1] - p[i][0] * p[j][1];
  return s / 2;
}

function inPoly(p: number[][], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i], [xj, yj] = p[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Hole h (clockwise) joined into polygon p (anticlockwise) along a cut from h's rightmost point to
 *  the nearest point of p it can see, so the two can be clipped as one. */
function bridge(p: number[][], h: number[][]): number[][] {
  let hi = 0;
  for (let i = 1; i < h.length; i++) if (h[i][0] > h[hi][0]) hi = i;
  const m = h[hi];
  let best = -1, bd = Infinity;
  for (let i = 0; i < p.length; i++) {
    const d = Math.hypot(p[i][0] - m[0], p[i][1] - m[1]);
    if (d >= bd) continue;
    let clear = true;
    for (const ring of [p, h]) for (let j = 0; j < ring.length && clear; j++) {
      const a = ring[j], b = ring[(j + 1) % ring.length];
      if (a === p[i] || b === p[i] || a === m || b === m) continue;
      if (segsCross(m, p[i], a, b)) clear = false;
    }
    if (clear) { bd = d; best = i; }
  }
  if (best < 0) return p;
  const hs = h.slice(hi).concat(h.slice(0, hi));
  return [...p.slice(0, best + 1), ...hs, m, p[best], ...p.slice(best + 1)];
}

function segsCross(a: number[], b: number[], c: number[], d: number[]): boolean {
  const o = (p: number[], q: number[], r: number[]) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}

/** Polygon p (anticlockwise) as triangles, or null if it can't be cut. */
function earClip(p: number[][]): number[][][] | null {
  const idx = p.map((_, i) => i), out: number[][][] = [];
  const cross = (a: number[], b: number[], c: number[]) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  let guard = 0;
  while (idx.length > 3) {
    if (++guard > 4 * p.length * p.length + 100) return null;
    let cut = false;
    for (let i = 0; i < idx.length; i++) {
      const a = p[idx[(i + idx.length - 1) % idx.length]], b = p[idx[i]], c = p[idx[(i + 1) % idx.length]];
      if (cross(a, b, c) <= 1e-12) continue;
      let inside = false;
      for (const j of idx) {
        const q = p[j];
        if (q === a || q === b || q === c || (q[0] === a[0] && q[1] === a[1]) || (q[0] === b[0] && q[1] === b[1]) || (q[0] === c[0] && q[1] === c[1])) continue;
        if (cross(a, b, q) >= 0 && cross(b, c, q) >= 0 && cross(c, a, q) >= 0) { inside = true; break; }
      }
      if (inside) continue;
      out.push([a, b, c]);
      idx.splice(i, 1);
      cut = true;
      break;
    }
    if (!cut) {
      // only slivers left (rounding): drop a flat corner and carry on
      let k = -1;
      for (let i = 0; i < idx.length && k < 0; i++) {
        const a = p[idx[(i + idx.length - 1) % idx.length]], b = p[idx[i]], c = p[idx[(i + 1) % idx.length]];
        if (Math.abs(cross(a, b, c)) < 1e-9) k = i;
      }
      if (k < 0) return null;
      idx.splice(k, 1);
    }
  }
  if (idx.length === 3) out.push([p[idx[0]], p[idx[1]], p[idx[2]]]);
  return out;
}
