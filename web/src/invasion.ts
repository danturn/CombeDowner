// The flag invasion: the Bath Bunting Preservation Society is decorating Bath, whether Bath likes it
// or not. They're made up, and so is their banner (a grinning teapot crest): the joke is the
// flag-spamming itself, not who anybody is.
//
// Bath is split into its squares (tiles.ts), and each square is flagged from 0 to 100%. The meter
// under the minimap ("Bath bunting'd: 27%") is the average. In a flagged square the street lamps
// fly the Society's banner (the more flagged it is, the more of them), with bunting strung between
// them once it's mostly taken, and the gangs that turn up there are as likely to be Society
// wardens as naughty boys (chavs.ts). Shoot a flag down and the square drops a little; ladder crews
// come and put cleared flags back up, and run from you rather than fight. Squares nobody's in creep
// up, and a square that's mostly taken spreads to the squares next to it.
//
// Every few minutes the phone goes: the Society has taken over a pub for an emergency meeting. A
// purple marker goes up on it; get there and clear out the crew and the Chair (a boss with a
// gavel) to liberate the square (its flags drop sharply, and there are prizes). Leave it too long
// and the motion passes: that square and the ones round it jump up. Get the meter to 0% and Bath
// is saved till the next season; each season (three real hours) the Society starts again from a
// few new squares.
//
// Who decides what: where the Society starts each season, and how far it would have got by now
// with nobody fighting it, comes from the clock, so a room started any time picks up where the
// season should be. After that the host runs it (the spreading, the call-outs, the crews and the
// ladders, through chavs.ts) and sends everyone the levels, the flags shot down and the call-out
// as "bv" every few seconds. Whoever shoots a flag down tells everyone at once, so it drops on
// every screen; the host counts it.
import * as THREE from "three";
import * as SFX from "./audio";
import { CHAIR, LADDER, SOCIETY, look, type Chavs, type Target } from "./chavs";
import { clearSpot, streetSpot } from "./haunts";
import type { GameMap } from "./map";
import { compassWord, esc, far, hash } from "./quests";

/** What the game lends the invasion. */
export interface InvasionWorld {
  readonly map: GameMap;
  readonly scene: THREE.Scene;
  readonly chavs: Chavs;
  readonly selfId: string;
  readonly isHost: boolean;
  me(): { x: number; y: number; z: number; alive: boolean };
  players(): Target[];
  pubs(): { name: string; x: number; z: number }[];
  send(data: unknown, to?: string): void;
  toast(text: string, secs?: number): void;
  feed(html: string): void;
  mark(id: string, at: { x: number; z: number } | null, label?: string, colour?: string): void;
  prize(x: number, z: number, good: boolean): void;
}

const SEASON = 3 * 3600 * 1000;    // ms: each season the Society starts again
const TICK = 10;                   // seconds between steps of the spreading
const GROW = 1 / 4800;             // a flagged square nobody's in fills up in 80 minutes
const SPREAD = 1 / 4800;           // and once one's past TIPPING it spreads next door about as fast
const TIPPING = 0.7;
const SEEDS = 3;                   // squares the Society starts each season in
const START = 0.15;                // and how flagged they start
const SHOT = 0.006;                // how much a flag shot down takes off its square
const WON = 0.4, WON_NEXT = 0.15;  // liberating a pub: off its square, and off the squares round it
const LOST = 0.25, LOST_NEXT = 0.1;
const NEAR = 220;                  // flags are drawn (and can be shot) this close
const MAX_FLAGS = 400, MAX_PENNANTS = 1600;
const PURPLE = "#b45cff";
const CALL_ID = "@bunting";
const BONUS_SECS = 90;             // close a meeting this quickly for extra prizes
const LULL = 180;                  // seconds a square gets no ladder crews after you catch one there
const SEND_EVERY = 4;              // seconds between the host's updates
const $ = (id: string) => document.getElementById(id)!;

/** A street lamp that can fly a flag: its id (the same for everyone), the post, and its arm's angle. */
interface Lamp { id: string; x: number; z: number; g: number; a: number; sq: number; h: number }

/** The call-out: a pub the Society has taken. Host only: the crew it sent. */
interface Call {
  id: number; name: string; x: number; z: number; sq: number;
  until: number;                   // ms since 1970: the motion passes then, unless the crew's turned up
  on: boolean;                     // the crew's there, and the fight's on
  onAt: number;                    // when they turned up (ms): close the meeting quickly for a bonus
  crew: { i: number; gen: number }[]; chair: { i: number; gen: number } | null; awayT: number;
}

// ---- the banner: a grinning teapot on teal, edged in mustard -------------------------------------

