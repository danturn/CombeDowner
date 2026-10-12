// Pixel-art textures for the mines, drawn in the browser like the rest of the game's (textures.ts).
import * as THREE from "three";
import { canvas, pixelTex, rng, tex } from "../textures";

/** Worked limestone: bedding planes, pick marks and the odd fossil shell. u and v each cover 2 m. */
export function rock(seed = 3, dark = false): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  const r = rng(seed);
  g.fillStyle = dark ? "#9d968a" : "#c4bcab";
  g.fillRect(0, 0, 256, 256);
  // mottling
  for (let n = 0; n < 900; n++) {
    const l = 150 + r() * 70;
    g.fillStyle = `rgba(${l + 12},${l + 6},${l - 8},${0.15 + r() * 0.2})`;
    const s = 4 + r() * 18;
    g.fillRect(r() * 256, r() * 256, s, s * (0.4 + r()));
  }
  // bedding planes: the stone was laid down in beds, which show as faint horizontal lines
  for (let y = 0; y < 256; y += 30 + r() * 30) {
    g.strokeStyle = `rgba(70,58,40,${0.25 + r() * 0.2})`;
    g.lineWidth = 1 + r() * 2;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= 256; x += 16) g.lineTo(x, y + (r() - 0.5) * 5);
    g.stroke();
  }
  // diagonal pick marks
  for (let n = 0; n < 140; n++) {
    const x = r() * 256, y = r() * 256, l = 6 + r() * 12;
    g.strokeStyle = `rgba(80,66,48,${0.2 + r() * 0.3})`;
    g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + l * 0.6, y + l); g.stroke();
  }
  // shells
  for (let n = 0; n < 6; n++) {
    g.strokeStyle = "rgba(240,230,205,0.6)";
    g.lineWidth = 1.5;
    const x = r() * 256, y = r() * 256;
    g.beginPath(); g.arc(x, y, 3 + r() * 4, 0, Math.PI * 1.6); g.stroke();
  }
  return pixelTex(c, 64, 64, 18, seed);
}

/** The floor: trodden dust, grit and spalls of stone. Covers 2 m. */
export function floor(seed = 5, res = 64): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  const r = rng(seed);
  g.fillStyle = "#8f877a";
  g.fillRect(0, 0, 256, 256);
  for (let n = 0; n < 1400; n++) {
    const l = 110 + r() * 90;
    g.fillStyle = `rgba(${l + 15},${l + 5},${l - 18},${0.3 + r() * 0.4})`;
    const s = 2 + r() * 7;
    g.fillRect(r() * 256, r() * 256, s, s * (0.5 + r() * 0.8));
  }
  for (let n = 0; n < 60; n++) {
    const x = r() * 256, y = r() * 256, s = 5 + r() * 10;
    g.fillStyle = `rgba(60,50,38,0.5)`;
    g.fillRect(x + 2, y + 2, s, s * 0.7);
    g.fillStyle = `rgba(${200 + r() * 30},${185 + r() * 30},${150 + r() * 20},0.9)`;
    g.fillRect(x, y, s, s * 0.7);
  }
  return pixelTex(c, res, res, res > 64 ? 64 : 18, seed);
}

/** Old elm boards with iron bands, for chests and the winze grille's frame. */
export function wood(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  const r = rng(11);
  g.fillStyle = "#6b4a2b";
  g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 32) {
    g.fillStyle = `rgb(${90 + r() * 30},${60 + r() * 20},${32 + r() * 12})`;
    g.fillRect(0, y + 1, 128, 30);
    for (let n = 0; n < 20; n++) {
      g.strokeStyle = "rgba(40,25,12,0.4)";
      g.beginPath(); const yy = y + 3 + r() * 26; g.moveTo(0, yy); g.lineTo(128, yy + (r() - 0.5) * 4); g.stroke();
    }
  }
  g.fillStyle = "#3a3633";
  g.fillRect(14, 0, 10, 128); g.fillRect(104, 0, 10, 128);
  g.fillStyle = "#77706a";
  for (const x of [19, 109]) for (let y = 8; y < 128; y += 30) g.fillRect(x - 2, y, 4, 4);
  return pixelTex(c, 32, 32, 16, 11);
}

