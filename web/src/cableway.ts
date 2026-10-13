// The cable car (laid out by tools/cableway.py): the line Curo proposed in 2017 from Mulberry Park
// down to Bath Spa, built. It's a jig-back, as theirs would have been: two big cabins on their own
// pair of ropes, one going down as the other comes up, passing halfway. From Mulberry Park it
// crosses Lyncombe Vale in one long span to a tower on Beechen Cliff, then drops past a second
// tower over Holloway to the river. Walk into a cabin at either station while its doors are open
// and it takes you across; you can stand on the roof too, if you don't mind the drop.
//
// Who decides what: nobody. The cabins run to a timetable worked out from the clock, like the
// trains, so every player sees them in the same place without anything going over the network.
// Riding one is like standing on a train's roof: it carries you along on your own screen.
import * as THREE from "three";
import { model, Part } from "./furniture";
import type { MapData, Mover } from "./map";
import { tex } from "./textures";

export interface CableData { n: string; st: [string, number, number][]; tw: [number, number][] }

const HANG = 8.5;                    // the ropes run this far above a cabin's floor
const LANE = 3.6;                    // each cabin's ropes this far either side of the middle of the line
const SAG = 0.02;                    // ropes sag this much of each span in the middle
const DOCK = 6;                      // a cabin stops this far into its station from the end of the line
const DECK = { back: 13, front: 15, hw: 8.5 };   // a station's platform, from the end of the line
const CAB = { hl: 4.2, hw: 1.9, h: 2.6 };         // a cabin: half its length and width, and its height inside
const TOWER = 3.3;                   // a tower's legs this far outside each cabin's ropes
const SPEED = 10, ACC = 0.6;         // m/s and m/s² (real jig-backs run at up to 12 m/s)
const DWELL = 30;                    // seconds at a station
const OPEN = [2, DWELL - 4];         // the doors open this long after arriving, and close this long before leaving
const CHIME = DWELL - 7;             // the chime before the doors close
const SOLID = 220;                   // cabins near enough to the player to be solid

/** The line on the ground: its stations, towers and ropes, worked out once the map's ground is known.
 *  Made by the map itself (map.ts), which clears trees, hedges and street furniture out of its way. */
export class CableLine {
  readonly name: string;
  readonly ax: number; readonly ay: number;        // the first station's end of the line (data coords)
  readonly ux: number; readonly uy: number;        // along the line, in data coords
  readonly len: number;
  readonly a: number;                              // the line's angle, as a mover's
  readonly stations: { name: string; s: number; dock: number; deck: number; low: number; dir: number; s0: number; s1: number }[];
  readonly towers: { s: number; base: number; top: number }[];
  private sup: { s: number; y: number }[];

  constructor(readonly d: CableData, private ground: (x: number, z: number) => number) {
    const [[n0, x0, y0], [n1, x1, y1]] = d.st;
    this.name = d.n;
    this.ax = x0; this.ay = y0;
    this.len = Math.hypot(x1 - x0, y1 - y0);
    this.ux = (x1 - x0) / this.len; this.uy = (y1 - y0) / this.len;
    this.a = Math.atan2(this.uy, this.ux);
    const g = (s: number, w: number) => { const p = this.at(s, w); return ground(p.x, p.z); };
    // each platform is level with the highest ground under it
    const station = (name: string, end: number, dir: number) => {
      const s0 = end - dir * DECK.back, s1 = end + dir * DECK.front;
      let deck = -Infinity, low = Infinity;
      for (let s = Math.min(s0, s1); s <= Math.max(s0, s1); s += 2) for (let w = -DECK.hw; w <= DECK.hw; w += 2) { const h = g(s, w); deck = Math.max(deck, h); low = Math.min(low, h); }
      return { name, s: end, dock: end + dir * DOCK, deck: deck + 0.3, low: low - 1, dir, s0: Math.min(s0, s1), s1: Math.max(s0, s1) };
    };
    this.stations = [station(n0, 0, 1), station(n1, this.len, -1)];
    this.towers = d.tw.map(([s, h]) => {
      const feet = [-1, 1].map((k) => g(s, k * (LANE + TOWER)));
      return { s, base: Math.min(...feet) - 1, top: g(s, 0) + h };
    });
    const [A, B] = this.stations;
    this.sup = [{ s: A.dock, y: A.deck + HANG }, ...this.towers.map((t) => ({ s: t.s, y: t.top })), { s: B.dock, y: B.deck + HANG }];
  }

