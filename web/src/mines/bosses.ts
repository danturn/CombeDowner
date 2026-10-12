// Bosses: the host's brain for each run's final boss and for the mini-bosses guarding the winzes.
//
// A boss fights in moves. Each move winds up (the monster's state is 2, and everyone is sent a
// telegraph: a ring on the floor where a slam will land, a line down a charge, a cone of steam), then
// goes off, then recovers. Which move it's making is synced in the monster's packed data (`move`), so
// the models can pose for it; the telegraphs go out as "bfx" events, which bossfx.ts draws. Bosses also
// have phases (`phase`, synced too): at set fractions of their health they call up adds, shatter, flood.
//
// Mini-bosses are big named ones of an ordinary kind: they fight as their kind does, with a couple of
// special moves on a timer.
import { CELL, MINI_WEAKNESS, MobKind, WEAKNESS } from "./gen";
import type { Brain, Horde, MobHooks, MobSim, Prey } from "./mobs";
import { MOBS, radius } from "./mobs";

/** The special moves. Shared by every boss so the models (mobviews.ts) can pose for each. */
export const MOVE = {
  NONE: 0, SWIPE: 1, SLAM: 2, SHOCK: 3, CHARGE: 4, SUMMON: 5, STEAM: 6, FLOOD: 7, DIVE: 8, UNDER: 9, SURFACE: 10,
  BREATH: 11, TAIL: 12, SPIKES: 13, FROST: 14, SHATTER: 15, BLINK: 16, THROW: 17, CURSE: 18, LEAP: 20, STUN: 21,
} as const;

export const BOSSES: MobKind[] = ["grout", "engine", "wyrm", "rime", "owner"];
export const isBoss = (k: MobKind) => BOSSES.includes(k);
/** What a mini-boss is called: a big, named one of its kind. */
export const MINI_NAMES: Partial<Record<MobKind, string>> = { spider: "The Brood Mother", ghoul: "The Gaffer", headless: "The Foreman", golem: "The Kiln Golem" };
export const bossName = (m: { kind: MobKind; mini?: boolean }) => (m.mini ? MINI_NAMES[m.kind] ?? `The great ${MOBS[m.kind].name.toLowerCase()}` : MOBS[m.kind].name);
/** The relic (items.ts) a boss or mini-boss can't stand: hit it with that on you for double damage, and a stagger. */
export const weaknessOf = (m: { kind: MobKind; mini?: boolean }) => (m.mini ? MINI_WEAKNESS[m.kind] : isBoss(m.kind) ? WEAKNESS[m.kind] : undefined);
export const WEAK_DMG = 2;
/** What everyone's told when a weakness bites. */
export const WEAK_LINE: Record<string, string> = {
  vinegar: "hisses and slumps as the vinegar bites into its mortar",
  spanner: "shrieks as the spanner strips its valves, and stalls",
  spring: "gutters and spits as the spring water quenches it",
  lampoil: "cracks and streams as the burning oil takes hold",
  deeds: "recoils from the sight of his own deeds",
  smokepot: "reels back from the brimstone smoke",
  gravesalt: "shrieks as the grave salt burns",
  paybook: "goes mad at the sight of his paybook",
  mallet: "splits along the bed as the mallet finds it",
};
/** What the old hands say about it, when you start the run. */
export const WEAK_HINT: Record<string, string> = {
  vinegar: "Old hands say the thing at the bottom is made of lime mortar, and vinegar eats mortar",
  spanner: "Old hands say the old pumping engine flooded the deep workings. An engineman's spanner would see to its valves",
  spring: "Old hands say something burns at the bottom. Cold spring water would quench it",
  lampoil: "Old hands say a frozen man walks the deep workings. Burning oil would thaw him",
  deeds: "Old hands say the owner never left his quarries. Show him his deeds and see what he does",
};
const STUNNED: Move = { wind: 0, act: 1.5, rec: 0.3 };
/**
 * A weakness hit: the boss staggers, dropping whatever it was winding up (the host's applyHit calls this).
 * Returns false if it can't be staggered just now.
 */
export function stagger(m: MobSim, hooks: MobHooks): boolean {
  const M = mem.get(m);
  if (!M || M.mv === MOVE.STUN || m.move === MOVE.UNDER || (M.mv && M.stage === 1)) return false;
  if (M.mv) hooks.event?.({ k: "bfx", id: m.id, fx: "cancel" });
  M.mv = MOVE.STUN; M.stage = 1; M.t = STUNNED.act; M.pend = 0; M.hit.clear();
  m.move = MOVE.STUN; m.state = 1;
  return true;
}
/** Whether it keeps the way on shut while it lives. */
export const guards = (m: { kind: MobKind; mini?: boolean }) => isBoss(m.kind) || !!m.mini;

const TAU = Math.PI * 2;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
/** The way a monster with this yaw is facing. */
const fwd = (a: number) => [-Math.sin(a), -Math.cos(a)];
const yawTo = (dx: number, dz: number) => Math.atan2(-dx, -dz);
const r1 = (n: number) => Math.round(n * 10) / 10;

