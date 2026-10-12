// Map data (built by tools/prep_map.py) plus the queries the game needs: ground height,
// collision against buildings, walls and trees, and bullet raycasts. Outside the detailed map,
// the wider map round it (wide.ts), where there is one, answers the same questions.
//
// Data coordinates are metres east (x) and north (y) of the map centre, with absolute elevations.
// Scene coordinates: X = east, Y = up (metres above the map's lowest point, z0), Z = -north.

import { loadWide, type Wide } from "./wide";
import type { CanalData } from "./canal";
import type { RailData } from "./railway";
import { twertonSolids } from "./landmarks/twerton";

export interface Terrain { nx: number; ny: number; x0: number; y0: number; dx: number; dy: number; z0: number; h: number[]; k: string }
export interface Building {
  r: number[][][]; h: number; g: number; c: string; n: string; dz: number;
  m?: string; rc?: string; w?: number;            // wall material, roof covering, has windows
  rr?: number[][]; rp?: number; hp?: number[];    // roof rectangle, ridge rise, hip insets at each end
  ch?: number[][];                                // chimney stacks
  pp?: number;                                    // parapet height above the eaves
  st?: number;                                    // storeys, when they're taller than usual
}
/** A street or path: its class, name and points [x, y, z], or [x, y, z, 1] on a bridge's span
 *  (tools/prep_map.py). bridge: it stands clear of the ground somewhere (over the river, the canal
 *  or the railway), and is walked and drawn at its own height there, with a deck, parapets and
 *  abutments built under and beside it (world.ts). */
export interface Road { c: string; n: string; p: number[][]; bridge?: boolean }
export interface Pond { r: number[][][]; z: number }
export interface Line { c: string; p: number[][] }
export interface Place { n: string; r: number[][] }
/** The bored part of a road or path through a hill (tools/tunnels.py): its floor, portal to portal, as [x, y, z]. */
export interface Tunnel { c: string; n: string; p: number[][] }
/** A football pitch ["f", x, y, length, width, angle], a rugby pitch ["r", x, y, length, width, angle],
 *  or a cricket field ["c", x, y, angle, boundary rope ring, sightscreens [[x, y], ...]]. The angle
 *  is the long axis (the wicket, for cricket). */
export type Pitch = ["f", number, number, number, number, number] | ["r", number, number, number, number, number] | ["c", number, number, number, number[][], number[][]];
export type Oblong = Extract<Pitch, ["f" | "r", ...unknown[]]>;
export interface MapData {
  id?: string; name?: string; release: string; centre: [number, number]; field: number; b: [number, number, number, number];
  fc?: [number, number];                          // the force field's centre, if it isn't the map centre
  v?: [number, number];                           // what the menu backdrop circles around
  t: Terrain; bl: Building[]; rd: Road[]; wp: Pond[]; wl: Line[]; br: Line[]; tr: number[][];
  bk?: number;                  // 1: the ground already slopes down to the water (newer builds); otherwise the game does it
  gt?: (number | string)[][];   // garden gates: x0, y0, x1, y1, ground, boundary style
  fx?: (number | string)[][];   // street items: kind, x, y, ground, angle, ...
  mk?: number[][];              // road markings: x0, y0, x1, y1, z0, z1, kind
  sh?: (number | string)[][];   // shop signs: x, y, ground, angle, width, name, style
  lm?: (number | string)[][];   // landmarks: kind, x, y, ground, angle, ...
  dr?: number[][];              // front doors: x, y, ground, angle, colour, window bays on its wall
  sb?: number[][];              // shrubs: x, y, ground, height
  fp?: number[][];              // front paths, gate to door: x0, y0, x1, y1
  dv?: number[][];              // driveways, gap to house: x0, y0, x1, y1
  by?: (number | string)[][];   // bay windows: x, y, ground, angle, storeys, wall material, width
  wr?: number[][];              // overhead wires: x0, y0, z0, x1, y1, z1 (absolute heights)
  cn?: { x0: number; y0: number; step: number; nx: number; ny: number; h: string };   // canopy heights over woods
  pi?: Pitch[];                 // sports pitches: football and rugby pitches and cricket fields
  spawn?: number[][];           // where players appear (Firs Field)
  pl?: Place[];                                   // named areas, smallest first
  tn?: Tunnel[];                                  // tunnels you can walk through
  tile?: [number, number];                        // which full-detail square this is (tiles.ts), for one of those
}

/** Heights of walls, fences and hedges, from the map data and from the inferred garden plots. */
export const BARRIER_HEIGHT: Record<string, number> = {
  // Everything can be jumped (a jump clears about 1.6 m). Mapped walls carry no height; around
  // here they are mostly low field and boundary walls of about 3 ft.
  wall: 0.9, retaining_wall: 0.9, fence: 1.2, hedge: 1.3,
  garden_wall: 0.9, brick_wall_low: 0.75, hedge_low: 1.0, railing: 1.0, // front gardens
  stone_wall: 1.1, brick_wall: 1.2,                                    // between gardens
};
/** The full-detail squares round a map (built by tools/prep_tiles.py into public/maps/<id>/):
 *  each is cells x cells of the terrain grid that starts at (x0, y0), dx apart. */
export interface TileIndex { x0: number; y0: number; dx: number; cells: number; z0: number; tiles: [number, number][] }
export const tileKey = (ti: number, tj: number) => (ti + 512) * 1024 + (tj + 512);
/** A parked car out in a square of Bath is vehicle TILE_CAR + its square's tileKey * 65536 + its
 *  number there, so everyone means the same car whatever they have loaded (vehicles.ts). */
export const TILE_CAR = 2 ** 40;
/** A pitch's number in the game (sport.ts, sent over the network): its place in Combe Down's own
 *  list, or, out in a square of Bath, PITCH_TILE + the square's tileKey * 256 + its place there. */
export const PITCH_TILE = 2 ** 30;
export function pitchId(m: GameMap, i: number): number {
  return m.d.tile ? PITCH_TILE + tileKey(m.d.tile[0], m.d.tile[1]) * 256 + i : i;
}

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
export function rugbyLayout(p: Oblong) {
  const L = p[3] - 2, W = p[4] - 2;                          // lines a metre in from the mapped edge
  const goal = Math.min(10, Math.max(4, L * 0.08));          // in-goal depth
  return { L, W, goal, F: L / 2 - goal };                    // F: centre to try line
}
/** Where a rugby pitch's four uprights stand (data coords). */
export function rugbyUprights(p: Oblong): number[][] {
  const { F } = rugbyLayout(p), ux = Math.cos(p[5]), uy = Math.sin(p[5]);
  const out: number[][] = [];
  for (const s of [-F, F]) for (const t of [-POST_GAP / 2, POST_GAP / 2]) out.push([p[1] + ux * s - uy * t, p[2] + uy * s + ux * t]);
  return out;
}
/** A football pitch drawn a metre inside its mapped rectangle: its length and width, the goal (a
 *  full-size one, or a junior one on a pitch under 85 m), and the penalty area, the goal area
 *  (length out from the goal line, width), the penalty spot and the centre circle's radius, all
 *  scaled down on a smaller pitch. */
