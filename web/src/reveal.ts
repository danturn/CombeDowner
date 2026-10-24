// The fly-overs: when the strange structure opens up a new challenge (oddments.ts), the camera
// leaves you, sweeps over the town to where it has appeared and circles it under a title card,
// then comes back; when the last socket is filled, a long, high circle over the whole map. The
// paths are worked out from the spot and the map's own size, so they work on any map. E, Space,
// Enter, a click or a tap skips it. While it plays, you stand still and the HUD is out of the way.
//
// Who decides what: nothing goes over the network. Each player's screen plays it when the host's
// word on the sockets (oddments.ts) says a milestone has just been reached, so everyone in the
// room sees it at once.
import * as THREE from "three";
import type { GameMap } from "./map";
import { keyLabel } from "./gamepad";
import * as SFX from "./audio";
import { view } from "./view";

export interface Shot {
  /** "spot": the sweep to a new challenge's place; "map": the finale's circle over the whole map. */
  kind: "spot" | "map";
  x: number; z: number;
  kicker: string; title: string; sub?: string;
}

const SPOT_SECS = 8, MAP_SECS = 17, BLEND = 1.4;
const ease = (t: number) => t * t * (3 - 2 * t);

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
    if (this.el) this.el.classList.toggle("shown", this.t > 1.2 && this.t < T - 1);
    return true;
  }

  private card(s: Shot) {
    this.el?.remove();
    const hud = document.getElementById("hud");
    if (!hud) return;
    const el = document.createElement("div");
    el.id = "reveal";
    const skip = this.touch() ? "Tap to skip" : `${keyLabel("KeyE")} to skip`;
    el.innerHTML = `<div class="rvcard"><small></small><h2></h2><p></p></div><button type="button" class="rvskip"></button>`;
    el.querySelector("small")!.textContent = s.kicker;
    el.querySelector("h2")!.textContent = s.title;
    el.querySelector("p")!.textContent = s.sub ?? "";
    el.querySelector("button")!.textContent = skip;
    el.addEventListener("pointerdown", (e) => { e.preventDefault(); this.skip(); });
    hud.appendChild(el);
    hud.classList.add("reveal");
    document.body.classList.add("reveal");
    this.el = el;
  }

  private end() {
    this.shot = null;
    this.el?.remove(); this.el = null;
    document.getElementById("hud")?.classList.remove("reveal");
    document.body.classList.remove("reveal");
  }

  dispose() { this.end(); }
}
