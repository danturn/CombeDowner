// Rides: things you get about on yourself, without getting in anything. A racing bike, a BMX,
// rollerblades, a skateboard, a kick scooter, a pogo stick and a shopping trolley. Each handles
// its own way (rideSpecs below; the riding itself is in player.ts): a bike flies along the roads
// but bogs down on grass, a BMX jumps walls, a skateboard picks up speed downhill and stops dead on
// rough ground, a pogo stick bounces over fences, and a trolley steers like a shopping trolley.
// You carry one at a time, and X gets you on and off it. Pick one up off the street (pickups.ts:
// trolleys outside the shops), or get one for a job well done (quests.ts).
//
// A mate can climb into the basket of your trolley (E by it) and ride along, shooting.
//
// Who decides what: you ride yourself, like walking, and say what you're on in your position
// updates (as a number: RIDES's place, plus one; IN_TROLLEY for someone in a trolley's basket).
// Everyone draws everyone else's ride from that. Hitting a wall too fast throws you off: you tell
// the host how hard, and it takes it as damage from "a wall", as it would a fall.
import * as THREE from "three";

export type RideKind = "bike" | "bmx" | "blades" | "board" | "scooter" | "pogo" | "trolley";
/** Every ride, in the order they're numbered over the network: add to the end. */
export const RIDES: RideKind[] = ["bike", "bmx", "blades", "board", "scooter", "pogo", "trolley"];
/** The number for someone riding in a trolley's basket. */
export const IN_TROLLEY = 99;
export const rideCode = (k: RideKind | null) => (k ? RIDES.indexOf(k) + 1 : 0);
export const rideOf = (n: number): RideKind | null => RIDES[n - 1] ?? null;

export interface RideSpec {
  name: string;          // "a BMX"
  top: number;           // top speed pedalling or pushing on a hard surface, m/s
  rough: number;         // and on grass and dirt
  accel: number;         // m/s each second, pushing on
  brake: number;         // m/s each second, braking
  back: number;          // how fast it'll go backwards (0: it won't)
  coast: number;         // how quickly it slows on the flat with nobody pushing, per second
  turn: number;          // how fast it can turn at speed, radians a second
  downhill: number;      // how much a slope speeds it up or slows it down (1: all of gravity)
  maxDown: number;       // the fastest it'll go downhill, m/s
  jump: number;          // Space: up at this speed (0: no jumping)
  hop: number;           // rides over a wall or kerb up to this high without stopping
  lift: number;          // stands your eyes this much higher (a bike's pedals)
  crash: number;         // hitting something at this speed or more throws you off
  pogo?: boolean;        // bounces all the time instead of rolling
  wobble?: number;       // a trolley's wonky wheel pulls it off line
  line: string;          // what's said when you get it
}

export const rideSpecs: Record<RideKind, RideSpec> = {
  bike: { name: "a racing bike", top: 13.5, rough: 5, accel: 4.2, brake: 10, back: 0, coast: 0.05, turn: 2.2, downhill: 0.75, maxDown: 19, jump: 4.4, hop: 0.25, lift: 0.32, crash: 9.5, line: "Racing bike: flies on the roads, hates the grass. X to get on" },
  bmx: { name: "a BMX", top: 10.5, rough: 8, accel: 5.5, brake: 10, back: 0, coast: 0.12, turn: 3, downhill: 0.65, maxDown: 15, jump: 7.4, hop: 1.2, lift: 0.26, crash: 12, line: "BMX: Space to jump, and it'll hop low walls. X to get on" },
  blades: { name: "rollerblades", top: 10.5, rough: 2.5, accel: 4.2, brake: 7, back: 2.5, coast: 0.1, turn: 3.4, downhill: 0.8, maxDown: 16, jump: 6.2, hop: 0.3, lift: 0.1, crash: 9, line: "Rollerblades: quick on the pavements, hopeless on grass. X to put them on" },
  board: { name: "a skateboard", top: 9.5, rough: 1.4, accel: 2.6, brake: 5, back: 0, coast: 0.05, turn: 2.1, downhill: 1, maxDown: 18, jump: 5.6, hop: 0.3, lift: 0.12, crash: 8.5, line: "Skateboard: picks up speed downhill, Space to ollie. X to get on" },
  scooter: { name: "a kick scooter", top: 7.6, rough: 3.2, accel: 8, brake: 10, back: 1.5, coast: 0.3, turn: 4.6, downhill: 0.55, maxDown: 12, jump: 3.6, hop: 0.25, lift: 0.12, crash: 10, line: "Kick scooter: off the mark in no time, turns on a sixpence. X to get on" },
  pogo: { name: "a pogo stick", top: 5.2, rough: 5.2, accel: 9, brake: 9, back: 3, coast: 0, turn: 9, downhill: 0, maxDown: 8, jump: 9.6, hop: 0, lift: 0.38, crash: 99, pogo: true, line: "Pogo stick: hold Space for a big bounce over walls. X to get on" },
  trolley: { name: "a shopping trolley", top: 8.5, rough: 2, accel: 3, brake: 6, back: 2, coast: 0.06, turn: 1.25, downhill: 1, maxDown: 19, jump: 0, hop: 0.16, lift: 0, crash: 10, wobble: 0.35, line: "Shopping trolley: rockets downhill, and a mate can ride in it (E). X to push it" },
};

