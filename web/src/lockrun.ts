// The Lock Run: a team challenge (challenges.ts) on a flight of the canal's locks (canal.ts), such
// as Widcombe's six down to the river in Bath. Take a narrowboat loaded with barrels from above the
// top lock to below the bottom one, working every lock by hand. There's no clock: the trouble is the
// water and each other.
//
// - The gates are heavy. Lean on a balance beam (E) and walk it round: two of you on a pair of gates
//   (either beam) swing them in a few seconds, one alone takes the best part of half a minute. Gates
//   won't open until the water's level on both sides.
// - The paddles are wound up with a windlass, a notch a press, and there are only so many
//   windlasses (one for two players, two for up to four, three for more). A windlass left on a
//   raised paddle with nobody by it slips: the paddle crashes down, the windlass spins off and
//   clouts anyone near, and it may land in the cut and be gone. E on a paddle with no windlass on it
//   drops it.
// - The water between the locks (the pounds) is only what's there. Every lockful taken from above
//   or let down below moves it; let it run through a lock with paddles up at both ends and the pound
//   above drains until the boat in it sits on the mud. Running water down through the lock above
//   fills it again. Too much over the by-wash goes on down.
// - The steerer stands on the back deck and works the engine with E (ahead, stop, astern), and the
//   boat coasts a long way. The stone cill under the top gates reaches into the chamber: the crew on
//   the side see its white line on the coping, the steerer doesn't, so someone had better shout.
//
// Mistakes: top paddles wound up too far while the chamber's low surge the boat into the gates
// ahead and knock everyone on deck flat (and a barrel overboard if it hits hard); empty the lock with
// the stern over the cill and it hangs there while the bow goes down, the boat slowly stands on end
// and the barrels and the crew slide off, and if nobody gets the water back in quick it sinks; a
// bottom paddle left up while filling and the lock never fills; stand in the way of a beam as it
// swings and you're in the cut. A sunk boat loses the challenge, back to the top. Barrels lost make
// for a worse result, and none at all is no result. With four or more of you a second boat comes up
// the flight the other way, sharing the water and the locks.
//
// Who decides what: the host runs the water (each lock's chamber and each pound), the gates, the
// paddles, the windlasses and the boats, and sends them round about five times a second ("qe"
// "st"); everyone else draws them, smoothed. Winding a paddle, leaning on a beam, picking up a
// windlass and the engine are requests to the host ("qe" "a"), and the host says what came of them
// (a surge, a windlass flung off, someone in the cut: "qe" "fx") for every screen to show; whoever
// went in the water moves themselves. Where it is comes from the map's canal file alone, so every
// player puts it in the same place. Until someone takes it on, the first boat lies moored above the
// top lock with its barrels on the roof, where the run starts from, built on each screen from the day.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import * as SFX from "./audio";
import { registerChallenge, type ChallengeSpot } from "./challenges";
import { Canal, boatGeometry, type CanalData } from "./canal";
import { model } from "./furniture";
import type { GameMap, Mover } from "./map";
import { openGround } from "./oddments";
import { hash, rng, type Card, type Job, type Offer, type QuestWorld, type Waiting } from "./quests";

const LH = 2.15, COPE = 1.2, MITRE = 0.32, BEAM = 4.45;   // as canal.ts draws its locks
const HW = 1.04;                       // half a narrowboat's beam
const NOTCH = 1 / 8;                   // a press of the windlass
const KP = 7;                        // how much a paddle lets through, fully up, per root metre of head
const KG = 60;                         // and an open pair of gates
const SIDE = 1.5;                      // the pounds' side ponds and by-washes, on top of the water drawn
const LOCKFUL = 0.28;                  // and at least enough of them that a lockful moves a pound no more than this
const GROUND = -0.45, AFLOAT = -0.38;  // a pound this far down puts a boat on the mud, and this lifts it off
const WEIR = 0.12;                     // over this, a pound spills down its by-wash
const SURGE = 1.6;                     // top paddles open (0..2) times the head (m) that surges a boat
const CILL = 2.4;                      // how far the cill reaches into the chamber from the top gates' line
const AHEAD = 0.85, ASTERN = 0.6;      // m/s
const SLIP = 4;                        // seconds a windlass holds on a raised paddle with nobody by it
const SOLO = 1 / 32, PAIR = 1 / 7, GANG = 1 / 5;   // a pair of gates' swing a second, for one, two, more
const BARRELS = 6;
const SEND = 0.2;
const NAMES = ["Sally Lunn", "Mudlark", "Bath Bun", "Kennet Belle", "Widcombe Lass", "Old Tom", "Perseverance", "Hope & Anchor"];
const FACE = [1, -1];
const TESTING = new URLSearchParams(location.search).has("objects");   // the testing option (oddments.ts): lets a probe at it                  // the first boat goes down the flight, the second comes up it

const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const ssq = (h: number) => Math.sign(h) * Math.sqrt(Math.abs(h));
const shut = (side: number) => Math.atan2(-side * Math.cos(MITRE), Math.sin(MITRE));
const harm = (a: number, b: number) => (Number.isFinite(a) ? (Number.isFinite(b) ? (a * b) / (a + b) : a) : b);
const q2 = (v: number) => Math.round(v * 100) / 100;

// ---- the flight, from the canal file ------------------------------------------------------------

interface LockGeo { i: number; n: string; lo: number[]; L: number; ux: number; uz: number; zl: number; zh: number }
interface PathPt { x: number; z: number; s: number; h: number }
interface Flight {
  locks: LockGeo[];                    // top first
  path: PathPt[];                      // scene, from above the top lock down to below the bottom one
  len: number;
  at: { hi: number; lo: number }[];    // where each lock's top and bottom ends are along the path
  pounds: { runs: number[]; area: number; lv: number }[];   // 0 above the top lock and n below the bottom: endless
  runs: number[];                      // every run of water the challenge has the run of
}

/** Scene (x, z) at u along a lock from its bottom gates and v to its left (as canal.ts's Lock.at). */
const lockAt = (g: LockGeo, u: number, v: number): [number, number] => [g.lo[0] + g.ux * u + g.uz * v, -g.lo[1] + g.uz * u - g.ux * v];
const lockLocal = (g: LockGeo, x: number, z: number): [number, number] => {
  const dx = x - g.lo[0], dz = z + g.lo[1];
  return [dx * g.ux + dz * g.uz, dx * g.uz - dz * g.ux];
};

const flights = new WeakMap<CanalData, Flight | null>();
/** The longest flight of two or more locks one after another, or null. The same on every machine. */
function flightOf(d: CanalData | null | undefined): Flight | null {
  if (!d?.locks?.length || !d.runs?.length) return null;
  if (flights.has(d)) return flights.get(d)!;
  const out = findFlight(d);
  flights.set(d, out);
  return out;
}

