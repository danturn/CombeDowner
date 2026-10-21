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
// again. All this file does is mark the Abbey on the maps, drop a hint at its foot, and grow the
// tower's stones out of its walls while anyone's near enough to want them, then draw them back in.
// They're solid the whole time (landmarks/shape.ts), so nobody near ever loses their footing.
//
// Who decides what: nothing is sent. Where it all is comes from the map.
import * as THREE from "three";
import { abbeyClimb } from "./abbeyclimb";
import { CLIMB } from "./landmarks/abbey";
import type { JobSpot } from "./minimap";
import { registerFree, type QuestWorld } from "./quests";

const COLOUR = "#f2cf5b";
const HINT = 25;           // metres from the north turret's foot to be told about the climb

const STONES_IN = 38;      // metres from the stair that its stones come out, and
const STONES_OUT = 46;     // go back in when nobody's within this
const GROW = 1.6;          // per second: they take about half a second to come out

let told = false;
let stones: THREE.Mesh | null = null;
let stonesAt: THREE.Vector3 | null = null;
let stonesMap: object | null = null;
let looked = 0;
let out = false;

function findStones(w: QuestWorld, now: number) {
  if (now - looked < 2000) return;
  looked = now;
  w.scene.traverse((o) => { if (o.userData.steps) stones = o as THREE.Mesh; });
}

function tendStones(dt: number, w: QuestWorld) {
  const ab = abbeyClimb(w.map);
  if (!ab) return;
  if (stonesMap !== w.map) {
    stonesMap = w.map; stones = null;
    stonesAt = ab.frame.at((CLIMB.tower.x0 + CLIMB.tower.x1) / 2, CLIMB.ledge + 5, 0);
  }
  const at = stonesAt!;
  if (!stones || !stones.parent) {
    stones = null;
    const me = w.me();
    if (Math.hypot(me.x - at.x, me.z - at.z) < 150) findStones(w, performance.now());
    if (!stones) return;
  }
  const me = w.me();
  if (!out && Math.hypot(me.x - at.x, me.z - at.z) > 150) return;
  const reach = out ? STONES_OUT : STONES_IN;
  let near = false;
  for (const p of w.players()) {
    if (p.alive && Math.hypot(p.x - at.x, p.y - at.y, p.z - at.z) < reach) { near = true; break; }
  }
  out = near;
  const grow = (stones.material as THREE.Material).userData.grow as { value: number } | undefined;
  if (!grow) return;
  const want = near ? 1 : 0;
  if (grow.value !== want) grow.value = want > grow.value ? Math.min(1, grow.value + dt * GROW) : Math.max(0, grow.value - dt * GROW);
  stones.visible = grow.value > 0;
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
