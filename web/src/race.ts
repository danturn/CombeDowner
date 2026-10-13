// A to B races: from the noticeboard to a real place 1 to 3 km away, on a set ride, everyone in the
// game at once. Taking one puts everyone on the start line with the ride, held still by a countdown
// (the same for everyone, as it comes from the clock) till GO. Then it's any way you like: there's
// only a start and a finish, the marker and an arrow over the crosshair point at the finish, and
// finding the shortcuts through Bath is the skill.
//
// The ride suits the route, from the lie of the land along the way: a steep climb is a BMX's (or a
// racing bike's, if it's long), a run that only goes down is for the skateboard or the shopping
// trolley, the flat is for the rollerblades or the scooter, and a short flat hop is a pogo dash.
//
// Splits at three points on the way (a quarter, half and three quarters of the way there, by how far
// you are from the finish) flash green or red against your best, like a time trial. There's gold,
// silver and bronze, and a hidden author's time, worked out from riding the route's line on its ride
// with some slack for the streets. Your best run on each route is kept, a point every tenth of a
// second, and you race a see-through rider of it; finishing with a best sends your run round, so
// everyone else in the room races your ghost too, alongside the real riders.
//
// Backspace (Again on a touch screen) puts just you back on the line with a quick 3-2-1 of your own
// and your own clock: a time trial for you, while the room's race and its results stand. It works
// for two minutes after a race is over too.
//
// The daily race: one more noticeboard round the village each day, the same route for everyone,
// with a board of the times in the room and the "local legend", whoever's had the most goes at it.
//
// Who decides what: the route comes from the poster's seed (and the lie of the land, from the
// map everyone has). Each player times themselves, and says when they're over the line ("fin"),
// with their run ("gh") if it's a best. A go of your own sends "pb" with its time, and the daily
// race's board is everyone saying their best and how many goes they've had ("brd").
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import * as SFX from "./audio";
import { dayNumber } from "./daylight";
import { clearSpot } from "./haunts";
import { type RideKind, TROLLEY_AHEAD, rideModel, rideSpecs } from "./rides";
import { type Card, type Job, type Offer, type PostSpot, type QuestWorld, type Rng, compassWord, esc, far, hash, pickOf, registerJob, rng } from "./quests";

const COLOUR = "#3ec7e8";
const COUNTDOWN = 8;       // seconds from taking it to GO
const RETRY = 3;           // and for a go of your own
const FINISH = 9;          // metres from the finish point that counts as over the line
const GHOST_EVERY = 0.1;   // seconds between the points of a ghost run
const AFTER = 90;          // seconds after the first one's over the line that the others get
const LINGER = 30;         // seconds a go of your own stays up after you're over the line
const GHOSTS = 4;          // the most ghosts out at once
const KEY = "cd-race-";
const KEEP = 40;           // routes whose best runs are kept
const DAILY = 1;           // offer.mode for the daily race

interface Route { to: { n: string; x: number; z: number }; ride: RideKind; d: number; author: number; name: string }

// ---- the route ----------------------------------------------------------------------------------

/** The height of the ground, the same for everyone whatever's loaded round them. */
function groundOf(w: QuestWorld, x: number, z: number) {
  const wide = w.map.wide;
  return wide && !wide.inCore(x, -z) ? wide.ground(x, z) : w.map.ground(x, z);
}

/** The ground along the straight line from a to b. */
function profile(w: QuestWorld, ax: number, az: number, bx: number, bz: number): number[] {
  // every 150 m or so: closer, and a bank or a railway cutting looks like a hill
  const n = Math.max(6, Math.min(24, Math.round(Math.hypot(bx - ax, bz - az) / 150)));
  const hs: number[] = [];
  for (let k = 0; k <= n; k++) hs.push(groundOf(w, ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n));
  return hs;
}

/** The ride for the lie of the land: never one that's plainly wrong for it. */
function rideFor(r: Rng, d: number, hs: number[], short: boolean): RideKind {
  const seg = d / (hs.length - 1);
  let climb = 0, fall = 0, steep = 0;
  for (let k = 1; k < hs.length; k++) {
    const dh = hs[k] - hs[k - 1];
    if (dh > 0) climb += dh; else fall -= dh;
    steep = Math.max(steep, dh / seg);
  }
  const drop = hs[0] - hs[hs.length - 1];
  if (short && climb < 12 && steep < 0.06) return "pogo";                      // a short flat hop
  if (drop > 35 && climb < 20) return drop > 60 && r() < 0.6 ? "trolley" : pickOf(r, ["trolley", "board"] as RideKind[]);   // all downhill
  if (climb > 60 || (steep > 0.12 && climb > 30)) return steep > 0.12 || d < 1800 ? "bmx" : "bike";   // a real climb
  if (climb + fall < 35 && steep < 0.06) return d < 1300 ? "scooter" : "blades";      // the flat
  if (drop > 20 && climb < 20) return "board";                                   // gently down
  if (climb < 25 && steep < 0.06) return "blades";                               // gently rolling
  return pickOf(r, ["bike", "bmx"] as RideKind[]);
}

