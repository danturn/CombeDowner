// The Climb: a team challenge up the tallest thing on the map there is to climb, a crag the lidar
// shows (a quarry face, Signal Hill's slopes) or, where there's none as tall, the
// tallest building. It's done together: up a face of holds from a stone plinth at its foot, with
// ledges on the way, to the top, and it only counts when everyone stands there at once.
// - Grab a hold by walking into the face (or E, which also catches one as you fall past). On the
//   face, the keys or the stick reach for the next hold that way, Space lunges for one further off,
//   and crouch lets go. Grip drains while you hang and climb and comes back when you stand on
//   something; run out and you come off.
// - Some holds are too high to reach from a ledge alone: a mate crouches and you stand on their
//   shoulders. A mate on a ledge can reach down and haul you up onto it. The first one up onto a
//   ledge can drop a rope from it for the rest.
// - A short fall hurts and leaves your grip short until you've rested on a ledge. A big one knocks
//   you out where you land: a mate has to come down, pick you up and carry you back up to the
//   ledge the team has reached, in time, or you're out, a ghost watching until a rope dropped from
//   the next ledge brings you back in. If everyone's down, it's back to the bottom.
// - Alone it can be done (there are more holds, and none needs a boost); with more of you there
//   are fewer holds and more of them need a boost.
// Where it goes and every hold on it come from the map and the job's seed, so everyone climbs the
// same face: a crag clear of streets, railways, the cable car and water, with no trees growing up
// it (and the squares' own trees in front of it are cleared as they load: clearClimb, tiles.ts).
// The plinth, the ledges and the top are things to stand on (map.floors), and a crag's face is
// solid (map.pushers).
//
// Who decides what: each climber moves themselves (holds, ropes, being hauled up) and says what
// they're doing ("qe" cs, a few times a second), and says when they've fallen. The host decides
// how many the face is set for, who's knocked out, carried, back on their feet or out, when the
// team has reached a ledge, when everyone's down and it starts again, and when it's won.
import * as THREE from "three";
import * as SFX from "./audio";
import { registerChallenge } from "./challenges";
import { keyLabel } from "./gamepad";
import { PATHS, type GameMap, type MapData } from "./map";
import { openGround } from "./oddments";
import type { Player } from "./player";
import { hash, rng, type Job, type QuestWorld } from "./quests";

const COLOUR = "#d9783a";
const WIDTH = 12;          // metres across the face
const CAP = 36;            // the tallest climb, metres from the plinth to the top
const MIN = 9;             // anything lower isn't worth it
const SECTION = 9;         // metres of face between ledges, roughly
const DEPTH = 1.6;         // how far a ledge stands out from the face
const PLINTH = 0.35;       // the plinth's step up from the ground

const HAND = 2.0;          // hands above the feet, hanging
const STAND_REACH = 2.3;   // highest hold above your feet you can take standing
const CATCH = 1.0;         // how far from your hands a hold is caught in the air
const REACH = 2.2;         // hold to hold, hand over hand
const LUNGE = 3.4;         // and with a lunge
const SHOULDERS = 1.0;     // a crouching mate's shoulders above their feet
const BOOST_HOLD = 4.7;    // a boost gap's hold above its ledge: out of a jump's reach, in reach off shoulders
const OUT = 0.42;          // a hanging body's distance out from the face

const HANG_DRAIN = 0.03, MOVE_COST = 0.035, LUNGE_COST = 0.16, CATCH_COST = 0.1, ROPE_DRAIN = 0.008;
const REST = 0.4, HEAL = 0.06, HURT = 0.25, CARRY_MUL = 1.8;
const MOVE_T = 0.3, LUNGE_T = 0.22, MANTLE_T = 0.5, PULL_T = 0.8;
const ROPE_V = 2.2;
const SHORT_FALL = 2.5, BIG_FALL = 7.5;
const DOWN_SECS = 90;      // to carry a knocked-out mate back up before they're out
const WIN_HOLD = 2.5;      // seconds everyone has to stand at the top together
const SEND = 0.12;
const NEAR = 160;          // metres from the face that anyone is climbing it at all

/** The face, in scene coordinates: its foot's middle, out (the way it faces) and along (right, facing it). */
interface Face {
  ox: number; oz: number; nx: number; nz: number; tx: number; tz: number;
  base: number;        // the lowest ground along its foot
  y0: number;          // the plinth's top
  top: number;         // the top
  back: number;        // how far back from the face the top stands
  crag: boolean;       // a crag of its own drawn and solid (else a building's wall is the face)
  name: string;
  prize: [number, number];
}

interface Ledge { y: number; s0: number; s1: number; rope: number }
interface Hold { s: number; y: number; boost: boolean }
interface Route { n: number; ledges: Ledge[]; holds: Hold[] }

/** Where hands are: a hold (i), or the lip of a ledge (k) at s. */
interface Point { s: number; y: number; i: number; lip: number }

const faces = new WeakMap<GameMap, Face | null>();

/** The tallest climbable face on the map, the same on every machine. */
export function faceOf(map: GameMap): Face | null {
  if (faces.has(map)) return faces.get(map)!;
  let f: Face | null = null;
  try { f = findFace(map); } catch (e) { console.warn("The Climb: no face", e); }
  faces.set(map, f);
  return f;
}

