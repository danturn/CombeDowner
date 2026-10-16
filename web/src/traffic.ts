// Traffic: cars that drive themselves round the streets near the players, all over Bath (Combe Down's
// own streets and the wider map's, joined up where they meet), keeping left, slowing for
// corners and stopping for anything in the road (and leaning on the horn if it's you). They run over
// anyone who steps out at the last moment, and you can pull the driver out of one that's stopped
// and drive off in it (it becomes a vehicle, vehicles.ts, numbered TRAFFIC_ID + its number).
//
// Drive into one (or into a car parked in the street) and it gives way: it's knocked off its line, sliding and spinning, and hit hard
// side-on it trips over its wheels and rolls. One that comes to rest on its roof catches fire and
// goes up a moment later, a fireball that hurts naughty boys, the posh teams and Bendy round it (not
// players, and not the cats) and knocks the rest of the traffic about, which can set more off.
//
// Who decides what: the host drives them all, spawning them on roads a little way off from the
// players and dropping them once everyone's far away, and sends where they are about 10 times a
// second. Everyone else draws them a moment behind, smoothed between updates, as for the naughty boys.
// Whoever drives into one tells the host how hard ("tfx", or "tfp" for a parked car, which comes out
// of the street furniture as a wreck in the traffic, PARKED + its vehicle number, on everyone's
// screen), and sees it go straight away while the host's word catches up; the host runs the wrecks
// and sends how they're lying ("tfw") with the rest.
import * as THREE from "three";
import { carSteerable, paintFor } from "./furniture";
import { carShape, MAKES, trafficMake } from "./makes";
import { glossy } from "./gloss";
import { GameMap, Mover } from "./map";
import type { LampPair, Lamps, Lit } from "./headlights";
import { CAR_LAMPS, contact, twist } from "./vehicles";

/** A car taken from the traffic is vehicle TRAFFIC_ID + its number. */
export const TRAFFIC_ID = 100000;
/** A parked car knocked out of the street furniture is car PARKED + its vehicle number in the traffic. */
export const PARKED = 2 ** 45;
const SPEED: Record<string, number> = { trunk: 13, primary: 13, secondary: 13, tertiary: 12, residential: 9, unclassified: 8, living_street: 5 };   // m/s: 30 mph, 20 mph
const WIDTH: Record<string, number> = { trunk: 9, primary: 8.5, secondary: 8, tertiary: 7, residential: 6, unclassified: 5.5, living_street: 5 }; // as world.ts draws them
const COUNT = 12;                    // cars about round each player (fewer each when there are lots of players)
const MAX = 24;                      // cars about at once, in all
const CELL = 100;                    // the roads are filed in squares this size, to find ones near the players quickly
const NEAR = 70, FAR = 220, GONE = 320;   // spawn between NEAR and FAR from the nearest player; gone past GONE
const HL = 2.08, HW = 0.88, H = 1.44;
const WB = 2.6;                      // wheelbase: the front wheels turn, and the back ones follow them round
const LOCK = 0.6;                    // full lock, radians
const ACCEL = 2.5, BRAKE = 7;
const DELAY = 110;                   // ms behind the host, as for other players
const STRIDE = 6;                    // numbers per car in a snapshot
export const CAR_MASS = 0.4;                // how heavy one is against a car you're driving (light, so you plough through)
const BOUNCE = 0.3;                  // how much two of them bounce apart
const ALONG = [-(HL - HW), 0, HL - HW];   // circles along it, for bumping into things once it's a wreck
export const KNOCK = 2.5;                   // a knock softer than this (m/s) and it shrugs it off and drives on
const TRIP = 6;                      // a knock side-on harder than this (m/s) trips it over its wheels
const BLAST = 9;                     // how far a car going up throws the rest of the traffic about, m
const BURN = 12;                     // seconds it burns after going up
const CHAR = "#2a2725";              // what's left of the paint
/** Its lamps, in the frame it rolls over in (whose middle is half its height up). */
const down = ([a, u, c, w, h]: LampPair): LampPair => [a, u - H / 2, c, w, h];
const LAMPS: Lamps = { front: down(CAR_LAMPS.front), back: down(CAR_LAMPS.back!) };
const GUESS_HOLD = 300, GUESS_END = 800;   // ms: how long to trust our own idea of where we knocked one, then hand back to the host's

interface Edge { a: number; b: number; len: number; v: number; lane: number; room: number; kerb: number; dx: number; dz: number; back?: Edge }
interface Node { x: number; z: number; out: Edge[] }
interface Snap { t: number; x: number; z: number; a: number; v: number }
/** Something sliding about off its wheels' line: a wreck, or our guess at where we've just knocked one. */
interface Tumbling { x: number; z: number; a: number; y: number; vx: number; vz: number; spin: number; roll: number; rollV: number; lift: number; liftV: number }
const ease = (v: number, by: number) => (Math.abs(v) <= by ? 0 : v - Math.sign(v) * by);
const turnTo = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
/** Someone or something in the road: where, and how far it reaches either way. */
export interface Obstacle { x: number; z: number; r: number; id?: string; person?: boolean; parked?: boolean; a?: number;
  /** Another car in the traffic, pulled out round something parked and coming the other way. */
  passing?: boolean }

/** Its lane's offset from the road's middle where stretch d1 meets d2. Left of d (scene coords: x east,
 * z south) is (dz, -dx); where two stretches meet, the lane bends along the line halfway between them. */
function miter(d1: Edge, d2: Edge): number[] {
  const mx = d1.dz + d2.dz, mz = -d1.dx - d2.dx, m = Math.hypot(mx, mz);
  if (m < 0.3) return [d2.dz * d2.lane, -d2.dx * d2.lane];
  const k = d2.lane / Math.max(0.5, (mx * d2.dz - mz * d2.dx) / m) / m;
  return [mx * k, mz * k];
}

/** Where (x, z) is against a path: how far along it (negative behind the start), and how far to its left. */
function project(path: number[][], x: number, z: number): [number, number] {
  let best = Infinity, u = 0, w = 0, run = 0;
  for (let k = 0; k + 1 < path.length; k++) {
    const [ax, az] = path[k], [bx, bz] = path[k + 1], len = Math.hypot(bx - ax, bz - az);
    if (len < 1e-6) continue;
    const sx = (bx - ax) / len, sz = (bz - az) / len, dx = x - ax, dz = z - az;
    let t = dx * sx + dz * sz;
    if (k > 0 || t > 0) t = Math.min(len, Math.max(0, t));
    const px = ax + sx * t, pz = az + sz * t, d = Math.hypot(x - px, z - pz);
    if (d < best) { best = d; u = run + t; w = (x - px) * sz - (z - pz) * sx; }
    run += len;
  }
  return [u, w];
}

