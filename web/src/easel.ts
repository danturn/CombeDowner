// The easel: a paint program of your own for the Art Gallery (gallery.ts), done up like the one
// that came free with the family computer. A grey window with a toolbox down the side (pencil,
// brush, spray can, fill bucket, line, rectangle, ellipse, eraser and the colour picker), brush
// sizes under it, sixteen colours along the bottom (left click or tap paints in the first, right
// click in the second, as it always did), undo and clear, and the subject and the clock up top.
// The picture is small and blocky on purpose (W x H pixels, each one of the sixteen colours), so
// it looks the part and goes over the network in a few kilobytes.
//
// While it's up it has the mouse and the keyboard to itself: the mouse is let go (main.ts asks
// easelUp() before it treats that as a pause) and keys are caught before the game sees them, so
// painting doesn't walk you about. Esc steps back from the easel; Ctrl+Z undoes. A pad can't paint
// (it has no pointer), but it goes round the buttons as it does a menu. A strip under the colours
// names the controls for the input in use, from the easel's table in controls.ts.
//
// Who decides what: nobody. The painting is yours until you hang it; encode() is what goes round,
// with howText() in front of it, the easel's note of how it was painted, for the host's critics.
// The easel also keeps a few snapshots as you paint, and replay() packs them (encodeReplay) for the
// time-lapse each painting plays when the show opens.
import * as SFX from "./audio";
import { ctl, strip } from "./controls";

export const W = 240, H = 180;
/** The sixteen colours, white first: a blank canvas is all zeros. */
export const PALETTE = ["#ffffff", "#000000", "#7f7f7f", "#c3c3c3", "#e8231f", "#ff8a1e", "#ffe11a", "#d9b77a",
  "#8a5426", "#1f7a2c", "#5fd14a", "#8fd3ff", "#2f5fe0", "#1b2a6b", "#8e3fc4", "#ff8fc8"] as const;
export const COLOUR_NAMES = ["white", "black", "grey", "pale grey", "pillar-box red", "orange", "yellow", "Bath stone",
  "brown", "bottle green", "grass green", "sky blue", "blue", "navy", "purple", "pink"];
export const C = { white: 0, black: 1, grey: 2, pale: 3, red: 4, orange: 5, yellow: 6, stone: 7, brown: 8, dkgreen: 9, green: 10, sky: 11, blue: 12, navy: 13, purple: 14, pink: 15 } as const;

const RGBA = new Uint32Array(PALETTE.map((h) => {
  const n = parseInt(h.slice(1), 16);
  return (0xff << 24) | ((n & 0xff) << 16) | (n & 0xff00) | ((n >> 16) & 0xff);
}));

/** Paint a painting into image data (its pixels as palette numbers). */
export function toImage(px: Uint8Array, img: ImageData) {
  const out = new Uint32Array(img.data.buffer);
  for (let i = 0; i < px.length; i++) out[i] = RGBA[px[i] & 15];
}

// ---- over the network: runs of a colour, a byte each (colour, then the run's length), base64 ----

/** A painting as a short string: each run of one colour a byte (colour in the top half, run-1 in the
 *  bottom), and a run of 16 or more marked 15 with its length after it, seven bits a byte. */
export function encode(px: Uint8Array): string {
  const out: number[] = [];
  for (let i = 0; i < px.length;) {
    const c = px[i] & 15;
    let j = i + 1;
    while (j < px.length && px[j] === c) j++;
    const run = j - i;
    if (run <= 15) out.push((c << 4) | (run - 1));
    else {
      out.push((c << 4) | 15);
      let v = run - 16;
      while (v >= 128) { out.push((v & 127) | 128); v >>>= 7; }
      out.push(v);
    }
    i = j;
  }
  let s = "";
  for (let i = 0; i < out.length; i += 8192) s += String.fromCharCode(...out.slice(i, i + 8192));
  return btoa(s);
}

/** And back; whatever comes in, the answer is always a whole canvas. */
export function decode(s: string): Uint8Array {
  const px = new Uint8Array(W * H);
  let bin = "";
  try { bin = atob(s); } catch { return px; }
  let p = 0;
  for (let i = 0; i < bin.length && p < px.length;) {
    const b = bin.charCodeAt(i++), c = b >> 4;
    let run = (b & 15) + 1;
    if ((b & 15) === 15) {
      let v = 0, shift = 0, k: number;
      do { k = bin.charCodeAt(i++) || 0; v |= (k & 127) << shift; shift += 7; } while (k & 128 && shift < 28 && i < bin.length);
      run = 16 + v;
    }
    const end = Math.min(px.length, p + run);
    px.fill(c, p, end);
    p = end;
  }
  return px;
}

// ---- the time-lapse: snapshots as it was painted -----------------------------------------------------

