// Bath Spa station, as a set piece (landmarks/setpieces.ts) in place of what the map tools build
// there: the two platform canopies came out of the data as solid blocks ten metres high standing on
// the platforms, and nothing led up to the platforms from the street. Brunel's station of 1840-41,
// up on its viaduct over the end of Manvers Street, as it stands now:
// - the Jacobean front on Dorchester Street, two storeys of Bath stone with shaped gables, the
//   station's forecourt and its glass canopy in front, and a lower wing to the east;
// - through the front door, the stairs straight up through the building to platform 2 (the city
//   side, for trains east to London and down the valley to Bradford-on-Avon and Westbury), with the
//   booking hall beside them;
// - platform 1 (trains west, to Bristol and Cardiff) across the tracks, its range of rooms at the
//   back, and its stairs up from the station's south side by the car park (the subway under the
//   tracks from the booking hall isn't here: go round under the railway by Railway Place);
// - the canopies on their columns, valanced, over both platforms, curving with the line, benches,
//   the green "Bath Spa" running-in boards, and fencing along the platforms' backs.
// The platforms themselves, their edges and the trains are the railway's (railway.ts): this stands
// round them at their level. The departure boards are the railway's too, written live.
//
// Its frame: x along the station building's front, to the west-south-west, z out of its front
// towards the forecourt, y up from the platforms' level (26.8 m, a step above the track, which
// tools/railway.py lays level through the station). Everything here is in that frame, worked out
// from the platforms, the canopies' outlines and the building in the map's data. Solid as it's drawn
// (landmarks/shape.ts). Nothing here goes over the network.
import * as THREE from "three";
import { Kit, stone, plain, sashGlass, glow, lettering, roundArch } from "./kit";
import * as TX from "../textures";

/** The forecourt's and booking hall's floor, and the floor at the foot of platform 1's stairs. */
export const STREET = -5.4, SOUTH = -4.9;
const ZF = 0, ZB = -7.5, X0 = -19, X1 = 19;          // the station building: its front and back, its ends
const EAVES = 4.4;
const SX0 = -4.4, SX1 = 1.9, STAIR0 = -1.5, STAIR1 = -10.4;   // platform 2's stairs: their sides, foot and head
const HX0 = 2.3, HX1 = 13, HZ0 = -7.1, HZ1 = -0.5;   // the booking hall
const RZ0 = -41.6, RZ1 = -36.2;                      // platform 1's back range: its back and its front
const PX0 = -22, PX1 = -2, PFOOT = -8.5, PHEAD = -19.3, PZ0 = -39.4;   // its stairs' slot, foot, head and outer side

// The platforms' edges in the frame, as polylines along x (tools/railway.py's platforms), and the
// canopies' (the map's outlines of them): front by the track, back by the building or the fence.
const P2_EDGE = [[80.1, -10.0], [58.4, -13.3], [14.7, -15.5], [-42.1, -15.9], [-71.0, -15.3], [-102.5, -12.5], [-118.1, -10.0]];
const P2_BACK = [[69.8, -2.0], [49.7, -3.4], [18.4, -6.4], [18.3, -9.2], [-4.2, -8.8], [-47.0, -9.6], [-71.2, -7.9], [-71.3, -4.1], [-110.8, 0.1], [-148.6, -1.7]];
const P2_ROOF_FRONT = [[70.8, -10.8], [56.0, -13.1], [15.2, -15.7], [-41.0, -16.1], [-69.8, -15.0], [-103.0, -11.5]];
const P2_ROOF_BACK = [[70.1, -2.1], [21.0, -6.0], [19.0, -7.5], [-42.5, -7.5], [-68.3, -6.4], [-101.9, -3.1]];
const P1_EDGE = [[64.7, -21.9], [29.1, -26.2], [-37.7, -28.2], [-70.5, -26.3], [-110.7, -20.5]];
const P1_BACK = [[59.0, -26.8], [39.1, -31.8], [21.6, -33.5], [-13.5, -34.0], [-18.9, -34.1], [-37.3, -34.5], [-55.4, -36.1], [-82.4, -33.3]];
const P1_ROOF_FRONT = [[37.5, -25.2], [29.1, -26.3], [-37.5, -28.0], [-70.4, -26.4], [-80.8, -25.4]];
const P1_ROOF_BACK = [[37.5, -32.0], [26.5, -33.3], [26.5, -36.2], [-28.1, -36.2], [-28.1, -34.6], [-37.3, -34.5], [-55.4, -36.1], [-80.8, -33.5]];

