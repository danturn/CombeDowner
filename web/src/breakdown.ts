// A breakdown on Bathwick Street: outside No. 23 Chinese Kitchen a BMW SUV has died at the kerb,
// bonnet up, hazards going and steam coming off the engine, with a yellow recovery truck pulled in
// ahead of it. Neither of them moves. Its owner paces the pavement in his gilet, on the phone, head
// in his hands, telling anyone who comes near all about it. You can't hurt him: shoot him and he
// just complains about that too.
//
// The spot is found by the shop's sign on the map (from the shop data, see tools/shops.py), once
// the square of Bath it's in has loaded, and the two vehicles are parked at the kerb of the nearest
// street in front of it, facing the way the traffic goes. Maps without the shop have no breakdown.
//
// Who decides what: nobody. Every player puts the same vehicles in the same place from the map, and
// they never move, so nothing goes over the network. The two vehicles block like the others (they're
// in the map's movers) and the host's traffic pulls round them. What the owner does and says is
// each player's own: it's only ever for show.
import * as THREE from "three";
import { model, Part } from "./furniture";
import { GameMap, Mover, PATHS, roadHalf } from "./map";
import { speechBubble } from "./trackies";
import * as Posh from "./posh";
import type { Obstacle } from "./traffic";

const SHOP = /no\.?\s*23 chinese/i;
const HEAR = 30;     // he talks while you're this close
const VOICE = { voice: 1, pitch: 1.35, rate: 0.95 };  // a gentle man's voice: the second British one, higher than any of the rugby players' (they go up to 1.05; posh.ts)
const BUBBLE = 4.2;  // seconds a line stays up

const MOANS = [
  "Brand new X5. Brand new! Eleven miles on the clock.",
  "It just died. Right outside the Chinese. Just died.",
  "Forty minutes I've been waiting. Forty minutes!",
  "I only came out for a crispy duck.",
  "My crispy duck's going cold in there.",
  "Every light on the dashboard. Every single one.",
  "Seventy grand, and it won't start.",
  "The warning light came on at Pulteney Bridge. I ignored it. Obviously.",
  "Has anyone got jump leads? This is Bath, somebody must have jump leads.",
  "Is it the battery? It's always the battery. It's never the battery.",
  "They want to tow it to Bristol. Bristol!",
  "It's under warranty. It had better be under warranty.",
  "I'm going to miss the kick off at the Rec.",
  "I should have kept the Volvo.",
  "Can anyone tell me why it's still beeping?",
  "Don't touch the car. Please. Just don't touch it.",
  "Unbelievable. Absolutely unbelievable.",
  "Do you know anything about cars? No. Course you don't.",
  "Ten years I've driven BMWs. Never again. Well. Probably again.",
  "Hello? Yes, I'm still here. Where else would I be?",
];
const OUCH = [
  "Oh, brilliant. Now I'm being shot at as well.",
  "Do you mind? I'm having a really bad day.",
  "That's it. I'm writing to the Chronicle.",
  "Not now! Can't you see the car's broken down?",
  "Ow. That really doesn't help.",
  "Shoot the car if you like. It's dead anyway.",
  "Is this included in the breakdown cover?",
];
const HELLO = ["Oh, thank God. Are you from the AA?", "You're not the recovery man, are you?", "Don't suppose you've got a ten mil socket?"];

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (r: number, h: number, seg = 12) => new THREE.CylinderGeometry(r, r, h, seg);
/** A side profile (x along the vehicle, y up), extruded across its width. */
function prof(pts: number[][], depth: number) {
  const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  return new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false }).translate(0, 0, -depth / 2);
}
/** Wheels [along, across, radius, width], with hubs. */
const wheels = (at: number[][], hub = "#a7abb0"): Part[] => at.flatMap(([x, z, r, w]) => [
  [cyl(r, w, 14), "#151515", x, r, z, Math.PI / 2] as Part, [cyl(r * 0.6, w + 0.01), hub, x, r, z, Math.PI / 2] as Part,
]);
const GLASS = "#1d252c", BLACK = "#18191b", LAMP = "#e9ecee", TAIL = "#a3221b", CHROME = "#c9ccd0";

