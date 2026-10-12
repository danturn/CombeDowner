// The wider map round the detailed one (wide.ts: the rest of Bath), drawn in squares of about
// 384 m around the player. A square is built a little at a time once it comes within sight, so the
// game never stalls, and thrown away again once it's left well behind; the fog hides the edge.
// Its terrain, roads, buildings and trees use the same builders and materials as the detailed map
// (world.ts and trees.ts), only with less in them. Nothing here goes over the network.
import * as THREE from "three";
import type { Building, Line, Pond } from "./map";
import type { GameMap } from "./map";
import { buildVegetation, type Vegetation, type VegetationKit } from "./trees";
import type { Wide, WideRoad } from "./wide";

/** What world.ts lends: the terrain's material and colours, and builders for roads and buildings. */
export interface OutskirtsKit {
  terrMat: THREE.Material;
  /** Ground colours by kind (the terrain's palette), and the bare earth of steep slopes. */
  ground: THREE.Color[]; earth: THREE.Color;
  /** Roads, paths, streams and ponds, as meshes. */
  roads(rd: WideRoad[], wl: Line[], wp: Pond[]): THREE.Mesh[];
  /** A batch of buildings: add them one by one, then finish to get the meshes. */
  buildings(): { add(b: Building, bi: number): void; finish(): THREE.Mesh[] };
  vegetation: VegetationKit;
}

export interface Outskirts {
  update(px: number, pz: number, dt: number): void;
}

const LOAD = 600;          // build squares whose nearest edge is closer than this
const DROP = 820;          // and throw them away once it's further than this
const BUDGET = 5;          // milliseconds of building a frame
const BATCH = 60;          // buildings at a time
const ROADS = 30;          // roads at a time

interface Live { ci: number; cj: number; group: THREE.Group; veg?: Vegetation; job: Generator<void>; done: boolean; d: number }

