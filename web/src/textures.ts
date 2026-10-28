// Procedural canvas textures, so the game ships no image files.
import * as THREE from "three";

export function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return [c, c.getContext("2d")!];
}

export function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export function tex(c: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * The art direction: chunky pixel-art surfaces, like a 90s Build-engine shooter but sharper.
 * Shrinks a detailed drawing to w x h, squeezes it onto a small palette with a little dither,
 * and shows it with crisp (nearest) texels up close. Mipmaps keep it from shimmering far off.
 * With cutout, alpha becomes all or nothing.
 */
export function pixelTex(src: HTMLCanvasElement, w: number, h: number, levels = 20, seed = 1, cutout = false): THREE.CanvasTexture {
  const [c, g] = canvas(w, h);
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
  g.drawImage(src, 0, 0, w, h);
  const img = g.getImageData(0, 0, w, h), d = img.data, r = rng(seed), step = 255 / levels;
  // cut-out pixels take the average colour, so mipmaps don't fringe the edges with black
  const avg = [0, 0, 0];
  if (cutout) {
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] >= 110) { avg[0] += d[i]; avg[1] += d[i + 1]; avg[2] += d[i + 2]; n++; }
    for (let ch = 0; ch < 3; ch++) avg[ch] /= n || 1;
  }
  for (let i = 0; i < d.length; i += 4) {
    if (cutout && d[i + 3] < 110) { d[i] = avg[0]; d[i + 1] = avg[1]; d[i + 2] = avg[2]; d[i + 3] = 0; continue; }
    const n = (r() - 0.5) * step * 0.9;
    for (let ch = 0; ch < 3; ch++) d[i + ch] = Math.min(255, Math.max(0, Math.round((d[i + ch] + n) / step) * step));
    if (cutout) d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = tex(c);
  t.magFilter = THREE.NearestFilter;
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
  return pixelTex(c, 128, 128, 24, 71);
}

/** The light from wall()'s window after dark: the glass glowing warm, the frame and glazing bars
 *  black. Used as the walls' glow map (world.ts lights some windows and not others). */
export function windowGlow(kind: "stone" | "brick" | "render"): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  g.fillStyle = "#000"; g.fillRect(0, 0, 256, 256);
  const wx = 82, wy = 58, ww = 92, wh = 128;
  const glass = g.createRadialGradient(wx + ww / 2, wy + wh * 0.65, 10, wx + ww / 2, wy + wh / 2, wh * 0.75);
  glass.addColorStop(0, "#ffe2a8"); glass.addColorStop(1, "#b8743a");
  g.fillStyle = glass; g.fillRect(wx, wy, ww, wh);
  g.fillStyle = "#000";
  g.fillRect(wx, wy + wh / 2 - 3, ww, 6);
  g.fillRect(wx + ww / 2 - 2, wy, 4, wh);
  if (kind === "stone") for (const f of [0.25, 0.75]) g.fillRect(wx, wy + wh * f - 1.5, ww, 3);
  return pixelTex(c, 128, 128, 64, 71);
}

/** Roof tiles in rows, near white for tinting. u covers 2 m, v covers 2 m. */
export function roofTiles(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  const r = rng(3);
  g.fillStyle = "#b9b9b9"; g.fillRect(0, 0, 256, 256);
  const rows = 10, rh = 256 / rows;
  for (let row = 0; row < rows; row++) {
    const off = (row % 2) * 13;
    for (let x = -off; x < 256; x += 26) {
      const l = 196 + r() * 50;
      g.fillStyle = `rgb(${l},${l},${l})`;
      g.fillRect(x + 1, row * rh, 24, rh - 2);
      g.fillStyle = "rgba(255,255,255,0.25)";      // lit top edge of each tile
      g.fillRect(x + 1, row * rh, 24, 2);
      g.fillStyle = "rgba(0,0,0,0.28)";            // shadow under the next row
      g.fillRect(x + 1, row * rh + rh - 5, 24, 3);
    }
  }
  return pixelTex(c, 96, 96, 18, 73);
}

