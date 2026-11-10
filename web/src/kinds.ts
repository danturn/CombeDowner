// What each thing in the scene is, for the drone's "what's what" view (looks.ts), which colours the
// city by it: the lidar's ground, the streets, the buildings the map build makes, the hand-made set
// pieces and landmarks, garden walls and fences, plants, water and so on. Each thing is marked where
// it's made (world.ts, landmarks, vehicles and the rest), on the object or a group it's in, and the
// view takes the nearest mark going up from each mesh. Failing that, the stage of the map's build a
// thing came from (world.ts names each piece after it) says what it is; anything else is "other".
//
// Nothing here goes over the network: it's only what your own screen shows.
import type * as THREE from "three";

export type Kind = "ground" | "street" | "building" | "setpiece" | "landmark" | "boundary" | "plant" | "water" | "canal"
  | "railway" | "furniture" | "far" | "vehicle" | "people" | "sky" | "field" | "other";

/** Each kind's colour in the view, and its name on the drone's key. */
export const KINDS: Record<Kind, { col: string; name: string }> = {
  ground: { col: "#b59a6a", name: "Ground (lidar)" },
  street: { col: "#4a4f57", name: "Streets, paths" },
  building: { col: "#efc777", name: "Buildings (map build)" },
  setpiece: { col: "#e0479a", name: "Set pieces" },
  landmark: { col: "#9a6ce0", name: "Landmarks" },
  boundary: { col: "#d0533b", name: "Walls, fences, hedges" },
  plant: { col: "#3fa34d", name: "Trees, shrubs, grass" },
  water: { col: "#3d8fd6", name: "Water" },
  canal: { col: "#2bc2c2", name: "Canal works" },
  railway: { col: "#7a4f37", name: "Railway, tunnels" },
  furniture: { col: "#f4e24a", name: "Street things, shops" },
  far: { col: "#9aa7b4", name: "Far off" },
  vehicle: { col: "#ff8a1f", name: "Vehicles" },
  people: { col: "#ff2f6d", name: "People, animals" },
  sky: { col: "#000000", name: "Sky" },
  field: { col: "#000000", name: "Force field" },
  other: { col: "#d8d8d8", name: "Other" },
};

/** Mark o as being kind k (and so everything in it that isn't marked otherwise). */
export function tag<T extends THREE.Object3D>(o: T, k: Kind): T { o.userData.kind = k; return o; }

/** Mark everything put in `into` since it had `from` things in it, that isn't marked yet, as kind k. */
export function tagSince(into: THREE.Object3D, from: number, k: Kind) {
  for (let i = from; i < into.children.length; i++) into.children[i].userData.kind ??= k;
}

// world.ts's stages of building a square, by the name it gives what each one made
const STAGES: Record<string, Kind> = {
  sky: "sky", ground: "ground", roads: "street", buildings: "building", "walls-fences": "boundary", trees: "plant",
  outskirts: "far", woods: "plant", "doors-bays": "building", "landmarks-tunnels": "railway", furniture: "furniture",
  shops: "furniture", pitches: "furniture", "grass-build": "plant", grass: "plant", lamps: "furniture", field: "field",
};

/** What o is: its own mark or the nearest one above it, or the stage of the build it came from. */
export function kindOf(o: THREE.Object3D): Kind {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) {
    if (p.userData.kind) return p.userData.kind as Kind;
    const st = STAGES[p.name];
    if (st) return st;
  }
  return "other";
}
