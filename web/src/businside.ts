// The inside of a Badgerline bus or minibus (and the school's minibus): rows of double seats in green
// moquette facing forward either side of the gangway, cream panels under and over the windows with
// pillars between them that line up with the windows painted on the outside, a ceiling with its
// lights, yellow grab poles and rails with the red bell pushes on them, and on the double-decker the
// stairs up behind the driver's cab and the rail round the top of them. The driver's cab itself is
// cockpit.ts's. People sit in the seats: whoever's in a passenger seat (vehicles.ts), and the
// passengers you've picked up on your route (busdriver.ts), each in a seat of their own.
//
// The bus's body is painted on the outside only, so none of this shows from the street; it's built
// (once for each kind of bus, and shared) and drawn only while you're in that bus.
//
// Who decides what: nothing here goes over the network. Every player builds the same inside from the
// kind of bus, and the passengers in it are the driver's own (busdriver.ts).
import * as THREE from "three";
import { model, type Part } from "./furniture";

/** A double seat: how far along the bus (+ forward), the floor it's on and which side (+1 the driver's, the offside). */
export interface Bench { x: number; floor: number; side: number }

interface Plan {
  L: number; W: number; H: number; decks: 1 | 2;
  floors: number[];          // each deck's floor, from the bottom up
  benches: Bench[];
  cab: number;               // downstairs, nothing of ours forward of this (the cab and the door: cockpit.ts)
}

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (r: number, h: number, seg = 8) => new THREE.CylinderGeometry(r, r, h, seg);
const rows = (from: number, to: number, step = 0.8) => { const out: number[] = []; for (let x = from; x >= to - 1e-6; x -= step) out.push(Math.round(x * 100) / 100); return out; };

/** Where everything goes in each kind. The passenger seats in vehicles.ts sit on these benches. */
export function plan(kind: "bus" | "minibus" | "school", L: number, W: number, H: number): Plan {
  if (kind === "bus") {
    const lo = 0.5, hi = 2.55, benches: Bench[] = [];
    // downstairs: the nearside from just behind the door, the offside from behind the stairs
    for (const x of rows(2.3, -4.1)) benches.push({ x, floor: lo, side: -1 });
    for (const x of rows(1.0, -3.8)) benches.push({ x, floor: lo, side: 1 });
    // upstairs: right to the front over the cab (the best seats on the bus), but not over the stairs
    for (const x of rows(3.9, -4.1)) benches.push({ x, floor: hi, side: -1 });
    for (const x of [3.9, ...rows(1.0, -3.8)]) benches.push({ x, floor: hi, side: 1 });
    return { L, W, H, decks: 2, floors: [lo, hi], benches, cab: L / 2 - 1.45 };
  }
  const lo = 0.5, benches: Bench[] = [];
  for (const side of [-1, 1]) for (const x of rows(1.7, -3.1)) benches.push({ x, floor: lo, side });
  return { L, W, H, decks: 1, floors: [lo], benches, cab: L / 2 - 1.4 };
}

/** The stairwell on the double-decker, offside, behind the cab: along from, to, and across from, to. */
export const STAIRS = { x0: 1.55, x1: 3.3, z0: 0.3, z1: 1.2 };

const MOQUETTE = "#2e5b3c", MOQ_TOP = "#24492f", FRAME = "#7c8186", POLE = "#e8c11c", BELL = "#d42a1e";
const LOWER = "#6d7466", CREAM = "#e3dccb", PILLAR = "#d4ccb6", CEILING = "#ece6d6", LIGHT = "#fffbe8", TREAD = "#45484b";