/** What a boss remembers between frames (lost if the host changes: it starts its next move afresh). */
interface Mem {
  mv: number; stage: number; t: number;   // the move, 0 winding up / 1 going off / 2 recovering, time left in the stage
  x: number; z: number; a: number;        // where it's aimed
  x0: number; z0: number;                 // where it started from (charges, leaps, dives)
  gap: number;                            // till the next special move
  tick: number; hit: Set<string>;
  pts: number[][];                        // several targets: frost, ledgers, curses
  ids: string[];
  pend: number;                           // the phase a phase move brings on when it goes off
  sp: boolean;                            // this move is a special (or phase) move: the gap restarts when it ends
  cx: number; cz: number; R: number;      // the arena
  lava: number[][];                       // lava to dive into (the wyrm)
  next: number;
}
const mem = new WeakMap<MobSim, Mem>();

interface Ctx {
  m: MobSim; M: Mem; dt: number; best: Prey | null; bestD: number; prey: Prey[]; hooks: MobHooks; horde: Horde; kit: Kit;
}

/** One move: how long it winds up, goes off and recovers for, and what it does. */
interface Move {
  wind: number; act: number; rec: number;
  /** pick targets and send the telegraph */
  begin?(c: Ctx): void;
  /** while winding up (turn to track, say) */
  aim?(c: Ctx): void;
  /** the moment the wind-up ends */
  fire?(c: Ctx): void;
  /** every frame while it's going off */
  run?(c: Ctx): void;
  /** a move that leads straight into another */
  then?: number;
}
interface Kit {
  moves: Partial<Record<number, Move>>;
  /** health fractions where the phases start, and the move each starts with */
  phases: [number, number][];
  speed(m: MobSim): number;
  /** the next move, or 0 to just keep fighting */
  pick(c: Ctx): number;
  /** seconds between special moves */
  gap(m: MobSim): number;
}

// ---- hitting people --------------------------------------------------------------------------------------

type Test = (p: Prey) => boolean;
const inCircle = (x: number, z: number, r: number): Test => (p) => Math.hypot(p.x - x, p.z - z) < r + 0.3;
const inRing = (x: number, z: number, r0: number, r1: number): Test => (p) => { const d = Math.hypot(p.x - x, p.z - z); return d > r0 - 0.3 && d < r1 + 0.3; };
const inLine = (x: number, z: number, a: number, len: number, wid: number, from = -0.6): Test => (p) => {
  const [dx, dz] = fwd(a), px = p.x - x, pz = p.z - z, along = px * dx + pz * dz;
  return along > from && along < len && Math.abs(px * dz - pz * dx) < wid / 2 + 0.3;
};
const inCone = (x: number, z: number, a: number, len: number, half: number): Test => (p) => {
  const px = p.x - x, pz = p.z - z, d = Math.hypot(px, pz);
  if (d > len + 0.3) return false;
  return d < 1.2 || Math.abs(wrap(yawTo(px, pz) - a)) < half + Math.atan2(0.4, d);
};
/** Hurt everyone the test catches, once each per move (or per tick, for things that keep burning). */
function hurt(c: Ctx, test: Test, dmg: number) {
  for (const p of c.prey) {
    if (c.M.hit.has(p.id) || !test(p)) continue;
    c.M.hit.add(p.id);
    c.hooks.hurt(p.id, dmg, c.m);
  }
}
/** A telegraph or effect for everyone to see (bossfx.ts). */
function fx(c: Ctx, ev: Record<string, number | string>) {
  const out: Record<string, unknown> = { k: "bfx", id: c.m.id };
  for (const [k, v] of Object.entries(ev)) out[k] = typeof v === "number" ? r1(v) : v;
  c.hooks.event?.(out);
}

/** Somewhere a monster could stand: open, not rock, not lava or deep water. */
function standable(h: Horde, x: number, z: number) {
  const L = h.level;
  const i = Math.floor(x / CELL), j = Math.floor(z / CELL);
  if (i < 1 || j < 1 || i >= L.L.w - 1 || j >= L.L.h - 1 || L.isSolidCell(i, j) || !L.L.open[j * L.L.w + i]) return false;
  const s = L.L.surf[j * L.L.w + i];
  return s !== 1 && s !== 4;
}
const level = (h: Horde) => h.level;

/** Call up adds round the boss. They come awake, and can be made weaker (spiderlings). */
function summon(c: Ctx, kinds: MobKind[], rad = 3, hpMul = 1) {
  const { m, horde } = c, a0 = Math.random() * TAU;
  kinds.forEach((k, n) => {
    const a = a0 + (n / kinds.length) * TAU;
    let x = m.x + Math.cos(a) * rad, z = m.z + Math.sin(a) * rad;
    if (!level(horde).los(m.x, m.z, x, z)) { x = m.x + Math.cos(a) * 1.2; z = m.z + Math.sin(a) * 1.2; }
    const before = horde.sims.length;
    c.hooks.spawn(k, x, z);
    const s = horde.sims[before];
    if (s) {
      s.state = 1;
      if (hpMul !== 1) s.hp = s.max = Math.max(1, Math.round(s.max * hpMul));
      fx(c, { fx: "puff", x: s.x, z: s.z, s: c.kit === KITS.wyrm ? "fire" : c.kit === KITS.engine ? "water" : c.kit === KITS.rime ? "ice" : c.kit === KITS.owner ? "ghost" : "dust" });
    }
  });
}

