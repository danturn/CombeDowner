// The pensioners of Push the Bus (pushbus.ts): bus stops up the hill, each with a queue waiting for
// this very bus, and everyone who gets on. As the bus comes up to a stop the queue shuffles to the
// front door; someone lets go of the bus, goes to the door and takes the fares (Use), each pensioner
// counting out their money a coin at a time, and Use again when it's exactly right (too soon and
// they start counting again; too late and they want change). Each one aboard adds a little weight.
// Go past a stop without selling a ticket and the queue shakes its sticks at you, and a letter about
// it turns up in the Chronicle.
// While they're getting on the bus is easier to hold (a wheel against the kerb, the handbrake
// lasting longer), and on your own it's chocked, as there's nobody else to hold it.
//
// Everyone aboard has a temper that rises while the bus is slow or rolling back and settles while
// it's going well. Cross ones lean out of the windows and shout (speech bubbles over the bus);
// furious ones ring the bell (the cab is told they want the next stop, and not stopping there makes
// the queues after it crosser), throw a handbag, a walking stick, sherbet lemons or a thermos at a
// pusher (it splats your screen and puts your next heave off), get off in a huff and walk up the
// hill faster than the bus, or start a row about the front seat that rocks the bus and takes the
// edge off the heaves. Happy ones (the bus going well) cheer, which widens the perfect window for
// the next heave, and now and then a feisty one gets off and pushes, slowly. How happy they are at
// the top goes on the result.
//
// Who decides what: the stops and who's queueing at them (how many, what they look like, their
// fares) come from the hill and the day's seed, the same on every screen. The host runs everything
// else (who's where, tempers, who sells, what they do) and sends it with the bus ("qe" k "b": pn,
// tk, ps), with a "qe" event for each thing they do (ps shout, pb bell, px throw, ph huff, pr row,
// pc cheer, pf helping, pk ticket, pq a queue passed). Each player asks to take the door ("tk" on)
// and says when they've sold a ticket ("tk" i), counted on their own screen. An older page ignores
// all of it.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import * as SFX from "./audio";
import { ball, box, part, type Piece } from "./avatar";
import { ctl } from "./controls";
import { esc } from "./hudkit";
import { missionAux, missionAuxRow, missionCall } from "./missionscreens";
import { speechBubble } from "./naughtyboys";
import * as Paper from "./paper";
import { rng, type QuestWorld } from "./quests";
import { splatScreen } from "./gulls";
import { count as wardCount, earn } from "./wardrobe";
import type { Vehicle } from "./vehicles";
import { guide } from "./notice";

/** Where the bus would be with its middle s metres up and lat across (pushbus.ts poseOn). */
type PoseAt = (s: number, lat: number) => { x: number; z: number; fx: number; fz: number; rx: number; rz: number };

export interface BusNow { s: number; v: number; lat: number; mode: number; slots: string[]; driver: string; hb: boolean; n: number }

// what each one is doing
const QUEUED = 0, SHUFFLING = 1, PAYING = 2, ABOARD = 3, HUFF = 4, PUSHING = 5, LEFT = 6, STOMPED = 7;

const DOOR_IN = 0.9;           // the front door's middle, this far back from the front of the bus
const SERVE = 5;               // the door within this many metres of the stop, slow enough, and the queue comes over
const SHUFFLE_T = 2.6;         // seconds to shuffle from the queue to the door
const WEIGHT = 0.025;          // each one aboard adds this share to the bus's weight
const HELP = 0.35;             // a pensioner pushing, in pushers
const HUFF_V = 1.3;            // m/s a pensioner in a huff walks up the hill, at least
const LEAN_AT = 0.6;           // cross enough to lean out of the window
const FURIOUS = 0.75;
const HAPPY = 0.25;

const NAMES = ["Doris", "Edna", "Mavis", "Reg", "Stan", "Arthur", "Joan", "Hilda", "Bert", "Phyllis", "Norman", "Irene", "Dennis",
  "Gladys", "Ron", "Sheila", "Cyril", "Brenda", "Vera", "Les", "Marjorie", "Wilf", "Ethel", "Clive", "Pam", "Derek", "Peggy", "Alf"];
// which looks are men (their names are picked from the men's half above)
const MEN = new Set([3, 4, 5]);
const MENS = ["Reg", "Stan", "Arthur", "Bert", "Norman", "Dennis", "Ron", "Cyril", "Les", "Wilf", "Clive", "Derek", "Alf"];

export const CROSS = [
  "I fought in the war for this!", "My bus pass is valid from half nine, young man!", "I'll be writing to the Chronicle!",
  "In my day we pushed it uphill both ways!", "I can see your bottom!", "Is this the 264? It said 264 on the front!",
  "I've a hair appointment at eleven!", "My Ron could push this on his own, and he's been dead six years!",
  "We're going backwards! I can feel it in my hip!", "Put your backs into it! Whatever happened to national service?",
  "I've had faster tortoises!", "Is there a toilet on this bus?", "My knees can't take this, and I'm sitting down!",
  "I didn't queue forty minutes to go backwards!", "The Co-op shuts at five, you know!", "Has anyone got a Werther's? I'm coming over faint.",
  "Mind my shopping! There's eggs in there!", "Young people today. No stamina.", "I'm going to miss Countdown!",
  "I was promised a seat by the window!", "Go on, faster! I'm not getting any younger!", "I remember when this was all fields. Flatter fields.",
  "I'll have you know I'm a councillor's mother!", "My grandson does this on his computer, and he's quicker!",
  "I want my seventy pence back!", "Mind the kerb! Mind the KERB!", "Shove, don't dawdle!", "We'll be here till Michaelmas!",
  "I've seen glaciers go faster!", "This is worse than the winter of '63!", "Excuse me! Is this going to the big Sainsbury's?",
  "And they put the fares up for this!", "I knew your grandmother, and she'd be ashamed!", "My tea's going cold in this flask!",
  "Heave, you great lummoxes!", "Are you even trying? I am!", "When I was a clippie we'd have been there by now!",
  "My budgie could push harder than that!", "Is it a replacement bus? It feels like a replacement bus.", "Ooh, my sciatica!",
  "I've got a chiropodist at half past!", "Have you lot had your breakfast?", "My pension's gone up quicker than this bus!",
  "Don't let it roll back! I've only just sat down!", "I've written to the council before, and I'll do it again!",
  "Lean into it! Like you're pushing a pram!", "I'll tell your mother!", "Back in my day buses had conductors, AND engines!",
];
const WAITING = ["Is anyone selling tickets or not?", "I've got the right money here somewhere...", "Come ON, I've been here since Tuesday!",
  "Are you open, driver?", "Ooh, here it is at last!", "Who's on the door? Anybody?", "It's very irregular, this."];
