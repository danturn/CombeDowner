// Bradford-on-Avon's station, as a set piece (landmarks/setpieces.ts) in place of the plain block the
// map tools build over its platforms. A Jacobean station house on the up platform, steep coped
// gables with finials, tall paired chimneys and a little canopy over the platform; a stone waiting
// room with a canopy on the down side; and the footbridge between them, with lamps, benches and
// running-in boards along the platforms.
//
// The platforms themselves stay the railway's (railway.ts draws them from the map's rail file and
// you stand on them there): what's here stands on them. The frame: x along the line (eastwards), z
// across it (southwards, so the tracks are near z = 0 and the main building on the north side, at
// -z), y up from the top of the up platform. Solid as drawn (landmarks/shape.ts): you walk under the
// canopies and up the footbridge's stairs.
//
// Bath Spa's station is not here: that one is landmarks/bathspa.ts, its own file.
import * as THREE from "three";
import { Kit, stone, plain, slate, gothicGlass, flags, glow, lettering } from "./kit";
import * as TX from "../textures";

type V3 = [number, number, number];
type Line = [number, number][];

// ---- what a station is made of ----------------------------------------------------------------


/** z at x along a line of [x, z] points (in order of x), held level beyond its ends. */
function along(line: Line, x: number): number {
  if (x <= line[0][0]) return line[0][1];
  for (let i = 1; i < line.length; i++) {
    const [x0, z0] = line[i - 1], [x1, z1] = line[i];
    if (x <= x1) return x1 - x0 < 1e-6 ? z1 : z0 + ((z1 - z0) * (x - x0)) / (x1 - x0);
  }
  return line[line.length - 1][1];
}

// ---- what both stations are made of ---------------------------------------------------------------

/** The Great Western's valance: a board along a canopy's edge cut into a row of daggers, one
 *  repeat 1.2 m along. */
function valance(tint: string) {
  const [c, g] = TX.canvas(128, 64);
  g.fillStyle = "#f0e6cf"; g.fillRect(0, 0, 128, 30);
  g.fillStyle = "#cdbf9f"; g.fillRect(0, 0, 128, 5);
  g.fillStyle = "#f0e6cf";
  for (let k = 0; k < 8; k++) { const x = k * 16; g.beginPath(); g.moveTo(x, 29); g.lineTo(x + 16, 29); g.lineTo(x + 8, 63); g.closePath(); g.fill(); }
  const t = TX.pixelTex(c, 64, 32, 16, 5, true);
  return new THREE.MeshLambertMaterial({ map: t, color: tint, side: THREE.DoubleSide, alphaTest: 0.5 });
}

/** Iron lattice for a footbridge's sides, cut out; one repeat 1.4 m along and its height up. */
function lattice() {
  const [c, g] = TX.canvas(64, 64);
  g.strokeStyle = "#fff"; g.lineWidth = 5;
  g.strokeRect(0, 0, 64, 64);
  g.lineWidth = 4;
  g.beginPath(); g.moveTo(0, 0); g.lineTo(64, 64); g.moveTo(64, 0); g.lineTo(0, 64); g.stroke();
  const t = TX.pixelTex(c, 32, 32, 12, 7, true);
  return new THREE.MeshLambertMaterial({ map: t, color: "#33473c", side: THREE.DoubleSide, alphaTest: 0.5 });
}

/** A plain steep coped gable (a triangle), w wide and h high. */
function copedGable(w: number, h: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.closePath();
  return s;
}

/** The pieces of a station, laid out in its frame and merged by material (kit.ts). */
class Station {
  k = new Kit();
  S = stone("#e6d2a6"); S2 = stone("#cdb88c"); roof = slate();
  win = gothicGlass(false, true, 3); dark = plain("#2b2622");
  iron = plain("#2f4a3a"); under = plain("#bdb5a5", { side: THREE.DoubleSide });
  val = valance("#efe4cb"); wood = plain("#6b4a32"); lat = lattice();
  lamp = plain("#fff3c4", { emissive: "#ffd27a", emissiveIntensity: 0 });
  paving = flags();
  constructor(readonly name: string) {}

