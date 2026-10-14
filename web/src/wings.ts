// The angel's wings at the top of Bath Abbey's tower (climb.ts is the way up): a pair of glowing
// wings floating over the tower's roof, yours when you walk into them. With them on you glide
// off the ground (player.ts), Space flaps, and looking down dives. And they come with a heavenly
// guitar, strummed with every flap: the chord is the way you're facing (north C, east F, south G,
// west A minor), so turning as you flap plays a tune, and the higher you are the higher it plays.
// Back down on the street for a moment and the wings fold away, till you climb up for them again.
//
// Who decides what: they're your own. Nothing is sent, so for now other players see you fly but
// not your wings, and don't hear your guitar.
import * as THREE from "three";
import * as SFX from "./audio";
import { abbeyClimb } from "./abbeyclimb";
import { CLIMB } from "./landmarks/abbey";
import type { GameMap } from "./map";
import type { Player } from "./player";

const SHOWN = 220;         // the wings over the tower are there when you're this close to the Abbey
const REACH = 1.4;         // and yours this close to them
const FOLD = 1;            // seconds on the street before they fold away
const UP = 1.3;            // how far over the tower's roof they float
// the guitar's chords, north, east, south and west: root (Hz) and minor
const CHORDS: [number, boolean][] = [[130.81, false], [174.61, false], [196.0, false], [220.0, true]];

const feather = new THREE.MeshLambertMaterial({ color: "#fffaf0", emissive: "#e8d9a8", emissiveIntensity: 0.6, side: THREE.DoubleSide });
const gold = new THREE.MeshLambertMaterial({ color: "#f2cf5b", emissive: "#b8892a", emissiveIntensity: 0.5 });
const string = new THREE.MeshBasicMaterial({ color: "#fff6d8" });

/** One wing, spread out along +x from its root (s: -1 for the left one, mirrored). */
function wing(s: number, len: number): THREE.Group {
  const g = new THREE.Group();
  for (let k = 0; k < 6; k++) {
    const l = len * (1 - k * 0.11), w = len * 0.17;
    const f = new THREE.Mesh(new THREE.BoxGeometry(l, 0.012 * len, w), feather);
    f.position.set((s * l) / 2, -k * 0.05 * len, k * 0.06 * len);
    f.rotation.z = s * -k * 0.09;
    g.add(f);
  }
  return g;
}

/** The pair of wings, spread, for over the tower. */
function pair(): THREE.Group {
  const g = new THREE.Group();
  for (const s of [-1, 1]) { const w = wing(s, 1.1); w.position.x = s * 0.12; w.rotation.z = s * 0.35; g.add(w); }
  return g;
}

/** The heavenly guitar: a gold body, a neck and its strings. */
function guitar(): THREE.Group {
  const g = new THREE.Group();
  for (const [r, y] of [[0.13, 0], [0.1, 0.16]]) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.05, 20), gold);
    b.rotation.x = Math.PI / 2; b.position.y = y; g.add(b);
  }
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.42, 0.03), gold);
  neck.position.y = 0.4; g.add(neck);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.03), gold);
  head.position.y = 0.65; g.add(head);
  for (let k = 0; k < 4; k++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.62, 0.004), string);
    s.position.set((k - 1.5) * 0.01, 0.33, 0.03); g.add(s);
  }
  return g;
}

export class Wings {
  /** Seconds since the wings were last flapped, for the flap. */
  private flapT = 9;
  private downT = 0;
  private strumT = 9;
  private pick: THREE.Group | null = null;
  private view = new THREE.Group();
  private left: THREE.Group;
  private right: THREE.Group;
  private axe = guitar();
  private told = false;

  /** world: the scene the wings over the tower are in; hands: the scene of what's in your hands (weapon.ts). */
  constructor(private map: GameMap, private world: THREE.Scene, hands: THREE.Scene, private toast: (text: string, secs?: number) => void) {
    this.left = wing(-1, 0.75); this.right = wing(1, 0.75);
    this.left.position.set(-0.32, -0.12, -0.32); this.right.position.set(0.32, -0.12, -0.32);
    this.axe.position.set(0.05, -0.36, -0.55);
    this.axe.rotation.set(-0.25, 0.25, -1.1);
    this.axe.scale.setScalar(0.85);
    this.view.add(this.left, this.right, this.axe);
    this.view.visible = false;
    hands.add(this.view);
  }

