// The drone's screen (drone.ts): what you'd see on a real drone's camera feed, in thin pale green
// lines and small capitals over the picture. A viewfinder's corners round the middle with a cross at
// its heart; the compass heading on a tape across the top; the height above the ground on a ladder
// down the left and the speed on one down the right, each with its number boxed where it reads;
// clock, square, speed setting, zoom, the camera's tilt and the climb or sink in the top left; the
// spot's latitude and longitude, how far you are from where you took off, the range to whatever's
// under the cross and the height above the sea in the top right; ● REC with the flight's time and
// the snaps taken over the frame; the view and the zoom under it (a tap on either changes it on a
// touch screen), and in the "what's what" view the thing you're locked on beside them, with the key
// to its colours down the left. Faint scan lines and a darker edge finish it off.
//
// The lines and numbers are drawn on a canvas over the game every frame (a few hundred strokes, not
// the 3D picture, so it costs little); the bits you can tap are ordinary page elements. Snaps are
// taken from the game's own picture, so none of this is on them.
//
// Nothing here goes over the network: it's only what your own screen shows.
import { KINDS, type Kind } from "./kinds";

/** What the drone tells its screen, every frame. */
export interface Telemetry {
  heading: number;          // degrees clockwise from north
  tilt: number;             // the camera's tilt, degrees up from level
  alt: number;              // metres above the ground below
  elv: number;              // metres above the sea
  hs: number;               // speed along the ground, m/s
  vs: number;               // climbing (or sinking, below nought), m/s
  lat: number; lon: number;
  dst: number;              // metres from where it took off
  rng: number | null;       // metres to what's under the cross (null: nothing in reach)
  clock: string;            // the game's time of day
  square: string;           // the square of Bath it's over
  gear: number; gears: number; zoom: number;
  look: string; kinds: boolean;
  snaps: number; allSnaps: number;
  flight: number;           // seconds since take-off
  lookKey: string;          // the control that changes the view, as it's named for this player
}

const INK = "#d6ecc8", SHADE = "rgba(0, 0, 0, 0.55)", REC = "#ff5a48";

export class DroneScreen {
  private root: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private look: HTMLSpanElement;
  private zoom: HTMLSpanElement;
  private lock: HTMLDivElement;
  private key: HTMLUListElement;
  private keyShown = false;
  private flashT = -1e9;

  constructor(onLook: () => void, onZoom: () => void) {
    this.root = document.createElement("div");
    this.root.id = "droneosd";
    this.root.hidden = true;
    this.root.innerHTML = `<canvas></canvas><div class="under"><span class="look"></span><span class="zoom"></span></div><div class="lock" hidden></div><ul class="key" hidden></ul>`;
    document.body.append(this.root);
    this.canvas = this.root.querySelector("canvas")!;
    this.g = this.canvas.getContext("2d")!;
    this.look = this.root.querySelector(".look")!;
    this.zoom = this.root.querySelector(".zoom")!;
    this.lock = this.root.querySelector(".lock")!;
    this.key = this.root.querySelector(".key")!;
    this.key.innerHTML = (Object.keys(KINDS) as Kind[]).filter((k) => k !== "sky" && k !== "field")
      .map((k) => `<li><i style="background:${KINDS[k].col}"></i>${KINDS[k].name}</li>`).join("");
    // on a touch screen, a tap on the view or the zoom changes it
    this.look.addEventListener("pointerdown", (e) => { e.preventDefault(); onLook(); });
    this.zoom.addEventListener("pointerdown", (e) => { e.preventDefault(); onZoom(); });
  }

  show(on: boolean) {
    this.root.hidden = !on;
    document.body.classList.toggle("droning", on);
    if (!on) this.setLock(null);
  }

  /** A snap: the frame flashes. */
  flash() { this.flashT = performance.now(); }

  /** What "what's what" has locked on to (its kind, and the words after it), or null for nothing. */
  setLock(lock: { kind: Kind; text: string } | null) {
    if (!lock) { this.lock.hidden = true; return; }
    this.lock.hidden = false;
    this.lock.innerHTML = `<i style="background:${KINDS[lock.kind].col}"></i>LOCKED · ${esc(lock.text.toUpperCase())}`;
  }

  remove() { this.root.remove(); document.body.classList.remove("droning"); }