// ---- the BMW --------------------------------------------------------------------------------
const X5 = { hl: 2.46, hw: 1.0, top: 1.74, waist: 1.12 };
const X5_PAINT = "#2b3a55";   // a dark metallic blue

function bmw(lights: THREE.Material, steam: THREE.Sprite[]): THREE.Group {
  const g = new THREE.Group(), paint = new THREE.MeshLambertMaterial({ color: X5_PAINT });
  const W = 1.96;
  // the body, cut down over the engine bay where the bonnet's up
  const body = prof([[-2.46, 0.42], [2.38, 0.42], [2.46, 0.62], [2.44, 0.86], [1.22, 0.9], [1.2, 1.1], [-2.2, 1.14], [-2.46, 1.02]], W);
  const cab = [[1.2, 1.08], [0.35, 1.7], [-1.95, 1.74], [-2.36, 1.12]];
  g.add(new THREE.Mesh(model([[body, "#ffffff", 0, 0, 0], [prof([...cab, [cab[3][0], cab[0][1]]], W - 0.12), "#ffffff", 0, 0, 0]]), paint));
  g.add(new THREE.Mesh(model([
    [prof([[1.15, 1.1], [0.36, 1.66], [-1.93, 1.69], [-2.31, 1.14]], W - 0.08), GLASS, 0, 0, 0],
    [box(4.94, 0.2, W + 0.04), "#3a3d40", 0, 0.52, 0],                                                    // the black cladding round the bottom
    [box(1.15, 0.22, 1.7), "#2a2c2e", 1.82, 0.92, 0], [box(0.4, 0.12, 0.4), "#b8862b", 1.6, 1.07, 0.45],   // the engine, and a cap
    [box(0.04, 0.3, 0.3), CHROME, 2.47, 0.74, 0.19], [box(0.04, 0.3, 0.3), CHROME, 2.47, 0.74, -0.19],      // the kidney grilles
    [box(0.05, 0.24, 0.24), BLACK, 2.48, 0.74, 0.19], [box(0.05, 0.24, 0.24), BLACK, 2.48, 0.74, -0.19],
    [box(0.05, 0.1, 0.42), LAMP, 2.43, 0.84, 0.64], [box(0.05, 0.1, 0.42), LAMP, 2.43, 0.84, -0.64],
    [box(0.05, 0.12, 0.36), TAIL, -2.47, 0.98, 0.66], [box(0.05, 0.12, 0.36), TAIL, -2.47, 0.98, -0.66],
    [box(0.03, 0.11, 0.5), "#f2f2ea", 2.49, 0.5, 0], [box(0.03, 0.11, 0.5), "#e8c42a", -2.49, 0.72, 0],      // number plates
    [box(3.2, 0.04, 0.05), CHROME, -0.75, 1.76, 0.72], [box(3.2, 0.04, 0.05), CHROME, -0.75, 1.76, -0.72],   // roof rails
    [box(0.1, 0.08, 0.2), BLACK, 0.95, 1.08, 1.04], [box(0.1, 0.08, 0.2), BLACK, 0.95, 1.08, -1.04],         // door mirrors
    ...wheels([[1.5, 0.86, 0.4, 0.28], [1.5, -0.86, 0.4, 0.28], [-1.5, 0.86, 0.4, 0.28], [-1.5, -0.86, 0.4, 0.28]], "#b9bcc0"),
  ]), new THREE.MeshLambertMaterial({ vertexColors: true })));
  // the bonnet, hinged at the windscreen and propped up
  const hinge = new THREE.Group();
  hinge.position.set(1.22, 0.98, 0);
  hinge.rotation.z = 0.95;
  const lid = new THREE.Mesh(box(1.26, 0.05, W - 0.06), paint);
  lid.position.x = 0.63;
  hinge.add(lid);
  g.add(hinge);
  // the hazards, at all four corners
  g.add(new THREE.Mesh(model([
    [box(0.06, 0.07, 0.14), "#ffffff", 2.42, 0.84, 0.9], [box(0.06, 0.07, 0.14), "#ffffff", 2.42, 0.84, -0.9],
    [box(0.06, 0.08, 0.14), "#ffffff", -2.48, 1.08, 0.86], [box(0.06, 0.08, 0.14), "#ffffff", -2.48, 1.08, -0.86],
    [box(0.2, 0.05, 0.03), "#ffffff", 1.2, 0.82, 1.0], [box(0.2, 0.05, 0.03), "#ffffff", 1.2, 0.82, -1.0],      // repeaters on the wings
  ]), lights));
  // steam off the engine
  for (const s of steam) { s.position.set(1.8, 1.1, 0); g.add(s); }
  return g;
}