/** The author's time: the route's line ridden on its ride, a stretch at a time at the speed its
 *  handling settles at on that slope (as in player.ts), with slack for the streets winding about. */
function authorTime(ride: RideKind, d: number, hs: number[]): number {
  const s = rideSpecs[ride], seg = d / (hs.length - 1);
  let t = 0;
  for (let k = 1; k < hs.length; k++) {
    const g = (hs[k] - hs[k - 1]) / seg;
    let v = s.top;
    if (!s.pogo && g < 0) v = Math.min(s.maxDown, s.top + (9.8 * -g * s.downhill) / 0.15);
    else if (!s.pogo && g > 0) { const push = s.accel - 9.8 * g * s.downhill; v = push > 0.6 ? s.top : Math.max(1.4, s.top * (push + 0.6) / 1.2); }
    t += (seg * 1.3) / (v * 0.92);
  }
  return Math.round(t + 4);
}
const medals = (a: number) => ({ gold: a * 1.12, silver: a * 1.35, bronze: a * 1.7 });

/** The route from the poster: where to, on what, and the author's time. */
function routeOf(o: Offer, w: QuestWorld): Route | null {
  const r = rng(o.seed);
  const ok = (x: number, z: number) => w.map.fieldEdge(x, z) > 100;
  const short = o.mode !== DAILY && r() < 0.15;
  const near = short ? [500, 1000] : o.mode === DAILY ? [1200, 2500] : [1000, 3000];
  const all = [...w.pubs().map((p) => ({ n: p.name, x: p.x, z: p.z })), ...w.places()]
    .filter((p) => ok(p.x, p.z) && Math.hypot(p.x - o.x, p.z - o.z) > near[0] && Math.hypot(p.x - o.x, p.z - o.z) < near[1])
    .sort((a, b) => a.x - b.x || a.z - b.z || a.n.localeCompare(b.n));
  if (!all.length) return null;
  const to = pickOf(r, all), d = Math.hypot(to.x - o.x, to.z - o.z);
  const hs = profile(w, o.x, o.z, to.x, to.z);
  const ride = rideFor(r, d, hs, short);
  const label = ride === "trolley" ? "Trolley dash" : ride === "pogo" ? "Pogo dash" : ride === "board" ? "Skate run" : ride === "blades" ? "Blade run"
    : ride === "scooter" ? "Scooter sprint" : ride === "bmx" ? "BMX climb" : "Bike race";
  return { to, ride, d, author: Math.max(30, authorTime(ride, d, hs)), name: label };
}

function poster(o: Offer, rt: Route) {
  const best = bestOf(o.seed), m = medals(rt.author);
  o.stars = o.mode === DAILY ? 2 : rt.d > 2200 ? 3 : rt.d > 1500 ? 2 : 1;
  o.blurb = `From here to <b>${esc(rt.to.n)}</b>, ${far(rt.d)} ${compassWord(rt.to.x - o.x, rt.to.z - o.z)} as the crow flies, on ${esc(rideSpecs[rt.ride].name)}. Any way you like. `
    + `Gold ${clock(m.gold)}, silver ${clock(m.silver)}, bronze ${clock(m.bronze)}, and a hidden author's time.${best ? ` Your best: ${clock(best.t, true)}.` : ""}`;
  o.reward = `${o.stars} prize${o.stars > 1 ? "s" : ""} for the winner's room, and your ghost`;
}
let world: QuestWorld | null = null;   // for the daily race's poster