const PASSED = ["Oi! That was our stop!", "You've gone straight past us!", "I'm reporting you to the council!",
  "I'll be writing to the Chronicle about this!", "Forty minutes I've stood here!", "Disgraceful! Absolutely disgraceful!",
  "Come back here, you hooligans!", "I've got my pass out and everything!", "I'll remember your faces!"];
const THANKS = ["Ta, driver.", "Morning! Lovely day for it.", "Return to town, please, dear.", "I've had this pass since 1987, you know.",
  "Ooh, nice warm seat.", "Bless you, love.", "Is it far? I'm doing the big shop."];
const EXACT = ["Exact money, dear. I counted it at home.", "There you are, not a penny over!", "Exact! I've been saving the coppers."];
const CHANGE = ["Have you got change of a twenty?", "Oh, I've only got a fifty, dear.", "Do you take cheques?"];
const EARLY = ["Hang on, I haven't finished counting!", "Don't rush me, young man!", "Now I've lost count. Ten, twenty...", "Patience!"];
const BELL = ["DING! This is my stop!", "Ding ding! Let me off here!", "Next stop, please! NEXT STOP!", "I want the next one, driver!"];
const THROW: Record<number, string[]> = {
  0: ["Have my handbag, then!", "Take THAT, you layabouts!"], 1: ["Here, have my stick!", "Take THAT!"],
  2: ["Have a sherbet lemon, you rotters!", "Sweets for the slow!"], 3: ["Catch! It's still got tea in it!", "Here, have my flask!"],
};
const ITEMS = ["handbag", "walking stick", "sherbet lemons", "thermos"];
const HUFFED = ["That's it! I'll walk!", "I'll be quicker on foot, and I've had both hips done!", "Let me off! I'll walk it!", "Good DAY to you!"];
const ROW = [["It was MY turn for the front seat!", "You had it Tuesday, Doris!"], ["I've sat there since 1974!", "Shove up, Reg!"],
  ["Don't you 'dear' me!", "I was here first!"], ["That's my seat and you know it!", "Well I've got a bad leg!"]];
const CHEER = ["Come on, lads!", "Ooh, here we go!", "That's the spirit!", "Lovely, boys, lovely!", "Go on, my sons!", "We'll be home for Countdown!", "Heave, my darlings!"];
const FEISTY = ["Shift over, I'll show you how it's done!", "Out the way, I used to push trams!", "Budge up, I'll give you a hand!"];

interface Stop { s: number; st: number; sold: number; halted: boolean; cross: boolean }   // st 0 to come, 1 serving, 2 served, 3 passed with none sold
interface Pen {
  k: number; j: number; look: number; name: string; fare: number;
  st: number; ang: number; w: number; p: number; cool: number; spot: number;
  // drawn
  lean: number; shoutT: number; bob: number;
}
interface Flier { m: THREE.Mesh; t: number; from: THREE.Vector3; to: string; it: number }
interface Bubble { s: THREE.Sprite; i: number; t: number }

// ---- what they look like: six of them, each one welded mesh drawn as instances -------------------

const SKIN = "#e8bfa2", SHOE = "#2d241e";
function body(coat: string, legs: string, men: boolean, top: Piece[]): THREE.BufferGeometry {
  const p: Piece[] = [
    [box(0.1, 0.07, 0.22, -0.08, 0.035, 0.03), SHOE], [box(0.1, 0.07, 0.22, 0.08, 0.035, 0.03), SHOE],
    [ball(0.11, 0, 1.46, 0.02, 1, 1.1, 1), SKIN], [new THREE.CylinderGeometry(0.05, 0.05, 0.1, 8).translate(0, 1.33, 0), SKIN],
    [box(0.03, 0.04, 0.04, 0, 1.45, 0.13), "#d9a88a"],
    [ball(0.05, -0.24, 0.74, 0.03), SKIN], [ball(0.05, 0.24, 0.74, 0.03), SKIN],
    [box(0.09, 0.5, 0.11, -0.24, 1.02, 0.02), coat], [box(0.09, 0.5, 0.11, 0.24, 1.02, 0.02), coat],
    [ball(0.2, 0, 1.25, 0, 1.15, 0.45, 0.75), coat],
  ];
  if (men) p.push([box(0.12, 0.66, 0.13, -0.08, 0.4, 0), legs], [box(0.12, 0.66, 0.13, 0.08, 0.4, 0), legs], [box(0.42, 0.6, 0.27, 0, 1.0, 0), coat]);
  else p.push([box(0.09, 0.44, 0.1, -0.08, 0.28, 0), legs], [box(0.09, 0.44, 0.1, 0.08, 0.28, 0), legs],
    [new THREE.CylinderGeometry(0.17, 0.25, 0.82, 10).translate(0, 0.88, 0), coat]);
  return part([...p, ...top]);
}
const glasses = (): Piece => [box(0.2, 0.035, 0.02, 0, 1.48, 0.125), "#2a2a2a"];
const cane = (x: number): Piece[] => [[new THREE.CylinderGeometry(0.014, 0.014, 0.86, 6).translate(x, 0.43, 0.14), "#5a3a1e"], [box(0.12, 0.03, 0.03, x - 0.04, 0.87, 0.14), "#5a3a1e"]];
const LOOKS = [
  // a headscarf and a handbag
  () => body("#b88a55", "#d9b8a0", false, [[new THREE.SphereGeometry(0.128, 12, 8, 0, Math.PI * 2, 0, 1.95).translate(0, 1.47, 0.0), "#c84a5a"],
    [box(0.06, 0.05, 0.04, 0, 1.33, 0.1), "#c84a5a"], [box(0.17, 0.13, 0.07, -0.31, 0.86, 0.05), "#3a2418"], [box(0.02, 0.2, 0.02, -0.29, 1.0, 0.05), "#3a2418"]]),
  // a lilac perm
  () => body("#2f3f6e", "#d4b39c", false, [[ball(0.135, 0, 1.53, -0.01, 1.08, 0.85, 1.08), "#c8bfd6"], [ball(0.05, -0.1, 1.48, 0.05), "#c8bfd6"],
    [ball(0.05, 0.1, 1.48, 0.05), "#c8bfd6"], [box(0.16, 0.12, 0.07, 0.31, 0.86, 0.05), "#e8dcc0"], glasses()]),
  // a felt hat
  () => body("#7b3b5e", "#cfae98", false, [[new THREE.SphereGeometry(0.118, 12, 8, 0, Math.PI * 2, 0, 1.7).translate(0, 1.47, -0.01), "#d8d4cc"],
    [new THREE.CylinderGeometry(0.1, 0.12, 0.11, 12).translate(0, 1.62, 0), "#4a2a44"], [new THREE.CylinderGeometry(0.18, 0.18, 0.02, 14).translate(0, 1.565, 0), "#4a2a44"], glasses()]),
  // a flat cap and a walking stick
  () => body("#6d5a3e", "#4a4a48", true, [[new THREE.SphereGeometry(0.122, 12, 6, 0, Math.PI * 2, 0, 1.2).translate(0, 1.5, 0), "#5a5040"],
    [box(0.17, 0.02, 0.1, 0, 1.53, 0.12), "#5a5040"], ...cane(0.3)]),
  // a trilby and a mac
  () => body("#c9b88a", "#3a3a40", true, [[new THREE.CylinderGeometry(0.11, 0.12, 0.12, 12).translate(0, 1.63, 0), "#3b3a36"],
    [new THREE.CylinderGeometry(0.19, 0.19, 0.02, 14).translate(0, 1.57, 0), "#3b3a36"], [box(0.44, 0.3, 0.29, 0, 0.62, 0), "#c9b88a"]]),
  // bald, with glasses and a cardigan
  () => body("#4f6b3a", "#5b5045", true, [[new THREE.CylinderGeometry(0.118, 0.118, 0.07, 12, 1, true, Math.PI / 2, Math.PI).translate(0, 1.47, -0.01), "#d0ccc4"], glasses(), ...cane(-0.3)]),
];
const PER_LOOK = 24;