function findFlight(d: CanalData): Flight | null {
  const nodes: number[][] = [];
  const node = (p: number[]) => {
    let k = nodes.findIndex((n) => Math.hypot(n[0] - p[0], n[1] - p[1]) < 1.5);
    if (k < 0) { k = nodes.length; nodes.push([p[0], p[1]]); }
    return k;
  };
  const runs = d.runs.map((r) => ({ a: node(r.p[0]), b: node(r.p[r.p.length - 1]) }));
  const hiN = d.locks.map((l) => node(l.hi)), loN = d.locks.map((l) => node(l.lo));
  const touching = (n: number) => runs.flatMap((r, i) => (r.a === n || r.b === n ? [i] : []));
  // the water you can get to from a node without going through a lock
  const pound = (n0: number) => {
    const ns = new Set([n0]), rs = new Set<number>(), todo = [n0];
    while (todo.length) {
      const n = todo.pop()!;
      for (const i of touching(n)) {
        if (rs.has(i)) continue;
        rs.add(i);
        for (const m of [runs[i].a, runs[i].b]) if (!ns.has(m)) { ns.add(m); todo.push(m); }
      }
    }
    return { ns, rs };
  };
  const down = d.locks.map((_, i) => {
    const below = pound(loN[i]).ns;
    return d.locks.findIndex((_, j) => j !== i && below.has(hiN[j]));
  });
  const chains: number[][] = [];
  d.locks.forEach((_, i) => {
    if (down.includes(i)) return;
    const c = [i];
    while (down[c[c.length - 1]] >= 0 && !c.includes(down[c[c.length - 1]])) c.push(down[c[c.length - 1]]);
    chains.push(c);
  });
  chains.sort((a, b) => b.length - a.length || d.locks[a[0]].n.localeCompare(d.locks[b[0]].n));
  const chain = chains[0];
  if (!chain || chain.length < 2) return null;

  const locks: LockGeo[] = chain.map((i) => {
    const l = d.locks[i], L = Math.hypot(l.hi[0] - l.lo[0], l.hi[1] - l.lo[1]) || 1;
    return { i, n: l.n, lo: l.lo, L, ux: (l.hi[0] - l.lo[0]) / L, uz: -(l.hi[1] - l.lo[1]) / L, zl: l.zl, zh: l.zh };
  });
  // a run's points from the end at node n onwards, as [x, y, half]
  const from = (i: number, n: number) => {
    const p = d.runs[i].p.map((q) => [q[0], q[1], q[2]]);
    return runs[i].a === n ? p : p.reverse();
  };
  const walk = (n: number, want: number, skip: Set<number>) => {
    const opts = touching(n).filter((i) => !skip.has(i));
    if (!opts.length) return { pts: [[...nodes[n], LH]], run: -1 };
    const i = opts.reduce((a, b) => (d.runs[b].p.length > d.runs[a].p.length ? b : a));
    const p = from(i, n), pts = [p[0]];
    let s = 0;
    for (let k = 1; k < p.length && s < want; k++) { s += Math.hypot(p[k][0] - p[k - 1][0], p[k][1] - p[k - 1][1]); pts.push(p[k]); }
    // the water goes on (into the river, or a wide basin): carry straight on
    if (s < want && pts.length >= 2) {
      const a = pts[pts.length - 2], b = pts[pts.length - 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      pts.push([b[0] + ((b[0] - a[0]) / l) * (want - s), b[1] + ((b[1] - a[1]) / l) * (want - s), b[2]]);
    }
    return { pts, run: i };
  };
  // the shortest way through a pound from node a to node b
  const through = (a: number, b: number, rs: Set<number>) => {
    const dist = new Map<number, number>([[a, 0]]), prev = new Map<number, [number, number]>(), open = new Set([a]);
    while (open.size) {
      const n = [...open].reduce((x, y) => (dist.get(y)! < dist.get(x)! ? y : x));
      open.delete(n);
      if (n === b) break;
      for (const i of touching(n)) {
        if (!rs.has(i)) continue;
        const m = runs[i].a === n ? runs[i].b : runs[i].a, p = d.runs[i].p;
        let l = 0;
        for (let k = 1; k < p.length; k++) l += Math.hypot(p[k][0] - p[k - 1][0], p[k][1] - p[k - 1][1]);
        const nd = dist.get(n)! + l;
        if (nd < (dist.get(m) ?? Infinity)) { dist.set(m, nd); prev.set(m, [n, i]); open.add(m); }
      }
    }
    const legs: number[][] = [];
    for (let n = b; n !== a;) {
      const pv = prev.get(n);
      if (!pv) return [nodes[a].concat(LH), nodes[b].concat(LH)];
      legs.unshift(...from(pv[1], pv[0]));
      n = pv[0];
    }
    return legs;
  };

  const pts: number[][] = [];
  const add = (ps: number[][]) => { for (const p of ps) { const l = pts[pts.length - 1]; if (!l || Math.hypot(l[0] - p[0], l[1] - p[1]) > 0.05) pts.push(p); } };
  const kept = new Set<number>();
  const above = walk(hiN[chain[0]], 70, new Set());
  if (above.run >= 0) kept.add(above.run);
  add(above.pts.reverse());
  const pounds: Flight["pounds"] = [{ runs: [], area: Infinity, lv: locks[0].zh }];
  chain.forEach((li, k) => {
    const l = d.locks[li];
    add([[l.hi[0], l.hi[1], LH]]);
    add([[l.lo[0], l.lo[1], LH]]);
    if (k < chain.length - 1) {
      const pd = pound(loN[li]);
      let area = 0;
      for (const i of pd.rs) {
        const p = d.runs[i].p;
        for (let j = 1; j < p.length; j++) area += Math.hypot(p[j][0] - p[j - 1][0], p[j][1] - p[j - 1][1]) * (p[j][2] + p[j - 1][2]);
        kept.add(i);
      }
      const lockful = Math.max(...[l, d.locks[chain[k + 1]]].map((q) => Math.hypot(q.hi[0] - q.lo[0], q.hi[1] - q.lo[1]) * LH * 2 * (q.zh - q.zl)));
      pounds.push({ runs: [...pd.rs].sort((x, y) => x - y), area: Math.max(area * SIDE, lockful / LOCKFUL), lv: l.zl });
      add(through(loN[li], hiN[chain[k + 1]], pd.rs));
    }
  });
  pounds.push({ runs: [], area: Infinity, lv: locks[locks.length - 1].zl });
  const below = walk(loN[chain[chain.length - 1]], 60, new Set());
  if (below.run >= 0) kept.add(below.run);
  add(below.pts);

  const path: PathPt[] = [];
  let s = 0;
  pts.forEach((p, k) => {
    if (k) s += Math.hypot(p[0] - pts[k - 1][0], p[1] - pts[k - 1][1]);
    path.push({ x: p[0], z: -p[1], s, h: p[2] ?? LH });
  });
  // each lock's two ends, in order down the path
  let from0 = 0;
  const at = chain.map((li) => {
    const l = d.locks[li];
    const find = (q: number[]) => {
      const k = path.findIndex((p, j) => j >= from0 && Math.hypot(p.x - q[0], p.z + q[1]) < 0.06);
      if (k >= 0) from0 = k;
      return path[Math.max(0, k)].s;
    };
    const hi = find(l.hi), lo = find(l.lo);
    return { hi, lo: Math.max(lo, hi + 1) };
  });
  return { locks, path, len: s, at, pounds, runs: [...kept].sort((x, y) => x - y) };
}

/** Where along the path s is, and which way it runs there. */
function along(f: Flight, s: number): { x: number; z: number; tx: number; tz: number; h: number } {
  const p = f.path;
  s = clamp(s, 0, f.len);
  let lo = 0, hi = p.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (p[m].s <= s) lo = m; else hi = m; }
  const a = p[lo], b = p[hi], l = b.s - a.s || 1, t = (s - a.s) / l;
  const tx = b.x - a.x, tz = b.z - a.z, tl = Math.hypot(tx, tz) || 1;
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, tx: tx / tl, tz: tz / tl, h: Math.min(a.h, b.h) };
}

// ---- what the host keeps ------------------------------------------------------------------------

interface BoatS {
  s: number; v: number; eng: number; last: number; lat: number; helm: string;
  barrels: number; pitch: number; hang: number; home: boolean; sunk: boolean; aground: boolean;
}
/** A windlass: [0] gone in the cut, [1, id] in someone's hand, [2, lock, end, side] on a spindle, [3, x, z, y] on the ground. */
type Windlass = [0] | [1, string] | [2, number, number, number] | [3, number, number, number];
interface State {
  c: number[];               // each chamber's water (metres, as the map's heights)
  g: number[][];             // [lock][end: 0 bottom, 1 top] gates, 0 shut .. 1 open
  p: number[][][];           // [lock][end][side] paddles, 0 down .. 1 fully up
  pd: number[];              // each pound's water above (+) or below (-) its level
  b: BoatS[];
  wl: Windlass[];
  push: [string, number, number][];   // who's leaning on which pair of gates
}

interface BoatView { root: THREE.Group; tilt: THREE.Group; barrels: THREE.InstancedMesh; mover: Mover & { root: THREE.Object3D }; s: number; lat: number; pitch: number }

class LockRun {
  readonly n: number;
  S: State;
  private canal: Canal | null;
  private group = new THREE.Group();
  private mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  private racks!: THREE.InstancedMesh;
  cillMarks!: THREE.Mesh;
  private spinners: THREE.Mesh[] = [];
  readonly views: BoatView[] = [];
  readonly D: { c: number[]; g: number[][] };
  private gd: number[][];                       // host: which way each pair of gates is being pushed
  private idle: number[][][];                   // host: seconds a windlass has been left on each paddle
  private spin: number[][][];                   // how far round each spindle's windlass has turned
  private leakT: number[];
  private surgeT: number[] = [0, 0];
  private bumpT: number[] = [0, 0];
  private slideT: number[] = [0, 0];
  private sinkT: number[] = [0, 0];
  private tipping: boolean[] = [false, false];
  private dunked = new Map<string, number>();   // host: when each player last went in, so they go in once
  private sendT = 0;
  private slips = 0;
  marked = -1;                                  // which lock the map pin's on
  readonly names: string[];
  readonly paints: number[];

