// The bus driver game. Take the wheel of a Badgerline bus or minibus and you're on a route: the 2
// (the bus station, Widcombe, Prior Park Road and Ralph Allen Drive, up to Combe Down) or the 4 (the
// bus station, through town and up Lansdown Road to Lansdown), whichever runs nearer, there and back
// and round again. The route's line is on the minimap and the big map, with its stops (the real ones,
// found as the squares of Bath round you load) and the next stop picked out in yellow.
//
// People wait at the stops along it: pull in by one and stop, and they get on, a fare each (the
// ticket machine going). Each is going a few stops. When theirs is next they ring the bell (ding
// ding, and BUS STOPPING lights up), and you have to stop at the next stop: they get off with a
// "Cheers drive". Go past it and they complain from the back until you next stop the bus, anywhere at
// all, and then they get off, calling you a numpty or worse. Drive past people waiting and they're
// left standing, and they let you know.
//
// Who decides what: all the driver's own. The routes come from the map everyone has, and the people
// on them are made up on the driver's machine: nothing goes over the network, so anyone riding along
// sees the bus stop and go but not the passengers. Get out and the shift's paused; get back in the
// same bus within two minutes and it carries on, otherwise the passengers wander off.
import * as THREE from "three";
import * as SFX from "./audio";
import { model, type Part } from "./furniture";
import type { GameMap } from "./map";
import { type BusLine, ROUTE } from "./minimap";
import { speechBubble } from "./naughtyboys";
import { speak } from "./posh";
import { show } from "./show";
import type { Traffic } from "./traffic";
import type { Stop, Vehicle } from "./vehicles";

/** The two routes, as the places they go through in turn (data metres east and north), out to the end and back. */
const ROUTES = [
  { n: "2", end: "Combe Down", via: [[-950, 1728], [-800, 1574], [-450, 1350], [-130, 880], [-60, 500], [11, 14], [-7, -339]] },
  { n: "4", end: "Lansdown", via: [[-950, 1728], [-826, 1850], [-832, 1990], [-880, 2200], [-985, 2270], [-1040, 2380], [-1170, 2490], [-1300, 3100], [-1700, 4170], [-3270, 5747]] },
];
const MAP = "combe-down";      // the map they're on
const HOME = "the Bus Station";
const ON_LINE = 25;            // metres off the route's line and you're still on it
const KERB = 14;               // a stop this far from the line, on the left, is on the route
const AT_STOP = 15;            // how far before or past a stop's flag the bus can pull in for it
const DOOR_REACH = 10;         // and how close the door has to be to it
const STOPPED = 0.6;           // m/s: stopped
const SEEN = 170;              // people at a stop are drawn this close
const KEEP = 120000;           // ms: a paused shift carries on if you get back in this soon
const WALK = 1.7;              // m/s, getting on and off

const CHEERS = ["Cheers drive!", "Cheers drive", "Ta, drive", "Cheers mate", "Lovely, cheers drive", "Ta-ra, drive", "Thanks drive, see you tomorrow"];
const MISSED = ["Oi! That was my stop!", "Drive! You've gone straight past it!", "I rang the bell, you numpty!", "Are you deaf, drive? That was my stop!", "Oi! I rang the flipping bell!"];
const MOAN = ["Let me off then!", "Unbelievable. Absolutely unbelievable", "I'll be late for my tea now", "Any chance of stopping, Lewis Hamilton?", "Oi, numpty! Stop the bus!", "I'm writing to Badgerline about this", "Pull over, you plonker!", "My nan drives better than you"];
const OFF = ["Cheers for nothing, drive", "I'll walk from here, you numpty", "Absolute muppet", "Call yourself a bus driver? Plonker", "Thanks for the scenic route, you wally", "Never again. Pillock", "Learn to drive, you donut"];
const LEFT = ["Oi! Come back!", "That's my bus!", "Typical", "Oh, you're having a laugh"];
const HELLO = ["Single please, drive", "Return to town, please", "Morning, drive", "All right, drive?", "Does this go to Combe Down?"];
const pick = <T>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];

