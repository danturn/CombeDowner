// A generated mine level (gen.ts) turned into something to walk round: the rock as rough, faceted
// meshes (one per kind of stone), the things in it (chests, the winze, candles, graffiti, scenery),
// and the queries the game needs: floor height, collision and line of sight. Puzzles build their own
// parts (puzzles.ts) and open or close cells here as they're solved.
import * as THREE from "three";
import { CELL, FLOORS, Level, ROCKS, STEP } from "./gen";
import { floorStyle, glow, graffiti, rockStyle, wood } from "./art";
import * as Props from "./props";
import { canvas, pixelTex, rng } from "../textures";

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** A repeatable random number for a point, so shared corners of the rock mesh move together. */
export function hash3(x: number, y: number, z: number, salt = 0) {
  let h = Math.imul(Math.round(x * 100) | 0, 374761393) ^ Math.imul(Math.round(y * 100) | 0, 668265263) ^ Math.imul(Math.round(z * 100) | 0, 2147483647) ^ salt;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

class Mesher {
  pos: number[] = []; uv: number[] = []; col: number[] = [];
  constructor(private rough: number) {}
  /** Push a vertex, nudged by a fixed amount for its position so the rock looks hacked out. */
  private v(x: number, y: number, z: number, u: number, w: number, floorLevel: boolean, y0: number) {
    const a = this.rough;
    const dx = (hash3(x, y, z, 1) - 0.5) * a, dz = (hash3(x, y, z, 2) - 0.5) * a;
    const dy = floorLevel ? 0 : (hash3(x, y, z, 3) - 0.5) * a * 0.8;
    this.pos.push(x + dx, y + dy, z + dz);
    this.uv.push(u, w);
    // darker low down and in the corners, and a little patchy
    const shade = (0.62 + 0.38 * Math.min(1, Math.max(0, y - y0) / 1.6)) * (0.82 + 0.18 * hash3(x, y, z, 4));
    this.col.push(shade, shade * 0.97, shade * 0.92);
  }
  /** A quad from corner o along edge ue and edge we, split into nu by nw pieces. y0: the floor it stands on, for shading. */
  quad(o: number[], ue: number[], we: number[], nu: number, nw: number, uvScale: number, uv0: number[], flatY: (y: number) => boolean, y0 = 0) {
    for (let a = 0; a < nu; a++) for (let b = 0; b < nw; b++) {
      const pts = [[a, b], [a + 1, b], [a + 1, b + 1], [a, b], [a + 1, b + 1], [a, b + 1]];
      for (const [p, q] of pts) {
        const fu = p / nu, fw = q / nw;
        const x = o[0] + ue[0] * fu + we[0] * fw, y = o[1] + ue[1] * fu + we[1] * fw, z = o[2] + ue[2] * fu + we[2] * fw;
        const lu = Math.hypot(ue[0], ue[1], ue[2]) * fu, lw = Math.hypot(we[0], we[1], we[2]) * fw;
        this.v(x, y, z, (uv0[0] + lu) / uvScale, (uv0[1] + lw) / uvScale, flatY(y), y0);
      }
    }
  }
  /**
   * A four-cornered patch (corners in order round it), split into nu by nw pieces, positions and
   * texture coordinates blended between the corners.
   */
  quad4(p: number[][], uv: number[][], nu: number, nw: number, flatY: (y: number) => boolean, y0 = 0) {
    const at = (fu: number, fw: number) => {
      const out = [0, 0, 0, 0, 0];
      const wts = [(1 - fu) * (1 - fw), fu * (1 - fw), fu * fw, (1 - fu) * fw];
      for (let c = 0; c < 4; c++) {
        for (let d = 0; d < 3; d++) out[d] += p[c][d] * wts[c];
        out[3] += uv[c][0] * wts[c]; out[4] += uv[c][1] * wts[c];
      }
      return out;
    };
    for (let a = 0; a < nu; a++) for (let b = 0; b < nw; b++) {
      for (const [q, r] of [[a, b], [a + 1, b], [a + 1, b + 1], [a, b], [a + 1, b + 1], [a, b + 1]]) {
        const v = at(q / nu, r / nw);
        this.v(v[0], v[1], v[2], v[3], v[4], flatY(v[1]), y0);
      }
    }
  }
  get empty() { return this.pos.length === 0; }
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.computeVertexNormals();
    return g;
  }
}

/** Heights a wall is split at, the same everywhere, so neighbouring walls share their edges. */
function splits(y0: number, y1: number, under = false) {
  // walls standing on a floor start on the same grid of heights too, well under it, so neighbours' edges meet exactly
  if (under) y0 = Math.floor((y0 - 0.3) / 0.9) * 0.9;
  const out = [y0];
  for (let y = Math.floor(y0 / 0.9) * 0.9 + 0.9; y < y1 - 0.2; y += 0.9) if (y > y0 + 0.2) out.push(y);
  out.push(y1);
  return out;
}

/** Molten rock, glowing, for the lava caverns. */
function lavaTex(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  const r = rng(77);
  g.fillStyle = "#ff5a0a";
  g.fillRect(0, 0, 128, 128);
  for (let n = 0; n < 260; n++) {
    const x = r() * 128, y = r() * 128, s = 4 + r() * 16;
    g.fillStyle = r() < 0.5 ? `rgba(255,${190 + r() * 60},60,${0.4 + r() * 0.4})` : `rgba(${90 + r() * 60},20,5,${0.5 + r() * 0.4})`;
    for (const [ox, oy] of [[0, 0], [128, 0], [-128, 0], [0, 128], [0, -128]]) { g.beginPath(); g.ellipse(x + ox, y + oy, s, s * 0.6, r() * 3, 0, 6.3); g.fill(); }
  }
  return pixelTex(c, 32, 32, 12, 77);
}

