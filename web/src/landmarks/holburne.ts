// The Holburne Museum, as a set piece (landmarks/setpieces.ts) in place of the plain block the map
// tools build there: the old Sydney Hotel at the top of Great Pulteney Street (terraces.ts),
// looking straight down it, designed by Thomas Baldwin in 1794 and built by Charles Harcourt
// Masters, the attic added by John Pinch in 1836 and the whole made a museum by Reginald
// Blomfield in 1913-15. As the listing describes it:
// - a symmetrical front of five bays, its low ground floor in channelled rustication;
// - in the middle a loggia of three arches set forward, carrying a portico of four Corinthian
//   columns in front of the first floor;
// - tall first-floor windows, and an urn-topped parapet hiding Pinch's attic behind it;
// - low wings either side, and at the back, in Sydney Gardens, Eric Parry's extension of 2011:
//   three storeys of glass between fins of glazed ceramic.
// You can walk up the steps into the loggia. Its frame: x across the front, z out of it towards
// the street, y up from the ground in front. Solid (holburneSolids): the house, its wings, the
// extension and the loggia's piers.
import * as THREE from "three";
import { Kit, stone, plain, sashGlass, archedGlass, rustic, glow, roundArch } from "./kit";
import { solids } from "./solids";

const W = 12.5, ZF = 15.7, ZB = -4.3;      // the house: half its width, its front and back
const LZ = 19.3, LW = 6.3;                 // the loggia: its front, and half its width
const GF = 4.8, F1 = 10.2, F2 = 13.0;      // the ground floor's top, the first floor's, the cornice
const WING = 18.4, WH = 6.5;               // the wings reach out to here, this high
const EX = 10, EZ = -15.7, EH = 13.5;      // the extension: half its width, its back, its height