/** A polyline's z at x (its points running along x either way), held level past its ends. */
function along(line: number[][], x: number): number {
  const p = line[0][0] > line[line.length - 1][0] ? line : [...line].reverse();
  if (x >= p[0][0]) return p[0][1];
  for (let i = 1; i < p.length; i++) {
    const [ax, az] = p[i - 1], [bx, bz] = p[i];
    if (x >= bx) return bx === ax ? bz : az + ((bz - az) * (x - ax)) / (bx - ax);
  }
  return p[p.length - 1][1];
}

/** What the map tools built here, all of it hidden: the station, its canopies and platforms, and the track between. */
export const BATHSPA_OUTLINE: [number, number][] = [[26.7, -41.3], [-28.2, -42.2], [-28.7, -37.3], [-56.5, -37.1], [-57.3, -42.5], [-58.4, -43.0],
  [-59.0, -41.8], [-82.1, -39.2], [-82.1, -33.9], [-83.9, -29.5], [-129.4, -20.8], [-131.9, -23.4], [-139.8, -16.4], [-149.0, -14.2], [-149.2, -1.6],
  [-110.7, 0.7], [-71.0, -3.5], [-70.6, -5.6], [-43.0, -6.9], [-42.8, -2.1], [-35.0, 1.3], [-29.7, -2.9], [-27.0, -2.8], [-25.5, -2.1], [-26.9, 2.3],
  [-6.3, 11.4], [-1.0, 1.1], [18.3, 1.9], [21.0, -1.9], [21.5, -5.4], [69.8, -1.4], [71.1, -4.4], [73.0, -4.3], [72.0, -20.6], [65.2, -21.8],
  [65.8, -25.5], [63.7, -27.8], [61.3, -28.8], [58.9, -27.5], [39.3, -32.4], [40.0, -37.9], [26.9, -39.1]];

/** Solid all through (for spawning to keep out of): the buildings, not the platforms. */
export const BATHSPA_COVERS: [number, number, number, number][] = [[X0, X1, ZB, ZF], [-42.5, X0, ZB, -2.5], [-28.1, PX0, RZ0, RZ1], [PX1, 26.5, RZ0, RZ1]];

/** The ground it lowers: the lidar has the viaduct under the station rising and falling by more than
 *  the track does, up above the platforms at their east end, so it all comes down below the ballast
 *  (the track's at -0.93); and inside the building, and in the slot for platform 1's stairs, to their floors. */
export const BATHSPA_SINK = (() => {
  const out: { x0: number; x1: number; z0: number; z1: number; y: number }[] = [];
  for (let x = -150; x < 72; x += 8) {
    const z0 = Math.min(along(P1_BACK, x), along(P1_BACK, x + 8)), z1 = Math.max(along(P2_BACK, x), along(P2_BACK, x + 8));
    out.push({ x0: x, x1: x + 8, z0, z1, y: -1.23 });
  }
  // The ground inside the building and in platform 1's stair slot comes down well clear of the
  // floors that stand on it (0.35 m, not a whisker): a ground a few centimetres under a floor is
  // within the depth buffer's own resolution at any distance, and the two speckle over each other
  // where you walk in the booking hall and at the foot of the stairs.
  out.push({ x0: X0, x1: X1, z0: ZB, z1: ZF, y: STREET - 0.35 }, { x0: PX0, x1: PX1, z0: RZ0, z1: RZ1, y: SOUTH - 0.35 });
  return out;
})();

