// The climbable Abbey: the ladder of angels up the west front's north turret (landmarks/abbey.ts),
// a carved one that's really a ladder, there to climb whenever you like, from its mounting stone up
// to the turret's crown. It's a ladder like the ones you carry about (ladders.ts), only fixed, and
// player.ts climbs it the same way. The rest of the way up is jumping: over the roofs, onto the
// tower's ledge and up the stones round it (climb.ts), to the wings at the top (wings.ts).
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
  /** The ladder of angels up the north turret. */
  ladder: Rungs;
  /** Scene x, z of the middle of the church. */
  mid: [number, number];
}

const NEAR = 90;   // metres from the middle of the church that its ladder is offered to the player

const found = new WeakMap<GameMap, AbbeyClimb | null>();

/** The Abbey's climb on this map, if the Abbey's on it. */
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
    const L = CLIMB.ladder, p = frame.at(L.x, 0, L.z);
    const ladder: Rungs = { x: p.x, z: p.z, nx: frame.ax[0], nz: frame.ax[1], y0: y0 + L.y0, y1: y0 + L.y1, out: 0.08 };
    const m = frame.at(0, 0, 0);
    out = { frame, ladder, mid: [m.x, m.z] };
  }
  found.set(map, out);
  return out;
}

/** The Abbey's ladder, if you're near enough the Abbey to want it, for the player to get on. */
export function abbeyLadders(map: GameMap, x: number, z: number): Rungs[] {
  const ab = abbeyClimb(map);
  return ab && Math.hypot(x - ab.mid[0], z - ab.mid[1]) < NEAR ? [ab.ladder] : [];
}

