// Hand-made landmarks, as plugins. A map's landmark pack (tools/landmarks/<map>.py) places them,
// each as [kind, x, y, ground, angle, ...more]; this draws each kind with its builder below.
// A builder makes the landmark around its own origin, its front facing +z; it is then stood at
// x, y on the ground and turned by angle. A new kind for another area is a new file here and a
// line in KINDS.
import * as THREE from "three";
import { GameMap } from "../map";
import { spire } from "./spire";
import { portico } from "./portico";
import { bridge } from "./bridge";
import { oak } from "./oak";
import { twerton } from "./twerton";

export type Builder = (args: (number | string)[]) => THREE.Object3D;

const KINDS: Record<string, Builder> = { spire, portico, bridge, oak, twerton };

/** Build the map's landmarks (or the list given: the wider map's) into the scene. */
export function buildLandmarks(map: GameMap, scene: THREE.Object3D, list = map.d.lm ?? []) {
  for (const [kind, x, y, z, ang, ...rest] of list) {
    const build = KINDS[kind as string];
    if (!build) { console.warn(`no builder for landmark ${kind}`); continue; }
    const obj = build(rest);
    obj.position.set(x as number, (z as number) - map.z0, -(y as number));
    obj.rotation.y = ang as number;
    obj.traverse((o) => { o.castShadow = o.receiveShadow = true; });
    scene.add(obj);
  }
}