function findFace(map: GameMap): Face | null {
  const W = map.wide, D = map.d;
  const ground = (x: number, z: number) => (W ? W.ground(x, z) : map.ground(x, z));
  const home = openGround(map);
  const fc = W ? [W.fx, W.fy] : D.fc ?? [0, 0];
  const ok = (x: number, z: number) => map.fieldEdge(x, z) > 80 && (!home || Math.hypot(home.x - x, home.y + z) > 120);
  type Cand = { h: number; d: number; x: number; z: number; nx: number; nz: number; crag: boolean; back: number; base: number; foot: number };
  let best: Cand | null = null;
  const better = (c: Cand) => !best || Math.round(c.h) > Math.round(best.h) || (Math.round(c.h) === Math.round(best.h) && (c.crag && !best.crag || (c.crag === best.crag && (c.d < best.d - 1 || (Math.abs(c.d - best.d) <= 1 && c.x + c.z * 1e-3 < best.x + best.z * 1e-3)))));

  // crags: the steepest rises in the ground, on a grid of its points
  let nx: number, ny: number, x0: number, y0: number, dx: number;
  if (W) { nx = W.nx; ny = W.ny; x0 = W.x0; y0 = W.y0; dx = W.dx; }
  else { const b = D.b; dx = 8; x0 = b[0]; y0 = b[1]; nx = Math.floor((b[2] - b[0]) / dx); ny = Math.floor((b[3] - b[1]) / dx); }
  const H = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) H[j * nx + i] = W ? W.at(i, j) : map.ground(x0 + i * dx, -(y0 + j * dx));
  const at = (i: number, j: number) => H[Math.min(ny - 1, Math.max(0, j)) * nx + Math.min(nx - 1, Math.max(0, i))];
  // streets, railways and water in front of a face would put trains and traffic through the climb
  let lines: number[][] | null = null;
  const clearOfWays = (x: number, z: number) => {
    if (!lines) {
      lines = [];
      for (const r of [...D.rd, ...(W?.rd ?? [])]) for (let i = 1; i < r.p.length; i++) lines.push([r.p[i - 1][0], r.p[i - 1][1], r.p[i][0], r.p[i][1], PATHS.has(r.c) ? 0 : 7]);
      for (const t of map.railData?.tracks ?? []) for (let i = 1; i < t.p.length; i++) lines.push([t.p[i - 1][0], t.p[i - 1][1], t.p[i][0], t.p[i][1], 8]);
      const c = map.cable;
      if (c) lines.push([c.ax, c.ay, c.ax + c.ux * c.len, c.ay + c.uy * c.len, 30]);
    }
    const y = -z;
    for (const [ax, ay, bx, by, r] of lines) {
      if (Math.min(ax, bx) > x + 20 || Math.max(ax, bx) < x - 20 || Math.min(ay, by) > y + 20 || Math.max(ay, by) < y - 20) continue;
      const vx = bx - ax, vy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy || 1)));
      if (Math.hypot(x - ax - vx * t, y - ay - vy * t) < r) return false;
    }
    for (const w of [...D.wp, ...(W?.wp ?? [])]) if (w.r[0] && inRing(w.r[0], x, y)) return false;
    return true;
  };
  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (let j = 2; j < ny - 2; j++) for (let i = 2; i < nx - 2; i++) {
    const h0 = at(i, j);
    for (const [di, dj] of DIRS) {
      if (at(i - di, j - dj) > h0 + 2) continue;   // a foot, not partway up
      let rise = 0;
      for (let s = 1; s <= 3; s++) {
        const r = at(i + di * s, j + dj * s) - h0, run = s * dx * Math.hypot(di, dj);
        if (r / run >= 1 && r > rise) rise = r;
      }
      if (rise < MIN) continue;
      const h = Math.min(rise, CAP);
      const x = x0 + i * dx, y = y0 + j * dx, z = -y, l = Math.hypot(di, dj);
      // the way it faces, in the scene: back down the rise
      const fx = -di / l, fz = dj / l;
      const c: Cand = { h, d: Math.hypot(x - fc[0], y - fc[1]), x, z, nx: fx, nz: fz, crag: true, back: 0, base: h0, foot: h0 };
      if (best && !better(c)) continue;
      if (!ok(x + fx * 8, z + fz * 8)) continue;
      // a face all the way across: nothing in front higher than its foot, and steep behind
      const tx = fz, tz = -fx;
      let good = true, base = Infinity;
      for (let s = -WIDTH / 2; s <= WIDTH / 2 && good; s += 2) {
        const px = x + tx * s, pz = z + tz * s;
        const front = ground(px + fx * 2, pz + fz * 2), foot = ground(px, pz), behind = ground(px - fx * 12, pz - fz * 12);
        base = Math.min(base, foot, front);
        if (front > h0 + 2.5 || behind < h0 + h * 0.4) good = false;
        // nothing growing up the face or in the way at its foot
        if (W && (W.treesNear(px + fx * 1, -(pz + fz * 1), 2.5).length || W.treesNear(px + fx * 3.5, -(pz + fz * 3.5), 2).length)) good = false;
      }
      if (!good) continue;
      if (![-WIDTH / 2, 0, WIDTH / 2].every((s) => clearOfWays(x + tx * s + fx * 5, z + tz * s + fz * 5))) continue;
      c.base = base;
      best = c;
    }
  }

  // buildings: the tallest, up its longest wall that faces somewhere open
  const blds = [...(D.bl ?? []), ...(W?.bl ?? [])];
  for (const b of blds) {
    if (!b.r[0] || b.r[0].length < 3 || b.h < MIN) continue;
    const h = Math.min(b.h, CAP);
    if (best && Math.round(h) < Math.round(best.h)) continue;
    const r = b.r[0];
    let cx = 0, cy = 0;
    for (const q of r) { cx += q[0]; cy += q[1]; }
    cx /= r.length; cy /= r.length;
    let k = -1, len = 0;
    for (let i = 0; i < r.length; i++) {
      const a = r[i], c = r[(i + 1) % r.length], l = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (l > len) { len = l; k = i; }
    }
    if (len < WIDTH) continue;
    const a = r[k], c = r[(k + 1) % r.length];
    const mx = (a[0] + c[0]) / 2, my = (a[1] + c[1]) / 2;
    let ex = -(c[1] - a[1]) / len, ey = (c[0] - a[0]) / len;
    if (ex * (mx - cx) + ey * (my - cy) < 0) { ex = -ex; ey = -ey; }
    const x = mx, z = -my, fx = ex, fz = -ey;
    const g = ground(x + fx * 3, z + fz * 3);
    const cand: Cand = { h, d: Math.hypot(x - fc[0], my - fc[1]), x, z, nx: fx, nz: fz, crag: false, back: 4, base: g, foot: g };
    if (best && !better(cand)) continue;
    if (!ok(x + fx * 8, z + fz * 8)) continue;
    if (W?.buildingsNear(mx + ex * 4, my + ey * 4, 2).some((o) => o !== b)) continue;
    if (!clearOfWays(x + fx * 5, z + fz * 5)) continue;
    const top = b.g - map.z0 + b.h;
    cand.h = Math.min(top - g, CAP);
    if (cand.h < MIN) continue;
    best = cand;
  }
  if (!best) return null;
  const B: Cand = best;
  const tx = B.nz, tz = -B.nx;
  const plinth = B.base + PLINTH, top = B.foot + B.h;
  if (top - plinth < MIN) return null;
  // how far back the top runs before the ground behind comes up to it
  let back = B.back;
  if (B.crag) {
    back = 40;
    for (let d = 1; d <= 40; d++) if (ground(B.x - B.nx * d, B.z - B.nz * d) >= top - 0.5) { back = d + 1; break; }
    back = Math.max(4, back);
  }
  const px = B.x - B.nx * (back + 2), pz = B.z - B.nz * (back + 2);
  const prize: [number, number] = B.crag && ground(px, pz) > top - 2 ? [px, pz] : [B.x + B.nx * 10, B.z + B.nz * 10];
  return { ox: B.x, oz: B.z, nx: B.nx, nz: B.nz, tx, tz, base: B.base, y0: plinth, top, back, crag: B.crag, name: nameNear(map, B.x, B.z, B.crag), prize };
}

/** A square coming in: the trees, shrubs, street things and wires on and in front of the face go, so its holds can be seen. */
export function clearClimb(core: GameMap, d: MapData) {
  const f = faceOf(core);
  if (!f) return;
  const off = (x: number, y: number) => {
    const dx = x - f.ox, dz = -y - f.oz, s = dx * f.tx + dz * f.tz, out = dx * f.nx + dz * f.nz;
    return Math.abs(s) < WIDTH / 2 + 4 && out > -f.back - 2 && out < 14;
  };
  d.tr = d.tr.filter((q) => !off(q[0], q[1]));
  if (d.sb) d.sb = d.sb.filter((q) => !off(q[0], q[1]));
  if (d.fx) d.fx = d.fx.filter((q) => !off(+q[1], +q[2]));
  if (d.wr) d.wr = d.wr.filter((q) => !off(q[0], q[1]) && !off(q[3], q[4]));
}

function nameNear(map: GameMap, x: number, z: number, crag: boolean): string {
  let n = "", far = 600;
  for (const p of [...(map.d.pl ?? []), ...(map.wide?.d.pl ?? [])]) {
    if (!p.n || p.r.length < 3) continue;
    const cx = p.r.reduce((s, q) => s + q[0], 0) / p.r.length, cy = p.r.reduce((s, q) => s + q[1], 0) / p.r.length;
    const d = Math.hypot(cx - x, cy + z);
    if (d < far || (d === far && p.n < n)) { far = d; n = p.n; }
  }
  const what = crag ? "the crag" : "the tall building";
  return n ? `${what} by ${n}` : what;
}

/** The face's holds and ledges for n climbers, from the seed. */
function routeFor(f: Face, seed: number, n: number): Route {
  const r = rng(hash("climb", seed, n));
  const H = f.top - f.y0, count = Math.max(1, Math.ceil((H - 2) / SECTION)), half = WIDTH / 2;
  const ledges: Ledge[] = [{ y: f.y0, s0: -half, s1: half, rope: 0 }];
  for (let k = 1; k < count; k++) {
    const prev = ledges[k - 1], w = 4 + r() * 1.5, pc = (prev.s0 + prev.s1) / 2, reach = (prev.s1 - prev.s0) / 2 + w / 2 - 2;
    const c = Math.max(-half + w / 2 + 0.5, Math.min(half - w / 2 - 0.5, pc + (r() * 2 - 1) * reach));
    ledges.push({ y: f.y0 + (H * k) / count + (r() - 0.5) * 1.5, s0: c - w / 2, s1: c + w / 2, rope: 0 });
  }
  ledges.push({ y: f.top, s0: -half, s1: half, rope: 0 });
  for (let k = 1; k < ledges.length; k++) {
    const a = ledges[k], b = ledges[k - 1], lo = Math.max(a.s0, b.s0) + 0.6, hi = Math.min(a.s1, b.s1) - 0.6;
    a.rope = lo < hi ? lo + r() * (hi - lo) : (a.s0 + a.s1) / 2;
  }
  // more climbers: holds further apart, fewer spare ones, and more that need a boost
  const step = n <= 1 ? 1.35 : n === 2 ? 1.6 : 1.8;
  const spare = n <= 1 ? 0.85 : n === 2 ? 0.35 : n === 3 ? 0.15 : 0.05;
  const boostP = n <= 1 ? 0 : n === 2 ? 0.5 : n === 3 ? 0.75 : 1;
  const sections = ledges.length - 1, boosts = new Array<boolean>(sections).fill(false);
  for (let k = 1; k < sections; k++) boosts[k] = r() < boostP;
  // off the plinth only when there's nowhere else: the ground in front can stand a little higher than it
  if (n >= 2 && !boosts.some((b) => b)) boosts[sections > 1 ? 1 + Math.floor(r() * (sections - 1)) : 0] = true;
  const holds: Hold[] = [];
  for (let k = 0; k < sections; k++) {
    const L = ledges[k], next = ledges[k + 1];
    const goal = (Math.max(L.s0, next.s0) + Math.min(L.s1, next.s1)) / 2;
    let s = L.s0 + 0.8 + r() * (L.s1 - L.s0 - 1.6);
    let y = L.y + (boosts[k] ? BOOST_HOLD : 1.8 + r() * 0.3);
    holds.push({ s, y, boost: boosts[k] });
    let lunged = false;
    while (y < next.y - REACH + 0.4) {
      const left = next.y - y;
      let d = step + (r() - 0.5) * 0.5;
      if (n >= 3 && !lunged && left > 4 && r() < 0.3) { d = 2.7 + r() * 0.4; lunged = true; }
      const dy = Math.min(left - 0.6, d * (0.75 + r() * 0.2));
      const toward = left < 4 ? (Math.min(next.s1 - 0.5, Math.max(next.s0 + 0.5, s)) - s) : (goal - s) * 0.3;
      const ds = Math.max(-1, Math.min(1, toward)) * Math.sqrt(Math.max(0, d * d - dy * dy)) + (left < 4 ? 0 : (r() - 0.5) * 0.8);
      s = Math.max(-half + 0.5, Math.min(half - 0.5, s + ds));
      y += dy;
      holds.push({ s, y, boost: false });
      if (r() < spare) {
        const ss = Math.max(-half + 0.4, Math.min(half - 0.4, s + (r() < 0.5 ? -1 : 1) * (0.7 + r() * 0.6)));
        const sy = y + (r() - 0.5) * 0.8;
        if (sy > L.y + (boosts[k] ? BOOST_HOLD : 1.6) && sy < next.y - 0.6) holds.push({ s: ss, y: sy, boost: false });
      }
    }
  }
  return { n, ledges, holds };
}

