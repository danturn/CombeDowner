// Is the drawn ground closed: does every edge of the ground and the street, pavement and path faces
// meet another triangle, so there is no crack along it for the sky to show through? Each square's
// scenery is built as the game builds it (world.ts, bundled for Node by node_game.mjs, with the
// ground sheet on), and the edges of the ground and of the faces' tops are counted:
//
//   open    an edge of the ground or of a face's top that no other triangle of the ground, the
//           faces, their kerbs or retaining walls has (corners welded within half a millimetre);
//   tee     of those, the ones closed by a run of edges on the other side lying along it (a corner one
//           side has partway along an edge the other hasn't: no gap, but a T-junction that can
//           sparkle);
//   gap     the rest: the two sides apart, a hairline the sky shows through.
//
// Not counted: edges along the square's own sides (the next square meets them), and the sides and
// feet of kerbs, walls and the like (only edges of the ground's and the faces' tops are checked; a
// kerb or a wall still closes an edge it shares).
//
//   node tools/ground_seams.mjs [--map combe-down] [--squares "0,3 -1,2"] [--json out.json] [--most n] [--rules]
//
// --most n prints up to n gaps per square, as data x, y and a ?at= to look from. Exits 1 if any
// square has a gap, so a build can stop on it. --rules prints the gaps as tools/check_more.py's
// rule 38 findings instead (and always exits 0).
import fs from "fs";
import path from "path";
import { fakeBrowser, bundleGame } from "./node_game.mjs";

const here = path.dirname(new URL(import.meta.url).pathname), web = path.join(here, "..", "web");
const argv = process.argv.slice(2);
const opt = { map: "combe-down", squares: "", json: "", most: "0", rules: "", maps: path.join(web, "public", "maps"), src: path.join(web, "src") };
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) opt[argv[i].slice(2)] = argv[i] === "--rules" ? "1" : argv[++i];
// (with --rules the findings are the output, for tools/check_more.py rule 38, and the rest goes to stderr)
if (opt.rules) console.log = console.error;
const say = (...a) => console.log(...a);
globalThis.__keepArrays = true;
fakeBrowser(opt.maps);
const G = await bundleGame(`
export { GameMap, loadMap, tileKey } from "./map";
export { readSquare } from "./sfpack";
export { maskSetPieces } from "./landmarks/setpieces";
export { clearCourt } from "./bonfire";
export { clearClimb } from "./theclimb";
export { buildWorld } from "./world";
export { Tiles } from "./tiles";
export * as THREE from "three";
`, opt.src);
const { THREE } = G;
const quietWarn = console.warn;
console.warn = (...a) => { if (!String(a[0]).startsWith("ground sheet:")) quietWarn(...a); };

const index = JSON.parse(fs.readFileSync(path.join(opt.maps, opt.map, "tiles.json"), "utf8"));
const core = await G.loadMap(`maps/${opt.map}.json`, `maps/${opt.map}-wide.json`, `maps/${opt.map}/`);
let tiles = null;
const hold = G.Tiles.prototype.hold;
G.Tiles.prototype.hold = function (...a) { tiles = this; return hold.apply(this, a); };
const world = G.buildWorld(core);
world.hold(0, 0, 1);
if (!tiles) throw new Error("couldn't reach the squares' builder");

const WELD = 0.0005, TEE = 0.0005, SIDE = 0.01;
const TOP = new Set(["ground", "roads"]), CLOSE = new Set(["ground", "roads", "walls-fences"]);

async function square(ti, tj) {
  const f = path.join(opt.maps, opt.map, `${ti}_${tj}.json`);
  if (!fs.existsSync(f)) return null;
  const d = await G.readSquare(new Uint8Array(fs.readFileSync(f)));
  core.cable?.clear(d);
  G.maskSetPieces(d);
  G.clearCourt(d);
  G.clearClimb(core, d);
  const m = new G.GameMap(d, null, true);
  while (m.setup && !m.setup.next().done);
  m.setup = null;
  m.canal = core.canal;
  const k = G.tileKey(ti, tj);
  core.addTile(k, m);
  const group = new THREE.Group();
  const job = tiles.build(m, group);
  let r;
  do r = job.next(); while (!r.done);
  group.updateMatrixWorld(true);
  const out = { d, group, done: () => { r.value.dispose?.(); core.dropTile(k); } };
  return out;
}

