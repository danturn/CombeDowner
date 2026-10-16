// Jamie Mair, up on Lansdown, having a crafty smoke. Some of the time he's at the top of Van Diemen's
// Lane, just down from Lansdown Road; the rest he's hiding in the bushes between Kingswood School's
// chapel and Lansdown Road. He swaps every six hours of the game's day, when nobody's watching. He
// stands about smoking, the tip glowing and the smoke drifting off, and chats to anyone who comes
// near. Walk right up to him and he gives you a cigarette: smoke it and for a minute (SMOKE seconds)
// nothing can hurt you and every hit you land does double, which is just what you want for Bendy,
// who haunts Fonthill Road just over the way. Then he wants a minute before he'll give you another.
// You can't hurt him: rounds stop at him, and he tells you what he thinks of that.
//
// Who decides what: where he is comes from the shared clock (daylight.ts), so everyone finds him in
// the same place, and he never moves otherwise, so nothing about him goes over the network. The
// cigarette is your own: game.ts says you're smoking in where you are ("st", smoke), and the host
// lets nothing hurt a player who's smoking. What he says is each player's own, only ever for show.
import * as THREE from "three";
import { model, Part } from "./furniture";
import { timeOfDay } from "./daylight";
import type { GameMap } from "./map";
import { speechBubble } from "./naughtyboys";
import * as Posh from "./posh";

export const SMOKE = 60;        // seconds a cigarette lasts, and you with it
export const REST = 60;         // and after it's out, how long before he'll give you another
const GIVE = 2.2;               // he gives you one this close
const HEAR = 25;                // and talks while you're this close
const SPELL = 6;                // game hours at each spot before he moves to the other
const VOICE = { voice: 0, pitch: 0.9, rate: 1.05 };
const BUBBLE = 4;

// where he goes, in data metres (east, north): the top of the lane, then the bushes by the chapel,
// each with a road the place should have nearby, so another map without them has no Jamie
const SPOTS = [
  { x: -1671.6, y: 4110.0, road: "Van Diemen's Lane", bushes: false },
  { x: -1631.0, y: 3986.0, road: "Lansdown Road", bushes: true },
];

const HELLO = ["Alright? You look like you could do with one of these.", "Ey up. Want a ciggie?", "Shh. I'm not here. Want one?", "Oh, it's you. Come here, I've got something for you."];
const GIVEN = ["Here. Get that down you.", "Go on, have one. On me.", "Light that and you won't fear nothing. Not even Bendy.", "There you go. Make it count.", "Don't tell your mum where you got it."];
const WAIT = ["Steady on, I've only got ten left.", "Give us a minute, I'm rolling another.", "You've only just had one!", "I'm not made of ciggies, mate."];
const IDLE = [
  "Seen that thing up Fonthill Road? Long arms. Lamp on its head. Not right.",
  "Bendy don't scare me. Not after one of these.",
  "Lovely night for it.", "Don't tell my mum.", "Lansdown's dead tonight.",
  "If you're going up Fonthill Road, you'll want one of these first.",
  "Twenty years I've been smoking up here. Never seen the like of that Bendy.",
  "Nothing can touch you with one of these on the go. Honest.",
];
const HIDING = ["They'll never find me in here.", "Best bush in Bath, this.", "The chaplain nearly caught me last week."];
const OUCH = ["Oi! I'm having a smoke here.", "That's not very friendly, is it?", "Watch it, or no more ciggies for you.", "Ow! You've made me drop me lighter."];

/** The next line from a pool, dealt like a shuffled deck so none comes round again too soon. */
function deal(hand: string[], pool: string[]): string {
  if (!hand.length) hand.push(...[...pool].sort(() => Math.random() - 0.5));
  return hand.pop()!;
}

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
/** A joint: a group at (x, y, z) holding parts hung from it. */
function joint(mat: THREE.Material, x: number, y: number, parts: Part[]): THREE.Group {
  const j = new THREE.Group();
  j.position.set(x, y, 0);
  if (parts.length) j.add(new THREE.Mesh(model(parts), mat));
  return j;
}