  /** Draw the screen afresh for this frame. */
  draw(t: Telemetry) {
    if (this.root.hidden) return;
    const W = innerWidth, H = innerHeight, dpr = Math.min(2, devicePixelRatio || 1);
    const c = this.canvas, g = this.g;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const small = Math.min(W, H) < 500, fs = small ? 10 : 12, lh = fs + 4;
    g.font = `${fs}px ui-monospace, Menlo, Consolas, monospace`;
    g.textBaseline = "middle";

    // the viewfinder: its corners, and the cross at its heart
    const fw = Math.max(200, Math.min(W * 0.38, 640)), fh = Math.max(130, Math.min(H * 0.44, 420));
    const fx = (W - fw) / 2, fy = (H - fh) / 2, cx = W / 2, cy = H / 2, b = Math.min(fw, fh) * 0.2;
    const flash = Math.max(0, 1 - (performance.now() - this.flashT) / 250);
    if (flash > 0) { g.fillStyle = `rgba(255, 255, 255, ${0.35 * flash})`; g.fillRect(fx, fy, fw, fh); }
    this.lines(g, [
      [fx, fy + b, fx, fy, fx + b, fy], [fx + fw - b, fy, fx + fw, fy, fx + fw, fy + b],
      [fx, fy + fh - b, fx, fy + fh, fx + b, fy + fh], [fx + fw - b, fy + fh, fx + fw, fy + fh, fx + fw, fy + fh - b],
      [cx - 26, cy, cx - 7, cy], [cx + 7, cy, cx + 26, cy], [cx, cy - 26, cx, cy - 7], [cx, cy + 7, cx, cy + 26],
    ]);

    // the compass heading, on a tape across the top
    const ty = Math.max(28, fy - Math.min(80, fy * 0.5)), tw = fw * 0.62, perDeg = tw / 60;
    const ticks: number[][] = [[cx - tw / 2, ty, cx + tw / 2, ty]];
    for (let d = Math.ceil((t.heading - 30) / 5) * 5; d <= t.heading + 30; d += 5) {
      const x = cx + (d - t.heading) * perDeg, big = d % 15 === 0;
      ticks.push([x, ty, x, ty - (big ? 8 : 4)]);
      if (d % 30 === 0) this.text(g, compass(d), x, ty - 16, "center");
    }
    ticks.push([cx - 4, ty + 9, cx, ty + 4, cx + 4, ty + 9]);
    this.lines(g, ticks);
    this.boxed(g, String(Math.round(((t.heading % 360) + 360) % 360)).padStart(3, "0"), cx, ty + 20, "center");

    // height on a ladder down the left, speed on one down the right
    this.ladder(g, fx - (small ? 34 : 56), fy, fh, t.alt, 40, 5, "left", `${t.alt.toFixed(1)}`, "ALT M");
    this.ladder(g, fx + fw + (small ? 34 : 56), fy, fh, t.hs * 3.6, 60, 10, "right", `${Math.round(t.hs * 3.6)}`, "KM/H");

    // the corners' words
    const pad = 14, top = pad + lh / 2;
    const left = [`${t.clock}  BATH`, `SQ: ${t.square || "-"}`, `SPD: ${t.gear}/${t.gears}`, `ZOOM: ${t.zoom.toFixed(1)}X`,
      `GMB: ${t.tilt >= 0 ? "+" : ""}${Math.round(t.tilt)}°`, `V.S: ${t.vs >= 0 ? "+" : ""}${t.vs.toFixed(1)} M/S`];
    left.forEach((s, i) => this.text(g, s, pad, top + i * lh, "left"));
    const right = [dms(t.lat, "N", "S"), dms(t.lon, "E", "W"), `DST: ${Math.round(t.dst)}`, `RNG: ${t.rng === null ? "---" : t.rng.toFixed(1)}`, `ELV: ${Math.round(t.elv)}M`];
    right.forEach((s, i) => this.text(g, s, W - pad, top + i * lh, "right"));
    // over the frame: recording, and the snaps
    const mm = Math.floor(t.flight / 60), ss = Math.floor(t.flight % 60);
    if (Math.floor(performance.now() / 500) % 2 === 0) { g.fillStyle = REC; g.beginPath(); g.arc(fx + 4, fy - 12, 3.5, 0, Math.PI * 2); g.fill(); }
    this.text(g, `REC ${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`, fx + 13, fy - 12, "left");
    this.text(g, `IMG ${t.snaps}${t.allSnaps !== t.snaps ? ` / ${t.allSnaps}` : ""}`, fx + fw, fy - 12, "right");
    // the camera's name, bottom left
    this.text(g, "combe_downer_drone_01", pad, H - pad, "left", 0.7);

    // the bits you can tap, under the frame; the lock beside them; the key down the left
    this.root.style.setProperty("--fx", `${fx}px`);
    this.root.style.setProperty("--fw", `${fw}px`);
    this.root.style.setProperty("--fb", `${fy + fh + 16}px`);
    this.root.style.setProperty("--keytop", `${pad + lh * (left.length + 1)}px`);
    const look = `VIEW: ${t.look.toUpperCase()} (${t.lookKey})`, zoom = `ZOOM ${t.zoom}X`;
    if (this.look.textContent !== look) this.look.textContent = look;
    if (this.zoom.textContent !== zoom) this.zoom.textContent = zoom;
    if (this.keyShown !== t.kinds) { this.keyShown = t.kinds; this.key.hidden = !t.kinds; }
    if (!t.kinds) this.lock.hidden = true;
  }

