// The V&A Waterfront's landmarks, as set pieces (landmarks/setpieces.ts) in place of the plain
// blocks the map tools build there, on Cape Town's map:
// - The Clock Tower, the port captain's office of 1882 at the mouth of the Alfred Basin by the
//   swing bridge: an octagonal Victorian Gothic tower painted red with white trim, three storeys of
//   pointed windows, clocks in gablets on four sides and a steep slate spire with a weathervane.
// - The Cape Wheel by the Victoria Wharf: a 40 m observation wheel on splayed white legs, thirty
//   enclosed gondolas, turning slowly. Its rim, spokes and gondolas go round (one turn every ten
//   minutes, from the clock, so everyone sees it at the same place) and you can't stand on them;
//   the legs, the hub and the boarding deck are solid.
// - Zeitz MOCAA in the Grain Silo of 1924: the tall concrete elevator tower, the Silo Hotel's six
//   floors of bulging, faceted "pillowed" windows at its top under a glass lantern, and the lower
//   bins beside it, their walls the curves of the concrete tubes inside, cut open at the foot for
//   the museum's entrance on Silo Square.
// Each stands on the quay at the ground the square's terrain has at its origin. Frames: x along
// each (its bearing), z out of its front, y up from the ground. Solid as they're drawn
// (landmarks/shape.ts). Nothing here goes over the network.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import * as TX from "../textures";
import { Kit, plain, glow, night } from "./kit";

const OCT = Math.PI / 8;
const TAU = Math.PI * 2;

// ---- the Clock Tower ------------------------------------------------------------------------------

const CA = 4.4;                         // the tower's walls, from its middle to the middle of a face
const CR = CA / Math.cos(OCT);          // and to a corner
const FACE = 2 * CA * Math.tan(OCT);    // a face's width
const C1 = 4.6, C2 = 8.4, CE = 12.6;    // the first floor, the second, the eaves
/** The outline of the Clock Tower, in its frame. */
export const CLOCK_TOWER: [number, number][] = [[-5.6, -5.6], [5.6, -5.6], [5.6, 5.6], [-5.6, 5.6]];

export function clockTower(): THREE.Object3D {
  const k = new Kit();
  const red = plain("#a8352c", { map: once("render", () => TX.wall("render", false)) }), white = plain("#f1ede4");
  const plinth = plain("#5f5b55"), slate = plain("#4a4f57"), iron = plain("#2b2b2b"), gold = plain("#c9a443");
  const win = archGlass(false), door = archGlass(true), dial = clockFace();
  const oct = (mat: THREE.Material, a: number, y0: number, y1: number, tile = 2) =>
    k.add(mat, new THREE.CylinderGeometry(a / Math.cos(OCT), a / Math.cos(OCT), y1 - y0, 8), 0, (y0 + y1) / 2, 0, OCT, tile);
  /** Something on face f (0 the front, counting round anticlockwise seen from above), at out from the middle. */
  const onFace = (f: number, out: number) => { const a = (f * Math.PI) / 4; return { x: Math.sin(a) * out, z: Math.cos(a) * out, ry: a }; };

  oct(plinth, CA + 0.15, -1, 0.9);
  oct(red, CA, 0.9, CE);
  for (const y of [C1, C2]) oct(white, CA + 0.12, y - 0.12, y + 0.18, 1);
  oct(white, CA + 0.3, CE - 0.35, CE, 1);
  oct(white, CA + 0.5, CE, CE + 0.3, 1);
  // a white pilaster up every corner
  for (let f = 0; f < 8; f++) {
    const a = (f * Math.PI) / 4 + OCT;
    k.box(white, Math.sin(a) * CR, 0.9, Math.cos(a) * CR, 0.45, CE - 1.25, 0.45, a, 1);
  }
  // windows: a door in front and at the back, pointed windows round the rest, paired on the first floor
  for (let f = 0; f < 8; f++) {
    const w = onFace(f, CA + 0.03), sill = onFace(f, CA + 0.1);
    if (f % 4 === 0) {
      k.quad(door, w.x, 2.25, w.z, 1.6, 2.7, w.ry);
    } else {
      k.quad(win, w.x, 2.7, w.z, 1.2, 2.3, w.ry);
      k.box(white, sill.x, 1.45, sill.z, 1.5, 0.12, 0.25, w.ry, 1);
    }
    for (const s of [-0.42, 0.42]) {
      const c = Math.cos(w.ry), sn = Math.sin(w.ry);
      k.quad(win, w.x + c * s, 6.4, w.z - sn * s, 0.62, 2.2, w.ry);
    }
    k.box(white, sill.x, C1 + 0.55, sill.z, 1.5, 0.12, 0.25, w.ry, 1);
    k.quad(win, w.x, 10.3, w.z, 1.15, 2.5, w.ry);
    k.box(white, sill.x, C2 + 0.6, sill.z, 1.4, 0.12, 0.25, w.ry, 1);
  }
  // the steps up to the doors
  k.add(plinth, new THREE.BoxGeometry(2.2, 0.9, 1.2), 0, -0.05, CA + 0.6, 0, 1);
  k.add(plinth, new THREE.BoxGeometry(2.2, 0.9, 1.2), 0, -0.05, -CA - 0.6, 0, 1);

  // the clock stage: a gablet on every other face, each with a clock
  for (let f = 0; f < 8; f += 2) {
    const g = new THREE.Shape();
    const hw = FACE / 2 - 0.15;
    g.moveTo(-hw, 0); g.lineTo(hw, 0); g.lineTo(hw, 2.2); g.lineTo(0, 3.9); g.lineTo(-hw, 2.2); g.closePath();
    const p = onFace(f, CA + 0.1);
    k.shape(red, g, 0.8, p.x, CE, p.z, p.ry, 2);
    // its white coping
    const cope = new THREE.Shape();
    cope.moveTo(-hw - 0.15, 2.05); cope.lineTo(0, 3.85); cope.lineTo(hw + 0.15, 2.05); cope.lineTo(hw + 0.15, 2.4); cope.lineTo(0, 4.2); cope.lineTo(-hw - 0.15, 2.4); cope.closePath();
    const q = onFace(f, CA + 0.15);
    k.shape(white, cope, 0.95, q.x, CE, q.z, q.ry, 1);
    const d = onFace(f, CA + 0.52);
    k.quad(dial, d.x, CE + 1.75, d.z, 2.1, 2.1, d.ry);
    // and a little pinnacle on its point
    const t = onFace(f, CA + 0.1);
    k.cyl(white, t.x, CE + 4.1, t.z, 0.12, 0.9, 6, 0);
  }
  // the spire, the finial and the weathervane
  k.add(slate, new THREE.CylinderGeometry(0, CR + 0.35, 8.4, 8), 0, CE + 0.3 + 4.2, 0, OCT, 2);
  k.add(slate, new THREE.CylinderGeometry(CR - 0.4, CR + 0.55, 0.6, 8), 0, CE + 0.6, 0, OCT, 2);
  k.cyl(iron, 0, CE + 8.5, 0, 0.09, 1.9, 6);
  k.add(gold, new THREE.SphereGeometry(0.22, 8, 6), 0, CE + 9.2, 0);
  k.box(iron, 0.15, CE + 9.9, 0, 1.3, 0.06, 0.05);
  k.add(iron, new THREE.ConeGeometry(0.16, 0.35, 4).rotateZ(-Math.PI / 2), 0.9, CE + 9.93, 0);
  k.box(iron, -0.6, CE + 9.75, 0, 0.05, 0.4, 0.35);
  for (const [dx, dz] of [[0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]]) k.box(iron, dx / 2, CE + 9.55, dz / 2, Math.abs(dx) + 0.04, 0.04, Math.abs(dz) + 0.04);

  const grp = k.build();
  for (const m of [win, door]) glow(grp, m, 0, 0.8);
  glow(grp, dial, 0.05, 0.9);
  return grp;
}