export function footballLayout(p: Oblong) {
  const L = p[3] - 2, W = p[4] - 2, sc = Math.min(1, Math.max(0.5, L / 100));
  const goal = L >= 85 ? { w: 7.32, h: 2.44 } : { w: 4.88, h: 1.83 };
  return { L, W, goal, box: [16.5 * sc, Math.min(40.32 * sc, W - 6)], six: [5.5 * sc, Math.min(18.32 * sc, W - 12)], spot: 11 * sc, circle: 9.15 * sc };
}
/** Where a football pitch's four goalposts stand (data coords). */
export function footballPosts(p: Oblong): number[][] {
  const { L, goal } = footballLayout(p), ux = Math.cos(p[5]), uy = Math.sin(p[5]);
  const out: number[][] = [];
  for (const s of [-L / 2, L / 2]) for (const t of [-goal.w / 2, goal.w / 2]) out.push([p[1] + ux * s - uy * t, p[2] + uy * s + ux * t]);
  return out;
}

const CELL = 8;

/** A tunnel's cross-section (tools/tunnels.py): half the floor's width, floor to the top of the arch,
 *  and half the width of the stone face round each portal (as wide as the cutting it stands in). */
export const TUNNEL = { half: 2.4, crown: 5.2, face: 6.4 };

export interface RayHit { dist: number; kind: "ground" | "building" | "barrier" | "tree"; nx: number; ny: number; nz: number }

export class GameMap {
  readonly d: MapData;
  readonly z0: number;
  /** Radius of the force field: the play area. */
  readonly field: number;
  /** The force field's centre, scene x and z. */
  readonly fieldX: number; readonly fieldZ: number;
  /** The wider, simpler map round this one (the rest of Bath), if it has one. */
  readonly wide: Wide | null;
  /** How the full-detail squares round this map are laid out (tiles.ts), if it has them. */
  tileIndex: TileIndex | null = null;
  /** Where the squares are fetched from: <tileBase><ti>_<tj>.json. */
  tileBase = "";
  /** The full-detail squares loaded round the player (and, for the host, round everyone), by tileKey. */
  readonly tiles = new Map<number, GameMap>();
  /** Goes up each time a square is loaded or dropped, so anything worked out from them knows to look again. */
  tilesVersion = 0;
  /** Parked cars out in the squares that someone has got in (TILE_CAR numbers): they stay gone when their square loads again. */
  readonly takenTileCars = new Set<number>();
  // the detailed terrain grid's far edges (data coords)
  private tx1: number; private ty1: number;
  // bridge decks: each road's points in scene coords [x, z, y] and half its width, by square
  private decks: { p: number[][]; half: number }[] = [];
  private deckCells = new Map<number, number[]>();
  // tunnel floors, scene coords: (ax, az, ay) -> (bx, bz, by)
  private tA: number[][] = []; private tB: number[][] = [];
  private tunnelCells = new Map<number, number[]>();
  private hgt: Float32Array;
  // collision segments, scene coords: (ax, az) -> (bx, bz), with the top of the obstacle
  private sAx: number[] = []; private sAz: number[] = []; private sBx: number[] = []; private sBz: number[] = [];
  private sTop: number[] = []; private sKind: number[] = [];
  private sRoof: number[] = [];   // a building's wall: its eaves, at or above which you're on its roof and walk over it
  // flat-topped solid blocks you can stand on (a stadium's terraces and seats), scene coords
  private blocks: { x: number; z: number; a: number; hl: number; hw: number; top: number }[] = [];
  private blockCells = new Map<number, number[]>();
  private bCells = new Map<number, number[]>();
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
  readonly spare: { f: (string | number)[]; seg: number; taken?: boolean }[] = [];
  private spareCells = new Map<number, number[]>();
  /** The canal and the railways round the map, from <map>-canal.json and <map>-rail.json, if it has them. */
  canalData: CanalData | null = null;
  railData: RailData | null = null;
  /** The canal, once built (world.ts): the map's own water that's part of it is left out. Tiles share the main map's. */
  canal: { pondLevel(w: Pond): number | null | undefined } | null = null;
  /** More to stand on, from the canal and the railways (scene Y at scene x, z, or null): counted when
   *  it's no more than a step above the feet, like a bridge deck. */
  floors: ((x: number, z: number) => number | null)[] = [];
  /** Hide a parked car's furniture once it's become a vehicle (furniture.ts sets this). */
  onTakeCar: (f: (string | number)[]) => void = () => {};

  /** For a full-detail square of Bath (tiles.ts): the rest of its setup, a slice at a time, still to do
   *  before it can be walked on and shot at. */
  setup: Generator<void> | null = null;

  /** slow: leave the walls, roofs and trunks for setup to work through a slice at a time. */
  constructor(d: MapData, wide: Wide | null = null, slow = false) {
    this.d = d;
    const T = d.t;
    this.z0 = T.z0;
    this.wide = wide;
    this.tx1 = T.x0 + (T.nx - 1) * T.dx; this.ty1 = T.y0 + (T.ny - 1) * T.dy;
    // the wide grid has a vertex on every third of this one's along the edge: in between, the
    // edge runs straight from one to the next, as the wide terrain's triangles do, so there's no gap
    const step = wide?.d.t.ci[2] ?? 0;
    if (step && (T.nx - 1) % step === 0 && (T.ny - 1) % step === 0) {
      const edge = (n: number, at: (k: number) => number) => {
        for (let k = 0; k < n; k++) if (k % step) {
          const a = at(k - (k % step)), b = at(k - (k % step) + step), t = (k % step) / step;
          T.h[at(k)] = Math.round(T.h[a] + (T.h[b] - T.h[a]) * t);
        }
      };
      edge(T.nx, (i) => i); edge(T.nx, (i) => (T.ny - 1) * T.nx + i);
      edge(T.ny, (j) => j * T.nx); edge(T.ny, (j) => j * T.nx + T.nx - 1);
    }
    this.hgt = Float32Array.from(T.h, (v) => v / 10);
    if (!d.bk) this.bankWater();
    // with a wider map round it, the force field takes in the whole of that
    this.field = wide?.field ?? d.field;
    this.fieldX = wide ? wide.fx : d.fc?.[0] ?? 0; this.fieldZ = -(wide ? wide.fy : d.fc?.[1] ?? 0);
    const job = this.build();
    if (slow) this.setup = job;
    else while (!job.next().done);
  }

