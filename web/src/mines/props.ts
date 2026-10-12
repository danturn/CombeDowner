// Scenery props for the mines. Built from small pieces and merged per material, so a whole level costs a few draw calls.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { rng } from "../textures";
import { hay, rock, rust, timber, web } from "./art";

export type MatKey = "timber" | "iron" | "rust" | "stone" | "hay" | "rope" | "bone" | "crystal" | "water" | "wax" | "cloth" | "web";

const KEYS: MatKey[] = ["timber", "iron", "rust", "stone", "hay", "rope", "bone", "crystal", "water", "wax", "cloth", "web"];

export class PropKit {
  readonly mats: Record<MatKey, THREE.Material>;
  private bins = new Map<MatKey, THREE.BufferGeometry[]>();

  constructor(stoneTex?: THREE.Texture) {
    this.mats = {
      timber: new THREE.MeshLambertMaterial({ map: timber() }),
      iron: new THREE.MeshLambertMaterial({ color: 0x3a3a3e }),
      rust: new THREE.MeshLambertMaterial({ map: rust() }),
      stone: new THREE.MeshLambertMaterial({ map: stoneTex ?? rock() }),
      hay: new THREE.MeshLambertMaterial({ map: hay() }),
      rope: new THREE.MeshLambertMaterial({ color: 0x8a7550 }),
      bone: new THREE.MeshLambertMaterial({ color: 0xd8cfb4 }),
      crystal: new THREE.MeshLambertMaterial({ color: 0xcdeff2, emissive: 0x2c6a74, flatShading: true }),
      water: new THREE.MeshPhongMaterial({ color: 0x0b161a, specular: 0x9ab8c4, shininess: 120, transparent: true, opacity: 0.7, depthWrite: false }),
      wax: new THREE.MeshLambertMaterial({ color: 0xe8dcb8 }),
      cloth: new THREE.MeshLambertMaterial({ color: 0x6a5a48 }),
      web: new THREE.MeshLambertMaterial({ map: web(), transparent: true, depthWrite: false, side: THREE.DoubleSide }),
    };
  }

  /** Adds a piece already in world space. */
  add(geo: THREE.BufferGeometry, mat: MatKey): void {
    // flat-shaded polyhedra are not indexed, so make everything the same shape to merge
    const g = geo.index ? geo.toNonIndexed() : geo;
    for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "normal" && name !== "uv") g.deleteAttribute(name);
    if (g !== geo) geo.dispose();
    let bin = this.bins.get(mat);
    if (!bin) this.bins.set(mat, (bin = []));
    bin.push(g);
  }

  /** One merged mesh per material. */
  build(): THREE.Group {
    const group = new THREE.Group();
    for (const key of KEYS) {
      const bin = this.bins.get(key);
      if (!bin || !bin.length) continue;
      const merged = mergeGeometries(bin, false);
      for (const b of bin) b.dispose();
      this.bins.delete(key);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, this.mats[key]);
      mesh.matrixAutoUpdate = false;
      if (key === "water") mesh.renderOrder = 1;
      if (key === "web") mesh.renderOrder = 2;
      group.add(mesh);
    }
    return group;
  }
}

// ---- helpers ----

/** A seeded random that does not start with the generator's weak first values. */
function seeded(seed: number, a = 0, b = 0) {
  const r = rng((Math.imul(seed | 0, 2654435761) ^ Math.imul(Math.round(a * 100), 40503) ^ Math.imul(Math.round(b * 100), 69069) ^ 0x9e3779b9) >>> 0);
  r(); r(); r();
  return r;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

/** A local frame at a world position and yaw; pieces are placed in it and baked into world space. */
class Frame {
  private m = new THREE.Matrix4();
  constructor(private kit: PropKit, x: number, y: number, z: number, yaw = 0, pre?: THREE.Matrix4) {
    this.m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1));
    if (pre) this.m.multiply(pre);
  }
  put(geo: THREE.BufferGeometry, mat: MatKey, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
    geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(this.m, _m));
    this.kit.add(geo, mat);
  }
}

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (r0: number, r1: number, h: number, seg = 6) => new THREE.CylinderGeometry(r0, r1, h, seg, 1);

/** Stretches a geometry's uvs, so long thin pieces do not smear the texture. */
function uvScale(geo: THREE.BufferGeometry, su: number, sv: number) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return geo;
}

