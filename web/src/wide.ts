// The wider map round the detailed one: the whole of Bath (built by tools/prep_wide.py into
// public/maps/<id>-wide.json). It is simpler than the detailed map: terrain on a 12 m grid,
// buildings guessed from their footprints, roads, water and trees, but no gardens, walls, street
// furniture or doors yet. outskirts.ts draws it in squares round the player as they go.
//
// Nothing about it goes over the network: every player loads the same file and, as everywhere
// else, moves and collides themselves (GameMap asks this for ground, roofs, walls and trunks
// outside the detailed map).
//
// Data coordinates are metres east (x) and north (y) of the detailed map's centre, as there.
// Lengths in the file are whole decimetres, and each point of a line or ring after the first is
// given relative to the one before.
import type { Building, Line, Place, Pond, RayHit, Road } from "./map";

/**
 * The file. Each building in bl is a flat list:
 *   ground, eaves, fall across the footprint, kind, wall, roof covering, windows (0/1), parapet,
 *   storeys (0: as usual), number of rings, then each ring as its point count and points;
 *   then 1 and a pitched roof (rise, hip at each end, middle x, y, ridge angle in milliradians,
 *   length along the ridge, width), or 0 for a flat roof; then the chimney count and stacks.
 * Each road in rd: class (an index into cl), name (into nm), 1 if it's on a bridge (its points
 * then carry their heights as well: x, y, z), then its points. Each pond or river piece in wp:
 * the water's level, the number of rings, then the rings. Each stream in wl: its points. Trees
 * are three 16-bit numbers each (x and y in half metres, size in hundredths) in base64.
 */
export interface WideData {
  id: string; release: string; field: number; fc: [number, number]; r: number;
  core: [number, number, number, number];         // the detailed map's data box: everything inside it is its
  t: { nx: number; ny: number; x0: number; y0: number; dx: number; z0: number; cs: number; ci: [number, number, number]; h: string; k: string };
  cl: string[]; nm: string[]; bl: number[][]; rd: number[][]; wp: number[][]; wl: number[][]; tr: string; pl: Place[];
  lm?: (number | string)[][];                     // landmarks out in Bath (tools/landmarks/<map>_bath.py), as in MapData
}

export interface WideRoad extends Road { bridge: boolean }
export interface WideChunk { ci: number; cj: number; bl: number[]; rd: number[]; wp: number[]; wl: number[]; tr: number[] }

const KINDS = ["detached", "semi", "terrace", "outbuilding", "shop", "institution", "flats", "church"];
const WALLS = ["s", "k", "y", "r", "c"], COVERS = ["s", "p", "c", "g"];
const CELL = 16;          // the collision grid's squares, metres
const PATH = new Set(["footway", "steps", "cycleway", "path", "pedestrian", "bridleway", "track"]);

const bytes = (b64: string) => { const s = atob(b64), a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; };
const ckey = (i: number, j: number) => (i + 4096) * 8192 + (j + 4096);

/** Points of a packed line starting at k: n numbers per point, the first absolute, the rest relative. */
function unpack(f: number[], k: number, count: number, n: number): number[][] {
  const out: number[][] = [];
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < count; i++, k += n) {
    if (i === 0) { x = f[k]; y = f[k + 1]; z = n > 2 ? f[k + 2] : 0; } else { x += f[k]; y += f[k + 1]; if (n > 2) z += f[k + 2]; }
    out.push(n > 2 ? [x / 10, y / 10, z / 10] : [x / 10, y / 10]);
  }
  return out;
}

