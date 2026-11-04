// The streets the Flag Lads string their flags along (invasion.ts). A cluster of flags is one street
// and a stretch of it: the street is picked from the city-wide streets every player has (map.wide,
// or the map's own where it has no wider one), followed on through the pieces the map splits it
// into, and the flags stand a lamp's spacing apart along it, on alternate sides. Each flag goes on
// the map's own street lamp where one stands near its spot, in whichever square is loaded here;
// where there's none (or the square isn't in yet) the lads have put up a pole of their own.
//
// Nothing here goes over the network: the host sends a road's number, where along it the flags
// start and how many, and every screen works out the same spots from the same streets.
import type { GameMap, Road } from "./map";
import { KERBED, roadHalf } from "./map";
import { clearSpot } from "./haunts";

export const SPACING = 32;    // metres between flags, as the map's lamps stand (tools/streets.py)
const JOIN = 3;               // street pieces whose ends are this close carry on into each other
const REACH = 700;            // metres a street is followed each way from the piece picked
const SNAP = 14;              // a flag goes on the map's own lamp if one stands this close to its spot
const CELL = 32;

/** A street followed through its pieces: points in data coords, the distance along it at each, and
 *  where the piece it was picked by starts and ends along it. */
export interface Chain { pts: number[][]; cum: number[]; len: number; name: string; c: string; from: number; to: number }
/** Where a flag hangs, in scene coords: ground height g, the lamp's arm angle a, and whether it's a real lamp. */
export interface Spot { x: number; z: number; g: number; a: number; lamp: boolean }
interface LampAt { x: number; z: number; g: number; a: number }

export class FlagRoads {
  readonly roads: Road[];
  /** Each road's middle point in scene coords, x then z. */
  readonly mids: Float32Array;
  /** The roads flags can go on: kerbed streets off bridges. */
  readonly usable: number[] = [];
  private ends = new Map<string, number[]>();
  private chains = new Map<number, Chain>();
  private lampGrid = new WeakMap<GameMap, Map<string, LampAt[]>>();

  constructor(private map: GameMap) {
    const w = map.wide, core = w?.core;
    const inner = !!core && (core[2] > core[0] || core[3] > core[1]);
    // the wider map's streets cover everything outside its core, which is the map's own
    this.roads = !w ? map.d.rd : inner ? [...w.rd.filter((r) => !w.inCore(r.p[0][0], r.p[0][1])), ...map.d.rd] : w.rd;
    this.mids = new Float32Array(this.roads.length * 2);
    this.roads.forEach((r, i) => {
      if (r.p.length < 2) return;
      const m = r.p[Math.floor(r.p.length / 2)];
      this.mids[i * 2] = m[0]; this.mids[i * 2 + 1] = -m[1];
      if (KERBED.has(r.c) && !r.bridge) {
        this.usable.push(i);
        for (const q of [r.p[0], r.p[r.p.length - 1]]) {
          const k = this.key(q[0], q[1]), list = this.ends.get(k);
          if (list) list.push(i); else this.ends.set(k, [i]);
        }
      }
    });
  }

  private key(x: number, y: number) { return `${Math.round(x / JOIN)},${Math.round(y / JOIN)}`; }