registerJob({
  id: "race", glyph: "R", colour: COLOUR, label: "Race", again: true,
  offer(r, spot: PostSpot, w) {
    const o: Offer = { kind: "race", seed: hash("race", r() * 1e9), stars: 1, title: "", blurb: "", reward: "", x: spot.x, z: spot.z, where: spot.name };
    const rt = routeOf(o, w);
    if (!rt) return null;
    o.title = `${rt.name} to ${rt.to.n}`;
    poster(o, rt);
    return o;
  },
  daily(r, spots, w) {
    world = w;
    for (let k = 0; k < 6 && spots.length; k++) {
      const spot = pickOf(r, spots);
      const o: Offer = { kind: "race", seed: hash("daily race", dayNumber(), r() * 1e9), stars: 2, title: "", blurb: "", reward: "", x: spot.x, z: spot.z, where: spot.name, mode: DAILY };
      const rt = routeOf(o, w);
      if (!rt) continue;
      o.title = `Daily race: ${rt.name.toLowerCase()} to ${rt.to.n}`;
      poster(o, rt);
      o.blurb = `Today's race, the same for everyone. ${o.blurb}`;
      return o;
    }
    return null;
  },
  poster(o) {
    if (o.mode !== DAILY) return "";
    if (board.seed !== o.seed && world) { const m = myDaily(o.seed); onBoard(o.seed, world.selfId, world.name, m.t, m.n); }
    return boardHtml();
  },
  start: (o, w, started, _by, local) => new Race(o, w, started, !!local),
});

/** "1:23.4". */
function clock(s: number, tenths = false) {
  const m = Math.floor(s / 60), r = s - m * 60;
  return `${m}:${tenths ? r.toFixed(1).padStart(4, "0") : String(Math.round(r)).padStart(2, "0")}`;
}

// ---- best runs ----------------------------------------------------------------------------------

/** A run: its time, splits, and where you were every e seconds (decimetres, each from the last). */
interface Best { t: number; sp: number[]; g: string; e: number }

/** A run's points as x, z pairs, from its packed form. */
function unpack(g: string): number[] {
  const out: number[] = [];
  let x = 0, z = 0;
  const v = g.split(",");
  for (let k = 0; k + 1 < v.length; k += 2) { x += Number(v[k]) || 0; z += Number(v[k + 1]) || 0; out.push(x / 10, z / 10); }
  return out;
}
function pack(pts: number[]): string {
  const out: number[] = [];
  let x = 0, z = 0;
  for (let k = 0; k + 1 < pts.length; k += 2) {
    const nx = Math.round(pts[k] * 10), nz = Math.round(pts[k + 1] * 10);
    out.push(nx - x, nz - z); x = nx; z = nz;
  }
  return out.join(",");
}
function validBest(b: any): Best | null {
  if (!b || typeof b.t !== "number" || !Number.isFinite(b.t)) return null;
  const g = Array.isArray(b.g) ? pack(b.g.map(Number)) : typeof b.g === "string" ? b.g : "";
  return { t: b.t, sp: Array.isArray(b.sp) ? b.sp.map(Number).filter(Number.isFinite) : [], g: g.slice(0, 60000), e: Number(b.e) || (Array.isArray(b.g) ? 0.2 : GHOST_EVERY) };
}
function bestOf(seed: number): Best | null {
  try { return validBest(JSON.parse(localStorage.getItem(KEY + seed) ?? "null")); } catch { return null; }
}
/** Keep a best (or, with "r", the fastest someone sent), and forget the oldest routes' past KEEP. */
function keepBest(seed: number, b: Best & { by?: string }, rival = "") {
  try {
    localStorage.setItem(KEY + seed + rival, JSON.stringify(b));
    const list: number[] = (JSON.parse(localStorage.getItem(KEY + "list") ?? "[]") as number[]).filter((s) => s !== seed);
    list.push(seed);
    while (list.length > KEEP) { const old = list.shift(); localStorage.removeItem(KEY + old); localStorage.removeItem(KEY + old + "r"); }
    localStorage.setItem(KEY + "list", JSON.stringify(list));
  } catch { /* full, or no storage */ }
}

// ---- the daily race's board ------------------------------------------------------------------------

