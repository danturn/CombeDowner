// Who's who (characters.html): everyone you meet on the streets of Bath, one at a time on a turntable,
// to look at from every side. Players come in any of the game's colours and can be dressed in
// anything from the wardrobe (wardrobe.ts), earned or not; the gangs (naughtyboys.ts) come in every
// kit, with the ringleaders and the Flag Lads' bosses; and the cats (cats.ts) in every breed and coat.
// The monsters in the mines have their own bestiary.
//
// Who decides what: nothing here goes over the network or touches what you've earned. It draws
// the game's own models, built by the same code the game uses, so what you see is what's in the game.
import * as THREE from "three";
import { Avatar, COLOURS } from "./avatar";
import { Figure as CatFigure, coatsOf } from "./cats";
import { BOSS, CHAIR, CRICKET, Figure, KITS, LADDER, LOUD, NAUGHTY, RUGBY, SOCIETY, look, withLoud } from "./naughtyboys";
import { SLOTS, WEARABLES, type Slot } from "./wardrobe";

type Kind = "player" | "gang" | "cat";
interface Entry { name: string; blurb: string; kind: Kind; group: string; look?: number; kits?: string[]; loud?: number }

const kits = (names: string[]) => names;
const ENTRIES: Entry[] = [
  { group: "Players", kind: "player", name: "A player", blurb: "You, and everyone you play with: a jacket in your own colour, and whatever you've earned from the wardrobe." },
  { group: "Gangs", kind: "gang", name: "Naughty boy", blurb: "Trackies, a cap and a chain. Runs faster than you walk; shoot one and he comes for you.", look: look(NAUGHTY, 0) },
  { group: "Gangs", kind: "gang", name: "Ringleader", blurb: "A job's ringleader: a size bigger, a chunky gold chain, and he hits harder.", look: look(NAUGHTY, 0) + BOSS },
  { group: "Gangs", kind: "gang", name: "Wanted ringleader", blurb: "A Wanted man wears one loud thing so you can pick him out of a crowd.", look: look(NAUGHTY, 0) + BOSS, loud: 1 },
  { group: "Gangs", kind: "gang", name: "Rugby team", blurb: "Hooped jerseys, bigger and quicker and harder to put down. They turn out near their pitches and outside the pubs.", look: look(RUGBY, 0),
    kits: kits(["Navy and white", "Maroon and gold", "Green and white", "Black and gold", "Blue and black", "Red and black"]).slice(0, KITS[RUGBY]) },
  { group: "Gangs", kind: "gang", name: "Cricket team", blurb: "In their whites, swinging bats, which reach further than a fist.", look: look(CRICKET, 0),
    kits: kits(["Navy and red", "Maroon and gold", "Green and gold", "Purple and gold", "Navy and gold"]).slice(0, KITS[CRICKET]) },
  { group: "The Flag Lads", kind: "gang", name: "Flag lad", blurb: "England shirts, some with the flag worn as a cape. They only turn up at the pubs they've taken over.", look: look(SOCIETY, 0),
    kits: ["White shirt, jeans", "White shirt and cape, shorts", "Red away shirt", "White shirt and cape, black jeans"] },
  { group: "The Flag Lads", kind: "gang", name: "Ladder lad", blurb: "Hi-vis and a ladder: puts cleared flags back up, and runs from you rather than fight.", look: look(LADDER, 0),
    kits: ["White shirt", "White shirt, shorts", "Red away shirt", "White shirt, black jeans"] },
  { group: "The Flag Lads", kind: "gang", name: "The Gaffer", blurb: "Runs the takeover: wax jacket over his England shirt, a flag bucket hat and a megaphone.", look: look(CHAIR, 0) },
  { group: "The Flag Lads", kind: "gang", name: "His right-hand man", blurb: "Black bomber, hi-vis armband, shades. The Gaffer can't be hurt till he's down.", look: look(CHAIR, 1) },
  { group: "The Flag Lads", kind: "gang", name: "The Gaffer's cousin", blurb: "Runs the second takeover when a big room gets two: a gilet over the red away shirt, and a flat cap.", look: look(CHAIR, 2) },
  { group: "Animals", kind: "cat", name: "Cat", blurb: "Bath's cats: most just sit about, but cross a swarm and they'll have you.", look: 0,
    kits: ["Tabby", "Plain", "Tuxedo", "Siamese", "Calico", "Maine Coon", "Sphynx", "Persian", "Bengal", "Dyed"] },
];

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>("view"), list = $("list"), bar = $("bar");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.shadowMap.enabled = true;
const scene = new THREE.Scene();
scene.background = new THREE.Color("#2a3038");
scene.add(new THREE.HemisphereLight("#fff8ec", "#58606a", 2.2));
const sun = new THREE.DirectionalLight("#ffffff", 1.8);
sun.position.set(2.5, 5, -3);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -2, right: 2, top: 3, bottom: -1 });
scene.add(sun);
const ground = new THREE.Mesh(new THREE.CircleGeometry(2.2, 48).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: "#59606a" }));
ground.receiveShadow = true;
scene.add(ground);
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
const turntable = new THREE.Group();
scene.add(turntable);

