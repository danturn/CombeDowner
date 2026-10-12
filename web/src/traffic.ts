// Traffic: cars that drive themselves round the streets near the players, keeping left, slowing for
// corners and stopping for anything in the road (and leaning on the horn if it's you). They run over
// anyone who steps out at the last moment, and you can pull the driver out of one that's stopped
// and drive off in it (it becomes a vehicle, vehicles.ts, numbered TRAFFIC_ID + its number).
//
// Who decides what: the host drives them all, spawning them on roads a little way off from the
// players and dropping them once everyone's far away, and sends where they are about 10 times a
// second. Everyone else draws them a moment behind, smoothed between updates, as for the chavs.
import * as THREE from "three";
import { CAR_PAINT, carGeometry } from "./furniture";
import { GameMap, Mover } from "./map";
import { MAKES } from "./vehicles";

/** A car taken from the traffic is vehicle TRAFFIC_ID + its number. */
export const TRAFFIC_ID = 100000;
const SPEED: Record<string, number> = { trunk: 13, primary: 13, secondary: 13, tertiary: 12, residential: 9, unclassified: 8, living_street: 5 };   // m/s: 30 mph, 20 mph
const WIDTH: Record<string, number> = { trunk: 9, primary: 8.5, secondary: 8, tertiary: 7, residential: 6, unclassified: 5.5, living_street: 5 }; // as world.ts draws them
const COUNT = 12;                    // cars about at once
const NEAR = 70, FAR = 220, GONE = 320;   // spawn between NEAR and FAR from the nearest player; gone past GONE
const HL = 2.08, HW = 0.88, H = 1.44;
const ACCEL = 2.5, BRAKE = 7;
const DELAY = 110;                   // ms behind the host, as for other players
const STRIDE = 6;                    // numbers per car in a snapshot

interface Edge { a: number; b: number; len: number; v: number; lane: number; room: number; kerb: number; dx: number; dz: number; back?: Edge }
interface Node { x: number; z: number; out: Edge[] }
interface Snap { t: number; x: number; z: number; a: number; v: number }
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
  blockT = 0;
  stuckT = 0;                        // how long it's been stood still
  dodge = 0;                         // how far out from its lane it's pulled, to get past something parked
  hits = new Map<string, number>();
  // everyone's
  snaps: Snap[] = [];
  readonly root = new THREE.Group();
  constructor(readonly n: number, readonly paint: number) {
    const body = new THREE.Mesh(carGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true, color: CAR_PAINT[paint % CAR_PAINT.length] }));
    body.castShadow = true; body.receiveShadow = true;
    this.root.add(body);
  }
  get name() { return MAKES[this.n % MAKES.length]; }
  dispose() { ((this.root.children[0] as THREE.Mesh).material as THREE.Material).dispose(); }
}

