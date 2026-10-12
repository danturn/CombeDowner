// The mine generator: a whole level from a seed, so every player builds the same one and the host
// only has to send a number.
//
// It copies how the real Combe Down workings were cut. Quarrymen followed the good bed of stone in
// "pillar and stall" workings: wide rooms (stalls) with square pillars of stone left standing to hold
// the roof up, joined by low, narrow roadways (headings). Some pillars were robbed for their stone,
// some roofs fell in, and old waste stone was stacked against the walls. A level is a grid of 2 m
// cells; each open cell has its own roof height.

export const CELL = 2;

export type MobKind = "ghoul" | "bat" | "golem" | "blob" | "grout";
export interface Spawn { id: number; kind: MobKind; x: number; z: number }
export interface Chest { id: number; i: number; j: number; item: string }
export interface Lever { id: number; i: number; j: number; nx: number; nz: number }   // n: the way it faces (into the room)
export interface Room { i0: number; j0: number; i1: number; j1: number; kind: "stall" | "cavern" | "start" }
export interface Level {
  seed: number; depth: number; w: number; h: number;
  open: Uint8Array;        // 1 where you can walk
  roof: Float32Array;      // roof height of each open cell, metres
  rooms: Room[];
  start: { x: number; z: number; yaw: number };
  exit: { i: number; j: number };   // the winze (a shaft down), or the way out on the last level
  levers: Lever[];
  chests: Chest[];
  spawns: Spawn[];
  lamps: number[][];       // x, y, z of candles left in niches
  blocks: number[][];      // stacked stone blocks: x, z, size, height (decoration you can't walk through)
  marks: { x: number; z: number; nx: number; nz: number; text: string }[];   // quarrymen's graffiti
  name: string;
  boss: boolean;
}

export const DEPTHS = 3;
export const LEVEL_NAMES = ["The Firs Mine", "Byfield Mine", "The Deep Workings"];