// what's on the turntable now
let current = 0;
let kit = 0, coat = 0, loud = 0;
let state = "Standing";
let colour = COLOURS[0], seed = 1;
const worn: Partial<Record<Slot, string>> = {};
let rosettes = "";
let avatar: Avatar | null = null, gang: Figure | null = null, cat: CatFigure | null = null;
let punch = 0, deadT = 0;

function build() {
  turntable.clear();
  avatar = null; gang = null; cat = null;
  const e = ENTRIES[current];
  if (e.kind === "player") {
    avatar = new Avatar("", colour, `who${seed}`);
    avatar.preview();
    avatar.setWear(SLOTS.map((s) => worn[s]).filter(Boolean).join(","));
    avatar.setRosettes(rosettes);
    turntable.add(avatar.root);
  } else if (e.kind === "gang") {
    gang = new Figure();
    let lk = e.look! + (e.kits ? kit : 0);
    if (e.loud) lk = withLoud(lk, loud || e.loud);
    gang.dress(lk);
    gang.root.visible = true;
    turntable.add(gang.root);
  } else {
    cat = new CatFigure();
    cat.dress(kit * 16 + coat, seed);
    cat.root.visible = true;
    turntable.add(cat.root);
  }
  punch = 0; deadT = 0;
}

const STATES: Record<Kind, string[]> = {
  player: ["Standing"],
  gang: ["Standing", "Walking", "Running", "Punching", "Hands up", "Cuffed", "Down"],
  cat: ["Sitting", "Walking", "Running", "Angry", "Clawing", "Down"],
};

function button(text: string, on: boolean, click: () => void, cls = "") {
  const b = document.createElement("button");
  b.type = "button"; b.textContent = text; b.className = (on ? "on " : "") + cls;
  b.addEventListener("click", click);
  return b;
}
function group(label: string, ...els: HTMLElement[]) {
  const g = document.createElement("div");
  g.className = "group";
  if (label) { const s = document.createElement("span"); s.textContent = label; g.append(s); }
  g.append(...els);
  return g;
}
function select(options: [string, string][], value: string, change: (v: string) => void) {
  const s = document.createElement("select");
  for (const [v, t] of options) { const o = document.createElement("option"); o.value = v; o.textContent = t; s.append(o); }
  s.value = value;
  s.addEventListener("change", () => change(s.value));
  return s;
}

function drawBar() {
  const e = ENTRIES[current];
  bar.innerHTML = "";
  const again = () => { build(); drawBar(); };
  bar.append(button("‹", false, () => show(current - 1)), button("›", false, () => show(current + 1)));
  if (STATES[e.kind].length > 1) bar.append(group("", ...STATES[e.kind].map((s) => button(s, s === state, () => { state = s; build(); drawBar(); }))));
  if (e.kind === "player") {
    bar.append(group("Colour", ...COLOURS.map((c) => {
      const b = button("", c === colour, () => { colour = c; again(); }, "swatch");
      b.style.background = c; b.title = c;
      return b;
    })));
    for (const slot of SLOTS) {
      const opts: [string, string][] = [["", "Nothing"], ...WEARABLES.filter((w) => w.slot === slot).map((w): [string, string] => [w.id, w.name])];
      bar.append(group(slot === "head" ? "Head" : slot === "face" ? "Face" : "Back", select(opts, worn[slot] ?? "", (v) => { if (v) worn[slot] = v; else delete worn[slot]; again(); })));
    }
    bar.append(group("Rosettes", select([["", "None"], ["g", "Gold"], ["gs", "Gold, silver"], ["gsb", "Gold, silver, bronze"]], rosettes, (v) => { rosettes = v; again(); })));
    bar.append(button("Another face", false, () => { seed++; again(); }));
  } else if (e.kind === "cat") {
    bar.append(group("Breed", select(e.kits!.map((n, k): [string, string] => [String(k), n]), String(kit), (v) => { kit = +v; coat = 0; again(); })));
    bar.append(group("Coat", ...Array.from({ length: coatsOf(kit) }, (_, k) => button(String(k + 1), k === coat, () => { coat = k; again(); }))));
    bar.append(button("Another cat", false, () => { seed++; again(); }));
  } else {
    if (e.kits) bar.append(group("Kit", select(e.kits.map((n, k): [string, string] => [String(k), n]), String(kit), (v) => { kit = +v; again(); })));
    if (e.loud) bar.append(group("Wearing", select(LOUD.slice(1).map((n, k): [string, string] => [String(k + 1), n]), String(loud || e.loud), (v) => { loud = +v; again(); })));
    bar.append(button("Another one", false, again));
  }
}

