// The wardrobe: daft things to wear, earned by doing things round Bath. A seagull sitting on your
// head for seeing off a Seagull Attack, a traffic cone for winning a race, a centurion's helmet for
// gold on a treasure trail, a chef's hat from a good shift at the Darling Deli, a baby's bonnet for
// enough tummy time... Each one says what you've done to everyone you play with.
//
// There are three places to wear something: on your head, on your face, and on your back or
// shoulder, one thing in each. Pick what you wear from the Wardrobe in the pause menu, which shows
// you turning round in it, and what's still to earn and how.
//
// Who decides what: all your own. What you've earned and what you're wearing are kept on your
// machine (local storage), like the trail rosettes. What you're wearing goes round in your hello
// (game.ts) as a short list of names, for everyone else to draw on you (avatar.ts). Nothing is
// checked: it's only clothes.
import * as THREE from "three";
import { Avatar, ball, box, part, shell, type Piece } from "./avatar";

export type Slot = "head" | "face" | "back";
export const SLOTS: Slot[] = ["head", "face", "back"];
const SLOT_NAMES: Record<Slot, string> = { head: "On your head", face: "On your face", back: "On your back" };

export interface Wearable { id: string; slot: Slot; name: string; how: string }

/** Everything there is to wear, and how you get it. Ids go over the network: keep them short and don't rename them. */
export const WEARABLES: Wearable[] = [
  { id: "gull", slot: "head", name: "A seagull", how: "Three stars on a Seagull Attack" },
  { id: "splat", slot: "head", name: "Splattered flat cap", how: "Get pooed on five times by seagulls" },
  { id: "cone", slot: "head", name: "Traffic cone", how: "Be first over the line in a race" },
  { id: "helmet", slot: "head", name: "Centurion's helmet", how: "Gold on a treasure trail" },
  { id: "deer", slot: "head", name: "Deerstalker", how: "Bring in a Wanted ringleader" },
  { id: "toque", slot: "head", name: "Chef's hat", how: "Three stars on a shift at the Darling Deli" },
  { id: "bonnet", slot: "head", name: "Baby's bonnet", how: "Ten minutes of tummy time, all told" },
  { id: "specs", slot: "face", name: "Joke glasses and moustache", how: "Finish any job from a noticeboard" },
  { id: "shades", slot: "face", name: "Shades and a sunburnt nose", how: "Win a Seagull Attack" },
  { id: "owl", slot: "back", name: "Plastic owl on your shoulder", how: "Beat Big Lad without a bite lost in the last wave" },
  { id: "brolly", slot: "back", name: "Splattered brolly", how: "Beat Big Lad without a poo bomb hitting you" },
  { id: "cat", slot: "back", name: "A cat on your shoulder", how: "Live through a cat swarm" },
  { id: "loaf", slot: "back", name: "Baguette in a rucksack", how: "Work ten shifts at the Darling Deli" },
];
const BY_ID = new Map(WEARABLES.map((w) => [w.id, w]));

const KEY = "cd-wardrobe";
interface Saved { got: string[]; worn: Partial<Record<Slot, string>>; n: Record<string, number> }

function load(): Saved {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (d && Array.isArray(d.got)) return { got: d.got.filter((id: string) => BY_ID.has(id)), worn: d.worn ?? {}, n: d.n ?? {} };
  } catch { /* nothing saved */ }
  return { got: [], worn: {}, n: {} };
}
function save(s: Saved) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

const listeners: ((w: Wearable) => void)[] = [];
/** Told whenever you earn something new (game.ts puts it on screen and tells everyone). Returns a way to stop. */
export function onEarn(f: (w: Wearable) => void): () => void {
  listeners.push(f);
  return () => { const k = listeners.indexOf(f); if (k >= 0) listeners.splice(k, 1); };
}

/** Have you got it? */
export const has = (id: string) => load().got.includes(id);

/** You've earned id: put it in your wardrobe and wear it straight away. Returns true if it's new. */
export function earn(id: string): boolean {
  const w = BY_ID.get(id), s = load();
  if (!w || s.got.includes(id)) return false;
  s.got.push(id);
  s.worn[w.slot] = id;
  save(s);
  for (const f of listeners) f(w);
  return true;
}