// ---- the Cape Wheel -------------------------------------------------------------------------------

const HUB = 22.8;      // the axle's height
const RIM = 18.2;      // the rim's radius
const PIVOT = 18.9;    // where the gondolas hang from
const CARS = 30;
const DECK = 0.6;      // the boarding deck's floor
const TURN = 600;      // seconds to a turn
/** The outline of the Cape Wheel's base, in its frame. */
export const CAPE_WHEEL: [number, number][] = [[-12, -8.6], [12, -8.6], [12, 8.6], [-12, 8.6]];

export function capeWheel(): THREE.Object3D {
  const k = new Kit();
  const steel = plain("#eef0f2"), grey = plain("#8d949b"), deck = plain("#6f6a63"), rail = plain("#c9ced3");
  const booth = plain("#1f3a5c"), boothGlass = plain("#2d4150", { emissive: "#ffe0b0", emissiveIntensity: 0 });
  const sign = signMat("CAPE WHEEL");

  // the legs: two splayed A-frames, one each side of the wheel, up to the axle's ends
  for (const s of [-1, 1]) {
    for (const lx of [-10.4, 10.4]) {
      k.beam(steel, [lx, 0, s * 6.8], [lx * 0.06, HUB, s * 2.3], 0.75, 0.75, 2);
      k.box(grey, lx, -0.5, s * 6.8, 1.6, 0.9, 1.6, 0, 1);
    }
    k.beam(steel, [-6.5, 8.2, s * 5.6], [6.5, 8.2, s * 5.6], 0.4, 0.4, 2);
    k.beam(steel, [-4.4, 11.8, s * 4.9], [4.4, 11.8, s * 4.9], 0.35, 0.35, 2);
  }
  k.add(grey, new THREE.CylinderGeometry(0.7, 0.7, 5.4, 12).rotateX(Math.PI / 2), 0, HUB, 0);
  // the boarding deck, its ramp and rails, the ticket booth and the sign over it
  k.slab(deck, -6, 6, -1, DECK, -4.2, 4.2, 2);
  k.slab(deck, 6, 11, -1, 0.3, -2, 2, 2);
  for (let i = 0; i < 2; i++) k.slab(deck, 6 + i * 0.6, 6.6 + i * 0.6, 0.3, DECK - 0.15 * i, -2, 2, 1);
  for (const z of [-4.1, 4.1]) {
    k.slab(rail, -6, 6, DECK + 1.0, DECK + 1.08, z - 0.04, z + 0.04, 1);
    for (let x = -6; x <= 6; x += 1.5) k.slab(rail, x - 0.04, x + 0.04, DECK, DECK + 1.0, z - 0.04, z + 0.04, 1);
  }
  k.slab(booth, -11, -7, -1, 3.0, 3.5, 7.5, 2);
  k.slab(steel, -11.3, -6.7, 3.0, 3.3, 3.2, 7.8, 1);
  k.quad(boothGlass, -9, 1.6, 7.52, 3.2, 1.6);
  k.quad(sign, -9, 3.9, 7.52, 4.6, 0.95);
  k.slab(steel, -11.3, -6.7, 3.3, 4.4, 7.4, 7.5, 1);

  const grp = k.build();
  glow(grp, boothGlass, 0, 0.8);

  // what turns: a group about the axle (along z), drawn but not stood on (ghost)
  const turning = new THREE.Group();
  turning.position.set(0, HUB, 0);
  turning.userData.moves = true;
  const w = new Kit();
  const rimMat = plain("#f6f7f8", { emissive: "#ff5ab4", emissiveIntensity: 0 }), cable = plain("#c3c8cd");
  rimMat.userData.ghost = cable.userData.ghost = true;
  for (const z of [-1.1, 1.1]) w.add(rimMat, new THREE.TorusGeometry(RIM, 0.3, 6, 90), 0, 0, z);
  w.add(rimMat, new THREE.TorusGeometry(RIM - 1.3, 0.18, 5, 90), 0, 0, 0);
  w.add(rimMat, new THREE.CylinderGeometry(1.0, 1.0, 4.8, 14).rotateX(Math.PI / 2), 0, 0, 0);
  for (let i = 0; i < CARS; i++) {
    const a = (i / CARS) * TAU, c = Math.cos(a), s = Math.sin(a);
    // the rim's cross-bracing, and the cables out to it from both ends of the hub, crossed
    w.beam(rimMat, [c * RIM, s * RIM, -1.1], [c * RIM, s * RIM, 1.1], 0.22, 0.22, 1);
    w.beam(rimMat, [c * RIM, s * RIM, -1.1], [Math.cos(a + TAU / CARS) * (RIM - 1.3), Math.sin(a + TAU / CARS) * (RIM - 1.3), 0], 0.15, 0.15, 1);
    w.beam(rimMat, [c * RIM, s * RIM, 1.1], [Math.cos(a + TAU / CARS) * (RIM - 1.3), Math.sin(a + TAU / CARS) * (RIM - 1.3), 0], 0.15, 0.15, 1);
    w.beam(rimMat, [c * RIM, s * RIM, 0], [c * PIVOT, s * PIVOT, 0], 0.18, 0.18, 1);
    const b = a + (i % 2 ? 0.35 : -0.35);
    w.beam(cable, [Math.cos(b) * 0.9, Math.sin(b) * 0.9, -2.3], [c * RIM, s * RIM, -1.1], 0.07, 0.07, 1);
    w.beam(cable, [Math.cos(b) * 0.9, Math.sin(b) * 0.9, 2.3], [c * RIM, s * RIM, 1.1], 0.07, 0.07, 1);
  }
  const wheel = w.build();
  glow(wheel, rimMat, 0, 0.55);
  turning.add(wheel);
  grp.add(turning);

  // the gondolas: instanced, hanging level from their pivots as the wheel turns
  const body = plain("#f4f5f6"), pane = plain("#3c5a6e", { emissive: "#ffe6c0", emissiveIntensity: 0 });
  body.userData.ghost = pane.userData.ghost = true;
  const cars = [new THREE.InstancedMesh(gondola(false), body, CARS), new THREE.InstancedMesh(gondola(true), pane, CARS)];
  const m = new THREE.Matrix4();
  const place = (t: number) => {
    const turn = (t / TURN) * TAU;
    for (let i = 0; i < CARS; i++) {
      const a = (i / CARS) * TAU + turn;
      m.makeTranslation(Math.cos(a) * PIVOT, HUB + Math.sin(a) * PIVOT, 0);
      for (const c of cars) c.setMatrixAt(i, m);
    }
    for (const c of cars) c.instanceMatrix.needsUpdate = true;
  };
  place(0);
  for (const c of cars) {
    c.computeBoundingSphere();
    grp.add(c);
  }
  cars[1].onBeforeRender = () => {
    const t = (Date.now() / 1000) % TURN;
    turning.rotation.z = (t / TURN) * TAU;
    place(t);
    pane.emissiveIntensity = 0.75 * night();
  };
  return grp;
}

