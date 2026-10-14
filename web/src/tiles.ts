// The full-detail squares round the detailed map (built by tools/prep_tiles.py into
// public/maps/<id>/<ti>_<tj>.json): the rest of Bath at the same detail as Combe Down, about a
// kilometre a side. Only the squares near the player are loaded. Each is fetched, given a GameMap
// of its own (its ground, walls, roofs and trees, which the main map hands questions to) that is
// set up a slice at a time, and its scenery is built a few milliseconds a frame (world.ts), so the
// game never stalls as you go; squares left far behind are dropped.
//
// Nothing about them goes over the network: every player loads the squares round themselves and
// collides with what they've loaded, as they move themselves; where no square is loaded, the
// simpler wider map (wide.ts) stands in. The host also loads the map (not the scenery) of the
// squares round everyone else, as it runs the traffic, chavs, cats and buses wherever they are.
import * as THREE from "three";
import { GameMap, tileKey } from "./map";
import type { TileWorld } from "./world";
import { view } from "./view";
import { maskSetPieces } from "./landmarks/setpieces";

// Squares are built when their nearest edge is closer than view.load (just past the fog: view.ts),
// and dropped once it's further than view.drop.
const BUDGET = 6;        // milliseconds of setting up and building a frame
const FETCHES = 2;       // squares downloading at once
// The host also loads the map of the squares round everyone else (their ground, walls and streets,
// not their scenery), so the traffic, chavs, cats and buses it runs know their way about there.
const NEAR_OTHERS = 220; // squares this close to another player
const FAR_OTHERS = 420;  // kept till they're this far from them
const MAX_OTHERS = 6;    // and no more than this many of those at once

interface Tile {
  ti: number; tj: number;
  d: number; od: number;             // how far its nearest edge is from us, and from anyone else
  map?: GameMap; ready?: boolean;    // ready: set up and joined to the main map
  group?: THREE.Group; world?: TileWorld; job?: Generator<void, TileWorld>;
  fetching?: boolean; failed?: boolean; gone?: boolean;
}

export class Tiles {
  private live = new Map<number, Tile>();
  private exists: Set<number>;
  private wait = 0;

  /** build: a square's scenery, a slice at a time, into the group given; free: let go of a group half built. */
  constructor(private core: GameMap, private scene: THREE.Scene,
    private build: (m: GameMap, into: THREE.Group) => Generator<void, TileWorld>, private free: (g: THREE.Group) => void) {
    this.exists = new Set(core.tileIndex!.tiles.map(([i, j]) => tileKey(i, j)));
  }

  /** The finished scenery of the square at scene (x, z), if it's loaded and built. */
  worldAt(x: number, z: number): TileWorld | undefined {
    const m = this.core.tileAt(x, z);
    if (!m?.d.tile) return undefined;
    return this.live.get(tileKey(m.d.tile[0], m.d.tile[1]))?.world;
  }