/** Add to one of your running counts (seagull poo, seconds of tummy time, deli shifts); returns the new total. */
export function count(what: string, by = 1): number {
  const s = load();
  s.n[what] = (s.n[what] ?? 0) + by;
  save(s);
  return s.n[what];
}

/** What you're wearing, as it goes round: the ids, comma separated. */
export function myWear(): string {
  const s = load();
  return SLOTS.map((k) => s.worn[k]).filter((id): id is string => !!id && s.got.includes(id)).join(",");
}

/** What a hello says someone's wearing, one per slot, only things there are. */
export function parseWear(code: string): Wearable[] {
  const out: Wearable[] = [];
  for (const id of String(code).split(",").slice(0, 3)) {
    const w = BY_ID.get(id);
    if (w && !out.some((o) => o.slot === w.slot)) out.push(w);
  }
  return out;
}

// ---- what they look like ------------------------------------------------------------------------
// Built in the frames avatar.ts hangs them from. On the head: the neck at 0, the middle of the head
// at y 0.15, a ball 0.15 across, the face towards -z. On the back: the jacket's frame, the shoulders
// at y 0.52, either side at x ±0.22, the back at z 0.13.

const C = 0.15;
const cyl = (rt: number, rb: number, h: number, x = 0, y = 0, z = 0, seg = 14) => new THREE.CylinderGeometry(rt, rb, h, seg).translate(x, y, z);

/** A seagull: white, grey wings with black tips, a yellow beak with a red spot, pink legs. Facing -z, sitting at 0. */
export function gullPieces(s = 1, y = 0, z = 0, head = "#f4f4f2"): Piece[] {
  const k = (g: THREE.BufferGeometry) => g.scale(s, s, s).translate(0, y, z);
  return [
    [k(ball(0.1, 0, 0.06, 0, 0.85, 0.75, 1.5)), "#f4f4f2"],
    [k(ball(0.06, 0, 0.14, -0.11)), head],
    [k(box(0.022, 0.018, 0.07, 0, 0.13, -0.19)), "#f2c230"],
    [k(box(0.024, 0.012, 0.014, 0, 0.12, -0.2)), "#d23a2a"],
    [k(ball(0.011, -0.04, 0.16, -0.14)), "#1b1b1d"],
    [k(ball(0.011, 0.04, 0.16, -0.14)), "#1b1b1d"],
    [k(box(0.03, 0.06, 0.2, -0.085, 0.08, 0.02)), "#9aa3ad"],
    [k(box(0.03, 0.06, 0.2, 0.085, 0.08, 0.02)), "#9aa3ad"],
    [k(box(0.032, 0.05, 0.07, -0.085, 0.09, 0.15)), "#1b1b1d"],
    [k(box(0.032, 0.05, 0.07, 0.085, 0.09, 0.15)), "#1b1b1d"],
    [k(box(0.07, 0.02, 0.1, 0, 0.06, 0.17)), "#f4f4f2"],
    [k(box(0.016, 0.06, 0.016, -0.035, -0.02, 0)), "#e79a8c"],
    [k(box(0.016, 0.06, 0.016, 0.035, -0.02, 0)), "#e79a8c"],
  ];
}

/** Blobs of seagull muck, on a surface facing up at height y. */
function splats(r: () => number, n: number, y: number, spread: number): Piece[] {
  const out: Piece[] = [];
  for (let k = 0; k < n; k++) {
    const x = (r() - 0.5) * spread, z = (r() - 0.5) * spread;
    out.push([ball(0.03 + r() * 0.02, x, y, z, 1, 0.35, 1), "#f6f6ee"], [ball(0.012, x + 0.02, y + 0.01, z, 1, 0.6, 1), "#d8d4b8"]);
  }
  return out;
}
const fixed = (seed: number) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

