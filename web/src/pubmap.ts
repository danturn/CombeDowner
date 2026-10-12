// The pub map: "Go to a pub" in the pause menu opens a map of the whole force field with a pint on
// every pub. Scroll or pinch to zoom, drag to look about, point at a pub for its name, how far it is
// and its food hygiene rating, and click it to go there. A click where several pubs crowd together
// (the middle of Bath, zoomed right out) zooms in on them instead.
//
// Nothing here goes over the network: going to a pub just moves you (Game.goTo), and everyone else
// sees you turn up there in your next position update.
import type { Game } from "./game";

const $ = (id: string) => document.getElementById(id)!;
const HELP_MOUSE = "Scroll to zoom, drag to look about, and click a pub to go there.";
const HELP_TOUCH = "Pinch to zoom, drag to look about, and tap a pub to go there.";
const PICK = 16;            // CSS pixels from a pint that still count as clicking it
const MIN_MPP = 0.6;        // closest zoom: metres to the screen pixel

export class PubMap {
  private canvas = $("pubcanvas") as HTMLCanvasElement;
  private cx = 0; private cy = 0;       // the middle of the view, data coords
  private mpp = 1; private maxMpp = 1;  // metres to the canvas pixel, now and zoomed right out
  private pubs: ReturnType<Game["pubs"]> = [];
  private at: [number, number][] = [];  // each pub on the canvas, from the last draw
  private hover = -1;
  private note = "";                    // why you can't go, until you point at something else
  private down = new Map<number, [number, number]>();
  private moved = 0; private spread = 0;
  private frame = 0;
  private help = HELP_MOUSE;

