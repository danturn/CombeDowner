// The mine generator: a whole level from a seed, so every player builds the same one and the host
// only has to send a number.
//
// It copies how the real Combe Down workings were cut. Quarrymen followed the good bed of stone in
// "pillar and stall" workings: wide rooms (stalls) with square pillars of stone left standing to hold
// the roof up, joined by low, narrow roadways (headings). Some pillars were robbed for their stone,
// some roofs fell in, and old waste stone was stacked against the walls. A level is a grid of 2 m
// cells; each open cell has its own roof height.
//
// Each room gets a theme (a masons' workshop, a pit-pony stable, a wet grotto...) that picks its rock,
// its floor and what's left lying about. The way down is shut until the level's puzzles are solved.

export const CELL = 2;

export type MobKind = "ghoul" | "bat" | "golem" | "blob" | "grout" | "rat" | "headless" | "reaper" | "gazer" | "spider" | "wisp";
/** need: how many players there have to be before this one turns up. champ: it carries the foreman's key. */
export interface Spawn { id: number; kind: MobKind; x: number; z: number; need: number; champ?: boolean }
export interface Chest { id: number; i: number; j: number; item: string }
export type Theme = "start" | "stall" | "cavern" | "workshop" | "stable" | "gallery" | "collapse" | "ochre" | "wet" | "crystal" | "chapel" | "lair" | "lava" | "ice";
export interface Room { i0: number; j0: number; i1: number; j1: number; kind: "stall" | "cavern" | "start" | "gallery"; theme: Theme }

export type PuzzleKind = "levers" | "plates" | "block" | "bells" | "dials" | "candles" | "key" | "secret" | "flood" | "riddle";
/** Wall-mounted things are [x, z, nx, nz]: a point on the rock face and the way it faces (into the room). */
export interface Puzzle {
  id: number; kind: PuzzleKind; room: number;
  pts: number[][];     // where its parts are (see each kind in puzzles.ts)
  code: number[];      // bell order, dial digits, the riddle's answer...
  text: string[];      // a riddle or a clue
  clue?: number[];     // [x, z, nx, nz] of a clue somewhere else on the level
  cells: number[];     // cells it changes: flooded cells, the secret door and what's behind it
  items: string[];     // the riddle's offerings
}
export const PUZZLE_KINDS: PuzzleKind[] = ["levers", "plates", "block", "bells", "dials", "candles", "key", "secret", "flood", "riddle"];

/** Scenery: t picks the model (see props.ts). solid: it fills its cell. */
export interface Prop { t: string; x: number; z: number; yaw?: number; s?: number; y?: number; x1?: number; z1?: number; seed?: number; solid?: boolean }

export const ROCKS = ["oolite", "ochre", "soot", "flow", "fossil", "spar"] as const;
export const FLOORS = ["dust", "mud", "rubble", "boards", "straw"] as const;

export interface Level {
  seed: number; depth: number; w: number; h: number;
  open: Uint8Array;        // 1 where you can walk (or could, once a puzzle is solved)
  roof: Float32Array;      // roof height of each open cell, metres
  rock: Uint8Array;        // which ROCKS each cell's walls are
  floor: Uint8Array;       // which FLOORS each cell's floor is
  fl: Float32Array;        // how high each cell's floor is, metres (steps are 0.45 m)
  surf: Uint8Array;        // 0 rock, 1 lava (burns), 2 ice (slippery)
  rooms: Room[];
  start: { x: number; z: number; yaw: number };
  exit: { i: number; j: number };   // the winze (a shaft down), or the way out on the last level
  puzzles: Puzzle[];
  chests: Chest[];
  spawns: Spawn[];
  lamps: number[][];       // x, y, z of candles left in niches
  blocks: number[][];      // stacked stone blocks: x, z, size, height (decoration you can't walk through)
  marks: { x: number; z: number; nx: number; nz: number; text: string }[];   // quarrymen's graffiti
  props: Prop[];
  name: string;
  boss: boolean;
}

export const DEPTHS = 3;
export const LEVEL_NAMES = ["The Firs Mine", "Byfield Mine", "The Deep Workings"];
const PUZZLES_AT = [2, 3, 1];   // puzzles on each level

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

/** Riddles for the riddle puzzle: the answer, then the lines carved on the tablet. */
export const RIDDLES: [string, string[]][] = [
  ["candle", ["My life is short and my tears are wax.", "I work in the dark and die in a draught."]],
  ["pint", ["Drawn at the King William, carried down here,", "I warm a quarryman better than coal."]],
  ["ammonite", ["I swam in a sea before Bath was stone.", "Now I lie coiled, and the sea is gone."]],
  ["key", ["I have teeth but I never bite.", "Turn me, and what was shut is open."]],
  ["pick", ["I bit this hill for a hundred years", "and never swallowed a crumb."]],
  ["bell", ["I have a tongue but I cannot taste.", "I call the men up when the shift is done."]],
  ["bone", ["Once I walked these headings.", "Now I lie still, and the rats know me."]],
  ["stone", ["I was cut here, squared and hauled away,", "and now I hold up the Royal Crescent."]],
];
export const OFFERINGS = ["candle", "pint", "ammonite", "key", "pick", "bell", "bone", "stone"];

// What lives where. Each room gets one or more of these groups; deeper levels have nastier ones.
const GROUPS: MobKind[][][] = [
  [["rat", "rat", "rat"], ["ghoul", "ghoul"], ["ghoul", "bat"], ["spider"], ["bat", "bat"], ["headless"], ["rat", "rat", "ghoul"]],
  [["headless", "ghoul"], ["gazer"], ["reaper"], ["spider", "spider"], ["wisp", "wisp"], ["golem"], ["rat", "rat", "rat", "rat"], ["ghoul", "ghoul", "bat"], ["gazer", "bat"]],
  [["golem", "ghoul"], ["reaper", "wisp"], ["gazer", "gazer"], ["headless", "headless"], ["spider", "spider", "spider"], ["wisp", "wisp", "wisp"], ["blob", "blob", "blob"], ["reaper"]],
];
// some rooms draw their monsters from their own list
const HAUNTS: Partial<Record<Theme, MobKind[][]>> = {
  stable: [["rat", "rat", "rat", "rat"], ["rat", "rat", "headless"]],
  wet: [["spider", "spider"], ["spider", "bat", "bat"]],
  crystal: [["wisp", "wisp"], ["gazer", "wisp"]],
  workshop: [["golem"], ["ghoul", "ghoul", "ghoul"]],
  chapel: [["ghoul", "ghoul"], ["headless"]],
};
const SINGLES: MobKind[][] = [["ghoul", "bat", "rat", "spider"], ["ghoul", "headless", "spider", "gazer", "wisp", "bat"], ["headless", "gazer", "wisp", "reaper", "golem"]];
const CHAMPS: MobKind[][] = [["headless", "ghoul"], ["headless", "reaper", "golem"], ["golem", "reaper"]];

