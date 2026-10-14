// The climbable Abbey: the ladders in Bath Abbey's set piece (landmarks/abbey.ts), there to climb
// whenever you like. The ladder of angels up each of the west front's turrets goes in three
// stretches, from the churchyard to the first of the turret's stage mouldings, on to the second and
// up to the turret's crown, and you can stop on a moulding between stretches. The steeplejack's
// ladder goes up the tower's north face from the ledge round the tower to the battlements. They're
// ladders like the ones you carry about (ladders.ts), only fixed, and player.ts climbs them the same
// way. climb.ts brings the angels and the bells that make it hard, and wings.ts the wings at the top.
//
// Who decides what: nobody. Where the Abbey stands comes from its set piece's place
// (landmarks/setpieces.ts), the same for everyone, and nothing here goes over the network.
import * as THREE from "three";
import type { GameMap } from "./map";
import type { Rungs } from "./player";
import { CLIMB } from "./landmarks/abbey";
import { SET_PIECES } from "./landmarks/setpieces";

/** The Abbey's frame in the scene: x along the church (east), z out of its south side, y up from its floor. */
export interface AbbeyFrame {
  /** Where a point in the Abbey's frame is in the scene. */
  at(lx: number, ly: number, lz: number): THREE.Vector3;
  /** Where a point in the scene is in the Abbey's frame. */
  local(x: number, y: number, z: number): [number, number, number];
  /** The scene's directions of the frame's x and z. */
  ax: [number, number]; az: [number, number];
}

export interface AbbeyClimb {
  frame: AbbeyFrame;
  /** The ladders of angels, the north turret's then the south's, each in its stretches from the bottom up. */
  angels: Rungs[][];
  jack: Rungs;
  /** Scene x, z of the middle of the church. */
  mid: [number, number];
}

const NEAR = 90;   // metres from the middle of the church that its ladders are offered to the player

const found = new WeakMap<GameMap, AbbeyClimb | null>();

/** The Abbey's ladders on this map, if the Abbey's on it. */
export function abbeyClimb(map: GameMap): AbbeyClimb | null {
  if (found.has(map)) return found.get(map)!;
  const sp = SET_PIECES.find((p) => p.kind === "abbey"), c = map.d.centre;
  let out: AbbeyClimb | null = null;
  if (sp && c && typeof sp.height === "number") {
    // as landmarks/setpieces.ts places it: its origin in data metres, and its length's bearing
    const kx = 111320 * Math.cos((c[1] * Math.PI) / 180), ky = 110574;
    const ox = (sp.at[0] - c[0]) * kx, oy = (sp.at[1] - c[1]) * ky;
    const a = ((90 - sp.bearing) * Math.PI) / 180, ux = Math.cos(a), uy = Math.sin(a), y0 = sp.height - map.z0;
    const frame: AbbeyFrame = {
      at: (lx, ly, lz) => new THREE.Vector3(ox + ux * lx + uy * lz, y0 + ly, -(oy + uy * lx - ux * lz)),
      local: (x, y, z) => { const dx = x - ox, dy = -z - oy; return [dx * ux + dy * uy, y - y0, dx * uy - dy * ux]; },
      ax: [ux, -uy], az: [uy, ux],
    };
    const A = CLIMB.angels, J = CLIMB.jack;
    const angels = [-1, 1].map((s) => A.tops.map((top, k): Rungs => {
      const p = frame.at(A.x, 0, s * A.z);
      // between stretches you step back off onto the moulding; at the top, in onto the crown
      return { x: p.x, z: p.z, nx: frame.ax[0], nz: frame.ax[1], y0: y0 + (k ? A.tops[k - 1] : 0), y1: y0 + top, out: 0.08, off: k < A.tops.length - 1 ? -0.48 : 0.6 };
    }));
    const j = frame.at(J.x, 0, J.z);
    const jack: Rungs = { x: j.x, z: j.z, nx: frame.az[0], nz: frame.az[1], y0: y0 + J.y0, y1: y0 + J.y1, out: J.out };
    const m = frame.at(0, 0, 0);
    out = { frame, angels, jack, mid: [m.x, m.z] };
  }
  found.set(map, out);
  return out;
}

/** The Abbey's ladders, if you're near enough the Abbey to want them, for the player to get on. */
export function abbeyLadders(map: GameMap, x: number, z: number): Rungs[] {
  const ab = abbeyClimb(map);
  if (!ab || Math.hypot(x - ab.mid[0], z - ab.mid[1]) > NEAR) return [];
  // the angels' ladders stand in the churchyard, wherever its ground is as the squares load
  for (const L of ab.angels) {
    const foot = L[0], d = foot.out + 0.4;
    foot.y0 = map.floor(foot.x - foot.nx * d, foot.z - foot.nz * d, foot.y1 - 6);
  }
  return [...ab.angels.flat(), ab.jack];
}