let puffTex: THREE.CanvasTexture | null = null;
function puff(): THREE.Sprite {
  if (!puffTex) {
    const cv = document.createElement("canvas"), c = cv.getContext("2d")!;
    cv.width = cv.height = 64;
    const r = c.createRadialGradient(32, 32, 2, 32, 32, 30);
    r.addColorStop(0, "rgba(225,228,232,0.85)"); r.addColorStop(1, "rgba(225,228,232,0)");
    c.fillStyle = r; c.fillRect(0, 0, 64, 64);
    puffTex = new THREE.CanvasTexture(cv);
  }
  return new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false, opacity: 0 }));
}

/** Jamie himself: a parka, jeans, white trainers and a beanie, a cigarette in his right hand. He faces -z. */
export class Figure {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private arm: THREE.Group;      // his right upper arm, and its forearm
  private fore: THREE.Group;
  private tip = new THREE.MeshBasicMaterial({ color: "#ff6a1a" });
  private puffs: THREE.Sprite[] = [];
  private drag = 0;              // where he is in a drag: 0 at rest, up to 1 with it at his lips
  private dragT = 2;
  private bubble: THREE.Sprite | null = null;
  private bubbleT = 0;

  constructor() {
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const SKIN = "#dcae8c", PARKA = "#45502f", JEANS = "#2e3b57", SHOES = "#ecebe4", BEANIE = "#1e1f22", HAIR = "#5a4632";
    this.body.add(new THREE.Mesh(model([
      [box(0.38, 0.17, 0.21), JEANS, 0, 0.94, 0],                                                      // hips
      [box(0.46, 0.56, 0.28), PARKA, 0, 1.26, 0], [box(0.5, 0.1, 0.3), PARKA, 0, 1.0, 0],              // a parka, down past his waist
      [box(0.02, 0.5, 0.02), "#2a2f1e", 0, 1.24, -0.145],                                              // its zip
      [box(0.36, 0.14, 0.12), "#3a4428", 0, 1.48, 0.12],                                               // the hood, down
      [box(0.1, 0.08, 0.1), SKIN, 0, 1.58, 0], [box(0.24, 0.27, 0.25), SKIN, 0, 1.75, 0],              // neck and head
      [box(0.26, 0.13, 0.27), BEANIE, 0, 1.88, 0.005], [box(0.27, 0.04, 0.28), "#2c2d31", 0, 1.83, 0], // beanie
      [box(0.25, 0.08, 0.05), HAIR, 0, 1.79, 0.115],
      [box(0.04, 0.03, 0.02), "#2a2020", 0.055, 1.77, -0.126], [box(0.04, 0.03, 0.02), "#2a2020", -0.055, 1.77, -0.126],
      [box(0.2, 0.07, 0.02), "#b88f72", 0, 1.67, -0.124],                                              // stubble
      [box(0.06, 0.015, 0.02), "#7a4a3a", 0.02, 1.665, -0.127],                                        // a lopsided grin
    ]), mat));
    for (const side of [-1, 1]) {
      const leg = joint(mat, side * 0.1, 0.9, [[box(0.15, 0.82, 0.17), JEANS, 0, -0.43, 0], [box(0.15, 0.09, 0.28), SHOES, 0, -0.86, -0.04]]);
      leg.rotation.z = side * 0.05;   // stood with his feet apart
      this.body.add(leg);
    }
    // his left hand in his pocket
    const left = joint(mat, -0.29, 1.47, [[box(0.13, 0.32, 0.14), PARKA, 0, -0.15, 0]]);
    left.rotation.set(-0.1, 0, -0.12);
    const leftFore = joint(mat, 0, -0.3, [[box(0.12, 0.26, 0.13), PARKA, 0, -0.12, 0]]);
    leftFore.rotation.x = 0.5;
    left.add(leftFore);
    // and the cigarette in his right
    this.arm = joint(mat, 0.29, 1.47, [[box(0.13, 0.32, 0.14), PARKA, 0, -0.15, 0]]);
    this.fore = joint(mat, 0, -0.3, [[box(0.12, 0.26, 0.13), PARKA, 0, -0.12, 0], [box(0.09, 0.1, 0.09), SKIN, 0, -0.3, 0],
      [box(0.016, 0.016, 0.09), "#f2f0e8", 0, -0.33, -0.08], [box(0.017, 0.017, 0.025), "#c8935a", 0, -0.33, -0.04]]);
    const tip = new THREE.Mesh(box(0.018, 0.018, 0.012), this.tip);
    tip.position.set(0, -0.33, -0.13);
    this.fore.add(tip);
    this.arm.add(this.fore);
    this.body.add(left, this.arm);
    this.body.traverse((o) => { o.castShadow = true; });
    for (let k = 0; k < 7; k++) { const s = puff(); this.puffs.push(s); this.body.add(s); }
    this.root.add(this.body);
  }