/**
 * Knock something by (dvx, dvz) m/s and spin it: caught side-on hard enough, it trips over its wheels
 * and rolls over the way it was hit, up off the ground; a big enough knock end-on just bounces it.
 */
function knock(w: Tumbling, dvx: number, dvz: number, spin: number) {
  w.vx += dvx; w.vz += dvz;
  w.spin = Math.max(-6, Math.min(6, w.spin + spin));
  const across = dvx * Math.sin(w.a) + dvz * Math.cos(w.a), hard = Math.abs(across);
  if (hard > TRIP) {
    w.rollV = Math.max(-14, Math.min(14, w.rollV + Math.sign(across) * (hard - TRIP * 0.5) * 1.2));
    w.liftV = Math.max(w.liftV, Math.min(4.5, 0.8 + hard * 0.25));
  } else if (Math.hypot(dvx, dvz) > 10) w.liftV = Math.max(w.liftV, 1.2);
}

class Car implements Mover {
  x = 0; z = 0; a = 0; y = 0; top = 0; waist = 0;
  readonly hl = HL; readonly hw = HW;
  v = 0;
  horn = false;
  /** 0 ticking over .. 1 flat out, for the engine's note. */
  rpm = 0.2;
  gas = 0;
  // the host's: where it is on the roads
  e!: Edge; prev: Edge | null = null; s = 0;
  route: Edge[] = [];                // the roads it'll take after this one, 40 m or so ahead
  get next() { return this.route[0]; }
  // knocked off the road by someone driving into it: sliding, spinning, maybe rolling over, and not driving any more
  wreck = false;
  vx = 0; vz = 0;                    // which way it's going, m/s (scene coords)
  readonly mass = CAR_MASS;
  spin = 0;                          // how fast it's spinning round, rad/s (+ is left)
  roll = 0; rollV = 0;               // how far it's rolled over about its length (0 on its wheels, π on its roof), and how fast
  lift = 0; liftV = 0;               // how far off the ground, m, and how fast it's going up
  fire = 0;                          // 0 not alight, 1 alight and about to go up, 2 gone up
  fuse = 0;                          // host: seconds till it goes up
  burnT = 0;                         // seconds of flames left after it's gone up
  by = "";                           // host: who knocked it over, for whoever the blast catches
  wv = [0, 0, 0, 0];                 // the host's word on a wreck: vx, vz, roll, lift
  guess: (Tumbling & { t: number }) | null = null;   // where we've just knocked it, before the host's word comes back
  flames: THREE.Group | null = null;
  smokeT = 0;
  blockT = 0;
  stuckT = 0;                        // how long it's been stood still
  dodge = 0;                         // how far out from its lane it's pulled, to get past something parked
  parked: Obstacle[] = []; parkedT = 0;   // the cars parked near it, and when to look again
  hits = new Map<string, number>();
  // everyone's
  snaps: Snap[] = [];
  readonly root = new THREE.Group();
  readonly tumble = new THREE.Group();   // the car itself, rolling over about its middle
  readonly wheels: THREE.Mesh[];     // the front wheels, turned with the steering
  readonly mat: THREE.MeshLambertMaterial;
  steer = 0;                         // the front wheels' angle, radians, + is left
  pa: number | null = null;          // its heading a frame ago, for how hard it's turning
  rolled = 0;
  constructor(readonly n: number, readonly paint: number, readonly make = trafficMake(n)) {
    const car = carSteerable(carShape(make)), mat = (this.mat = glossy(new THREE.MeshLambertMaterial({ vertexColors: true, color: paintFor(make, paint) })));
    const body = new THREE.Mesh(car.body, mat);
    body.castShadow = true; body.receiveShadow = true;
    body.position.y = -H / 2;
    this.tumble.position.y = H / 2;
    this.tumble.add(body);
    this.wheels = car.wheels.map((w) => { const m = new THREE.Mesh(w.geo, mat); m.position.set(w.x, w.y - H / 2, w.z); m.rotation.order = "YZX"; m.castShadow = true; return m; });
    this.tumble.add(...this.wheels);
    this.root.add(this.tumble);
  }
  get name() { return MAKES[this.make]; }
  dispose() { this.mat.dispose(); }
}

// flames, shared by every car that's alight
let flameGeo: THREE.BufferGeometry | null = null;
let flameMats: THREE.Material[] = [];
function flames(): THREE.Group {
  flameGeo ??= new THREE.ConeGeometry(0.34, 1, 6).translate(0, 0.5, 0);
  if (!flameMats.length) flameMats = ["#ff6a14", "#ffb22e", "#ff8a1e"].map((color) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false }));
  const g = new THREE.Group();
  for (let k = 0; k < 6; k++) {
    const m = new THREE.Mesh(flameGeo, flameMats[k % flameMats.length]);
    m.position.set(-1.4 + (k / 5) * 2.8, 0.25, (k % 2 ? 0.35 : -0.35));
    g.add(m);
  }
  return g;
}

export class Traffic {
  private nodes: Node[] = [];
  private edges: Edge[] = [];
  private cars = new Map<number, Car>();
  private cells = new Map<number, Edge[]>();
  private serial = 1 + Math.floor(Math.random() * 1e6) * 1000;   // a new host's numbers don't clash with the last one's

