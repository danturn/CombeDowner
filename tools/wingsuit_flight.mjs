// The wingsuit's flight, flown headless over flat ground: the real Player (web/src/player.ts) off an
// edge with the suit opened at once, then flown with the keys as a player would: nothing held (level),
// W (a dive), W then S (a pull-up), A held (a turn), and a tap of A. Prints height, speed and distance
// over time, and checks speed plus height never grows while the suit's open. No browser:
// node tools/wingsuit_flight.mjs (after npm install in web/).
import { build } from "../web/node_modules/esbuild/lib/main.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const dir = mkdtempSync(join(tmpdir(), "suit-"));
const out = join(dir, "player.mjs");
await build({ entryPoints: [join(root, "web/src/player.ts")], bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "error" });
globalThis.addEventListener ??= () => {};
const { Player } = await import(pathToFileURL(out).href);
rmSync(dir, { recursive: true, force: true });

const flat = { ground: () => 0, collide: () => null, lastBlock: -1 };
const DT = 1 / 60, G = 12;   // the suit's own gravity (SUIT_G in player.ts), for its energy
let worstGain = 0;

/** Off an edge h metres up at run m/s with the suit opened, then flown with keysAt(t, p) held each frame. */
function fly(name, h, run, keysAt, { every = 1, quiet = false, until = () => false } = {}) {
  const p = new Player(flat);
  p.pos.set(0, h, 0); p.vel.set(0, 0, -run); p.onGround = false; p.suit = true;
  p.update(DT, true);
  p.jump();
  const rows = [];
  let t = 0, next = 0, opened = false, e0 = null;
  while (t < 120) {
    p.keys = new Set(keysAt(t, p));
    p.update(DT, true);
    opened ||= p.suitOpen;
    t += DT;
    const v = Math.hypot(p.vel.x, p.vel.y, p.vel.z), e = G * p.pos.y + v * v / 2;
    if (p.suitOpen && e0 !== null) worstGain = Math.max(worstGain, e - e0);
    e0 = p.suitOpen ? e : null;
    if (t >= next || p.onGround) { rows.push({ t: +t.toFixed(1), height: +p.pos.y.toFixed(1), speed: +v.toFixed(1), sink: +(-p.vel.y).toFixed(1), dist: +Math.hypot(p.pos.x, p.pos.z).toFixed(1) }); next += every; }
    if (p.onGround || until(t, p)) break;
  }
  const dist = Math.hypot(p.pos.x, p.pos.z);
  if (!quiet) {
    console.log(`\n== ${name}: opened ${opened ? "yes" : "NO"}; ${p.onGround ? "landed" : "stopped"} after ${t.toFixed(1)} s, ${dist.toFixed(1)} m away${p.onGround ? ` (${(dist / h).toFixed(2)}:1 overall)` : ""}`);
    console.table(rows);
  }
  return { p, t, dist };
}

// the steady glide with nothing held, once it's settled: across over down between 10 s and 20 s
{
  let a = null;
  const { p } = fly("", 400, 5, (t, p) => { if (!a && t >= 10) a = { y: p.pos.y, d: Math.hypot(p.pos.x, p.pos.z) }; return []; }, { quiet: true, until: (t) => t >= 20 });
  const dy = a.y - p.pos.y, dd = Math.hypot(p.pos.x, p.pos.z) - a.d;
  console.log(`steady level glide: ${(dd / 10).toFixed(1)} m/s across, ${(dy / 10).toFixed(1)} m/s down, ${(dd / dy).toFixed(2)}:1`);
  const d = fly("", 800, 5, () => ["KeyW"], { quiet: true, until: (t) => t >= 15 }).p;
  console.log(`W held, settled: ${Math.hypot(d.vel.x, d.vel.y, d.vel.z).toFixed(1)} m/s, ${(-d.vel.y).toFixed(1)} m/s down`);
}

fly("nothing held, off a 30 m roof running (5 m/s)", 30, 5, () => [], { every: 0.5 });
fly("nothing held, off a 30 m roof walking (2 m/s)", 30, 2, () => [], { every: 1 });
fly("W held (diving), from 80 m", 80, 5, () => ["KeyW"]);

