// Chavs: lads in trackies who loiter about, chase the nearest player they can see and batter anyone
// they catch. They run faster than you walk but slower than you sprint, and give up once you're far
// enough away, have been out of sight for a few seconds, or they've run a while without catching
// you. Shoot one and he comes for you.
//
// The host runs them and sends their state about 10 times a second; everyone else draws them from
// that, smoothed like other players. Shots at chavs go to the host, like shots at players.
import * as THREE from "three";
import { hitFigure } from "./avatar";
import { GameMap } from "./map";

export const CHAV_HP = 60;
export const PUNCH_DAMAGE = 10;
const MAX = 12;
const RUN = 5.7, STROLL = 1.3;            // you walk at 4.6 and sprint at 7.4
const SPOT = 38, LOSE = 45, BLIND_SECS = 3.5;
const TIRED_SECS = 14, CALM_SECS = 10;     // a chase that long without catching you, then a sulk
const REACH = 1.3, PUNCH_EVERY = 1.0, WIND_UP = 0.35;
const RADIUS = 0.33;
const CORPSE_SECS = 6;
const DELAY = 130;                         // ms behind real time when drawing from the host's updates
const GONE = 0, ALIVE = 1, DEAD = 2;

/** A player the chavs might go for. */
export interface Target { id: string; x: number; y: number; z: number; alive: boolean }
export interface ChavState { s: number[]; t: string[] }

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const lambert = (c: string) => new THREE.MeshLambertMaterial({ color: c });
// shared by every chav
const GEO = {
  leg: box(0.15, 0.84, 0.17).translate(0, -0.42, 0),
  stripe: box(0.015, 0.8, 0.035).translate(0, -0.42, 0),
  shoe: box(0.15, 0.11, 0.29).translate(0, -0.8, -0.05),
  torso: box(0.44, 0.6, 0.25),
  sleeve: box(0.12, 0.56, 0.13).translate(0, -0.28, 0),
  hand: new THREE.SphereGeometry(0.06, 8, 6).translate(0, -0.6, 0),
  head: new THREE.SphereGeometry(0.15, 14, 10),
  cap: new THREE.SphereGeometry(0.162, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  brim: box(0.2, 0.025, 0.17),
  chain: new THREE.TorusGeometry(0.1, 0.012, 6, 20),
};
const SKIN = ["#efcdb4", "#e6bd9f", "#d4a283", "#b57d5c"].map(lambert);
const TRACKIES = ["#ecebe8", "#252a3e", "#8a8d93", "#1d1d20", "#33478c", "#5b6b4a"].map(lambert);
const CAPS = ["#cbb38a", "#1d1d20", "#ecebe8", "#8a8d93"].map(lambert);
const WHITE = lambert("#f4f4f2");
const GOLD = new THREE.MeshLambertMaterial({ color: "#d9b143", emissive: "#4a3a10" });

const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];

/** The drawn chav: tracksuit, cap, gold chain, white trainers, with running and punching. */
class Figure {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private legL = new THREE.Group(); private legR = new THREE.Group();
  private armL = new THREE.Group(); private armR = new THREE.Group();
  private phase = 0;

  constructor() {
    this.dress();
    this.body.rotation.order = "YXZ";   // turn first, then lean or fall along the way he faces
    this.root.add(this.body);
    this.root.visible = false;
  }

