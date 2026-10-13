// Bath Abbey, as a set piece (landmarks/setpieces.ts) in place of the plain blocks the map tools
// build from its outline. The church of Bishop Oliver King, begun in 1499 and finished in the
// 1600s, restored by George Gilbert Scott in the 1860s: a cruciform Perpendicular church about
// 69 m long, its walls mostly glass (the "Lantern of the West").
// - The nave of five bays and the choir of three, each with single-storey aisles; flying
//   buttresses (Scott's) from the aisle walls up to the clerestory, with openwork pinnacles; and
//   pierced parapets all round.
// - Narrow transepts, two bays deep, and the oblong tower over the crossing, longer across the
//   church than along it, with two tall bell openings to a face, a pierced battlement and corner
//   turrets with pinnacles, 49 m to their tips.
// - The west front: the great west window of seven lights, an octagonal turret either side of it
//   carved with Bishop King's dream, a ladder of angels climbing up and coming down, Henry VII
//   and the saints over the door and Christ in majesty at the top of the gable; and the big
//   square-headed east window.
// - Inside, which you can go into through the west door: the arcades, the fan vault over the
//   nave, the transepts and the aisles, the stained glass, pews, choir stalls, the altar and the
//   organ in the north transept.
// Its frame: x east along the church from the middle of the nave, z south (its front), y up from
// the floor. Placed at a fixed floor level (setpieces.ts), a touch above the highest ground
// inside it, with steps up to the west door. Solid (abbeySolids): its walls, buttresses,
// turrets, piers, pews and stalls; and you walk on its floor.
import * as THREE from "three";
import { Kit, stone, plain, gothicGlass, fanVault, flags, openwork, figure, glow, pointedArch } from "./kit";
import { solids } from "./solids";

// the plan (see the frame above)
const WX = -34.9, EX = 34.6;          // the west and east fronts' outer faces
const T = 1.0;                        // walls' thickness
const NW = 5.8, AW = 12.5;            // the middles of the arcade walls and of the aisles' outer walls, either side
const TX0 = 1.5, TX1 = 12.5, TZ = 20.8;   // the crossing and transepts (x from, to) and how far the transepts reach out
const AISLE = 10.0, CLER = 20.5, PAR = 1.2, RIDGE = 25.0;   // heights: aisle walls, clerestory walls, parapets, roof ridge
const SPRING = 8.0, APEX = 11.2;      // the arcades' arches
const TOWER = { x0: 2.5, x1: 11.5, z: 6.0, top: 39.8, tips: 48.2 };
const NAVE = { x0: WX + T, x1: TX0, bays: 5 }, CHOIR = { x0: TX1, x1: EX - T, bays: 3 };
const piers = (p: typeof NAVE) => Array.from({ length: p.bays - 1 }, (_, k) => p.x0 + ((p.x1 - p.x0) * (k + 1)) / p.bays);
const bays = (p: typeof NAVE) => Array.from({ length: p.bays }, (_, k) => p.x0 + ((p.x1 - p.x0) * (k + 0.5)) / p.bays);
const PEWS = Array.from({ length: 21 }, (_, k) => -31 + k * 1.15);
const DOOR = 1.8;                     // half the west door's width

