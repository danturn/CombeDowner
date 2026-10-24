// Mr D's chip van: a red catering van in the colours of Mr D's on Moorland Road, red with yellow
// trim and the yellow oval "Mr.D's" on every side. It's parked at the top of Old Bond Street, on the
// south-west side where New Bond Street meets Milsom Street, with its hatch open on the street side,
// the flap propped up as an awning, a menu board in a yellow frame beside it, and Mr D himself in
// the hatch with his arms folded. vehicles.ts parks it and makes it drivable like the rest.
// Just the look: nothing here goes over the network.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Part } from "./furniture";
import { model, prof } from "./furniture";
import type { Lamps } from "./headlights";

/** Its size: length, width, height. Front at +x, the hatch on the nearside (-z), like every vehicle. */
export const CHIP = { L: 5.8, W: 2.1, H: 2.74 };
const RED = "#c8201e", YELLOW = "#f2c418", WHITE = "#f4f4f0", GLASS = "#1d252c", BLACK = "#18191b", LAMP = "#e9ecee", TAIL = "#a3221b",
  STEEL = "#c4c8cb", PLATE = "#f2f2ea", REAR_PLATE = "#e8c42a";
const PAINT = "paint";   // the van's own colour (vehicles.ts)
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (r: number, h: number, seg = 12) => new THREE.CylinderGeometry(r, r, h, seg);
/** The hatch, along the van (from x0 to x1) and up it (y0 to y1), in the box's nearside. */
const HATCH = { x0: -2.15, x1: 0.0, y0: 1.28, y1: 2.2 };
const hw = CHIP.W / 2;
/** The awning: the hatch's flap, hinged along its top and propped up, tipped down a little at the front edge. */
const FLAP = { len: 0.9, tilt: -0.3 };
/** A point k metres out along the flap from its hinge: up, across. */
const flapAt = (k: number) => [HATCH.y1 + 0.05 + Math.sin(FLAP.tilt) * k, -hw - 0.02 - Math.cos(FLAP.tilt) * k];

/** The van's parts: a low cab at the front, the tall box behind with a lip over the cab, and its bits. */
export function chipParts(): Part[] {
  const mid = (HATCH.x0 + HATCH.x1) / 2, span = HATCH.x1 - HATCH.x0, hy = (HATCH.y0 + HATCH.y1) / 2, hh = HATCH.y1 - HATCH.y0;
  const [fy, fz] = flapAt(FLAP.len / 2), [ey, ez] = flapAt(FLAP.len);
  const wheels = (along: number, r: number) => [hw - 0.16, -hw + 0.16].flatMap((z) => [
    [cyl(r, 0.24, 14), BLACK, along, r, z, Math.PI / 2] as Part, [cyl(r * 0.6, 0.25), "#a7abb0", along, r, z, Math.PI / 2] as Part,
  ]);
  return [
    // the cab
    [prof([[0.95, 0.32], [2.75, 0.32], [2.9, 0.6], [2.86, 1.0], [2.15, 1.1], [1.65, 2.0], [0.95, 2.05]], 2.0), PAINT, 0, 0, 0],
    [prof([[2.19, 1.1], [1.7, 1.95], [1.15, 1.95], [1.15, 1.1]], 2.02), GLASS, 0, 0, 0],
    // the box, and its lip over the cab
    [box(3.9, CHIP.H - 0.32, CHIP.W), PAINT, -0.95, (CHIP.H + 0.32) / 2, 0],
    [box(0.75, 0.72, CHIP.W), PAINT, 1.37, CHIP.H - 0.36, 0],
    // yellow round the bottom of the box and along the top, as round the shop's door
    [box(3.92, 0.16, CHIP.W + 0.02), YELLOW, -0.95, 0.5, 0], [box(4.67, 0.06, CHIP.W + 0.02), YELLOW, -0.58, CHIP.H - 0.03, 0],
    // the hatch's yellow frame, the steel counter under it and the menu board in its yellow frame beside it
    [box(span + 0.16, 0.08, 0.04), YELLOW, mid, HATCH.y1 + 0.04, -hw - 0.01],
    [box(0.08, hh, 0.04), YELLOW, HATCH.x0 - 0.04, hy, -hw - 0.01], [box(0.08, hh, 0.04), YELLOW, HATCH.x1 + 0.04, hy, -hw - 0.01],
    [box(span + 0.2, 0.05, 0.34), STEEL, mid, HATCH.y0 - 0.02, -hw - 0.16],
    [box(0.56, 0.78, 0.05), YELLOW, 0.5, 1.62, -hw - 0.02],
    // the flap, propped up as an awning, with a deep red front and a white edge under it
    [box(span + 0.3, 0.04, FLAP.len), PAINT, mid, fy, fz, FLAP.tilt],
    [box(span + 0.3, 0.3, 0.03), PAINT, mid, ey - 0.15, ez], [box(span + 0.3, 0.05, 0.035), WHITE, mid, ey - 0.32, ez],
    // the fryers' flue on the roof, and a gas bottle strapped on the back
    [cyl(0.11, 0.55), STEEL, -1.6, CHIP.H + 0.27, 0.45], [cyl(0.18, 0.06), STEEL, -1.6, CHIP.H + 0.56, 0.45],
    [cyl(0.16, 0.7), "#d03a2a", -2.98, 0.95, 0.65],
    // bumpers, lamps and plates
    [box(0.14, 0.2, CHIP.W + 0.02), BLACK, 2.86, 0.4, 0], [box(0.14, 0.2, CHIP.W + 0.02), BLACK, -2.86, 0.42, 0],
    [box(0.04, 0.13, 0.26), LAMP, 2.89, 0.8, 0.72], [box(0.04, 0.13, 0.26), LAMP, 2.89, 0.8, -0.72],
    [box(0.04, 0.15, 0.26), TAIL, -2.91, 0.9, 0.82], [box(0.04, 0.15, 0.26), TAIL, -2.91, 0.9, -0.82],
    [box(0.03, 0.11, 0.48), PLATE, 2.94, 0.4, 0], [box(0.03, 0.11, 0.48), REAR_PLATE, -2.94, 0.56, 0],
    [box(0.04, 0.3, 1.1), "#101112", 2.88, 0.72, 0],
    ...wheels(1.85, 0.36), ...wheels(-1.7, 0.36),
  ];
}

