// Monsters. Like the chavs in the main game, the host runs them all and sends everyone where they
// are; everyone else just draws them (mobviews.ts) and tells the host when they hit one.
import { CELL, MobKind } from "./gen";
import type { MineLevel } from "./level";

export interface MobDef {
  name: string; hp: number; speed: number; dmg: number; reach: number; windup: number; cd: number;
  aggro: number; r: number; h: number; fly: boolean;   // h: how tall, for arrows and bolts
}
export const MOBS: Record<MobKind, MobDef> = {
  ghoul: { name: "Quarryman's ghoul", hp: 40, speed: 2.9, dmg: 9, reach: 1.6, windup: 0.45, cd: 1.2, aggro: 13, r: 0.4, h: 1.8, fly: false },
  bat: { name: "Horseshoe bat", hp: 10, speed: 5.4, dmg: 3, reach: 1.3, windup: 0.2, cd: 0.8, aggro: 10, r: 0.25, h: 0.5, fly: true },
  golem: { name: "Ashlar golem", hp: 130, speed: 1.9, dmg: 22, reach: 2.1, windup: 0.8, cd: 2.0, aggro: 12, r: 0.7, h: 2.3, fly: false },
  blob: { name: "Grout blob", hp: 28, speed: 2.5, dmg: 7, reach: 1.4, windup: 0.35, cd: 1.0, aggro: 14, r: 0.45, h: 0.9, fly: false },
  grout: { name: "The Grout", hp: 700, speed: 2.0, dmg: 26, reach: 3.4, windup: 1.0, cd: 2.2, aggro: 18, r: 1.7, h: 3.2, fly: false },
};
export const KINDS: MobKind[] = ["ghoul", "bat", "golem", "blob", "grout"];

/** 0 idle, 1 chasing, 2 winding up an attack, 3 dead. */
export type MobState = 0 | 1 | 2 | 3;

/** One monster as the host simulates it. */
export interface MobSim {
  id: number; kind: MobKind; x: number; z: number; yaw: number; hp: number; max: number;
  state: MobState; t: number; cd: number; target: string; homeX: number; homeZ: number; wob: number; phase: number;
}

export interface Prey { id: string; x: number; z: number; batSafe: boolean }
export interface MobHooks {
  hurt(playerId: string, dmg: number, mob: MobSim): void;
  spawn(kind: MobKind, x: number, z: number): void;
  sound(kind: "growl" | "swing", mob: MobSim): void;
}

export function newSim(id: number, kind: MobKind, x: number, z: number, scale = 1): MobSim {
  const hp = Math.round(MOBS[kind].hp * scale);
  return { id, kind, x, z, yaw: Math.random() * 6.28, hp, max: hp, state: 0, t: 0, cd: 0, target: "", homeX: x, homeZ: z, wob: Math.random() * 10, phase: 0 };
}

/**
 * The host's monster brain. A flow field (steps to the nearest player from every cell, refreshed a
 * few times a second) gets them round pillars and along headings; once they can see you they come
 * straight at you.
 */
export class Horde {
  private flow: Int32Array;
  private flowT = 0;
  constructor(private level: MineLevel, public sims: MobSim[]) {
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
        if (ii < 0 || jj < 0 || ii >= w || jj >= h || this.level.isSolidCell(ii, jj)) continue;
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
      if (!best) {
        if (m.state === 1) m.state = 0;
        // idle: drift about near home
        if (m.state === 0) {
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
        if (m.t <= 0) {
          m.state = 1;
          m.cd = d.cd;
          hooks.sound("swing", m);
          for (const p of prey) {
            if (m.kind === "bat" && p.batSafe) continue;
            const reach = d.reach + 0.5;
            if (Math.hypot(p.x - m.x, p.z - m.z) < reach && (m.kind === "grout" || p.id === m.target)) hooks.hurt(p.id, d.dmg, m);
          }
        }
        continue;
      }
      if (bestD < d.reach && m.cd <= 0) { m.state = 2; m.t = d.windup; continue; }
      // chase: straight at them if they're in sight and near, otherwise down the flow field
      let dx = best.x - m.x, dz = best.z - m.z;
      if (!(bestD < 8 && L.los(m.x, m.z, best.x, best.z))) {
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
      // the Grout calls up blobs when it's hurt
      if (m.kind === "grout") {
        const want = m.hp < m.max * 0.33 ? 2 : m.hp < m.max * 0.66 ? 1 : 0;
        if (want > m.phase) {
          m.phase = want;
          for (let k = 0; k < 3 + want; k++) {
            const a = (k / (3 + want)) * Math.PI * 2;
            hooks.spawn("blob", m.x + Math.cos(a) * 2.5, m.z + Math.sin(a) * 2.5);
          }
        }
      }
    }
    // keep them from stacking up on each other
    for (let a = 0; a < this.sims.length; a++) for (let b = a + 1; b < this.sims.length; b++) {
      const A = this.sims[a], B = this.sims[b];
      if (A.state === 3 || B.state === 3 || MOBS[A.kind].fly !== MOBS[B.kind].fly) continue;
      const dx = B.x - A.x, dz = B.z - A.z, dd = Math.hypot(dx, dz), min = MOBS[A.kind].r + MOBS[B.kind].r;
      if (dd > 1e-4 && dd < min) {
        const push = (min - dd) / 2;
        A.x -= (dx / dd) * push; A.z -= (dz / dd) * push;
        B.x += (dx / dd) * push; B.z += (dz / dd) * push;
      }
    }
    for (const m of this.sims) if (m.state !== 3) this.level.collide(m, 0, MOBS[m.kind].r);
  }

  private move(m: MobSim, dx: number, dz: number, speed: number, dt: number) {
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
    this.level.collide(m, 0, MOBS[m.kind].r);
  }

  /** The compact list the host sends out: id, kind, x, z, yaw, hp, max, state for each. */
  pack(): number[] {
    const out: number[] = [];
    for (const m of this.sims) out.push(m.id, KINDS.indexOf(m.kind), Math.round(m.x * 20), Math.round(m.z * 20), Math.round(m.yaw * 100), m.hp, m.max, m.state);
    return out;
  }
}

export const PACK = 8;

/** Turn a received list back into sims (a new host carries on from the last one it heard). */
export function unpack(d: number[]): MobSim[] {
  const out: MobSim[] = [];
  for (let k = 0; k + PACK <= d.length; k += PACK) {
    const kind = KINDS[d[k + 1]] ?? "ghoul";
    const m = newSim(d[k], kind, d[k + 2] / 20, d[k + 3] / 20);
    m.yaw = d[k + 4] / 100; m.hp = d[k + 5]; m.max = d[k + 6]; m.state = d[k + 7] as MobState;
    if (m.state === 2) m.state = 1;
    out.push(m);
  }
  return out;
}
