// Bendy: a boss, four metres of black, rubbery limbs with a lamp in his forehead. He haunts the top
// of Bath, within 100 m of 1 Fonthill Road, walking his patch slowly and sweeping the land with
// the beam from his lamp like a lighthouse. Get caught in the beam and he screeches, the beam goes
// red and locks on you, and then he comes: he sinks into the ground and pops up again right by
// you, lashes out with his long arms, and does it again, and again. Running doesn't help, as he
// just turns up next to you; get up on a roof where he can't reach, put a lot of rounds into him,
// or get well away from his patch, when he gives up and goes home. Shoot him and he comes for you.
//
// He takes an awful lot of killing. When he goes down he melts into a puddle of ink, leaves the
// best prizes behind, and a few minutes later he's back on his patch.
//
// He only comes out at night (daylight.ts): he rises on his patch once it's dark, and at first light
// he sinks into the ground wherever he is, whoever he's after, and isn't seen again till dusk.
//
// The host runs him and sends his state about 10 times a second (more slowly when no one's near);
// everyone else draws him from that, smoothed like the chavs, except that when he jumps from one
// spot to another he jumps there on everyone's screen too. Shots at him go to the host, like shots
// at chavs, and the host decides when his lashes land. Everyone's clock agrees on the time of day,
// so the host needs to send nothing more for him to keep to the night.
import * as THREE from "three";
import { nightNow } from "./daylight";
import { GameMap } from "./map";
import type { Target } from "./chavs";

export const BENDY_HP = 2500;               // a rifle round does 22, 55 in the head
const STREET = "Fonthill Road";
const PATCH = 100;                          // he turns up and walks within this far of number 1
const LEASH = 400;                          // chase someone further from home than this and he gives up
const BEAM = 34;                            // how far his beam reaches across the ground
const BEAM_HALF = 0.16;                     // half the beam's width, radians (about 9 degrees)
const SCAN_SPIN = 0.32;                     // how fast the beam goes round, radians a second
const STARE = 0.9;                          // seconds the red beam holds you before he comes
const SINK = 0.35;                          // seconds out of sight when he jumps
const REACH = 3.3, LASH = 30, LASH_EVERY = 1.1, WIND_UP = 0.5;
const WALK = 1.3, RADIUS = 0.45;
const CORPSE_SECS = 8, RESPAWN_SECS = 240, FIRST_SECS = 6;
const DARK = 0.5;                           // how dark it has to be (daylight.ts) for him to be out
const CALM_SECS = 6;                        // after giving up, a moment before he looks again
const DELAY = 130;                          // ms behind real time when drawing from the host's updates
const GONE = 0, ALIVE = 1, DEAD = 2;
const TALL = 4;

/** The host's word on Bendy: [state, gen, x, y, z, yaw, beam, hp, lashes, jumps, sunk], and who he's after. */
export interface BendyState { s: number[]; t: string }

const INK = new THREE.MeshLambertMaterial({ color: "#151317" });
const BEAM_SCAN = new THREE.Color("#fff1b8"), BEAM_HUNT = new THREE.Color("#ff3b22");

