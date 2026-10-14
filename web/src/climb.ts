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
// again. All this file does is mark the Abbey on the maps, and drop a hint at its foot.
//
// Who decides what: nothing is sent. Where it all is comes from the map.
import { abbeyClimb } from "./abbeyclimb";
import { CLIMB } from "./landmarks/abbey";
import type { JobSpot } from "./minimap";
import { registerFree } from "./quests";

const COLOUR = "#f2cf5b";
const HINT = 25;           // metres from the north turret's foot to be told about the climb

let told = false;

registerFree({
  update(dt, w) {
    if (dt <= 0 || told) return;
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
