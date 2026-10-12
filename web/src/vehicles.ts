// Vehicles you can drive: a 1990s Badgerline double-decker, Ford Escort XR3is and Reliant Robins,
// parked along The Firs (the cars that were parked there, swapped for ones with keys in), and every
// other parked car in the place, which stays street furniture until someone gets in it. E gets in
// and out: at the wheel if nobody's driving, else in a free seat to ride along. W and S drive, A and D
// steer, Space is the handbrake (with some lock on it kicks the back end out for donuts: keep the
// throttle and the lock on and it keeps going round) and H (or a click) the horn. They
// block like walls, rounds go through their windows, and anyone you hit at speed goes under. Take a
// Robin round a corner too fast and it goes over on its side.
//
// Who decides what: whoever's driving a vehicle moves it and sends where it is about 20 times a
// second. The host decides who gets in (the first to ask) and sends round who's driving what and
// where everything's parked. Everyone builds the same vehicles in the same places from the map.
import * as THREE from "three";
import { CAR_PAINT, carGeometry, model, Part } from "./furniture";
import { GameMap, Mover } from "./map";

export type VKind = "bus" | "xr3i" | "robin" | "car";

interface Spec {
  name: string;                   // as the HUD says it
  L: number; W: number; H: number;
  waist: number;                  // rounds go over this, through the windows
  wb: number;                     // wheelbase
  top: number;                    // top speed, m/s
  accel: number; brake: number; rev: number;   // m/s², m/s², top speed backwards
  steer: number;                  // full lock, radians
  grip: number;                   // cornering, m/s², before it starts to slide
  donut: number;                  // how fast it spins round in a donut at full lock, rad/s
  tip?: number;                   // cornering that rolls it over (the Robin)
  lean: number;                   // how far the body rolls in a corner
  seat: [number, number, number]; // driver's feet: along, up, across (+ is right: they're right-hand drive)
  seats: [number, number, number][];   // everyone else's, the same way
  cam: number;                    // how far back the chase camera sits
  mass: number;                   // how hard it hits people
  gears: number[];                // top of each gear, as a share of top speed
  engine: "diesel" | "petrol" | "tinny";
}

export const SPECS: Record<VKind, Spec> = {
  bus: {
    name: "Badgerline bus", L: 9.6, W: 2.5, H: 4.3, waist: 1.35, wb: 5.4, top: 20, accel: 2.3, brake: 7, rev: 4,
    steer: 0.62, grip: 5, donut: 0.8, lean: 0.006, seat: [3.95, 0.85, 0.62],
    // the front of the top deck first, as anyone would
    seats: [[3.9, 2.4, -0.6], [3.9, 2.4, 0.6], [2.9, 2.4, -0.6], [2.9, 2.4, 0.6], [1.9, 2.4, -0.6], [1.9, 2.4, 0.6], [2.4, 0.85, -0.6], [2.4, 0.85, 0.6], [1.2, 0.85, -0.6], [1.2, 0.85, 0.6]],
    cam: 13, mass: 2.4, gears: [0.25, 0.5, 0.75, 1], engine: "diesel",
  },
  xr3i: {
    name: "Ford Escort XR3i", L: 4.05, W: 1.64, H: 1.36, waist: 0.86, wb: 2.4, top: 42, accel: 6.5, brake: 11, rev: 7,
    steer: 0.6, grip: 10, donut: 2.8, lean: 0.005, seat: [-0.25, 0.05, 0.36], seats: [[-0.25, 0.05, -0.36], [-1.1, 0.05, 0.36], [-1.1, 0.05, -0.36]], cam: 6.5, mass: 1, gears: [0.2, 0.38, 0.58, 0.8, 1], engine: "petrol",
  },
  car: {   // any other parked car, out of the street furniture
    name: "car", L: 4.16, W: 1.76, H: 1.44, waist: 0.98, wb: 2.6, top: 38, accel: 5.5, brake: 10, rev: 7,
    steer: 0.6, grip: 9.5, donut: 2.6, lean: 0.006, seat: [-0.35, 0.05, 0.4], seats: [[-0.35, 0.05, -0.4], [-1.15, 0.05, 0.4], [-1.15, 0.05, -0.4]],
    cam: 6.5, mass: 1, gears: [0.2, 0.38, 0.58, 0.8, 1], engine: "petrol",
  },
  robin: {
    name: "Reliant Robin", L: 3.35, W: 1.43, H: 1.4, waist: 0.86, wb: 2.15, top: 30, accel: 4.6, brake: 8, rev: 6,
    steer: 0.62, grip: 9, donut: 2.4, tip: 6.5, lean: 0.008, seat: [-0.2, 0.05, 0.32], seats: [[-0.2, 0.05, -0.32], [-0.95, 0.05, 0.3], [-0.95, 0.05, -0.3]], cam: 6, mass: 0.8, gears: [0.24, 0.48, 0.74, 1], engine: "tinny",
  },
};

const XR3I_PAINT = ["#f0f0ea", "#b3141b", "#1b1c1f", "#a8adb2", "#1f4c86"];        // Diamond White, Radiant Red, black, Strato Silver, Caspian Blue
const ROBIN_PAINT = ["#e2b42a", "#8fb5d2", "#c9632a", "#7b5333", "#d6cdb0", "#8aa23c"];
const GREEN = "#2f7a3a", YELLOW = "#f2c318";   // Badgerline
// what the parked cars are, in the HUD
const MAKES = ["Ford Fiesta", "Vauxhall Corsa", "Volkswagen Golf", "Ford Focus", "Vauxhall Astra", "Nissan Micra", "Toyota Yaris", "Peugeot 206", "Renault Clio", "Honda Jazz"];
const DELAY = 110;                              // ms behind real time, as for other players

