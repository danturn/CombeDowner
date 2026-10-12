// Monster models for the mines: low-poly figures built from primitives, painted with small pixel-art
// hides (art.ts), lit by their own glowing eyes and lamps, and animated in code (no skeletons).
// Each kind is built so its silhouette reads at a glance in a dark heading, Ultima Underworld style.
import * as THREE from "three";
import { beam, mobHide, MobHide, wispFace } from "./art";

export type MobKind = "ghoul" | "bat" | "golem" | "blob" | "grout" | "rat" | "headless" | "reaper" | "gazer" | "spider" | "wisp";

const FLASH = 0.12;
const TAU = Math.PI * 2;
type P3 = [number, number, number];
const UP = new THREE.Vector3(0, 1, 0);

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
function hide(k: MobHide, rx = 1, ry = 1): THREE.Texture {
  const key = `${k}:${rx}:${ry}`;
  let t = hides.get(key);
  if (t) return t;
  let b = hides.get(`${k}:1:1`);
  if (!b) { b = mobHide(k, 3); hides.set(`${k}:1:1`, b); }
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
};
/** How long after death each kind lies there before it fades away. */
const FADE_AT: Record<MobKind, number> = {
  ghoul: 1.8, bat: 1.4, golem: 2.4, blob: 1.6, grout: 3.0, rat: 1.3,
  headless: 2.0, reaper: 2.4, gazer: 1.5, spider: 1.6, wisp: 0.9,
};

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

  constructor(readonly kind: MobKind, opts: { champion?: boolean } = {}) {
    this.champion = !!opts.champion;
    this.anim = this[kind]();
    if (this.champion) this.crown();
    this.group.traverse((o) => { o.castShadow = false; o.receiveShadow = false; });
  }

  update(dt: number, state: number, moving: number, t: number): void {
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
    if (this.dying) for (const f of this.fades) f.m.opacity = f.a * this.fade;
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
    const gore = this.mat(0x8a1010, { e: 0x3a0404, shine: 70, spec: 0x664444 });
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
}
