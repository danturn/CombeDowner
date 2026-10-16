// What's what (whatswhat.html): the hand-made scenery and the vehicles, one at a time, to look at
// from every side without going to them in the game. Three tabs:
//  - Set pieces (landmarks/setpieces.ts): each is placed exactly as the game places it. The page
//    loads the square of Bath its origin is in, hides what the map tools built there and works out
//    its args just as the game does (maskSetPieces), then builds it with the game's own builder.
//    The squares round it come too, plainly drawn (the ground, the streets, the river and the
//    other buildings as blocks), with its outline and the buildings it hides there to switch on, so
//    a set piece that doesn't sit right can be seen for what it is.
//  - Landmarks: the other hand-made ones the map's landmark pack places (tools/landmarks/bath.py),
//    found in the square they stand in.
//  - Vehicles: everything you can drive, the everyday cars in every make and paint, the trains, the
//    cable car, the narrowboats and the rides, built by vehicles.ts, railway.ts, cableway.ts,
//    canal.ts and rides.ts.
// Each can be drawn in full, without its textures, or as a wireframe, and saved as a USDZ model for
// AR Quick Look, which an iPhone or iPad opens straight from the page.
//
// Who decides what: nothing here goes over the network or touches what you've earned. It only reads
// the map files the game reads.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { USDZExporter } from "three/examples/jsm/exporters/USDZExporter.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { KERBED, PAVE, roadHalf, type MapData, type TileIndex } from "./map";
import { SET_PIECES, inRing, maskSetPieces, type SetPiece } from "./landmarks/setpieces";
import { landmarkModel } from "./landmarks";
import { clearCourt } from "./bonfire";
import { Vehicle, SPECS, MAKES, type VKind } from "./vehicles";
import { CAR_PAINT } from "./furniture";
import { GOLF, GOLF_PAINT, LAND_ROVER, LR_PAINT } from "./makes";
import { trainModels } from "./railway";
import { cabinModel } from "./cableway";
import { BOAT_PAINTS, boatGeometry } from "./canal";
import { RIDES, rideModel, rideSpecs } from "./rides";

type Tab = "set" | "land" | "veh";
type Mode = "full" | "plain" | "wire";
interface Entry {
  tab: Tab; group: string; name: string; blurb: string;
  /** A set piece, placed where the game places it. */
  sp?: SetPiece;
  /** A landmark from the pack: its kind, and the square it stands in. */
  lm?: { kind: string; square: [number, number] };
  /** A vehicle: the colours it comes in (for each make, if it has makes), and how to build it. */
  paints?: (make: number) => string[];
  makes?: string[];
  build?: (paint: string, k: number, make: number) => THREE.Object3D;
}

// ---- what's on the list -------------------------------------------------------------------------

const SET_BLURB: Record<string, string> = {
  "Bath Abbey": "The Abbey church in the middle of town, with the ladders of angels up its west front.",
  "Pulteney Bridge": "Robert Adam's bridge over the Avon, with the shops the map names along both sides of the street it carries.",
  "Roman Baths": "The Great Bath, down at the Roman level, the ground lowered round it, with the Pump Room.",
  "Great Pulteney Street": "From Laura Place to Sydney Place, its terraces rebuilt from the buildings the map has along it.",
  "Argyle Street": "The shopping street from the end of Pulteney Bridge to Laura Place.",
  "Grand Parade": "The colonnade along the river by Pulteney Bridge.",
  "Empire Hotel": "On Grand Parade, looking over the river.",
  "Sham Castle": "Ralph Allen's folly on Bathampton Down: a castle front with nothing behind it, looking west over Bath.",
  "Holburne Museum": "At the far end of Great Pulteney Street, looking back down it.",
  "Prior Park": "Ralph Allen's mansion, its portico looking down the valley to Bath.",
  "Prior Park's wings": "The wings either side of Prior Park, and the links to them.",
  "Kingswood School": "On Lansdown: the tower over the entrance, and the chapel.",
  "Grenville's monument": "Out on Lansdown where Sir Bevil Grenville fell in 1643: a stone pedestal on steps, with the Grenvilles' griffin on top.",
  "The Bell Inn": "The pub on Walcot Street, made by hand inside and out: the bar, the games room, the garden and the Back Bar.",
};

