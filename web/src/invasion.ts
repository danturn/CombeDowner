// The flag invasion: the Bath Bunting Preservation Society is decorating Bath, whether Bath likes it
// or not. They're made up, and so is their banner (a grinning teapot crest): the joke is the
// flag-spamming itself, not who anybody is.
//
// Bath is split into its squares (tiles.ts), and each square is flagged from 0 to 100%. The meter
// under the minimap ("Bath bunting'd: 27%") is the average. In a flagged square the street lamps
// fly the Society's banner (the more flagged it is, the more of them), with bunting strung between
// them once it's mostly taken. The Society's wardens don't hang about the streets: they only turn
// up at their meetings (below), and their ladder crews only to put flags back. Shoot a flag down and the square drops a little; ladder crews
// come and put cleared flags back up, and run from you rather than fight. Squares nobody's in creep
// up, and a square that's mostly taken spreads to the squares next to it.
//
// Every few minutes the phone goes: the Society has taken over a pub for an emergency meeting. A
// purple marker goes up on it; get there and clear out the crew and the Chair to liberate the
// square (its flags drop sharply, and there are prizes). The crew grows with the room, and a big
// room gets two meetings at once (the second under the Vice-Chair). There's one Chair at a time,
// with a name and a trait or two (a gazebo, a megaphone, a deputy, a quorum), who remembers how it
// went: win and they come back with another trait; lose and the next Chair is elected. A liberated
// pub flies a green flag, leaves a ride and the odd free round out, and its square stays free of
// the Society for the season. Leave a meeting too long and the motion passes: that square and the
// ones round it jump up. Get the meter to 0% and Bath
// is saved till the next season; each season (three real hours) the Society starts again from a
// few new squares.
//
// Who decides what: where the Society starts each season, and how far it would have got by now
// with nobody fighting it, comes from the clock, so a room started any time picks up where the
// season should be. After that the host runs it (the spreading, the call-outs, the crews and the
// ladders, the Chair and the liberated pubs, through chavs.ts) and sends everyone the levels, the
// flags shot down, the call-outs, the Chair and the liberated pubs as "bv" every few seconds.
// Whoever shoots a flag down tells everyone at once, so it drops on
// every screen; the host counts it.
import * as THREE from "three";
import * as SFX from "./audio";
import { CHAIR, LADDER, SOCIETY, look, type Chavs, type Target } from "./chavs";
import { clearSpot, streetSpot } from "./haunts";
import type { GameMap } from "./map";
import type { Kind } from "./pickups";
import { compassWord, esc, far, hash, rng } from "./quests";
import { RIDES } from "./rides";

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
  /** Host: leave a pickup on the ground for anyone (and tell everyone). */
  give(x: number, z: number, kind: Kind): void;
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
const PURPLE = "#b45cff", GREEN = "#4fd18b";
const CALL_ID = "@bunting";
const BONUS_SECS = 90;             // close a meeting this quickly for extra prizes
const LULL = 180;                  // seconds a square gets no ladder crews after you catch one there
const FREE_ROUND = 120;            // seconds between the free rounds left out at a liberated pub
const TWO_CALLS = 5;               // this many in the room and the Society calls two meetings at once
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
  vice: boolean;                   // the second meeting at once, run by the Vice-Chair
  gazebo: { x: number; z: number } | null;
  crew: { i: number; gen: number }[]; chair: { i: number; gen: number } | null; deputy: { i: number; gen: number } | null;
  awayT: number; megaT: number;
}

/** The Chair: one at a time, with a name, a trait or two, and a memory of how it went with you. */
type Trait = "gazebo" | "megaphone" | "deputy" | "quorum";
const TRAITS: Record<Trait, string> = {
  gazebo: "brings a gazebo (shots at the Chair under it barely count)",
  megaphone: "heckles through a megaphone (and more wardens come)",
  deputy: "has a deputy (the Chair can't be touched till the deputy's down)",
  quorum: "always has a quorum (a bigger crew)",
};
interface Chair { name: string; traits: Trait[]; wins: number; took: string; prev: string }
const FIRST = ["Pat", "Sam", "Jo", "Alex", "Chris", "Robin", "Morgan", "Les", "Val", "Terry", "Frankie", "Jules"];
const LAST = ["Doilyworth", "Trestlebottom", "Picklefork", "Crumpetshire", "Bunthorne", "Fondant", "Marquee", "Tombola", "Teacosy", "Jamjar", "Raffleton", "Scone"];

