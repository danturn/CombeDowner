// The prototype for step 5: build one square's scenery outside the browser, and say what it made.
// This is the feasibility test — one square (the busiest in town) so we can measure the size of the
// output and the win, before doing all 131.
//
// Bundled for Node first, because the game's modules import each other without file extensions:
//   (from web/) npx esbuild ../tools/bake/entry.ts --bundle --platform=node --format=esm --outfile=/tmp/bake.mjs
//   node /tmp/bake.mjs 1_1
//
// Nothing here goes over the network: it reads the square's own JSON from the repo.
import fs from "fs";
import path from "path";
import * as THREE from "three";

// ---- the least a Node run needs for the game's canvas textures to exist and do nothing ----------
class Ctx {
  canvas: unknown;
  constructor(c: unknown) { this.canvas = c; }
  createLinearGradient() { return { addColorStop() {} }; }
  createRadialGradient() { return { addColorStop() {} }; }
  createPattern() { return null; }
  getImageData(_x: number, _y: number, w: number, h: number) { return { data: new Uint8ClampedArray(Math.max(4, w * h * 4)), width: w, height: h }; }
  measureText(t: string) { return { width: String(t).length * 6 }; }
  createImageData(w: number, h: number) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; }
}
const noop = () => {};
for (const k of ["fillRect", "clearRect", "beginPath", "moveTo", "lineTo", "arc", "arcTo", "fill", "stroke",
  "save", "restore", "translate", "rotate", "scale", "clip", "closePath", "quadraticCurveTo", "bezierCurveTo",
  "ellipse", "rect", "putImageData", "drawImage", "fillText", "strokeText", "setTransform", "resetTransform",
  "roundRect", "strokeRect"]) (Ctx.prototype as unknown as Record<string, unknown>)[k] = noop;
for (const k of ["fillStyle", "strokeStyle", "lineWidth", "font", "textAlign", "textBaseline", "lineCap",
  "lineJoin", "globalCompositeOperation", "globalAlpha", "shadowBlur", "shadowColor", "filter", "miterLimit",
  "imageSmoothingEnabled"]) {
  Object.defineProperty(Ctx.prototype, k, { set() {}, get() { return ""; } });
}
class Canvas {
  width = 1; height = 1; style = {};
  getContext() { return new Ctx(this); }
  toDataURL() { return "data:,"; }
  addEventListener() {}
}
const g = globalThis as unknown as Record<string, unknown>;
g.document = {
  createElement: (tag: string) => (tag === "canvas" ? new Canvas() : { style: {}, appendChild() {}, addEventListener() {}, setAttribute() {} }),
  createElementNS: () => new Canvas(),
  getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  addEventListener() {}, body: { appendChild() {}, classList: { add() {}, remove() {} } }, documentElement: { style: {} },
  hidden: false, fonts: { load: () => Promise.resolve() },
};
g.window = globalThis; g.self = globalThis;
// (Node 24 has navigator as a getter-only global, so define it rather than assign)
Object.defineProperty(g, "navigator", { value: { maxTouchPoints: 0, userAgent: "node", hardwareConcurrency: 8 }, configurable: true, writable: true });
g.devicePixelRatio = 1;
if (!g.addEventListener) g.addEventListener = () => {};
g.HTMLCanvasElement = Canvas;
g.ImageData = class { data: Uint8ClampedArray; constructor(w: number, h: number) { this.data = new Uint8ClampedArray(w * h * 4); } };
g.OffscreenCanvas = Canvas;
g.AudioContext = class { constructor() {} };
g.speechSynthesis = { speak() {}, getVoices: () => [], cancel() {}, addEventListener() {} };
g.location = { search: "", href: "http://localhost/", pathname: "/" };
if (!g.requestAnimationFrame) g.requestAnimationFrame = (f: (t: number) => void) => setTimeout(() => f(0), 0);
Object.defineProperty(g, "localStorage", { value: { getItem: () => null, setItem() {}, removeItem() {} }, configurable: true });

// ---- bake one square ---------------------------------------------------------------------------
// the web directory, given because this is bundled somewhere else and run from anywhere
const WEB = process.env.BAKE_WEB ?? path.resolve(new URL("../../web", import.meta.url).pathname);
const square = process.argv[2] ?? "1_1";

const { GameMap } = await import("../../web/src/map");
const { tileWorld } = await import("../../web/src/world");
const { maskSetPieces } = await import("../../web/src/landmarks/setpieces");
const { clearCourt } = await import("../../web/src/bonfire");

const raw = JSON.parse(fs.readFileSync(path.join(WEB, `public/maps/combe-down/${square}.json`), "utf8"));
// the game does these to a square's file before building anything from it (tiles.ts's fetch)
maskSetPieces(raw);
clearCourt(raw);

const t0 = performance.now();
const map = new GameMap(raw, null, true);
const shared: Record<string, unknown> = {};
// a real THREE.Group: the builder puts its meshes in it and calls its own methods on the way
const group = new THREE.Group() as unknown as Parameters<typeof tileWorld>[2];

const job = tileWorld(map, shared, group);
let slices = 0;
for (;;) { const r = job.next(); slices++; if (r.done) break; }
const ms = performance.now() - t0;

let meshes = 0, verts = 0, inds = 0, bytes = 0;
const mats = new Set<string>();
const found: { isMesh?: boolean; geometry?: { attributes: Record<string, { count: number; array: ArrayLike<number> }>; index: { count: number; array: ArrayLike<number> } | null }; material?: { uuid?: string } }[] = [];
(group as unknown as { traverse(f: (o: unknown) => void): void }).traverse((o) => found.push(o as never));
for (const o of found) {
  if (!o.isMesh || !o.geometry) continue;
  meshes++;
  const geo = o.geometry;
  const pos = geo.attributes.position;
  if (!pos) continue;
  verts += pos.count;
  inds += geo.index ? geo.index.count : pos.count;
  for (const k of Object.keys(geo.attributes)) bytes += geo.attributes[k].array.byteLength;
  if (geo.index) bytes += geo.index.array.byteLength;
  mats.add((o as unknown as { material?: { type?: string; uuid?: string } }).material?.uuid ?? "?");
}
console.log(JSON.stringify({ square, ms: +ms.toFixed(1), slices, meshes, materials: mats.size, verts, inds, geometryMB: +(bytes / 1e6).toFixed(2) }));
