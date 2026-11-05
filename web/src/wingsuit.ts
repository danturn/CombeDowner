// The wingsuit: earned once by standing somewhere at least 15 m above the ground round you (any roof,
// tower, high wall or cliff edge, measured from the map's own ground, so it's the same on every map),
// then kept in your wardrobe as something for your back, where it's folded (wardrobe.ts draws that).
// Jump in mid-air, well clear of what's below, and it opens (player.ts flies it): your arms and legs
// spread with fabric between them, a strip of it at either side of your view, and the wind in your
// ears rising with your speed. The first time you're in the air in it you're told how to open it.
//
// Who decides what: it's your own. Earning it is your machine's say alone, as with everything in the
// wardrobe. Whether it's open goes out with where you are (game.ts, "ws" in the state message), so the
// others see you spread out flying; pages that don't know it just see you falling.
import * as THREE from "three";
import * as SFX from "./audio";
import { box, part, type Piece } from "./avatar";
import { count, earn, has } from "./wardrobe";
import type { Player } from "./player";
import { guide } from "./notice";

export const SUIT_ID = "wsuit";
const HIGH = 15;           // metres above the lowest ground round you that earns the suit
const AROUND = 10;         // how far round you that ground is looked for
const CLEAR = 3;           // clear below before it'll open (as player.ts has it), for the first hint
const FABRIC = "#e8452c", EDGE = "#26262c", STRIPE = "#f2c230";

/** A flat sheet through these points (a fan from the first), the same colour both sides, as one shape
 *  part() can weld with the boxes. */
export function sheet(points: [number, number, number][], colour: THREE.ColorRepresentation): Piece {
  const n = points.length, pos: number[] = [], idx: number[] = [];
  for (let side = 0; side < 2; side++) for (const p of points) pos.push(...p);
  for (let i = 1; i < n - 1; i++) { idx.push(0, i, i + 1); idx.push(n, n + i + 1, n + i); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(new Array(n * 4).fill(0), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return [g, colour];
}

let open: THREE.BufferGeometry | null = null;
/** The open suit's fabric on someone spread out flying, in avatar.ts's body frame (feet at 0, facing
 *  -z), for arms held out at shoulder height and legs a little apart: made once, shared by everyone. */
export function suitGeometry(): THREE.BufferGeometry {
  if (open) return open;
  const wing = (s: number): Piece[] => [
    sheet([[s * 0.24, 1.43, 0], [s * 0.86, 1.31, 0], [s * 0.4, 0.95, 0], [s * 0.16, 0.86, 0]], FABRIC),
    [box(0.5, 0.025, 0.03, 0, 0, 0).rotateZ(s * 0.24).translate(s * 0.6, 1.24, 0.005), STRIPE],
  ];
  open = part([
    ...wing(-1), ...wing(1),
    sheet([[-0.13, 0.86, 0], [0.13, 0.86, 0], [0.33, 0.12, 0], [-0.33, 0.12, 0]], FABRIC),
    [box(0.6, 0.03, 0.03, 0, 0.16, 0.005), EDGE],
  ]);
  return open;
}

export class Wingsuit {
  private view: THREE.Mesh;
  private wind: ReturnType<typeof SFX.rideNoise> = null;
  private was = false;
  private spread = 0;
  private told = false;

  /** hands: the scene of what's in your hands (weapon.ts), where the strips of fabric at the sides of your view go. */
  constructor(hands: THREE.Scene) {
    // seen from inside: a strip of the arm's fabric at either edge, out past the gun, sleeves along the top
    const side = (s: number): Piece[] => [
      sheet([[s * 0.36, 0.02, -0.42], [s * 1.0, 0.14, -0.72], [s * 1.05, -0.32, -0.55], [s * 0.42, -0.24, -0.3]], FABRIC),
      [box(0.04, 0.04, 0.72).rotateY(s * -0.9).rotateZ(s * 0.15).translate(s * 0.67, 0.08, -0.57), EDGE],
      [box(0.015, 0.015, 0.6).rotateY(s * -0.9).rotateZ(s * 0.12).translate(s * 0.7, -0.08, -0.5), STRIPE],
    ];
    this.view = new THREE.Mesh(part([...side(-1), ...side(1)]), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
    this.view.visible = false;
    this.view.frustumCulled = false;
    hands.add(this.view);
  }

  /** Each frame: the fabric in view, the wind, and the sound of it opening. */
  update(dt: number, p: Player, camera: THREE.Camera) {
    if (p.suitOpen !== this.was) { this.was = p.suitOpen; SFX.flap(0, 0, true); }
    this.spread += ((p.suitOpen ? 1 : 0) - this.spread) * Math.min(1, dt * 8);
    const v = Math.hypot(p.vel.x, p.vel.y, p.vel.z);
    if (p.suitOpen && !this.wind) this.wind = SFX.rideNoise();
    if (this.wind) {
      this.wind.set(p.suitOpen ? Math.min(1, v / 32) : 0, 0, 0, 0);
      if (!p.suitOpen && this.spread < 0.05) { this.wind.stop(); this.wind = null; }
    }
    this.view.visible = this.spread > 0.02;
    if (!this.view.visible) return;
    this.view.position.copy(camera.position);
    this.view.quaternion.copy(camera.quaternion);
    // opening, the strips sweep in from out of sight below; a ripple in them at speed
    this.view.translateY(-(1 - this.spread) * 0.8);
    this.view.scale.set(1, 1 + Math.sin(performance.now() / 45) * 0.012 * Math.min(1, v / 25), 1);
  }

  /** Once a second, stood still on your own feet: high enough over the ground round you and the suit's
   *  yours. ground: the map's ground height at a spot. */
  check(p: Player, ground: (x: number, z: number) => number) {
    if (!p.onGround || p.ladder || has(SUIT_ID)) return;
    let low = ground(p.pos.x, p.pos.z);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      low = Math.min(low, ground(p.pos.x + Math.cos(a) * AROUND, p.pos.z + Math.sin(a) * AROUND));
    }
    if (Number.isFinite(low) && p.pos.y - low >= HIGH && earn(SUIT_ID)) guide("A wingsuit! Jump off, then {jump} in mid-air to open it. {forward} dives, {back} pulls up, {strafeleft} and {straferight} bank round");
  }

  /** The first time you're in the air in it, clear of the ground, tell you how to open it. clear: metres below you. */
  hint(p: Player, clear: number) {
    if (!p.suit || p.suitOpen || p.wings || p.onGround || p.vel.y > 0 || clear < CLEAR) return;
    if (this.told) return;
    this.told = true;
    if (count("suittip") > 1) return;
    guide("{jump} to open the wingsuit");
  }

  dispose() {
    this.wind?.stop();
    this.view.removeFromParent();
    this.view.geometry.dispose();
  }
}