  /** New clothes for a new chav. */
  dress() {
    this.body.clear();
    const suit = pick(TRACKIES), skin = pick(SKIN), cap = pick(CAPS);
    const stripe = suit === TRACKIES[0] ? TRACKIES[3] : WHITE;
    // only the big parts cast shadows, to keep the draw calls down on tablets
    const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
      const o = new THREE.Mesh(g, m); o.position.set(x, y, z);
      o.castShadow = g === GEO.leg || g === GEO.torso || g === GEO.sleeve || g === GEO.head;
      return o;
    };
    for (const [leg, side] of [[this.legL, -1], [this.legR, 1]] as const) {
      leg.clear();
      leg.position.set(side * 0.1, 0.86, 0);
      leg.add(mesh(GEO.leg, suit), mesh(GEO.stripe, stripe, side * 0.076), mesh(GEO.shoe, WHITE));
    }
    for (const [arm, side] of [[this.armL, -1], [this.armR, 1]] as const) {
      arm.clear();
      arm.position.set(side * 0.29, 1.42, 0);
      arm.add(mesh(GEO.sleeve, suit), mesh(GEO.stripe, stripe, side * 0.06), mesh(GEO.hand, skin));
    }
    const chain = mesh(GEO.chain, GOLD, 0, 1.34, -0.13);
    chain.scale.set(1, 1.3, 1);
    this.body.add(this.legL, this.legR, this.armL, this.armR,
      mesh(GEO.torso, suit, 0, 1.16, 0), mesh(GEO.head, skin, 0, 1.62, 0),
      mesh(GEO.cap, cap, 0, 1.65, 0), mesh(GEO.brim, cap, 0, 1.67, -0.15), chain);
  }

  /** speed in m/s, punch counts down from 1 over a swing, dead in seconds since death (or 0). */
  pose(x: number, y: number, z: number, yaw: number, speed: number, punch: number, dead: number, dt: number) {
    this.root.position.set(x, y, z);
    this.body.rotation.y = yaw;
    const run = Math.min(1, speed / RUN);
    this.phase += dt * speed * 2.1;
    const swing = Math.sin(this.phase) * Math.min(0.95, speed * 0.17);
    this.legL.rotation.x = swing; this.legR.rotation.x = -swing;
    this.armL.rotation.x = -swing * 0.8; this.armR.rotation.x = swing * 0.8;
    // a punch: the right arm jabs straight out
    if (punch > 0) this.armR.rotation.x = Math.sin((1 - punch) * Math.PI) * 1.75;
    this.body.position.y = Math.abs(Math.sin(this.phase)) * 0.05 * run;
    // lean into the run; knocked flat on his back when dead
    this.body.rotation.x = dead > 0 ? Math.min(Math.PI / 2, dead * 5) : -0.22 * run;
  }
}

class Chav {
  state = GONE; gen = 0; hp = CHAV_HP; punches = 0; target = "";
  x = 0; y = 0; z = 0; yaw = 0;                 // the host's word
  // as drawn: smoothed from the host's updates
  dx = 0; dy = 0; dz = 0; dyaw = 0; speed = 0;
  snaps: { t: number; x: number; y: number; z: number; yaw: number }[] = [];
  // host only
  vx = 0; vz = 0; hop = 0; hopV = 0; deadT = 0; punchCD = 0; seeT = Math.random() * 0.4; blindT = 0;
  lastX = 0; lastZ = 0; chaseT = 0; calmT = 0; stuckT = 0; detour = 0; detourT = 0; wanderT = 0; wanderYaw = 0; wanderGo = false;
  // drawing
  fig = new Figure(); punchAnim = 0; seenPunches = 0; deadAnim = 0;

  constructor(readonly i: number) {}
  /** Who's bleeding, for the blood trails. */
  get key() { return `chav${this.i}.${this.gen}`; }
}

export class Chavs {
  readonly list: Chav[] = [];
  private points: { x: number; z: number }[] | null = null;
  private spawnT = 5;
  /** Called on every client when a chav throws a punch (to play a sound). */
  onSwing: (x: number, y: number, z: number) => void = () => {};

  constructor(private map: GameMap, scene: THREE.Scene) {
    for (let i = 0; i < MAX; i++) {
      const c = new Chav(i);
      this.list.push(c);
      scene.add(c.fig.root);
    }
  }

  // ---- host: the AI -------------------------------------------------------------------------