/** Tufty detail multiplied over the ground colours (also gravel on the paths). */
export function groundDetail(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  const r = rng(5);
  g.fillStyle = "#d0d0d0"; g.fillRect(0, 0, 256, 256);
  // soft light and dark patches
  for (let i = 0; i < 70; i++) {
    const l = 165 + r() * 90;
    g.fillStyle = `rgba(${l},${l},${l},0.35)`;
    g.beginPath(); g.ellipse(r() * 256, r() * 256, 8 + r() * 26, 6 + r() * 18, r() * 3, 0, Math.PI * 2); g.fill();
  }
  // short strokes, like blades and stones
  for (let i = 0; i < 7000; i++) {
    const l = 130 + r() * 125;
    g.fillStyle = `rgba(${l},${l},${l},0.8)`;
    g.fillRect(r() * 256, r() * 256, 1 + r() * 2, 2 + r() * 4);
  }
  return pixelTex(c, 256, 256, 16, 75);
}

/** Smooth, tileable value noise (0 to 1 in red), for large-scale mottling of the ground. */
export function mottle(): THREE.CanvasTexture {
  const N = 64, G = 8, r = rng(91);
  const grid = Array.from({ length: G * G }, () => r());
  const at = (i: number, j: number) => grid[((j + G) % G) * G + ((i + G) % G)];
  const [c, g] = canvas(N, N);
  const img = g.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const fx = (x / N) * G, fy = (y / N) * G, i = Math.floor(fx), j = Math.floor(fy);
    const u = fx - i, v = fy - j, su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
    const val = (at(i, j) * (1 - su) + at(i + 1, j) * su) * (1 - sv) + (at(i, j + 1) * (1 - su) + at(i + 1, j + 1) * su) * sv;
    const k = (y * N + x) * 4;
    img.data[k] = img.data[k + 1] = img.data[k + 2] = val * 255; img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return tex(c, false);
}

/** Asphalt with chunky aggregate. */
export function asphalt(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  const r = rng(9);
  g.fillStyle = "#d8d8d8"; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 40; i++) {
    const l = 190 + r() * 60;
    g.fillStyle = `rgba(${l},${l},${l},0.4)`;
    g.beginPath(); g.arc(r() * 128, r() * 128, 4 + r() * 14, 0, Math.PI * 2); g.fill();
  }
  for (let i = 0; i < 2600; i++) {
    const l = 150 + r() * 105;
    g.fillStyle = `rgb(${l},${l},${l})`;
    g.fillRect(r() * 128, r() * 128, 1 + r(), 1 + r());
  }
  return pixelTex(c, 128, 128, 14, 77);
}