  constructor(readonly f: Flight, readonly offer: Offer, readonly w: QuestWorld, players: string[]) {
    this.n = f.locks.length;
    const r = rng(offer.seed);
    const nb = players.length >= 4 ? 2 : 1;
    const nw = players.length <= 2 ? 1 : players.length <= 4 ? 2 : 3;
    this.names = [0, 1].map(() => NAMES[Math.floor(r() * NAMES.length)]);
    if (this.names[1] === this.names[0]) this.names[1] = NAMES[(NAMES.indexOf(this.names[0]) + 3) % NAMES.length];
    this.paints = [0, 1].map(() => Math.floor(r() * 7));
    const len = this.boatLen();
    const c = f.locks.map((l) => (r() < 0.5 ? l.zh : l.zl));
    const holders = [...players].sort().slice(0, nw);
    const top = f.locks[0];
    const wl: Windlass[] = [];
    for (let k = 0; k < nw; k++) {
      if (holders[k]) wl.push([1, holders[k]]);
      else { const [x, z] = lockAt(top, top.L + 1.4, LH + COPE + 1.5 + k); wl.push([3, x, z, top.zh + 0.45 - w.map.z0]); }
    }
    const boats: BoatS[] = [];
    for (let k = 0; k < nb; k++) boats.push({
      s: k === 0 ? Math.max(len / 2 + 1, f.at[0].hi - 6 - len / 2) : Math.min(f.len - len / 2 - 1, f.at[this.n - 1].lo + 6 + len / 2),
      v: 0, eng: 0, last: -1, lat: 0, helm: "", barrels: BARRELS, pitch: 0, hang: 0, home: false, sunk: false, aground: false,
    });
    this.S = {
      c, g: f.locks.map(() => [0, 0]), p: f.locks.map(() => [[0, 0], [0, 0]]),
      pd: f.pounds.map(() => 0), b: boats, wl, push: [],
    };
    this.D = { c: [...c], g: f.locks.map(() => [0, 0]) };
    this.gd = f.locks.map(() => [1, 1]);
    this.idle = f.locks.map(() => [[0, 0], [0, 0]]);
    this.spin = f.locks.map(() => [[0, 0], [0, 0]]);
    this.leakT = f.locks.map(() => 0);
    this.canal = w.map.canal instanceof Canal ? w.map.canal : null;
    this.canal?.keep(f.locks.map((l) => l.i), f.runs);
    this.build();
    w.scene.add(this.group);
  }

  boatLen() { return Math.min(18, Math.min(...this.f.locks.map((l) => l.L)) - 5.5); }
  get hl() { return this.boatLen() / 2; }
  copingY(k: number) { return this.f.locks[k].zh + 0.45 - this.w.map.z0; }

  // ---- where things are --------------------------------------------------------------------------
  /** A paddle's post: on the coping just above the bottom gates, or at the head of the lock above the top ones. */
  post(k: number, e: number, d: number): [number, number] {
    const g = this.f.locks[k];
    return lockAt(g, e ? g.L + 1.4 : 2.0, (d ? -1 : 1) * (LH + 0.55));
  }
  private heelU(k: number, e: number) { return e ? this.f.locks[k].L - 0.6 : 0.6; }
  /** The end of a balance beam, where you push, for gates open g. */
  beamEnd(k: number, e: number, d: number, g: number): [number, number] {
    const side = d ? -1 : 1, r = shut(side) * (1 - smooth(g));
    return lockAt(this.f.locks[k], this.heelU(k, e) - BEAM * Math.cos(r), side * LH - BEAM * Math.sin(r));
  }
  /** The chamber's water on the far side of a pair of gates: the pound above the top ones, below the bottom ones. */
  pound(i: number) { return this.f.pounds[i].lv + this.S.pd[i]; }
  /** How far the levels either side of a pair of gates are out. */
  mismatch(k: number, e: number) { return Math.abs(this.S.c[k] - this.pound(e ? k : k + 1)); }
  private gateS(k: number, e: number) { return e ? this.f.at[k].hi + 0.6 : this.f.at[k].lo - 0.6; }
  /** The chamber a point along the path is in, or -1. */
  chamberAt(s: number) {
    for (let k = 0; k < this.n; k++) if (s > this.f.at[k].hi + 0.6 && s < this.f.at[k].lo - 0.6) return k;
    return -1;
  }
  /** The pound a point along the path is in (if it's not in a chamber). */
  poundAt(s: number) { let i = 0; for (let k = 0; k < this.n; k++) if (s >= this.f.at[k].lo - 0.6) i = k + 1; return i; }
  levelAt(s: number, c = this.S.c) { const k = this.chamberAt(s); return k >= 0 ? c[k] : this.pound(this.poundAt(s)); }
  /** Feet at (x, y, z) on boat b's deck or roof. */
  onDeck(b: number, x: number, y: number, z: number) {
    const m = this.views[b]?.mover;
    if (!m) return false;
    const cs = Math.cos(m.a), sn = Math.sin(m.a), dx = x - m.x, dz = z - m.z;
    return Math.abs(dx * cs - dz * sn) < m.hl + 0.3 && Math.abs(dx * sn + dz * cs) < m.hw + 0.3 && y > m.y + 0.3 && y < m.top + 0.8;
  }
  stern(b: number): { x: number; z: number; y: number } {
    const m = this.views[b].mover, back = m.hl - 0.6;
    return { x: m.x - Math.cos(m.a) * back, z: m.z + Math.sin(m.a) * back, y: m.waist };
  }
  /** Boat b's end nearest the top of the flight, along the path. */
  private upEnd(b: BoatS) { return b.s - this.hl; }
  /** The lock boat b is working through or coming to next, or n when it's done. */
  nextLock(i: number) {
    const b = this.S.b[i], hl = this.hl;
    if (FACE[i] > 0) { for (let k = 0; k < this.n; k++) if (b.s - hl < this.f.at[k].lo - 0.6) return k; return this.n; }
    for (let k = this.n - 1; k >= 0; k--) if (b.s + hl > this.f.at[k].hi + 0.6) return k;
    return -1;
  }
  passed(i: number) { const k = this.nextLock(i); return FACE[i] > 0 ? k : this.n - 1 - k; }
  /** Over the cill: lock k if boat i's upper end is in the cill's reach inside that chamber. */
  overCill(i: number): number {
    const b = this.S.b[i], u = this.upEnd(b);
    for (let k = 0; k < this.n; k++) if (u > this.f.at[k].hi + 0.5 && u < this.f.at[k].hi + CILL && this.chamberAt(b.s) === k) return k;
    return -1;
  }