  /** Usable roads with an end within JOIN of data point (x, y). */
  private endsNear(x: number, y: number): number[] {
    const out: number[] = [], kx = Math.round(x / JOIN), ky = Math.round(y / JOIN);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      for (const i of this.ends.get(`${kx + a},${ky + b}`) ?? []) {
        const p = this.roads[i].p, s = p[0], e = p[p.length - 1];
        if (Math.hypot(s[0] - x, s[1] - y) < JOIN || Math.hypot(e[0] - x, e[1] - y) < JOIN) if (!out.includes(i)) out.push(i);
      }
    }
    return out;
  }

  private same(a: Road, b: Road) { return a.n ? a.n === b.n : !b.n && a.c === b.c; }

  /** Road r and the pieces of the same street running on from each end of it, straightest first. */
  chain(r: number): Chain {
    const had = this.chains.get(r);
    if (had) return had;
    const road = this.roads[r], used = new Set([r]);
    const walk = (start: number[], dir: number[]): number[][] => {
      const out: number[][] = [];
      let at = start, d = dir, len = 0;
      while (len < REACH) {
        let best = -1, bestDot = -0.3, flip = false;
        for (const i of this.endsNear(at[0], at[1])) {
          if (used.has(i) || !this.same(road, this.roads[i])) continue;
          const p = this.roads[i].p, rev = Math.hypot(p[0][0] - at[0], p[0][1] - at[1]) > Math.hypot(p[p.length - 1][0] - at[0], p[p.length - 1][1] - at[1]);
          const a = rev ? p[p.length - 1] : p[0], b = rev ? p[p.length - 2] : p[1];
          const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, dot = ((b[0] - a[0]) * d[0] + (b[1] - a[1]) * d[1]) / l;
          if (dot > bestDot) { bestDot = dot; best = i; flip = rev; }
        }
        if (best < 0) break;
        used.add(best);
        const p = flip ? [...this.roads[best].p].reverse() : this.roads[best].p;
        for (let k = 1; k < p.length; k++) { len += Math.hypot(p[k][0] - p[k - 1][0], p[k][1] - p[k - 1][1]); out.push(p[k]); }
        at = p[p.length - 1];
        const q = p[p.length - 2], l = Math.hypot(at[0] - q[0], at[1] - q[1]) || 1;
        d = [(at[0] - q[0]) / l, (at[1] - q[1]) / l];
      }
      return out;
    };
    const p = road.p, n = p.length;
    const unit = (a: number[], b: number[]) => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
    const back = walk(p[0], unit(p[1], p[0])).reverse();
    const fwd = walk(p[n - 1], unit(p[n - 2], p[n - 1]));
    const pts = [...back, ...p.map((q) => q), ...fwd], cum = [0];
    for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
    const from = cum[back.length], to = cum[back.length + n - 1];
    const c: Chain = { pts, cum, len: cum[cum.length - 1], name: road.n ?? "", c: road.c, from, to };
    this.chains.set(r, c);
    return c;
  }

  /** The point s metres along a chain, and the way the street runs there (data coords). */
  private along(ch: Chain, s: number) {
    const { pts, cum } = ch;
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
    const a = pts[lo], b = pts[Math.min(hi, pts.length - 1)], l = cum[hi] - cum[lo] || 1, t = Math.max(0, Math.min(1, (s - cum[lo]) / l));
    const dl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, dx: (b[0] - a[0]) / dl, dy: (b[1] - a[1]) / dl };
  }

  /** The spots for n flags along road r's street from a metres in, before any lamp is looked for:
   *  where the map's lamps would stand, a lamp's spacing apart on alternate sides. */
  spots(r: number, a: number, n: number, seed: number): { x: number; z: number; a: number }[] {
    const ch = this.chain(r), off = roadHalf(ch.c) + 0.45, out: { x: number; z: number; a: number }[] = [];
    for (let j = 0; j < n; j++) {
      const s = Math.max(1, Math.min(ch.len - 1, a + j * SPACING)), p = this.along(ch, s);
      const side = (j + seed) % 2 ? 1 : -1;
      // as tools/streets.py stands a lamp: off the kerb on its side, its arm reaching over the street
      out.push({ x: p.x - p.dy * off * side, z: -(p.y + p.dx * off * side), a: Math.atan2(p.dy, p.dx) + (side > 0 ? 0 : Math.PI) });
    }
    return out;
  }

  /** The spots on the ground: each on the nearest of the map's lamps loaded here, or a pole of the lads' own. */
  place(raw: { x: number; z: number; a: number }[]): Spot[] {
    const used = new Set<LampAt>();
    return raw.map((s) => {
      let best: LampAt | null = null, bd = SNAP;
      for (const area of [this.map, ...this.map.tilesNear(s.x, s.z, SNAP)]) {
        const grid = this.lampsOf(area), cx = Math.floor(s.x / CELL), cz = Math.floor(s.z / CELL);
        for (let i = -1; i <= 1; i++) for (let k = -1; k <= 1; k++) for (const l of grid.get(`${cx + i},${cz + k}`) ?? []) {
          const d = Math.hypot(l.x - s.x, l.z - s.z);
          if (d < bd && !used.has(l)) { bd = d; best = l; }
        }
      }
      if (best) { used.add(best); return { x: best.x, z: best.z, g: best.g, a: best.a, lamp: true }; }
      const at = clearSpot(this.map, s.x, s.z, 2) ?? [s.x, s.z];
      return { x: at[0], z: at[1], g: this.map.ground(at[0], at[1]), a: s.a, lamp: false };
    });
  }

  private lampsOf(area: GameMap): Map<string, LampAt[]> {
    let grid = this.lampGrid.get(area);
    if (grid) return grid;
    grid = new Map();
    for (const f of area.d.fx ?? []) {
      if (f[0] !== "lamp") continue;
      const l = { x: +f[1], z: -f[2], g: +f[3] - area.z0, a: +f[4] }, k = `${Math.floor(l.x / CELL)},${Math.floor(l.z / CELL)}`;
      const list = grid.get(k);
      if (list) list.push(l); else grid.set(k, [l]);
    }
    this.lampGrid.set(area, grid);
    return grid;
  }

  /** The usable road nearest scene (x, z) within r metres, and how far along its street (x, z) is. */
  nearest(x: number, z: number, r: number): { r: number; s: number } | null {
    let best = -1, bd = r;
    for (const i of this.usable) {
      const mx = this.mids[i * 2], mz = this.mids[i * 2 + 1];
      if (Math.abs(mx - x) > r + 400 || Math.abs(mz - z) > r + 400) continue;
      const p = this.roads[i].p;
      for (let k = 1; k < p.length; k++) {
        const ax = p[k - 1][0], ay = -p[k - 1][1], bx = p[k][0], by = -p[k][1], dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - ay) * dy) / l)), d = Math.hypot(x - ax - t * dx, z - ay - t * dy);
        if (d < bd) { bd = d; best = i; }
      }
    }
    if (best < 0) return null;
    // where along the street: walk the chain to the nearest of its points
    const ch = this.chain(best);
    let s = 0, sd = Infinity;
    for (let k = 0; k < ch.pts.length; k++) { const d = Math.hypot(ch.pts[k][0] - x, -ch.pts[k][1] - z); if (d < sd) { sd = d; s = ch.cum[k]; } }
    return { r: best, s };
  }

  /** The streets running into road r's street (other names) near scene (x, z): each road, and where
   *  along its own street it meets, nearest first. */
  joining(r: number, x: number, z: number, reach: number): { r: number; s: number; inward: number }[] {
    const ch = this.chain(r), out: { r: number; s: number; inward: number; d: number }[] = [], seen = new Set<string>();
    for (const q of ch.pts) {
      if (Math.hypot(q[0] - x, -q[1] - z) > reach) continue;
      for (const i of this.endsNear(q[0], q[1])) {
        const road = this.roads[i];
        if (this.same(this.roads[r], road) || seen.has(road.n || `#${i}`)) continue;
        seen.add(road.n || `#${i}`);
        const jc = this.chain(i), p = road.p, atStart = Math.hypot(p[0][0] - q[0], p[0][1] - q[1]) < JOIN;
        out.push({ r: i, s: atStart ? jc.from : jc.to, inward: atStart ? 1 : -1, d: Math.hypot(q[0] - x, -q[1] - z) });
      }
    }
    return out.sort((a, b) => a.d - b.d || a.r - b.r);
  }
}
