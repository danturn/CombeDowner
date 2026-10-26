// Push the Bus, a team challenge (challenges.ts): a Badgerline bus has broken down at the foot of
// the steepest long street on the map, and it has to be pushed all the way to the top. Hold E (Use)
// at its back to get your shoulder to it; every couple of seconds someone shouts "heave", and
// letting go and pressing again right on it gives a surge (so does shouting "HEAVE!" into your mic
// right on it). Steady shoving on its own only just holds it, so it's the heaves, and heaving
// together, that get it up the hill. Nobody heaving, or too few pushing, and it slows, stops and
// starts rolling back, faster and faster, until it gets away from you. Someone can climb into the
// cab (E at the front) to steer it off the kerb (A and D) and pull the handbrake (Space) to hold
// it while the pushers get their breath; only they can see how fast it's rolling. A car coming
// down the hill can't get by unless the bus is pulled in, and a naughty boy now and then climbs on
// the roof (more weight) or shoves at the front: shoot him off.
// Roll it back past where it started and it's lost, careering on down the street, through the
// bins and into a hedge, or the water if there's any at the bottom.
//
// It's a minibus when you're on your own or two, a double-decker for three or more, and heavier
// with every hand. Which hill it is comes from the day: on hard days it's the steepest on the map,
// on easier ones one of the next steepest, and the bus is lighter. Until someone takes it on, the
// bus stands there broken down, pulled in at the kerb a little way up from the bottom with its
// hazards going, the engine hatch up and steam coming off it, and a warning triangle in the road
// behind: walk up to it to start, and the push starts from that very bus where it stands.
//
// Who decides what: the hill comes from the map alone (the wide map's streets and ground), so every
// player works out the same ones, and the bus waiting there is each player's own, from the map and
// the day alone. The host runs the bus once it's taken: where it is up the hill, how fast it's
// going, how far over it's drifted, the heave's beat, the car coming down and the naughty boys, and
// sends it all ("qe" k "b") about ten times a second. Each player says only whether they're pushing,
// when they heaved and how well it was timed (judged on their own screen against the beat the
// host last sent, whether they pressed or shouted "heave": voicelevel.ts), and, in the cab, the steering and the handbrake. The host says when it's won or
// lost. The bins it knocks flying are each player's own, just for show.
import * as THREE from "three";
import * as SFX from "./audio";
import { hitPosed } from "./avatar";
import { registerChallenge, type ChallengeSpot } from "./challenges";
import { carSteerable, paintFor } from "./furniture";
import { keyLabel } from "./gamepad";
import { carShape, trafficMake } from "./makes";
import { type GameMap, roadHalf } from "./map";
import { Figure, look, NAUGHTY } from "./naughtyboys";
import { openGround } from "./oddments";
import { compassWord, esc, far, rng, type Job, type Quarry, type QuestWorld, type Waiting } from "./quests";
import { Vehicle, type VKind } from "./vehicles";
import { voiceLevel } from "./voicelevel";

const COLOUR = "#f2c318";
const STEP = 5;                  // the hill's line is kept as a point every this many metres
const MIN_LEN = 200, MAX_LEN = 400;
const BEAT = 2.4;                // seconds between heaves
const WINDOW = 0.32;             // how close to the heave a press must be to count
const SURGE = 2.6, SURGE_T = 0.55;     // a heave's shove (in pusher-seconds), and how long it lasts
const ROLL = 0.15;               // rolling resistance, as a share of the weight
const GRIP = -2.6;               // rolling back faster than this, m/s, it gets away from the pushers
const REACH = 2.4;               // how close to its back (or its cab) to take hold
const LETGO = 0.5;               // let go of E for this long and you've stepped off
const RUNAWAY = 6;               // seconds of it careering off once it's lost
const SEND = 0.1;

const DRIVE = new Set(["trunk", "primary", "secondary", "tertiary", "residential", "unclassified", "living_street"]);

// ---- the hill: the steepest long street, from the wide map's streets and ground ----------------

/** A hill, scene coordinates: its line every STEP metres from the bottom up (x, z, height), how far
 *  the street runs on below the bottom (for a runaway), and how wide it is. */
interface Hill { name: string; pts: number[][]; below: number[][]; len: number; rise: number; half: number; score: number }

const hillCache = new WeakMap<GameMap, Hill[]>();
// the hills each zone's placing found, by the spots it gave, since the whole map's steepest can lie outside the zone
const placedHills = new WeakMap<ChallengeSpot[], Hill[]>();
const hillsFor = (spots: ChallengeSpot[], map: GameMap) => placedHills.get(spots) ?? hillsOf(map);

/** The map's steepest long streets, best first: at most three, well apart. */
function hillsOf(map: GameMap): Hill[] {
  let got = hillCache.get(map);
  if (got) return got;
  const W = map.wide;
  // squares stream in differently for each player, so only the city-wide map (or, with none, the first area)
  const roads = W ? W.rd : map.d.rd ?? [];
  const ground = (x: number, z: number) => (W ? W.ground(x, z) : map.ground(x, z));
  const home = openGround(map);
  const okAt = (x: number, y: number) => map.fieldEdge(x, -y) > 70 && (!home || Math.hypot(home.x - x, home.y - y) > 90);
  const by = new Map<string, number[][][]>();
  for (const r of roads) {
    if (!r.n || !DRIVE.has(r.c) || r.bridge || r.p.length < 2) continue;
    const k = `${r.n}|${r.c}`;
    (by.get(k) ?? by.set(k, []).get(k)!).push(r.p.map((q) => [q[0], q[1]]));
  }
  const found: Hill[] = [];
  for (const [k, parts] of [...by].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
    const [name, cls] = k.split("|");
    const left = [...parts];
    while (left.length) {
      let line = left.shift()!;
      // join the street's pieces end to end
      for (let grew = true; grew; ) {
        grew = false;
        for (let i = 0; i < left.length; i++) {
          const p = left[i], a = line[0], b = line[line.length - 1];
          const near = (u: number[], v: number[]) => Math.hypot(u[0] - v[0], u[1] - v[1]) < 1.5;
          if (near(b, p[0])) line = line.concat(p.slice(1));
          else if (near(b, p[p.length - 1])) line = line.concat([...p].reverse().slice(1));
          else if (near(a, p[p.length - 1])) line = p.concat(line.slice(1));
          else if (near(a, p[0])) line = [...p].reverse().concat(line.slice(1));
          else continue;
          left.splice(i, 1); grew = true; break;
        }
      }
      const S: number[][] = [];
      for (let i = 1; i < line.length; i++) {
        const a = line[i - 1], b = line[i], n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / STEP));
        for (let j = i === 1 ? 0 : 1; j <= n; j++) {
          const x = a[0] + ((b[0] - a[0]) * j) / n, y = a[1] + ((b[1] - a[1]) * j) / n;
          S.push([x, y, ground(x, -y)]);
        }
      }
      if (S.length < MIN_LEN / STEP) continue;
      for (const P of [S, [...S].reverse()]) {
        const L = [0];
        for (let i = 1; i < P.length; i++) L.push(L[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
        let best: { i: number; j: number; rise: number; score: number } | null = null;
        for (let i = 0; i < P.length; i++) {
          if (!okAt(P[i][0], P[i][1])) continue;
          let hi = P[i][2];
          for (let j = i + 1; j < P.length; j++) {
            if (!okAt(P[j][0], P[j][1])) break;
            const len = L[j] - L[i];
            if (len > MAX_LEN) break;
            hi = Math.max(hi, P[j][2]);
            if (P[j][2] < hi - 3) break;   // over the top and down again: not one hill
            if (len < MIN_LEN) continue;
            const rise = P[j][2] - P[i][2], score = rise * Math.min(1, rise / len / 0.09);
            if (rise / len > 0.05 && (!best || score > best.score)) best = { i, j, rise, score };
          }
        }
        if (!best) continue;
        const pts = P.slice(best.i, best.j + 1).map((q) => [q[0], -q[1], q[2]]);
        const below = P.slice(Math.max(0, best.i - 12), best.i).reverse().map((q) => [q[0], -q[1], q[2]]);
        found.push({ name, pts, below, len: L[best.j] - L[best.i], rise: best.rise, half: roadHalf(cls), score: best.score });
      }
    }
  }
  found.sort((a, b) => b.score - a.score || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  got = [];
  for (const h of found) {
    if (got.length >= 3) break;
    const clash = got.some((o) => o.name === h.name || o.pts.some((p) => h.pts.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 60)));
    if (!clash) got.push(h);
  }
  hillCache.set(map, got);
  return got;
}