// ---- the recovery truck -----------------------------------------------------------------------
const CAB = { x: 2.95, hl: 1.1, top: 3.02, waist: 1.7 };   // the cab, along from the truck's middle
const BED = { x: -1.1, hl: 2.9, top: 1.32 };               // and the bed
const TRUCK_HW = 1.2, TRUCK_HL = 4.05;
const YELLOW = "#f2c318";

function truck(beacons: THREE.Material): THREE.Group {
  const g = new THREE.Group(), W = 2.4;
  const chevrons: Part[] = [];
  for (let k = 0; k < 8; k++) chevrons.push([box(0.04, 0.32, 0.28), k % 2 ? YELLOW : "#c8261e", -4.03, 0.78, -0.98 + k * 0.28]);
  const rails: Part[] = [];
  for (const z of [-1.18, 1.18]) rails.push([box(5.7, 0.1, 0.06), YELLOW, BED.x, 1.36, z]);
  g.add(new THREE.Mesh(model([
    [prof([[1.85, 0.6], [4.0, 0.6], [4.06, 1.45], [3.96, 2.98], [1.85, 3.02]], W), YELLOW, 0, 0, 0],   // the cab
    [box(0.04, 0.95, 2.1), GLASS, 4.02, 2.25, 0], [box(0.95, 0.75, W + 0.02), GLASS, 3.38, 2.3, 0],
    [box(0.05, 0.5, 1.4), "#2a2c2e", 4.06, 1.15, 0], [box(0.22, 0.36, W + 0.02), BLACK, 4.02, 0.62, 0],   // grille and bumper
    [box(0.05, 0.16, 0.36), LAMP, 4.05, 0.9, 0.85], [box(0.05, 0.16, 0.36), LAMP, 4.05, 0.9, -0.85],
    [box(0.04, 0.12, 0.52), "#f2f2ea", 4.14, 0.62, 0],
    [box(0.4, 0.1, 1.7), "#2a2c2e", 3.2, 3.08, 0],                                                       // the beacon bar's base
    [box(0.06, 0.12, 0.2), BLACK, 4.0, 2.35, 1.3], [box(0.06, 0.12, 0.2), BLACK, 4.0, 2.35, -1.3],       // mirrors
    [box(6.1, 0.32, 1.0), BLACK, -0.85, 0.82, 0],                                                       // the chassis
    [box(5.8, 0.14, W), "#7a7f84", BED.x, 1.25, 0], ...rails,                                           // the bed
    [box(0.12, 1.1, W - 0.1), "#3a3d40", 1.8, 1.85, 0],                                                  // the headboard
    [cyl(0.16, 0.9), "#5a5d60", 1.55, 1.48, 0, Math.PI / 2], [box(0.5, 0.06, 0.08), "#cdb83a", 0.95, 1.36, 0],   // the winch, and its strap
    [box(0.2, 0.18, 2.2), BLACK, -4.0, 0.78, 0], ...chevrons,                                           // the under-lift, striped
    [box(0.05, 0.14, 0.26), TAIL, -4.05, 1.02, 0.95], [box(0.05, 0.14, 0.26), TAIL, -4.05, 1.02, -0.95],
    [box(0.03, 0.12, 0.52), "#e8c42a", -4.08, 0.48, 0],
    [box(1.0, 0.08, W + 0.06), "#2a2c2e", 3.0, 1.12, 0], [box(1.9, 0.08, W + 0.06), "#2a2c2e", -2.1, 1.12, 0],   // the mudguards
    ...wheels([[3.0, 1.0, 0.5, 0.34], [3.0, -1.0, 0.5, 0.34], [-1.6, 1.0, 0.5, 0.34], [-1.6, -1.0, 0.5, 0.34],
      [-2.65, 1.0, 0.5, 0.34], [-2.65, -1.0, 0.5, 0.34]]),
  ]), new THREE.MeshLambertMaterial({ vertexColors: true })));
  g.add(new THREE.Mesh(model([
    [box(0.28, 0.16, 0.34), "#ffffff", 3.2, 3.2, 0.62], [box(0.28, 0.16, 0.34), "#ffffff", 3.2, 3.2, -0.62],
    [box(0.1, 0.12, 0.12), "#ffffff", 1.8, 2.46, 1.0], [box(0.1, 0.12, 0.12), "#ffffff", 1.8, 2.46, -1.0],   // on top of the headboard
  ]), beacons));
  // Dick Lovett Recovery on the cab doors
  const cv = document.createElement("canvas"), c = cv.getContext("2d")!;
  cv.width = 320; cv.height = 112;
  c.fillStyle = YELLOW; c.fillRect(0, 0, 320, 112);
  c.fillStyle = "#16181a"; c.font = "bold 46px Arial, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
  c.fillText("DICK LOVETT", 160, 40, 300);
  c.font = "bold 34px Arial, sans-serif"; c.fillText("RECOVERY", 160, 86, 300);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshLambertMaterial({ map: tex });
  for (const side of [1, -1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.52), mat);
    p.position.set(2.75, 1.45, side * (W / 2 + 0.01));
    p.rotation.y = side > 0 ? 0 : Math.PI;
    g.add(p);
  }
  return g;
}

