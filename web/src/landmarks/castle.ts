// The Castle of Good Hope, as a set piece (landmarks/setpieces.ts) in place of the plain block the
// map tools build there: the Dutch East India Company's star fort of 1666-79, the oldest building
// in South Africa, built on what was then the shore of Table Bay.
// - Five bastions, one at each corner of a pentagon (Leerdam, Buuren, Catzenellenbogen, Nassau
//   and Oranje), joined by low curtain walls of dark stone with a walk along the ramparts behind
//   a parapet, cannon on the bastions. The plan is the map's own outline of it.
// - The gateway of 1682 in the middle of the curtain facing the city and the Grand Parade: a
//   stone frontispiece with a pediment carrying the arms of the United Netherlands, and the bell
//   tower over it, ochre with a curved cap, that hangs the oldest bell in the country (1697).
// - Inside, the long low ranges in the castle's ochre and white round the courtyard, which the
//   Kat, the cross-wall of 1691, divides in two; the Kat balcony, with its stairs curving up
//   either side, looks over the eastern court, and the Dolphin Pool lies beyond.
// The moat that's left (the stretch round Leerdam, by the Grand Parade) is the map's own water.
// You can walk in through the gate, cross the courts and climb up to the ramparts. Its frame:
// x along the gate's curtain, z out through the gate towards the city, y up from the courtyard.
// Solid as it's drawn (landmarks/shape.ts).
import * as THREE from "three";
import { Kit, stone, plain, sashGlass, flags, balusters, glow, roundArch } from "./kit";
import { type P2, plan, grow, lathe, wallRun, windowsAlong, outward } from "./capekit";

/** The courtyard's level above sea level: the street's at the gate. */
export const CASTLE_Y = 8;

const WALL = 9;           // the rampart walk, above the courtyard
const FOOT = -8;          // how far down the walls go, to meet the ground all round
const GATE = 2.2;         // half the gateway's width
const ARCH = 5;           // the passage's height under the gate

// The fort's outline, from the map's (the bastions' tips, flanks and the curtains between).
const OUTER: P2[] = [
  [-35, 77.6], [30.4, 77.5],
  [30.2, 91.4], [69.1, 105.6], [67.9, 64.3], [55, 60],                        // Oranje
  [76.2, -2.4], [88.7, 1.7], [114.4, -31.2], [74.5, -43.5], [66.6, -32.1],   // Nassau
  [13.5, -70.9], [21.6, -82.1], [-2.3, -117.2], [-26.4, -82.4], [-17.3, -69.9], // Catzenellenbogen
  [-70.8, -31.5], [-78.8, -42.8], [-119.1, -32.1], [-93.1, 1.1], [-79.6, -2.8], // Buuren
  [-70.4, 27.4], [-60.9, 59.8], [-74, 63.9], [-74.9, 105.8], [-35, 90.7],      // Leerdam
];
/** The bastions' tips, for the cannon. */
const TIPS: P2[] = [[69.1, 105.6], [114.4, -31.2], [-2.3, -117.2], [-119.1, -32.1], [-74.9, 105.8]];
// The courtyard, both courts together (the Kat stands across it), going round the other way
// from the outline, starting at the gate's west side.
const COURT: P2[] = [
  [-45, 61.9], [-54.6, 28.6], [-66.3, -10], [-70.9, -16.8], [-60.9, -24.1], [-29.1, -46.1], [-2.9, -65],
  [1.7, -62.6], [54.3, -24], [67.5, -15.3], [43.3, 54.9], [40.7, 61.9],
];
const COURT_Z = 61.9;     // the court's side behind the gate
const KAT = { x0: -10.2, x1: 7.2, z0: -60, z1: 50, h: 10.5 };

/** What it stands in for: the fort, a little wider. */
export const CASTLE_OUTLINE: [number, number][] = grow(OUTER, 2);