// ---- moves, made to measure for each boss ----------------------------------------------------------------

type Style = "dust" | "water" | "fire" | "ice" | "ghost";

/** A ground slam: a ring on the floor, around itself or a little way in front, that fills and then hits. */
function slam(r: number, dmg: number, wind: number, ahead: number, s: Style): Move {
  return {
    wind, act: 0.15, rec: 0.7,
    begin(c) {
      const [dx, dz] = fwd(c.m.yaw);
      c.M.x = c.m.x + dx * ahead; c.M.z = c.m.z + dz * ahead;
      fx(c, { fx: "ring", x: c.M.x, z: c.M.z, r, t: wind, s });
    },
    fire(c) { hurt(c, inCircle(c.M.x, c.M.z, r), dmg); },
  };
}
/** A swipe: a quick cone in front, tracking you for most of the wind-up. */
function swipe(len: number, half: number, dmg: number, wind: number, s: Style): Move {
  return {
    wind, act: 0.12, rec: 0.45,
    begin(c) { fx(c, { fx: "cone", x: c.m.x, z: c.m.z, a: c.m.yaw, l: len, h: half, t: wind, s, follow: 1 }); },
    aim(c) { if (c.best && c.M.t > wind * 0.35) turnTo(c, c.best.x, c.best.z, 5); },
    fire(c) { hurt(c, inCone(c.m.x, c.m.z, c.m.yaw, len, half), dmg); },
  };
}
/** A beam brought down in a line in front. */
function beamSlam(len: number, wid: number, dmg: number, wind: number, s: Style): Move {
  return {
    wind, act: 0.15, rec: 0.9,
    begin(c) { c.M.a = c.m.yaw; c.M.x = c.m.x; c.M.z = c.m.z; fx(c, { fx: "line", x: c.m.x, z: c.m.z, a: c.M.a, l: len, w: wid, t: wind, s }); },
    fire(c) { hurt(c, inLine(c.M.x, c.M.z, c.M.a, len, wid), dmg); },
  };
}
/** A shockwave: the outer edge is marked, then a ring of force rolls out to it. */
function shock(r: number, dmg: number, wind: number, s: Style): Move {
  const dur = r / 13;
  return {
    wind, act: dur, rec: 0.6,
    begin(c) { c.M.x = c.m.x; c.M.z = c.m.z; fx(c, { fx: "wave", x: c.m.x, z: c.m.z, r, t: wind, d: dur, s }); },
    run(c) {
      const front = r * (1 - c.M.t / dur);
      hurt(c, inRing(c.M.x, c.M.z, front - 1.1, front + 0.4), dmg);
    },
  };
}
/** A charge: a line down the floor, then it comes down it fast, flattening anyone in the way. */
function charge(len: number, wid: number, dmg: number, wind: number, speed: number, s: Style): Move {
  return {
    wind, act: len / speed, rec: 0.9,
    begin(c) {
      if (c.best) c.M.a = yawTo(c.best.x - c.m.x, c.best.z - c.m.z); else c.M.a = c.m.yaw;
      c.m.yaw = c.M.a;
      fx(c, { fx: "line", x: c.m.x, z: c.m.z, a: c.M.a, l: len, w: wid, t: wind, s });
    },
    run(c) {
      const [dx, dz] = fwd(c.M.a), x = c.m.x, z = c.m.z;
      c.m.x += dx * speed * c.dt; c.m.z += dz * speed * c.dt;
      c.horde.collide(c.m);
      c.m.yaw = c.M.a;
      hurt(c, inCircle(c.m.x, c.m.z, radius(c.m) + 0.5), dmg);
      // ran into the rock: stop, stunned a moment
      if (Math.hypot(c.m.x - x, c.m.z - z) < speed * c.dt * 0.3) { c.M.t = 0; fx(c, { fx: "puff", x: c.m.x + dx * radius(c.m), z: c.m.z + dz * radius(c.m), s }); }
    },
  };
}
/** A leap onto you: the landing is marked, then it comes down there. */
function leap(r: number, dmg: number, wind: number, s: Style): Move {
  const flight = 0.55;
  return {
    wind, act: flight, rec: 0.6,
    begin(c) {
      const b = c.best ?? { x: c.m.x, z: c.m.z };
      let x = b.x, z = b.z;
      if (!standable(c.horde, x, z) || !level(c.horde).los(c.m.x, c.m.z, x, z)) { x = c.m.x; z = c.m.z; }
      c.M.x = x; c.M.z = z; c.M.x0 = c.m.x; c.M.z0 = c.m.z;
      c.m.yaw = yawTo(x - c.m.x, z - c.m.z);
      fx(c, { fx: "ring", x, z, r, t: wind + flight, s });
    },
    run(c) {
      const k = 1 - c.M.t / flight;
      c.m.x = c.M.x0 + (c.M.x - c.M.x0) * k; c.m.z = c.M.z0 + (c.M.z - c.M.z0) * k;
      if (c.M.t <= c.dt) hurt(c, inCircle(c.M.x, c.M.z, r), dmg);
    },
  };
}
/** Something called down on everyone at once: a ring under each of them, then ice, or the roof. */
function rain(r: number, dmg: number, wind: number, s: Style, extra = 0): Move {
  return {
    wind, act: 0.15, rec: 0.6,
    begin(c) {
      c.M.pts = c.prey.map((p) => [p.x, p.z]);
      for (let n = 0; n < extra; n++) {
        const a = Math.random() * TAU, d = Math.random() * c.M.R * 0.7;
        const x = c.M.cx + Math.cos(a) * d, z = c.M.cz + Math.sin(a) * d;
        if (standable(c.horde, x, z)) c.M.pts.push([x, z]);
      }
      for (const [x, z] of c.M.pts) fx(c, { fx: "ring", x, z, r, t: wind, s });
    },
    fire(c) { for (const [x, z] of c.M.pts) hurt(c, inCircle(x, z, r), dmg); },
  };
}
/** Calling up adds (usually how a phase starts). */
function call(kinds: (m: MobSim) => MobKind[], hpMul = 1, wind = 1.2): Move {
  return { wind, act: 0.2, rec: 0.6, fire(c) { summon(c, kinds(c.m), 3, hpMul); } };
}
/** Something it keeps doing in front of it for a while (steam, fire), turning slowly after you. */
function spray(shape: "cone" | "line", len: number, size: number, dps: number, wind: number, act: number, turn: (m: MobSim) => number, s: Style): Move {
  const every = 0.25;
  return {
    wind, act, rec: 0.7,
    begin(c) {
      c.M.tick = 0;
      fx(c, shape === "cone" ? { fx: "cone", x: c.m.x, z: c.m.z, a: c.m.yaw, l: len, h: size, t: wind, s, follow: 1 }
        : { fx: "line", x: c.m.x, z: c.m.z, a: c.m.yaw, l: len, w: size, t: wind, s, follow: 1 });
    },
    aim(c) { if (c.best) turnTo(c, c.best.x, c.best.z, 2.5); },
    fire(c) { fx(c, { fx: shape === "cone" ? "steam" : "breath", l: len, h: size, d: act, s }); },
    run(c) {
      if (c.best) turnTo(c, c.best.x, c.best.z, turn(c.m));
      c.M.tick -= c.dt;
      if (c.M.tick > 0) return;
      c.M.tick = every;
      c.M.hit.clear();
      hurt(c, shape === "cone" ? inCone(c.m.x, c.m.z, c.m.yaw, len, size) : inLine(c.m.x, c.m.z, c.m.yaw, len, size), Math.round(dps * every));
    },
  };
}

