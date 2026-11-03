// What stands in a train's way, for tools/check_more.py's rule 21. It builds the railway with the
// game's own code (web/src/railway.ts) and walks every running line out in the open (and on into
// each tunnel mouth), a metre at a time, through the space a train fills: a little inside its sides
// and from just over the rails to its roof. It counts:
//  - the railway's own faces across that space (a tunnel face with no opening big enough, a
//    parapet, pier or platform wall across another track, a canopy too low);
//  - the squares' buildings, walls, fences, hedges, gates, trees and street furniture standing in it;
//  - a line that just stops out in the open, with no other track going on from it and short of the
//    edge of the map's railway (a train would run off its end).
//
// Bundled and run from web/ as watertight.ts is. Usage: node trackclear.mjs <maps root> <map id>;
// prints one JSON list of findings.
import * as THREE from "three";
import { readFileSync, existsSync, readdirSync } from "fs";
import { Railway } from "./src/railway";
import { Wide } from "./src/wide";
import { railNeed } from "./src/railbridge";
import { BARRIER_HEIGHT } from "./src/map";
import { setPieceAt } from "./src/landmarks/setpieces";

(globalThis as { __keepArrays?: boolean }).__keepArrays = true;
const [root, id] = process.argv.slice(2);
const load = (f: string) => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null);
const rail = load(`${root}/${id}-rail.json`);
if (!rail) { console.log("[]"); process.exit(0); }
const head = load(`${root}/${id}.json`) ?? {};
const wideData = load(`${root}/${id}-wide.json`);
const canal = load(`${root}/${id}-canal.json`);
const wide = wideData ? new Wide(wideData) : null;
const tracks: number[][][] = rail.tracks.map((t: { p: number[][] }) => t.p);
const need = railNeed(tracks, [...(head.rd ?? []), ...(wide?.rd ?? [])], [...(head.wl ?? []), ...(wide?.wl ?? [])],
  [...(head.wp ?? []), ...(wide?.wp ?? [])].map((w: { r: number[][][] }) => w.r[0]), canal?.runs ?? []);
const railway = new Railway(rail, new THREE.Scene(), 0, need);
const scene = (railway as unknown as { group: THREE.Group }).group;
const centre = head.centre as [number, number] | undefined;

// A train's body: this far either side of the track's middle, and these heights over the track's
// line (the rails' tops are 0.47 over it)
const SIDE = 1.25, HEIGHTS = [1.0, 2.4, 3.8];

const area = (r: number[][]) => Math.abs(r.reduce((s, q, i) => { const o = r[(i + 1) % r.length]; return s + q[0] * o[1] - o[0] * q[1]; }, 0)) / 2;
const key = (i: number, j: number) => (i + 32768) * 65536 + (j + 32768);
type Grid<T> = Map<number, T[]>;
function put<T>(g: Grid<T>, C: number, x0: number, y0: number, x1: number, y1: number, v: T) {
  for (let i = Math.floor(x0 / C); i <= Math.floor(x1 / C); i++)
    for (let j = Math.floor(y0 / C); j <= Math.floor(y1 / C); j++) {
      const k = key(i, j);
      (g.get(k) ?? g.set(k, []).get(k)!).push(v);
    }
}

