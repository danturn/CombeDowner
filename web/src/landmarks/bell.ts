// The Bell Inn, 103 Walcot Street, as a set piece (landmarks/setpieces.ts) in place of the plain
// blocks the map tools build on its plot: an old coaching inn on the west side of the street, in
// the council's minutes by 1753 and probably enlarged in 1768, and owned by its customers since
// 2013. As the listing (Grade II) and the pub's own accounts describe it:
// - The house: a front of Bath stone ashlar put on an older building about 1750, three storeys
//   and five bays, with plate-glass sashes and a slate roof behind a parapet. Its ground floor is a
//   pub front painted the deep red it wore in the 19th century, "THE BELL" on the fascia, and in
//   the middle the heavily rusticated doorway under a stepped hood on shaped brackets (a late
//   Baroque doorcase of the kind John Wood disliked). The bell itself hangs from an iron bracket
//   over the pavement, and the gable over the old stables carries the pub's name to the south.
// - Beside it, the old stables the pub grew into (chamfered and boxed-in beams inside), with the
//   ghost of a painted sign for the inn's stabling and brewery on its front; and the yard, behind
//   its listed gatepiers (rusticated, with pyramid caps) and spearhead gates, which climbs to the
//   garden. Barrels wait at the bottom.
// - Inside, which you can walk into, three rooms on the ground floor: the long main bar, with its
//   hand pumps, the bell rung for last orders, settles under the windows, a wood burner, a piano
//   and a corner where the bands play, every wall covered in posters for gigs; and the games room
//   in the old stables, with bar billiards, table football, pool and, yes, the launderette.
// - Up the stairs at the back (past the toilets) the walled garden, a storey above the street as
//   the ground climbs towards the Paragon: flagstones, picnic tables under a clear canopy, strings
//   of lights, the Pizza Bike, covered seating along the back, and the Back Bar, where the open mic
//   and the smaller gigs are, with its own little stage.
// Its frame: x north along Walcot Street, z out of the front (east, across the street), y up from
// the bar's floor. Placed at a fixed floor level (setpieces.ts), a step above the pavement; it
// lowers the ground under its rooms and garden (BELL_SINK) to sit in the slope. Solid as it's drawn
// (landmarks/shape.ts).
import * as THREE from "three";
import { Kit, stone, plain, slate, flags, glow } from "./kit";
import * as TX from "../textures";

// the plan (see the frame above)
const HX = 6.8, HZ = -10;                 // the house: either end along the street, its back
const SX = -18.8, SZ = -5.6;              // the old stables: their south end, their back
const YX0 = -24.4, YX1 = SX;              // the yard, between the stables and next door
const WX0 = 2.6, WZ = -20.6;              // the back wing (stairs and toilets): its south side, its back
const BX0 = YX0, BX1 = WX0, BZ0 = -14.2, BZ1 = -19.6;   // the back range: the Back Bar and the covered seating
const UP = 3.0;                           // the garden's level, above the bar's floor
const CEIL = 3.4;                         // the ground floor's ceiling
const FIRST = 3.72, EAVES = 9.8;          // the house's first floor (the cornice over the pub front) and its eaves
const BAYS = [-5.44, -2.72, 0, 2.72, 5.44];
const STEPS = 17, RUN = 0.376, STAIR0 = -10.6;           // the back stairs: steps, each one's depth, where they start
const WTOP = 5.6;                         // the back wing's walls, under its flat roof
/** The pavement's level along the front (a little lower at the south end, as the street is). */
const pave = (x: number) => x < -11 ? -0.48 : x < 0 ? -0.48 + ((x + 11) * 0.3) / 11 : -0.18 + (x * 0.1) / 7;

/** The ground it lowers (setpieces.ts): under the rooms to just below their floors, and under the
 *  yard, the garden and the back range to below theirs. The front rooms and the yard come right up
 *  to the pavement, so the ground under their fronts comes down as far as the street's level. */
export const BELL_SINK = [
  { x0: -6.6, x1: 6.6, z0: -9.8, z1: -0.2, y: -0.2, street: true },
  { x0: -18.6, x1: -6.6, z0: -5.4, z1: -0.2, y: -0.2, street: true },
  { x0: 2.8, x1: 6.6, z0: -20.4, z1: -9.8, y: -0.2 },
  { x0: YX0, x1: YX1, z0: -12, z1: 0.3, y: -0.6, street: true },
  { x0: YX0, x1: 6.6, z0: -22.8, z1: -5.6, y: UP - 0.15 },
];

// ---- its own textures ------------------------------------------------------------------------------

const cache = new Map<string, THREE.Texture>();
const once = (k: string, make: () => THREE.Texture) => cache.get(k) ?? cache.set(k, make()).get(k)!;
type Rect = [number, number, number, number];   // x, y, w, h on a canvas
/** A rectangle of an atlas W by H as u0, v0, u1, v1. */
const uvOf = (W: number, H: number, [x, y, w, h]: Rect): [number, number, number, number] => [x / W, 1 - (y + h) / H, (x + w) / W, 1 - y / H];

// the signs, all on one sheet: painted lettering on the pub front, the gable, the doors, the chalkboards and the pump clips
const SW = 1024, SH = 1024;
const SIGN: Record<string, Rect> = {
  bell: [0, 0, 1024, 128], music: [0, 128, 1024, 128], games: [0, 256, 1024, 96], inn: [0, 352, 1024, 224],
  back: [0, 576, 512, 96], laund: [512, 576, 512, 96], gents: [0, 672, 256, 64], ladies: [256, 672, 256, 64],
  chalk: [512, 672, 512, 352], pizza: [0, 736, 256, 288],
};
const clipRect = (i: number): Rect => [256 + (i % 3) * 85, 736 + Math.floor(i / 3) * 144, 85, 144];

