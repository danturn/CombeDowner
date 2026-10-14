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
  const { S, wall, floor, post } = solids();
  wall(-W, W, ZB, ZF, CORN + 0.3 + PAR, true);
  wall(-SC, SC, ZB - 0.8, ZB, CORN, true);
  for (const sx of [-1, 1]) {
    wall(sx * W, sx * (W - 2 * BAY - 0.2), ZF, ZF + 0.5, CORN, true);
    wall(sx * W, sx * (W - 2 * BAY - 0.2), ZB - 0.5, ZB, CORN, true);
  }
  // the portico: its podium to stand on, and its columns
  wall(-PW, PW, ZF, PZ, 0, true);
  for (const x of COLS) post(x, CZ, 0.7, CTOP);
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