  /** Scene position of a point s along the line and w to its right. */
  at(s: number, w: number) {
    const x = this.ax + this.ux * s + this.uy * w, y = this.ay + this.uy * s - this.ux * w;
    return { x, z: -y };
  }

  /** How high the ropes are (scene Y) s along the line: level through the stations, sagging between supports. */
  rope(s: number): number {
    const p = this.sup;
    if (s <= p[0].s) return p[0].y;
    for (let i = 1; i < p.length; i++) {
      if (s > p[i].s) continue;
      const a = p[i - 1], b = p[i], span = b.s - a.s, u = (s - a.s) / span;
      return a.y + (b.y - a.y) * u - 4 * SAG * span * u * (1 - u);
    }
    return p[p.length - 1].y;
  }

  /** Data coords of a point into the line's frame: s along it, w to its right. */
  frame(x: number, y: number) {
    const dx = x - this.ax, dy = y - this.ay;
    return { s: dx * this.ux + dy * this.uy, w: dx * this.uy - dy * this.ux };
  }

  /** Is data point (x, y) on a station's platform or a tower's footing (with m to spare)? */
  occupied(x: number, y: number, m = 0): boolean {
    const { s, w } = this.frame(x, y);
    if (this.stations.some((st) => s > st.s0 - m && s < st.s1 + m && Math.abs(w) < DECK.hw + m)) return true;
    return this.towers.some((t) => Math.abs(s - t.s) < 2 + m && Math.abs(w) < LANE + TOWER + 1.5 + m);
  }

  /** Clear the way: trees, hedges, walls and street furniture off the platforms and from round the
   *  towers, and trees that would reach a passing cabin. Done before the map is built from the data,
   *  for the first area and for each square of Bath as it loads (tiles.ts). */
  clear(d: MapData) {
    const z0 = d.t.z0;
    if (d.tr) d.tr = d.tr.filter(([x, y, z, sc]) => {
      if (this.occupied(x, y, 3 * sc)) return false;
      const { s, w } = this.frame(x, y);
      if (s < 0 || s > this.len || Math.abs(w) > LANE + CAB.hw + 1.5 + 3 * sc) return true;
      return z - z0 + 9 * sc < this.rope(s) - HANG - 2;
    });
    // the wood canopy (one leafy surface over the woods, see world.ts) is opened up over the
    // platforms and the towers, and wherever it would reach a passing cabin
    if (d.cn) {
      const C = d.cn, raw = atob(C.h), H = new Uint8Array(raw.length);
      for (let k = 0; k < raw.length; k++) H[k] = raw.charCodeAt(k);
      const reach = LANE + CAB.hw + 1.5 + C.step;
      let cut = false;
      for (let j = 0; j < C.ny; j++) for (let i = 0; i < C.nx; i++) {
        const h = H[j * C.nx + i];
        if (!h) continue;
        const x = C.x0 + i * C.step, y = C.y0 + j * C.step;
        const { s, w } = this.frame(x, y);
        let clear = this.occupied(x, y, C.step);
        if (!clear && s > -C.step && s < this.len + C.step && Math.abs(w) < reach)
          clear = this.ground(x, -y) + h + 1 > this.rope(Math.max(0, Math.min(this.len, s))) - HANG - 2;
        if (clear) { H[j * C.nx + i] = 0; cut = true; }
      }
      if (cut) { let out = ""; for (let k = 0; k < H.length; k++) out += String.fromCharCode(H[k]); C.h = btoa(out); }
    }
    if (d.sb) d.sb = d.sb.filter(([x, y, , sc]) => !this.occupied(x, y, 1 + 1.5 * sc));
    if (d.fx) d.fx = d.fx.filter((f) => !this.occupied(f[1] as number, f[2] as number, 1));
    if (d.gt) d.gt = d.gt.filter((q) => !this.occupied(+q[0], +q[1], 0.5) && !this.occupied(+q[2], +q[3], 0.5));
    // hedges, walls and fences are cut where they cross a platform
    const br: typeof d.br = [];
    for (const l of d.br ?? []) {
      let run: number[][] = [];
      for (const q of l.p) {
        if (this.occupied(q[0], q[1], 0.5)) { if (run.length > 1) br.push({ ...l, p: run }); run = []; }
        else run.push(q);
      }
      if (run.length === l.p.length) br.push(l);
      else if (run.length > 1) br.push({ ...l, p: run });
    }
    if (d.br) d.br = br;
  }

