// Day Bendy: Bendy's other life. By night he's the four-metre horror of Fonthill Road (bendy.ts); by
// day he's an ordinary-sized history teacher up on Lansdown, at Sir Bevil Grenville's monument, on a
// school trip (the Kingswood School minibus is parked on the lane: vehicles.ts). The force field
// reaches out up Bath Road to take him in (map.ts), so you'll find him if you try to get out of Bath
// to the north that way. Come near and he tells you about the battle of Lansdown, 5 July 1643, a
// fact at a time and in order, from the top again once he's done. At dusk he sinks into the ground,
// lesson over, and at first light he's back.
//
// You can't hurt him: rounds stop at him, and he tells you off for it.
//
// Who decides what: nothing about him goes over the network. Where he stands is fixed, and whether
// he's out comes from the shared clock (daylight.ts), so everyone finds him in the same place at the
// same times. What he says is each player's own, only ever for show.
import * as THREE from "three";
import { Figure } from "./bendy";
import { nightNow } from "./daylight";
import { GRENVILLE, type GameMap } from "./map";
import { speechBubble } from "./naughtyboys";
import * as Posh from "./posh";

const SIZE = 0.45;              // of his night-time self: four metres down to a man's height
const DARK = 0.5;               // how dark it has to be (daylight.ts) for him to go: as night Bendy comes out
const HEAR = 25;                // he talks while you're this close
const BUBBLE = 7;               // seconds a line stays up: they're long ones
const VOICE = { voice: 3, pitch: 0.75, rate: 0.95 };
const TALL = 1.95;

// where he stands, beside the monument (data metres, east and north of it), and which road the place
// should have nearby, so another map without it has no Day Bendy
const STAND = { dx: -3.5, dy: -1, road: "Bath Road" };

const HELLO = [
  "Ah, there you are. Gather round, everyone. Gather round the monument.",
  "Late again. Never mind. Gather round, and no pushing at the back.",
  "Welcome to Lansdown. Phones away, please. This is a history trip.",
];
/** The lesson, told in order. */
const LESSON = [
  "This is Sir Bevil Grenville's monument. It marks where he fell at the Battle of Lansdown, on 5 July 1643.",
  "The Civil War: King Charles's Royalists against Parliament. Bath was held for Parliament.",
  "Sir William Waller held this ridge for Parliament, his guns and breastworks dug in along the top.",
  "Sir Ralph Hopton brought the King's army up from Marshfield way, to take Bath.",
  "Waller and Hopton were old friends. Before the fighting, Waller wrote to him.",
  "'My affections to you are so unchangeable, that hostility itself cannot violate my friendship to your person.'",
  "Then the Cornish foot came straight up this slope into the guns, Grenville leading his pikemen from the front.",
  "They held the top against Waller's horse, charge after charge. Then Grenville was struck on the head with a poleaxe.",
  "His giant of a servant, Anthony Payne, put Grenville's son John, fifteen, up on his father's horse to lead them on.",
  "Grenville was carried off the field. He died the next day, at the rectory in Cold Ashton.",
  "By dark Waller had fallen back behind a stone wall across the hill. Both sides lay there, firing into the night.",
  "In the night Waller slipped away to Bath, leaving lit matches along the wall so they'd think he was still there.",
  "So the Royalists had the hill. But it cost them so many men that they couldn't go on and take Bath.",
  "The next morning an ammunition cart blew up right by Hopton. He was badly burnt and blinded for a time.",
  "Eight days later, though, the Royalists smashed Waller's army at Roundway Down, near Devizes.",
  "This monument went up in 1720. Grenville's grandson put it here: George Granville, Lord Lansdown.",
  "And that's a griffin on top: the Grenvilles' crest.",
  "Right. Any questions? No? Good. Don't touch the monument. We'll go through it again for the ones at the back.",
];
const ASIDE = [
  "I don't come out after dark. I'm a different man after dark.",
  "Whatever you do, don't go up Fonthill Road tonight.",
  "Lovely day for it. Shame about the minibus's clutch.",
  "There'll be a test on this. There's always a test.",
];
const OUCH = [
  "Put that away! This is a school trip.",
  "Detention. All of you.",
  "Grenville took a poleaxe to the head up here. I can take a rifle round.",
  "I'll be writing to your parents about that.",
  "Do that again and you're walking back to Bath.",
];

/** The next line from a pool, dealt like a shuffled deck so none comes round again too soon. */
function deal(hand: string[], pool: string[]): string {
  if (!hand.length) hand.push(...[...pool].sort(() => Math.random() - 0.5));
  return hand.pop()!;
}

/** Day Bendy at the monument: whether he's out, where he's looking and what he's saying. */
export class DayBendy {
  private fig: Figure | null = null;
  private spot: { x: number; z: number } | null | undefined;   // undefined: not looked for yet; null: not on this map
  private y = 0; private yaw = 0;
  private pop = 0;               // how far up out of the ground he is, 0 to 1
  private talkT = 1; private met = false; private next = 0;
  private bubble: THREE.Sprite | null = null;
  private bubbleT = 0;
  private hands: Record<string, string[]> = {};

  constructor(private map: GameMap, private scene: THREE.Scene) {}