/** The things they throw, each welded into one piece. */
const ITEM_GEO = [
  () => part([[box(0.26, 0.19, 0.09), "#3a2418"], [box(0.03, 0.14, 0.03, -0.08, 0.15, 0), "#3a2418"], [box(0.03, 0.14, 0.03, 0.08, 0.15, 0), "#3a2418"], [box(0.06, 0.04, 0.1, 0, 0.02, 0), "#c8a040"]]),
  () => part([[new THREE.CylinderGeometry(0.016, 0.016, 0.86, 6), "#5a3a1e"], [box(0.13, 0.03, 0.03, -0.05, 0.43, 0), "#5a3a1e"]]),
  () => part([0, 1, 2, 3, 4, 5, 6].map((k): Piece => [ball(0.035, Math.cos(k * 2.4) * 0.09, Math.sin(k * 1.7) * 0.06, Math.sin(k * 2.4) * 0.09), "#f4e04a"])),
  () => part([[new THREE.CylinderGeometry(0.05, 0.05, 0.28, 10), "#a8282e"], [new THREE.CylinderGeometry(0.052, 0.052, 0.06, 10).translate(0, 0.16, 0), "#8a8a8a"]]),
];
const SPLAT: [string, string, string][] = [["#5a3a28", "#3a2418", "rgba(40,24,16,0.85)"], ["#8a6a48", "#5a3a1e", "rgba(70,44,24,0.8)"],
  ["#fffbd0", "#f4e04a", "rgba(240,220,70,0.85)"], ["#c8955e", "#8a5a2a", "rgba(140,90,40,0.8)"]];

const _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, "YXZ"), _m = new THREE.Matrix4(), _v = new THREE.Vector3(), _o = new THREE.Vector3(), ONE = new THREE.Vector3(1, 1, 1);

export class Passengers {
  readonly stops: Stop[] = [];
  readonly pens: Pen[] = [];
  seller = "";
  /** The stop the bell was rung for, or -1. */
  bell = -1;
  /** The perfect window's widened by a cheer till then, and your heaves are put off by a splat till then (performance.now()). */
  cheerUntil = 0;
  rattleUntil = 0;
  /** What's been thrown at you this push (ITEMS' numbers): all of it gets you a thermos. */
  private hitBy = new Set<number>();
  private rowT = 0;
  private hostRowT = 0;
  private complaints = 0;
  private sellerFar = 0;
  private shoutT = 4;
  private actT = 8;
  private cheerT = 9;
  private helped = 0;
  private hr: () => number;
  private meshes: THREE.InstancedMesh[] = [];
  private raised: THREE.InstancedMesh;
  private sign: THREE.Mesh;
  private itemGeo: THREE.BufferGeometry[];
  private itemMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  private mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  private fliers: Flier[] = [];
  private bubbles: Bubble[] = [];
  private posAt = new Map<number, THREE.Vector3>();
  private chock = -1;
  // the fare at the door, counted on the seller's own screen
  private cnt = { i: -1, v: 0, steps: [] as number[], k: 0, t: 0, phase: 0, r: Math.random, say: "", sayT: 0, sayCol: "#fff" };

  constructor(private w: QuestWorld, private seed: number, private at: PoseAt, private half: number, private len: number,
    private bus: Vehicle, s0: number, top: number, cast: number, private street: string, private colour: string,
    private tell: (d: Record<string, unknown>) => void, private say: (d: Record<string, unknown>) => void) {
    const r = rng(seed ^ 0x6a09e667);
    this.hr = rng(seed ^ 0x3c6ef372);
    const a = s0 + 25, b = top - 8, n = this.len < 140 ? 2 : 3;
    const fare = [120, 140, 160, 180, 200][Math.floor(r() * 5)];
    const used = new Set<string>();
    for (let k = 0; k < n && b > a; k++) {
      this.stops.push({ s: a + ((k + 0.5) * (b - a)) / n, st: 0, sold: 0, halted: false, cross: false });
      const q = 2 + Math.floor(r() * 2) + Math.floor(Math.min(6, cast) / 2);
      for (let j = 0; j < q; j++) {
        const look = Math.floor(r() * LOOKS.length), pool = MEN.has(look) ? MENS : NAMES.filter((x) => !MENS.includes(x));
        let name = pool[Math.floor(r() * pool.length)];
        for (let t = 0; t < 4 && used.has(name); t++) name = pool[Math.floor(r() * pool.length)];
        used.add(name);
        this.pens.push({ k, j, look, name, fare, st: QUEUED, ang: r() * 0.15, w: 0, p: 0, cool: 0, spot: -1, lean: 0, shoutT: 0, bob: r() * 6 });
      }
    }
    this.meshes = LOOKS.map((f) => {
      const m = new THREE.InstancedMesh(f(), this.mat, PER_LOOK);
      m.count = 0; m.castShadow = true; m.frustumCulled = false;
      w.scene.add(m);
      return m;
    });
    this.raised = new THREE.InstancedMesh(part(cane(0)).translate(0, -0.43, -0.14), this.mat, 12);
    this.raised.count = 0; this.raised.frustumCulled = false;
    w.scene.add(this.raised);
    // the stops' poles and flags, all one mesh
    const signs: THREE.BufferGeometry[] = [];
    for (const st of this.stops) {
      const p = at(st.s, -(half + 0.55)), g = part([[new THREE.CylinderGeometry(0.04, 0.04, 2.8, 8).translate(0, 1.4, 0), "#8a8d90"],
        [box(0.52, 0.36, 0.04, 0.2, 2.5, 0), "#c8262e"], [box(0.42, 0.12, 0.045, 0.2, 2.52, 0), "#f4f4f0"], [box(0.32, 0.42, 0.05, 0, 1.5, 0), "#e8e8e0"]]);
      g.rotateY(Math.atan2(p.fx, p.fz)).translate(p.x, w.map.ground(p.x, p.z), p.z);
      signs.push(g);
    }
    this.sign = new THREE.Mesh(signs.length ? mergeGeometries(signs)! : new THREE.BufferGeometry(), this.mat);
    signs.forEach((g) => g.dispose());
    this.sign.castShadow = true;
    w.scene.add(this.sign);
    this.itemGeo = ITEM_GEO.map((f) => f());
  }