  /** Quads (four corners each, in order round) into one geometry; uv by size, tile metres a
   *  repeat, or given per corner. */
  quads(mat: THREE.Material, list: V3[][], tile = 2, uvs?: [number, number][][]) {
    const pos: number[] = [], uv: number[] = [];
    list.forEach((q, n) => {
      for (const i of [0, 1, 2, 0, 2, 3]) {
        pos.push(...q[i]);
        if (uvs) uv.push(...uvs[n][i]);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs ? uv : new Array((pos.length / 3) * 2).fill(0), 2));
    g.computeVertexNormals();
    this.k.add(mat, g, 0, 0, 0, 0, uvs ? 0 : tile);
  }

  /** A platform canopy from x0 to x1: its front edge in from the platform's edge (front), its back
   *  at back (or no deeper than deep), its eaves h up, columns down the middle every few bays.
   *  side: +1 for a platform south of its track (front at the smaller z), -1 north of it; foot:
   *  the platform's top. */
  canopy(x0: number, x1: number, front: Line, back: Line, side: number, h: number, deep = 9, foot = 0) {
    const k = this.k, n = Math.max(1, Math.round((x1 - x0) / 4.5)), bay = (x1 - x0) / n;
    const at = (x: number) => {
      const f = along(front, x) + side * 0.55;
      let b = along(back, x);
      if ((b - f) * side > deep) b = f + side * deep;
      return { f, b, m: (f + b) / 2 };
    };
    const roofs: V3[][] = [], vals: V3[][] = [], vuv: [number, number][][] = [];
    for (let i = 0; i < n; i++) {
      const xa = x0 + i * bay, xb = xa + bay, A = at(xa), B = at(xb);
      // a shallow ridge down the middle
      roofs.push([[xa, h, A.f], [xb, h, B.f], [xb, h + 0.45, B.m], [xa, h + 0.45, A.m]]);
      roofs.push([[xa, h + 0.45, A.m], [xb, h + 0.45, B.m], [xb, h + 0.2, B.b], [xa, h + 0.2, A.b]]);
      // the valance along the front
      vals.push([[xa, h - 0.6, A.f], [xb, h - 0.6, B.f], [xb, h + 0.05, B.f], [xa, h + 0.05, A.f]]);
      const u0 = (i * bay) / 1.2, u1 = ((i + 1) * bay) / 1.2;
      vuv.push([[u0, 0], [u1, 0], [u1, 1], [u0, 1]]);
      // a beam down the middle
      k.beam(this.iron, [xa, h - 0.1, A.m], [xb, h - 0.1, B.m], 0.18, 0.25);
    }
    // columns with brackets every other bay, and at the far end
    const cols: number[] = [];
    for (let i = 0; i <= n; i += 2) cols.push(x0 + i * bay);
    if (n % 2) cols.push(x1);
    for (const x of cols) {
      const P = at(x);
      k.cyl(this.iron, x, foot, P.m, 0.12, h - 0.1 - foot, 8);
      k.cyl(this.iron, x, foot, P.m, 0.2, 0.5, 8);
      k.beam(this.iron, [x, h - 0.9, P.m], [x, h - 0.05, P.f], 0.1, 0.12);
      k.beam(this.iron, [x, h - 0.9, P.m], [x, h + 0.1, P.b], 0.1, 0.12);
    }
    // the ends: valances across from front to back
    for (const [x, P] of [[x0, at(x0)], [x1, at(x1)]] as [number, ReturnType<typeof at>][]) {
      const d = Math.abs(P.b - P.f) / 1.2;
      vals.push([[x, h - 0.6, P.f], [x, h - 0.6, P.b], [x, h + 0.2, P.b], [x, h + 0.05, P.f]]);
      vuv.push([[0, 0], [d, 0], [d, 1], [0, 1]]);
    }
    this.quads(this.under, roofs, 2);
    this.quads(this.val, vals, 0, vuv);
  }

  /** A footbridge across the line at x, from z0 to z1, its deck top up; its stairs come down onto
   *  the platforms along their backs: each [the deck's side it leaves from (-1: -x, +1: +x), the
   *  middle of its width (z), and the platform's top there]. */
  footbridge(x: number, z0: number, z1: number, up: number, stairs: [number, number, number][]) {
    const k = this.k, W = 1.1, SW = 0.9;
    k.slab(this.iron, x - W, x + W, up - 0.4, up, z0, z1, 2);
    k.slab(this.wood, x - W + 0.05, x + W - 0.05, up, up + 0.04, z0, z1, 2);
    // the sides: lattice, with an opening where each stair leaves
    for (const s of [-1, 1]) {
      const gaps = stairs.filter((q) => q[0] === s).map((q) => [q[1] - SW, q[1] + SW]).sort((a, b) => a[0] - b[0]);
      let from = z0;
      for (const [g0, g1] of [...gaps, [z1, z1]]) {
        if (g0 > from + 0.05) {
          this.quads(this.lat, [[[x + s * W, up, from], [x + s * W, up, g0], [x + s * W, up + 1.3, g0], [x + s * W, up + 1.3, from]]], 0,
            [[[0, 0], [(g0 - from) / 1.4, 0], [(g0 - from) / 1.4, 1], [0, 1]]]);
          k.slab(this.iron, x + s * W - 0.06, x + s * W + 0.06, up + 1.3, up + 1.4, from, g0, 2);
        }
        from = g1;
      }
    }
    for (const z of [z0, z1]) {
      this.quads(this.lat, [[[x - W, up, z], [x + W, up, z], [x + W, up + 1.3, z], [x - W, up + 1.3, z]]], 0, [[[0, 0], [1.6, 0], [1.6, 1], [0, 1]]]);
      k.slab(this.iron, x - W, x + W, up + 1.3, up + 1.4, z - 0.06, z + 0.06, 2);
    }
    // the stairs: steps of a little under 0.18 m, each solid down to the platform, with a rail
    for (const [s, zm, foot] of stairs) {
      const rise = up - foot, n = Math.ceil(rise / 0.18), r = rise / n, go = 0.28;
      for (let i = 0; i < n; i++) {
        const top = up - i * r, xa = x + s * (W + i * go), xb = xa + s * go;
        k.slab(this.S2, Math.min(xa, xb), Math.max(xa, xb), foot - 1.5, top, zm - SW, zm + SW, 1.5);
      }
      const xe = x + s * (W + n * go);
      for (const z of [zm - SW, zm + SW]) {
        k.beam(this.iron, [x + s * W, up + 1.0, z], [xe, foot + 1.0, z], 0.06, 0.06);
        this.quads(this.lat, [[[x + s * W, up, z], [xe, foot, z], [xe, foot + 1.0, z], [x + s * W, up + 1.0, z]]], 0,
          [[[0, 0], [n * go / 1.4, 0], [n * go / 1.4, 0.75], [0, 0.75]]]);
      }
      // columns under the landing
      for (const z of [zm - SW, zm + SW]) for (const dx of [-W, W]) k.cyl(this.iron, x + dx, foot, z, 0.11, up - 0.4 - foot, 8);
    }
  }

  /** A Great Western lamp on its post, standing at (x, y, z). */
  lampPost(x: number, y: number, z: number) {
    const k = this.k;
    k.cyl(this.iron, x, y, z, 0.12, 0.6, 8, 0.08);
    k.cyl(this.iron, x, y + 0.6, z, 0.07, 2.6, 6);
    k.slab(this.iron, x - 0.28, x + 0.28, y + 3.15, y + 3.22, z - 0.05, z + 0.05, 1);
    k.box(this.lamp, x, y + 3.2, z, 0.34, 0.45, 0.34);
    k.cyl(this.iron, x, y + 3.65, z, 0.3, 0.3, 4, 0.04);
  }

  /** A platform bench at (x, y, z), its back to the side away from bz. */
  bench(x: number, y: number, z: number, bz: number) {
    const k = this.k, s = Math.sign(bz - z) || 1;
    k.slab(this.wood, x - 0.9, x + 0.9, y + 0.42, y + 0.48, z - 0.22, z + 0.22, 1);
    k.slab(this.wood, x - 0.9, x + 0.9, y + 0.55, y + 0.95, z + s * 0.22, z + s * 0.27, 1);
    for (const dx of [-0.75, 0.75]) k.slab(this.iron, x + dx - 0.04, x + dx + 0.04, y, y + 0.95, z - 0.2, z + 0.27 * (s > 0 ? 1 : -1), 1);
  }

  /** A running-in board with the station's name, on two posts at (x, y, z), facing the line;
   *  ry turns it with the platform's edge. */
  nameBoard(x: number, y: number, z: number, ry: number, w: number) {
    const k = this.k, name = lettering(this.name.toUpperCase(), { w: 1024, h: 128, bg: "#173e2c", ink: "#f4efe2", font: "bold 78px Gill Sans, Helvetica, Arial, sans-serif" });
    const cs = Math.cos(ry), sn = Math.sin(ry);
    for (const s of [-1, 1]) k.cyl(this.iron, x + cs * s * (w / 2 - 0.3), y, z - sn * s * (w / 2 - 0.3), 0.07, 2.6, 6);
    k.add(this.iron, new THREE.BoxGeometry(w + 0.2, 1.0, 0.1), x, y + 2.1, z, ry);
    for (const f of [1, -1]) k.quad(name, x + sn * f * 0.06, y + 2.1, z + cs * f * 0.06, w, 0.82, ry + (f < 0 ? Math.PI : 0));
  }

  /** A platform's number, on a sign at (x, y, z) high enough to walk under, its faces looking
   *  along the platform (ry turns them with it): hung on rods from a canopy roof roof metres up,
   *  or, with roof 0, on a post of its own. */
  platSign(n: number, x: number, y: number, z: number, ry: number, roof = 0) {
    const k = this.k, cs = Math.cos(ry), sn = Math.sin(ry), cy = y + 2.75;
    const font = "Gill Sans, Helvetica, Arial, sans-serif";
    const num = lettering(String(n), { w: 128, h: 128, bg: "#173e2c", ink: "#f4efe2", font: `bold 108px ${font}` });
    const word = lettering("PLATFORM", { w: 256, h: 64, bg: "#173e2c", ink: "#f4efe2", font: `bold 44px ${font}` });
    k.add(this.iron, new THREE.BoxGeometry(0.86, 1.06, 0.08), x, cy, z, ry);
    for (const f of [1, -1]) {
      const fx = x + sn * f * 0.045, fz = z + cs * f * 0.045, r = ry + (f < 0 ? Math.PI : 0);
      k.quad(word, fx, cy + 0.36, fz, 0.78, 0.2, r);
      k.quad(num, fx, cy - 0.1, fz, 0.66, 0.66, r);
    }
    if (roof > 0) for (const s of [-0.3, 0.3]) k.cyl(this.iron, x + cs * s, cy + 0.53, z - sn * s, 0.02, y + roof - cy - 0.53, 4);
    else k.cyl(this.iron, x, y, z, 0.07, cy - 0.53 - y, 6);
  }

  build(): THREE.Group {
    const grp = this.k.build();
    glow(grp, this.lamp, 0.1, 1.2);
    glow(grp, this.win, 0, 0.7);
    return grp;
  }
}

// ---- Bradford-on-Avon -------------------------------------------------------------------------

const N_FRONT: Line = [[-105, -4.3], [28.6, -4.2]];
const N_BACK: Line = [[-105.4, -6.5], [-69.7, -8.7], [-13.8, -8.6], [-13.7, -10.3], [-6.3, -10.7], [-6.3, -7.4], [9.8, -7.2], [9.8, -9.8], [28.4, -9.7]];
const S_FRONT: Line = [[-98, 2.2], [28.1, 2.0]];
const S_BACK: Line = [[-97.8, 6.0], [-37.5, 5.9], [-23.9, 7.8], [-10.4, 7.6], [-10.5, 5.6], [28.1, 5.7]];
const S_Y = 0.1;                                   // the down platform's top
const HX0 = -6.2, HX1 = 9.8, HZF = -7.2, HZB = -15.1, HE = 3.6;   // the station house
const WX0 = -8, WX1 = 8, WZF = 6.0, WZB = 9.8, WE = 3.2;          // the waiting room on the down side
const BOA_BRIDGE = -18.7;
/** Where Bradford-on-Avon's station is solid all through: the house and the waiting room. */
export const BOA_COVERS: [number, number, number, number][] = [[HX0, HX1, HZB, HZF], [WX0, WX1, WZF, WZB]];

export function bradfordStation(): THREE.Object3D {
  const st = new Station("Bradford-on-Avon"), k = st.k, S = st.S, S2 = st.S2;
  const FOOT = -1.8;

  // ---- the station house: one storey, steep slate roof, coped gables -------------------------------
  k.slab(S, HX0, HX1, FOOT, HE, HZB, HZF, 3);
  k.slab(S2, HX0 - 0.1, HX1 + 0.1, FOOT, 0.35, HZB - 0.1, HZF + 0.1, 1.5);
  k.slab(S2, HX0 - 0.15, HX1 + 0.15, HE - 0.2, HE, HZB - 0.2, HZF + 0.2, 1.5);
  const D = HZF - HZB, RISE = 3.8;
  k.roof(st.roof, HX0 + 0.2, HX1 - 0.2, HE, HZB - 0.3, HZF + 0.3, RISE);
  for (const x of [HX0, HX1]) {
    k.shape(S, copedGable(D + 0.6, RISE + 0.3), 0.5, x, HE, (HZF + HZB) / 2, Math.PI / 2, 3);
    k.cyl(S2, x, HE + RISE + 0.25, (HZF + HZB) / 2, 0.16, 0.7, 8, 0.04);
    // the gable ends' chimneys: tall paired octagonal shafts
    for (const dz of [-0.4, 0.4]) k.cyl(S2, x + (x < 0 ? 0.4 : -0.4), HE + RISE - 1, (HZF + HZB) / 2 + dz, 0.28, 2.6, 8);
    k.slab(S2, x - 0.6, x + 0.6, HE + RISE + 1.5, HE + RISE + 1.7, (HZF + HZB) / 2 - 0.8, (HZF + HZB) / 2 + 0.8, 1);
  }
  // two gables to the platform, each over a mullioned window, with the doors between them
  for (const gx of [-1.8, 5.4]) {
    k.shape(S, copedGable(4.2, 2.9), 0.5, gx, HE, HZF + 0.25, 0, 3);
    k.roof(st.roof, gx - 1.9, gx + 1.9, HE, HZF - 3, HZF, 2.7, true);
    k.cyl(S2, gx, HE + 2.9, HZF + 0.25, 0.14, 0.6, 8, 0.04);
    k.quad(st.win, gx, 1.8, HZF + 0.02, 2.2, 1.9);
    k.slab(S2, gx - 1.3, gx + 1.3, 2.85, 3.0, HZF, HZF + 0.2, 1);
    k.quad(st.win, gx, HE + 1.2, HZF + 0.52, 0.9, 1.0);
  }
  for (const x of [1.8, -4.8, 8.6]) k.quad(x === 1.8 ? st.dark : st.win, x, x === 1.8 ? 1.3 : 1.8, HZF + 0.02, x === 1.8 ? 1.6 : 1.1, x === 1.8 ? 2.6 : 1.7);
  // and the same to the approach behind
  for (const x of [-3.5, 1.8, 7.1]) k.quad(x === 1.8 ? st.dark : st.win, x, x === 1.8 ? FOOT + 1.4 : 1.6, HZB - 0.02, x === 1.8 ? 1.6 : 2.2, x === 1.8 ? 2.8 : 1.9, Math.PI);
  // its canopy over the platform
  st.canopy(HX0, HX1, N_FRONT, [[HX0, HZF], [HX1, HZF]], -1, 3.2, 3);

  // ---- the waiting room on the down platform ----------------------------------------------------
  k.slab(S, WX0, WX1, FOOT, WE + S_Y, WZF, WZB, 3);
  k.slab(S2, WX0 - 0.1, WX1 + 0.1, WE + S_Y - 0.2, WE + S_Y, WZF - 0.15, WZB + 0.15, 1.5);
  k.roof(st.roof, WX0 + 0.2, WX1 - 0.2, WE + S_Y, WZF - 0.3, WZB + 0.3, 2.4);
  for (const x of [WX0, WX1]) {
    k.shape(S, copedGable(WZB - WZF + 0.6, 2.7), 0.45, x, WE + S_Y, (WZF + WZB) / 2, Math.PI / 2, 3);
    k.cyl(S2, x, WE + S_Y + 2.65, (WZF + WZB) / 2, 0.14, 0.6, 8, 0.04);
  }
  for (const x of [-5, 0, 5]) k.quad(x === 0 ? st.dark : st.win, x, S_Y + (x === 0 ? 1.3 : 1.7), WZF - 0.02, x === 0 ? 1.5 : 1.8, x === 0 ? 2.6 : 1.7, Math.PI);
  k.cyl(S2, 3, WE + S_Y + 1.2, (WZF + WZB) / 2 + 0.6, 0.3, 1.8, 8);
  st.canopy(WX0, WX1, S_FRONT, [[WX0, WZF], [WX1, WZF]], 1, 3.2 + S_Y, 4.5, S_Y);
  k.slab(st.paving, WX0, WX1, S_Y - 0.3, S_Y, 5.7, WZF, 2);

  // ---- the footbridge ------------------------------------------------------------------------------
  st.footbridge(BOA_BRIDGE, -10.6, 7.8, 5.0, [[1, -9.7, 0], [-1, 6.9, S_Y]]);

  // ---- lamps, benches and the name -------------------------------------------------------------------
  for (const x of [-95, -80, -65, -50, -35, 20]) st.lampPost(x, 0, -6.4);
  for (const x of [-90, -75, -60, -45, 15, 25]) st.lampPost(x, S_Y, 4.0);
  for (const x of [-42, 15]) st.bench(x, 0, along(N_BACK, x) + 0.9, along(N_BACK, x));
  for (const x of [-52, -3, 3]) st.bench(x, S_Y, x > -10 ? WZF - 0.8 : along(S_BACK, x) - 0.9, x > -10 ? WZF : along(S_BACK, x));
  for (const x of [-85, 23]) st.nameBoard(x, 0, along(N_BACK, x) + 0.8, 0, 6.5);
  for (const x of [-80, 22]) st.nameBoard(x, S_Y, along(S_BACK, x) - 0.8, Math.PI, 6.5);
  // the platforms' numbers (as the rail file lists them, which the departure boards go by too):
  // 1 is the south side, by the waiting room, and 2 the north, by the station house
  for (const x of [-70, -28]) st.platSign(2, x, 0, (along(N_FRONT, x) + along(N_BACK, x)) / 2, Math.PI / 2);
  for (const x of [-67, -24]) st.platSign(1, x, S_Y, (along(S_FRONT, x) + along(S_BACK, x)) / 2, Math.PI / 2);

  return st.build();
}

