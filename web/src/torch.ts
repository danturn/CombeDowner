// Torches: every player carries a torch, switched on and off with F (or the Torch button on a
// touch screen), which throws a beam of light wherever they're looking. Yours comes from your eyes;
// everyone else's from their heads, pointing the way they're facing.
//
// The beams are a few spotlights, always in the scene (dark when nobody's using them) so the number
// of lights never changes and nothing has to be rebuilt, as with the headlights (headlights.ts): one
// for you, and the rest go to whichever other players nearest the camera have theirs on.
//
// Over the network each player says whether their torch is on in their state message ("st", game.ts);
// nobody decides anything about anyone else's torch.
import * as THREE from "three";

const OTHERS = 3;              // spotlights for other players' torches
const REACH = 45, ANGLE = 0.42, PENUMBRA = 0.5, DECAY = 1.4;
const BRIGHT = 160;
const FADE_FULL = 30, FADE_GONE = 70;   // others' beams fade out between these distances from you, m

/** Someone else with a torch: where their eyes are and which way they're looking. */
export interface TorchHolder { x: number; y: number; z: number; yaw: number; pitch: number }

export class Torches {
  private mine: THREE.SpotLight;
  private others: THREE.SpotLight[] = [];
  private dir = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    const beam = () => {
      const l = new THREE.SpotLight("#fff4dc", 0, REACH, ANGLE, PENUMBRA, DECAY);
      scene.add(l, l.target);
      return l;
    };
    this.mine = beam();
    for (let k = 0; k < OTHERS; k++) this.others.push(beam());
  }

  /** Shine your own torch from the camera (if on), and others' from the nearest holders. */
  update(camera: THREE.Camera, on: boolean, holders: TorchHolder[]) {
    const c = camera.position;
    this.mine.intensity = on ? BRIGHT : 0;
    if (on) {
      camera.getWorldDirection(this.dir);
      // a touch below and to the right of your eyes, so the beam's edge isn't stuck to the middle of the screen
      this.mine.position.copy(c).add(new THREE.Vector3(0.15, -0.2, 0).applyQuaternion(camera.quaternion));
      this.mine.target.position.copy(c).addScaledVector(this.dir, 10);
      this.mine.target.updateMatrixWorld();
    }
    const near = holders
      .map((h) => ({ h, d: Math.hypot(h.x - c.x, h.y - c.y, h.z - c.z) }))
      .filter((o) => o.d < FADE_GONE)
      .sort((a, b) => a.d - b.d);
    this.others.forEach((l, k) => {
      const o = near[k];
      if (!o) { l.intensity = 0; return; }
      const { h } = o, cp = Math.cos(h.pitch);
      this.dir.set(-Math.sin(h.yaw) * cp, Math.sin(h.pitch), -Math.cos(h.yaw) * cp);
      l.position.set(h.x, h.y, h.z).addScaledVector(this.dir, 0.3);
      l.target.position.copy(l.position).addScaledVector(this.dir, 10);
      l.target.updateMatrixWorld();
      l.intensity = BRIGHT * (1 - THREE.MathUtils.smoothstep(o.d, FADE_FULL, FADE_GONE));
    });
  }
}