/** Bark in deep vertical furrows, near white for tinting. */
export function bark(): THREE.CanvasTexture {
  const [c, g] = canvas(64, 128);
  const r = rng(13);
  g.fillStyle = "#d6cbbb"; g.fillRect(0, 0, 64, 128);
  for (let i = 0; i < 26; i++) {
    const x = r() * 64, w = 2 + r() * 4;
    g.fillStyle = `rgba(50,36,24,${0.35 + r() * 0.35})`;
    g.fillRect(x, 0, w, 128);
    g.fillStyle = "rgba(255,248,235,0.3)";
    g.fillRect(x + w, 0, 1, 128);
  }
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(40,30,20,${0.2 + r() * 0.3})`;
    g.fillRect(r() * 64, r() * 128, 3 + r() * 8, 1 + r() * 2);
  }
  return pixelTex(c, 32, 64, 12, 79);
}

/** Label sprite texture for a player's name. */
export function nameLabel(text: string, colour: string): THREE.CanvasTexture {
  // drawn at twice the size it's shown, so it stays sharp up close
  const [c, g] = canvas(512, 128);
  g.textAlign = "center"; g.textBaseline = "middle";
  // a long name ("Mr Pettigrew, Curator") gets smaller type rather than losing its ends
  let size = 60;
  g.font = `600 ${size}px system-ui, sans-serif`;
  const room = 512 - 2 * 28 - 8;
  const wide = g.measureText(text).width;
  if (wide > room) { size = Math.max(30, Math.floor((size * room) / wide)); g.font = `600 ${size}px system-ui, sans-serif`; }
  const w = Math.min(504, g.measureText(text).width + 56);
  g.fillStyle = "rgba(10,14,18,0.72)";
  g.beginPath(); g.roundRect(256 - w / 2, 20, w, 88, 24); g.fill();
  // in their own colour, but never so dark it disappears into the band (a curator's navy coat)
  const c0 = new THREE.Color(colour), hex = c0.getHex(), hsl = { h: 0, s: 0, l: 0 };
  const bright = (0.299 * (hex >> 16) + 0.587 * ((hex >> 8) & 255) + 0.114 * (hex & 255)) / 255;
  c0.getHSL(hsl);
  g.fillStyle = bright >= 0.45 ? colour : `#${new THREE.Color().setHSL(hsl.h, Math.min(hsl.s, 0.6), 0.8).getHexString()}`;
  g.fillText(text, 256, 66, 504 - 40);
  return tex(c);
}

/** Sound waves shown over a player who is talking. */
export function talkIcon(): THREE.CanvasTexture {
  const [c, g] = canvas(64, 64);
  g.strokeStyle = g.fillStyle = "#ffdd00";
  g.lineWidth = 6; g.lineCap = "round";
  g.beginPath(); g.arc(12, 32, 6, 0, Math.PI * 2); g.fill();
  for (const r of [16, 28, 40]) { g.beginPath(); g.arc(12, 32, r, -0.75, 0.75); g.stroke(); }
  return tex(c);
}

/** Close-board fence: vertical boards with a rail line. u covers 2 m, v covers 2 m. */
export function boards(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  const r = rng(19);
  for (let x = 0; x < 128; x += 8) {
    const l = 200 + r() * 50;
    g.fillStyle = `rgb(${l},${l - 6},${l - 14})`;
    g.fillRect(x, 0, 8, 128);
    g.fillStyle = "rgba(60,40,20,0.45)";
    g.fillRect(x + 7, 0, 1, 128);
    g.fillStyle = "rgba(255,250,240,0.3)";
    g.fillRect(x, 0, 1, 128);
  }
  g.fillStyle = "rgba(60,40,20,0.3)";
  g.fillRect(0, 20, 128, 3);
  return pixelTex(c, 64, 64, 16, 81);
}

/** Leafy hedge and woodland canopy surface: pixel-art leaves, lit from above. */
export function leaves(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  const r = rng(23);
  g.fillStyle = "#56693f"; g.fillRect(0, 0, 128, 128);
  leafCluster(g, 128, 2200, r);
  return pixelTex(c, 64, 64, 18, 83);
}

