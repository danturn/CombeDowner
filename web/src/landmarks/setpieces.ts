// Set pieces: hand-made models of Bath's great buildings (the Abbey, Pulteney Bridge, the Roman
// Baths with the Pump Room) standing in for the plain scenery the map tools build there.
//
// The map is never changed for them. The tools (tools/prep_tiles.py) go on building every square
// of Bath the same way, and a set piece only hides what they built there. As each part of the map
// loads (the first area, map.ts; each square of Bath, tiles.ts), and before the game builds
// anything from it, everything the tools put inside a set piece's outline is left out of the
// game's copy: buildings, trees, shrubs, walls, fences and hedges, gates, street furniture, doors,
// bay windows, shop signs, garden paths, footpaths, ponds, overhead wires and the woods' canopy.
// The set piece is then added to the landmarks (map.d.lm) for world.ts to draw (landmarks/index.ts,
// in the square its origin is in) and map.ts to make solid (in every square it reaches into, so
// you bump into it from whichever square you're standing in). Streets and pedestrian streets are
// kept, as the traffic and everyone walking about need them. A street the set piece carries over
// the river (Pulteney Bridge) keeps its deck to walk and drive on, but the plain bridge the game
// would build under it, and its parapets, are left to the set piece.
//
// Where a set piece needs the ground lower than the lidar has it (the Great Bath, down at the
// Roman level), it lowers the terrain inside rectangles of its own, in the game's copy of the
// square: never a point of the terrain that a kept street, pavement or path is drawn over, so the
// streets round it stay exactly as they were. The set piece has to cover the slope from its
// lowered ground up to the ground round about.
//
// So a rebuilt map, or a new area, needs nothing doing here: a set piece's place is longitude,
// latitude and a bearing, and its outline catches whatever the tools build there next time. A new
// set piece is an entry in SET_PIECES and a builder in landmarks/ (with its solid parts in
// landmarks/index.ts). Its heights are fixed (metres above sea level, as the lidar has the ground
// there) or worked out from what every square sees alike (the streets), so it stands the same in
// every square it reaches into.
//
// Nothing here goes over the network: every player masks the squares they load the same way.
import type { MapData, Road } from "../map";
import { KERBED, PAVE, roadHalf } from "../map";
import { BATHS_SINK } from "./baths";

type LonLat = [number, number];

/** What a set piece knows about where it stands, in the square being masked. Coordinates are in
 *  its own frame: x along it, z out of its front. */
export interface PlaceCtx {
  /** The buildings it hid here (their names and middles). */
  hidden: { name: string; x: number; z: number }[];
  /** The streets it carries on a bridge of its own (their points in its frame: x, z, height above its origin). */
  held: number[][][];
  /** The level of the water under its origin, above sea level, if it stands in a river or a pond. */
  water: number | null;
  d: MapData;
}

export interface SetPiece {
  /** What it is, for the console. */
  name: string;
  /** The landmark builder that draws it (landmarks/index.ts). */
  kind: string;
  /** Where its origin is, longitude and latitude, and which way its length (the model's x) runs,
   *  in degrees east of north. Its front (the model's +z) is 90 degrees clockwise of that. */
  at: LonLat;
  bearing: number;
  /** Its origin's height above sea level (the model's y = 0), fixed or worked out where it stands. */
  height: number | ((c: PlaceCtx) => number);
  /** What it stands in for, in its own frame: everything the tools built inside this outline goes. */
  outline: [number, number][];
  /** Where it's solid all the way through, in its own frame (x0, x1, z0, z1), for spawning and
   *  pubs to keep out of (map.indoors). Its whole outline, if not given. */
  covers?: [number, number, number, number][];
  /** Its builder's args, worked out where it stands. */
  args?: (c: PlaceCtx, height: number) => (number | string)[];
  /** Ground it lowers, rectangles in its own frame, to y above its origin. */
  sink?: { x0: number; x1: number; z0: number; z1: number; y: number }[];
}

// ---- Bath's set pieces --------------------------------------------------------------------------

