// Prior Park's mansion, as a set piece (landmarks/setpieces.ts) in place of the plain block the map
// tools build there and the simple porticos tools/landmarks/bath.py stands on its fronts. Ralph
// Allen's house above Combe Down, by John Wood the Elder, 1735-50, built of Allen's own Bath stone
// from the mines under the village, looking down the valley over the Palladian Bridge to Bath;
// gutted by fire in 1836 and restored by H. E. Goodridge, who added the great flight of steps.
// Now Prior Park College.
// - A long Palladian house of fifteen bays, on a rusticated basement that the hill buries at the
//   back and leaves a storey high at the front: tall pedimented windows to the main floor, short
//   ones above, a cornice and a balustrade round a hipped slate roof, and its end bays standing
//   forward a little.
// - On the north front, looking to Bath, the great portico: six giant Corinthian columns the
//   height of both floors, an entablature and a pediment, raised on the basement, with
//   Goodridge's broad flight of steps down to the lawn between balustraded walls.
// - On the south front, to the drive, a centre of five bays standing forward under its own
//   pediment, with giant pilasters and the garden door.
// Its frame: x along the house (east-north-east to west-south-west), z out of the north front, y up
// from the main floor (the level of the drive at the back). Solid (priorParkSolids): the house, the
// portico's podium, its columns and the walls of the steps; you walk up the steps onto the portico.
import * as THREE from "three";
import { Kit, stone, plain, sashGlass, rustic, balusters, slate, glow } from "./kit";
import { type Range, rangeMats, dressRange, glowRanges, rangeSolids } from "./ranges";
import { solids } from "./solids";

const W = 24, ZF = 9.4, ZB = -9.8;          // the house: half its length, its north front and its south front
const BASE = -5;                            // the foot of the basement, under the ground at the front
const F1 = 6.0, F2 = 10.0, CORN = 10.8;     // the main floor's top, the upper floor's, the cornice's
const PAR = 1.0;                            // the balustrade's height
const BAY = 3.2, BAYS = 15;                 // fifteen bays along each front
const PW = 8.8, PZ = 15.8;                  // the portico: half its width, and its front
const COLS = [-7.5, -4.5, -1.5, 1.5, 4.5, 7.5], CZ = PZ - 0.8, CTOP = 10.0;
const STEPS = 26, RISE = 0.17, TREAD = 0.4; // Goodridge's steps, down from the portico to the lawn
const SW = 7.9;                             // the walls either side of the steps, their middles
const LAWN = PZ + STEPS * TREAD;            // the foot of the steps
const SC = 8.0;                             // the south front's centre: half its width

/** Each bay's middle along the house. */
const bays = Array.from({ length: BAYS }, (_, k) => -((BAYS - 1) * BAY) / 2 + k * BAY);

