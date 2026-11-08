// The bus driver game. Take the wheel of a Badgerline bus or minibus and you're on a route: the 2, as
// it really runs, a loop from the bus station (out by Widcombe, Prior Park Road, Ralph Allen Drive and
// The Avenue, through Combe Down to Fox Hill and round Queen's Drive, and back by Bradford Road and
// North Road), or the 4 (the bus station, through town and up Lansdown Road to Lansdown, there and
// back), whichever runs nearer, and round again. The route's line is on the minimap and the big map, with its stops (the real ones,
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
//
// The shift wears the shared mission screens (missionscreens.ts): a title card as it starts, the
// route's status panel while you drive, and a short result card when it's over.
//
// The timetabled run is a job, taken at the bus station: a beacon on the pavement by the stands, marked on
// the maps, where E takes a job as a driver. You're put at the wheel of a bus at the start of the
// route, facing the way it goes, at the station's stand (sometimes with people waiting to get on), and
// it's a timetabled run: out to the end of the route and
// back, calling at every stop, with the timetable to keep to. It's in real minutes and seconds (a game
// minute is only a real second, so a run would take hours of game time) and allows a steady pace
// between stops and a little time at each. Get to a stop early and you wait there till it's time to go,
// with the countdown on the panel and a ding when it's time; leave early and it costs you. Run late
// and that costs you too, the later the more, and so does missing a stop. You start with 100 points,
// and back at the station what's left decides the prizes: the more on time, the more you get (TIERS).
import * as THREE from "three";
import * as SFX from "./audio";
import { model, type Part } from "./furniture";
import type { GameMap } from "./map";
import { type BusLine, ROUTE } from "./minimap";
import { speechBubble } from "./naughtyboys";
import { speak } from "./posh";
import { esc } from "./hudkit";
import { missionBegin, missionClear, missionProgress, missionResult } from "./missionscreens";
import { earn } from "./wardrobe";
import { seatedGeometry } from "./businside";
import { beacon } from "./beacon";
import type { Traffic } from "./traffic";
import type { Stop, Vehicle } from "./vehicles";

/** First's route 2 as it really runs, round from the bus station and back (OpenStreetMap's route 18468181,
 *  "Bus 2: City Centre ↔ Fox Hill"): out by Widcombe, Prior Park Road, Ralph Allen Drive, The Avenue,
 *  Church Road and Combe Road, through Combe Down to Fox Hill and round Queen's Drive and Hawthorn Grove,
 *  and back by Bradford Road and North Road. A point every 60 m or so, data metres east and north. */
const ROUTE_2 = "-944,1726,-1006,1730,-1058,1702,-1023,1652,-976,1619,-912,1618,-845,1597,-774,1590,-721,1576,-646,1564,-581,1562,-530,1482,-499,1430,-466,1376,-392,1260,-362,1173,-306,1128,-253,1094,-156,998,-86,898,-62,820,-74,675,-55,481,-50,417,-58,316,-41,256,-13,182,9,26,-11,-61,-47,-145,-74,-209,-99,-265,-122,-321,-152,-353,-225,-375,-300,-395,-361,-372,-412,-316,-452,-259,-549,-258,-603,-256,-632,-134,-657,-47,-696,-29,-789,-35,-785,25,-781,98,-836,132,-910,136,-970,122,-993,-15,-1003,-82,-1055,-192,-1051,-253,-947,-236,-876,-236,-816,-241,-799,-138,-792,-66,-744,-39,-683,-25,-648,-78,-610,-206,-579,-254,-475,-238,-326,-166,-225,-113,-156,-76,-65,-25,-1,9,-2,125,-29,223,-54,288,-53,375,-52,447,-75,645,-59,782,-66,850,-146,986,-222,1063,-279,1114,-335,1140,-371,1216,-439,1337,-499,1430,-530,1482,-567,1543,-540,1594,-535,1644,-593,1621,-652,1611,-712,1603,-771,1577,-831,1579,-891,1604,-990,1610,-1055,1622,-1120,1632,-1092,1664,-1077,1711,-1128,1739,-1114,1804,-1058,1819,-1018,1771,-1020,1713,-977,1693,-919,1713,-944,1726".split(",").map(Number).reduce((a: number[][], v, i, all) => (i % 2 ? a : [...a, [v, all[i + 1]]]), []);
/** The routes, as the places they go through in turn (data metres east and north): out to the end and
 *  back the same way, or (loop) right round, the way back being its own. */