  /** current: the game being played, if any. onGo: back to playing, after going somewhere. */
  constructor(private current: () => Game | null, private onGo: () => void) {
    const c = this.canvas;
    c.addEventListener("pointerdown", (e) => this.press(e));
    c.addEventListener("pointermove", (e) => this.move(e));
    c.addEventListener("pointerup", (e) => this.release(e));
    c.addEventListener("pointercancel", (e) => this.down.delete(e.pointerId));
    c.addEventListener("pointerleave", () => { if (!this.down.size) this.point(-1); });
    c.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.zoomAt(...this.px(e), Math.exp(e.deltaY * (e.deltaMode ? 0.05 : 0.0015)));
    }, { passive: false });
    $("pubzoomin").addEventListener("click", () => this.zoomAt(c.width / 2, c.height / 2, 1 / 1.6));
    $("pubzoomout").addEventListener("click", () => this.zoomAt(c.width / 2, c.height / 2, 1.6));
    $("pubback").addEventListener("click", () => this.close());
    // Esc goes back to the pause menu rather than out of it
    addEventListener("keydown", (e) => {
      if (e.code === "Escape" && this.isOpen) { e.stopImmediatePropagation(); this.close(); }
    }, true);
    addEventListener("resize", () => { if (this.isOpen) this.fit(false); });
  }

  get isOpen() { return !$("pubmap").hidden; }
  private get game() { return this.current()!; }

  open() {
    if (!this.current()) return;
    this.pubs = this.game.pubs();
    this.hover = -1; this.note = "";
    $("pubmap").hidden = false;
    this.fit(true);
  }

  close() {
    $("pubmap").hidden = true;
    this.down.clear();
  }

  /** Size the canvas to its box; reset: frame the whole force field. */
  private fit(reset: boolean) {
    const c = this.canvas, dpr = Math.min(2, devicePixelRatio || 1);
    const w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr);
    if (!w || !h) return;
    c.width = w; c.height = h;
    const f = this.game.fieldArea;
    this.maxMpp = (f.r * 2.08) / Math.min(w, h);
    if (reset) { this.cx = f.x; this.cy = f.y; this.mpp = this.maxMpp; }
    this.mpp = Math.min(this.mpp, this.maxMpp);
    this.draw();
  }

  private draw() {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => {
      const pins = this.pubs.map((p, i) => ({ x: p.x, z: p.z, on: i === this.hover, label: p.name }));
      this.at = this.game.drawPubMap(this.canvas, this.cx, this.cy, this.mpp, pins, () => this.draw());
      const p = this.pubs[this.hover];
      const far = (m: number) => (m < 20 ? "you're here" : m < 1000 ? `${Math.round(m / 10) * 10} m away` : `${(m / 1000).toFixed(1)} km away`);
      $("pubinfo").textContent = this.note || (p
        ? `${p.name}, ${far(p.far)}${p.rating === null ? "" : `. Food hygiene rating: ${p.rating} out of 5`}`
        : this.pubs.length ? this.help : "No pubs on this map yet.");
    });
  }

  /** Where the pointer is, in canvas pixels. */
  private px(e: PointerEvent | WheelEvent): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    return [(e.clientX - r.left) * (this.canvas.width / r.width), (e.clientY - r.top) * (this.canvas.height / r.height)];
  }

  /** The pubs within reach of canvas point (x, y), nearest first. */
  private near(x: number, y: number): number[] {
    const reach = PICK * (this.canvas.width / this.canvas.clientWidth);
    return this.at.map((a, i) => [Math.hypot(a[0] - x, a[1] - y), i])
      .filter(([d]) => d < reach).sort((a, b) => a[0] - b[0]).map(([, i]) => i);
  }

  private point(i: number) {
    if (i === this.hover) return;
    this.hover = i; this.note = "";
    this.draw();
  }

  private zoomAt(x: number, y: number, f: number) {
    const c = this.canvas, m = Math.max(MIN_MPP, Math.min(this.maxMpp, this.mpp * f));
    // keep the spot under the pointer where it is
    const wx = this.cx + (x - c.width / 2) * this.mpp, wy = this.cy - (y - c.height / 2) * this.mpp;
    this.mpp = m;
    this.cx = wx - (x - c.width / 2) * m; this.cy = wy + (y - c.height / 2) * m;
    this.keepIn();
    this.draw();
  }

  /** Don't let the view wander off past the force field. */
  private keepIn() {
    const f = this.game.fieldArea;
    this.cx = Math.max(f.x - f.r, Math.min(f.x + f.r, this.cx));
    this.cy = Math.max(f.y - f.r, Math.min(f.y + f.r, this.cy));
  }

  private press(e: PointerEvent) {
    if (e.pointerType === "touch") this.help = HELP_TOUCH;
    this.canvas.setPointerCapture(e.pointerId);
    this.down.set(e.pointerId, this.px(e));
    if (this.down.size === 1) this.moved = 0;
    if (this.down.size === 2) { const [a, b] = [...this.down.values()]; this.spread = Math.hypot(a[0] - b[0], a[1] - b[1]); this.moved = 1e9; }
  }

  private move(e: PointerEvent) {
    const [x, y] = this.px(e), was = this.down.get(e.pointerId);
    if (!was) { if (e.pointerType === "mouse") this.point(this.near(x, y)[0] ?? -1); return; }
    this.down.set(e.pointerId, [x, y]);
    if (this.down.size === 1) {
      // drag to look about
      this.moved += Math.hypot(x - was[0], y - was[1]);
      this.cx -= (x - was[0]) * this.mpp; this.cy += (y - was[1]) * this.mpp;
      this.keepIn();
      this.draw();
    } else if (this.down.size === 2) {
      // pinch to zoom, about the middle of the two fingers
      const [a, b] = [...this.down.values()], spread = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (this.spread && spread) this.zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, this.spread / spread);
      this.spread = spread;
    }
  }

  private release(e: PointerEvent) {
    const was = this.down.delete(e.pointerId);
    const tap = was && !this.down.size && this.moved < 8 * (this.canvas.width / this.canvas.clientWidth);
    if (this.down.size < 2) this.spread = 0;
    if (tap) this.pick(...this.px(e));
  }

  /** A click: go to the pub there, or zoom in on a crowd of them. */
  private pick(x: number, y: number) {
    const hits = this.near(x, y);
    if (!hits.length) { this.point(-1); return; }
    if (hits.length > 1 && this.mpp > MIN_MPP * 1.5) { this.hover = -1; this.zoomAt(x, y, 1 / 3); return; }
    const p = this.pubs[hits[0]];
    const why = this.game.goTo(p.i);
    if (why) { this.hover = hits[0]; this.note = why; this.draw(); return; }
    this.close();
    this.onGo();
  }
}
