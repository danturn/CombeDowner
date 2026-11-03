// Packs the map's big files for the game (web/src/pack.ts has the format): every square
// (<map>/<ti>_<tj>.json), and each map's -wide.json and -ground.json, to a .pack.gz beside it. The
// JSON stays the map tools' copy; the game only downloads the packs (vite.config.ts runs this
// before every build and leaves the JSON out of web/dist).
//
// Every file it packs is read back straight away with the game's own reader, both ways the game
// can inflate it (the browser's, here Node's zlib, and pack.ts's own for older browsers), and
// compared with its JSON: the same structure, keys in the same order, lists the same length, every
// number the same double. Any difference stops it, naming the file and where in it.
// A pack is only made again when its JSON or the format has changed (.packs.json in the maps folder
// says which JSON each pack came from, and which pack.ts made it).
//
//   node tools/pack_squares.mjs [--maps web/public/maps] [--map cape-town] [--force] [--time]
//   node tools/pack_squares.mjs --export <dir> [--map cape-town]
//
// --time also reports how long each file takes to read back in the game's way, per map.
// --export writes a copy of the maps folder with every packed file read back from its pack, as
// JSON, for the map tools (check_map.py and the rest) to be run on what the game gets.
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import zlib from "zlib";
import { createRequire } from "module";
import { pathToFileURL, fileURLToPath } from "url";
import { Worker, isMainThread, parentPort, workerData } from "worker_threads";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.join(HERE, "..", "web");
const MANIFEST = ".packs.json";

/** The game's pack.ts, bundled for Node. */
export async function packCode(out = path.join(os.tmpdir(), `pack_${process.pid}.mjs`)) {
  const esbuild = createRequire(path.join(WEB, "package.json"))("esbuild");
  await esbuild.build({ entryPoints: [path.join(WEB, "src", "pack.ts")], bundle: true, platform: "node", format: "esm", outfile: out, logLevel: "error" });
  return out;
}

/** The first place two values parsed from JSON differ, or null if they're the same. */
export function firstDifference(a, b, at = "") {
  if (typeof a !== typeof b) return `${at || "(top)"}: ${typeof a} against ${typeof b}`;
  if (typeof a === "number") return Object.is(a, b) ? null : `${at}: ${a} against ${b}`;
  if (a === null || b === null || typeof a !== "object") return a === b ? null : `${at}: ${JSON.stringify(a)} against ${JSON.stringify(b)}`;
  if (Array.isArray(a) !== Array.isArray(b)) return `${at}: list against object`;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return `${at}: ${a.length} long against ${b.length}`;
    for (let i = 0; i < a.length; i++) { const d = firstDifference(a[i], b[i], `${at}[${i}]`); if (d) return d; }
    return null;
  }
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.join("\u0000") !== kb.join("\u0000")) return `${at}: keys ${ka.join(",")} against ${kb.join(",")}`;
  for (const k of ka) { const d = firstDifference(a[k], b[k], `${at}.${k}`); if (d) return d; }
  return null;
}

/** The map files to pack, as paths relative to the maps folder. */
export function packable(maps, only) {
  const out = [];
  for (const e of fs.readdirSync(maps, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (only && e.name !== only) continue;
      for (const f of fs.readdirSync(path.join(maps, e.name)).sort()) if (/^-?\d+_-?\d+\.json$/.test(f)) out.push(`${e.name}/${f}`);
    } else {
      const m = /^(.+)-(wide|ground)\.json$/.exec(e.name);
      if (m && (!only || m[1] === only)) out.push(e.name);
    }
  }
  return out.sort();
}

const sha = (b) => crypto.createHash("sha1").update(b).digest("hex");
export const packedOf = (f) => f.replace(/\.json$/, ".pack.gz");

/** Pack one file and prove it reads back the same. Returns its sizes, or throws with the difference. */
async function packOne(P, maps, rel, time) {
  const text = fs.readFileSync(path.join(maps, rel));
  const obj = JSON.parse(text.toString("utf8"));
  const raw = P.pack(obj, (b) => zlib.deflateRawSync(b, { level: 6 }).length);
  const gz = zlib.gzipSync(raw, { level: 9 });
  // as the game reads it (DecompressionStream), and as it would without one
  const own = await P.gunzip(gz);
  if (Buffer.compare(Buffer.from(P.gunzipSync(gz)), Buffer.from(own)) !== 0) throw new Error(`${rel}: pack.ts's own inflate disagrees with DecompressionStream`);
  const t0 = performance.now();
  const back = P.unpack(own);
  const ms = performance.now() - t0;
  const diff = firstDifference(back, JSON.parse(text.toString("utf8")));
  if (diff) throw new Error(`${rel}: packed copy differs at ${diff}`);
  let parseMs = 0;
  if (time) { const t1 = performance.now(); JSON.parse(text.toString("utf8")); parseMs = performance.now() - t1; }
  fs.writeFileSync(path.join(maps, packedOf(rel)), gz);
  return { rel, json: sha(text), pack: sha(gz), jsonBytes: text.length, jsonGz: time ? zlib.gzipSync(text, { level: 6 }).length : 0, rawBytes: raw.length, packBytes: gz.length, ms, parseMs };
}

if (!isMainThread && workerData?.packCode) {
  const P = await import(pathToFileURL(workerData.packCode).href);
  parentPort.on("message", async ({ rel }) => {
    try { parentPort.postMessage({ ok: await packOne(P, workerData.maps, rel, workerData.time) }); }
    catch (e) { parentPort.postMessage({ err: String(e?.message ?? e) }); }
  });
}

