// The Driving Test, a team challenge (challenges.ts): a learner car waits at the kerb outside the
// test centre, by a car park on a decent road, with the examiner stood by it, clipboard in hand.
// One of you drives (whoever's in the driver's seat), the examiner sits beside them, and two more can
// ride in the back. He gives directions as you go ("At the end of the road, turn left", "Take the
// second road on the right"), round a loop of the real streets near the centre, a few minutes long,
// and marks you as a real examiner would: up to fifteen minor faults is still a pass, and one serious
// or dangerous fault is a fail on the spot. He's watching your signals at every turn, your speed
// against the limit, whether you stop at the end of a road before pulling out, the kerb, your
// position on the road, whether you look round before you move off and before you turn (that's the
// mirrors: look about with the mouse or the stick), and, if you hit anything at all, that's that.
// The limit is the street's own, as the map has it (tools/maxspeed.py), or a guess by its kind where it has none.
// Somewhere along the way he slaps the dashboard and shouts "Stop!", and he asks you to pull up on the
// left, once on the way round and once back at the centre, and sees how close to the kerb you got.
// A serious fault and he stamps on his own brake, says nothing for a moment, and then: "I'm afraid
// that's a fail." Either way a test report comes up at the end with every fault on it.
//
// The ones in the back can make a nuisance of themselves: turn the radio up or down or change the
// station, wind the window down, or pull the handbrake, which skids the car and gets them thrown out
// (the driver's test carries on; he knows whose fault it was). A noisy car (the radio, or real noise
// on the back seats' mics) gets told to keep it down, and the third telling-off is a minor fault for
// the driver. He notices the driver laughing, shouting or going quiet too. One pass in the room wins it; anyone
// else can have a go after, and swapping seats is how. There are only so many tests in a day.
//
// Who decides what: where the centre is comes from the map alone (the wide map's streets), and so
// does each test's route, from the day's seed and which test it is, so every screen works out the
// same. The learner car is one of the game's own vehicles: the host says who sits where, as for any
// car, and the driver drives it from their own screen. The host runs the examiner: where along the
// route the car has got, what he says, the marking, the radio and the window, and it sends that
// round ("qe" k "t") about ten times a second, with each thing he says and each fault as it happens.
// The driver's screen tells the host only what it alone can see: a bump, a wheel up on the
// pavement, a look round, how far from the kerb it pulled up and how quickly it stopped when told.
// Passengers send only what they asked for (radio, window, handbrake). How loud each of you is on
// your mic comes from your own screen (voicelevel.ts), in your position updates; the host's examiner
// hears the back seats' noise and the driver laughing, shouting or going quiet from that. The host says when it's won.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import * as SFX from "./audio";
import { Avatar } from "./avatar";
import { registerChallenge, type ChallengeSpot } from "./challenges";
import { controlsHere, ctl, isKey, stripOf } from "./controls";
import { type GameMap, type Road, roadHalf } from "./map";
import { missionSheet } from "./missionscreens";
import { openGround } from "./oddments";
import { compassWord, esc, far, hash, rng, type Job, type Offer, type QuestWorld, type Waiting } from "./quests";
import { SPECS, Vehicle, type Controls } from "./vehicles";

const COLOUR = "#d8262e";
const KIND = "nova", PAINT = "#eeeeea", CAR_NAME = "Driving school Nova";
const CAR_ID = 2 ** 39;            // learner cars' vehicle numbers: clear of the parked cars, the traffic and the squares'
const SEND = 0.1;
const MINORS = 15;                 // as many as this and it's still a pass
const MPH = 2.237;
const TESTING = new URLSearchParams(location.search).has("objects");   // the testing option (oddments.ts): lets a probe at it

const DRIVE = new Set(["primary", "secondary", "tertiary", "residential", "unclassified", "living_street"]);
const DECENT = new Set(["primary", "secondary", "tertiary"]);
/** How keen the route is to go down each kind of street. */
const LIKE: Record<string, number> = { primary: 0.6, secondary: 0.9, tertiary: 1.2, residential: 1, unclassified: 0.7, living_street: 0.2 };
/** The limit a street with none on the map is taken to have. */
const limitOf = (c: string) => (c === "residential" || c === "unclassified" || c === "living_street" ? 20 : 30);

const EXAMINERS = ["Mr Pike", "Mr Dibble", "Mr Thwaite", "Mr Crabtree", "Mr Hollis", "Mr Stoat"];
const HUSH = ["Can your friends in the back keep it down?", "Could we have a bit of hush in the back, please?", "Turn that racket down, would you?", "I can't hear myself think."];
const ORD = ["next", "second", "third"];
const LAUGHS = ["Something funny?", "Glad someone's enjoying it.", "I'm not laughing."];

// ---- the streets, as a network: the same on every screen ----------------------------------------

interface Edge { to: number; len: number; c: string; n: string; half: number; two: boolean; ms: number }   // ms: its speed limit, 0 if the map has none
interface Graph { x: number[]; z: number[]; out: Edge[][]; nb: Set<number>[] }

const graphs = new WeakMap<GameMap, Graph>();

/** Every road there is: the first area's, and the wide map's beyond it (never the squares, which each player loads differently). */
function roadsOf(map: GameMap): Road[] {
  const wide = map.wide?.rd ?? [];
  return [...map.d.rd, ...wide.filter((r) => !r.p.some((q) => map.inGrid(q[0], -q[1])))];
}

/** The streets a car can be driven along, inside map's force field (a zone's, when placing), scene coordinates. */
function graphOf(map: GameMap): Graph {
  const had = graphs.get(map);
  if (had) return had;
  const g: Graph = { x: [], z: [], out: [], nb: [] };
  const ids = new Map<string, number>();
  const node = (x: number, z: number) => {
    const k = `${Math.round(x * 2)},${Math.round(z * 2)}`;
    let n = ids.get(k);
    if (n === undefined) { n = g.x.length; ids.set(k, n); g.x.push(x); g.z.push(z); g.out.push([]); g.nb.push(new Set()); }
    return n;
  };
  const link = (a: number, b: number, c: string, n: string, half: number, ms: number, fwd: boolean, back: boolean) => {
    if (a === b || g.nb[a].has(b)) return;
    const len = Math.hypot(g.x[b] - g.x[a], g.z[b] - g.z[a]), two = fwd && back;
    g.nb[a].add(b); g.nb[b].add(a);
    if (fwd) g.out[a].push({ to: b, len, c, n, half, two, ms });
    if (back) g.out[b].push({ to: a, len, c, n, half, two, ms });
  };
  for (const r of roadsOf(map)) {
    if (!DRIVE.has(r.c) || r.p.length < 2) continue;
    const half = roadHalf(r.c, r.w), fwd = (r.ow ?? 0) !== -1, back = (r.ow ?? 0) !== 1;
    let prev = -1;
    for (const q of r.p) {
      const x = q[0], z = -q[1];
      if (map.fieldEdge(x, z) < 40) { prev = -1; continue; }
      const n = node(x, z);
      if (prev >= 0) link(prev, n, r.c, r.n ?? "", half, r.ms ?? 0, fwd, back);
      prev = n;
    }
  }
  // a street whose end stops just short of another (two maps meeting, or a line drawn a little off) joins it
  const cells = new Map<string, number[]>(), ck = (x: number, z: number) => `${Math.floor(x / 8)},${Math.floor(z / 8)}`;
  for (let n = 0; n < g.x.length; n++) { const k = ck(g.x[n], g.z[n]); (cells.get(k) ?? cells.set(k, []).get(k)!).push(n); }
  const ends = g.nb.map((s, n) => (s.size === 1 ? n : -1)).filter((n) => n >= 0);
  for (const n of ends) {
    if (g.nb[n].size !== 1) continue;
    const [nb] = g.nb[n], e = g.out[n][0] ?? g.out[nb].find((o) => o.to === n);
    let best = -1, bd = 6;
    const ci = Math.floor(g.x[n] / 8), cj = Math.floor(g.z[n] / 8);
    for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) for (const m of cells.get(`${i},${j}`) ?? []) {
      if (m === n || g.nb[n].has(m)) continue;
      const d = Math.hypot(g.x[m] - g.x[n], g.z[m] - g.z[n]);
      if (d < bd) { bd = d; best = m; }
    }
    if (best >= 0 && e) link(n, best, e.c, e.n, e.half, e.ms, true, true);
  }
  graphs.set(map, g);
  return g;
}