/** A gondola hanging from its pivot (at the origin): a white cabin with a domed roof, glazed all
 *  round (pane: just the glass). */
function gondola(pane: boolean): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const put = (g: THREE.BufferGeometry, x: number, y: number, z: number) => { g.translate(x, y, z); parts.push(g.index ? g.toNonIndexed() : g); };
  if (pane) {
    put(new THREE.CylinderGeometry(1.02, 0.95, 1.25, 10), 0, -1.55, 0);
  } else {
    put(new THREE.BoxGeometry(0.12, 0.5, 0.12), 0, -0.25, 0);
    put(new THREE.SphereGeometry(1.08, 10, 4, 0, TAU, 0, Math.PI / 2).scale(1, 0.45, 1), 0, -0.85, 0);
    put(new THREE.CylinderGeometry(1.08, 1.08, 0.08, 10), 0, -0.88, 0);
    put(new THREE.CylinderGeometry(1.0, 0.92, 0.75, 10), 0, -2.55, 0);
    put(new THREE.CylinderGeometry(0.92, 0.6, 0.25, 10), 0, -3.05, 0);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      put(new THREE.BoxGeometry(0.08, 1.3, 0.08), Math.cos(a) * 1.01, -1.55, Math.sin(a) * 1.01);
    }
  }
  for (const g of parts) for (const n of Object.keys(g.attributes)) if (n !== "position" && n !== "normal" && n !== "uv") g.deleteAttribute(n);
  return mergeGeometries(parts)!;
}