function show(i: number) {
  current = (i + ENTRIES.length) % ENTRIES.length;
  kit = 0; coat = 0; loud = 0;
  state = STATES[ENTRIES[current].kind][0];
  const e = ENTRIES[current];
  $("name").textContent = e.name;
  $("blurb").textContent = e.blurb;
  list.querySelectorAll("button").forEach((b, k) => b.classList.toggle("on", k === current));
  build();
  drawBar();
  try { history.replaceState(null, "", `#${current}`); } catch { /* fine without */ }
}

// the list down the side, by group
let lastGroup = "";
ENTRIES.forEach((e, k) => {
  if (e.group !== lastGroup) {
    const h = document.createElement("h2"); h.textContent = lastGroup = e.group; list.append(h);
  }
  list.append(button(e.name, false, () => show(k)));
});

// turning and zooming
let yaw = Math.PI, pitch = 0.12, dist = 4.6, spin = true, drag: { x: number; y: number } | null = null;
canvas.addEventListener("pointerdown", (ev) => { drag = { x: ev.clientX, y: ev.clientY }; spin = false; canvas.setPointerCapture(ev.pointerId); canvas.style.cursor = "grabbing"; });
canvas.addEventListener("pointermove", (ev) => {
  if (!drag) return;
  yaw -= (ev.clientX - drag.x) * 0.01;
  pitch = Math.max(-0.2, Math.min(1.2, pitch + (ev.clientY - drag.y) * 0.006));
  drag = { x: ev.clientX, y: ev.clientY };
});
canvas.addEventListener("pointerup", () => { drag = null; canvas.style.cursor = "grab"; });
canvas.addEventListener("wheel", (ev) => { ev.preventDefault(); dist = Math.max(1.6, Math.min(9, dist * (1 + ev.deltaY * 0.001))); }, { passive: false });
addEventListener("keydown", (ev) => {
  if ((ev.target as HTMLElement).tagName === "SELECT") return;
  if (ev.key === "ArrowDown" || ev.key === "ArrowRight") { show(current + 1); ev.preventDefault(); }
  if (ev.key === "ArrowUp" || ev.key === "ArrowLeft") { show(current - 1); ev.preventDefault(); }
});

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio())) {
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  }
}

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  resize();
  if (spin) yaw += dt * 0.5;
  const kind = ENTRIES[current].kind, small = kind === "cat";
  const lookY = small ? 0.25 : 1.0, d = small ? dist * 0.45 : dist;
  camera.position.set(Math.sin(yaw) * Math.cos(pitch) * d, lookY + Math.sin(pitch) * d, Math.cos(yaw) * Math.cos(pitch) * d);
  camera.lookAt(0, lookY, 0);
  if (avatar) avatar.animateWear(now / 1000);
  if (gang) {
    const speed = state === "Walking" ? 1.3 : state === "Running" ? 5.7 : 0;
    if (state === "Punching") { punch -= dt * 1.4; if (punch <= -0.4) punch = 1; } else punch = 0;
    deadT = state === "Down" ? deadT + dt : 0;
    gang.hands = state === "Hands up" ? 1 : state === "Cuffed" ? 2 : 0;
    gang.pose(0, 0, 0, 0, speed, Math.max(0, punch), deadT, dt);
  }
  if (cat) {
    const speed = state === "Walking" ? 1.2 : state === "Running" ? 6 : 0;
    if (state === "Clawing") { punch -= dt * 2; if (punch <= -0.4) punch = 1; } else punch = 0;
    deadT = state === "Down" ? deadT + dt : 0;
    cat.pose(0, 0, 0, 0, speed, false, Math.max(0, punch), state === "Angry" || state === "Clawing", deadT, dt);
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

show(Math.max(0, Math.min(ENTRIES.length - 1, parseInt(location.hash.slice(1)) || 0)));
requestAnimationFrame(frame);