// ---- the railway as drawn, less what you stand on (as watertight.ts tells it) --------------------
const WALK = ["#7b746a", "#4a3d31", "#c4c1ba", "#b5ada0", "#d9d3c6", "#c8a560", "#e9c41f", "#6f6a62"].map((h) => new THREE.Color(h));
const tv: number[] = [], tc: string[] = [];
scene.updateMatrixWorld(true);
scene.traverse((o) => {
  const m = o as THREE.Mesh;
  if (!m.isMesh || m.geometry.index || !m.geometry.getAttribute("color")) return;
  const p = m.geometry.getAttribute("position"), c = m.geometry.getAttribute("color"), w = new THREE.Vector3();
  for (let k = 0; k < p.count; k += 3) {
    if (WALK.some((h) => Math.abs(h.r - c.getX(k)) < 0.01 && Math.abs(h.g - c.getY(k)) < 0.01 && Math.abs(h.b - c.getZ(k)) < 0.01)) continue;
    for (let q = k; q < k + 3; q++) { w.fromBufferAttribute(p, q).applyMatrix4(m.matrixWorld); tv.push(w.x, -w.z, w.y); }
    tc.push(new THREE.Color(c.getX(k), c.getY(k), c.getZ(k)).getHexString());
  }
});
const RV = Float64Array.from(tv), RC = 4, RG: Grid<number> = new Map();
for (let t = 0; t < RV.length / 9; t++) {
  const o = t * 9;
  put(RG, RC, Math.min(RV[o], RV[o + 3], RV[o + 6]), Math.min(RV[o + 1], RV[o + 4], RV[o + 7]), Math.max(RV[o], RV[o + 3], RV[o + 6]), Math.max(RV[o + 1], RV[o + 4], RV[o + 7]), t);
}
function crossesRail(a: number[], b: number[]): string | null {
  const v = RV, dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const seen = new Set<number>();
  for (const q of [a, b]) for (const t of RG.get(key(Math.floor(q[0] / RC), Math.floor(q[1] / RC))) ?? []) {
    if (seen.has(t)) continue;
    seen.add(t);
    const o = t * 9;
    const e1x = v[o + 3] - v[o], e1y = v[o + 4] - v[o + 1], e1z = v[o + 5] - v[o + 2];
    const e2x = v[o + 6] - v[o], e2y = v[o + 7] - v[o + 1], e2z = v[o + 8] - v[o + 2];
    const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-12) continue;
    const sx = a[0] - v[o], sy = a[1] - v[o + 1], sz = a[2] - v[o + 2];
    const u = (sx * px + sy * py + sz * pz) / det;
    if (u < 0 || u > 1) continue;
    const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
    const w = (dx * qx + dy * qy + dz * qz) / det;
    if (w < 0 || u + w > 1) continue;
    const s = (e2x * qx + e2y * qy + e2z * qz) / det;
    if (s >= 0 && s <= 1) return tc[t];
  }
  return null;
}