// ---- models ---------------------------------------------------------------------------------------
// Each is built standing on the ground at its middle, facing -z (the way you go).

const mats = new Map<string, THREE.MeshLambertMaterial>();
const mat = (c: string) => mats.get(c) ?? mats.set(c, new THREE.MeshLambertMaterial({ color: c })).get(c)!;
function add(g: THREE.Object3D, geo: THREE.BufferGeometry, c: string, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat(c));
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  g.add(m);
  return m;
}
/** A thin tube from a to b. */
function rod(g: THREE.Object3D, a: [number, number, number], b: [number, number, number], r: number, c: string) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b), len = va.distanceTo(vb);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6), mat(c));
  m.position.copy(va).add(vb).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  m.castShadow = true;
  g.add(m);
  return m;
}
/** A wheel on its side across the x axis, named so it can spin. */
function wheel(g: THREE.Object3D, r: number, tube: number, x: number, y: number, z: number, tyre = "#1b1b1d", hub = "#b8bcc2") {
  const w = new THREE.Group();
  w.position.set(x, y, z); w.name = "wheel";
  const t = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 6, 18).rotateY(Math.PI / 2), mat(tyre));
  t.castShadow = true;
  w.add(t);
  for (let k = 0; k < 3; k++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.008, r * 2, 0.008), mat(hub));
    s.rotation.x = (k / 3) * Math.PI;
    w.add(s);
  }
  g.add(w);
  return w;
}

function bike(bmx: boolean): THREE.Group {
  const g = new THREE.Group();
  const r = bmx ? 0.25 : 0.34, base = bmx ? 0.42 : 0.52, frame = bmx ? "#1f6fd1" : "#c8202a";
  wheel(g, r, bmx ? 0.045 : 0.022, 0, r, -base, "#1b1b1d", bmx ? "#e8e8e8" : "#b8bcc2");
  wheel(g, r, bmx ? 0.045 : 0.022, 0, r, base, "#1b1b1d", bmx ? "#e8e8e8" : "#b8bcc2");
  const top = bmx ? 0.62 : 0.86, seatY = bmx ? 0.78 : 1.0;
  const bb: [number, number, number] = [0, r * 0.95, 0.02], head: [number, number, number] = [0, top, -base + 0.12], seat: [number, number, number] = [0, top - 0.02, base - 0.28];
  rod(g, bb, head, 0.022, frame); rod(g, bb, seat, 0.022, frame); rod(g, seat, head, 0.02, frame);
  rod(g, bb, [0, r, base], 0.016, frame); rod(g, seat, [0, r, base], 0.014, frame);
  rod(g, head, [0, r, -base], 0.018, "#b8bcc2");
  rod(g, seat, [0, seatY, base - 0.3], 0.014, "#b8bcc2");
  add(g, new THREE.BoxGeometry(0.13, 0.04, 0.26), "#1b1b1d", 0, seatY + 0.02, base - 0.32);
  const bar = bmx ? 0.98 : 0.98;
  rod(g, head, [0, bar, -base + 0.08], 0.016, "#b8bcc2");
  rod(g, [-(bmx ? 0.32 : 0.21), bar, -base + 0.06], [bmx ? 0.32 : 0.21, bar, -base + 0.06], 0.016, bmx ? "#1b1b1d" : "#e8e8e8");
  if (!bmx) for (const s of [-1, 1]) rod(g, [s * 0.21, bar, -base + 0.06], [s * 0.21, bar - 0.12, -base - 0.06], 0.016, "#e8e8e8");
  // pedals
  rod(g, [-0.16, r * 0.95, 0.02], [0.16, r * 0.95, 0.02], 0.012, "#2a2a2a");
  return g;
}