function turnTo(c: Ctx, x: number, z: number, rate: number) {
  const want = yawTo(x - c.m.x, z - c.m.z);
  c.m.yaw += Math.max(-rate * c.dt, Math.min(rate * c.dt, wrap(want - c.m.yaw)));
}

// ---- the bosses -----------------------------------------------------------------------------------------

const pickOf = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];

/** The Grout: slams, a shockwave that rolls out across the cavern, the roof brought down on you, blobs. */
const grout: Kit = {
  moves: {
    [MOVE.SLAM]: slam(4.4, 30, 1.1, 0, "dust"),
    [MOVE.SHOCK]: shock(11, 22, 1.3, "dust"),
    [MOVE.FROST]: rain(2.3, 26, 1.5, "dust", 2),
    [MOVE.SUMMON]: call((m) => Array(3 + m.phase).fill("blob")),
  },
  phases: [[0.66, MOVE.SUMMON], [0.33, MOVE.SUMMON]],
  speed: (m) => (m.phase >= 2 ? 1.3 : 1),
  pick(c) {
    if (c.M.gap <= 0) return c.m.phase >= 1 && Math.random() < 0.5 ? MOVE.FROST : MOVE.SHOCK;
    if (c.bestD < 4.6 + radius(c.m) - 1.7 && c.m.cd <= 0) { c.m.cd = 2.4; return MOVE.SLAM; }
    return 0;
  },
  gap: (m) => 5.5 - m.phase * 0.8 + Math.random() * 2,
};

