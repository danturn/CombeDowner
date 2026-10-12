// Monsters. Like the chavs in the main game, the host runs them all and sends everyone where they
// are; everyone else just draws them (mobviews.ts) and tells the host when they hit one.
import { CELL, MobKind } from "./gen";
import type { MineLevel } from "./level";

export interface MobDef {
  name: string; hp: number; speed: number; dmg: number; reach: number; windup: number; cd: number;
  aggro: number; r: number; h: number; fly: boolean;   // h: how tall, for arrows and bolts
  ranged?: { range: number; dmg: number; windup: number; cd: number };   // a gaze or a spark from afar
  blink?: boolean;     // darts about
  ceiling?: boolean;   // hangs from the roof till something comes by
  still?: boolean;     // doesn't wander when idle
  wade?: boolean;      // walks through lava and deep water (bosses)
}
export const MOBS: Record<MobKind, MobDef> = {
  ghoul: { name: "Quarryman's ghoul", hp: 40, speed: 2.9, dmg: 9, reach: 1.6, windup: 0.45, cd: 1.2, aggro: 13, r: 0.4, h: 1.8, fly: false },
  bat: { name: "Horseshoe bat", hp: 10, speed: 5.4, dmg: 3, reach: 1.3, windup: 0.2, cd: 0.8, aggro: 10, r: 0.25, h: 0.5, fly: true },
  golem: { name: "Ashlar golem", hp: 130, speed: 1.9, dmg: 22, reach: 2.1, windup: 0.8, cd: 2.0, aggro: 12, r: 0.7, h: 2.3, fly: false },
  blob: { name: "Grout blob", hp: 28, speed: 2.5, dmg: 7, reach: 1.4, windup: 0.35, cd: 1.0, aggro: 14, r: 0.45, h: 0.9, fly: false },
  grout: { name: "The Grout", hp: 1000, speed: 2.0, dmg: 26, reach: 3.4, windup: 1.0, cd: 2.2, aggro: 18, r: 1.7, h: 3.2, fly: false },
  rat: { name: "Pit rat", hp: 12, speed: 5.0, dmg: 4, reach: 1.1, windup: 0.25, cd: 0.7, aggro: 11, r: 0.25, h: 0.4, fly: false },
  headless: { name: "Headless", hp: 70, speed: 3.3, dmg: 15, reach: 1.9, windup: 0.55, cd: 1.3, aggro: 13, r: 0.45, h: 2.0, fly: false },
  reaper: { name: "Root reaper", hp: 170, speed: 1.2, dmg: 22, reach: 2.9, windup: 0.9, cd: 1.8, aggro: 7, r: 0.7, h: 2.6, fly: false, still: true },
  gazer: { name: "Gazer", hp: 45, speed: 1.8, dmg: 6, reach: 1.3, windup: 0.3, cd: 1.0, aggro: 16, r: 0.45, h: 0.9, fly: true,
    ranged: { range: 11, dmg: 12, windup: 0.9, cd: 2.4 } },
  spider: { name: "Cave spider", hp: 35, speed: 4.0, dmg: 9, reach: 1.4, windup: 0.35, cd: 1.0, aggro: 7, r: 0.45, h: 0.6, fly: false, ceiling: true, still: true },
  wisp: { name: "Wisp", hp: 22, speed: 3.5, dmg: 4, reach: 1.0, windup: 0.2, cd: 1.0, aggro: 15, r: 0.3, h: 0.5, fly: true, blink: true,
    ranged: { range: 9, dmg: 8, windup: 0.6, cd: 1.8 } },
  knocker: { name: "Knocker", hp: 40, speed: 2.9, dmg: 9, reach: 1.6, windup: 0.45, cd: 1.2, aggro: 13, r: 0.4, h: 1.8, fly: false },
  mimic: { name: "Strongbox mimic", hp: 40, speed: 2.9, dmg: 9, reach: 1.6, windup: 0.45, cd: 1.2, aggro: 13, r: 0.4, h: 1.8, fly: false },
  puffcap: { name: "Puffcap", hp: 40, speed: 2.9, dmg: 9, reach: 1.6, windup: 0.45, cd: 1.2, aggro: 13, r: 0.4, h: 1.8, fly: false },
  centipede: { name: "Giant centipede", hp: 40, speed: 2.9, dmg: 9, reach: 1.6, windup: 0.45, cd: 1.2, aggro: 13, r: 0.4, h: 1.8, fly: false },
  beetle: { name: "Fire beetle", hp: 40, speed: 2.9, dmg: 9, reach: 1.6, windup: 0.45, cd: 1.2, aggro: 13, r: 0.4, h: 1.8, fly: false },
  drowned: { name: "Drowned miner", hp: 40, speed: 2.9, dmg: 9, reach: 1.6, windup: 0.45, cd: 1.2, aggro: 13, r: 0.4, h: 1.8, fly: false },
  wight: { name: "Frost wight", hp: 40, speed: 2.9, dmg: 9, reach: 1.6, windup: 0.45, cd: 1.2, aggro: 13, r: 0.4, h: 1.8, fly: false },
  wraith: { name: "Wraith", hp: 40, speed: 2.9, dmg: 9, reach: 1.6, windup: 0.45, cd: 1.2, aggro: 13, r: 0.4, h: 1.8, fly: false },
  troll: { name: "Cave troll", hp: 40, speed: 2.9, dmg: 9, reach: 1.6, windup: 0.45, cd: 1.2, aggro: 13, r: 0.4, h: 1.8, fly: false },
  crossbow: { name: "Bone crossbowman", hp: 40, speed: 2.9, dmg: 9, reach: 1.6, windup: 0.45, cd: 1.2, aggro: 13, r: 0.4, h: 1.8, fly: false },
  engine: { name: "The Drowned Engine", hp: 1000, speed: 1.7, dmg: 30, reach: 4.0, windup: 1.1, cd: 2.0, aggro: 18, r: 1.9, h: 4.2, fly: false, wade: true },
  wyrm: { name: "The Cinder Wyrm", hp: 1000, speed: 2.5, dmg: 24, reach: 3.4, windup: 0.6, cd: 1.6, aggro: 18, r: 1.5, h: 2.6, fly: false, wade: true },
  rime: { name: "The Rime Quarryman", hp: 1000, speed: 2.1, dmg: 28, reach: 3.6, windup: 0.8, cd: 1.8, aggro: 18, r: 1.4, h: 3.8, fly: false },
  owner: { name: "The Owner's Ghost", hp: 900, speed: 2.3, dmg: 20, reach: 2.6, windup: 0.6, cd: 1.6, aggro: 18, r: 0.8, h: 2.5, fly: false },
};
export const KINDS: MobKind[] = ["ghoul", "bat", "golem", "blob", "grout", "rat", "headless", "reaper", "gazer", "spider", "wisp", "knocker", "mimic", "puffcap", "centipede", "beetle", "drowned", "wight", "wraith", "troll", "crossbow", "engine", "wyrm", "rime", "owner"];
/** A champion (it carries the foreman's key) is tougher and hits harder. */
export const CHAMP = { hp: 2.5, dmg: 1.5, r: 1.25 };
/** A mini-boss (it guards the winze) is a much bigger, named one of its kind (see bosses.ts). */
export const MINI = { hp: 6, cap: 420, dmg: 1.4, r: 1.6 };

