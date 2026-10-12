// Monster models for the mines: low-poly figures built from boxes and spheres, animated in code (no skeletons).
import * as THREE from "three";

export type MobKind = "ghoul" | "bat" | "golem" | "blob" | "grout" | "rat" | "headless" | "reaper" | "gazer" | "spider" | "wisp";

const FLASH = 0.12;
let eyeTex: THREE.CanvasTexture | null = null;

/** A small white radial glow, tinted per sprite. Shared by every mob. */
function eyeGlow(): THREE.CanvasTexture {
  if (eyeTex) return eyeTex;
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.35, "rgba(255,255,255,0.7)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 32, 32);
  eyeTex = new THREE.CanvasTexture(c);
  eyeTex.magFilter = THREE.NearestFilter;
  return eyeTex;
}

/** Tiny seeded random so a given kind always looks the same shape. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Height of the top of each model above its origin, used to float a champion's key above the head. */
const TOP: Record<MobKind, number> = {
  ghoul: 1.7, bat: 0.3, golem: 2.4, blob: 0.8, grout: 2.6, rat: 0.4,
  headless: 2.0, reaper: 2.6, gazer: 0.75, spider: 0.6, wisp: 0.3,
};

/** A bit of scenery for each kind: moving parts are kept here so update() can pose them. */
type Anim = (dt: number, state: number, moving: number, t: number, dead: number) => void;

export class MobView {
  readonly group = new THREE.Group();
  private mats: { m: THREE.MeshLambertMaterial; base: THREE.Color }[] = [];
  private fades: (THREE.Material & { opacity: number })[] = [];
  private flashT = 0;
  private deadT = 0;
  private phase = 0;
  private wind = 0;
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
    this.phase += dt * moving;
    this.wind += ((state === 2 ? 1 : 0) - this.wind) * Math.min(1, dt * 9);
    this.anim(dt, state, moving, t, this.deadT);
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

  private mat(color: number, emissive = 0x000000): THREE.MeshLambertMaterial {
    const m = new THREE.MeshLambertMaterial({ color, emissive });
    this.mats.push({ m, base: new THREE.Color(emissive) });
    this.fades.push(m);
    return m;
  }

