// The Skyline gate, as a set piece (landmarks/setpieces.ts) in place of the fences the map tools
// build there: the gateway on the Bath Skyline path between Prior Park and Rainbow Wood, where the
// path out of the wood meets the top of the fields, and Bath opens out below, framed by the trees.
// Two old square stone piers stand either side of the path along the field's edge, with low
// pyramid caps on overhanging slabs. The far one still holds an iron gate of upright bars, left open
// against the hedge; the near one is the corner of the field. From it, low estate railings of
// flat iron bars run on along the path's field side, and back the other way along the field's edge
// are a galvanised five-bar field gate, its hanging end peaked, and a kissing gate with its round
// cage of hoops on the field side, a waymarker post beside it, then a wire fence on wooden posts.
// Out in the field, a sawn stump and the trunk it came from, lying in the grass.
//
// Its frame: origin the middle of the near pier, at the ground there; x runs north-east along the
// path between the piers, z out to the south-east (the wood), so the field is on the -z side; y up.
// The ground is uneven here, so its builder is handed how high the ground is at each of the points
// in SAMPLES, worked out where it stands (skylineArgs), and every post stands on its own ground.
// Solid as it's drawn (landmarks/shape.ts), but for the kissing gate's cage and leaf, which you
// push through as if they swung: you climb the field gate, as anywhere else.
import * as THREE from "three";
import { Kit, stone, plain } from "./kit";
import * as TX from "../textures";
import type { PlaceCtx } from "./setpieces";

type XZ = [number, number];

/** Along the field's edge from the near pier, south-west to the kissing gate (in its frame). */
const U: XZ = [-0.7547, -0.6561];
/** Out into the field from that edge. */
const N: XZ = [0.6561, -0.7547];
/** The turn of that edge (the gates' run), for boxes laid along it: their x runs from the kissing
 *  gate up to the pier, and their +z looks into the wood. */
const GATE_RY = -Math.atan2(-U[1], -U[0]);
/** A point s metres along the field's edge from the pier, p metres out into the field. */
const on = (s: number, p = 0): XZ => [U[0] * s + N[0] * p, U[1] * s + N[1] * p];

/** The railings' run: from the near pier's far face, along the path, to where the map's own fence
 *  along the field's edge carries on. */
const RAIL_A: XZ = [0.4, -0.1], RAIL_B: XZ = [44.7, -1.24];
/** The wire fence's run: from the post past the kissing gate to the corner where the map's own
 *  fence carries on along the field's foot. */
const WIRE_A: XZ = on(7.05), WIRE_B: XZ = [-11.76, -9.19];
const RAIL_N = Math.round(Math.hypot(RAIL_B[0] - RAIL_A[0], RAIL_B[1] - RAIL_A[1]) / 1.85);
const WIRE_N = Math.ceil(Math.hypot(WIRE_B[0] - WIRE_A[0], WIRE_B[1] - WIRE_A[1]) / 2.6);
const lerp = (a: XZ, b: XZ, t: number): XZ => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** The far pier, across the path. */
const PIER2: XZ = [0.1, 3.7];
/** The stump and the fallen trunk, out in the field. */
const STUMP: XZ = [5.3, -21.5], LOG: XZ = [3.2, -21.9];

/** Where the builder needs the ground's height, in this order: the railings' posts, the wire
 *  fence's posts, then the field gate, the kissing gate, the far pier, the waymarker, the stump and
 *  the trunk. */
export const SKYLINE_SAMPLES: XZ[] = [
  ...Array.from({ length: RAIL_N + 1 }, (_, i) => lerp(RAIL_A, RAIL_B, i / RAIL_N)),
  ...Array.from({ length: WIRE_N + 1 }, (_, i) => lerp(WIRE_A, WIRE_B, i / WIRE_N)),
  on(2.95), on(6.0), PIER2, on(7.35, -0.7), STUMP, LOG,
];

