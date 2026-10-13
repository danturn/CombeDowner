// Skid marks and tyre smoke. Pull the handbrake in a car and its back wheels lock and drag: they
// leave black rubber on the road and send up puffs of white smoke. A back end sliding sideways
// does the same, so a donut draws rings on the tarmac and stands in its own cloud. The marks fade
// away after a minute or so.
//
// Who decides what: nobody. It's only looks: everyone draws marks and smoke for every car near
// them from how it's moving (and the handbrake flag its driver sends), so they come out much the
// same for everyone without anything extra going over the network.
import * as THREE from "three";
import type { Vehicle } from "./vehicles";

const SEGS = 5000;          // stretches of mark kept at once, all cars together; the oldest goes first
const MARK_LIFE = 75;       // seconds a mark stays on the road, the last fifth spent fading
const STEP = 0.3;           // metres between joins in a mark
const TYRE = 0.24;          // how wide a mark is
const PUFFS = 120;          // smoke puffs in the air at once
const NEAR = 120;           // only cars this close to you mark the road or smoke

/** One back wheel's mark: where it last laid down a join (its two edges), or null when it's not skidding. */
interface Trail { x: number; z: number; lx: number; ly: number; lz: number; rx: number; ry: number; rz: number; on: boolean }
/** What a car's back wheels were doing last frame. */
interface Rear { wx: number[]; wz: number[]; trails: Trail[]; puff: number }
interface Puff { x: number; y: number; z: number; vx: number; vy: number; vz: number; r: number; grow: number; t: number; life: number; peak: number }

