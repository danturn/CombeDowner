// Twerton Park, on the High Street in Twerton: the home of Bath City, the Romans, in black and
// white since 1889. Placed by tools/landmarks/combe_down_bath.py on the football pitch mapped
// there, in place of the plain blocks its stands would otherwise be drawn as. As the ground
// guides and fans' write-ups describe it:
// - the Main Stand, along the High Street side: the oldest, its seats raised up behind a paddock
//   wall and reached by steps, under a steep roof on a row of pillars, with the dugouts in front
//   of it and the smaller Family Stand along from it towards the Bristol End;
// - the Popular Side opposite: a covered standing terrace the length of the pitch, where the
//   home fans sing;
// - the Bristol End: a big, steep, open terrace behind the west goal, where away fans go;
// - the Bath End: a shallow open terrace, five steps deep, behind the east goal;
// - the old lattice floodlight pylons at the two north corners, and the slimmer 20 m columns that
//   replaced the two on the south side;
// - and the pitch itself (pitches.ts), which slopes a couple of metres from end to end.
// The stands, hoardings and floodlights are solid, and you can climb the terraces and stand on
// the seats (map.ts asks twertonSolids). Nothing about it goes over the network.
//
// args (after kind, x, y, ground, angle): the pitch's mapped length and width, then the ground's
// height in decimetres above `ground` at the points of GRID, row by row from the Main Stand side.
// The pitch's frame: s along the pitch from the centre spot towards the Bristol End (the
// landmark's angle), t across it towards the Popular Side. In the model, x is s and z is -t, so
// the Main Stand is the landmark's front.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import * as TX from "../textures";

/** The ground heights the pack sends: ns x nt points, s from -s to s and t from -t to t. */
export const GRID = { ns: 13, nt: 11, s: 90, t: 75 };

/** Something solid in the pitch's frame, with its flat top (metres above `ground`). */
export interface Block { s0: number; s1: number; t0: number; t1: number; top: number }
export interface Post { s: number; t: number; r: number; top: number }

/** A run of steps: terracing or rows of seats. Rows run along `along` (s or t) from `from` to
 *  `to`; the first row's front is at `front` across, and each row steps back by `tread` the way
 *  of `back`, `rise` higher than the one before; row 0's top is `first` above the stand's base. */
interface Steps {
  along: "s" | "t"; from: number; to: number; front: number; back: 1 | -1;
  rows: number; tread: number; rise: number; first: number;
}

const BOARD = 0.9;            // advertising hoardings: how tall
const AD_W = 7.2;             // and how long each one is

