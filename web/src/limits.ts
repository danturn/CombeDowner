// Speed limits: the limit on the street under a car, as the map build worked it out from
// OpenStreetMap (tools/maxspeed.py), for the roundel by the speedo and the driving examiner. The
// loaded squares' streets are asked first, then the wide map's, which reach all of Bath.
//
// Who decides what: nothing goes over the network. Every screen reads the same map.
import { type GameMap, type Road, roadHalf } from "./map";

const CELL = 32;
const REACH = 4;          // metres past a street's edge that still counts as on it

type Grid = Map<string, number[]>;
const grids = new WeakMap<Road[], Grid>();

/** Each limited road's segments by grid cell, as road * 4096 + segment, built once per list of roads. */
function gridOf(rd: Road[]): Grid {
  let g = grids.get(rd);
  if (g) return g;
  g = new Map();
  rd.forEach((r, i) => {
    if (!r.ms) return;
    const pad = roadHalf(r.c, r.w) + REACH;
    for (let k = 0; k + 1 < r.p.length && k < 4096; k++) {
      const a = r.p[k], b = r.p[k + 1];
      const i0 = Math.floor((Math.min(a[0], b[0]) - pad) / CELL), i1 = Math.floor((Math.max(a[0], b[0]) + pad) / CELL);
      const j0 = Math.floor((Math.min(a[1], b[1]) - pad) / CELL), j1 = Math.floor((Math.max(a[1], b[1]) + pad) / CELL);
      for (let ci = i0; ci <= i1; ci++) for (let cj = j0; cj <= j1; cj++) {
        const key = `${ci},${cj}`;
        (g!.get(key) ?? g!.set(key, []).get(key)!).push(i * 4096 + k);
      }
    }
  });
  grids.set(rd, g);
  return g;
}

/** The limit (mph) of the street at data point (x, y) heading (ux, uy), from one list of roads, with how near it is. */
function nearest(rd: Road[], x: number, y: number, ux: number, uy: number): [number, number] | null {
  const cell = gridOf(rd).get(`${Math.floor(x / CELL)},${Math.floor(y / CELL)}`);
  let best: [number, number] | null = null;
  for (const id of cell ?? []) {
    const r = rd[Math.floor(id / 4096)], k = id % 4096, a = r.p[k], b = r.p[k + 1];
    const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L2));
    const off = Math.hypot(a[0] + dx * t - x, a[1] + dy * t - y) - roadHalf(r.c, r.w);
    if (off > REACH) continue;
    // at a junction, the street you're driving along rather than the one crossing it
    const score = Math.max(0, off) + 6 * (1 - Math.abs(dx * ux + dy * uy) / Math.sqrt(L2));
    if (!best || score < best[1]) best = [r.ms!, score];
  }
  return best;
}

/** The speed limit in mph where a car is (scene x, z, facing ux, uz), or 0 off any street with one. */
export function limitAt(map: GameMap, x: number, z: number, ux: number, uz: number): number {
  for (const tm of map.tilesNear(x, z, 1)) {
    const hit = nearest(tm.d.rd, x, -z, ux, -uz);
    if (hit) return hit[0];
  }
  const wide = map.wide?.rd;
  return wide ? nearest(wide, x, -z, ux, -uz)?.[0] ?? 0 : 0;
}

let last = { t: -1e9, v: 0 };

/** limitAt, worked out at most four times a second for the speedo's roundel. */
export function limitShown(map: GameMap, x: number, z: number, ux: number, uz: number): number {
  const now = performance.now();
  if (now - last.t > 250) last = { t: now, v: limitAt(map, x, z, ux, uz) };
  return last.v;
}