  constructor(private map: GameMap, private scene: THREE.Scene, private ground: (x: number, z: number, y?: number) => number) {
    // the road network: every mapped road a car can use, joined where their points meet
    const ids = new Map<string, number>();
    const node = (p: number[]) => {
      const k = `${Math.round(p[0] * 2)},${Math.round(p[1] * 2)}`;
      let i = ids.get(k);
      if (i === undefined) { i = this.nodes.length; ids.set(k, i); this.nodes.push({ x: p[0], z: -p[1], out: [] }); }
      return i;
    };
    // the wider map's streets carry on from the edge of Combe Down's (where one's left hanging at
    // the edge, it's joined to the nearest end across the seam)
    for (const r of [...map.d.rd, ...map.wide?.rd ?? []]) {
      const v = SPEED[r.c];
      if (!v || r.p.length < 2) continue;
      const lane = Math.min(2, Math.max(1.2, (WIDTH[r.c] ?? 6) / 4));
      // how far it can pull out from its lane: up to the far kerb, and a wheel on the pavement
      const room = lane + (WIDTH[r.c] ?? 6) / 2 - HW + 0.3;
      // and how far in toward the kerb, to let someone by
      const kerb = Math.max(0, (WIDTH[r.c] ?? 6) / 2 - lane - HW + 0.3);
      // a one-way street only goes its way (ow: 1 with the points, -1 against them)
      for (let k = 0; k + 1 < r.p.length; k++) {
        const a = node(r.p[k]), b = node(r.p[k + 1]);
        if (a === b || this.nodes[a].out.some((e) => e.b === b)) continue;
        const A = this.nodes[a], B = this.nodes[b], len = Math.hypot(B.x - A.x, B.z - A.z);
        const there: Edge = { a, b, len, v, lane, room, kerb, dx: (B.x - A.x) / len, dz: (B.z - A.z) / len };
        const back: Edge = { a: b, b: a, len, v, lane, room, kerb, dx: -there.dx, dz: -there.dz, back: there };
        if (r.ow === 1) { A.out.push(there); this.edges.push(there); }
        else if (r.ow === -1) { back.back = undefined; B.out.push(back); this.edges.push(back); }
        else { there.back = back; A.out.push(there); B.out.push(back); this.edges.push(there, back); }
      }
    }
    // dead ends right by another dead end (where the two maps meet): joined
    const ends = this.nodes.map((_, i) => i).filter((i) => this.nodes[i].out.length === 1);
    const endCells = new Map<string, number[]>();
    for (const i of ends) { const k = `${Math.floor(this.nodes[i].x / 4)},${Math.floor(this.nodes[i].z / 4)}`; (endCells.get(k) ?? endCells.set(k, []).get(k)!).push(i); }
    for (const i of ends) {
      const A = this.nodes[i];
      if (A.out.length !== 1) continue;
      let best = -1, bd = 2.5;
      for (let ci = Math.floor(A.x / 4) - 1; ci <= Math.floor(A.x / 4) + 1; ci++) for (let cj = Math.floor(A.z / 4) - 1; cj <= Math.floor(A.z / 4) + 1; cj++)
        for (const j of endCells.get(`${ci},${cj}`) ?? []) {
          const d = Math.hypot(this.nodes[j].x - A.x, this.nodes[j].z - A.z);
          if (j !== i && this.nodes[j].out.length === 1 && d < bd) { bd = d; best = j; }
        }
      if (best < 0) continue;
      const B = this.nodes[best], e = A.out[0], len = Math.max(0.1, bd);
      const there: Edge = { a: i, b: best, len, v: e.v, lane: e.lane, room: e.room, kerb: e.kerb, dx: (B.x - A.x) / len || e.dx, dz: (B.z - A.z) / len || e.dz };
      const back: Edge = { ...there, a: best, b: i, dx: -there.dx, dz: -there.dz, back: there };
      there.back = back;
      A.out.push(there); B.out.push(back);
      this.edges.push(there, back);
    }
    // filed by the square each stretch's middle is in
    for (const e of this.edges) {
      const A = this.nodes[e.a], k = this.cell(A.x + e.dx * e.len / 2, A.z + e.dz * e.len / 2);
      (this.cells.get(k) ?? this.cells.set(k, []).get(k)!).push(e);
    }
  }

  private cell(x: number, z: number) { return (Math.floor(x / CELL) + 4096) * 8192 + Math.floor(z / CELL) + 4096; }

  get list(): Iterable<Car> { return this.cars.values(); }

  /** The cars driving along with their lights on (not the wrecks), for headlights.ts. */
  lit(out: Lit[]) {
    for (const c of this.cars.values()) if (!c.wreck && !c.fire && !c.guess) out.push({ frame: c.tumble, lamps: LAMPS });
  }

  /** Everyone: a car's gone up at (x, y, z); one's landed (or hit another) with a crunch, force 0..1; smoke coming off one that's alight (or burnt out). */
  onBoom?: (x: number, y: number, z: number) => void;
  onCrunch?: (x: number, y: number, z: number, force: number) => void;
  onSmoke?: (x: number, y: number, z: number, alight: boolean) => void;
  /** Everyone but the host: parked car i (a vehicle number) has been knocked into the road, so it's to come out of the street furniture. */
  onUnpark?: (i: number) => void;
  /** The make of parked car i (a vehicle number), for one knocked into the road (makes.ts). */
  parkedMake: (i: number) => number = () => 0;

