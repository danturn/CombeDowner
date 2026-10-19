// The Auwal Mosque, as a set piece (landmarks/setpieces.ts) in place of the plain block the map tools
// build there: the first mosque in South Africa, on Dorp Street in the Bo-Kaap, founded in 1794
// in a warehouse given by Coenraad Laurens van Doorn when Imam Abdullah ibn Qadi Abdus Salaam (Tuan
// Guru) was freed from Robben Island; he wrote out the Qur'an from memory there.
// - A plain whitewashed hall with a flat roof behind a parapet set with little pinnacles, its
//   street front of arched windows framed in green, as the Bo-Kaap's mosques are;
// - a curved Cape gable over the doors, with the crescent in it;
// - and the slender minaret over the street end, square, then eight-sided, with a balcony and a
//   green onion dome under the crescent.
// Its frame: x along Dorp Street (north-west), z out of the front to the street, y up from the
// hall's floor. Solid as it's drawn (landmarks/shape.ts).
import * as THREE from "three";
import { Kit, plain, archedGlass, glow, roundArch } from "./kit";
import { lathe, onion } from "./capekit";

/** The hall's floor above sea level (the street in front climbs from 44.7 m to 46.3 m). */
export const AUWAL_Y = 45.6;

const X0 = -15, X1 = 15.5, ZB = -7, ZF = 6.6;   // the hall: its ends, back and front
const TOP = 7, FOOT = -3;                       // the walls' top, and how far down they go
const MIN = { x: 11.6, z: 3.4 };                // where the minaret stands, on the roof over the street end

