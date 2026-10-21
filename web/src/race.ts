// A to B races: from the noticeboard to a real place 1 to 3 km away, on a set ride. Taking one
// opens the entries: for a few seconds anyone in the game, wherever they are, can press E to enter
// (whoever took it is in already). When the entries close, everyone who entered, and nobody else,
// is put on a starting grid across the street with the ride, facing the way, held still by a
// countdown (the same for everyone, as it comes from the clock) till GO.
//
// The start and the finish are on the nearest proper street to the noticeboard and to the place,
// since most of the rides are hopeless on grass, and the route between them follows the streets
// (raceroute.ts). Checkpoints stand across the road along it, a gate at a time, and have to be
// ridden through in order before the finish counts; between them it's any way you like. The route
// and its checkpoints are drawn on the maps, and an arrow over the crosshair points at the next
// one. Over the line, a big banner, confetti and a fanfare say where you came and in what time,
// with everyone else's times as they come in (racefinish.ts).
//
// The ride suits the route, from the lie of the land along the way: a steep climb is a BMX's (or a
// racing bike's, if it's long), a run that only goes down is for the skateboard or the shopping
// trolley, the flat is for the rollerblades or the scooter, and a short flat hop is a pogo dash.
//
// Each checkpoint is a split, flashing green or red against your best, like a time trial. There's
// gold, silver and bronze, and a hidden author's time, worked out from riding the route's line on
// its ride with some slack for the streets. Your best run on each route is kept, a point every
// tenth of a second, and you race a see-through rider of it; finishing with a best sends your run
// round, so everyone else in the room races your ghost too, alongside the real riders.
//
// Backspace (Again on a touch screen) puts just you back on the line with a quick 3-2-1 of your own
// and your own clock: a time trial for you, while the room's race and its results stand. It works
// for two minutes after a race is over too.
//
// The daily race: one more noticeboard round the village each day, the same route for everyone,
// with a board of the times in the room and the "local legend", whoever's had the most goes at it.
//
// Who decides what: the route and its checkpoints come from the poster's seed and the map everyone
// has. Entering goes round as "ent"; the host closes the entries and sends the grid ("grid": who's
// racing, in grid order), and if no grid comes (an older host) each player falls back on the
// entries they heard. Each racer times themselves and says as they pass each checkpoint ("cp") and
// cross the line ("fin"), with their run ("gh") if it's a best. Everyone keeps the results from
// those, counting a finish only from someone who's been through every checkpoint in order; the
// host checks the time against its own clock as well, and sends the results that stand ("res"),
// or says a finish doesn't count ("dq"). A go of your own sends "pb" with its time, and the daily
// race's board is everyone saying their best and how many goes they've had ("brd").
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import * as SFX from "./audio";
import { dayNumber } from "./daylight";
import { clearSpot } from "./haunts";
import { type RideKind, TROLLEY_AHEAD, rideModel, rideSpecs } from "./rides";
import type { RouteLine } from "./minimap";
import { type Card, type Job, type Offer, type PostSpot, type QuestWorld, type Rng, compassWord, esc, far, hash, pickOf, registerJob, rng } from "./quests";
import { Celebration, type FinishRow } from "./racefinish";
import { type PathPoint, type RacePath, along, gatesOf, racePath } from "./raceroute";

const COLOUR = "#3ec7e8";
const ENTRY = 15;          // seconds the entries are open after it's taken
const COUNTDOWN = 8;       // seconds on the grid from the entries closing to GO
const RETRY = 3;           // and for a go of your own
const GRID_WAIT = 2.5;     // seconds after the entries close to wait for the host's grid
const PASS = 12;           // metres from a checkpoint's middle that counts as through it, at least
const TOP_SPEED = 30;      // metres a second: nobody's quicker over the whole route than this
const LATE = 30;           // seconds a finish's time may be quicker than the host's clock says it can be
const GATE_SEEN = 450;     // metres from the next checkpoint that its gate stands up
const GHOST_EVERY = 0.1;   // seconds between the points of a ghost run
const AFTER = 90;          // seconds after the first one's over the line that the others get
const MAX_RACE = 900;      // seconds after GO that a race nobody's finished is over
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
  o.blurb = `From here to <b>${esc(rt.to.n)}</b>, ${far(rt.d)} ${compassWord(rt.to.x - o.x, rt.to.z - o.z)} as the crow flies, on ${esc(rideSpecs[rt.ride].name)}. Through the checkpoints, any way you like between them. `
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
  start: (o, w, started, by, local) => new Race(o, w, started, by, !!local),
});

