// Climbing Bath Abbey: always on, with nothing to take and no clock, just a hard way up from the
// churchyard to the top of the tower, where there's a pair of angel's wings (wings.ts). The way up
// is the Abbey's own (landmarks/abbey.ts, abbeyclimb.ts), for those who find it:
// - the ladder of angels on the north turret of the west front is a real ladder, off the mounting
//   stone at its foot, all the way up to the turret's crown;
// - over the roofs and along the nave's ridge to the tower;
// - up onto the ledge round the tower (jump at it from the ridge), along it and over the gap in
//   it, a running jump 27 m up;
// - and up the stones jutting from the tower's north face, a zigzag stair of jumps, to the
//   battlements.
// Fall and you land on whatever's below: a stone, the ledge, the roof, or the churchyard to start
// again. All this file does is mark the Abbey on the maps, drop a hint at its foot, and slide the
// tower's stones out of its walls just ahead of whoever is climbing (on the ledge or above, near
// the tower), a few at a time, with a scrape, a thump and a puff of dust for each. From the ground
// they stay hidden, and they draw back in, top first, once the climbers are gone. They're solid the
// whole time (landmarks/shape.ts), so nobody climbing ever loses their footing.
//
// Who decides what: nothing is sent. Where it all is comes from the map.
import * as THREE from "three";
import { abbeyClimb } from "./abbeyclimb";
import * as SFX from "./audio";
import { CLIMB, STONE_SLIDE } from "./landmarks/abbey";
import type { JobSpot } from "./minimap";
import { registerFree, type QuestWorld } from "./quests";

const COLOUR = "#f2cf5b";
const HINT = 25;           // metres from the north turret's foot to be told about the climb

const NEAR_TOWER = 10;     // metres from the tower's walls that someone counts as climbing it
const AHEAD = 3;           // metres above the highest climber that stones are out
const UP = 6, DOWN = 2.5;  // metres a second the reach rises and falls: out quickly, back in slowly

let told = false;
let stones: THREE.Mesh | null = null;
let stonesMap: object | null = null;
let looked = 0;
let reach = -1e4;
let was: number[] = [];
let spots: { top: number; at: THREE.Vector3; nx: number; nz: number }[] = [];

function findStones(w: QuestWorld, now: number) {
  if (now - looked < 2000) return;
  looked = now;
  w.scene.traverse((o) => { if (o.userData.steps) stones = o as THREE.Mesh; });
}

const grownBy = (top: number) => Math.max(0, Math.min(1, (reach - top) / STONE_SLIDE));

function tendStones(dt: number, w: QuestWorld) {
  const ab = abbeyClimb(w.map);
  if (!ab) return;
  const { tower, steps, ledge } = CLIMB, idle = steps[0][4] - 0.5;
  if (stonesMap !== w.map) {
    stonesMap = w.map; stones = null; reach = idle;
    spots = steps.map(([a, b, c, d, top]) => {
      const cx = (a + b) / 2, cz = (c + d) / 2;
      const wall = ab.frame.at(Math.max(tower.x0, Math.min(tower.x1, cx)), top - 0.45, Math.max(-tower.z, Math.min(tower.z, cz)));
      const o = ab.frame.at(cx, top - 0.45, cz), n = Math.hypot(o.x - wall.x, o.z - wall.z) || 1;
      return { top, at: wall, nx: (o.x - wall.x) / n, nz: (o.z - wall.z) / n };
    });
    was = spots.map(() => 0);
  }
  if (!stones || !stones.parent) {
    stones = null;
    const me = w.me(), mid = ab.mid;
    if (Math.hypot(me.x - mid[0], me.z - mid[1]) < 150) findStones(w, performance.now());
    if (!stones) return;
  }
  let top = -Infinity;
  for (const p of w.players()) {
    if (!p.alive) continue;
    const [lx, ly, lz] = ab.frame.local(p.x, p.y, p.z);
    if (ly < ledge - 2) continue;
    const dx = Math.max(tower.x0 - lx, 0, lx - tower.x1), dz = Math.max(Math.abs(lz) - tower.z, 0);
    if (Math.hypot(dx, dz) <= NEAR_TOWER) top = Math.max(top, ly);
  }
  const want = top === -Infinity ? idle : Math.max(idle, top + AHEAD);
  reach = want > reach ? Math.min(want, reach + dt * UP) : Math.max(want, reach - dt * DOWN);
  const grow = (stones.material as THREE.Material).userData.reach as { value: number } | undefined;
  if (!grow) return;
  grow.value = reach;
  stones.visible = reach > idle;
  for (let i = 0; i < spots.length; i++) {
    const g = grownBy(spots[i].top);
    if (was[i] < 0.9 && g >= 0.9) arrived(w, spots[i]);
    was[i] = g;
  }
}

function arrived(w: QuestWorld, s: { at: THREE.Vector3; nx: number; nz: number }) {
  const [d, pan] = w.hear?.(s.at.x, s.at.y, s.at.z) ?? [0, 0];
  SFX.stoneOut(d, pan);
  w.dust?.(s.at.x, s.at.y, s.at.z, s.nx, s.nz);
}

registerFree({
  update(dt, w) {
    if (dt <= 0) return;
    tendStones(dt, w);
    if (told) return;
    const ab = abbeyClimb(w.map), me = w.me();
    if (!ab || !me.alive) return;
    const foot = ab.frame.at(CLIMB.ladder.x - 1, 0, CLIMB.ladder.z), [, ly] = ab.frame.local(me.x, me.y, me.z);
    if (Math.hypot(me.x - foot.x, me.z - foot.z) < HINT && ly < 3) {
      told = true;
      w.toast("They say one of the Abbey's ladders of angels can really be climbed, and there's something at the top of the tower", 5);
    }
  },
  spots(w): JobSpot[] {
    const ab = abbeyClimb(w.map);
    if (!ab) return [];
    const at = ab.frame.at(CLIMB.ladder.x - 3, 0, 0);
    return [{ x: at.x, z: at.z, colour: COLOUR, glyph: "A", label: "Climb Bath Abbey" }];
  },
});