/** From node a along edge e, on through every node that's just a bend, to the next junction or dead end. */
function chainFrom(g: Graph, a: number, e: Edge): { nodes: number[]; len: number; end: number } | null {
  const nodes = [a, e.to];
  let len = e.len, prev = a, cur = e.to;
  for (let k = 0; k < 5000 && g.nb[cur].size === 2 && cur !== a; k++) {
    const nx = g.out[cur].find((o) => o.to !== prev);
    if (!nx) return null;   // a one-way street the wrong way
    len += nx.len; nodes.push(nx.to); prev = cur; cur = nx.to;
  }
  return { nodes, len, end: cur };
}

/** A point some way off from junction j along the street towards q, for the angle the street leaves at. */
function away(g: Graph, j: number, q: number) {
  let prev = j, cur = q;
  for (let k = 0; k < 40 && Math.hypot(g.x[cur] - g.x[j], g.z[cur] - g.z[j]) < 12 && g.nb[cur].size === 2; k++) {
    const nx = [...g.nb[cur]].find((m) => m !== prev);
    if (nx === undefined) break;
    prev = cur; cur = nx;
  }
  return Math.atan2(-(g.z[cur] - g.z[j]), g.x[cur] - g.x[j]);
}
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** The quickest way from node `from` to node `to`, never taking the edges banned, and keener on edges not yet driven. */
function homeway(g: Graph, from: number, to: number, banned: Set<string>, used: Set<string>): number[] | null {
  const dist = new Map<number, number>([[from, 0]]), back = new Map<number, number>();
  const heap: [number, number][] = [[0, from]];
  const push = (d: number, n: number) => {
    heap.push([d, n]);
    for (let i = heap.length - 1; i > 0; ) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      for (let i = 0; ; ) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
      }
    }
    return top;
  };
  for (let steps = 0; heap.length && steps < 60000; steps++) {
    const [d, n] = pop();
    if (d > (dist.get(n) ?? Infinity)) continue;
    if (n === to) {
      const out = [to];
      for (let c = to; c !== from; ) { c = back.get(c)!; out.push(c); }
      return out.reverse();
    }
    if (d > 2600) break;
    for (const e of g.out[n]) {
      const k = `${n}>${e.to}`;
      if (banned.has(k)) continue;
      const nd = d + e.len * (used.has(k) ? 5 : 1) / (LIKE[e.c] ?? 0.5);
      if (nd < (dist.get(e.to) ?? Infinity)) { dist.set(e.to, nd); back.set(e.to, n); push(nd, e.to); }
    }
  }
  return null;
}

// ---- a test's route, and what the examiner says along it -----------------------------------------

interface Pt { x: number; z: number; s: number; c: string; n: string; half: number; two: boolean; ms: number }
interface Step { s: number; text: string; dir: number; give: boolean; street: string; ann: number }
interface Route { pts: Pt[]; len: number; steps: Step[]; pull: number; stop: number }
interface Centre { map: GameMap; a: number; b: number; x: number; z: number; ang: number; street: string }

/** A loop from the centre and back, a few minutes' drive, from the seed: the same on every screen. */
function routeOf(c: Centre, seed: number): Route | null {
  const g = graphOf(c.map), first = g.out[c.a].find((e) => e.to === c.b);
  if (!first) return null;
  for (let tryN = 0; tryN < 24; tryN++) {
    const r = rng(seed + tryN * 7919);
    const used = new Set<string>(), mark = (ns: number[]) => { for (let i = 1; i < ns.length; i++) used.add(`${ns[i - 1]}>${ns[i]}`); };
    const c0 = chainFrom(g, c.a, first);
    if (!c0) return null;
    const path = [...c0.nodes];
    mark(path);
    let len = c0.len, ok = true;
    const outward = 650 + r() * 550;
    while (len < outward) {
      const j = path[path.length - 1], p = path[path.length - 2];
      const opts = g.out[j].filter((o) => o.to !== p).map((o) => ({ o, ch: chainFrom(g, j, o) }))
        .filter((q) => q.ch && g.nb[q.ch.end].size >= 2) as { o: Edge; ch: NonNullable<ReturnType<typeof chainFrom>> }[];
      if (!opts.length) { ok = false; break; }
      const wts = opts.map((q) => (used.has(`${j}>${q.o.to}`) ? 0.03 : 1) * (LIKE[q.o.c] ?? 0.3));
      let pick = r() * wts.reduce((a, b) => a + b, 0), k = 0;
      while (k < opts.length - 1 && (pick -= wts[k]) > 0) k++;
      path.push(...opts[k].ch.nodes.slice(1));
      mark(opts[k].ch.nodes);
      len += opts[k].ch.len;
    }
    if (!ok) continue;
    const j = path[path.length - 1], p = path[path.length - 2];
    // back to the start of the centre's street and along it, never just turning round in the road
    const home = homeway(g, j, c.a, new Set([`${j}>${p}`, `${c.b}>${c.a}`]), used);
    if (!home) continue;
    const nodes = [...path.slice(1), ...home.slice(1)];
    const pts: Pt[] = [];
    const add = (x: number, z: number, e: Edge | undefined) => {
      const l = pts.length ? pts[pts.length - 1] : null;
      pts.push({ x, z, s: l ? l.s + Math.hypot(x - l.x, z - l.z) : 0, c: e?.c ?? first.c, n: e?.n ?? first.n, half: e?.half ?? first.half, two: e?.two ?? first.two, ms: e?.ms ?? first.ms });
    };
    add(c.x, c.z, first);
    for (let i = 0; i < nodes.length; i++) add(g.x[nodes[i]], g.z[nodes[i]], g.out[nodes[i]].find((e) => e.to === nodes[i + 1]) ?? first);
    add(c.x, c.z, first);
    const total = pts[pts.length - 1].s;
    if (total < 1300 || total > 3400) continue;
    // what he says at each junction it turns at
    const steps: Step[] = [];
    const passed = { 1: 0, [-1]: 0 } as Record<number, number>;
    let lastS = 0;
    for (let i = 1; i < nodes.length - 1; i++) {
      const n = nodes[i];
      if (g.nb[n].size < 3) continue;
      const pv = nodes[i - 1], nx = nodes[i + 1], hin = wrap(away(g, n, pv) + Math.PI), turn = wrap(away(g, n, nx) - hin);
      const others = [...g.nb[n]].filter((q) => q !== pv && q !== nx).map((q) => wrap(away(g, n, q) - hin));
      const s = pts[i + 1].s, street = g.out[n].find((e) => e.to === nx)?.n ?? "";
      if (Math.abs(turn) < 0.5) {
        if (others.length >= 2 && others.some((a) => a > 0.5) && others.some((a) => a < -0.5)) {
          steps.push({ s, text: "Go straight on at the crossroads", dir: 0, give: false, street, ann: Math.max(lastS + 8, s - 60) });
          lastS = s;
        }
        if (others.some((a) => a > 0.5)) passed[1]++;
        if (others.some((a) => a < -0.5)) passed[-1]++;
        continue;
      }
      const dir = turn > 0 ? 1 : -1, side = dir > 0 ? "left" : "right";
      const end = !others.some((a) => Math.abs(a) < 0.5);
      const into = street && street !== g.out[pv].find((e) => e.to === n)?.n ? `, into ${street}` : "";
      const nth = passed[dir];
      const text = end ? `At the end of the road, turn ${side}${into}`
        : nth < 3 ? `Take the ${ORD[nth]} road on the ${side}${into}` : `Turn ${side}${into}`;
      steps.push({ s, text, dir, give: end, street, ann: Math.max(lastS + 8, s - 70) });
      lastS = s;
      passed[1] = passed[-1] = 0;
    }
    // somewhere to pull up on the way round, and somewhere to stop as if in an emergency: straight, with no turn coming
    const clear = (s: number, before: number, after: number) => !steps.some((t) => t.s > s - before && t.s < s + after);
    let pull = -1, stop = -1;
    for (let s = total * 0.3; s < total * 0.55 && pull < 0; s += 10) if (clear(s, 30, 110)) pull = s;
    for (let s = total * 0.6; s < total * 0.85 && stop < 0; s += 10) if (clear(s, 20, 90) && Math.abs(s - pull) > 150) stop = s;
    return { pts, len: total, steps, pull, stop };
  }
  return null;
}

