// Coaches: Arleen's, the coach firm from Peasedown St John, in the 80s and 90s. Two bodies: the
// Plaxton Paramount 3500, square-cut and tall, with deep glass at the front by the driver and the door
// stepping down from the side windows' line; and the Van Hool Alizée, rounder, with a big upright
// windscreen and the window line sweeping down to meet it. Both are white, with a blue and red
// stripe under the windows, ARLEEN in blue with its red shadow along each side and across the back,
// and the three circles, red, blue and red. vehicles.ts makes them drivable (and cockpit.ts gives
// them a cab), parks them at the bus station and by the sights, and traffic.ts drives a few about
// on the main roads (makes.ts says which of the traffic they are).
// Just the look: nothing here goes over the network.
import * as THREE from "three";
import type { Part, Wheel } from "./furniture";
import { model, prof, steerable } from "./furniture";
import type { Lamps } from "./headlights";

export type CoachStyle = 0 | 1;   // 0 the Paramount, 1 the Alizée
/** Their size: length, width and height, the wheelbase, and where the axles are along them. */
export const COACH = { L: 12, W: 2.5, H: [3.5, 3.45], front: 3.75, rear: -2.45 };
/** Where their headlamps and tail lights are, to light up after dark (headlights.ts). */
export const COACH_LAMPS: Lamps = { front: [6.04, 0.95, 0.94, 0.42, 0.13], back: [-6.02, 1.05, 1.06, 0.18, 0.48] };
/** Where each one's windscreen runs: from its foot (along, up) to its top, for the cab (cockpit.ts). */
export const SCREENS: [number[], number[]][] = [[[6.0, 1.3], [5.76, 3.02]], [[6.0, 1.2], [5.92, 3.05]]];

const WHITE = "#f4f4f0", GLASS = "#1b2329", BLACK = "#17181a", LAMP = "#e9ecee", TAIL = "#a3221b", BLUE = "#1d5fc4", RED = "#e2232a";
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (r: number, h: number, seg = 14) => new THREE.CylinderGeometry(r, r, h, seg);