/** Most snapshots a replay carries, and the most text it may take, so a long painting stays small. */
export const REPLAY_FRAMES = 40, REPLAY_MAX = 60000;
const SAME = 16;

/** Snapshots as one string: each one as runs against the one before (the first against a blank
 *  canvas), a run being a byte (what's there: a colour, or 16 for "as before", then its length less
 *  one in the top three bits, 7 meaning the length follows, seven bits a byte), base64. */
export function encodeReplay(frames: Uint8Array[]): string {
  const out: number[] = [Math.min(255, frames.length)];
  let prev: Uint8Array = new Uint8Array(W * H);
  for (const f of frames.slice(0, 255)) {
    for (let i = 0; i < f.length;) {
      const sym = f[i] === prev[i] ? SAME : f[i] & 15;
      let j = i + 1;
      while (j < f.length && (sym === SAME ? f[j] === prev[j] : f[j] === sym)) j++;
      const run = j - i;
      if (run <= 7) out.push(sym | ((run - 1) << 5));
      else {
        out.push(sym | (7 << 5));
        let v = run - 8;
        while (v >= 128) { out.push((v & 127) | 128); v >>>= 7; }
        out.push(v);
      }
      i = j;
    }
    prev = f;
  }
  let s = "";
  for (let i = 0; i < out.length; i += 8192) s += String.fromCharCode(...out.slice(i, i + 8192));
  return btoa(s);
}

/** And back; nothing at all if it's garbled, so the painting just hangs as it is. */
export function decodeReplay(s: string): Uint8Array[] {
  let bin = "";
  try { bin = atob(s); } catch { return []; }
  const n = Math.min(REPLAY_FRAMES * 2, bin.charCodeAt(0) || 0), frames: Uint8Array[] = [];
  let i = 1, prev: Uint8Array = new Uint8Array(W * H);
  for (let k = 0; k < n; k++) {
    const f = new Uint8Array(W * H);
    let p = 0;
    while (p < f.length) {
      if (i >= bin.length) return frames;
      const b = bin.charCodeAt(i++), sym = b & 31;
      let run = (b >> 5) + 1;
      if (run === 8) {
        let v = 0, shift = 0, q: number;
        do { q = bin.charCodeAt(i++) || 0; v |= (q & 127) << shift; shift += 7; } while (q & 128 && shift < 28 && i < bin.length);
        run = 8 + v;
      }
      const end = Math.min(f.length, p + run);
      if (sym === SAME) f.set(prev.subarray(p, end), p); else f.fill(sym & 15, p, end);
      p = end;
    }
    frames.push(f);
    prev = f;
  }
  return frames;
}

/** As many of the snapshots as fit, evenly spread, the last one always kept. */
export function packReplay(tape: Uint8Array[]): string {
  for (let want = REPLAY_FRAMES; want >= 2; want = Math.floor(want * 0.7)) {
    const pick = tape.length <= want ? tape : Array.from({ length: want }, (_, k) => tape[Math.round(((k + 1) * (tape.length - 1)) / want)]);
    const s = encodeReplay(pick);
    if (s.length <= REPLAY_MAX) return s;
  }
  return encodeReplay(tape.slice(-1));
}

// ---- how it was painted, for the critics ------------------------------------------------------------

/** What the easel noticed while you worked: seconds from first stroke to hanging, undos, the share
 *  of strokes with a big brush, with a fine one, and with the line and shape tools (0..100), whether
 *  the ground went down first, and how much freehand lines wobbled (degrees of back-and-forth). */
export interface How { secs: number; undos: number; big: number; fine: number; ruled: number; ground: boolean; wobble: number }

/** Goes in front of a painting's run-length text: the stroke count first, as it always was, so an
 *  older page reading only that number still gets it. */
export const howText = (strokes: number, h: How) =>
  [strokes, h.secs, h.undos, h.big, h.fine, h.ruled, h.ground ? 1 : 0, h.wobble].map((v) => Math.round(v)).join(":");
/** The other way; nothing if the painter's page didn't send it. */
export function readHow(head: string): How | undefined {
  const v = head.split(":").map((x) => Math.max(0, Math.min(999, parseInt(x) || 0)));
  if (v.length < 8) return undefined;
  return { secs: v[1], undos: v[2], big: Math.min(100, v[3]), fine: Math.min(100, v[4]), ruled: Math.min(100, v[5]), ground: v[6] === 1, wobble: v[7] };
}

// ---- the mouse and keys while the easel's up --------------------------------------------------

let up = false;
let relock: (() => void) | null = null;
/** Is the easel up (so a loose mouse isn't a pause)? */
export const easelUp = () => up;
/** How to capture the mouse again when you step back from the easel (main.ts's). */
export function onEaselRelock(fn: () => void) { relock = fn; }

// ---- the program -----------------------------------------------------------------------------------