/** A jittered low-poly stone. The jitter depends only on position, so shared corners stay shut. */
function stoneGeo(r: number, seed: number) {
  const g = new THREE.IcosahedronGeometry(r, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const h = Math.imul(Math.round(p.getX(i) * 1000 / r) * 73856093 ^ Math.round(p.getY(i) * 1000 / r) * 19349663 ^ Math.round(p.getZ(i) * 1000 / r) * 83492791 ^ seed, 2246822519) >>> 0;
    const f = 1 + ((h % 1000) / 1000 - 0.5) * 0.5;
    p.setXYZ(i, p.getX(i) * f, p.getY(i) * f, p.getZ(i) * f);
  }
  g.computeVertexNormals();
  return g;
}

// ---- builders ----

export function pitProps(kit: PropKit, x: number, z: number, yaw: number, roofY: number): void {
  const r = seeded(1, x, z), f = new Frame(kit, x, 0, z, yaw);
  const h = roofY - 0.2;
  for (const lx of [-0.85, 0.85]) {
    const g = cyl(0.09 + r() * 0.02, 0.12 + r() * 0.02, h, 7);
    g.translate(0, h / 2, 0);
    f.put(g, "timber", lx + (r() - 0.5) * 0.05, 0, 0, (r() - 0.5) * 0.05, 0, (r() - 0.5) * 0.06);
  }
  f.put(uvScale(box(2.3, 0.2, 0.24), 3, 1), "timber", 0, roofY - 0.1, 0, 0, 0, (r() - 0.5) * 0.03);
  for (const lx of [-0.5, 0.55]) f.put(box(0.28, 0.07, 0.14), "timber", lx, roofY - 0.2 - 0.04, 0, 0, 0, (r() - 0.5) * 0.3);
  for (const lx of [-1.0, 1.0]) f.put(box(0.22, 0.06, 0.1), "timber", lx, roofY - 0.2 - 0.03, 0.08, 0, 0.3, 0.25 * Math.sign(lx));
}

export function rails(kit: PropKit, x0: number, z0: number, x1: number, z1: number): void {
  const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz);
  if (L < 0.01) return;
  const f = new Frame(kit, (x0 + x1) / 2, 0, (z0 + z1) / 2, Math.atan2(-dz, dx));
  for (const lz of [-0.3, 0.3]) f.put(uvScale(box(L, 0.05, 0.04), L, 1), "rust", 0, 0.105, lz);
  const n = Math.floor(L / 0.6) + 1, start = -((n - 1) * 0.6) / 2;
  for (let i = 0; i < n; i++) f.put(box(0.12, 0.08, 0.85), "timber", start + i * 0.6, 0.04, 0);
}

export function truck(kit: PropKit, x: number, z: number, yaw: number, tipped = false, seed = 1): void {
  const r = seeded(seed, x, z);
  const pre = tipped ? new THREE.Matrix4().makeTranslation(0, 0.4, 0).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)) : undefined;
  const f = new Frame(kit, x, 0, z, yaw, pre);
  f.put(box(1.3, 0.06, 0.8), "timber", 0, 0.28, 0);
  for (const lz of [-0.37, 0.37]) f.put(uvScale(box(1.3, 0.36, 0.06), 2, 1), "timber", 0, 0.46, lz);
  for (const lx of [-0.62, 0.62]) f.put(box(0.06, 0.36, 0.68), "timber", lx, 0.46, 0);
  for (const lx of [-0.4, 0.4]) {
    f.put(box(0.05, 0.12, 0.84), "iron", lx, 0.4, 0);
    f.put(box(0.05, 0.05, 0.84), "iron", lx, 0.28, 0);
  }
  f.put(box(1.34, 0.04, 0.84), "iron", 0, 0.65, 0);
  for (const lx of [-0.45, 0.45]) {
    f.put(cyl(0.015, 0.015, 0.8, 5), "iron", lx, 0.14, 0, Math.PI / 2);
    for (const lz of [-0.36, 0.36]) f.put(cyl(0.14, 0.14, 0.05, 8), "iron", lx, 0.14, lz, Math.PI / 2);
  }
  const loaded = r() < 0.6;
  if (loaded && !tipped) f.put(box(0.7, 0.34, 0.5), "stone", (r() - 0.5) * 0.2, 0.48, 0, 0, (r() - 0.5) * 0.2);
  if (tipped) kit.add(box(0.7, 0.34, 0.5).applyMatrix4(new THREE.Matrix4().makeRotationY(r() * 3).setPosition(x + Math.cos(yaw) * 0.2 + 0.2, 0.17, z + 0.9)), "stone");
}