/** Where along the route the car is: the nearest point within a window round where it last was, and how far off it is. */
function onRoute(rt: Route, x: number, z: number, near: number, fx = 0, fz = 0) {
  let best = Infinity, bs = near, side = 0;
  const P = rt.pts;
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1];
    if (b.s < near - 40 || a.s > near + 90) continue;
    const dx = b.x - a.x, dz = b.z - a.z;
    // a street driven both ways on the loop: only the way the car's facing
    if ((dx * fx + dz * fz) < -0.3 * Math.hypot(dx, dz)) continue;
    const l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2));
    const px = a.x + dx * t, pz = a.z + dz * t, d = Math.hypot(x - px, z - pz);
    if (d < best) { best = d; bs = a.s + (b.s - a.s) * t; side = ((x - px) * -dz + (z - pz) * dx) / Math.sqrt(l2); }
  }
  return { s: bs, d: best, side };
}
/** The route's point (and street) at s along it. */
function ptAt(rt: Route, s: number): Pt {
  const P = rt.pts;
  for (let i = 0; i < P.length - 1; i++) if (P[i + 1].s >= s) return P[i];
  return P[P.length - 2] ?? P[0];
}

// ---- where the test centre is ---------------------------------------------------------------------

const placedCentres = new WeakMap<ChallengeSpot[], Centre>();
const centreCache = new WeakMap<GameMap, { spots: ChallengeSpot[]; c: Centre } | null>();

/** By the busiest car park on a decent road (service roads gathered round where one meets it), with room for a loop. */
function findCentre(map: GameMap): { spots: ChallengeSpot[]; c: Centre } | null {
  if (centreCache.has(map)) return centreCache.get(map)!;
  const roads = roadsOf(map), home = openGround(map);
  const svc = new Map<string, number>(), ck = (x: number, y: number) => `${Math.floor(x / 50)},${Math.floor(y / 50)}`;
  for (const r of roads) {
    if (r.c !== "service") continue;
    for (let i = 1; i < r.p.length; i++) {
      const a = r.p[i - 1], b = r.p[i], k = ck((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      svc.set(k, (svc.get(k) ?? 0) + Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
  }
  const near = (x: number, y: number) => {
    let t = 0;
    const i0 = Math.floor(x / 50), j0 = Math.floor(y / 50);
    for (let i = i0 - 1; i <= i0 + 1; i++) for (let j = j0 - 1; j <= j0 + 1; j++) t += svc.get(`${i},${j}`) ?? 0;
    return t;
  };
  const cands: { score: number; x: number; y: number; r: Road; k: number; t: number }[] = [];
  // the streets a car park can open on to, filed by square so each way in looks only at those close by
  const decent = new Map<string, [Road, number][]>();
  for (const r of roads) {
    if (!(DECENT.has(r.c) || r.c === "residential") || !r.n || r.bridge) continue;
    for (let k = 0; k < r.p.length - 1; k++) {
      const a = r.p[k], b = r.p[k + 1];
      for (let i = Math.floor(Math.min(a[0], b[0]) / 50); i <= Math.floor(Math.max(a[0], b[0]) / 50); i++)
        for (let j = Math.floor(Math.min(a[1], b[1]) / 50); j <= Math.floor(Math.max(a[1], b[1]) / 50); j++)
          (decent.get(`${i},${j}`) ?? decent.set(`${i},${j}`, []).get(`${i},${j}`)!).push([r, k]);
    }
  }
  for (const r of roads) {
    if (r.c !== "service" || r.p.length < 2) continue;
    for (const e of [r.p[0], r.p[r.p.length - 1]]) {
      if (map.fieldEdge(e[0], -e[1]) < 150 || (home && Math.hypot(home.x - e[0], home.y - e[1]) < 90)) continue;
      // the street this car park opens on to
      let best: { r: Road; k: number; t: number; d: number } | null = null;
      {
        for (const [q, k] of decent.get(ck(e[0], e[1])) ?? []) {
          const a = q.p[k], b = q.p[k + 1];
          const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((e[0] - a[0]) * dx + (e[1] - a[1]) * dy) / l2));
          const d = Math.hypot(e[0] - a[0] - dx * t, e[1] - a[1] - dy * t);
          if (d < 6 && (!best || d < best.d)) best = { r: q, k, t, d };
        }
      }
      if (!best) continue;
      cands.push({ score: near(e[0], e[1]) * (DECENT.has(best.r.c) ? 1.6 : 1), x: e[0], y: e[1], r: best.r, k: best.k, t: best.t });
    }
  }
  cands.sort((a, b) => b.score - a.score || a.x - b.x || a.y - b.y);
  const tried: { x: number; y: number }[] = [];
  let found: { spots: ChallengeSpot[]; c: Centre } | null = null;
  for (const cd of cands) {
    if (tried.length >= 8) break;
    if (tried.some((t) => Math.hypot(t.x - cd.x, t.y - cd.y) < 150)) continue;
    tried.push(cd);
    const r = cd.r, a = r.p[cd.k], b = r.p[cd.k + 1], seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (seg < 14) continue;
    // ten metres on past the car park's way in, pulled in at the kerb on the left, facing the way the traffic goes
    const way = (r.ow ?? 1) < 0 ? -1 : 1, ux = ((b[0] - a[0]) / seg) * way, uy = ((b[1] - a[1]) / seg) * way;
    let along = cd.t * seg + 10 * way;
    along = Math.max(5, Math.min(seg - 5, along));
    const S = SPECS[KIND], off = Math.max(0, roadHalf(r.c, r.w) - S.W / 2 - 0.6);
    const px = a[0] + ((b[0] - a[0]) / seg) * along - uy * off, py = a[1] + ((b[1] - a[1]) / seg) * along + ux * off;
    const x = px, z = -py, ang = Math.atan2(uy, ux);
    // the street's nodes behind and ahead of the car
    const g = graphOf(map);
    let na = -1, nb2 = -1, bd = 25;
    for (let n = 0; n < g.x.length; n++) {
      if (Math.abs(g.x[n] - x) > 40 || Math.abs(g.z[n] - z) > 40) continue;
      for (const e of g.out[n]) {
        const ex = g.x[e.to] - g.x[n], ez = g.z[e.to] - g.z[n], l2 = ex * ex + ez * ez || 1;
        if (ex * ux + ez * -uy <= 0) continue;   // it has to run the car's way
        const t = ((x - g.x[n]) * ex + (z - g.z[n]) * ez) / l2;
        if (t < 0 || t > 1) continue;
        const d = Math.hypot(x - g.x[n] - ex * t, z - g.z[n] - ez * t);
        if (d < bd) { bd = d; na = n; nb2 = e.to; }
      }
    }
    if (na < 0) continue;
    const c: Centre = { map, a: na, b: nb2, x, z, ang, street: r.n };
    if (!routeOf(c, hash("drivingtest", r.n))) continue;
    found = { spots: [{ x, z, name: `the test centre on ${r.n}`, a: ang }], c };
    break;
  }
  centreCache.set(map, found);
  return found;
}

// ---- the learner car's L plates, the examiner in his seat, and him stood by it --------------------

let kitGeo: THREE.BufferGeometry | null = null, kitMat: THREE.Material | null = null;
let seatGeo: THREE.BufferGeometry | null = null, seatMat: THREE.Material | null = null;

/** L plates front and back and a roof sign, in one mesh, on the body so they tilt with it. */
function learnerKit(v: Vehicle): THREE.Mesh {
  if (!kitGeo) {
    const cv = document.createElement("canvas");
    cv.width = 512; cv.height = 128;
    const c = cv.getContext("2d")!;
    c.fillStyle = "#f6f4ee"; c.fillRect(0, 0, 512, 128);
    c.fillStyle = "#d8262e"; c.font = "900 112px Arial, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText("L", 64, 70);
    c.fillStyle = "#ffd21e"; c.fillRect(128, 0, 384, 128);
    c.fillStyle = "#d8262e"; c.fillRect(128, 0, 384, 10); c.fillRect(128, 118, 384, 10);
    c.font = "900 84px Arial, sans-serif"; c.fillText("L", 172, 70); c.fillText("L", 468, 70);
    c.fillStyle = "#1b1b1d"; c.font = "800 34px 'Barlow Condensed', Impact, sans-serif";
    c.fillText("DRIVING", 320, 46); c.fillText("SCHOOL", 320, 86);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    kitMat = new THREE.MeshLambertMaterial({ map: tex });
    const S = SPECS[KIND], hl = S.L / 2;
    const plate = (x: number, y: number, face: number) => {
      const p = new THREE.PlaneGeometry(0.3, 0.3).rotateY(face * Math.PI / 2).translate(x, y, 0);
      const uv = p.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 0.25);
      return p.toNonIndexed();
    };
    const sign = new THREE.BoxGeometry(0.14, 0.3, 0.8).translate(-0.25, S.H + 0.13, 0);
    const suv = sign.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < suv.count; i++) suv.setX(i, 0.25 + suv.getX(i) * 0.75);
    kitGeo = mergeGeometries([plate(hl + 0.04, 0.6, 1), plate(-hl - 0.04, 0.82, -1), sign.toNonIndexed()]);
  }
  const m = new THREE.Mesh(kitGeo, kitMat!);
  m.castShadow = true;
  v.root.children[0].add(m);
  return m;
}