/** Everything about the ground's layout that both the drawing and the collisions need. */
function plan(args: (number | string)[]) {
  const [Lm, Wm, ...hs] = args.map(Number);
  const L = Lm / 2, W = Wm / 2;        // half the mapped pitch, each way
  const { ns, nt } = GRID;
  /** Ground height above `ground` at (s, t), between the grid's points. */
  const ground = (s: number, t: number) => {
    const fi = Math.min(ns - 1.001, Math.max(0, ((s + GRID.s) / (2 * GRID.s)) * (ns - 1)));
    const fj = Math.min(nt - 1.001, Math.max(0, ((t + GRID.t) / (2 * GRID.t)) * (nt - 1)));
    const i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j;
    const h = (a: number, b: number) => (hs[b * ns + a] ?? 0) / 10;
    return (h(i, j) * (1 - u) + h(i + 1, j) * u) * (1 - v) + (h(i, j + 1) * (1 - u) + h(i + 1, j + 1) * u) * v;
  };
  /** A stand's base: the ground along its front, on average. */
  const base = (st: Steps) => {
    const pts = [st.from, (st.from + st.to) / 2, st.to];
    return pts.reduce((a, p) => a + (st.along === "s" ? ground(p, st.front) : ground(st.front, p)), 0) / 3;
  };

  // the Main Stand: a gangway behind the paddock wall, then nine rows of seats, a walkway at the
  // back and the offices and dressing rooms behind that
  const main: Steps = { along: "s", from: -23, to: 27, front: -(W + 7.4), back: -1, rows: 10, tread: 0.85, rise: 0.4, first: 1.8 };
  const family: Steps = { along: "s", from: 34, to: 52, front: -(W + 6.4), back: -1, rows: 6, tread: 0.85, rise: 0.38, first: 0.45 };
  const paddock: Steps = { along: "s", from: -(L - 2), to: -25, front: -(W + 6.4), back: -1, rows: 4, tread: 0.9, rise: 0.33, first: 0.3 };
  const popular: Steps = { along: "s", from: -(L - 4.3), to: L - 4.3, front: W + 3.2, back: 1, rows: 12, tread: 0.85, rise: 0.33, first: 0.3 };
  const bristol: Steps = { along: "t", from: -(W + 1.5), to: W + 1.5, front: L + 3.4, back: 1, rows: 18, tread: 0.85, rise: 0.38, first: 0.3 };
  const bath: Steps = { along: "t", from: -(W - 4), to: W - 4, front: -(L + 3.4), back: -1, rows: 5, tread: 0.8, rise: 0.28, first: 0.25 };
  const stands = { main, family, paddock, popular, bristol, bath };
  const bases = Object.fromEntries(Object.entries(stands).map(([k, st]) => [k, base(st)])) as Record<keyof typeof stands, number>;
  /** How far back (across) a stand's row k reaches, and where it starts. */
  const rowAt = (st: Steps, k: number) => [st.front + st.back * st.tread * k, st.front + st.back * st.tread * (k + 1)];
  const deep = (st: Steps) => st.front + st.back * st.tread * st.rows;
  const topOf = (st: Steps, k: number) => st.first + st.rise * k;

  const blocks: Block[] = [], posts: Post[] = [];
  const block = (st: Steps, a0: number, a1: number, c0: number, c1: number, top: number) => {
    const [s0, s1, t0, t1] = st.along === "s" ? [a0, a1, c0, c1] : [c0, c1, a0, a1];
    blocks.push({ s0: Math.min(s0, s1), s1: Math.max(s0, s1), t0: Math.min(t0, t1), t1: Math.max(t0, t1), top });
  };
  for (const [k, st] of Object.entries(stands) as [keyof typeof stands, Steps][]) {
    const b = bases[k];
    for (let r = 0; r < st.rows; r++) { const [c0, c1] = rowAt(st, r); block(st, st.from, st.to, c0, c1, b + topOf(st, r)); }
  }
  // the Main Stand's back walkway and the building behind it, up to the roof
  const mb = bases.main, mBack = deep(main);
  block(main, main.from, main.to, mBack, mBack - 1.0, mb + topOf(main, main.rows - 1));
  const mainRear = [mBack - 1.0, mBack - 5.2];
  block(main, main.from, main.to, mainRear[0], mainRear[1], mb + 9.4);
  // the stands' side screens and back walls
  const mainRoof = { front: main.front + 0.8, eave: 6.4, ridgeAt: main.front - 8.6, ridge: 11.0, back: mainRear[1] - 0.2, backEave: 9.4 };
  for (const s of [main.from - 0.15, main.to + 0.15]) block(main, s - 0.15, s + 0.15, main.front, mainRear[1], mb + mainRoof.eave);
  const fb = bases.family, fBack = deep(family);
  block(family, family.from, family.to, fBack, fBack - 0.4, fb + 5.2);
  const pb = bases.popular, pBack = deep(popular);
  block(popular, popular.from, popular.to, pBack, pBack + 0.4, pb + 6.6);
  for (const s of [popular.from - 0.15, popular.to + 0.15]) block(popular, s - 0.15, s + 0.15, popular.front, pBack + 0.4, pb + 6.6);
  const bb = bases.bristol, bBack = deep(bristol);
  block(bristol, bristol.from, bristol.to, bBack, bBack + 0.5, bb + topOf(bristol, bristol.rows - 1) + 1.3);
  const eb = bases.bath, eBack = deep(bath);
  block(bath, bath.from, bath.to, eBack, eBack - 0.4, eb + topOf(bath, bath.rows - 1) + 1.6);

  // roof pillars along the fronts
  const mainCols: number[] = [], popCols: number[] = [], famCols: number[] = [];
  for (let k = 0; k <= 6; k++) mainCols.push(main.from + 0.4 + ((main.to - main.from - 0.8) * k) / 6);
  for (let k = 0; k <= 8; k++) popCols.push(popular.from + 0.4 + ((popular.to - popular.from - 0.8) * k) / 8);
  for (let k = 0; k <= 2; k++) famCols.push(family.from + 0.3 + ((family.to - family.from - 0.6) * k) / 2);
  for (const s of mainCols) posts.push({ s, t: main.front + 0.5, r: 0.15, top: mb + mainRoof.eave });
  for (const s of popCols) posts.push({ s, t: popular.front + 0.3, r: 0.15, top: pb + 7 });
  for (const s of famCols) posts.push({ s, t: family.front + 0.4, r: 0.12, top: fb + 4.6 });

  // the dugouts, either side of halfway in front of the Main Stand
  const dugouts = [-7, 7].map((s) => ({ s, t0: -(W + 1.4), t1: -(W + 3.4), len: 5.6, g: ground(s, -(W + 2.4)) }));
  for (const d of dugouts) blocks.push({ s0: d.s - d.len / 2, s1: d.s + d.len / 2, t0: d.t1, t1: d.t1 + 0.3, top: d.g + 2.1 });

  // hoardings round the pitch, in lengths of one advert, leaving the corners open to walk through
  const boards: { s: number; t: number; along: "s" | "t"; face: 1 | -1; g: number; ad: number }[] = [];
  const side = (along: "s" | "t", at: number, half: number, face: 1 | -1, skip: (p: number) => boolean) => {
    const n = Math.floor((2 * half) / AD_W);
    for (let k = 0; k < n; k++) {
      const p = -half + (2 * half - n * AD_W) / 2 + AD_W * (k + 0.5);
      if (skip(p)) continue;
      const [s, t] = along === "s" ? [p, at] : [at, p];
      boards.push({ s, t, along, face, g: ground(s, t), ad: (k * 5 + (along === "s" ? 0 : 3) + (face > 0 ? 1 : 0)) % ADS.length });
    }
  };
  side("s", -(W + 4.0), L - 3, 1, (p) => dugouts.some((d) => Math.abs(p - d.s) < (d.len + AD_W) / 2));   // north: not across the dugouts
  side("s", W + 1.8, L - 3, -1, () => false);
  side("t", L + 2.0, W - 3, -1, () => false);
  side("t", -(L + 2.0), W - 3, 1, () => false);
  for (const b of boards) {
    const [hs, ht] = b.along === "s" ? [AD_W / 2, 0.06] : [0.06, AD_W / 2];
    blocks.push({ s0: b.s - hs, s1: b.s + hs, t0: b.t - ht, t1: b.t + ht, top: b.g + BOARD });
  }

  // the floodlights: lattice pylons at the north corners (where they're mapped), columns at the south
  const pylons = [{ s: -(L + 3.9), t: -(W + 11.4) }, { s: L + 23.4, t: -(W + 7.7) }].map((p) => ({ ...p, g: ground(p.s, p.t), h: 30 }));
  const columns = [{ s: -(L + 4.6), t: W + 11.4 }, { s: L + 11.6, t: W + 11.4 }].map((p) => ({ ...p, g: ground(p.s, p.t), h: 20 }));
  for (const p of pylons) posts.push({ s: p.s, t: p.t, r: 1.5, top: p.g + p.h });
  for (const p of columns) posts.push({ s: p.s, t: p.t, r: 0.35, top: p.g + p.h });

  // the turnstiles, by the car park behind the Main Stand
  const gate = { s: -33, t: mainRear[1] - 2.2, g: ground(-33, mainRear[1] - 2.2) };
  blocks.push({ s0: gate.s - 3.5, s1: gate.s + 3.5, t0: gate.t - 1.4, t1: gate.t + 1.4, top: gate.g + 3.2 });

  return { L, W, ground, stands, bases, rowAt, deep, topOf, blocks, posts, mainRear, mainRoof, mainCols, popCols, famCols, dugouts, boards, pylons, columns, gate };
}