/** What the keys or the stick are doing to a vehicle. */
export interface Controls { throttle: number; steer: number; handbrake: boolean; horn: boolean }

// ---- models ---------------------------------------------------------------------------------
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const wheel = (r: number, w: number) => new THREE.CylinderGeometry(r, r, w, 14);
/** A side profile (x along the car, y up), extruded across its width. */
function prof(pts: number[][], depth: number) {
  const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  return new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false }).translate(0, 0, -depth / 2);
}
/**
 * Glass for a cabin [front foot, front top, rear top, rear foot]: just outside its windscreen and
 * rear window, and just under its roof, so it shows at the front, back and sides but not on top.
 */
function glass(cab: number[][], e = 0.04, t = 0.05): number[][] {
  const [A, B, C, D] = cab, yT = Math.min(B[1], C[1]) - t;
  const f = (yT - A[1]) / (B[1] - A[1]), r = (yT - D[1]) / (C[1] - D[1]);
  return [[A[0] + e, A[1]], [A[0] + e + (B[0] - A[0]) * f, yT], [D[0] - e + (C[0] - D[0]) * r, yT], [D[0] - e, D[1]]];
}
const wheels = (at: number[][], col = "#151515", hub = "#a7abb0"): Part[] => at.flatMap(([x, z, r, w]) => [
  [wheel(r, w), col, x, r, z, Math.PI / 2] as Part, [wheel(r * 0.6, w + 0.01), hub, x, r, z, Math.PI / 2] as Part,
]);

/** Paint (one colour) and trim (its own colours). Local axes: +x forward, +y up, +z to the right. */
function carModel(kind: "xr3i" | "robin"): [THREE.BufferGeometry, THREE.BufferGeometry] {
  if (kind === "xr3i") {
    const cab = [[0.95, 0.78], [0.12, 1.33], [-0.85, 1.35], [-1.92, 0.88]];
    const paint = model([
      [prof([[-2.0, 0.28], [1.98, 0.28], [2.03, 0.5], [2.0, 0.68], [0.9, 0.8], [-1.6, 0.86], [-2.0, 0.8]], 1.64), "#fff", 0, 0, 0],
      [prof([...cab, [-1.92, 0.78]], 1.5), "#fff", 0, 0, 0],
    ]);
    const trim = model([
      [prof(glass(cab), 1.54), "#1d252c", 0, 0, 0],
      [box(0.14, 0.2, 1.66), "#18191b", 1.98, 0.4, 0], [box(0.14, 0.2, 1.66), "#18191b", -1.98, 0.42, 0],   // bumpers
      [box(3.0, 0.07, 1.67), "#18191b", 0, 0.55, 0],                                                        // rubbing strips
      [box(0.3, 0.06, 1.46), "#18191b", -1.72, 1.0, 0],                                                     // the spoiler
      [box(0.04, 0.12, 0.7), "#101112", 2.02, 0.6, 0],                                                      // grille
      [box(0.04, 0.13, 0.36), "#e9ecee", 2.01, 0.61, 0.55], [box(0.04, 0.13, 0.36), "#e9ecee", 2.01, 0.61, -0.55],
      [box(0.04, 0.1, 0.1), "#f4f2d8", 2.06, 0.4, 0.4], [box(0.04, 0.1, 0.1), "#f4f2d8", 2.06, 0.4, -0.4],   // driving lamps
      [box(0.04, 0.14, 0.38), "#a3221b", -2.01, 0.72, 0.55], [box(0.04, 0.14, 0.38), "#a3221b", -2.01, 0.72, -0.55],
      [box(0.03, 0.11, 0.5), "#f2f2ea", 2.06, 0.4, 0], [box(0.03, 0.11, 0.5), "#e8c42a", -2.06, 0.57, 0],    // plates
      ...wheels([[1.2, 0.74, 0.29, 0.2], [1.2, -0.74, 0.29, 0.2], [-1.2, 0.74, 0.29, 0.2], [-1.2, -0.74, 0.29, 0.2]]),
    ]);
    return [paint, trim];
  }
  const cab = [[0.72, 0.75], [0.12, 1.38], [-1.0, 1.4], [-1.62, 0.8]];
  const paint = model([
    [prof([[-1.65, 0.27], [1.5, 0.27], [1.68, 0.48], [1.64, 0.6], [0.72, 0.76], [-1.6, 0.82], [-1.67, 0.62]], 1.43), "#fff", 0, 0, 0],
    [prof([...cab, [-1.62, 0.74]], 1.33), "#fff", 0, 0, 0],
  ]);
  const trim = model([
    [prof(glass(cab), 1.37), "#1d252c", 0, 0, 0],
    [box(0.08, 0.12, 1.3), "#b9bdbf", 1.67, 0.4, 0], [box(0.08, 0.12, 1.3), "#b9bdbf", -1.67, 0.42, 0],    // bumpers
    [box(0.04, 0.16, 0.16), "#eef0e8", 1.62, 0.6, 0.5], [box(0.04, 0.16, 0.16), "#eef0e8", 1.62, 0.6, -0.5],
    [box(0.04, 0.12, 0.2), "#b02a20", -1.68, 0.68, 0.52], [box(0.04, 0.12, 0.2), "#b02a20", -1.68, 0.68, -0.52],
    [box(0.03, 0.11, 0.46), "#f2f2ea", 1.71, 0.4, 0], [box(0.03, 0.11, 0.46), "#e8c42a", -1.71, 0.56, 0],
    ...wheels([[1.1, 0, 0.25, 0.16], [-1.05, 0.62, 0.25, 0.16], [-1.05, -0.62, 0.25, 0.16]], "#151515", "#c9cccf"),
  ]);
  return [paint, trim];
}