  /** The solid parts (data coords): the platforms to stand on, and the towers' legs. */
  solids(): { x: number; y: number; a: number; hl: number; hw: number; top: number; stand: boolean }[] {
    const out: ReturnType<CableLine["solids"]> = [];
    for (const st of this.stations) {
      for (const [s0, s1, w0, w1] of this.slabs(st)) {
        const p = this.at((s0 + s1) / 2, (w0 + w1) / 2);
        out.push({ x: p.x, y: -p.z, a: this.a, hl: (s1 - s0) / 2, hw: (w1 - w0) / 2, top: st.deck, stand: true });
      }
      for (const [s, w] of this.pillars(st)) { const q = this.at(s, w); out.push({ x: q.x, y: -q.z, a: this.a, hl: 0.3, hw: 0.3, top: st.deck + 12, stand: false }); }
    }
    for (const t of this.towers) for (const k of [-1, 1]) {
      const q = this.at(t.s, k * (LANE + TOWER));
      out.push({ x: q.x, y: -q.z, a: this.a, hl: 0.8, hw: 0.8, top: t.top, stand: false });
    }
    return out;
  }

  /** A station's platform, in pieces (s0, s1, w0, w1): solid behind the cabins, and either side of and
   *  between them in front, leaving a slot for each cabin to drop away through as it leaves. */
  slabs(st: CableLine["stations"][number]): number[][] {
    const gap = CAB.hl + 0.15, inner = LANE - CAB.hw - 0.15, outer = LANE + CAB.hw + 0.15;
    const [b0, b1] = st.dir > 0 ? [st.s0, st.dock - gap] : [st.dock + gap, st.s1];
    const [f0, f1] = st.dir > 0 ? [b1, st.s1] : [st.s0, b0];
    return [[b0, b1, -DECK.hw, DECK.hw], [f0, f1, -inner, inner], [f0, f1, outer, DECK.hw], [f0, f1, -DECK.hw, -outer]];
  }

  /** Where a station's roof pillars stand: s along the line and w across. */
  pillars(st: CableLine["stations"][number]): number[][] {
    const out: number[][] = [];
    for (const s of [st.s0 + 1, (st.s0 + st.s1) / 2, st.s1 - 1]) for (const w of [-DECK.hw + 0.6, DECK.hw - 0.6]) out.push([s, w]);
    return out;
  }
}

/** One of a cabin's solid parts: the floor, a wall or the roof. */
class Part_ implements Mover {
  x = 0; z = 0; y = 0; top = 0; waist = 0;
  constructor(public a: number, readonly hl: number, readonly hw: number, readonly du: number, readonly dw: number, readonly lo: number, readonly mid: number, readonly hi: number) {}
}

class Cabin {
  readonly group = new THREE.Group();
  readonly doors: THREE.Mesh[] = [];
  readonly floor: Part_;
  readonly parts: Part_[];
  readonly sides: Part_[];
  s = 0; y = 0; x = 0; z = 0;
  docked = -1;             // which station it's at, if it's at one
  open = 0;                // how far open the doors are, 0 to 1
  chimed = false;
  wasOpen = false;
  constructor(readonly lane: number, a: number) {
    const H = CAB.h, T = 0.12;
    this.floor = new Part_(a, CAB.hl, CAB.hw, 0, 0, -0.35, 0, 0);
    const ends = [-1, 1].map((k) => new Part_(a, T, CAB.hw, k * (CAB.hl - T), 0, 0, 1, H));
    this.sides = [-1, 1].map((k) => new Part_(a, CAB.hl, T, 0, k * (CAB.hw - T), 0, 1, H));
    // the roof is to stand on: its underside counts as out of reach, or a jump inside would put your head
    // in it and the roof would shove you out sideways (the ceiling stops you instead: see headroom)
    const roof = new Part_(a, CAB.hl, CAB.hw, 0, 0, H + 1.2, H + 0.2, H + 0.2);
    this.parts = [this.floor, ...ends, ...this.sides, roof];
  }
}