  /** Everything solid: bridge decks, tunnels, buildings, walls, trunks, parked cars and posts (yields between slices). */
  private *build(): Generator<void> {
    const d = this.d, wide = this.wide;
    // bridges: a road whose stored height stands well clear of the ground somewhere is walked,
    // driven and drawn at that height, not on the ground (or the river bed) under it
    for (const r of d.rd) if (r.p.some((q) => q[3] === 1 || q[2] - this.z0 - this.ground(q[0], -q[1]) > 0.8)) r.bridge = true;
    // a bridge's parapets, either side of the deck (and its pavements), stop you walking off it
    const g = (x: number, z: number) => this.ground(x, z);
    for (const r of d.rd) {
      if (!r.bridge) continue;
      const half = deckHalf(r.c) + 0.17;
      for (const [a, b] of bridgeSpans(r, g, this.z0)) {
        const seg = r.p.slice(a, b + 1), tops = seg.map((q) => deckTop(q, g, this.z0));
        for (const side of [1, -1]) {
          const w = offsetLine(seg, half * side);
          for (let i = 0; i < w.length - 1; i++) this.addSeg(w[i][0], -w[i][1], w[i + 1][0], -w[i + 1][1], Math.max(tops[i], tops[i + 1]) + 1.25, 1);
        }
      }
    }
    for (const r of [...d.rd, ...wide?.rd ?? []]) {
      if (!r.bridge) continue;
      const k = this.decks.length, half = roadHalf(r.c) + 0.4, seen = new Set<number>();
      this.decks.push({ p: r.p.map((q) => [q[0], -q[1], q[2] - this.z0]), half });
      for (let i = 0; i < r.p.length - 1; i++) {
        const a = r.p[i], b = r.p[i + 1], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (CELL / 2)));
        for (let s = 0; s <= n; s++)
          for (const c of this.cellsAround(a[0] + (b[0] - a[0]) * s / n, -(a[1] + (b[1] - a[1]) * s / n), half))
            if (!seen.has(c)) { seen.add(c); push(this.deckCells, c, k); }
      }
    }
    yield;
    // walls, fences and hedges stop at the kerb (and with a wider map round this one, none runs
    // along the edge where its streets carry on)
    d.br = yield* clearOfRoads(d.br, d.rd, wide ? d.b : null);

    // tunnels: walls down both sides, as high as the arch, so nothing on the hill above bumps into them
    for (const t of d.tn ?? []) {
      const p = t.p;
      for (let i = 0; i < p.length - 1; i++) {
        const k = this.tA.length;
        this.tA.push([p[i][0], -p[i][1], p[i][2] - this.z0]); this.tB.push([p[i + 1][0], -p[i + 1][1], p[i + 1][2] - this.z0]);
        const len = Math.hypot(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]), n = Math.max(1, Math.ceil(len / (CELL / 2)));
        const seen = new Set<number>();
        for (let s = 0; s <= n; s++) {
          const x = p[i][0] + ((p[i + 1][0] - p[i][0]) * s) / n, z = -(p[i][1] + ((p[i + 1][1] - p[i][1]) * s) / n);
          for (const c of this.cellsAround(x, z, TUNNEL.half + 1)) if (!seen.has(c)) { seen.add(c); push(this.tunnelCells, c, k); }
        }
      }
      // the portals' stone faces, either side of the arch
      for (const [a, b] of [[p[0], p[1]], [p[p.length - 1], p[p.length - 2]]]) {
        const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / l, ny = (b[0] - a[0]) / l;
        for (const side of [1, -1]) {
          const s0 = TUNNEL.half * side, s1 = TUNNEL.face * side;
          this.addSeg(a[0] + nx * s0, -(a[1] + ny * s0), a[0] + nx * s1, -(a[1] + ny * s1), a[2] - this.z0 + TUNNEL.crown + 1.5, 0);
        }
      }
      for (const side of [1, -1]) {
        const w = offsetLine(p, TUNNEL.half * side);
        for (let i = 0; i < w.length - 1; i++) {
          const top = Math.max(p[i][2], p[i + 1][2]) - this.z0 + TUNNEL.crown;
          this.addSeg(w[i][0], -w[i][1], w[i + 1][0], -w[i + 1][1], top, 0);
        }
      }
    }

    yield;
    for (let bi = 0; bi < d.bl.length; bi++) {
      const b = d.bl[bi];
      if (bi % 200 === 199) yield;
      const top = b.g - this.z0 + b.h + Math.max(b.pp ?? 0, b.rp ? b.rp * 0.6 : 0.2), first = this.sAx.length;
      for (const ring of b.r) this.addRing(ring, top, 0);
      for (let i = first; i < this.sAx.length; i++) this.sRoof[i] = b.g - this.z0 + b.h;
      // and which squares it covers, for standing on its roof
      const xs = b.r[0].map((p) => p[0]), zs = b.r[0].map((p) => -p[1]);
      const i0 = Math.floor(Math.min(...xs) / CELL), i1 = Math.floor(Math.max(...xs) / CELL);
      const j0 = Math.floor(Math.min(...zs) / CELL), j1 = Math.floor(Math.max(...zs) / CELL);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) push(this.bCells, key(i, j), bi);
    }
    for (let k = 0; k < d.br.length; k++) {
      if (k % 400 === 399) yield;
      const p = d.br[k].p, hh = BARRIER_HEIGHT[d.br[k].c] ?? 1.5;
      for (let i = 0; i < p.length - 1; i++) {
        const top = Math.max(p[i][2], p[i + 1][2]) - this.z0 + hh;
        this.addSeg(p[i][0], -p[i][1], p[i + 1][0], -p[i + 1][1], top, 1);
      }
    }
    yield;
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
    yield;
    // street items that block: parked cars and bus shelters as boxes, posts as circles
    for (const f of d.fx ?? []) {
      const [kind, x, y, z, a] = f as [string, number, number, number, number];
      const g = z - this.z0;
      if (kind === "car") {
        this.cellsAround(x, -y, 2.1).forEach((k) => push(this.spareCells, k, this.spare.length));
        this.spare.push({ f, seg: this.sAx.length });
        this.addBox(x, y, a, 0, 2.05, 0.88, g + 1.45);
      }
      else if (kind === "bus" && f[6]) this.addBox(x, y, a, -0.75, 1.55, 0.6, g + 2.4);
      else if (kind === "lamp") this.addPost(x, y, 0.12, g + 6.4);
      else if (kind === "postbox" || kind === "bin") this.addPost(x, y, 0.28, g + 1.25);
      else if (kind === "wheelie") this.addPost(x, y, 0.34, g + 1.1);
      else if (kind === "pole") this.addPost(x, y, 0.15, g + 8);
      else if (kind === "bollard") this.addPost(x, y, 0.1, g + 0.9);
    }
    // big landmark trees: their trunks are solid
    for (const [kind, x, y, z] of [...d.lm ?? [], ...wide?.d.lm ?? []]) if (kind === "oak") this.addPost(+x, +y, 1.1, +z - this.z0 + 6);
    // a football ground's stands, floodlights and hoardings: solid, and you can stand on the terraces
    for (const [kind, x, y, z, a, ...rest] of d.lm ?? []) {
      if (kind !== "twerton") continue;
      const ux = Math.cos(+a), uy = Math.sin(+a), g = +z - this.z0;
      const at = (s: number, t: number) => [+x + ux * s - uy * t, +y + uy * s + ux * t];
      const { boxes, posts } = twertonSolids(rest);
      for (const b of boxes) {
        const [cx, cy] = at((b.s0 + b.s1) / 2, (b.t0 + b.t1) / 2);
        this.addBox(cx, cy, +a, 0, (b.s1 - b.s0) / 2, (b.t1 - b.t0) / 2, g + b.top);
        this.addBlock(cx, cy, +a, (b.s1 - b.s0) / 2, (b.t1 - b.t0) / 2, g + b.top);
      }
      for (const p of posts) { const [px, py] = at(p.s, p.t); this.addPost(px, py, p.r, g + p.top); }
    }
    // goalposts and cricket sightscreens
    for (const p of d.pi ?? []) {
      if (p[0] === "r") for (const [x, y] of rugbyUprights(p)) this.addPost(x, y, 0.3, this.ground(x, -y) + POST_HEIGHT);
      else if (p[0] === "f") for (const [x, y] of footballPosts(p)) this.addPost(x, y, 0.12, this.ground(x, -y) + footballLayout(p).goal.h + 0.1);
      else for (const [x, y] of p[5]) this.addBox(x, y, p[3] + Math.PI / 2, 0, SCREEN[0] / 2, 0.2, this.ground(x, -y) + SCREEN[1]);
    }
    this.stamp = new Uint32Array(this.sAx.length);
    this.treeStamp = new Uint32Array(this.cX.length);
  }

  /** A parked car has become a vehicle (vehicles.ts): take away its walls and its furniture. */
  takeCar(k: number) {
    const s = this.spare[k];
    if (!s) return;
    s.taken = true;
    for (let j = 0; j < 4; j++) this.sTop[s.seg + j] = -Infinity;
    this.onTakeCar(s.f);
  }

  /** Pitch number id (pitchId), wherever in Bath it is, if it's loaded here. */
  pitch(id: number): Pitch | undefined {
    if (!Number.isInteger(id) || id < 0) return undefined;
    if (id < PITCH_TILE) return this.d.pi?.[id];
    const n = id - PITCH_TILE;
    return this.tiles.get(Math.floor(n / 256))?.d.pi?.[n % 256];
  }

  /** This map and the full-detail squares loaded round it: everywhere there's street-level detail. */
  areas(): GameMap[] { return [this, ...this.tiles.values()]; }

  /** Parked cars still in the street furniture within r of (x, z), here and in the squares round
   *  about: scene coords, angle, and the ground under them. */
  parkedNear(x: number, z: number, r: number): { x: number; z: number; a: number; g: number }[] {
    const out: { x: number; z: number; a: number; g: number }[] = [];
    for (const m of [this, ...this.tilesNear(x, z, r)]) for (const i of m.spareNear(x, z, r)) {
      const [, px, py, pg, a] = m.spare[i].f as [string, number, number, number, number];
      out.push({ x: px, z: -py, a, g: pg - this.z0 });
    }
    return out;
  }

  /** Which of this map's own parked cars (their numbers in spare) are within r of (x, z), not yet taken. */
  spareNear(x: number, z: number, r: number): number[] {
    const out: number[] = [], seen = new Set<number>();
    for (const k of this.cellsAround(x, z, r)) for (const i of this.spareCells.get(k) ?? []) {
      const s = this.spare[i];
      if (seen.has(i) || s.taken) continue;
      seen.add(i);
      const [, px, py] = s.f as [string, number, number];
      if (Math.hypot(px - x, -py - z) < r) out.push(i);
    }
    return out;
  }

  /** Square key and car number of a TILE_CAR vehicle number. */
  static tileCar(i: number): [number, number] { const n = i - TILE_CAR; return [Math.floor(n / 65536), n % 65536]; }

  /** Someone's got in parked car i out in a square (a TILE_CAR number): take it off the street, now and whenever its square loads. */
  takeTileCar(i: number) {
    this.takenTileCars.add(i);
    const [key, k] = GameMap.tileCar(i);
    this.tiles.get(key)?.takeCar(k);
  }

  /** A square has finished loading (tiles.ts): it joins in, less any of its cars already taken. */
  addTile(key: number, m: GameMap) {
    this.tiles.set(key, m);
    this.tilesVersion++;
    for (const i of this.takenTileCars) { const [tk, k] = GameMap.tileCar(i); if (tk === key) m.takeCar(k); }
  }

  dropTile(key: number) { if (this.tiles.delete(key)) this.tilesVersion++; }

  /** What there is to stand on at (x, z) for feet at y: a tunnel's floor if they're in one, otherwise the ground,
   * or the roof of a vehicle, parked car or building no more than a step above them. */
  floor(x: number, z: number, y: number): number {
    const g = this.floorHere(x, z, y);
    let extra = -Infinity;
    for (const f of this.floors) { const h = f(x, z); if (h !== null && h <= y + 0.6 && h > extra) extra = h; }
    return Math.max(g, extra);
  }

  private floorHere(x: number, z: number, y: number): number {
    let g = this.inTunnel(x, z, y) ?? this.ground(x, z);
    const on = (cx: number, cz: number, a: number, hl: number, hw: number, top: number) => {
      if (top <= g || top > y + 0.5) return;
      const c = Math.cos(a), s = Math.sin(a), dx = x - cx, dz = z - cz;
      if (Math.abs(dx * c - dz * s) < hl + 0.15 && Math.abs(dx * s + dz * c) < hw + 0.15) g = top;
    };
    for (const m of this.movers) on(m.x, m.z, m.a, m.hl, m.hw, m.top);
    for (const p of this.parkedNear(x, z, 2.5)) on(p.x, p.z, p.a, 2.05, 0.88, p.g + 1.44);
    for (const k of this.blockCells.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) ?? []) {
      const b = this.blocks[k];
      on(b.x, b.z, b.a, b.hl, b.hw, b.top);
    }
    for (const bi of this.bCells.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) ?? []) {
      const h = this.roofAt(this.d.bl[bi], x, -z);
      if (h > g && h <= y + 0.5) g = h;
    }
    const tile = this.tileAt(x, z);
    if (tile) return Math.max(g, tile.floor(x, z, y));     // a full-detail square has its own roofs, bridges and parked cars
    const dk = this.deck(x, z, y);
    if (dk !== null && dk > g) g = dk;
    if (this.wide && !this.inGrid(x, z)) {
      for (const b of this.wide.buildingsNear(x, -z, 0)) {
        const h = this.roofAt(b, x, -z);
        if (h > g && h <= y + 0.5) g = h;
      }
    }
    return g;
  }

  /** The deck of a bridge at scene (x, z), if feet at y are on it or a step below it (not down by
   *  the river under it): its height, or null. */
  deck(x: number, z: number, y: number): number | null {
    const tile = this.tileAt(x, z);
    if (tile) return tile.deck(x, z, y);
    let best: number | null = null, bd = Infinity;
    for (const k of this.deckCells.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) ?? []) {
      const { p, half } = this.decks[k];
      for (let i = 0; i < p.length - 1; i++) {
        const a = p[i], b = p[i + 1], vx = b[0] - a[0], vz = b[1] - a[1], l2 = vx * vx + vz * vz || 1;
        const t = Math.min(1, Math.max(0, ((x - a[0]) * vx + (z - a[1]) * vz) / l2));
        const d = Math.hypot(x - a[0] - vx * t, z - a[1] - vz * t);
        if (d < half && d < bd) { bd = d; best = a[2] + (b[2] - a[2]) * t; }
      }
    }
    return best !== null && best <= y + 0.6 && best > this.ground(x, z) + 0.3 ? best : null;
  }

  /** The full-detail square loaded at scene (x, z), outside this map's own grid, if any. */
  tileAt(x: number, z: number): GameMap | undefined {
    const I = this.tileIndex;
    if (!I || !this.tiles.size || this.inGrid(x, z)) return undefined;
    const S = I.cells * I.dx;
    return this.tiles.get(tileKey(Math.floor((x - I.x0) / S), Math.floor((-z - I.y0) / S)));
  }

  /** The loaded squares within r of scene (x, z). */
  tilesNear(x: number, z: number, r: number): GameMap[] {
    const I = this.tileIndex, out: GameMap[] = [];
    if (!I || !this.tiles.size) return out;
    const S = I.cells * I.dx;
    for (let ti = Math.floor((x - r - I.x0) / S); ti <= Math.floor((x + r - I.x0) / S); ti++)
      for (let tj = Math.floor((-z - r - I.y0) / S); tj <= Math.floor((-z + r - I.y0) / S); tj++) {
        const t = this.tiles.get(tileKey(ti, tj));
        if (t) out.push(t);
      }
    return out;
  }

  /** Is scene (x, z) on the detailed map's terrain grid? */
  private inGrid(x: number, z: number) {
    const T = this.d.t;
    return x >= T.x0 && x <= this.tx1 && -z >= T.y0 && -z <= this.ty1;
  }

  /** How high building b's roof is over (x, y) (data coords), or -Infinity if that's not inside it.
   * As world.ts builds it: flat at the eaves, or pitched over its roof rectangle, hipped at either end. */
  private roofAt(b: Building, x: number, y: number): number {
    if (!inRing(b.r[0], x, y) || b.r.slice(1).some((ring) => inRing(ring, x, y))) return -Infinity;
    const eave = b.g - this.z0 + b.h;
    const roof = roofFit(b);
    if (!roof) return eave;
    const q = roof.q;
    const ux = q[1][0] - q[0][0], uy = q[1][1] - q[0][1], L = Math.hypot(ux, uy) || 1;
    const vx = q[3][0] - q[0][0], vy = q[3][1] - q[0][1], Wd = Math.hypot(vx, vy) || 1;
    const mx = (q[0][0] + q[2][0]) / 2, my = (q[0][1] + q[2][1]) / 2;
    const su = ((x - mx) * ux + (y - my) * uy) / L, sv = ((x - mx) * vx + (y - my) * vy) / Wd;
    const [hip0, hip1] = roof.hp;
    // past a gable end, or out to the side, you're on the flat cap over a wing, at the eaves
    if ((!hip0 && su < -L / 2) || (!hip1 && su > L / 2)) return eave;
    const slope = roof.rp / (Wd / 2), ridge = eave + roof.rp;
    let h = ridge - Math.abs(sv) * slope;
    // hipped ends slope down the same way
    if (hip0) h = Math.min(h, ridge - Math.max(0, -su - (L / 2 - Wd / 2)) * slope);
    if (hip1) h = Math.min(h, ridge - Math.max(0, su - (L / 2 - Wd / 2)) * slope);
    return Math.max(eave, h);
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

  /** A flat top to stand on, over the rectangle addBox would make (no offset). */
  private addBlock(x: number, y: number, a: number, hl: number, hw: number, top: number) {
    const k = this.blocks.length;
    this.blocks.push({ x, z: -y, a, hl, hw, top });
    // the squares under it: walk it in steps of half a square each way
    const ux = Math.cos(a), uy = Math.sin(a), ns = Math.ceil(hl / (CELL / 2)), nt = Math.ceil(hw / (CELL / 2)), seen = new Set<number>();
    for (let i = -ns; i <= ns; i++) for (let j = -nt; j <= nt; j++) {
      const s = (hl * i) / Math.max(1, ns), t = (hw * j) / Math.max(1, nt);
      for (const c of this.cellsAround(x + ux * s - uy * t, -(y + uy * s + ux * t), 0.6)) if (!seen.has(c)) { seen.add(c); push(this.blockCells, c, k); }
    }
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
    this.sAx.push(ax); this.sAz.push(az); this.sBx.push(bx); this.sBz.push(bz); this.sTop.push(top); this.sKind.push(kind); this.sRoof.push(Infinity);
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
  /**
   * The ground near a pond or river slopes down to its water. The survey is noisy by water and
   * mostly leaves the banks a cliff's drop above it, so, as tools/prep_map.py does for newer
   * builds (bk), the ground within BANK metres of the water's edge is brought down to a slope
   * ending just above the water, except along a street (whose flattened ground stays up, as a
   * road along the river does) and round the grid's outer edge (which the squares beside this
   * one copy, so it must stay as it is).
   */
  private bankWater() {
    const T = this.d.t, nx = T.nx, ny = T.ny, h = this.hgt, BANK = 10, G = 8;
    const streets = new Map<number, number[][]>();
    for (const r of this.d.rd) {
      if (PATHS.has(r.c)) continue;
      const half = roadHalf(r.c) + 2.5;
      for (let i = 0; i < r.p.length - 1; i++) {
        const a = r.p[i], b = r.p[i + 1], seg = [a[0], a[1], b[0], b[1], half];
        for (let ci = Math.floor((Math.min(a[0], b[0]) - half) / G); ci <= Math.floor((Math.max(a[0], b[0]) + half) / G); ci++)
          for (let cj = Math.floor((Math.min(a[1], b[1]) - half) / G); cj <= Math.floor((Math.max(a[1], b[1]) + half) / G); cj++) push2(streets, key(ci, cj), seg);
      }
    }
    const segDist = (x: number, y: number, s: number[]) => {
      const vx = s[2] - s[0], vy = s[3] - s[1], t = Math.min(1, Math.max(0, ((x - s[0]) * vx + (y - s[1]) * vy) / (vx * vx + vy * vy || 1)));
      return Math.hypot(x - s[0] - vx * t, y - s[1] - vy * t);
    };
    const onStreet = (x: number, y: number) => (streets.get(key(Math.floor(x / G), Math.floor(y / G))) ?? []).some((s) => segDist(x, y, s) < s[4]);
    // (the canal is left alone: canal.ts builds its stone-walled channel at the right levels)
    const canals = this.d.wl.filter((l) => l.c === "canal");
    const nearCanal = (x: number, y: number) => canals.some((l) => l.p.some((q) => Math.hypot(q[0] - x, q[1] - y) < 14));
    for (const w of this.d.wp) {
      const ring = w.r[0], lip = w.z - this.z0 + 0.3;
      if (ring.length < 3) continue;
      let hits = 0;
      for (let k = 0; k < 10; k++) if (nearCanal(...(ring[Math.floor((k * ring.length) / 10)] as [number, number]))) hits++;
      if (hits >= 5) continue;
      const edges = new Map<number, number[][]>();
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length], seg = [a[0], a[1], b[0], b[1]];
        x0 = Math.min(x0, a[0]); x1 = Math.max(x1, a[0]); y0 = Math.min(y0, a[1]); y1 = Math.max(y1, a[1]);
        for (let ci = Math.floor((Math.min(a[0], b[0]) - BANK) / G); ci <= Math.floor((Math.max(a[0], b[0]) + BANK) / G); ci++)
          for (let cj = Math.floor((Math.min(a[1], b[1]) - BANK) / G); cj <= Math.floor((Math.max(a[1], b[1]) + BANK) / G); cj++) push2(edges, key(ci, cj), seg);
      }
      const i0 = Math.max(1, Math.floor((x0 - BANK - T.x0) / T.dx)), i1 = Math.min(nx - 2, Math.ceil((x1 + BANK - T.x0) / T.dx));
      const j0 = Math.max(1, Math.floor((y0 - BANK - T.y0) / T.dy)), j1 = Math.min(ny - 2, Math.ceil((y1 + BANK - T.y0) / T.dy));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = T.x0 + i * T.dx, y = T.y0 + j * T.dy, k = j * nx + i;
        if (h[k] <= lip || inRing(ring, x, y) || onStreet(x, y)) continue;
        let d = BANK;
        for (const s of edges.get(key(Math.floor(x / G), Math.floor(y / G))) ?? []) d = Math.min(d, segDist(x, y, s));
        if (d >= BANK) continue;
        const t = d / BANK, e = t * t * (3 - 2 * t);
        h[k] = Math.min(h[k], lip + (h[k] - lip) * e);
      }
    }
  }

  ground(x: number, z: number): number {
    if (this.wide && !this.inGrid(x, z)) return (this.tileAt(x, z) ?? this.wide).ground(x, z);
    const T = this.d.t;
    const fi = (x - T.x0) / T.dx, fj = (-z - T.y0) / T.dy;
    const i = Math.min(T.nx - 2, Math.max(0, Math.floor(fi))), j = Math.min(T.ny - 2, Math.max(0, Math.floor(fj)));
    const u = Math.min(1, Math.max(0, fi - i)), v = Math.min(1, Math.max(0, fj - j));
    const h = this.hgt, n = T.nx, a = j * n + i;
    // match the triangle split used by the terrain mesh (a, b, c / b, d, c)
    if (u + v <= 1) return h[a] + (h[a + 1] - h[a]) * u + (h[a + n] - h[a]) * v;
    return h[a + n + 1] + (h[a + n] - h[a + n + 1]) * (1 - u) + (h[a + 1] - h[a + n + 1]) * (1 - v);
  }

  /** How far scene (x, z) is inside the force field (negative outside it). */
  fieldEdge(x: number, z: number): number { return this.field - Math.hypot(x - this.fieldX, z - this.fieldZ); }

  /** The floor of the tunnel at scene (x, z), if there's one under it (scene Y), or null. */
  tunnelFloor(x: number, z: number): number | null {
    let best: number | null = null, bd = TUNNEL.half + 0.2;
    for (const k of this.tunnelCells.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) ?? []) {
      const a = this.tA[k], b = this.tB[k], vx = b[0] - a[0], vz = b[1] - a[1];
      const s = Math.min(1, Math.max(0, ((x - a[0]) * vx + (z - a[1]) * vz) / (vx * vx + vz * vz || 1)));
      const d = Math.hypot(x - a[0] - vx * s, z - a[1] - vz * s);
      if (d < bd) { bd = d; best = a[2] + (b[2] - a[2]) * s; }
    }
    return best;
  }

  /** The tunnel floor under feet at scene (x, y, z) if they're inside a tunnel, or null. */
  inTunnel(x: number, z: number, y: number): number | null {
    const f = this.tunnelFloor(x, z);
    return f !== null && y < f + TUNNEL.crown - 0.4 ? f : null;
  }

  /** Height above the feet of the tallest thing the last collide() pushed against (-1 if none). */
  lastBlock = -1;

  /** Push a circle of radius r at feet height y out of anything solid (but skip). Mutates and returns pos. */
  collide(pos: { x: number; z: number }, y: number, r: number, skip?: Mover): { x: number; z: number } {
    this.lastBlock = -1;
    for (let iter = 0; iter < 3; iter++) {
      let block = this.pushStatic(pos, y, r), moved = block > -Infinity;
      this.lastBlock = Math.max(this.lastBlock, block);
      // the full-detail squares round this map (only ever the ones loaded near the player)
      for (const tm of this.tilesNear(pos.x, pos.z, r)) {
        block = tm.pushStatic(pos, y, r);
        if (block > -Infinity) { moved = true; this.lastBlock = Math.max(this.lastBlock, block); }
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
      // the simpler wider map, where no square is loaded
      if (this.wide && !this.tileAt(pos.x, pos.z)) {
        const bx = pos.x, bz = pos.z, wb = this.wide.collide(pos, y, r);
        if (wb >= 0) { this.lastBlock = Math.max(this.lastBlock, wb); moved ||= pos.x !== bx || pos.z !== bz; }
      }
      if (!moved) break;
    }
    // the force field
    const fx = pos.x - this.fieldX, fz = pos.z - this.fieldZ, d = Math.hypot(fx, fz), lim = this.field - r;
    if (d > lim) { pos.x = this.fieldX + (fx * lim) / d; pos.z = this.fieldZ + (fz * lim) / d; }
    return pos;
  }

  /** Push a circle at feet height y out of this map's own walls, buildings, trunks and posts.
   *  Returns the height above the feet of the tallest thing it was pushed off, or -Infinity if none. */
  pushStatic(pos: { x: number; z: number }, y: number, r: number): number {
    let block = -Infinity;
    const t = ++this.tick;
    {
      for (const k of this.cellsAround(pos.x, pos.z, r)) {
        for (const i of this.segCells.get(k) ?? []) {
          if (this.stamp[i] === t) continue;
          this.stamp[i] = t;
          if (this.sTop[i] < y + 0.45 || this.sRoof[i] <= y + 0.05) continue;   // low enough to step over, or we're on the roof
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
          block = Math.max(block, this.sTop[i] - y);
        }
        for (const i of this.treeCells.get(k) ?? []) {
          if (this.treeStamp[i] === t) continue;
          this.treeStamp[i] = t;
          const ex = pos.x - this.cX[i], ez = pos.z - this.cZ[i], d = Math.hypot(ex, ez), m = r + this.cR[i];
          if (d >= m || d < 1e-6) continue;
          pos.x = this.cX[i] + (ex / d) * m; pos.z = this.cZ[i] + (ez / d) * m;
          block = Math.max(block, this.cTop[i] - y);
        }
      }
    }
    return block;
  }

  /** True if a circle at (x, z) touches a building, wall or tree. */
  blocked(x: number, z: number, r: number): boolean {
    const p = { x, z };
    this.collide(p, -1e9, r);
    return Math.hypot(p.x - x, p.z - z) > 1e-3;
  }

  /** First solid thing hit by a ray from o along unit vector d, within maxDist. */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number): RayHit | null {
    let best = this.wallsHit(ox, oy, oz, dx, dy, dz, maxDist);
    // the full-detail squares the ray passes over
    const ex = ox + dx * maxDist, ez = oz + dz * maxDist;
    for (const tm of this.tilesNear((ox + ex) / 2, (oz + ez) / 2, Math.hypot(ex - ox, ez - oz) / 2)) {
      const h = tm.wallsHit(ox, oy, oz, dx, dy, dz, best ? best.dist : maxDist);
      if (h && (!best || h.dist < best.dist)) best = h;
    }
    // the wider map's buildings and trees, where no square is loaded
    const w = this.wide?.raycast(ox, oy, oz, dx, dy, dz, best ? best.dist : maxDist, raySeg, rayCircle, (x, z) => !!this.tileAt(x, z));
    if (w && (!best || w.dist < best.dist)) best = w;
    // vehicles, below their windows
    for (const m of this.movers) {
      const hit = rayBox(ox, oz, dx, dz, m);
      if (!hit || hit.t > maxDist || (best && hit.t >= best.dist)) continue;
      const y = oy + dy * hit.t;
      if (y > m.waist || y < m.y) continue;
      best = { dist: hit.t, kind: "barrier", nx: hit.nx, ny: 0, nz: hit.nz };
    }
    return this.groundHit(ox, oy, oz, dx, dy, dz, maxDist, best);
  }

  /** First of this map's own walls, buildings and trunks hit by a ray, within maxDist. */
  wallsHit(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number): RayHit | null {
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
    return best;
  }

  /** The ground (or a tunnel's floor and arch) if a ray hits it before best. */
  private groundHit(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number, best: RayHit | null): RayHit | null {
    // march, then bisect
    const lim = best ? best.dist : maxDist;
    const solid = (f: number) => {
      const x = ox + dx * f, y = oy + dy * f, z = oz + dz * f, t = this.tunnelFloor(x, z);
      return t !== null && y < t + TUNNEL.crown ? y < t : y < this.ground(x, z);
    };
    let prev = 0;
    for (let f = 0.5; f <= lim + 0.5; f += 0.5) {
      const ff = Math.min(f, lim);
      if (solid(ff)) {
        let lo = prev, hi = ff;
        for (let k = 0; k < 10; k++) {
          const m = (lo + hi) / 2;
          if (solid(m)) hi = m; else lo = m;
        }
        const hx = ox + dx * hi, hz = oz + dz * hi;
        const tf = this.tunnelFloor(hx, hz);
        if (tf !== null && oy + dy * hi < tf + TUNNEL.crown) return { dist: hi, kind: "ground", nx: 0, ny: dy < 0 ? 1 : -1, nz: 0 };
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

/** The pitched roof the game puts on a building: q is its rectangle (the first edge runs along the
 * ridge), rp the ridge's rise over the eaves, hp the hip insets at each end, ch the chimney stacks
 * standing on it, and wings set when parts of the house stick out beyond it and need a flat roof
 * of their own. */
export interface Roof { q: number[][]; rp: number; hp: number[]; ch: number[][]; wings: boolean }

/** Building b's pitched roof, or null for a flat one. When the map's roof rectangle hangs well over
 * thin air (an L-shaped house, or a church with its corners cut away, under one big roof) the roof
 * shrinks to the biggest rectangle that stands on the walls, keeping its pitch, and the rest of
 * the house gets a flat cap; only a house with no decent rectangle in it goes flat. */
const fits = new WeakMap<Building, Roof | null>();
export function roofFit(b: Building): Roof | null {
  const known = fits.get(b);
  if (known !== undefined) return known;
  let f: Roof | null = null;
  if (b.rr && b.rp) {
    const q = b.rr, ring = b.r[0];
    const on = (x: number, y: number) => inRing(ring, x, y) && !b.r.slice(1).some((h) => inRing(h, x, y));
    const ux = q[1][0] - q[0][0], uy = q[1][1] - q[0][1], L = Math.hypot(ux, uy) || 1;
    const vx = q[3][0] - q[0][0], vy = q[3][1] - q[0][1], W = Math.hypot(vx, vy) || 1;
    /** The point s metres along the ridge and t across, from the rectangle's first corner. */
    const P = (s: number, t: number) => [q[0][0] + (ux / L) * s + (vx / W) * t, q[0][1] + (uy / L) * s + (vy / W) * t];
    // sample the rectangle, a little in from its edges, for points off the footprint
    let miss = 0, n = 0;
    for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) {
      const [x, y] = P(L * (0.05 + (0.9 * i) / 8), W * (0.05 + (0.9 * j) / 8));
      n++; if (!on(x, y)) miss++;
    }
    if (miss / n <= 0.08) {
      // it fits: any corner of the house more than half a metre outside the rectangle?
      let wings = false;
      for (const [x, y] of ring) {
        const su = ((x - q[0][0]) * ux + (y - q[0][1]) * uy) / L, sv = ((x - q[0][0]) * vx + (y - q[0][1]) * vy) / W;
        if (su < -0.5 || su > L + 0.5 || sv < -0.5 || sv > W + 0.5) { wings = true; break; }
      }
      f = { q, rp: b.rp, hp: b.hp ?? [0, 0], ch: b.ch ?? [], wings };
    } else {
      // the biggest rectangle of cells, lined up with the roof, whose centres all stand on the house
      const c = Math.max(0.5, Math.max(L, W) / 48), nu = Math.max(1, Math.round(L / c)), nv = Math.max(1, Math.round(W / c));
      const cu = L / nu, cv = W / nv, run = new Array(nv).fill(0);
      let best = 0, bi = 0, bj = 0, bw = 0, bh = 0;
      for (let i = 0; i < nu; i++) {
        // run[j]: how many cells in a row, ending at this column, are on the house
        for (let j = 0; j < nv; j++) {
          const [x, y] = P((i + 0.5) * cu, (j + 0.5) * cv);
          run[j] = on(x, y) ? run[j] + 1 : 0;
        }
        for (let j = 0; j < nv; j++) {
          let w = Infinity;
          for (let k = j; k < nv && run[k]; k++) {
            w = Math.min(w, run[k]);
            const a = w * cu * (k - j + 1) * cv;
            if (a > best) { best = a; bi = i - w + 1; bj = j; bw = w; bh = k - j + 1; }
          }
        }
      }
      const s0 = bi * cu, s1 = (bi + bw) * cu, t0 = bj * cv, t1 = (bj + bh) * cv;
      const along = s1 - s0, across = t1 - t0;
      if (best >= 0.3 * L * W && Math.min(along, across) >= 2.5) {
        // the ridge runs along the longer side; the roof keeps its slope, so a narrower one is lower
        const turn = across > along, wide = turn ? along : across;
        const rq = turn ? [P(s0, t0), P(s0, t1), P(s1, t1), P(s1, t0)] : [P(s0, t0), P(s1, t0), P(s1, t1), P(s0, t1)];
        const hipped = (b.hp ?? [0, 0]).some((h) => h);
        const hp = turn ? (hipped ? [1, 1] : [0, 0]) : [s0 < 0.5 ? b.hp?.[0] ?? 0 : 0, s1 > L - 0.5 ? b.hp?.[1] ?? 0 : 0];
        // chimney stacks only where they still stand on the roof
        const ch = (b.ch ?? []).filter(([x, y]) => {
          const su = ((x - q[0][0]) * ux + (y - q[0][1]) * uy) / L, sv = ((x - q[0][0]) * vx + (y - q[0][1]) * vy) / W;
          return su > s0 + 0.4 && su < s1 - 0.4 && sv > t0 + 0.4 && sv < t1 - 0.4;
        });
        f = { q: rq, rp: (b.rp * wide) / W, hp, ch, wings: true };
      }
    }
  }
  fits.set(b, f);
  return f;
}

/** Half the width the game draws a road of class c (as world.ts does). */
export function roadHalf(c: string): number {
  const RW: Record<string, number> = { trunk: 9, primary: 8.5, secondary: 8, tertiary: 7, residential: 6, unclassified: 5.5, living_street: 5, service: 3.5, unknown: 4, pedestrian: 4, footway: 1.6, steps: 1.8, cycleway: 2, path: 1.4, track: 2.8, bridleway: 2 };
  return (RW[c] ?? 4) / 2;
}
/** Streets with kerbs and a pavement each side, and how wide the pavement is. */
export const KERBED = new Set(["trunk", "primary", "secondary", "tertiary", "residential", "unclassified", "living_street"]);
export const PAVE = 1.7;
/** How far a bridge's deck reaches each side of the road's centre line: the carriageway and its pavements, or a path and its verge. */
export function deckHalf(c: string): number { return roadHalf(c) + (KERBED.has(c) ? PAVE : 0.3); }
/** Is this point of a road on a bridge's span: the map says so, or it stands well clear of the ground under it. */
export function onSpan(q: number[], ground: (x: number, z: number) => number, z0: number): boolean {
  return q[3] === 1 || q[2] - z0 - ground(q[0], -q[1]) > 0.5;
}
/** The height (scene Y) a road is walked and drawn at, at one of its points: its own on a bridge's span, the ground elsewhere. */
export function deckTop(q: number[], ground: (x: number, z: number) => number, z0: number): number {
  return onSpan(q, ground, z0) ? q[2] - z0 : ground(q[0], -q[1]);
}
/**
 * The spans of a bridge: ranges [a, b] of the road's point indexes, each from the abutment at one
 * end to the abutment at the other (the point before and after the ones standing clear).
 */
export function bridgeSpans(r: Road, ground: (x: number, z: number) => number, z0: number): [number, number][] {
  const p = r.p, n = p.length, out: [number, number][] = [];
  const on = p.map((q) => onSpan(q, ground, z0));
  for (let i = 0; i < n; ) {
    if (!on[i]) { i++; continue; }
    let j = i;
    while (j + 1 < n && on[j + 1]) j++;
    const a = Math.max(0, i - 1), b = Math.min(n - 1, j + 1);
    if (b > a) out.push([a, b]);
    i = j + 1;
  }
  return out;
}

/**
 * Walls, fences and hedges (lines of [x, y, z]) with gaps cut wherever one crosses a street's
 * carriageway or a path (a wall running alongside a path is kept), and, given a box, any length
 * lying along its edges left out.
 */
function* clearOfRoads(lines: Line[], roads: Road[], box: number[] | null): Generator<void, Line[]> {
  const G = 8, cells = new Map<number, number[][]>();
  for (const r of roads) {
    const path = PATHS.has(r.c) ? 1 : 0, half = roadHalf(r.c) + (path ? 0.4 : 0.2);
    for (let i = 0; i < r.p.length - 1; i++) {
      const a = r.p[i], b = r.p[i + 1], seg = [a[0], a[1], b[0], b[1], half, path], seen = new Set<number>();
      const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (G / 2)));
      for (let s = 0; s <= n; s++) {
        const x = a[0] + (b[0] - a[0]) * s / n, y = a[1] + (b[1] - a[1]) * s / n;
        for (let ci = Math.floor((x - half) / G); ci <= Math.floor((x + half) / G); ci++)
          for (let cj = Math.floor((y - half) / G); cj <= Math.floor((y + half) / G); cj++) {
            const k = key(ci, cj);
            if (!seen.has(k)) { seen.add(k); push2(cells, k, seg); }
          }
      }
    }
  }
  // ux, uy: which way the wall runs here. On a path only a wall crossing it (more than 25° off
  // its line) is cut, not one running along its side.
  const onRoad = (x: number, y: number, ux: number, uy: number) => {
    if (box && (Math.abs(x - box[0]) < 0.6 || Math.abs(x - box[2]) < 0.6 || Math.abs(y - box[1]) < 0.6 || Math.abs(y - box[3]) < 0.6)) return true;
    for (const [ax, ay, bx, by, half, path] of cells.get(key(Math.floor(x / G), Math.floor(y / G))) ?? []) {
      const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1, t = Math.min(1, Math.max(0, ((x - ax) * vx + (y - ay) * vy) / l2));
      if (Math.hypot(x - ax - vx * t, y - ay - vy * t) >= half) continue;
      if (!path || Math.abs(ux * vy - uy * vx) / Math.sqrt(l2) > 0.42) return true;
    }
    return false;
  };
  yield;
  const out: Line[] = [];
  for (let li = 0; li < lines.length; li++) {
    const l = lines[li];
    if (li % 300 === 299) yield;
    // walk the line half a metre at a time, keeping the stretches off the streets
    let run: number[][] = [];
    const end = () => { if (run.length > 1 && Math.hypot(run[run.length - 1][0] - run[0][0], run[run.length - 1][1] - run[0][1]) > 0.4) out.push({ c: l.c, p: run }); run = []; };
    for (let i = 0; i < l.p.length - 1; i++) {
      const a = l.p[i], b = l.p[i + 1], dl = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(dl / 0.5));
      const ux = (b[0] - a[0]) / (dl || 1), uy = (b[1] - a[1]) / (dl || 1);
      for (let s = i ? 1 : 0; s <= n; s++) {
        const q = [a[0] + (b[0] - a[0]) * s / n, a[1] + (b[1] - a[1]) * s / n, a[2] + (b[2] - a[2]) * s / n];
        if (onRoad(q[0], q[1], ux, uy)) { end(); continue; }
        // keep the line's own corners; in between, only where a stretch starts or ends
        if (s === n || s === 0 || !run.length) run.push(q);
        else if (onRoad(a[0] + (b[0] - a[0]) * (s + 1) / n, a[1] + (b[1] - a[1]) * (s + 1) / n, ux, uy)) run.push(q);
      }
    }
    end();
  }
  return out;
}
function push2(m: Map<number, number[][]>, k: number, v: number[]) { const a = m.get(k); if (a) a.push(v); else m.set(k, [v]); }

