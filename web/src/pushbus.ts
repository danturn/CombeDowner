// Push the Bus, a team challenge (challenges.ts): a Badgerline bus has broken down at the foot of
// the steepest long street on the map, and it has to be pushed all the way to the top. E (Use) at its
// back puts your hands to it (drawn in your view, flat on the panel) and you go with it, free to look
// about, till you press E again or step back. Every couple
// of seconds comes a count, "one, two, HEAVE!", shown big on the screen with a sweep across a bar;
// Space (the Heave button on a touch screen) right on the heave gives a surge, and so does shouting
// "HEAVE!" into your mic right on it. Heaving together counts for more. Steady shoving on its own soon
// tires, so it's the heaves that get it up the hill: stop heaving, or too few pushing, and it slows,
// stops and starts rolling back, faster and faster, until it gets away from you. Someone can climb
// into the cab (E at the front) to steer it off the kerb (A and D) and pull the handbrake (Space) to
// hold it while the pushers get their breath back, though held too long it smokes and slips, and
// letting it off right on a heave gives a clean start. Only the cab sees how fast it's going and
// what's coming down the hill, so they have to call it out. With three or more, one pusher can take
// the call (Q, or shout HEAVE three beats running): then the heave comes when they heave, and the
// beat follows them, quicker or slower within limits, till they stop and the game counts again. A car coming
// down the hill can't get by unless the bus is pulled in, a parked car in its way is shoved aside,
// and a naughty boy now and then climbs on the roof (more weight) or shoves at the front: shoot him off.
// Roll it back past where it started and it's lost: it careers off backwards on its own, through the
// bins, the parked cars and the traffic and over anyone in the way, till a wall, a car or the bottom
// of the hill stops it (or it rolls into the water). There it sits with its hazards going for a few
// minutes, or till the next day's bus turns up.
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
// going, how far over it's drifted, the heave's beat, the car coming down and the naughty boys, the
// parked cars it shoves aside, and the runaway once it's lost (where it goes, what it hits, where it
// comes to rest), and sends it all ("qe" k "b") about ten times a second. Each player says only
// whether they're pushing, when they heaved and how well it was timed (judged on their own screen,
// whether they pressed or shouted "heave": voicelevel.ts), and, in the cab, the steering and the
// handbrake. The beat on each screen is that player's own clock, eased towards the host's (allowing
// for how long its word took to arrive, from pings), never jumping, so a player a long way off is
// judged fairly; the host counts heaves as together by which beat they were for, not when they
// arrived. The caller says how far off the beat they heaved, and the host moves the beat to match.
// The host says who calls, and when it's won or lost. The bins it knocks flying are each player's
// own, just for show.
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
import { compassWord, esc, far, leftInRoad, rng, type Job, type Quarry, type QuestWorld, type Waiting } from "./quests";
import { contact, Vehicle, type VKind } from "./vehicles";
import { voiceLevel } from "./voicelevel";

const COLOUR = "#f2c318";
const STEP = 5;                  // the hill's line is kept as a point every this many metres
const MIN_LEN = 200, MAX_LEN = 400;
const BEAT = 2.4;                // seconds between heaves, when the game counts
const BEAT_MIN = 1.6, BEAT_MAX = 3.2;  // how far a caller can hurry or drag it
const WINDOW = 0.32;             // how close to the heave a press must be to count
// the mic is only looked at fifteen times a second, and the loud part of "HEAVE!" comes after its
// start, so a shout is judged as if it came this much earlier, and gets a little more leeway
const SHOUT_LAG = 0.12, SHOUT_WINDOW = 0.4;
const SHOUT_RISE = 0.08;         // how sharply your own level must jump for a shout to be yours, not a mate's from your speakers
const HB_HOLD = 12, HB_COOL = 8; // seconds the handbrake takes to get too hot to hold, and to cool again
const CALL_MIN = 3;              // players before anyone can take the call
const SURGE = 2.9, SURGE_T = 0.55;     // a heave's shove (in pusher-seconds), and how long it lasts
const ROLL = 0.15;               // rolling resistance, as a share of the weight
const GRIP = -2.6;               // rolling back faster than this, m/s, it gets away from the pushers
const REACH = 2.4;               // how close to its back (or its cab) to take hold
const FRESH = BEAT * 1.5;        // a pusher's steady shove is full for this long after their last heave,
const TIRED = 0.35;              // and then fades to this over as long again
const SETTLE = 5;                // seconds the runaway sits where it stopped before it's called lost
const KEEP = 180;                // and how long it's left there after that, hazards going
const RUN_MAX = 30;              // a runaway that's still going after this long is stopped where it is
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
  const grade = Math.min(Math.max(0.06, h.rise / h.len * 1.3), (P[g1][2] - P[g0][2]) / ((g1 - g0) * STEP || 1));
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

const touchOn = () => document.getElementById("touch")?.hidden === false;
const heaveName = () => (touchOn() ? "Heave" : keyLabel("Space"));

const busKind = (players: number): VKind => (players >= 3 ? "bus" : "minibus");
const busNumber = (seed: number) => 990000 + (seed % 1000);

/** Takes away the last lost bus, left where it came to rest, if it's still there. */
let wreck: (() => void) | null = null;
const clearWreck = () => { const f = wreck; wreck = null; f?.(); };

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
  private hatch: THREE.Object3D[] = [];

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
    this.hatch = [bay, hinge];
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

  /** The hatch shut and the steam gone, for pushing: they'd stand in the pushers' faces otherwise. */
  shut() { for (const o of [...this.hatch, ...this.steam]) o.visible = false; }

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
    clearWreck();
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
  blurb: "The bus has broken down at the bottom of the hill. Get behind it and heave it all the way to the top, on the count."
    + "<br>On your own: push, and heave on every HEAVE!"
    + "<br>Two or more: one can take the cab, the only one who sees how fast it's going and what's coming, with the handbrake to let the pushers rest"
    + "<br>Three or more: one pusher can take the call (Q), and the heaves go when they say",
  glyph: "B", colour: COLOUR, tier: 1, stars: 3,
  goal: () => `Push the bus to the top of the hill: ${touchOn() ? "Use" : keyLabel("KeyE")} at its back, then ${heaveName()} on every HEAVE! One of you can take the cab at the front, and with three, one can call the heaves`,
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
  start({ offer, spots, w, by }) { return pushTheBus(offer, spots, w, by); },
});

/** The day's hill and how hard a day it is, from the day's seed alone, so the bus waits where the push starts. */
function dayHill(seed: number, hills: ReturnType<typeof hillsOf>) {
  const diff = Math.floor(rng(seed ^ 0x2c1b3c6d)() * 3);   // 0 an easy day .. 2 a hard one
  return { diff, hill: hills[Math.max(0, Math.min(hills.length - 1, 2 - diff))] ?? hills[0] };
}

