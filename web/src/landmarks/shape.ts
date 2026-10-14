// A set piece's solid shape, taken from its own model (landmarks/setpieces.ts), so what you bump
// into and stand on is always what's drawn: nothing to keep in step by hand.
// - Everything facing up that isn't too steep to stand on (floors, steps, terraces, roofs,
//   cornices, the tops of walls) is a surface to stand on: gathered onto a grid half a metre
//   square in the set piece's frame, each square keeping every height drawn over it, so you can
//   stand on a terrace or walk on the floor under it.
// - Everything steeper is a wall, from its foot to its top: you walk under one whose foot is over
//   your head (a terrace's edge, a lintel), and step or vault over a low one as anywhere else.
// - Anything drawn with a material marked ghost (materials' userData.ghost: water, steam) is left out.
// The model is built once per set piece (and its builder's args), then shared by every square of
// the map it reaches into (map.ts). Nothing here goes over the network.
import * as THREE from "three";

/** A surface is anything facing up at least this much (cos of its slope: 60 degrees). */
const UP = 0.5;
/** The grid's squares, metres. */
export const STEP = 0.5;

export interface Shape {
  /** The surfaces: for each grid square (i, j: x and z over STEP, keyed i + j * 65536 after
   *  OFF), the heights drawn over it, lowest first. */
  tops: Map<number, Float32Array>;
  /** The walls: ax, az, bx, bz, foot, top, six numbers each. */
  walls: Float32Array;
  /** Its extent in its frame: x0, x1, z0, z1. */
  box: [number, number, number, number];
}

export const OFF = 32768;
export const cellKey = (i: number, j: number) => i + OFF + (j + OFF) * 65536;

/** The solid shape of a set piece's model, built in its own frame (at the origin, unturned): a
 *  job that yields every so often, so working it out never holds up a frame for long. */
