// The full-detail squares round the detailed map (built by tools/prep_tiles.py into
// public/maps/<id>/<ti>_<tj>.json): the rest of Bath at the same detail as Combe Down, about a
// kilometre a side. Only the squares near the player are loaded. Each is fetched, given a GameMap
// of its own (its ground, walls, roofs and trees, which the main map hands questions to), and its
// scenery is built a few milliseconds a frame (world.ts); squares left far behind are dropped.
//
// Nothing about them goes over the network: every player loads the squares round themselves and
// collides with what they've loaded, as they move themselves; where no square is loaded, the
// simpler wider map (wide.ts) stands in.
import * as THREE from "three";
import { GameMap, tileKey } from "./map";
import type { TileWorld } from "./world";

const LOAD = 560;        // load squares whose nearest edge is closer than this (the fog closes in at 480 m)
const DROP = 900;        // and drop them once it's further than this
const BUDGET = 6;        // milliseconds of building a frame
const FETCHES = 2;       // squares downloading at once

interface Tile {
  ti: number; tj: number; d: number;
  map?: GameMap; world?: TileWorld; job?: Generator<void, TileWorld>;
  fetching?: boolean; failed?: boolean; gone?: boolean;
}

export class Tiles {
  private live = new Map<number, Tile>();
  private exists: Set<number>;
  private wait = 0;

  constructor(private core: GameMap, private scene: THREE.Scene, private build: (m: GameMap) => Generator<void, TileWorld>) {
    this.exists = new Set(core.tileIndex!.tiles.map(([i, j]) => tileKey(i, j)));
  }

  /** The finished scenery of the square at scene (x, z), if it's loaded and built. */
  worldAt(x: number, z: number): TileWorld | undefined {
    const m = this.core.tileAt(x, z);
    if (!m?.d.tile) return undefined;
    return this.live.get(tileKey(m.d.tile[0], m.d.tile[1]))?.world;
  }

  update(px: number, pz: number, dt: number) {
    const I = this.core.tileIndex!, S = I.cells * I.dx;
    const x = px - I.x0, y = -pz - I.y0;
    const far = (ti: number, tj: number) => Math.hypot(Math.max(0, ti * S - x, x - (ti + 1) * S), Math.max(0, tj * S - y, y - (tj + 1) * S));
    this.wait -= dt;
    if (this.wait <= 0) {
      this.wait = 0.3;
      for (const [k, t] of this.live) {
        t.d = far(t.ti, t.tj);
        if (t.d > DROP) { this.drop(t); this.live.delete(k); }
      }
      for (let ti = Math.floor((x - LOAD) / S); ti <= Math.floor((x + LOAD) / S); ti++)
        for (let tj = Math.floor((y - LOAD) / S); tj <= Math.floor((y + LOAD) / S); tj++) {
          const k = tileKey(ti, tj), d = far(ti, tj);
          if (d > LOAD || !this.exists.has(k) || this.live.has(k)) continue;
          this.live.set(k, { ti, tj, d });
        }
      // start the nearest downloads first
      const waiting = [...this.live.values()].filter((t) => !t.map && !t.fetching && !t.failed).sort((a, b) => a.d - b.d);
      let busy = [...this.live.values()].filter((t) => t.fetching).length;
      for (const t of waiting) { if (busy++ >= FETCHES) break; this.fetch(t); }
    }
    // build the nearest unfinished squares, a few milliseconds a frame
    const t0 = performance.now();
    for (const t of [...this.live.values()].filter((t) => t.job && !t.world).sort((a, b) => a.d - b.d)) {
      while (!t.world && performance.now() - t0 < BUDGET) {
        const r = t.job!.next();
        if (r.done) { t.world = r.value; this.scene.add(t.world.group); }
      }
      if (performance.now() - t0 >= BUDGET) break;
    }
    for (const t of this.live.values()) t.world?.update(px, pz, dt);
  }

  private fetch(t: Tile) {
    t.fetching = true;
    fetch(`${this.core.tileBase}${t.ti}_${t.tj}.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        t.fetching = false;
        if (t.gone) return;
        t.map = new GameMap(d);
        this.core.tiles.set(tileKey(t.ti, t.tj), t.map);
        t.job = this.build(t.map);
      })
      .catch((e) => { t.fetching = false; t.failed = true; console.warn(`couldn't load square ${t.ti}, ${t.tj}:`, e); });
  }

  private drop(t: Tile) {
    t.gone = true;
    this.core.tiles.delete(tileKey(t.ti, t.tj));
    t.world?.dispose();
    t.job?.return(undefined as never);
  }

  dispose() {
    for (const t of this.live.values()) this.drop(t);
    this.live.clear();
  }
}
