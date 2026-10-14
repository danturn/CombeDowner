// The Roman Baths and the Pump Room, as a set piece (landmarks/setpieces.ts) in place of the
// plain blocks the map tools build over the whole block between the Abbey Churchyard, Stall
// Street, York Street and Kingston Parade.
// - The Great Bath: the Romans' great pool, lined with lead and full of hot green water, down at
//   the Roman level and open to the sky, with steps down into it on every side. Round it the
//   Roman piers' bases carry the Victorians' pillars, and on the terrace above them, behind its
//   balustrade, stand the statues of Roman emperors and governors of Britain (carved for the
//   opening in 1897). Steam rises off the water.
// - The terrace round it, at the Victorian level, open to the sky, with stairs down to the Roman
//   level, and the museum's ranges round that: along York Street, Kingston Parade and Stall
//   Street (with its colonnade and the floor over it).
// - The Pump Room (Baldwin and Palmer, 1790s) along the Abbey Churchyard: its north front with
//   four great Corinthian columns under a pediment and "ΑΡΙΣΤΟΝ ΜΕΝ ΥΔΩΡ" ("water is best")
//   along the frieze, tall round-headed windows and a balustrade; and its colonnade along Stall
//   Street at the churchyard's corner.
// - The Concert Room (Brydon, 1890s), the way in from the churchyard, under its glass dome: you
//   walk in through the arch, up the steps at the far end and out onto the terrace.
// The real Great Bath is a little closer to York Street and Kingston Parade than here: the ground
// can only be taken down where it doesn't carry a street (setpieces.ts), so the pool and the
// court round it are set 3.5 m further north and 1.5 m further west than they really are, to
// keep those streets level.
// Its frame: x along the Great Bath towards the Abbey (east-north-east), z south, y up from the
// Roman level (the court's floor round the pool). Solid as it's drawn (landmarks/shape.ts): the
// water isn't, so you wade in and climb out up the steps round the pool.
import * as THREE from "three";
import { Kit, stone, georgian, plain, flags, balusters, archedGlass, sashGlass, lettering, figure, glow, roundArch } from "./kit";

const PX0 = -14, PX1 = 11, PZ0 = -9.5, PZ1 = 2.5;   // the Great Bath: its west, east, north and south edges
const WATER = -0.35, BED = -1.75;            // its water and its floor
const CX0 = -22, CX1 = 12, CZ0 = -14;      // the court round it at the Roman level: west, east, north (south: the pool's edge)
const TER = 4.4;                             // the terrace, the Victorian level
const HALL = 3.2;                            // the Concert Room's floor, about the churchyard's level
const NCOL = [-19, -15.5, -11.5, -7.5, -3.5, 0.5, 4.5, 8.5];   // the pillars along the north side (x)
const NZ = -11.0, WX = -15.5;                // the north and west lines of pillars
const SW = -1.5, WT = -7.0;                  // the north edge of the solid south-west corner, and the west terrace's south edge
const STAIR = { x0: -22, x1: -19.5, z0: SW, step: 0.5, rise: 0.4, n: 11 };   // up from the court's south-west, northwards
// the block's outer ranges: x0, x1, z0, z1, top
const PUMP = [-44.7, -7.2, -37.5, -19.6, 17.1];
const HALLW = [-7.2, 7.9, -37.1, -19.6, 19.8];
const RANGES: number[][] = [
  [7.9, 17.7, -37.2, -19.6, 11.3],     // the east range by the churchyard
  [15.6, 17.7, -19.6, 10.0, 9.0],      // along Kingston Parade
  [-28, 15.6, 7.0, 10.0, 9.0],         // along York Street
  [-43.5, -28, -19.6, -1.4, 9.5],      // along Stall Street, over the colonnade
  [-45.2, -28, -1.4, 10.0, 16.0],      // the corner of Stall Street and York Street
];
// the solid mass under the terrace, round the court: x0, x1, z0, z1
const UNDER: number[][] = [
  [-28, 17.7, -19.6, CZ0],             // north
  [-28, CX0, CZ0, 7.0],                // west
  [CX0, PX0, SW, 7.0],               // south-west corner
  [PX0, 15.6, PZ1, 7.0],               // south
  [CX1, 15.6, CZ0, PZ1],               // east
];