/** The builder's args where it stands: the ground at each of SKYLINE_SAMPLES, above its origin. */
export const skylineArgs = (c: PlaceCtx, h: number) => SKYLINE_SAMPLES.map(([x, z]) => +(c.groundAt(x, z) - h).toFixed(2));

/** A waymarker's face: the footpath's, the bridleway's and the Skyline walk's discs. */
function waymarkTex(): THREE.Texture {
  const [c, g] = TX.canvas(32, 128);
  g.fillStyle = "#2c2721"; g.fillRect(0, 0, 32, 128);
  const disc = (y: number, bg: string, ink: string, arrow: boolean) => {
    g.fillStyle = bg; g.beginPath(); g.arc(16, y, 12, 0, Math.PI * 2); g.fill();
    g.fillStyle = ink;
    if (arrow) { g.beginPath(); g.moveTo(16, y - 8); g.lineTo(23, y); g.lineTo(18.5, y); g.lineTo(18.5, y + 8); g.lineTo(13.5, y + 8); g.lineTo(13.5, y); g.lineTo(9, y); g.closePath(); g.fill(); }
    else { g.beginPath(); g.arc(16, y, 5, 0, Math.PI * 2); g.fill(); }
  };
  disc(20, "#d9d5c8", "#3f5a3a", false);
  disc(50, "#e2c23c", "#2c2721", true);
  disc(80, "#3d6fb0", "#f1efe6", true);
  return TX.tex(c);
}