  // ---- the bus's side of it ---------------------------------------------------------------------

  /** The bus's weight, as a share of what it'd be empty. */
  weight() { return 1 + WEIGHT * this.pens.filter((p) => p.st === ABOARD).length; }
  /** How many pushers the pensioners helping are worth. */
  helpers() { return HELP * this.pens.filter((p) => p.st === PUSHING).length; }
  /** A row on board: the heaves count for less. */
  rowing() { return this.hostRowT > 0; }
  aboard() { return this.pens.filter((p) => p.st === ABOARD || p.st === PUSHING).length; }

  private doorS(s: number) { return s + this.bus.hl - DOOR_IN; }
  door(b: BusNow) { return this.at(this.doorS(b.s), b.lat - this.bus.hw - 0.45); }
  /** The stop the door's at now, slow enough to take on passengers, if any. */
  private serving(b: BusNow) {
    if (b.mode !== 1) return -1;
    const d = this.doorS(b.s);
    return this.stops.findIndex((st) => st.st < 2 && Math.abs(d - st.s) < SERVE);
  }
  /** Pulled in at a stop with someone still to get on. */
  boarding(b: BusNow) { const k = this.serving(b); return k >= 0 && this.pens.some((p) => p.k === k && p.st <= PAYING); }
  /** On your own the bus is chocked at a stop while you sell, as there's nobody else to hold it. */
  chocked(b: BusNow) {
    const k = this.serving(b);
    if (k >= 0 && this.chock !== k) { this.chock = k; if (this.pens.some((p) => p.k === k && p.st <= PAYING)) guide("Chocked at the stop: go and sell the tickets at the front door"); }
    return this.boarding(b);
  }

  hostStep(dt: number, b: BusNow) {
    const d = this.doorS(b.s);
    this.hostRowT = Math.max(0, this.hostRowT - dt);
    // the seller must be at the door, not pushing or in the cab
    if (this.seller) {
      const p = this.w.players().find((q) => q.id === this.seller), door = this.door(b);
      const far = !p || !p.alive || b.slots.includes(this.seller) || b.driver === this.seller || Math.hypot(p.x - door.x, p.z - door.z) > 6;
      this.sellerFar = far ? this.sellerFar + dt : 0;
      if (this.sellerFar > 1.5 || b.mode > 1) this.seller = "";
    }
    for (const [k, st] of this.stops.entries()) {
      if (st.st >= 2) continue;
      const off = d - st.s;
      if (off > SERVE + 2) {
        // gone past it: whoever's still waiting is left behind
        for (const p of this.pens) if (p.k === k && p.st <= PAYING) { p.st = LEFT; p.ang = Math.max(p.ang, st.sold ? 0.5 : 0.95); }
        st.st = st.sold ? 2 : 3;
        if (!st.sold) { this.complaints++; this.tell({ k: "pq", i: k }); }
        // they wanted that stop, and you didn't pull in: word gets round the queues further up
        if (this.bell === k && !st.halted) for (const p of this.pens) if (p.k > k && p.st === QUEUED) p.ang = Math.min(1, p.ang + 0.3);
        if (this.bell === k) this.bell = -1;
        continue;
      }
      if (Math.abs(off) < SERVE && Math.abs(b.v) < 0.9 && b.mode === 1) {
        st.st = 1;
        if (Math.abs(b.v) < 0.3) st.halted = true;
        // the queue comes over to the door one after another
        const going = this.pens.filter((p) => p.k === k && (p.st === SHUFFLING || p.st === PAYING));
        const next = this.pens.find((p) => p.k === k && p.st === QUEUED);
        if (next && (!going.length || going.every((p) => p.p > 0.35))) { next.st = SHUFFLING; next.p = 0; }
      } else if (off < -SERVE - 6 && st.st === 1) {
        // it's rolled back down past them: back to the queue
        st.st = 0;
        for (const p of this.pens) if (p.k === k && (p.st === SHUFFLING || p.st === PAYING)) { p.st = QUEUED; p.p = 0; }
      }
    }
    const slow = b.v < 0.5, back = b.v < -0.05, atStop = this.serving(b) >= 0;
    for (const p of this.pens) {
      p.cool -= dt;
      if (p.st === SHUFFLING) {
        p.p = Math.min(1, p.p + dt / SHUFFLE_T);
        if (p.p >= 1 && !this.pens.some((o) => o.k === p.k && o.st === PAYING)) p.st = PAYING;
      } else if (p.st === PAYING) {
        if (!this.seller) p.ang = Math.min(1, p.ang + dt * 0.02);
      } else if (p.st === ABOARD) {
        // tempers: stopping at a stop they'll put up with, rolling back they won't
        const up = back ? (b.v < -1 ? 0.15 : 0.09) : slow ? (atStop ? 0.008 : 0.035) : b.v > 1 ? -0.045 : -0.006;
        p.ang = Math.max(0, Math.min(1, p.ang + up * dt + (this.hostRowT > 0 ? 0.02 * dt : 0)));
      } else if (p.st === HUFF) {
        p.w += Math.max(HUFF_V, b.v + 0.5) * dt;
        if (p.w >= this.len - 2) { p.w = this.len - 2; p.st = STOMPED; }
      } else if (p.st === PUSHING && (b.mode > 1 || b.v < -1.5)) { p.st = HUFF; p.w = b.s - this.bus.hl; }
    }
    if (b.mode !== 1) return;
    const on = this.pens.filter((p) => p.st === ABOARD);
    // a cross one shouts out of the window now and then
    if ((this.shoutT -= dt) <= 0) {
      this.shoutT = 2.2 + this.hr() * 2.5;
      const cross = on.filter((p) => p.ang > 0.4), waiting = this.pens.filter((p) => p.st === PAYING && !this.seller), left = this.pens.filter((p) => p.st === LEFT);
      const near = left.filter((p) => Math.abs(this.stops[p.k].s - d) < 35);
      const pick = <T>(a: T[]) => a[Math.floor(this.hr() * a.length)];
      if (cross.length) { const p = pick(cross); this.tell({ k: "ps", i: this.pens.indexOf(p), tx: pick(CROSS) }); }
      else if (waiting.length) this.tell({ k: "ps", i: this.pens.indexOf(waiting[0]), tx: pick(WAITING) });
      else if (near.length) this.tell({ k: "ps", i: this.pens.indexOf(pick(near)), tx: pick(PASSED) });
    }
    // and a furious one does something about it
    if ((this.actT -= dt) <= 0) {
      this.actT = 4 + this.hr() * 4;
      const mad = on.filter((p) => p.ang > FURIOUS && p.cool <= 0);
      if (mad.length) {
        const p = mad[Math.floor(this.hr() * mad.length)], i = this.pens.indexOf(p), roll = this.hr();
        p.cool = 12;
        const ahead = this.stops.findIndex((st) => st.st === 0 && st.s > d + SERVE);
        const pushers = b.slots.filter(Boolean);
        if (roll < 0.28 && ahead >= 0 && this.bell < 0) { this.bell = ahead; this.tell({ k: "pb", i, st: ahead }); }
        else if (roll < 0.65 && pushers.length && !this.w.passive) { const it = Math.floor(this.hr() * 4); this.tell({ k: "px", i, it, to: pushers[Math.floor(this.hr() * pushers.length)] }); }
        else if (roll < 0.82 && on.length >= 2 && this.hostRowT <= 0) {
          const o = on.filter((q) => q !== p)[Math.floor(this.hr() * (on.length - 1))];
          this.hostRowT = 5;
          this.tell({ k: "pr", i, j: this.pens.indexOf(o), l: Math.floor(this.hr() * ROW.length) });
        } else if (p.ang > 0.9) { p.st = HUFF; p.w = d; this.tell({ k: "ph", i }); }
      }
    }
    // and with the bus going well, happy ones cheer, and once in a while a feisty one gets off to help
    if ((this.cheerT -= dt) <= 0) {
      this.cheerT = 7 + this.hr() * 6;
      const glad = on.filter((p) => p.ang < HAPPY);
      if (glad.length && b.v > 0.9) {
        const p = glad[Math.floor(this.hr() * glad.length)];
        if (this.helped < Math.max(1, Math.floor(b.n / 2)) && glad.length >= 2 && this.hr() < 0.3) { this.helped++; p.st = PUSHING; this.tell({ k: "pf", i: this.pens.indexOf(p) }); }
        else this.tell({ k: "pc", i: this.pens.indexOf(p) });
      }
    }
  }