/** The inside, as one geometry in the bus's own frame (+x forward, y up from the road, +z the offside). */
export function insideGeometry(p: Plan): THREE.BufferGeometry {
  const parts: Part[] = [], hw = p.W / 2, wall = hw - 0.05, two = p.decks === 2, back = -p.L / 2 + 0.05, front = p.L / 2 - 0.05;
  const inner = wall - 0.06, aisle = 0.25;   // a bench runs from the gangway out to the wall
  const span = inner - aisle, mid = (inner + aisle) / 2;
  // ---- the seats
  for (const b of p.benches) {
    const z = b.side * mid, f = b.floor;
    parts.push(
      [box(0.46, 0.12, span), MOQUETTE, b.x, f + 0.42, z],                    // the cushion
      [box(0.09, 0.62, span), MOQUETTE, b.x - 0.25, f + 0.76, z],              // the back
      [box(0.1, 0.06, span), MOQ_TOP, b.x - 0.25, f + 1.08, z],                // its top
      [box(0.05, 0.36, 0.05), FRAME, b.x, f + 0.18, b.side * (aisle + 0.06)],  // the leg on the gangway side
      [box(0.05, 0.05, 0.3), POLE, b.x - 0.25, f + 1.13, b.side * (aisle + 0.16)],   // the handle on its back
    );
  }
  // ---- the walls: panels under and over the windows, pillars between them, as painted outside (vehicles.ts busSide)
  const win = two ? [[1.48, 2.3], [2.88, 3.7]] : [[1.22, 2.2]];
  const ceil = two ? [p.floors[1] - 0.01, p.H - 0.06] : [p.H - 0.1];
  const run = (deck: number, side: number) => {
    const f = p.floors[deck], [w0, w1] = win[deck], c = ceil[deck], z = side * wall;
    // downstairs the cab and the door take the front
    const x1 = deck === 0 ? p.cab : front;
    const len = x1 - back, cx = (x1 + back) / 2;
    parts.push([box(len, w0 - f, 0.03), LOWER, cx, (f + w0) / 2, z], [box(len, c - w1, 0.03), CREAM, cx, (w1 + c) / 2, z]);
    // the pillars, where the windows outside stop and start (along from the back)
    const first = deck === 0 ? 0.35 : 0.3, step = deck === 0 ? 1.35 : 1.48, wide = deck === 0 ? 1.2 : 1.33;
    for (let a = first + wide; a < p.L - 0.3; a += step) {
      const x = a + (step - wide) / 2 - p.L / 2;
      if (x < x1) parts.push([box(step - wide + 0.02, w1 - w0, 0.05), PILLAR, x, (w0 + w1) / 2, z]);
    }
  };
  for (let d = 0; d < p.decks; d++) {
    run(d, -1); run(d, 1);
    const f = p.floors[d], [w0, w1] = win[d], c = ceil[d];
    // the back: solid on the bottom deck of the double-decker (the engine's behind it), else a window
    if (two && d === 0) parts.push([box(0.04, c - f, p.W - 0.1), LOWER, back, (f + c) / 2, 0]);
    else parts.push([box(0.04, w0 - f, p.W - 0.1), LOWER, back, (f + w0) / 2, 0], [box(0.04, c - w1, p.W - 0.1), CREAM, back, (w1 + c) / 2, 0]);
    // upstairs, the front too, under the big front windows
    if (two && d === 1) parts.push([box(0.04, w0 - f, p.W - 0.1), LOWER, front, (f + w0) / 2, 0], [box(0.04, c - w1, p.W - 0.1), CREAM, front, (w1 + c) / 2, 0]);
    // the ceiling (downstairs on the double-decker, it's the top deck's floor) and its lights
    const x1 = d === 0 ? p.cab : front;
    if (!two || d === 1) parts.push([box(x1 - back, 0.02, p.W - 0.1), CEILING, (x1 + back) / 2, c, 0]);
    for (const s of [-1, 1]) parts.push([box(x1 - back - 0.4, 0.03, 0.14), LIGHT, (x1 + back) / 2, c - 0.02, s * (hw - 0.45)]);
    // the grab rails along the gangway, and poles down to the seats every other row, some with a bell push
    for (const s of [-1, 1]) {
      parts.push([box(x1 - back - 0.3, 0.035, 0.035), POLE, (x1 + back) / 2, c - 0.2, s * 0.32]);
      const mine = p.benches.filter((b) => b.floor === f && b.side === s);
      mine.forEach((b, k) => {
        if (k % 2) return;
        const px = b.x + 0.27, pz = s * (aisle + 0.02);
        parts.push([cyl(0.022, c - f), POLE, px, (f + c) / 2, pz]);
        if (k % 4 === 0) parts.push([box(0.05, 0.08, 0.05), BELL, px, f + 1.45, pz]);
      });
    }
  }
  // ---- the double-decker's stairs, up behind the cab, and the rail round the top of them
  if (two) {
    const { x0, x1, z0, z1 } = STAIRS, lo = p.floors[0], hi = p.floors[1], n = 11, rise = (hi - lo) / n, tread = (x1 - x0) / n;
    for (let i = 0; i < n; i++) {
      const top = lo + rise * (i + 1), x = x1 - tread * (i + 0.5);
      parts.push([box(tread + 0.01, top - lo, z1 - z0), TREAD, x, (lo + top) / 2, (z0 + z1) / 2], [box(0.03, 0.015, z1 - z0), POLE, x + tread / 2 - 0.02, top + 0.005, (z0 + z1) / 2]);
    }
    // the handrail up the gangway side, on posts
    const slope = Math.atan2(hi - lo, x1 - x0), len = Math.hypot(hi - lo, x1 - x0);
    parts.push([box(len, 0.035, 0.035).rotateZ(-slope), POLE, (x0 + x1) / 2, (lo + hi) / 2 + 0.9, z0 - 0.02]);
    for (const f of [0.15, 0.5, 0.85]) parts.push([cyl(0.022, 0.9), POLE, x1 - (x1 - x0) * f, lo + (hi - lo) * f + 0.45, z0 - 0.02]);
    // upstairs: a screen at the front of the stairwell and a rail along its gangway side
    parts.push([box(0.04, 0.95, z1 - z0), CREAM, x1 + 0.02, hi + 0.48, (z0 + z1) / 2], [box(x1 - x0 - 0.35, 0.035, 0.035), POLE, (x0 + x1 + 0.35) / 2, hi + 0.95, z0 - 0.02]);
    parts.push([box(x1 - x0 - 0.35, 0.5, 0.03), CREAM, (x0 + x1 + 0.35) / 2, hi + 0.25, z0 - 0.02]);
  }
  return model(parts);
}