const carPaints = (make: number) => (make === LAND_ROVER ? LR_PAINT : make === GOLF ? GOLF_PAINT : CAR_PAINT);
const vehicle = (kind: VKind, paint: string, label = "") => {
  // a vehicle that's going nowhere needs no map or ground
  const v = new Vehicle(0, kind, paint, null as never, () => 0, label);
  return v.root;
};
const vertexMesh = (g: THREE.BufferGeometry, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, ...extra }));
let trains: THREE.BufferGeometry[] | null = null;
const trainCar = (k: number) => vertexMesh((trains ??= trainModels())[k]);
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const DRIVE: VKind[] = ["bus", "minibus", "school", "xr3i", "robin", "nova", "metro", "sierra", "police", "transit", "icecream", "milkfloat", "c5", "roller"];
const ENTRIES: Entry[] = [
  ...SET_PIECES.map((sp): Entry => ({ tab: "set", group: "Set pieces", name: sp.name, blurb: SET_BLURB[sp.name] ?? "", sp })),
  // the pack's own landmarks (tools/landmarks/bath.py), by the square each stands in; Prior Park's
  // porticos are left out, as Prior Park's set piece hides them
  { tab: "land", group: "Landmarks", name: "Holy Trinity's spire", blurb: "Combe Down's church spire, over the rooftops of the village.", lm: { kind: "spire", square: [1, 0] } },
  { tab: "land", group: "Landmarks", name: "The Palladian Bridge", blurb: "The covered bridge over the lake below Prior Park.", lm: { kind: "bridge", square: [1, 1] } },
  { tab: "land", group: "Landmarks", name: "Twerton Park", blurb: "Bath City's ground on the High Street in Twerton, its stands built round the pitch.", lm: { kind: "twerton", square: [-2, 3] } },
  { tab: "land", group: "Landmarks", name: "Eric's oak", blurb: "On Bathampton Down, planted in memory of Eric Benjamin Holmes, with the plaque on a post at its foot. In the game it has grown into a mighty oak.", lm: { kind: "oak", square: [2, 3] } },
  ...DRIVE.map((k): Entry => ({ tab: "veh", group: "You can drive", name: SPECS[k].name, blurb: "Get in with E.", paints: () => SPECS[k].paint, build: (p) => vehicle(k, p) })),
  { tab: "veh", group: "Everyday cars", name: "Everyday car", blurb: "Parked all over Bath and running in the traffic. Every one of them can be driven off.", makes: MAKES, paints: carPaints,
    build: (p, _k, make) => vehicle("car", p, MAKES[make]) },
  { tab: "veh", group: "Trains", name: "InterCity 125 power car", blurb: "On the main line through Bath Spa and Oldfield Park.", build: () => trainCar(0) },
  { tab: "veh", group: "Trains", name: "InterCity 125 coach", blurb: "A Mk3 coach: five of them between the power cars.", build: () => trainCar(1) },
  { tab: "veh", group: "Trains", name: "Sprinter", blurb: "Two of these down the Limpley Stoke valley line, stopping everywhere.", build: () => trainCar(2) },
  { tab: "veh", group: "Cable car", name: "Cable car cabin", blurb: "From Mulberry Park over Lyncombe Vale and Beechen Cliff to the river. Shown here with its doors open.",
    build: () => {
      const g = new THREE.Group(), geo = cabinModel();
      g.add(vertexMesh(geo.body), vertexMesh(geo.glass, { transparent: true, opacity: 0.28, depthWrite: false }));
      return g;
    } },
  { tab: "veh", group: "On the canal", name: "Narrowboat", blurb: "Chugging along the Kennet and Avon, through the locks.", paints: () => Array.from({ length: BOAT_PAINTS }, (_, k) => `Livery ${k + 1}`),
    build: (_p, k) => vertexMesh(boatGeometry(k)) },
  ...RIDES.map((k): Entry => ({ tab: "veh", group: "Rides", name: capital(rideSpecs[k].name.replace(/^an? /, "")), blurb: "Picked up off the street, and ridden with X.", build: () => rideModel(k) })),
];

// ---- the stage ----------------------------------------------------------------------------------

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>("view"), list = $("list"), bar = $("bar");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.shadowMap.enabled = true;
const scene = new THREE.Scene();
scene.background = new THREE.Color("#2a3038");
scene.add(new THREE.HemisphereLight("#fff8ec", "#58606a", 2.2));
const sun = new THREE.DirectionalLight("#ffffff", 1.8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
scene.add(sun, sun.target);
const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 1000);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.autoRotateSpeed = 1.2;
controls.addEventListener("start", () => { if (spin) { spin = false; drawBar(); } });
controls.addEventListener("change", () => { camMoved = true; });

/** Everything on the stage: the model, and round a set piece or landmark, where it stands. */
const site = new THREE.Group();
scene.add(site);
let model: THREE.Object3D | null = null;
const extras = { ground: new THREE.Group(), outline: new THREE.Group(), hides: new THREE.Group() };
site.add(extras.ground, extras.outline, extras.hides);
/** Where it stands, for the link into the game: its origin in data metres and above sea level. */
let origin: { x: number; y: number; z: number } | null = null;

let current = 0, tab: Tab = "set", mode: Mode = "full", paint = 0, make = 0;
let showGround = true, showOutline = false, showHides = false, spin = true, camMoved = false;
/** Bumped by every show(), so a square that turns up late is dropped. */
let token = 0;

// ---- the map, for the set pieces and landmarks ---------------------------------------------------

const MAPS = `${import.meta.env.BASE_URL}maps/`, MAP = "combe-down";
let core: Promise<{ centre: [number, number]; index: TileIndex }> | null = null;
function loadCore(): Promise<{ centre: [number, number]; index: TileIndex }> {
  return (core ??= Promise.all([fetch(`${MAPS}${MAP}.json`).then((r) => r.json()), fetch(`${MAPS}${MAP}/tiles.json`).then((r) => r.json())])
    .then(([d, index]) => ({ centre: d.centre, index })));
}
interface Square { d: MapData; before: MapData["bl"] }
const squares = new Map<string, Promise<Square | null>>();
/** A square of Bath as the game has it: the set pieces have hidden what's under them (and its
 *  buildings from before that are kept, to show what they hid). */