  say(text: string) {
    this.unsay();
    this.bubble = speechBubble(text);
    this.bubble.position.y = 2.2;
    this.root.add(this.bubble);
    this.bubbleT = BUBBLE;
  }

  private unsay() {
    if (!this.bubble) return;
    this.root.remove(this.bubble);
    this.bubble.material.map?.dispose();
    this.bubble.material.dispose();
    this.bubble = null;
  }

  /** Stand him at (x, y, z) facing yaw, and keep him smoking. */
  pose(x: number, y: number, z: number, yaw: number, t: number, dt: number) {
    this.root.position.set(x, y, z);
    this.body.rotation.y = yaw;
    if (this.bubble) {
      this.bubbleT -= dt;
      if (this.bubbleT <= 0) this.unsay();
      else this.bubble.material.opacity = Math.min(1, this.bubbleT / 0.4);
    }
    // a drag every few seconds: hand up to his lips, the tip glowing bright, then down again and out comes the smoke
    this.dragT -= dt;
    if (this.dragT <= 0) this.dragT = 5 + Math.random() * 4;
    const want = this.dragT > 3.6 && this.dragT < 5 ? 1 : 0;
    this.drag += (want - this.drag) * Math.min(1, dt * 4);
    const d = this.drag;
    this.arm.rotation.set(0.2 + 0.6 * d, 0, 0.08 - 0.3 * d);
    this.fore.rotation.set(1.1 + 1.45 * d, 0, 0);
    this.tip.color.setRGB(1, 0.32 + 0.4 * d + 0.06 * Math.sin(t * 7), 0.08);
    // the smoke: a thin curl off the tip at rest, a big cloud breathed out after each drag
    const out = this.dragT > 2.4 && this.dragT < 3.6 ? 1 : 0;
    this.puffs.forEach((s, k) => {
      const f = (t * 0.3 + k / this.puffs.length) % 1;
      s.position.set(0.1 + Math.sin(t * 0.8 + k) * 0.08 * f, 1.62 + f * 1.1, -0.25 - f * 0.25);
      s.scale.setScalar((0.15 + f * 0.7) * (1 + out * 0.8));
      s.material.opacity = (0.18 + 0.4 * out) * Math.sin(f * Math.PI);
    });
    this.body.position.y = Math.sin(t * 1.3) * 0.008;   // shifting from foot to foot
  }
}

/** Jamie on Lansdown: where he is, what he's saying, and his cigarettes. */
export class Jamie {
  private fig: Figure | null = null;
  private spots: ({ x: number; z: number } | null | undefined)[] = SPOTS.map(() => undefined);   // undefined: not looked for yet; null: not on this map
  private at = -1;               // which spot he's at
  private y = 0; private yaw = 0;
  private talkT = 1; private met = false;
  private hands: Record<string, string[]> = {};

  constructor(private map: GameMap, private scene: THREE.Scene) {}

