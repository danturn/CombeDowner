// Boulders on the bare rock (the map's rk, placed by tools/wild.py from the map data: out on the
// mountain, clear of the streets, paths, walls and buildings). One instanced mesh for each patch of
// a square, hidden with the rest of the far scenery, so a mountainside of them is a few draws. The
// big ones are solid (map.ts). Nothing here goes over the network: every player builds the same.
import * as THREE from "three";
import type { Culler } from "./cull";

const PATCH = 400;     // metres a side of each patch of boulders

let shape: THREE.BufferGeometry | null = null;
let stone: THREE.MeshLambertMaterial | null = null;

/** A lumpy, faceted stone a metre across, sitting on y = 0 with its widest part low down. */
function boulderGeo() {
  const g = new THREE.IcosahedronGeometry(0.5, 1).toNonIndexed();
  const p = g.getAttribute("position") as THREE.BufferAttribute;
  const bump = (x: number, y: number, z: number) => 0.78 + 0.32 * Math.abs(Math.sin(x * 7.1 + y * 3.7) * Math.cos(z * 5.3 - x * 2.9));
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = bump(Math.round(x * 50), Math.round(y * 50), Math.round(z * 50));
    // flat underneath, so it beds into the slope
    p.setXYZ(i, x * k, Math.max(-0.12, y * k * 0.72) + 0.12, z * k);
  }
  g.computeVertexNormals();
  return g;
}

function hash(x: number, y: number, k: number) {
  let h = Math.imul(Math.round(x * 10) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(Math.round(y * 10) + k * 0x632be5ab, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

/** rocks: [x, y, ground, size] (data coordinates, absolute heights); z0: the map's base height. */
export function buildBoulders(scene: THREE.Object3D, rocks: number[][], z0: number, culler: Culler, range: () => number) {
  if (!rocks.length) return;
  shape ??= boulderGeo();
  stone ??= new THREE.MeshLambertMaterial({ flatShading: true });
  const patches = new Map<string, number[][]>();
  for (const q of rocks) {
    const k = `${Math.floor(q[0] / PATCH)},${Math.floor(q[1] / PATCH)}`;
    (patches.get(k) ?? patches.set(k, []).get(k)!).push(q);
  }
  const m4 = new THREE.Matrix4(), rot = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), at = new THREE.Vector3(), col = new THREE.Color();
  for (const list of patches.values()) {
    const mesh = new THREE.InstancedMesh(shape, stone, list.length);
    list.forEach(([x, y, g, s], n) => {
      const a = hash(x, y, 1), b = hash(x, y, 2), c = hash(x, y, 3);
      e.set((a - 0.5) * 0.35, a * Math.PI * 2, (b - 0.5) * 0.35);
      sc.set(s * (0.8 + 0.4 * b), s * (0.7 + 0.6 * c), s * (0.8 + 0.4 * a));
      m4.compose(at.set(x, g - z0 - 0.18 * s, -y), rot.setFromEuler(e), sc);
      mesh.setMatrixAt(n, m4);
      // grey stone, some paler, some with a warm stain
      const l = 0.2 + 0.1 * c;
      mesh.setColorAt(n, col.setRGB(l * (1 + 0.08 * a), l * (0.98 + 0.03 * b), l * (0.92 + 0.02 * c)));
    });
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    scene.add(mesh);
    culler.add(mesh, range);
  }
}