const ROCK_OF: Record<Theme, (typeof ROCKS)[number][]> = {
  start: ["oolite"], stall: ["oolite", "fossil"], cavern: ["oolite", "fossil"], workshop: ["soot"], stable: ["oolite"],
  gallery: ["oolite", "ochre"], collapse: ["oolite"], ochre: ["ochre"], wet: ["flow"], crystal: ["spar"], chapel: ["soot"], lair: ["flow"], lava: ["soot", "ochre"], ice: ["flow", "spar"],
};
const FLOOR_OF: Record<Theme, (typeof FLOORS)[number]> = {
  start: "dust", stall: "dust", cavern: "rubble", workshop: "boards", stable: "straw", gallery: "dust",
  collapse: "rubble", ochre: "mud", wet: "mud", crystal: "dust", chapel: "dust", lair: "mud", lava: "rubble", ice: "dust",
};
export const STEP = 0.45;   // the most you can step up without jumping

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function generate(seed: number, depth: number): Level {
  const r = rng(seed * 7919 + depth * 104729);
  const ri = (a: number, b: number) => a + Math.floor(r() * (b - a + 1));
  const pick = <T>(a: T[]) => a[Math.floor(r() * a.length)];
  const boss = depth === DEPTHS;
  const w = boss ? 50 : 58, h = boss ? 50 : 58;
  const open = new Uint8Array(w * h);
  const roof = new Float32Array(w * h);
  const rock = new Uint8Array(w * h).fill(depth === 3 ? ROCKS.indexOf("soot") : 0);
  const floor = new Uint8Array(w * h);
  const at = (i: number, j: number) => j * w + i;
  const inside = (i: number, j: number) => i > 0 && j > 0 && i < w - 1 && j < h - 1;
  const dig = (i: number, j: number, rf: number) => {
    if (!inside(i, j)) return;
    const k = at(i, j);
    if (!open[k]) { open[k] = 1; roof[k] = rf; } else roof[k] = Math.max(roof[k], rf);
  };
  const props: Prop[] = [];
  const P = (t: string, i: number, j: number, o: Partial<Prop> = {}) => props.push({ t, x: (i + 0.5) * CELL, z: (j + 0.5) * CELL, seed: ri(1, 1e6), ...o });

  // ---- rooms ---------------------------------------------------------------------------------
  const rooms: Room[] = [];
  const fits = (a: Room) => rooms.every((b) => a.i1 + 2 < b.i0 || b.i1 + 2 < a.i0 || a.j1 + 2 < b.j0 || b.j1 + 2 < a.j0);
  // the room you arrive in
  const s0 = { i0: ri(3, 8), j0: ri(3, 8), kind: "start", theme: "start" } as Room;
  s0.i1 = s0.i0 + 5; s0.j1 = s0.j0 + 5;
  rooms.push(s0);
  // the boss's cavern goes in the far corner
  if (boss) rooms.push({ i0: w - 22, j0: h - 22, i1: w - 4, j1: h - 4, kind: "cavern", theme: "lair" });
  const want = boss ? 7 : ri(9, 11);
  for (let tries = 0; rooms.length < want && tries < 500; tries++) {
    const roll = r();
    const kind: Room["kind"] = roll < 0.22 ? "cavern" : roll < 0.4 ? "gallery" : "stall";
    let rw: number, rh: number;
    if (kind === "cavern") { rw = ri(6, 10); rh = ri(6, 10); }
    else if (kind === "gallery") { const long = ri(10, 15), thin = ri(2, 3); [rw, rh] = r() < 0.5 ? [long, thin] : [thin, long]; }
    else { rw = ri(7, 14); rh = ri(7, 14); }
    const a: Room = { i0: ri(2, w - rw - 3), j0: ri(2, h - rh - 3), i1: 0, j1: 0, kind, theme: "stall" };
    a.i1 = a.i0 + rw; a.j1 = a.j0 + rh;
    if (fits(a)) rooms.push(a);
  }
  // themes: what each room was used for, or what's happened to it since
  for (const a of rooms) {
    if (a.kind === "start" || a.theme === "lair") continue;
    if (a.kind === "cavern") a.theme = pick(depth > 1 ? ["cavern", "wet", "crystal", "lava", "lava", "ice"] : ["cavern", "wet", "crystal", "lava", "ice"]);
    else if (a.kind === "gallery") a.theme = "gallery";
    else a.theme = pick(["stall", "stall", "workshop", "stable", "collapse", "ochre", depth > 1 ? "collapse" : "stall"]);
  }
  for (const a of rooms) {
    const big = a.theme === "lair";
    if (a.kind === "cavern") {
      // a roof fall: a rough blob, open to a tall dome
      const cx = (a.i0 + a.i1) / 2, cy = (a.j0 + a.j1) / 2, rx = (a.i1 - a.i0) / 2, ry = (a.j1 - a.j0) / 2;
      for (let j = a.j0; j <= a.j1; j++) for (let i = a.i0; i <= a.i1; i++) {
        const d = Math.hypot((i - cx) / rx, (j - cy) / ry) + (r() - 0.5) * 0.25;
        if (d < 1) dig(i, j, Math.round(((big ? 7.5 : 4.6) - d * (big ? 3 : 1.6) + r() * 0.4) * 2) / 2);
      }
    } else if (a.kind === "gallery") {
      // a long working propped with timber
      const rf = ri(0, 1) ? 2.6 : 2.9;
      for (let j = a.j0; j <= a.j1; j++) for (let i = a.i0; i <= a.i1; i++) dig(i, j, rf);
    } else {
      // pillar and stall: open it all, then leave pillars on a grid. Every third cell, or big 2x2
      // pillars every fourth. The roof sags a little between them.
      const base = a.kind === "start" ? 3 : [2.7, 3, 3.3][Math.floor(r() * 3)];
      const ph = r() * 6, sag = a.kind === "start" ? 0 : 0.3;
      for (let j = a.j0; j <= a.j1; j++) for (let i = a.i0; i <= a.i1; i++) dig(i, j, Math.round((base + sag * Math.sin(i * 0.9 + ph) * Math.cos(j * 0.7 + ph)) * 4) / 4);
      if (a.kind === "stall") {
        const big4 = r() < 0.35, step = big4 ? 4 : 3;
        const pi = ri(0, step - 1), pj = ri(0, step - 1), robbed = 0.15 + r() * 0.2;
        for (let j = a.j0 + 1; j < a.j1; j++) for (let i = a.i0 + 1; i < a.i1; i++) {
          if ((i - a.i0 + pi) % step !== 0 || (j - a.j0 + pj) % step !== 0) continue;
          if (r() < robbed) { if (r() < 0.6) P("rubble", i, j, { s: 0.9 }); continue; }
          open[at(i, j)] = 0;
          if (big4 && i + 1 < a.i1 && j + 1 < a.j1) { open[at(i + 1, j)] = 0; open[at(i, j + 1)] = 0; open[at(i + 1, j + 1)] = 0; }
        }
      }
      if (a.theme === "collapse") {
        // falls of roof: heaps of stone, the roof low and broken round them
        for (let n = ri(1, 3); n > 0; n--) {
          const ci = ri(a.i0 + 1, a.i1 - 1), cj = ri(a.j0 + 1, a.j1 - 1);
          for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
            if (!inside(i, j) || !open[at(i, j)]) continue;
            if (i === ci && j === cj && r() < 0.6) open[at(i, j)] = 0;
            else { roof[at(i, j)] = 2.2 + r() * 0.3; P("rubble", i, j, { s: 0.8 + r() * 0.5 }); }
          }
        }
      }
    }
  }

  // ---- headings joining the rooms ------------------------------------------------------------
  const centre = (a: Room) => [Math.round((a.i0 + a.i1) / 2), Math.round((a.j0 + a.j1) / 2)];
  const runs: number[][] = [];   // straight stretches of heading, for tramway rails
  const heading = (a: Room, b: Room) => {
    let [i, j] = centre(a);
    const [ti, tj] = centre(b);
    const wide = r() < 0.3;
    const rf = r() < 0.5 ? 2.2 : 2.4;
    const horizFirst = r() < 0.5;
    dig(i, j, rf);
    let run = [i, j];
    const step = (di: number, dj: number) => {
      i += di; j += dj;
      dig(i, j, rf);
      if (wide) dig(i + (dj ? 1 : 0), j + (di ? 1 : 0), rf);
    };
    const end = () => { if (Math.abs(run[0] - i) + Math.abs(run[1] - j) >= 5) runs.push([run[0], run[1], i, j]); run = [i, j]; };
    // dog-legs, like a heading that followed the stone
    const midI = horizFirst ? ti : i;
    const kink = ri(-3, 3);
    while (i !== midI) step(Math.sign(midI - i), 0);
    end();
    if (!horizFirst && kink) { for (let k = 0; k < Math.abs(kink) && inside(i + Math.sign(kink), j); k++) step(Math.sign(kink), 0); end(); }
    while (j !== tj) step(0, Math.sign(tj - j));
    end();
    while (i !== ti) step(Math.sign(ti - i), 0);
    end();
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
    const [di, dj] = DIRS[ri(0, 3)];
    for (let n = ri(4, 11); n > 0 && inside(i + di, j + dj); n--) { i += di; j += dj; dig(i, j, 2.2); }
  }

  // ---- keep only what you can reach from the start --------------------------------------------
  const [si, sj] = centre(s0);
  open[at(si, sj)] = 1;
  const dist = flood(open, w, h, si, sj);
  for (let k = 0; k < open.length; k++) if (open[k] && dist[k] < 0) open[k] = 0;
  const roomDist = (a: Room) => dist[at(...(centre(a) as [number, number]))];
  const order = rooms.map((_, k) => k).filter((k) => k > 0 && roomDist(rooms[k]) > 0).sort((a, b) => roomDist(rooms[b]) - roomDist(rooms[a]));
  const exitRoom = boss ? rooms[1] : rooms[order[0]];
  // the winze stands on level ground, not over lava
  if (exitRoom.theme === "lava" || exitRoom.theme === "ice") exitRoom.theme = "cavern";
  const roomOf = new Int16Array(w * h).fill(-1);
  rooms.forEach((a, n) => {
    const rk = ROCKS.indexOf(pick(ROCK_OF[a.theme])), fl = FLOORS.indexOf(FLOOR_OF[a.theme]);
    for (let j = a.j0; j <= a.j1; j++) for (let i = a.i0; i <= a.i1; i++) { roomOf[at(i, j)] = n; rock[at(i, j)] = rk; floor[at(i, j)] = fl; }
  });
  // the rock round a room's edge takes the room's look too, so its walls match
  rooms.forEach((a) => {
    for (let j = a.j0 - 1; j <= a.j1 + 1; j++) for (let i = a.i0 - 1; i <= a.i1 + 1; i++) if (inside(i, j) && !open[at(i, j)] && roomOf[at(i, j)] < 0) rock[at(i, j)] = rock[at(Math.min(a.i1, Math.max(a.i0, i)), Math.min(a.j1, Math.max(a.j0, j)))];
  });
  // ---- floor heights --------------------------------------------------------------------------------
  // Rooms sit higher or lower than each other, with flights of steps down the headings between them.
  // Some stalls have a raised gallery reached by a stair, caverns are terraced bowls or mounds, and
  // the lava and ice caverns have islands. Everything has to stay walkable without jumping (bar the
  // islands), so it's checked, and rooms are flattened where it isn't.
  const fl = new Float32Array(w * h), surf = new Uint8Array(w * h);
  const optional = new Uint8Array(w * h);   // cells you may need to jump to get to
  const islands: number[][] = [];           // [room, cell] of an island with a chest on it
  const dnorm = (a: Room, i: number, j: number) => Math.hypot((i - (a.i0 + a.i1) / 2) / ((a.i1 - a.i0) / 2 + 0.5), (j - (a.j0 + a.j1) / 2) / ((a.j1 - a.j0) / 2 + 0.5));
  const plans = rooms.map((a) => (a.kind === "start" || a.theme === "lair" ? 0 : pick([0, 0, STEP, 2 * STEP, -STEP, -2 * STEP, 3 * STEP])));
  const designs = rooms.map((a) => {
    if (a === exitRoom) return "flat";
    if (a.theme === "lava" || a.theme === "ice") return a.theme;
    if (a.kind === "stall" && Math.max(a.i1 - a.i0, a.j1 - a.j0) >= 9 && r() < 0.5) return "gallery";
    if (a.kind === "cavern" && a.theme !== "lair" && r() < 0.6) return r() < 0.6 ? "bowl" : "mound";
    return "flat";
  });
  const sides = rooms.map(() => [Math.floor(r() * 4), ri(3, 4), r()]);
  // mode 0: as designed; 1: flat, though lava keeps a smaller pool; 2: bare, nothing at all
  const shapeRoom = (n: number, mode: number) => {
    const flat = mode > 0, a = rooms[n], base = flat ? 0 : plans[n];
    const design = mode === 2 || (flat && designs[n] !== "lava") ? "flat" : designs[n];
    for (let j = a.j0; j <= a.j1; j++) for (let i = a.i0; i <= a.i1; i++) {
      const k = at(i, j);
      if (!open[k] || roomOf[k] !== n) continue;
      fl[k] = base; surf[k] = 0; optional[k] = 0;
      const d = dnorm(a, i, j);
      // terraces: one step for every cell and a half in from the edge, so each is a single step
      const ring = Math.max(0, Math.min(3, Math.floor(((1 - d) * Math.min(a.i1 - a.i0, a.j1 - a.j0)) / 2 / 1.5)));
      if (design === "bowl") fl[k] = base - ring * STEP;
      if (design === "mound") fl[k] = base + ring * STEP;
      if (designs[n] === "ice") { surf[k] = 2; fl[k] = flat ? 0 : base - ring * STEP; }
      if (design === "lava" && d < (flat ? 0.5 : 0.62)) { surf[k] = 1; fl[k] = -0.6; optional[k] = 1; }
    }
    if (design === "gallery") {
      // a raised gallery along one side, 1.8 m up, with a stair at one end of its edge
      const [side, deep, at0] = sides[n], H = base + 4 * STEP;
      const along = side < 2 ? [a.j0, a.j1] : [a.i0, a.i1];
      const s0 = along[0] + Math.floor(at0 * (along[1] - along[0]));
      for (let j = a.j0; j <= a.j1; j++) for (let i = a.i0; i <= a.i1; i++) {
        const k = at(i, j);
        if (!open[k] || roomOf[k] !== n) continue;
        const into = side === 0 ? i - a.i0 : side === 1 ? a.i1 - i : side === 2 ? j - a.j0 : a.j1 - j;
        if (into < deep) fl[k] = H;
      }
      // the stair down from it, cut through any pillar in the way
      for (const pos of [s0, s0 + 1]) for (let into = deep; into < deep + 4; into++) {
        const i = side === 0 ? a.i0 + into : side === 1 ? a.i1 - into : pos, j = side < 2 ? pos : side === 2 ? a.j0 + into : a.j1 - into;
        const k = at(i, j);
        if (!inside(i, j) || i < a.i0 || i > a.i1 || j < a.j0 || j > a.j1) continue;
        if (!open[k]) { open[k] = 1; roof[k] = 3; }
        fl[k] = Math.max(base, H - (into - deep + 1) * STEP);
      }
    }
    if (design === "lava" || (design === "ice" && !flat)) {
      // an island in the middle with something on it; over lava, stepping stones out to it
      const ci = Math.round((a.i0 + a.i1) / 2), cj = Math.round((a.j0 + a.j1) / 2);
      for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
        if (!open[at(i, j)]) continue;
        fl[at(i, j)] = design === "ice" ? base + 2 * STEP : 0;
        surf[at(i, j)] = design === "ice" ? 2 : 0;
        optional[at(i, j)] = 1;
      }
      if (!islands.some((x) => x[0] === n)) islands.push([n, at(ci, cj)]);
      if (design === "lava") {
        const [di, dj] = DIRS[sides[n][0]];
        let gap = 0, wide = depth > 1;
        for (let s = 2; s < 14; s++) {
          const i = ci + di * s, j = cj + dj * s;
          if (!open[at(i, j)] || surf[at(i, j)] !== 1) break;
          if (++gap >= (wide ? 3 : 2)) { fl[at(i, j)] = 0; surf[at(i, j)] = 0; gap = 0; wide = false; }
        }
      }
    }
  };
  rooms.forEach((_, n) => shapeRoom(n, 0));
  const heads = [...open.keys()].filter((k) => open[k] && roomOf[k] < 0);
  // Headings take whatever height keeps every step between neighbours a single stair: as high as
  // they could be (hi) and as low (lo), worked out out from the rooms, then halfway between.
  let tight: number[] = [];   // headings too short for the climb between the rooms at their ends
  const relax = () => {
    const hi = new Float32Array(w * h).fill(Infinity), lo = new Float32Array(w * h).fill(-Infinity);
    for (let pass = 0, changed = true; changed && pass < 200; pass++) {
      changed = false;
      for (const k of heads) for (const [di, dj] of DIRS) {
        const n = k + dj * w + di;
        if (!open[n] || surf[n] === 1) continue;
        const nh = roomOf[n] >= 0 ? fl[n] : hi[n], nl = roomOf[n] >= 0 ? fl[n] : lo[n];
        if (nh + STEP < hi[k]) { hi[k] = nh + STEP; changed = true; }
        if (nl - STEP > lo[k]) { lo[k] = nl - STEP; changed = true; }
      }
    }
    tight = heads.filter((k) => hi[k] < lo[k] - 0.01);
    // (rounded down, not to nearest: halfway values rounding opposite ways would leave a double step)
    for (const k of heads) fl[k] = isFinite(hi[k]) && isFinite(lo[k]) ? Math.floor((hi[k] + lo[k]) / 2 / STEP + 1e-3) * STEP : 0;
  };
  /** Cells you can't walk to and back from without jumping. */
  const stranded = () => {
    const ok = (a: number, b: number) => open[b] === 1 && surf[b] !== 1 && fl[b] - fl[a] <= STEP + 0.01;
    const walk = (back: boolean) => {
      const seen = new Uint8Array(w * h), q = [at(si, sj)];
      seen[q[0]] = 1;
      for (let n = 0; n < q.length; n++) for (const [di, dj] of DIRS) {
        const k = q[n], m = k + dj * w + di;
        if (!seen[m] && open[m] && surf[m] !== 1 && (back ? fl[k] - fl[m] <= STEP + 0.01 : ok(k, m))) { seen[m] = 1; q.push(m); }
      }
      return seen;
    };
    const f = walk(false), b = walk(true);
    return [...open.keys()].filter((k) => open[k] && surf[k] !== 1 && !optional[k] && (!f[k] || !b[k]));
  };
  relax();
  for (let tries = 0; tries < 4; tries++) {
    const bad = stranded();
    if (!bad.length) break;
    const fix = new Set(bad.map((k) => roomOf[k]).filter((n) => n >= 0));
    // the rooms at the ends of a heading that's too steep
    const seen = new Uint8Array(w * h), q = tight.slice();
    for (const k of q) seen[k] = 1;
    for (let n = 0; n < q.length; n++) for (const [di, dj] of DIRS) {
      const m = q[n] + dj * w + di;
      if (!open[m] || seen[m]) continue;
      seen[m] = 1;
      if (roomOf[m] >= 0) fix.add(roomOf[m]); else q.push(m);
    }
    // stranded heading: the rooms either side are too far apart in height, so flatten the lot
    if (!fix.size || tries === 3) rooms.forEach((_, n) => fix.add(n));
    // still stuck after two goes: the lava's probably in the way
    if (tries >= 2) designs.forEach((d, n) => d === "lava" && fix.add(n));
    for (const n of fix) shapeRoom(n, tries >= 2 ? 2 : 1);
    relax();
  }
  for (let k = 0; k < open.length; k++) if (open[k]) roof[k] = Math.max(roof[k], fl[k] + 2.3);
  const lavaRooms = new Set(islands.map((x) => x[0]));

  const used = new Uint8Array(w * h);   // cells something important sits in, so scenery keeps clear
  used[at(si, sj)] = 1;
  for (let k = 0; k < open.length; k++) if (surf[k] === 1) used[k] = 1;

  // ---- the way on ---------------------------------------------------------------------------------
  // the winze goes in the far room; on the last level the way out is the boss's cavern
  const exit = openCellNear(open, w, ...(centre(exitRoom) as [number, number]));
  // every cell around the winze stays open, so it can be walked round
  for (const [di, dj] of [[0, 0], ...DIRS]) {
    const k = at(exit.i + di, exit.j + dj);
    if (!open[k]) { open[k] = 1; fl[k] = fl[at(exit.i, exit.j)]; roof[k] = Math.max(fl[k] + 2.4, roof[at(exit.i, exit.j)]); }
    used[k] = 1;
  }
  roof[at(exit.i, exit.j)] = Math.max(roof[at(exit.i, exit.j)], fl[at(exit.i, exit.j)] + 3);

  const lamps: number[][] = [];
  const marks: Level["marks"] = [];
  const spawns: Spawn[] = [];
  const add = (kind: MobKind, i: number, j: number, need = 1, champ = false) => spawns.push({ id: spawns.length, kind, x: (i + 0.5) * CELL, z: (j + 0.5) * CELL, need, champ });
  /** A lamp on the wall beside something, so it can be seen from across the room. */
  const lampBy = (x: number, z: number, nx: number, nz: number) => lamps.push([x + nx * 0.25 + nz * 0.55, 2.0, z + nz * 0.25 - nx * 0.55]);
  const wallPt = (l: { i: number; j: number; nx: number; nz: number }, off = 0.99) => [(l.i + 0.5 - l.nx * off) * CELL, (l.j + 0.5 - l.nz * off) * CELL, l.nx, l.nz];

  // ---- puzzles --------------------------------------------------------------------------------------
  // The kinds are dealt from one shuffle for the whole run (the seed is the run's), so a run doesn't
  // repeat a puzzle; each level takes the next few.
  const deck = shuffle(PUZZLE_KINDS.slice(), rng(seed));
  const dealt = PUZZLES_AT.slice(0, depth - 1).reduce((a, b) => a + b, 0);
  const kinds = deck.slice(dealt, dealt + PUZZLES_AT[depth - 1]);
  const spare = deck.slice(dealt + PUZZLES_AT[depth - 1]).concat(["levers"]);
  // rooms puzzles can go in, furthest first; the start room and the boss's cavern are kept clear
  const free = order.filter((k) => !(boss && k === 1) && !lavaRooms.has(k));
  const others = (k: number) => free.filter((n) => n !== k);
  const puzzles: Puzzle[] = [];
  const takeRoom = (pref: (a: Room) => boolean = () => true) => {
    const k = free.find((n) => pref(rooms[n])) ?? free[0];
    if (k === undefined) return -1;
    free.splice(free.indexOf(k), 1);
    return k;
  };
  const cellsOf = (a: Room) => {
    const out: number[] = [];
    for (let j = a.j0; j <= a.j1; j++) for (let i = a.i0; i <= a.i1; i++) if (open[at(i, j)] && !used[at(i, j)]) out.push(at(i, j));
    return out;
  };
  /** n open cells in a room spread as far apart as they'll go. */
  const spread = (a: Room, n: number, minGap: number) => {
    const cells = cellsOf(a);
    if (!cells.length) return [];
    const got = [cells[Math.floor(r() * cells.length)]];
    while (got.length < n) {
      let best = -1, bd = -1;
      for (const c of cells) {
        const d = Math.min(...got.map((g) => Math.hypot((c % w) - (g % w), Math.floor(c / w) - Math.floor(g / w))));
        if (d > bd) { bd = d; best = c; }
      }
      if (bd < minGap) break;
      got.push(best);
    }
    return got;
  };
  const place = (kind: PuzzleKind): Puzzle | null => {
    const p: Puzzle = { id: puzzles.length, kind, room: -1, pts: [], code: [], text: [], cells: [], items: [] };
    switch (kind) {
      case "levers": {
        // levers in different rooms, as far apart as possible, each with a lamp over it
        const n = depth === 1 ? 2 : 3;
        for (let m = 0; m < n; m++) {
          const k = takeRoom((a) => a !== exitRoom);
          if (k < 0) break;
          if (p.room < 0) p.room = k;
          const l = wallSpot(open, w, rooms[k], r, used);
          if (!l) continue;
          used[at(l.i, l.j)] = 1;
          const pt = wallPt(l, 0.95);
          p.pts.push(pt);
          lampBy(pt[0], pt[1], l.nx, l.nz);
        }
        return p.pts.length ? p : null;
      }
      case "plates": {
        // four plates spread round a room: they have to be held down together
        const k = takeRoom((a) => a.kind !== "gallery");
        if (k < 0) return null;
        p.room = k;
        const cells = spread(rooms[k], 4, 3);
        if (cells.length < 2) return null;
        for (const c of cells) { used[c] = 1; p.pts.push([(c % w + 0.5) * CELL, (Math.floor(c / w) + 0.5) * CELL]); }
        const l = wallSpot(open, w, rooms[k], r, used);
        if (l) { p.clue = wallPt(l); used[at(l.i, l.j)] = 1; }
        return p;
      }
      case "block": {
        // a stone block on runners, and a plate it has to be pushed onto
        const k = takeRoom((a) => a.kind === "stall" || a.kind === "start");
        if (k < 0) return null;
        p.room = k;
        const a = rooms[k];
        for (let t = 0; t < 80; t++) {
          const pi = ri(a.i0 + 1, a.i1 - 1), pj = ri(a.j0 + 1, a.j1 - 1);
          const bi = pi + ri(-3, 3), bj = pj + ri(-3, 3);
          if ((bi === pi && bj === pj) || !open[at(pi, pj)] || !open[at(bi, bj)] || used[at(bi, bj)] || used[at(pi, pj)]) continue;
          if (bi === pi || bj === pj ? Math.abs(bi - pi) + Math.abs(bj - pj) < 2 : false) continue;
          if (fl[at(bi, bj)] !== fl[at(pi, pj)] || !sokoban(open, fl, w, h, bi, bj, pi, pj, a)) continue;
          used[at(pi, pj)] = used[at(bi, bj)] = 1;
          p.pts.push([pi, pj], [bi, bj]);
          break;
        }
        if (!p.pts.length) return null;
        const l = wallSpot(open, w, a, r, used);
        if (l) { p.clue = wallPt(l); used[at(l.i, l.j)] = 1; }
        return p;
      }
      case "bells": {
        // four bells hanging in a row; the order to ring them is carved somewhere else
        const k = takeRoom((a) => a.kind !== "gallery");
        if (k < 0) return null;
        p.room = k;
        const cells = spread(rooms[k], 4, 2);
        if (cells.length < 4) return null;
        for (const c of cells) { used[c] = 1; p.pts.push([(c % w + 0.5) * CELL, (Math.floor(c / w) + 0.5) * CELL]); }
        p.code = shuffle([0, 1, 2, 3], r);
        const elsewhere = others(k);
        const cr = elsewhere.length ? rooms[elsewhere[Math.floor(r() * elsewhere.length)]] : rooms[k];
        const l = wallSpot(open, w, cr, r, used);
        if (l) { p.clue = wallPt(l); used[at(l.i, l.j)] = 1; lampBy(p.clue[0], p.clue[1], l.nx, l.nz); }
        const ROMAN = ["I", "II", "III", "IV"];
        p.text = ["The shift bells were rung", p.code.map((n) => ROMAN[n]).join("  ·  ")];
        return p;
      }
      case "dials": {
        // a powder store with a three-dial lock; the number's scratched on a wall somewhere
        const k = takeRoom();
        if (k < 0) return null;
        p.room = k;
        const l = wallSpot(open, w, rooms[k], r, used);
        if (!l) return null;
        used[at(l.i, l.j)] = 1;
        p.pts.push(wallPt(l));
        lampBy(p.pts[0][0], p.pts[0][1], l.nx, l.nz);
        p.code = [ri(1, 9), ri(0, 9), ri(0, 9)];
        const elsewhere = others(k);
        const cr = elsewhere.length ? rooms[elsewhere[Math.floor(r() * elsewhere.length)]] : rooms[k];
        const c = wallSpot(open, w, cr, r, used);
        if (c) { p.clue = wallPt(c); used[at(c.i, c.j)] = 1; }
        p.text = [`Powder ${p.code.join("")}`];
        return p;
      }
      case "candles": {
        // the miners' chapel: light every candle and keep them all burning at once
        const k = takeRoom((a) => a.kind === "stall" || a.kind === "cavern");
        if (k < 0) return null;
        p.room = k;
        const a = rooms[k];
        a.theme = "chapel";
        const cells = spread(a, 5, 2);
        if (cells.length < 3) return null;
        for (const c of cells) { used[c] = 1; p.pts.push([(c % w + 0.5) * CELL, (Math.floor(c / w) + 0.5) * CELL]); }
        const l = wallSpot(open, w, a, r, used);
        if (l) { p.clue = wallPt(l); used[at(l.i, l.j)] = 1; }
        return p;
      }
      case "key": {
        // the foreman's key: something big is carrying it; the gate it opens is in another room
        const k = takeRoom();
        const g = takeRoom();
        if (k < 0 || g < 0) return null;
        p.room = g;
        const l = wallSpot(open, w, rooms[g], r, used);
        if (!l) return null;
        used[at(l.i, l.j)] = 1;
        p.pts.push(wallPt(l));
        lampBy(p.pts[0][0], p.pts[0][1], l.nx, l.nz);
        const c = openCellNear(open, w, ...(centre(rooms[k]) as [number, number]));
        add(pick(CHAMPS[depth - 1]), c.i, c.j, 1, true);
        p.code = [k];
        return p;
      }
      case "secret": {
        // a loose stone in a wall, and a little chamber behind it
        for (const k of free.slice()) {
          const a = rooms[k];
          for (let t = 0; t < 60; t++) {
            const i = ri(a.i0, a.i1), j = ri(a.j0, a.j1);
            if (!open[at(i, j)] || used[at(i, j)]) continue;
            for (const [di, dj] of DIRS) {
              const cells = [1, 2, 3].map((n) => [i + di * n, j + dj * n]);
              if (!cells.every(([ci, cj]) => inside(ci, cj) && !open[at(ci, cj)])) continue;
              // the chamber mustn't break into anything else
              const lonely = cells.slice(1).every(([ci, cj]) => DIRS.every(([ei, ej]) => {
                const ni = ci + ei, nj = cj + ej;
                return cells.some(([a2, b2]) => a2 === ni && b2 === nj) || (inside(ni, nj) && !open[at(ni, nj)] && !(ni === i && nj === j));
              }));
              if (!lonely) continue;
              free.splice(free.indexOf(k), 1);
              p.room = k;
              for (const [ci, cj] of cells) { open[at(ci, cj)] = 1; fl[at(ci, cj)] = fl[at(i, j)]; roof[at(ci, cj)] = fl[at(i, j)] + 2.2; rock[at(ci, cj)] = rock[at(i, j)]; floor[at(ci, cj)] = FLOORS.indexOf("rubble"); p.cells.push(at(ci, cj)); used[at(ci, cj)] = 1; }
              used[at(i, j)] = 1;
              p.pts.push([(i + 0.5 + di * 0.5) * CELL, (j + 0.5 + dj * 0.5) * CELL, -di, -dj]);
              return p;
            }
          }
        }
        return null;
      }
      case "flood": {
        // a working full of water, and a pump to get it out; anything past it waits till it's dry
        for (const k of free.slice()) {
          const a = rooms[k];
          if (a === exitRoom) continue;
          const cells = cellsOf(a).filter((c) => !used[c]);
          if (cells.length < 12) continue;
          const wet = new Uint8Array(open);
          for (const c of cells) wet[c] = 0;
          const d = flood(wet, w, h, si, sj);
          if (d[at(exit.i, exit.j)] < 0 && cells.includes(at(exit.i, exit.j))) continue;
          // the pump stands on the dry side, as near the start as can be
          let best = -1;
          for (const c of cells) for (const [di, dj] of DIRS) {
            const n = c + dj * w + di;
            if (wet[n] && d[n] > 0 && !used[n] && (best < 0 || d[n] < d[best])) best = n;
          }
          if (best < 0) continue;
          free.splice(free.indexOf(k), 1);
          p.room = k;
          a.theme = "wet";
          for (const c of cells) { p.cells.push(c); floor[c] = FLOORS.indexOf("mud"); rock[c] = ROCKS.indexOf("flow"); }
          used[best] = 1;
          p.pts.push([(best % w + 0.5) * CELL, (Math.floor(best / w) + 0.5) * CELL]);
          lamps.push([(best % w + 0.5) * CELL + 0.6, 2.0, (Math.floor(best / w) + 0.5) * CELL + 0.6]);
          return p;
        }
        return null;
      }
      case "riddle": {
        // a riddle carved on a tablet, and three offerings to choose from
        const k = takeRoom((a) => a.kind !== "gallery");
        if (k < 0) return null;
        p.room = k;
        const l = wallSpot(open, w, rooms[k], r, used);
        if (!l) return null;
        used[at(l.i, l.j)] = 1;
        p.pts.push(wallPt(l));
        lampBy(p.pts[0][0], p.pts[0][1], l.nx, l.nz);
        // the offerings stand in a row in front of the tablet
        const [ans, lines] = RIDDLES[Math.floor(r() * RIDDLES.length)];
        const wrong = shuffle(OFFERINGS.filter((o) => o !== ans), r).slice(0, 2);
        p.items = shuffle([ans, ...wrong], r);
        p.code = [p.items.indexOf(ans)];
        p.text = lines;
        const fx = l.i + l.nx * 1, fz = l.j + l.nz * 1;
        for (let n = -1; n <= 1; n++) {
          const ci = fx + n * Math.abs(l.nz), cj = fz + n * Math.abs(l.nx);
          const ok = open[at(ci, cj)] ? { i: ci, j: cj } : openCellNear(open, w, ci, cj);
          used[at(ok.i, ok.j)] = 1;
          p.pts.push([(ci + 0.5) * CELL - l.nx * 0.4, (cj + 0.5) * CELL - l.nz * 0.4]);
        }
        return p;
      }
    }
  };
  for (const kind of kinds) {
    let p = place(kind);
    while (!p && spare.length) p = place(spare.shift()!);
    if (p) puzzles.push(p);
  }

  // ---- chests: one in about every other room, never in the start room ---------------------------------
  const chests: Chest[] = [];
  const pool = CHEST_ITEMS.slice();
  const item = () => pool.splice(ri(0, pool.length - 1), 1)[0] ?? "fizz";
  for (let k = 1; k < rooms.length; k++) {
    if (rooms[k] === exitRoom && !boss) continue;
    if (k > 1 && r() < 0.45) continue;
    if (boss && k === 1) continue;
    const c = cornerSpot(open, w, rooms[k], r, used);
    if (!c) continue;
    used[at(c.i, c.j)] = 1;
    chests.push({ id: chests.length, i: c.i, j: c.j, item: item() });
  }
  // treasure on the islands, a reward behind the loose stone, and on the far side of the flood
  for (const [, c] of islands) chests.push({ id: chests.length, i: c % w, j: Math.floor(c / w), item: item() });
  for (const p of puzzles) {
    if (p.kind === "secret") { const c = p.cells[2]; chests.push({ id: chests.length, i: c % w, j: Math.floor(c / w), item: item() }); }
    if (p.kind === "flood") {
      const c = p.cells[Math.floor(r() * p.cells.length)];
      chests.push({ id: chests.length, i: c % w, j: Math.floor(c / w), item: item() });
    }
  }

  // ---- monsters: more and nastier the deeper you go, more of them for a bigger party ----------------------
  const wet = new Set(puzzles.filter((p) => p.kind === "flood").flatMap((p) => p.cells));
  for (let k = 1; k < rooms.length; k++) {
    const a = rooms[k];
    const spot = () => {
      for (let t = 0; t < 20; t++) {
        const c = openCellNear(open, w, ri(a.i0, a.i1), ri(a.j0, a.j1));
        if (!wet.has(at(c.i, c.j)) && !used[at(c.i, c.j)]) return c;
      }
      return null;
    };
    if (boss && k === 1) {
      const [ci, cj] = centre(a);
      add("grout", ci, cj);
      continue;
    }
    const group = () => (HAUNTS[a.theme] && r() < 0.5 ? pick(HAUNTS[a.theme]!) : pick(GROUPS[depth - 1]));
    const lots: [MobKind[], number][] = [[group(), 1], [group(), 2], [[pick(SINGLES[depth - 1])], 3], [[pick(SINGLES[depth - 1])], 4]];
    if (depth > 1) lots.push([[pick(SINGLES[depth - 1])], 1]);
    for (const [kinds, need] of lots) for (const kind of kinds) { const c = spot(); if (c) add(kind, c.i, c.j, need); }
  }
  // a few bats roosting in the headings, and rats about
  for (let m = 0; m < 3 + depth; m++) {
    const i = ri(1, w - 2), j = ri(1, h - 2);
    if (open[at(i, j)] && dist[at(i, j)] > 12 && roomOf[at(i, j)] < 0 && !wet.has(at(i, j))) add(m % 2 ? "bat" : "rat", i, j, 1 + (m % 3));
  }

  // ---- scenery ---------------------------------------------------------------------------------------------
  const blocks: number[][] = [];
  const wallAt = (a: Room) => wallSpot(open, w, a, r, used);
  for (const a of rooms) {
    for (let n = a.kind === "start" ? 2 : a.theme === "chapel" ? 0 : ri(1, 2); n > 0; n--) {
      const l = wallAt(a);
      if (l) lamps.push([(l.i + 0.5 - l.nx * 0.42) * CELL, 1.55 + r() * 0.3, (l.j + 0.5 - l.nz * 0.42) * CELL]);
    }
    if ((a.kind === "stall" && r() < 0.6) || a.theme === "workshop") {
      for (let n = a.theme === "workshop" ? 3 : 1; n > 0; n--) {
        const c = cornerSpot(open, w, a, r, used);
        if (c && !(c.i === exit.i && c.j === exit.j)) { used[at(c.i, c.j)] = 1; blocks.push([(c.i + 0.5) * CELL, (c.j + 0.5) * CELL, 1.1 + r() * 0.5, ri(1, 3)]); }
      }
    }
    if (r() < 0.7) {
      const l = wallAt(a);
      if (l) marks.push({ x: (l.i + 0.5 - l.nx * 0.99) * CELL, z: (l.j + 0.5 - l.nz * 0.99) * CELL, nx: l.nx, nz: l.nz, text: `${pick(NAMES)} ${ri(1760, 1858)}` });
    }
    const wallProp = (t: string, solid = false, n = 1) => {
      for (; n > 0; n--) {
        const l = wallAt(a);
        if (!l) return;
        used[at(l.i, l.j)] = 1;
        P(t, l.i, l.j, { yaw: Math.atan2(l.nx, l.nz), x: (l.i + 0.5 - l.nx * 0.45) * CELL, z: (l.j + 0.5 - l.nz * 0.45) * CELL, solid });
      }
    };
    const floorProp = (t: string, n: number, o: Partial<Prop> = {}) => {
      for (; n > 0; n--) {
        const i = ri(a.i0, a.i1), j = ri(a.j0, a.j1);
        if (open[at(i, j)] && !used[at(i, j)] && !wet.has(at(i, j))) P(t, i, j, { yaw: r() * 6.28, ...o, x: (i + 0.2 + r() * 0.6) * CELL, z: (j + 0.2 + r() * 0.6) * CELL });
      }
    };
    switch (a.theme) {
      case "workshop": wallProp("derrick", true); wallProp("saw", true); wallProp("tools", false, 2); floorProp("crate", 2); break;
      case "stable": wallProp("manger", true, 2); floorProp("barrel", 1); wallProp("tools"); floorProp("bones", 1); break;
      case "gallery": {
        // a set of timbers every other cell down the length of it
        const along = a.i1 - a.i0 > a.j1 - a.j0;
        const [ci, cj] = centre(a);
        for (let n = along ? a.i0 : a.j0; n <= (along ? a.i1 : a.j1); n += 2) {
          const i = along ? n : ci, j = along ? cj : n;
          if (open[at(i, j)]) props.push({ t: "props", x: (i + 0.5) * CELL, z: (j + 0.5) * CELL, yaw: along ? Math.PI / 2 : 0 });
        }
        floorProp("truck", 1, { solid: false });
        break;
      }
      case "wet": floorProp("puddle", 5, { s: 0.6 }); floorProp("stal", 6); floorProp("web", 2); break;
      case "crystal": floorProp("crystals", 6); floorProp("stal", 3); break;
      case "collapse": floorProp("rubble", 3, { s: 0.7 }); floorProp("bones", 1); floorProp("truck", 1); break;
      case "ochre": floorProp("puddle", 3, { s: 0.5 }); wallProp("tools"); floorProp("chain", 2); break;
      case "chapel": floorProp("stub", 4); floorProp("bones", 1); break;
      case "cavern": floorProp("rubble", 3, { s: 0.9 }); floorProp("stal", 3); break;
      case "lair": floorProp("bones", 6); floorProp("rubble", 4, { s: 1 }); floorProp("stal", 5); break;
      case "start": wallProp("tools"); floorProp("barrel", 1); floorProp("crate", 1); break;
      default: floorProp("barrel", r() < 0.4 ? 1 : 0); floorProp("web", 1); if (r() < 0.4) wallProp("tools"); break;
    }
  }
  // tramway rails down the longer headings, with the odd truck left on them
  for (const [i0, j0, i1, j1] of shuffle(runs, r).slice(0, boss ? 2 : 5)) {
    if (!open[at(i0, j0)] || !open[at(i1, j1)]) continue;
    props.push({ t: "rails", x: (i0 + 0.5) * CELL, z: (j0 + 0.5) * CELL, x1: (i1 + 0.5) * CELL, z1: (j1 + 0.5) * CELL });
    if (r() < 0.4) {
      const f = 0.3 + r() * 0.4;
      props.push({ t: "truck", x: ((i0 + (i1 - i0) * f) + 0.5) * CELL, z: ((j0 + (j1 - j0) * f) + 0.5) * CELL, yaw: i0 === i1 ? Math.PI / 2 : 0 });
    }
  }
  // cobwebs in heading corners, timbering where a heading's roof is bad
  for (let n = 0; n < 12; n++) {
    const i = ri(1, w - 2), j = ri(1, h - 2);
    if (!open[at(i, j)] || roomOf[at(i, j)] >= 0 || wet.has(at(i, j))) continue;
    const horiz = open[at(i - 1, j)] && open[at(i + 1, j)];
    if (n % 3 === 0) props.push({ t: "props", x: (i + 0.5) * CELL, z: (j + 0.5) * CELL, yaw: horiz ? Math.PI / 2 : 0 });
    else props.push({ t: "web", x: (i + 0.5) * CELL, z: (j + 0.5) * CELL, y: 1.8, yaw: r() * 6.28 });
  }
  // the winze has a lamp by it so you can see the goal from across the room
  lamps.push([(exit.i + 0.5) * CELL + 0.8, 2, (exit.j + 0.5) * CELL + 0.8]);
  // lamps hang at a height above their own floor
  for (const l of lamps) l[1] += fl[at(Math.floor(l[0] / CELL), Math.floor(l[2] / CELL))];
  // lava glows: a few of its own lights (the fourth number marks them)
  for (const [n] of islands) {
    const a = rooms[n];
    if (a.theme !== "lava") continue;
    for (let m = 0; m < 3; m++) {
      const i = ri(a.i0, a.i1), j = ri(a.j0, a.j1);
      if (surf[at(i, j)] === 1) lamps.push([(i + 0.5) * CELL, 0.2, (j + 0.5) * CELL, 1]);
    }
  }

  // solid things mustn't sit in a doorway and cut the level in two
  const blocked = (k: number) => {
    open[k] = 0;
    const d = flood(open, w, h, si, sj);
    const cut = [...Array(open.length).keys()].some((q) => open[q] && d[q] < 0 && !puzzles.some((p) => p.kind === "secret" && p.cells.includes(q)));
    open[k] = 1;
    return cut;
  };
  for (let k = blocks.length - 1; k >= 0; k--) if (blocked(at(Math.floor(blocks[k][0] / CELL), Math.floor(blocks[k][1] / CELL)))) blocks.splice(k, 1);
  for (let k = props.length - 1; k >= 0; k--) if (props[k].solid && blocked(at(Math.floor(props[k].x / CELL), Math.floor(props[k].z / CELL)))) props[k].solid = false;

  return {
    seed, depth, w, h, open, roof, rock, floor, fl, surf, rooms, exit, puzzles, chests, spawns, lamps, blocks, marks, props, boss,
    start: { x: (si + 0.5) * CELL, z: (sj + 0.5) * CELL, yaw: 0 },
    name: LEVEL_NAMES[depth - 1] ?? `Level ${depth}`,
  };
}