export function barrel(kit: PropKit, x: number, z: number, s = 1): void {
  const pts = [[0.2, 0], [0.27, 0.12], [0.3, 0.4], [0.27, 0.68], [0.2, 0.8]].map((p) => new THREE.Vector2(p[0], p[1]));
  const f = new Frame(kit, x, 0, z, seeded(2, x, z)() * 6.28);
  f.put(new THREE.LatheGeometry(pts, 8), "timber", 0, 0, 0, 0, 0, 0, s, s, s);
  for (const [y, rr] of [[0.14, 0.275], [0.66, 0.275], [0.4, 0.305]]) f.put(cyl(rr, rr, 0.04, 8), "iron", 0, y * s, 0, 0, 0, 0, s, s, s);
}

export function crate(kit: PropKit, x: number, z: number, yaw: number, s = 1): void {
  const f = new Frame(kit, x, 0, z, yaw);
  f.put(box(0.7, 0.5, 0.7), "timber", 0, 0.25 * s, 0, 0, 0, 0, s, s, s);
  for (const y of [0.04, 0.46]) f.put(box(0.73, 0.06, 0.73), "timber", 0, y * s, 0, 0, 0, 0, s, s, s);
  f.put(box(0.05, 0.5, 0.72), "iron", 0.2 * s, 0.25 * s, 0, 0, 0, 0, s, s, s);
}

export function rubble(kit: PropKit, x: number, z: number, radius: number, seed: number): void {
  const r = seeded(seed, x, z), n = 8 + Math.floor(r() * 13);
  for (let i = 0; i < n; i++) {
    const a = r() * 6.28, d = Math.sqrt(r()) * radius;
    const size = (0.07 + 0.2 * (1 - d / radius)) * (0.6 + r() * 0.8) * Math.max(0.5, radius);
    const g = stoneGeo(1, (seed * 131 + i) | 0);
    new Frame(kit, x + Math.cos(a) * d, 0, z + Math.sin(a) * d, r() * 6.28).put(g, "stone", 0, size * 0.35, 0, (r() - 0.5) * 0.6, 0, (r() - 0.5) * 0.6, size, size * 0.65, size * (0.8 + r() * 0.4));
  }
}

export function stalactites(kit: PropKit, x: number, z: number, roofY: number, seed: number): void {
  const r = seeded(seed, x, z), n = 3 + Math.floor(r() * 6);
  for (let i = 0; i < n; i++) {
    const len = 0.2 + r() * 0.5, w = 0.025 + r() * 0.05;
    const g = new THREE.ConeGeometry(w, len, 5, 1);
    g.rotateX(Math.PI);
    const a = r() * 6.28, d = r() * 0.6;
    kit.add(g.translate(x + Math.cos(a) * d, roofY - len / 2, z + Math.sin(a) * d), "bone");
  }
}

export function crystals(kit: PropKit, x: number, z: number, seed: number): void {
  const r = seeded(seed, x, z), n = 4 + Math.floor(r() * 6);
  for (let i = 0; i < n; i++) {
    const h = 0.2 + r() * 0.5, rad = 0.03 + r() * 0.05, tip = rad * 2.2, tilt = 0.1 + r() * 0.5;
    const pre = new THREE.Matrix4().makeRotationZ(tilt);
    const a = r() * 6.28, d = r() * 0.15;
    const f = new Frame(kit, x + Math.cos(a) * d, 0, z + Math.sin(a) * d, r() * 6.28, pre);
    f.put(cyl(rad, rad * 1.1, h, 6), "crystal", 0, h / 2, 0);
    f.put(new THREE.ConeGeometry(rad, tip, 6, 1), "crystal", 0, h + tip / 2, 0);
  }
}

