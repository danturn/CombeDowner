// The fly-overs: when a structure's sockets are full and the next zone opens (oddments.ts, zones.ts),
// the camera leaves you, sweeps over the town to the new zone's challenge and circles it under a
// card with the zone's name and anything else it opens, then comes back; when the last zone opens,
// a long, high circle over the whole map. The
// paths are worked out from the spot and the map's own size, so they work on any map. E, Space,
// Enter, a click or a tap skips it, and so do the card's × and Esc. While it plays, you stand still and the HUD is out of the way.
// The card lands with a flash, a fanfare and a shower of confetti (more for the last zone), drawn
// on one canvas over the screen so it costs no more on a phone than on a desktop.
//
// Who decides what: nothing goes over the network. Each player's screen plays it when the host's
// word on the sockets (oddments.ts) says a milestone has just been reached, so everyone in the
// room sees it at once.
import * as THREE from "three";
import type { GameMap } from "./map";
import { ctl } from "./controls";
import { modal } from "./modal";
import * as SFX from "./audio";
import { view } from "./view";

export interface Shot {
  /** "spot": the sweep to a new challenge's place; "map": the finale's circle over the whole map. */
  kind: "spot" | "map";
  x: number; z: number;
  kicker: string; title: string; sub?: string;
  /** A line each under that: what else has just opened up (a new way to get about). */
  lines?: string[];
}

const SPOT_SECS = 8, MAP_SECS = 17, BLEND = 1.4, CARD_AT = 1.2;
const ease = (t: number) => t * t * (3 - 2 * t);
const COLOURS = ["#ff4f6d", "#ffd23f", "#3ec1ff", "#5be37d", "#c77dff", "#ff9f1c", "#ffffff"];

interface Bit { x: number; y: number; vx: number; vy: number; a: number; va: number; w: number; h: number; c: string; ph: number }

/** Confetti over the whole screen, on one canvas, moved on by the fly-over's own frames. */
class Confetti {
  private bits: Bit[] = [];
  private g: CanvasRenderingContext2D | null;
  private scale = 1;
  constructor(readonly canvas: HTMLCanvasElement) { this.g = canvas.getContext("2d"); }

  /** Cannons from both bottom corners and a sprinkle from the top; big fills the sky. */
  burst(n: number) {
    const W = innerWidth, H = innerHeight, k0 = this.bits.length;
    for (let k = 0; k < n; k++) {
      const c = COLOURS[(k0 + k) % COLOURS.length], w = 7 + Math.random() * 7, h = 4 + Math.random() * 4;
      const ph = Math.random() * 6, a = Math.random() * 6, va = (Math.random() - 0.5) * 12;
      if (k % 3 === 2) {
        this.bits.push({ x: Math.random() * W, y: -20 - Math.random() * H * 0.4, vx: (Math.random() - 0.5) * 80, vy: 40 + Math.random() * 100, a, va, w, h, c, ph });
        continue;
      }
      const side = k % 3, ang = side ? Math.PI * (1.18 + Math.random() * 0.22) : -Math.PI * (0.18 + Math.random() * 0.22);
      const v = (0.9 + Math.random() * 0.9) * Math.max(H, 420);
      this.bits.push({ x: side ? W + 10 : -10, y: H * 0.9, vx: Math.cos(ang) * v, vy: -Math.abs(Math.sin(ang) * v), a, va, w, h, c, ph });
    }
  }

  get busy() { return this.bits.length > 0; }