  /** others: where everyone else is (scene coords), for the host; leave it empty otherwise. */
  update(px: number, pz: number, dt: number, others: { x: number; z: number }[] = []) {
    const I = this.core.tileIndex!, S = I.cells * I.dx;
    const far = (ti: number, tj: number, x: number, z: number) => {
      const u = x - I.x0, v = -z - I.y0;
      return Math.hypot(Math.max(0, ti * S - u, u - (ti + 1) * S), Math.max(0, tj * S - v, v - (tj + 1) * S));
    };
    const fromOthers = (ti: number, tj: number) => others.reduce((m, o) => Math.min(m, far(ti, tj, o.x, o.z)), Infinity);
    const first = (t: Tile) => Math.min(t.d, t.od);
    this.wait -= dt;
    if (this.wait <= 0) {
      this.wait = 0.3;
      for (const [k, t] of this.live) {
        t.d = far(t.ti, t.tj, px, pz); t.od = fromOthers(t.ti, t.tj);
        if (t.d > view.drop && t.od > FAR_OTHERS) { this.drop(t); this.live.delete(k); }
        else if (t.d > view.drop) this.unbuild(t);   // its scenery goes; its map stays for whoever's there
      }
      const want = (x: number, z: number, r: number, cap = Infinity) => {
        const u = x - I.x0, v = -z - I.y0;
        for (let ti = Math.floor((u - r) / S); ti <= Math.floor((u + r) / S); ti++)
          for (let tj = Math.floor((v - r) / S); tj <= Math.floor((v + r) / S); tj++) {
            const k = tileKey(ti, tj);
            if (this.live.size >= cap || !this.exists.has(k) || this.live.has(k) || far(ti, tj, x, z) > r) continue;
            this.live.set(k, { ti, tj, d: far(ti, tj, px, pz), od: fromOthers(ti, tj) });
          }
      };
      want(px, pz, view.load);
      const ours = [...this.live.values()].filter((t) => t.d <= view.drop).length;
      for (const o of others) want(o.x, o.z, NEAR_OTHERS, ours + MAX_OTHERS);
      // start the nearest downloads first
      const waiting = [...this.live.values()].filter((t) => !t.map && !t.fetching && !t.failed).sort((a, b) => first(a) - first(b));
      let busy = [...this.live.values()].filter((t) => t.fetching).length;
      for (const t of waiting) { if (busy++ >= FETCHES) break; this.fetch(t); }
    }
    // a few milliseconds a frame, nearest first: set up each square's walls and streets, then
    // build the scenery of the ones near us straight into the scene, so it goes up to the
    // graphics card a piece at a time
    const t0 = performance.now(), busy = () => performance.now() - t0 >= ((globalThis as any).__budget ?? BUDGET);
    const work = [...this.live.values()].filter((t) => t.map && (!t.ready || (t.d <= view.load && !t.world))).sort((a, b) => first(a) - first(b));
    for (const t of work) {
      while (!busy()) {
        if (!t.ready) {
          const setup = t.map!.setup;
          if (setup && !setup.next().done) continue;
          t.ready = true; t.map!.setup = null;
          this.core.addTile(tileKey(t.ti, t.tj), t.map!);
          continue;
        }
        if (t.d > view.load) break;
        if (!t.job) { t.group = new THREE.Group(); this.scene.add(t.group); t.job = this.build(t.map!, t.group); }
        const r = t.job.next();
        if (r.done) { t.world = r.value; t.job = undefined; break; }
      }
      if (busy()) break;
    }
    for (const t of this.live.values()) t.world?.update(px, pz, dt);
    (globalThis as any).__tilesPending = [...this.live.values()].filter((t) => !t.failed && t.d <= view.load && (!t.map || !t.ready || !t.world)).length;
  }

  private fetch(t: Tile) {
    t.fetching = true;
    fetch(`${this.core.tileBase}${t.ti}_${t.tj}.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        t.fetching = false;
        if (t.gone) return;
        // the cable car's way is cleared through the squares it crosses, as through the first area
        this.core.cable?.clear(d);
        // and the set pieces hide what the map tools built where they stand (landmarks/setpieces.ts)
        maskSetPieces(d);
        t.map = new GameMap(d, null, true);
        t.map.canal = this.core.canal;     // the canal's water is drawn by canal.ts, not by the square
      })
      .catch((e) => { t.fetching = false; t.failed = true; console.warn(`couldn't load square ${t.ti}, ${t.tj}:`, e); });
  }

  /** Take down a square's scenery, finished or not. */
  private unbuild(t: Tile) {
    if (t.world) t.world.dispose();
    else if (t.job) { t.job.return(undefined as never); if (t.group) this.free(t.group); }
    t.world = t.job = t.group = undefined;
  }

  private drop(t: Tile) {
    t.gone = true;
    if (t.ready) this.core.dropTile(tileKey(t.ti, t.tj));
    this.unbuild(t);
  }

  dispose() {
    for (const t of this.live.values()) this.drop(t);
    this.live.clear();
  }
}