/** The top deck's floor, with the stairwell left open. */
export function upperFloor(L: number, W: number, y: number): THREE.BufferGeometry[] {
  const { x0, x1, z0 } = STAIRS, l = -(L - 0.1) / 2, r = (L - 0.1) / 2, n = -(W - 0.1) / 2, f = (W - 0.1) / 2;
  const rect = (a: number, b: number, c: number, d: number) => {
    const g = new THREE.PlaneGeometry(b - a, d - c);
    g.rotateX(-Math.PI / 2);
    g.translate((a + b) / 2, y, (c + d) / 2);
    return g;
  };
  return [rect(l, x0, n, f), rect(x1, r, n, f), rect(x0, x1, n, z0)];
}

/** The two places on a bench (the gangway's and the window's), across. */
export function places(p: Plan, b: Bench): number[] {
  const inner = p.W / 2 - 0.11, aisle = 0.25, q = (inner - aisle) / 4;
  return [b.side * (aisle + q), b.side * (inner - q)];
}

/** Someone sat down, facing forward (+x), in their coat, trousers, hair, skin and shoes: for the passengers (busdriver.ts). */
export function seatedGeometry(coat: string, legs: string, hair: string, skin: string, shoes: string, extra = ""): THREE.BufferGeometry {
  const parts: Part[] = [
    [box(0.42, 0.14, 0.15), legs, 0.13, 0.55, -0.1], [box(0.42, 0.14, 0.15), legs, 0.13, 0.55, 0.1],   // thighs, on the seat
    [box(0.14, 0.5, 0.14), legs, 0.33, 0.25, -0.1], [box(0.14, 0.5, 0.14), legs, 0.33, 0.25, 0.1],     // shins
    [box(0.24, 0.07, 0.15), shoes, 0.38, 0.035, -0.1], [box(0.24, 0.07, 0.15), shoes, 0.38, 0.035, 0.1],
    [box(0.26, 0.58, 0.42), coat, -0.06, 0.88, 0],                                                       // body
    [box(0.13, 0.5, 0.12), coat, -0.02, 0.88, -0.27], [box(0.13, 0.5, 0.12), coat, -0.02, 0.88, 0.27],  // arms, hands in laps
    [box(0.1, 0.1, 0.1), skin, 0.18, 0.66, -0.15], [box(0.1, 0.1, 0.1), skin, 0.18, 0.66, 0.15],
    [box(0.1, 0.08, 0.1), skin, -0.05, 1.2, 0], [box(0.23, 0.25, 0.23), skin, -0.04, 1.35, 0], [box(0.25, 0.09, 0.25), hair, -0.05, 1.5, 0],
    [box(0.02, 0.03, 0.04), "#2a2220", 0.075, 1.38, -0.05], [box(0.02, 0.03, 0.04), "#2a2220", 0.075, 1.38, 0.05],
  ];
  if (extra === "trolley") parts.push([box(0.24, 0.4, 0.3), "#8a2a2a", 0.4, 0.2, -0.45]);   // her trolley in the gangway
  if (extra === "bag") parts.push([box(0.2, 0.3, 0.3), "#30343a", 0.25, 0.8, 0]);          // a rucksack on the lap
  if (extra === "vest") parts.push([box(0.28, 0.4, 0.44), "#e8f02a", -0.06, 0.95, 0]);
  return model(parts);
}

let mat: THREE.MeshLambertMaterial | null = null;
/** The material for the inside and the people in it: lit a little by the bus's own lights, so it's never black. */
export function insideMaterial(): THREE.MeshLambertMaterial {
  return mat ??= new THREE.MeshLambertMaterial({ vertexColors: true, emissive: new THREE.Color("#2b2a24") });
}
