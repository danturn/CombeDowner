// The ground as one sheet with the street, pavement and path faces (`gs`, written by
// tools/partition/sheet.py; drawn with ?ground=sheet). Every grid cell a face's free edge passes
// through is cut along those edges, and only what lies outside the faces is drawn, filled between the
// cell's corners and the edges at the height the ground meets each face there; a cell wholly under
// faces draws no ground. Built as a square loads, from its `sf` and `gs`: world.ts draws the fill with
// the grid and stands you on it. The checks build the same with tools/partition/sheet.py's `Land`.
// Nothing here goes over the network.
import { ShapeUtils, Vector2 } from "three";

export interface SheetGrid { x0: number; y0: number; dx: number; dy: number; nx: number; ny: number }

/** A free edge's ends (data x, y) and the ground's height where it meets the face there, its land on the right. */
export interface FreeEdges { ax: Float64Array; ay: Float64Array; ah: Float64Array; bx: Float64Array; by: Float64Array; bh: Float64Array; n: number }

export interface Sheet {
  /** Each cell: 0 the grid's two triangles, 1 under faces (no ground), 2 cut along the faces' edges. */
  state: Uint8Array;
  /** The fill's own points: data x, y, and scene height. */
  px: Float64Array; py: Float64Array; ph: Float64Array;
  /** The fill's triangles, three point numbers each: a grid point's own, or the grid's count plus a fill point's. */
  tri: Int32Array;
  /** Each cell's triangles are tri[3 * start[c] .. 3 * start[c + 1]]. */
  start: Int32Array;
}

/** The cells gs marks as under faces (wholly, or at their south-west corner where a free edge
 *  crosses them), from `gs.c`'s run lengths. */
export function coveredCells(runs: ArrayLike<number>, cells: number): Uint8Array {
  const out = new Uint8Array(cells);
  let at = 0, on = false;
  for (let k = 0; k < runs.length; k++) { if (on) out.fill(1, at, Math.min(cells, at + runs[k])); at += runs[k]; on = !on; }
  return out;
}

interface Piece { sx: number; sy: number; sh: number; ex: number; ey: number; eh: number; used: boolean }
interface Pt { x: number; y: number; h: number; k: number }   // k: a grid point's number, or -1

/** Cut every cell the free edges cross, and fill what lies outside the faces. `corner` is each grid
 *  point's scene height, `covered` the cells gs marks as under faces. */
