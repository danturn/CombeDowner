// Chavs: lads in trackies who loiter about, chase the nearest player they can see and batter anyone
// they catch. They run faster than you walk but slower than you sprint, and give up once you're far
// enough away, have been out of sight for a few seconds, or they've run a while without catching
// you. Shoot one and he comes for you.
//
// They hang about in gangs at street corners, in alleys, at bus stops and outside the shops and
// pubs (see haunts.ts), in Combe Down and all over Bath: Fox Hill most of all, and always a few
// outside the Hadley Arms. After a chase they drift back to where they were.
//
// Not every gang is chavs. Some are the rugby team, in hooped jerseys, bigger and quicker and
// harder to put down; some are the cricket team, in their whites, swinging bats. Both turn out near
// their own pitches, or outside the pubs, and shout posh things at you as they come (posh.ts).
//
// The host runs them and sends their state about 10 times a second; everyone else draws them from
// that, smoothed like other players. Shots at chavs go to the host, like shots at players.
import * as THREE from "three";
import { hitFigure } from "./avatar";
import { Haunt, clearSpot, hauntsNear, streetSpot } from "./haunts";
import { GameMap } from "./map";
import { line } from "./posh";

/** The three kinds of gang. */
export const CHAV = 0, RUGBY = 1, CRICKET = 2;
/**
 * How tough, quick and hard-hitting each kind is, how far they reach (a bat reaches further), and
 * how far off they spot you and give up on you. The teams are out on open fields and come looking.
 */
const TEAM = [
  { hp: 60, run: 5.7, hit: 10, reach: 1.3, spot: 38, lose: 45 },
  { hp: 85, run: 6.3, hit: 12, reach: 1.35, spot: 70, lose: 85 },
  { hp: 55, run: 5.4, hit: 15, reach: 1.75, spot: 70, lose: 85 },
];
const PROWL = 150;                         // the teams come looking for anyone this close to their pitch
const MAX = 18;
const HOME_RANGE = 5;                      // how far they drift from their spot when loitering
/** How much chavs like each kind of spot. Fox Hill counts three times over. */
const LIKES: Record<Haunt["kind"], number> = { corner: 1, alley: 1, bus: 2, shop: 1.5, pub: 2.5 };
const likes = (h: Haunt) => (h.name === "The Hadley Arms" ? 10 : LIKES[h.kind]) * (h.foxhill ? 3 : 1);
const PITCH_NEAR = 200;                    // a team can turn out at a pitch this close to a player
const TEAM_CHANCE = 0.8;                   // and when one can, four gangs in five are a team
const RUN = 5.7, STROLL = 1.3;            // you walk at 4.6 and sprint at 7.4
const BLIND_SECS = 3.5;
const TIRED_SECS = 14, CALM_SECS = 10;     // a chase that long without catching you, then a sulk
const PUNCH_EVERY = 1.0, WIND_UP = 0.35;
const RADIUS = 0.33;
const CORPSE_SECS = 6;
const DELAY = 130;                         // ms behind real time when drawing from the host's updates
const GONE = 0, ALIVE = 1, DEAD = 2;