function loadSquare(ti: number, tj: number): Promise<Square | null> {
  const k = `${ti}_${tj}`;
  let p = squares.get(k);
  if (!p) squares.set(k, (p = fetch(`${MAPS}${MAP}/${k}.json`).then((r) => (r.ok ? r.json() : null)).then((d: MapData | null) => {
    if (!d) return null;
    const before = d.bl.slice();
    maskSetPieces(d);
    clearCourt(d);
    return { d, before };
  }).catch(() => null)));
  return p;
}

/** The ground's height at data x, y, above sea level, from whichever of these squares it's in. */
function groundIn(list: Square[], x: number, y: number): number | null {
  for (const { d } of list) {
    const [bx0, by0, bx1, by1] = d.b;
    if (x < bx0 || x > bx1 || y < by0 || y > by1) continue;
    const T = d.t;
    const fi = Math.min(T.nx - 1.001, Math.max(0, (x - T.x0) / T.dx)), fj = Math.min(T.ny - 1.001, Math.max(0, (y - T.y0) / T.dy));
    const i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j, h = (a: number, b: number) => T.h[b * T.nx + a] / 10 + T.z0;
    return (h(i, j) * (1 - u) + h(i + 1, j) * u) * (1 - v) + (h(i, j + 1) * (1 - u) + h(i + 1, j + 1) * u) * v;
  }
  return null;
}
let near: Square[] = [];

/** Find a set piece or landmark in its square and stand it on the stage, with what's round it. */
async function place(e: Entry, my: number) {
  const { centre, index } = await loadCore();
  const S = index.cells * index.dx;
  let ox: number, oy: number, rings: number[][][] = [], square: [number, number];
  if (e.sp) {
    const [lon0, lat0] = centre, sp = e.sp;
    ox = (sp.at[0] - lon0) * 111320 * Math.cos((lat0 * Math.PI) / 180); oy = (sp.at[1] - lat0) * 110574;
    const a = ((90 - sp.bearing) * Math.PI) / 180, ux = Math.cos(a), uy = Math.sin(a);
    rings = [sp.outline, ...sp.more ?? []].map((o) => o.map(([lx, lz]) => [ox + ux * lx + uy * lz, oy + uy * lx - ux * lz]));
    square = [Math.floor((ox - index.x0) / S), Math.floor((oy - index.y0) / S)];
  } else { square = e.lm!.square; ox = oy = 0; }
  const own = await loadSquare(...square);
  if (my !== token) return;
  const kind = e.sp?.kind ?? e.lm!.kind;
  const entry = own?.d.lm?.find((l) => l[0] === kind && (!e.sp || (+l[5] === 1 && Math.abs(+l[1] - ox) < 0.05 && Math.abs(+l[2] - oy) < 0.05)));
  if (!entry) { $("blurb").textContent = `Couldn't find it in square ${square.join(", ")} of the map.`; return; }
  const [, x, y, z, ang] = entry.map(Number);
  const obj = landmarkModel(kind, entry.slice(5));
  if (!obj) return;
  obj.rotation.y = ang;
  origin = { x, y, z };
  setModel(obj);
  // what's round it: the squares its model and outline reach into, and a margin
  site.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj), M = 40;
  let x0 = x + box.min.x - M, x1 = x + box.max.x + M, y0 = y - box.max.z - M, y1 = y - box.min.z + M;
  for (const q of rings.flat()) { x0 = Math.min(x0, q[0] - M); x1 = Math.max(x1, q[0] + M); y0 = Math.min(y0, q[1] - M); y1 = Math.max(y1, q[1] + M); }
  const keys: [number, number][] = [];
  for (let ti = Math.floor((x0 - index.x0) / S); ti <= Math.floor((x1 - index.x0) / S); ti++)
    for (let tj = Math.floor((y0 - index.y0) / S); tj <= Math.floor((y1 - index.y0) / S); tj++)
      if (index.tiles.some(([a, b]) => a === ti && b === tj)) keys.push([ti, tj]);
  const got = (await Promise.all(keys.map(([a, b]) => loadSquare(a, b)))).filter((s): s is Square => !!s);
  if (my !== token) return;
  near = got;
  surroundings(got, { x0, x1, y0, y1 }, rings);
  frame(true);
  $("blurb").textContent = e.blurb;
  drawBar();
}

