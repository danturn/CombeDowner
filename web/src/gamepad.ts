// Game controllers: a PS5 pad over Bluetooth, an Xbox pad, or anything the browser lays out in the
// standard way. The left stick walks (or steers), the right stick looks, the triggers shoot and aim
// (or drive and brake), and the rest stand in for keys. It's only another way of pressing the same
// keys and buttons: the pad is read each frame, and each page (main.ts, mines/main.ts) says what its
// buttons do, mostly by pressing the keyboard key that does it, so nothing in the game knows a pad
// is there. Off the game (the menus, the pause screen) the d-pad or left stick moves between the
// buttons, Cross presses one and Circle goes back, as Esc does.
//
// Who decides what: nobody. Like the keyboard, a pad only moves you; what you do goes out as usual.
import type { Player } from "./player";

/** The standard layout's buttons, named the PlayStation way. */
export const B = {
  cross: 0, circle: 1, square: 2, triangle: 3, l1: 4, r1: 5, l2: 6, r2: 7,
  create: 8, options: 9, l3: 10, r3: 11, up: 12, down: 13, left: 14, right: 15, ps: 16, touchpad: 17,
} as const;

/** What a page lets the pad do while you're playing. */
export interface PadPage {
  /** In the game with nothing over it: the pad plays, rather than going round a menu. */
  playing(): boolean;
  player(): Player | null;
  look(dx: number, dy: number): void;
  /** Driving: the triggers are the pedals, and the left stick only steers. */
  driving(): boolean;
  /** A button pressed or let go. Let-gos come even once you've paused, so nothing's left held down. */
  button(b: number, down: boolean): void;
}

/** Press or let go of a keyboard key, as if typed: the game's own keys do the rest. */
export function key(code: string, down: boolean) {
  dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { code, key: code === "Escape" ? "Escape" : code === "Enter" ? "Enter" : "", bubbles: true }));
}
export function tap(code: string) { key(code, true); key(code, false); }
export function mouse(button: number, down: boolean) {
  dispatchEvent(new MouseEvent(down ? "mousedown" : "mouseup", { button, bubbles: true }));
}

const STICK_DEAD = 0.12;    // stick drift on a worn pad stays under this
const TRIGGER_DEAD = 0.06;
const HELD = 0.5;           // a trigger pulled this far counts as pressed
// how fast full right stick turns you, in the mouse's pixels a second (the mouse sensitivity scales it
// like the mouse): about 3.5 radians a second across, a bit slower up and down
const LOOK_X = 1600, LOOK_Y = 1050;
const REPEAT_FIRST = 0.4, REPEAT = 0.14;   // seconds before a held d-pad moves on again round a menu

/** Radial dead zone, rescaled so the stick still reaches 1. */
function stick(x: number, y: number): [number, number] {
  const m = Math.hypot(x, y);
  if (m < STICK_DEAD) return [0, 0];
  const n = Math.min(1, (m - STICK_DEAD) / (1 - STICK_DEAD));
  return [(x / m) * n, (y / m) * n];
}

let usedAt = -1e9;
let padIndex = -1;

/** A short buzz, if a pad's being played with and can: firing is light, being hit heavier. */
export function rumble(strong: number, weak: number, ms: number) {
  if (performance.now() - usedAt > 20000 || padIndex < 0) return;
  try {
    const p = navigator.getGamepads?.()[padIndex] as (Gamepad & { vibrationActuator?: { playEffect?: (t: string, o: object) => Promise<unknown> } }) | null;
    p?.vibrationActuator?.playEffect?.("dual-rumble", { duration: ms, strongMagnitude: strong, weakMagnitude: weak })?.catch?.(() => {});
  } catch { /* no rumble here */ }
}

export class GamepadControls {
  private was: boolean[] = [];
  private movedJoy = false;
  private navT = 0;
  private navDir = -1;
  private focused: HTMLElement | null = null;

  constructor(private page: () => PadPage | null) {}