/** The examiner sat in the front passenger seat: his jumper and tie, his glasses and his clipboard on his knee. */
function seatedExaminer(v: Vehicle): THREE.Mesh {
  if (!seatGeo) {
    const bit = (w: number, h: number, d: number, x: number, y: number, z: number, col: string, ball = false) => {
      const g = (ball ? new THREE.SphereGeometry(w, 10, 8) : new THREE.BoxGeometry(w, h, d)).translate(x, y, z).toNonIndexed();
      g.deleteAttribute("uv");
      const c = new THREE.Color(col), n = g.attributes.position.count, a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
      g.setAttribute("color", new THREE.BufferAttribute(a, 3));
      return g;
    };
    seatGeo = mergeGeometries([
      bit(0.34, 0.5, 0.4, 0, 0.7, 0, "#56657a"),
      bit(0.02, 0.1, 0.16, 0.175, 0.92, 0, "#f2f2ee"),
      bit(0.02, 0.3, 0.05, 0.18, 0.78, 0, "#7a1d22"),
      bit(0.15, 0, 0, 0, 1.08, 0, "#d9ab8c", true),
      bit(0.2, 0.08, 0.31, -0.02, 1.2, 0, "#8a8a86"),
      bit(0.02, 0.04, 0.24, 0.15, 1.1, 0, "#1b1b1d"),
      bit(0.26, 0.02, 0.2, 0.28, 0.5, 0, "#6b4a2e"),
      bit(0.2, 0.01, 0.16, 0.28, 0.515, 0, "#f6f4ee"),
    ]);
    seatMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  }
  const m = new THREE.Mesh(seatGeo, seatMat!), [al, up, ac] = v.spec.seats[1];
  m.position.set(al, up, ac);
  m.castShadow = true;
  v.root.children[0].add(m);
  return m;
}

/** Him stood on the pavement by the car's front passenger door, clipboard at the ready, facing the road. */
function standingExaminer(name: string, scene: THREE.Scene, map: GameMap, car: Vehicle) {
  const av = new Avatar(name, "#56657a", "examiner", "#8a8a86");
  av.armed = false; av.tagged = false;
  const c = Math.cos(car.a), s = Math.sin(car.a), al = 0.6, ac = -(car.hw + 0.7);
  const x = car.x + al * c + ac * s, z = car.z - al * s + ac * c;
  const yaw = car.a - Math.PI / 2 + 0.5;
  const tie = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.02), new THREE.MeshLambertMaterial({ color: "#7a1d22" }));
  tie.position.set(-Math.sin(yaw) * 0.14, 1.2, -Math.cos(yaw) * 0.14);
  tie.rotation.y = yaw;
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.34, 0.02), new THREE.MeshLambertMaterial({ color: "#6b4a2e" }));
  board.position.set(-Math.sin(yaw) * 0.3, 1.0, -Math.cos(yaw) * 0.3);
  board.rotation.set(-0.6, yaw, 0, "YXZ");
  av.root.add(tie, board);
  av.holdAt(x, map.ground(x, z), z, yaw, 0, 0);
  scene.add(av.root);
  return {
    x, z, av,
    dispose() {
      scene.remove(av.root);
      av.root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      for (const m of [tie, board]) (m.material as THREE.Material).dispose();
    },
  };
}

const examinerOf = (seed: number) => EXAMINERS[seed % EXAMINERS.length];
const centreOf = (spots: ChallengeSpot[], map: GameMap) => placedCentres.get(spots) ?? findCentre(map)?.c ?? null;

/** The learner car parked outside the centre and the examiner beside it, waiting for someone to take the test. */
function waitingCar(offer: Offer, spots: ChallengeSpot[], w: QuestWorld): Waiting | null {
  const c = centreOf(spots, w.map);
  if (!c) return null;
  const car = new Vehicle(CAR_ID + (offer.seed % 100000), KIND, PAINT, w.map, (x, z) => w.map.ground(x, z), CAR_NAME);
  car.place(c.x, c.z, c.ang);
  car.pose(1, 0);
  learnerKit(car);
  w.scene.add(car.root);
  w.map.movers.push(car);
  const man = standingExaminer(examinerOf(offer.seed), w.scene, w.map, car);
  let t = 0;
  return {
    dist: (x, z) => Math.min(car.distance(x, z), Math.hypot(x - man.x, z - man.z) - 0.4),
    update(dt) {
      t += dt;
      man.av.wave = t % 9 < 1.5 ? 2 : 0;
      man.av.update(performance.now(), dt);
    },
    obstacles: () => [{ x: car.x, z: car.z, r: car.hl, parked: true, a: car.a }],
    dispose() {
      man.dispose();
      w.scene.remove(car.root);
      const k = w.map.movers.indexOf(car);
      if (k >= 0) w.map.movers.splice(k, 1);
    },
  };
}

registerChallenge({
  id: "drivingtest",
  name: "The Driving Test",
  blurb: "Pass your driving test: fifteen minor faults and you're through, one serious one and you're not. One pass between you will do",
  glyph: "L", colour: COLOUR, tier: 2, stars: 2,
  goal: () => "One of you has to pass the driving test",
  place(map) {
    const f = findCentre(map);
    if (!f) return null;
    placedCentres.set(f.spots, f.c);
    return f.spots;
  },
  waiting({ offer, spots, w }) { return waitingCar(offer, spots, w); },
  start({ offer, spots, w }) { return drivingTest(offer, spots, w); },
});

// ---- the test --------------------------------------------------------------------------------------

interface Fault { x: string; g: number }   // g: 1 minor, 2 serious, 3 dangerous
const RADIO = [0, 0.45, 1, 1.9, 3.2];       // the radio's volume at each notch, against the music's own

