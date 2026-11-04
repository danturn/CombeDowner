// What the land is like where the map lies, from the ecoregion it's in (public/maps/<id>-region.json,
// written by tools/region.py from RESOLVE's Ecoregions): what the heath grows and how much of it is
// in flower, how far a dry summer browns the grass, and what the trees are. Every map has one, in
// the same shape; the game reads only that, never which map or country it is. Nothing here goes
// over the network: every player reads the same file.

export interface Region {
  source: string; eco: string | null; biome: string | null; realm: string | null;
  /** The heath's shrubs: their greens, their flowers' colours, the share in flower and the share browned off. */
  heath: { leaf: string[]; bloom: string[]; flowers: number; dry: number };
  /** How far grass and meadows are browned off (0 never), and the meadows' two flowers. */
  grass: { dry: number; flowers: [string, string] };
  /** The share of trees that are conifers, and tints over the leaf texture for each kind of plant. */
  trees: { conifer: number; leaf: number[][]; conifer_leaf: number[]; shrub: number[][]; canopy: number[][] };
}

const REGIONS = import.meta.glob<Region>("../public/maps/*-region.json", { eager: true, import: "default" });

// a map built before it had one: the game's long-standing look, with plain scrub
const PLAIN: Region = {
  source: "", eco: null, biome: null, realm: null,
  heath: { leaf: ["#4c5a33"], bloom: ["#e3c23a", "#f0ece0", "#8f4fa0"], flowers: 0.15, dry: 0.3 },
  grass: { dry: 0, flowers: ["#ffea61", "#fffff9"] },
  trees: {
    conifer: 0.08,
    leaf: [[0.8, 0.8, 0.78], [0.7, 0.76, 0.7], [0.88, 0.84, 0.62], [0.62, 0.7, 0.6], [0.76, 0.8, 0.72], [0.92, 0.8, 0.56], [0.7, 0.5, 0.48]],
    conifer_leaf: [0.5, 0.6, 0.58],
    shrub: [[0.74, 0.78, 0.7], [0.66, 0.74, 0.62], [0.82, 0.78, 0.58], [0.62, 0.66, 0.58], [0.72, 0.82, 0.68]],
    canopy: [[0.36, 0.5, 0.24], [0.32, 0.46, 0.22], [0.4, 0.53, 0.26], [0.34, 0.44, 0.2]],
  },
};

export function region(id: string | undefined): Region {
  return REGIONS[`../public/maps/${id}-region.json`] ?? PLAIN;
}