/** A coach's parts: the body, its glass all round (one piece, so it vanishes from inside, for the driver's view), and its bits, then its wheels. */
export function coachParts(style: CoachStyle): Part[] {
  const W = COACH.W, H = COACH.H[style], hw = W / 2, [foot, top] = SCREENS[style];
  const body = style === 0
    ? [[-6.0, 0.35], [5.95, 0.35], [6.02, 0.75], foot, top, [5.62, 3.4], [5.35, H], [-5.8, H], [-6.0, 3.3]]
    : [[-6.0, 0.35], [5.95, 0.35], [6.02, 0.7], foot, top, [5.7, 3.32], [5.3, H], [-5.6, H], [-5.9, 3.38], [-6.0, 3.15]];
  // the glass: the windscreen, deep glass at the front, and the side windows; the Paramount's step down at the door, the Alizée's sweep
  const glass = style === 0
    ? [[-5.62, 1.88], [4.3, 1.88], [4.3, 1.3], [foot[0] + 0.02, foot[1]], [top[0] + 0.02, top[1]], [-5.62, 3.04]]
    : [[-5.5, 1.8], [3.4, 1.8], [4.9, 1.22], [foot[0] + 0.02, foot[1]], [top[0] + 0.02, top[1]], [-5.5, 3.04]];
  const parts: Part[] = [
    [prof(body, W), WHITE, 0, 0, 0],
    [prof(glass, W + 0.02), GLASS, 0, 0, 0],
  ];
  if (style === 1) parts.push([box(10.6, 0.08, W - 0.3), WHITE, -0.3, H + 0.03, 0]);   // the Alizée's roof, rounded off at its edges
  // the pillars between the side windows, just skins on the sides
  const posts = style === 0 ? [-5.0, -3.6, -2.2, -0.8, 0.6, 2.0, 3.4, 4.3] : [-4.9, -3.5, -2.1, -0.7, 0.7, 2.1, 3.3];
  for (const x of posts) for (const z of [hw + 0.012, -hw - 0.012]) parts.push([box(0.14, 1.2, 0.02), WHITE, x, 2.45, z]);
  // the stripe under the windows, blue over red, and the locker doors along the bottom
  const stripeEnd = style === 0 ? 4.25 : 3.35;   // as far as the deep glass at the front
  for (const z of [hw + 0.005, -hw - 0.005]) {
    parts.push([box(stripeEnd + 5.95, 0.07, 0.02), BLUE, (stripeEnd - 5.95) / 2, 1.72, z], [box(stripeEnd + 5.95, 0.035, 0.02), RED, (stripeEnd - 5.95) / 2, 1.645, z]);
    for (const x of [-4.2, -2.5, -0.8, 0.9, 2.4]) parts.push([box(0.025, 0.85, 0.02), "#c9cbcd", x, 0.85, z]);
    // the wheel arches: a dark half round over each wheel
    const arch = new THREE.CircleGeometry(0.66, 16, 0, Math.PI);
    for (const x of [COACH.front, COACH.rear]) parts.push([z > 0 ? arch : arch.clone().rotateY(Math.PI), "#141516", x, 0.52, z + Math.sign(z) * 0.003]);
  }
  // the door, at the front on the nearside: glass down to the step
  parts.push([box(0.95, 0.9, 0.02), GLASS, 5.25, 0.85, -hw - 0.012]);
  // the front: bumper, grille, lamps, plate, and mirrors out on their arms
  parts.push(
    [box(0.16, 0.35, W + 0.02), BLACK, 5.98, 0.53, 0], [box(0.03, 0.26, 1.2), "#2a2c2e", 6.03, 0.98, 0],
    [box(0.03, 0.13, 0.22), LAMP, 6.035, 0.95, 0.82], [box(0.03, 0.13, 0.22), LAMP, 6.035, 0.95, -0.82],
    [box(0.03, 0.13, 0.18), LAMP, 6.035, 0.95, 1.06], [box(0.03, 0.13, 0.18), LAMP, 6.035, 0.95, -1.06],
    [box(0.03, 0.06, 0.16), "#e0902a", 6.035, 0.78, 1.04], [box(0.03, 0.06, 0.16), "#e0902a", 6.035, 0.78, -1.04],
    [box(0.03, 0.11, 0.52), "#f2f2ea", 6.07, 0.5, 0],
    [box(0.05, 0.05, 0.42), BLACK, 5.86, 2.55, hw + 0.2], [box(0.05, 0.05, 0.42), BLACK, 5.86, 2.55, -hw - 0.2],
    [box(0.07, 0.36, 0.2), BLACK, 5.88, 2.38, hw + 0.4], [box(0.07, 0.36, 0.2), BLACK, 5.88, 2.38, -hw - 0.4],
  );
  if (style === 1) parts.push([box(0.02, 0.05, 0.38), "#c9ccd0", 6.04, 1.2, 0]);   // the VAN HOOL badge
  // the back: the rear window, the engine's louvres, the lamp clusters up the corners, and the plate
  parts.push([box(0.02, 0.95, W - 0.4), GLASS, -6.01, 2.5, 0]);
  for (let k = 0; k < 4; k++) parts.push([box(0.02, 0.04, 1.6), "#2a2c2e", -6.01, 0.62 + k * 0.09, 0]);
  for (const z of [1.06, -1.06]) parts.push([box(0.03, 0.48, 0.18), TAIL, -6.015, 1.05, z], [box(0.03, 0.12, 0.18), "#e0902a", -6.015, 1.38, z]);
  parts.push([box(0.16, 0.3, W + 0.02), BLACK, -5.98, 0.5, 0], [box(0.03, 0.11, 0.52), "#e8c42a", -6.07, 0.52, 0]);
  // and the wheels: big ones, with silver hubs
  for (const x of [COACH.front, COACH.rear]) for (const z of [hw - 0.13, -hw + 0.13]) {
    parts.push([cyl(0.52, 0.3), "#151515", x, 0.52, z, Math.PI / 2], [cyl(0.3, 0.31, 12), "#b9bcc0", x, 0.52, z, Math.PI / 2], [cyl(0.1, 0.32, 8), "#2a2c2e", x, 0.52, z, Math.PI / 2]);
  }
  return parts;
}