/** Where along a hill's line s metres up is, how it heads (a unit vector, scene) and how steep. */
function along(h: Hill, s: number) {
  const P = h.pts, n = P.length - 1, f = Math.max(0, Math.min(n, s / STEP)), i = Math.min(n - 1, Math.floor(f)), t = f - i;
  const a = P[i], b = P[i + 1];
  const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
  // heading and steepness over a few metres either way, so corners and bumps come on smoothly
  const k0 = Math.max(0, i - 1), k1 = Math.min(n, i + 2), dx = P[k1][0] - P[k0][0], dz = P[k1][1] - P[k0][1], d = Math.hypot(dx, dz) || 1;
  const g0 = Math.max(0, i - 3), g1 = Math.min(n, i + 4);
  const grade = Math.min(Math.max(0.06, h.rise / h.len * 1.6), (P[g1][2] - P[g0][2]) / ((g1 - g0) * STEP || 1));
  return { x, z, fx: dx / d, fz: dz / d, grade };
}

/** Where the bus is with its middle s metres up and lat over from the middle of the street (- is its left kerb). */
function poseOn(h: Hill, s: number, lat: number) {
  const p = along(h, s), rx = -p.fz, rz = p.fx;
  return { x: p.x + rx * lat, z: p.z + rz * lat, fx: p.fx, fz: p.fz, rx, rz, grade: p.grade, a: Math.atan2(-p.fz, p.fx) };
}

/** Where it stands broken down before anyone's pushed it: pulled in at the kerb, a little way up from
 *  the bottom (s, from the poster's mode once it's been taken: where it really stood). */
function restOn(h: Hill, hl: number, hw: number, s = hl + 15) {
  const latMax = Math.max(0.2, h.half - hw - 0.15);
  return { s, lat: -Math.min(latMax, Math.max(0, h.half - hw - 0.7)), latMax };
}

/** The first place up from the bottom where the bus stands clear of the parked cars, the bus stops and
 *  their shelters that the squares loaded here have along the kerb; the usual one if there's none. */
function clearRest(h: Hill, hl: number, hw: number, map: GameMap) {
  const r0 = restOn(h, hl, hw), mid = along(h, r0.s + 25);
  const stops: number[][] = [], cars: number[][] = [];
  for (const m of [map, ...map.tilesNear(mid.x, mid.z, 120)]) {
    for (const f of m.d.fx ?? []) if (f[0] === "bus") stops.push([+f[1], -f[2]]);
    for (const c of m.parked) cars.push([c.x, -c.y]);
  }
  for (let s = r0.s; s <= r0.s + 50 && s < h.len - hl - 20; s += 2) {
    const b = poseOn(h, s, r0.lat);
    // a bus waits at a stop on this side (vehicles.ts): stand well clear, so it's plainly not in the queue
    if (stops.some(([x, z]) => Math.abs((x - b.x) * b.fx + (z - b.z) * b.fz) < hl + 13 && Math.abs((x - b.x) * b.rx + (z - b.z) * b.rz) < 4)) continue;
    if (cars.some(([x, z]) => Math.hypot(x - b.x, z - b.z) < hl + 2.5)) continue;
    let clear = true;
    for (let k = -1; k <= 1 && clear; k += 0.5) clear = !map.blocked(b.x + b.fx * k * (hl - hw), b.z + b.fz * k * (hl - hw), hw - 0.1);
    if (clear) return s;
  }
  return r0.s;
}

const busKind = (players: number): VKind => (players >= 3 ? "bus" : "minibus");
const busNumber = (seed: number) => 990000 + (seed % 1000);

let steamTex: THREE.CanvasTexture | null = null;

/** The bus's breakdown, drawn as breakdown.ts draws its BMW's: hazards ticking at its four corners, the
 *  engine hatch up at the back with steam coming off the engine, and a warning triangle in the road behind. */
class Broken {
  private lamps = new THREE.MeshBasicMaterial({ color: "#ffb21f" });
  private dark = new THREE.MeshLambertMaterial({ color: "#2a2a2c" });
  private red = new THREE.MeshLambertMaterial({ color: "#d8262e" });
  private steam: THREE.Sprite[] = [];
  private bits = new THREE.Group();
  private triangle = new THREE.Group();
  private geos: THREE.BufferGeometry[] = [];
  private back: number;

