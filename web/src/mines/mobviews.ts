// Monster models for the mines: low-poly figures built from boxes and spheres, animated in code (no skeletons).
import * as THREE from "three";

export type MobKind = "ghoul" | "bat" | "golem" | "blob" | "grout";

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

  constructor(readonly kind: MobKind) {
    this.anim = this[kind]();
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
}