  /** Run the chavs for a frame. punch(i, id) is called when chav i lands a punch on player id. */
  simulate(dt: number, targets: Target[], punch: (i: number, id: string) => void) {
    const alive = targets.filter((t) => t.alive);
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 4;
      const want = Math.min(MAX, 2 + 2 * targets.length);
      const active = this.list.filter((c) => c.state !== GONE).length;
      if (active < want && alive.length) this.spawnGang(targets, alive, want - active);
    }
    for (let i = 0; i < this.list.length; i++) {
      const c = this.list[i];
      if (c.state === DEAD) {
        c.deadT += dt;
        if (c.deadT > CORPSE_SECS) c.state = GONE;
        continue;
      }
      if (c.state !== ALIVE) continue;
      this.think(c, dt, alive);
      // wander off the map's edge of interest: too far from anyone to matter
      if (!c.target && !alive.some((t) => Math.hypot(t.x - c.x, t.z - c.z) < 170) && alive.length) { c.state = GONE; continue; }
      this.move(c, i, dt, alive, punch);
    }
  }

  private sees(c: Chav, t: Target, dist: number) {
    const ox = c.x, oy = c.y + 1.6, oz = c.z;
    const dx = t.x - ox, dy = t.y + 1.5 - oy, dz = t.z - oz, l = Math.hypot(dx, dy, dz) || 1;
    const hit = this.map.raycast(ox, oy, oz, dx / l, dy / l, dz / l, dist);
    return !hit || hit.dist > l - 0.4;
  }

  /** Pick, keep or drop a target. Sight checks are a few times a second, not every frame. */
  private think(c: Chav, dt: number, alive: Target[]) {
    c.calmT -= dt;
    c.seeT -= dt;
    if (c.seeT > 0) return;
    const every = 0.35;
    c.seeT = every;
    if (c.target) {
      const t = alive.find((p) => p.id === c.target);
      const dist = t ? Math.hypot(t.x - c.x, t.z - c.z) : Infinity;
      if (!t || dist > LOSE || (c.chaseT > TIRED_SECS && dist > 12)) { c.target = ""; c.calmT = CALM_SECS; return; }
      if (this.sees(c, t, dist)) { c.blindT = 0; c.lastX = t.x; c.lastZ = t.z; }
      else if ((c.blindT += every) > BLIND_SECS) { c.target = ""; c.calmT = CALM_SECS; }
      return;
    }
    if (c.calmT > 0) return;
    let best: Target | null = null, bd = SPOT;
    for (const t of alive) {
      const d = Math.hypot(t.x - c.x, t.z - c.z);
      if (d < bd && this.sees(c, t, d)) { bd = d; best = t; }
    }
    if (!best) return;
    // he shouts, and his mates join in
    for (const o of this.list) {
      if (o.state !== ALIVE || (o !== c && (o.target || o.calmT > 0 || Math.hypot(o.x - c.x, o.z - c.z) > 18))) continue;
      o.target = best.id; o.blindT = 0; o.chaseT = 0; o.lastX = best.x; o.lastZ = best.z;
    }
  }

  private move(c: Chav, i: number, dt: number, alive: Target[], punch: (i: number, id: string) => void) {
    c.punchCD -= dt;
    let dirX = 0, dirZ = 0, spd = 0, face: number | null = null;
    const t = c.target ? alive.find((p) => p.id === c.target) : undefined;
    if (t) {
      const dx = t.x - c.x, dz = t.z - c.z, dist = Math.hypot(dx, dz);
      if (dist < REACH && Math.abs(t.y - c.y) < 1.4 && c.blindT === 0) {
        face = Math.atan2(-dx, -dz);
        c.chaseT = 0;
        c.vx *= 0.7; c.vz *= 0.7;   // pull up rather than run into you
        if (c.punchCD <= 0) { c.punchCD = PUNCH_EVERY; c.punches++; punch(i, t.id); }
      } else {
        c.punchCD = Math.max(c.punchCD, WIND_UP);   // a moment to square up before the first punch
        c.chaseT += dt;
        const gx = c.lastX - c.x, gz = c.lastZ - c.z, gl = Math.hypot(gx, gz);
        if (gl > 0.6) { dirX = gx / gl; dirZ = gz / gl; spd = RUN; }
      }
    } else {
      c.wanderT -= dt;
      if (c.wanderT <= 0) { c.wanderT = 2 + Math.random() * 4; c.wanderGo = Math.random() < 0.5; c.wanderYaw = Math.random() * Math.PI * 2; }
      if (c.wanderGo) { dirX = -Math.sin(c.wanderYaw); dirZ = -Math.cos(c.wanderYaw); spd = STROLL; }
    }
    // stuck on something: try going round it at an angle for a bit
    if (c.detourT > 0) {
      c.detourT -= dt;
      const cs = Math.cos(c.detour), sn = Math.sin(c.detour);
      [dirX, dirZ] = [dirX * cs - dirZ * sn, dirX * sn + dirZ * cs];
    }
    // steep ground slows them like it slows you
    if (spd > 0) {
      const ahead = this.map.ground(c.x + dirX * spd * 0.15, c.z + dirZ * spd * 0.15) - this.map.ground(c.x, c.z);
      const grade = ahead / (spd * 0.15);
      if (grade > 0.35) spd *= Math.max(0.35, 1 - (grade - 0.35) * 1.2);
    }
    let wx = dirX * spd, wz = dirZ * spd;
    // keep out of each other's way
    for (const o of this.list) {
      if (o === c || o.state !== ALIVE) continue;
      const ex = c.x - o.x, ez = c.z - o.z, d = Math.hypot(ex, ez);
      if (d < 0.9 && d > 1e-4) { wx += (ex / d) * (0.9 - d) * 4; wz += (ez / d) * (0.9 - d) * 4; }
    }
    const k = Math.min(1, dt * 8);
    c.vx += (wx - c.vx) * k; c.vz += (wz - c.vz) * k;

    const nx = c.x + c.vx * dt, nz = c.z + c.vz * dt;
    // while hopping a wall, low walls and fences don't block
    let p = this.map.collide({ x: nx, z: nz }, c.y + (c.hop > 0 ? 1.05 : 0), RADIUS);
    if (spd > 1 && c.hop === 0) {
      const want = spd * dt, prog = ((p.x - c.x) * dirX + (p.z - c.z) * dirZ) / want;
      if (prog < 0.35) {
        const over = this.map.collide({ x: nx, z: nz }, c.y + 1.05, RADIUS);
        if (((over.x - c.x) * dirX + (over.z - c.z) * dirZ) / want > 0.6) { p = over; c.hopV = 4.2; c.hop = 0.001; }
        else if ((c.stuckT += dt) > 0.5) {
          c.stuckT = 0;
          c.detour = (c.detour > 0 ? 1 : -1) * (Math.random() < 0.3 ? -1 : 1) * (0.9 + Math.random() * 0.7);
          c.detourT = 0.8 + Math.random();
        }
      } else c.stuckT = Math.max(0, c.stuckT - dt);
    }
    c.vx = ((p.x - c.x) / dt) * 0.9 + c.vx * 0.1;
    c.vz = ((p.z - c.z) / dt) * 0.9 + c.vz * 0.1;
    c.x = p.x; c.z = p.z;
    if (c.hop > 0) {
      c.hopV -= 22 * dt; c.hop += c.hopV * dt;
      if (c.hop <= 0) { c.hop = 0; c.hopV = 0; }
    }
    c.y = this.map.ground(c.x, c.z) + c.hop;
    const sp = Math.hypot(c.vx, c.vz);
    if (face === null && sp > 0.4) face = Math.atan2(-c.vx, -c.vz);
    if (face !== null) {
      const dy = Math.atan2(Math.sin(face - c.yaw), Math.cos(face - c.yaw));
      c.yaw += dy * Math.min(1, dt * 10);
    }
  }

  /** Street and path points to spawn chavs on, out of buildings. */
  private spawnPoints() {
    if (this.points) return this.points;
    const pts: { x: number; z: number }[] = [], lim = this.map.field * 0.92;
    for (const r of this.map.d.rd) {
      for (let k = 0; k < r.p.length - 1; k++) {
        const [ax, ay] = r.p[k], [bx, by] = r.p[k + 1], n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / 6));
        for (let s = 0; s < n; s++) {
          const x = ax + ((bx - ax) * s) / n, z = -(ay + ((by - ay) * s) / n);
          if (Math.hypot(x, z) < lim && !this.map.blocked(x, z, 0.6)) pts.push({ x, z });
        }
      }
    }
    return (this.points = pts);
  }

  /** A gang of one to three turns up somewhere near a player, out of sight if possible. */
  private spawnGang(everyone: Target[], alive: Target[], room: number) {
    const anchor = pick(alive);
    const near = this.spawnPoints().filter((p) => { const d = Math.hypot(p.x - anchor.x, p.z - anchor.z); return d > 55 && d < 110; });
    let spot: { x: number; z: number } | null = null;
    for (let tries = 0; tries < 12 && near.length; tries++) {
      const p = pick(near);
      if (everyone.some((t) => Math.hypot(t.x - p.x, t.z - p.z) < 45)) continue;
      spot = p;
      const g = this.map.ground(p.x, p.z), ax = anchor.x, ay = anchor.y + 1.6, az = anchor.z;
      const dx = p.x - ax, dy = g + 1.5 - ay, dz = p.z - az, l = Math.hypot(dx, dy, dz);
      const hit = this.map.raycast(ax, ay, az, dx / l, dy / l, dz / l, l);
      if (hit && hit.dist < l - 1) break;     // round a corner: perfect
    }
    if (!spot) return;
    const size = Math.min(room, 1 + Math.floor(Math.random() * 3));
    for (let n = 0; n < size; n++) {
      const c = this.list.find((o) => o.state === GONE);
      if (!c) return;
      let x = spot.x + (Math.random() - 0.5) * 3, z = spot.z + (Math.random() - 0.5) * 3;
      if (this.map.blocked(x, z, RADIUS)) { x = spot.x + (Math.random() - 0.5) * 0.4; z = spot.z + (Math.random() - 0.5) * 0.4; }
      Object.assign(c, {
        state: ALIVE, gen: c.gen + 1 + Math.floor(Math.random() * 50), hp: CHAV_HP, target: "",
        x, z, y: this.map.ground(x, z), yaw: Math.random() * Math.PI * 2, vx: 0, vz: 0, hop: 0, hopV: 0,
        deadT: 0, punchCD: 0, blindT: 0, chaseT: 0, calmT: 0, stuckT: 0, detourT: 0, wanderT: 0,
      });
      c.fig.dress();
    }
  }

  /** Host: a chav was shot. Returns "kill", "dmg", or null if the shot doesn't count (already dead). */
  damage(i: number, gen: number, amount: number): "kill" | "dmg" | null {
    const c = this.list[i];
    if (!c || c.state !== ALIVE || c.gen !== gen) return null;
    c.hp = Math.max(0, c.hp - amount);
    if (c.hp > 0) return "dmg";
    c.state = DEAD; c.deadT = 0; c.deadAnim = 0; c.target = "";
    return "kill";
  }

  /** Host: the chav goes for whoever shot him. */
  aggro(i: number, id: string, x: number, z: number) {
    const c = this.list[i];
    if (c?.state !== ALIVE) return;
    if (c.target !== id) c.chaseT = 0;
    c.target = id; c.blindT = 0; c.calmT = 0; c.lastX = x; c.lastZ = z;
  }

  snapshot(): ChavState {
    const q = (v: number) => Math.round(v * 100) / 100;
    const s: number[] = [];
    for (const c of this.list) s.push(c.state, c.gen, q(c.x), q(c.y), q(c.z), q(c.yaw), Math.round(c.hp), c.punches);
    return { s, t: this.list.map((c) => (c.state === ALIVE ? c.target : "")) };
  }

  // ---- everyone else: the host's updates ------------------------------------------------------

  apply(d: ChavState) {
    if (!Array.isArray(d?.s) || d.s.length < this.list.length * 8) return;
    const now = performance.now();
    this.list.forEach((c, i) => {
      const [state, gen, x, y, z, yaw, hp, punches] = d.s.slice(i * 8, i * 8 + 8);
      if (gen !== c.gen) { c.snaps = []; c.seenPunches = punches; if (state === ALIVE) c.fig.dress(); }
      // a kill event can beat the update that says so
      if (!(c.state === DEAD && gen === c.gen && state === ALIVE)) {
        if (state === DEAD && c.state !== DEAD) c.deadAnim = 0;
        c.state = state;
      }
      Object.assign(c, { gen, x, y, z, yaw, hp, punches, target: String(d.t?.[i] ?? "") });
      if (state !== GONE) {
        c.snaps.push({ t: now, x, y, z, yaw });
        if (c.snaps.length > 20) c.snaps.shift();
      }
    });
  }

  /** Someone's kill event: down he goes, without waiting for the host's next update. */
  killed(i: number, gen: number) {
    const c = this.list[i];
    if (c && c.gen === gen && c.state === ALIVE) { c.state = DEAD; c.deadAnim = 0; }
  }

  // ---- everyone: drawing and hit tests -----------------------------------------------------

  update(dt: number, host: boolean) {
    const now = performance.now() - DELAY;
    for (const c of this.list) {
      const px = c.dx, pz = c.dz;
      if (host || c.snaps.length < 2) {
        c.dx = c.x; c.dy = c.y; c.dz = c.z; c.dyaw = c.yaw;
      } else {
        const S = c.snaps;
        let a = S[0], b = S[S.length - 1];
        for (let k = 0; k < S.length - 1; k++) if (S[k].t <= now && S[k + 1].t >= now) { a = S[k]; b = S[k + 1]; break; }
        if (now >= b.t) a = b;
        const f = b.t > a.t ? Math.min(1, Math.max(0, (now - a.t) / (b.t - a.t))) : 1;
        c.dx = a.x + (b.x - a.x) * f; c.dy = a.y + (b.y - a.y) * f; c.dz = a.z + (b.z - a.z) * f;
        c.dyaw = a.yaw + Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw)) * f;
      }
      const moved = Math.hypot(c.dx - px, c.dz - pz) / Math.max(dt, 1e-3);
      c.speed += ((moved < 15 ? moved : 0) - c.speed) * Math.min(1, dt * 10);
      if (c.punches !== c.seenPunches) {
        if (c.punches > c.seenPunches && c.state === ALIVE) { c.punchAnim = 1; this.onSwing(c.dx, c.dy, c.dz); }
        c.seenPunches = c.punches;
      }
      c.punchAnim = Math.max(0, c.punchAnim - dt / 0.3);
      if (c.state === DEAD) c.deadAnim += dt;
      const fig = c.fig;
      fig.root.visible = c.state === ALIVE || (c.state === DEAD && c.deadAnim < CORPSE_SECS);
      if (fig.root.visible) fig.pose(c.dx, c.dy, c.dz, c.dyaw, c.state === ALIVE ? c.speed : 0, c.punchAnim, c.state === DEAD ? c.deadAnim + 0.001 : 0, dt);
    }
  }

  /** The nearest chav a ray from o along unit vector d hits within maxDist, as drawn. */
  hit(o: THREE.Vector3, d: THREE.Vector3, maxDist: number): { i: number; gen: number; dist: number; head: boolean } | null {
    let best: { i: number; gen: number; dist: number; head: boolean } | null = null;
    this.list.forEach((c, i) => {
      if (c.state !== ALIVE) return;
      const h = hitFigure(o, d, c.dx, c.dy, c.dz);
      if (h && h.dist < maxDist && (!best || h.dist < best.dist)) best = { i, gen: c.gen, ...h };
    });
    return best;
  }

  /** Living chavs as drawn, for blood trails, the minimap and so on. */
  living() {
    return this.list.filter((c) => c.state === ALIVE).map((c) => ({ i: c.i, key: c.key, x: c.dx, y: c.dy, z: c.dz, target: c.target }));
  }

  /** Where chav i is drawn, and his blood id. */
  at(i: number) {
    const c = this.list[i];
    return c ? { key: c.key, gen: c.gen, x: c.dx, y: c.dy, z: c.dz, yaw: c.dyaw } : null;
  }
}