  // ---- the host's world ---------------------------------------------------------------------------
  sim(dt: number) {
    const S = this.S, f = this.f, n = this.n;
    const ps = this.w.players().filter((p) => p.alive);
    const pos = new Map(ps.map((p) => [p.id, p]));
    // leaning on the beams: only while you're still at the end of one
    S.push = S.push.filter(([id, k, e]) => {
      const p = pos.get(id);
      if (!p) return false;
      return [0, 1].some((d) => { const [x, z] = this.beamEnd(k, e, d, S.g[k][e]); return Math.hypot(p.x - x, p.z - z) < 3.4; });
    });
    for (let k = 0; k < n; k++) for (let e = 0; e < 2; e++) {
      const who = S.push.filter((q) => q[1] === k && q[2] === e);
      if (!who.length) continue;
      const dir = this.gd[k][e], g0 = S.g[k][e];
      if (dir > 0 && this.mismatch(k, e) > 0.06) continue;
      let g = clamp(g0 + dir * (who.length >= 3 ? GANG : who.length === 2 ? PAIR : SOLO) * dt, 0, 1);
      // closing on a boat in the gateway: it won't
      if (dir < 0 && g < 0.93 && S.b.some((b) => !b.sunk && b.s - this.hl < this.gateS(k, e) && b.s + this.hl > this.gateS(k, e))) {
        g = Math.max(g, 0.93);
        S.push = S.push.filter((q) => !(q[1] === k && q[2] === e));
        this.fx({ f: "jam", l: k, e });
      }
      // a beam swinging round sweeps anyone in its way into the cut
      for (const d of [0, 1]) {
        const side = d ? -1 : 1, rA = shut(side) * (1 - smooth(g0)), rB = shut(side) * (1 - smooth(g));
        for (const p of ps) {
          if (who.some((q) => q[0] === p.id) || Math.abs(p.y - this.copingY(k)) > 1.5) continue;
          const [u, v] = lockLocal(f.locks[k], p.x, p.z), du = u - this.heelU(k, e), dv = v - side * LH, rho = Math.hypot(du, dv);
          // at the beam's end you're walked round with it; it's along its length that it sweeps you off
          if (rho < 1 || rho > BEAM - 0.9) continue;
          const rp = Math.atan2(-dv, -du);
          if (rp > Math.min(rA, rB) - 0.06 && rp < Math.max(rA, rB) + 0.06) this.dunk(p.id, k, e);
        }
      }
      S.g[k][e] = g;
      if (g <= 0 || g >= 1) {
        S.push = S.push.filter((q) => !(q[1] === k && q[2] === e));
        this.fx({ f: "gate", l: k, e, o: g >= 1 ? 1 : 0 });
      }
    }

    // the water: through each lock's paddles and open gates, between its chamber and the pounds
    const dc = S.c.map(() => 0), dp = S.pd.map(() => 0);
    for (let k = 0; k < n; k++) {
      const g = f.locks[k], Ac = g.L * LH * 2, A = this.pound(k), B = this.pound(k + 1), c = S.c[k];
      const aU = f.pounds[k].area, aD = f.pounds[k + 1].area;
      let qt = (KP * (S.p[k][1][0] + S.p[k][1][1]) + KG * S.g[k][1]) * ssq(A - c) * dt;
      let qb = (KP * (S.p[k][0][0] + S.p[k][0][1]) + KG * S.g[k][0]) * ssq(c - B) * dt;
      const mt = Math.abs(A - c) * harm(aU, Ac) * 0.9, mb = Math.abs(c - B) * harm(Ac, aD) * 0.9;
      qt = clamp(qt, -mt, mt); qb = clamp(qb, -mb, mb);
      dc[k] += (qt - qb) / Ac;
      if (Number.isFinite(aU)) dp[k] -= qt / aU;
      if (Number.isFinite(aD)) dp[k + 1] += qb / aD;
      // water running straight through, top and bottom both open
      const open = (e: number) => S.p[k][e][0] + S.p[k][e][1] > 0;
      if (open(0) && open(1) && Math.abs(A - c) > 0.15 && Math.abs(c - B) > 0.15) {
        if ((this.leakT[k] += dt) > 6) { this.leakT[k] = -14; this.fx({ f: "leak", l: k }); }
      } else this.leakT[k] = Math.min(0, this.leakT[k] + dt);
    }
    for (let k = 0; k < n; k++) S.c[k] = clamp(S.c[k] + dc[k], f.locks[k].zl - 1.2, f.locks[k].zh + 0.3);
    for (let i = 1; i < n; i++) {
      S.pd[i] = clamp(S.pd[i] + dp[i], -1.1, 0.4);
      // the by-wash takes the excess on down to the next pound
      if (S.pd[i] > WEIR) {
        const vol = (S.pd[i] - WEIR) * f.pounds[i].area * Math.min(1, 0.5 * dt);
        S.pd[i] -= vol / f.pounds[i].area;
        if (Number.isFinite(f.pounds[i + 1].area)) S.pd[i + 1] += vol / f.pounds[i + 1].area;
      }
    }

    // a windlass left on a raised paddle with nobody by it slips
    for (let k = 0; k < n; k++) for (let e = 0; e < 2; e++) for (let d = 0; d < 2; d++) {
      const wi = this.onSpindle(k, e, d);
      if (wi < 0 || S.p[k][e][d] <= 0) { this.idle[k][e][d] = 0; continue; }
      const [x, z] = this.post(k, e, d);
      const by = ps.some((p) => Math.hypot(p.x - x, p.z - z) < 2.6);
      if (by) { this.idle[k][e][d] = 0; continue; }
      if ((this.idle[k][e][d] += dt) < SLIP) continue;
      this.idle[k][e][d] = 0;
      S.p[k][e][d] = 0;
      const r = rng(hash(this.offer.seed, "slip", this.slips++));
      const g = f.locks[k], side = d ? -1 : 1;
      let lost = r() < 0.35;
      if (!lost) {
        const [gx, gz] = lockAt(g, (e ? g.L + 1.4 : 2.0) + (r() - 0.5) * 10, side * (LH + COPE + 1 + r() * 3));
        S.wl[wi] = [3, q2(gx), q2(gz), this.copingY(k)];
      } else S.wl[wi] = [0];
      const hit = ps.filter((p) => Math.hypot(p.x - x, p.z - z) < 7).map((p) => p.id);
      this.fx({ f: "slip", l: k, e, d, lost: lost ? 1 : 0, hit, left: S.wl.filter((q) => q[0] !== 0).length });
    }

    // the boats
    const hl = this.hl;
    S.b.forEach((b, i) => {
      if (b.home || b.sunk) return;
      const face = FACE[i];
      const ch = this.chamberAt(b.s);
      if (ch < 0) {
        const pi = this.poundAt(b.s);
        if (!b.aground && S.pd[pi] < GROUND) { b.aground = true; b.v = 0; this.fx({ f: "aground", b: i }); }
        else if (b.aground && S.pd[pi] > AFLOAT) { b.aground = false; this.fx({ f: "afloat", b: i }); }
      } else if (b.aground) { b.aground = false; }
      // hung on the cill as the water goes down: the bow drops and she stands on end
      const ck = this.overCill(i);
      b.hang = ck >= 0 ? Math.max(0, f.locks[ck].zh - 1.1 - S.c[ck]) : 0;
      b.pitch += (Math.min(1.3, b.hang * 0.7) - b.pitch) * Math.min(1, dt * 0.8);
      if (b.hang > 0.03 && !this.tipping[i]) { this.tipping[i] = true; this.fx({ f: "tip", b: i, l: ck }); }
      if (this.tipping[i] && b.hang <= 0 && b.pitch < 0.05) { this.tipping[i] = false; this.fx({ f: "slap", b: i }); }
      if (b.pitch > 0.2 && b.barrels > 0 && (this.slideT[i] += dt) > 1.2) { this.slideT[i] = 0; b.barrels--; this.fx({ f: "barrel", b: i, why: "slide" }); }
      if (b.pitch > 0.35) for (const p of ps) if (this.onDeck(i, p.x, p.y, p.z)) this.dunk(p.id, -1, 0, i);
      this.sinkT[i] = b.pitch > 0.75 ? this.sinkT[i] + dt : Math.max(0, this.sinkT[i] - dt);
      if (this.sinkT[i] > 4) { b.sunk = true; b.v = 0; this.fx({ f: "sunk", b: i, l: ck }); return; }
      // a surge through the top paddles with the chamber low
      if (ch >= 0) {
        const head = this.pound(ch) - S.c[ch], open = S.p[ch][1][0] + S.p[ch][1][1];
        if (open * head > SURGE && this.surgeT[i] <= 0) { this.surgeT[i] = 6; b.v = face * 1.9; this.fx({ f: "surge", b: i, l: ch }); }
      }
      this.surgeT[i] -= dt; this.bumpT[i] -= dt;
      // the engine, and a long coast
      if (b.hang > 0.02 || b.aground) b.v = 0;
      else if (b.eng) b.v += clamp(b.eng * face * (b.eng > 0 ? AHEAD : ASTERN) - b.v, -0.3 * dt, 0.2 * dt);
      else b.v -= Math.sign(b.v) * Math.min(Math.abs(b.v), 0.07 * dt);
      const was = b.s;
      b.s += b.v * dt;
      // the gates: shut ones stop her
      for (let k = 0; k < n; k++) for (let e = 0; e < 2; e++) {
        if (S.g[k][e] > 0.92) continue;
        const gs = this.gateS(k, e);
        if (was + hl <= gs + 0.05 && b.s + hl > gs) this.bump(i, gs - hl);
        else if (was - hl >= gs - 0.05 && b.s - hl < gs) this.bump(i, gs + hl);
      }
      if (b.s - hl < 0) { b.s = hl; b.v = 0; }
      if (b.s + hl > f.len) { b.s = f.len - hl; b.v = 0; }
      // keeping to the right of a boat coming the other way, where there's room
      const o = S.b[1 - i], near = o && !o.sunk && Math.abs(o.s - b.s) < 45 && this.chamberAt(b.s) < 0 && this.chamberAt(o.s) < 0;
      const room = Math.max(0, along(f, b.s).h - HW - 0.25);
      b.lat += clamp((near ? -face * room : 0) - b.lat, -0.5 * dt, 0.5 * dt);
      b.lat = clamp(b.lat, -room, room);
      if (face > 0 ? b.s - hl > f.at[n - 1].lo + 0.5 : b.s + hl < f.at[0].hi - 0.5) { b.home = true; b.v = 0; b.eng = 0; this.fx({ f: "home", b: i }); }
    });
    // two boats can't go through each other, except side by side in a pound
    if (S.b.length === 2 && !S.b[0].sunk && !S.b[1].sunk) {
      const [a, b] = S.b[0].s < S.b[1].s ? [S.b[0], S.b[1]] : [S.b[1], S.b[0]];
      if (a.s + hl > b.s - hl - 0.3 && Math.abs(a.lat - b.lat) < HW * 2 + 0.2) {
        const mid = (a.s + b.s) / 2;
        a.s = Math.min(a.s, mid - hl - 0.3); b.s = Math.max(b.s, mid + hl + 0.3);
        const hard = Math.abs(a.v - b.v) > 0.6;
        a.v = b.v = 0;
        if (this.bumpT[0] <= 0) { this.bumpT[0] = 1.5; this.fx({ f: "thump", b: S.b.indexOf(a), hard: hard ? 1 : 0 }); }
      }
    }

    const done = S.b.findIndex((b) => b.sunk);
    if (done >= 0) {
      const at = this.finishAt();
      const k = this.nextLock(done), where = f.locks[clamp(k, 0, n - 1)].n;
      this.fx({ f: "end", won: 0, text: `${this.names[done]} sank at ${where}. Back to the top`, x: at[0], z: at[1] });
    } else if (S.b.every((b) => b.home)) {
      const got = S.b.reduce((t, b) => t + b.barrels, 0), all = S.b.length * BARRELS;
      const at = this.finishAt();
      this.fx(got
        ? { f: "end", won: 1, text: `Down the flight with ${got} of ${all} barrels`, x: at[0], z: at[1], got, all }
        : { f: "end", won: 0, text: "Through the flight, without a barrel left", x: at[0], z: at[1] });
    }
  }

