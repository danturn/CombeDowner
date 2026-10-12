// Procedural canvas textures, so the game ships no image files.
import * as THREE from "three";

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return [c, c.getContext("2d")!];
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function tex(c: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Bath stone ashlar. Kept near white so vertex colours can tint each building. */
function stone(g: CanvasRenderingContext2D, w: number, h: number, r: () => number) {
  g.fillStyle = "#f2ead8";
  g.fillRect(0, 0, w, h);
  const course = h / 8;
  for (let row = 0; row < 8; row++) {
    const y = row * course, off = (row % 2) * 0.5;
    let x = -off * 64;
    while (x < w) {
      const bw = 48 + r() * 40, l = 225 + r() * 25;
      g.fillStyle = `rgb(${l},${l - 8 - r() * 6},${l - 26 - r() * 10})`;
      g.fillRect(x + 1, y + 1, bw - 2, course - 2);
      x += bw;
    }
    g.fillStyle = "rgba(120,100,70,0.35)";
    g.fillRect(0, y, w, 1.5);
  }
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? "90,80,60" : "255,250,235"},${0.05 + r() * 0.08})`;
    g.fillRect(r() * w, r() * h, 2, 2);
  }
}

/** Brick in stretcher bond, near white so vertex colours set red or buff. */
function brick(g: CanvasRenderingContext2D, w: number, h: number, r: () => number) {
  g.fillStyle = "#d9d4cc";
  g.fillRect(0, 0, w, h);
  const course = h / 26, bw = w / 6;
  for (let row = 0; row < 26; row++) {
    const off = (row % 2) * bw / 2;
    for (let x = -off; x < w; x += bw) {
      const l = 215 + r() * 40;
      g.fillStyle = `rgb(${l},${l - 4},${l - 8})`;
      g.fillRect(x + 1, row * course + 1, bw - 2, course - 1.5);
    }
  }
}

/** Smooth render with faint weathering. */
function render(g: CanvasRenderingContext2D, w: number, h: number, r: () => number) {
  g.fillStyle = "#f4f2ee";
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? "120,115,105" : "255,255,255"},${0.03 + r() * 0.05})`;
    g.fillRect(r() * w, r() * h, 2 + r() * 4, 2 + r() * 4);
  }
}

/** One bay of one storey (3.4 m wide, one storey tall), optionally with a sash window. */
export function wall(kind: "stone" | "brick" | "render", withWindow: boolean): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  const r = rng(kind === "stone" ? 7 : kind === "brick" ? 17 : 27);
  if (kind === "stone") stone(g, 256, 256, r); else if (kind === "brick") brick(g, 256, 256, r); else render(g, 256, 256, r);
  if (withWindow) {
    const wx = 82, wy = 58, ww = 92, wh = 128;
    g.fillStyle = kind === "brick" ? "#b9b2a6" : "#d9cdb0"; g.fillRect(wx - 8, wy - 12, ww + 16, 12);   // lintel
    g.fillStyle = "#e6e0d2"; g.fillRect(wx - 4, wy - 2, ww + 8, wh + 4);
    const glass = g.createLinearGradient(wx, wy, wx + ww, wy + wh);
    glass.addColorStop(0, "#3d4c5a"); glass.addColorStop(0.55, "#22303c"); glass.addColorStop(1, "#4d6070");
    g.fillStyle = glass; g.fillRect(wx, wy, ww, wh);
    g.fillStyle = "#ece8de";
    g.fillRect(wx, wy + wh / 2 - 3, ww, 6);
    g.fillRect(wx + ww / 2 - 2, wy, 4, wh);
    if (kind === "stone") for (const f of [0.25, 0.75]) g.fillRect(wx, wy + wh * f - 1.5, ww, 3);   // Georgian glazing bars
    g.fillStyle = kind === "brick" ? "#c4bdb1" : "#d4c7a8"; g.fillRect(wx - 10, wy + wh + 2, ww + 20, 9);   // sill
  }
  return tex(c);
}

/** Roof tiles in rows, near white for tinting. u covers 2 m, v covers 2 m. */
export function roofTiles(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  const r = rng(3);
  g.fillStyle = "#c9c9c9"; g.fillRect(0, 0, 256, 256);
  const rows = 10, rh = 256 / rows;
  for (let row = 0; row < rows; row++) {
    const off = (row % 2) * 13;
    for (let x = -off; x < 256; x += 26) {
      const l = 200 + r() * 45;
      g.fillStyle = `rgb(${l},${l},${l})`;
      g.fillRect(x + 1, row * rh, 24, rh - 2);
      g.fillStyle = "rgba(0,0,0,0.18)";
      g.fillRect(x + 1, row * rh + rh - 4, 24, 2);
    }
  }
  return tex(c);
}

/** Speckled detail multiplied over the ground colours. */
export function groundDetail(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  const r = rng(5);
  g.fillStyle = "#d8d8d8"; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) {
    const l = 150 + r() * 105;
    g.fillStyle = `rgba(${l},${l},${l},0.7)`;
    g.fillRect(r() * 256, r() * 256, 1 + r() * 2, 1 + r() * 3);
  }
  return tex(c);
}

/** Asphalt with faint aggregate. */
export function asphalt(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  const r = rng(9);
  g.fillStyle = "#e0e0e0"; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 3000; i++) {
    const l = 170 + r() * 85;
    g.fillStyle = `rgb(${l},${l},${l})`;
    g.fillRect(r() * 128, r() * 128, 1, 1);
  }
  return tex(c);
}

export function bark(): THREE.CanvasTexture {
  const [c, g] = canvas(64, 128);
  const r = rng(13);
  g.fillStyle = "#cfc4b4"; g.fillRect(0, 0, 64, 128);
  for (let i = 0; i < 60; i++) {
    g.fillStyle = `rgba(60,45,30,${0.2 + r() * 0.3})`;
    g.fillRect(r() * 64, 0, 1 + r() * 3, 128);
  }
  return tex(c);
}

/** Label sprite texture for a player's name. */
export function nameLabel(text: string, colour: string): THREE.CanvasTexture {
  const [c, g] = canvas(256, 64);
  g.font = "600 30px system-ui, sans-serif";
  g.textAlign = "center"; g.textBaseline = "middle";
  const w = Math.min(250, g.measureText(text).width + 28);
  g.fillStyle = "rgba(10,14,18,0.6)";
  g.beginPath(); g.roundRect(128 - w / 2, 10, w, 44, 12); g.fill();
  g.fillStyle = colour;
  g.fillText(text, 128, 33);
  return tex(c);
}