/** Initials and a date scratched into the stone, with a candle-smoke shadow. */
export function graffiti(text: string): THREE.CanvasTexture {
  const [c, g] = canvas(256, 96);
  g.font = "700 46px Georgia, serif";
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillStyle = "rgba(25,18,12,0.85)";
  g.fillText(text, 128, 50);
  g.fillStyle = "rgba(255,240,210,0.25)";
  g.fillText(text, 129, 52);
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** A soft glow for candle flames and monsters' eyes. */
export function glow(): THREE.CanvasTexture {
  const [c, g] = canvas(64, 64);
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(255,240,200,1)");
  grd.addColorStop(0.25, "rgba(255,190,90,0.8)");
  grd.addColorStop(1, "rgba(255,120,20,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// ---- wall and floor variants ----

const S = 256;
type G = CanvasRenderingContext2D;

/** Calls fn at x,y and at the wrapped copies needed so a mark of extent e tiles across the edges. */
function wrapAt(x: number, y: number, e: number, fn: (x: number, y: number) => void) {
  const xs = [0], ys = [0];
  if (x - e < 0) xs.push(S);
  if (x + e > S) xs.push(-S);
  if (y - e < 0) ys.push(S);
  if (y + e > S) ys.push(-S);
  for (const dx of xs) for (const dy of ys) fn(x + dx, y + dy);
}

/** Flat colour with wrapped mottling. */
function base(g: G, r: () => number, c: number[], n = 900, spread = 35) {
  g.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < n; i++) {
    const l = (r() - 0.5) * spread, s = 4 + r() * 18, h = s * (0.4 + r());
    g.fillStyle = `rgba(${c[0] + l},${c[1] + l},${c[2] + l},${0.15 + r() * 0.2})`;
    wrapAt(r() * S, r() * S, s, (x, y) => g.fillRect(x, y, s, h));
  }
}

/** A line that runs all the way across and wobbles with a whole number of waves, so it tiles. */
function wavy(g: G, r: () => number, y: number, amp: number, vertical = false) {
  const k = 1 + Math.floor(r() * 3), ph = r() * 6.28;
  wrapAt(0, y, amp + 6, (_, yy) => {
    g.beginPath();
    for (let t = 0; t <= S; t += 8) {
      const o = Math.sin((t / S) * Math.PI * 2 * k + ph) * amp;
      if (vertical) g.lineTo(yy + o, t); else g.lineTo(t, yy + o);
    }
    g.stroke();
  });
}

function beds(g: G, r: () => number, rgb: string, a: number) {
  for (let y = r() * 30; y < S; y += 30 + r() * 30) {
    g.strokeStyle = `rgba(${rgb},${a + r() * 0.2})`;
    g.lineWidth = 1 + r() * 2;
    wavy(g, r, y, 1 + r() * 3);
  }
}

function picks(g: G, r: () => number, n: number, rgb: string) {
  for (let i = 0; i < n; i++) {
    const l = 6 + r() * 12;
    g.strokeStyle = `rgba(${rgb},${0.2 + r() * 0.3})`;
    g.lineWidth = 1.5;
    wrapAt(r() * S, r() * S, l, (x, y) => { g.beginPath(); g.moveTo(x, y); g.lineTo(x + l * 0.6, y + l); g.stroke(); });
  }
}

function blotch(g: G, r: () => number, n: number, rgb: string, a: number, rad: number) {
  for (let i = 0; i < n; i++) {
    const rr = rad * (0.4 + r() * 0.6);
    wrapAt(r() * S, r() * S, rr, (x, y) => {
      const grd = g.createRadialGradient(x, y, 0, x, y, rr);
      grd.addColorStop(0, `rgba(${rgb},${a})`);
      grd.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = grd;
      g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    });
  }
}

function oolite(g: G, r: () => number) {
  base(g, r, [196, 188, 171]);
  beds(g, r, "70,58,40", 0.25);
  picks(g, r, 140, "80,66,48");
  for (let i = 0; i < 6; i++) {
    g.strokeStyle = "rgba(240,230,205,0.6)";
    g.lineWidth = 1.5;
    wrapAt(r() * S, r() * S, 8, (x, y) => { g.beginPath(); g.arc(x, y, 3 + r() * 4, 0, Math.PI * 1.6); g.stroke(); });
  }
}

function ochre(g: G, r: () => number) {
  base(g, r, [200, 170, 125]);
  beds(g, r, "70,40,25", 0.2);
  // rusty bands
  for (let i = 0; i < 8; i++) {
    g.strokeStyle = `rgba(${170 + r() * 40},${70 + r() * 40},${25 + r() * 20},${0.3 + r() * 0.3})`;
    g.lineWidth = 8 + r() * 18;
    wavy(g, r, r() * S, 3 + r() * 8);
  }
  blotch(g, r, 22, "165,65,28", 0.55, 40);
  blotch(g, r, 10, "110,40,22", 0.5, 20);
  // dark red seams
  for (let i = 0; i < 5; i++) {
    g.strokeStyle = `rgba(90,28,20,${0.5 + r() * 0.3})`;
    g.lineWidth = 1 + r() * 2;
    wavy(g, r, r() * S, 2 + r() * 5);
  }
  picks(g, r, 80, "90,40,25");
}

function soot(g: G, r: () => number) {
  base(g, r, [96, 84, 72], 900, 30);
  beds(g, r, "20,15,10", 0.3);
  blotch(g, r, 14, "20,16,12", 0.5, 40);
  // soot rising from the bottom of each streak
  for (let i = 0; i < 80; i++) {
    const w = 2 + r() * 7, len = 30 + r() * 100, a = 0.35 + r() * 0.35;
    wrapAt(r() * S, r() * S, len, (x, y) => {
      const grd = g.createLinearGradient(0, y, 0, y - len);
      grd.addColorStop(0, `rgba(8,6,4,${a})`);
      grd.addColorStop(1, "rgba(8,6,4,0)");
      g.fillStyle = grd;
      g.fillRect(x, y - len, w, len);
    });
  }
  picks(g, r, 60, "30,24,18");
  // tally marks scratched through to the pale stone
  for (let i = 0; i < 4; i++) {
    const n = 4;
    wrapAt(r() * S, r() * S, 40, (x, y) => {
      g.strokeStyle = "rgba(225,212,184,0.85)";
      g.lineWidth = 2;
      g.beginPath();
      for (let k = 0; k < n; k++) { g.moveTo(x + k * 7, y); g.lineTo(x + k * 7 + 1, y + 20); }
      g.moveTo(x - 4, y + 16); g.lineTo(x + n * 7 - 2, y + 3);
      g.stroke();
    });
  }
}

function flow(g: G, r: () => number) {
  base(g, r, [150, 160, 170], 700, 40);
  blotch(g, r, 20, "110,130,150", 0.4, 40);
  // calcite curtains, fluted
  for (let i = 0; i < 16; i++) {
    const w = 8 + r() * 20, len = 70 + r() * 110;
    wrapAt(r() * S, r() * S, len, (x, y) => {
      for (let k = 0; k < w; k += 2) {
        const a = 0.25 + 0.35 * Math.sin((k / w) * Math.PI);
        const grd = g.createLinearGradient(0, y, 0, y + len);
        grd.addColorStop(0, `rgba(235,242,248,${a * (0.5 + 0.5 * ((k >> 1) % 2))})`);
        grd.addColorStop(1, "rgba(235,242,248,0)");
        g.fillStyle = grd;
        g.fillRect(x + k, y, 2, len);
      }
    });
  }
  // drip streaks ending in a bead
  for (let i = 0; i < 60; i++) {
    const len = 30 + r() * 100;
    wrapAt(r() * S, r() * S, len, (x, y) => {
      g.fillStyle = `rgba(245,250,255,${0.25 + r() * 0.3})`;
      g.fillRect(x, y, 1.5, len);
      g.fillStyle = "rgba(255,255,255,0.8)";
      g.fillRect(x - 0.5, y + len, 3, 3);
    });
  }
  // wet glints
  for (let i = 0; i < 70; i++) {
    g.fillStyle = "rgba(255,255,255,0.85)";
    wrapAt(r() * S, r() * S, 6, (x, y) => g.fillRect(x, y, 2 + r() * 4, 1));
  }
}

function fossil(g: G, r: () => number) {
  base(g, r, [214, 196, 160], 800, 30);
  beds(g, r, "90,70,45", 0.2);
  // ammonite spirals
  for (let i = 0; i < 22; i++) {
    const rad = 6 + r() * 9, a0 = r() * 6.28;
    wrapAt(r() * S, r() * S, rad + 2, (x, y) => {
      g.fillStyle = "rgba(240,228,200,0.55)";
      g.beginPath(); g.arc(x, y, rad, 0, 6.3); g.fill();
      g.strokeStyle = "rgba(110,85,55,0.75)";
      g.lineWidth = 1.5;
      g.beginPath();
      for (let t = 0; t < 12.5; t += 0.3) {
        const q = (t / 12.5) * rad;
        g.lineTo(x + Math.cos(t + a0) * q, y + Math.sin(t + a0) * q);
      }
      g.stroke();
    });
  }
  // bivalve fans
  for (let i = 0; i < 18; i++) {
    const rad = 5 + r() * 6, a0 = r() * 6.28;
    wrapAt(r() * S, r() * S, rad + 2, (x, y) => {
      g.fillStyle = "rgba(238,226,196,0.6)";
      g.strokeStyle = "rgba(110,85,55,0.7)";
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, y); g.arc(x, y, rad, a0, a0 + 2.2); g.closePath(); g.fill(); g.stroke();
      for (let k = 1; k < 4; k++) { g.beginPath(); g.arc(x, y, (rad * k) / 4, a0, a0 + 2.2); g.stroke(); }
    });
  }
  // crinoid stem discs
  for (let i = 0; i < 26; i++) {
    const a = r() * 6.28, n = 3 + Math.floor(r() * 3);
    wrapAt(r() * S, r() * S, 20, (x, y) => {
      for (let k = 0; k < n; k++) {
        const cx = x + Math.cos(a) * k * 5, cy = y + Math.sin(a) * k * 5;
        g.fillStyle = "rgba(245,236,212,0.8)";
        g.beginPath(); g.arc(cx, cy, 2.6, 0, 6.3); g.fill();
        g.strokeStyle = "rgba(110,85,55,0.7)";
        g.beginPath(); g.arc(cx, cy, 2.6, 0, 6.3); g.stroke();
        g.fillStyle = "rgba(110,85,55,0.8)";
        g.fillRect(cx - 0.5, cy - 0.5, 1, 1);
      }
    });
  }
}

function spar(g: G, r: () => number) {
  base(g, r, [88, 98, 112], 800, 30);
  beds(g, r, "20,26,36", 0.3);
  for (let i = 0; i < 7; i++) {
    g.strokeStyle = `rgba(205,222,235,${0.4 + r() * 0.3})`;
    g.lineWidth = 1 + r() * 2.5;
    wavy(g, r, r() * S, 3 + r() * 8, r() < 0.4);
  }
  // spar clusters: shards fanning out, bright enough to glitter under a torch
  for (let i = 0; i < 28; i++) {
    const n = 4 + Math.floor(r() * 5);
    wrapAt(r() * S, r() * S, 16, (x, y) => {
      g.fillStyle = "rgba(15,20,30,0.5)";
      g.beginPath(); g.arc(x, y, 7, 0, 6.3); g.fill();
      for (let k = 0; k < n; k++) {
        const a = (k / n) * 6.28 + r(), l = 6 + r() * 8, w = 0.25 + r() * 0.2;
        g.fillStyle = `rgba(${225 + r() * 30},${245 + r() * 10},255,0.95)`;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + Math.cos(a - w) * l * 0.7, y + Math.sin(a - w) * l * 0.7);
        g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
        g.lineTo(x + Math.cos(a + w) * l * 0.7, y + Math.sin(a + w) * l * 0.7);
        g.fill();
      }
    });
  }
  for (let i = 0; i < 140; i++) {
    g.fillStyle = r() < 0.5 ? "rgba(255,255,255,0.95)" : "rgba(190,255,255,0.9)";
    wrapAt(r() * S, r() * S, 3, (x, y) => g.fillRect(x, y, 2, 2));
  }
}

