// Hand-made landmarks, as plugins. A map's landmark pack (tools/landmarks/<map>.py) places them,
// each as [kind, x, y, ground, angle, ...more]; this draws each kind with its builder below.
// A builder makes the landmark around its own origin, its front facing +z; it is then stood at
// x, y on the ground and turned by angle. A new kind for another area is a new file here and a
// line in KINDS.
//
// Set pieces (setpieces.ts: the Abbey, Pulteney Bridge, the Roman Baths, the terraced streets,
// Grand Parade, the Empire Hotel, the Holburne Museum, Sham Castle, Prior Park and Kingswood School) are placed by
// the game itself as each square loads, not by the pack, as [kind, x, y, height, angle, own,
// ...args]: own is 1 in the square that draws it, 0 in a square next to it, which only makes it solid there.
// Their solid shape is taken from their own models (landmarks/shape.ts; map.ts asks landmarkShape).
import * as THREE from "three";
import type { GameMap } from "../map";
import { spire } from "./spire";
import { portico } from "./portico";
import { bridge } from "./bridge";
import { oak } from "./oak";
import { twerton } from "./twerton";
import { abbey } from "./abbey";
import { pulteney } from "./pulteney";
import { baths } from "./baths";
import { terraces } from "./terraces";
import { colonnade, empire } from "./grandparade";
import { shamCastle } from "./shamcastle";
import { holburne } from "./holburne";
import { priorPark, priorParkWings } from "./priorpark";
import { kingswood } from "./kingswood";
import { type Shape, shapeOf } from "./shape";

export type Builder = (args: (number | string)[]) => THREE.Object3D;

const KINDS: Record<string, Builder> = { spire, portico, bridge, oak, twerton, abbey, pulteney, baths, terraces, holburne, colonnade, empire, sham: shamCastle, priorpark: priorPark, priorwings: priorParkWings, kingswood };
/** The set pieces' kinds (setpieces.ts). */
const SET_PIECE_KINDS = new Set(["abbey", "pulteney", "baths", "terraces", "holburne", "colonnade", "empire", "sham", "priorpark", "priorwings", "kingswood"]);

const shapes = new Map<string, Shape>();
/** A set piece's solid shape, in its own frame, from its landmark entry's args (after the angle),
 *  taken from its model the first time it's asked for (and shared by every square it reaches);
 *  or null for a landmark that isn't a set piece. */
export function landmarkShape(kind: string, rest: (number | string)[]): Shape | null {
  if (!SET_PIECE_KINDS.has(kind)) return null;
  const args = rest.slice(1), k = `${kind}|${JSON.stringify(args)}`;
  let sh = shapes.get(k);
  if (!sh) {
    const obj = KINDS[kind](args);
    sh = shapeOf(obj);
    shapes.set(k, sh);
  }
  return sh;
}

/** Build the map's landmarks (or the list given: the wider map's) into the scene. */
export function buildLandmarks(map: GameMap, scene: THREE.Object3D, list = map.d.lm ?? []) {
  for (const [kind, x, y, z, ang, ...rest] of list) {
    const build = KINDS[kind as string];
    if (!build) { console.warn(`no builder for landmark ${kind}`); continue; }
    let args = rest;
    if (SET_PIECE_KINDS.has(kind as string)) { if (!+rest[0]) continue; args = rest.slice(1); }
    const obj = build(args);
    obj.position.set(x as number, (z as number) - map.z0, -(y as number));
    obj.rotation.y = ang as number;
    obj.traverse((o) => { o.castShadow = o.receiveShadow = true; });
    scene.add(obj);
  }
}