/** 0 idle, 1 chasing, 2 winding up an attack, 3 dead. */
export type MobState = 0 | 1 | 2 | 3;

/** One monster as the host simulates it. */
export interface MobSim {
  id: number; kind: MobKind; x: number; z: number; yaw: number; hp: number; max: number;
  state: MobState; t: number; cd: number; target: string; homeX: number; homeZ: number; wob: number; phase: number;
  champ: boolean; shot: boolean; blinkT: number;
  mini: boolean;   // a mini-boss
  move: number;    // the special move a boss is making (bosses.ts MOVE), 0 for none
}

/** How big a monster is, champions included. */
export const radius = (m: { kind: MobKind; champ: boolean; mini?: boolean }) => MOBS[m.kind].r * (m.champ ? CHAMP.r : 1) * (m.mini ? MINI.r : 1);

export interface Prey { id: string; x: number; z: number; batSafe: boolean }
export interface MobHooks {
  hurt(playerId: string, dmg: number, mob: MobSim): void;
  /** A ranged attack going off at a player: hit if they were still in sight. */
  zap(mob: MobSim, playerId: string, hit: boolean): void;
  spawn(kind: MobKind, x: number, z: number): void;
  sound(kind: "growl" | "swing", mob: MobSim): void;
  /** Something everyone should see happen (a boss's telegraphs, see bosses.ts). */
  event?(ev: Record<string, unknown>): void;
}