// ---- the owner --------------------------------------------------------------------------------
type Mood = "pace" | "phone" | "despair" | "point" | "head";
const MOODS: Mood[] = ["pace", "phone", "despair", "point", "head", "pace", "phone"];

/** A joint: a group at (x, y, z) holding parts hung from it. */
function joint(mat: THREE.Material, x: number, y: number, parts: Part[]): THREE.Group {
  const j = new THREE.Group();
  j.position.set(x, y, 0);
  if (parts.length) j.add(new THREE.Mesh(model(parts), mat));
  return j;
}

class Owner {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private legs: THREE.Group[] = [];
  private arms: THREE.Group[] = [];   // upper arms, left then right
  private fore: THREE.Group[] = [];   // and forearms
  private phone: THREE.Mesh;
  private bubble: THREE.Sprite | null = null;
  private bubbleT = 0;
  private phase = 0;

  constructor() {
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const SKIN = "#e2b596", SHIRT = "#a9c8e8", GILET = "#1f2a44", CHINOS = "#c9b48a", SHOES = "#5a3520", HAIR = "#6b5a4a";
    this.body.add(new THREE.Mesh(model([
      [box(0.4, 0.17, 0.22), CHINOS, 0, 0.94, 0], [box(0.42, 0.06, 0.23), "#4a3020", 0, 1.03, 0],   // hips and belt
      [box(0.4, 0.46, 0.22), SHIRT, 0, 1.28, 0], [box(0.44, 0.44, 0.25), GILET, 0, 1.29, 0],         // shirt, under a quilted gilet
      ...[1.14, 1.24, 1.34].map((y) => [box(0.445, 0.015, 0.255), "#2c3958", 0, y, 0] as Part),
      [box(0.2, 0.07, 0.2), SHIRT, 0, 1.53, -0.02], [box(0.1, 0.08, 0.1), SKIN, 0, 1.58, 0],         // collar and neck
      [box(0.24, 0.27, 0.25), SKIN, 0, 1.75, 0],                                                      // head
      [box(0.25, 0.07, 0.26), HAIR, 0, 1.9, 0.01], [box(0.25, 0.16, 0.05), HAIR, 0, 1.8, 0.115],     // hair
      [box(0.2, 0.035, 0.05), BLACK, 0, 1.9, -0.1],                                                    // sunglasses up on his head
      [box(0.04, 0.03, 0.02), "#2a2020", 0.055, 1.77, -0.126], [box(0.04, 0.03, 0.02), "#2a2020", -0.055, 1.77, -0.126],
      [box(0.08, 0.02, 0.02), "#8a5a4a", 0, 1.67, -0.126],                                             // a glum mouth
    ]), mat));
    for (const side of [-1, 1]) {
      const leg = joint(mat, side * 0.1, 0.9, [[box(0.15, 0.82, 0.17), CHINOS, 0, -0.43, 0], [box(0.14, 0.08, 0.27), SHOES, 0, -0.86, -0.04]]);
      const arm = joint(mat, side * 0.27, 1.47, [[box(0.12, 0.32, 0.13), SHIRT, 0, -0.15, 0]]);
      const fore = joint(mat, 0, -0.3, [[box(0.1, 0.27, 0.11), SHIRT, 0, -0.13, 0], [box(0.09, 0.1, 0.09), SKIN, 0, -0.31, 0]]);
      arm.add(fore);
      this.legs.push(leg); this.arms.push(arm); this.fore.push(fore);
      this.body.add(leg, arm);
    }
    this.phone = new THREE.Mesh(box(0.02, 0.15, 0.075), new THREE.MeshLambertMaterial({ color: "#111214" }));
    this.phone.position.set(-0.06, -0.33, 0);
    this.fore[1].add(this.phone);
    this.body.traverse((o) => { o.castShadow = true; });
    this.root.add(this.body);
  }