/** Small fast seeded random numbers (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Relics turn up in chests. Kept here (not items.ts) so the generator stays free of any 3D code.
export const CHEST_ITEMS = ["davy", "hobnails", "lardy", "oliver", "ammonite", "sledge", "saw", "lucozade",
  "fizz", "bat", "blackdog", "mason", "echo", "tea"];

// Initials and dates like the ones quarrymen scratched and smoked onto the real mine walls.
const NAMES = ["J.B", "W.S", "T.H", "R.A", "G.P", "H.M", "J.T", "S.C", "E.W", "J.K"];

export function generate(seed: number, depth: number): Level {
  const r = rng(seed * 7919 + depth * 104729);
  const ri = (a: number, b: number) => a + Math.floor(r() * (b - a + 1));
  const boss = depth === DEPTHS;
  const w = boss ? 50 : 56, h = boss ? 50 : 56;
  const open = new Uint8Array(w * h);
  const roof = new Float32Array(w * h);
  const at = (i: number, j: number) => j * w + i;
  const inside = (i: number, j: number) => i > 0 && j > 0 && i < w - 1 && j < h - 1;
  const dig = (i: number, j: number, rf: number) => {
    if (!inside(i, j)) return;
    const k = at(i, j);
    if (!open[k]) { open[k] = 1; roof[k] = rf; } else roof[k] = Math.max(roof[k], rf);
  };

  // ---- rooms ---------------------------------------------------------------------------------
  const rooms: Room[] = [];
  const fits = (a: Room) => rooms.every((b) => a.i1 + 2 < b.i0 || b.i1 + 2 < a.i0 || a.j1 + 2 < b.j0 || b.j1 + 2 < a.j0);
  // the room you arrive in
  const s0 = { i0: ri(3, 8), j0: ri(3, 8) } as Room;
  s0.i1 = s0.i0 + 5; s0.j1 = s0.j0 + 5; s0.kind = "start";
  rooms.push(s0);
  // the boss's cavern goes in the far corner
  if (boss) rooms.push({ i0: w - 22, j0: h - 22, i1: w - 4, j1: h - 4, kind: "cavern" });
  const want = boss ? 6 : ri(8, 10);
  for (let tries = 0; rooms.length < want && tries < 400; tries++) {
    const cavern = r() < 0.2;
    const rw = cavern ? ri(6, 9) : ri(7, 14), rh = cavern ? ri(6, 9) : ri(7, 14);
    const a: Room = { i0: ri(2, w - rw - 3), j0: ri(2, h - rh - 3), i1: 0, j1: 0, kind: cavern ? "cavern" : "stall" };
    a.i1 = a.i0 + rw; a.j1 = a.j0 + rh;
    if (fits(a)) rooms.push(a);
  }
  for (const a of rooms) {
    if (a.kind === "cavern") {
      // a roof fall: a rough blob, open to a tall dome
      const cx = (a.i0 + a.i1) / 2, cy = (a.j0 + a.j1) / 2, rx = (a.i1 - a.i0) / 2, ry = (a.j1 - a.j0) / 2;
      const big = rooms.indexOf(a) === 1 && boss;
      for (let j = a.j0; j <= a.j1; j++) for (let i = a.i0; i <= a.i1; i++) {
        const d = Math.hypot((i - cx) / rx, (j - cy) / ry) + (r() - 0.5) * 0.25;
        if (d < 1) dig(i, j, Math.round(((big ? 7.5 : 4.6) - d * (big ? 3 : 1.6) + r() * 0.4) * 2) / 2);
      }
    } else {
      // pillar and stall: open it all, then leave square pillars every third cell
      const rf = a.kind === "start" ? 3 : [2.7, 3, 3.3][Math.floor(r() * 3)];
      for (let j = a.j0; j <= a.j1; j++) for (let i = a.i0; i <= a.i1; i++) dig(i, j, rf);
      if (a.kind === "stall") {
        const pi = ri(0, 2), pj = ri(0, 2), robbed = 0.15 + r() * 0.2;
        for (let j = a.j0 + 1; j < a.j1; j++) for (let i = a.i0 + 1; i < a.i1; i++) {
          if ((i - a.i0 + pi) % 3 === 0 && (j - a.j0 + pj) % 3 === 0 && r() > robbed) open[at(i, j)] = 0;
        }
      }
    }
  }

  // ---- headings joining the rooms ------------------------------------------------------------
  const centre = (a: Room) => [Math.round((a.i0 + a.i1) / 2), Math.round((a.j0 + a.j1) / 2)];
  const heading = (a: Room, b: Room) => {
    let [i, j] = centre(a);
    const [ti, tj] = centre(b);
    const wide = r() < 0.3;
    const rf = r() < 0.5 ? 2.2 : 2.4;
    const horizFirst = r() < 0.5;
    dig(i, j, rf);
    const step = (di: number, dj: number) => {
      i += di; j += dj;
      dig(i, j, rf);
      if (wide) dig(i + (dj ? 1 : 0), j + (di ? 1 : 0), rf);
    };
    // dog-legs, like a heading that followed the stone
    const midI = horizFirst ? ti : i;
    const kink = ri(-3, 3);
    while (i !== midI) step(Math.sign(midI - i), 0);
    if (!horizFirst && kink) for (let k = 0; k < Math.abs(kink) && inside(i + Math.sign(kink), j); k++) step(Math.sign(kink), 0);
    while (j !== tj) step(0, Math.sign(tj - j));
    while (i !== ti) step(Math.sign(ti - i), 0);
  };
  // a spanning tree (nearest unjoined room each time), plus a couple of loops
  const joined = [0];
  const left = rooms.map((_, k) => k).slice(1);
  while (left.length) {
    let best = [0, 0, Infinity];
    for (const a of joined) for (const b of left) {
      const [ai, aj] = centre(rooms[a]), [bi, bj] = centre(rooms[b]);
      const d = Math.abs(ai - bi) + Math.abs(aj - bj);
      if (d < best[2]) best = [a, b, d];
    }
    heading(rooms[best[0]], rooms[best[1]]);
    joined.push(best[1]);
    left.splice(left.indexOf(best[1]), 1);
  }
  for (let k = 0; k < (boss ? 1 : 3); k++) {
    const a = ri(0, rooms.length - 1), b = ri(0, rooms.length - 1);
    if (a !== b && !(boss && (a === 1 || b === 1))) heading(rooms[a], rooms[b]);
  }
  // dead-end side headings to poke about in
  for (let k = 0; k < (boss ? 3 : 7); k++) {
    let i = ri(2, w - 3), j = ri(2, h - 3);
    if (!open[at(i, j)]) continue;
    const [di, dj] = [[1, 0], [-1, 0], [0, 1], [0, -1]][ri(0, 3)];
    for (let n = ri(4, 11); n > 0 && inside(i + di, j + dj); n--) { i += di; j += dj; dig(i, j, 2.2); }
  }

  // ---- keep only what you can reach from the start --------------------------------------------
  const [si, sj] = centre(s0);
  open[at(si, sj)] = 1;
  const dist = flood(open, w, h, si, sj);
  for (let k = 0; k < open.length; k++) if (open[k] && dist[k] < 0) open[k] = 0;

  // ---- the way on, and what's in the way --------------------------------------------------------
  // the winze goes in the far room; on the last level the way out is the boss's cavern
  const roomDist = (a: Room) => dist[at(...(centre(a) as [number, number]))];
  const order = rooms.map((_, k) => k).filter((k) => k > 0 && roomDist(rooms[k]) > 0).sort((a, b) => roomDist(rooms[b]) - roomDist(rooms[a]));
  const exitRoom = boss ? rooms[1] : rooms[order[0]];
  const exit = openCellNear(open, w, ...(centre(exitRoom) as [number, number]));
  // every cell around the winze stays open, so it can be walked round
  for (const [di, dj] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) if (!open[at(exit.i + di, exit.j + dj)]) { open[at(exit.i + di, exit.j + dj)] = 1; roof[at(exit.i + di, exit.j + dj)] = Math.max(2.4, roof[at(exit.i, exit.j)]); }
  roof[at(exit.i, exit.j)] = Math.max(roof[at(exit.i, exit.j)], 3);

  // levers that open the grille over the winze: in other rooms, as far apart as possible
  const levers: Lever[] = [];
  const nLevers = boss ? 0 : depth === 1 ? 2 : 3;
  const leverRooms = order.slice(1).filter((k) => rooms[k] !== exitRoom);
  for (let n = 0; n < nLevers && leverRooms.length; n++) {
    const k = leverRooms.splice(ri(0, Math.min(leverRooms.length - 1, 3)), 1)[0];
    const l = wallSpot(open, w, rooms[k], r);
    if (l) levers.push({ id: levers.length, ...l });
  }

  // chests: one in about every other room, never in the start room
  const chests: Chest[] = [];
  const pool = CHEST_ITEMS.slice();
  for (let k = 1; k < rooms.length; k++) {
    if (rooms[k] === exitRoom && !boss) continue;
    if (k > 1 && r() < 0.45) continue;
    if (boss && k === 1) continue;
    const c = cornerSpot(open, w, rooms[k], r);
    if (!c) continue;
    const item = pool.splice(ri(0, pool.length - 1), 1)[0] ?? "fizz";
    chests.push({ id: chests.length, i: c.i, j: c.j, item });
  }

  // monsters: more and nastier the deeper you go, none where you arrive
  const spawns: Spawn[] = [];
  const add = (kind: MobKind, i: number, j: number) => spawns.push({ id: spawns.length, kind, x: (i + 0.5) * CELL, z: (j + 0.5) * CELL });
  for (let k = 1; k < rooms.length; k++) {
    const a = rooms[k];
    if (boss && k === 1) {
      const [ci, cj] = centre(a);
      add("grout", ci, cj);
      continue;
    }
    const n = ri(1, 2) + depth;
    for (let m = 0; m < n; m++) {
      const c = openCellNear(open, w, ri(a.i0, a.i1), ri(a.j0, a.j1));
      const roll = r();
      const kind: MobKind = depth >= 2 && roll < 0.18 ? "golem" : roll < 0.45 ? "bat" : roll < 0.55 && depth >= 2 ? "blob" : "ghoul";
      add(kind, c.i, c.j);
    }
  }
  // a few bats roosting in the headings
  for (let m = 0; m < 2 + depth; m++) {
    const i = ri(1, w - 2), j = ri(1, h - 2);
    if (open[at(i, j)] && dist[at(i, j)] > 12) add("bat", i, j);
  }

  // candles in niches, stacked blocks, graffiti
  const lamps: number[][] = [];
  const blocks: number[][] = [];
  const marks: Level["marks"] = [];
  for (const a of rooms) {
    for (let n = a.kind === "start" ? 2 : ri(0, 2); n > 0; n--) {
      const l = wallSpot(open, w, a, r);
      if (l) lamps.push([(l.i + 0.5 - l.nx * 0.42) * CELL, 1.55 + r() * 0.3, (l.j + 0.5 - l.nz * 0.42) * CELL]);
    }
    if (a.kind === "stall" && r() < 0.6) {
      const c = cornerSpot(open, w, a, r);
      if (c && !(c.i === exit.i && c.j === exit.j) && !chests.some((ch) => ch.i === c.i && ch.j === c.j)) {
        blocks.push([(c.i + 0.5) * CELL, (c.j + 0.5) * CELL, 1.1 + r() * 0.5, ri(1, 3)]);
      }
    }
    if (r() < 0.7) {
      const l = wallSpot(open, w, a, r);
      if (l) marks.push({ x: (l.i + 0.5 - l.nx * 0.99) * CELL, z: (l.j + 0.5 - l.nz * 0.99) * CELL, nx: l.nx, nz: l.nz,
        text: `${NAMES[ri(0, NAMES.length - 1)]} ${ri(1760, 1858)}` });
    }
  }
  // the winze has a lamp by it so you can see the goal from across the room
  lamps.push([(exit.i + 0.5) * CELL + 0.8, 2, (exit.j + 0.5) * CELL + 0.8]);
  // blocks are solid: don't let one sit in a doorway and cut the level in two
  for (let k = blocks.length - 1; k >= 0; k--) {
    const i = Math.floor(blocks[k][0] / CELL), j = Math.floor(blocks[k][1] / CELL);
    open[at(i, j)] = 0;
    const d = flood(open, w, h, si, sj);
    const cut = [...Array(open.length).keys()].some((q) => open[q] && d[q] < 0);
    open[at(i, j)] = 1;
    if (cut) blocks.splice(k, 1);
  }

  return {
    seed, depth, w, h, open, roof, rooms, exit, levers, chests, spawns, lamps, blocks, marks, boss,
    start: { x: (si + 0.5) * CELL, z: (sj + 0.5) * CELL, yaw: 0 },
    name: LEVEL_NAMES[depth - 1] ?? `Level ${depth}`,
  };
}

/** Steps from (si, sj) to every open cell, or -1 where it can't be reached. */
export function flood(open: Uint8Array, w: number, h: number, si: number, sj: number): Int32Array {
  const dist = new Int32Array(w * h).fill(-1);
  const q = [sj * w + si];
  dist[q[0]] = 0;
  for (let n = 0; n < q.length; n++) {
    const k = q[n], i = k % w, j = (k - i) / w;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= w || jj >= h) continue;
      const kk = jj * w + ii;
      if (open[kk] && dist[kk] < 0) { dist[kk] = dist[k] + 1; q.push(kk); }
    }
  }
  return dist;
}

