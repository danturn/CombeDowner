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
/** A roof to stand on, over an outline (x, z, in the set piece's frame): flat at y, and where
 *  it's pitched, over pitch's rectangle (as Kit.roof draws one): its middle (cx, cz), half its
 *  length (hl, along its ridge, which runs ang from x towards z) and width (hw), from y up to
 *  y + rise at the ridge, hipped at both ends or not. */
export interface Top { ring: [number, number][]; y: number; pitch?: Pitch }
export interface Pitch { cx: number; cz: number; ang: number; hl: number; hw: number; y: number; rise: number; hip: boolean }
export interface Solids { boxes: Solid[]; posts: Pillar[]; tops?: Top[] }

/** How far a pitched roof stands above its eaves at s along its ridge and t across it, both from
 *  its middle: null if that's not over it. */
export function pitchAt(p: { hl: number; hw: number; rise: number; hip: boolean }, s: number, t: number): number | null {
  if (Math.abs(s) > p.hl || Math.abs(t) > p.hw) return null;
  let h = p.rise * (1 - Math.abs(t) / p.hw);
  if (p.hip) h = Math.min(h, (p.rise * (p.hl - Math.abs(s))) / Math.min(p.hw, p.hl));
  return Math.max(0, h);
}

/** A helper for building the list: boxes from corner to corner. */
export function solids() {
  const S: Solids = { boxes: [], posts: [], tops: [] };
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
    /** A roof to stand on over x0..x1 by z0..z1: flat at y, or pitched over it (see Top). */
    roof(x0: number, x1: number, z0: number, z1: number, y: number, pitch?: Pitch) {
      S.tops!.push({ ring: [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], y, pitch });
    },
  };
}