export function abbey(): THREE.Object3D {
  const k = new Kit();
  const S = stone(), S2 = stone("#cdb88c"), lead = plain("#727a82"), wood = plain("#5b3d25"), gold = plain("#c49a3c");
  const cloth = plain("#7c1f26"), fig = plain("#efe3c4");
  const out5 = gothicGlass(false, false, 5), in5 = gothicGlass(true, false, 5);
  const out7 = gothicGlass(false, false, 7), in7 = gothicGlass(true, false, 7);
  const outSq = gothicGlass(false, true, 7), inSq = gothicGlass(true, true, 7);
  const vault = fanVault(); vault.side = THREE.DoubleSide;
  const floorMat = flags(), lace = openwork();
  const sides = [1, -1];
  const face = (s: number) => (s > 0 ? 0 : Math.PI);       // a picture facing +z (s = 1) or -z
  /** An openwork parapet with its coping, along x at z, from x0 to x1, on top of a wall at y. */
  const parapetX = (x0: number, x1: number, z: number, y: number) => {
    k.quad(lace, (x0 + x1) / 2, y + PAR / 2, z, x1 - x0, PAR, 0, 0, 0, (x1 - x0) / 2.4, 1);
    k.slab(S, x0, x1, y + PAR, y + PAR + 0.15, z - 0.2, z + 0.2);
  };
  const parapetZ = (z0: number, z1: number, x: number, y: number) => {
    k.quad(lace, x, y + PAR / 2, (z0 + z1) / 2, Math.abs(z1 - z0), PAR, Math.PI / 2, 0, 0, Math.abs(z1 - z0) / 2.4, 1);
    k.slab(S, x - 0.2, x + 0.2, y + PAR, y + PAR + 0.15, Math.min(z0, z1), Math.max(z0, z1));
  };
  const pinnacle = (x: number, y: number, z: number, h: number, r = 0.35) => { k.cyl(S, x, y, z, r, h * 0.35, 4); k.cyl(S, x, y + h * 0.35, z, r, h * 0.65, 4, 0); };

  // ---- the aisles' outer walls, with their windows, parapets and lean-to roofs -----------------
  for (const p of [NAVE, CHOIR]) for (const s of sides) {
    const x0 = p === NAVE ? WX : TX1, x1 = p === NAVE ? TX0 : EX;
    k.slab(S, x0, x1, -1.5, AISLE, s * AW - 0.5, s * AW + 0.5);
    for (const x of bays(p)) {
      k.quad(out5, x, 6.0, s * (AW + 0.52), 4.4, 6.4, face(s));
      k.quad(in5, x, 6.0, s * (AW - 0.52), 4.4, 6.4, face(-s));
    }
    parapetX(x0, x1, s * (AW + 0.3), AISLE);
    const run = AW - NW - 0.4, rise = 1.9;
    k.add(lead, new THREE.BoxGeometry(x1 - x0, 0.18, Math.hypot(run, rise)), (x0 + x1) / 2, AISLE + 0.3 + rise / 2, s * (NW + 0.5 + run / 2), 0, 0, s * Math.atan2(rise, run));
    // the aisles' fan vaults inside, flat over each aisle
    ceiling(k, vault, p.x0, p.x1, s * (NW + 0.5), s * (AW - 0.5), AISLE - 0.7, (p.x1 - p.x0) / p.bays);
  }

  // ---- the arcades, and the clerestory over them -----------------------------------------------
  for (const p of [NAVE, CHOIR]) for (const s of sides) {
    const len = p.x1 - p.x0, wall = new THREE.Shape();
    wall.moveTo(0, -1.5); wall.lineTo(len, -1.5); wall.lineTo(len, CLER); wall.lineTo(0, CLER); wall.closePath();
    const edges = [p.x0, ...piers(p), p.x1];
    for (let b = 0; b < p.bays; b++) {
      const a = edges[b] - p.x0 + (b ? 0.75 : 0.9), c = edges[b + 1] - p.x0 - (b < p.bays - 1 ? 0.75 : 0.9);
      const hole = new THREE.Path();
      hole.moveTo(a, -1.4); hole.lineTo(a, SPRING);
      pointedArch(hole, (a + c) / 2, SPRING, c - a, APEX - SPRING);
      hole.lineTo(c, -1.4); hole.closePath();
      wall.holes.push(hole);
    }
    k.shape(S, wall, T, p.x0, 0, s * NW, 0, 3, 8);
    for (const x of bays(p)) {
      k.quad(out5, x, 15.2, s * (NW + 0.52), 4.6, 6.8, face(s));
      k.quad(in5, x, 15.2, s * (NW - 0.52), 4.6, 6.8, face(-s));
    }
    parapetX(p === NAVE ? WX : TX1, p === NAVE ? TX0 : EX, s * (NW + 0.3), CLER);
    // the piers' shafts, inside, and the flying buttresses outside at each pier
    for (const x of piers(p)) {
      k.cyl(S2, x, 0, s * (NW - 0.55), 0.3, CLER - 1.8, 6);
      k.slab(S, x - 0.45, x + 0.45, -1.5, 13.4, s * (AW + 0.5), s * (AW + 1.5));
      pinnacle(x, 13.4, s * (AW + 1.0), 3.4, 0.45);
      k.beam(S, [x, 12.8, s * (AW + 0.6)], [x, 18.7, s * (NW + 0.55)], 0.5, 0.75);
      pinnacle(x, CLER + PAR, s * (NW + 0.3), 2.8);
    }
  }
  // the main roof, low behind the parapets, over the nave, the crossing and the choir
  k.roof(lead, WX + 0.6, EX - 0.6, CLER, -NW - 0.4, NW + 0.4, RIDGE - CLER);
  // the fan vault over the nave and choir
  barrel(k, vault, NAVE.x0, CHOIR.x1, 0, NW - 0.5, 18.8, 2.6, (NAVE.x1 - NAVE.x0) / NAVE.bays, false);

  // ---- the transepts ---------------------------------------------------------------------------
  for (const s of sides) {
    const zIn = s * (AW - 0.5), zOut = s * TZ;
    k.slab(S, TX0, TX0 + T, -1.5, CLER, Math.min(zIn, zOut), Math.max(zIn, zOut));
    k.slab(S, TX1 - T, TX1, -1.5, CLER, Math.min(zIn, zOut), Math.max(zIn, zOut));
    k.slab(S, TX0, TX1, -1.5, CLER, Math.min(s * (TZ - T), zOut), Math.max(s * (TZ - T), zOut));
    // the end window, and one in each side
    k.quad(out7, (TX0 + TX1) / 2, 12.8, s * (TZ + 0.02), 6.6, 11.2, face(s));
    k.quad(in7, (TX0 + TX1) / 2, 12.8, s * (TZ - T - 0.02), 6.6, 11.2, face(-s));
    for (const [x, dir] of [[TX0, -1], [TX1, 1]] as const) {
      k.quad(out5, x + dir * 0.02, 14.5, s * (AW + 3.9), 3.6, 7.0, (dir * Math.PI) / 2);
      k.quad(in5, x - dir * (T + 0.02), 14.5, s * (AW + 3.9), 3.6, 7.0, (-dir * Math.PI) / 2);
      parapetZ(s * AW, s * TZ, x + dir * 0.3, CLER);
    }
    // its gable, roof and corner pinnacles
    const gable = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(TX1 - TX0, 0), new THREE.Vector2((TX1 - TX0) / 2, RIDGE - CLER + 0.6)]);
    k.shape(S, gable, T, TX0, CLER, s * (TZ - T / 2));
    k.roof(lead, TX0 + 0.4, TX1 - 0.4, CLER, Math.min(s * NW, s * (TZ - 0.6)), Math.max(s * NW, s * (TZ - 0.6)), RIDGE - CLER, true);
    for (const x of [TX0, TX1]) pinnacle(x, CLER, s * TZ, 5.0, 0.55);
    barrel(k, vault, (TX0 + TX1) / 2, (TX0 + TX1) / 2, s * (NW + 0.5), s * (TZ - T), 18.8, 2.4, 7, true, (TX1 - TX0) / 2 - T);
    // the wall over where each aisle meets the transept
    for (const x of [TX0, TX1]) k.slab(S, x - 0.5, x + 0.5, AISLE - 0.7, CLER, Math.min(s * (NW + 0.5), s * (AW - 0.5)), Math.max(s * (NW + 0.5), s * (AW - 0.5)));
    // and over the crossing's arches into the transepts
    k.slab(S, TX0, TX1, 16.8, CLER, s * NW - 0.5, s * NW + 0.5);
    k.cyl(S2, TX0, 0, s * NW, 1.1, CLER, 8);
    k.cyl(S2, TX1, 0, s * NW, 1.1, CLER, 8);
  }

  // ---- the tower ---------------------------------------------------------------------------------
  {
    const { x0, x1, z, top, tips } = TOWER;
    k.slab(S, x0, x1, CLER - 1, top, -z, z);
    for (const y of [27.4, top - 1.6]) k.slab(S2, x0 - 0.15, x1 + 0.15, y, y + 0.35, -z - 0.15, z + 0.15);
    for (const s of sides) {
      for (const x of [x0 + 2.4, x1 - 2.4]) k.quad(out5, x, 32.4, s * (z + 0.02), 1.9, 8.0, face(s));
      for (const zz of [-z / 2 + 0.1, z / 2 - 0.1]) k.quad(out5, s > 0 ? x1 + 0.02 : x0 - 0.02, 32.4, zz, 1.9, 8.0, (s * Math.PI) / 2);
      parapetX(x0, x1, s * (z - 0.2), top);
      parapetZ(-z, z, s > 0 ? x1 - 0.2 : x0 + 0.2, top);
    }
    for (const [x, zz] of [[x0, -z], [x1, -z], [x0, z], [x1, z]]) {
      k.cyl(S, x, top - 9, zz, 0.85, 12.2, 8);
      k.cyl(S, x, top + 3.2, zz, 0.75, tips - top - 3.2, 8, 0);
    }
    for (const s of sides) { pinnacle((x0 + x1) / 2, top + PAR, s * (z - 0.2), 3.6); pinnacle(s > 0 ? x1 - 0.2 : x0 + 0.2, top + PAR, 0, 3.6); }
  }

  // ---- the west front ----------------------------------------------------------------------------
  {
    const front = new THREE.Shape();
    const w = 6.5, gable = RIDGE + 1.2;
    front.moveTo(-w, -1.5); front.lineTo(w, -1.5); front.lineTo(w, CLER + PAR); front.lineTo(0, gable); front.lineTo(-w, CLER + PAR); front.closePath();
    const door = new THREE.Path();
    door.moveTo(-DOOR, -1.4); door.lineTo(-DOOR, 4.4); pointedArch(door, 0, 4.4, 2 * DOOR, 2.1); door.lineTo(DOOR, -1.4); door.closePath();
    front.holes.push(door);
    k.shape(S, front, T, WX + T / 2, 0, 0, -Math.PI / 2);
    // the aisles' ends, lower, with the turrets at their corners
    for (const s of sides) {
      k.slab(S, WX, WX + T, -1.5, AISLE, Math.min(s * w, s * (AW + 0.5)), Math.max(s * w, s * (AW + 0.5)));
      parapetZ(s * w, s * (AW + 0.5), WX + 0.3, AISLE);
      k.quad(out5, WX - 0.02, 6.2, s * 9.6, 3.6, 6.0, -Math.PI / 2);
      k.quad(in5, WX + T + 0.02, 6.2, s * 9.6, 3.6, 6.0, Math.PI / 2);
      k.cyl(S, WX + 0.5, -1.5, s * (AW + 0.6), 0.95, AISLE + 3.4, 8);
      k.cyl(S, WX + 0.5, AISLE + 1.9, s * (AW + 0.6), 0.8, 2.8, 8, 0);
      // the great turrets either side of the west window
      k.cyl(S, WX + 0.4, -1.5, s * 6.7, 1.45, CLER + 5.5, 8);
      k.cyl(S, WX + 0.4, CLER + 4, s * 6.7, 1.25, 4.6, 8, 0);
      for (const a of [0, 1, 2, 3]) pinnacle(WX + 0.4 + Math.cos(a * Math.PI / 2) * 1.2, CLER + 4, s * 6.7 + Math.sin(a * Math.PI / 2) * 1.2, 2.4, 0.25);
      // Bishop King's dream: a ladder of angels up the turret's face, some climbing, some coming down
      const lx = WX + 0.4 - 1.5;
      for (const dz of [-0.36, 0.36]) k.slab(S2, lx - 0.08, lx + 0.08, 2.4, 20.6, s * 6.7 + dz - 0.07, s * 6.7 + dz + 0.07, 2);
      for (let y = 3.0; y < 20.5; y += 0.85) k.slab(S2, lx - 0.06, lx + 0.06, y, y + 0.09, s * 6.7 - 0.36, s * 6.7 + 0.36, 2);
      for (let a = 0; a < 6; a++) {
        const down = a % 2 === 1, y = 3.6 + a * 2.75;
        k.add(fig, figure(true, 0.5), lx - 0.18, down ? y + 1.05 : y, s * 6.7, -Math.PI / 2, 0, 0, down ? Math.PI : 0);
      }
    }
    // the great west window, inside and out
    k.quad(out7, WX - 0.02, 14.6, 0, 8.4, 11.4, -Math.PI / 2);
    k.quad(in7, WX + T + 0.02, 14.6, 0, 8.4, 11.4, Math.PI / 2);
    // Henry VII and the saints over the door, on a ledge, and Christ in majesty in the gable
    k.slab(S2, WX - 0.6, WX, 6.6, 6.85, -3.0, 3.0);
    for (const z of [-2.2, -0.75, 0.75, 2.2]) k.add(fig, figure(false, 0.62), WX - 0.3, 6.85, z, -Math.PI / 2);
    k.add(fig, figure(false, 0.8), WX - 0.25, CLER + PAR + 0.6, 0, -Math.PI / 2);
    pinnacle(WX + 0.5, gable, 0, 2.2, 0.3);
    // the doors, open, against the reveals, and the steps up to them
    for (const s of sides) k.slab(wood, WX + T, WX + T + 1.6, 0, 5.2, s * DOOR - (s > 0 ? 0.12 : 0), s * DOOR + (s > 0 ? 0 : 0.12));
    k.slab(S2, WX - 1.0, WX, -1.5, -0.3, -DOOR - 0.8, DOOR + 0.8);
    k.slab(S2, WX - 2.0, WX - 1.0, -1.5, -0.6, -DOOR - 0.8, DOOR + 0.8);
    k.slab(S2, WX, WX + T, -0.3, 0.02, -DOOR, DOOR);
  }

  // ---- the east end ----------------------------------------------------------------------------------
  {
    const w = 6.5, end = new THREE.Shape();
    end.moveTo(-w, -1.5); end.lineTo(w, -1.5); end.lineTo(w, CLER + PAR); end.lineTo(0, RIDGE + 0.8); end.lineTo(-w, CLER + PAR); end.closePath();
    k.shape(S, end, T, EX - T / 2, 0, 0, -Math.PI / 2);
    k.quad(outSq, EX + 0.02, 12.6, 0, 9.4, 12.6, Math.PI / 2);
    k.quad(inSq, EX - T - 0.02, 12.6, 0, 9.4, 12.6, -Math.PI / 2);
    for (const s of sides) {
      k.slab(S, EX - T, EX, -1.5, AISLE, Math.min(s * w, s * (AW + 0.5)), Math.max(s * w, s * (AW + 0.5)));
      parapetZ(s * w, s * (AW + 0.5), EX - 0.3, AISLE);
      k.quad(out5, EX + 0.02, 6.0, s * 9.6, 3.6, 6.0, Math.PI / 2);
      k.quad(in5, EX - T - 0.02, 6.0, s * 9.6, 3.6, 6.0, -Math.PI / 2);
      k.cyl(S, EX - 0.4, -1.5, s * 6.7, 1.2, CLER + 4, 8);
      k.cyl(S, EX - 0.4, CLER + 2.5, s * 6.7, 1.05, 4.0, 8, 0);
      k.cyl(S, EX - 0.5, -1.5, s * (AW + 0.6), 0.85, AISLE + 3.0, 8);
      k.cyl(S, EX - 0.5, AISLE + 1.5, s * (AW + 0.6), 0.7, 2.6, 8, 0);
    }
  }

  // ---- the low buildings along the south side ---------------------------------------------------------
  k.slab(S2, -28.4, TX0 - 0.6, -1.5, 4.6, AW + 0.5, 18.9);
  parapetX(-28.4, TX0 - 0.6, 18.7, 4.6);
  k.slab(S2, TX1 + 0.6, EX - 0.2, -1.5, 6.2, AW + 0.5, 19.4);
  parapetX(TX1 + 0.6, EX - 0.2, 19.2, 6.2);
  for (const [x0, x1, h] of [[-28.4, TX0 - 0.6, 4.6], [TX1 + 0.6, EX - 0.2, 6.2]]) {
    for (let x = x0 + 2.6; x < x1 - 1.5; x += 4.2) k.quad(out5, x, h / 2 + 0.2, (h > 5 ? 19.4 : 18.9) + 0.02, 1.8, h - 2.0);
  }

  // ---- inside: the floor, the pews, the choir, the altar and the organ ----------------------------------
  k.slab(floorMat, WX + T, EX - T, -0.4, 0.02, -AW + 0.5, AW - 0.5, 2.5);
  for (const s of sides) k.slab(floorMat, TX0 + T, TX1 - T, -0.4, 0.02, Math.min(s * (AW - 0.5), s * (TZ - T)), Math.max(s * (AW - 0.5), s * (TZ - T)), 2.5);
  for (const x of PEWS) for (const s of sides) {
    k.slab(wood, x, x + 0.45, 0, 0.45, Math.min(s * 1.0, s * 4.9), Math.max(s * 1.0, s * 4.9), 1);
    k.slab(wood, x + 0.42, x + 0.52, 0, 0.98, Math.min(s * 1.0, s * 4.9), Math.max(s * 1.0, s * 4.9), 1);
  }
  for (const s of sides) {
    k.slab(wood, 14.2, 27.6, 0, 1.15, Math.min(s * 3.5, s * 4.9), Math.max(s * 3.5, s * 4.9), 1);
    k.slab(wood, 14.2, 27.6, 1.15, 2.6, Math.min(s * 4.75, s * 4.9), Math.max(s * 4.75, s * 4.9), 1);
  }
  k.slab(S2, 30.8, 32.2, 0, 1.0, -1.5, 1.5);
  k.slab(cloth, 30.75, 32.25, 1.0, 1.06, -1.55, 1.55, 1);
  k.slab(gold, 31.45, 31.55, 1.06, 2.0, -0.05, 0.05, 1);
  k.slab(gold, 31.45, 31.55, 1.6, 1.7, -0.32, 0.32, 1);
  for (const z of [-1.1, 1.1]) k.cyl(gold, 31.5, 1.06, z, 0.05, 0.6, 6);
  k.slab(wood, 29.2, 29.4, 0, 0.9, -4.5, 4.5, 1);                        // the altar rail
  // the organ, its case and gilded pipes, in the north transept
  k.slab(wood, TX0 + 1.4, TX1 - 1.4, 0, 6.5, -TZ + T, -TZ + T + 2.0, 1);
  for (let i = 0; i < 15; i++) {
    const x = TX0 + 1.9 + (i * (TX1 - TX0 - 3.8)) / 14, h = 3.0 + 2.4 * Math.cos(((i - 7) / 7) * Math.PI / 2);
    k.cyl(gold, x, 6.5, -TZ + T + 1.8, 0.16, h, 6);
  }

  const grp = k.build();
  for (const m of [out5, out7, outSq]) glow(grp, m, 0, 0.9);
  for (const m of [in5, in7, inSq]) glow(grp, m, 0.75, 0.15);
  return grp;
}