/** A new Chair, elected. prev: who they took over from, if they were beaten. */
function newChair(r: () => number, prev = ""): Chair {
  let name = "";
  do name = `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}`; while (name === prev);
  const all = Object.keys(TRAITS) as Trait[], traits: Trait[] = [];
  for (let k = 0, n = 1 + (r() < 0.4 ? 1 : 0); k < n; k++) {
    const t = all.filter((a) => !traits.includes(a));
    traits.push(t[Math.floor(r() * t.length)]);
  }
  return { name, traits, wins: 0, took: "", prev };
}

// ---- the liberation flag: green, with a teacup the right way up and FREE under it ---------------

function freeTexture() {
  const c = document.createElement("canvas");
  c.width = 128; c.height = 96;
  const g = c.getContext("2d")!;
  g.fillStyle = "#2f9a5c"; g.fillRect(0, 0, 128, 96);
  g.strokeStyle = "#f2efe6"; g.lineWidth = 6; g.strokeRect(4, 4, 120, 88);
  g.fillStyle = "#f2efe6"; g.strokeStyle = "#14161c"; g.lineWidth = 3;
  g.beginPath(); g.moveTo(40, 22); g.lineTo(84, 22); g.quadraticCurveTo(82, 54, 62, 56); g.quadraticCurveTo(42, 54, 40, 22); g.fill(); g.stroke();
  g.beginPath(); g.arc(86, 34, 7, -Math.PI / 2, Math.PI / 2); g.stroke();
  g.beginPath(); g.ellipse(62, 58, 30, 4, 0, 0, Math.PI * 2); g.fill(); g.stroke();
  g.fillStyle = "#f2efe6"; g.font = "bold 22px sans-serif"; g.textAlign = "center";
  g.fillText("FREE", 64, 86);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
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
  private calls: Call[] = [];
  private callN = 0;
  private callT = 120;                             // host: seconds till the next call-out
  private chair: Chair = newChair(Math.random);
  private freed: { n: string; x: number; z: number; sq: number; t: number }[] = [];   // pubs liberated this season
  private ladders: { i: number; gen: number; id: string; x: number; z: number; t: number; leaving: boolean }[] = [];
  private ladderT = 60;
  private lull = new Map<number, number>();        // host: squares with no ladder crews till then (ms)
  private tickT = 0; private sendT = 0; private dirty = false;
  private flagT = 0;
  private downs = 0;                               // flags I've had down this game
  private tickAt = 0;
  // drawn
  private lamps = new WeakMap<GameMap, Lamp[]>();
  private shown: { id: string; x: number; y: number; z: number; a: number }[] = [];
  private flags: THREE.InstancedMesh; private poles: THREE.InstancedMesh;
  private pennants: THREE.InstancedMesh; private strings: THREE.LineSegments;
  private falling: { m: THREE.Mesh; t: number; vx: number; vy: number; vz: number; ph: number; spin: number; floor: number }[] = [];
  private halves: THREE.PlaneGeometry[];
  private bannerMat: THREE.MeshLambertMaterial;
  private freeMat: THREE.MeshLambertMaterial;
  private props = new Map<string, THREE.Group>();  // banners (and the gazebo) outside the pubs near you
  private html = "";
  private marked = new Map<number, number>();      // which call-out each marker is up for

  constructor(private w: InvasionWorld) {
    const I = w.map.tileIndex;
    this.bannerMat = new THREE.MeshLambertMaterial({ map: bannerTexture(), side: THREE.DoubleSide });
    this.freeMat = new THREE.MeshLambertMaterial({ map: freeTexture(), side: THREE.DoubleSide });
    // a shot banner tears down the middle: each half keeps its side of the picture
    this.halves = [0, 1].map((k) => {
      const g = new THREE.PlaneGeometry(0.4, 0.6), uv = g.attributes.uv as THREE.BufferAttribute;
      for (let j = 0; j < uv.count; j++) uv.setX(j, (uv.getX(j) + k) / 2);
      return g;
    });
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
    this.freed = [];
    this.saved = this.decorated = false;
    this.chair = newChair(rng(hash("chair", season)));
    let h = hash("bunting", season);
    for (let k = 0; k < SEEDS && this.sqs.length; k++) {
      h = hash(h, k);
      this.L[h % this.sqs.length] = START;
    }
    const steps = Math.floor(Math.min(SEASON, Date.now() - season * SEASON) / 1000 / TICK);
    for (let k = 0; k < steps; k++) this.grow(TICK, new Set());
  }

  /** dt seconds of spreading. Squares with a player in them, and liberated ones, hold. */
  private grow(dt: number, held: Set<number>) {
    const L = this.L, was = L.slice();
    for (const f of this.freed) held.add(f.sq);
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

  private isFree(sq: number) { return this.freed.some((f) => f.sq === sq); }

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
      this.shown.push({ id: l.id, ...this.bannerAt(l), a: l.a });
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
  hit(o: THREE.Vector3, d: THREE.Vector3, maxDist: number): { id: string; dist: number; x: number; y: number; z: number; a: number } | null {
    let best: { id: string; dist: number; x: number; y: number; z: number; a: number } | null = null;
    for (const f of this.shown) {
      const ex = f.x - o.x, ey = f.y - o.y, ez = f.z - o.z, t = ex * d.x + ey * d.y + ez * d.z;
      if (t <= 0 || t > maxDist || (best && t > best.dist)) continue;
      const miss = Math.hypot(ex - d.x * t, ey - d.y * t, ez - d.z * t);
      if (miss < 0.42 && !this.cleared.has(f.id) && !this.pending.has(f.id)) best = { id: f.id, dist: t, x: f.x, y: f.y, z: f.z, a: f.a };
    }
    return best;
  }

  /** I shot a flag down: it tears and drops on every screen, the host counts it, and my count goes up. */
  shoot(f: { id: string; x: number; y: number; z: number; a: number }) {
    this.pending.set(f.id, performance.now());
    this.drop(f.x, f.y, f.z, f.a);
    this.flagT = 0;
    this.downs++;
    this.tickAt = performance.now();
    setTimeout(() => SFX.counterTick(), 120);
    const msg = { k: "down", id: f.id };
    this.w.send(msg);
    if (this.w.isHost) this.onMessage(msg, this.w.selfId);
  }

  /** A banner torn in two, each half fluttering down on its own. */
  private drop(x: number, y: number, z: number, a: number) {
    const me = this.w.me(), d = Math.hypot(x - me.x, y - me.y, z - me.z);
    if (d < 80) SFX.tear(d);
    const px = Math.cos(a), pz = -Math.sin(a), floor = this.w.map.ground(x, z) + 0.03;
    this.halves.forEach((geo, k) => {
      const side = k ? 1 : -1, m = new THREE.Mesh(geo, this.bannerMat);
      m.position.set(x + px * side * 0.2, y, z + pz * side * 0.2);
      m.rotation.y = a;
      this.w.scene.add(m);
      this.falling.push({ m, t: 0, vx: px * side * (0.6 + Math.random() * 0.6), vy: 1 + Math.random(), vz: pz * side * (0.6 + Math.random() * 0.6), ph: Math.random() * 6, spin: (Math.random() - 0.5) * 3, floor });
    });
  }

  // ---- the host: spreading, call-outs, crews and ladders --------------------------------------

  private hostUpdate(dt: number) {
    const now = Date.now(), season = Math.floor(now / SEASON);
    if (season !== this.season) {
      const had = this.season >= 0;
      for (const c of [...this.calls]) this.endCall(c, null);
      this.fresh(season);
      if (had) this.news("season");
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
        for (const c of [...this.calls]) this.endCall(c, null);
        this.news("saved");
      }
      if (!this.decorated && m > 0.99) { this.decorated = true; this.news("decorated"); }
      if (m < 0.9) this.decorated = false;
      this.dirty = true;
    }
    if (!this.saved && alive.length) {
      this.hostCalls(dt, alive, players.length);
      this.hostLadders(dt, alive);
    }
    this.freeRounds(alive);
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

  /** Host: one meeting at a time, or two at once in a big room, so a crowd splits up. */
  private hostCalls(dt: number, alive: Target[], room: number) {
    const want = room >= TWO_CALLS ? 2 : 1;
    if (this.calls.length < want && (this.callT -= dt) <= 0) {
      this.callT = 30;   // try again soon if nowhere will do
      if (this.newCall(alive, this.calls.length > 0)) this.callT = this.calls.length < want ? 45 : 240 + Math.random() * 120;
    }
    for (const c of [...this.calls]) this.hostCall(c, dt, alive, room);
  }

  /** Host: the Society takes a pub, weighted to where it's strongest, away from any other meeting. */
  private newCall(alive: Target[], vice: boolean) {
    const pubs = this.w.pubs().map((p) => ({ ...p, sq: this.squareAt(p.x, p.z), d: Math.min(...alive.map((t) => Math.hypot(t.x - p.x, t.z - p.z))) }))
      .filter((p) => p.sq >= 0 && p.d > 120 && p.d < 1500 && !this.freed.some((f) => f.n === p.name)
        && !this.calls.some((c) => Math.hypot(c.x - p.x, c.z - p.z) < 600));
    if (!pubs.length) return false;
    const weight = (p: { sq: number }) => this.L[p.sq] + 0.05;
    let r = Math.random() * pubs.reduce((s, p) => s + weight(p), 0);
    const p = pubs.find((o) => (r -= weight(o)) <= 0) ?? pubs[0];
    this.calls.push({
      id: ++this.callN + Math.floor(Math.random() * 1e6) * 100, name: p.name, x: p.x, z: p.z, sq: p.sq,
      until: Date.now() + (180 + p.d / 3) * 1000, on: false, onAt: 0, vice, gazebo: null, crew: [], chair: null, deputy: null, awayT: 0, megaT: 30,
    });
    this.dirty = true;
    this.sendT = 0;
    return true;
  }

  private hostCall(c: Call, dt: number, alive: Target[], room: number) {
    const ch = this.w.chavs, near = Math.min(...alive.map((t) => Math.hypot(t.x - c.x, t.z - c.z)));
    if (c.on && !c.chair && !c.crew.length) c.on = false;   // we've just taken over as host: the crew comes again
    if (!c.on) {
      if (Date.now() > c.until) { this.endCall(c, false); return; }
      if (near < 140) this.bringCrew(c, room);
      return;
    }
    const chair = c.chair && ch.get(c.chair.i, c.chair.gen), deputy = c.deputy && ch.get(c.deputy.i, c.deputy.gen);
    // the Chair's protected while the deputy's up, or while she's under her gazebo
    if (chair && c.chair) {
      const under = c.gazebo && Math.hypot(chair.x - c.gazebo.x, chair.z - c.gazebo.z) < 3.2 ? 0.6 : 0;
      ch.setArmour(c.chair.i, c.chair.gen, Math.max(deputy ? 0.85 : 0, under));
    }
    // heckling through the megaphone brings more wardens
    if (chair && !c.vice && this.chair.traits.includes("megaphone") && (c.megaT -= dt) <= 0) {
      c.megaT = 40;
      const at = clearSpot(this.w.map, c.x + (Math.random() - 0.5) * 50, c.z + (Math.random() - 0.5) * 50, 10);
      if (at) c.crew.push(...ch.bring(at[0], at[1], look(SOCIETY, Math.floor(Math.random() * 4)), 2, this.w.players(), undefined, 3));
      this.news("mega", { x: Math.round(chair.x), z: Math.round(chair.z), n: this.chair.name });
    }
    // the fight: the Chair down and the crew all but done liberates it; everyone wandering off loses it
    const left = c.crew.filter((g) => ch.get(g.i, g.gen)).length + (deputy ? 1 : 0);
    if (!chair && left <= 1) { this.endCall(c, true); return; }
    c.awayT = near > 400 ? c.awayT + dt : 0;
    if (c.awayT > 60) this.endCall(c, false);
  }

  /** Host: they're there: the crew and the Chair (or the Vice-Chair), sized to the room and to how
   *  much of Bath the Society holds, with whatever the Chair brings. */
  private bringCrew(c: Call, room: number) {
    const ch = this.w.chavs, players = this.w.players(), m = this.meter, chair = this.chair;
    const traits = c.vice ? [] : chair.traits;
    const n = Math.min(12, 1 + 2 * room + Math.round(3 * m) + (traits.includes("quorum") ? 3 : 0));
    const hp = Math.round((250 + 400 * m) * (0.6 + 0.4 * Math.min(room, 6)) * (1 + 0.25 * chair.wins) * (c.vice ? 0.6 : 1));
    const at = clearSpot(this.w.map, c.x, c.z, 10) ?? [c.x, c.z];
    c.crew = ch.bring(at[0], at[1], look(SOCIETY, Math.floor(Math.random() * 4)), n, players, undefined, 7);
    c.chair = ch.bring(at[0], at[1], look(CHAIR, c.vice ? 2 : 0), 1, players, hp, 0)[0] ?? null;
    if (traits.includes("deputy")) c.deputy = ch.bring(at[0] + 2, at[1], look(CHAIR, 1), 1, players, Math.round(hp * 0.4), 0)[0] ?? null;
    if (traits.includes("gazebo")) {
      const g = clearSpot(this.w.map, at[0] - 4, at[1], 8);
      if (g) { c.gazebo = { x: Math.round(g[0] * 10) / 10, z: Math.round(g[1] * 10) / 10 }; if (c.chair) ch.sendTo(c.chair.i, c.chair.gen, g[0], g[1]); }
    }
    c.on = true; c.onAt = Date.now();
    this.dirty = true;
    this.sendT = 0;
    // and a word from the Chair, who remembers
    const who = c.vice ? "The Vice-Chair" : `Chair ${chair.name}`;
    const said = c.vice ? "The Chair sends their apologies. I'm in charge here!"
      : chair.wins && chair.took ? `Back for more? I've already had ${chair.took} off you!`
      : chair.prev ? `You'll not do to me what you did to ${chair.prev}!`
      : "This emergency meeting is now in session!";
    this.news("greet", { s: `${who}: "${said}"`, x: Math.round(at[0]), z: Math.round(at[1]) });
  }

  /** Host: a meeting's over. won: liberated; false: the motion passed; null: just gone. */
  private endCall(c: Call, won: boolean | null) {
    const k = this.calls.indexOf(c);
    if (k < 0) return;
    this.calls.splice(k, 1);
    for (const g of [...c.crew, ...(c.chair ? [c.chair] : []), ...(c.deputy ? [c.deputy] : [])]) this.w.chavs.release(g.i, g.gen);
    if (!this.calls.length) this.callT = 240 + Math.random() * 120;
    this.dirty = true;
    this.sendT = 0;
    if (won === null) return;
    const sq = c.sq, was = this.chair;
    let line = "";
    if (won) {
      this.L[sq] = Math.max(0, this.L[sq] - WON);
      for (const n of this.next[sq]) this.L[n] = Math.max(0, this.L[n] - WON_NEXT);
      // closed down inside 90 seconds of the crew turning up: a bonus
      const quick = Date.now() - c.onAt < BONUS_SECS * 1000, n = quick ? 5 : 3;
      for (let j = 0; j < n; j++) { const a = (j / n) * Math.PI * 2; this.w.prize(c.x + Math.cos(a) * 2, c.z + Math.sin(a) * 2, j === 0 || (quick && j === 1)); }
      if (quick) this.news("quick");
      // the pub's liberated for the season: a ride left outside, a free round now and then, and a quiet square
      this.freed.push({ n: c.name, x: c.x, z: c.z, sq, t: Date.now() });
      this.w.give(c.x - 2, c.z + 2, RIDES[Math.floor(Math.random() * (RIDES.length - 1))]);
      if (!c.vice) {
        this.chair = newChair(Math.random, was.name);
        line = `Chair ${was.name} has been voted out. Chair ${this.chair.name} takes the gavel, and ${this.chair.traits.map((t) => TRAITS[t]).join(", and ")}`;
      }
    } else {
      this.L[sq] = Math.min(1, this.L[sq] + LOST);
      for (const n of this.next[sq]) this.L[n] = Math.min(1, this.L[n] + LOST_NEXT);
      this.freed = this.freed.filter((f) => f.sq !== sq);
      if (!c.vice) {
        was.wins++; was.took = c.name;
        const gain = (Object.keys(TRAITS) as Trait[]).filter((t) => !was.traits.includes(t));
        if (gain.length && was.traits.length < 3) {
          const t = gain[Math.floor(Math.random() * gain.length)];
          was.traits.push(t);
          line = `Chair ${was.name} is getting cocky: now ${TRAITS[t]}`;
        }
      }
    }
    const msg = { k: "out", won: won ? 1 : 0, name: c.name, line };
    this.w.send(msg);
    this.onMessage(msg, this.w.selfId);
  }

  /** Host: a liberated pub leaves a round out for anyone who comes by. */
  private freeRounds(alive: Target[]) {
    const now = Date.now();
    for (const f of this.freed) {
      if (now - f.t < FREE_ROUND * 1000 || !alive.some((t) => Math.hypot(t.x - f.x, t.z - f.z) < 150)) continue;
      f.t = now;
      this.w.give(f.x + 1.5, f.z, "pint");
      this.w.give(f.x - 1.5, f.z, Math.random() < 0.5 ? "ammo" : "fizz");
    }
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
    const lamp = this.lampsNear(anchor.x, anchor.z, 180).find((o) => this.cleared.has(o.id) && !this.ladders.some((m) => m.id === o.id) && !this.isFree(o.sq) && !((this.lull.get(o.sq) ?? 0) > Date.now()));
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

  /** Host: something chavs.ts runs went down. A ladder crew caught means no more ladders in that
   *  square for a while. (The call-outs check their own crews for themselves.) */
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
    const cs = this.calls.map((c) => ({ id: c.id, n: c.name, x: Math.round(c.x), z: Math.round(c.z), u: c.until, on: c.on ? 1 : 0, a: c.onAt, v: c.vice ? 1 : 0, gz: c.gazebo ? [c.gazebo.x, c.gazebo.z] : 0 }));
    return {
      k: "s", se: this.season, sv: this.saved ? 1 : 0, L: [...this.L].map((v) => Math.round(v * 1000)), cl: [...this.cleared],
      c: cs[0] ?? null, cs, fr: this.freed.map((f) => [f.n, Math.round(f.x), Math.round(f.z)]),
      chr: { n: this.chair.name, t: this.chair.traits, w: this.chair.wins },
    };
  }

  private news(t: string, more: object = {}) {
    const msg = { k: "news", t, ...more };
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
      if (Array.isArray(d.fr)) this.freed = d.fr.map((f: any[]) => ({ n: String(f[0]), x: +f[1], z: +f[2], sq: this.squareAt(+f[1], +f[2]), t: 0 }));
      if (d.chr && typeof d.chr.n === "string") Object.assign(this.chair, { name: d.chr.n, traits: Array.isArray(d.chr.t) ? d.chr.t.filter((t: string) => t in TRAITS) : [], wins: +d.chr.w || 0 });
      this.setCalls(Array.isArray(d.cs) ? d.cs : d.c ? [d.c] : []);
      this.flagT = 0;
      return;
    }
    if (d.k === "down" && typeof d.id === "string") {
      if (from !== this.w.selfId) {
        const f = this.shown.find((s) => s.id === d.id);
        if (f && !this.cleared.has(f.id)) this.drop(f.x, f.y, f.z, f.a);
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
      if (d.won) { this.w.toast(`${d.name} is liberated! There's a ride outside, and a round on the house now and then`, 5); this.w.feed(`<b style="color:${GREEN}">${name}</b> liberated from the Bunting Society`); }
      else { this.w.toast(`The motion passes: the Society keeps ${d.name}`, 4); this.w.feed(`The Bunting Society took <b style="color:${PURPLE}">${name}</b>`); }
      if (d.line) setTimeout(() => this.w.feed(esc(String(d.line))), 1500);
      if (!this.w.isHost) this.setCalls(this.calls.filter((c) => c.name !== d.name).map((c) => ({ id: c.id, n: c.name, x: c.x, z: c.z, u: c.until, on: c.on ? 1 : 0, a: c.onAt, v: c.vice ? 1 : 0, gz: c.gazebo ? [c.gazebo.x, c.gazebo.z] : 0 })));
      return;
    }
    if (d.k === "news") {
      if (d.t === "saved") { SFX.jobDone(true); this.w.toast("Bath is saved! The Society has packed its bunting away till next season", 6); }
      else if (d.t === "ladder") this.w.toast("Ladder crew caught: no more flags going up round here for a bit", 3);
      else if (d.t === "quick") this.w.toast("Meeting closed early: bonus prizes!", 3.5);
      else if (d.t === "decorated") this.w.toast("Bath has been decorated. The fight goes on", 5);
      else if (d.t === "season") this.w.toast("A new season: the Bunting Society is back", 4);
      else if (d.t === "greet" || d.t === "mega") {
        const me = this.w.me(), dist = Math.hypot(+d.x - me.x, +d.z - me.z);
        if (dist < 200) SFX.megaphone(dist);
        if (d.t === "greet") { const s = String(d.s ?? ""); if (dist < 400) this.w.toast(s, 4); this.w.feed(esc(s)); }
        else if (dist < 250) this.w.toast(`Chair ${String(d.n)} calls for more wardens!`, 2.5);
      }
    }
  }

  /** The call-outs as the host says they are (on everyone else's screen). */
  private setCalls(list: any[]) {
    if (this.w.isHost) return;
    const out: Call[] = [];
    for (const c of list) {
      if (!c || typeof c !== "object") continue;
      const was = this.calls.find((o) => o.id === +c.id);
      if (!was) this.ring(String(c.n), +c.x, +c.z);
      out.push({
        id: +c.id, name: String(c.n), x: +c.x, z: +c.z, sq: this.squareAt(+c.x, +c.z), until: +c.u, on: !!c.on, onAt: +c.a || 0, vice: !!c.v,
        gazebo: Array.isArray(c.gz) ? { x: +c.gz[0], z: +c.gz[1] } : null, crew: [], chair: null, deputy: null, awayT: 0, megaT: 0,
      });
    }
    this.calls = out;
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

  /** The name on the boss bar for one of the Society's bosses, by their kit (0 the Chair, 1 the deputy, 2 the Vice-Chair). */
  bossName(kit: number) {
    return kit === 1 ? `Deputy to Chair ${this.chair.name}` : kit === 2 ? "The Vice-Chair" : `Chair ${this.chair.name}`;
  }

  // ---- every frame ----------------------------------------------------------------------------

  update(dt: number) {
    if (!this.on) return;
    if (this.season < 0 && (this.w.isHost || !this.heard)) this.fresh(Math.floor(Date.now() / SEASON));
    if (this.w.isHost) {
      const had = new Set(this.calls.map((c) => c.id));
      this.hostUpdate(dt);
      for (const c of this.calls) if (!had.has(c.id)) this.ring(c.name, c.x, c.z);
    }
    const me = this.w.me(), t = performance.now();
    for (const [id, at] of this.pending) if (t - at > 6000) this.pending.delete(id);
    if ((this.flagT -= dt) <= 0) { this.flagT = 0.5; this.drawFlags(me); }
    // torn halves flutter down, lie a moment and go
    for (let k = this.falling.length - 1; k >= 0; k--) {
      const f = this.falling[k], m = f.m;
      f.t += dt;
      if (m.position.y > f.floor) {
        f.vy -= 9 * dt;
        const drag = Math.min(1, dt * 2.6);
        f.vx -= f.vx * drag; f.vy -= f.vy * drag; f.vz -= f.vz * drag;
        m.position.x += (f.vx + Math.sin(f.t * 3 + f.ph) * 0.6) * dt;
        m.position.y += f.vy * dt;
        m.position.z += (f.vz + Math.cos(f.t * 2.6 + f.ph) * 0.6) * dt;
        m.rotation.x = Math.sin(f.t * 9 + f.ph) * 0.7;
        m.rotation.z = Math.cos(f.t * 7 + f.ph) * 0.5;
        m.rotation.y += f.spin * dt;
        if (m.position.y <= f.floor) { m.position.y = f.floor; m.rotation.set(-Math.PI / 2, 0, f.ph); }
      }
      if (f.t > 6) { this.w.scene.remove(m); this.falling.splice(k, 1); }
    }
    // the call-outs: their markers
    for (let k = 0; k < 2; k++) {
      const c = this.calls[k], want = c ? c.id : -1;
      if (this.marked.get(k) === want) continue;
      this.marked.set(k, want);
      if (c) this.w.mark(CALL_ID + k, { x: c.x, z: c.z }, `Emergency meeting: ${c.name}`, PURPLE);
      else this.w.mark(CALL_ID + k, null);
    }
    this.drawProps(me, t);
    this.hud(me);
  }

  /** Outside the pubs near you: the Society's banner and the Chair's gazebo where there's a meeting,
   *  and the liberation flag where there was one. */
  private drawProps(me: { x: number; z: number }, t: number) {
    const want = new Map<string, { x: number; z: number; free: boolean; gazebo: { x: number; z: number } | null }>();
    for (const c of this.calls) if (Math.hypot(c.x - me.x, c.z - me.z) < 300) want.set(`c${c.id}:${c.gazebo ? 1 : 0}`, { x: c.x, z: c.z, free: false, gazebo: c.gazebo });
    for (const f of this.freed) if (Math.hypot(f.x - me.x, f.z - me.z) < 300) want.set(`f${f.n}`, { x: f.x, z: f.z, free: true, gazebo: null });
    for (const [key, g] of this.props) {
      if (want.has(key)) continue;
      this.w.scene.remove(g);
      g.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
      this.props.delete(key);
    }
    for (const [key, p] of want) {
      let g = this.props.get(key);
      if (!g) {
        g = new THREE.Group();
        const at = clearSpot(this.w.map, p.x + 3, p.z, 6) ?? [p.x + 3, p.z];
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 6, 8), new THREE.MeshLambertMaterial({ color: "#d8d4c2" }));
        pole.position.set(at[0] - p.x, 3, at[1] - p.z);
        const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.6), p.free ? this.freeMat : this.bannerMat);
        flag.position.set(at[0] - p.x + 1.15, 5.1, at[1] - p.z); flag.name = "flag";
        g.add(pole, flag);
        if (p.gazebo) g.add(gazebo(p.gazebo.x - p.x, p.gazebo.z - p.z, this.w.map.ground(p.gazebo.x, p.gazebo.z) - this.w.map.ground(p.x, p.z)));
        g.position.set(p.x, this.w.map.ground(p.x, p.z), p.z);
        this.props.set(key, g);
        this.w.scene.add(g);
      }
      const flag = g.getObjectByName("flag");
      if (flag) flag.rotation.y = Math.sin(t / 700 + p.x) * 0.25;
    }
  }

  /** The meter under the minimap, the nearest call-out under it, and your count of flags down. */
  private hud(me: { x: number; z: number }) {
    const m = this.meter;
    const c = [...this.calls].sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0];
    let call = "";
    if (c) {
      const d = Math.hypot(c.x - me.x, c.z - me.z);
      const bonus = Math.round(BONUS_SECS - (Date.now() - c.onAt) / 1000);
      const boss = c.vice ? "The Vice-Chair" : `Chair ${esc(this.chair.name)}`;
      if (c.on) call = `${boss} is in <b>${esc(c.name)}</b>! ${far(d)}${bonus > 0 && c.onAt ? ` · bonus ${bonus}s` : ""}`;
      else {
        const left = Math.max(0, Math.round((c.until - Date.now()) / 1000));
        call = `Emergency meeting at <b>${esc(c.name)}</b> · ${far(d)} · ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
      }
      if (this.calls.length > 1) call += ` <span>(and ${esc(this.calls.find((o) => o !== c)!.name)})</span>`;
    } else if (this.saved) call = "Bath is saved, till next season";
    const pct = Math.round(m * 100);
    const downs = this.downs ? `<span class="downs">${this.downs} down</span>` : "";
    const html = `<div class="label">Bath bunting'd <b>${pct}%</b>${downs}</div><div class="bar"><div style="width:${Math.max(pct, m > 0 ? 1 : 0)}%"></div></div>${call ? `<em>${call}</em>` : ""}`;
    if (html !== this.html) { this.html = html; $("bunting").innerHTML = html; $("bunting").hidden = false; }
    $("bunting").classList.toggle("tick", performance.now() - this.tickAt < 220);
  }

  /** The squares for the maps, tinted by how flagged they are (scene coordinates). */
  tint(): { x0: number; z0: number; s: number; a: number; free?: boolean }[] {
    const out: { x0: number; z0: number; s: number; a: number; free?: boolean }[] = [];
    this.sqs.forEach((q, i) => {
      const free = this.isFree(i);
      if (this.L[i] > 0.02 || free) out.push({ x0: q.x - this.size / 2, z0: q.z - this.size / 2, s: this.size, a: this.L[i], free });
    });
    return out;
  }

  dispose() {
    for (let k = 0; k < 2; k++) this.w.mark(CALL_ID + k, null);
    for (const o of [this.flags, this.poles, this.pennants, this.strings, ...this.falling.map((f) => f.m), ...this.props.values()]) this.w.scene.remove(o);
  }
}

/** The Chair's gazebo: four poles and a striped roof, at (x, z) from the pub, y up from it. */
function gazebo(x: number, z: number, y: number) {
  const g = new THREE.Group(), pole = new THREE.MeshLambertMaterial({ color: "#e8e6e0" });
  for (const [a, b] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 6), pole);
    p.position.set(a, 1.1, b);
    g.add(p);
  }
  const c = document.createElement("canvas");
  c.width = 64; c.height = 8;
  const x2 = c.getContext("2d")!;
  for (let k = 0; k < 8; k++) { x2.fillStyle = k % 2 ? "#f2efe6" : "#1f8a8a"; x2.fillRect(k * 8, 0, 8, 8); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.3, 0.9, 4, 1, true), new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
  roof.rotation.y = Math.PI / 4; roof.position.y = 2.65;
  g.add(roof);
  g.position.set(x, y, z);
  return g;
}