export type RockStyle = "oolite" | "ochre" | "soot" | "flow" | "fossil" | "spar";

/** Wall variants so each room looks different. All tile over 2 m x 2 m. */
export function rockStyle(style: RockStyle, seed = 3, res = 64): THREE.CanvasTexture {
  const [c, g] = canvas(S, S);
  const r = rng(seed * 31 + style.length * 7 + style.charCodeAt(0));
  ({ oolite, ochre, soot, flow, fossil, spar })[style](g, r);
  return pixelTex(c, res, res, res > 64 ? 64 : style === "spar" ? 24 : 18, seed);
}

function strand(g: G, r: () => number, n: number, rgb: string, len: number, w: number, a: number) {
  for (let i = 0; i < n; i++) {
    const l = len * (0.5 + r()), ang = r() * 6.28;
    g.strokeStyle = `rgba(${rgb},${a * (0.6 + r() * 0.4)})`;
    g.lineWidth = w * (0.7 + r() * 0.8);
    wrapAt(r() * S, r() * S, l, (x, y) => {
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(ang) * l, y + Math.sin(ang) * l); g.stroke();
    });
  }
}

function mud(g: G, r: () => number) {
  base(g, r, [66, 52, 40], 1000, 30);
  // puddle sheens
  for (let i = 0; i < 7; i++) {
    const rx = 14 + r() * 22, ry = rx * (0.4 + r() * 0.4);
    wrapAt(r() * S, r() * S, rx, (x, y) => {
      g.fillStyle = "rgba(28,34,38,0.85)";
      g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 6.3); g.fill();
      g.strokeStyle = "rgba(130,150,160,0.55)";
      g.lineWidth = 2;
      g.beginPath(); g.ellipse(x, y, rx * 0.8, ry * 0.7, 0, 3.4, 5); g.stroke();
    });
  }
  // boot prints
  for (let i = 0; i < 6; i++) {
    const a = r() * 6.28;
    wrapAt(r() * S, r() * S, 26, (x, y) => {
      g.save(); g.translate(x, y); g.rotate(a);
      g.fillStyle = "rgba(26,18,12,0.75)";
      g.fillRect(-6, -16, 12, 22);
      g.fillRect(-5, 9, 10, 7);
      g.fillStyle = "rgba(90,72,55,0.6)";
      for (let k = -14; k < 4; k += 4) g.fillRect(-6, k, 12, 1);
      g.restore();
    });
  }
}