/** Lots of little leaves, each with a lit top and a shaded underside; wraps at the edges. */
function leafCluster(g: CanvasRenderingContext2D, S: number, n: number, r: () => number) {
  for (let i = 0; i < n; i++) {
    const x = r() * S, y = r() * S, a = r() * Math.PI, len = 3 + r() * 4, wid = 1.6 + r() * 1.6;
    const l = Math.min(1, 0.5 + r() * 0.55);
    for (const [ox, oy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) {
      g.fillStyle = `rgb(${55 + 110 * l},${80 + 135 * l},${40 + 70 * l})`;
      g.beginPath(); g.ellipse(x + ox, y + oy, len, wid, a, 0, Math.PI * 2); g.fill();
      g.fillStyle = `rgba(230,255,190,${0.25 * l})`;
      g.beginPath(); g.ellipse(x + ox - 0.8, y + oy - 0.8, len * 0.5, wid * 0.5, a, 0, Math.PI * 2); g.fill();
    }
  }
}

/** Foliage for the tree crowns: clumps of leaves with gaps you can see through (alpha cutout). */
export function foliage(): THREE.CanvasTexture {
  const S = 128;
  const [c, g] = canvas(S, S);
  const r = rng(61);
  g.clearRect(0, 0, S, S);
  // a few dark backing blobs fill out the clumps, then leaves over them
  for (let i = 0; i < 10; i++) {
    const x = r() * S, y = r() * S, rad = 6 + r() * 8;
    for (const [ox, oy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) {
      g.fillStyle = "rgb(62,92,44)";
      g.beginPath(); g.arc(x + ox, y + oy, rad, 0, Math.PI * 2); g.fill();
    }
  }
  leafCluster(g, S, 520, r);
  return pixelTex(c, 64, 64, 18, 85, true);
}

/** Iron railings: bars with transparent gaps (used with alphaTest). u covers 2 m, v covers 2 m. */
export function railings(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  g.clearRect(0, 0, 128, 128);
  g.fillStyle = "#e8e8e8";
  // v runs from 0.4 m below ground (bottom of the canvas) upwards, 64 px per metre
  const y = (m: number) => 128 - (m + 0.4) * 64;
  for (let x = 2; x < 128; x += 8) g.fillRect(x, y(0.95), 3, 128 - y(0.95));   // bars up to 0.95 m
  g.fillRect(0, y(0.85), 128, 4); g.fillRect(0, y(0.15), 128, 4);                 // rails
  for (let x = 2; x < 128; x += 8) { g.beginPath(); g.moveTo(x - 1, y(0.95)); g.lineTo(x + 1.5, y(1.02)); g.lineTo(x + 4, y(0.95)); g.fill(); }  // spear tops
  return tex(c);
}

/**
 * Blood splats, four to a 2x2 atlas: a pool with spatter round it, two spattered splashes and
 * a small drip. Red on transparent.
 */
export function bloodSplats(): THREE.CanvasTexture {
  const S = 256, T = S / 2;
  const [c, g] = canvas(S, S);
  const r = rng(29);
  const blob = (x: number, y: number, rad: number, col: string) => {
    g.fillStyle = col;
    g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
  };
  for (let tile = 0; tile < 4; tile++) {
    const ox = (tile % 2) * T, oy = Math.floor(tile / 2) * T, cx = ox + T / 2, cy = oy + T / 2;
    g.save();
    g.beginPath(); g.rect(ox + 1, oy + 1, T - 2, T - 2); g.clip();
    const main = tile === 0 ? 30 : tile === 3 ? 16 : 20;
    // the body of the splat: overlapping lumps
    for (let i = 0; i < 9; i++) {
      const a = r() * Math.PI * 2, d = r() * main * 0.55;
      blob(cx + Math.cos(a) * d, cy + Math.sin(a) * d, main * (0.45 + r() * 0.4), "rgba(112, 6, 8, 0.92)");
    }
    // darker, wetter middle
    const grad = g.createRadialGradient(cx, cy, 0, cx, cy, main);
    grad.addColorStop(0, "rgba(70, 0, 2, 0.75)");
    grad.addColorStop(1, "rgba(70, 0, 2, 0)");
    g.fillStyle = grad;
    g.fillRect(ox, oy, T, T);
    // spatter flung outwards, mostly one way on the splashes
    const drops = tile === 3 ? 6 : 26;
    for (let i = 0; i < drops; i++) {
      const a = tile === 1 || tile === 2 ? -Math.PI / 2 + (r() - 0.5) * 1.6 : r() * Math.PI * 2;
      const d = main * (0.9 + r() * 1.5), rad = 1 + r() * 4.5 * (1 - d / (main * 2.6));
      const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
      blob(x, y, Math.max(0.8, rad), "rgba(118, 8, 10, 0.95)");
      if (r() < 0.35) {   // a streak back towards the middle
        g.strokeStyle = "rgba(118, 8, 10, 0.8)"; g.lineWidth = Math.max(0.8, rad * 0.8);
        g.beginPath(); g.moveTo(x, y); g.lineTo(cx + Math.cos(a) * main * 0.7, cy + Math.sin(a) * main * 0.7); g.stroke();
      }
    }
    g.restore();
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/**
 * Paintball splats, laid out like the blood: a big splat with drops flung all round it, two
 * splashes thrown one way and a small spot. White, with a glossy middle, so each one can be
 * tinted to the colour of whoever fired it.
 */
export function paintSplats(): THREE.CanvasTexture {
  const S = 256, T = S / 2;
  const [c, g] = canvas(S, S);
  const r = rng(43);
  const blob = (x: number, y: number, rad: number, col: string) => {
    g.fillStyle = col;
    g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
  };
  for (let tile = 0; tile < 4; tile++) {
    const ox = (tile % 2) * T, oy = Math.floor(tile / 2) * T, cx = ox + T / 2, cy = oy + T / 2;
    g.save();
    g.beginPath(); g.rect(ox + 1, oy + 1, T - 2, T - 2); g.clip();
    const main = tile === 0 ? 30 : tile === 3 ? 14 : 18;
    const one = tile === 1 || tile === 2;
    // the burst: a round middle with fingers of paint shooting out of it
    blob(cx, cy, main * 0.8, "rgba(255,255,255,0.97)");
    const arms = tile === 3 ? 6 : 11;
    for (let i = 0; i < arms; i++) {
      const a = one ? -Math.PI / 2 + (r() - 0.5) * 1.9 : r() * Math.PI * 2;
      const len = main * (0.9 + r() * (one ? 1.6 : 0.9)), w = main * (0.18 + r() * 0.2);
      g.strokeStyle = "rgba(255,255,255,0.97)"; g.lineWidth = w; g.lineCap = "round";
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len); g.stroke();
      blob(cx + Math.cos(a) * len, cy + Math.sin(a) * len, w * 0.75, "rgba(255,255,255,0.97)");
    }
    // drops flung further out
    const drops = tile === 3 ? 5 : 18;
    for (let i = 0; i < drops; i++) {
      const a = one ? -Math.PI / 2 + (r() - 0.5) * 1.4 : r() * Math.PI * 2;
      const d = main * (1.5 + r() * 1.3);
      blob(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 1.2 + r() * 3.5, "rgba(255,255,255,0.95)");
    }
    // a little darker round the rim and a shine in the middle, so it looks wet
    const grad = g.createRadialGradient(cx - main * 0.2, cy - main * 0.2, 0, cx, cy, main * 1.6);
    grad.addColorStop(0, "rgba(255,255,255,0)");
    grad.addColorStop(1, "rgba(150,150,150,0.5)");
    g.globalCompositeOperation = "source-atop";
    g.fillStyle = grad;
    g.fillRect(ox, oy, T, T);
    g.globalCompositeOperation = "source-over";
    g.restore();
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/**
 * Bloody shoe prints, four to a 2x2 atlas: left, right, then a smudged left and right.
 * Toes point up the texture.
 */
export function shoePrints(ink = "rgba(105, 6, 8, 0.95)"): THREE.CanvasTexture {
  const S = 256, T = S / 2;
  const [c, g] = canvas(S, S);
  const r = rng(51);
  for (let tile = 0; tile < 4; tile++) {
    const ox = (tile % 2) * T, oy = Math.floor(tile / 2) * T, cx = ox + T / 2, cy = oy + T / 2;
    const side = tile % 2 === 0 ? -1 : 1, smudge = tile >= 2;
    g.save();
    g.beginPath(); g.rect(ox, oy, T, T); g.clip();
    g.translate(cx, cy);
    g.fillStyle = ink;
    // forefoot, bulging to the big-toe side, then the heel
    g.beginPath(); g.ellipse(side * 3, -22, 19, 30, side * 0.08, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(side * -1, 34, 15, 19, 0, 0, Math.PI * 2); g.fill();
    // tread: cut stripes out of the sole
    g.globalCompositeOperation = "destination-out";
    g.strokeStyle = "rgba(0,0,0,0.85)"; g.lineWidth = 2.5;
    for (let y = -52; y < 56; y += 7) { g.beginPath(); g.moveTo(-22, y); g.lineTo(22, y + 3); g.stroke(); }
    // patchy where the shoe was drying out
    for (let i = 0; i < (smudge ? 70 : 30); i++) {
      g.fillStyle = `rgba(0,0,0,${0.4 + r() * 0.6})`;
      g.beginPath(); g.arc((r() - 0.5) * 44, (r() - 0.5) * 112, 1.5 + r() * (smudge ? 7 : 4), 0, Math.PI * 2); g.fill();
    }
    g.restore();
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** How each picture in treeSprites() sits on its quad, in the plant's own metres before it's
 *  scaled: width, height and how far below its foot the bottom edge is. Trees (cells 0 to 2) share
 *  one frame, shrubs (cell 3) another. trees.ts draws the quads to match. */
export const SPRITE_FRAMES = { tree: [7.2, 10.8, -0.3], shrub: [1.6, 1.2, -0.05] };

/**
 * Far-off trees and shrubs as flat pictures, Duke Nukem style (trees.ts turns each to face you):
 * four side by side, two broadleaf trees, a conifer and a garden shrub, drawn like the 3D ones
 * (the same lumps of leaves, trunk and limbs) and shaded lighter on top. Leaves are on
 * transparent, for an alpha cutout, and kept fairly neutral green so each plant's tint shows.
 */
export function treeSprites(): THREE.CanvasTexture {
  const C = 256, [c, g] = canvas(C * 4, C);
  g.clearRect(0, 0, C * 4, C);
  const r = rng(47);
  // cell k, frame [w, h, base]: metres to pixels
  let ox = 0, fw = 1, fh = 1, fb = 0;
  const cell = (k: number, f: number[]) => { ox = k * C; [fw, fh, fb] = f; };
  const X = (x: number) => ox + (x / fw + 0.5) * C, Y = (y: number) => C - ((y - fb) / fh) * C;
  const S = (m: number) => (m / fw) * C;            // a width in metres, in pixels
  const leaf = (l: number, shade: number) => `rgb(${(55 + 110 * l) * shade},${(80 + 135 * l) * shade},${(40 + 70 * l) * shade})`;
  /** A lump of leaves round (x, y), rx by ry metres: a dark mass with leaves over it, lit from above. */
  const lump = (x: number, y: number, rx: number, ry: number, n: number, dark = 1) => {
    g.fillStyle = `rgb(${50 * dark},${76 * dark},${38 * dark})`;
    g.beginPath(); g.ellipse(X(x), Y(y), S(rx * 0.92), (ry * 0.92 / fh) * C, 0, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 1.05;
      const lx = x + Math.cos(a) * rx * d, ly = y + Math.sin(a) * ry * d;
      const up = Math.min(1, Math.max(0, 0.5 + (ly - y) / ry * 0.5));
      const l = Math.min(1, 0.35 + r() * 0.5 + up * 0.25);
      g.fillStyle = leaf(l, (0.55 + 0.45 * up) * dark);
      const k = fw / 7.2;   // (leaves come out the same size in pixels on a shrub as on a tree)
      g.beginPath(); g.ellipse(X(lx), Y(ly), S((0.16 + r() * 0.14) * k), S((0.08 + r() * 0.08) * k), r() * Math.PI, 0, Math.PI * 2); g.fill();
    }
  };
  const bark = (pts: number[][], w0: number, w1: number) => {
    const [a, b] = pts;
    g.fillStyle = "#5e5042";
    g.beginPath(); g.moveTo(X(a[0] - w0), Y(a[1])); g.lineTo(X(b[0] - w1), Y(b[1])); g.lineTo(X(b[0] + w1), Y(b[1])); g.lineTo(X(a[0] + w0), Y(a[1])); g.fill();
    g.fillStyle = "#3e342b";
    g.beginPath(); g.moveTo(X(a[0] + w0 * 0.2), Y(a[1])); g.lineTo(X(b[0] + w1 * 0.2), Y(b[1])); g.lineTo(X(b[0] + w1), Y(b[1])); g.lineTo(X(a[0] + w0), Y(a[1])); g.fill();
  };
  // two broadleaf trees: a trunk forking into limbs, a ring of lumps and two on top (as trees.ts)
  for (const k of [0, 1]) {
    cell(k, SPRITE_FRAMES.tree);
    bark([[0, -0.3], [0, 3.2]], 0.27, 0.19);
    bark([[0, 3.2], [0.1, 5.6]], 0.19, 0.08);
    for (let j = 0; j < 4; j++) { const a = j * 1.7 + 0.4 + k, h = 2.6 + j * 0.45; bark([[0, h], [Math.cos(a) * 1.7, h + 1.7]], 0.11, 0.035); }
    const lumps: number[][] = [];
    for (let j = 0; j < 6; j++) {
      const a = (j / 6) * Math.PI * 2 + r() * 0.6, d = 1.3 + r() * 0.4, h = 3.9 + r() * 1.9, s = 1.05 + r() * 0.4;
      lumps.push([Math.cos(a) * d, h, s, s * 0.85, Math.sin(a) * d]);
    }
    lumps.push([0, 5.1, 1.8, 1.6, 0], [0.2, 6.4, 1.3, 1.1, 0.1]);
    // the ones behind first, a little darker
    lumps.sort((p, q) => p[4] - q[4]);
    for (const [x, y, rx, ry, z] of lumps) lump(x, y, rx, ry, 240, z < -0.5 ? 0.8 : 1);
  }
  // a conifer: tiers of drooping cones, smaller up the tree, on a short trunk
  cell(2, SPRITE_FRAMES.tree);
  bark([[0, -0.3], [0, 2.5]], 0.2, 0.14);
  for (let t = 0; t < 6; t++) {
    const f = t / 6, rad = 2.3 * (1 - f * 0.85), h = 2.4 * (1 - f * 0.3), y = 1.5 + f * 7.2;
    g.fillStyle = "rgb(36,58,40)";
    g.beginPath(); g.moveTo(X(0), Y(y + h));
    for (let s = 0; s <= 10; s++) { const x = -rad + (2 * rad * s) / 10; g.lineTo(X(x), Y(y - 0.25 * Math.abs(Math.sin(s * 1.6 + t)))); }
    g.closePath(); g.fill();
    for (let i = 0; i < 160; i++) {
      const v = r(), x = (r() * 2 - 1) * rad * (1 - v), ly = y + v * h;
      const l = 0.3 + r() * 0.4 + v * 0.3;
      g.fillStyle = `rgb(${(40 + 70 * l) * 0.9},${(70 + 110 * l) * 0.9},${(50 + 70 * l) * 0.9})`;
      g.fillRect(X(x) - 2, Y(ly) - 1, 4 + r() * 4, 2 + r() * 2);
    }
  }
  // a shrub: four lumps, as trees.ts's
  cell(3, SPRITE_FRAMES.shrub);
  for (const [x, y, rx, ry] of [[0.3, 0.35, 0.42, 0.36], [-0.25, 0.38, 0.45, 0.38], [0, 0.45, 0.62, 0.48], [0.05, 0.62, 0.38, 0.32]]) lump(x, y, rx, ry, 260);
  const t = pixelTex(c, 512, 128, 18, 53, true);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;   // (so one picture doesn't bleed into the next)
  return t;
}
