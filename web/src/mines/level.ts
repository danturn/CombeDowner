// A generated mine level (gen.ts) turned into something to walk round: the rock as one rough,
// faceted mesh, the things in it (levers, chests, the winze, candles, graffiti), and the queries
// the game needs: floor height, collision and line of sight.
import * as THREE from "three";
import { CELL, Level } from "./gen";
import { floor as floorTex, glow, graffiti, rock, wood } from "./art";

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** A repeatable random number for a point, so shared corners of the rock mesh move together. */
function hash3(x: number, y: number, z: number, salt = 0) {
  let h = Math.imul(Math.round(x * 100) | 0, 374761393) ^ Math.imul(Math.round(y * 100) | 0, 668265263) ^ Math.imul(Math.round(z * 100) | 0, 2147483647) ^ salt;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

class Mesher {
  pos: number[] = []; uv: number[] = []; col: number[] = [];
  constructor(private rough: number) {}
  /** Push a vertex, nudged by a fixed amount for its position so the rock looks hacked out. */
  private v(x: number, y: number, z: number, u: number, w: number, floorLevel: boolean) {
    const a = this.rough;
    const dx = (hash3(x, y, z, 1) - 0.5) * a, dz = (hash3(x, y, z, 2) - 0.5) * a;
    const dy = floorLevel ? 0 : (hash3(x, y, z, 3) - 0.5) * a * 0.8;
    this.pos.push(x + dx, y + dy, z + dz);
    this.uv.push(u, w);
    // darker low down and in the corners, and a little patchy
    const shade = (0.62 + 0.38 * Math.min(1, y / 1.6)) * (0.82 + 0.18 * hash3(x, y, z, 4));
    this.col.push(shade, shade * 0.97, shade * 0.92);
  }
  /** A quad from corner a along edge u (length lu) and edge w (length lw), split into nu by nw pieces. */
  quad(o: number[], ue: number[], we: number[], nu: number, nw: number, uvScale: number, uv0: number[], flatY: (y: number) => boolean) {
    for (let a = 0; a < nu; a++) for (let b = 0; b < nw; b++) {
      const pts = [[a, b], [a + 1, b], [a + 1, b + 1], [a, b], [a + 1, b + 1], [a, b + 1]];
      for (const [p, q] of pts) {
        const fu = p / nu, fw = q / nw;
        const x = o[0] + ue[0] * fu + we[0] * fw, y = o[1] + ue[1] * fu + we[1] * fw, z = o[2] + ue[2] * fu + we[2] * fw;
        const lu = Math.hypot(ue[0], ue[1], ue[2]) * fu, lw = Math.hypot(we[0], we[1], we[2]) * fw;
        this.v(x, y, z, (uv0[0] + lu) / uvScale, (uv0[1] + lw) / uvScale, flatY(y));
      }
    }
  }
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

export interface LeverObj { group: THREE.Group; handle: THREE.Object3D; x: number; z: number; pulled: boolean }
export interface ChestObj { group: THREE.Group; lid: THREE.Object3D; x: number; z: number; opened: boolean; item: string }

export class MineLevel {
  readonly group = new THREE.Group();
  readonly levers: LeverObj[] = [];
  readonly chests: ChestObj[] = [];
  readonly exit: { x: number; z: number };
  private solid: Uint8Array;
  private grille: THREE.Object3D;
  private daylight: THREE.Object3D | null = null;
  private flames: THREE.Sprite[] = [];
  lastBlock = 3;   // nothing in a mine is low enough to vault (see Player)

  constructor(readonly L: Level) {
    const { w, h, open, roof } = L;
    this.solid = new Uint8Array(w * h);
    for (let k = 0; k < open.length; k++) this.solid[k] = open[k] ? 0 : 1;
    for (const b of L.blocks) this.solid[Math.floor(b[1] / CELL) * w + Math.floor(b[0] / CELL)] = 1;
    this.solid[L.exit.j * w + L.exit.i] = 1;
    this.exit = { x: (L.exit.i + 0.5) * CELL, z: (L.exit.j + 0.5) * CELL };

    // ---- the rock --------------------------------------------------------------------------------
    const walls = new Mesher(0.32), floors = new Mesher(0.22), roofs = new Mesher(0.3);
    const isOpen = (i: number, j: number) => i >= 0 && j >= 0 && i < w && j < h && open[j * w + i] === 1;
    const roofOf = (i: number, j: number) => roof[j * w + i];
    const flat = (y: number) => Math.abs(y) < 1e-6;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      if (!isOpen(i, j)) continue;
      const x0 = i * CELL, z0 = j * CELL, rf = roofOf(i, j);
      if (!(i === L.exit.i && j === L.exit.j)) floors.quad([x0, 0, z0 + CELL], [CELL, 0, 0], [0, 0, -CELL], 2, 2, CELL, [x0, -z0 - CELL], flat);
      roofs.quad([x0, rf, z0], [CELL, 0, 0], [0, 0, CELL], 2, 2, CELL, [x0, z0], () => false);
      for (const [di, dj] of DIRS) {
        const ni = i + di, nj = j + dj;
        const nOpen = isOpen(ni, nj);
        const top = rf, bottom = nOpen ? roofOf(ni, nj) : 0;
        if (nOpen && bottom >= top - 1e-4) continue;
        // the wall face on the edge shared with the neighbour, facing into this cell
        let o: number[], ue: number[];
        if (di === 1) { o = [x0 + CELL, 0, z0]; ue = [0, 0, CELL]; }
        else if (di === -1) { o = [x0, 0, z0 + CELL]; ue = [0, 0, -CELL]; }
        else if (dj === 1) { o = [x0 + CELL, 0, z0 + CELL]; ue = [-CELL, 0, 0]; }
        else { o = [x0, 0, z0]; ue = [CELL, 0, 0]; }
        const ys = splits(bottom, top);
        for (let s = 0; s < ys.length - 1; s++) {
          const uvOff = di ? z0 : x0;
          walls.quad([o[0], ys[s], o[2]], ue, [0, ys[s + 1] - ys[s], 0], 2, 1, CELL, [uvOff, ys[s]], flat);
        }
      }
    }
    const rockTex = rock(3), roofTex = rock(8, true), groundTex = floorTex();
    const mats = [
      new THREE.MeshLambertMaterial({ map: rockTex, vertexColors: true, flatShading: true }),
      new THREE.MeshLambertMaterial({ map: groundTex, vertexColors: true, flatShading: true }),
      new THREE.MeshLambertMaterial({ map: roofTex, vertexColors: true, flatShading: true }),
    ];
    for (const [m, mat] of [[walls, mats[0]], [floors, mats[1]], [roofs, mats[2]]] as const) {
      const mesh = new THREE.Mesh(m.build(), mat);
      mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
    }

    // ---- things in the mine ------------------------------------------------------------------------
    const woodMat = new THREE.MeshLambertMaterial({ map: wood() });
    const iron = new THREE.MeshLambertMaterial({ color: "#2e2b29" });
    const stoneMat = new THREE.MeshLambertMaterial({ map: rockTex, color: "#e6dcc4" });

    // the winze: a stone collar round a shaft, a ladder going down, and a grille over it
    const ex = this.exit.x, ez = this.exit.z;
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
    this.group.add(collar);
    const grille = new THREE.Group();
    for (let k = -3; k <= 3; k++) {
      const a = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 1.7), iron);
      a.position.set(ex + k * 0.24, 0.58, ez);
      const b = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.06, 0.05), iron);
      b.position.set(ex, 0.6, ez + k * 0.24);
      grille.add(a, b);
    }
    this.grille = grille;
    this.group.add(grille);
    if (L.boss) {
      // the way out of the last level is up a shaft to daylight
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.1, 14, 12, 1, true),
        new THREE.MeshBasicMaterial({ color: "#fff4d0", transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
      beam.position.set(ex, 7, ez);
      beam.visible = false;
      this.daylight = beam;
      this.group.add(beam);
    }

    for (const l of L.levers) {
      const g = new THREE.Group();
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.08), woodMat);
      const pivot = new THREE.Group();
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.6, 0.07), iron);
      handle.position.y = 0.28;
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshLambertMaterial({ color: "#8a2b1a" }));
      knob.position.y = 0.58;
      pivot.add(handle, knob);
      pivot.position.z = 0.08;
      pivot.rotation.x = -0.7;
      g.add(plate, pivot);
      const x = (l.i + 0.5 - l.nx * 0.95) * CELL, z = (l.j + 0.5 - l.nz * 0.95) * CELL;
      g.position.set(x, 1.15, z);
      g.rotation.y = Math.atan2(l.nx, l.nz);
      this.group.add(g);
      this.levers.push({ group: g, handle: pivot, x, z, pulled: false });
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
      g.position.set(x, 0, z);
      g.rotation.y = hash3(x, 0, z) * Math.PI * 2;
      this.group.add(g);
      this.chests.push({ group: g, lid: lidPivot, x, z, opened: false, item: c.item });
    }

    // candles: the lights themselves come from a small pool moved to the nearest ones (MineGame)
    const glowTex = glow();
    const wax = new THREE.MeshLambertMaterial({ color: "#efe6cf", emissive: "#3a2a10" });
    for (const [x, y, z] of L.lamps) {
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
      for (let k = 0; k < n; k++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(s, 0.6, s * 0.8), stoneMat);
        b.position.set(x + (hash3(x, k, z) - 0.5) * 0.2, 0.3 + k * 0.6, z + (hash3(z, k, x) - 0.5) * 0.2);
        b.rotation.y = (hash3(x, z, k) - 0.5) * 0.3;
        this.group.add(b);
      }
    }

    for (const m of L.marks) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.48), new THREE.MeshLambertMaterial({ map: graffiti(m.text), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
      p.position.set(m.x + m.nx * 0.2, 1.75, m.z + m.nz * 0.2);
      p.rotation.y = Math.atan2(m.nx, m.nz);
      this.group.add(p);
    }
  }

  get lamps() { return this.L.lamps; }

  setGate(open: boolean) {
    this.grille.visible = !open;
    if (this.daylight) this.daylight.visible = open;
  }
  setLever(k: number, pulled: boolean) {
    const l = this.levers[k];
    if (!l) return;
    l.pulled = pulled;
    l.handle.rotation.x = pulled ? 0.7 : -0.7;
  }
  setChest(k: number, opened: boolean) {
    const c = this.chests[k];
    if (!c) return;
    c.opened = opened;
    c.lid.rotation.x = opened ? -1.9 : 0;
  }

  /** Make the candles flicker. */
  update(t: number) {
    for (let k = 0; k < this.flames.length; k++) this.flames[k].scale.setScalar(0.4 + 0.06 * Math.sin(t * 11 + k * 3.1) + 0.04 * Math.sin(t * 23 + k));
  }

  // ---- queries -------------------------------------------------------------------------------------

  isOpen(i: number, j: number) { return i >= 0 && j >= 0 && i < this.L.w && j < this.L.h && this.L.open[j * this.L.w + i] === 1; }
  isSolidCell(i: number, j: number) { return i < 0 || j < 0 || i >= this.L.w || j >= this.L.h || this.solid[j * this.L.w + i] === 1; }
  ground(_x: number, _z: number) { return 0; }
  roofAt(x: number, z: number) {
    const i = Math.floor(x / CELL), j = Math.floor(z / CELL);
    return this.isOpen(i, j) ? this.L.roof[j * this.L.w + i] : 2.2;
  }

  /** Push a circle of radius r out of the rock. Mutates and returns pos. */
  collide(pos: { x: number; z: number }, _y: number, r: number) {
    for (let pass = 0; pass < 2; pass++) {
      const ci = Math.floor(pos.x / CELL), cj = Math.floor(pos.z / CELL);
      for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
        if (!this.isSolidCell(i, j)) continue;
        const nx = Math.max(i * CELL, Math.min(pos.x, (i + 1) * CELL)), nz = Math.max(j * CELL, Math.min(pos.z, (j + 1) * CELL));
        const dx = pos.x - nx, dz = pos.z - nz, d = Math.hypot(dx, dz);
        if (d >= r) continue;
        if (d > 1e-6) { pos.x = nx + (dx / d) * r; pos.z = nz + (dz / d) * r; }
        else {
          // centre inside the rock: push out the shortest way
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