/** One side of the bus, front at the right end (or the left: the nearside, with the door). */
function busSide(frontRight: boolean): THREE.CanvasTexture {
  const S = SPECS.bus, k = 1024 / S.L, w = 1024, h = Math.round((S.H - 0.45) * k);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d")!;
  const X = (along: number) => (frontRight ? along : S.L - along) * k;   // along: metres from the back
  const Y = (up: number) => (S.H - up) * k;
  const rect = (a0: number, a1: number, u0: number, u1: number, col: string) => {
    g.fillStyle = col;
    const x0 = X(a0), x1 = X(a1);
    g.fillRect(Math.min(x0, x1), Y(u1), Math.abs(x1 - x0), (u1 - u0) * k);
  };
  rect(0, S.L, 0.45, S.H, YELLOW);
  rect(0, S.L, 0.45, 1.38, GREEN);
  rect(0, S.L, 1.38, 1.42, "#1b3b20");
  // windows: dark glass between yellow pillars, a door on the nearside at the front
  for (let a = 0.35; a < 8.4; a += 1.35) rect(a, Math.min(a + 1.2, 8.55), 1.48, 2.3, "#25313a");
  rect(8.7, 9.4, 1.48, 2.3, "#25313a");
  if (!frontRight) { rect(8.15, 9.25, 0.5, 2.3, "#1d262d"); rect(8.68, 8.72, 0.5, 2.3, YELLOW); }
  for (let a = 0.3; a < 9.2; a += 1.48) rect(a, Math.min(a + 1.33, 9.35), 2.88, 3.7, "#25313a");
  // the wheel arches
  g.fillStyle = "#141516";
  for (const along of [S.L / 2 - 2.8, S.L / 2 + 2.6]) {
    g.beginPath(); g.arc(X(along), Y(0.5), 0.62 * k, Math.PI, 0); g.fill();
  }
  // the fleetname between the decks, with a badger's head (white face, black stripes) beside it
  const cx = X(S.L * 0.52);
  g.fillStyle = GREEN; g.textAlign = "center"; g.textBaseline = "middle";
  g.font = `italic 800 ${Math.round(0.36 * k)}px "Helvetica Neue", Arial, sans-serif`;
  g.fillText("Badgerline", cx, Y(2.58));
  const bx = cx + (frontRight ? -1 : 1) * 2.25 * k, by = Y(2.58);
  g.fillStyle = "#f8f8f4"; g.beginPath(); g.ellipse(bx, by, 0.3 * k, 0.2 * k, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#151515";
  for (const s of [-1, 1]) { g.beginPath(); g.ellipse(bx, by + s * 0.09 * k, 0.28 * k, 0.05 * k, 0, 0, Math.PI * 2); g.fill(); }
  g.font = `700 ${Math.round(0.14 * k)}px "Helvetica Neue", Arial, sans-serif`;
  g.fillStyle = "#f4f1e6";
  g.fillText("8607", X(S.L - 1.2), Y(0.95));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** The front (with the destination blind) or the back of the bus. */
function busEnd(front: boolean): THREE.CanvasTexture {
  const S = SPECS.bus, k = 1024 / S.L, w = Math.round(S.W * k), h = Math.round((S.H - 0.45) * k);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d")!;
  const Y = (up: number) => (S.H - up) * k;
  const rect = (x0: number, x1: number, u0: number, u1: number, col: string) => { g.fillStyle = col; g.fillRect(x0 * k, Y(u1), (x1 - x0) * k, (u1 - u0) * k); };
  rect(0, S.W, 0.45, S.H, YELLOW);
  rect(0, S.W, 0.45, 1.38, GREEN);
  if (front) {
    rect(0.08, 1.22, 1.45, 2.38, "#25313a"); rect(1.28, 2.42, 1.45, 2.38, "#25313a");   // windscreen
    rect(0.25, 2.25, 2.45, 2.76, "#0d0d0d");                                              // destination blind
    g.fillStyle = "#ffb52a"; g.textAlign = "center"; g.textBaseline = "middle";
    g.font = `700 ${Math.round(0.2 * k)}px "Helvetica Neue", Arial, sans-serif`;
    g.fillText("2  COMBE DOWN", (S.W / 2) * k, Y(2.6));
    rect(0.1, 1.2, 2.86, 3.7, "#25313a"); rect(1.3, 2.4, 2.86, 3.7, "#25313a");
    rect(0.7, 1.8, 0.55, 1.15, "#16181a");                                                // grille
    rect(0.1, 0.5, 0.7, 0.9, "#eef0e6"); rect(2.0, 2.4, 0.7, 0.9, "#eef0e6");             // headlights
    rect(0.95, 1.55, 0.47, 0.57, "#f2f2ea");                                              // plate
  } else {
    for (let u = 0.6; u < 1.3; u += 0.12) rect(0.4, 2.1, u, u + 0.05, "#16181a");        // engine louvres
    rect(0.3, 2.2, 2.9, 3.6, "#25313a");
    rect(0.1, 0.35, 0.7, 1.1, "#b02a20"); rect(2.15, 2.4, 0.7, 1.1, "#b02a20");          // tail lights
    rect(0.95, 1.55, 1.45, 1.57, "#e8c42a");                                              // plate
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let busMats: THREE.Material[] | null = null;
let trimMat: THREE.Material | null = null;
const models = new Map<string, [THREE.BufferGeometry, THREE.BufferGeometry]>();

function buildBody(kind: VKind, paint: string): THREE.Group {
  const g = new THREE.Group();
  trimMat ??= new THREE.MeshLambertMaterial({ vertexColors: true });
  if (kind === "bus") {
    const S = SPECS.bus;
    busMats ??= [
      new THREE.MeshLambertMaterial({ map: busEnd(true) }), new THREE.MeshLambertMaterial({ map: busEnd(false) }),
      new THREE.MeshLambertMaterial({ color: "#e9c11c" }), new THREE.MeshLambertMaterial({ color: "#1a1b1c" }),
      new THREE.MeshLambertMaterial({ map: busSide(true) }), new THREE.MeshLambertMaterial({ map: busSide(false) }),
    ];
    const body = new THREE.Mesh(box(S.L, S.H - 0.45, S.W), busMats);
    body.position.y = 0.45 + (S.H - 0.45) / 2;
    const f = S.L / 2;
    const trim = new THREE.Mesh(model([
      [box(0.12, 0.32, S.W + 0.02), "#18191b", f + 0.02, 0.6, 0], [box(0.12, 0.32, S.W + 0.02), "#18191b", -f - 0.02, 0.6, 0],
      [box(0.06, 0.06, 0.3), "#18191b", f - 0.1, 2.35, 1.38], [box(0.06, 0.06, 0.3), "#18191b", f - 0.1, 2.35, -1.38],   // mirror arms
      [box(0.08, 0.4, 0.22), "#18191b", f - 0.05, 2.15, 1.55], [box(0.08, 0.4, 0.22), "#18191b", f - 0.05, 2.15, -1.55],
      ...wheels([[2.6, 1.12, 0.5, 0.3], [2.6, -1.12, 0.5, 0.3], [-2.8, 1.12, 0.5, 0.3], [-2.8, -1.12, 0.5, 0.3]], "#151515", "#8d9196"),
    ]), trimMat);
    g.add(body, trim);
  } else if (kind === "car") {
    g.add(new THREE.Mesh(carGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true, color: paint })));
  } else {
    let geo = models.get(kind);
    if (!geo) models.set(kind, (geo = carModel(kind)));
    g.add(new THREE.Mesh(geo[0], new THREE.MeshLambertMaterial({ color: paint })), new THREE.Mesh(geo[1], trimMat));
  }
  g.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
  return g;
}

/** Someone sat at the wheel: shoulders and a head, where their hitboxes are. */
function driverFigure(): [THREE.Group, THREE.MeshLambertMaterial] {
  const cloth = new THREE.MeshLambertMaterial({ color: "#888" });
  const torso = new THREE.Mesh(box(0.42, 0.5, 0.32), cloth);
  torso.position.y = 0.7;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), new THREE.MeshLambertMaterial({ color: "#c79a7a" }));
  head.position.y = 1.07;
  const g = new THREE.Group();
  g.add(torso, head);
  g.visible = false;
  return [g, cloth];
}

