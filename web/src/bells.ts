// Bell Ringing, a team challenge (challenges.ts): English change ringing up a church tower. The
// challenge stands at the biggest church in reach of where everyone starts, found from the map's
// own buildings, so every map with a church has one. Outside it a sandwich board says to try bell
// ringing today, with the vicar stood by it beckoning you over. Climb the tower (use, by the vicar) and
// you're in the ringing chamber, a room of our own built high over the street, each player holding
// one bell's rope. The touch starts in rounds (1-2-3-4...), then the method moves the bells about,
// pairs swapping places every row: Plain Hunt on an easy day, Plain Bob or Grandsire on a hard one,
// and the more of you there are, the more bells and the longer the touch. Rows come at a steady
// beat, handstroke and backstroke, with the open gap before each handstroke, and each player pulls
// (jump, or Pull on a touch screen: the bells' table in controls.ts) at their own bell's moment in
// every row. A bell sounds a moment after its rope is pulled, as a real one does, so you have to
// pull ahead of the beat: the blue line on the right shows where your bell comes in each row, and
// the sally gauge under it when to pull. Pull early or late and the bell clashes with its
// neighbour; late enough and the rope hauls you up off the floor. Two bad rows in a row and the
// whole lot collapses into a jangle, and too many bad rows over the touch and the conductor calls
// Stand: lost either way. Ring it through clean enough and the strange object turns up at the
// church door. With fewer than three players, steady old ringers who never miss make up three
// bells; anyone who climbs up late stands by the wall and watches.
//
// Who decides what: the host keeps the time and runs the band. Each screen syncs its clock to the
// host's ("tq"/"ta" inside "qe"), so the rows are laid out on one shared clock from the moment the
// host says go. A pull is timed on the puller's own synced clock, and what goes round is when that
// pull makes the bell sound; since that's a little after the pull, it reaches everyone before the
// bell is due, and every screen plays it at the same shared moment, however far away the puller
// is. The host judges each row from those times (the puller decided their own pull, as a shooter
// decides their own hits) and says which rows were bad, and when it's won or collapsed. The
// steady ringers strike on the beat on every screen alike, and take over a rope if its ringer
// leaves the game.
//
// For testing, ?ringer=good rings your own bell for you on the beat, and ?ringer=bad rings it
// all over the place.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import * as SFX from "./audio";
import { registerChallenge, type ChallengeSpot } from "./challenges";
import { dayNumber } from "./daylight";
import { ctl } from "./controls";
import type { GameMap } from "./map";
import { openGround } from "./oddments";
import { speak } from "./posh";
import { Avatar } from "./avatar";
import { esc, hash, type Card, type Job, type Waiting } from "./quests";

const COLOUR = "#d9a441";
const LEAD = 700;            // ms from pulling the rope to the bell sounding
const HALF = 5;              // the ringing chamber's half-width, metres
const ROOM_H = 3.7;
const CLIMB = 6;             // how close to the vicar's board (or under the chamber) to climb the tower
const MAX_BELLS = 8;
const PLACE = "12345678";
const STAGE = ["", "", "", "Singles", "Minimus", "Doubles", "Minor", "Triples", "Major"];
const AUTO = new URLSearchParams(location.search).get("ringer");
const PATHS = new Set(["footway", "steps", "cycleway", "path", "bridleway", "track"]);

// ---- methods ------------------------------------------------------------------------------------

type Kind = "hunt" | "bob" | "grandsire";
interface Plan { name: string; kind: Kind; courses: number }

/** One lead of a method in place notation: "x" swaps every pair, digits are the places made. */
function lead(n: number, kind: Kind): string[] {
  const N = PLACE[n - 1], odd = n % 2 === 1;
  const hunt = odd ? [N, "1"] : ["x", "1" + N];
  if (kind === "hunt") return hunt;
  if (kind === "grandsire") { const out = ["3", "1"]; for (let i = 0; i < n - 1; i++) out.push(N, "1"); return out; }
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(...hunt);
  out[out.length - 1] = odd ? "12" + N : "12";
  return out;
}

function change(row: number[], c: string): number[] {
  const r = [...row], stay = new Set(c === "x" ? [] : [...c].map((ch) => PLACE.indexOf(ch)));
  for (let i = 0; i < r.length - 1;) {
    if (stay.has(i)) { i++; continue; }
    [r[i], r[i + 1]] = [r[i + 1], r[i]];
    i += 2;
  }
  return r;
}

/** Which method on which day: plain hunting when it's easy, and the bigger the band the longer the course. */
function plan(n: number, level: number): Plan {
  const huntName = n === 3 ? "Plain Hunt on Three" : `Plain Hunt ${STAGE[n]}`;
  if (level === 0) return { name: huntName, kind: "hunt", courses: n <= 4 ? 3 : 2 };
  if (n === 3) return { name: huntName, kind: "hunt", courses: level === 1 ? 4 : 6 };
  if (level === 1) {
    if (n === 8) return { name: huntName, kind: "hunt", courses: 3 };
    if (n % 2) return { name: `Grandsire ${STAGE[n]}`, kind: "grandsire", courses: 1 };
    return { name: `Plain Bob ${STAGE[n]}`, kind: "bob", courses: 1 };
  }
  return { name: `Plain Bob ${STAGE[n]}`, kind: "bob", courses: n === 4 ? 2 : 1 };
}

/** Every row of the touch: two whole pulls of rounds, the method until it comes round, and a whole pull more. */
function rowsOf(n: number, p: Plan): { rows: number[][]; changesFrom: number; changesTo: number } {
  const rounds = Array.from({ length: n }, (_, i) => i);
  const rows = [rounds, rounds, rounds, rounds];
  const pn = lead(n, p.kind);
  let r = rounds, done = 0;
  for (let guard = 0; done < p.courses && guard < 60; guard++) {
    for (const c of pn) { r = change(r, c); rows.push(r); }
    if (r.every((b, i) => b === i)) done++;
  }
  const changesTo = rows.length - 1;
  rows.push(rounds, rounds);
  return { rows, changesFrom: 4, changesTo };
}

const ordinal = (k: number) => k === 1 ? "1st" : k === 2 ? "2nd" : k === 3 ? "3rd" : `${k}th`;
const bellName = (b: number, n: number) => b === 0 ? "the treble" : b === n - 1 ? "the tenor" : `the ${ordinal(b + 1)}`;

// ---- where it goes ------------------------------------------------------------------------------

function ringArea(r: number[][]) {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
  return Math.abs(a) / 2;
}
function inRing(r: number[][], x: number, y: number) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    if ((r[i][1] > y) !== (r[j][1] > y) && x < ((r[j][0] - r[i][0]) * (y - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) inside = !inside;
  }
  return inside;
}

/** What the church is called: a churchyard or a church of that name round it, or the street it's on. */
function churchName(map: GameMap, cx: number, cy: number, own: string, road: string): string {
  if (own && !/^\d/.test(own)) return own;
  const not = /school|nursery|allotment|primary|academy|college|park|garden|green|terrace|place|road|street|square|cemetery|lane|hall|centre|court/i;
  const named = [...(map.d.pl ?? []), ...(map.wide?.d.pl ?? [])].filter((p) => p.n && p.r.length >= 3 && /church|abbey|cathedral|minster|chapel|\bst\.? |saint/i.test(p.n) && !not.test(p.n));
  let best = "", bd = 160;
  for (const p of named) {
    const mx = p.r.reduce((s, q) => s + q[0], 0) / p.r.length, my = p.r.reduce((s, q) => s + q[1], 0) / p.r.length;
    const d = inRing(p.r, cx, cy) ? 0 : Math.hypot(mx - cx, my - cy);
    if (d < bd || (d === bd && p.n < best)) { bd = d; best = p.n; }
  }
  if (/abbey/i.test(best)) return "the Abbey";
  if (best) return best.replace(/\s*churchyard$/i, " Church");
  return road ? `the church on ${road}` : "the parish church";
}