  // ---- the host: driving them ------------------------------------------------------------------
  /** Drive them all for dt. players: everyone's whereabouts, for where to put cars; things: what's in the road;
   * hit: someone on foot it's run over, at speed v (m/s); blast: one's gone up at (x, y, z), knocked over by player by. */
  simulate(dt: number, players: { x: number; z: number }[], things: Obstacle[], hit: (id: string, v: number) => void,
    blast: (x: number, y: number, z: number, by: string) => void) {
    const nearest = (x: number, z: number) => players.reduce((m, p) => Math.min(m, Math.hypot(p.x - x, p.z - z)), Infinity);
    // gone once everyone's far away, or once it's been stuck (or lying wrecked) a good while with nobody near enough to see it go
    for (const c of [...this.cars.values()]) if (nearest(c.x, c.z) > GONE || (c.stuckT > (c.wreck ? 45 : 20) && nearest(c.x, c.z) > 40)) this.drop(c.n);
    // a new one round whoever has fewest, so everyone has traffic wherever they are (the wrecks don't count, up to a point)
    const wrecks = [...this.cars.values()].filter((c) => c.wreck).length;
    if (this.cars.size - wrecks < MAX && this.cars.size < MAX + 10 && players.length && this.edges.length) {
      const round = players.map(() => 0);
      for (const c of this.cars.values()) {
        if (c.wreck) continue;
        let k = 0;
        players.forEach((p, j) => { if (Math.hypot(p.x - c.x, p.z - c.z) < Math.hypot(players[k].x - c.x, players[k].z - c.z)) k = j; });
        round[k]++;
      }
      const k = round.indexOf(Math.min(...round));
      if (round[k] < Math.max(6, Math.min(COUNT, Math.floor(MAX / players.length)))) this.spawn(players[k], nearest);
    }
    const now = performance.now();
    for (const c of [...this.cars.values()]) if (!c.e && !c.wreck) this.drop(c.n);   // the last host's: we don't know their roads (a wreck needs none)
    for (const c of this.cars.values()) {
      if (c.wreck) { this.crashing(c, dt, blast); continue; }
      const e = c.e;
      // as fast as the road allows, slowing in time for the next corner
      const turn = Math.acos(Math.max(-1, Math.min(1, e.dx * c.next.dx + e.dz * c.next.dz)));
      const corner = turn < 0.35 ? e.v : Math.max(2.5, Math.min(e.v, 11 * (1 - turn / Math.PI)));
      let want = Math.min(e.v, Math.sqrt(corner * corner + 2 * 3.5 * Math.max(0, e.len - c.s)));
      // and stopping for anything in its lane ahead
      let blocked = false, dodge = 0, committed = 0, squeeze = false;
      const obstacles: Obstacle[] = things.filter((o) => Math.abs(o.x - c.x) < 60 && Math.abs(o.z - c.z) < 60);   // (only what's near enough to matter)
      // (a wreck in the road is pulled round, like something parked)
      for (const o of this.cars.values()) if (o !== c) obstacles.push({ x: o.x, z: o.z, r: HL, a: o.a, parked: o.wreck, passing: !o.wreck && o.dodge > 0.5 && Math.cos(o.a - c.a) < -0.5 });
      // the cars parked round about (looked for a few times a second, not every frame)
      if ((c.parkedT -= dt) <= 0) {
        c.parkedT = 0.4;
        c.parked = this.map.parkedNear(c.x, c.z, 48).map((p) => ({ x: p.x, z: p.z, r: 2.05, parked: true, a: p.a }));
      }
      obstacles.push(...c.parked);
      const path = this.lanePath(c);
      // how far out to the side something parked reaches, turned as it is against the way we're going
      const side = (o: Obstacle) => o.a === undefined ? Math.min(o.r, 1.2) : Math.abs(Math.sin(o.a - c.a)) * o.r + Math.abs(Math.cos(o.a - c.a)) * 0.9;
      const seen = obstacles.map((o) => [...project(path, o.x, o.z), o] as [number, number, Obstacle]);
      // how far out it can pull: not past the far kerb, nor into anything on its right
      let room = e.room;
      // (anything coming the other way, further off: it's closing)
      for (const [u, w, o] of seen) if (w < -0.6 && u > -HL - o.r && u < (o.a !== undefined && !o.parked ? 45 : 25)) room = Math.min(room, -w - HW - side(o) - 0.4);
      for (const [u, w, o] of seen) {
        // u: how far along its way it is; w: how far to the left of its lane
        // something parked on our side: pull out round it, if there's room (slowing up behind it till it's out far enough)
        if (o.parked && u > -HL - o.r && u < 25 && w > -0.6) {
          const need = HW + side(o) + 0.4 - w;
          // already out and going past it: stay out, whatever's coming
          if (c.dodge >= need - 0.1 && u < HL + o.r + 2) { committed = Math.max(committed, need); continue; }
          // part way out and too close to stop: don't pull back in
          if (u < HL + o.r + 2 + (c.v * c.v) / 10) committed = Math.max(committed, Math.min(c.dodge, need));
          if (need <= room) { dodge = Math.max(dodge, need); if (c.dodge >= need - 0.1) continue; }
        }
        // someone coming the other way round something parked on their side: tuck in to let them by
        if (o.passing && u > 0 && u < 25) squeeze = true;
        if (u <= 0 || u > 30 || Math.abs(w + c.dodge) > HW + side(o) + (o.passing ? 0.15 : 0.3)) continue;
        // nose to nose with another car for ages: someone has to give, so squeeze by
        if (c.stuckT > 6 && o.a !== undefined && !o.parked && !o.id && Math.cos(o.a - c.a) < -0.5) continue;
        const gap = u - HL - o.r - 1.5;
        const ok = Math.sqrt(Math.max(0, 2 * 5 * gap));
        if (ok < want) { want = ok; if (ok < 1 && o.id) blocked = true; }
      }
      dodge = Math.max(0, committed, Math.min(dodge, room));
      if (squeeze && !dodge) dodge = -e.kerb;
      c.dodge += Math.max(-1.5 * dt, Math.min(1.5 * dt, dodge - c.dodge));
      c.blockT = blocked ? c.blockT + dt : 0;
      c.stuckT = c.v < 0.3 ? c.stuckT + dt : 0;
      // stuck a good while behind something that isn't going to move: turn round and go back
      if (c.stuckT > 8 && !blocked && c.e.back) {
        const lane = c.e.lane, d = c.dodge;
        c.e = c.e.back; c.s = c.e.len - c.s; c.prev = null; c.route = [];
        this.plan(c);
        c.dodge = 2 * lane - d;   // from where it was, over to its new lane
        c.stuckT = 0;
        this.place(c);            // (turned round on the spot: there's no room for a three-point turn with the road blocked)
        c.steer = 0;
      }
      c.horn = c.blockT > 1.2 && c.blockT % 2.5 < 0.7;
      const dv = want - c.v;
      c.v = Math.max(0, c.v + Math.max(-BRAKE * dt, Math.min(ACCEL * dt, dv)));
      c.gas = dv > 0.2 ? 1 : 0;
      // along the road, onto the next one at the end
      this.steerAlong(c, dt);
      while (c.s >= c.e.len) {
        c.s -= c.e.len;
        c.prev = c.e; c.e = c.route.shift()!;
        this.plan(c);
      }
      c.vx = c.v * Math.cos(c.a); c.vz = -c.v * Math.sin(c.a);
      // anyone it hits on foot goes under
      if (c.v > 3) {
        const gx = Math.cos(c.a), gz = -Math.sin(c.a);
        for (const o of things) {
          if (!o.person || !o.id) continue;
          const dx = o.x - c.x, dz = o.z - c.z, u = dx * gx + dz * gz, w = -dx * gz + dz * gx;
          if (Math.abs(u) > HL + 0.3 || Math.abs(w) > HW + 0.3 || now - (c.hits.get(o.id) ?? -1e9) < 1500) continue;
          c.hits.set(o.id, now);
          hit(o.id, c.v);
          c.v *= 0.8;
        }
      }
    }
  }

