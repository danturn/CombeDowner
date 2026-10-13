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

export type MobKind = "ghoul" | "bat" | "golem" | "blob" | "grout" | "rat" | "headless" | "reaper" | "gazer" | "spider" | "wisp" | "knocker" | "mimic" | "puffcap" | "centipede" | "beetle" | "drowned" | "wight" | "wraith" | "troll" | "crossbow" | "engine" | "wyrm" | "rime" | "owner";
/** need: how many players there have to be before this one turns up. champ: it carries the foreman's key. mini: a mini-boss guarding the winze. */
export interface Spawn { id: number; kind: MobKind; x: number; z: number; need: number; champ?: boolean; mini?: boolean }
export interface Chest { id: number; i: number; j: number; item: string }
export type Theme = "start" | "stall" | "cavern" | "workshop" | "stable" | "gallery" | "collapse" | "ochre" | "wet" | "crystal" | "chapel" | "lair" | "lava" | "ice"
  | "hall" | "chasm";
export interface Room { i0: number; j0: number; i1: number; j1: number; kind: "stall" | "cavern" | "start" | "gallery" | "hall"; theme: Theme }

export type PuzzleKind = "levers" | "plates" | "block" | "bells" | "dials" | "candles" | "key" | "secret" | "flood" | "riddle"
  | "mirrors" | "gems" | "statues" | "bridge";
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
export const PUZZLE_KINDS: PuzzleKind[] = ["levers", "plates", "block", "bells", "dials", "candles", "key", "secret", "flood", "riddle",
  "mirrors", "gems", "statues", "bridge"];

/**
 * What's happened to this run's mine: picked by the seed, it sways which rooms turn up, what lives in
 * them, the light, and one puzzle you're sure to meet.
 */
export type RunTheme = "flooded" | "burning" | "frozen" | "haunted" | "collapsed";
export const RUN_THEMES: RunTheme[] = ["flooded", "burning", "frozen", "haunted", "collapsed"];
export const RUN_INFO: Record<RunTheme, { name: string; blurb: string; puzzle: PuzzleKind }> = {
  flooded: { name: "The Flooded Mines", blurb: "The pumps stopped years ago and the water's come up", puzzle: "flood" },
  burning: { name: "The Burning Mines", blurb: "Something deep down has caught, and the rock runs hot", puzzle: "bridge" },
  frozen: { name: "The Frozen Mines", blurb: "A cold that shouldn't be here has crept through the workings", puzzle: "mirrors" },
  haunted: { name: "The Haunted Mines", blurb: "The men who never came up are still down here", puzzle: "statues" },
  collapsed: { name: "The Fallen Mines", blurb: "The roof's coming down, and the props won't hold", puzzle: "block" },
};
/** Each kind of run has its own boss waiting at the bottom. */
export const RUN_BOSS: Record<RunTheme, MobKind> = { flooded: "engine", burning: "wyrm", frozen: "rime", haunted: "owner", collapsed: "grout" };
/** And a mini-boss (a big, named one of an ordinary kind) guarding the winze on each level above it. */
export const RUN_MINIS: Record<RunTheme, MobKind[]> = {
  flooded: ["spider", "headless"], burning: ["ghoul", "golem"], frozen: ["spider", "golem"], haunted: ["ghoul", "headless"], collapsed: ["ghoul", "golem"],
};
/** The relic each boss and mini-boss can't stand (items.ts), and a word scratched on the wall about it. */
export const WEAKNESS: Partial<Record<MobKind, string>> = { grout: "vinegar", engine: "spanner", wyrm: "spring", rime: "lampoil", owner: "deeds" };
export const MINI_WEAKNESS: Partial<Record<MobKind, string>> = { spider: "smokepot", ghoul: "gravesalt", headless: "paybook", golem: "mallet" };
const WEAK_WORD: Record<string, string> = { vinegar: "VINEGAR", spanner: "SPANNER", spring: "WATER", lampoil: "OIL", deeds: "DEEDS", smokepot: "SMOKE", gravesalt: "SALT", paybook: "PAYBOOK", mallet: "MALLET" };
/** Which level above the boss its weakness is hidden on. */
export const weakDepth = (seed: number) => 1 + Math.floor(rng(seed * 53 + 0x3ea4)() * 2);
export const runTheme = (seed: number): RunTheme => RUN_THEMES[Math.floor(rng(seed ^ 0x5eed)() * RUN_THEMES.length)];

/** Seeds are written as up to six letters and numbers, so they're easy to read out and type. */
export const seedText = (seed: number) => (seed >>> 0).toString(36).toUpperCase();
export function parseSeed(text: string): number | null {
  const t = text.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 6);
  return t ? parseInt(t, 36) : null;
}

export const GEMS = ["red", "green", "blue"];
const GEM_WORDS = ["blood", "moss", "the sky"];

/** The four ways a mirror can face: the normal of its silvered side, on a diagonal (x, z). */
export const MIRROR_N = [[1, -1], [1, 1], [-1, 1], [-1, -1]];
/**
 * Follow a beam of light from cell (i, j) heading (di, dj), bouncing off mirrors (cell -> facing),
 * until it hits rock (hit: that rock cell) or the back of a mirror (hit: -1). pts: the cells it
 * starts, turns and ends at.
 */
export function traceBeam(open: Uint8Array, w: number, i: number, j: number, di: number, dj: number, mirrors: Map<number, number>) {
  const pts = [[i, j]];
  for (let n = 0; n < 100; n++) {
    const ni = i + di, nj = j + dj, k = nj * w + ni;
    if (!open[k]) { pts.push([ni, nj]); return { pts, hit: k, di, dj }; }
    i = ni; j = nj;
    const o = mirrors.get(k);
    if (o === undefined) continue;
    pts.push([i, j]);
    const [nx, nz] = MIRROR_N[o];
    if (di * nx + dj * nz >= 0) return { pts, hit: -1, di, dj };
    [di, dj] = o % 2 === 0 ? [dj, di] : [-dj, -di];
  }
  return { pts, hit: -1, di, dj };
}
/** Statues face one of four ways (x, z): turning one turns it a quarter, and the next one with it. */
export const FACING = [[0, 1], [1, 0], [0, -1], [-1, 0]];
const cap = (t: string) => t[0].toUpperCase() + t.slice(1);

/** Scenery: t picks the model (see props.ts). solid: it fills its cell. */
export interface Prop { t: string; x: number; z: number; yaw?: number; s?: number; y?: number; x1?: number; z1?: number; seed?: number; solid?: boolean }

export const ROCKS = ["oolite", "ochre", "soot", "flow", "fossil", "spar", "ashlar", "brick"] as const;
export const FLOORS = ["dust", "mud", "rubble", "boards", "straw", "flags"] as const;