/** Today's board: everyone's best time and how many goes they've had, in this room. */
const board = { seed: 0, rows: new Map<string, { name: string; t: number; n: number }>() };
function myDaily(seed: number): { t: number; n: number } {
  try { const d = JSON.parse(localStorage.getItem(KEY + "daily") ?? "null"); if (d?.s === seed) return { t: Number(d.t) || 0, n: Number(d.n) || 0 }; } catch { /* none */ }
  return { t: 0, n: 0 };
}
function keepDaily(seed: number, d: { t: number; n: number }) {
  try { localStorage.setItem(KEY + "daily", JSON.stringify({ s: seed, ...d })); } catch { /* full */ }
}
function onBoard(seed: number, id: string, name: string, t: number, n: number) {
  if (board.seed !== seed) { board.seed = seed; board.rows.clear(); }
  const was = board.rows.get(id);
  const best = t > 0 && (!was?.t || t < was.t) ? t : was?.t ?? 0;
  board.rows.set(id, { name, t: best, n: Math.max(n, was?.n ?? 0) });
}
function boardHtml(): string {
  const rows = [...board.rows.values()];
  if (!rows.length) return "";
  const legend = rows.reduce((a, b) => (b.n > a.n ? b : a));
  const times = rows.filter((r) => r.t > 0).sort((a, b) => a.t - b.t).slice(0, 5);
  return `<p>${times.map((r, k) => `${k + 1}. ${esc(r.name)} ${clock(r.t, true)}`).join(" · ") || "No times yet"}`
    + `${legend.n > 0 ? `<br>Local legend: <b>${esc(legend.name)}</b> (${legend.n} go${legend.n > 1 ? "es" : ""})` : ""}</p>`;
}

// ---- on the screen ----------------------------------------------------------------------------------

/** A bit of the HUD of the race's own: the arrow over the crosshair, and the splits under it. */
function hudBit(css: string): HTMLDivElement {
  const el = document.createElement("div");
  el.style.cssText = `position:fixed;left:50%;pointer-events:none;z-index:5;text-align:center;font:800 22px 'Barlow Condensed',Impact,sans-serif;text-shadow:0 1px 3px #000;${css}`;
  el.hidden = true;
  (document.getElementById("hud") ?? document.body).appendChild(el);
  return el;
}

/** A see-through rider: the ride and a figure on it, all one mesh. */
function ghostModel(ride: RideKind, colour: string): THREE.Mesh {
  const g = rideModel(ride), s = rideSpecs[ride];
  if (ride === "trolley") g.position.z = -TROLLEY_AHEAD;
  const root = new THREE.Group();
  root.add(g);
  const feet = ride === "trolley" ? 0 : s.lift + 0.08;
  const fig = (geo: THREE.BufferGeometry, x: number, y: number, z: number) => { const m = new THREE.Mesh(geo); m.position.set(x, y, z); root.add(m); };
  for (const x of [-0.11, 0.11]) fig(new THREE.BoxGeometry(0.12, 0.8, 0.14), x, feet + 0.4, 0);
  fig(new THREE.CapsuleGeometry(0.2, 0.45, 3, 8), 0, feet + 1.12, 0);
  fig(new THREE.SphereGeometry(0.14, 8, 6), 0, feet + 1.62, 0);
  root.updateMatrixWorld(true);
  const parts: THREE.BufferGeometry[] = [];
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const geo = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(o.matrixWorld);
    for (const a of Object.keys(geo.attributes)) if (a !== "position" && a !== "normal") geo.deleteAttribute(a);
    parts.push(geo);
    o.geometry.dispose();
  });
  const merged = mergeGeometries(parts) ?? new THREE.BoxGeometry(0.4, 1.8, 0.4);
  for (const p of parts) p.dispose();
  return new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.33, depthWrite: false }));
}

interface Ghost { id: string; name: string; colour: string; b: Best; pts: number[]; view?: THREE.Mesh; heading: number }

// ---- the race -------------------------------------------------------------------------------------

class Race implements Job {
  done: Job["done"] = null;
  private rt: Route;
  private medal: ReturnType<typeof medals>;
  private go: number;                       // ms since 1970: GO for the room
  private myGo: number;                     // and for me (a go of my own starts later)
  private start: { x: number; z: number; yaw: number };
  private fin: { x: number; z: number };
  private racing = false;                   // I'm on the start line or on the way
  private own = false;                      // on a go of my own (Backspace), not the room's
  private over = false;                     // I'm over the line
  private overT = 0;                        // when, ms since 1970
  private roomOver = false;                 // everyone's in, or out of time
  private results: { id: string; t: number }[] = [];
  private pipped = 4;
  private splits: number[] = [];
  private run: number[] = []; private runT = 0;
  private best: Best | null;
  private ghosts = new Map<string, Ghost>();
  private arch: THREE.Group | null = null;
  private arrow = hudBit("top:calc(50% - 96px);width:48px;margin-left:-24px;color:" + COLOUR);
  private flash = hudBit("top:calc(50% + 48px);width:260px;margin-left:-130px");
  private flashT = 0;
  private firstT = 0;
  private daily: boolean;