function rubbleFloor(g: G, r: () => number) {
  base(g, r, [40, 36, 30], 400, 20);
  for (let i = 0; i < 56; i++) {
    const rad = 12 + r() * 22, n = 5 + Math.floor(r() * 3), l = 150 + r() * 70;
    const pts: number[][] = [];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * 6.28 + (r() - 0.5) * 0.5, q = rad * (0.6 + r() * 0.4);
      pts.push([Math.cos(a) * q, Math.sin(a) * q * 0.8]);
    }
    wrapAt(r() * S, r() * S, rad, (x, y) => {
      g.beginPath();
      pts.forEach((p, k) => (k ? g.lineTo(x + p[0], y + p[1]) : g.moveTo(x + p[0], y + p[1])));
      g.closePath();
      g.fillStyle = `rgb(${l + 14},${l + 4},${l - 20})`;
      g.fill();
      g.strokeStyle = "rgba(20,16,10,0.8)";
      g.lineWidth = 2;
      g.stroke();
      g.strokeStyle = "rgba(255,248,225,0.35)";
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(x + pts[0][0], y + pts[0][1]); g.lineTo(x + pts[1][0], y + pts[1][1]); g.stroke();
    });
  }
}

function boardsFloor(g: G, r: () => number) {
  g.fillStyle = "#3a2a1a";
  g.fillRect(0, 0, S, S);
  const bh = 64;
  for (let row = 0; row < 4; row++) {
    const y = row * bh, l = 0.8 + r() * 0.4;
    g.fillStyle = `rgb(${100 * l},${72 * l},${44 * l})`;
    g.fillRect(0, y + 2, S, bh - 2);
    // grain
    for (let k = 0; k < 14; k++) {
      g.strokeStyle = `rgba(${r() < 0.5 ? "35,22,10" : "150,110,70"},${0.2 + r() * 0.25})`;
      g.lineWidth = 1;
      wavy(g, r, y + 5 + r() * (bh - 10), 1 + r() * 2);
    }
    // knot
    const kx = r() * S, ky = y + 14 + r() * 36;
    g.strokeStyle = "rgba(30,18,8,0.7)";
    g.lineWidth = 2;
    wrapAt(kx, ky, 10, (x, yy) => { g.beginPath(); g.ellipse(x, yy, 7, 4, 0, 0, 6.3); g.stroke(); g.beginPath(); g.ellipse(x, yy, 3, 2, 0, 0, 6.3); g.stroke(); });
    // butt joint and nails
    const jx = r() * S;
    g.fillStyle = "#2a1c10";
    g.fillRect(jx, y + 2, 2, bh - 2);
    g.fillRect((jx + S - 1) % S, y + 2, 1, bh - 2);
    for (const nx of [jx + 8, jx - 8])
      for (const ny of [y + 10, y + bh - 10]) {
        wrapAt(((nx % S) + S) % S, ny, 3, (x, yy) => { g.fillStyle = "#1c1612"; g.fillRect(x, yy, 4, 4); g.fillStyle = "#8a8070"; g.fillRect(x, yy, 2, 2); });
      }
  }
  blotch(g, r, 24, "130,120,100", 0.35, 28);
  blotch(g, r, 12, "20,14,8", 0.4, 22);
}

function strawFloor(g: G, r: () => number) {
  base(g, r, [143, 135, 122], 1100, 40);
  strand(g, r, 400, "60,45,20", 26, 2.4, 0.4);
  for (let i = 0; i < 420; i++) {
    const l = 14 + r() * 26, ang = r() * 6.28;
    g.strokeStyle = `rgb(${195 + r() * 35},${165 + r() * 30},${70 + r() * 40})`;
    g.lineWidth = 1.5 + r();
    wrapAt(r() * S, r() * S, l, (x, y) => {
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(ang) * l, y + Math.sin(ang) * l); g.stroke();
    });
  }
}

export type FloorStyle = "dust" | "mud" | "rubble" | "boards" | "straw";

/** Floor variants. All tile over 2 m. */
export function floorStyle(style: FloorStyle, seed = 5, res = 64): THREE.CanvasTexture {
  if (style === "dust" && res <= 64) return floor(seed);
  const [c, g] = canvas(S, S);
  const r = rng(seed * 17 + style.length * 5 + style.charCodeAt(0));
  if (style === "dust") return floor(seed, res);
  ({ mud, rubble: rubbleFloor, boards: boardsFloor, straw: strawFloor })[style](g, r);
  return pixelTex(c, res, res, res > 64 ? 64 : 18, seed);
}

// ---- props textures ----

/** Rough-sawn dark pit-prop timber, grain running up the texture. */
export function timber(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  const r = rng(21);
  g.fillStyle = "#4a3422";
  g.fillRect(0, 0, 128, 128);
  for (let n = 0; n < 110; n++) {
    g.strokeStyle = r() < 0.55 ? `rgba(20,12,6,${0.3 + r() * 0.3})` : `rgba(130,98,64,${0.15 + r() * 0.25})`;
    g.lineWidth = 1 + r() * 2;
    const x = r() * 128, d = (r() - 0.5) * 3;
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x + d, 64); g.lineTo(x, 128); g.stroke();
  }
  for (let n = 0; n < 4; n++) {
    const x = r() * 128, y = r() * 128;
    g.strokeStyle = "rgba(15,8,4,0.7)"; g.lineWidth = 2;
    g.beginPath(); g.ellipse(x, y, 5, 8, 0, 0, 6.3); g.stroke();
  }
  for (let y = 0; y < 128; y += 10 + r() * 14) {
    g.fillStyle = "rgba(20,12,6,0.25)";
    g.fillRect(0, y, 128, 2);
  }
  return pixelTex(c, 32, 32, 14, 21);
}

