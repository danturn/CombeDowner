// The angel's wings at the top of Bath Abbey's tower (climb.ts is the way up): a pair of glowing
// wings floating over the tower's roof, yours when you walk into them, with a halo to keep in your
// wardrobe the first time. With them on you glide off the ground (player.ts), Space flaps, and
// looking down dives, and you glow gold while you fly. The flight runs out: after FLIGHT seconds in
// the air your flaps lift you no more and you glide down. And they come with a heavenly guitar, a
// screaming lead: where you look picks the note (up high, down low), turning shreds runs of notes up
// or down the scale the way you turn, and every flap is a long bent note. Back on the street for a
// moment and the wings fold away, till you climb up for them again.
//
// Who decides what: they're your own. Whether you're flying with them goes out with where you are
// (game.ts), so the others see your wings and your glow; the guitar is for you alone.
import * as THREE from "three";
import * as SFX from "./audio";
import { abbeyClimb } from "./abbeyclimb";
import { CLIMB } from "./landmarks/abbey";
import type { GameMap } from "./map";
import type { Player } from "./player";
import { angelGlow, angelWings, wing } from "./angelwings";
import { earn } from "./wardrobe";

const SHOWN = 220;         // the wings over the tower are there when you're this close to the Abbey
const REACH = 1.4;         // and yours this close to them
const FOLD = 1;            // seconds on the street before they fold away
const UP = 1.3;            // how far over the tower's roof they float
const FLIGHT = 45;         // seconds of flight in a pair of wings
const LOW = 10;            // and the bar of what's left goes red this near the end
// the solo: the A minor blues scale over three octaves from A3, picked by where you look, and a
// note for every so far you turn
const SCALE = [0, 3, 5, 6, 7, 10].flatMap((n) => [0, 12, 24].map((o) => n + o)).sort((a, b) => a - b).concat(36);
const NOTE = (k: number) => 220 * Math.pow(2, SCALE[Math.max(0, Math.min(SCALE.length - 1, k))] / 12);
const TURN = 0.07;         // radians of turning to a note
const QUICKEST = 0.055;    // and the shortest gap between notes, seconds