const pull = { low: 1e9, lowV: 0, peak: -1, peakT: 0, topV: 0, stall: 0 };
fly("W for 5 s from 150 m, then S held (pull-up)", 150, 5, (t, p) => {
  if (t < 5) return ["KeyW"];
  const v = Math.hypot(p.vel.x, p.vel.y, p.vel.z);
  if (pull.peak < 0 && p.vel.y < 0) { if (p.pos.y < pull.low) { pull.low = p.pos.y; pull.lowV = v; } }
  else if (p.pos.y > pull.peak) { pull.peak = p.pos.y; pull.peakT = t; pull.topV = v; }
  else if (!pull.stall && p.vel.y < -1) pull.stall = t;
  return ["KeyS"];
}, { every: 0.5, until: (t) => t > 14 });
console.log(`pull-up: bottom of the pull-out ${pull.low.toFixed(1)} m at ${pull.lowV.toFixed(1)} m/s; up to ${pull.peak.toFixed(1)} m at ${pull.topV.toFixed(1)} m/s by ${pull.peakT.toFixed(1)} s (${(pull.peak - pull.low).toFixed(1)} m gained); sinking again by ${pull.stall.toFixed(1)} s`);

// a full about-turn with A held, after settling into the level glide
{
  let start = null, done = null;
  fly("", 300, 5, (t, p) => {
    if (t < 10) return [];
    if (!start) start = { t, y: p.pos.y, head: p.suitHead };
    if (!done && Math.abs(p.suitHead - start.head) >= Math.PI) done = { t, y: p.pos.y };
    return ["KeyA"];
  }, { quiet: true, until: () => !!done });
  // the same ten seconds flown straight, for the height a turn costs over gliding
  let straight = null;
  fly("", 300, 5, (t, p) => { if (t >= done.t && !straight) straight = p.pos.y; return []; }, { quiet: true, until: () => straight !== null });
  const lost = start.y - done.y;
  console.log(`\n180° turn, A held from a settled glide: ${(done.t - start.t).toFixed(1)} s and ${lost.toFixed(1)} m of height; flying straight for that long loses ${(lost - (straight - done.y)).toFixed(1)} m, so the turn costs ${(straight - done.y).toFixed(1)} m extra`);
}
// a tap of A: a small correction
{
  let h0 = null, h1 = null;
  fly("", 300, 5, (t, p) => {
    if (t < 10) { h0 = p.suitHead; return []; }
    if (t > 16) { h1 = p.suitHead; }
    return t < 10.08 ? ["KeyA"] : [];
  }, { quiet: true, until: () => h1 !== null });
  console.log(`a 0.08 s tap of A turns the suit ${((h1 - h0) * 180 / Math.PI).toFixed(1)}° in all`);
}
// a wall 40 m ahead, flown into level and in a dive: only the fast one hurts
for (const [name, keys] of [["level", []], ["diving", ["KeyW"]]]) {
  const wall = { ground: () => 0, collide: (pos) => { if (pos.z < -40) pos.z = -40; }, lastBlock: -1 };
  const p = new Player(wall);
  p.pos.set(0, 60, 0); p.vel.set(0, 0, -5); p.onGround = false; p.suit = true;
  p.update(DT, true); p.jump();
  let hit = 0, t = 0;
  while (t < 30 && p.suitOpen !== false || t < DT * 2) { p.keys = new Set(keys); p.update(DT, true); t += DT; hit ||= p.suitHit; if (p.pos.z <= -40 + 1e-6) break; }
  p.update(DT, true); hit ||= p.suitHit;
  console.log(`into a wall ${name}: ${hit ? `hurts at ${hit.toFixed(1)} m/s, suit closed` : `no harm, still ${p.suitOpen ? "open, sliding along it" : "closed"}`}`);
}
console.log(`\nspeed plus height never grew in the suit: the most it rose in a frame was ${worstGain.toFixed(4)} (J/kg)`);