// ---- the squares' solids --------------------------------------------------------------------------
type Solid = { kind: string; what?: string; ring?: number[][]; seg?: number[]; pt?: number[]; r?: number; z0: number; z1: number };
const SC = 16, SG: Grid<Solid> = new Map();
const squares: number[][] = [];
const hidden = (x: number, y: number) => !!centre && setPieceAt(centre, x, y);
const dir = `${root}/${id}`;
let tx0 = Infinity, tx1 = -Infinity, ty0 = Infinity, ty1 = -Infinity;
for (const p of tracks) for (const q of p) { tx0 = Math.min(tx0, q[0]); tx1 = Math.max(tx1, q[0]); ty0 = Math.min(ty0, q[1]); ty1 = Math.max(ty1, q[1]); }
for (const f of existsSync(dir) ? readdirSync(dir).filter((n) => /^-?\d+_-?\d+\.json$/.test(n)) : []) {
  const m = JSON.parse(readFileSync(`${dir}/${f}`, "utf8"));
  if (!m.b) continue;
  const [bx0, by0, bx1, by1] = m.b;
  squares.push(m.b);
  if (bx1 < tx0 - 50 || bx0 > tx1 + 50 || by1 < ty0 - 50 || by0 > ty1 + 50) continue;
  if (!tracks.some((p) => p.some((q) => q[0] > bx0 - 30 && q[0] < bx1 + 30 && q[1] > by0 - 30 && q[1] < by1 + 30))) continue;
  for (const b of m.bl ?? []) {
    const ring: number[][] = b.r[0], xs = ring.map((q) => q[0]), ys = ring.map((q) => q[1]);
    const mx = xs.reduce((s, x) => s + x, 0) / xs.length, my = ys.reduce((s, y) => s + y, 0) / ys.length;
    if (hidden(mx, my)) continue;
    put(SG, SC, Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), { kind: "building", what: `${b.c} ${Math.round(area(ring))} m2, ${b.h.toFixed(1)} m to its eaves`, ring, z0: b.g - 0.5, z1: b.g + b.h + (b.rp ?? 0) });
  }
  for (const l of m.br ?? []) {
    const h = l.h ?? BARRIER_HEIGHT[l.c] ?? 1.5;
    for (let k = 0; k + 1 < l.p.length; k++) {
      const a = l.p[k], c = l.p[k + 1];
      put(SG, SC, Math.min(a[0], c[0]), Math.min(a[1], c[1]), Math.max(a[0], c[0]), Math.max(a[1], c[1]),
        { kind: l.c, seg: [a[0], a[1], c[0], c[1]], z0: Math.min(a[2], c[2]) - 0.3, z1: Math.max(a[2], c[2]) + h });
    }
  }
  for (const g of m.gt ?? []) {
    if (g[5] === "open") continue;
    put(SG, SC, Math.min(g[0], g[2]), Math.min(g[1], g[3]), Math.max(g[0], g[2]), Math.max(g[1], g[3]),
      { kind: "gate", seg: [g[0], g[1], g[2], g[3]], z0: g[4] - 0.3, z1: g[4] + (BARRIER_HEIGHT[g[5]] ?? 1) + 0.2 });
  }
  for (const t of m.tr ?? []) put(SG, SC, t[0], t[1], t[0], t[1], { kind: "tree", pt: [t[0], t[1]], r: 0.4, z0: t[2] - 0.3, z1: t[2] + 3 * (t[3] ?? 2) });
  for (const x of m.fx ?? []) {
    if (typeof x[1] !== "number") continue;
    const r = x[0] === "car" ? 1.0 : 0.25;
    put(SG, SC, x[1], x[2], x[1], x[2], { kind: x[0], pt: [x[1], x[2]], r, z0: x[3] - 0.3, z1: x[3] + (x[0] === "car" ? 1.5 : 2.5) });
  }
}
const inSquares = (x: number, y: number) => squares.some((b) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]);
const inRing = (r: number[][], x: number, y: number) => {
  let o = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++)
    if ((r[i][1] > y) !== (r[j][1] > y) && x < ((r[j][0] - r[i][0]) * (y - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) o = !o;
  return o;
};
const segsCross = (a: number[], b: number[], c: number[], d: number[]) => {
  const o = (p: number[], q: number[], r: number[]) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
};
const segDist = (a: number[], b: number[], x: number, y: number) => {
  const vx = b[0] - a[0], vy = b[1] - a[1], l2 = vx * vx + vy * vy || 1;
  const f = Math.min(1, Math.max(0, ((x - a[0]) * vx + (y - a[1]) * vy) / l2));
  return Math.hypot(a[0] + vx * f - x, a[1] + vy * f - y);
};
/** What of the squares stands in a train's way between data points a and b (both [x, y, z of the
 *  track]): the first solid's kind, or null. */
function solidIn(a: number[], b: number[], nx: number, ny: number): Solid | null {
  const lo = Math.min(a[2], b[2]) + HEIGHTS[0], hi = Math.max(a[2], b[2]) + HEIGHTS[HEIGHTS.length - 1];
  const seen = new Set<Solid>();
  for (const q of [a, b]) for (const s of SG.get(key(Math.floor(q[0] / SC), Math.floor(q[1] / SC))) ?? []) {
    if (seen.has(s)) continue;
    seen.add(s);
    if (s.z1 < lo || s.z0 > hi) continue;
    if (s.ring) {
      for (const off of [-SIDE, 0, SIDE]) for (const p of [a, b]) if (inRing(s.ring, p[0] + nx * off, p[1] + ny * off)) return s;
    } else if (s.seg) {
      const c = [s.seg[0], s.seg[1]], d = [s.seg[2], s.seg[3]];
      for (const off of [-SIDE, 0, SIDE]) if (segsCross([a[0] + nx * off, a[1] + ny * off], [b[0] + nx * off, b[1] + ny * off], c, d)) return s;
      if (segsCross([a[0] - nx * SIDE, a[1] - ny * SIDE], [a[0] + nx * SIDE, a[1] + ny * SIDE], c, d)) return s;
    } else if (s.pt) {
      const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      if (segDist(a, b, s.pt[0], s.pt[1]) < SIDE + s.r! && Math.hypot(m[0] - s.pt[0], m[1] - s.pt[1]) < 1 + SIDE + s.r!) return s;
    }
  }
  return null;
}
/** Wide buildings in a train's way, beyond the squares. */
function wideIn(a: number[], nx: number, ny: number): string | null {
  if (!wide || inSquares(a[0], a[1])) return null;
  for (const b of wide.buildingsNear(a[0], a[1], SIDE + 1)) {
    if (b.g + b.h < a[2] + HEIGHTS[0] || b.g - 0.5 > a[2] + HEIGHTS[HEIGHTS.length - 1]) continue;
    for (const off of [-SIDE, 0, SIDE]) if (inRing(b.r[0], a[0] + nx * off, a[1] + ny * off)) return `${b.c} ${Math.round(area(b.r[0]))} m2, ${b.h.toFixed(1)} m to its eaves`;
  }
  return null;
}

/** Which of the railway's own works is at data (x, y), for telling them apart in the findings. */
function railPart(x: number, y: number): string {
  if ((rail.portals ?? []).some((q: number[]) => Math.hypot(q[0] - x, q[1] - y) < 14)) return "tunnel face";
  if ((rail.canopies ?? []).some((c: { r: number[][]; t?: number }) => !c.t && inRing(c.r, x, y))) return "canopy";
  if ((rail.platforms ?? []).some((p: { r: number[][] }) => inRing(p.r, x, y) || p.r.some((q, i) => segDist(q, p.r[(i + 1) % p.r.length], x, y) < 3))) return "platform";
  return "bridge";
}

// ---- walking the lines ------------------------------------------------------------------------------
type Find = { rule: string; x: number; y: number; score: number; what: string };
const found = new Map<string, Find & { n: number }>();
const note = (rule: string, x: number, y: number, what: string) => {
  const k = `${rule}|${Math.floor(x / 10)},${Math.floor(y / 10)}`;
  const f = found.get(k);
  if (f) { f.n++; f.score = f.n; f.what = `${what}, ${f.n} m of track`; return; }
  found.set(k, { rule, x, y, score: 1, what: `${what}, 1 m of track`, n: 1 });
};
for (let t = 0; t < tracks.length; t++) {
  const p = tracks[t];
  for (let k = 0; k + 1 < p.length; k++) {
    const a = p[k], b = p[k + 1];
    if (a[3] === 2 && b[3] === 2) continue;
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
    // a stretch going into a tunnel is walked to its mouth (halfway, as railway.py places it) and a
    // little on, through the face's opening
    let f0 = 0, f1 = 1;
    if (a[3] === 2) f0 = Math.max(0, 0.5 - 1.5 / l);
    if (b[3] === 2) f1 = Math.min(1, 0.5 + 1.5 / l);
    const at = (f: number) => [a[0] + dx * f, a[1] + dy * f, a[2] + (b[2] - a[2]) * f];
    const n = Math.max(1, Math.ceil((l * (f1 - f0)) / 1));
    for (let u = 0; u < n; u++) {
      const A = at(f0 + ((f1 - f0) * u) / n), B = at(f0 + ((f1 - f0) * (u + 1)) / n), M = at(f0 + ((f1 - f0) * (u + 0.5)) / n);
      let rail: string | null = null;
      for (const off of [-SIDE, 0, SIDE]) for (const h of HEIGHTS)
        rail ??= crossesRail([A[0] + nx * off, A[1] + ny * off, A[2] + h], [B[0] + nx * off, B[1] + ny * off, B[2] + h]);
      if (rail && railway.buffers.some((q) => Math.hypot(q[0] - M[0], q[1] - M[1]) < 3)) rail = null;   // (what a train stops at)
      if (rail) note(`21 track runs into something solid: the railway's own ${railPart(M[0], M[1])}`, M[0], M[1], `a face of the railway (#${rail}) across the line`);
      const s = solidIn(A, B, nx, ny), w = s ? null : wideIn(M, nx, ny);
      if (s) note(`21 track runs into something solid: ${s.kind === "building" ? "building" : s.kind === "tree" ? "tree" : /wall|fence|hedge|railing|gate|palisade|guard/.test(s.kind) ? "wall or fence" : "small thing"}`, M[0], M[1], `${s.what ?? s.kind} across the line`);
      else if (w) note("21 track runs into something solid: building", M[0], M[1], `the wider map's ${w} across the line`);
    }
  }
}
// a line's end with no track going on from it, out in the open short of the edge of the map's railway
const reach = Math.max(...tracks.flatMap((p) => p.map((q) => Math.hypot(q[0], q[1]))));
const ends: number[][] = [];
for (const p of tracks) for (const q of [p[0], p[p.length - 1]]) ends.push(q);
const all = tracks.flatMap((p, t) => p.map((q) => [q[0], q[1], t]));
tracks.forEach((p, t) => {
  for (const [q, r] of [[p[0], p[1]], [p[p.length - 1], p[p.length - 2]]]) {
    if (q[3] === 2) continue;
    if (all.some((o) => o[2] !== t && Math.hypot(o[0] - q[0], o[1] - q[1]) < 2.5)) continue;
    if (Math.hypot(q[0], q[1]) > reach - 40) continue;
    if (railway.buffers.some((s) => Math.hypot(s[0] - q[0], s[1] - q[1]) < 3)) continue;
    found.set(`end|${q[0]},${q[1]}`, { rule: "21 track ends with nothing at its end", x: q[0], y: q[1], score: 1, what: `the line stops ${q[3] === 1 ? "on a bridge " : ""}with no buffers (going ${Math.round(Math.atan2(q[1] - r[1], q[0] - r[0]) * 180 / Math.PI)} degrees)`, n: 1 });
  }
});
console.log(JSON.stringify([...found.values()].map(({ n: _n, ...f }) => f)));
