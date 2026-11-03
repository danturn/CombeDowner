// Checks the game behaves the same on the packed map as on its JSON. No browser: the game's own
// map.ts is bundled for Node and the map is loaded twice, once from the JSON and once from the
// packs the game downloads (tools/pack_squares.mjs), each square set up as tiles.ts sets it up. Then
// on a grid over every square (with the squares round it loaded, as a player there would have them)
// it asks both the same questions: the ground's height (as stood on, as built, bare), the floor
// and what's overhead, indoors, in water, blocked, where a player is pushed out of walls to, and
// rays out in eight directions. Every answer has to be the same to the last bit.
//
//   node tools/pack_behave.mjs --map cape-town [--step 12] [--squares "0,0 1,2"] [--poke]
//
// --poke raises the first building of each packed square by 10 cm, to show the check sees it.
// It prints a digest per map and exits 1 at the first answer that differs, saying where.
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fakeBrowser, bundleGame } from "./node_game.mjs";

const here = path.dirname(new URL(import.meta.url).pathname), web = path.join(here, "..", "web");
const argv = process.argv.slice(2);
const opt = { map: "combe-down", step: "12", squares: "", poke: false, maps: path.join(web, "public", "maps"), src: path.join(web, "src") };
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) { const k = argv[i].slice(2); opt[k] = typeof opt[k] === "boolean" ? true : argv[++i]; }
const maps = opt.maps;
const reading = fakeBrowser(maps);
const entry = `
export { GameMap, loadMap, tileKey } from "./map";
export { readSquare } from "./sfpack";
export { maskSetPieces } from "./landmarks/setpieces";
export { clearCourt } from "./bonfire";
export { clearClimb } from "./theclimb";
`;
const G = await bundleGame(entry, opt.src);

const indexFile = path.join(maps, opt.map, "tiles.json");
const index = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, "utf8")) : null;
async function world(usePacks) {
  reading.packs = usePacks;
  const core = await G.loadMap(`maps/${opt.map}.json`, index ? `maps/${opt.map}-wide.json` : undefined, index ? `maps/${opt.map}/` : undefined);
  return { core, packs: usePacks, made: new Map() };
}
const A = await world(false), B = await world(true);
if (!!A.core.wide !== !!B.core.wide || !!A.core.groundKinds !== !!B.core.groundKinds) throw new Error("the wider map or the ground kinds loaded one way and not the other");

/** A square's data as tiles.ts has it once fetched and read. */
async function squareData(W, ti, tj) {
  const base = path.join(maps, opt.map, `${ti}_${tj}`);
  const f = W.packs ? `${base}.pack.gz` : `${base}.json`;
  if (!fs.existsSync(f)) return null;
  const d = await G.readSquare(new Uint8Array(fs.readFileSync(f)));
  if (W.packs && opt.poke && d.bl?.length) d.bl[0].h += 0.1;
  W.core.cable?.clear(d);
  G.maskSetPieces(d);
  G.clearCourt(d);
  G.clearClimb(W.core, d);
  return d;
}
async function loadRound(W, ti, tj) {
  for (const k of [...W.core.tiles.keys()]) W.core.dropTile(k);
  for (const k of [...W.made.keys()]) {
    const i = Math.floor(k / 1024) - 512, j = (k % 1024) - 512;
    if (Math.abs(i - ti) > 1 || Math.abs(j - tj) > 1) W.made.delete(k);
  }
  for (let i = ti - 1; i <= ti + 1; i++) for (let j = tj - 1; j <= tj + 1; j++) {
    const k = G.tileKey(i, j);
    if (!W.made.has(k)) {
      const d = await squareData(W, i, j);
      let m = null;
      if (d) {
        m = new G.GameMap(d, null, true);
        while (m.setup && !m.setup.next().done);
        m.setup = null;
        m.canal = W.core.canal;
      }
      W.made.set(k, m);
    }
    const m = W.made.get(k);
    if (m) W.core.addTile(k, m);
  }
  return W.made.get(G.tileKey(ti, tj));
}

