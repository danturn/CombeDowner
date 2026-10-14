// Hand-made landmarks, as plugins. A map's landmark pack (tools/landmarks/<map>.py) places them,
// each as [kind, x, y, ground, angle, ...more]; this draws each kind with its builder below.
// A builder makes the landmark around its own origin, its front facing +z; it is then stood at
// x, y on the ground and turned by angle. A new kind for another area is a new file here and a
// line in KINDS.
//
// Set pieces (setpieces.ts: the Abbey, Pulteney Bridge, the Roman Baths, the terraced streets,
// Grand Parade, the Empire Hotel, the Holburne Museum and Sham Castle) are placed by the game
// itself as each square loads, not by the pack, as [kind, x, y, height, angle, own, ...args]: own
// is 1 in the square that draws it, 0 in a square next to it, which only makes it solid there.
// Their solid parts come from SOLIDS (map.ts asks landmarkSolids).
import * as THREE from "three";
import type { GameMap } from "../map";
import { spire } from "./spire";
import { portico } from "./portico";
import { bridge } from "./bridge";
import { oak } from "./oak";
import { twerton } from "./twerton";
import { abbey, abbeySolids } from "./abbey";
import { pulteney, pulteneySolids } from "./pulteney";
import { baths, bathsSolids } from "./baths";
import { terraces, terraceSolids } from "./terraces";
import { colonnade, colonnadeSolids, empire, empireSolids } from "./grandparade";
import { shamCastle, shamSolids } from "./shamcastle";
import { holburne, holburneSolids } from "./holburne";
import type { Solids } from "./solids";

export type Builder = (args: (number | string)[]) => THREE.Object3D;

const KINDS: Record<string, Builder> = { spire, portico, bridge, oak, twerton, abbey, pulteney, baths, terraces, holburne, colonnade, empire, sham: shamCastle };
const SOLIDS: Record<string, (args: (number | string)[]) => Solids> = {
  abbey: abbeySolids, pulteney: pulteneySolids, baths: bathsSolids, terraces: terraceSolids, holburne: holburneSolids,
  colonnade: colonnadeSolids, empire: empireSolids, sham: shamSolids,
};

/** A set piece's solid parts, in its own frame, from its landmark entry's args (after the angle),
 *  or null for a landmark that isn't a set piece. */
export function landmarkSolids(kind: string, rest: (number | string)[]): Solids | null {
  return SOLIDS[kind]?.(rest.slice(1)) ?? null;
}

/** Build the map's landmarks (or the list given: the wider map's) into the scene. */
export function buildLandmarks(map: GameMap, scene: THREE.Object3D, list = map.d.lm ?? []) {
  for (const [kind, x, y, z, ang, ...rest] of list) {
    const build = KINDS[kind as string];
    if (!build) { console.warn(`no builder for landmark ${kind}`); continue; }
    let args = rest;
    if (SOLIDS[kind as string]) { if (!+rest[0]) continue; args = rest.slice(1); }
    const obj = build(args);
    obj.position.set(x as number, (z as number) - map.z0, -(y as number));
    obj.rotation.y = ang as number;
    obj.traverse((o) => { o.castShadow = o.receiveShadow = true; });
    scene.add(obj);
  }
}