/** The biggest church in reach of where everyone starts, with its noticeboard on the street outside
 *  and the ringing chamber over the middle of that street. Only the first area and the wide map, so
 *  every player finds the same one. */
function place(map: GameMap): ChallengeSpot[] | null {
  const D = map.d, W = map.wide;
  const sp = D.spawn?.length ? D.spawn : [[0, 0]];
  const hx = sp.reduce((s, p) => s + p[0], 0) / sp.length, hy = sp.reduce((s, p) => s + p[1], 0) / sp.length;
  const home = openGround(map);
  const churches = [...(D.bl ?? []), ...(W?.bl ?? [])].filter((b) => b.c === "church" && b.r[0]?.length >= 3).map((b) => {
    const r = b.r[0], cx = r.reduce((s, q) => s + q[0], 0) / r.length, cy = r.reduce((s, q) => s + q[1], 0) / r.length;
    return { b, r, cx, cy, a: ringArea(r) };
  }).filter((c) => c.a >= 150 && Math.hypot(c.cx - hx, c.cy - hy) < 3500 && map.fieldEdge(c.cx, -c.cy) > 60
    && (!home || Math.hypot(home.x - c.cx, home.y - c.cy) > 80))
    .sort((a, b) => b.a - a.a || a.cx - b.cx || a.cy - b.cy);
  const roads = [...D.rd, ...(W?.rd ?? [])].filter((r) => !PATHS.has(r.c));
  for (const c of churches) {
    let best: { x: number; y: number; d: number; w: number; n: string } | null = null;
    for (const rd of roads) {
      for (let i = 1; i < rd.p.length; i++) {
        const a = rd.p[i - 1], b = rd.p[i];
        if (Math.abs(a[0] - c.cx) > 200 || Math.abs(a[1] - c.cy) > 200) continue;
        const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy;
        const t = l ? Math.max(0, Math.min(1, ((c.cx - a[0]) * dx + (c.cy - a[1]) * dy) / l)) : 0;
        const x = a[0] + dx * t, y = a[1] + dy * t, d = Math.hypot(x - c.cx, y - c.cy);
        if (d < 150 && !inRing(c.r, x, y) && (!best || d < best.d)) best = { x, y, d, w: rd.w ?? 6, n: rd.n };
      }
    }
    if (!best || map.fieldEdge(best.x, -best.y) < 60) continue;
    const ux = (c.cx - best.x) / best.d, uy = (c.cy - best.y) / best.d;
    let bx = best.x + ux * (best.w / 2 + 2.2), by = best.y + uy * (best.w / 2 + 2.2);
    if (inRing(c.r, bx, by)) { bx = best.x; by = best.y; }
    const name = churchName(map, c.cx, c.cy, c.b.n, best.n);
    return [{ x: bx, z: -by, name }, { x: best.x, z: -best.y, name: `the ringing chamber of ${name}` }];
  }
  return null;
}

// ---- the bells' sound ---------------------------------------------------------------------------

const buffers = new Map<string, AudioBuffer>();
/** A tower bell struck once, made sample by sample: the hum an octave under the strike note, the
 *  prime, the minor-third tierce that makes an English bell sound like one, the quint and the
 *  nominal, and a little of the upper partials, each dying away at its own rate, with a clapper's
 *  knock at the start. The hum and the nominal come in close pairs, so the bell warbles as it fades. */
function bellBuffer(c: AudioContext, f: number): AudioBuffer {
  const key = `${c.sampleRate}:${f.toFixed(2)}`;
  const had = buffers.get(key);
  if (had) return had;
  const sr = c.sampleRate, D = 2.4 * Math.pow(311 / f, 0.7), len = Math.floor(sr * Math.min(5.5, D * 1.8));
  const buf = c.createBuffer(1, len, sr), out = buf.getChannelData(0);
  const parts: [number, number, number][] = [
    [0.5, 0.3, 1.0], [0.5025, 0.16, 0.9], [1, 0.42, 0.62], [1.183, 0.32, 0.46], [1.506, 0.12, 0.3],
    [2, 0.5, 0.4], [2.0035, 0.25, 0.36], [2.66, 0.11, 0.2], [3.01, 0.15, 0.16], [4.07, 0.09, 0.09], [5.4, 0.05, 0.05],
  ];
  for (const [m, amp, life] of parts) {
    const w = (2 * Math.PI * f * m) / sr, cw = Math.cos(w), sw = Math.sin(w), k = Math.exp(-1 / (sr * D * life));
    let re = 1, im = 0, a = amp;
    for (let i = 0; i < len; i++) {
      out[i] += im * a;
      const nr = re * cw - im * sw; im = re * sw + im * cw; re = nr;
      a *= k;
    }
  }
  const knock = Math.floor(sr * 0.03);
  let seed = Math.floor(f * 1000), lp = 0;
  for (let i = 0; i < knock; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    lp += ((seed / 0x7fffffff) * 2 - 1 - lp) * 0.5;
    out[i] += lp * 0.5 * Math.exp(-i / (sr * 0.006)) + Math.sin(i * 2 * Math.PI * f * 6.9 / sr) * 0.2 * Math.exp(-i / (sr * 0.012));
  }
  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(out[i]));
  for (let i = 0; i < len; i++) {
    out[i] *= 0.9 / peak;
    if (i < 96) out[i] *= i / 96;
  }
  buffers.set(key, buf);
  return buf;
}

/** The ring tuned to a major scale, tenor lowest on the key note and the treble at the top. */
function tuning(n: number): number[] {
  const MAJOR = [0, 2, 4, 5, 7, 9, 11, 12], tenor = 311.1;
  return Array.from({ length: n }, (_, b) => tenor * Math.pow(2, MAJOR[n - 1 - b] / 12));
}

/** A rope's swish and creak, or a heavy thump when one hauls someone off their feet. */
function ropeSound(c: AudioContext, at: number, vol: number, heavy: boolean) {
  const o = SFX.sfxOut(vol, 0, 0, 0.1);
  if (!o) return;
  const len = Math.floor(c.sampleRate * (heavy ? 0.35 : 0.22)), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
  let lp = 0;
  for (let i = 0; i < len; i++) {
    lp += (Math.random() * 2 - 1 - lp) * (heavy ? 0.08 : 0.25);
    const env = Math.sin((Math.PI * i) / len);
    d[i] = lp * env * (heavy ? 2.5 : 1.2) + (heavy ? Math.sin((i * 2 * Math.PI * 70) / c.sampleRate) * Math.exp(-i / (c.sampleRate * 0.08)) : 0);
  }
  const s = c.createBufferSource();
  s.buffer = buf;
  s.connect(o);
  s.start(at);
}

// ---- outside the church -------------------------------------------------------------------------

/** The sandwich board on the pavement and the vicar stood by it, beckoning, facing the street. */
class Welcome implements Waiting {
  private board = new THREE.Group();
  private vicar = new Avatar("The Vicar", "#1a1a1e", "vicar", "#9a9894");
  private geos: THREE.BufferGeometry[] = [];
  private mats: THREE.Material[] = [];
  private tex: THREE.Texture;
  private t = 0;
  private vx: number; private vz: number;

