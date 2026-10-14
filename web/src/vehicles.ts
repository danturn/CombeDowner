// Vehicles you can drive. The cars parked along The Firs (by Firs Field) and Fox Hill are swapped
// for ones with the keys in: Ford Escort XR3is, Reliant Robins, Vauxhall Novas, Austin Metros, Ford
// Sierras, a Police Sierra, a Transit van, a Mr Whippy van, a milk float and a Sinclair C5. Badgerline
// double-deckers and minibuses wait at bus stops, and each cricket club has its heavy roller out.
//
// E gets in and out: the driver's seat if it's free, otherwise a passenger seat, where you can look
// about and shoot. W and S drive, A and D steer, Space is the handbrake and H (or a click) the horn,
// or the siren on the police car, or Greensleeves on the ice cream van. Vehicles block like walls,
// rounds go through their windows, and anyone you hit at speed goes under (the roller flattens them
// at a crawl). Drive into the traffic, a parked car or a vehicle nobody's in and it gives way: you
// plough on, a bit slower, and what you hit is knocked off its line (the traffic and the parked
// cars become wrecks in traffic.ts; a vehicle slides off with its handbrake on). Take a Robin round a corner too fast and it goes over;
// drive a milk float into something and the bottles go. Every other parked car in the place, in Combe Down or out in Bath,
// stays street furniture until someone gets in it, and then it's a car like the rest. You can call
// a bus at any bus stop (game.ts), in Combe Down or anywhere in Bath. Space with some lock on kicks the back end
// out for donuts: keep the throttle and the lock on and it keeps going round.
//
// Who decides what: whoever's driving a vehicle moves it and sends where it is about 20 times a
// second. The host decides who sits where (the first to ask) and sends round who's in what and where
// everything's parked. Everyone builds the same vehicles in the same places from the map. A driver
// who knocks a car in the traffic, a parked car or an empty vehicle tells the host how hard; the host
// runs the traffic, and slides an empty vehicle on, sending where it is as a driver would.
import * as THREE from "three";
import type { EngineKind } from "./audio";
import { CAR_PAINT, carSteerable, model, Part, steerable, Wheel } from "./furniture";
import type { LampPair, Lamps, Lit } from "./headlights";
import { GameMap, Mover, TILE_CAR, tileKey } from "./map";

export type VKind = "bus" | "minibus" | "xr3i" | "robin" | "nova" | "metro" | "sierra" | "police" | "transit" | "icecream" | "milkfloat" | "c5" | "roller" | "car";

interface Spec {
  name: string;                   // as the HUD says it
  L: number; W: number; H: number;
  waist: number;                  // rounds go over this, through the windows
  wb: number;                     // wheelbase
  top: number;                    // top speed, m/s
  accel: number; brake: number; rev: number;   // m/s², m/s², top speed backwards
  steer: number;                  // full lock, radians
  grip: number;                   // cornering, m/s², before it starts to slide
  donut?: number;                 // how fast it spins round in a donut at full lock, rad/s (2.4 if not said)
  tip?: number;                   // cornering that rolls it over (the Robin)
  lean: number;                   // how far the body rolls in a corner
  /** Where each seat's occupant has their feet: along, up, across (+ is right). The driver's first: they're right-hand drive. */
  seats: number[][];
  cam: number;                    // how far back the chase camera sits
  mass: number;                   // how hard it hits people
  gears: number[];                // top of each gear, as a share of top speed
  engine: EngineKind;
  crush?: boolean;                // runs people over at walking pace (the roller)
  siren?: "siren" | "chimes";     // H switches it on and off
  milk?: boolean;                 // crates of bottles, which smash
  paint: string[];                // colours it comes in
}

/** Four seats in a small car: driver, front passenger, and two in the back. */
const four = (front: number, back: number, across: number, up = 0.05) =>
  [[front, up, across], [front, up, -across], [back, up, across * 0.95], [back, up, -across * 0.95]];

export const SPECS: Record<VKind, Spec> = {
  bus: {
    name: "Badgerline bus", L: 9.6, W: 2.5, H: 4.3, waist: 1.35, wb: 5.4, top: 20, accel: 2.3, brake: 7, rev: 4,
    steer: 0.62, grip: 5, donut: 0.8, lean: 0.006, cam: 13, mass: 2.4, gears: [0.25, 0.5, 0.75, 1], engine: "diesel", paint: ["#fff"],
    // the driver, the top deck's front seats (the best view) and a few downstairs
    seats: [[3.95, 0.85, 0.62], [3.9, 2.6, -0.62], [3.9, 2.6, 0.62], [2.9, 2.6, -0.62], [2.9, 2.6, 0.62], [1.9, 2.6, -0.62], [1.9, 2.6, 0.62],
      [-0.5, 2.6, -0.62], [-0.5, 2.6, 0.62], [2.4, 0.5, -0.62], [1.4, 0.5, 0.62], [-1.5, 0.5, -0.62], [-2.5, 0.5, 0.62]],
  },
  minibus: {
    name: "Badgerline minibus", L: 7.0, W: 2.25, H: 2.85, waist: 1.2, wb: 3.9, top: 26, accel: 3.2, brake: 8, rev: 4.5,
    steer: 0.6, grip: 6, donut: 1.2, lean: 0.007, cam: 10, mass: 1.8, gears: [0.22, 0.45, 0.72, 1], engine: "diesel", paint: ["#fff"],
    seats: [[2.75, 0.5, 0.55], [1.6, 0.55, -0.55], [1.6, 0.55, 0.55], [0.6, 0.55, -0.55], [0.6, 0.55, 0.55], [-0.4, 0.55, -0.55], [-0.4, 0.55, 0.55],
      [-1.4, 0.55, -0.55], [-1.4, 0.55, 0.55]],
  },
  xr3i: {
    name: "Ford Escort XR3i", L: 4.05, W: 1.64, H: 1.36, waist: 0.86, wb: 2.4, top: 42, accel: 6.5, brake: 11, rev: 7,
    steer: 0.6, grip: 10, donut: 2.8, lean: 0.005, seats: four(-0.25, -1.15, 0.36), cam: 6.5, mass: 1, gears: [0.2, 0.38, 0.58, 0.8, 1], engine: "petrol",
    paint: ["#f0f0ea", "#b3141b", "#1b1c1f", "#a8adb2", "#1f4c86"],   // Diamond White, Radiant Red, black, Strato Silver, Caspian Blue
  },
  robin: {
    name: "Reliant Robin", L: 3.35, W: 1.43, H: 1.4, waist: 0.86, wb: 2.15, top: 30, accel: 4.6, brake: 8, rev: 6,
    steer: 0.62, grip: 9, tip: 6.5, lean: 0.008, seats: four(-0.2, -1.0, 0.32), cam: 6, mass: 0.8, gears: [0.24, 0.48, 0.74, 1], engine: "tinny",
    paint: ["#e2b42a", "#8fb5d2", "#c9632a", "#7b5333", "#d6cdb0", "#8aa23c"],
  },
  nova: {
    name: "Vauxhall Nova", L: 3.62, W: 1.53, H: 1.36, waist: 0.86, wb: 2.34, top: 40, accel: 5.8, brake: 10, rev: 7,
    steer: 0.62, grip: 10, lean: 0.006, seats: four(-0.15, -1.0, 0.34), cam: 6, mass: 0.9, gears: [0.22, 0.42, 0.62, 0.82, 1], engine: "petrol",
    paint: ["#eeeeea", "#c0201c", "#1a1b1d", "#2a4f92", "#a9acb0"],
  },
  metro: {
    name: "Austin Metro", L: 3.4, W: 1.55, H: 1.36, waist: 0.88, wb: 2.25, top: 36, accel: 4.8, brake: 9, rev: 6,
    steer: 0.62, grip: 9, lean: 0.007, seats: four(-0.15, -1.0, 0.34), cam: 6, mass: 0.85, gears: [0.24, 0.48, 0.74, 1], engine: "tinny",
    paint: ["#cdbf98", "#6b4a2e", "#3c5a3a", "#a8281f", "#eeeeea", "#4a6f9a"],
  },
  sierra: {
    name: "Ford Sierra", L: 4.43, W: 1.7, H: 1.37, waist: 0.88, wb: 2.6, top: 46, accel: 6.2, brake: 11, rev: 7,
    steer: 0.58, grip: 10, lean: 0.005, seats: four(-0.2, -1.2, 0.38), cam: 7, mass: 1.1, gears: [0.2, 0.38, 0.58, 0.8, 1], engine: "petrol",
    paint: ["#a9adb2", "#5a1a22", "#eeeeea", "#1d2a4a", "#b8a06a", "#1b1c1f"],
  },
  police: {
    name: "Police Sierra", L: 4.43, W: 1.7, H: 1.37, waist: 0.88, wb: 2.6, top: 50, accel: 6.8, brake: 12, rev: 7,
    steer: 0.58, grip: 11, lean: 0.005, seats: four(-0.2, -1.2, 0.38), cam: 7, mass: 1.1, gears: [0.2, 0.38, 0.58, 0.8, 1], engine: "petrol",
    siren: "siren", paint: ["#f4f4f0"],
  },
  transit: {
    name: "Ford Transit", L: 4.6, W: 1.95, H: 2.05, waist: 1.0, wb: 2.7, top: 34, accel: 4.5, brake: 9, rev: 6,
    steer: 0.6, grip: 8, lean: 0.009, cam: 8, mass: 1.4, gears: [0.22, 0.45, 0.72, 1], engine: "diesel",
    // two up front, and your mates in the back
    seats: [[1.0, 0.3, 0.45], [1.0, 0.3, -0.45], [-0.6, 0.3, 0.5], [-0.6, 0.3, -0.5], [-1.6, 0.3, 0.5], [-1.6, 0.3, -0.5]],
    paint: ["#f2f2ee", "#f2f2ee", "#c9201c", "#1f3f7a", "#e9e2c8"],
  },
  icecream: {
    name: "Mr Whippy van", L: 5.0, W: 2.0, H: 2.45, waist: 1.05, wb: 2.9, top: 26, accel: 3.2, brake: 8, rev: 5,
    steer: 0.6, grip: 6, lean: 0.01, cam: 9, mass: 1.6, gears: [0.25, 0.5, 0.75, 1], engine: "diesel", siren: "chimes",
    seats: [[1.45, 0.3, 0.5], [1.45, 0.3, -0.5], [-0.9, 0.3, -0.45], [-0.9, 0.3, 0.45]], paint: ["#f6f4ee"],
  },
  car: {   // any other parked car, out of the street furniture
    name: "car", L: 4.16, W: 1.76, H: 1.44, waist: 0.98, wb: 2.6, top: 38, accel: 5.5, brake: 10, rev: 7,
    steer: 0.6, grip: 9.5, donut: 2.6, lean: 0.006, seats: four(-0.35, -1.15, 0.4), cam: 6.5, mass: 1, gears: [0.2, 0.38, 0.58, 0.8, 1], engine: "petrol",
    paint: CAR_PAINT,
  },
  milkfloat: {
    name: "Milk float", L: 3.8, W: 1.5, H: 2.07, waist: 0.9, wb: 2.3, top: 7, accel: 1.4, brake: 5, rev: 3,
    steer: 0.62, grip: 5, lean: 0.006, seats: [[1.35, 0.5, 0.1]], cam: 7, mass: 1.3, gears: [1], engine: "electric", milk: true,
    paint: ["#f2f0e8"],
  },
  c5: {
    name: "Sinclair C5", L: 1.75, W: 0.75, H: 0.65, waist: 0.5, wb: 1.25, top: 6.7, accel: 1.6, brake: 5, rev: 2,
    steer: 0.62, grip: 6, lean: 0.01, seats: [[-0.15, -0.05, 0]], cam: 4.2, mass: 0.25, gears: [1], engine: "electric",
    paint: ["#f2f2ee"],
  },
  roller: {
    name: "Heavy roller", L: 2.9, W: 1.6, H: 1.55, waist: 1.0, wb: 1.75, top: 3.2, accel: 1.2, brake: 4, rev: 2,
    steer: 0.55, grip: 4, lean: 0.002, seats: [[-0.6, 1.0, 0]], cam: 7, mass: 12, gears: [0.5, 1], engine: "diesel", crush: true,
    paint: ["#2f6b3c"],
  },
};

