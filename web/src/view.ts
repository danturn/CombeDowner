// How far you can see. The fog, the camera's far edge, how far off the full-detail squares of Bath
// are built (tiles.ts) and how far off the scenery in them is still drawn (world.ts, furniture.ts,
// trees.ts) all follow from these, so they stay in step, and squares far off are drawn simpler.
// Phones and iPads see less far, to keep their frame rate up and their memory down. Normally the
// automatic settings (quality.ts) choose the distance and ease it back when frames are slow. The draw distance in Settings (settings.ts), or its
// button in the debug panel (debug.ts), changes it on the spot and is remembered on this computer;
// ?view=1200 in the address tries a distance for one visit without remembering it. The field of
// view lives here too. Nothing here goes over the network: everyone sees as far as they like.

const touch = typeof navigator !== "undefined" && navigator.maxTouchPoints > 1;
const asked = typeof location !== "undefined" ? Number(new URLSearchParams(location.search).get("view")) : 0;

const VIEW_KEY = "cd-view", FOV_KEY = "cd-fov";
const stored = (k: string) => { try { return Number(localStorage.getItem(k)) || 0; } catch { return 0; } };

/** The choices Settings and the debug panel offer, metres. */
export const VIEW_STEPS = [600, 900, 1200, 1500, 2000, 3000, 4000, 5000, 6000];

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
  /** The field of view looking straight ahead, degrees (game.ts zooms in from it to aim). */
  fov: 72,
};
/** The field of view's range in Settings, and where it starts. */
export const FOV_MIN = 60, FOV_MAX = 100, FOV_DEFAULT = 72;
/** How far you see on this device unless you choose otherwise. */
export const VIEW_DEFAULT = touch ? 520 : 900;
export const NIGHT_FAR = 0.7;
/** Street lamps' posts and glass are drawn to here; further off, after dark, only their glow (furniture.ts). */
export const LAMPS_FAR = touch ? 200 : 260;
/** Squares of Bath whose nearest edge is further off than this are drawn simpler (world.ts): coarser
 *  ground, and none of the footpaths and pavements, which are too thin to see from there. It only
 *  comes into play at the longer draw distances. */
export const SIMPLER_FAR = 850;
/** How far off trees change to simpler models, and how far they're drawn at all (shared by every patch of trees). */
export const TREE_TO = [50, 140, 480];

/** See as far as this, metres (by day). keep: remember it on this computer for next time. */
export function setView(far: number, keep = false) {
  if (keep) { try { localStorage.setItem(VIEW_KEY, String(far)); } catch { /* private window: just this visit */ } }
  view.fogFar = far;
  view.cameraFar = far + 80;
  view.cameraNear = far <= 900 ? 0.05 : Math.min(0.15, far / 10000);
  view.sceneryFar = far - 40;
  view.load = far + 80;
  view.drop = view.load + 340;
  TREE_TO[2] = Math.round(Math.min(far * (touch ? 0.58 : 0.53), 800));
}
const ok = (m: number) => m >= 200 && m <= VIEW_STEPS[VIEW_STEPS.length - 1];
setView(ok(asked) ? asked : ok(stored(VIEW_KEY)) ? stored(VIEW_KEY) : VIEW_DEFAULT);

/** Set the field of view, degrees, and remember it on this computer. */
export function setFov(deg: number, keep = true) {
  view.fov = Math.min(FOV_MAX, Math.max(FOV_MIN, deg));
  if (keep) { try { localStorage.setItem(FOV_KEY, String(view.fov)); } catch { /* private window */ } }
}
if (stored(FOV_KEY)) setFov(stored(FOV_KEY), false);