function pushTheBus(offer: Job["offer"], spots: ChallengeSpot[], w: QuestWorld, by: string): Job {
  clearWreck();
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
  let s = s0, v = 0, lat = rest.lat, hb = false, heat = 0, period = BEAT, caller = "";
  let mode = 0;                  // 0 waiting at the bottom on its chocks, 1 on the go, 2 got away and careering off, 3 at the top, 4 come to rest, lost
  let driver = "";
  const slots: string[] = Array.from({ length: kind === "bus" ? 8 : 7 }, () => "");
  let carS = -1, carSt = 0, carW = 0;   // the car coming down: how far up it is, 0 none / 1 coming / 2 stuck / 3 squeezing by
  const lads: Lad[] = [{ kind: 0, t: 0, fig: null, said: false }, { kind: 0, t: 0, fig: null, said: false }];
  let ts = s, tv = 0, heardAt = 0;      // a guest's last word from the host
  let runT = 0, restT = 0, settleT = 0, sink = 0, wet = false, struck = "", bangT = 0;
  const runAt = { x: 0, z: 0, a: 0 };   // a guest's last word on where the runaway is

  // the host's own
  const pushing = new Map<string, number>();       // who says they're pushing, and when they last said so
  const surges: { left: number; f: number }[] = [];
  let hph = 0, beatN = 0, syncBeat = -1, syncN = 0, hosting = false, callerBeat = 0, callerT = 0;
  const shoutRun = new Map<string, number[]>();   // each pusher's run of shouted heaves: [last beat, how many running]
  const pings = new Map<string, number[]>();      // each guest's last ping: [their time, when it came]
  const heaved = new Map<string, number>();     // the beat each pusher last heaved on, so it's one heave a beat
  const lastHeave = new Map<string, number>();  // and when, for how tired their steady shove is
  const knocked = new Map<number, number>();    // the cars it's shoved aside, and when, so each is shoved once
  let steer = 0, steerHeard = 0;
  let nextCar = 30 + r() * 20 - diff * 6, nextLad = 35 + r() * 20 - diff * 6;
  const hr = rng(offer.seed ^ 0x5bd1e995);

  // your own
  let onBus = false, stickFree = false, sentOn = false, sentT = 0, inCab = false, myHb = false, mySteer = 0, sentSteerT = 0;
  // the beat on your screen: your own clock, which never jumps, eased towards where the host's is
  // now (its last word, plus how long that took to get here, plus how long ago it came)
  let ph = 0, wraps = 0, myBeat = -1, toldHow = false, calledAt = -1e9;
  let modelPh = 0, modelAt = -1, oneWay = 0, pingT = 0, lastPing = 0, slipT = 0, smokeT = 0;
  const rtts: number[] = [];
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

  /** Whether (x, z) is in the water (a pond, the river, the canal), for where a runaway ends up. */
  const inWater = (x: number, z: number) => {
    for (const m of [w.map, ...w.map.tilesNear(x, z, 10)]) for (const wp of [...(m === w.map ? w.map.wide?.wp ?? [] : []), ...(m.d.wp ?? [])]) {
      const ring = wp.r[0];
      if (!ring) continue;
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i], [xj, yj] = ring[j];
        if (yi > -z !== yj > -z && x < ((xj - xi) * (-z - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) return true;
    }
    return false;
  };

  // ---- input: E at the back to get on and off, Space (or Heave) on the beat, A/D and Space in the cab, Q to take the call
  const ac = new AbortController(), sig = { signal: ac.signal };
  // only stepping back lets go: a stray A or D mustn't drop you off the bus
  const AWAY = new Set(["KeyS", "ArrowDown"]);
  addEventListener("keydown", (e) => {
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === "Space") { if (inCab) handbrake(); else if (onBus) heave(false); }
    else if (e.code === "KeyQ" && onBus) takeCall();
    else if (onBus && AWAY.has(e.code)) stepOff();
  }, sig);
  addEventListener("keyup", (e) => { keys.delete(e.code); }, sig);
  addEventListener("blur", () => { keys.clear(); }, sig);
  const tjump = document.getElementById("t-jump");
  tjump?.addEventListener("pointerdown", () => { if (inCab) handbrake(); else if (onBus) heave(false); }, sig);
  let callBtn: HTMLButtonElement | null = null;
  function callButton(want: boolean) {
    if (want && !callBtn) {
      const host = document.getElementById("touch");
      if (!host) return;
      const b = (callBtn = document.createElement("button"));
      b.className = "tbtn small";
      b.style.cssText = "position:absolute;right:16px;top:38%";
      b.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); takeCall(); });
      host.appendChild(b);
    } else if (!want && callBtn) { callBtn.remove(); callBtn = null; }
    if (callBtn) { const t = caller === w.selfId ? "Stop calling" : "Call"; if (callBtn.textContent !== t) callBtn.textContent = t; }
  }

  // ---- the count on the screen: who's calling, the word, a sweep across a bar to the heave, and how you did.
  // The bar is what to time to: the pips are only a help, and come late through some headphones
  const beatEl = document.createElement("div");
  beatEl.id = "pushbeat";
  beatEl.style.cssText = "position:fixed;left:50%;top:calc(50% + 84px);transform:translateX(-50%);width:280px;text-align:center;pointer-events:none;color:#fff;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;text-shadow:0 2px 3px #000;z-index:6;display:none";
  beatEl.innerHTML = `<div style="font-size:14px;height:18px;color:${COLOUR}"></div>`
    + `<div style="font-size:30px;line-height:1.1;height:34px"></div>`
    + `<div style="position:relative;height:14px;margin:6px 0 4px;background:rgba(0,0,0,0.5);border:2px solid #fff;border-radius:8px;overflow:hidden">`
    + `<div style="position:absolute;top:0;bottom:0;background:${COLOUR};opacity:0.45"></div>`
    + `<div style="position:absolute;top:0;bottom:0;left:50%;width:2px;margin-left:-1px;background:#fff"></div>`
    + `<div style="position:absolute;top:-2px;bottom:-2px;width:6px;margin-left:-3px;background:#fff;border-radius:3px;box-shadow:0 0 6px #000"></div></div>`
    + `<div style="font-size:17px;height:22px"></div>`;
  document.body.appendChild(beatEl);
  const [beatWho, beatWord, beatBar, beatSay] = [...beatEl.children] as HTMLElement[];
  const beatZone = beatBar.children[0] as HTMLElement, beatDot = beatBar.children[2] as HTMLElement;
  let sayT = 0, zoneFor = 0;
  const flash = (text: string, colour: string) => { beatSay.textContent = text; beatSay.style.color = colour; sayT = 0.9; };
  function drawBeat(dt: number, show: boolean) {
    beatEl.style.display = show ? "block" : "none";
    if (tjump && touchOn()) { const want = onBus && !inCab ? "Heave" : "Jump"; if (tjump.textContent !== want) tjump.textContent = want; }
    if (!show) return;
    if (zoneFor !== period) { zoneFor = period; beatZone.style.left = `${50 - (WINDOW / period) * 100}%`; beatZone.style.width = `${(2 * WINDOW / period) * 100}%`; }
    const who = caller === w.selfId ? "You call it: heave when you like" : caller ? `${w.nameOf(caller)} calls` : "";
    if (beatWho.textContent !== who) beatWho.textContent = who;
    const toBeat = period - ph, now = ph < WINDOW || toBeat < WINDOW;
    const word = now ? "Heave!" : toBeat <= 0.6 ? "Two..." : toBeat <= 1.2 ? "One..." : "";
    if (beatWord.textContent !== word) beatWord.textContent = word;
    beatWord.style.color = now ? COLOUR : "#fff";
    beatWord.style.transform = now ? "scale(1.25)" : "none";
    // the heave is the middle of the bar: the dot sweeps across to it, and on, and round again
    beatDot.style.left = `${(((ph + period / 2) % period) / period) * 100}%`;
    sayT -= dt;
    beatSay.style.opacity = String(Math.max(0, Math.min(1, sayT / 0.3)));
  }

  // ---- the cab's panel: only the cab can see how fast it's going and what's coming down the hill
  const cabEl = document.createElement("div");
  cabEl.id = "pushcab";
  cabEl.style.cssText = "position:fixed;right:16px;top:214px;min-width:300px;padding:8px 14px;background:rgba(10,10,12,0.72);border:2px solid #fff;border-radius:8px;pointer-events:none;color:#fff;font-weight:700;text-shadow:0 1px 2px #000;z-index:6;display:none;text-align:center";
  cabEl.innerHTML = `<div style="font-size:26px;letter-spacing:0.04em"></div>`
    + `<div style="font-size:15px;margin-top:4px"></div>`
    + `<div style="position:relative;height:8px;margin:4px auto 2px;width:220px;background:rgba(255,255,255,0.15);border-radius:4px;overflow:hidden"><div style="position:absolute;top:0;bottom:0;left:0"></div></div>`
    + `<div style="font-size:16px;margin-top:6px"></div>`;
  document.body.appendChild(cabEl);
  const [cabSpeed, cabBrake, cabHeat, cabAhead] = [...cabEl.children] as HTMLElement[];
  const cabHeatFill = cabHeat.children[0] as HTMLElement;
  const setText = (el: HTMLElement, t: string, c = "#fff") => { if (el.innerHTML !== t) el.innerHTML = t; el.style.color = c; };
  function drawCab(show: boolean) {
    cabEl.style.display = show ? "block" : "none";
    if (!show) return;
    if (Math.abs(v) < 0.05) setText(cabSpeed, hb ? "HELD" : "STOOD STILL", "#ffe08a");
    else if (v > 0) setText(cabSpeed, `&#9650; UP ${v.toFixed(1)} m/s`, "#8ef08e");
    else setText(cabSpeed, `&#9660; ROLLING BACK ${(-v).toFixed(1)} m/s`, v < GRIP * 0.6 ? "#ff5a4a" : "#ff9a8a");
    const slip = hb && heat > 0.7;
    setText(cabBrake, hb ? (slip ? "Handbrake slipping, smoking: let it off!" : `Handbrake on: they get their breath back`) : `Handbrake off · ${keyLabel("Space")} to hold it`, slip ? "#ff5a4a" : hb ? "#ffe08a" : "#ccc");
    cabHeatFill.style.width = `${Math.round(heat * 100)}%`;
    cabHeatFill.style.background = heat > 0.7 ? "#ff5a4a" : heat > 0.4 ? "#ffb21f" : "#8ef08e";
    const roof = lads.some((l) => l.kind === 1 && l.t > 3), front = lads.some((l) => l.kind === 2 && l.t > 3);
    const ahead: string[] = [];
    if (carSt === 2) ahead.push(`A car's stuck nose to nose: pull in, ${keyLabel("KeyA")}`);
    else if (carSt === 1) ahead.push(`A car coming down, ${Math.max(0, Math.round(carS - s - hl))} m`);
    if (roof) ahead.push("A naughty boy on the roof");
    if (front) ahead.push("A naughty boy shoving at the front");
    if (Math.abs(lat) >= latMax - 0.02) ahead.push(`Scraping the kerb: steer off, ${keyLabel(lat < 0 ? "KeyD" : "KeyA")}`);
    setText(cabAhead, ahead.length ? ahead.join("<br>") : "Clear up ahead", ahead.length ? "#ffb21f" : "#ccc");
  }

  // ---- your own hands flat on the bus, in your view: shoving in on a good heave, slipping on a miss, shaking when you're tired
  const hands = new THREE.Group();
  hands.visible = false;
  const armGeo = new THREE.BoxGeometry(0.085, 0.085, 1), handGeo = new THREE.BoxGeometry(0.12, 0.2, 0.05);
  // the sleeves a shade darker than your colour, so your hands stand out against them
  const sleeve = new THREE.MeshLambertMaterial({ color: new THREE.Color(w.colourOf(w.selfId)).multiplyScalar(0.6) }), skin = new THREE.MeshLambertMaterial({ color: "#f3d0b0" });
  const arms = [0, 1].map(() => { const a = new THREE.Mesh(armGeo, sleeve), h = new THREE.Mesh(handGeo, skin); hands.add(a, h); return { a, h }; });
  w.scene.add(hands);
  let lurch = 0, slip = 0, freshAt = performance.now(), feelT = 0, feel = 0;
  const _sh = new THREE.Vector3(), _hd = new THREE.Vector3();
  const feeler = new THREE.Raycaster(), solid: THREE.Mesh[] = [];
  bus.root.traverse((o) => { if (o instanceof THREE.Mesh) solid.push(o); });
  /** How far ahead the bus's drawn panel really is from (x, y, z), feeling for it, as it leans on the slope. */
  function panelAhead(x: number, y: number, z: number, tx: number, tz: number, reach: number) {
    if ((feelT -= 1) > 0 && feel) return feel;
    feelT = 10;
    feeler.set(_hd.set(x, y, z), new THREE.Vector3(tx, 0, tz));
    feeler.far = reach + 1;
    const shown = (o: THREE.Object3D | null): boolean => !o || (o.visible && shown(o.parent));
    const hit = feeler.intersectObjects(solid.filter(shown), false).find((h) => !(h.object instanceof THREE.Sprite));
    return (feel = hit ? hit.distance : reach);
  }
  function drawHands(x: number, y: number, z: number, tx: number, tz: number, reach: number) {
    hands.visible = reach > 0;
    if (!reach) return;
    const now = performance.now(), rx = tz, rz = -tx;
    const tired = Math.max(0, Math.min(1, ((now - freshAt) / 1000 - FRESH) / FRESH));
    reach = Math.min(reach + 0.5, panelAhead(x, y + 1.22, z, tx, tz, reach)) - 0.04;
    arms.forEach(({ a, h }, i) => {
      const side = i ? 1 : -1, shake = Math.sin(now * 0.05 + i * 2) * 0.012 * tired;
      // shoulders leant in ahead of your feet
      _sh.set(x + tx * 0.5 + rx * side * 0.22, y + 1.2, z + tz * 0.5 + rz * side * 0.22);
      _hd.set(x + tx * reach + rx * side * 0.3, y + 1.22 + shake - (i ? slip * 0.18 : 0), z + tz * (reach - 0.02) + rz * side * 0.3);
      h.position.copy(_hd);
      h.lookAt(_hd.x + tx, _hd.y, _hd.z + tz);
      // the forearm runs from the shoulder to just short of the hand
      _hd.y -= 0.06;
      a.position.copy(_sh).lerp(_hd, 0.5);
      a.scale.z = _sh.distanceTo(_hd);
      a.lookAt(_hd);
    });
  }

  /** Where the beat was a moment ago (back seconds): its phase, and which beat it's nearest. */
  function beatAt(back: number) {
    let p = ph - back, n = wraps;
    if (p < 0) { p += period; n--; }
    return { p, bi: n + (p > period / 2 ? 1 : 0), off: Math.min(p, period - p), late: p < period / 2 ? p : p - period };
  }

  /** You heaved (Space, the Heave button or a shout): judged against the beat on your own screen, once a beat. */
  function heave(shout: boolean, back = 0) {
    if (mode > 1 || (mySlot() < 0 && !nearRear())) return;
    const b = beatAt(back);
    // the caller is the beat: their heave is when the heave is, and the host follows it
    if (caller === w.selfId) {
      const t = performance.now() - back * 1000;
      if (t - calledAt < BEAT_MIN * 600) return;
      calledAt = t; myBeat = b.bi;
      say({ k: "h", g: 1, o: +b.late.toFixed(3), ct: Math.round(t), v: shout ? 1 : 0 });
      lurch = 1; freshAt = performance.now();
      SFX.effort(0, 0, 1);
      flash("Heave!", COLOUR);
      return;
    }
    const win = shout ? SHOUT_WINDOW : WINDOW;
    if (b.off >= win) {
      // a shout's only a heave when it's on the beat; a press off it spends the beat, so mashing it doesn't work
      if (shout || b.bi === myBeat) return;
      myBeat = b.bi;
      slip = 1;
      flash(b.p > period / 2 ? "Too early" : "Too late", "#ff9a8a");
      return;
    }
    if (b.bi === myBeat) return;
    myBeat = b.bi;
    say({ k: "h", g: 1 - (b.off / win) * 0.5, v: shout ? 1 : 0 });
    lurch = 1; freshAt = performance.now();
    SFX.effort(0, 0, 1);
    flash(b.off < 0.1 ? "Perfect heave!" : "Good heave!", COLOUR);
  }

  function takeCall() {
    if (mode > 1) return;
    if (w.players().length < CALL_MIN) { w.toast(`Calling the heaves is for ${CALL_MIN} or more of you`, 2); return; }
    say({ k: "call", on: caller === w.selfId ? 0 : 1 });
  }

  function stepOff() {
    if (!onBus) return;
    onBus = false;
    if (sentOn) { sentOn = false; say({ k: "p", on: 0 }); }
  }

  let relG = 0;
  function handbrake() {
    myHb = !myHb;
    SFX.clunk();
    // let off right on a heave, and the pushers' shove takes it straight on up instead of it dropping back first
    if (!myHb && mode <= 1) {
      const b = beatAt(0);
      relG = b.off < WINDOW ? 1 : 0;
      flash(relG ? "Off on the heave!" : "Let it off on the heave", relG ? COLOUR : "#ff9a8a");
    }
    sendDrive();
    relG = 0;
  }
  function sendDrive() {
    sentSteerT = 0.5;
    const d = { k: "dr", s: offer.seed, st: mySteer, hb: myHb ? 1 : 0, rel: relG || undefined };
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
  /** Where pusher slot k stands, and which way the panel they're pushing on is (tx, tz) and how far. */
  const slotAt = (k: number, b = pose()) => {
    const row = kind === "bus" ? 4 : 3;
    let al: number, ac2: number, tx: number, tz: number, reach: number;
    // the middle of the back first; and a comfortable step back from the panel, leaning in at it, so the bus doesn't fill your view
    if (k < row) {
      const c = (row === 3 ? [1, 0, 2] : [1, 2, 0, 3])[k];
      al = -(hl + 1.2); ac2 = (c - (row - 1) / 2) * ((hw * 2 - 0.3) / (row - 1)); tx = b.fx; tz = b.fz; reach = 1.2;
    } else { const j = k - row, side = j % 2 ? 1 : -1; al = -hl + 0.7 + Math.floor(j / 2) * 0.8; ac2 = side * (hw + 1.0); tx = -b.rx * side; tz = -b.rz * side; reach = 1.0; }
    const x = b.x + b.fx * al + b.rx * ac2, z = b.z + b.fz * al + b.rz * ac2;
    return { x, z, y: w.map.ground(x, z), tx, tz, reach };
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
    for (const [id, p] of pings) if (now - p[1] > 3000) pings.delete(id);
    if (caller && (ps.length < CALL_MIN || !slots.includes(caller))) callBy("");
    if (mode === 1 || mode === 0) {
      hph += realDt("host", dt);
      if (hph >= period) {
        hph -= period; beatN++;
        // a caller who's gone quiet for two beats: the game takes the count back, and eases back to its own pace
        if (caller && beatN - callerBeat > 2) callBy("");
        if (!caller) period += (BEAT - period) * 0.35;
      }
    }
    heat = hb ? Math.min(1, heat + dt / HB_HOLD) : Math.max(0, heat - dt / HB_COOL);
    if (mode === 0) {
      if (pushing.size || (driver && !hb)) { mode = 1; tell({ k: "go" }); }
      else return;
    }
    if (mode === 2) { runaway(dt); return; }
    if (mode !== 1) return;
    const n = Math.max(startN, ps.length);
    const roof = lads.some((l) => l.kind === 1 && l.t > 3), front = lads.some((l) => l.kind === 2 && l.t > 3);
    // whoever's in the cab has their hands full, so the bus is weighed for one fewer; and on your own,
    // with nobody to heave together with, it's lighter
    // a naughty boy is a nuisance sized to the team: on your own he slows you, never beats you
    const crowd = Math.min(1, n / 3);
    const M = ((kind === "bus" ? 0.5 : 0.1) + Math.max(1, n - (driver ? 0.7 : 0)) * 1.1) * (1 + diff * 0.1) * (n === 1 ? 0.8 : 1) + (roof ? 0.8 * crowd : 0);
    const b = pose();
    // a handbrake that's held gets hot and starts to slip; and while it does hold, the pushers get their breath back
    const grip = hb ? Math.max(0, Math.min(1, (1 - heat) / 0.3)) : 0;
    if (grip > 0.5) for (const id of slots) if (id) lastHeave.set(id, Math.min(now, (lastHeave.get(id) ?? now) + dt * 2500));
    // each pusher's steady shove, tiring once they've stopped heaving
    let F = 0;
    for (const id of slots) if (id) F += Math.max(TIRED, Math.min(1, 1 - ((now - (lastHeave.get(id) ?? now)) / 1000 - FRESH) / FRESH * (1 - TIRED)));
    for (let i = surges.length - 1; i >= 0; i--) { F += surges[i].f; if ((surges[i].left -= dt) <= 0) surges.splice(i, 1); }
    if (front) F -= 1.3 * crowd;
    // a steeper hill is harder, but not so much harder that a steep one can't be done
    const G = (M * b.grade) / (0.5 * steep + 0.075);
    const scraping = Math.abs(lat) >= latMax - 0.02;
    const resist = M * (ROLL + (scraping ? 0.3 : 0));
    const net = F - G;
    if (grip < 1) {
      if (Math.abs(v) < 0.04 && Math.abs(net) <= resist) v = 0;
      else {
        const dir = v !== 0 ? Math.sign(v) : Math.sign(net);
        const drag = v > 0 ? 0.12 * v + 0.06 * v * v : 0.08 * v - 0.01 * v * v;
        v += ((net - resist * dir) / M - drag) * dt;
      }
    }
    if (hb) {
      const k = (Math.abs(v) < 3 ? 6 : 1.8) * grip;
      v = v > 0 ? Math.max(0, v - k * dt) : Math.min(0, v + k * dt);
    }
    // a car stuck nose to nose: it won't go on up till the car's by
    if (carSt === 2 && v > 0) v = 0;
    s += v * dt;
    // the road's camber walks it into the kerb, unless someone's steering (less so on your own, with nobody to steer)
    const camber = (-0.05 - 0.03 * Math.sin(s * 0.031 + (offer.seed % 7))) * (n > 1 ? 1 : 0.3);
    lat = Math.max(-latMax, Math.min(latMax, lat + v * dt * (camber + (driver ? steer * 0.32 : 0))));
    if (v < GRIP && slots.some(Boolean)) { slots.fill(""); pushing.clear(); tell({ k: "away" }); }
    if (Math.abs(v) > 0.1) shoveAside();
    if (v < -4) w.runOver?.(bus);
    if (s - hl < 0) {
      const b = pose();
      // (the host's own copy of this sets it going, as everyone else's does)
      tell({ k: "lost", x: +b.x.toFixed(2), z: +b.z.toFixed(2), a: +b.a.toFixed(3), v: +v.toFixed(2) });
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

  /** A parked car (or one in the traffic) the bus is pushed into is shoved out of its way. */
  function shoveAside() {
    const sh = w.shove?.(bus);
    if (!sh) return;
    const along = [-(hl - hw), 0, hl - hw], now = performance.now();
    for (const o of sh.list) {
      if (Math.abs(o.x - bus.x) > hl + 4 || Math.abs(o.z - bus.z) > hl + 4) continue;
      const t = contact(bus, along, hw, o);
      if (!t || now - (knocked.get(o.n) ?? -1e9) < 1500) continue;
      knocked.set(o.n, now);
      const k = Math.max(3, Math.abs(v) * 1.5);
      sh.hit(o, -t.nx * k + bus.vx * 0.5, -t.nz * k + bus.vz * 0.5, 0);
    }
  }

  /** Host: the bus got away, and it's on its own: rolling backwards with nobody at the wheel, through
   *  whatever's in the way, till something stops it. Then, a moment later, it's lost. */
  function runaway(dt: number) {
    runT += dt;
    const c = Math.cos(bus.a), sn = Math.sin(bus.a), half = hl * 0.7;
    const slope = (w.map.ground(bus.x + c * half, bus.z - sn * half) - w.map.ground(bus.x - c * half, bus.z + sn * half)) / (2 * half);
    const vf = bus.speed;
    // out of gear, a bus rolls on far more freely than a car coasting does, so the hill keeps hold of it
    if (Math.abs(vf) > 1.5) { const k = (-9.8 * slope * 0.3 + Math.sign(vf) * 0.6) * dt; bus.vx += c * k; bus.vz -= sn * k; }
    const sh = w.shove?.(bus);
    const hit = sh ? { list: sh.list, hit: (...a: Parameters<typeof sh.hit>) => { struck = "car"; sh.hit(...a); } } : undefined;
    bus.drive(dt, { throttle: 0, steer: Math.sin(runT * 0.8 + (offer.seed % 5)) * 0.25, handbrake: false, horn: false }, () => true, hit);
    if (bus.impact > 1.2 && struck !== "car") struck = "wall";
    bangT -= dt;
    if (bus.impact > 1.2 && bangT <= 0) {
      bangT = 0.5;
      tell({ k: "bang", x: +bus.x.toFixed(1), z: +bus.z.toFixed(1), f: +Math.min(1.4, bus.impact / 4).toFixed(2) });
    }
    if (Math.abs(bus.speed) > 4) w.runOver?.(bus);
    restT = Math.hypot(bus.vx, bus.vz) < 0.2 ? restT + dt : 0;
    if (restT > 1 || runT > RUN_MAX) {
      bus.vx = bus.vz = 0;
      tell({ k: "rest", x: +bus.x.toFixed(2), z: +bus.z.toFixed(2), a: +bus.a.toFixed(3), w: inWater(bus.x, bus.z) ? 1 : 0, by: struck });
    }
  }

  function tell(d: Record<string, unknown>) {
    const m = { ...d, s: offer.seed };
    w.send("qe", m);
    job.event!(m, w.selfId);
  }

  const state = () => ({
    k: "b", s: offer.seed, q: [+s.toFixed(2), +v.toFixed(2), +lat.toFixed(2), hb ? 1 : 0, +hph.toFixed(3), mode, +carS.toFixed(1), carSt],
    sl: slots, d: driver, ld: lads.map((l) => [l.kind, +l.t.toFixed(1)]),
    bp: +period.toFixed(3), cl: caller, hh: +heat.toFixed(2),
    // each guest's last ping back to them, with how long it waited here, so they can tell how far off the host is
    pg: Object.fromEntries([...pings].map(([id, p]) => [id, [p[0], Math.round(performance.now() - p[1])]])),
    r: mode >= 2 && mode !== 3 ? [+bus.x.toFixed(2), +bus.z.toFixed(2), +bus.a.toFixed(3), wet ? 1 : 0, struck] : undefined,
  });

  // ---- drawing it ------------------------------------------------------------------------------
  function drawBus(dt: number) {
    const now = performance.now();
    broken.update(now / 1000);
    if (mode >= 1) broken.shut();
    if (mode === 2 || mode === 4) {
      // the host moves the runaway itself (runaway()); everyone else eases it to where the host last had it
      if (!w.isHost) {
        const k = mode === 4 ? 1 : Math.min(1, dt * 8), da = Math.atan2(Math.sin(runAt.a - bus.a), Math.cos(runAt.a - bus.a));
        const x = bus.x + (runAt.x - bus.x) * k, z = bus.z + (runAt.z - bus.z) * k, sp = Math.hypot(runAt.x - bus.x, runAt.z - bus.z) * (mode === 4 ? 0 : 8);
        bus.place(x, z, bus.a + da * k);
        const c = Math.cos(bus.a), sn = Math.sin(bus.a);
        bus.vx = -c * sp; bus.vz = sn * sp;
      }
      bus.pose(dt, now);
      knockBins(bus.x, bus.z, bus.speed, bus.a, dt);
      if (wet) {
        sink = Math.min(1, sink + dt * 0.6);
        bus.root.position.y = bus.y - sink * 1.8;
        bus.root.rotation.z = sink * 0.25;
      }
      if (mode === 4 && !job.done && (settleT += dt) >= SETTLE) {
        const how = wet ? "and into the water" : struck === "car" ? "and smashed into a car" : struck === "wall" ? "and smashed into a wall" : "all the way to the bottom";
        job.done = { won: false, text: `It got away from you, back down ${hill.name} ${how}`, x: bus.x, z: bus.z };
      }
      return;
    }
    const b = pose();
    bus.place(b.x, b.z, b.a);
    // its speed, for the wheels, for shoving cars aside and for anyone it rolls back over
    bus.vx = b.fx * v; bus.vz = b.fz * v;
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
        for (const l of lads) if (l.kind) l.t += dt;
        if ((pingT -= dt) <= 0) { pingT = 0.5; say({ k: "pg", t: Math.round(performance.now()) }); }
      }
      const wrapsBefore = wraps;
      tick(dt);
      drawBus(dt);
      if (job.done) { drawBeat(dt, false); drawCab(false); callButton(false); return; }
      // the beat: a count in, and the heave
      if (mode <= 1 && Math.hypot(me.x - bus.x, me.z - bus.z) < 45) {
        if (lastPh < period - 1.2 && ph >= period - 1.2) SFX.pip();
        if (lastPh < period - 0.6 && ph >= period - 0.6) SFX.pip();
        if (wraps > wrapsBefore) SFX.pip(true);
      }
      lastPh = ph;
      if (voiceLevel.shoutAt > shoutUsed) {
        shoutUsed = voiceLevel.shoutAt;
        if (onBus && voiceLevel.shoutRise > SHOUT_RISE) heave(true, (performance.now() - voiceLevel.shoutAt) / 1000 + SHOUT_LAG);
      }
      // whoever took it on, stood at its back, starts with their shoulder already to it
      if (!toldHow && mode <= 1) {
        toldHow = true;
        if (by === w.selfId && nearRear() && v > GRIP) onBus = true;
      }
      // on the bus till you let go, walk off, or it's away from you
      const stick = w.stick?.() ?? { x: 0, y: 0 };
      if (onBus) {
        if (Math.hypot(stick.x, stick.y) < 0.2) stickFree = true;
        else if (stickFree && stick.y > 0.5) stepOff();
      }
      if (onBus && (inCab || !me.alive || mode > 1 || v <= GRIP || (mySlot() < 0 && !nearRear()))) stepOff();
      sentT -= dt;
      if (onBus !== sentOn || (onBus && sentT <= 0)) { sentOn = onBus; sentT = 1; say({ k: "p", on: onBus ? 1 : 0 }); }
      const rr = rearOf();
      drawBeat(dt, mode <= 1 && (inCab || onBus || (me.alive && Math.hypot(me.x - rr.x, me.z - rr.z) < 12)));
      drawCab(inCab && mode <= 1);
      if (!onBus || inCab || mode > 1 || !me.alive) hands.visible = false;
      callButton(touchOn() && onBus && mode <= 1 && w.players().length >= CALL_MIN);
      // a handbrake held too long smokes at the back wheels as it slips
      if (mode === 1 && hb && heat > 0.7 && (smokeT -= dt) <= 0) {
        smokeT = 0.25;
        const b = pose(), x = b.x - b.fx * (hl - 1.2), z = b.z - b.fz * (hl - 1.2);
        w.dust?.(x, bus.y + 0.2, z, -b.fx, -b.fz);
      }
      if (inCab && hb && heat > 0.7 && (slipT -= dt) <= 0) { slipT = 6; w.toast("The handbrake's smoking and slipping: let it off", 2.5); }
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
      // taking over as host carries on the beat from where this screen had it
      if (!hosting) { hosting = true; hph = modelAt >= 0 ? hostPhNow() : ph; beatN = wraps; }
      hostStep(dt);
      if ((sendT -= dt) <= 0) { sendT = SEND; w.send("qe", state()); }
    },
    event(d, from) {
      if (!d) return;
      if (d.k === "b") { if (!w.isHost) take(d); return; }
      if (!w.isHost && from !== w.selfId && ["p", "h", "cab", "dr", "lad", "pg", "call"].includes(d.k)) return;
      if (w.isHost) {
        if (d.k === "p") {
          // someone just taken hold starts fresh, as if they'd just heaved
          if (d.on) { if (!pushing.has(from)) lastHeave.set(from, performance.now()); pushing.set(from, performance.now()); }
          else pushing.delete(from);
          return;
        }
        if (d.k === "pg") { if (Number.isFinite(d.t)) pings.set(from, [d.t, performance.now()]); return; }
        if (d.k === "call") {
          if (!d.on) { if (caller === from) callBy(""); }
          else if (!caller && slots.includes(from) && w.players().length >= CALL_MIN) callBy(from);
          return;
        }
        // which beat a heave was for is by the beat's number, not the exact moment it got here, so a
        // heave from a long way off still counts with the rest of the same beat
        if (d.k === "h" && mode <= 1 && slots.includes(from)) {
          const bi = beatN + (hph > period / 2 ? 1 : 0);
          const calling = from === caller && Number.isFinite(d.o);
          if (heaved.get(from) === bi && !calling) return;
          heaved.set(from, bi);
          if (calling) {
            // the caller's heave is the beat. Their pace is the time between their heaves by their own
            // clock, so it's not thrown about by the network; and the beat moves over to where they heaved
            if (Number.isFinite(d.ct) && callerT) {
              const iv = (d.ct - callerT) / 1000;
              if (iv > BEAT_MIN * 0.75 && iv < BEAT_MAX * 1.3) period = Math.max(BEAT_MIN, Math.min(BEAT_MAX, period * 0.4 + iv * 0.6));
            }
            callerT = Number.isFinite(d.ct) ? d.ct : 0;
            hph -= Math.max(-0.35, Math.min(0.35, +d.o)) * 0.6;
            if (hph < 0) { hph += period; beatN--; } else if (hph >= period) { hph -= period; beatN++; }
            callerBeat = beatN + (hph > period / 2 ? 1 : 0);
          }
          // the first to shout three heaves running, with nobody calling, takes the call
          const run = shoutRun.get(from) ?? [-9, 0];
          if (d.v) { run[1] = run[0] === bi - 1 ? run[1] + 1 : 1; run[0] = bi; shoutRun.set(from, run); } else shoutRun.delete(from);
          if (d.v && run[1] >= 3 && !caller && w.players().length >= CALL_MIN) callBy(from);
          if (bi !== syncBeat) { syncBeat = bi; syncN = 0; }
          syncN++;
          const g = Math.max(0.4, Math.min(1, +d.g || 0));
          surges.push({ left: SURGE_T, f: (SURGE / SURGE_T) * g * (1 + 0.25 * (syncN - 1)) });
          pushing.set(from, performance.now());
          lastHeave.set(from, performance.now());
          return;
        }
        if (d.k === "cab") {
          if (d.on && (!driver || driver === from)) { setDriver(from); steerHeard = performance.now(); }
          else if (!d.on && driver === from) { setDriver(""); hb = false; }
          return;
        }
        if (d.k === "dr" && from === driver) {
          steer = Math.max(-1, Math.min(1, +d.st || 0));
          if (hb && !d.hb && d.rel) surges.push({ left: SURGE_T, f: SURGE / SURGE_T });
          hb = !!d.hb; steerHeard = performance.now();
          return;
        }
        if (d.k === "lad") { const l = lads[d.i | 0]; if (l?.kind) { l.kind = 0; tell({ k: "ladoff", i: d.i | 0, by: from }); } return; }
      }
      if (d.k === "cl") { setCaller(typeof d.id === "string" ? d.id : ""); return; }
      if (d.k === "go") { mode = 1; if (Math.hypot(w.me().x - bus.x, w.me().z - bus.z) < 60) w.toast("The chocks are out. Push!", 2.5); }
      else if (d.k === "away") { if (onBus) w.toast("It's getting away from you!", 2.5); stepOff(); slots.fill(""); }
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
      else if (d.k === "lost" && mode <= 1) {
        const b = pose(), x = Number.isFinite(d.x) ? d.x : b.x, z = Number.isFinite(d.z) ? d.z : b.z, a = Number.isFinite(d.a) ? d.a : b.a;
        mode = 2; runT = 0; restT = 0;
        stepOff(); leaveCab();
        bus.hand = false;
        bus.place(x, z, a);
        // past the bottom it's careering, not creeping: it goes on back at a run at least
        const sp = Math.min(-4, Number.isFinite(d.v) ? d.v : v);
        bus.vx = Math.cos(a) * sp; bus.vz = -Math.sin(a) * sp;
        Object.assign(runAt, { x, z, a });
        const [dd, pan] = w.hear?.(x, bus.y, z) ?? [0, 0];
        SFX.screech(dd, pan);
        w.toast("It's away! Back past the bottom and still going", 3);
      }
      else if (d.k === "bang") {
        const x = +d.x, z = +d.z;
        if (Number.isFinite(x) && Number.isFinite(z)) {
          const [dd, pan] = w.hear?.(x, bus.y, z) ?? [0, 0];
          SFX.crash(Math.max(0.3, Math.min(1.4, +d.f || 0.5)), dd, pan);
          w.dust?.(x, bus.y + 0.6, z, 0, 0);
        }
      }
      else if (d.k === "rest" && mode !== 4) {
        if (mode <= 1) job.event!({ k: "lost" }, "@host");
        mode = 4; settleT = 0;
        if (Number.isFinite(d.x) && Number.isFinite(d.z) && Number.isFinite(d.a)) { Object.assign(runAt, { x: d.x, z: d.z, a: d.a }); if (!w.isHost) bus.place(d.x, d.z, d.a); }
        wet = d.w === 1;
        struck = typeof d.by === "string" ? d.by : "";
        if (wet) { const [dd, pan] = w.hear?.(bus.x, bus.y, bus.z) ?? [0, 0]; SFX.impact("ground", dd, pan, true); SFX.crash(1.4, dd, pan); w.dust?.(bus.x, bus.y + 0.5, bus.z, 0, 0); }
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
      if (onBus) { stepOff(); return true; }
      if (nearRear()) {
        if (v <= GRIP) { w.toast("Too fast: you can't hold it", 1.5); return true; }
        onBus = true; stickFree = false; freshAt = performance.now();
        sentOn = true; sentT = 1; say({ k: "p", on: 1 });
        return true;
      }
      if (nearCab()) {
        if (driver && driver !== w.selfId) { w.toast(`${w.nameOf(driver)}'s in the cab`, 2); return true; }
        inCab = true; myHb = hb; mySteer = 0;
        bus.inside(true);
        say({ k: "cab", on: 1 });
        sendDrive();
        w.toast(`In the cab: only you can see how fast it's going and what's coming, so call it out. ${keyLabel("KeyA")} ${keyLabel("KeyD")} steer, ${keyLabel("Space")} handbrake`, 5);
        return true;
      }
      return false;
    },
    hint() {
      if (mode >= 2) return "";
      if (inCab) return `<b>E</b> Get out of the cab · <b>${keyLabel("Space")}</b> handbrake ${myHb ? "off, on a HEAVE!" : "on, so they get their breath"} · call out what's coming`;
      if (onBus) {
        const call = w.players().length < CALL_MIN ? "" : caller === w.selfId ? ` · <b>${touchOn() ? "Stop calling" : "Q"}</b> Stop calling` : caller ? "" : ` · <b>${touchOn() ? "Call" : "Q"}</b> Take the call`;
        return `<b>${heaveName()}</b> on every HEAVE!${caller === w.selfId ? " (you call it)" : ""} · <b>E</b> to let go${call}`;
      }
      if (nearRear()) return v <= GRIP ? "It's rolling too fast to hold" : `<b>E</b> Get your shoulder to the bus`;
      if (nearCab()) return driver && driver !== w.selfId ? `${esc(w.nameOf(driver))}'s in the cab` : `<b>E</b> Climb into the cab: steer, hold it, and see what's coming`;
      return "";
    },
    // your feet go with the bus, your hands on it, and you look about as you like
    perch(dt) {
      if (mode < 2 && !job.done && inCab) { const st = bus.seat(0); return { x: st.x, y: st.y, z: st.z, bare: true }; }
      if (mode >= 2 || job.done || !onBus) { hands.visible = false; return null; }
      const k = mySlot(), me = w.me();
      const at = k >= 0 ? slotAt(k) : { x: me.x, z: me.z, y: me.y, tx: 0, tz: 0, reach: 0 };
      lurch = Math.max(0, lurch - dt * 3); slip = Math.max(0, slip - dt * 2.5);
      // a good heave lunges you in at the bus
      const lean = 0.14 * Math.sin(Math.min(1, lurch) * Math.PI);
      const x = at.x + at.tx * lean, z = at.z + at.tz * lean;
      drawHands(x, at.y, z, at.tx, at.tz, at.reach);
      return { x, y: at.y, z, bare: true };
    },
    card() {
      const me = w.me(), dist = Math.hypot(me.x - bus.x, me.z - bus.z);
      const up = Math.max(0, Math.min(1, (s - s0) / Math.max(1, top - s0)));
      const pushers = slots.filter(Boolean).length;
      const stage = up > 0.5 ? { key: "half", title: "Halfway up", sub: hill.name } : undefined;
      if (mode === 2) return { line: "It's away! Back down the hill and still going", progress: "0%", bar: 0 };
      if (mode === 4) return { line: wet ? "It's gone in the water" : "It's come to rest at the bottom, hazards going", progress: "0%", bar: 0 };
      if (dist > 40) return { line: `The bus is ${far(dist)} ${compassWord(bus.x - me.x, bus.z - me.z)}, on ${hill.name}`, progress: `${Math.round(up * 100)}%`, bar: up, stage };
      if (inCab) return { line: `In the cab · ${pushers} pushing`, sub: "Only you can see what's coming: tell them", progress: `${Math.round(up * 100)}%`, bar: up, stage };
      // the pushers can't see past the bus: with someone in the cab it's for them to say what's coming
      const blind = !!driver && driver !== w.selfId;
      return {
        line: !onBus ? `${touchOn() ? "Use" : keyLabel("KeyE")} at the back to push, then ${heaveName()} on every HEAVE!`
          : `${pushers} pushing${driver ? ` · ${w.nameOf(driver)} in the cab` : ""}${caller ? ` · ${caller === w.selfId ? "you call" : `${w.nameOf(caller)} calls`}` : ""}`,
        sub: !blind && carSt === 2 ? "There's a car stuck in front: someone get in the cab and pull in" : !blind && lads.some((l) => l.kind && l.t > 3) ? (lads.some((l) => l.kind === 2 && l.t > 3) ? "A naughty boy's shoving at the front: shoot him off" : "A naughty boy's on the roof: shoot him off")
          : onBus ? (hb ? "Handbrake's on: get your breath back" : "Time it to the bar. Miss the heaves and you'll tire, and it rolls back") : undefined,
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
    obstacles: () => (mode === 2 ? [] : [{ x: bus.x, z: bus.z, r: hl, parked: true, a: bus.a }]),
    route: () => (job.done ? null : routeLine),
    end() {
      ac.abort();
      beatEl.remove();
      cabEl.remove();
      w.scene.remove(hands);
      armGeo.dispose(); handGeo.dispose(); sleeve.dispose(); skin.dispose();
      callButton(false);
      if (tjump && tjump.textContent === "Heave") tjump.textContent = "Jump";
      for (const id of posed) w.pose?.(id, 0, "");
      bus.inside(false);
      w.mark("@challenge", null);
      w.scene.remove(binMesh, carObj);
      binGeo.dispose(); binMat.dispose(); binMesh.dispose();
      for (const l of lads) if (l.fig) w.scene.remove(l.fig.root);
      const gone = () => {
        broken.dispose();
        w.scene.remove(bus.root);
        const k = w.map.movers.indexOf(bus);
        if (k >= 0) w.map.movers.splice(k, 1);
      };
      if (mode !== 4) { gone(); return; }
      // lost: it stays where it stopped for a while, hazards going, as anything broken down would
      const tick = setInterval(() => broken.update(performance.now() / 1000), 100);
      const block = { x: bus.x, z: bus.z, r: hl, parked: true, a: bus.a };
      leftInRoad.add(block);
      const take = () => { clearInterval(tick); clearTimeout(timer); leftInRoad.delete(block); gone(); };
      const timer = setTimeout(() => { if (wreck === take) wreck = null; take(); }, KEEP * 1000);
      clearWreck();
      wreck = take;
    },
  };

  /** The host's word on the bus (or, joining, how far it had got). */
  function take(d: any, jump = false) {
    const q = d.q;
    if (!Array.isArray(q) || q.length < 8 || !q.every(Number.isFinite)) return;
    ts = q[0]; tv = q[1]; v = q[1]; lat = q[2]; hb = !!q[3]; carS = q[6]; carSt = q[7];
    if (Number.isFinite(d.bp)) period = Math.max(BEAT_MIN, Math.min(BEAT_MAX, d.bp));
    if (Number.isFinite(d.hh)) heat = d.hh;
    const pg = d.pg?.[w.selfId];
    if (Array.isArray(pg) && pg[0] !== lastPing && Number.isFinite(pg[0]) && Number.isFinite(pg[1])) {
      lastPing = pg[0];
      rtts.push(Math.max(0, performance.now() - pg[0] - pg[1]));
      if (rtts.length > 30) rtts.shift();
      // the quickest of the last few round trips is the truest: the slow ones were held up on the way
      oneWay = Math.min(...rtts) / 2000;
    }
    heardBeat(q[4] + oneWay, jump);
    const r = Array.isArray(d.r) && d.r.length >= 3 && d.r.slice(0, 3).every(Number.isFinite) ? d.r : null;
    if (q[5] <= 1 && mode <= 1) mode = q[5];
    else if (q[5] === 2 && mode <= 1) job.event!(r ? { k: "lost", x: r[0], z: r[1], a: r[2], v: q[1] } : { k: "lost" }, "@host");
    else if (q[5] === 4 && mode !== 4) job.event!(r ? { k: "rest", x: r[0], z: r[1], a: r[2], w: r[3], by: r[4] } : { k: "rest" }, "@host");
    else if (q[5] === 3 && mode <= 1) job.event!({ k: "won" }, "@host");
    if (r && !w.isHost) Object.assign(runAt, { x: r[0], z: r[1], a: r[2] });
    if (jump || w.isHost || heardAt === 0 || Math.abs(ts - s) > 6) s = ts;
    heardAt = performance.now();
    if (Array.isArray(d.sl)) for (let k = 0; k < slots.length; k++) slots[k] = typeof d.sl[k] === "string" ? d.sl[k] : "";
    setDriver(typeof d.d === "string" ? d.d : "");
    if (typeof d.cl === "string") setCaller(d.cl);
    if (Array.isArray(d.ld)) d.ld.forEach((l: unknown, i: number) => { if (lads[i] && Array.isArray(l)) { lads[i].kind = +l[0] || 0; lads[i].t = +l[1] || 0; } });
  }

  /** Where the host's beat is now, as near as this screen can tell. */
  function hostPhNow() {
    if (w.isHost && hosting) return hph;
    return modelPh + (performance.now() - modelAt) / 1000;
  }
  const lastAt: Record<string, number> = {};
  function realDt(k: string, dt: number) {
    const now = performance.now(), was = lastAt[k];
    lastAt[k] = now;
    return was === undefined ? dt : Math.min(1, (now - was) / 1000);
  }
  const wrapS = (e: number) => e - Math.round(e / period) * period;

  /** The host's word on its beat, already put forward by how long it took to get here. Word that the
   *  host is further on than thought is taken at once, but word that it's further back only a little
   *  at a time, since that's usually a message held up on the way rather than the beat moving back. */
  function heardBeat(p: number, jump: boolean) {
    const now = performance.now();
    if (modelAt < 0 || jump) { modelPh = p; modelAt = now; if (jump || !hosting) ph = ((p % period) + period) % period; return; }
    const at = hostPhNow(), d = wrapS(p - at);
    modelPh = at + d * (d > 0 ? 0.3 : 0.05);
    modelAt = now;
  }

  /** Your beat moves on with the clock, running a little fast or slow to catch the host's up, never
   *  jumping, so a heave is judged the same however far off the host is. */
  function tick(frameDt: number) {
    // the clock's own time, not the frame's, which is cut short on a slow frame
    const dt = realDt("mine", frameDt);
    if (mode > 1) return;
    const lead = modelAt >= 0 || (w.isHost && hosting) ? wrapS(hostPhNow() - ph) : 0;
    if (Math.abs(lead) > 0.9) { ph += lead; if (ph < 0) ph += period; }
    // (catching up no more on a long frame than a short one, so a stall doesn't show as a jump)
    else ph += dt + Math.min(dt, 0.05) * Math.max(-0.2, Math.min(0.2, lead * 1.5));
    while (ph >= period) { ph -= period; wraps++; }
  }

  function callBy(id: string) {
    if (id === caller) return;
    if (id) callerBeat = beatN + 1;
    callerT = 0;
    tell({ k: "cl", id });
  }
  function setCaller(id: string) {
    if (id === caller) return;
    const was = caller, me = w.me();
    caller = id;
    if (Math.hypot(me.x - bus.x, me.z - bus.z) > 60) return;
    if (id) w.toast(id === w.selfId ? "You call the heaves now: the beat follows you" : `${w.nameOf(id)} calls the heaves: heave with them`, 2.5);
    else if (was) w.toast("The game's counting again", 2);
  }

  function setDriver(id: string) {
    if (id === driver) return;
    driver = id;
    bus.sit(0, id && id !== w.selfId ? id : "", id ? w.colourOf(id) : "#fff");
    if (id !== w.selfId && inCab) leaveCab();
  }
  function leaveCab() { inCab = false; bus.inside(false); }

  // for checking the beat's sync in a test room: where this screen's beat is, and (on the host) its own
  (window as unknown as Record<string, unknown>).__pushbus = () => {
    const b = pose();
    return { ph, hph, period, n: wraps, host: w.isHost, caller, heat, hb, v, s, mode, onBus, inCab, oneWay, rear: rearOf(b), front: frontOf(b), fx: b.fx, fz: b.fz, said: beatSay.textContent, slots: [...slots], driver,
      lad: (k: number, i = 0) => { lads[i].kind = k; lads[i].t = 0; }, feel };
  };
  return job;
}