/** A player the chavs might go for. */
export interface Target { id: string; x: number; y: number; z: number; alive: boolean }
export interface ChavState { s: number[]; t: string[] }
/** A gang's look: its kind times 16, plus which kit (for the teams). */
const look = (kind: number, kit: number) => kind * 16 + kit;
const STRIDE = 9;                          // numbers per chav in a snapshot

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const mats = new Map<string, THREE.MeshLambertMaterial>();
const lambert = (c: string) => mats.get(c) ?? mats.set(c, new THREE.MeshLambertMaterial({ color: c })).get(c)!;
// shared by every chav
const GEO = {
  leg: box(0.15, 0.84, 0.17).translate(0, -0.42, 0),
  stripe: box(0.015, 0.8, 0.035).translate(0, -0.42, 0),
  shoe: box(0.15, 0.11, 0.29).translate(0, -0.8, -0.05),
  torso: box(0.44, 0.6, 0.25),
  sleeve: box(0.12, 0.56, 0.13).translate(0, -0.28, 0),
  hand: new THREE.SphereGeometry(0.06, 8, 6).translate(0, -0.6, 0),
  head: new THREE.SphereGeometry(0.15, 14, 10),
  cap: new THREE.SphereGeometry(0.162, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  brim: box(0.2, 0.025, 0.17),
  chain: new THREE.TorusGeometry(0.1, 0.012, 6, 20),
  // the rugby team: shorts, bare knees, long socks, a hooped jersey
  shorts: box(0.17, 0.3, 0.19).translate(0, -0.15, 0),
  knee: box(0.13, 0.16, 0.15).translate(0, -0.38, 0),
  sock: box(0.145, 0.38, 0.165).translate(0, -0.65, 0),
  sockHoop: box(0.155, 0.06, 0.175).translate(0, -0.5, 0),
  jersey: box(0.48, 0.62, 0.27),
  hoop: box(0.49, 0.08, 0.28),
  sleeveHoop: box(0.13, 0.07, 0.14).translate(0, -0.22, 0),
  collar: box(0.24, 0.05, 0.2),
  // the cricket team: a V on the jumper, and a bat
  vee: box(0.022, 0.2, 0.01),
  band: box(0.45, 0.045, 0.26),
  handle: box(0.035, 0.26, 0.035).translate(0, -0.72, 0),
  blade: box(0.105, 0.56, 0.04).translate(0, -1.12, 0),
};
const SKIN = ["#efcdb4", "#e6bd9f", "#d4a283", "#b57d5c"].map(lambert);
const TRACKIES = ["#ecebe8", "#252a3e", "#8a8d93", "#1d1d20", "#33478c", "#5b6b4a"].map(lambert);
const CAPS = ["#cbb38a", "#1d1d20", "#ecebe8", "#8a8d93"].map(lambert);
const HAIR = ["#3b2a1d", "#6b4a2b", "#c9a45c", "#a0522d", "#1d1d20"].map(lambert);
const WHITE = lambert("#f4f4f2");
const BLACK = lambert("#1b1b1d");
const CREAM = lambert("#eee8d5");
const WILLOW = lambert("#e0c48a"), GRIP = lambert("#7a1f2b");
const GOLD = new THREE.MeshLambertMaterial({ color: "#d9b143", emissive: "#4a3a10" });
/** Rugby kits: jersey, hoops, shorts. */
const RUGBY_KITS = [
  ["#1d2a5c", "#f2f0e8", "#f2f0e8"], ["#7a1f2b", "#d9a400", "#1d1d20"], ["#14532d", "#f2f0e8", "#f2f0e8"],
  ["#1d1d20", "#d9a400", "#1d1d20"], ["#1f5fa8", "#1d1d20", "#f2f0e8"], ["#a3202a", "#1d1d20", "#1d1d20"],
];
/** Cricket club colours: cap, and the stripes on the jumper. */
const CRICKET_KITS = [["#1d2a5c", "#a3202a"], ["#7a1f2b", "#d9a400"], ["#14532d", "#d9a400"], ["#5b2a86", "#d9a400"], ["#1d2a5c", "#d9a400"]];
const KITS = [1, RUGBY_KITS.length, CRICKET_KITS.length];

const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];

/** The drawn chav (or rugby or cricket player), with running and punching (or bat swinging). */
class Figure {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private legL = new THREE.Group(); private legR = new THREE.Group();
  private armL = new THREE.Group(); private armR = new THREE.Group();
  private phase = 0;
  look = -1;
  // what he's shouting, over his head
  private bubble: THREE.Sprite | null = null;
  private bubbleT = 0;

  constructor() {
    this.dress(0);
    this.body.rotation.order = "YXZ";   // turn first, then lean or fall along the way he faces
    this.root.add(this.body);
    this.root.visible = false;
  }

  get kind() { return this.look >> 4; }

