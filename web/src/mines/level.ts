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
function splits(y0: number, y1: number) {
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

export interface ChestObj { group: THREE.Group; lid: THREE.Object3D; x: number; z: number; opened: boolean; item: string }

export class MineLevel {
  readonly group = new THREE.Group();
  readonly chests: ChestObj[] = [];
  readonly exit: { x: number; z: number };
  private solid: Uint8Array;     // can't walk into (rock, a closed door, deep water, a block...)
  private air: Uint8Array;       // can see and shoot through (not rock or a closed secret door)
  private grille: THREE.Object3D;
  private daylight: THREE.Object3D | null = null;
  private flames: THREE.Sprite[] = [];
  private lava: THREE.Texture | null = null;
  /** Height above your feet of the tallest thing the last collide() pushed you off (see Player). */
  lastBlock = -1;

  constructor(readonly L: Level) {
    const { w, h, open, roof, fl, surf } = L;
    this.solid = new Uint8Array(w * h);
    this.air = new Uint8Array(open);
    for (let k = 0; k < open.length; k++) this.solid[k] = open[k] ? 0 : 1;
    for (const b of L.blocks) this.solid[Math.floor(b[1] / CELL) * w + Math.floor(b[0] / CELL)] = 1;
    for (const p of L.props) if (p.solid) this.solid[Math.floor(p.z / CELL) * w + Math.floor(p.x / CELL)] = 1;
    this.solid[L.exit.j * w + L.exit.i] = 1;
    this.exit = { x: (L.exit.i + 0.5) * CELL, z: (L.exit.j + 0.5) * CELL };

    // ---- the rock --------------------------------------------------------------------------------
    // one mesh per kind of stone for walls and roofs, one per kind of floor
    const walls = ROCKS.map(() => new Mesher(0.32)), roofs = ROCKS.map(() => new Mesher(0.3));
    const floors = [...FLOORS, "ice", "lava"].map(() => new Mesher(0.22));
    const isOpen = (i: number, j: number) => i >= 0 && j >= 0 && i < w && j < h && open[j * w + i] === 1;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      if (!isOpen(i, j)) continue;
      const k = j * w + i;
      const x0 = i * CELL, z0 = j * CELL, rf = roof[k], f0 = fl[k];
      const atFloor = (y: number) => Math.abs(y - f0) < 1e-4;
      if (!(i === L.exit.i && j === L.exit.j)) {
        const fm = floors[surf[k] === 1 ? FLOORS.length + 1 : surf[k] === 2 ? FLOORS.length : L.floor[k]];
        fm.quad([x0, f0, z0 + CELL], [CELL, 0, 0], [0, 0, -CELL], 2, 2, CELL, [x0, -z0 - CELL], () => true, f0);
      }
      roofs[L.rock[k]].quad([x0, rf, z0], [CELL, 0, 0], [0, 0, CELL], 2, 2, CELL, [x0, z0], () => false, f0);
      for (const [di, dj] of DIRS) {
        const ni = i + di, nj = j + dj;
        const nOpen = isOpen(ni, nj);
        const nk = nj * w + ni;
        // the wall face on the edge shared with the neighbour, facing into this cell
        let o: number[], ue: number[];
        if (di === 1) { o = [x0 + CELL, 0, z0]; ue = [0, 0, CELL]; }
        else if (di === -1) { o = [x0, 0, z0 + CELL]; ue = [0, 0, -CELL]; }
        else if (dj === 1) { o = [x0 + CELL, 0, z0 + CELL]; ue = [-CELL, 0, 0]; }
        else { o = [x0, 0, z0]; ue = [CELL, 0, 0]; }
        const face = (y0: number, y1: number, rk: number, flat: (y: number) => boolean) => {
          if (y1 - y0 < 1e-3) return;
          const ys = splits(y0, y1);
          for (let s = 0; s < ys.length - 1; s++) walls[rk].quad([o[0], ys[s], o[2]], ue, [0, ys[s + 1] - ys[s], 0], 2, 1, CELL, [di ? z0 : x0, ys[s]], flat, f0);
        };
        if (!nOpen) { face(f0, rf, L.rock[nk] ?? L.rock[k], atFloor); continue; }
        // a step up to the neighbour's floor, and down from the roof to the neighbour's roof
        const nf = fl[nk];
        if (nf > f0 + 1e-3) face(f0, Math.min(nf, rf), L.rock[nk], (y) => atFloor(y) || Math.abs(y - nf) < 1e-4);
        if (roof[nk] < rf - 1e-3) face(Math.max(roof[nk], f0), rf, L.rock[k], () => false);
      }
    }
    const texs: THREE.Texture[] = [];
    const keep = <T extends THREE.Texture>(t: T) => { texs.push(t); return t; };
    const add = (m: Mesher, mat: THREE.Material) => {
      if (m.empty) return;
      const mesh = new THREE.Mesh(m.build(), mat);
      mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
    };
    ROCKS.forEach((style, n) => {
      if (walls[n].empty && roofs[n].empty) return;
      const t = keep(rockStyle(style, 3 + n));
      add(walls[n], new THREE.MeshLambertMaterial({ map: t, vertexColors: true, flatShading: true }));
      add(roofs[n], new THREE.MeshLambertMaterial({ map: t, vertexColors: true, flatShading: true, color: "#9a948a" }));
    });
    FLOORS.forEach((style, n) => {
      if (!floors[n].empty) add(floors[n], new THREE.MeshLambertMaterial({ map: keep(floorStyle(style, 5 + n)), vertexColors: true, flatShading: true }));
    });
    if (!floors[FLOORS.length].empty) add(floors[FLOORS.length], new THREE.MeshPhongMaterial({ map: keep(iceTex()), vertexColors: true, shininess: 90, specular: "#cfefff", emissive: "#0b1a22" }));
    if (!floors[FLOORS.length + 1].empty) {
      this.lava = keep(lavaTex());
      add(floors[FLOORS.length + 1], new THREE.MeshBasicMaterial({ map: this.lava, color: "#ffb080" }));
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

    for (const c of L.chests) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(1, 0.5, 0.62), woodMat);
      body.position.y = 0.25;
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
    for (const [x, y, z, lava] of L.lamps) {
      if (lava) continue;
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
    for (let k = 0; k < this.flames.length; k++) this.flames[k].scale.setScalar(0.4 + 0.06 * Math.sin(t * 11 + k * 3.1) + 0.04 * Math.sin(t * 23 + k));
    if (this.lava) this.lava.offset.set(Math.sin(t * 0.1) * 0.3, t * 0.03);
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
    return this.L.surf[kb] !== 1 && this.L.fl[kb] - this.L.fl[aj * w + ai] <= STEP + 0.05;
  }
  isLava(x: number, z: number) {
    const i = Math.floor(x / CELL), j = Math.floor(z / CELL);
    return i >= 0 && j >= 0 && i < this.L.w && j < this.L.h && this.L.surf[j * this.L.w + i] === 1;
  }
  isIce(x: number, z: number) {
    const i = Math.floor(x / CELL), j = Math.floor(z / CELL);
    return i >= 0 && j >= 0 && i < this.L.w && j < this.L.h && this.L.surf[j * this.L.w + i] === 2;
  }
  ground(x: number, z: number) {
    const i = Math.floor(x / CELL), j = Math.floor(z / CELL);
    return i >= 0 && j >= 0 && i < this.L.w && j < this.L.h && this.L.open[j * this.L.w + i] ? this.L.fl[j * this.L.w + i] : 0;
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
      if (fly === false && surf[k] === 1) return 3;
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