  /** Read the pad and act on it: once a frame. */
  poll(dt: number) {
    const pad = this.pick();
    if (!pad) return;
    const now = performance.now();
    const btn = (i: number) => pad.buttons[i]?.pressed ?? false;
    const val = (i: number) => pad.buttons[i]?.value ?? 0;
    const down: boolean[] = pad.buttons.map((b, i) => b.pressed || ((i === B.l2 || i === B.r2) && b.value > HELD));
    const ax = pad.axes;
    if (down.some(Boolean) || ax.some((a) => Math.abs(a) > 0.3)) usedAt = now;

    const page = this.page();
    const playing = !!page?.playing();
    const pressed = (i: number) => down[i] && !this.was[i];
    for (let i = 0; i < down.length; i++) if (!down[i] && this.was[i]) page?.button(i, false);

    const p = page?.player() ?? null;
    if (playing && page && p && !document.getElementById("tinlock")) {
      this.unfocus();
      let [mx, my] = stick(ax[0] ?? 0, ax[1] ?? 0);
      if (page.driving()) {
        const r = val(B.r2), l = val(B.l2);
        if (r > TRIGGER_DEAD || l > TRIGGER_DEAD) my = l - r;
      }
      if (mx || my) { p.joy.x = mx; p.joy.y = my; this.movedJoy = true; }
      else if (this.movedJoy) { p.joy.x = p.joy.y = 0; this.movedJoy = false; }
      const [lx, ly] = stick(ax[2] ?? 0, ax[3] ?? 0);
      const m = Math.hypot(lx, ly);
      if (m) {
        // squared, so small pushes aim finely and a full push still turns quickly
        const k = m * dt;
        page.look(lx * k * LOOK_X, ly * k * LOOK_Y);
      }
      if (pressed(B.options)) {
        // as Esc does: letting go of the mouse is what pauses a game played with it captured
        if (document.pointerLockElement) document.exitPointerLock(); else tap("Escape");
      }
      for (let i = 0; i < down.length; i++) if (pressed(i) && i !== B.options) page.button(i, true);
    } else {
      if (this.movedJoy && p) { p.joy.x = p.joy.y = 0; }
      this.movedJoy = false;
      this.menus(pad, down, dt, btn);
    }
    this.was = down;
  }

  /** The first pad laid out the standard way. */
  private pick(): Gamepad | null {
    let pads: (Gamepad | null)[] = [];
    try { pads = navigator.getGamepads?.() ? [...navigator.getGamepads()] : []; } catch { return null; }
    const pad = pads.find((g) => g?.connected && g.mapping === "standard") ?? null;
    padIndex = pad ? pad.index : -1;
    return pad;
  }

  // ---- off the game: round the menu's buttons -------------------------------------------------