export function priorPark(): THREE.Object3D {
  const k = new Kit();
  const S = stone("#efe1bf"), S2 = stone("#dac79e"), R = rustic(), sash = sashGlass(), bal = balusters(), roof = slate();
  const dark = plain("#2c2622");

  // a triangle of stone, w across its foot and rise high, d deep, its foot's middle at (x, y, z)
  const pediment = (mat: THREE.Material, x: number, y: number, z: number, w: number, rise: number, d: number) => {
    const s = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, rise)]);
    k.shape(mat, s, d, x, y, z, 0, 2);
  };
  // a window on a front facing +z (s = 1) or -z (s = -1) at its face zf: its stone surround, the
  // glass, and a hood over it (a pediment or a cornice)
  const window = (x: number, y: number, zf: number, s: number, w: number, h: number, hood: "ped" | "cornice" | "none") => {
    const f = Math.min(zf, zf + s * 0.08), b = Math.max(zf, zf + s * 0.08);
    k.slab(S2, x - w / 2 - 0.22, x + w / 2 + 0.22, y - h / 2 - 0.22, y + h / 2 + 0.22, f, b, 1);
    k.quad(sash, x, y, zf + s * 0.1, w, h, s > 0 ? 0 : Math.PI);
    const top = y + h / 2 + 0.22;
    if (hood === "cornice") k.slab(S2, x - w / 2 - 0.4, x + w / 2 + 0.4, top, top + 0.22, Math.min(zf, zf + s * 0.35), Math.max(zf, zf + s * 0.35), 1);
    if (hood === "ped") {
      k.slab(S2, x - w / 2 - 0.4, x + w / 2 + 0.4, top, top + 0.16, Math.min(zf, zf + s * 0.35), Math.max(zf, zf + s * 0.35), 1);
      pediment(S2, x, top + 0.16, zf + s * 0.17, w + 0.9, 0.55, 0.34);
    }
  };
  // a balustrade from (x0, z0) to (x1, z1) on top of y, facing out (ry)
  const balustrade = (x0: number, z0: number, x1: number, z1: number, y: number, ry: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    k.quad(bal, (x0 + x1) / 2, y + PAR / 2, (z0 + z1) / 2, len, PAR, ry, 0, 0, len / 1.6, 1);
  };

  // ---- the body of the house ---------------------------------------------------------------------
  k.slab(R, -W, W, BASE, 0, ZB, ZF, 3);
  k.slab(S, -W, W, 0, CORN, ZB, ZF, 3);
  // the end bays standing forward on both fronts
  for (const sx of [-1, 1]) for (const [z0, z1] of [[ZF, ZF + 0.5], [ZB - 0.5, ZB]]) {
    const a = sx * W, b = sx * (W - 2 * BAY - 0.2);
    k.slab(R, Math.min(a, b), Math.max(a, b), BASE, 0, z0, z1, 3);
    k.slab(S, Math.min(a, b), Math.max(a, b), 0, CORN, z0, z1, 3);
  }
  // the band at the top of the basement, the one between the floors, the frieze and the cornice
  k.slab(S2, -W - 0.15, W + 0.15, -0.1, 0.3, ZB - 0.65, ZF + 0.65, 1.5);
  k.slab(S2, -W - 0.1, W + 0.1, F1 - 0.05, F1 + 0.2, ZB - 0.6, ZF + 0.6, 1.5);
  k.slab(S2, -W - 0.2, W + 0.2, F2 - 0.4, F2, ZB - 0.6, ZF + 0.6, 1.5);
  k.slab(S2, -W - 0.45, W + 0.45, F2, CORN, ZB - 0.95, ZF + 0.95, 1.5);
  // the balustrade round the roof, with its plinth, its coping and pedestals at the corners and ends
  k.slab(S2, -W, W, CORN, CORN + 0.15, ZB - 0.5, ZB - 0.2, 1);
  k.slab(S2, -W, W, CORN, CORN + 0.15, ZF + 0.2, ZF + 0.5, 1);
  balustrade(-W, ZF + 0.35, W, ZF + 0.35, CORN + 0.1, 0);
  balustrade(-W, ZB - 0.35, W, ZB - 0.35, CORN + 0.1, Math.PI);
  for (const sx of [-1, 1]) balustrade(sx * (W + 0.1), ZB - 0.3, sx * (W + 0.1), ZF + 0.3, CORN + 0.1, (sx * Math.PI) / 2);
  for (const z of [ZF + 0.35, ZB - 0.35]) k.slab(S2, -W - 0.1, W + 0.1, CORN + 0.1 + PAR, CORN + 0.3 + PAR, z - 0.22, z + 0.22, 1.5);
  for (const sx of [-1, 1]) k.slab(S2, sx * (W + 0.1) - 0.22, sx * (W + 0.1) + 0.22, CORN + 0.1 + PAR, CORN + 0.3 + PAR, ZB - 0.35, ZF + 0.35, 1.5);
  for (const x of [-W, -W + 2 * BAY + 0.2, -PW, PW, W - 2 * BAY - 0.2, W]) for (const z of [ZF + 0.35, ZB - 0.35]) {
    k.slab(S2, x - 0.35, x + 0.35, CORN, CORN + 0.4 + PAR, z - 0.35, z + 0.35, 1);
    k.cyl(S2, x, CORN + 0.4 + PAR, z, 0.22, 0.3, 8);
    k.add(S2, new THREE.SphereGeometry(0.3, 8, 6).scale(1, 1.3, 1), x, CORN + 1.05 + PAR, z);
  }
  // the hipped roof, and its chimneys
  k.roof(roof, -W + 0.6, W - 0.6, CORN, ZB + 0.3, ZF - 0.3, 4.2, false, true);
  for (const x of [-19, -9.5, 9.5, 19]) for (const z of [-3.2, 3.2]) {
    k.slab(S, x - 0.6, x + 0.6, CORN + 1, CORN + 5.6, z - 1.3, z + 1.3, 2);
    k.slab(S2, x - 0.75, x + 0.75, CORN + 5.6, CORN + 5.9, z - 1.45, z + 1.45, 1);
  }

  // ---- the windows -------------------------------------------------------------------------------
  for (const [i, x] of bays.entries()) {
    const mid = i === (BAYS - 1) / 2;
    for (const [zf, s] of [[ZF, 1], [ZB, -1]] as const) {
      const end = Math.abs(x) > W - 2 * BAY - 0.2;
      const face = zf + s * (end ? 0.5 : 0) + s * (s < 0 && Math.abs(x) < SC ? 0.8 : 0);
      if (mid) {
        // the doors in the middle of each front: to the portico, and to the drive
        k.slab(S2, x - 1.3, x + 1.3, 0, 4.4, Math.min(face, face + s * 0.12), Math.max(face, face + s * 0.12), 1);
        k.quad(dark, x, 1.85, face + s * 0.14, 1.9, 3.7, s > 0 ? 0 : Math.PI);
        k.slab(S2, x - 1.6, x + 1.6, 4.4, 4.65, Math.min(face, face + s * 0.4), Math.max(face, face + s * 0.4), 1);
        pediment(S2, x, 4.65, face + s * 0.2, 3.4, 0.8, 0.4);
      } else window(x, 3.0, face, s, 1.35, 2.9, i % 2 ? "ped" : "cornice");
      window(x, 8.0, face, s, 1.25, 1.7, "none");
      // the basement's small windows, where the hill leaves it showing at the front
      if (s > 0 && Math.abs(x) > PW + 0.6) window(x, -2.0, face, s, 1.0, 1.1, "none");
    }
  }
  // the ends of the house: five bays each, along its depth
  for (const sx of [-1, 1]) for (const z of [-7.2, -3.6, 0, 3.6, 7.2]) {
    const ry = (sx * Math.PI) / 2, xf = sx * (W + 0.02);
    k.slab(S2, xf - 0.04, xf + 0.04, 3.0 - 1.67, 3.0 + 1.67, z - 0.9, z + 0.9, 1);
    k.quad(sash, sx * (W + 0.1), 3.0, z, 1.35, 2.9, ry);
    k.slab(S2, xf - 0.04, xf + 0.04, 8.0 - 1.07, 8.0 + 1.07, z - 0.85, z + 0.85, 1);
    k.quad(sash, sx * (W + 0.1), 8.0, z, 1.25, 1.7, ry);
  }

  // ---- the great portico on the north front --------------------------------------------------------
  k.slab(R, -PW, PW, BASE, -0.3, ZF, PZ, 3);                                  // its podium, on the basement
  k.slab(S2, -PW - 0.15, PW + 0.15, -0.3, 0, ZF, PZ + 0.15, 1.5);             // and its floor
  for (const x of COLS) {
    k.slab(S2, x - 0.7, x + 0.7, 0, 0.5, CZ - 0.7, CZ + 0.7, 1);              // the plinth and base
    k.cyl(S2, x, 0.5, CZ, 0.66, 0.3, 14);
    k.cyl(S, x, 0.8, CZ, 0.56, CTOP - 1.9, 14, 0.48);                         // the shaft, tapering
    k.cyl(S2, x, CTOP - 1.1, CZ, 0.5, 0.85, 12, 0.74);                        // the capital's bell of leaves
    k.slab(S2, x - 0.78, x + 0.78, CTOP - 0.25, CTOP, CZ - 0.78, CZ + 0.78, 1); // its abacus
  }
  // the pilasters answering the columns on the wall behind
  for (const x of [COLS[0], COLS[5]]) k.slab(S2, x - 0.55, x + 0.55, 0, CTOP, ZF, ZF + 0.25, 1);
  // the entablature (architrave, frieze, cornice), its ceiling, and the pediment over it
  k.slab(S2, -PW, PW, CTOP, CTOP + 0.6, ZF, PZ, 1.5);
  k.slab(S, -PW, PW, CTOP + 0.6, CTOP + 1.3, ZF, PZ, 1.5);
  k.slab(S2, -PW - 0.35, PW + 0.35, CTOP + 1.3, CORN + 0.8, ZF, PZ + 0.4, 1.5);
  const PY = CORN + 0.8, PR = 3.8;
  pediment(S, 0, PY, PZ - 3.2, 2 * PW, PR, 6.2);                              // the tympanum
  for (const sx of [-1, 1]) {                                                 // the raking cornices
    k.beam(S2, [sx * (PW + 0.45), PY, PZ + 0.1], [0, PY + PR + 0.25, PZ + 0.1], 0.6, 0.45, 1.5);
    k.beam(roof, [sx * (PW + 0.4), PY + 0.15, PZ - 3.0], [0, PY + PR + 0.4, PZ - 3.0], 6.4, 0.2, 2);
  }
  // urns on the pediment's corners and a figure-like finial at its peak
  for (const [x, y] of [[-PW, PY], [PW, PY], [0, PY + PR + 0.4]] as const) {
    k.slab(S2, x - 0.4, x + 0.4, y, y + 0.45, PZ - 0.5, PZ + 0.3, 1);
    k.cyl(S2, x, y + 0.45, PZ - 0.1, 0.25, 0.3, 8);
    k.add(S2, new THREE.SphereGeometry(0.36, 8, 6).scale(1, 1.4, 1), x, y + 1.15, PZ - 0.1);
    k.cyl(S2, x, y + 1.55, PZ - 0.1, 0.1, 0.4, 6, 0);
  }

  // ---- Goodridge's steps down to the lawn ---------------------------------------------------------
  for (let i = 0; i < STEPS; i++) {
    const top = -(i + 1) * RISE, z0 = PZ + i * TREAD;
    k.slab(S2, -SW + 0.35, SW - 0.35, BASE, top, z0, z0 + TREAD, 1.5);
  }
  for (const sx of [-1, 1]) {
    // the walls either side, following the steps down, with a balustrade along their top
    const wall = new THREE.Shape([new THREE.Vector2(PZ - 0.4, BASE), new THREE.Vector2(LAWN + 0.4, BASE),
      new THREE.Vector2(LAWN + 0.4, -STEPS * RISE + 0.5), new THREE.Vector2(PZ - 0.4, 0.5)]);
    k.shape(R, wall, 0.7, sx * SW, 0, 0, -Math.PI / 2, 3);
    const drop = STEPS * RISE, len = Math.hypot(LAWN - PZ, drop), tilt = Math.atan2(drop, LAWN - PZ);
    const g = new THREE.PlaneGeometry(len, PAR);
    const uv = g.attributes.uv;
    for (let j = 0; j < uv.count; j++) uv.setXY(j, uv.getX(j) ? len / 1.6 : 0, uv.getY(j));
    k.add(bal, g, sx * SW, 0.5 + PAR / 2 - drop / 2, (PZ + LAWN) / 2, Math.PI / 2, 0, 0, tilt);
    k.beam(S2, [sx * SW, 0.5 + PAR, PZ - 0.4], [sx * SW, 0.5 + PAR - drop, LAWN + 0.4], 0.5, 0.2, 1.5);
    // pedestals with urns at the foot
    k.slab(S2, sx * SW - 0.5, sx * SW + 0.5, BASE, -drop + 1.8, LAWN - 0.2, LAWN + 0.8, 1);
    k.cyl(S2, sx * SW, -drop + 1.8, LAWN + 0.3, 0.28, 0.3, 8);
    k.add(S2, new THREE.SphereGeometry(0.38, 8, 6).scale(1, 1.3, 1), sx * SW, -drop + 2.5, LAWN + 0.3);
  }

  // ---- the south front's centre, to the drive ------------------------------------------------------
  const zc = ZB - 0.8;
  k.slab(R, -SC, SC, BASE, 0, zc, ZB, 3);
  k.slab(S, -SC, SC, 0, CORN, zc, ZB, 3);
  for (const x of [-SC + 0.45, -3.2 - 1.6, -1.6, 1.6, 3.2 + 1.6, SC - 0.45].filter((_, i) => i !== 2 && i !== 3))
    k.slab(S2, x - 0.45, x + 0.45, 0.3, F2 - 0.4, zc - 0.3, zc, 1);
  pediment(S, 0, CORN, zc + 0.2, 2 * SC + 0.8, 2.6, 1.6);
  k.beam(S2, [-SC - 0.5, CORN, zc - 0.65], [0, CORN + 2.85, zc - 0.65], 0.5, 0.4, 1.5);
  k.beam(S2, [SC + 0.5, CORN, zc - 0.65], [0, CORN + 2.85, zc - 0.65], 0.5, 0.4, 1.5);
  for (let i = 0; i < 2; i++) k.slab(S2, -2.2, 2.2, BASE, -0.15 + 0.15 * i, zc - 1.0 + 0.5 * i, zc - 0.5 + 0.5 * i, 1);

  const grp = k.build();
  glow(grp, sash, 0, 0.85);
  return grp;
}