  /** Wearing them: what's in your hands gives way to the guitar. */
  get on() { return this.view.visible; }

  update(dt: number, p: Player, camera: THREE.Camera, alive: boolean) {
    const ab = abbeyClimb(this.map);
    // the wings over the tower, there while you're near and haven't got them on
    if (ab) {
      const at = ab.frame.at((CLIMB.tower.x0 + CLIMB.tower.x1) / 2, CLIMB.tower.top + UP, 0);
      const near = Math.hypot(p.pos.x - at.x, p.pos.z - at.z) < SHOWN;
      if (near && !this.pick) { this.pick = pair(); this.world.add(this.pick); }
      else if (!near && this.pick) { this.world.remove(this.pick); this.pick = null; }
      if (this.pick) {
        const t = performance.now() / 1000;
        this.pick.visible = !p.wings;
        this.pick.position.set(at.x, at.y + Math.sin(t * 1.6) * 0.15, at.z);
        this.pick.rotation.y = t * 0.6;
        this.pick.children.forEach((w, k) => { w.rotation.z = (k ? 1 : -1) * (0.35 + Math.sin(t * 3) * 0.25); });
        if (alive && !p.wings && !p.ladder && Math.hypot(p.pos.x - at.x, p.pos.z - at.z) < REACH && Math.abs(p.pos.y + 0.9 - at.y) < 1.6) {
          p.wings = true;
          this.downT = 0;
          SFX.heavenlyStrum(...CHORDS[0]);
          this.toast(this.told ? "Wings on" : "Angel's wings! Jump off, Space to flap, look down to dive. Turn as you flap to play the guitar", 6);
          this.told = true;
        }
      }
    }
    if (!alive) p.wings = false;
    // back on the street for a moment: they fold away
    if (p.wings && p.onGround && p.pos.y - this.map.ground(p.pos.x, p.pos.z) < 0.25) {
      if ((this.downT += dt) > FOLD) { p.wings = false; this.toast("Your wings fold away. They're back at the top of the Abbey", 3); }
    } else this.downT = 0;
    // a strum with every flap
    if (p.wings && p.flapped) { this.flapT = 0; this.strumT = 0; this.strum(p); }
    this.flapT += dt; this.strumT += dt;
    this.view.visible = p.wings;
    if (!p.wings) return;
    // in view: the wings at the edges, beating down with each flap and spread while you glide, and
    // the guitar in front, jumping as it's strummed
    const flying = !p.onGround;
    const beat = this.flapT < 0.45 ? Math.sin((this.flapT / 0.45) * Math.PI * 2) * 0.7 : 0;
    const lift = (flying ? 0.15 : -0.55) + beat + Math.sin(performance.now() / 300) * 0.04;
    this.left.rotation.set(0, 0.5, lift);
    this.right.rotation.set(0, -0.5, -lift);
    const jump = this.strumT < 0.25 ? Math.sin((this.strumT / 0.25) * Math.PI) * 0.05 : 0;
    this.axe.position.y = -0.36 + jump;
    this.view.position.copy(camera.position);
    this.view.quaternion.copy(camera.quaternion);
  }

  /** The chord the way you're facing, an octave up for every 40 m off the ground. */
  private strum(p: Player) {
    const bearing = ((-p.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const [root, minor] = CHORDS[Math.round(bearing / (Math.PI / 2)) % 4];
    const high = p.pos.y - this.map.ground(p.pos.x, p.pos.z);
    SFX.heavenlyStrum(root * Math.pow(2, Math.min(2, Math.floor(Math.max(0, high) / 40))), minor);
  }

  dispose() {
    if (this.pick) this.world.remove(this.pick);
    this.view.removeFromParent();
  }
}