/** "1:23.4". */
function clock(s: number, tenths = false) {
  const m = Math.floor(s / 60), r = s - m * 60;
  return `${m}:${tenths ? r.toFixed(1).padStart(4, "0") : String(Math.round(r)).padStart(2, "0")}`;
}

// ---- best runs ----------------------------------------------------------------------------------

/** A run: its time, splits, where you were every e seconds (decimetres, each from the last), and
 *  how many checkpoints the splits are at (older runs' splits were at the quarters). */
interface Best { t: number; sp: number[]; g: string; e: number; cp?: number }

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
  return { t: b.t, sp: Array.isArray(b.sp) ? b.sp.map(Number).filter(Number.isFinite) : [], g: g.slice(0, 60000), e: Number(b.e) || (Array.isArray(b.g) ? 0.2 : GHOST_EVERY), cp: Number(b.cp) || 0 };
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

/** "1st", "2nd", "11th". */
const nth = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;

/** A gate across the street: two posts and a banner, in the race's colour with what it is on it, or
 *  chequered for the finish. One mesh for the posts and one for the banner. */
function gateModel(g: PathPoint, text: string): THREE.Group {
  const w = g.half + 0.8, grp = new THREE.Group(), c = document.createElement("canvas");
  c.width = 512; c.height = 64;
  const x = c.getContext("2d")!;
  if (!text) {
    for (let k = 0; k < 32; k++) for (let r = 0; r < 4; r++) { x.fillStyle = (k + r) % 2 ? "#111" : "#f4f4f2"; x.fillRect(k * 16, r * 16, 16, 16); }
  } else {
    x.fillStyle = COLOUR; x.fillRect(0, 0, 512, 64);
    x.fillStyle = "#08131a"; x.font = "800 46px 'Barlow Condensed', Impact, sans-serif";
    x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(text, 256, 35);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const parts = [-w, w].map((s) => new THREE.BoxGeometry(0.18, 4.4, 0.18).translate(s, 2.2, 0));
  const posts = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  grp.add(new THREE.Mesh(posts, new THREE.MeshLambertMaterial({ color: "#e8e4d6" })));
  const banner = new THREE.Mesh(new THREE.BoxGeometry(w * 2 + 0.3, 0.8, 0.08), new THREE.MeshBasicMaterial({ map: tex }));
  banner.position.y = 4.1;
  grp.add(banner);
  grp.rotation.y = Math.atan2(g.dx, g.dz);
  return grp;
}

// ---- the race -------------------------------------------------------------------------------------

class Race implements Job {
  done: Job["done"] = null;
  private rt: Route;
  private medal: ReturnType<typeof medals>;
  private path: RacePath | null;
  private gates: PathPoint[];               // the checkpoints along the way, then the finish
  private line: PathPoint;                  // the start line
  private lineAt = 0;                       // and how far along the route it is
  private close: number;                    // ms since 1970: the entries close
  private go: number;                       // and GO for the room
  private myGo: number;                     // and for me (a go of my own starts later)
  private start: { x: number; z: number; yaw: number };   // my place on the grid
  private fin: { x: number; z: number };
  private entries: string[] = [];           // who's entered, as heard
  private grid: string[] | null = null;     // who's racing, in grid order
  private gridFromHost = false;
  private cps = new Map<string, number>();  // how many checkpoints each racer's been through
  private next = 0;                         // my next gate
  private mySlot = -1;                      // my place on the grid
  private racing = false;                   // I'm on the grid or on the way
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
  private gate: THREE.Group | null = null; private gateKey = "";
  private arch: THREE.Group | null = null;
  private marked = "";
  private routeLine: RouteLine;
  private party: Celebration | null = null;
  private arrow = hudBit("top:calc(50% - 96px);width:48px;margin-left:-24px;color:" + COLOUR);
  private flash = hudBit("top:calc(50% + 48px);width:260px;margin-left:-130px");
  private flashT = 0;
  private firstT = 0;
  private daily: boolean;

  constructor(readonly offer: Offer, private w: QuestWorld, started: number, by: string, private local: boolean) {
    this.rt = routeOf(offer, w)!;
    this.medal = medals(this.rt.author);
    this.daily = offer.mode === DAILY;
    this.close = local ? started : started + ENTRY * 1000;
    this.go = local ? started + RETRY * 1000 : this.close + COUNTDOWN * 1000;
    this.myGo = this.go;
    this.best = bestOf(offer.seed);
    this.path = racePath(w.map, offer.x, offer.z, this.rt.to.x, this.rt.to.z);
    const p = this.path;
    if (p) {
      this.gates = [...gatesOf(p).map((s) => along(p, s)), along(p, p.len)];
      this.lineAt = Math.min(25, p.len * 0.08);
      this.line = along(p, this.lineAt);
    } else {
      // no street to be found: the old way, from the noticeboard to clear ground at the place
      const f = clearSpot(w.map, this.rt.to.x, this.rt.to.z, 25) ?? [this.rt.to.x, this.rt.to.z];
      const dx = f[0] - offer.x, dz = f[1] - offer.z, l = Math.hypot(dx, dz) || 1;
      this.gates = [{ x: f[0], z: f[1], dx: dx / l, dz: dz / l, half: 3 }];
      this.line = { x: offer.x + (dx / l) * 6, z: offer.z + (dz / l) * 6, dx: dx / l, dz: dz / l, half: 3 };
    }
    const f = this.gates[this.gates.length - 1];
    this.fin = { x: f.x, z: f.z };
    this.start = this.slot(0);
    this.routeLine = { pts: p ? p.pts : [this.line.x, this.line.z, f.x, f.z], gates: [], colour: COLOUR };
    this.lineGates();
    // your best to race, and the fastest anyone's sent you on this route
    if (this.best) this.addGhost(w.selfId, "Your best", COLOUR, this.best);
    try {
      const r = JSON.parse(localStorage.getItem(KEY + offer.seed + "r") ?? "null"), b = validBest(r);
      if (b && (!this.best || b.t < this.best.t)) this.addGhost("@rival", String(r.by ?? "A rival").slice(0, 40), "#c99cff", b);
    } catch { /* none */ }
    this.arrow.innerHTML = `<svg viewBox="0 0 48 48" width="48" height="48"><path d="M24 3 L41 38 L24 29 L7 38 Z" fill="currentColor" stroke="#000" stroke-opacity=".5" stroke-width="2"/></svg>`;
    if (this.daily) {
      const mine = myDaily(offer.seed);
      onBoard(offer.seed, w.selfId, w.name, mine.t, mine.n);
      if (!local) w.send("qe", { k: "brd", s: offer.seed, t: mine.t, n: mine.n });
    }
    this.own = local;
    if (local) {
      if (w.me().alive) { this.racing = true; w.moveTo(this.start.x, this.start.z, this.start.yaw); w.ride(this.rt.ride); }
      return;
    }
    this.enter(by);
    const left = Math.ceil((this.close - Date.now()) / 1000);
    if (left <= 0) w.toast("A race is on: you're watching this one. Backspace to have a go of your own", 3);
    else if (by === w.selfId) w.toast(`You're in. Everyone else has ${left} s to press E and enter`, 3);
    else w.toast(`A race is taking entries: E to enter (${left} s)`, 4);
  }

  /** Seconds since my GO. */
  private get now() { return (Date.now() - this.myGo) / 1000; }

  /** Place k on the grid: rows across the street behind the start line, facing up the route. */
  private slot(k: number): { x: number; z: number; yaw: number } {
    const L = this.line, cols = Math.max(2, Math.min(4, Math.floor((L.half * 2) / 1.8)));
    const gap = Math.min(1.8, (L.half * 2 - 0.6) / cols), row = Math.floor(k / cols), col = k % cols;
    const back = 2 + row * 3.5;
    const p = this.path ? along(this.path, this.lineAt - back) : { ...L, x: L.x - L.dx * back, z: L.z - L.dz * back };
    const side = (col - (cols - 1) / 2) * gap, x = p.x - p.dz * side, z = p.z + p.dx * side;
    const c = clearSpot(this.w.map, x, z, 3) ?? [x, z];
    return { x: c[0], z: c[1], yaw: Math.atan2(-p.dx, -p.dz) };
  }

  private enter(id: string) { if (!this.entries.includes(id)) this.entries.push(id); }
  private canEnter() {
    return !this.local && !this.grid && Date.now() < this.close && !this.entries.includes(this.w.selfId) && this.w.me().alive;
  }
  private here(id: string) { return this.w.players().some((p) => p.id === id); }

  hint() { return this.canEnter() ? `<b>E</b> Enter the race (${Math.ceil((this.close - Date.now()) / 1000)} s)` : ""; }

  use(): boolean {
    if (!this.canEnter()) return false;
    this.enter(this.w.selfId);
    this.w.send("qe", { k: "ent", s: this.offer.seed });
    SFX.tick();
    this.w.toast("You're in! You'll be put on the grid when the entries close", 3);
    return true;
  }

  /** The host closes the entries and says who's racing. */
  host() {
    if (this.local || this.done || this.grid || Date.now() < this.close) return;
    const ids = this.entries.filter((id) => this.here(id));
    this.w.send("qe", { k: "grid", s: this.offer.seed, ids });
    this.onGrid(ids, true);
  }

  /** Who's racing: onto the grid if I am. A grid of my own making (no word from the host) gives
   *  way to the host's. */
  private onGrid(ids: string[], fromHost: boolean) {
    if (this.local || this.gridFromHost || (this.grid && !fromHost)) return;
    this.grid = ids.slice(0, 64);
    this.gridFromHost = fromHost;
    for (const id of this.grid) this.enter(id);
    const k = this.grid.indexOf(this.w.selfId);
    if (this.own) return;
    if (k < 0) {
      if (this.racing && Date.now() < this.go) { this.racing = false; this.w.toast("The entries closed without you: you're watching this one", 3); }
      return;
    }
    if (this.racing && k === this.mySlot) return;
    this.mySlot = k;
    this.start = this.slot(k);
    if (Date.now() < this.go + 5000 && this.w.me().alive) {
      this.racing = true;
      this.w.moveTo(this.start.x, this.start.z, this.start.yaw);
      this.w.ride(this.rt.ride);
      if (this.grid.length > 1) this.w.toast(`On the grid: ${nth(k + 1)} of ${this.grid.length}`, 2.5);
    }
  }

  /** Back on the line, on my own clock. */
  restart(): boolean {
    if (!this.w.me().alive) return false;
    this.own = true; this.racing = true; this.over = false;
    this.splits = []; this.run = []; this.runT = 0; this.pipped = 4; this.next = 0;
    this.myGo = Date.now() + RETRY * 1000;
    this.party?.remove(); this.party = null;
    this.lineGates();
    this.w.moveTo(this.start.x, this.start.z, this.start.yaw);
    this.w.ride(this.rt.ride);
    SFX.tick();
    return true;
  }

  held() { return this.racing && this.now < 0 ? { x: this.start.x, z: this.start.z } : null; }

  update(dt: number) {
    const t = this.now, me = this.w.me();
    if (!this.local && !this.grid && Date.now() >= this.close + GRID_WAIT * 1000) this.onGrid([...this.entries].sort().filter((id) => this.here(id)), false);
    // the countdown: a pip a second and a long one on GO
    if (this.racing && !this.over) {
      if (t < 0) {
        const n = Math.ceil(-t);
        if (n <= 3 && n < this.pipped) { this.pipped = n; SFX.pip(false); this.show(`<span style="font-size:54px;color:#fff">${n}</span>`, 0.9); }
      } else if (this.pipped > 0) { this.pipped = 0; SFX.pip(true); this.show(`<span style="font-size:54px;color:${COLOUR}">GO!</span>`, 1); }
    }
    if (!this.roomOver && !this.local) {
      const racers = this.grid?.length ?? Infinity, since = (Date.now() - this.go) / 1000;
      if (this.results.length && (Date.now() - this.firstT) / 1000 > AFTER) this.roomOver = true;
      else if (since > 0 && this.results.length >= racers) this.roomOver = true;
      else if (since > MAX_RACE) this.roomOver = true;
    }
    // the room's race is over once I'm not in the middle of a go of my own; a go of my own, a while after it
    if (!this.done) {
      const busy = this.racing && !this.over;
      if (this.local ? this.over && Date.now() - this.overT > LINGER * 1000 : this.roomOver && !busy) this.finish();
    }
    if (this.done) { this.hideHud(); return; }
    const live = this.racing && !this.over;
    const target = live ? this.gates[this.next] : this.gates[this.gates.length - 1];
    const d = Math.hypot(target.x - me.x, target.z - me.z);
    if (live && t >= 0) {
      // the run, for your ghost
      if ((this.runT -= dt) <= 0) { this.runT += GHOST_EVERY; if (this.runT < 0) this.runT = 0; this.run.push(me.x, me.z); }
      if (d < Math.max(PASS, target.half + 6) && me.alive) this.through(t);
    }
    this.drawArrow(me, target, live);
    if (this.flashT > 0 && (this.flashT -= dt) <= 0) this.flash.hidden = true;
    this.drawGhosts(t);
    this.drawGate(me, live, t);
    this.drawArch(me);
    const key = live ? `${this.next}` : "fin";
    if (key !== this.marked) {
      this.marked = key;
      const last = this.next === this.gates.length - 1;
      const at = live ? this.gates[this.next] : this.fin;
      this.w.mark("@race", at, live && !last ? `Checkpoint ${this.next + 1} of ${this.gates.length - 1}` : `Finish: ${this.rt.to.n}`, COLOUR);
    }
  }

  /** The checkpoints still to pass, for the maps. */
  private lineGates() {
    const from = this.racing && !this.over ? this.next : 0, g: number[] = [];
    for (let k = from; k < this.gates.length - 1; k++) g.push(this.gates[k].x, this.gates[k].z);
    this.routeLine = { ...this.routeLine, gates: g };
  }
  route() { return this.done ? null : this.routeLine; }

  private show(html: string, secs: number) { this.flash.innerHTML = html; this.flash.hidden = false; this.flashT = secs; }

  /** Through my next gate, at t on my clock: a checkpoint, or the finish once they're all done. */
  private through(t: number) {
    const k = this.next, n = this.gates.length - 1;
    if (k === n) { this.crossed(t); return; }
    this.next++;
    this.lineGates();
    this.splits.push(t);
    const was = this.best && this.best.cp === n ? this.best.sp[k] : undefined;
    const diff = was !== undefined ? t - was : null;
    const col = diff === null ? "#fff" : diff <= 0 ? "#58e06a" : "#ff5a4e";
    this.show(`<div style="font-size:16px;color:#ddd">Checkpoint ${k + 1} of ${n}</div><span style="color:#fff">${clock(t, true)}</span>`
      + (diff !== null ? ` <span style="color:${col}">${diff <= 0 ? "-" : "+"}${Math.abs(diff).toFixed(1)}</span>` : ""), 2.5);
    SFX.checkpoint();
    if (!this.own) {
      const msg = { k: "cp", s: this.offer.seed, i: k, t: Math.round(t * 10) / 10 };
      this.w.send("qe", msg);
      this.event(msg, this.w.selfId);
    }
  }

  /** Over the line, at t on my clock. */
  private crossed(t: number) {
    this.over = true; this.overT = Date.now();
    this.lineGates();
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
    } else this.w.send("qe", { k: "pb", s, t, n });
    const was = this.best, beat = !was || t < was.t;
    // a best: keep it, and send it round as a ghost for everyone else
    if (beat) {
      const b: Best = { t, sp: this.splits.slice(), g: pack(this.run), e: GHOST_EVERY, cp: this.gates.length - 1 };
      this.best = b;
      keepBest(s, b);
      this.addGhost(this.w.selfId, "Your best", COLOUR, b);
      this.w.send("qe", { k: "gh", s, b });
    }
    this.flash.hidden = true;
    this.celebrate(t, beat, was);
  }

  /** The banner, the confetti and the fanfare. */
  private celebrate(t: number, beat: boolean, was: Best | null) {
    this.party?.remove();
    const mine = this.results.findIndex((r) => r.id === this.w.selfId);
    const place = this.own ? 0 : mine + 1, of = this.own ? 0 : this.grid?.length ?? 1;
    const m = this.medalOf(t);
    this.party = new Celebration({
      place: place > 0 ? place : 0, of, time: clock(t, true),
      medal: `${m[0].toUpperCase()}${m.slice(1)}${!beat && was ? ` · your best ${clock(was.t, true)}` : ""}`,
      best: beat ? (was ? `New best! ${(was.t - t).toFixed(1)} s quicker` : "Your first time here: a best to beat") : "",
      rows: this.rows(),
    });
    SFX.fanfare(place > 0 ? place : 0);
  }

  private rows(): FinishRow[] {
    if (this.own) return [];
    return this.results.map((r) => ({ name: r.id === this.w.selfId ? "You" : this.w.nameOf(r.id), time: clock(r.t, true), colour: this.w.colourOf(r.id), me: r.id === this.w.selfId }));
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

  /** The arrow over the crosshair, pointing at the next gate. */
  private drawArrow(me: { x: number; z: number; yaw: number }, at: { x: number; z: number }, live: boolean) {
    const on = live && Math.hypot(at.x - me.x, at.z - me.z) > PASS;
    if (this.arrow.hidden === on) this.arrow.hidden = !on;
    if (!on) return;
    const want = Math.atan2(-(at.x - me.x), -(at.z - me.z));
    const rel = Math.atan2(Math.sin(want - me.yaw), Math.cos(want - me.yaw));
    this.arrow.style.transform = `rotate(${(-rel).toFixed(3)}rad)`;
  }

  private hideHud() {
    this.arrow.hidden = true; this.flash.hidden = true;
    for (const g of this.ghosts.values()) if (g.view) g.view.visible = false;
    this.dropGate(); this.dropArch();
  }

  /** The one gate worth standing up: the start line on the grid, then my next checkpoint as I near it. */
  private drawGate(me: { x: number; z: number }, live: boolean, t: number) {
    const last = this.gates.length - 1;
    let key = "", at: PathPoint | null = null, text = "";
    if (live && t < 0) { key = "start"; at = this.line; text = "START"; }
    else if (live && this.next < last) { key = `${this.next}`; at = this.gates[this.next]; text = `CHECKPOINT ${this.next + 1}/${last}`; }
    if (at && Math.hypot(at.x - me.x, at.z - me.z) > GATE_SEEN) key = "";
    if (key !== this.gateKey) {
      this.dropGate();
      this.gateKey = key;
      if (key && at) { this.gate = gateModel(at, text); this.gate.position.set(at.x, 0, at.z); this.w.scene.add(this.gate); }
    }
    if (this.gate && at) this.gate.position.y = this.w.map.ground(at.x, at.z);
  }

  private dropGate() {
    if (!this.gate) return;
    disposeGroup(this.gate, this.w.scene);
    this.gate = null; this.gateKey = "";
  }

  /** The chequered finish, when you're near it. */
  private drawArch(me: { x: number; z: number }) {
    const f = this.gates[this.gates.length - 1];
    const near = Math.hypot(f.x - me.x, f.z - me.z) < 300;
    if (near && !this.arch) {
      this.arch = gateModel(f, "");
      this.arch.position.set(f.x, this.w.map.ground(f.x, f.z), f.z);
      this.w.scene.add(this.arch);
    } else if (!near && this.arch) this.dropArch();
    if (this.arch) this.arch.position.y = this.w.map.ground(f.x, f.z);
  }

  private dropArch() {
    if (!this.arch) return;
    disposeGroup(this.arch, this.w.scene);
    this.arch = null;
  }

  /** Does a finish count: someone who's racing, through every checkpoint, and not impossibly quick? */
  private finOk(from: string, t: number) {
    if (!Number.isFinite(t) || t < (this.path?.len ?? this.rt.d) / TOP_SPEED) return false;
    if ((this.cps.get(from) ?? 0) < this.gates.length - 1) return false;
    return (this.grid ?? this.entries).includes(from);
  }

  private addResult(id: string, t: number) {
    if (!this.results.length) this.firstT = Date.now();
    this.results.push({ id, t });
    this.results.sort((a, b) => a.t - b.t);
    const place = this.results.findIndex((r) => r.id === id) + 1;
    const who = id === this.w.selfId ? "You" : this.w.nameOf(id);
    if (id !== this.w.selfId) SFX.jobStep();
    this.w.feed(`<b style="color:${this.w.colourOf(id)}">${esc(who)}</b> crossed the line ${nth(place)} in ${clock(t, true)} (${this.medalOf(t)})`);
    this.party?.rows(this.rows());
  }

  event(d: any, from: string) {
    const s = this.offer.seed, self = from === this.w.selfId;
    if (this.daily && (d.k === "fin" || d.k === "pb" || d.k === "brd") && !self) {
      const t = Number(d.t), n = Number(d.n);
      if (Number.isFinite(t) && Number.isFinite(n)) onBoard(s, from, this.w.nameOf(from), Math.max(0, t), Math.max(0, Math.min(9999, n)));
      // someone new to the board: say where you stand, so they see you on it too
      if (d.k === "brd") { const mine = myDaily(s); this.w.send("qe", { k: "bd2", s, t: mine.t, n: mine.n }, from); }
    }
    if (this.daily && d.k === "bd2" && !self) {
      const t = Number(d.t), n = Number(d.n);
      if (Number.isFinite(t) && Number.isFinite(n)) onBoard(s, from, this.w.nameOf(from), Math.max(0, t), Math.max(0, Math.min(9999, n)));
    }
    if (d.k === "gh" && !self) {
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
    if (this.local) return;   // the rest is the room's race
    if (d.k === "ent") {
      if (!this.grid && Date.now() < this.close + GRID_WAIT * 1000) this.enter(from);
    } else if (d.k === "grid" && Array.isArray(d.ids)) {
      this.onGrid(d.ids.map(String), true);
    } else if (d.k === "cp") {
      const i = Number(d.i), had = this.cps.get(from) ?? 0;
      if (i === had && i < this.gates.length - 1) this.cps.set(from, i + 1);
    } else if (d.k === "fin") {
      const t = Number(d.t);
      if (this.results.some((r) => r.id === from)) return;
      // the host also holds the time up against its own clock since GO
      const ok = this.finOk(from, t) && (!this.w.isHost || t >= (Date.now() - this.go) / 1000 - LATE);
      if (!ok) {
        if (this.w.isHost) this.w.send("qe", { k: "dq", s, id: from });
        if (self) this.w.toast("That finish doesn't count: a checkpoint was missed", 3);
        return;
      }
      this.addResult(from, t);
      if (this.w.isHost) this.w.send("qe", { k: "res", s, r: this.results });
    } else if (d.k === "dq" && typeof d.id === "string") {
      const k = this.results.findIndex((r) => r.id === d.id);
      if (k >= 0) { this.results.splice(k, 1); this.party?.rows(this.rows()); }
      if (d.id === this.w.selfId) this.w.toast("The host didn't count your finish", 3);
    } else if (d.k === "res" && Array.isArray(d.r)) {
      const r = d.r.slice(0, 64).map((o: any) => ({ id: String(o?.id), t: Number(o?.t) })).filter((o: { t: number }) => Number.isFinite(o.t));
      // only ever adds: a "res" sent before someone's finish reached the host can arrive after it
      for (const o of r) if (!this.results.some((x) => x.id === o.id)) this.addResult(o.id, o.t);
    }
  }

  private medalOf(t: number) {
    const m = this.medal;
    return t < this.rt.author ? "beat the author!" : t < m.gold ? "gold" : t < m.silver ? "silver" : t < m.bronze ? "bronze" : "no medal";
  }

  private finish() {
    if (this.done) return;
    if (!this.results.length) {
      this.done = this.local ? { won: false, text: "Time trial over" } : { won: false, text: this.grid && !this.grid.length ? "Nobody entered the race" : "Nobody made it over the line" };
      return;
    }
    const top = this.results.slice(0, 3).map((r, k) => `${k + 1}. ${r.id === this.w.selfId ? "You" : this.w.nameOf(r.id)} ${clock(r.t, true)}`).join(" · ");
    // first over the line in the room: a traffic cone for your head
    this.done = { won: true, text: top, x: this.fin.x, z: this.fin.z, wear: !this.local && this.results[0].id === this.w.selfId ? ["cone"] : undefined };
  }

  progress() { return { r: this.results, e: this.entries, g: this.gridFromHost ? this.grid : null, c: [...this.cps] }; }
  restore(p: any) {
    if (!p || typeof p !== "object") return;
    if (Array.isArray(p.r)) for (const r of p.r) {
      const t = Number(r?.t);
      if (Number.isFinite(t) && !this.results.some((o) => o.id === String(r.id))) this.results.push({ id: String(r.id), t });
    }
    this.results.sort((a, b) => a.t - b.t);
    if (this.results.length && !this.firstT) this.firstT = Date.now();
    if (Array.isArray(p.e)) for (const id of p.e.slice(0, 64)) this.enter(String(id));
    if (Array.isArray(p.c)) for (const c of p.c.slice(0, 64)) if (Array.isArray(c)) this.cps.set(String(c[0]), Math.max(this.cps.get(String(c[0])) ?? 0, Number(c[1]) || 0));
    if (Array.isArray(p.g)) this.onGrid(p.g.map(String), true);
  }

  /** Where I am in the room's race: finished ones by their times, then by checkpoints, then by
   *  who's nearest their next one. */
  private place(): number {
    const ids = this.grid ?? [], pos = new Map(this.w.players().map((p) => [p.id, p]));
    const score = (id: string) => {
      const r = this.results.findIndex((o) => o.id === id);
      if (r >= 0) return 1e9 - r;
      const n = this.cps.get(id) ?? 0, g = this.gates[Math.min(n, this.gates.length - 1)], p = pos.get(id);
      return n * 1e5 - (p ? Math.hypot(g.x - p.x, g.z - p.z) : 9e4);
    };
    const mine = score(this.w.selfId);
    return 1 + ids.filter((id) => id !== this.w.selfId && score(id) > mine).length;
  }

  card(): Card {
    const t = this.now, me = this.w.me(), m = this.medal, nowMs = Date.now();
    const medalLine = `Gold ${clock(m.gold)} · silver ${clock(m.silver)} · bronze ${clock(m.bronze)}`;
    const legend = this.daily ? boardHtml() : "";
    const names = (ids: string[]) => ids.slice(0, 6).map((id) => esc(id === this.w.selfId ? "You" : this.w.nameOf(id))).join(", ") + (ids.length > 6 ? ` and ${ids.length - 6} more` : "");
    if (!this.local && !this.grid) {
      const left = Math.max(0, Math.ceil((this.close - nowMs) / 1000)), inIt = this.entries.includes(this.w.selfId);
      return {
        line: left <= 0 ? "Entries closed: lining up" : inIt ? `<b class="clue">You're in</b> · the grid in ${left} s` : `<b class="clue">Entries open</b>: <b>E</b> to enter · ${left} s`,
        sub: `${this.entries.length} in: ${names(this.entries)}<br>${esc(rideSpecs[this.rt.ride].name)} · ${medalLine}`,
        bar: 1 - Math.min(1, Math.max(0, (this.close - nowMs) / (ENTRY * 1000))),
      };
    }
    if (this.racing && !this.over && t < 0) {
      return { line: `<b class="clue">${Math.ceil(-t) <= 3 ? Math.ceil(-t) : "Get ready"}</b>`, sub: `${esc(rideSpecs[this.rt.ride].name)} · ${medalLine}${this.best ? ` · best ${clock(this.best.t, true)}` : ""}${this.grid && !this.own ? `<br>Racing: ${names(this.grid)}` : ""}` };
    }
    const roomMine = this.results.find((r) => r.id === this.w.selfId);
    const last = this.gates.length - 1;
    if (!this.racing || this.over) {
      const mine = this.over ? this.best : null;
      const d = Math.hypot(this.fin.x - me.x, this.fin.z - me.z);
      const board = !this.own && this.results.length ? `<br>${this.results.slice(0, 5).map((r, k) => `${k + 1}. ${esc(r.id === this.w.selfId ? "You" : this.w.nameOf(r.id))} ${clock(r.t, true)}`).join(" · ")}` : "";
      return {
        line: roomMine ? `Over the line ${nth(this.results.indexOf(roomMine) + 1)} in ${clock(roomMine.t, true)}: ${this.medalOf(roomMine.t)}` : mine ? `Your best: ${clock(mine.t, true)} (${this.medalOf(mine.t)})` : `Watching: ${far(d)} to <b>${esc(this.rt.to.n)}</b>`,
        sub: `<b>Backspace</b> to go again${board}${legend}`,
      };
    }
    const g = this.gates[this.next], d = Math.hypot(g.x - me.x, g.z - me.z);
    const sp = this.splits.map((s, k) => {
      const was = this.best?.cp === last ? this.best.sp[k] : undefined;
      return was === undefined ? clock(s, true) : `<span style="color:${s <= was ? "#58e06a" : "#ff5a4e"}">${clock(s, true)}</span>`;
    }).join(" · ");
    const where = this.next < last ? `Checkpoint ${this.next + 1}/${last}` : `<b>${esc(this.rt.to.n)}</b>`;
    const pos = !this.own && this.grid && this.grid.length > 1 ? ` · <b>${nth(this.place())}</b> of ${this.grid.length}` : "";
    return {
      line: `${far(d)} to ${where}, ${compassWord(g.x - me.x, g.z - me.z)} · ${clock(Math.max(0, t), true)}${this.own ? " (your own go)" : pos}`,
      sub: `${sp ? `Splits ${sp}<br>` : ""}${medalLine}${!this.own && this.results.length ? ` · leader ${clock(this.results[0].t, true)}` : ""}`,
      bar: this.next / Math.max(1, last + 1),
    };
  }

  end() {
    this.w.mark("@race", null);
    for (const g of this.ghosts.values()) if (g.view) { this.w.scene.remove(g.view); g.view.geometry.dispose(); (g.view.material as THREE.Material).dispose(); }
    this.ghosts.clear();
    this.dropGate();
    this.dropArch();
    this.arrow.remove();
    this.flash.remove();
  }
}

/** Take a gate down and free what it was drawn with. */
function disposeGroup(g: THREE.Group, scene: THREE.Scene) {
  scene.remove(g);
  g.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.geometry.dispose();
    const m = o.material as THREE.MeshBasicMaterial;
    m.map?.dispose();
    m.dispose();
  });
}