const STONE = new THREE.MeshLambertMaterial({ color: "#c9bea4" });
const HIDDEN = new THREE.MeshLambertMaterial({ color: "#e0483a", transparent: true, opacity: 0.35, depthWrite: false });
const GRASS = new THREE.MeshLambertMaterial({ color: "#6f7d52" });
const ROAD = new THREE.MeshLambertMaterial({ color: "#3b3e43", polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
const PAVING = new THREE.MeshLambertMaterial({ color: "#8d8a83", polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
const WATER = new THREE.MeshLambertMaterial({ color: "#4b6f86", transparent: true, opacity: 0.85 });
const OUTLINE = new THREE.LineBasicMaterial({ color: "#ffd23a", depthTest: false });

/** The ground, streets, water and other buildings round it, plainly; its outline; and the
 *  buildings it hides. Data x, y go to the stage as x - ox, -(y - oy), heights less its own. */
function surroundings(list: Square[], r: { x0: number; x1: number; y0: number; y1: number }, rings: number[][][]) {
  const { x: ox, y: oy, z: oz } = origin!;
  const inBox = (x: number, y: number) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
  const add = (into: THREE.Group, geos: THREE.BufferGeometry[], m: THREE.Material, shadows = true) => {
    if (!geos.length) return;
    const g = mergeGeometries(geos.map((q) => (q.index ? q.toNonIndexed() : q)).map((q) => { for (const k of Object.keys(q.attributes)) if (k !== "position" && k !== "normal") q.deleteAttribute(k); return q; }));
    const mesh = new THREE.Mesh(g, m);
    mesh.receiveShadow = true; mesh.castShadow = shadows;
    into.add(mesh);
  };
  const terrain: THREE.BufferGeometry[] = [], roads: THREE.BufferGeometry[] = [], paving: THREE.BufferGeometry[] = [];
  const blocks: THREE.BufferGeometry[] = [], hidden: THREE.BufferGeometry[] = [], water: THREE.BufferGeometry[] = [];
  // a footprint that won't triangulate (it crosses itself) is left out
  const extrude = (b: MapData["bl"][number]) => {
    try { return extrudeOf(b); } catch { return null; }
  };
  const extrudeOf = (b: MapData["bl"][number]) => {
    const shape = new THREE.Shape(b.r[0].map((q) => new THREE.Vector2(q[0] - ox, q[1] - oy)));
    for (const h of b.r.slice(1)) shape.holes.push(new THREE.Path(h.map((q) => new THREE.Vector2(q[0] - ox, q[1] - oy))));
    return new THREE.ExtrudeGeometry(shape, { depth: b.h, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, b.g - oz, 0);
  };
  const middle = (b: MapData["bl"][number]) => b.r[0].reduce((a, q) => [a[0] + q[0] / b.r[0].length, a[1] + q[1] / b.r[0].length], [0, 0]);
  const seenPonds = new Set<string>();
  for (const { d, before } of list) {
    // the ground
    const T = d.t;
    const i0 = Math.max(0, Math.floor((r.x0 - T.x0) / T.dx)), i1 = Math.min(T.nx - 1, Math.ceil((r.x1 - T.x0) / T.dx));
    const j0 = Math.max(0, Math.floor((r.y0 - T.y0) / T.dy)), j1 = Math.min(T.ny - 1, Math.ceil((r.y1 - T.y0) / T.dy));
    if (i1 > i0 && j1 > j0) {
      const w = i1 - i0 + 1, pos: number[] = [], idx: number[] = [];
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) pos.push(T.x0 + i * T.dx - ox, T.h[j * T.nx + i] / 10 + T.z0 - oz, -(T.y0 + j * T.dy - oy));
      for (let j = 0; j < j1 - j0; j++) for (let i = 0; i < i1 - i0; i++) {
        const k = j * w + i;
        idx.push(k, k + 1, k + w, k + 1, k + w + 1, k + w);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      terrain.push(g);
    }
    // the streets and paths, as flat ribbons along them (pavements under the kerbed ones)
    for (const rd of d.rd) {
      const half = roadHalf(rd.c, rd.w), pave = KERBED.has(rd.c) ? Math.max(...(rd.pv ?? [PAVE]), PAVE) : 0;
      for (let s = 0; s < rd.p.length - 1; s++) {
        const a = rd.p[s], b = rd.p[s + 1];
        if (!inBox(a[0], a[1]) && !inBox(b[0], b[1])) continue;
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len;
        const strip = (h: number, lift: number) => {
          const P = (q: number[], o: number) => [q[0] + nx * o - ox, q[2] + lift - oz, -(q[1] + ny * o - oy)];
          const g = new THREE.BufferGeometry();
          g.setAttribute("position", new THREE.Float32BufferAttribute([...P(a, h), ...P(a, -h), ...P(b, h), ...P(a, -h), ...P(b, -h), ...P(b, h)], 3));
          g.computeVertexNormals();
          return g;
        };
        roads.push(strip(half, 0.12));
        if (pave) paving.push(strip(half + pave, 0.08));
      }
    }
    // the other buildings, as blocks; and those a set piece hid, in red
    const kept = new Set(d.bl);
    for (const b of before) {
      const [mx, my] = middle(b);
      if (!inBox(mx, my)) continue;
      const into = kept.has(b) ? blocks : rings.some((ring) => inRing(ring, mx, my)) ? hidden : null;
      const g = into && extrude(b);
      if (g) into!.push(g);
    }
    // the river and the ponds (the canal is drawn by canal.ts in the game, and left out here)
    for (const w of d.wp) {
      if (w.c === "canal" || !w.r[0].some((q) => inBox(q[0], q[1]))) continue;
      const key = `${w.z}|${w.r[0][0]}`;
      if (seenPonds.has(key)) continue;
      seenPonds.add(key);
      const shape = new THREE.Shape(w.r[0].map((q) => new THREE.Vector2(q[0] - ox, q[1] - oy)));
      for (const h of w.r.slice(1)) shape.holes.push(new THREE.Path(h.map((q) => new THREE.Vector2(q[0] - ox, q[1] - oy))));
      try { water.push(new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2).translate(0, w.z - oz, 0)); } catch { /* left out */ }
    }
  }
  add(extras.ground, terrain, GRASS, false);
  add(extras.ground, paving, PAVING, false);
  add(extras.ground, roads, ROAD, false);
  add(extras.ground, water, WATER, false);
  add(extras.ground, blocks, STONE);
  add(extras.hides, hidden, HIDDEN, false);
  // the outline, laid on the ground every metre or so
  for (const ring of rings) {
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= ring.length; k++) {
      const a = ring[k % ring.length], b = ring[(k + 1) % ring.length], n = k === ring.length ? 1 : Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])));
      for (let s = 0; s < n; s++) {
        const x = a[0] + ((b[0] - a[0]) * s) / n, y = a[1] + ((b[1] - a[1]) * s) / n;
        pts.push(new THREE.Vector3(x - ox, (groundIn(list, x, y) ?? oz) + 0.3 - oz, -(y - oy)));
        if (k === ring.length) break;
      }
    }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), OUTLINE);
    line.renderOrder = 10;
    extras.outline.add(line);
  }
  shows();
}