  say(text: string) {
    this.unsay();
    this.bubble = speechBubble(text);
    this.bubble.position.y = 2.15;
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

  /** Stand him at (x, y, z) facing yaw (he faces -z), moving at speed, in the mood given. */
  pose(x: number, y: number, z: number, yaw: number, speed: number, mood: Mood, t: number, dt: number) {
    this.root.position.set(x, y, z);
    this.body.rotation.y = yaw;
    if (this.bubble) {
      this.bubbleT -= dt;
      if (this.bubbleT <= 0) this.unsay();
      else this.bubble.material.opacity = Math.min(1, this.bubbleT / 0.4);
    }
    this.phase += dt * speed * 4.2;
    const swing = Math.sin(this.phase) * Math.min(0.7, speed * 0.5);
    // where each joint wants to be: [upper arm about x, about z, forearm about x, about z] for each arm, left then right
    let want: number[][];
    const fidget = Math.sin(t * 1.7) * 0.08;
    if (mood === "phone") want = [[0.1, -0.08, 0.3, 0], [0.9 + fidget, -0.25, 2.7, 0]];
    else if (mood === "head") want = [[0, -2.3, 0, -1.9], [0, 2.3, 0, 1.9]];
    else if (mood === "despair") { const up = 0.45 + Math.max(0, Math.sin(t * 2.4)) * 0.35; want = [[up, -0.5, 0.9, 0], [up, 0.5, 0.9, 0]]; }
    else if (mood === "point") want = [[0.1, -0.08, 0.25, 0], [1.45 + Math.sin(t * 6) * 0.08, 0.1, 0.1, 0]];
    else want = [[-swing * 0.8, -0.06, 0.3, 0], [swing * 0.8, 0.06, 0.3, 0]];
    const k = Math.min(1, dt * 6);
    for (let s = 0; s < 2; s++) {
      const [ax, az, fx, fz] = want[s], a = this.arms[s], f = this.fore[s];
      a.rotation.x += (ax - a.rotation.x) * k; a.rotation.z += (az - a.rotation.z) * k;
      f.rotation.x += (fx - f.rotation.x) * k; f.rotation.z += (fz - f.rotation.z) * k;
    }
    this.phone.visible = mood === "phone";
    this.legs[0].rotation.x = swing; this.legs[1].rotation.x = -swing;
    this.body.position.y = Math.abs(Math.sin(this.phase)) * 0.03 * Math.min(1, speed);
    this.body.rotation.x = mood === "head" ? 0.12 : 0;   // a slump
  }
}

// ---- the whole scene --------------------------------------------------------------------------
export class Breakdown {
  private group: THREE.Group | null = null;
  private owner: Owner | null = null;
  private movers: Mover[] = [];
  private parked: Obstacle[] = [];
  private seen = -1;
  private hazards = new THREE.MeshBasicMaterial({ vertexColors: true, color: "#ffb21f" });
  private beacons = new THREE.MeshBasicMaterial({ vertexColors: true, color: "#ffb21f" });
  private steam: THREE.Sprite[] = [];
  // where he paces: the middle of his beat on the pavement, the way along it, and the car's bonnet
  private bx = 0; private bz = 0; private ux = 0; private uz = 0; private y = 0;
  private carX = 0; private carZ = 0;
  // what he's up to
  private x = 0; private z = 0; private yaw = 0; private s = 0; private goal = 0;
  private mood: Mood = "pace"; private moodT = 0; private talkT = 2; private met = false;
  private moans: string[] = []; private ouches: string[] = [];

