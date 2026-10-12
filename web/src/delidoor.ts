// The way into COMBE DOWN WITH ME (deli.html): the front door of the Darling Deli, under a neon sign.
//
// The deli is found by its shop sign on the map (from the shop data, see tools/shops.py), and the
// door is the nearest one to it.
// Maps without the deli simply have no way in.
import * as THREE from "three";
import type { GameMap } from "./map";
import { neonSign } from "./neon";

export const DELI_REACH = 2.2;

export class DeliDoor {
  /** The door, in scene coordinates. */
  readonly x: number = NaN; readonly y: number = NaN; readonly z: number = NaN;
  /** The way out of the door, into the street. */
  private nx = 0; private nz = 1;
  private sign: ReturnType<typeof neonSign> | null = null;

  constructor(map: GameMap, scene: THREE.Scene) {
    const shop = (map.d.sh ?? []).find((s) => /darling deli/i.test(String(s[5])));
    if (!shop) return;
    const sx = Number(shop[0]), sy = Number(shop[1]);
    let best: number[] | undefined, bd = Infinity;
    for (const d of map.d.dr ?? []) {
      const dd = Math.hypot(d[0] - sx, d[1] - sy);
      if (dd < bd) { bd = dd; best = d; }
    }
    if (!best || bd > 15) return;
    const a = best[3];
    const nx = Math.sin(a), nz = Math.cos(a);   // doors face their local +z (world.ts)
    this.nx = nx; this.nz = nz;
    this.x = best[0] + nx * 0.6; this.z = -best[1] + nz * 0.6; this.y = best[2] - map.z0;
    this.sign = neonSign("Combe Down With Me", "#ffb43f");
    this.sign.group.position.set(best[0] + nx * 0.12, best[2] - map.z0 + 2.9, -best[1] + nz * 0.12);
    this.sign.group.rotation.y = a;
    scene.add(this.sign.group);
  }

  update(t: number) { this.sign?.update(t); }

  /** Where you come out after a shift: on the pavement, facing the street. */
  outside(): { x: number; z: number; yaw: number } | undefined {
    if (!Number.isFinite(this.x)) return undefined;
    return { x: this.x + this.nx * 3.2, z: this.z + this.nz * 3.2, yaw: Math.atan2(-this.nx, -this.nz) };
  }

  /** Close enough to the door to go in. */
  near(x: number, z: number, y: number) {
    return Math.hypot(x - this.x, z - this.z) < DELI_REACH && Math.abs(y - this.y) < 2;
  }
}