// ---- the model, and how it's drawn ---------------------------------------------------------------

/** Each mesh's own materials, kept while it's drawn some other way. */
const own = new WeakMap<THREE.Mesh, THREE.Material | THREE.Material[]>();
const derived = new Map<string, THREE.Material>();
function drawnAs(m: THREE.Material, how: Mode): THREE.Material {
  if (how === "full") return m;
  const k = `${m.uuid}|${how}`;
  let out = derived.get(k);
  if (!out) {
    const src = m as THREE.MeshLambertMaterial;
    if (how === "plain") {
      const c = src.clone();
      c.onBeforeCompile = src.onBeforeCompile;
      for (const t of ["map", "emissiveMap", "bumpMap", "normalMap", "lightMap", "specularMap"] as const) if (t in c) (c as unknown as Record<string, unknown>)[t] = null;
      out = c;
    } else {
      out = new THREE.MeshBasicMaterial({ color: src.color ?? "#ffffff", vertexColors: src.vertexColors, wireframe: true, transparent: src.transparent, opacity: Math.max(0.5, src.opacity ?? 1) });
    }
    derived.set(k, out);
  }
  return out;
}
function applyMode() {
  model?.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (!own.has(mesh)) own.set(mesh, mesh.material);
    const m = own.get(mesh)!;
    mesh.material = Array.isArray(m) ? m.map((q) => drawnAs(q, mode)) : drawnAs(m, mode);
    mesh.castShadow = mode !== "wire";
  });
  scene.background = new THREE.Color(mode === "wire" ? "#101317" : "#2a3038");
}

function setModel(obj: THREE.Object3D) {
  if (model) site.remove(model);
  model = obj;
  obj.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
  site.add(obj);
  applyMode();
}

function clearStage() {
  if (model) site.remove(model);
  model = null; origin = null; near = [];
  for (const g of Object.values(extras)) {
    g.traverse((o) => { (o as THREE.Mesh).geometry?.dispose(); });
    g.clear();
  }
  disc.visible = false;
}

// a turntable for the vehicles
const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 64).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: "#59606a" }));
disc.receiveShadow = true;
scene.add(disc);