export class Traffic {
  private nodes: Node[] = [];
  private edges: Edge[] = [];
  private cars = new Map<number, Car>();
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
    for (const r of map.d.rd) {
      const v = SPEED[r.c];
      if (!v || r.p.length < 2) continue;
      const lane = Math.min(2, Math.max(1.2, (WIDTH[r.c] ?? 6) / 4));
      // how far it can pull out from its lane: up to the far kerb, and a wheel on the pavement
      const room = lane + (WIDTH[r.c] ?? 6) / 2 - HW + 0.3;
      // and how far in toward the kerb, to let someone by
      const kerb = Math.max(0, (WIDTH[r.c] ?? 6) / 2 - lane - HW + 0.3);
      for (let k = 0; k + 1 < r.p.length; k++) {
        const a = node(r.p[k]), b = node(r.p[k + 1]);
        if (a === b || this.nodes[a].out.some((e) => e.b === b)) continue;
        const A = this.nodes[a], B = this.nodes[b], len = Math.hypot(B.x - A.x, B.z - A.z);
        const there: Edge = { a, b, len, v, lane, room, kerb, dx: (B.x - A.x) / len, dz: (B.z - A.z) / len };
        const back: Edge = { a: b, b: a, len, v, lane, room, kerb, dx: -there.dx, dz: -there.dz, back: there };
        there.back = back;
        A.out.push(there); B.out.push(back);
        this.edges.push(there, back);
      }
    }
  }

  get list(): Iterable<Car> { return this.cars.values(); }

  // ---- the host: driving them ------------------------------------------------------------------
  /** Drive them all for dt. players: everyone's whereabouts, for where to put cars; things: what's in the road;
   * hit: someone on foot it's run over, at speed v (m/s). */
  simulate(dt: number, players: { x: number; z: number }[], things: Obstacle[], hit: (id: string, v: number) => void) {
    const nearest = (x: number, z: number) => players.reduce((m, p) => Math.min(m, Math.hypot(p.x - x, p.z - z)), Infinity);
    // gone once everyone's far away, or once it's been stuck a good while with nobody near enough to see it go
    for (const c of [...this.cars.values()]) if (nearest(c.x, c.z) > GONE || (c.stuckT > 20 && nearest(c.x, c.z) > 40)) this.drop(c.n);
    if (this.cars.size < COUNT && players.length && this.edges.length) this.spawn(nearest);
    const now = performance.now();
    for (const c of [...this.cars.values()]) if (!c.e) this.drop(c.n);   // the last host's: we don't know their roads
    for (const c of this.cars.values()) {
      const e = c.e;
      // as fast as the road allows, slowing in time for the next corner
      const turn = Math.acos(Math.max(-1, Math.min(1, e.dx * c.next.dx + e.dz * c.next.dz)));
      const corner = turn < 0.35 ? e.v : Math.max(2.5, Math.min(e.v, 11 * (1 - turn / Math.PI)));
      let want = Math.min(e.v, Math.sqrt(corner * corner + 2 * 3.5 * Math.max(0, e.len - c.s)));
      // and stopping for anything in its lane ahead
      let blocked = false, dodge = 0, committed = 0, squeeze = false;
      const obstacles: Obstacle[] = [...things];
      for (const o of this.cars.values()) if (o !== c) obstacles.push({ x: o.x, z: o.z, r: HL, a: o.a, passing: o.dodge > 0.5 && Math.cos(o.a - c.a) < -0.5 });
      for (const p of this.map.parkedNear(c.x, c.z, 42)) obstacles.push({ x: p.x, z: p.z, r: 2.05, parked: true, a: p.a });
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
      }
      c.horn = c.blockT > 1.2 && c.blockT % 2.5 < 0.7;
      const dv = want - c.v;
      c.v = Math.max(0, c.v + Math.max(-BRAKE * dt, Math.min(ACCEL * dt, dv)));
      c.gas = dv > 0.2 ? 1 : 0;
      // along the road, onto the next one at the end
      c.s += c.v * dt;
      while (c.s >= c.e.len) {
        c.s -= c.e.len;
        c.prev = c.e; c.e = c.route.shift()!;
        this.plan(c);
      }
      this.place(c);
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

  /** A new car on a road a little way off from the nearest player, going either way. */
  private spawn(nearest: (x: number, z: number) => number) {
    for (let tries = 0; tries < 30; tries++) {
      const e = this.edges[Math.floor(Math.random() * this.edges.length)];
      const A = this.nodes[e.a], x = A.x + e.dx * e.len / 2, z = A.z + e.dz * e.len / 2, d = nearest(x, z);
      if (d < NEAR || d > FAR) continue;
      if ([...this.cars.values()].some((o) => Math.hypot(o.x - x, o.z - z) < 20) || this.map.parkedNear(x, z, 7).length) continue;
      const c = new Car(this.serial++, Math.floor(Math.random() * CAR_PAINT.length));
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

  /** Host: someone's pulled the driver out of car n. Where it was, and its paint, if it's still about. */
  take(n: number): { x: number; z: number; a: number; paint: number } | null {
    const c = this.cars.get(n);
    if (!c) return null;
    this.drop(n);
    return { x: c.x, z: c.z, a: c.a, paint: c.paint };
  }

  // ---- everyone else: the host's updates ------------------------------------------------------
  snapshot(): number[] {
    const q = (v: number) => Math.round(v * 100) / 100, s: number[] = [];
    for (const c of this.cars.values()) s.push(c.n, q(c.x), q(c.z), q(c.a), q(c.v), c.paint + (c.horn ? 100 : 0));
    return s;
  }

  apply(d: number[]) {
    if (!Array.isArray(d) || d.length % STRIDE) return;
    const now = performance.now(), seen = new Set<number>();
    for (let k = 0; k < d.length; k += STRIDE) {
      const [n, x, z, a, v, pf] = d.slice(k, k + STRIDE);
      if (![n, x, z, a, v, pf].every(Number.isFinite)) continue;
      seen.add(n);
      let c = this.cars.get(n);
      if (!c) { c = new Car(n, pf % 100); c.x = x; c.z = z; c.a = a; this.add(c); }
      c.horn = pf >= 100;
      c.snaps.push({ t: now, x, z, a, v });
      if (c.snaps.length > 20) c.snaps.shift();
    }
    for (const n of [...this.cars.keys()]) if (!seen.has(n)) this.drop(n);
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
      // sat on the ground, tilted with the slope
      const cs = Math.cos(c.a), sn = Math.sin(c.a), half = 1.3;
      // (the height it was at a frame ago lets it stay on a bridge deck or in a tunnel instead of dropping to the river bed)
      const was = c.top ? c.y : undefined;
      const hF = this.ground(c.x + cs * half, c.z - sn * half, was), hR = this.ground(c.x - cs * half, c.z + sn * half, was);
      c.y = (hF + hR) / 2;
      c.top = c.y + H; c.waist = c.y + 0.98;
      c.root.position.set(c.x, c.y, c.z);
      c.root.rotation.set(0, c.a, Math.atan((hF - hR) / (2 * half)), "YZX");
      // four gears up to 30 mph
      const sp = Math.min(1, c.v / 14), g = Math.min(3, Math.floor(sp * 4));
      c.rpm += (0.25 + 0.75 * (sp * 4 - g) - c.rpm) * Math.min(1, dt * 6);
    }
  }

  /** A car that's stopped or crawling within reach of (x, z): its number and what it is. */
  nearest(x: number, z: number, y: number, reach: number): { n: number; name: string } | null {
    let best: { n: number; name: string } | null = null, bd = reach;
    for (const c of this.cars.values()) {
      if (c.v > 5 || Math.abs(c.y - y) > 2.5) continue;
      const cs = Math.cos(c.a), sn = Math.sin(c.a), dx = x - c.x, dz = z - c.z;
      const d = Math.hypot(Math.max(0, Math.abs(dx * cs - dz * sn) - HL), Math.max(0, Math.abs(dx * sn + dz * cs) - HW));
      if (d < bd) { bd = d; best = { n: c.n, name: c.name }; }
    }
    return best;
  }
}