export interface Level {
  seed: number; depth: number; w: number; h: number;
  open: Uint8Array;        // 1 where you can walk (or could, once a puzzle is solved)
  roof: Float32Array;      // roof height of each open cell, metres
  rock: Uint8Array;        // which ROCKS each cell's walls are
  floor: Uint8Array;       // which FLOORS each cell's floor is
  fl: Float32Array;        // how high each cell's floor is, metres (steps are 0.45 m)
  surf: Uint8Array;        // 0 rock, 1 lava (burns), 2 ice (slippery), 3 shallow water (wading), 4 deep water (swimming)
  rooms: Room[];
  start: { x: number; z: number; yaw: number };
  exit: { i: number; j: number };   // the winze (a shaft down), or the way out on the last level
  puzzles: Puzzle[];
  chests: Chest[];
  spawns: Spawn[];
  lamps: number[][];       // x, y, z of candles left in niches, and a fourth number: 1 lava's glow, 2 a brazier
  blocks: number[][];      // stacked stone blocks: x, z, size, height (decoration you can't walk through)
  marks: { x: number; z: number; nx: number; nz: number; text: string }[];   // quarrymen's graffiti
  props: Prop[];
  name: string;
  boss: boolean;
  run: RunTheme;
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
  [["rat", "rat", "rat"], ["ghoul", "ghoul"], ["ghoul", "bat"], ["spider"], ["bat", "bat"], ["headless"], ["rat", "rat", "ghoul"],
    ["knocker", "knocker"], ["puffcap", "puffcap"], ["centipede"]],
  [["headless", "ghoul"], ["gazer"], ["reaper"], ["spider", "spider"], ["wisp", "wisp"], ["golem"], ["rat", "rat", "rat", "rat"], ["ghoul", "ghoul", "bat"], ["gazer", "bat"],
    ["centipede", "centipede"], ["puffcap", "puffcap", "puffcap"], ["crossbow", "ghoul"], ["wraith"], ["knocker", "knocker", "knocker"]],
  [["golem", "ghoul"], ["reaper", "wisp"], ["gazer", "gazer"], ["headless", "headless"], ["spider", "spider", "spider"], ["wisp", "wisp", "wisp"], ["blob", "blob", "blob"], ["reaper"],
    ["troll"], ["wraith", "wraith"], ["crossbow", "crossbow", "headless"], ["centipede", "centipede", "puffcap"]],
];
// some rooms draw their monsters from their own list
const HAUNTS: Partial<Record<Theme, MobKind[][]>> = {
  stable: [["rat", "rat", "rat", "rat"], ["rat", "rat", "headless"]],
  wet: [["spider", "spider"], ["spider", "bat", "bat"], ["centipede", "centipede"]],
  crystal: [["wisp", "wisp"], ["gazer", "wisp"]],
  workshop: [["golem"], ["ghoul", "ghoul", "ghoul"], ["knocker", "knocker", "knocker"]],
  chapel: [["ghoul", "ghoul"], ["headless"], ["wraith"], ["crossbow", "crossbow"]],
  lava: [["beetle", "beetle"]],
  collapse: [["knocker", "knocker"]],
  ochre: [["puffcap", "puffcap"]],
};
const SINGLES: MobKind[][] = [["ghoul", "bat", "rat", "spider", "knocker", "puffcap", "centipede"], ["ghoul", "headless", "spider", "gazer", "wisp", "bat", "crossbow", "wraith", "puffcap"],
  ["headless", "gazer", "wisp", "reaper", "golem", "troll", "wraith", "crossbow"]];
const CHAMPS: MobKind[][] = [["headless", "ghoul"], ["headless", "reaper", "golem"], ["golem", "reaper"]];

// what each kind of run makes of its rooms
const CAVERNS: Record<RunTheme, Theme[]> = {
  flooded: ["wet", "wet", "cavern", "crystal", "ice"], burning: ["lava", "lava", "cavern", "crystal", "lava"],
  frozen: ["ice", "ice", "crystal", "crystal", "cavern"], haunted: ["cavern", "crystal", "wet", "lava", "ice"],
  collapsed: ["cavern", "cavern", "lava", "wet", "crystal"],
};
const HALLS: Record<RunTheme, Theme[]> = {
  flooded: ["hall", "chasm", "hall", "chapel"], burning: ["lava", "lava", "chasm", "hall"], frozen: ["hall", "chasm", "hall", "chapel"],
  haunted: ["chapel", "chapel", "hall", "chasm"], collapsed: ["chasm", "chasm", "hall", "lava"],
};
const STALLS: Record<RunTheme, Theme[]> = {
  flooded: ["wet", "stall", "stable", "ochre", "wet"], burning: ["workshop", "workshop", "stall", "ochre", "collapse"],
  frozen: ["stall", "collapse", "stable", "stall", "ochre"], haunted: ["chapel", "stall", "stable", "collapse", "stall"],
  collapsed: ["collapse", "collapse", "collapse", "stall", "workshop"],
};
const RUN_MOBS: Record<RunTheme, MobKind[][]> = {
  flooded: [["spider", "spider"], ["rat", "rat", "rat"], ["blob", "blob"], ["bat", "bat", "spider"], ["drowned"], ["drowned", "spider"], ["centipede", "centipede"], ["centipede", "rat", "rat"]],
  burning: [["wisp", "wisp"], ["gazer"], ["golem"], ["wisp", "gazer"], ["beetle", "beetle"], ["beetle", "beetle", "beetle"], ["beetle", "wisp"]],
  frozen: [["reaper"], ["wisp", "wisp"], ["spider", "spider"], ["ghoul", "ghoul"], ["wight"], ["wight", "ghoul"], ["wight", "wisp"]],
  haunted: [["ghoul", "ghoul", "ghoul"], ["headless", "headless"], ["wisp", "wisp"], ["reaper", "ghoul"], ["wraith", "wraith"], ["wraith"], ["crossbow", "crossbow"], ["crossbow", "ghoul", "ghoul"]],
  collapsed: [["golem"], ["rat", "rat", "rat", "rat"], ["bat", "bat", "bat"], ["headless", "rat"], ["knocker", "knocker", "knocker"], ["knocker", "rat", "rat"], ["troll"], ["troll", "knocker"]],
};
const TOUGH: MobKind[] = ["golem", "reaper", "blob", "gazer", "troll", "drowned", "wight"];