export function baths(): THREE.Object3D {
  const k = new Kit();
  const S = stone(), S2 = stone("#c3ab7f"), roman = stone("#a8977a"), G = georgian(), lead = plain("#6d747a");
  const floor = flags(), bal = balusters(), arched = archedGlass(), sash = sashGlass(), statue = plain("#9e927c");
  const water = new THREE.MeshLambertMaterial({ color: "#5d8f62", emissive: "#1f3d26", map: ripples() });
  water.userData.ghost = true;   // you wade into it (landmarks/shape.ts)
  const glass = plain("#61798a", { emissive: "#ffd9a0", emissiveIntensity: 0 }), dark = plain("#2b2925");

  // ---- the Great Bath -----------------------------------------------------------------------------
  {
    const w = new THREE.PlaneGeometry(PX1 - PX0, PZ1 - PZ0);
    k.add(water, w, (PX0 + PX1) / 2, WATER, (PZ0 + PZ1) / 2, 0, 0, -Math.PI / 2);
    // its sides, down into the water, and the edging stones round it
    for (const [x0, x1, z0, z1] of [[PX0, PX1, PZ0, PZ0 + 0.3], [PX0, PX1, PZ1 - 0.3, PZ1], [PX0, PX0 + 0.3, PZ0, PZ1], [PX1 - 0.3, PX1, PZ0, PZ1]])
      k.slab(roman, x0, x1, BED, WATER + 0.02, z0, z1, 2);
    // the steps down into it, all round inside its sides, under the water
    for (let s = 0; s < 3; s++) {
      const i = 0.3 + 0.45 * s, w = 0.45, y = -0.65 - 0.35 * s;
      for (const [x0, x1, z0, z1] of [[PX0 + i, PX1 - i, PZ0 + i, PZ0 + i + w], [PX0 + i, PX1 - i, PZ1 - i - w, PZ1 - i], [PX0 + i, PX0 + i + w, PZ0 + i, PZ1 - i], [PX1 - i - w, PX1 - i, PZ0 + i, PZ1 - i]])
        k.slab(roman, x0, x1, BED, y, z0, z1, 2);
    }
    for (const [x0, x1, z0, z1] of [[PX0 - 0.5, PX1 + 0.5, PZ0 - 0.5, PZ0], [PX0 - 0.5, PX0, PZ0, PZ1], [PX1, PX1 + 0.5, PZ0, PZ1]])
      k.slab(S2, x0, x1, -0.3, 0.1, z0, z1, 1.5);
  }

  // ---- the court at the Roman level, its pillars, and the terrace over them --------------------------
  k.slab(floor, CX0, CX1, -0.6, 0, CZ0, PZ0 - 0.5, 2.5);
  k.slab(floor, CX0, PX0 - 0.5, -0.6, 0, PZ0 - 0.5, SW, 2.5);
  k.slab(floor, PX1 + 0.5, CX1, -0.6, 0, PZ0 - 0.5, PZ1, 2.5);
  for (const [x0, x1, z0, z1] of UNDER) k.slab(S, x0, x1, -2, TER, z0, z1, 3);
  // the terrace's overhang, over the walk round the pool on the north and west
  k.slab(S2, CX0, CX1, TER - 0.55, TER, CZ0, NZ + 0.45, 3);
  k.slab(S2, CX0, WX + 0.45, TER - 0.55, TER, NZ + 0.45, WT, 3);
  const pillar = (x: number, z: number) => {
    k.slab(roman, x - 0.55, x + 0.55, 0, 1.1, z - 0.55, z + 0.55, 1.5);         // the Roman pier's base
    k.cyl(S, x, 1.1, z, 0.34, TER - 1.75, 10);                                   // the Victorian pillar
    k.slab(S2, x - 0.42, x + 0.42, TER - 0.65, TER - 0.45, z - 0.42, z + 0.42, 1);
  };
  for (const x of NCOL) pillar(x, NZ);
  pillar(WX, WT - 0.2);
  // pilasters and doorways round the court's walls, behind the walk
  for (const x of NCOL) {
    k.slab(S2, x - 0.4, x + 0.4, 0, TER - 0.55, CZ0, CZ0 + 0.25);
    if (x < CX1 - 2) k.quad(arched, x + 2, 1.9, CZ0 + 0.27, 1.6, 3.4);
    k.slab(S2, x - 0.4, x + 0.4, -0.3, TER, PZ1 - 0.25, PZ1);
  }
  for (const z of [-12, -8, -4, 0]) k.slab(S2, CX1, CX1 + 0.25, -0.3, TER, z - 0.4, z + 0.4);
  // the stairs up from the Roman level to the terrace, against the west wall
  for (let i = 1; i <= STAIR.n; i++) {
    const z1 = STAIR.z0 - STAIR.step * (i - 1), z0 = z1 - STAIR.step;
    k.slab(S2, STAIR.x0, STAIR.x1, -0.3, STAIR.rise * i, z0, z1, 1.5);
  }
  // balustrades round the terrace's edges, with the statues on their pedestals
  const balustrade = (a: [number, number], b: [number, number]) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), ry = Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
    k.quad(bal, (a[0] + b[0]) / 2, TER + 0.5, (a[1] + b[1]) / 2, len, 1.0, ry, 0, 0, len / 1.6, 1);
    k.beam(S2, [a[0], TER + 1.05, a[1]], [b[0], TER + 1.05, b[1]], 0.3, 0.12, 1);
  };
  const emperor = (x: number, z: number, face: number) => {
    k.slab(S2, x - 0.4, x + 0.4, TER, TER + 1.15, z - 0.4, z + 0.4, 1);
    k.add(statue, figure(false, 0.95), x, TER + 1.15, z, face);
  };
  balustrade([WX + 0.2, NZ + 0.2], [CX1, NZ + 0.2]);
  balustrade([WX + 0.2, NZ + 0.2], [WX + 0.2, WT - 0.2]);
  balustrade([STAIR.x1, WT - 0.2], [WX + 0.2, WT - 0.2]);
  balustrade([PX0, PZ1 + 0.2], [CX1, PZ1 + 0.2]);
  balustrade([CX1 + 0.2, NZ + 0.2], [CX1 + 0.2, PZ1]);
  balustrade([PX0 - 0.2, SW + 0.2], [PX0 - 0.2, PZ1]);
  balustrade([STAIR.x1, SW + 0.2], [PX0, SW + 0.2]);
  for (const x of NCOL) if (x > WX) emperor(x, NZ + 0.2, 0);
  emperor(WX + 0.2, WT - 0.2, -Math.PI / 2);
  for (const x of [-10, -2, 6]) emperor(x, PZ1 + 0.2, Math.PI);
  emperor(CX1 + 0.2, -4, Math.PI / 2);

  // ---- the ranges round it, and the Concert Room --------------------------------------------------
  for (const [x0, x1, z0, z1, top] of RANGES) {
    k.slab(G, x0, x1, -2, top, z0, z1, 3.4);
    k.slab(S2, x0 - 0.15, x1 + 0.15, top, top + 0.3, z0 - 0.15, z1 + 0.15);
  }
  // balustrades along the tops of the street fronts
  const roofBal = (x: number, z: number, len: number, y: number, ry: number) => k.quad(bal, x, y + 0.75, z, len, 0.9, ry, 0, 0, len / 1.6, 1);
  roofBal(-5.15, 10.0, 45.7, 9.0, 0);
  roofBal(17.7, -4.8, 29.6, 9.0, Math.PI / 2);
  roofBal(-45.5, -10.5, 18.2, 9.5, Math.PI / 2);
  // the colonnade along Stall Street under the floor over it
  for (let z = -18.8; z <= -2.2; z += 3.3) { k.cyl(S, -45.0, 1.2, z, 0.3, 5.4, 10); k.slab(S2, -45.4, -44.6, 6.6, 6.9, z - 0.4, z + 0.4, 1); }
  k.slab(G, -45.5, -43.5, 6.9, 9.5, -19.6, -1.4, 3.4);

  // the Pump Room
  {
    const [x0, x1, z0, z1, top] = PUMP, zf = z0;
    k.slab(S, x0, x1, -2, top, z0, z1, 3);
    k.slab(S2, x0 - 0.2, x1 + 0.2, top - 1.2, top - 0.8, zf - 0.3, z1 + 0.2);
    k.quad(bal, (x0 + x1) / 2, top + 0.45, zf - 0.1, x1 - x0, 0.9, Math.PI, 0, 0, (x1 - x0) / 1.6, 1);
    // seven bays to the churchyard: tall round-headed windows over smaller ones, and in the
    // middle three the portico: four Corinthian columns, the frieze and the pediment
    const bay = (x1 - x0) / 7;
    for (let b = 0; b < 7; b++) {
      const x = x0 + bay * (b + 0.5);
      k.quad(arched, x, HALL + 7.2, zf - 0.03, 2.1, 5.0, Math.PI);
      if (b !== 3) k.quad(sash, x, HALL + 2.4, zf - 0.03, 1.4, 2.3, Math.PI);
    }
    k.quad(dark, (x0 + x1) / 2, HALL + 1.7, zf - 0.03, 2.2, 3.4, Math.PI);
    const pc = (x0 + x1) / 2, pw = bay * 3;
    for (let c = 0; c < 4; c++) {
      const x = pc - pw / 2 + (pw * (c + 0.5)) / 4;
      k.slab(S2, x - 0.85, x + 0.85, HALL - 0.6, HALL + 1.0, zf - 1.15, zf);
      k.cyl(S, x, HALL + 1.0, zf - 0.45, 0.62, 9.8, 12);
      k.slab(S2, x - 0.8, x + 0.8, HALL + 10.8, HALL + 11.3, zf - 1.2, zf + 0.1);
    }
    k.slab(S, pc - pw / 2 - 0.5, pc + pw / 2 + 0.5, HALL + 11.3, HALL + 12.7, zf - 1.3, zf);
    k.quad(lettering("ΑΡΙΣΤΟΝ ΜΕΝ ΥΔΩΡ", { w: 512, h: 48, bg: "#dcc79a", ink: "#5a4a32" }), pc, HALL + 12.0, zf - 1.32, pw * 0.8, 0.75, Math.PI);
    pediment(k, S2, pc, HALL + 12.7, zf - 0.7, pw + 1.2, 2.8);
    // its colonnade at the churchyard's corner, along Stall Street
    for (let z = zf - 1.0; z >= zf - 15.5; z -= 1.72) k.cyl(S, x0 - 0.9, HALL - 0.6, z, 0.3, 5.9, 10);
    k.slab(S2, x0 - 1.6, x0 - 0.2, HALL + 5.3, HALL + 6.4, zf - 16, zf);
    k.quad(bal, x0 - 0.9, HALL + 6.85, zf - 8, 16, 0.9, Math.PI / 2, 0, 0, 10, 1);
  }

  // the Concert Room: the way in, under its glass dome
  {
    const [x0, x1, z0, z1, top] = HALLW, mx = (x0 + x1) / 2, T = 0.8;
    for (const [a, b] of [[x0, x0 + T], [x1 - T, x1]]) k.slab(S, a, b, -2, top, z0, z1, 3);
    const front = new THREE.Shape(), door = new THREE.Path();
    front.moveTo(x0, -2); front.lineTo(x1, -2); front.lineTo(x1, top); front.lineTo(x0, top); front.closePath();
    door.moveTo(mx - 1.6, HALL - 0.1); door.lineTo(mx - 1.6, HALL + 3.6); roundArch(door, mx, HALL + 3.6, 3.2, 1.6); door.lineTo(mx + 1.6, HALL - 0.1); door.closePath();
    front.holes.push(door);
    k.shape(S, front, T, 0, 0, z0 + T / 2, 0, 3);
    for (const x of [mx - 2.6, mx + 2.6]) k.cyl(S, x, HALL - 0.2, z0 - 0.5, 0.42, 6.2, 12);
    k.slab(S2, mx - 3.4, mx + 3.4, HALL + 6.0, HALL + 6.8, z0 - 1.0, z0);
    k.quad(lettering("ROMAN BATHS", { w: 512, h: 64, bg: "#2a2622", ink: "#e2c477" }), mx, HALL + 7.6, z0 - 0.03, 5.2, 0.7, Math.PI);
    for (const x of [x0 + 2.2, x1 - 2.2]) { k.quad(arched, x, HALL + 2.6, z0 - 0.03, 1.6, 3.6, Math.PI); k.quad(arched, x, HALL + 9.2, z0 - 0.03, 1.6, 3.6, Math.PI); }
    k.quad(arched, mx, HALL + 10.6, z0 - 0.03, 2.2, 4.4, Math.PI);
    k.quad(bal, mx, top + 0.45, z0 - 0.05, x1 - x0, 0.9, Math.PI, 0, 0, (x1 - x0) / 1.6, 1);
    // inside: the floor, the steps up to the terrace, the ceiling, and the roof with the dome
    k.slab(floor, x0 + T, x1 - T, HALL - 0.6, HALL, z0 + T, z1 - 2.4, 2.5);
    for (let i = 1; i <= 3; i++) k.slab(S2, x0 + T, x1 - T, HALL - 0.6, HALL + 0.4 * i, z1 - 2.4 + 0.8 * (i - 1), z1 - 2.4 + 0.8 * i, 1.5);
    k.slab(S, x0 + T, x1 - T, 11.6, 12.2, z0 + T, z1, 3);
    k.slab(lead, x0, x1, top - 0.6, top, z0, z1, 3);
    const dz = (z0 + z1) / 2;
    k.cyl(S, mx, top, dz, 4.3, 1.4, 20);
    const dome = new THREE.SphereGeometry(4.1, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    dome.scale(1, 0.85, 1);
    k.add(glass, dome, mx, top + 1.4, dz);
    for (let a = 0; a < 8; a++) k.beam(S2, [mx + Math.cos(a * Math.PI / 4) * 4.15, top + 1.4, dz + Math.sin(a * Math.PI / 4) * 4.15], [mx, top + 1.4 + 3.45, dz], 0.18, 0.18, 1);
    k.cyl(S2, mx, top + 4.7, dz, 0.6, 1.4, 8);
  }

  const grp = k.build();
  for (const m of [arched, sash, glass]) glow(grp, m as THREE.MeshLambertMaterial, 0, 0.8);
  glow(grp, G as THREE.MeshLambertMaterial, 0, 0.9);
  // the water stirs, and steams
  const ripple = water.map!;
  grp.traverse((o) => { if ((o as THREE.Mesh).material === water) o.onBeforeRender = () => { const t = performance.now() / 1000; ripple.offset.set(Math.sin(t * 0.21) * 0.3, t * 0.015); }; });
  grp.add(steam());
  return grp;
}