export function holburne(): THREE.Object3D {
  const k = new Kit();
  const S = stone("#ecdcb5"), S2 = stone("#d3bf94"), R = rustic(), sash = sashGlass(), arched = archedGlass();
  const lead = plain("#6e757b"), dark = plain("#2a2724");
  const glass = plain("#3f5a5c", { emissive: "#ffe0b0", emissiveIntensity: 0 }), ceramic = plain("#a9b8a8");

  // ---- the house -------------------------------------------------------------------------------
  k.slab(R, -W, W, -1, GF, ZB, ZF, 3);
  k.slab(S, -W, W, GF, F2, ZB, ZF, 3);
  k.slab(S2, -W - 0.3, W + 0.3, GF - 0.1, GF + 0.25, ZB - 0.2, ZF + 0.3, 1.5);
  k.slab(S2, -W - 0.4, W + 0.4, F2, F2 + 0.6, ZB - 0.3, ZF + 0.45, 1.5);
  k.slab(S, -W, W, F2 + 0.6, F2 + 1.5, ZF - 0.3, ZF, 1.5);
  for (const x of [-W, W]) k.slab(S, x - 0.15, x + 0.15, F2 + 0.6, F2 + 1.5, ZB, ZF, 1.5);
  // Pinch's attic behind the parapet, with Blomfield's rooflights over the gallery
  k.slab(S, -9, 9, F2 + 0.6, F2 + 3.0, ZB + 1.5, ZF - 3.5, 3);
  k.slab(lead, -9.2, 9.2, F2 + 3.0, F2 + 3.2, ZB + 1.3, ZF - 3.3, 3);
  for (const x of [-5.5, 0, 5.5]) k.roof(plain("#8fa3ad", { emissive: "#ffe0b0", emissiveIntensity: 0 }), x - 1.8, x + 1.8, F2 + 3.2, 2, 8, 1.2);
  // urns along the parapet
  const urn = (x: number, y: number, z: number) => {
    k.cyl(S2, x, y, z, 0.28, 0.25, 8);
    k.add(S2, new THREE.SphereGeometry(0.32, 8, 6).scale(1, 1.25, 1), x, y + 0.6, z);
    k.cyl(S2, x, y + 0.95, z, 0.08, 0.3, 6, 0);
  };
  for (const x of [-W, -7.5, -2.5, 2.5, 7.5, W]) urn(x, F2 + 1.5, ZF - 0.15);
  // five bays: small windows in the rustication, tall ones above with cornices, short ones over those
  for (const x of [-10, -5, 0, 5, 10]) {
    if (Math.abs(x) > LW) k.quad(sash, x, 2.4, ZF + 0.02, 1.2, 1.6);
    k.quad(sash, x, GF + 2.3, ZF + 0.02, 1.4, 2.9);
    if (Math.abs(x) > LW) k.slab(S2, x - 1.0, x + 1.0, GF + 3.95, GF + 4.15, ZF, ZF + 0.3, 1);
    k.quad(sash, x, F1 + 1.4, ZF + 0.02, 1.2, 1.6);
  }
  // the sides and back of the house: windows to the gardens
  for (const z of [ZB + 3, ZB + 8, ZB + 13, ZB + 18]) for (const s of [-1, 1]) {
    k.quad(sash, s * (W + 0.02), GF + 2.3, z, 1.4, 2.9, (s * Math.PI) / 2);
    k.quad(sash, s * (W + 0.02), F1 + 1.4, z, 1.2, 1.6, (s * Math.PI) / 2);
  }

  // ---- the loggia of three arches, and the portico on it -------------------------------------------
  {
    const front = new THREE.Shape();
    front.moveTo(-LW, -1); front.lineTo(LW, -1); front.lineTo(LW, GF); front.lineTo(-LW, GF); front.closePath();
    for (const x of [-3.9, 0, 3.9]) {
      const h = new THREE.Path();
      h.moveTo(x - 1.35, 0.6); h.lineTo(x - 1.35, 2.7); roundArch(h, x, 2.7, 2.7, 1.35); h.lineTo(x + 1.35, 0.6); h.closePath();
      front.holes.push(h);
    }
    k.shape(R, front, 0.8, 0, 0, LZ - 0.4, 0, 3);
    for (const s of [-1, 1]) k.slab(R, s * LW - 0.4, s * LW + 0.4, -1, GF, ZF, LZ - 0.8, 3);
    k.slab(S2, -LW - 0.2, LW + 0.2, GF - 0.1, GF + 0.3, ZF, LZ + 0.2, 1.5);       // the floor of the portico above
    k.slab(S2, -LW + 0.4, LW - 0.4, -1, 0.6, ZF, LZ - 0.8, 2);                      // the loggia's floor
    k.quad(dark, 0, 1.9, ZF + 0.02, 1.6, 2.6);                                      // the front door inside it
    k.quad(arched, 0, 3.45, ZF + 0.03, 1.6, 0.9, 0, 0, 0.62, 1, 1);
    // the steps up to it
    for (let i = 0; i < 3; i++) k.slab(S2, -LW + 0.3, LW - 0.3, -1, 0.2 * (i + 1), LZ + 0.9 - 0.45 * i, LZ + 1.35 - 0.45 * i, 1.5);
    // four Corinthian columns, the entablature, and a balustrade with urns on top
    for (const x of [-4.65, -1.55, 1.55, 4.65]) {
      k.slab(S2, x - 0.5, x + 0.5, GF + 0.3, GF + 0.7, LZ - 1.0, LZ, 1);
      k.cyl(S, x, GF + 0.7, LZ - 0.5, 0.4, F1 - GF - 1.4, 12, 0.34);
      k.slab(S2, x - 0.55, x + 0.55, F1 - 0.7, F1, LZ - 1.05, LZ + 0.05, 1);
    }
    k.slab(S, -LW, LW, F1, F1 + 1.1, ZF, LZ + 0.1, 2);
    k.slab(S2, -LW - 0.2, LW + 0.2, F1 + 1.1, F1 + 1.35, ZF, LZ + 0.3, 1.5);
    for (const x of [-LW + 0.3, 0, LW - 0.3]) urn(x, F1 + 1.35, LZ - 0.2);
  }

  // ---- the wings ---------------------------------------------------------------------------------
  for (const s of [-1, 1]) {
    const a = s * W, b = s * WING, x0 = Math.min(a, b), x1 = Math.max(a, b);
    k.slab(R, x0, x1, -1, WH, 0, ZF - 1.5, 3);
    k.slab(S2, x0 - 0.1, x1 + 0.1, WH, WH + 0.3, -0.1, ZF - 1.3, 1.5);
    k.quad(arched, (a + b) / 2, 2.8, ZF - 1.48, 1.6, 3.6);
    urn((a + b) / 2, WH + 0.3, ZF - 1.7);
  }

  // ---- Eric Parry's extension in the gardens behind ------------------------------------------------
  k.slab(glass, -EX + 0.3, EX - 0.3, -1, EH, EZ + 0.3, ZB, 3);
  for (const y of [0, 4.5, 9, EH - 0.5]) k.slab(ceramic, -EX, EX, y, y + 0.5, EZ, ZB, 2);
  for (let x = -EX; x <= EX + 0.01; x += 0.9) k.slab(ceramic, x - 0.06, x + 0.06, 0, EH, EZ - 0.45, EZ, 1);
  for (let z = EZ; z <= ZB - 0.5; z += 0.9) for (const s of [-1, 1]) k.slab(ceramic, s * EX - 0.45 * (s > 0 ? 0 : 1), s * EX + 0.45 * (s > 0 ? 1 : 0), 0, EH, z - 0.06, z + 0.06, 1);

  const grp = k.build();
  for (const m of [sash, arched, glass]) glow(grp, m, 0, 0.85);
  return grp;
}

/** What's solid, in the museum's frame (landmarks/solids.ts). */
export function holburneSolids(): ReturnType<typeof solids>["S"] {
  const { S, wall, floor, post } = solids();
  wall(-W, W, ZB, ZF, F2 + 1.5, true);
  for (const s of [-1, 1]) wall(s * W, s * WING, 0, ZF - 1.5, WH + 0.3, true);
  wall(-EX - 0.45, EX + 0.45, EZ - 0.45, ZB, EH, true);
  // the loggia: its side walls, the piers between its arches, its floor and the steps
  for (const s of [-1, 1]) wall(s * LW - 0.4, s * LW + 0.4, ZF, LZ, GF);
  for (const x of [-5.65, -1.95, 1.95, 5.65]) post(x, LZ - 0.4, 0.55, GF);
  floor(-LW, LW, ZF, LZ, 0.6);
  for (let i = 0; i < 3; i++) floor(-LW, LW, LZ + 0.9 - 0.45 * i, LZ + 1.35 - 0.45 * i, 0.2 * (i + 1));
  return S;
}
