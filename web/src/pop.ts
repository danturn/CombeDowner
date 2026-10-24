// The big yellow call-outs (#toast) pop: each time one comes up it springs on to the screen with a
// tween picked at random (a spring, a slam, a drop, a whip in from the side, a squash and stretch, a
// wobble) and settles at a slight tilt, like a score in an arcade game. It never leans more than
// TILT degrees off level. The streets, the mines and the deli all use it. It moves the text with
// the separate scale, rotate and translate properties, so the page's own centring transform is left
// alone. Nothing here goes over the network.

const TILT = 4;   // degrees, the most it ever leans
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const lean = (d: number) => `${Math.max(-TILT, Math.min(TILT, d)).toFixed(2)}deg`;

/** The tweens, each given which way it leans first (1 or -1) and the tilt it settles at. */
const TWEENS: ((s: number, end: number) => Keyframe[])[] = [
  // springs up from nothing, overshoots and settles
  (s, end) => [{ scale: "0", rotate: lean(-s * 4) }, { scale: "1.35", rotate: lean(s * 3), offset: 0.45 },
    { scale: "0.9", offset: 0.7 }, { scale: "1.06", offset: 0.85 }, { scale: "1", rotate: lean(end) }],
  // slams down from huge
  (s, end) => [{ scale: "2.6", rotate: lean(s * 4) }, { scale: "0.85", rotate: lean(-s * 2), offset: 0.4 },
    { scale: "1.08", offset: 0.7 }, { scale: "1", rotate: lean(end) }],
  // drops in from above, squashes as it lands and bounces
  (s, end) => [{ translate: "0 -70px", scale: "0.9 1.15", rotate: lean(s * 3) }, { translate: "0 6px", scale: "1.2 0.8", offset: 0.45 },
    { translate: "0 -6px", scale: "0.95 1.07", offset: 0.7 }, { translate: "0 0", scale: "1", rotate: lean(end) }],
  // whips in from the side and leans into the stop
  (s, end) => [{ translate: `${s * -160}px 0`, scale: "0.8", rotate: lean(s * 4) }, { translate: `${s * 16}px 0`, scale: "1.1", rotate: lean(-s * 3), offset: 0.55 },
    { translate: `${s * -5}px 0`, offset: 0.8 }, { translate: "0 0", scale: "1", rotate: lean(end) }],
  // squash and stretch, like a ball
  (s, end) => [{ scale: "0.2 1.7", rotate: lean(-s * 2) }, { scale: "1.45 0.7", offset: 0.35 }, { scale: "0.9 1.15", offset: 0.6 },
    { scale: "1.05 0.96", offset: 0.8 }, { scale: "1", rotate: lean(end) }],
  // pops up and wobbles about
  (s, end) => [{ scale: "0.5", rotate: "0deg" }, { scale: "1.15", rotate: lean(s * 4), offset: 0.3 }, { rotate: lean(-s * 4), offset: 0.5 },
    { scale: "1", rotate: lean(s * 2.5), offset: 0.7 }, { rotate: lean(-s * 1.2), offset: 0.85 }, { scale: "1", rotate: lean(end) }],
];

const playing = new WeakMap<HTMLElement, Animation>();
const still = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Pop el on to the screen with a random tween. */
export function pop(el: HTMLElement) {
  if (still || typeof el.animate !== "function") return;
  playing.get(el)?.cancel();
  const s = Math.random() < 0.5 ? -1 : 1, end = rnd(-2.5, 2.5);
  const tween = TWEENS[Math.floor(Math.random() * TWEENS.length)];
  playing.set(el, el.animate(tween(s, end), { duration: rnd(480, 640), easing: "cubic-bezier(0.25, 0.8, 0.35, 1)", fill: "forwards" }));
}