/** Point the camera at it, and fit the sun's shadows round it. reframe: move the camera too. */
let pendingView: number[] | null = null;
function frame(reframe: boolean) {
  if (!model) return;
  const box = new THREE.Box3().setFromObject(model), mid = box.getCenter(new THREE.Vector3()), r = Math.max(0.5, box.getSize(new THREE.Vector3()).length() / 2);
  camera.near = r / 200; camera.far = r * 60;
  camera.updateProjectionMatrix();
  controls.minDistance = r * 0.05; controls.maxDistance = r * 10;
  const R = r + (origin ? 40 : r * 0.6);
  Object.assign(sun.shadow.camera, { left: -R, right: R, top: R, bottom: -R, near: 0.1, far: R * 6 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0002 * Math.max(1, r / 10);
  sun.position.copy(mid).add(new THREE.Vector3(0.45, 1, 0.6).normalize().multiplyScalar(R * 3));
  sun.target.position.copy(mid);
  if (pendingView) {
    const v = pendingView; pendingView = null;
    camera.position.set(v[0], v[1], v[2]); controls.target.set(v[3], v[4], v[5]);
  } else if (reframe) {
    controls.target.copy(mid);
    camera.position.copy(mid).add(new THREE.Vector3(0.75, 0.45, 1).normalize().multiplyScalar(r * 2.4));
  }
  controls.update();
}

/** Show entry i: build it (or, for the map's, go and find it), drawn as chosen. keep: keep its
 *  paint and make, and where the camera is. */
function show(i: number, keep = false) {
  current = (i + ENTRIES.length) % ENTRIES.length;
  const e = ENTRIES[current], my = ++token;
  if (!keep) { paint = 0; make = 0; }
  setTab(e.tab);
  $("name").textContent = e.name;
  $("blurb").textContent = e.build ? e.blurb : "Loading the squares of Bath round it…";
  list.querySelectorAll<HTMLButtonElement>("button[data-i]").forEach((b) => b.classList.toggle("on", +b.dataset.i! === current));
  clearStage();
  arReady = null;
  if (e.build) {
    const paints = e.paints?.(make) ?? [];
    paint = Math.min(paint, Math.max(0, paints.length - 1));
    const obj = e.build(paints[paint] ?? "#ffffff", paint, make);
    // stood on the turntable
    const holder = new THREE.Group();
    holder.add(obj);
    holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(holder);
    obj.position.y -= box.min.y;
    const size = box.getSize(new THREE.Vector3());
    disc.scale.setScalar(Math.max(size.x, size.z) * 0.75 + 0.3);
    disc.visible = mode !== "wire";
    setModel(holder);
    frame(!keep || !camera.position.lengthSq());
  } else void place(e, my);
  drawBar();
  writeUrl();
}

/** Switch the stage's extras on and off to match the buttons. */
function shows() {
  extras.ground.visible = showGround;
  extras.outline.visible = showOutline;
  extras.hides.visible = showHides;
  if (!ENTRIES[current].build) disc.visible = false;
  else disc.visible = mode !== "wire";
}

// ---- AR: a USDZ for Quick Look ------------------------------------------------------------------

/** The model as AR Quick Look can take it: plain meshes with their transforms baked in, each in one
 *  standard material, a vertex-coloured mesh split up by its colours (Quick Look ignores vertex
 *  colours), and instanced ones written out one by one. Stood on the floor, scaled by s. */
function forAR(src: THREE.Object3D, s: number): THREE.Group {
  src.updateMatrixWorld(true);
  const parts = new THREE.Group(), mats = new Map<string, THREE.MeshStandardMaterial>(), M = new THREE.Matrix4(), I = new THREE.Matrix4();
  const material = (m: THREE.MeshLambertMaterial, tint: THREE.Color | null) => {
    const c = (m.color ?? new THREE.Color(1, 1, 1)).clone();
    if (tint) c.multiply(tint);
    const k = `${m.uuid}|${c.getHexString()}`;
    let out = mats.get(k);
    if (!out) mats.set(k, (out = new THREE.MeshStandardMaterial({ color: c, map: m.map ?? null, transparent: m.transparent, opacity: m.opacity ?? 1, roughness: 0.85, metalness: 0 })));
    return out;
  };
  /** The triangles listed, out of a non-indexed geometry: positions, normals and texture places. */
  const pick = (g: THREE.BufferGeometry, tris: number[]) => {
    const out = new THREE.BufferGeometry();
    for (const name of ["position", "normal", "uv"]) {
      const a = g.getAttribute(name) as THREE.BufferAttribute | undefined;
      if (!a) continue;
      const arr = new Float32Array(tris.length * 3 * a.itemSize);
      let n = 0;
      for (const t of tris) for (let v = t * 3; v < t * 3 + 3; v++) for (let c = 0; c < a.itemSize; c++) arr[n++] = a.getComponent(v, c);
      out.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize));
    }
    if (!out.getAttribute("normal")) out.computeVertexNormals();
    return out;
  };
  src.traverseVisible((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const inst = (mesh as THREE.InstancedMesh).isInstancedMesh ? (mesh as THREE.InstancedMesh) : null;
    const list = own.get(mesh) ?? mesh.material, mlist = Array.isArray(list) ? list : [list];
    const base = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
    const groups = base.groups.length ? base.groups : [{ start: 0, count: base.getAttribute("position").count, materialIndex: 0 }];
    const col = base.getAttribute("color") as THREE.BufferAttribute | undefined;
    for (let n = 0; n < (inst ? Math.min(inst.count, 3000) : 1); n++) {
      M.copy(mesh.matrixWorld);
      if (inst) { inst.getMatrixAt(n, I); M.multiply(I); }
      const tint = inst?.instanceColor ? new THREE.Color().fromBufferAttribute(inst.instanceColor, n) : null;
      for (const gr of groups) {
        const m = mlist[gr.materialIndex ?? 0] as THREE.MeshLambertMaterial;
        if (!m || m.visible === false) continue;
        const first = Math.floor(gr.start / 3), last = Math.floor(Math.min(gr.start + gr.count, base.getAttribute("position").count) / 3);
        const buckets = new Map<string, { c: THREE.Color | null; tris: number[] }>();
        for (let t = first; t < last; t++) {
          let c: THREE.Color | null = null, key = "";
          if (col && m.vertexColors) {
            c = new THREE.Color(col.getX(t * 3), col.getY(t * 3), col.getZ(t * 3));
            key = [c.r, c.g, c.b].map((v) => Math.round(v * 48)).join(",");
          }
          let b = buckets.get(key);
          if (!b) buckets.set(key, (b = { c, tris: [] }));
          b.tris.push(t);
        }
        for (const { c, tris } of buckets.values()) {
          const g = pick(base, tris).applyMatrix4(M);
          const t2 = c && tint ? c.clone().multiply(tint) : c ?? tint;
          parts.add(new THREE.Mesh(g, material(m, t2)));
        }
      }
    }
  });
  const box = new THREE.Box3().setFromObject(parts), mid = box.getCenter(new THREE.Vector3());
  parts.position.set(-mid.x, -box.min.y, -mid.z);
  const out = new THREE.Group();
  out.add(parts);
  out.scale.setScalar(s);
  return out;
}

