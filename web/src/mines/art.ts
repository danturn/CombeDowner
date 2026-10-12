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
export function floor(seed = 5): THREE.CanvasTexture {
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
  return pixelTex(c, 64, 64, 18, seed);
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