function seams(d, group) {
  const T = d.t, X0 = T.x0, Y0 = T.y0, X1 = T.x0 + (T.nx - 1) * T.dx, Y1 = T.y0 + (T.ny - 1) * T.dy;
  // corners welded within WELD: each point's cell, and the cells round it, looked through
  const cells = new Map(), px = [], py = [], pz = [];
  const weld = (x, y, z) => {
    const i = Math.round(x / WELD), j = Math.round(y / WELD), k = Math.round(z / WELD);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
      const l = cells.get(`${i + a},${j + b},${k + c}`);
      if (l) for (const n of l) if (Math.abs(px[n] - x) <= WELD && Math.abs(py[n] - y) <= WELD && Math.abs(pz[n] - z) <= WELD) return n;
    }
    const n = px.length;
    px.push(x); py.push(y); pz.push(z);
    const key = `${i},${j},${k}`;
    (cells.get(key) ?? cells.set(key, []).get(key)).push(n);
    return n;
  };
  const uses = new Map(), checked = new Map(), tops = [];
  const ek = (a, b) => a < b ? `${a},${b}` : `${b},${a}`;
  const v = new THREE.Vector3();
  group.traverse((o) => {
    let top = o;
    while (top.parent && top.parent !== group) top = top.parent;
    const name = top.name || o.name;
    if (!o.geometry || o.isInstancedMesh || !CLOSE.has(name)) return;
    const g = o.geometry, P = g.attributes.position;
    if (!P?.array) return;
    const n = g.index ? g.index.count : P.count;
    const id = new Int32Array(P.count);
    for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(o.matrixWorld); id[i] = weld(v.x, -v.z, v.y); }
    const at = (k) => g.index ? g.index.array[k] : k;
    for (let k = 0; k + 2 < n; k += 3) {
      const a = id[at(k)], b = id[at(k + 1)], c = id[at(k + 2)];
      if (a === b || b === c || a === c) continue;
      // a top: a triangle of the ground or of a face's top, not a kerb, a wall or a side
      const ux = px[b] - px[a], uy = py[b] - py[a], uz = pz[b] - pz[a], wx = px[c] - px[a], wy = py[c] - py[a], wz = pz[c] - pz[a];
      const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx, len = Math.hypot(nx, ny, nz);
      const isTop = TOP.has(name) && len > 1e-12 && Math.abs(nz) > 0.05 * len;
      if (isTop) tops.push(a, b, c);
      for (const [p, q, r] of [[a, b, c], [b, c, a], [c, a, b]]) {
        const e = ek(p, q);
        uses.set(e, (uses.get(e) ?? 0) + 1);
        if (isTop) checked.set(e, [p, q, r]);
      }
    }
  });
  const onSide = (p, q) => (Math.abs(px[p] - X0) < SIDE && Math.abs(px[q] - X0) < SIDE) || (Math.abs(px[p] - X1) < SIDE && Math.abs(px[q] - X1) < SIDE)
    || (Math.abs(py[p] - Y0) < SIDE && Math.abs(py[q] - Y0) < SIDE) || (Math.abs(py[p] - Y1) < SIDE && Math.abs(py[q] - Y1) < SIDE)
    || px[p] < X0 - SIDE || px[p] > X1 + SIDE || py[p] < Y0 - SIDE || py[p] > Y1 + SIDE
    || px[q] < X0 - SIDE || px[q] > X1 + SIDE || py[q] < Y0 - SIDE || py[q] > Y1 + SIDE;
  // every edge, by the 2 m cells it passes, to find what lies along an open one
  const CELL = 2, byCell = new Map();
  const cellsOf = (p, q, f) => {
    const i0 = Math.floor(Math.min(px[p], px[q]) / CELL), i1 = Math.floor(Math.max(px[p], px[q]) / CELL);
    const j0 = Math.floor(Math.min(py[p], py[q]) / CELL), j1 = Math.floor(Math.max(py[p], py[q]) / CELL);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) f(`${i},${j}`);
  };
  const ends = [];
  for (const e of uses.keys()) {
    const [p, q] = e.split(",").map(Number), n = ends.length;
    ends.push([p, q]);
    cellsOf(p, q, (c) => (byCell.get(c) ?? byCell.set(c, []).get(c)).push(n));
  }
  // an open edge is a tee if other edges lying along its line cover the whole of it
  const along = (a, b) => {
    const ex = px[b] - px[a], ey = py[b] - py[a], ez = pz[b] - pz[a], l2 = ex * ex + ey * ey + ez * ez;
    if (l2 < 1e-12) return true;
    const L = Math.sqrt(l2);
    const tOf = (n) => ((px[n] - px[a]) * ex + (py[n] - py[a]) * ey + (pz[n] - pz[a]) * ez) / l2;
    const off = (n) => { const t = tOf(n); return Math.hypot(px[a] + ex * t - px[n], py[a] + ey * t - py[n], pz[a] + ez * t - pz[n]); };
    const lineOff = (p, q, n) => {
      const fx = px[q] - px[p], fy = py[q] - py[p], fz = pz[q] - pz[p], m2 = fx * fx + fy * fy + fz * fz || 1e-12;
      const t = ((px[n] - px[p]) * fx + (py[n] - py[p]) * fy + (pz[n] - pz[p]) * fz) / m2;
      return Math.hypot(px[p] + fx * t - px[n], py[p] + fy * t - py[n], pz[p] + fz * t - pz[n]);
    };
    const spans = [], seen = new Set();
    cellsOf(a, b, (c) => { for (const n of byCell.get(c) ?? []) {
      if (seen.has(n)) continue;
      seen.add(n);
      const [p, q] = ends[n];
      if ((p === a && q === b) || (p === b && q === a)) continue;
      // (measured from the longer of the two lines: a short edge's direction is only as good as its corners)
      if ((off(p) > TEE || off(q) > TEE) && (lineOff(p, q, a) > TEE || lineOff(p, q, b) > TEE)) continue;
      const tp = tOf(p), tq = tOf(q);
      if (Math.max(tp, tq) > 0 && Math.min(tp, tq) < 1) spans.push([Math.min(tp, tq), Math.max(tp, tq)]);
    } });
    spans.sort((u, w) => u[0] - w[0]);
    let reach = 0;
    const slack = TEE / L;
    for (const [u, w] of spans) { if (u > reach + slack) return false; reach = Math.max(reach, w); }
    return reach >= 1 - slack;
  };
  // the tops by the cells they cover, to tell an edge with more ground or a face just across it
  const topCell = new Map();
  for (let n = 0; n < tops.length; n += 3) {
    const a = tops[n], b = tops[n + 1], c = tops[n + 2];
    const i0 = Math.floor(Math.min(px[a], px[b], px[c]) / CELL), i1 = Math.floor(Math.max(px[a], px[b], px[c]) / CELL);
    const j0 = Math.floor(Math.min(py[a], py[b], py[c]) / CELL), j1 = Math.floor(Math.max(py[a], py[b], py[c]) / CELL);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) (topCell.get(`${i},${j}`) ?? topCell.set(`${i},${j}`, []).get(`${i},${j}`)).push(n);
  }
  const covered = (x, y) => {
    for (const n of topCell.get(`${Math.floor(x / CELL)},${Math.floor(y / CELL)}`) ?? []) {
      const a = tops[n], b = tops[n + 1], c = tops[n + 2];
      const d1 = (px[b] - px[a]) * (y - py[a]) - (py[b] - py[a]) * (x - px[a]);
      const d2 = (px[c] - px[b]) * (y - py[b]) - (py[c] - py[b]) * (x - px[b]);
      const d3 = (px[a] - px[c]) * (y - py[c]) - (py[a] - py[c]) * (x - px[c]);
      if ((d1 >= 0 && d2 >= 0 && d3 >= 0) || (d1 <= 0 && d2 <= 0 && d3 <= 0)) return true;
    }
    return false;
  };
  // a millimetre across the edge from its triangle, at a quarter, half and three quarters along
  const across = (p, q, r) => {
    const ex = px[q] - px[p], ey = py[q] - py[p], l = Math.hypot(ex, ey);
    if (l < 1e-9) return true;
    let nx = -ey / l, ny = ex / l;
    if (nx * (px[r] - px[p]) + ny * (py[r] - py[p]) > 0) { nx = -nx; ny = -ny; }
    return [0.25, 0.5, 0.75].every((t) => covered(px[p] + ex * t + nx * 0.001, py[p] + ey * t + ny * 0.001));
  };
  let open = 0, tee = 0, under = 0, folds = 0;
  const gaps = [];
  for (const [e, [p, q, r]] of checked) {
    const n = uses.get(e);
    if (n > 2) folds++;
    if (n !== 1 || onSide(p, q)) continue;
    open++;
    if (along(p, q)) { tee++; continue; }
    if (across(p, q, r)) { under++; continue; }
    gaps.push([(px[p] + px[q]) / 2, (py[p] + py[q]) / 2, Math.hypot(px[q] - px[p], py[q] - py[p])]);
  }
  return { open, tee, under, gap: gaps.length, folds, gaps };
}