export class Skids {
  private pos = new Float32Array(SEGS * 6 * 3);
  private mark = new Float32Array(SEGS * 6 * 2);   // per corner: when it was laid, and how dark
  private posAttr: THREE.BufferAttribute;
  private markAttr: THREE.BufferAttribute;
  private marks: THREE.Mesh;
  private next = 0;
  private used = 0;
  private now = 0;
  private uNow = { value: 0 };
  private rears = new WeakMap<Vehicle, Rear>();
  private smoke: THREE.InstancedMesh;
  private fade: THREE.InstancedBufferAttribute;
  private puffs: Puff[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();

  /** surface(x, z, y) is the height of whatever is drawn on the ground there. */
  constructor(scene: THREE.Scene, private surface: (x: number, z: number, y?: number) => number) {
    // the marks: one mesh of flat strips, written into as the wheels go
    const geo = new THREE.BufferGeometry();
    this.mark.fill(-1e9);
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.markAttr = new THREE.BufferAttribute(this.mark, 2).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("position", this.posAttr);
    geo.setAttribute("aMark", this.markAttr);
    geo.setDrawRange(0, 0);
    const mat = new THREE.MeshBasicMaterial({
      color: "#141210", transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8,
    });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uNow = this.uNow;
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nattribute vec2 aMark;\nuniform float uNow;\nvarying float vFade;")
        .replace("#include <begin_vertex>", `#include <begin_vertex>\nvFade = aMark.y * clamp((${MARK_LIFE.toFixed(1)} - (uNow - aMark.x)) / ${(MARK_LIFE * 0.2).toFixed(1)}, 0.0, 1.0);`);
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying float vFade;")
        .replace("#include <alphamap_fragment>", "#include <alphamap_fragment>\ndiffuseColor.a *= vFade;");
    };
    this.marks = new THREE.Mesh(geo, mat);
    this.marks.frustumCulled = false;   // they're all over the map
    this.marks.renderOrder = 1;
    this.marks.visible = false;
    scene.add(this.marks);

    // the smoke: lumpy white balls, swelling and thinning as they drift up
    const ball = new THREE.IcosahedronGeometry(1, 1);
    this.fade = new THREE.InstancedBufferAttribute(new Float32Array(PUFFS), 1).setUsage(THREE.DynamicDrawUsage);
    ball.setAttribute("aFade", this.fade);
    const smat = new THREE.MeshLambertMaterial({ color: "#e4e2de", emissive: "#3a3936", transparent: true, depthWrite: false });
    smat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float aFade;\nvarying float vFade;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvFade = aFade;");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying float vFade;")
        .replace("#include <alphamap_fragment>", "#include <alphamap_fragment>\ndiffuseColor.a *= vFade;");
    };
    this.smoke = new THREE.InstancedMesh(ball, smat, PUFFS);
    this.smoke.count = 0;
    this.smoke.frustumCulled = false;
    this.smoke.renderOrder = 2;
    scene.add(this.smoke);
  }

  /** Every frame: mark the road and puff smoke for the cars near (px, pz) that are skidding, and move the smoke on. */
  update(dt: number, cars: readonly Vehicle[], px: number, pz: number) {
    this.now += dt;
    this.uNow.value = this.now;
    if (dt > 0) for (const v of cars) {
      if (v.spec.crush || Math.abs(v.x - px) > NEAR || Math.abs(v.z - pz) > NEAR) { this.rears.delete(v); continue; }
      this.wheels(v, dt);
    }
    this.drift(dt);
  }

  /** A car's back wheels this frame: are they dragging, and if so lay rubber and smoke. */
  private wheels(v: Vehicle, dt: number) {
    const S = v.spec, c = Math.cos(v.a), s = Math.sin(v.a), back = -S.wb / 2, side = Math.max(0.25, v.hw - 0.16);
    let r = this.rears.get(v);
    if (!r) {
      r = { wx: [0, 0], wz: [0, 0], trails: [0, 1].map(() => ({ x: 0, z: 0, lx: 0, ly: 0, lz: 0, rx: 0, ry: 0, rz: 0, on: false })), puff: 0 };
      this.rears.set(v, r);
      for (let k = 0; k < 2; k++) { r.wx[k] = v.x + back * c + (k ? side : -side) * s; r.wz[k] = v.z - back * s + (k ? side : -side) * c; }
      return;
    }
    let smoking = 0;
    for (let k = 0; k < 2; k++) {
      const across = k ? side : -side, x = v.x + back * c + across * s, z = v.z - back * s + across * c;
      const dx = x - r.wx[k], dz = z - r.wz[k], moved = Math.hypot(dx, dz);
      r.wx[k] = x; r.wz[k] = z;
      const tr = r.trails[k];
      if (moved > 4) { tr.on = false; continue; }   // put somewhere new, not driven there
      // how fast the wheel's going, and how much of that is sideways across the car (vl is + to the right)
      const sp = moved / dt, slip = Math.abs((dx * s + dz * c) / dt);
      const locked = v.hand && sp > 1.2, sliding = slip > 1.6 && sp > 1.6;
      if (v.tip || !(locked || sliding)) { tr.on = false; continue; }
      const dark = Math.min(1, 0.45 + Math.max(locked ? 0.25 : 0, slip / 8) + sp / 40);
      smoking = Math.max(smoking, dark * Math.min(1, sp / 6));
      if (!tr.on) { this.join(tr, x, z, v.a, v.y); tr.on = true; continue; }
      if (Math.hypot(x - tr.x, z - tr.z) < STEP) continue;
      const lx = tr.lx, ly = tr.ly, lz = tr.lz, rx = tr.rx, ry = tr.ry, rz = tr.rz;
      this.join(tr, x, z, Math.atan2(tr.z - z, x - tr.x), v.y);   // square across the way it went
      this.strip(lx, ly, lz, rx, ry, rz, tr.lx, tr.ly, tr.lz, tr.rx, tr.ry, tr.rz, dark);
    }
    // smoke off the back wheels, thicker the harder they're going
    if (smoking > 0) {
      r.puff -= dt * (6 + 16 * smoking);
      while (r.puff <= 0) {
        r.puff += 1;
        const k = Math.random() < 0.5 ? 0 : 1;
        this.puff(r.wx[k], v.y, r.wz[k], v.vx, v.vz, smoking);
      }
    } else r.puff = 0;
  }

  /** A join in a mark at (x, z): its two edges, either side of a wheel going along heading a. */
  private join(tr: Trail, x: number, z: number, a: number, y: number) {
    const ox = Math.sin(a) * TYRE / 2, oz = Math.cos(a) * TYRE / 2;
    tr.x = x; tr.z = z;
    tr.lx = x - ox; tr.lz = z - oz; tr.ly = this.surface(tr.lx, tr.lz, y) + 0.02;
    tr.rx = x + ox; tr.rz = z + oz; tr.ry = this.surface(tr.rx, tr.rz, y) + 0.02;
  }

  /** A stretch of mark from one join to the next. */
  private strip(alx: number, aly: number, alz: number, arx: number, ary: number, arz: number, blx: number, bly: number, blz: number, brx: number, bry: number, brz: number, dark: number) {
    const i = this.next, P = this.pos, M = this.mark;
    this.next = (this.next + 1) % SEGS;
    this.used = Math.min(SEGS, this.used + 1);
    const corners = [alx, aly, alz, arx, ary, arz, brx, bry, brz, alx, aly, alz, brx, bry, brz, blx, bly, blz];
    P.set(corners, i * 18);
    for (let k = 0; k < 6; k++) { M[i * 12 + k * 2] = this.now; M[i * 12 + k * 2 + 1] = dark * 0.8; }
    this.posAttr.addUpdateRange(i * 18, 18); this.posAttr.needsUpdate = true;
    this.markAttr.addUpdateRange(i * 12, 12); this.markAttr.needsUpdate = true;
    this.marks.geometry.setDrawRange(0, this.used * 6);
    this.marks.visible = true;
  }

  /** A puff of tyre smoke at a back wheel, carried a little way along with the car. */
  private puff(x: number, y: number, z: number, cvx: number, cvz: number, hard: number) {
    const p: Puff = {
      x: x + (Math.random() - 0.5) * 0.3, y: y + 0.2, z: z + (Math.random() - 0.5) * 0.3,
      vx: cvx * 0.25 + (Math.random() - 0.5) * 1.2, vy: 0.5 + Math.random() * 0.6, vz: cvz * 0.25 + (Math.random() - 0.5) * 1.2,
      r: 0.2 + Math.random() * 0.15, grow: 0.7 + Math.random() * 0.5 + hard * 0.4, t: 0, life: 1.3 + Math.random() * 0.9, peak: 0.25 + hard * 0.3,
    };
    if (this.puffs.length >= PUFFS) this.puffs.shift();
    this.puffs.push(p);
  }

  /** Move the smoke on: up, slowing, swelling and thinning out. */
  private drift(dt: number) {
    const P = this.puffs;
    for (let i = P.length - 1; i >= 0; i--) if ((P[i].t += dt) >= P[i].life) P.splice(i, 1);
    const slow = Math.exp(-2.2 * dt);
    P.forEach((p, i) => {
      p.vx *= slow; p.vz *= slow; p.vy = p.vy * Math.exp(-0.8 * dt) + 0.15 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.r += p.grow * dt;
      const f = p.t / p.life;
      this.fade.setX(i, p.peak * Math.min(1, p.t / 0.12) * (1 - f) * (1 - f));
      this.smoke.setMatrixAt(i, this.m.compose(this.v.set(p.x, p.y, p.z), this.q, this.s.set(p.r, p.r * 0.85, p.r)));
    });
    if (this.smoke.count || P.length) {
      this.smoke.count = P.length;
      this.smoke.instanceMatrix.needsUpdate = true;
      this.fade.needsUpdate = true;
    }
  }
}