  /** New clothes for a new chav: a tracksuit for a chav, or the team's kit. */
  dress(look: number) {
    this.look = look;
    this.body.clear();
    const kind = look >> 4, kit = look & 15, skin = pick(SKIN);
    // only the big parts cast shadows, to keep the draw calls down on tablets
    const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
      const o = new THREE.Mesh(g, m); o.position.set(x, y, z);
      o.castShadow = g === GEO.leg || g === GEO.torso || g === GEO.sleeve || g === GEO.head || g === GEO.jersey || g === GEO.sock;
      return o;
    };
    const limbs = (leg: (side: number) => THREE.Object3D[], arm: (side: number) => THREE.Object3D[]) => {
      for (const [g, side] of [[this.legL, -1], [this.legR, 1]] as const) {
        g.clear(); g.position.set(side * 0.1, 0.86, 0); g.add(...leg(side));
      }
      for (const [g, side] of [[this.armL, -1], [this.armR, 1]] as const) {
        g.clear(); g.position.set(side * 0.29, 1.42, 0); g.add(...arm(side));
      }
      this.body.add(this.legL, this.legR, this.armL, this.armR, mesh(GEO.head, skin, 0, 1.62, 0));
    };
    this.body.scale.setScalar(1);
    if (kind === RUGBY) {
      const [jersey, hoop, shorts] = (RUGBY_KITS[kit] ?? RUGBY_KITS[0]).map(lambert);
      limbs(
        () => [mesh(GEO.shorts, shorts), mesh(GEO.knee, skin), mesh(GEO.sock, jersey), mesh(GEO.sockHoop, hoop), mesh(GEO.shoe, BLACK)],
        () => [mesh(GEO.sleeve, jersey), mesh(GEO.sleeveHoop, hoop), mesh(GEO.hand, skin)]);
      this.body.add(mesh(GEO.jersey, jersey, 0, 1.16, 0), mesh(GEO.collar, WHITE, 0, 1.46, -0.02),
        ...[-0.2, 0, 0.2].map((y) => mesh(GEO.hoop, hoop, 0, 1.16 + y, 0)), mesh(GEO.cap, pick(HAIR), 0, 1.63, 0.01));
      this.body.scale.setScalar(1.06);   // big lads
    } else if (kind === CRICKET) {
      const [cap, stripe] = (CRICKET_KITS[kit] ?? CRICKET_KITS[0]).map(lambert);
      limbs(
        () => [mesh(GEO.leg, CREAM), mesh(GEO.shoe, WHITE)],
        (side) => side > 0
          ? [mesh(GEO.sleeve, CREAM), mesh(GEO.hand, skin), mesh(GEO.handle, GRIP), mesh(GEO.blade, WILLOW)]
          : [mesh(GEO.sleeve, CREAM), mesh(GEO.hand, skin)]);
      const v = (side: number) => { const m = mesh(GEO.vee, stripe, side * 0.05, 1.37, -0.128); m.rotation.z = side * 0.45; return m; };
      this.body.add(mesh(GEO.torso, CREAM, 0, 1.16, 0), v(-1), v(1), mesh(GEO.band, stripe, 0, 0.9, 0),
        mesh(GEO.cap, cap, 0, 1.65, 0), mesh(GEO.brim, cap, 0, 1.67, -0.15));
    } else {
      const suit = pick(TRACKIES), cap = pick(CAPS);
      const stripe = suit === TRACKIES[0] ? TRACKIES[3] : WHITE;
      limbs(
        (side) => [mesh(GEO.leg, suit), mesh(GEO.stripe, stripe, side * 0.076), mesh(GEO.shoe, WHITE)],
        (side) => [mesh(GEO.sleeve, suit), mesh(GEO.stripe, stripe, side * 0.06), mesh(GEO.hand, skin)]);
      const chain = mesh(GEO.chain, GOLD, 0, 1.34, -0.13);
      chain.scale.set(1, 1.3, 1);
      this.body.add(mesh(GEO.torso, suit, 0, 1.16, 0), mesh(GEO.cap, cap, 0, 1.65, 0), mesh(GEO.brim, cap, 0, 1.67, -0.15), chain);
    }
  }

  /** Show what he's shouting in a bubble over his head for a few seconds. */
  say(text: string) {
    this.unsay();
    const font = "italic 600 44px Georgia, 'Times New Roman', serif";
    const cv = document.createElement("canvas"), g = cv.getContext("2d")!;
    g.font = font;
    const w = Math.ceil(g.measureText(text).width) + 48, h = 84;
    cv.width = w; cv.height = h + 18;
    g.font = font;
    g.fillStyle = "rgba(255,255,255,0.92)";
    g.strokeStyle = "#1d1d20"; g.lineWidth = 4;
    g.beginPath();
    g.roundRect(2, 2, w - 4, h - 4, 26);
    g.moveTo(w / 2 - 14, h - 3); g.lineTo(w / 2, h + 15); g.lineTo(w / 2 + 14, h - 3);
    g.fill(); g.stroke();
    g.fillRect(w / 2 - 12, h - 8, 24, 6);   // hide the outline where the tail joins
    g.fillStyle = "#1d1d20"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(text, w / 2, h / 2);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    const scale = 0.0072;
    s.scale.set(cv.width * scale, cv.height * scale, 1);
    s.center.set(0.5, 0);
    s.position.y = 2.05;
    this.root.add(s);
    this.bubble = s;
    this.bubbleT = 2.8;
  }

  private unsay() {
    if (!this.bubble) return;
    this.root.remove(this.bubble);
    this.bubble.material.map?.dispose();
    this.bubble.material.dispose();
    this.bubble = null;
  }

  /**
   * speed in m/s, punch counts down from 1 over a swing, dead in seconds since death (or 0).
   * Returns true when a foot comes down.
   */
  pose(x: number, y: number, z: number, yaw: number, speed: number, punch: number, dead: number, dt: number): boolean {
    this.root.position.set(x, y, z);
    if (this.bubble) {
      this.bubbleT -= dt;
      if (this.bubbleT <= 0 || dead) this.unsay();
      else this.bubble.material.opacity = Math.min(1, this.bubbleT / 0.4);
    }
    this.body.rotation.y = yaw;
    const run = Math.min(1, speed / RUN);
    const stride = Math.floor(this.phase / Math.PI);
    this.phase += dt * speed * 2.1;
    const swing = Math.sin(this.phase) * Math.min(0.95, speed * 0.17);
    this.legL.rotation.x = swing; this.legR.rotation.x = -swing;
    this.armL.rotation.x = -swing * 0.8; this.armR.rotation.x = swing * 0.8;
    this.armR.rotation.z = 0;
    if (this.kind === CRICKET) {
      // carrying the bat: it swings less, held a little out to the side
      this.armR.rotation.x = swing * 0.3 + 0.15;
      this.armR.rotation.z = 0.12;
      // a swing of the bat: up high and down across
      if (punch > 0) {
        const k = 1 - punch;
        this.armR.rotation.x = k < 0.35 ? (k / 0.35) * 2.6 : 2.6 - ((k - 0.35) / 0.65) * 2.4;
        this.armR.rotation.z = 0.12 + Math.sin(k * Math.PI) * 0.5;
      }
    } else if (punch > 0) this.armR.rotation.x = Math.sin((1 - punch) * Math.PI) * 1.75;   // a punch: the right arm jabs straight out
    this.body.position.y = Math.abs(Math.sin(this.phase)) * 0.05 * run;
    // lean into the run; knocked flat on his back when dead
    this.body.rotation.x = dead > 0 ? Math.min(Math.PI / 2, dead * 5) : -0.22 * run;
    return Math.floor(this.phase / Math.PI) !== stride;
  }

  /** Gone: no bubble left hanging about. */
  hide() { this.root.visible = false; this.unsay(); }
}