function shuffle<T>(a: T[], r: () => number): T[] {
  for (let k = a.length - 1; k > 0; k--) { const n = Math.floor(r() * (k + 1)); [a[k], a[n]] = [a[n], a[k]]; }
  return a;
}

/** Steps from (si, sj) to every open cell, or -1 where it can't be reached. */
export function flood(open: Uint8Array, w: number, h: number, si: number, sj: number): Int32Array {
  const dist = new Int32Array(w * h).fill(-1);
  const q = [sj * w + si];
  dist[q[0]] = 0;
  for (let n = 0; n < q.length; n++) {
    const k = q[n], i = k % w, j = (k - i) / w;
    for (const [di, dj] of DIRS) {
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= w || jj >= h) continue;
      const kk = jj * w + ii;
      if (open[kk] && dist[kk] < 0) { dist[kk] = dist[k] + 1; q.push(kk); }
    }
  }
  return dist;
}

/**
 * Whether a block at (bi, bj) can be pushed onto (pi, pj), staying inside room a. You push a block by
 * standing on one side of it and it slides one cell the other way, so this searches over where the
 * block is and which side of it you can get to.
 */
export function sokoban(open: Uint8Array, fl: Float32Array, w: number, h: number, bi: number, bj: number, pi: number, pj: number, a: { i0: number; j0: number; i1: number; j1: number }): boolean {
  // the block only slides over level floor
  const level = fl[bj * w + bi];
  const inRoom = (i: number, j: number) => i >= a.i0 && j >= a.j0 && i <= a.i1 && j <= a.j1 && open[j * w + i] === 1 && fl[j * w + i] === level;
  const seen = new Set<number>([bj * w + bi]);
  const q = [[bi, bj]];
  for (let n = 0; n < q.length && n < 400; n++) {
    const [i, j] = q[n];
    if (i === pi && j === pj) return true;
    // where you can walk with the block here
    const o = open.slice();
    o[j * w + i] = 0;
    for (const [di, dj] of DIRS) {
      const si = i - di, sj = j - dj, ti = i + di, tj = j + dj;
      if (!inRoom(ti, tj) || !(si >= 0 && sj >= 0 && si < w && sj < h && o[sj * w + si])) continue;
      if (seen.has(tj * w + ti)) continue;
      // can you get round to the pushing side? (from any open cell next to the block)
      const start = DIRS.map(([ei, ej]) => [i + ei, j + ej]).find(([ei, ej]) => o[ej * w + ei]);
      if (!start) continue;
      if (flood(o, w, h, start[0], start[1])[sj * w + si] < 0) continue;
      seen.add(tj * w + ti);
      q.push([ti, tj]);
    }
  }
  return false;
}