  /** The bottom lock's side, where the object turns up. */
  finishAt() { const g = this.f.locks[this.n - 1]; return lockAt(g, -1, LH + COPE + 2.5); }

  private bump(i: number, to: number) {
    const b = this.S.b[i], hard = Math.abs(b.v) > 1.0;
    b.s = to;
    if (Math.abs(b.v) > 0.25 && this.bumpT[i] <= 0) {
      this.bumpT[i] = 1.2;
      if (hard && b.barrels > 0) { b.barrels--; this.fx({ f: "barrel", b: i, why: "bump" }); }
      this.fx({ f: "thump", b: i, hard: hard ? 1 : 0 });
    }
    b.v = 0;
  }

  private dunk(id: string, k: number, e: number, b = -1) {
    const t = performance.now();
    if (t - (this.dunked.get(id) ?? -1e9) < 7000) return;
    this.dunked.set(id, t);
    this.S.push = this.S.push.filter((q) => q[0] !== id);
    this.fx({ f: "dunk", id, l: k, e, b });
  }

  onSpindle(k: number, e: number, d: number) {
    return this.S.wl.findIndex((q) => q[0] === 2 && q[1] === k && q[2] === e && q[3] === d);
  }
  holding(id: string) { return this.S.wl.findIndex((q) => q[0] === 1 && q[1] === id); }

  /** A player's request (host only). */
  act(d: any, from: string) {
    const S = this.S, n = this.n;
    const p = this.w.players().find((q) => q.id === from);
    if (!p || !p.alive) return;
    const k = Number(d.l), e = Number(d.e) ? 1 : 0, sd = Number(d.d) ? 1 : 0;
    const okLock = Number.isInteger(k) && k >= 0 && k < n;
    if (d.a === "pad" && okLock) {
      const [x, z] = this.post(k, e, sd);
      if (Math.hypot(p.x - x, p.z - z) > 3) return;
      const wi = this.onSpindle(k, e, sd), mine = this.holding(from);
      if (wi >= 0) {
        if (S.p[k][e][sd] < 1) { S.p[k][e][sd] = Math.min(1, S.p[k][e][sd] + NOTCH); this.idle[k][e][sd] = 0; this.fx({ f: "wind", l: k, e, d: sd }); }
        else if (mine < 0) { S.wl[wi] = [1, from]; this.fx({ f: "off", l: k, e, d: sd }); }
      } else if (S.p[k][e][sd] > 0) { S.p[k][e][sd] = 0; this.fx({ f: "drop", l: k, e, d: sd }); }
      else if (mine >= 0) { S.wl[mine] = [2, k, e, sd]; S.p[k][e][sd] = NOTCH; this.fx({ f: "wind", l: k, e, d: sd }); }
    } else if (d.a === "push" && okLock) {
      const had = S.push.findIndex((q) => q[0] === from && q[1] === k && q[2] === e);
      if (had >= 0) { S.push.splice(had, 1); return; }
      const [x, z] = this.beamEnd(k, e, sd, S.g[k][e]);
      if (Math.hypot(p.x - x, p.z - z) > 3.4) return;
      if (!S.push.some((q) => q[1] === k && q[2] === e)) this.gd[k][e] = S.g[k][e] < 0.5 ? 1 : -1;
      S.push = S.push.filter((q) => q[0] !== from);
      S.push.push([from, k, e]);
    } else if (d.a === "pick") {
      const i = Number(d.i), q = S.wl[i];
      if (!q || q[0] !== 3 || this.holding(from) >= 0 || Math.hypot(p.x - q[1], p.z - q[2]) > 3) return;
      S.wl[i] = [1, from];
      this.fx({ f: "pick", id: from });
    } else if (d.a === "eng") {
      const i = Number(d.b), b = S.b[i];
      if (!b || b.home || b.sunk || !this.views[i]) return;
      const t = this.stern(i);
      if (Math.hypot(p.x - t.x, p.z - t.z) > 3.4) return;
      b.helm = from;
      if (b.eng) b.eng = 0;
      else { b.eng = b.last > 0 ? -1 : 1; b.last = b.eng; }
      this.fx({ f: "eng", b: i, v: b.eng, id: from });
    }
  }

  // ---- the network ----------------------------------------------------------------------------------
  /** Something happened (host): to everyone, and to ourselves. */
  fx(d: any) {
    const msg = { ...d, k: "fx", s: this.offer.seed };
    this.w.send("qe", msg);
    this.onFx?.(msg);
  }
  onFx?: (d: any) => void;

  pack() {
    const S = this.S;
    return {
      c: S.c.map(q2), g: S.g.map((x) => x.map(q2)), p: S.p, pd: S.pd.map((v) => Math.round(v * 1000) / 1000),
      b: S.b.map((b) => ({ ...b, s: q2(b.s), v: q2(b.v), lat: q2(b.lat), pitch: q2(b.pitch), hang: q2(b.hang) })),
      wl: S.wl, push: S.push,
    };
  }
  unpack(d: any) {
    if (!d || !Array.isArray(d.c) || d.c.length !== this.n || !Array.isArray(d.b) || !Array.isArray(d.g) || !Array.isArray(d.p) || !Array.isArray(d.pd)) return;
    const S = this.S;
    S.c = d.c.map(Number); S.g = d.g; S.p = d.p; S.pd = d.pd.map(Number);
    const rebuild = d.b.length !== S.b.length;
    S.b = d.b;
    if (rebuild) this.buildBoats();
    if (Array.isArray(d.wl)) S.wl = d.wl;
    if (Array.isArray(d.push)) S.push = d.push;
  }
  hostTick(dt: number) {
    if ((this.sendT -= dt) > 0) return;
    this.sendT = SEND;
    this.w.send("qe", { k: "st", s: this.offer.seed, ...this.pack() });
  }