const steered: { body: THREE.BufferGeometry; wheels: Wheel[] }[] = [];
/** A coach for the traffic (traffic.ts): its body in one piece, and its front wheels on their own to turn with the steering. */
export function coachSteerable(style: CoachStyle): { body: THREE.BufferGeometry; wheels: Wheel[] } {
  if (!steered[style]) { const { fixed, wheels } = steerable(coachParts(style)); steered[style] = { body: model(fixed), wheels }; }
  return steered[style];
}

// ---- Arleen's lettering ---------------------------------------------------------------------
let decalMats: THREE.Material[] | null = null;
/** ARLEEN in blue with its red shadow, with or without the three circles under it: drawn once, on a canvas. */
function lettering(circles: boolean): THREE.Material {
  const c = document.createElement("canvas");
  c.width = 1024; c.height = circles ? 512 : 192;
  const g = c.getContext("2d")!;
  const word = (y: number, size: number) => {
    g.font = `italic 900 ${size}px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillStyle = RED; g.fillText("ARLEEN", 512 + size * 0.06, y + size * 0.06, 980);
    g.fillStyle = BLUE; g.fillText("ARLEEN", 512, y, 980);
  };
  if (circles) {
    word(150, 210);
    for (const [k, col] of [[-1, RED], [0, BLUE], [1, RED]] as const) { g.fillStyle = col; g.beginPath(); g.arc(512 + k * 150, 380, 78, 0, Math.PI * 2); g.fill(); }
  } else word(96, 168);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return new THREE.MeshLambertMaterial({ map: t, transparent: true, alphaTest: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
}
/** Just the three circles, for the front corners of the sides. */
function circlesOnly(): THREE.Material {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 96;
  const g = c.getContext("2d")!;
  for (const [k, col] of [[-1, RED], [0, BLUE], [1, RED]] as const) { g.fillStyle = col; g.beginPath(); g.arc(128 + k * 74, 48, 38, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshLambertMaterial({ map: t, transparent: true, alphaTest: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
}

/** The lettering on a coach: along both sides, across the back, and in the top of the windscreen. */
export function coachDecals(style: CoachStyle): THREE.Group {
  decalMats ??= [lettering(false), lettering(true), circlesOnly()];
  const [side, back, dots] = decalMats, hw = COACH.W / 2 + 0.014, g = new THREE.Group();
  const plane = (w: number, h: number, mat: THREE.Material, x: number, y: number, z: number, ry: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z); m.rotation.y = ry; m.renderOrder = 1;
    g.add(m);
  };
  // along each side, under the stripe: the offside faces +z, the nearside -z, and each reads front to back the right way round
  plane(4.4, 0.82, side, -0.6, 1.2, hw, 0);
  plane(4.4, 0.82, side, -0.6, 1.2, -hw, Math.PI);
  plane(0.85, 0.32, dots, 3.0, 1.35, hw, 0);
  plane(0.85, 0.32, dots, 3.0, 1.35, -hw, Math.PI);
  // across the back, under the window, and in the top of the windscreen
  plane(1.9, 0.95, back, -6.03, 1.45, 0, -Math.PI / 2);
  const [, top] = SCREENS[style];
  plane(1.5, 0.28, side, top[0] + 0.04, top[1] - 0.2, 0, Math.PI / 2);
  return g;
}
