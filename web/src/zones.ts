// The zones: the map opened up a part at a time. You start in a small first zone round where
// everyone starts, with a shimmering wall like the force field's round it. Each zone but the last
// has a strange structure of its own (oddments.ts) with a few sockets, and its own challenges
// (challenges.ts); fill its sockets and the wall moves out to take in the next zone, with a fly-over
// of it (reveal.ts). Ways to get about (buses, boats, balloons, trains, the cable car) open up with
// the zones as well, and travel never takes you past the wall.
//
// The zones come from the map alone, so they work on any map and every player gets the same ones:
// the map is cut into cells on its squares' grid, the first zone is the first area (the village on
// Bath's map) or the cells nearest the start, and the rest grow out from it along the streets, each
// with a fair share of the town. Each is named after the biggest district in it (<map>-districts.json,
// from tools/districts.py), or failing that the biggest named park or square.
//
// Who decides what: nobody. How many zones are open follows from how many sockets are full, which
// the host of oddments.ts decides and sends round; so the wall stands in the same place on every
// screen. Free play (no zones) is the host's say, sent with the sockets.
import * as THREE from "three";
import type { GameMap } from "./map";
import { openGround } from "./oddments";

/** A way to get about that opens with a zone. */
export type TravelKind = "bus" | "busroute" | "boat" | "balloon" | "train" | "cable";

const TRAVEL_LINE: Record<TravelKind, string> = {
  bus: "New: call a bus from any stop",
  busroute: "New: drive a bus route",
  boat: "New: take the tiller of a canal boat",
  balloon: "New: hot air balloons from the park at dawn",
  train: "New: trains to the next town",
  cable: "New: the cable car",
};
const TRAVEL_SHUT: Record<TravelKind, string> = {
  bus: "No buses out this way yet",
  busroute: "No bus routes out this way yet",
  boat: "The boats aren't taking anyone out this way yet",
  balloon: "No balloon flights out this way yet",
  train: "The doors are shut: no trains from here yet",
  cable: "The cable car isn't running yet",
};
/** These open in turn, one a zone from the second on; trains and the cable car open with the zones their stations are in. */
const SLOTTED: TravelKind[] = ["bus", "busroute", "boat", "balloon"];

const BUILT_IN = import.meta.glob<{ ds?: [number, number, string, string][] }>("../public/maps/*-districts.json", { eager: true, import: "default" });
const RANK: Record<string, number> = { town: 0, suburb: 1, village: 1, quarter: 2, neighbourhood: 3, hamlet: 4 };
const NEAR = 2;   // cells either way looked at for the wall

export interface Zone {
  i: number;
  name: string;
  cells: number;
  km2: number;
  /** Its middle (the streets' weight), scene coordinates. */
  x: number; z: number;
  /** Where its structure stands (scene), and how many sockets it has: none in the last zone. */
  home: { x: number; y: number; z: number; n: string } | null;
  sockets: number;
}

export interface Fence { edge(x: number, z: number): number; inside(x: number, z: number, r: number): [number, number] }

/** What a travel kind needs: where it is, and whether all of those places must be open (a cable car's two ends) or any one. */
export interface TravelFind { kind: TravelKind; at: [number, number][]; all?: boolean }

const ringArea = (r: number[][]) => {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
  return Math.abs(a) / 2;
};

export class Zones {
  readonly list: Zone[] = [];
  /** The cells: their size, the data corner of the first, and how many each way. */
  private c: number; private x0: number; private y0: number; private nx: number; private ny: number;
  /** Each cell's zone, or -1 for one outside the force field. */
  private grid: Int8Array;
  private cum: number[] = [0];
  private openN = 0;
  private all = false;
  private only = new Map<number, GameMap>();
  private travel = new Map<TravelKind, number>();
  private wall: THREE.Mesh | null = null;
  private wallLook: THREE.Material | null = null;
  private scene: THREE.Scene | null = null;
  /** Goes up each time the wall moves, for anything drawn from it. */
  version = 0;
  /** The real fence on the main map, while there's a wall. */
  readonly fence: Fence = { edge: (x, z) => this.edgeIn(x, z, (g) => g < this.openN), inside: (x, z, r) => this.insideOf(x, z, r, (g) => g < this.openN) };