const gold = new THREE.MeshLambertMaterial({ color: "#f2cf5b", emissive: "#b8892a", emissiveIntensity: 0.5 });
const string = new THREE.MeshBasicMaterial({ color: "#fff6d8" });

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
  /** Seconds of flight left in these wings. */
  private flight = FLIGHT;
  private turned = 0;       // radians turned since the last note
  private noteT = 0;        // seconds since the last note
  private run = 0;          // notes into the run
  private was = { yaw: 0, pitch: 0 };
  private hud: HTMLDivElement;
  private halo: HTMLDivElement;

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
    // what's left of the flight, under the crosshair, and the gold glow round the edges of the screen
    this.hud = document.createElement("div");
    this.hud.style.cssText = "position:fixed;left:50%;top:calc(50% + 30px);width:120px;height:6px;margin-left:-60px;pointer-events:none;z-index:5;border-radius:3px;background:rgba(0,0,0,0.45);overflow:hidden";
    this.hud.innerHTML = '<div style="height:100%;width:100%;background:#f2cf5b"></div>';
    this.halo = document.createElement("div");
    this.halo.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:4;background:radial-gradient(ellipse at center, transparent 50%, rgba(255,214,110,0.55));mix-blend-mode:screen";
    this.hud.hidden = this.halo.hidden = true;
    const at = document.getElementById("hud") ?? document.body;
    at.append(this.halo, this.hud);
  }

  /** Wearing them: what's in your hands gives way to the guitar. */
  get on() { return this.view.visible; }
  /** Flying with them, glowing: the others see that (game.ts sends it). */
  glowing = false;

  update(dt: number, p: Player, camera: THREE.Camera, alive: boolean) {
    const ab = abbeyClimb(this.map);
    // the wings over the tower, there while you're near and haven't got them on
    if (ab) {
      const at = ab.frame.at((CLIMB.tower.x0 + CLIMB.tower.x1) / 2, CLIMB.tower.top + UP, 0);
      const near = Math.hypot(p.pos.x - at.x, p.pos.z - at.z) < SHOWN;
      if (near && !this.pick) { this.pick = angelWings(); this.pick.add(angelGlow(3.5)); this.world.add(this.pick); }
      else if (!near && this.pick) { this.world.remove(this.pick); this.pick = null; }
      if (this.pick) {
        const t = performance.now() / 1000;
        this.pick.visible = !p.wings;
        this.pick.position.set(at.x, at.y + Math.sin(t * 1.6) * 0.15, at.z);
        this.pick.rotation.y = t * 0.6;
        this.pick.children.forEach((w, k) => { if (k < 2) w.rotation.z = (k ? 1 : -1) * (0.35 + Math.sin(t * 3) * 0.25); });
        if (alive && !p.wings && !p.ladder && Math.hypot(p.pos.x - at.x, p.pos.z - at.z) < REACH && Math.abs(p.pos.y + 0.9 - at.y) < 1.6) {
          p.wings = true; p.wingLift = true;
          this.downT = 0;
          this.flight = FLIGHT;
          // a lick to put them on
          [0, 2, 4, 5].forEach((k, i) => setTimeout(() => SFX.guitarLead(NOTE(6 + k), i === 3 ? 0.8 : 0.12, i === 3 ? 2 : 0), i * 110));
          this.toast(this.told ? "Wings on" : "Angel's wings! Jump off: Space flaps, look down to dive. Turn to shred the guitar, look up and down for the high and low notes", 7);
          this.told = true;
          earn("halo");
        }
      }
    }
    if (!alive) p.wings = false;
    // back on the street for a moment: they fold away
    if (p.wings && p.onGround && p.pos.y - this.map.ground(p.pos.x, p.pos.z) < 0.25) {
      if ((this.downT += dt) > FOLD) { p.wings = false; this.toast("Your wings fold away. They're back at the top of the Abbey", 3); }
    } else this.downT = 0;
    const flying = p.wings && !p.onGround;
    // the flight runs out: then you can only glide down
    if (flying && p.wingLift && (this.flight -= dt) <= 0) {
      p.wingLift = false;
      SFX.guitarLead(NOTE(3), 1.2, -5);
      this.toast("Your wings are spent: glide on down", 3);
    }
    this.glowing = flying && p.wingLift;
    this.halo.hidden = !this.glowing;
    if (this.glowing) this.halo.style.opacity = String(0.7 + Math.sin(performance.now() / 180) * 0.3);
    this.hud.hidden = !p.wings || !p.wingLift;
    const bar = this.hud.firstElementChild as HTMLDivElement;
    bar.style.width = `${(Math.max(0, this.flight) / FLIGHT) * 100}%`;
    bar.style.background = this.flight < LOW ? "#ff5a4e" : "#f2cf5b";
    // the solo: turning shreds, where you look picks the note, and a flap is a long bend
    const dyaw = Math.atan2(Math.sin(p.yaw - this.was.yaw), Math.cos(p.yaw - this.was.yaw));
    this.was = { yaw: p.yaw, pitch: p.pitch };
    this.noteT += dt;
    const base = Math.round(((p.pitch + 1.2) / 2.4) * (SCALE.length - 1));
    if (p.wings && p.flapped) { this.flapT = 0; this.strumT = 0; SFX.guitarLead(NOTE(base), 0.9, 2); this.noteT = 0; this.run = 0; }
    if (flying) {
      this.turned += Math.abs(dyaw);
      if (this.turned >= TURN && this.noteT >= QUICKEST) {
        this.turned = Math.min(this.turned - TURN, TURN * 2);
        this.run++;
        SFX.guitarLead(NOTE(base + Math.sign(dyaw || 1) * (this.run % 4)), 0.16);
        this.noteT = 0; this.strumT = 0;
      }
      if (Math.abs(dyaw) < 0.002) this.run = 0;
    } else this.turned = 0;
    this.flapT += dt; this.strumT += dt;
    this.view.visible = p.wings;
    if (!p.wings) return;
    // in view: the wings at the edges, beating down with each flap and spread while you glide, and
    // the guitar in front, jumping as it's strummed
    const aloft = !p.onGround;
    const beat = this.flapT < 0.45 ? Math.sin((this.flapT / 0.45) * Math.PI * 2) * 0.7 : 0;
    const lift = (aloft ? 0.15 : -0.55) + beat + Math.sin(performance.now() / 300) * 0.04;
    this.left.rotation.set(0, 0.5, lift);
    this.right.rotation.set(0, -0.5, -lift);
    const jump = this.strumT < 0.25 ? Math.sin((this.strumT / 0.25) * Math.PI) * 0.05 : 0;
    this.axe.position.y = -0.36 + jump;
    this.view.position.copy(camera.position);
    this.view.quaternion.copy(camera.quaternion);
  }

  dispose() {
    if (this.pick) this.world.remove(this.pick);
    this.view.removeFromParent();
    this.hud.remove(); this.halo.remove();
  }
}