type Tool = "pencil" | "brush" | "spray" | "fill" | "line" | "rect" | "ellipse" | "eraser" | "picker";
const TOOLS: [Tool, string][] = [
  ["pencil", "Pencil: a one-pixel line"], ["brush", "Brush: a round brush, as big as you pick below"],
  ["spray", "Airbrush: hold it down to spray"], ["fill", "Fill With Colour: fills an area with the colour"],
  ["line", "Line: drag from end to end"], ["rect", "Rectangle: drag corner to corner"],
  ["ellipse", "Ellipse: drag corner to corner"], ["eraser", "Eraser: rubs out to the second colour"],
  ["picker", "Pick Colour: take a colour off the picture"],
];
const SIZES = [1, 3, 6, 12];

export interface EaselBrief {
  /** What to paint, and a line about who's judging (html). */
  theme: string; judges: string;
  /** Milliseconds left to paint. */
  left(): number;
  /** Hang it: you're done (or the time's up). */
  onHang(): void;
  /** Esc or the close box: step back from the easel for a look round. */
  onStepBack(): void;
}

let css = false;
function style() {
  if (css) return;
  css = true;
  const s = document.createElement("style");
  s.textContent = `
#easel{position:fixed;inset:0;z-index:40;display:flex;align-items:center;justify-content:center;background:rgba(10,12,20,.55);
 pointer-events:auto;user-select:none;-webkit-user-select:none;touch-action:none;font:12px/1.2 "MS Sans Serif",Tahoma,Geneva,Verdana,sans-serif;color:#000}
#easel .win{background:#c0c0c0;border:2px solid;border-color:#fff #404040 #404040 #fff;box-shadow:1px 1px 0 #000,0 10px 40px rgba(0,0,0,.6);
 display:flex;flex-direction:column;max-width:100vw;max-height:100vh}
#easel .tt{display:flex;align-items:center;gap:6px;background:linear-gradient(90deg,#000080,#1084d0);color:#fff;font-weight:700;padding:3px 4px 3px 6px}
#easel .tt .nm{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#easel .tt .clock{font:700 14px "Courier New",monospace;background:#000;color:#3f3;padding:1px 6px;border:1px solid #808080}
#easel .tt .clock.hurry{color:#f44}
#easel .tt button{width:20px;height:18px;padding:0;font:700 12px sans-serif;line-height:12px}
#easel button{background:#c0c0c0;border:2px solid;border-color:#fff #404040 #404040 #fff;color:#000;font:inherit;touch-action:manipulation;cursor:pointer}
#easel button:active,#easel button.on{border-color:#404040 #fff #fff #404040;background:#d4d4d4}
#easel .brief{padding:4px 8px;border-bottom:1px solid #808080;background:#ffffe1;font-size:13px;max-width:100%}
#easel .brief b{font-size:15px}
#easel .brief .j{font-size:11px;color:#333;margin-top:2px}
#easel .mid{display:flex;min-height:0}
#easel .tools{display:flex;flex-direction:column;gap:6px;padding:4px}
#easel .box{display:grid;grid-template-columns:repeat(2,30px);gap:1px}
#easel .box button{width:30px;height:30px;padding:0;display:flex;align-items:center;justify-content:center}
#easel .opts{border:2px solid;border-color:#808080 #fff #fff #808080;width:58px;min-height:70px;display:flex;flex-direction:column;align-items:center;gap:2px;padding:3px 0}
#easel .opts button{width:50px;height:16px;border:1px solid transparent;background:none;display:flex;align-items:center;justify-content:center}
#easel .opts button.on{background:#000080;border-color:#000080}
#easel .opts button i{display:block;background:#000;border-radius:50%}
#easel .opts button.on i{background:#fff}
#easel .opts button.fm{height:22px}
#easel .well{background:#808080;padding:6px;overflow:hidden;border:2px solid;border-color:#404040 #fff #fff #404040;margin:4px 4px 4px 0;display:flex;align-items:flex-start;justify-content:flex-start}
#easel canvas.art{image-rendering:pixelated;image-rendering:crisp-edges;cursor:crosshair;touch-action:none;box-shadow:2px 2px 0 #404040;background:#fff;display:block}
#easel .low{display:flex;align-items:center;gap:8px;padding:3px 6px 4px}
#easel .cur{position:relative;width:34px;height:34px;border:2px solid;border-color:#808080 #fff #fff #808080;background:#c0c0c0;flex:none}
#easel .cur i{position:absolute;width:15px;height:15px;border:1px solid #000;outline:1px solid #fff}
#easel .cur i.f{left:4px;top:4px;z-index:1}
#easel .cur i.b{left:13px;top:13px}
#easel .pal{display:grid;grid-template-columns:repeat(8,20px);gap:2px}
#easel .pal button{width:20px;height:16px;padding:0;border:1px solid;border-color:#808080 #fff #fff #808080}
#easel .acts{display:flex;gap:4px;margin-left:auto}
#easel .acts button{min-width:54px;height:30px;padding:0 8px}
#easel .acts button.hang{font-weight:700;background:#ffe9a8}
#easel .keys{padding:0 6px 3px;font-size:11px;color:#222}
#easel .status{border-top:1px solid #808080;padding:2px 6px;display:flex;gap:10px;color:#222;font-size:11px}
#easel .status .xy{margin-left:auto;min-width:56px;border-left:1px solid #808080;padding-left:6px}
@media (max-width:700px),(max-height:480px){#easel .brief{font-size:12px;padding:2px 6px}#easel .brief b{font-size:13px}#easel .brief .j{display:none}#easel .status{display:none}
 #easel .box{grid-template-columns:repeat(2,26px)}#easel .box button{width:26px;height:26px}#easel .opts{width:50px;min-height:56px}#easel .opts button{width:44px}}`;
  document.head.appendChild(s);
}

