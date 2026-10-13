// How far you can see. The fog, the camera's far edge, how far off the full-detail squares of Bath
// are built (tiles.ts) and how far off the scenery in them is still drawn (world.ts, furniture.ts,
// trees.ts) all follow from these, so they stay in step. Phones and iPads see less far, to keep
// their frame rate up and their memory down. ?view=1200 in the address, or the draw distance
// button in the debug panel (debug.ts), changes it on the spot, to try how far a machine can see
// and keep its frame rate. Nothing here goes over the network: everyone sees as far as they like.

const touch = typeof navigator !== "undefined" && navigator.maxTouchPoints > 1;
const asked = typeof location !== "undefined" ? Number(new URLSearchParams(location.search).get("view")) : 0;

/** The choices the debug panel steps through, metres. */
export const VIEW_STEPS = [600, 900, 1200, 1500, 2000, 3000];

export const view = {
  /** Where the fog closes in completely by day, metres. After dark it closes in to NIGHT_FAR of that. */
  fogFar: 900,
  /** Where the fog starts. */
  fogNear: touch ? 60 : 110,
  /** The camera's far edge: just past the fog, so nothing hidden in it gets drawn. */
  cameraFar: 980,
  /** Its near edge: pushed out a little to see further, so distant roofs and roads don't flicker. */
  cameraNear: 0.05,
  /** Scenery that matters from far off (woods) is drawn to here. */
  sceneryFar: 860,
  /** Squares of Bath are built when their nearest edge is closer than this, and dropped past drop. */
  load: 980, drop: 1320,
};
export const NIGHT_FAR = 0.7;
/** Street lamps' posts and glass are drawn to here; further off, after dark, only their glow (furniture.ts). */
export const LAMPS_FAR = touch ? 200 : 260;
/** How far off trees change to simpler models, and how far they're drawn at all (shared by every patch of trees). */
export const TREE_TO = [50, 140, 480];

/** See as far as this, metres (by day). */
export function setView(far: number) {
  view.fogFar = far;
  view.cameraFar = far + 80;
  view.cameraNear = far <= 900 ? 0.05 : Math.min(0.15, far / 10000);
  view.sceneryFar = far - 40;
  view.load = far + 80;
  view.drop = view.load + 340;
  TREE_TO[2] = Math.round(Math.min(far * (touch ? 0.58 : 0.53), 800));
}
setView(asked >= 200 && asked <= 3000 ? asked : touch ? 520 : 900);