  constructor(private map: GameMap, private scene: THREE.Scene) {}

  /** Look for the shop once a square loads, then keep him going. (px, py, pz): where you are. */
  update(dt: number, t: number, px: number, py: number, pz: number) {
    if (!this.group && this.map.tilesVersion !== this.seen) { this.seen = this.map.tilesVersion; this.find(); }
    const g = this.group, o = this.owner;
    if (!g || !o) return;
    const far = Math.hypot(px - this.bx, pz - this.bz);
    g.visible = far < 500;
    if (!g.visible) return;
    // the hazards tick on and off; the truck's beacons go round
    this.hazards.color.set(t % 0.9 < 0.45 ? "#ffb21f" : "#3a2a10");
    this.beacons.color.set(Math.sin(t * 9) > 0.2 ? "#ffb21f" : "#4a3410");
    this.steam.forEach((s, k) => {
      const f = (t * 0.35 + k / this.steam.length) % 1;
      s.position.set(1.8 + f * 0.3, 1.1 + f * 1.6, Math.sin(t + k * 2) * 0.15);
      s.scale.setScalar(0.4 + f * 1.1);
      s.material.opacity = 0.4 * Math.sin(f * Math.PI);
    });
    // what he's up to: pacing up and down, or stood still on the phone, at his wits' end
    this.moodT -= dt;
    if (this.moodT <= 0) {
      this.mood = MOODS[Math.floor(Math.random() * MOODS.length)];
      this.moodT = 4 + Math.random() * 4;
      this.goal = (Math.random() * 2 - 1) * 1.8;
    }
    let speed = 0;
    if (this.mood === "pace" || this.mood === "phone") {
      const d = this.goal - this.s, step = Math.sign(d) * Math.min(Math.abs(d), 1.1 * dt);
      this.s += step;
      speed = Math.abs(step) / Math.max(dt, 1e-3);
      if (Math.abs(d) < 0.05 && this.mood === "pace") this.goal = this.s > 0 ? -1.8 : 1.8;
    }
    this.x = this.bx + this.ux * this.s; this.z = this.bz + this.uz * this.s;
    // face where he's walking, else you if you're close, else his poor car
    const near = Math.hypot(px - this.x, pz - this.z) < 7 && Math.abs(py - this.y) < 4;
    let fx = this.carX, fz = this.carZ;
    if (speed > 0.2) { fx = this.x + this.ux * Math.sign(this.goal - this.s); fz = this.z + this.uz * Math.sign(this.goal - this.s); }
    else if (near) { fx = px; fz = pz; }
    const want = Math.atan2(-(fx - this.x), -(fz - this.z));
    let turn = want - this.yaw;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    this.yaw += turn * Math.min(1, dt * 5);
    o.pose(this.x, this.map.ground(this.x, this.z), this.z, this.yaw, speed, this.mood, t, dt);
    // and telling anyone who'll listen
    this.talkT -= dt;
    if (far < HEAR && this.talkT <= 0) {
      const first = near && !this.met;
      if (near) this.met = true;
      this.speak(first ? HELLO[Math.floor(Math.random() * HELLO.length)] : deal(this.moans, MOANS), far);
      this.talkT = BUBBLE + 1.5 + Math.random() * 4;
    }
    if (far > HEAR * 2) this.met = false;
  }