export const SET_PIECES: SetPiece[] = [
  {
    // landmarks/abbey.ts. The origin: the middle of the nave's width, halfway along the church.
    // The floor a touch above the highest ground inside it (24.7 m), with steps up to the west door.
    name: "Bath Abbey", kind: "abbey", at: [-2.358847, 51.3814293], bearing: 82.4, height: 24.85,
    outline: [[-35.6, -13.8], [0.9, -13.8], [0.9, -21.4], [13.3, -21.4], [13.3, -14.3], [35.3, -14.3], [35.3, 20.2],
      [18.6, 20.2], [11.1, 23.5], [0.6, 23.6], [0.6, 19.6], [-29.1, 19.6], [-29.1, 13.7], [-35.6, 13.7]],
    sink: [{ x0: -34, x1: 33.7, z0: -12, z1: 12, y: -0.15 }, { x0: 2.5, x1: 11.5, z0: -19.8, z1: 19.8, y: -0.15 }],
  },
  {
    // landmarks/pulteney.ts. The origin: the middle of the bridge, at the river's level.
    name: "Pulteney Bridge", kind: "pulteney", at: [-2.357923, 51.38304], bearing: 60,
    height: (c) => c.water ?? 15.6,
    outline: [[-25.3, -10.4], [20.9, -10.4], [20.9, 12.2], [-20.7, 12.2], [-20.7, -3.2], [-25.3, -3.2]],
    covers: [[-24.9, 20.4, -9.8, -3.4], [-20.4, 20.4, 6.1, 10.5]],
    args: (c, h) => {
      // the street over it: its height along the bridge (fitted straight through its points on
      // the span), and where its middle runs
      const pts = c.held.flat().filter((q) => Math.abs(q[0]) < 26);
      let deckW = 9.2, deckE = 9.2, mid = 1.3;
      if (pts.length >= 2) {
        const n = pts.length, sx = pts.reduce((a, q) => a + q[0], 0), sy = pts.reduce((a, q) => a + q[2], 0);
        const sxx = pts.reduce((a, q) => a + q[0] * q[0], 0), sxy = pts.reduce((a, q) => a + q[0] * q[2], 0);
        const den = n * sxx - sx * sx, slope = den ? (n * sxy - sx * sy) / den : 0, at0 = (sy - slope * sx) / n;
        deckW = at0 - slope * 20.4; deckE = at0 + slope * 20.4;
        mid = pts.reduce((a, q) => a + q[1], 0) / n;
      }
      void h;
      // the shops the map names on the bridge, along each side
      const shops = c.hidden.filter((b) => b.name && b.x > -25.5 && b.x < 21.5).sort((a, b) => a.z - b.z || a.x - b.x);
      return [+deckW.toFixed(2), +deckE.toFixed(2), +mid.toFixed(2), ...shops.flatMap((b) => [+b.x.toFixed(1), b.z > mid ? 1 : -1, b.name])];
    },
  },
  {
    // landmarks/baths.ts. The origin: the middle of the Great Bath, at the Roman level (the
    // court's floor), set from the lidar's churchyard (24.7 m) and the Great Bath's water (21.2 m).
    name: "Roman Baths", kind: "baths", at: [-2.359472, 51.380958], bearing: 73.6, height: 21.6,
    outline: [[-45.8, -38.2], [12, -38.2], [16.5, -34], [18, -22.6], [18, 10.3], [-43.5, 10.3], [-45.8, 8]],
    sink: BATHS_SINK,
  },
];

// ---- the masking --------------------------------------------------------------------------------

const FOOTPATHS = new Set(["footway", "steps", "cycleway", "path", "bridleway", "track"]);