function bannerTexture() {
  const c = document.createElement("canvas");
  c.width = 128; c.height = 96;
  const g = c.getContext("2d")!;
  g.fillStyle = "#1f8a8a"; g.fillRect(0, 0, 128, 96);
  g.strokeStyle = "#e0b23a"; g.lineWidth = 8; g.strokeRect(4, 4, 120, 88);
  // little pink pennants along the top
  g.fillStyle = "#e46aa0";
  for (let x = 10; x < 120; x += 18) { g.beginPath(); g.moveTo(x, 8); g.lineTo(x + 14, 8); g.lineTo(x + 7, 20); g.fill(); }
  // the teapot: body, lid, knob, spout and handle
  g.fillStyle = "#f2efe6"; g.strokeStyle = "#14161c"; g.lineWidth = 3;
  g.beginPath(); g.ellipse(64, 60, 26, 20, 0, 0, Math.PI * 2); g.fill(); g.stroke();
  g.beginPath(); g.ellipse(64, 40, 14, 5, 0, 0, Math.PI * 2); g.fill(); g.stroke();
  g.beginPath(); g.arc(64, 33, 4, 0, Math.PI * 2); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(39, 58); g.quadraticCurveTo(26, 52, 24, 40); g.lineTo(30, 42); g.quadraticCurveTo(32, 52, 40, 64); g.fill(); g.stroke();
  g.beginPath(); g.arc(92, 60, 9, -Math.PI / 2, Math.PI / 2); g.stroke();
  // and its grin
  g.fillStyle = "#14161c";
  g.beginPath(); g.arc(56, 55, 2.5, 0, Math.PI * 2); g.arc(72, 55, 2.5, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(64, 62, 9, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Invasion {
  // the squares: their tileKey order, which is the same for everyone
  private sqs: { ti: number; tj: number; x: number; z: number }[] = [];
  private index = new Map<string, number>();
  private next: number[][] = [];
  private size = 0; private x0 = 0; private y0 = 0;
  private L = new Float32Array(0);
  private cleared = new Set<string>();
  private pending = new Map<string, number>();     // flags I shot down, till the host's word catches up
  private season = -1;
  private saved = false;                           // the meter got to 0: nothing more this season
  private decorated = false;
  private heard = false;                           // had the host's word this game
  private call: Call | null = null;
  private calls = 0;
  private callT = 120;                             // host: seconds till the next call-out
  private ladders: { i: number; gen: number; id: string; x: number; z: number; t: number; leaving: boolean }[] = [];
  private ladderT = 60;
  private lull = new Map<number, number>();        // host: squares with no ladder crews till then (ms)
  private tickT = 0; private sendT = 0; private dirty = false;
  private flagT = 0;
  // drawn
  private lamps = new WeakMap<GameMap, Lamp[]>();
  private shown: { id: string; x: number; y: number; z: number }[] = [];
  private flags: THREE.InstancedMesh; private poles: THREE.InstancedMesh;
  private pennants: THREE.InstancedMesh; private strings: THREE.LineSegments;
  private falling: { m: THREE.Group; t: number; vy: number; spin: number }[] = [];
  private bannerMat: THREE.MeshLambertMaterial;
  private pubFlag: THREE.Group | null = null;
  private html = "";
  private marked = -1;                             // the call-out the marker's up for

  constructor(private w: InvasionWorld) {
    const I = w.map.tileIndex;
    this.bannerMat = new THREE.MeshLambertMaterial({ map: bannerTexture(), side: THREE.DoubleSide });
    const banner = new THREE.PlaneGeometry(0.8, 0.6).translate(0.5, -0.32, 0);
    const pole = new THREE.BoxGeometry(0.92, 0.035, 0.035).translate(0.46, 0, 0);
    this.flags = new THREE.InstancedMesh(banner, this.bannerMat, MAX_FLAGS);
    this.poles = new THREE.InstancedMesh(pole, new THREE.MeshLambertMaterial({ color: "#d8d4c2" }), MAX_FLAGS);
    this.pennants = new THREE.InstancedMesh(new THREE.ConeGeometry(0.11, 0.22, 3).rotateX(Math.PI).translate(0, -0.11, 0),
      new THREE.MeshLambertMaterial({ color: "#ffffff" }), MAX_PENNANTS);
    const colours = ["#e46aa0", "#e0b23a", "#1f8a8a", "#f2efe6"].map((c) => new THREE.Color(c));
    for (let k = 0; k < MAX_PENNANTS; k++) this.pennants.setColorAt(k, colours[k % 4]);
    this.strings = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: "#3a3a3a" }));
    for (const m of [this.flags, this.poles, this.pennants]) { m.count = 0; m.frustumCulled = false; m.castShadow = false; }
    this.strings.frustumCulled = false;
    w.scene.add(this.flags, this.poles, this.pennants, this.strings);
    if (!I) return;
    // every square of Bath inside the force field, the village's included
    const S = (this.size = I.cells * I.dx);
    this.x0 = I.x0; this.y0 = I.y0;
    const tis = I.tiles.map((t) => t[0]), tjs = I.tiles.map((t) => t[1]);
    for (let ti = Math.min(...tis) - 1; ti <= Math.max(...tis) + 1; ti++) {
      for (let tj = Math.min(...tjs) - 1; tj <= Math.max(...tjs) + 1; tj++) {
        const x = I.x0 + (ti + 0.5) * S, z = -(I.y0 + (tj + 0.5) * S);
        if (Math.hypot(x - w.map.fieldX, z - w.map.fieldZ) > w.map.field + S * 0.3) continue;
        this.index.set(`${ti},${tj}`, this.sqs.length);
        this.sqs.push({ ti, tj, x, z });
      }
    }
    this.next = this.sqs.map((s) => [[1, 0], [-1, 0], [0, 1], [0, -1]]
      .map(([a, b]) => this.index.get(`${s.ti + a},${s.tj + b}`)).filter((n): n is number => n !== undefined));
    this.L = new Float32Array(this.sqs.length);
  }

  get on() { return this.sqs.length > 0; }

  /** Which square scene (x, z) is in, or -1. */
  squareAt(x: number, z: number) {
    if (!this.size) return -1;
    return this.index.get(`${Math.floor((x - this.x0) / this.size)},${Math.floor((-z - this.y0) / this.size)}`) ?? -1;
  }
  /** How flagged the square at (x, z) is, 0 to 1. */
  levelAt(x: number, z: number) { const s = this.squareAt(x, z); return s < 0 ? 0 : this.L[s]; }
  /** The meter: how much of Bath is bunting'd, 0 to 1. */
  get meter() { let t = 0; for (const v of this.L) t += v; return this.sqs.length ? t / this.sqs.length : 0; }

  // ---- the season, from the clock ---------------------------------------------------------------

  /** Where the Society would have got to by now this season, with nobody fighting it. */
  private fresh(season: number) {
    this.season = season;
    this.L.fill(0);
    this.cleared.clear();
    this.saved = this.decorated = false;
    let h = hash("bunting", season);
    for (let k = 0; k < SEEDS && this.sqs.length; k++) {
      h = hash(h, k);
      this.L[h % this.sqs.length] = START;
    }
    const steps = Math.floor(Math.min(SEASON, Date.now() - season * SEASON) / 1000 / TICK);
    for (let k = 0; k < steps; k++) this.grow(TICK, new Set());
  }

  /** dt seconds of spreading. Squares with a player in them hold. */
  private grow(dt: number, held: Set<number>) {
    const L = this.L, was = L.slice();
    for (let i = 0; i < L.length; i++) {
      if (held.has(i)) continue;
      let v = was[i];
      if (v > 0) v += dt * GROW;
      let top = 0;
      for (const n of this.next[i]) top = Math.max(top, was[n]);
      if (top > TIPPING) v += (dt * SPREAD * (top - TIPPING)) / (1 - TIPPING);
      L[i] = Math.min(1, v);
    }
  }

  // ---- lamps and flags ----------------------------------------------------------------------------

  private lampsOf(area: GameMap): Lamp[] {
    let out = this.lamps.get(area);
    if (out) return out;
    out = [];
    const tag = area.d.tile ? `${area.d.tile[0]}_${area.d.tile[1]}` : "v";
    let k = 0;
    for (const f of area.d.fx ?? []) {
      if (f[0] !== "lamp") continue;
      const id = `${tag}:${k++}`, x = +f[1], z = -f[2];
      out.push({ id, x, z, g: +f[3] - area.z0, a: +f[4], sq: this.squareAt(x, z), h: hash("lamp", id) / 4294967296 });
    }
    this.lamps.set(area, out);
    return out;
  }

  private lampsNear(x: number, z: number, r: number): Lamp[] {
    const out: Lamp[] = [];
    for (const area of [this.w.map, ...this.w.map.tilesNear(x, z, r)]) {
      for (const l of this.lampsOf(area)) if (Math.abs(l.x - x) < r && Math.abs(l.z - z) < r && Math.hypot(l.x - x, l.z - z) < r) out.push(l);
    }
    return out;
  }

  private flagged(l: Lamp) {
    return l.sq >= 0 && l.h < this.L[l.sq] && !this.cleared.has(l.id) && !this.pending.has(l.id);
  }

  /** Where a lamp's banner hangs (its middle), for hitting it. */
  private bannerAt(l: Lamp) {
    const px = Math.cos(l.a), pz = -Math.sin(l.a);
    return { x: l.x + px * 0.5, y: l.g + 4.1, z: l.z + pz * 0.5 };
  }

  /** Put the flags and bunting up round you. */
  private drawFlags(me: { x: number; z: number }) {
    const lamps = this.lampsNear(me.x, me.z, NEAR).filter((l) => this.flagged(l));
    lamps.sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z));
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    this.shown = [];
    let n = 0;
    for (const l of lamps) {
      if (n >= MAX_FLAGS) break;
      q.setFromAxisAngle(up, l.a);
      m4.compose(p.set(l.x, l.g + 4.42, l.z), q, one);
      this.flags.setMatrixAt(n, m4); this.poles.setMatrixAt(n, m4);
      this.shown.push({ id: l.id, ...this.bannerAt(l) });
      n++;
    }
    this.flags.count = this.poles.count = n;
    this.flags.instanceMatrix.needsUpdate = this.poles.instanceMatrix.needsUpdate = true;
    // bunting strung from each lamp to the next one along, in squares that are mostly taken
    const pos: number[] = [];
    let k = 0;
    const done = new Set<string>(), dir = new THREE.Vector3();
    for (const a of lamps) {
      if (this.L[a.sq] < 0.5 || Math.hypot(a.x - me.x, a.z - me.z) > 150) continue;
      let best: Lamp | null = null, bd = 40;
      for (const b of lamps) {
        if (b === a) continue;
        const d = Math.hypot(b.x - a.x, b.z - a.z);
        if (d > 10 && d < bd && !done.has(`${b.id}>${a.id}`)) { bd = d; best = b; }
      }
      if (!best) continue;
      done.add(`${a.id}>${best.id}`);
      const ya = a.g + 5.3, yb = best.g + 5.3, sag = Math.min(1.6, bd * 0.05), steps = Math.max(2, Math.round(bd / 0.75));
      const at = (t: number) => [a.x + (best!.x - a.x) * t, ya + (yb - ya) * t - sag * 4 * t * (1 - t), a.z + (best!.z - a.z) * t];
      for (let s = 0; s < 8; s++) pos.push(...at(s / 8), ...at((s + 1) / 8));
      dir.set(best.x - a.x, 0, best.z - a.z).normalize();
      q.setFromAxisAngle(up, Math.atan2(dir.x, dir.z) + Math.PI / 2);
      for (let s = 1; s < steps && k < MAX_PENNANTS; s++) {
        const [x, y, z] = at(s / steps);
        m4.compose(p.set(x, y, z), q, one);
        this.pennants.setMatrixAt(k++, m4);
      }
    }
    this.pennants.count = k;
    this.pennants.instanceMatrix.needsUpdate = true;
    this.strings.geometry.dispose();
    this.strings.geometry = new THREE.BufferGeometry();
    this.strings.geometry.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  }

  /** The nearest flag a shot from o along unit vector d hits within maxDist. */
  hit(o: THREE.Vector3, d: THREE.Vector3, maxDist: number): { id: string; dist: number; x: number; y: number; z: number } | null {
    let best: { id: string; dist: number; x: number; y: number; z: number } | null = null;
    for (const f of this.shown) {
      const ex = f.x - o.x, ey = f.y - o.y, ez = f.z - o.z, t = ex * d.x + ey * d.y + ez * d.z;
      if (t <= 0 || t > maxDist || (best && t > best.dist)) continue;
      const miss = Math.hypot(ex - d.x * t, ey - d.y * t, ez - d.z * t);
      if (miss < 0.42 && !this.cleared.has(f.id) && !this.pending.has(f.id)) best = { id: f.id, dist: t, x: f.x, y: f.y, z: f.z };
    }
    return best;
  }

  /** I shot a flag down: it drops on every screen, and the host counts it. */
  shoot(f: { id: string; x: number; y: number; z: number }) {
    this.pending.set(f.id, performance.now());
    this.drop(f.x, f.y, f.z);
    this.flagT = 0;
    const msg = { k: "down", id: f.id };
    this.w.send(msg);
    if (this.w.isHost) this.onMessage(msg, this.w.selfId);
  }

  /** A banner tumbling to the ground. */
  private drop(x: number, y: number, z: number) {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.6), this.bannerMat);
    g.add(m);
    g.position.set(x, y, z);
    this.w.scene.add(g);
    this.falling.push({ m: g, t: 0, vy: 1.5, spin: (Math.random() - 0.5) * 8 });
  }

  // ---- the host: spreading, call-outs, crews and ladders --------------------------------------

  private hostUpdate(dt: number) {
    const now = Date.now(), season = Math.floor(now / SEASON);
    if (season !== this.season) {
      const had = this.season >= 0;
      this.endCall(null);
      this.fresh(season);
      if (had) { this.w.toast("A new season: the Bunting Society is back", 4); this.w.send({ k: "news", t: "season" }); }
      this.dirty = true;
    }
    const players = this.w.players(), alive = players.filter((p) => p.alive);
    if ((this.tickT -= dt) <= 0) {
      this.tickT = TICK;
      if (!this.saved) this.grow(TICK, new Set(alive.map((p) => this.squareAt(p.x, p.z))));
      // flags shot down in squares that have dropped below them don't need remembering
      for (const id of this.cleared) {
        const l = this.lampById(id);
        if (!l || l.h >= this.L[l.sq]) this.cleared.delete(id);
      }
      const m = this.meter;
      if (!this.saved && m < 0.002 && this.L.every((v) => v < 0.01)) {
        this.saved = true;
        this.L.fill(0);
        this.endCall(null);
        this.news("saved");
      }
      if (!this.decorated && m > 0.99) { this.decorated = true; this.news("decorated"); }
      if (m < 0.9) this.decorated = false;
      this.dirty = true;
    }
    if (!this.saved && alive.length) {
      this.hostCall(dt, alive);
      this.hostLadders(dt, alive);
    }
    this.sendT -= dt;
    if (this.sendT <= 0 || (this.dirty && this.sendT < SEND_EVERY - 0.5)) { this.sendT = SEND_EVERY; this.dirty = false; this.w.send(this.state()); }
  }

  private lampById(id: string): Lamp | undefined {
    const [tag, k] = id.split(":");
    let area: GameMap | undefined;
    if (tag === "v") area = this.w.map;
    else { const [ti, tj] = tag.split("_").map(Number); area = [...this.w.map.tiles.values()].find((m) => m.d.tile?.[0] === ti && m.d.tile?.[1] === tj); }
    return area ? this.lampsOf(area)[+k] : undefined;
  }

  private hostCall(dt: number, alive: Target[]) {
    const c = this.call;
    if (!c) {
      if ((this.callT -= dt) > 0) return;
      this.callT = 30;   // try again soon if nowhere will do
      const pubs = this.w.pubs().map((p) => ({ ...p, sq: this.squareAt(p.x, p.z), d: Math.min(...alive.map((t) => Math.hypot(t.x - p.x, t.z - p.z))) }))
        .filter((p) => p.sq >= 0 && p.d > 120 && p.d < 1500);
      if (!pubs.length) return;
      const weight = (p: { sq: number }) => this.L[p.sq] + 0.05;
      let r = Math.random() * pubs.reduce((s, p) => s + weight(p), 0);
      const p = pubs.find((o) => (r -= weight(o)) <= 0) ?? pubs[0];
      this.call = { id: ++this.calls + Math.floor(Math.random() * 1e6) * 100, name: p.name, x: p.x, z: p.z, sq: p.sq, until: Date.now() + (180 + p.d / 3) * 1000, on: false, onAt: 0, crew: [], chair: null, awayT: 0 };
      this.dirty = true;
      this.sendT = 0;
      return;
    }
    const near = Math.min(...alive.map((t) => Math.hypot(t.x - c.x, t.z - c.z)));
    if (c.on && !c.chair && !c.crew.length) c.on = false;   // we've just taken over as host: the crew comes again
    if (!c.on) {
      if (Date.now() > c.until) { this.endCall(false); return; }
      if (near < 140) {
        // they're there: the crew and the Chair, harder the more of Bath the Society holds
        const m = this.meter, n = 3 + Math.round(4 * m);
        const at = clearSpot(this.w.map, c.x, c.z, 10) ?? [c.x, c.z];
        c.crew = this.w.chavs.bring(at[0], at[1], look(SOCIETY, Math.floor(Math.random() * 4)), n, this.w.players(), undefined, 7);
        c.chair = this.w.chavs.bring(at[0], at[1], look(CHAIR, 0), 1, this.w.players(), Math.round(300 + 500 * m), 0)[0] ?? null;
        c.on = true; c.onAt = Date.now();
        this.dirty = true;
      }
      return;
    }
    // the fight: the Chair down and the crew all but done liberates it; everyone wandering off loses it
    const left = c.crew.filter((g) => this.w.chavs.get(g.i, g.gen)).length;
    const chair = c.chair && this.w.chavs.get(c.chair.i, c.chair.gen);
    if (!chair && left <= 1) { this.endCall(true); return; }
    c.awayT = near > 400 ? c.awayT + dt : 0;
    if (c.awayT > 60) this.endCall(false);
  }

  /** Host: the call-out's over. won: liberated; false: the motion passed; null: just gone. */
  private endCall(won: boolean | null) {
    const c = this.call;
    if (!c) return;
    for (const g of [...c.crew, ...(c.chair ? [c.chair] : [])]) this.w.chavs.release(g.i, g.gen);
    this.call = null;
    this.callT = 240 + Math.random() * 120;
    this.dirty = true;
    this.sendT = 0;
    if (won === null) return;
    const sq = c.sq;
    if (won) {
      this.L[sq] = Math.max(0, this.L[sq] - WON);
      for (const n of this.next[sq]) this.L[n] = Math.max(0, this.L[n] - WON_NEXT);
      // closed down inside 90 seconds of the crew turning up: a bonus
      const quick = Date.now() - c.onAt < BONUS_SECS * 1000, n = quick ? 5 : 3;
      for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; this.w.prize(c.x + Math.cos(a) * 2, c.z + Math.sin(a) * 2, k === 0 || (quick && k === 1)); }
      if (quick) this.news("quick");
    } else {
      this.L[sq] = Math.min(1, this.L[sq] + LOST);
      for (const n of this.next[sq]) this.L[n] = Math.min(1, this.L[n] + LOST_NEXT);
    }
    const msg = { k: "out", won: won ? 1 : 0, name: c.name };
    this.w.send(msg);
    this.onMessage(msg, this.w.selfId);
  }

  /** Host: ladder crews go and put back the flags you've shot down near you. */
  private hostLadders(dt: number, alive: Target[]) {
    const ch = this.w.chavs, near = (x: number, z: number, r: number) => alive.some((t) => Math.hypot(t.x - x, t.z - z) < r);
    for (let k = this.ladders.length - 1; k >= 0; k--) {
      const l = this.ladders[k], at = ch.get(l.i, l.gen);
      if (!at) { this.ladders.splice(k, 1); continue; }
      if (l.leaving) { if (!near(at.x, at.z, 80)) { ch.release(l.i, l.gen, true); this.ladders.splice(k, 1); } continue; }
      if (Math.hypot(at.x - l.x, at.z - l.z) > 1.8) { l.t = 0; continue; }
      if ((l.t += dt) < 4) continue;
      // up the ladder and the flag's back
      if (this.cleared.delete(l.id)) this.dirty = true;
      const next = this.cleared.size ? this.lampsNear(l.x, l.z, 100).find((o) => this.cleared.has(o.id) && !this.ladders.some((m) => m.id === o.id)) : undefined;
      if (next) { Object.assign(l, { id: next.id, ...this.foot(next), t: 0 }); ch.sendTo(l.i, l.gen, l.x, l.z); }
      else {
        l.leaving = true;
        const away = streetSpot(this.w.map, at.x, at.z, 120, 200, 0.6, (x, z) => !near(x, z, 90));
        if (away) ch.sendTo(l.i, l.gen, away.x, away.z, true); else { ch.release(l.i, l.gen, true); this.ladders.splice(k, 1); }
      }
    }
    if ((this.ladderT -= dt) > 0) return;
    this.ladderT = 100 - 60 * this.meter;
    if (this.ladders.length >= 3 || !this.cleared.size) return;
    const anchor = alive[Math.floor(Math.random() * alive.length)];
    const lamp = this.lampsNear(anchor.x, anchor.z, 180).find((o) => this.cleared.has(o.id) && !this.ladders.some((m) => m.id === o.id) && !((this.lull.get(o.sq) ?? 0) > Date.now()));
    if (!lamp) return;
    const from = streetSpot(this.w.map, lamp.x, lamp.z, 40, 90, 0.6, (x, z) => !near(x, z, 35));
    if (!from) return;
    const g = ch.bring(from.x, from.z, look(LADDER, Math.floor(Math.random() * 4)), 1, this.w.players())[0];
    if (!g) return;
    const foot = this.foot(lamp);
    ch.sendTo(g.i, g.gen, foot.x, foot.z);
    this.ladders.push({ ...g, id: lamp.id, ...foot, t: 0, leaving: false });
  }

  /** Where a ladder goes up a lamp: at its foot, on the street side. */
  private foot(l: Lamp) {
    const c = clearSpot(this.w.map, l.x + Math.sin(l.a) * 0.9, l.z + Math.cos(l.a) * 0.9, 3);
    return c ? { x: c[0], z: c[1] } : { x: l.x, z: l.z };
  }

  /** Host: should a gang turning up at (x, z) be the Society? Their kind, or null. */
  natural(x: number, z: number): number | null {
    if (this.saved) return null;
    const v = this.levelAt(x, z);
    return v > 0.25 && Math.random() < v * 0.7 ? SOCIETY : null;
  }

  /** Host: something chavs.ts runs went down. A ladder crew caught means no more ladders in that
   *  square for a while. (The call-out checks its own crew for itself.) */
  chavDown(i: number, _by: string) {
    const k = this.ladders.findIndex((l) => l.i === i);
    if (k < 0) return;
    const l = this.ladders[k];
    this.lull.set(this.squareAt(l.x, l.z), Date.now() + LULL * 1000);
    this.ladders.splice(k, 1);
    this.news("ladder");
  }

  // ---- the network ----------------------------------------------------------------------------

  private state() {
    const c = this.call;
    return {
      k: "s", se: this.season, sv: this.saved ? 1 : 0, L: [...this.L].map((v) => Math.round(v * 1000)), cl: [...this.cleared],
      c: c ? { id: c.id, n: c.name, x: Math.round(c.x), z: Math.round(c.z), u: c.until, on: c.on ? 1 : 0, a: c.onAt } : null,
    };
  }

  private news(t: string) {
    const msg = { k: "news", t };
    this.w.send(msg);
    this.onMessage(msg, this.w.selfId);
  }

  onMessage(d: any, from: string) {
    if (!d || typeof d !== "object" || !this.on) return;
    if (d.k === "s") {
      if (this.w.isHost && from !== this.w.selfId) return;
      if (!Array.isArray(d.L) || d.L.length !== this.L.length) return;
      this.heard = true;
      this.season = Number(d.se) || 0;
      this.saved = !!d.sv;
      d.L.forEach((v: number, i: number) => (this.L[i] = Math.max(0, Math.min(1, (Number(v) || 0) / 1000))));
      this.cleared = new Set(Array.isArray(d.cl) ? d.cl.map(String) : []);
      this.setCall(d.c);
      this.flagT = 0;
      return;
    }
    if (d.k === "down" && typeof d.id === "string") {
      if (from !== this.w.selfId) {
        const f = this.shown.find((s) => s.id === d.id);
        if (f && !this.cleared.has(f.id)) this.drop(f.x, f.y, f.z);
        this.cleared.add(d.id);
        this.flagT = 0;
      }
      if (this.w.isHost) {
        const l = this.lampById(d.id);
        if (l && l.sq >= 0 && l.h < this.L[l.sq]) {
          this.cleared.add(d.id);
          this.L[l.sq] = Math.max(0, this.L[l.sq] - SHOT);
          this.dirty = true;
        }
      }
      return;
    }
    if (d.k === "out") {
      SFX.jobDone(!!d.won);
      const name = esc(String(d.name ?? "the pub"));
      if (d.won) { this.w.toast(`${d.name} is liberated!`, 4); this.w.feed(`<b style="color:${PURPLE}">${name}</b> liberated from the Bunting Society`); }
      else { this.w.toast(`The motion passes: the Society keeps ${d.name}`, 4); this.w.feed(`The Bunting Society took <b style="color:${PURPLE}">${name}</b>`); }
      if (!this.w.isHost) this.setCall(null);
      return;
    }
    if (d.k === "news") {
      if (d.t === "saved") { SFX.jobDone(true); this.w.toast("Bath is saved! The Society has packed its bunting away till next season", 6); }
      else if (d.t === "ladder") this.w.toast("Ladder crew caught: no more flags going up round here for a bit", 3);
      else if (d.t === "quick") this.w.toast("Meeting closed early: bonus prizes!", 3.5);
      else if (d.t === "decorated") this.w.toast("Bath has been decorated. The fight goes on", 5);
      else if (d.t === "season" && from !== this.w.selfId) this.w.toast("A new season: the Bunting Society is back", 4);
    }
  }

  /** The call-out as the host says it is (on everyone else's screen). */
  private setCall(c: any) {
    if (this.w.isHost) return;
    if (!c) { if (this.call) this.w.mark(CALL_ID, null); this.call = null; return; }
    const was = this.call;
    if (!was || was.id !== c.id) this.ring(String(c.n), +c.x, +c.z);
    this.call = { id: +c.id, name: String(c.n), x: +c.x, z: +c.z, sq: this.squareAt(+c.x, +c.z), until: +c.u, on: !!c.on, onAt: +c.a || 0, crew: [], chair: null, awayT: 0 };
  }

  /** The phone goes: a pub's been taken. */
  private ring(name: string, x: number, z: number) {
    SFX.phone();
    const me = this.w.me();
    this.w.toast(`Emergency meeting at ${name}! The Bunting Society has taken it over`, 5);
    this.w.feed(`📞 The Bunting Society has taken <b style="color:${PURPLE}">${esc(name)}</b>, ${far(Math.hypot(x - me.x, z - me.z))} ${compassWord(x - me.x, z - me.z)}`);
  }

  /** Someone joined: the host tells them how it stands. */
  joined(id: string) { if (this.w.isHost && this.on) this.w.send(this.state(), id); }

  // ---- every frame ----------------------------------------------------------------------------

  update(dt: number) {
    if (!this.on) return;
    if (this.season < 0 && (this.w.isHost || !this.heard)) this.fresh(Math.floor(Date.now() / SEASON));
    const hostCall = this.call;
    if (this.w.isHost) {
      this.hostUpdate(dt);
      if (this.call && this.call !== hostCall && (!hostCall || hostCall.id !== this.call.id)) this.ring(this.call.name, this.call.x, this.call.z);
    }
    const me = this.w.me(), t = performance.now();
    for (const [id, at] of this.pending) if (t - at > 6000) this.pending.delete(id);
    if ((this.flagT -= dt) <= 0) { this.flagT = 0.5; this.drawFlags(me); }
    // banners shot down fall and are gone
    for (let k = this.falling.length - 1; k >= 0; k--) {
      const f = this.falling[k];
      f.t += dt; f.vy -= 9 * dt;
      f.m.position.y += f.vy * dt;
      f.m.rotation.x += f.spin * dt; f.m.rotation.y += f.spin * 0.6 * dt;
      if (f.t > 1.4) { this.w.scene.remove(f.m); (f.m.children[0] as THREE.Mesh).geometry.dispose(); this.falling.splice(k, 1); }
    }
    // the call-out: its marker, and the Society's banner on a pole outside the pub
    const c = this.call;
    const markFor = c ? c.id : -1;
    if (markFor !== this.marked) {
      this.marked = markFor;
      if (c) this.w.mark(CALL_ID, { x: c.x, z: c.z }, `Emergency meeting: ${c.name}`, PURPLE);
      else this.w.mark(CALL_ID, null);
    }
    const show = c && Math.hypot(c.x - me.x, c.z - me.z) < 300 ? c : null;
    if (show && !this.pubFlag) {
      const g = new THREE.Group(), at = clearSpot(this.w.map, show.x + 3, show.z, 6) ?? [show.x + 3, show.z];
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 6, 8), new THREE.MeshLambertMaterial({ color: "#d8d4c2" }));
      pole.position.y = 3;
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.6), this.bannerMat);
      flag.position.set(1.15, 5.1, 0);
      g.add(pole, flag);
      g.position.set(at[0], this.w.map.ground(at[0], at[1]), at[1]);
      g.userData.id = show.id;
      this.pubFlag = g;
      this.w.scene.add(g);
    } else if (this.pubFlag && (!show || this.pubFlag.userData.id !== show.id)) {
      this.w.scene.remove(this.pubFlag);
      this.pubFlag.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
      this.pubFlag = null;
    }
    if (this.pubFlag) this.pubFlag.children[1].rotation.y = Math.sin(t / 700) * 0.25;
    this.hud(me);
  }

  /** The meter under the minimap, and the call-out under it. */
  private hud(me: { x: number; z: number }) {
    const m = this.meter, c = this.call;
    let call = "";
    if (c) {
      const d = Math.hypot(c.x - me.x, c.z - me.z);
      const bonus = Math.round(BONUS_SECS - (Date.now() - c.onAt) / 1000);
      if (c.on) call = `The Chair is in <b>${esc(c.name)}</b>! ${far(d)}${bonus > 0 && c.onAt ? ` · bonus ${bonus}s` : ""}`;
      else {
        const left = Math.max(0, Math.round((c.until - Date.now()) / 1000));
        call = `Emergency meeting at <b>${esc(c.name)}</b> · ${far(d)} · ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
      }
    } else if (this.saved) call = "Bath is saved, till next season";
    const pct = Math.round(m * 100);
    const html = `<div class="label">Bath bunting'd <b>${pct}%</b></div><div class="bar"><div style="width:${Math.max(pct, m > 0 ? 1 : 0)}%"></div></div>${call ? `<em>${call}</em>` : ""}`;
    if (html !== this.html) { this.html = html; $("bunting").innerHTML = html; $("bunting").hidden = false; }
  }

  /** The squares for the maps, tinted by how flagged they are (scene coordinates). */
  tint(): { x0: number; z0: number; s: number; a: number }[] {
    const out: { x0: number; z0: number; s: number; a: number }[] = [];
    this.sqs.forEach((q, i) => { if (this.L[i] > 0.02) out.push({ x0: q.x - this.size / 2, z0: q.z - this.size / 2, s: this.size, a: this.L[i] }); });
    return out;
  }

  /** The call-out's Chair, for the boss bar. */
  get callName() { return this.call?.on ? this.call.name : ""; }

  dispose() {
    this.w.mark(CALL_ID, null);
    for (const o of [this.flags, this.poles, this.pennants, this.strings, ...this.falling.map((f) => f.m)]) this.w.scene.remove(o);
    if (this.pubFlag) this.w.scene.remove(this.pubFlag);
  }
}
