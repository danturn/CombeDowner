// Map data (built by tools/prep_map.py) plus the queries the game needs: ground height,
// collision against buildings, walls and trees, and bullet raycasts.
//
// Data coordinates are metres east (x) and north (y) of the map centre, with absolute elevations.
// Scene coordinates: X = east, Y = up (metres above the map's lowest point, z0), Z = -north.

export interface Terrain { nx: number; ny: number; x0: number; y0: number; dx: number; dy: number; z0: number; h: number[]; k: string }
export interface Building {
  r: number[][][]; h: number; g: number; c: string; n: string; dz: number;
  m?: string; rc?: string; w?: number;            // wall material, roof covering, has windows
  rr?: number[][]; rp?: number; hp?: number[];    // roof rectangle, ridge rise, hip insets at each end
  ch?: number[][];                                // chimney stacks
  pp?: number;                                    // parapet height above the eaves
  st?: number;                                    // storeys, when they're taller than usual
}
export interface Road { c: string; n: string; p: number[][] }
export interface Pond { r: number[][][]; z: number }
export interface Line { c: string; p: number[][] }
export interface Place { n: string; r: number[][] }
/** A rugby pitch ["r", x, y, length, width, angle], or a cricket field ["c", x, y, angle, boundary
 *  rope ring, sightscreens [[x, y], ...]]. The angle is the long axis (the wicket, for cricket). */
export type Pitch = ["r", number, number, number, number, number] | ["c", number, number, number, number[][], number[][]];
export interface MapData {
  id?: string; name?: string; release: string; centre: [number, number]; field: number; b: [number, number, number, number];
  v?: [number, number];                           // what the menu backdrop circles around
  t: Terrain; bl: Building[]; rd: Road[]; wp: Pond[]; wl: Line[]; br: Line[]; tr: number[][];
  gt?: (number | string)[][];   // garden gates: x0, y0, x1, y1, ground, boundary style
  fx?: (number | string)[][];   // street items: kind, x, y, ground, angle, ...
  mk?: number[][];              // road markings: x0, y0, x1, y1, z0, z1, kind
  sh?: (number | string)[][];   // shop signs: x, y, ground, angle, width, name, style
  lm?: (number | string)[][];   // landmarks: kind, x, y, ground, angle, ...
  dr?: number[][];              // front doors: x, y, ground, angle, colour
  sb?: number[][];              // shrubs: x, y, ground, height
  fp?: number[][];              // front paths, gate to door: x0, y0, x1, y1
  dv?: number[][];              // driveways, gap to house: x0, y0, x1, y1
  by?: (number | string)[][];   // bay windows: x, y, ground, angle, storeys, wall material, width
  wr?: number[][];              // overhead wires: x0, y0, z0, x1, y1, z1 (absolute heights)
  cn?: { x0: number; y0: number; step: number; nx: number; ny: number; h: string };   // canopy heights over woods
  pi?: Pitch[];                 // sports pitches: rugby pitches and cricket fields
  spawn?: number[][];           // where players appear (Firs Field)
  pl?: Place[];                                   // named areas, smallest first
}

/** Heights of walls, fences and hedges, from the map data and from the inferred garden plots. */
export const BARRIER_HEIGHT: Record<string, number> = {
  // Everything can be jumped (a jump clears about 1.6 m). Mapped walls carry no height; around
  // here they are mostly low field and boundary walls of about 3 ft.
  wall: 0.9, retaining_wall: 0.9, fence: 1.2, hedge: 1.3,
  garden_wall: 0.9, brick_wall_low: 0.75, hedge_low: 1.0, railing: 1.0, // front gardens
  stone_wall: 1.1, brick_wall: 1.2,                                    // between gardens
};
export const PATHS = new Set(["footway", "steps", "cycleway", "path", "pedestrian", "bridleway", "track"]);
/** Streets whose parked cars you can drive (vehicles.ts): they come off the street furniture. */
export const DRIVABLE_STREETS = new Set(["The Firs", "Fox Hill"]);