  constructor(readonly offer: Offer, private w: QuestWorld, started: number, private local: boolean) {
    this.rt = routeOf(offer, w)!;
    this.medal = medals(this.rt.author);
    this.daily = offer.mode === DAILY;
    this.go = started + (local ? RETRY : COUNTDOWN) * 1000;
    this.myGo = this.go;
    this.best = bestOf(offer.seed);
    const f = clearSpot(w.map, this.rt.to.x, this.rt.to.z, 25) ?? [this.rt.to.x, this.rt.to.z];
    this.fin = { x: f[0], z: f[1] };
    // everyone on the line, side by side, facing the finish
    const yaw = Math.atan2(-(this.fin.x - offer.x), -(this.fin.z - offer.z));
    const ids = local ? [w.selfId] : w.players().map((p) => p.id).sort(), k = Math.max(0, ids.indexOf(w.selfId));
    const side = (k - (ids.length - 1) / 2) * 1.6, sx = offer.x + Math.cos(yaw) * side + -Math.sin(yaw) * 3, sz = offer.z - Math.sin(yaw) * side - Math.cos(yaw) * 3;
    const s = clearSpot(w.map, sx, sz, 6) ?? [offer.x, offer.z];
    this.start = { x: s[0], z: s[1], yaw };
    // your best to race, and the fastest anyone's sent you on this route
    if (this.best) this.addGhost(w.selfId, "Your best", COLOUR, this.best);
    try {
      const r = JSON.parse(localStorage.getItem(KEY + offer.seed + "r") ?? "null"), b = validBest(r);
      if (b && (!this.best || b.t < this.best.t)) this.addGhost("@rival", String(r.by ?? "A rival").slice(0, 40), "#c99cff", b);
    } catch { /* none */ }
    this.arrow.innerHTML = `<svg viewBox="0 0 48 48" width="48" height="48"><path d="M24 3 L41 38 L24 29 L7 38 Z" fill="currentColor" stroke="#000" stroke-opacity=".5" stroke-width="2"/></svg>`;
    w.mark("@race", this.fin, `Finish: ${this.rt.to.n}`, COLOUR);
    if (this.daily) {
      const mine = myDaily(offer.seed);
      onBoard(offer.seed, w.selfId, w.name, mine.t, mine.n);
      if (!local) w.send("qe", { k: "brd", s: offer.seed, t: mine.t, n: mine.n });
    }
    this.own = local;
    if (Date.now() < this.go - 1000 && w.me().alive) {
      this.racing = true;
      w.moveTo(this.start.x, this.start.z, yaw);
      w.ride(this.rt.ride);
    } else w.toast("A race is on: you're watching this one. Backspace to have a go of your own", 3);
  }

  /** Seconds since my GO. */
  private get now() { return (Date.now() - this.myGo) / 1000; }

  /** Back on the line, on my own clock. */
  restart(): boolean {
    if (!this.w.me().alive) return false;
    this.own = true; this.racing = true; this.over = false;
    this.splits = []; this.run = []; this.runT = 0; this.pipped = 4;
    this.myGo = Date.now() + RETRY * 1000;
    this.w.moveTo(this.start.x, this.start.z, this.start.yaw);
    this.w.ride(this.rt.ride);
    SFX.tick();
    return true;
  }

  held() { return this.racing && this.now < 0 ? { x: this.start.x, z: this.start.z } : null; }

  update(dt: number) {
    const t = this.now, me = this.w.me();
    // the countdown: a pip a second and a long one on GO
    if (this.racing && !this.over) {
      if (t < 0) {
        const n = Math.ceil(-t);
        if (n <= 3 && n < this.pipped) { this.pipped = n; SFX.pip(false); this.show(`<span style="font-size:54px;color:#fff">${n}</span>`, 0.9); }
      } else if (this.pipped > 0) { this.pipped = 0; SFX.pip(true); this.show(`<span style="font-size:54px;color:${COLOUR}">GO!</span>`, 1); }
    }
    if (!this.roomOver && this.results.length && (Date.now() - this.firstT) / 1000 > AFTER) this.roomOver = true;
    // the room's race is over once I'm not in the middle of a go of my own; a go of my own, a while after it
    if (!this.done) {
      const busy = this.racing && !this.over;
      if (this.local ? this.over && Date.now() - this.overT > LINGER * 1000 : this.roomOver && !busy) this.finish();
    }
    if (this.done) { this.hideHud(); return; }
    const d = Math.hypot(this.fin.x - me.x, this.fin.z - me.z);
    if (this.racing && !this.over && t >= 0) {
      // the run, for your ghost
      if ((this.runT -= dt) <= 0) { this.runT += GHOST_EVERY; if (this.runT < 0) this.runT = 0; this.run.push(me.x, me.z); }
      // splits at three quarters, half and a quarter of the way to go
      const k = this.splits.length;
      if (k < 3 && d < this.rt.d * (1 - (k + 1) / 4)) this.split(k, t);
      if (d < FINISH && me.alive) this.crossed(t);
    }
    this.drawArrow(me, d);
    if (this.flashT > 0 && (this.flashT -= dt) <= 0) this.flash.hidden = true;
    this.drawGhosts(t);
    this.drawArch(me);
  }

