// A search circle drawn out in the world: a band of light along its edge, laid on the ground, and a
// low wall of light standing on it that fades away upwards, so the edge shows from inside the circle,
// from outside it and from a roof looking down. One mesh, one draw, its own colour; laid again on the
// ground now and then, as the streets under it may still be coming in.
//
// Nothing here goes over the network: whoever owns the circle says where it is.
import * as THREE from "three";
import type { GameMap } from "./map";

const WALL = 9;          // metres the wall of light stands
const FOOT = 1.4;        // the bright strip at its foot
const BAND = 1.5;        // half the band's width on the ground, at the least: wider round a big circle, to show from a roof
const RELAY = 2;         // seconds between laying it on the ground again
const SHOWN = 700;       // drawn while you're this near its edge

export class SearchRing {
  private mesh: THREE.Mesh | null = null;
  private at: { x: number; z: number; r: number } | null = null;
  private segs = 0;
  private laid = RELAY;

  constructor(private scene: THREE.Scene, private map: GameMap, private colour: string) {}

  /** Where the circle is now (null: none), where you are, and the time since the last frame. */
  update(c: { x: number; z: number; r: number } | null, me: { x: number; z: number }, dt: number) {
    if (!c) { this.drop(); return; }
    const segs = Math.max(48, Math.min(192, Math.ceil((Math.PI * 2 * c.r) / 10)));
    if (!this.mesh || segs !== this.segs) this.build(segs);
    if (!this.at || this.at.x !== c.x || this.at.z !== c.z || this.at.r !== c.r) { this.at = { ...c }; this.laid = RELAY; }
    const mesh = this.mesh!, edge = Math.abs(Math.hypot(me.x - c.x, me.z - c.z) - c.r);
    mesh.visible = edge < SHOWN;
    if (!mesh.visible) return;
    (mesh.material as THREE.MeshBasicMaterial).opacity = 0.75 + 0.25 * Math.sin(performance.now() / 380);
    if ((this.laid += dt) < RELAY) return;
    this.laid = 0;
    this.lay();
  }

  private build(segs: number) {
    this.drop();
    this.segs = segs;
    const n = segs + 1, geo = new THREE.BufferGeometry(), idx: number[] = [];
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 5 * 3), 3));
    // five rings of points: the band's inner and outer edge, then the wall's foot, the top of its bright strip, and its top
    const col = new Float32Array(n * 5 * 4), base = new THREE.Color(this.colour);
    const alpha = [0.85, 0.85, 0.9, 0.6, 0];
    for (let i = 0; i < n; i++) for (let k = 0; k < 5; k++) col.set([base.r, base.g, base.b, alpha[k]], (k * n + i) * 4);
    geo.setAttribute("color", new THREE.BufferAttribute(col, 4));
    for (const [a, b] of [[0, 1], [2, 3], [3, 4]]) {
      for (let i = 0; i < segs; i++) {
        const p = a * n + i, q = b * n + i;
        idx.push(p, q, p + 1, q, q + 1, p + 1);
      }
    }
    geo.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.scene.add(this.mesh);
  }

  private lay() {
    const c = this.at, mesh = this.mesh;
    if (!c || !mesh) return;
    const n = this.segs + 1, pos = mesh.geometry.getAttribute("position") as THREE.BufferAttribute, band = Math.max(BAND, c.r / 80);
    const at = (k: number, i: number, r: number, lift: number, cs: number, sn: number) => {
      const x = c.x + cs * r, z = c.z + sn * r;
      pos.setXYZ(k * n + i, x, this.map.ground(x, z) + lift, z);
    };
    for (let i = 0; i < n; i++) {
      const a = (i / this.segs) * Math.PI * 2, cs = Math.cos(a), sn = Math.sin(a);
      at(0, i, c.r - band, 0.3, cs, sn);
      at(1, i, c.r + band, 0.3, cs, sn);
      at(2, i, c.r, 0.3, cs, sn);
      at(3, i, c.r, FOOT, cs, sn);
      at(4, i, c.r, WALL, cs, sn);
    }
    pos.needsUpdate = true;
  }

  private drop() {
    if (!this.mesh) return;
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh = null;
    this.at = null;
  }

  dispose() { this.drop(); }
}