/** The cabins, ropes, towers and stations, and the timetable they run to. */
export class Cableway {
  readonly group = new THREE.Group();
  readonly cabins: Cabin[] = [];
  /** The solid parts of the cabins near the player: walls to bump into, and floors and roofs to stand on. */
  readonly near: Mover[] = [];
  private ride: number;          // seconds from one station to the other
  private period: number;

  constructor(readonly line: CableLine, scene: THREE.Scene) {
    const reach = line.stations[1].dock - line.stations[0].dock, ramp = SPEED / ACC;
    this.ride = reach > SPEED * ramp ? ramp * 2 + (reach - SPEED * ramp) / SPEED : 2 * Math.sqrt(reach / ACC);
    this.period = 2 * (this.ride + DWELL);
    this.build();
    const geo = cabinModel(), doorGeo = new THREE.BoxGeometry(1.3, CAB.h - 0.15, 0.06), mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const glassMat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.28, depthWrite: false });
    const doorMat = new THREE.MeshLambertMaterial({ color: "#c2382f" });
    for (const lane of [0, 1]) {
      const c = new Cabin(lane, line.a);
      const body = new THREE.Mesh(geo.body, mat);
      body.castShadow = true;
      c.group.add(body, new THREE.Mesh(geo.glass, glassMat));
      // two sliding doors on each side, meeting in the middle
      for (const side of [-1, 1]) for (const half of [-1, 1]) {
        const dm = new THREE.Mesh(doorGeo, doorMat);
        dm.userData = { side, half };
        c.doors.push(dm);
        c.group.add(dm);
      }
      c.group.rotation.y = line.a;
      this.cabins.push(c);
      this.group.add(c.group);
    }
    scene.add(this.group);
  }

  /** How far from the first station's dock a cabin has got, t seconds into a ride. */
  private along(t: number): number {
    const reach = this.line.stations[1].dock - this.line.stations[0].dock, T = this.ride;
    const ramp = Math.min(SPEED / ACC, T / 2), top = ACC * ramp;
    if (t <= ramp) return 0.5 * ACC * t * t;
    if (t >= T - ramp) { const r = T - t; return reach - 0.5 * ACC * r * r; }
    return 0.5 * ACC * ramp * ramp + top * (t - ramp);
  }

  /** Move the cabins to where the timetable says they are now. Returns any cabin whose doors have just
   *  started to open or close, or whose chime has just gone, near (px, pz), for the sounds. */
  update(px: number, pz: number, dt: number): { x: number; y: number; z: number; kind: "door" | "chime" }[] {
    const L = this.line, [A, B] = L.stations, now = this.tick(dt), events: ReturnType<Cableway["update"]> = [];
    this.near.length = 0;
    for (const c of this.cabins) {
      // the two cabins are half a round trip apart: one leaves the top as the other leaves the bottom
      const t = (((now + (c.lane * this.period) / 2) % this.period) + this.period) % this.period;
      const leg = this.ride + DWELL;
      let at: number;            // seconds into its stop at a station, if it's at one
      if (t < DWELL) { c.s = A.dock; c.docked = 0; at = t; }
      else if (t < leg) { c.s = A.dock + this.along(t - DWELL); c.docked = -1; at = -1; }
      else if (t < leg + DWELL) { c.s = B.dock; c.docked = 1; at = t - leg; }
      else { c.s = B.dock - this.along(t - leg - DWELL); c.docked = -1; at = -1; }
      const p = L.at(c.s, (c.lane ? 1 : -1) * LANE);
      c.x = p.x; c.z = p.z; c.y = L.rope(c.s) - HANG;
      c.group.position.set(c.x, c.y, c.z);
      // the doors take a second and a half to slide, worked out from the clock like everything else
      const want = at >= OPEN[0] && at < OPEN[1] ? 1 : 0;
      c.open = at < 0 ? 0 : Math.max(0, Math.min(1, (at - OPEN[0]) / 1.5, (OPEN[1] + 1.5 - at) / 1.5));
      for (const dm of c.doors) {
        const { side, half } = dm.userData as { side: number; half: number };
        dm.position.set(half * (0.65 + c.open * 1.3), CAB.h / 2, side * (CAB.hw + 0.02));
      }
      const near = Math.hypot(c.x - px, c.z - pz) < 40;
      if (want !== (c.wasOpen ? 1 : 0)) { c.wasOpen = !!want; if (near && at >= 0) events.push({ x: c.x, y: c.y + 1, z: c.z, kind: "door" }); }
      if (at >= CHIME && !c.chimed) { c.chimed = true; if (near) events.push({ x: c.x, y: c.y + 2, z: c.z, kind: "chime" }); }
      if (at < 0) c.chimed = false;
      // the solid parts: the doors are only solid when shut
      const cs = Math.cos(L.a), sn = Math.sin(L.a);
      for (const m of c.parts) {
        m.x = c.x + m.du * cs + m.dw * sn; m.z = c.z - m.du * sn + m.dw * cs;
        m.y = c.y + m.lo; m.waist = c.y + m.mid; m.top = c.y + m.hi;
      }
      if (Math.hypot(c.x - px, c.z - pz) < SOLID) for (const m of c.parts) if (c.open < 0.5 || !c.sides.includes(m)) this.near.push(m);
    }
    return events;
  }

  /** The timetable's clock, in seconds. It steps on by each frame's time, so the cabins move smoothly
   *  (the wall clock, read at whatever point in a frame the game gets round to it, would make anyone
   *  riding one see the world shake), and is eased back to the wall clock so everyone stays in step. */
  private clock = Date.now() / 1000;
  private tick(dt: number): number {
    const wall = Date.now() / 1000;
    this.clock += dt;
    const off = wall - this.clock;
    this.clock += Math.abs(off) > 1 ? off : off * Math.min(1, dt * 0.5);
    return this.clock;
  }

  /** The floor (or roof) of the cabin whose inside (or roof) you're in, even in mid-jump, so it keeps
   *  carrying you and doesn't leave you hanging in the air for its back wall to shove out of the window. */
  around(x: number, y: number, z: number): Mover | null {
    const cs = Math.cos(this.line.a), sn = Math.sin(this.line.a);
    for (const c of this.cabins) {
      const dx = x - c.x, dz = z - c.z, u = dx * cs - dz * sn, w = dx * sn + dz * cs;
      if (Math.abs(u) > CAB.hl || Math.abs(w) > CAB.hw || y < c.y - 0.5) continue;
      if (y < c.y + CAB.h) return c.floor;
      if (y < c.y + CAB.h + 4) return c.parts[c.parts.length - 1];
    }
    return null;
  }

  /** How high your feet can get in the cabin whose floor m is, before your head hits the ceiling. */
  headroom(m: Mover): number | null {
    return this.cabins.some((c) => c.floor === m) ? m.top + CAB.h - 1.8 : null;
  }

  /** Is m the floor of a cabin, and if so where's it heading? (For the toast when you get in.) */
  cabinOf(m: Mover): { docked: number; to: string } | null {
    const c = this.cabins.find((k) => k.floor === m);
    if (!c) return null;
    const st = this.line.stations;
    // at a station it's about to go to the other one; on the way, it's going wherever it's going
    const to = c.docked >= 0 ? st[1 - c.docked].name : st[0].name;
    return { docked: c.docked, to: c.docked >= 0 ? to : this.heading(c) };
  }

  private heading(c: Cabin): string {
    const now = this.clock, t = (((now + (c.lane * this.period) / 2) % this.period) + this.period) % this.period;
    return this.line.stations[t < this.ride + DWELL ? 1 : 0].name;
  }

  // ---- the stations, towers and ropes: built once ---------------------------------------------------
  private build() {
    const L = this.line, parts: Part[] = [];
    const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
    // everything here is laid out in the line's own frame (x along it, z to its right), then turned onto it
    const STEEL = "#7d838a", DARK = "#3b3f44", STONE = "#cdb98f", RED = "#b8312a";
    for (const st of L.stations) {
      const len = st.s1 - st.s0, mid = (st.s0 + st.s1) / 2, base = st.low;
      // the platform: Bath stone on a plinth down into the ground
      for (const [s0, s1, w0, w1] of L.slabs(st)) {
        parts.push([box(s1 - s0, st.deck - base, w1 - w0), STONE, (s0 + s1) / 2, (st.deck + base) / 2, (w0 + w1) / 2]);
        // a coping along the top, and coursing down the plinth, so it reads as stone and not a slab
        parts.push([box(s1 - s0 + 0.2, 0.18, w1 - w0 + 0.2), "#e2d4b0", (s0 + s1) / 2, st.deck - 0.09, (w0 + w1) / 2]);
        for (let y = st.deck - 0.8; y > base; y -= 0.6) parts.push([box(s1 - s0 + 0.04, 0.05, w1 - w0 + 0.04), "#a8956e", (s0 + s1) / 2, y, (w0 + w1) / 2]);
      }
      parts.push([box(len - 0.4, 0.06, 0.25), "#e4d27a", mid, st.deck + 0.03, -LANE + CAB.hw + 0.35]);   // mind the gap
      parts.push([box(len - 0.4, 0.06, 0.25), "#e4d27a", mid, st.deck + 0.03, LANE - CAB.hw - 0.35]);
      parts.push([box(len - 0.4, 0.06, 0.25), "#e4d27a", mid, st.deck + 0.03, -LANE - CAB.hw - 0.35]);
      parts.push([box(len - 0.4, 0.06, 0.25), "#e4d27a", mid, st.deck + 0.03, LANE + CAB.hw + 0.35]);
      // the roof over it all, on pillars, and the glass end where the cabins come in
      const roofY = st.deck + HANG + 2.2;
      for (const [s, w] of L.pillars(st)) parts.push([box(0.6, roofY - st.deck, 0.6), DARK, s, (st.deck + roofY) / 2, w]);
      parts.push([box(len + 1, 0.5, DECK.hw * 2 + 1), STEEL, mid, roofY + 0.25, 0]);
      parts.push([box(len + 0.6, 0.9, 0.3), RED, mid, roofY - 0.2, -DECK.hw - 0.4]);
      parts.push([box(len + 0.6, 0.9, 0.3), RED, mid, roofY - 0.2, DECK.hw + 0.4]);
      // the bullwheel house at the back, where the haul rope turns (and the drive, at the top)
      const back = st.dir > 0 ? st.s0 + 2 : st.s1 - 2;
      parts.push(...engineHouse(back, st.deck, roofY - 0.5, DECK.hw * 2 - 1, -st.dir));
      for (const k of [-1, 1]) parts.push([new THREE.CylinderGeometry(2.2, 2.2, 0.4, 20), DARK, back + st.dir * 2.3, st.deck + HANG, k * LANE]);
    }
    // the towers: a portal of two legs, with a crossarm carrying both cabins' ropes
    for (const t of L.towers) {
      const h = t.top - t.base, span = (LANE + TOWER) * 2;
      for (const k of [-1, 1]) {
        const leg = new THREE.CylinderGeometry(0.45, 1.1, h, 4).rotateY(Math.PI / 4);
        parts.push([leg, STEEL, t.s, t.base + h / 2, k * (LANE + TOWER)]);
        for (let y = t.base + 6; y < t.top - 4; y += 7) parts.push([box(0.25, 0.25, span), DARK, t.s, y, 0]);
      }
      parts.push([box(1.6, 1.4, span + 1.6), STEEL, t.s, t.top + 0.2, 0]);
      for (const k of [-1, 1]) parts.push([box(4, 0.5, 1.2), DARK, t.s, t.top + 0.9, k * LANE]);   // the saddles
      parts.push([box(0.15, 0.15, 1.2), RED, t.s, t.top + 1.4, 0]);   // the warning light
    }
    // the parts are in the line's frame: turn them onto it, at the first station's end
    const g = model(parts);
    g.rotateY(L.a);
    const o = L.at(0, 0);
    g.translate(o.x, 0, o.z);
    const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.castShadow = true; mesh.receiveShadow = true;
    this.group.add(mesh);
    // the station names, on both sides of the roof
    for (const st of L.stations) {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.2), new THREE.MeshBasicMaterial({ map: nameSign(st.name), transparent: false }));
      for (const k of [-1, 1]) {
        const m = sign.clone(), p = L.at((st.s0 + st.s1) / 2, k * (DECK.hw + 0.6));
        m.position.set(p.x, st.deck + HANG + 2, p.z);
        m.rotation.y = L.a + (k < 0 ? Math.PI : 0);
        this.group.add(m);
      }
    }
    // the ropes: two track ropes for each cabin, and the haul rope that pulls it, from bullwheel to bullwheel
    const pts: number[] = [];
    const [A, B] = L.stations;
    const ss: number[] = [];
    for (let s = A.s0 + 2; s < B.s1 - 2; s += 8) ss.push(s);
    ss.push(B.s1 - 2, ...L.towers.map((t) => t.s), A.dock, B.dock);
    ss.sort((a, b) => a - b);
    for (const lane of [-1, 1]) for (const [dw, dy] of [[-0.35, 0], [0.35, 0], [0, -0.9]]) {
      for (let i = 0; i < ss.length - 1; i++) {
        for (const s of [ss[i], ss[i + 1]]) {
          const p = L.at(s, lane * LANE + dw);
          pts.push(p.x, L.rope(s) + dy, p.z);
        }
      }
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    this.group.add(new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: "#26282b" })));
  }
}

