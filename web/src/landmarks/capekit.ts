// A few more tools for Cape Town's set pieces (the Castle of Good Hope, the City Hall, St George's
// Cathedral and the Auwal Mosque), on top of the kit (kit.ts): masses laid out from a plan, an
// outline grown or shrunk, domes and cupolas turned on a lathe, and windows set along a wall at
// any angle. All in a set piece's own frame (x along it, z out of its front, y up). Nothing here
// goes over the network.
import * as THREE from "three";
import type { Kit } from "./kit";

export type P2 = [number, number];

/** A plan (points x, z) stood up from y0 to y1, with holes cut through it. */
export function plan(k: Kit, mat: THREE.Material, ring: P2[], holes: P2[][], y0: number, y1: number, tile = 3) {
  // the shape is drawn in x, -z and turned up, so its depth runs up y
  const s = new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(x, -z)));
  for (const h of holes) s.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z))));
  const g = new THREE.ExtrudeGeometry(s, { depth: y1 - y0, bevelEnabled: false, curveSegments: 4 });
  k.add(mat, g, 0, y0, 0, 0, tile, -Math.PI / 2);
}

/** Twice the signed area of a plan: positive when its points run anticlockwise with x to the
 *  right and z up the page, so the outside of each edge is on its right. */
function area2(ring: P2[]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  return a;
}

/** An outline moved out by d metres (in, if d is negative), its corners mitred. */
export function grow(ring: P2[], d: number): P2[] {
  const n = ring.length, s = area2(ring) > 0 ? 1 : -1;
  return ring.map((p, i) => {
    const a = ring[(i + n - 1) % n], b = ring[(i + 1) % n];
    const n1 = norm(p[0] - a[0], p[1] - a[1]), n2 = norm(b[0] - p[0], b[1] - p[1]);
    const o1: P2 = [n1[1] * s, -n1[0] * s], o2: P2 = [n2[1] * s, -n2[0] * s];
    const m = norm(o1[0] + o2[0], o1[1] + o2[1]), c = Math.max(0.35, m[0] * o1[0] + m[1] * o1[1]);
    return [p[0] + (m[0] * d) / c, p[1] + (m[1] * d) / c];
  });
}
function norm(x: number, z: number): P2 { const l = Math.hypot(x, z) || 1; return [x / l, z / l]; }

/** A round thing turned from a profile (radius, height) on its axis at (x, y, z): a dome, a
 *  cupola, a finial. */
export function lathe(k: Kit, mat: THREE.Material, profile: P2[], x: number, y: number, z: number, seg = 12) {
  k.add(mat, new THREE.LatheGeometry(profile.map(([r, h]) => new THREE.Vector2(r, h)), seg), x, y, z);
}

/** An onion dome's profile, r across at its widest, h tall, rising to a point. */
export function onion(r: number, h: number, neck = 0.75): P2[] {
  const out: P2[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10, y = t * h;
    // a bulb swelling out past its foot, then drawn in to a point
    const w = t < 0.45 ? neck + (1 - neck) * Math.sin((t / 0.45) * (Math.PI / 2)) : Math.cos(((t - 0.45) / 0.55) * (Math.PI / 2)) ** 1.4;
    out.push([Math.max(0.001, r * w), y]);
  }
  return out;
}

/** A wall from a to b (plan points), y0 to y1, t thick, standing on its line. */
export function wallRun(k: Kit, mat: THREE.Material, a: P2, b: P2, y0: number, y1: number, t: number, tile = 3) {
  const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
  if (len < 0.05) return;
  k.box(mat, (a[0] + b[0]) / 2, y0, (a[1] + b[1]) / 2, len, y1 - y0, t, Math.atan2(-dz, dx), tile);
}

/** Windows along a wall from a to b, facing the side of normal (nx, nz): one every gap metres
 *  (kept clear of the ends), each w by h with its middle at height y. */
export function windowsAlong(k: Kit, mat: THREE.Material, a: P2, b: P2, nx: number, nz: number, y: number, w: number, h: number, gap: number, skip = (_t: number) => false) {
  const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
  const n = Math.floor((len - 1) / gap);
  if (n < 1) return;
  const ry = Math.atan2(nx, nz);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    if (skip(t * len)) continue;
    k.quad(mat, a[0] + dx * t + nx * 0.02, y, a[1] + dz * t + nz * 0.02, w, h, ry);
  }
}

/** The outward normal of the edge a to b of the plan ring. */
export function outward(a: P2, b: P2, ring: P2[]): P2 {
  const s = area2(ring) > 0 ? 1 : -1, [ux, uz] = norm(b[0] - a[0], b[1] - a[1]);
  return [uz * s, -ux * s];
}