/** A route worked out on the map: its line round the loop (out and back), and its stops along it as they're found. */
interface Line {
  n: string; end: string;
  pts: { x: number; z: number }[]; s: number[]; L: number; turn: number;
  grid: Map<string, number[]>;       // which stretches of the line pass through each 40 m square
  stops: RStop[]; seen: Set<string>;
  draw: number[][];
}
/** A stop on the route: where its flag is, how far round the loop, which way the road is from it and which way the bus goes. */
interface RStop { x: number; z: number; s: number; name: string; rx: number; rz: number; hx: number; hz: number; served: number; crowd: Person[] | null }
/** Someone drawn in the street: waiting at a stop, walking to the door, or getting off and walking away. */
interface Person { g: THREE.Group; x: number; z: number; tx: number; tz: number; delay: number; t: number; bubble?: THREE.Sprite; seed: number; say?: string }
/** Where a point is against a stretch of the line: how far along (0..1) and round the loop (s), how far off it, which side (+ is left) and which way it runs. */
interface Onto { t: number; d: number; side: number; hx: number; hz: number; s: number }
/** Someone on the bus: how many stops till theirs, and whether they've rung, or been carried past it. */
interface Rider { seed: number; going: number; bell: boolean; bellT: number; missed: boolean; moanT: number }

// ---- the people -----------------------------------------------------------------------------------

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
/** Coat, trousers, hair, skin, shoes, and anything they've got with them. */
const LOOKS: [string, string, string, string, string, "trolley" | "bag" | "vest" | ""][] = [
  ["#b7a27c", "#5b5148", "#d9d6cf", "#e2b896", "#3a2c22", "trolley"],   // a pensioner with her tartan trolley
  ["#2b3a63", "#24262b", "#3b2a1c", "#c99572", "#f2f2f2", "bag"],       // a student with a rucksack
  ["#5d6a3a", "#3e4554", "#6b4a2a", "#f0c8a8", "#1d1d1d", ""],          // in a parka
  ["#a8282e", "#2c2c34", "#c69a4e", "#e9c2a2", "#2a1d18", ""],          // in a red coat
  ["#3b3f45", "#2c3a5c", "#1c1612", "#8b5a3c", "#d8d4c8", "vest"],      // off to the building site
  ["#6a3d6e", "#1f2026", "#9a8f86", "#e2b896", "#40302a", "bag"],
];
let looks: THREE.BufferGeometry[] | null = null;
let skinMat: THREE.MeshLambertMaterial | null = null;
function lookGeo(k: number): THREE.BufferGeometry {
  looks ??= LOOKS.map(([coat, legs, hair, skin, shoes, extra]) => {
    const parts: Part[] = [
      [box(0.15, 0.8, 0.17), legs, -0.1, 0.42, 0], [box(0.15, 0.8, 0.17), legs, 0.1, 0.42, 0],
      [box(0.16, 0.07, 0.26), shoes, -0.1, 0.035, 0.04], [box(0.16, 0.07, 0.26), shoes, 0.1, 0.035, 0.04],
      [box(0.44, 0.64, 0.27), coat, 0, 1.12, 0],
      [box(0.12, 0.6, 0.13), coat, -0.29, 1.13, 0], [box(0.12, 0.6, 0.13), coat, 0.29, 1.13, 0],
      [box(0.1, 0.1, 0.1), skin, -0.29, 0.78, 0], [box(0.1, 0.1, 0.1), skin, 0.29, 0.78, 0],
      [box(0.1, 0.08, 0.1), skin, 0, 1.48, 0], [box(0.23, 0.25, 0.23), skin, 0, 1.63, 0], [box(0.25, 0.09, 0.25), hair, 0, 1.78, -0.01],
    ];
    if (extra === "trolley") parts.push([box(0.3, 0.42, 0.22), "#8a2a2a", 0.5, 0.42, 0.1], [box(0.31, 0.04, 0.23), "#2a4a3a", 0.5, 0.5, 0.1],
      [box(0.03, 0.4, 0.03), "#999", 0.5, 0.85, -0.02], [box(0.06, 0.12, 0.12), "#222", 0.5, 0.06, 0.1]);
    if (extra === "bag") parts.push([box(0.32, 0.4, 0.16), "#30343a", 0, 1.1, -0.2]);
    if (extra === "vest") parts.push([box(0.46, 0.4, 0.29), "#e8f02a", 0, 1.18, 0]);
    return model(parts);
  });
  return looks[k % looks.length];
}
function person(scene: THREE.Scene, seed: number): THREE.Group {
  skinMat ??= new THREE.MeshLambertMaterial({ vertexColors: true });
  const g = new THREE.Group(), m = new THREE.Mesh(lookGeo(seed), skinMat);
  m.castShadow = true;
  g.add(m);
  scene.add(g);
  return g;
}
function unsay(p: Person) {
  if (!p.bubble) return;
  p.g.remove(p.bubble);
  p.bubble.material.map?.dispose();
  p.bubble.material.dispose();
  p.bubble = undefined;
}
function gone(p: Person) { unsay(p); p.g.removeFromParent(); }