const GREEN = "#2f7a3a", YELLOW = "#f2c318";   // Badgerline
// what the parked cars are, in the HUD
export const MAKES = ["Ford Fiesta", "Vauxhall Corsa", "Volkswagen Golf", "Ford Focus", "Vauxhall Astra", "Nissan Micra", "Toyota Yaris", "Peugeot 206", "Renault Clio", "Honda Jazz"];
const DELAY = 110;                              // ms behind real time, as for other players
const TRACKIE = "#9a9da0";                      // what a trackie at the wheel is wearing
const UNIFORM = "#3b5f8a";                      // and a Badgerline driver

/** What the keys or the stick are doing to a vehicle. */
export interface Controls { throttle: number; steer: number; handbrake: boolean; horn: boolean }

/** Something that gives way when you drive into it (a car in the traffic, a parked car, a vehicle nobody's in): which way
 * it's going, and how heavy it is against a car. kerb: for a car still parked in the street furniture, its vehicle number. */
export interface Loose extends Mover { n: number; vx: number; vz: number; mass: number; kerb?: number }
/** The traffic, to plough through: what's about, and who to tell when you knock one (dv: the change in its speed, m/s; spin: rad/s). */
export interface Shove { list: Iterable<Loose>; hit: (o: Loose, dvx: number, dvz: number, spin: number) => void }
const BOUNCE = 0.3;                             // how much two cars bounce apart when they meet

/**
 * Where the box of mover o is pushing into a row of circles of radius r along mover m (at these
 * distances along it): the way out for m, how deep it's in, and the point they touch. Null if they don't.
 */
export function contact(m: Mover, along: number[], r: number, o: Mover): { nx: number; nz: number; depth: number; px: number; pz: number } | null {
  const c = Math.cos(m.a), s = Math.sin(m.a), oc = Math.cos(o.a), os = Math.sin(o.a);
  let best: { nx: number; nz: number; depth: number; px: number; pz: number } | null = null;
  for (const k of along) {
    // into o's own frame: u along it, w across
    const dx = m.x + k * c - o.x, dz = m.z - k * s - o.z, u = dx * oc - dz * os, w = dx * os + dz * oc;
    if (Math.abs(u) >= o.hl + r || Math.abs(w) >= o.hw + r) continue;
    const cu = Math.max(-o.hl, Math.min(o.hl, u)), cw = Math.max(-o.hw, Math.min(o.hw, w));
    let eu = 0, ew = 0, depth: number;
    if (cu === u && cw === w) {
      // right inside it: out through the nearest side
      if (o.hl - Math.abs(u) < o.hw - Math.abs(w)) { eu = u < 0 ? -1 : 1; depth = o.hl - Math.abs(u) + r; }
      else { ew = w < 0 ? -1 : 1; depth = o.hw - Math.abs(w) + r; }
    } else {
      const d = Math.hypot(u - cu, w - cw);
      if (d >= r) continue;
      eu = (u - cu) / d; ew = (w - cw) / d; depth = r - d;
    }
    if (!best || depth > best.depth) best = { nx: eu * oc + ew * os, nz: -eu * os + ew * oc, depth, px: o.x + cu * oc + cw * os, pz: o.z - cu * os + cw * oc };
  }
  return best;
}

/** How hard a push at (px, pz) of (fx, fz) turns something centred at (x, z), as a change in its heading's rate (+ is left) per unit of push. */
export const twist = (x: number, z: number, px: number, pz: number, fx: number, fz: number) => fx * (pz - z) - fz * (px - x);

// ---- models ---------------------------------------------------------------------------------
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (r: number, h: number, seg = 10) => new THREE.CylinderGeometry(r, r, h, seg);
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
/** Wheels [along, across, radius, width], with hubs. */
const wheels = (at: number[][], col = "#151515", hub = "#a7abb0"): Part[] => at.flatMap(([x, z, r, w]) => [
  [cyl(r, w, 14), col, x, r, z, Math.PI / 2] as Part, [cyl(r * 0.6, w + 0.01), hub, x, r, z, Math.PI / 2] as Part,
]);
const GLASS = "#1d252c", BLACK = "#18191b", LAMP = "#e9ecee", TAIL = "#a3221b", PLATE = "#f2f2ea", REAR_PLATE = "#e8c42a";
const PAINT = "paint";   // parts in the vehicle's own colour

/** A hatchback from its side profile and cabin, plus its own bits. */
function hatch(body: number[][], cab: number[][], W: number, cabW: number, bits: Part[]): Part[] {
  return [
    [prof(body, W), PAINT, 0, 0, 0], [prof([...cab, [cab[3][0], cab[0][1]]], cabW), PAINT, 0, 0, 0],
    [prof(glass(cab), cabW + 0.04), GLASS, 0, 0, 0], ...bits,
  ];
}
/** Bumpers, lights and plates for a car whose ends are at +f and -b. */
function ends(f: number, b: number, W: number, y: number, lampW: number, lamps: number, bumper = BLACK): Part[] {
  return [
    [box(0.14, 0.2, W + 0.02), bumper, f - 0.04, 0.4, 0], [box(0.14, 0.2, W + 0.02), bumper, -b + 0.04, 0.42, 0],
    [box(0.04, 0.13, lampW), LAMP, f - 0.01, y, lamps], [box(0.04, 0.13, lampW), LAMP, f - 0.01, y, -lamps],
    [box(0.04, 0.15, lampW), TAIL, -b + 0.01, y + 0.1, lamps], [box(0.04, 0.15, lampW), TAIL, -b + 0.01, y + 0.1, -lamps],
    [box(0.03, 0.11, 0.48), PLATE, f + 0.04, 0.4, 0], [box(0.03, 0.11, 0.48), REAR_PLATE, -b - 0.04, 0.56, 0],
  ];
}

const sierraBody = [[-2.2, 0.3], [2.1, 0.3], [2.22, 0.48], [2.17, 0.66], [1.0, 0.82], [-1.9, 0.9], [-2.22, 0.76]];
const sierraCab = [[1.0, 0.8], [0.12, 1.35], [-0.95, 1.37], [-2.02, 0.9]];
const sierra = (bits: Part[] = []) => hatch(sierraBody, sierraCab, 1.7, 1.56, [
  ...ends(2.21, 2.21, 1.7, 0.6, 0.5, 0.48, "#2b2d30"), [box(0.04, 0.08, 1.0), "#101112", 2.2, 0.58, 0],
  ...wheels([[1.3, 0.76, 0.3, 0.2], [1.3, -0.76, 0.3, 0.2], [-1.3, 0.76, 0.3, 0.2], [-1.3, -0.76, 0.3, 0.2]]), ...bits,
]);