export function auwal(): THREE.Object3D {
  const k = new Kit();
  const white = plain("#f2eee2"), plinth = plain("#7f8a83"), green = plain("#2f7a4d"), roofing = plain("#b9b6ad");
  const glass = archedGlass(), gold = plain("#d8b85a"), dark = plain("#203328");

  /** A little pinnacle on the parapet, with a ball on top. */
  const pinnacle = (x: number, y: number, z: number, s = 1) => {
    k.slab(white, x - 0.22 * s, x + 0.22 * s, y, y + 0.7 * s, z - 0.22 * s, z + 0.22 * s, 1);
    k.add(green, new THREE.SphereGeometry(0.2 * s, 8, 6), x, y + 0.9 * s, z);
  };

  // ---- the hall --------------------------------------------------------------------------------
  k.slab(white, X0, X1, FOOT, TOP, ZB, ZF, 3);
  k.slab(plinth, X0 - 0.08, X1 + 0.08, FOOT, 0.5, ZB - 0.08, ZF + 0.08, 2);
  k.slab(roofing, X0 + 0.3, X1 - 0.3, TOP, TOP + 0.1, ZB + 0.3, ZF - 0.3, 3);
  // the parapet round the roof, a green band under its coping, pinnacles along it
  for (const [x0, x1, z0, z1] of [[X0, X1, ZF - 0.3, ZF], [X0, X1, ZB, ZB + 0.3], [X0, X0 + 0.3, ZB, ZF], [X1 - 0.3, X1, ZB, ZF]]) {
    k.slab(white, x0, x1, TOP, TOP + 1.0, z0, z1, 2);
    k.slab(white, x0 - 0.06, x1 + 0.06, TOP + 1.0, TOP + 1.15, z0 - 0.06, z1 + 0.06, 1);
  }
  k.slab(green, X0 - 0.03, X1 + 0.03, TOP - 0.35, TOP - 0.15, ZB - 0.03, ZF + 0.03, 1);
  for (let x = X0 + 0.15; x <= X1 - 0.1; x += (X1 - X0 - 0.3) / 10) {
    pinnacle(x, TOP + 1.15, ZF - 0.15);
    pinnacle(x, TOP + 1.15, ZB + 0.15);
  }
  for (let z = ZB + 0.15 + (ZF - ZB - 0.3) / 4; z < ZF - 0.5; z += (ZF - ZB - 0.3) / 4) { pinnacle(X0 + 0.15, TOP + 1.15, z); pinnacle(X1 - 0.15, TOP + 1.15, z); }

  /** An arched window w by h, sill at y, in a green frame, facing turned ry from +z at (x, z). */
  const window = (x: number, y: number, z: number, ry: number, w = 1.3, h = 2.6) => {
    const sx = Math.sin(ry), sz = Math.cos(ry);
    const fr = new THREE.Shape(), hole = new THREE.Path();
    fr.moveTo(-w / 2 - 0.18, -0.12); fr.lineTo(-w / 2 - 0.18, h - w / 2); roundArch(fr, 0, h - w / 2, w + 0.36, w / 2 + 0.18); fr.lineTo(w / 2 + 0.18, -0.12); fr.closePath();
    hole.moveTo(-w / 2, 0); hole.lineTo(-w / 2, h - w / 2); roundArch(hole, 0, h - w / 2, w, w / 2); hole.lineTo(w / 2, 0); hole.closePath();
    fr.holes.push(hole);
    k.shape(green, fr, 0.08, x + sx * 0.04, y, z + sz * 0.04, ry, 1);
    k.quad(glass, x + sx * 0.02, y + h / 2, z + sz * 0.02, w, h, ry);
    k.box(white, x + sx * 0.1, y - 0.25, z + sz * 0.1, w + 0.6, 0.15, 0.2, ry, 1);
  };
  // the street front: windows either side of the doors
  for (const x of [-12.6, -9.4, -6.2, 6.2, 9.4, 12.6]) window(x, 2.2, ZF, 0);
  // the sides and back
  for (const z of [-4, -0.5, 3]) { window(X0, 2.2, z, -Math.PI / 2); window(X1, 2.2, z, Math.PI / 2); }
  for (const x of [-11, -6, -1, 4, 9]) window(x, 2.2, ZB, Math.PI);

  // ---- the doors, under a curved gable with the crescent -----------------------------------------
  {
    const G = 3.6;
    const gab = new THREE.Shape();
    gab.moveTo(-G, 0); gab.lineTo(G, 0); gab.lineTo(G, TOP + 1.2);
    // a Cape gable: concave shoulders up to a round top
    gab.quadraticCurveTo(G - 0.2, TOP + 2.4, G - 1.6, TOP + 2.6);
    gab.lineTo(1.4, TOP + 2.8);
    gab.absarc(0, TOP + 2.8, 1.4, 0, Math.PI, false);
    gab.lineTo(-G + 1.6, TOP + 2.6);
    gab.quadraticCurveTo(-G + 0.2, TOP + 2.4, -G, TOP + 1.2);
    gab.closePath();
    k.shape(white, gab, 0.5, 0, 0, ZF + 0.25, 0, 2);
    k.slab(green, -G - 0.05, G + 0.05, TOP - 0.35, TOP - 0.15, ZF, ZF + 0.55, 1);
    for (const x of [-G, G]) { k.slab(white, x - 0.3, x + 0.3, 0, TOP + 1.4, ZF, ZF + 0.7, 1.5); pinnacle(x, TOP + 1.4, ZF + 0.35, 1.2); }
    pinnacle(0, TOP + 4.2, ZF + 0.25, 0.9);
    // the crescent and star in the gable
    k.add(gold, new THREE.TorusGeometry(0.55, 0.09, 6, 14, Math.PI * 1.35), 0, TOP + 2.6, ZF + 0.52, 0, 0, 0, Math.PI * 0.32);
    k.add(gold, new THREE.CircleGeometry(0.16, 5), 0.25, TOP + 2.65, ZF + 0.52);
    // the double doors in an arch, green, with the fanlight over them and the step up
    const dr = new THREE.Shape(), dh = new THREE.Path();
    dr.moveTo(-1.6, 0); dr.lineTo(-1.6, 3.0); roundArch(dr, 0, 3.0, 3.2, 1.6); dr.lineTo(1.6, 0); dr.closePath();
    dh.moveTo(-1.25, 0); dh.lineTo(-1.25, 3.0); roundArch(dh, 0, 3.0, 2.5, 1.25); dh.lineTo(1.25, 0); dh.closePath();
    dr.holes.push(dh);
    k.shape(green, dr, 0.12, 0, 0, ZF + 0.55, 0, 1);
    k.quad(dark, 0, 1.5, ZF + 0.51, 2.5, 3.0);
    k.slab(green, -0.04, 0.04, 0, 3.0, ZF + 0.5, ZF + 0.54, 1);
    k.quad(glass, 0, 3.6, ZF + 0.51, 2.5, 1.25, 0, 0, 0.6, 1, 1);
    k.slab(plinth, -2, 2, FOOT, 0.25, ZF, ZF + 1.3, 1.5);
    k.quad(plain("#e7e1cf"), 0, 5.1, ZF + 0.51, 3.6, 0.55);       // the plaque over the door
  }

  // ---- the minaret -------------------------------------------------------------------------------
  {
    const { x, z } = MIN, B = 1.7;
    k.slab(white, x - B, x + B, TOP, TOP + 3.4, z - B, z + B, 2);
    k.slab(green, x - B - 0.08, x + B + 0.08, TOP + 3.2, TOP + 3.45, z - B - 0.08, z + B + 0.08, 1);
    for (let f = 0; f < 4; f++) { const ry = (f * Math.PI) / 2; k.quad(glass, x + Math.sin(ry) * (B + 0.02), TOP + 1.8, z + Math.cos(ry) * (B + 0.02), 0.7, 1.6, ry); }
    // the eight-sided shaft, its balcony on a green band, and the lantern over it
    const S0 = TOP + 3.45, S1 = S0 + 5.2;
    k.add(white, new THREE.CylinderGeometry(1.2, 1.35, S1 - S0, 8), x, (S0 + S1) / 2, z, Math.PI / 8, 2);
    for (let f = 0; f < 8; f++) {
      const a = (f * Math.PI) / 4 + Math.PI / 8;
      k.quad(dark, x + Math.sin(a) * 1.24, S0 + 2.6, z + Math.cos(a) * 1.24, 0.35, 1.0, a);
    }
    k.add(green, new THREE.CylinderGeometry(1.9, 1.3, 0.5, 8), x, S1 + 0.25, z, Math.PI / 8);
    k.add(white, new THREE.CylinderGeometry(1.95, 1.95, 0.12, 8), x, S1 + 0.56, z, Math.PI / 8);
    for (let f = 0; f < 16; f++) {
      const a = (f * Math.PI) / 8;
      k.cyl(green, x + Math.sin(a) * 1.8, S1 + 0.6, z + Math.cos(a) * 1.8, 0.05, 0.85, 4);
    }
    k.add(green, new THREE.TorusGeometry(1.8, 0.05, 4, 16).rotateX(Math.PI / 2), x, S1 + 1.45, z);
    const L0 = S1 + 0.6, L1 = L0 + 2.2;
    k.add(white, new THREE.CylinderGeometry(0.85, 0.9, L1 - L0, 8), x, (L0 + L1) / 2, z, Math.PI / 8, 2);
    for (let f = 0; f < 8; f++) {
      const a = (f * Math.PI) / 4 + Math.PI / 8;
      k.quad(dark, x + Math.sin(a) * 0.86, L0 + 1.1, z + Math.cos(a) * 0.86, 0.32, 1.1, a);
    }
    k.add(green, new THREE.CylinderGeometry(1.05, 1.05, 0.2, 8), x, L1 + 0.1, z, Math.PI / 8);
    lathe(k, green, onion(1.05, 2.4, 0.8), x, L1 + 0.2, z, 12);
    k.cyl(gold, x, L1 + 2.5, z, 0.05, 0.7, 4);
    k.add(gold, new THREE.TorusGeometry(0.3, 0.06, 6, 12, Math.PI * 1.4), x, L1 + 3.45, z, 0, 0, 0, Math.PI * 0.3);
  }

  const grp = k.build();
  glow(grp, glass, 0, 0.8);
  return grp;
}