/**
 * Something solid that moves about: a vehicle (vehicles.ts). A box on the ground at scene (x, z),
 * turned to angle a (its length runs along (cos a, -sin a)), hl long and hw wide each way from the
 * middle. y is the ground under it and top its roof; rounds go over waist, through the windows.
 */
export interface Mover { x: number; z: number; a: number; hl: number; hw: number; y: number; top: number; waist: number }

/** Rugby goalposts: how tall the uprights are, and how far apart. */
export const POST_HEIGHT = 11, POST_GAP = 5.6;
/** Cricket sightscreens: width and height. */
export const SCREEN = [7, 3.8];
/** Ends of the field of play and in-goal depth of a rugby pitch drawn inside its mapped rectangle. */
export function rugbyLayout(p: Extract<Pitch, ["r", ...unknown[]]>) {
  const L = p[3] - 2, W = p[4] - 2;                          // lines a metre in from the mapped edge
  const goal = Math.min(10, Math.max(4, L * 0.08));          // in-goal depth
  return { L, W, goal, F: L / 2 - goal };                    // F: centre to try line
}
/** Where a rugby pitch's four uprights stand (data coords). */
export function rugbyUprights(p: Extract<Pitch, ["r", ...unknown[]]>): number[][] {
  const { F } = rugbyLayout(p), ux = Math.cos(p[5]), uy = Math.sin(p[5]);
  const out: number[][] = [];
  for (const s of [-F, F]) for (const t of [-POST_GAP / 2, POST_GAP / 2]) out.push([p[1] + ux * s - uy * t, p[2] + uy * s + ux * t]);
  return out;
}

const CELL = 8;

export interface RayHit { dist: number; kind: "ground" | "building" | "barrier" | "tree"; nx: number; ny: number; nz: number }

export class GameMap {
  readonly d: MapData;
  readonly z0: number;
  /** Radius of the force field around the map centre: the play area. */
  readonly field: number;
  private hgt: Float32Array;
  // collision segments, scene coords: (ax, az) -> (bx, bz), with the top of the obstacle
  private sAx: number[] = []; private sAz: number[] = []; private sBx: number[] = []; private sBz: number[] = [];
  private sTop: number[] = []; private sKind: number[] = [];
  // tree trunks
  private cX: number[] = []; private cZ: number[] = []; private cR: number[] = []; private cTop: number[] = [];
  private segCells = new Map<number, number[]>();
  private treeCells = new Map<number, number[]>();
  private stamp: Uint32Array = new Uint32Array(0);
  private treeStamp: Uint32Array = new Uint32Array(0);
  private tick = 1;
  /** Vehicles, which block like walls wherever they are now. */
  readonly movers: Mover[] = [];
  /** Parked cars on DRIVABLE_STREETS, for vehicles.ts to swap for ones you can drive (data coords), and which street. */
  readonly parked: { x: number; y: number; a: number; street: string }[] = [];
  /** Every other parked car: street furniture (f, its entry in fx) until someone gets in it, and where its walls start. */
  readonly spare: { f: (string | number)[]; seg: number }[] = [];
  /** Hide a parked car's furniture once it's become a vehicle (furniture.ts sets this). */
  onTakeCar: (f: (string | number)[]) => void = () => {};

