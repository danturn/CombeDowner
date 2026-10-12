// Distance culling: things beyond a set range from the player are hidden, so far-off detail that
// the fog would hide anyway costs nothing. Checked a few times a second, not every frame.
import * as THREE from "three";

interface Item { o: THREE.Object3D; x: number; z: number; r: number; range: number }

export class Culler {
  private items: Item[] = [];
  private t = 0;

  /** Hide o when the player is more than range metres beyond its bounding sphere. */
  add(o: THREE.Object3D, range: number) {
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
    for (const it of this.items) it.o.visible = Math.hypot(it.x - px, it.z - pz) - it.r < it.range;
  }
}