/** A pediment: a low triangle of stone w wide and rise high on top of y, its middle at x, z. */
function pediment(k: Kit, mat: THREE.Material, x: number, y: number, z: number, w: number, rise: number) {
  const s = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, rise)]);
  k.shape(mat, s, 1.0, x, y, z, 0, 1.5);
}

/** Light wavelets on the green water, to scroll slowly across it. */
let rippleTex: THREE.Texture | null = null;
function ripples(): THREE.Texture {
  if (rippleTex) return rippleTex;
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#cfd8c8"; g.fillRect(0, 0, 128, 128);
  let s = 5;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 90; i++) {
    g.strokeStyle = `rgba(255,255,240,${0.25 + r() * 0.35})`; g.lineWidth = 1.5;
    const x = r() * 128, y = r() * 128, w = 6 + r() * 14;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + w / 2, y - 2, x + w, y); g.stroke();
  }
  rippleTex = new THREE.CanvasTexture(c);
  rippleTex.wrapS = rippleTex.wrapT = THREE.RepeatWrapping;
  rippleTex.repeat.set(4, 2);
  rippleTex.colorSpace = THREE.SRGBColorSpace;
  return rippleTex;
}

/** Wisps of steam drifting up off the water and fading. */
function steam(): THREE.Object3D {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d")!, grd = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grd.addColorStop(0, "rgba(255,255,255,0.55)"); grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const mat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, opacity: 0.5 });
  const grp = new THREE.Group();
  const puffs = Array.from({ length: 6 }, (_, i) => {
    const sp = new THREE.Sprite(mat);
    sp.userData = { x: PX0 + 3.5 + i * 3.6 + (i % 2) * 1.2, z: PZ0 + 2 + ((i * 5) % 8), t: i / 6 };
    grp.add(sp);
    return sp;
  });
  puffs[0].onBeforeRender = () => {
    const now = performance.now() / 1000;
    for (const sp of puffs) {
      const u = sp.userData, f = (now * 0.08 + u.t) % 1;
      sp.position.set(u.x + Math.sin(now * 0.3 + u.t * 6) * 0.6, WATER + 0.3 + f * 4.5, u.z);
      sp.scale.setScalar(2.2 + f * 4);
      sp.material.opacity = 0.45 * Math.sin(f * Math.PI);
    }
  };
  return grp;
}

/** The ground the Baths lower (setpieces.ts), in their frame, and how low, above the Roman level. */
export const BATHS_SINK = [
  { x0: CX0, x1: CX1, z0: CZ0, z1: PZ1, y: -0.1 },
  { x0: PX0, x1: PX1, z0: PZ0, z1: PZ1, y: BED },
  { x0: HALLW[0], x1: HALLW[1], z0: HALLW[2], z1: HALLW[3], y: HALL - 0.1 },
];
