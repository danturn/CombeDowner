// Aiming with an iPad's trackpad or mouse (a Magic Keyboard's, say). Safari on an iPad can't capture
// the pointer, as it can on a Mac, so the game can't take the trackpad over. Instead, while the game
// is on its touch controls, moving the pointer over the game looks round as the mouse does on a
// computer, and held at the edge of the screen it keeps turning that way, so you can turn right
// round. A two-finger swipe looks round too, with no edge to stop it. A click shoots (held, a
// burst), and a two-finger click aims, again to stop. The touch buttons are put away while the
// trackpad's in use, and come back at the next touch on the screen. ` turns all this off, so the
// trackpad drags to look as a finger does, and on again; it's remembered.
//
// Who decides what: nobody else. It only turns your own view and pulls your own trigger, as the
// mouse does (game.ts).
import type { Game } from "./game";

/** How far in from the screen's edge (a share of its width or height) the pointer turns you. */
const EDGE = 0.06;
/** How fast it turns you right at the edge, side to side and up and down (radians a second). */
const EDGE_TURN = 2.4, EDGE_TILT = 1.2;

export class Trackpad {
  /** Whether the trackpad aims (` turns it off and on). */
  on = (() => { try { return localStorage.getItem("cd-mouseaim") !== "off"; } catch { return true; } })();
  /** Where the pointer was last over the game, or null when it's over something else. */
  private at: { x: number; y: number } | null = null;
  /** The trackpad's been used since the last touch on the screen: the touch buttons are away. */
  private inUse = false;
  private firing = false;
  private aimedAt = 0;

  /** game: the game being played now. play: whether it's on the touch controls and playing, with
   *  nothing else over it. showTouch: put the touch buttons out or away. */
  constructor(private canvas: HTMLCanvasElement, private game: () => Game | null, private play: () => boolean,
    private showTouch: (show: boolean) => void) {
    const live = () => this.on && this.play();
    // over the game, or over the paper you get on joining, which a click puts away as it shoots
    const over = (t: EventTarget | null) => t === canvas || (t instanceof Element && !!t.closest("#scoreboard"));
    addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse" || !live()) return;
      const was = this.at;
      this.at = over(e.target) ? { x: e.clientX, y: e.clientY } : null;
      if (!this.at) return;
      this.use();
      if (was) this.game()?.look((e.clientX - was.x) * 1.5, (e.clientY - was.y) * 1.5);
    });
    // the click doesn't reach the touch controls, which would take it as the start of a drag
    addEventListener("pointerdown", (e) => {
      if (e.pointerType === "touch") { this.letGo(); return; }
      if (e.pointerType !== "mouse" || !over(e.target) || !live()) return;
      const g = this.game();
      if (!g) return;
      e.preventDefault();
      e.stopPropagation();
      this.use();
      g.putAwayDaily();
      if (e.button === 0) { g.firing = this.firing = true; g.shootOnce = true; }
      if (e.button === 2) this.aim(g);
    }, true);
    addEventListener("pointerup", (e) => {
      if (e.pointerType !== "mouse" || e.button !== 0 || !this.firing) return;
      this.firing = false;
      const g = this.game();
      if (g) g.firing = false;
    }, true);
    // a two-finger click comes as a right click, or on some as only the menu it would open
    addEventListener("contextmenu", (e) => {
      const g = this.game();
      if (!over(e.target) || !live() || !g) return;
      e.preventDefault();
      if (performance.now() - this.aimedAt > 400) this.aim(g);
    });
    // a two-finger swipe looks round, the way the fingers go (pinching, which zooms the page, is left alone)
    addEventListener("wheel", (e) => {
      if (e.ctrlKey || !live() || (!over(e.target) && !this.inUse)) return;
      this.use();
      this.game()?.look(-e.deltaX * 1.2, -e.deltaY * 1.2);
    }, { passive: true });
    addEventListener("blur", () => this.stopFiring());
  }

  private aim(g: Game) {
    this.aimedAt = performance.now();
    g.aiming = !g.aiming;
    g.binoculars = false;
  }

  private use() {
    if (this.inUse) return;
    this.inUse = true;
    this.showTouch(false);
    this.canvas.style.cursor = "none";
  }

  /** A touch on the screen: the touch buttons come back. */
  letGo() {
    this.at = null;
    this.stopFiring();
    if (!this.inUse) return;
    this.inUse = false;
    this.canvas.style.cursor = "";
    if (this.play()) this.showTouch(true);
  }

  private stopFiring() {
    if (!this.firing) return;
    this.firing = false;
    const g = this.game();
    if (g) g.firing = false;
  }

  /** The ` key: the trackpad aims, or drags to look as a finger does. Says which it is now. */
  toggle(): boolean {
    this.on = !this.on;
    try { localStorage.setItem("cd-mouseaim", this.on ? "on" : "off"); } catch { /* ignore */ }
    if (!this.on) this.letGo();
    return this.on;
  }

  /** Each frame: the pointer held at the screen's edge keeps turning you that way. */
  frame(dt: number) {
    const g = this.game(), at = this.at;
    if (!g || !at || !this.inUse || !this.on || !this.play()) return;
    const edge = (v: number, size: number) => {
      const f = v / Math.max(1, size);
      return f < EDGE ? -(1 - f / EDGE) : f > 1 - EDGE ? (f - (1 - EDGE)) / EDGE : 0;
    };
    const ex = edge(at.x, innerWidth), ey = edge(at.y, innerHeight);
    if (!ex && !ey) return;
    const s = dt / g.player.sensitivity;
    g.look(ex * EDGE_TURN * s, ey * EDGE_TILT * s);
  }
}