/** A stop's name as the timetable would have it: no bay letters, and a plain flag is a request stop. */
const stopName = (n: string) => (!n || /^bus stop$/i.test(n) ? "Request stop" : n.replace(/\s*\([A-Z][a-z]?\d?\)$/, ""));

// ---- the shift --------------------------------------------------------------------------------------

export class BusDriver {
  private lines: (Line | null)[] | null = null;
  private line: Line | null = null;
  private bus: Vehicle | null = null;
  private paused = 0;                 // when you got out (ms), or 0 if you're at the wheel
  private s = 0;                      // how far round the loop the bus is, and how far it's come in all
  private S = 0;
  private k = 0;                      // the stretch of line it's on
  private onLine = false;
  private next: RStop | null = null;
  private riders: Rider[] = [];
  private boarding: Person[] = [];    // walking to the door
  private walking: Person[] = [];     // got off, walking away
  private serving: RStop | null = null;
  private stillT = 0;                 // seconds stopped
  private scanT = 0;
  private said = ""; private saidT = 0;
  private fares = 0; private cheers = 0; private moans = 0;

  constructor(private map: GameMap, private scene: THREE.Scene, private traffic: Traffic, private ground: (x: number, z: number) => number,
    private toast: (text: string, secs?: number) => void) {}

  /** Every frame: v is the bus you're driving, if you're driving one. stops: every bus stop loaded just now. */
  update(dt: number, v: Vehicle | null, stops: () => Stop[]) {
    const now = performance.now();
    if (v && v !== this.bus) this.start(v);
    else if (v && this.paused) { this.paused = 0; this.toast(`Back at the wheel of the ${this.line!.n}`, 2.5); }
    else if (!v && this.bus && !this.paused) this.paused = now;
    if (this.paused && now - this.paused > KEEP) this.end();
    const line = this.line, bus = this.bus;
    this.walk(dt);
    if (!line || !bus) { show(card(), "", false); return; }
    if (this.paused) { show(card(), "", false); return; }
    if ((this.scanT -= dt) <= 0) { this.scanT = 1; this.find(line, stops()); }
    this.follow(line, bus);
    this.atStops(dt, line, bus);
    this.people(dt, line, bus);
    this.saidT -= dt;
    this.hud(line);
  }

  /** The route you're driving, for the maps: null when you're not. */
  route(): BusLine | null {
    const line = this.line;
    if (!line || this.paused) return null;
    return { pts: line.draw, colour: ROUTE, stops: line.stops.map((st) => ({ x: st.x, z: st.z, name: st.name, next: st === this.next })) };
  }

  // ---- the routes ------------------------------------------------------------------------------------