// ---- Zeitz MOCAA and the Silo Hotel ----------------------------------------------------------------

// The tower: x0..x1 by z0..z1, its top; the bins beside it, east, a little shallower
const TX0 = -30.5, TX1 = -13.1, TZ0 = -17.7, TZ1 = 19.0, TTOP = 57;
const BX1 = 30.8, BZ1 = 15.0, BTOP = 33.5, TUBE = 2.75;
const HOTEL = 35.0, STOREY = 3.4, FLOORS = 6;
const FOOT = 3;                         // how far its walls go on down, for the ground sloping away from the floor
/** The outline of the Grain Silo, in its frame (the map's footprint, a little wider). */
export const ZEITZ: [number, number][] = [[-31.3, -18.5], [31.6, -18.5], [31.6, 15.8], [-12.6, 15.8], [-12.6, 19.8], [-31.3, 19.8]];
/** The ground it lowers to its floor, inside its walls and the way in under the cut tubes. */
export const ZEITZ_SINK = [{ x0: TX0, x1: TX1, z0: TZ0, z1: TZ1, y: -0.05 }, { x0: TX1, x1: BX1, z0: TZ0, z1: BZ1, y: -0.05 }];

export function zeitz(): THREE.Object3D {
  const k = new Kit();
  const con = concrete("#dcd8d0"), con2 = concrete("#c4bfb5"), dark = plain("#22272b"), steel = plain("#3a3f44");
  const glass = plain("#7d97a3", { emissive: "#ffd9a0", emissiveIntensity: 0, flatShading: true });
  const lantern = plain("#7f9aa6", { emissive: "#fff1d0", emissiveIntensity: 0, flatShading: true });
  const sign = signMat("ZEITZ MOCAA", "#d9d4ca", "#1d1d1d");

  /** Lay something along a face: the face runs from (ax, az) to (bx, bz), looking out ry. */
  type Face = { ax: number; az: number; bx: number; bz: number; ry: number };
  const faces = (x0: number, x1: number, z0: number, z1: number): Face[] => [
    { ax: x0, az: z1, bx: x1, bz: z1, ry: 0 },
    { ax: x1, az: z1, bx: x1, bz: z0, ry: Math.PI / 2 },
    { ax: x1, az: z0, bx: x0, bz: z0, ry: Math.PI },
    { ax: x0, az: z0, bx: x0, bz: z1, ry: -Math.PI / 2 },
  ];
  const along = (f: Face, u: number, out: number): [number, number] => {
    const len = Math.hypot(f.bx - f.ax, f.bz - f.az), tx = (f.bx - f.ax) / len, tz = (f.bz - f.az) / len;
    return [f.ax + tx * u + Math.sin(f.ry) * out, f.az + tz * u + Math.cos(f.ry) * out];
  };
  const lenOf = (f: Face) => Math.hypot(f.bx - f.ax, f.bz - f.az);
  /** A pillowed window w by h, its middle at u along face f and y up: faceted panes bulging out in
   *  a dark steel grid. */
  const pillows = (mat: THREE.Material, f: Face, u: number, y: number, w: number, h: number, nx: number, ny: number, bulge: number) => {
    const [fx, fz] = along(f, u, 0.03);
    k.quad(steel, fx, y, fz, w + 0.3, h + 0.3, f.ry);
    const pw = w / nx, ph = h / ny;
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      const [px, pz] = along(f, u - w / 2 + pw * (i + 0.5), 0.06);
      k.add(mat, pillow(pw - 0.1, ph - 0.1, bulge), px, y - h / 2 + ph * (j + 0.5), pz, f.ry);
    }
  };

  // ---- the elevator tower ----
  k.slab(con, TX0, TX1, -FOOT, TTOP, TZ0, TZ1, 4);
  const tf = faces(TX0, TX1, TZ0, TZ1);
  for (const f of tf) {
    const L = lenOf(f), bays = Math.max(3, Math.round(L / 5.2)), pitch = L / bays;
    // the pilasters between the bays, up the tower's full height (down only to the bins' roof on their side)
    for (let b = 0; b <= bays; b++) {
      const [px, pz] = along(f, b * pitch, 0.25);
      const foot = f.ry === Math.PI / 2 ? BTOP : -FOOT;
      k.box(con2, px, foot, pz, 0.8, TTOP - 0.5 - foot, 0.5, f.ry, 3);
    }
    for (let b = 0; b < bays; b++) {
      const u = (b + 0.5) * pitch;
      // the hotel's six floors of pillowed windows
      for (let fl = 0; fl < FLOORS; fl++) pillows(glass, f, u, HOTEL + STOREY * (fl + 0.5), pitch - 1.3, STOREY - 0.55, 3, 2, 0.5);
      // below them, the old working floors: narrow slits, and the gallery's band
      if (f.ry !== Math.PI / 2) for (let y = 10; y < HOTEL - 3; y += 6.5) {
        const [sx, sz] = along(f, u, 0.03);
        k.quad(dark, sx, y, sz, 0.7, 1.8, f.ry);
      }
    }
    // the bands of concrete between the hotel's floors, and the cornice
    for (let fl = 0; fl <= FLOORS; fl++) {
      const [a0, a1] = [along(f, 0, 0.3), along(f, L, 0.3)];
      const y = HOTEL + STOREY * fl - 0.25;
      k.slab(con2, Math.min(a0[0], a1[0]) - 0.3, Math.max(a0[0], a1[0]) + 0.3, y, y + 0.35, Math.min(a0[1], a1[1]) - 0.3, Math.max(a0[1], a1[1]) + 0.3, 2);
    }
  }
  k.slab(con2, TX0 - 0.5, TX1 + 0.5, TTOP - 0.5, TTOP + 0.6, TZ0 - 0.5, TZ1 + 0.5, 3);
  k.slab(con, TX0 - 0.3, TX1 + 0.3, TTOP + 0.6, TTOP + 1.6, TZ0 - 0.3, TZ0 + 0.1, 2);
  k.slab(con, TX0 - 0.3, TX1 + 0.3, TTOP + 0.6, TTOP + 1.6, TZ1 - 0.1, TZ1 + 0.3, 2);
  for (const x of [TX0 - 0.3, TX1 - 0.1]) k.slab(con, x, x + 0.4, TTOP + 0.6, TTOP + 1.6, TZ0, TZ1, 2);
  // the glass lantern on the roof, the old headhouse, pillowed like the windows
  const LX0 = -27.6, LX1 = -16.0, LZ0 = -9, LZ1 = 10, LTOP = TTOP + 6.5;
  k.slab(con2, LX0, LX1, TTOP + 0.6, LTOP, LZ0, LZ1, 3);
  for (const f of faces(LX0, LX1, LZ0, LZ1)) {
    const L = lenOf(f), n = Math.round(L / 3.9), p = L / n;
    for (let b = 0; b < n; b++) pillows(lantern, f, (b + 0.5) * p, TTOP + 3.4, p - 0.5, 4.6, 3, 4, 0.28);
  }
  k.slab(con, LX0 - 0.4, LX1 + 0.4, LTOP, LTOP + 0.5, LZ0 - 0.4, LZ1 + 0.4, 3);
  // the entrance to the hotel at the tower's foot, west
  pillows(glass, tf[3], 18.35, 3.6, 7, 5.6, 5, 4, 0.3);
  k.slab(con2, TX0 - 2.5, TX0, 6.8, 7.3, TZ0 + 13, TZ0 + 23.7, 2);

  // ---- the bins: the tubes' curves round the outside, a core within ----
  k.slab(con, TX1, BX1 - TUBE, -FOOT, BTOP, TZ0 + TUBE, BZ1 - TUBE, 4);
  const nLong = 8, pLong = (BX1 - TX1 - 2 * TUBE) / (nLong - 1);
  const nEnd = 6, pEnd = (BZ1 - TZ0 - 2 * TUBE) / (nEnd - 1);
  const tube = (x: number, z: number, foot: number) => {
    k.add(con, new THREE.CylinderGeometry(TUBE, TUBE, BTOP - foot, 16), x, (BTOP + foot) / 2, z, 0, 4);
    if (foot > 0) k.add(dark, new THREE.CircleGeometry(TUBE - 0.25, 16).rotateX(Math.PI / 2), x, foot - 0.01, z);
  };
  for (let i = 0; i < nLong; i++) {
    const x = TX1 + TUBE + i * pLong;
    tube(x, TZ0 + TUBE, -FOOT);
    // the museum's way in on Silo Square, under the middle tubes cut off above head height
    tube(x, BZ1 - TUBE, i >= 2 && i <= 5 ? 8 : -FOOT);
  }
  for (let j = 1; j < nEnd - 1; j++) tube(BX1 - TUBE, TZ0 + TUBE + j * pEnd, -FOOT);
  // the glazed atrium behind the cut tubes, and the sign over it
  const ax0 = TX1 + TUBE + 2 * pLong - TUBE, ax1 = TX1 + TUBE + 5 * pLong + TUBE;
  const front: Face = { ax: ax0, az: BZ1 - TUBE, bx: ax1, bz: BZ1 - TUBE, ry: 0 };
  pillows(glass, front, (ax1 - ax0) / 2, 4, ax1 - ax0 - 1, 7.6, 12, 5, 0.3);
  k.quad(sign, (ax0 + ax1) / 2, 9.2, BZ1 + 0.1, 9, 1.1);
  // the roof: a parapet and the sculpture garden's pillowed rooflights
  k.slab(con2, TX1, BX1 + 0.2, BTOP, BTOP + 1.2, TZ0 - 0.2, TZ0 + 0.4, 2);
  k.slab(con2, TX1, BX1 + 0.2, BTOP, BTOP + 1.2, BZ1 - 0.4, BZ1 + 0.2, 2);
  k.slab(con2, BX1 - 0.4, BX1 + 0.2, BTOP, BTOP + 1.2, TZ0, BZ1, 2);
  k.slab(con2, -6, 25, BTOP, BTOP + 1.4, -9, 8, 3);
  for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) {
    k.add(glass, pillow(4.6, 3.8, 0.6).rotateX(-Math.PI / 2), -3.4 + i * 5.2, BTOP + 1.42, -6.8 + j * 4.25);
  }

  const grp = k.build();
  glow(grp, glass, 0.02, 0.85);
  glow(grp, lantern, 0.08, 1.0);
  return grp;
}