/** The Drowned Engine: its beam slams down, it vents steam, floods the cavern's edges, and lurches at you. */
const engine: Kit = {
  moves: {
    [MOVE.SLAM]: beamSlam(8, 2.6, 34, 1.2, "water"),
    [MOVE.STEAM]: spray("cone", 8.5, 0.5, 30, 1.0, 1.8, () => 0.6, "water"),
    [MOVE.FLOOD]: {
      wind: 2.0, act: 4.0, rec: 0.8,
      begin(c) { c.M.tick = 0; fx(c, { fx: "edge", x: c.M.cx, z: c.M.cz, r0: c.M.R * 0.55, r1: c.M.R + 3, t: 2.0, d: 4.0, s: "water" }); },
      run(c) {
        c.M.tick -= c.dt;
        if (c.M.tick > 0) return;
        c.M.tick = 0.5; c.M.hit.clear();
        hurt(c, inRing(c.M.cx, c.M.cz, c.M.R * 0.55, c.M.R + 4), 7);
      },
    },
    [MOVE.CHARGE]: charge(13, 2.6, 30, 1.1, 16, "water"),
    [MOVE.SUMMON]: call((m) => (m.phase === 1 ? ["rat", "rat", "rat", "rat"] : ["ghoul", "ghoul", "blob", "blob"])),
  },
  phases: [[0.66, MOVE.SUMMON], [0.33, MOVE.SUMMON]],
  speed: (m) => (m.phase >= 2 ? 1.25 : 1),
  pick(c) {
    if (c.M.gap > 0) { if (c.bestD < 6.5 && c.m.cd <= 0) { c.m.cd = 2.6; return MOVE.SLAM; } return 0; }
    const opts: number[] = [MOVE.STEAM, MOVE.STEAM];
    if (c.m.phase >= 1) opts.push(MOVE.FLOOD, MOVE.FLOOD);
    if (c.m.phase >= 2) opts.push(MOVE.CHARGE, MOVE.CHARGE);
    if (c.bestD > 9) opts.push(MOVE.CHARGE);
    return pickOf(opts);
  },
  gap: (m) => 5 - m.phase * 0.7 + Math.random() * 2,
};

/** The Cinder Wyrm: breathes fire down a line, sweeps its tail, bites, and dives into the lava to come up under you. */
const wyrm: Kit = {
  moves: {
    [MOVE.SWIPE]: swipe(4.2, 0.65, 22, 0.55, "fire"),
    [MOVE.TAIL]: slam(4.8, 26, 0.8, 0, "fire"),
    [MOVE.BREATH]: spray("line", 13, 2.6, 40, 1.1, 1.4, (m) => (m.phase >= 2 ? 0.8 : 0.25), "fire"),
    [MOVE.DIVE]: {
      wind: 0.8, act: 1.6, rec: 0, then: MOVE.SURFACE,
      begin(c) { fx(c, { fx: "puff", x: c.m.x, z: c.m.z, s: "fire" }); },
      fire(c) {
        // under the lava: pick a pool near whoever it's after (or just dig through the floor)
        const b = c.best ?? { x: c.M.cx, z: c.M.cz };
        let dest: number[] | null = null, bestD = Infinity;
        for (const p of c.M.lava) {
          const d = Math.hypot(p[0] - b.x, p[1] - b.z) + Math.random() * 2;
          if (Math.hypot(p[0] - c.m.x, p[1] - c.m.z) > 4 && d < bestD) { bestD = d; dest = p; }
        }
        if (!dest || bestD > 6) {
          const a = Math.random() * TAU, x = b.x + Math.cos(a) * 1.5, z = b.z + Math.sin(a) * 1.5;
          dest = standable(c.horde, x, z) ? [x, z] : [b.x, b.z];
        }
        c.M.x0 = c.m.x; c.M.z0 = c.m.z; c.M.x = dest[0]; c.M.z = dest[1];
        c.m.move = MOVE.UNDER;
        fx(c, { fx: "ring", x: dest[0], z: dest[1], r: 3.4, t: 1.6 + 0.5, s: "fire" });
      },
      run(c) {
        const k = 1 - c.M.t / 1.6;
        c.m.x = c.M.x0 + (c.M.x - c.M.x0) * k; c.m.z = c.M.z0 + (c.M.z - c.M.z0) * k;
      },
    },
    [MOVE.SURFACE]: {
      wind: 0.5, act: 0.2, rec: 0.9,
      begin(c) { c.m.x = c.M.x; c.m.z = c.M.z; if (c.best) c.m.yaw = yawTo(c.best.x - c.m.x, c.best.z - c.m.z); },
      fire(c) { hurt(c, inCircle(c.m.x, c.m.z, 3.4), 30); },
    },
    [MOVE.SUMMON]: call((m) => (m.phase === 1 ? ["wisp", "wisp", "wisp"] : ["wisp", "wisp", "gazer"])),
  },
  phases: [[0.66, MOVE.SUMMON], [0.33, MOVE.SUMMON]],
  speed: (m) => (m.phase >= 2 ? 1.2 : 1),
  pick(c) {
    if (c.M.gap > 0 && c.bestD < 14) {
      if (c.bestD < 5 && c.m.cd <= 0) { c.m.cd = 1.8; return Math.random() < 0.45 ? MOVE.TAIL : MOVE.SWIPE; }
      return 0;
    }
    return c.bestD > 11 || Math.random() < 0.45 ? MOVE.DIVE : MOVE.BREATH;
  },
  gap: (m) => 4.5 - m.phase * 0.6 + Math.random() * 2,
};