// ---- one vehicle ----------------------------------------------------------------------------
interface Snap { t: number; x: number; z: number; a: number; vx: number; vz: number; steer: number; tip: number; flags: number }

export class Vehicle implements Mover {
  readonly spec: Spec;
  x = 0; z = 0; a = 0; y = 0; top = 0; waist = 0;
  readonly hl: number; readonly hw: number;
  vx = 0; vz = 0;                  // velocity, scene coords
  steer = 0;                       // -1..1, + is left
  spin = 0;                        // how fast it's turning, rad/s: + is left
  /** Doing donuts: the back end's out and it keeps coming round while you hold the lock and the throttle. */
  drift = false;
  /** On its side (the Robin, cornering too hard): -1 or 1, which way it went; 0 on its wheels. */
  tip = 0;
  /** Who's driving it, or "". */
  driver = "";
  /** Who's in each of its other seats, or "". */
  readonly riders: string[];
  horn = false; gas = 0; hand = false;
  /** 0 ticking over .. 1 flat out, for the engine's note. */
  rpm = 0.2;
  /** Set for a frame when it hits something: how hard, in m/s. */
  impact = 0;
  /** Set for a frame when it goes over. */
  flipped = false;
  readonly root = new THREE.Group();
  private body: THREE.Group;
  private figure: THREE.Group;
  private figMat: THREE.MeshLambertMaterial;
  private riderFigs: [THREE.Group, THREE.MeshLambertMaterial][] = [];
  private lean = 0;                // body roll in corners, and a Robin teetering on two wheels
  private roll = 0;                // how far over it is, eased
  private tipT = 0;                // how long it's been cornering hard enough to go over
  private snaps: Snap[] = [];
  private circles: number[] = [];  // along its length, for bumping into things
  private moved = true;            // its pose needs working out again