  constructor(bus: Vehicle, private scene: THREE.Scene, at: { x: number; y: number; z: number; a: number }) {
    // the bus's body is its root's first child: what tilts with the slope, so the lamps sit on its corners
    const body = bus.root.children[0], hl = bus.hl, hw = bus.hw;
    const geo = <T extends THREE.BufferGeometry>(g: T) => { this.geos.push(g); return g; };
    const lamp = geo(new THREE.BoxGeometry(0.12, 0.18, 0.3));
    for (const x of [hl + 0.03, -hl - 0.03]) for (const z of [hw - 0.2, -hw + 0.2]) {
      const m = new THREE.Mesh(lamp, this.lamps);
      m.position.set(x, x > 0 ? 0.8 : 0.6, z);
      this.bits.add(m);
    }
    // the engine bay open at the back, and its hatch swung up over it
    const bay = new THREE.Mesh(geo(new THREE.BoxGeometry(0.04, 0.75, hw * 1.5)), this.dark);
    bay.position.set(-hl - 0.02, 0.85, 0);
    const hinge = new THREE.Group();
    hinge.position.set(-hl - 0.03, 1.25, 0);
    const hatch = new THREE.Mesh(geo(new THREE.BoxGeometry(0.05, 0.8, hw * 1.6)), new THREE.MeshLambertMaterial({ color: "#f2efe6" }));
    hatch.position.y = -0.4;
    hatch.castShadow = true;
    hinge.add(hatch);
    hinge.rotation.z = -1.15;
    this.bits.add(bay, hinge);
    if (!steamTex) {
      const cv = document.createElement("canvas"), c = cv.getContext("2d")!;
      cv.width = cv.height = 64;
      const r = c.createRadialGradient(32, 32, 2, 32, 32, 30);
      r.addColorStop(0, "rgba(240,240,240,0.9)"); r.addColorStop(1, "rgba(240,240,240,0)");
      c.fillStyle = r; c.fillRect(0, 0, 64, 64);
      steamTex = new THREE.CanvasTexture(cv);
    }
    for (let k = 0; k < 6; k++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: steamTex, transparent: true, depthWrite: false }));
      this.steam.push(sp);
      this.bits.add(sp);
    }
    this.back = -hl - 0.5;
    body.add(this.bits);
    // the triangle, on its little legs, facing up the street at whatever's coming
    const tri = new THREE.Shape([new THREE.Vector2(-0.38, 0), new THREE.Vector2(0.38, 0), new THREE.Vector2(0, 0.66)]);
    tri.holes.push(new THREE.Path([new THREE.Vector2(-0.24, 0.08), new THREE.Vector2(0, 0.5), new THREE.Vector2(0.24, 0.08)]));
    const face = new THREE.Mesh(geo(new THREE.ExtrudeGeometry(tri, { depth: 0.03, bevelEnabled: false })), this.red);
    face.position.y = 0.08;
    face.rotation.x = -0.2;
    const foot = new THREE.Mesh(geo(new THREE.BoxGeometry(0.6, 0.03, 0.3)), this.dark);
    foot.position.y = 0.02;
    this.triangle.add(face, foot);
    this.triangle.position.set(at.x, at.y, at.z);
    this.triangle.rotation.y = at.a - Math.PI / 2;
    scene.add(this.triangle);
  }

  update(t: number) {
    this.lamps.color.set(t % 0.9 < 0.45 ? "#ffb21f" : "#3a2a10");
    const back = this.back;
    this.steam.forEach((s, k) => {
      const f = (t * 0.3 + k / this.steam.length) % 1;
      s.position.set(back - f * 0.8, 1.0 + f * 3, Math.sin(t + k * 2) * 0.3);
      s.scale.setScalar(0.6 + f * 2.2);
      s.material.opacity = 0.55 * Math.sin(f * Math.PI);
    });
  }

  dispose() {
    this.bits.removeFromParent();
    this.scene.remove(this.triangle);
    for (const g of this.geos) g.dispose();
    for (const s of this.steam) s.material.dispose();
    this.lamps.dispose(); this.dark.dispose(); this.red.dispose();
  }
}

/** Where the triangle goes: in the road a few metres behind the bus as it stands broken down. */
function triangleAt(h: Hill, hl: number, hw: number, s: number, map: GameMap) {
  const r = restOn(h, hl, hw, s), b = poseOn(h, Math.max(0, r.s - hl - 6), r.lat);
  return { x: b.x, y: map.ground(b.x, b.z), z: b.z, a: b.a };
}

/** How far (x, z) is from the bus's sides and ends. */
function offBus(bus: Vehicle, x: number, z: number) {
  const c = Math.cos(bus.a), s = Math.sin(bus.a), dx = x - bus.x, dz = z - bus.z;
  return Math.hypot(Math.max(0, Math.abs(dx * c - dz * s) - bus.hl), Math.max(0, Math.abs(dx * s + dz * c) - bus.hw));
}

/** The day's bus, broken down where the push will start from, till someone takes it on. */
function waitingBus(offer: Job["offer"], spots: ChallengeSpot[], w: QuestWorld): Waiting {
  const { hill } = dayHill(offer.seed, hillsFor(spots, w.map));
  let bus: Vehicle | null = null, broken: Broken | null = null, kind: VKind | null = null, checkT = 0, rs = 0;
  const drop = () => {
    broken?.dispose(); broken = null;
    if (!bus) return;
    w.scene.remove(bus.root);
    const k = w.map.movers.indexOf(bus);
    if (k >= 0) w.map.movers.splice(k, 1);
    bus = null;
  };
  // the same bus the push makes: a minibus or a double-decker by how many are playing
  const build = () => {
    drop();
    kind = busKind(Math.max(1, w.players().length));
    const v = (bus = new Vehicle(busNumber(offer.seed), kind, "#ffffff", w.map, (x, z) => w.map.ground(x, z)));
    rs = clearRest(hill, v.hl, v.hw, w.map);
    const r = restOn(hill, v.hl, v.hw, rs), b = poseOn(hill, r.s, r.lat);
    v.place(b.x, b.z, b.a);
    v.pose(0, performance.now());
    w.scene.add(v.root);
    w.map.movers.push(v);
    broken = new Broken(v, w.scene, triangleAt(hill, v.hl, v.hw, rs, w.map));
  };
  build();
  return {
    dist: (x, z) => (bus ? offBus(bus, x, z) : Infinity),
    stamp: () => Math.round(rs * 10),
    update(dt) {
      if ((checkT -= dt) <= 0) { checkT = 1; if (busKind(Math.max(1, w.players().length)) !== kind) build(); }
      broken?.update(performance.now() / 1000);
    },
    obstacles: () => (bus ? [{ x: bus.x, z: bus.z, r: bus.hl, parked: true, a: bus.a }] : []),
    dispose: drop,
  };
}

// ---- the challenge ------------------------------------------------------------------------------

interface Lad { kind: number; t: number; fig: Figure | null; said: boolean }   // kind 0 none, 1 on the roof, 2 shoving at the front
interface Bin { x: number; y: number; z: number; vx: number; vy: number; vz: number; rx: number; rz: number; spin: number; hit: boolean }

const ladLines = { 1: ["Free ride!", "Woo! Faster!", "Is this the number 2?", "I live up here, cheers!"], 2: ["Nah, it's going back down", "Push harder, then", "You shall not pass", "Oi, it's my turn"] } as const;

registerChallenge({
  id: "pushbus",
  name: "Push the Bus",
  blurb: "The bus has broken down at the bottom of the hill. Push it all the way to the top, together",
  glyph: "B", colour: COLOUR, tier: 1, stars: 3,
  goal: () => "Push the broken-down bus up to the top of the hill",
  place(map) {
    const hs = hillsOf(map);
    if (!hs.length) return null;
    const out = hs.flatMap((h): ChallengeSpot[] => {
      const a = h.pts[0], b = h.pts[h.pts.length - 1];
      return [{ x: a[0], z: a[1], name: `the bottom of ${h.name}` }, { x: b[0], z: b[1], name: `the top of ${h.name}` }];
    });
    placedHills.set(out, hs);
    return out;
  },
  where(seed, spots, map) {
    const h = dayHill(seed, hillsFor(spots, map)).hill, a = h.pts[0];
    return { x: a[0], z: a[1], name: `the bottom of ${h.name}` };
  },
  waiting({ offer, spots, w }) { return waitingBus(offer, spots, w); },
  start({ offer, spots, w }) { return pushTheBus(offer, spots, w); },
});

/** The day's hill and how hard a day it is, from the day's seed alone, so the bus waits where the push starts. */
function dayHill(seed: number, hills: ReturnType<typeof hillsOf>) {
  const diff = Math.floor(rng(seed ^ 0x2c1b3c6d)() * 3);   // 0 an easy day .. 2 a hard one
  return { diff, hill: hills[Math.max(0, Math.min(hills.length - 1, 2 - diff))] ?? hills[0] };
}