/** Pitted, flaking rusty iron. */
export function rust(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  const r = rng(23);
  g.fillStyle = "#6e3e22";
  g.fillRect(0, 0, 128, 128);
  for (let n = 0; n < 140; n++) {
    const s = 3 + r() * 14;
    const k = r();
    g.fillStyle = k < 0.4 ? `rgba(200,110,45,${0.3 + r() * 0.3})` : k < 0.7 ? `rgba(40,24,16,${0.3 + r() * 0.3})` : `rgba(120,70,35,0.4)`;
    g.fillRect(r() * 128, r() * 128, s, s * (0.4 + r()));
  }
  for (let n = 0; n < 40; n++) {
    g.fillStyle = "rgba(25,15,10,0.8)";
    g.fillRect(r() * 128, r() * 128, 2, 2);
  }
  return pixelTex(c, 32, 32, 14, 23);
}

/** Straw bale. */
export function hay(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  const r = rng(27);
  g.fillStyle = "#a88c46";
  g.fillRect(0, 0, 128, 128);
  for (let n = 0; n < 700; n++) {
    const x = r() * 128, y = r() * 128, l = 12 + r() * 40, a = (r() - 0.5) * 0.35;
    g.strokeStyle = `rgb(${170 + r() * 60},${140 + r() * 50},${60 + r() * 40})`;
    g.lineWidth = 1 + r();
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  for (let n = 0; n < 60; n++) {
    g.fillStyle = "rgba(50,35,12,0.45)";
    g.fillRect(r() * 128, r() * 128, 10 + r() * 20, 1.5);
  }
  return pixelTex(c, 32, 32, 14, 27);
}

/** A carved stone tablet with 1-6 centred lines of text. Clamped, not pixelated, so it stays legible. */
export function plaque(lines: string[]): THREE.CanvasTexture {
  const W = 512, H = 256, B = 18;
  const [c, g] = canvas(W, H);
  const r = rng(31);
  g.fillStyle = "#cfc5ad";
  g.fillRect(0, 0, W, H);
  for (let n = 0; n < 1800; n++) {
    const l = 170 + r() * 70;
    g.fillStyle = `rgba(${l},${l - 8},${l - 28},0.25)`;
    g.fillRect(r() * W, r() * H, 2 + r() * 5, 2 + r() * 3);
  }
  // bevelled border: lit top and left, shaded bottom and right
  const poly = (fill: string, p: number[][]) => {
    g.fillStyle = fill; g.beginPath(); p.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); g.closePath(); g.fill();
  };
  poly("#ece3cf", [[0, 0], [W, 0], [W - B, B], [B, B]]);
  poly("#e0d6bf", [[0, 0], [B, B], [B, H - B], [0, H]]);
  poly("#8a806b", [[0, H], [B, H - B], [W - B, H - B], [W, H]]);
  poly("#9d9380", [[W, 0], [W, H], [W - B, H - B], [W - B, B]]);
  g.strokeStyle = "rgba(60,50,35,0.6)";
  g.lineWidth = 2;
  g.strokeRect(B, B, W - 2 * B, H - 2 * B);
  // text, shrunk to fit
  const n = lines.length || 1, maxW = W - 2 * B - 28, maxH = H - 2 * B - 24;
  let size = Math.min(60, Math.floor(maxH / (n * 1.2)));
  const font = (s: number) => `700 ${s}px Georgia, serif`;
  g.textAlign = "center"; g.textBaseline = "middle";
  const widest = () => { g.font = font(size); return Math.max(...lines.map((l) => g.measureText(l).width), 1); };
  while (size > 10 && widest() > maxW) size -= 2;
  g.font = font(size);
  const lh = size * 1.2, y0 = H / 2 - ((n - 1) * lh) / 2;
  lines.forEach((l, i) => {
    g.fillStyle = "rgba(255,250,235,0.7)";
    g.fillText(l, W / 2 + 1.5, y0 + i * lh + 1.5);
    g.fillStyle = "rgba(42,33,22,0.92)";
    g.fillText(l, W / 2, y0 + i * lh);
  });
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** A cobweb on a transparent background, radiating from the top-left corner. */
export function web(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  const r = rng(37);
  const n = 7, len = 300, ring = 26;
  const pt = (k: number, d: number): [number, number] => {
    const a = (k / (n - 1)) * Math.PI / 2;
    return [Math.cos(a) * d, Math.sin(a) * d];
  };
  g.lineCap = "round";
  g.strokeStyle = "rgba(235,235,228,0.8)";
  g.lineWidth = 1.5;
  for (let k = 0; k < n; k++) { const [x, y] = pt(k, len); g.beginPath(); g.moveTo(0, 0); g.lineTo(x, y); g.stroke(); }
  g.strokeStyle = "rgba(235,235,228,0.55)";
  g.lineWidth = 1;
  for (let i = 1; i < 12; i++) {
    const d = i * ring;
    for (let k = 0; k < n - 1; k++) {
      if (r() < 0.07) continue; // a broken thread
      const [x0, y0] = pt(k, d + (r() - 0.5) * 4), [x1, y1] = pt(k + 1, d + (r() - 0.5) * 4);
      const [cx, cy] = pt(k + 0.5, d * 0.86);
      g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(cx, cy, x1, y1); g.stroke();
    }
  }
  g.fillStyle = "rgba(220,220,215,0.5)";
  for (let i = 0; i < 12; i++) { const [x, y] = pt(r() * (n - 1), 30 + r() * 200); g.fillRect(x, y, 2, 2); }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// ---- monster hides ----

/** Surfaces for the monsters. Drawn pale, so each model's material colour tints them. */
export type MobHide = "flesh" | "fur" | "bark" | "oolite" | "rag" | "chitin" | "mortar" | "iron" | "leather";

/** A tiling hide for a monster: veined flesh, mangy fur, bark, worked oolite, rags and so on. */
export function mobHide(kind: MobHide, seed = 1): THREE.CanvasTexture {
  const [c, g] = canvas(S, S);
  const r = rng(seed * 97 + kind.length * 13);
  const line = (x0: number, y0: number, x1: number, y1: number, col: string, w: number) => {
    g.strokeStyle = col; g.lineWidth = w;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  };
  if (kind === "flesh") {
    base(g, r, [214, 200, 192], 900, 50);
    // bruised blotches
    for (let i = 0; i < 40; i++) {
      const s = 8 + r() * 26;
      g.fillStyle = `rgba(${120 + r() * 40},${70 + r() * 30},${80 + r() * 30},${0.12 + r() * 0.15})`;
      wrapAt(r() * S, r() * S, s, (x, y) => { g.beginPath(); g.ellipse(x, y, s, s * (0.5 + r() * 0.5), r() * 3, 0, 7); g.fill(); });
    }
    // branching veins
    for (let i = 0; i < 16; i++) {
      let x = r() * S, y = r() * S, a = r() * 6.28;
      const col = `rgba(${90 + r() * 40},${30 + r() * 20},${50 + r() * 30},${0.45 + r() * 0.3})`;
      for (let k = 0; k < 14; k++) {
        const nx = x + Math.cos(a) * 9, ny = y + Math.sin(a) * 9;
        wrapAt(x, y, 12, (ox, oy) => line(ox, oy, ox + nx - x, oy + ny - y, col, 2.2 - k * 0.12));
        x = nx; y = ny; a += (r() - 0.5) * 1.1;
        if (r() < 0.2) {
          const b = a + (r() < 0.5 ? 0.9 : -0.9);
          wrapAt(x, y, 20, (ox, oy) => line(ox, oy, ox + Math.cos(b) * 16, oy + Math.sin(b) * 16, col, 1.2));
        }
      }
    }
  } else if (kind === "fur") {
    base(g, r, [196, 182, 164], 500, 40);
    // clumps of hair, combed mostly downwards (v)
    for (let i = 0; i < 2600; i++) {
      const x = r() * S, y = r() * S, l = 6 + r() * 12, a = Math.PI / 2 + (r() - 0.5) * 0.7;
      const d = r() < 0.5;
      const col = d ? `rgba(40,30,22,${0.25 + r() * 0.3})` : `rgba(240,228,210,${0.2 + r() * 0.25})`;
      wrapAt(x, y, l, (ox, oy) => line(ox, oy, ox + Math.cos(a) * l, oy + Math.sin(a) * l, col, 1.5));
    }
    // mangy bald patches
    for (let i = 0; i < 6; i++) {
      const s = 6 + r() * 12;
      g.fillStyle = "rgba(210,160,150,0.35)";
      wrapAt(r() * S, r() * S, s, (x, y) => { g.beginPath(); g.arc(x, y, s, 0, 7); g.fill(); });
    }
  } else if (kind === "bark") {
    base(g, r, [176, 152, 124], 600, 40);
    // deep vertical fissures that wander
    for (let i = 0; i < 26; i++) {
      let x = r() * S;
      const w = 2 + r() * 5, col = `rgba(30,20,12,${0.5 + r() * 0.35})`;
      for (let y = -10; y < S + 10; y += 12) {
        const nx = x + (r() - 0.5) * 8;
        wrapAt(x, y, 16, (ox, oy) => line(ox, oy, ox + nx - x, oy + 12, col, w));
        x = nx;
      }
    }
    // pale ridges beside them
    for (let i = 0; i < 300; i++) {
      const x = r() * S, y = r() * S;
      g.fillStyle = `rgba(230,210,180,${0.15 + r() * 0.2})`;
      g.fillRect(x, y, 2, 6 + r() * 14);
    }
    // knots and lichen
    for (let i = 0; i < 5; i++) {
      const s = 6 + r() * 8;
      wrapAt(r() * S, r() * S, s * 2, (x, y) => {
        g.strokeStyle = "rgba(40,26,14,0.8)"; g.lineWidth = 3;
        g.beginPath(); g.ellipse(x, y, s, s * 1.6, 0, 0, 7); g.stroke();
        g.fillStyle = "rgba(20,12,6,0.9)"; g.beginPath(); g.ellipse(x, y, s * 0.4, s * 0.7, 0, 0, 7); g.fill();
      });
    }
    for (let i = 0; i < 30; i++) {
      g.fillStyle = `rgba(${120 + r() * 40},${150 + r() * 40},${90 + r() * 30},0.35)`;
      const s = 3 + r() * 8;
      wrapAt(r() * S, r() * S, s, (x, y) => { g.beginPath(); g.arc(x, y, s, 0, 7); g.fill(); });
    }
  } else if (kind === "oolite") {
    base(g, r, [232, 218, 184], 600, 30);
    // the ooids: tiny round grains
    for (let i = 0; i < 2600; i++) {
      const l = 150 + r() * 100;
      g.fillStyle = `rgba(${l},${l - 10},${l - 40},${0.3 + r() * 0.4})`;
      g.beginPath(); g.arc(r() * S, r() * S, 0.8 + r() * 1.6, 0, 7); g.fill();
    }
    // chisel tooling
    for (let i = 0; i < 160; i++) {
      const x = r() * S, y = r() * S;
      line(x, y, x + 6 + r() * 6, y + 2, `rgba(110,90,60,${0.2 + r() * 0.25})`, 1.5);
    }
    // cracks
    for (let i = 0; i < 6; i++) {
      let x = r() * S, y = r() * S, a = r() * 6.28;
      for (let k = 0; k < 10; k++) {
        const nx = x + Math.cos(a) * 12, ny = y + Math.sin(a) * 12;
        wrapAt(x, y, 14, (ox, oy) => line(ox, oy, ox + nx - x, oy + ny - y, "rgba(60,44,26,0.75)", 2));
        x = nx; y = ny; a += (r() - 0.5) * 1.4;
      }
    }
  } else if (kind === "rag") {
    base(g, r, [190, 178, 156], 700, 45);
    // weave
    for (let y = 0; y < S; y += 4) line(0, y, S, y, `rgba(60,50,36,${0.08 + r() * 0.08})`, 1);
    for (let x = 0; x < S; x += 4) line(x, 0, x, S, `rgba(60,50,36,${0.06 + r() * 0.06})`, 1);
    // stains: mud, old blood
    for (let i = 0; i < 18; i++) {
      const s = 10 + r() * 30, blood = r() < 0.35;
      g.fillStyle = blood ? `rgba(90,20,14,${0.2 + r() * 0.2})` : `rgba(70,56,36,${0.15 + r() * 0.2})`;
      wrapAt(r() * S, r() * S, s, (x, y) => { g.beginPath(); g.ellipse(x, y, s, s * 0.6, r() * 3, 0, 7); g.fill(); });
    }
    // patches and rents
    for (let i = 0; i < 7; i++) {
      const x = r() * S, y = r() * S, w = 14 + r() * 24, h = 4 + r() * 6;
      g.fillStyle = "rgba(20,15,10,0.85)";
      wrapAt(x, y, w, (ox, oy) => g.fillRect(ox, oy, w, h));
    }
  } else if (kind === "chitin") {
    base(g, r, [150, 132, 116], 500, 40);
    // dark bands across, with pale bristles
    for (let y = 0; y < S; y += 32) {
      g.fillStyle = `rgba(30,22,16,${0.35 + r() * 0.2})`;
      g.fillRect(0, y + 18, S, 10);
    }
    for (let i = 0; i < 1400; i++) {
      const x = r() * S, y = r() * S, l = 3 + r() * 7, a = Math.PI / 2 + (r() - 0.5) * 1.2;
      const col = r() < 0.6 ? `rgba(20,14,10,${0.3 + r() * 0.3})` : `rgba(230,214,190,${0.25 + r() * 0.3})`;
      wrapAt(x, y, l, (ox, oy) => line(ox, oy, ox + Math.cos(a) * l, oy + Math.sin(a) * l, col, 1.2));
    }
  } else if (kind === "mortar") {
    base(g, r, [186, 182, 174], 800, 40);
    // aggregate: pebbles and shards set in the mortar, each with a shadow
    for (let i = 0; i < 150; i++) {
      const x = r() * S, y = r() * S, s = 2 + r() * 9, l = 110 + r() * 110, warm = r() < 0.4 ? 20 : 0;
      wrapAt(x, y, s + 3, (ox, oy) => {
        g.fillStyle = "rgba(40,38,34,0.45)";
        g.beginPath(); g.ellipse(ox + 1.5, oy + 2, s, s * 0.75, 0, 0, 7); g.fill();
        g.fillStyle = `rgb(${l + warm},${l + warm * 0.5},${l - warm})`;
        g.beginPath(); g.ellipse(ox, oy, s, s * 0.75, r() * 3, 0, 7); g.fill();
      });
    }
    // wet streaks running down
    for (let i = 0; i < 40; i++) {
      const x = r() * S, y = r() * S, l = 20 + r() * 60;
      wrapAt(x, y, l, (ox, oy) => line(ox, oy, ox + (r() - 0.5) * 4, oy + l, `rgba(60,58,54,${0.15 + r() * 0.2})`, 2 + r() * 3));
    }
  } else if (kind === "iron") {
    base(g, r, [150, 148, 146], 600, 40);
    for (let i = 0; i < 60; i++) {
      const s = 4 + r() * 16;
      g.fillStyle = `rgba(${150 + r() * 50},${70 + r() * 30},${30},${0.3 + r() * 0.3})`;
      wrapAt(r() * S, r() * S, s, (x, y) => { g.beginPath(); g.ellipse(x, y, s, s * 0.7, r() * 3, 0, 7); g.fill(); });
    }
    for (let i = 0; i < 80; i++) {
      const x = r() * S, y = r() * S;
      line(x, y, x + 10 + r() * 20, y + (r() - 0.5) * 3, "rgba(230,230,230,0.25)", 1);
    }
  } else {
    // leather: creased and scuffed, with stitching
    base(g, r, [176, 150, 124], 700, 40);
    for (let i = 0; i < 90; i++) {
      const x = r() * S, y = r() * S, l = 8 + r() * 24, a = r() * 6.28;
      wrapAt(x, y, l, (ox, oy) => line(ox, oy, ox + Math.cos(a) * l, oy + Math.sin(a) * l, `rgba(50,32,18,${0.2 + r() * 0.3})`, 1 + r() * 1.5));
    }
    for (let y = 30; y < S; y += 96) for (let x = 0; x < S; x += 10) line(x, y, x + 6, y, "rgba(230,210,170,0.55)", 2);
  }
  return pixelTex(c, 64, 64, 20, seed);
}

/** A soft beam that fades from its source: bright at v = 1, nothing at v = 0. For lamp cones. */
export function beam(): THREE.CanvasTexture {
  const [c, g] = canvas(8, 64);
  const grd = g.createLinearGradient(0, 64, 0, 0);
  grd.addColorStop(0, "rgba(255,255,255,0)");
  grd.addColorStop(0.6, "rgba(255,255,255,0.35)");
  grd.addColorStop(1, "rgba(255,255,255,1)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 8, 64);
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** A ghost-light's face: a pale glow with two hollow eyes and a moaning mouth, on transparent. */
export function wispFace(): THREE.CanvasTexture {
  const [c, g] = canvas(64, 64);
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(240,250,255,1)");
  grd.addColorStop(0.35, "rgba(160,220,255,0.75)");
  grd.addColorStop(1, "rgba(60,120,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  g.globalCompositeOperation = "destination-out";
  g.fillStyle = "rgba(0,0,0,0.85)";
  g.beginPath(); g.ellipse(24, 28, 4.5, 6, 0.25, 0, 7); g.fill();
  g.beginPath(); g.ellipse(40, 28, 4.5, 6, -0.25, 0, 7); g.fill();
  g.fillStyle = "rgba(0,0,0,0.7)";
  g.beginPath(); g.ellipse(32, 42, 3.5, 5.5, 0, 0, 7); g.fill();
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export type BossHide = "plate" | "scales" | "ice" | "coat" | "weed";

/** Hides for the run bosses: riveted engine plate, basalt scales, glacier ice, a frock coat's broadcloth, river weed. */
export function bossHide(kind: BossHide, seed = 1): THREE.CanvasTexture {
  const [c, g] = canvas(S, S);
  const r = rng(seed * 131 + kind.length * 17);
  const line = (x0: number, y0: number, x1: number, y1: number, col: string, w: number) => {
    g.strokeStyle = col; g.lineWidth = w;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  };
  if (kind === "plate") {
    base(g, r, [168, 160, 150], 700, 40);
    // plates, each a little different, with rivet rows along their seams
    for (let y = 0; y < S; y += 64) for (let x = (y / 64) % 2 ? 32 : 0; x < S + 64; x += 128) {
      const l = (r() - 0.5) * 30;
      g.fillStyle = `rgba(${150 + l},${140 + l},${130 + l},0.5)`;
      g.fillRect(x % S, y, 126, 62);
      line(x % S, y, x % S, y + 64, "rgba(30,24,20,0.85)", 3);
      for (let k = 6; k < 64; k += 12) {
        g.fillStyle = "rgba(40,30,24,0.8)"; g.beginPath(); g.arc((x + 7) % S, y + k, 3, 0, 7); g.fill();
        g.fillStyle = "rgba(230,220,200,0.6)"; g.beginPath(); g.arc((x + 6) % S, y + k - 1, 1.3, 0, 7); g.fill();
      }
    }
    for (let y = 0; y < S; y += 64) line(0, y, S, y, "rgba(30,24,20,0.85)", 3);
    // rust blooms and streaks running down, and green slime from the water
    for (let i = 0; i < 50; i++) {
      const s = 5 + r() * 18;
      g.fillStyle = `rgba(${150 + r() * 60},${60 + r() * 30},20,${0.35 + r() * 0.3})`;
      wrapAt(r() * S, r() * S, s, (x, y) => { g.beginPath(); g.ellipse(x, y, s, s * 0.7, r() * 3, 0, 7); g.fill(); });
    }
    for (let i = 0; i < 60; i++) {
      const x = r() * S, y = r() * S, l = 20 + r() * 60;
      wrapAt(x, y, l, (ox, oy) => line(ox, oy, ox + (r() - 0.5) * 3, oy + l, `rgba(${120 + r() * 40},50,20,${0.2 + r() * 0.25})`, 2 + r() * 3));
    }
    for (let i = 0; i < 25; i++) {
      const s = 6 + r() * 14;
      g.fillStyle = `rgba(70,${110 + r() * 50},70,${0.25 + r() * 0.25})`;
      wrapAt(r() * S, r() * S, s, (x, y) => { g.beginPath(); g.ellipse(x, y, s * 1.5, s * 0.6, 0, 0, 7); g.fill(); });
    }
  } else if (kind === "scales") {
    base(g, r, [120, 108, 100], 400, 30);
    // overlapping scales, each darker at the edge, with fire showing in the cracks between
    g.fillStyle = "rgba(255,120,30,0.9)";
    g.fillRect(0, 0, S, S);
    for (let row = 0; row < 18; row++) for (let k = 0; k < 10; k++) {
      const x = k * 28 + (row % 2) * 14 + (r() - 0.5) * 4, y = row * 16 - 8;
      const l = 70 + r() * 50;
      wrapAt(x, y, 20, (ox, oy) => {
        g.fillStyle = `rgb(${l},${l * 0.92},${l * 0.86})`;
        g.beginPath(); g.ellipse(ox, oy + 10, 13, 13, 0, 0, Math.PI); g.lineTo(ox - 13, oy); g.fill();
        g.fillStyle = `rgba(255,255,255,${0.12 + r() * 0.12})`;
        g.beginPath(); g.ellipse(ox - 2, oy + 6, 6, 3, -0.3, 0, 7); g.fill();
        g.strokeStyle = "rgba(20,12,8,0.7)"; g.lineWidth = 1.5;
        g.beginPath(); g.ellipse(ox, oy + 10, 13, 13, 0, 0, Math.PI); g.stroke();
      });
    }
  } else if (kind === "ice") {
    base(g, r, [214, 232, 244], 600, 30);
    // deep blue where it's thick, white rime, cracks and trapped bubbles
    for (let i = 0; i < 30; i++) {
      const s = 10 + r() * 30;
      g.fillStyle = `rgba(${90 + r() * 40},${150 + r() * 40},${210 + r() * 40},${0.2 + r() * 0.25})`;
      wrapAt(r() * S, r() * S, s, (x, y) => { g.beginPath(); g.ellipse(x, y, s, s * 0.6, r() * 3, 0, 7); g.fill(); });
    }
    for (let i = 0; i < 14; i++) {
      let x = r() * S, y = r() * S, a = r() * 6.28;
      for (let k = 0; k < 8; k++) {
        const nx = x + Math.cos(a) * 14, ny = y + Math.sin(a) * 14;
        wrapAt(x, y, 16, (ox, oy) => { line(ox, oy, ox + nx - x, oy + ny - y, "rgba(255,255,255,0.8)", 1.5); line(ox + 1, oy + 1, ox + 1 + nx - x, oy + 1 + ny - y, "rgba(60,110,160,0.5)", 1); });
        x = nx; y = ny; a += (r() - 0.5) * 1.6;
      }
    }
    for (let i = 0; i < 90; i++) {
      const s = 1 + r() * 3;
      g.strokeStyle = "rgba(255,255,255,0.7)"; g.lineWidth = 1;
      wrapAt(r() * S, r() * S, s, (x, y) => { g.beginPath(); g.arc(x, y, s, 0, 7); g.stroke(); });
    }
  } else if (kind === "coat") {
    base(g, r, [200, 196, 204], 900, 25);
    // broadcloth: a fine twill, then mould, wear and moth
    for (let k = -S; k < S; k += 3) line(k, 0, k + S, S, `rgba(40,30,50,${0.06 + r() * 0.06})`, 1);
    for (let i = 0; i < 20; i++) {
      const s = 8 + r() * 26;
      g.fillStyle = `rgba(${90 + r() * 40},${120 + r() * 40},${90 + r() * 30},${0.12 + r() * 0.15})`;
      wrapAt(r() * S, r() * S, s, (x, y) => { g.beginPath(); g.ellipse(x, y, s, s * 0.6, r() * 3, 0, 7); g.fill(); });
    }
    for (let i = 0; i < 16; i++) {
      const s = 2 + r() * 5;
      g.fillStyle = "rgba(10,8,14,0.8)";
      wrapAt(r() * S, r() * S, s, (x, y) => { g.beginPath(); g.ellipse(x, y, s, s * 0.7, r() * 3, 0, 7); g.fill(); });
    }
    // a band of tarnished braid
    for (let y = 120; y < 136; y += 4) line(0, y, S, y, `rgba(220,190,110,${0.35 + r() * 0.2})`, 2);
  } else {
    // weed: dark strands with lighter edges
    base(g, r, [110, 130, 90], 300, 30);
    for (let i = 0; i < 200; i++) {
      const x = r() * S, y = r() * S, l = 20 + r() * 50;
      wrapAt(x, y, l, (ox, oy) => line(ox, oy, ox + (r() - 0.5) * 10, oy + l, `rgba(${30 + r() * 40},${60 + r() * 50},${30 + r() * 20},0.6)`, 1 + r() * 3));
    }
  }
  return pixelTex(c, 64, 64, 20, seed);
}