/** The shape of a wearable, where it hangs (the head or the jacket), welded into one. */
export function wearGeometry(id: string): { geo: THREE.BufferGeometry; on: "head" | "body" } | null {
  const tweed = "#6e5a3e", tweedDark = "#4f402c";
  switch (id) {
    case "gull":
      return { on: "head", geo: part(gullPieces(1, C + 0.15, 0.01)) };
    case "splat":
      return { on: "head", geo: part([
        [cyl(0.165, 0.168, 0.06, 0, C + 0.1, 0.0, 16).scale(1, 1, 1.05), tweed],
        [cyl(0.15, 0.165, 0.05, 0, C + 0.145, 0.01, 16), tweedDark],
        [box(0.26, 0.018, 0.1, 0, C + 0.085, -0.19), tweedDark],
        ...splats(fixed(7), 4, C + 0.172, 0.18),
        [ball(0.014, 0.09, C + 0.12, -0.16, 0.8, 2.2, 0.8), "#f6f6ee"],
      ]) };
    case "cone":
      return { on: "head", geo: part([
        [box(0.3, 0.025, 0.3, 0, C + 0.12, 0), "#1b1b1d"],
        [cyl(0.03, 0.13, 0.42, 0, C + 0.34, 0, 14), "#f26a1b"],
        [cyl(0.075, 0.093, 0.08, 0, C + 0.35, 0, 14).scale(1.02, 1, 1.02), "#f4f4f2"],
      ]).rotateZ(0.12) };
    case "helmet":
      return { on: "head", geo: part([
        [shell(0.172, 0, Math.PI * 2, 0.5 * Math.PI, C + 0.01, 0.0), "#a8adb3"],
        [box(0.36, 0.025, 0.36, 0, C + 0.01, 0.0).scale(1, 1, 1), "#8d9298"],
        [box(0.04, 0.12, 0.34, 0, C + 0.21, 0.01), "#b3262e"],
        [box(0.025, 0.06, 0.3, 0, C + 0.155, 0.01), "#c9a14a"],
        [box(0.02, 0.12, 0.08, -0.16, C - 0.06, -0.06), "#8d9298"],
        [box(0.02, 0.12, 0.08, 0.16, C - 0.06, -0.06), "#8d9298"],
      ]) };
    case "deer":
      return { on: "head", geo: part([
        [shell(0.17, 0, Math.PI * 2, 0.5 * Math.PI, C + 0.005, 0.0), tweed],
        [box(0.2, 0.018, 0.1, 0, C + 0.02, -0.19).rotateX(0), tweedDark],
        [box(0.2, 0.018, 0.1, 0, C + 0.02, 0.19), tweedDark],
        [box(0.02, 0.06, 0.1, -0.16, C + 0.12, 0), tweedDark],
        [box(0.02, 0.06, 0.1, 0.16, C + 0.12, 0), tweedDark],
        [ball(0.02, 0, C + 0.18, 0), tweedDark],
      ]) };
    case "toque":
      return { on: "head", geo: part([
        [cyl(0.162, 0.162, 0.08, 0, C + 0.1, 0, 16), "#f4f4f2"],
        [cyl(0.2, 0.15, 0.22, 0, C + 0.25, 0, 16), "#fbfbf8"],
        [ball(0.2, 0, C + 0.37, 0, 1.05, 0.55, 1.05), "#fbfbf8"],
      ]) };
    case "bonnet":
      return { on: "head", geo: part([
        [shell(0.175, 0, Math.PI * 2, 0.55 * Math.PI, C, 0.03), "#f6b6c8"],
        [new THREE.TorusGeometry(0.17, 0.03, 6, 18).rotateY(0).translate(0, C + 0.0, -0.06), "#fdf2f5"],
        [box(0.02, 0.16, 0.02, -0.1, C - 0.15, -0.06), "#f6b6c8"],
        [box(0.02, 0.16, 0.02, 0.1, C - 0.15, -0.06), "#f6b6c8"],
        [ball(0.035, 0, C - 0.23, -0.07, 1.6, 0.8, 0.8), "#f6b6c8"],
      ]) };
    case "specs":
      return { on: "head", geo: part([
        [new THREE.TorusGeometry(0.04, 0.009, 6, 14).translate(-0.055, C + 0.02, -0.152), "#1b1b1d"],
        [new THREE.TorusGeometry(0.04, 0.009, 6, 14).translate(0.055, C + 0.02, -0.152), "#1b1b1d"],
        [box(0.03, 0.01, 0.01, 0, C + 0.03, -0.152), "#1b1b1d"],
        [box(0.012, 0.01, 0.15, -0.15, C + 0.03, -0.08), "#1b1b1d"],
        [box(0.012, 0.01, 0.15, 0.15, C + 0.03, -0.08), "#1b1b1d"],
        [ball(0.034, 0, C - 0.02, -0.165, 1, 1.1, 1), "#f0a3a3"],
        [box(0.11, 0.028, 0.02, 0, C - 0.055, -0.152), "#1d1d20"],
        [box(0.11, 0.06, 0.012, 0, C + 0.075, -0.15), "#1d1d20"],
      ]) };
    case "shades":
      return { on: "head", geo: part([
        [box(0.09, 0.05, 0.012, -0.055, C + 0.02, -0.155), "#14161c"],
        [box(0.09, 0.05, 0.012, 0.055, C + 0.02, -0.155), "#14161c"],
        [box(0.25, 0.012, 0.012, 0, C + 0.045, -0.156), "#d23a2a"],
        [box(0.012, 0.012, 0.15, -0.15, C + 0.04, -0.08), "#d23a2a"],
        [box(0.012, 0.012, 0.15, 0.15, C + 0.04, -0.08), "#d23a2a"],
        [box(0.036, 0.055, 0.045, 0, C - 0.015, -0.158), "#ff7a6b"],
        [box(0.03, 0.02, 0.03, 0, C - 0.02, -0.18), "#f4f4f2"],
      ]) };
    case "owl":
      return { on: "body", geo: part([
        [ball(0.07, 0.2, 0.62, 0.0, 0.9, 1.3, 0.85), "#7a5536"],
        [ball(0.05, 0.2, 0.6, -0.04, 0.9, 1.1, 0.6), "#d9c29a"],
        [ball(0.055, 0.2, 0.74, 0, 1.1, 0.9, 0.95), "#7a5536"],
        [ball(0.022, 0.178, 0.75, -0.045), "#f2c230"],
        [ball(0.022, 0.222, 0.75, -0.045), "#f2c230"],
        [ball(0.01, 0.178, 0.75, -0.064), "#1b1b1d"],
        [ball(0.01, 0.222, 0.75, -0.064), "#1b1b1d"],
        [box(0.014, 0.02, 0.02, 0.2, 0.725, -0.055), "#c99a2a"],
        [box(0.02, 0.04, 0.02, 0.17, 0.8, 0), "#5e4028"],
        [box(0.02, 0.04, 0.02, 0.23, 0.8, 0), "#5e4028"],
      ]) };
    case "brolly": {
      const canopy = new THREE.ConeGeometry(0.42, 0.18, 8, 1, true).translate(0, 1.12, 0.3);
      return { on: "body", geo: part([
        [box(0.3, 0.32, 0.14, 0, 0.3, 0.2), "#3b4a5c"],
        [cyl(0.012, 0.012, 1.0, 0, 0.62, 0.3, 6), "#2a2a2a"],
        [canopy, "#22263a"],
        [ball(0.02, 0, 1.22, 0.3), "#2a2a2a"],
        ...splats(fixed(11), 6, 1.13, 0.5).map(([g, c]) => [g.translate(0, 0, 0.3), c] as Piece),
      ]) };
    }
    case "cat":
      return { on: "body", geo: part([
        [ball(0.09, -0.16, 0.6, 0.02, 1.4, 0.75, 0.85), "#e0893a"],
        [ball(0.065, -0.3, 0.63, -0.01), "#e0893a"],
        [new THREE.ConeGeometry(0.025, 0.05, 4).translate(-0.32, 0.7, -0.02), "#e0893a"],
        [new THREE.ConeGeometry(0.025, 0.05, 4).translate(-0.27, 0.7, -0.02), "#e0893a"],
        [ball(0.012, -0.33, 0.64, -0.065), "#2a7a3a"],
        [ball(0.012, -0.29, 0.64, -0.065), "#2a7a3a"],
        [ball(0.03, -0.12, 0.6, 0.08, 1, 0.8, 1), "#f4f0e6"],
        [box(0.035, 0.2, 0.035, -0.05, 0.48, 0.12).rotateZ(0), "#c46f26"],
      ]) };
    case "loaf":
      return { on: "body", geo: part([
        [box(0.3, 0.34, 0.14, 0, 0.3, 0.2), "#2f5a3a"],
        [box(0.3, 0.06, 0.16, 0, 0.47, 0.2), "#244a2f"],
        [cyl(0.045, 0.045, 0.75, 0, 0, 0, 10).rotateZ(-0.5).translate(0.1, 0.62, 0.2), "#d8a04e"],
        [box(0.02, 0.02, 0.06, 0.04, 0.75, 0.16).rotateZ(-0.5), "#b07a32"],
      ]) };
  }
  return null;
}