/** What's solid, in the mansion's frame (landmarks/solids.ts). */
export function priorParkSolids(): ReturnType<typeof solids>["S"] {
  const { S, wall, floor, post, roof } = solids();
  // the house, up to its balustrade, and its hipped roof to stand on (the leads round it, inside
  // the balustrade, at the cornice), with its chimneys
  wall(-W, W, ZB, ZF, CORN + 0.3 + PAR);
  roof(-W, W, ZB, ZF, CORN, { cx: 0, cz: (ZB + ZF) / 2, ang: 0, hl: W - 0.6, hw: (ZF - ZB) / 2 - 0.3, y: CORN, rise: 4.2, hip: true });
  for (const x of [-19, -9.5, 9.5, 19]) for (const z of [-3.2, 3.2]) wall(x - 0.75, x + 0.75, z - 1.45, z + 1.45, CORN + 5.9, true);
  wall(-SC, SC, ZB - 0.8, ZB, CORN, true);
  for (const sx of [-1, 1]) {
    wall(sx * W, sx * (W - 2 * BAY - 0.2), ZF, ZF + 0.5, CORN, true);
    wall(sx * W, sx * (W - 2 * BAY - 0.2), ZB - 0.5, ZB, CORN, true);
  }
  // the portico: its podium to stand on, and its columns
  wall(-PW, PW, ZF, PZ, 0, true);
  for (const x of COLS) post(x, CZ, 0.7, CTOP);
  // and its pediment's roof, over the entablature, sloping down to either side
  roof(-PW - 0.4, PW + 0.4, ZF, PZ + 0.2, CORN + 0.8, { cx: 0, cz: (ZF + PZ + 0.2) / 2, ang: Math.PI / 2, hl: (PZ + 0.2 - ZF) / 2, hw: PW + 0.4, y: CORN + 0.95, rise: 3.8 + 0.25, hip: false });
  // the steps, and the walls either side of them, in four lengths as they come down
  for (let i = 0; i < STEPS; i++) floor(-SW, SW, PZ + i * TREAD, PZ + (i + 1) * TREAD, -(i + 1) * RISE);
  for (const sx of [-1, 1]) for (let q = 0; q < 4; q++) {
    const z0 = PZ - 0.4 + (q * (LAWN - PZ + 0.8)) / 4, z1 = z0 + (LAWN - PZ + 0.8) / 4;
    wall(sx * SW - 0.35, sx * SW + 0.35, z0, z1, 0.5 + PAR - (q * STEPS * RISE) / 4);
  }
  // the south door's steps
  floor(-2.2, 2.2, ZB - 1.8, ZB - 0.8, -0.15);
  return S;
}

