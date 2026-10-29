// Distance culling: things beyond a set range from the player are hidden, so far-off detail that
// the fog would hide anyway costs nothing. Checked a few times a second, not every frame.
import * as THREE from "three";

interface Item { o: THREE.Object3D; x: number; z: number; r: number; range: number | (() => number) }

const away = new WeakMap<THREE.Object3D, Set<THREE.Object3D>>();

/** Show or hide a piece of scenery. Hidden, it is also taken out of its parent's children (it
 *  keeps its parent, and traverseAll still finds it): three.js visits every child in the scene
 *  for the picture and again for the shadows, shown or not, and Bath has thousands of hidden
 *  trees, lamps and benches at any moment. */
export function show(o: THREE.Object3D, on: boolean) {
  if (o.visible === on) return;
  o.visible = on;
  const p = o.parent;
  if (!p) return;
  if (on) {
    away.get(p)?.delete(o);
    if (!p.children.includes(o)) p.children.push(o);
    o.matrixWorldNeedsUpdate = true;
  } else {
    const i = p.children.indexOf(o);
    if (i >= 0) p.children.splice(i, 1);
    (away.get(p) ?? away.set(p, new Set()).get(p)!).add(o);
  }
}

/** Object3D.traverse, with what show has hidden too: for freeing everything a square holds. */
export function traverseAll(o: THREE.Object3D, f: (o: THREE.Object3D) => void) {
  f(o);
  for (const c of o.children) traverseAll(c, f);
  const a = away.get(o);
  if (a) for (const c of a) traverseAll(c, f);
}

export class Culler {
  private items: Item[] = [];
  private t = 0;

  /** Hide o when the player is more than range metres beyond its bounding sphere (range can be asked afresh each time). */
  add(o: THREE.Object3D, range: number | (() => number)) {
    let x = o.position.x, z = o.position.z, r = 4;
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) {
      if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
      const s = (o as THREE.InstancedMesh).isInstancedMesh ? (o as THREE.InstancedMesh).boundingSphere : mesh.geometry.boundingSphere;
      if (s) { x = s.center.x + o.position.x; z = s.center.z + o.position.z; r = s.radius; }
    }
    this.items.push({ o, x, z, r, range });
  }

  update(px: number, pz: number, dt: number) {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.25;
    for (const it of this.items) show(it.o, Math.hypot(it.x - px, it.z - pz) - it.r < (typeof it.range === "number" ? it.range : it.range()));
  }
}