/** A faceted pane bulging out (+z) bulge at its middle, w by h. */
function pillow(w: number, h: number, bulge: number): THREE.BufferGeometry {
  const x = w / 2, y = h / 2, e = bulge * 0.45;
  const P: [number, number, number][] = [[-x, -y, 0], [0, -y, e], [x, -y, 0], [x, 0, e], [x, y, 0], [0, y, e], [-x, y, 0], [-x, 0, e]];
  const C: [number, number, number] = [0, 0, bulge];
  const pos: number[] = [];
  for (let i = 0; i < 8; i++) pos.push(...P[i], ...P[(i + 1) % 8], ...C);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(new Array(48).fill(0), 2));
  g.computeVertexNormals();
  return g;
}

// ---- boats moored along the quays -------------------------------------------------------------------

/** Boats at their moorings, as a set piece standing on the sea (its origin at the water's level,
 *  on the quay's edge, the water on its -z side). args: for each boat, its kind (yacht, fishing,
 *  schooner or ferry), where its middle is (x, z) and which way its bow points (radians from +x). */
export function boats(args: (number | string)[]): THREE.Object3D {
  const k = new Kit();
  const white = plain("#f2f3f1"), navy = plain("#1d3557"), red = plain("#a3262a"), blue = plain("#2a6f97"), wood = plain("#8a5a33");
  const teak = plain("#b9905e"), dark = plain("#23292e"), mast = plain("#d9d9d4"), rope = plain("#c8bfa8");
  const glass = plain("#33454f", { emissive: "#ffd9a0", emissiveIntensity: 0 });
  const sail = plain("#f4efe2");
  /** A hull of length L and beam B, from y0 to y1, its bow towards +x, as seen from above: a
   *  point at the bow, rounded at the stern (or square, for a catamaran's floats). */
  const hull = (mat: THREE.Material, L: number, B: number, y0: number, y1: number, x: number, z: number, ry: number, square = false) => {
    const sh = new THREE.Shape(), h = L / 2, b = B / 2;
    sh.moveTo(-h, -b * (square ? 1 : 0.8));
    sh.lineTo(h * 0.3, -b);
    sh.quadraticCurveTo(h * 0.85, -b * 0.9, h, 0);
    sh.quadraticCurveTo(h * 0.85, b * 0.9, h * 0.3, b);
    sh.lineTo(-h, b * (square ? 1 : 0.8));
    sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: y1 - y0, bevelEnabled: false, curveSegments: 5 }).rotateX(-Math.PI / 2);
    k.add(mat, g, x, y0, z, ry);
  };
  /** A point (u along the boat, up, v across) of a boat at (x, z) turned ry, in the set piece's frame. */
  const at = (x: number, z: number, ry: number, u: number, v: number): [number, number] => [x + Math.cos(ry) * u + Math.sin(ry) * v, z - Math.sin(ry) * u + Math.cos(ry) * v];
  for (let i = 0; i + 3 < args.length; i += 4) {
    const kind = String(args[i]), x = +args[i + 1], z = +args[i + 2], ry = +args[i + 3];
    const box = (mat: THREE.Material, u: number, y: number, v: number, l: number, h: number, w: number) => { const [px, pz] = at(x, z, ry, u, v); k.box(mat, px, y, pz, l, h, w, ry, 2); };
    const pole = (u: number, y: number, h: number, r = 0.1) => { const [px, pz] = at(x, z, ry, u, 0); k.cyl(mast, px, y, pz, r, h, 6, r * 0.6); };
    const sheet = (u0: number, u1: number, y0: number, y1: number) => {
      const t = new THREE.Shape(); t.moveTo(u0, y0); t.lineTo(u1, y0); t.lineTo(u0, y1); t.closePath();
      const [px, pz] = at(x, z, ry, 0, 0);
      k.shape(sail, t, 0.06, px, 0, pz, ry, 2);
    };
    if (kind === "yacht") {
      hull(white, 12, 3.8, -0.6, 0.9, x, z, ry);
      hull(navy, 12.1, 3.9, -0.6, 0.2, x, z, ry);
      hull(teak, 11.6, 3.5, 0.9, 0.95, x, z, ry);
      box(white, -0.8, 0.95, 0, 4.2, 0.7, 2.4);
      box(glass, -0.8, 1.15, 0, 4.0, 0.3, 2.45);
      pole(0.9, 0.95, 14.5, 0.12);
      box(mast, -1.6, 2.6, 0, 5, 0.12, 0.12);
      box(rope, -1.6, 2.75, 0, 4.8, 0.35, 0.4);   // the mainsail, furled on its boom
    } else if (kind === "fishing") {
      hull(blue, 11, 3.6, -0.8, 1.2, x, z, ry);
      hull(white, 11.1, 3.7, 0.9, 1.25, x, z, ry);
      box(white, 1.0, 1.25, 0, 3.0, 2.0, 2.6);
      box(glass, 1.0, 2.45, 0, 3.05, 0.6, 2.65);
      box(red, 1.0, 3.25, 0, 3.3, 0.15, 2.9);
      pole(1.6, 3.4, 3.5, 0.08);
      box(dark, -3.2, 1.25, 0, 0.15, 2.4, 0.15);   // the gantry for the nets
      box(dark, -3.2, 3.6, 0, 0.2, 0.15, 3.0);
      box(rope, -2.2, 1.25, 0, 2.0, 0.5, 2.2);
    } else if (kind === "schooner") {
      hull(wood, 22, 5.5, -1.0, 1.4, x, z, ry);
      hull(dark, 22.1, 5.6, -1.0, 0.1, x, z, ry);
      hull(teak, 21.4, 5.0, 1.4, 1.45, x, z, ry);
      box(wood, 0, 1.45, 2.55, 20, 0.6, 0.15);
      box(wood, 0, 1.45, -2.55, 20, 0.6, 0.15);
      box(white, -4, 1.45, 0, 5, 1.1, 3);
      box(glass, -4, 2.15, 0, 5.05, 0.35, 3.05);
      pole(4.5, 1.45, 19);
      pole(-1.5, 1.45, 21);
      box(mast, 12, 1.2, 0, 3.4, 0.16, 0.16);   // the bowsprit
      sheet(4.4, 9.5, 2.6, 12);
      sheet(-1.6, -9.5, 3.2, 17);
    } else if (kind === "ferry") {
      // a Robben Island catamaran: two floats, a deck across them, two decks of cabin and a bridge
      for (const v of [-3.6, 3.6]) { const [px, pz] = at(x, z, ry, 0, v); hull(white, 31, 2.6, -1.4, 1.6, px, pz, ry, true); hull(navy, 31.1, 2.7, -1.4, 0.2, px, pz, ry, true); }
      box(white, -0.5, 1.6, 0, 29, 0.6, 10);
      box(white, -2.5, 2.2, 0, 20, 2.4, 9);
      box(glass, -2.5, 2.9, 0, 20.05, 1.2, 9.05);
      box(navy, -2.5, 4.6, 0, 20.2, 0.25, 9.2);
      box(white, -4.5, 4.85, 0, 13, 2.2, 8);
      box(glass, -4.5, 5.5, 0, 13.05, 1.0, 8.05);
      box(white, 3.0, 4.85, 0, 3, 2.6, 5);
      box(glass, 4.4, 6.2, 0, 0.3, 1.0, 4.6);
      box(mast, -4.5, 7.05, 0, 13, 0.1, 8);
      pole(2.5, 7.45, 2.8, 0.08);
    }
  }
  const grp = k.build();
  glow(grp, glass, 0, 0.7);
  return grp;
}
/** The boats along the quay west of the Clock Tower, by the Alfred Basin's edge, in its frame. */
export const ALFRED_BOATS = ["yacht", -34, -3.8, 0, "fishing", -20, -3.6, Math.PI, "schooner", -2, -5.0, 0, "yacht", 16, -3.8, Math.PI, "yacht", 27, -3.8, 0];
/** The Robben Island ferry at the Nelson Mandela Gateway's quay, in its frame. */
export const FERRY_BOATS = ["ferry", 0, -6.2, Math.PI];

