// Controls for when the browser won't capture the mouse (iPad Safari, phones, some in-app browsers).
// Drag on the right of the screen to look, joystick on the left to move, tap to shoot,
// and on-screen buttons for everything else. A keyboard still works alongside.
import type { Game } from "./game";

const STICK = 60; // joystick radius in px

function capture(el: Element, id: number) {
  try { el.setPointerCapture(id); } catch { /* the pointer may already be gone */ }
}

export class TouchControls {
  private stickId = -1;
  private stickX = 0; private stickY = 0;
  private lookId = -1;
  private lastX = 0; private lastY = 0;
  private downAt = 0; private moved = 0;
  private base: HTMLElement; private knob: HTMLElement;

  constructor(private game: Game, private canvas: HTMLCanvasElement, onPause: () => void) {
    const $ = (id: string) => document.getElementById(id)!;
    this.base = $("stickbase"); this.knob = $("stickknob");
    canvas.addEventListener("pointerdown", (e) => this.down(e));
    canvas.addEventListener("pointermove", (e) => this.move(e));
    canvas.addEventListener("pointerup", (e) => this.up(e));
    canvas.addEventListener("pointercancel", (e) => this.up(e));

    const hold = (id: string, on: () => void, off: () => void = () => {}) => {
      const el = $(id);
      el.addEventListener("pointerdown", (e) => { e.preventDefault(); capture(el, e.pointerId); el.classList.add("on"); on(); });
      const end = () => { el.classList.remove("on"); off(); };
      el.addEventListener("pointerup", end);
      el.addEventListener("pointercancel", end);
    };
    hold("t-fire", () => { game.firing = true; game.shootOnce = true; }, () => (game.firing = false));
    hold("t-jump", () => game.jump());
    hold("t-reload", () => game.reload());
    hold("t-swap", () => game.cycleWeapon(1));
    hold("t-aim", () => { game.aiming = !game.aiming; $("t-aim").classList.toggle("latched", game.aiming); });
    hold("t-crouch", () => { game.player.crouchLatch = !game.player.crouchLatch; $("t-crouch").classList.toggle("latched", game.player.crouchLatch); });
    hold("t-pause", onPause);
    hold("t-radio", () => game.voice.radio(true), () => game.voice.radio(false));
  }

  private down(e: PointerEvent) {
    if (!this.game.active || !this.game.freeMode) return;
    e.preventDefault();
    capture(this.canvas, e.pointerId);
    if (e.pointerType === "touch" && e.clientX < innerWidth * 0.4 && this.stickId < 0) {
      this.stickId = e.pointerId;
      this.stickX = e.clientX; this.stickY = e.clientY;
      this.base.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      this.knob.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      this.base.hidden = this.knob.hidden = false;
    } else if (this.lookId < 0) {
      this.lookId = e.pointerId;
      this.lastX = e.clientX; this.lastY = e.clientY;
      this.downAt = performance.now(); this.moved = 0;
    }
  }

  private move(e: PointerEvent) {
    if (e.pointerId === this.stickId) {
      let dx = e.clientX - this.stickX, dy = e.clientY - this.stickY;
      const d = Math.hypot(dx, dy);
      if (d > STICK) { dx *= STICK / d; dy *= STICK / d; }
      this.knob.style.transform = `translate(${this.stickX + dx}px, ${this.stickY + dy}px)`;
      this.game.player.joy.x = dx / STICK;
      this.game.player.joy.y = dy / STICK;
    } else if (e.pointerId === this.lookId) {
      const dx = e.clientX - this.lastX, dy = e.clientY - this.lastY;
      this.lastX = e.clientX; this.lastY = e.clientY;
      this.moved += Math.abs(dx) + Math.abs(dy);
      this.game.look(dx * 1.6, dy * 1.6);
    }
  }

  private up(e: PointerEvent) {
    if (e.pointerId === this.stickId) {
      this.stickId = -1;
      this.game.player.joy.x = this.game.player.joy.y = 0;
      this.base.hidden = this.knob.hidden = true;
    } else if (e.pointerId === this.lookId) {
      this.lookId = -1;
      // a quick tap without dragging fires one shot
      if (this.moved < 10 && performance.now() - this.downAt < 300) this.game.shootOnce = true;
    }
  }
}