  constructor(readonly i: number, readonly kind: VKind, paint: string, private map: GameMap, private ground: (x: number, z: number) => number, private label = "") {
    const S = (this.spec = SPECS[kind]);
    this.hl = S.L / 2; this.hw = S.W / 2;
    const n = Math.max(2, Math.ceil((S.L - S.W) / this.hw) + 1);
    for (let k = 0; k < n; k++) this.circles.push(-(this.hl - this.hw) + (k * (S.L - S.W)) / (n - 1));
    this.body = buildBody(kind, paint);
    [this.figure, this.figMat] = driverFigure();
    this.figure.position.set(S.seat[0], S.seat[1], S.seat[2]);
    this.body.add(this.figure);
    this.riders = S.seats.map(() => "");
    for (const [al, up, ac] of S.seats) {
      const f = driverFigure();
      f[0].position.set(al, up, ac);
      this.body.add(f[0]);
      this.riderFigs.push(f);
    }
    this.root.add(this.body);
    this.body.rotation.order = "YZX";   // heading, then pitch (about its width), then roll (about its length)
  }

  get name() { return this.label || this.spec.name; }
  /** Forward speed, m/s (negative going backwards). */
  get speed() { return this.vx * Math.cos(this.a) - this.vz * Math.sin(this.a); }

  /** Where someone's feet are (scene coords), and the way they face (a player's yaw): the driver's, or seat k's. */
  seat(k = -1): { x: number; y: number; z: number; yaw: number } {
    const [al, up, ac] = k < 0 ? this.spec.seat : this.spec.seats[k], c = Math.cos(this.a), s = Math.sin(this.a);
    return { x: this.x + al * c + ac * s, y: this.y + up, z: this.z - al * s + ac * c, yaw: this.a - Math.PI / 2 };
  }

  /** How far (x, z) is from its sides: 0 inside it. */
  distance(x: number, z: number): number {
    const c = Math.cos(this.a), s = Math.sin(this.a), dx = x - this.x, dz = z - this.z;
    const u = Math.abs(dx * c - dz * s) - this.hl, w = Math.abs(dx * s + dz * c) - this.hw;
    return Math.hypot(Math.max(0, u), Math.max(0, w));
  }

  /** Somewhere clear to get out: your own door (the driver's, or seat k's), the other side, the back or the front. */
  exitSpot(k = -1): { x: number; z: number } {
    const [al, , ac] = k < 0 ? this.spec.seat : this.spec.seats[k], c = Math.cos(this.a), s = Math.sin(this.a), side = ac < 0 ? -1 : 1;
    const tries = [[al, side * (this.hw + 0.6)], [al, -side * (this.hw + 0.6)], [-this.hl - 0.8, 0], [this.hl + 0.8, 0], [al, this.hw + 1.6], [al, -this.hw - 1.6]];
    for (const [u, w] of tries) {
      const x = this.x + u * c + w * s, z = this.z - u * s + w * c;
      if (Math.hypot(x, z) < this.map.field - 1 && !this.map.blocked(x, z, 0.4)) return { x, z };
    }
    return { x: this.x + al * c + (this.hw + 0.6) * s, z: this.z - al * s + (this.hw + 0.6) * c };
  }

  /** Put it somewhere, stopped. */
  place(x: number, z: number, a: number, tip = 0) {
    Object.assign(this, { x, z, a, tip, vx: 0, vz: 0, steer: 0, spin: 0, drift: false, horn: false, gas: 0, hand: false });
    this.snaps = [];
    this.moved = true;
  }

  /** Show who's at the wheel (their colour), or nobody. */
  setDriver(id: string, colour: string) {
    this.driver = id;
    this.figure.visible = !!id;
    if (id) this.figMat.color.set(colour);
    if (!id) { this.drift = false; this.horn = false; this.gas = 0; this.hand = false; this.snaps = []; }
  }

  /** Sit someone in seat k (their colour), or empty it. */
  setRider(k: number, id: string, colour: string) {
    if (!(k in this.riders)) return;
    this.riders[k] = id;
    const [fig, mat] = this.riderFigs[k];
    fig.visible = !!id;
    if (id) mat.color.set(colour);
  }

  /** Which seat someone's in: -1 driving, a seat number, or undefined if they're not in it. */
  seatOf(id: string): number | undefined {
    if (!id) return undefined;
    if (this.driver === id) return -1;
    const k = this.riders.indexOf(id);
    return k < 0 ? undefined : k;
  }

  /** Room for one more: the wheel, if nobody's at it, or a seat. */
  get full() { return !!this.driver && !this.riders.includes(""); }

  /** Get back on its wheels (someone heaves it over as they get in). */
  right() { if (this.tip) { this.tip = 0; this.tipT = 0; this.moved = true; } }