  // ---- building and drawing -------------------------------------------------------------------------
  private build() {
    const f = this.f, z0 = this.w.map.z0;
    const parts: THREE.BufferGeometry[] = [], cills: THREE.BufferGeometry[] = [], marks: THREE.BufferGeometry[] = [];
    const post = model([
      [new THREE.BoxGeometry(0.34, 0.12, 0.34), "#26261f", 0, 0.06, 0],
      [new THREE.BoxGeometry(0.22, 0.8, 0.22), "#2d3b2c", 0, 0.5, 0],
      [new THREE.CylinderGeometry(0.035, 0.035, 0.3, 6).rotateZ(Math.PI / 2), "#9b9a92", 0.2, 0.72, 0],
      [new THREE.BoxGeometry(0.3, 0.06, 0.3), "#f1efe6", 0, 0.93, 0],
    ]);
    const yawOf = (g: LockGeo) => Math.atan2(-g.uz, g.ux);
    f.locks.forEach((g, k) => {
      const y = g.zh + 0.45 - z0;
      for (let e = 0; e < 2; e++) for (let d = 0; d < 2; d++) {
        const [x, z] = this.post(k, e, d);
        parts.push(post.clone().rotateY(yawOf(g) + (d ? Math.PI : 0)).translate(x, y, z));
      }
      // the cill under the water, as far in as it reaches, and its white line on the coping each side
      const cillTop = g.zh - 1.6 - z0, u0 = g.L - CILL, u1 = g.L - 0.9;
      const [cx, cz] = lockAt(g, (u0 + u1) / 2, 0);
      cills.push(new THREE.BoxGeometry(u1 - u0, 0.6, LH * 2 - 0.05).translate(0, cillTop - 0.3, 0).rotateY(yawOf(g)).translate(cx, 0, cz));
      for (const side of [1, -1]) {
        const [mx, mz] = lockAt(g, u0, side * (LH + COPE / 2));
        marks.push(new THREE.BoxGeometry(0.16, 0.03, COPE).rotateY(yawOf(g)).translate(mx, y + 0.015, mz));
      }
    });
    const stone = new THREE.MeshLambertMaterial({ color: "#8f8268" });
    if (parts.length) this.group.add(new THREE.Mesh(mergeGeometries(parts), this.mat));
    if (cills.length) this.group.add(new THREE.Mesh(mergeGeometries(cills), stone));
    this.cillMarks = new THREE.Mesh(mergeGeometries(marks), new THREE.MeshBasicMaterial({ color: "#f4f2ea" }));
    this.group.add(this.cillMarks);
    // the paddles' racks, rising out of their posts as they're wound up
    this.racks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 0.7, 0.07), new THREE.MeshLambertMaterial({ color: "#e9e6da" }), this.n * 4);
    this.racks.frustumCulled = false;
    this.group.add(this.racks);
    // the windlasses: an L of iron with a wooden handle
    const crank = model([
      [new THREE.BoxGeometry(0.42, 0.05, 0.05), "#3b3b38", 0.21, 0, 0],
      [new THREE.BoxGeometry(0.07, 0.07, 0.07), "#3b3b38", 0, 0, 0],
      [new THREE.CylinderGeometry(0.03, 0.03, 0.16, 6).rotateX(Math.PI / 2), "#8a5a2b", 0.42, 0, 0.08],
    ]);
    this.crank = crank;
    this.buildBoats();
    this.draw(0, true);
  }

  private crank!: THREE.BufferGeometry;
  /** The boats, with their barrels on the roof: as many as the host's word has. */
  private buildBoats() {
    for (const v of this.views) { this.group.remove(v.root); v.root.traverse((o) => (o as THREE.Mesh).geometry?.dispose()); }
    this.views.length = 0;
    const len = this.boatLen();
    this.S.b.forEach((_, i) => {
      const { root, tilt, barrels } = ladenBoat(len, this.paints[i], this.mat);
      this.group.add(root);
      const b = this.S.b[i];
      const mover = { x: 0, z: 0, a: 0, hl: len / 2, hw: HW, y: 0, top: 0, waist: 0, root };
      this.views.push({ root, tilt, barrels, mover, s: b.s, lat: 0, pitch: 0 });
    });
  }

  private seenT = 0;
  /** Every frame, on every screen. */
  draw(dt: number, host: boolean) {
    const S = this.S, D = this.D, f = this.f, z0 = this.w.map.z0;
    if ((this.seenT -= dt) <= 0) {
      this.seenT = 0.5;
      const me = this.w.me();
      this.group.visible = f.path.some((p, k) => k % 4 === 0 && Math.hypot(p.x - me.x, p.z - me.z) < 700);
    }
    const ease = host ? 1 : Math.min(1, dt * 5);
    for (let k = 0; k < this.n; k++) {
      D.c[k] += (S.c[k] - D.c[k]) * ease;
      for (let e = 0; e < 2; e++) D.g[k][e] += (S.g[k][e] - D.g[k][e]) * ease;
    }
    // the canal's own locks and pounds, set to ours
    const canal = this.canal;
    if (canal) {
      f.locks.forEach((g, k) => {
        const lk = canal.locks[g.i];
        if (!lk) return;
        const net = KP * (S.p[k][1][0] + S.p[k][1][1]) * ssq(this.pound(k) - S.c[k]) - KP * (S.p[k][0][0] + S.p[k][0][1]) * ssq(S.c[k] - this.pound(k + 1));
        lk.hold = { level: D.c[k], flow: net > 0.4 ? 1 : net < -0.4 ? -1 : 0 };
        lk.g0 = D.g[k][0]; lk.g1 = D.g[k][1];
      });
      f.pounds.forEach((p, i) => { for (const r of p.runs) canal.lower(r, -S.pd[i]); });
    }
    // the paddles' racks and the windlasses
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
    for (let k = 0; k < this.n; k++) for (let e = 0; e < 2; e++) for (let d = 0; d < 2; d++) {
      const [x, z] = this.post(k, e, d), y = this.copingY(k) + 0.6 + S.p[k][e][d] * 0.55;
      this.racks.setMatrixAt(k * 4 + e * 2 + d, m.makeTranslation(x, y, z));
      const was = this.spin[k][e][d];
      this.spin[k][e][d] = was + (S.p[k][e][d] * 6 * Math.PI - was) * Math.min(1, dt * 8);
    }
    this.racks.instanceMatrix.needsUpdate = true;
    while (this.spinners.length < S.wl.length) { const o = new THREE.Mesh(this.crank, this.mat); this.spinners.push(o); this.group.add(o); }
    S.wl.forEach((wl, i) => {
      const o = this.spinners[i];
      o.visible = wl[0] === 2 || wl[0] === 3;
      if (wl[0] === 2) {
        const [k, e, d] = [wl[1], wl[2], wl[3]], g = f.locks[k], [x, z] = this.post(k, e, d), yaw = Math.atan2(-g.uz, g.ux) + (d ? Math.PI : 0);
        const out = new THREE.Vector3(0.36, 0, 0).applyAxisAngle(up, yaw);
        o.position.set(x + out.x, this.copingY(k) + 0.72, z + out.z);
        o.quaternion.setFromAxisAngle(up, yaw + Math.PI / 2).multiply(q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), this.spin[k][e][d]));
      } else if (wl[0] === 3) {
        o.position.set(wl[1], wl[3] + 0.04, wl[2]);
        o.quaternion.setFromAxisAngle(up, i * 1.3);
      }
    });
    // the boats
    const hl = this.hl;
    S.b.forEach((b, i) => {
      const v = this.views[i];
      if (host) { v.s = b.s; v.lat = b.lat; v.pitch = b.pitch; }
      else {
        v.s += b.v * dt;
        v.s += (b.s - v.s) * Math.min(1, dt * 3);
        v.lat += (b.lat - v.lat) * Math.min(1, dt * 2);
        v.pitch += (b.pitch - v.pitch) * Math.min(1, dt * 2);
      }
      const at = along(f, v.s), face = FACE[i];
      const hx = at.tx * face, hz = at.tz * face;
      const x = at.x + hz * v.lat, z = at.z - hx * v.lat;
      const a = Math.atan2(-hz, hx);
      const level = this.levelAt(v.s, D.c) - z0;
      const mv = v.mover;
      mv.x = x; mv.z = z; mv.a = a;
      mv.y = level - 0.5; mv.top = level + 1.75; mv.waist = level + 1.0;
      v.root.position.set(x, level, z);
      v.root.rotation.y = a;
      // tipped on the cill: pivot about the hung end, the other end going down
      const e = -face, th = e * v.pitch;
      v.tilt.rotation.z = th;
      v.tilt.position.set(e * hl - (e * hl * Math.cos(th)), -(e * hl * Math.sin(th)), 0);
      if (v.pitch > 0.01) {
        const k = this.overCill(i);
        const hung = k >= 0 ? f.locks[k].zh - 1.1 - z0 : level;
        v.root.position.y = Math.max(level, hung);
      }
      if (b.sunk) { v.root.position.y = level - 2.2; v.tilt.rotation.z = e * 0.5; }
      v.root.visible = !(b.sunk && dt === 0);
      for (let k = 0; k < BARRELS; k++) {
        v.barrels.getMatrixAt(k, m);
        const pos = new THREE.Vector3().setFromMatrixPosition(m);
        pos.y = k < b.barrels ? 1.75 : -50;
        v.barrels.setMatrixAt(k, m.compose(pos, new THREE.Quaternion(), one));
      }
      v.barrels.instanceMatrix.needsUpdate = true;
    });
  }

  /** Is this player standing at a boat's tiller? */
  steering(x: number, y: number, z: number) {
    return this.S.b.findIndex((b, i) => !b.home && !b.sunk && (() => { const t = this.stern(i); return Math.hypot(x - t.x, z - t.z) < 3 && y > t.y - 1.6 && y < t.y + 2.4; })());
  }

  dispose() {
    this.canal?.keep(null);
    this.w.scene.remove(this.group);
    this.group.traverse((o) => { const g = (o as THREE.Mesh).geometry; if (g) g.dispose(); });
  }
}

/** A narrowboat len long with its barrels along the roof, its bow toward +x and its waterline at y = 0. */
function ladenBoat(len: number, paint: number, mat: THREE.Material) {
  const root = new THREE.Group(), tilt = new THREE.Group();
  const hull = new THREE.Mesh(boatGeometry(paint), mat);
  hull.scale.x = len / 18;
  hull.castShadow = hull.receiveShadow = true;
  tilt.add(hull);
  const barrel = model([
    [new THREE.CylinderGeometry(0.27, 0.27, 0.7, 10), "#7a4f2a", 0, 0.35, 0],
    [new THREE.CylinderGeometry(0.285, 0.285, 0.06, 10), "#2b2b2b", 0, 0.12, 0],
    [new THREE.CylinderGeometry(0.285, 0.285, 0.06, 10), "#2b2b2b", 0, 0.58, 0],
  ]);
  const barrels = new THREE.InstancedMesh(barrel, mat, BARRELS);
  const cab0 = (-9 + 1.7) * (len / 18), cab1 = (9 - 3.6) * (len / 18);
  const m = new THREE.Matrix4();
  for (let k = 0; k < BARRELS; k++) barrels.setMatrixAt(k, m.makeTranslation(cab1 - 0.6 - ((cab1 - cab0 - 1.6) * k) / (BARRELS - 1), 1.75, (k % 2 ? 0.3 : -0.3)));
  barrels.frustumCulled = false;
  tilt.add(barrels);
  root.add(tilt);
  return { root, tilt, barrels };
}

