// Headlights: after dark (and in a tunnel) every car in the traffic and every vehicle someone's
// driving, the buses included, has its headlamps on and its tail lights glowing red, and the
// nearest few throw a beam of light down the road ahead of them, so you can see a car coming
// round the corner by the light on the walls before you see the car. Day or night, the brake lights
// come on bright red as one slows (and as the traffic queues), white reversing lights as one backs
// up, and the indicators blink amber at the corners when its driver's signalling (game.ts).
//
// The lamps themselves are instanced meshes (white at the front, red at the back, and the brake,
// reversing and indicator lamps) laid over every lit vehicle's own lamps, so they cost a draw call
// each however many cars there are, and the last three none at all when nothing's showing them. The
// beams are a few spotlights, moved to whichever lit vehicles are nearest the camera every so often:
// always there (dark by day, and left out of the drawing while they and the street lamps are all
// dark, unlit.ts), as with the street lamps (world.ts).
//
// Nothing goes over the network: everyone already sees the same traffic and vehicles, and the time
// of day comes from the clock (daylight.ts).
import * as THREE from "three";
import { darkable } from "./unlit";

/** One pair of lamps, in the vehicle's own frame (+x forward, y up, z across): along, up, across
 *  (each lamp sits that far either side of the middle), and the lamp's width and height. */
export type LampPair = [along: number, up: number, across: number, w: number, h: number];
/** A vehicle's headlamps (front) and tail lights (back, along negative; some haven't any). */
export interface Lamps { front: LampPair; back?: LampPair }
/** A vehicle with its lights on: the object it's drawn in (+x forward), and its lamps; whether it's
 *  braking or backing up, and which way it's signalling (1 left, -1 right). */
export interface Lit { frame: THREE.Object3D; lamps: Lamps; brake?: boolean; reverse?: boolean; signal?: number }

const BEAMS = 4;              // spotlights, on the nearest lit vehicles
const MAX = 80;               // vehicles with their lamps drawn at once
const REACH = 260;            // lamps drawn this far from the camera, m
const BEAM_FULL = 35, BEAM_GONE = 75;   // beams fade out between these distances, so they don't pop on and off
const AIM = 18, DIP = 1.3;    // dipped: the beam's aimed this far ahead and this far down, m

export class Headlights {
  private beams: THREE.SpotLight[] = [];
  private heads: THREE.InstancedMesh;
  private tails: THREE.InstancedMesh;
  private headMat = new THREE.MeshBasicMaterial({ color: "#fff6dc" });
  private tailMat = new THREE.MeshBasicMaterial({ color: "#ff2a1a" });
  private brakes: THREE.InstancedMesh;
  private reverses: THREE.InstancedMesh;
  private signals: THREE.InstancedMesh;
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
    this.brakes = lamps(new THREE.MeshBasicMaterial({ color: new THREE.Color("#ff2414").multiplyScalar(1.8) }));
    this.reverses = lamps(new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffffff").multiplyScalar(1.6) }));
    this.signals = lamps(new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffa31a").multiplyScalar(1.8) }));
    for (let k = 0; k < BEAMS; k++) {
      const l = new THREE.SpotLight("#fff1d6", 0, 50, 0.52, 0.55, 1.3);
      scene.add(l, l.target);
      darkable(scene, l);
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
    const night = this.on >= 0.02;
    this.signalled(lit, cam);
    if (!night) {
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
      b.intensity = 200 * this.on * (1 - THREE.MathUtils.smoothstep(d, BEAM_FULL, BEAM_GONE));
    });
  }

  /** The brake lights, reversing lights and indicators, day or night, on whatever's near enough to see them. */
  private signalled(lit: Lit[], cam: THREE.Vector3) {
    let b = 0, r = 0, s = 0;
    const blink = performance.now() % 760 < 380;
    const put = (im: THREE.InstancedMesh, k: number, l: Lit, along: number, up: number, across: number, w: number, h: number) => {
      this.part.makeScale(0.03, h, w).setPosition(along, up, across);
      im.setMatrixAt(k, this.m.multiplyMatrices(l.frame.matrixWorld, this.part));
    };
    for (const l of lit) {
      if (!l.brake && !l.reverse && !(l.signal && blink)) continue;
      const p = l.frame.getWorldPosition(this.v);
      if ((p.x - cam.x) ** 2 + (p.z - cam.z) ** 2 > REACH * REACH || b + 2 > MAX * 2 || r + 2 > MAX * 2 || s + 4 > MAX * 2) continue;
      const back = l.lamps.back, [fa, fu, fc, fw] = l.lamps.front;
      if (back) {
        const [ba, bu, bc, bw, bh] = back;
        for (const side of [1, -1]) {
          if (l.brake) put(this.brakes, b++, l, ba - 0.035, bu, bc * side, bw + 0.04, bh + 0.04);
          if (l.reverse) put(this.reverses, r++, l, ba - 0.035, bu, Math.max(0.12, bc * 0.45) * side, 0.1, 0.08);
          if (l.signal && blink && side === -Math.sign(l.signal)) put(this.signals, s++, l, ba - 0.035, bu, (bc + bw / 2 + 0.05) * side, 0.09, 0.09);
        }
      }
      // and at the front corner (+z is the right: so the left is -z, at the back as at the front)
      if (l.signal && blink) put(this.signals, s++, l, fa + 0.035, fu, -(fc + fw / 2 + 0.05) * Math.sign(l.signal), 0.09, 0.09);
    }
    this.brakes.count = b; this.reverses.count = r; this.signals.count = s;
    this.brakes.visible = b > 0; this.reverses.visible = r > 0; this.signals.visible = s > 0;
    this.brakes.instanceMatrix.needsUpdate = this.reverses.instanceMatrix.needsUpdate = this.signals.instanceMatrix.needsUpdate = true;
  }
}
