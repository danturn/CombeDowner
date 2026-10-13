// Monster models for the mines: low-poly figures built from primitives, painted with small pixel-art
// hides (art.ts), lit by their own glowing eyes and lamps, and animated in code (no skeletons).
// Each kind is built so its silhouette reads at a glance in a dark heading, Ultima Underworld style.
import * as THREE from "three";
import { gore as goreOn } from "../gore";
import { beam, BossHide, bossHide, mobHide, MobHide, mobHideX, MobHideX, MOB_HIDES_X, wispFace } from "./art";

export type MobKind = "ghoul" | "bat" | "golem" | "blob" | "grout" | "rat" | "headless" | "reaper" | "gazer" | "spider" | "wisp" | "knocker" | "mimic" | "puffcap" | "centipede" | "beetle" | "drowned" | "wight" | "wraith" | "troll" | "crossbow" | "engine" | "wyrm" | "rime" | "owner";

const FLASH = 0.12;
const TAU = Math.PI * 2;
type P3 = [number, number, number];
const UP = new THREE.Vector3(0, 1, 0);
/** Scratch vectors for the crossbowman's arms, so they cost nothing to move each frame. */
const IK = { dir: new THREE.Vector3(), e2: new THREE.Vector3(), u: new THREE.Vector3(), f: new THREE.Vector3(), y: new THREE.Vector3(), z: new THREE.Vector3(), x: new THREE.Vector3(), m: new THREE.Matrix4() };
const POLE_R = new THREE.Vector3(1, -0.6, 0.5), POLE_L = new THREE.Vector3(-1, -0.8, 0.3);
const ROD = new THREE.Vector3();

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (x: number) => { const k = clamp01(x); return k * k * (3 - 2 * k); };

let eyeTex: THREE.CanvasTexture | null = null;
/** A small white radial glow, tinted per sprite. Shared by every mob. */
function eyeGlow(): THREE.CanvasTexture {
  if (eyeTex) return eyeTex;
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.3, "rgba(255,255,255,0.65)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 32, 32);
  eyeTex = new THREE.CanvasTexture(c);
  return eyeTex;
}

/** Hides are drawn once and shared by every monster (dispose() leaves textures alone). */
const hides = new Map<string, THREE.Texture>();
function hide(k: MobHide | MobHideX, rx = 1, ry = 1): THREE.Texture {
  const key = `${k}:${rx}:${ry}`;
  let t = hides.get(key);
  if (t) return t;
  let b = hides.get(`${k}:1:1`);
  if (!b) { b = (MOB_HIDES_X as readonly string[]).includes(k) ? mobHideX(k as MobHideX, 3) : mobHide(k as MobHide, 3); hides.set(`${k}:1:1`, b); }
  if (rx === 1 && ry === 1) return b;
  t = b.clone();
  t.repeat.set(rx, ry);
  t.needsUpdate = true;
  hides.set(key, t);
  return t;
}
function bhide(k: BossHide, rx = 1, ry = 1): THREE.Texture {
  const key = `boss:${k}:${rx}:${ry}`;
  let t = hides.get(key);
  if (t) return t;
  let b = hides.get(`boss:${k}:1:1`);
  if (!b) { b = bossHide(k, 3); hides.set(`boss:${k}:1:1`, b); }
  if (rx === 1 && ry === 1) return b;
  t = b.clone();
  t.repeat.set(rx, ry);
  t.needsUpdate = true;
  hides.set(key, t);
  return t;
}
let beamTex: THREE.Texture | null = null;
let faceTex: THREE.Texture | null = null;

/** Tiny seeded random so a given kind always looks the same shape. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** Height of the top of each model above its origin, used to float a champion's key above the head. */
const TOP: Record<MobKind, number> = {
  ghoul: 1.75, bat: 0.35, golem: 2.4, blob: 0.95, grout: 3.5, rat: 0.45,
  headless: 2.0, reaper: 3.0, gazer: 0.8, spider: 0.75, wisp: 0.35,
  knocker: 1.05, mimic: 0.75, puffcap: 1.2, centipede: 0.35, beetle: 0.6, drowned: 1.95, wight: 1.95, wraith: 0.7, troll: 2.6, crossbow: 1.85,
  engine: 4.8, wyrm: 3.2, rime: 4.2, owner: 3.0,
};
/** How long after death each kind lies there before it fades away. */
const FADE_AT: Record<MobKind, number> = {
  ghoul: 1.8, bat: 1.4, golem: 2.4, blob: 1.6, grout: 3.0, rat: 1.3,
  headless: 2.0, reaper: 2.4, gazer: 1.5, spider: 1.6, wisp: 0.9,
  knocker: 1.5, mimic: 1.8, puffcap: 1.6, centipede: 1.6, beetle: 1.8, drowned: 2.2, wight: 2.0, wraith: 1.0, troll: 2.6, crossbow: 2.0,
  engine: 4.5, wyrm: 4.0, rime: 3.6, owner: 3.4,
};
/** Bosses' special moves (bosses.ts MOVE), for posing. */
const MV = { SWIPE: 1, SLAM: 2, SHOCK: 3, CHARGE: 4, SUMMON: 5, STEAM: 6, FLOOD: 7, DIVE: 8, UNDER: 9, SURFACE: 10, BREATH: 11, TAIL: 12, SPIKES: 13, FROST: 14, SHATTER: 15, BLINK: 16, THROW: 17, CURSE: 18, LEAP: 20, STUN: 21 };

/** A bit of scenery for each kind: moving parts are kept here so update() can pose them. */
type Anim = (dt: number, state: number, moving: number, t: number, dead: number) => void;
type Mat = THREE.MeshLambertMaterial | THREE.MeshPhongMaterial;
interface MatOpts { e?: number; map?: THREE.Texture; shine?: number; spec?: number; flat?: boolean; side?: THREE.Side; opacity?: number }

export class MobView {
  readonly group = new THREE.Group();
  private mats: { m: Mat; base: THREE.Color }[] = [];
  private fades: { m: THREE.Material; a: number }[] = [];
  private flashT = 0;
  private deadT = 0;
  private dying = false;
  private phase = 0;
  /** 0..1 while winding up an attack. */
  private wind = 0;
  /** 1 the moment a blow lands (wind-up released), decaying to 0: drives the follow-through. */
  private strike = 0;
  private lastState = 0;
  /** 1 while alive, falling to 0 as the corpse fades. Managed glows multiply by it. */
  private fade = 1;
  private anim: Anim;

  /** Elite carrying a key: bigger, faintly gold, with an iron key floating over its head. */
  readonly champion: boolean;
  /** A mini-boss: much bigger, with a smouldering red cast. */
  readonly mini: boolean;
  /** A boss's special move (bosses.ts MOVE), how long it's been at it, and its phase. */
  private move = 0;
  private moveT = 0;
  private bphase = 0;

  constructor(readonly kind: MobKind, opts: { champion?: boolean; mini?: boolean } = {}) {
    this.champion = !!opts.champion;
    this.mini = !!opts.mini;
    this.anim = this[kind]();
    if (this.champion) this.crown();
    if (this.mini) this.bigger();
    this.group.traverse((o) => { o.castShadow = false; o.receiveShadow = false; });
  }

  update(dt: number, state: number, moving: number, t: number, move = 0, phase = 0): void {
    if (move !== this.move) { this.move = move; this.moveT = 0; } else this.moveT += dt;
    this.bphase = phase;
    this.deadT = state === 3 ? this.deadT + dt : 0;
    if (state === 3 && !this.dying) {
      this.dying = true;
      for (const f of this.fades) { f.m.transparent = true; f.m.needsUpdate = true; }
    }
    this.phase += dt * moving;
    if (this.lastState === 2 && state !== 2) this.strike = 1;
    this.lastState = state;
    this.strike = Math.max(0, this.strike - dt * 3.2);
    const w = state === 2 ? 1 : 0;
    this.wind += (w - this.wind) * Math.min(1, dt * (w ? 4 : 12));
    this.fade = 1 - clamp01((this.deadT - FADE_AT[this.kind]) / 0.7);
    this.anim(dt, state, moving, t, this.deadT);
    // staggered by its weakness: it reels
    const reel = this.move === MV.STUN && state !== 3 ? Math.sin(this.moveT * 15) * 0.09 * Math.max(0, 1 - this.moveT / 1.5) : 0;
    this.group.rotation.x = reel * 0.6; this.group.rotation.z = reel;
    if (this.dying && this.kind !== "owner") for (const f of this.fades) f.m.opacity = f.a * this.fade;   // (the Owner's Ghost fades itself, thinning out as he dies)
    this.group.visible = this.fade > 0;
    this.flashT = Math.max(0, this.flashT - dt);
    const hot = this.flashT > 0;
    for (const { m, base } of this.mats) m.emissive.set(hot ? 0xff1010 : base);
  }

  flash(): void { this.flashT = FLASH; }