/** The first boat, laden and moored above the top lock where the run starts from, till someone takes it on. */
function waitingBoat(offer: Offer, spots: ChallengeSpot[], w: QuestWorld): Waiting | null {
  const f = flightOf(w.map.canalData);
  if (!f) return null;
  // its paint as LockRun draws it from the seed: two names first, then the paints
  const r = rng(offer.seed);
  r(); r();
  const paint = Math.floor(r() * 7);
  const len = Math.min(18, Math.min(...f.locks.map((l) => l.L)) - 5.5);
  const s = Math.max(len / 2 + 1, f.at[0].hi - 6 - len / 2);
  const at = along(f, s), a = Math.atan2(-at.tz * FACE[0], at.tx * FACE[0]);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const { root } = ladenBoat(len, paint, mat);
  root.position.set(at.x, f.pounds[0].lv - w.map.z0, at.z);
  root.rotation.y = a;
  w.scene.add(root);
  const c = Math.cos(a), sn = Math.sin(a), top = spots[0];
  return {
    // from the towpath beside it, or the top lock
    dist(x, z) {
      const dx = x - at.x, dz = z - at.z;
      const off = Math.hypot(Math.max(0, Math.abs(dx * c - dz * sn) - len / 2), Math.max(0, Math.abs(dx * sn + dz * c) - HW));
      return Math.min(Math.max(0, off - 3), Math.hypot(x - top.x, z - top.z));
    },
    dispose() {
      w.scene.remove(root);
      root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      mat.dispose();
    },
  };
}

// ---- the challenge ------------------------------------------------------------------------------

type Act = { a: "pad"; l: number; e: number; d: number } | { a: "push"; l: number; e: number; d: number } | { a: "pick"; i: number } | { a: "eng"; b: number };