/** Old ice: pale blue, with cracks and trapped bubbles. */
function iceTex(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  const r = rng(91);
  g.fillStyle = "#a9cfe0";
  g.fillRect(0, 0, 128, 128);
  for (let n = 0; n < 40; n++) {
    g.strokeStyle = `rgba(255,255,255,${0.3 + r() * 0.5})`;
    g.lineWidth = 1;
    g.beginPath();
    let x = r() * 128, y = r() * 128;
    g.moveTo(x, y);
    for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 40; y += (r() - 0.5) * 40; g.lineTo(x, y); }
    g.stroke();
  }
  for (let n = 0; n < 60; n++) { g.fillStyle = `rgba(230,250,255,${0.3 + r() * 0.4})`; g.fillRect(r() * 128, r() * 128, 2, 2); }
  return pixelTex(c, 32, 32, 14, 91);
}

/** Dressed Bath stone in courses: cut blocks, fine joints, the odd darker or stained block. */
function ashlarTex(seed: number): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  const r = rng(seed * 13 + 5);
  g.fillStyle = "#3a3226";
  g.fillRect(0, 0, 256, 256);
  const rows = 4;
  for (let row = 0; row < rows; row++) {
    const y = (row * 256) / rows, hgt = 256 / rows;
    let x = row % 2 ? -64 : 0;
    while (x < 256) {
      const wdt = 96 + Math.floor(r() * 3) * 16;
      const tone = 185 + r() * 40, warm = r() * 18;
      g.fillStyle = `rgb(${tone + warm},${tone - 4},${tone - 26 - warm})`;
      g.fillRect(x + 3, y + 3, wdt - 6, hgt - 6);
      // tooling marks and weathering
      for (let n = 0; n < 40; n++) { g.fillStyle = `rgba(${r() < 0.5 ? "255,250,235" : "90,75,55"},${0.06 + r() * 0.1})`; g.fillRect(x + 4 + r() * (wdt - 10), y + 4 + r() * (hgt - 10), 2 + r() * 10, 1 + r() * 2); }
      if (r() < 0.25) { g.fillStyle = `rgba(60,45,25,${0.15 + r() * 0.2})`; g.fillRect(x + 3, y + hgt * (0.4 + r() * 0.5), wdt - 6, hgt * 0.5); }
      g.fillStyle = "rgba(255,245,220,0.25)"; g.fillRect(x + 3, y + 3, wdt - 6, 2);
      if (x + wdt > 256) { g.drawImage(c, x, y, wdt, hgt, x - 256, y, wdt, hgt); }
      x += wdt;
    }
  }
  return pixelTex(c, 256, 256, 64, seed);
}

/** Red brick lining, as the Victorians put in to hold bad ground. */
function brickTex(seed: number): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  const r = rng(seed * 7 + 11);
  g.fillStyle = "#4a4038";
  g.fillRect(0, 0, 256, 256);
  const rows = 10, bw = 64, bh = 256 / rows;
  for (let row = 0; row < rows; row++) {
    for (let x = row % 2 ? -bw / 2 : 0; x < 256; x += bw) {
      const t = r();
      g.fillStyle = `rgb(${120 + t * 50},${50 + t * 25 + r() * 10},${35 + t * 15})`;
      g.fillRect(x + 2, row * bh + 2, bw - 4, bh - 4);
      if (r() < 0.2) { g.fillStyle = "rgba(20,15,10,0.35)"; g.fillRect(x + 2, row * bh + 2, bw - 4, bh - 4); }
      if (r() < 0.15) { g.fillStyle = "rgba(230,230,210,0.25)"; g.fillRect(x + 2, row * bh + bh / 2, bw - 4, bh / 2 - 2); }
    }
  }
  // soot and seep stains running down
  for (let n = 0; n < 6; n++) { const x = r() * 256; g.fillStyle = `rgba(15,10,5,${0.1 + r() * 0.15})`; g.fillRect(x, 0, 8 + r() * 20, 256); }
  return pixelTex(c, 256, 256, 64, seed);
}

/** Big worn flagstones. */
function flagsTex(seed: number): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  const r = rng(seed * 5 + 3);
  g.fillStyle = "#2a241c";
  g.fillRect(0, 0, 256, 256);
  for (let row = 0; row < 2; row++) {
    let x = row ? -40 : 0;
    while (x < 256) {
      const wdt = 80 + r() * 60, tone = 120 + r() * 50;
      g.fillStyle = `rgb(${tone},${tone - 8},${tone - 22})`;
      g.fillRect(x + 3, row * 128 + 3, wdt - 6, 122);
      for (let n = 0; n < 50; n++) { g.fillStyle = `rgba(${r() < 0.5 ? "220,210,190" : "40,32,22"},${0.08 + r() * 0.12})`; g.fillRect(x + r() * wdt, row * 128 + r() * 128, 2 + r() * 6, 2 + r() * 6); }
      x += wdt;
    }
  }
  return pixelTex(c, 256, 256, 64, seed);
}

/** The texture for a kind of rock wall. */
export function rockTex(style: (typeof ROCKS)[number], seed: number): THREE.CanvasTexture {
  if (style === "ashlar") return ashlarTex(seed);
  if (style === "brick") return brickTex(seed);
  return rockStyle(style, seed, 256);
}
/** How hacked about each kind of wall is: dressed stone and brick are flat. */
/** How far back from a corner an angled wall cuts it off. */
const CHAMFER = 0.8;
/** Rock walls run on up past the roof, so a roughened roof edge never shows a gap above them. */
const WALL_OVER = 0.6;
/** How high water stands over a wading floor, and over a deep one. */
export const WATER_SHALLOW = 0.22, WATER_DEEP = 1.0;
const ROUGH: Record<(typeof ROCKS)[number], number> = { oolite: 0.32, ochre: 0.38, soot: 0.32, flow: 0.5, fossil: 0.34, spar: 0.45, ashlar: 0.04, brick: 0.03 };