  /** A ladder of ticks up and down from the value, labelled every `every`, with the value boxed beside it. */
  private ladder(g: CanvasRenderingContext2D, x: number, y0: number, h: number, value: number, span: number, every: number,
    side: "left" | "right", label: string, title: string) {
    const per = h / span, mid = y0 + h / 2, out = side === "left" ? -1 : 1, ticks: number[][] = [[x, y0, x, y0 + h]];
    const minor = every / 5;
    for (let v = Math.ceil((value - span / 2) / minor) * minor; v <= value + span / 2; v += minor) {
      const y = mid - (v - value) * per, big = Math.abs(v / every - Math.round(v / every)) < 1e-6;
      ticks.push([x, y, x + out * (big ? 8 : 4), y]);
      if (big) this.text(g, String(Math.round(v)), x + out * 12, y, side === "left" ? "right" : "left", 0.8);
    }
    // the pointer, on the side away from the numbers
    const px = x - out * 4;
    ticks.push([px, mid, px - out * 6, mid - 4], [px, mid, px - out * 6, mid + 4]);
    this.lines(g, ticks);
    this.boxed(g, label, px - out * 10, mid, side === "left" ? "left" : "right");
    this.text(g, title, x, y0 - 10, "center", 0.8);
  }

  /** Polylines, drawn dark and wide then light and thin, so they read on sky and stone alike. */
  private lines(g: CanvasRenderingContext2D, polys: number[][]) {
    for (const [col, w] of [[SHADE, 3], [INK, 1]] as const) {
      g.strokeStyle = col; g.lineWidth = w;
      g.beginPath();
      for (const p of polys) { g.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]); }
      g.stroke();
    }
  }

  private text(g: CanvasRenderingContext2D, s: string, x: number, y: number, align: CanvasTextAlign, alpha = 1) {
    g.textAlign = align;
    g.globalAlpha = alpha;
    g.fillStyle = SHADE; g.fillText(s, x + 1, y + 1);
    g.fillStyle = INK; g.fillText(s, x, y);
    g.globalAlpha = 1;
  }

  /** Words in a thin box: at (x, y), reading away from x on the side given. */
  private boxed(g: CanvasRenderingContext2D, s: string, x: number, y: number, from: "left" | "right" | "center") {
    g.textAlign = "left";
    const w = g.measureText(s).width + 8, h = 15;
    const x0 = from === "center" ? x - w / 2 : from === "left" ? x : x - w;
    this.lines(g, [[x0, y - h / 2, x0 + w, y - h / 2, x0 + w, y + h / 2, x0, y + h / 2, x0, y - h / 2]]);
    this.text(g, s, x0 + 4, y + 0.5, "left");
  }
}

/** A heading on the tape: the four points of the compass by name, the rest as three figures. */
function compass(d: number): string {
  const a = ((d % 360) + 360) % 360;
  return a === 0 ? "N" : a === 90 ? "E" : a === 180 ? "S" : a === 270 ? "W" : String(a).padStart(3, "0");
}

/** Degrees as degrees, minutes and seconds, with the side of the world. */
function dms(v: number, pos: string, neg: string): string {
  const a = Math.abs(v), d = Math.floor(a), m = Math.floor((a - d) * 60), s = Math.floor(((a - d) * 60 - m) * 60);
  return `${v >= 0 ? pos : neg}: ${d}°${String(m).padStart(2, "0")}'${String(s).padStart(2, "0")}"`;
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