  constructor(d: MapData) {
    this.d = d;
    const T = d.t;
    this.z0 = T.z0;
    this.hgt = Float32Array.from(T.h, (v) => v / 10);
    this.field = d.field;

    for (const b of d.bl) {
      const top = b.g - this.z0 + b.h + Math.max(b.pp ?? 0, b.rp ? b.rp * 0.6 : 0.2);
      for (const ring of b.r) this.addRing(ring, top, 0);
    }
    for (const l of d.br) {
      const p = l.p, hh = BARRIER_HEIGHT[l.c] ?? 1.5;
      for (let i = 0; i < p.length - 1; i++) {
        const top = Math.max(p[i][2], p[i + 1][2]) - this.z0 + hh;
        this.addSeg(p[i][0], -p[i][1], p[i + 1][0], -p[i + 1][1], top, 1);
      }
    }
    for (const [x, y, z, s] of d.tr) {
      const i = this.cX.length;
      this.cX.push(x); this.cZ.push(-y); this.cR.push(0.28 * s); this.cTop.push(z - this.z0 + 4 * s);
      this.cellsAround(x, -y, 0.3).forEach((k) => push(this.treeCells, k, i));
    }
    // parked cars on the streets you can drive along are taken off the street furniture
    const drive = d.rd.filter((r) => DRIVABLE_STREETS.has(r.n));
    if (drive.length && d.fx) d.fx = d.fx.filter((f) => {
      const [kind, x, y, , a] = f as [string, number, number, number, number];
      const on = kind === "car" && drive.find((r) => r.p.some((q) => Math.hypot(q[0] - x, q[1] - y) < 5));
      if (!on) return true;
      this.parked.push({ x, y, a, street: on.n });
      return false;
    });
    // street items that block: parked cars and bus shelters as boxes, posts as circles
    for (const f of d.fx ?? []) {
      const [kind, x, y, z, a] = f as [string, number, number, number, number];
      const g = z - this.z0;
      if (kind === "car") { this.spare.push({ f, seg: this.sAx.length }); this.addBox(x, y, a, 0, 2.05, 0.88, g + 1.45); }
      else if (kind === "bus" && f[6]) this.addBox(x, y, a, -0.75, 1.55, 0.6, g + 2.4);
      else if (kind === "lamp") this.addPost(x, y, 0.12, g + 6.4);
      else if (kind === "postbox" || kind === "bin") this.addPost(x, y, 0.28, g + 1.25);
      else if (kind === "wheelie") this.addPost(x, y, 0.34, g + 1.1);
      else if (kind === "pole") this.addPost(x, y, 0.15, g + 8);
      else if (kind === "bollard") this.addPost(x, y, 0.1, g + 0.9);
    }
    // rugby goalposts and cricket sightscreens
    for (const p of d.pi ?? []) {
      if (p[0] === "r") for (const [x, y] of rugbyUprights(p)) this.addPost(x, y, 0.3, this.ground(x, -y) + POST_HEIGHT);
      else for (const [x, y] of p[5]) this.addBox(x, y, p[3] + Math.PI / 2, 0, SCREEN[0] / 2, 0.2, this.ground(x, -y) + SCREEN[1]);
    }
    this.stamp = new Uint32Array(this.sAx.length);
    this.treeStamp = new Uint32Array(this.cX.length);
  }

  /** A parked car has become a vehicle (vehicles.ts): take away its walls and its furniture. */
  takeCar(k: number) {
    const s = this.spare[k];
    if (!s) return;
    for (let j = 0; j < 4; j++) this.sTop[s.seg + j] = -Infinity;
    this.onTakeCar(s.f);
  }

  /** Rectangle centred dz across from (x, y) (data coords), turned by angle a, half-sizes hl along and hw across. */
  private addBox(x: number, y: number, a: number, dz: number, hl: number, hw: number, top: number) {
    const ux = Math.cos(a), uy = Math.sin(a), vx = -uy, vy = ux;
    // local +z (toward the street) is minus v in data coordinates
    const cx = x - vx * dz, cy = y - vy * dz;
    const C = (s: number, t: number) => [cx + ux * s + vx * t, cy + uy * s + vy * t];
    const ring = [C(-hl, -hw), C(hl, -hw), C(hl, hw), C(-hl, hw)];
    this.addRing(ring, top, 1);
  }

  private addPost(x: number, y: number, r: number, top: number) {
    const i = this.cX.length;
    this.cX.push(x); this.cZ.push(-y); this.cR.push(r); this.cTop.push(top);
    this.cellsAround(x, -y, r).forEach((k) => push(this.treeCells, k, i));
  }