  /** The host's word on them, sent with the bus. */
  pack() {
    return { pn: this.pens.flatMap((p) => [p.st, Math.round(p.ang * 99), Math.round((p.st === SHUFFLING ? p.p : p.w) * 10)]), tk: this.seller, ps: this.stops.map((s) => s.st), bl: this.bell };
  }
  take(d: any) {
    if (Array.isArray(d.pn)) this.pens.forEach((p, i) => {
      const st = d.pn[i * 3], a = d.pn[i * 3 + 1], x = d.pn[i * 3 + 2];
      if (!Number.isFinite(st)) return;
      if (st === ABOARD && p.st !== ABOARD) p.spot = this.pens.filter((o) => o.st === ABOARD || o.spot >= 0).length;
      p.st = st; p.ang = (a || 0) / 99;
      if (st === SHUFFLING) p.p = Math.max(p.p, (x || 0) / 10); else p.w = (x || 0) / 10;
    });
    if (typeof d.tk === "string") this.seller = d.tk;
    if (Array.isArray(d.ps)) this.stops.forEach((s, k) => { if (Number.isFinite(d.ps[k])) s.st = d.ps[k]; });
    if (Number.isFinite(d.bl)) this.bell = d.bl;
  }

  /** A step of theirs (from the host), or an ask to the host. True if it was one of theirs. */
  event(d: any, from: string, period: number): boolean {
    const p = this.pens[d.i | 0], me = this.w.me(), close = Math.hypot(me.x - this.bus.x, me.z - this.bus.z) < 70;
    switch (d.k) {
      case "tk":
        if (!this.w.isHost) return true;
        if (Number.isFinite(d.i)) {
          if (from === this.seller && p?.st === PAYING) {
            p.st = ABOARD; p.spot = this.pens.filter((o) => o.spot >= 0).length;
            this.stops[p.k].sold++;
            this.tell({ k: "pk", i: d.i | 0, q: d.q === 2 ? 2 : 1 });
          }
        } else if (d.on) { if (!this.seller) { this.seller = from; this.sellerFar = 0; } }
        else if (this.seller === from) this.seller = "";
        return true;
      case "ps": if (p && close) this.speak(d.i | 0, String(d.tx ?? "").slice(0, 90)); return true;
      case "pk":
        if (!p) return true;
        if (p.st !== ABOARD) { p.st = ABOARD; if (p.spot < 0) p.spot = this.pens.filter((o) => o.spot >= 0).length; }
        if (close) { SFX.ticket(); if (this.hr() < 0.6 || d.q === 2) this.speak(d.i | 0, pickOf(d.q === 2 ? THANKS : EXACT.concat(THANKS))); }
        return true;
      case "pq": {
        const st = this.stops[d.i | 0];
        if (!st || st.cross) return true;
        st.cross = true; st.st = 3;
        for (const q of this.pens) if (q.k === (d.i | 0) && q.st <= PAYING) q.st = LEFT;
        const who = this.pens.filter((q) => q.k === (d.i | 0));
        if (close) { notice("A queue left at the stop! They'll be writing to the council"); SFX.crowdOhh(); }
        if (who.length) this.speak(this.pens.indexOf(who[0]), pickOf(PASSED));
        Paper.complaint(this.street, who.map((q) => q.name), `${this.seed}|${d.i | 0}`);
        return true;
      }
      case "pb":
        if (Number.isFinite(d.st)) this.bell = d.st;
        if (close) { SFX.busBell(); if (p) this.speak(d.i | 0, pickOf(BELL)); }
        return true;
      case "px": if (p && close) this.throwIt(d.i | 0, (d.it | 0) % 4, String(d.to ?? "")); return true;
      case "ph":
        if (p) { p.st = HUFF; if (close) { this.speak(d.i | 0, pickOf(HUFFED)); this.w.feed(`${esc(p.name)} got off in a huff and is walking it`); } }
        return true;
      case "pr": {
        this.rowT = 5;
        if (this.w.isHost) this.hostRowT = 5;
        const l = ROW[(d.l | 0) % ROW.length];
        if (close) { if (p) this.speak(d.i | 0, l[0]); setTimeout(() => this.speak(d.j | 0, l[1]), 1100); notice("A row on board about the front seat! It's rocking the bus"); }
        return true;
      }
      case "pc":
        this.cheerUntil = performance.now() + period * 1000 * 1.2;
        if (p && close) this.speak(d.i | 0, pickOf(CHEER));
        return true;
      case "pf":
        if (p) { p.st = PUSHING; if (close) { this.speak(d.i | 0, pickOf(FEISTY)); this.w.feed(`${esc(p.name)} has got off to help push`); } }
        return true;
    }
    return false;
  }