/** His face: a pale mask with hollow eyes and a long stitched grin, drawn on a canvas. */
function faceTexture() {
  const cv = document.createElement("canvas");
  cv.width = 128; cv.height = 64;
  const g = cv.getContext("2d")!;
  g.fillStyle = "#e9e0c8"; g.fillRect(0, 0, 128, 64);
  // the front of the head is the middle of the canvas
  g.fillStyle = "#151317";
  for (const x of [52, 76]) { g.beginPath(); g.ellipse(x, 30, 6, 9, 0, 0, Math.PI * 2); g.fill(); }
  g.strokeStyle = "#151317"; g.lineWidth = 3;
  g.beginPath(); g.moveTo(40, 42); g.quadraticCurveTo(64, 58, 88, 42); g.stroke();
  g.lineWidth = 2;
  for (let k = 0; k < 7; k++) { const x = 44 + k * 6.6, y = 44 + Math.sin((k / 6) * Math.PI) * 6.5; g.beginPath(); g.moveTo(x, y - 4); g.lineTo(x, y + 4); g.stroke(); }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const ARM_SEGS = 6, ARM_SEG = 0.34;

/** The drawn Bendy: rubbery legs and arms, a swaying spine, a turning head with its lamp, and the beam. */
class Figure {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private spine: THREE.Group[] = [];
  private head = new THREE.Group();
  private legs: { hip: THREE.Group; knee: THREE.Group }[] = [];
  private arms: THREE.Group[][] = [];
  private lamp: THREE.Mesh;
  private puddle: THREE.Mesh;
  readonly beam: THREE.Mesh;
  private pool: THREE.Mesh;
  private beamMat: THREE.MeshBasicMaterial;
  private poolMat: THREE.MeshBasicMaterial;
  private phase = 0;
  private t = Math.random() * 10;

  constructor(scene: THREE.Scene) {
    const mesh = (g: THREE.BufferGeometry, m: THREE.Material = INK, shadow = true) => { const o = new THREE.Mesh(g, m); o.castShadow = shadow; return o; };
    this.body.rotation.order = "YXZ";
    this.root.add(this.body);
    // legs: long and thin, each bending at the knee, on pointed feet
    for (const side of [-1, 1]) {
      const hip = new THREE.Group(), knee = new THREE.Group();
      hip.position.set(side * 0.16, 1.9, 0);
      hip.add(mesh(box(0.13, 0.98, 0.13).translate(0, -0.47, 0)));
      knee.position.y = -0.95;
      knee.add(mesh(box(0.11, 0.95, 0.11).translate(0, -0.47, 0)), mesh(box(0.14, 0.08, 0.42).translate(0, -0.92, -0.12), INK, false));
      hip.add(knee);
      this.body.add(hip);
      this.legs.push({ hip, knee });
    }
    this.body.add(mesh(box(0.42, 0.22, 0.24).translate(0, 1.92, 0)));
    // the spine: two pieces that sway against each other, with the shoulders, arms and head on top
    const low = new THREE.Group(), high = new THREE.Group();
    low.position.y = 1.95; high.position.y = 0.66;
    low.add(mesh(box(0.34, 0.7, 0.2).translate(0, 0.33, 0)));
    high.add(mesh(box(0.48, 0.66, 0.22).translate(0, 0.3, 0)), mesh(box(0.08, 0.3, 0.08).translate(0, 0.72, 0), INK, false));
    low.add(high);
    this.body.add(low);
    this.spine.push(low, high);
    // arms: six bendy pieces each, down past his knees, ending in three long fingers
    for (const side of [-1, 1]) {
      const segs: THREE.Group[] = [];
      let parent: THREE.Object3D = high;
      for (let k = 0; k < ARM_SEGS; k++) {
        const s = new THREE.Group();
        if (k === 0) s.position.set(side * 0.3, 0.58, 0); else s.position.y = -ARM_SEG;
        const w = 0.09 - k * 0.006;
        s.add(mesh(box(w, ARM_SEG + 0.02, w).translate(0, -ARM_SEG / 2, 0), INK, k < 3));
        parent.add(s); segs.push(s); parent = s;
      }
      for (const f of [-1, 0, 1]) {
        const finger = mesh(box(0.025, 0.3, 0.025).translate(0, -0.15, 0), INK, false);
        finger.position.set(f * 0.035, -ARM_SEG, 0); finger.rotation.set(-0.25, 0, f * 0.25);
        parent.add(finger);
      }
      this.arms.push(segs);
    }
    // the head: a pale face on a round black skull, with the lamp in his forehead
    this.head.position.y = 0.95;
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.33, 16, 12), new THREE.MeshLambertMaterial({ map: faceTexture() }));
    face.rotation.y = Math.PI / 2;   // the middle of the canvas to the front (-z)
    face.scale.set(1, 1.15, 1);
    face.castShadow = true;
    this.lamp = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), new THREE.MeshBasicMaterial({ color: "#fff6d0" }));
    this.lamp.position.set(0, 0.17, -0.3);
    const horns = [-1, 1].map((side) => { const h = mesh(new THREE.ConeGeometry(0.06, 0.32, 6), INK, false); h.position.set(side * 0.2, 0.36, 0); h.rotation.z = -side * 0.5; return h; });
    this.head.add(face, this.lamp, ...horns);
    high.add(this.head);
    // a puddle of ink, for when he melts
    this.puddle = new THREE.Mesh(new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#0c0b0d" }));
    this.puddle.position.y = 0.04;
    this.puddle.visible = false;
    this.root.add(this.puddle);
    // the beam: an open cone from the lamp (its point at the lamp, its wide end along +z), and the
    // pool of light where it meets the ground
    this.beamMat = new THREE.MeshBasicMaterial({ color: BEAM_SCAN, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.beam = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 20, 1, true).translate(0, -0.5, 0).rotateX(-Math.PI / 2), this.beamMat);
    this.poolMat = new THREE.MeshBasicMaterial({ color: BEAM_SCAN, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    this.pool = new THREE.Mesh(new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2), this.poolMat);
    this.beam.frustumCulled = false;
    this.root.visible = this.beam.visible = this.pool.visible = false;
    scene.add(this.root, this.beam, this.pool);
  }

  /**
   * Pose him. yaw is the way his body faces, look the way his head and beam face. speed in m/s,
   * lash counts down from 1 over a swipe, pop is how far up out of the ground he is (0 to 1), dead
   * is seconds since he went down (or 0).
   */
  pose(x: number, y: number, z: number, yaw: number, look: number, speed: number, lash: number, pop: number, dead: number, hunting: boolean, dt: number): boolean {
    this.t += dt;
    const t = this.t;
    this.root.position.set(x, y, z);
    this.body.rotation.y = yaw;
    // sinking into the ground and springing back up: squashed flat and wide, then stretched tall
    const squash = Math.max(0.001, pop);
    this.root.scale.set(1 + (1 - pop) * 0.9, squash * (pop < 1 ? 1 + Math.sin(pop * Math.PI) * 0.25 : 1), 1 + (1 - pop) * 0.9);
    const stride = Math.floor(this.phase / Math.PI);
    this.phase += dt * speed * 1.4;
    const swing = Math.sin(this.phase) * Math.min(0.7, speed * 0.35);
    this.legs[0].hip.rotation.x = swing; this.legs[1].hip.rotation.x = -swing;
    this.legs[0].knee.rotation.x = Math.max(0, -Math.sin(this.phase)) * 0.9 * Math.min(1, speed);
    this.legs[1].knee.rotation.x = Math.max(0, Math.sin(this.phase)) * 0.9 * Math.min(1, speed);
    // the spine sways like a reed, more when he's after someone
    const sway = hunting ? 0.12 : 0.06;
    this.spine[0].rotation.z = Math.sin(t * 0.9) * sway;
    this.spine[1].rotation.z = -Math.sin(t * 0.9 + 0.8) * sway * 1.4;
    this.spine[0].rotation.x = hunting ? 0.12 : 0.04;   // a stoop, to peer down at you
    this.spine[1].rotation.x = hunting ? 0.18 : 0.08;
    // the head turns with the beam, as far as a neck can (and then some)
    const turn = Math.atan2(Math.sin(look - yaw), Math.cos(look - yaw));
    this.head.rotation.y = turn;
    this.head.rotation.x = hunting ? 0.25 : 0.12;
    // arms: noodles that wave about, and curl up when he's on the hunt
    this.arms.forEach((segs, side) => {
      const s = side ? 1 : -1;
      segs.forEach((g, k) => {
        const w = Math.sin(t * 1.6 + k * 0.7 + side * 1.9);
        g.rotation.x = (k === 0 ? -swing * 0.5 : 0) + w * (0.08 + k * 0.03) + (hunting ? -0.18 : 0);
        g.rotation.z = (k === 0 ? s * (hunting ? 0.45 : 0.12) : 0) + Math.cos(t * 1.3 + k * 0.6 + side) * (0.05 + k * 0.025) * s;
      });
    });
    // a lash: the right arm whips back over his shoulder and cracks down and across
    if (lash > 0) {
      const k = 1 - lash, up = k < 0.4;
      const shoulder = up ? (k / 0.4) * 2.8 : 2.8 - ((k - 0.4) / 0.6) * 2.2;
      const curl = up ? -0.3 * (k / 0.4) : 0.35 * Math.sin(((k - 0.4) / 0.6) * Math.PI);
      this.arms[1].forEach((g, j) => {
        g.rotation.x = j === 0 ? shoulder : curl;
        if (j === 0) g.rotation.z = -Math.sin(k * Math.PI) * 0.6;
      });
    }
    // down: he topples, then melts into his puddle
    if (dead > 0) {
      this.body.rotation.x = Math.min(Math.PI / 2, dead * 2.2);
      const melt = Math.min(1, Math.max(0, (dead - 1) / 4));
      this.body.position.y = -melt * 0.6;
      this.body.scale.set(1 + melt * 0.6, 1 - melt * 0.9, 1 + melt * 0.3);
      this.puddle.visible = true;
      this.puddle.scale.setScalar(0.3 + Math.min(1, dead / 3) * 2.2);
    } else {
      this.body.rotation.x = 0; this.body.position.y = 0; this.body.scale.setScalar(1);
      this.puddle.visible = false;
    }
    return Math.floor(this.phase / Math.PI) !== stride;
  }

  /** Point the beam from his lamp to (ex, ey, ez), red if he's locked on. */
  aim(ex: number, ey: number, ez: number, hunting: boolean, show: boolean) {
    this.beam.visible = this.pool.visible = show;
    if (!show) return;
    this.root.updateMatrixWorld(true);
    const from = this.lamp.getWorldPosition(new THREE.Vector3());
    const to = new THREE.Vector3(ex, ey, ez), len = Math.max(0.5, from.distanceTo(to));
    const r = Math.tan(BEAM_HALF) * len;
    this.beam.position.copy(from);
    this.beam.lookAt(to);
    this.beam.scale.set(r, r, len);
    const col = hunting ? BEAM_HUNT : BEAM_SCAN;
    this.beamMat.color.copy(col); this.poolMat.color.copy(col);
    // it fades as he gets close, so you aren't stood blinded inside it
    this.beamMat.opacity = (hunting ? 0.22 : 0.15) * Math.min(1, Math.max(0, (len - 4) / 10));
    this.pool.position.set(ex, ey + 0.05, ez);
    this.pool.scale.setScalar(r * 1.1);
  }

  hide() { this.root.visible = this.beam.visible = this.pool.visible = false; }
}