  private speak(line: string, far: number) {
    this.owner?.say(line);
    Posh.speak(line, 23, far, VOICE);
  }

  /** Where a round along the ray from o (unit d) hits him, if it does before maxD. */
  hit(o: THREE.Vector3, d: THREE.Vector3, maxD: number): number | null {
    if (!this.owner || !this.group?.visible) return null;
    // a column round him: feet to the top of his head, a little wider than his shoulders
    const ox = o.x - this.x, oz = o.z - this.z, a = d.x * d.x + d.z * d.z;
    if (a < 1e-9) return null;
    const b = ox * d.x + oz * d.z, c = ox * ox + oz * oz - 0.3 * 0.3, disc = b * b - a * c;
    if (disc < 0) return null;
    const t = (-b - Math.sqrt(disc)) / a;
    if (t < 0 || t > maxD) return null;
    const y = o.y + d.y * t - this.map.ground(this.x, this.z);
    return y >= 0 && y <= 1.95 ? t : null;
  }

  /** Someone's shot him, or thumped him. He's fine, but he isn't happy about it. */
  ouch(far: number) {
    this.mood = "despair"; this.moodT = 3;
    this.speak(deal(this.ouches, OUCH), far);
    this.talkT = BUBBLE + 2;
  }

  /** The two vehicles, as something parked for the traffic to pull round. */
  obstacles(): Obstacle[] { return this.parked; }