  // ---- your side of it: the door --------------------------------------------------------------

  amSeller() { return this.seller === this.w.selfId; }
  private doorOff(b: BusNow) {
    const me = this.w.me(), door = this.door(b);
    return me.alive && b.mode <= 1 ? Math.hypot(me.x - door.x, me.z - door.z) : Infinity;
  }
  nearDoor(b: BusNow) { return this.doorOff(b) < 1.8; }
  /** Whoever's at the door paying, at the stop the bus is at. */
  private payer() { return this.pens.findIndex((p) => p.st === PAYING); }

  use(b: BusNow): boolean {
    if (this.amSeller()) {
      const i = this.payer();
      if (i < 0 || this.cnt.i !== i) { this.say({ k: "tk", on: 0 }); this.seller = ""; return true; }
      this.press(i);
      return true;
    }
    if (!this.nearDoor(b)) return false;
    if (this.seller && this.seller !== this.w.selfId) { this.w.toast(`${this.w.nameOf(this.seller)}'s on the door`); return true; }
    this.say({ k: "tk", on: 1 });
    this.seller = this.w.selfId;
    return true;
  }
  hint(b: BusNow): string {
    if (this.amSeller()) return this.payer() >= 0 ? "<b>{use}</b> Take the fare when it's exactly right" : "<b>{use}</b> Leave the door · nobody waiting just now";
    if (!this.nearDoor(b)) return "";
    if (this.seller) return `${esc(this.w.nameOf(this.seller))}'s selling the tickets`;
    return "<b>{use}</b> Sell tickets at the door";
  }

  private press(i: number) {
    const c = this.cnt, p = this.pens[i];
    if (c.phase >= 3) return;
    if (c.v === p.fare && c.k >= c.steps.length) {
      this.say({ k: "tk", i, q: 1 });
      this.sold();
      this.flashDoor("Exact money!", "#4dff8e");
      c.phase = 5;
    } else if (c.v > p.fare) {
      c.phase = 4; c.t = 1.6;
      this.flashDoor("Too late: she wants change", "#ff9a4a");
      this.speak(i, pickOf(CHANGE));
    } else {
      c.phase = 3; c.t = 0.9; c.v = 0; c.k = 0;
      this.flashDoor("Too soon: she's counting again", "#ff5a4a");
      this.speak(i, pickOf(EARLY));
    }
  }
  /** A ticket sold at the door on this screen, towards the clippie's hat. */
  private sold() { if (wardCount("tickets") >= 50) earn("clippie"); }
  private flashDoor(t: string, col: string) { this.cnt.say = t; this.cnt.sayCol = col; this.cnt.sayT = 1.2; }

  /** The fare being counted out on the seller's screen, a coin at a time. */
  private count(dt: number) {
    const i = this.amSeller() ? this.payer() : -1, c = this.cnt;
    if (i < 0) { if (c.i >= 0) { c.i = -1; missionAux("pushdoor", null); } return; }
    const p = this.pens[i];
    if (c.i !== i) {
      const r = rng(this.seed ^ (i * 7919 + 13));
      c.i = i; c.v = 0; c.k = 0; c.phase = 0; c.t = 0.6; c.r = r; c.steps = [];
      for (let left = p.fare; left > 0; ) {
        const coins = [50, 20, 10].filter((x) => x <= left), coin = coins[Math.floor(r() * coins.length)];
        c.steps.push(coin); left -= coin;
        if (left > 0 && c.steps.length > 1 && r() < 0.2) c.steps.push(-10, 10);
      }
    }
    if ((c.t -= dt) <= 0) {
      if (c.phase === 3) { c.phase = 0; c.t = 0.4; }
      else if (c.phase === 4) { c.phase = 5; this.say({ k: "tk", i, q: 2 }); this.sold(); }
      else if (c.phase === 5) c.t = 1;
      else if (c.k < c.steps.length) { c.v += c.steps[c.k++]; c.t = 0.4 + c.r() * 0.35; SFX.tick(); }
      else if (c.phase === 0) { c.phase = 1; c.t = 0.9 + c.r() * 0.6; }
      else if (c.phase === 1) { c.phase = 2; c.v += 10; c.t = 1.1; SFX.tick(); }
      else { c.phase = 1; c.v -= 10; c.t = 1 + c.r() * 0.5; }
    }
    const money = (pence: number) => `£${(pence / 100).toFixed(2)}`;
    let row = missionAuxRow("pushdoor");
    if (!row) {
      missionAux("pushdoor", `<div class="aux-word"></div><div class="aux-big" style="font-size:30px;line-height:1.1"></div><div class="aux-tag" style="font-size:16px;height:20px"></div>`, this.colour);
      row = missionAuxRow("pushdoor")!;
    }
    if (row.hidden) row.hidden = false;
    const [who, big, tag] = [...row.children] as HTMLElement[];
    const wt = `${p.name} counts out the fare`;
    if (who.textContent !== wt) who.textContent = wt;
    const right = c.v === p.fare && c.k >= c.steps.length;
    const bt = `${money(c.v)} <span style="opacity:.6;font-size:20px">of ${money(p.fare)}</span>`;
    if (big.innerHTML !== bt) big.innerHTML = bt;
    big.style.color = right ? "#4dff8e" : c.v > p.fare ? "#ff9a4a" : "#fff";
    c.sayT -= dt;
    const tt = c.sayT > 0 ? c.say : c.phase === 4 ? "Counting out her change..." : `${ctl("use")} when it's exactly right`;
    if (tag.textContent !== tt) tag.textContent = tt;
    tag.style.color = c.sayT > 0 ? c.sayCol : "#ccc";
  }

  // ---- drawing them -----------------------------------------------------------------------------

  /** Where pensioner i's head is, for a bubble or a throw. */
  private head(i: number) { return this.posAt.get(i) ?? null; }