  constructor(private scene: THREE.Scene, map: GameMap, private at: ChallengeSpot, street: ChallengeSpot) {
    let ux = street.x - at.x, uz = street.z - at.z;
    const l = Math.hypot(ux, uz);
    if (l < 0.5) { ux = 1; uz = 0; } else { ux /= l; uz /= l; }
    this.tex = canvasTex(256, 384, (x) => {
      x.fillStyle = "#f4ecd4"; x.fillRect(0, 0, 256, 384);
      x.strokeStyle = "#8a1c22"; x.lineWidth = 8; x.strokeRect(10, 10, 236, 364);
      x.textAlign = "center";
      x.font = "700 30px Georgia, serif"; x.fillStyle = "#1b1b1d";
      x.fillText("TRY", 128, 58);
      x.font = "800 48px Georgia, serif"; x.fillStyle = "#8a1c22";
      x.fillText("BELL", 128, 112); x.fillText("RINGING", 128, 162);
      x.font = "700 30px Georgia, serif"; x.fillStyle = "#1b1b1d";
      x.fillText("TODAY", 128, 204);
      // a bell, in chalk
      x.fillStyle = "#e3b13c";
      x.beginPath(); x.moveTo(88, 320); x.quadraticCurveTo(96, 250, 128, 248); x.quadraticCurveTo(160, 250, 168, 320); x.closePath(); x.fill();
      x.beginPath(); x.arc(128, 326, 9, 0, Math.PI * 2); x.fill();
      x.font = "italic 17px Georgia, serif"; x.fillStyle = "#333";
      x.fillText("All welcome. Up the tower", 128, 362);
    });
    const face = new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false }), wood = new THREE.MeshLambertMaterial({ color: "#4a3420" });
    this.mats.push(face, wood);
    const panel = new THREE.BoxGeometry(0.8, 1.15, 0.03), sheet = new THREE.PlaneGeometry(0.72, 1.04);
    this.geos.push(panel, sheet);
    for (const side of [1, -1]) {
      const leaf = new THREE.Group();
      leaf.position.set(0, 1.15, 0);
      leaf.rotation.x = -side * 0.24;
      const p = new THREE.Mesh(panel, wood);
      p.position.set(0, -0.57, side * 0.02);
      p.castShadow = true;
      const f = new THREE.Mesh(sheet, face);
      f.position.set(0, -0.57, side * 0.037);
      if (side < 0) f.rotation.y = Math.PI;
      leaf.add(p, f);
      this.board.add(leaf);
    }
    // one face to the street and one to the church door, the vicar beside it looking out at the street
    this.board.position.set(at.x, map.ground(at.x, at.z), at.z);
    this.board.rotation.y = Math.atan2(ux, uz);
    scene.add(this.board);
    this.vx = at.x - uz * 1.1 - ux * 0.4; this.vz = at.z + ux * 1.1 - uz * 0.4;
    const v = this.vicar;
    v.armed = false; v.tagged = false;
    const yaw = Math.atan2(-ux, -uz);
    const black = new THREE.MeshLambertMaterial({ color: "#121214" }), white = new THREE.MeshLambertMaterial({ color: "#f6f6f2" });
    const cassock = new THREE.BoxGeometry(0.44, 0.84, 0.3), collar = new THREE.CylinderGeometry(0.068, 0.068, 0.045, 12);
    this.mats.push(black, white); this.geos.push(cassock, collar);
    const skirt = new THREE.Mesh(cassock, black);
    skirt.position.y = 0.5; skirt.rotation.y = yaw; skirt.castShadow = true;
    const band = new THREE.Mesh(collar, white);
    band.position.y = 1.49;
    const tab = new THREE.Mesh(collar, white);
    tab.scale.set(0.45, 1.1, 0.25);
    tab.position.set(-Math.sin(yaw) * 0.07, 1.47, -Math.cos(yaw) * 0.07);
    v.root.add(skirt, band, tab);
    v.holdAt(this.vx, map.ground(this.vx, this.vz), this.vz, yaw, 0, 0);
    scene.add(v.root);
  }

  dist(x: number, z: number) {
    return Math.max(0, Math.min(Math.hypot(x - this.at.x, z - this.at.z), Math.hypot(x - this.vx, z - this.vz)) - 0.5);
  }

  update(dt: number) {
    this.t += dt;
    // a wave over every few seconds: come on, have a go
    this.vicar.wave = this.t % 7 < 2 ? 2 : 0;
    this.vicar.update(performance.now(), dt);
  }

  dispose() {
    this.scene.remove(this.board, this.vicar.root);
    this.vicar.root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    this.tex.dispose();
  }
}

// ---- the ringing chamber ------------------------------------------------------------------------

function canvasTex(w: number, h: number, draw: (x: CanvasRenderingContext2D) => void, mirror = false) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (mirror) { t.wrapS = THREE.RepeatWrapping; t.repeat.x = -1; }
  return t;
}

function speckle(x: CanvasRenderingContext2D, w: number, h: number, n: number, alpha: number) {
  for (let i = 0; i < n; i++) {
    x.fillStyle = `rgba(${Math.random() < 0.5 ? "0,0,0" : "255,255,255"},${alpha * Math.random()})`;
    x.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
}

/** Limewashed walls with a peal board, a lancet window and the tower rules; seen from inside. */
function wallTexture(church: string) {
  return canvasTex(1024, 384, (x) => {
    x.fillStyle = "#e8dfc8"; x.fillRect(0, 0, 1024, 384);
    speckle(x, 1024, 384, 3000, 0.08);
    x.fillStyle = "#4a2e1a"; x.fillRect(0, 344, 1024, 40);
    x.fillStyle = "#2a1a10"; x.fillRect(0, 340, 1024, 4);
    // the peal board
    x.fillStyle = "#3b2414"; x.fillRect(84, 70, 330, 200);
    x.fillStyle = "#101014"; x.fillRect(94, 80, 310, 180);
    x.fillStyle = "#d6b25a"; x.textAlign = "center";
    x.font = "700 17px Georgia, serif"; x.fillText(church.toUpperCase().slice(0, 30), 249, 108);
    x.font = "italic 14px Georgia, serif";
    ["On Saturday the 4th of June", "a Peal of 5040 Changes", "PLAIN BOB TRIPLES", "was rung in 2 hours 58 minutes", "Treble W. Gay · Tenor H. Ellis", "Conducted by J. Parfitt"]
      .forEach((l, k) => x.fillText(l, 249, 138 + k * 21));
    // the window, a pointed lancet with daylight in it
    x.fillStyle = "#6c6252"; x.beginPath(); x.moveTo(600, 290); x.lineTo(600, 130); x.quadraticCurveTo(640, 50, 680, 130); x.lineTo(680, 290); x.fill();
    const g = x.createLinearGradient(0, 70, 0, 290); g.addColorStop(0, "#f4f8ff"); g.addColorStop(1, "#a9c2d8");
    x.fillStyle = g; x.beginPath(); x.moveTo(608, 284); x.lineTo(608, 132); x.quadraticCurveTo(640, 64, 672, 132); x.lineTo(672, 284); x.fill();
    x.strokeStyle = "#3a3a3a"; x.lineWidth = 2;
    for (let yy = 140; yy < 284; yy += 24) { x.beginPath(); x.moveTo(608, yy); x.lineTo(672, yy); x.stroke(); }
    // the tower rules
    x.fillStyle = "#f6f0e0"; x.fillRect(790, 120, 150, 110);
    x.fillStyle = "#222"; x.font = "700 13px Georgia, serif"; x.fillText("RULES OF THE TOWER", 865, 142);
    x.font = "11px Georgia, serif";
    ["No ringer to ring with his hat on", "No swearing, nor any quarrel", "Look to before the treble goes", "Whoever overturns a bell", "pays sixpence"].forEach((l, k) => x.fillText(l, 865, 162 + k * 15));
  }, true);
}

function floorTexture(rope: number) {
  return canvasTex(512, 512, (x) => {
    for (let i = 0; i < 16; i++) { x.fillStyle = i % 2 ? "#6a4a2c" : "#5e4126"; x.fillRect(0, i * 32, 512, 32); }
    x.strokeStyle = "rgba(0,0,0,0.35)";
    for (let i = 0; i < 16; i++) { x.beginPath(); x.moveTo(0, i * 32); x.lineTo(512, i * 32); x.stroke(); }
    speckle(x, 512, 512, 2500, 0.1);
    const r = ((rope + 1.1) / (HALF * 2)) * 512;
    x.fillStyle = "#7a1f22"; x.beginPath(); x.arc(256, 256, r, 0, Math.PI * 2); x.fill();
    x.strokeStyle = "#d6b25a"; x.lineWidth = 6; x.beginPath(); x.arc(256, 256, r - 12, 0, Math.PI * 2); x.stroke();
  });
}

function ceilingTexture() {
  return canvasTex(256, 256, (x) => {
    x.fillStyle = "#d8ceb4"; x.fillRect(0, 0, 256, 256);
    x.fillStyle = "#4a321e";
    for (let i = 0; i < 6; i++) x.fillRect(i * 51, 0, 10, 256);
    speckle(x, 256, 256, 800, 0.08);
  });
}

function stoneTexture() {
  return canvasTex(512, 192, (x) => {
    x.fillStyle = "#c9b48a"; x.fillRect(0, 0, 512, 192);
    x.strokeStyle = "rgba(80,60,30,0.35)";
    for (let r = 0; r < 8; r++) {
      x.beginPath(); x.moveTo(0, r * 24); x.lineTo(512, r * 24); x.stroke();
      for (let k = 0; k < 9; k++) { const xx = k * 60 + (r % 2) * 30; x.beginPath(); x.moveTo(xx, r * 24); x.lineTo(xx, r * 24 + 24); x.stroke(); }
    }
    for (const cx of [128, 384]) {
      x.fillStyle = "#2a2620"; x.fillRect(cx - 34, 40, 68, 120);
      x.fillStyle = "#6b5b40";
      for (let yy = 48; yy < 160; yy += 12) x.fillRect(cx - 34, yy, 68, 5);
    }
    speckle(x, 512, 192, 1500, 0.1);
  });
}

/** A bell rope: the rope, its striped woollen sally and the tail end, one mesh. y 0 is the middle of the sally. */
function ropeGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const add = (g: THREE.BufferGeometry, y: number, col: string) => {
    g.translate(0, y, 0);
    const c = new THREE.Color(col), n = g.getAttribute("position").count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
    g.setAttribute("color", new THREE.BufferAttribute(a, 3));
    parts.push(g.toNonIndexed());
  };
  add(new THREE.CylinderGeometry(0.014, 0.014, 6, 5, 1, true), 2.6, "#c8b48a");
  add(new THREE.CylinderGeometry(0.018, 0.018, 1.5, 5, 1, true), -1.2, "#bba67c");
  const bands = ["#b3202c", "#efe6d2", "#1f3c88", "#efe6d2", "#b3202c", "#efe6d2", "#1f3c88"];
  bands.forEach((col, k) => add(new THREE.CylinderGeometry(0.045, 0.045, 0.9 / bands.length, 7), -0.45 + (k + 0.5) * (0.9 / bands.length), col));
  return mergeGeometries(parts)!;
}