  /** fade: 1 as it is, down to 0 as the fly-over ends. */
  update(dt: number, fade: number) {
    const cv = this.canvas, g = this.g;
    if (!g) return;
    // half the screen's own pixels at most: confetti is soft at the edges anyway, and a phone's
    // screen has three or four pixels to each one of ours
    const s = Math.min(1, (devicePixelRatio || 1) * 0.75), W = innerWidth, H = innerHeight;
    if (cv.width !== Math.round(W * s) || cv.height !== Math.round(H * s)) { cv.width = Math.round(W * s); cv.height = Math.round(H * s); this.scale = s; }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cv.width, cv.height);
    if (!this.bits.length) return;
    g.globalAlpha = Math.max(0, Math.min(1, fade));
    g.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    let n = 0;
    for (const b of this.bits) {
      // fast out of the cannon, then drag and a flutter from side to side as it floats down
      b.vy += 900 * dt; b.vx *= 1 - Math.min(1, 1.6 * dt); b.vy = Math.min(b.vy, 150 + b.w * 6);
      b.ph += dt * 5;
      b.x += (b.vx + Math.sin(b.ph) * 40) * dt; b.y += b.vy * dt; b.a += b.va * dt;
      if (b.y > H + 30) continue;
      this.bits[n++] = b;
      const cs = Math.cos(b.a), sn = Math.sin(b.a), flip = Math.cos(b.ph * 1.3);
      g.setTransform(cs * this.scale, sn * this.scale, -sn * flip * this.scale, cs * flip * this.scale, b.x * this.scale, b.y * this.scale);
      g.fillStyle = b.c;
      g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
    }
    this.bits.length = n;
  }

  clear() { this.bits.length = 0; }
}

export class Reveal {
  private shot: Shot | null = null;
  private t = 0;
  private from = new THREE.Vector3();
  private fromLook = new THREE.Vector3();
  private a0 = 0;
  private el: HTMLElement | null = null;
  /** Where the camera's looking: the world loads its detail round there while it plays. */
  readonly look = new THREE.Vector3();
  private cam = new THREE.Vector3();
  private confetti: Confetti | null = null;
  private landed = false;
  private fanfare: SFX.Playing | null = null;
  private kick = 0;

  constructor(private map: GameMap, private touch: () => boolean) {}

  get on() { return !!this.shot; }

  /** Start a fly-over from where the camera is now. */
  play(s: Shot, camera: THREE.Camera, me: { x: number; z: number }) {
    this.shot = s; this.t = 0;
    this.from.copy(camera.position);
    this.fromLook.copy(camera.position).add(new THREE.Vector3(0, 0, -10).applyQuaternion(camera.quaternion));
    // it sets out from your side of the spot, so you see where it is from where you are
    this.a0 = Math.atan2(me.x - s.x, me.z - s.z);
    if (!Number.isFinite(this.a0)) this.a0 = 0;
    this.card(s);
    SFX.revealSwell(s.kind === "map");
  }

  skip() { if (this.shot) this.t = this.secs(); }

  private secs() { return this.shot?.kind === "map" ? MAP_SECS : SPOT_SECS; }