  speak(i: number, text: string) {
    if (!text) return;
    const s = speechBubble(text);
    s.scale.multiplyScalar(1.3);
    this.w.scene.add(s);
    this.bubbles.push({ s, i, t: 3 });
    const p = this.pens[i];
    if (p) p.shoutT = 3;
    while (this.bubbles.length > 3) this.dropBubble(0);
    const h = this.head(i);
    if (h) { const [d, pan] = this.w.hear?.(h.x, h.y, h.z) ?? [0, 0]; SFX.shout(d * 1.3, pan, i * 31 + 7); }
  }
  private dropBubble(k: number) {
    const b = this.bubbles.splice(k, 1)[0];
    this.w.scene.remove(b.s); b.s.material.map?.dispose(); b.s.material.dispose();
  }

  private throwIt(i: number, it: number, to: string) {
    const from = this.head(i)?.clone() ?? new THREE.Vector3(this.bus.x, this.bus.top - 1, this.bus.z);
    const m = new THREE.Mesh(this.itemGeo[it], this.itemMat);
    m.position.copy(from);
    this.w.scene.add(m);
    this.fliers.push({ m, t: 0, from, to, it });
    this.speak(i, pickOf(THROW[it]));
    if (to === this.w.selfId) this.w.toast(`Incoming ${ITEMS[it]}!`);
  }

  update(dt: number, b: BusNow, period: number) {
    const now = performance.now();
    this.rowT = Math.max(0, this.rowT - dt);
    this.count(dt);
    // walked off from the door, or gone back to the bus: off the door
    if (this.amSeller() && this.doorOff(b) > 5) { this.say({ k: "tk", on: 0 }); this.seller = ""; }
    // the row rocks the bus from side to side
    if (this.rowT > 0) this.bus.root.children[0].rotation.x += Math.sin(now / 110) * 0.035 * Math.min(1, this.rowT);
    const pose = this.at(b.s, b.lat), hl = this.bus.hl, hw = this.bus.hw, decks = this.bus.kind === "bus" ? 2 : 1;
    const door = this.at(this.doorS(b.s), b.lat - hw - 0.45), counts = this.meshes.map(() => 0);
    let raisedN = 0;
    const g = (x: number, z: number) => this.w.map.ground(x, z);
    const put = (i: number, x: number, y: number, z: number, yaw: number, pitch: number, roll: number, pivot = 0) => {
      const p = this.pens[i], k = p.look, n = counts[k]++;
      if (n >= PER_LOOK) return;
      _q.setFromEuler(_e.set(pitch, yaw, roll));
      // turned about a point pivot up from the feet (a hip on a window sill), not the feet
      _o.set(0, -pivot, 0).applyQuaternion(_q);
      _m.compose(_v.set(x + _o.x, y + pivot + _o.y, z + _o.z), _q, ONE);
      this.meshes[k].setMatrixAt(n, _m);
      _o.set(0, 1.55, 0).applyQuaternion(_q);
      const h = this.posAt.get(i) ?? new THREE.Vector3();
      this.posAt.set(i, h.set(_v.x + _o.x, _v.y + _o.y, _v.z + _o.z));
    };
    const shake = (i: number, wave: number) => {
      if (raisedN >= 12) return;
      const h = this.posAt.get(i);
      if (!h) return;
      _q.setFromEuler(_e.set(0.3 + Math.sin(now / 90 + wave) * 0.5, Math.atan2(pose.rx, pose.rz), 0));
      this.raised.setMatrixAt(raisedN++, _m.compose(_v.set(h.x + pose.fx * 0.25, h.y + 0.25, h.z + pose.fz * 0.25), _q, ONE));
    };
    this.posAt.clear();
    const busYaw = Math.atan2(pose.fx, pose.fz);
    this.pens.forEach((p, i) => {
      p.bob += dt * (p.st === HUFF ? 9 : 4);
      p.shoutT = Math.max(0, p.shoutT - dt);
      const st = this.stops[p.k], q = this.at(st.s - p.j * 0.75, -(this.half + 1.3));
      if (p.st === QUEUED || p.st === LEFT) {
        const look = p.st === LEFT ? Math.atan2(pose.x - q.x, pose.z - q.z) : Math.atan2(q.rx, q.rz);
        const mad = p.st === LEFT;
        put(i, q.x, g(q.x, q.z), q.z, look + (mad ? Math.sin(now / 150 + i) * 0.15 : 0), 0.1, mad ? Math.sin(now / 120 + i) * 0.08 : Math.sin(p.bob * 0.3) * 0.02);
        if (mad && Math.abs(st.s - this.doorS(b.s)) < 60) shake(i, i);
      } else if (p.st === SHUFFLING || p.st === PAYING) {
        const line = this.pens.filter((o, k) => k < i && o.k === p.k && (o.st === SHUFFLING || o.st === PAYING)).length;
        const to = { x: door.x - pose.fx * 0.7 * line, z: door.z - pose.fz * 0.7 * line };
        const e = p.st === PAYING ? 1 : p.p * p.p * (3 - 2 * p.p);
        const x = q.x + (to.x - q.x) * e, z = q.z + (to.z - q.z) * e;
        const yaw = e >= 1 ? Math.atan2(pose.rx, pose.rz) : Math.atan2(to.x - q.x, to.z - q.z);
        put(i, x, g(x, z), z, yaw, 0.14, Math.sin(p.bob) * (e < 1 ? 0.06 : 0.02));
        if (!this.w.isHost && p.st === SHUFFLING) p.p = Math.min(1, p.p + dt / SHUFFLE_T);
      } else if (p.st === ABOARD) {
        const want = p.ang > LEAN_AT || p.shoutT > 0 ? 1 : 0;
        p.lean += (want - p.lean) * Math.min(1, dt * 4);
        if (p.lean < 0.05) return;
        const spot = Math.max(0, p.spot), side = spot % 2 ? 1 : -1, perSide = Math.max(2, Math.floor((hl * 2 - 3) / 1.3));
        const row = Math.floor(spot / 2) % (perSide * decks), deck = Math.floor(row / perSide), al = hl - 2 - (row % perSide) * 1.3;
        const sill = (decks === 2 ? (deck ? 3.15 : 1.5) : 1.35) + this.bus.y;
        const lat = side * (hw - 0.45 + 0.4 * p.lean);
        const x = pose.x + pose.fx * al + pose.rx * lat, z = pose.z + pose.fz * al + pose.rz * lat;
        put(i, x, sill - 0.95, z, Math.atan2(pose.rx * side, pose.rz * side), 0.65 * p.lean + Math.sin(now / 160 + i) * 0.06 * p.lean, 0, 0.95);
        if (p.ang > FURIOUS) shake(i, i * 2);
      } else if (p.st === HUFF || p.st === STOMPED) {
        const at = this.at(Math.min(this.len - 1, p.w), -(this.half + 0.9 + (i % 2) * 0.5));
        const yaw = p.st === STOMPED ? busYaw + Math.PI : busYaw;
        put(i, at.x, g(at.x, at.z), at.z, yaw, p.st === HUFF ? 0.2 : 0.05, p.st === HUFF ? Math.sin(p.bob) * 0.08 : 0);
        if (p.st === STOMPED) shake(i, i);
      } else if (p.st === PUSHING) {
        const al = -(hl + 0.75), ac = (hw + 0.35) * (i % 2 ? 1 : -1);
        const x = pose.x + pose.fx * al + pose.rx * ac, z = pose.z + pose.fz * al + pose.rz * ac;
        put(i, x, g(x, z), z, busYaw, 0.42 + Math.sin(p.bob) * 0.04, 0);
      }
    });
    this.meshes.forEach((m, k) => { m.count = Math.min(PER_LOOK, counts[k]); m.visible = m.count > 0; m.instanceMatrix.needsUpdate = true; });
    this.raised.count = raisedN; this.raised.visible = raisedN > 0; this.raised.instanceMatrix.needsUpdate = true;
    // bubbles over whoever's speaking
    for (let k = this.bubbles.length - 1; k >= 0; k--) {
      const bb = this.bubbles[k], h = this.posAt.get(bb.i);
      if ((bb.t -= dt) <= 0) { this.dropBubble(k); continue; }
      // over the roof for anyone aboard, so the pushers behind can read it, and stacked so two don't overlap
      const st = this.pens[bb.i]?.st, up = k * 0.75;
      if (h) bb.s.position.set(h.x, (st === ABOARD ? Math.max(h.y + 0.4, this.bus.top + 0.3) : h.y + 0.4) + up, h.z);
      else bb.s.position.set(this.bus.x, this.bus.top + 0.6 + up, this.bus.z);
      bb.s.material.opacity = Math.min(1, bb.t / 0.4);
    }
    // anything thrown, on its way
    for (let k = this.fliers.length - 1; k >= 0; k--) {
      const f = this.fliers[k];
      f.t += dt / 0.8;
      const tp = this.w.players().find((p) => p.id === f.to), me = f.to === this.w.selfId ? this.w.me() : null;
      const tx = me?.x ?? tp?.x ?? f.from.x, ty = (me?.y ?? tp?.y ?? f.from.y - 1) + 1.5, tz = me?.z ?? tp?.z ?? f.from.z;
      const t = Math.min(1, f.t);
      f.m.position.set(f.from.x + (tx - f.from.x) * t, f.from.y + (ty - f.from.y) * t + Math.sin(t * Math.PI) * 1.4, f.from.z + (tz - f.from.z) * t);
      f.m.rotation.set(t * 9, t * 5, t * 3);
      if (f.t < 1) continue;
      this.w.scene.remove(f.m);
      this.fliers.splice(k, 1);
      const [d, pan] = this.w.hear?.(tx, ty, tz) ?? [0, 0];
      SFX.impact(f.it === 2 ? "body" : "barrier", d, pan);
      if (f.to === this.w.selfId) {
        this.hitBy.add(f.it);
        if (f.it === 1) earn("stick");
        if (this.hitBy.size === ITEMS.length) earn("thermos");
        splatScreen({ n: f.it === 2 ? 8 : 5, size: f.it === 0 ? 20 : 14, colours: SPLAT[f.it], secs: 2.5 });
        this.rattleUntil = performance.now() + period * 1000;
        this.w.toast(`Splat! A ${ITEMS[f.it]} right on you: your next heave's off`);
      } else this.w.dust?.(tx, ty - 1, tz, 0, 0);
    }
  }