  /** Both routes, worked out the first time anyone takes a bus (null for one that can't be). */
  private routes(): (Line | null)[] {
    if (this.lines) return this.lines;
    return (this.lines = this.map.d.id !== MAP ? [] : ROUTES.map((r) => {
      const via = r.via.map(([x, y]) => ({ x, z: -y }));
      const out = this.traffic.way(via), back = this.traffic.way([...via].reverse());
      if (!out || !back || Math.hypot(out[0].x - via[0].x, out[0].z - via[0].z) > 60) return null;
      // the loop, with no stretch longer than 8 m (to follow the bus along it closely)
      const raw = [...out, ...back.slice(1)], pts: { x: number; z: number }[] = [];
      for (let i = 0; i < raw.length; i++) {
        const a = raw[i], b = raw[(i + 1) % raw.length], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 8));
        if (i === raw.length - 1 && Math.hypot(b.x - a.x, b.z - a.z) < 1) break;
        for (let k = 0; k < n; k++) pts.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n });
      }
      const s = [0];
      for (let i = 1; i <= pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i % pts.length].x - pts[i - 1].x, pts[i % pts.length].z - pts[i - 1].z));
      const L = s[pts.length], end = via[via.length - 1];
      let turn = 0, bd = Infinity;
      pts.forEach((p, i) => { const d = Math.hypot(p.x - end.x, p.z - end.z); if (d < bd) { bd = d; turn = s[i]; } });
      const grid = new Map<string, number[]>();
      pts.forEach((p, i) => {
        const q = pts[(i + 1) % pts.length];
        for (const [x, z] of [[p.x, p.z], [q.x, q.z]]) {
          const key = `${Math.floor(x / 40)},${Math.floor(z / 40)}`, at = grid.get(key) ?? grid.set(key, []).get(key)!;
          if (at[at.length - 1] !== i) at.push(i);
        }
      });
      return { n: r.n, end: r.end, pts, s, L, turn, grid, stops: [], seen: new Set(), draw: [...pts, pts[0]].map((p) => [p.x, p.z]) };
    }));
  }

  /** Stretches of the line near (x, z). */
  private near(line: Line, x: number, z: number): number[] {
    const out: number[] = [], ci = Math.floor(x / 40), cj = Math.floor(z / 40);
    for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) out.push(...line.grid.get(`${i},${j}`) ?? []);
    return out;
  }

  /** Where (x, z) is on stretch i: how far along it (0..1), how far off it, and which side (+ is left). */
  private onto(line: Line, i: number, x: number, z: number): Onto {
    const a = line.pts[i], b = line.pts[(i + 1) % line.pts.length], dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (l * l)));
    const px = a.x + dx * t, pz = a.z + dz * t;
    // left of (dx, dz), with x east and z south, is (dz, -dx)
    return { t, d: Math.hypot(x - px, z - pz), side: ((x - a.x) * dz - (z - a.z) * dx) / l, hx: dx / l, hz: dz / l, s: line.s[i] + l * t };
  }

  /** New stops loaded round you that are on the route: on its left, close to the line, and not one it has already. */
  private find(line: Line, stops: Stop[]) {
    let added = false;
    for (const st of stops) {
      const key = `${Math.round(st.x)},${Math.round(st.z)}`;
      if (line.seen.has(key)) continue;
      line.seen.add(key);
      let best: Onto | null = null;
      for (const i of this.near(line, st.x, st.z)) {
        const o = this.onto(line, i, st.x, st.z);
        // the flag on the left kerb, and not facing back the other way (a flag's own angle can be out)
        if (o.side < 1.5 || o.d > KERB || o.hx * Math.cos(st.a) - o.hz * Math.sin(st.a) < -0.3) continue;
        if (!best || o.d < best.d) best = o;
      }
      if (!best) continue;
      const name = stopName(st.n ?? ""), at = best.s;
      // a bus station's bays, or two flags at one stop: one stop
      if (line.stops.some((o) => Math.abs(o.s - at) < 40 || (o.name === name && Math.abs(o.s - at) < 80))) continue;
      line.stops.push({ x: st.x, z: st.z, s: at, name, rx: -best.hz, rz: best.hx, hx: best.hx, hz: best.hz, served: -Infinity, crowd: null });
      added = true;
    }
    if (added) line.stops.sort((a, b) => a.s - b.s);
  }

  // ---- the shift --------------------------------------------------------------------------------------

  private start(v: Vehicle) {
    this.end();
    const lines = this.routes().filter((l): l is Line => !!l);
    if (!lines.length) return;
    // the route that runs nearer (from the bus station, where both start, it depends on the bus)
    const dist = (l: Line) => l.pts.reduce((m, p) => Math.min(m, Math.hypot(p.x - v.x, p.z - v.z)), Infinity);
    const by = lines.map((l) => ({ l, d: dist(l) })).sort((a, b) => a.d - b.d);
    const line = by.length > 1 && by[1].d - by[0].d < 150 ? by[v.i % 2].l : by[0].l;
    this.line = line; this.bus = v; this.paused = 0;
    this.onLine = false; this.next = null; this.k = 0; this.S = 0;
    for (const st of line.stops) st.served = -Infinity;
    this.locate(line, v, true);
    this.fares = this.cheers = this.moans = 0;
    this.scanT = 0;
    this.toast(`You're on the ${line.n}: ${HOME} to ${line.end} and back. Follow the green line, and stop for anyone waiting`, 5);
  }

  private end() {
    if (this.bus && this.fares) this.toast(`Shift over: ${this.fares} fare${this.fares === 1 ? "" : "s"}, ${this.cheers} "cheers drive", ${this.moans} moan${this.moans === 1 ? "" : "s"}`, 4);
    for (const st of this.line?.stops ?? []) this.clear(st);
    for (const p of this.boarding) gone(p);
    this.boarding = [];
    this.riders = [];
    this.serving = null;
    this.bus = this.line = this.next = null;
    this.paused = 0;
    show(card(), "", false);
  }

  /** Where the bus is on the line. everywhere: look all round the loop (when it's lost its place). */
  private locate(line: Line, v: Vehicle, everywhere = false): boolean {
    const n = line.pts.length, hx = Math.cos(v.a), hz = -Math.sin(v.a);
    // the closest stretch, going the bus's way (strict: only those; else the other way counts 20 m further off)
    const closest = (list: number[], strict: boolean) => {
      let best: { i: number; o: Onto } | null = null, cost = Infinity;
      for (const i of list) {
        const o = this.onto(line, i, v.x, v.z), along = o.hx * hx + o.hz * hz;
        if (strict && along < 0.3) continue;
        const c = o.d + (along < 0 ? 20 : 0);
        if (c < cost) { cost = c; best = { i, o }; }
      }
      return best && best.o.d <= ON_LINE ? best : null;
    };
    const found = (everywhere ? null : closest(Array.from({ length: 71 }, (_, j) => (this.k + j - 10 + n) % n), false)) ?? closest(this.near(line, v.x, v.z), true);
    if (!found) return (this.onLine = false);
    let ds = found.o.s - this.s;
    if (ds > line.L / 2) ds -= line.L; else if (ds < -line.L / 2) ds += line.L;
    if (this.onLine) this.S += ds;
    this.s = found.o.s; this.k = found.i;
    return (this.onLine = true);
  }

  /** How far ahead round the loop a stop is: from just behind the bus (-AT_STOP) on round. */
  private ahead(line: Line, st: RStop) {
    return ((((st.s - this.s + AT_STOP) % line.L) + line.L) % line.L) - AT_STOP;
  }

  /** Keep the bus's place on the line, and see if it's gone past its next stop. */
  private follow(line: Line, v: Vehicle) {
    if (!this.locate(line, v, !this.onLine)) return;
    const was = this.next;
    if (was && this.S - was.served >= line.L / 2 && this.ahead(line, was) > line.L / 2) this.passed(was);
    // the next stop: the nearest ahead it hasn't just stopped at or gone past
    let next: RStop | null = null, nd = Infinity;
    for (const st of line.stops) {
      if (this.S - st.served < line.L / 2) continue;
      const a = this.ahead(line, st);
      if (a < nd) { nd = a; next = st; }
    }
    if (next !== this.next) {
      this.next = next;
      // whoever's stop it is now gets ready to ring
      for (const r of this.riders) if (!r.missed && r.going === 1 && !r.bell) r.bellT = 3 + Math.random() * 10;
    }
  }

  /** Gone past a stop without stopping. */
  private passed(st: RStop) {
    st.served = this.S;
    let carried = 0;
    for (const r of this.riders) {
      if (r.missed) continue;
      if (r.going > 1) { r.going--; continue; }
      r.missed = true; r.moanT = 6 + Math.random() * 5; carried++;
    }
    if (carried) {
      this.moans += carried;
      this.moan(pick(MISSED), 2);
      this.toast(`You went past ${st.name}! ${carried === 1 ? "Someone" : `${carried} people`} wanted to get off there`, 3);
    }
    const left = st.crowd?.length ?? 0;
    if (left) {
      this.toast(`You left ${left === 1 ? "someone" : left} standing at ${st.name}`, 3);
      const p = st.crowd![0];
      this.bubble(p, pick(LEFT));
      SFX.shout(Math.hypot(p.x - this.bus!.x, p.z - this.bus!.z), 0, p.seed);
    }
  }

  /** The bus stopped: at its next stop, people get off and on; anywhere at all, anyone carried past theirs gets off. */
  private atStops(dt: number, line: Line, v: Vehicle) {
    const still = Math.abs(v.speed) < STOPPED;
    this.stillT = still ? this.stillT + dt : 0;
    // drove off with people still walking to the door
    if (this.serving && Math.abs(v.speed) > 1.2) {
      const st = this.serving;
      this.serving = null;
      if (this.boarding.length) {
        this.toast(`You drove off and left ${this.boarding.length === 1 ? "someone" : this.boarding.length} at ${st.name}`, 3);
        this.bubble(this.boarding[0], "Oi! Wait!");
        for (const p of this.boarding) { p.tx = p.x; p.tz = p.z; }
        st.crowd = [...st.crowd ?? [], ...this.boarding];
        this.boarding = [];
      }
      SFX.busDoors();
    }
    if (this.stillT < 0.6 || this.serving) return;
    const st = this.next, door = this.door(v);
    if (st && this.onLine && Math.abs(this.ahead(line, st)) < AT_STOP && Math.hypot(door.x - st.x, door.z - st.z) < DOOR_REACH) {
      // pulled in at the stop: off get those whose stop it is (and anyone carried past theirs), on get those waiting
      this.serving = st;
      st.served = this.S;
      SFX.busDoors();
      const off = this.riders.filter((r) => r.missed || r.going === 1);
      this.riders = this.riders.filter((r) => !off.includes(r));
      for (const r of this.riders) r.going--;
      const said = off.map((r, k) => this.getOff(v, r, k, r.missed ? pick(OFF) : pick(CHEERS)));
      this.cheers += off.filter((r) => !r.missed).length;
      if (said.length) { this.said = said[0]; this.saidT = 4; }
      const room = (v.kind === "bus" ? 30 : 14) - this.riders.length;
      const crowd = st.crowd ?? [];
      this.boarding = crowd.slice(0, Math.max(0, room));
      st.crowd = crowd.slice(this.boarding.length);
      this.boarding.forEach((p, k) => { p.delay = 0.6 + k * 0.7; p.tx = door.x; p.tz = door.z; });
      if (st.crowd.length) this.toast("The bus is full", 2);
    } else if (this.riders.some((r) => r.missed) && this.stillT > 0.8) {
      // stopped anywhere: those you carried past their stop get off here, and tell you what they think of you
      SFX.busDoors();
      const off = this.riders.filter((r) => r.missed);
      this.riders = this.riders.filter((r) => !r.missed);
      this.said = off.map((r, k) => this.getOff(v, r, k, pick(OFF)))[0]; this.saidT = 4;
      this.serving = { x: v.x, z: v.z, s: this.s, name: "the side of the road", rx: 0, rz: 0, hx: 0, hz: 0, served: this.S, crowd: null };
    }
  }

  /** The door, by the driver on the kerb side: the front of the bus, on its left. */
  private door(v: Vehicle) {
    const hx = Math.cos(v.a), hz = -Math.sin(v.a), lx = hz, lz = -hx;
    return { x: v.x + hx * (v.hl - 1.1) + lx * (v.hw + 0.5), z: v.z + hz * (v.hl - 1.1) + lz * (v.hw + 0.5), lx, lz };
  }

  /** Someone gets off (the k-th in turn), and says their piece as they go: what they say. */
  private getOff(v: Vehicle, r: Rider, k: number, say: string): string {
    const d = this.door(v), off = (k - 1) * 1.5;
    const p: Person = { g: person(this.scene, r.seed), x: d.x, z: d.z, tx: d.x + d.lx * 3 + Math.cos(v.a) * off, tz: d.z + d.lz * 3 - Math.sin(v.a) * off, delay: k * 0.8, t: 7, seed: r.seed, say };
    p.g.visible = false;
    this.walking.push(p);
    return say;
  }

  /** A speech bubble over someone's head, and them saying it. */
  private bubble(p: Person, text: string) {
    unsay(p);
    p.bubble = speechBubble(text);
    p.bubble.position.y = 2.05;
    p.g.add(p.bubble);
    if (this.bus) speak(text, p.seed, Math.hypot(p.x - this.bus.x, p.z - this.bus.z) * 0.5);
  }

  /** Someone on the bus has something to say. */
  private moan(text: string, distance = 4) {
    this.said = text; this.saidT = 4;
    speak(text, Math.floor(Math.random() * 1000), distance);
    const el = card();
    el.classList.remove("fresh"); void el.offsetWidth; el.classList.add("fresh");
  }

  private clear(st: RStop) {
    for (const p of st.crowd ?? []) gone(p);
    st.crowd = null;
  }

  /** The people at the stops ahead, getting on, ringing the bell and moaning. */
  private people(dt: number, line: Line, v: Vehicle) {
    // waiting at the next few stops, when you're near enough to see them; gone from those left behind
    const soon = new Set(line.stops.filter((st) => this.S - st.served >= line.L / 2).sort((a, b) => this.ahead(line, a) - this.ahead(line, b)).slice(0, 3));
    for (const st of line.stops) {
      const d = Math.hypot(st.x - v.x, st.z - v.z);
      if (st.crowd && d > SEEN + 40 && !soon.has(st)) this.clear(st);
      if (st.crowd || !soon.has(st) || d > SEEN || st === this.serving) continue;
      const big = st.name.includes("Bus Station"), r = Math.random();
      const n = big ? 2 + Math.floor(r * 4) : r < 0.3 ? 0 : r < 0.65 ? 1 : r < 0.9 ? 2 : 3;
      st.crowd = [];
      for (let k = 0; k < n; k++) {
        const seed = Math.floor(Math.random() * 1e6), along = (k - (n - 1) / 2) * 0.9, back = 1.2 + (k % 2) * 0.5;
        const x = st.x - st.rx * back + st.hx * along, z = st.z - st.rz * back + st.hz * along;
        st.crowd.push({ g: person(this.scene, seed), x, z, tx: x, tz: z, delay: 0, t: 0, seed });
      }
    }
    for (const st of line.stops) for (const p of st.crowd ?? []) this.pose(p, 0, st.rx, st.rz);
    // walking to the door, and on
    const door = this.door(v);
    for (const p of [...this.boarding]) {
      if ((p.delay -= dt) > 0) { this.pose(p, 0, door.x - p.x, door.z - p.z); continue; }
      p.tx = door.x; p.tz = door.z;
      const dx = p.tx - p.x, dz = p.tz - p.z, d = Math.hypot(dx, dz);
      if (d < 0.6) {
        gone(p);
        this.boarding.splice(this.boarding.indexOf(p), 1);
        const going = 1 + Math.floor(Math.random() * Math.random() * 6);
        this.riders.push({ seed: p.seed, going, bell: false, bellT: going === 1 ? 4 + Math.random() * 8 : 0, missed: false, moanT: 0 });
        this.fares++;
        SFX.ticket();
        if (Math.random() < 0.3) { this.said = pick(HELLO); this.saidT = 3; }
        continue;
      }
      const step = Math.min(d, WALK * dt);
      p.x += (dx / d) * step; p.z += (dz / d) * step;
      this.pose(p, 1, dx, dz);
    }
    // the bell: whoever's stop is next rings it as it comes up (a few seconds into its last 350 m, or 140 m out at the latest)
    const ahead = this.next && this.onLine ? this.ahead(line, this.next) : Infinity;
    for (const r of this.riders) {
      if (r.missed) {
        if ((r.moanT -= dt) <= 0) { r.moanT = 8 + Math.random() * 6; this.moan(pick(MOAN), 6); }
        continue;
      }
      if (r.going !== 1 || r.bell || Math.abs(v.speed) < STOPPED) continue;
      if (ahead < 350 && ((r.bellT -= dt) <= 0 || ahead < 140)) {
        if (!this.riders.some((o) => o.bell && !o.missed)) SFX.busBell();
        r.bell = true;
      }
    }
  }

  /** Those who've got off walking away, saying their piece. */
  private walk(dt: number) {
    for (const p of [...this.walking]) {
      if ((p.delay -= dt) > 0) continue;
      if (!p.g.visible) { p.g.visible = true; if (p.say) this.bubble(p, p.say); }
      if ((p.t -= dt) <= 0) { gone(p); this.walking.splice(this.walking.indexOf(p), 1); continue; }
      const dx = p.tx - p.x, dz = p.tz - p.z, d = Math.hypot(dx, dz);
      if (d > 0.05) { const step = Math.min(d, WALK * dt); p.x += (dx / d) * step; p.z += (dz / d) * step; }
      if (p.bubble && p.t < 3) unsay(p);
      this.pose(p, d > 0.05 ? 1 : 0, dx, dz);
    }
  }

  /** Stand someone at their spot facing (fx, fz), bobbing along if they're walking. */
  private pose(p: Person, moving: number, fx: number, fz: number) {
    const t = performance.now() / 1000;
    p.g.position.set(p.x, this.ground(p.x, p.z) + (moving ? Math.abs(Math.sin(t * 9 + p.seed)) * 0.05 : 0), p.z);
    if (fx || fz) p.g.rotation.y = Math.atan2(fx, fz);
  }

  // ---- the card -------------------------------------------------------------------------------------

  private hud(line: Line) {
    const st = this.next, bell = this.riders.some((r) => r.bell && !r.missed);
    const to = this.onLine && this.s >= line.turn ? HOME.replace("the ", "") : line.end;
    let where: string;
    if (!this.onLine) where = `Off your route: back to the <b>green line</b>`;
    else if (!st) where = "Next stop coming up";
    else {
      const a = this.ahead(line, st);
      where = `Next stop: <b>${esc(st.name)}</b>${a > 30 ? ` · ${a < 1000 ? `${Math.round(a / 10) * 10} m` : `${(a / 1000).toFixed(1)} km`}` : ""}`;
    }
    const waiting = st?.crowd?.length ?? 0;
    const html = `<div class="label">Badgerline · Route ${line.n}</div><div class="bustitle">${esc(to)}</div>`
      + `<div class="busline">${where}</div>`
      + (waiting && this.onLine ? `<div class="busline">${waiting} waiting there</div>` : "")
      + (bell ? `<div class="bussign">Bus stopping</div>` : "")
      + `<div class="busstat">On board ${this.riders.length} · Fares ${this.fares} · Moans ${this.moans}</div>`
      + (this.saidT > 0 && this.said ? `<em>“${esc(this.said)}”</em>` : "");
    show(card(), html, true);
  }
}

const card = () => document.getElementById("buscard")!;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