  private show(html: string, secs: number) { this.flash.innerHTML = html; this.flash.hidden = false; this.flashT = secs; }

  private split(k: number, t: number) {
    this.splits.push(t);
    const was = this.best?.sp[k];
    const diff = was !== undefined ? t - was : null;
    const col = diff === null ? "#fff" : diff <= 0 ? "#58e06a" : "#ff5a4e";
    this.show(`<div style="font-size:16px;color:#ddd">Split ${k + 1}</div><span style="color:#fff">${clock(t, true)}</span>`
      + (diff !== null ? ` <span style="color:${col}">${diff <= 0 ? "-" : "+"}${Math.abs(diff).toFixed(1)}</span>` : ""), 2.5);
    if (diff !== null) SFX.pip(diff <= 0); else SFX.tick();
  }

  /** Over the line, at t on my clock. */
  private crossed(t: number) {
    this.over = true; this.overT = Date.now();
    t = Math.round(t * 10) / 10;
    const s = this.offer.seed;
    let n = 0;
    if (this.daily) {
      const mine = myDaily(s);
      n = mine.n + 1;
      keepDaily(s, { t: mine.t && mine.t < t ? mine.t : t, n });
      onBoard(s, this.w.selfId, this.w.name, t, n);
    }
    if (!this.own) {
      const msg = { k: "fin", s, t, n };
      this.w.send("qe", msg);
      this.event(msg, this.w.selfId);
    } else {
      this.w.send("qe", { k: "pb", s, t, n });
      SFX.jobStep();
    }
    const beat = !this.best || t < this.best.t;
    const m = this.medalOf(t);
    this.show(`<span style="color:#fff">${clock(t, true)}</span> <span style="color:${beat ? "#58e06a" : "#ddd"}">${m}${beat && this.best ? ", a best!" : ""}</span>`
      + `<div style="font-size:15px;color:#ddd">Backspace to go again</div>`, 5);
    // a best: keep it, and send it round as a ghost for everyone else
    if (beat) {
      const b: Best = { t, sp: this.splits.slice(), g: pack(this.run), e: GHOST_EVERY };
      this.best = b;
      keepBest(s, b);
      this.addGhost(this.w.selfId, "Your best", COLOUR, b);
      this.w.send("qe", { k: "gh", s, b });
    }
  }

  private addGhost(id: string, name: string, colour: string, b: Best) {
    const was = this.ghosts.get(id);
    if (was?.view) { this.w.scene.remove(was.view); was.view.geometry.dispose(); (was.view.material as THREE.Material).dispose(); }
    this.ghosts.set(id, { id, name, colour, b, pts: unpack(b.g), heading: this.start.yaw });
  }

  /** The best runs, see-through, racing you on your clock: yours and the fastest few from the room. */
  private drawGhosts(t: number) {
    const live = this.racing && !this.over && t >= 0;
    const mine = this.ghosts.get(this.w.selfId);
    const shown = [...this.ghosts.values()].filter((g) => g !== mine).sort((a, b) => a.b.t - b.b.t).slice(0, GHOSTS - (mine ? 1 : 0));
    if (mine) shown.push(mine);
    for (const g of this.ghosts.values()) {
      const n = g.pts.length / 2;
      if (!live || n < 2 || !shown.includes(g)) { if (g.view) g.view.visible = false; continue; }
      if (!g.view) { g.view = ghostModel(this.rt.ride, g.colour); this.w.scene.add(g.view); }
      const f = t / g.b.e, i = Math.min(n - 1, Math.floor(f)), j = Math.min(n - 1, i + 1), u = Math.min(1, f - i);
      const x = g.pts[i * 2] + (g.pts[j * 2] - g.pts[i * 2]) * u, z = g.pts[i * 2 + 1] + (g.pts[j * 2 + 1] - g.pts[i * 2 + 1]) * u;
      const k2 = Math.min(n - 1, i + 3), dx = g.pts[k2 * 2] - g.pts[i * 2], dz = g.pts[k2 * 2 + 1] - g.pts[i * 2 + 1];
      if (Math.hypot(dx, dz) > 0.3) {
        const want = Math.atan2(-dx, -dz), diff = Math.atan2(Math.sin(want - g.heading), Math.cos(want - g.heading));
        g.heading += diff * 0.2;
      }
      g.view.position.set(x, this.w.map.ground(x, z), z);
      g.view.rotation.y = g.heading;
      g.view.visible = true;
    }
  }