registerChallenge({
  id: "lockrun", name: "The Lock Run",
  blurb: "Work a laden narrowboat down the flight by hand, and keep the water in the pounds",
  glyph: "L", colour: "#3a8fd8", tier: 1, stars: 3,
  goal: () => "Take the boat down the flight with its barrels",
  place(map: GameMap): ChallengeSpot[] | null {
    const f = flightOf(map.canalData);
    if (!f) return null;
    const top = f.locks[0], bot = f.locks[f.locks.length - 1];
    const [x, z] = lockAt(top, top.L + 3, LH + COPE + 3);
    const [bx, bz] = lockAt(bot, -1, LH + COPE + 2.5);
    if (map.fieldEdge(x, z) < 60) return null;
    const home = openGround(map);
    if (home && Math.hypot(home.x - x, -home.y - z) < 60) return null;
    return [{ x, z, name: top.n }, { x: bx, z: bz, name: bot.n }];
  },
  waiting({ offer, spots, w }) { return waitingBoat(offer, spots, w); },
  start({ offer, w }) {
    const f = flightOf(w.map.canalData);
    if (!f) {
      const job: Job = { offer, done: { won: false, text: "There's no flight of locks here" }, update() {}, card: () => ({ line: "" }), end() {} };
      return job;
    }
    const R = new LockRun(f, offer, w, w.players().map((p) => p.id));
    if (TESTING) (window as unknown as { __lockrun: LockRun }).__lockrun = R;
    const S = () => R.S;
    const top = f.locks[0];
    const [mx, mz] = lockAt(top, top.L / 2, 0);
    w.mark("@challenge", { x: mx, z: mz }, offer.title, "#3a8fd8");
    let lastHint = "";
    const ask = (d: Act) => {
      if (w.isHost) R.act(d, w.selfId);
      else w.send("qe", { ...d, k: "a", s: offer.seed });
    };
    const hear = (x: number, y: number, z: number): [number, number] => w.hear?.(x, y, z) ?? [0, 0];
    const me = () => w.me();
    const lockName = (k: number) => f.locks[Math.max(0, Math.min(f.locks.length - 1, k))]?.n ?? "the lock";
    const endName = (e: number) => (e ? "top" : "bottom");
    const near = (x: number, z: number, r = 60) => { const p = me(); return Math.hypot(p.x - x, p.z - z) < r; };
    const lockMid = (k: number) => lockAt(f.locks[k], f.locks[k].L / 2, 0);
    const splash = (x: number, y: number, z: number) => {
      w.dust?.(x, y + 0.2, z, 0, 0);
      const [d] = hear(x, y, z);
      if (d < 40) SFX.whoosh();
    };
    const intoCut = (x: number, z: number, out: [number, number], say: string) => {
      const p = me();
      w.moveTo(x, z, p.yaw);
      w.slow?.(4);
      splash(x, R.levelAt(0) - w.map.z0, z);
      w.toast(say, 3);
      wet = 4.5; wetTo = out;
    };
    let wet = 0, wetTo: [number, number] | null = null;
    /** Out of the cut onto the side, from where you went in. */
    const bankBy = (x: number, z: number): [number, number] => {
      for (const g of f.locks) {
        const [u, v] = lockLocal(g, x, z);
        if (u > -6 && u < g.L + 3 && Math.abs(v) < LH + 2) return lockAt(g, clamp(u, -1, g.L + 1.5), (v < 0 ? -1 : 1) * (LH + COPE + 2.5));
      }
      let best = 0, bd = Infinity;
      f.path.forEach((p, k) => { const dd = Math.hypot(p.x - x, p.z - z); if (dd < bd) { bd = dd; best = k; } });
      const a = along(f, f.path[best].s);
      return [a.x + a.tz * (a.h + 2.5), a.z - a.tx * (a.h + 2.5)];
    };

    R.onFx = (d: any) => {
      const p = me(), mine = d.id === w.selfId;
      const bn = (i: number) => R.names[i] ?? "the boat";
      switch (d.f) {
        case "wind": case "off": { const [x, z] = R.post(d.l, d.e, d.d); SFX.tick(...hear(x, R.copingY(d.l), z)); break; }
        case "drop": { const [x, z] = R.post(d.l, d.e, d.d); SFX.clunk(...hear(x, R.copingY(d.l), z)); break; }
        case "pick": if (mine) w.toast("You've a windlass", 1.5); break;
        case "gate": {
          const [x, z] = lockMid(d.l);
          SFX.clunk(...hear(x, 0, z));
          if (near(x, z)) w.toast(`The ${endName(d.e)} gates of ${lockName(d.l)} are ${d.o ? "open" : "shut"}`, 2);
          break;
        }
        case "jam": { const [x, z] = lockMid(d.l); SFX.crash(0.4, ...hear(x, 0, z)); if (near(x, z)) w.toast("The gates won't shut on the boat", 2); break; }
        case "leak": {
          const [x, z] = lockMid(d.l);
          if (near(x, z, 120)) w.toast(`${lockName(d.l)} will never fill (or empty): there's a paddle up at each end, and the pound's running away`, 4);
          break;
        }
        case "slip": {
          const [x, z] = R.post(d.l, d.e, d.d);
          SFX.crash(0.5, ...hear(x, 0, z));
          if (Array.isArray(d.hit) && d.hit.includes(w.selfId)) { w.knock?.(); w.toast("CLONK. A windlass left on a spindle spun off and caught you", 3); }
          else if (near(x, z, 80)) w.toast(`A windlass left on a paddle at ${lockName(d.l)} spun off${d.lost ? " and went in the cut" : ""}`, 3);
          if (d.lost && near(x, z, 400)) w.feed(`A windlass is at the bottom of ${lockName(d.l)}. ${d.left ? `${d.left} left` : "That was the last one"}`);
          break;
        }
        case "dunk": {
          if (!mine) break;
          if (d.b >= 0) {
            const mv = R.views[d.b]?.mover;
            if (!mv) break;
            const x = mv.x + Math.sin(mv.a) * (HW + 0.7), z = mv.z + Math.cos(mv.a) * (HW + 0.7);
            intoCut(x, z, bankBy(x, z), "You slide off the deck and into the lock");
          } else {
            const g = f.locks[d.l], [x, z] = d.e ? lockAt(g, g.L + 2.5, 0) : lockAt(g, -6, 0);
            intoCut(x, z, bankBy(x, z), "The beam swept you clean off the side. You're in the cut");
          }
          break;
        }
        case "surge": {
          const mv = R.views[d.b]?.mover;
          if (mv) {
            SFX.crash(0.6, ...hear(mv.x, mv.top, mv.z));
            if (R.onDeck(d.b, p.x, p.y, p.z)) { w.knock?.(); w.toast("The water comes in through the top paddles in a rush, and everyone on deck goes flat", 3); }
            else if (near(mv.x, mv.z)) w.toast(`Too much paddle! ${bn(d.b)} surges forward`, 2.5);
          }
          break;
        }
        case "thump": {
          const mv = R.views[d.b]?.mover;
          if (mv) { SFX.crash(d.hard ? 0.8 : 0.3, ...hear(mv.x, mv.top, mv.z)); if (d.hard && R.onDeck(d.b, p.x, p.y, p.z)) w.knock?.(); }
          break;
        }
        case "barrel": {
          const mv = R.views[d.b]?.mover;
          if (mv) { splash(mv.x, mv.y + 0.5, mv.z); if (near(mv.x, mv.z, 100)) w.toast(d.why === "slide" ? "A barrel slides off the roof. Plop" : "A barrel goes over the side", 2); }
          break;
        }
        case "tip": { const mv = R.views[d.b]?.mover; if (mv && near(mv.x, mv.z, 100)) w.toast(`${bn(d.b)}'s caught on the cill! Shut the bottom paddles and get water back in`, 4); break; }
        case "slap": { const mv = R.views[d.b]?.mover; if (mv) { SFX.crash(0.5, ...hear(mv.x, mv.y, mv.z)); if (near(mv.x, mv.z, 100)) w.toast(`${bn(d.b)} comes off the cill with a slap`, 2.5); } break; }
        case "aground": w.toast(`${bn(d.b)}'s on the mud: the pound's run dry. Fetch water down from the lock above`, 4); break;
        case "afloat": w.toast(`${bn(d.b)}'s afloat again`, 2); break;
        case "home": w.feed(`<b style="color:#3a8fd8">${bn(d.b)}</b> is through the flight with ${S().b[d.b]?.barrels ?? 0} barrels`); SFX.jobStep(); break;
        case "eng": if (mine) w.toast(d.v > 0 ? "Ahead" : d.v < 0 ? "Astern" : "Engine in neutral: she'll coast", 1.2); break;
        case "sunk": w.toast(`${bn(d.b)} has gone down`, 3); break;
        case "end":
          if (!job.done) job.done = d.won
            ? { won: true, text: String(d.text), x: d.x, z: d.z, grade: { tier: d.got >= d.all ? 3 : d.got * 2 >= d.all ? 2 : 1, best: { v: d.got, text: `${d.got} barrels` } } }
            : { won: false, text: String(d.text), x: d.x, z: d.z };
          break;
      }
    };

    type Pick = { a: Act; dist: number; hint: string } | null;
    const choose = (): Pick => {
      const p = me();
      if (!p.alive || wet > 0) return null;
      const st = S();
      let best: Pick = null;
      const offer2 = (a: Act, dist: number, reach: number, hint: string) => { if (dist < reach && (!best || dist / reach < best.dist)) best = { a, dist: dist / reach, hint }; };
      // the tiller
      st.b.forEach((b, i) => {
        if (b.home || b.sunk) return;
        const t = R.stern(i);
        if (p.y < t.y - 1.6 || p.y > t.y + 2.4) return;
        const next = b.eng ? "Stop the engine" : b.last > 0 ? "Astern" : "Ahead";
        offer2({ a: "eng", b: i }, Math.hypot(p.x - t.x, p.z - t.z), 2.6, `<b>{use}</b> ${next}`);
      });
      for (let k = 0; k < R.n; k++) for (let e = 0; e < 2; e++) for (let d = 0; d < 2; d++) {
        const [x, z] = R.post(k, e, d);
        const dd = Math.hypot(p.x - x, p.z - z);
        if (dd < 1.8) {
          const on = R.onSpindle(k, e, d) >= 0, up = st.p[k][e][d], mine = R.holding(w.selfId) >= 0;
          const notches = `${Math.round(up * 8)}/8`;
          const h = on ? (up < 1 ? `<b>{use}</b> Wind the ${endName(e)} paddle up (${notches})` : mine ? "Paddle's right up: leave the windlass and it'll slip" : `<b>{use}</b> Take the windlass off`)
            : up > 0 ? `<b>{use}</b> Drop the ${endName(e)} paddle (${notches})` : mine ? `<b>{use}</b> Put your windlass on the ${endName(e)} paddle` : "You need a windlass to wind this paddle";
          offer2({ a: "pad", l: k, e, d }, dd, 1.8, h);
        }
        const [bx, bz] = R.beamEnd(k, e, d, R.D.g[k][e]);
        const db = Math.hypot(p.x - bx, p.z - bz);
        if (db < 2.2) {
          const pushing = st.push.some((q) => q[0] === w.selfId && q[1] === k && q[2] === e);
          const others = st.push.filter((q) => q[1] === k && q[2] === e && q[0] !== w.selfId).length;
          const opening = st.g[k][e] < 0.5, out = R.mismatch(k, e);
          const h = pushing ? `Leaning on the beam: walk it round${others ? "" : " (it's slow on your own)"}. <b>{use}</b> to let go`
            : opening && out > 0.06 ? `It won't budge: the water's ${out.toFixed(1)} m ${e ? (st.c[k] < R.pound(k) ? "higher above" : "lower above") : (st.c[k] > R.pound(k + 1) ? "higher in the lock" : "lower in the lock")}`
            : `<b>{use}</b> Lean on the beam: ${opening ? "open" : "shut"} the ${endName(e)} gates${others ? ` (${others} on it already)` : ""}`;
          offer2({ a: "push", l: k, e, d }, db, 2.2, h);
        }
      }
      st.wl.forEach((q, i) => {
        if (q[0] !== 3 || R.holding(w.selfId) >= 0) return;
        offer2({ a: "pick", i }, Math.hypot(p.x - q[1], p.z - q[2]), 1.9, "<b>{use}</b> Pick up the windlass");
      });
      return best;
    };

    const job: Job = {
      offer, done: null,
      update(dt) {
        const p = me();
        R.draw(dt, w.isHost);
        // the steerer can't see the cill's white line from the back deck
        R.cillMarks.visible = R.steering(p.x, p.y, p.z) < 0;
        if (wet > 0 && (wet -= dt) <= 0 && wetTo) { w.moveTo(wetTo[0], wetTo[1], p.yaw); w.toast("Someone hauls you out, dripping", 2); wetTo = null; }
        // the pin follows the first boat's next lock
        const k = Math.max(0, Math.min(R.n - 1, R.nextLock(0)));
        if (k !== R.marked) {
          R.marked = k;
          const [x, z] = lockMid(k);
          w.mark("@challenge", { x, z }, `${offer.title}: ${lockName(k)}`, "#3a8fd8");
        }
        lastHint = choose()?.hint ?? "";
      },
      host(dt) { if (job.done) return; R.sim(dt); R.hostTick(dt); },
      event(d, from) {
        if (d?.k === "a" && w.isHost) R.act(d, from);
        else if (d?.k === "st" && !w.isHost) R.unpack(d);
        else if (d?.k === "fx" && !w.isHost) R.onFx?.(d);
      },
      progress: () => R.pack(),
      restore(p) { R.unpack(p); },
      use() {
        const c = choose();
        if (!c) return false;
        if (c.a.a === "pad" && !c.hint.includes("<b>{use}</b>")) { w.toast(c.hint, 2); return true; }
        if (c.a.a === "push" && !c.hint.includes("<b>{use}</b>")) { w.toast(c.hint, 2.5); SFX.grind(0, 0, 0.3); return true; }
        if (c.a.a === "push") SFX.grind(0, 0, 0.5);
        ask(c.a);
        return true;
      },
      hint: () => lastHint,
      movers: () => R.views.filter((_, i) => !S().b[i].sunk && S().b[i].pitch < 0.3).map((v) => v.mover),
      card(): Card {
        const st = S(), p = me();
        const i0 = 0, b0 = st.b[i0];
        const passed = st.b.reduce((t, _, i) => t + R.passed(i), 0), total = R.n * st.b.length;
        const helm = R.steering(p.x, p.y, p.z);
        let sub = "";
        const cill = st.b.map((_, i) => R.overCill(i)).findIndex((k, i) => k >= 0 && st.c[k] < f.locks[k].zh - 0.15 && helm !== i);
        if (cill >= 0 && helm < 0) sub = `${R.names[cill]}'s stern is over the cill at ${lockName(R.overCill(cill))}: shout to the steerer!`;
        else if (helm >= 0) { const b = st.b[helm]; sub = `At the tiller of ${R.names[helm]}: ${b.eng > 0 ? "ahead" : b.eng < 0 ? "astern" : "neutral"}. Barrels ${b.barrels}/${BARRELS}`; }
        else if (st.b.some((b) => b.aground)) sub = `${R.names[st.b.findIndex((b) => b.aground)]} is aground. Run water down from the lock above`;
        else {
          const w0 = st.wl.filter((q) => q[0] !== 0).length;
          sub = `Barrels ${st.b.map((b) => b.barrels).join(" + ")} · windlasses ${w0}${R.holding(w.selfId) >= 0 ? " (you've one)" : ""}`;
        }
        const k = Math.max(0, Math.min(R.n - 1, R.nextLock(i0)));
        const key = `lk${k}`;
        return {
          line: st.b.length > 1 ? `${R.names[0]} down the flight, ${R.names[1]} up it` : `Take ${R.names[0]} down the flight`,
          sub, progress: `${passed} / ${total}`, bar: passed / total,
          stage: b0 && !b0.home ? { key, title: lockName(k), sub: `Lock ${k + 1} of ${R.n}`, colour: "#3a8fd8" } : undefined,
        };
      },
      end() { w.mark("@challenge", null); R.dispose(); },
    };
    return job;
  },
});