/** Dark mine water, with ripples of light on it. */
function waterTex(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  const r = rng(53);
  g.fillStyle = "#1e3a3e";
  g.fillRect(0, 0, 128, 128);
  for (let n = 0; n < 90; n++) {
    const x = r() * 128, y = r() * 128, l = 6 + r() * 20;
    g.strokeStyle = `rgba(${150 + r() * 80},${200 + r() * 55},${210 + r() * 45},${0.12 + r() * 0.25})`;
    g.lineWidth = 1 + r() * 1.5;
    for (const [ox, oy] of [[0, 0], [128, 0], [-128, 0], [0, 128], [0, -128]]) { g.beginPath(); g.ellipse(x + ox, y + oy, l, l * 0.3, 0, 0, Math.PI * (0.6 + r() * 0.8)); g.stroke(); }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface ChestObj { group: THREE.Group; lid: THREE.Object3D; x: number; z: number; opened: boolean; item: string }

export class MineLevel {
  readonly group = new THREE.Group();
  readonly chests: ChestObj[] = [];
  readonly exit: { x: number; z: number };
  private solid: Uint8Array;     // can't walk into (rock, a closed door, deep water, a block...)
  private air: Uint8Array;       // can see and shoot through (not rock or a closed secret door)
  private grille: THREE.Object3D;
  private daylight: THREE.Object3D | null = null;
  /** On the first level, the ladder back up the cellar to 1 The Firs, by where you came down. */
  readonly upLadder: { x: number; z: number } | null = null;
  private flames: THREE.Sprite[] = [];
  private lava: THREE.Texture | null = null;
  private waterTex: THREE.Texture | null = null;
  /** Height above your feet of the tallest thing the last collide() pushed you off (see Player). */
  lastBlock = -1;
  /** Each cell's floor height at its four corners (see corners()). */
  readonly corners: Float32Array;
  /** Whether each cell's floor follows its corners (a slope) or is flat at its own height (lava, a bridge...). */
  private sloped: Uint8Array;
  /** Bits for which of each cell's corners are cut off at an angle. */
  readonly chamfer: Uint8Array;

  constructor(readonly L: Level) {
    const { w, h, open, roof, fl, surf } = L;
    this.solid = new Uint8Array(w * h);
    this.air = new Uint8Array(open);
    for (let k = 0; k < open.length; k++) this.solid[k] = open[k] ? 0 : 1;
    for (const b of L.blocks) this.solid[Math.floor(b[1] / CELL) * w + Math.floor(b[0] / CELL)] = 1;
    for (const p of L.props) if (p.solid) this.solid[Math.floor(p.z / CELL) * w + Math.floor(p.x / CELL)] = 1;
    this.solid[L.exit.j * w + L.exit.i] = 1;
    this.exit = { x: (L.exit.i + 0.5) * CELL, z: (L.exit.j + 0.5) * CELL };

    // Floors slope instead of stepping: wherever the cells round a corner are within a step of each
    // other, they all meet at the corner, at their average height. Lava stays flat, and drops are drops.
    this.corners = new Float32Array(w * h * 4);
    this.sloped = new Uint8Array(w * h);
    const smooth = (i: number, j: number) => i >= 0 && j >= 0 && i < w && j < h && open[j * w + i] === 1 && (surf[j * w + i] === 0 || surf[j * w + i] === 2);
    const shared = new Float32Array((w + 1) * (h + 1)).fill(NaN);
    for (let cj = 0; cj <= h; cj++) for (let ci = 0; ci <= w; ci++) {
      const hs: number[] = [];
      for (const [i, j] of [[ci - 1, cj - 1], [ci, cj - 1], [ci - 1, cj], [ci, cj]]) if (smooth(i, j)) hs.push(fl[j * w + i]);
      if (hs.length && Math.max(...hs) - Math.min(...hs) <= STEP + 0.01) shared[cj * (w + 1) + ci] = hs.reduce((a, b) => a + b, 0) / hs.length;
    }
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const k = j * w + i, sm = smooth(i, j) && !(i === L.exit.i && j === L.exit.j);
      this.sloped[k] = sm ? 1 : 0;
      [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]].forEach(([ci, cj], c) => {
        const v = shared[cj * (w + 1) + ci];
        this.corners[k * 4 + c] = sm && !Number.isNaN(v) ? v : fl[k];
      });
    }
    // corners with rock both sides are cut off (not by the winze, or where a puzzle hangs off the wall)
    this.chamfer = new Uint8Array(w * h);
    const rockAt = (i: number, j: number) => !(i >= 0 && j >= 0 && i < w && j < h && open[j * w + i] === 1);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      if (!open[j * w + i] || (i === L.exit.i && j === L.exit.j)) continue;
      let bits = 0;
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([dx, dz], c) => { if (rockAt(i + dx, j) && rockAt(i, j + dz) && rockAt(i + dx, j + dz)) bits |= 1 << c; });
      this.chamfer[j * w + i] = bits;
    }

    // ---- the rock --------------------------------------------------------------------------------
    // one mesh per kind of stone for walls and roofs, one per kind of floor
    const walls = ROCKS.map((s) => new Mesher(ROUGH[s])), roofs = ROCKS.map((s) => new Mesher(Math.max(0.2, ROUGH[s])));
    // floors aren't nudged sideways: it does nothing on the flat and opens cracks where they meet the walls
    const floors = [...FLOORS, "ice", "lava"].map(() => new Mesher(0));
    const isOpen = (i: number, j: number) => i >= 0 && j >= 0 && i < w && j < h && open[j * w + i] === 1;
    const CH = this.corners, cut = this.chamfer, C = CHAMFER;
    // corners of a cell, in order round it: (x0,z0) (x1,z0) (x1,z1) (x0,z1)
    const cornerXZ = (i: number, j: number, c: number) => [(i + (c === 1 || c === 2 ? 1 : 0)) * CELL, (j + (c >= 2 ? 1 : 0)) * CELL];
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      if (!isOpen(i, j)) continue;
      const k = j * w + i;
      const x0 = i * CELL, z0 = j * CELL, rf = roof[k], f0 = fl[k];
      const hc = [CH[k * 4], CH[k * 4 + 1], CH[k * 4 + 2], CH[k * 4 + 3]];
      const lo = Math.min(...hc);
      if (!(i === L.exit.i && j === L.exit.j)) {
        // the floor, following its corners: slopes where it rises to meet a neighbour
        const fm = floors[surf[k] === 1 ? FLOORS.length + 1 : surf[k] === 2 ? FLOORS.length : L.floor[k]];
        const pts = [3, 2, 1, 0].map((c) => { const [x, z] = cornerXZ(i, j, c); return [x, hc[c], z]; });
        fm.quad4(pts, pts.map((q) => [q[0] / CELL, -q[2] / CELL]), 2, 2, () => true, f0);
      }
      roofs[L.rock[k]].quad([x0, rf, z0], [CELL, 0, 0], [0, 0, CELL], 2, 2, CELL, [x0, z0], () => false, f0);
      // the corners of the cell with rock both sides of them are cut off at an angle
      const cuts: number[][] = [];
      for (let c = 0; c < 4; c++) if (cut[k] & (1 << c)) {
        const [cx, cz] = cornerXZ(i, j, c), sx = c === 0 || c === 3 ? 1 : -1, sz = c < 2 ? 1 : -1;
        cuts.push([cx, cz]);
        let p1 = [cx, cz + sz * C], p2 = [cx + sx * C, cz];
        if (sx * sz < 0) [p1, p2] = [p2, p1];
        const ys = splits(lo, rf + WALL_OVER, true);
        const rk = L.rock[(j - sz) * w + i] ?? L.rock[k];
        for (let s2 = 0; s2 < ys.length - 1; s2++) walls[rk].quad([p1[0], ys[s2], p1[1]], [p2[0] - p1[0], 0, p2[1] - p1[1]], [0, ys[s2 + 1] - ys[s2], 0], 1, 1, CELL, [p1[0] + p1[1], ys[s2]], () => false, f0);
      }
      for (const [di, dj] of DIRS) {
        const ni = i + di, nj = j + dj;
        const nOpen = isOpen(ni, nj);
        const nk = nj * w + ni;
        // the wall face on the edge shared with the neighbour, facing into this cell, and which of
        // this cell's corners are at its two ends
        let o: number[], ue: number[], ca: number, cb: number;
        if (di === 1) { o = [x0 + CELL, 0, z0]; ue = [0, 0, CELL]; ca = 1; cb = 2; }
        else if (di === -1) { o = [x0, 0, z0 + CELL]; ue = [0, 0, -CELL]; ca = 3; cb = 0; }
        else if (dj === 1) { o = [x0 + CELL, 0, z0 + CELL]; ue = [-CELL, 0, 0]; ca = 2; cb = 3; }
        else { o = [x0, 0, z0]; ue = [CELL, 0, 0]; ca = 0; cb = 1; }
        if (!nOpen) {
          // rock: a wall from below the floor to the roof, shortened where a corner's cut off
          let ax = o[0], az = o[2], bx = o[0] + ue[0], bz = o[2] + ue[2];
          const ux = ue[0] / CELL, uz = ue[2] / CELL;
          for (const [cx, cz] of cuts) {
            if (Math.abs(cx - ax) < 1e-3 && Math.abs(cz - az) < 1e-3) { ax += ux * C; az += uz * C; }
            if (Math.abs(cx - bx) < 1e-3 && Math.abs(cz - bz) < 1e-3) { bx -= ux * C; bz -= uz * C; }
          }
          const ys = splits(lo, rf + WALL_OVER, true), rk = L.rock[nk] ?? L.rock[k];
          const short = Math.hypot(bx - ax, bz - az) < CELL - 0.01;
          for (let s2 = 0; s2 < ys.length - 1; s2++) walls[rk].quad([ax, ys[s2], az], [bx - ax, 0, bz - az], [0, ys[s2 + 1] - ys[s2], 0], short ? 1 : 2, 1, CELL, [(di ? z0 : x0) + (short ? 0 : 0), ys[s2]], () => false, f0);
          continue;
        }
        // where the neighbour's floor is higher along this edge, a face up to it (a step, or a ledge)
        const ea = hc[ca], eb = hc[cb];
        // the neighbour's own heights at the same two points
        const nAt = (x: number, z: number) => CH[nk * 4 + [0, 1, 2, 3].find((c) => { const [cx, cz] = cornerXZ(ni, nj, c); return Math.abs(cx - x) < 1e-3 && Math.abs(cz - z) < 1e-3; })!];
        const nA = nAt(o[0], o[2]), nB = nAt(o[0] + ue[0], o[2] + ue[2]);
        if (nA > ea + 1e-3 || nB > eb + 1e-3) {
          const ta = Math.min(Math.max(nA, ea), rf), tb = Math.min(Math.max(nB, eb), rf);
          walls[L.rock[nk]].quad4([[o[0], ea, o[2]], [o[0] + ue[0], eb, o[2] + ue[2]], [o[0] + ue[0], tb, o[2] + ue[2]], [o[0], ta, o[2]]],
            [[0, ea / CELL], [1, eb / CELL], [1, tb / CELL], [0, ta / CELL]], 2, 1, () => false, f0);
        }
        if (roof[nk] < rf - 1e-3) {
          const ys = splits(Math.max(roof[nk], lo), rf);
          for (let s2 = 0; s2 < ys.length - 1; s2++) walls[L.rock[k]].quad([o[0], ys[s2], o[2]], ue, [0, ys[s2 + 1] - ys[s2], 0], 2, 1, CELL, [di ? z0 : x0, ys[s2]], () => false, f0);
        }
      }
    }
    const texs: THREE.Texture[] = [];
    // painted, not blocky: full resolution, smoothly filtered
    const keep = <T extends THREE.Texture>(t: T) => { t.magFilter = THREE.LinearFilter; t.anisotropy = 4; t.needsUpdate = true; texs.push(t); return t; };
    const add = (m: Mesher, mat: THREE.Material) => {
      if (m.empty) return;
      const mesh = new THREE.Mesh(m.build(), mat);
      mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
    };
    ROCKS.forEach((style, n) => {
      if (walls[n].empty && roofs[n].empty) return;
      const t = keep(rockTex(style, 3 + n));
      add(walls[n], new THREE.MeshLambertMaterial({ map: t, vertexColors: true, flatShading: true }));
      add(roofs[n], new THREE.MeshLambertMaterial({ map: t, vertexColors: true, flatShading: true, color: "#9a948a" }));
    });
    FLOORS.forEach((style, n) => {
      if (!floors[n].empty) add(floors[n], new THREE.MeshLambertMaterial({ map: keep(style === "flags" ? flagsTex(5 + n) : floorStyle(style, 5 + n, 256)), vertexColors: true, flatShading: true }));
    });
    if (!floors[FLOORS.length].empty) add(floors[FLOORS.length], new THREE.MeshPhongMaterial({ map: keep(iceTex()), vertexColors: true, shininess: 90, specular: "#cfefff", emissive: "#0b1a22" }));
    if (!floors[FLOORS.length + 1].empty) {
      this.lava = keep(lavaTex());
      add(floors[FLOORS.length + 1], new THREE.MeshBasicMaterial({ map: this.lava, color: "#ffb080" }));
    }

    // water: a sheet over each wet cell, wading depth or deep enough to swim
    const wpos: number[] = [], wuv: number[] = [];
    for (let k = 0; k < w * h; k++) {
      if (!open[k] || (surf[k] !== 3 && surf[k] !== 4)) continue;
      const i = k % w, j = Math.floor(k / w), x0 = i * CELL, z0 = j * CELL, y = fl[k] + (surf[k] === 4 ? WATER_DEEP : WATER_SHALLOW);
      for (const [x, z] of [[x0, z0], [x0, z0 + CELL], [x0 + CELL, z0 + CELL], [x0, z0], [x0 + CELL, z0 + CELL], [x0 + CELL, z0]]) { wpos.push(x, y, z); wuv.push(x / 6, z / 6); }
    }
    if (wpos.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(wpos, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(wuv, 2));
      g.computeVertexNormals();
      this.waterTex = keep(waterTex());
      const m = new THREE.Mesh(g, new THREE.MeshPhongMaterial({ map: this.waterTex, color: "#9fc8cc", emissive: "#06171a", shininess: 90, specular: "#a0d8e0", transparent: true, opacity: 0.78, depthWrite: false, side: THREE.DoubleSide }));
      m.renderOrder = 2;
      this.group.add(m);
    }

    // ---- things in the mine ------------------------------------------------------------------------
    const woodMat = new THREE.MeshLambertMaterial({ map: wood() });
    const iron = new THREE.MeshLambertMaterial({ color: "#2e2b29" });
    const stoneTex = keep(rockStyle("oolite", 3));
    const stoneMat = new THREE.MeshLambertMaterial({ map: stoneTex, color: "#e6dcc4" });

    // the winze: a stone collar round a shaft, a ladder going down, and a grille over it
    const ex = this.exit.x, ez = this.exit.z, ey = this.ground(ex, ez);
    const collar = new THREE.Group();
    for (const [dx, dz, sx, sz] of [[0, -0.9, 2, 0.2], [0, 0.9, 2, 0.2], [-0.9, 0, 0.2, 2], [0.9, 0, 0.2, 2]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.55, sz), stoneMat);
      b.position.set(ex + dx, 0.275, ez + dz);
      collar.add(b);
    }
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(1.6, 6, 1.6), new THREE.MeshBasicMaterial({ color: "#050403", side: THREE.BackSide }));
    shaft.position.set(ex, -3, ez);
    collar.add(shaft);
    for (const s of [-0.25, 0.25]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 4.5, 0.06), woodMat);
      rail.position.set(ex + s, -1.6, ez - 0.7);
      collar.add(rail);
    }
    for (let y = 0.4; y > -3.5; y -= 0.35) {
      const rung = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.05, 0.05), woodMat);
      rung.position.set(ex, y, ez - 0.7);
      collar.add(rung);
    }
    collar.position.y = ey;
    this.group.add(collar);
    const grille = new THREE.Group();
    for (let k = -3; k <= 3; k++) {
      const a = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 1.7), iron);
      a.position.set(ex + k * 0.24, ey + 0.58, ez);
      const b = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.06, 0.05), iron);
      b.position.set(ex, ey + 0.6, ez + k * 0.24);
      grille.add(a, b);
    }
    this.grille = grille;
    this.group.add(grille);
    if (L.boss) {
      // the way out of the last level is up a shaft to daylight
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.1, 14, 12, 1, true),
        new THREE.MeshBasicMaterial({ color: "#fff4d0", transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
      beam.position.set(ex, ey + 7, ez);
      beam.visible = false;
      this.daylight = beam;
      this.group.add(beam);
    }

    // the first level: a ladder by where you came in, up a lit shaft to the cellar of 1 The Firs
    if (L.depth === 1) {
      const sx = L.start.x, sz = L.start.z;
      let at: [number, number] | null = null;
      for (const a of [0, Math.PI, Math.PI / 2, -Math.PI / 2].map((d) => L.start.yaw + d)) {
        // behind you first: forward is (-sin, -cos)
        const x = sx + Math.sin(a) * 1.6, z = sz + Math.cos(a) * 1.6;
        if (this.isOpen(Math.floor(x / CELL), Math.floor(z / CELL)) && this.los(sx, sz, x, z)) { at = [x, z]; break; }
      }
      if (at) {
        const [x, z] = at, y = this.ground(x, z), top = this.roofAt(x, z) + 1.5;
        const ladder = new THREE.Group();
        for (const s of [-0.24, 0.24]) {
          const rail = new THREE.Mesh(new THREE.BoxGeometry(0.07, top - y, 0.07), woodMat);
          rail.position.set(s, (top - y) / 2, 0);
          ladder.add(rail);
        }
        for (let h = 0.3; h < top - y; h += 0.32) {
          const rung = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.05), woodMat);
          rung.position.set(0, h, 0);
          ladder.add(rung);
        }
        ladder.position.set(x, y, z);
        ladder.rotation.y = Math.atan2(x - sx, z - sz);
        this.group.add(ladder);
        // warm lamplight spilling down from the cellar above
        const glowUp = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 3, 12, 1, true),
          new THREE.MeshBasicMaterial({ color: "#ffd9a0", transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
        glowUp.position.set(x, this.roofAt(x, z) - 0.5, z);
        this.group.add(glowUp);
        this.upLadder = { x, z };
      }
    }

    const chestInside = new THREE.MeshLambertMaterial({ color: 0x140d08 });
    const chestIron = new THREE.MeshLambertMaterial({ color: 0x3a3532 });
    for (const c of L.chests) {
      const g = new THREE.Group();
      // a hollow box, so an opened chest is plainly empty: thin planks round a dark inside
      const body = new THREE.Group();
      const T = 0.07;
      for (const [sx, sy, sz, px, py, pz, m] of [
        [1, T, 0.62, 0, T / 2, 0, woodMat], [1, 0.5, T, 0, 0.25, 0.31 - T / 2, woodMat], [1, 0.5, T, 0, 0.25, -0.31 + T / 2, woodMat],
        [T, 0.5, 0.62, 0.5 - T / 2, 0.25, 0, woodMat], [T, 0.5, 0.62, -0.5 + T / 2, 0.25, 0, woodMat],
        [1 - 2 * T, 0.01, 0.62 - 2 * T, 0, T + 0.005, 0, chestInside],
        // iron straps down the front and back
        [0.07, 0.52, 0.02, 0.3, 0.25, 0.32, chestIron],
        [0.07, 0.52, 0.02, 0.3, 0.25, -0.32, chestIron],
        [0.07, 0.52, 0.02, -0.3, 0.25, 0.32, chestIron],
        [0.07, 0.52, 0.02, -0.3, 0.25, -0.32, chestIron],
      ] as [number, number, number, number, number, number, THREE.Material][]) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m);
        b.position.set(px, py, pz);
        body.add(b);
      }
      const lidPivot = new THREE.Group();
      const lid = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.14, 0.64), woodMat);
      lid.position.set(0, 0.07, 0.32);
      lidPivot.add(lid);
      lidPivot.position.set(0, 0.5, -0.32);
      g.add(body, lidPivot);
      const x = (c.i + 0.5) * CELL, z = (c.j + 0.5) * CELL;
      g.position.set(x, this.ground(x, z), z);
      g.rotation.y = hash3(x, 0, z) * Math.PI * 2;
      this.group.add(g);
      this.chests.push({ group: g, lid: lidPivot, x, z, opened: false, item: c.item });
    }

    // candles: the lights themselves come from a small pool moved to the nearest ones (MineGame)
    const glowTex = glow();
    const wax = new THREE.MeshLambertMaterial({ color: "#efe6cf", emissive: "#3a2a10" });
    const bowl = new THREE.MeshLambertMaterial({ color: "#3a2e24" });
    for (const [x, y, z, kind] of L.lamps) {
      if (kind === 2) {
        // a brazier: an iron bowl of coals on three legs, and a big fire
        const g = new THREE.Group();
        for (let k = 0; k < 3; k++) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.0, 0.07), bowl);
          leg.position.set(Math.cos(k * 2.1) * 0.3, 0.5, Math.sin(k * 2.1) * 0.3);
          leg.rotation.set(Math.sin(k * 2.1) * 0.25, 0, -Math.cos(k * 2.1) * 0.25);
          g.add(leg);
        }
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.3, 0.32, 10, 1, true), new THREE.MeshLambertMaterial({ color: "#3a2e24", side: THREE.DoubleSide }));
        b.position.y = 1.1;
        const coals = new THREE.Mesh(new THREE.CircleGeometry(0.46, 10), new THREE.MeshBasicMaterial({ color: "#ff6a1a" }));
        coals.rotation.x = -Math.PI / 2;
        coals.position.y = 1.2;
        g.add(b, coals);
        g.position.set(x, y, z);
        this.group.add(g);
        for (const [s, dy] of [[0.8, 1.6], [0.5, 1.95]]) {
          const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: "#ff9a40", depthWrite: false, blending: THREE.AdditiveBlending }));
          f.position.set(x, y + dy, z);
          f.scale.setScalar(s);
          this.flames.push(f);
          this.group.add(f);
        }
        continue;
      }
      if (kind) continue;
      const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.18, 6), wax);
      candle.position.set(x, y, z);
      const ledge = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.3), stoneMat);
      ledge.position.set(x, y - 0.12, z);
      const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: "#ffc070", depthWrite: false, blending: THREE.AdditiveBlending }));
      flame.position.set(x, y + 0.16, z);
      flame.scale.setScalar(0.45);
      this.flames.push(flame);
      this.group.add(candle, ledge, flame);
    }

    for (const [x, z, s, n] of L.blocks) {
      const y0 = this.ground(x, z);
      for (let k = 0; k < n; k++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(s, 0.6, s * 0.8), stoneMat);
        b.position.set(x + (hash3(x, k, z) - 0.5) * 0.2, y0 + 0.3 + k * 0.6, z + (hash3(z, k, x) - 0.5) * 0.2);
        b.rotation.y = (hash3(x, z, k) - 0.5) * 0.3;
        this.group.add(b);
      }
    }

    for (const m of L.marks) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.48), new THREE.MeshLambertMaterial({ map: graffiti(m.text), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
      p.position.set(m.x + m.nx * 0.2, this.ground(m.x + m.nx * 0.5, m.z + m.nz * 0.5) + 1.75, m.z + m.nz * 0.2);
      p.rotation.y = Math.atan2(m.nx, m.nz);
      this.group.add(p);
    }

    // ---- scenery, merged into a few meshes -------------------------------------------------------------
    const kit = new Props.PropKit(stoneTex);
    for (const p of L.props) {
      const y = p.y !== undefined && p.t !== "web" ? p.y : this.ground(p.x, p.z);
      // builders work from a floor at 0: lift what they make to this floor
      const at: Props.PropKit = Object.create(kit);
      at.add = (geo, mat) => kit.add(geo.translate(0, y, 0), mat);
      const rf = this.roofAt(p.x, p.z) - y, seed = p.seed ?? 1, yaw = p.yaw ?? 0;
      switch (p.t) {
        case "props": Props.pitProps(at, p.x, p.z, yaw, rf); break;
        case "rails": Props.rails(at, p.x, p.z, p.x1 ?? p.x, p.z1 ?? p.z); break;
        case "truck": Props.truck(at, p.x, p.z, yaw, seed % 5 === 0, seed); break;
        case "barrel": Props.barrel(at, p.x, p.z, p.s ?? 1); break;
        case "crate": Props.crate(at, p.x, p.z, yaw, p.s ?? 1); break;
        case "rubble": Props.rubble(at, p.x, p.z, p.s ?? 0.8, seed); break;
        case "stal": Props.stalactites(at, p.x, p.z, rf, seed); break;
        case "crystals": Props.crystals(at, p.x, p.z, seed); break;
        case "bones": Props.bones(at, p.x, p.z, seed); break;
        case "derrick": Props.derrick(at, p.x, p.z, yaw, rf); break;
        case "saw": Props.sawBench(at, p.x, p.z, yaw); break;
        case "manger": Props.manger(at, p.x, p.z, yaw); break;
        case "tools": Props.tools(at, p.x, p.z, yaw, seed); break;
        case "puddle": Props.puddle(at, p.x, p.z, p.s ?? 0.6, seed); break;
        case "web": Props.cobweb(at, p.x, (p.y ?? 1.8), p.z, yaw, 1); break;
        case "chain": Props.chain(at, p.x, p.z, rf, 0.8 + (seed % 10) / 10); break;
        case "stub": Props.candleStub(at, p.x, 0, p.z); break;
      }
    }
    this.group.add(kit.build());
  }

  get lamps() { return this.L.lamps; }

  setGate(open: boolean) {
    this.grille.visible = !open;
    if (this.daylight) this.daylight.visible = open;
  }
  setChest(k: number, opened: boolean) {
    const c = this.chests[k];
    if (!c) return;
    c.opened = opened;
    c.lid.rotation.x = opened ? -1.9 : 0;
  }

  /** Make the candles flicker and the lava churn. */
  update(t: number) {
    for (let k = 0; k < this.flames.length; k++) {
      const f = this.flames[k], base = (f.userData.base ??= f.scale.x);
      f.scale.setScalar(base * (1 + 0.15 * Math.sin(t * 11 + k * 3.1) + 0.1 * Math.sin(t * 23 + k)));
    }
    if (this.lava) this.lava.offset.set(Math.sin(t * 0.1) * 0.3, t * 0.03);
    if (this.waterTex) this.waterTex.offset.set(t * 0.02, Math.sin(t * 0.3) * 0.05);
  }

  // ---- what puzzles change ----------------------------------------------------------------------------

  /** Open or close a cell to walking (a pushed block, deep water, a door). */
  setSolid(i: number, j: number, solid: boolean) { this.solid[j * this.L.w + i] = solid ? 1 : 0; }
  /** Open or close a cell to sight as well (a secret door). */
  setAir(i: number, j: number, air: boolean) { this.air[j * this.L.w + i] = air ? 1 : 0; }

  // ---- queries -------------------------------------------------------------------------------------

  /** Whether you can see and shoot through this cell. */
  isOpen(i: number, j: number) { return i >= 0 && j >= 0 && i < this.L.w && j < this.L.h && this.air[j * this.L.w + i] === 1; }
  isSolidCell(i: number, j: number) { return i < 0 || j < 0 || i >= this.L.w || j >= this.L.h || this.solid[j * this.L.w + i] === 1; }
  /** Whether a walking monster can step from cell a to cell b: not into rock or lava, nor up more than a step. */
  canWalk(ai: number, aj: number, bi: number, bj: number) {
    if (this.isSolidCell(ai, aj) || this.isSolidCell(bi, bj)) return false;
    const w = this.L.w, kb = bj * w + bi;
    return this.L.surf[kb] !== 1 && this.L.surf[kb] !== 4 && this.L.fl[kb] - this.L.fl[aj * w + ai] <= STEP + 0.05;
  }
  isLava(x: number, z: number) {
    const i = Math.floor(x / CELL), j = Math.floor(z / CELL);
    return i >= 0 && j >= 0 && i < this.L.w && j < this.L.h && this.L.surf[j * this.L.w + i] === 1;
  }
  /** 0 dry, 3 wading, 4 swimming. */
  water(x: number, z: number) {
    const i = Math.floor(x / CELL), j = Math.floor(z / CELL);
    const s = i >= 0 && j >= 0 && i < this.L.w && j < this.L.h ? this.L.surf[j * this.L.w + i] : 0;
    return s === 3 || s === 4 ? s : 0;
  }
  isIce(x: number, z: number) {
    const i = Math.floor(x / CELL), j = Math.floor(z / CELL);
    return i >= 0 && j >= 0 && i < this.L.w && j < this.L.h && this.L.surf[j * this.L.w + i] === 2;
  }
  ground(x: number, z: number) {
    const i = Math.floor(x / CELL), j = Math.floor(z / CELL);
    if (!(i >= 0 && j >= 0 && i < this.L.w && j < this.L.h && this.L.open[j * this.L.w + i])) return 0;
    const k = j * this.L.w + i;
    if (!this.sloped[k]) return this.L.fl[k];
    const u = x / CELL - i, v = z / CELL - j, c = this.corners;
    return (c[k * 4] * (1 - u) + c[k * 4 + 1] * u) * (1 - v) + (c[k * 4 + 3] * (1 - u) + c[k * 4 + 2] * u) * v;
  }
  roofAt(x: number, z: number) {
    const i = Math.floor(x / CELL), j = Math.floor(z / CELL);
    return i >= 0 && j >= 0 && i < this.L.w && j < this.L.h && this.L.open[j * this.L.w + i] ? this.L.roof[j * this.L.w + i] : 2.2;
  }

  /**
   * Push a circle of radius r (feet at height y) out of anything it can't get onto: rock, and floors
   * more than a step above its feet. fly: only rock counts. walk (monsters): lava counts too.
   * Mutates and returns pos.
   */
  collide(pos: { x: number; z: number }, y: number, r: number, fly?: boolean) {
    const w = this.L.w, fl = this.L.fl, surf = this.L.surf;
    this.lastBlock = -1;
    const blocks = (i: number, j: number) => {
      if (this.isSolidCell(i, j)) return 3;
      if (fly) return 0;
      const k = j * w + i, up = fl[k] - y;
      if (fly === false && (surf[k] === 1 || surf[k] === 4)) return 3;
      return up > STEP + 0.05 ? up : 0;
    };
    for (let pass = 0; pass < 2; pass++) {
      const ci = Math.floor(pos.x / CELL), cj = Math.floor(pos.z / CELL);
      for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
        if (i === ci && j === cj && !this.isSolidCell(i, j)) continue;
        const b = blocks(i, j);
        if (!b) continue;
        const nx = Math.max(i * CELL, Math.min(pos.x, (i + 1) * CELL)), nz = Math.max(j * CELL, Math.min(pos.z, (j + 1) * CELL));
        const dx = pos.x - nx, dz = pos.z - nz, d = Math.hypot(dx, dz);
        if (d >= r) continue;
        this.lastBlock = Math.max(this.lastBlock, b);
        if (d > 1e-6) { pos.x = nx + (dx / d) * r; pos.z = nz + (dz / d) * r; }
        else {
          // centre inside: push out the shortest way
          const opts = [[i * CELL - r - pos.x, 0], [(i + 1) * CELL + r - pos.x, 0], [0, j * CELL - r - pos.z], [0, (j + 1) * CELL + r - pos.z]];
          opts.sort((a, b) => Math.abs(a[0] + a[1]) - Math.abs(b[0] + b[1]));
          pos.x += opts[0][0]; pos.z += opts[0][1];
        }
      }
    }
    // and off the angled corners
    const ci = Math.floor(pos.x / CELL), cj = Math.floor(pos.z / CELL);
    const bits = ci >= 0 && cj >= 0 && ci < w && cj < this.L.h ? this.chamfer[cj * w + ci] : 0;
    if (bits) for (let c = 0; c < 4; c++) if (bits & (1 << c)) {
      const sx = c === 0 || c === 3 ? 1 : -1, sz = c < 2 ? 1 : -1;
      const cx = (ci + (sx < 0 ? 1 : 0)) * CELL, cz = (cj + (sz < 0 ? 1 : 0)) * CELL;
      // distance in from the cut, along its normal (sx, sz)/sqrt2
      const d = ((pos.x - cx) * sx + (pos.z - cz) * sz) / Math.SQRT2 - CHAMFER / Math.SQRT2;
      if (d < r) { pos.x += (sx / Math.SQRT2) * (r - d); pos.z += (sz / Math.SQRT2) * (r - d); this.lastBlock = Math.max(this.lastBlock, 3); }
    }
    return pos;
  }

  /** Whether you can see from a to b without rock in the way. */
  los(ax: number, az: number, bx: number, bz: number) {
    const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 0.4);
    for (let k = 1; k < n; k++) {
      const x = ax + ((bx - ax) * k) / n, z = az + ((bz - az) * k) / n;
      if (!this.isOpen(Math.floor(x / CELL), Math.floor(z / CELL))) return false;
    }
    return true;
  }

  /** Distance along a ray (in the ground plane) to the rock, up to max. */
  rayToRock(ox: number, oz: number, dx: number, dz: number, max: number) {
    for (let t = 0; t < max; t += 0.1) if (!this.isOpen(Math.floor((ox + dx * t) / CELL), Math.floor((oz + dz * t) / CELL))) return t;
    return max;
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material & { map?: THREE.Texture };
      if (mat) { mat.map?.dispose(); mat.dispose(); }
    });
  }
}