export class Wide {
  readonly d: WideData;
  /** Force field radius and centre (data coords). */
  readonly field: number; readonly fx: number; readonly fy: number;
  /** The detailed map's box, data coords. */
  readonly core: [number, number, number, number];
  // terrain grid: heights in metres above the detailed map's z0 (scene Y), and ground types
  readonly nx: number; readonly ny: number; readonly x0: number; readonly y0: number; readonly dx: number;
  readonly h: Float32Array; readonly k: Uint8Array;
  /** Wide cells per chunk side, and a chunk's size in metres. */
  readonly cs: number; readonly size: number;
  readonly bl: Building[] = []; readonly rd: WideRoad[] = []; readonly wp: Pond[] = []; readonly wl: Line[] = [];
  /** Trees: x, y (data coords) and size, three to a tree. */
  readonly tr: Float32Array;
  readonly chunks = new Map<number, WideChunk>();
  private z0: number;
  // each building's box, for quick misses, and which collision squares buildings and trees touch
  private box: Float32Array;
  private bCells = new Map<number, number[]>();
  private tCells = new Map<number, number[]>();
  private stamp: Uint32Array; private tick = 1;

  constructor(d: WideData) {
    this.d = d;
    this.field = d.field; this.fx = d.fc[0]; this.fy = d.fc[1];
    this.core = d.core;
    const T = d.t;
    this.nx = T.nx; this.ny = T.ny; this.x0 = T.x0; this.y0 = T.y0; this.dx = T.dx; this.z0 = T.z0;
    this.cs = T.cs; this.size = T.cs * T.dx;
    // heights come as differences along each row
    const raw = bytes(T.h), dv = new DataView(raw.buffer);
    this.h = new Float32Array(T.nx * T.ny);
    for (let j = 0; j < T.ny; j++) {
      let v = 0;
      for (let i = 0; i < T.nx; i++) { const n = j * T.nx + i; v += dv.getInt16(n * 2, true); this.h[n] = v / 10; }
    }
    this.k = bytes(T.k);

    for (const f of d.bl) this.bl.push(this.building(f));
    for (const f of d.rd) {
      const n = f[2] ? 3 : 2, count = (f.length - 3) / n;
      let p = unpack(f, 3, count, n);
      // points carry absolute heights like the detailed map's roads
      p = p.map((q) => [q[0], q[1], n > 2 ? q[2] : this.ground(q[0], -q[1]) + this.z0]);
      this.rd.push({ c: d.cl[f[0]], n: d.nm[f[1]], p, bridge: !!f[2] });
    }
    for (const f of d.wp) {
      const rings: number[][][] = [];
      let k = 2;
      for (let r = 0; r < f[1]; r++) { const n = f[k]; rings.push(unpack(f, k + 1, n, 2)); k += 1 + n * 2; }
      this.wp.push({ r: rings, z: f[0] / 10 });
    }
    for (const f of d.wl) {
      const p = unpack(f, 0, f.length / 2, 2).map((q) => [q[0], q[1], this.ground(q[0], -q[1]) + this.z0]);
      this.wl.push({ c: "stream", p });
    }
    const t16 = bytes(d.tr), tv = new DataView(t16.buffer);
    this.tr = new Float32Array(t16.length / 2);
    for (let i = 0; i < this.tr.length; i += 3) {
      this.tr[i] = tv.getInt16(i * 2, true) / 2; this.tr[i + 1] = tv.getInt16(i * 2 + 2, true) / 2; this.tr[i + 2] = tv.getInt16(i * 2 + 4, true) / 100;
    }

    // which chunk everything is drawn in
    const chunk = (x: number, y: number) => {
      const ci = Math.floor((x - this.x0) / this.size), cj = Math.floor((y - this.y0) / this.size), key = ckey(ci, cj);
      let c = this.chunks.get(key);
      if (!c) this.chunks.set(key, (c = { ci, cj, bl: [], rd: [], wp: [], wl: [], tr: [] }));
      return c;
    };
    // and the collision grid
    this.box = new Float32Array(this.bl.length * 4);
    this.bl.forEach((b, i) => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, cx = 0, cy = 0;
      for (const [x, y] of b.r[0]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); cx += x; cy += y; }
      this.box.set([x0, y0, x1, y1], i * 4);
      chunk(cx / b.r[0].length, cy / b.r[0].length).bl.push(i);
      for (let a = Math.floor(x0 / CELL); a <= Math.floor(x1 / CELL); a++)
        for (let c = Math.floor(y0 / CELL); c <= Math.floor(y1 / CELL); c++) push(this.bCells, ckey(a, c), i);
    });
    this.stamp = new Uint32Array(this.bl.length);
    // a road or stream piece lies within one chunk: put it in the chunk of its middle point
    const mid = (p: number[][]) => { const a = p[0], b = p[p.length - 1]; return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; };
    this.rd.forEach((r, i) => {
      chunk(mid(r.p)[0], mid(r.p)[1]).rd.push(i);
    });
    this.wp.forEach((w, i) => {
      let cx = 0, cy = 0;
      for (const [x, y] of w.r[0]) { cx += x; cy += y; }
      chunk(cx / w.r[0].length, cy / w.r[0].length).wp.push(i);
    });
    this.wl.forEach((l, i) => chunk(mid(l.p)[0], mid(l.p)[1]).wl.push(i));
    for (let i = 0; i < this.tr.length / 3; i++) {
      const x = this.tr[i * 3], y = this.tr[i * 3 + 1];
      chunk(x, y).tr.push(i);
      push(this.tCells, ckey(Math.floor(x / CELL), Math.floor(y / CELL)), i);
    }
    // the packed copies are all unpacked above: let them go, as a phone can't spare the memory
    // for the whole of Bath twice over
    d.bl = d.rd = d.wp = d.wl = [];
    d.tr = d.t.h = d.t.k = "";
  }

  private building(f: number[]): Building {
    const b: Building = { r: [], g: f[0] / 10, h: f[1] / 10, dz: f[2] / 10, c: KINDS[f[3]] ?? "detached", n: "", m: WALLS[f[4]], rc: COVERS[f[5]], w: f[6] };
    if (f[7]) b.pp = f[7] / 10;
    if (f[8]) b.st = f[8];
    let k = 10;
    for (let r = 0; r < f[9]; r++) { const n = f[k]; b.r.push(unpack(f, k + 1, n, 2)); k += 1 + n * 2; }
    if (f[k++]) {
      const [rise, h0, h1, mx, my, ang, len, wid] = f.slice(k, k + 8);
      k += 8;
      const ux = Math.cos(ang / 1000), uy = Math.sin(ang / 1000), vx = -uy, vy = ux, L = len / 20, W = wid / 20;
      const P = (s: number, t: number) => [mx / 10 + ux * s + vx * t, my / 10 + uy * s + vy * t];
      b.rr = [P(-L, -W), P(L, -W), P(L, W), P(-L, W)];
      b.rp = rise / 10; b.hp = [h0 / 10, h1 / 10];
    }
    const nc = f[k++];
    if (nc) { b.ch = []; for (let c = 0; c < nc; c++) b.ch.push([f[k + c * 2] / 10, f[k + c * 2 + 1] / 10]); }
    return b;
  }

  /** What's drawn in chunk (ci, cj), counted from the grid's south-west corner, if anything. */
  chunk(ci: number, cj: number): WideChunk | undefined { return this.chunks.get(ckey(ci, cj)); }

  /** Is data point (x, y) inside the detailed map's box? */
  inCore(x: number, y: number): boolean { const c = this.core; return x > c[0] && x < c[2] && y > c[1] && y < c[3]; }

  /** Height (scene Y) at grid vertex (i, j), clamped to the grid. */
  at(i: number, j: number): number {
    return this.h[Math.min(this.ny - 1, Math.max(0, j)) * this.nx + Math.min(this.nx - 1, Math.max(0, i))];
  }

  /** Ground height (scene Y) at scene (x, z), split into triangles as outskirts.ts draws them. */
  ground(x: number, z: number): number {
    const fi = (x - this.x0) / this.dx, fj = (-z - this.y0) / this.dx;
    const i = Math.min(this.nx - 2, Math.max(0, Math.floor(fi))), j = Math.min(this.ny - 2, Math.max(0, Math.floor(fj)));
    const u = Math.min(1, Math.max(0, fi - i)), v = Math.min(1, Math.max(0, fj - j));
    const h = this.h, n = this.nx, a = j * n + i;
    if (u + v <= 1) return h[a] + (h[a + 1] - h[a]) * u + (h[a + n] - h[a]) * v;
    return h[a + n + 1] + (h[a + n] - h[a + n + 1]) * (1 - u) + (h[a + 1] - h[a + n + 1]) * (1 - v);
  }

  /** Is (x, y) a road or path of this class worth a name in the HUD? */
  static named(r: WideRoad) { return !!r.n && !PATH.has(r.c); }

  /** Buildings whose box is within r of data point (x, y), each once. */
  buildingsNear(x: number, y: number, r: number): Building[] {
    const out: Building[] = [], t = ++this.tick;
    for (let a = Math.floor((x - r) / CELL); a <= Math.floor((x + r) / CELL); a++)
      for (let c = Math.floor((y - r) / CELL); c <= Math.floor((y + r) / CELL); c++)
        for (const i of this.bCells.get(ckey(a, c)) ?? []) {
          if (this.stamp[i] === t) continue;
          this.stamp[i] = t;
          const B = this.box;
          if (x + r < B[i * 4] || x - r > B[i * 4 + 2] || y + r < B[i * 4 + 1] || y - r > B[i * 4 + 3]) continue;
          out.push(this.bl[i]);
        }
    return out;
  }

  /** Trees within r of data point (x, y): their indexes. */
  treesNear(x: number, y: number, r: number): number[] {
    const out: number[] = [];
    for (let a = Math.floor((x - r - 1) / CELL); a <= Math.floor((x + r + 1) / CELL); a++)
      for (let c = Math.floor((y - r - 1) / CELL); c <= Math.floor((y + r + 1) / CELL); c++)
        for (const i of this.tCells.get(ckey(a, c)) ?? []) if (Math.hypot(this.tr[i * 3] - x, this.tr[i * 3 + 1] - y) < r + 1) out.push(i);
    return out;
  }

  /** Every edge of the buildings and every trunk near a circle, for GameMap.collide: pushes pos out
   * of anything taller than a step at feet height y. Returns the tallest thing pushed against
   * (height above the feet), or -1. */
  collide(pos: { x: number; z: number }, y: number, r: number): number {
    let block = -1;
    for (const b of this.buildingsNear(pos.x, -pos.z, r)) {
      const eave = b.g - this.z0 + b.h, top = eave + Math.max(b.pp ?? 0, b.rp ? b.rp * 0.6 : 0.2);
      if (top < y + 0.45 || eave <= y + 0.05) continue;        // low enough to step over, or we're on its roof
      for (const ring of b.r) for (let i = 0; i < ring.length; i++) {
        const a = ring[i], q = ring[(i + 1) % ring.length];
        if (pushOut(pos, a[0], -a[1], q[0], -q[1], r)) block = Math.max(block, top - y);
      }
    }
    for (const i of this.treesNear(pos.x, -pos.z, r)) {
      const tx = this.tr[i * 3], tz = -this.tr[i * 3 + 1], s = this.tr[i * 3 + 2], rr = 0.28 * s;
      const top = this.ground(tx, tz) + 4 * s;
      if (top < y + 0.45) continue;
      const ex = pos.x - tx, ez = pos.z - tz, d = Math.hypot(ex, ez), m = r + rr;
      if (d >= m || d < 1e-6) continue;
      pos.x = tx + (ex / d) * m; pos.z = tz + (ez / d) * m;
      block = Math.max(block, top - y);
    }
    return block;
  }

  /** First building wall or trunk hit by a ray from o along unit vector d, within maxDist, skipping
   *  stretches covered by something more detailed. */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number,
    raySeg: (ox: number, oz: number, dx: number, dz: number, ax: number, az: number, bx: number, bz: number) => number,
    rayCircle: (ox: number, oz: number, dx: number, dz: number, cx: number, cz: number, r: number) => number,
    covered: (x: number, z: number) => boolean = () => false): RayHit | null {
    const hl = Math.hypot(dx, dz);
    if (hl < 1e-6) return null;
    let best: RayHit | null = null;
    const seenB = new Set<Building>(), seenT = new Set<number>();
    const steps = Math.ceil((maxDist * hl) / (CELL / 2));
    for (let s = 0; s <= steps; s++) {
      const f = Math.min(maxDist, (s * (CELL / 2)) / hl), x = ox + dx * f, z = oz + dz * f;
      if (best && best.dist < f - CELL) break;
      if (this.inCore(x, -z) || covered(x, z)) continue;      // the detailed map, or a full-detail square, has it
      for (const b of this.buildingsNear(x, -z, CELL / 2)) {
        if (seenB.has(b)) continue;
        seenB.add(b);
        const top = b.g - this.z0 + b.h + Math.max(b.pp ?? 0, b.rp ? b.rp * 0.6 : 0.2);
        for (const ring of b.r) for (let i = 0; i < ring.length; i++) {
          const a = ring[i], q = ring[(i + 1) % ring.length];
          const hit = raySeg(ox, oz, dx, dz, a[0], -a[1], q[0], -q[1]);
          if (hit < 0 || hit > maxDist || (best && hit >= best.dist) || oy + dy * hit > top) continue;
          const vx = q[0] - a[0], vz = -(q[1] - a[1]), vl = Math.hypot(vx, vz) || 1;
          let nx = -vz / vl, nz = vx / vl;
          if (nx * dx + nz * dz > 0) { nx = -nx; nz = -nz; }
          best = { dist: hit, kind: "building", nx, ny: 0, nz };
        }
      }
      for (const i of this.treesNear(x, -z, CELL / 2)) {
        if (seenT.has(i)) continue;
        seenT.add(i);
        const tx = this.tr[i * 3], tz = -this.tr[i * 3 + 1], s3 = this.tr[i * 3 + 2];
        const hit = rayCircle(ox, oz, dx, dz, tx, tz, 0.28 * s3);
        if (hit < 0 || hit > maxDist || (best && hit >= best.dist) || oy + dy * hit > this.ground(tx, tz) + 4 * s3) continue;
        const hx = ox + dx * hit - tx, hz = oz + dz * hit - tz, l = Math.hypot(hx, hz) || 1;
        best = { dist: hit, kind: "tree", nx: hx / l, ny: 0, nz: hz / l };
      }
    }
    return best;
  }
}


/** Push a circle at pos (radius r) off the segment a-b (scene x, z). True if it moved. */
function pushOut(pos: { x: number; z: number }, ax: number, az: number, bx: number, bz: number, r: number): boolean {
  const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz || 1;
  const s = Math.min(1, Math.max(0, ((pos.x - ax) * vx + (pos.z - az) * vz) / l2));
  const cx = ax + vx * s, cz = az + vz * s;
  let ex = pos.x - cx, ez = pos.z - cz;
  const d = Math.hypot(ex, ez);
  if (d >= r) return false;
  if (d < 1e-6) { ex = -vz; ez = vx; }
  const el = Math.hypot(ex, ez) || 1;
  pos.x = cx + (ex / el) * r; pos.z = cz + (ez / el) * r;
  return true;
}

function push(m: Map<number, number[]>, k: number, v: number) { const a = m.get(k); if (a) a.push(v); else m.set(k, [v]); }

export async function loadWide(url: string): Promise<Wide | null> {
  // a map without a wider circle: no file (some servers send a page instead)
  const res = await fetch(url).catch(() => null);
  const data = res?.ok ? await res.json().catch(() => null) : null;
  return data?.t ? new Wide(data) : null;
}