/**
 * A special brain for some monsters (bosses.ts). Called each frame for each live one once it's picked
 * who to go for (best may be null); returns true if it handled the monster itself this frame.
 */
export type Brain = (m: MobSim, dt: number, best: Prey | null, bestD: number, prey: Prey[], hooks: MobHooks, horde: Horde) => boolean;

export function newSim(id: number, kind: MobKind, x: number, z: number, scale = 1, champ = false, mini = false): MobSim {
  const base = mini ? Math.min(MOBS[kind].hp * MINI.hp, MINI.cap) : MOBS[kind].hp;
  const hp = Math.round(base * scale * (champ ? CHAMP.hp : 1));
  return { id, kind, x, z, yaw: Math.random() * 6.28, hp, max: hp, state: 0, t: 0, cd: 0, target: "", homeX: x, homeZ: z, wob: Math.random() * 10, phase: 0,
    champ, shot: false, blinkT: 1 + Math.random() * 2, mini, move: 0 };
}

/**
 * The host's monster brain. A flow field (steps to the nearest player from every cell, refreshed a
 * few times a second) gets them round pillars and along headings; once they can see you they come
 * straight at you.
 */
export class Horde {
  private flow: Int32Array;
  private flowT = 0;
  /** Bosses' brains (bosses.ts), if any. */
  brain: Brain | null = null;
  constructor(readonly level: MineLevel, public sims: MobSim[]) {
    this.flow = new Int32Array(level.L.w * level.L.h).fill(-1);
  }