export function bones(kit: PropKit, x: number, z: number, seed: number): void {
  const r = seeded(seed, x, z), f = new Frame(kit, x, 0, z, r() * 6.28);
  f.put(new THREE.SphereGeometry(0.1, 6, 5), "bone", 0, 0.1, 0, 0, 0, 0, 1, 0.9, 1.1);
  f.put(box(0.1, 0.035, 0.09), "bone", 0.09, 0.03, 0, 0, 0, 0.1);
  const nb = 3 + Math.floor(r() * 3);
  for (let i = 0; i < nb; i++) {
    const a = r() * 6.28, d = 0.25 + r() * 0.35, len = 0.3 + r() * 0.2;
    const g = new Frame(kit, x + Math.cos(a) * d, 0.025, z + Math.sin(a) * d, r() * 6.28);
    g.put(cyl(0.018, 0.018, len, 5), "bone", 0, 0, 0, 0, 0, Math.PI / 2);
    for (const e of [-1, 1]) g.put(new THREE.SphereGeometry(0.035, 5, 4), "bone", e * len / 2, 0, 0.012);
  }
  for (let i = 0; i < 3; i++) {
    const a = r() * 6.28, d = 0.3 + r() * 0.3;
    new Frame(kit, x + Math.cos(a) * d, 0, z + Math.sin(a) * d, r() * 6.28).put(new THREE.TorusGeometry(0.13, 0.014, 4, 8, Math.PI), "bone", 0, 0, 0, 0, 0, 0, 1, 0.9, 1);
  }
}

export function derrick(kit: PropKit, x: number, z: number, yaw: number, roofY: number): void {
  const r = seeded(4, x, z), f = new Frame(kit, x, 0, z, yaw);
  const mast = cyl(0.12, 0.14, roofY, 7);
  mast.translate(0, roofY / 2, 0);
  f.put(mast, "timber");
  f.put(box(1.7, 0.14, 0.2), "timber", 0, 0.07, 0);
  f.put(box(0.2, 0.14, 1.5), "timber", 0, 0.21, 0);
  // jib out along +x, braced from the mast
  const jy = roofY - 0.9, ex = 0.9, ey = roofY - 0.3, jl = Math.hypot(ex, ey - jy);
  f.put(box(jl, 0.12, 0.14), "timber", ex / 2, (jy + ey) / 2, 0, 0, 0, Math.atan2(ey - jy, ex));
  const by = jy - 0.5, bx = 0.6, by2 = jy + (ey - jy) * (bx / ex), bl = Math.hypot(bx, by2 - by);
  f.put(box(bl, 0.08, 0.1), "timber", bx / 2, (by + by2) / 2, 0, 0, 0, Math.atan2(by2 - by, bx));
  // rope, hook block and the lifted ashlar
  const top = Math.min(1.8, ey - 0.4), cy = top - 0.3, hook = top + 0.15;
  f.put(cyl(0.012, 0.012, ey - hook, 5), "rope", ex, (ey + hook) / 2, 0);
  f.put(box(0.1, 0.12, 0.1), "iron", ex, hook, 0);
  for (const sz of [-1, 1]) f.put(cyl(0.01, 0.01, 0.45, 4), "rope", ex, (hook + top) / 2, sz * 0.12, sz * 0.5);
  f.put(box(0.8, 0.6, 0.6), "stone", ex, cy, 0, 0, (r() - 0.5) * 0.3);
}

export function sawBench(kit: PropKit, x: number, z: number, yaw: number): void {
  const f = new Frame(kit, x, 0, z, yaw);
  for (const lx of [-0.7, 0.7]) {
    f.put(box(0.1, 0.1, 0.6), "timber", lx, 0.78, 0);
    for (const lz of [-1, 1]) f.put(box(0.08, 0.84, 0.08), "timber", lx, 0.4, lz * 0.22, -lz * 0.2);
  }
  f.put(box(1.7, 0.45, 0.5), "stone", 0, 1.03, 0);
  f.put(box(1.7, 0.03, 0.02), "stone", 0, 1.26, 0);
  f.put(box(1.0, 0.2, 0.012), "iron", 0.1, 1.3, 0, 0, 0, -0.06);
  for (const e of [-1, 1]) f.put(box(0.05, 0.3, 0.05), "timber", 0.1 + e * 0.5, 1.4, 0, 0, 0, -0.06);
}