/** Ice spikes in a line, frost called down on everyone. */
function spikes(dmg: number): Move {
  const len = 16, speed = 13;
  return {
    wind: 1.0, act: len / speed, rec: 0.7,
    begin(c) {
      const a = c.best ? yawTo(c.best.x - c.m.x, c.best.z - c.m.z) : c.m.yaw;
      c.m.yaw = a; c.M.x = c.m.x; c.M.z = c.m.z;
      c.M.pts = (c.m.phase >= 1 ? [a - 0.38, a, a + 0.38] : [a]).map((q) => [q]);
      for (const [q] of c.M.pts) fx(c, { fx: "spikes", x: c.m.x, z: c.m.z, a: q, l: len, t: 1.0, v: speed, s: "ice" });
    },
    run(c) {
      const front = len * (1 - c.M.t / (len / speed));
      for (const [q] of c.M.pts) hurt(c, inLine(c.M.x, c.M.z, q, front, 1.8, Math.max(0.8, front - 2.5)), dmg);
    },
  };
}

/** The Rime Quarryman: a sweeping pick, a pick slam, spikes of ice, frost from the roof; shatters halfway into something faster. */
const rime: Kit = {
  moves: {
    [MOVE.SWIPE]: swipe(4.4, 1.1, 24, 0.75, "ice"),
    [MOVE.SLAM]: slam(2.6, 34, 1.0, 2.6, "ice"),
    [MOVE.SPIKES]: spikes(26),
    [MOVE.FROST]: rain(2.4, 24, 1.6, "ice", 2),
    [MOVE.SHATTER]: {
      wind: 1.6, act: 0.2, rec: 0.9,
      begin(c) { fx(c, { fx: "ring", x: c.m.x, z: c.m.z, r: 6.5, t: 1.6, s: "ice" }); },
      fire(c) { hurt(c, inCircle(c.m.x, c.m.z, 6.5), 28); summon(c, ["ghoul", "ghoul"], 4); },
    },
    [MOVE.SUMMON]: call(() => ["wisp", "wisp", "wisp"]),
  },
  phases: [[0.5, MOVE.SHATTER], [0.25, MOVE.SUMMON]],
  speed: (m) => (m.phase >= 1 ? 1.4 : 1),
  pick(c) {
    if (c.M.gap > 0) {
      if (c.bestD < 4.6 && c.m.cd <= 0) { c.m.cd = c.m.phase ? 1.4 : 2.0; return Math.random() < 0.55 ? MOVE.SWIPE : MOVE.SLAM; }
      return 0;
    }
    return c.m.phase >= 1 && Math.random() < 0.45 ? MOVE.FROST : Math.random() < 0.7 ? MOVE.SPIKES : MOVE.FROST;
  },
  gap: (m) => (m.phase ? 3.6 : 5) + Math.random() * 2,
};