/** A cabin, floor at y = 0, its length along x: cream and red, with the hanger up to the carriage that
 *  runs on the ropes; and its windows, apart, to be drawn see-through. The doorways in the middle of
 *  each side are left open for the doors. */
function cabinModel(): { body: THREE.BufferGeometry; glass: THREE.BufferGeometry } {
  const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
  const L = CAB.hl * 2, W = CAB.hw * 2, H = CAB.h, D = 1.3;     // D: half the doorway
  const CREAM = "#ece4cf", RED = "#b8312a", DARK = "#2c2f33", FLOOR = "#6b6660";
  const parts: Part[] = [
    [box(L, 0.4, W), RED, 0, -0.2, 0],                                 // the underframe
    [box(L - 0.1, 0.05, W - 0.1), FLOOR, 0, 0.03, 0],
    [box(0.1, 0.9, W), CREAM, -CAB.hl + 0.05, 0.45, 0],                // below the windows at the ends
    [box(0.1, 0.9, W), CREAM, CAB.hl - 0.05, 0.45, 0],
    [box(0.12, 0.35, W), RED, -CAB.hl + 0.05, H - 0.17, 0],            // and above them
    [box(0.12, 0.35, W), RED, CAB.hl - 0.05, H - 0.17, 0],
    [box(L + 0.1, 0.2, W + 0.1), CREAM, 0, H + 0.1, 0],               // the roof
    [box(1.8, 0.5, 1.4), DARK, 0, H + 0.45, 0],
    [box(0.35, HANG - H - 1.4, 0.35), DARK, 0, (H + HANG - 1.2) / 2, 0],   // the hanger
    [box(5, 0.7, 1.4), DARK, 0, HANG - 0.75, 0],                       // the carriage on the ropes
    [box(0.5, 0.6, 1.6), "#4a4e53", -2, HANG - 0.25, 0],
    [box(0.5, 0.6, 1.6), "#4a4e53", 2, HANG - 0.25, 0],
    [box(0.6, 0.06, 1.6), "#d8d2c0", -CAB.hl + 1, 0.5, 0],             // benches at the ends
    [box(0.6, 0.06, 1.6), "#d8d2c0", CAB.hl - 1, 0.5, 0],
  ];
  const glass: Part[] = [];
  const pane = H - 1.25, side = CAB.hl - D;
  for (const w of [-1, 1]) for (const u of [-1, 1]) {
    // each side is two lengths of wall either side of its doorway
    const mid = u * (D + side / 2), z = w * (CAB.hw - 0.05);
    parts.push([box(side, 0.9, 0.1), CREAM, mid, 0.45, z]);
    parts.push([box(side, 0.35, 0.12), RED, mid, H - 0.17, z]);
    glass.push([box(side, pane, 0.04), "#9fc3d6", mid, 0.9 + pane / 2, z]);
  }
  for (const u of [-1, 1]) glass.push([box(0.04, pane, W), "#9fc3d6", u * (CAB.hl - 0.05), 0.9 + pane / 2, 0]);
  // corner posts and the pillars beside the doors
  for (const u of [-CAB.hl + 0.08, -D - 0.07, D + 0.07, CAB.hl - 0.08]) for (const w of [-1, 1]) parts.push([box(0.14, H, 0.14), RED, u, H / 2, w * (CAB.hw - 0.05)]);
  return { body: model(parts), glass: model(glass) };
}

