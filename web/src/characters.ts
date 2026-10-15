// Who's who (characters.html): everyone you meet on the streets of Bath, one at a time on a turntable,
// to look at from every side. Players come in any of the game's colours and can be dressed in
// anything from the wardrobe (wardrobe.ts), earned or not; the gangs (naughtyboys.ts) come in every
// kit, with the ringleaders and the Flag Lads' bosses; the cats (cats.ts) in every breed and coat;
// the gulls, Big Lad and the tourists from Seagull Attack (gulls.ts); Bendy (bendy.ts); and everyone
// else about Bath. The monsters in the mines have their own bestiary.
//
// Who decides what: nothing here goes over the network or touches what you've earned. It draws
// the game's own models, built by the same code the game uses, so what you see is what's in the game.
import * as THREE from "three";
import { Avatar, COLOURS } from "./avatar";
import { Figure as CatFigure, coatsOf } from "./cats";
import { BOSS, CHAIR, CRICKET, Figure, KITS, LADDER, LOUD, NAUGHTY, RUGBY, SOCIETY, look, withLoud } from "./naughtyboys";
import { SLOTS, WEARABLES, type Slot } from "./wardrobe";
import { BOSS_SCALE, gullFigure, touristOnBench } from "./gulls";
import { Figure as BendyFigure } from "./bendy";
import { Owner, type Mood } from "./breakdown";
import { boaterGeometry } from "./canal";
import { figure as statue } from "./landmarks/kit";

type Kind = "player" | "gang" | "cat" | "gull" | "tourist" | "bendy" | "owner" | "still";
/** size: roughly how tall it stands, to frame it (a person is 1.8). */
interface Entry { name: string; blurb: string; kind: Kind; group: string; look?: number; kits?: string[]; loud?: number; size?: number; head?: string; scale?: number; build?: () => THREE.Object3D }

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
  { group: "Seagull Attack", kind: "gull", name: "Herring gull", blurb: "The gulls of Bath: hoverers, swoopers, walkers and poopers, all after the tourists' sandwiches.", head: "#f4f4f2", scale: 1.6, size: 0.9 },
  { group: "Seagull Attack", kind: "gull", name: "Black-headed gull", blurb: "Smaller and quicker, with a dark hood.", head: "#3a3030", scale: 1.25, size: 0.7 },
  { group: "Seagull Attack", kind: "gull", name: "Big Lad", blurb: "The last wave: about 12 m wing tip to wing tip. He perches on the rooftops, dive-bombs and calls in a gang.", head: "#f4f4f2", scale: BOSS_SCALE, size: 7 },
  { group: "Seagull Attack", kind: "tourist", name: "Tourist", blurb: "Sat on a bench with a sandwich from the Darling Deli, a bucket hat and a camera. Keep the gulls off it.", size: 1.4 },
  { group: "Seagull Attack", kind: "tourist", name: "Hen party", blurb: "One of the tourists on a hen do: pink, with a sash, and six sandwiches.", size: 1.4 },
  { group: "Bosses", kind: "bendy", name: "Bendy", blurb: "Four metres of black, rubbery limbs with a lamp in his forehead, at the top of Bath. Get caught in the beam and he comes for you.", size: 4.2 },
  { group: "Round Bath", kind: "owner", name: "The breakdown man", blurb: "On Bathwick Street, his BMW dead at the kerb: pacing in his gilet, on the phone, telling anyone who comes near.", size: 1.9 },
  { group: "Round Bath", kind: "still", name: "Narrowboat crew", blurb: "At the tiller of the boats chugging along the Kennet and Avon.", size: 1.9,
    build: () => new THREE.Mesh(boaterGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true })) },
  { group: "Round Bath", kind: "still", name: "A witness", blurb: "Someone in a mac who saw the Wanted man go by, under a faint red beam.", size: 1.7,
    build: () => { const g = new THREE.Group(), skin = new THREE.MeshLambertMaterial({ color: "#e6bd9f" });
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 1.3, 10).translate(0, 0.65, 0), new THREE.MeshLambertMaterial({ color: "#a08a5a" })),
        new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 8).translate(0, 1.47, 0), skin));
      return g; } },
  { group: "Round Bath", kind: "still", name: "Abbey angel", blurb: "The angels on the ladders up Bath Abbey's west front. Climb past one at the wrong moment and it knocks you off.", size: 2.2,
    build: () => new THREE.Mesh(statue(true), new THREE.MeshLambertMaterial({ color: "#cdbf9c" })) },
  { group: "Animals", kind: "cat", name: "Cat", blurb: "Bath's cats: most just sit about, but cross a swarm and they'll have you.", look: 0, size: 0.5,
    kits: ["Tabby", "Plain", "Tuxedo", "Siamese", "Calico and tortoiseshell", "Maine Coon", "Sphynx", "Persian", "Bengal", "Dyed"] },
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
let kit = 0, coat = 0, loud = 0, catBuild: "" | "kitten" | "fat" | "long" = "";
let state = "Standing";
let colour = COLOURS[0], seed = 1;
const worn: Partial<Record<Slot, string>> = {};
let rosettes = "";
let walkZ = 0;
let avatar: Avatar | null = null, gang: Figure | null = null, cat: CatFigure | null = null;
let gull: ReturnType<typeof gullFigure> | null = null, bendy: BendyFigure | null = null, owner: Owner | null = null, flap = 0;
let punch = 0, deadT = 0;