let arSize: "table" | "life" = "table";
let arReady: { url: string; key: string } | null = null;
const quickLook = (() => { try { return document.createElement("a").relList.supports("ar"); } catch { return false; } })();

async function makeAR(): Promise<void> {
  if (!model) return;
  const key = `${current}|${paint}|${make}|${arSize}`, my = token;
  const box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3());
  // on the table, the biggest thing is a metre across; life size is life size
  const s = arSize === "life" ? 1 : Math.min(1, 1 / Math.max(size.x, size.z, 0.01));
  const usdz = await new USDZExporter().parseAsync(forAR(model, s), { quickLookCompatible: true, maxTextureSize: 1024 });
  if (my !== token) return;
  if (arReady) URL.revokeObjectURL(arReady.url);
  arReady = { url: URL.createObjectURL(new Blob([usdz as BlobPart], { type: "model/vnd.usdz+zip" })), key };
  drawBar();
}

// ---- the bar of buttons ------------------------------------------------------------------------

function button(text: string, on: boolean, click: (ev: MouseEvent) => void, cls = "") {
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

const MODES: [Mode, string][] = [["full", "Full"], ["plain", "No textures"], ["wire", "Wireframe"]];
function drawBar() {
  const e = ENTRIES[current];
  bar.innerHTML = "";
  urlDue = 1;
  bar.append(button("‹", false, () => step(-1)), button("›", false, () => step(1)),
    button(spin ? "Turning" : "Turn", spin, () => { spin = !spin; drawBar(); }),
    button("Copy link", false, (ev) => {
      writeUrl();
      const t = ev.currentTarget as HTMLButtonElement;
      navigator.clipboard?.writeText(location.href).then(() => { t.textContent = "Copied"; }, () => { t.textContent = "Copy from the address bar"; });
    }));
  bar.append(group("", ...MODES.map(([m, t]) => button(t, m === mode, () => { mode = m; applyMode(); shows(); drawBar(); }))));
  if (!e.build) {
    bar.append(group("", button("Round about", showGround, () => { showGround = !showGround; shows(); drawBar(); })));
    if (e.sp) bar.append(group("", button("Outline", showOutline, () => { showOutline = !showOutline; shows(); drawBar(); }),
      button("What it hides", showHides, () => { showHides = !showHides; shows(); drawBar(); })));
    if (origin) {
      const a = document.createElement("a");
      a.textContent = "Go there in the game";
      a.href = gameLink();
      a.addEventListener("pointerenter", () => { a.href = gameLink(); });
      a.addEventListener("focus", () => { a.href = gameLink(); });
      bar.append(a);
    }
  }
  if (e.makes) bar.append(group("Make", select(e.makes.map((n, k): [string, string] => [String(k), n]), String(make), (v) => { make = +v; paint = 0; show(current, true); })));
  const paints = e.paints?.(make) ?? [];
  if (paints.length > 1) {
    bar.append(group(e.paints && paints[0].startsWith("#") ? "Paint" : "Livery", ...paints.map((c, k) => {
      if (!c.startsWith("#")) return button(String(k + 1), k === paint, () => { paint = k; show(current, true); });
      const b = button("", k === paint, () => { paint = k; show(current, true); }, "swatch");
      b.style.background = c; b.title = c;
      return b;
    })));
  }
  // AR: make the model, then a link Quick Look opens (or a file to save, elsewhere)
  const key = `${current}|${paint}|${make}|${arSize}`;
  const sizes = group("AR", select([["table", "On the table"], ["life", "Life size"]], arSize, (v) => { arSize = v as typeof arSize; arReady = null; drawBar(); }));
  if (arReady?.key === key) {
    const a = document.createElement("a");
    a.className = "ar";
    a.href = arReady.url + (quickLook ? "#allowsContentScaling=1" : "");
    if (quickLook) { a.rel = "ar"; const img = document.createElement("img"); img.alt = ""; a.append(img); a.append(document.createTextNode("View in AR")); }
    else { a.download = `${e.name.replace(/[^A-Za-z0-9]+/g, "-")}.usdz`; a.textContent = "Save the AR model (.usdz)"; }
    sizes.append(a);
  } else if (model) {
    sizes.append(button(quickLook ? "Make AR model" : "Make AR model (.usdz)", false, (ev) => {
      const t = ev.currentTarget as HTMLButtonElement;
      t.textContent = "Making it…"; t.disabled = true;
      makeAR().catch((err) => { console.warn("couldn't make the AR model:", err); t.textContent = "Couldn't make it"; });
    }));
  }
  bar.append(sizes);
}

/** A link into the game, standing (or, from the air, the menu looking) from where the camera is. */
function gameLink(): string {
  if (!origin) return "./";
  const c = camera.position, t = controls.target, dx = t.x - c.x, dy = t.y - c.y, dz = t.z - c.z;
  const east = origin.x + c.x, north = origin.y - c.z;
  const bearing = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360, tilt = (Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI;
  const lift = Math.max(1.7, origin.z + c.y - (groundIn(near, east, north) ?? origin.z));
  return `./?at=${[east, north, bearing, tilt, lift].map((v) => v.toFixed(1)).join(",")}`;
}

/** The next or last one on the same tab, round and round. */
function step(by: number) {
  const same = ENTRIES.map((e, k) => [e, k] as const).filter(([e]) => e.tab === tab).map(([, k]) => k);
  const at = same.indexOf(current);
  show(same[(at + by + same.length) % same.length]);
}

// ---- the address -------------------------------------------------------------------------------

const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
let urlDue = 0;
function writeUrl() {
  const e = ENTRIES[current], q = new URLSearchParams();
  q.set("what", slug(e.name));
  if (mode !== "full") q.set("draw", mode);
  if (e.makes && make) q.set("make", String(make));
  if (paint) q.set("paint", String(paint));
  if (!e.build) {
    if (!showGround) q.set("round", "0");
    if (showOutline) q.set("outline", "1");
    if (showHides) q.set("hides", "1");
  }
  if (model) q.set("view", [...camera.position.toArray(), ...controls.target.toArray()].map((v) => v.toFixed(2)).join(","));
  if (!spin) q.set("turn", "0");
  try { history.replaceState(null, "", `?${q.toString().replace(/%2C/g, ",")}`); } catch { /* fine without */ }
}
function readUrl() {
  const q = new URLSearchParams(location.search);
  const what = q.get("what"), i = Math.max(0, ENTRIES.findIndex((e) => slug(e.name) === what));
  const num = (k: string) => { const v = parseInt(q.get(k) ?? ""); return Number.isFinite(v) && v >= 0 ? v : 0; };
  const d = q.get("draw");
  mode = d === "plain" || d === "wire" ? d : "full";
  const e = ENTRIES[i];
  make = e.makes ? Math.min(num("make"), e.makes.length - 1) : 0;
  paint = num("paint");
  showGround = q.get("round") !== "0";
  showOutline = q.get("outline") === "1";
  showHides = q.get("hides") === "1";
  spin = q.get("turn") !== "0";
  const v = (q.get("view") ?? "").split(",").map(Number);
  if (v.length === 6 && v.every(Number.isFinite)) pendingView = v;
  show(i, true);
}

// ---- the list down the side, under three tabs ---------------------------------------------------

const tabs = document.createElement("div");
tabs.className = "tabs";
const TAB_NAMES: Record<Tab, string> = { set: "Set pieces", land: "Landmarks", veh: "Vehicles" };
const tabButtons = (Object.keys(TAB_NAMES) as Tab[]).map((t) => {
  const b = button(TAB_NAMES[t], false, () => { if (tab !== t) show(ENTRIES.findIndex((e) => e.tab === t)); });
  b.dataset.tab = t;
  return b;
});
tabs.append(...tabButtons);
list.append(tabs);
const rows: { tab: Tab; el: HTMLElement }[] = [];
let lastGroup = "";
ENTRIES.forEach((e, k) => {
  if (e.group !== lastGroup) {
    const h = document.createElement("h2"); h.textContent = lastGroup = e.group; rows.push({ tab: e.tab, el: h });
  }
  const b = button(e.name, false, () => show(k));
  b.dataset.i = String(k);
  rows.push({ tab: e.tab, el: b });
});
list.append(...rows.map((r) => r.el));
function setTab(t: Tab) {
  tab = t;
  for (const b of tabButtons) b.classList.toggle("on", b.dataset.tab === t);
  for (const r of rows) r.el.hidden = r.tab !== t;
}

addEventListener("keydown", (ev) => {
  if ((ev.target as HTMLElement).tagName === "SELECT") return;
  if (ev.key === "ArrowDown" || ev.key === "ArrowRight") { step(1); ev.preventDefault(); }
  if (ev.key === "ArrowUp" || ev.key === "ArrowLeft") { step(-1); ev.preventDefault(); }
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
function tick(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  resize();
  controls.autoRotate = spin;
  controls.update(dt);
  // keep the address up to date, but not every frame
  if (urlDue || camMoved) { urlDue += dt; if (urlDue > 0.4) { urlDue = 0; camMoved = false; writeUrl(); } }
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

readUrl();
requestAnimationFrame(tick);