/** The engine house at the back of a station, where the haul rope turns round its wheel (and is
 *  driven, at the top): Bath stone, with a plinth, pilasters between tall windows on both faces, a
 *  door at the back, and a red cornice. Centred on x, its floor at y0, its top at y1, w wide; out_ is
 *  which way (along x) the back faces. */
function engineHouse(x: number, y0: number, y1: number, w: number, out_: number): Part[] {
  const box = (a: number, b: number, c: number) => new THREE.BoxGeometry(a, b, c);
  const D = 4, H = y1 - y0, mid = (y0 + y1) / 2;
  const STONE = "#d6c294", DARKER = "#b29f76", RED = "#b8312a", GLASS = "#33434d", FRAME = "#efe8d6";
  const out: Part[] = [
    [box(D, H, w), STONE, x, mid, 0],
    [box(D + 0.3, 1, w + 0.3), DARKER, x, y0 + 0.5, 0],                    // plinth
    [box(D + 0.4, 0.7, w + 0.4), RED, x, y1 - 0.35, 0],                    // cornice
    [box(D + 0.55, 0.15, w + 0.55), FRAME, x, y1 - 0.75, 0],
    [box(D + 0.2, 0.15, w + 0.2), FRAME, x, y0 + H * 0.45, 0],             // string course between the floors
  ];
  // the two long faces: pilasters, and a pair of tall windows in each bay
  const bays = Math.max(2, Math.round(w / 2.6)), bay = w / bays;
  for (const f of [-1, 1]) {
    const fx = x + f * (D / 2 + 0.06);
    for (let i = 0; i <= bays; i++) out.push([box(0.12, H - 1.6, 0.45), DARKER, fx, mid - 0.3, -w / 2 + i * bay]);
    for (let i = 0; i < bays; i++) {
      const z = -w / 2 + (i + 0.5) * bay;
      // the door, in the middle of the back face
      if (f === out_ && i === Math.floor(bays / 2)) {
        out.push([box(0.1, 2.5, 1.5), FRAME, fx, y0 + 1.25 + 1, z], [box(0.12, 2.3, 1.2), "#6e1f1a", fx, y0 + 1.15 + 1, z]);
      } else for (const [wy, wh] of [[y0 + 1.9 + 1.2, 2.4], [y0 + H * 0.45 + 2.2, 2.6]]) {
        out.push([box(0.08, wh + 0.3, bay * 0.55 + 0.3), FRAME, fx, wy, z], [box(0.1, wh, bay * 0.55), GLASS, fx, wy, z]);
        out.push([box(0.12, 0.08, bay * 0.55), FRAME, fx, wy + wh * 0.2, z]);      // glazing bar
      }
    }
  }
  // the ends: a round window high up
  for (const f of [-1, 1]) out.push([new THREE.CylinderGeometry(0.9, 0.9, 0.1, 16).rotateX(Math.PI / 2), GLASS, x, y0 + H * 0.7, f * (w / 2 + 0.05)]);
  return out;
}

/** A station's name board, white on dark red. */
function nameSign(text: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 80;
  const x = c.getContext("2d")!;
  x.fillStyle = "#8f2620"; x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = "#f4efe2"; x.font = "bold 46px sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
  x.fillText(`${text}`, c.width / 2, c.height / 2 + 2);
  return tex(c);
}
