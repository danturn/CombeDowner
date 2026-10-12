// The way into the mines (mines.html): the front door of 1 The Firs, under a neon sign.
//
// Neither OpenStreetMap nor Overture has house numbers here, so "number 1" is taken to be the first
// house at The Avenue end of The Firs, by Firs Field, where numbering usually starts.
import * as THREE from "three";
import type { GameMap } from "./map";
import { neonSign } from "./neon";

const NUMBER_ONE = [-99.3, -234.9];   // map data x, y near that house's front door
export const TOUR_REACH = 2.2;

export class MineTour {
  /** The door, in scene coordinates, and the way it faces. */
  readonly x: number; readonly y: number; readonly z: number;
  private sign: ReturnType<typeof neonSign> | null = null;

  constructor(map: GameMap, scene: THREE.Scene) {
    const doors = map.d.dr ?? [];
    let best = doors[0], bd = Infinity;
    for (const d of doors) {
      const dd = Math.hypot(d[0] - NUMBER_ONE[0], d[1] - NUMBER_ONE[1]);
      if (dd < bd) { bd = dd; best = d; }
    }
    if (!best || bd > 40) { this.x = this.y = this.z = NaN; return; }
    const a = best[3];
    const nx = Math.sin(a), nz = Math.cos(a);   // doors face their local +z (world.ts)
    this.x = best[0] + nx * 0.6; this.z = -best[1] + nz * 0.6; this.y = best[2] - map.z0;
    this.sign = neonSign("Mine tours here!", "#ff3fae");
    // over the door, clear of the porch canopy, just off the wall
    this.sign.group.position.set(best[0] + nx * 0.12, best[2] - map.z0 + 2.9, -best[1] + nz * 0.12);
    this.sign.group.rotation.y = a;
    scene.add(this.sign.group);
  }

  update(t: number) { this.sign?.update(t); }

  /** Close enough to the door to go in. */
  near(x: number, z: number, y: number) {
    return Math.hypot(x - this.x, z - this.z) < TOUR_REACH && Math.abs(y - this.y) < 2;
  }
}