function build() {
  turntable.clear();
  // Bendy puts himself, his beam and its pool of light straight into the scene
  if (bendy) scene.remove(...scene.children.filter((o) => o !== ground && o !== turntable && !(o as THREE.Light).isLight));
  avatar = null; gang = null; cat = null; gull = null; bendy = null; owner = null;
  const e = ENTRIES[current];
  if (e.kind === "player") {
    avatar = new Avatar("", colour, `who${seed}`);
    avatar.preview();
    avatar.tagged = false;
    walkZ = 0;
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
  } else if (e.kind === "gull") {
    gull = gullFigure(e.head!, e.scale!);
    turntable.add(gull.g);
  } else if (e.kind === "tourist") {
    turntable.add(touristOnBench(seed, e.name === "Hen party"));
  } else if (e.kind === "bendy") {
    bendy = new BendyFigure(scene);
    bendy.root.visible = true;
  } else if (e.kind === "owner") {
    owner = new Owner();
    turntable.add(owner.root);
  } else if (e.kind === "still") {
    const o = e.build!();
    o.traverse((m) => { m.castShadow = true; });
    turntable.add(o);
  } else {
    cat = new CatFigure();
    cat.dress(kit * 16 + coat, seed, catBuild);
    cat.root.visible = true;
    turntable.add(cat.root);
  }
  punch = 0; deadT = 0;
}

const STATES: Record<Kind, string[]> = {
  player: ["Standing", "Walking", "Running", "Crouching", "Tummy time", "No gun"],
  gang: ["Standing", "Walking", "Running", "Punching", "Hands up", "Cuffed", "Down"],
  cat: ["Sitting", "Walking", "Running", "Angry", "Clawing", "Down"],
  gull: ["Flying", "Gliding", "Perched"],
  tourist: ["Sat down"],
  bendy: ["Walking", "Standing", "Searching", "Hunting", "Lashing out", "Down"],
  owner: ["Pacing", "On the phone", "Despairing", "Pointing", "Head in hands"],
  still: ["Standing"],
};
const MOODS: Record<string, Mood> = { "Pacing": "pace", "On the phone": "phone", "Despairing": "despair", "Pointing": "point", "Head in hands": "head" };

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
    bar.append(group("Build", ...([["", "Any"], ["kitten", "Kitten"], ["fat", "Fat"], ["long", "Long-haired"]] as const).map(([v, n]) =>
      button(n, v === catBuild, () => { catBuild = v; again(); }))));
    bar.append(button("Another cat", false, () => { seed++; again(); }));
  } else if (e.kind === "tourist") {
    bar.append(button("Another tourist", false, () => { seed++; again(); }));
  } else if (e.kind === "gang") {
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
  const size = ENTRIES[current].size ?? 1.8;
  const lookY = size * 0.55, d = dist * Math.max(0.35, size / 1.8);
  camera.position.set(Math.sin(yaw) * Math.cos(pitch) * d, lookY + Math.sin(pitch) * d, Math.cos(yaw) * Math.cos(pitch) * d);
  camera.lookAt(0, lookY, 0);
  if (avatar) {
    // the avatar draws itself from where it's been, like any other player: walk it along on the spot
    walkZ -= dt * (state === "Walking" ? 1.6 : state === "Running" ? 6 : 0);
    avatar.armed = state !== "No gun";
    avatar.push({ t: now, x: 0, y: 0, z: walkZ, yaw: 0, pitch: 0, crouch: state === "Crouching" ? 1 : 0, prone: state === "Tummy time" ? 1 : 0 });
    avatar.update(now, dt);
    avatar.root.position.set(0, 0, 0);
  }
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
  if (gull) {
    const s = ENTRIES[current].scale!, perched = state === "Perched";
    flap += dt * (state === "Flying" ? 7 : 0);
    const wa = perched ? 1.2 : state === "Gliding" ? 0.08 : Math.sin(flap) * 0.6;
    gull.wl.rotation.z = wa; gull.wr.rotation.z = -wa;
    gull.wl.scale.x = gull.wr.scale.x = perched ? 0.35 : 1;
    gull.g.position.y = perched ? 0.13 * s : size * 0.55;
  }
  if (bendy) {
    const t = now / 1000;
    const speed = state === "Walking" ? 1.2 : 0, lash = state === "Lashing out" ? (t * 1.2) % 1 : 0;
    deadT = state === "Down" ? deadT + dt : 0;
    const beam = state === "Searching" || state === "Hunting";
    bendy.pose(0, 0, 0, 0, Math.sin(t * 0.6) * 0.6, speed, lash, 1, deadT, state === "Hunting", dt);
    bendy.aim(0, 0, -8, state === "Hunting", beam && !deadT);
  }
  if (owner) owner.pose(0, 0, 0, 0, state === "Pacing" ? 1.1 : 0, MOODS[state] ?? "pace", now / 1000, dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

show(Math.max(0, Math.min(ENTRIES.length - 1, parseInt(location.hash.slice(1)) || 0)));
requestAnimationFrame(frame);