export function* shapeOf(obj: THREE.Object3D): Generator<void, Shape> {
  obj.updateMatrixWorld(true);
  const tops = new Map<number, number[]>();
  let cost = 0;   // work done since the last yield: triangles, and grid squares looked at
  const walls = new Map<string, number[]>();
  const box: [number, number, number, number] = [Infinity, -Infinity, Infinity, -Infinity];
  const M = new THREE.Matrix4(), I = new THREE.Matrix4(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
    const e1x = b.x - a.x, e1y = b.y - a.y, e1z = b.z - a.z, e2x = c.x - a.x, e2y = c.y - a.y, e2z = c.z - a.z;
    const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x, nl = Math.hypot(nx, ny, nz);
    if (nl < 1e-9) return;
    box[0] = Math.min(box[0], a.x, b.x, c.x); box[1] = Math.max(box[1], a.x, b.x, c.x);
    box[2] = Math.min(box[2], a.z, b.z, c.z); box[3] = Math.max(box[3], a.z, b.z, c.z);
    if (Math.abs(ny) / nl >= UP) surface(a, b, c);
    else wall(a, b, c);
  };
  // a surface: onto every grid square it covers any of, at its height over the middle of that
  // square (kept within its own heights), so a narrow step still lands on the grid
  const surface = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
    const d = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
    if (Math.abs(d) < 1e-9) return;
    const lo = Math.min(a.y, b.y, c.y), hi = Math.max(a.y, b.y, c.y);
    // barycentric weights as planes: w1 = p1 x + q1 z + r1, w2 likewise, w3 = 1 - w1 - w2
    const p1 = (b.z - c.z) / d, q1 = (c.x - b.x) / d, r1 = -(p1 * c.x + q1 * c.z);
    const p2 = (c.z - a.z) / d, q2 = (a.x - c.x) / d, r2 = -(p2 * c.x + q2 * c.z);
    const E = -1e-6;
    const inside = (x: number, z: number) => {
      const w1 = p1 * x + q1 * z + r1, w2 = p2 * x + q2 * z + r2;
      return w1 >= E && w2 >= E && 1 - w1 - w2 >= E;
    };
    const minX = Math.min(a.x, b.x, c.x), maxX = Math.max(a.x, b.x, c.x), minZ = Math.min(a.z, b.z, c.z), maxZ = Math.max(a.z, b.z, c.z);
    const i0 = Math.floor(minX / STEP), i1 = Math.floor(maxX / STEP), j0 = Math.floor(minZ / STEP), j1 = Math.floor(maxZ / STEP);
    cost += (i1 - i0 + 1) * (j1 - j0 + 1);
    const small = i1 - i0 < 2 || j1 - j0 < 2;   // a small triangle may have a corner inside a square without touching its corners
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const x0 = i * STEP, z0 = j * STEP, x1 = x0 + STEP, z1 = z0 + STEP, mx = x0 + STEP / 2, mz = z0 + STEP / 2;
      const touch = inside(mx, mz) || inside(x0, z0) || inside(x1, z0) || inside(x0, z1) || inside(x1, z1)
        || (small && ((a.x >= x0 && a.x <= x1 && a.z >= z0 && a.z <= z1) || (b.x >= x0 && b.x <= x1 && b.z >= z0 && b.z <= z1) || (c.x >= x0 && c.x <= x1 && c.z >= z0 && c.z <= z1)));
      if (!touch) continue;
      const w1 = p1 * mx + q1 * mz + r1, w2 = p2 * mx + q2 * mz + r2;
      const h = Math.max(lo, Math.min(hi, w1 * a.y + w2 * b.y + (1 - w1 - w2) * c.y));
      const k = cellKey(i, j);
      const L = tops.get(k);
      if (L) L.push(h); else tops.set(k, [h]);
    }
  };
  // a wall: the line its foot runs along (seen from above, the two corners furthest apart), from its lowest to its highest
  const wall = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
    const P = [a, b, c];
    let best = -1, p = a, q = b;
    for (let m = 0; m < 3; m++) for (let n = m + 1; n < 3; n++) {
      const l = Math.hypot(P[m].x - P[n].x, P[m].z - P[n].z);
      if (l > best) { best = l; p = P[m]; q = P[n]; }
    }
    if (best < 0.05) return;
    const foot = Math.min(a.y, b.y, c.y), top = Math.max(a.y, b.y, c.y);
    if (top - foot < 0.05) return;
    // the two triangles of a quad give the same line: keep it once, as tall as both
    const r = (v: number) => Math.round(v * 20);
    const [u, v] = p.x < q.x || (p.x === q.x && p.z < q.z) ? [p, q] : [q, p];
    const k = `${r(u.x)},${r(u.z)},${r(v.x)},${r(v.z)}`;
    const w = walls.get(k);
    if (w) { w[4] = Math.min(w[4], foot); w[5] = Math.max(w[5], top); }
    else walls.set(k, [u.x, u.z, v.x, v.z, foot, top]);
  };

  const meshes: THREE.Mesh[] = [];
  obj.traverse((o) => { if ((o as THREE.Mesh).isMesh && o.visible) meshes.push(o as THREE.Mesh); });
  for (const mesh of meshes) {
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (mats.every((m) => m?.userData?.ghost)) continue;
    const pos = mesh.geometry.attributes.position as THREE.BufferAttribute | undefined;
    if (!pos) continue;
    const idx = mesh.geometry.index, nt = (idx ? idx.count : pos.count) / 3;
    const inst = (mesh as THREE.InstancedMesh).isInstancedMesh ? (mesh as THREE.InstancedMesh) : null;
    for (let q = 0; q < (inst ? inst.count : 1); q++) {
      if (inst) { inst.getMatrixAt(q, I); M.multiplyMatrices(mesh.matrixWorld, I); } else M.copy(mesh.matrixWorld);
      for (let t = 0; t < nt; t++) {
        const ia = idx ? idx.getX(3 * t) : 3 * t, ib = idx ? idx.getX(3 * t + 1) : 3 * t + 1, ic = idx ? idx.getX(3 * t + 2) : 3 * t + 2;
        a.fromBufferAttribute(pos, ia).applyMatrix4(M); b.fromBufferAttribute(pos, ib).applyMatrix4(M); c.fromBufferAttribute(pos, ic).applyMatrix4(M);
        tri(a, b, c);
        if (++cost > 20000) { cost = 0; yield; }
      }
    }
  }

  yield;
  // each square's heights, lowest first, any within 10 cm of each other kept as the higher
  const out = new Map<number, Float32Array>();
  for (const [k, L] of tops) {
    if (++cost > 2500) { cost = 0; yield; }
    L.sort((p, q) => p - q);
    const keep: number[] = [];
    for (const h of L) { if (keep.length && h - keep[keep.length - 1] < 0.1) keep[keep.length - 1] = h; else keep.push(h); }
    out.set(k, Float32Array.from(keep));
  }
  const W = new Float32Array(walls.size * 6);
  let n = 0;
  for (const w of walls.values()) { W.set(w, n); n += 6; }
  return { tops: out, walls: W, box };
}

/** The highest surface of a shape at x, z in its frame (offset by y0) that's above g and no more
 *  than a step above feet at y; or g. */
export function standOn(s: Shape, x: number, z: number, y0: number, g: number, y: number): number {
  const L = s.tops.get(cellKey(Math.floor(x / STEP), Math.floor(z / STEP)));
  if (!L) return g;
  for (let n = L.length - 1; n >= 0; n--) {
    const h = y0 + L[n];
    if (h <= y + 0.5) return h > g ? h : g;
  }
  return g;
}
