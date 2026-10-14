// Kingswood School, as a set piece (landmarks/setpieces.ts) in place of the plain blocks the map
// tools build there: the Methodist school John Wesley founded at Kingswood near Bristol in 1748,
// moved up to Lansdown in 1852 into James Wilson's new building, a long Tudor Gothic range of Bath
// stone with a tall tower over its entrance, looking east over the valley; and its chapel, below it
// to the east, built in 1922. The map has their outlines and heights from the lidar, so each part is
// rebuilt on its own outline (landmarks/ranges.ts): the ranges with Tudor windows under hood
// moulds and battlements, the tower with tall belfry lancets and pinnacles at its corners, and the
// chapel with tall pointed windows between buttresses, a great window in each gabled end and a
// steep slate roof.
// Its frame: x north-north-west along the range, z out of its front (east-north-east), y up from
// 183 m above sea level (the ground at the foot of the tower). Measured from the map's square 0_5.
// Solid (kingswoodSolids): a wall along every side of every part.
import * as THREE from "three";
import { Kit } from "./kit";
import { type Range, type Style, rangeMats, dressRange, glowRanges, rangeSolids } from "./ranges";
import { solids } from "./solids";

/** The set piece's origin height, above sea level (its height in setpieces.ts). */
export const KINGSWOOD_Y = 183;

const PARTS: [Style, Range][] = [
  // the main range, Wilson's Gothic front and its wings
  ["gothic", [179.5, 195.5, 0, [[6.1,4.3],[5.3,10.2],[6.4,10.4],[5.4,16.3],[6.5,16.5],[5.9,20.4],[6.9,20.6],[6.8,21.5],[9.7,22.0],[9.8,20.9],[18.8,22.2],[18.9,21.3],[25.8,22.2],[26.3,18.8],[25.6,31.5],[-27.8,31.9],[-27.3,19.4],[-4.0,19.9],[-3.6,3.7],[3.5,3.8],[3.6,-3.7],[-3.5,-3.8],[-2.9,-21.9],[-18.9,-21.7],[-19.1,-32.5],[45.7,-32.5],[45.4,-10.2],[15.2,-10.3],[15.4,-16.4],[4.4,-16.7],[4.4,-8.7],[9.6,-8.6],[9.3,5.7],[9.1,4.7]],
    [187.5, 187.5, 191.3, 191.3, 191.3, 191.3, 191.3, 191.3, 191.3, 191.3, 187.5, 187.5, 187.5, 0, 0, 0, 0, 0, 204.7, 204.7, 204.7, 0, 0, 0, 0, 0, 196.0, 0, 0, 0, 0, 0, 187.5, 187.5]]],
  // the range behind it, to the north
  ["gothic", [182.9, 196.0, 1, [[62.6,-6.9],[62.2,3.7],[14.9,4.6],[15.2,-10.3],[45.3,-10.3],[45.3,-7.1]],
    [0, 0, 0, 195.5, 0, 0]]],
  // the block at the back
  ["gothic", [184.0, 191.5, 1, [[63.1,-32.0],[45.7,-32.2],[50.2,-64.2],[81.8,-58.7],[76.5,-28.6],[76.6,-30.0]],
    [0, 0, 0, 0, 190.5, 190.5]]],
  // the range between them
  ["gothic", [184.2, 190.5, 1, [[73.9,-3.5],[62.8,-4.3],[62.6,-2.6],[62.7,-7.0],[63.9,-6.9],[64.3,-31.9],[76.8,-30.1]],
    [0, 0, 196.0, 0, 0, 191.5, 0]]],
  // the porch and the rooms by the tower
  ["gothic", [182.6, 191.3, 0, [[8.2,11.6],[7.9,13.6],[6.9,13.4],[6.6,15.4],[11.5,16.2],[11.7,15.2],[12.7,15.3],[12.6,16.4],[13.5,16.5],[13.0,20.5],[15.0,20.7],[14.8,21.7],[9.8,20.9],[9.7,22.0],[6.8,21.5],[6.9,20.6],[5.9,20.4],[6.5,16.5],[5.4,16.3],[6.4,10.4],[7.3,10.5],[7.2,11.5]],
    [187.5, 187.5, 187.5, 187.5, 187.5, 187.5, 187.5, 187.5, 187.5, 187.5, 187.5, 195.5, 195.5, 195.5, 195.5, 195.5, 195.5, 195.5, 195.5, 187.5, 187.5, 187.5]]],
  // the low range by the tower
  ["gothic", [182.5, 187.5, 0, [[12.4,14.6],[26.6,14.4],[25.8,22.2],[18.9,21.3],[18.8,22.2],[14.8,21.7],[15.0,20.7],[13.0,20.5],[13.5,16.5],[12.6,16.4],[12.7,15.3],[11.7,15.2],[11.5,16.2],[6.6,15.4],[6.9,13.4],[7.9,13.6],[8.2,11.6],[7.2,11.5],[7.3,10.5],[5.3,10.2],[6.1,4.3],[9.1,4.7],[9.3,5.9],[12.5,5.6]],
    [0, 0, 195.5, 195.5, 195.5, 191.3, 191.3, 191.3, 191.3, 191.3, 191.3, 191.3, 191.3, 191.3, 191.3, 191.3, 191.3, 191.3, 195.5, 195.5, 195.5, 0, 0, 0]]],
  // the tower
  ["tower", [182.2, 204.7, 1, [[3.6,-3.7],[3.5,3.8],[-3.6,3.7],[-3.5,-3.8]],
    [195.5, 195.5, 0, 195.5]]],
  // the chapel
  ["chapel", [174.1, 183.1, 1, [[-68.3,36.5],[-67.0,36.4],[-66.7,45.6],[-80.7,46.1],[-80.9,38.3],[-78.0,38.3],[-78.7,20.6],[-69.0,20.1]],
    [0, 0, 0, 0, 0, 0, 0, 0]]],
];

/** What the set piece stands in for (setpieces.ts): the school's buildings, a little wider, and the chapel's. */
export const KINGSWOOD: [number, number][] = [[14.1, 5.4], [62.9, 4.5], [63.5, -3.5], [74.6, -2.7], [77.6, -30.5], [82.7, -59.4], [49.6, -65.1], [45.0, -33.3], [-19.9, -33.3], [-19.7, -20.9], [-3.7, -21.0], [-4.8, 19.1], [-28.1, 18.6], [-28.6, 32.7], [26.3, 32.3], [27.5, 13.6], [13.2, 13.8], [13.3, 4.7], [10.1, 5.1], [10.4, -9.4], [5.2, -9.4], [5.2, -15.8], [14.5, -15.6]];
export const KINGSWOOD_CHAPEL: [number, number][] = [[-67.6, 35.6], [-68.2, 19.3], [-79.5, 19.8], [-78.9, 37.5], [-81.7, 37.6], [-81.5, 47.0], [-65.9, 46.3], [-66.2, 35.5]];

export function kingswood(): THREE.Object3D {
  const k = new Kit(), m = rangeMats();
  for (const [style, r] of PARTS) dressRange(k, m, r, KINGSWOOD_Y, style);
  return glowRanges(k.build(), m);
}

export function kingswoodSolids(): ReturnType<typeof solids>["S"] {
  const { S } = solids();
  rangeSolids(S, PARTS.map(([, r]) => r), KINGSWOOD_Y, (k) => PARTS[k][0]);
  return S;
}