// ---- textures ---------------------------------------------------------------------------------------

const cache = new Map<string, THREE.Texture>();
const once = (k: string, make: () => THREE.Texture) => cache.get(k) ?? cache.set(k, make()).get(k)!;

/** Slipformed concrete: pale grey, the lines of each day's pour across it, streaked by the weather. */
function concrete(tint: string) {
  return plain(tint, { map: once("concrete", () => {
    const S = 256, [c, g] = TX.canvas(S, S), r = TX.rng(61);
    g.fillStyle = "#e4e1db"; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 1600; i++) { const l = 205 + r() * 45; g.fillStyle = `rgb(${l},${l - 2},${l - 6})`; g.fillRect(r() * S, r() * S, 2 + r() * 5, 2 + r() * 3); }
    for (let y = 0; y < S; y += S / 2) { g.fillStyle = "rgba(90,85,78,0.16)"; g.fillRect(0, y, S, 2); }
    for (let i = 0; i < 6; i++) { g.fillStyle = `rgba(80,76,70,${0.03 + r() * 0.04})`; g.fillRect(r() * S, 0, 4 + r() * 10, S); }
    return TX.pixelTex(c, 96, 96, 20, 61);
  }) });
}

/** A pointed Gothic window in a white frame (or a door, in dark green boards), cut out. */
function archGlass(isDoor: boolean) {
  const k = isDoor ? "door" : "arch";
  const map = once(k, () => archTex(isDoor, false)), em = once(k + "g", () => archTex(isDoor, true));
  return plain("#ffffff", { map, emissiveMap: em, emissive: "#ffffff", emissiveIntensity: 0, alphaTest: 0.5 });
}