function openCellNear(open: Uint8Array, w: number, i: number, j: number) {
  for (let rad = 0; rad < 20; rad++) for (let dj = -rad; dj <= rad; dj++) for (let di = -rad; di <= rad; di++) {
    const ii = i + di, jj = j + dj;
    if (ii >= 0 && jj >= 0 && ii < w && jj * w + ii < open.length && open[jj * w + ii]) return { i: ii, j: jj };
  }
  return { i, j };
}

/** An open cell in the room with rock on one side: somewhere to fix a lever or a candle. */
function wallSpot(open: Uint8Array, w: number, a: Room, r: () => number, used?: Uint8Array) {
  for (let t = 0; t < 80; t++) {
    const i = a.i0 + Math.floor(r() * (a.i1 - a.i0 + 1)), j = a.j0 + Math.floor(r() * (a.j1 - a.j0 + 1));
    if (!open[j * w + i] || used?.[j * w + i]) continue;
    for (const [di, dj] of DIRS) {
      if (!open[(j + dj) * w + i + di] && open[(j - dj) * w + i - di]) return { i, j, nx: -di, nz: -dj };
    }
  }
  return null;
}

/** An open cell in the room with rock on two sides. */
function cornerSpot(open: Uint8Array, w: number, a: Room, r: () => number, used?: Uint8Array) {
  for (let t = 0; t < 80; t++) {
    const i = a.i0 + Math.floor(r() * (a.i1 - a.i0 + 1)), j = a.j0 + Math.floor(r() * (a.j1 - a.j0 + 1));
    if (!open[j * w + i] || used?.[j * w + i]) continue;
    const walls = DIRS.filter(([di, dj]) => !open[(j + dj) * w + i + di]).length;
    if (walls >= 2) return { i, j };
  }
  return wallSpot(open, w, a, r, used);
}