/** A canvas of rock: banded, cracked and speckled. */
function rockTexture(seed: number): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!, r = rng(seed);
  g.fillStyle = "#8d8676"; g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 4 + Math.floor(r() * 6)) {
    const v = 120 + Math.floor(r() * 40);
    g.fillStyle = `rgb(${v + 8},${v + 2},${v - 12})`;
    g.fillRect(0, y, 128, 2 + Math.floor(r() * 4));
  }
  for (let i = 0; i < 500; i++) {
    const v = 90 + Math.floor(r() * 90);
    g.fillStyle = `rgba(${v},${v - 4},${v - 14},0.6)`;
    g.fillRect(Math.floor(r() * 128), Math.floor(r() * 128), 1 + Math.floor(r() * 3), 1 + Math.floor(r() * 2));
  }
  g.strokeStyle = "rgba(40,36,30,0.55)";
  for (let i = 0; i < 9; i++) {
    let x = r() * 128, y = r() * 128;
    g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 6; s++) { x += (r() - 0.5) * 18; y += 6 + r() * 10; g.lineTo(x, y); }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}

const FALLS = ["came off the wall", "peeled off", "did a starfish all the way down", "let go to wave", "found the quick way down", "bounced"];

const enum M { Free, Hang, Rope, Tween, Out, Carried, Ghost }
type Status = { st: "ko" | "ghost"; left: number; by: string };
type Report = { m: number; g: number; c: number; L: number; on: number; cy: string; t: number };

registerChallenge({
  id: "climb", name: "The Climb", blurb: "Up the tallest crag around, together: boost, haul and rope each other to the top",
  glyph: "C", colour: COLOUR, tier: 2, stars: 3,
  goal: () => "Get the whole team to the top together",
  place(map) {
    const f = faceOf(map);
    if (!f) return null;
    return [
      { x: f.ox + f.nx * 8, z: f.oz + f.nz * 8, name: f.name },
      { x: f.ox, z: f.oz, y: f.y0, name: "the foot" },
      { x: f.prize[0], z: f.prize[1], y: f.top, name: "the top" },
    ];
  },
  start({ offer, w }) {
    const f = faceOf(w.map)!;
    return climb(offer, w, f);
  },
});

