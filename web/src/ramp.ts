// Keys are on or off, but steering shouldn't be: a key held builds up to full over a moment, a tap
// gives only a little, and letting go eases back to nothing. A stick (a pad's or the touch screen's)
// already says how far, so its value goes straight through. Each way of getting about passes its own
// times, so a heavy thing can be slow to answer and a light one quick. Nothing here goes over the
// network: it only shapes your own input.

/** How long, in seconds, from nothing to full (rise) and from full back to nothing (fall). */
export interface RampFeel { rise: number; fall: number }

/** current moved towards target (each -1..1) for dt seconds: out from nothing at the rise's pace,
 *  back towards nothing (or across to the other side) at the fall's. analogue: straight to target. */
export function ramp(current: number, target: number, dt: number, feel: RampFeel, analogue = false): number {
  if (analogue) return target;
  const out = Math.abs(target) > Math.abs(current) && target * current >= 0;
  const step = dt / Math.max(1e-3, out ? feel.rise : feel.fall);
  return current + Math.max(-step, Math.min(step, target - current));
}