/** GWR's fencing: green palisade, see-through. */
function palisade(): THREE.MeshLambertMaterial {
  const [c, g] = TX.canvas(64, 64);
  g.clearRect(0, 0, 64, 64);
  g.fillStyle = "#24392f";
  for (let x = 2; x < 64; x += 16) { g.fillRect(x, 6, 7, 58); g.beginPath(); g.moveTo(x, 6); g.lineTo(x + 3.5, 0); g.lineTo(x + 7, 6); g.fill(); }
  g.fillRect(0, 16, 64, 4); g.fillRect(0, 50, 64, 4);
  const t = TX.tex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return new THREE.MeshLambertMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide });
}

/** The canopies' valancing: cream boards cut to points along the bottom. */
function valance(): THREE.MeshLambertMaterial {
  const [c, g] = TX.canvas(64, 32);
  g.clearRect(0, 0, 64, 32);
  g.fillStyle = "#ece3cb";
  for (let x = 0; x < 64; x += 8) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 8, 0); g.lineTo(x + 8, 22); g.lineTo(x + 4, 32); g.lineTo(x, 22); g.fill(); }
  const t = TX.tex(c);
  t.wrapS = THREE.RepeatWrapping;
  return new THREE.MeshLambertMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide });
}

/** A shaped (Dutch) gable's outline, w wide at its foot, h high, its foot's middle at the origin. */
function gable(w: number, h: number): THREE.Shape {
  const s = new THREE.Shape(), a = w / 2, b = w * 0.22;
  s.moveTo(-a, 0); s.lineTo(-a, h * 0.25);
  s.quadraticCurveTo(-a, h * 0.5, -b * 1.6, h * 0.55);
  s.quadraticCurveTo(-b * 0.9, h * 0.62, -b, h * 0.85);
  s.lineTo(-b, h * 0.9); s.lineTo(0, h); s.lineTo(b, h * 0.9); s.lineTo(b, h * 0.85);
  s.quadraticCurveTo(b * 0.9, h * 0.62, b * 1.6, h * 0.55);
  s.quadraticCurveTo(a, h * 0.5, a, h * 0.25);
  s.lineTo(a, 0); s.closePath();
  return s;
}