export function castle(): THREE.Object3D {
  const k = new Kit();
  const S = stone("#827b6d"), S2 = stone("#a49a86"), cope = stone("#d6cdb6");
  const ochre = plain("#d9a94a"), white = plain("#efeadc"), dark = plain("#2b2622"), iron = plain("#24262a");
  const sash = sashGlass(), paving = flags(), lead = plain("#5d6266"), rail = balusters("#f2ede0");
  const water = plain("#3f6d73", { transparent: true, opacity: 0.85 });
  water.userData.ghost = true;

  // ---- the ramparts: one mass from the outline in to the courtyard, through which the gate runs ----
  // the outline, in through the gate, round the courtyard and back out: one plan with no holes
  const ring: P2[] = [[-35, 77.6], [-GATE, 77.6], [-GATE, COURT_Z], ...COURT, [GATE, COURT_Z], [GATE, 77.5], ...OUTER.slice(1)];
  plan(k, S, ring, [], FOOT, WALL, 3);
  plan(k, paving, COURT, [], FOOT, 0, 1.5);
  // the passage's vault, and its floor of cobbles
  k.slab(S2, -GATE, GATE, ARCH, WALL, COURT_Z, 77.6, 3);
  k.slab(paving, -GATE, GATE, FOOT, 0, COURT_Z - 0.1, 79.5, 1.5);
  // the scarp at the foot of the walls, the cordon round them under the parapet, and the parapet
  // with its coping (the walk behind it is the mass's top)
  plan(k, S2, grow(OUTER, 0.6), [OUTER], FOOT, -0.6, 3);
  plan(k, cope, grow(OUTER, 0.25), [OUTER], WALL - 1.6, WALL - 1.25, 2);
  plan(k, S, OUTER, [grow(OUTER, -0.9)], WALL, WALL + 1.2, 3);
  plan(k, cope, grow(OUTER, 0.08), [grow(OUTER, -0.98)], WALL + 1.2, WALL + 1.4, 2);
  // the cannon on the bastions, pointing out over the parapet
  {
    const mid = TIPS.reduce((a, t) => [a[0] + t[0] / 5, a[1] + t[1] / 5], [0, 0] as P2);
    for (const t of TIPS) {
      const dx = t[0] - mid[0], dz = t[1] - mid[1], l = Math.hypot(dx, dz), ux = dx / l, uz = dz / l, ry = Math.atan2(ux, uz);
      for (const side of [-1, 1]) {
        const px = t[0] - ux * 9 + uz * side * 4, pz = t[1] - uz * 9 - ux * side * 4;
        k.box(dark, px, WALL, pz, 1.3, 0.6, 1.8, ry, 1);
        for (const w of [-0.7, 0.7]) k.add(dark, new THREE.CylinderGeometry(0.45, 0.45, 0.15, 10).rotateZ(Math.PI / 2), px + uz * w, WALL + 0.45, pz - ux * w, ry);
        k.add(iron, new THREE.CylinderGeometry(0.18, 0.3, 2.8, 10).rotateX(Math.PI / 2), px + ux * 1.1, WALL + 0.95, pz + uz * 1.1, ry);
      }
    }
  }

  // ---- the ranges round the courtyard: ochre fronts with white cornices and sash windows ----
  const front = (a: P2, b: P2, ring: P2[], top: number, doors = true) => {
    const [ox, oz] = outward(a, b, ring), nx = -ox, nz = -oz;    // the court is inside the ring
    const a2: P2 = [a[0] + nx * 0.12, a[1] + nz * 0.12], b2: P2 = [b[0] + nx * 0.12, b[1] + nz * 0.12];
    wallRun(k, ochre, a2, b2, 0, top - 0.6, 0.24);
    wallRun(k, white, [a2[0] + nx * 0.1, a2[1] + nz * 0.1], [b2[0] + nx * 0.1, b2[1] + nz * 0.1], top - 0.9, top - 0.4, 0.3, 1);
    wallRun(k, white, [a2[0] + nx * 0.1, a2[1] + nz * 0.1], [b2[0] + nx * 0.1, b2[1] + nz * 0.1], 0, 0.5, 0.3, 1);
    const near = (p: P2) => Math.abs(p[0]) < GATE + 1.5 && p[1] > COURT_Z - 1;
    const skip = (t: number) => { const f = t / Math.hypot(b[0] - a[0], b[1] - a[1]); return near([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]); };
    windowsAlong(k, sash, a2, b2, nx, nz, 5.9, 1.3, 2.0, 4.2, skip);
    windowsAlong(k, sash, a2, b2, nx, nz, 2.3, 1.3, 2.0, 4.2, (t) => skip(t) || (doors && Math.round(t / 4.2) % 4 === 2));
    if (doors) windowsAlong(k, dark, a2, b2, nx, nz, 1.3, 1.4, 2.6, 16.8, skip);
  };
  for (let i = 0; i < COURT.length; i++) {
    const a = COURT[i], b = COURT[(i + 1) % COURT.length];
    if (a[1] > COURT_Z - 0.5 && b[1] > COURT_Z - 0.5) {
      // the range behind the gate, either side of the passage
      front(a, [GATE, COURT_Z], COURT, WALL); front([-GATE, COURT_Z], b, COURT, WALL);
      continue;
    }
    front(a, b, COURT, WALL);
  }
  // the gate passage's mouth into the court, framed in white
  k.slab(white, -GATE - 0.6, -GATE, 0, ARCH + 0.6, COURT_Z - 0.4, COURT_Z, 1);
  k.slab(white, GATE, GATE + 0.6, 0, ARCH + 0.6, COURT_Z - 0.4, COURT_Z, 1);
  k.slab(white, -GATE - 0.6, GATE + 0.6, ARCH, ARCH + 0.6, COURT_Z - 0.4, COURT_Z, 1);
  // a flight of steps up to the rampart walk, against the range behind the gate in the west court
  for (let i = 0; i < 30; i++) {
    const x1 = -14 - i * 0.36;
    k.slab(cope, x1 - 0.36, x1, 0, 0.3 * (i + 1), COURT_Z - 1.8, COURT_Z - 0.1, 1.5);
  }

  // ---- the Kat: the cross-wall range of 1691, with the balcony ----
  {
    const { x0, x1, z0, z1, h } = KAT;
    k.slab(ochre, x0, x1, 0, h, z0, z1, 3);
    k.slab(white, x0 - 0.15, x1 + 0.15, 0, 0.5, z0, z1 + 0.15, 1);
    k.slab(white, x0 - 0.2, x1 + 0.2, h - 0.7, h - 0.2, z0, z1 + 0.2, 1);
    k.slab(white, x0, x1, h, h + 0.9, z0, z1, 1);                      // the parapet over its flat roof
    k.slab(lead, x0 + 0.4, x1 - 0.4, h + 0.2, h + 0.3, z0, z1 - 0.4, 3);
    const balcony = (t: number) => Math.abs(z0 + t) < 6;
    for (const [a, b, n] of [[[x1, z0], [x1, z1], [1, 0]], [[x0, z1], [x0, z0], [-1, 0]]] as [P2, P2, P2][]) {
      const sk = n[0] > 0 ? balcony : () => false;
      windowsAlong(k, sash, a, b, n[0], n[1], 6.6, 1.3, 2.2, 4.2, sk);
      windowsAlong(k, sash, a, b, n[0], n[1], 2.5, 1.3, 2.2, 4.2, sk);
    }
    // its end facing the gate: a door under a white pediment
    k.quad(dark, (x0 + x1) / 2, 1.5, z1 + 0.02, 1.8, 3.0);
    k.slab(white, (x0 + x1) / 2 - 1.5, (x0 + x1) / 2 + 1.5, 3.0, 3.3, z1, z1 + 0.25, 1);
    for (const x of [-6, 3]) k.quad(sash, x, 6.6, z1 + 0.02, 1.3, 2.2);

    // the balcony: a white frontispiece of pilasters and a scrolled pediment, the balcony on
    // brackets in front of the door to the great hall, and stairs curving up to it either side
    const bx = x1, by = 4.6;
    k.slab(white, bx, bx + 0.5, 0, h + 1.6, -4.2, 4.2, 1);
    for (const z of [-3.6, -1.6, 1.6, 3.6]) k.slab(white, bx + 0.5, bx + 0.85, by + 0.4, h - 0.7, z - 0.3, z + 0.3, 1);
    k.quad(dark, bx + 0.52, by + 1.7, 0, 1.8, 3.0, Math.PI / 2);
    k.quad(dark, bx + 0.52, 1.5, 0, 1.6, 2.8, Math.PI / 2);
    {
      const ped = new THREE.Shape();
      ped.moveTo(-4.4, 0); ped.lineTo(-4.4, 0.5);
      roundArch(ped, 0, 0.5, 8.8, 2.0);
      ped.lineTo(4.4, 0); ped.closePath();
      ped.holes.push(new THREE.Path([new THREE.Vector2(-1, 0.6), new THREE.Vector2(1, 0.6), new THREE.Vector2(1, 2.1), new THREE.Vector2(-1, 2.1)]));
      k.shape(white, ped, 0.5, bx + 0.25, h + 1.6, 0, Math.PI / 2, 1);
      k.quad(plain("#c99a3c"), bx + 0.55, h + 2.9, 0, 1.6, 1.3, Math.PI / 2);    // the arms in the pediment
    }
    k.slab(white, bx, bx + 2.6, by - 0.35, by, -3.2, 3.2, 1);               // the balcony
    for (const z of [-2.4, 0, 2.4]) k.slab(white, bx, bx + 0.6, by - 1.4, by - 0.35, z - 0.25, z + 0.25, 1);
    k.quad(rail, bx + 2.55, by + 0.5, 0, 6.4, 1.0, Math.PI / 2, 0, 0, 4, 1);
    for (const s of [-1, 1]) {
      // the stair down from each end of the balcony, curving out along the front
      const n = 15;
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n, a = t * (Math.PI / 2);
        const cx = bx + 1.4 + Math.sin(a) * 1.6, cz = s * (3.2 + (1 - Math.cos(a)) * 1.2 + t * 3.6);
        const y = by * (1 - (i + 1) / n);
        k.box(white, cx, -0.2, cz, 2.2, y + 0.2 + by / n, 0.75, s * a * 0.6, 1);
      }
    }
  }

  // ---- the Dolphin Pool, in its low walled court beyond the balcony ----
  {
    const pool: P2[] = [[19.4, 30.5], [35.1, 30.9], [34.4, 52.8], [19.4, 52.4]];
    for (let i = 0; i < 4; i++) {
      const a = pool[i], b = pool[(i + 1) % 4];
      const mid: P2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      // the low walls round it, open in the middle of each side
      for (const [p, q] of [[a, [mid[0] + (a[0] - mid[0]) * 0.2, mid[1] + (a[1] - mid[1]) * 0.2]], [[mid[0] + (b[0] - mid[0]) * 0.2, mid[1] + (b[1] - mid[1]) * 0.2], b]] as [P2, P2][]) {
        wallRun(k, ochre, p, q, 0, 2.4, 0.5);
        wallRun(k, white, p, q, 2.4, 2.65, 0.65, 1);
      }
    }
    k.slab(cope, 23, 31, 0, 0.55, 36, 47, 1.5);
    k.slab(water, 23.4, 30.6, 0.3, 0.45, 36.4, 46.6, 3);
    k.cyl(cope, 27, 0.45, 41.5, 0.5, 1.4, 10);
    k.add(cope, new THREE.SphereGeometry(0.55, 10, 6).scale(1, 0.7, 1), 27, 1.95, 41.5);
  }

  // ---- the gateway of 1682, with the bell tower over it ----
  {
    const Z = 77.6, gs = stone("#9d9585"), gs2 = stone("#c3b9a2");
    const face = new THREE.Shape(), hole = new THREE.Path();
    face.moveTo(-5, FOOT); face.lineTo(5, FOOT); face.lineTo(5, WALL + 1.6); face.lineTo(-5, WALL + 1.6); face.closePath();
    hole.moveTo(-GATE, -0.5); hole.lineTo(-GATE, ARCH - GATE); roundArch(hole, 0, ARCH - GATE, 2 * GATE, GATE); hole.lineTo(GATE, -0.5); hole.closePath();
    face.holes.push(hole);
    k.shape(gs, face, 1.2, 0, 0, Z + 0.6, 0, 2.5);
    // paired pilasters either side of the arch, an entablature, and the pediment with the arms
    for (const x of [-4.3, -3.1, 3.1, 4.3]) k.slab(gs2, x - 0.4, x + 0.4, 0, 7.4, Z + 1.2, Z + 1.6, 1.5);
    k.slab(gs2, -5.3, 5.3, 7.4, 8.3, Z + 1.0, Z + 1.75, 1.5);
    k.slab(gs2, -5.5, 5.5, 8.3, 8.6, Z + 1.0, Z + 1.95, 1.5);
    {
      const ped = new THREE.Shape();
      ped.moveTo(-5.4, 0); ped.lineTo(5.4, 0); ped.lineTo(0, 2.6); ped.closePath();
      k.shape(gs2, ped, 0.7, 0, 8.6, Z + 1.4, 0, 1.5);
      // the arms: a shield of the lion of the United Netherlands, gold on blue, and a crown
      k.quad(plain("#d8b04a"), 0, 9.55, Z + 1.77, 1.7, 1.5);
      k.quad(plain("#2c4a86"), 0, 9.5, Z + 1.78, 1.2, 1.1);
      k.quad(plain("#d8b04a"), 0, 9.45, Z + 1.79, 0.5, 0.65);
    }
    k.add(gs2, new THREE.SphereGeometry(0.45, 8, 6).scale(1, 1.3, 1), 0, 11.6, Z + 1.4);
    for (const x of [-5.2, 5.2]) k.add(gs2, new THREE.SphereGeometry(0.35, 8, 6).scale(1, 1.3, 1), x, 9.0, Z + 1.4);
    // the doors, open back against the sides of the passage
    for (const s of [-1, 1]) k.slab(plain("#4a3524"), s * GATE - s * 0.12 - 0.06, s * GATE - s * 0.12 + 0.06, 0, ARCH - 0.6, Z - 2.4, Z - 0.2, 1);

    // the bell tower: a square ochre tower over the passage, white at its corners, an open
    // arched stage for the bell, and a curved cap with its weathervane
    const T0 = 2.8, tz = 70, top = WALL + 7.5;
    k.slab(ochre, -T0, T0, WALL, top, tz - T0, tz + T0, 3);
    for (const [x, z] of [[-T0, tz - T0], [T0, tz - T0], [-T0, tz + T0], [T0, tz + T0]]) k.slab(white, x - 0.35, x + 0.35, WALL, top, z - 0.35, z + 0.35, 1);
    k.slab(white, -T0 - 0.3, T0 + 0.3, top - 3.6, top - 3.3, tz - T0 - 0.3, tz + T0 + 0.3, 1);
    k.slab(white, -T0 - 0.45, T0 + 0.45, top, top + 0.5, tz - T0 - 0.45, tz + T0 + 0.45, 1);
    for (let f = 0; f < 4; f++) {
      const ry = (f * Math.PI) / 2, sx = Math.sin(ry), sz = Math.cos(ry);
      k.quad(dark, sx * (T0 + 0.03), top - 1.7, tz + sz * (T0 + 0.03), 1.8, 2.6, ry);
      k.quad(sash, sx * (T0 + 0.03), WALL + 1.9, tz + sz * (T0 + 0.03), 1.0, 1.5, ry);
    }
    k.add(plain("#6e5a35"), new THREE.CylinderGeometry(0.55, 0.75, 0.9, 10, 1, true), 0, top - 1.8, tz, 0);   // the bell
    lathe(k, plain("#c48a33"), [[T0 + 0.3, 0], [T0 + 0.1, 0.4], [T0 - 0.6, 1.4], [1.4, 2.4], [0.9, 2.9], [0.5, 3.2], [0.2, 3.5], [0.001, 3.6]], 0, top + 0.5, tz, 4);
    k.cyl(white, 0, top + 4.1, tz, 0.2, 0.3, 8);
    k.add(white, new THREE.SphereGeometry(0.3, 8, 6), 0, top + 4.6, tz);
    k.cyl(iron, 0, top + 4.9, tz, 0.04, 1.4, 4);
    k.slab(iron, -0.05, 0.05, top + 5.7, top + 6.1, tz - 0.6, tz + 0.6, 1);
  }

  const grp = k.build();
  glow(grp, sash, 0, 0.8);
  return grp;
}