  private addRing(ring: number[][], top: number, kind: number) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      this.addSeg(a[0], -a[1], b[0], -b[1], top, kind);
    }
  }

  private addSeg(ax: number, az: number, bx: number, bz: number, top: number, kind: number) {
    const i = this.sAx.length;
    this.sAx.push(ax); this.sAz.push(az); this.sBx.push(bx); this.sBz.push(bz); this.sTop.push(top); this.sKind.push(kind);
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(len / (CELL / 2)));
    const seen = new Set<number>();
    for (let s = 0; s <= n; s++) {
      const x = ax + ((bx - ax) * s) / n, z = az + ((bz - az) * s) / n;
      for (const k of this.cellsAround(x, z, 0.6)) if (!seen.has(k)) { seen.add(k); push(this.segCells, k, i); }
    }
  }

  private cellsAround(x: number, z: number, r: number): number[] {
    const out: number[] = [];
    const i0 = Math.floor((x - r) / CELL), i1 = Math.floor((x + r) / CELL);
    const j0 = Math.floor((z - r) / CELL), j1 = Math.floor((z + r) / CELL);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) out.push(key(i, j));
    return out;
  }

  /** Ground height (scene Y) at scene (x, z). */
  ground(x: number, z: number): number {
    const T = this.d.t;
    const fi = (x - T.x0) / T.dx, fj = (-z - T.y0) / T.dy;
    const i = Math.min(T.nx - 2, Math.max(0, Math.floor(fi))), j = Math.min(T.ny - 2, Math.max(0, Math.floor(fj)));
    const u = Math.min(1, Math.max(0, fi - i)), v = Math.min(1, Math.max(0, fj - j));
    const h = this.hgt, n = T.nx, a = j * n + i;
    // match the triangle split used by the terrain mesh (a, b, c / b, d, c)
    if (u + v <= 1) return h[a] + (h[a + 1] - h[a]) * u + (h[a + n] - h[a]) * v;
    return h[a + n + 1] + (h[a + n] - h[a + n + 1]) * (1 - u) + (h[a + 1] - h[a + n + 1]) * (1 - v);
  }

  /** Height above the feet of the tallest thing the last collide() pushed against (-1 if none). */
  lastBlock = -1;

  /** Push a circle of radius r at feet height y out of anything solid (but skip). Mutates and returns pos. */
  collide(pos: { x: number; z: number }, y: number, r: number, skip?: Mover): { x: number; z: number } {
    this.lastBlock = -1;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      const t = ++this.tick;
      for (const k of this.cellsAround(pos.x, pos.z, r)) {
        for (const i of this.segCells.get(k) ?? []) {
          if (this.stamp[i] === t) continue;
          this.stamp[i] = t;
          if (this.sTop[i] < y + 0.45) continue;   // low enough to step over
          const ax = this.sAx[i], az = this.sAz[i], vx = this.sBx[i] - ax, vz = this.sBz[i] - az;
          const l2 = vx * vx + vz * vz || 1;
          const s = Math.min(1, Math.max(0, ((pos.x - ax) * vx + (pos.z - az) * vz) / l2));
          const cx = ax + vx * s, cz = az + vz * s;
          let ex = pos.x - cx, ez = pos.z - cz;
          const d = Math.hypot(ex, ez);
          if (d >= r) continue;
          if (d < 1e-6) { ex = -vz; ez = vx; } // exactly on the line: push along its normal
          const el = Math.hypot(ex, ez) || 1;
          pos.x = cx + (ex / el) * r; pos.z = cz + (ez / el) * r;
          moved = true;
          this.lastBlock = Math.max(this.lastBlock, this.sTop[i] - y);
        }
        for (const i of this.treeCells.get(k) ?? []) {
          if (this.treeStamp[i] === t) continue;
          this.treeStamp[i] = t;
          const ex = pos.x - this.cX[i], ez = pos.z - this.cZ[i], d = Math.hypot(ex, ez), m = r + this.cR[i];
          if (d >= m || d < 1e-6) continue;
          pos.x = this.cX[i] + (ex / d) * m; pos.z = this.cZ[i] + (ez / d) * m;
          moved = true;
          this.lastBlock = Math.max(this.lastBlock, this.cTop[i] - y);
        }
      }
      for (const m of this.movers) {
        if (m === skip || m.top < y + 0.45) continue;
        // into the vehicle's own frame: u along it, w across
        const c = Math.cos(m.a), s = Math.sin(m.a), dx = pos.x - m.x, dz = pos.z - m.z;
        const u = dx * c - dz * s, w = dx * s + dz * c;
        if (Math.abs(u) >= m.hl + r || Math.abs(w) >= m.hw + r) continue;
        const cu = Math.max(-m.hl, Math.min(m.hl, u)), cw = Math.max(-m.hw, Math.min(m.hw, w));
        let nu = u, nw = w;
        if (cu === u && cw === w) {
          // inside it: out through the nearest side
          if (m.hl - Math.abs(u) < m.hw - Math.abs(w)) nu = (u < 0 ? -1 : 1) * (m.hl + r);
          else nw = (w < 0 ? -1 : 1) * (m.hw + r);
        } else {
          const eu = u - cu, ew = w - cw, d = Math.hypot(eu, ew);
          if (d >= r) continue;
          nu = cu + (eu / d) * r; nw = cw + (ew / d) * r;
        }
        pos.x = m.x + nu * c + nw * s; pos.z = m.z - nu * s + nw * c;
        moved = true;
        this.lastBlock = Math.max(this.lastBlock, m.top - y);
      }
      if (!moved) break;
    }
    // the force field
    const d = Math.hypot(pos.x, pos.z), lim = this.field - r;
    if (d > lim) { pos.x *= lim / d; pos.z *= lim / d; }
    return pos;
  }

  /** True if a circle at (x, z) touches a building, wall or tree. */
  blocked(x: number, z: number, r: number): boolean {
    const p = { x, z };
    this.collide(p, -1e9, r);
    return Math.hypot(p.x - x, p.z - z) > 1e-3;
  }

  /** First solid thing hit by a ray from o along unit vector d, within maxDist. */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number): RayHit | null {
    let best: RayHit | null = null;
    const hl = Math.hypot(dx, dz);
    if (hl > 1e-6) {
      // walk the cells under the ray's horizontal track, testing walls and trunks in each
      const t = ++this.tick;
      const steps = Math.ceil((maxDist * hl) / (CELL / 2));
      const seen = new Set<number>();
      for (let s = 0; s <= steps; s++) {
        const f = Math.min(maxDist, (s * (CELL / 2)) / hl);
        const x = ox + dx * f, z = oz + dz * f;
        for (const k of this.cellsAround(x, z, CELL / 2)) {
          if (seen.has(k)) continue;
          seen.add(k);
          for (const i of this.segCells.get(k) ?? []) {
            if (this.stamp[i] === t) continue;
            this.stamp[i] = t;
            const hit = raySeg(ox, oz, dx, dz, this.sAx[i], this.sAz[i], this.sBx[i], this.sBz[i]);
            if (hit < 0 || hit > maxDist || (best && hit >= best.dist)) continue;
            const y = oy + dy * hit;
            if (y > this.sTop[i]) continue;
            const vx = this.sBx[i] - this.sAx[i], vz = this.sBz[i] - this.sAz[i], vl = Math.hypot(vx, vz) || 1;
            let nx = -vz / vl, nz = vx / vl;
            if (nx * dx + nz * dz > 0) { nx = -nx; nz = -nz; }
            best = { dist: hit, kind: this.sKind[i] === 0 ? "building" : "barrier", nx, ny: 0, nz };
          }
          for (const i of this.treeCells.get(k) ?? []) {
            if (this.treeStamp[i] === t) continue;
            this.treeStamp[i] = t;
            const hit = rayCircle(ox, oz, dx, dz, this.cX[i], this.cZ[i], this.cR[i]);
            if (hit < 0 || hit > maxDist || (best && hit >= best.dist)) continue;
            if (oy + dy * hit > this.cTop[i]) continue;
            const hx = ox + dx * hit - this.cX[i], hz = oz + dz * hit - this.cZ[i], hl2 = Math.hypot(hx, hz) || 1;
            best = { dist: hit, kind: "tree", nx: hx / hl2, ny: 0, nz: hz / hl2 };
          }
        }
        if (best && best.dist < f - CELL) break;
      }
    }
    // vehicles, below their windows
    for (const m of this.movers) {
      const hit = rayBox(ox, oz, dx, dz, m);
      if (!hit || hit.t > maxDist || (best && hit.t >= best.dist)) continue;
      const y = oy + dy * hit.t;
      if (y > m.waist || y < m.y) continue;
      best = { dist: hit.t, kind: "barrier", nx: hit.nx, ny: 0, nz: hit.nz };
    }
    // terrain: march, then bisect
    const lim = best ? best.dist : maxDist;
    let prev = 0;
    for (let f = 0.5; f <= lim + 0.5; f += 0.5) {
      const ff = Math.min(f, lim);
      if (oy + dy * ff < this.ground(ox + dx * ff, oz + dz * ff)) {
        let lo = prev, hi = ff;
        for (let k = 0; k < 10; k++) {
          const m = (lo + hi) / 2;
          if (oy + dy * m < this.ground(ox + dx * m, oz + dz * m)) hi = m; else lo = m;
        }
        const hx = ox + dx * hi, hz = oz + dz * hi;
        const gx = this.ground(hx + 0.5, hz) - this.ground(hx - 0.5, hz), gz = this.ground(hx, hz + 0.5) - this.ground(hx, hz - 0.5);
        const nl = Math.hypot(gx, 1, gz);
        return { dist: hi, kind: "ground", nx: -gx / nl, ny: 1 / nl, nz: -gz / nl };
      }
      prev = ff;
      if (ff >= lim) break;
    }
    return best;
  }
}