  // ---- driving it yourself --------------------------------------------------------------------
  drive(dt: number, inp: Controls, paved: (x: number, z: number) => boolean) {
    const S = this.spec, map = this.map, c = Math.cos(this.a), s = Math.sin(this.a);
    let vf = this.vx * c - this.vz * s, vl = this.vx * s + this.vz * c;
    const over = this.tip !== 0, thr = over ? 0 : inp.throttle, hand = !over && inp.handbrake;
    const grass = !paved(this.x, this.z), top = S.top * (grass ? 0.6 : 1) * (this.drift ? 0.3 : 1);
    this.flipped = false;
    // engine and brakes
    if (thr > 0.05) vf += (vf < -0.5 ? S.brake : S.accel * thr * Math.max(0, 1 - (vf / top) ** 2)) * dt;
    else if (thr < -0.05) vf -= (vf > 0.5 ? S.brake : S.accel * 0.6 * -thr * Math.max(0, 1 - (vf / S.rev) ** 2)) * dt;
    // the hill pulls it along (stopped and off the throttle, the handbrake holds it)
    const half = S.wb / 2;
    const slope = (map.ground(this.x + c * half, this.z - s * half) - map.ground(this.x - c * half, this.z + s * half)) / S.wb;
    const held = Math.abs(thr) < 0.05 && Math.abs(vf) < 1.5;
    if (!held || over) vf -= 9.8 * slope * 0.75 * dt;
    // rolling resistance, more on grass and a lot on its side, and the air
    const drag = (over ? 7 : this.drift && thr > 0.3 ? 1.5 : hand || held ? 6 : grass ? 2.5 : 0.7) + 0.0009 * vf * vf + (Math.abs(vf) > top ? 3 : 0);
    vf = Math.abs(vf) <= drag * dt ? 0 : vf - Math.sign(vf) * drag * dt;
    // steering: less lock the faster you go, and only so much grip
    this.steer += ((over ? 0 : inp.steer) - this.steer) * Math.min(1, dt * (inp.steer ? 7 : 9));
    const lock = S.steer / (1 + Math.abs(vf) / 24);
    let yaw = ((vf * Math.tan(this.steer * lock)) / S.wb) * (hand ? 1.35 : 1);
    const grip = S.grip * (grass ? 0.7 : 1) * (hand ? 1.5 : 1);
    if (Math.abs(yaw * vf) > grip) yaw = (Math.sign(yaw) * grip) / Math.max(0.1, Math.abs(vf));
    // donuts: pull the handbrake with some lock on and the back end comes round; keep your foot down
    // and the lock on and it keeps going round, spinning faster than the tyres would ever turn it
    const kick = hand && Math.abs(this.steer) > 0.3 && (Math.abs(vf) > 2 || thr > 0.3), hold = thr > 0.3 && Math.abs(this.steer) > 0.3;
    this.drift = !over && (kick || (this.drift && (hold || (hand && Math.hypot(vf, vl) > 0.5))));
    if (this.drift) yaw = this.steer * S.donut * Math.min(1, Math.hypot(vf, vl) / 4 + Math.max(0, thr) * 0.6) * (vf < -0.5 ? -1 : 1);
    this.spin += (yaw - this.spin) * Math.min(1, dt * (this.drift ? 3 : 12));
    const lat = this.spin * vf;   // cornering, m/s²: + is a left turn going forwards
    // sliding sideways dies away as the tyres bite; with the handbrake on, or in a donut, the back end lets go
    vl *= Math.exp(-(this.drift ? 1.6 : hand ? 1.2 : over ? 3 : grass ? 4 : 9) * dt);
    this.vx = vf * c + vl * s; this.vz = -vf * s + vl * c;
    // a donut goes round its front wheels, the back end swinging out round them
    const da = this.spin * dt;
    if (this.drift) { this.x += half * (c - Math.cos(this.a + da)); this.z -= half * (s - Math.sin(this.a + da)); }
    this.a += da;
    // the Robin: corner too hard for too long and it lifts a wheel, then goes over
    if (S.tip && !over) {
      this.tipT = Math.abs(lat) > S.tip && Math.abs(vf) > 7 ? this.tipT + dt : Math.max(0, this.tipT - dt * 2);
      if (this.tipT > 0.35) { this.tip = lat > 0 ? 1 : -1; this.flipped = true; this.tipT = 0; }
    }
    const teeter = S.tip && this.tipT > 0 ? Math.sign(lat) * Math.min(0.3, this.tipT * 0.8) : 0;
    this.lean += (Math.max(-0.1, Math.min(0.1, lat * S.lean)) + teeter - this.lean) * Math.min(1, dt * 6);
    // move, and bump off anything in the way
    this.x += this.vx * dt; this.z += this.vz * dt;
    this.impact = 0;
    const c2 = Math.cos(this.a), s2 = Math.sin(this.a);
    for (let it = 0; it < 3; it++) {
      let bx = 0, bz = 0, best = 0;
      for (const o of this.circles) {
        const cx = this.x + o * c2, cz = this.z - o * s2;
        const p = map.collide({ x: cx, z: cz }, this.y, this.hw, this);
        const d = Math.hypot(p.x - cx, p.z - cz);
        if (d > best) { best = d; bx = p.x - cx; bz = p.z - cz; }
      }
      if (best < 1e-4) break;
      this.x += bx; this.z += bz;
      const ux = bx / best, uz = bz / best, vn = this.vx * ux + this.vz * uz;
      if (vn < 0) { this.vx -= ux * vn * 1.3; this.vz -= uz * vn * 1.3; this.impact = Math.max(this.impact, -vn); }
    }
    this.horn = !over && inp.horn;
    this.gas = Math.abs(thr);
    this.hand = hand;
    this.engineNote(dt);
    this.moved = true;
  }

  /** Lose some speed (after hitting someone). */
  slow(f: number) { this.vx *= f; this.vz *= f; }

