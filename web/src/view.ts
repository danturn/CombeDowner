// How far you can see. The fog, the camera's far edge, how far off the full-detail squares of Bath
// are built (tiles.ts) and how far off the scenery in them is still drawn (world.ts, furniture.ts,
// trees.ts) all follow from these, so they stay in step. Phones and iPads see less far, to keep
// their frame rate up and their memory down. Nothing here goes over the network.

const touch = typeof navigator !== "undefined" && navigator.maxTouchPoints > 1;
// ?view=1200 in the address sets the fog's reach, to try how far a machine can see and keep its frame rate
const asked = typeof location !== "undefined" ? Number(new URLSearchParams(location.search).get("view")) : 0;

/** Where the fog closes in completely by day, metres. After dark it closes in to NIGHT_FAR of that. */
export const FOG_FAR = asked >= 200 && asked <= 3000 ? asked : touch ? 520 : 900;
export const NIGHT_FAR = 0.7;
/** Where the fog starts. */
export const FOG_NEAR = touch ? 60 : 110;
/** The camera's far edge: just past the fog, so nothing hidden in it gets drawn. */
export const CAMERA_FAR = FOG_FAR + 80;
/** Scenery that matters from far off (woods, hedges, pitches) is drawn to here. */
export const SCENERY_FAR = FOG_FAR - 40;
/** Trees are drawn to here (at their simplest further than 140 m off). */
export const TREES_FAR = Math.round(Math.min(FOG_FAR * (touch ? 0.58 : 0.53), 800));
/** Street lamps' posts and glass are drawn to here; further off, after dark, only their glow (furniture.ts). */
export const LAMPS_FAR = touch ? 200 : 260;