/** Ray against a tall thin figure: a body cylinder and a head sphere. */
function hitTall(o: THREE.Vector3, d: THREE.Vector3, x: number, y: number, z: number) {
  let best: { dist: number; head: boolean } | null = null;
  const hy = y + 3.62, hr = 0.38;
  const ox = o.x - x, oy = o.y - hy, oz = o.z - z;
  const b = ox * d.x + oy * d.y + oz * d.z, c = ox * ox + oy * oy + oz * oz - hr * hr, disc = b * b - c;
  if (disc >= 0) { const t = -b - Math.sqrt(disc); if (t > 0) best = { dist: t, head: true }; }
  const r = 0.4, a2 = d.x * d.x + d.z * d.z;
  if (a2 > 1e-9) {
    const fx = o.x - x, fz = o.z - z;
    const b2 = fx * d.x + fz * d.z, c2 = fx * fx + fz * fz - r * r, disc2 = b2 * b2 - a2 * c2;
    if (disc2 >= 0) {
      for (const t of [(-b2 - Math.sqrt(disc2)) / a2, (-b2 + Math.sqrt(disc2)) / a2]) {
        const yy = o.y + d.y * t;
        if (t > 0 && yy >= y && yy <= y + 3.3) { if (!best || t < best.dist) best = { dist: t, head: false }; break; }
      }
    }
  }
  return best;
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export class Bendy {
  /** Number 1, in scene coordinates, or null if this map hasn't got the street. */
  readonly home: { x: number; z: number } | null;
  state = GONE; gen = 0; hp = BENDY_HP; target = "";
  x = 0; y = 0; z = 0; yaw = 0; look = 0; lashes = 0; jumps = 0; sunk = false;   // the host's word
  // host only
  private spawnT = FIRST_SECS; private deadT = 0; private seeT = 0; private calmT = 0;
  private stareT = 0; private sinkT = 0; private jumpT = 0; private windT = 0; private lashCD = 0;
  private goX = 0; private goZ = 0; private goT = 0; private spin = 0; private vx = 0; private vz = 0; private stuckT = 0;
  private sendT = 0;
  // as drawn
  private dx = 0; private dy = 0; private dz = 0; private dyaw = 0; private dlook = 0; private speed = 0;
  private snaps: { t: number; x: number; y: number; z: number; yaw: number; look: number }[] = [];
  private seenLashes = 0; private seenJumps = 0; private seenTarget = ""; private seenSunk = false;
  private lashAnim = 0; private pop = 0; private deadAnim = 0;
  private fig: Figure;

  // Called on every client, for sounds and messages.
  /** He's spotted someone (id) and locked his beam on them. */
  onSpot: (x: number, y: number, z: number, id: string) => void = () => {};
  /** He sinks into the ground (out) or pops up again. */
  onJump: (x: number, y: number, z: number, out: boolean) => void = () => {};
  /** He lashes out. */
  onLash: (x: number, y: number, z: number) => void = () => {};
  /** A foot comes down. */
  onStep: (x: number, y: number, z: number) => void = () => {};

  constructor(private map: GameMap, scene: THREE.Scene) {
    this.home = findHome(map);
    this.fig = new Figure(scene);
  }

  get key() { return `bendy.${this.gen}`; }

  // ---- host: the AI -------------------------------------------------------------------------

  /** Run him for a frame. lash(id, damage) is called when he catches player id. */
  simulate(dt: number, targets: Target[], lash: (id: string, damage: number) => void) {
    if (!this.home) return;
    const alive = targets.filter((t) => t.alive), dark = nightNow() > DARK;
    if (this.state === GONE) {
      if ((this.spawnT -= dt) <= 0 && dark) this.spawn();
      return;
    }
    if (this.state === DEAD) {
      if ((this.deadT += dt) > CORPSE_SECS) { this.state = GONE; this.spawnT = RESPAWN_SECS; }
      return;
    }
    if (!dark) {
      // first light: down into the ground he goes, wherever he is, and he's gone till dark
      if (!this.sunk) { this.target = ""; this.sink(); }
      else if ((this.sinkT -= dt) <= 0) { this.state = GONE; this.target = ""; this.spawnT = FIRST_SECS; }
      return;
    }
    this.calmT -= dt; this.lashCD -= dt;
    let t = this.target ? alive.find((p) => p.id === this.target) : undefined;
    if (this.target && (!t || Math.hypot(t.x - this.home.x, t.z - this.home.z) > LEASH)) { this.giveUp(); t = undefined; }
    if (t) this.hunt(dt, t, lash);
    else this.scan(dt, alive);
  }

  /** Up out of the ground somewhere on his patch. */
  private spawn() {
    const at = this.spotNear(this.home!.x, this.home!.z, 0, PATCH * 0.8) ?? [this.home!.x, this.home!.z];
    Object.assign(this, {
      state: ALIVE, gen: this.gen + 1, hp: BENDY_HP, target: "", sunk: false, x: at[0], z: at[1], y: this.map.ground(at[0], at[1]),
      yaw: Math.random() * Math.PI * 2, calmT: 0, goT: 0, stareT: 0, sinkT: 0, windT: 0, lashCD: 0, vx: 0, vz: 0,
    });
    this.look = this.spin = this.yaw;
    this.jumps++;
  }

  /** Somewhere clear between rMin and rMax from (x, z), on ground near height y if given. */
  private spotNear(x: number, z: number, rMin: number, rMax: number, y?: number): [number, number] | null {
    for (let k = 0; k < 16; k++) {
      const a = Math.random() * Math.PI * 2, r = rMin + Math.random() * (rMax - rMin);
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (this.map.blocked(px, pz, RADIUS + 0.1) || this.map.fieldEdge(px, pz) < 5) continue;
      if (y !== undefined && Math.abs(this.map.ground(px, pz) - y) > 2.5) continue;
      return [px, pz];
    }
    return null;
  }

  /** Walk the patch, sweeping the beam round, and look for anyone in it. */
  private scan(dt: number, alive: Target[]) {
    const home = this.home!;
    // the beam goes round like a lighthouse's, nodding back and forth as it goes
    this.spin += dt * SCAN_SPIN;
    this.look = wrap(this.spin + Math.sin(this.spin * 2.3) * 0.5);
    // a slow walk from one spot on the patch to another, with a pause at each
    this.goT -= dt;
    if (this.goT <= 0) {
      const to = this.spotNear(home.x, home.z, 0, PATCH);
      if (to) { this.goX = to[0]; this.goZ = to[1]; }
      this.goT = 20 + Math.random() * 20;
    }
    const gx = this.goX - this.x, gz = this.goZ - this.z, gl = Math.hypot(gx, gz);
    const go = gl > 1.5 && this.goT < 16;
    this.walk(dt, go ? gx / gl : 0, go ? gz / gl : 0);
    // anyone in the beam, with nothing in the way, is spotted
    if ((this.seeT -= dt) > 0 || this.calmT > 0) return;
    this.seeT = 0.25;
    const lamp = this.y + TALL - 0.2;
    for (const t of alive) {
      const ex = t.x - this.x, ez = t.z - this.z, d = Math.hypot(ex, ez);
      if (d > BEAM + 4 || d < 0.5 || Math.abs(wrap(Math.atan2(-ex, -ez) - this.look)) > BEAM_HALF + 1.2 / d) continue;
      const ey = t.y + 1.2 - lamp, l = Math.hypot(ex, ey, ez);
      const hit = this.map.raycast(this.x, lamp, this.z, ex / l, ey / l, ez / l, l);
      if (hit && hit.dist < l - 0.5) continue;
      this.lockOn(t.id);
      return;
    }
  }

  private lockOn(id: string) {
    this.target = id;
    this.stareT = STARE;
    this.sinkT = 0;
  }

  /** Back home: down into the ground here, and up again on his patch. */
  private giveUp() {
    this.target = "";
    this.calmT = CALM_SECS;
    const at = this.spotNear(this.home!.x, this.home!.z, 0, PATCH * 0.6);
    if (at) { this.x = at[0]; this.z = at[1]; this.y = this.map.ground(at[0], at[1]); this.jumps++; }
    this.sunk = false;
  }

  /** On someone: stare them down, then sink and pop up beside them, lash, and again. */
  private hunt(dt: number, t: Target, lash: (id: string, damage: number) => void) {
    const ex = t.x - this.x, ez = t.z - this.z, d = Math.hypot(ex, ez);
    this.look = Math.atan2(-ex, -ez);
    if (this.stareT > 0) {
      this.stareT -= dt;
      this.walk(dt, 0, 0, this.look);
      if (this.stareT <= 0) this.sink();
      return;
    }
    if (this.sunk) {
      if ((this.sinkT -= dt) > 0) return;
      // up again, a few metres from them, facing them
      const at = this.spotNear(t.x, t.z, 2, 4.2, t.y) ?? this.spotNear(t.x, t.z, 4, 9) ?? [this.x, this.z];
      this.x = at[0]; this.z = at[1]; this.y = this.map.ground(at[0], at[1]);
      this.yaw = this.look = Math.atan2(-(t.x - this.x), -(t.z - this.z));
      this.sunk = false; this.jumps++;
      this.windT = WIND_UP; this.jumpT = 1.4 + Math.random() * 1.6;
      return;
    }
    this.windT -= dt; this.jumpT -= dt;
    // a stride or two at them if they're just out of reach
    const close = d < REACH && Math.abs(t.y - this.y) < 2.6;
    this.walk(dt, !close && d < 7 ? ex / d : 0, !close && d < 7 ? ez / d : 0, this.look, 3.2);
    if (close && this.windT <= 0 && this.lashCD <= 0) {
      this.lashCD = LASH_EVERY; this.lashes++;
      lash(t.id, LASH);
    }
    // off again: on time, or straight away if they've got away from him
    if (this.jumpT <= 0 || (d > 7 && this.windT < WIND_UP - 0.3)) this.sink();
  }

  private sink() { this.sunk = true; this.sinkT = SINK; }

  /** Step along (dirX, dirZ) at speed, facing face if given, round whatever's in the way. */
  private walk(dt: number, dirX: number, dirZ: number, face?: number, speed = WALK) {
    const k = Math.min(1, dt * 4);
    this.vx += (dirX * speed - this.vx) * k; this.vz += (dirZ * speed - this.vz) * k;
    const nx = this.x + this.vx * dt, nz = this.z + this.vz * dt;
    // he steps over garden walls and fences without noticing
    const p = this.map.collide({ x: nx, z: nz }, this.y + 1.3, RADIUS);
    if ((dirX || dirZ) && Math.hypot(p.x - this.x, p.z - this.z) < speed * dt * 0.3) {
      if ((this.stuckT += dt) > 1.5) { this.stuckT = 0; this.goT = 0; }   // stuck: somewhere else, then
    } else this.stuckT = 0;
    this.x = p.x; this.z = p.z;
    this.y = this.map.ground(this.x, this.z);
    const want = face ?? (Math.hypot(this.vx, this.vz) > 0.3 ? Math.atan2(-this.vx, -this.vz) : this.yaw);
    this.yaw += wrap(want - this.yaw) * Math.min(1, dt * 3);
  }

  /** Host: he was shot. Returns "kill", "dmg", or null if the shot doesn't count. */
  damage(gen: number, amount: number): "kill" | "dmg" | null {
    if (this.state !== ALIVE || gen !== this.gen || this.sunk) return null;
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp > 0) return "dmg";
    this.state = DEAD; this.deadT = 0; this.deadAnim = 0; this.target = "";
    return "kill";
  }

  /** Host: he goes for whoever shot him (and sometimes leaves whoever he was after for them). */
  aggro(id: string) {
    if (this.state !== ALIVE || this.target === id) return;
    if (this.target && Math.random() < 0.7) return;
    this.lockOn(id);
    this.stareT = 0.3;
  }

  /** Host: send his state now? Often while anyone's near him, now and then while no one is. */
  due(dt: number, targets: Target[]) {
    if ((this.sendT -= dt) > 0 || !this.home) return false;
    const near = targets.some((t) => Math.hypot(t.x - this.x, t.z - this.z) < 500);
    this.sendT = near ? 0.1 : 1;
    return true;
  }

  snapshot(): BendyState {
    const q = (v: number) => Math.round(v * 100) / 100;
    return { s: [this.state, this.gen, q(this.x), q(this.y), q(this.z), q(this.yaw), q(this.look), Math.round(this.hp), this.lashes, this.jumps, this.sunk ? 1 : 0], t: this.state === ALIVE ? this.target : "" };
  }

  // ---- everyone else: the host's updates ------------------------------------------------------

  apply(d: BendyState) {
    if (!Array.isArray(d?.s) || d.s.length < 11) return;
    const [state, gen, x, y, z, yaw, look, hp, lashes, jumps, sunk] = d.s;
    if (gen !== this.gen) { this.seenLashes = lashes; this.deadAnim = 0; }
    // a kill event can beat the update that says so
    if (!(this.state === DEAD && gen === this.gen && state === ALIVE)) {
      if (state === DEAD && this.state !== DEAD) this.deadAnim = 0;
      this.state = state;
    }
    // a jump is a jump: no smoothing him across the gap
    if (jumps !== this.jumps || gen !== this.gen) this.snaps = [];
    Object.assign(this, { gen, x, y, z, yaw, look, hp, lashes, jumps, sunk: !!sunk, target: String(d.t ?? "") });
    if (state !== GONE) {
      this.snaps.push({ t: performance.now(), x, y, z, yaw, look });
      if (this.snaps.length > 20) this.snaps.shift();
    }
  }

  /** Someone's kill event: down he goes, without waiting for the host's next update. */
  killed(gen: number) {
    if (gen === this.gen && this.state === ALIVE) { this.state = DEAD; this.deadAnim = 0; this.target = ""; }
  }

  // ---- everyone: drawing and hit tests -----------------------------------------------------

  /** Draw him. where(id) is where a player is as you see them, to point his beam at. */
  update(dt: number, host: boolean, where: (id: string) => { x: number; y: number; z: number } | null) {
    const now = performance.now() - DELAY;
    const px = this.dx, pz = this.dz;
    if (this.jumps !== this.seenJumps) {
      // gone from there, and up here
      if (this.state === ALIVE && this.seenJumps) this.onJump(this.x, this.y, this.z, false);
      this.seenJumps = this.jumps;
      this.pop = 0;
      this.dx = this.x; this.dy = this.y; this.dz = this.z; this.dyaw = this.yaw; this.dlook = this.look;
    } else if (host || this.snaps.length < 2) {
      this.dx = this.x; this.dy = this.y; this.dz = this.z; this.dyaw = this.yaw; this.dlook = this.look;
    } else {
      const S = this.snaps;
      let a = S[0], b = S[S.length - 1];
      for (let k = 0; k < S.length - 1; k++) if (S[k].t <= now && S[k + 1].t >= now) { a = S[k]; b = S[k + 1]; break; }
      if (now >= b.t) a = b;
      const f = b.t > a.t ? Math.min(1, Math.max(0, (now - a.t) / (b.t - a.t))) : 1;
      this.dx = a.x + (b.x - a.x) * f; this.dy = a.y + (b.y - a.y) * f; this.dz = a.z + (b.z - a.z) * f;
      this.dyaw = a.yaw + wrap(b.yaw - a.yaw) * f;
      this.dlook = a.look + wrap(b.look - a.look) * f;
    }
    const moved = Math.hypot(this.dx - px, this.dz - pz) / Math.max(dt, 1e-3);
    this.speed += ((moved < 8 ? moved : 0) - this.speed) * Math.min(1, dt * 8);
    const alive = this.state === ALIVE, target = alive ? this.target : "";
    if (target && target !== this.seenTarget) this.onSpot(this.dx, this.dy, this.dz, target);
    this.seenTarget = target;
    if (this.sunk && !this.seenSunk && alive) this.onJump(this.dx, this.dy, this.dz, true);
    this.seenSunk = this.sunk;
    if (this.lashes !== this.seenLashes) {
      if (this.lashes > this.seenLashes && alive) { this.lashAnim = 1; this.onLash(this.dx, this.dy, this.dz); }
      this.seenLashes = this.lashes;
    }
    this.lashAnim = Math.max(0, this.lashAnim - dt / 0.45);
    this.pop = alive && this.sunk ? Math.max(0, this.pop - dt / (SINK * 0.8)) : Math.min(1, this.pop + dt / 0.3);
    if (this.state === DEAD) this.deadAnim += dt;
    const fig = this.fig;
    const shown = alive ? this.pop > 0.01 : this.state === DEAD && this.deadAnim < CORPSE_SECS + 2;
    if (!shown) { fig.hide(); return; }
    fig.root.visible = true;
    const dead = this.state === DEAD ? this.deadAnim + 0.001 : 0;
    const down = fig.pose(this.dx, this.dy, this.dz, this.dyaw, this.dlook, alive ? this.speed : 0, this.lashAnim, alive ? this.pop : 1, dead, !!target, dt);
    if (down && alive && this.speed > 0.4) this.onStep(this.dx, this.dy, this.dz);
    // the beam: on whoever he's locked on to, or out across the ground ahead of him
    let end: { x: number; y: number; z: number } | null = target ? where(target) : null;
    if (end) end = { x: end.x, y: end.y + 0.3, z: end.z };
    else {
      const ex = this.dx - Math.sin(this.dlook) * BEAM, ez = this.dz - Math.cos(this.dlook) * BEAM;
      const ly = this.dy + TALL - 0.2, ey = this.map.ground(ex, ez) - ly, l = Math.hypot(ex - this.dx, ey, ez - this.dz);
      const hit = this.map.raycast(this.dx, ly, this.dz, (ex - this.dx) / l, ey / l, (ez - this.dz) / l, l);
      const k = hit ? hit.dist / l : 1;
      end = { x: this.dx + (ex - this.dx) * k, y: ly + ey * k, z: this.dz + (ez - this.dz) * k };
    }
    fig.aim(end.x, end.y, end.z, !!target, alive && this.pop > 0.9);
  }

  /** Where a ray from o along unit vector d hits him within maxDist, as drawn. */
  hit(o: THREE.Vector3, d: THREE.Vector3, maxDist: number): { gen: number; dist: number; head: boolean } | null {
    if (this.state !== ALIVE || this.sunk || this.pop < 0.6) return null;
    const h = hitTall(o, d, this.dx, this.dy, this.dz);
    return h && h.dist < maxDist ? { gen: this.gen, ...h } : null;
  }

  /** Him as drawn, if he's up and about. */
  living() {
    return this.state === ALIVE && !this.sunk ? { key: this.key, gen: this.gen, x: this.dx, y: this.dy, z: this.dz, hp: this.hp, target: this.target } : null;
  }

  /** Where he is (or his puddle), as drawn. */
  at() { return { key: this.key, gen: this.gen, x: this.dx, y: this.dy, z: this.dz, hp: this.hp, state: this.state }; }
}

/**
 * Number 1 Fonthill Road. The map has the street but not the house numbers, so it's the end of the
 * street nearer town (the east end), where the numbers start.
 */
function findHome(map: GameMap): { x: number; z: number } | null {
  let best: number[] | null = null;
  for (const r of [...map.d.rd, ...map.wide?.rd ?? []]) {
    if (r.n !== STREET) continue;
    for (const p of r.p) if (!best || p[0] > best[0]) best = p;
  }
  return best ? { x: best[0], z: -best[1] } : null;
}