class Chav {
  state = GONE; gen = 0; hp = TEAM[CHAV].hp; punches = 0; target = ""; look = 0;
  x = 0; y = 0; z = 0; yaw = 0;                 // the host's word
  // as drawn: smoothed from the host's updates
  dx = 0; dy = 0; dz = 0; dyaw = 0; speed = 0;
  snaps: { t: number; x: number; y: number; z: number; yaw: number }[] = [];
  // host only
  vx = 0; vz = 0; hop = 0; hopV = 0; deadT = 0; punchCD = 0; seeT = Math.random() * 0.4; blindT = 0;
  lastX = 0; lastZ = 0; chaseT = 0; calmT = 0; stuckT = 0; detour = 0; detourT = 0; wanderT = 0; wanderYaw = 0; wanderGo = false;
  homeX = 0; homeZ = 0;                        // the spot he hangs about at
  baseX = 0; baseZ = 0;                        // where he turned up: for a team, their pitch
  // drawing
  fig = new Figure(); punchAnim = 0; seenPunches = 0; deadAnim = 0;
  seenTarget = "";                             // who he was after when last drawn, to hear him shout
  shoutT = 0;                                  // seconds till he shouts again mid-chase
  hopping = false;                             // in the air, as drawn

  constructor(readonly i: number) {}
  /** Who's bleeding, for the blood trails. */
  get key() { return `chav${this.i}.${this.gen}`; }
  /** Picks his voice: the same chav always sounds the same. */
  get voice() { return this.i * 101 + this.gen; }
  get kind() { return this.look >> 4; }
  get team() { return TEAM[this.kind] ?? TEAM[CHAV]; }
}

export class Chavs {
  readonly list: Chav[] = [];
  private pitches = new WeakMap<GameMap, { x: number; z: number; kind: number }[]>();
  private spawnT = 5;
  // Called on every client, to play sounds. voice is a number to give each chav his own voice.
  /** A chav throws a punch. */
  onSwing: (x: number, y: number, z: number, voice: number) => void = () => {};
  /** A chav spots someone and shouts. kind is CHAV, RUGBY or CRICKET; the posh ones say line. */
  onShout: (x: number, y: number, z: number, voice: number, kind: number, line: string) => void = () => {};
  /** A chav's foot comes down (speed in m/s). */
  onStep: (x: number, y: number, z: number, speed: number) => void = () => {};
  /**
   * Host: a gang of chavs is about to turn up at (x, z). Return true to bring them yourself (in a
   * car), and put them there with gangAt() when they arrive.
   */
  arrive: (x: number, z: number, size: number) => boolean = () => false;

  constructor(private map: GameMap, scene: THREE.Scene) {
    for (let i = 0; i < MAX; i++) {
      const c = new Chav(i);
      this.list.push(c);
      scene.add(c.fig.root);
    }
  }

  // ---- host: the AI -------------------------------------------------------------------------