function blades(): THREE.Group {
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    add(g, new THREE.BoxGeometry(0.11, 0.16, 0.28), "#1d1d20", s * 0.13, 0.15, -0.02);
    add(g, new THREE.BoxGeometry(0.115, 0.05, 0.12), "#2bb3c0", s * 0.13, 0.27, 0.06);
    add(g, new THREE.BoxGeometry(0.03, 0.03, 0.3), "#8a8d93", s * 0.13, 0.065, -0.02);
    for (let k = 0; k < 4; k++) wheel(g, 0.035, 0.012, s * 0.13, 0.04, -0.13 + k * 0.075, "#e8e030", "#e8e030");
  }
  return g;
}

function board(): THREE.Group {
  const g = new THREE.Group();
  add(g, new THREE.BoxGeometry(0.21, 0.02, 0.8), "#2b2b2e", 0, 0.1, 0);
  add(g, new THREE.BoxGeometry(0.2, 0.005, 0.78), "#e2552a", 0, 0.088, 0);
  for (const z of [-0.27, 0.27]) {
    add(g, new THREE.BoxGeometry(0.16, 0.03, 0.05), "#b8bcc2", 0, 0.075, z);
    for (const s of [-1, 1]) wheel(g, 0.03, 0.014, s * 0.09, 0.035, z, "#f2efe0", "#f2efe0");
  }
  return g;
}

function scooter(): THREE.Group {
  const g = new THREE.Group();
  add(g, new THREE.BoxGeometry(0.13, 0.03, 0.56), "#5fd04a", 0, 0.09, 0.02);
  wheel(g, 0.07, 0.02, 0, 0.07, -0.3, "#1b1b1d", "#5fd04a");
  wheel(g, 0.07, 0.02, 0, 0.07, 0.3, "#1b1b1d", "#5fd04a");
  rod(g, [0, 0.08, -0.3], [0, 0.98, -0.26], 0.018, "#b8bcc2");
  rod(g, [-0.22, 0.98, -0.26], [0.22, 0.98, -0.26], 0.016, "#1b1b1d");
  return g;
}

function pogo(): THREE.Group {
  const g = new THREE.Group();
  rod(g, [0, 0.02, -0.12], [0, 1.1, -0.18], 0.02, "#b8bcc2");
  const spring = add(g, new THREE.CylinderGeometry(0.045, 0.045, 0.28, 10), "#e03a3a", 0, 0.24, -0.13);
  spring.name = "spring";
  rod(g, [-0.16, 0.36, -0.13], [0.16, 0.36, -0.13], 0.018, "#1b1b1d");
  rod(g, [-0.18, 1.08, -0.18], [0.18, 1.08, -0.18], 0.018, "#1b1b1d");
  add(g, new THREE.CylinderGeometry(0.03, 0.03, 0.04, 8), "#1b1b1d", 0, 0.02, -0.12);
  return g;
}