/** One of the steady old ringers: a coat, a head and both arms up on the rope. */
function ringerGeometry(coat: string): { body: THREE.BufferGeometry; arm: THREE.BufferGeometry } {
  const paint = (g: THREE.BufferGeometry, col: string) => {
    const c = new THREE.Color(col), n = g.getAttribute("position").count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
    g.setAttribute("color", new THREE.BufferAttribute(a, 3));
    return g.toNonIndexed();
  };
  const legs = paint(new THREE.CylinderGeometry(0.16, 0.14, 0.8, 7).translate(0, 0.4, 0), "#2a2a30");
  const body = paint(new THREE.CylinderGeometry(0.2, 0.22, 0.7, 8).translate(0, 1.15, 0), coat);
  const head = paint(new THREE.SphereGeometry(0.13, 8, 6).translate(0, 1.66, 0), "#e2b896");
  const cap = paint(new THREE.SphereGeometry(0.135, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 1.7, 0), "#c8c8c8");
  const arm = mergeGeometries([
    paint(new THREE.BoxGeometry(0.07, 1, 0.07).translate(0.09, 0.5, 0), coat),
    paint(new THREE.BoxGeometry(0.07, 1, 0.07).translate(-0.09, 0.5, 0), coat),
  ])!;
  return { body: mergeGeometries([legs, body, head, cap])!, arm };
}

interface Chamber {
  root: THREE.Group;
  ropes: THREE.Mesh[];
  figures: { body: THREE.Mesh; arm: THREE.Mesh; b: number }[];
  setBells(n: number, steady: number[]): void;
  dispose(): void;
}

function buildChamber(cx: number, cz: number, top: number, church: string): Chamber {
  const root = new THREE.Group();
  root.position.set(cx, top, cz);
  const mats: THREE.Material[] = [];
  const wall = new THREE.MeshBasicMaterial({ map: wallTexture(church), side: THREE.BackSide });
  const floorMat = new THREE.MeshBasicMaterial({ map: floorTexture(1.3 + 0.22 * MAX_BELLS), side: THREE.BackSide });
  const ceil = new THREE.MeshBasicMaterial({ map: ceilingTexture(), side: THREE.BackSide });
  const room = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2, ROOM_H, HALF * 2), [wall, wall, ceil, floorMat, wall, wall]);
  room.position.y = ROOM_H / 2;
  const stone = new THREE.MeshBasicMaterial({ map: stoneTexture() });
  const lead = new THREE.MeshBasicMaterial({ color: "#5d6266" });
  const shell = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2 + 0.4, ROOM_H + 0.8, HALF * 2 + 0.4), [stone, stone, lead, stone, stone, stone]);
  shell.position.y = ROOM_H / 2;
  mats.push(wall, floorMat, ceil, stone, lead);
  root.add(room, shell);
  const ropeGeo = ropeGeometry(), ropeMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const figMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  mats.push(ropeMat, figMat);
  const geos: THREE.BufferGeometry[] = [ropeGeo];
  const ch: Chamber = {
    root, ropes: [], figures: [],
    setBells(n, steady) {
      for (const r of ch.ropes) root.remove(r);
      for (const f of ch.figures) { root.remove(f.body, f.arm); f.body.geometry.dispose(); f.arm.geometry.dispose(); }
      ch.ropes = []; ch.figures = [];
      for (let b = 0; b < n; b++) {
        const [rx, rz] = ropeAt(b, n, 0);
        const m = new THREE.Mesh(ropeGeo, ropeMat);
        m.position.set(rx, 1.5, rz);
        root.add(m);
        ch.ropes.push(m);
      }
      steady.forEach((b, k) => {
        const g = ringerGeometry(["#3c4a2a", "#5a3a28", "#2c3448", "#4a2a3a"][k % 4]);
        const [sx, sz] = ropeAt(b, n, 0.5), [rx, rz] = ropeAt(b, n, 0);
        const body = new THREE.Mesh(g.body, figMat), arm = new THREE.Mesh(g.arm, figMat);
        body.position.set(sx, 0, sz);
        body.rotation.y = Math.atan2(sx, sz);
        arm.position.set(sx + (rx - sx) * 0.85, 1.4, sz + (rz - sz) * 0.85);
        arm.rotation.y = body.rotation.y;
        root.add(body, arm);
        ch.figures.push({ body, arm, b });
      });
    },
    dispose() {
      for (const g of geos) g.dispose();
      room.geometry.dispose(); shell.geometry.dispose();
      for (const f of ch.figures) { f.body.geometry.dispose(); f.arm.geometry.dispose(); }
      for (const m of mats) { (m as THREE.MeshBasicMaterial).map?.dispose(); m.dispose(); }
    },
  };
  return ch;
}

/** Where bell b's rope hangs (out: 0), or where its ringer stands (out: 0.95), from the middle of the chamber. */
function ropeAt(b: number, n: number, out: number): [number, number] {
  const r = 1.3 + 0.22 * n + out, a = Math.PI - (b / n) * Math.PI * 2;
  return [Math.sin(a) * r, Math.cos(a) * r];
}
/** Where someone watching stands, against the wall between the ropes. */
function watchAt(k: number): [number, number] {
  const a = ((k + 0.5) / 10) * Math.PI * 2, r = HALF - 0.7;
  return [Math.sin(a) * r, Math.cos(a) * r];
}

// ---- the challenge ------------------------------------------------------------------------------

interface Go { T: number; n: number; L: number; band: string[] }
type Phase = "gather" | "ring" | "stand" | "down";