/** The parts of each kind, apart from the buses' painted bodies. */
const PARTS: Record<VKind, () => Part[]> = {
  xr3i: () => hatch([[-2.0, 0.28], [1.98, 0.28], [2.03, 0.5], [2.0, 0.68], [0.9, 0.8], [-1.6, 0.86], [-2.0, 0.8]],
    [[0.95, 0.78], [0.12, 1.33], [-0.85, 1.35], [-1.92, 0.88]], 1.64, 1.5, [
      ...ends(2.02, 2.02, 1.64, 0.61, 0.36, 0.55), [box(3.0, 0.07, 1.67), BLACK, 0, 0.55, 0],   // rubbing strips
      [box(0.3, 0.06, 1.46), BLACK, -1.72, 1.0, 0],                                              // the spoiler
      [box(0.04, 0.12, 0.7), "#101112", 2.02, 0.6, 0],
      [box(0.04, 0.1, 0.1), "#f4f2d8", 2.06, 0.4, 0.4], [box(0.04, 0.1, 0.1), "#f4f2d8", 2.06, 0.4, -0.4],   // driving lamps
      ...wheels([[1.2, 0.74, 0.29, 0.2], [1.2, -0.74, 0.29, 0.2], [-1.2, 0.74, 0.29, 0.2], [-1.2, -0.74, 0.29, 0.2]]),
    ]),
  robin: () => hatch([[-1.65, 0.27], [1.5, 0.27], [1.68, 0.48], [1.64, 0.6], [0.72, 0.76], [-1.6, 0.82], [-1.67, 0.62]],
    [[0.72, 0.75], [0.12, 1.38], [-1.0, 1.4], [-1.62, 0.8]], 1.43, 1.33, [
      ...ends(1.67, 1.67, 1.3, 0.6, 0.16, 0.5, "#b9bdbf"),
      ...wheels([[1.1, 0, 0.25, 0.16], [-1.05, 0.62, 0.25, 0.16], [-1.05, -0.62, 0.25, 0.16]], "#151515", "#c9cccf"),
    ]),
  nova: () => hatch([[-1.79, 0.27], [1.75, 0.27], [1.81, 0.5], [1.79, 0.72], [0.68, 0.82], [-1.62, 0.88], [-1.81, 0.72]],
    [[0.72, 0.8], [0.18, 1.33], [-1.15, 1.35], [-1.72, 0.92]], 1.53, 1.43, [
      ...ends(1.8, 1.8, 1.53, 0.62, 0.34, 0.5), [box(0.04, 0.12, 0.6), "#101112", 1.81, 0.6, 0],
      ...wheels([[1.17, 0.69, 0.27, 0.18], [1.17, -0.69, 0.27, 0.18], [-1.17, 0.69, 0.27, 0.18], [-1.17, -0.69, 0.27, 0.18]]),
    ]),
  metro: () => hatch([[-1.69, 0.27], [1.62, 0.27], [1.7, 0.5], [1.67, 0.72], [0.62, 0.84], [-1.55, 0.92], [-1.7, 0.74]],
    [[0.68, 0.82], [0.22, 1.34], [-1.2, 1.36], [-1.58, 0.96]], 1.55, 1.45, [
      ...ends(1.69, 1.69, 1.55, 0.62, 0.3, 0.5), [box(0.04, 0.14, 0.7), "#101112", 1.7, 0.6, 0],
      ...wheels([[1.12, 0.7, 0.26, 0.18], [1.12, -0.7, 0.26, 0.18], [-1.12, 0.7, 0.26, 0.18], [-1.12, -0.7, 0.26, 0.18]]),
    ]),
  sierra: () => sierra(),
  // a jam sandwich: an orange stripe with red through it, and blue lights on a bar on the roof
  police: () => sierra([
    [box(3.9, 0.17, 1.72), "#f08a1c", 0.1, 0.62, 0], [box(3.92, 0.07, 1.725), "#d4231c", 0.1, 0.62, 0],
    [box(0.32, 0.1, 1.1), BLACK, -0.4, 1.42, 0],
  ]),
  transit: () => [
    [prof([[-2.3, 0.32], [2.22, 0.32], [2.3, 0.58], [2.27, 0.95], [1.45, 1.08], [0.95, 1.95], [-2.3, 2.0]], 1.95), PAINT, 0, 0, 0],
    [prof([[1.49, 1.08], [1.03, 1.88], [0.55, 1.88], [0.55, 1.08]], 1.97), GLASS, 0, 0, 0],
    [box(0.03, 0.45, 0.7), GLASS, -2.31, 1.55, 0.45], [box(0.03, 0.45, 0.7), GLASS, -2.31, 1.55, -0.45],   // back doors
    [box(0.04, 0.3, 1.1), "#101112", 2.29, 0.75, 0],
    ...ends(2.3, 2.3, 1.95, 0.78, 0.28, 0.68),
    ...wheels([[1.45, 0.86, 0.33, 0.22], [1.45, -0.86, 0.33, 0.22], [-1.25, 0.86, 0.33, 0.22], [-1.25, -0.86, 0.33, 0.22]]),
  ],
  icecream: () => [
    [prof([[-2.5, 0.32], [2.38, 0.32], [2.5, 0.62], [2.46, 1.02], [1.72, 1.12], [1.25, 2.05], [0.95, 2.45], [-2.5, 2.45]], 2.0), PAINT, 0, 0, 0],
    [prof([[1.76, 1.12], [1.31, 2.0], [0.95, 2.0], [0.95, 1.12]], 2.02), GLASS, 0, 0, 0],
    [box(4.6, 0.22, 2.02), "#e86a9a", -0.15, 0.72, 0], [box(3.4, 0.1, 2.02), "#79b6e0", -0.8, 2.3, 0],    // pink and blue stripes
    [box(1.6, 0.7, 0.02), "#2a3640", -0.6, 1.62, -1.01], [box(1.7, 0.06, 0.18), "#e86a9a", -0.6, 1.25, -1.08],   // the serving hatch, nearside
    [new THREE.ConeGeometry(0.26, 0.7, 10), "#d9a85a", 0.3, 2.85, 0, Math.PI],                            // a big cornet on the roof
    [new THREE.SphereGeometry(0.3, 10, 8), "#fbf6ea", 0.3, 3.22, 0], [box(0.06, 0.3, 0.06), "#5b3a22", 0.4, 3.45, 0],
    ...ends(2.48, 2.5, 2.0, 0.8, 0.26, 0.72),
    ...wheels([[1.6, 0.88, 0.34, 0.22], [1.6, -0.88, 0.34, 0.22], [-1.3, 0.88, 0.34, 0.22], [-1.3, -0.88, 0.34, 0.22]]),
  ],
  milkfloat: () => {
    const crates: Part[] = [];
    for (const along of [-1.5, -1.02, -0.54, -0.06, 0.42]) for (const across of [-0.38, 0.38]) {
      crates.push([box(0.44, 0.26, 0.36), "#2c6fb5", along, 0.83, across], [box(0.44, 0.26, 0.36), "#2c6fb5", along, 1.1, across]);
      crates.push([box(0.4, 0.07, 0.32), "#f4f4ee", along, 1.27, across]);   // bottle tops
    }
    return [
      [box(3.8, 0.3, 1.5), PAINT, 0, 0.55, 0], [box(3.82, 0.1, 1.52), "#2d63b0", 0, 0.6, 0],
      [box(0.95, 1.3, 1.5), PAINT, 1.42, 1.35, 0], [box(0.04, 0.62, 1.3), GLASS, 1.9, 1.45, 0], [box(0.6, 0.5, 1.52), GLASS, 1.42, 1.5, 0],
      [box(3.85, 0.07, 1.56), PAINT, 0, 2.03, 0],
      [box(0.07, 1.3, 0.07), "#2a2c2e", -1.85, 1.35, 0.72], [box(0.07, 1.3, 0.07), "#2a2c2e", -1.85, 1.35, -0.72],
      [box(0.08, 0.15, 1.5), BLACK, 1.92, 0.45, 0], [box(0.04, 0.12, 0.16), LAMP, 1.92, 0.8, 0.55], [box(0.04, 0.12, 0.16), LAMP, 1.92, 0.8, -0.55],
      ...crates,
      ...wheels([[1.2, 0.7, 0.24, 0.16], [1.2, -0.7, 0.24, 0.16], [-1.1, 0.7, 0.24, 0.16], [-1.1, -0.7, 0.24, 0.16]]),
    ];
  },
  c5: () => [
    [prof([[-0.85, 0.14], [0.82, 0.14], [0.9, 0.3], [0.62, 0.52], [-0.3, 0.6], [-0.85, 0.5]], 0.74), PAINT, 0, 0, 0],
    [box(1.72, 0.1, 0.76), BLACK, 0, 0.17, 0], [box(0.12, 0.42, 0.48), BLACK, -0.62, 0.72, 0],
    [cyl(0.012, 1.1, 5), "#d8d8d8", -0.8, 1.05, 0.25], [box(0.02, 0.16, 0.26), "#ff7a1a", -0.8, 1.52, 0.37],   // the flag on its mast
    ...wheels([[0.68, 0, 0.16, 0.06], [-0.55, 0.36, 0.2, 0.07], [-0.55, -0.36, 0.2, 0.07]]),
  ],
  roller: () => [
    [cyl(0.55, 1.5, 18), "#6b6e70", 0.85, 0.55, 0, Math.PI / 2],                                     // the drum
    [box(0.15, 0.15, 1.6), PAINT, 0.85, 1.12, 0], [box(1.0, 0.5, 0.06), PAINT, 0.85, 0.75, 0.79], [box(1.0, 0.5, 0.06), PAINT, 0.85, 0.75, -0.79],
    [cyl(0.42, 0.62, 16), "#6b6e70", -0.95, 0.42, 0.42, Math.PI / 2], [cyl(0.42, 0.62, 16), "#6b6e70", -0.95, 0.42, -0.42, Math.PI / 2],
    [box(1.4, 0.65, 1.3), PAINT, -0.35, 1.0, 0], [box(0.9, 0.04, 1.32), "#1f3a26", -0.2, 1.33, 0],
    [box(0.45, 0.08, 0.45), "#1a1a1a", -0.6, 1.42, 0], [box(0.08, 0.35, 0.45), "#1a1a1a", -0.85, 1.6, 0],
    [cyl(0.03, 0.5, 6), "#222", -0.2, 1.55, 0], [cyl(0.18, 0.03, 12), "#222", -0.25, 1.8, 0], [cyl(0.05, 0.6, 6), "#333", 0.2, 1.6, 0.45],
  ],
  car: () => [],   // the street furniture's own model (buildBody)
  bus: () => busTrim("bus"),
  minibus: () => busTrim("minibus"),
};