function openCellNear(open: Uint8Array, w: number, i: number, j: number) {
  for (let rad = 0; rad < 20; rad++) for (let dj = -rad; dj <= rad; dj++) for (let di = -rad; di <= rad; di++) {
    const ii = i + di, jj = j + dj;
    if (ii >= 0 && jj >= 0 && ii < w && jj * w + ii < open.length && open[jj * w + ii]) return { i: ii, j: jj };
  }
  return { i, j };
}

/** An open cell in the room with rock on one side: somewhere to fix a lever or a candle. */
function wallSpot(open: Uint8Array, w: number, a: Room, r: () => number) {
  for (let t = 0; t < 60; t++) {
    const i = a.i0 + Math.floor(r() * (a.i1 - a.i0 + 1)), j = a.j0 + Math.floor(r() * (a.j1 - a.j0 + 1));
    if (!open[j * w + i]) continue;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!open[(j + dj) * w + i + di] && open[(j - dj) * w + i - di]) return { i, j, nx: -di, nz: -dj };
    }
  }
  return null;
}

/** An open cell in the room with rock on two sides. */
function cornerSpot(open: Uint8Array, w: number, a: Room, r: () => number) {
  for (let t = 0; t < 80; t++) {
    const i = a.i0 + Math.floor(r() * (a.i1 - a.i0 + 1)), j = a.j0 + Math.floor(r() * (a.j1 - a.j0 + 1));
    if (!open[j * w + i]) continue;
    const walls = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([di, dj]) => !open[(j + dj) * w + i + di]).length;
    if (walls >= 2) return { i, j };
  }
  return wallSpot(open, w, a, r);
}