/** Where its headlamps and tail lights are, for headlights.ts. */
export const CHIP_LAMPS: Lamps = { front: [2.89, 0.8, 0.72, 0.26, 0.13], back: [-2.92, 0.9, 0.82, 0.26, 0.15] };

/** A texture drawn on a canvas w by h. */
function canvas(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** The yellow oval with "Mr.D's" in it, on the red of the van. */
function logo(g: CanvasRenderingContext2D) {
  g.fillStyle = RED;
  g.beginPath(); g.ellipse(256, 86, 238, 74, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = YELLOW; g.lineWidth = 14;
  g.beginPath(); g.ellipse(256, 86, 226, 64, 0, 0, Math.PI * 2); g.stroke();
  g.fillStyle = YELLOW; g.textAlign = "center"; g.textBaseline = "middle";
  g.font = `900 92px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
  g.fillText("Mr.D's", 256, 92, 380);
}

/** What it sells, along the offside under the logo. */
function strap(g: CanvasRenderingContext2D) {
  g.fillStyle = YELLOW; g.textAlign = "center"; g.textBaseline = "middle";
  g.font = `900 54px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
  g.fillText("FISH & CHIPS · KEBABS · BURGERS · LATE", 512, 40, 1000);
}

/** The menu board: a red "MENU" header, and the prices on white. */
function menu(g: CanvasRenderingContext2D) {
  g.fillStyle = "#fbf8ee"; g.fillRect(0, 0, 192, 280);
  g.fillStyle = "#d4362c"; g.fillRect(0, 0, 192, 40);
  g.fillStyle = "#fbf8ee"; g.textAlign = "center"; g.textBaseline = "middle";
  g.font = `700 28px Georgia, "Times New Roman", serif`;
  g.fillText("MENU", 96, 21);
  g.fillStyle = "#222"; g.textAlign = "left"; g.font = `600 15px "Helvetica Neue", Arial, sans-serif`;
  const items = [["Cod & chips", "7.50"], ["Chips", "3.00"], ["Cheesy chips", "3.80"], ["Battered sausage", "2.20"], ["Saveloy", "2.00"],
    ["Doner kebab", "6.50"], ["Chicken nuggets", "4.00"], ["Curry sauce", "1.50"], ["Mushy peas", "1.50"], ["Can of pop", "1.20"]];
  items.forEach(([what, price], k) => {
    g.textAlign = "left"; g.fillText(what, 10, 60 + k * 22);
    g.textAlign = "right"; g.fillText(`£${price}`, 182, 60 + k * 22);
  });
}

/** Inside the hatch: a tiled back wall under a strip light, the fryers and the hot cabinet. */
function inside(g: CanvasRenderingContext2D) {
  g.fillStyle = "#efe6d0"; g.fillRect(0, 0, 512, 220);
  g.strokeStyle = "#d9cfb6"; g.lineWidth = 2;
  for (let x = 0; x < 512; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 220); g.stroke(); }
  for (let y = 0; y < 220; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke(); }
  g.fillStyle = "#fffdf2"; g.fillRect(40, 6, 432, 12);                                   // the strip light
  g.fillStyle = "#b9bec2"; g.fillRect(0, 140, 512, 80);                                  // the fryers
  g.fillStyle = "#8d9296"; for (const x of [30, 150, 270]) g.fillRect(x, 150, 100, 20);
  g.fillStyle = "#f2b33a"; g.fillRect(390, 112, 110, 40);                                // the hot cabinet, lit
  g.fillStyle = "#d48a22"; for (let x = 398; x < 492; x += 18) g.fillRect(x, 126, 12, 22);
  g.fillStyle = "#c8201e"; g.fillRect(320, 40, 160, 46);                                 // the price list
  g.fillStyle = "#f2c418"; g.font = `900 26px "Arial Black", Arial, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText("Mr.D's", 400, 64);
}

let mats: Record<"logo" | "strap" | "menu" | "inside" | "man", THREE.Material> | null = null;
let shared: { planes: Map<string, THREE.BufferGeometry>; man: THREE.BufferGeometry } | null = null;

/** The van's lettering, menu, the lit inside of the hatch and Mr D in it: one mesh each, the same for every van. */
export function chipDecals(): THREE.Group {
  mats ??= {
    logo: decal(canvas(512, 172, logo)), strap: decal(canvas(1024, 80, strap)), menu: decal(canvas(192, 280, menu)),
    inside: new THREE.MeshBasicMaterial({ map: canvas(512, 220, inside), polygonOffset: true, polygonOffsetFactor: -2 }),
    man: new THREE.MeshLambertMaterial({ vertexColors: true }),
  };
  if (!shared) {
    const sets: Record<string, THREE.BufferGeometry[]> = { logo: [], strap: [], menu: [], inside: [] };
    const plane = (set: string, w: number, h: number, x: number, y: number, z: number, ry: number) =>
      sets[set].push(new THREE.PlaneGeometry(w, h).rotateY(ry).translate(x, y, z));
    const [ey, ez] = flapAt(FLAP.len);
    const mid = (HATCH.x0 + HATCH.x1) / 2;
    // the logo: big on the offside, above the hatch and on the awning's front on the nearside, across the back and over the cab
    plane("logo", 1.9, 0.64, -1.0, 2.0, hw + 0.006, 0);
    plane("logo", 1.1, 0.37, mid, CHIP.H - 0.22, -hw - 0.006, Math.PI);
    plane("logo", 0.8, 0.27, mid, ey - 0.15, ez - 0.02, Math.PI);
    plane("logo", 1.5, 0.5, -2.906, 2.05, 0, -Math.PI / 2);
    plane("logo", 1.3, 0.44, 1.756, CHIP.H - 0.3, 0, Math.PI / 2);
    plane("strap", 3.3, 0.26, -1.0, 1.35, hw + 0.006, 0);
    plane("menu", 0.46, 0.67, 0.5, 1.62, -hw - 0.05, Math.PI);
    plane("inside", HATCH.x1 - HATCH.x0, HATCH.y1 - HATCH.y0, mid, (HATCH.y0 + HATCH.y1) / 2, -hw - 0.004, Math.PI);
    const planes = new Map<string, THREE.BufferGeometry>();
    for (const [k, gs] of Object.entries(sets)) planes.set(k, mergeGeometries(gs)!);
    // Mr D: bald, in a navy T-shirt, arms folded, leaning on the counter
    const skin = "#e2b89a", shirt = "#1e2433", x = -0.75, z = -hw - 0.06;
    const man = model([
      [box(0.46, 0.42, 0.1), shirt, x, HATCH.y0 + 0.2, z], [box(0.13, 0.08, 0.1), skin, x, HATCH.y0 + 0.45, z],
      [new THREE.SphereGeometry(0.12, 12, 9), skin, x, HATCH.y0 + 0.6, z - 0.02],
      [box(0.5, 0.11, 0.12), shirt, x, HATCH.y0 + 0.14, z - 0.08], [box(0.12, 0.09, 0.1), skin, x - 0.2, HATCH.y0 + 0.15, z - 0.12],
      [box(0.12, 0.09, 0.1), skin, x + 0.2, HATCH.y0 + 0.15, z - 0.12],
    ]);
    shared = { planes, man };
  }
  const g = new THREE.Group();
  for (const [k, geo] of shared.planes) { const m = new THREE.Mesh(geo, mats[k as keyof typeof mats]); m.renderOrder = 1; g.add(m); }
  g.add(new THREE.Mesh(shared.man, mats.man));
  return g;
}

function decal(t: THREE.Texture): THREE.Material {
  return new THREE.MeshLambertMaterial({ map: t, transparent: true, alphaTest: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
}