  /** Which gear it's in and how hard the engine's working, from its speed. */
  private engineNote(dt: number) {
    const sp = Math.min(1, Math.abs(this.speed) / this.spec.top), G = this.spec.gears;
    let lo = 0, rev = 0.2;
    for (const hi of G) {
      if (sp <= hi || hi === G[G.length - 1]) { rev = 0.2 + (0.8 * (sp - lo)) / (hi - lo); break; }
      lo = hi;
    }
    const want = Math.max(rev, this.gas > 0.05 && sp < 0.03 ? 0.42 : 0.18, this.tip ? 0 : 0.18);
    this.rpm += (Math.min(1, want) - this.rpm) * Math.min(1, dt * 8);
  }

  /** What to send: [i, x, z, angle, vx, vz, steer, tip, flags]. */
  state(): number[] {
    const q = (v: number) => Math.round(v * 100) / 100;
    const flags = (this.horn ? 1 : 0) | (this.gas > 0.05 ? 2 : 0) | (this.hand ? 4 : 0);
    return [this.i, q(this.x), q(this.z), q(this.a), q(this.vx), q(this.vz), q(this.steer), this.tip, flags];
  }

  // ---- someone else driving it ---------------------------------------------------------------
  push(d: number[]) {
    const [, x, z, a, vx, vz, steer, tip, flags] = d;
    if (![x, z, a, vx, vz].every(Number.isFinite)) return;
    this.snaps.push({ t: performance.now(), x, z, a, vx, vz, steer: steer || 0, tip: tip === 1 || tip === -1 ? tip : 0, flags: flags | 0 });
    if (this.snaps.length > 30) this.snaps.shift();
  }

  /** Move to where its driver had it a moment ago, smoothed between their updates. */
  follow(now: number, dt: number) {
    const S = this.snaps;
    if (!S.length) return;
    const t = now - DELAY;
    let a = S[0], b = S[S.length - 1];
    for (let i = 0; i < S.length - 1; i++) if (S[i].t <= t && S[i + 1].t >= t) { a = S[i]; b = S[i + 1]; break; }
    if (t >= b.t) a = b;
    const f = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 1;
    let da = b.a - a.a;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    const yaw = (da / Math.max(0.001, (b.t - a.t) / 1000));
    this.x = a.x + (b.x - a.x) * f; this.z = a.z + (b.z - a.z) * f; this.a = a.a + da * f;
    this.vx = a.vx + (b.vx - a.vx) * f; this.vz = a.vz + (b.vz - a.vz) * f;
    this.steer = b.steer; this.tip = b.tip;
    this.horn = !!(b.flags & 1); this.gas = b.flags & 2 ? 1 : 0; this.hand = !!(b.flags & 4);
    const lat = b.t > a.t ? yaw * this.speed : 0;
    this.lean += (Math.max(-0.1, Math.min(0.1, lat * this.spec.lean)) - this.lean) * Math.min(1, dt * 6);
    this.engineNote(dt);
    this.moved = true;
  }

  // ---- drawing --------------------------------------------------------------------------------
  /** Sit it on the ground: height, and tilt from the slope under its wheels. */
  pose(dt: number) {
    const target = this.tip * 1.48;
    const rolling = Math.abs(target - this.roll) > 1e-3;
    if (!this.moved && !rolling) return;
    this.moved = false;
    const S = this.spec, c = Math.cos(this.a), s = Math.sin(this.a), half = S.wb / 2;
    const g = this.ground;
    const hF = g(this.x + c * half, this.z - s * half), hR = g(this.x - c * half, this.z + s * half);
    const hRt = g(this.x + s * this.hw, this.z + c * this.hw), hLt = g(this.x - s * this.hw, this.z - c * this.hw);
    this.y = (hF + hR) / 2;
    this.roll += (target - this.roll) * Math.min(1, dt * (this.tip ? 6 : 3));
    const over = Math.abs(Math.sin(this.roll));
    this.root.position.set(this.x, this.y + over * this.hw, this.z);
    this.body.rotation.set(this.lean + this.roll - Math.atan((hRt - hLt) / S.W), this.a, Math.atan((hF - hR) / S.wb));
    this.top = this.y + (this.tip ? S.W : S.H);
    this.waist = this.y + (this.tip ? S.W * 0.6 : S.waist);
  }
}

// ---- all of them ------------------------------------------------------------------------------
export class Vehicles {
  /** The ones that are vehicles now: The Firs' from the start, then any parked car someone's got in. */
  readonly list: Vehicle[] = [];
  private byI = new Map<number, Vehicle>();
  /** Where the parked cars' numbers start: map.spare[k] is vehicle base + k. */
  private base = 0;
  private add: (i: number, kind: VKind, paint: string, x: number, z: number, a: number, label?: string) => Vehicle;