/** A tool's picture for its button, drawn small. */
function icon(t: Tool | "outline" | "solid"): string {
  const c = document.createElement("canvas");
  c.width = c.height = 22;
  const x = c.getContext("2d")!;
  x.lineCap = "round"; x.lineJoin = "round";
  const ln = (col: string, w: number, ...p: number[]) => { x.strokeStyle = col; x.lineWidth = w; x.beginPath(); x.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) x.lineTo(p[i], p[i + 1]); x.stroke(); };
  switch (t) {
    case "pencil": ln("#7a5a10", 5, 6, 17, 16, 5); ln("#ffd84a", 3, 6, 17, 16, 5); ln("#000", 2, 4, 19, 6, 17); ln("#e88", 3, 16, 5, 18, 3); break;
    case "brush": ln("#8a5426", 3, 17, 3, 11, 11); ln("#999", 4, 11, 11, 9, 13); ln("#000", 5, 8, 14, 4, 19); break;
    case "spray": x.fillStyle = "#1f3c88"; x.fillRect(9, 8, 8, 12); x.fillStyle = "#666"; x.fillRect(11, 5, 4, 3);
      x.fillStyle = "#000"; for (const [a, b] of [[4, 4], [6, 2], [3, 7], [7, 6], [5, 9], [2, 3]]) x.fillRect(a, b, 1.5, 1.5); break;
    case "fill": x.save(); x.translate(11, 12); x.rotate(-0.6); x.fillStyle = "#ddd"; x.strokeStyle = "#000"; x.lineWidth = 1.2;
      x.fillRect(-5, -5, 10, 9); x.strokeRect(-5, -5, 10, 9); x.restore(); x.fillStyle = "#2f5fe0"; x.beginPath(); x.arc(17, 17, 2.5, 0, 7); x.fill(); break;
    case "line": ln("#000", 2, 4, 18, 18, 4); break;
    case "rect": x.strokeStyle = "#000"; x.lineWidth = 2; x.strokeRect(4, 6, 14, 11); break;
    case "ellipse": x.strokeStyle = "#000"; x.lineWidth = 2; x.beginPath(); x.ellipse(11, 11.5, 7.5, 5.5, 0, 0, 7); x.stroke(); break;
    case "eraser": x.save(); x.translate(11, 11); x.rotate(-0.5); x.fillStyle = "#ff9ec0"; x.fillRect(-7, -4, 14, 8); x.fillStyle = "#fff"; x.fillRect(-7, -4, 5, 8);
      x.strokeStyle = "#000"; x.lineWidth = 1; x.strokeRect(-7, -4, 14, 8); x.restore(); break;
    case "picker": ln("#000", 2, 5, 17, 13, 9); ln("#555", 4, 13, 9, 16, 6); x.fillStyle = "#000"; x.beginPath(); x.arc(17, 5, 3, 0, 7); x.fill(); break;
    case "outline": x.strokeStyle = "#000"; x.lineWidth = 1.5; x.strokeRect(5, 6, 12, 10); break;
    case "solid": x.fillStyle = "#555"; x.fillRect(5, 6, 12, 10); x.strokeStyle = "#000"; x.lineWidth = 1.5; x.strokeRect(5, 6, 12, 10); break;
  }
  return c.toDataURL();
}