  private menus(pad: Gamepad, down: boolean[], dt: number, btn: (i: number) => boolean) {
    const pressed = (i: number) => down[i] && !this.was[i];
    const [sx, sy] = stick(pad.axes[0] ?? 0, pad.axes[1] ?? 0);
    const dir = btn(B.up) || sy < -0.6 ? 0 : btn(B.down) || sy > 0.6 ? 1 : btn(B.left) || sx < -0.6 ? 2 : btn(B.right) || sx > 0.6 ? 3 : -1;
    let step = -1;
    if (dir !== this.navDir) { this.navDir = dir; this.navT = REPEAT_FIRST; step = dir; }
    else if (dir >= 0 && (this.navT -= dt) <= 0) { this.navT = REPEAT; step = dir; }

    // the tin's combination lock keeps the keyboard to itself: the pad turns its wheels by the arrows
    if (document.getElementById("tinlock")) {
      if (step >= 0) tap(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"][step]);
      if (pressed(B.cross)) tap("Enter");
      if (pressed(B.circle)) tap("Escape");
      return;
    }
    if (pressed(B.circle)) { tap("Escape"); return; }
    if (pressed(B.options)) {
      const resume = document.getElementById("resume");
      if (resume && visible(resume) && top() === resume.closest(".overlay")) resume.click();
      return;
    }
    if (step >= 0) this.move(step);
    if (pressed(B.cross)) this.press();
  }

  private move(dir: number) {
    const cur = this.current();
    if (cur && (dir === 2 || dir === 3) && this.adjust(cur, dir === 3 ? 1 : -1)) return;
    const all = targets();
    if (!all.length) return;
    if (!cur || !all.includes(cur)) { this.focus(all.find((e) => e.classList.contains("primary")) ?? all[0]); return; }
    const a = cur.getBoundingClientRect();
    const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    let best: HTMLElement | null = null, bestScore = Infinity;
    for (const e of all) {
      if (e === cur) continue;
      const r = e.getBoundingClientRect();
      const dx = r.left + r.width / 2 - ax, dy = r.top + r.height / 2 - ay;
      if ((dir === 0 ? -dy : dir === 1 ? dy : dir === 2 ? -dx : dx) <= 2) continue;
      // edge to edge, so the tickbox just below a wide box comes before a button lined up further down
      const gap = Math.max(0, dir === 0 ? a.top - r.bottom : dir === 1 ? r.top - a.bottom : dir === 2 ? a.left - r.right : r.left - a.right);
      const off = dir < 2 ? Math.max(0, r.left - a.right, a.left - r.right) : Math.max(0, r.top - a.bottom, a.top - r.bottom);
      const score = gap + off * 2 + (dir < 2 ? Math.abs(dx) : Math.abs(dy)) * 0.1;
      if (score < bestScore) { bestScore = score; best = e; }
    }
    if (best) this.focus(best);
  }

  /** Left and right on a slider or a drop-down change it rather than moving off it. */
  private adjust(el: HTMLElement, by: number): boolean {
    if (el instanceof HTMLInputElement && el.type === "range") {
      if (by > 0) el.stepUp(); else el.stepDown();
    } else if (el instanceof HTMLSelectElement) {
      const i = Math.max(0, Math.min(el.options.length - 1, el.selectedIndex + by));
      if (i === el.selectedIndex) return true;
      el.selectedIndex = i;
    } else return false;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  private press() {
    const all = targets();
    const cur = this.current();
    if (!cur || !all.includes(cur)) { if (all.length) this.focus(all.find((e) => e.classList.contains("primary")) ?? all[0]); return; }
    // in a text box, Cross is Enter: the game name's box starts the game
    if (cur instanceof HTMLInputElement && (cur.type === "text" || cur.type === "")) {
      cur.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
      return;
    }
    cur.click();
  }

  private current(): HTMLElement | null {
    const a = document.activeElement;
    return a instanceof HTMLElement && a !== document.body ? a : null;
  }

  private focus(el: HTMLElement) {
    this.unfocus();
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: "nearest" });
    el.classList.add("padfocus");
    el.addEventListener("blur", () => el.classList.remove("padfocus"), { once: true });
    this.focused = el;
  }

  private unfocus() {
    this.focused?.classList.remove("padfocus");
    this.focused = null;
  }
}

function visible(e: HTMLElement) {
  return e.getClientRects().length > 0 && getComputedStyle(e).visibility !== "hidden";
}

/** The menu on top: the visible overlay drawn over the others. */
function top(): HTMLElement | null {
  let best: HTMLElement | null = null, z = -Infinity;
  for (const o of document.querySelectorAll<HTMLElement>(".overlay")) {
    if (!visible(o)) continue;
    const oz = Number(getComputedStyle(o).zIndex) || 0;
    if (oz >= z) { z = oz; best = o; }
  }
  return best;
}

/** What the pad can move between: the top menu's buttons and boxes, or the whole page's if there's no menu. */
function targets(): HTMLElement[] {
  const sel = "button, input, select, a[href], [tabindex]:not([tabindex='-1'])";
  const scope = top() ?? document.body;
  return [...scope.querySelectorAll<HTMLElement>(sel)].filter((e) => !(e as HTMLButtonElement).disabled && visible(e));
}