function hash(n: number) {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

export function buildOutskirts(map: GameMap, scene: THREE.Scene, kit: OutskirtsKit): Outskirts {
  const W = map.wide as Wide, Z0 = map.z0;
  const T = map.d.t, [kx0, ky0, step] = W.d.t.ci;
  // the detailed map's cells, in wide cells: none of the wide terrain is drawn there
  const coreI1 = kx0 + Math.round((T.nx - 1) / step), coreJ1 = ky0 + Math.round((T.ny - 1) / step);
  const nci = Math.floor((W.nx - 1) / W.cs), ncj = Math.floor((W.ny - 1) / W.cs);
  const live = new Map<number, Live>();
  const key = (ci: number, cj: number) => ci * 4096 + cj;

  /** A square's terrain: the wide grid's cells in it, less any under the detailed map. */
  const terrain = (ci: number, cj: number): THREE.Mesh | null => {
    const n = W.cs + 1, i0 = ci * W.cs, j0 = cj * W.cs;
    const pos = new Float32Array(n * n * 3), nor = new Float32Array(n * n * 3), col = new Float32Array(n * n * 3), uv = new Float32Array(n * n * 2);
    const c = new THREE.Color();
    for (let b = 0; b < n; b++) for (let a = 0; a < n; a++) {
      const i = i0 + a, j = j0 + b, v = b * n + a, x = W.x0 + i * W.dx, z = -(W.y0 + j * W.dx), h = W.at(i, j);
      pos.set([x, h, z], v * 3);
      uv.set([x / 7, z / 7], v * 2);
      // scene z runs south, so the slope northwards turns round
      const gx = (W.at(i + 1, j) - W.at(i - 1, j)) / (2 * W.dx), gn = (W.at(i, j + 1) - W.at(i, j - 1)) / (2 * W.dx);
      const l = Math.hypot(gx, 1, gn);
      nor.set([-gx / l, 1 / l, gn / l], v * 3);
      const g = j * W.nx + i;
      c.copy(kit.ground[W.k[g]] ?? kit.ground[0]);
      c.lerp(kit.earth, Math.min(0.75, Math.max(0, (Math.hypot(gx, gn) - 0.45) * 1.4)));
      const k = 0.9 + hash(g) * 0.16;
      col.set([c.r * k, c.g * k, c.b * k], v * 3);
    }
    const idx: number[] = [];
    for (let b = 0; b < W.cs; b++) for (let a = 0; a < W.cs; a++) {
      const i = i0 + a, j = j0 + b;
      if (i >= kx0 && i < coreI1 && j >= ky0 && j < coreJ1) continue;   // the detailed map's
      const p = b * n + a, q = p + 1, r = p + n, s = r + 1;
      idx.push(p, q, r, q, s, r);
    }
    if (!idx.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, kit.terrMat);
    m.receiveShadow = true;
    return m;
  };

  function* build(L: Live): Generator<void> {
    const ch = W.chunk(L.ci, L.cj);
    const t = terrain(L.ci, L.cj);
    if (t) L.group.add(t);
    if (!ch) return;
    yield;
    // a few dozen roads at a time: a square of the city has hundreds
    for (let k = 0; k < Math.max(1, ch.rd.length); k += ROADS) {
      const first = k === 0;
      for (const m of kit.roads(ch.rd.slice(k, k + ROADS).map((i) => W.rd[i]), first ? ch.wl.map((i) => W.wl[i]) : [], first ? ch.wp.map((i) => W.wp[i]) : [])) L.group.add(m);
      yield;
    }
    const bb = kit.buildings();
    for (let k = 0; k < ch.bl.length; k++) {
      bb.add(W.bl[ch.bl[k]], 100000 + ch.bl[k]);
      if (k % BATCH === BATCH - 1) yield;
    }
    yield;
    for (const m of bb.finish()) L.group.add(m);
    yield;
    if (ch.tr.length) {
      const trees = ch.tr.map((i) => {
        const x = W.tr[i * 3], y = W.tr[i * 3 + 1];
        return [x, y, W.ground(x, -y) + Z0, W.tr[i * 3 + 2]];
      });
      L.veg = buildVegetation(L.group, trees, [], Z0, kit.vegetation);
    }
  }

  const drop = (L: Live) => {
    L.veg?.dispose();
    L.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    L.group.removeFromParent();
  };

  let wait = 0;
  return {
    update(px, pz, dt) {
      wait -= dt;
      if (wait <= 0) {
        wait = 0.3;
        // which squares are wanted, and which are no longer
        const x = px - W.x0, y = -pz - W.y0, S = W.size;
        const far = (ci: number, cj: number) => Math.hypot(Math.max(0, ci * S - x, x - (ci + 1) * S), Math.max(0, cj * S - y, y - (cj + 1) * S));
        for (const [k, L] of live) {
          L.d = far(L.ci, L.cj);
          if (L.d > DROP) { drop(L); live.delete(k); }
        }
        for (let ci = Math.max(0, Math.floor((x - LOAD) / S)); ci <= Math.min(nci - 1, Math.floor((x + LOAD) / S)); ci++)
          for (let cj = Math.max(0, Math.floor((y - LOAD) / S)); cj <= Math.min(ncj - 1, Math.floor((y + LOAD) / S)); cj++) {
            const d = far(ci, cj);
            if (d > LOAD || live.has(key(ci, cj))) continue;
            const L: Live = { ci, cj, group: new THREE.Group(), job: null!, done: false, d };
            L.job = build(L);
            scene.add(L.group);
            live.set(key(ci, cj), L);
          }
      }
      // build the nearest unfinished squares first, a few milliseconds a frame
      const t0 = performance.now();
      const todo = [...live.values()].filter((L) => !L.done).sort((a, b) => a.d - b.d);
      for (const L of todo) {
        while (!L.done && performance.now() - t0 < BUDGET) L.done = !!L.job.next().done;
        if (performance.now() - t0 >= BUDGET) break;
      }
      for (const L of live.values()) L.veg?.update(px, pz, dt);
    },
  };
}
