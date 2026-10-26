// Cape Town City Hall, as a set piece (landmarks/setpieces.ts) in place of the plain block the map
// tools build there: Harry Reid and Frederick Green's Edwardian city hall of 1905 on Darling
// Street, looking over the Grand Parade, faced in honey-coloured stone shipped out from Bath.
// - A long front of three storeys over a basement, its ground floor rusticated, a colonnade along
//   the first floor between the corner pavilions, and a balustrade along the top with urns;
// - the pavilions at each end standing forward, with a giant order of paired columns under a
//   pediment and a copper dome on a square drum;
// - in the middle the porch of three arches carrying the balcony over the Parade (where Nelson
//   Mandela spoke on the day he was freed in 1990), and behind it the clock tower, a half-size
//   copy of Big Ben's, with its clock faces, an open belfry hung with a carillon and a steep lead
//   spire between pinnacles.
// The street falls away towards the Castle, so more of the basement shows at that end. You can
// walk up the steps into the porch. Its frame: x along the front (north-west), z out of it to
// Darling Street, y up from the ground floor. Solid as it's drawn (landmarks/shape.ts).
import * as THREE from "three";
import { Kit, stone, plain, sashGlass, archedGlass, rustic, balusters, slate, glow, roundArch } from "./kit";
import { lathe } from "./capekit";

/** The ground floor's level above sea level (the street at the front's middle is 18.2 m). */
export const CITY_HALL_Y = 19.5;

const FOOT = -6;                       // the basement, down to the lowest of the street
const GF = 6, F1 = 14, CORN = 18.5;    // the ground floor's top, the first floor's, the main cornice
const PAR = 1.1;                       // the balustrade along the top
const BACK = -52.4, FRONT = -5.3;      // the main range's back and front
const PAV = { x0: 29.5, x1: 42.6, z: 0.8, top: 21.5 };   // the pavilions (either side), standing forward
const MID = { w: 11.7, z: 0.7 };        // the porch in the middle
const TW = { h: 4.6, z: -12.5 };        // the tower: half its width, and its middle's z