export function buildSheet(G: SheetGrid, corner: (k: number) => number, covered: Uint8Array, E: FreeEdges, odd: ArrayLike<number> = []): Sheet {
  const { x0, y0, dx, dy, nx, ny } = G, cw = nx - 1, ch = ny - 1;
  const lineX = (i: number) => x0 + i * dx, lineY = (j: number) => y0 + j * dy;
  const X1 = lineX(cw), Y1 = lineY(ch);
  const byCell = new Map<number, Piece[]>();
  for (let s = 0; s < E.n; s++) {
    let ax = E.ax[s], ay = E.ay[s], ah = E.ah[s], bx = E.bx[s], by = E.by[s], bh = E.bh[s];
    // (clipped to the grid: a face at the square's edge reaches a few millimetres past its last line)
    const ex = bx - ax, ey = by - ay;
    let t0 = 0, t1 = 1;
    const clip = (p: number, q: number) => { if (p === 0) return q >= 0; const r = q / p; if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; } return true; };
    if (!clip(-ex, ax - x0) || !clip(ex, X1 - ax) || !clip(-ey, ay - y0) || !clip(ey, Y1 - ay) || t1 - t0 < 1e-12) continue;
    const P = (t: number) => [ax + ex * t, ay + ey * t, ah + (bh - ah) * t];
    if (t0 > 0 || t1 < 1) {
      const a = P(t0), b = P(t1);
      // (a clipped end lies on the grid's edge exactly, so it counts as on its cell's edge)
      const snap = (q: number[]) => { if (Math.abs(q[0] - x0) < 1e-9) q[0] = x0; if (Math.abs(q[0] - X1) < 1e-9) q[0] = X1; if (Math.abs(q[1] - y0) < 1e-9) q[1] = y0; if (Math.abs(q[1] - Y1) < 1e-9) q[1] = Y1; };
      if (t0 > 0) snap(a);
      if (t1 < 1) snap(b);
      [ax, ay, ah, bx, by, bh] = [a[0], a[1], a[2], b[0], b[1], b[2]];
    }
    const fx0 = (ax - x0) / dx, fx1 = (bx - x0) / dx, fy0 = (ay - y0) / dy, fy1 = (by - y0) / dy;
    // where it crosses each grid line, each crossing put exactly on its line, so both cells get the same point
    const cuts: number[][] = [[ax, ay, ah, 0]];
    for (let i = Math.ceil(Math.min(fx0, fx1)); i <= Math.floor(Math.max(fx0, fx1)); i++) {
      const lx = lineX(i);
      if (lx === ax || lx === bx || bx === ax) continue;
      const t = (lx - ax) / (bx - ax);
      if (t > 0 && t < 1) cuts.push([lx, ay + (by - ay) * t, ah + (bh - ah) * t, t]);
    }
    for (let j = Math.ceil(Math.min(fy0, fy1)); j <= Math.floor(Math.max(fy0, fy1)); j++) {
      const ly = lineY(j);
      if (ly === ay || ly === by || by === ay) continue;
      const t = (ly - ay) / (by - ay);
      if (t > 0 && t < 1) cuts.push([ax + (bx - ax) * t, ly, ah + (bh - ah) * t, t]);
    }
    cuts.push([bx, by, bh, 1]);
    cuts.sort((p, q) => p[3] - q[3]);
    for (let k = 0; k + 1 < cuts.length; k++) {
      const p = cuts[k], q = cuts[k + 1];
      if (p[0] === q[0] && p[1] === q[1]) continue;
      const mi = Math.min(cw - 1, Math.max(0, Math.floor(((p[0] + q[0]) / 2 - x0) / dx)));
      const mj = Math.min(ch - 1, Math.max(0, Math.floor(((p[1] + q[1]) / 2 - y0) / dy)));
      const c = mj * cw + mi;
      let list = byCell.get(c);
      if (!list) byCell.set(c, (list = []));
      list.push({ sx: p[0], sy: p[1], sh: p[2], ex: q[0], ey: q[1], eh: q[2], used: false });
    }
  }

  const state = new Uint8Array(cw * ch);
  for (let c = 0; c < state.length; c++) if (covered[c] && !byCell.has(c)) state[c] = 1;
  // (where faces overlap, the cell is drawn whole, gs says how: cut, it would fill the wrong side of an edge)
  for (let k = 0; k < odd.length; k++) { byCell.delete(odd[k]); state[odd[k]] = covered[odd[k]] ? 1 : 0; }
  const px: number[] = [], py: number[] = [], ph: number[] = [], tri: number[] = [];
  const own = new Map<string, number>();
  const NG = nx * ny;
  const point = (q: Pt) => {
    if (q.k >= 0) return q.k;
    const key = `${q.x},${q.y}`;
    let k = own.get(key);
    if (k === undefined) { own.set(key, (k = px.length)); px.push(q.x); py.push(q.y); ph.push(q.h); }
    return NG + k;
  };
  const cellTris = new Map<number, number[]>();
  for (const [c, pieces] of byCell) {
    const i = c % cw, j = (c - i) / cw;
    const xa = lineX(i), xb = lineX(i + 1), ya = lineY(j), yb = lineY(j + 1);
    const corners: Pt[] = [
      { x: xa, y: ya, h: corner(j * nx + i), k: j * nx + i }, { x: xa, y: yb, h: corner((j + 1) * nx + i), k: (j + 1) * nx + i },
      { x: xb, y: yb, h: corner((j + 1) * nx + i + 1), k: (j + 1) * nx + i + 1 }, { x: xb, y: ya, h: corner(j * nx + i + 1), k: j * nx + i + 1 },
    ];
    const tris = fillCell(pieces, xa, xb, ya, yb, corners, !!covered[c]);
    if (!tris) continue;          // (cut it couldn't be: the grid's two triangles are drawn)
    state[c] = 2;
    const out: number[] = [];
    for (const q of tris) out.push(point(q));
    cellTris.set(c, out);
  }
  const start = new Int32Array(state.length + 1);
  for (let c = 0; c < state.length; c++) {
    start[c] = tri.length / 3;
    const t = cellTris.get(c);
    if (t) for (const k of t) tri.push(k);
  }
  start[state.length] = tri.length / 3;
  return { state, px: Float64Array.from(px), py: Float64Array.from(py), ph: Float64Array.from(ph), tri: Int32Array.from(tri), start };
}