let squares = index.tiles.map(([i, j]) => [i, j]);
if (opt.squares) squares = opt.squares.trim().split(/\s+/).map((s) => s.split(",").map(Number));
const report = {}, most = Number(opt.most) || 0, t0 = Date.now();
let total = { open: 0, tee: 0, under: 0, gap: 0, folds: 0 }, bad = 0;
const findings = [];
for (const [ti, tj] of squares) {
  const s = await square(ti, tj);
  if (!s) continue;
  const r = seams(s.d, s.group);
  s.done();
  for (const k of Object.keys(total)) total[k] += r[k];
  if (r.gap) bad++;
  for (const [x, y, l] of opt.rules ? r.gaps : []) findings.push({ rule: "38 crack in the ground", score: +l.toFixed(3), x, y, what: `the ground and a face, or two faces, apart along an edge ${l.toFixed(2)} m long: the sky shows through` });
  report[`${ti},${tj}`] = { open: r.open, tee: r.tee, under: r.under, gap: r.gap, folds: r.folds, gaps: r.gaps.slice(0, 200).map(([x, y, l]) => [+x.toFixed(2), +y.toFixed(2), +l.toFixed(3)]) };
  say(`${ti},${tj}: ${r.open} open edges, ${r.tee} tees, ${r.under} overlapped, ${r.gap} gaps, ${r.folds} edges three or more triangles share`);
  for (const [x, y] of r.gaps.slice(0, most)) say(`    gap at ${x.toFixed(2)},${y.toFixed(2)}  ?at=${x.toFixed(1)},${(y - 6).toFixed(1)},0,-35`);
}
say(`${opt.map}: ${Object.keys(report).length} squares, ${total.open} open edges, ${total.tee} tees, ${total.under} overlapped, ${total.gap} gaps (${bad} squares with gaps), ${total.folds} shared by three or more, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
if (opt.json) fs.writeFileSync(opt.json, JSON.stringify({ total, squares: report }, null, 1));
// (exit only once the findings are written: a pipe takes a large write in pieces)
if (opt.rules) process.stdout.write(JSON.stringify(findings), () => process.exit(0));
else process.exit(bad ? 1 : 0);