/** What's solid, for map.ts: blocks (which you can stand on top of) and round posts. */
export function twertonSolids(args: (number | string)[]): { boxes: Block[]; posts: Post[] } {
  const p = plan(args);
  return { boxes: p.blocks, posts: p.posts };
}

// ---- drawing ----------------------------------------------------------------------------------

/** The adverts on the hoardings (each one's text, colours and the strapline under it), and the
 *  supporters' banners on the Popular Side's front rail, all on one sheet. */
const ADS: [string, string, string, string][] = [
  ["COMBE DOWN WITH ME", "#f4d03f", "#1b1b1d", "the deli on the hill"],
  ["THE HADLEY ARMS", "#7a1f2b", "#f2e6c8", "North Road, Combe Down"],
  ["UNDER COMBE DOWN", "#1b1b1d", "#f08a24", "stone mine tours"],
  ["THE KING WILLIAM", "#14532d", "#f2e6c8", "real ale on Combe Down"],
  ["UP THE CITY!", "#f4f4f0", "#1b1b1d", "black and white army"],
  ["BATH CITY F.C.", "#1b1b1d", "#f4f4f0", "founded 1889"],
  ["TWERTON PARK", "#1d3f8f", "#f4f4f0", "home of the Romans"],
  ["THE ROMANS", "#a3202a", "#f4f4f0", "Bath City Football Club"],
];
const BANNERS = ["BATH CITY", "THE ROMANS", "UP THE CITY", "TWERTON ARMY"];
const SHEET_ROWS = ADS.length + BANNERS.length;

