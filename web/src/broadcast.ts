// The television coverage: when you kick at goal or bowl, the camera leaves your eyes and follows
// the ball the way the telly would, in letterbox, with a caption.
// - A kick: low behind the tee as the boot goes in, then chasing the ball, then a cut to a camera
//   behind the posts looking back as it comes through, slowed right down as it gets there.
// - A ball: the long lens from behind the bowler's arm, straight down the wicket, then a cut to a
//   low camera square of the far stumps, slowed right down as it arrives, to see the bails go.
// Any key or a click goes back to your own eyes, and so does getting hit.
import * as THREE from "three";
import type { Shot } from "./sport";

const UP = new THREE.Vector3(0, 1, 0);
const SLOW = { r: 0.35, c: 0.25 };      // how fast time runs for the ball at the moment that matters
const HOLD = { miss: 1.3, scored: 2.4 }; // seconds to stay on it after the moment (the line, or stopping short)

export class Broadcast {
  /** Covering a ball: the camera is ours, and you stand still. */
  on = false;
  /** How fast time runs for the ball: slow motion at the moment that matters. */
  scale = 1;
  readonly pos = new THREE.Vector3();
  readonly look = new THREE.Vector3();
  fov = 50;
  caption = "";
  private shot: Shot | null = null;      // the ball we're covering
  private done: Shot | null = null;      // the last one we finished with or skipped
  private cut = "";                       // the current camera
  private hold = -1;                      // seconds since the moment, or -1 before it
  private v = new THREE.Vector3();

  /** Back to your own eyes. */
  skip() {
    if (this.shot) this.done = this.shot;
    this.shot = null;
    this.on = false;
    this.scale = 1;
  }

  /** dt: real seconds (the camera doesn't slow down). ground(x, z): terrain height, to keep the camera above it. */
  update(dt: number, shot: Shot | null, ground: (x: number, z: number) => number) {
    if (!shot || shot === this.done) { if (this.on) this.skip(); return; }
    // a ball: watch it leave your hand along the dots before the telly cuts in
    if (shot !== this.shot && shot.sport === "c" && shot.t < 0.5 && shot.rest === 0) return;
    if (shot !== this.shot) {
      this.shot = shot;
      this.on = true;
      this.cut = "";
      this.hold = -1;
      const dist = Math.hypot(shot.goal.x - shot.from.x, shot.goal.z - shot.from.z);
      const wind = Math.round(shot.wind * 2.237);
      this.caption = (shot.sport === "r" ? `Kick at goal · ${Math.round(dist)} m` : `${Math.round(shot.speed * 2.237)} mph`) + (wind ? ` · wind ${wind} mph` : "");
    }
    const b = shot.pos, along = shot.along;
    const togo = this.v.subVectors(shot.goal, b).dot(along);   // metres still to go to the line of the posts or stumps
    if (this.hold < 0 && (togo < 0 || shot.rest > 0)) this.hold = 0;
    if (this.hold >= 0 && (this.hold += dt) > (shot.scored ? HOLD.scored : HOLD.miss)) { this.skip(); return; }
    const side = new THREE.Vector3().crossVectors(along, UP).normalize();
    const want = new THREE.Vector3();
    let cut: string, follow = 0;

    if (shot.sport === "r") {
      if (shot.t < 0.55) {
        cut = "boot";                    // low behind the tee, looking up the flight
        want.copy(shot.from).addScaledVector(shot.dir, -3.2).addScaledVector(side, 0.7).addScaledVector(UP, 0.6);
        this.look.copy(b);
        this.fov = 55;
      } else if (togo > 16 && (this.hold < 0 || this.cut === "chase")) {
        cut = "chase";                   // behind and above the ball
        want.copy(b).addScaledVector(shot.dir, -8).addScaledVector(UP, 2.5);
        this.look.copy(b).lerp(shot.goal, 0.15);
        this.fov = 55;
        follow = 5;
      } else {
        cut = "posts";                   // behind the posts and off to one side, looking back down the pitch
        want.copy(shot.goal).addScaledVector(along, 13).addScaledVector(side, 4).addScaledVector(UP, 1.6);
        this.look.copy(b);
        this.fov = 42;
      }
      this.scale = cut === "posts" && (this.hold < 0 ? togo < 4 : this.hold < 0.6) ? SLOW.r : 1;
    } else {
      if (togo > 4.5 && (this.hold < 0 || this.cut === "arm")) {
        cut = "arm";                     // the long lens, high behind the bowler's arm
        want.copy(shot.from).addScaledVector(along, -16).addScaledVector(UP, 4);
        this.look.copy(shot.goal).addScaledVector(UP, 0.5).addScaledVector(along, -7).lerp(b, 0.3);
        this.fov = 20;
      } else {
        cut = "square";                  // low, square of the far stumps
        want.copy(shot.goal).addScaledVector(side, 7).addScaledVector(along, -0.8).addScaledVector(UP, 0.7);
        this.look.copy(shot.goal).addScaledVector(UP, 0.45);
        this.fov = 32;
      }
      this.scale = cut === "square" && (this.hold < 0 ? togo < 3 : this.hold < 0.9) ? SLOW.c : 1;
    }
    want.y = Math.max(want.y, ground(want.x, want.z) + 0.4);
    // a new camera is a cut; a chasing one swings after the ball
    if (cut !== this.cut || !follow) this.pos.copy(want);
    else this.pos.lerp(want, 1 - Math.exp(-follow * dt));
    this.cut = cut;
  }
}