/** One cell's fill as triangles (three points each), or null if its edges don't close up. The cell's
 *  edge is walked clockwise (south-west, north-west, north-east, south-east) with the open ground on
 *  the right, as the faces' free edges have it. */
function fillCell(pieces: Piece[], xa: number, xb: number, ya: number, yb: number, corners: Pt[], under: boolean): Pt[] | null {
  const W = xb - xa, Hh = yb - ya;
  const onEdge = (x: number, y: number) => x === xa || x === xb || y === ya || y === yb;
  // how far round the cell's edge, clockwise from the south-west corner: 0 to 4, a side each
  const round = (x: number, y: number) => x === xa ? (y - ya) / Hh : y === yb ? 1 + (x - xa) / W : x === xb ? 2 + (yb - y) / Hh : 3 + (xb - x) / W;
  const along = [[0, 1], [1, 0], [0, -1], [-1, 0]];
  const startsAt = new Map<string, Piece[]>();
  for (const p of pieces) { const k = `${p.sx},${p.sy}`; (startsAt.get(k) ?? startsAt.set(k, []).get(k)!).push(p); }
  // of the ways on from a point, the one that keeps the open ground on the right: the first turning
  // anticlockwise from straight back the way it came
  const turn = (bx: number, by: number, ox: number, oy: number) => {
    let a = Math.atan2(oy, ox) - Math.atan2(by, bx);
    while (a <= 1e-12) a += 2 * Math.PI;
    return a;
  };
  const nextFrom = (p: Piece, also: [number, number] | null): Piece | "edge" | null => {
    const bx = p.sx - p.ex, by = p.sy - p.ey;
    let best: Piece | "edge" | null = null, bestA = Infinity;
    for (const q of startsAt.get(`${p.ex},${p.ey}`) ?? []) {
      if (q.used && q !== first) continue;
      const a = turn(bx, by, q.ex - q.sx, q.ey - q.sy);
      if (a < bestA) { bestA = a; best = q; }
    }
    if (also) { const a = turn(bx, by, also[0], also[1]); if (a < bestA) best = "edge"; }
    return best;
  };
  const entries = pieces.filter((p) => onEdge(p.sx, p.sy)).map((p) => ({ p, s: round(p.sx, p.sy) })).sort((a, b) => a.s - b.s);
  const outers: Pt[][] = [], loops: Pt[][] = [];
  let first: Piece | null = null;
  const pt = (x: number, y: number, h: number): Pt => ({ x, y, h, k: -1 });
  for (const e of entries) {
    if (e.p.used) continue;
    first = e.p;
    const ring: Pt[] = [];
    let p = e.p, guard = 0;
    for (;;) {
      if (++guard > 100000) return null;
      p.used = true;
      ring.push(pt(p.sx, p.sy, p.sh));
      if (!onEdge(p.ex, p.ey)) {
        const q = nextFrom(p, null);
        if (!q || q === "edge") return null;
        if (q === first) break;
        p = q;
        continue;
      }
      ring.push(pt(p.ex, p.ey, p.eh));
      const s = round(p.ex, p.ey), side = Math.min(3, Math.floor(s));
      const q = nextFrom(p, along[side] as [number, number]);
      if (q && q !== "edge") { if (q === first) break; p = q; continue; }
      // round the cell's edge clockwise to the next way in, taking the corners passed
      let to: { p: Piece; s: number } | null = null, gap = Infinity;
      for (const f of entries) {
        if (f.p.used && f.p !== first) continue;
        let g = f.s - s;
        if (g <= 0) g += 4;
        if (g < gap) { gap = g; to = f; }
      }
      if (!to) return null;
      for (let m = 1; m <= 4; m++) {
        const k = Math.floor(s) + m, g = k - s;
        if (g > 0 && g < gap) ring.push(corners[k % 4]);
      }
      if (to.p === first) break;
      p = to.p;
    }
    outers.push(tidy(ring));
  }
  // what is left is closed loops inside the cell: clockwise, open ground inside (an island of it);
  // anticlockwise, a face standing in the open ground (a hole in it)
  const holes: Pt[][] = [];
  for (const p0 of pieces) {
    if (p0.used) continue;
    first = p0;
    const ring: Pt[] = [];
    let p = p0, guard = 0;
    for (;;) {
      if (++guard > 100000) return null;
      p.used = true;
      ring.push(pt(p.sx, p.sy, p.sh));
      if (onEdge(p.ex, p.ey)) return null;
      const q = nextFrom(p, null);
      if (!q || q === "edge") return null;
      if (q === first) break;
      p = q;
    }
    (area(ring) < 0 ? loops : holes).push(ring);
  }
  for (const l of loops) outers.push(l);
  // (with no way in from the cell's edge, the cell round the loops is open ground unless its corner is
  // under a face: then a loop with a face inside is one face overlapping another, not a hole in ground)
  if (!entries.length && !under && holes.some((h) => !outers.some((o) => inside(middle(h), o)))) outers.push(corners.slice());
  const out: Pt[] = [];
  for (const o of outers) {
    if (o.length < 3) continue;
    const mine = holes.filter((h) => inside(middle(h), o));
    const all = [o, ...mine].flat();
    const faces = ShapeUtils.triangulateShape(o.map((q) => new Vector2(q.x - xa, q.y - ya)), mine.map((h) => h.map((q) => new Vector2(q.x - xa, q.y - ya))));
    for (const f of faces) for (const k of f) out.push(all[k]);
  }
  return out;
}

