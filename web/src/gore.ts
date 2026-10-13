// Paint or blood. The game is paintball by default: the guns are paintball markers, and anyone hit
// gets splattered in the shooter's colour. Blood is the secret: ?gore=1 on the address turns it
// back on (and ?gore=0 off again), and so does typing "claret" while you play. Either way this
// browser remembers it, so it carries over into a room you join by its link and into the mines.
// It's only looks: every player sees their own choice, and nothing about it goes over the network.
import * as THREE from "three";

const KEY = "combedowner.gore";
/** Typed during play, it turns blood on or off. */
const CHEAT = "claret";

function load(): boolean {
  const q = new URLSearchParams(location.search).get("gore");
  try {
    if (q !== null) localStorage.setItem(KEY, q === "1" || q === "on" ? "1" : "0");
    return localStorage.getItem(KEY) === "1";
  } catch { return q === "1" || q === "on"; }
}

let on = load();
const roots: THREE.Object3D[] = [];

/** True when blood is on (the secret), false for paint (the default). */
export const gore = () => on;

/**
 * Tag a part of a model as belonging to one look: "paint" shows in paintball mode, "real" only
 * with blood on. Parts with no tag always show.
 */
export function look<T extends THREE.Object3D>(o: T, kind: "paint" | "real"): T {
  o.userData.look = kind;
  o.visible = kind === (on ? "real" : "paint");
  return o;
}

/** Keep the tagged parts under this (a scene, or a model that gets copied) in step when blood is switched. */
export function watch(root: THREE.Object3D) { roots.push(root); }

export function setGore(v: boolean) {
  on = v;
  try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* private window: just this page, then */ }
  for (const r of roots) r.traverse((o) => { if (o.userData.look) o.visible = o.userData.look === (on ? "real" : "paint"); });
}

/** Listen for the cheat being typed (not in a text box). say() tells the player what changed. */
export function listenForCheat(say: (text: string) => void) {
  let typed = "";
  addEventListener("keydown", (e) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    if (e.key.length !== 1) return;
    typed = (typed + e.key.toLowerCase()).slice(-CHEAT.length);
    if (typed !== CHEAT) return;
    typed = "";
    setGore(!on);
    say(on ? "Claret: real guns and blood" : "Back to paintball");
  });
}

/** The colour of someone's paint, from their own colour (the same one everybody sees), as #rrggbb. */
export function paintFor(colour: string): string {
  // a touch brighter and richer than the name colour, so it reads as wet paint on grey streets
  const c = new THREE.Color(colour), hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  // and never blood red: reds are turned to a hot pink
  const h = hsl.h < 0.05 || hsl.h > 0.95 ? 0.93 : hsl.h;
  return "#" + c.setHSL(h, Math.min(1, hsl.s * 1.15 + 0.1), Math.min(0.62, hsl.l + 0.06)).getHexString();
}