  /** The arrow over the crosshair, pointing at the finish. */
  private drawArrow(me: { x: number; z: number; yaw: number }, d: number) {
    const on = this.racing && !this.over && d > FINISH;
    if (this.arrow.hidden === on) this.arrow.hidden = !on;
    if (!on) return;
    const want = Math.atan2(-(this.fin.x - me.x), -(this.fin.z - me.z));
    const rel = Math.atan2(Math.sin(want - me.yaw), Math.cos(want - me.yaw));
    this.arrow.style.transform = `rotate(${(-rel).toFixed(3)}rad)`;
  }

  private hideHud() { this.arrow.hidden = true; this.flash.hidden = true; for (const g of this.ghosts.values()) if (g.view) g.view.visible = false; }

  /** A chequered arch over the finish, when you're near it. */
  private drawArch(me: { x: number; z: number }) {
    const near = Math.hypot(this.fin.x - me.x, this.fin.z - me.z) < 300;
    if (near && !this.arch) {
      const g = new THREE.Group(), c = document.createElement("canvas");
      c.width = 256; c.height = 32;
      const x = c.getContext("2d")!;
      for (let k = 0; k < 16; k++) for (let r = 0; r < 2; r++) { x.fillStyle = (k + r) % 2 ? "#111" : "#f4f4f2"; x.fillRect(k * 16, r * 16, 16, 16); }
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const post = new THREE.MeshLambertMaterial({ color: "#d8d4c2" });
      for (const s of [-3, 3]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.15, 4, 0.15), post); p.position.set(s, 2, 0); g.add(p); }
      const banner = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.6, 0.08), new THREE.MeshLambertMaterial({ map: tex }));
      banner.position.y = 4;
      g.add(banner);
      g.position.set(this.fin.x, this.w.map.ground(this.fin.x, this.fin.z), this.fin.z);
      g.rotation.y = Math.atan2(this.fin.x - this.offer.x, this.fin.z - this.offer.z);
      this.arch = g;
      this.w.scene.add(g);
    } else if (!near && this.arch) this.dropArch();
  }

  private dropArch() {
    if (!this.arch) return;
    this.w.scene.remove(this.arch);
    this.arch.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
    this.arch = null;
  }

  event(d: any, from: string) {
    const s = this.offer.seed;
    if (this.daily && (d.k === "fin" || d.k === "pb" || d.k === "brd") && from !== this.w.selfId) {
      const t = Number(d.t), n = Number(d.n);
      if (Number.isFinite(t) && Number.isFinite(n)) onBoard(s, from, this.w.nameOf(from), Math.max(0, t), Math.max(0, Math.min(9999, n)));
      // someone new to the board: say where you stand, so they see you on it too
      if (d.k === "brd") { const mine = myDaily(s); this.w.send("qe", { k: "bd2", s, t: mine.t, n: mine.n }, from); }
    }
    if (this.daily && d.k === "bd2" && from !== this.w.selfId) {
      const t = Number(d.t), n = Number(d.n);
      if (Number.isFinite(t) && Number.isFinite(n)) onBoard(s, from, this.w.nameOf(from), Math.max(0, t), Math.max(0, Math.min(9999, n)));
    }
    if (d.k === "fin" && !this.results.some((r) => r.id === from)) {
      const t = Number(d.t);
      if (!Number.isFinite(t)) return;
      if (!this.results.length) this.firstT = Date.now();
      this.results.push({ id: from, t });
      this.results.sort((a, b) => a.t - b.t);
      const place = this.results.findIndex((r) => r.id === from) + 1;
      const who = from === this.w.selfId ? "You" : this.w.nameOf(from);
      SFX.jobStep();
      this.w.feed(`<b style="color:${this.w.colourOf(from)}">${esc(who)}</b> crossed the line ${["1st", "2nd", "3rd"][place - 1] ?? `${place}th`} in ${clock(t, true)} (${this.medalOf(t)})`);
      // everyone who was on the line is over it: done
      if (this.results.length >= this.w.players().length) this.roomOver = true;
    } else if (d.k === "gh" && from !== this.w.selfId) {
      const b = validBest(d.b);
      const was = this.ghosts.get(from);
      if (b && b.g && (!was || b.t < was.b.t)) {
        this.addGhost(from, this.w.nameOf(from), this.w.colourOf(from), b);
        // the fastest ghost anyone's sent is kept as a rival for next time
        let r: Best | null = null;
        try { r = validBest(JSON.parse(localStorage.getItem(KEY + s + "r") ?? "null")); } catch { /* none */ }
        if (!r || b.t < r.t) keepBest(s, { ...b, by: this.w.nameOf(from) }, "r");
      }
    }
  }

  private medalOf(t: number) {
    const m = this.medal;
    return t < this.rt.author ? "beat the author!" : t < m.gold ? "gold" : t < m.silver ? "silver" : t < m.bronze ? "bronze" : "no medal";
  }

  private finish() {
    if (this.done) return;
    if (!this.results.length) {
      this.done = this.local ? { won: false, text: "Time trial over" } : { won: false, text: "Nobody made it over the line" };
      return;
    }
    const top = this.results.slice(0, 3).map((r, k) => `${k + 1}. ${r.id === this.w.selfId ? "You" : this.w.nameOf(r.id)} ${clock(r.t, true)}`).join(" · ");
    this.done = { won: true, text: top, x: this.fin.x, z: this.fin.z };
  }

  progress() { return { r: this.results }; }
  restore(p: any) { if (Array.isArray(p?.r)) for (const r of p.r) if (!this.results.some((o) => o.id === r.id)) this.results.push({ id: String(r.id), t: Number(r.t) }); }

  card(): Card {
    const t = this.now, me = this.w.me(), m = this.medal;
    const medalLine = `Gold ${clock(m.gold)} · silver ${clock(m.silver)} · bronze ${clock(m.bronze)}`;
    const legend = this.daily ? boardHtml() : "";
    if (this.racing && !this.over && t < 0) {
      return { line: `<b class="clue">${Math.ceil(-t) <= 3 ? Math.ceil(-t) : "Get ready"}</b>`, sub: `${esc(rideSpecs[this.rt.ride].name)} · ${medalLine}${this.best ? ` · best ${clock(this.best.t, true)}` : ""}` };
    }
    const d = Math.hypot(this.fin.x - me.x, this.fin.z - me.z);
    const roomMine = this.results.find((r) => r.id === this.w.selfId);
    if (!this.racing || this.over) {
      const mine = this.over ? this.best : null;
      return {
        line: roomMine ? `Over the line in ${clock(roomMine.t, true)}: ${this.medalOf(roomMine.t)}` : mine ? `Your best: ${clock(mine.t, true)} (${this.medalOf(mine.t)})` : `Watching: ${far(d)} to <b>${esc(this.rt.to.n)}</b>`,
        sub: `<b>Backspace</b> to go again${this.local ? "" : this.results.length ? ` · leader ${clock(this.results[0].t, true)}` : ""}${legend}`,
      };
    }
    const sp = this.splits.map((s, k) => {
      const was = this.best?.sp[k];
      return was === undefined ? clock(s, true) : `<span style="color:${s <= was ? "#58e06a" : "#ff5a4e"}">${clock(s, true)}</span>`;
    }).join(" · ");
    return {
      line: `${far(d)} to <b>${esc(this.rt.to.n)}</b>, ${compassWord(this.fin.x - me.x, this.fin.z - me.z)} · ${clock(Math.max(0, t), true)}${this.own ? " (your own go)" : ""}`,
      sub: `${sp ? `Splits ${sp}<br>` : ""}${medalLine}${!this.own && this.results.length ? ` · leader ${clock(this.results[0].t, true)}` : ""}`,
      bar: 1 - Math.min(1, d / this.rt.d),
    };
  }

  end() {
    this.w.mark("@race", null);
    for (const g of this.ghosts.values()) if (g.view) { this.w.scene.remove(g.view); g.view.geometry.dispose(); (g.view.material as THREE.Material).dispose(); }
    this.ghosts.clear();
    this.dropArch();
    this.arrow.remove();
    this.flash.remove();
  }
}
