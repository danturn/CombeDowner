// Sham Castle, as a set piece (landmarks/setpieces.ts) in place of the plain block the map tools
// build there: Ralph Allen's folly on Bathampton Down, built by his master mason Richard James in
// 1762 (probably to a design by Sanderson Miller) "to improve the prospect" from Allen's town house
// in Bath. It is only a front, meant to be seen from the city: as the listing describes it, a
// battlemented screen wall of coursed rubble with a pointed arch in the middle, flanked by two
// round turrets three storeys high, running out to a square tower of two storeys at each end,
// with blocked lancet windows and a plaque in the middle. Behind, it's plain wall.
// You can walk through the arch. Its frame: x along the wall (south-south-west), z out of its
// front towards Bath, y up from the ground at its middle. Solid (shamSolids): the wall, turrets
// and towers.
import * as THREE from "three";
import { Kit, stone, plain, pointedArch } from "./kit";
import { solids } from "./solids";

const L = 12.3, T = 1.0;              // half the wall's length, and its thickness
const ARCH = 1.6;                     // half the archway's width
const TUR = { x: 3.6, z: 0.6, r: 1.9, h: 11.5 };      // the round turrets either side of the arch
const END = { w: 3.6, h: 9.0 };       // the square towers at the ends
const WALL = 6.6, MID = 8.4;          // the curtain walls' height, and the middle's over the arch

export function shamCastle(): THREE.Object3D {
  const k = new Kit();
  const S = stone("#cbbb97"), S2 = stone("#b1a07d"), slit = plain("#3a3530");
  const merlons = (x0: number, x1: number, y: number, z: number) => {
    for (let x = x0 + 0.1; x < x1 - 0.3; x += 1.25) k.slab(S, x, Math.min(x1, x + 0.65), y, y + 0.85, z - T / 2, z + T / 2, 1);
  };
  const lancet = (x: number, y: number, z: number, ry = 0) => {
    k.quad(slit, x, y, z, 0.42, 1.5, ry);
    k.quad(S2, x, y + 0.85, z + 0.005, 0.5, 0.2, ry);
  };

  // the middle, with the archway through it and the plaque over it
  {
    const s = new THREE.Shape(), arch = new THREE.Path();
    s.moveTo(-TUR.x, -2); s.lineTo(TUR.x, -2); s.lineTo(TUR.x, MID); s.lineTo(-TUR.x, MID); s.closePath();
    arch.moveTo(-ARCH, -1.9); arch.lineTo(-ARCH, 3.2); pointedArch(arch, 0, 3.2, 2 * ARCH, 2.0); arch.lineTo(ARCH, -1.9); arch.closePath();
    s.holes.push(arch);
    k.shape(S, s, T, 0, 0, 0, 0, 2.5);
    merlons(-TUR.x + TUR.r * 0.7, TUR.x - TUR.r * 0.7, MID, 0);
    k.slab(S2, -0.8, 0.8, 6.0, 7.1, T / 2, T / 2 + 0.1, 1);                     // the plaque
    k.slab(S2, -ARCH - 0.3, ARCH + 0.3, 5.2, 5.45, T / 2, T / 2 + 0.15, 1);       // the hood over the arch
  }
  // the round turrets, battlemented, with blocked lancets on each storey
  for (const s of [-1, 1]) {
    const x = s * TUR.x;
    k.cyl(S, x, -2, TUR.z, TUR.r, TUR.h + 2, 14);
    k.cyl(S2, x, TUR.h - 0.4, TUR.z, TUR.r + 0.2, 0.4, 14);
    for (let a = 0; a < 8; a++) {
      const t = (a / 8) * Math.PI * 2;
      k.box(S, x + Math.sin(t) * (TUR.r - 0.15), TUR.h, TUR.z + Math.cos(t) * (TUR.r - 0.15), 0.6, 0.85, 0.4, t, 1);
    }
    for (const y of [1.6, 5.1, 8.6]) lancet(x, y, TUR.z + TUR.r + 0.02);
    // the curtain walls out to the end towers
    const a = s * (TUR.x + TUR.r * 0.6), b = s * (L - END.w);
    k.slab(S, Math.min(a, b), Math.max(a, b), -2, WALL, -T / 2, T / 2, 2.5);
    merlons(Math.min(a, b), Math.max(a, b), WALL, 0);
    lancet((a + b) / 2, 3.6, T / 2 + 0.02);
    // and the square tower at each end
    const e0 = s * (L - END.w), e1 = s * L;
    k.slab(S, Math.min(e0, e1), Math.max(e0, e1), -2, END.h, -END.w / 2 + 0.2, END.w / 2 + 0.2, 2.5);
    for (const z of [-END.w / 2 + 0.6, END.w / 2 - 0.2]) merlons(Math.min(e0, e1), Math.max(e0, e1), END.h, z);
    for (const y of [2.2, 6.0]) lancet((e0 + e1) / 2, y, END.w / 2 + 0.22);
  }
  return k.build();
}

/** What's solid, in its frame: the wall either side of the arch, the turrets and the end towers. */
export function shamSolids(): ReturnType<typeof solids>["S"] {
  const { S, wall, post } = solids();
  for (const s of [1, -1]) {
    wall(s * ARCH, s * (L - END.w), -T / 2, T / 2, WALL);
    wall(s * (L - END.w), s * L, -END.w / 2 + 0.2, END.w / 2 + 0.2, END.h);
    post(s * TUR.x, TUR.z, TUR.r, TUR.h);
  }
  return S;
}