  /** Find the shop, and the street in front of it, and set it all out. */
  private find() {
    for (const area of this.map.areas()) {
      const shop = (area.d.sh ?? []).find((s) => SHOP.test(String(s[5])));
      if (!shop) continue;
      const sx = Number(shop[0]), sy = Number(shop[1]);
      // the nearest bit of street (not a path) to the sign
      let best: { d: number; cx: number; cy: number; dx: number; dy: number; half: number; ow: boolean } | null = null;
      for (const area2 of [area, ...this.map.tilesNear(sx, -sy, 30)]) for (const r of area2.d.rd) {
        if (PATHS.has(r.c) || r.bridge) continue;
        for (let k = 0; k < r.p.length - 1; k++) {
          const [ax, ay] = r.p[k], [bx, by] = r.p[k + 1], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
          if (L2 < 1e-6) continue;
          const f = Math.max(0, Math.min(1, ((sx - ax) * dx + (sy - ay) * dy) / L2));
          const cx = ax + dx * f, cy = ay + dy * f, d = Math.hypot(sx - cx, sy - cy);
          // the way the traffic goes (one-way streets have theirs)
          const way = (r.ow ?? 1) < 0 ? -1 : 1, L = Math.sqrt(L2);
          if (!best || d < best.d) best = { d, cx, cy, dx: (dx / L) * way, dy: (dy / L) * way, half: roadHalf(r.c, r.w), ow: !!r.ow };
        }
      }
      if (!best || best.d > 25) return;
      // the kerb on the shop's side: is the shop to the left of the traffic or the right? (On a
      // two-way street they're parked facing the way that puts the kerb on their left.)
      let left = -best.dy * (sx - best.cx) + best.dx * (sy - best.cy) > 0 ? 1 : -1;
      if (left < 0 && !best.ow) { best.dx = -best.dx; best.dy = -best.dy; left = 1; }
      const nx = -best.dy * left, ny = best.dx * left;   // across the street towards the shop (data coords)
      const a = Math.atan2(best.dy, best.dx);
      const at = (along: number, out: number) => [best!.cx + best!.dx * along + nx * out, best!.cy + best!.dy * along + ny * out];
      const g = new THREE.Group();
      // the BMW, just behind the shop's front, and the truck pulled in ahead of it
      const car = at(-1.2, best.half - X5.hw - 0.2), lorry = at(-1.2 + X5.hl + 1.6 + TRUCK_HL, best.half - TRUCK_HW - 0.15);
      for (let s = 0; s < 6; s++) {
        const cv = document.createElement("canvas"), c = cv.getContext("2d")!;
        cv.width = cv.height = 64;
        const r = c.createRadialGradient(32, 32, 2, 32, 32, 30);
        r.addColorStop(0, "rgba(240,240,240,0.9)"); r.addColorStop(1, "rgba(240,240,240,0)");
        c.fillStyle = r; c.fillRect(0, 0, 64, 64);
        this.steam.push(new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false })));
      }
      const place = (obj: THREE.Object3D, [x, y]: number[]) => {
        const gy = this.map.ground(x, -y);
        obj.position.set(x, gy, -y);
        obj.rotation.y = a;
        obj.traverse((m) => { if (m instanceof THREE.Mesh) { m.castShadow = true; m.receiveShadow = true; } });
        g.add(obj);
        return gy;
      };
      const cy = place(bmw(this.hazards, this.steam), car), ty = place(truck(this.beacons), lorry);
      const ca = Math.cos(a), sa = Math.sin(a);   // along the vehicles, in the scene: (cos a, -sin a)
      this.movers = [
        { x: car[0], z: -car[1], a, hl: X5.hl, hw: X5.hw, y: cy, top: cy + X5.top, waist: cy + X5.waist },
        { x: lorry[0] + ca * CAB.x, z: -lorry[1] - sa * CAB.x, a, hl: CAB.hl, hw: TRUCK_HW, y: ty, top: ty + CAB.top, waist: ty + CAB.waist },
        { x: lorry[0] + ca * BED.x, z: -lorry[1] - sa * BED.x, a, hl: BED.hl, hw: TRUCK_HW, y: ty, top: ty + BED.top, waist: ty + BED.top },
      ];
      this.map.movers.push(...this.movers);
      this.parked = [
        { x: car[0], z: -car[1], r: X5.hl, parked: true, a },
        { x: lorry[0], z: -lorry[1], r: TRUCK_HL, parked: true, a },
      ];
      // his beat: on the pavement by the car, between the kerb and the shop
      const beat = at(-0.5, best.half + Math.min(1.1, Math.max(0.6, (best.d - best.half) / 2)));
      this.bx = beat[0]; this.bz = -beat[1]; this.ux = ca; this.uz = -sa;
      this.y = this.map.ground(this.bx, this.bz);
      const bonnet = at(0.6, best.half - X5.hw - 0.2);
      this.carX = bonnet[0]; this.carZ = -bonnet[1];
      this.x = this.bx; this.z = this.bz;
      this.owner = new Owner();
      g.add(this.owner.root);
      this.scene.add(g);
      this.group = g;
      return;
    }
  }
}

/** The next line from a pool, dealt like a shuffled deck so none comes round again too soon. */
function deal(hand: string[], pool: string[]): string {
  if (!hand.length) hand.push(...[...pool].sort(() => Math.random() - 0.5));
  return hand.pop()!;
}