function archTex(isDoor: boolean, lit: boolean): THREE.Texture {
  const W = 64, H = 128, [c, g] = TX.canvas(W, H);
  const outline = (i: number) => {
    const w = W - 2 * i, rise = W * 0.85 - i, R = (w * w / 4 + rise * rise) / w, top = W * 0.9;
    g.beginPath(); g.moveTo(i, H); g.lineTo(i, top);
    const a = Math.atan2(rise, R - w / 2);
    g.arc(i + R, top, R, Math.PI, Math.PI + a, false);
    g.arc(W - i - R, top, R, -a, 0, false);
    g.lineTo(W - i, H); g.closePath();
  };
  outline(0); g.fillStyle = lit ? "#000" : "#f3efe6"; g.fill();
  outline(6);
  if (isDoor) {
    g.fillStyle = lit ? "#000" : "#1f3b2c"; g.fill();
    g.save(); g.clip();
    g.fillStyle = lit ? "#000" : "#2c4e3b";
    for (let x = 8; x < W - 6; x += 8) g.fillRect(x, 0, 2, H);
    g.fillStyle = lit ? "#ffd08a" : "#3f5866"; g.fillRect(6, 10, W - 12, 30);   // the fanlight
    g.restore();
  } else {
    if (lit) g.fillStyle = "#ffcf8a";
    else { const grd = g.createLinearGradient(0, 0, W, H); grd.addColorStop(0, "#4b5d6b"); grd.addColorStop(0.6, "#25313b"); grd.addColorStop(1, "#4d6070"); g.fillStyle = grd; }
    g.fill();
    g.save(); g.clip();
    g.fillStyle = lit ? "#000" : "#f3efe6";
    g.fillRect(W / 2 - 2, 0, 4, H);
    for (const y of [H * 0.55, H * 0.78]) g.fillRect(0, y, W, 3);
    g.restore();
  }
  const t = TX.pixelTex(c, 32, 64, 22, isDoor ? 7 : 5, true);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** A clock face: white, black Roman hours and hands, in a gilt ring; cut out round. */
function clockFace() {
  const map = once("dial", () => dialTex(false)), em = once("dialg", () => dialTex(true));
  return plain("#ffffff", { map, emissiveMap: em, emissive: "#ffffff", emissiveIntensity: 0, alphaTest: 0.5 });
}

function dialTex(lit: boolean): THREE.Texture {
  const S = 128, [c, g] = TX.canvas(S, S), m = S / 2;
  g.fillStyle = lit ? "#000" : "#b8963c"; g.beginPath(); g.arc(m, m, m - 1, 0, TAU); g.fill();
  g.fillStyle = lit ? "#fff2d0" : "#f7f4ea"; g.beginPath(); g.arc(m, m, m - 8, 0, TAU); g.fill();
  g.fillStyle = "#1b1b1b";
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    g.save(); g.translate(m + Math.sin(a) * (m - 20), m - Math.cos(a) * (m - 20)); g.rotate(a);
    g.fillRect(-2, -7, 4, 14);
    g.restore();
  }
  g.strokeStyle = "#1b1b1b"; g.lineCap = "round";
  g.lineWidth = 6; g.beginPath(); g.moveTo(m, m); g.lineTo(m - 26, m - 16); g.stroke();
  g.lineWidth = 4; g.beginPath(); g.moveTo(m, m); g.lineTo(m + 30, m - 30); g.stroke();
  const t = TX.pixelTex(c, 64, 64, 24, 3, true);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Lettering on a sign board. */
function signMat(text: string, bg = "#1f3a5c", ink = "#ffffff") {
  return plain("#ffffff", { map: once(`sign:${text}`, () => {
    const W = 512, H = 96, [c, g] = TX.canvas(W, H);
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.fillStyle = ink; g.font = `bold ${Math.round(H * 0.6)}px Helvetica, Arial, sans-serif`;
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(text, W / 2, H / 2 + 3, W - 24);
    return TX.tex(c);
  }) });
}