// ---- the wardrobe page --------------------------------------------------------------------------

let page: HTMLDivElement | null = null;
let shut: (() => void) | null = null;
/** Close the wardrobe if it's open (back to the game). */
export function closeWardrobe() { shut?.(); }
let preview: { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; avatar: Avatar; raf: number } | null = null;

/** Open the wardrobe over the pause menu. changed: you've put something on or taken it off. */
export function openWardrobe(colour: string, seed: string, changed: () => void, closed: () => void) {
  if (page) return;
  page = document.createElement("div");
  page.id = "wardrobe";
  page.className = "overlay";
  page.innerHTML = `<div class="card wardcard">
    <header class="masthead"><span class="mark" aria-hidden="true"></span><span>Bath &amp; North East Somerset<b>Wardrobe</b></span></header>
    <div class="wardbody"><canvas class="wardview" width="240" height="320" aria-label="You, in what you're wearing"></canvas><div class="wardlist"></div></div>
    <div class="pubbar"><p class="hint wardcount"></p><button type="button" class="wardback">Back</button></div>
  </div>`;
  document.body.appendChild(page);
  const list = page.querySelector<HTMLDivElement>(".wardlist")!;
  const draw = () => {
    const s = load();
    page!.querySelector(".wardcount")!.textContent = `${s.got.length} of ${WEARABLES.length} found. Everyone you play with sees what you wear.`;
    list.innerHTML = SLOTS.map((slot) => `<h3>${SLOT_NAMES[slot]}</h3><div class="wardrow">`
      + `<button type="button" class="wardtile${!s.worn[slot] ? " on" : ""}" data-slot="${slot}" data-id="">Nothing</button>`
      + WEARABLES.filter((w) => w.slot === slot).map((w) => {
        const got = s.got.includes(w.id), on = s.worn[slot] === w.id;
        return got ? `<button type="button" class="wardtile${on ? " on" : ""}" data-slot="${slot}" data-id="${w.id}">${w.name}</button>`
          : `<button type="button" class="wardtile locked" disabled title="${w.how}">??? <small>${w.how}</small></button>`;
      }).join("") + `</div>`).join("");
    preview?.avatar.setWear(myWear());
  };
  list.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button.wardtile");
    if (!b || b.disabled) return;
    const s = load(), slot = b.dataset.slot as Slot, id = b.dataset.id ?? "";
    if (id) s.worn[slot] = id; else delete s.worn[slot];
    save(s);
    draw();
    changed();
  });
  const close = () => {
    if (preview) {
      cancelAnimationFrame(preview.raf);
      preview.renderer.dispose();
      preview.renderer.forceContextLoss();
      preview = null;
    }
    page?.remove();
    page = null;
    shut = null;
    closed();
  };
  shut = close;
  page.querySelector(".wardback")!.addEventListener("click", close);
  // you, turning round slowly, in what you've got on
  try {
    const canvas = page.querySelector<HTMLCanvasElement>(".wardview")!;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight("#fff8ec", "#58606a", 2.2));
    const sun = new THREE.DirectionalLight("#ffffff", 1.6);
    sun.position.set(2, 4, -3);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(30, 240 / 320, 0.1, 20);
    camera.position.set(0, 1.35, -3.6);
    camera.lookAt(0, 1.05, 0);
    const avatar = new Avatar("", colour, seed);
    avatar.preview();
    scene.add(avatar.root);
    preview = { renderer, scene, camera, avatar, raf: 0 };
    const spin = (t: number) => {
      if (!preview) return;
      avatar.root.rotation.y = Math.sin(t / 1600) * 0.9;
      avatar.animateWear(t / 1000);
      renderer.render(scene, camera);
      preview.raf = requestAnimationFrame(spin);
    };
    preview.raf = requestAnimationFrame(spin);
  } catch { /* no preview, just the list */ }
  draw();
}