// ---- the buses: painted boxes in Badgerline's green and yellow ------------------------------
interface Livery { decks: 1 | 2; base: number; axles: number[]; r: number; dest: string; fleet: string }
const LIVERY: Record<"bus" | "minibus", Livery> = {
  bus: { decks: 2, base: 0.45, axles: [2.6, -2.8], r: 0.5, dest: "2  COMBE DOWN", fleet: "8607" },
  minibus: { decks: 1, base: 0.4, axles: [2.15, -1.75], r: 0.4, dest: "4  BATH SPA", fleet: "3812" },
};

/** The everyday car's lamps (furniture.ts draws them), for headlights.ts. */
export const CAR_LAMPS: Lamps = { front: [2.08, 0.7, 0.55, 0.5, 0.12], back: [-2.08, 0.8, 0.6, 0.42, 0.12] };
/** Where each kind's headlamps and tail lights are (as ends() and the buses' painted ends draw them), to light up after dark. */
const LAMPS: Partial<Record<VKind, Lamps>> = (() => {
  const ended = (f: number, b: number, y: number, lampW: number, lamps: number): Lamps =>
    ({ front: [f, y, lamps, lampW, 0.13], back: [-b, y + 0.1, lamps, lampW, 0.15] });
  const bus = (kind: "bus" | "minibus"): Lamps => {
    const S = SPECS[kind], base = LIVERY[kind].base, f = S.L / 2, hw = S.W / 2;
    return { front: [f, base + 0.35, hw - 0.3, 0.4, 0.2], back: [-f, base + 0.45, hw - 0.225, 0.25, 0.4] };
  };
  const sierra = ended(2.21, 2.21, 0.6, 0.5, 0.48);
  return {
    xr3i: ended(2.02, 2.02, 0.61, 0.36, 0.55), robin: ended(1.67, 1.67, 0.6, 0.16, 0.5), nova: ended(1.8, 1.8, 0.62, 0.34, 0.5),
    metro: ended(1.69, 1.69, 0.62, 0.3, 0.5), sierra, police: sierra, transit: ended(2.3, 2.3, 0.78, 0.28, 0.68),
    icecream: ended(2.48, 2.5, 0.8, 0.26, 0.72), milkfloat: { front: [1.93, 0.8, 0.55, 0.16, 0.12] as LampPair },
    car: CAR_LAMPS, bus: bus("bus"), minibus: bus("minibus"),
  };
})();

function busTrim(kind: "bus" | "minibus"): Part[] {
  const S = SPECS[kind], Lv = LIVERY[kind], f = S.L / 2, hw = S.W / 2, mirror = Lv.decks === 2 ? 2.35 : 1.95;
  return [
    [box(0.12, 0.3, S.W + 0.02), BLACK, f + 0.02, Lv.base + 0.15, 0], [box(0.12, 0.3, S.W + 0.02), BLACK, -f - 0.02, Lv.base + 0.15, 0],
    [box(0.06, 0.06, 0.3), BLACK, f - 0.1, mirror, hw + 0.13], [box(0.06, 0.06, 0.3), BLACK, f - 0.1, mirror, -hw - 0.13],   // mirrors
    [box(0.08, 0.4, 0.22), BLACK, f - 0.05, mirror - 0.2, hw + 0.3], [box(0.08, 0.4, 0.22), BLACK, f - 0.05, mirror - 0.2, -hw - 0.3],
    ...wheels(Lv.axles.flatMap((a) => [[a, hw - 0.13, Lv.r, 0.3], [a, -hw + 0.13, Lv.r, 0.3]]), "#151515", "#8d9196"),
  ];
}