registerChallenge({
  id: "bells", name: "Bell Ringing", glyph: "R", colour: COLOUR, tier: 2, stars: 3,
  blurb: "Up the tower, a rope each: ring the method through with the bells in their places",
  goal: () => "Climb the tower and ring the touch without the bells clashing",
  place,
  waiting: ({ spots, w }) => new Welcome(w.scene, w.map, spots[0], spots[1] ?? spots[0]),
  start({ offer, spots, w }) {
    const board = spots[0], mid = spots[1] ?? spots[0];
    const church = board.name;
    const C = { x: mid.x, z: mid.z };
    const ground0 = (map: GameMap) => (map.wide ? map.wide.ground(C.x, C.z) : map.ground(C.x, C.z));
    // high enough to clear the church and anything round it, the same on every screen
    let tallest = ground0(w.map);
    for (const b of w.map.wide?.buildingsNear(C.x, -C.z, 30) ?? []) tallest = Math.max(tallest, b.g + b.h + (b.rp ?? 0));
    const top = Math.round(Math.max(ground0(w.map) + 50, tallest + 14));

    // the shared clock: the host's, as near as each screen can tell
    let off: number | null = w.isHost ? 0 : null;
    const samples: { rtt: number; est: number }[] = [];
    let pingT = 0, pings = 0;
    const nowS = () => performance.now() + (off ?? 0);

    let phase: Phase = "gather";
    let list: string[] = [];
    let go: Go | null = null;
    let rows: number[][] = [], placeOf: number[][] = [], changesFrom = 4, changesTo = 4, methodName = "";
    let B = 400, clashT = 160, goodT = 80, period = 1000, allow = 2, R = 0;
    const steady = new Set<number>();
    const pulls = new Map<number, Map<number, number>>();
    const struck = new Set<number>();
    let judged = -1, bad = 0, lastBad = -10;
    let ending: { won: boolean; why: string; collapse: boolean; t: number } | null = null;
    let aboard = false, perchY: number | null = null, faced = false, yankAt = -1e9;
    const posed = new Set<string>();
    let flash: { text: string; colour: string; t: number } | null = null;
    let stage: Card["stage"] = undefined;
    const said = new Set<string>();
    let lookAsked = false;
    let jangleT = 0;
    let gatherSince = 0;

    const chamber = buildChamber(C.x, C.z, top, church);
    // the vicar and his board stay out while you climb, so there's still somewhere to go up from
    const welcome = new Welcome(w.scene, w.map, board, mid);
    let shown = false, chamberN = 0;
    w.mark("@challenge", { x: board.x, z: board.z }, offer.title, COLOUR);

    const hudCanvas = document.createElement("canvas");
    hudCanvas.style.cssText = "position:fixed;right:12px;bottom:150px;width:210px;height:330px;pointer-events:none;z-index:6;border-radius:10px;display:none";
    (document.getElementById("hud") ?? document.body).appendChild(hudCanvas);
    let pullBtn: HTMLButtonElement | null = null;
    const touch = document.getElementById("touch");
    if (touch) {
      pullBtn = document.createElement("button");
      pullBtn.className = "tbtn"; pullBtn.textContent = "Pull"; pullBtn.hidden = true;
      pullBtn.style.cssText = "position:absolute;right:130px;bottom:120px;width:104px;height:104px;border-radius:52px;font-size:22px;pointer-events:auto;background:rgba(179,32,44,0.75)";
      pullBtn.addEventListener("pointerdown", (e) => { e.preventDefault(); pull(); });
      touch.appendChild(pullBtn);
    }
    const onKey = (e: KeyboardEvent) => { if (e.code === "Space" && !e.repeat && aboard && phase === "ring" && !paused()) pull(); };
    addEventListener("keydown", onKey);

    const myBell = () => (go ? go.band.indexOf(w.selfId) : -1);
    const n = () => go?.n ?? Math.max(3, Math.min(MAX_BELLS, list.length));
    const rowStart = (r: number) => (r * go!.n + Math.floor(r / 2)) * B;
    const beat = (b: number, r: number) => go!.T + rowStart(r) + placeOf[r][b] * B;
    const rowAt = (t: number) => {
      if (!go) return -1;
      let r = Math.max(0, Math.floor((t - go.T) / period));
      while (r > 0 && go.T + rowStart(r) > t) r--;
      while (go.T + rowStart(r + 1) <= t) r++;
      return r;
    };
    const ctxNow = () => SFX.context();
    const camera = () => w.look();
    const inside = () => { const c = camera(); return Math.abs(c.x - C.x) < HALF && Math.abs(c.z - C.z) < HALF && c.y > top - 0.5 && c.y < top + ROOM_H + 0.5; };

    /** Bell b sounds at shared time s, on this screen's sound clock. */
    function strike(b: number, s: number, rate = 1, vol = 1) {
      const c = ctxNow();
      if (!c || !go) return;
      const cam = camera(), into = inside();
      const dist = into ? 0 : Math.hypot(cam.x - C.x, cam.y - top - 4, cam.z - C.z);
      if (dist > 900) return;
      const [, pan] = into || !w.hear ? [0, 0] : w.hear(C.x, top + 4, C.z);
      const o = SFX.sfxOut((into ? 0.55 : 0.9) * vol * (into ? 1 : 40 / (40 + dist)), pan, dist, into ? 0.32 : 0.2);
      if (!o) return;
      const src = c.createBufferSource();
      src.buffer = bellBuffer(c, tuning(go.n)[b]);
      src.playbackRate.value = rate;
      src.connect(o);
      src.start(c.currentTime + Math.max(0, (s - nowS()) / 1000));
    }

    function setGo(g: Go) {
      go = g;
      const p = plan(g.n, g.L);
      const t = rowsOf(g.n, p);
      rows = t.rows; changesFrom = t.changesFrom; changesTo = t.changesTo; methodName = p.name;
      R = rows.length;
      placeOf = rows.map((row) => { const at: number[] = []; row.forEach((b, i) => { at[b] = i; }); return at; });
      B = (430 - 18 * g.n) * (1 - 0.07 * g.L);
      clashT = B * (0.45 - 0.04 * g.L); goodT = B * 0.2;
      period = (g.n + 0.5) * B;
      allow = 1 + Math.floor(R / 18);
      steady.clear();
      g.band.forEach((id, b) => { if (!id) steady.add(b); });
      phase = phase === "gather" ? "ring" : phase;
      const c = ctxNow();
      if (c) for (const f of tuning(g.n)) bellBuffer(c, f);
    }

    function send(d: Record<string, unknown>, to?: string) {
      w.send("qe", { ...d, s: offer.seed }, to);
    }
    function tell(d: Record<string, unknown>) {
      send(d);
      job.event!(d, w.selfId);
    }

    function climb() {
      aboard = true;
      perchY = null; faced = false;
      const k = list.indexOf(w.selfId);
      const [sx, sz] = standSpot(k < 0 ? list.length : k);
      w.moveTo(C.x + sx, C.z + sz, Math.atan2(sx, sz));
      w.mark("@challenge", null);
      if (w.isHost) job.event!({ k: "in" }, w.selfId); else send({ k: "in" });
    }

    function standSpot(k: number): [number, number] {
      const b = myBell();
      if (go && b >= 0) return ropeAt(b, go.n, 0.95);
      if (!go && k >= 0 && k < MAX_BELLS) return ropeAt(k, n(), 0.95);
      const watchers = go ? list.filter((id) => !go!.band.includes(id)) : list.slice(MAX_BELLS);
      return watchAt(Math.max(0, watchers.indexOf(w.selfId)));
    }

    function startRinging() {
      if (go || !w.isHost) return;
      const band = list.slice(0, MAX_BELLS);
      const bells = Math.max(3, band.length);
      while (band.length < bells) band.push("");
      tell({ k: "go", T: Math.round(nowS() + 5200), n: bells, L: hash("bells", dayNumber()) % 3, band });
    }

    function pull() {
      const b = myBell();
      if (!go || b < 0 || phase !== "ring" || off === null) return;
      const s = nowS() + LEAD, mine = pulls.get(b) ?? new Map<number, number>();
      pulls.set(b, mine);
      let best = -1, bd = Infinity;
      const r0 = Math.max(0, rowAt(s) - 1);
      for (let r = r0; r < Math.min(R, r0 + 3); r++) {
        if (mine.has(r) || r <= judged) continue;
        const d = Math.abs(s - beat(b, r));
        if (d < bd) { bd = d; best = r; }
      }
      const c = ctxNow();
      if (c) ropeSound(c, c.currentTime, 0.25, false);
      if (best < 0 || bd > period * 0.6) return;
      mine.set(best, s);
      send({ k: "p", b, r: best, t: Math.round(s) });
      strike(b, s);
      const err = s - beat(b, best);
      flash = Math.abs(err) <= goodT ? { text: "Good", colour: "#7fe08a", t: performance.now() }
        : Math.abs(err) <= clashT ? { text: err < 0 ? "A touch quick" : "A touch slow", colour: "#e8c25a", t: performance.now() }
        : { text: err < 0 ? "Early! Clash" : "Late! Clash", colour: "#ff6a5a", t: performance.now() };
      if (err > clashT) yank();
    }

    function yank() {
      yankAt = performance.now();
      const c = ctxNow();
      if (c) ropeSound(c, c.currentTime + LEAD / 1000, 0.5, true);
    }
    const yankLift = () => { const u = (performance.now() - yankAt) / 750; return u > 0 && u < 1 ? Math.sin(Math.PI * u) * 1.3 : 0; };

    function call(key: string, text: string, title?: string, sub?: string) {
      if (said.has(key)) return;
      said.add(key);
      if (aboard || inside()) speak(text, 7, 0, { voice: 0, pitch: 0.8, rate: 1 });
      if (title) stage = { key, title, sub, colour: COLOUR, life: 2.2 };
    }

    /** Host: the band's done with row r. Bad if any bell in it was missed or struck out of its place. */
    function judge(r: number) {
      if (!go) return;
      const who: [number, number | null][] = [];
      for (let b = 0; b < go.n; b++) {
        if (steady.has(b)) continue;
        const s = pulls.get(b)?.get(r);
        if (s === undefined) who.push([b, null]);
        else if (Math.abs(s - beat(b, r)) > clashT) who.push([b, Math.round(s - beat(b, r))]);
      }
      const isBad = who.length > 0;
      const nb = bad + (isBad ? 1 : 0);
      tell({ k: "row", r, bad: nb, lb: isBad ? r : lastBad, who });
      if (isBad && lastBad === r - 1) tell({ k: "end", won: false, collapse: true, why: "The bells collapsed into a jangle" });
      else if (nb > allow) tell({ k: "end", won: false, collapse: true, why: "Too many clashes: the conductor called Stand" });
      else if (r === R - 1) tell({ k: "end", won: true, collapse: false, why: `${methodName} rung through with ${nb} clash${nb === 1 ? "" : "es"}` });
    }

    function finish() {
      if (job.done || !ending) return;
      job.done = { won: ending.won, text: ending.why, x: board.x, z: board.z };
    }

    function drawHud() {
      const show = aboard || (go && inside());
      if (!show) { if (hudCanvas.style.display !== "none") hudCanvas.style.display = "none"; return; }
      if (hudCanvas.style.display !== "block") hudCanvas.style.display = "block";
      const dpr = Math.min(2, devicePixelRatio || 1), Wd = 210, Ht = 330;
      if (hudCanvas.width !== Wd * dpr) { hudCanvas.width = Wd * dpr; hudCanvas.height = Ht * dpr; }
      const x = hudCanvas.getContext("2d")!;
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
      x.clearRect(0, 0, Wd, Ht);
      x.fillStyle = "rgba(12,14,22,0.88)"; x.fillRect(0, 0, Wd, Ht);
      x.textAlign = "left"; x.fillStyle = COLOUR; x.font = "700 13px 'Barlow Condensed', sans-serif";
      const t = nowS(), b = myBell();
      if (off === null) { x.fillStyle = "#ddd"; x.fillText("Finding the beat…", 12, 22); return; }
      if (!go) {
        x.fillText("THE RINGING CHAMBER", 12, 22);
        x.fillStyle = "#ddd"; x.font = "13px sans-serif";
        x.fillText(`${list.length} up the tower`, 12, 46);
        x.fillText(`${n()} bells${list.length < 3 ? ` (${3 - Math.min(3, list.length)} steady old hands)` : ""}`, 12, 66);
        x.fillStyle = "#aab"; x.font = "12px sans-serif";
        x.fillText("Starts when everyone's up,", 12, 96);
        x.fillText(`or ${ctl("bells.look")} to look to now`, 12, 112);
        return;
      }
      x.fillText(methodName.toUpperCase(), 12, 20);
      const cur = Math.max(0, Math.min(R - 1, rowAt(t)));
      x.textAlign = "right"; x.fillStyle = "#ddd"; x.font = "12px sans-serif";
      x.fillText(t < go.T ? "Look to…" : `Row ${cur + 1}/${R}`, Wd - 10, 20);
      x.textAlign = "left";
      for (let k = 0; k <= allow; k++) {
        x.fillStyle = k < bad ? "#ff6a5a" : "rgba(255,255,255,0.25)";
        x.beginPath(); x.arc(14 + k * 12, 34, 4, 0, Math.PI * 2); x.fill();
      }
      x.fillStyle = "#99a"; x.font = "11px sans-serif"; x.fillText("clashes allowed", 18 + (allow + 1) * 12, 38);
      // the blue line: the rows going by, your bell's path through them in blue, the treble's in red
      const gx = 16, gw = Wd - 32, cw = gw / go.n, nowY = 165, px = 24 / period;
      const rowY = (r: number) => nowY + (go!.T + rowStart(r) + (go!.n - 1) * B * 0.5 - t) * px;
      x.save(); x.beginPath(); x.rect(0, 46, Wd, 190); x.clip();
      const r0 = Math.max(0, cur - 5), r1 = Math.min(R - 1, cur + 6);
      x.fillStyle = "rgba(255,255,255,0.06)"; x.fillRect(4, rowY(cur) - 9, Wd - 8, 18);
      for (const [bell, col, wid] of [[0, "#d94a4a", 1.5], [b, "#4aa8ff", 3]] as [number, string, number][]) {
        if (bell < 0 || (bell === 0 && b === 0 && col === "#d94a4a")) continue;
        x.strokeStyle = col; x.lineWidth = wid; x.beginPath();
        for (let r = r0; r <= r1; r++) { const xx = gx + (placeOf[r][bell] + 0.5) * cw, yy = rowY(r); if (r === r0) x.moveTo(xx, yy); else x.lineTo(xx, yy); }
        x.stroke();
      }
      x.textAlign = "center"; x.textBaseline = "middle";
      const inRow = Math.floor((t - go.T - rowStart(cur)) / B);
      for (let r = r0; r <= r1; r++) {
        for (let p = 0; p < go.n; p++) {
          const bell = rows[r][p], xx = gx + (p + 0.5) * cw, yy = rowY(r);
          if (r === cur && p === inRow && t >= go.T) { x.fillStyle = "rgba(217,164,65,0.5)"; x.fillRect(xx - cw / 2 + 1, yy - 8, cw - 2, 16); }
          x.fillStyle = bell === b ? "#ffffff" : bell === 0 ? "#f08a8a" : "#7f889a";
          x.font = bell === b ? "700 14px sans-serif" : "12px sans-serif";
          x.fillText(String(bell + 1), xx, yy);
        }
      }
      x.restore();
      x.textBaseline = "alphabetic";
      // the sally: when to pull for your next stroke
      const gy = 262;
      if (b < 0) {
        x.fillStyle = "#aab"; x.font = "12px sans-serif"; x.textAlign = "left";
        x.fillText(steady.size === go.n ? "The old hands are ringing" : "Watching the band", 12, gy);
        x.fillText("Follow the treble's red line", 12, gy + 18);
        return;
      }
      let next = -1;
      const mine = pulls.get(b);
      for (let r = Math.max(0, cur - 1); r < R; r++) { if (!mine?.has(r) && beat(b, r) - LEAD + clashT > t) { next = r; break; } }
      x.textAlign = "left"; x.fillStyle = "#4aa8ff"; x.font = "700 13px sans-serif";
      x.fillText(`You ring ${bellName(b, go.n)}`, 12, gy - 14);
      const tx = 16, tw = Wd - 32, aim = tx + tw * 0.72, span = 1600;
      x.fillStyle = "rgba(255,255,255,0.12)"; x.fillRect(tx, gy, tw, 16);
      const sc = tw / span;
      x.fillStyle = "rgba(232,194,90,0.45)"; x.fillRect(aim - clashT * sc, gy, clashT * 2 * sc, 16);
      x.fillStyle = "rgba(127,224,138,0.7)"; x.fillRect(aim - goodT * sc, gy, goodT * 2 * sc, 16);
      x.fillStyle = "#fff"; x.fillRect(aim - 1, gy - 3, 2, 22);
      if (next >= 0 && phase === "ring") {
        const due = beat(b, next) - LEAD, dx = aim + (t - due) * sc;
        if (dx > tx - 6) {
          x.fillStyle = "#4aa8ff"; x.beginPath(); x.arc(Math.min(tx + tw, dx), gy + 8, 7, 0, Math.PI * 2); x.fill();
        }
        x.fillStyle = "#ccd"; x.font = "11px sans-serif";
        x.fillText(`${next % 2 ? "Backstroke" : "Handstroke"} · ${ordinal(placeOf[next][b] + 1)} place`, tx, gy + 32);
      }
      x.textAlign = "left"; x.fillStyle = "#99a"; x.font = "11px sans-serif";
      x.fillText(`${ctl("bells.pull")} to pull when the dot's on the line`, tx, gy + 47);
      if (flash && performance.now() - flash.t < 700) {
        x.globalAlpha = 1 - (performance.now() - flash.t) / 700;
        x.textAlign = "center"; x.fillStyle = flash.colour; x.font = "700 18px 'Barlow Condensed', sans-serif";
        x.fillText(flash.text, Wd / 2, gy + 64);
        x.globalAlpha = 1;
      }
    }

    /** How high bell b's sally is at shared time t: up out of reach after a handstroke, down to the hands after a backstroke. */
    function sallyAt(b: number, t: number): number {
      const low = 1.2, high = 2.6;
      if (!go || phase === "gather" || t < go.T - LEAD) return low;
      const pull = (r: number) => beat(b, r) - LEAD;
      let r = Math.max(0, Math.min(R - 1, rowAt(t + LEAD)));
      while (r > 0 && pull(r) > t) r--;
      if (pull(r) > t) return low;
      if (r >= R - 1 || ending) return r % 2 ? low : high;
      const u = Math.min(1, (t - pull(r)) / Math.max(1, (pull(r + 1) - pull(r)) * 0.6));
      const e = u * u * (3 - 2 * u);
      return r % 2 === 0 ? low - 0.25 + (high - low + 0.25) * e : high - (high - low) * e;
    }

    const paused = () => { const el = document.getElementById("pause"); return !!el && !el.hidden; };

    const job: Job = {
      offer, done: null,
      aloft: inside,
      update(dt) {
        welcome.update(dt);
        const t = nowS();
        // keep the clock in step with the host's
        if (!w.isHost && (pingT -= dt) <= 0) {
          pingT = pings < 8 ? 0.25 : 2;
          pings++;
          send({ k: "tq", c: performance.now() });
        }
        if (w.isHost && off === null) off = 0;

        // everyone up the tower holds their sally in both hands, the gun put away
        const up = new Set(aboard || go ? list : []);
        for (const id of up) if (id !== w.selfId && !posed.has(id)) { w.pose?.(id, 0, "rope"); posed.add(id); }
        for (const id of [...posed]) if (!up.has(id) || phase === "down") { w.pose?.(id, 0, ""); posed.delete(id); }

        // the chamber is only drawn while someone could see it
        const cam = camera(), near = Math.hypot(cam.x - C.x, cam.z - C.z) < 500;
        if (near !== shown) { shown = near; if (near) w.scene.add(chamber.root); else w.scene.remove(chamber.root); }
        if (chamberN !== n()) { chamberN = n(); chamber.setBells(chamberN, go ? [...steady] : Array.from({ length: Math.max(0, 3 - list.length) }, (_, k) => list.length + k)); }
        if (shown) {
          chamber.ropes.forEach((m, b) => { m.position.y = sallyAt(b, t); });
          for (const f of chamber.figures) {
            const y = sallyAt(f.b, t);
            f.arm.scale.y = y > 2.2 ? 0.3 : Math.max(0.3, y - 1.35);
          }
        }

        if (go && off !== null) {
          // the old hands ring on the beat on every screen alike
          if (phase === "ring") {
            const r0 = Math.max(0, rowAt(t) - 1), r1 = Math.min(R - 1, rowAt(t + 400) + 1);
            for (const b of steady) {
              for (let r = r0; r <= r1; r++) {
                const bt = beat(b, r), key = b * 10000 + r;
                if (bt > t - 40 && bt < t + 350 && !struck.has(key)) { struck.add(key); strike(b, bt); }
              }
            }
          }
          // the conductor's calls
          if (phase === "ring") {
            if (t > go.T - 5000) call("look", "Look to!", "Look to!", `${methodName}, ${go.n} bells`);
            if (t > go.T - 2600) call("going", "Treble's going.");
            if (t > go.T - 1200) call("gone", "She's gone!", "She's gone!", "Rounds first");
            if (t > go.T + rowStart(changesFrom - 2)) call("go", `Go, ${methodName}!`, `Go ${methodName}`, "The changes start next handstroke");
            if (t > go.T + rowStart(changesTo - 1)) call("all", "That's all!", "That's all!", "Back into rounds");
          }
        }

        // the collapse: every bell clanging over every other
        if (ending?.collapse && performance.now() - ending.t < 3200 && go) {
          if ((jangleT -= dt) <= 0) {
            jangleT = 0.04 + Math.random() * 0.09;
            strike(Math.floor(Math.random() * go.n), nowS() + 20, 0.94 + Math.random() * 0.12, 0.8);
            if (Math.random() < 0.15 && aboard) yank();
          }
        }
        if (ending && phase === "stand" && performance.now() - ending.t > (ending.collapse ? 3600 : 2600)) {
          call("stand", "Stand!", "Stand!", ending.why);
          phase = "down";
          if (!aboard) finish();
        }

        const mb = myBell();
        if (AUTO && go && mb >= 0 && phase === "ring" && off !== null) {
          const mine = pulls.get(mb);
          for (let r = Math.max(0, rowAt(t) - 1); r < Math.min(R, rowAt(t) + 3); r++) {
            if (mine?.has(r) || r <= judged) continue;
            const wobble = AUTO === "bad" ? (hash("wobble", r, mb) % 3 === 0 ? (hash("w", r) % 2 ? 0.7 : -0.6) * B : 0) : 0;
            if (t >= beat(mb, r) - LEAD + wobble) pull();
            break;
          }
        }
        if (pullBtn) {
          const want = aboard && phase === "ring" && myBell() >= 0;
          if (pullBtn.hidden === want) pullBtn.hidden = !want;
        }
        drawHud();
      },
      host() {
        if (phase === "gather") {
          const everyone = w.players();
          if (list.length && !gatherSince) gatherSince = performance.now();
          const all = everyone.every((p) => list.includes(p.id));
          if ((all && list.length && performance.now() - gatherSince > 1500) || lookAsked) startRinging();
          return;
        }
        if (!go || ending) return;
        // a ringer gone from the game: an old hand takes the rope
        const here = new Set(w.players().map((p) => p.id));
        go.band.forEach((id, b) => { if (id && !here.has(id) && !steady.has(b)) tell({ k: "ai", b }); });
        const t = nowS();
        while (judged + 1 < R && t > go.T + rowStart(judged + 1) + (go.n - 1) * B + period * 0.6 + 250 && !ending) judge(judged + 1);
      },
      event(d, from) {
        if (!d || typeof d !== "object") return;
        switch (d.k) {
          case "tq":
            if (w.isHost && Number.isFinite(d.c)) send({ k: "ta", c: d.c, h: nowS() }, from);
            return;
          case "ta": {
            if (w.isHost || !Number.isFinite(d.c) || !Number.isFinite(d.h)) return;
            const t1 = performance.now(), rtt = t1 - d.c;
            if (rtt < 0 || rtt > 3000) return;
            samples.push({ rtt, est: d.h + rtt / 2 - t1 });
            if (samples.length > 12) samples.shift();
            off = samples.reduce((a, s) => (s.rtt < a.rtt ? s : a)).est;
            return;
          }
          case "in":
            if (!w.isHost || go) { if (w.isHost && go && !list.includes(from)) tell({ k: "list", a: [...list, from] }); return; }
            if (!list.includes(from)) tell({ k: "list", a: [...list, from] });
            return;
          case "list":
            if (Array.isArray(d.a)) list = d.a.filter((id: unknown) => typeof id === "string");
            return;
          case "look":
            if (w.isHost) lookAsked = true;
            return;
          case "go":
            if (go || !Number.isFinite(d.T) || !Array.isArray(d.band)) return;
            setGo({ T: d.T, n: Math.max(3, Math.min(MAX_BELLS, d.n | 0)), L: Math.max(0, Math.min(2, d.L | 0)), band: d.band.map(String) });
            chamberN = 0;
            return;
          case "p": {
            if (!go || from === w.selfId || !Number.isFinite(d.b) || !Number.isFinite(d.r) || !Number.isFinite(d.t)) return;
            const b = d.b | 0, r = d.r | 0;
            if (b < 0 || b >= go.n || r < 0 || r >= R || steady.has(b)) return;
            const m = pulls.get(b) ?? new Map<number, number>();
            pulls.set(b, m);
            if (m.has(r)) return;
            m.set(r, d.t);
            if (!ending) strike(b, d.t);
            return;
          }
          case "ai":
            if (go && Number.isFinite(d.b)) { steady.add(d.b | 0); chamberN = 0; }
            return;
          case "row": {
            if (!Number.isFinite(d.r)) return;
            judged = Math.max(judged, d.r | 0);
            bad = d.bad | 0; lastBad = Number.isFinite(d.lb) ? d.lb : lastBad;
            const who = Array.isArray(d.who) ? d.who : [];
            if (who.length && go && (aboard || inside())) {
              const names = who.slice(0, 2).map(([b, e]: [number, number | null]) => {
                const id = go!.band[b], nm = id === w.selfId ? "You" : esc(w.nameOf(id));
                return `${nm} on ${bellName(b, go!.n)}${e === null ? " missed the stroke" : e > 0 ? " came in late" : " came in early"}`;
              });
              w.feed(`<b style="color:${COLOUR}">Clash!</b> ${names.join("; ")}`);
              if (who.some(([b, e]: [number, number | null]) => go!.band[b] === w.selfId && e === null)) flash = { text: "Missed!", colour: "#ff6a5a", t: performance.now() };
            }
            return;
          }
          case "end":
            if (ending) return;
            ending = { won: !!d.won, why: String(d.why ?? ""), collapse: !!d.collapse, t: performance.now() };
            phase = "stand";
            if (ending.collapse) stage = { key: "jangle", title: "It's all gone wrong!", sub: "The bells are clanging over each other", colour: "#ff6a5a", life: 3 };
            else stage = { key: "well", title: "Well rung!", sub: ending.why, colour: COLOUR, life: 3 };
            return;
        }
      },
      progress: () => ({ a: list, g: go, j: judged, bad, lb: lastBad, ai: [...steady], e: ending ? { won: ending.won, why: ending.why, collapse: ending.collapse } : null }),
      restore(p) {
        if (!p || typeof p !== "object") return;
        if (Array.isArray(p.a)) list = p.a.filter((id: unknown) => typeof id === "string");
        if (p.g && !go) job.event!({ k: "go", ...p.g }, "");
        if (Number.isFinite(p.j)) judged = p.j;
        if (Number.isFinite(p.bad)) bad = p.bad;
        if (Number.isFinite(p.lb)) lastBad = p.lb;
        if (Array.isArray(p.ai)) for (const b of p.ai) if (Number.isFinite(b)) steady.add(b);
        if (p.e && !ending) job.event!({ k: "end", ...p.e }, "");
      },
      use() {
        const me = w.me();
        if (!aboard) {
          if (phase !== "gather" && phase !== "ring") return false;
          if (Math.hypot(me.x - board.x, me.z - board.z) > CLIMB && Math.hypot(me.x - C.x, me.z - C.z) > CLIMB) return false;
          climb();
          return true;
        }
        if (phase === "gather") { if (w.isHost) lookAsked = true; else send({ k: "look" }); return true; }
        if (phase === "ring") { pull(); return true; }
        return false;
      },
      hint() {
        const me = w.me();
        if (!aboard) {
          if (phase !== "gather" && phase !== "ring") return "";
          return Math.hypot(me.x - board.x, me.z - board.z) < CLIMB || Math.hypot(me.x - C.x, me.z - C.z) < CLIMB
            ? `<b>{use}</b> Climb the tower${go ? " and watch" : ""}` : "";
        }
        if (phase === "gather") return `<b>{use}</b> Look to! Start the ringing`;
        if (phase === "ring" && go && myBell() >= 0 && rowAt(nowS()) < changesFrom) {
          return `<b>{bells.pull}</b> to pull ${bellName(myBell(), go.n)}'s rope when the sally gauge says`;
        }
        return "";
      },
      perch(dt) {
        if (!aboard) return null;
        const [sx, sz] = standSpot(list.indexOf(w.selfId));
        const x = C.x + sx, z = C.z + sz, ground = w.map.ground(x, z);
        // up the tower stairs, down again at the end, and hauled off your feet by a late rope
        if (perchY === null) perchY = ground;
        const target = phase === "down" ? ground : top + yankLift();
        const step = (phase === "down" || perchY < top - 0.5 ? 28 : 9) * dt;
        perchY += Math.max(-step, Math.min(step, target - perchY));
        if (phase === "down" && perchY <= ground + 0.01) {
          aboard = false; perchY = null;
          finish();
          return null;
        }
        const face = faced ? undefined : Math.atan2(sx, sz);
        faced = true;
        return { x, y: perchY, z, face, bare: true };
      },
      card() {
        const ps = w.players();
        if (phase === "gather" && !aboard) {
          const me = w.me(), d = Math.hypot(me.x - board.x, me.z - board.z);
          return { line: d > 30 ? `Go to ${church}` : "Climb the tower ({use} by the vicar)", progress: `${list.length} / ${ps.length} up`, stage };
        }
        if (phase === "gather") return { line: "Waiting in the ringing chamber", sub: "Everyone up, or {bells.look} to look to", progress: `${list.length} / ${ps.length} up`, stage };
        if (!go) return { line: "Ringing", stage };
        const cur = ending ? judged + 1 : Math.max(0, Math.min(R, rowAt(nowS()) + 1)), b = myBell();
        return {
          line: b >= 0 ? `Ring ${bellName(b, go.n)} in its place` : "The band is ringing",
          sub: `${methodName} · ${bad} of ${allow} clashes`,
          progress: `${cur} / ${R}`, bar: cur / R, stage,
        };
      },
      scarAt: () => ({ x: board.x, z: board.z }),
      end() {
        removeEventListener("keydown", onKey);
        for (const id of posed) w.pose?.(id, 0, "");
        if (aboard) { const [sx, sz] = standSpot(list.indexOf(w.selfId)); w.moveTo(board.x + sx * 0.2, board.z + sz * 0.2, 0); }
        aboard = false;
        if (shown) w.scene.remove(chamber.root);
        chamber.dispose();
        welcome.dispose();
        hudCanvas.remove();
        pullBtn?.remove();
        w.mark("@challenge", null);
      },
    };
    return job;
  },
});