export function skylineGate(args: (number | string)[]): THREE.Object3D {
  const k = new Kit();
  const at = (i: number) => +(args[i] ?? 0) || 0;
  const S = stone("#bdb59c"), S2 = stone("#a9a38b"), S3 = stone("#9a9580");
  const iron = plain("#2b2e2c"), rusty = plain("#3b3631"), wood = plain("#6b5a44"), fresh = plain("#b99d63");
  const wire = plain("#5b605d"), bark = plain("#4d443a"), deadwood = plain("#9d968a");
  // the kissing gate swings: its cage and leaf are drawn, not bumped into
  const swing = plain("#2b2e2c");
  swing.userData.ghost = true;
  const way = new THREE.MeshLambertMaterial({ map: waymarkTex() });

  let n = 0;
  const railY = SKYLINE_SAMPLES.slice(n, n += RAIL_N + 1).map((_, i) => at(i));
  const wireY = SKYLINE_SAMPLES.slice(n, n += WIRE_N + 1).map((_, i) => at(RAIL_N + 1 + i));
  const [gateY, kissY, pier2Y, wayY, stumpY, logY] = [0, 1, 2, 3, 4, 5].map((i) => at(n + i));

  // ---- the piers ---------------------------------------------------------------------------------
  // big weathered blocks, an overhanging slab on top and a low pyramid cap; sunk a little into the
  // ground, which falls away round them
  const pier = (x: number, z: number, y: number) => {
    k.slab(S, x - 0.39, x + 0.39, y - 0.45, y + 2.2, z - 0.39, z + 0.39, 1.4);
    k.slab(S3, x - 0.42, x + 0.42, y + 2.2, y + 2.28, z - 0.42, z + 0.42, 1);
    k.slab(S2, x - 0.5, x + 0.5, y + 2.28, y + 2.42, z - 0.5, z + 0.5, 1);
    k.cyl(S2, x, y + 2.42, z, 0.66, 0.3, 4, 0.07, 1);
  };
  pier(0, 0, 0);
  pier(PIER2[0], PIER2[1], pier2Y);
  // the slot of an old iron fitting in the near pier's field side, and the far pier's hinge irons
  k.slab(iron, -0.12, 0.12, 1.25, 1.31, -0.4, -0.38, 1);
  for (const y of [0.35, 1.55]) k.slab(iron, PIER2[0] + 0.28, PIER2[0] + 0.45, pier2Y + y, pier2Y + y + 0.06, PIER2[1] - 0.47, PIER2[1] - 0.36, 1);

  // the old iron gate on the far pier, left open along the path's edge: upright bars between
  // three rails, hung from the pier's corner
  {
    const hx = PIER2[0] + 0.45, hz = PIER2[1] - 0.42, y = pier2Y, W = 2.3, a = 0.2;
    const ex = hx + Math.cos(a) * W, ez = hz - Math.sin(a) * W;
    for (const r of [0.12, 1.0, 1.78]) k.beam(rusty, [hx, y + r, hz], [ex, y + r, ez], 0.03, 0.04);
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      k.box(rusty, hx + (ex - hx) * t, y + 0.05, hz + (ez - hz) * t, 0.025, 1.85, 0.025, a, 1);
    }
  }

  // ---- the estate railings along the path --------------------------------------------------------
  for (let i = 0; i <= RAIL_N; i++) {
    const [x, z] = lerp(RAIL_A, RAIL_B, i / RAIL_N), y = railY[i];
    k.box(rusty, x, y - 0.3, z, 0.05, 1.45, 0.025, 0, 1);
    if (i === RAIL_N) break;
    const [x2, z2] = lerp(RAIL_A, RAIL_B, (i + 1) / RAIL_N), y2 = railY[i + 1];
    for (const r of [0.22, 0.44, 0.66, 0.88, 1.1]) k.beam(rusty, [x, y + r, z], [x2, y2 + r, z2], 0.018, 0.018);
  }

  // ---- the field gate and its posts --------------------------------------------------------------
  {
    const y = gateY, s0 = 1.12, s1 = 4.78;   // its latch end by the pier, its hanging end by the kissing gate
    const pt = (s: number, h: number, p = 0): [number, number, number] => { const [x, z] = on(s, p); return [x, y + h, z]; };
    for (const r of [0.14, 0.36, 0.58, 0.82, 1.06]) k.beam(iron, pt(s0, r), pt(s1 - 0.02, r), 0.035, 0.035);
    for (const s of [s0, s0 + 1.2, s0 + 2.4]) { const [x, z] = on(s); k.box(iron, x, y + 0.1, z, 0.035, 1.0, 0.035, GATE_RY, 1); }
    // the hanging stile, taller, with its peaked head and the brace down from it to the latch end's foot
    { const [x, z] = on(s1); k.box(iron, x, y + 0.1, z, 0.05, 1.32, 0.05, GATE_RY, 1); }
    k.beam(iron, pt(s1, 1.42), pt(s1 - 0.6, 1.06), 0.035, 0.035);
    k.beam(iron, pt(s1, 1.38), pt(s0 + 0.05, 0.16), 0.03, 0.03);
    // the latch post, the two hoops of the hand-latch beside it, and the weathered stone post
    { const [x, z] = on(1.0); k.cyl(iron, x, y - 0.3, z, 0.055, 1.6, 8); }
    for (const [s, h] of [[0.58, 1.05], [0.78, 1.18]]) {
      const [x, z] = on(s, -0.08);
      const g = new THREE.TorusGeometry(0.07, 0.016, 4, 8, Math.PI);
      k.add(iron, g, x, y + h, z, GATE_RY);
      for (const d of [-0.07, 0.07]) { const [xx, zz] = on(s + d, -0.08); k.cyl(iron, xx, y - 0.2, zz, 0.016, h + 0.2, 6); }
    }
    { const [x, z] = on(0.82, 0.32); k.box(S2, x, y - 0.3, z, 0.3, 1.45, 0.28, GATE_RY, 1); k.add(S2, new THREE.SphereGeometry(0.15, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.7, 0.93), x, y + 1.15, z, GATE_RY); }
    // the hanging post, and the kissing gate's posts either side of its opening
    { const [x, z] = on(4.9); k.cyl(iron, x, y - 0.3, z, 0.065, 1.8, 8); }
    for (const s of [5.08, 6.92]) { const [x, z] = on(s); k.cyl(iron, x, kissY - 0.3, z, 0.05, 1.5, 8); }
  }

  // ---- the kissing gate ------------------------------------------------------------------------------
  // its cage of hoops, a half-round on the field side, and the leaf with its mesh, swung into it
  {
    const [cx, cz] = on(6.0), y = kissY, R = 0.84;
    for (const h of [0.3, 0.6, 0.9, 1.12]) {
      const g = new THREE.TorusGeometry(R, 0.016, 4, 18, Math.PI);
      g.rotateX(-Math.PI / 2);
      k.add(swing, g, cx, y + h, cz, GATE_RY);
    }
    for (const a of [Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4]) {
      const [x, z] = on(6.0 - Math.cos(a) * R, Math.sin(a) * R);
      k.cyl(swing, x, y - 0.2, z, 0.02, 1.34, 6);
    }
    const [hx, hz] = on(5.12), [ex, ez] = on(6.0, R - 0.06);
    const pts = (t: number, h: number): [number, number, number] => [hx + (ex - hx) * t, y + h, hz + (ez - hz) * t];
    for (const h of [0.12, 0.62, 1.08]) k.beam(swing, pts(0, h), pts(1, h), 0.03, 0.03);
    for (const t of [0, 1]) k.beam(swing, pts(t, 0.1), pts(t, 1.1), 0.035, 0.035);
    for (let i = 1; i < 8; i++) k.beam(swing, pts(i / 8, 0.12), pts(i / 8, 0.62), 0.008, 0.008);
    for (const h of [0.25, 0.37, 0.5]) k.beam(swing, pts(0, h), pts(1, h), 0.008, 0.008);
  }

  // ---- the waymarker ---------------------------------------------------------------------------------
  {
    const [x, z] = on(7.35, -0.7), y = wayY;
    k.box(plain("#2c2721"), x, y - 0.3, z, 0.125, 1.44, 0.125, GATE_RY, 1);
    k.quad(way, x - N[0] * 0.066, y + 0.72, z - N[1] * 0.066, 0.1, 0.4, GATE_RY);
  }

  // ---- the wire fence on wooden posts ----------------------------------------------------------------
  for (let i = 0; i <= WIRE_N; i++) {
    const [x, z] = lerp(WIRE_A, WIRE_B, i / WIRE_N), y = wireY[i];
    k.box(i === 2 ? fresh : wood, x, y - 0.35, z, 0.11, 1.55, 0.11, GATE_RY, 1);
    if (i === WIRE_N) break;
    const [x2, z2] = lerp(WIRE_A, WIRE_B, (i + 1) / WIRE_N), y2 = wireY[i + 1];
    for (const r of [0.2, 0.45, 0.72, 1.0]) k.beam(wire, [x, y + r, z], [x2, y2 + r, z2], 0.012, 0.012);
  }

  // ---- out in the field: the stump, and the trunk lying beside it ----------------------------------------
  k.cyl(bark, STUMP[0], stumpY - 0.3, STUMP[1], 0.36, 1.25, 10, 0.32);
  k.cyl(deadwood, STUMP[0], stumpY + 0.95, STUMP[1], 0.32, 0.02, 10);
  k.add(deadwood, new THREE.CylinderGeometry(0.28, 0.34, 4.6, 9), LOG[0], logY + 0.2, LOG[1], 0.35, 0, 0, Math.PI / 2);
  for (const [dx, dz, r] of [[1.6, 0.9, 0.22], [-2.1, -0.4, 0.17], [0.4, 1.4, 0.14]]) {
    k.add(S3, new THREE.DodecahedronGeometry(r, 0).scale(1.4, 0.6, 1), LOG[0] + dx, logY + r * 0.2, LOG[1] + dz);
  }

  return k.build();
}