/** A supermarket trolley: a wire basket on four castors, pushed from the handle at the back. */
function trolley(): THREE.Group {
  const g = new THREE.Group();
  const wire = "#c9ced6", W = 0.28, y0 = 0.46, y1 = 0.98, zf = -0.48, zb = 0.42;
  // the basket's corners and rims
  for (const s of [-1, 1]) {
    rod(g, [s * W, y0, zf], [s * W, y0, zb], 0.012, wire);
    rod(g, [s * W * 0.85, y1, zf - 0.04], [s * W, y1, zb], 0.012, wire);
    rod(g, [s * W, y0, zf], [s * W * 0.85, y1, zf - 0.04], 0.012, wire);
    rod(g, [s * W, y0, zb], [s * W, y1, zb], 0.012, wire);
    for (let k = 1; k < 5; k++) { const z = zf + ((zb - zf) * k) / 5; rod(g, [s * W, y0, z], [s * W * 0.95, y1, z], 0.006, wire); }
    // the legs down to the castors
    rod(g, [s * W, y0, zf + 0.05], [s * 0.24, 0.08, zf + 0.02], 0.012, wire);
    rod(g, [s * W, y0, zb], [s * 0.26, 0.08, zb + 0.04], 0.012, wire);
    wheel(g, 0.06, 0.018, s * 0.24, 0.06, zf + 0.02, "#3a3a3e");
    wheel(g, 0.06, 0.018, s * 0.26, 0.06, zb + 0.04, "#3a3a3e");
  }
  for (const [y, z] of [[y0, zf], [y1, zf - 0.04], [y0, zb]] as const) rod(g, [-W, y, z], [W, y, z], 0.012, wire);
  for (let k = -3; k <= 3; k++) rod(g, [k * W / 3.2, y0, zf], [k * W / 3.2, y0, zb], 0.006, wire);
  // the handle, in the shop's colours
  rod(g, [-W, y1 + 0.05, zb + 0.08], [W, y1 + 0.05, zb + 0.08], 0.022, "#1c6fd6");
  for (const s of [-1, 1]) rod(g, [s * W, y1, zb], [s * W, y1 + 0.05, zb + 0.08], 0.012, wire);
  return g;
}

/** Where the trolley stands from whoever's pushing it: out in front of them. */
export const TROLLEY_AHEAD = 0.95;

const builders: Record<RideKind, () => THREE.Group> = {
  bike: () => bike(false), bmx: () => bike(true), blades, board, scooter, pogo, trolley,
};
/** A ride's model, for the street (pickups.ts) or under someone. */
export function rideModel(kind: RideKind): THREE.Group { return builders[kind](); }

/**
 * Someone's ride, drawn under them: it points the way they're going, its wheels go round and a
 * pogo stick's spring squashes as they land. Shopping trolleys go out in front of whoever's pushing.
 */
export class RideView {
  readonly root = new THREE.Group();
  private kind: RideKind | null = null;
  private model: THREE.Group | null = null;
  private wheels: THREE.Object3D[] = [];
  private spin = 0;
  heading = 0;

  constructor(scene: THREE.Scene) { scene.add(this.root); this.root.visible = false; }

  set(kind: RideKind | null) {
    if (kind === this.kind) return;
    this.kind = kind;
    if (this.model) this.root.remove(this.model);
    this.model = kind ? rideModel(kind) : null;
    this.wheels = [];
    if (this.model) {
      if (kind === "trolley") this.model.position.z = -TROLLEY_AHEAD;
      this.root.add(this.model);
      this.model.traverse((o) => { if (o.name === "wheel") this.wheels.push(o); });
    }
    this.root.visible = !!kind;
  }

  /** Feet at (x, y, z) on the ground at ground, going at speed the way heading points. */
  pose(x: number, y: number, z: number, ground: number, heading: number, speed: number, dt: number) {
    if (!this.kind) return;
    const s = rideSpecs[this.kind];
    this.heading = heading;
    // a bike and a pogo stick stand you up off the ground; the rest roll along it
    this.root.position.set(x, s.pogo ? y : this.kind === "trolley" ? ground : y, z);
    this.root.rotation.y = heading;
    this.spin += speed * dt * 3;
    for (const w of this.wheels) w.rotation.x = -this.spin;
    if (s.pogo) {
      const spring = this.model?.getObjectByName("spring");
      const air = y - ground;
      if (spring) spring.scale.y = Math.max(0.45, Math.min(1.2, 0.5 + air * 1.5));
    }
  }

  dispose() { this.root.parent?.remove(this.root); }
}