  private box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z);
    return b;
  }

  private ball(r: number, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
    const b = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), m);
    b.position.set(x, y, z);
    return b;
  }

  private eye(color: number, size: number, x: number, y: number, z: number): THREE.Sprite {
    const m = new THREE.SpriteMaterial({
      map: eyeGlow(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false,
    });
    this.fades.push(m);
    const s = new THREE.Sprite(m);
    s.scale.set(size, size, 1);
    s.position.set(x, y, z);
    return s;
  }

  private cyl(rt: number, rb: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 6): THREE.Mesh {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
    b.position.set(x, y, z);
    return b;
  }

  /** Make every material able to fade out. Call once the model is built. */
  private soften(): void {
    for (const m of this.fades) (m as THREE.Material).transparent = true;
  }

  private fadeTo(f: number): void {
    for (const m of this.fades) m.opacity = f;
    this.group.visible = f > 0;
  }

  /** Champion look: gold tint, a bigger body and a spinning iron key. */
  private crown(): void {
    const gold = new THREE.Color(0x3a2c08);
    for (const { m, base } of this.mats) { base.add(gold); m.emissive.copy(base); }
    this.group.scale.setScalar(1.25);
    const iron = this.mat(0x34343a, 0x2a2008);
    iron.transparent = true;
    const key = new THREE.Group();
    key.add(new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.025, 6, 10), iron).translateY(0.2));
    key.add(this.box(0.035, 0.3, 0.035, iron, 0, 0.02, 0), this.box(0.09, 0.035, 0.035, iron, 0.05, -0.12, 0),
      this.box(0.07, 0.035, 0.035, iron, 0.04, -0.06, 0));
    const top = TOP[this.kind] + 0.4;
    key.position.y = top;
    this.group.add(key);
    const inner = this.anim;
    this.anim = (dt, state, moving, t, dead) => {
      inner(dt, state, moving, t, dead);
      key.rotation.y = t * 1.5;
      let y = top + Math.sin(t * 2) * 0.04;
      if (this.kind === "spider" && state === 0) y = -0.5;
      if (dead > 0) y = Math.max(0.15, y - 4.9 * dead * dead);
      key.position.y = y;
      key.visible = dead < 1.5;
    };
  }

  private pivot(parent: THREE.Object3D, x: number, y: number, z: number): THREE.Group {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  }

  // ---- kinds ----

  /** Pale, hunched quarryman ghost. */
  private ghoul(): Anim {
    const skin = this.mat(0x8fa393);
    const cloth = this.mat(0x5d6a60);
    const capM = this.mat(0x3a3d38);
    const rig = this.pivot(this.group, 0, 0, 0);
    const legs = [-1, 1].map((s) => {
      const p = this.pivot(rig, s * 0.12, 0.8, 0);
      p.add(this.box(0.17, 0.8, 0.2, cloth, 0, -0.4, 0));
      return p;
    });
    const torso = this.pivot(rig, 0, 0.8, 0);
    torso.rotation.x = -0.45;
    torso.add(this.box(0.42, 0.72, 0.26, cloth, 0, 0.36, 0));
    const head = this.ball(0.16, skin, 0, 0.84, -0.05);
    torso.add(head);
    torso.add(this.box(0.34, 0.1, 0.34, capM, 0, 1.0, -0.05));
    torso.add(this.box(0.3, 0.03, 0.16, capM, 0, 0.96, -0.2));
    head.add(this.eye(0xa8ffb0, 0.16, -0.06, 0.02, -0.14), this.eye(0xa8ffb0, 0.16, 0.06, 0.02, -0.14));
    const arms = [-1, 1].map((s) => {
      const p = this.pivot(torso, s * 0.28, 0.64, 0);
      p.add(this.box(0.1, 0.9, 0.1, skin, 0, -0.45, 0), this.box(0.14, 0.14, 0.14, skin, 0, -0.95, 0));
      return p;
    });
    for (const m of this.fades) (m as THREE.Material).transparent = true;
    return (_dt, _state, moving, t, dead) => {
      const mv = clamp01(moving / 2), ph = this.phase * 4;
      legs[0].rotation.x = Math.sin(ph) * 0.5 * mv;
      legs[1].rotation.x = -Math.sin(ph) * 0.5 * mv;
      torso.rotation.x = -0.45 - this.wind * 0.1 + Math.sin(t * 1.5) * 0.03;
      arms.forEach((a, i) => {
        const s = i ? 1 : -1;
        const sway = Math.sin(ph + (i ? Math.PI : 0)) * 0.45 * mv + Math.sin(t * 1.3 + i) * 0.05;
        a.rotation.x = 0.4 + sway + this.wind * 2.2;
        a.rotation.z = s * (0.1 + this.wind * 0.1);
      });
      const k = clamp01(dead / 0.6);
      rig.rotation.x = -k * 1.45;
      rig.position.y = -k * 0.1;
      const fade = dead > 0.6 ? 1 - clamp01((dead - 0.6) / 0.5) : 1;
      for (const m of this.fades) m.opacity = fade;
      this.group.visible = fade > 0;
    };
  }

  /** Greater horseshoe bat. */
  private bat(): Anim {
    const fur = this.mat(0x4a3526);
    const skin = this.mat(0x2e2219);
    const drop = this.pivot(this.group, 0, 0, 0);
    const body = this.ball(0.11, fur);
    body.scale.set(0.9, 0.8, 1.2);
    drop.add(body, this.ball(0.075, fur, 0, 0.04, -0.14));
    drop.add(this.box(0.04, 0.09, 0.02, fur, -0.04, 0.12, -0.14), this.box(0.04, 0.09, 0.02, fur, 0.04, 0.12, -0.14));
    drop.add(this.eye(0xff3020, 0.07, -0.03, 0.05, -0.2), this.eye(0xff3020, 0.07, 0.03, 0.05, -0.2));
    const wings = [-1, 1].map((s) => {
      const p = this.pivot(drop, s * 0.08, 0.02, 0);
      const w = this.box(0.55, 0.012, 0.26, skin, s * 0.28, 0, 0.02);
      (w.material as THREE.MeshLambertMaterial).side = THREE.DoubleSide;
      p.add(w, this.box(0.55, 0.02, 0.03, fur, s * 0.28, 0.005, -0.1));
      return p;
    });
    return (_dt, state, _moving, t, dead) => {
      const alive = state !== 3;
      const flap = alive ? Math.sin(t * (state === 2 ? 34 : 26) + this.group.id) * 0.8 : 0.9;
      wings[0].rotation.z = flap;
      wings[1].rotation.z = -flap;
      if (alive) {
        drop.position.y = Math.sin(t * 3 + this.group.id) * 0.07;
        drop.rotation.set(0, 0, 0);
        drop.rotation.x = state === 2 ? -0.5 : 0;
      } else {
        const k = clamp01(dead / 0.5);
        drop.position.y = -1.5 * k * k;
        drop.rotation.z = k * 5;
        drop.rotation.x = k * 1.2;
      }
    };
  }

  /** Bath-stone golem made of stacked ashlar blocks. */
  private golem(): Anim {
    const stone = this.mat(0xd9cba8);
    const stone2 = this.mat(0xc9b992);
    const glowM = this.mat(0x6a3410, 0xff6a10);
    const r = seeded(7);
    // chunks fall apart when it dies; each is a top-level part with its resting pose
    const chunks: { o: THREE.Object3D; p: THREE.Vector3; v: THREE.Vector3; spin: THREE.Vector3 }[] = [];
    const add = (o: THREE.Object3D, x: number, y: number, z: number) => {
      o.position.set(x, y, z);
      o.rotation.y += (r() - 0.5) * 0.12;
      this.group.add(o);
      chunks.push({
        o, p: o.position.clone(),
        v: new THREE.Vector3((r() - 0.5) * 2.4, 1 + r() * 1.5, (r() - 0.5) * 2.4),
        spin: new THREE.Vector3((r() - 0.5) * 6, (r() - 0.5) * 4, (r() - 0.5) * 6),
      });
    };
    const legL = this.box(0.55, 0.8, 0.6, stone);
    const legR = this.box(0.55, 0.8, 0.6, stone2);
    add(legL, -0.3, 0.4, 0);
    add(legR, 0.3, 0.4, 0);
    add(this.box(1.15, 0.25, 0.75, stone2), 0, 0.92, 0);
    add(this.box(1.3, 0.55, 0.85, stone), 0, 1.32, 0);
    const chest = this.box(1.55, 0.5, 0.9, stone2);
    chest.add(this.box(0.05, 0.4, 0.02, glowM, 0.1, 0, -0.46), this.eye(0xff7a20, 0.5, 0.1, 0, -0.5));
    add(chest, 0, 1.82, 0);
    const head = this.box(0.55, 0.38, 0.5, stone);
    head.add(this.eye(0xff8a20, 0.2, -0.13, 0.03, -0.27), this.eye(0xff8a20, 0.2, 0.13, 0.03, -0.27));
    add(head, 0, 2.14, 0);
    const arms = [-1, 1].map((s) => {
      const a = new THREE.Group();
      a.add(this.box(0.42, 0.65, 0.42, stone, 0, -0.32, 0), this.box(0.52, 0.55, 0.52, stone2, 0, -0.9, 0));
      add(a, s * 0.98, 1.95, 0);
      return a;
    });
    const rest = chunks.map((c) => c.o.rotation.clone());
    return (_dt, _state, moving, _t, dead) => {
      const mv = clamp01(moving / 1.5), ph = this.phase * 2.2;
      const stomp = Math.abs(Math.sin(ph)) * mv;
      if (dead <= 0) {
        chunks.forEach((c, i) => { c.o.position.copy(c.p); c.o.rotation.copy(rest[i]); });
        legL.rotation.x = Math.sin(ph) * 0.35 * mv;
        legR.rotation.x = -Math.sin(ph) * 0.35 * mv;
        const bob = -stomp * 0.07;
        chunks.forEach((c) => { if (c.o !== legL && c.o !== legR) c.o.position.y = c.p.y + bob; });
        arms.forEach((a, i) => {
          const sway = Math.sin(ph + (i ? Math.PI : 0)) * 0.3 * mv;
          a.rotation.x = sway + this.wind * 2.9;
          a.rotation.z = (i ? 1 : -1) * (0.05 + this.wind * 0.12);
        });
      } else {
        // tumble: ballistic fall to the floor with a bit of spin
        chunks.forEach((c, i) => {
          const y = c.p.y + c.v.y * dead - 4.9 * dead * dead;
          const k = Math.min(dead, 1);
          c.o.position.set(c.p.x + c.v.x * k * 0.6, Math.max(0.3, y), c.p.z + c.v.z * k * 0.6);
          c.o.rotation.set(rest[i].x + c.spin.x * k * 0.3, rest[i].y + c.spin.y * k * 0.3, rest[i].z + c.spin.z * k * 0.3);
        });
        glowM.emissive.set(0x000000);
      }
    };
  }

  /** Lump of foamed concrete. */
  private blob(): Anim {
    const m = this.mat(0xb9b6ae);
    const m2 = this.mat(0xa6a39b);
    const lump = this.pivot(this.group, 0, 0, 0);
    lump.add(this.ball(0.36, m, 0, 0.36, 0), this.ball(0.26, m2, 0.2, 0.3, 0.12), this.ball(0.24, m2, -0.22, 0.28, -0.1),
      this.ball(0.2, m, 0.04, 0.58, 0.05));
    lump.add(this.ball(0.12, m, -0.1, 0.18, 0.28));
    const dark = this.mat(0x15130f, 0x1a1a0a);
    lump.add(this.ball(0.045, dark, -0.1, 0.5, -0.32), this.ball(0.045, dark, 0.1, 0.5, -0.32));
    lump.add(this.eye(0xaaa070, 0.12, -0.1, 0.5, -0.34), this.eye(0xaaa070, 0.12, 0.1, 0.5, -0.34));
    return (_dt, _state, moving, t, dead) => {
      const mv = clamp01(moving / 1.5);
      let s = Math.sin(this.phase * 5) * 0.16 * mv + Math.sin(t * 1.6) * 0.03;
      s += Math.sin(t * 30) * 0.05 * this.wind;
      const squat = this.wind * 0.18;
      let sx = 1 + s + squat, sy = 1 - s - squat * 1.5;
      if (dead > 0) {
        const k = clamp01(dead / 0.5);
        sy = (1 - k) * sy + k * 0.12;
        sx = (1 - k) * sx + k * 1.7;
      }
      lump.scale.set(sx, sy, sx);
    };
  }

  /** The Grout: boss mass of foamed concrete. */
  private grout(): Anim {
    const r = seeded(31);
    const shades = [this.mat(0xa9a69e), this.mat(0xb9b6ae), this.mat(0x9b988f), this.mat(0xbab4a0)];
    const mass = this.pivot(this.group, 0, 0, 0);
    const balls: { o: THREE.Mesh; p: THREE.Vector3; ph: number; sp: number }[] = [];
    const put = (rad: number, x: number, y: number, z: number) => {
      const o = this.ball(rad, shades[balls.length % shades.length], x, y, z);
      mass.add(o);
      balls.push({ o, p: o.position.clone(), ph: r() * 6.28, sp: 0.6 + r() * 0.9 });
    };
    put(1.0, 0, 1.0, 0);
    const n = 12;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r() * 0.4, d = 0.7 + r() * 0.7, rad = 0.4 + r() * 0.5;
      put(rad, Math.cos(a) * d, rad * 0.8 + r() * 1.1, Math.sin(a) * d);
    }
    // eyes sit on the front-most balls
    const front = balls.filter((b) => b.p.z < -0.2).sort((a, b) => a.p.z - b.p.z).slice(0, 6);
    for (const b of front) {
      const rad = (b.o.geometry as THREE.SphereGeometry).parameters.radius;
      const dir = new THREE.Vector3((r() - 0.5) * 0.7, 0.1 + r() * 0.3, -1).normalize();
      const p = b.p.clone().addScaledVector(dir, rad * 0.97);
      mass.add(this.eye(0xe8e040, 0.28 + r() * 0.18, p.x, p.y, p.z));
    }
    let rear = 0;
    return (dt, _state, moving, t, dead) => {
      for (const b of balls) {
        const k = 1 + Math.sin(t * b.sp + b.ph) * 0.07;
        b.o.scale.setScalar(k);
        b.o.position.set(b.p.x, b.p.y + Math.sin(t * b.sp * 0.8 + b.ph) * 0.05, b.p.z);
      }
      rear += (this.wind - rear) * Math.min(1, dt * 5);
      let sy = 1 + rear * 0.3 + Math.sin(this.phase * 2) * 0.03 * clamp01(moving / 1.5), sx = 1 - rear * 0.08;
      let y = 0;
      if (dead > 0) {
        const k = clamp01(dead / 2);
        sy = sy * (1 - k) + 0.12 * k;
        sx = sx * (1 - k) + 1.25 * k;
        y = -0.1 * k;
      }
      mass.scale.set(sx, sy, sx);
      mass.position.y = y;
    };
  }

  /** Pit rat: low, quick, red-eyed. */
  private rat(): Anim {
    const fur = this.mat(0x4b3f33);
    const fur2 = this.mat(0x362d25);
    const pink = this.mat(0x9a6a64);
    const rig = this.pivot(this.group, 0, 0, 0);
    const body = this.ball(0.1, fur, 0, 0.17, 0.02);
    body.scale.set(0.85, 0.8, 1.45);
    rig.add(body, this.ball(0.085, fur2, 0, 0.21, 0.1));
    rig.add(this.ball(0.06, fur, 0, 0.18, -0.15));
    const snout = this.cyl(0, 0.045, 0.14, fur2, 0, 0.16, -0.25);
    snout.rotation.x = -Math.PI / 2;
    rig.add(snout, this.ball(0.018, pink, 0, 0.16, -0.32));
    for (const s of [-1, 1]) {
      const ear = this.box(0.045, 0.055, 0.015, pink, s * 0.045, 0.25, -0.12);
      ear.rotation.z = -s * 0.3;
      rig.add(ear);
      rig.add(this.eye(0xff2a18, 0.07, s * 0.04, 0.21, -0.2));
    }
    // legs: FL, FR, BL, BR
    const legs = [[-1, -0.08], [1, -0.08], [-1, 0.1], [1, 0.1]].map(([s, z]) => {
      const p = this.pivot(rig, s * 0.065, 0.12, z);
      p.add(this.box(0.035, 0.13, 0.05, fur2, 0, -0.06, 0));
      return p;
    });
    const tailA = this.pivot(rig, 0, 0.2, 0.12);
    tailA.add(this.box(0.015, 0.015, 0.18, pink, 0, 0, 0.09));
    const tailB = this.pivot(tailA, 0, 0, 0.18);
    tailB.add(this.box(0.012, 0.012, 0.16, pink, 0, 0, 0.08));
    this.soften();
    return (_dt, _state, moving, t, dead) => {
      const mv = clamp01(moving / 2), ph = this.phase * 7;
      legs.forEach((l, i) => { l.rotation.x = Math.sin(ph + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.9 * mv; });
      const k = clamp01(dead / 0.35);
      rig.position.y = Math.abs(Math.sin(ph)) * 0.02 * mv - k * 0.05;
      rig.rotation.x = this.wind * 0.35;
      rig.rotation.z = k * 1.5;
      tailA.rotation.set(-0.25, Math.sin(t * 5) * 0.4 + Math.sin(ph * 0.5) * 0.3 * mv, 0);
      tailB.rotation.y = Math.sin(t * 5 + 1) * 0.6;
      this.fadeTo(dead > 0.7 ? 1 - clamp01((dead - 0.7) / 0.5) : 1);
    };
  }

  /** Headless: gaunt quarryman in a ragged smock, blades for hands. */
  private headless(): Anim {
    const smock = this.mat(0x6b5f4a);
    const rag = this.mat(0x54493a);
    const skin = this.mat(0x7c7468);
    const stump = this.mat(0x5a1410, 0x2a0605);
    const wound = this.mat(0xa02820, 0x501008);
    const rust = this.mat(0x6e3a1e);
    const rig = this.pivot(this.group, 0, 0, 0);
    const legs = [-1, 1].map((s) => {
      const p = this.pivot(rig, s * 0.13, 0.8, 0);
      p.add(this.box(0.15, 0.8, 0.17, rag, 0, -0.4, 0));
      return p;
    });
    const torso = this.pivot(rig, 0, 0.8, 0);
    torso.add(this.box(0.52, 0.9, 0.32, smock, 0, 0.45, 0), this.box(0.7, 0.14, 0.3, smock, 0, 0.84, 0));
    torso.add(this.box(0.6, 0.3, 0.38, rag, 0, 0.0, 0));
    torso.add(this.box(0.12, 0.3, 0.03, rag, -0.15, -0.28, -0.18), this.box(0.14, 0.4, 0.03, rag, 0.1, -0.33, -0.18),
      this.box(0.1, 0.25, 0.03, rag, 0.2, -0.2, 0.18));
    torso.add(this.cyl(0.08, 0.11, 0.2, stump, 0, 0.98, -0.02), this.cyl(0.065, 0.065, 0.02, wound, 0, 1.09, -0.02));
    torso.add(this.eye(0xb02010, 0.2, 0, 1.1, -0.02));
    const arms = [-1, 1].map((s) => {
      const p = this.pivot(torso, s * 0.38, 0.82, 0);
      p.add(this.box(0.1, 1.05, 0.1, skin, 0, -0.52, 0), this.box(0.13, 0.13, 0.13, skin, 0, -1.08, 0));
      // curved pick head: crossbar with two hooked tips
      const head = this.pivot(p, 0, -1.12, 0);
      head.add(this.box(0.05, 0.05, 0.5, rust), this.box(0.05, 0.05, 0.05, rust, 0, -0.08, 0));
      const tipF = this.box(0.05, 0.05, 0.2, rust, 0, -0.07, -0.32);
      tipF.rotation.x = 0.7;
      const tipB = this.box(0.05, 0.05, 0.14, rust, 0, -0.05, 0.28);
      tipB.rotation.x = -0.6;
      head.add(tipF, tipB);
      return p;
    });
    this.soften();
    return (_dt, _state, moving, t, dead) => {
      const mv = clamp01(moving / 1.5), ph = this.phase * 2.5;
      legs[0].rotation.x = Math.sin(ph) * 0.5 * mv;
      legs[1].rotation.x = -Math.sin(ph) * 0.5 * mv;
      // lurch: lean into each step, lean back to wind up
      torso.rotation.x = -0.1 - mv * 0.12 + Math.sin(ph * 2) * 0.06 * mv + this.wind * 0.3 + Math.sin(t * 1.2) * 0.02;
      torso.rotation.z = Math.sin(ph) * 0.1 * mv;
      arms.forEach((a, i) => {
        const s = i ? 1 : -1;
        a.rotation.x = 0.15 + Math.sin(ph + (i ? Math.PI : 0)) * 0.3 * mv + this.wind * 2.9;
        a.rotation.z = s * (0.08 - this.wind * 0.08);
      });
      const k = clamp01(dead / 0.7);
      rig.position.y = -Math.abs(Math.sin(ph)) * 0.04 * mv - k * 0.12;
      rig.rotation.x = -k * 1.5;
      this.fadeTo(dead > 0.7 ? 1 - clamp01((dead - 0.7) / 0.5) : 1);
    };
  }

  /** Root reaper: a tree root grown down through the roof. Still until it notices you. */
  private reaper(): Anim {
    const bark = this.mat(0x5a4330);
    const bark2 = this.mat(0x4a3626);
    const rootM = this.mat(0x4e3b2a);
    const dark = this.mat(0x120c08);
    const rig = this.pivot(this.group, 0, 0, 0);
    const sway = this.pivot(rig, 0, 0.6, 0);
    const low = this.cyl(0.3, 0.42, 1.0, bark, 0, 0.4, 0, 7);
    low.rotation.z = 0.08;
    const mid = this.cyl(0.26, 0.3, 0.9, bark2, 0.05, 1.2, 0, 7);
    mid.rotation.set(0.05, 0, -0.12);
    const knot = this.ball(0.3, bark, 0, 1.65, -0.02);
    knot.scale.set(1, 1.1, 0.95);
    const hollow = this.ball(0.2, dark, 0, 1.62, -0.23);
    hollow.scale.set(0.9, 1.2, 0.4);
    sway.add(low, mid, knot, hollow);
    for (const [x, z, tilt] of [[-0.12, 0, 0.4], [0.1, 0.05, -0.5], [0, -0.1, 0.1]]) {
      const tw = this.cyl(0, 0.04, 0.3, bark2, x, 1.97, z, 4);
      tw.rotation.z = tilt;
      sway.add(tw);
    }
    const eyes = [-1, 1].map((s) => this.eye(0xffa020, 0.2, s * 0.09, 1.68, -0.33));
    sway.add(...eyes);
    // splayed root legs
    const legs = [0, 1, 2, 3, 4].map((i) => {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      const hip = this.pivot(rig, Math.cos(a) * 0.2, 0.55, Math.sin(a) * 0.2);
      hip.rotation.y = -a;
      const j = this.pivot(hip, 0, 0, 0);
      j.rotation.z = 1;
      j.add(this.cyl(0.13, 0.04, 1.0, rootM, 0, -0.5, 0));
      return j;
    });
    // branch arms with twig claws
    const arms = [-1, 1].map((s) => {
      const p = this.pivot(sway, s * 0.38, 1.2, 0);
      const arm = this.cyl(0.09, 0.06, 1.3, bark, 0, -0.65, 0);
      arm.rotation.x = 0;
      p.add(arm, this.cyl(0, 0.03, 0.3, bark2, s * 0.08, -0.5, -0.05, 4));
      for (const c of [-0.5, 0, 0.5]) {
        const claw = this.pivot(p, 0, -1.3, 0);
        claw.rotation.set(0.3 + Math.abs(c) * 0.2, c * 0.4, c);
        claw.add(this.cyl(0, 0.03, 0.28, bark2, 0, -0.14, 0, 4));
      }
      return p;
    });
    this.soften();
    let glow = 0.15;
    return (dt, state, moving, t, dead) => {
      const awake = state === 1 || state === 2;
      glow += ((awake ? 1 : 0.15) - glow) * Math.min(1, dt * 4);
      const go = awake ? 1 : 0;
      const mv = clamp01(moving / 1.5), ph = this.phase * 2;
      sway.rotation.z = go * (Math.sin(t * 1.4) * 0.05 + Math.sin(ph) * 0.06 * mv);
      sway.rotation.x = go * Math.sin(t * 0.9) * 0.03;
      sway.rotation.y = this.wind * 0.4;
      legs.forEach((l, i) => { l.rotation.z = 1 + Math.sin(ph * 1.5 + i * 1.3) * 0.25 * mv; });
      arms.forEach((a, i) => {
        const s = i ? 1 : -1;
        a.rotation.x = go * Math.sin(t * 1.1 + i * 2) * 0.08 + (i ? -this.wind * 2.4 : 0);
        a.rotation.z = s * (0.25 + this.wind * 0.3 * i + go * 0.05 * Math.sin(t * 1.3 + i));
      });
      const k = clamp01(dead / 1.0);
      rig.rotation.z = k * 1.45;
      rig.position.y = -k * 0.1;
      const fade = dead > 1 ? 1 - clamp01((dead - 1) / 0.6) : 1;
      this.fadeTo(fade);
      for (const e of eyes) {
        e.scale.setScalar(0.08 + 0.14 * glow);
        (e.material as THREE.SpriteMaterial).opacity = (0.2 + 0.8 * glow) * fade;
      }
    };
  }

  /** Gazer: a floating eyeball with a ring of eyestalks. Centred on the origin. */
  private gazer(): Anim {
    const flesh = this.mat(0x9a5f55);
    const flesh2 = this.mat(0x7e4a44);
    const white = this.mat(0xe8e2d0, 0x1a1a14);
    const irisM = this.mat(0x3c9a6a, 0x0c3a22);
    const pupilM = this.mat(0x080606);
    const mouthM = this.mat(0x2a0c0e);
    const tooth = this.mat(0xd8d0b4);
    const rig = this.pivot(this.group, 0, 0, 0);
    const body = this.ball(0.38, flesh);
    rig.add(body, this.ball(0.2, white, 0, 0.06, -0.28), this.ball(0.12, irisM, 0, 0.06, -0.41),
      this.ball(0.06, pupilM, 0, 0.06, -0.49));
    const charge = this.eye(0xa0ffd0, 0.1, 0, 0.06, -0.58);
    rig.add(charge);
    rig.add(this.box(0.34, 0.06, 0.08, mouthM, 0, -0.24, -0.29));
    for (let i = 0; i < 6; i++) {
      rig.add(this.box(0.03, 0.06, 0.03, tooth, -0.12 + i * 0.048, i % 2 ? -0.265 : -0.215, -0.335));
    }
    const stalks = [0, 1, 2, 3, 4, 5, 6].map((i) => {
      const a = (i / 7) * Math.PI * 2;
      const base = this.pivot(rig, Math.cos(a) * 0.2, 0.28, Math.sin(a) * 0.2);
      base.rotation.y = -a;
      const j = this.pivot(base, 0, 0, 0);
      const tilt = 0.5 + (i % 3) * 0.15;
      j.add(this.box(0.035, 0.26, 0.035, flesh2, 0, 0.13, 0));
      const knee = this.pivot(j, 0, 0.26, 0);
      knee.add(this.box(0.03, 0.22, 0.03, flesh2, 0, 0.11, 0), this.ball(0.045, flesh, 0, 0.24, 0),
        this.eye(i % 2 ? 0xffd060 : 0xff9040, 0.14, 0, 0.25, 0));
      return { j, knee, tilt, ph: i * 1.7 };
    });
    this.soften();
    const id = this.group.id;
    return (_dt, _state, _moving, t, dead) => {
      const w = this.wind;
      const k = clamp01(dead / 0.8);
      const wave = 1 - k * 0.7;
      for (const s of stalks) {
        s.j.rotation.z = -s.tilt + Math.sin(t * 1.7 + s.ph) * 0.25 * wave;
        s.j.rotation.x = Math.sin(t * 1.3 + s.ph * 2) * 0.25 * wave;
        s.knee.rotation.z = Math.sin(t * 2.3 + s.ph) * 0.5 * wave - k * 0.8;
        s.knee.rotation.x = Math.cos(t * 1.9 + s.ph) * 0.4 * wave;
      }
      body.scale.setScalar(1 + w * 0.06 + Math.sin(t * 40) * 0.01 * w);
      rig.position.y = Math.sin(t * 1.8 + id) * 0.05 - 1.2 * k * k;
      rig.rotation.z = Math.sin(t * 0.9 + id) * 0.05 + k * 2.5;
      rig.rotation.x = -w * 0.1 + k;
      const fade = dead > 0.6 ? 1 - clamp01((dead - 0.6) / 0.5) : 1;
      this.fadeTo(fade);
      charge.scale.setScalar(0.1 + w * 0.65);
      (charge.material as THREE.SpriteMaterial).opacity = (0.1 + w * 0.9) * fade;
    };
  }

  /** Cave spider: hangs from the roof on silk until it notices you, then drops and hunts. */
  private spider(): Anim {
    const hide = this.mat(0x3b2f26);
    const hide2 = this.mat(0x2c231c);
    const legM = this.mat(0x30271f);
    const silk = this.mat(0xe4e0d0, 0x2a2a26);
    // the rig is centred on the body; it sits at y 0.35 on the floor and at the origin when hanging
    const rig = this.pivot(this.group, 0, 0.35, 0);
    const ceph = this.ball(0.16, hide, 0, 0, -0.2);
    ceph.scale.set(1, 0.8, 1.1);
    const abd = this.ball(0.24, hide2, 0, 0.03, 0.2);
    abd.scale.set(1, 0.85, 1.25);
    rig.add(ceph, abd, this.box(0.03, 0.08, 0.03, legM, -0.05, -0.1, -0.36), this.box(0.03, 0.08, 0.03, legM, 0.05, -0.1, -0.36));
    for (const [x, y] of [[-0.05, 0.07], [0.05, 0.07], [-0.1, 0.03], [0.1, 0.03], [-0.03, 0.11], [0.03, 0.11]]) {
      rig.add(this.eye(0xff2a18, 0.07, x, y, -0.34));
    }
    const legs: { hip: THREE.Group; knee: THREE.Group; s: number; i: number; f: number }[] = [];
    const hz = [-0.24, -0.1, 0.04, 0.18], fwd = [0.6, 0.2, -0.2, -0.6];
    for (const s of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const hip = this.pivot(rig, s * 0.12, 0, hz[i]);
        hip.add(this.box(0.32, 0.045, 0.045, legM, s * 0.16, 0, 0));
        const knee = this.pivot(hip, s * 0.32, 0, 0);
        knee.add(this.box(0.55, 0.04, 0.04, legM, s * 0.275, 0, 0));
        legs.push({ hip, knee, s, i, f: fwd[i] });
      }
    }
    const thread = this.box(0.012, 4, 0.012, silk, 0, 2.1, 0);
    this.group.add(thread);
    this.soften();
    let hang = -1;
    return (dt, state, moving, _t, dead) => {
      if (hang < 0) hang = state === 0 ? 1 : 0;
      hang += ((state === 0 ? 1 : 0) - hang) * Math.min(1, dt * 8);
      const mv = clamp01(moving / 1.5), ph = this.phase * 5;
      const dk = clamp01(dead / 0.4);
      const curl = Math.max(hang, dk);
      rig.position.y = 0.35 * (1 - hang) + Math.abs(Math.sin(ph)) * 0.015 * mv;
      rig.rotation.z = Math.PI * curl;
      rig.rotation.x = this.wind * 0.35;
      for (const l of legs) {
        const off = (l.i + (l.s > 0 ? 0 : 1)) % 2 ? Math.PI : 0;
        const run = mv * (1 - curl);
        const swing = Math.sin(ph + off) * run;
        const lift = Math.max(0, Math.cos(ph + off)) * 0.4 * run;
        const front = l.i === 0 ? this.wind : l.i === 1 ? this.wind * 0.5 : 0;
        l.hip.rotation.z = l.s * (0.7 + lift + front * 1.1 + curl * 0.35);
        l.hip.rotation.y = l.s * (l.f + swing * 0.3 + front * 0.5);
        l.knee.rotation.z = -l.s * (2 + curl * 0.5 - front * 0.5);
      }
      thread.visible = state === 0;
      this.fadeTo(dead > 0.8 ? 1 - clamp01((dead - 0.8) / 0.5) : 1);
    };
  }

  /** Will-o'-the-wisp: just light. Centred on the origin. */
  private wisp(): Anim {
    const coreM = this.mat(0xcfeaff, 0x8fc8ff);
    coreM.transparent = true;
    const rig = this.pivot(this.group, 0, 0, 0);
    rig.add(this.ball(0.05, coreM));
    const halo = this.eye(0x5f98ff, 0.6, 0, 0, 0);
    const mid = this.eye(0x9fd0ff, 0.4, 0, 0, 0);
    const heart = this.eye(0xeaf6ff, 0.22, 0, 0, 0);
    const motes = [0, 1, 2, 3].map(() => this.eye(0xbfe0ff, 0.07, 0, 0, 0));
    rig.add(halo, mid, heart, ...motes);
    const id = this.group.id;
    const op = (s: THREE.Sprite, v: number) => { (s.material as THREE.SpriteMaterial).opacity = v; };
    return (_dt, _state, _moving, t, dead) => {
      const k = clamp01(dead / 0.8);
      // sputter: flicker harder as it dies, shrinking to nothing
      const s = dead > 0 ? (1 - k) * (Math.sin(dead * 55) > -0.2 ? 1 : 0.25) : 1;
      const fl = 1 + Math.sin(t * 13 + id) * 0.08 + Math.sin(t * 29 + id * 2) * 0.06;
      const w = this.wind, sw = 1 + w * 0.7, a = 1 - k;
      halo.scale.setScalar(0.6 * fl * sw * s);
      mid.scale.setScalar(0.4 * fl * sw * s);
      heart.scale.setScalar(0.22 * fl * (1 + w * 0.5) * s);
      op(halo, (0.4 + 0.45 * w + Math.sin(t * 17) * 0.05) * a);
      op(mid, (0.6 + 0.3 * w) * a);
      op(heart, Math.min(1, 0.85 + w * 0.15) * a);
      coreM.opacity = 0.35 * a;
      motes.forEach((m, i) => {
        const ang = t * (1.6 + i * 0.5) + i * 1.57, r = (0.2 + Math.sin(t * 2.3 + i) * 0.05) * sw;
        m.position.set(Math.cos(ang) * r, Math.sin(t * 2 + i * 2) * 0.12, Math.sin(ang) * r);
        m.scale.setScalar(0.07 * fl * s);
        op(m, (0.7 + Math.sin(t * 21 + i * 3) * 0.3) * a);
      });
      rig.position.set(Math.sin(t * 1.3 + id) * 0.04, Math.sin(t * 2.2 + id) * 0.06, 0);
      this.group.visible = k < 1;
    };
  }
}