const ROUTES: { n: string; end: string; via: number[][]; loop?: boolean }[] = [
  { n: "2", end: "Fox Hill", via: ROUTE_2, loop: true },
  { n: "4", end: "Lansdown", via: [[-950, 1728], [-826, 1850], [-832, 1990], [-880, 2200], [-985, 2270], [-1040, 2380], [-1170, 2490], [-1300, 3100], [-1700, 4170], [-3270, 5747]] },
];
const MAP = "combe-down";      // the map they're on
/** Where each route runs on a map (scene x, z), for the zones to open them once one is open all the way (zones.ts). */
export const busRouteSpots = (mapId: string): [number, number][][] => (mapId === MAP ? ROUTES.map((r) => r.via.map(([x, y]) => [x, -y] as [number, number])) : []);
const HOME = "the Bus Station";
/** The timetabled run (TIMED): where it starts (scene x, z, the bus station, where both routes begin) and how near to it. */
const STATION = { x: -950, z: -1728, r: 140 };
const LEAD = 20;               // seconds from taking the wheel to the first departure
const SPEED = 8.5;             // m/s: the timetable's pace between stops
const DWELL = 10;              // seconds it allows at each stop
const GRACE = 15;              // seconds late that still counts as on time
/** Points for a timetabled run, and the prizes: each tier gets its own and those below it. */
const TIERS: { at: number; medal: string; id: string }[] = [
  { at: 50, medal: "Bronze", id: "cashbag" }, { at: 75, medal: "Silver", id: "whistle" }, { at: 90, medal: "Gold", id: "inspcap" },
];
const clockOf = (secs: number) => { const t = Math.max(0, Math.round(secs)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; };
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
/** The same people, sat down on the bus (businside.ts). */
const sat = new Map<number, THREE.BufferGeometry>();
function seatedLook(seed: number): THREE.BufferGeometry {
  const k = seed % LOOKS.length;
  let g = sat.get(k);
  if (!g) sat.set(k, (g = seatedGeometry(...LOOKS[k])));
  return g;
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
  /** The timetabled run, if this is one: when it began (s), the points lost and what for, stops called at so
   *  far, and while you're at a stop, when you're due away from it. */
  private timed: { t0: number; lost: number; late: number; early: number; missed: number; calls: number; away: number; rung: boolean } | null = null;
  private finished: Vehicle | null = null;   // the bus you finished a timetabled run in: no new shift till you get out
  private job = false;                       // you've taken a job at the depot: the next bus you're put in is a timetabled run
  /** The depot: where you take a job as a driver, on the pavement by the bus station's stands (scene), and its beacon. */
  private depot: { x: number; y: number; z: number; beacon: ReturnType<typeof beacon> } | null = null;
  private depotNew = false;
  private depotT = 0;
  private seated = "";   // who's sat inside the bus as drawn, by their seeds
  private boarding: Person[] = [];    // walking to the door
  private walking: Person[] = [];     // got off, walking away
  private serving: RStop | null = null;
  private stillT = 0;                 // seconds stopped
  private scanT = 0;
  private said = ""; private saidT = 0;
  private fares = 0; private cheers = 0; private moans = 0;
  private stranded = 0;               // people left at a stop this shift

  constructor(private map: GameMap, private scene: THREE.Scene, private traffic: Traffic, private ground: (x: number, z: number) => number,
    private toast: (text: string) => void) {}

  // ---- the depot ---------------------------------------------------------------------------------------

  /** Where you take a job as a driver, once the bus station's square has loaded. */
  spot(): { x: number; z: number } | undefined { return this.depot ?? undefined; }
  /** True once, when the depot's first found (for the maps). */
  spotChanged() { const n = this.depotNew; this.depotNew = false; return n; }
  /** Are you stood at the depot's beacon? */
  jobAt(x: number, z: number, y: number) { const d = this.depot; return !!d && Math.hypot(x - d.x, z - d.z) < 1.6 && Math.abs(y - d.y) < 2; }
  /** You've taken the job: the bus you're put in next is a timetabled run (game.ts puts you in one). */
  takeJob() { this.job = true; }

  /** The depot, on the pavement behind the bus station's stand nearest where the routes start. */
  private findDepot(stops: Stop[]) {
    if (this.depot || this.map.d.id !== MAP) return;
    let best: Stop | null = null, bd = 120;
    for (const st of stops) {
      if (!/bus station/i.test(st.n ?? "")) continue;
      const d = Math.hypot(st.x - STATION.x, st.z - STATION.z);
      if (d < bd) { bd = d; best = st; }
    }
    if (!best) return;
    // a bus at the stand faces (cos a, -sin a); its door, and the pavement, are on its left
    const lx = -Math.sin(best.a), lz = -Math.cos(best.a), x = best.x + lx * 3, z = best.z + lz * 3, y = this.ground(x, z);
    const b = beacon();
    b.group.position.set(x, y, z);
    this.scene.add(b.group);
    this.depot = { x, y, z, beacon: b };
    this.depotNew = true;
  }

  /** Every frame: v is the bus you're driving, if you're driving one. stops: every bus stop loaded just now. */
  update(dt: number, v: Vehicle | null, stops: () => Stop[]) {
    const now = performance.now();
    if ((this.depotT -= dt) <= 0 && !this.depot) { this.depotT = 2; this.findDepot(stops()); }
    this.depot?.beacon.update(now / 1000);
    if (!v) this.finished = null;
    if (v && v !== this.bus && v !== this.finished) this.start(v, stops);
    else if (v && this.paused) { this.paused = 0; this.toast(`Back at the wheel of the ${this.line!.n}`); }
    else if (!v && this.bus && !this.paused) this.paused = now;
    if (this.paused && now - this.paused > KEEP) this.end();
    const line = this.line, bus = this.bus;
    this.walk(dt);
    if (!line || !bus || this.paused) { missionClear("bus"); return; }
    if ((this.scanT -= dt) <= 0) { this.scanT = 1; this.find(line, stops()); }
    this.follow(line, bus);
    this.atStops(dt, line, bus);
    if (this.timed) { this.keepTime(line, bus); if (!this.bus) return; }
    this.people(dt, line, bus);
    this.saidT -= dt;
    this.seatRiders(bus);
    this.hud(line);
  }

  /** Sit everyone on board in a seat of their own, inside the bus (when they get on or off). */
  private seatRiders(bus: Vehicle) {
    const key = this.riders.map((r) => r.seed).join(",");
    if (key === this.seated) return;
    this.seated = key;
    bus.carry(this.riders.map((r) => ({ seed: r.seed, geo: seatedLook(r.seed) })));
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
      // a loop goes right round and comes back its own way; the rest come back the way they went
      const out = this.traffic.way(via, true), back = r.loop ? out : this.traffic.way([...via].reverse(), true);
      if (!out || !back || Math.hypot(out[0].x - via[0].x, out[0].z - via[0].z) > 60) return null;
      // the loop, with no stretch longer than 8 m (to follow the bus along it closely)
      const raw = r.loop ? out : [...out, ...back.slice(1)], pts: { x: number; z: number }[] = [];
      for (let i = 0; i < raw.length; i++) {
        const a = raw[i], b = raw[(i + 1) % raw.length], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 8));
        if (i === raw.length - 1 && Math.hypot(b.x - a.x, b.z - a.z) < 1) break;
        for (let k = 0; k < n; k++) pts.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n });
      }
      const s = [0];
      for (let i = 1; i <= pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i % pts.length].x - pts[i - 1].x, pts[i % pts.length].z - pts[i - 1].z));
      // where it turns for home: the end of the route, or round a loop, the furthest it gets from the station
      const L = s[pts.length], end = r.loop ? via.reduce((f, p) => (Math.hypot(p.x - via[0].x, p.z - via[0].z) > Math.hypot(f.x - via[0].x, f.z - via[0].z) ? p : f)) : via[via.length - 1];
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

  private start(v: Vehicle, stops: () => Stop[]) {
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
    this.fares = this.cheers = this.moans = this.stranded = 0;
    this.scanT = 0;
    // a job taken at the depot: a timetabled run, from the stand at the start of the route
    this.timed = this.job ? { t0: performance.now() / 1000, lost: 0, late: 0, early: 0, missed: 0, calls: 0, away: 0, rung: false } : null;
    if (this.job) { this.job = false; this.find(line, stops()); this.toStand(line, v); }
    if (this.timed) missionBegin({ label: `Badgerline · Route ${line.n} · Timetabled`, colour: GREEN, title: `The ${line.n} to ${line.end}`,
      goal: `Out to ${line.end} and back to ${HOME}, calling at every stop. Keep to the timetable: get there early and wait till it's time to go, and don't run late`,
      detail: `You leave the station in ${LEAD} seconds. 100 points to start: ${TIERS.map((t) => `${t.at}+ for ${t.medal.toLowerCase()}`).join(", ")}` });
    else missionBegin({ label: `Badgerline · Route ${line.n}`, colour: GREEN, title: `You're on the ${line.n}`, goal: `${HOME} to ${line.end} and back. Follow the green line, and stop for anyone waiting` });
  }

  private end() {
    if (this.timed) { this.timed = null; this.fares = 0; }   // a timetabled run given up: no card, no prizes
    if (this.bus && this.fares) {
      missionResult({ result: "over", kind: "bus", label: `Badgerline · Route ${this.line?.n ?? ""}`, title: "Shift over", colour: GREEN,
        lines: [`${this.fares} fare${this.fares === 1 ? "" : "s"}, ${this.cheers} "cheers drive", ${this.moans} moan${this.moans === 1 ? "" : "s"}`] });
      // a shift counts once the bus has been right round its loop, there and back
      if (this.line && this.S >= this.line.L && !this.stranded) earn("buscap");
    }
    for (const st of this.line?.stops ?? []) this.clear(st);
    for (const p of this.boarding) gone(p);
    this.boarding = [];
    this.riders = [];
    this.bus?.carry([]);
    this.seated = "";
    this.serving = null;
    this.bus = this.line = this.next = null;
    this.paused = 0;
    missionClear("bus");
  }

  /** Put the bus on the stand at the start of the route, in its lane facing the way it goes, with the
   *  station's stop at its door (and sometimes people there waiting to get on). */
  private toStand(line: Line, v: Vehicle) {
    const at = 30, i = Math.max(0, line.s.findIndex((s) => s >= at) - 1), p = line.pts[i], q = line.pts[(i + 1) % line.pts.length];
    const len = Math.hypot(q.x - p.x, q.z - p.z) || 1, hx = (q.x - p.x) / len, hz = (q.z - p.z) / len, lx = hz, lz = -hx;
    const f = (at - line.s[i]) / len, cx = p.x + (q.x - p.x) * f + lx * 1.7, cz = p.z + (q.z - p.z) * f + lz * 1.7;
    v.place(cx, cz, Math.atan2(-hz, hx));
    v.vx = v.vz = 0;
    // the stand: the station's own stop if the route has one there, else one where the door is
    const door = this.door(v);
    let st = line.stops.find((o) => o.s < at + 60 && Math.hypot(o.x - door.x, o.z - door.z) < 25);
    if (!st) {
      st = { x: door.x, z: door.z, s: at + v.hl - 1.1, name: "Bath Bus Station", rx: -lx, rz: -lz, hx, hz, served: -Infinity, crowd: null };
      line.stops.push(st);
      line.stops.sort((a, b) => a.s - b.s);
    } else { st.x = door.x; st.z = door.z; }
    this.clear(st);
    if (Math.random() < 0.35) st.crowd = [];   // (nobody waiting this time)
    this.S = 0;
    this.locate(line, v, true);
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

  // ---- the timetable ---------------------------------------------------------------------------------

  /** When the timetable has the bus where it is now (s, performance.now's): the first departure, then a steady pace and a little at each stop so far. */
  private due(): number {
    const T = this.timed!;
    return T.t0 + LEAD + Math.max(0, this.S) / SPEED + T.calls * DWELL;
  }

  /** Points off, for what. */
  private lose(n: number, why: string) {
    const T = this.timed!, k = Math.round(n);
    if (k <= 0) return;
    T.lost += k;
    this.toast(`${why}: −${k} point${k === 1 ? "" : "s"}`);
  }

  /** Called at a stop on a timetabled run: how late (or early) you are, and when you're due away. */
  private called(st: RStop) {
    const T = this.timed!, now = performance.now() / 1000, due = this.due(), late = now - due;
    if (late > GRACE) { T.late++; this.lose(Math.min(8, (late - GRACE) / 4), `${clockOf(late)} late at ${st.name}`); }
    T.calls++;
    T.away = due + DWELL; T.rung = now >= T.away;
  }

  /** Every frame of a timetabled run: the ding when it's time to go, leaving early, and the end back at the station. */
  private keepTime(line: Line, v: Vehicle) {
    const T = this.timed!, now = performance.now() / 1000;
    // the first departure, from the station itself
    if (!T.calls && T.away === 0) { T.away = T.t0 + LEAD; T.rung = false; }
    if (T.away > 0 && !T.rung && now >= T.away) { T.rung = true; SFX.busBell(); this.toast("Time to go"); }
    // moving off: leaving early costs you (the station's departure counts once you're 20 m off)
    const moving = Math.abs(v.speed) > 1.2 && (T.calls > 0 || this.S > 20);
    if (T.away > 0 && moving) {
      if (now < T.away - 2) { T.early++; this.lose(Math.max(2, Math.min(8, (T.away - now) / 2)), `Left ${clockOf(T.away - now)} early`); }
      T.away = -1;   // gone: wait for the next stop
    }
    // back at the station: the end of the run
    if (this.S >= line.L - 40 && this.onLine && Math.hypot(v.x - STATION.x, v.z - STATION.z) < STATION.r) this.finish(line, v, now);
  }

  private finish(line: Line, v: Vehicle, now: number) {
    const T = this.timed!, late = now - this.due();
    if (late > GRACE) this.lose(Math.min(15, (late - GRACE) / 4), `Back ${clockOf(late)} late`);
    const points = Math.max(0, 100 - T.lost), got = TIERS.filter((t) => points >= t.at), top = got[got.length - 1];
    missionResult({
      result: got.length ? "won" : "lost", kind: "bus", label: `Badgerline · Route ${line.n} · Timetabled`, colour: GREEN,
      title: got.length ? "Bang on time" : "Late again", lead: `${points} points`, medal: top?.medal,
      lines: [
        `${T.calls} stop${T.calls === 1 ? "" : "s"} called at, ${T.late} late, ${T.early} left early, ${T.missed} missed`,
        late > GRACE ? `Back at the station ${clockOf(late)} late` : late < -GRACE ? `Back at the station ${clockOf(-late)} early` : "Back at the station on time",
        `${this.fares} fare${this.fares === 1 ? "" : "s"}, ${this.cheers} "cheers drive", ${this.moans} moan${this.moans === 1 ? "" : "s"}`,
      ],
    });
    // the prizes go on the card as they come in
    for (const t of got) earn(t.id);
    if (!this.stranded) earn("buscap");
    this.timed = null;
    this.fares = 0;     // (so end() makes no card of its own)
    this.end();
    this.finished = v;
  }

  /** Gone past a stop without stopping. */
  private passed(st: RStop) {
    st.served = this.S;
    if (this.timed) { this.timed.missed++; this.timed.calls++; this.lose(5, `Missed ${st.name}`); }
    let carried = 0;
    for (const r of this.riders) {
      if (r.missed) continue;
      if (r.going > 1) { r.going--; continue; }
      r.missed = true; r.moanT = 6 + Math.random() * 5; carried++;
    }
    if (carried) {
      this.moans += carried;
      this.moan(pick(MISSED), 2);
      this.toast(`You went past ${st.name}! ${carried === 1 ? "Someone" : `${carried} people`} wanted to get off there`);
    }
    const left = st.crowd?.length ?? 0;
    if (left) {
      this.stranded += left;
      this.toast(`You left ${left === 1 ? "someone" : left} standing at ${st.name}`);
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
        this.stranded += this.boarding.length;
        this.toast(`You drove off and left ${this.boarding.length === 1 ? "someone" : this.boarding.length} at ${st.name}`);
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
      if (this.timed) this.called(st);
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
      if (st.crowd.length) this.toast("The bus is full");
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
    this.saidN++;
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

  private saidN = 0;               // each new thing said flashes the panel
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
    const T = this.timed;
    if (T) {
      // the timetable: wait at the stop till it's time to go, else how you're running
      const now = performance.now() / 1000, off = now - this.due();
      const clock = T.away > 0 && now < T.away ? `<span class="sign">Wait</span> depart in <b>${clockOf(T.away - now)}</b>`
        : T.away > 0 ? `<b>Time to go</b>`
          : off > GRACE ? `Running <b style="color:#ff7a6a">${clockOf(off)} late</b>` : off < -GRACE ? `Running <b>${clockOf(-off)} early</b>: ease off` : "<b>On time</b>";
      missionProgress({
        id: "bus", label: `Badgerline · Route ${line.n} · Timetabled`, colour: GREEN, goal: to,
        hint: clock + "<br>" + where + (bell ? `<br><span class="sign">Bus stopping</span>` : ""),
        sub: `Points ${Math.max(0, 100 - T.lost)} · On board ${this.riders.length}` + (this.saidT > 0 && this.said ? `<br>“${esc(this.said)}”` : ""),
        flash: `${bell ? "bell" : ""}|${this.saidN}|${T.lost}|${T.away > 0 && now >= T.away}`,
      });
      return;
    }
    missionProgress({
      id: "bus", label: `Badgerline · Route ${line.n}`, colour: GREEN, goal: to,
      hint: where + (waiting && this.onLine ? `<br>${waiting} waiting there` : "") + (bell ? `<br><span class="sign">Bus stopping</span>` : ""),
      sub: `On board ${this.riders.length} · Fares ${this.fares} · Moans ${this.moans}` + (this.saidT > 0 && this.said ? `<br>“${esc(this.said)}”` : ""),
      flash: `${bell ? "bell" : ""}|${this.saidN}`,
    });
  }
}

const GREEN = "#7fe08f";
