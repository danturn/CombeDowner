// The solid parts of a set piece (landmarks/setpieces.ts), in its own frame: x along it, z out of
// its front, heights above the ground it stands on. map.ts makes them solid, in every square of
// Bath the set piece reaches into, so you bump into them wherever you are.

/** A box: its middle (x, z), half its length (hx, along x) and width (hz), turned r about the
 *  vertical, and its top. Its sides are walls, from the ground up to the top. stand: you can
 *  stand on its top. open: only a top to stand on, with no walls (a floor, a step, a terrace
 *  you can walk under). */
export interface Solid { x: number; z: number; hx: number; hz: number; top: number; r?: number; stand?: boolean; open?: boolean }
/** A column, a turret or a statue: a circle r across at (x, z), up to top. */
export interface Pillar { x: number; z: number; r: number; top: number }
export interface Solids { boxes: Solid[]; posts: Pillar[] }

/** A helper for building the list: boxes from corner to corner. */
export function solids() {
  const S: Solids = { boxes: [], posts: [] };
  return {
    S,
    /** Walls round x0..x1 by z0..z1, up to top. */
    wall(x0: number, x1: number, z0: number, z1: number, top: number, stand = false) {
      S.boxes.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, hx: Math.abs(x1 - x0) / 2, hz: Math.abs(z1 - z0) / 2, top, stand });
    },
    /** A floor to stand on over x0..x1 by z0..z1, at top, with nothing in the way under it. */
    floor(x0: number, x1: number, z0: number, z1: number, top: number) {
      S.boxes.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, hx: Math.abs(x1 - x0) / 2, hz: Math.abs(z1 - z0) / 2, top, open: true });
    },
    post(x: number, z: number, r: number, top: number) { S.posts.push({ x, z, r, top }); },
  };
}