  /** Every frame while it's on: put the camera where the shot has got to. Returns false once it's over. */
  update(dt: number, camera: THREE.PerspectiveCamera): boolean {
    const s = this.shot;
    if (!s) return false;
    this.t += dt;
    const T = this.secs();
    if (this.t >= T) { this.end(); return false; }
    const f = this.t / T, g = this.map.ground(s.x, s.z);
    let cx: number, cy: number, cz: number, ly: number;
    if (s.kind === "spot") {
      // in from high and far, down to a slow circle round it
      const k = ease(Math.min(1, f * 1.6)), r = 260 - 205 * k, h = 150 - 115 * k, a = this.a0 + f * 1.9;
      cx = s.x + Math.sin(a) * r; cz = s.z + Math.cos(a) * r; cy = g + h; ly = g + 4;
      this.look.set(s.x, ly, s.z);
    } else {
      // a widening circle that drifts from the structure out over the middle of the map, kept
      // inside the fog's reach so there's a town to see
      const fr = this.map.fieldFrame(), k = ease(Math.min(1, f * 1.3));
      const mx = s.x + (fr.x - s.x) * k, mz = s.z + (-fr.y - s.z) * k;
      const R = 90 + (Math.min(fr.r * 0.6, view.fogFar * 0.5) - 90) * k, H = 50 + (R * 0.45 - 50) * k;
      const a = this.a0 + f * Math.PI * 1.6, gm = this.map.ground(mx, mz);
      cx = mx + Math.sin(a) * R; cz = mz + Math.cos(a) * R; cy = gm + H; ly = gm;
      this.look.set(mx, ly, mz);
    }
    cy = Math.max(cy, this.map.ground(cx, cz) + 18);
    this.cam.set(cx, cy, cz);
    // out of your eyes and back at the start, and back into them at the end
    const b = ease(Math.min(1, this.t / BLEND, (T - this.t) / BLEND));
    camera.position.lerpVectors(this.from, this.cam, b);
    camera.lookAt(new THREE.Vector3().lerpVectors(this.fromLook, this.look, b));
    if (this.kick > 0) {
      // a jolt as the card lands, dying away in a third of a second
      this.kick = Math.max(0, this.kick - dt * 3);
      const k = this.kick * this.kick * (s.kind === "map" ? 1.2 : 0.7);
      camera.position.y += Math.sin(this.t * 70) * k;
      camera.rotateZ(Math.sin(this.t * 53) * k * 0.012);
    }
    if (!this.landed && this.t > CARD_AT) this.land(s);
    if (this.el) this.el.classList.toggle("shown", this.t > CARD_AT && this.t < T - 1);
    this.confetti?.update(dt, Math.min(1, (T - this.t) / 1.2));
    return true;
  }

  /** The card's arrival: the fanfare, the flash and a burst of confetti, with more to follow. */
  private land(s: Shot) {
    this.landed = true;
    const big = s.kind === "map";
    this.kick = 1;
    this.el?.classList.add("landed");
    const c = this.confetti;
    if (c) {
      c.burst(big ? 260 : 150);
      for (const [at, n] of big ? [[1.7, 200], [3.6, 220], [6, 160]] : [[1.4, 90]]) window.setTimeout(() => { if (this.confetti === c && this.shot === s) c.burst(n); }, at * 1000);
    }
    this.fanfare?.stop();
    this.fanfare = SFX.unlockFanfare(big);
  }

  private card(s: Shot) {
    this.el?.remove();
    const hud = document.getElementById("hud");
    if (!hud) return;
    const el = document.createElement("div");
    el.id = "reveal";
    const skip = this.touch() ? "Tap to skip" : `${ctl("use")} to skip`;
    el.className = s.kind === "map" ? "rvbig" : "";
    el.innerHTML = `<canvas class="rvconfetti"></canvas><div class="rvflash"></div><div class="rvcard"><small></small><h2></h2><p></p></div><button type="button" class="rvskip"></button>`;
    el.querySelector("small")!.textContent = s.kicker;
    el.querySelector("h2")!.textContent = s.title;
    el.querySelector("p")!.textContent = s.sub ?? "";
    for (const line of s.lines ?? []) {
      const p = document.createElement("p");
      p.className = "rvnew"; p.textContent = line;
      el.querySelector(".rvcard")!.appendChild(p);
    }
    el.querySelector("button")!.textContent = skip;
    el.addEventListener("pointerdown", (e) => { e.preventDefault(); this.skip(); });
    hud.appendChild(el);
    this.confetti = new Confetti(el.querySelector("canvas")!);
    this.landed = false; this.kick = 0;
    // its × puts the card away and ends the fly-over, as Esc does (modal.ts)
    modal(el, () => el.querySelector<HTMLElement>(".rvcard") ?? el, () => this.end());
    hud.classList.add("reveal");
    document.body.classList.add("reveal");
    this.el = el;
  }

  private end() {
    this.shot = null;
    this.fanfare?.stop(); this.fanfare = null;
    this.confetti?.clear(); this.confetti = null;
    this.kick = 0;
    this.el?.remove(); this.el = null;
    document.getElementById("hud")?.classList.remove("reveal");
    document.body.classList.remove("reveal");
  }

  dispose() { this.end(); }
}