  /** Keep him going, with you at (px, py, pz). */
  update(dt: number, px: number, py: number, pz: number) {
    const spot = this.find(px, pz);
    if (!spot) { if (this.fig) this.fig.hide(); return; }
    const far = Math.hypot(px - spot.x, pz - spot.z);
    if (far > 300) { this.fig?.hide(); return; }
    if (!this.fig) this.fig = new Figure(this.scene);
    // by day he's up; as it gets dark he sinks into the ground, and at first light he springs back up
    const day = nightNow() <= DARK;
    this.pop = Math.max(0, Math.min(1, this.pop + (day ? dt : -dt) / 0.6));
    const f = this.fig;
    if (this.pop <= 0) { f.hide(); this.unsay(); this.met = false; return; }
    f.root.visible = true;
    f.aim(0, 0, 0, false, false);   // no lamp beam by day
    this.y = this.map.ground(spot.x, spot.z);
    // he keeps an eye on you once you're close, and otherwise looks out over the battlefield
    const near = far < 14 && Math.abs(py - this.y) < 4;
    const look = near ? Math.atan2(-(px - spot.x), -(pz - spot.z)) : 0.5;
    let turn = look - this.yaw;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    this.yaw += turn * Math.min(1, dt * 3);
    f.pose(spot.x, this.y, spot.z, this.yaw, this.yaw, 0, 0, this.pop, 0, false, dt);
    f.root.scale.multiplyScalar(SIZE);
    if (this.bubble) {
      this.bubbleT -= dt;
      if (this.bubbleT <= 0) this.unsay();
      else this.bubble.material.opacity = Math.min(1, this.bubbleT / 0.4);
    }
    // and the lesson, for anyone who comes near
    this.talkT -= dt;
    if (far < HEAR && this.talkT <= 0 && this.pop >= 1) {
      if (near && !this.met) { this.met = true; this.speak(this.line("hello", HELLO), far); }
      else if (this.next > 0 && Math.random() < 0.1) this.speak(this.line("aside", ASIDE), far);
      else { this.speak(LESSON[this.next], far); this.next = (this.next + 1) % LESSON.length; }
      this.talkT = BUBBLE + 1.5;
    }
    if (far > HEAR * 2) this.met = false;
  }

  private line(kind: string, pool: string[]) { return deal(this.hands[kind] ??= [], pool); }

  private speak(line: string, far: number) {
    this.unsay();
    if (!this.spot) return;
    // (in the scene, not on him: he's drawn at his night-time size and shrunk)
    this.bubble = speechBubble(line);
    this.bubble.position.set(this.spot.x, this.y + TALL + 0.35, this.spot.z);
    this.scene.add(this.bubble);
    this.bubbleT = BUBBLE;
    Posh.speak(line, 91, far, VOICE);
  }

  private unsay() {
    if (!this.bubble) return;
    this.bubble.removeFromParent();
    this.bubble.material.map?.dispose();
    this.bubble.material.dispose();
    this.bubble = null;
  }

  /** His spot in scene coordinates, clear of walls, fences and the monument: undefined while its
   *  square of Bath hasn't loaded, null if it's not on this map. */
  private find(px: number, pz: number): { x: number; z: number } | null | undefined {
    if (this.spot !== undefined) return this.spot;
    const x = GRENVILLE.x + STAND.dx, z = -(GRENVILLE.y + STAND.dy);
    if (Math.hypot(px - x, pz - z) > 600) return undefined;   // look once you're near enough for its square to be in
    const tiles = this.map.tilesNear(x, z, 40);
    if (!tiles.length) return undefined;
    const named = [this.map, ...tiles].some((m) => m.d.rd.some((r) => r.n === STAND.road && r.p.some((q) => Math.hypot(q[0] - GRENVILLE.x, q[1] - GRENVILLE.y) < 200)));
    if (!named || this.map.fieldEdge(x, z) < 5) return (this.spot = null);
    // the spot itself if he fits there, else the nearest place round it that he does
    for (let r = 0; r <= 5; r += 0.5) for (let a = 0; a < 8; a++) {
      const cx = x + r * Math.cos(a * Math.PI / 4), cz = z + r * Math.sin(a * Math.PI / 4);
      if (!this.map.blocked(cx, cz, 0.35)) return (this.spot = { x: cx, z: cz });
      if (r === 0) break;
    }
    return (this.spot = { x, z });
  }

  /** Where a round along the ray from o (unit d) hits him, if it does before maxD. */
  hit(o: THREE.Vector3, d: THREE.Vector3, maxD: number): number | null {
    const spot = this.spot;
    if (!spot || !this.fig?.root.visible || this.pop < 1) return null;
    const ox = o.x - spot.x, oz = o.z - spot.z, a = d.x * d.x + d.z * d.z;
    if (a < 1e-9) return null;
    const b = ox * d.x + oz * d.z, c = ox * ox + oz * oz - 0.3 * 0.3, disc = b * b - a * c;
    if (disc < 0) return null;
    const t = (-b - Math.sqrt(disc)) / a;
    if (t < 0 || t > maxD) return null;
    const y = o.y + d.y * t - this.y;
    return y >= 0 && y <= TALL ? t : null;
  }

  /** Someone's shot him, or thumped him. He's fine, but he isn't having it. */
  ouch(far: number) {
    this.speak(this.line("ouch", OUCH), far);
    this.talkT = BUBBLE + 1;
  }
}