const R = (v) => (v === null || v === undefined ? String(v) : typeof v === "number" ? (Object.is(v, -0) ? "-0" : String(v)) : typeof v === "boolean" ? String(v) : JSON.stringify(v, (k, x) => (k === "mover" ? undefined : x)));
const DIRS = Array.from({ length: 8 }, (_, k) => [Math.cos((k * Math.PI) / 4), -0.08, Math.sin((k * Math.PI) / 4)]);
/** Every question asked at one point, answered as text. */
function answers(core, x, y) {
  const z = -y, g = core.ground(x, z), out = [];
  out.push(g, core.trueGround(x, z), core.bareGround(x, z), core.floor(x, z, g + 30), core.floor(x, z, g + 1), core.overhead(x, z, g + 0.5),
    core.deck(x, z, g + 2), core.indoors(x, z), core.inWater(x, z), core.blocked(x, z, 0.4), core.detailedAt(x, z));
  out.push(core.collide({ x, z }, g + 0.1, 0.45));
  const p = { x, z };
  out.push(core.pushStatic(p, g + 0.1, 0.45), p);
  for (const [dx, dy, dz] of DIRS) out.push(core.raycast(x, g + 1.6, z, dx, dy, dz, 80));
  return out.map(R);
}

const step = +opt.step;
let squares = index ? index.tiles.map(([i, j]) => [i, j]) : [];
if (opt.squares) squares = opt.squares.trim().split(/\s+/).map((s) => s.split(",").map(Number));
squares.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
const digest = crypto.createHash("sha1");
let points = 0, questions = 0;
const t0 = Date.now();
// before any square is loaded: the map's own first area, and the wider map round it, coarser
const areas = [];
if (A.core.d.b) areas.push(["the first area", A.core.d.b, step]);
const WT = A.core.wide?.d?.t ?? A.core.wide?.t;
if (WT) areas.push(["the wider map", [WT.x0, WT.y0, WT.x0 + (WT.nx - 1) * WT.dx, WT.y0 + (WT.ny - 1) * (WT.dy ?? WT.dx)], step * 4]);
for (const [name, box, st] of areas) {
  const [x0, y0, x1, y1] = box;
  for (let y = y0 + st / 2; y < y1; y += st) for (let x = x0 + st / 2; x < x1; x += st) {
    const qa = answers(A.core, x, y), qb = answers(B.core, x, y);
    for (let k = 0; k < qa.length; k++) if (qa[k] !== qb[k]) { console.log(`DIFFERENT in ${name} at ${x.toFixed(2)},${y.toFixed(2)}, question ${k}: JSON ${qa[k]} against packed ${qb[k]}`); process.exit(1); }
    digest.update(qa.join("|")); points++; questions += qa.length;
  }
  console.log(`  ${name}: the same`);
}
for (const [ti, tj] of squares) {
  const ma = await loadRound(A, ti, tj), mb = await loadRound(B, ti, tj);
  if (!ma !== !mb) { console.log(`DIFFERENT: square ${ti},${tj} loads one way and not the other`); process.exit(1); }
  if (!ma) continue;
  const [x0, y0, x1, y1] = ma.d.b;
  for (let y = y0 + step / 2; y < y1; y += step) for (let x = x0 + step / 2; x < x1; x += step) {
    const qa = answers(A.core, x, y), qb = answers(B.core, x, y);
    for (let k = 0; k < qa.length; k++) if (qa[k] !== qb[k]) { console.log(`DIFFERENT in square ${ti},${tj} at ${x.toFixed(2)},${y.toFixed(2)}, question ${k}: JSON ${qa[k]} against packed ${qb[k]}`); process.exit(1); }
    digest.update(qa.join("|")); points++; questions += qa.length;
  }
}
console.log(`${opt.map}: the same on both: ${squares.length} squares, ${points} points, ${questions} answers, digest ${digest.digest("hex").slice(0, 16)}, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