  // ---- wrecks ----------------------------------------------------------------------------------
  /** Host: player by has driven into car n, changing its speed by (dvx, dvz) m/s and its spin by spin rad/s. */
  shove(n: number, dvx: number, dvz: number, spin: number, by: string) {
    const c = this.cars.get(n);
    if (!c || (!c.e && !c.wreck) || ![dvx, dvz, spin].every(Number.isFinite)) return;
    const dv = Math.hypot(dvx, dvz), k = dv > 40 ? 40 / dv : 1;
    if (!c.wreck && dv < KNOCK) return;
    this.wrecked(c, dvx * k, dvz * k, Math.max(-6, Math.min(6, spin)), by);
  }

  /** Host: parked car i (its vehicle number), now out of the street furniture at (x, z) facing a, has been knocked by player by. */
  unparked(i: number, at: { x: number; z: number; a: number; paint: number }, dvx: number, dvz: number, spin: number, by: string) {
    if (this.cars.has(PARKED + i)) return;
    const c = this.parkedCar(i, at);
    c.wreck = true;
    this.shove(c.n, dvx, dvz, spin, by);
  }

  /** Someone here has knocked parked car i out of the street furniture: show it go straight away, till the host's word on it comes. */
  unparkedHere(i: number, at: { x: number; z: number; a: number; paint: number }, dvx: number, dvz: number, spin: number) {
    if (this.cars.has(PARKED + i)) return;
    const c = this.parkedCar(i, at);
    c.wreck = true;
    this.nudge(c.n, dvx, dvz, spin);
  }

  private parkedCar(i: number, at: { x: number; z: number; a: number; paint: number }): Car {
    const c = new Car(PARKED + i, at.paint, this.parkedMake(i));
    c.x = at.x; c.z = at.z; c.a = at.a; c.v = 0; c.y = this.ground(at.x, at.z);
    this.add(c);
    return c;
  }

  /** Someone here has just driven into car n: show it going the way they knocked it straight away, till the host's word on it catches up. */
  nudge(n: number, dvx: number, dvz: number, spin: number) {
    const c = this.cars.get(n);
    if (!c || (!c.wreck && Math.hypot(dvx, dvz) < KNOCK)) return;
    const g = c.guess ?? { x: c.x, z: c.z, a: c.a, y: c.y, vx: c.vx, vz: c.vz, spin: 0, roll: c.roll, rollV: 0, lift: c.lift, liftV: 0, t: 0 };
    g.t = performance.now();
    knock(g, dvx, dvz, spin);
    c.guess = g;
  }

  /** Host: car c's knocked off the road (or knocked again), and whoever did it is to blame for what it does next. */
  private wrecked(c: Car, dvx: number, dvz: number, spin: number, by: string) {
    if (!c.wreck) {
      c.wreck = true;
      c.v = 0; c.horn = false; c.gas = 0; c.steer = 0; c.blockT = 0;
    }
    c.stuckT = 0;
    if (by) c.by = by;
    knock(c, dvx, dvz, spin);
  }

  /** Host: a wreck for dt: sliding to a stop, knocking into the rest of the traffic, rolling, and going up if it's come to rest on its roof. */
  private crashing(c: Car, dt: number, blast: (x: number, y: number, z: number, by: string) => void) {
    // into another car: they both get knocked (equally heavy, so they share it)
    if (Math.hypot(c.vx, c.vz) > 1) for (const o of this.cars.values()) {
      if (o === c || Math.abs(o.x - c.x) > 6 || Math.abs(o.z - c.z) > 6 || Math.abs(o.y + o.lift - c.y - c.lift) > 1.5) continue;
      const t = contact(c, ALONG, HW, o);
      if (!t) continue;
      c.x += t.nx * t.depth / 2; c.z += t.nz * t.depth / 2;
      const vn = (c.vx - o.vx) * t.nx + (c.vz - o.vz) * t.nz;
      if (vn >= 0) continue;
      const dv = (-(1 + BOUNCE) * vn) / 2, I = CAR_MASS * (HL * HL + HW * HW) / 3;
      knock(c, t.nx * dv, t.nz * dv, 0);
      const spin = Math.max(-4, Math.min(4, (-dv * CAR_MASS * twist(o.x, o.z, t.px, t.pz, t.nx, t.nz)) / I * 0.6));
      if (o.wreck || dv > KNOCK) this.wrecked(o, -t.nx * dv, -t.nz * dv, spin, c.by);
      this.onCrunch?.(t.px, c.y + 0.6, t.pz, Math.min(1, -vn / 12));
    }
    const was = c.lift > 0 || c.liftV > 0;
    this.slide(c, dt, c, (m) => m instanceof Car);
    if (was && c.lift === 0 && c.liftV === 0) this.onCrunch?.(c.x, c.y + 0.4, c.z, 0.5);
    c.stuckT = Math.hypot(c.vx, c.vz) < 0.3 ? c.stuckT + dt : 0;
    // come to rest on its roof: it catches, and a moment later it goes up
    if (!c.fire && !c.lift && !c.liftV && Math.cos(c.roll) < -0.7) { c.fire = 1; c.fuse = 1.5 + Math.random() * 1.5; }
    if (c.fire === 1 && (c.fuse -= dt) <= 0) this.boom(c, blast);
  }

  /** Host: car c goes up. Everything near it gets caught (game.ts sorts out who's hurt), and the rest of the traffic's thrown about. */
  private boom(c: Car, blast: (x: number, y: number, z: number, by: string) => void) {
    c.fire = 2; c.burnT = BURN;
    c.mat.color.set(CHAR);
    c.liftV = Math.max(c.liftV, 3.5);   // it jumps with the blast
    const y = c.y + c.lift + 0.8;
    this.onBoom?.(c.x, y, c.z);
    blast(c.x, y, c.z, c.by);
    for (const o of this.cars.values()) {
      const dx = o.x - c.x, dz = o.z - c.z, d = Math.hypot(dx, dz);
      if (o === c || d > BLAST || d < 0.01) continue;
      const k = 14 * (1 - d / BLAST);
      this.wrecked(o, (dx / d) * k, (dz / d) * k, (Math.random() - 0.5) * 3, c.by);
      o.liftV = Math.max(o.liftV, k * 0.3);
    }
  }