function key(i: number, j: number) { return (i + 2048) * 4096 + (j + 2048); }
function push(m: Map<number, number[]>, k: number, v: number) { const a = m.get(k); if (a) a.push(v); else m.set(k, [v]); }

/** Distance along a horizontal ray (o + t*d, d not normalised in 2D) to segment a-b, or -1. */
function raySeg(ox: number, oz: number, dx: number, dz: number, ax: number, az: number, bx: number, bz: number): number {
  const ex = bx - ax, ez = bz - az;
  const den = dx * ez - dz * ex;
  if (Math.abs(den) < 1e-9) return -1;
  const wx = ax - ox, wz = az - oz;
  const t = (wx * ez - wz * ex) / den;
  const u = (wx * dz - wz * dx) / den;
  return t >= 0 && u >= 0 && u <= 1 ? t : -1;
}

/** Where a horizontal ray (o + t*d) first enters a vehicle's box from outside, and the side's normal, or null. */
function rayBox(ox: number, oz: number, dx: number, dz: number, m: Mover): { t: number; nx: number; nz: number } | null {
  const c = Math.cos(m.a), s = Math.sin(m.a);
  const ou = (ox - m.x) * c - (oz - m.z) * s, ow = (ox - m.x) * s + (oz - m.z) * c;
  const du = dx * c - dz * s, dw = dx * s + dz * c;
  let t0 = -Infinity, t1 = Infinity, nu = 0, nw = 0;
  for (const [o, d, h, axis] of [[ou, du, m.hl, 0], [ow, dw, m.hw, 1]]) {
    if (Math.abs(d) < 1e-9) { if (Math.abs(o) > h) return null; continue; }
    let a = (-h - o) / d, b = (h - o) / d, n = -1;
    if (a > b) { [a, b] = [b, a]; n = 1; }
    if (a > t0) { t0 = a; nu = axis === 0 ? n : 0; nw = axis === 1 ? n : 0; }
    t1 = Math.min(t1, b);
  }
  if (t0 > t1 || t0 < 0) return null;
  return { t: t0, nx: nu * c + nw * s, nz: -nu * s + nw * c };
}

function rayCircle(ox: number, oz: number, dx: number, dz: number, cx: number, cz: number, r: number): number {
  const fx = ox - cx, fz = oz - cz;
  const a = dx * dx + dz * dz, b = 2 * (fx * dx + fz * dz), c = fx * fx + fz * fz - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0 || a < 1e-12) return -1;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 ? t : -1;
}

/** The id of the map carried inline by the single-file build, if this is that build. */
export function inlineMapId(): string | null {
  return document.getElementById("mapdata")?.dataset.map ?? null;
}

export async function loadMap(url: string): Promise<GameMap> {
  // the single-file build carries its one map inline
  const inline = document.getElementById("mapdata");
  if (inline?.textContent) return new GameMap(JSON.parse(inline.textContent));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load the map (${res.status})`);
  return new GameMap(await res.json());
}