export function inRing(ring: number[][], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The runs of a line's points that lie outside, each kept if it still has two points. */
function runsOutside<T extends { p: number[][] }>(l: T, inside: (x: number, y: number) => boolean): T[] {
  if (!l.p.some((q) => inside(q[0], q[1]))) return [l];
  const out: T[] = [];
  let run: number[][] = [];
  for (const q of l.p) {
    if (inside(q[0], q[1])) { if (run.length > 1) out.push({ ...l, p: run }); run = []; }
    else run.push(q);
  }
  if (run.length > 1) out.push({ ...l, p: run });
  return out;
}

/** Hide what the tools built under every set piece reaching into map d (the first area or a
 *  square of Bath, just loaded), and place the set pieces there. Changes d in place. */
export function maskSetPieces(d: MapData) {
  if (!d.centre || !d.t || !d.b) return;
  const [lon0, lat0] = d.centre;
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180), ky = 110574;     // as tools/prep_map.py
  const T = d.t, gx1 = T.x0 + (T.nx - 1) * T.dx, gy1 = T.y0 + (T.ny - 1) * T.dy;
  const [bx0, by0, bx1, by1] = d.b;
  for (const sp of SET_PIECES) {
    // its frame: origin, along (ux, uy) and its front (uy, -ux), in data coordinates
    const ox = (sp.at[0] - lon0) * kx, oy = (sp.at[1] - lat0) * ky;
    const a = ((90 - sp.bearing) * Math.PI) / 180, ux = Math.cos(a), uy = Math.sin(a);
    const at = (lx: number, lz: number): [number, number] => [ox + ux * lx + uy * lz, oy + uy * lx - ux * lz];
    const local = (x: number, y: number): [number, number] => [(x - ox) * ux + (y - oy) * uy, (x - ox) * uy - (y - oy) * ux];
    const ring = sp.outline.map(([lx, lz]) => at(lx, lz));
    const xs = ring.map((q) => q[0]), ys = ring.map((q) => q[1]);
    const mx0 = Math.min(...xs), mx1 = Math.max(...xs), my0 = Math.min(...ys), my1 = Math.max(...ys);
    if (mx1 < T.x0 || mx0 > gx1 || my1 < T.y0 || my0 > gy1) continue;
    const hide = (x: number, y: number) => x >= mx0 && x <= mx1 && y >= my0 && y <= my1 && inRing(ring, x, y);
    const mid = (q: (number | string)[]) => hide((+q[0] + +q[2]) / 2, (+q[1] + +q[3]) / 2);

    // buildings whose middle is inside (noted, for the set piece to use their names), ponds wholly inside
    const hidden: PlaceCtx["hidden"] = [];
    d.bl = d.bl.filter((b) => {
      const r = b.r[0];
      let x = 0, y = 0;
      for (const q of r) { x += q[0]; y += q[1]; }
      x /= r.length; y /= r.length;
      if (!hide(x, y)) return true;
      const [lx, lz] = local(x, y);
      hidden.push({ name: b.n, x: lx, z: lz });
      return false;
    });
    d.wp = d.wp.filter((w) => w.c === "canal" || !w.r[0].every((q) => hide(q[0], q[1])));
    // the small things
    d.tr = d.tr.filter((q) => !hide(q[0], q[1]));
    if (d.sb) d.sb = d.sb.filter((q) => !hide(q[0], q[1]));
    if (d.dr) d.dr = d.dr.filter((q) => !hide(q[0], q[1]));
    if (d.by) d.by = d.by.filter((q) => !hide(+q[0], +q[1]));
    if (d.sh) d.sh = d.sh.filter((q) => !hide(+q[0], +q[1]));
    if (d.fx) d.fx = d.fx.filter((q) => !hide(+q[1], +q[2]));
    if (d.gt) d.gt = d.gt.filter((q) => !mid(q));
    if (d.fp) d.fp = d.fp.filter((q) => !mid(q));
    if (d.dv) d.dv = d.dv.filter((q) => !mid(q));
    if (d.wr) d.wr = d.wr.filter((q) => !hide(q[0], q[1]) && !hide(q[3], q[4]));
    if (d.pi) d.pi = d.pi.filter((p) => !hide(p[1], p[2]));
    // walls, fences and hedges, and footpaths: the runs of them outside
    d.br = d.br.flatMap((l) => runsOutside(l, hide));
    const held: Road[] = [];
    d.rd = d.rd.flatMap((r) => {
      // a street the set piece carries on a bridge of its own: the game builds no bridge under it
      if (r.p.some((q) => q[3] === 1 && hide(q[0], q[1]))) { r.held = true; if (!FOOTPATHS.has(r.c)) held.push(r); }
      return FOOTPATHS.has(r.c) ? runsOutside(r, hide) : [r];
    });
    // the canopy over woods
    if (d.cn) {
      const C = d.cn, raw = atob(C.h), H = new Uint8Array(raw.length);
      for (let k = 0; k < raw.length; k++) H[k] = raw.charCodeAt(k);
      let cut = false;
      for (let j = 0; j < C.ny; j++) for (let i = 0; i < C.nx; i++)
        if (H[j * C.nx + i] && hide(C.x0 + i * C.step, C.y0 + j * C.step)) { H[j * C.nx + i] = 0; cut = true; }
      if (cut) { let out = ""; for (let k = 0; k < H.length; k++) out += String.fromCharCode(H[k]); C.h = btoa(out); }
    }
    // where it's solid, for spawning to keep out of
    for (const c of sp.covers ?? []) (d.sp ??= []).push([at(c[0], c[2]), at(c[1], c[2]), at(c[1], c[3]), at(c[0], c[3])]);
    if (!sp.covers) (d.sp ??= []).push(ring);

    // its height, and the ground it lowers
    let water: number | null = null;
    for (const w of d.wp) if (w.c !== "canal" && inRing(w.r[0], ox, oy) && !w.r.slice(1).some((h) => inRing(h, ox, oy))) water = w.z;
    const ctx: PlaceCtx = { hidden, held: held.map((r) => r.p.filter((q) => q[3] === 1).map((q) => [...local(q[0], q[1]), 0, q[2]])), water, d };
    const z = typeof sp.height === "number" ? sp.height : sp.height(ctx);
    for (const p of ctx.held) for (const q of p) { q[2] = q[3] - z; q.length = 3; }
    if (sp.sink) lower(d, sp.sink.map((r) => ({ ...r, y: z + r.y })), local, hide, mx0, mx1, my0, my1);

    // and the set piece itself, solid in every square it reaches, drawn in the one its origin's in
    const args = sp.args?.(ctx, z) ?? [];
    const own = ox >= bx0 && ox < bx1 && oy >= by0 && oy < by1;
    (d.lm ??= []).push([sp.kind, +ox.toFixed(2), +oy.toFixed(2), +z.toFixed(2), +a.toFixed(4), own ? 1 : 0, ...args]);
  }
}