export function bathSpa(): THREE.Object3D {
  const k = new Kit();
  const S = stone("#e6d3a6"), S2 = stone("#cdb88d"), sash = sashGlass(), slate = plain("#5d6268");
  const paving = plain("#b9b1a3"), iron = plain("#2c4136"), cream = plain("#ece3cb"), roofTop = plain("#54595f", { side: THREE.DoubleSide }), under = plain("#ddd5c2", { side: THREE.DoubleSide });
  const glass = plain("#9fb4bb", { transparent: true, opacity: 0.55 }), dark = plain("#2b2724"), steel = plain("#7c8186");
  const lamp = plain("#f2ead2", { emissive: "#fff1cc", emissiveIntensity: 0 });
  const door = plain("#3b2f28"), gwr = "#0b4a3c";
  const fence = palisade(), fringe = valance();
  const lamps: number[] = [];   // where the canopy lamps hang, to light the platforms after dark (world.ts)

  // ---- the station building on Dorchester Street ---------------------------------------------------
  // its front: Bath stone with round-arched doors, to the stairs and to the booking hall
  {
    const front = new THREE.Shape();
    front.moveTo(X0, STREET - 1); front.lineTo(X1, STREET - 1); front.lineTo(X1, EAVES); front.lineTo(X0, EAVES); front.closePath();
    const arch = (x0: number, x1: number, spring: number) => {
      const h = new THREE.Path(), w = x1 - x0;
      h.moveTo(x0, STREET); h.lineTo(x0, spring); roundArch(h, (x0 + x1) / 2, spring, w, w / 2); h.lineTo(x1, STREET); h.closePath();
      front.holes.push(h);
    };
    arch(SX0 + 0.9, SX1 - 0.6, STREET + 2.6);
    arch(6.5, 9.5, STREET + 2.3);
    k.shape(S, front, 0.5, 0, 0, ZF - 0.25, 0, 3);
  }
  // behind the front: the east end solid; the stair hall open to the roof; the booking hall, with
  // the platform-level rooms over it; the west end solid
  k.slab(S, X0, SX0, STREET - 1, EAVES, ZB, ZF - 0.5);
  k.slab(S, HX1, X1, STREET - 1, EAVES, ZB, ZF - 0.5);
  k.slab(S, SX1, HX1, -0.4, EAVES, ZB, ZF - 0.5);
  k.slab(S, SX1, HX1, STREET - 1, -0.4, ZB, HZ0);                                      // the hall's back wall
  k.slab(S, SX1, HX0, STREET - 1, -0.4, HZ0, -2.0);                                    // its side, by the stairs
  k.slab(S, SX1, HX0, STREET + 2.6, -0.4, -2.0, HZ1);                                  // over the door to the stairs
  k.slab(paving, HX0, HX1, STREET - 1, STREET, HZ0, HZ1, 2);
  // the booking hall: the ticket office along its west wall, ticket machines by the door
  k.quad(lettering("TICKETS", { w: 256, h: 64, bg: gwr, ink: "#ffffff", font: "bold 40px Arial, sans-serif" }), HX1 - 0.02, STREET + 3.4, -3.8, 2.4, 0.6, -Math.PI / 2);
  for (const z of [-2.6, -3.8, -5.0]) k.quad(sash, HX1 - 0.02, STREET + 1.9, z, 1.0, 1.2, -Math.PI / 2);
  k.slab(S2, HX1 - 0.6, HX1, STREET, STREET + 1.1, HZ0 + 0.3, HZ1 - 0.3, 1);          // the counter
  for (const x of [4.0, 5.2]) k.box(dark, x, STREET, -6.6, 0.7, 1.7, 0.5);
  // the stairs up to platform 2, straight through the building and out under the canopy
  const STEPS = 31, rise = -STREET / STEPS, going = (STAIR0 - STAIR1) / STEPS;
  k.slab(paving, SX0, SX1, STREET - 1, STREET, STAIR0, ZF - 0.5, 2);
  for (let i = 1; i <= STEPS; i++) k.slab(S2, SX0, SX1, STREET - 1, STREET + i * rise, STAIR0 - i * going, STAIR0 - (i - 1) * going, 1);
  // The stair hall's roof sits just inside the hall's own walls and stops a course short of their
  // tops, and the lintel stops a course below the roof: no two of these ceiling pieces share a
  // plane, or they fight over the depth and the ceiling flickers.
  k.slab(slate, SX0 + 0.05, SX1 - 0.05, EAVES - 0.3, EAVES - 0.15, ZB, ZF - 0.4);       // the stair hall's roof
  k.slab(S, SX0, SX1, 3.0, EAVES - 0.45, ZB, ZB + 0.3);                                // the lintel over its way out
  // the low walls either side of the stairs as they come up through the platform
  for (const x of [SX0, SX1]) k.slab(S2, x - 0.12, x + 0.12, 0, 1.0, STAIR1, ZB);
  k.quad(lettering("PLATFORM 2", { w: 256, h: 48, bg: gwr, ink: "#ffffff", font: "bold 30px Arial, sans-serif" }), (SX0 + SX1) / 2, 2.4, ZB + 0.31, 2.4, 0.45, 0);
  k.quad(lettering("WAY OUT", { w: 256, h: 48, bg: gwr, ink: "#ffffff", font: "bold 30px Arial, sans-serif" }), (SX0 + SX1) / 2, 2.6, ZB - 0.01, 2.0, 0.4, Math.PI);
  // the roof, a parapet along the front, and the three shaped gables over it, the middle one over the door
  k.roof(slate, X0, X1, EAVES, ZB, ZF - 0.5, 2.3);
  // the parapet stands a course proud of the walls it caps: level with them, its top face and theirs
  // are one plane, and the whole ceiling fights over the depth (seen in the booking hall and over
  // the stairs). It is the same stone, so the extra 15 cm reads as a course, not a mistake.
  k.slab(S2, X0 - 0.2, X1 + 0.2, EAVES - 0.25, EAVES + 0.15, ZB - 0.2, ZF + 0.1, 1.5);
  k.slab(S, X0, X1, EAVES, EAVES + 0.6, ZF - 0.5, ZF);
  for (const [x, w, h] of [[(SX0 + SX1) / 2, 7.5, 3.6], [-13, 5.6, 2.9], [12, 5.6, 2.9]]) {
    k.shape(S, gable(w, h), 0.5, x, EAVES, ZF - 0.25, 0, 3);
    k.quad(sash, x, EAVES + h * 0.38, ZF + 0.01, 1.2, 1.3);
  }
  for (const x of [-16.5, -8.5, 7.5, 16.5]) { k.slab(S2, x - 0.5, x + 0.5, EAVES, EAVES + 3.4, ZB + 2.6, ZB + 3.6); k.slab(S2, x - 0.6, x + 0.6, EAVES + 3.4, EAVES + 3.6, ZB + 2.5, ZB + 3.7); }
  // its windows: tall ones to the street, the first floor at the platforms' level, and on the
  // platform side the doors and windows of the rooms there
  for (const x of [-17, -14.5, -12, -9.5, -7, 3.8, 11, 14, 16.8]) k.quad(sash, x, STREET + 2.4, ZF + 0.01, 1.1, 2.4);
  for (const x of [-17, -14.5, -12, -9.5, -7, 4, 6.5, 9, 11.5, 14, 16.8]) k.quad(sash, x, 1.8, ZF + 0.01, 1.1, 1.9);
  k.slab(S2, X0, X1, -0.15, 0.15, ZF, ZF + 0.12, 1.5);                                  // a string course at the floor
  for (const x of [-16, -12.5, 6, 15.5]) k.quad(door, x, 1.2, ZB - 0.01, 1.3, 2.4, Math.PI);
  for (const x of [-14.2, -10.5, -7.5, 4, 8, 10.5, 13, 17.5]) k.quad(sash, x, 1.6, ZB - 0.01, 1.2, 1.7, Math.PI);
  k.quad(lettering("WAITING ROOM", { w: 256, h: 40, bg: gwr, ink: "#ffffff", font: "bold 26px Arial, sans-serif" }), -16, 2.75, ZB - 0.02, 1.7, 0.3, Math.PI);
  k.quad(lettering("CAFE", { w: 128, h: 40, bg: gwr, ink: "#ffffff", font: "bold 26px Arial, sans-serif" }), 6, 2.75, ZB - 0.02, 1.0, 0.3, Math.PI);
  k.quad(lettering("TOILETS", { w: 192, h: 40, bg: gwr, ink: "#ffffff", font: "bold 26px Arial, sans-serif" }), 15.5, 2.75, ZB - 0.02, 1.3, 0.3, Math.PI);

  // ---- the east wing, with its pavilion on the forecourt --------------------------------------------
  k.slab(S, -42.5, X0, STREET - 1, 3.8, ZB, -2.5);
  k.slab(S2, -42.7, X0, 3.8, 4.3, ZB - 0.1, -2.3, 1.5);
  k.slab(S, -35.3, -29.7, STREET - 1, 4.0, -2.5, 1.0);
  k.shape(S, gable(5.6, 2.4), 0.4, -32.5, 4.0, 0.8, 0, 3);
  k.quad(sash, -32.5, 5.0, 1.01, 1.0, 1.0);
  for (const x of [-40.5, -37.5, -27, -24, -21]) { k.quad(sash, x, STREET + 2.3, -2.49, 1.1, 2.2); k.quad(sash, x, 1.6, -2.49, 1.1, 1.7); }
  for (const x of [-33.8, -31.2]) { k.quad(sash, x, STREET + 2.3, 1.01, 1.0, 2.2); k.quad(sash, x, 1.6, 1.01, 1.0, 1.7); }
  for (const x of [-40, -33, -26, -21.5]) k.quad(sash, x, 1.5, ZB - 0.01, 1.2, 1.6, Math.PI);
  // the forecourt's glass canopy, in front of the wing (the map's outline of it runs east and west)
  {
    const cx = -15.4, cz = 4.2, ry = -0.41, l = 22.3, w = 4.8, top = -0.2;
    k.box(glass, cx, top - 0.15, cz, l, 0.12, w, ry, 0);
    const c = Math.cos(ry), s = Math.sin(ry);
    for (const [u, v] of [[-l / 2 + 0.4, w / 2 - 0.3], [l / 2 - 0.4, w / 2 - 0.3], [0, w / 2 - 0.3]]) k.cyl(steel, cx + u * c + v * s, STREET, cz - u * s + v * c, 0.1, top - 0.15 - STREET, 8);
    k.box(steel, cx + (w / 2) * s, top - 0.65, cz + (w / 2) * c, l, 0.5, 0.1, ry, 0);
    k.add(lettering("BATH SPA STATION", { w: 512, h: 48, bg: gwr, ink: "#ffffff", font: "bold 32px Arial, sans-serif" }),
      new THREE.PlaneGeometry(9, 0.42), cx + (w / 2 + 0.06) * s, top - 0.65, cz + (w / 2 + 0.06) * c, ry);
  }

  // ---- the floors along the platforms' backs: the platforms stop short of the building, and of the
  //      back range across the tracks; solid down to the street, with platform 1's stair slot
  k.slab(paving, -47, SX0, STREET - 1.6, 0, -9.7, ZB, 2);
  k.slab(paving, SX1, 18.4, STREET - 1, 0, -9.4, ZB, 2);
  k.slab(paving, -28.1, 26.5, SOUTH - 1.5, 0, RZ1, -33.4, 2);
  // the strip across the back of platform 1's range runs into the floor above: it stops a course
  // below it, rather than level with it, or the two share a plane and the floor fights there
  k.slab(paving, -19.2, -13.4, -1, -0.15, -34.2, -31.4, 2);

  // ---- platform 1's back range, and the stairs up to the platform through it -----------------------
  for (const [x0, x1] of [[-28.1, PX0], [PX1, 26.5]]) {
    k.slab(S, x0, x1, SOUTH - 2.5, 3.8, RZ0, RZ1);
    k.slab(S2, x0 - 0.1, x1 + 0.1, 3.8, 4.1, RZ0 - 0.1, RZ1 + 0.1, 1.5);
  }
  for (const x of [-26, -23.5, 0, 4, 9.5, 15, 20.5, 24.5]) k.quad(sash, x, SOUTH + 2.3, RZ0 - 0.01, 1.1, 2.0, Math.PI);
  for (const x of [1.5, 7.5, 18]) k.quad(door, x, 1.2, RZ1 + 0.01, 1.3, 2.4);
  for (const x of [-26.5, -24, 4.5, 10.5, 13, 21, 24]) k.quad(sash, x, 1.6, RZ1 + 0.01, 1.2, 1.7);
  k.quad(lettering("CAFE", { w: 128, h: 40, bg: gwr, ink: "#ffffff", font: "bold 26px Arial, sans-serif" }), 7.5, 2.75, RZ1 + 0.02, 1.0, 0.3);
  k.quad(lettering("TOILETS", { w: 192, h: 40, bg: gwr, ink: "#ffffff", font: "bold 26px Arial, sans-serif" }), 18, 2.75, RZ1 + 0.02, 1.3, 0.3);
  // the slot: open to the south side at its floor, the stairs climbing east along its north side
  const UP = 28, r1 = -SOUTH / UP, g1 = (PFOOT - PHEAD) / UP;
  // Everything in the slot is built down to one level, SLOT_FLOOR, and the step above it is 5 cm
  // proud of it: two pieces that stop at the same level have their undersides in one plane, and
  // the foot of the stairs fights over the depth where you stand looking at it.
  const SLOT_FLOOR = SOUTH - 1.15;
  k.slab(paving, PX0, PX1, SLOT_FLOOR, SOUTH, RZ0, RZ1, 2);
  for (let i = 1; i <= UP; i++) {
    const xa = PFOOT - i * g1, xb = PFOOT - (i - 1) * g1, top = SOUTH + i * r1;
    k.slab(S2, xa, xb, SLOT_FLOOR + 0.05, top, PZ0, RZ1, 1);
    if (top > SOUTH + 0.6) k.slab(S2, xa, xb, SOUTH, top + 0.95, PZ0 - 0.2, PZ0, 1);        // the stone side, rising with them
  }
  k.slab(S2, PX0, PHEAD, SLOT_FLOOR, 0, PZ0, RZ1, 1);                                   // the landing at the top
  k.slab(S2, PX0, PHEAD, SOUTH, 0.95, PZ0 - 0.2, PZ0, 1);
  k.slab(S2, PHEAD, PX1, 0, 1.0, RZ1, RZ1 + 0.2, 1);                                    // the rail over them along the platform
  k.slab(slate, PX0 - 0.1, PX1 + 0.1, 3.4, 3.8, RZ0, RZ1);
  k.quad(lettering("PLATFORM 1", { w: 256, h: 48, bg: gwr, ink: "#ffffff", font: "bold 30px Arial, sans-serif" }), (PX0 + PX1) / 2, 2.6, RZ0 - 0.01, 2.4, 0.45, Math.PI);

  // ---- the canopies, curving with the platforms: a roof on columns along the back, valanced along
  //      the front, lamps under it
  const canopy = (x0: number, x1: number, front: (x: number) => number, back: (x: number) => number, base: (x: number) => number,
    under0: number, ridge: number, skip: (x: number) => boolean) => {
    const pos: number[] = [], top: number[] = [];
    const tri = (to: number[], a: number[], b: number[], c: number[]) => to.push(...a, ...b, ...c);
    const quad = (to: number[], a: number[], b: number[], c: number[], d: number[]) => { tri(to, a, b, c); tri(to, a, c, d); };
    const n = Math.ceil((x0 - x1) / 6), sec: number[] = [];
    for (let i = 0; i <= n; i++) sec.push(x0 - ((x0 - x1) * i) / n);
    for (let i = 0; i < n; i++) {
      const a = sec[i], b = sec[i + 1], fa = front(a), fb = front(b), ba = back(a), bb = back(b);
      const ma = (fa + ba) / 2, mb = (fb + bb) / 2;
      // underneath, then the top: one slope (P2's) or two to a ridge along the middle (P1's)
      quad(pos, [a, under0, fa], [b, under0, fb], [b, under0, bb], [a, under0, ba]);
      if (ridge <= under0 + 0.4) quad(top, [a, under0 + 0.3, fa], [a, under0 + 0.3, ba], [b, under0 + 0.3, bb], [b, under0 + 0.3, fb]);
      else {
        quad(top, [a, under0 + 0.3, fa], [a, ridge, ma], [b, ridge, mb], [b, under0 + 0.3, fb]);
        quad(top, [a, ridge, ma], [a, under0 + 0.3, ba], [b, under0 + 0.3, bb], [b, ridge, mb]);
      }
      // the fascia along the front, and the valancing under it
      const len = Math.hypot(b - a, fb - fa), ang = Math.atan2(-(fb - fa), b - a);
      k.add(cream, new THREE.BoxGeometry(len, 0.3, 0.06), (a + b) / 2, under0 + 0.15, (fa + fb) / 2, ang, 0);
      k.add(fringe, new THREE.PlaneGeometry(len, 0.5), (a + b) / 2, under0 - 0.25, (fa + fb) / 2, ang, 0);
    }
    for (const [list, mat] of [[pos, under], [top, roofTop]] as [number[], THREE.Material][]) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(list, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(new Array((list.length / 3) * 2).fill(0), 2));
      g.computeVertexNormals();
      k.add(mat, g);
    }
    // columns every other section, on the platform behind its middle, with brackets out to the front
    for (let i = 0; i <= n; i++) {
      const x = sec[i], zc = base(x), f = front(x);
      if (i % 2 || skip(x)) continue;
      k.cyl(iron, x, 0, zc, 0.11, under0, 8);
      k.cyl(iron, x, 0, zc, 0.2, 0.5, 8);
      k.beam(iron, [x, under0 - 0.9, zc], [x, under0 - 0.05, zc + (f - zc) * 0.55], 0.08, 0.14, 1);
      k.beam(iron, [x, under0 - 0.9, zc], [x, under0 - 0.05, zc + (back(x) - zc) * 0.55], 0.08, 0.14, 1);
      k.box(lamp, x, under0 - 0.25, zc + (f - zc) * 0.4, 0.5, 0.12, 0.25);
      lamps.push(x, under0 - 0.4, zc + (f - zc) * 0.4);
    }
  };
  // platform 2's, from the west end past the building to the east end; none in the way of the stairs
  // or of the departure board (railway.ts stands it halfway across, where a train's middle stops: x 4.8)
  canopy(70, -102, (x) => Math.max(along(P2_ROOF_FRONT, x), along(P2_EDGE, x) + 0.15), (x) => along(P2_ROOF_BACK, x),
    (x) => along(P2_BACK, x) - 1.6, 3.5, 3.5, (x) => (x > SX0 - 1.2 && x < SX1 + 1.2) || Math.abs(x - 4.8) < 1.6);
  // platform 1's, higher, glazed to a ridge, over the back range
  canopy(37.5, -80.8, (x) => Math.min(along(P1_ROOF_FRONT, x), along(P1_EDGE, x) - 0.15), (x) => along(P1_ROOF_BACK, x),
    (x) => along(P1_BACK, x) + 1.6, 4.0, 5.2, () => false);

  // ---- along the platforms: benches, the running-in boards, and fencing along the backs ------------
  const bench = (x: number, z: number, face: number) => {
    const c = Math.cos(face), s = Math.sin(face), at = (u: number, v: number): [number, number] => [x + u * c + v * s, z - u * s + v * c];
    for (const u of [-0.75, 0.75]) { const [px, pz] = at(u, 0); k.box(iron, px, 0, pz, 0.08, 0.45, 0.45, face, 0); }
    k.box(door, x, 0.42, z, 1.8, 0.06, 0.45, face, 0);
    const [bx, bz] = at(0, -0.22);
    k.box(door, bx, 0.5, bz, 1.8, 0.4, 0.05, face, 0);
  };
  for (const x of [45.5, 27.5, 9.5, -17.5, -30.5, -62.5, -80.5]) bench(x, Math.max(along(P2_BACK, x), ZB - 2) - 0.7, Math.PI);
  for (const x of [31.5, 8, -4.5, -40.5, -63]) bench(x, along(P1_BACK, x) + 0.7, 0);
  const runIn = (x: number, z: number, face: number) => {
    const c = Math.cos(face), s = Math.sin(face);
    for (const u of [-1.7, 1.7]) k.cyl(iron, x + u * c, 0, z - u * s, 0.06, 2.3, 6);
    k.box(iron, x, 1.45, z, 3.8, 0.8, 0.08, face, 0);
    k.add(lettering("Bath Spa", { w: 512, h: 96, bg: gwr, ink: "#ffffff", font: "bold 62px Arial, sans-serif" }),
      new THREE.PlaneGeometry(3.6, 0.68), x + 0.05 * s, 1.85, z + 0.05 * c, face);
  };
  runIn(42, along(P2_BACK, 42) - 0.9, Math.PI); runIn(-90, along(P2_BACK, -90) - 0.9, Math.PI);
  runIn(32, along(P1_BACK, 32) + 0.9, 0); runIn(-72, along(P1_BACK, -72) + 0.9, 0);
  const fenceAlong = (line: number[][], x0: number, x1: number, out: number) => {
    for (let x = x0; x > x1 + 0.01; x -= 3) {
      const xb = Math.max(x1, x - 3), za = along(line, x) + out, zb = along(line, xb) + out;
      k.beam(fence, [x, 0.8, za], [xb, 0.8, zb], 0.04, 1.6, 1.6);
    }
  };
  fenceAlong(P2_BACK, 49.7, 18.6, 0.1); fenceAlong(P2_BACK, -47.2, -148, 0.1);
  fenceAlong(P1_BACK, 59, 26.6, -0.1); fenceAlong(P1_BACK, -28.3, -82, -0.1);
  // a stone wall under platform 2's west end, down to Brunel Square
  for (let x = 49.7; x > 18.5; x -= 3) {
    const xb = Math.max(18.4, x - 3), za = along(P2_BACK, x) + 0.3, zb = along(P2_BACK, xb) + 0.3;
    k.beam(S, [x, STREET / 2 - 0.5, za], [xb, STREET / 2 - 0.5, zb], 0.6, -STREET + 1, 3);
  }

  const grp = k.build();
  glow(grp, sash, 0, 0.8);
  glow(grp, lamp, 0, 1.2);
  grp.userData.lamps = lamps;
  return grp;
}