/** One side of a bus, front at the right end (or the left: the nearside, with the door). */
function busSide(kind: "bus" | "minibus", frontRight: boolean): THREE.CanvasTexture {
  const S = SPECS[kind], Lv = LIVERY[kind], k = 1024 / S.L, w = 1024, h = Math.round((S.H - Lv.base) * k);
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
  const two = Lv.decks === 2, skirt = two ? 1.38 : 1.15, win = two ? [1.48, 2.3] : [1.22, 2.2], band = two ? 2.58 : 2.52;
  rect(0, S.L, Lv.base, S.H, YELLOW);
  rect(0, S.L, Lv.base, skirt, GREEN);
  rect(0, S.L, skirt, skirt + 0.04, "#1b3b20");
  // windows: dark glass between yellow pillars, a door on the nearside at the front
  const front = S.L - 1.25;
  for (let a = 0.35; a < front - 0.2; a += 1.35) rect(a, Math.min(a + 1.2, front - 0.1), win[0], win[1], "#25313a");
  rect(front + 0.1, S.L - 0.2, win[0], win[1], "#25313a");
  if (!frontRight) { rect(front - 0.15, S.L - 0.35, Lv.base + 0.05, win[1], "#1d262d"); rect(front + 0.38, front + 0.42, Lv.base + 0.05, win[1], YELLOW); }
  if (two) for (let a = 0.3; a < S.L - 0.4; a += 1.48) rect(a, Math.min(a + 1.33, S.L - 0.25), 2.88, 3.7, "#25313a");
  // the wheel arches
  g.fillStyle = "#141516";
  for (const ax of Lv.axles) { g.beginPath(); g.arc(X(S.L / 2 + ax), Y(Lv.r), (Lv.r + 0.12) * k, Math.PI, 0); g.fill(); }
  // the fleetname, with a badger's head (white face, black stripes) beside it
  const cx = X(S.L * 0.5);
  g.fillStyle = GREEN; g.textAlign = "center"; g.textBaseline = "middle";
  g.font = `italic 800 ${Math.round((two ? 0.36 : 0.3) * k)}px "Helvetica Neue", Arial, sans-serif`;
  g.fillText("Badgerline", cx, Y(band));
  const bx = cx + (frontRight ? -1 : 1) * (two ? 2.25 : 1.9) * k, by = Y(band);
  g.fillStyle = "#f8f8f4"; g.beginPath(); g.ellipse(bx, by, 0.28 * k, 0.19 * k, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#151515";
  for (const s of [-1, 1]) { g.beginPath(); g.ellipse(bx, by + s * 0.085 * k, 0.26 * k, 0.045 * k, 0, 0, Math.PI * 2); g.fill(); }
  g.font = `700 ${Math.round(0.14 * k)}px "Helvetica Neue", Arial, sans-serif`;
  g.fillStyle = "#f4f1e6";
  g.fillText(Lv.fleet, X(S.L - 1.6), Y(skirt - 0.35));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** The front (with the destination blind) or the back of a bus. */
function busEnd(kind: "bus" | "minibus", front: boolean): THREE.CanvasTexture {
  const S = SPECS[kind], Lv = LIVERY[kind], k = 1024 / SPECS.bus.L, w = Math.round(S.W * k), h = Math.round((S.H - Lv.base) * k);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d")!;
  const Y = (up: number) => (S.H - up) * k;
  const rect = (x0: number, x1: number, u0: number, u1: number, col: string) => { g.fillStyle = col; g.fillRect(x0 * k, Y(u1), (x1 - x0) * k, (u1 - u0) * k); };
  const two = Lv.decks === 2, skirt = two ? 1.38 : 1.15, W = S.W, mid = W / 2;
  rect(0, W, Lv.base, S.H, YELLOW);
  rect(0, W, Lv.base, skirt, GREEN);
  if (front) {
    const ws = two ? [1.45, 2.38] : [1.2, 2.25], blind = two ? [2.45, 2.76] : [2.32, 2.66];
    rect(0.08, mid - 0.03, ws[0], ws[1], "#25313a"); rect(mid + 0.03, W - 0.08, ws[0], ws[1], "#25313a");   // windscreen
    rect(0.25, W - 0.25, blind[0], blind[1], "#0d0d0d");                                                    // destination blind
    g.fillStyle = "#ffb52a"; g.textAlign = "center"; g.textBaseline = "middle";
    g.font = `700 ${Math.round(0.19 * k)}px "Helvetica Neue", Arial, sans-serif`;
    g.fillText(Lv.dest, mid * k, Y((blind[0] + blind[1]) / 2));
    if (two) { rect(0.1, mid - 0.05, 2.86, 3.7, "#25313a"); rect(mid + 0.05, W - 0.1, 2.86, 3.7, "#25313a"); }
    rect(mid - 0.55, mid + 0.55, Lv.base + 0.1, Lv.base + 0.65, "#16181a");                                 // grille
    rect(0.1, 0.5, Lv.base + 0.25, Lv.base + 0.45, "#eef0e6"); rect(W - 0.5, W - 0.1, Lv.base + 0.25, Lv.base + 0.45, "#eef0e6");
    rect(mid - 0.3, mid + 0.3, Lv.base + 0.02, Lv.base + 0.12, "#f2f2ea");                                   // plate
  } else {
    for (let u = Lv.base + 0.15; u < skirt - 0.1; u += 0.12) rect(0.4, W - 0.4, u, u + 0.05, "#16181a");   // engine louvres
    if (two) rect(0.3, W - 0.3, 2.9, 3.6, "#25313a"); else rect(0.3, W - 0.3, 1.3, 2.1, "#25313a");
    rect(0.1, 0.35, Lv.base + 0.25, Lv.base + 0.65, "#b02a20"); rect(W - 0.35, W - 0.1, Lv.base + 0.25, Lv.base + 0.65, "#b02a20");
    rect(mid - 0.3, mid + 0.3, skirt - 0.05, skirt + 0.07, "#e8c42a");
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// shared between vehicles of a kind
const geos = new Map<VKind, [THREE.BufferGeometry | null, THREE.BufferGeometry, Wheel[]]>();
const busMats = new Map<VKind, THREE.Material[]>();
const paints = new Map<string, THREE.Material>();
let trimMat: THREE.Material | null = null;

/** The paint parts and the trim, as two geometries. */
/** A kind's painted parts, its fixed trim, and its front wheels, which turn with the steering. */
function geometryOf(kind: VKind): [THREE.BufferGeometry | null, THREE.BufferGeometry, Wheel[]] {
  let g = geos.get(kind);
  if (!g) {
    const { fixed, wheels } = steerable(PARTS[kind]());
    const painted = fixed.filter((p) => p[1] === PAINT).map((p) => [p[0], "#ffffff", ...p.slice(2)] as Part);
    geos.set(kind, (g = [painted.length ? model(painted) : null, model(fixed.filter((p) => p[1] !== PAINT)), wheels]));
  }
  return g;
}

/** The front wheels as meshes of their own, each about its own centre, so they can be turned. */
function wheelMeshes(wheels: Wheel[], mat: THREE.Material): THREE.Mesh[] {
  return wheels.map((w) => { const m = new THREE.Mesh(w.geo, mat); m.position.set(w.x, w.y, w.z); m.rotation.order = "YZX"; return m; });
}

function buildBody(kind: VKind, paint: string): { body: THREE.Group; wheels: THREE.Mesh[] } {
  trimMat ??= new THREE.MeshLambertMaterial({ vertexColors: true });
  if (kind === "car") {
    const g = new THREE.Group(), car = carSteerable(), mat = new THREE.MeshLambertMaterial({ vertexColors: true, color: paint });
    g.add(new THREE.Mesh(car.body, mat));
    const wheels = wheelMeshes(car.wheels, trimMat);
    g.add(...wheels);
    g.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
    return { body: g, wheels };
  }
  const g = new THREE.Group(), [painted, trim, front] = geometryOf(kind);
  if (kind === "bus" || kind === "minibus") {
    const S = SPECS[kind], base = LIVERY[kind].base;
    let mats = busMats.get(kind);
    if (!mats) busMats.set(kind, (mats = [
      new THREE.MeshLambertMaterial({ map: busEnd(kind, true) }), new THREE.MeshLambertMaterial({ map: busEnd(kind, false) }),
      new THREE.MeshLambertMaterial({ color: "#e9c11c" }), new THREE.MeshLambertMaterial({ color: "#1a1b1c" }),
      new THREE.MeshLambertMaterial({ map: busSide(kind, true) }), new THREE.MeshLambertMaterial({ map: busSide(kind, false) }),
    ]));
    const body = new THREE.Mesh(box(S.L, S.H - base, S.W), mats);
    body.position.y = base + (S.H - base) / 2;
    g.add(body);
    // floors, to stand on downstairs and up (the box's own faces only show from outside)
    const floor = new THREE.MeshLambertMaterial({ color: "#3a3d3a", side: THREE.DoubleSide });
    for (const y of LIVERY[kind].decks === 2 ? [base + 0.05, 2.55] : [base + 0.1]) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(S.L - 0.1, S.W - 0.1), floor);
      f.rotation.x = -Math.PI / 2;
      f.position.y = y;
      g.add(f);
    }
  }
  if (painted) {
    let m = paints.get(paint);
    if (!m) paints.set(paint, (m = new THREE.MeshLambertMaterial({ color: paint })));
    g.add(new THREE.Mesh(painted, m));
  }
  g.add(new THREE.Mesh(trim, trimMat));
  const wheels = wheelMeshes(front, trimMat);
  g.add(...wheels);
  g.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
  return { body: g, wheels };
}

/** Someone sat down: shoulders and a head, where their hitboxes are. */
function figure(colour: string): THREE.Group {
  const torso = new THREE.Mesh(box(0.42, 0.5, 0.32), new THREE.MeshLambertMaterial({ color: colour }));
  torso.position.y = 0.7;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), new THREE.MeshLambertMaterial({ color: "#c79a7a" }));
  head.position.y = 1.07;
  const g = new THREE.Group();
  g.add(torso, head);
  g.traverse((o) => { o.castShadow = true; });
  return g;
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
  /** Taken from the traffic: its paint and make, by number, so everyone can make the same car. */
  made?: number[];
  /** On its side (the Robin, cornering too hard): -1 or 1, which way it went; 0 on its wheels. */
  tip = 0;
  /** Who's sitting where ("" for nobody): the driver first. "@..." is a trackie the host is driving. */
  readonly seats: string[];
  horn = false; gas = 0; hand = false;
  /** The siren (or the chimes) going. */
  siren = false;
  /** 0 ticking over .. 1 flat out, for the engine's note. */
  rpm = 0.2;
  /** Set for a frame when it hits something: how hard, in m/s. */
  impact = 0;
  /** Set for a frame when it goes over. */
  flipped = false;
  /** Host: when someone last got in or out (ms), so a bus nobody's using can go back into service. */
  usedAt = -1e9;
  /** Knocked about with nobody in it: seconds left of sliding to a stop (the host's, or our guess till the host's word comes). */
  coast = 0;
  /** Who knocked it, for whatever it knocks into in turn. */
  by = "";
  /** When the last update came from whoever's moving it (ms). */
  heard = -1e9;
  readonly root = new THREE.Group();
  private body: THREE.Group;
  private wheels: THREE.Mesh[];    // the front wheels, turned with the steering and rolling with the road
  private turn = 0; private rolled = 0;
  private figures: (THREE.Group | null)[] = [];
  private lights: THREE.MeshBasicMaterial[] = [];   // the police car's blue lights
  private lean = 0;                // body roll in corners, and a Robin teetering on two wheels
  private roll = 0;                // how far over it is, eased
  private tipT = 0;                // how long it's been cornering hard enough to go over
  private snaps: Snap[] = [];
  private circles: number[] = [];  // along its length, for bumping into things
  private moved = true;            // its pose needs working out again

  constructor(readonly i: number, readonly kind: VKind, readonly paint: string, private map: GameMap, private ground: (x: number, z: number, y?: number) => number, private label = "") {
    const S = (this.spec = SPECS[kind]);
    this.hl = S.L / 2; this.hw = S.W / 2;
    this.seats = S.seats.map(() => "");
    const n = Math.max(2, Math.ceil((S.L - S.W) / this.hw) + 1);
    for (let k = 0; k < n; k++) this.circles.push(-(this.hl - this.hw) + (k * Math.max(0, S.L - S.W)) / (n - 1));
    ({ body: this.body, wheels: this.wheels } = buildBody(kind, paint));
    if (kind === "police") {
      for (const z of [0.3, -0.3]) {
        const m = new THREE.MeshBasicMaterial({ color: "#1d3fa8" });
        const lens = new THREE.Mesh(box(0.26, 0.11, 0.36), m);
        lens.position.set(-0.4, 1.47, z);
        this.body.add(lens);
        this.lights.push(m);
      }
    }
    this.root.add(this.body);
    this.body.rotation.order = "YZX";   // heading, then pitch (about its width), then roll (about its length)
  }

  get name() { return this.label || this.spec.name; }
  /** As something to plough into: its number, and how heavy it is to shove about. */
  get n() { return this.i; }
  get mass() { return this.spec.mass * 0.6; }
  get driver() { return this.seats[0]; }
  /** Its lights, when it's being driven and on its wheels (headlights.ts lights them after dark). */
  get lit(): Lit | null {
    const lamps = LAMPS[this.kind];
    return lamps && this.driver && !this.tip && this.root.parent ? { frame: this.body, lamps } : null;
  }
  /** Forward speed, m/s (negative going backwards). */
  get speed() { return this.vx * Math.cos(this.a) - this.vz * Math.sin(this.a); }

  /** Where someone in seat k has their feet (scene coords), and the way the seat faces (a player's yaw). */
  seat(k = 0): { x: number; y: number; z: number; yaw: number } {
    const [al, up, ac] = this.spec.seats[k] ?? this.spec.seats[0], c = Math.cos(this.a), s = Math.sin(this.a);
    return { x: this.x + al * c + ac * s, y: this.y + up, z: this.z - al * s + ac * c, yaw: this.a - Math.PI / 2 };
  }

  /** The first free seat (the driver's if it is), or -1. gone: whether someone in a seat has left the game. */
  freeSeat(gone: (id: string) => boolean = () => false): number {
    return this.seats.findIndex((id) => !id || gone(id));
  }

  /** How far (x, z) is from its sides: 0 inside it. */
  distance(x: number, z: number): number {
    const c = Math.cos(this.a), s = Math.sin(this.a), dx = x - this.x, dz = z - this.z;
    const u = Math.abs(dx * c - dz * s) - this.hl, w = Math.abs(dx * s + dz * c) - this.hw;
    return Math.hypot(Math.max(0, u), Math.max(0, w));
  }

  /** Somewhere clear to get out of seat k: its own side, the other side, the back or the front. */
  exitSpot(k = 0): { x: number; z: number } {
    const [al, , ac] = this.spec.seats[k] ?? this.spec.seats[0], side = ac < 0 ? -1 : 1, c = Math.cos(this.a), s = Math.sin(this.a);
    const tries = [[al, side * (this.hw + 0.6)], [al, -side * (this.hw + 0.6)], [-this.hl - 0.8, 0], [this.hl + 0.8, 0],
      [al, side * (this.hw + 1.6)], [al, -side * (this.hw + 1.6)]];
    for (const [u, w] of tries) {
      const x = this.x + u * c + w * s, z = this.z - u * s + w * c;
      if (this.map.fieldEdge(x, z) > 1 && !this.map.blocked(x, z, 0.4)) return { x, z };
    }
    const [u, w] = tries[0];
    return { x: this.x + u * c + w * s, z: this.z - u * s + w * c };
  }

  /** Put it somewhere, stopped. */
  place(x: number, z: number, a: number, tip = 0) {
    Object.assign(this, { x, z, a, tip, vx: 0, vz: 0, steer: 0, spin: 0, drift: false, horn: false, gas: 0, hand: false });
    this.snaps = [];
    this.moved = true;
  }

  /** Someone sits in seat k (their colour), or gets up (id ""). */
  sit(k: number, id: string, colour: string) {
    if (k < 0 || k >= this.seats.length) return;
    this.seats[k] = id;
    let f = this.figures[k];
    if (id && !f) {
      const [al, up, ac] = this.spec.seats[k];
      f = this.figures[k] = figure(colour);
      f.position.set(al, up, ac);
      this.body.add(f);
    }
    if (f) {
      f.visible = !!id;
      if (id) ((f.children[0] as THREE.Mesh).material as THREE.MeshLambertMaterial).color.set(id === "@bus" ? UNIFORM : id.startsWith("@") ? TRACKIE : colour);
    }
    if (k === 0 && id) this.coast = 0;
    if (k === 0 && !id) { this.drift = false; this.horn = false; this.gas = 0; this.hand = false; this.snaps = []; }
  }

  /** Get back on its wheels (someone heaves it over as they get in). */
  right() { if (this.tip) { this.tip = 0; this.tipT = 0; this.moved = true; } }

  // ---- driving it yourself --------------------------------------------------------------------
  drive(dt: number, inp: Controls, paved: (x: number, z: number) => boolean, traffic?: Shove) {
    const S = this.spec, map = this.map, c = Math.cos(this.a), s = Math.sin(this.a);
    let vf = this.vx * c - this.vz * s, vl = this.vx * s + this.vz * c;
    const over = this.tip !== 0, thr = over ? 0 : inp.throttle, hand = !over && inp.handbrake;
    const grass = !S.crush && !paved(this.x, this.z), top = S.top * (grass ? 0.6 : 1) * (this.drift ? 0.3 : 1);   // a roller's made for grass
    this.flipped = false;
    // engine and brakes
    if (thr > 0.05) vf += (vf < -0.5 ? S.brake : S.accel * thr * Math.max(0, 1 - (vf / top) ** 2)) * dt;
    else if (thr < -0.05) vf -= (vf > 0.5 ? S.brake : S.accel * 0.6 * -thr * Math.max(0, 1 - (vf / S.rev) ** 2)) * dt;
    // the hill pulls it along (stopped and off the throttle, the handbrake holds it)
    const half = S.wb / 2;
    const slope = (this.ground(this.x + c * half, this.z - s * half, this.y) - this.ground(this.x - c * half, this.z + s * half, this.y)) / S.wb;
    const held = Math.abs(thr) < 0.05 && Math.abs(vf) < 1.5;
    if (!held || over) vf -= 9.8 * slope * 0.75 * dt;
    // rolling resistance, more on grass and a lot on its side, and the air
    // (grass drags at the weak ones, a milk float or a C5, a bit less than it would at a car, or they'd never move)
    const drag = (over ? 7 : this.drift && thr > 0.3 ? 1.5 : hand || held ? 6 : grass ? 0.7 + Math.min(1.8, S.accel * 0.35) : 0.7) + 0.0009 * vf * vf + (Math.abs(vf) > top ? 3 : 0);
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
    this.drift = !over && !S.crush && (kick || (this.drift && (hold || (hand && Math.hypot(vf, vl) > 0.5))));
    if (this.drift) yaw = this.steer * (S.donut ?? 2.4) * Math.min(1, Math.hypot(vf, vl) / 4 + Math.max(0, thr) * 0.6) * (vf < -0.5 ? -1 : 1);
    this.spin += (yaw - this.spin) * Math.min(1, dt * (this.drift ? 3 : 12));
    const lat = this.spin * vf;   // cornering, m/s²: + is a left turn going forwards
    // the back wheels follow the front ones round a corner: the body turns about its back axle,
    // so its middle moves a little towards the inside of the bend as it turns (vl is + to the
    // right), and the way it's going turns with it; a sideways slide on top of that dies away as
    // the tyres bite. With the handbrake on, or in a donut, the back end lets go: it keeps going
    // the way it was while the nose comes round
    const loose = this.drift || hand || over;
    const track = loose ? 0 : -this.spin * half;
    vl = track + (vl - track) * Math.exp(-(this.drift ? 1.6 : hand ? 1.2 : over ? 3 : grass ? 4 : 9) * dt);
    // a donut goes round its front wheels, the back end swinging out round them
    const da = this.spin * dt;
    if (this.drift) { this.x += half * (c - Math.cos(this.a + da)); this.z -= half * (s - Math.sin(this.a + da)); }
    this.a += da;
    const cn = loose ? c : Math.cos(this.a), sn = loose ? s : Math.sin(this.a);
    this.vx = vf * cn + vl * sn; this.vz = -vf * sn + vl * cn;
    // the Robin: corner too hard for too long and it lifts a wheel, then goes over
    if (S.tip && !over) {
      this.tipT = Math.abs(lat) > S.tip && Math.abs(vf) > 7 ? this.tipT + dt : Math.max(0, this.tipT - dt * 2);
      if (this.tipT > 0.35) { this.tip = lat > 0 ? 1 : -1; this.flipped = true; this.tipT = 0; }
    }
    const teeter = S.tip && this.tipT > 0 ? Math.sign(lat) * Math.min(0.3, this.tipT * 0.8) : 0;
    this.lean += (Math.max(-0.1, Math.min(0.1, lat * S.lean)) + teeter - this.lean) * Math.min(1, dt * 6);
    // move, plough through the traffic, and bump off anything else in the way
    this.x += this.vx * dt; this.z += this.vz * dt;
    this.impact = 0;
    const soft = traffic ? new Set<Mover>(traffic.list) : null;
    if (traffic && soft) this.plough(traffic, soft);
    const pass = soft ? (m: Mover) => soft.has(m) : undefined;
    const c2 = Math.cos(this.a), s2 = Math.sin(this.a);
    for (let it = 0; it < 3; it++) {
      let bx = 0, bz = 0, best = 0;
      for (const o of this.circles) {
        const cx = this.x + o * c2, cz = this.z - o * s2;
        const p = map.collide({ x: cx, z: cz }, this.y, this.hw, this, pass);
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

  /**
   * Drive into a car in the traffic and it gives way: it's knocked on the way you hit it (and spun
   * round, if you caught it off centre), and you lose only as much speed as it takes to shift it.
   * It's a lot lighter than it ought to be, so a car ploughs through and a bus barely notices.
   */
  private plough(traffic: Shove, soft: Set<Mover>) {
    const mine = this.spec.mass;
    for (const o of soft as Set<Loose>) {
      if ((o as unknown) === this) continue;
      if (Math.abs(o.x - this.x) > this.hl + 4 || Math.abs(o.z - this.z) > this.hl + 4 || o.top < this.y + 0.45 || o.y > this.top) continue;
      const t = contact(this, this.circles, this.hw, o);
      if (!t) continue;
      // out of it (it's the other car that'll move, but not till the host says so)
      this.x += t.nx * t.depth; this.z += t.nz * t.depth;
      const vn = (this.vx - o.vx) * t.nx + (this.vz - o.vz) * t.nz;
      if (vn >= 0) continue;
      const J = (-(1 + BOUNCE) * vn) / (1 / mine + 1 / o.mass);
      this.vx += (t.nx * J) / mine; this.vz += (t.nz * J) / mine;
      this.impact = Math.max(this.impact, -vn * 0.8);
      // a clip on the corner swings the back end of both of you round
      const turns = (m: Mover, mass: number, k: number) => (k * twist(m.x, m.z, t.px, t.pz, t.nx, t.nz)) / (mass * (m.hl * m.hl + m.hw * m.hw) / 3);
      this.a += Math.max(-0.12, Math.min(0.12, turns(this, mine, J) * 0.03));
      const spin = Math.max(-4, Math.min(4, turns(o, o.mass, -J) * 0.6));
      if (J / o.mass > 0.3) traffic.hit(o, (-t.nx * J) / o.mass, (-t.nz * J) / o.mass, spin);
    }
  }

  /** Knocked by something with nobody at the wheel: off it slides, handbrake on, till it stops. */
  knock(dvx: number, dvz: number, spin: number, by: string) {
    this.vx += dvx; this.vz += dvz;
    this.a += Math.max(-0.3, Math.min(0.3, spin * 0.05));
    this.spin = spin;
    this.coast = Math.max(this.coast, 1);
    if (by) this.by = by;
    this.snaps = [];
  }

  /** Slide on for dt with nobody in it (bumping off walls, and into the traffic if given); true while it's still going. */
  slide(dt: number, paved: (x: number, z: number) => boolean, traffic?: Shove): boolean {
    this.drive(dt, { throttle: 0, steer: 0, handbrake: true, horn: false }, paved, traffic);
    this.coast -= dt;
    if (this.coast <= 0 && Math.hypot(this.vx, this.vz) < 0.3) { this.coast = 0; this.vx = this.vz = 0; this.spin = 0; }
    else this.coast = Math.max(this.coast, 0.05);
    this.hand = false;
    return this.coast > 0;
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
    const flags = (this.horn ? 1 : 0) | (this.gas > 0.05 ? 2 : 0) | (this.hand ? 4 : 0) | (this.siren ? 8 : 0);
    return [this.i, q(this.x), q(this.z), q(this.a), q(this.vx), q(this.vz), q(this.steer), this.tip, flags];
  }

  // ---- someone else driving it ---------------------------------------------------------------
  push(d: number[]) {
    const [, x, z, a, vx, vz, steer, tip, flags] = d;
    if (![x, z, a, vx, vz].every(Number.isFinite)) return;
    this.heard = performance.now();
    this.snaps.push({ t: this.heard, x, z, a, vx, vz, steer: steer || 0, tip: tip === 1 || tip === -1 ? tip : 0, flags: flags | 0 });
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
    const yaw = da / Math.max(0.001, (b.t - a.t) / 1000);
    this.x = a.x + (b.x - a.x) * f; this.z = a.z + (b.z - a.z) * f; this.a = a.a + da * f;
    this.vx = a.vx + (b.vx - a.vx) * f; this.vz = a.vz + (b.vz - a.vz) * f;
    this.steer = b.steer; this.tip = b.tip;
    this.horn = !!(b.flags & 1); this.gas = b.flags & 2 ? 1 : 0; this.hand = !!(b.flags & 4); this.siren = !!(b.flags & 8);
    const lat = b.t > a.t ? yaw * this.speed : 0;
    this.lean += (Math.max(-0.1, Math.min(0.1, lat * this.spec.lean)) - this.lean) * Math.min(1, dt * 6);
    this.engineNote(dt);
    this.moved = true;
  }

  // ---- drawing --------------------------------------------------------------------------------
  /** Sit it on the ground: height, and tilt from the slope under its wheels. And flash its lights. */
  pose(dt: number, now: number) {
    if (this.lights.length) {
      const on = this.siren && Math.floor(now / 250) % 2;
      this.lights[0].color.set(this.siren && on ? "#5d8bff" : "#1d3fa8");
      this.lights[1].color.set(this.siren && !on ? "#5d8bff" : "#1d3fa8");
    }
    const target = this.tip * 1.48;
    const rolling = Math.abs(target - this.roll) > 1e-3;
    if (!this.moved && !rolling) return;
    this.moved = false;
    const S = this.spec, c = Math.cos(this.a), s = Math.sin(this.a), half = S.wb / 2;
    const g = (x: number, z: number) => this.ground(x, z, this.y);
    const hF = g(this.x + c * half, this.z - s * half), hR = g(this.x - c * half, this.z + s * half);
    const hRt = g(this.x + s * this.hw, this.z + c * this.hw), hLt = g(this.x - s * this.hw, this.z - c * this.hw);
    this.y = (hF + hR) / 2;
    this.roll += (target - this.roll) * Math.min(1, dt * (this.tip ? 6 : 3));
    const over = Math.abs(Math.sin(this.roll));
    this.root.position.set(this.x, this.y + over * this.hw, this.z);
    this.body.rotation.set(this.lean + this.roll - Math.atan((hRt - hLt) / S.W), this.a, Math.atan((hF - hR) / S.wb));
    this.top = this.y + (this.tip ? S.W : S.H);
    this.waist = this.y + (this.tip ? S.W * 0.6 : S.waist);
    // the front wheels turn with the steering (less lock the faster it's going, as when driving) and roll with the road
    const sp = this.speed, want = this.steer * (S.steer / (1 + Math.abs(sp) / 24));
    this.turn += (want - this.turn) * Math.min(1, dt * 10);
    this.rolled = (this.rolled + (sp * dt) / 0.3) % (Math.PI * 2);
    for (const w of this.wheels) { w.rotation.y = this.turn; w.rotation.z = -this.rolled; }
  }
}

// ---- all of them ------------------------------------------------------------------------------
/** A seeded random number generator, so everyone builds the same vehicles in the same places. */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The Firs, by where everyone starts: one or two of everything, nose to tail. */
const FIRS: VKind[] = ["xr3i", "robin", "nova", "icecream", "metro", "police", "xr3i", "sierra", "c5", "transit", "robin", "milkfloat", "metro", "nova", "sierra"];
/** Fox Hill: the estate, and what the lads there drive. */
const FOX: VKind[] = ["nova", "nova", "metro", "nova", "xr3i", "nova", "metro"];

export interface Stop { x: number; z: number; a: number }
/** Past this, a TILE_CAR number is a square's cricket roller (its pitch number added), not one of its parked cars. */
const ROLLER = 65000;

export class Vehicles {
  /** The ones that are vehicles now: the ones built from the start, then any parked car someone's got in. */
  readonly list: Vehicle[] = [];
  private byI = new Map<number, Vehicle>();
  /** Where the parked cars' numbers start: map.spare[k] is vehicle base + k. */
  private base = 0;
  private add: (i: number, kind: VKind, paint: string, x: number, z: number, a: number, label?: string) => Vehicle;
  /** Bus stops: where a bus can pull in (the flag's spot and the way the street runs, scene coords). */
  readonly stops: Stop[] = [];
  /** The bus stops out in each square of Bath, as it's loaded. */
  private tileStops = new WeakMap<GameMap, Stop[]>();
  private tilesSeen = -1;

  constructor(private map: GameMap, scene: THREE.Scene, ground: (x: number, z: number, y?: number) => number) {
    const rand = seeded(2718);
    this.add = (i: number, kind: VKind, paint: string, x: number, z: number, a: number, label = "") => {
      const v = new Vehicle(i, kind, paint, map, ground, label);
      v.place(x, z, a);
      v.pose(1, 0);
      this.list.push(v);
      this.byI.set(i, v);
      scene.add(v.root);
      map.movers.push(v);
      return v;
    };
    const add = (kind: VKind, x: number, z: number, a: number) => {
      const P = SPECS[kind].paint;
      return this.add(this.list.length, kind, P[Math.floor(rand() * P.length)], x, z, a);
    };
    // the cars that were parked on the streets you can drive along
    const spots = map.parked.map((p) => ({ x: p.x, z: -p.y, a: p.a, street: p.street }));
    const firs = spots.filter((p) => p.street === "The Firs");
    // a double-decker on The Firs, in the longest gap between two cars parked nose to tail: just
    // ahead of the one behind, with the road clear in front of it to pull out
    const bus = SPECS.bus, ahead = 2.05 + 1.5 + bus.L / 2;   // from the car behind to the bus's middle
    let best: { x: number; z: number; a: number } | null = null, bestGap = 0;
    for (const p of firs) for (const q of firs) {
      const dx = q.x - p.x, dz = q.z - p.z, gap = Math.hypot(dx, dz);
      const c = Math.cos(p.a), s = Math.sin(p.a), across = Math.abs(dx * s + dz * c);
      const turn = Math.abs(Math.atan2(Math.sin(q.a - p.a), Math.cos(q.a - p.a)));
      if (gap < ahead + bus.L / 2 + 2.05 + 5 || gap > 70 || gap <= bestGap || across > 1.2 || (turn > 0.4 && turn < Math.PI - 0.4)) continue;
      if (firs.some((o) => o !== p && o !== q && Math.hypot(o.x - p.x, o.z - p.z) < gap && Math.hypot(o.x - q.x, o.z - q.z) < gap)) continue;
      const way = dx * c - dz * s > 0 ? 1 : -1, behind = way > 0 ? p : q, ux = (dx / gap) * way, uz = (dz / gap) * way;
      for (const shift of [0, 1, 2, 3]) {
        const x = behind.x + ux * (ahead + shift), z = behind.z + uz * (ahead + shift);
        const clear = [-1, -0.5, 0, 0.5, 1, 1.35, 1.7, 2.05, 2.4].every((k) => !map.blocked(x + c * k * (bus.L / 2 - 1), z - s * k * (bus.L / 2 - 1), bus.W / 2));
        if (clear) { best = { x, z, a: p.a }; bestGap = gap; break; }
      }
    }
    if (best) add("bus", best.x, best.z, best.a);
    let f = 0, fox = 0;
    for (const p of spots) {
      const kind = p.street === "The Firs" ? FIRS[f++ % FIRS.length] : FOX[fox++ % FOX.length];
      add(kind, p.x, p.z, p.a);
    }
    // bus stops, and a bus waiting at some of them: double-deckers and minibuses turn and turn about
    for (const s of map.d.fx ?? []) {
      if (s[0] !== "bus") continue;
      const [, x, y, , a] = s as [string, number, number, number, number];
      this.stops.push({ x, z: -y, a });
    }
    let n = 0;
    this.stops.forEach((s) => {
      if (rand() > 0.35) return;
      const kind: VKind = n % 2 ? "minibus" : "bus", at = this.stopSpot(s, kind);
      if (at) { add(kind, at.x, at.z, at.a); n++; }
    });
    // the heavy roller beside each cricket square
    for (const p of map.d.pi ?? []) {
      const at = this.rollerSpot(p);
      if (at) add("roller", at[0], at[1], at[2]);
    }
    this.base = this.list.length;
  }

  /** Where a cricket field's heavy roller stands, beside the square: scene x, z and angle. */
  private rollerSpot(p: NonNullable<GameMap["d"]["pi"]>[number]): number[] | null {
    if (p[0] !== "c") return null;
    const cx = p[1], cz = -p[2], a = p[3], ox = -Math.sin(a), oz = -Math.cos(a);   // across the wicket, in scene coords
    for (const d of [16, -16, 22, -22]) {
      const x = cx + ox * d, z = cz + oz * d;
      if (!this.map.blocked(x, z, 1.2)) return [x, z, a];
    }
    return null;
  }

  /** The rollers out at the cricket fields in a square of Bath (TILE_CAR numbers past ROLLER), once it's loaded. */
  private rollersIn(m: GameMap) {
    const [ti, tj] = m.d.tile ?? [0, 0];
    (m.d.pi ?? []).forEach((p, k) => {
      const i = TILE_CAR + tileKey(ti, tj) * 65536 + ROLLER + k;
      if (this.byI.has(i)) return;
      const at = this.rollerSpot(p);
      if (at) this.add(i, "roller", SPECS.roller.paint[0], at[0], at[1], at[2]);
    });
  }

  /** The bus stops in a square of Bath. */
  private stopsIn(m: GameMap): Stop[] {
    let out = this.tileStops.get(m);
    if (!out) this.tileStops.set(m, (out = (m.d.fx ?? []).filter((f) => f[0] === "bus").map((f) => ({ x: +f[1], z: -f[2], a: +f[4] }))));
    return out;
  }

  /** The bus stops within r of (x, z), in Combe Down and the squares of Bath loaded there. */
  stopsNear(x: number, z: number, r: number): Stop[] {
    return [...this.stops, ...this.map.tilesNear(x, z, r).flatMap((m) => this.stopsIn(m))].filter((s) => Math.hypot(s.x - x, s.z - z) < r);
  }

  /** Every bus stop there is just now: Combe Down's, and those of every square of Bath loaded. */
  allStops(): Stop[] {
    return [...this.stops, ...[...this.map.tiles.values()].flatMap((m) => this.stopsIn(m))];
  }

  /** Vehicle i, turning a parked car into one if it's not been driven yet; undefined if there's no such vehicle. */
  get(i: number): Vehicle | undefined {
    const had = this.byI.get(i);
    if (had || !Number.isInteger(i) || i < this.base) return had;
    // a parked car out in a square of Bath: only if that square's loaded here (if not, the host's word on it brings it: spawn)
    if (i >= TILE_CAR) {
      const [key, k] = GameMap.tileCar(i), m = this.map.tiles.get(key);
      if (k >= ROLLER) { if (m) this.rollersIn(m); return this.byI.get(i); }
      const s = m?.spare[k];
      if (!s || s.taken) return undefined;
      const [, x, y, , a, n] = s.f as [string, number, number, number, number, number];
      return this.spawn(i, n, k, x, -y, a);
    }
    const k = i - this.base, s = this.map.spare[k];
    if (!s || s.taken) return undefined;   // (gone: knocked into the traffic)
    const [, x, y, , a, n] = s.f as [string, number, number, number, number, number];
    this.map.takeCar(k);
    return this.add(i, "car", CAR_PAINT[n % CAR_PAINT.length], x, -y, a, MAKES[k % MAKES.length]);
  }

  /** A car pulled out of the traffic (traffic.ts), or a parked one out in Bath, as vehicle i, with paint and make by number. */
  spawn(i: number, paint: number, make: number, x: number, z: number, a: number): Vehicle {
    const v = this.byI.get(i) ?? this.add(i, "car", CAR_PAINT[paint % CAR_PAINT.length], x, z, a, MAKES[make % MAKES.length]);
    v.made = [paint, make];
    if (i >= TILE_CAR) this.map.takeTileCar(i);   // off the street it was parked in
    return v;
  }

  /** Where a bus of this kind would pull in at a stop, kerbside on its left, or null if there's no room. */
  stopSpot(s: Stop, kind: VKind): { x: number; z: number; a: number } | null {
    const S = SPECS[kind], tx = Math.sin(s.a), tz = Math.cos(s.a), c = Math.cos(s.a), sn = Math.sin(s.a);
    for (const off of [S.W / 2 + 0.85, S.W / 2 + 1.2, S.W / 2 + 1.6]) {
      const x = s.x + tx * off, z = s.z + tz * off;
      const clear = [-1, -0.5, 0, 0.5, 1].every((k) => !this.map.blocked(x + c * k * (S.L / 2 - S.W / 2), z - sn * k * (S.L / 2 - S.W / 2), S.W / 2 - 0.05));
      if (clear && this.map.fieldEdge(x, z) > S.L) return { x, z, a: s.a };
    }
    return null;
  }

  /** The nearest vehicle within reach of (x, z), about level with y, with a seat free (a parked car counts), if any. */
  nearest(x: number, z: number, y: number, reach: number): { i: number; name: string; driver: string } | null {
    let best: { i: number; name: string; driver: string } | null = null, bd = reach;
    for (const v of this.list) {
      if (Math.abs(v.x - x) > 12 || Math.abs(v.z - z) > 12 || Math.abs(v.y - y) > 2.5) continue;
      const d = v.distance(x, z);
      if (d < bd && v.freeSeat() >= 0 && !v.driver.startsWith("@")) { bd = d; best = v; }
    }
    const S = this.map.spare, z0 = this.map.z0;
    for (let k = 0; k < S.length; k++) {
      const [, fx, fy, fz, a] = S[k].f as [string, number, number, number, number];
      const dx = x - fx, dz = z + fy;
      if (Math.abs(dx) > 5 || Math.abs(dz) > 5 || S[k].taken || this.byI.has(this.base + k) || Math.abs(fz - z0 - y) > 2.5) continue;
      const c = Math.cos(a), s = Math.sin(a);
      const d = Math.hypot(Math.max(0, Math.abs(dx * c - dz * s) - 2.05), Math.max(0, Math.abs(dx * s + dz * c) - 0.88));
      if (d < bd) { bd = d; best = { i: this.base + k, name: MAKES[k % MAKES.length], driver: "" }; }
    }
    // and those parked out in Bath
    for (const m of this.map.tilesNear(x, z, 6)) {
      const [ti, tj] = m.d.tile ?? [0, 0];
      for (const k of m.spareNear(x, z, 6)) {
        const [, fx, fy, fz, a] = m.spare[k].f as [string, number, number, number, number];
        if (Math.abs(fz - z0 - y) > 2.5) continue;
        const dx = x - fx, dz = z + fy, c = Math.cos(a), s = Math.sin(a);
        const d = Math.hypot(Math.max(0, Math.abs(dx * c - dz * s) - 2.05), Math.max(0, Math.abs(dx * s + dz * c) - 0.88));
        if (d < bd) { bd = d; best = { i: TILE_CAR + tileKey(ti, tj) * 65536 + k, name: MAKES[k % MAKES.length], driver: "" }; }
      }
    }
    return best;
  }

  /** The parked cars still in the street furniture within r of (x, z), in Combe Down and out in Bath: their vehicle numbers, scene coords, angle and the ground under them. */
  parkedNear(x: number, z: number, r: number): { i: number; x: number; z: number; a: number; g: number }[] {
    const out: { i: number; x: number; z: number; a: number; g: number }[] = [], z0 = this.map.z0;
    const at = (m: GameMap, k: number, i: number) => {
      const [, fx, fy, fz, a] = m.spare[k].f as [string, number, number, number, number];
      out.push({ i, x: fx, z: -fy, a, g: fz - z0 });
    };
    for (const k of this.map.spareNear(x, z, r)) if (!this.byI.has(this.base + k)) at(this.map, k, this.base + k);
    for (const m of this.map.tilesNear(x, z, r)) {
      const [ti, tj] = m.d.tile ?? [0, 0];
      for (const k of m.spareNear(x, z, r)) at(m, k, TILE_CAR + tileKey(ti, tj) * 65536 + k);
    }
    return out;
  }

  /** Parked car i (a vehicle number) knocked out of the street furniture: off the street it comes, and where it was and its paint. Null if it's not here. */
  unpark(i: number): { x: number; z: number; a: number; paint: number } | null {
    if (!Number.isInteger(i) || i < this.base || this.byI.has(i)) return null;
    let s: GameMap["spare"][number] | undefined;
    if (i >= TILE_CAR) {
      const [key, k] = GameMap.tileCar(i);
      s = this.map.tiles.get(key)?.spare[k];
      if (!s || s.taken) return null;
      this.map.takeTileCar(i);
    } else {
      s = this.map.spare[i - this.base];
      if (!s || s.taken) return null;
      this.map.takeCar(i - this.base);
    }
    const [, x, y, , a, n] = s.f as [string, number, number, number, number, number];
    return { x, z: -y, a, paint: n % CAR_PAINT.length };
  }

  /** The vehicle and seat someone's in, if any. */
  of(id: string): { v: Vehicle; seat: number } | undefined {
    for (const v of this.list) {
      const seat = v.seats.indexOf(id);
      if (seat >= 0) return { v, seat };
    }
    return undefined;
  }

  /** Smooth the ones other people are driving, and sit them all on the ground. local: ones driven here. */
  update(now: number, dt: number, local: (v: Vehicle) => boolean, px: number, pz: number) {
    // a square of Bath loaded: out come its cricket rollers
    if (this.tilesSeen !== this.map.tilesVersion) {
      this.tilesSeen = this.map.tilesVersion;
      for (const m of this.map.tiles.values()) this.rollersIn(m);
    }
    for (const v of this.list) {
      // (one nobody's in, knocked sliding, is moved by the host)
      if ((v.driver && !local(v)) || (!v.driver && !local(v) && now - v.heard < 400)) v.follow(now, dt);
      v.pose(dt, now);
      v.root.visible = Math.hypot(v.x - px, v.z - pz) < 260;
    }
  }

  /** The host's word on which vehicles there are, who's sitting where, and where everything is:
   * { i: numbers, s: seats ("" each, joined by commas), p: [x, z, angle, tip, ...], m: [paint, make] for any taken from the traffic, else 0 }. */
  snapshot(): { i: number[]; s: string[]; p: number[]; m: (number[] | 0)[] } {
    const q = (v: number) => Math.round(v * 100) / 100;
    return {
      i: this.list.map((v) => v.i), s: this.list.map((v) => v.seats.join(",")),
      p: this.list.flatMap((v) => [q(v.x), q(v.z), q(v.a), v.tip]), m: this.list.map((v) => v.made ?? 0),
    };
  }
}
