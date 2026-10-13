// Headlights: after dark (and in a tunnel) every car in the traffic and every vehicle someone's
// driving, the buses included, has its headlamps on and its tail lights glowing red, and the
// nearest few throw a beam of light down the road ahead of them, so you can see a car coming
// round the corner by the light on the walls before you see the car.
//
// The lamps themselves are two instanced meshes (white at the front, red at the back) laid over
// every lit vehicle's own lamps, so they cost two draw calls however many cars there are. The
// beams are a few spotlights, moved to whichever lit vehicles are nearest the camera every so often:
// always there (dark by day) so the number of lights never changes and nothing has to be rebuilt
// at dusk, as with the street lamps (world.ts).
//
// Nothing goes over the network: everyone already sees the same traffic and vehicles, and the time
// of day comes from the clock (daylight.ts).
import * as THREE from "three";

/** One pair of lamps, in the vehicle's own frame (+x forward, y up, z across): along, up, across
 *  (each lamp sits that far either side of the middle), and the lamp's width and height. */
export type LampPair = [along: number, up: number, across: number, w: number, h: number];
/** A vehicle's headlamps (front) and tail lights (back, along negative; some haven't any). */
export interface Lamps { front: LampPair; back?: LampPair }
/** A vehicle with its lights on: the object it's drawn in (+x forward), and its lamps. */
export interface Lit { frame: THREE.Object3D; lamps: Lamps }

const BEAMS = 4;              // spotlights, on the nearest lit vehicles
const MAX = 80;               // vehicles with their lamps drawn at once
const REACH = 260;            // lamps drawn this far from the camera, m
const BEAM_FULL = 35, BEAM_GONE = 75;   // beams fade out between these distances, so they don't pop on and off
const AIM = 18, DIP = 1.6;    // dipped: the beam's aimed this far ahead and this far down, m

export class Headlights {
  private beams: THREE.SpotLight[] = [];
  private heads: THREE.InstancedMesh;
  private tails: THREE.InstancedMesh;
  private headMat = new THREE.MeshBasicMaterial({ color: "#fff6dc" });
  private tailMat = new THREE.MeshBasicMaterial({ color: "#ff2a1a" });
  private on = 0;                       // 0 by day .. 1 at night or in a tunnel
  private placeT = 0;
  private chosen: THREE.Object3D[] = [];   // which vehicles (by the frame they're drawn in) have the beams
  private v = new THREE.Vector3();
  private m = new THREE.Matrix4();
  private part = new THREE.Matrix4();

  constructor(scene: THREE.Scene) {
    const box = new THREE.BoxGeometry(1, 1, 1);
    const lamps = (mat: THREE.Material) => {
      const im = new THREE.InstancedMesh(box, mat, MAX * 2);
      im.count = 0; im.frustumCulled = false;   // spread all over the place: the bounding box is never right
      scene.add(im);
      return im;
    };
    this.heads = lamps(this.headMat); this.tails = lamps(this.tailMat);
    for (let k = 0; k < BEAMS; k++) {
      const l = new THREE.SpotLight("#fff1d6", 0, 50, 0.52, 0.55, 1.3);
      scene.add(l, l.target);
      this.beams.push(l);
    }
  }

  /**
   * Light up whatever's driving. dark: 0 by day .. 1 at night (daylight.ts); tunnel: 0 .. 1 inside
   * a tunnel (world.ts), where the lights come on whatever the time.
   */
  update(lit: Lit[], cam: THREE.Vector3, dark: number, tunnel: number, dt: number) {
    // they come on as dusk falls, before it's properly dark
    this.on = Math.max(THREE.MathUtils.smoothstep(dark, 0.15, 0.6), tunnel);
    if (this.on < 0.02) {
      this.heads.count = this.tails.count = 0;
      for (const b of this.beams) b.intensity = 0;
      this.chosen.length = 0;
      return;
    }
    const near: [number, Lit][] = [];
    for (const l of lit) {
      const p = l.frame.getWorldPosition(this.v);
      const d = (p.x - cam.x) ** 2 + (p.z - cam.z) ** 2;
      if (d < REACH * REACH) near.push([d, l]);
    }
    near.sort((a, b) => a[0] - b[0]);
    if (near.length > MAX) near.length = MAX;
    // the lamps: lit and glowing, laid just proud of each vehicle's own
    let n = 0, t = 0;
    const lay = (im: THREE.InstancedMesh, l: Lit, [along, up, across, w, h]: LampPair, out: number, k: number) => {
      for (const side of [1, -1]) {
        this.part.makeScale(0.03, h + 0.02, w + 0.02).setPosition(along + out * 0.02, up, across * side);
        im.setMatrixAt(k++, this.m.multiplyMatrices(l.frame.matrixWorld, this.part));
      }
      return k;
    };
    // (getWorldPosition, above, has brought each one's place up to date for this frame)
    for (const [, l] of near) {
      n = lay(this.heads, l, l.lamps.front, 1, n);
      if (l.lamps.back) t = lay(this.tails, l, l.lamps.back, -1, t);
    }
    this.heads.count = n; this.tails.count = t;
    this.heads.instanceMatrix.needsUpdate = this.tails.instanceMatrix.needsUpdate = true;
    this.headMat.color.set("#fff6dc").multiplyScalar(0.6 + 1.2 * this.on);
    this.tailMat.color.set("#ff2a1a").multiplyScalar(0.5 + 0.9 * this.on);
    // the beams: on the nearest few, chosen again every so often
    if ((this.placeT -= dt) <= 0) {
      this.placeT = 0.3;
      this.chosen = near.slice(0, BEAMS).map(([, l]) => l.frame);
    }
    this.beams.forEach((b, k) => {
      // (one that's since been wrecked or driven out of reach goes dark)
      const l = this.chosen[k] && near.find(([, o]) => o.frame === this.chosen[k])?.[1];
      if (!l) { b.intensity = 0; return; }
      const [along, up] = l.lamps.front;
      l.frame.localToWorld(b.position.set(along + 0.1, up, 0));
      l.frame.localToWorld(b.target.position.set(along + AIM, up - DIP, 0));
      const d = Math.hypot(b.position.x - cam.x, b.position.z - cam.z);
      b.intensity = 160 * this.on * (1 - THREE.MathUtils.smoothstep(d, BEAM_FULL, BEAM_GONE));
    });
  }
}