export class Easel {
  readonly px = new Uint8Array(W * H);
  /** How many times the brush has gone to the canvas: the critics notice effort, or the lack of it. */
  strokes = 0;
  private undo: Uint8Array[] = [];
  /** Snapshots for the time-lapse: after every stroke, then every other one as it fills up, and so on. */
  private tape: Uint8Array[] = [];
  private tapeEvery = 1;
  private tapeN = 0;
  private kept = { t0: 0, undos: 0, big: 0, fine: 0, ruled: 0, ground: false, turn: 0, turns: 0 };
  /** A freehand stroke as it goes: the last point that counted, and the way it was heading. */
  private path: { x: number; y: number; a: number | null } | null = null;
  private el: HTMLDivElement | null = null;
  private art: HTMLCanvasElement | null = null;
  private img: ImageData | null = null;
  private brief: EaselBrief | null = null;
  private tool: Tool = "brush";
  private before: Tool = "brush";
  private size = 1;
  private solid = false;
  private fg: number = C.black;
  private bg: number = C.white;
  private stop = new AbortController();
  private drag: { c: number; x0: number; y0: number; x: number; y: number; base: Uint8Array; id: number } | null = null;
  private sprayT = 0;
  private clockEl: HTMLElement | null = null;
  private statusEl: HTMLElement | null = null;
  private xyEl: HTMLElement | null = null;
  private lastSecs = -1;

  get open() { return !!this.el; }