  constructor(private map: GameMap, scene: THREE.Scene, ground: (x: number, z: number) => number) {
    const spots = map.parked.map(([x, y, , a]) => ({ x, z: -y, a }));
    const add = (this.add = (i: number, kind: VKind, paint: string, x: number, z: number, a: number, label = "") => {
      const v = new Vehicle(i, kind, paint, map, ground, label);
      v.place(x, z, a);
      v.pose(1);
      this.list.push(v);
      this.byI.set(i, v);
      scene.add(v.root);
      map.movers.push(v);
      return v;
    });
    // the bus, in the longest gap between two cars parked nose to tail: just ahead of the one behind,
    // with the road clear in front of it to pull out
    const bus = SPECS.bus, ahead = 2.05 + 1.5 + bus.L / 2;   // from the car behind to the bus's middle
    let best: { x: number; z: number; a: number } | null = null, bestGap = 0;
    for (const p of spots) for (const q of spots) {
      const dx = q.x - p.x, dz = q.z - p.z, gap = Math.hypot(dx, dz);
      const c = Math.cos(p.a), s = Math.sin(p.a), across = Math.abs(dx * s + dz * c);
      const turn = Math.abs(Math.atan2(Math.sin(q.a - p.a), Math.cos(q.a - p.a)));
      if (gap < ahead + bus.L / 2 + 2.05 + 5 || gap > 70 || gap <= bestGap || across > 1.2 || (turn > 0.4 && turn < Math.PI - 0.4)) continue;
      // nothing parked in between
      if (spots.some((o) => o !== p && o !== q && Math.hypot(o.x - p.x, o.z - p.z) < gap && Math.hypot(o.x - q.x, o.z - q.z) < gap)) continue;
      // the bus faces the way p does: start from whichever car is behind it
      const way = dx * c - dz * s > 0 ? 1 : -1, behind = way > 0 ? p : q, ux = (dx / gap) * way, uz = (dz / gap) * way;
      for (const shift of [0, 1, 2, 3]) {
        const x = behind.x + ux * (ahead + shift), z = behind.z + uz * (ahead + shift);
        const clear = [-1, -0.5, 0, 0.5, 1, 1.35, 1.7, 2.05, 2.4].every((k) => !map.blocked(x + c * k * (bus.L / 2 - 1), z - s * k * (bus.L / 2 - 1), bus.W / 2));
        if (clear) { best = { x, z, a: p.a }; bestGap = gap; break; }
      }
    }
    if (best) add(this.list.length, "bus", "", best.x, best.z, best.a);
    // XR3is and Robins where the cars were
    spots.forEach((p, i) => {
      const robin = i % 2 === 1;
      add(this.list.length, robin ? "robin" : "xr3i", robin ? ROBIN_PAINT[(i >> 1) % ROBIN_PAINT.length] : XR3I_PAINT[(i >> 1) % XR3I_PAINT.length], p.x, p.z, p.a);
    });
    this.base = this.list.length;
  }

  /** Vehicle i, turning a parked car into one if it's not been driven yet; undefined if there's no such vehicle. */
  get(i: number): Vehicle | undefined {
    const had = this.byI.get(i);
    if (had || !Number.isInteger(i) || i < this.base) return had;
    const k = i - this.base, s = this.map.spare[k];
    if (!s) return undefined;
    const [, x, y, , a, n] = s.f as [string, number, number, number, number, number];
    this.map.takeCar(k);
    return this.add(i, "car", CAR_PAINT[n % CAR_PAINT.length], x, -y, a, MAKES[k % MAKES.length]);
  }

  /** The nearest vehicle with room in it within reach of (x, z) and about level with y (a parked car counts), if any. */
  nearest(x: number, z: number, y: number, reach: number): { i: number; name: string; driver: string } | null {
    let best: { i: number; name: string; driver: string } | null = null, bd = reach;
    for (const v of this.list) {
      const d = v.distance(x, z);
      if (!v.full && d < bd && Math.abs(v.y - y) < 2.5) { bd = d; best = v; }
    }
    const S = this.map.spare, z0 = this.map.z0;
    for (let k = 0; k < S.length; k++) {
      const [, fx, fy, fz, a] = S[k].f as [string, number, number, number, number];
      const dx = x - fx, dz = z + fy;
      if (Math.abs(dx) > 5 || Math.abs(dz) > 5 || this.byI.has(this.base + k) || Math.abs(fz - z0 - y) > 2.5) continue;
      const c = Math.cos(a), s = Math.sin(a);
      const d = Math.hypot(Math.max(0, Math.abs(dx * c - dz * s) - 2.05), Math.max(0, Math.abs(dx * s + dz * c) - 0.88));
      if (d < bd) { bd = d; best = { i: this.base + k, name: MAKES[k % MAKES.length], driver: "" }; }
    }
    return best;
  }

  /** The vehicle someone's driving, if any. */
  of(id: string): Vehicle | undefined { return this.list.find((v) => v.driver === id); }

  /** The vehicle someone's in, driving it or along for the ride, if any. */
  carrying(id: string): Vehicle | undefined { return this.list.find((v) => v.seatOf(id) !== undefined); }

  /** Smooth the ones other people are driving, and sit them all on the ground. mine: the one you're driving. */
  update(now: number, dt: number, mine: Vehicle | null, px: number, pz: number) {
    for (const v of this.list) {
      if (v.driver && v !== mine) v.follow(now, dt);
      v.pose(dt);
      v.root.visible = Math.hypot(v.x - px, v.z - pz) < 260;
    }
  }

  /** The host's word on which vehicles there are, who's driving them, who's riding in them, and where they are:
   * { i: numbers, d: drivers, r: riders, p: [x, z, angle, tip, ...] }. */
  snapshot(): { i: number[]; d: string[]; r: string[][]; p: number[] } {
    const q = (v: number) => Math.round(v * 100) / 100;
    return { i: this.list.map((v) => v.i), d: this.list.map((v) => v.driver), r: this.list.map((v) => [...v.riders]), p: this.list.flatMap((v) => [q(v.x), q(v.z), q(v.a), v.tip]) };
  }
}