  /**
   * Something off its wheels' line for dt (a wreck, or our guess at where we've knocked one): on its
   * wheels it rolls on and scrubs sideways, on its side or roof it scrapes to a stop; it bounces off
   * walls; and it rolls over until it comes down on whichever side's nearest. pass: movers it goes through.
   */
  private slide(w: Tumbling, dt: number, self: Car, pass: (m: Mover) => boolean) {
    const up = w.lift > 0 || w.liftV > 0;
    if (!up) {
      const c = Math.cos(w.a), s = Math.sin(w.a), wheels = Math.cos(w.roll) > 0.7;
      const vf = ease(w.vx * c - w.vz * s, (wheels ? 2.5 : 7) * dt), vl = ease(w.vx * s + w.vz * c, 8 * dt);
      w.vx = vf * c + vl * s; w.vz = -vf * s + vl * c;
      w.spin = ease(w.spin, (wheels ? 2.5 : 6) * dt);
    }
    w.x += w.vx * dt; w.z += w.vz * dt; w.a += w.spin * dt;
    const c = Math.cos(w.a), s = Math.sin(w.a);
    for (const k of ALONG) {
      const cx = w.x + k * c, cz = w.z - k * s, p = this.map.collide({ x: cx, z: cz }, w.y + w.lift, HW, self, pass);
      const bx = p.x - cx, bz = p.z - cz, d = Math.hypot(bx, bz);
      if (d < 1e-4) continue;
      w.x += bx; w.z += bz;
      const nx = bx / d, nz = bz / d, vn = w.vx * nx + w.vz * nz;
      if (vn < 0) { w.vx -= nx * vn * 1.3; w.vz -= nz * vn * 1.3; w.spin *= 0.7; }
    }
    w.roll += w.rollV * dt;
    if (up) {
      w.liftV -= 9.8 * dt;
      w.lift += w.liftV * dt;
      if (w.lift <= 0) {
        w.lift = 0;
        // still going over fast, it bounces and rolls on; otherwise it comes down on whichever side's nearest
        if (Math.abs(w.rollV) > 3.5) { w.liftV = Math.min(3, Math.abs(w.rollV) * 0.3); w.rollV *= 0.6; w.vx *= 0.85; w.vz *= 0.85; }
        else { w.liftV = 0; w.rollV = 0; }
      }
    } else {
      const q = Math.PI / 2;
      w.rollV = 0;
      w.roll += (Math.round(w.roll / q) * q - w.roll) * Math.min(1, dt * 8);
    }
    w.roll = Math.atan2(Math.sin(w.roll), Math.cos(w.roll));
  }

  /** A new car on a road a little way off from player p, going either way. */
  private spawn(p: { x: number; z: number }, nearest: (x: number, z: number) => number) {
    const near: Edge[] = [];
    for (let i = Math.floor((p.x - FAR) / CELL); i <= Math.floor((p.x + FAR) / CELL); i++)
      for (let j = Math.floor((p.z - FAR) / CELL); j <= Math.floor((p.z + FAR) / CELL); j++) near.push(...this.cells.get(this.cell(i * CELL, j * CELL)) ?? []);
    for (let tries = 0; tries < 30 && near.length; tries++) {
      const e = near[Math.floor(Math.random() * near.length)];
      const A = this.nodes[e.a], x = A.x + e.dx * e.len / 2, z = A.z + e.dz * e.len / 2, d = nearest(x, z);
      if (d < NEAR || d > FAR) continue;
      if ([...this.cars.values()].some((o) => Math.hypot(o.x - x, o.z - z) < 20) || this.map.parkedNear(x, z, 7).length) continue;
      const c = new Car(this.serial++, Math.floor(Math.random() * 90));   // its paint by number, in whichever colours its make comes in (paintFor)
      c.e = e; c.s = e.len / 2; c.v = e.v * 0.6;
      this.plan(c);
      c.a = Math.atan2(-e.dz, e.dx);
      this.place(c);
      this.add(c);
      return;
    }
  }

  /** Pick its roads ahead, far enough to see what's coming. */
  private plan(c: Car) {
    let ahead = c.e.len - c.s + c.route.reduce((t, r) => t + r.len, 0);
    while (ahead < 40 || !c.route.length) {
      const r = this.choose(c.route[c.route.length - 1] ?? c.e);
      c.route.push(r);
      ahead += r.len;
    }
  }

  /** The middle of its lane from where it is now to the end of its route, as points. */
  private lanePath(c: Car): number[][] {
    const pts = [[c.x + c.e.dz * c.dodge, c.z - c.e.dx * c.dodge]];
    const legs = [c.e, ...c.route];
    for (let k = 0; k < legs.length; k++) {
      const d = legs[k], B = this.nodes[d.b], o = miter(d, legs[k + 1] ?? d);
      pts.push([B.x + o[0], B.z + o[1]]);
    }
    return pts;
  }

  /** Which way next at the end of e: any road but back the way it came, unless it's a dead end. */
  private choose(e: Edge): Edge {
    const outs = this.nodes[e.b].out.filter((o) => o.b !== e.a);
    if (!outs.length) return e.back ?? e;
    // mostly straight on, sometimes a turning
    const w = outs.map((o) => 0.4 + Math.max(0, e.dx * o.dx + e.dz * o.dz));
    let r = Math.random() * w.reduce((s, x) => s + x, 0);
    for (let k = 0; k < outs.length; k++) if ((r -= w[k]) <= 0) return outs[k];
    return outs[outs.length - 1];
  }

  /** The middle of its lane (with however far out it's pulled) a distance ahead along its route, and the way the road runs there. */
  private laneAhead(c: Car, ahead: number): { x: number; z: number; dx: number; dz: number } {
    let e = c.e, s = c.s + ahead, prev = c.prev, k = 0;
    while (s > e.len && k < c.route.length) { s -= e.len; prev = e; e = c.route[k++]; }
    s = Math.min(s, e.len);
    const next = k < c.route.length ? c.route[k] : e, A = this.nodes[e.a];
    const f = s / e.len, o0 = miter(prev ?? e, e), o1 = miter(e, next);
    return { x: A.x + e.dx * s + o0[0] + (o1[0] - o0[0]) * f - e.dz * c.dodge, z: A.z + e.dz * s + o0[1] + (o1[1] - o0[1]) * f + e.dx * c.dodge, dx: e.dx, dz: e.dz };
  }