/** The Owner's Ghost: flits about, rakes with his cane, throws ledgers, curses you, calls up the men who died for him. */
const owner: Kit = {
  moves: {
    [MOVE.SWIPE]: swipe(3.4, 0.9, 20, 0.6, "ghost"),
    [MOVE.THROW]: {
      wind: 0.7, act: 1.1, rec: 0.5,
      begin(c) {
        const b = c.best ?? { x: c.m.x, z: c.m.z };
        const n = c.m.phase >= 2 ? 5 : 3;
        c.M.pts = [];
        for (let k = 0; k < n; k++) {
          const a = Math.random() * TAU, d = k === 0 ? 0 : 1.5 + Math.random() * 2;
          const x = b.x + Math.cos(a) * d, z = b.z + Math.sin(a) * d;
          c.M.pts.push(standable(c.horde, x, z) ? [x, z] : [b.x, b.z]);
        }
        c.m.yaw = yawTo(b.x - c.m.x, b.z - c.m.z);
      },
      fire(c) { for (const [x, z] of c.M.pts) fx(c, { fx: "throw", x0: c.m.x, z0: c.m.z, x, z, r: 1.7, t: 1.1, s: "ghost" }); },
      run(c) { if (c.M.t <= c.dt) for (const [x, z] of c.M.pts) hurt(c, inCircle(x, z, 1.7), 18); },
    },
    [MOVE.CURSE]: {
      wind: 0.8, act: 2.4, rec: 0.4,
      begin(c) {
        const who = c.m.phase >= 2 ? c.prey : c.best ? [c.best] : [];
        c.M.ids = who.map((p) => p.id);
        c.M.pts = who.map((p) => [p.x, p.z]);
        for (const id of c.M.ids) fx(c, { fx: "curse", to: id, t: 0.8 + 1.8, r: 2.4, s: "ghost" });
      },
      run(c) {
        const left = c.M.t;
        if (left > 0.6) {
          // it follows you till it settles
          c.M.ids.forEach((id, n) => { const p = c.prey.find((q) => q.id === id); if (p) c.M.pts[n] = [p.x, p.z]; });
        } else if (c.M.tick === 0) {
          c.M.tick = 1;
          for (const [x, z] of c.M.pts) fx(c, { fx: "ring", x, z, r: 2.4, t: 0.6, s: "ghost" });
        }
        if (left <= c.dt) for (const [x, z] of c.M.pts) hurt(c, inCircle(x, z, 2.4), 32);
      },
    },
    [MOVE.BLINK]: {
      wind: 0.6, act: 0.15, rec: 0, then: MOVE.SWIPE,
      fire(c) {
        // behind whoever it's after, or anywhere in the cavern
        const b = c.best;
        let x = c.M.cx, z = c.M.cz;
        if (b) {
          const a = yawTo(b.x - c.m.x, b.z - c.m.z), [dx, dz] = fwd(a);
          for (const d of [2.6, 1.8, -2.4]) {
            const tx = b.x + dx * d, tz = b.z + dz * d;
            if (standable(c.horde, tx, tz) && level(c.horde).los(b.x, b.z, tx, tz)) { x = tx; z = tz; break; }
          }
        }
        fx(c, { fx: "blink", x0: c.m.x, z0: c.m.z, x, z, s: "ghost" });
        c.m.x = x; c.m.z = z;
        if (b) c.m.yaw = yawTo(b.x - x, b.z - z);
      },
    },
    [MOVE.SUMMON]: call((m) => (m.phase === 1 ? ["ghoul", "ghoul", "wisp"] : m.phase === 2 ? ["ghoul", "ghoul", "headless"] : ["wisp", "wisp", "ghoul", "ghoul"]), 1, 1.5),
  },
  phases: [[0.75, MOVE.SUMMON], [0.5, MOVE.SUMMON], [0.25, MOVE.SUMMON]],
  speed: (m) => 1 + m.phase * 0.08,
  pick(c) {
    if (c.M.gap > 0) { if (c.bestD < 3.4 && c.m.cd <= 0) { c.m.cd = 1.6; return MOVE.SWIPE; } return 0; }
    const opts: number[] = [MOVE.THROW, MOVE.THROW, MOVE.CURSE, MOVE.BLINK];
    if (c.bestD > 8) opts.push(MOVE.BLINK);
    return pickOf(opts);
  },
  gap: (m) => 3.8 - m.phase * 0.4 + Math.random() * 1.8,
};

const KITS: Partial<Record<MobKind, Kit>> = { grout, engine, wyrm, rime, owner };

// ---- mini-bosses: their kind's fight, plus a couple of special moves ----------------------------------------

const MINI_KITS: Partial<Record<MobKind, Kit>> = {
  // The Foreman: a headless brute who charges down the heading and brings his axe down in a ring
  headless: {
    moves: { [MOVE.CHARGE]: charge(10, 1.8, 24, 1.0, 14, "dust"), [MOVE.SLAM]: slam(3.4, 24, 1.0, 0, "dust") },
    phases: [],
    speed: () => 1,
    pick(c) { return c.M.gap <= 0 ? (c.bestD > 4.5 ? MOVE.CHARGE : MOVE.SLAM) : 0; },
    gap: () => 4.5 + Math.random() * 2,
  },
  // The Brood Mother: a huge spider that pounces and lets out spiderlings
  spider: {
    moves: { [MOVE.LEAP]: leap(2.4, 22, 0.8, "dust"), [MOVE.SUMMON]: call(() => ["spider", "spider", "spider"], 0.45, 1.0) },
    phases: [[0.66, MOVE.SUMMON], [0.33, MOVE.SUMMON]],
    speed: () => 1,
    pick(c) { return c.M.gap <= 0 && c.bestD > 2.5 ? MOVE.LEAP : 0; },
    gap: () => 4 + Math.random() * 2,
  },
  // The Gaffer: the ganger of the dead men, who leaps, slams, and calls the gang
  ghoul: {
    moves: { [MOVE.LEAP]: leap(2.6, 20, 0.9, "ghost"), [MOVE.SLAM]: slam(3.0, 20, 0.9, 0, "ghost"), [MOVE.SUMMON]: call(() => ["ghoul", "ghoul"], 0.6) },
    phases: [[0.6, MOVE.SUMMON], [0.3, MOVE.SUMMON]],
    speed: () => 1,
    pick(c) { return c.M.gap <= 0 ? (c.bestD > 4 ? MOVE.LEAP : MOVE.SLAM) : 0; },
    gap: () => 4.5 + Math.random() * 2,
  },
  // The Kiln Golem: stamps out a shockwave and hurls burning blocks
  golem: {
    moves: {
      [MOVE.SHOCK]: shock(8, 20, 1.2, "fire"),
      [MOVE.THROW]: {
        wind: 0.9, act: 1.0, rec: 0.6,
        begin(c) { const b = c.best ?? c.m; c.M.pts = [[b.x, b.z]]; c.m.yaw = yawTo(b.x - c.m.x, b.z - c.m.z); },
        fire(c) { for (const [x, z] of c.M.pts) fx(c, { fx: "throw", x0: c.m.x, z0: c.m.z, x, z, r: 2.2, t: 1.0, s: "fire" }); },
        run(c) { if (c.M.t <= c.dt) for (const [x, z] of c.M.pts) hurt(c, inCircle(x, z, 2.2), 26); },
      },
    },
    phases: [],
    speed: () => 1,
    pick(c) { return c.M.gap <= 0 ? (c.bestD < 6 ? MOVE.SHOCK : MOVE.THROW) : 0; },
    gap: () => 5 + Math.random() * 2,
  },
};