/** Lower the terrain of map d inside rectangles (in a set piece's frame, local() taking data x, y
 *  into it) to their heights, above sea level: never outside the set piece's outline (inside()),
 *  nor where a street, pavement or path is drawn over it. Every terrain point whose cells reach
 *  into a rectangle goes down, so its ground is level all the way to the rectangle's edges;
 *  (x0..x1, y0..y1): the outline's box. */
function lower(d: MapData, rects: { x0: number; x1: number; z0: number; z1: number; y: number }[], local: (x: number, y: number) => [number, number],
  inside: (x: number, y: number) => boolean, x0: number, x1: number, y0: number, y1: number) {
  const T = d.t, reach = Math.hypot(T.dx, T.dy);
  const i0 = Math.max(0, Math.floor((x0 - T.x0) / T.dx)), i1 = Math.min(T.nx - 1, Math.ceil((x1 - T.x0) / T.dx));
  const j0 = Math.max(0, Math.floor((y0 - T.y0) / T.dy)), j1 = Math.min(T.ny - 1, Math.ceil((y1 - T.y0) / T.dy));
  if (i0 > i1 || j0 > j1) return;
  // the terrain points under the streets nearby: every corner of every triangle a street's
  // surface (and its pavements) is drawn across, as world.ts lays it on the ground
  const pinned = new Set<number>();
  const pin = (x: number, y: number) => {
    const fi = (x - T.x0) / T.dx, fj = (y - T.y0) / T.dy, i = Math.floor(fi), j = Math.floor(fj);
    if (i < 0 || j < 0 || i >= T.nx - 1 || j >= T.ny - 1) return;
    const k = j * T.nx + i;
    if (fi - i + (fj - j) <= 1) { pinned.add(k); pinned.add(k + 1); pinned.add(k + T.nx); }
    else { pinned.add(k + T.nx + 1); pinned.add(k + T.nx); pinned.add(k + 1); }
  };
  for (const r of d.rd) {
    const half = roadHalf(r.c, r.w) + (KERBED.has(r.c) ? Math.max(...(r.pv ?? [PAVE]), PAVE) : 0) + 0.4;
    if (!r.p.some((q) => q[0] > x0 - 50 && q[0] < x1 + 50 && q[1] > y0 - 50 && q[1] < y1 + 50)) continue;
    for (let s = 0; s < r.p.length - 1; s++) {
      const [ax, ay] = r.p[s], [bx, by] = r.p[s + 1], len = Math.hypot(bx - ax, by - ay) || 1;
      const nx = -(by - ay) / len, ny = (bx - ax) / len, n = Math.ceil(len / 0.5), m = Math.ceil((2 * half) / 0.5);
      for (let u = 0; u <= n; u++) {
        const px = ax + ((bx - ax) * u) / n, py = ay + ((by - ay) * u) / n;
        if (px < x0 - half || px > x1 + half || py < y0 - half || py > y1 + half) continue;
        for (let v = 0; v <= m; v++) { const o = -half + (2 * half * v) / m; pin(px + nx * o, py + ny * o); }
      }
    }
  }
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const k = j * T.nx + i, x = T.x0 + i * T.dx, y = T.y0 + j * T.dy;
    if (pinned.has(k) || !inside(x, y)) continue;
    const [lx, lz] = local(x, y);
    for (const r of rects) {
      if (lx > r.x0 - reach && lx < r.x1 + reach && lz > r.z0 - reach && lz < r.z1 + reach)
        T.h[k] = Math.min(T.h[k], Math.round((r.y - T.z0) * 10));
    }
  }
}