/** A fan vault's flat ceiling, facing down, from x0 to x1 and z0 to z1 at height y, a bay to a repeat. */
function ceiling(k: Kit, mat: THREE.Material, x0: number, x1: number, z0: number, z1: number, y: number, bay: number) {
  const g = new THREE.PlaneGeometry(Math.abs(x1 - x0), Math.abs(z1 - z0));
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * Math.abs(x1 - x0)) / bay, uv.getY(i));
  k.add(mat, g, (x0 + x1) / 2, y, (z0 + z1) / 2, 0, 0, Math.PI / 2);
}

/** A shallow barrel of fan vaulting from (x0, z0) to (x1, z1), half wide each side, springing at y
 *  and rising rise to its crown, a bay to a repeat; alongZ for one running along z. */
function barrel(k: Kit, mat: THREE.Material, x0: number, x1: number, z0: number, z1: number, y: number, rise: number, bay: number, alongZ: boolean, half = NW - 0.5) {
  const len = alongZ ? Math.abs(z1 - z0) : x1 - x0;
  const g = new THREE.CylinderGeometry(1, 1, len, 18, 1, true, -Math.PI / 2, Math.PI);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, (uv.getY(i) * len) / bay);
  g.scale(half, 1, rise);
  if (alongZ) k.add(mat, g, x0, y, (z0 + z1) / 2, 0, 0, -Math.PI / 2);
  else k.add(mat, g, (x0 + x1) / 2, y, z0, 0, 0, -Math.PI / 2, -Math.PI / 2);
}