const ROCK_OF: Record<Theme, (typeof ROCKS)[number][]> = {
  start: ["oolite"], stall: ["oolite", "fossil", "oolite"], cavern: ["oolite", "fossil", "flow"], workshop: ["brick", "soot"], stable: ["brick", "oolite"],
  gallery: ["oolite", "ochre"], collapse: ["oolite"], ochre: ["ochre"], wet: ["flow"], crystal: ["spar"], chapel: ["ashlar", "brick"], lair: ["flow"], lava: ["soot", "ochre"], ice: ["flow", "spar"],
  hall: ["ashlar", "ashlar", "brick"], chasm: ["soot", "flow", "oolite"],
};
const FLOOR_OF: Record<Theme, (typeof FLOORS)[number]> = {
  start: "dust", stall: "dust", cavern: "rubble", workshop: "boards", stable: "straw", gallery: "dust",
  collapse: "rubble", ochre: "mud", wet: "mud", crystal: "dust", chapel: "flags", lair: "mud", lava: "rubble", ice: "dust",
  hall: "flags", chasm: "rubble",
};
export const STEP = 0.45;   // the most you can step up without jumping

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function generate(seed: number, depth: number): Level {
  const r = rng(seed * 7919 + depth * 104729);
  const ri = (a: number, b: number) => a + Math.floor(r() * (b - a + 1));
  const pick = <T>(a: T[]) => a[Math.floor(r() * a.length)];
  const boss = depth === DEPTHS;
  const run = runTheme(seed);
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
    const kind: Room["kind"] = roll < 0.2 ? "cavern" : roll < 0.32 ? "gallery" : roll < 0.52 ? "hall" : "stall";
    let rw: number, rh: number;
    if (kind === "cavern") { rw = ri(7, 11); rh = ri(7, 11); }
    else if (kind === "hall") { rw = ri(9, 13); rh = ri(9, 13); }
    else if (kind === "gallery") { const long = ri(10, 15), thin = ri(2, 3); [rw, rh] = r() < 0.5 ? [long, thin] : [thin, long]; }
    else { rw = ri(7, 14); rh = ri(7, 14); }
    const a: Room = { i0: ri(2, w - rw - 3), j0: ri(2, h - rh - 3), i1: 0, j1: 0, kind, theme: "stall" };
    a.i1 = a.i0 + rw; a.j1 = a.j0 + rh;
    if (fits(a)) rooms.push(a);
  }
  // themes: what each room was used for, or what's happened to it since
  for (const a of rooms) {
    if (a.kind === "start" || a.theme === "lair") continue;
    if (a.kind === "cavern") a.theme = pick(CAVERNS[run]);
    else if (a.kind === "gallery") a.theme = "gallery";
    else if (a.kind === "hall") a.theme = pick(HALLS[run]);
    else a.theme = pick(STALLS[run]);
  }
  for (const a of rooms) {
    const big = a.theme === "lair";
    if (a.kind === "cavern") {
      // a roof fall: a rough blob, open to a tall dome
      const cx = (a.i0 + a.i1) / 2, cy = (a.j0 + a.j1) / 2, rx = (a.i1 - a.i0) / 2, ry = (a.j1 - a.j0) / 2;
      const dome = big ? 7.5 : 4.8 + r() * 3;
      for (let j = a.j0; j <= a.j1; j++) for (let i = a.i0; i <= a.i1; i++) {
        const d = Math.hypot((i - cx) / rx, (j - cy) / ry) + (r() - 0.5) * 0.25;
        if (d < 1) dig(i, j, Math.round((dome - d * (big ? 3 : dome - 3) + r() * 0.4) * 2) / 2);
      }
    } else if (a.kind === "hall") {
      // a great hall cut out of the stone, tall, with a few massive pillars going up into the dark
      const rf = [6, 7, 8][Math.floor(r() * 3)];
      for (let j = a.j0; j <= a.j1; j++) for (let i = a.i0; i <= a.i1; i++) dig(i, j, rf);
      if (a.theme === "hall" && r() < 0.7) {
        const inset = 2;
        for (const [i, j] of [[a.i0 + inset, a.j0 + inset], [a.i1 - inset - 1, a.j0 + inset], [a.i0 + inset, a.j1 - inset - 1], [a.i1 - inset - 1, a.j1 - inset - 1]]) {
          for (const [di, dj] of [[0, 0], [1, 0], [0, 1], [1, 1]]) open[at(i + di, j + dj)] = 0;
        }
      }
    } else if (a.kind === "gallery") {
      // a long working propped with timber
      const rf = ri(0, 1) ? 2.6 : 2.9;
      for (let j = a.j0; j <= a.j1; j++) for (let i = a.i0; i <= a.i1; i++) dig(i, j, rf);
    } else {
      // pillar and stall: open it all, then leave pillars on a grid. Every third cell, or big 2x2
      // pillars every fourth. The roof sags a little between them.
      const base = a.kind === "start" ? 3 : [2.5, 2.8, 3.3, 3.9][Math.floor(r() * 4)];
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
  if (exitRoom.theme === "lava" || exitRoom.theme === "ice" || exitRoom.theme === "chasm") exitRoom.theme = "cavern";
  // which puzzles: dealt from one shuffle for the whole run, the run's own puzzle first (see below)
  const deck = shuffle(PUZZLE_KINDS.slice(), rng(seed));
  deck.splice(deck.indexOf(RUN_INFO[run].puzzle), 1);
  deck.unshift(RUN_INFO[run].puzzle);
  const dealt = PUZZLES_AT.slice(0, depth - 1).reduce((a, b) => a + b, 0);
  const kinds = deck.slice(dealt, dealt + PUZZLES_AT[depth - 1]);
  const spare = deck.slice(dealt + PUZZLES_AT[depth - 1]).concat(["levers"]);
  // the lava bridge needs a lava room built for it: a raised island you can't jump up to
  let bridgeRoom = -1, bridgeOk = false;
  const bridge = { cells: [] as number[], shore: -1, end: -1 };
  if (kinds.includes("bridge")) {
    const cand = rooms.map((_, n) => n).filter((n) => rooms[n] !== exitRoom && (rooms[n].kind === "cavern" || rooms[n].kind === "hall") && rooms[n].theme !== "lair");
    bridgeRoom = cand.find((n) => rooms[n].theme === "lava") ?? cand[0] ?? -1;
    if (bridgeRoom >= 0) rooms[bridgeRoom].theme = "lava";
  }
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
    if (a.theme === "lava" || a.theme === "ice" || a.theme === "chasm") return a.theme;
    if (a.kind === "hall" && Math.min(a.i1 - a.i0, a.j1 - a.j0) >= 9 && r() < 0.75) return "balcony";
    if (a.kind === "stall" && Math.max(a.i1 - a.i0, a.j1 - a.j0) >= 9 && r() < 0.5) return "gallery";
    if (a.kind === "cavern" && a.theme !== "lair" && r() < 0.6) return r() < 0.6 ? "bowl" : "mound";
    return "flat";
  });
  const sides = rooms.map(() => [Math.floor(r() * 4), ri(3, 4), r()]);
  // water: 1 a pool, 2 a stream across the room
  const waters = rooms.map((a, n) => {
    if (a.kind === "start" || a === exitRoom || !["flat", "bowl", "gallery"].includes(designs[n])) return 0;
    const wet = a.theme === "wet" ? 0.85 : run === "flooded" ? 0.45 : 0.08;
    return r() < wet ? (r() < 0.5 ? 1 : 2) : 0;
  });
  const DEEP = 1.2;   // how far deep water's floor is below the room's
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
      const isBridge = n === bridgeRoom && !flat;
      if (design === "lava" && d < (flat ? 0.5 : isBridge ? 0.68 : 0.95)) { surf[k] = 1; fl[k] = base - 0.6; optional[k] = 1; }
      // wall to wall lava: only the stepping stones have to be got to
      if (design === "lava" && !flat && !isBridge) optional[k] = 1;
    }
    // where headings come into the room
    const doors: number[][] = [];
    for (let j = a.j0; j <= a.j1; j++) for (let i = a.i0; i <= a.i1; i++) {
      if (!open[at(i, j)] || roomOf[at(i, j)] !== n) continue;
      for (const [di, dj] of DIRS) { const m = at(i + di, j + dj); if (open[m] && roomOf[m] !== n) { doors.push([i, j, di, dj]); break; } }
    }
    if (design === "chasm") {
      // a deep cleft right across the room, lava at the bottom, and a narrow bridge over it
      const ci = Math.round((a.i0 + a.i1) / 2), cj = Math.round((a.j0 + a.j1) / 2);
      const opts: number[][] = [];
      // (headings come in on the middle lines, so the cleft goes off to one side)
      for (const off of [3, -3, 4, -4, 2, -2, 0]) for (const ax of [0, 1]) {
        const c = (ax === 0 ? ci : cj) + off, lo = ax === 0 ? a.i0 : a.j0, hi = ax === 0 ? a.i1 : a.j1;
        if (c - 1 <= lo || c + 1 >= hi) continue;
        if (!doors.some(([i, j]) => Math.abs((ax === 0 ? i : j) - c) <= 1)) opts.push([ax, c]);
      }
      // best: one that has ways in on both sides of it, so it has to be crossed, and room either side
      const score = ([ax, c]: number[]) => {
        const lo = ax === 0 ? a.i0 : a.j0, hi = ax === 0 ? a.i1 : a.j1;
        const sideA = doors.some(([i, j]) => (ax === 0 ? i : j) < c), sideB = doors.some(([i, j]) => (ax === 0 ? i : j) > c);
        return (sideA && sideB ? 100 : 0) + Math.min(c - 1 - lo, hi - c - 1);
      };
      opts.sort((p, q) => score(q) - score(p));
      if (opts.length) {
        const [ax, c] = opts[0];
        const lo = ax === 0 ? a.j0 : a.i0, hi = ax === 0 ? a.j1 : a.i1;
        const bridges = [lo + 2 + Math.floor(sides[n][2] * Math.max(1, hi - lo - 4))];
        if (hi - lo >= 10) bridges.push(bridges[0] + (bridges[0] < (lo + hi) / 2 ? 4 : -4));
        for (let t = lo; t <= hi; t++) for (let u = c - 1; u <= c + 1; u++) {
          const i = ax === 0 ? u : t, j = ax === 0 ? t : u, k = at(i, j);
          if (!open[k] || roomOf[k] !== n) continue;
          if (bridges.includes(t)) { fl[k] = base; surf[k] = 0; optional[k] = 0; }
          else { fl[k] = base - 4; surf[k] = 1; optional[k] = 1; }
        }
        // the bridges go from rock to rock: open their ends
        for (const t of bridges) for (const u of [c - 2, c + 2]) {
          const i = ax === 0 ? u : t, j = ax === 0 ? t : u, k = at(i, j);
          if (inside(i, j) && roomOf[k] === n && !open[k]) { open[k] = 1; roof[k] = Math.max(roof[at(ax === 0 ? c : t, ax === 0 ? t : c)], base + 3); fl[k] = base; }
        }
      }
    }
    if (n === bridgeRoom) bridgeOk = false;
    if (design === "lava" && !flat && n === bridgeRoom) {
      // the bridge room: an island standing too high out of the lava to jump to, and the shortest way
      // out to the shore for a bridge to rise along
      const ci = Math.round((a.i0 + a.i1) / 2), cj = Math.round((a.j0 + a.j1) / 2);
      for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
        const k = at(i, j);
        if (open[k] && roomOf[k] === n) { fl[k] = base + 4 * STEP; surf[k] = 0; optional[k] = 1; }
      }
      if (!islands.some((x) => x[0] === n)) islands.push([n, at(ci, cj)]);
      let best: number[] | null = null;
      for (const [di, dj] of DIRS) {
        const cells: number[] = [];
        let s2 = 2;
        for (; s2 < 12; s2++) { const k = at(ci + di * s2, cj + dj * s2); if (!open[k] || surf[k] !== 1) break; cells.push(k); }
        const shore = at(ci + di * s2, cj + dj * s2);
        if (cells.length >= 1 && open[shore] && surf[shore] === 0 && roomOf[shore] === n && (!best || cells.length < best.length - 2)) best = [...cells, shore, at(ci + di, cj + dj)];
      }
      if (best) {
        bridge.end = best.pop()!; bridge.shore = best.pop()!; bridge.cells = best;
        bridgeOk = true;
      }
    }
    if (design === "lava" && !flat && n !== bridgeRoom) {
      // stepping stones from each way in out to an island in the middle, a jump apart, rising and falling
      const ci = Math.round((a.i0 + a.i1) / 2), cj = Math.round((a.j0 + a.j1) / 2);
      let hgt = base;
      const stone = (i: number, j: number, h: number, opt = 0) => {
        const k = at(i, j);
        if (!open[k] || roomOf[k] !== n) return;
        fl[k] = h; surf[k] = 0; optional[k] = opt;
      };
      for (const [di0, dj0] of doors) {
        let [i, j] = [di0, dj0];
        stone(i, j, base);
        hgt = base;
        let n2 = 0;
        const path: number[][] = [];
        while (Math.abs(i - ci) + Math.abs(j - cj) > 1) {
          // straight runs, turning at the middle line
          if (i !== ci && (j === cj || Math.abs(i - ci) >= Math.abs(j - cj))) i += Math.sign(ci - i); else j += Math.sign(cj - j);
          path.push([i, j]);
        }
        for (let s2 = 0; s2 < path.length; s2++) {
          const [pi2, pj2] = path[s2];
          const turn = s2 > 0 && s2 < path.length - 1 && (path[s2 - 1][0] !== path[s2 + 1][0] && path[s2 - 1][1] !== path[s2 + 1][1]);
          n2++;
          if (n2 % 2 === 0 || turn || s2 === path.length - 1) {
            hgt = s2 === path.length - 1 ? base + STEP : Math.max(base, Math.min(base + 2 * STEP, hgt + (Math.floor(r() * 3) - 1) * STEP));
            stone(pi2, pj2, hgt);
            n2 = 0;
          }
        }
      }
      // a few more stones about, to make it look natural
      for (let m = ri(3, 7); m > 0; m--) {
        const i = ri(a.i0, a.i1), j = ri(a.j0, a.j1);
        if (surf[at(i, j)] === 1) stone(i, j, base + ri(0, 3) * STEP, 1);
      }
    }
    if (!flat && waters[n] === 1) {
      // a pool, wading at its edges and swimming in the middle
      for (let j = a.j0; j <= a.j1; j++) for (let i = a.i0; i <= a.i1; i++) {
        const k = at(i, j);
        if (!open[k] || roomOf[k] !== n || surf[k]) continue;
        const d = dnorm(a, i, j);
        if (d < 0.6 && !doors.some(([di2, dj2]) => di2 === i && dj2 === j)) surf[k] = 3;
        if (d < 0.38 && (run === "flooded" || depth > 1)) { surf[k] = 4; fl[k] = base - DEEP; }
      }
    }
    if (!flat && waters[n] === 2) {
      // an underground stream running right across, too deep to wade
      const ci = Math.round((a.i0 + a.i1) / 2), cj = Math.round((a.j0 + a.j1) / 2);
      for (const off of [2, -2, 3, -3, 1, -1]) {
        const ax = sides[n][0] % 2, c = (ax === 0 ? ci : cj) + off, lo2 = ax === 0 ? a.i0 : a.j0, hi2 = ax === 0 ? a.i1 : a.j1;
        if (c - 1 <= lo2 || c + 2 >= hi2 || doors.some(([i, j]) => { const q = ax === 0 ? i : j; return q >= c - 1 && q <= c + 2; })) continue;
        for (let t = ax === 0 ? a.j0 : a.i0; t <= (ax === 0 ? a.j1 : a.i1); t++) for (let u = c; u <= c + 1; u++) {
          const i = ax === 0 ? u : t, j = ax === 0 ? t : u, k = at(i, j);
          if (!open[k] || roomOf[k] !== n) continue;
          surf[k] = 4; fl[k] = Math.min(fl[k], base) - DEEP;
        }
        // wading shallows along its banks
        for (let t = ax === 0 ? a.j0 : a.i0; t <= (ax === 0 ? a.j1 : a.i1); t++) for (const u of [c - 1, c + 2]) {
          const i = ax === 0 ? u : t, j = ax === 0 ? t : u, k = at(i, j);
          if (open[k] && roomOf[k] === n && !surf[k]) surf[k] = 3;
        }
        break;
      }
    }
    if (design === "balcony") {
      // a broad ledge right round the walls, 1.8 m up, and a stair down from it into the hall
      const H = base + 4 * STEP, deep = 2;
      for (let j = a.j0; j <= a.j1; j++) for (let i = a.i0; i <= a.i1; i++) {
        const k = at(i, j);
        if (open[k] && roomOf[k] === n && Math.min(i - a.i0, a.i1 - i, j - a.j0, a.j1 - j) < deep) fl[k] = H;
      }
      for (const side of [sides[n][0], (sides[n][0] + 1) % 4]) {
        const along = side < 2 ? [a.j0, a.j1] : [a.i0, a.i1];
        const pos = Math.floor((along[0] + along[1]) / 2);
        for (let into = deep; into < deep + 4; into++) {
          const i = side === 0 ? a.i0 + into : side === 1 ? a.i1 - into : pos, j = side < 2 ? pos : side === 2 ? a.j0 + into : a.j1 - into;
          const k = at(i, j);
          if (!open[k]) { open[k] = 1; roof[k] = roof[at(Math.round((a.i0 + a.i1) / 2), Math.round((a.j0 + a.j1) / 2))] || 6; }
          fl[k] = Math.max(base, H - (into - deep + 1) * STEP);
        }
      }
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
    if ((design === "lava" && (n !== bridgeRoom || flat)) || (design === "ice" && !flat)) {
      // an island in the middle with something on it; over lava, stepping stones out to it
      const ci = Math.round((a.i0 + a.i1) / 2), cj = Math.round((a.j0 + a.j1) / 2);
      for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
        if (!open[at(i, j)] || roomOf[at(i, j)] !== n) continue;
        fl[at(i, j)] = design === "ice" ? base + 2 * STEP : base + STEP;
        surf[at(i, j)] = design === "ice" ? 2 : 0;
        optional[at(i, j)] = 1;
      }
      if (!islands.some((x) => x[0] === n)) islands.push([n, at(ci, cj)]);
      if (design === "lava" && flat) {
        // (flattened: the bridge puzzle can't go here after all)
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
        if (!open[n] || surf[n] === 1 || surf[n] === 4) continue;
        const nh = roomOf[n] >= 0 ? fl[n] : hi[n], nl = roomOf[n] >= 0 ? fl[n] : lo[n];
        if (nh + STEP < hi[k]) { hi[k] = nh + STEP; changed = true; }
        if (nl - STEP > lo[k]) { lo[k] = nl - STEP; changed = true; }
      }
    }
    tight = heads.filter((k) => hi[k] < lo[k] - 0.01);
    // (rounded down, not to nearest: halfway values rounding opposite ways would leave a double step)
    for (const k of heads) fl[k] = isFinite(hi[k]) && isFinite(lo[k]) ? Math.floor((hi[k] + lo[k]) / 2 / STEP + 1e-3) * STEP : 0;
  };
  /** Cells you can't get to and back from, walking, or jumping a single cell of lava. */
  const stranded = () => {
    // (you can climb out of deep water onto a bank up to its depth plus a step)
    const climb = (from: number) => (surf[from] === 4 ? DEEP + STEP + 0.01 : STEP + 0.01);
    const ok = (a: number, b: number) => open[b] === 1 && surf[b] !== 1 && fl[b] - fl[a] <= climb(a);
    const walk = (back: boolean) => {
      const seen = new Uint8Array(w * h), q = [at(si, sj)];
      seen[q[0]] = 1;
      for (let n = 0; n < q.length; n++) for (const [di, dj] of DIRS) {
        const k = q[n], m = k + dj * w + di;
        if (!seen[m] && open[m] && surf[m] !== 1 && (back ? fl[k] - fl[m] <= climb(m) : ok(k, m))) { seen[m] = 1; q.push(m); }
        // a jump over one cell of lava, to no more than a step up
        const c = m + dj * w + di;
        if (open[m] && surf[m] === 1 && c >= 0 && c < w * h && !seen[c] && open[c] && surf[c] !== 1 && (back ? fl[k] - fl[c] : fl[c] - fl[k]) <= STEP + 0.01 && fl[m] < Math.min(fl[k], fl[c])) { seen[c] = 1; q.push(c); }
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
  // lava breaking through the floor of a few headings: a gap to jump. Or, in a flooded run, water to
  // swim; in a frozen one, a sheet of ice.
  let gapsLeft = boss ? 1 : 3;
  const gapSurf = run === "flooded" ? 4 : run === "frozen" ? 2 : 1, gapDrop = gapSurf === 4 ? DEEP : gapSurf === 1 ? 0.6 : 0;
  for (const [i0, j0, i1, j1] of shuffle(runs.slice(), r)) {
    if (!gapsLeft) break;
    const len = Math.abs(i1 - i0) + Math.abs(j1 - j0);
    if (len < 6) continue;
    const di = Math.sign(i1 - i0), dj = Math.sign(j1 - j0), mid = ri(2, len - 3);
    const ci = i0 + di * mid, cj = j0 + dj * mid, c = at(ci, cj), a0 = at(ci - di, cj - dj), b0 = at(ci + di, cj + dj);
    if (![c, a0, b0].every((k) => open[k] && surf[k] === 0 && roomOf[k] < 0 && Math.abs(fl[k] - fl[c]) < 0.01)) continue;
    // the whole width of the heading
    const cells = [c, ...[1, -1].map((s) => at(ci + dj * s, cj + di * s)).filter((k) => open[k] && roomOf[k] < 0)];
    const was = cells.map((k) => fl[k]);
    for (const k of cells) { surf[k] = gapSurf; fl[k] -= gapDrop; }
    if (stranded().length) { cells.forEach((k, n) => { surf[k] = 0; fl[k] = was[n]; }); continue; }
    gapsLeft--;
  }
  if (boss) lairGround(rooms[1], run, rng(seed * 13 + 0x1a12), { w, open, fl, surf, roomOf, rock, floor, stranded });
  for (let k = 0; k < open.length; k++) if (open[k]) roof[k] = Math.max(roof[k], fl[k] + 2.3);
  const lavaRooms = new Set(islands.map((x) => x[0]));

  const used = new Uint8Array(w * h);   // cells something important sits in, so scenery keeps clear
  used[at(si, sj)] = 1;
  for (let k = 0; k < open.length; k++) if (surf[k] === 1 || surf[k] === 4) used[k] = 1;

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
  const add = (kind: MobKind, i: number, j: number, need = 1, champ = false, mini = false) => spawns.push({ id: spawns.length, kind, x: (i + 0.5) * CELL, z: (j + 0.5) * CELL, need, champ, ...(mini ? { mini } : {}) });
  /** A lamp on the wall beside something, so it can be seen from across the room. */
  const lampBy = (x: number, z: number, nx: number, nz: number) => lamps.push([x + nx * 0.25 + nz * 0.55, 2.0, z + nz * 0.25 - nx * 0.55]);
  // the point on the rock face at the cell's edge (half a cell out from its middle)
  const wallPt = (l: { i: number; j: number; nx: number; nz: number }, off = 0.49) => [(l.i + 0.5 - l.nx * off) * CELL, (l.j + 0.5 - l.nz * off) * CELL, l.nx, l.nz];

  // ---- puzzles --------------------------------------------------------------------------------------
  // The kinds are dealt from one shuffle for the whole run (the seed is the run's), so a run doesn't
  // repeat a puzzle; each level takes the next few.
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
          const pt = wallPt(l);
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
      case "mirrors": {
        // a lantern throwing a beam across a room, and mirrors on stands to bounce it onto a sun door
        const k = takeRoom((a) => a.kind !== "gallery");
        if (k < 0) return null;
        const a = rooms[k], nM = depth === 1 ? 2 : 3;
        for (let t = 0; t < 150; t++) {
          const l = wallSpot(open, w, a, r, used);
          if (!l) break;
          let i = l.i, j = l.j, di = l.nx, dj = l.nz;
          const f0 = fl[at(i, j)], path = new Set([at(i, j)]), mir: number[] = [], sol: number[] = [];
          let ok = true;
          for (let m = 0; m <= nM && ok; m++) {
            const last = m === nM, len = last ? 99 : ri(2, 4);
            let s2 = 0;
            for (; s2 < len; s2++) {
              const nk = at(i + di, j + dj);
              if (!open[nk]) break;
              if (path.has(nk) || used[nk] || Math.abs(fl[nk] - f0) > 0.01 || roomOf[nk] !== k || surf[nk]) { ok = false; break; }
              i += di; j += dj; path.add(nk);
            }
            if (!ok) break;
            if (last) { ok = s2 >= 2; break; }
            if (s2 < len) { ok = false; break; }
            // a mirror here turns it left or right
            const [ndi, ndj] = r() < 0.5 ? [dj, -di] : [-dj, di];
            const type = ndi === dj && ndj === di ? 0 : 1;
            mir.push(at(i, j));
            sol.push([type, type + 2].find((q) => di * MIRROR_N[q][0] + dj * MIRROR_N[q][1] < 0)!);
            di = ndi; dj = ndj;
          }
          if (!ok) continue;
          for (const c of path) used[c] = 1;
          p.room = k;
          // the sun door: in the rock face the beam ends at
          const door = [(i + 0.5 + di * 0.49) * CELL, (j + 0.5 + dj * 0.49) * CELL, -di, -dj];
          p.pts = [wallPt(l), door];
          lampBy(door[0], door[1], -di, -dj);
          p.cells = mir;
          // they start turned wrong
          const start = sol.map((o) => (o + ri(1, 3)) % 4);
          p.code = [l.i, l.j, l.nx, l.nz, i + di, j + dj, ...sol, ...start];
          return p;
        }
        return null;
      }
      case "gems": {
        // three sockets set in a wall, and three gems lying about the level; a verse says which goes where
        const k = takeRoom((a) => a.kind !== "gallery");
        if (k < 0) return null;
        const l = wallSpot(open, w, rooms[k], r, used);
        if (!l) return null;
        used[at(l.i, l.j)] = 1;
        p.room = k;
        p.pts.push(wallPt(l));
        lampBy(p.pts[0][0], p.pts[0][1], l.nx, l.nz);
        const homes = shuffle(rooms.map((_, n) => n).filter((n) => n !== k && n > 0 && !lavaRooms.has(n) && !(boss && n === 1)), r);
        for (let g = 0; g < 3; g++) {
          const n = homes[g % Math.max(1, homes.length)];
          if (n === undefined) return null;
          const cells = cellsOf(rooms[n]).filter((c) => !surf[c]);
          if (!cells.length) return null;
          const c = cells[Math.floor(r() * cells.length)];
          used[c] = 1;
          p.pts.push([(c % w + 0.5) * CELL, (Math.floor(c / w) + 0.5) * CELL]);
        }
        p.code = shuffle([0, 1, 2], r);
        p.text = [`${cap(GEM_WORDS[p.code[0]])} above,`, `${GEM_WORDS[p.code[1]]} between,`, `and ${GEM_WORDS[p.code[2]]} below.`];
        return p;
      }
      case "statues": {
        // stone watchers round a room that must all face the light; each drags the next round with it
        const k = takeRoom((a) => a.kind !== "gallery");
        if (k < 0) return null;
        const a = rooms[k];
        const l = wallSpot(open, w, a, r, used);
        if (!l) return null;
        used[at(l.i, l.j)] = 1;
        const shrine = wallPt(l);
        lampBy(shrine[0], shrine[1], l.nx, l.nz);
        const cells = spread(a, 8, 2).filter((c) => {
          const dx = (c % w + 0.5) * CELL - shrine[0], dz = (Math.floor(c / w) + 0.5) * CELL - shrine[1];
          return !surf[c] && Math.hypot(dx, dz) > 3 && Math.max(Math.abs(dx), Math.abs(dz)) > 1.7 * Math.min(Math.abs(dx), Math.abs(dz));
        }).slice(0, 4);
        if (cells.length < 3) return null;
        p.room = k;
        p.pts = [shrine];
        const sol: number[] = [];
        for (const c of cells) {
          used[c] = 1;
          const x = (c % w + 0.5) * CELL, z = (Math.floor(c / w) + 0.5) * CELL, vx = shrine[0] - x, vz = shrine[1] - z;
          p.pts.push([x, z]);
          sol.push(Math.abs(vx) > Math.abs(vz) ? (vx > 0 ? 1 : 3) : (vz > 0 ? 0 : 2));
        }
        // muddle them by turning them backwards, so they can always be turned right again
        const start = sol.slice();
        while (start.every((v, q) => v === sol[q])) for (let m = ri(4, 8); m > 0; m--) {
          const q = ri(0, start.length - 1);
          start[q] = (start[q] + 3) % 4;
          if (q + 1 < start.length) start[q + 1] = (start[q + 1] + 3) % 4;
        }
        p.code = [...sol, ...start];
        return p;
      }
      case "bridge": {
        // a windlass on the shore raises a stone bridge out of the lava to an island; the lever's on the island
        if (bridgeRoom < 0 || !bridgeOk) return null;
        p.room = bridgeRoom;
        p.cells = bridge.cells.slice();
        const xz = (c: number) => [(c % w + 0.5) * CELL, (Math.floor(c / w) + 0.5) * CELL];
        p.pts = [xz(bridge.shore), xz(bridge.end)];
        p.code = [fl[bridge.shore], fl[bridge.end]];
        used[bridge.shore] = used[bridge.end] = 1;
        lamps.push([p.pts[0][0] + 0.7, 2.0, p.pts[0][1] + 0.7]);
        return p;
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
    return null;
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
    if (k > 1 && r() < 0.45) {
      // now and then something sits in a room without a chest, looking very like one
      if (k > 2 && r() < 0.25) {
        const m = cornerSpot(open, w, rooms[k], r, used);
        if (m) { used[at(m.i, m.j)] = 1; add("mimic", m.i, m.j); }
      }
      continue;
    }
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

  // the bosses' weaknesses: the run's boss's on one of the levels above it, each mini-boss's on its own
  // level, in chests away from the winze, with a word about it scratched up beside them
  {
    const rw = rng(seed * 61 + depth * 7 + 0x3ea5);
    const want: string[] = [];
    if (depth === weakDepth(seed)) want.push(WEAKNESS[RUN_BOSS[run]]!);
    if (!boss) want.push(MINI_WEAKNESS[RUN_MINIS[run][Math.min(depth, 2) - 1]]!);
    const taken = new Set<number>();
    for (const it of want) {
      const room = (c: Chest) => roomOf[at(c.i, c.j)];
      let cand = chests.filter((c) => !taken.has(c.id) && room(c) >= 0 && rooms[room(c)] !== exitRoom && !optional[at(c.i, c.j)]);
      if (!cand.length) cand = chests.filter((c) => !taken.has(c.id));
      let c: Chest | undefined = cand[Math.floor(rw() * cand.length)];
      if (!c) {
        const a = rooms[order[Math.floor(rw() * order.length)] ?? 0];
        const sp = cornerSpot(open, w, a, rw, used);
        if (!sp) continue;
        used[at(sp.i, sp.j)] = 1;
        c = { id: chests.length, i: sp.i, j: sp.j, item: it };
        chests.push(c);
      }
      c.item = it;
      taken.add(c.id);
      const rn = room(c);
      const l = rn >= 0 ? wallSpot(open, w, rooms[rn], rw, used) : null;
      if (l) marks.push({ x: (l.i + 0.5 - l.nx * 0.49) * CELL, z: (l.j + 0.5 - l.nz * 0.49) * CELL, nx: l.nx, nz: l.nz, text: WEAK_WORD[it] ?? it.toUpperCase() });
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
      // the run's boss, a little way off the way out so it isn't standing in the shaft
      const [ci, cj] = centre(a);
      const c = openCellNear(open, w, ci, cj - 3);
      add(RUN_BOSS[run], c.i, c.j);
      continue;
    }
    const theirs = RUN_MOBS[run].filter((g) => depth > 1 || !g.some((m) => TOUGH.includes(m)));
    const group = () => (HAUNTS[a.theme] && r() < 0.4 ? pick(HAUNTS[a.theme]!) : r() < 0.45 ? pick(theirs) : pick(GROUPS[depth - 1]));
    const lots: [MobKind[], number][] = [[group(), 1], [group(), 2], [[pick(SINGLES[depth - 1])], 3], [[pick(SINGLES[depth - 1])], 4]];
    if (depth > 1) lots.push([[pick(SINGLES[depth - 1])], 1]);
    for (const [kinds, need] of lots) for (const kind of kinds) { const c = spot(); if (c) add(kind, c.i, c.j, need); }
  }
  // a few bats roosting in the headings, and rats about
  for (let m = 0; m < 3 + depth; m++) {
    const i = ri(1, w - 2), j = ri(1, h - 2);
    if (open[at(i, j)] && dist[at(i, j)] > 12 && roomOf[at(i, j)] < 0 && !wet.has(at(i, j))) add(m % 2 ? "bat" : "rat", i, j, 1 + (m % 3));
  }

  // a mini-boss stands guard over the winze (its own random numbers, so the rest of the level is as it was)
  if (!boss) {
    const rb = rng(seed * 31 + depth * 977 + 0xb055);
    const kind = RUN_MINIS[run][Math.min(depth, 2) - 1];
    const [ci, cj] = centre(exitRoom);
    let spot: { i: number; j: number } | null = null;
    for (let t = 0; t < 40 && !spot; t++) {
      const c = openCellNear(open, w, ci + Math.floor(rb() * 7) - 3, cj + Math.floor(rb() * 7) - 3);
      const k = at(c.i, c.j);
      if (Math.abs(c.i - exit.i) + Math.abs(c.j - exit.j) >= 2 && !surf[k] && !wet.has(k) && roomOf[k] >= 0 && rooms[roomOf[k]] === exitRoom) spot = c;
    }
    spot ??= openCellNear(open, w, exit.i + 2, exit.j);
    add(kind, spot.i, spot.j, 1, false, true);
  }

  // ---- scenery ---------------------------------------------------------------------------------------------
  const blocks: number[][] = [];
  const wallAt = (a: Room) => wallSpot(open, w, a, r, used);
  for (const a of rooms) {
    const candles = puzzles.some((p) => p.kind === "candles" && rooms[p.room] === a);
    for (let n = a.kind === "start" ? 2 : candles ? 0 : a.kind === "hall" ? ri(2, 3) : ri(1, 2); n > 0; n--) {
      const l = wallAt(a);
      if (l) lamps.push([(l.i + 0.5 - l.nx * 0.42) * CELL, 1.55 + r() * 0.3, (l.j + 0.5 - l.nz * 0.42) * CELL]);
    }
    // great halls are lit by braziers
    if (a.kind === "hall") {
      for (let n = ri(2, 4); n > 0; n--) {
        const c = cornerSpot(open, w, a, r, used);
        if (c && surf[at(c.i, c.j)] === 0) { used[at(c.i, c.j)] = 1; lamps.push([(c.i + 0.5) * CELL, 0, (c.j + 0.5) * CELL, 2]); }
      }
    }
    if ((a.kind === "stall" && r() < 0.6) || a.theme === "workshop") {
      for (let n = a.theme === "workshop" ? 3 : 1; n > 0; n--) {
        const c = cornerSpot(open, w, a, r, used);
        if (c && !(c.i === exit.i && c.j === exit.j)) { used[at(c.i, c.j)] = 1; blocks.push([(c.i + 0.5) * CELL, (c.j + 0.5) * CELL, 1.1 + r() * 0.5, ri(1, 3)]); }
      }
    }
    if (r() < 0.7) {
      const l = wallAt(a);
      if (l) marks.push({ x: (l.i + 0.5 - l.nx * 0.49) * CELL, z: (l.j + 0.5 - l.nz * 0.49) * CELL, nx: l.nx, nz: l.nz, text: `${pick(NAMES)} ${ri(1760, 1858)}` });
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
      case "lair":
        // the boss's own den
        if (run === "flooded") { floorProp("puddle", 5, { s: 0.9 }); floorProp("chain", 4); floorProp("truck", 2); floorProp("stal", 3); }
        else if (run === "burning") { floorProp("bones", 6); floorProp("rubble", 5, { s: 1 }); floorProp("crystals", 3); }
        else if (run === "frozen") { floorProp("crystals", 8); floorProp("stal", 6); floorProp("bones", 3); }
        else if (run === "haunted") { floorProp("stub", 12); floorProp("bones", 6); floorProp("chain", 2); }
        else { floorProp("bones", 6); floorProp("rubble", 4, { s: 1 }); floorProp("stal", 5); }
        break;
      case "start": wallProp("tools"); floorProp("barrel", 1); floorProp("crate", 1); break;
      default: floorProp("barrel", r() < 0.4 ? 1 : 0); floorProp("web", 1); if (r() < 0.4) wallProp("tools"); break;
    }
  }
  // tramway rails down the longer headings, with the odd truck left on them
  for (const [i0, j0, i1, j1] of shuffle(runs, r).slice(0, boss ? 2 : 5)) {
    if (!open[at(i0, j0)] || !open[at(i1, j1)]) continue;
    // the rails lie at one height, so only along a heading whose floor stays level
    let level = true;
    for (let j = Math.min(j0, j1); j <= Math.max(j0, j1); j++) for (let i = Math.min(i0, i1); i <= Math.max(i0, i1); i++) if (Math.abs(fl[at(i, j)] - fl[at(i0, j0)]) > 0.01) level = false;
    if (!level) continue;
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
  // lava glows: lights of its own, spread over it (the fourth number marks them)
  const glows: number[] = [];
  for (const k of shuffle([...open.keys()].filter((k) => open[k] && surf[k] === 1), r)) {
    const i = k % w, j = Math.floor(k / w);
    if (glows.some((g) => Math.hypot(g % w - i, Math.floor(g / w) - j) < 3.5)) continue;
    glows.push(k);
    lamps.push([(i + 0.5) * CELL, fl[k] + 0.6, (j + 0.5) * CELL, 1]);
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
    seed, depth, w, h, open, roof, rock, floor, fl, surf, rooms, exit, puzzles, chests, spawns, lamps, blocks, marks, props, boss, run,
    start: { x: (si + 0.5) * CELL, z: (sj + 0.5) * CELL, yaw: 0 },
    name: LEVEL_NAMES[depth - 1] ?? `Level ${depth}`,
  };
}

/**
 * The ground of the boss's cavern, to suit what lives there: a flooded engine house with deep sumps and
 * wading water round the edge, pools of lava for the wyrm to swim in, a sheet of ice, a chapel's flags.
 * The middle (the way out) stays dry, and anything that would cut a way off is put back.
 */
function lairGround(a: Room, run: RunTheme, r: () => number, g: {
  w: number; open: Uint8Array; fl: Float32Array; surf: Uint8Array; roomOf: Int16Array; rock: Uint8Array; floor: Uint8Array; stranded: () => number[];
}) {
  const { w, open, fl, surf, roomOf, rock, floor } = g;
  const n = roomOf[Math.round((a.j0 + a.j1) / 2) * w + Math.round((a.i0 + a.i1) / 2)];
  const cx = (a.i0 + a.i1) / 2, cy = (a.j0 + a.j1) / 2, rx = (a.i1 - a.i0) / 2 + 0.5, ry = (a.j1 - a.j0) / 2 + 0.5;
  const cells: number[] = [];
  for (let j = a.j0; j <= a.j1; j++) for (let i = a.i0; i <= a.i1; i++) if (open[j * w + i] && roomOf[j * w + i] === n) cells.push(j * w + i);
  const dn = (k: number) => Math.hypot((k % w - cx) / rx, (Math.floor(k / w) - cy) / ry);
  // ways in: keep a few cells round each clear
  const doors = cells.filter((k) => [1, -1, w, -w].some((d) => open[k + d] && roomOf[k + d] !== n));
  const nearDoor = (k: number, rad: number) => doors.some((q) => Math.abs(q % w - k % w) + Math.abs(Math.floor(q / w) - Math.floor(k / w)) <= rad);
  const look = (rk: (typeof ROCKS)[number], fk: (typeof FLOORS)[number]) => {
    for (const k of cells) { rock[k] = ROCKS.indexOf(rk); floor[k] = FLOORS.indexOf(fk); }
  };
  const pools = (count: number, set: (k: number) => void) => {
    for (let p = 0, tries = 0; p < count && tries < 40; tries++) {
      const ang = r() * Math.PI * 2, d = 0.45 + r() * 0.2;
      const pi = Math.round(cx + Math.cos(ang) * rx * d), pj = Math.round(cy + Math.sin(ang) * ry * d), rad = 1.3 + r() * 0.6;
      const mine = cells.filter((k) => Math.hypot(k % w - pi, Math.floor(k / w) - pj) < rad && !surf[k] && !nearDoor(k, 3) && dn(k) > 0.3);
      if (mine.length < 4) continue;
      const was = mine.map((k) => [fl[k], surf[k]]);
      for (const k of mine) set(k);
      if (g.stranded().length) { mine.forEach((k, q) => { fl[k] = was[q][0]; surf[k] = was[q][1]; }); continue; }
      p++;
    }
  };
  if (run === "flooded") {
    look("flow", "mud");
    for (const k of cells) if (dn(k) > 0.72 && !surf[k]) surf[k] = 3;
    pools(3, (k) => { surf[k] = 4; fl[k] -= 1.2; });
  } else if (run === "burning") {
    look("soot", "rubble");
    pools(5, (k) => { surf[k] = 1; fl[k] -= 0.6; });
  } else if (run === "frozen") {
    look("spar", "dust");
    for (const k of cells) if (dn(k) > 0.18 && dn(k) < 0.9 && !surf[k] && !nearDoor(k, 1)) surf[k] = 2;
  } else if (run === "haunted") {
    look("ashlar", "flags");
  }
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