function climb(offer: Job["offer"], w: QuestWorld, f: Face): Job {
  const seed = offer.seed, map = w.map;
  const P = (s: number, out: number) => [f.ox + f.tx * s + f.nx * out, f.oz + f.tz * s + f.nz * out] as const;
  const local = (x: number, z: number) => { const dx = x - f.ox, dz = z - f.oz; return [dx * f.tx + dz * f.tz, dx * f.nx + dz * f.nz] as const; };
  let route = routeFor(f, seed, Math.max(1, w.players().length));
  let fixed = false;               // the host has said how many it's set for
  const S = () => route.ledges.length - 1;

  // ---- my own climbing ----
  let mode: M = M.Free;
  let grip = 1, cap = 1, still = 0;
  let pt: Point | null = null;                       // hands, on the face
  let from = { s: 0, y: 0, out: 0 }, to = { s: 0, y: 0, out: 0 }, tT = 0, tLen = 0;   // a move between holds, a mantle or a haul
  let tweenThen: (() => void) | null = null;
  let rope = -1;                                     // the ledge whose rope you're on
  let L = 0;                                         // the highest ledge you've climbed to
  let peak = -Infinity, air = false, flail = 0, yelled = false;
  let cool = 0, wantGrab = false, prevJump = false, prevCrouch = false, prevLatch = false;
  let carriedBy = "", carrying = "";
  let lastX = 0, lastY = 0, lastZ = 0;
  let koVy = 0;
  let sendT = 0, lastOn = -1;
  const body = () => w.body?.() as Player;

  // ---- everyone's, as the host says ----
  const status = new Map<string, Status>();
  const ropes = new Set<number>();
  let cp = 0, fails = 0, held = 0, failT = 0, won = false;
  const reports = new Map<string, Report>();

  // ---- drawn ----
  const group = new THREE.Group();
  w.scene.add(group);
  const yaw = Math.atan2(f.nx, f.nz);
  const texture = rockTexture(seed);
  const rock = new THREE.MeshLambertMaterial({ map: texture });
  const disposables: { dispose(): void }[] = [texture, rock];
  if (f.crag) {
    const h = f.top - f.base + 4, g = new THREE.BoxGeometry(WIDTH + 2, h, f.back + 1);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (WIDTH + 2) / 4, uv.getY(i) * h / 4);
    const m = new THREE.Mesh(g, rock);
    const [cx, cz] = P(0, -(f.back + 1) / 2);
    m.position.set(cx, f.base - 4 + h / 2, cz);
    m.rotation.y = yaw;
    group.add(m);
    disposables.push(g);
  }
  const slab = new THREE.BoxGeometry(1, 1, 1), stone = new THREE.MeshLambertMaterial({ color: "#a39a86" });
  const holdGeo = new THREE.DodecahedronGeometry(0.22), chalk = new THREE.MeshLambertMaterial({ color: "#e9e1cf" });
  const ropeGeo = new THREE.CylinderGeometry(0.035, 0.035, 1, 5), hemp = new THREE.MeshLambertMaterial({ color: "#c9a25a" });
  const coilGeo = new THREE.TorusGeometry(0.28, 0.08, 5, 10);
  const star = new THREE.OctahedronGeometry(0.11), gold = new THREE.MeshBasicMaterial({ color: "#ffd84a" });
  const ghostGeo = new THREE.SphereGeometry(0.75, 10, 8), mist = new THREE.MeshBasicMaterial({ color: "#bfe4ff", transparent: true, opacity: 0.28, depthWrite: false });
  disposables.push(slab, stone, holdGeo, chalk, ropeGeo, hemp, coilGeo, star, gold, ghostGeo, mist);
  let ledgeMesh: THREE.InstancedMesh | null = null, holdMesh: THREE.InstancedMesh | null = null;
  const ropeMesh = new THREE.InstancedMesh(ropeGeo, hemp, 8), coilMesh = new THREE.InstancedMesh(coilGeo, hemp, 8);
  group.add(ropeMesh, coilMesh);
  const flag = new THREE.Group();
  {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3, 5), stone);
    pole.position.y = 1.5;
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.6), new THREE.MeshLambertMaterial({ color: COLOUR, side: THREE.DoubleSide }));
    cloth.position.set(0.5, 2.6, 0);
    flag.add(pole, cloth);
    disposables.push(pole.geometry, cloth.geometry, cloth.material as THREE.Material);
    const [x, z] = P(0, -1);
    flag.position.set(x, f.top, z);
    flag.rotation.y = yaw + Math.PI / 2;
    group.add(flag);
  }
  const marks: THREE.Object3D[] = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), v3 = new THREE.Vector3(), sc = new THREE.Vector3();

  function build() {
    for (const m of [ledgeMesh, holdMesh]) if (m) { group.remove(m); m.dispose(); }
    ledgeMesh = new THREE.InstancedMesh(slab, stone, route.ledges.length);
    route.ledges.forEach((l, k) => {
      const s = (l.s0 + l.s1) / 2, [x, z] = P(s, DEPTH / 2);
      const thick = k === 0 ? l.y - f.base + 1 : 0.5;
      m4.compose(v3.set(x, l.y - thick / 2, z), q, sc.set(l.s1 - l.s0, thick, DEPTH));
      ledgeMesh!.setMatrixAt(k, m4);
    });
    holdMesh = new THREE.InstancedMesh(holdGeo, chalk, route.holds.length);
    route.holds.forEach((h, i) => {
      const [x, z] = P(h.s, 0.08);
      m4.compose(v3.set(x, h.y, z), q, sc.set(h.boost ? 1.3 : 1, h.boost ? 1.3 : 1, 0.7));
      holdMesh!.setMatrixAt(i, m4);
      holdMesh!.setColorAt(i, new THREE.Color(h.boost ? "#ff9b4a" : "#e9e1cf"));
    });
    group.add(ledgeMesh, holdMesh);
    drawRopes();
  }

  function drawRopes() {
    let n = 0, c = 0;
    route.ledges.forEach((l, k) => {
      if (k === 0) return;
      const below = route.ledges[k - 1].y;
      if (ropes.has(k)) {
        const [x, z] = P(l.rope, DEPTH + 0.25), len = l.y - below + 0.2;
        m4.compose(v3.set(x, below + len / 2 - 0.1, z), q, sc.set(1, len, 1));
        ropeMesh.setMatrixAt(n++, m4);
      } else {
        const [x, z] = P(l.rope, DEPTH - 0.4);
        m4.compose(v3.set(x, l.y + 0.08, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)), sc.set(1, 1, 1));
        coilMesh.setMatrixAt(c++, m4);
      }
    });
    ropeMesh.count = n; coilMesh.count = c;
    ropeMesh.instanceMatrix.needsUpdate = true; coilMesh.instanceMatrix.needsUpdate = true;
  }
  build();

  // ---- standing on it ----
  const floor = (x: number, z: number, y: number): number | null => {
    if (Math.abs(x - f.ox) > 60 || Math.abs(z - f.oz) > 60) return null;
    const [s, out] = local(x, z);
    let best: number | null = null;
    const top = (h: number) => { if (h <= y + 0.6 && (best === null || h > best)) best = h; };
    route.ledges.forEach((l, k) => {
      const crown = k === S() && f.crag, back = crown ? f.back + 1 : k === S() ? 0.2 : 0, wide = crown ? 1 : 0.15;
      if (s >= l.s0 - wide && s <= l.s1 + wide && out >= -back && out <= DEPTH + 0.1) top(l.y);
    });
    for (const sh of shoulders) if (Math.hypot(x - sh[0], z - sh[1]) < 0.45) top(sh[2]);
    return best;
  };
  let shoulders: [number, number, number][] = [];
  const pusher = (pos: { x: number; z: number }, y: number, r: number): number => {
    if (Math.abs(pos.x - f.ox) > 60 || Math.abs(pos.z - f.oz) > 60) return -Infinity;
    const [s, out] = local(pos.x, pos.z), half = WIDTH / 2 + 1;
    let block = -Infinity;
    const push = (s1: number, o1: number, h: number) => {
      const [x, z] = P(s1, o1);
      pos.x = x; pos.z = z; block = Math.max(block, h);
    };
    // the plinth's front: vault up onto it
    if (y < f.y0 - 0.45 && Math.abs(s) < half - 1 && out > -0.1 && out < DEPTH + r) { push(s, DEPTH + r, f.y0 - y); return block; }
    if (!f.crag || y >= f.top - 0.05 || out > r || out < -f.back - 1 - r || Math.abs(s) > half + r) return block;
    // the crag: out of whichever side is nearest
    const toFront = r - out, toBack = out + f.back + 1 + r, toL = s + half + r, toR = half + r - s;
    const m = Math.min(toFront, toBack, toL, toR);
    if (m === toFront) push(s, r, f.top - y);
    else if (m === toBack) push(s, -f.back - 1 - r, f.top - y);
    else if (m === toL) push(-half - r, out, f.top - y);
    else push(half + r, out, f.top - y);
    return block;
  };
  const hook = () => {
    if (!map.floors.includes(floor)) map.floors.push(floor);
    if (!map.pushers.includes(pusher)) map.pushers.push(pusher);
  };

  /** Which ledge feet at (x, y, z) stand on, or -1; the ground just in front of the plinth counts as the bottom. */
  function ledgeAt(x: number, y: number, z: number, grounded: boolean): number {
    if (!grounded) return -1;
    const [s, out] = local(x, z);
    for (let k = route.ledges.length - 1; k >= 0; k--) {
      const l = route.ledges[k], back = k === S() ? (f.crag ? f.back + 1 : 12) : 0;
      // a building's roof above its top counts as the top
      const up = k === S() && !f.crag && out < 0 ? 8 : 0.35;
      if (y > l.y - 0.35 && y < l.y + up && s >= l.s0 - 0.3 && s <= l.s1 + 0.3 && out >= -back - 0.2 && out <= DEPTH + 0.3) return k;
    }
    if (y < f.y0 + 0.5 && out > 0 && out < 12 && Math.abs(s) < WIDTH / 2 + 3) return 0;
    return -1;
  }

  // ---- the body on the face ----
  const bodyAt = (p: Point) => ({ s: p.s, y: p.y - HAND, out: p.lip >= 0 ? DEPTH + 0.4 : OUT });
  function place(pl: Player, s: number, y: number, out: number) {
    const [x, z] = P(s, out);
    pl.pos.set(x, y, z);
    pl.vel.set(0, 0, 0);
    pl.onGround = false;
    pl.speed = 0;
  }
  function tween(a: { s: number; y: number; out: number }, b: { s: number; y: number; out: number }, T: number, then: (() => void) | null) {
    from = a; to = b; tT = 0; tLen = T; tweenThen = then;
  }
  function grabbed(p: Point, cost: number) {
    const pl = body();
    const [s, out] = local(pl.pos.x, pl.pos.z);
    pt = p; mode = M.Hang;
    grip = Math.max(0, grip - cost * (carrying ? CARRY_MUL : 1));
    tween({ s, y: pl.pos.y, out }, bodyAt(p), 0.18, null);
    SFX.rung();
  }
  function letGo(push = 0) {
    const pl = body();
    mode = M.Free; pt = null; rope = -1; cool = 0.6;
    pl.vel.set(f.nx * push, push ? 2 : 0, f.nz * push);
    pl.onGround = false;
  }
  function onto(k: number, s: number) {
    const pl = body(), l = route.ledges[k];
    const ss = Math.max(l.s0 + 0.4, Math.min(l.s1 - 0.4, s));
    place(pl, ss, l.y, DEPTH - 0.7);
    pl.onGround = true;
    mode = M.Free; pt = null; rope = -1;
    reached(k);
  }
  function reached(k: number) {
    if (k < S()) { if (k > L) L = k; }
    else if (L >= S() - 1) L = S();
  }

  /** The hold or ledge lip to reach for from p, the way (dx, dy) on the face, within max. */
  function reachFor(p: Point, dx: number, dy: number, max: number, min = 0.2): Point | null {
    const l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
    let best: Point | null = null, score = Infinity;
    const consider = (c: Point) => {
      const ex = c.s - p.s, ey = c.y - p.y, d = Math.hypot(ex, ey);
      if (d < min || d > max) return;
      const dot = (ex * ux + ey * uy) / d;
      if (dot < 0.5) return;
      const sc2 = d * 0.35 + (1 - dot) * 3;
      if (sc2 < score) { score = sc2; best = c; }
    };
    route.holds.forEach((h, i) => { if (i !== p.i) consider({ s: h.s, y: h.y, i, lip: -1 }); });
    route.ledges.forEach((le, k) => {
      if (k === 0 || k === p.lip) return;
      consider({ s: Math.max(le.s0 + 0.3, Math.min(le.s1 - 0.3, p.s)), y: le.y, i: -1, lip: k });
    });
    return best;
  }

  /** A hold within reach of someone standing or in the air at (s, out) with feet at y, if there is one. */
  function inReach(s: number, out: number, y: number, grounded: boolean): Point | null {
    let best: Point | null = null, bd = Infinity;
    const hand = y + HAND;
    const test = (c: Point, o: number) => {
      if (Math.abs(out - o) > 1.3) return;
      let d: number;
      if (grounded) {
        const up = c.y - y;
        if (up < 0.3 || up > STAND_REACH || Math.abs(c.s - s) > 1.0) return;
        d = Math.abs(c.s - s) + Math.abs(up - 1.9);
      } else {
        d = Math.hypot(c.s - s, c.y - hand);
        if (d > CATCH) return;
      }
      if (d < bd) { bd = d; best = c; }
    };
    route.holds.forEach((h, i) => test({ s: h.s, y: h.y, i, lip: -1 }, OUT));
    route.ledges.forEach((l, k) => {
      if (k === 0 || s < l.s0 - 0.3 || s > l.s1 + 0.3) return;
      test({ s: Math.max(l.s0 + 0.3, Math.min(l.s1 - 0.3, s)), y: l.y, i: -1, lip: k }, DEPTH + 0.4);
    });
    return best;
  }

  function stick(pl: Player): [number, number] {
    const k = pl.keys;
    let x = (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) - (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0);
    let y = (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) - (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0);
    if (!x && !y && Math.hypot(pl.joy.x, pl.joy.y) > 0.3) { x = pl.joy.x; y = -pl.joy.y; }
    return [x, y];
  }

  /** The player's own frame, taken over while on the face, out cold, carried or a ghost. */
  function cling(dt: number, active: boolean): boolean {
    const pl = body();
    const me = w.me();
    if (!me.alive) { if (mode !== M.Free) { mode = M.Free; pt = null; } return false; }
    const jump = active && (pl.keys.has("Space") || pl.jumpHeld), jumped = jump && !prevJump;
    prevJump = jump;
    const crouchKey = active && pl.keys.has("KeyC"), latch = pl.crouchLatch;
    const crouched = (crouchKey && !prevCrouch) || (latch && !prevLatch);
    prevCrouch = crouchKey; prevLatch = latch;
    cool = Math.max(0, cool - dt);
    if (mode === M.Free) return free(pl, dt, active);
    pl.prone = 0;
    if (mode === M.Tween) {
      tT += dt;
      const t = Math.min(1, tT / tLen), e = t * t * (3 - 2 * t);
      place(pl, from.s + (to.s - from.s) * e, from.y + (to.y - from.y) * e + Math.sin(t * Math.PI) * 0.3, from.out + (to.out - from.out) * e);
      if (t >= 1) { const then = tweenThen; tweenThen = null; mode = M.Free; then?.(); }
      return true;
    }
    if (mode === M.Hang) {
      if (pl.crouchLatch) pl.crouchLatch = false;
      prevLatch = false;
      const mul = carrying ? CARRY_MUL : 1;
      grip -= HANG_DRAIN * mul * dt;
      tT += dt;
      const moving = tT < tLen;
      if (moving) {
        const t = Math.min(1, tT / tLen), e = t * t * (3 - 2 * t);
        place(pl, from.s + (to.s - from.s) * e, from.y + (to.y - from.y) * e, from.out + (to.out - from.out) * e);
      } else place(pl, to.s, to.y, to.out);
      if (grip <= 0) { grip = 0; w.toast("Your grip's gone", 2); letGo(); return true; }
      if (crouched) { letGo(); return true; }
      if (moving) return true;
      const [ix, iy] = active ? stick(pl) : [0, 0];
      const p = pt!;
      if (jumped) {
        const c = reachFor(p, ix, iy || (ix ? 0 : 1), LUNGE, 0.2);
        if (c && !carrying && grip > 0.05) {
          grip -= LUNGE_COST;
          pt = c;
          tween(bodyAt(p), bodyAt(c), LUNGE_T, null);
          SFX.effort(0, 0, seed);
        } else { letGo(2.5); }
        return true;
      }
      if (!ix && !iy) return true;
      // up from a ledge's lip: over it and onto the ledge
      if (p.lip >= 0 && iy > 0.5) {
        const k = p.lip, a = bodyAt(p), l = route.ledges[k];
        mode = M.Tween;
        tween(a, { s: Math.max(l.s0 + 0.4, Math.min(l.s1 - 0.4, p.s)), y: l.y, out: DEPTH - 0.7 }, MANTLE_T, () => onto(k, p.s));
        SFX.ladderUp();
        return true;
      }
      const c = reachFor(p, ix, iy, REACH);
      if (c) {
        grip -= MOVE_COST * mul;
        pt = c;
        tween(bodyAt(p), bodyAt(c), MOVE_T * (carrying ? 1.6 : 1), null);
        SFX.rung();
        return true;
      }
      // down onto something just under your feet
      if (iy < -0.5) {
        const under = map.floor(pl.pos.x, pl.pos.z, pl.pos.y + 0.05);
        if (pl.pos.y - under < 1.2) { letGo(); return true; }
      }
      return true;
    }
    if (mode === M.Rope) {
      const l = route.ledges[rope], below = route.ledges[rope - 1].y;
      grip -= ROPE_DRAIN * dt;
      const [, iy] = active ? stick(pl) : [0, 0];
      let y = pl.pos.y + iy * ROPE_V * (carrying ? 0.65 : 1) * dt;
      if (crouched || jumped) { letGo(jumped ? 2.5 : 0); return true; }
      if (y >= l.y - 1.7) {
        mode = M.Tween;
        const k = rope;
        tween({ s: l.rope, y, out: DEPTH + 0.6 }, { s: l.rope, y: l.y, out: DEPTH - 0.7 }, MANTLE_T, () => onto(k, l.rope));
        SFX.ladderUp();
        return true;
      }
      const under = Math.max(below, map.floor(pl.pos.x, pl.pos.z, pl.pos.y + 0.05));
      if (iy < 0 && y <= under + 0.05) { place(pl, l.rope, under, DEPTH + 0.6); letGo(); pl.onGround = true; return true; }
      y = Math.max(under, y);
      place(pl, l.rope, y, DEPTH + 0.6);
      if (iy) pl.bob += Math.abs(iy) * dt * 10;
      return true;
    }
    if (mode === M.Out) {
      pl.prone = 1; pl.crouch = 0;
      koVy -= 25 * dt;
      const g = map.floor(pl.pos.x, pl.pos.z, pl.pos.y);
      pl.pos.y = Math.max(g, pl.pos.y + koVy * dt);
      if (pl.pos.y <= g) { koVy = 0; pl.onGround = true; }
      pl.vel.set(0, 0, 0); pl.speed = 0;
      return true;
    }
    if (mode === M.Carried) {
      const c = w.players().find((o) => o.id === carriedBy);
      if (!c) { mode = M.Out; return true; }
      pl.prone = 1;
      pl.pos.set(c.x, c.y + 1.25, c.z);
      pl.vel.set(0, 0, 0); pl.onGround = false; pl.speed = 0;
      return true;
    }
    if (mode === M.Ghost) {
      const [ix, iy] = active ? stick(pl) : [0, 0];
      const sn = Math.sin(pl.yaw), cs = Math.cos(pl.yaw);
      pl.pos.x += (-sn * iy + cs * ix) * 6 * dt;
      pl.pos.z += (-cs * iy - sn * ix) * 6 * dt;
      pl.pos.y += ((jump ? 1 : 0) - (crouchKey ? 1 : 0) + Math.sin(pl.pitch) * iy) * 5 * dt;
      // a ghost keeps to the face
      const [s, out] = local(pl.pos.x, pl.pos.z), [x, z] = P(Math.max(-WIDTH, Math.min(WIDTH, s)), Math.max(1, Math.min(30, out)));
      pl.pos.x = x; pl.pos.z = z;
      pl.pos.y = Math.max(f.y0, Math.min(f.top + 12, pl.pos.y));
      pl.vel.set(0, 0, 0); pl.onGround = false; pl.speed = 0;
      return true;
    }
    return false;
  }

  /** On your own feet (or in the air): ropes and holds to grab, and falls to land. */
  function free(pl: Player, dt: number, active: boolean): boolean {
    const near = Math.abs(pl.pos.x - f.ox) < NEAR && Math.abs(pl.pos.z - f.oz) < NEAR;
    if (!near) { air = false; peak = -Infinity; wantGrab = false; return false; }
    const [s, out] = local(pl.pos.x, pl.pos.z);
    // moved further than a fall goes in a frame (put somewhere else): not a fall
    const jumpedTo = Math.hypot(pl.pos.x - lastX, pl.pos.z - lastZ) > 5 + 15 * dt || Math.abs(pl.pos.y - lastY) > 4 + 45 * dt;
    lastX = pl.pos.x; lastY = pl.pos.y; lastZ = pl.pos.z;
    if (jumpedTo) { air = false; peak = -Infinity; flail = 0; }
    // falls
    if (!pl.onGround) {
      if (!air) { air = true; peak = pl.pos.y; yelled = false; flail = 0; }
      peak = Math.max(peak, pl.pos.y);
      const drop = peak - pl.pos.y;
      if (drop > SHORT_FALL && Math.abs(s) < WIDTH && out > -f.back - 2 && out < 30) {
        flail += dt;
        pl.prone = Math.min(1, flail * 3);
        pl.yaw += Math.sin(flail * 9) * dt * 5;
        if (!yelled && drop > 3.5) { yelled = true; SFX.shout(0, 0, seed + L); }
      }
    } else if (air) {
      air = false;
      const drop = peak - pl.pos.y;
      peak = -Infinity;
      if (flail > 0) pl.prone = 0.6;
      flail = 0;
      if (drop > SHORT_FALL && Math.abs(s) < WIDTH + 4 && out > -f.back - 3 && out < 30) fell(pl, drop);
    }
    // grip back on something solid, and the hurt goes after a rest
    if (pl.onGround) {
      grip = Math.min(cap, grip + REST * dt);
      still = pl.speed < 0.5 ? still + dt : 0;
      if (still > 2) cap = Math.min(1, cap + HEAL * dt);
      const k = ledgeAt(pl.pos.x, pl.pos.y, pl.pos.z, true);
      if (k >= 0) reached(k);
      if (k === S() && L < S() && lastOn !== k) w.toast("Walked round? It only counts if you climb it", 3);
      lastOn = k;
    } else lastOn = -1;
    if (cool > 0 || !active) { wantGrab = false; return false; }
    // walking into the face, or E
    const [, iy] = stick(pl);
    const facing = -Math.sin(pl.yaw) * -f.nx + -Math.cos(pl.yaw) * -f.nz;
    const pushing = iy > 0.5 && facing > 0.5;
    if (!(pushing || wantGrab)) return false;
    const ask = wantGrab;
    wantGrab = false;
    // a dropped rope
    for (const k of ropes) {
      const l = route.ledges[k], below = route.ledges[k - 1].y;
      if (Math.hypot(s - l.rope, out - (DEPTH + 0.5)) < 0.9 && pl.pos.y > below - 0.6 && pl.pos.y < l.y - 1.2) {
        mode = M.Rope; rope = k;
        place(pl, l.rope, Math.max(below, pl.pos.y), DEPTH + 0.6);
        SFX.rung();
        return true;
      }
    }
    if (grip < 0.08) { if (ask) w.toast("No grip left: rest on something first", 2); return false; }
    const c = inReach(s, out, pl.pos.y, pl.onGround);
    if (c) { grabbed(c, pl.onGround ? 0 : CATCH_COST); return true; }
    return false;
  }

  function fell(pl: Player, drop: number) {
    SFX.thump();
    SFX.land(true, 1);
    w.dust?.(pl.pos.x, pl.pos.y + 0.1, pl.pos.z, f.nx, f.nz);
    pl.landKick = 0.25;
    const ev = { k: "fall", s: seed, d: Math.round(drop * 10) / 10, x: pl.pos.x, y: pl.pos.y, z: pl.pos.z, l: Math.floor(Math.random() * FALLS.length) };
    w.send("qe", ev);
    job.event!(ev, w.selfId);
    if (drop >= BIG_FALL) {
      mode = M.Out; koVy = 0;
      SFX.groan(0, 0, seed);
    } else {
      cap = Math.max(0.3, cap - HURT);
      grip = Math.min(grip, cap);
      still = 0;
      SFX.grunt(0, 0, seed);
      w.toast(drop > 4.5 ? "Oof. That one hurt: rest on a ledge to get your grip back" : "Ouch", 2);
    }
  }

  const statusLine = () => {
    const out: string[] = [];
    for (const [id, s] of status) {
      const who = id === w.selfId ? "You" : w.nameOf(id);
      if (s.st === "ko") out.push(`${who}: out cold, ${Math.ceil(s.left)}s${s.by ? `, carried by ${s.by === w.selfId ? "you" : w.nameOf(s.by)}` : ""}`);
      else out.push(`${who}: a ghost till a rope comes down`);
    }
    return out.join(" · ");
  };

  // ---- the host ----
  function hostSay(d: Record<string, unknown>) {
    const ev = { ...d, s: seed };
    w.send("qe", ev);
    job.event!(ev, w.selfId);
  }

  function reset() {
    ropes.clear(); status.clear(); cp = 0; L = 0; held = 0;
    carrying = ""; carriedBy = "";
    const pl = body();
    pl.prone = 0;
    if (mode !== M.Free || Math.hypot(pl.pos.x - f.ox, pl.pos.z - f.oz) < NEAR) {
      mode = M.Free; pt = null; rope = -1;
      const [x, z] = P(((hash(w.selfId) % 100) / 100 - 0.5) * WIDTH * 0.6, 4);
      w.moveTo(x, z, Math.atan2(f.nx, f.nz));
    }
    grip = cap = 1;
    drawRopes();
  }

  const job: Job = {
    offer, done: null,
    update(dt) {
      if (dt <= 0) return;
      hook();
      const pl = body();
      if (!pl) return;
      if (pl.cling !== cling) pl.cling = cling;
      for (const s of status.values()) if (s.st === "ko") s.left = Math.max(0, s.left - dt);
      // other climbers' shoulders, crouched for a boost
      const now = performance.now();
      shoulders = [];
      for (const p of w.players()) {
        if (p.id === w.selfId) continue;
        const r = reports.get(p.id);
        if (r && r.c && r.m === M.Free && now - r.t < 1500) shoulders.push([p.x, p.z, p.y + SHOULDERS]);
      }
      // the KO'd and the ghosts, seen
      let n = 0;
      for (const p of w.players()) {
        const s = status.get(p.id);
        if (!s || p.id === w.selfId) continue;
        let m = marks[n];
        if (!m) {
          m = new THREE.Group();
          for (let i = 0; i < 3; i++) m.add(new THREE.Mesh(star, gold));
          m.add(new THREE.Mesh(ghostGeo, mist));
          group.add(m); marks.push(m);
        }
        m.visible = true;
        m.position.set(p.x, p.y + (s.st === "ko" ? 0.5 : 1), p.z);
        m.children.forEach((c, i) => {
          if (i < 3) { c.visible = s.st === "ko"; const a = now / 400 + (i * Math.PI * 2) / 3; c.position.set(Math.cos(a) * 0.4, 0.35, Math.sin(a) * 0.4); c.rotation.y = a * 2; }
          else c.visible = s.st === "ghost";
        });
        n++;
      }
      for (let i = n; i < marks.length; i++) marks[i].visible = false;
      flag.children[1].rotation.y = Math.sin(now / 300) * 0.3;
      // grip on screen
      gripBar(pl);
      // say what I'm doing
      if ((sendT -= dt) <= 0) {
        sendT = SEND;
        if (Math.abs(pl.pos.x - f.ox) < NEAR * 1.5 && Math.abs(pl.pos.z - f.oz) < NEAR * 1.5) {
          const on = mode === M.Free || mode === M.Out ? ledgeAt(pl.pos.x, pl.pos.y, pl.pos.z, pl.onGround) : -1;
          const d = { k: "cs", s: seed, m: mode, g: Math.round(grip * 100) / 100, c: mode === M.Free && pl.crouch > 0.6 && pl.onGround ? 1 : 0, L, on, cy: carrying };
          w.send("qe", d);
          reports.set(w.selfId, { m: d.m, g: d.g, c: d.c, L, on, cy: carrying, t: now });
        }
      }
    },
    host(dt) {
      if (job.done) return;
      if (!fixed) { hostSay({ k: "n", n: Math.max(1, w.players().length) }); }
      const now = performance.now();
      const ids = new Set(w.players().map((p) => p.id));
      for (const id of [...status.keys()]) if (!ids.has(id)) { status.delete(id); hostSay({ k: "gone", id }); }
      for (const [id, s] of status) {
        if (s.st !== "ko") continue;
        if (s.by && (!ids.has(s.by) || status.has(s.by))) { hostSay({ k: "drop", id }); continue; }
        if (s.left <= 0) { hostSay({ k: "out", id }); continue; }
        const r = s.by ? reports.get(s.by) : null;
        if (r && r.on >= 0 && r.on >= cp) hostSay({ k: "up", id, i: r.on });
      }
      // the team's ledge: the highest anyone still climbing has got to
      let top = 0;
      for (const id of ids) if (!status.has(id)) top = Math.max(top, reports.get(id)?.L ?? 0);
      if (top > cp) hostSay({ k: "cp", i: top });
      // everyone down: back to the bottom
      const down = [...ids].every((id) => status.has(id));
      failT = down ? failT + dt : 0;
      if (failT > 2.5) { failT = 0; hostSay({ k: "fail" }); return; }
      // everyone stood at the top
      const all = [...ids].every((id) => { const r = reports.get(id); return !status.has(id) && r && now - r.t < 2000 && r.on === S() && r.L === S(); });
      held = all ? held + dt : 0;
      if (held >= WIN_HOLD && !won) hostSay({ k: "won" });
    },
    event(d, from) {
      if (!d || typeof d !== "object") return;
      const pl = body();
      switch (d.k) {
        case "cs": {
          reports.set(from, { m: +d.m || 0, g: +d.g || 0, c: d.c ? 1 : 0, L: +d.L || 0, on: Number.isFinite(+d.on) ? +d.on : -1, cy: String(d.cy ?? ""), t: performance.now() });
          return;
        }
        case "n": {
          const n = Math.max(1, Math.min(8, Math.floor(+d.n) || 1));
          fixed = true;
          if (n !== route.n) {
            route = routeFor(f, seed, n);
            build();
            if (mode === M.Hang || mode === M.Rope) letGo();
          }
          return;
        }
        case "fall": {
          if (from !== w.selfId) {
            const [dd, pan] = w.hear?.(+d.x, +d.y, +d.z) ?? [0, 0];
            SFX.thump();
            if (+d.d >= BIG_FALL) SFX.groan(dd, pan, seed);
          }
          const who = from === w.selfId ? "You" : w.nameOf(from);
          if (+d.d >= BIG_FALL) w.feed(`<b style="color:${w.colourOf(from)}">${esc(who)}</b> ${FALLS[(+d.l || 0) % FALLS.length]} and ${from === w.selfId ? "are" : "is"} out cold`);
          if (w.isHost && +d.d >= BIG_FALL && !status.has(from)) hostSay({ k: "ko", id: from, t: DOWN_SECS });
          return;
        }
        case "ko": {
          const id = String(d.id);
          status.set(id, { st: "ko", left: +d.t || DOWN_SECS, by: "" });
          if (id === w.selfId) {
            if (mode !== M.Out) { mode = M.Out; koVy = 0; pt = null; }
            if (carrying) { carrying = ""; }
            w.toast(`Out cold. A mate has to carry you up to the ledge the team's on within ${Math.round(+d.t || DOWN_SECS)}s`, 4);
          }
          if (carrying === id) carrying = "";
          return;
        }
        case "pick": {
          const id = String(d.id), s = status.get(id);
          if (w.isHost && s?.st === "ko" && !s.by && !status.has(from) && ![...status.values()].some((o) => o.by === from)) hostSay({ k: "carry", id, by: from });
          return;
        }
        case "help": {
          const id = String(d.id), s = status.get(id), r = reports.get(id);
          if (w.isHost && s?.st === "ko" && !s.by && r && r.on >= cp && r.on >= 0) hostSay({ k: "up", id, i: r.on });
          return;
        }
        case "carry": {
          const id = String(d.id), by = String(d.by), s = status.get(id);
          if (s) s.by = by;
          if (by === w.selfId) { carrying = id; SFX.effort(0, 0, seed); w.toast(`Got ${w.nameOf(id)}. Get them up to ledge ${cp} in time`, 3); }
          if (id === w.selfId) { mode = M.Carried; carriedBy = by; }
          return;
        }
        case "put": {
          if (w.isHost) { const id = String(d.id); if (status.get(id)?.by === from) hostSay({ k: "drop", id }); }
          return;
        }
        case "drop": {
          const id = String(d.id), s = status.get(id);
          if (s) s.by = "";
          if (carrying === id) carrying = "";
          if (id === w.selfId && mode === M.Carried) { mode = M.Out; koVy = 0; carriedBy = ""; }
          return;
        }
        case "up": {
          const id = String(d.id), s = status.get(id), i = +d.i || 0;
          if (s?.by === w.selfId) carrying = "";
          status.delete(id);
          if (id === w.selfId) {
            mode = M.Free; carriedBy = ""; pl.prone = 0; grip = Math.min(grip, 0.5); cap = Math.max(0.5, cap - HURT);
            const l = route.ledges[Math.min(i, S())];
            const [s2] = local(pl.pos.x, pl.pos.z);
            if (i > 0) { L = Math.max(L, i - 1); onto(i, s2); } else { L = Math.max(L, 0); pl.vel.set(0, 0, 0); }
            if (l) w.toast("Back on your feet", 2);
            SFX.checkpoint();
          }
          w.feed(`<b style="color:${w.colourOf(id)}">${esc(id === w.selfId ? "You" : w.nameOf(id))}</b> ${id === w.selfId ? "are" : "is"} back on ${id === w.selfId ? "your" : "their"} feet`);
          return;
        }
        case "out": {
          const id = String(d.id), s = status.get(id);
          if (s?.by === w.selfId) carrying = "";
          status.set(id, { st: "ghost", left: 0, by: "" });
          if (id === w.selfId) { mode = M.Ghost; carriedBy = ""; pl.prone = 0; w.toast("You're out: a ghost, till someone drops a rope from the next ledge", 4); }
          w.feed(`<b style="color:${w.colourOf(id)}">${esc(id === w.selfId ? "You" : w.nameOf(id))}</b> ${id === w.selfId ? "are" : "is"} out`);
          return;
        }
        case "rope": {
          const i = +d.i;
          if (!(i >= 1 && i <= S())) return;
          const fresh = !ropes.has(i);
          ropes.add(i);
          drawRopes();
          if (fresh) {
            const [x, z] = P(route.ledges[i].rope, DEPTH);
            const [dd, pan] = w.hear?.(x, route.ledges[i].y, z) ?? [0, 0];
            SFX.lash(dd, pan);
            w.feed(`<b style="color:${w.colourOf(from)}">${esc(from === w.selfId ? "You" : w.nameOf(from))}</b> dropped a rope from ledge ${i === S() ? "at the top" : i}`);
          }
          if (w.isHost) {
            const ghosts = [...status].filter(([, s]) => s.st === "ghost").map(([id]) => id);
            if (ghosts.length) hostSay({ k: "back", ids: ghosts, i });
          }
          return;
        }
        case "back": {
          const i = Math.min(S(), Math.max(0, +d.i || 0));
          for (const id of Array.isArray(d.ids) ? d.ids.map(String) : []) {
            status.delete(id);
            if (id === w.selfId) {
              mode = M.Free; grip = cap = 1;
              L = Math.max(L, i - 1);
              onto(i, route.ledges[i].rope);
              w.toast("Back in! Up the rope with you", 3);
              SFX.checkpoint();
            }
          }
          return;
        }
        case "pull": {
          if (String(d.id) !== w.selfId || (mode !== M.Hang && mode !== M.Rope && mode !== M.Free)) return;
          const i = Math.min(S(), Math.max(1, +d.i || 1)), l = route.ledges[i];
          const [s, out] = local(pl.pos.x, pl.pos.z);
          if (pl.pos.y < l.y - 4.5 || pl.pos.y > l.y - 0.3) return;
          mode = M.Tween; pt = null; rope = -1;
          tween({ s, y: pl.pos.y, out }, { s: Math.max(l.s0 + 0.4, Math.min(l.s1 - 0.4, +d.ps || s)), y: l.y, out: DEPTH - 0.7 }, PULL_T, () => { L = Math.max(L, i - 1); onto(i, +d.ps || s); });
          w.toast(`${w.nameOf(from)} hauls you up`, 2);
          SFX.effort(0, 0, seed + 1);
          return;
        }
        case "cp": {
          const i = +d.i || 0;
          if (i > cp) { cp = i; SFX.jobStep(); }
          return;
        }
        case "gone": { status.delete(String(d.id)); return; }
        case "fail": {
          fails++;
          w.feed("Everyone's down. Back to the bottom");
          SFX.jobDone(false);
          reset();
          return;
        }
        case "won": {
          if (job.done) return;
          won = true;
          job.done = { won: true, text: `The whole team stood on top of ${f.name}`, x: f.prize[0], z: f.prize[1] };
          release();
          return;
        }
      }
    },
    progress: () => ({ n: route.n, cp, fails, ropes: [...ropes], st: [...status].map(([id, s]) => [id, s.st, Math.round(s.left), s.by]) }),
    restore(p) {
      if (!p || typeof p !== "object") return;
      if (+p.n && +p.n !== route.n) { route = routeFor(f, seed, Math.max(1, Math.min(8, Math.floor(+p.n)))); build(); }
      fixed = true;
      cp = +p.cp || 0; fails = +p.fails || 0;
      ropes.clear();
      for (const i of Array.isArray(p.ropes) ? p.ropes : []) if (+i >= 1 && +i <= S()) ropes.add(+i);
      drawRopes();
      status.clear();
      for (const e of Array.isArray(p.st) ? p.st : []) if (Array.isArray(e) && (e[1] === "ko" || e[1] === "ghost")) status.set(String(e[0]), { st: e[1], left: +e[2] || 0, by: String(e[3] ?? "") });
      const me = status.get(w.selfId);
      if (me?.st === "ghost") mode = M.Ghost;
      else if (me?.st === "ko") mode = me.by ? M.Carried : M.Out;
      if (me?.by) carriedBy = me.by;
    },
    use() {
      const act = action();
      if (!act) return false;
      act.go();
      return true;
    },
    hint() { return action()?.say ?? hang(); },
    card() {
      const mine = status.get(w.selfId);
      const line = mine?.st === "ko" ? `Out cold: ${Math.ceil(mine.left)}s for a mate to carry you up`
        : mine?.st === "ghost" ? "A ghost: wait for a rope from the next ledge"
          : carrying ? `Carry ${w.nameOf(carrying)} up to ${cp ? `ledge ${cp}` : "the foot"}`
            : L >= S() ? "Wait at the top for everyone" : "Get everyone to the top together";
      return {
        line, sub: statusLine() || undefined,
        progress: `Ledge ${cp} / ${S()}`, bar: cp / Math.max(1, S()),
        stage: { key: `cp${cp}:${fails}`, title: cp ? (cp === S() ? "The top!" : `Ledge ${cp}`) : fails ? "Back to the bottom" : "The Climb", sub: cp ? "The team's got this far" : undefined, colour: COLOUR },
      };
    },
    end() {
      release();
      const i = map.floors.indexOf(floor); if (i >= 0) map.floors.splice(i, 1);
      const k = map.pushers.indexOf(pusher); if (k >= 0) map.pushers.splice(k, 1);
      w.scene.remove(group);
      for (const m of [ledgeMesh, holdMesh, ropeMesh, coilMesh]) m?.dispose();
      for (const d of disposables) d.dispose();
      w.mark("@challenge", null);
      bar?.remove(); bar = null;
    },
  };

  /** Off the face and back to yourself, at the end. */
  function release() {
    const pl = body();
    if (pl?.cling === cling) pl.cling = null;
    if (pl && mode !== M.Free) { pl.prone = 0; pl.onGround = false; }
    mode = M.Free; pt = null; carrying = ""; carriedBy = "";
  }

  /** What E does here, and what to say about it. */
  function action(): { say: string; go: () => void } | null {
    const pl = body();
    if (!pl || job.done) return null;
    if (mode === M.Out || mode === M.Carried || mode === M.Ghost || mode === M.Tween) return null;
    const me = w.me(), E = "<b>E</b>";
    if (carrying) return { say: `${E} Put ${esc(w.nameOf(carrying))} down`, go: () => { w.send("qe", { k: "put", s: seed, id: carrying }); if (w.isHost) job.event!({ k: "put", id: carrying }, w.selfId); } };
    if (Math.abs(me.x - f.ox) > NEAR || Math.abs(me.z - f.oz) > NEAR) return null;
    const on = mode === M.Free ? ledgeAt(me.x, me.y, me.z, pl.onGround) : -1;
    // a mate out cold beside you
    for (const p of w.players()) {
      const s = status.get(p.id);
      if (p.id === w.selfId || s?.st !== "ko" || s.by || Math.hypot(p.x - me.x, p.z - me.z) > 2 || Math.abs(p.y - me.y) > 1.6 || mode !== M.Free) continue;
      const r = reports.get(p.id);
      if (r && r.on >= 0 && r.on >= cp) return { say: `${E} Help ${esc(p.name)} up`, go: () => { const d = { k: "help", s: seed, id: p.id }; w.send("qe", d); if (w.isHost) job.event!(d, w.selfId); } };
      return { say: `${E} Pick ${esc(p.name)} up`, go: () => { const d = { k: "pick", s: seed, id: p.id }; w.send("qe", d); if (w.isHost) job.event!(d, w.selfId); } };
    }
    if (on >= 1) {
      const l = route.ledges[on], [s, out] = local(me.x, me.z);
      // a mate below to haul up
      if (out > DEPTH - 1.2) {
        for (const p of w.players()) {
          if (p.id === w.selfId || status.has(p.id)) continue;
          const [ps, po] = local(p.x, p.z);
          if (p.y < l.y - 4.5 || p.y > l.y - 0.3 || Math.abs(ps - s) > 1.8 || po < -0.5 || po > DEPTH + 3) continue;
          if (ps < l.s0 - 0.5 || ps > l.s1 + 0.5) continue;
          return { say: `${E} Pull ${esc(p.name)} up`, go: () => { grip = Math.max(0, grip - 0.12); const d = { k: "pull", s: seed, id: p.id, i: on, ps: s }; w.send("qe", d); SFX.effort(0, 0, seed + 2); } };
        }
      }
      // the rope coiled on this ledge
      const ghosts = [...status.values()].some((x) => x.st === "ghost");
      if (Math.abs(s - l.rope) < 1.6 && (!ropes.has(on) || (ghosts && on >= cp))) {
        return { say: ropes.has(on) ? `${E} Drop the rope again, for the ghosts` : `${E} Drop a rope for the others`, go: () => { const d = { k: "rope", s: seed, i: on }; w.send("qe", d); job.event!(d, w.selfId); } };
      }
    }
    if (mode === M.Free && grip >= 0.08) {
      const [s, out] = local(me.x, me.z);
      if (inReach(s, out, me.y, pl.onGround)) return { say: `${E} Grab the hold`, go: () => { wantGrab = true; } };
    }
    return null;
  }

  /** The prompt on the face, or at the foot of a gap. */
  function hang(): string {
    const pl = body();
    if (!pl) return "";
    const C = `<b>${keyLabel("KeyC")}</b>`;
    if (mode === M.Hang) return `Move to reach · <b>Space</b> lunge · ${C} let go`;
    if (mode === M.Rope) return `Up or down the rope · ${C} let go`;
    if (mode === M.Ghost) return "You're a ghost: fly about and watch";
    if (mode !== M.Free || !pl.onGround) return "";
    const me = w.me(), k = ledgeAt(me.x, me.y, me.z, true);
    if (k < 0 || k >= S()) return "";
    const [s] = local(me.x, me.z), next = route.holds.find((h) => h.boost && h.y > route.ledges[k].y && h.y < route.ledges[k].y + BOOST_HOLD + 0.1);
    if (next && Math.abs(next.s - s) < 2.5 && !ropes.has(k + 1)) return `Out of reach: a mate crouches (${C}) and you stand on their shoulders`;
    return "";
  }

  // ---- the grip meter ----
  let bar: HTMLDivElement | null = null;
  function gripBar(pl: Player | undefined) {
    const show = !!pl && (mode === M.Hang || mode === M.Rope || grip < cap - 0.02 || cap < 0.99) && Math.abs(pl.pos.x - f.ox) < NEAR && Math.abs(pl.pos.z - f.oz) < NEAR;
    if (!show) { if (bar) bar.style.display = "none"; return; }
    if (!bar) {
      bar = document.createElement("div");
      bar.style.cssText = "position:fixed;left:50%;top:calc(50% + 30px);transform:translateX(-50%);width:96px;height:6px;background:rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.5);pointer-events:none;z-index:5";
      bar.innerHTML = `<div style="position:absolute;left:0;top:0;bottom:0;background:#e9e1cf"></div><div style="position:absolute;top:0;bottom:0;right:0;background:rgba(160,40,30,.7)"></div>`;
      document.body.appendChild(bar);
    }
    bar.style.display = "block";
    const fill = bar.children[0] as HTMLDivElement, hurt = bar.children[1] as HTMLDivElement;
    fill.style.width = `${Math.max(0, grip) * 100}%`;
    fill.style.background = grip < 0.25 ? (Math.floor(performance.now() / 150) % 2 ? "#ff6a4a" : "#ffd0a0") : "#e9e1cf";
    hurt.style.width = `${(1 - cap) * 100}%`;
  }

  w.mark("@challenge", { x: f.ox + f.nx * 3, z: f.oz + f.nz * 3, y: f.y0 }, offer.title, COLOUR);
  // for tools/climb_team_probe.mjs
  Object.assign(job, { probe: { face: f, route: () => route, mode: () => mode, grip: () => grip, cap: () => cap, L: () => L, cp: () => cp, status: () => [...status], ropes: () => [...ropes], carrying: () => carrying, hurry: () => { for (const x of status.values()) x.left = Math.min(x.left, 0.5); }, P, local } });
  return job;
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function inRing(r: number[][], x: number, y: number) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    if ((r[i][1] > y) !== (r[j][1] > y) && x < ((r[j][0] - r[i][0]) * (y - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) inside = !inside;
  }
  return inside;
}