/** Everything a boss knows about where it is. */
function fresh(m: MobSim, h: Horde): Mem {
  const lv = level(h), L = lv.L;
  let cx = m.homeX, cz = m.homeZ, R = 10;
  if (L.boss && !m.mini && L.rooms[1]) {
    const a = L.rooms[1];
    cx = ((a.i0 + a.i1 + 1) / 2) * CELL; cz = ((a.j0 + a.j1 + 1) / 2) * CELL;
    R = (Math.min(a.i1 - a.i0, a.j1 - a.j0) / 2) * CELL;
  }
  const lava: number[][] = [];
  if (MOBS[m.kind].wade) {
    for (let j = 0; j < L.h; j++) for (let i = 0; i < L.w; i++) {
      const x = (i + 0.5) * CELL, z = (j + 0.5) * CELL;
      if (L.surf[j * L.w + i] === 1 && Math.hypot(x - cx, z - cz) < R + 2) lava.push([x, z]);
    }
  }
  return { mv: 0, stage: 0, t: 0, x: 0, z: 0, a: 0, x0: 0, z0: 0, gap: m.mini ? 3 : 2.5, tick: 0, hit: new Set(), pts: [], ids: [], pend: 0, sp: false, cx, cz, R, lava, next: 0 };
}

function start(c: Ctx, id: number) {
  const mv = c.kit.moves[id];
  if (!mv) return;
  const { m, M } = c;
  M.mv = id; M.stage = 0; M.t = mv.wind; M.hit.clear(); M.tick = 0; M.pts = []; M.ids = [];
  m.move = id; m.state = 2;
  if (c.best && id !== MOVE.SURFACE) m.yaw = yawTo(c.best.x - m.x, c.best.z - m.z);
  mv.begin?.(c);
}

function step(c: Ctx) {
  const { m, M, kit } = c;
  const mv = M.mv === MOVE.STUN ? STUNNED : kit.moves[M.mv];
  if (!mv) { M.mv = 0; m.move = 0; return; }
  M.t -= c.dt;
  if (M.stage === 0) {
    mv.aim?.(c);
    if (M.t > 0) return;
    M.stage = 1; M.t = mv.act; m.state = 1;
    if (M.pend) { m.phase = M.pend; M.pend = 0; c.hooks.event?.({ k: "bphase", id: m.id, p: m.phase, kind: m.kind }); }
    c.hooks.sound("swing", m);
    mv.fire?.(c);
    if (M.t <= 0) mv.run?.(c);
  } else if (M.stage === 1) {
    mv.run?.(c);
    if (M.t <= 0) { M.stage = 2; M.t = mv.rec; }
  } else if (M.t <= 0) {
    M.mv = 0; m.move = 0;
    if (mv.then) { start(c, mv.then); return; }
    // only specials restart the wait for the next special: ordinary blows in between don't put it off
    if (M.sp) { M.gap = kit.gap(m); M.sp = false; }
  }
}

/** The brain the Horde calls for every monster: returns false for anything that isn't a boss. */
export const bossBrain: Brain = (m, dt, best, bestD, prey, hooks, horde) => {
  const kit = m.mini ? MINI_KITS[m.kind] : KITS[m.kind];
  if (!kit) return false;
  let M = mem.get(m);
  if (!M) { M = fresh(m, horde); mem.set(m, M); m.move = 0; }
  const c: Ctx = { m, M, dt, best, bestD, prey, hooks, horde, kit };
  if (m.state !== 0) M.gap -= dt;
  if (M.mv) { step(c); return true; }
  // asleep, or no one about: carry on as an ordinary monster would
  if (!best || m.state === 0) return false;
  // a mini-boss in the middle of an ordinary blow
  if (m.state === 2) return false;
  // a new phase starts with its move
  let p = 0;
  kit.phases.forEach(([f], n) => { if (m.hp < m.max * f) p = n + 1; });
  if (p > m.phase) { M.pend = p; M.sp = true; start(c, kit.phases[p - 1][1]); return true; }
  const mv = kit.pick(c);
  if (mv) { M.sp = M.gap <= 0; start(c, mv); return true; }
  if (m.mini) return false;
  // a boss walks at you between moves
  const d = MOBS[m.kind];
  if (bestD > d.reach * 0.8 + radius(m) - d.r) horde.chase(m, best, d.speed * kit.speed(m), dt);
  else turnTo(c, best.x, best.z, 4);
  return true;
};