  /**
   * Drive it on for dt: the front wheels steer towards a point on its lane a little way ahead
   * (further the faster it's going), and the car turns about its back axle as a car does, so it
   * sweeps round a corner rather than pivoting on the spot. Where it is along its road is then
   * read back from where it's got to.
   */
  private steerAlong(c: Car, dt: number) {
    const look = Math.min(16, 5 + c.v * 0.7), t = this.laneAhead(c, look);
    const hx = Math.cos(c.a), hz = -Math.sin(c.a);
    const want = Math.atan2(-(t.z - c.z), t.x - c.x);
    let steer = Math.atan2(Math.sin(want - c.a), Math.cos(want - c.a));
    steer = Math.max(-LOCK, Math.min(LOCK, steer));
    c.steer += (steer - c.steer) * Math.min(1, dt * 8);
    // the back axle rolls straight on, the car turning about it at the rate the front wheels ask for
    const half = WB / 2;
    let rx = c.x - hx * half, rz = c.z - hz * half;
    rx += hx * c.v * dt; rz += hz * c.v * dt;
    c.a += ((c.v * Math.tan(c.steer)) / WB) * dt;
    c.a = Math.atan2(Math.sin(c.a), Math.cos(c.a));
    c.x = rx + Math.cos(c.a) * half; c.z = rz - Math.sin(c.a) * half;
    // where that leaves it along its road
    const e = c.e, A = this.nodes[e.a];
    c.s = Math.max(c.s, (c.x - A.x) * e.dx + (c.z - A.z) * e.dz);
    // (astray from its lane, say after turning round, it finds the lane again rather than wandering)
    const off = Math.hypot(c.x - t.x, c.z - t.z);
    if (off > 40) this.place(c);
  }

  /** Where it is on its road: in the left-hand lane, turning smoothly from one stretch to the next. */
  private place(c: Car) {
    const e = c.e, A = this.nodes[e.a];
    const f = c.s / e.len, o0 = miter(c.prev ?? e, e), o1 = miter(e, c.next);
    const x = A.x + e.dx * c.s + o0[0] + (o1[0] - o0[0]) * f, z = A.z + e.dz * c.s + o0[1] + (o1[1] - o0[1]) * f;
    // face the way it's going, easing round onto the next stretch near the end of this one
    const into = Math.max(0, 1 - (e.len - c.s) / 3) * 0.5, from = c.prev ? Math.max(0, 1 - c.s / 3) * 0.5 : 0;
    const hx = e.dx + (c.next.dx - e.dx) * into + ((c.prev?.dx ?? e.dx) - e.dx) * from;
    const hz = e.dz + (c.next.dz - e.dz) * into + ((c.prev?.dz ?? e.dz) - e.dz) * from;
    c.a = Math.atan2(-hz, hx);
    c.x = x - e.dz * c.dodge; c.z = z + e.dx * c.dodge;
  }

  private add(c: Car) {
    this.cars.set(c.n, c);
    this.scene.add(c.root);
    this.map.movers.push(c);
  }

  private drop(n: number) {
    const c = this.cars.get(n);
    if (!c) return;
    this.cars.delete(n);
    this.scene.remove(c.root);
    const k = this.map.movers.indexOf(c);
    if (k >= 0) this.map.movers.splice(k, 1);
    c.dispose();
  }

  /** Host: someone's pulled the driver out of car n. Where it was, its paint and its make, if it's still about. */
  take(n: number): { x: number; z: number; a: number; paint: number; make: number } | null {
    const c = this.cars.get(n);
    if (!c) return null;
    this.drop(n);
    return { x: c.x, z: c.z, a: c.a, paint: c.paint, make: c.make };
  }

  // ---- everyone else: the host's updates ------------------------------------------------------
  snapshot(): number[] {
    const q = (v: number) => Math.round(v * 100) / 100, s: number[] = [];
    for (const c of this.cars.values()) s.push(c.n, q(c.x), q(c.z), q(c.a), q(c.v), c.paint + (c.horn ? 100 : 0));
    return s;
  }

  /** How the wrecks are lying, to go with the snapshot: [n, vx, vz, roll, lift, fire] each (empty if there are none). */
  wrecks(): number[] {
    const q = (v: number) => Math.round(v * 100) / 100, s: number[] = [];
    for (const c of this.cars.values()) if (c.wreck) s.push(c.n, q(c.vx), q(c.vz), q(c.roll), q(c.lift), c.fire);
    return s;
  }

  applyWrecks(d: number[]) {
    if (!Array.isArray(d) || d.length % 6) return;
    for (let k = 0; k < d.length; k += 6) {
      const [n, vx, vz, roll, lift, fire] = d.slice(k, k + 6), c = this.cars.get(n);
      if (!c || ![vx, vz, roll, lift, fire].every(Number.isFinite)) continue;
      c.wreck = true;
      // landed with a crunch, caught fire, gone up
      if (c.wv[3] > 0.15 && lift < 0.05) this.onCrunch?.(c.x, c.y + 0.4, c.z, 0.5);
      if (fire === 2 && c.fire !== 2) {
        c.mat.color.set(CHAR);
        if (c.fire === 1) { c.burnT = BURN; this.onBoom?.(c.x, c.y + c.lift + 0.8, c.z); }
      }
      c.fire = fire;
      c.wv = [vx, vz, roll, lift];
    }
  }

  apply(d: number[]) {
    if (!Array.isArray(d) || d.length % STRIDE) return;
    const now = performance.now(), seen = new Set<number>();
    for (let k = 0; k < d.length; k += STRIDE) {
      const [n, x, z, a, v, pf] = d.slice(k, k + STRIDE);
      if (![n, x, z, a, v, pf].every(Number.isFinite)) continue;
      seen.add(n);
      let c = this.cars.get(n);
      if (!c) {
        c = new Car(n, pf % 100, n >= PARKED ? this.parkedMake(n - PARKED) : undefined); c.x = x; c.z = z; c.a = a; this.add(c);
        if (n >= PARKED) this.onUnpark?.(n - PARKED);   // a parked car knocked into the road: off the street with it
      }
      c.horn = pf >= 100;
      c.snaps.push({ t: now, x, z, a, v });
      if (c.snaps.length > 20) c.snaps.shift();
    }
    // (not one we've just knocked, that the host hasn't heard about yet)
    for (const [n, c] of [...this.cars]) if (!seen.has(n) && !(c.guess && now - c.guess.t < GUESS_END)) this.drop(n);
  }