export function manger(kit: PropKit, x: number, z: number, yaw: number): void {
  const f = new Frame(kit, x, 0, z, yaw);
  f.put(box(1.4, 0.05, 0.4), "timber", 0, 0.55, 0);
  for (const lz of [-0.19, 0.19]) f.put(uvScale(box(1.4, 0.2, 0.04), 2, 1), "timber", 0, 0.65, lz);
  for (const lx of [-0.68, 0.68]) f.put(box(0.04, 0.2, 0.4), "timber", lx, 0.65, 0);
  for (const lx of [-0.6, 0.6]) for (const lz of [-0.15, 0.15]) f.put(box(0.07, 0.55, 0.07), "timber", lx, 0.275, lz);
  f.put(box(1.2, 0.08, 0.3), "hay", 0, 0.62, 0);
  for (const [bx, bz, ry] of [[-0.35, 0.65, 0.1], [0.35, 0.7, -0.15]]) {
    f.put(box(0.55, 0.32, 0.36), "hay", bx, 0.16, bz, 0, ry);
    for (const o of [-0.15, 0.15]) f.put(box(0.03, 0.34, 0.38), "rope", bx + o, 0.16, bz, 0, ry);
  }
}

export function tools(kit: PropKit, x: number, z: number, yaw: number, seed: number): void {
  const r = seeded(seed, x, z), sw = r() < 0.5 ? 1 : -1;
  const lean = new THREE.Matrix4().makeRotationX(-0.25);
  const pick = new Frame(kit, x, 0, z, yaw, new THREE.Matrix4().makeTranslation(-0.2 * sw, 0, 0.3).multiply(lean));
  pick.put(cyl(0.02, 0.02, 1.3, 5), "timber", 0, 0.65, 0);
  pick.put(box(0.5, 0.05, 0.05), "iron", 0, 1.3, 0);
  pick.put(cyl(0.025, 0.005, 0.12, 4), "iron", 0.3, 1.3, 0, 0, 0, -Math.PI / 2);
  pick.put(cyl(0.025, 0.005, 0.12, 4), "iron", -0.3, 1.3, 0, 0, 0, Math.PI / 2);
  const sh = new Frame(kit, x, 0, z, yaw, new THREE.Matrix4().makeTranslation(0.2 * sw, 0, 0.3).multiply(lean));
  sh.put(cyl(0.02, 0.02, 1.1, 5), "timber", 0, 0.7, 0);
  sh.put(box(0.2, 0.03, 0.03), "timber", 0, 1.25, 0);
  sh.put(box(0.2, 0.3, 0.015), "iron", 0, 0.15, 0);
}

export function puddle(kit: PropKit, x: number, z: number, rad: number, seed: number): void {
  const r = seeded(seed, x, z), g = new THREE.CircleGeometry(1, 12);
  const p = g.attributes.position, sq = 0.65 + r() * 0.3;
  const f: number[] = [];
  for (let i = 0; i < 12; i++) f.push(0.65 + r() * 0.5);
  for (let i = 1; i < p.count; i++) {
    const k = (i - 1) % 12;
    p.setXYZ(i, p.getX(i) * rad * f[k], p.getY(i) * rad * f[k] * sq, 0);
  }
  g.rotateX(-Math.PI / 2);
  g.rotateY(r() * 6.28);
  kit.add(g.translate(x, 0.015, z), "water");
}

export function cobweb(kit: PropKit, x: number, y: number, z: number, yaw: number, s = 1): void {
  new Frame(kit, x, y, z, yaw).put(new THREE.PlaneGeometry(1, 1), "web", 0, 0, 0, 0, 0, 0, s, s, 1);
}

export function chain(kit: PropKit, x: number, z: number, roofY: number, len: number): void {
  const n = Math.floor(len / 0.07);
  for (let i = 0; i < n; i++)
    new Frame(kit, x, roofY - 0.05 - i * 0.07, z, (i % 2) * Math.PI / 2).put(new THREE.TorusGeometry(0.035, 0.01, 4, 6), "rust", 0, 0, 0, 0, 0, 0, 0.8, 1.3, 1);
}

export function candleStub(kit: PropKit, x: number, y: number, z: number): void {
  const r = seeded(5, x, z), h = 0.05 + r() * 0.06;
  kit.add(cyl(0.05, 0.065, 0.03, 6).translate(x, y + 0.015, z), "timber");
  kit.add(cyl(0.017, 0.02, h, 6).translate(x, y + 0.03 + h / 2, z), "wax");
}