  /** Keep him going, with you at (px, py, pz). Gives back true when he hands you a cigarette
   *  (ready: whether he would; you're not smoking one, and he's rested since the last). */
  update(dt: number, t: number, px: number, py: number, pz: number, alive: boolean, ready: boolean): boolean {
    // which spot the clock says, though he only moves when you're not about to see him go
    const want = Math.floor(timeOfDay() * 24 / SPELL) % SPOTS.length;
    const cur = this.at >= 0 ? this.spots[this.at] : null;
    if (want !== this.at && (!cur || Math.hypot(px - cur.x, pz - cur.z) > 80)) {
      const s = this.find(want, px, pz);
      if (s === undefined) { if (this.fig) this.fig.root.visible = false; return false; }   // not loaded yet
      this.at = want;
      this.met = false;
    }
    const spot = this.at >= 0 ? this.spots[this.at] : null;
    if (!spot) { if (this.fig) this.fig.root.visible = false; return false; }
    const far = Math.hypot(px - spot.x, pz - spot.z);
    if (!this.fig) { this.fig = new Figure(); this.scene.add(this.fig.root); }
    const f = this.fig;
    f.root.visible = far < 300;
    if (!f.root.visible) return false;
    this.y = this.map.ground(spot.x, spot.z);
    // he keeps an eye on you once you're close, and otherwise looks out over the road
    const near = far < 12 && Math.abs(py - this.y) < 4;
    const look = near ? Math.atan2(-(px - spot.x), -(pz - spot.z)) : this.at === 0 ? -1.9 : 0.6;
    let turn = look - this.yaw;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    this.yaw += turn * Math.min(1, dt * 3);
    f.pose(spot.x, this.y, spot.z, this.yaw, t, dt);
    // a cigarette for you, if you've come right up to him
    if (alive && far < GIVE && Math.abs(py - this.y) < 2) {
      if (ready) { this.speak(this.line("given", GIVEN), far); this.talkT = BUBBLE + 2; this.met = true; return true; }
      if (this.talkT <= 0) { this.speak(this.line("wait", WAIT), far); this.talkT = BUBBLE + 3; }
    }
    // and a word for anyone who comes near
    this.talkT -= dt;
    if (far < HEAR && this.talkT <= 0) {
      const first = near && !this.met;
      if (near) this.met = true;
      const pool = first ? HELLO : SPOTS[this.at].bushes && Math.random() < 0.35 ? HIDING : IDLE;
      this.speak(this.line(first ? "hello" : pool === HIDING ? "hiding" : "idle", pool), far);
      this.talkT = BUBBLE + 3 + Math.random() * 6;
    }
    if (far > HEAR * 2) this.met = false;
    return false;
  }

  private line(kind: string, pool: string[]) { return deal(this.hands[kind] ??= [], pool); }

  private speak(line: string, far: number) {
    this.fig?.say(line);
    Posh.speak(line, 77, far, VOICE);
  }

  /** Spot k in scene coordinates, clear of walls and fences: undefined while its square of Bath hasn't loaded, null if it's not on this map. */
  private find(k: number, px: number, pz: number): { x: number; z: number } | null | undefined {
    if (this.spots[k] !== undefined) return this.spots[k];
    const S = SPOTS[k], x = S.x, z = -S.y;
    if (Math.hypot(px - x, pz - z) > 600) return undefined;   // look once you're near enough for its square to be in
    const tiles = this.map.tilesNear(x, z, 40);
    if (!tiles.length) return undefined;
    const named = [this.map, ...tiles].some((m) => m.d.rd.some((r) => r.n === S.road && r.p.some((q) => Math.hypot(q[0] - S.x, q[1] - S.y) < 60)));
    if (!named) return (this.spots[k] = null);
    // the spot itself if he fits there, else the nearest place round it that he does
    for (let r = 0; r <= 4; r += 0.5) for (let a = 0; a < 8; a++) {
      const cx = x + r * Math.cos(a * Math.PI / 4), cz = z + r * Math.sin(a * Math.PI / 4);
      if (!this.map.blocked(cx, cz, 0.35)) return (this.spots[k] = { x: cx, z: cz });
      if (r === 0) break;
    }
    return (this.spots[k] = { x, z });
  }

  /** Where a round along the ray from o (unit d) hits him, if it does before maxD. */
  hit(o: THREE.Vector3, d: THREE.Vector3, maxD: number): number | null {
    const spot = this.at >= 0 ? this.spots[this.at] : null;
    if (!spot || !this.fig?.root.visible) return null;
    const ox = o.x - spot.x, oz = o.z - spot.z, a = d.x * d.x + d.z * d.z;
    if (a < 1e-9) return null;
    const b = ox * d.x + oz * d.z, c = ox * ox + oz * oz - 0.3 * 0.3, disc = b * b - a * c;
    if (disc < 0) return null;
    const t = (-b - Math.sqrt(disc)) / a;
    if (t < 0 || t > maxD) return null;
    const y = o.y + d.y * t - this.y;
    return y >= 0 && y <= 1.95 ? t : null;
  }

  /** Someone's shot him, or thumped him. He's fine, but he isn't happy about it. */
  ouch(far: number) {
    this.speak(this.line("ouch", OUCH), far);
    this.talkT = BUBBLE + 2;
  }
}
