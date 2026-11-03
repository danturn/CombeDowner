// Checks the game draws the same scenery from the packed map as from its JSON. No browser: the
// game's world.ts is bundled for Node and builds each square's scenery as tiles.ts has it built
// (with the main world's shared materials), once from the square's JSON and once from its pack
// (tools/pack_squares.mjs); every model it makes (each mesh's vertices, indices and instances, in
// order, with its material's name) is hashed, and the two hashes have to be the same. It also
// builds the first square twice from the JSON, to show the build doesn't vary by itself.
//
//   node tools/pack_scene.mjs --map cape-town [--squares "0,0 1,2"] [--poke]
//
// --poke raises the first building of each packed square by 10 cm, to show the check sees it.
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fakeBrowser, bundleGame } from "./node_game.mjs";

const here = path.dirname(new URL(import.meta.url).pathname), web = path.join(here, "..", "web");
const argv = process.argv.slice(2);
const opt = { map: "combe-down", squares: "", poke: false, maps: path.join(web, "public", "maps"), src: path.join(web, "src") };
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) { const k = argv[i].slice(2); opt[k] = typeof opt[k] === "boolean" ? true : argv[++i]; }
const maps = opt.maps;
globalThis.__keepArrays = true;
const reading = fakeBrowser(maps);
const entry = `
export { GameMap, loadMap, tileKey } from "./map";
export { readSquare } from "./sfpack";
export { maskSetPieces } from "./landmarks/setpieces";
export { clearCourt } from "./bonfire";
export { clearClimb } from "./theclimb";
export { buildWorld } from "./world";
export { Tiles } from "./tiles";
export * as THREE from "three";
`;
const G = await bundleGame(entry, opt.src);
const { THREE } = G;

const index = JSON.parse(fs.readFileSync(path.join(maps, opt.map, "tiles.json"), "utf8"));
const core = await G.loadMap(`maps/${opt.map}.json`, `maps/${opt.map}-wide.json`, `maps/${opt.map}/`);
// the square builder world.ts hands tiles.ts, with the main world's materials: caught through the
// first call the world makes on its Tiles
let tiles = null;
const hold = G.Tiles.prototype.hold;
G.Tiles.prototype.hold = function (...a) { tiles = this; return hold.apply(this, a); };
const world = G.buildWorld(core);
world.hold(0, 0, 1);
if (!tiles) throw new Error("couldn't reach the squares' builder");

async function squareMap(ti, tj, usePack) {
  const base = path.join(maps, opt.map, `${ti}_${tj}`);
  const f = usePack ? `${base}.pack.gz` : `${base}.json`;
  if (!fs.existsSync(f)) return null;
  const d = await G.readSquare(new Uint8Array(fs.readFileSync(f)));
  if (usePack && opt.poke && d.bl?.length) d.bl[0].h += 0.1;
  core.cable?.clear(d);
  G.maskSetPieces(d);
  G.clearCourt(d);
  G.clearClimb(core, d);
  const m = new G.GameMap(d, null, true);
  while (m.setup && !m.setup.next().done);
  m.setup = null;
  m.canal = core.canal;
  return m;
}
function sceneHash(ti, tj, m) {
  const k = G.tileKey(ti, tj);
  core.addTile(k, m);
  const group = new THREE.Group();
  const job = tiles.build(m, group);
  let r;
  do r = job.next(); while (!r.done);
  const h = crypto.createHash("sha1");
  let meshes = 0, numbers = 0;
  group.updateMatrixWorld(true);
  group.traverse((o) => {
    h.update(`${o.type}|${o.name}|${o.visible}|${o.matrix.elements.join(",")}`);
    const g = o.geometry;
    if (g) {
      meshes++;
      for (const name of Object.keys(g.attributes).sort()) {
        const a = g.attributes[name];
        h.update(`${name}:${a.itemSize}:${a.count}`);
        if (a.array) { h.update(new Uint8Array(a.array.buffer, a.array.byteOffset, a.array.byteLength)); numbers += a.array.length; }
      }
      if (g.index?.array) { h.update(new Uint8Array(g.index.array.buffer, g.index.array.byteOffset, g.index.array.byteLength)); numbers += g.index.array.length; }
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      h.update(mats.map((x) => `${x?.type}:${x?.name}`).join(","));
    }
    if (o.isInstancedMesh) { h.update(`n${o.count}`); h.update(new Uint8Array(o.instanceMatrix.array.buffer)); numbers += o.instanceMatrix.array.length; if (o.instanceColor) h.update(new Uint8Array(o.instanceColor.array.buffer)); }
  });
  r.value.dispose?.();
  core.dropTile(k);
  return { hash: h.digest("hex"), meshes, numbers };
}

let squares = index.tiles.map(([i, j]) => [i, j]);
if (opt.squares) squares = opt.squares.trim().split(/\s+/).map((s) => s.split(",").map(Number));
const t0 = Date.now();
let meshes = 0, numbers = 0, n = 0;
const all = crypto.createHash("sha1");
for (const [ti, tj] of squares) {
  const a = await squareMap(ti, tj, false);
  if (!a) continue;
  const ha = sceneHash(ti, tj, a);
  const again = n ? ha : sceneHash(ti, tj, await squareMap(ti, tj, false));
  const hb = sceneHash(ti, tj, await squareMap(ti, tj, true));
  if (again.hash !== ha.hash) { console.log(`square ${ti},${tj}: the scenery built from the same JSON twice isn't the same, so this check can't tell`); process.exit(2); }
  if (hb.hash !== ha.hash || hb.meshes !== ha.meshes) { console.log(`DIFFERENT scenery in square ${ti},${tj}: JSON ${ha.hash} (${ha.meshes} models) against packed ${hb.hash} (${hb.meshes} models)`); process.exit(1); }
  all.update(ha.hash); meshes += ha.meshes; numbers += ha.numbers; n++;
}
console.log(`${opt.map}: the same scenery from both: ${n} squares, ${meshes} models, ${numbers} numbers, digest ${all.digest("hex").slice(0, 16)}, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
process.exit(0);