/** Is (x, y) inside the ring of points? */
function inRing(ring: number[][], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** A line (data coords) moved sideways by o metres (left is positive), with mitred corners. */
export function offsetLine(p: number[][], o: number): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < p.length; i++) {
    const a = p[Math.max(0, i - 1)], b = p[Math.min(p.length - 1, i + 1)], c = p[i];
    let nx = 0, ny = 0;
    for (const [u, v] of [[a, c], [c, b]]) {
      const dx = v[0] - u[0], dy = v[1] - u[1], l = Math.hypot(dx, dy);
      if (l > 1e-6) { nx += -dy / l; ny += dx / l; }
    }
    const nl = Math.hypot(nx, ny) || 1;
    out.push([c[0] + (nx / nl) * o, c[1] + (ny / nl) * o]);
  }
  return out;
}

function key(i: number, j: number) { return (i + 2048) * 4096 + (j + 2048); }
function push(m: Map<number, number[]>, k: number, v: number) { const a = m.get(k); if (a) a.push(v); else m.set(k, [v]); }

/** Distance along a horizontal ray (o + t*d, d not normalised in 2D) to segment a-b, or -1. */
export function raySeg(ox: number, oz: number, dx: number, dz: number, ax: number, az: number, bx: number, bz: number): number {
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

export function rayCircle(ox: number, oz: number, dx: number, dz: number, cx: number, cz: number, r: number): number {
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

/** Load a map, and the wider map round it from wideUrl if it has one, and the layout of its
 *  full-detail squares from tilesDir + "tiles.json" if it has those. */
export async function loadMap(url: string, wideUrl?: string, tilesDir?: string): Promise<GameMap> {
  // the single-file build carries its one map inline, and no wider map
  const inline = document.getElementById("mapdata");
  if (inline?.textContent) return new GameMap(JSON.parse(inline.textContent));
  const index = tilesDir ? fetch(`${tilesDir}tiles.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null) : null;
  // the canal and the railways: optional, small, and only there for maps that have them
  const extra = (end: string) => fetch(url.replace(/\.json$/, end)).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const [res, wide, tiles, canal, rail] = await Promise.all([fetch(url), wideUrl ? loadWide(wideUrl) : null, index, extra("-canal.json"), extra("-rail.json")]);
  if (!res.ok) throw new Error(`Could not load the map (${res.status})`);
  const map = new GameMap(await res.json(), wide);
  map.canalData = canal?.runs ? canal : null;
  map.railData = rail?.tracks ? rail : null;
  if (wide && tiles?.tiles) { map.tileIndex = tiles; map.tileBase = tilesDir!; }
  return map;
}