// ---- the wings ------------------------------------------------------------------------------------
// Wood's wings either side of the house, stepping down the hill to the east and the west, and the
// low links joining them to it, as a second set piece in the mansion's frame ("priorwings"). The map
// has their outlines and heights from the lidar but not what they look like, so each is built on its
// own outline in the house's style (ranges.ts): a rusticated ground storey (or, for the low links,
// an arcade), sash windows to every storey above, a cornice and a balustrade, and a low slate roof
// on the rectangular ones.
// Each is a range (landmarks/ranges.ts), measured from the map's buildings there (combe-down.json),
// with the house's own end walls cut off.
const WINGS: Range[] = [
  // the west link, from the house
  [135.6, 140.6, 0, [[58.2,12.4],[51.6,9.5],[24.3,9.2],[24.3,-9.3],[28.6,-9.5],[29.8,-6.6],[38.9,-6.7],[39.0,2.8],[54.3,3.6],[60.5,7.5],[65.1,11.4],[67.1,15.3],[69.6,14.2],[69.0,13.9],[71.2,13.4],[76.0,15.8],[76.9,18.9],[69.8,14.2],[63.2,24.5],[63.0,20.7]],
    [0, 0, 152.8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 146.4, 146.4, 0, 0]],
  // the range beyond it
  [135.3, 146.4, 1, [[77.3,20.1],[107.3,38.2],[103.3,43.6],[66.2,19.8],[69.8,14.2],[76.9,18.8]],
    [0, 0, 144.3, 140.6, 140.6, 0]],
  // the corner between them
  [135.4, 144.3, 1, [[63.2,24.5],[66.2,19.8],[71.3,23.0],[67.0,29.7],[63.4,27.5]],
    [140.6, 146.4, 144.3, 144.3, 0]],
  // the west wing, down the hill
  [134.0, 144.3, 1, [[67.0,29.7],[71.3,23.0],[103.4,43.5],[103.9,42.7],[145.1,70.3],[137.7,82.1],[92.5,53.4],[92.0,54.1],[63.9,35.3],[63.4,27.5]],
    [144.3, 146.4, 146.4, 0, 0, 0, 0, 0, 0, 144.3]],
  // the east link, from the house
  [135.9, 140.9, 0, [[-24.3,9.6],[-47.6,10.1],[-62.0,17.8],[-64.3,13.7],[-57.4,6.9],[-47.2,3.1],[-27.8,3.2],[-27.4,-8.6],[-24.3,-8.7]],
    [0, 0, 140.4, 0, 0, 0, 0, 0, 152.8]],
  // the east wing's gallery
  [135.6, 140.4, 0, [[-96.1,30.5],[-70.5,15.6],[-67.6,20.0],[-66.5,18.8],[-64.3,13.6],[-62.0,17.8],[-54.2,13.3],[-57.9,19.2],[-60.6,27.2],[-62.4,28.8],[-62.4,29.3],[-67.1,20.8],[-93.0,35.1]],
    [141.3, 0, 0, 0, 140.9, 140.9, 0, 0, 0, 0, 144.5, 144.5, 155.1]],
  // the east wing's front range
  [135.2, 144.5, 1, [[-61.7,33.1],[-86.6,46.8],[-87.8,43.7],[-93.0,35.1],[-67.1,20.8],[-62.6,29.0],[-63.2,29.5]],
    [0, 141.3, 155.1, 140.4, 140.4, 0, 0]],
  // the east wing's tall block
  [135.5, 155.1, 1, [[-87.8,43.7],[-100.1,51.2],[-107.0,39.9],[-94.7,32.3]],
    [141.3, 142.6, 141.3, 144.5]],
  // the east wing's north range
  [135.3, 142.6, 1, [[-115.4,61.5],[-120.9,51.4],[-105.3,42.7],[-99.3,52.6]],
    [141.3, 141.3, 155.1, 141.3]],
  // the east wing's offices round them
  [135.2, 141.3, 0, [[-149.0,72.1],[-149.7,72.1],[-129.9,57.3],[-131.3,54.1],[-71.6,14.0],[-70.5,15.6],[-96.1,30.5],[-95.1,32.5],[-94.7,32.3],[-107.0,39.9],[-105.3,42.7],[-120.9,51.4],[-115.4,61.5],[-99.3,52.6],[-100.1,51.2],[-88.1,43.9],[-86.5,46.8],[-144.6,78.8]],
    [0, 0, 0, 0, 0, 140.4, 140.4, 140.4, 155.1, 155.1, 142.6, 142.6, 142.6, 142.6, 155.1, 144.5, 0, 0]],
];
/** The wings' origin height, above sea level (the set piece's height in setpieces.ts). */
export const WINGS_Y = 136;
/** What the wings stand in for (setpieces.ts): the map's buildings there, a little wider. */
export const WEST_WING: [number, number][] = [[62.2, 21.0], [63.1, 35.7], [92.2, 55.2], [92.7, 54.5], [137.9, 83.2], [146.2, 70.1], [105.1, 42.5], [108.5, 38.0], [78.0, 19.6], [76.7, 15.2], [71.3, 12.6], [67.1, 13.5], [65.7, 10.8], [61.0, 6.9], [54.5, 2.8], [39.8, 2.0], [39.6, -7.5], [30.3, -7.4], [29.2, -10.4], [20.2, -9.8], [20.1, -7.2], [22.1, -7.1], [22.0, -6.1], [23.0, -6.1], [22.2, 7.9], [23.2, 8.0], [23.1, 10.0], [51.4, 10.3], [57.6, 13.1]];
export const EAST_WING: [number, number][] = [[-16.7, 9.0], [-22.3, 8.7], [-22.1, 4.7], [-23.0, 4.6], [-22.4, -6.4], [-23.5, -6.5], [-23.2, -9.5], [-28.2, -9.4], [-28.6, 2.4], [-47.4, 2.3], [-57.8, 6.2], [-64.1, 12.4], [-64.4, 11.8], [-67.5, 18.7], [-71.3, 12.8], [-132.3, 53.8], [-130.9, 57.1], [-152.3, 73.1], [-149.4, 72.9], [-144.9, 79.9], [-60.7, 33.5], [-61.6, 29.2], [-60.0, 27.7], [-57.2, 19.5], [-53.9, 14.4], [-47.3, 10.9], [-16.8, 10.3]];

export function priorParkWings(): THREE.Object3D {
  const k = new Kit(), m = rangeMats();
  for (const w of WINGS) dressRange(k, m, w, WINGS_Y, "palladian");
  return glowRanges(k.build(), m);
}

/** What's solid, in the wings' frame: a wall along every side of every outline, up to its eaves. */
export function priorParkWingsSolids(): ReturnType<typeof solids>["S"] {
  const { S } = solids();
  rangeSolids(S, WINGS, WINGS_Y, () => "palladian");
  return S;
}