export function cityHall(): THREE.Object3D {
  const k = new Kit();
  const S = stone("#efdcaa"), S2 = stone("#dcc48e"), R = rustic("#e8d4a4");
  const sash = sashGlass(), arched = archedGlass(), bal = balusters("#e8cf98"), roof = slate();
  const copper = plain("#6f9e88"), lead = plain("#5c6268"), dark = plain("#2c2621"), gold = plain("#c9a443");
  const face = plain("#f1ead8", { emissive: "#ffe9b0", emissiveIntensity: 0 });

  const urn = (x: number, y: number, z: number) => {
    k.cyl(S2, x, y, z, 0.26, 0.25, 8);
    k.add(S2, new THREE.SphereGeometry(0.3, 8, 6).scale(1, 1.25, 1), x, y + 0.55, z);
    k.cyl(S2, x, y + 0.9, z, 0.07, 0.3, 6, 0);
  };
  /** A balustrade along x from x0 to x1 at z, on top of y, facing out (+z). */
  const balustrade = (x0: number, x1: number, y: number, z: number, urns = true) => {
    k.slab(S2, x0, x1, y, y + 0.2, z - 0.3, z + 0.3, 1.5);
    k.quad(bal, (x0 + x1) / 2, y + 0.2 + (PAR - 0.4) / 2, z, x1 - x0, PAR - 0.4, 0, 0, 0, (x1 - x0) / 1.6, 1);
    k.slab(S2, x0, x1, y + PAR - 0.2, y + PAR, z - 0.3, z + 0.3, 1.5);
    if (urns) for (let x = x0; x <= x1 + 0.01; x += (x1 - x0) / Math.max(1, Math.round((x1 - x0) / 6))) {
      k.slab(S2, x - 0.35, x + 0.35, y, y + PAR, z - 0.35, z + 0.35, 1);
      urn(x, y + PAR, z);
    }
  };
  /** A column on a plinth, from y0 to y1, its capital and base. */
  const column = (x: number, z: number, y0: number, y1: number, r = 0.42) => {
    k.slab(S2, x - r - 0.15, x + r + 0.15, y0, y0 + 0.5, z - r - 0.15, z + r + 0.15, 1);
    k.cyl(S, x, y0 + 0.5, z, r, y1 - y0 - 1.1, 12, r * 0.86);
    k.slab(S2, x - r - 0.2, x + r + 0.2, y1 - 0.6, y1, z - r - 0.2, z + r + 0.2, 1);
  };

  // ---- the main range ------------------------------------------------------------------------
  k.slab(R, -32, PAV.x1, FOOT, GF, BACK, FRONT, 3);
  k.slab(S, -32, PAV.x1, GF, CORN, BACK, FRONT, 3);
  k.slab(R, -PAV.x1, -32, FOOT, GF, -25.8, FRONT, 3);
  k.slab(S, -PAV.x1, -32, GF, CORN, -25.8, FRONT, 3);
  // a band over the ground floor, the cornice, and the hipped slate roof behind the balustrade
  k.slab(S2, -PAV.x1 - 0.2, PAV.x1 + 0.2, GF - 0.1, GF + 0.4, BACK - 0.2, FRONT + 0.25, 1.5);
  k.slab(S2, -PAV.x1 - 0.4, PAV.x1 + 0.4, CORN - 0.6, CORN, BACK - 0.4, FRONT + 0.5, 1.5);
  k.roof(roof, -30, 40.5, CORN, BACK + 2, FRONT - 2, 5, false, true);
  // the sides and back: windows in every bay
  for (let z = BACK + 3; z < FRONT - 1; z += 3.6) {
    k.quad(sash, PAV.x1 + 0.02, 3.0, z, 1.3, 2.4, Math.PI / 2);
    k.quad(arched, PAV.x1 + 0.02, GF + 3.6, z, 1.5, 4.2, Math.PI / 2);
    k.quad(sash, PAV.x1 + 0.02, F1 + 2.1, z, 1.2, 1.8, Math.PI / 2);
  }
  for (let x = -30; x < PAV.x1 - 1; x += 3.6) {
    k.quad(sash, x, 3.0, BACK - 0.02, 1.3, 2.4, Math.PI);
    k.quad(sash, x, GF + 3.4, BACK - 0.02, 1.4, 3.2, Math.PI);
    k.quad(sash, x, F1 + 2.1, BACK - 0.02, 1.2, 1.8, Math.PI);
  }
  for (let z = -24; z < FRONT - 1; z += 3.6) {
    k.quad(sash, -PAV.x1 - 0.02, 3.0, z, 1.3, 2.4, -Math.PI / 2);
    k.quad(arched, -PAV.x1 - 0.02, GF + 3.6, z, 1.5, 4.2, -Math.PI / 2);
  }

  // ---- the colonnades along the first floor, either side of the middle ---------------------------
  for (const s of [-1, 1]) {
    const a = s * (MID.w + 0.6), b = s * (PAV.x0 - 0.6), x0 = Math.min(a, b), x1 = Math.max(a, b);
    const n = 7, step = (x1 - x0) / n;
    for (let i = 0; i <= n; i++) column(x0 + i * step, FRONT + 1.6, GF + 0.4, F1, 0.4);
    k.slab(S2, x0 - 0.6, x1 + 0.6, F1, F1 + 1.0, FRONT, FRONT + 2.2, 1.5);    // the entablature
    k.slab(S, x0 - 0.6, x1 + 0.6, GF + 0.2, GF + 0.4, FRONT, FRONT + 2.2, 1.5);  // the colonnade's floor
    balustrade(x0, x1, GF + 0.4, FRONT + 2.0, false);
    for (let i = 0; i < n; i++) {
      const x = x0 + (i + 0.5) * step;
      k.quad(arched, x, GF + 3.5, FRONT + 0.02, 1.5, 4.0);
      k.quad(sash, x, F1 + 2.1, FRONT + 0.02, 1.2, 1.8);
      k.quad(arched, x, 3.0, FRONT + 0.02, 1.4, 2.8);
      k.quad(sash, x, -2.4, FRONT + 0.02, 1.1, 1.0);
    }
    balustrade(x0 - 0.6, x1 + 0.6, CORN, FRONT + 0.3);
  }

  // ---- the corner pavilions, with their domes -------------------------------------------------------
  for (const s of [-1, 1]) {
    const a = s * PAV.x0, b = s * PAV.x1, x0 = Math.min(a, b), x1 = Math.max(a, b), cx = (x0 + x1) / 2, Z = PAV.z;
    k.slab(R, x0, x1, FOOT, GF, FRONT - 1, Z, 3);
    k.slab(S, x0, x1, GF, PAV.top, FRONT - 1, Z, 3);
    k.slab(S2, x0 - 0.2, x1 + 0.2, GF - 0.1, GF + 0.4, FRONT - 1, Z + 0.25, 1.5);
    // the giant order: paired columns either side of the middle bay, an entablature and pediment
    for (const dx of [-4.6, -3.4, 3.4, 4.6]) column(cx + dx, Z + 0.6, GF + 0.4, PAV.top - 2.2, 0.45);
    k.slab(S2, x0, x1, PAV.top - 2.2, PAV.top - 0.6, Z, Z + 1.3, 1.5);
    k.slab(S2, x0 - 0.3, x1 + 0.3, PAV.top - 0.6, PAV.top, FRONT - 1.3, Z + 1.5, 1.5);
    {
      const ped = new THREE.Shape();
      ped.moveTo(-(x1 - x0) / 2, 0); ped.lineTo((x1 - x0) / 2, 0); ped.lineTo(0, 3.0); ped.closePath();
      k.shape(S2, ped, 1.2, cx, PAV.top, Z + 0.8, 0, 1.5);
      k.add(S2, new THREE.CircleGeometry(0.9, 12), cx, PAV.top + 1.2, Z + 1.42);    // a roundel in it
    }
    // windows: a tall arched one between the pairs, narrower ones either side, small ones below
    k.quad(arched, cx, GF + 4.6, Z + 0.02, 2.0, 6.4);
    for (const dx of [-5.6, 5.6]) k.quad(sash, cx + dx, GF + 4.2, Z + 0.02, 1.2, 3.0);
    for (const dx of [-5.2, 0, 5.2]) { k.quad(arched, cx + dx, 3.0, Z + 0.02, 1.5, 2.8); k.quad(sash, cx + dx, -2.4, Z + 0.02, 1.1, 1.0); }
    for (let z = FRONT + 1; z < Z; z += 3) k.quad(sash, s > 0 ? x1 + 0.02 : x0 - 0.02, GF + 4.2, z, 1.2, 3.0, (s * Math.PI) / 2);
    // the drum, the dome, its lantern and finial
    const dz = (FRONT - 1 + Z) / 2 - 1, D = 4.2;
    k.slab(S, cx - D, cx + D, PAV.top, PAV.top + 3.2, dz - D, dz + D, 2);
    k.slab(S2, cx - D - 0.3, cx + D + 0.3, PAV.top + 3.2, PAV.top + 3.7, dz - D - 0.3, dz + D + 0.3, 1);
    for (let f = 0; f < 4; f++) { const ry = (f * Math.PI) / 2; k.quad(arched, cx + Math.sin(ry) * (D + 0.02), PAV.top + 1.6, dz + Math.cos(ry) * (D + 0.02), 1.1, 2.2, ry); }
    lathe(k, copper, [[D + 0.1, 0], [D, 0.6], [D - 0.6, 2.2], [D - 1.8, 3.6], [1.4, 4.4], [0.9, 4.6]], cx, PAV.top + 3.7, dz, 4);
    k.cyl(S2, cx, PAV.top + 8.3, dz, 0.9, 1.6, 8);
    lathe(k, copper, [[1.05, 0], [0.9, 0.5], [0.4, 1.0], [0.12, 1.3], [0.001, 1.4]], cx, PAV.top + 9.9, dz, 8);
    k.cyl(gold, cx, PAV.top + 11.2, dz, 0.05, 1.0, 4);
  }

  // ---- the porch and the balcony in the middle -----------------------------------------------------
  {
    const W = MID.w, Z = MID.z;
    // three arches through a rusticated front, onto a porch inside them
    const front = new THREE.Shape();
    front.moveTo(-W, FOOT); front.lineTo(W, FOOT); front.lineTo(W, GF); front.lineTo(-W, GF); front.closePath();
    for (const x of [-6.2, 0, 6.2]) {
      const h = new THREE.Path();
      h.moveTo(x - 1.9, 0.3); h.lineTo(x - 1.9, 3.3); roundArch(h, x, 3.3, 3.8, 1.9); h.lineTo(x + 1.9, 0.3); h.closePath();
      front.holes.push(h);
    }
    k.shape(R, front, 1.0, 0, 0, Z - 0.5, 0, 3);
    for (const s of [-1, 1]) k.slab(R, s * W - 0.8, s * W + 0.8, FOOT, GF, FRONT, Z - 1, 3);
    k.slab(S2, -W + 0.8, W - 0.8, FOOT, 0.3, FRONT, Z - 1, 2);                // the porch's floor
    for (const x of [-6.2, 0, 6.2]) { k.quad(dark, x, 1.8, FRONT + 0.02, 2.0, 3.0); k.quad(arched, x, 3.9, FRONT + 0.03, 2.0, 1.0, 0, 0, 0.62, 1, 1); }
    // the steps up from the street
    for (let i = 0; i < 6; i++) k.slab(S2, -W + 0.4, W - 0.4, FOOT, 0.3 - i * 0.3, Z + 0.4 * i, Z + 0.4 * (i + 1), 1.5);
    // the floor above, its front with the balcony on brackets, and the columns behind it
    k.slab(S, -W, W, GF, CORN, FRONT, Z - 1.5, 3);
    k.slab(S2, -W - 0.2, W + 0.2, GF - 0.1, GF + 0.35, FRONT, Z + 0.6, 1.5);
    for (const x of [-9.3, -3.1, 3.1, 9.3]) k.slab(S2, x - 0.35, x + 0.35, GF - 1.0, GF - 0.1, Z - 0.3, Z + 0.5, 1);
    balustrade(-W - 0.2, W + 0.2, GF + 0.35, Z + 0.3);
    for (const x of [-9.3, -6.2, -3.1, 3.1, 6.2, 9.3]) column(x, Z - 0.9, GF + 0.35, F1 + 0.6, 0.45);
    for (const x of [-4.65, 4.65]) k.quad(arched, x, GF + 3.6, Z - 1.48, 1.6, 4.4);
    k.quad(dark, 0, GF + 2.0, Z - 1.48, 2.0, 3.4);                              // the doors onto the balcony
    k.quad(arched, 0, GF + 4.5, Z - 1.47, 2.0, 1.2, 0, 0, 0.6, 1, 1);
    k.slab(S2, -W, W, F1 + 0.6, F1 + 1.8, Z - 1.6, Z, 1.5);
    k.slab(S2, -W - 0.3, W + 0.3, F1 + 1.8, F1 + 2.2, Z - 1.6, Z + 0.3, 1.5);
    {
      const ped = new THREE.Shape();
      ped.moveTo(-W - 0.3, 0); ped.lineTo(W + 0.3, 0); ped.lineTo(0, 3.4); ped.closePath();
      k.shape(S2, ped, 1.4, 0, F1 + 2.2, Z - 0.75, 0, 1.5);
      k.add(gold, new THREE.CircleGeometry(1.0, 14), 0, F1 + 3.3, Z + 0.0);      // the city's arms
    }
    k.slab(S, -W, W, F1 + 2.2, CORN + 1.2, FRONT, Z - 1.6, 3);
  }

  // ---- the clock tower ---------------------------------------------------------------------------
  {
    const H = TW.h, tz = TW.z, SHAFT = 38, CLOCK = 44.5, BELL = 50;
    k.slab(S, -H, H, CORN, SHAFT, tz - H, tz + H, 3);
    // the corners in quoins, slit windows up the shaft, and a band at each stage
    for (const [x, z] of [[-H, tz - H], [H, tz - H], [-H, tz + H], [H, tz + H]]) k.slab(S2, x - 0.45, x + 0.45, CORN, SHAFT, z - 0.45, z + 0.45, 1.5);
    for (const y of [26, 32]) k.slab(S2, -H - 0.3, H + 0.3, y, y + 0.4, tz - H - 0.3, tz + H + 0.3, 1.5);
    for (let f = 0; f < 4; f++) {
      const ry = (f * Math.PI) / 2, sx = Math.sin(ry), sz = Math.cos(ry);
      for (const y of [23, 29, 34.5]) k.quad(arched, sx * (H + 0.02), y, tz + sz * (H + 0.02), 0.9, 2.6, ry);
    }
    // the clock stage, standing out a little, with a face on every side
    const C = H + 0.5;
    k.slab(S2, -C - 0.3, C + 0.3, SHAFT, SHAFT + 0.6, tz - C - 0.3, tz + C + 0.3, 1.5);
    k.slab(S, -C, C, SHAFT + 0.6, CLOCK, tz - C, tz + C, 3);
    for (let f = 0; f < 4; f++) {
      const ry = (f * Math.PI) / 2, sx = Math.sin(ry), sz = Math.cos(ry), cy = (SHAFT + CLOCK) / 2 + 0.3;
      k.add(gold, new THREE.CircleGeometry(2.3, 24), sx * (C + 0.03), cy, tz + sz * (C + 0.03), ry);
      k.add(face, new THREE.CircleGeometry(2.0, 24), sx * (C + 0.05), cy, tz + sz * (C + 0.05), ry);
      // the hands at ten to two, and the hour marks
      const hand = (len: number, a: number, w: number) => {
        const g = new THREE.PlaneGeometry(w, len).translate(0, len / 2, 0).rotateZ(a);
        k.add(dark, g, sx * (C + 0.08), cy, tz + sz * (C + 0.08), ry);
      };
      hand(1.2, 1.0, 0.16); hand(1.75, -1.05, 0.11);
      for (let m = 0; m < 12; m++) hand(0.28, (m * Math.PI) / 6, 0.09);
    }
    // the open belfry, its pinnacles, and the spire
    k.slab(S2, -C - 0.4, C + 0.4, CLOCK, CLOCK + 0.7, tz - C - 0.4, tz + C + 0.4, 1.5);
    k.slab(dark, -H + 0.6, H - 0.6, CLOCK + 0.7, BELL, tz - H + 0.6, tz + H - 0.6, 2);
    for (const a of [-1, 1]) for (const b of [-1, 1]) {
      k.slab(S, a * H - 0.8, a * H + 0.8, CLOCK + 0.7, BELL, tz + b * H - 0.8, tz + b * H + 0.8, 2);
      k.slab(S, -0.4, 0.4, CLOCK + 0.7, BELL, tz + b * H - 0.5, tz + b * H + 0.5, 2);
      k.slab(S, a * H - 0.5, a * H + 0.5, CLOCK + 0.7, BELL, tz - 0.4, tz + 0.4, 2);
    }
    k.slab(S2, -C, C, BELL, BELL + 0.8, tz - C, tz + C, 1.5);
    for (const a of [-1, 1]) for (const b of [-1, 1]) {
      const px = a * (C - 0.5), pz = tz + b * (C - 0.5);
      k.slab(S, px - 0.5, px + 0.5, BELL + 0.8, BELL + 3.2, pz - 0.5, pz + 0.5, 1);
      k.cyl(lead, px, BELL + 3.2, pz, 0.62, 2.2, 4, 0);
    }
    k.add(lead, new THREE.ConeGeometry(C * Math.SQRT2 * 0.92, 8.5, 4).rotateY(Math.PI / 4), 0, BELL + 0.8 + 4.25, tz);
    for (let f = 0; f < 4; f++) {
      const ry = (f * Math.PI) / 2, sx = Math.sin(ry), sz = Math.cos(ry);
      // a little gabled dormer on each face of the spire
      k.box(lead, sx * (C - 1.4), BELL + 2.4, tz + sz * (C - 1.4), 1.2, 1.4, 1.2, ry, 1);
      k.add(gold, new THREE.ConeGeometry(0.9, 0.9, 4).rotateY(Math.PI / 4), sx * (C - 1.4), BELL + 4.25, tz + sz * (C - 1.4));
    }
    k.cyl(lead, 0, BELL + 9.2, tz, 0.5, 1.2, 8);
    k.cyl(gold, 0, BELL + 10.4, tz, 0.08, 2.4, 4);
    k.add(gold, new THREE.SphereGeometry(0.28, 8, 6), 0, BELL + 11.0, tz);
  }

  const grp = k.build();
  for (const m of [sash, arched]) glow(grp, m, 0, 0.85);
  glow(grp, face, 0.05, 0.9);
  return grp;
}