function signsTex(): THREE.Texture {
  const [c, g] = TX.canvas(SW, SH);
  const RED = "#6e2620", GOLD = "#e9c46c";
  const panel = ([x, y, w, h]: Rect, bg: string) => { g.fillStyle = bg; g.fillRect(x, y, w, h); };
  const text = (s: string, x: number, y: number, size: number, ink: string, maxW: number, font = "Georgia, serif", shadow = "") => {
    g.font = `bold ${size}px ${font}`; g.textAlign = "center"; g.textBaseline = "middle";
    if (shadow) { g.fillStyle = shadow; g.fillText(s, x + size * 0.05, y + size * 0.06, maxW); }
    g.fillStyle = ink; g.fillText(s, x, y, maxW);
  };
  const fascia = (r: Rect, s: string, size: number) => {
    panel(r, RED);
    g.strokeStyle = GOLD; g.lineWidth = 4; g.strokeRect(r[0] + 10, r[1] + 10, r[2] - 20, r[3] - 20);
    text(s, r[0] + r[2] / 2, r[1] + r[3] / 2 + 3, size, GOLD, r[2] - 60, "Georgia, serif", "#2a0d0b");
  };
  fascia(SIGN.bell, "T H E   B E L L", 86);
  fascia(SIGN.music, "L I V E   M U S I C", 80);
  fascia(SIGN.games, "BAR BILLIARDS  ·  REAL ALE  ·  GARDEN", 58);
  // the gable sign, painted on aluminium: big and plain, to be read from up the street
  { const r = SIGN.inn; panel(r, "#151515");
    g.strokeStyle = "#e9e2d0"; g.lineWidth = 6; g.strokeRect(r[0] + 14, r[1] + 14, r[2] - 28, r[3] - 28);
    text("THE BELL INN", r[0] + r[2] / 2, r[1] + 92, 112, "#f3eddc", r[2] - 80);
    text("LIVE MUSIC  ·  REAL ALES  ·  BEER GARDEN", r[0] + r[2] / 2, r[1] + 172, 44, GOLD, r[2] - 80); }
  for (const [k, s] of [["back", "THE BACK BAR"], ["laund", "LAUNDERETTE"]] as const) {
    panel(SIGN[k], k === "back" ? RED : "#1d4e7a");
    text(s, SIGN[k][0] + 256, SIGN[k][1] + 50, 56, k === "back" ? GOLD : "#ffffff", 480);
  }
  for (const [k, s] of [["gents", "GENTS"], ["ladies", "LADIES"]] as const) { panel(SIGN[k], "#d9cfb6"); text(s, SIGN[k][0] + 128, SIGN[k][1] + 34, 40, "#2b2b2b", 230); }
  // chalkboards, in chalk
  const chalk = (r: Rect, lines: [string, number, string][]) => {
    panel(r, "#4a3320"); g.fillStyle = "#1f2422"; g.fillRect(r[0] + 14, r[1] + 14, r[2] - 28, r[3] - 28);
    let y = r[1] + 40;
    for (const [s, size, ink] of lines) { text(s, r[0] + r[2] / 2, y + size / 2, size, ink, r[2] - 50, "'Comic Sans MS', 'Marker Felt', cursive"); y += size * 1.25; }
  };
  chalk(SIGN.chalk, [["LIVE MUSIC", 50, "#f4f0e6"], ["Monday & Wednesday", 34, "#f6d36b"], ["nights", 34, "#f6d36b"], ["Sunday lunchtime", 34, "#9fd8f0"], ["Open mic Thursday", 32, "#f4a6b8"], ["in the Back Bar", 32, "#f4a6b8"]]);
  chalk(SIGN.pizza, [["PIZZA", 54, "#f4f0e6"], ["BIKE", 54, "#f4f0e6"], ["sourdough", 30, "#f6d36b"], ["in the", 30, "#9fd8f0"], ["garden", 30, "#9fd8f0"]]);
  // pump clips: little painted badges, a different ale each
  const clips = ["#c8452f", "#2f6db3", "#e0a92a", "#3c8a4e", "#7a3f99", "#d9d2c0"];
  clips.forEach((col, i) => {
    const [x, y, w, h] = clipRect(i);
    g.fillStyle = "#1b1b1b"; g.fillRect(x, y, w, h);
    g.fillStyle = col; g.beginPath(); g.ellipse(x + w / 2, y + h / 2, w * 0.42, h * 0.4, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = i === 5 ? "#3a2a1a" : "#fff8e6"; g.fillRect(x + 14, y + h / 2 - 8, w - 28, 16);
  });
  return TX.tex(c);
}

// gig posters, sixteen to a sheet, eight across and two down
const PW = 1024, PH = 512;
const posterRect = (i: number): Rect => [(i % 8) * 128, Math.floor(i / 8) % 2 * 256, 128, 256];
function postersTex(): THREE.Texture {
  const [c, g] = TX.canvas(PW, PH), r = TX.rng(1753);
  const words = ["LIVE", "JAZZ", "FOLK", "OPEN MIC", "FUNK", "SKA", "BLUES", "SOUL", "DUB", "FRINGE", "QUIZ", "CEILIDH", "GIG", "REGGAE", "PUNK", "SWING"];
  const bgs = ["#e8d44d", "#d6452f", "#2e6fb5", "#f2ece0", "#1c1c1c", "#3e9a5a", "#e07fb0", "#f08a24"];
  for (let i = 0; i < 16; i++) {
    const [x, y, w, h] = posterRect(i), bg = bgs[i % bgs.length], dark = bg === "#1c1c1c" || bg === "#2e6fb5";
    g.fillStyle = bg; g.fillRect(x, y, w, h);
    const ink = dark ? "#f6f0dc" : "#141414", accent = ["#d6452f", "#f2ece0", "#1c1c1c", "#2e6fb5"][i % 4];
    // a picture: a sun, a guitar's round body, or bold stripes
    g.fillStyle = accent;
    if (i % 3 === 0) { g.beginPath(); g.arc(x + w / 2, y + 150, 34, 0, Math.PI * 2); g.fill(); }
    else if (i % 3 === 1) { g.beginPath(); g.ellipse(x + w / 2, y + 165, 26, 32, 0, 0, Math.PI * 2); g.fill(); g.fillRect(x + w / 2 - 4, y + 96, 8, 50); }
    else for (let s = 0; s < 4; s++) g.fillRect(x + 10, y + 118 + s * 22, w - 20, 10);
    g.fillStyle = ink; g.font = "bold 34px Impact, 'Arial Black', sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(words[i], x + w / 2, y + 52, w - 12);
    g.font = "bold 13px Arial, sans-serif";
    // the small print: who's on and when, as lines too small to read
    for (let l = 0; l < 4; l++) g.fillRect(x + 16 + r() * 10, y + 200 + l * 12, 70 + r() * 25, 4);
    g.fillText("THE BELL", x + w / 2, y + 88, w - 20);
  }
  return TX.pixelTex(c, 512, 256, 24, 103);
}

// the tops of the games, and other little pictures: one sheet
const GW = 512, GH = 512;
const GAME: Record<string, Rect> = {
  pool: [0, 0, 256, 128], billiards: [256, 0, 256, 128], football: [0, 128, 256, 128], chess: [256, 128, 128, 128],
  washer: [384, 128, 128, 128], rug: [0, 256, 256, 128], curtain: [256, 256, 128, 256], grille: [384, 256, 128, 128],
  keys: [0, 384, 256, 32], bottles: [0, 416, 256, 96], fridge: [384, 384, 128, 128],
};
function gamesTex(): THREE.Texture {
  const [c, g] = TX.canvas(GW, GH), r = TX.rng(9);
  const baize = ([x, y, w, h]: Rect, col: string) => { g.fillStyle = "#3a2414"; g.fillRect(x, y, w, h); g.fillStyle = col; g.fillRect(x + 10, y + 10, w - 20, h - 20); };
  const hole = (x: number, y: number, rad: number) => { g.fillStyle = "#0c0c0c"; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill(); };
  // the pool table: six pockets and a spot
  { const [x, y, w, h] = GAME.pool; baize(GAME.pool, "#1f7a45");
    for (const px of [x + 12, x + w / 2, x + w - 12]) for (const py of [y + 12, y + h - 12]) hole(px, py, 9);
    g.fillStyle = "#f4f4f4"; g.fillRect(x + w * 0.72, y + h / 2 - 1, 2, 2); }
  // bar billiards: no pockets round the edge, but holes in the bed at the far end, worth 10 to 200
  { const [x, y, w, h] = GAME.billiards; baize(GAME.billiards, "#21704a");
    const hx = x + w * 0.72;
    for (const [dx, dy] of [[0, 0], [-26, -22], [-26, 22], [24, -30], [24, 30], [46, 0], [-50, 0], [10, 0], [64, -16]]) hole(hx + dx, y + h / 2 + dy, 6);
    g.fillStyle = "#c9c9c9"; g.fillRect(x + w * 0.2, y + 14, 2, h - 28); }
  // table football: a pitch with its lines
  { const [x, y, w, h] = GAME.football; g.fillStyle = "#2c8a3a"; g.fillRect(x, y, w, h);
    for (let s = 0; s < 8; s++) { g.fillStyle = s % 2 ? "#2c8a3a" : "#33974a"; g.fillRect(x + (s * w) / 8, y, w / 8, h); }
    g.strokeStyle = "#f2f2f2"; g.lineWidth = 3; g.strokeRect(x + 8, y + 8, w - 16, h - 16);
    g.beginPath(); g.moveTo(x + w / 2, y + 8); g.lineTo(x + w / 2, y + h - 8); g.stroke();
    g.beginPath(); g.arc(x + w / 2, y + h / 2, 18, 0, Math.PI * 2); g.stroke();
    g.strokeRect(x + 8, y + h / 2 - 26, 26, 52); g.strokeRect(x + w - 34, y + h / 2 - 26, 26, 52); }
  // a chessboard
  { const [x, y, w] = GAME.chess, sq = w / 8;
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { g.fillStyle = (i + j) % 2 ? "#3b2a1c" : "#e6d6b4"; g.fillRect(x + i * sq, y + j * sq, sq, sq); } }
  // a washing machine's door
  { const [x, y, w, h] = GAME.washer; g.fillStyle = "#f1f1ee"; g.fillRect(x, y, w, h);
    g.fillStyle = "#a9adb1"; g.beginPath(); g.arc(x + w / 2, y + h / 2 + 8, 50, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#26425a"; g.beginPath(); g.arc(x + w / 2, y + h / 2 + 8, 38, 0, Math.PI * 2); g.fill();
    g.fillStyle = "rgba(255,255,255,0.35)"; g.beginPath(); g.arc(x + w / 2 - 12, y + h / 2 - 4, 12, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#555"; g.fillRect(x + 12, y + 8, 40, 10); g.beginPath(); g.arc(x + w - 22, y + 14, 8, 0, Math.PI * 2); g.fill(); }
  // a worn rug for the band
  { const [x, y, w, h] = GAME.rug; g.fillStyle = "#7a2230"; g.fillRect(x, y, w, h);
    g.strokeStyle = "#d9a441"; g.lineWidth = 6; g.strokeRect(x + 10, y + 10, w - 20, h - 20);
    g.fillStyle = "#1f3a5e"; g.beginPath(); g.moveTo(x + w / 2, y + 22); g.lineTo(x + w - 40, y + h / 2); g.lineTo(x + w / 2, y + h - 22); g.lineTo(x + 40, y + h / 2); g.closePath(); g.fill();
    for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(30,15,10,${r() * 0.25})`; g.fillRect(x + r() * w, y + r() * h, 3, 3); } }
  // the Back Bar's stage curtain
  { const [x, y, w, h] = GAME.curtain;
    for (let s = 0; s < w; s += 8) { const l = 0.75 + 0.25 * Math.sin(s / 3); g.fillStyle = `rgb(${Math.round(150 * l)},${Math.round(20 * l)},${Math.round(30 * l)})`; g.fillRect(x + s, y, 8, h); } }
  // an amplifier's front
  { const [x, y, w, h] = GAME.grille; g.fillStyle = "#151515"; g.fillRect(x, y, w, h);
    g.fillStyle = "#2a2a2a"; g.fillRect(x + 8, y + 26, w - 16, h - 34);
    for (let i = 0; i < 40; i++) { g.fillStyle = "#3a3a3a"; g.fillRect(x + 8, y + 26 + i * 3, w - 16, 1); }
    g.fillStyle = "#c9c9c9"; for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(x + 20 + i * 17, y + 13, 4, 0, Math.PI * 2); g.fill(); } }
  // a piano's keys
  { const [x, y, w, h] = GAME.keys; g.fillStyle = "#f3efe4"; g.fillRect(x, y, w, h);
    for (let i = 0; i < 36; i++) { g.fillStyle = "#8a8578"; g.fillRect(x + i * (w / 36), y, 1, h); if ([0, 1, 3, 4, 5].includes(i % 7)) { g.fillStyle = "#121212"; g.fillRect(x + i * (w / 36) + 4, y, 4, h * 0.6); } } }
  // the shelves behind the bar: bottles of every colour, optics on the top shelf
  { const [x, y, w, h] = GAME.bottles; g.fillStyle = "#2b1a10"; g.fillRect(x, y, w, h);
    for (const sy of [y + 30, y + 62, y + 94]) {
      g.fillStyle = "#6b4a2c"; g.fillRect(x, sy - 2, w, 4);
      for (let bx = x + 3; bx < x + w - 6; bx += 6 + r() * 4) {
        const bh = 14 + r() * 12, hue = [30, 120, 0, 45, 200, 280, 60][Math.floor(r() * 7)];
        g.fillStyle = `hsl(${hue},${40 + r() * 40}%,${25 + r() * 35}%)`; g.fillRect(bx, sy - 2 - bh, 5, bh); g.fillRect(bx + 1.5, sy - 2 - bh - 5, 2, 5);
      }
    } }
  // a fridge door, lit, full of bottles
  { const [x, y, w, h] = GAME.fridge; g.fillStyle = "#cfe3f0"; g.fillRect(x, y, w, h);
    for (const sy of [y + 40, y + 80, y + 120]) for (let bx = x + 6; bx < x + w - 8; bx += 10) { g.fillStyle = ["#6a3a12", "#2f6a2a", "#c8a24a", "#7a1a1a"][Math.floor(r() * 4)]; g.fillRect(bx, sy - 28, 7, 26); }
    g.strokeStyle = "#8a9aa6"; g.lineWidth = 6; g.strokeRect(x + 3, y + 3, w - 6, h - 6); }
  return TX.pixelTex(c, 256, 256, 28, 77);
}

/** One-over-one plate-glass sashes, lit after dark. */
function plateTex(lit: boolean): THREE.Texture {
  const W = 64, H = 112, [c, g] = TX.canvas(W, H);
  g.fillStyle = lit ? "#000" : "#ece6d6"; g.fillRect(0, 0, W, H);
  if (lit) g.fillStyle = "#ffcf8a";
  else { const grd = g.createLinearGradient(0, 0, W, H); grd.addColorStop(0, "#47555f"); grd.addColorStop(0.6, "#202b33"); grd.addColorStop(1, "#4d5e6c"); g.fillStyle = grd; }
  g.fillRect(5, 5, W - 10, H / 2 - 8); g.fillRect(5, H / 2 + 3, W - 10, H / 2 - 8);
  return TX.pixelTex(c, 32, 56, 20, 5);
}

/** Iron gates of spearheaded bars, cut out: the texture's width is a gate leaf, its height 2 m. */
function gateTex(): THREE.Texture {
  const [c, g] = TX.canvas(128, 128);
  g.clearRect(0, 0, 128, 128);
  g.fillStyle = "#e0e0e0";
  for (let x = 4; x < 128; x += 10) {
    g.fillRect(x, 16, 3, 112);
    g.beginPath(); g.moveTo(x - 3, 17); g.lineTo(x + 1.5, 4); g.lineTo(x + 6, 17); g.fill();
  }
  for (const y of [24, 70, 120]) g.fillRect(0, y, 128, 4);
  g.fillRect(0, 0, 4, 128); g.fillRect(124, 0, 4, 128);
  return TX.pixelTex(c, 64, 64, 8, 15, true);
}

/** Granite setts, for the yard: tile metres to a repeat. */
function settsTex(): THREE.Texture {
  const S = 128, [c, g] = TX.canvas(S, S), r = TX.rng(31);
  g.fillStyle = "#5d5b56"; g.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += 16) for (let x = -((y / 16) % 2) * 12; x < S; x += 24) {
    const l = 135 + r() * 55; g.fillStyle = `rgb(${l},${l - 3},${l - 10})`; g.fillRect(x + 1, y + 1, 22, 14);
  }
  return TX.pixelTex(c, 64, 64, 16, 37);
}

/** A faded painted sign on the stables' stone, for the old stabling and brewery: cut out of nothing. */
function ghostTex(): THREE.Texture {
  const [c, g] = TX.canvas(512, 128);
  g.clearRect(0, 0, 512, 128);
  g.fillStyle = "rgba(244,236,214,0.42)";
  g.font = "bold 50px Georgia, serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText("BELL BREWERY", 256, 38, 490);
  g.font = "bold 34px Georgia, serif";
  g.fillText("GOOD STABLING  ·  LOOSE BOXES", 256, 92, 490);
  // worn patches where the paint has gone
  g.globalCompositeOperation = "destination-out";
  const r = TX.rng(68);
  for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(0,0,0,${0.3 + r() * 0.6})`; g.beginPath(); g.arc(r() * 512, r() * 128, 4 + r() * 16, 0, Math.PI * 2); g.fill(); }
  return TX.tex(c);
}

// ---- the model ---------------------------------------------------------------------------------

export function bell(): THREE.Object3D {
  const k = new Kit();
  // materials: stone, the pub's red paint and its gold, timber, slate, and the warm inside
  const S = stone("#e6d2a4"), S2 = stone("#d2bc8e"), RUB = stone("#b9a684"), roofS = slate();
  const red = plain("#7b2a22"), red2 = plain("#5e1d18");
  const iron = plain("#1e1e1e"), wood = plain("#5a3b22"), dark = plain("#33221a"), oak = plain("#7a5634");
  const brass = plain("#c9a04a", { side: THREE.DoubleSide }), chrome = plain("#c4c8cc"), black = plain("#141414");
  const white = plain("#ecebe6"), lead = plain("#6c7378"), lime = plain("#e2d8c2"), green = plain("#4e6b34");
  const terracotta = plain("#a8573a");
  const plaster = plain("#d4ae7a", { emissive: "#ffb46b", emissiveIntensity: 0 });
  const floorM = new THREE.MeshLambertMaterial({ map: once("boards", () => TX.boards()), color: "#86593a", emissive: "#ff9a52", emissiveIntensity: 0 });
  const flagM = flags(), setts = new THREE.MeshLambertMaterial({ map: once("setts", settsTex) });
  const glass = plain("#a7c2ca", { transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false });
  const canopy = plain("#d6e4e6", { transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false });
  const plate = new THREE.MeshLambertMaterial({ map: once("plate", () => plateTex(false)), emissiveMap: once("plateg", () => plateTex(true)), emissive: "#ffffff", emissiveIntensity: 0 });
  const lamp = plain("#ffe3a6", { emissive: "#ffcf80", emissiveIntensity: 0 });
  const fire = plain("#ff9a40", { emissive: "#ff6a1a", emissiveIntensity: 0 });
  const signs = new THREE.MeshLambertMaterial({ map: once("signs", signsTex), polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  const posters = new THREE.MeshLambertMaterial({ map: once("posters", postersTex), polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  const games = new THREE.MeshLambertMaterial({ map: once("games", gamesTex), polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  const fridge = new THREE.MeshLambertMaterial({ map: once("games", gamesTex), emissive: "#cfe6ff", emissiveIntensity: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  const gates = new THREE.MeshLambertMaterial({ map: once("gate", gateTex), color: "#2a2a2a", alphaTest: 0.5, side: THREE.DoubleSide });
  const ghost = new THREE.MeshLambertMaterial({ map: once("ghost", ghostTex), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });

  /** A picture from a sheet (sign, poster or game) of w by h, facing +z turned ry. */
  const pic = (mat: THREE.Material, W: number, H: number, r: Rect, x: number, y: number, z: number, w: number, h: number, ry = 0) =>
    k.quad(mat, x, y, z, w, h, ry, ...uvOf(W, H, r));
  /** The same, lying face up: w along x and d along z, or (turned) w along z and d along x. */
  const flat = (mat: THREE.Material, W: number, H: number, r: Rect, x: number, y: number, z: number, w: number, d: number, turned = false) => {
    const g = new THREE.PlaneGeometry(w, d), [u0, v0, u1, v1] = uvOf(W, H, r), uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) ? u1 : u0, uv.getY(i) ? v1 : v0);
    k.add(mat, g, x, y, z, 0, 0, -Math.PI / 2, turned ? Math.PI / 2 : 0);
  };
  const poster = (i: number, x: number, y: number, z: number, ry: number, s = 1) => pic(posters, PW, PH, posterRect(i), x, y, z, 0.42 * s, 0.6 * s, ry);
  type Hole = [number, number, number, number];   // from, to along the wall, its foot, its head
  /** A wall along x (from a0 to a1; b0..b1 its thickness in z) or along z, from y0 to y1, with holes through it. */
  const wall = (mat: THREE.Material, alongX: boolean, a0: number, a1: number, y0: number, y1: number, b0: number, b1: number, holes: Hole[] = []) => {
    const cuts = [...new Set([a0, a1, ...holes.flatMap((h) => [h[0], h[1]])])].filter((v) => v >= a0 && v <= a1).sort((p, q) => p - q);
    for (let i = 0; i < cuts.length - 1; i++) {
      const s0 = cuts[i], s1 = cuts[i + 1], mid = (s0 + s1) / 2;
      const piece = (lo: number, hi: number) => {
        if (hi - lo < 1e-3) return;
        if (alongX) k.slab(mat, s0, s1, lo, hi, b0, b1); else k.slab(mat, b0, b1, lo, hi, s0, s1);
      };
      let y = y0;
      for (const h of holes.filter((h) => h[0] <= mid && h[1] >= mid).sort((p, q) => p[2] - q[2])) { piece(y, h[2]); y = Math.max(y, h[3]); }
      piece(y, y1);
    }
  };
  const lying = (mat: THREE.Material, r: number, len: number, x: number, y: number, z: number, alongX: boolean, seg = 12) =>
    k.add(mat, new THREE.CylinderGeometry(r, r, len, seg), x, y, z, 0, 0, alongX ? 0 : Math.PI / 2, alongX ? Math.PI / 2 : 0);

  // ---- the house: the pub front ---------------------------------------------------------------------
  // the ground floor: four window bays and the door between them, between red pilasters
  for (const px of [-4.08, -1.36, 1.36, 4.08]) {
    k.slab(red, px - 0.18, px + 0.18, -1, 2.95, -0.3, 0.12);
    k.slab(red2, px - 0.22, px + 0.22, -1, 0.3, -0.3, 0.16);
    k.slab(red2, px - 0.23, px + 0.23, 2.8, 2.95, -0.3, 0.17);
  }
  for (const s of [-1, 1]) {   // the ends, broader
    k.slab(red, s > 0 ? HX - 0.5 : -HX, s > 0 ? HX : -HX + 0.5, -1, 2.95, -0.3, 0.12);
    k.slab(red2, s > 0 ? HX - 0.55 : -HX, s > 0 ? HX : -HX + 0.55, 2.8, 2.95, -0.3, 0.17);
  }
  // a window bay: a stall riser, plate glass with a transom of little lights above, a deep sill
  // inside, and a gig poster stuck in the corner of the glass
  let stuck = 3;
  const windowBay = (x0: number, x1: number) => {
    k.slab(red, x0, x1, -1, 0.8, -0.28, -0.04);
    k.slab(red2, x0, x1, 0.8, 0.88, -0.3, 0.08);
    k.quad(glass, (x0 + x1) / 2, 1.8, -0.15, x1 - x0, 1.84);
    k.slab(red, x0, x1, 2.25, 2.33, -0.2, -0.1);
    for (let i = 1; i < 4; i++) { const x = x0 + ((x1 - x0) * i) / 4; k.slab(red, x - 0.025, x + 0.025, 2.33, 2.72, -0.19, -0.11); }
    k.slab(red, (x0 + x1) / 2 - 0.04, (x0 + x1) / 2 + 0.04, 0.88, 2.25, -0.2, -0.1);
    k.slab(red, x0, x1, 2.72, 2.95, -0.28, -0.02);
    k.slab(oak, x0, x1, 0.74, 0.82, -0.5, -0.28);
    k.slab(plaster, x0, x1, -1, 0.74, -0.5, -0.28);
    poster(stuck, stuck % 2 ? x1 - 0.35 : x0 + 0.35, 1.22, -0.16, 0, 0.75);
    stuck += 5;
  };
  for (const [a, b] of [[-HX + 0.5, -4.26], [-3.9, -1.54], [1.54, 3.9], [4.26, HX - 0.5]]) windowBay(a, b);
  // the fascia either side of the doorway, and the cornice over the whole front
  for (const [a, b, sign] of [[-HX, -1.36, "bell"], [1.36, HX, "music"]] as const) {
    k.slab(red, a, b, 2.95, 3.55, -0.3, 0.16);
    pic(signs, SW, SH, SIGN[sign], (a + b) / 2, 3.25, 0.165, b - a - 0.3, 0.5);
  }
  k.slab(red2, -HX - 0.1, HX + 0.1, 3.55, FIRST, -0.3, 0.3);
  k.slab(plaster, -HX + 0.5, HX - 0.5, 2.72, CEIL, -0.5, -0.28);
  // the doorway: heavily rusticated, a flat arch with a keystone, and the stepped hood on shaped brackets
  {
    const DW = 0.62, DH = 2.35;
    for (const s of [-1, 1]) {
      k.slab(S2, s > 0 ? DW : -1.3, s > 0 ? 1.3 : -DW, -1, DH, -0.3, 0.12);
      for (let i = 0; i < 6; i++) {
        const y = -0.05 + i * 0.4, far = i % 2 ? 1.08 : 1.26;
        k.slab(S, s > 0 ? DW : -far, s > 0 ? far : -DW, y, y + 0.36, -0.3, 0.24);
      }
      // the inside of the doorway
      k.slab(plaster, s > 0 ? DW : -1.36, s > 0 ? 1.36 : -DW, -1, CEIL, -0.5, -0.3);
    }
    for (let i = -3; i <= 3; i++) {   // the voussoirs of the flat arch, the middle one the keystone
      const x = i * 0.25, kst = i === 0;
      k.slab(kst ? S2 : S, x - 0.115, x + 0.115, DH, DH + (kst ? 0.72 : 0.55), -0.3, kst ? 0.32 : 0.24);
    }
    k.slab(S, -1.3, -0.87, DH, DH + 0.55, -0.3, 0.24); k.slab(S, 0.87, 1.3, DH, DH + 0.55, -0.3, 0.24);
    k.slab(S2, -1.36, 1.36, DH + 0.55, 3.08, -0.3, 0.14);
    k.slab(plaster, -DW, DW, DH, CEIL, -0.5, -0.3);
    // the hood, stepping out in three courses
    k.slab(S, -1.45, 1.45, 3.08, 3.2, -0.3, 0.46);
    k.slab(S2, -1.55, 1.55, 3.2, 3.32, -0.3, 0.6);
    k.slab(S, -1.66, 1.66, 3.32, 3.5, -0.3, 0.74);
    // its brackets: scrolled consoles under each end
    const sh = new THREE.Shape();
    sh.moveTo(0, 0); sh.lineTo(0, 0.82); sh.lineTo(0.62, 0.82);
    sh.quadraticCurveTo(0.6, 0.5, 0.32, 0.42); sh.quadraticCurveTo(0.14, 0.36, 0.16, 0.12); sh.quadraticCurveTo(0.12, 0, 0, 0);
    for (const x of [-1.38, 1.38]) k.shape(S2, sh, 0.2, x, 2.26, 0.12, -Math.PI / 2, 1);
    // the step, the door standing open inside, and a lamp under the hood
    k.slab(S2, -0.95, 0.95, -1, 0, -0.3, 0.42);
    k.slab(red2, DW - 0.08, DW, 0, 2.3, -1.55, -0.5);
    for (const y of [0.6, 1.6]) k.quad(red, DW - 0.085, y, -1.02, 0.85, 0.7, -Math.PI / 2);
    k.cyl(iron, 0, 2.98, 0.53, 0.015, 0.22, 4);
    k.box(lamp, 0, 2.68, 0.53, 0.16, 0.3, 0.16);
  }
  // the floor, and the front strip of flagstones down to the pavement, all the way to the yard
  k.slab(floorM, -HX, HX, -1, 0, HZ, -0.28, 2);
  const strip = (x0: number, x1: number, z0: number) => k.slab(flagM, x0, x1, -1.2, pave((x0 + x1) / 2) - 0.01, z0, 0.9);
  for (let x = YX0; x < HX - 1e-6; x += 1) {
    const x1 = Math.min(HX, x + 1);
    if (x1 <= -0.95 || x >= 0.95) strip(x, x1, x1 <= SX ? 0.3 : 0);     // (in the yard's mouth, from its setts)
    else { if (x < -0.95) strip(x, -0.95, 0); if (x1 > 0.95) strip(0.95, x1, 0); }
  }
  strip(-0.95, 0.95, 0.42);                                               // (in front of the step)

  // ---- the house above: ashlar, five bays of plate-glass sashes, the parapet and the roof ---------------
  k.slab(S, -HX, HX, CEIL, EAVES, HZ, 0, 3);
  k.slab(plaster, -HX + 0.5, HX - 0.5, CEIL - 0.06, CEIL - 0.01, HZ + 0.5, -0.5);
  k.slab(S2, -HX - 0.05, HX + 0.05, 6.88, 7.03, -0.1, 0.08);           // the string course
  for (const x of BAYS) {
    // first floor: tall, with an architrave and a sill
    k.quad(plate, x, 5.25, 0.012, 1.12, 2.0);
    k.slab(S2, x - 0.7, x - 0.56, 4.2, 6.32, -0.05, 0.07); k.slab(S2, x + 0.56, x + 0.7, 4.2, 6.32, -0.05, 0.07);
    k.slab(S2, x - 0.7, x + 0.7, 6.25, 6.4, -0.05, 0.09);
    k.slab(S2, x - 0.72, x + 0.72, 4.12, 4.25, -0.05, 0.14);
    // second floor: shorter
    k.quad(plate, x, 8.05, 0.012, 1.12, 1.45);
    k.slab(S2, x - 0.68, x - 0.56, 7.27, 8.83, -0.05, 0.06); k.slab(S2, x + 0.56, x + 0.68, 7.27, 8.83, -0.05, 0.06);
    k.slab(S2, x - 0.68, x + 0.68, 8.78, 8.9, -0.05, 0.07);
    k.slab(S2, x - 0.7, x + 0.7, 7.2, 7.32, -0.05, 0.12);
  }
  // round the back, over the garden: plainer windows, rubble walls
  for (const x of [-4.5, -1.5]) k.quad(plate, x, 5.2, HZ - 0.012, 1.0, 1.8, Math.PI);
  for (const x of [-4.5, -1.5, 1.5, 4.5]) k.quad(plate, x, 8.0, HZ - 0.012, 1.0, 1.4, Math.PI);
  // the cornice, the parapet and its coping
  k.slab(S2, -HX - 0.12, HX + 0.12, EAVES - 0.15, EAVES + 0.15, -0.3, 0.32);
  k.slab(S, -HX, HX, EAVES + 0.15, EAVES + 0.8, -0.35, 0.02);
  k.slab(S2, -HX - 0.05, HX + 0.05, EAVES + 0.8, EAVES + 0.9, -0.4, 0.07);
  k.slab(lead, -HX, HX, EAVES - 0.2, EAVES, HZ - 0.25, HZ);            // the gutter at the back
  k.roof(roofS, -HX, HX, EAVES, HZ - 0.2, -0.35, 3.0);
  // dormers in the front slope, and the chimney stacks on the gables, the one to the south shared
  for (const x of [-2.72, 2.72]) {
    k.slab(S, x - 0.75, x + 0.75, EAVES + 0.4, EAVES + 2.0, -3.6, -1.6);
    k.quad(plate, x, EAVES + 1.15, -1.588, 0.85, 1.0);
    k.roof(roofS, x - 0.9, x + 0.9, EAVES + 2.0, -3.7, -1.45, 0.55, true);
  }
  for (const x of [-HX + 0.45, HX - 0.45]) {
    k.box(S2, x, EAVES + 1.6, -5.2, 0.95, 3.3, 1.9);
    k.slab(S, x - 0.55, x + 0.55, EAVES + 4.9, EAVES + 5.05, -6.2, -4.2);
    for (const z of [-5.8, -5.2, -4.6]) k.cyl(terracotta, x, EAVES + 5.05, z, 0.13, 0.5, 8, 0.1);
  }
  // the sign on the south gable, over the stables' roof, to be read from up the street
  pic(signs, SW, SH, SIGN.inn, -HX - 0.03, 8.55, -5.0, 6.6, 1.45, -Math.PI / 2);
  // the bell, hanging from its iron bracket over the pavement
  {
    const bx = -4.08, by = 4.75;
    k.slab(iron, bx - 0.07, bx + 0.07, by - 0.25, by + 0.25, 0, 0.05);
    k.beam(iron, [bx, by, 0.04], [bx, by, 1.55], 0.05, 0.06);
    k.beam(iron, [bx, by - 0.65, 0.04], [bx, by, 1.05], 0.035, 0.035);
    k.add(iron, new THREE.TorusGeometry(0.16, 0.018, 4, 12, Math.PI), bx, by - 0.02, 0.62, Math.PI / 2, 0, 0, Math.PI);
    k.cyl(iron, bx, by - 0.32, 1.35, 0.015, 0.32, 4);
    const prof = [[0.0, 0.66], [0.11, 0.66], [0.17, 0.62], [0.2, 0.52], [0.22, 0.34], [0.27, 0.16], [0.34, 0.05], [0.37, 0.0], [0.33, 0.02], [0.26, 0.12], [0.2, 0.3], [0.17, 0.5], [0.0, 0.58]];
    k.add(brass, new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 18), bx, by - 1.0, 1.35);
    k.add(brass, new THREE.SphereGeometry(0.07, 8, 6), bx, by - 0.98, 1.35);
    k.cyl(brass, bx, by - 0.4, 1.35, 0.05, 0.08, 8);
  }

  // ---- the old stables beside it (the games room), with the ghost of their sign -----------------------
  for (const px of [-15.8, -12.8, -9.8]) {
    k.slab(red, px - 0.18, px + 0.18, -1, 2.95, -0.3, 0.12);
    k.slab(red2, px - 0.22, px + 0.22, -1, 0.3, -0.3, 0.16);
    k.slab(red2, px - 0.23, px + 0.23, 2.8, 2.95, -0.3, 0.17);
  }
  k.slab(red, SX, SX + 0.45, -1, 2.95, -0.3, 0.12);
  k.slab(red2, SX, SX + 0.5, 2.8, 2.95, -0.3, 0.17);
  for (const [a, b] of [[SX + 0.45, -15.98], [-15.62, -12.98], [-12.62, -9.98], [-9.62, -HX]]) windowBay(a, b);
  k.slab(red, SX, -HX, 2.95, 3.55, -0.3, 0.16);
  pic(signs, SW, SH, SIGN.games, (SX - HX) / 2, 3.25, 0.165, -HX - SX - 0.6, 0.5);
  k.slab(red2, SX - 0.1, -HX, 3.55, FIRST, -0.3, 0.3);
  k.slab(plaster, SX + 0.5, -HX, 2.72, CEIL, -0.5, -0.28);
  k.slab(RUB, SX, -HX, CEIL, 5.4, SZ, 0, 3);
  k.quad(ghost, -12.8, 4.55, 0.012, 9.0, 1.3);
  k.slab(S2, SX - 0.05, -HX, 5.3, 5.48, -0.12, 0.2);
  k.roof(roofS, SX - 0.15, -HX, 5.4, SZ - 0.25, 0.25, 1.9);
  k.slab(floorM, SX, -HX, -1, 0, SZ, -0.28, 2);
  k.slab(plaster, SX + 0.5, -HX, CEIL - 0.06, CEIL - 0.01, SZ + 0.5, -0.5);
  // its south wall, on the yard, stone without and plaster within, with a little window up in the loft
  k.slab(RUB, SX, SX + 0.25, -1, CEIL, SZ, -0.3, 3);
  k.slab(plaster, SX + 0.25, SX + 0.5, -1, CEIL, SZ + 0.5, -0.3);
  k.quad(plate, SX - 0.012, 4.4, -2.8, 0.7, 0.9, -Math.PI / 2);
  // its back, on the garden: two little windows over the terrace
  k.slab(RUB, SX, -HX, -1, CEIL, SZ, SZ + 0.25, 3);
  k.slab(plaster, SX + 0.5, -HX, -1, CEIL, SZ + 0.25, SZ + 0.5);
  for (const x of [-15.5, -10.5]) k.quad(plate, x, 4.45, SZ - 0.012, 0.7, 0.9, Math.PI);

  // ---- the walls of the house's ground floor --------------------------------------------------------
  wall(plaster, false, HZ, -0.3, -1, CEIL, -HX, -HX + 0.5, [[-2.5, -1.0, 0, 2.3]]);      // to the games room
  wall(plaster, false, HZ, -0.3, -1, CEIL, HX - 0.5, HX);                                   // the north wall
  wall(RUB, true, -HX, HX, -1, CEIL, HZ, HZ + 0.25, [[3.0, 4.6, 0, 2.3]]);                  // the back, on the garden
  wall(plaster, true, -HX + 0.5, HX - 0.5, -1, CEIL, HZ + 0.25, HZ + 0.5, [[3.0, 4.6, 0, 2.3]]);

  // ---- the main bar --------------------------------------------------------------------------------
  {
    // ceiling beams, chamfered and boxed in, and the big one along the room
    for (const x of [-4.08, -1.36, 1.36, 4.08]) k.slab(dark, x - 0.13, x + 0.13, 3.08, CEIL - 0.06, HZ + 0.5, -0.5);
    k.slab(dark, -HX + 0.5, HX - 0.5, 3.0, CEIL - 0.06, -5.2, -4.85);
    // the long bar: its front, its top, the brass foot rail
    const BA = -5.0, BB = 2.4, BZF = -6.05;
    k.slab(wood, BA, BB, 0, 1.0, -6.55, BZF);
    for (let x = BA + 0.45; x < BB - 0.2; x += 0.9) k.slab(dark, x - 0.04, x + 0.04, 0.12, 0.92, BZF, BZF + 0.03);
    k.slab(oak, BA - 0.1, BB + 0.1, 1.0, 1.07, -6.65, BZF + 0.12);
    lying(brass, 0.03, BB - BA, (BA + BB) / 2, 0.16, BZF + 0.12, true, 6);
    // six hand pumps with their clips, two keg fonts, the till
    for (let i = 0; i < 6; i++) {
      const x = -3.9 + i * 0.75;
      k.cyl(brass, x, 1.07, -6.38, 0.05, 0.2, 8);
      k.box(black, x, 1.27, -6.38, 0.05, 0.38, 0.05, 0, 1);
      pic(signs, SW, SH, clipRect(i), x, 1.52, -6.353, 0.09, 0.15);
    }
    for (const x of [1.1, 1.75]) { k.cyl(chrome, x, 1.07, -6.38, 0.04, 0.34, 8); k.box(chrome, x, 1.38, -6.38, 0.34, 0.07, 0.07, 0, 1); }
    k.box(black, -4.55, 1.07, -6.42, 0.4, 0.26, 0.32, 0, 1);
    // the bell for last orders, on a bracket over the bar
    k.beam(iron, [2.25, 3.05, -6.35], [2.25, 2.7, -6.35], 0.03, 0.03);
    k.add(brass, new THREE.LatheGeometry([[0, 0.2], [0.05, 0.2], [0.08, 0.15], [0.1, 0.05], [0.12, 0], [0.1, 0.01], [0.07, 0.12], [0, 0.17]].map(([r, y]) => new THREE.Vector2(r, y)), 12), 2.25, 2.5, -6.35);
    // the back counter, the fridges under it and the shelves of bottles over it
    k.slab(wood, -HX + 0.5, BB, 0, 0.95, HZ + 0.5, HZ + 1.1);
    k.slab(oak, -HX + 0.5, BB, 0.95, 1.0, HZ + 0.5, HZ + 1.15);
    for (const x of [-4.4, -2.6, -0.8]) pic(fridge, GW, GH, GAME.fridge, x, 0.47, HZ + 1.115, 1.6, 0.8);
    pic(games, GW, GH, GAME.bottles, (-HX + 0.5 + BB) / 2, 1.85, HZ + 0.52, BB + HX - 0.6, 1.6);
    for (const y of [1.36, 1.76, 2.16, 2.62]) k.slab(oak, -HX + 0.5, BB, y - 0.03, y, HZ + 0.5, HZ + 0.75);
    // pendant lights over the bar
    for (const x of [-3.4, -1.0, 1.4]) {
      k.cyl(iron, x, 2.55, -6.3, 0.008, CEIL - 2.55, 4);
      k.cyl(brass, x, 2.38, -6.3, 0.2, 0.18, 10, 0.06);
      k.add(lamp, new THREE.SphereGeometry(0.07, 8, 6), x, 2.37, -6.3);
    }
    // stools along the bar
    for (const x of [-4.2, -2.8, -1.4, 0, 1.4]) { k.cyl(dark, x, 0, -5.5, 0.04, 0.68, 6); k.cyl(oak, x, 0.68, -5.5, 0.19, 0.06, 10); k.cyl(dark, x, 0.25, -5.5, 0.17, 0.03, 8); }
    // settles under the front windows, with tables (a chessboard on one) and stools
    for (const [a, b] of [[-HX + 0.5, -1.4], [1.4, 3.5]]) {
      k.slab(dark, a, b, 0, 0.42, -1.05, -0.55);
      k.slab(oak, a, b, 0.42, 0.47, -1.08, -0.5);
      k.slab(dark, a, b, 0.47, 0.76, -0.62, -0.5);
    }
    const table = (x: number, z: number, w = 0.8, d = 0.65) => { k.slab(oak, x - w / 2, x + w / 2, 0.7, 0.75, z - d / 2, z + d / 2); k.cyl(dark, x, 0, z, 0.05, 0.7, 6); k.slab(dark, x - 0.25, x + 0.25, 0, 0.04, z - 0.2, z + 0.2); };
    const stool = (x: number, z: number) => { k.cyl(dark, x, 0, z, 0.16, 0.42, 8, 0.12); k.cyl(oak, x, 0.42, z, 0.18, 0.05, 10); };
    for (const x of [-5.0, -2.7, 2.45]) { table(x, -1.75); stool(x, -2.55); }
    flat(games, GW, GH, GAME.chess, -2.7, 0.752, -1.75, 0.42, 0.42);
    k.cyl(oak, -2.2, 0.72, -3.9, 0.55, 0.05, 16); k.cyl(dark, -2.2, 0, -3.9, 0.06, 0.72, 6);
    for (const a of [0.4, 2.5, 4.6]) stool(-2.2 + Math.cos(a) * 0.95, -3.9 + Math.sin(a) * 0.95);
    // the corner where the bands play: a low stage along the north wall, with a step up at its
    // side, a rug, a drum kit, amps, a guitar on its stand and the mics
    const ST = 0.5;
    k.slab(dark, 3.8, HX - 0.5, 0, ST - 0.04, -4.5, -0.6);
    k.slab(oak, 3.78, HX - 0.5, ST - 0.04, ST, -4.52, -0.6);
    k.slab(dark, 3.4, 3.8, 0, ST / 2, -3.3, -2.1);
    flat(games, GW, GH, GAME.rug, 5.05, ST + 0.012, -2.55, 2.3, 3.4);
    drumKit(5.55, ST, -2.6);
    for (const z of [-1.0, -4.0]) { k.box(black, 5.95, ST, z, 0.36, 0.62, 0.62); pic(games, GW, GH, GAME.grille, 5.765, ST + 0.31, z, 0.6, 0.6, -Math.PI / 2); }
    for (const z of [-1.5, -3.3]) { k.cyl(chrome, 4.25, ST, z, 0.012, 1.48, 4); k.cyl(chrome, 4.25, ST, z, 0.16, 0.02, 8); k.cyl(black, 4.2, ST + 1.45, z, 0.025, 0.12, 6); }
    guitar(5.75, ST + 0.62, -1.75);
    // the rest of the north wall: the piano, the chimney breast with the wood burner and its hearth,
    // and the log store in the corner
    k.slab(dark, 5.5, HX - 0.5, 0, 1.3, -6.1, -4.5);
    k.slab(dark, 5.28, 5.5, 0.68, 0.74, -6.05, -4.55);
    flat(games, GW, GH, GAME.keys, 5.39, 0.745, -5.3, 1.36, 0.2, true);
    k.slab(dark, 5.28, 5.36, 0, 0.68, -6.05, -5.95); k.slab(dark, 5.28, 5.36, 0, 0.68, -4.65, -4.55);
    stool(4.75, -5.3);
    k.slab(plaster, 5.5, HX - 0.5, 0, CEIL, -8.5, -6.1);
    k.slab(S2, 4.85, 5.5, 0, 0.04, -8.3, -6.3);
    k.box(black, 5.2, 0.04, -7.3, 0.5, 0.62, 0.56);
    k.quad(fire, 4.948, 0.36, -7.3, 0.32, 0.22, -Math.PI / 2);
    k.cyl(black, 5.2, 0.66, -7.3, 0.075, 1.5, 8);
    k.slab(dark, 5.35, HX - 0.5, 1.45, 1.55, -8.6, -6.0);           // the mantel shelf
    k.slab(oak, 5.5, HX - 0.5, 0, 0.9, HZ + 0.5, -8.5);
    for (const x of [5.65, 5.9, 6.15]) lying(wood, 0.08, 0.85, x, 0.98, -9.0, false, 6);
    // the chalkboard, posters on every wall, and lamps on the walls
    pic(signs, SW, SH, SIGN.chalk, -HX + 0.52, 1.7, -4.0, 1.3, 0.9, Math.PI / 2);
    let n = 0;
    for (const [z, y] of [[-2.8, 2.65], [-3.3, 2.65], [-4.7, 2.7], [-5.3, 1.6], [-5.3, 2.5], [-5.8, 2.75], [-3.0, 1.1], [-4.9, 1.0]]) poster(n++, -HX + 0.515, y, z, Math.PI / 2);
    for (const [z, y] of [[-0.8, 2.0], [-1.4, 2.6], [-2.1, 2.1], [-2.7, 2.75], [-3.3, 2.15], [-3.9, 2.7], [-4.5, 2.05], [-5.4, 2.45], [-9.05, 2.3]]) poster(n++, HX - 0.515, y, z, -Math.PI / 2);
    for (const x of [-5.6, -4.0, -2.2, -0.4, 1.4]) poster(n++, x, 3.0, HZ + 0.52, 0, 0.6);
    for (const [x, y, z] of [[-HX + 0.56, 2.5, -4.0], [-HX + 0.56, 2.25, -7.5], [HX - 0.56, 2.3, -4.2]]) k.box(lamp, x, y, z, 0.12, 0.18, 0.14);
  }

  // ---- the games room ------------------------------------------------------------------------------
  {
    const GX0 = SX + 0.5, GX1 = -HX, GZ0 = SZ + 0.5;   // its inside: south, north, back
    for (const x of [-15.8, -12.8, -9.8]) k.slab(dark, x - 0.13, x + 0.13, 3.06, CEIL - 0.06, GZ0, -0.5);
    // pool, bar billiards and table football
    const bed = (x: number, z: number, w: number, d: number, top: Rect) => {
      k.slab(dark, x - w / 2, x + w / 2, 0.18, 0.74, z - d / 2, z + d / 2);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.slab(dark, x + sx * (w / 2 - 0.15) - 0.08, x + sx * (w / 2 - 0.15) + 0.08, 0, 0.18, z + sz * (d / 2 - 0.15) - 0.08, z + sz * (d / 2 - 0.15) + 0.08);
      k.slab(wood, x - w / 2 - 0.06, x + w / 2 + 0.06, 0.74, 0.8, z - d / 2 - 0.06, z + d / 2 + 0.06);
      flat(games, GW, GH, top, x, 0.802, z, w, d);
    };
    bed(-15.0, -2.6, 2.2, 1.15, GAME.pool);
    for (const [dx, dz, col] of [[0.4, 0, "#f4f4f4"], [-0.5, 0.1, "#c8302a"], [-0.6, -0.15, "#e8c22a"], [-0.35, 0.25, "#c8302a"], [-0.7, 0.2, "#141414"]] as const) k.add(plain(col), new THREE.SphereGeometry(0.03, 8, 6), -15.0 + dx, 0.835, -2.6 + dz);
    bed(-9.7, -3.35, 2.5, 0.85, GAME.billiards);
    for (const [dx, dz] of [[0.45, 0.12], [0.45, -0.12], [0.75, 0]]) { k.cyl(white, -9.7 + dx, 0.8, -3.35 + dz, 0.025, 0.05, 6); k.add(white, new THREE.SphereGeometry(0.035, 6, 4), -9.7 + dx, 0.86, -3.35 + dz); }
    k.cyl(black, -8.92, 0.8, -3.35, 0.03, 0.06, 6);
    k.box(dark, -8.25, 0.8, -3.35, 0.12, 0.25, 0.85);                // the back board, where the score's kept
    // table football: the pitch under its rods, the little men on them, handles each side
    {
      const x = -12.1, z = -1.55;
      k.slab(wood, x - 0.62, x + 0.62, 0.58, 0.9, z - 0.38, z + 0.38);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.slab(dark, x + sx * 0.5 - 0.05, x + sx * 0.5 + 0.05, 0, 0.58, z + sz * 0.28 - 0.05, z + sz * 0.28 + 0.05);
      flat(games, GW, GH, GAME.football, x, 0.902, z, 1.1, 0.64);
      for (let i = 0; i < 8; i++) {
        const rx = x - 0.48 + (i * 0.96) / 7, team = [0, 0, 1, 0, 1, 0, 1, 1][i];
        lying(chrome, 0.012, 1.3, rx, 0.98, z, false, 4);
        k.cyl(black, rx, 0.98, z + (team ? 0.66 : -0.66) - 0.06, 0.03, 0.12, 6);
        const men = [1, 2, 5, 3, 3, 5, 2, 1][i];
        for (let m = 0; m < men; m++) k.box(plain(team ? "#2a55b0" : "#c8302a"), rx, 0.9, z - 0.28 + ((m + 0.5) * 0.56) / men, 0.04, 0.12, 0.03);
      }
    }
    // the launderette in the corner: two machines, a basket, and its sign
    for (const z of [-3.4, -4.25]) { k.box(white, GX0 + 0.3, 0, z, 0.6, 0.86, 0.62); pic(games, GW, GH, GAME.washer, GX0 + 0.602, 0.48, z, 0.5, 0.5, Math.PI / 2); }
    k.box(plain("#4a7ab0"), GX0 + 0.35, 0.86, -3.8, 0.45, 0.25, 0.35);
    pic(signs, SW, SH, SIGN.laund, GX0 + 0.012, 1.55, -3.8, 1.3, 0.25, Math.PI / 2);
    // a bench along the back, cues in their rack, posters everywhere
    k.slab(dark, -17.0, -12.6, 0, 0.42, GZ0 - 0.45, GZ0); k.slab(oak, -17.0, -12.6, 0.42, 0.47, GZ0 - 0.48, GZ0);
    for (let i = 0; i < 5; i++) k.beam(oak, [-12.15 + i * 0.09, 0.2, GZ0 - 0.04], [-12.15 + i * 0.09, 1.65, GZ0 - 0.06], 0.025, 0.025);
    k.slab(dark, -12.25, -11.7, 1.55, 1.62, GZ0 - 0.1, GZ0);
    let n = 16;
    for (const [x, y] of [[-17.4, 2.2], [-16.6, 1.6], [-15.8, 2.4], [-14.0, 2.1], [-13.2, 2.6], [-11.0, 2.2], [-10.2, 1.5], [-9.4, 2.4], [-8.4, 1.9], [-7.6, 2.6]]) poster(n++, x, y, GZ0 + 0.015, 0);
    for (const [z, y] of [[-1.2, 2.0], [-2.0, 2.5], [-2.6, 1.8]]) poster(n++, GX0 + 0.015, y, z, Math.PI / 2);
    for (const [z, y] of [[-3.0, 2.2], [-3.8, 2.6], [-4.5, 1.9]]) poster(n++, GX1 - 0.015, y, z, -Math.PI / 2);
    for (const [x, z] of [[-15.0, -2.6], [-9.7, -3.35]]) { k.cyl(iron, x, 2.75, z, 0.008, CEIL - 2.75, 4); k.box(dark, x, 2.62, z, 1.2, 0.12, 0.35); k.box(lamp, x, 2.58, z, 1.1, 0.04, 0.28); }
  }

  // ---- the yard: its gatepiers and gates, the setts climbing to the garden, barrels at the bottom ------
  {
    const pier = (cx: number) => {
      k.slab(S2, cx - 0.4, cx + 0.4, -1.2, 0.05, -0.38, 0.38);
      k.slab(S2, cx - 0.29, cx + 0.29, 0.05, 2.18, -0.29, 0.29);
      for (let i = 0; i < 6; i++) { const y = 0.07 + i * 0.355; k.slab(S, cx - 0.32, cx + 0.32, y, y + 0.32, -0.32, 0.32); }
      k.slab(S2, cx - 0.42, cx + 0.42, 2.18, 2.3, -0.42, 0.42);
      k.slab(S, cx - 0.38, cx + 0.38, 2.3, 2.4, -0.38, 0.38);
      k.add(S2, new THREE.ConeGeometry(0.47, 0.55, 4), cx, 2.675, 0, Math.PI / 4);
    };
    pier(YX0 + 0.33); pier(YX1 - 0.33);
    // the gates, standing open against the yard's sides
    for (const x of [YX0 + 0.72, YX1 - 0.72]) k.quad(gates, x, -0.48 + 0.98, -1.5, 2.15, 1.95, Math.PI / 2);
    // the yard: level inside the gates, then up to the garden
    const ramp = new THREE.Shape();
    ramp.moveTo(-0.4, -1.3); ramp.lineTo(12, -1.3); ramp.lineTo(12, UP); ramp.lineTo(2.6, -0.48); ramp.lineTo(-0.4, -0.48); ramp.closePath();
    k.shape(setts, ramp, YX1 - YX0, (YX0 + YX1) / 2, 0, 0, Math.PI / 2, 1.5);
    k.slab(flagM, YX0, YX1, -1, UP, -14.2, -12);                     // the top, by the Back Bar's door
    // its south side, against next door, and the terrace's wall along its north side, up to the garden
    k.slab(RUB, YX0 - 0.2, YX0, -1.2, 4.2, -14.2, -0.38, 3);
    k.slab(RUB, YX1 - 0.4, YX1, -1, UP + 1.0, -12, SZ, 3);
    k.slab(S2, YX1 - 0.45, YX1 + 0.05, UP + 1.0, UP + 1.1, -12, SZ);
    // barrels waiting by the stables' wall
    for (const z of [-1.0, -1.65, -2.3]) { k.cyl(chrome, YX1 - 0.3, -0.48, z, 0.21, 0.55, 12); k.cyl(lead, YX1 - 0.3, 0.07, z, 0.16, 0.03, 10); }
    k.cyl(chrome, YX1 - 0.3, 0.1, -1.33, 0.21, 0.55, 12);
  }

  // ---- the back wing: the stairs up to the garden, past the toilets ---------------------------------
  {
    const IX0 = WX0 + 0.4, IX1 = HX - 0.4, MID = 4.6, TOP = WTOP, LAND = STAIR0 - STEPS * RUN;
    k.slab(floorM, IX0, MID, -1, 0, STAIR0, HZ + 0.25, 2);
    for (let i = 0; i < STEPS; i++) k.slab(oak, IX0, MID, -1, ((i + 1) * UP) / STEPS, STAIR0 - (i + 1) * RUN, STAIR0 - i * RUN, 1);
    k.slab(floorM, IX0, IX1, -1, UP, WZ + 0.4, LAND, 2);
    // its walls: the south one, onto the garden, with the door out at the top; the north and the back
    wall(RUB, false, WZ, HZ, -1, TOP, WX0, WX0 + 0.25, [[-18.75, -17.3, UP, UP + 2.25]]);
    wall(plaster, false, WZ + 0.4, HZ, -1, TOP, WX0 + 0.25, IX0, [[-18.75, -17.3, UP, UP + 2.25]]);
    k.slab(RUB, HX - 0.25, HX, -1, TOP, WZ, HZ, 3); k.slab(plaster, IX1, HX - 0.25, -1, TOP, WZ + 0.4, HZ);
    k.slab(RUB, WX0, HX, -1, TOP, WZ, WZ + 0.25, 3); k.slab(plaster, IX0, IX1, -1, TOP, WZ + 0.25, WZ + 0.4);
    // the toilets beside the stairs, their doors on the landing
    k.slab(plaster, MID, IX1, -1, TOP, LAND, HZ + 0.25);
    k.quad(oak, 5.5, UP + 1.0, LAND - 0.012, 0.85, 2.0, Math.PI);
    pic(signs, SW, SH, SIGN.gents, 5.5, UP + 2.2, LAND - 0.015, 0.5, 0.13, Math.PI);
    k.quad(oak, 4.0, UP + 1.0, WZ + 0.412, 0.85, 2.0);
    pic(signs, SW, SH, SIGN.ladies, 4.0, UP + 2.2, WZ + 0.415, 0.5, 0.13);
    // the handrail, a light, posters up the stairs, and the flat lead roof
    k.beam(oak, [MID - 0.06, 0.95, STAIR0], [MID - 0.06, UP + 0.95, LAND], 0.05, 0.06);
    k.box(lamp, IX0 + 0.06, UP + 2.2, -15.0, 0.1, 0.16, 0.14);
    for (let i = 0; i < 6; i++) poster(i * 5 % 32, IX0 + 0.015, 1.5 + ((i + 0.5) * UP) / 6, STAIR0 - (i + 0.5) * ((STEPS * RUN) / 6), Math.PI / 2);
    k.slab(lead, WX0, HX, TOP, TOP + 0.22, WZ, HZ);
    k.slab(plaster, IX0, IX1, TOP - 0.06, TOP - 0.01, WZ + 0.4, HZ);
  }

  // ---- the garden: a terrace of flagstones, a storey up, behind the house -------------------------------
  {
    k.slab(flagM, SX, -HX, -1, UP, BZ0, SZ, 1.5);
    k.slab(flagM, -HX, WX0, -1, UP, BZ0, HZ, 1.5);
    // a clear canopy on timber posts over the end by the stables
    for (const x of [SX + 0.45, -12.8, -HX - 0.4]) { k.cyl(oak, x, UP, -13.75, 0.09, 2.6, 8); k.slab(oak, x - 0.08, x + 0.08, UP + 2.5, UP + 2.68, -13.85, SZ); }
    k.slab(oak, SX + 0.3, -HX - 0.2, UP + 2.5, UP + 2.68, -13.85, -13.65);
    k.slab(canopy, SX + 0.2, -HX - 0.1, UP + 2.68, UP + 2.72, -14.0, SZ);
    // picnic tables, on the terrace and in the covered seating
    for (const [x, z, along] of [[-16.2, -8.4, true], [-11.8, -8.4, true], [-16.2, -12.0, true], [-2.0, -12.0, true], [-6.7, -16.9, false], [-3.3, -16.9, false], [0.1, -16.9, false]] as const) picnic(x, UP, z, along);
    // the Pizza Bike: a cargo trike with a wood-fired oven on its box, and its chalkboard
    pizzaBike(-9.4, UP, -12.4);
    pic(signs, SW, SH, SIGN.pizza, -7.7, UP + 0.62, -11.55, 0.55, 0.62, Math.PI / 4);
    k.box(dark, -7.75, UP, -11.6, 0.6, 0.04, 0.3, Math.PI / 4);
    // planters along the house's back wall, and the terrace's wall to the yard
    for (const x of [-5.6, -3.3, -1.0]) { k.slab(oak, x - 0.9, x + 0.9, UP, UP + 0.55, HZ - 0.6, HZ); k.slab(green, x - 0.85, x + 0.85, UP + 0.55, UP + 0.75, HZ - 0.55, HZ - 0.05); }
    // strings of lights, sagging between the house, the canopy and the back range
    const string = (a: [number, number, number], b: [number, number, number], n: number) => {
      let prev = a;
      for (let i = 1; i <= n; i++) {
        const t = i / n, sag = Math.sin(Math.PI * t) * 0.35;
        const p: [number, number, number] = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag, a[2] + (b[2] - a[2]) * t];
        k.beam(black, prev, p, 0.012, 0.012, 1);
        if (i < n) k.add(lamp, new THREE.SphereGeometry(0.05, 6, 4), p[0], p[1] - 0.07, p[2]);
        prev = p;
      }
    };
    string([-6.7, UP + 2.9, HZ - 0.05], [WX0 - 0.05, UP + 2.9, BZ0 + 0.1], 12);
    string([-HX - 0.4, UP + 2.68, -13.7], [WX0 - 0.05, UP + 2.95, -13.0], 12);
    string([-6.7, UP + 2.9, HZ - 0.05], [-HX - 0.4, UP + 2.68, -13.7], 6);
  }

  // ---- the back range: the Back Bar, and the covered seating --------------------------------------------
  {
    const EV = UP + 3.4, PX = -9.4;          // its eaves, and the wall between the Back Bar and the seating
    k.slab(flagM, BX0, BX1, -1, UP, BZ1, BZ0, 1.5);
    k.slab(floorM, BX0 + 0.4, PX, UP, UP + 0.02, BZ1 + 0.4, BZ0 - 0.4, 2);
    wall(lime, true, BX0, PX + 0.4, UP, EV, BZ0 - 0.4, BZ0, [[-21.6, -20.4, UP, UP + 2.25], [-12.6, -11.4, UP, UP + 2.25], [-18.9, -17.7, UP + 0.9, UP + 2.4], [-15.9, -14.7, UP + 0.9, UP + 2.4]]);
    for (const x of [-18.3, -15.3]) k.quad(glass, x, UP + 1.65, BZ0 - 0.2, 1.2, 1.5);
    k.slab(lime, BX0, BX0 + 0.4, UP, EV, BZ1, BZ0);
    k.slab(lime, PX, PX + 0.4, UP, EV, BZ1, BZ0 - 0.4);
    k.slab(RUB, BX0, BX1, -1, EV, BZ1, BZ1 + 0.4, 3);
    k.slab(lime, BX0 + 0.4, BX1, UP, EV - 0.1, BZ1 + 0.4, BZ1 + 0.45);
    k.slab(lime, BX0 + 0.4, BX1, EV - 0.1, EV, BZ1 + 0.4, BZ0);      // the ceiling
    k.slab(RUB, WX0, WX0 + 0.25, WTOP, EV, BZ1, BZ0, 3);              // (the wing's wall, up to it)
    k.roof(roofS, BX0 - 0.15, BX1, EV, BZ1 - 0.2, BZ0 + 0.2, 1.5);
    // the seating's open front: posts and a beam
    for (const x of [-5.7, -2.2, 1.3]) k.cyl(oak, x, UP, BZ0 - 0.22, 0.12, EV - UP - 0.3, 8);
    k.slab(oak, PX + 0.4, BX1, EV - 0.4, EV, BZ0 - 0.4, BZ0);
    pic(signs, SW, SH, SIGN.back, -21.0, UP + 2.62, BZ0 + 0.012, 1.4, 0.26);
    // inside the Back Bar: the little stage, its curtain, a mic and an amp, lights on it, chairs facing it
    const IX = BX0 + 0.4, IZ0 = BZ0 - 0.4, IZ1 = BZ1 + 0.45;
    k.slab(dark, IX, IX + 2.4, UP, UP + 0.35, IZ1, IZ0);
    pic(games, GW, GH, GAME.curtain, IX + 0.015, UP + 1.95, (IZ0 + IZ1) / 2, IZ0 - IZ1 - 0.2, 2.6, Math.PI / 2);
    k.cyl(chrome, IX + 1.4, UP + 0.35, -16.9, 0.012, 1.45, 4); k.cyl(black, IX + 1.35, UP + 1.78, -16.9, 0.025, 0.12, 6);
    k.box(black, IX + 0.45, UP + 0.35, -15.8, 0.36, 0.6, 0.6); pic(games, GW, GH, GAME.grille, IX + 0.635, UP + 0.66, -15.8, 0.6, 0.6, Math.PI / 2);
    k.box(black, IX + 0.45, UP + 0.35, -18.0, 0.36, 0.6, 0.6); pic(games, GW, GH, GAME.grille, IX + 0.635, UP + 0.66, -18.0, 0.6, 0.6, Math.PI / 2);
    for (const z of [-15.3, -16.9, -18.5]) { k.cyl(black, IX + 2.6, EV - 0.5, z, 0.09, 0.2, 8); k.add(lamp, new THREE.SphereGeometry(0.07, 6, 4), IX + 2.6, EV - 0.52, z); }
    for (let row = 0; row < 3; row++) for (const z of [-15.3, -16.1, -17.7, -18.5]) chair(IX + 3.6 + row * 1.2, UP, z);
    // its bar in the far corner, with posters all round
    k.slab(wood, -13.6, PX - 0.6, UP, UP + 1.0, IZ1 + 0.55, IZ1 + 1.05); k.slab(oak, -13.7, PX - 0.5, UP + 1.0, UP + 1.06, IZ1 + 0.5, IZ1 + 1.15);
    pic(games, GW, GH, GAME.bottles, -11.6, UP + 1.75, IZ1 + 0.012, 3.6, 1.2);
    let n = 8;
    for (const x of [-22.6, -21.6, -20.3, -19.2, -17.4, -16.5, -14.8]) poster(n++ % 32, x, UP + 2.0 + (n % 3) * 0.25, IZ1 + 0.015, 0);
    for (const x of [-23.0, -16.6, -13.6, -10.2]) poster(n++ % 32, x, UP + 2.25, IZ0 - 0.015, Math.PI);
    // posters and lights in the covered seating
    for (const x of [-8.3, -7.4, -4.6, -3.7, -0.8, 0.1, 1.6]) poster(n++ % 32, x, UP + 2.1, IZ1 + 0.015, 0, 0.9);
    for (const x of [-7.4, -3.7, 0.1]) { k.cyl(iron, x, EV - 0.6, -16.9, 0.008, 0.5, 4); k.add(lamp, new THREE.SphereGeometry(0.09, 8, 6), x, EV - 0.65, -16.9); }
  }

  // ---- helpers for the furnishings ------------------------------------------------------------------
  function drumKit(x: number, y: number, z: number) {
    lying(plain("#8a1c22"), 0.27, 0.4, x, y + 0.29, z, true, 14);
    k.add(white, new THREE.CircleGeometry(0.25, 14), x - 0.205, y + 0.29, z, -Math.PI / 2);
    k.cyl(chrome, x - 0.55, y, z - 0.35, 0.012, 0.55, 4); k.cyl(plain("#d9d4c8"), x - 0.55, y + 0.55, z - 0.35, 0.17, 0.13, 12);
    k.cyl(plain("#8a1c22"), x - 0.15, y + 0.62, z - 0.18, 0.13, 0.17, 12);
    k.cyl(plain("#8a1c22"), x + 0.05, y, z + 0.45, 0.2, 0.48, 12);
    k.cyl(chrome, x - 0.6, y, z + 0.32, 0.012, 0.9, 4); k.cyl(brass, x - 0.6, y + 0.9, z + 0.32, 0.18, 0.012, 14); k.cyl(brass, x - 0.6, y + 0.92, z + 0.32, 0.18, 0.012, 14);
    k.cyl(chrome, x + 0.2, y, z - 0.6, 0.012, 1.25, 4); k.add(brass, new THREE.CylinderGeometry(0.24, 0.24, 0.01, 16), x + 0.2, y + 1.25, z - 0.6, 0, 0, 0.3);
    k.cyl(dark, x + 0.45, y, z - 0.05, 0.17, 0.5, 10);
  }
  /** An acoustic guitar on its stand, facing -x (into the room). */
  function guitar(x: number, y: number, z: number) {
    const body = plain("#b5541f");
    k.add(body, new THREE.SphereGeometry(0.2, 10, 6).scale(0.3, 1.15, 1), x, y, z);
    k.add(body, new THREE.SphereGeometry(0.15, 10, 6).scale(0.3, 1.1, 1), x, y + 0.27, z);
    k.beam(dark, [x - 0.01, y + 0.35, z], [x - 0.01, y + 1.0, z], 0.05, 0.03);
    k.add(black, new THREE.CircleGeometry(0.05, 10), x - 0.065, y + 0.2, z, -Math.PI / 2);
    k.beam(black, [x + 0.12, y - 0.62, z], [x + 0.08, y - 0.15, z], 0.02, 0.02);
  }
  function picnic(x: number, y: number, z: number, alongX: boolean) {
    const L = 1.8;
    const at = (a: number, b: number): [number, number] => (alongX ? [x + a, z + b] : [x + b, z + a]);
    const box = (a: number, b: number, sa: number, sy: number, sb: number, yy: number) => {
      const [cx, cz] = at(a, b);
      k.box(oak, cx, yy, cz, alongX ? sa : sb, sy, alongX ? sb : sa, 0, 1);
    };
    box(0, 0, L, 0.05, 0.75, y + 0.71);
    for (const s of [-1, 1]) box(0, s * 0.62, L, 0.05, 0.28, y + 0.42);
    for (const a of [-0.65, 0.65]) {
      box(a, 0, 0.08, 0.04, 1.55, y + 0.38);
      for (const s of [-1, 1]) {
        const [p, q] = at(a, s * 0.55), [r, t] = at(a, s * 0.08);
        k.beam(oak, [p, y, q], [r, y + 0.71, t], 0.07, 0.05, 1);
      }
    }
  }
  function chair(x: number, y: number, z: number) {
    k.slab(dark, x - 0.2, x + 0.2, y + 0.43, y + 0.47, z - 0.2, z + 0.2);
    k.slab(dark, x + 0.17, x + 0.21, y + 0.47, y + 0.9, z - 0.2, z + 0.2);
    for (const sx of [-0.17, 0.17]) for (const sz of [-0.17, 0.17]) k.slab(dark, x + sx - 0.02, x + sx + 0.02, y, y + 0.43, z + sz - 0.02, z + sz + 0.02);
  }
  function pizzaBike(x: number, y: number, z: number) {
    const wheel = (wx: number, wz: number) => { lying(black, 0.3, 0.06, wx, y + 0.3, wz, false, 14); lying(chrome, 0.05, 0.08, wx, y + 0.3, wz, false, 6); };
    wheel(x - 0.45, z - 0.45); wheel(x - 0.45, z + 0.45); wheel(x + 1.05, z);
    k.slab(oak, x - 0.95, x + 0.05, y + 0.4, y + 0.95, z - 0.42, z + 0.42);
    k.slab(dark, x - 0.97, x + 0.07, y + 0.95, y + 1.0, z - 0.44, z + 0.44);
    k.add(plain("#3a3533"), new THREE.SphereGeometry(0.4, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), x - 0.45, y + 1.0, z);
    k.add(black, new THREE.CircleGeometry(0.14, 10, 0, Math.PI), x - 0.07, y + 1.01, z, Math.PI / 2);
    k.cyl(iron, x - 0.6, y + 1.3, z - 0.1, 0.05, 0.6, 6);
    k.beam(iron, [x + 0.05, y + 0.6, z], [x + 1.05, y + 0.3, z], 0.05, 0.05, 1);
    k.beam(iron, [x + 0.65, y + 0.42, z], [x + 0.6, y + 0.95, z], 0.04, 0.04, 1);
    k.slab(black, x + 0.5, x + 0.75, y + 0.95, y + 1.0, z - 0.1, z + 0.1);
    k.beam(iron, [x + 0.15, y + 0.6, z], [x + 0.1, y + 1.05, z], 0.04, 0.04, 1);
    k.slab(iron, x + 0.06, x + 0.14, y + 1.02, y + 1.06, z - 0.32, z + 0.32);
  }

  const grp = k.build();
  glow(grp, plaster, 0.16, 0.42);
  glow(grp, floorM, 0.05, 0.18);
  glow(grp, plate, 0, 0.85);
  glow(grp, lamp, 0.45, 1.3);
  glow(grp, fire, 0.9, 1.3);
  glow(grp, fridge, 0.35, 0.6);
  return grp;
}