  constructor(private map: GameMap, mapId: string) {
    const fr = map.fieldFrame(), I = map.tileIndex;
    const S = I ? I.cells * I.dx : (2 * map.field) / 3;
    const area = Math.PI * map.field * map.field;
    const want = Math.max(150, Math.min(S / 2, Math.sqrt(area / 300)));
    this.c = S / Math.max(1, Math.round(S / want));
    const gx = I ? I.x0 : map.fieldX - map.field, gy = I ? I.y0 : -map.fieldZ - map.field;
    const i0 = Math.floor((fr.x - fr.r - gx) / this.c), i1 = Math.ceil((fr.x + fr.r - gx) / this.c);
    const j0 = Math.floor((fr.y - fr.r - gy) / this.c), j1 = Math.ceil((fr.y + fr.r - gy) / this.c);
    this.x0 = gx + i0 * this.c; this.y0 = gy + j0 * this.c;
    this.nx = i1 - i0; this.ny = j1 - j0;
    this.grid = new Int8Array(this.nx * this.ny).fill(-1);
    this.lay(mapId);
  }

  // ---- laying them out ----------------------------------------------------------------------

  private lay(mapId: string) {
    const { map, c, nx, ny } = this;
    const n = nx * ny, inField = new Uint8Array(n), road = new Float64Array(n);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      for (const [a, b] of [[0.5, 0.5], [0.05, 0.05], [0.95, 0.05], [0.05, 0.95], [0.95, 0.95], [0.5, 0.05], [0.5, 0.95], [0.05, 0.5], [0.95, 0.5]]) {
        if (map.fieldEdgeBase(this.x0 + (i + a) * c, -(this.y0 + (j + b) * c)) > 0) { inField[j * nx + i] = 1; break; }
      }
    }
    const cellOf = (x: number, y: number) => {
      const i = Math.floor((x - this.x0) / c), j = Math.floor((y - this.y0) / c);
      return i < 0 || j < 0 || i >= nx || j >= ny ? -1 : j * nx + i;
    };
    const PATH = new Set(["footway", "path", "steps", "cycleway", "pedestrian", "bridleway", "track"]);
    for (const r of map.wide?.rd ?? map.d.rd) {
      if (PATH.has(r.c)) continue;
      for (let k = 1; k < r.p.length; k++) {
        const a = r.p[k - 1], b = r.p[k], k0 = cellOf((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
        if (k0 >= 0) road[k0] += Math.hypot(b[0] - a[0], b[1] - a[1]);
      }
    }
    const cells = [...Array(n).keys()].filter((k) => inField[k]);
    const N = Math.max(2, Math.min(7, Math.round(1 + map.field / 1100)));
    const total = cells.length, roads = cells.reduce((s, k) => s + road[k], 0) || 1;
    const worth = (k: number) => 0.5 / total + (0.5 * road[k]) / roads;
    // the first zone: the first area, if it's a small part of the map, or else the cells round the start
    const D = map.d, sp = D.spawn?.length ? D.spawn : [[0, 0]];
    const hx = sp.reduce((s, p) => s + p[0], 0) / sp.length, hy = sp.reduce((s, p) => s + p[1], 0) / sp.length;
    // the first area is squares 0 to 2 each way (tools/area.py), whatever its own box says
    const I = map.tileIndex, S = I ? I.cells * I.dx : 0;
    const [bx0, by0, bx1, by1] = I ? [I.x0, I.y0, I.x0 + 3 * S, I.y0 + 3 * S] : [0, 0, 0, 0];
    const centre = (k: number): [number, number] => [this.x0 + ((k % nx) + 0.5) * c, this.y0 + (Math.floor(k / nx) + 0.5) * c];
    let first = I ? cells.filter((k) => { const [x, y] = centre(k); return x > bx0 && x < bx1 && y > by0 && y < by1; }) : [];
    if (first.length < 4 || first.length > total * 0.35) first = [];
    const zone = new Int8Array(n).fill(-1);
    // grown out from there along the streets: a step into a cell with streets in it costs less
    const sorted = cells.map((k) => road[k]).filter((v) => v > 0).sort((a, b) => a - b);
    const ref = sorted[Math.floor(sorted.length * 0.8)] || 1;
    const dist = new Float64Array(n).fill(Infinity);
    const start = cellOf(hx, hy), far = (k: number) => Math.hypot(centre(k)[0] - hx, centre(k)[1] - hy);
    const seeds = first.length ? first : start >= 0 && inField[start] ? [start] : [[...cells].sort((a, b) => far(a) - far(b) || a - b)[0]];
    for (const k of seeds) dist[k] = 0;
    const done = new Uint8Array(n), order: number[] = [];
    // a plain Dijkstra over a few hundred cells; ties go by cell number so every machine agrees
    for (;;) {
      let best = -1;
      for (const k of cells) if (!done[k] && dist[k] < Infinity && (best < 0 || dist[k] < dist[best])) best = k;
      if (best < 0) break;
      done[best] = 1; order.push(best);
      const i = best % nx, j = Math.floor(best / nx);
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= nx || b >= ny) continue;
        const q = b * nx + a;
        if (!inField[q] || done[q]) continue;
        const d = dist[best] + c * (2 - Math.min(1, (road[best] + road[q]) / (2 * ref)));
        if (d < dist[q]) dist[q] = d;
      }
    }
    // cells the growth couldn't reach (cut off by the edge) join the nearest zone in order
    for (const k of cells) if (!done[k]) order.push(k);
    const firstSet = new Set(first);
    const firstShare = first.length ? first.reduce((s, k) => s + worth(k), 0) : 1 / (N + 2);
    const each = (1 - firstShare) / (N - 1);
    let z = 0, got = first.length ? firstShare : 0;
    for (const k of order) {
      if (firstSet.has(k)) { zone[k] = 0; continue; }
      const w = worth(k);
      const limit = firstShare + each * z;
      if (got + w / 2 > limit && z < N - 1) z++;
      zone[k] = z; got += w;
    }
    // smooth the edges a little: a cell with three sides in earlier zones goes in with them
    for (let pass = 0; pass < 2; pass++) for (const k of cells) {
      if (zone[k] <= 0) continue;
      const i = k % nx, j = Math.floor(k / nx), nb: number[] = [];
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di, b = j + dj;
        if (a >= 0 && b >= 0 && a < nx && b < ny && inField[b * nx + a]) nb.push(zone[b * nx + a]);
      }
      const before = nb.filter((q) => q < zone[k]);
      if (before.length >= 3 || (before.length >= 2 && nb.length <= 2)) zone[k] = Math.max(...before);
    }
    // a zone left with nothing in it (a tiny map) goes, and the rest close up
    const used = [...new Set(cells.map((k) => zone[k]))].sort((a, b) => a - b);
    for (const k of cells) zone[k] = used.indexOf(zone[k]);
    this.grid = zone;
    this.name(mapId, used.length, cells, road, centre, [hx, hy]);
  }

  private name(mapId: string, N: number, cells: number[], road: Float64Array, centre: (k: number) => [number, number], home: [number, number]) {
    const map = this.map, c = this.c;
    const ds = (BUILT_IN[`../public/maps/${mapId}-districts.json`]?.ds ?? []).map(([x, y, n, kind]) => ({ x, y, n: String(n).replace(/\s*\(.*\)\s*$/, ""), r: RANK[kind] ?? 5 }));
    const taken = new Set<string>();
    const places = [...(map.d.pl ?? []), ...(map.wide?.d.pl ?? [])].filter((p) => p.n && p.r.length >= 3)
      .map((p) => ({ n: p.n, a: ringArea(p.r), x: p.r.reduce((s, q) => s + q[0], 0) / p.r.length, y: p.r.reduce((s, q) => s + q[1], 0) / p.r.length }))
      .sort((a, b) => b.a - a.a || a.n.localeCompare(b.n));
    const sockets = Math.max(4, Math.min(6, Math.round(24 / Math.max(1, N - 1))));
    for (let i = 0; i < N; i++) {
      const mine = cells.filter((k) => this.grid[k] === i);
      let wx = 0, wy = 0, ww = 0;
      for (const k of mine) { const [x, y] = centre(k), w = road[k] + 50; wx += x * w; wy += y * w; ww += w; }
      // its middle: the cell with streets in it nearest where the streets' weight falls (a ring of a
      // zone has its weight in the hole, which isn't it)
      const gx = wx / ww, gy = wy / ww;
      const mid = mine.reduce((b, k) => { const [x, y] = centre(k), d = Math.hypot(x - gx, y - gy) - (road[k] > 0 ? c : 0); return d < b.d ? { k, d } : b; }, { k: mine[0], d: Infinity }).k;
      const [mx, my] = centre(mid);
      // the first zone is named after where everyone starts, the rest after their middles
      const [rx, ry] = i ? [mx, my] : home;
      const inside = (x: number, y: number) => this.zoneAtData(x, y) === i;
      const here = ds.filter((d) => inside(d.x, d.y) && !taken.has(d.n))
        .sort((a, b) => a.r - b.r || Math.hypot(a.x - rx, a.y - ry) - Math.hypot(b.x - rx, b.y - ry) || a.n.localeCompare(b.n));
      let name = "";
      if (here.length) {
        name = here[0].n;
        const other = here.find((d) => d !== here[0] && d.r <= 1 && here[0].r <= 1 && Math.hypot(d.x - here[0].x, d.y - here[0].y) > 1200);
        if (other && i > 0) name += ` and ${other.n}`;
        taken.add(here[0].n); if (other) taken.add(other.n);
      } else {
        const p = places.find((q) => inside(q.x, q.y) && !taken.has(q.n));
        if (p) { name = p.n; taken.add(p.n); }
      }
      this.list.push({ i, name: name || (i ? `The far side, part ${i}` : "Where it all starts"), cells: mine.length, km2: (mine.length * c * c) / 1e6, x: mx, z: -my, home: null, sockets: i < N - 1 ? sockets : 0 });
    }
    this.list.forEach((zn, i) => { this.cum[i + 1] = this.cum[i] + zn.sockets; });
    // each structure on open ground in its own zone: the first near where everyone starts, the rest near their middles
    const homes: [number, number][] = [];
    for (const zn of this.list) {
      if (!zn.sockets) continue;
      const lim = this.limited(zn.i);
      const at = openGround(lim, homes, zn.i ? [zn.x, -zn.z] : undefined) ?? this.anyCell(zn.i, road, centre);
      if (!at) continue;
      homes.push([at.x, at.y]);
      zn.home = { x: at.x, z: -at.y, y: map.ground(at.x, -at.y), n: at.n };
    }
  }

  /** The cell with the most streets in zone i, for a structure that found no open ground. */
  private anyCell(i: number, road: Float64Array, centre: (k: number) => [number, number]) {
    let best = -1;
    for (let k = 0; k < this.grid.length; k++) if (this.grid[k] === i && (best < 0 || road[k] > road[best])) best = k;
    if (best < 0) return null;
    const [x, y] = centre(best);
    return { x, y, n: "" };
  }

  // ---- where things are -------------------------------------------------------------------------

  private at(i: number, j: number) { return i < 0 || j < 0 || i >= this.nx || j >= this.ny ? -1 : this.grid[j * this.nx + i]; }

  private zoneAtData(x: number, y: number) { return this.at(Math.floor((x - this.x0) / this.c), Math.floor((y - this.y0) / this.c)); }

  /** The zone scene (x, z) is in, or -1 outside them all. */
  zoneAt(x: number, z: number) { return this.zoneAtData(x, -z); }

  /** How far scene (x, z) is inside the cells ok() allows (negative outside them), out to NEAR cells off. */
  private edgeIn(x: number, z: number, ok: (g: number) => boolean): number {
    const u = (x - this.x0) / this.c, v = (-z - this.y0) / this.c, i = Math.floor(u), j = Math.floor(v);
    const g0 = this.at(i, j), here = g0 < 0 || ok(g0);
    let best = Infinity;
    for (let dj = -NEAR; dj <= NEAR; dj++) for (let di = -NEAR; di <= NEAR; di++) {
      if (!di && !dj) continue;
      const g = this.at(i + di, j + dj);
      if ((g < 0 || ok(g)) === here) continue;
      const a = i + di, b = j + dj;
      const d = Math.hypot(Math.max(a - u, 0, u - a - 1), Math.max(b - v, 0, v - b - 1));
      if (d < best) best = d;
    }
    if (best === Infinity) return here ? 1e6 : -1e6;
    return (here ? best : -best) * this.c;
  }

  /** The nearest spot to scene (x, z) at least r inside the cells ok() allows. */
  private insideOf(x: number, z: number, r: number, ok: (g: number) => boolean): [number, number] {
    const u = (x - this.x0) / this.c, v = (-z - this.y0) / this.c, i = Math.floor(u), j = Math.floor(v), c = this.c;
    let best: [number, number] | null = null, bd = Infinity;
    const shut = (a: number, b: number) => { const g = this.at(a, b); return g >= 0 && !ok(g); };
    for (let dj = -NEAR - 1; dj <= NEAR + 1; dj++) for (let di = -NEAR - 1; di <= NEAR + 1; di++) {
      const a = i + di, b = j + dj, g = this.at(a, b);
      if (g < 0 || !ok(g)) continue;
      const lx = this.x0 + a * c + (shut(a - 1, b) ? r : 0), hx = this.x0 + (a + 1) * c - (shut(a + 1, b) ? r : 0);
      const ly = this.y0 + b * c + (shut(a, b - 1) ? r : 0), hy = this.y0 + (b + 1) * c - (shut(a, b + 1) ? r : 0);
      const px = Math.max(lx, Math.min(hx, x)), py = Math.max(ly, Math.min(hy, -z));
      const d = Math.hypot(px - x, py + z);
      if (d < bd && this.edgeIn(px, -py, ok) >= r - 0.05) { bd = d; best = [px, -py]; }
    }
    if (best) return best;
    const h = this.list[0].home ?? this.list[0];
    return [h.x, h.z];
  }

  /** The map as a challenge sees it while it's being placed in zone k: the force field shrunk to that zone. */
  limited(k: number): GameMap {
    let m = this.only.get(k);
    if (m) return m;
    const ok = (g: number) => g === k, base = this.map;
    const edge = (x: number, z: number) => Math.min(base.fieldEdgeBase(x, z), this.edgeIn(x, z, ok));
    const inside = (x: number, z: number, r: number): [number, number] => {
      const p = base.fieldEdgeBase(x, z) < r ? base.fieldInsideBase(x, z, r) : [x, z] as [number, number];
      return this.edgeIn(p[0], p[1], ok) < r ? this.insideOf(p[0], p[1], r, ok) : p;
    };
    m = new Proxy(base, { get: (t, p, recv) => (p === "fieldEdge" ? edge : p === "fieldInside" ? inside : Reflect.get(t, p, recv)) });
    this.only.set(k, m);
    return m;
  }

  // ---- opening up ------------------------------------------------------------------------------

  get count() { return this.list.length; }
  /** How many zones are open (all of them in free play). */
  get open() { return this.all ? this.list.length : this.openN; }
  get free() { return this.all; }
  /** Every socket on the map. */
  get sockets() { return this.cum[this.list.length]; }
  /** How many sockets must be full for zone k to open. */
  need(k: number) { return this.cum[Math.max(0, Math.min(k, this.list.length - 1))]; }
  /** How many zones are open with f sockets full. */
  openFor(f: number) { let n = 1; while (n < this.list.length && f >= this.cum[n]) n++; return n; }
  /** The zone whose structure takes the next object, with f full: null once they're all full. */
  current(f: number): Zone | null { const z = this.list[this.openFor(f) - 1]; return z?.sockets ? z : null; }
  isOpen(k: number) { return k >= 0 && k < this.open; }

  /** Set how far things have got. Moves the wall if it's changed. */
  set(f: number, all: boolean) {
    const n = this.openFor(f);
    if (n === this.openN && all === this.all) return;
    this.openN = n; this.all = all;
    this.map.zoneFence = all || n >= this.list.length ? null : this.fence;
    this.version++;
    this.build();
  }

  // ---- travel ----------------------------------------------------------------------------------

  /** Which zone each way of getting about on this map opens with, from where it is. */
  planTravel(found: TravelFind[]) {
    this.travel.clear();
    this.version++;
    const zoneOf = (t: TravelFind) => {
      const zs = t.at.map(([x, z]) => Math.max(0, this.zoneAt(x, z)));
      return zs.length ? (t.all ? Math.max(...zs) : Math.min(...zs)) : 0;
    };
    // a kind found in more than one place (two bus routes) opens with the first of them
    const first = new Map<TravelKind, number>();
    for (const t of found) first.set(t.kind, Math.min(first.get(t.kind) ?? Infinity, zoneOf(t)));
    // the slotted ones in the order the map can have them, then as listed, from the second zone on
    let slot = 1;
    for (const kind of SLOTTED.filter((k) => first.has(k)).sort((a, b) => first.get(a)! - first.get(b)! || SLOTTED.indexOf(a) - SLOTTED.indexOf(b))) {
      const k = Math.min(this.list.length - 1, Math.max(slot, first.get(kind)!));
      this.travel.set(kind, k);
      slot = k + 1;
    }
    for (const [kind, k] of first) if (!SLOTTED.includes(kind)) this.travel.set(kind, k);
  }

  /** Whether this map has a way of getting about at all. */
  has(kind: TravelKind) { return this.travel.has(kind); }
  /** Whether a way of getting about is running yet. */
  can(kind: TravelKind) { const k = this.travel.get(kind); return k === undefined || this.isOpen(k); }
  /** What a closed one says. */
  shut(kind: TravelKind) { return TRAVEL_SHUT[kind]; }
  /** The lines for zone k's card: the ways of getting about it opens. */
  news(k: number) { return [...this.travel].filter(([, z]) => z === k && k > 0).map(([t]) => TRAVEL_LINE[t]); }
  /** For the debug panel and the report: each travel kind and its zone. */
  travelPlan() { return [...this.travel].map(([t, z]) => `${t} ${z + 1}`).join(", "); }

  // ---- the wall and the maps -------------------------------------------------------------------

  /** Draw the wall in the scene with the force field's own look. */
  show(scene: THREE.Scene, look: THREE.Material) { this.scene = scene; this.wallLook = look; this.build(); }

  /** The edges between open and shut cells inside the force field, scene coordinates [ax, az, bx, bz]. */
  edges(): number[][] {
    const out: number[][] = [];
    if (!this.map.zoneFence) return out;
    const c = this.c, open = (g: number) => g < 0 || g < this.openN;
    for (let j = 0; j < this.ny; j++) for (let i = 0; i < this.nx; i++) {
      const g = this.at(i, j);
      if (g < 0 || !open(g)) continue;
      const X = this.x0 + i * c, Y = this.y0 + j * c;
      if (this.at(i + 1, j) >= 0 && !open(this.at(i + 1, j))) out.push([X + c, -Y, X + c, -(Y + c)]);
      if (this.at(i - 1, j) >= 0 && !open(this.at(i - 1, j))) out.push([X, -(Y + c), X, -Y]);
      if (this.at(i, j + 1) >= 0 && !open(this.at(i, j + 1))) out.push([X, -(Y + c), X + c, -(Y + c)]);
      if (this.at(i, j - 1) >= 0 && !open(this.at(i, j - 1))) out.push([X + c, -Y, X, -Y]);
    }
    return out;
  }

  /** The shut cells, scene coordinates [x0, z0, x1, z1] (runs along a row joined up), for the maps. */
  shutCells(): number[][] {
    const out: number[][] = [], c = this.c;
    if (!this.map.zoneFence) return out;
    for (let j = 0; j < this.ny; j++) {
      let run = -1;
      for (let i = 0; i <= this.nx; i++) {
        const g = i < this.nx ? this.at(i, j) : -1, shut = g >= 0 && g >= this.openN;
        if (shut && run < 0) run = i;
        if (!shut && run >= 0) { out.push([this.x0 + run * c, -(this.y0 + (j + 1) * c), this.x0 + i * c, -(this.y0 + j * c)]); run = -1; }
      }
    }
    return out;
  }

  private build() {
    if (this.wall) { this.wall.removeFromParent(); this.wall.geometry.dispose(); this.wall = null; }
    if (!this.scene || !this.wallLook || !this.map.zoneFence) return;
    const pos: number[] = [], uv: number[] = [], idx: number[] = [], k = 1 / (Math.PI * 2 * this.map.field);
    let along = 0;
    for (const [ax, az, bx, bz] of this.edges()) {
      const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(len / 12));
      let prev = -1;
      for (let s = 0; s <= n; s++) {
        const x = ax + ((bx - ax) * s) / n, z = az + ((bz - az) * s) / n;
        const inside = this.map.fieldEdgeBase(x, z) > -2;
        if (!inside) { prev = -1; continue; }
        const g = this.map.ground(x, z), v = pos.length / 3;
        pos.push(x, g - 40, z, x, g + 260, z);
        const u = (along + (len * s) / n) * k;
        uv.push(u, 0, u, 1);
        if (prev >= 0) idx.push(prev, v, prev + 1, prev + 1, v, v + 1);
        prev = v;
      }
      along += len;
    }
    if (!idx.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    this.wall = new THREE.Mesh(geo, this.wallLook);
    this.wall.renderOrder = 5;
    this.wall.frustumCulled = false;
    this.scene.add(this.wall);
  }

  /** For the debug panel: the zone you're in, and the next zone's sockets. */
  describe(x: number, z: number, f: number) {
    const k = this.zoneAt(x, z), cur = this.current(f);
    const here = k >= 0 ? `${k + 1} ${this.list[k].name}` : "outside";
    const next = this.all ? "free play: everything open" : cur ? `${f - this.need(cur.i)}/${cur.sockets} sockets in ${cur.name} open zone ${cur.i + 2}` : "every zone open";
    return `Zone ${here}; ${this.open}/${this.count} open; ${next}; travel ${this.travelPlan() || "none"}`;
  }

  dispose() { this.map.zoneFence = null; if (this.wall) { this.wall.removeFromParent(); this.wall.geometry.dispose(); } }
}