  show(b: EaselBrief) {
    this.hide();
    style();
    this.brief = b;
    const el = document.createElement("div");
    el.id = "easel";
    const tools = TOOLS.map(([t, tip]) => `<button data-t="${t}" title="${tip}"><img src="${icon(t)}" width="22" height="22" alt=""></button>`).join("");
    const pal = PALETTE.map((c, i) => `<button data-c="${i}" title="${COLOUR_NAMES[i]}" style="background:${c}"></button>`).join("");
    el.innerHTML = `<div class="win">
      <div class="tt"><span class="nm">untitled - Paint</span><span class="clock">0:00</span><button class="x" title="Step back (${ctl("easel.leave")})">×</button></div>
      <div class="brief">Paint: <b>${b.theme}</b><div class="j">${b.judges}</div></div>
      <div class="mid"><div class="tools"><div class="box">${tools}</div><div class="opts"></div></div>
        <div class="well"><canvas class="art" width="${W}" height="${H}"></canvas></div></div>
      <div class="low"><div class="cur"><i class="f"></i><i class="b"></i></div><div class="pal">${pal}</div>
        <div class="acts"><button class="un" title="Undo (${ctl("easel.undo")})">Undo</button><button class="clr">Clear</button><button class="hang">Hang it!</button></div></div>
      <div class="keys"></div>
      <div class="status"><span class="tip"></span><span class="xy"></span></div></div>`;
    document.body.appendChild(el);
    this.el = el;
    this.art = el.querySelector("canvas.art")!;
    const ctx = this.art.getContext("2d")!;
    this.img = ctx.createImageData(W, H);
    this.clockEl = el.querySelector(".clock");
    this.statusEl = el.querySelector(".tip");
    this.xyEl = el.querySelector(".xy");
    this.stop = new AbortController();
    const sig = { signal: this.stop.signal };
    el.addEventListener("contextmenu", (e) => e.preventDefault(), sig);
    el.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest("button");
      if (!btn) return;
      if (btn.dataset.t) this.pick(btn.dataset.t as Tool);
      else if (btn.dataset.s) { this.size = Number(btn.dataset.s); this.drawOpts(); }
      else if (btn.dataset.m) { this.solid = btn.dataset.m === "solid"; this.drawOpts(); }
      else if (btn.classList.contains("un")) this.back();
      else if (btn.classList.contains("clr")) this.clear();
      else if (btn.classList.contains("hang")) this.brief?.onHang();
      else if (btn.classList.contains("x")) this.brief?.onStepBack();
    }, sig);
    // a colour: left click (or a tap) for the first, right click for the second
    el.querySelector(".pal")!.addEventListener("pointerdown", (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>("button[data-c]");
      if (!btn) return;
      e.preventDefault();
      const c = Number(btn.dataset.c);
      if ((e as PointerEvent).button === 2) this.bg = c; else this.fg = c;
      this.drawCur();
    }, sig);
    const art = this.art;
    art.addEventListener("pointerdown", (e) => this.down(e), sig);
    art.addEventListener("pointermove", (e) => this.move(e), sig);
    art.addEventListener("pointerup", (e) => this.upp(e), sig);
    art.addEventListener("pointercancel", (e) => this.upp(e), sig);
    art.addEventListener("pointerleave", () => { if (this.xyEl) this.xyEl.textContent = ""; }, sig);
    addEventListener("keydown", (e) => this.key(e), { capture: true, signal: this.stop.signal });
    addEventListener("wheel", (e) => e.stopPropagation(), { capture: true, signal: this.stop.signal });
    addEventListener("resize", () => this.fit(), sig);
    this.pick(this.tool);
    this.drawCur();
    this.fit();
    this.render();
    this.tick();
    up = true;
    if (document.pointerLockElement) document.exitPointerLock();
  }

  hide() {
    if (!this.el) return;
    this.stop.abort();
    this.el.remove();
    this.el = null; this.art = null; this.img = null; this.drag = null;
    up = false;
  }

  /** Step back from the easel and take the mouse back for looking about. */
  hideAndRelock() {
    const was = this.open;
    this.hide();
    if (was) relock?.();
  }

  /** The clock in the title bar, the controls strip, and the airbrush while it's held: every frame while it's up. */
  tick(dt = 0) {
    if (!this.el || !this.brief) return;
    const keys = this.el.querySelector(".keys"), k = strip("easel");
    if (keys && keys.innerHTML !== k) keys.innerHTML = k;
    const secs = Math.max(0, Math.ceil(this.brief.left() / 1000));
    if (secs !== this.lastSecs && this.clockEl) {
      this.lastSecs = secs;
      this.clockEl.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
      this.clockEl.classList.toggle("hurry", secs <= 10);
      if (secs <= 5 && secs > 0) SFX.tick();
    }
    if (this.drag && this.tool === "spray") {
      this.sprayT += dt;
      while (this.sprayT > 0.016) { this.sprayT -= 0.016; this.spray(this.drag.x, this.drag.y, this.drag.c); }
      this.render();
    }
  }

  // ---- drawing --------------------------------------------------------------------------------

  private at(e: PointerEvent): [number, number] {
    const r = this.art!.getBoundingClientRect();
    return [Math.floor(((e.clientX - r.left) / r.width) * W), Math.floor(((e.clientY - r.top) / r.height) * H)];
  }

  private down(e: PointerEvent) {
    if (!this.art || this.drag) return;
    e.preventDefault();
    this.art.setPointerCapture(e.pointerId);
    const [x, y] = this.at(e), c = e.button === 2 ? this.bg : this.fg;
    if (this.tool === "picker") {
      if (x >= 0 && y >= 0 && x < W && y < H) { if (e.button === 2) this.bg = this.px[y * W + x]; else this.fg = this.px[y * W + x]; this.drawCur(); }
      this.pick(this.before);
      return;
    }
    this.save();
    this.strokes++;
    this.noteStroke(x, y);
    this.drag = { c, x0: x, y0: y, x, y, base: this.px.slice(), id: e.pointerId };
    if (this.tool === "fill") { this.fill(x, y, c); this.drag = null; this.film(); }
    else if (this.tool === "pencil" || this.tool === "brush" || this.tool === "eraser") this.stroke(x, y, x, y);
    else if (this.tool === "spray") { this.sprayT = 0; this.spray(x, y, c); }
    this.render();
  }

  private move(e: PointerEvent) {
    const [x, y] = this.at(e);
    if (this.xyEl) this.xyEl.textContent = x >= 0 && y >= 0 && x < W && y < H ? `${x},${y}` : "";
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    const pts = (e.getCoalescedEvents?.() ?? [e]).map((q) => this.at(q));
    for (const [px, py] of pts) {
      if (this.tool === "pencil" || this.tool === "brush" || this.tool === "eraser") { this.stroke(d.x, d.y, px, py); this.notePath(px, py); }
      d.x = px; d.y = py;
    }
    if (this.tool === "line" || this.tool === "rect" || this.tool === "ellipse") { this.px.set(d.base); this.shape(d.x0, d.y0, d.x, d.y, d.c); }
    this.render();
  }

  private upp(e: PointerEvent) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    this.drag = null;
    if (this.tool === "rect" || this.tool === "ellipse") this.kept.ground ||= this.strokes === 1 && Math.abs(d.x - d.x0) * Math.abs(d.y - d.y0) > 0.3 * W * H && this.solid;
    this.path = null;
    this.film();
    this.render();
  }

  private noteStroke(x: number, y: number) {
    const k = this.kept, t = this.tool;
    if (this.strokes === 1) { k.t0 = performance.now(); k.ground = t === "fill"; }
    if (t === "line" || t === "rect" || t === "ellipse") k.ruled++;
    else if (t === "pencil" || this.size === 1) k.fine++;
    else if (this.size >= 6 || t === "fill") k.big++;
    this.path = { x, y, a: null };
  }
  /** Freehand lines are judged in steps of a few pixels, so the pixel grid's own zigzag isn't taken
   *  for a shaky hand; a smooth curve turns the same way each step, a wobble back and forth. */
  private notePath(x: number, y: number) {
    const p = this.path;
    if (!p || Math.hypot(x - p.x, y - p.y) < 5) return;
    const a = Math.atan2(y - p.y, x - p.x);
    if (p.a !== null) {
      let d = a - p.a;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      this.kept.turn += Math.abs(d); this.kept.turns++;
    }
    this.path = { x, y, a };
  }
  private film() {
    if (++this.tapeN % this.tapeEvery) return;
    this.tape.push(this.px.slice());
    if (this.tape.length >= 96) { this.tape = this.tape.filter((_, i) => i % 2); this.tapeEvery *= 2; }
  }
  /** The time-lapse of it, packed to go round with it. */
  replay(): string { return packReplay([...this.tape, this.px.slice()]); }

  /** How it went, up to now. */
  how(): How {
    const k = this.kept, n = Math.max(1, this.strokes), pc = (v: number) => (100 * v) / n;
    return {
      secs: this.strokes ? (performance.now() - k.t0) / 1000 : 0, undos: k.undos,
      big: pc(k.big), fine: pc(k.fine), ruled: pc(k.ruled), ground: k.ground,
      wobble: k.turns >= 12 ? (k.turn / k.turns) * (180 / Math.PI) : 0,
    };
  }

  /** What the program's state is, in one go: for a test to paint with, not the player. */
  apply(op: { tool: Tool; c: number; size?: number; solid?: boolean; pts: number[] }) {
    this.save();
    this.strokes++;
    const p = op.pts, sz = this.size, sol = this.solid, t = this.tool;
    this.tool = op.tool; this.size = op.size ?? 1; this.solid = !!op.solid;
    if (op.tool === "fill") this.fill(p[0], p[1], op.c);
    else if (op.tool === "spray") { for (let k = 0; k < (p[2] ?? 30); k++) this.spray(p[0], p[1], op.c); }
    else if (op.tool === "line" || op.tool === "rect" || op.tool === "ellipse") this.shape(p[0], p[1], p[2], p[3], op.c);
    else for (let i = 2; i < p.length; i += 2) this.stroke(p[i - 2], p[i - 1], p[i], p[i + 1], op.c);
    if (p.length === 2 && (op.tool === "brush" || op.tool === "pencil")) this.stroke(p[0], p[1], p[0], p[1], op.c);
    this.tool = t; this.size = sz; this.solid = sol;
    this.film();
    this.render();
  }

  private paintAt(x: number, y: number, r: number, c: number, square: boolean) {
    const r2 = r * r + r * 0.8;
    const lo = -Math.floor(r), hi = Math.ceil(r);
    for (let dy = lo; dy <= hi; dy++) {
      const yy = y + dy;
      if (yy < 0 || yy >= H) continue;
      for (let dx = lo; dx <= hi; dx++) {
        const xx = x + dx;
        if (xx < 0 || xx >= W) continue;
        if (square || dx * dx + dy * dy <= r2) this.px[yy * W + xx] = c;
      }
    }
  }

  /** The pencil, the brush or the eraser from one point to the next. */
  private stroke(x0: number, y0: number, x1: number, y1: number, col?: number) {
    const c = col ?? (this.tool === "eraser" ? this.bg : this.drag?.c ?? this.fg);
    const r = this.tool === "pencil" ? 0 : this.tool === "eraser" ? Math.max(2, this.size) : (this.size - 1) / 2;
    const sq = this.tool === "eraser";
    this.walk(x0, y0, x1, y1, (x, y) => this.paintAt(x, y, r, c, sq));
  }

  private walk(x0: number, y0: number, x1: number, y1: number, f: (x: number, y: number) => void) {
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy, x = x0, y = y0;
    for (let guard = 0; guard < 2000; guard++) {
      f(x, y);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
    }
  }

  private spray(x: number, y: number, c: number) {
    const r = 3 + this.size * 1.6, n = 2 + this.size;
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r;
      const xx = Math.round(x + Math.cos(a) * d), yy = Math.round(y + Math.sin(a) * d);
      if (xx >= 0 && yy >= 0 && xx < W && yy < H) this.px[yy * W + xx] = c;
    }
  }

  private fill(x: number, y: number, c: number) {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const px = this.px, from = px[y * W + x];
    if (from === c) return;
    const stack = [y * W + x];
    while (stack.length) {
      const i = stack.pop()!;
      if (px[i] !== from) continue;
      let l = i, r = i;
      const row = i - (i % W);
      while (l > row && px[l - 1] === from) l--;
      while (r < row + W - 1 && px[r + 1] === from) r++;
      for (let k = l; k <= r; k++) {
        px[k] = c;
        if (k >= W && px[k - W] === from) stack.push(k - W);
        if (k < W * (H - 1) && px[k + W] === from) stack.push(k + W);
      }
    }
  }

  /** A line, rectangle or ellipse from corner to corner. */
  private shape(x0: number, y0: number, x1: number, y1: number, c: number) {
    const r = (this.size - 1) / 2;
    if (this.tool === "line") { this.walk(x0, y0, x1, y1, (x, y) => this.paintAt(x, y, r, c, false)); return; }
    const lx = Math.min(x0, x1), hx = Math.max(x0, x1), ly = Math.min(y0, y1), hy = Math.max(y0, y1);
    const t = Math.max(1, this.size);
    if (this.tool === "rect") {
      for (let y = Math.max(0, ly); y <= Math.min(H - 1, hy); y++) {
        for (let x = Math.max(0, lx); x <= Math.min(W - 1, hx); x++) {
          if (this.solid || x - lx < t || hx - x < t || y - ly < t || hy - y < t) this.px[y * W + x] = c;
        }
      }
      return;
    }
    const cx = (lx + hx) / 2, cy = (ly + hy) / 2, ax = (hx - lx) / 2 + 0.5, ay = (hy - ly) / 2 + 0.5;
    const ix = Math.max(0.01, ax - t), iy = Math.max(0.01, ay - t);
    for (let y = Math.max(0, ly); y <= Math.min(H - 1, hy); y++) {
      for (let x = Math.max(0, lx); x <= Math.min(W - 1, hx); x++) {
        const ux = (x - cx) / ax, uy = (y - cy) / ay;
        if (ux * ux + uy * uy > 1) continue;
        const vx = (x - cx) / ix, vy = (y - cy) / iy;
        if (this.solid || vx * vx + vy * vy > 1) this.px[y * W + x] = c;
      }
    }
  }

  private save() {
    this.undo.push(this.px.slice());
    if (this.undo.length > 24) this.undo.shift();
  }
  private back() {
    const u = this.undo.pop();
    if (u) { this.px.set(u); this.kept.undos++; this.film(); this.render(); }
  }
  private clear() {
    this.save();
    this.px.fill(this.bg);
    this.film();
    this.render();
  }

  private render() {
    if (!this.art || !this.img) return;
    toImage(this.px, this.img);
    this.art.getContext("2d")!.putImageData(this.img, 0, 0);
  }

  // ---- the window ---------------------------------------------------------------------------------

  private pick(t: Tool) {
    if (t === "picker" && this.tool !== "picker") this.before = this.tool;
    this.tool = t;
    if ((t === "brush" || t === "spray") && this.size === 1 && !this.drag) this.size = 3;
    this.el?.querySelectorAll<HTMLElement>(".box button").forEach((b) => b.classList.toggle("on", b.dataset.t === t));
    if (this.statusEl) this.statusEl.textContent = TOOLS.find(([k]) => k === t)?.[1] ?? "";
    this.drawOpts();
  }

  private drawOpts() {
    const o = this.el?.querySelector(".opts");
    if (!o) return;
    const t = this.tool;
    if (t === "rect" || t === "ellipse") {
      o.innerHTML = `<button class="fm${this.solid ? "" : " on"}" data-m="outline" title="Outline"><img src="${icon("outline")}" width="22" height="22" alt=""></button>`
        + `<button class="fm${this.solid ? " on" : ""}" data-m="solid" title="Filled"><img src="${icon("solid")}" width="22" height="22" alt=""></button>`
        + SIZES.slice(0, 3).map((s) => `<button data-s="${s}" class="${s === this.size ? "on" : ""}" title="Edge ${s}"><i style="width:30px;height:${s}px;border-radius:0"></i></button>`).join("");
    } else if (t === "fill" || t === "picker" || t === "pencil") o.innerHTML = "";
    else o.innerHTML = SIZES.map((s) => `<button data-s="${s}" class="${s === this.size ? "on" : ""}" title="Size ${s}"><i style="width:${Math.min(12, s + 1)}px;height:${Math.min(12, s + 1)}px"></i></button>`).join("");
  }

  private drawCur() {
    const f = this.el?.querySelector<HTMLElement>(".cur .f"), b = this.el?.querySelector<HTMLElement>(".cur .b");
    if (f) f.style.background = PALETTE[this.fg];
    if (b) b.style.background = PALETTE[this.bg];
  }

  /** The biggest the picture can be drawn and still leave room for the toolbox and the palette. */
  private fit() {
    if (!this.art || !this.el) return;
    const toolsW = 84, chromeH = 150;
    const k = Math.max(1, Math.min((innerWidth - toolsW - 30) / W, (innerHeight - chromeH) / H));
    const s = k >= 2 ? Math.floor(k * 2) / 2 : k;
    this.art.style.width = `${Math.floor(W * s)}px`;
    this.art.style.height = `${Math.floor(H * s)}px`;
    const win = this.el.querySelector<HTMLElement>(".win");
    if (win) win.style.width = `${Math.min(innerWidth, Math.floor(W * s) + toolsW + 22)}px`;
  }

  private key(e: KeyboardEvent) {
    if (!this.el) return;
    if (e.target instanceof HTMLInputElement) return;
    e.stopPropagation();
    if (e.code === "Escape") { e.preventDefault(); if (!e.repeat) this.brief?.onStepBack(); return; }
    if ((e.ctrlKey || e.metaKey) && e.code === "KeyZ") { e.preventDefault(); this.back(); return; }
    if (e.code === "Tab" || e.code === "Space") e.preventDefault();
  }
}