  dispose(): void {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | undefined;
      if (mat) mat.dispose();
    });
    this.group.removeFromParent();
  }

  // ---- helpers ----

  private mat(color: number, o: MatOpts = {}): Mat {
    const p = {
      color, emissive: o.e ?? 0, map: o.map ?? null, flatShading: !!o.flat, side: o.side ?? THREE.FrontSide,
      transparent: o.opacity !== undefined, opacity: o.opacity ?? 1,
    };
    const m = o.shine ? new THREE.MeshPhongMaterial({ ...p, shininess: o.shine, specular: o.spec ?? 0x333333 }) : new THREE.MeshLambertMaterial(p);
    this.mats.push({ m, base: new THREE.Color(o.e ?? 0) });
    this.fades.push({ m, a: p.opacity });
    return m;
  }

  /** Unlit glowing stuff: flames, lenses, seams of fire. */
  private glowMat(color: number, opacity = 1, additive = false, map: THREE.Texture | null = null): THREE.MeshBasicMaterial {
    const m = new THREE.MeshBasicMaterial({
      color, map, opacity, transparent: opacity < 1 || additive, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: !additive, side: additive ? THREE.DoubleSide : THREE.FrontSide,
    });
    this.fades.push({ m, a: opacity });
    return m;
  }

  private put<T extends THREE.Object3D>(parent: THREE.Object3D, o: T, x: number, y: number, z: number): T {
    o.position.set(x, y, z);
    parent.add(o);
    return o;
  }

  private piv(parent: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Group {
    return this.put(parent, new THREE.Group(), x, y, z);
  }

  private box(p: THREE.Object3D, w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
    return this.put(p, new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m), x, y, z);
  }

  private ball(p: THREE.Object3D, r: number, m: THREE.Material, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx, ws = 10, hs = 8): THREE.Mesh {
    const b = this.put(p, new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), m), x, y, z);
    b.scale.set(sx, sy, sz);
    return b;
  }

  private cyl(p: THREE.Object3D, rt: number, rb: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 7, open = false): THREE.Mesh {
    return this.put(p, new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), m), x, y, z);
  }

  /** A cone pointing up +y. */
  private cone(p: THREE.Object3D, r: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 5): THREE.Mesh {
    return this.put(p, new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), m), x, y, z);
  }

  /** A rough stone. */
  private rock(p: THREE.Object3D, r: number, m: THREE.Material, x = 0, y = 0, z = 0, rnd: () => number = Math.random): THREE.Mesh {
    const o = this.put(p, new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), m), x, y, z);
    o.rotation.set(rnd() * 6, rnd() * 6, rnd() * 6);
    o.scale.set(0.8 + rnd() * 0.5, 0.7 + rnd() * 0.4, 0.8 + rnd() * 0.5);
    return o;
  }

  /** A tapered rod from a to b (radius r0 at a, r1 at b), for limbs, roots and claws. */
  private bone(p: THREE.Object3D, a: P3, b: P3, r0: number, r1: number, m: THREE.Material, seg = 6): THREE.Mesh {
    const A = new THREE.Vector3(...a), d = new THREE.Vector3(...b).sub(A), len = d.length();
    const g = new THREE.CylinderGeometry(r1, r0, len, seg);
    g.translate(0, len / 2, 0);
    const o = this.put(p, new THREE.Mesh(g, m), A.x, A.y, A.z);
    o.quaternion.setFromUnitVectors(UP, d.normalize());
    return o;
  }

  /** A flat membrane in the local xz plane (pts are [x, z, sag]: sag pulls the edge into it towards the centre). */
  private sheet(p: THREE.Object3D, pts: [number, number, number][], m: THREE.Material): THREE.Mesh {
    const cx = pts.reduce((s, q) => s + q[0], 0) / pts.length, cz = pts.reduce((s, q) => s + q[1], 0) / pts.length;
    const sh = new THREE.Shape();
    sh.moveTo(pts[0][0], -pts[0][1]);
    for (let i = 1; i <= pts.length; i++) {
      const a = pts[i - 1], b = pts[i % pts.length], sag = b[2];
      if (sag) {
        const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
        sh.quadraticCurveTo(mx + (cx - mx) * sag, -(mz + (cz - mz) * sag), b[0], -b[1]);
      } else sh.lineTo(b[0], -b[1]);
    }
    const g = new THREE.ShapeGeometry(sh, 4);
    g.rotateX(-Math.PI / 2);
    return this.put(p, new THREE.Mesh(g, m), 0, 0, 0);
  }

  private lathe(p: THREE.Object3D, pts: [number, number][], m: THREE.Material, seg = 14): THREE.Mesh {
    return this.put(p, new THREE.Mesh(new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg), m), 0, 0, 0);
  }

  /** A glowing sprite. A managed one has its opacity set by the kind's animation (times this.fade). */
  private eye(p: THREE.Object3D, color: number, size: number, x: number, y: number, z: number, managed = false): THREE.Sprite {
    const m = new THREE.SpriteMaterial({
      map: eyeGlow(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false,
    });
    if (!managed) this.fades.push({ m, a: 1 });
    const s = this.put(p, new THREE.Sprite(m), x, y, z);
    s.scale.set(size, size, 1);
    return s;
  }

  private glowOp(s: THREE.Sprite, v: number): void { (s.material as THREE.SpriteMaterial).opacity = clamp01(v) * this.fade; }

  /**
   * Breaks the model into falling pieces when it dies: each mesh is lifted out of its limb, keeping
   * where it was, then tumbles to the floor. Returns the per-frame pose for a given time dead.
   */
  private shatter(seed: number, filter: (m: THREE.Mesh) => boolean = () => true): (dead: number) => void {
    const r = seeded(seed);
    let parts: { o: THREE.Object3D; p: THREE.Vector3; q: THREE.Euler; v: THREE.Vector3; s: THREE.Vector3; floor: number }[] | null = null;
    return (dead) => {
      if (!parts) {
        this.group.updateMatrixWorld(true);
        const list: THREE.Mesh[] = [];
        this.group.traverse((o) => { if ((o as THREE.Mesh).isMesh && filter(o as THREE.Mesh)) list.push(o as THREE.Mesh); });
        parts = list.map((o) => {
          this.group.attach(o);
          const bb = new THREE.Box3().setFromObject(o);
          const hgt = (bb.max.y - bb.min.y) / this.group.scale.y;
          return {
            o, p: o.position.clone(), q: o.rotation.clone(),
            v: new THREE.Vector3((r() - 0.5) * 2.2, 0.6 + r() * 1.4, (r() - 0.5) * 2.2),
            s: new THREE.Vector3((r() - 0.5) * 7, (r() - 0.5) * 5, (r() - 0.5) * 7),
            floor: Math.min(o.position.y, Math.max(0.04, hgt * 0.35)),
          };
        });
      }
      for (const c of parts) {
        // fall until it hits the floor, then stop spinning
        const tHit = (c.v.y + Math.sqrt(c.v.y * c.v.y + 2 * 9.8 * Math.max(0, c.p.y - c.floor))) / 9.8;
        const tt = Math.min(dead, tHit);
        c.o.position.set(c.p.x + c.v.x * tt * 0.5, Math.max(c.floor, c.p.y + c.v.y * tt - 4.9 * tt * tt), c.p.z + c.v.z * tt * 0.5);
        c.o.rotation.set(c.q.x + c.s.x * tt * 0.4, c.q.y + c.s.y * tt * 0.4, c.q.z + c.s.z * tt * 0.4);
      }
    };
  }

  /** Champion look: gold tint, a bigger body and a spinning iron key. */
  private crown(): void {
    const gold = new THREE.Color(0x3a2c08);
    for (const { m, base } of this.mats) { base.add(gold); m.emissive.copy(base); }
    this.group.scale.setScalar(1.25);
    const iron = this.mat(0x34343a, { e: 0x2a2008 });
    const key = new THREE.Group();
    key.add(new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.025, 6, 10), iron).translateY(0.2));
    this.box(key, 0.035, 0.3, 0.035, iron, 0, 0.02, 0);
    this.box(key, 0.09, 0.035, 0.035, iron, 0.05, -0.12, 0);
    this.box(key, 0.07, 0.035, 0.035, iron, 0.04, -0.06, 0);
    const top = TOP[this.kind] + 0.4;
    key.position.y = top;
    this.group.add(key);
    const inner = this.anim;
    this.anim = (dt, state, moving, t, dead) => {
      inner(dt, state, moving, t, dead);
      key.rotation.y = t * 1.5;
      let y = top + Math.sin(t * 2) * 0.04;
      if (this.kind === "spider" && state === 0) y = -0.6;
      if (dead > 0) y = Math.max(0.15, y - 4.9 * dead * dead);
      key.position.y = y;
      key.visible = dead < 1.5;
    };
  }

  /** Mini-boss look: half again as big, a dull red cast, and a smouldering glow over it. */
  private bigger(): void {
    const red = new THREE.Color(0x2a0604);
    for (const { m, base } of this.mats) { base.add(red); m.emissive.copy(base); }
    this.group.scale.setScalar(1.6);
    const ember = this.eye(this.group, 0xff3010, 1.4, 0, TOP[this.kind] * 0.55, 0, true);
    const inner = this.anim;
    this.anim = (dt, state, moving, t, dead) => {
      inner(dt, state, moving, t, dead);
      this.glowOp(ember, dead > 0 ? 0 : 0.12 + 0.06 * Math.sin(t * 2.5) + 0.25 * this.wind);
      if (this.kind === "spider") ember.position.y = state === 0 ? -0.3 : 0.4;
    };
  }

  // ---- kinds ----

  /** Quarryman's ghoul: a gaunt dead miner in rags, hunched, claws out, his helmet lamp still lit. */
  private ghoul(): Anim {
    const r = seeded(5);
    const skin = this.mat(0x9aa88c, { map: hide("flesh") });
    const boneM = this.mat(0xd8d0b0);
    const rag = this.mat(0x5e5644, { map: hide("rag"), side: THREE.DoubleSide });
    const rag2 = this.mat(0x4e4a3c, { map: hide("rag", 1, 2), side: THREE.DoubleSide });
    const boot = this.mat(0x3a2c20, { map: hide("leather") });
    const dark = this.mat(0x070504);
    const tin = this.mat(0x6a5a40, { map: hide("iron"), shine: 30 });
    const brass = this.mat(0xc09040, { shine: 60, e: 0x281800 });
    const nail = this.mat(0x2a2418);
    const lens = this.glowMat(0xfff4c0);
    if (!beamTex) beamTex = beam();
    const beamM = this.glowMat(0xffe0a0, 0.07, true, beamTex);

    const rig = this.piv(this.group, 0, 0.86, 0);
    const legs = [-1, 1].map((s) => {
      const hip = this.piv(rig, s * 0.11, 0, 0);
      this.bone(hip, [0, 0, 0], [0, -0.42, 0], 0.08, 0.06, rag2);
      const knee = this.piv(hip, 0, -0.42, 0);
      this.bone(knee, [0, 0.02, 0], [0, -0.38, 0], 0.045, 0.035, skin);
      this.box(knee, 0.11, 0.08, 0.22, boot, 0, -0.4, -0.04);
      // ragged trouser hem
      for (let k = 0; k < 3; k++) this.box(knee, 0.05, 0.1 + r() * 0.08, 0.01, rag2, (k - 1) * 0.05, -0.02, -0.06 + (k % 2) * 0.12).rotation.y = k;
      return { hip, knee };
    });
    this.box(rig, 0.34, 0.16, 0.21, rag2, 0, 0.02, 0);
    const tatters: THREE.Group[] = [];
    for (let i = 0; i < 6; i++) {
      const p = this.piv(rig, -0.16 + i * 0.065, -0.04, i % 2 ? -0.11 : 0.11);
      this.box(p, 0.055, 0.26 + r() * 0.14, 0.01, i % 3 ? rag : rag2, 0, -0.15, 0);
      tatters.push(p);
    }

    const torso = this.piv(rig, 0, 0.06, 0);
    // a starved ribcage under what's left of a smock
    this.ball(torso, 0.2, skin, 0, 0.32, 0, 0.85, 1.25, 0.62);
    for (let k = 0; k < 4; k++) {
      const rib = this.box(torso, 0.24 - k * 0.02, 0.022, 0.03, boneM, 0, 0.2 + k * 0.075, -0.115);
      rib.rotation.z = 0;
    }
    this.box(torso, 0.025, 0.3, 0.03, boneM, 0, 0.32, -0.12);
    for (let k = 0; k < 5; k++) this.box(torso, 0.04, 0.035, 0.04, boneM, 0, 0.14 + k * 0.09, 0.12);
    for (const s of [-1, 1]) {
      this.box(torso, 0.1, 0.44, 0.24, rag, s * 0.15, 0.3, 0.01);
      this.box(torso, 0.08, 0.06, 0.06, skin, s * 0.12, 0.54, 0.08); // shoulder blades
      this.box(torso, 0.06, 0.22 + r() * 0.1, 0.01, rag, s * 0.17, 0.04, -0.12).rotation.z = s * 0.15;
    }
    this.bone(torso, [0, 0.5, 0], [0, 0.62, -0.08], 0.045, 0.04, skin);

    const head = this.piv(torso, 0, 0.64, -0.1);
    this.ball(head, 0.12, skin, 0, 0.05, -0.02, 0.9, 1.1, 1.0);
    this.box(head, 0.2, 0.035, 0.06, skin, 0, 0.085, -0.1);
    for (const s of [-1, 1]) {
      this.ball(head, 0.036, dark, s * 0.045, 0.045, -0.11);
      this.ball(head, 0.022, skin, s * 0.075, 0.0, -0.1); // cheekbones
    }
    this.box(head, 0.025, 0.03, 0.02, dark, 0, 0.0, -0.13);
    this.box(head, 0.1, 0.022, 0.012, boneM, 0, -0.035, -0.115);
    const eyes = [-1, 1].map((s) => this.eye(head, 0xa0ff80, 0.13, s * 0.045, 0.047, -0.14, true));
    const jaw = this.piv(head, 0, -0.03, -0.03);
    this.box(jaw, 0.12, 0.035, 0.1, skin, 0, -0.03, -0.05);
    this.box(jaw, 0.09, 0.02, 0.012, boneM, 0, -0.01, -0.1);
    // miner's hat and its lamp
    const hat = this.put(head, new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 5, 0, TAU, 0, Math.PI / 2), tin), 0, 0.09, -0.02);
    hat.scale.set(1, 0.8, 1.05);
    this.cyl(head, 0.18, 0.18, 0.015, tin, 0, 0.09, -0.02, 12);
    const lamp = this.cyl(head, 0.035, 0.042, 0.06, brass, 0, 0.15, -0.15, 8);
    lamp.rotation.x = Math.PI / 2;
    const lensM = this.cyl(head, 0.03, 0.03, 0.01, lens, 0, 0.15, -0.185, 8);
    lensM.rotation.x = Math.PI / 2;
    const lampGlow = this.eye(head, 0xffd890, 0.24, 0, 0.15, -0.2, true);
    const bg = new THREE.ConeGeometry(0.4, 1.8, 10, 1, true);
    bg.rotateX(Math.PI / 2);
    bg.translate(0, 0, -0.9);
    const beamMesh = this.put(head, new THREE.Mesh(bg, beamM), 0, 0.15, -0.19);
    beamMesh.rotation.x = -0.35;

    const arms = [-1, 1].map((s) => {
      const sh = this.piv(torso, s * 0.2, 0.5, 0);
      this.ball(sh, 0.05, skin);
      this.bone(sh, [0, 0, 0], [0, -0.38, 0], 0.045, 0.035, skin);
      this.box(sh, 0.11, 0.16, 0.11, rag, 0, -0.08, 0).rotation.y = 0.4;
      const el = this.piv(sh, 0, -0.38, 0);
      this.ball(el, 0.04, skin);
      this.bone(el, [0, 0, 0], [0, -0.36, 0], 0.035, 0.03, skin);
      const hand = this.piv(el, 0, -0.37, 0);
      this.box(hand, 0.07, 0.08, 0.04, skin, 0, -0.03, 0);
      for (let f = 0; f < 3; f++) {
        const x = (f - 1) * 0.025;
        this.bone(hand, [x, -0.06, 0], [x * 1.4, -0.17, -0.04], 0.012, 0.008, skin, 4);
        this.bone(hand, [x * 1.4, -0.17, -0.04], [x * 1.5, -0.22, -0.08], 0.008, 0.002, nail, 4);
      }
      return { sh, el, hand };
    });

    let reach = 0;
    const id = this.group.id;
    return (dt, state, moving, t, dead) => {
      const mv = clamp01(moving / 2), ph = this.phase * 4.2;
      const alert = state === 1 || state === 2 ? 1 : 0;
      reach += (alert - reach) * Math.min(1, dt * 3);
      const w = this.wind, st = this.strike;
      legs.forEach(({ hip, knee }, i) => {
        const s = Math.sin(ph + i * Math.PI);
        hip.rotation.x = 0.15 + s * 0.55 * mv;
        knee.rotation.x = -0.3 - Math.max(0, Math.cos(ph + i * Math.PI)) * 0.8 * mv;
      });
      torso.rotation.x = -0.5 - 0.12 * mv + w * 0.3 - st * 0.45 + Math.sin(t * 1.4 + id) * 0.03;
      torso.rotation.z = Math.sin(ph) * 0.12 * mv + Math.sin(t * 0.6 + id) * 0.04;
      torso.rotation.y = Math.sin(ph) * 0.15 * mv;
      rig.position.y = 0.86 - Math.abs(Math.cos(ph)) * 0.05 * mv;
      const twitch = Math.sin(t * 0.53 + id) > 0.93 ? Math.sin(t * 31) * 0.25 : 0;
      head.rotation.set(0.45 + reach * 0.1 - w * 0.2, twitch, Math.sin(t * 0.7 + id) * 0.18 * (1 - reach) + 0.1);
      jaw.rotation.x = 0.2 + 0.25 * reach + 0.35 * w + Math.sin(t * 22) * 0.07 * reach;
      arms.forEach(({ sh, el, hand }, i) => {
        const s = i ? 1 : -1;
        const sway = -Math.sin(ph + i * Math.PI) * 0.45 * mv + Math.sin(t * 1.2 + i * 2) * 0.05;
        const base = 0.5 + reach * 1.15 + sway * (1 - reach * 0.7) + Math.sin(t * 2.1 + i) * 0.06 * reach;
        sh.rotation.x = base * (1 - w) + 3.1 * w - st * 1.3;
        sh.rotation.z = s * (0.12 + 0.18 * w + 0.1 * reach);
        el.rotation.x = 0.25 + 0.25 * reach + 0.4 * w;
        hand.rotation.x = 0.3 + 0.3 * w;
      });
      tatters.forEach((p, i) => { p.rotation.x = Math.sin(t * 2.3 + i) * 0.08 - mv * 0.25 * (i % 2 ? 1 : -1); });
      // collapse: knees buckle, then he pitches onto his face
      if (dead > 0) {
        const k1 = smooth(dead / 0.35), k2 = smooth((dead - 0.25) / 0.5);
        legs.forEach(({ hip, knee }) => { hip.rotation.x = 1.3 * k1; knee.rotation.x = -1.7 * k1; });
        rig.position.y = 0.86 - 0.42 * k1 - 0.3 * k2;
        rig.rotation.x = -1.3 * k2;
        arms.forEach(({ sh }) => { sh.rotation.x = 0.5 + 1.8 * k2; });
      } else { rig.rotation.x = 0; }
      const lit = dead > 0 ? (dead < 0.5 && Math.sin(dead * 60) > 0 ? 0.6 : Math.max(0, 1 - dead * 2)) : 0.9 + Math.sin(t * 9 + id) * 0.05;
      this.glowOp(lampGlow, lit);
      beamMesh.visible = lit > 0.05;
      beamM.opacity = 0.07 * lit * this.fade;
      lens.color.setScalar(0.3 + 0.7 * lit);
      for (const e of eyes) this.glowOp(e, (dead > 0 ? 1 - dead : 0.85 + 0.15 * reach));
    };
  }

  /** Greater horseshoe bat, grown huge in the dark: leathery scalloped wings, ears, fangs. */
  private bat(): Anim {
    const fur = this.mat(0x7a5c48, { map: hide("fur") });
    const skin = this.mat(0x4e342a, { map: hide("leather") });
    const memb = this.mat(0x6a3a2c, { map: hide("flesh"), side: THREE.DoubleSide, e: 0x0c0302 });
    const tooth = this.mat(0xf0e6cc);
    const mouthM = this.mat(0x4a0808, { e: 0x2a0000 });
    const body = this.piv(this.group, 0, 0, 0);
    this.ball(body, 0.12, fur, 0, 0, 0.03, 0.95, 0.85, 1.35);
    this.ball(body, 0.1, fur, 0, 0.02, -0.1, 1.1, 0.9, 1);
    const head = this.piv(body, 0, 0.05, -0.19);
    this.ball(head, 0.08, fur, 0, 0, 0, 1, 0.9, 1);
    this.ball(head, 0.045, skin, 0, -0.02, -0.07, 1, 0.8, 1);
    this.box(head, 0.06, 0.05, 0.012, skin, 0, 0.012, -0.11); // nose-leaf
    for (const s of [-1, 1]) {
      const ear = this.cone(head, 0.05, 0.17, skin, s * 0.055, 0.1, 0.01, 4);
      ear.rotation.set(-0.2, 0, -s * 0.4);
      const fang = this.cone(head, 0.011, 0.055, tooth, s * 0.022, -0.065, -0.095, 4);
      fang.rotation.x = Math.PI;
    }
    this.box(head, 0.06, 0.03, 0.05, mouthM, 0, -0.045, -0.07);
    const jaw = this.piv(head, 0, -0.045, -0.03);
    this.box(jaw, 0.06, 0.018, 0.08, skin, 0, -0.012, -0.04);
    for (const s of [-1, 1]) this.cone(jaw, 0.008, 0.035, tooth, s * 0.02, 0.01, -0.07, 4);
    const eyes = [-1, 1].map((s) => this.eye(head, 0xff2a10, 0.1, s * 0.04, 0.025, -0.075, true));
    // feet and tail membrane trail behind
    for (const s of [-1, 1]) this.bone(body, [s * 0.05, -0.03, 0.12], [s * 0.08, -0.07, 0.26], 0.014, 0.01, skin, 4);
    const tail = this.sheet(body, [[-0.08, 0.26, 0], [0.08, 0.26, 0], [0, 0.4, 0.3]], memb);
    tail.position.y = -0.06;

    const wings = [-1, 1].map((s) => {
      const sh = this.piv(body, s * 0.08, 0.04, -0.08);
      sh.scale.setScalar(1.3);
      this.bone(sh, [0, 0, 0], [s * 0.3, 0.02, -0.04], 0.022, 0.015, skin, 5);
      this.sheet(sh, [[0, -0.02, 0], [s * 0.3, -0.06, 0], [s * 0.3, 0.0, 0], [s * 0.2, 0.16, 0.35], [0.0, 0.26, 0.3]], memb);
      const wr = this.piv(sh, s * 0.3, 0.02, -0.04);
      this.ball(wr, 0.02, skin);
      const thumb = this.cone(wr, 0.01, 0.06, tooth, 0, 0.01, -0.03, 4);
      thumb.rotation.x = -Math.PI / 2;
      const tips: [number, number][] = [[s * 0.48, 0.02], [s * 0.42, 0.24], [s * 0.24, 0.34]];
      for (const [x, z] of tips) this.bone(wr, [0, 0, 0], [x, 0, z], 0.011, 0.005, skin, 4);
      this.sheet(wr, [[0, -0.02, 0], [tips[0][0], tips[0][1], 0], [tips[1][0], tips[1][1], 0.3], [tips[2][0], tips[2][1], 0.3], [0, 0.04, 0.3]], memb);
      return { sh, wr, s };
    });

    const id = this.group.id;
    return (_dt, state, _moving, t, dead) => {
      const alive = dead <= 0;
      const w = this.wind, st = this.strike;
      const f = state === 0 ? 13 : 17;
      const a = t * f + id;
      const flap = Math.sin(a) * (0.75 + 0.3 * w);
      for (const { sh, wr, s } of wings) {
        if (alive) {
          sh.rotation.set(0, s * (0.15 * Math.cos(a) - 0.4 * w), s * (flap + 0.15 + 0.5 * w));
          wr.rotation.set(0, s * (0.2 + 0.25 * Math.max(0, Math.cos(a))), s * Math.sin(a - 0.9) * 0.55);
        } else {
          const k = smooth(dead / 0.4);
          sh.rotation.set(0, s * 0.6 * k, s * (-0.4 * k + 0.3));
          wr.rotation.set(0, s * 1.6 * k, -s * 0.6 * k);
        }
      }
      if (alive) {
        body.position.set(0, -flap * 0.05 + Math.sin(t * 2.6 + id) * 0.03, -0.25 * st);
        body.rotation.set(0.75 + 0.2 * w - 1.2 * st, 0, Math.sin(t * 1.7 + id) * 0.12);
        head.rotation.x = -0.65 - 0.2 * w + 0.5 * st;
        jaw.rotation.x = 0.15 + 0.6 * w + 0.4 * st;
      } else {
        const k = clamp01(dead / 0.55);
        body.position.set(0, Math.max(-1.32, -1.5 * k * k), 0);
        body.rotation.set(0.2 * k, k * 4, Math.min(1, k) * 3.0);
      }
      for (const e of eyes) this.glowOp(e, alive ? 1 : 1 - dead * 1.5);
    };
  }

  /** Ashlar golem: a hulking construct of dressed oolite blocks, its mortar joints glowing like a kiln. */
  private golem(): Anim {
    const stone = this.mat(0xd4c8ac, { map: hide("oolite"), flat: true });
    const stone2 = this.mat(0xb4a68c, { map: hide("oolite"), flat: true });
    const stone3 = this.mat(0x948670, { map: hide("oolite"), flat: true });
    const fire = this.glowMat(0xff7a20);
    const fire2 = this.glowMat(0xffb040);
    const frust = (p: THREE.Object3D, rt: number, rb: number, h: number, m: THREE.Material, x: number, y: number, z: number, sz = 1) => {
      const o = this.cyl(p, rt, rb, h, m, x, y, z, 4);
      o.rotation.y = Math.PI / 4;
      o.scale.z = sz;
      return o;
    };
    const hips = this.piv(this.group, 0, 0.95, 0);
    const legs = [-1, 1].map((s) => {
      const hip = this.piv(hips, s * 0.3, -0.05, 0);
      this.box(hip, 0.42, 0.42, 0.46, s < 0 ? stone : stone2, 0, -0.22, 0);
      this.box(hip, 0.3, 0.06, 0.32, fire, 0, -0.45, 0);
      const knee = this.piv(hip, 0, -0.46, 0);
      this.box(knee, 0.48, 0.34, 0.5, stone3, 0, -0.17, 0);
      this.box(knee, 0.56, 0.14, 0.7, stone, 0, -0.42, -0.06);
      return { hip, knee };
    });
    this.box(hips, 0.95, 0.28, 0.6, stone3, 0, 0.0, 0);
    const torso = this.piv(hips, 0, 0.14, 0);
    this.box(torso, 0.6, 0.3, 0.44, stone2, 0, 0.15, 0);
    const core = this.box(torso, 0.52, 0.12, 0.38, fire, 0, 0.34, 0);
    frust(torso, 0.98, 0.62, 0.72, stone, 0, 0.76, 0.04, 0.8);
    this.box(torso, 0.8, 0.5, 0.4, stone3, 0, 0.98, 0.32).rotation.x = 0.35;
    // a chest plate with a crack of fire across it, and the mason's mark
    this.box(torso, 0.62, 0.42, 0.06, stone2, 0, 0.78, -0.5).rotation.x = -0.2;
    for (const [x, y, rz, l] of [[-0.12, 0.88, 0.9, 0.18], [0.0, 0.8, -0.5, 0.16], [0.1, 0.7, 1.0, 0.16], [0.17, 0.6, -0.3, 0.1]] as [number, number, number, number][]) {
      const c = this.box(torso, l, 0.045, 0.03, fire, x, y, -0.54);
      c.rotation.set(-0.18, 0, rz);
    }
    const heart = this.eye(torso, 0xff7a20, 0.9, 0, 0.36, -0.32, true);
    // the head sits low between the shoulders, with a brow like a lintel and a slit of fire
    const head = this.piv(torso, 0, 1.22, -0.26);
    this.box(head, 0.4, 0.32, 0.38, stone3, 0, 0, 0);
    this.box(head, 0.5, 0.09, 0.22, stone, 0, 0.13, -0.12);
    this.box(head, 0.3, 0.045, 0.02, fire2, 0, 0.01, -0.195);
    const eyes = [-1, 1].map((s) => this.eye(head, 0xff9a30, 0.24, s * 0.1, 0.01, -0.22, true));
    const arms = [-1, 1].map((s) => {
      const sh = this.piv(torso, s * 0.8, 1.02, 0.02);
      const pad = this.box(sh, 0.58, 0.46, 0.6, stone2, s * 0.06, 0.12, 0);
      pad.rotation.z = -s * 0.12;
      const cap = this.box(sh, 0.34, 0.2, 0.4, stone3, s * 0.1, 0.42, 0.04);
      cap.rotation.set(0.1, s * 0.3, -s * 0.25);
      this.box(sh, 0.04, 0.3, 0.03, fire, s * 0.06, 0.12, -0.31).rotation.z = s * 0.3;
      this.box(sh, 0.34, 0.55, 0.36, stone, 0, -0.34, 0);
      this.box(sh, 0.24, 0.06, 0.26, fire, 0, -0.64, 0);
      const el = this.piv(sh, 0, -0.66, 0);
      frust(el, 0.24, 0.19, 0.56, stone3, 0, -0.3, 0);
      this.box(el, 0.2, 0.26, 0.2, stone2, s * 0.14, -0.3, 0.04).rotation.set(0.2, 0.4, s * 0.15);
      this.box(el, 0.3, 0.05, 0.3, fire, 0, -0.6, 0);
      this.box(el, 0.48, 0.42, 0.5, stone, 0, -0.82, -0.02);
      this.box(el, 0.5, 0.1, 0.16, stone2, 0, -0.95, -0.2);
      return { sh, el, s };
    });
    const fall = this.shatter(7);
    const id = this.group.id;
    return (_dt, _state, moving, t, dead) => {
      if (dead > 0) {
        fall(dead);
        core.visible = false;
        const k = clamp01(1 - dead * 1.5);
        fire.color.setRGB(k, k * 0.48, k * 0.12);
        fire2.color.copy(fire.color);
        this.glowOp(heart, k);
        for (const e of eyes) this.glowOp(e, k);
        return;
      }
      const mv = clamp01(moving / 1.5), ph = this.phase * 2.4;
      const w = this.wind, st = this.strike;
      legs.forEach(({ hip, knee }, i) => {
        const s = Math.sin(ph + i * Math.PI);
        hip.rotation.x = s * 0.35 * mv;
        knee.rotation.x = -Math.max(0, Math.cos(ph + i * Math.PI)) * 0.4 * mv;
      });
      hips.position.y = 0.95 - Math.abs(Math.sin(ph)) * 0.07 * mv - w * 0.08;
      hips.rotation.z = Math.sin(ph) * 0.05 * mv;
      torso.rotation.set(-0.1 * mv + w * 0.18 - st * 0.4, Math.sin(ph) * 0.1 * mv, Math.sin(ph) * 0.04 * mv);
      head.rotation.y = Math.sin(t * 0.4 + id) * 0.25 * (1 - mv);
      for (const { sh, el, s } of arms) {
        const sway = Math.sin(ph + (s > 0 ? Math.PI : 0)) * 0.35 * mv;
        sh.rotation.x = (0.1 + sway) * (1 - w) + 2.4 * w - st * 2.0;
        sh.rotation.z = s * (0.08 + 0.1 * w);
        el.rotation.x = 0.25 + 0.5 * w;
      }
      const pulse = 0.75 + 0.25 * Math.sin(t * 2.2 + id) + 0.4 * w;
      fire.color.setRGB(Math.min(1, pulse), 0.48 * pulse, 0.12 * pulse);
      fire2.color.setRGB(1, Math.min(1, 0.7 * pulse), 0.25 * pulse);
      this.glowOp(heart, 0.35 + 0.3 * pulse);
      heart.scale.setScalar(0.8 + 0.5 * w);
      for (const e of eyes) { this.glowOp(e, 0.8 + 0.2 * pulse); e.scale.setScalar(0.22 + 0.12 * w); }
    };
  }

  /** Grout blob: a glistening ochre slime with the bones and coin of earlier victims hanging inside. */
  private blob(): Anim {
    const r = seeded(13);
    const goo = this.mat(0xb88428, { shine: 90, spec: 0xfff0c0, e: 0x120800, opacity: 0.42 });
    const goo2 = this.mat(0x9a6818, { shine: 60, spec: 0xffe0a0, e: 0x1a0c00, opacity: 0.8 });
    const boneM = this.mat(0xf0e8d8, { e: 0x2a2620 });
    const dark = this.mat(0x1a1008);
    const rust = this.mat(0x7a4020, { map: hide("iron") });
    const gold = this.mat(0xe0b030, { shine: 80, e: 0x302000 });
    const white = this.mat(0xf0ece0, { shine: 80, e: 0x202018 });
    const lump = this.piv(this.group, 0, 0, 0);
    this.cyl(lump, 0.6, 0.66, 0.025, goo2, 0, 0.012, 0, 14);
    // the things inside, drifting
    const inner = this.piv(lump, 0, 0.34, 0);
    const skull = this.piv(inner, 0.06, 0.04, 0.02);
    skull.rotation.set(0.2, 0.3, 0.2);
    this.ball(skull, 0.11, boneM, 0, 0, 0, 0.9, 1, 1.1);
    for (const s of [-1, 1]) this.ball(skull, 0.03, dark, s * 0.04, 0.01, -0.1);
    this.box(skull, 0.08, 0.04, 0.07, boneM, 0, -0.07, -0.04);
    const rib = this.put(inner, new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.012, 4, 10, Math.PI), boneM), -0.12, -0.12, 0.05);
    rib.rotation.set(0.4, 0.3, 0.9);
    this.bone(inner, [-0.25, 0.05, 0.1], [0.05, -0.2, 0.18], 0.018, 0.015, boneM, 5);
    const pick = this.box(inner, 0.34, 0.035, 0.035, rust, -0.05, 0.15, 0.18);
    pick.rotation.set(0.3, 0.5, 0.6);
    for (let i = 0; i < 4; i++) {
      const c = this.cyl(inner, 0.03, 0.03, 0.008, gold, (r() - 0.5) * 0.4, -0.15 + r() * 0.3, (r() - 0.5) * 0.4, 8);
      c.rotation.set(r() * 3, 0, r() * 3);
    }
    const eyeball = this.ball(inner, 0.045, white, -0.14, 0.12, -0.18);
    this.cyl(eyeball, 0.022, 0.022, 0.01, dark, 0, 0, -0.04, 8).rotation.x = Math.PI / 2;
    const bubbles = [0, 1, 2, 3, 4].map((i) => this.ball(lump, 0.02 + r() * 0.02, goo2, (r() - 0.5) * 0.5, 0.1 + i * 0.12, (r() - 0.5) * 0.4, 1, 1, 1, 6, 4));
    // the slime itself goes on after, so you see what's in it
    this.lathe(lump, [[0, 0.02], [0.5, 0.02], [0.56, 0.08], [0.52, 0.22], [0.44, 0.42], [0.32, 0.6], [0.17, 0.74], [0, 0.78]], goo, 14);
    const lobes = [[0.3, 0.18, 0.18, 0.24], [-0.28, 0.2, 0.1, 0.22], [0.05, 0.22, 0.32, 0.2], [-0.1, 0.55, -0.05, 0.16]].map(([x, y, z, rad]) => this.ball(lump, rad, goo, x, y, z));
    const drips = [0, 1, 2].map((i) => this.ball(lump, 0.05, goo2, Math.cos(i * 2.1) * 0.5, 0.12, Math.sin(i * 2.1) * 0.5, 1, 1.6, 1, 6, 5));
    const glowS = this.eye(lump, 0xffb040, 0.9, 0, 0.3, 0.15, true);
    const id = this.group.id;
    return (_dt, _state, moving, t, dead) => {
      const mv = clamp01(moving / 1.5);
      const w = this.wind, st = this.strike;
      const hop = Math.abs(Math.sin(this.phase * Math.PI / 0.7));
      let sy = 1 + Math.sin(t * 2 + id) * 0.04 + (hop - 0.5) * 0.24 * mv + 0.35 * w - 0.3 * st;
      let sx = 1 - Math.sin(t * 2 + id) * 0.03 - (hop - 0.5) * 0.14 * mv - 0.15 * w + 0.28 * st;
      let y = hop * 0.1 * mv;
      inner.rotation.set(Math.sin(t * 0.4 + id) * 0.3, t * 0.25, Math.sin(t * 0.3) * 0.2);
      inner.position.y = 0.34 + Math.sin(t * 0.9) * 0.03;
      if (dead > 0) {
        const k = smooth(dead / 0.8);
        sy = sy * (1 - k) + 0.14 * k;
        sx = sx * (1 - k) + 1.7 * k;
        y = 0;
        inner.position.y = 0.34 - 0.27 * k;
      }
      lump.scale.set(sx, sy, sx);
      lump.position.set(0, y, -0.28 * st);
      lump.rotation.x = 0.15 * w - 0.25 * st;
      inner.scale.set(1 / sx, 1 / sy, 1 / sx);
      lobes.forEach((l, i) => l.scale.setScalar(1 + Math.sin(t * 3 + i * 1.7) * 0.08));
      bubbles.forEach((b, i) => { b.position.y = 0.05 + ((t * 0.12 + i * 0.2) % 0.7); });
      drips.forEach((d, i) => { d.scale.y = 1.3 + Math.sin(t * 1.5 + i) * 0.4; });
      this.glowOp(glowS, (0.16 + 0.05 * Math.sin(t * 3 + id) + 0.25 * w) * (dead > 0 ? Math.max(0, 1 - dead) : 1));
    };
  }

  /**
   * The Grout: the boss. A hill of wet grey mortar and rubble that heaves itself along on a skirt of
   * slurry, with knuckle-dragging arms ending in fists of masonry, rebar through its back, a cluster
   * of yellow eyes and a maw full of broken stone that glows from deep inside.
   */
  private grout(): Anim {
    const r = seeded(31);
    const mort = this.mat(0xd0ccc2, { map: hide("mortar", 3, 2), shine: 24, spec: 0x3a3a3a, e: 0x16140f });
    const mort2 = this.mat(0xaaa69c, { map: hide("mortar", 2, 2), shine: 20, spec: 0x2a2a2a, e: 0x100e0a });
    const stone = this.mat(0xd0bf94, { map: hide("oolite"), flat: true });
    const brick = this.mat(0x9a5238, { flat: true });
    const rebar = this.mat(0x7a4228, { map: hide("iron") });
    const timber = this.mat(0x6e5032, { map: hide("bark") });
    const dark = this.mat(0x0a0604);
    const shard = this.mat(0xb8b0a0, { flat: true });
    const crackM = this.glowMat(0xffd040);
    const base = this.piv(this.group, 0, 0, 0);
    const skirt = this.lathe(base, [[0, 0.01], [1.8, 0.01], [1.7, 0.1], [1.45, 0.24], [1.1, 0.5], [0.7, 0.75], [0, 0.85]], mort2, 16);
    const rubble = (p: THREE.Object3D, n: number, cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, size: number, avoidFront = false) => {
      for (let i = 0; i < n; i++) {
        let d: THREE.Vector3;
        do d = new THREE.Vector3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1).normalize();
        while (avoidFront && d.z < -0.4 && d.y < 0.5);
        const x = cx + d.x * rx * 0.95, y = cy + d.y * ry * 0.95, z = cz + d.z * rz * 0.95;
        const k = r();
        if (k < 0.55) this.rock(p, size * (0.6 + r() * 0.6), stone, x, y, z, r);
        else if (k < 0.85) { const b = this.box(p, size * 1.4, size * 0.7, size * 0.7, brick, x, y, z); b.rotation.set(r() * 3, r() * 3, r() * 3); }
        else this.rock(p, size * 0.7, shard, x, y, z, r);
      }
    };
    rubble(base, 7, 0, 0.3, 0, 1.4, 0.3, 1.4, 0.18);
    const body = this.piv(base, 0, 0.7, 0);
    this.ball(body, 1.0, mort, 0, 0.45, 0.1, 1.15, 0.85, 1.05);
    const chest = this.piv(body, 0, 0.85, 0.1);
    chest.rotation.x = -0.25;
    this.ball(chest, 0.95, mort, 0, 0.55, 0, 1.22, 0.95, 0.92, 12, 9);
    this.ball(chest, 0.7, mort2, 0, 1.0, 0.4, 1.1, 0.8, 0.9);
    for (const s of [-1, 1]) this.ball(chest, 0.55, mort, s * 1.0, 0.9, 0.05);
    rubble(chest, 14, 0, 0.6, 0.05, 1.2, 0.95, 0.95, 0.17, true);
    // rebar and an old prop through its back
    for (let i = 0; i < 6; i++) {
      const x = (r() - 0.5) * 1.4, y = 0.7 + r() * 0.6;
      this.bone(chest, [x, y, 0.3], [x * 1.4 + (r() - 0.5) * 0.4, y + 0.5 + r() * 0.6, 1.0 + r() * 0.4], 0.03, 0.025, rebar, 4);
    }
    const prop = this.box(chest, 0.14, 0.14, 1.6, timber, -0.85, 1.35, 0.2);
    prop.rotation.set(0.7, 0.4, 0.2);
    // the face: a heavy brow, a cluster of eyes, and the maw
    const head = this.piv(chest, 0, 0.5, -0.62);
    this.ball(head, 0.55, mort, 0, 0.12, -0.08, 1.15, 0.8, 0.9);
    this.ball(head, 0.4, dark, 0, -0.12, -0.3, 1.2, 0.72, 0.6);
    const gullet = this.eye(head, 0xffc030, 1.2, 0, -0.12, -0.38, true);
    const gulletCore = this.eye(head, 0xfff0a0, 0.45, 0, -0.12, -0.4, true);
    for (let i = 0; i < 8; i++) {
      const x = -0.36 + i * 0.103;
      const t1 = this.cone(head, 0.05, 0.16 + r() * 0.1, shard, x, 0.0 - x * x * 0.4, -0.58 + x * x * 0.7, 4);
      t1.rotation.set(Math.PI + 0.25, 0, (r() - 0.5) * 0.4);
    }
    const jaw = this.piv(head, 0, -0.22, -0.2);
    this.ball(jaw, 0.42, mort2, 0, -0.1, -0.22, 1.15, 0.42, 0.9);
    for (let i = 0; i < 7; i++) {
      const x = -0.3 + i * 0.1;
      const t2 = this.cone(jaw, 0.045, 0.14 + r() * 0.08, shard, x, 0.02, -0.52 + x * x * 0.8, 4);
      t2.rotation.set(-0.2, 0, (r() - 0.5) * 0.4);
    }
    const eyeSpots: [number, number, number, number][] = [[-0.3, 0.28, -0.5, 0.075], [0.3, 0.3, -0.48, 0.08], [-0.1, 0.4, -0.55, 0.055], [0.14, 0.44, -0.52, 0.05], [0.0, 0.25, -0.6, 0.045], [-0.42, 0.42, -0.36, 0.04]];
    const eyes = eyeSpots.map(([x, y, z, s]) => {
      this.ball(head, s * 1.5, dark, x, y, z + 0.03, 1, 1, 0.6, 8, 6);
      this.ball(head, s, crackM, x, y, z - 0.01, 1, 1, 1, 8, 6);
      return this.eye(head, 0xffe040, s * 6, x, y, z - 0.06, true);
    });
    // glowing seams across the chest
    for (let i = 0; i < 7; i++) {
      const a = (r() - 0.5) * 1.6, y = 0.3 + r() * 0.7;
      const c = this.box(chest, 0.04, 0.3 + r() * 0.3, 0.04, crackM, Math.sin(a) * 1.05, y, -Math.cos(a) * 0.82);
      c.rotation.set(0.3, -a, (r() - 0.5) * 1.5);
    }
    const arms = [-1, 1].map((s) => {
      const sh = this.piv(chest, s * 1.15, 0.8, 0);
      this.bone(sh, [0, 0, 0], [s * 0.15, -0.95, 0], 0.42, 0.32, mort, 8);
      rubble(sh, 4, s * 0.08, -0.45, 0, 0.36, 0.4, 0.36, 0.13);
      const el = this.piv(sh, s * 0.15, -0.95, 0);
      this.ball(el, 0.36, mort2);
      this.bone(el, [0, 0, 0], [0, -0.8, -0.1], 0.32, 0.44, mort, 8);
      const fist = this.piv(el, 0, -0.95, -0.12);
      this.ball(fist, 0.42, mort, 0, 0, 0, 1, 0.85, 1);
      this.rock(fist, 0.26, stone, s * 0.2, -0.15, -0.25, r);
      this.rock(fist, 0.22, stone, -s * 0.15, -0.2, -0.28, r);
      this.box(fist, 0.36, 0.18, 0.18, brick, 0, 0.05, -0.38).rotation.set(0.2, 0.3, 0.1);
      this.rock(fist, 0.2, shard, s * 0.28, 0.1, 0.1, r);
      const drip = this.ball(el, 0.08, mort2, s * 0.15, -0.3, 0.25, 1, 2.2, 1, 6, 5);
      return { sh, el, fist, drip, s };
    });
    const id = this.group.id;
    let rear = 0;
    return (dt, state, moving, t, dead) => {
      const mv = clamp01(moving / 1.5), ph = this.phase * 2.2;
      const st = this.strike;
      rear += (this.wind - rear) * Math.min(1, dt * 3);
      const breathe = Math.sin(t * 1.3 + id);
      const alert = state === 1 || state === 2 ? 1 : 0;
      skirt.scale.set(1 + Math.sin(ph * 2) * 0.04 * mv, 1 + breathe * 0.04, 1 + Math.cos(ph * 2) * 0.04 * mv);
      body.position.set(0, 0.7 + rear * 0.35, -0.5 * st);
      body.rotation.set(rear * 0.12 - st * 0.25, Math.sin(ph) * 0.1 * mv, Math.sin(ph) * 0.08 * mv);
      chest.rotation.x = -0.25 + rear * 0.45 - st * 0.55 + breathe * 0.03;
      chest.scale.setScalar(1 + breathe * 0.025);
      head.rotation.x = -rear * 0.25 + st * 0.2;
      jaw.rotation.x = 0.12 + 0.1 * Math.max(0, Math.sin(t * 0.9 + id)) + 0.25 * alert + 0.5 * rear - 0.4 * st;
      for (const { sh, el, drip, s } of arms) {
        const sway = Math.sin(ph + (s > 0 ? Math.PI : 0)) * 0.35 * mv;
        sh.rotation.x = (0.35 + sway) * (1 - rear) + 2.6 * rear - st * 1.8;
        sh.rotation.z = s * (0.12 + 0.25 * rear) + Math.sin(t * 0.8 + s) * 0.03;
        el.rotation.x = 0.35 * (1 - rear) + 0.6 * rear;
        drip.scale.y = 1.8 + Math.sin(t * 1.2 + s) * 0.6;
      }
      let glow = 0.75 + 0.15 * Math.sin(t * 2 + id) + 0.35 * rear;
      if (dead > 0) {
        const k = smooth(dead / 2);
        glow *= Math.max(0, 1 - dead * 0.7);
        body.position.y = 0.7 - 0.9 * k;
        body.rotation.x = -0.4 * k;
        chest.rotation.x = -0.25 - 0.7 * k;
        skirt.scale.set(1 + 0.25 * k, 1 - 0.6 * k, 1 + 0.25 * k);
        for (const { sh, el } of arms) { sh.rotation.x = 0.35 + 0.6 * k; el.rotation.x = 0.35 - 0.3 * k; }
        jaw.rotation.x = 0.5 * k;
      }
      crackM.color.setRGB(Math.min(1, glow), Math.min(1, glow) * 0.82, 0.25 * glow);
      this.glowOp(gullet, 0.55 * glow);
      gullet.scale.setScalar(1.0 + 0.6 * rear);
      this.glowOp(gulletCore, 0.8 * glow);
      for (const [i, e] of eyes.entries()) this.glowOp(e, glow * (0.8 + 0.2 * Math.sin(t * 3 + i * 1.3)));
    };
  }

  /** Pit rat: a mangy brute the size of a terrier, hunched, with yellow incisors and a long bare tail. */
  private rat(): Anim {
    const fur = this.mat(0x806a56, { map: hide("fur") });
    const fur2 = this.mat(0x5a4a3c, { map: hide("fur", 2, 2) });
    const pink = this.mat(0xc08a80, { map: hide("flesh") });
    const tooth = this.mat(0xe8c860, { shine: 40 });
    const black = this.mat(0x080404, { shine: 100, spec: 0xffffff });
    const rig = this.piv(this.group, 0, 0, 0);
    const body = this.piv(rig, 0, 0.24, 0);
    this.ball(body, 0.17, fur, 0, 0.02, 0.1, 1, 0.95, 1.15);
    this.ball(body, 0.14, fur, 0, 0, -0.1, 0.95, 0.9, 1.2);
    this.ball(body, 0.12, fur2, 0, 0.07, 0, 0.85, 0.8, 1.6);
    for (let i = 0; i < 6; i++) {
      const spike = this.cone(body, 0.025, 0.09, fur2, (i % 2 ? 0.02 : -0.02), 0.17 - Math.abs(i - 2.5) * 0.008, -0.14 + i * 0.06, 4);
      spike.rotation.x = 0.9;
    }
    const head = this.piv(body, 0, 0.03, -0.25);
    this.ball(head, 0.085, fur, 0, 0, 0, 0.9, 0.85, 1.1);
    const snout = this.cone(head, 0.06, 0.16, fur2, 0, -0.015, -0.11, 6);
    snout.rotation.x = -Math.PI / 2;
    this.ball(head, 0.02, pink, 0, -0.012, -0.19);
    this.box(head, 0.03, 0.045, 0.012, tooth, 0, -0.055, -0.165);
    const jaw = this.piv(head, 0, -0.045, -0.05);
    this.box(jaw, 0.05, 0.02, 0.1, fur2, 0, -0.01, -0.05);
    this.box(jaw, 0.025, 0.03, 0.01, tooth, 0, 0.005, -0.1);
    for (const s of [-1, 1]) {
      const ear = this.cyl(head, 0.045, 0.045, 0.012, pink, s * 0.055, 0.075, 0.02, 8);
      ear.rotation.set(Math.PI / 2 - 0.3, 0, -s * 0.5);
      this.ball(head, 0.02, black, s * 0.045, 0.025, -0.06);
      for (const a of [-0.15, 0.15]) {
        const wh = this.box(head, 0.16, 0.003, 0.003, fur2, s * 0.08, -0.02 + a * 0.1, -0.15);
        wh.rotation.set(0, s * (0.3 + a), a);
      }
    }
    const eyes = [-1, 1].map((s) => this.eye(head, 0xff2a10, 0.11, s * 0.047, 0.027, -0.07, true));
    const leg = (x: number, z: number, hind: boolean) => {
      const p = this.piv(body, x, hind ? -0.02 : -0.06, z);
      if (hind) {
        this.ball(p, 0.075, fur, 0, 0, 0, 0.8, 1, 1.1);
        this.bone(p, [0, 0, 0], [0, -0.14, 0.05], 0.035, 0.025, fur2, 5);
        this.box(p, 0.045, 0.025, 0.13, pink, 0, -0.205, 0.02);
      } else {
        this.bone(p, [0, 0, 0], [0, -0.16, -0.02], 0.03, 0.02, fur2, 5);
        this.box(p, 0.04, 0.02, 0.06, pink, 0, -0.17, -0.04);
      }
      return p;
    };
    const legs = [leg(-0.08, -0.15, false), leg(0.08, -0.15, false), leg(-0.1, 0.13, true), leg(0.1, 0.13, true)];
    const tail: THREE.Group[] = [];
    let at: THREE.Object3D = body, z0 = 0.27, y0 = 0.0;
    for (let i = 0; i < 4; i++) {
      const p = this.piv(at, 0, y0, z0);
      this.bone(p, [0, 0, 0], [0, 0, 0.2], 0.026 - i * 0.005, 0.021 - i * 0.005, pink, 5);
      tail.push(p);
      at = p; z0 = 0.2; y0 = 0;
    }
    const id = this.group.id;
    return (_dt, state, moving, t, dead) => {
      const mv = clamp01(moving / 2.5), ph = this.phase * 6.5;
      const w = this.wind, st = this.strike;
      const alive = dead <= 0;
      legs.forEach((l, i) => { l.rotation.x = Math.sin(ph + (i < 2 ? 0 : Math.PI * 0.8)) * 0.9 * mv; });
      body.position.y = 0.24 + Math.abs(Math.sin(ph)) * 0.035 * mv + 0.06 * w;
      body.rotation.x = Math.sin(ph) * 0.12 * mv + 0.45 * w - 0.25 * st;
      rig.position.z = -0.22 * st;
      const sniff = state === 0 ? Math.sin(t * 14 + id) * 0.05 : 0;
      head.rotation.set(sniff - 0.35 * w + 0.15 * st, Math.sin(t * 0.8 + id) * 0.3 * (1 - mv) * (state === 0 ? 1 : 0.3), 0);
      jaw.rotation.x = 0.1 + 0.6 * w + Math.max(0, Math.sin(t * 9)) * 0.1 * (state === 1 ? 1 : 0);
      tail.forEach((p, i) => { p.rotation.set(-0.12 + (i === 0 ? -0.15 : 0.05), Math.sin(t * 4 + i * 0.9 + id) * 0.3 + Math.sin(ph * 0.5 + i) * 0.25 * mv, 0); });
      if (!alive) {
        const k = smooth(dead / 0.35);
        rig.rotation.z = 1.5 * k;
        rig.position.y = -0.06 * k;
        legs.forEach((l, i) => { l.rotation.x = Math.sin(dead * 30 + i) * 0.5 * Math.max(0, 1 - dead) + 0.4; });
      } else { rig.rotation.z = 0; rig.position.y = 0; }
      for (const e of eyes) this.glowOp(e, alive ? 1 : 1 - dead * 2);
    };
  }

  /** Headless: a hulking hunched brute with nothing above the shoulders but a raw stump; an axe in one fist, a lantern in the other. */
  private headless(): Anim {
    const skin = this.mat(0xbca090, { map: hide("flesh") });
    const leather = this.mat(0x7a5638, { map: hide("leather") });
    const cloth = this.mat(0x4a443c, { map: hide("rag"), side: THREE.DoubleSide });
    const iron = this.mat(0x7a7a80, { map: hide("iron"), shine: 50, spec: 0x666666 });
    const wood = this.mat(0x7a5634, { map: hide("bark", 1, 3) });
    // the raw stump is the secret blood setting (gore.ts); otherwise it's a dark, burnt-looking collar
    const gore = goreOn() ? this.mat(0x8a1010, { e: 0x3a0404, shine: 70, spec: 0x664444 }) : this.mat(0x2a2420, { e: 0x0a0806 });
    const boneM = this.mat(0xe8dcc0);
    const stitch = this.mat(0x1a1008);
    const flame = this.glowMat(0xffd070);

    const rig = this.piv(this.group, 0, 0.92, 0);
    const legs = [-1, 1].map((s) => {
      const hip = this.piv(rig, s * 0.17, 0, 0);
      this.bone(hip, [0, 0, 0], [0, -0.44, -0.02], 0.12, 0.09, cloth);
      const knee = this.piv(hip, 0, -0.44, -0.02);
      this.bone(knee, [0, 0, 0], [0, -0.4, 0], 0.09, 0.08, leather);
      this.box(knee, 0.18, 0.12, 0.3, leather, 0, -0.42, -0.06);
      return { hip, knee };
    });
    this.ball(rig, 0.3, cloth, 0, 0.04, 0, 1.15, 0.7, 0.9);
    const torso = this.piv(rig, 0, 0.1, 0);
    this.ball(torso, 0.36, skin, 0, 0.28, -0.04, 1.05, 1, 0.95);
    this.ball(torso, 0.38, skin, 0, 0.62, 0, 1.3, 0.85, 0.9);
    for (const s of [-1, 1]) this.ball(torso, 0.2, skin, s * 0.34, 0.8, 0.02, 1, 0.9, 1);
    // leather apron and straps
    const apron = this.box(torso, 0.5, 0.66, 0.025, leather, 0, 0.24, -0.37);
    apron.rotation.x = 0.12;
    for (const s of [-1, 1]) {
      const strap = this.box(torso, 0.05, 0.6, 0.02, leather, s * 0.16, 0.66, -0.32);
      strap.rotation.set(-0.35, 0, s * 0.15);
    }
    this.cyl(torso, 0.4, 0.42, 0.08, leather, 0, 0.0, -0.02, 10);
    // a long stitched scar
    this.box(torso, 0.012, 0.3, 0.012, stitch, 0.12, 0.65, -0.335).rotation.z = 0.4;
    for (let i = 0; i < 6; i++) this.box(torso, 0.05, 0.008, 0.012, stitch, 0.12 - 0.0216 * (i - 2.5) * 2.1, 0.65 + 0.046 * (i - 2.5) * 1.15, -0.336).rotation.z = 0.4;
    // the stump: a collapsed hood around a raw neck, a vertebra poking out, blood down the chest
    const stump = this.piv(torso, 0, 0.92, -0.06);
    this.cyl(stump, 0.18, 0.34, 0.18, cloth, 0, -0.04, 0, 9, true);
    this.cyl(stump, 0.13, 0.17, 0.16, skin, 0, 0.02, 0, 8);
    this.cyl(stump, 0.12, 0.12, 0.02, gore, 0, 0.1, 0, 8);
    this.cyl(stump, 0.028, 0.035, 0.1, boneM, 0, 0.14, 0.02, 6);
    for (let i = 0; i < 5; i++) {
      const a = i * 1.3;
      const flap = this.cone(stump, 0.035, 0.07, skin, Math.cos(a) * 0.11, 0.12, Math.sin(a) * 0.11, 4);
      flap.rotation.set(Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4);
    }
    for (const [x, l] of [[-0.05, 0.25], [0.04, 0.4], [0.09, 0.18]]) this.box(torso, 0.025, l, 0.01, gore, x, 0.92 - l / 2, -0.33);
    const stumpGlow = this.eye(stump, 0xff2010, 0.18, 0, 0.12, 0, true);

    const arms = [-1, 1].map((s) => {
      const sh = this.piv(torso, s * 0.5, 0.76, 0.02);
      this.ball(sh, 0.15, skin);
      this.bone(sh, [0, 0, 0], [0, -0.44, 0], 0.11, 0.09, skin);
      const el = this.piv(sh, 0, -0.44, 0);
      this.bone(el, [0, 0, 0], [0, -0.4, 0], 0.09, 0.08, skin);
      this.cyl(el, 0.1, 0.095, 0.18, leather, 0, -0.26, 0, 7);
      const hand = this.piv(el, 0, -0.44, 0);
      this.ball(hand, 0.085, skin, 0, 0, 0, 1, 1.1, 1);
      return { sh, el, hand };
    });
    // the axe in his right fist: haft along its local +y, the bearded blade out front
    const axe = this.piv(arms[1].hand, 0, 0, 0);
    axe.rotation.x = -Math.PI / 2 + 0.5;
    this.bone(axe, [0, -0.2, 0], [0, 1.05, 0], 0.028, 0.024, wood, 6);
    const bl = new THREE.Shape();
    bl.moveTo(0, 0.82); bl.lineTo(0.12, 0.86);
    bl.quadraticCurveTo(0.24, 0.8, 0.3, 0.66);
    bl.quadraticCurveTo(0.44, 0.88, 0.36, 1.18);
    bl.quadraticCurveTo(0.24, 1.08, 0.12, 1.04);
    bl.lineTo(0, 1.06); bl.lineTo(-0.1, 1.0); bl.lineTo(-0.16, 0.95); bl.lineTo(-0.1, 0.9); bl.lineTo(0, 0.82);
    const bg = new THREE.ExtrudeGeometry(bl, { depth: 0.035, bevelEnabled: false, curveSegments: 4 });
    bg.translate(0, 0, -0.0175);
    bg.rotateY(Math.PI / 2);
    this.put(axe, new THREE.Mesh(bg, iron), 0, 0, 0);
    // the lantern in his left, hanging from a short chain
    const lantern = this.piv(arms[0].hand, 0, -0.06, 0);
    this.bone(lantern, [0, 0, 0], [0, -0.1, 0], 0.008, 0.008, iron, 4);
    this.cone(lantern, 0.08, 0.07, iron, 0, -0.13, 0, 6);
    this.cyl(lantern, 0.08, 0.08, 0.02, iron, 0, -0.33, 0, 6);
    for (let i = 0; i < 4; i++) this.box(lantern, 0.012, 0.18, 0.012, iron, Math.cos(i * 1.57 + 0.78) * 0.07, -0.24, Math.sin(i * 1.57 + 0.78) * 0.07);
    this.ball(lantern, 0.04, flame, 0, -0.24, 0, 1, 1.4, 1, 6, 5);
    const halo = this.eye(lantern, 0xffb050, 1.1, 0, -0.24, 0, true);
    const hot = this.eye(lantern, 0xfff0c0, 0.3, 0, -0.24, 0, true);

    let swing = 0, swingV = 0;
    const id = this.group.id;
    return (dt, state, moving, t, dead) => {
      const mv = clamp01(moving / 2.2), ph = this.phase * 3.4;
      const w = this.wind, st = this.strike;
      const alert = state === 1 || state === 2 ? 1 : 0;
      legs.forEach(({ hip, knee }, i) => {
        const s = Math.sin(ph + i * Math.PI);
        hip.rotation.x = 0.2 + s * 0.5 * mv;
        knee.rotation.x = -0.35 - Math.max(0, Math.cos(ph + i * Math.PI)) * 0.7 * mv;
      });
      rig.position.y = 0.92 - Math.abs(Math.cos(ph)) * 0.06 * mv - 0.04;
      torso.rotation.set(-0.35 - 0.12 * alert + 0.12 * w - 0.5 * st + Math.sin(t * 1.5 + id) * 0.02,
        Math.sin(ph) * 0.12 * mv - 0.35 * w + 0.45 * st, Math.sin(ph) * 0.1 * mv);
      const [L, R] = arms;
      // right arm: axe low and ready, raised overhead on the wind-up, chopping down on the blow
      R.sh.rotation.x = (0.6 + 0.3 * alert - Math.sin(ph) * 0.25 * mv) * (1 - w) + 2.7 * w - st * 1.8;
      R.sh.rotation.z = 0.2 + 0.15 * w;
      R.el.rotation.x = 0.5 + 1.1 * w - 0.4 * st;
      // left arm: lantern held out to see by
      L.sh.rotation.x = 0.7 + 0.25 * alert + Math.sin(ph) * 0.25 * mv;
      L.sh.rotation.z = -0.25;
      L.el.rotation.x = 0.4;
      // the lantern swings on its chain
      const acc = -Math.sin(ph * 2) * 4 * mv - st * 20;
      swingV += (-swing * 30 - swingV * 2 + acc) * dt;
      swing += swingV * dt;
      const tilt = rig.rotation.x + torso.rotation.x + L.sh.rotation.x + L.el.rotation.x;
      lantern.rotation.set(-tilt + swing, 0, -(torso.rotation.z + L.sh.rotation.z));
      if (dead > 0) {
        const k1 = smooth(dead / 0.4), k2 = smooth((dead - 0.3) / 0.6);
        legs.forEach(({ hip, knee }) => { hip.rotation.x = 1.4 * k1; knee.rotation.x = -1.8 * k1; });
        rig.position.y = 0.88 - 0.4 * k1 - 0.25 * k2;
        rig.rotation.x = -1.35 * k2;
        R.sh.rotation.x = 0.6 + 1.8 * k2;
        L.sh.rotation.x = 0.7 + 1.6 * k2;
      } else rig.rotation.x = 0;
      const lit = dead > 0 ? Math.max(0, 1 - dead * 0.8) : 0.9 + Math.sin(t * 11 + id) * 0.06 + Math.sin(t * 23) * 0.04;
      this.glowOp(halo, 0.6 * lit);
      this.glowOp(hot, lit);
      flame.color.setRGB(lit, 0.82 * lit, 0.44 * lit);
      this.glowOp(stumpGlow, (0.35 + 0.15 * Math.sin(t * 3 + id)) * (dead > 0 ? 0 : 1));
    };
  }

  /** Root reaper: a gnarled dead tree that walks on its roots, with a hollow face and long twig claws. Dormant it is just a tree. */
  private reaper(): Anim {
    const r = seeded(17);
    const bark = this.mat(0x8a6c50, { map: hide("bark") });
    const bark2 = this.mat(0x6a5440, { map: hide("bark", 1, 2) });
    const hollow = this.mat(0x040201);
    const moss = this.mat(0x5a6a30, { map: hide("fur") });
    const fungus = this.mat(0xe0d0a0, { e: 0x101008 });
    const sap = this.glowMat(0xffa030);
    // roots stay planted on the group, so a falling trunk tears free of them
    const roots = [0, 1, 2, 3, 4, 5].map((i) => {
      const a = (i / 6) * TAU + 0.3;
      const p = this.piv(this.group, Math.cos(a) * 0.2, 0.5, Math.sin(a) * 0.2);
      p.rotation.y = -a;
      const up = this.piv(p, 0, 0, 0);
      this.bone(up, [0, 0, 0], [0.34, -0.12, 0], 0.15, 0.1, bark2);
      const kn = this.piv(up, 0.34, -0.12, 0);
      this.bone(kn, [0, 0, 0], [0.24, -0.42, 0], 0.1, 0.02, bark2);
      this.bone(kn, [0.12, -0.2, 0], [0.26, -0.24, 0.1], 0.03, 0.005, bark2, 4);
      return { up, kn, i };
    });
    const rig = this.piv(this.group, 0, 0.5, 0);
    const sway = this.piv(rig, 0, 0, 0);
    this.bone(sway, [0, -0.1, 0], [0.06, 0.62, 0.02], 0.36, 0.3, bark, 8);
    this.bone(sway, [0.06, 0.6, 0.02], [-0.04, 1.15, -0.02], 0.3, 0.27, bark, 8);
    this.bone(sway, [-0.04, 1.12, -0.02], [0.02, 1.68, 0.03], 0.27, 0.18, bark, 8);
    for (let i = 0; i < 6; i++) {
      const a = r() * TAU, y = 0.2 + r() * 1.2;
      this.ball(sway, 0.1 + r() * 0.07, bark2, Math.cos(a) * 0.27, y, Math.sin(a) * 0.27 + (Math.sin(a) < 0 ? 0.08 : 0), 1, 1.4, 1, 6, 5);
    }
    // the face: deep hollows for eyes and a long moaning mouth, under a knotted brow
    for (const s of [-1, 1]) {
      const h = this.ball(sway, 0.08, hollow, s * 0.11, 1.36, -0.22, 1, 1.35, 0.5, 8, 6);
      h.rotation.z = s * 0.45;
      this.bone(sway, [s * 0.26, 1.52, -0.18], [0, 1.43, -0.28], 0.06, 0.05, bark2, 5);
      this.ball(sway, 0.025, sap, s * 0.11, 1.35, -0.25, 1, 1, 1, 6, 4);
    }
    const mouth = this.ball(sway, 0.12, hollow, 0, 1.05, -0.24, 1.1, 1.6, 0.5, 8, 6);
    for (let i = 0; i < 5; i++) {
      const top = i < 3, x = top ? (i - 1) * 0.07 : (i - 3.5) * 0.08;
      const tooth = this.cone(sway, 0.022, 0.08, bark2, x, top ? 1.2 : 0.9, -0.29, 4);
      if (top) tooth.rotation.x = Math.PI;
    }
    const eyes = [-1, 1].map((s) => this.eye(sway, 0xffa020, 0.24, s * 0.11, 1.36, -0.28, true));
    const maw = this.eye(sway, 0xff7010, 0.45, 0, 1.05, -0.28, true);
    // bracket fungus and moss
    for (let i = 0; i < 4; i++) {
      const a = 0.6 + i * 1.4, y = 0.35 + i * 0.25;
      const f = this.put(sway, new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.03, 8, 1, false, 0, Math.PI), fungus), Math.cos(a) * 0.3, y, Math.sin(a) * 0.3);
      f.rotation.y = -a + Math.PI / 2;
    }
    this.ball(sway, 0.16, moss, 0.12, 1.62, 0.12, 1.3, 0.5, 1.2, 6, 5);
    // a crown of dead branches
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + r() * 0.5, out = 0.25 + r() * 0.2;
      const b1: P3 = [Math.cos(a) * out, 2.05 + r() * 0.25, Math.sin(a) * out];
      this.bone(sway, [0, 1.6, 0], b1, 0.09, 0.05, bark);
      const b2: P3 = [b1[0] * 2.0, b1[1] + 0.3 + r() * 0.3, b1[2] * 2.0];
      this.bone(sway, b1, b2, 0.05, 0.012, bark2, 5);
      const b3: P3 = [b1[0] * 1.5 + (r() - 0.5) * 0.3, b1[1] + 0.35, b1[2] * 1.5];
      this.bone(sway, b1, b3, 0.03, 0.008, bark2, 4);
      if (i % 2) this.bone(sway, b2, [b2[0], b2[1] - 0.5, b2[2]], 0.012, 0.006, moss, 3);
    }
    const arms = [-1, 1].map((s) => {
      const sh = this.piv(sway, s * 0.28, 1.25, 0);
      this.ball(sh, 0.13, bark, 0, 0, 0, 1, 1, 1, 7, 5);
      this.bone(sh, [0, 0, 0], [s * 0.46, -0.12, -0.04], 0.12, 0.08, bark);
      const el = this.piv(sh, s * 0.46, -0.12, -0.04);
      this.ball(el, 0.09, bark2, 0, 0, 0, 1, 1, 1, 6, 5);
      this.bone(el, [0, 0, 0], [s * 0.08, -0.62, -0.08], 0.08, 0.05, bark);
      this.bone(el, [s * 0.04, -0.3, -0.04], [s * 0.2, -0.45, 0.05], 0.025, 0.006, bark2, 4);
      const hand = this.piv(el, s * 0.08, -0.62, -0.08);
      for (let c = 0; c < 4; c++) {
        const a = (c - 1.5) * 0.45;
        const mid: P3 = [s * Math.sin(a) * 0.12 + s * 0.02, -0.2, Math.cos(a) * -0.06 - 0.03];
        this.bone(hand, [0, 0, 0], mid, 0.03, 0.018, bark2, 4);
        this.bone(hand, mid, [mid[0] * 1.3, -0.42, mid[2] - 0.1], 0.018, 0.003, bark2, 4);
      }
      return { sh, el, hand, s };
    });
    let go = 0;
    const id = this.group.id;
    return (dt, state, moving, t, dead) => {
      const awake = (state === 1 || state === 2) && dead <= 0 ? 1 : 0;
      go += (awake - go) * Math.min(1, dt * 2.5);
      const mv = clamp01(moving / 1), ph = this.phase * 3.2;
      const w = this.wind, st = this.strike;
      // a dead tree's pose: arms up among the branches. Awake: they come down and reach for you
      for (const { sh, el, hand, s } of arms) {
        const idleZ = 1.25, idleE = 1.3;
        const reachX = 0.5 + Math.sin(t * 1.3 + s) * 0.08 * go + Math.sin(ph + (s > 0 ? Math.PI : 0)) * 0.25 * mv;
        sh.rotation.z = s * (idleZ * (1 - go) + (0.15 + 0.9 * w) * go - 0.1 * st);
        sh.rotation.x = reachX * go - 0.5 * w + 1.4 * st;
        el.rotation.z = s * (idleE * (1 - go) + (0.15 + 0.3 * w) * go);
        el.rotation.x = 0.3 * go;
        hand.rotation.x = 0.2 + 0.3 * go + Math.sin(t * 4 + s) * 0.08 * go;
      }
      sway.rotation.set(go * (0.06 + Math.sin(t * 0.9 + id) * 0.03) + 0.12 * w - 0.3 * st, 0.3 * w * go,
        Math.sin(ph) * 0.07 * mv + go * Math.sin(t * 0.7 + id) * 0.03 + Math.sin(t * 0.3 + id) * 0.006);
      for (const { up, kn, i } of roots) {
        const lift = Math.max(0, Math.sin(ph + (i % 2) * Math.PI)) * 0.45 * mv;
        up.rotation.z = lift;
        kn.rotation.z = -lift * 0.6;
      }
      rig.position.y = 0.5 + Math.abs(Math.sin(ph)) * 0.04 * mv;
      mouth.scale.set(1.1, 1.3 + 0.5 * go + 0.4 * w, 0.5);
      if (dead > 0) {
        const k = clamp01(dead / 1.0);
        rig.rotation.x = -1.45 * k * k;
        rig.position.y = 0.5 - 0.25 * k;
      } else rig.rotation.x = 0;
      const glow = dead > 0 ? Math.max(0, 1 - dead * 1.5) * 0.8 : 0.06 + 0.94 * go;
      for (const e of eyes) { this.glowOp(e, glow * (0.85 + 0.15 * Math.sin(t * 5 + id))); e.scale.setScalar(0.12 + 0.16 * glow + 0.08 * w); }
      this.glowOp(maw, glow * 0.6);
      sap.color.setRGB(0.1 + 0.9 * glow, 0.06 + 0.56 * glow, 0.02 + 0.17 * glow);
    };
  }

  /** Gazer: a floating eye the size of a barrel, slit-pupilled, with a grin of fangs and a crown of writhing eyestalks. */
  private gazer(): Anim {
    const r = seeded(23);
    const flesh = this.mat(0xb07878, { map: hide("flesh") });
    const flesh2 = this.mat(0x8a4e54, { map: hide("flesh", 2, 1) });
    const white = this.mat(0xf2ead8, { shine: 80, spec: 0xffffff, e: 0x1a1612 });
    const irisM = this.mat(0x70e040, { e: 0x3a9010, shine: 60 });
    const black = this.mat(0x000000, { shine: 100, spec: 0xffffff });
    const mouthM = this.mat(0x3a0a10, { e: 0x1a0204 });
    const tooth = this.mat(0xece0c4, { shine: 40 });
    const rig = this.piv(this.group, 0, 0, 0);
    this.ball(rig, 0.36, flesh, 0, 0, 0, 1, 0.95, 1, 14, 10);
    for (let i = 0; i < 9; i++) {
      const a = r() * TAU, b = r() * 2 - 1, rr = Math.sqrt(1 - b * b);
      if (Math.sin(a) * rr < -0.4 && b < 0.4) continue;
      this.ball(rig, 0.03 + r() * 0.03, flesh2, Math.cos(a) * rr * 0.35, b * 0.34, Math.sin(a) * rr * 0.35, 1, 1, 1, 6, 4);
    }
    // the great eye
    const eyeP = this.piv(rig, 0, 0.07, -0.2);
    this.ball(eyeP, 0.2, white, 0, 0, -0.04, 1, 1, 1, 14, 10);
    const irisP = this.piv(eyeP, 0, 0, -0.04);
    const iris = this.cyl(irisP, 0.105, 0.105, 0.02, irisM, 0, 0, -0.19, 14);
    iris.rotation.x = Math.PI / 2;
    this.box(irisP, 0.028, 0.15, 0.01, black, 0, 0, -0.203);
    const irisGlow = this.eye(irisP, 0x80ff60, 0.35, 0, 0, -0.22, true);
    const lidG = (top: boolean) => {
      const g = new THREE.SphereGeometry(0.215, 14, 5, 0, TAU, top ? 0 : Math.PI / 2, Math.PI / 2);
      return this.put(eyeP, new THREE.Mesh(g, flesh2), 0, 0, -0.04);
    };
    const upper = lidG(true), lower = lidG(false);
    (flesh2 as THREE.Material).side = THREE.DoubleSide;
    const charge = this.eye(rig, 0xc0ffa0, 0.2, 0, 0.07, -0.55, true);
    // the maw: a wide grin of fangs under the eye
    this.ball(rig, 0.2, mouthM, 0, -0.18, -0.24, 1.35, 0.42, 0.6);
    for (let i = 0; i < 7; i++) {
      const x = -0.18 + i * 0.06;
      const t1 = this.cone(rig, 0.017, 0.07 + (i % 2) * 0.025, tooth, x, -0.15 - x * x * 0.4, -0.35 + x * x * 1.6, 4);
      t1.rotation.x = Math.PI;
    }
    const jaw = this.piv(rig, 0, -0.2, -0.12);
    this.ball(jaw, 0.2, flesh2, 0, -0.04, -0.12, 1.3, 0.35, 0.8, 10, 6);
    for (let i = 0; i < 6; i++) {
      const x = -0.15 + i * 0.06;
      this.cone(jaw, 0.016, 0.06 + (i % 2) * 0.02, tooth, x, 0.02, -0.25 + x * x * 1.6, 4);
    }
    // eyestalks over the top, each ending in a little eye
    const stalks: { a: THREE.Group; b: THREE.Group; ph: number; glow: THREE.Sprite }[] = [];
    for (let i = 0; i < 9; i++) {
      const az = (i / 9) * TAU + 0.35, pol = 0.35 + (i % 3) * 0.22;
      const n = new THREE.Vector3(Math.cos(az) * Math.sin(pol), Math.cos(pol), Math.sin(az) * Math.sin(pol) * 0.8 + 0.25).normalize();
      const root = this.piv(rig, n.x * 0.33, n.y * 0.33, n.z * 0.33);
      root.quaternion.setFromUnitVectors(UP, n);
      const a = this.piv(root, 0, 0, 0);
      this.bone(a, [0, 0, 0], [0, 0.17, 0], 0.032, 0.022, flesh2, 5);
      const b = this.piv(a, 0, 0.17, 0);
      this.bone(b, [0, 0, 0], [0, 0.15, 0], 0.022, 0.016, flesh2, 5);
      this.ball(b, 0.042, white, 0, 0.17, 0, 1, 1, 1, 8, 6);
      const glow = this.eye(b, [0xffd040, 0xff8030, 0xff4020][i % 3], 0.13, 0, 0.17, 0, true);
      stalks.push({ a, b, ph: i * 1.9, glow });
    }
    const tentacles = [0, 1, 2, 3].map((i) => {
      const a = (i / 4) * TAU + 0.4;
      const p = this.piv(rig, Math.cos(a) * 0.15, -0.3, Math.sin(a) * 0.15 + 0.05);
      this.bone(p, [0, 0, 0], [0, -0.22, 0], 0.03, 0.02, flesh2, 5);
      const q = this.piv(p, 0, -0.22, 0);
      this.bone(q, [0, 0, 0], [0, -0.18, 0], 0.02, 0.006, flesh2, 4);
      return { p, q, i };
    });
    let alert = 0;
    const id = this.group.id;
    return (dt, state, _moving, t, dead) => {
      const w = this.wind, st = this.strike;
      alert += ((state === 1 || state === 2 ? 1 : 0) - alert) * Math.min(1, dt * 3);
      const k = smooth(dead / 0.8);
      const live = 1 - k;
      for (const s of stalks) {
        const wv = live * (1 - 0.6 * w);
        s.a.rotation.set(Math.sin(t * 1.3 + s.ph * 2) * 0.35 * wv, 0, Math.sin(t * 1.7 + s.ph) * 0.35 * wv + k * 1.2);
        s.b.rotation.set(Math.cos(t * 1.9 + s.ph) * 0.5 * wv, 0, Math.sin(t * 2.3 + s.ph) * 0.6 * wv + k * 0.8);
        this.glowOp(s.glow, live * (0.75 + 0.25 * Math.sin(t * 4 + s.ph) + 0.3 * w));
      }
      for (const { p, q, i } of tentacles) {
        p.rotation.set(Math.sin(t * 1.5 + i * 1.7) * 0.3, 0, Math.cos(t * 1.2 + i) * 0.3);
        q.rotation.set(Math.sin(t * 2.1 + i) * 0.5, 0, Math.cos(t * 1.8 + i * 2) * 0.4);
      }
      // the eye roams when idle and fixes on you when it's hunting
      irisP.rotation.set(Math.sin(t * 0.5 + id) * 0.25 * (1 - alert), Math.sin(t * 0.7 + id * 2) * 0.4 * (1 - alert), 0);
      const blink = (t * 0.31 + id * 0.17) % 3.5 < 0.13 && w < 0.1 ? 1 : 0;
      const open = live * (1 - blink) * (0.75 + 0.15 * alert + 0.4 * w);
      upper.rotation.x = 0.15 + 0.95 * open;
      lower.rotation.x = -(0.25 + 0.75 * open);
      jaw.rotation.x = 0.08 + 0.15 * alert + 0.45 * w + Math.sin(t * 18) * 0.05 * w - 0.2 * st;
      rig.position.y = Math.sin(t * 1.8 + id) * 0.05 - 1.15 * k * k;
      rig.rotation.set(-0.08 * w + k * 0.6, 0, Math.sin(t * 0.9 + id) * 0.06 + k * 1.6);
      this.glowOp(irisGlow, live * (0.45 + 0.55 * w + 0.2 * alert));
      irisGlow.scale.setScalar(0.3 + 0.25 * w);
      charge.scale.setScalar(0.1 + w * 0.8 + st * 1.2);
      this.glowOp(charge, live * (w * 0.9 + st));
    };
  }

  /** Cave spider: legs spanning a passage, a fat banded abdomen, a cluster of red eyes and black fangs. Hangs head-down from the roof until it drops. */
  private spider(): Anim {
    const r = seeded(19);
    const hideM = this.mat(0xa48a72, { map: hide("chitin") });
    const hide2 = this.mat(0x6e5848, { map: hide("chitin", 2, 1) });
    const legM = this.mat(0x94806a, { map: hide("chitin", 1, 3) });
    const joint = this.mat(0x2a201a);
    const mark = this.mat(0xe0d0b0, { e: 0x141008 });
    const fangM = this.mat(0x101010, { shine: 80, spec: 0x888888 });
    const black = this.mat(0x050505, { shine: 120, spec: 0xffffff });
    const silk = this.glowMat(0xd8d8d0, 0.55);
    const hang = this.piv(this.group, 0, 0, 0);
    const rig = this.piv(hang, 0, 0.32, 0);
    this.ball(rig, 0.16, hideM, 0, 0.02, -0.16, 0.95, 0.7, 1.15);
    this.cyl(rig, 0.05, 0.05, 0.1, hide2, 0, 0.04, 0.0, 6).rotation.x = Math.PI / 2;
    const abd = this.piv(rig, 0, 0.06, 0.06);
    this.ball(abd, 0.3, hide2, 0, 0.1, 0.26, 1, 0.85, 1.25, 12, 9);
    // pale chevrons down its back
    for (let i = 0; i < 4; i++) {
      for (const s of [-1, 1]) {
        const c = this.box(abd, 0.14 - i * 0.02, 0.015, 0.035, mark, s * (0.055 - i * 0.004), 0.355 - i * 0.012 - Math.abs(i - 1.5) * 0.008, 0.1 + i * 0.1);
        c.rotation.set(-0.12 + i * 0.12, s * 0.6, 0);
      }
    }
    this.ball(abd, 0.05, mark, 0, 0.34, -0.02, 1.4, 0.4, 1);
    for (let i = 0; i < 10; i++) {
      const a = r() * TAU, y = r();
      const hair = this.cone(abd, 0.01, 0.07, hideM, Math.cos(a) * 0.26, 0.1 + (y - 0.3) * 0.3, 0.26 + Math.sin(a) * 0.3, 3);
      hair.rotation.set(Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2);
    }
    this.cone(abd, 0.04, 0.08, hideM, 0, 0.04, 0.62, 5).rotation.x = Math.PI / 2;
    // eyes: two big, two middling, four small, all red
    const eyeGlows: THREE.Sprite[] = [];
    const eyeAt: [number, number, number, number][] = [[0.045, 0.08, -0.31, 0.032], [-0.045, 0.08, -0.31, 0.032], [0.095, 0.06, -0.27, 0.022], [-0.095, 0.06, -0.27, 0.022],
      [0.03, 0.12, -0.28, 0.016], [-0.03, 0.12, -0.28, 0.016], [0.075, 0.105, -0.23, 0.014], [-0.075, 0.105, -0.23, 0.014]];
    for (const [x, y, z, s] of eyeAt) {
      this.ball(rig, s, black, x, y, z, 1, 1, 1, 6, 5);
      eyeGlows.push(this.eye(rig, 0xff2010, s * 3.6, x, y, z - 0.01, true));
    }
    const fangs = [-1, 1].map((s) => {
      this.bone(rig, [s * 0.04, -0.02, -0.29], [s * 0.035, -0.12, -0.34], 0.04, 0.03, hide2, 5);
      const f = this.piv(rig, s * 0.035, -0.12, -0.34);
      this.bone(f, [0, 0, 0], [-s * 0.025, -0.07, 0.025], 0.014, 0.002, fangM, 4);
      this.bone(rig, [s * 0.08, -0.03, -0.27], [s * 0.13, -0.12, -0.4], 0.02, 0.015, legM, 4);
      return { f, s };
    });
    const legs: { yaw: THREE.Group; lift: THREE.Group; knee: THREE.Group; s: number; i: number; a: number }[] = [];
    const yaws = [0.85, 0.3, -0.25, -0.8], hz = [-0.23, -0.18, -0.13, -0.08];
    for (const s of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const a = s > 0 ? yaws[i] : Math.PI - yaws[i];
        const sc = i === 0 ? 1.15 : i === 3 ? 1.08 : 1;
        const yaw = this.piv(rig, s * 0.1, 0, hz[i]);
        yaw.rotation.y = a;
        const lift = this.piv(yaw, 0, 0, 0);
        this.bone(lift, [0, 0, 0], [0.42 * sc, 0, 0], 0.036, 0.03, legM, 5);
        const knee = this.piv(lift, 0.42 * sc, 0, 0);
        this.ball(knee, 0.036, joint, 0, 0, 0, 1, 1, 1, 6, 4);
        this.bone(knee, [0, 0, 0], [0.4 * sc, 0, 0], 0.03, 0.022, legM, 5);
        this.ball(knee, 0.025, joint, 0.4 * sc, 0, 0, 1, 1, 1, 5, 4);
        this.bone(knee, [0.4 * sc, 0, 0], [0.62 * sc, 0, 0], 0.022, 0.006, joint, 4);
        legs.push({ yaw, lift, knee, s, i, a });
      }
    }
    const thread = this.box(this.group, 0.012, 6, 0.012, silk, 0, 3.2, 0);
    let h = -1;
    const id = this.group.id;
    return (dt, state, moving, t, dead) => {
      if (h < 0) h = state === 0 ? 1 : 0;
      h += ((state === 0 && dead <= 0 ? 1 : 0) - h) * Math.min(1, dt * 6);
      const mv = clamp01(moving / 2) * (1 - h), ph = this.phase * 5.5;
      const w = this.wind, st = this.strike;
      const dk = smooth(dead / 0.5);
      const curl = Math.max(h * 0.8, dk);
      // hanging: nose down, turning slowly on its thread
      hang.rotation.set(-Math.PI / 2 * h, h * Math.sin(t * 0.4 + id) * 1.2, Math.PI * dk);
      rig.position.set(0, 0.32 * (1 - h) - 0.18 * dk + Math.abs(Math.sin(ph)) * 0.02 * mv + 0.06 * w, -0.25 * st);
      rig.rotation.x = 0.35 * w - 0.15 * st;
      for (const l of legs) {
        const off = (l.i + (l.s > 0 ? 0 : 1)) % 2 ? Math.PI : 0;
        const swing = Math.sin(ph + off) * mv;
        const step = Math.max(0, Math.cos(ph + off)) * 0.35 * mv;
        const front = l.i === 0 ? w : l.i === 1 ? w * 0.4 : 0;
        l.yaw.rotation.y = l.a + l.s * (swing * 0.28 + front * 0.35);
        l.lift.rotation.z = 0.9 + step + front * 0.9 + curl * 0.6 + (h > 0.5 ? Math.sin(t * 2 + l.i + l.s) * 0.08 : 0);
        l.knee.rotation.z = -2.05 - curl * 0.7 + front * 0.6 + step * 0.3;
      }
      for (const { f, s } of fangs) f.rotation.z = s * (0.5 * w - 0.4 * st + Math.sin(t * 7) * 0.05 * (1 - h));
      thread.visible = h > 0.05;
      for (const [i, e] of eyeGlows.entries()) this.glowOp(e, (dead > 0 ? 1 - dead * 1.5 : 0.85 + 0.15 * Math.sin(t * 3 + i)));
    };
  }

  /** Wisp: a flickering ghost-light with a hollow face and a tail of cold fire streaming behind it. */
  private wisp(): Anim {
    if (!faceTex) faceTex = wispFace();
    const coreM = this.glowMat(0xffffff);
    const rig = this.piv(this.group, 0, 0, 0);
    this.ball(rig, 0.045, coreM, 0, 0, 0, 1, 1, 1, 8, 6);
    const halo = this.eye(rig, 0x3060ff, 1.0, 0, 0, 0, true);
    const mid = this.eye(rig, 0x70c0ff, 0.5, 0, 0, 0, true);
    const faceM = new THREE.SpriteMaterial({ map: faceTex, color: 0xd0f0ff, transparent: true, depthWrite: false, fog: false });
    const face = this.put(rig, new THREE.Sprite(faceM), 0, 0, 0);
    const heart = this.eye(rig, 0xffffff, 0.16, 0, 0, 0, true);
    const N = 11;
    const tail = Array.from({ length: N }, (_, i) => this.eye(this.group, i < 3 ? 0x90d8ff : 0x4a80ff, 0.3, 0, 0, 0, true));
    const motes = [0, 1, 2, 3, 4].map(() => this.eye(rig, 0xc0e8ff, 0.07, 0, 0, 0, true));
    const pts = Array.from({ length: N }, () => new THREE.Vector3(NaN, 0, 0));
    const v = new THREE.Vector3();
    const id = this.group.id;
    return (dt, _state, _moving, t, dead) => {
      const k = clamp01(dead / 0.8), a = 1 - k;
      const w = this.wind, st = this.strike;
      const sputter = dead > 0 ? (Math.sin(dead * 55) > -0.2 ? 1 : 0.2) : (Math.sin(t * 7.3 + id) * Math.sin(t * 3.1 + id) > 0.75 ? 0.55 : 1);
      const fl = (1 + Math.sin(t * 13 + id) * 0.08 + Math.sin(t * 29 + id * 2) * 0.06) * sputter;
      const sw = 1 + w * 0.8 + st * 0.6, s = (1 - k);
      halo.scale.setScalar(1.0 * fl * sw * s);
      mid.scale.setScalar(0.5 * fl * sw * s);
      face.scale.setScalar(0.36 * fl * (1 + w * 0.3) * s);
      heart.scale.setScalar(0.16 * fl * (1 + w * 1.2) * s);
      this.glowOp(halo, (0.32 + 0.4 * w) * a * sputter);
      this.glowOp(mid, (0.55 + 0.3 * w) * a);
      faceM.opacity = (0.85 - 0.3 * w) * a * this.fade;
      this.glowOp(heart, a);
      coreM.color.setRGB(0.8 + 0.2 * w, 0.95, 1);
      motes.forEach((m, i) => {
        const ang = t * (1.6 + i * 0.5) * (1 + 2.5 * w) + i * 1.26, rr = (0.2 + Math.sin(t * 2.3 + i) * 0.05) * (1 - 0.4 * w) * (1 + k * 2);
        m.position.set(Math.cos(ang) * rr, Math.sin(t * 2 + i * 2) * 0.12 + k * 0.4, Math.sin(ang) * rr);
        m.scale.setScalar(0.07 * fl);
        this.glowOp(m, (0.7 + Math.sin(t * 21 + i * 3) * 0.3) * a);
      });
      rig.position.set(Math.sin(t * 1.3 + id) * 0.04, Math.sin(t * 2.2 + id) * 0.06, 0);
      // the tail: each point chases the one ahead of it in the world, and drifts up like smoke
      const g = this.group;
      g.updateMatrixWorld();
      v.copy(rig.position).applyMatrix4(g.matrixWorld);
      if (Number.isNaN(pts[0].x)) for (const p of pts) p.copy(v);
      pts[0].copy(v);
      for (let i = 1; i < N; i++) {
        pts[i].lerp(pts[i - 1], Math.min(1, dt * 16));
        pts[i].y += dt * (0.25 + k * 1.5);
        pts[i].x += Math.sin(t * 3 + i * 0.8 + id) * dt * 0.12;
      }
      tail.forEach((sp, i) => {
        sp.position.copy(pts[i]);
        g.worldToLocal(sp.position);
        const f = 1 - i / N;
        sp.scale.setScalar(0.32 * f * fl * (1 - k * 0.5));
        this.glowOp(sp, 0.55 * f * a * (i === 0 ? 0 : 1));
      });
    };
  }

  // ---- the second wave ----

  /** Two-bone reach: turns a shoulder pivot (arm hanging down -y, elbow bending forward about x) so the hand lands on t (parent space). */
  private ik(sh: THREE.Object3D, el: THREE.Object3D, t: THREE.Vector3, l1: number, l2: number, pole: THREE.Vector3): void {
    const dir = IK.dir.copy(t).sub(sh.position);
    const d = Math.min(Math.max(dir.length(), 1e-3), (l1 + l2) * 0.995);
    dir.normalize();
    const a = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
    const e2 = IK.e2.copy(pole).addScaledVector(dir, -pole.dot(dir)).normalize();
    const u = IK.u.copy(dir).multiplyScalar(Math.cos(a)).addScaledVector(e2, Math.sin(a));
    const f = IK.f.copy(dir).multiplyScalar(d).addScaledVector(u, -l1).normalize();
    const y = IK.y.copy(u).negate();
    const z = IK.z.copy(f).addScaledVector(u, -f.dot(u)).normalize().negate();
    const x = IK.x.crossVectors(y, z);
    sh.quaternion.setFromRotationMatrix(IK.m.makeBasis(x, y, z));
    el.rotation.set(Math.acos(Math.max(-1, Math.min(1, f.dot(u)))), 0, 0);
  }

  /** A unit rod (along +y, length 1) to be stretched between two points every frame with rodTo. */
  private rod(p: THREE.Object3D, r: number, m: THREE.Material): THREE.Mesh {
    const g = new THREE.CylinderGeometry(r, r, 1, 3);
    g.translate(0, 0.5, 0);
    const o = this.put(p, new THREE.Mesh(g, m), 0, 0, 0);
    o.scale.setScalar(0.001);
    return o;
  }

  private rodTo(o: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3): void {
    const d = ROD.copy(b).sub(a), len = d.length();
    o.position.copy(a);
    o.quaternion.setFromUnitVectors(UP, d.multiplyScalar(1 / Math.max(len, 1e-5)));
    o.scale.set(1, len, 1);
  }

  /** A burst of glowing motes (spores, embers, rime) thrown out ahead when a blow lands. Returns the per-frame driver. */
  private burst(n: number, colour: number, seed: number, o: { from: P3; reach: number; spread: number; rise: number; size: number; grow: number; life: number; op: number }) {
    const r = seeded(seed);
    const parts = Array.from({ length: n }, () => ({
      s: this.eye(this.group, colour, o.size, o.from[0], o.from[1], o.from[2], true),
      d: new THREE.Vector3((r() - 0.5) * o.spread, (r() - 0.3) * o.spread * 0.6 + o.rise, -1).normalize(),
      v: 0.6 + r() * 0.6, ph: r() * TAU, k: 0.7 + r() * 0.6,
    }));
    let t = 99, last = 0;
    return (dt: number, st: number, scale = 1) => {
      if (st > last + 0.3) t = 0;
      last = st;
      t += dt;
      const k = t / o.life;
      for (const p of parts) {
        const kk = k * p.k;
        if (kk >= 1) { this.glowOp(p.s, 0); p.s.visible = false; continue; }
        p.s.visible = true;
        const go = 1 - (1 - kk) * (1 - kk);
        p.s.position.set(o.from[0] + p.d.x * o.reach * go * p.v + Math.sin(t * 3 + p.ph) * 0.06,
          o.from[1] + p.d.y * o.reach * go * p.v, o.from[2] + p.d.z * o.reach * go * p.v);
        p.s.scale.setScalar(o.size * (1 + o.grow * go) * scale);
        this.glowOp(p.s, o.op * (1 - kk) * Math.min(1, kk * 25));
      }
    };
  }

  /** Knocker: a wizened little Cornish mine spirit, all nose, ears and beard, with a felt cap and a stub of candle, a tiny pick and a pocketful of stones to throw. */
  private knocker(): Anim {
    const r = seeded(41);
    const skin = this.mat(0xa08c6c, { map: hide("flesh") });
    const skin2 = this.mat(0x86704e, { map: hide("flesh", 2, 2) });
    const beard = this.mat(0xe0dac8, { map: hide("fur") });
    const felt = this.mat(0x8a3a24, { map: hide("rag") });
    const jerkin = this.mat(0x7a5a36, { map: hide("leather") });
    const cloth = this.mat(0x5a5a46, { map: hide("rag", 2, 2), side: THREE.DoubleSide });
    const boot = this.mat(0x3a2a1a, { map: hide("leather") });
    const iron = this.mat(0x7a7a80, { map: hide("iron"), shine: 40 });
    const wood = this.mat(0x8a6038, { map: hide("bark", 1, 2) });
    const stoneM = this.mat(0xc0b494, { map: hide("oolite"), flat: true });
    const dark = this.mat(0x080604);
    const wax = this.mat(0xeae0c4, { e: 0x30281a });
    const flame = this.glowMat(0xffd070);

    const rig = this.piv(this.group, 0, 0.36, 0);
    const legs = [-1, 1].map((s) => {
      const hip = this.piv(rig, s * 0.07, 0, 0);
      this.bone(hip, [0, 0, 0], [s * 0.03, -0.17, -0.01], 0.05, 0.035, cloth);
      const knee = this.piv(hip, s * 0.03, -0.17, -0.01);
      this.bone(knee, [0, 0, 0], [0, -0.14, 0.01], 0.032, 0.026, skin2);
      this.box(knee, 0.08, 0.06, 0.14, boot, 0, -0.16, -0.02);
      const toe = this.cone(knee, 0.035, 0.11, boot, 0, -0.165, -0.13, 5);
      toe.rotation.x = -Math.PI / 2 + 0.6;
      return { hip, knee };
    });
    this.ball(rig, 0.11, cloth, 0, 0.02, 0, 1.1, 0.8, 0.9);
    const torso = this.piv(rig, 0, 0.04, 0);
    this.ball(torso, 0.12, jerkin, 0, 0.12, 0.0, 1.0, 1.1, 0.9);
    this.ball(torso, 0.105, jerkin, 0, 0.22, 0.045, 1.15, 0.8, 0.95);
    this.cyl(torso, 0.118, 0.122, 0.035, boot, 0, 0.06, 0, 9);
    this.box(torso, 0.04, 0.035, 0.02, iron, 0, 0.06, -0.12);
    this.ball(torso, 0.048, jerkin, 0.115, 0.03, -0.03, 1, 1.25, 0.8, 7, 5);
    this.rock(torso, 0.025, stoneM, 0.115, 0.08, -0.04, r);

    const head = this.piv(torso, 0, 0.31, -0.06);
    this.ball(head, 0.1, skin, 0, 0.02, 0, 1, 1.05, 1);
    this.ball(head, 0.055, skin2, 0, -0.04, -0.04, 1.3, 0.8, 1.1, 8, 5);
    this.bone(head, [0, 0.03, -0.085], [0, -0.03, -0.15], 0.024, 0.03, skin, 6);
    this.ball(head, 0.042, skin2, 0, -0.035, -0.155, 1.05, 0.9, 1.1, 8, 6);
    for (const s of [-1, 1]) {
      this.box(head, 0.06, 0.022, 0.035, beard, s * 0.04, 0.058, -0.085).rotation.z = -s * 0.35;
      this.ball(head, 0.02, dark, s * 0.037, 0.028, -0.088, 1, 0.8, 1, 6, 5);
      const ear = this.cone(head, 0.032, 0.14, skin, s * 0.15, 0.04, 0.01, 4);
      ear.rotation.set(0, 0, -s * 1.15);
      ear.scale.z = 0.4;
      // a moustache sweeping out from under the nose
      this.bone(head, [s * 0.01, -0.06, -0.12], [s * 0.08, -0.09, -0.09], 0.016, 0.006, beard, 4);
    }
    const eyes = [-1, 1].map((s) => this.eye(head, 0xffc850, 0.075, s * 0.037, 0.028, -0.104, true));
    const jaw = this.piv(head, 0, -0.06, -0.04);
    this.box(jaw, 0.06, 0.02, 0.05, dark, 0, 0.0, -0.05);
    this.ball(jaw, 0.06, beard, 0, -0.02, -0.06, 1.3, 0.9, 0.8, 7, 5);
    for (let i = 0; i < 7; i++) {
      const x = (i - 3) * 0.024, l = 0.15 + (3 - Math.abs(i - 3)) * 0.04 + r() * 0.03;
      const b = this.cone(jaw, 0.034, l, beard, x, -l / 2 + 0.0, -0.06 - Math.abs(x) * 0.3 + (i % 2) * 0.015, 5);
      b.rotation.set(Math.PI - 0.22, 0, x * 1.6);
    }
    // a floppy felt cap with a stub of candle stuck to the brim in clay
    const cap = this.piv(head, 0, 0.075, 0.005);
    this.cyl(cap, 0.1, 0.112, 0.045, felt, 0, 0.0, 0, 10);
    const tip = this.piv(cap, 0, 0.02, 0);
    tip.rotation.x = 0.55;
    this.cone(tip, 0.095, 0.22, felt, 0, 0.1, 0, 7);
    this.ball(tip, 0.022, felt, 0, 0.21, 0, 1, 1, 1, 6, 4);
    this.ball(cap, 0.02, skin2, 0, 0.03, -0.1, 1.2, 0.8, 1, 6, 4);
    this.cyl(cap, 0.013, 0.015, 0.06, wax, 0, 0.065, -0.105, 6);
    const flameM = this.ball(cap, 0.012, flame, 0, 0.11, -0.105, 1, 1.8, 1, 5, 4);
    const lamp = this.eye(cap, 0xffd080, 0.22, 0, 0.11, -0.11, true);

    const arms = [-1, 1].map((s) => {
      const sh = this.piv(torso, s * 0.12, 0.22, 0.01);
      this.ball(sh, 0.036, jerkin, 0, 0, 0, 1, 1, 1, 7, 5);
      this.bone(sh, [0, 0, 0], [0, -0.15, 0], 0.032, 0.024, jerkin, 5);
      const el = this.piv(sh, 0, -0.15, 0);
      this.bone(el, [0, 0, 0], [0, -0.14, 0], 0.02, 0.016, skin, 5);
      const hand = this.piv(el, 0, -0.15, 0);
      this.ball(hand, 0.028, skin, 0, 0, 0, 1, 1.1, 0.9, 7, 5);
      for (let f = 0; f < 3; f++) this.bone(hand, [(f - 1) * 0.015, -0.015, 0], [(f - 1) * 0.022, -0.06, -0.02], 0.007, 0.004, skin2, 3);
      return { sh, el, hand, s };
    });
    // the tiny pick in his right fist
    const pick = this.piv(arms[1].hand, 0, -0.01, 0);
    pick.rotation.x = -Math.PI / 2 + 0.3;
    this.bone(pick, [0, -0.05, 0], [0, 0.3, 0], 0.011, 0.01, wood, 5);
    this.box(pick, 0.026, 0.03, 0.04, iron, 0, 0.29, 0);
    const spike = this.cone(pick, 0.014, 0.13, iron, 0, 0.27, -0.08, 4);
    spike.rotation.x = -Math.PI / 2 - 0.35;
    const peen = this.cone(pick, 0.012, 0.05, iron, 0, 0.29, 0.04, 4);
    peen.rotation.x = Math.PI / 2;
    // and a stone in his left, ready to throw
    const stone = this.rock(arms[0].hand, 0.042, stoneM, 0, -0.04, -0.01, r);

    let reload = 0, alertK = 0;
    const id = this.group.id;
    return (dt, state, moving, t, dead) => {
      const mv = clamp01(moving / 2.5), ph = this.phase * 9;
      const w = this.wind, st = this.strike;
      alertK += ((state === 1 || state === 2 ? 1 : 0) - alertK) * Math.min(1, dt * 4);
      if (st > 0.9) reload = 0.9;
      reload = Math.max(0, reload - dt);
      stone.visible = reload <= 0;
      // skittish: crouched and twitchy, the head darting from one noise to the next
      const dart = Math.floor(t * 1.7 + id);
      const look = (Math.sin(dart * 12.9898) * 43758.5453) % 1;
      legs.forEach(({ hip, knee }, i) => {
        const s = Math.sin(ph + i * Math.PI);
        hip.rotation.x = 0.35 + 0.15 * alertK + s * 0.7 * mv;
        knee.rotation.x = -0.6 - 0.2 * alertK - Math.max(0, Math.cos(ph + i * Math.PI)) * 0.9 * mv;
        hip.rotation.z = (i ? -1 : 1) * 0.12;
      });
      rig.position.y = 0.34 - 0.03 * alertK - Math.abs(Math.cos(ph)) * 0.04 * mv + (state === 0 ? Math.abs(Math.sin(t * 3 + id)) * 0.01 : 0);
      torso.rotation.set(-0.3 - 0.15 * alertK - 0.2 * mv + 0.25 * w - 0.5 * st, -0.5 * w + 0.7 * st + Math.sin(ph) * 0.15 * mv, Math.sin(ph) * 0.1 * mv);
      head.rotation.set(0.25 + 0.1 * alertK - 0.2 * w + Math.sin(t * 2.3 + id) * 0.04, look * 0.7 * (1 - alertK * 0.7) * (1 - w) + 0.4 * w - 0.4 * st, Math.sin(t * 1.1 + id) * 0.1);
      jaw.rotation.x = 0.05 + 0.2 * w + Math.max(0, Math.sin(t * 11)) * 0.12 * alertK;
      const [L, R] = arms;
      // throwing arm: back over the shoulder on the wind-up, whipped through on the release
      L.sh.rotation.x = (0.25 + 0.3 * alertK - Math.sin(ph) * 0.6 * mv) * (1 - w) + 3.6 * w - st * 2.6;
      L.sh.rotation.z = -0.25 - 0.15 * w;
      L.el.rotation.x = 0.5 + 0.9 * w - 0.5 * st;
      // pick hand: held up and ready, raised on the wind-up
      R.sh.rotation.x = (0.6 + 0.4 * alertK + Math.sin(ph) * 0.6 * mv) * (1 - w) + 2.3 * w - st * 1.4;
      R.sh.rotation.z = 0.25 + 0.1 * w;
      R.el.rotation.x = 0.9 + 0.3 * w;
      if (dead > 0) {
        // sits down hard, then topples onto his back
        const k1 = smooth(dead / 0.3), k2 = smooth((dead - 0.2) / 0.45);
        legs.forEach(({ hip, knee }) => { hip.rotation.x = 0.35 + 1.2 * k1; knee.rotation.x = -0.6 + 0.3 * k1; });
        rig.position.y = 0.34 - 0.24 * k1;
        rig.rotation.x = 1.25 * k2;
        L.sh.rotation.x = 0.3 + 2.4 * k2; R.sh.rotation.x = 0.6 + 2.2 * k2;
        head.rotation.x = 0.25 - 0.5 * k2;
      } else rig.rotation.x = 0;
      const lit = dead > 0 ? Math.max(0, 1 - dead * 2.5) : 0.85 + Math.sin(t * 13 + id) * 0.08 + Math.sin(t * 31) * 0.05;
      this.glowOp(lamp, 0.7 * lit);
      flameM.visible = lit > 0.05;
      flameM.scale.set(1, 1.8 * (0.8 + 0.25 * lit), 1);
      for (const e of eyes) this.glowOp(e, dead > 0 ? 1 - dead * 1.5 : 0.8 + 0.2 * alertK);
    };
  }

  /** Strongbox mimic: an iron-bound chest that sits as still as one, until the lid gapes on rows of teeth and a long tongue and it scuttles at you on little legs. */
  private mimic(): Anim {
    const r = seeded(43);
    const W = 1.0, H = 0.44, D = 0.62;
    const plank = this.mat(0xa07a50, { map: hide("plank") });
    const plank2 = this.mat(0x8a6844, { map: hide("plank") });
    const iron = this.mat(0x5a5a5e, { map: hide("iron"), shine: 40 });
    const brass = this.mat(0xc09040, { shine: 60, e: 0x201400 });
    const gum = this.mat(0x7a1a22, { map: hide("flesh"), shine: 50, spec: 0x664444, e: 0x1a0204 });
    const throat = this.mat(0x160204);
    const tooth = this.mat(0xe8dcbc, { shine: 30 });
    const tongueM = this.mat(0xc04a5a, { map: hide("flesh"), shine: 70, spec: 0x886666, e: 0x200408 });
    const legM = this.mat(0x5a3a2a, { map: hide("chitin", 1, 3) });
    const claw = this.mat(0x1a120c);
    const gold = this.mat(0xe0b030, { shine: 80, e: 0x302000 });
    const dark = this.mat(0x060404);

    const rig = this.piv(this.group, 0, 0, 0);
    const body = this.piv(rig, 0, 0, 0);
    // an open box: floor, four walls, a fleshy gullet inside
    this.box(body, W, 0.05, D, plank2, 0, 0.025, 0);
    this.box(body, W, H, 0.05, plank, 0, H / 2, -D / 2 + 0.025);
    this.box(body, W, H, 0.05, plank, 0, H / 2, D / 2 - 0.025);
    for (const s of [-1, 1]) this.box(body, 0.05, H, D - 0.1, plank2, s * (W / 2 - 0.025), H / 2, 0);
    this.box(body, W - 0.1, H - 0.12, D - 0.1, throat, 0, (H - 0.12) / 2 + 0.05, 0);
    this.ball(body, 0.42, gum, 0, H - 0.1, 0.02, 1.1, 0.22, 0.65, 10, 6);
    for (let i = 0; i < 4; i++) {
      const c = this.cyl(body, 0.035, 0.035, 0.01, gold, (r() - 0.5) * 0.5, H - 0.04, (r() - 0.5) * 0.2 + 0.08, 8);
      c.rotation.set(r() * 0.6, 0, r() * 0.6);
    }
    // iron bands and corner brackets, a lock on the lid
    for (const x of [-0.32, 0.32]) {
      this.box(body, 0.06, H, 0.012, iron, x, H / 2, -D / 2 - 0.006);
      this.box(body, 0.06, H, 0.012, iron, x, H / 2, D / 2 + 0.006);
    }
    for (const s of [-1, 1]) for (const zz of [-1, 1]) this.box(body, 0.08, 0.08, 0.08, iron, s * (W / 2 - 0.03), 0.04, zz * (D / 2 - 0.03));
    // the lower teeth, all round the rim: bigger at the front
    for (let i = 0; i < 9; i++) {
      const x = -0.4 + i * 0.1, big = i % 2 ? 0.8 : 1.1;
      this.cone(body, 0.03, 0.09 * big, tooth, x, H + 0.035 * big, -D / 2 + 0.05, 4);
    }
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) this.cone(body, 0.025, 0.06, tooth, s * (W / 2 - 0.05), H + 0.025, -0.15 + i * 0.13, 4);
    // the lid hinges at the back
    const lid = this.piv(body, 0, H, D / 2);
    this.box(lid, W + 0.02, 0.13, D + 0.02, plank, 0, 0.065, -D / 2);
    this.box(lid, W - 0.06, 0.02, D - 0.06, gum, 0, -0.005, -D / 2);
    for (const x of [-0.32, 0.32]) {
      this.box(lid, 0.065, 0.016, D + 0.04, iron, x, 0.138, -D / 2);
      this.box(lid, 0.065, 0.14, 0.016, iron, x, 0.065, -D - 0.018);
    }
    this.box(lid, 0.13, 0.12, 0.022, brass, 0, 0.0, -D - 0.022);
    this.box(lid, 0.02, 0.045, 0.01, dark, 0, -0.01, -D - 0.036);
    for (let i = 0; i < 8; i++) {
      const x = -0.35 + i * 0.1, big = i % 2 ? 1.1 : 0.8;
      const tt = this.cone(lid, 0.03, 0.1 * big, tooth, x, -0.04 * big, -D + 0.05, 4);
      tt.rotation.x = Math.PI;
    }
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
      const tt = this.cone(lid, 0.025, 0.07, tooth, s * (W / 2 - 0.05), -0.03, -D / 2 - 0.15 + i * 0.13, 4);
      tt.rotation.x = Math.PI;
    }
    // eyes deep in the dark under the lid
    const eyes = [-1, 1].map((s) => this.eye(body, 0xffd040, 0.16, s * 0.2, H - 0.02, 0.12, true));
    // the tongue: a chain from the back of the gullet out over the front teeth
    const tongue: THREE.Group[] = [];
    let at: THREE.Object3D = body, p0: P3 = [0, H - 0.06, 0.14];
    for (let i = 0; i < 5; i++) {
      const p = this.piv(at, ...p0);
      const seg = this.bone(p, [0, 0, 0], [0, 0, -0.12], 0.05 - i * 0.006, 0.045 - i * 0.006, tongueM, 6);
      seg.scale.set(1.7, 0.5, 1);
      tongue.push(p);
      at = p; p0 = [0, 0, -0.12];
    }
    this.ball(tongue[4], 0.035, tongueM, 0, 0, -0.12, 1.6, 0.5, 1.2, 6, 4);
    // little legs folded underneath, three a side
    const legs = [-0.2, 0, 0.2].flatMap((z, i) => [-1, 1].map((s) => {
      const root = this.piv(rig, s * (W / 2 - 0.08), 0.06, z);
      const lift = this.piv(root, 0, 0, 0);
      this.bone(lift, [0, 0, 0], [s * 0.17, 0.08, 0], 0.035, 0.028, legM, 5);
      const knee = this.piv(lift, s * 0.17, 0.08, 0);
      this.ball(knee, 0.03, legM, 0, 0, 0, 1, 1, 1, 5, 4);
      this.bone(knee, [0, 0, 0], [s * 0.08, -0.26, 0], 0.026, 0.016, legM, 5);
      this.bone(knee, [s * 0.08, -0.26, 0], [s * 0.1, -0.33, -0.02], 0.016, 0.003, claw, 4);
      return { root, lift, knee, s, i };
    }));

    let go = 0, gnash = 0;
    const id = this.group.id;
    return (dt, state, moving, t, dead) => {
      const awake = (state === 1 || state === 2) && dead <= 0 ? 1 : 0;
      go += (awake - go) * Math.min(1, dt * (awake ? 5 : 1.5));
      const mv = clamp01(moving / 2.5) * go, ph = this.phase * 9;
      const w = this.wind, st = this.strike;
      gnash += dt * (6 + 10 * mv);
      // asleep it is just a chest; now and then the lid lifts a crack, as if breathing
      const breath = Math.max(0, Math.sin(t * 0.6 + id) - 0.96) * 2.2;
      const chomp = Math.max(0, Math.sin(gnash)) * (0.25 + 0.2 * mv);
      let open = breath * (1 - go) + go * (0.3 + chomp) * (1 - w) + 1.25 * w - 0.9 * st;
      const hop = Math.abs(Math.sin(ph)) * 0.04 * mv;
      rig.position.set(0, 0.22 * go + hop + 0.05 * w, -0.35 * st);
      rig.rotation.set(-0.22 * w + 0.3 * st + Math.sin(ph * 2) * 0.04 * mv, Math.sin(t * 7) * 0.03 * go * (1 - mv), Math.sin(ph) * 0.06 * mv);
      for (const l of legs) {
        const tri = (l.i + (l.s > 0 ? 1 : 0)) % 2 ? Math.PI : 0;
        const step = Math.max(0, Math.sin(ph + tri)) * mv;
        l.root.visible = go > 0.04 || dead > 0;
        l.root.scale.setScalar(0.3 + 0.7 * Math.max(go, dead > 0 ? 1 : 0));
        l.root.rotation.y = l.s * Math.cos(ph + tri) * 0.35 * mv;
        l.lift.rotation.z = l.s * (0.15 * step + (1 - go) * 0.9);
        l.knee.rotation.z = l.s * (-0.15 * step + (1 - go) * 1.4);
      }
      tongue.forEach((p, i) => {
        const lo = go * (0.25 + 0.2 * Math.sin(t * 5 + i)) + 0.5 * w * (i ? 1 : 0);
        p.rotation.set(i === 0 ? -0.3 * go - 0.4 * w : lo * 0.6, Math.sin(t * 3 + i * 0.8 + id) * 0.25 * go, 0);
        p.scale.setScalar(i === 0 ? 0.3 + 0.7 * Math.max(go, dead > 0 ? 1 : 0) : 1);
      });
      if (dead > 0) {
        // the legs give, it drops, the lid falls back and the tongue lolls out
        const k = smooth(dead / 0.5);
        rig.position.set(0, Math.max(0, 0.22 * (1 - k)), 0);
        rig.rotation.set(0, 0, 0.12 * k);
        for (const l of legs) { l.lift.rotation.z = -l.s * 0.6 * k + Math.sin(dead * 25 + l.i) * 0.2 * (1 - k); l.knee.rotation.z = -l.s * 0.5 * k; }
        tongue.forEach((p, i) => { p.rotation.set(i === 0 ? -0.3 : 0.45 * k, 0, 0); });
        open = 0.3 + 1.6 * k;
      }
      lid.rotation.x = Math.max(0, open);
      const lit = dead > 0 ? Math.max(0, 1 - dead * 1.5) : Math.min(1, go + breath * 3);
      for (const e of eyes) { this.glowOp(e, lit * (0.8 + 0.2 * Math.sin(t * 6))); e.scale.setScalar(0.12 + 0.06 * w); }
    };
  }

  /** Puffcap: a toadstool grown into a little man, spotted cap, stubby legs and a gaping face under the gills. It swells and bursts a choking cloud of spores. */
  private puffcap(): Anim {
    const r = seeded(47);
    const capM = this.mat(0xb8402c, { map: hide("cap"), shine: 25, spec: 0x442222 });
    const gillM = this.mat(0xd8c4a0, { map: hide("bark", 6, 1), side: THREE.DoubleSide });
    const stalk = this.mat(0xe0d4b4, { map: hide("flesh") });
    const stalk2 = this.mat(0xb8a888, { map: hide("flesh", 2, 2) });
    const dirt = this.mat(0x6a5038, { map: hide("bark") });
    const wart = this.mat(0xf4ecd8, { e: 0x141008 });
    const dark = this.mat(0x100806);
    const rig = this.piv(this.group, 0, 0, 0);
    // stubby legs ending in root-toes
    const legs = [-1, 1].map((s) => {
      const hip = this.piv(rig, s * 0.1, 0.2, 0);
      this.bone(hip, [0, 0, 0], [s * 0.02, -0.16, 0], 0.075, 0.06, stalk2, 7);
      this.ball(hip, 0.07, dirt, s * 0.02, -0.17, -0.02, 1.1, 0.6, 1.3, 7, 5);
      for (let k = 0; k < 3; k++) this.bone(hip, [s * 0.02 + (k - 1) * 0.04, -0.18, -0.05], [s * 0.02 + (k - 1) * 0.07, -0.2, -0.13], 0.018, 0.004, dirt, 3);
      return hip;
    });
    const body = this.piv(rig, 0, 0.2, 0);
    this.ball(body, 0.2, stalk2, 0, 0.04, 0, 1.1, 0.7, 1.05);
    this.lathe(body, [[0.0, 0.0], [0.2, 0.04], [0.21, 0.18], [0.18, 0.36], [0.15, 0.54], [0.13, 0.62], [0.0, 0.63]], stalk, 12);
    // the ragged ring where the veil tore
    const ring = this.cyl(body, 0.15, 0.22, 0.08, gillM, 0, 0.44, 0, 10, true);
    ring.scale.z = 0.95;
    // a face low on the stalk: deep sockets, a round gaping mouth
    for (const s of [-1, 1]) this.ball(body, 0.035, dark, s * 0.07, 0.3, -0.16, 1, 1.2, 0.6, 6, 5);
    const eyes = [-1, 1].map((s) => this.eye(body, 0xd8ff60, 0.11, s * 0.07, 0.3, -0.19, true));
    const mouth = this.ball(body, 0.05, dark, 0, 0.17, -0.18, 1.1, 1, 0.5, 8, 6);
    // little arms
    const arms = [-1, 1].map((s) => {
      const sh = this.piv(body, s * 0.17, 0.3, 0);
      this.bone(sh, [0, 0, 0], [s * 0.1, -0.16, -0.02], 0.045, 0.03, stalk2, 6);
      this.ball(sh, 0.04, stalk, s * 0.11, -0.18, -0.02, 1, 1, 1, 6, 5);
      for (let k = 0; k < 3; k++) this.bone(sh, [s * 0.11, -0.2, -0.02], [s * (0.1 + (k - 1) * 0.03), -0.26, -0.04], 0.012, 0.004, stalk2, 3);
      return sh;
    });
    // the great cap, gills under it and warts on top
    const cap = this.piv(body, 0, 0.6, 0);
    this.lathe(cap, [[0.13, -0.02], [0.3, 0.02], [0.45, 0.06], [0.47, 0.1], [0.35, 0.2]], gillM, 14);
    this.lathe(cap, [[0.46, 0.06], [0.5, 0.1], [0.47, 0.2], [0.38, 0.3], [0.22, 0.38], [0.0, 0.41]], capM, 14);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU * 2.3 + r(), rr = i === 0 ? 0 : 0.12 + r() * 0.3, y = 0.41 - rr * rr * 1.25;
      const w2 = this.ball(cap, 0.04 + r() * 0.03, wart, Math.cos(a) * rr, y, Math.sin(a) * rr, 1, 0.45, 1, 6, 4);
      w2.rotation.set(Math.sin(a) * rr * 2, 0, -Math.cos(a) * rr * 2);
    }
    const capGlow = this.eye(cap, 0xe0ff70, 0.9, 0, 0.0, 0, true);
    const cloud = this.burst(12, 0xa8c848, 51, { from: [0, 0.8, -0.3], reach: 3.4, spread: 1.6, rise: -0.25, size: 0.5, grow: 2.0, life: 1.4, op: 0.26 });
    const motes = [0, 1, 2].map(() => this.eye(cap, 0xe8ff90, 0.06, 0, 0, 0, true));
    let deathPuff = 0;
    const id = this.group.id;
    return (dt, state, moving, t, dead) => {
      const mv = clamp01(moving / 1.6), ph = this.phase * 7;
      const w = this.wind, st = this.strike;
      const alert = state === 1 || state === 2 ? 1 : 0;
      legs.forEach((hip, i) => { hip.rotation.x = Math.sin(ph + i * Math.PI) * 0.6 * mv; });
      body.position.y = 0.2 + Math.abs(Math.sin(ph)) * 0.035 * mv;
      body.rotation.set(-0.1 * w + 0.35 * st + 0.05 * alert, Math.sin(t * 0.7 + id) * 0.2 * (1 - alert), Math.sin(ph) * 0.12 * mv + Math.sin(t * 1.3 + id) * 0.04);
      // swells up on the wind-up and pumps down on the burst
      const swell = 1 + 0.22 * w - 0.25 * st + Math.sin(t * 2 + id) * 0.02;
      cap.scale.set(swell, 1 + 0.3 * w - 0.35 * st, swell);
      cap.rotation.set(-0.25 * w + 0.35 * st, 0, Math.sin(t * 1.6 + id) * 0.05 + Math.sin(ph) * 0.06 * mv);
      mouth.scale.set(1.1 + 0.4 * w, 1 + 0.9 * w + 0.6 * st, 0.5);
      arms.forEach((sh, i) => { sh.rotation.set(-Math.sin(ph + i * Math.PI) * 0.5 * mv - 1.2 * w + 0.6 * st, 0, (i ? -1 : 1) * (0.3 * w)); });
      cloud(dt, Math.max(st, deathPuff));
      motes.forEach((m, i) => {
        const k = (t * 0.25 + i / 3) % 1;
        const a = i * 2.1 + id;
        m.position.set(Math.cos(a) * 0.3, -0.02 - k * 0.6, Math.sin(a) * 0.3);
        this.glowOp(m, dead > 0 ? 0 : Math.sin(k * Math.PI) * 0.7);
      });
      this.glowOp(capGlow, dead > 0 ? 0 : w * 0.45);
      if (dead > 0) {
        deathPuff = dead < 0.1 ? 1 : 0;
        const k = smooth(dead / 0.7);
        body.scale.set(1 + 0.15 * k, 1 - 0.55 * k, 1 + 0.15 * k);
        body.rotation.set(-0.5 * k, 0, 0.35 * k);
        cap.rotation.set(-0.3 * k, 0, 0.9 * k);
        cap.scale.set(1 + 0.1 * k, 1 - 0.4 * k, 1 + 0.1 * k);
        for (const hip of legs) hip.rotation.x = 0.5 * k;
      }
      for (const e of eyes) this.glowOp(e, dead > 0 ? 1 - dead * 2 : 0.7 + 0.3 * alert);
    };
  }

  /** Giant centipede: a long, low chain of glossy plates on rippling amber legs, with poison claws and feelers. Each plate follows the one ahead, so it snakes round corners. */
  private centipede(): Anim {
    const N = 13, SP = 0.17;
    const shell = this.mat(0x8a3a1c, { map: hide("shell"), shine: 60, spec: 0x664422 });
    const shell2 = this.mat(0x4a2010, { map: hide("chitin") });
    const legM = this.mat(0xd09048, { map: hide("chitin", 1, 3) });
    const fangM = this.mat(0x1a0a06, { shine: 90, spec: 0xaaaaaa });
    const black = this.mat(0x050505, { shine: 120, spec: 0xffffff });
    const segs: { p: THREE.Group; legs: { yaw: THREE.Group; lift: THREE.Group; s: number }[]; sc: number }[] = [];
    for (let i = 0; i < N; i++) {
      const sc = i === 0 ? 1.0 : i > N - 4 ? 1 - (i - (N - 4)) * 0.17 : 1;
      const p = this.piv(this.group, 0, 0.13, i * SP);
      const plate = this.ball(p, 0.115 * sc, i === 0 ? shell2 : shell, 0, 0, 0, 1.25, 0.5, 0.9, 8, 5);
      plate.position.y = 0.01;
      if (i > 0) this.box(p, 0.2 * sc, 0.03, 0.04, shell2, 0, 0.04 * sc, 0.06 * sc);
      const legs = i === 0 ? [] : [-1, 1].map((s) => {
        const yaw = this.piv(p, s * 0.1 * sc, -0.02, 0);
        const lift = this.piv(yaw, 0, 0, 0);
        this.bone(lift, [0, 0, 0], [s * 0.13 * sc, 0.05, 0], 0.016, 0.013, legM, 4);
        this.bone(lift, [s * 0.13 * sc, 0.05, 0], [s * 0.2 * sc, -0.12, 0], 0.013, 0.004, legM, 4);
        return { yaw, lift, s };
      });
      segs.push({ p, legs, sc });
    }
    const head = segs[0].p;
    // feelers, eyes, and the poison claws folded under the head
    const feelers = [-1, 1].map((s) => {
      const a = this.piv(head, s * 0.05, 0.03, -0.09);
      this.bone(a, [0, 0, 0], [s * 0.12, 0.08, -0.18], 0.012, 0.007, legM, 4);
      const b = this.piv(a, s * 0.12, 0.08, -0.18);
      this.bone(b, [0, 0, 0], [s * 0.1, 0.02, -0.2], 0.007, 0.003, legM, 3);
      return { a, b, s };
    });
    for (const s of [-1, 1]) this.ball(head, 0.018, black, s * 0.07, 0.03, -0.07, 1, 1, 1, 5, 4);
    const eyes = [-1, 1].map((s) => this.eye(head, 0xff6020, 0.07, s * 0.07, 0.035, -0.09, true));
    const fangs = [-1, 1].map((s) => {
      const f = this.piv(head, s * 0.06, -0.03, -0.08);
      this.bone(f, [0, 0, 0], [s * 0.04, -0.01, -0.08], 0.02, 0.014, shell, 4);
      this.bone(f, [s * 0.04, -0.01, -0.08], [-s * 0.02, -0.02, -0.14], 0.014, 0.002, fangM, 4);
      return { f, s };
    });
    const tail = segs[N - 1].p;
    for (const s of [-1, 1]) this.bone(tail, [s * 0.03, 0, 0.04], [s * 0.1, 0.05, 0.28], 0.012, 0.003, legM, 3);
    const pts = Array.from({ length: N }, () => new THREE.Vector3(NaN, 0, 0));
    const v = new THREE.Vector3(), q = new THREE.Vector3();
    const locs: THREE.Vector3[] = [];
    const id = this.group.id;
    return (_dt, state, moving, t, dead) => {
      const mv = clamp01(moving / 3), ph = this.phase * 9;
      const w = this.wind, st = this.strike;
      const alert = state === 1 || state === 2 ? 1 : 0;
      const g = this.group;
      g.updateMatrixWorld();
      const sp = SP * g.scale.x;
      v.set(0, 0, 0).applyMatrix4(g.matrixWorld);
      if (Number.isNaN(pts[0].x) || pts[0].distanceTo(v) > 3) for (let i = 0; i < N; i++) pts[i].set(0, 0, i * SP).applyMatrix4(g.matrixWorld);
      pts[0].copy(v);
      // each plate is dragged after the one ahead of it
      for (let i = 1; i < N; i++) {
        q.copy(pts[i]).sub(pts[i - 1]);
        q.y = 0;
        const d = q.length();
        if (d > 1e-4) pts[i].copy(pts[i - 1]).addScaledVector(q, sp / d);
        pts[i].y = pts[i - 1].y;
      }
      for (let i = 0; i < N; i++) { (locs[i] ??= new THREE.Vector3()).copy(pts[i]); g.worldToLocal(locs[i]); }
      const loc = locs;
      for (let i = 0; i < N; i++) {
        const { p, legs, sc } = segs[i];
        const wave = Math.sin(ph * 0.5 - i * 0.6) * 0.05 * mv + Math.sin(t * 1.3 - i * 0.5 + id) * 0.015 * (1 - mv);
        const rear = i < 4 ? (w * [0.32, 0.22, 0.12, 0.04][i] - st * [0.12, 0.06, 0.02, 0][i]) : 0;
        p.position.set(loc[i].x + wave, 0.13 * sc + rear, loc[i].z - (i < 3 ? st * 0.3 * (1 - i * 0.3) : 0));
        const a = i === 0 ? loc[1] : loc[i - 1], b = i === 0 ? loc[0] : loc[i];
        const fx = i === 0 ? b.x - a.x : a.x - b.x, fz = i === 0 ? b.z - a.z : a.z - b.z;
        p.rotation.set(i < 4 ? -w * 0.5 * (1 - i * 0.3) + st * 0.3 : 0, Math.atan2(-fx, -fz), 0);
        legs.forEach((l, k) => {
          const off = ph - i * 0.9 + (k ? Math.PI : 0);
          l.yaw.rotation.y = Math.sin(off) * 0.5 * mv + Math.sin(t * 2 + i) * 0.05;
          l.lift.rotation.z = l.s * (Math.max(0, Math.cos(off)) * 0.5 * mv + (i < 4 ? w * 0.4 : 0));
        });
      }
      head.rotation.x += -0.1 * alert;
      for (const { a, b, s } of feelers) {
        a.rotation.set(Math.sin(t * 5 + s) * 0.2 - 0.3 * w, Math.sin(t * 3.3 + s * 2 + id) * 0.3, 0);
        b.rotation.set(Math.sin(t * 6 + s) * 0.3, 0, 0);
      }
      for (const { f, s } of fangs) f.rotation.y = s * (0.6 * w - 0.5 * st + Math.sin(t * 9) * 0.06 * alert);
      if (dead > 0) {
        // rolls over, one plate after another, legs curling and twitching
        for (let i = 0; i < N; i++) {
          const k = smooth((dead - i * 0.035) / 0.35);
          segs[i].p.rotation.z = Math.PI * k;
          segs[i].p.position.y = 0.13 * segs[i].sc * (1 - 0.3 * k) + Math.sin(k * Math.PI) * 0.06;
          segs[i].legs.forEach((l, j) => { l.lift.rotation.z = l.s * (0.4 + Math.sin(dead * 30 + i + j) * 0.4 * Math.max(0, 1 - dead)); });
        }
      }
      for (const e of eyes) this.glowOp(e, dead > 0 ? 1 - dead * 2 : 0.8 + 0.2 * alert);
    };
  }

  /** Fire beetle: a glossy black-red shell over a belly that glows like a coal, with glowing glands over its eyes and at its tail. It spits embers. */
  private beetle(): Anim {
    const shell = this.mat(0x4a1810, { map: hide("shell"), shine: 90, spec: 0xff9060 });
    const shell2 = this.mat(0x3a140c, { map: hide("shell", 1, 2), shine: 70, spec: 0xaa6040 });
    const legM = this.mat(0x2a1410, { map: hide("chitin", 1, 3), shine: 40 });
    const black = this.mat(0x050505, { shine: 120, spec: 0xffffff });
    const ember = this.glowMat(0xff6a18);
    const ember2 = this.glowMat(0xffc040);
    const seam = this.mat(0x1a0604);
    const rig = this.piv(this.group, 0, 0.27, 0);
    // the glowing belly, ringed by dark plates, showing all round under the shell
    this.ball(rig, 0.28, ember, 0, -0.08, 0.1, 0.95, 0.38, 1.3, 12, 6);
    for (let i = 0; i < 4; i++) this.box(rig, 0.52 - i * 0.06, 0.02, 0.03, seam, 0, -0.11 + i * 0.004, -0.06 + i * 0.12);
    this.ball(rig, 0.25, ember2, 0, 0.0, 0.14, 0.9, 0.55, 1.25, 10, 6);
    // the wing cases: two halves that lift apart to show the fire under them
    const cases = [-1, 1].map((s) => {
      const hinge = this.piv(rig, s * 0.01, 0.06, -0.12);
      const g = new THREE.SphereGeometry(0.3, 10, 8, s > 0 ? Math.PI / 2 : -Math.PI / 2, Math.PI, 0, Math.PI * 0.58);
      const m = this.put(hinge, new THREE.Mesh(g, shell), 0, -0.02, 0.24);
      m.scale.set(0.92, 0.72, 1.3);
      (shell as THREE.Material).side = THREE.DoubleSide;
      this.box(hinge, 0.012, 0.012, 0.66, seam, 0, 0.195, 0.24);
      return { hinge, s };
    });
    const gland = this.ball(rig, 0.05, ember2, 0, 0.0, 0.5, 1, 0.8, 1, 8, 5);
    const tailGlow = this.eye(rig, 0xff8a30, 0.45, 0, 0.0, 0.53, true);
    // the shield behind the head
    this.ball(rig, 0.17, shell2, 0, 0.05, -0.2, 1.35, 0.6, 1.0, 10, 6);
    const head = this.piv(rig, 0, 0.0, -0.34);
    this.ball(head, 0.11, shell2, 0, 0, 0, 1.1, 0.72, 1, 10, 6);
    const glands: THREE.Sprite[] = [];
    for (const s of [-1, 1]) {
      this.ball(head, 0.035, black, s * 0.09, 0.0, -0.05, 1, 1, 1, 6, 5);
      this.ball(head, 0.03, ember2, s * 0.055, 0.06, -0.06, 1, 0.8, 1, 6, 4);
      glands.push(this.eye(head, 0xffa030, 0.15, s * 0.055, 0.07, -0.08, true));
    }
    const jaws = [-1, 1].map((s) => {
      const j = this.piv(head, s * 0.05, -0.03, -0.08);
      this.bone(j, [0, 0, 0], [s * 0.06, 0, -0.08], 0.025, 0.018, shell2, 5);
      this.bone(j, [s * 0.06, 0, -0.08], [-s * 0.01, 0, -0.15], 0.018, 0.003, black, 4);
      return { j, s };
    });
    const feelers = [-1, 1].map((s) => {
      const a = this.piv(head, s * 0.07, 0.03, -0.07);
      this.bone(a, [0, 0, 0], [s * 0.12, 0.1, -0.08], 0.01, 0.008, legM, 4);
      for (let k = 0; k < 3; k++) this.ball(a, 0.018 - k * 0.002, legM, s * (0.12 + k * 0.025), 0.1 + k * 0.012, -0.08 - k * 0.015, 1, 1, 1, 5, 4);
      return a;
    });
    const spit = this.eye(head, 0xffb040, 0.2, 0, -0.03, -0.2, true);
    const embers = this.burst(7, 0xff8a28, 53, { from: [0, 0.25, -0.55], reach: 3.2, spread: 0.5, rise: 0.15, size: 0.14, grow: 0.3, life: 0.5, op: 1 });
    const legs: { yaw: THREE.Group; lift: THREE.Group; knee: THREE.Group; s: number; i: number; a: number }[] = [];
    const yaws = [0.6, 0, -0.55], hz = [-0.18, -0.06, 0.06];
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
      const a = s > 0 ? yaws[i] : Math.PI - yaws[i];
      const yaw = this.piv(rig, s * 0.12, -0.06, hz[i]);
      yaw.rotation.y = a;
      const lift = this.piv(yaw, 0, 0, 0);
      this.bone(lift, [0, 0, 0], [0.18, 0, 0], 0.04, 0.032, legM, 5);
      const knee = this.piv(lift, 0.18, 0, 0);
      this.ball(knee, 0.03, legM, 0, 0, 0, 1, 1, 1, 5, 4);
      this.bone(knee, [0, 0, 0], [0.2, 0, 0], 0.03, 0.014, legM, 5);
      for (let k = 0; k < 3; k++) this.cone(knee, 0.008, 0.03, legM, 0.06 + k * 0.06, 0.012, 0, 3).rotation.z = -0.5;
      legs.push({ yaw, lift, knee, s, i, a });
    }
    const pool = this.eye(rig, 0xff5010, 1.2, 0, -0.24, 0.1, true);
    const id = this.group.id;
    return (dt, state, moving, t, dead) => {
      const mv = clamp01(moving / 2), ph = this.phase * 8;
      const w = this.wind, st = this.strike;
      const alert = state === 1 || state === 2 ? 1 : 0;
      const alive = dead <= 0 ? 1 : 0;
      for (const l of legs) {
        const off = (l.i + (l.s > 0 ? 0 : 1)) % 2 ? Math.PI : 0;
        const swing = Math.sin(ph + off) * mv;
        const step = Math.max(0, Math.cos(ph + off)) * 0.35 * mv;
        l.yaw.rotation.y = l.a + l.s * swing * 0.35;
        l.lift.rotation.z = 0.35 + step + 0.15 * w;
        l.knee.rotation.z = -1.55 + step * 0.4;
      }
      rig.position.set(0, 0.27 + Math.abs(Math.sin(ph)) * 0.015 * mv + 0.04 * w, -0.15 * st);
      rig.rotation.set(0.12 * w - 0.12 * st + Math.sin(ph * 2) * 0.02 * mv, 0, Math.sin(ph) * 0.03 * mv);
      head.rotation.set(-0.1 * alert + 0.25 * w - 0.4 * st, Math.sin(t * 0.8 + id) * 0.2 * (1 - alert), 0);
      for (const { j, s } of jaws) j.rotation.y = s * (0.15 + 0.5 * w - 0.3 * st + Math.sin(t * 8) * 0.08 * alert);
      feelers.forEach((a, i) => a.rotation.set(Math.sin(t * 4 + i) * 0.2, Math.sin(t * 2.6 + i * 2 + id) * 0.3, 0));
      // the wing cases part a little on the wind-up, and the fire under them flares
      for (const { hinge, s } of cases) hinge.rotation.set(-0.25 * w, 0, -s * (0.25 * w + Math.max(0, Math.sin(t * 0.5 + id) - 0.9) * 2));
      embers(dt, st);
      let heat = 0.75 + 0.15 * Math.sin(t * 2.4 + id) + 0.1 * Math.sin(t * 7.1) + 0.5 * w;
      if (dead > 0) {
        const k = smooth(dead / 0.45);
        heat *= Math.max(0, 1 - dead * 0.8);
        rig.rotation.z = Math.PI * k;
        rig.position.y = 0.27 + Math.sin(k * Math.PI) * 0.2 - 0.02 * k;
        for (const l of legs) { l.lift.rotation.z = 0.35 + 0.9 * k + Math.sin(dead * 28 + l.i) * 0.25 * Math.max(0, 1 - dead); l.knee.rotation.z = -1.55 - 0.8 * k; }
      }
      ember.color.setRGB(Math.min(1, heat), 0.42 * heat, 0.1 * heat);
      ember2.color.setRGB(Math.min(1, heat * 1.1), Math.min(1, 0.75 * heat), 0.25 * heat);
      for (const g2 of glands) this.glowOp(g2, 0.55 * heat);
      this.glowOp(tailGlow, 0.5 * heat);
      gland.scale.setScalar(0.9 + 0.2 * heat);
      this.glowOp(pool, 0.22 * heat * (alive ? 1 : 1 - smooth(dead)));
      spit.scale.setScalar(0.1 + 0.35 * w + 0.3 * st);
      this.glowOp(spit, alive * (w * 0.9 + st));
    };
  }

  /** Drowned miner: bloated and blue-green from the flooded levels, shirt burst over a swollen belly, weed trailing from him, water dripping and pooling where he stands. */
  private drowned(): Anim {
    const r = seeded(59);
    const skin = this.mat(0x93ab9a, { map: hide("flesh"), shine: 30, spec: 0x2a3a3a });
    const skin2 = this.mat(0x6e8a80, { map: hide("flesh", 2, 2), shine: 30, spec: 0x2a3a3a });
    const rag = this.mat(0x5a5e50, { map: hide("rag"), side: THREE.DoubleSide, shine: 20, spec: 0x222222 });
    const rag2 = this.mat(0x3e4440, { map: hide("rag", 1, 2), side: THREE.DoubleSide });
    const weed = this.mat(0x5f8a2c, { map: hide("weed"), side: THREE.DoubleSide, shine: 40, spec: 0x334422 });
    const weed2 = this.mat(0x7e9030, { map: hide("weed", 1, 2), side: THREE.DoubleSide });
    const boot = this.mat(0x2a2620, { map: hide("leather") });
    const rope = this.mat(0x8a7a4c, { map: hide("bark", 1, 3) });
    const stoneM = this.mat(0x9a9484, { map: hide("oolite"), flat: true });
    const white = this.mat(0xdde8e0, { shine: 60, e: 0x101814 });
    const dark = this.mat(0x060808);
    const water = this.mat(0x9ec4d0, { shine: 120, spec: 0xffffff, opacity: 0.7, e: 0x0a1418 });
    const puddleM = this.mat(0x1a2a30, { shine: 120, spec: 0x99bbcc, opacity: 0.55 });
    const puddle = this.put(this.group, new THREE.Mesh(new THREE.CircleGeometry(0.6, 14), puddleM), 0, 0.012, 0.05);
    puddle.rotation.x = -Math.PI / 2;

    const rig = this.piv(this.group, 0, 0.92, 0);
    const legs = [-1, 1].map((s) => {
      const hip = this.piv(rig, s * 0.15, 0, 0);
      this.bone(hip, [0, 0, 0], [0, -0.44, 0], 0.13, 0.1, rag2, 7);
      const knee = this.piv(hip, 0, -0.44, 0);
      this.bone(knee, [0, 0, 0], [0, -0.4, 0], 0.1, 0.08, s < 0 ? rag2 : skin2, 7);
      if (s < 0) this.box(knee, 0.17, 0.12, 0.28, boot, 0, -0.42, -0.04);
      else {
        this.ball(knee, 0.09, skin, 0, -0.43, -0.05, 1, 0.6, 1.5, 7, 5);
        for (let k = 0; k < 4; k++) this.ball(knee, 0.025, skin2, (k - 1.5) * 0.035, -0.45, -0.17, 1, 0.8, 1, 5, 4);
      }
      return { hip, knee };
    });
    this.ball(rig, 0.28, rag2, 0, 0.04, 0, 1.2, 0.65, 0.95);
    const torso = this.piv(rig, 0, 0.08, 0);
    // a belly swollen tight, the shirt burst open over it
    const belly = this.ball(torso, 0.36, skin, 0, 0.24, -0.06, 1.05, 1.0, 1.08, 11, 8);
    this.ball(torso, 0.3, skin, 0, 0.58, 0.02, 1.3, 0.85, 0.95);
    for (const s of [-1, 1]) {
      this.ball(torso, 0.17, skin2, s * 0.32, 0.68, 0.03, 1, 0.9, 1);
      const flap = this.box(torso, 0.2, 0.6, 0.03, rag, s * 0.27, 0.42, -0.3);
      flap.rotation.set(0.2, s * 0.6, s * 0.08);
      this.box(torso, 0.22, 0.65, 0.3, rag, s * 0.3, 0.45, 0.06).rotation.z = s * 0.1;
    }
    this.box(torso, 0.6, 0.55, 0.05, rag, 0, 0.5, 0.3).rotation.x = -0.1;
    for (let i = 0; i < 5; i++) this.box(torso, 0.06, 0.15 + r() * 0.15, 0.01, rag, -0.24 + i * 0.12, -0.02, 0.28).rotation.z = r() - 0.5;
    // a rope round his middle and the stone that took him down, still tied on
    const belt = this.put(torso, new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.022, 4, 14), rope), 0, 0.08, -0.03);
    belt.rotation.x = Math.PI / 2;
    belt.scale.set(1.05, 1.06, 1);
    const tie = this.piv(torso, 0.2, 0.06, -0.3);
    this.bone(tie, [0, 0, 0], [0, -0.42, 0], 0.016, 0.016, rope, 4);
    this.rock(tie, 0.11, stoneM, 0, -0.5, 0, r);
    // weed hanging off him
    const strands: { p: THREE.Group; ph: number }[] = [];
    const strand = (parent: THREE.Object3D, x: number, y: number, z: number, len: number, wd = 0.07) => {
      const p = this.piv(parent, x, y, z);
      this.box(p, wd, len, 0.006, strands.length % 2 ? weed : weed2, 0, -len / 2, 0).rotation.y = r() * 3;
      strands.push({ p, ph: r() * TAU });
    };
    for (const s of [-1, 1]) { strand(torso, s * 0.36, 0.82, 0.0, 0.5); strand(torso, s * 0.25, 0.8, 0.15, 0.4); strand(torso, s * 0.2, 0.75, -0.2, 0.35, 0.04); }
    strand(torso, 0.05, 0.1, -0.38, 0.35, 0.04);

    const head = this.piv(torso, 0, 0.84, -0.06);
    this.ball(head, 0.16, skin, 0, 0.04, -0.02, 1.05, 1.0, 1.0);
    this.ball(head, 0.1, skin2, 0, -0.04, -0.08, 1.3, 0.8, 1.0, 8, 6);
    for (const s of [-1, 1]) {
      this.ball(head, 0.04, white, s * 0.06, 0.06, -0.14, 1, 0.85, 0.7, 7, 5);
      this.ball(head, 0.045, skin2, s * 0.065, 0.1, -0.13, 1.2, 0.5, 0.8, 6, 4);
    }
    const eyes = [-1, 1].map((s) => this.eye(head, 0xa8fff0, 0.12, s * 0.06, 0.06, -0.17, true));
    const jaw = this.piv(head, 0, -0.06, -0.06);
    this.ball(jaw, 0.06, dark, 0, 0.0, -0.08, 1.1, 0.8, 0.6, 7, 5);
    this.box(jaw, 0.15, 0.05, 0.12, skin2, 0, -0.05, -0.06);
    // lank hair and weed draped over his head
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * 0.15 + (i / 6) * Math.PI * 0.7;
      const x = Math.cos(a) * 0.15, z = Math.sin(a) * 0.1 + 0.02;
      const l = 0.2 + r() * 0.12;
      const h = this.box(head, 0.035, l, 0.008, i % 2 ? weed : rag2, x, 0.14 - l / 2, z);
      h.rotation.set(-0.15, -a + Math.PI / 2, x * 1.2);
    }
    this.ball(head, 0.155, rag2, 0, 0.1, 0.02, 1.05, 0.55, 1.0, 9, 5);

    const arms = [-1, 1].map((s) => {
      const sh = this.piv(torso, s * 0.4, 0.68, 0.02);
      this.ball(sh, 0.13, skin, 0, 0, 0, 1, 1, 1, 8, 6);
      this.bone(sh, [0, 0, 0], [0, -0.38, 0], 0.11, 0.1, rag, 7);
      const el = this.piv(sh, 0, -0.38, 0);
      this.ball(el, 0.09, skin2, 0, 0, 0, 1, 1, 1, 7, 5);
      this.bone(el, [0, 0, 0], [0, -0.34, 0], 0.1, 0.085, skin, 7);
      const hand = this.piv(el, 0, -0.38, 0);
      this.ball(hand, 0.09, skin, 0, 0, 0, 1, 1.15, 0.85, 8, 6);
      for (let f = 0; f < 4; f++) this.bone(hand, [(f - 1.5) * 0.04, -0.06, -0.01], [(f - 1.5) * 0.05, -0.15, -0.04], 0.025, 0.018, skin2, 5);
      strand(el, s * 0.08, -0.05, 0.03, 0.35, 0.04);
      return { sh, el, hand };
    });
    // drops falling off him, over and over
    const drips = [[0.43, 0.4, -0.3], [-0.43, 0.4, -0.3], [0.0, 1.55, -0.24], [0.25, 0.6, 0.25], [-0.3, 0.8, 0.1]].map(([x, y, z], i) => ({
      m: this.ball(this.group, 0.022, water, x, y, z, 1, 1.6, 1, 5, 4), y0: y, ph: i * 0.37,
    }));
    const id = this.group.id;
    return (_dt, state, moving, t, dead) => {
      const mv = clamp01(moving / 1.4), ph = this.phase * 3.0;
      const w = this.wind, st = this.strike;
      const alert = state === 1 || state === 2 ? 1 : 0;
      // a heavy shamble, dragging the bare foot
      legs.forEach(({ hip, knee }, i) => {
        const s = Math.sin(ph + i * Math.PI);
        hip.rotation.x = 0.05 + s * (i ? 0.25 : 0.45) * mv;
        knee.rotation.x = -0.15 - Math.max(0, Math.cos(ph + i * Math.PI)) * (i ? 0.2 : 0.6) * mv;
      });
      rig.position.y = 0.92 - Math.abs(Math.cos(ph)) * 0.05 * mv;
      rig.rotation.z = Math.sin(ph) * 0.09 * mv;
      torso.rotation.set(-0.15 - 0.1 * alert - 0.3 * w + 0.6 * st + Math.sin(t * 0.9 + id) * 0.03, Math.sin(ph) * 0.1 * mv, Math.sin(ph) * 0.06 * mv + Math.sin(t * 0.5 + id) * 0.05);
      belly.scale.set(1.05 + Math.sin(t * 1.2 + id) * 0.02, 1.0, 1.08 + Math.sin(t * 1.2 + id) * 0.02);
      head.rotation.set(0.2 + 0.2 * w - 0.2 * st, Math.sin(t * 0.4 + id) * 0.25 * (1 - alert), 0.25 + Math.sin(t * 0.7 + id) * 0.08);
      jaw.rotation.x = 0.35 + 0.15 * alert + 0.3 * w + Math.sin(t * 2.1) * 0.05;
      // both arms out reaching; on the wind-up they go up together, then come down like hammers
      arms.forEach(({ sh, el, hand }, i) => {
        const s = i ? 1 : -1;
        const reach = 0.5 + 0.8 * alert + Math.sin(ph + i * Math.PI) * 0.2 * mv;
        sh.rotation.x = reach * (1 - w) + 3.0 * w - st * 2.2;
        sh.rotation.z = s * (0.18 + 0.1 * w);
        el.rotation.x = 0.35 + 0.2 * w;
        hand.rotation.x = 0.3;
      });
      strands.forEach(({ p, ph: q }) => { p.rotation.set(Math.sin(t * 1.4 + q) * 0.12 - mv * 0.3, 0, Math.sin(t * 1.1 + q) * 0.12); });
      if (dead > 0) {
        // he topples back like a felled sack
        const k1 = smooth(dead / 0.5), k2 = smooth((dead - 0.2) / 0.7);
        legs.forEach(({ hip, knee }) => { hip.rotation.x = -0.5 * k2; knee.rotation.x = -0.4 * k1; });
        rig.position.y = 0.92 - 0.12 * k1 - 0.55 * k2;
        rig.rotation.x = 1.45 * k2;
        arms.forEach(({ sh, el }, i) => { sh.rotation.x = 0.6 * (1 - k2) - 0.4 * k2; sh.rotation.z = (i ? 1 : -1) * (0.18 + 0.9 * k2); el.rotation.x = 0.35 + 0.4 * k2; });
        head.rotation.x = 0.2 - 0.5 * k2;
      } else rig.rotation.x = 0;
      for (const d of drips) {
        const k = ((t * 0.9 + d.ph + id * 0.1) % 1);
        const y = d.y0 - 4.9 * (k * 0.55) * (k * 0.55);
        d.m.position.y = Math.max(0.02, y);
        d.m.visible = y > 0.02 && dead <= 0;
      }
      puddle.scale.setScalar(1 + Math.sin(t * 1.5 + id) * 0.03 + (dead > 0 ? smooth(dead) * 0.5 : 0));
      for (const e of eyes) this.glowOp(e, dead > 0 ? 1 - dead * 1.2 : 0.7 + 0.3 * alert);
    };
  }

  /** Frost wight: a dead miner frozen hard in the deep cold, rimed white, icicles hanging off every rag and ice crystals bursting from his shoulders. It breathes out a killing rime, and shatters when it falls. */
  private wight(): Anim {
    const r = seeded(61);
    const skin = this.mat(0x88a8c8, { map: hide("ice"), shine: 60, spec: 0x99ccff, e: 0x08141c });
    const skin2 = this.mat(0x7890a8, { map: hide("flesh"), shine: 40, spec: 0x6688aa, e: 0x060c14 });
    const rag = this.mat(0x5a6a7c, { map: hide("rag"), side: THREE.DoubleSide, shine: 30, spec: 0x6688aa });
    const rag2 = this.mat(0x46505e, { map: hide("rag", 1, 2), side: THREE.DoubleSide });
    const iceM = this.mat(0xd8f0ff, { shine: 120, spec: 0xffffff, opacity: 0.82, e: 0x203a50, flat: true });
    const rime = this.mat(0xeef8ff, { map: hide("ice"), e: 0x1a2a38 });
    const dark = this.mat(0x02060a);
    const frost = this.glowMat(0xa0e0ff);
    const breathM = this.glowMat(0xc8eeff, 0.0, true);
    const shard = (p: THREE.Object3D, x: number, y: number, z: number, len: number, rad: number, rx: number, rz: number) => {
      const c = this.cone(p, rad, len, iceM, x, y, z, 4);
      c.rotation.set(rx, r() * 3, rz);
      c.translateY(len * 0.4);
      return c;
    };
    const icicles = (p: THREE.Object3D, x0: number, x1: number, y: number, z: number, n: number, len: number) => {
      for (let i = 0; i < n; i++) {
        const l = len * (0.5 + r() * 0.8);
        const c = this.cone(p, 0.018 + r() * 0.01, l, iceM, x0 + (x1 - x0) * (i / Math.max(1, n - 1)), y - l / 2, z, 4);
        c.rotation.x = Math.PI;
      }
    };
    const rig = this.piv(this.group, 0, 0.98, 0);
    const legs = [-1, 1].map((s) => {
      const hip = this.piv(rig, s * 0.12, 0, 0);
      this.bone(hip, [0, 0, 0], [0, -0.46, 0], 0.08, 0.06, rag2);
      icicles(hip, -0.06, 0.06, -0.42, -0.06, 3, 0.12);
      const knee = this.piv(hip, 0, -0.46, 0);
      this.bone(knee, [0, 0.02, 0], [0, -0.42, 0], 0.05, 0.04, skin);
      this.box(knee, 0.12, 0.08, 0.22, rime, 0, -0.44, -0.04);
      return { hip, knee };
    });
    this.box(rig, 0.34, 0.16, 0.22, rag2, 0, 0.02, 0);
    const torso = this.piv(rig, 0, 0.06, 0);
    this.ball(torso, 0.21, skin, 0, 0.36, 0, 0.9, 1.3, 0.65);
    for (let k = 0; k < 4; k++) this.box(torso, 0.26 - k * 0.02, 0.024, 0.03, rime, 0, 0.24 + k * 0.08, -0.125);
    for (const s of [-1, 1]) this.box(torso, 0.1, 0.48, 0.25, rag, s * 0.16, 0.34, 0.01);
    // a stiff frozen cloak, hem hung with icicles
    const cloak = this.piv(torso, 0, 0.6, 0.06);
    const cg = new THREE.CylinderGeometry(0.26, 0.42, 1.1, 10, 1, true, -1.5, 3.0);
    cg.translate(0, -0.55, 0);
    this.put(cloak, new THREE.Mesh(cg, rag), 0, 0, 0);
    for (let i = 0; i < 9; i++) {
      const a = -1.5 + (i / 8) * 3.0;
      const l = 0.12 + r() * 0.16;
      const c = this.cone(cloak, 0.022, l, iceM, Math.sin(a) * 0.41, -1.1 - l / 2, Math.cos(a) * 0.41, 4);
      c.rotation.x = Math.PI;
    }
    // ice crystals bursting from the shoulders and back
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) shard(torso, s * (0.17 + k * 0.04), 0.62, 0.02 + k * 0.05, 0.22 + r() * 0.16, 0.04, -0.2 + k * 0.3, -s * (0.5 + k * 0.25));
    for (let k = 0; k < 4; k++) shard(torso, (r() - 0.5) * 0.12, 0.25 + k * 0.12, 0.13, 0.14 + r() * 0.1, 0.03, 1.1 + r() * 0.3, (r() - 0.5) * 0.6);
    this.bone(torso, [0, 0.55, 0], [0, 0.66, -0.06], 0.05, 0.045, skin);

    const head = this.piv(torso, 0, 0.68, -0.07);
    this.ball(head, 0.12, skin, 0, 0.05, -0.01, 0.88, 1.12, 1.0);
    this.box(head, 0.2, 0.035, 0.07, rime, 0, 0.09, -0.09);
    for (const s of [-1, 1]) {
      this.ball(head, 0.035, dark, s * 0.043, 0.05, -0.1, 1, 1, 0.8, 6, 5);
      this.ball(head, 0.022, skin2, s * 0.07, 0.0, -0.095, 1, 1, 1, 5, 4);
    }
    const eyes = [-1, 1].map((s) => this.eye(head, 0x90dcff, 0.14, s * 0.043, 0.05, -0.13, true));
    // hair frozen back in spikes
    for (let i = 0; i < 7; i++) {
      const a = (i / 6 - 0.5) * 2.2;
      const c = this.cone(head, 0.03, 0.2 + r() * 0.1, rime, Math.sin(a) * 0.08, 0.13, 0.04 + Math.cos(a) * 0.03, 4);
      c.rotation.set(-1.1 - r() * 0.3, 0, -Math.sin(a) * 0.6);
    }
    const jaw = this.piv(head, 0, -0.02, -0.03);
    this.box(jaw, 0.11, 0.035, 0.1, skin, 0, -0.03, -0.05);
    this.box(jaw, 0.09, 0.02, 0.012, rime, 0, -0.01, -0.1);
    icicles(jaw, -0.04, 0.04, -0.045, -0.08, 4, 0.12);
    const mouthGlow = this.ball(jaw, 0.03, frost, 0, 0.0, -0.085, 1.4, 0.8, 0.6, 6, 4);
    const breathGlow = this.eye(head, 0xc0ecff, 0.3, 0, -0.03, -0.2, true);
    const bg = new THREE.ConeGeometry(0.55, 2.6, 10, 1, true);
    bg.rotateX(Math.PI / 2);
    bg.translate(0, 0, -1.3);
    const breath = this.put(head, new THREE.Mesh(bg, breathM), 0, -0.03, -0.12);
    breath.scale.setScalar(0.01);
    breath.visible = false;
    const mist = this.burst(9, 0xd8f4ff, 63, { from: [0, 1.62, -0.35], reach: 3.2, spread: 0.8, rise: 0.0, size: 0.35, grow: 2.2, life: 0.9, op: 0.5 });

    const arms = [-1, 1].map((s) => {
      const sh = this.piv(torso, s * 0.2, 0.54, 0);
      this.ball(sh, 0.055, skin);
      this.bone(sh, [0, 0, 0], [0, -0.38, 0], 0.05, 0.038, rag);
      icicles(sh, -0.03, 0.03, -0.34, 0.03, 2, 0.1);
      const el = this.piv(sh, 0, -0.38, 0);
      this.bone(el, [0, 0, 0], [0, -0.36, 0], 0.038, 0.032, skin);
      icicles(el, -0.025, 0.025, -0.3, 0.02, 2, 0.12);
      const hand = this.piv(el, 0, -0.37, 0);
      this.box(hand, 0.075, 0.085, 0.04, skin, 0, -0.03, 0);
      for (let f = 0; f < 3; f++) {
        const x = (f - 1) * 0.026;
        this.bone(hand, [x, -0.06, 0], [x * 1.4, -0.17, -0.04], 0.013, 0.008, skin2, 4);
        this.bone(hand, [x * 1.4, -0.17, -0.04], [x * 1.5, -0.25, -0.09], 0.008, 0.002, iceM, 4);
      }
      return { sh, el, hand };
    });
    const fall = this.shatter(67, (m) => m !== breath);
    const id = this.group.id;
    return (dt, state, moving, t, dead) => {
      const mv = clamp01(moving / 2), ph = this.phase * 3.8;
      const w = this.wind, st = this.strike;
      const alert = state === 1 || state === 2 ? 1 : 0;
      mist(dt, st);
      breath.visible = st > 0.02 && dead <= 0;
      breath.scale.set(0.4 + 0.6 * (1 - st), 0.4 + 0.6 * (1 - st), 0.3 + 0.7 * (1 - st * st));
      breathM.opacity = 0.32 * st * this.fade;
      if (dead > 0) {
        fall(dead);
        const k = Math.max(0, 1 - dead * 1.6);
        for (const e of eyes) this.glowOp(e, k);
        this.glowOp(breathGlow, 0);
        frost.color.setScalar(k);
        return;
      }
      // a stiff, creaking walk: little knee, a lot of hip
      legs.forEach(({ hip, knee }, i) => {
        const s = Math.sin(ph + i * Math.PI);
        hip.rotation.x = 0.05 + s * 0.4 * mv;
        knee.rotation.x = -0.12 - Math.max(0, Math.cos(ph + i * Math.PI)) * 0.4 * mv;
      });
      rig.position.y = 0.98 - Math.abs(Math.cos(ph)) * 0.04 * mv;
      torso.rotation.set(-0.22 - 0.06 * alert - 0.3 * w + 0.45 * st + Math.sin(t * 1.1 + id) * 0.02, Math.sin(ph) * 0.1 * mv, Math.sin(ph) * 0.05 * mv);
      torso.scale.set(1 + 0.06 * w, 1, 1 + 0.1 * w);
      cloak.rotation.x = -0.05 - 0.15 * mv + Math.sin(t * 0.8 + id) * 0.02;
      const shiver = Math.sin(t * 0.37 + id) > 0.95 ? Math.sin(t * 40) * 0.04 : 0;
      head.rotation.set(0.25 - 0.55 * w + 0.5 * st, Math.sin(t * 0.5 + id) * 0.3 * (1 - alert) + shiver, Math.sin(t * 0.6 + id) * 0.06);
      jaw.rotation.x = 0.1 + 0.1 * alert + 0.6 * w + 0.4 * st;
      arms.forEach(({ sh, el, hand }, i) => {
        const s = i ? 1 : -1;
        const sway = -Math.sin(ph + i * Math.PI) * 0.35 * mv;
        sh.rotation.x = (0.3 + 0.5 * alert + sway) * (1 - w) + 0.6 * w - 0.3 * st;
        sh.rotation.z = s * (0.12 + 0.75 * w - 0.5 * st);
        el.rotation.x = 0.3 + 0.3 * alert + 0.4 * w;
        hand.rotation.x = 0.3 + 0.4 * w;
      });
      const glow = 0.5 + 0.2 * Math.sin(t * 2 + id) + 0.8 * w + st;
      frost.color.setRGB(0.63 * Math.min(1, glow), 0.88 * Math.min(1, glow), Math.min(1, glow));
      this.glowOp(breathGlow, w * 0.9 + st * 0.6);
      breathGlow.scale.setScalar(0.15 + 0.35 * w + 0.4 * st);
      mouthGlow.visible = w + st > 0.05;
      for (const e of eyes) this.glowOp(e, 0.75 + 0.25 * alert + 0.3 * w);
    };
  }

  /** Wraith: a hooded shroud with nothing in it but cold, drifting a foot off the floor, rags streaming, bone fingers reaching from its sleeves. */
  private wraith(): Anim {
    const r = seeded(71);
    const shroud = this.mat(0x3c4450, { map: hide("rag"), side: THREE.DoubleSide, opacity: 0.8, e: 0x060a10 });
    const shroud2 = this.mat(0x2a2e36, { map: hide("rag", 1, 2), side: THREE.DoubleSide, opacity: 0.62, e: 0x04060a });
    const boneM = this.mat(0xc0ccd4, { map: hide("bone"), opacity: 0.88, e: 0x101a24 });
    const voidM = this.mat(0x000000);
    const inner = this.glowMat(0x5a80b0, 0.14, true);
    const rig = this.piv(this.group, 0, 0, 0);
    // the robe hangs from narrow shoulders and flares to a ragged hem
    this.lathe(rig, [[0.1, 0.42], [0.22, 0.36], [0.27, 0.2], [0.28, 0.0], [0.31, -0.25], [0.36, -0.5]], shroud, 12);
    this.lathe(rig, [[0.05, 0.3], [0.2, 0.2], [0.24, 0.0], [0.27, -0.3], [0.3, -0.48]], inner, 10);
    const coreGlow = this.eye(rig, 0x6090ff, 1.3, 0, -0.05, 0, true);
    const strips: { a: THREE.Group; b: THREE.Group; ph: number; ang: number }[] = [];
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * TAU + r() * 0.2;
      const a = this.piv(rig, Math.sin(ang) * 0.33, -0.48, Math.cos(ang) * 0.33);
      a.rotation.order = "YXZ";
      const l1 = 0.28 + r() * 0.15, l2 = 0.2 + r() * 0.15;
      this.box(a, 0.13, l1, 0.006, i % 2 ? shroud : shroud2, 0, -l1 / 2, 0);
      const b = this.piv(a, 0, -l1, 0);
      this.box(b, 0.1, l2, 0.006, shroud2, 0, -l2 / 2, 0);
      const tipM = this.cone(b, 0.05, 0.12, shroud2, 0, -l2 - 0.05, 0, 3);
      tipM.rotation.x = Math.PI;
      tipM.scale.z = 0.1;
      strips.push({ a, b, ph: r() * TAU, ang });
    }
    // the hood: a deep cowl, black inside, with two cold points of light
    const head = this.piv(rig, 0, 0.5, -0.02);
    this.ball(head, 0.19, shroud, 0, 0.02, 0.02, 1.0, 1.15, 1.1, 10, 8);
    const peak = this.cone(head, 0.1, 0.22, shroud, 0, 0.16, 0.12, 6);
    peak.rotation.x = 0.9;
    this.ball(head, 0.13, voidM, 0, -0.01, -0.12, 0.95, 1.15, 0.6, 9, 6);
    const rimT = this.put(head, new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.035, 5, 12), shroud), 0, -0.01, -0.15);
    rimT.scale.set(0.95, 1.2, 1);
    const eyes = [-1, 1].map((s) => this.eye(head, 0xbfeaff, 0.13, s * 0.045, 0.02, -0.2, true));
    const cores = [-1, 1].map((s) => this.eye(head, 0xffffff, 0.04, s * 0.045, 0.02, -0.21, true));
    // drooping sleeves and long bone fingers
    const arms = [-1, 1].map((s) => {
      const sh = this.piv(rig, s * 0.24, 0.34, 0);
      this.bone(sh, [0, 0, 0], [0, -0.3, 0], 0.07, 0.09, shroud, 7);
      const el = this.piv(sh, 0, -0.3, 0);
      this.cyl(el, 0.09, 0.15, 0.28, shroud, 0, -0.14, 0, 8, true);
      for (let k = 0; k < 3; k++) {
        const c = this.cone(el, 0.04, 0.18, shroud2, (k - 1) * 0.07, -0.34, 0.03 * k, 3);
        c.rotation.x = Math.PI;
        c.scale.z = 0.2;
      }
      const hand = this.piv(el, 0, -0.24, 0);
      this.bone(hand, [0, 0.05, 0], [0, -0.06, 0], 0.02, 0.025, boneM, 5);
      for (let f = 0; f < 4; f++) {
        const x = (f - 1.5) * 0.025;
        this.bone(hand, [x, -0.06, 0], [x * 1.5, -0.2, -0.04], 0.009, 0.007, boneM, 4);
        this.bone(hand, [x * 1.5, -0.2, -0.04], [x * 1.7, -0.3, -0.1], 0.007, 0.002, boneM, 4);
      }
      return { sh, el, hand, s };
    });
    const id = this.group.id;
    return (_dt, state, moving, t, dead) => {
      const mv = clamp01(moving / 2.5);
      const w = this.wind, st = this.strike;
      const alert = state === 1 || state === 2 ? 1 : 0;
      const k = smooth(dead / 1.2);
      rig.position.set(Math.sin(t * 0.7 + id) * 0.03, Math.sin(t * 1.3 + id) * 0.05 + 0.18 * w - 0.1 * st + 0.9 * k, -0.4 * st);
      rig.rotation.set(-0.25 * mv - 0.15 * w + 0.45 * st, k * 3 + Math.sin(t * 0.5 + id) * 0.08, Math.sin(t * 0.9 + id) * 0.05);
      rig.scale.set(1 + 0.6 * k, 1 + 0.3 * k, 1 + 0.6 * k);
      strips.forEach(({ a, b, ph, ang }) => {
        const flut = Math.sin(t * 3.5 + ph) * (0.25 + 0.3 * mv + 0.8 * k);
        a.rotation.set(-(0.12 + 0.3 * w + flut * 0.4 + 0.8 * k), ang, 0);
        b.rotation.set(-Math.sin(t * 4.2 + ph) * (0.35 + 0.8 * k) - 0.1, 0, 0);
      });
      head.rotation.set(0.15 + 0.1 * alert - 0.35 * w + 0.4 * st, Math.sin(t * 0.4 + id) * 0.35 * (1 - alert), Math.sin(t * 0.6 + id) * 0.08);
      for (const { sh, el, hand, s } of arms) {
        const drift = Math.sin(t * 1.1 + s) * 0.1;
        sh.rotation.x = (0.3 + 0.7 * alert + drift) * (1 - w) + 2.9 * w - st * 2.3 + 0.8 * k;
        sh.rotation.z = s * (0.2 + 0.35 * w + 0.5 * k);
        el.rotation.x = 0.3 + 0.2 * alert + 0.3 * w;
        hand.rotation.x = 0.3 + 0.5 * w - 0.4 * st + Math.sin(t * 3 + s) * 0.1;
      }
      const flick = Math.sin(t * 9.1 + id) * Math.sin(t * 4.3) > 0.85 ? 0.4 : 1;
      const lit = dead > 0 ? (dead < 0.3 ? 1.5 : Math.max(0, 1.5 - (dead - 0.3) * 2)) : (0.8 + 0.2 * alert + 0.4 * w) * flick;
      for (const e of eyes) { this.glowOp(e, lit); e.scale.setScalar(0.12 + 0.06 * w + (dead > 0 ? 0.15 * k : 0)); }
      for (const c of cores) this.glowOp(c, lit);
      this.glowOp(coreGlow, (0.12 + 0.12 * w) * (1 - k));
      inner.opacity = (0.14 + 0.1 * w) * (1 - k) * this.fade;
    };
  }

  /** Cave troll: a great hunched brute with a hide like weathered rock, boulders grown into its back, tusks, a nose like a turnip, and a pit prop for a club. */
  private troll(): Anim {
    const r = seeded(73);
    const hideM = this.mat(0x8e9478, { map: hide("stone") });
    const hide2 = this.mat(0x6e7460, { map: hide("stone", 2, 2) });
    const belly = this.mat(0xa8a488, { map: hide("stone") });
    const rockM = this.mat(0x9a9484, { map: hide("oolite"), flat: true });
    const fur = this.mat(0x5a4632, { map: hide("fur"), side: THREE.DoubleSide });
    const leather = this.mat(0x4a3420, { map: hide("leather") });
    const wood = this.mat(0x6e4e2e, { map: hide("bark", 1, 3) });
    const iron = this.mat(0x4a4a50, { map: hide("iron"), shine: 40 });
    const tusk = this.mat(0xe4d8b4, { shine: 30 });
    const nail = this.mat(0x2a2418);
    const dark = this.mat(0x0a0806);
    const rig = this.piv(this.group, 0, 1.0, 0);
    const legs = [-1, 1].map((s) => {
      const hip = this.piv(rig, s * 0.32, -0.02, 0.05);
      this.bone(hip, [0, 0, 0], [s * 0.05, -0.5, -0.04], 0.22, 0.17, hideM, 8);
      const knee = this.piv(hip, s * 0.05, -0.5, -0.04);
      this.ball(knee, 0.17, hide2, 0, 0, 0, 1, 1, 1, 8, 6);
      this.bone(knee, [0, 0, 0], [0, -0.42, 0.02], 0.17, 0.14, hideM, 8);
      this.box(knee, 0.3, 0.12, 0.42, hide2, 0, -0.47, -0.08);
      for (let k = 0; k < 3; k++) this.ball(knee, 0.06, hideM, (k - 1) * 0.09, -0.48, -0.3, 1, 0.8, 1.2, 6, 4);
      return { hip, knee };
    });
    this.ball(rig, 0.42, fur, 0, 0.0, 0.02, 1.15, 0.6, 0.95, 9, 5);
    const skirt = this.cyl(rig, 0.48, 0.58, 0.42, fur, 0, -0.15, 0.02, 10, true);
    skirt.scale.z = 0.85;
    this.cyl(rig, 0.48, 0.48, 0.07, leather, 0, 0.06, 0.02, 10).scale.z = 0.85;
    const torso = this.piv(rig, 0, 0.1, 0);
    this.ball(torso, 0.45, belly, 0, 0.3, -0.06, 1.1, 1, 1.05);
    this.ball(torso, 0.5, hideM, 0, 0.76, 0.04, 1.35, 0.9, 1.0, 11, 8);
    this.ball(torso, 0.46, hide2, 0, 1.0, 0.28, 1.2, 0.85, 0.9);
    // boulders grown into its back and shoulders
    for (let i = 0; i < 9; i++) {
      const a = (r() - 0.5) * 2.4, y = 0.8 + r() * 0.4;
      this.rock(torso, 0.1 + r() * 0.1, rockM, Math.sin(a) * 0.45, y, 0.3 + Math.cos(a) * 0.3, r);
    }
    for (const s of [-1, 1]) for (let k = 0; k < 2; k++) this.rock(torso, 0.12 - k * 0.03, rockM, s * (0.62 + k * 0.08), 1.08 - k * 0.12, 0.1 + k * 0.1, r);

    const head = this.piv(torso, 0, 0.98, -0.45);
    this.ball(head, 0.24, hideM, 0, 0, 0, 1.1, 0.92, 1.05);
    this.box(head, 0.42, 0.1, 0.16, hide2, 0, 0.1, -0.16).rotation.x = 0.2;
    // a nose like a turnip
    this.bone(head, [0, 0.06, -0.2], [0, -0.06, -0.34], 0.05, 0.065, hideM, 6);
    this.ball(head, 0.075, hide2, 0, -0.08, -0.33, 1.1, 0.9, 1, 8, 6);
    for (const s of [-1, 1]) {
      this.ball(head, 0.03, dark, s * 0.09, 0.04, -0.215, 1, 0.8, 1, 6, 5);
      const ear = this.cone(head, 0.06, 0.16, hide2, s * 0.25, 0.04, 0.02, 5);
      ear.rotation.set(0, 0, -s * 1.3);
      ear.scale.z = 0.5;
      this.rock(head, 0.05, rockM, s * 0.12, 0.2, 0.08, r);
    }
    const eyes = [-1, 1].map((s) => this.eye(head, 0xffb020, 0.11, s * 0.09, 0.04, -0.24, true));
    const jaw = this.piv(head, 0, -0.1, -0.04);
    this.ball(jaw, 0.2, hide2, 0, -0.04, -0.12, 1.1, 0.55, 1.0, 10, 6);
    this.box(jaw, 0.22, 0.03, 0.04, dark, 0, 0.02, -0.29);
    for (const s of [-1, 1]) {
      const tk = this.cone(jaw, 0.03, 0.14, tusk, s * 0.11, 0.07, -0.27, 5);
      tk.rotation.set(-0.15, 0, -s * 0.25);
      this.cone(jaw, 0.016, 0.05, tusk, s * 0.04, 0.035, -0.29, 4);
    }

    const arms = [-1, 1].map((s) => {
      const sh = this.piv(torso, s * 0.66, 0.86, 0.04);
      this.ball(sh, 0.25, hideM, 0, 0, 0, 1, 1, 1, 8, 6);
      this.bone(sh, [0, 0, 0], [s * 0.04, -0.6, 0], 0.18, 0.14, hideM, 8);
      const el = this.piv(sh, s * 0.04, -0.6, 0);
      this.ball(el, 0.14, hide2, 0, 0, 0, 1, 1, 1, 7, 5);
      this.bone(el, [0, 0, 0], [0, -0.58, -0.02], 0.15, 0.19, hideM, 8);
      this.cyl(el, 0.2, 0.19, 0.12, leather, 0, -0.42, -0.01, 8);
      const hand = this.piv(el, 0, -0.66, -0.02);
      this.ball(hand, 0.17, hide2, 0, 0, 0, 1, 1.05, 0.95, 8, 6);
      for (let f = 0; f < 3; f++) {
        const x = (f - 1) * 0.08;
        this.bone(hand, [x, -0.08, -0.06], [x * 1.1, -0.2, -0.1], 0.05, 0.04, hideM, 5);
        this.cone(hand, 0.03, 0.06, nail, x * 1.1, -0.23, -0.11, 4).rotation.x = Math.PI;
      }
      return { sh, el, hand, s };
    });
    // the club: a pit prop, iron-banded and studded with nails
    const club = this.piv(arms[1].hand, 0, 0, 0);
    club.rotation.x = -Math.PI + 0.15;
    this.bone(club, [0, -0.25, 0], [0, 1.25, 0], 0.07, 0.16, wood, 8);
    for (const y of [0.7, 1.05]) this.cyl(club, 0.14 + (y - 0.7) * 0.06, 0.13 + (y - 0.7) * 0.06, 0.07, iron, 0, y, 0, 8);
    for (let i = 0; i < 8; i++) {
      const a = i * 2.4, y = 0.8 + (i % 4) * 0.12, rr = 0.13 + (y - 0.7) * 0.05;
      const sp = this.cone(club, 0.025, 0.12, iron, Math.cos(a) * rr, y, Math.sin(a) * rr, 4);
      sp.rotation.set(Math.sin(a) * Math.PI / 2, 0, -Math.cos(a) * Math.PI / 2);
    }
    const id = this.group.id;
    return (_dt, state, moving, t, dead) => {
      const mv = clamp01(moving / 1.4), ph = this.phase * 2.6;
      const w = this.wind, st = this.strike;
      const alert = state === 1 || state === 2 ? 1 : 0;
      const breathe = Math.sin(t * 1.4 + id);
      legs.forEach(({ hip, knee }, i) => {
        const s = Math.sin(ph + i * Math.PI);
        hip.rotation.x = 0.2 + s * 0.4 * mv;
        hip.rotation.z = (i ? -1 : 1) * 0.06;
        knee.rotation.x = -0.35 - Math.max(0, Math.cos(ph + i * Math.PI)) * 0.5 * mv;
      });
      rig.position.y = 0.97 - Math.abs(Math.cos(ph)) * 0.07 * mv - 0.06 * w;
      rig.rotation.z = Math.sin(ph) * 0.07 * mv;
      torso.rotation.set(-0.42 - 0.08 * alert + 0.32 * w - 0.65 * st + breathe * 0.02, Math.sin(ph) * 0.14 * mv - 0.3 * w + 0.4 * st, Math.sin(ph) * 0.06 * mv);
      torso.scale.set(1 + breathe * 0.015, 1, 1 + breathe * 0.02);
      head.rotation.set(0.4 + 0.08 * alert - 0.3 * w + 0.3 * st, Math.sin(t * 0.35 + id) * 0.35 * (1 - alert), Math.sin(t * 0.5 + id) * 0.08);
      jaw.rotation.x = 0.08 + 0.12 * alert + 0.35 * w + Math.max(0, breathe) * 0.05;
      const [L, R] = arms;
      // the free arm hangs and knuckle-walks; the club arm goes up and over on the wind-up and comes down hard
      L.sh.rotation.x = 0.55 + Math.sin(ph) * 0.35 * mv - 0.4 * w + 0.5 * st;
      L.sh.rotation.z = -0.15 - 0.3 * w;
      L.el.rotation.x = 0.25 + 0.2 * mv;
      R.sh.rotation.x = (0.45 - Math.sin(ph) * 0.3 * mv + 0.25 * alert) * (1 - w) + 3.3 * w - st * 2.6;
      R.sh.rotation.z = 0.12 + 0.12 * w;
      R.el.rotation.x = 0.3 + 0.5 * w - 0.2 * st;
      if (dead > 0) {
        // down on its knees, then over onto its face
        const k1 = smooth(dead / 0.5), k2 = smooth((dead - 0.5) / 0.8);
        legs.forEach(({ hip, knee }) => { hip.rotation.x = 0.2 + 1.3 * k1 - 0.6 * k2; knee.rotation.x = -0.35 - 1.6 * k1 + 0.9 * k2; });
        rig.position.y = 0.97 - 0.5 * k1 - 0.2 * k2;
        rig.rotation.x = -1.2 * k2;
        torso.rotation.x = -0.42 + 0.3 * k1 - 0.2 * k2;
        L.sh.rotation.x = 0.55 + 1.2 * k2; R.sh.rotation.x = 0.45 + 0.8 * k1 + 0.6 * k2;
        head.rotation.x = 0.4 - 0.4 * k1;
      } else rig.rotation.x = 0;
      for (const e of eyes) this.glowOp(e, dead > 0 ? 1 - dead * 1.0 : 0.75 + 0.25 * alert + 0.2 * w);
    };
  }

  /** Bone crossbowman: a skeleton guard in a rusted kettle hat and the rags of a tabard, still carrying his crossbow, which he raises, aims and looses with dead patience. Falls to a heap of bones. */
  private crossbow(): Anim {
    const r = seeded(79);
    const boneM = this.mat(0xd8ccae, { map: hide("bone") });
    const bone2 = this.mat(0xb4a688, { map: hide("bone", 1, 2) });
    const dark = this.mat(0x050403);
    const rust = this.mat(0x8a5a34, { map: hide("iron"), shine: 30, spec: 0x443322 });
    const rust2 = this.mat(0x6a4a30, { map: hide("iron", 2, 2), shine: 20 });
    const leather = this.mat(0x5a4028, { map: hide("leather") });
    const tabard = this.mat(0x7a2e24, { map: hide("rag"), side: THREE.DoubleSide });
    const wood = this.mat(0x7a5634, { map: hide("bark", 1, 3) });
    const cord = this.mat(0xd8d0b0);
    const fletch = this.mat(0xc8c0b0, { side: THREE.DoubleSide });
    const rig = this.piv(this.group, 0, 0.94, 0);
    const legs = [-1, 1].map((s) => {
      const hip = this.piv(rig, s * 0.1, -0.02, 0);
      this.bone(hip, [0, 0, 0], [0, -0.44, 0], 0.032, 0.026, boneM, 5);
      const knee = this.piv(hip, 0, -0.44, 0);
      this.ball(knee, 0.04, bone2, 0, 0, 0, 1, 1, 1, 6, 5);
      this.ball(knee, 0.05, rust, 0, 0.01, -0.03, 1, 1.1, 0.6, 6, 5);
      this.bone(knee, [0, 0, 0], [0, -0.42, 0], 0.026, 0.02, boneM, 5);
      this.bone(knee, [0.025, -0.02, 0], [0.02, -0.4, 0], 0.012, 0.01, bone2, 4);
      this.box(knee, 0.08, 0.04, 0.18, bone2, 0, -0.44, -0.04);
      return { hip, knee };
    });
    // pelvis and spine
    this.ball(rig, 0.12, bone2, 0, 0.0, 0, 1.3, 0.6, 0.8, 8, 5);
    this.cyl(rig, 0.15, 0.15, 0.05, leather, 0, 0.08, 0, 9);
    const quiver = this.piv(rig, 0.16, 0.0, 0.06);
    quiver.rotation.set(0.25, 0, -0.15);
    this.cyl(quiver, 0.05, 0.045, 0.32, leather, 0, -0.05, 0, 7);
    for (let k = 0; k < 4; k++) {
      const x = (k % 2 - 0.5) * 0.04, z = (Math.floor(k / 2) - 0.5) * 0.04;
      this.box(quiver, 0.008, 0.12, 0.008, wood, x, 0.16, z);
      this.box(quiver, 0.025, 0.05, 0.002, fletch, x, 0.2, z);
    }
    const torso = this.piv(rig, 0, 0.06, 0);
    for (let k = 0; k < 7; k++) this.box(torso, 0.04, 0.045, 0.04, bone2, 0, 0.03 + k * 0.075, 0.07);
    for (let k = 0; k < 5; k++) {
      const rr = 0.13 - Math.abs(k - 1.5) * 0.012;
      const rib = this.put(torso, new THREE.Mesh(new THREE.TorusGeometry(rr, 0.011, 4, 10, Math.PI), boneM), 0, 0.22 + k * 0.065, 0.06 - rr * 0.5);
      rib.rotation.set(-Math.PI / 2 + 0.25, 0, 0);
      rib.scale.set(1.05, 1.15, 1);
    }
    this.box(torso, 0.03, 0.22, 0.02, boneM, 0, 0.34, -0.1);
    // a tattered tabard over the ribs, front and back
    const front = this.piv(torso, 0, 0.56, -0.11);
    this.box(front, 0.24, 0.66, 0.006, tabard, 0, -0.33, 0);
    for (let k = 0; k < 4; k++) this.box(front, 0.05, 0.08 + r() * 0.12, 0.006, tabard, -0.09 + k * 0.06, -0.7, 0);
    this.box(torso, 0.26, 0.62, 0.006, tabard, 0, 0.26, 0.12);
    for (const s of [-1, 1]) this.bone(torso, [0, 0.56, -0.06], [s * 0.18, 0.55, 0], 0.014, 0.012, boneM, 4);
    // a rusty pauldron on the left shoulder
    const paul = this.put(torso, new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 4, 0, TAU, 0, Math.PI / 2), rust), -0.19, 0.55, 0);
    paul.rotation.z = 0.5;

    const head = this.piv(torso, 0, 0.68, -0.02);
    this.bone(torso, [0, 0.56, 0.04], [0, 0.66, 0.0], 0.022, 0.02, bone2, 4);
    this.ball(head, 0.1, boneM, 0, 0.05, 0, 0.9, 1.0, 1.05, 10, 8);
    this.box(head, 0.12, 0.06, 0.08, boneM, 0, -0.01, -0.05);
    for (const s of [-1, 1]) this.ball(head, 0.03, dark, s * 0.037, 0.04, -0.08, 1, 1, 0.8, 6, 5);
    this.box(head, 0.02, 0.03, 0.02, dark, 0, 0.0, -0.095);
    for (let k = 0; k < 6; k++) this.box(head, 0.012, 0.02, 0.01, bone2, (k - 2.5) * 0.016, -0.035, -0.09);
    const eyes = [-1, 1].map((s) => this.eye(head, 0xff5a20, 0.08, s * 0.037, 0.04, -0.1, true));
    const jaw = this.piv(head, 0, -0.04, -0.02);
    this.box(jaw, 0.1, 0.025, 0.08, boneM, 0, -0.02, -0.04);
    for (let k = 0; k < 5; k++) this.box(jaw, 0.012, 0.018, 0.01, bone2, (k - 2) * 0.016, 0.0, -0.075);
    // a battered kettle hat
    const hat = this.put(head, new THREE.Mesh(new THREE.SphereGeometry(0.115, 10, 5, 0, TAU, 0, Math.PI / 2), rust), 0, 0.075, 0);
    hat.scale.set(1, 0.95, 1.05);
    const brim = this.cone(head, 0.21, 0.07, rust2, 0, 0.065, 0, 12);
    brim.scale.y = 0.6;
    this.box(head, 0.012, 0.03, 0.2, rust2, 0, 0.18, 0);

    // the crossbow, held on an aim point at the shoulder
    const aim = this.piv(torso, 0.08, 0.5, -0.24);
    this.box(aim, 0.045, 0.055, 0.6, wood, 0, 0.0, -0.08);
    this.box(aim, 0.055, 0.11, 0.16, wood, 0, -0.03, 0.2);
    this.box(aim, 0.012, 0.06, 0.02, rust, 0, -0.05, 0.02);
    const tipL = new THREE.Vector3(-0.3, 0.02, -0.3), tipR = new THREE.Vector3(0.3, 0.02, -0.3);
    for (const s of [-1, 1]) {
      this.bone(aim, [0, 0.02, -0.38], [s * 0.16, 0.02, -0.39], 0.016, 0.013, rust, 4);
      this.bone(aim, [s * 0.16, 0.02, -0.39], [s * 0.3, 0.02, -0.3], 0.013, 0.008, rust, 4);
    }
    const stir = this.put(aim, new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.008, 4, 8), rust), 0, 0.0, -0.43);
    stir.rotation.y = Math.PI / 2;
    const strL = this.rod(aim, 0.004, cord), strR = this.rod(aim, 0.004, cord);
    const bolt = this.piv(aim, 0, 0.04, -0.08);
    this.box(bolt, 0.012, 0.012, 0.36, wood, 0, 0, -0.14);
    const head2 = this.cone(bolt, 0.016, 0.06, rust, 0, 0, -0.34, 4);
    head2.rotation.x = -Math.PI / 2;
    this.box(bolt, 0.002, 0.03, 0.06, fletch, 0, 0.012, 0.02);
    const arms = [-1, 1].map((s) => {
      const sh = this.piv(torso, s * 0.18, 0.54, 0);
      this.ball(sh, 0.035, bone2, 0, 0, 0, 1, 1, 1, 6, 5);
      this.bone(sh, [0, 0, 0], [0, -0.28, 0], 0.025, 0.02, boneM, 5);
      const el = this.piv(sh, 0, -0.28, 0);
      this.ball(el, 0.028, bone2, 0, 0, 0, 1, 1, 1, 5, 4);
      this.bone(el, [0, 0, 0], [0, -0.25, 0], 0.02, 0.016, boneM, 5);
      this.bone(el, [0.018, 0, 0], [0.015, -0.24, 0], 0.01, 0.009, bone2, 4);
      const hand = this.piv(el, 0, -0.26, 0);
      this.box(hand, 0.04, 0.06, 0.02, boneM, 0, -0.02, 0);
      for (let f = 0; f < 3; f++) this.bone(hand, [(f - 1) * 0.014, -0.05, 0], [(f - 1) * 0.016, -0.1, -0.03], 0.006, 0.004, boneM, 3);
      return { sh, el, hand, s };
    });
    const fall = this.shatter(83, (m) => m !== strL && m !== strR);
    let loaded = 1;
    const nut = new THREE.Vector3(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
    const id = this.group.id;
    return (dt, state, moving, t, dead) => {
      if (dead > 0) {
        strL.visible = strR.visible = false;
        fall(dead);
        for (const e of eyes) this.glowOp(e, Math.max(0, 1 - dead * 2));
        return;
      }
      const mv = clamp01(moving / 2), ph = this.phase * 4.2;
      const w = this.wind, st = this.strike;
      const alert = state === 1 || state === 2 ? 1 : 0;
      if (st > 0.9) loaded = 0;
      loaded = Math.min(1, loaded + dt / 1.6);
      legs.forEach(({ hip, knee }, i) => {
        const s = Math.sin(ph + i * Math.PI);
        hip.rotation.x = 0.05 + s * 0.45 * mv;
        knee.rotation.x = -0.1 - Math.max(0, Math.cos(ph + i * Math.PI)) * 0.6 * mv;
      });
      rig.position.y = 0.94 - Math.abs(Math.cos(ph)) * 0.035 * mv;
      torso.rotation.set(-0.08 + 0.05 * w - 0.12 * st, Math.sin(ph) * 0.08 * mv + 0.25 * w, Math.sin(ph) * 0.04 * mv);
      const rattle = Math.sin(t * 0.45 + id) > 0.93 ? Math.sin(t * 50) * 0.15 : 0;
      head.rotation.set(0.1 * w + Math.sin(t * 0.8 + id) * 0.03, Math.sin(t * 0.4 + id) * 0.4 * (1 - alert) - 0.2 * w, Math.sin(t * 0.6 + id) * 0.05 + 0.12 * w);
      jaw.rotation.x = 0.08 + Math.abs(rattle) + Math.max(0, Math.sin(t * 15)) * 0.1 * alert * (1 - w);
      // lowered across the body, raised to the shoulder to aim, kicks on the shot
      const up = Math.max(w, st, alert * 0.25);
      aim.position.set(0.08 - 0.02 * up, 0.24 + 0.3 * up + 0.04 * st, -0.2 - 0.05 * up + 0.06 * st);
      aim.rotation.set(-0.6 * (1 - up) + 0.25 * st, 0.55 * (1 - up), 0);
      tmp.set(0, -0.05, 0.03).applyEuler(aim.rotation).add(aim.position);
      this.ik(arms[1].sh, arms[1].el, tmp, 0.28, 0.28, POLE_R);
      tmp.set(0, -0.04, -0.22).applyEuler(aim.rotation).add(aim.position);
      this.ik(arms[0].sh, arms[0].el, tmp, 0.28, 0.28, POLE_L);
      arms[0].hand.rotation.set(0.6, 0, 0); arms[1].hand.rotation.set(0.8, 0, 0);
      // the string: drawn back to the nut when spanned, snapped forward when loosed
      nut.set(0, 0.035, -0.36 + 0.28 * smooth(loaded * 1.2 - 0.1));
      this.rodTo(strL, tmp2.copy(tipL), nut);
      this.rodTo(strR, tmp2.copy(tipR), nut);
      bolt.visible = loaded > 0.95;
      for (const e of eyes) this.glowOp(e, 0.75 + 0.25 * alert + 0.3 * w);
    };
  }

  // ---- the run bosses ----

  /** A smoothed 0..1 weight for each special move, so poses ease in and out of each other. */
  private easer(): (id: number, dt: number, rate?: number) => number {
    const P = new Map<number, number>();
    return (id, dt, rate = 6) => {
      const v = P.get(id) ?? 0, nv = v + ((this.move === id ? 1 : 0) - v) * Math.min(1, dt * rate);
      P.set(id, nv);
      return nv;
    };
  }

  /**
   * The Drowned Engine: a Cornish beam engine dragged up out of the flooded workings and walking. A riveted
   * boiler on four piston legs, a great timber beam rocking on an A-frame with an iron bob on its end to
   * smash you with, a flywheel, a chimney; a furnace door for a mouth and two gauge-glass eyes. Weed and
   * chains hang off it.
   */
  private engine(): Anim {
    const r = seeded(43);
    const plate = this.mat(0xd0bca4, { map: bhide("plate"), shine: 30, spec: 0x443322 });
    const plate2 = this.mat(0xa89484, { map: bhide("plate", 2, 1), shine: 20, spec: 0x332211 });
    const iron = this.mat(0x8a8288, { map: hide("iron"), shine: 50, spec: 0x555555 });
    const brass = this.mat(0xb08840, { shine: 70, spec: 0xffe0a0, e: 0x1a1000 });
    const copper = this.mat(0xc08a5a, { shine: 40, e: 0x0a0602, map: hide("iron") });
    const timber = this.mat(0xb08a62, { map: hide("bark", 1, 3) });
    const weed = this.mat(0x8aa860, { map: bhide("weed"), side: THREE.DoubleSide, e: 0x060a02 });
    const dark = this.mat(0x080404);
    const fire = this.glowMat(0xff7020);
    const fire2 = this.glowMat(0xffc060);
    const glass = this.glowMat(0xb8ff70);
    const ring = (p: THREE.Object3D, rad: number, tube: number, m: THREE.Material, x: number, y: number, z: number, seg = 18) =>
      this.put(p, new THREE.Mesh(new THREE.TorusGeometry(rad, tube, 4, seg), m), x, y, z);

    const rig = this.piv(this.group, 0, 1.65, 0);
    // the boiler, lying fore and aft, with domed ends and riveted bands
    this.cyl(rig, 0.95, 0.95, 2.8, plate, 0, 0, 0, 14).rotation.x = Math.PI / 2;
    this.ball(rig, 0.95, plate2, 0, 0, -1.4, 1, 1, 0.35, 14, 8);
    this.ball(rig, 0.95, plate2, 0, 0, 1.4, 1, 1, 0.4, 14, 8);
    for (const z of [-1.0, 0, 1.0]) ring(rig, 0.97, 0.05, iron, 0, 0, z);
    for (let i = 0; i < 6; i++) this.rock(rig, 0.1 + r() * 0.08, weed, (r() - 0.5) * 1.4, -0.6 - r() * 0.3, (r() - 0.5) * 2.4, r);
    // the furnace door is its mouth: grate bars over fire, and a door hinged at the foot that drops open
    const mouth = this.piv(rig, 0, -0.12, -1.66);
    this.box(mouth, 1.12, 0.8, 0.14, iron, 0, 0, 0.04);
    this.box(mouth, 0.92, 0.6, 0.04, fire2, 0, 0, -0.02);
    for (let k = 0; k < 7; k++) this.box(mouth, 0.05, 0.62, 0.05, dark, -0.39 + k * 0.13, 0, -0.06);
    const door = this.piv(mouth, 0, -0.4, -0.08);
    this.box(door, 1.04, 0.7, 0.06, plate2, 0, 0.35, -0.02);
    this.box(door, 0.6, 0.06, 0.04, brass, 0, 0.5, -0.06);
    for (let k = 0; k < 6; k++) this.cone(door, 0.05, 0.16, iron, -0.4 + k * 0.16, 0.7, -0.03, 4);
    const furnace = this.eye(mouth, 0xff7020, 1.8, 0, 0, -0.25, true);
    // gauge-glass eyes in brass, either side above the mouth
    const eyes = [-1, 1].map((s) => {
      const h = this.cyl(rig, 0.17, 0.19, 0.16, brass, s * 0.52, 0.52, -1.6, 10);
      h.rotation.x = Math.PI / 2;
      this.ball(rig, 0.14, glass, s * 0.52, 0.52, -1.69, 1, 1, 0.6, 8, 6);
      return this.eye(rig, 0xc0ff70, 0.9, s * 0.52, 0.52, -1.78, true);
    });
    // the steam cylinder standing at the back, and the A-frame carrying the beam
    this.cyl(rig, 0.45, 0.45, 1.3, plate2, 0, 1.45, 1.0, 12);
    this.cyl(rig, 0.53, 0.53, 0.1, iron, 0, 2.1, 1.0, 12);
    this.cyl(rig, 0.53, 0.53, 0.1, iron, 0, 0.82, 1.0, 12);
    for (const s of [-1, 1]) {
      this.bone(rig, [s * 0.65, 0.65, -0.35], [s * 0.18, 2.62, -0.2], 0.12, 0.09, timber);
      this.bone(rig, [s * 0.65, 0.65, 0.2], [s * 0.18, 2.62, -0.2], 0.1, 0.08, timber);
    }
    const beam = this.piv(rig, 0, 2.7, -0.2);
    this.box(beam, 0.3, 0.44, 4.6, timber, 0, 0, -0.45);
    for (const z of [-2.3, -1.2, 0, 1.0]) this.box(beam, 0.34, 0.48, 0.1, iron, 0, 0, z);
    this.cyl(beam, 0.1, 0.1, 0.7, brass, 0, 0, 0, 8).rotation.z = Math.PI / 2;
    // the piston rod at the back, into the cylinder
    this.bone(beam, [0, 0, 1.2], [0, -1.15, 1.2], 0.06, 0.06, brass);
    // the bob at the front: what it smashes you with
    const bob = this.piv(beam, 0, 0, -2.65);
    this.bone(bob, [0, 0.05, 0], [0, -0.75, 0], 0.08, 0.08, iron);
    this.box(bob, 0.95, 0.16, 0.95, iron, 0, -0.8, 0);
    this.box(bob, 0.82, 0.72, 0.82, plate2, 0, -1.2, 0);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const c = this.cone(bob, 0.1, 0.32, iron, x * 0.3, -1.66, z * 0.3, 4); c.rotation.x = Math.PI; }
    for (let k = 0; k < 4; k++) this.box(bob, 0.05, 0.6 + r() * 0.5, 0.02, weed, (r() - 0.5) * 0.8, -1.3, -0.42 + (k % 2) * 0.84).rotation.z = (r() - 0.5) * 0.4;
    // weed and chain hanging off the beam
    for (let k = 0; k < 6; k++) this.box(beam, 0.04, 0.5 + r() * 0.7, 0.02, weed, (r() - 0.5) * 0.3, -0.5, -2 + k * 0.6).rotation.x = (r() - 0.5) * 0.3;
    // the flywheel on its right side, and a crank to the beam
    const wheel = this.piv(rig, 1.12, 0.35, 0.4);
    const rim = ring(wheel, 0.95, 0.08, iron, 0, 0, 0, 22);
    rim.rotation.y = Math.PI / 2;
    this.cyl(wheel, 0.16, 0.16, 0.24, brass, 0, 0, 0, 8).rotation.z = Math.PI / 2;
    for (let k = 0; k < 6; k++) { const sp = this.box(wheel, 0.06, 1.8, 0.08, iron, 0, 0, 0); sp.rotation.x = (k / 6) * Math.PI; }
    // the chimney, with steam off it
    this.cyl(rig, 0.22, 0.3, 2.6, plate, -0.62, 1.9, 0.95, 10);
    this.cyl(rig, 0.3, 0.26, 0.18, iron, -0.62, 3.25, 0.95, 10);
    const puffs = [0, 1, 2, 3].map(() => this.eye(rig, 0xd8e4e8, 0.6, -0.62, 3.4, 0.95, true));
    for (const p of puffs) (p.material as THREE.SpriteMaterial).blending = THREE.NormalBlending;
    // pipes about it
    this.bone(rig, [0.35, 1.4, 1.0], [0.85, 0.4, -0.9], 0.07, 0.07, copper, 6);
    this.bone(rig, [-0.35, 1.2, 1.0], [-0.95, 0.2, 0.2], 0.06, 0.06, copper, 6);
    this.bone(rig, [-0.95, 0.2, 0.2], [-0.95, -0.2, -1.1], 0.06, 0.06, copper, 6);
    const valves = [[0.85, 0.4, -0.9], [-0.95, -0.2, -1.1]].map(([x, y, z]) => {
      const v = this.piv(rig, x, y, z);
      this.cyl(v, 0.12, 0.12, 0.05, brass, 0, 0.1, 0, 8);
      this.ball(v, 0.08, brass);
      return this.eye(v, 0xfff0e0, 0.5, 0, 0, -0.1, true);
    });
    // four piston legs
    const legs = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([s, f], i) => {
      const hip = this.piv(rig, s * 0.82, -0.35, f * 0.95);
      this.ball(hip, 0.27, iron, 0, 0, 0, 1, 1, 1, 8, 6);
      this.bone(hip, [0, 0, 0], [s * 0.3, -0.55, 0], 0.22, 0.17, plate2);
      const knee = this.piv(hip, s * 0.3, -0.55, 0);
      this.ball(knee, 0.2, iron, 0, 0, 0, 1, 1, 1, 8, 6);
      this.bone(knee, [0, 0, 0], [0, -0.5, 0], 0.24, 0.2, plate);
      this.cyl(knee, 0.26, 0.26, 0.06, iron, 0, -0.5, 0, 10);
      this.bone(knee, [0, -0.5, 0], [0, -0.78, 0], 0.1, 0.1, brass);
      this.box(knee, 0.6, 0.14, 0.7, iron, 0, -0.83, -0.06);
      return { hip, knee, s, f, i };
    });

    const ease = this.easer();
    const id = this.group.id;
    let spin = 0, beamA = 0;
    return (dt, state, moving, t, dead) => {
      const mv = clamp01(moving / 1.5), ph = this.phase * 2.6;
      const w = this.wind, st = this.strike;
      const slam = ease(MV.SLAM, dt), steam = ease(MV.STEAM, dt), flood = ease(MV.FLOOD, dt, 3), chg = ease(MV.CHARGE, dt), call = ease(MV.SUMMON, dt);
      const pump = flood + call;
      // the beam: rocks gently, pumps when it floods or calls, goes right up for a slam and comes down hard
      let want = Math.sin(t * 0.9 + id) * 0.12 + Math.sin(ph) * 0.15 * mv + Math.sin(t * 7) * 0.45 * pump;
      want += slam * (0.75 * w - 0.75 * (1 - w)) - st * 0.4 * slam;
      beamA += (want - beamA) * Math.min(1, dt * (slam && w < 0.5 ? 18 : 5));
      beam.rotation.x = beamA;
      bob.rotation.x = -beamA;
      spin += dt * (0.7 + mv * 3 + chg * 10 + pump * 4);
      wheel.rotation.x = -spin;
      const pitch = slam * (0.08 * w - 0.14 * (1 - w)) - steam * 0.16 + flood * 0.2 + chg * (0.18 * w - 0.22 * (1 - w)) + call * 0.1;
      rig.rotation.set(pitch, 0, Math.sin(ph) * 0.04 * mv + Math.sin(t * 0.7 + id) * 0.015);
      rig.position.set(0, 1.65 - Math.abs(Math.sin(ph * 2)) * 0.05 * mv - chg * w * 0.15, -st * 0.3);
      for (const { hip, knee, f, i } of legs) {
        const off = i === 0 || i === 3 ? 0 : Math.PI, lift = Math.max(0, Math.sin(ph + off)) * mv;
        hip.rotation.x = Math.cos(ph + off) * 0.35 * mv - pitch * 0.9;
        knee.rotation.x = -lift * 0.6 + (f < 0 ? flood * 0.35 : 0);
        hip.position.y = -0.35 + (f < 0 ? -flood * 0.1 : 0);
      }
      door.rotation.x = -(0.08 + 0.1 * Math.max(0, Math.sin(t * 1.3 + id)) + 1.1 * steam + 0.5 * call + 0.3 * (state === 1 || state === 2 ? 1 : 0) * (1 - steam));
      // smoke and steam off the chimney
      puffs.forEach((p, k) => {
        const u = (t * (0.5 + pump) + k / puffs.length) % 1;
        p.position.set(-0.62 + u * 0.3, 3.4 + u * 1.6, 0.95 + u * 0.4);
        p.scale.setScalar(0.4 + u * (1.4 + pump));
        this.glowOp(p, (1 - u) * (0.35 + 0.3 * pump) * (dead > 0 ? Math.max(0, 1 - dead * 0.4) * 1.6 : 1));
      });
      for (const v of valves) { this.glowOp(v, steam * (0.6 + 0.4 * Math.sin(t * 30)) + flood * 0.3); v.scale.setScalar(0.4 + steam * 0.9); }
      let heat = 0.75 + 0.15 * Math.sin(t * 2.3 + id) + 0.3 * steam + 0.2 * w;
      let look = 0.85 + 0.15 * Math.sin(t * 4);
      if (dead > 0) {
        // legs give, the boiler drops and rolls, the beam crashes down, and the fire goes out
        const k1 = smooth(dead / 0.7), k2 = smooth((dead - 0.4) / 1.0), k3 = smooth((dead - 0.9) / 0.4);
        for (const { hip, knee, s } of legs) { hip.rotation.set(0, 0, s * 0.9 * k1); knee.rotation.set(0, 0, -s * 0.7 * k1); }
        rig.position.set(0, 1.65 - 0.95 * k1, 0);
        rig.rotation.set(-0.18 * k2, 0, 0.32 * k2);
        beam.rotation.x = beamA * (1 - k3) - 0.65 * k3 + Math.sin(Math.max(0, dead - 1.3) * 14) * 0.08 * Math.max(0, 1 - (dead - 1.3) * 2) * (dead > 1.3 ? 1 : 0);
        bob.rotation.x = -beam.rotation.x;
        door.rotation.x = -1.4 * k1;
        heat *= Math.max(0, 1 - dead * 0.35);
        look = dead < 1.2 && Math.sin(dead * 40) > 0 ? 0.8 : Math.max(0, 1 - dead * 0.6);
      }
      fire.color.setRGB(Math.min(1, heat), 0.44 * heat, 0.12 * heat);
      fire2.color.setRGB(Math.min(1, heat), Math.min(1, 0.75 * heat), 0.35 * heat);
      this.glowOp(furnace, 0.45 * heat);
      furnace.scale.setScalar(1.4 + steam * 1.2 + call);
      glass.color.setRGB(0.72 * look, look, 0.44 * look);
      for (const e of eyes) { this.glowOp(e, look); e.scale.setScalar(0.5 + 0.25 * w + 0.3 * chg); }
    };
  }

  /**
   * The Cinder Wyrm: a great lava serpent with a hide of cooling basalt, fire showing between its plates.
   * Its tail trails in an S across the floor; its neck rears up to a horned, crocodile skull with a throat
   * full of fire. Little clawed forelegs. It dives into lava and comes up under you.
   */
  private wyrm(): Anim {
    const r = seeded(47);
    const hideM = this.mat(0xa89a90, { map: bhide("scales"), e: 0x2a0a00 });
    const hide2 = this.mat(0x887a72, { map: bhide("scales", 2, 1), e: 0x1a0600 });
    const belly = this.mat(0x9a7454, { map: hide("leather"), e: 0x281000 });
    const horn = this.mat(0x28201c, { shine: 50, spec: 0x664433 });
    const tooth = this.mat(0xe8d8b8, { e: 0x201008 });
    const dark = this.mat(0x060202);
    const magma = this.glowMat(0xff6010);
    const magma2 = this.glowMat(0xffc040);
    const seam = (p: THREE.Object3D, rad: number, z: number) => this.put(p, new THREE.Mesh(new THREE.TorusGeometry(rad, 0.022, 3, 14), magma), 0, 0, z);

    const root = this.piv(this.group, 0, 0, 0);
    // the tail, trailing behind along the floor
    const tail: { p: THREE.Group; rad: number }[] = [];
    let at: THREE.Object3D = root, prev = 0.62;
    for (let i = 0; i < 9; i++) {
      const rad = 0.62 * (1 - i / 10.5), len = 0.72 - i * 0.03;
      const p = this.piv(at, 0, i === 0 ? 0.6 : -(prev - rad) * 0.8, i === 0 ? 0.55 : len);
      this.ball(p, rad, i % 2 ? hideM : hide2, 0, 0, len * 0.45, 1, 0.82, 1.25, 10, 7);
      this.box(p, rad * 1.1, rad * 0.2, len * 0.85, belly, 0, -rad * 0.58, len * 0.45);
      if (i % 2 === 0) seam(p, rad * 0.88, len * 0.02);
      const sp = this.cone(p, rad * 0.42, rad * 1.3, horn, 0, rad * 0.75, len * 0.4, 4);
      sp.rotation.x = 0.6;
      tail.push({ p, rad });
      at = p; prev = rad;
    }
    // a club of spikes on the end of it
    const tip = this.piv(at, 0, 0, 0.62);
    this.ball(tip, 0.2, hide2, 0, 0, 0.1, 1, 0.9, 1.4, 8, 6);
    for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU; const c = this.cone(tip, 0.06, 0.3, horn, Math.cos(a) * 0.15, Math.sin(a) * 0.15, 0.15, 4); c.rotation.set(Math.sin(a) * 1.3 - 0.3, 0, -Math.cos(a) * 1.3); }
    // the neck, rearing up and forward from the front of the body
    const neck: THREE.Group[] = [];
    at = root;
    for (let i = 0; i < 5; i++) {
      const rad = 0.6 - i * 0.05;
      const p = this.piv(at, 0, i === 0 ? 0.62 : 0, i === 0 ? 0.3 : -0.5);
      this.ball(p, rad, i % 2 ? hide2 : hideM, 0, 0, -0.25, 1, 0.9, 1.15, 10, 7);
      const b = this.box(p, rad * 0.9, 0.1, 0.5, belly, 0, -rad * 0.72, -0.25);
      b.rotation.x = 0.05;
      if (i % 2 === 0) seam(p, rad * 0.9, -0.02);
      const sp = this.cone(p, rad * 0.4, rad * 1.4, horn, 0, rad * 0.78, -0.2, 4);
      sp.rotation.x = 0.7;
      neck.push(p);
      at = p;
    }
    // the head: a long horned skull, brows, a jaw full of teeth, fire in the throat
    const head = this.piv(at, 0, 0, -0.5);
    head.scale.setScalar(1.35);
    this.ball(head, 0.38, hideM, 0, 0.06, -0.15, 1, 0.75, 1.3, 12, 8);
    this.box(head, 0.42, 0.2, 0.62, hide2, 0, 0.0, -0.62);
    this.box(head, 0.3, 0.12, 0.3, hide2, 0, 0.08, -0.85).rotation.x = 0.25;
    for (const s of [-1, 1]) {
      this.ball(head, 0.025, magma2, s * 0.09, 0.08, -0.97);
      const brow = this.box(head, 0.18, 0.08, 0.32, horn, s * 0.2, 0.2, -0.38);
      brow.rotation.set(0.2, s * 0.35, s * 0.3);
      this.bone(head, [s * 0.22, 0.2, -0.1], [s * 0.5, 0.48, 0.3], 0.1, 0.06, horn, 6);
      this.bone(head, [s * 0.5, 0.48, 0.3], [s * 0.55, 0.42, 0.78], 0.06, 0.01, horn, 6);
      this.bone(head, [s * 0.3, -0.05, 0.0], [s * 0.55, 0.05, 0.35], 0.05, 0.01, horn, 4);
      this.ball(head, 0.07, dark, s * 0.21, 0.12, -0.4);
      for (let k = 0; k < 6; k++) { const c = this.cone(head, 0.025, 0.12 + (k % 2) * 0.05, tooth, s * 0.19, -0.1, -0.35 - k * 0.11, 4); c.rotation.x = Math.PI; }
    }
    const eyes = [-1, 1].map((s) => this.eye(head, 0xffd040, 0.38, s * 0.22, 0.13, -0.45, true));
    const throat = this.ball(head, 0.17, magma, 0, -0.1, -0.35, 1, 0.8, 1.6, 8, 6);
    const throatGlow = this.eye(head, 0xff8020, 1.4, 0, -0.1, -0.7, true);
    const jaw = this.piv(head, 0, -0.12, -0.1);
    this.box(jaw, 0.38, 0.1, 0.8, hide2, 0, -0.06, -0.45);
    this.box(jaw, 0.3, 0.06, 0.5, belly, 0, -0.12, -0.35);
    for (const s of [-1, 1]) for (let k = 0; k < 5; k++) this.cone(jaw, 0.022, 0.1, tooth, s * 0.16, 0.02, -0.4 - k * 0.1, 4);
    // stubby clawed forelegs at the foot of the neck
    const arms = [-1, 1].map((s) => {
      const sh = this.piv(root, s * 0.5, 0.6, -0.1);
      this.bone(sh, [0, 0, 0], [s * 0.3, -0.35, -0.2], 0.13, 0.09, hide2);
      const el = this.piv(sh, s * 0.3, -0.35, -0.2);
      this.bone(el, [0, 0, 0], [0, -0.22, -0.15], 0.08, 0.06, hideM);
      for (let k = 0; k < 3; k++) { const c = this.cone(el, 0.03, 0.16, horn, (k - 1) * 0.06, -0.24, -0.25, 4); c.rotation.x = -1.6; }
      return { sh, s };
    });
    const embers = [0, 1, 2, 3].map(() => this.eye(this.group, 0xff9030, 0.18, 0, 0, 0, true));
    const fall = this.shatter(53, (m) => m.material !== magma2);

    const ease = this.easer();
    const id = this.group.id;
    void r;
    return (dt, state, moving, t, dead) => {
      const mv = clamp01(moving / 2), w = this.wind, st = this.strike;
      const bite = ease(MV.SWIPE, dt, 8), lash = ease(MV.TAIL, dt, 8), fireB = ease(MV.BREATH, dt), call = ease(MV.SUMMON, dt);
      const dive = this.move === MV.DIVE, under = this.move === MV.UNDER, surf = this.move === MV.SURFACE;
      const slither = t * (1.1 + mv * 3) + id;
      tail.forEach(({ p }, i) => {
        const curl = lash * (w * 0.32 - (1 - w) * 0.1) - lash * st * 0.55;
        p.rotation.y = Math.sin(slither - i * 0.75) * (0.16 + 0.22 * mv) * (i ? 1 : 0.5) + curl + (i ? Math.sin(i * 0.9 + 0.5) * 0.32 : 0.3);
        p.rotation.x = i === 0 ? 0.0 : 0.02;
      });
      // the neck: an S rearing up, pulled back to bite, thrown back to breathe
      const rear = 0.25 * bite * w + 0.5 * fireB * w + 0.35 * call;
      const lunge = st * (bite + lash * 0.3) * 0.9 + fireB * (1 - w) * 0.35;
      const base = [0.9, 0.35, -0.1, -0.45, -0.5];
      neck.forEach((p, i) => {
        p.rotation.x = base[i] + rear * (i < 2 ? 0.45 : -0.2) - lunge * (i < 2 ? 0.55 : -0.1) + Math.sin(t * 1.1 + id + i * 0.6) * 0.04;
        p.rotation.y = Math.sin(t * 0.7 + id - i * 0.5) * 0.1 * (1 - fireB) + Math.sin(slither) * 0.06 * mv;
      });
      head.rotation.x = -0.15 + rear * 0.5 - fireB * (1 - w) * 0.2 + call * 0.4;
      const open = 0.1 + 0.12 * Math.max(0, Math.sin(t * 0.8 + id)) + bite * (0.7 * w + 0.2) + fireB * (0.5 + 0.4 * w) + call * 0.8 + (surf ? 0.8 : 0);
      jaw.rotation.x = open * 0.75;
      for (const { sh, s } of arms) sh.rotation.set(Math.sin(slither * 1.5 + (s > 0 ? 0 : Math.PI)) * 0.4 * mv - 0.3 * rear, 0, s * 0.1);
      root.position.z = -0.5 * st * bite;
      root.rotation.y = lash * (w * 0.5 - (1 - w) * 0.3) - st * lash * 1.2;
      // into the lava and out again
      let y = 0;
      if (dive) y = -2.8 * smooth(this.moveT / 0.8) * (state === 2 ? 1 : 1);
      if (under) y = -3.5;
      if (surf) y = state === 2 ? -2.6 + 1.3 * smooth(this.moveT / 0.5) + Math.sin(t * 40) * 0.05 : -1.3 + 1.3 * smooth(this.moveT / 0.18);
      root.position.y = y;
      root.visible = !under || dead > 0;
      let heat = 0.8 + 0.2 * Math.sin(t * 2 + id) + 0.35 * fireB * (1 - w * 0.5) + 0.3 * w;
      embers.forEach((e, k) => {
        const u = (t * 0.35 + k / embers.length) % 1, seg = tail[(k * 2 + 1) % tail.length].p;
        seg.getWorldPosition(e.position); this.group.worldToLocal(e.position);
        e.position.y += 0.5 + u * 1.6;
        this.glowOp(e, (1 - u) * 0.8 * (dead > 0 ? 0 : 1));
      });
      if (dead > 0) {
        // it slumps, the fire in it goes out, and it cracks apart like cooling slag
        const k = smooth(dead / 1.1);
        neck.forEach((p, i) => { p.rotation.x = p.rotation.x * (1 - k) + (i === 0 ? 0.05 : -0.08) * k; });
        head.rotation.x = 0.2 * k;
        jaw.rotation.x = 0.6 * k;
        root.position.y = 0;
        heat *= Math.max(0, 1 - dead * 0.45);
        if (dead > 1.3) fall(dead - 1.3);
      }
      magma.color.setRGB(Math.min(1, heat), 0.38 * heat * heat, 0.06 * heat);
      magma2.color.setRGB(Math.min(1, heat), Math.min(1, 0.75 * heat), 0.25 * heat);
      throat.scale.setScalar(1 + fireB * 0.5);
      this.glowOp(throatGlow, (0.25 + 0.75 * fireB + 0.3 * bite * w + 0.5 * call) * (dead > 0 ? Math.max(0, 1 - dead) : 1) * (0.85 + 0.15 * Math.sin(t * 25)));
      throatGlow.scale.setScalar(0.9 + fireB * 1.8);
      for (const e of eyes) this.glowOp(e, dead > 0 ? Math.max(0, 1 - dead * 0.8) : 0.9 + 0.1 * Math.sin(t * 5));
    };
  }

  /**
   * The Rime Quarryman: a giant dead quarryman frozen solid, his smock stiff with rime, icicles for a beard,
   * a felt hat crowned with ice, and a great double-pointed quarry pick. A shell of ice armour juts from his
   * shoulders and back; halfway through the fight it shatters off him, leaving him cracked and blazing cold.
   */
  private rime(): Anim {
    const r = seeded(59);
    const skin = this.mat(0x80b0e0, { map: hide("flesh"), e: 0x12304a });
    const smock = this.mat(0xa8c4dc, { map: hide("rag"), side: THREE.DoubleSide, e: 0x0e2230 });
    const cord = this.mat(0x6a8098, { map: hide("leather") });
    const boot = this.mat(0x3a4048, { map: hide("leather"), shine: 30 });
    const felt = this.mat(0x4a5058, { map: hide("fur") });
    const ice = this.mat(0xd8f0ff, { map: bhide("ice"), shine: 100, spec: 0xffffff, e: 0x204a60, flat: true, opacity: 0.9 });
    const ice2 = this.mat(0xa8d8f4, { map: bhide("ice", 2, 1), shine: 100, spec: 0xffffff, e: 0x183c54, flat: true });
    const iron = this.mat(0x707880, { map: hide("iron"), shine: 60, spec: 0xaaaaaa });
    const haft = this.mat(0x6a5a48, { map: hide("bark", 1, 3) });
    const dark = this.mat(0x02060a);
    const frost = this.glowMat(0x9fe8ff);
    const armour = new Set<THREE.Mesh>();
    const crystal = (p: THREE.Object3D, x: number, y: number, z: number, rad: number, h: number, rx: number, rz: number, m: Mat = ice) => {
      const c = this.cone(p, rad, h, m, x, y, z, 5);
      c.rotation.set(rx, r() * 3, rz);
      armour.add(c);
      return c;
    };

    const rig = this.piv(this.group, 0, 1.72, 0);
    const legs = [-1, 1].map((s) => {
      const hip = this.piv(rig, s * 0.3, 0, 0);
      this.bone(hip, [0, 0, 0], [0, -0.82, 0.02], 0.22, 0.18, smock);
      const knee = this.piv(hip, 0, -0.82, 0.02);
      this.ball(knee, 0.17, cord, 0, 0, 0, 1, 1, 1, 8, 6);
      crystal(knee, 0, 0.05, -0.15, 0.1, 0.4, -1.2, 0);
      this.bone(knee, [0, 0, 0], [0, -0.78, 0], 0.17, 0.14, cord);
      this.box(knee, 0.36, 0.26, 0.56, boot, 0, -0.8, -0.08);
      for (let k = 0; k < 3; k++) { const c = this.cone(knee, 0.03, 0.18, ice2, (k - 1) * 0.1, -0.35, -0.17, 4); c.rotation.x = Math.PI; }
      return { hip, knee };
    });
    this.ball(rig, 0.45, smock, 0, 0.05, 0, 1.2, 0.7, 0.9);
    this.cyl(rig, 0.5, 0.52, 0.12, cord, 0, 0.12, 0, 10);
    const torso = this.piv(rig, 0, 0.15, 0);
    this.ball(torso, 0.5, smock, 0, 0.35, 0, 1.1, 1, 0.85, 12, 8);
    this.ball(torso, 0.66, smock, 0, 0.85, 0.04, 1.4, 0.88, 0.9, 12, 8);
    this.ball(torso, 0.4, smock, 0, 1.05, 0.3, 1.5, 0.8, 0.8, 10, 6);
    this.box(torso, 0.5, 0.5, 0.08, skin, 0, 0.95, -0.46).rotation.x = -0.12;
    // the cracks of cold light all over him (they blaze once his shell is off)
    const cracks: THREE.Mesh[] = [];
    for (let k = 0; k < 9; k++) {
      const a = (r() - 0.5) * 2.4, y = 0.3 + r() * 0.8;
      const c = this.box(torso, 0.035, 0.22 + r() * 0.3, 0.035, frost, Math.sin(a) * 0.62, y, -Math.cos(a) * 0.52);
      c.rotation.set(0.2, -a, (r() - 0.5) * 1.6);
      cracks.push(c);
    }
    // the shell of ice: great crystals off his back and shoulders
    for (let k = 0; k < 6; k++) crystal(torso, (k - 2.5) * 0.22, 1.05 + Math.abs(k - 2.5) * -0.08, 0.5, 0.22 + r() * 0.08, 1.3 + r() * 0.8, 0.6 + r() * 0.3, (k - 2.5) * -0.22);
    for (let k = 0; k < 3; k++) crystal(torso, (k - 1) * 0.3, 0.45, 0.48, 0.12, 0.6, 1.3, (k - 1) * 0.3, ice2);
    const head = this.piv(torso, 0, 1.3, -0.18);
    this.ball(head, 0.3, skin, 0, 0.05, 0, 0.95, 1.1, 1);
    this.box(head, 0.48, 0.07, 0.12, ice2, 0, 0.14, -0.22);
    for (const s of [-1, 1]) this.ball(head, 0.06, dark, s * 0.11, 0.06, -0.25);
    const eyes = [-1, 1].map((s) => this.eye(head, 0xa0f0ff, 0.32, s * 0.11, 0.06, -0.3, true));
    this.box(head, 0.08, 0.12, 0.08, skin, 0, -0.02, -0.3);
    const jaw = this.piv(head, 0, -0.1, -0.05);
    this.box(jaw, 0.34, 0.1, 0.3, skin, 0, -0.06, -0.12);
    // a beard of icicles
    for (let k = 0; k < 7; k++) { const c = this.cone(jaw, 0.04, 0.3 + r() * 0.25, ice2, (k - 3) * 0.05, -0.2, -0.22 + Math.abs(k - 3) * 0.03, 4); c.rotation.x = Math.PI; }
    // his felt hat, rimed over, with a crown of icicles
    this.cyl(head, 0.42, 0.42, 0.04, felt, 0, 0.27, 0, 14);
    this.cyl(head, 0.25, 0.3, 0.26, felt, 0, 0.4, 0, 12);
    for (let k = 0; k < 7; k++) { const a = (k / 7) * TAU; crystal(head, Math.cos(a) * 0.26, 0.55, Math.sin(a) * 0.26, 0.06, 0.4 + r() * 0.3, Math.sin(a) * 0.4, -Math.cos(a) * 0.4); }
    const arms = [-1, 1].map((s) => {
      const sh = this.piv(torso, s * 0.88, 1.0, 0);
      this.ball(sh, 0.3, smock);
      for (let k = 0; k < 4; k++) crystal(sh, s * (0.05 + k * 0.08), 0.22, (k - 1.5) * 0.14, 0.17, 0.9 + r() * 0.6, (k - 1.5) * 0.4, -s * (0.3 + k * 0.2));
      this.bone(sh, [0, 0, 0], [0, -0.72, 0], 0.25, 0.2, smock);
      const el = this.piv(sh, 0, -0.72, 0);
      this.ball(el, 0.2, smock, 0, 0, 0, 1, 1, 1, 8, 6);
      this.bone(el, [0, 0, 0], [0, -0.66, 0], 0.21, 0.16, skin);
      crystal(el, s * 0.1, -0.3, 0.05, 0.08, 0.45, 0, -s * 1.3);
      const hand = this.piv(el, 0, -0.72, 0);
      this.ball(hand, 0.2, skin, 0, 0, 0, 1, 1.1, 1);
      return { sh, el, hand, s };
    });
    const hands = arms.map(({ hand }) => this.eye(hand, 0xb0f4ff, 0.6, 0, 0, 0, true));
    // the great pick in his right hand: haft along its +y, a head pointed both ends
    const pick = this.piv(arms[1].hand, 0, 0, 0);
    pick.rotation.x = -Math.PI / 2 + 0.3;
    this.bone(pick, [0, -0.6, 0], [0, 2.3, 0], 0.08, 0.07, haft, 6);
    const ph = this.piv(pick, 0, 2.2, 0);
    this.box(ph, 0.28, 0.3, 0.28, iron, 0, 0, 0);
    for (const s of [-1, 1]) {
      this.bone(ph, [0, 0, 0], [0, -0.18, s * 1.25], 0.14, 0.03, iron, 6);
      this.bone(ph, [0, 0.06, s * 0.3], [0, 0.1, s * 0.7], 0.06, 0.02, ice2, 4);
    }
    const rune = this.eye(ph, 0xa0f0ff, 0.6, 0, 0, 0, true);
    const fling = this.shatter(61, (m) => armour.has(m));
    const fall = this.shatter(67);

    const ease = this.easer();
    const id = this.group.id;
    let shell = -1, shellT = 0;
    return (dt, _state, moving, t, dead) => {
      // his shell of ice comes off in the second phase (all at once if we only just came in)
      if (shell < 0) { shell = this.bphase; if (shell >= 1) for (const m of armour) m.visible = false; }
      if (shell === 0 && this.bphase >= 1) { shell = 1; shellT = 0; }
      if (shell === 1 && dead <= 0) { shellT += dt; if (shellT < 3) fling(shellT); else for (const m of armour) m.visible = false; }
      const mv = clamp01(moving / 1.8), ph2 = this.phase * 2.4 * (shell ? 1.25 : 1);
      const w = this.wind, st = this.strike;
      const sw = ease(MV.SWIPE, dt, 8), sl = ease(MV.SLAM, dt, 8) + ease(MV.SPIKES, dt, 8), fr = ease(MV.FROST, dt), sh = ease(MV.SHATTER, dt), call = ease(MV.SUMMON, dt);
      legs.forEach(({ hip, knee }, i) => {
        const s = Math.sin(ph2 + i * Math.PI);
        hip.rotation.x = s * 0.4 * mv + sl * (0.35 * (1 - w)) ;
        knee.rotation.x = -Math.max(0, Math.cos(ph2 + i * Math.PI)) * 0.55 * mv - sl * 0.7 * (1 - w) - sh * 0.4;
      });
      const shake = sh * w * Math.sin(t * 45) * 0.03;
      rig.position.set(shake, 1.72 - Math.abs(Math.sin(ph2)) * 0.08 * mv - sl * (1 - w) * 0.35 - sh * 0.2, 0);
      torso.rotation.set(-0.1 - 0.06 * mv + sl * (-0.3 * w + 0.55 * (1 - w)) + sh * 0.45 + fr * -0.25 + call * -0.2 + Math.sin(t * 1.2 + id) * 0.02,
        sw * (0.9 * w - 0.8 * (1 - w)) + Math.sin(ph2) * 0.1 * mv, Math.sin(ph2) * 0.05 * mv);
      head.rotation.set(0.15 - fr * 0.45 + sh * 0.3 - sl * 0.2 * w, Math.sin(t * 0.5 + id) * 0.2 * (1 - mv), 0);
      jaw.rotation.x = 0.1 + fr * 0.4 + call * 0.4 + sh * w * 0.3;
      for (const { sh: S, el, hand, s } of arms) {
        const sway = Math.sin(ph2 + (s > 0 ? Math.PI : 0)) * 0.3 * mv;
        // at rest: pick held across the body
        let x = 0.55 + sway, z = s * 0.15, e = 0.9, hx = 0;
        if (s < 0) { x = 0.7 + sway * 0.5; z = 0.45; e = 1.3; }
        x += sl * (3.0 * w - 0.2 * (1 - w)) - st * sl * 0.6;
        e = e * (1 - sl) + sl * (0.2 + 0.3 * w);
        x += sw * (w * 1.2 + (1 - w) * 1.4);
        z += sw * s * (w * 0.6 - (1 - w) * 0.2);
        x = x * (1 - fr) + fr * 0.2; z = z * (1 - fr) + fr * s * 2.4; e = e * (1 - fr) + fr * 0.3;
        if (s > 0) { x = x * (1 - call) + call * 3.0; e = e * (1 - call) + call * 0.2; }
        x = x * (1 - sh) + sh * 0.9; e = e * (1 - sh) + sh * 1.6; hx = sh * 0.3;
        S.rotation.set(x, 0, z);
        el.rotation.x = e;
        hand.rotation.x = hx;
      }
      pick.rotation.set(-Math.PI / 2 + 0.3 + sl * (0.6 * w) - sw * 0.5, sw * 0.6, 0);
      const glow = (shell >= 1 ? 1 : 0.35) * (0.8 + 0.2 * Math.sin(t * 3 + id)) + sh * w * 0.8 + fr * 0.5;
      frost.color.setRGB(0.62 * glow, 0.9 * Math.min(1, glow), Math.min(1, glow));
      for (const e of eyes) { this.glowOp(e, dead > 0 ? Math.max(0, 1 - dead) : 0.8 + 0.2 * glow); e.scale.setScalar(0.28 + 0.15 * glow); }
      for (const hg of hands) { this.glowOp(hg, fr * (0.7 + 0.3 * Math.sin(t * 20)) + call * 0.5); hg.scale.setScalar(0.5 + fr * 1.2); }
      this.glowOp(rune, (0.4 + 0.6 * (sl + sw) * w) * (dead > 0 ? 0 : 1));
      if (dead > 0) {
        // down on his knees, then he bursts into blocks of ice
        const k1 = smooth(dead / 0.6), k2 = smooth((dead - 0.4) / 0.6);
        legs.forEach(({ hip, knee }) => { hip.rotation.x = 1.4 * k1; knee.rotation.x = -1.9 * k1; });
        rig.position.y = 1.72 - 0.85 * k1;
        torso.rotation.x = -0.1 + 0.5 * k2;
        head.rotation.x = 0.6 * k2;
        if (dead > 1.1) fall(dead - 1.1);
      }
    };
  }

  /**
   * The Owner's Ghost: the man who owned the quarries, still down here. A faded plum frock coat flaring
   * into nothing where his legs should be, a gold waistcoat, lace at his throat, a powdered wig and a
   * tricorne, a face gone to the bone and glowing green. A silver-topped cane in one hand, his ledger in
   * the other. He drifts, twitches, flickers out and back.
   */
  private owner(): Anim {
    const coat = this.mat(0x5a4068, { map: bhide("coat"), side: THREE.DoubleSide, e: 0x0c1a10, opacity: 0.86 });
    const coat2 = this.mat(0x46325a, { map: bhide("coat", 1, 2), side: THREE.DoubleSide, e: 0x0a160c, opacity: 0.86 });
    const waist = this.mat(0xb09040, { map: bhide("coat"), e: 0x1a2008, shine: 40, opacity: 0.9 });
    const linen = this.mat(0xe8e8dc, { e: 0x1a2a1a, side: THREE.DoubleSide, opacity: 0.9 });
    const wig = this.mat(0xe4e4dc, { map: hide("fur"), e: 0x1a2a1a, opacity: 0.92 });
    const face = this.mat(0xc0dcc0, { map: hide("flesh"), e: 0x24442a, opacity: 0.95 });
    const hatM = this.mat(0x54465c, { map: hide("leather"), e: 0x0a140a, opacity: 0.95, side: THREE.DoubleSide });
    const silver = this.mat(0xd0d0c8, { shine: 90, spec: 0xffffff, e: 0x1a2a1a, opacity: 0.95 });
    const caneM = this.mat(0x2a1a10, { shine: 60, opacity: 0.95 });
    const bookM = this.mat(0x6a2a18, { map: hide("leather"), e: 0x0a1a0a, opacity: 0.95 });
    const page = this.mat(0xe8dcc0, { e: 0x202010, opacity: 0.95 });
    const hollow = this.mat(0x010301, { opacity: 0.95 });
    const wisp = this.glowMat(0x40c070, 0.22, true);
    const wisp2 = this.glowMat(0x50c080, 0.18, true);

    const float = this.piv(this.group, 0, 0.5, 0);
    float.scale.setScalar(1.12);
    // the coat's skirts, flaring out, open at the front onto nothing but a green glow
    const gap = 0.9;
    const skirt = this.put(float, new THREE.Mesh(new THREE.LatheGeometry([[0.62, -0.3], [0.56, 0.1], [0.46, 0.5], [0.34, 0.9], [0.3, 1.05]].map(([x, y]) => new THREE.Vector2(x, y)), 14, Math.PI + gap / 2, TAU - gap), coat), 0, 0, 0);
    this.cone(float, 0.4, 1.2, wisp, 0, 0.35, 0, 8).rotation.x = Math.PI;
    // ragged tails off the hem, trailing into wisps
    const tails = Array.from({ length: 9 }, (_, k) => {
      const a = Math.PI + gap / 2 + ((k + 0.5) / 9) * (TAU - gap);
      const p = this.piv(float, Math.sin(a) * 0.58, -0.28, Math.cos(a) * 0.58);
      p.rotation.y = a;
      this.box(p, 0.2, 0.5, 0.02, k % 2 ? coat : coat2, 0, -0.22, 0);
      this.cone(p, 0.08, 0.5, wisp2, 0, -0.65, 0, 4).rotation.x = Math.PI;
      return p;
    });
    const body = this.piv(float, 0, 1.05, 0);
    this.ball(body, 0.3, waist, 0, 0.18, -0.02, 1, 1.15, 0.75, 10, 8);
    this.ball(body, 0.33, coat, 0, 0.42, 0.05, 1.15, 0.9, 0.8, 10, 8);
    for (const s of [-1, 1]) {
      const lap = this.box(body, 0.14, 0.55, 0.04, coat2, s * 0.2, 0.32, -0.24);
      lap.rotation.set(-0.15, s * 0.3, s * 0.15);
      for (let k = 0; k < 3; k++) this.ball(body, 0.025, silver, s * 0.08, 0.05 + k * 0.1, -0.24, 1, 1, 1, 6, 4);
    }
    // lace at the throat
    for (let k = 0; k < 4; k++) { const c = this.cone(body, 0.09 - k * 0.012, 0.12, linen, 0, 0.55 - k * 0.07, -0.22, 6); c.rotation.x = -0.3; }
    this.cyl(body, 0.13, 0.15, 0.1, linen, 0, 0.66, -0.02, 8);
    const heart = this.eye(body, 0x80ffa0, 0.9, 0, 0.3, 0, true);
    const head = this.piv(body, 0, 0.78, -0.03);
    this.ball(head, 0.17, face, 0, 0.06, 0, 0.88, 1.15, 0.95, 10, 8);
    for (const s of [-1, 1]) {
      this.ball(head, 0.05, hollow, s * 0.06, 0.08, -0.13, 1, 1.2, 0.7, 6, 5);
      this.ball(head, 0.035, hollow, s * 0.09, -0.02, -0.11, 1, 1, 0.6, 6, 4);
      // the wig's side rolls and the powdered mass of it
      for (let k = 0; k < 2; k++) { const roll = this.put(head, new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.028, 5, 8), wig), s * 0.17, 0.0 + k * 0.07, 0.03); roll.rotation.y = Math.PI / 2; }
    }
    this.ball(head, 0.19, wig, 0, 0.12, 0.05, 1, 0.9, 1, 10, 6);
    this.bone(head, [0, 0.0, 0.17], [0, -0.28, 0.24], 0.05, 0.03, wig, 5);
    this.box(head, 0.1, 0.06, 0.02, hollow, 0, -0.18, 0.24);
    this.box(head, 0.03, 0.05, 0.03, hollow, 0, 0.0, -0.16);
    const eyes = [-1, 1].map((s) => this.eye(head, 0x90ffa0, 0.2, s * 0.06, 0.08, -0.16, true));
    const jaw = this.piv(head, 0, -0.06, -0.02);
    this.box(jaw, 0.13, 0.07, 0.14, face, 0, -0.04, -0.06);
    for (let k = 0; k < 5; k++) this.box(jaw, 0.015, 0.025, 0.01, page, (k - 2) * 0.022, 0.0, -0.13);
    // the tricorne: a crown and three brims turned up into points, one to the front
    const hat = this.piv(head, 0, 0.27, 0.02);
    hat.scale.setScalar(1.25);
    this.cyl(hat, 0.15, 0.17, 0.12, hatM, 0, 0.05, 0, 10);
    const tri = new THREE.Shape();
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * TAU - Math.PI / 2, b = a + TAU / 6;
      const [x0, y0] = [Math.cos(a) * 0.38, Math.sin(a) * 0.38], [x1, y1] = [Math.cos(b) * 0.24, Math.sin(b) * 0.24];
      if (k === 0) tri.moveTo(x0, y0); else tri.lineTo(x0, y0);
      tri.quadraticCurveTo(x1 * 1.15, y1 * 1.15, Math.cos(a + TAU / 3) * 0.38, Math.sin(a + TAU / 3) * 0.38);
    }
    const brimG = new THREE.ShapeGeometry(tri, 3);
    brimG.rotateX(Math.PI / 2);
    this.put(hat, new THREE.Mesh(brimG, hatM), 0, -0.01, 0);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * TAU + TAU / 6 - Math.PI / 2;
      const side = this.box(hat, 0.34, 0.14, 0.02, hatM, Math.cos(a) * 0.17, 0.06, Math.sin(a) * 0.17);
      side.rotation.set(0, -a + Math.PI / 2, 0);
      side.rotateX(-0.5);
      this.box(hat, 0.3, 0.015, 0.025, silver, Math.cos(a) * 0.185, 0.12, Math.sin(a) * 0.185).rotation.set(0, -a + Math.PI / 2, 0);
    }
    const arms = [-1, 1].map((s) => {
      const sh = this.piv(body, s * 0.33, 0.55, 0.03);
      this.ball(sh, 0.1, coat);
      this.bone(sh, [0, 0, 0], [0, -0.35, 0], 0.08, 0.07, coat);
      const el = this.piv(sh, 0, -0.35, 0);
      this.bone(el, [0, 0, 0], [0, -0.3, 0], 0.07, 0.06, coat);
      this.cyl(el, 0.1, 0.12, 0.14, coat2, 0, -0.28, 0, 8);
      this.cone(el, 0.11, 0.1, linen, 0, -0.37, 0, 7).rotation.x = Math.PI;
      const hand = this.piv(el, 0, -0.42, 0);
      this.box(hand, 0.06, 0.1, 0.04, face, 0, -0.03, 0);
      for (let f = 0; f < 4; f++) this.bone(hand, [(f - 1.5) * 0.015, -0.07, 0], [(f - 1.5) * 0.02, -0.17, -0.03], 0.008, 0.004, face, 3);
      return { sh, el, hand, s };
    });
    // the cane in his right hand, the ledger in his left
    const cane = this.piv(arms[1].hand, 0, -0.06, 0);
    this.bone(cane, [0, 0.12, 0], [0, -1.05, 0], 0.018, 0.014, caneM, 5);
    this.ball(cane, 0.04, silver, 0, 0.14, 0, 1, 1, 1, 8, 6);
    this.cyl(cane, 0.02, 0.02, 0.05, silver, 0, -1.05, 0, 6);
    const book = this.piv(arms[0].hand, 0, -0.1, -0.03);
    this.box(book, 0.07, 0.34, 0.26, bookM, 0, 0, 0);
    this.box(book, 0.05, 0.32, 0.24, page, 0.012, 0, 0);
    const bookGlow = this.eye(book, 0x90ffa0, 0.4, 0, 0, 0, true);
    const trail = [0, 1, 2, 3, 4].map(() => this.eye(this.group, 0x70ff90, 0.5, 0, 0, 0, true));

    const ease = this.easer();
    const id = this.group.id;
    let hatOff = false, lit = 1;
    const hatAt = new THREE.Vector3();
    return (dt, state, moving, t, dead) => {
      const mv = clamp01(moving / 2), w = this.wind, st = this.strike;
      const cut = ease(MV.SWIPE, dt, 9), thr = ease(MV.THROW, dt, 8), cur = ease(MV.CURSE, dt), call = ease(MV.SUMMON, dt, 4);
      const blink = this.move === MV.BLINK ? (state === 2 ? smooth(this.moveT / 0.55) : 1) : 0;
      const bob = Math.sin(t * 1.6 + id) * 0.08;
      float.position.y = 0.5 + bob + call * 0.6 * (0.5 + 0.5 * w) + (dead > 0 ? dead * 0.45 : 0);
      float.rotation.x = 0.12 * mv + 0.05 * Math.sin(t * 0.9 + id);
      skirt.scale.set(1 + call * 0.25 + Math.sin(t * 2.1) * 0.03, 1, 1 + call * 0.25);
      tails.forEach((p, k) => { p.rotation.x = Math.sin(t * 2.4 + k * 1.3) * 0.25 + 0.35 * mv + call * 0.6; });
      // a twitch of the head every so often, as though something jerked it
      const twitch = Math.sin(t * 0.47 + id) > 0.96 ? Math.sin(t * 37) * 0.35 : 0;
      head.rotation.set(0.1 - call * 0.35 + cur * 0.1, Math.sin(t * 0.4 + id) * 0.3 * (1 - cur) + twitch, cur * 0.45 + Math.sin(t * 0.6) * 0.06);
      jaw.rotation.x = 0.15 + 0.1 * Math.sin(t * 0.8) + call * 0.7 + cur * 0.3 + thr * w * 0.2;
      body.rotation.set(-0.05 + cut * (0.2 * w - 0.25 * (1 - w)) + thr * (0.2 * w - 0.2 * (1 - w)), thr * (-0.5 * w + 0.4 * (1 - w)) + cur * -0.3, 0);
      const [L, R] = arms;
      // right: the cane, at his side, raised to strike, or pointed at you to curse
      let rx = 0.25 + Math.sin(t * 1.1) * 0.05, rz = 0.15, re = 0.3;
      rx = rx * (1 - cut) + cut * (2.9 * w + 0.6 * (1 - w)) - st * cut * 0.4; re = re * (1 - cut) + cut * (0.7 * w + 0.1);
      rx = rx * (1 - cur) + cur * 1.5; rz = rz * (1 - cur) + cur * 0.05; re = re * (1 - cur);
      rx = rx * (1 - call) + call * 0.8; rz = rz * (1 - call) + call * 1.3; re = re * (1 - call) + call * 0.4;
      R.sh.rotation.set(rx, 0, rz); R.el.rotation.x = re;
      cane.rotation.x = cur * 1.2 - cut * 0.4;
      // left: the ledger held to his chest, flung, or both arms out to call the dead
      let lx = 0.9, lz = -0.25, le = 1.5;
      lx = lx * (1 - thr) + thr * (w * 2.6 + (1 - w) * 1.2); lz = lz * (1 - thr) + thr * -0.3; le = le * (1 - thr) + thr * (0.9 * w + 0.1);
      lx = lx * (1 - call) + call * 0.8; lz = lz * (1 - call) - call * 1.3; le = le * (1 - call) + call * 0.4;
      L.sh.rotation.set(lx, 0, lz); L.el.rotation.x = le;
      book.visible = !(this.move === MV.THROW && state !== 2 && this.moveT < 1.4);
      // he flickers; blinking away he thins to nothing
      const flick = Math.sin(t * 13 + id) * Math.sin(t * 5.3) > 0.8 ? 0.55 : 1;
      lit = (1 - blink) * flick * (dead > 0 ? Math.max(0, 1 - dead / 3) : 1);
      for (const f of this.fades) f.m.opacity = f.a * lit * this.fade;
      float.scale.set(1.12 * (1 - blink * 0.6), 1.12 * (1 + blink * 0.8), 1.12 * (1 - blink * 0.6));
      for (const e of eyes) { this.glowOp(e, (0.9 + cur * 0.5) * lit); e.scale.setScalar(0.18 + cur * 0.25 + call * 0.15); }
      this.glowOp(heart, (0.35 + 0.15 * Math.sin(t * 2) + call * 0.5) * lit);
      this.glowOp(bookGlow, (0.3 + thr * w) * lit * (book.visible ? 1 : 0));
      trail.forEach((s, k) => {
        const u = (t * 0.4 + k / trail.length) % 1;
        s.position.set(Math.sin(k * 2.3 + t) * 0.35, 0.3 + u * 2.2 + float.position.y - 0.5, Math.cos(k * 1.7 + t) * 0.35 + 0.2);
        this.glowOp(s, (1 - u) * 0.35 * lit);
      });
      if (dead > 0) {
        // he rises and stretches thin, turning, and is gone; his hat drops to the floor
        if (!hatOff) { hatOff = true; this.group.attach(hat); hatAt.copy(hat.position); }
        const k = smooth(dead / 3);
        float.scale.set(1.12 * (1 - 0.5 * k), 1.12 * (1 + 0.6 * k), 1.12 * (1 - 0.5 * k));
        float.rotation.y = dead * dead * 0.8;
        jaw.rotation.x = 0.9;
        const tf = Math.min(dead, 0.55);
        hat.position.set(hatAt.x + tf * 0.4, Math.max(0.03, hatAt.y - 4.9 * tf * tf * 2.2), hatAt.z + tf * 0.3);
        hat.rotation.set(Math.min(dead * 3, 0.3), dead < 0.55 ? dead * 4 : 2.2, Math.min(dead * 2, 0.2));
      }
    };
  }
}