function drivingTest(offer: Offer, spots: ChallengeSpot[], w: QuestWorld): Job {
  const centre = centreOf(spots, w.map)!;
  const examiner = examinerOf(offer.seed);
  const maxTests = Math.max(3, Math.min(6, w.players().length + 1));
  const car = w.vehicle!(CAR_ID + (offer.seed % 100000), KIND, PAINT, centre.x, centre.z, centre.ang, CAR_NAME);
  car.kept.add(1);
  const kit = learnerKit(car), sat = seatedExaminer(car);
  const routes = new Map<number, Route | null>();
  const routeFor = (n: number) => { if (!routes.has(n)) routes.set(n, routeOf(centre, hash(offer.seed, "test", n))); return routes.get(n)!; };

  // shared: the host's, copied by everyone else
  let phase = 0;                 // 0 between tests, 1 the briefing, 2 driving, 3 failed on the spot, 4 the report
  let test = 0, driver = "", prog = 0, radio = 2, station = 0, win = false, line = "", faults: Fault[] = [];
  let passedBy: string[] = [], tried: string[] = [];

  // the host's own
  let phaseT = 0, stoppedT = 0, movingWasStopped = true, lastMirror = -1e9, yankT = -1e9, speedT = 0, speedCool = 0, sideT = 0, sideCool = 0, offT = 0, offSaid = false;
  let leftOnT = 0, din = 0, tellings = 0, idleT = 0, sendT = 0, said = new Set<string>();
  let stepSig = new Map<number, { ok: boolean; wrong: boolean; minV: number; judged: boolean; mirrored: boolean }>();
  let voiceCool = 0, quietT = 0, heardDriver = false, saidQuiet = false, driverShouting = false;
  let pullState = 0, stopState = 0, stopAt = 0, endState = 0, askT = 0;

  // your own
  let kerbGrace = 3, lastRadio = -1, lastStation = 0, lastWin = false, inCar = false, mirSent = 0, bumpCool = 0, kerbT = 0, kerbCool = 0, esT0 = -1, markT = 0;
  let assistTill = 0, assistKind = "";
  const ac = new AbortController(), sig = { signal: ac.signal };

  const say = (d: Record<string, unknown>) => { const m = { ...d, s: offer.seed }; if (w.isHost) job.event!(m, w.selfId); else w.send("qe", m); };
  const tell = (d: Record<string, unknown>) => { const m = { ...d, s: offer.seed }; w.send("qe", m); job.event!(m, w.selfId); };
  const speakLine = (x: string) => tell({ k: "say", x });
  const fault = (x: string, g: number) => {
    if (phase !== 2) return;
    // the same minor fault again and again is a serious one, as on a real test
    const kind = x.split(":")[0];
    if (g === 1 && faults.filter((f) => f.g === 1 && f.x.split(":")[0] === kind).length >= 3) { x = `${kind}: the same mistake, over and over`; g = 2; }
    tell({ k: "f", x, g });
    if (g >= 2) { phase = 3; phaseT = 0; tell({ k: "halt", x }); }
  };
  const mySeat = () => { const s = w.seated?.(); return s && s.v === car ? s.seat : -1; };
  const near = () => { const me = w.me(); return mySeat() >= 0 || Math.hypot(me.x - car.x, me.z - car.z) < 35; };
  const atCentre = () => Math.hypot(car.x - centre.x, car.z - centre.z) < 30;

  // ---- what the passengers can get up to, on keys and on buttons ----------------------------------
  const ask = (a: string) => { if (mySeat() >= 2) say({ k: "pr", a }); };
  addEventListener("keydown", (e) => {
    if (e.repeat || mySeat() < 2) return;
    const a = isKey(e.code, "radioup") ? "up" : isKey(e.code, "radiodown") ? "down" : isKey(e.code, "station") ? "stn" : isKey(e.code, "window") ? "win" : isKey(e.code, "handbrake") ? "hb" : "";
    if (a) ask(a);
  }, sig);
  const panel = document.createElement("div");
  panel.style.cssText = "position:absolute;right:12px;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:6px;pointer-events:auto";
  panel.hidden = true;
  for (const [a, label, id] of [["up", "Radio up", "radioup"], ["down", "Radio down", "radiodown"], ["stn", "Change station", "station"], ["win", "Window", "window"], ["hb", "Handbrake!", "handbrake"]]) {
    const b = document.createElement("button");
    b.className = "tbtn small";
    b.style.cssText = "width:auto;height:auto;padding:6px 10px;font-size:14px;border-radius:8px";
    b.innerHTML = `${label} <small>${esc(ctl(id, "keys"))}</small>`;
    b.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); ask(a); }, sig);
    panel.appendChild(b);
  }
  document.getElementById("hud")?.appendChild(panel);

  // ---- the host: where the car's got to, and the marking --------------------------------------------
  function hostStep(dt: number) {
    phaseT += dt;
    const ps = w.players(), here = new Set(ps.map((p) => p.id)), seatDriver = car.seats[0] && here.has(car.seats[0]) ? car.seats[0] : "";
    const speed = Math.abs(car.speed);
    stoppedT = speed < 0.3 ? stoppedT + dt : 0;
    // the din in the car dies away, and builds with the radio turned right up
    din = Math.max(0, din - dt * 0.08) + (radio >= 4 ? dt * 0.3 : radio >= 3 ? dt * 0.12 : 0) + (win && radio >= 3 ? dt * 0.1 : 0);
    if (phase === 1 || phase === 2) listen(dt);
    if (din > 3 && phase >= 1 && phase <= 2) {
      din = 0; tellings++;
      speakLine(HUSH[tellings % HUSH.length]);
      if (tellings === 3) fault("Control: couldn't keep the passengers quiet", 1);
    }
    if (phase === 0) {
      driver = seatDriver;
      if (passedBy.length && test >= 1) {
        idleT = driver ? 0 : idleT + dt;
        if (idleT > 14 || ps.every((p) => tried.includes(p.id))) { tell({ k: "won" }); return; }
      } else if (test >= maxTests) {
        if (phaseT > 6) tell({ k: "lost" });
        return;
      }
      if (!driver) { stoppedT = 0; return; }
      if (!atCentre()) {
        if (phaseT > 3 && !said.has("back")) { said.add("back"); speakLine("Take us back to the test centre, please. Pull up on the left outside."); }
        return;
      }
      if (stoppedT > 1.5 && test < maxTests) {
        test++;
        routeFor(test);
        phase = 1; phaseT = 0; prog = 0; faults = []; tellings = 0; din = 0; stepSig = new Map(); pullState = stopState = endState = 0;
        quietT = 0; heardDriver = saidQuiet = false;
        lastMirror = -1e9; movingWasStopped = true; offT = 0; offSaid = false; said = new Set(); car.barred.clear();
        if (!tried.includes(driver)) tried.push(driver);
        tell({ k: "go", n: test, d: driver });
      }
      return;
    }
    // the driver getting out in the middle of it
    if ((phase === 1 || phase === 2) && seatDriver !== driver) {
      if (phase === 1) { phase = 0; phaseT = 0; tell({ k: "say", x: "Changed your mind? Fair enough." }); test--; return; }
      fault("Got out of the car in the middle of the test", 2);
    }
    const rt = routeFor(test);
    if (!rt) { phase = 0; return; }
    if (phase === 1) {
      const lines = [
        `Good morning. I'm ${examiner}, and I'll be your examiner today.`,
        "Follow the road ahead unless I ask you to turn. Look round before you move off, and before every turn.",
        "At some point I'll ask you to stop as if in an emergency.",
        "When you're ready, move off.",
      ];
      const k = Math.min(lines.length - 1, Math.floor(phaseT / 4));
      if (!said.has(`b${k}`)) { said.add(`b${k}`); tell({ k: "say", x: lines[k] }); }
      if (phaseT > lines.length * 4 - 3) { phase = 2; phaseT = 0; }
      return;
    }
    if (phase === 3) {
      // he's stamped on his brake: a silence, then the verdict
      if (phaseT > 3 && !said.has("fail")) { said.add("fail"); tell({ k: "say", x: "I'm afraid that's a fail." }); }
      if (phaseT > 6) endTest(false);
      return;
    }
    if (phase === 4) {
      if (phaseT > 9) { phase = 0; phaseT = 0; said = new Set(); idleT = 0; tell({ k: "say", x: passedBy.length ? "Anyone else fancy a go? Swap into the driver's seat. Or get out, and we'll call it a day." : test < maxTests ? "Swap over if someone else wants a go." : "That's enough tests for one day." }); }
      return;
    }
    // ---- driving -----
    const now = performance.now(), fresh = now - yankT > 3500;
    const at = onRoute(rt, car.x, car.z, prog, car.speed >= 0 ? Math.cos(car.a) : -Math.cos(car.a), car.speed >= 0 ? -Math.sin(car.a) : Math.sin(car.a));
    if (at.d < 25) {
      prog = Math.max(prog - 5, at.s);
      offT = 0;
      if (offSaid) { offSaid = false; tell({ k: "say", x: "That's better." }); }
    } else {
      offT += dt;
      if (offT > 5 && !offSaid) { offSaid = true; tell({ k: "say", x: `Not this way, I'm afraid. Turn round when it's safe and take us back to ${ptAt(rt, prog).n || "where we were"}.` }); }
      if (offT > 75) fault("Got the examiner hopelessly lost", 2);
    }
    // moving off: a look round first
    if (stoppedT > 1) movingWasStopped = true;
    if (movingWasStopped && speed > 1.5) {
      movingWasStopped = false;
      if (now - lastMirror > 7000) fault("Mirrors: moved off without looking round", 1);
    }
    const pt = ptAt(rt, prog), lim = pt.ms || limitOf(pt.c), mph = speed * MPH;
    // speed
    speedCool -= dt;
    if (fresh && mph > lim * 1.5 + 2) fault(`Speed: ${Math.round(mph)} mph in a ${lim}`, 2);
    speedT = mph > lim + 3 ? speedT + dt : 0;
    if (speedT > 2 && speedCool <= 0) { speedCool = 15; fault(`Speed: ${Math.round(mph)} mph in a ${lim}`, 1); }
    // the directions, and the turns
    for (const [k, st] of rt.steps.entries()) {
      if (prog >= st.ann && prog < st.s + 5 && !said.has(`s${k}`)) { said.add(`s${k}`); tell({ k: "say", x: st.text, dir: 1 }); }
      const j = stepSig.get(k) ?? { ok: false, wrong: false, minV: 99, judged: false, mirrored: false };
      stepSig.set(k, j);
      if (j.judged) continue;
      if (prog > st.s - 35 && prog < st.s - 1) {
        if (car.signal === st.dir && st.dir) j.ok = true;
        if (car.signal === -st.dir && st.dir) j.wrong = true;
      }
      if (prog > st.s - 16 && prog < st.s + 2) j.minV = Math.min(j.minV, speed);
      if (st.dir && !j.mirrored && prog > st.s - 15) { j.mirrored = true; if (now - lastMirror > 9000) fault(`Mirrors: turned ${st.dir > 0 ? "left" : "right"} without a look round`, 1); }
      if (prog > st.s + 5) {
        j.judged = true;
        const into = st.street ? ` into ${st.street}` : "";
        if (st.dir && j.wrong) fault(`Signals: signalled the wrong way turning${into}`, 1);
        else if (st.dir && !j.ok) fault(`Signals: no signal turning ${st.dir > 0 ? "left" : "right"}${into}`, 1);
        if (st.give && fresh && j.minV > 4.5) fault(`Junctions: drove straight out at a junction without stopping to look${into}`, 2);
        else if (st.give && j.minV > 2.4) fault(`Junctions: didn't slow down enough at a junction${into}`, 1);
      }
    }
    // an indicator left going with no turn coming
    const turning = rt.steps.some((st) => Math.abs(prog - st.s) < 45) || pullState === 1 || endState === 1;
    leftOnT = car.signal && !turning ? leftOnT + dt : 0;
    if (leftOnT > 7) { leftOnT = -25; fault("Signals: left the indicator on", 1); }
    // on the wrong side of the road, well away from any junction
    sideCool -= dt;
    sideT = pt.two && speed > 2 && at.d < 25 && at.side > car.hw + 0.6 && !turning ? sideT + dt : 0;
    if (sideT > 3 && sideCool <= 0) { sideCool = 25; fault(`Positioning: on the wrong side of the road${pt.n ? ` on ${pt.n}` : ""}`, 1); }
    // pulling up on the way round
    if (pullState === 0 && rt.pull > 0 && prog >= rt.pull) { pullState = 1; tell({ k: "say", x: "Pull up on the left when it's safe, please." }); }
    else if (pullState === 1 && stoppedT > 1.2) { pullState = 2; askT = 0; tell({ k: "ask", w: "pull" }); }
    else if (pullState === 1 && prog > rt.pull + 200) { pullState = 3; fault("Control: didn't pull up when asked", 1); }
    else if (pullState === 2 && (askT += dt) > 3) pullState = 3;
    // the emergency stop
    if (stopState === 0 && rt.stop > 0 && prog >= rt.stop && speed > 5 && (pullState >= 2 || rt.pull < 0)) { stopState = 1; stopAt = now; tell({ k: "es" }); }
    else if (stopState === 1 && now - stopAt > 8000) { stopState = 3; fault("Emergency stop: didn't stop", 2); }
    else if (stopState === 2 && stoppedT > 1) { stopState = 3; tell({ k: "say", x: "Thank you. I won't ask you to do that again. Move off when you're ready." }); }
    // and back at the centre
    if (endState === 0 && prog >= rt.len - 80 && rt.steps.every((st) => prog > st.s)) { endState = 1; tell({ k: "say", x: "Pull up on the left when it's safe, please. That's the end of the test." }); }
    else if (endState === 1 && stoppedT > 1.2 && prog > rt.len - 120) { endState = 2; askT = 0; tell({ k: "ask", w: "end" }); }
    else if (endState === 2 && (askT += dt) > 3) endTest(faults.filter((f) => f.g === 1).length <= MINORS);
  }

  /** What the car sounds like, from each one's own mic (voicelevel.ts): the back seats' din, and the driver laughing, shouting or gone quiet. */
  function listen(dt: number) {
    for (const k of [2, 3]) {
      const v = car.seats[k] ? w.voice?.(car.seats[k]) : null;
      if (v) din += dt * ((v.state === 2 ? 0.5 : v.state === 1 ? 0.1 : 0) + (v.laughing ? 0.15 : 0));
    }
    const d = driver ? w.voice?.(driver) : null;
    if (!d) return;
    voiceCool -= dt;
    if (d.state) { heardDriver = true; quietT = 0; } else quietT += dt;
    const shout = d.state === 2 && !driverShouting;
    driverShouting = d.state === 2;
    if (voiceCool <= 0 && d.laughing) { voiceCool = 25; speakLine(LAUGHS[Math.floor(performance.now() / 1000) % LAUGHS.length]); }
    else if (voiceCool <= 0 && shout) { voiceCool = 25; speakLine("There's no need to shout."); }
    // (only once they've been heard: with no mic, everyone's quiet)
    if (heardDriver && quietT > 90 && !saidQuiet) { saidQuiet = true; speakLine("You've gone very quiet. Just breathe. You're doing fine."); }
  }

  function endTest(pass: boolean) {
    if (phase === 4) return;
    if (faults.some((f) => f.g >= 2)) pass = false;
    phase = 4; phaseT = 0;
    if (pass && driver && !passedBy.includes(driver)) passedBy.push(driver);
    tell({ k: "end", pass: pass ? 1 : 0, d: driver, n: test, f: faults.map((f) => [f.x, f.g]), pb: passedBy });
  }

  // ---- the driver's own screen: what only it can see ------------------------------------------------
  function driverStep(dt: number) {
    const now = performance.now();
    if (assistTill && now > assistTill && (assistKind !== "halt" || Math.abs(car.speed) < 0.3)) { car.assist = null; assistTill = 0; }
    if (phase !== 2) return;
    const L = w.look(), fx = Math.cos(car.a), fz = -Math.sin(car.a), dl = Math.hypot(L.dx, L.dz) || 1;
    if ((L.dx * fx + L.dz * fz) / dl < Math.cos(0.6) && now - mirSent > 1000) { mirSent = now; say({ k: "mir" }); }
    bumpCool -= dt; kerbCool -= dt;
    if (car.impact > 2 && bumpCool <= 0) { bumpCool = 1.5; say({ k: "bump", sp: +(car.impact).toFixed(1) }); }
    // a wheel up on the pavement
    const c = Math.cos(car.a), s = Math.sin(car.a);
    let up = false;
    for (const al of [car.hl - 0.6, -car.hl + 0.6]) for (const acr of [car.hw - 0.12, -car.hw + 0.12]) if (w.pavement?.(car.x + al * c + acr * s, car.z - al * s + acr * c)) up = true;
    kerbT = up && Math.abs(car.speed) > 0.4 ? kerbT + dt : 0;
    if (Math.abs(car.speed) < 0.3) kerbGrace = 3;
    else kerbGrace -= dt;
    // (pulling away from the kerb, a back wheel can drag over it: that's not a fault)
    if (kerbT > 0.15 && kerbCool <= 0 && kerbGrace <= 0) { kerbCool = 4; say({ k: "kerb", sp: +Math.abs(car.speed).toFixed(1) }); }
    if (esT0 >= 0 && (car.braking || car.hand)) { say({ k: "esr", r: +((now - esT0) / 1000).toFixed(2) }); esT0 = -1; }
  }

  /** How far the car's left side is from the kerb: from its front and back wheels out to the pavement. */
  function kerbGap() {
    const c = Math.cos(car.a), s = Math.sin(car.a);
    let sum = 0;
    for (const al of [car.hl - 0.6, -car.hl + 0.6]) {
      let g = 2.5;
      for (let d = -0.2; d <= 2.5; d += 0.1) {
        const acr = -(car.hw + d);
        if (w.pavement?.(car.x + al * c + acr * s, car.z - al * s + acr * c)) { g = Math.max(0, d); break; }
      }
      sum += g;
    }
    return +(sum / 2).toFixed(2);
  }

  function assist(kind: string, secs: number) {
    if (mySeat() !== 0) return;
    assistKind = kind; assistTill = performance.now() + secs * 1000;
    car.assist = kind === "halt"
      ? (inp: Controls) => ({ ...inp, throttle: car.speed > 0.4 ? -1 : car.speed < -0.4 ? 1 : 0, handbrake: Math.abs(car.speed) <= 0.4 })
      : (inp: Controls) => ({ ...inp, throttle: 0, handbrake: true });
  }

  const sheet = (pass: boolean, who: string, n: number, list: Fault[]) => {
    const group = (g: number) => {
      const m = new Map<string, number>();
      for (const f of list) if (f.g === g) m.set(f.x, (m.get(f.x) ?? 0) + 1);
      return [...m].map(([x, k]) => (k > 1 ? `${x} (x${k})` : x));
    };
    const minors = list.filter((f) => f.g === 1).length;
    missionSheet({
      kind: `Driving test report · test ${n} of ${maxTests}`, title: "The Driving Test", who: `Candidate: ${w.nameOf(who)} · Examiner: ${examiner}`,
      stamp: pass ? "PASS" : "FAIL", good: pass,
      sections: [{ head: `Minor faults: ${minors}`, lines: group(1) }, { head: "Serious", lines: group(2) }, { head: "Dangerous", lines: group(3) }],
      foot: pass ? (minors ? "A pass. Mind those minors." : "A clean sheet. Well driven.") : minors > MINORS ? `More than ${MINORS} minor faults. Better luck next time.` : "Better luck next time.",
    });
  };

  // ---- the job ---------------------------------------------------------------------------------------
  w.toast(`${examiner} is waiting in the learner car: one of you in the driver's seat`, 4);
  if (TESTING) (window as unknown as Record<string, unknown>).__drivingTest = { car, route: () => routeFor(test), phase: () => phase, prog: () => prog, faults: () => faults, line: () => line };
  const job: Job = {
    offer, done: null,
    update(dt) {
      const seat = mySeat();
      if (seat === 0) driverStep(dt);
      else if (car.assist && assistTill) { car.assist = null; assistTill = 0; }
      // the radio and the window, for whoever's in the car
      if (seat >= 0) {
        if (radio !== lastRadio) { SFX.carRadio(RADIO[radio]); lastRadio = radio; }
        if (station !== lastStation) { lastStation = station; SFX.nextTrack(); }
        if (win !== lastWin || !inCar) { w.windows?.(win); lastWin = win; }
        inCar = true;
      } else if (inCar) { inCar = false; SFX.carRadio(1); w.windows?.(false); lastRadio = -1; }
      lastStation = station;
      panel.hidden = seat < 2 || !!job.done;
      controlsHere("back", !panel.hidden);
      // from the back seat your eyes are up by the roof, and the roof sign would fill the view
      kit.visible = seat < 2;
      if ((markT -= dt) <= 0) {
        markT = 0.5;
        const me = w.me(), target = phase === 0 && driver && !atCentre() ? { x: centre.x, z: centre.z } : seat < 0 && Math.hypot(me.x - car.x, me.z - car.z) > 50 ? { x: car.x, z: car.z, y: car.top + 1 } : null;
        w.mark("@challenge", target, target && phase === 0 && driver ? "The test centre" : "The learner car", COLOUR);
      }
    },
    host(dt) {
      if (job.done) return;
      hostStep(dt);
      if ((sendT -= dt) <= 0) { sendT = SEND; w.send("qe", state()); }
    },
    event(d, from) {
      if (!d) return;
      if (d.k === "t") { if (!w.isHost) take(d); return; }
      if (w.isHost) {
        const fromDriver = from === car.seats[0] && from === driver, seat = car.seats.indexOf(from);
        if (d.k === "mir" && fromDriver) { lastMirror = performance.now(); return; }
        if (d.k === "bump" && fromDriver && phase === 2) {
          if (performance.now() - yankT > 3500) fault(`Hit something at ${Math.round(Math.max(3, +d.sp || 0) * MPH)} mph`, 3);
          return;
        }
        if (d.k === "kerb" && fromDriver && phase === 2) {
          if (performance.now() - yankT > 3500) fault((+d.sp || 0) > 8 ? "Steering: mounted the pavement at speed" : "Steering: clipped the kerb", (+d.sp || 0) > 8 ? 2 : 1);
          return;
        }
        if (d.k === "esr" && fromDriver && stopState === 1) {
          stopState = 2;
          const rx = +d.r || 9;
          if (rx > 1.6) fault(`Emergency stop: too slow to react (${rx.toFixed(1)} seconds)`, 2);
          else if (rx > 1.0) fault("Emergency stop: slow to react", 1);
          return;
        }
        if (d.k === "park" && fromDriver && phase === 2) {
          const g = +d.gap;
          const what = d.w === "end" ? "Parking" : "Pulling up";
          if (g > 1.4) fault(`${what}: too far from the kerb`, 1);
          if (d.w === "pull" && pullState === 2) { pullState = 3; tell({ k: "say", x: "Thank you. Move off when you're ready." }); }
          if (d.w === "end" && endState === 2) endTest(faults.filter((f) => f.g === 1).length <= MINORS);
          return;
        }
        if (d.k === "pr" && seat >= 2) {
          if (d.a === "up") radio = Math.min(4, radio + 1);
          else if (d.a === "down") radio = Math.max(0, radio - 1);
          else if (d.a === "stn") station++;
          else if (d.a === "win") win = !win;
          else if (d.a === "hb") {
            if (phase !== 2) { tell({ k: "say", x: "Leave that alone, please." }); return; }
            yankT = performance.now();
            tell({ k: "yank", by: from });
            tell({ k: "say", x: `Who did that? Right. Out, ${w.nameOf(from)}. You can walk.` });
            car.barred.add(from);
            setTimeout(() => { if (!job.done) tell({ k: "out", id: from }); }, 1400);
            return;
          }
          din += 0.7;
          return;
        }
      }
      if (["mir", "bump", "kerb", "esr", "park", "pr"].includes(d.k)) return;
      if (d.k === "say" && typeof d.x === "string") {
        line = d.x;
        if (near()) { speak(d.x); w.toast(`${examiner}: “${d.x}”`, 4); }
      } else if (d.k === "f" && typeof d.x === "string") {
        faults.push({ x: d.x, g: +d.g || 1 });
        if (mySeat() === 0 && d.g === 1) { SFX.tick(); w.toast(`${examiner} writes something down`, 2); }
      } else if (d.k === "halt") {
        phase = 3;
        assist("halt", 3);
        if (near()) { const [dd, pan] = w.hear?.(car.x, car.y, car.z) ?? [0, 0]; SFX.screech(dd, pan); w.toast(`${examiner} stamps on his brake`, 3); }
        if (mySeat() === 0) speakHush();
      } else if (d.k === "es") {
        line = "Stop!";
        if (near()) { SFX.thump(); speak("Stop!"); w.toast(`${examiner} slaps the dashboard: “STOP!”`, 2.5); }
        if (mySeat() === 0) esT0 = performance.now();
      } else if (d.k === "ask") {
        if (mySeat() === 0) say({ k: "park", gap: kerbGap(), w: d.w });
      } else if (d.k === "yank") {
        assist("yank", 1.1);
        if (near()) { SFX.clunk(); const [dd, pan] = w.hear?.(car.x, car.y, car.z) ?? [0, 0]; SFX.screech(dd, pan); }
        w.feed(`<b style="color:${w.colourOf(d.by)}">${esc(w.nameOf(d.by))}</b> pulled the handbrake on the driving test`);
      } else if (d.k === "out") {
        if (d.id === w.selfId && mySeat() >= 0) { w.getOut?.(); w.toast("Thrown out of the car. You'll have to walk", 3); }
      } else if (d.k === "go") {
        phase = 1; test = +d.n || test; driver = typeof d.d === "string" ? d.d : driver; faults = []; prog = 0;
        routeFor(test);
        w.feed(`<b style="color:${w.colourOf(driver)}">${esc(w.nameOf(driver))}</b> is taking the driving test`);
      } else if (d.k === "end") {
        phase = 4;
        const list: Fault[] = Array.isArray(d.f) ? d.f.filter((f: unknown) => Array.isArray(f)).map((f: unknown[]) => ({ x: String(f[0]), g: +(f[1] as number) || 1 })) : [];
        if (Array.isArray(d.pb)) passedBy = d.pb.filter((x: unknown) => typeof x === "string");
        sheet(!!d.pass, typeof d.d === "string" ? d.d : driver, +d.n || test, list);
        SFX.jobDone(!!d.pass);
      } else if (d.k === "won" && !job.done) {
        const who = passedBy.map((id) => w.nameOf(id)).join(" and ");
        job.done = { won: true, text: `${who || "Someone"} passed the driving test`, x: centre.x, z: centre.z };
      } else if (d.k === "lost" && !job.done) {
        job.done = { won: false, text: "Nobody passed. That's enough tests for one day", x: centre.x, z: centre.z };
      }
    },
    progress: () => ({ ...state(), f: faults.map((f) => [f.x, f.g]), pb: passedBy, tr: tried }),
    restore(p) {
      if (p?.k !== "t") return;
      take(p);
      if (Array.isArray(p.f)) faults = p.f.filter((f: unknown) => Array.isArray(f)).map((f: unknown[]) => ({ x: String(f[0]), g: +(f[1] as number) || 1 }));
      if (Array.isArray(p.pb)) passedBy = p.pb.filter((x: unknown) => typeof x === "string");
      if (Array.isArray(p.tr)) tried = p.tr.filter((x: unknown) => typeof x === "string");
    },
    card() {
      const me = w.me(), seat = mySeat(), rt = test ? routeFor(test) : null;
      const minors = faults.filter((f) => f.g === 1).length;
      const progress = `Test ${Math.max(1, test)} / ${maxTests}`;
      if (phase === 0) {
        const dist = Math.hypot(me.x - car.x, me.z - car.z);
        if (seat < 0 && dist > 40) return { line: `The learner car is ${far(dist)} ${compassWord(car.x - me.x, car.z - me.z)}`, progress };
        return {
          line: line && driver ? line : seat === 0 ? "Wait there: he's getting his clipboard ready" : "Get in the learner car: whoever's in the driver's seat takes the test",
          sub: passedBy.length ? `Passed: ${passedBy.map((id) => w.nameOf(id)).join(", ")}` : "Two can ride in the back. Fifteen minor faults is a pass; one serious fault is a fail",
          progress,
        };
      }
      const sub = seat === 0 ? `Look round before moving off and turning · ${ctl("left")} ${ctl("right")} to indicate`
        : seat >= 2 ? `In the back: ${stripOf([["radioup", "radio up"], ["radiodown", "down"], ["station", "station"], ["window", "window"], ["handbrake", "handbrake"]])}`
        : `${w.nameOf(driver)} is driving`;
      const last = faults[faults.length - 1];
      const stage = last ? { key: `t${test}f${faults.length}`, title: ["", "Minor fault", "Serious fault", "Dangerous fault"][last.g] ?? "Fault", sub: last.x, colour: last.g > 1 ? COLOUR : "#ffd84a", life: last.g > 1 ? 3.5 : 2.2 } : undefined;
      return {
        line: phase === 3 ? "..." : line || "Listen for the examiner",
        sub, progress: `${minors} minor${minors === 1 ? "" : "s"}`, bar: rt ? Math.min(1, prog / rt.len) : 0, stage,
      };
    },
    obstacles: () => (car.driver ? [] : [{ x: car.x, z: car.z, r: car.hl, parked: true, a: car.a }]),
    end() {
      ac.abort();
      panel.remove();
      controlsHere("back", false);
      car.assist = null;
      if (inCar) { SFX.carRadio(1); w.windows?.(false); }
      w.mark("@challenge", null);
      kit.removeFromParent(); sat.removeFromParent();
      w.dropVehicle?.(car);
    },
  };

  function state() {
    return { k: "t", s: offer.seed, q: [phase, +prog.toFixed(1), test, radio, station, win ? 1 : 0], d: driver, ln: line };
  }

  function take(d: any) {
    const q = d.q;
    if (!Array.isArray(q) || q.length < 6 || !q.every(Number.isFinite)) return;
    phase = q[0];
    prog = q[1]; test = q[2]; radio = Math.max(0, Math.min(4, q[3] | 0)); station = q[4] | 0; win = !!q[5];
    if (typeof d.d === "string") driver = d.d;
    if (typeof d.ln === "string") line = d.ln;
    if (test) routeFor(test);
  }

  return job;
}

// ---- his voice --------------------------------------------------------------------------------------

const synth = typeof speechSynthesis !== "undefined" ? speechSynthesis : null;
function speak(text: string) {
  if (!synth) return;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const voices = synth.getVoices().filter((v) => v.lang.startsWith("en"));
  const man = /\bmale|daniel|arthur|george|oliver|ryan|thomas/i;
  const v = voices.find((x) => x.lang === "en-GB" && man.test(x.name) && !/female/i.test(x.name)) ?? voices.find((x) => x.lang === "en-GB") ?? voices[0];
  if (v) u.voice = v;
  u.pitch = 0.8; u.rate = 0.95;
  u.volume = SFX.effectsVolume();
  if (u.volume) synth.speak(u);
}
/** The silence after he stamps on the brake. */
function speakHush() { synth?.cancel(); }