/** A ring with no point twice in a row. */
function tidy(ring: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const q of ring) { const o = out[out.length - 1]; if (!o || o.x !== q.x || o.y !== q.y) out.push(q); }
  while (out.length > 1 && out[0].x === out[out.length - 1].x && out[0].y === out[out.length - 1].y) out.pop();
  return out;
}

function middle(r: Pt[]): Pt {
  let x = 0, y = 0;
  for (const q of r) { x += q.x; y += q.y; }
  return { x: x / r.length, y: y / r.length, h: 0, k: -1 };
}

function area(r: Pt[]) {
  let a = 0;
  for (let k = 0; k < r.length; k++) { const p = r[k], q = r[(k + 1) % r.length]; a += p.x * q.y - q.x * p.y; }
  return a / 2;
}

function inside(p: Pt, r: Pt[]) {
  let c = false;
  for (let k = 0, m = r.length - 1; k < r.length; m = k++) {
    const a = r[k], b = r[m];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

/** The fill's height at data (x, y) in cell c, or NaN where no fill triangle covers it (under a face).
 *  `grid(k)` is a grid point's scene height. */
export function fillAt(S: Sheet, G: SheetGrid, grid: (k: number) => number, c: number, x: number, y: number): number {
  const T = S.tri, NG = G.nx * G.ny;
  const X = (k: number) => k >= NG ? S.px[k - NG] : G.x0 + (k % G.nx) * G.dx;
  const Y = (k: number) => k >= NG ? S.py[k - NG] : G.y0 + Math.floor(k / G.nx) * G.dy;
  const Z = (k: number) => k >= NG ? S.ph[k - NG] : grid(k);
  for (let t = S.start[c]; t < S.start[c + 1]; t++) {
    const a = T[3 * t], b = T[3 * t + 1], d = T[3 * t + 2];
    const ax = X(a), ay = Y(a), bx = X(b), by = Y(b), cx = X(d), cy = Y(d);
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(den) < 1e-12) continue;
    const wa = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / den, wb = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / den, wc = 1 - wa - wb;
    if (wa < -1e-7 || wb < -1e-7 || wc < -1e-7) continue;
    return wa * Z(a) + wb * Z(b) + wc * Z(d);
  }
  return NaN;
}

const KINDS = ["road", "service", "pave", "path", "front", "drive", "grass", "dirt", "gravel"] as const;
const OUTLINE_LIFT: Record<string, number> = { road: 0.07, pave: 0.17, path: 0.04, front: 0.04, drive: 0.04, plaza: 0.04 };
const SEAM = 0.006;   // metres: a face's edge this near the square's edge runs along it, to the next square

/** The faces as the sheet meets them (tools/partition/sheet.py Faces): each corner's spot (corners at
 *  one place, a path's and a pavement's, share one), the free edges where a face meets open ground,
 *  and the scene height the ground meets each spot at: the lowest top of the faces there, or the foot
 *  or top of its retaining wall. `lift` is each kind's lift over its written height (world.ts FACE_LIFT). */
export function sheetFaces(sf: NonNullable<import("./map").MapData["sf"]>, gs: NonNullable<import("./map").MapData["gs"]>, bounds: number[], Z0: number, lift: number[]) {
  const V = sf.v, NP = V.length / 3;
  const spot = new Int32Array(NP), spots = new Map<string, number>();
  for (let i = 0; i < NP; i++) { const k = `${V[3 * i]},${V[3 * i + 1]}`, s = spots.get(k); if (s === undefined) spots.set(k, spot[i] = i); else spot[i] = s; }
  const kindOf = new Map<number, number>();
  KINDS.forEach((kind, n) => {
    const T = sf[kind] ?? [];
    for (let k = 0; k + 2 < T.length; k += 3) for (let m = 0; m < 3; m++) {
      const a = T[k + m], b = T[k + (m + 1) % 3];
      kindOf.set(Math.min(a, b) * NP + Math.max(a, b), n);
    }
  });
  const owner = new Set<number>();
  for (const e of sf.e) for (let k = 0; k + 1 < e.i.length; k++) owner.add(spot[e.i[k]] * NP + spot[e.i[k + 1]]);
  const [x0, y0, x1, y1] = bounds;
  const along = (a: number, b: number, c: number) => Math.abs(a - c) < SEAM && Math.abs(b - c) < SEAM;
  const onSeam = (a: number, b: number) => along(V[3 * a], V[3 * b], x0) || along(V[3 * a], V[3 * b], x1) || along(V[3 * a + 1], V[3 * b + 1], y0) || along(V[3 * a + 1], V[3 * b + 1], y1);
  const fa: number[] = [], fb: number[] = [], ta: number[] = [], tb: number[] = [];
  const top = new Float64Array(NP).fill(Infinity);
  const spike = (a: number, b: number, c: number) => {
    const ux = V[3 * b] - V[3 * a], uy = V[3 * b + 1] - V[3 * a + 1], vx = V[3 * c] - V[3 * b], vy = V[3 * c + 1] - V[3 * b + 1];
    return ux * vx + uy * vy < 0 && Math.abs(ux * vy - uy * vx) <= 1e-3 * Math.hypot(ux, uy) * Math.hypot(vx, vy);
  };
  for (const e of sf.e) {
    const run: [number, number, number][] = [];
    for (let k = 0; k + 1 < e.i.length; k++) {
      const a = e.i[k], b = e.i[k + 1];
      if (spot[a] === spot[b] || owner.has(spot[b] * NP + spot[a]) || onSeam(a, b)) continue;
      const n = kindOf.get(Math.min(a, b) * NP + Math.max(a, b));
      run.push([a, b, n !== undefined ? lift[n] : OUTLINE_LIFT[e.c] ?? 0.07]);
      // (an outline running out and straight back along itself, a spike of no width, is the one edge left over)
      while (run.length > 1 && run[run.length - 2][1] === run[run.length - 1][0] && spike(run[run.length - 2][0], run[run.length - 1][0], run[run.length - 1][1])) {
        const [a0, , l0] = run[run.length - 2], [, b1] = run[run.length - 1];
        run.length -= 2;
        if (spot[a0] !== spot[b1]) run.push([a0, b1, l0]);
      }
    }
    for (const [a, b, l] of run) {
      const za = V[3 * a + 2] - Z0 + l, zb = V[3 * b + 2] - Z0 + l;
      fa.push(a); fb.push(b); ta.push(za); tb.push(zb);
      top[spot[a]] = Math.min(top[spot[a]], za); top[spot[b]] = Math.min(top[spot[b]], zb);
    }
  }
  for (let k = 0; k < gs.s.length; k++) if (top[gs.s[k]] < Infinity) top[gs.s[k]] += gs.sz[k] / 100;
  const n = fa.length;
  const E: FreeEdges = { ax: new Float64Array(n), ay: new Float64Array(n), ah: new Float64Array(n), bx: new Float64Array(n), by: new Float64Array(n), bh: new Float64Array(n), n };
  for (let k = 0; k < n; k++) {
    const a = fa[k], b = fb[k];
    E.ax[k] = V[3 * a]; E.ay[k] = V[3 * a + 1]; E.ah[k] = top[spot[a]];
    E.bx[k] = V[3 * b]; E.by[k] = V[3 * b + 1]; E.bh[k] = top[spot[b]];
  }
  /** The scene height the ground meets corner i at, or Infinity off the free edges. */
  const meets = (i: number) => top[spot[i]];
  return { edges: E, meets, onSeam, spot };
}

/** The grid's heights (decimetres) with the sheet's carving: the grid points beside the faces cut down
 *  or built up to meet them. */
export function carved(h: ArrayLike<number>, gs: NonNullable<import("./map").MapData["gs"]>): Float32Array {
  const out = Float32Array.from(h);
  for (let k = 0; k < gs.h.length; k++) out[gs.h[k]] += gs.hz[k];
  return out;
}

/** For each grid point within `reach` of a free edge, the height of that edge's nearest point (scene
 *  height; the lowest, where there are several), and Infinity elsewhere: what the faces ask of the
 *  ground beside them, for the rules that leave it alone there. */
export function nearFaces(E: FreeEdges, G: SheetGrid, reach: number): Float32Array {
  const out = new Float32Array(G.nx * G.ny).fill(Infinity);
  for (let e = 0; e < E.n; e++) {
    const ax = E.ax[e], ay = E.ay[e], bx = E.bx[e], by = E.by[e], vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1;
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - reach - G.x0) / G.dx)), i1 = Math.min(G.nx - 1, Math.ceil((Math.max(ax, bx) + reach - G.x0) / G.dx));
    const j0 = Math.max(0, Math.floor((Math.min(ay, by) - reach - G.y0) / G.dy)), j1 = Math.min(G.ny - 1, Math.ceil((Math.max(ay, by) + reach - G.y0) / G.dy));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = G.x0 + i * G.dx, y = G.y0 + j * G.dy, u = Math.min(1, Math.max(0, ((x - ax) * vx + (y - ay) * vy) / l2));
      if (Math.hypot(x - ax - vx * u, y - ay - vy * u) >= reach) continue;
      const v = j * G.nx + i, h = E.ah[e] + (E.bh[e] - E.ah[e]) * u;
      if (h < out[v]) out[v] = h;
    }
  }
  return out;
}