function sheet(): THREE.CanvasTexture {
  const W = 1024, H = 128;
  const [c, g] = TX.canvas(W, H * SHEET_ROWS);
  g.textAlign = "center"; g.textBaseline = "middle";
  ADS.forEach(([text, bg, fg, strap], k) => {
    const y = k * H;
    g.fillStyle = bg; g.fillRect(0, y, W, H);
    g.fillStyle = fg; g.fillRect(0, y, W, 6); g.fillRect(0, y + H - 6, W, 6);
    g.font = '900 64px "Arial Black", Impact, sans-serif';
    g.fillText(text, W / 2, y + 50, W - 60);
    g.font = 'italic 600 28px Georgia, serif';
    g.fillText(strap, W / 2, y + 100, W - 80);
  });
  BANNERS.forEach((text, k) => {
    const y = (ADS.length + k) * H;
    // black and white stripes down it, and the words across in a box
    for (let x = 0; x < W; x += 64) { g.fillStyle = (x / 64) % 2 ? "#f4f4f0" : "#1b1b1d"; g.fillRect(x, y, 64, H); }
    g.fillStyle = "#1b1b1d"; g.fillRect(90, y + 18, W - 180, H - 36);
    g.strokeStyle = "#f4f4f0"; g.lineWidth = 4; g.strokeRect(96, y + 24, W - 192, H - 48);
    g.fillStyle = "#f4f4f0"; g.font = '900 60px "Arial Black", Impact, sans-serif';
    g.fillText(text, W / 2, y + H / 2 + 2, W - 240);
  });
  const t = TX.tex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Big painted lettering on a board. */
function lettering(lines: [string, number][], w: number, h: number, fg: string, bg: string, edge?: string): THREE.CanvasTexture {
  const [c, g] = TX.canvas(w, h);
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  if (edge) { g.strokeStyle = edge; g.lineWidth = Math.max(4, h / 24); g.strokeRect(h / 16, h / 16, w - h / 8, h - h / 8); }
  g.fillStyle = fg; g.textAlign = "center"; g.textBaseline = "middle";
  let y = 0;
  const total = lines.reduce((a, [, s]) => a + s, 0);
  for (const [text, size] of lines) {
    const px = (size / total) * h;
    g.font = `900 ${Math.round(px * 0.62)}px "Arial Black", Impact, sans-serif`;
    g.fillText(text, w / 2, y + px / 2, w * 0.92);
    y += px;
  }
  const t = TX.tex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Letters five seats wide and seven rows tall, for picking out names in the seats. */
const FONT: Record<string, string[]> = {
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  " ": ["000", "000", "000", "000", "000", "000", "000"],
};

export function twerton(args: (number | string)[]): THREE.Object3D {
  const P = plan(args), { stands, bases, rowAt, deep, topOf } = P;
  const grp = new THREE.Group();
  // everything is gathered by material and merged, to keep the draw calls down
  const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const put = (m: THREE.Material, g: THREE.BufferGeometry) => {
    const gg = g.index ? g.toNonIndexed() : g;
    if (!gg.attributes.uv) gg.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(gg.attributes.position.count * 2), 2));
    (parts.get(m) ?? parts.set(m, []).get(m)!).push(gg);
  };
  const lam = (color: string, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
  const M = {
    concrete: lam("#b9b4a8", { map: TX.asphalt() }),
    nosing: lam("#f1eee4"),
    render: lam("#ece6d6"),
    plinth: lam("#8f8a80"),
    steel: lam("#1e1f22"),
    white: lam("#f2f0e8"),
    roof: lam("#7b8088", { side: THREE.DoubleSide }),
    cladding: lam("#2a2b2f", { map: TX.boards() }),
    perspex: new THREE.MeshLambertMaterial({ color: "#cfe6ee", transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }),
    lamp: lam("#fffbe8", { emissive: "#fff2c0", emissiveIntensity: 0.55 }),
    lattice: lam("#8d939a"),
    door: lam("#2b2f36"),
    bench: lam("#1b1b1d"),
  };
  // a box in the pitch's frame: s0..s1 along, t0..t1 across, y0..y1 up
  const box = (m: THREE.Material, s0: number, s1: number, t0: number, t1: number, y0: number, y1: number) => {
    const [a0, a1] = [Math.min(s0, s1), Math.max(s0, s1)], [b0, b1] = [Math.min(t0, t1), Math.max(t0, t1)];
    if (a1 - a0 < 1e-3 || b1 - b0 < 1e-3 || y1 - y0 < 1e-3) return;
    put(m, new THREE.BoxGeometry(a1 - a0, y1 - y0, b1 - b0).translate((a0 + a1) / 2, (y0 + y1) / 2, -(b0 + b1) / 2));
  };
  // a box along whichever way a stand's rows run
  const sbox = (st: Steps, m: THREE.Material, a0: number, a1: number, c0: number, c1: number, y0: number, y1: number) =>
    st.along === "s" ? box(m, a0, a1, c0, c1, y0, y1) : box(m, c0, c1, a0, a1, y0, y1);
  // a prism: a profile across a stand (pairs of [across, height]) run along it from a0 to a1
  const prism = (st: Steps, m: THREE.Material, profile: number[][], a0: number, a1: number) => {
    const shape = new THREE.Shape(profile.map(([c, h]) => new THREE.Vector2(c, h)));
    const g = new THREE.ExtrudeGeometry(shape, { depth: a1 - a0, bevelEnabled: false });
    // the profile's x is across (t, or s for an end stand), its extrusion runs along
    // (turned a quarter round, the profile's x lands on -z, which is t, and the extrusion on x)
    if (st.along === "s") put(m, g.rotateY(Math.PI / 2).translate(a0, 0, 0));
    else put(m, g.rotateY(Math.PI).translate(0, 0, -a0));
  };
  const tube = (m: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, r: number, seg = 6) => {
    const d = b.clone().sub(a), len = d.length();
    const g = new THREE.CylinderGeometry(r, r, len, seg, 1, true);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
    put(m, g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2));
  };
  const V = (s: number, y: number, t: number) => new THREE.Vector3(s, y, -t);

  // ---- the steps of every stand: concrete, with a pale edge to each tread ----
  for (const [k, st] of Object.entries(stands) as [keyof typeof stands, Steps][]) {
    const b = bases[k];
    for (let r = 0; r < st.rows; r++) {
      const [c0, c1] = rowAt(st, r), top = b + topOf(st, r);
      sbox(st, M.concrete, st.from, st.to, c0, c1, b - 4, top);
      sbox(st, M.nosing, st.from, st.to, c0 - st.back * 0.01, c0 + st.back * 0.08, top - 0.04, top + 0.01);
    }
    // the ends of each stand, a plain wall down to the ground
    for (const a of [st.from, st.to]) {
      const sgn = a === st.from ? -1 : 1;
      sbox(st, M.plinth, a, a + sgn * 0.3, st.front, deep(st), b - 4, b + topOf(st, st.rows - 1) + 0.3);
    }
  }

  // ---- the Main Stand ----
  const { main, family, paddock, popular, bristol, bath } = stands;
  const mb = bases.main, R = P.mainRoof, [r0, r1] = P.mainRear;
  // the paddock wall in front, painted white with a black cap
  box(M.white, main.from, main.to, main.front + 0.01, main.front + 0.25, mb - 3, mb + main.first + 0.05);
  box(M.steel, main.from, main.to, main.front - 0.02, main.front + 0.3, mb + main.first + 0.05, mb + main.first + 0.15);
  // steps up through the wall at either side of the halfway line
  for (const s of [-8.5, 14.5]) {
    for (let k = 0; k < 5; k++) box(M.concrete, s - 1.2, s + 1.2, main.front + 2 - 0.4 * k, main.front, mb - 2, mb + 0.36 * (k + 1));
    for (const e of [-1.25, 1.25]) tube(M.steel, V(s + e, mb + 1.0, main.front + 2), V(s + e, mb + main.first + 1.0, main.front), 0.035);
  }
  // the back walkway, and the offices and dressing rooms behind
  const mBack = deep(main);
  box(M.concrete, main.from, main.to, mBack, r0, mb - 3, mb + topOf(main, main.rows - 1));
  box(M.render, main.from, main.to, r0, r1, mb - 3, mb + R.backEave);
  box(M.door, main.from + 1, main.to - 1, r0 + 0.02, r0 - 0.02, mb + topOf(main, main.rows - 1), mb + topOf(main, main.rows - 1) + 2.3);   // the doors off the back walkway
  // the roof: steep at the front, down onto the row of pillars, and a shorter slope at the back
  const th = 0.25;
  prism(main, M.roof, [[R.front, R.eave], [R.ridgeAt, R.ridge], [R.back, R.backEave], [R.back, R.backEave - th], [R.ridgeAt, R.ridge - th], [R.front, R.eave - th]].map(([c, h]) => [c, mb + h]), main.from - 0.4, main.to + 0.4);
  // fascia along the front, with the club's name
  const fasciaTex = lettering([["BATH CITY FOOTBALL CLUB", 1]], 2048, 64, "#f4f4f0", "#1b1b1d");
  const fascia = new THREE.Mesh(new THREE.PlaneGeometry(main.to - main.from + 0.8, 0.75), new THREE.MeshLambertMaterial({ map: fasciaTex }));
  fascia.position.set((main.from + main.to) / 2, mb + R.eave - 0.3, -(R.front + 0.02));
  fascia.rotation.y = Math.PI;   // facing the pitch (+t, which is -z)
  grp.add(fascia);
  // pillars and the beam along the front
  for (const s of P.mainCols) box(M.steel, s - 0.12, s + 0.12, main.front + 0.38, main.front + 0.62, mb, mb + R.eave - 0.2);
  box(M.steel, main.from - 0.4, main.to + 0.4, R.front - 0.05, R.front + 0.3, mb + R.eave - 0.65, mb + R.eave - 0.2);
  // side screens: black-painted boarding up to the roof
  for (const s of [main.from - 0.3, main.to]) {
    prism(main, M.cladding, [[main.front, mb - 2], [main.front, mb + R.eave - 0.1], [R.ridgeAt, mb + R.ridge - 0.2], [R.back, mb + R.backEave - 0.2], [R.back, mb - 2]], s, s + 0.3);
  }
  // two storeys of windows along the back, either side of the club's name
  const mid = (main.from + main.to) / 2;
  for (let s = main.from + 2; s < main.to - 2; s += 3.2) {
    for (const y of [1.0, 4.4]) if (y < 2 || Math.abs(s + 0.7 - mid) > 7.8) box(M.door, s, s + 1.4, r1 - 0.04, r1 + 0.02, mb + y, mb + y + 1.3);
  }
  // the club's name on the back, over the car park, and the turnstiles
  const nameTex = lettering([["BATH CITY", 1.25], ["FOOTBALL CLUB", 0.8], ["TWERTON PARK", 0.7]], 1024, 384, "#f4f4f0", "#1b1b1d", "#f4f4f0");
  const name = new THREE.Mesh(new THREE.PlaneGeometry(14, 5.25), new THREE.MeshLambertMaterial({ map: nameTex }));
  name.position.set((main.from + main.to) / 2, mb + 5.2, -(r1 - 0.03));
  grp.add(name);
  const G = P.gate;
  box(M.render, G.s - 3.5, G.s + 3.5, G.t - 1.4, G.t + 1.4, G.g - 2, G.g + 3.0);
  box(M.steel, G.s - 3.7, G.s + 3.7, G.t - 1.6, G.t + 1.6, G.g + 3.0, G.g + 3.25);
  for (const ds of [-2.2, 0, 2.2]) box(M.door, G.s + ds - 0.6, G.s + ds + 0.6, G.t - 1.42, G.t - 1.38, G.g, G.g + 2.1);
  const gateTex = lettering([["TURNSTILES", 1]], 512, 64, "#f4f4f0", "#1b1b1d");
  const gateSign = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 0.8), new THREE.MeshLambertMaterial({ map: gateTex }));
  gateSign.position.set(G.s, G.g + 2.55, -(G.t - 1.43));
  grp.add(gateSign);

  // seats: black, with BATH CITY picked out in white, rows 1 to 9 of the Main Stand and the
  // Family Stand's in white
  const seatGeo = mergeGeometries([
    new THREE.BoxGeometry(0.44, 0.06, 0.4).translate(0, 0.42, 0.02).toNonIndexed(),
    new THREE.BoxGeometry(0.44, 0.4, 0.06).translate(0, 0.62, 0.21).toNonIndexed(),
    new THREE.BoxGeometry(0.06, 0.42, 0.06).translate(0, 0.21, 0).toNonIndexed(),
  ])!;
  const seats: { s: number; y: number; t: number; white: boolean }[] = [];
  const words = "BATH CITY", glyphs = [...words].map((ch) => FONT[ch]);
  const textW = glyphs.reduce((a, gl) => a + gl[0].length + 1, -1);
  const perRow = Math.floor((main.to - main.from - 1) / 0.5), firstText = Math.floor((perRow - textW) / 2);
  for (let r = 1; r < main.rows; r++) {
    const [c0, c1] = rowAt(main, r);
    for (let i = 0; i < perRow; i++) {
      // letters read left to right from the pitch, which is towards -s
      const col = perRow - 1 - i - firstText, line = main.rows - 1 - r;   // the top row is the top of the letters
      let white = false;
      if (col >= 0 && col < textW && line >= 1 && line <= 7) {
        let x = col;
        for (const gl of glyphs) {
          const w = gl[0].length;
          if (x < w) { white = gl[line - 1][x] === "1"; break; }
          x -= w + 1;
          if (x < 0) break;
        }
      }
      seats.push({ s: main.from + 0.75 + i * 0.5, y: mb + topOf(main, r), t: (c0 + c1) / 2 - 0.05, white });
    }
  }
  const famRows = family.rows;
  for (let r = 1; r < famRows; r++) {
    const [c0, c1] = rowAt(family, r), n = Math.floor((family.to - family.from - 1) / 0.5);
    for (let i = 0; i < n; i++) seats.push({ s: family.from + 0.75 + i * 0.5, y: bases.family + topOf(family, r), t: (c0 + c1) / 2 - 0.05, white: true });
  }
  const seatMesh = new THREE.InstancedMesh(seatGeo, lam("#ffffff"), seats.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI), one = new THREE.Vector3(1, 1, 1);
  const black = new THREE.Color("#1b1b1d"), white = new THREE.Color("#f0f0ea");
  seats.forEach((st, k) => {
    // facing the pitch (+t, which is -z): the back on the -t side, so turned half round
    seatMesh.setMatrixAt(k, m4.compose(new THREE.Vector3(st.s, st.y, -st.t), q, one));
    seatMesh.setColorAt(k, st.white ? white : black);
  });
  seatMesh.castShadow = seatMesh.receiveShadow = true;
  seatMesh.computeBoundingSphere();
  grp.add(seatMesh);

  // ---- the Family Stand: a lean-to roof on three pillars ----
  const fb = bases.family, fBack = deep(family);
  box(M.render, family.from, family.to, fBack, fBack - 0.4, fb - 3, fb + 5.2);
  prism(family, M.roof, [[family.front + 0.9, fb + 4.6], [fBack - 0.6, fb + 5.4], [fBack - 0.6, fb + 5.2], [family.front + 0.9, fb + 4.4]], family.from - 0.3, family.to + 0.3);
  for (const s of P.famCols) box(M.steel, s - 0.1, s + 0.1, family.front + 0.3, family.front + 0.5, fb, fb + 4.5);
  for (const s of [family.from - 0.3, family.to]) prism(family, M.cladding, [[family.front, fb - 2], [family.front, fb + 4.5], [fBack - 0.4, fb + 5.3], [fBack - 0.4, fb - 2]], s, s + 0.3);
  const famTex = lettering([["FAMILY STAND", 1]], 1024, 64, "#1b1b1d", "#f4f4f0");
  const famSign = new THREE.Mesh(new THREE.PlaneGeometry(family.to - family.from + 0.6, 0.6), new THREE.MeshLambertMaterial({ map: famTex }));
  famSign.position.set((family.from + family.to) / 2, fb + 4.3, -(family.front + 0.88));
  famSign.rotation.y = Math.PI;
  grp.add(famSign);

  // ---- the Popular Side: a long roof sloping back over the terrace, on a row of pillars ----
  const pb = bases.popular, pBack = deep(popular);
  box(M.render, popular.from, popular.to, pBack, pBack + 0.4, pb - 3, pb + 6.6);
  const pf = popular.front - 0.6;
  prism(popular, M.roof, [[pf, pb + 7.3], [pBack + 0.5, pb + 6.6], [pBack + 0.5, pb + 6.4], [pf, pb + 7.1]], popular.from - 0.4, popular.to + 0.4);
  for (const s of P.popCols) box(M.steel, s - 0.12, s + 0.12, popular.front + 0.18, popular.front + 0.42, pb, pb + 7.1);
  box(M.steel, popular.from - 0.4, popular.to + 0.4, pf - 0.05, pf + 0.35, pb + 6.6, pb + 7.1);
  for (const s of [popular.from - 0.3, popular.to]) prism(popular, M.cladding, [[popular.front, pb - 2], [popular.front, pb + 7.0], [pBack + 0.4, pb + 6.5], [pBack + 0.4, pb - 2]], s, s + 0.3);
  // its fascia: black and white, with the club's name in the middle
  const popTex = lettering([["BATH CITY F.C.  ·  THE POPULAR SIDE", 1]], 2048, 64, "#f4f4f0", "#1b1b1d");
  const popSign = new THREE.Mesh(new THREE.PlaneGeometry(popular.to - popular.from + 0.8, 0.6), new THREE.MeshLambertMaterial({ map: popTex }));
  popSign.position.set(0, pb + 6.95, -(pf - 0.07));
  grp.add(popSign);
  // a rail along the front, with the banners hung over it
  for (const y of [1.1, 0.6]) tube(M.steel, V(popular.from, pb + y, popular.front - 0.05), V(popular.to, pb + y, popular.front - 0.05), 0.04);
  for (let s = popular.from; s <= popular.to; s += 3) box(M.steel, s - 0.03, s + 0.03, popular.front - 0.08, popular.front - 0.02, pb - 0.5, pb + 1.1);

  // ---- crush barriers on the terraces: rails on short posts every few rows, in sections ----
  const crush = (st: Steps, b: number, every: number) => {
    for (let r = 2; r < st.rows - 1; r += every) {
      const [c0] = rowAt(st, r), top = b + topOf(st, r);
      for (let a = st.from + 1.5; a < st.to - 1.5; a += 9) {
        const a1 = Math.min(st.to - 1.5, a + 7);
        const [p0, p1] = st.along === "s" ? [V(a, top + 1.05, c0 + st.back * 0.3), V(a1, top + 1.05, c0 + st.back * 0.3)] : [V(c0 + st.back * 0.3, top + 1.05, a), V(c0 + st.back * 0.3, top + 1.05, a1)];
        tube(M.steel, p0, p1, 0.045);
        for (let k = 0; k <= 3; k++) {
          const p = p0.clone().lerp(p1, k / 3);
          tube(M.steel, p, p.clone().setY(top), 0.035);
        }
      }
    }
  };
  crush(popular, pb, 3);
  crush(bristol, bases.bristol, 3);

  // ---- the Bristol End and the Bath End: open terraces with a wall round the back ----
  const bb = bases.bristol, bBack = deep(bristol);
  box(M.render, bBack, bBack + 0.5, bristol.from, bristol.to, bb - 6, bb + topOf(bristol, bristol.rows - 1) + 1.3);
  box(M.steel, bBack - 0.05, bBack + 0.55, bristol.from, bristol.to, bb + topOf(bristol, bristol.rows - 1) + 1.3, bb + topOf(bristol, bristol.rows - 1) + 1.4);
  const bTex = lettering([["THE BRISTOL END", 1]], 1024, 96, "#f4f4f0", "#1b1b1d");
  const bSign = new THREE.Mesh(new THREE.PlaneGeometry(14, 1.3), new THREE.MeshLambertMaterial({ map: bTex }));
  bSign.position.set(bBack - 0.02, bb + topOf(bristol, bristol.rows - 1) + 0.6, 0);
  bSign.rotation.y = -Math.PI / 2;   // facing back down the pitch (-s)
  grp.add(bSign);
  const eb = bases.bath, eBack = deep(bath);
  box(M.render, eBack, eBack - 0.4, bath.from, bath.to, eb - 3, eb + topOf(bath, bath.rows - 1) + 1.6);
  const eTex = lettering([["THE BATH END", 1]], 1024, 96, "#f4f4f0", "#1b1b1d");
  const eSign = new THREE.Mesh(new THREE.PlaneGeometry(10, 0.95), new THREE.MeshLambertMaterial({ map: eTex }));
  eSign.position.set(eBack + 0.02, eb + topOf(bath, bath.rows - 1) + 1.0, 0);
  eSign.rotation.y = Math.PI / 2;
  grp.add(eSign);
  // a rail along the front of each end
  for (const [st, b] of [[bristol, bb], [bath, eb]] as const) {
    tube(M.steel, V(st.front - st.back * 0.05, b + 1.1, st.from), V(st.front - st.back * 0.05, b + 1.1, st.to), 0.04);
    for (let a = st.from; a <= st.to; a += 3) tube(M.steel, V(st.front - st.back * 0.05, b - 0.5, a), V(st.front - st.back * 0.05, b + 1.1, a), 0.03);
  }

  // ---- the paddock in the corner by the Bath End: a few steps, open ----
  tube(M.steel, V(paddock.from, bases.paddock + 1.1, paddock.front + 0.05), V(paddock.to, bases.paddock + 1.1, paddock.front + 0.05), 0.04);

  // ---- the dugouts: a bench under a curved perspex hood ----
  for (const d of P.dugouts) {
    const s0 = d.s - d.len / 2, s1 = d.s + d.len / 2, g = d.g;
    box(M.steel, s0, s1, d.t1, d.t1 + 0.3, g - 0.5, g + 2.1);
    box(M.bench, s0 + 0.2, s1 - 0.2, d.t1 + 0.3, d.t1 + 0.8, g + 0.42, g + 0.5);
    box(M.bench, s0 + 0.2, s1 - 0.2, d.t1 + 0.3, d.t1 + 0.38, g + 0.5, g + 0.95);
    // the hood: a quarter of a tube over the bench, from the back down towards the pitch, on a black frame
    const r = 2.0, hood = new THREE.CylinderGeometry(r, r, d.len, 12, 1, true, Math.PI / 2, Math.PI / 2).rotateZ(Math.PI / 2);
    put(M.perspex, hood.translate(d.s, g + 0.1, -d.t1));
    for (const s of [s0, s1]) tube(M.steel, V(s, g + 0.1 + r, d.t1), V(s, g + 0.1, d.t1 + r), 0.04);
    tube(M.steel, V(s0, g + 0.1 + r, d.t1), V(s1, g + 0.1 + r, d.t1), 0.05);
  }

  // ---- the hoardings: the adverts face the pitch, plain boards behind ----
  const sheetMat = new THREE.MeshLambertMaterial({ map: sheet() });
  const adGeos: THREE.BufferGeometry[] = [];
  const panel = (k: number, w: number, h: number) => {
    const g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, (SHEET_ROWS - 1 - k + uv.getY(i)) / SHEET_ROWS);
    return g;
  };
  for (const b of P.boards) {
    const g = panel(b.ad, AD_W - 0.1, BOARD - 0.1);
    // a plane faces +z (which is -t); turn it to face the pitch
    const yaw = b.along === "s" ? (b.face > 0 ? Math.PI : 0) : (b.face > 0 ? -Math.PI / 2 : Math.PI / 2);
    g.rotateY(yaw);
    const n = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    g.translate(b.s + n.x * 0.07, b.g + BOARD / 2 + 0.02, -b.t + n.z * 0.07);
    adGeos.push(g);
    const [hs, ht] = b.along === "s" ? [AD_W / 2, 0.06] : [0.06, AD_W / 2];
    box(M.steel, b.s - hs, b.s + hs, b.t - ht, b.t + ht, b.g - 0.3, b.g + BOARD + 0.05);
  }
  // the banners on the Popular Side's front rail
  for (let k = 0; k * 13 < popular.to - popular.from - 6; k++) {
    const s = popular.from + 6 + k * 13, g = panel(ADS.length + (k % BANNERS.length), 4, 0.5);
    g.translate(s, pb + 0.86, -(popular.front - 0.12));
    adGeos.push(g);
  }
  if (adGeos.length) {
    const ads = new THREE.Mesh(mergeGeometries(adGeos.map((g) => g.toNonIndexed()))!, sheetMat);
    ads.receiveShadow = true;
    grp.add(ads);
  }

  // ---- the floodlights ----
  const lampHead = (s: number, t: number, y: number, w: number, h: number, cols: number, rows: number) => {
    // turned to face the centre spot, tipped down towards it
    const yaw = Math.atan2(-s, t), dist = Math.hypot(s, t), tilt = Math.atan2(y - 0, dist) * 0.55;
    const head = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, h + 0.3, 0.25), M.steel);
    head.add(frame);
    const lampGeo = new THREE.BoxGeometry(w / cols - 0.12, h / rows - 0.12, 0.3);
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const l = new THREE.Mesh(lampGeo, M.lamp);
      l.position.set(-w / 2 + (i + 0.5) * (w / cols), -h / 2 + (j + 0.5) * (h / rows), 0.08);
      head.add(l);
    }
    head.rotation.set(-tilt, yaw, 0, "YXZ");
    head.position.set(s, y, -t);
    head.updateMatrix();
    head.traverse((o) => { if (o instanceof THREE.Mesh) { o.updateMatrix(); put(o.material as THREE.Material, o.geometry.clone().applyMatrix4(head.matrix.clone().multiply(o.matrix))); } });
  };
  for (const p of P.pylons) {
    // four legs leaning in, cross-braced, and a platform under the lamps
    const b0 = 1.5, b1 = 0.5, H = p.h, g = p.g;
    const corner = (k: number, y: number) => {
      const half = b0 + (b1 - b0) * (y / H), cx = k & 1 ? 1 : -1, cz = k & 2 ? 1 : -1;
      return V(p.s + cx * half, g + y, p.t + cz * half);
    };
    for (let k = 0; k < 4; k++) tube(M.lattice, corner(k, -1), corner(k, H), 0.09, 5);
    const order = [0, 1, 3, 2];
    for (let y = 0; y < H - 1; y += 3) {
      for (let f = 0; f < 4; f++) {
        const a = order[f], b = order[(f + 1) % 4];
        tube(M.lattice, corner(a, y), corner(b, y), 0.04, 4);
        tube(M.lattice, corner(a, y), corner(b, Math.min(H, y + 3)), 0.035, 4);
        tube(M.lattice, corner(b, y), corner(a, Math.min(H, y + 3)), 0.035, 4);
      }
    }
    box(M.steel, p.s - 1.4, p.s + 1.4, p.t - 1.4, p.t + 1.4, g + H - 0.2, g + H + 0.05);
    box(M.plinth, p.s - 1.9, p.s + 1.9, p.t - 1.9, p.t + 1.9, g - 1, g + 0.4);
    lampHead(p.s, p.t, g + H + 2.0, 4.6, 3.4, 4, 3);
  }
  for (const p of P.columns) {
    const g = new THREE.CylinderGeometry(0.17, 0.3, p.h + 1, 10).translate(p.s, p.g + (p.h - 1) / 2, -p.t);
    put(M.lattice, g);
    box(M.plinth, p.s - 0.7, p.s + 0.7, p.t - 0.7, p.t + 0.7, p.g - 1, p.g + 0.3);
    lampHead(p.s, p.t, p.g + p.h + 0.6, 3.2, 1.3, 4, 2);
  }

  for (const [m, geos] of parts) {
    const mesh = new THREE.Mesh(mergeGeometries(geos)!, m);
    mesh.receiveShadow = true;
    grp.add(mesh);
  }
  return grp;
}
