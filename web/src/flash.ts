// Flashes of light: a firework bursting over the bonfire (bonfire.ts) or a car going up (game.ts)
// lights up the streets, trees and houses round it for a moment, and you see it best after dark.
// It's one light, always in the scene and dark between flashes (left out of the drawing while it and
// the other lights like it are all dark, unlit.ts); a new flash takes it over from the last.
//
// Who decides what: nobody. Each player's machine flashes it for whatever it sees go off.
import * as THREE from "three";
import { darkable } from "./unlit";

export class Flash {
  private light = new THREE.PointLight("#ffffff", 0, 170, 1);
  private t = 99; private peak = 0; private fade = 2.2; private twinkle = false;

  constructor(scene: THREE.Scene) { scene.add(this.light); darkable(scene, this.light); }

  /** A flash at scene (x, y, z): how bright at first, how quickly it dies away (bigger is quicker),
   *  how far it reaches (metres), and whether it flickers as it goes (a crackling willow, flames). */
  go(x: number, y: number, z: number, colour: THREE.ColorRepresentation, peak: number, o: { fade?: number; reach?: number; twinkle?: boolean } = {}) {
    this.light.position.set(x, y, z);
    this.light.color.set(colour);
    this.light.distance = o.reach ?? 170;
    this.peak = peak; this.fade = o.fade ?? 2.2; this.twinkle = !!o.twinkle;
    this.t = 0;
  }

  update(dt: number) {
    this.t += dt;
    const k = Math.exp(-this.t * this.fade);
    this.light.intensity = k < 0.004 ? 0 : this.peak * k * (this.twinkle ? 0.7 + 0.3 * Math.random() : 1);
  }
}
