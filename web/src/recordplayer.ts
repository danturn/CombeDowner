// A record player on a folding table up on Little Solsbury Hill, the flat-topped hill fort over
// Batheaston. It's an old portable, the suitcase kind, with its lid propped open and a record on
// it, the arm resting in the groove. It doesn't play: the record sits still and the hill is quiet.
//
// Who decides what: nothing goes over the network. Where it stands is fixed.
import * as THREE from "three";
import type { GameMap } from "./map";
import { Kit, plain } from "./landmarks/kit";

/** Where it stands on the hill (data metres), and the spot it was looked at from, which the front of the table faces. */
const SPOT = { x: 748.2, y: 5105.7 };
const FACING = { x: 744.7, y: 5108.4 };
const MAP = "combe-down";
const TOP = 0.72;            // the table's height

/** The table and the record player on it: its front faces +z, its middle at the origin on the ground. */
function build(): { root: THREE.Group; record: THREE.Object3D } {
  const k = new Kit();
  const top = plain("#ddd6c4"), metal = plain("#8d939a"), rexine = plain("#7e2b28"), cream = plain("#e9dfc7");
  const dark = plain("#2a2522"), platter = plain("#4a4c50"), chrome = plain("#c9ccd0"), sleeve = plain("#2f6c8c");
  // the folding table: a pale top on two pairs of crossed legs, with a bar between them
  k.slab(top, -0.5, 0.5, TOP - 0.025, TOP, -0.3, 0.3);
  k.slab(metal, -0.48, 0.48, TOP - 0.05, TOP - 0.025, -0.28, -0.26);
  k.slab(metal, -0.48, 0.48, TOP - 0.05, TOP - 0.025, 0.26, 0.28);
  for (const x of [-0.42, 0.42]) {
    k.beam(metal, [x, 0, -0.26], [x, TOP - 0.05, 0.26], 0.025, 0.025);
    k.beam(metal, [x, 0, 0.26], [x, TOP - 0.05, -0.26], 0.025, 0.025);
  }
  k.beam(metal, [-0.42, 0.36, 0], [0.42, 0.36, 0], 0.02, 0.02);
  // the record player: the case, its cream deck, the speaker grille on the front, the lid propped open behind
  const y = TOP, cx = -0.08;
  k.slab(rexine, cx - 0.2, cx + 0.2, y, y + 0.1, -0.16, 0.16);
  k.slab(cream, cx - 0.19, cx + 0.19, y + 0.1, y + 0.105, -0.15, 0.15);
  k.slab(dark, cx - 0.16, cx + 0.16, y + 0.015, y + 0.085, 0.16, 0.162);
  k.add(rexine, new THREE.BoxGeometry(0.4, 0.3, 0.04), cx, y + 0.24, -0.19, 0, 0, -0.22);
  k.add(dark, new THREE.BoxGeometry(0.3, 0.2, 0.005), cx, y + 0.24, -0.167, 0, 0, -0.22);
  // the platter, the arm's pivot and the arm resting on the record, the knobs on the deck
  k.cyl(platter, cx - 0.03, y + 0.105, 0, 0.135, 0.012, 24);
  k.cyl(chrome, cx + 0.15, y + 0.105, -0.1, 0.018, 0.03, 10);
  k.beam(chrome, [cx + 0.15, y + 0.13, -0.1], [cx + 0.07, y + 0.125, 0.07], 0.008, 0.008);
  k.box(dark, cx + 0.065, y + 0.115, 0.08, 0.025, 0.012, 0.035, 0.4);
  for (const dx of [0.12, 0.165]) k.cyl(dark, cx + dx, y + 0.105, 0.11, 0.012, 0.015, 8);
  // its sleeve, lying on the table beside it
  k.add(sleeve, new THREE.BoxGeometry(0.31, 0.004, 0.31), 0.32, y + 0.002, 0.02, 0.3);
  k.add(cream, new THREE.BoxGeometry(0.14, 0.001, 0.14), 0.32, y + 0.0045, 0.02, 0.3);
  const root = k.build();
  // the record itself: black with a bright label, and a mark on the label
  const rk = new Kit();
  rk.cyl(plain("#151515"), 0, 0, 0, 0.15, 0.003, 28);
  rk.cyl(plain("#e07a2a"), 0, 0.003, 0, 0.045, 0.001, 16);
  rk.box(plain("#f3ead2"), 0.022, 0.004, 0, 0.03, 0.0008, 0.008);
  rk.cyl(chrome, 0, 0, 0, 0.004, 0.02, 6);
  const record = rk.build();
  record.position.set(cx - 0.03, y + 0.117, 0);
  root.add(record);
  return { root, record };
}

/** The record player on Solsbury Hill: drawn while you're about, silent. */
export class RecordPlayer {
  /** How far away a point is, and how far to your right (game.ts sets it; nothing here uses it now). */
  hear: (x: number, y: number, z: number) => [number, number] = () => [0, 0];
  private model: { root: THREE.Group; record: THREE.Object3D } | null = null;
  private spot: { x: number; z: number; y: number } | null | undefined;   // undefined: not looked for yet; null: not on this map

  constructor(private map: GameMap, private scene: THREE.Scene) {}

  /** Show it while you're about, with you at (px, py, pz). */
  update(_dt: number, px: number, _py: number, pz: number) {
    const spot = this.find(px, pz);
    const far = spot ? Math.hypot(px - spot.x, pz - spot.z) : Infinity;
    if (!spot || far > 400) { if (this.model) this.model.root.visible = false; return; }
    if (!this.model) {
      this.model = build();
      this.model.root.position.set(spot.x, spot.y, spot.z);
      this.model.root.rotation.y = Math.atan2(FACING.x - SPOT.x, SPOT.y - FACING.y);
      this.scene.add(this.model.root);
    }
    this.model.root.visible = true;
  }

  /** The table's spot in scene coordinates, clear of walls and trees: undefined while its square of
   *  Bath hasn't loaded, null if it's not on this map. */
  private find(px: number, pz: number): { x: number; z: number; y: number } | null | undefined {
    if (this.spot !== undefined) return this.spot;
    if (this.map.d.id !== MAP) return (this.spot = null);
    const x = SPOT.x, z = -SPOT.y;
    if (Math.hypot(px - x, pz - z) > 600) return undefined;   // look once you're near enough for its square to be in
    if (!this.map.tilesNear(x, z, 20).length) return undefined;
    for (let r = 0; r <= 6; r += 0.5) for (let a = 0; a < 8; a++) {
      const cx = x + r * Math.cos(a * Math.PI / 4), cz = z + r * Math.sin(a * Math.PI / 4);
      if (!this.map.blocked(cx, cz, 0.7)) return this.settle(cx, cz);
      if (r === 0) break;
    }
    return this.settle(x, z);
  }

  private settle(x: number, z: number) {
    this.map.keepClear.push({ x, z, r: 0.7 });
    return (this.spot = { x, z, y: this.map.ground(x, z) });
  }

  dispose() {
    this.model?.root.removeFromParent();
    this.model = null;
  }
}