/** Make sure every pack in the maps folder is there and up to date. Throws on the first file that
 *  doesn't read back the same. */
export async function packMaps({ maps = path.join(WEB, "public", "maps"), only = "", force = false, time = false, log = console.log, threads = Math.max(1, Math.min(8, os.cpus().length - 2)) } = {}) {
  const mf = path.join(maps, MANIFEST);
  let manifest = {};
  try { manifest = JSON.parse(fs.readFileSync(mf, "utf8")); } catch {}
  const files = packable(maps, only);
  // packs made by another version of the format are made again
  const format = sha(fs.readFileSync(path.join(WEB, "src", "pack.ts")));
  if (manifest[""] !== format) manifest = { "": format };
  const todo = force ? files : files.filter((rel) => {
    const m = manifest[rel], p = path.join(maps, packedOf(rel));
    if (!m || !fs.existsSync(p)) return true;
    return m.json !== sha(fs.readFileSync(path.join(maps, rel))) || m.pack !== sha(fs.readFileSync(p));
  });
  const results = [];
  if (todo.length) {
    const code = await packCode();
    const pool = Array.from({ length: Math.min(threads, todo.length) }, () => new Worker(fileURLToPath(import.meta.url), { workerData: { packCode: code, maps, time } }));
    let next = 0, failed = null;
    await Promise.all(pool.map((w) => new Promise((resolve) => {
      const give = () => { if (failed || next >= todo.length) { w.terminate(); return resolve(); } w.postMessage({ rel: todo[next++] }); };
      w.on("message", (m) => {
        if (m.err) { failed ??= m.err; } else { results.push(m.ok); manifest[m.ok.rel] = { json: m.ok.json, pack: m.ok.pack }; }
        give();
      });
      w.on("error", (e) => { failed ??= String(e); w.terminate(); resolve(); });
      give();
    })));
    fs.rmSync(code, { force: true });
    for (const rel of Object.keys(manifest)) if (rel && !fs.existsSync(path.join(maps, rel))) delete manifest[rel];
    fs.writeFileSync(mf, JSON.stringify(manifest, null, 0));
    if (failed) throw new Error(`packing the map: ${failed}`);
  }
  log(`map packs: ${files.length} files, ${todo.length} packed and checked against their JSON, ${files.length - todo.length} already up to date`);
  return { files, results };
}

/** A copy of the maps folder (or one map's files) with each packed file's JSON as read from its pack. */
export async function exportMaps(maps, dest, only = "") {
  const P = await import(pathToFileURL(await packCode()).href);
  const want = (rel) => !only || rel === `${only}.json` || rel.startsWith(`${only}/`) || rel.startsWith(`${only}-`);
  let n = 0;
  const copy = async (rel) => {
    const from = path.join(maps, rel), to = path.join(dest, rel);
    if (fs.statSync(from).isDirectory()) { for (const f of fs.readdirSync(from)) await copy(path.join(rel, f)); return; }
    if (rel.endsWith(".pack.gz") || path.basename(rel) === MANIFEST || !want(rel.split(path.sep).join("/"))) return;
    fs.mkdirSync(path.dirname(to), { recursive: true });
    const packedFile = path.join(maps, packedOf(rel));
    if (rel.endsWith(".json") && fs.existsSync(packedFile)) {
      fs.writeFileSync(to, JSON.stringify(P.unpack(await P.gunzip(fs.readFileSync(packedFile)))));
      n++;
    } else fs.copyFileSync(from, to);
  };
  for (const f of fs.readdirSync(maps)) await copy(f);
  console.log(`exported ${n} files read back from their packs to ${dest}`);
}

if (isMainThread && process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2), opt = { maps: path.join(WEB, "public", "maps"), map: "", force: false, time: false, export: "" };
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith("--")) { const k = argv[i].slice(2); opt[k] = typeof opt[k] === "boolean" ? true : argv[++i]; }
  try {
    if (opt.export) { await exportMaps(path.resolve(opt.maps), path.resolve(opt.export), opt.map); process.exit(0); }
    const { results } = await packMaps({ maps: path.resolve(opt.maps), only: opt.map, force: opt.force, time: opt.time });
    if (opt.time && results.length) {
      const by = {};
      for (const r of results) {
        const m = r.rel.includes("/") ? r.rel.split("/")[0] : r.rel.replace(/\.json$/, "");
        const e = (by[m] ??= { n: 0, json: 0, jsonGz: 0, raw: 0, pack: 0, ms: 0, parse: 0, worst: 0 });
        e.n++; e.json += r.jsonBytes; e.jsonGz += r.jsonGz; e.raw += r.rawBytes; e.pack += r.packBytes; e.ms += r.ms; e.parse += r.parseMs; e.worst = Math.max(e.worst, r.ms);
      }
      const MB = (b) => (b / 1e6).toFixed(1);
      console.log("what\tfiles\tjson MB\tjson gz MB\tpacked raw MB\tpack.gz MB\tread ms/file\tworst ms\tJSON.parse ms/file");
      for (const [m, e] of Object.entries(by)) console.log([m, e.n, MB(e.json), MB(e.jsonGz), MB(e.raw), MB(e.pack), (e.ms / e.n).toFixed(1), e.worst.toFixed(1), (e.parse / e.n).toFixed(1)].join("\t"));
    }
  } catch (e) { console.error(String(e?.message ?? e)); process.exit(1); }
}