  private refreshFlow(prey: Prey[]) {
    const { w, h } = this.level.L;
    const f = this.flow.fill(-1), q: number[] = [];
    for (const p of prey) {
      const k = Math.floor(p.z / CELL) * w + Math.floor(p.x / CELL);
      if (k >= 0 && k < f.length && f[k] < 0) { f[k] = 0; q.push(k); }
    }
    for (let n = 0; n < q.length; n++) {
      const k = q[n], i = k % w, j = (k - i) / w;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= w || jj >= h || !this.level.canWalk(ii, jj, i, j)) continue;
        const kk = jj * w + ii;
        if (f[kk] < 0) { f[kk] = f[k] + 1; q.push(kk); }
      }
    }
  }

  update(dt: number, prey: Prey[], hooks: MobHooks) {
    this.flowT -= dt;
    if (this.flowT <= 0) { this.flowT = 0.25; this.refreshFlow(prey); }
    const L = this.level, w = L.L.w;
    for (const m of this.sims) {
      if (m.state === 3) continue;
      const d = MOBS[m.kind];
      m.cd = Math.max(0, m.cd - dt);
      m.wob += dt;
      // who to go for: the nearest you can see (bats ignore anyone with the charm)
      let best: Prey | null = null, bestD = Infinity;
      for (const p of prey) {
        if (m.kind === "bat" && p.batSafe) continue;
        const dd = Math.hypot(p.x - m.x, p.z - m.z);
        const sees = dd < d.aggro && L.los(m.x, m.z, p.x, p.z);
        if ((sees || (m.state !== 0 && dd < d.aggro * 1.6) || dd < 3) && dd < bestD) { best = p; bestD = dd; }
      }
      if (best && m.state === 0) {
        m.state = 1;
        hooks.sound("growl", m);
        // wake the rest of the pack
        for (const o of this.sims) if (o.state === 0 && Math.hypot(o.x - m.x, o.z - m.z) < 7) o.state = 1;
      }
      if (this.brain && this.brain(m, dt, best, bestD, prey, hooks, this)) continue;
      if (!best) {
        if (m.state === 1) m.state = 0;
        // idle: drift about near home
        if (m.state === 0 && !d.still) {
          const tx = m.homeX + Math.sin(m.wob * 0.3 + m.id) * 1.5, tz = m.homeZ + Math.cos(m.wob * 0.23 + m.id * 2) * 1.5;
          this.move(m, tx - m.x, tz - m.z, d.speed * (m.kind === "bat" ? 0.6 : 0.25), dt);
        }
        continue;
      }
      m.target = best.id;
      if (m.state === 2) {
        // winding up: turn to face, then the blow lands on whoever is still in reach
        m.yaw = Math.atan2(-(best.x - m.x), -(best.z - m.z));
        m.t -= dt;
        if (m.t <= 0 && m.shot) {
          // a gaze or a spark: it hits if they're still in sight and range
          m.state = 1; m.shot = false;
          m.cd = d.ranged!.cd;
          const p = prey.find((q) => q.id === m.target);
          const hit = !!p && Math.hypot(p.x - m.x, p.z - m.z) < d.ranged!.range + 2 && L.los(m.x, m.z, p.x, p.z);
          hooks.zap(m, m.target, hit);
          if (hit) hooks.hurt(m.target, Math.round(d.ranged!.dmg * (m.champ ? CHAMP.dmg : 1)), m);
        } else if (m.t <= 0) {
          m.state = 1;
          m.cd = d.cd;
          hooks.sound("swing", m);
          for (const p of prey) {
            if (m.kind === "bat" && p.batSafe) continue;
            const reach = d.reach + 0.5 + radius(m) - d.r;
            if (Math.hypot(p.x - m.x, p.z - m.z) < reach && p.id === m.target) hooks.hurt(p.id, Math.round(d.dmg * (m.champ ? CHAMP.dmg : 1) * (m.mini ? MINI.dmg : 1)), m);
          }
        }
        continue;
      }
      if (bestD < d.reach + radius(m) - d.r && m.cd <= 0) { m.state = 2; m.t = d.windup; continue; }
      const sees = L.los(m.x, m.z, best.x, best.z);
      if (d.ranged && sees && bestD < d.ranged.range) {
        // shooters keep their distance: charge up from where they are, back off if you get close
        if (m.cd <= 0 && bestD > d.reach) { m.state = 2; m.t = d.ranged.windup; m.shot = true; continue; }
        if (bestD < 3.5) this.move(m, m.x - best.x, m.z - best.z, d.speed * 0.7, dt);
        else m.yaw = Math.atan2(-(best.x - m.x), -(best.z - m.z));
        if (d.blink) this.blink(m, best, dt);
        continue;
      }
      if (d.blink) this.blink(m, best, dt);
      // chase: straight at them if they're in sight and near, otherwise down the flow field
      let dx = best.x - m.x, dz = best.z - m.z;
      if (!(bestD < 8 && sees)) {
        const ci = Math.floor(m.x / CELL), cj = Math.floor(m.z / CELL);
        let bi = ci, bj = cj, bf = this.flow[cj * w + ci];
        if (bf < 0) bf = 1e9;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const f = this.flow[(cj + dj) * w + ci + di];
          if (f >= 0 && f < bf) { bf = f; bi = ci + di; bj = cj + dj; }
        }
        dx = (bi + 0.5) * CELL - m.x; dz = (bj + 0.5) * CELL - m.z;
      }
      if (bestD > d.reach * 0.7) this.move(m, dx, dz, d.speed, dt);
      else m.yaw = Math.atan2(-dx, -dz);
    }
    // keep them from stacking up on each other
    for (let a = 0; a < this.sims.length; a++) for (let b = a + 1; b < this.sims.length; b++) {
      const A = this.sims[a], B = this.sims[b];
      if (A.state === 3 || B.state === 3 || MOBS[A.kind].fly !== MOBS[B.kind].fly) continue;
      const dx = B.x - A.x, dz = B.z - A.z, dd = Math.hypot(dx, dz), min = radius(A) + radius(B);
      if (dd > 1e-4 && dd < min) {
        const push = (min - dd) / 2;
        A.x -= (dx / dd) * push; A.z -= (dz / dd) * push;
        B.x += (dx / dd) * push; B.z += (dz / dd) * push;
      }
    }
    for (const m of this.sims) if (m.state !== 3) this.collide(m);
  }

  /** Keep a monster out of the rock, and walkers off ledges they can't climb and out of lava. */
  collide(m: MobSim) {
    const d = MOBS[m.kind];
    if (d.fly) this.level.collide(m, 99, radius(m), true);
    else this.level.collide(m, this.level.ground(m.x, m.z), radius(m), d.wade ? undefined : false);
  }

  /** Head for a prey: straight at them if they're near and in sight, otherwise down the flow field. */
  chase(m: MobSim, p: Prey, speed: number, dt: number) {
    const L = this.level, w = L.L.w;
    let dx = p.x - m.x, dz = p.z - m.z;
    if (!(Math.hypot(dx, dz) < 10 && L.los(m.x, m.z, p.x, p.z))) {
      const ci = Math.floor(m.x / CELL), cj = Math.floor(m.z / CELL);
      let bi = ci, bj = cj, bf = this.flow[cj * w + ci];
      if (bf < 0) bf = 1e9;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const f = this.flow[(cj + dj) * w + ci + di];
        if (f >= 0 && f < bf) { bf = f; bi = ci + di; bj = cj + dj; }
      }
      dx = (bi + 0.5) * CELL - m.x; dz = (bj + 0.5) * CELL - m.z;
    }
    this.move(m, dx, dz, speed, dt);
  }

  /** A wisp darting sideways. */
  private blink(m: MobSim, at: Prey, dt: number) {
    m.blinkT -= dt;
    if (m.blinkT > 0) return;
    m.blinkT = 1.8 + Math.random() * 1.6;
    const dx = at.x - m.x, dz = at.z - m.z, d = Math.hypot(dx, dz) || 1, s = Math.random() < 0.5 ? -1 : 1;
    const x = m.x + (-dz / d) * 2.6 * s, z = m.z + (dx / d) * 2.6 * s;
    if (this.level.isOpen(Math.floor(x / CELL), Math.floor(z / CELL)) && this.level.los(m.x, m.z, x, z)) { m.x = x; m.z = z; }
  }

  move(m: MobSim, dx: number, dz: number, speed: number, dt: number) {
    const d = Math.hypot(dx, dz);
    if (d < 0.05) return;
    let vx = (dx / d) * speed, vz = (dz / d) * speed;
    if (m.kind === "bat") { vx += Math.sin(m.wob * 7 + m.id) * 2.5; vz += Math.cos(m.wob * 5.3 + m.id) * 2.5; }
    m.x += vx * dt; m.z += vz * dt;
    // turn smoothly towards where it's going
    const want = Math.atan2(-dx, -dz);
    let dy = want - m.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    m.yaw += dy * Math.min(1, dt * 8);
    this.collide(m);
  }

  /** The compact list the host sends out: id, kind (+64 champion, +128 mini-boss), x, z, yaw, hp, max, state, move, phase for each. */
  pack(): number[] {
    const out: number[] = [];
    for (const m of this.sims) out.push(m.id, KINDS.indexOf(m.kind) + (m.champ ? 64 : 0) + (m.mini ? 128 : 0), Math.round(m.x * 20), Math.round(m.z * 20), Math.round(m.yaw * 100), m.hp, m.max, m.state, m.move, m.phase);
    return out;
  }
}

export const PACK = 10;

/** Turn a received list back into sims (a new host carries on from the last one it heard). */
export function unpack(d: number[]): MobSim[] {
  const out: MobSim[] = [];
  for (let k = 0; k + PACK <= d.length; k += PACK) {
    const kind = KINDS[d[k + 1] % 64] ?? "ghoul";
    const m = newSim(d[k], kind, d[k + 2] / 20, d[k + 3] / 20, 1, (d[k + 1] & 64) > 0, (d[k + 1] & 128) > 0);
    m.yaw = d[k + 4] / 100; m.hp = d[k + 5]; m.max = d[k + 6]; m.state = d[k + 7] as MobState;
    m.move = d[k + 8] | 0; m.phase = d[k + 9] | 0;
    if (m.state === 2) m.state = 1;
    out.push(m);
  }
  return out;
}