function pushTheBus(offer: Job["offer"], spots: ChallengeSpot[], w: QuestWorld): Job {
  const r = rng(offer.seed);
  const { diff, hill } = dayHill(offer.seed, hillsFor(spots, w.map));
  const startN = Math.max(1, w.players().length);
  const kind = busKind(startN);
  const bus = new Vehicle(busNumber(offer.seed), kind, "#ffffff", w.map, (x, z) => w.map.ground(x, z));
  const hl = bus.hl, hw = bus.hw;
  const rest = restOn(hill, hl, hw, offer.mode ? offer.mode / 10 : clearRest(hill, hl, hw, w.map)), latMax = rest.latMax;
  const top = hill.len - hl;
  const s0 = rest.s;
  const steep = hill.rise / hill.len;
  w.scene.add(bus.root);
  w.map.movers.push(bus);
  const broken = new Broken(bus, w.scene, triangleAt(hill, hl, hw, rest.s, w.map));

  // shared: the host's, copied by everyone else
  let s = s0, v = 0, lat = rest.lat, hb = false, ph = 0;
  let mode = 0;                  // 0 waiting at the bottom on its chocks, 1 on the go, 2 got away (lost), 3 at the top
  let driver = "";
  const slots: string[] = Array.from({ length: kind === "bus" ? 8 : 7 }, () => "");
  let carS = -1, carSt = 0, carW = 0;   // the car coming down: how far up it is, 0 none / 1 coming / 2 stuck / 3 squeezing by
  const lads: Lad[] = [{ kind: 0, t: 0, fig: null, said: false }, { kind: 0, t: 0, fig: null, said: false }];
  let ts = s, tv = 0, heardAt = 0;      // a guest's last word from the host
  let runT = 0, runFrom = { x: 0, z: 0, a: 0, v: 0 }, sink = 0;

  // the host's own
  const pushing = new Map<string, number>();       // who says they're pushing, and when they last said so
  const surges: { left: number; f: number }[] = [];
  let beatN = 0, syncBeat = -1, syncN = 0;
  const heaved = new Map<string, number>();     // the beat each pusher last heaved on, so it's one heave a beat
  let steer = 0, steerHeard = 0;
  let nextCar = 30 + r() * 20 - diff * 6, nextLad = 35 + r() * 20 - diff * 6;
  const hr = rng(offer.seed ^ 0x5bd1e995);

  // your own
  let holding = false, letGoT = 99, sentOn = false, sentT = 0, inCab = false, myHb = false, mySteer = 0, sentSteerT = 0;
  const keys = new Set<string>();
  let lastPh = 0, sendT = 0, markT = 0, scrapeT = 0, shoutUsed = voiceLevel.shoutAt;
  const posed = new Set<string>();

  // ---- the bins along the kerbs, and the car ------------------------------------------------
  const bins: Bin[] = [];
  for (let k = 1; k <= 9; k++) {
    const sb = (k / 10) * hill.len, p = along(hill, sb), side = r() < 0.6 ? -1 : 1, off = side * (hill.half + 0.45);
    const x = p.x - p.fz * off, z = p.z + p.fx * off;
    bins.push({ x, y: w.map.ground(x, z), z, vx: 0, vy: 0, vz: 0, rx: 0, rz: 0, spin: 0, hit: false });
  }
  // and three at the bottom, where a runaway goes
  for (let k = 0; k < 3; k++) {
    const q = hill.below[Math.min(hill.below.length - 1, 2 + k * 2)] ?? hill.pts[0];
    const x = q[0] + (k - 1) * 0.8, z = q[1] + (k - 1) * 0.5;
    bins.push({ x, y: w.map.ground(x, z), z, vx: 0, vy: 0, vz: 0, rx: 0, rz: 0, spin: 0, hit: false });
  }
  const binGeo = new THREE.BoxGeometry(0.58, 1.05, 0.7).translate(0, 0.525, 0);
  const binMat = new THREE.MeshLambertMaterial({ color: "#2d5a32" });
  const binMesh = new THREE.InstancedMesh(binGeo, binMat, bins.length);
  binMesh.castShadow = true;
  w.scene.add(binMesh);
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e4 = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1), at4 = new THREE.Vector3();
  const drawBins = () => {
    bins.forEach((b, i) => {
      q4.setFromEuler(e4.set(b.rx, b.spin, b.rz));
      binMesh.setMatrixAt(i, m4.compose(at4.set(b.x, b.y, b.z), q4, one));
    });
    binMesh.instanceMatrix.needsUpdate = true;
  };
  drawBins();

  const make = trafficMake(offer.seed % 97);
  const carObj = new THREE.Group();
  {
    const car = carSteerable(carShape(make)), mat = new THREE.MeshLambertMaterial({ vertexColors: true, color: paintFor(make, offer.seed % 7) });
    carObj.add(new THREE.Mesh(car.body, mat));
    for (const wh of car.wheels) { const m = new THREE.Mesh(wh.geo, mat); m.position.set(wh.x, wh.y, wh.z); carObj.add(m); }
    carObj.traverse((o) => { o.castShadow = true; });
    carObj.visible = false;
    w.scene.add(carObj);
  }
  const carLat = Math.max(0.9, hill.half - 1.1);

  // the hedge at the bottom, and any water a runaway could end up in
  const end = hill.below[hill.below.length - 1] ?? [hill.pts[0][0] - (hill.pts[1][0] - hill.pts[0][0]) * 6, hill.pts[0][1] - (hill.pts[1][1] - hill.pts[0][1]) * 6];
  let pond: number[] | null = null;
  for (const wp of [...(w.map.wide?.wp ?? []), ...(w.map.d.wp ?? [])]) {
    for (const q of wp.r[0] ?? []) {
      const d = Math.hypot(q[0] - end[0], -q[1] - end[1]);
      if (d < 45 && (!pond || d < Math.hypot(pond[0] - end[0], pond[1] - end[1]))) pond = [q[0], -q[1]];
    }
  }
  const runTo = pond ?? (() => {
    const p = along(hill, 0), off = hill.half + 2.5;
    return [end[0] - p.fz * -off, end[1] + p.fx * -off];
  })();
  const hedge = new THREE.Mesh(new THREE.BoxGeometry(5, 1.5, 1.1).translate(0, 0.75, 0), new THREE.MeshLambertMaterial({ color: "#3d6b2e" }));
  if (!pond) {
    hedge.position.set(runTo[0], w.map.ground(runTo[0], runTo[1]), runTo[1]);
    const p = along(hill, 0);
    hedge.rotation.y = Math.atan2(-p.fz, p.fx);
    hedge.castShadow = true;
    w.scene.add(hedge);
  }

  // ---- input: E held to push, A/D and Space in the cab --------------------------------------
  const ac = new AbortController(), sig = { signal: ac.signal };
  const letGo = () => { holding = false; };
  addEventListener("keyup", (e) => { if (e.code === "KeyE") letGo(); keys.delete(e.code); }, sig);
  addEventListener("keydown", (e) => {
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === "Space" && inCab) handbrake();
  }, sig);
  addEventListener("blur", () => { letGo(); keys.clear(); }, sig);
  const tcar = document.getElementById("t-car");
  tcar?.addEventListener("pointerup", letGo, sig);
  tcar?.addEventListener("pointercancel", letGo, sig);
  document.getElementById("t-jump")?.addEventListener("pointerdown", () => { if (inCab) handbrake(); }, sig);

  function handbrake() {
    myHb = !myHb;
    SFX.clunk();
    sendDrive();
  }
  function sendDrive() {
    sentSteerT = 0.5;
    const d = { k: "dr", s: offer.seed, st: mySteer, hb: myHb ? 1 : 0 };
    if (w.isHost) job.event!(d, w.selfId); else w.send("qe", d);
  }
  const say = (d: Record<string, unknown>) => {
    const m = { ...d, s: offer.seed };
    if (w.isHost) job.event!(m, w.selfId); else w.send("qe", m);
  };

  // ---- where things are ------------------------------------------------------------------------
  const pose = () => poseOn(hill, s, lat);
  const rearOf = (b = pose()) => ({ x: b.x - b.fx * (hl + 0.1), z: b.z - b.fz * (hl + 0.1) });
  const frontOf = (b = pose()) => ({ x: b.x + b.fx * (hl + 0.3), z: b.z + b.fz * (hl + 0.3) });
  /** Where pusher slot k stands: a row across the back, then up the sides at the back. */
  const slotAt = (k: number, b = pose()) => {
    const row = kind === "bus" ? 4 : 3;
    let al: number, ac2: number;
    if (k < row) { al = -(hl + 0.5); ac2 = (k - (row - 1) / 2) * ((hw * 2 - 0.3) / (row - 1)); }
    else { const j = k - row; al = -hl + 0.7 + Math.floor(j / 2) * 0.8; ac2 = (j % 2 ? 1 : -1) * (hw + 0.45); }
    const x = b.x + b.fx * al + b.rx * ac2, z = b.z + b.fz * al + b.rz * ac2;
    return { x, z, y: w.map.ground(x, z) };
  };
  const nearRear = () => {
    const me = w.me(), rr = rearOf();
    return me.alive && Math.hypot(me.x - rr.x, me.z - rr.z) < REACH + hw;
  };
  const nearCab = () => {
    const me = w.me(), f = frontOf();
    return me.alive && Math.hypot(me.x - f.x, me.z - f.z) < REACH + 0.6;
  };
  const mySlot = () => slots.indexOf(w.selfId);

  // ---- the host's bus ------------------------------------------------------------------------
  function hostStep(dt: number) {
    const now = performance.now(), ps = w.players();
    const alive = new Set(ps.filter((p) => p.alive).map((p) => p.id));
    for (const [id, t] of pushing) if (now - t > 2600 || !alive.has(id)) pushing.delete(id);
    for (let k = 0; k < slots.length; k++) if (slots[k] && !pushing.has(slots[k])) slots[k] = "";
    for (const id of [...pushing.keys()].sort()) if (!slots.includes(id)) { const k = slots.indexOf(""); if (k >= 0) slots[k] = id; }
    if (driver && (!alive.has(driver) || now - steerHeard > 4000)) { driver = ""; hb = false; }
    if (mode === 1 || mode === 0) {
      ph += dt;
      if (ph >= BEAT) { ph -= BEAT; beatN++; }
    }
    if (mode === 0) {
      if (pushing.size || (driver && !hb)) { mode = 1; tell({ k: "go" }); }
      else return;
    }
    if (mode !== 1) return;
    const n = Math.max(startN, ps.length);
    const roof = lads.some((l) => l.kind === 1 && l.t > 3), front = lads.some((l) => l.kind === 2 && l.t > 3);
    // whoever's in the cab has their hands full, so the bus is weighed for one fewer
    const M = ((kind === "bus" ? 0.5 : 0.1) + Math.max(1, n - (driver ? 0.7 : 0)) * 1.1) * (1 + diff * 0.1) + (roof ? 0.8 : 0);
    const b = pose();
    let F = slots.filter(Boolean).length;
    for (let i = surges.length - 1; i >= 0; i--) { F += surges[i].f; if ((surges[i].left -= dt) <= 0) surges.splice(i, 1); }
    if (front) F -= 1.3;
    // a steeper hill is harder, but not so much harder that a steep one can't be done
    const G = (M * b.grade) / (0.5 * steep + 0.075);
    const scraping = Math.abs(lat) >= latMax - 0.02;
    const resist = M * (ROLL + (scraping ? 0.3 : 0));
    const net = F - G;
    if (hb) {
      const k = Math.abs(v) < 3 ? 6 : 1.8;
      v = v > 0 ? Math.max(0, v - k * dt) : Math.min(0, v + k * dt);
    } else if (Math.abs(v) < 0.04 && Math.abs(net) <= resist) v = 0;
    else {
      const dir = v !== 0 ? Math.sign(v) : Math.sign(net);
      const drag = v > 0 ? 0.12 * v + 0.06 * v * v : 0.08 * v - 0.01 * v * v;
      v += ((net - resist * dir) / M - drag) * dt;
    }
    // a car stuck nose to nose: it won't go on up till the car's by
    if (carSt === 2 && v > 0) v = 0;
    s += v * dt;
    // the road's camber walks it into the kerb, unless someone's steering (less so on your own, with nobody to steer)
    const camber = (-0.05 - 0.03 * Math.sin(s * 0.031 + (offer.seed % 7))) * (n > 1 ? 1 : 0.3);
    lat = Math.max(-latMax, Math.min(latMax, lat + v * dt * (camber + (driver ? steer * 0.32 : 0))));
    if (v < GRIP && slots.some(Boolean)) { slots.fill(""); pushing.clear(); tell({ k: "away" }); }
    if (s - hl < 0) {
      mode = 2; tell({ k: "lost" });
    } else if (s >= top) {
      mode = 3; tell({ k: "won" });
    }
    // the car coming down
    nextCar -= dt;
    if (!carSt && nextCar <= 0) {
      nextCar = (40 + hr() * 30) * (1 - diff * 0.15);
      if (s + 70 < hill.len) { carSt = 1; carS = Math.min(hill.len, s + 90); carW = 0; }
    }
    if (carSt) {
      const gap = carS - 2.1 - (s + hl);
      const room = lat + hw < carLat - 0.95 - 0.25;
      if (carSt === 1) { carS -= 7 * dt * Math.min(1, Math.max(0.15, gap / 12)); if (gap < 3 && !room) { carSt = 2; tell({ k: "car" }); } }
      else if (carSt === 2) { carW += dt; if (room || carW > 12) carSt = 3; }
      else carS -= 5 * dt;
      if (carSt === 1 && gap < 3 && room) carSt = 3;
      if (carS < s - hl - 40) { carSt = 0; carS = -1; }
    }
    // naughty boys
    if (!w.passive) {
      nextLad -= dt;
      if (nextLad <= 0) {
        nextLad = (30 + hr() * 30) * (1 - diff * 0.15) / Math.min(2, 0.8 + n * 0.2);
        const l = lads.find((q) => !q.kind);
        if (l) { l.kind = hr() < 0.5 ? 1 : 2; l.t = 0; }
      }
      for (const l of lads) if (l.kind && (l.t += dt) > 40) l.kind = 0;
    }
  }

  function tell(d: Record<string, unknown>) {
    const m = { ...d, s: offer.seed };
    w.send("qe", m);
    job.event!(m, w.selfId);
  }

  const state = () => ({
    k: "b", s: offer.seed, q: [+s.toFixed(2), +v.toFixed(2), +lat.toFixed(2), hb ? 1 : 0, +ph.toFixed(2), mode, +carS.toFixed(1), carSt],
    sl: slots, d: driver, ld: lads.map((l) => [l.kind, +l.t.toFixed(1)]),
  });

  // ---- drawing it ------------------------------------------------------------------------------
  function drawBus(dt: number) {
    const now = performance.now();
    broken.update(now / 1000);
    if (mode === 2) {
      // careering off down the street, slewing round, into the hedge or the water
      runT += dt;
      const k = Math.min(1, runT / (RUNAWAY - 1.5)), ease = 1 - (1 - k) * (1 - k);
      const x = runFrom.x + (runTo[0] - runFrom.x) * ease, z = runFrom.z + (runTo[1] - runFrom.z) * ease;
      bus.place(x, z, runFrom.a + ease * 0.9);
      bus.pose(dt, now);
      if (pond && k >= 1) {
        if (sink === 0) { const [d, pan] = w.hear?.(x, bus.y, z) ?? [0, 0]; SFX.impact("ground", d, pan, true); SFX.crash(1.4, d, pan); w.dust?.(x, bus.y + 0.5, z, 0, 0); }
        sink = Math.min(1, sink + dt * 0.6);
        bus.root.position.y -= sink * 1.8;
        bus.root.rotation.z = sink * 0.25;
      } else if (!pond && k > 0.8 && hedge.scale.y > 0.3) {
        hedge.scale.y = 0.25; hedge.rotation.x = 0.3;
        const [d, pan] = w.hear?.(x, bus.y, z) ?? [0, 0];
        SFX.crash(1.2, d, pan);
        for (let i = 0; i < 4; i++) w.dust?.(hedge.position.x + (i - 1.5), hedge.position.y + 0.8, hedge.position.z, Math.sin(i), Math.cos(i));
      }
      knockBins(x, z, -Math.max(4, runFrom.v), runFrom.a, dt);
      if (runT >= RUNAWAY && !job.done) {
        job.done = { won: false, text: pond ? "It got away from you, all the way down and into the water" : "It got away from you, all the way down and into a hedge", x: runTo[0], z: runTo[1] };
      }
      return;
    }
    const b = pose();
    bus.place(b.x, b.z, b.a);
    bus.pose(dt, now);
    bus.hand = hb;
    knockBins(b.x, b.z, v, b.a, dt);
    // the car coming down the other side of the street
    carObj.visible = carSt > 0;
    if (carSt) {
      const p = along(hill, Math.max(0, Math.min(hill.len, carS))), cl = carSt === 3 && Math.abs(lat) + hw > carLat - 1.2 ? carLat + 0.6 : carLat;
      const x = p.x - p.fz * cl, z = p.z + p.fx * cl;
      carObj.position.set(x, w.map.ground(x, z), z);
      carObj.rotation.y = Math.atan2(p.fz, -p.fx);
    }
    // the naughty boys
    for (const [i, l] of lads.entries()) {
      if (!l.kind) { if (l.fig) l.fig.root.visible = false; l.said = false; continue; }
      if (!l.fig) {
        l.fig = new Figure();
        l.fig.dress(look(NAUGHTY, 0));
        w.scene.add(l.fig.root);
      }
      const f = l.fig;
      f.root.visible = true;
      // he runs in from the pavement for his first three seconds
      const inK = Math.min(1, l.t / 3);
      const side = i ? 1 : -1;
      let x: number, y: number, z: number, yaw: number;
      if (l.kind === 1) {
        const tx = b.x - b.fx * (hl - 0.8), tz = b.z - b.fz * (hl - 0.8);
        const sx = tx + b.rx * side * (hw + 3), sz = tz + b.rz * side * (hw + 3);
        x = sx + (tx - sx) * inK; z = sz + (tz - sz) * inK;
        y = inK < 1 ? w.map.ground(x, z) : bus.top;
        yaw = Math.atan2(b.fx, b.fz);
      } else {
        const tx = b.x + b.fx * (hl + 0.6), tz = b.z + b.fz * (hl + 0.6);
        const sx = tx + b.rx * side * (hw + 4), sz = tz + b.rz * side * (hw + 4);
        x = sx + (tx - sx) * inK; z = sz + (tz - sz) * inK;
        y = w.map.ground(x, z);
        yaw = Math.atan2(b.fx, b.fz) + Math.PI;
      }
      f.pose(x, y, z, yaw, inK < 1 ? 5 : 0, l.kind === 2 && inK >= 1 ? 0.5 + 0.5 * Math.sin(now / 180) : 0, 0, dt);
      if (inK >= 1 && !l.said) { l.said = true; const lines = ladLines[l.kind as 1 | 2]; f.say(lines[Math.floor((offer.seed + i + Math.floor(now / 1000)) % lines.length)]); }
    }
  }

  function knockBins(x: number, z: number, speed: number, a: number, dt: number) {
    let moved = false;
    const fx = Math.cos(a), fz = -Math.sin(a);
    for (const bn of bins) {
      if (!bn.hit && Math.abs(speed) > 1.2) {
        const dx = bn.x - x, dz = bn.z - z, al = dx * fx + dz * fz, ac2 = -dx * fz + dz * fx;
        if (Math.abs(al) < hl + 0.4 && Math.abs(ac2) < hw + 0.75) {
          bn.hit = true;
          const sp = Math.min(9, Math.abs(speed) * 1.6 + 1), dir = Math.sign(speed) || 1;
          bn.vx = fx * sp * dir + (ac2 > 0 ? -fz : fz) * 2; bn.vz = fz * sp * dir + (ac2 > 0 ? fx : -fx) * 2; bn.vy = 3 + Math.abs(speed) * 0.4;
          const [d, pan] = w.hear?.(bn.x, bn.y, bn.z) ?? [0, 0];
          SFX.impact("barrier", d, pan, true);
        }
      }
      if (bn.hit && (bn.vy !== 0 || bn.vx || bn.vz)) {
        bn.x += bn.vx * dt; bn.z += bn.vz * dt; bn.y += bn.vy * dt; bn.vy -= 18 * dt;
        bn.rx += bn.vz * dt * 2; bn.rz -= bn.vx * dt * 2; bn.spin += dt * 4;
        const g = w.map.ground(bn.x, bn.z);
        if (bn.y <= g) { bn.y = g; bn.vy = 0; bn.vx *= 0.6; bn.vz *= 0.6; bn.rx = Math.PI / 2 * Math.sign(bn.rx || 1); if (Math.hypot(bn.vx, bn.vz) < 0.3) bn.vx = bn.vz = 0; }
        moved = true;
      }
    }
    if (moved) drawBins();
  }

  // ---- the job ---------------------------------------------------------------------------------
  w.mark("@challenge", { x: hill.pts[0][0], z: hill.pts[0][1] }, "The broken-down bus", COLOUR);
  w.toast(`The bus has broken down at the bottom of ${hill.name}`, 4);
  const routeLine = { pts: hill.pts.flatMap((p) => [p[0], p[1]]), gates: [] as number[], colour: COLOUR };

  const job: Job = {
    offer, done: null,
    update(dt) {
      const me = w.me();
      if (!w.isHost && mode === 1) {
        // a guest runs it on from the host's last word, and eases towards it
        const age = (performance.now() - heardAt) / 1000;
        const want = ts + tv * Math.min(0.5, age);
        s += v * dt; s += (want - s) * Math.min(1, dt * 4);
      }
      if (!w.isHost && mode <= 1) {
        ph += dt; if (ph >= BEAT) ph -= BEAT;
        for (const l of lads) if (l.kind) l.t += dt;
      }
      drawBus(dt);
      if (job.done) return;
      // the beat: a count in, and the heave
      if (mode <= 1 && Math.hypot(me.x - bus.x, me.z - bus.z) < 45) {
        if (lastPh < BEAT - 1.2 && ph >= BEAT - 1.2) SFX.pip();
        if (lastPh < BEAT - 0.6 && ph >= BEAT - 0.6) SFX.pip();
        if (lastPh - ph > BEAT / 2) { SFX.pip(true); if (mySlot() >= 0) SFX.effort(0, 0, 1); }
      }
      lastPh = ph;
      // a shout of "HEAVE!" on the beat counts as a press on it
      if (voiceLevel.shoutAt > shoutUsed) {
        shoutUsed = voiceLevel.shoutAt;
        const off = Math.min(ph, BEAT - ph);
        if (mySlot() >= 0 && mode <= 1 && off < WINDOW) { say({ k: "h", g: 1 - (off / WINDOW) * 0.5 }); SFX.effort(0, 0, 1); }
      }
      // still pushing, or stepped off
      if (!holding) letGoT += dt; else letGoT = 0;
      const on = !inCab && me.alive && (holding || letGoT < LETGO) && (mySlot() >= 0 || nearRear()) && mode <= 1 && v > GRIP;
      sentT -= dt;
      if (on !== sentOn || (on && sentT <= 0)) { sentOn = on; sentT = 1; say({ k: "p", on: on ? 1 : 0 }); }
      // the cab
      if (inCab) {
        if (!me.alive) { leaveCab(); say({ k: "cab", on: 0 }); }
        const kx = (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) - (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0);
        const st = Math.max(-1, Math.min(1, kx || (Math.abs(w.stick?.().x ?? 0) > 0.15 ? w.stick!().x : 0)));
        if (Math.abs(st - mySteer) > 0.2) { mySteer = st; sendDrive(); }
        if ((sentSteerT -= dt) <= 0) sendDrive();
      }
      // scraping the kerb: a grind and a bit of dust
      if (mode === 1 && Math.abs(lat) >= latMax - 0.02 && Math.abs(v) > 0.3 && (scrapeT -= dt) <= 0) {
        scrapeT = 0.8;
        const b = pose(), side = Math.sign(lat), x = b.x + b.rx * side * hw, z = b.z + b.rz * side * hw;
        const [d, pan] = w.hear?.(x, bus.y, z) ?? [0, 0];
        SFX.grind(d, pan, 0.7);
        w.dust?.(x, bus.y + 0.3, z, b.rx * side, b.rz * side);
      }
      // the others at the back drawn bent to it, hands on the bus
      const now = new Set(slots.filter((id) => id && id !== w.selfId));
      for (const id of posed) if (!now.has(id)) { w.pose?.(id, 0, ""); posed.delete(id); }
      for (const id of now) if (!posed.has(id)) { w.pose?.(id, 0, "push"); posed.add(id); }
      // its marker from afar; close to, the bus is plain to see
      if ((markT -= dt) <= 0) { markT = 0.5; w.mark("@challenge", Math.hypot(me.x - bus.x, me.z - bus.z) > 60 ? { x: bus.x, z: bus.z, y: bus.top + 1 } : null, "The bus", COLOUR); }
    },
    host(dt) {
      if (job.done) return;
      hostStep(dt);
      if ((sendT -= dt) <= 0) { sendT = SEND; w.send("qe", state()); }
    },
    event(d, from) {
      if (!d) return;
      if (d.k === "b") { if (!w.isHost) take(d); return; }
      if (!w.isHost && from !== w.selfId && ["p", "h", "cab", "dr", "lad"].includes(d.k)) return;
      if (w.isHost) {
        if (d.k === "p") { if (d.on) pushing.set(from, performance.now()); else pushing.delete(from); return; }
        if (d.k === "h" && mode <= 1 && slots.includes(from)) {
          const bi = beatN + (ph > BEAT / 2 ? 1 : 0);
          if (heaved.get(from) === bi) return;
          heaved.set(from, bi);
          if (bi !== syncBeat) { syncBeat = bi; syncN = 0; }
          syncN++;
          const g = Math.max(0.4, Math.min(1, +d.g || 0));
          surges.push({ left: SURGE_T, f: (SURGE / SURGE_T) * g * (1 + 0.25 * (syncN - 1)) });
          pushing.set(from, performance.now());
          return;
        }
        if (d.k === "cab") {
          if (d.on && (!driver || driver === from)) { setDriver(from); steerHeard = performance.now(); }
          else if (!d.on && driver === from) { setDriver(""); hb = false; }
          return;
        }
        if (d.k === "dr" && from === driver) { steer = Math.max(-1, Math.min(1, +d.st || 0)); hb = !!d.hb; steerHeard = performance.now(); return; }
        if (d.k === "lad") { const l = lads[d.i | 0]; if (l?.kind) { l.kind = 0; tell({ k: "ladoff", i: d.i | 0, by: from }); } return; }
      }
      if (d.k === "go") { mode = 1; if (Math.hypot(w.me().x - bus.x, w.me().z - bus.z) < 60) w.toast("The chocks are out. Push!", 2.5); }
      else if (d.k === "away") { holding = false; if (mySlot() >= 0 || nearRear()) w.toast("It's getting away from you!", 2.5); slots.fill(""); }
      else if (d.k === "car") {
        const [dd, pan] = w.hear?.(carObj.position.x, carObj.position.y, carObj.position.z) ?? [0, 0];
        SFX.screech(dd, pan);
        if (inCab) w.toast(`A car coming down. Pull in: ${keyLabel("KeyA")}`, 3);
      }
      else if (d.k === "ladoff") {
        const l = lads[d.i | 0];
        if (l) { l.kind = 0; if (l.fig) l.fig.root.visible = false; }
        w.feed(`<b style="color:${w.colourOf(d.by)}">${esc(w.nameOf(d.by))}</b> knocked a naughty boy off the bus`);
      }
      else if (d.k === "lost" && mode !== 2) {
        const b = pose();
        mode = 2; runT = 0; runFrom = { x: b.x, z: b.z, a: b.a, v: Math.max(4, -v) };
        holding = false; leaveCab();
        const [dd, pan] = w.hear?.(b.x, bus.y, b.z) ?? [0, 0];
        SFX.screech(dd, pan);
        w.toast("It's away! Back past the bottom and still going", 3);
      }
      else if (d.k === "won" && !job.done) {
        mode = 3;
        const t = hill.pts[hill.pts.length - 1];
        job.done = { won: true, text: `You pushed the bus all the way up ${hill.name}`, x: t[0], z: t[1] };
      }
    },
    progress: () => state(),
    restore(p) { if (p?.k === "b") take(p, true); },
    use() {
      if (mode >= 2) return false;
      if (inCab) { leaveCab(); setDriver(driver === w.selfId ? "" : driver); say({ k: "cab", on: 0 }); return true; }
      if (nearRear() || mySlot() >= 0) {
        if (v <= GRIP) { w.toast("Too fast: you can't hold it", 1.5); return true; }
        holding = true; letGoT = 0;
        // a press right on the heave
        const off = Math.min(ph, BEAT - ph);
        if (off < WINDOW) { say({ k: "h", g: 1 - (off / WINDOW) * 0.5 }); SFX.effort(0, 0, 1); }
        if (!sentOn) { sentOn = true; sentT = 1; say({ k: "p", on: 1 }); }
        return true;
      }
      if (nearCab()) {
        if (driver && driver !== w.selfId) { w.toast(`${w.nameOf(driver)}'s in the cab`, 2); return true; }
        inCab = true; myHb = hb; mySteer = 0;
        bus.inside(true);
        say({ k: "cab", on: 1 });
        sendDrive();
        w.toast(`In the cab: ${keyLabel("KeyA")} ${keyLabel("KeyD")} to steer, ${keyLabel("Space")} for the handbrake, ${keyLabel("KeyE")} to get out`, 4);
        return true;
      }
      return false;
    },
    hint() {
      if (mode >= 2) return "";
      if (inCab) return `<b>E</b> Get out of the cab · ${keyLabel("Space")} handbrake ${myHb ? "off" : "on"}`;
      if (mySlot() >= 0 && (holding || letGoT < LETGO)) {
        const toBeat = BEAT - ph;
        if (ph < 0.35 || toBeat < 0.25) return `<b>E</b> HEAVE!`;
        if (toBeat < 1.25) return `Let go... <b>E</b> on the heave ${toBeat < 0.65 ? "· 1" : "· 2"}`;
        return `Pushing · tap <b>E</b> on the heave`;
      }
      if (nearRear()) return v <= GRIP ? "It's rolling too fast to hold" : `Hold <b>E</b> to push the bus`;
      if (nearCab()) return driver && driver !== w.selfId ? `${esc(w.nameOf(driver))}'s in the cab` : `<b>E</b> Climb into the cab`;
      return "";
    },
    held() {
      if (mode >= 2 || job.done) return null;
      if (inCab) { const st = bus.seat(0); return { x: st.x, z: st.z, y: st.y }; }
      const k = mySlot();
      if (k >= 0 && (holding || letGoT < LETGO)) return slotAt(k);
      return null;
    },
    card() {
      const me = w.me(), dist = Math.hypot(me.x - bus.x, me.z - bus.z);
      const up = Math.max(0, Math.min(1, (s - s0) / Math.max(1, top - s0)));
      const pushers = slots.filter(Boolean).length;
      const stage = up > 0.5 ? { key: "half", title: "Halfway up", sub: hill.name } : undefined;
      if (mode === 2) return { line: "It's away! Back down the hill and still going", progress: "0%", bar: 0 };
      if (dist > 40) return { line: `The bus is ${far(dist)} ${compassWord(bus.x - me.x, bus.z - me.z)}, on ${hill.name}`, progress: `${Math.round(up * 100)}%`, bar: up, stage };
      if (inCab) {
        const how = Math.abs(v) < 0.05 ? (hb ? "Held on the handbrake" : "Stood still") : v < 0 ? `Rolling back ${(-v).toFixed(1)} m/s` : `Going up ${v.toFixed(1)} m/s`;
        const kerb = Math.abs(lat) >= latMax - 0.02 ? " · scraping the kerb, steer off it" : "";
        return { line: `${how} · ${Math.round(s - hl)} m above the bottom${kerb}`, sub: carSt === 2 ? "A car can't get by: pull in" : `${pushers} pushing`, progress: `${Math.round(up * 100)}%`, bar: up, stage };
      }
      const heave = BEAT - ph < 0.6 || ph < 0.3 ? "HEAVE!" : "";
      return {
        line: mode === 0 ? `Hold ${keyLabel("KeyE")} at the back to push, and press it again on each heave` : heave || `${pushers} pushing${driver ? ` · ${w.nameOf(driver)} in the cab` : ""}`,
        sub: carSt === 2 ? "There's a car stuck in front: someone get in the cab and pull in" : lads.some((l) => l.kind && l.t > 3) ? "A naughty boy's on it: shoot him off" : undefined,
        progress: `${Math.round(up * 100)}%`, bar: up, stage,
      };
    },
    hit(o, d, max) {
      let best: Quarry | null = null;
      lads.forEach((l, i) => {
        if (!l.kind || !l.fig || l.t < 1) return;
        const p = l.fig.root.position, h = hitPosed(o, d, l.fig.body, p.x, p.y, p.z);
        if (h && h.dist < max && (!best || h.dist < best.dist)) best = { dist: h.dist, head: h.head, ref: i };
      });
      return best;
    },
    shoot(q) {
      const l = lads[q.ref];
      if (!l?.kind) return;
      l.kind = 0;
      if (l.fig) l.fig.root.visible = false;
      say({ k: "lad", i: q.ref });
    },
    obstacles: () => (mode >= 2 ? [] : [{ x: bus.x, z: bus.z, r: hl, parked: true, a: bus.a }]),
    route: () => (job.done ? null : routeLine),
    end() {
      ac.abort();
      for (const id of posed) w.pose?.(id, 0, "");
      bus.inside(false);
      w.mark("@challenge", null);
      broken.dispose();
      w.scene.remove(bus.root, binMesh, carObj, hedge);
      const k = w.map.movers.indexOf(bus);
      if (k >= 0) w.map.movers.splice(k, 1);
      binGeo.dispose(); binMat.dispose(); binMesh.dispose();
      for (const l of lads) if (l.fig) w.scene.remove(l.fig.root);
    },
  };

  /** The host's word on the bus (or, joining, how far it had got). */
  function take(d: any, jump = false) {
    const q = d.q;
    if (!Array.isArray(q) || q.length < 8 || !q.every(Number.isFinite)) return;
    ts = q[0]; tv = q[1]; v = q[1]; lat = q[2]; hb = !!q[3]; ph = q[4]; carS = q[6]; carSt = q[7];
    if (q[5] <= 1 && mode <= 1) mode = q[5];
    else if (q[5] === 2 && mode <= 1) job.event!({ k: "lost" }, "@host");
    else if (q[5] === 3 && mode <= 1) job.event!({ k: "won" }, "@host");
    if (jump || w.isHost || heardAt === 0 || Math.abs(ts - s) > 6) s = ts;
    heardAt = performance.now();
    if (Array.isArray(d.sl)) for (let k = 0; k < slots.length; k++) slots[k] = typeof d.sl[k] === "string" ? d.sl[k] : "";
    setDriver(typeof d.d === "string" ? d.d : "");
    if (Array.isArray(d.ld)) d.ld.forEach((l: unknown, i: number) => { if (lads[i] && Array.isArray(l)) { lads[i].kind = +l[0] || 0; lads[i].t = +l[1] || 0; } });
  }

  function setDriver(id: string) {
    if (id === driver) return;
    driver = id;
    bus.sit(0, id && id !== w.selfId ? id : "", id ? w.colourOf(id) : "#fff");
    if (id !== w.selfId && inCab) leaveCab();
  }
  function leaveCab() { inCab = false; bus.inside(false); }

  return job;
}