  // ---- everyone: drawing ----------------------------------------------------------------------
  update(dt: number, host: boolean) {
    const t = performance.now() - DELAY;
    for (const c of this.cars.values()) {
      if (!host && c.snaps.length) {
        const S = c.snaps;
        let a = S[0], b = S[S.length - 1];
        for (let k = 0; k < S.length - 1; k++) if (S[k].t <= t && S[k + 1].t >= t) { a = S[k]; b = S[k + 1]; break; }
        if (t >= b.t) a = b;
        const f = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 1;
        c.x = a.x + (b.x - a.x) * f; c.z = a.z + (b.z - a.z) * f;
        c.a = a.a + Math.atan2(Math.sin(b.a - a.a), Math.cos(b.a - a.a)) * f;
        const v = a.v + (b.v - a.v) * f;
        c.gas = v > c.v + 0.01 ? 1 : 0;
        c.v = v;
      }
      if (!host) {
        // a wreck: rolling over as the host says, eased between its updates (and anything else back on its wheels)
        if (c.wreck) [c.vx, c.vz] = c.wv;
        else { c.vx = c.v * Math.cos(c.a); c.vz = -c.v * Math.sin(c.a); }
        c.roll += turnTo(c.roll, c.wreck ? c.wv[2] : 0) * Math.min(1, dt * 10);
        c.lift += ((c.wreck ? c.wv[3] : 0) - c.lift) * Math.min(1, dt * 10);
        c.roll = Math.atan2(Math.sin(c.roll), Math.cos(c.roll));
        // one we've just knocked: where we think it's going, till the host's word catches up
        const g = c.guess;
        if (g) {
          g.y = c.y;
          this.slide(g, dt, c, () => true);
          const f = Math.max(0, Math.min(1, (GUESS_END - (performance.now() - g.t)) / (GUESS_END - GUESS_HOLD)));
          c.x += (g.x - c.x) * f; c.z += (g.z - c.z) * f; c.a += turnTo(c.a, g.a) * f;
          c.vx += (g.vx - c.vx) * f; c.vz += (g.vz - c.vz) * f;
          c.roll += turnTo(c.roll, g.roll) * f; c.lift += (g.lift - c.lift) * f;
          c.roll = Math.atan2(Math.sin(c.roll), Math.cos(c.roll));
          if (f <= 0) c.guess = null;
        }
      }
      // the front wheels: turned with the steering (the host knows it; everyone else reads it off how
      // fast the car's heading is changing) and rolling with the road
      if (!host && !c.wreck && !c.guess) {
        const da = c.pa === null ? 0 : Math.atan2(Math.sin(c.a - c.pa), Math.cos(c.a - c.pa));
        const want = Math.max(-LOCK, Math.min(LOCK, Math.atan((da / Math.max(0.001, dt)) * WB / Math.max(1, c.v))));
        c.steer += (want - c.steer) * Math.min(1, dt * 6);
      }
      c.pa = c.a;
      c.rolled = (c.rolled + (c.v * dt) / 0.33) % (Math.PI * 2);
      for (const w of c.wheels) { w.rotation.y = c.steer; w.rotation.z = -c.rolled; }
      // sat on the ground, tilted with the slope
      const cs = Math.cos(c.a), sn = Math.sin(c.a), half = 1.3;
      // (the height it was at a frame ago lets it stay on a bridge deck or in a tunnel instead of dropping to the river bed)
      const was = c.top ? c.y : undefined;
      const hF = this.ground(c.x + cs * half, c.z - sn * half, was), hR = this.ground(c.x - cs * half, c.z + sn * half, was);
      c.y = (hF + hR) / 2;
      // rolled over about its middle, its lowest corner on the ground (or above it, in the air)
      const up = Math.abs(Math.cos(c.roll)), side = Math.abs(Math.sin(c.roll));
      c.top = c.y + c.lift + up * H + side * 2 * HW; c.waist = c.y + c.lift + up * 0.98 + side * HW;
      c.root.position.set(c.x, c.y + c.lift - H / 2 + up * H / 2 + side * HW, c.z);
      c.root.rotation.set(0, c.a, Math.atan((hF - hR) / (2 * half)), "YZX");
      c.tumble.rotation.x = c.roll;
      // alight: flames, and smoke going up (and a wisp still coming off it once it's burnt out)
      const alight = c.fire === 1 || c.burnT > 0;
      if (alight && !c.flames) c.root.add((c.flames = flames()));
      if (c.flames) {
        c.flames.visible = alight;
        if (alight) for (const f of c.flames.children) { const w = 0.8 + Math.random() * 0.4; f.scale.set(w, (c.fire === 1 ? 0.5 : 0.8) + Math.random() * 0.9, w); }
      }
      if (c.burnT > 0) c.burnT -= dt;
      if (c.fire && (c.smokeT -= dt) <= 0) {
        c.smokeT = alight ? 0.15 : 0.7;
        this.onSmoke?.(c.x + (Math.random() - 0.5) * 2, c.y + c.lift + 1.4, c.z + (Math.random() - 0.5) * 2, alight);
      }
      // four gears up to 30 mph
      const sp = Math.min(1, c.v / 14), g = Math.min(3, Math.floor(sp * 4));
      c.rpm += (0.25 + 0.75 * (sp * 4 - g) - c.rpm) * Math.min(1, dt * 6);
    }
  }

  /** A car that's stopped or crawling within reach of (x, z): its number and what it is. */
  nearest(x: number, z: number, y: number, reach: number): { n: number; name: string } | null {
    let best: { n: number; name: string } | null = null, bd = reach;
    for (const c of this.cars.values()) {
      if (c.wreck || c.v > 5 || Math.abs(c.y - y) > 2.5) continue;
      const cs = Math.cos(c.a), sn = Math.sin(c.a), dx = x - c.x, dz = z - c.z;
      const d = Math.hypot(Math.max(0, Math.abs(dx * cs - dz * sn) - HL), Math.max(0, Math.abs(dx * sn + dz * cs) - HW));
      if (d < bd) { bd = d; best = { n: c.n, name: c.name }; }
    }
    return best;
  }
}