/** What's solid, in the Abbey's frame (landmarks/solids.ts). */
export function abbeySolids(): ReturnType<typeof solids>["S"] {
  const { S, wall, floor, post } = solids();
  const top = CLER + PAR;
  // the west front, either side of the door, and the east end
  for (const s of [1, -1]) wall(WX, WX + T, s * DOOR, s * (AW + 0.5), top);
  wall(EX - T, EX, -AW - 0.5, AW + 0.5, top);
  for (const s of [1, -1]) {
    // the aisles' walls and the transepts' walls
    wall(WX, TX0, s * (AW - 0.5), s * (AW + 0.5), AISLE + PAR);
    wall(TX1, EX, s * (AW - 0.5), s * (AW + 0.5), AISLE + PAR);
    wall(TX0, TX0 + T, s * (AW - 0.5), s * TZ, top);
    wall(TX1 - T, TX1, s * (AW - 0.5), s * TZ, top);
    wall(TX0, TX1, s * (TZ - T), s * TZ, top);
    // buttresses and turrets
    for (const x of [...piers(NAVE), ...piers(CHOIR)]) { wall(x - 0.45, x + 0.45, s * (AW + 0.5), s * (AW + 1.5), 13.4); post(x, s * (NW - 0.55), 0.6, CLER); post(x, s * NW, 0.6, CLER); }
    post(WX + 0.4, s * 6.7, 1.45, CLER + 5);
    post(WX + 0.5, s * (AW + 0.6), 0.95, AISLE + 2);
    post(EX - 0.4, s * 6.7, 1.2, CLER + 3);
    post(EX - 0.5, s * (AW + 0.6), 0.85, AISLE + 2);
    for (const x of [TX0, TX1]) post(x, s * NW, 1.1, CLER);
    // pews, stalls, and the buildings along the south side
    for (const x of PEWS) wall(x, x + 0.52, s * 1.0, s * 4.9, 0.98, true);
    wall(14.2, 27.6, s * 3.5, s * 4.9, 1.15, true);
  }
  wall(-28.4, TX0 - 0.6, AW + 0.5, 18.9, 4.6);
  wall(TX1 + 0.6, EX - 0.2, AW + 0.5, 19.4, 6.2);
  wall(30.8, 32.2, -1.5, 1.5, 1.06, true);
  wall(TX0 + 1.4, TX1 - 1.4, -TZ + T, -TZ + T + 2.0, 6.5);
  // the floor, and the steps up to the door
  floor(WX, EX, -AW - 0.5, AW + 0.5, 0.02);
  for (const s of [1, -1]) floor(TX0, TX1, s * (AW - 0.5), s * TZ, 0.02);
  floor(WX - 1.0, WX, -DOOR - 0.8, DOOR + 0.8, -0.3);
  floor(WX - 2.0, WX - 1.0, -DOOR - 0.8, DOOR + 0.8, -0.6);
  return S;
}