  /** Run the chavs for a frame. punch(i, id, damage) is called when chav i lands a punch on player id. */
  simulate(dt: number, targets: Target[], punch: (i: number, id: string, damage: number) => void) {
    const alive = targets.filter((t) => t.alive);
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 4;
      const want = Math.min(MAX, 3 + 3 * targets.length);
      const active = this.list.filter((c) => c.state !== GONE).length;
      if (active < want && alive.length) this.spawnGang(targets, alive, want - active);
    }
    for (let i = 0; i < this.list.length; i++) {
      const c = this.list[i];
      if (c.state === DEAD) {
        c.deadT += dt;
        if (c.deadT > CORPSE_SECS) c.state = GONE;
        continue;
      }
      if (c.state !== ALIVE) continue;
      this.think(c, dt, alive);
      // wander off the map's edge of interest: too far from anyone to matter
      if (!c.target && !alive.some((t) => Math.hypot(t.x - c.x, t.z - c.z) < 170) && alive.length) { c.state = GONE; continue; }
      this.move(c, i, dt, alive, punch);
    }
  }

  private sees(c: Chav, t: Target, dist: number) {
    const ox = c.x, oy = c.y + 1.6, oz = c.z;
    const dx = t.x - ox, dy = t.y + 1.5 - oy, dz = t.z - oz, l = Math.hypot(dx, dy, dz) || 1;
    const hit = this.map.raycast(ox, oy, oz, dx / l, dy / l, dz / l, dist);
    return !hit || hit.dist > l - 0.4;
  }

  /** Pick, keep or drop a target. Sight checks are a few times a second, not every frame. */
  private think(c: Chav, dt: number, alive: Target[]) {
    c.calmT -= dt;
    c.seeT -= dt;
    if (c.seeT > 0) return;
    const every = 0.35;
    c.seeT = every;
    if (c.target) {
      const t = alive.find((p) => p.id === c.target);
      const dist = t ? Math.hypot(t.x - c.x, t.z - c.z) : Infinity;
      if (!t || dist > c.team.lose || (c.chaseT > TIRED_SECS && dist > 12)) { c.target = ""; c.calmT = CALM_SECS; return; }
      if (this.sees(c, t, dist)) { c.blindT = 0; c.lastX = t.x; c.lastZ = t.z; }
      else if ((c.blindT += every) > BLIND_SECS) { c.target = ""; c.calmT = CALM_SECS; }
      return;
    }
    if (c.calmT > 0) return;
    let best: Target | null = null, bd = c.team.spot;
    for (const t of alive) {
      const d = Math.hypot(t.x - c.x, t.z - c.z);
      if (d < bd && this.sees(c, t, d)) { bd = d; best = t; }
    }
    if (!best) {
      // the teams don't wait to be found: they wander over to whoever's nearest their pitch, and
      // go back to it when there's no one about
      if (c.kind !== CHAV) {
        let near: Target | null = null, nd = PROWL;
        for (const t of alive) { const d = Math.hypot(t.x - c.baseX, t.z - c.baseZ); if (d < nd) { nd = d; near = t; } }
        c.homeX = near ? near.x : c.baseX; c.homeZ = near ? near.z : c.baseZ;
      }
      return;
    }
    // he shouts, and his mates join in
    for (const o of this.list) {
      if (o.state !== ALIVE || (o !== c && (o.target || o.calmT > 0 || Math.hypot(o.x - c.x, o.z - c.z) > 18))) continue;
      o.target = best.id; o.blindT = 0; o.chaseT = 0; o.lastX = best.x; o.lastZ = best.z;
    }
  }

  private move(c: Chav, i: number, dt: number, alive: Target[], punch: (i: number, id: string, damage: number) => void) {
    c.punchCD -= dt;
    let dirX = 0, dirZ = 0, spd = 0, face: number | null = null;
    const t = c.target ? alive.find((p) => p.id === c.target) : undefined;
    if (t) {
      const dx = t.x - c.x, dz = t.z - c.z, dist = Math.hypot(dx, dz);
      if (dist < c.team.reach && Math.abs(t.y - c.y) < 1.4 && c.blindT === 0) {
        face = Math.atan2(-dx, -dz);
        c.chaseT = 0;
        c.vx *= 0.7; c.vz *= 0.7;   // pull up rather than run into you
        if (c.punchCD <= 0) { c.punchCD = PUNCH_EVERY; c.punches++; punch(i, t.id, c.team.hit); }
      } else {
        c.punchCD = Math.max(c.punchCD, WIND_UP);   // a moment to square up before the first punch
        c.chaseT += dt;
        const gx = c.lastX - c.x, gz = c.lastZ - c.z, gl = Math.hypot(gx, gz);
        if (gl > 0.6) { dirX = gx / gl; dirZ = gz / gl; spd = c.team.run; }
      }
    } else {
      c.wanderT -= dt;
      const hx = c.homeX - c.x, hz = c.homeZ - c.z, hd = Math.hypot(hx, hz);
      if (hd > HOME_RANGE) { dirX = hx / hd; dirZ = hz / hd; spd = STROLL * (hd > 15 ? 1.6 : 1); }   // back to his spot
      else {
        if (c.wanderT <= 0) { c.wanderT = 2 + Math.random() * 4; c.wanderGo = Math.random() < 0.35; c.wanderYaw = Math.random() * Math.PI * 2; }
        if (c.wanderGo) { dirX = -Math.sin(c.wanderYaw); dirZ = -Math.cos(c.wanderYaw); spd = STROLL; }
      }
    }
    // stuck on something: try going round it at an angle for a bit
    if (c.detourT > 0) {
      c.detourT -= dt;
      const cs = Math.cos(c.detour), sn = Math.sin(c.detour);
      [dirX, dirZ] = [dirX * cs - dirZ * sn, dirX * sn + dirZ * cs];
    }
    // steep ground slows them like it slows you
    if (spd > 0) {
      const ahead = this.map.ground(c.x + dirX * spd * 0.15, c.z + dirZ * spd * 0.15) - this.map.ground(c.x, c.z);
      const grade = ahead / (spd * 0.15);
      if (grade > 0.35) spd *= Math.max(0.35, 1 - (grade - 0.35) * 1.2);
    }
    let wx = dirX * spd, wz = dirZ * spd;
    // keep out of each other's way
    for (const o of this.list) {
      if (o === c || o.state !== ALIVE) continue;
      const ex = c.x - o.x, ez = c.z - o.z, d = Math.hypot(ex, ez);
      if (d < 0.9 && d > 1e-4) { wx += (ex / d) * (0.9 - d) * 4; wz += (ez / d) * (0.9 - d) * 4; }
    }
    const k = Math.min(1, dt * 8);
    c.vx += (wx - c.vx) * k; c.vz += (wz - c.vz) * k;

    const nx = c.x + c.vx * dt, nz = c.z + c.vz * dt;
    // while hopping a wall, low walls and fences don't block
    let p = this.map.collide({ x: nx, z: nz }, c.y + (c.hop > 0 ? 1.05 : 0), RADIUS);
    if (spd > 1 && c.hop === 0) {
      const want = spd * dt, prog = ((p.x - c.x) * dirX + (p.z - c.z) * dirZ) / want;
      if (prog < 0.35) {
        const over = this.map.collide({ x: nx, z: nz }, c.y + 1.05, RADIUS);
        if (((over.x - c.x) * dirX + (over.z - c.z) * dirZ) / want > 0.6) { p = over; c.hopV = 4.2; c.hop = 0.001; }
        else if ((c.stuckT += dt) > 0.5) {
          c.stuckT = 0;
          c.detour = (c.detour > 0 ? 1 : -1) * (Math.random() < 0.3 ? -1 : 1) * (0.9 + Math.random() * 0.7);
          c.detourT = 0.8 + Math.random();
        }
      } else c.stuckT = Math.max(0, c.stuckT - dt);
    }
    c.vx = ((p.x - c.x) / dt) * 0.9 + c.vx * 0.1;
    c.vz = ((p.z - c.z) / dt) * 0.9 + c.vz * 0.1;
    c.x = p.x; c.z = p.z;
    if (c.hop > 0) {
      c.hopV -= 22 * dt; c.hop += c.hopV * dt;
      if (c.hop <= 0) { c.hop = 0; c.hopV = 0; }
    }
    c.y = this.map.ground(c.x, c.z) + c.hop;
    const sp = Math.hypot(c.vx, c.vz);
    if (face === null && sp > 0.4) face = Math.atan2(-c.vx, -c.vz);
    if (face !== null) {
      const dy = Math.atan2(Math.sin(face - c.yaw), Math.cos(face - c.yaw));
      c.yaw += dy * Math.min(1, dt * 10);
    }
  }

  /** Spots on and around each pitch, for the teams to turn out at: rugby pitches and cricket fields,
   *  in the main map and the squares of Bath loaded round (x, z). */
  private pitchSpots(x: number, z: number) {
    return [this.map, ...this.map.tilesNear(x, z, PITCH_NEAR)].flatMap((area) => this.pitchesIn(area));
  }

  private pitchesIn(area: GameMap) {
    const had = this.pitches.get(area);
    if (had) return had;
    const out: { x: number; z: number; kind: number }[] = [];
    const add = (kind: number, x: number, y: number) => {
      const s = clearSpot(this.map, x, -y, 6);
      if (s) out.push({ x: s[0], z: s[1], kind });
    };
    for (const p of area.d.pi ?? []) {
      if (p[0] === "r") {
        // the middle, both ends and along both touchlines
        const [, cx, cy, L, W, ang] = p, ux = Math.cos(ang), uy = Math.sin(ang);
        for (const [s, t] of [[0, 0], [L / 2, 0], [-L / 2, 0], [0, W / 2 + 3], [0, -W / 2 - 3], [L / 4, W / 2 + 3], [-L / 4, -W / 2 - 3]]) {
          add(RUGBY, cx + ux * s - uy * t, cy + uy * s + ux * t);
        }
      } else {
        // the square, and round the boundary
        add(CRICKET, p[1], p[2]);
        const ring = p[4], n = Math.min(8, ring.length);
        for (let k = 0; k < n; k++) { const [x, y] = ring[Math.floor((k * ring.length) / n)]; add(CRICKET, x, y); }
      }
    }
    this.pitches.set(area, out);
    return out;
  }

  /** A gang turns up at a spot they like near a player, out of sight if possible. */
  private spawnGang(everyone: Target[], alive: Target[], room: number) {
    const anchor = pick(alive);
    const taken = this.list.filter((c) => c.state === ALIVE);
    // the rugby and cricket teams turn out at their own pitches, near a player; chavs anywhere else
    const clear = (x: number, z: number) => !everyone.some((t) => Math.hypot(t.x - x, t.z - z) < 45)
      && !taken.some((c) => Math.hypot(c.baseX - x, c.baseZ - z) < 12);
    const pitches = this.pitchSpots(anchor.x, anchor.z).filter((p) => {
      const d = Math.hypot(p.x - anchor.x, p.z - anchor.z);
      return d > 50 && d < PITCH_NEAR && clear(p.x, p.z);
    });
    const team = pitches.length > 0 && Math.random() < TEAM_CHANCE;
    const spots: { x: number; z: number; w: number; big: boolean; kind: number }[] = team
      ? pitches.map((p) => ({ x: p.x, z: p.z, w: 1, big: true, kind: p.kind }))
      : hauntsNear(this.map, anchor.x, anchor.z, 150).map((h) => ({ x: h.x, z: h.z, w: likes(h), big: h.foxhill || h.kind === "pub", kind: CHAV }));
    const near = team ? spots : spots.filter((h) => {
      const d = Math.hypot(h.x - anchor.x, h.z - anchor.z);
      return d > 50 && d < 150 && clear(h.x, h.z);
    });
    let spot: { x: number; z: number; big: boolean; kind: number } | null = null;
    const total = near.reduce((s, h) => s + h.w, 0);
    for (let tries = 0; tries < 8 && near.length; tries++) {
      let r = Math.random() * total;
      const h = near.find((o) => (r -= o.w) <= 0) ?? near[near.length - 1];
      spot = h;
      const g = this.map.ground(h.x, h.z), ax = anchor.x, ay = anchor.y + 1.6, az = anchor.z;
      const dx = h.x - ax, dy = g + 1.5 - ay, dz = h.z - az, l = Math.hypot(dx, dy, dz);
      const hit = this.map.raycast(ax, ay, az, dx / l, dy / l, dz / l, l);
      if (hit && hit.dist < l - 1) break;     // round a corner: perfect
    }
    if (!spot) {
      // nowhere they like nearby: any street out of the way
      const p = streetSpot(this.map, anchor.x, anchor.z, 55, 110, 0.6, (x, z) => !everyone.some((t) => Math.hypot(t.x - x, t.z - z) < 45));
      if (!p) return;
      spot = { x: p.x, z: p.z, big: false, kind: CHAV };
    }
    // a team turns out in numbers
    const kind = spot.kind;
    const size = Math.min(room, (kind !== CHAV ? 3 : spot.big ? 2 : 1) + Math.floor(Math.random() * 3));
    if (kind === CHAV && this.arrive(spot.x, spot.z, size)) return;
    this.gather(spot, kind, size);
  }

  /** Host: a gang of chavs turns up at (x, z), out of the car that brought them. */
  gangAt(x: number, z: number, size: number) {
    const room = this.list.filter((c) => c.state === GONE).length;
    this.gather({ x, z }, CHAV, Math.min(room, size));
  }

  private gather(spot: { x: number; z: number }, kind: number, size: number) {
    const gang = look(kind, Math.floor(Math.random() * KITS[kind]));
    for (let n = 0; n < size; n++) {
      const c = this.list.find((o) => o.state === GONE);
      if (!c) return;
      let x = spot.x + (Math.random() - 0.5) * 3, z = spot.z + (Math.random() - 0.5) * 3;
      if (this.map.blocked(x, z, RADIUS)) { x = spot.x + (Math.random() - 0.5) * 0.4; z = spot.z + (Math.random() - 0.5) * 0.4; }
      Object.assign(c, {
        state: ALIVE, gen: c.gen + 1 + Math.floor(Math.random() * 50), hp: TEAM[kind].hp, target: "", look: gang,
        x, z, homeX: x, homeZ: z, baseX: spot.x, baseZ: spot.z, y: this.map.ground(x, z), yaw: Math.random() * Math.PI * 2, vx: 0, vz: 0, hop: 0, hopV: 0,
        deadT: 0, punchCD: 0, blindT: 0, chaseT: 0, calmT: 0, stuckT: 0, detourT: 0, wanderT: 0,
      });
      c.fig.dress(gang);
    }
  }

  /** Host: a chav was shot. Returns "kill", "dmg", or null if the shot doesn't count (already dead). */
  damage(i: number, gen: number, amount: number): "kill" | "dmg" | null {
    const c = this.list[i];
    if (!c || c.state !== ALIVE || c.gen !== gen) return null;
    c.hp = Math.max(0, c.hp - amount);
    if (c.hp > 0) return "dmg";
    c.state = DEAD; c.deadT = 0; c.deadAnim = 0; c.target = "";
    return "kill";
  }

  /** Host: the chav goes for whoever shot him. */
  aggro(i: number, id: string, x: number, z: number) {
    const c = this.list[i];
    if (c?.state !== ALIVE) return;
    if (c.target !== id) c.chaseT = 0;
    c.target = id; c.blindT = 0; c.calmT = 0; c.lastX = x; c.lastZ = z;
  }

  snapshot(): ChavState {
    const q = (v: number) => Math.round(v * 100) / 100;
    const s: number[] = [];
    for (const c of this.list) s.push(c.state, c.gen, q(c.x), q(c.y), q(c.z), q(c.yaw), Math.round(c.hp), c.punches, c.look);
    return { s, t: this.list.map((c) => (c.state === ALIVE ? c.target : "")) };
  }

  // ---- everyone else: the host's updates ------------------------------------------------------

  apply(d: ChavState) {
    if (!Array.isArray(d?.s) || d.s.length < this.list.length * STRIDE) return;
    const now = performance.now();
    this.list.forEach((c, i) => {
      const [state, gen, x, y, z, yaw, hp, punches, look] = d.s.slice(i * STRIDE, i * STRIDE + STRIDE);
      if (gen !== c.gen) {
        c.snaps = []; c.seenPunches = punches; if (state === ALIVE) c.fig.dress(look);
        // if we become host he should loiter where he stands, not march to the map centre
        c.homeX = c.baseX = c.lastX = x; c.homeZ = c.baseZ = c.lastZ = z;
      }
      // a kill event can beat the update that says so
      if (!(c.state === DEAD && gen === c.gen && state === ALIVE)) {
        if (state === DEAD && c.state !== DEAD) c.deadAnim = 0;
        c.state = state;
      }
      Object.assign(c, { gen, x, y, z, yaw, hp, punches, look, target: String(d.t?.[i] ?? "") });
      if (state !== GONE) {
        c.snaps.push({ t: now, x, y, z, yaw });
        if (c.snaps.length > 20) c.snaps.shift();
      }
    });
  }

  /** Someone's kill event: down he goes, without waiting for the host's next update. */
  killed(i: number, gen: number) {
    const c = this.list[i];
    if (c && c.gen === gen && c.state === ALIVE) { c.state = DEAD; c.deadAnim = 0; }
  }

  // ---- everyone: drawing and hit tests -----------------------------------------------------

  update(dt: number, host: boolean) {
    const now = performance.now() - DELAY;
    for (const c of this.list) {
      const px = c.dx, pz = c.dz;
      if (host || c.snaps.length < 2) {
        c.dx = c.x; c.dy = c.y; c.dz = c.z; c.dyaw = c.yaw;
      } else {
        const S = c.snaps;
        let a = S[0], b = S[S.length - 1];
        for (let k = 0; k < S.length - 1; k++) if (S[k].t <= now && S[k + 1].t >= now) { a = S[k]; b = S[k + 1]; break; }
        if (now >= b.t) a = b;
        const f = b.t > a.t ? Math.min(1, Math.max(0, (now - a.t) / (b.t - a.t))) : 1;
        c.dx = a.x + (b.x - a.x) * f; c.dy = a.y + (b.y - a.y) * f; c.dz = a.z + (b.z - a.z) * f;
        c.dyaw = a.yaw + Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw)) * f;
      }
      const moved = Math.hypot(c.dx - px, c.dz - pz) / Math.max(dt, 1e-3);
      c.speed += ((moved < 15 ? moved : 0) - c.speed) * Math.min(1, dt * 10);
      if (c.punches !== c.seenPunches) {
        if (c.punches > c.seenPunches && c.state === ALIVE) { c.punchAnim = 1; this.onSwing(c.dx, c.dy, c.dz, c.voice); }
        c.seenPunches = c.punches;
      }
      const after = c.state === ALIVE ? c.target : "";
      // he shouts when he spots you, and keeps shouting all the way through the chase. The posh ones
      // say whole sentences, so they take turns and leave longer between them.
      const posh = c.kind !== CHAV;
      if (after && posh && !c.seenTarget) c.shoutT = Math.random() * 1.5;
      if (after && (!c.seenTarget && !posh || (c.shoutT -= dt) <= 0)) {
        const said = posh ? line(c.kind) : "";
        if (said) c.fig.say(said);
        this.onShout(c.dx, c.dy, c.dz, c.voice, c.kind, said);
        c.shoutT = posh ? 3.5 + Math.random() * 4 : 1.8 + Math.random() * 2.5;
      }
      c.seenTarget = after;
      c.punchAnim = Math.max(0, c.punchAnim - dt / 0.3);
      if (c.state === DEAD) c.deadAnim += dt;
      const fig = c.fig;
      if (c.state === ALIVE || (c.state === DEAD && c.deadAnim < CORPSE_SECS)) {
        fig.root.visible = true;
        const down = fig.pose(c.dx, c.dy, c.dz, c.dyaw, c.state === ALIVE ? c.speed : 0, c.punchAnim, c.state === DEAD ? c.deadAnim + 0.001 : 0, dt);
        // feet on the ground: no steps while hopping a wall, and a thud when he lands
        const air = c.dy - this.map.ground(c.dx, c.dz) > 0.15;
        if (c.state === ALIVE && ((down && !air && c.speed > 0.8) || (c.hopping && !air))) this.onStep(c.dx, c.dy, c.dz, c.speed);
        c.hopping = air;
      } else if (fig.root.visible) fig.hide();
    }
  }

  /** The nearest chav a ray from o along unit vector d hits within maxDist, as drawn. */
  hit(o: THREE.Vector3, d: THREE.Vector3, maxDist: number): { i: number; gen: number; dist: number; head: boolean } | null {
    let best: { i: number; gen: number; dist: number; head: boolean } | null = null;
    this.list.forEach((c, i) => {
      if (c.state !== ALIVE) return;
      const h = hitFigure(o, d, c.dx, c.dy, c.dz, c.kind === RUGBY ? 1.06 : 1);
      if (h && h.dist < maxDist && (!best || h.dist < best.dist)) best = { i, gen: c.gen, ...h };
    });
    return best;
  }

  /** Living chavs as drawn, for blood trails, the minimap and so on. */
  living() {
    return this.list.filter((c) => c.state === ALIVE).map((c) => ({ i: c.i, key: c.key, x: c.dx, y: c.dy, z: c.dz, target: c.target, kind: c.kind }));
  }

  /** Where chav i is drawn, and his blood id. */
  at(i: number) {
    const c = this.list[i];
    return c ? { key: c.key, gen: c.gen, x: c.dx, y: c.dy, z: c.dz, yaw: c.dyaw, voice: c.voice, kind: c.kind } : null;
  }
}