  // ---- the end ---------------------------------------------------------------------------------

  /** How it went for them at the top: how happy they all are, 0..1, counting anyone not aboard as unhappy. */
  result() {
    const all = this.pens.length, on = this.pens.filter((p) => p.st === ABOARD || p.st === PUSHING);
    const happy = all ? on.reduce((a, p) => a + (p.st === PUSHING ? 1 : 1 - p.ang), 0) / all : 1;
    return { all, on: on.length, happy, cp: this.stops.filter((s) => s.st === 3).length, hf: this.pens.filter((p) => p.st === HUFF || p.st === STOMPED).length };
  }

  /** What the cab sees of them. */
  cabLines(b: BusNow): string[] {
    const out: string[] = [], d = this.doorS(b.s);
    const k = this.stops.findIndex((st) => st.st < 2 && st.s > d - SERVE);
    if (this.bell >= 0) out.push("DING! They want the next stop: pull in there");
    if (k >= 0) {
      const n = this.pens.filter((p) => p.k === k && p.st <= PAYING).length, gap = Math.round(this.stops[k].s - d);
      if (n) out.push(gap > SERVE ? `A stop ahead, ${n} waiting, ${gap} m: stop there` : `At the stop: ${n} to get on`);
    }
    if (this.rowT > 0) out.push("A row on board about the front seat");
    return out;
  }
  /** A line for the card: the stop coming up, or the door. */
  cardSub(b: BusNow): string | undefined {
    if (this.amSeller()) return this.payer() >= 0 ? "Take each fare when the money's exactly right" : "On the door, selling tickets: nobody waiting just now";
    const d = this.doorS(b.s), k = this.stops.findIndex((st) => st.st < 2 && Math.abs(st.s - d) < 30);
    if (k < 0) return undefined;
    const n = this.pens.filter((p) => p.k === k && p.st <= PAYING).length;
    if (!n) return undefined;
    return this.seller ? `${this.w.nameOf(this.seller)}'s on the door: ${n} to get on` : `A bus stop, ${n} waiting: someone go to the front door and sell the tickets`;
  }

  dispose() {
    missionAux("pushdoor", null);
    for (const m of this.meshes) { this.w.scene.remove(m); m.geometry.dispose(); m.dispose(); }
    this.w.scene.remove(this.raised, this.sign);
    this.raised.geometry.dispose(); this.raised.dispose(); this.sign.geometry.dispose();
    while (this.bubbles.length) this.dropBubble(0);
    for (const f of this.fliers) this.w.scene.remove(f.m);
    this.itemGeo.forEach((g) => g.dispose());
    this.mat.dispose(); this.itemMat.dispose();
  }
}

function pickOf<T>(a: T[]): T { return a[Math.floor(Math.random() * a.length)]; }
function notice(text: string) { missionCall({ text }); }
