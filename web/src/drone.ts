// The drone: /drone on the chat phone (dev.ts) lifts you off your feet and flies you about Bath as a
// camera drone, quickly and through anything, to look over the map from the air. /drone again lands
// you on whatever's below, a roof if you're over one.
//
// Flying: W A S D move you level the way you're facing, the mouse looks, Space climbs and Shift
// sinks, and the mouse wheel (or Q) picks one of five speeds, from a slow drift for lining up a shot
// to a fast cruise across town. On a touch screen the stick moves, Jump climbs, Crouch sinks
// (tap again to stop) and the Weapon button picks the speed. A game controller flies it the way
// real drones and drone games do ("Mode 2"): the left stick climbs, sinks and turns, the right stick
// moves you forward, back and sideways, the D-pad's up and down tilt the camera (as the dial on a
// DJI's controller does), and L1 and R1 pick the speed. The view leans a little into turns and
// slides, as an FPV drone's camera does, but never off what the crosshair's on.
//
// C (Circle on a controller, or a tap on the view's name at the top of a touch screen) goes round the
// drone's views of the scenery (looks.ts): normal, plain white clay, clay with outlines, wireframe,
// and "what's what", each kind of thing in its own colour with a key down the side.
//
// Snaps, for noting what's wrong with the map: the trigger (a click, Fire, R2) takes one. Each keeps
// a small picture of the view, crosshair and all, and where you were and what the crosshair was on,
// in memory until the page is closed. What you type on the phone while the drone's up is a note on
// your latest snap instead of a text to everyone. /drone copy puts the lot on the clipboard in one go:
// a few lines of text, one per snap, made for pasting to Claude Code (the view as ?at=, which
// `npm run shoot` takes, the point under the crosshair and the square it's in), and a contact sheet
// of all the pictures, numbered the same. A paste of text gets the text and a paste of a picture (Ctrl+V
// in Claude Code) gets the sheet. /drone pic 3 copies just snap 3's picture, bigger; /drone clear
// forgets them all.
//
// Who decides what: it's all yours. You fly by moving yourself, so your position goes out as ever and
// the squares of Bath load round you as you go; others see you floating. While the drone's up you're
// in god mode by your own word ("god", game.ts), so nobody's shots take it out of the sky. Snaps never
// leave your machine except by your own paste.
import * as THREE from "three";
import { chatLine } from "./chat";
import { control, ctl } from "./controls";
import { timeOfDay } from "./daylight";
import { B } from "./gamepad";
import * as SFX from "./audio";
import { BUILT } from "./version";
import { KINDS, type Kind } from "./kinds";
import { Looks } from "./looks";
import type { GameMap } from "./map";
import type { Player } from "./player";

const SPEEDS = [3, 8, 20, 45, 90];     // m/s, picked with the wheel; the middle one to start
const LIFT = 0.6;                      // climbing and sinking go this much of the speed (and at least 3 m/s)
const TURN = 2.2;                      // rad/s, a pad's left stick turning you
const TILT = 1.2;                      // rad/s, the D-pad tilting the camera
const EASE = 4;                        // how quickly the drone gets up to the speed asked for (per second)
const LOW = 0.5;                       // the camera stays this far above the ground
const HIGH = 900;                      // and no further than this above it
const ROLL = 0.18;                     // radians of lean at full slide or a brisk turn
const PIC_W = 960;                     // a snap's picture, at most this wide
const SHEET_W = 480;                   // each snap's width on the contact sheet
const RAY = 3000;                      // how far the crosshair's ray looks for something

const held = (keys: Set<string>, id: string, fallback: string) => (control(id)?.keys ?? [fallback]).some((c) => keys.has(c));

/** A snap: where the drone was, what the crosshair was on, and the picture. */
export interface Snap {
  n: number;
  time: string;           // the game's clock, hh:mm
  at: string;             // the camera, as ?at= takes it: east, north, bearing, tilt, height off the ground
  aim: string;            // the point under the crosshair: east, north, height off the ground there, then how far
  square: string;         // the square of Bath it's in, ti,tj ("" off the squares)
  hit: string;            // what the game's solid ray hit there: building, barrier, tree, ground, or sky
  look: string;           // the drone's view it was taken in, if not the normal one
  note: string;
  pic: Blob | null;       // JPEG, once the frame's been drawn
}

/** What the drone needs from the game (game.ts). */
export interface DroneHooks {
  map: GameMap;
  player: Player;
  camera: THREE.PerspectiveCamera;
  mapId: string;
  /** Can you take off just now (on your feet, alive, not in a vehicle or on a ride)? A reason if not. */
  why(): string | null;
  /** The drone went up or came down: let everyone know, and put you on your feet. */
  changed(on: boolean): void;
}

export class Drone {
  on = false;
  readonly snaps: Snap[] = [];
  /** The view the drone shows the scenery in (looks.ts). */
  readonly looks = new Looks();
  private gear = 2;
  private eye = new THREE.Vector3();
  private v = new THREE.Vector3();
  private roll = 0;
  private lastYaw = 0;
  private trig = false;
  private wanted: Snap | null = null;
  private pad = { lx: 0, ly: 0, rx: 0, ry: 0, at: 0 };
  private tilt = 0;                    // the D-pad: -1 down, 1 up
  private osd: HTMLDivElement | null = null;
  private osdT = 0;
  private count = 0;

  constructor(private h: DroneHooks) {}

  /** /drone, and what came after it. */
  command(rest: string) {
    const [word = "", arg = ""] = rest.trim().toLowerCase().split(/\s+/);
    if (!word || word === "on" || word === "off") {
      if (word === "on" && this.on || word === "off" && !this.on) return;
      this.toggle();
      return;
    }
    if (word === "copy") { this.copy(); return; }
    if (word === "pic" || word === "pics") { this.copyPic(Number(arg)); return; }
    if (word === "clear") { const n = this.snaps.length; this.snaps.length = 0; chatLine(n ? `Forgot ${n} snap${n === 1 ? "" : "s"}` : "No snaps to forget"); this.drawOsd(); return; }
    chatLine("/drone to fly or land, /drone copy, /drone pic 3, /drone clear");
  }

  private toggle() {
    if (this.on) { this.land(); return; }
    const why = this.h.why();
    if (why) { chatLine(why); return; }
    const p = this.h.player;
    this.on = true;
    this.eye.set(p.pos.x, p.pos.y + p.eyeHeight + 2, p.pos.z);
    this.v.set(0, 0, 0);
    this.roll = 0;
    this.lastYaw = p.yaw;
    this.trig = true;   // the press that's down now doesn't snap
    this.h.changed(true);
    this.showOsd(true);
    chatLine(`Drone up. ${this.snaps.length ? `${this.snaps.length} snaps so far. ` : ""}Shoot to snap; type here to note the last snap; /drone copy when you're done; /drone to land`);
  }

  /** Down on whatever's below: the ground, or a roof. */
  land() {
    if (!this.on) return;
    this.on = false;
    const p = this.h.player, m = this.h.map;
    const x = this.eye.x, z = this.eye.z;
    const y = m.floor(x, z, this.eye.y);
    p.pos.set(x, Math.max(y, m.ground(x, z)), z);
    p.vel.set(0, 0, 0);
    p.crouchLatch = false;
    this.h.changed(false);
    this.showOsd(false);
    chatLine(this.snaps.length ? `Landed. ${this.snaps.length} snap${this.snaps.length === 1 ? "" : "s"} kept: /drone copy` : "Landed");
  }

  /** The wheel, Q, L1 and R1, the touch Weapon button: a speed up or down (round from the top on a touch screen). */
  gearStep(by: number, wrap = false) {
    const n = this.gear + by;
    this.gear = wrap ? (n + SPEEDS.length) % SPEEDS.length : Math.max(0, Math.min(SPEEDS.length - 1, n));
    this.drawOsd();
  }

  /** A game controller's sticks while the drone's up (gamepad.ts): Mode 2. */
  sticks(lx: number, ly: number, rx: number, ry: number) { this.pad = { lx, ly, rx, ry, at: performance.now() }; }

  /** A game controller's buttons while the drone's up: true if the drone took it. */
  padButton(b: number, down: boolean): boolean {
    if (b === B.up || b === B.down) { this.tilt = down ? (b === B.up ? 1 : -1) : 0; return true; }
    if (b === B.l1 || b === B.r1) { if (down) this.gearStep(b === B.r1 ? 1 : -1); return true; }
    return false;
  }

  /** Once a frame while the drone's up, in place of walking. */
  fly(dt: number, active: boolean) {
    const p = this.h.player, k = p.keys, m = this.h.map;
    let fx = 0, fz = 0, up = 0;
    const padOn = performance.now() - this.pad.at < 200;
    if (active) {
      if (held(k, "forward", "KeyW")) fz -= 1;
      if (held(k, "back", "KeyS")) fz += 1;
      if (held(k, "strafeleft", "KeyA")) fx -= 1;
      if (held(k, "straferight", "KeyD")) fx += 1;
      if (!fx && !fz && !padOn) { fx = p.joy.x; fz = p.joy.y; }
      if (k.has("Space") || p.jumpHeld) up += 1;
      if (k.has("ShiftLeft") || k.has("ShiftRight") || p.crouchLatch) up -= 1;
      if (padOn) {
        fx += this.pad.rx; fz += this.pad.ry;
        up -= this.pad.ly;
        p.yaw -= this.pad.lx * TURN * dt;
        p.pitch = Math.max(-1.5, Math.min(1.5, p.pitch + this.tilt * TILT * dt));
      }
    }
    const len = Math.hypot(fx, fz);
    if (len > 1) { fx /= len; fz /= len; }
    up = Math.max(-1, Math.min(1, up));
    const s = SPEEDS[this.gear], sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
    const want = new THREE.Vector3((fx * cy + fz * sy) * s, up * Math.max(3, s * LIFT), (-fx * sy + fz * cy) * s);
    this.v.lerp(want, 1 - Math.exp(-EASE * dt));
    this.eye.addScaledVector(this.v, dt);
    const g = m.ground(this.eye.x, this.eye.z);
    if (this.eye.y < g + LOW) { this.eye.y = g + LOW; this.v.y = Math.max(0, this.v.y); }
    if (this.eye.y > g + HIGH) { this.eye.y = g + HIGH; this.v.y = Math.min(0, this.v.y); }
    // lean into a slide to the side and into a turn, as an FPV camera does (a roll leaves the crosshair where it is)
    const side = this.v.x * cy - this.v.z * sy;
    const turn = dt > 0 ? Math.atan2(Math.sin(p.yaw - this.lastYaw), Math.cos(p.yaw - this.lastYaw)) / dt : 0;
    this.lastYaw = p.yaw;
    const lean = Math.max(-1, Math.min(1, -side / 40 + turn * 0.12)) * ROLL;
    this.roll += (lean - this.roll) * (1 - Math.exp(-6 * dt));
    // you go where the drone goes, so the squares load round you and the others see where you are
    p.pos.set(this.eye.x, this.eye.y - p.eyeHeight, this.eye.z);
    p.vel.set(0, 0, 0);
    const cam = this.h.camera;
    cam.position.copy(this.eye);
    cam.rotation.set(p.pitch, p.yaw, this.roll, "YXZ");
    if ((this.osdT -= dt) <= 0) { this.osdT = 0.1; this.drawOsd(); }
  }

  /** C: on to the next view of the scenery. */
  nextLook() {
    this.looks.next();
    this.drawOsd(true);
  }

  /** The trigger, once a frame while the drone's up: a press takes a snap. */
  trigger(down: boolean) {
    if (down && !this.trig) this.snap();
    this.trig = down;
  }

  /** Take a snap: what's where now, and the picture once this frame's drawn (framed). */
  private snap() {
    if (this.wanted) return;
    const cam = this.h.camera, m = this.h.map, p = this.h.player;
    const e = this.eye, deg = (r: number) => Math.round(r * 180 / Math.PI);
    const bearing = ((deg(-p.yaw) % 360) + 360) % 360;
    const at = `${e.x.toFixed(1)},${(-e.z).toFixed(1)},${bearing},${deg(p.pitch)},${(e.y - m.ground(e.x, e.z)).toFixed(1)}`;
    const d = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const hit = m.raycast(e.x, e.y, e.z, d.x, d.y, d.z, RAY);
    let aim = "", square = "", what = "sky";
    const sq = (x: number, z: number) => {
      const I = m.tileIndex;
      if (!I) return "";
      const S = I.cells * I.dx;
      return `${Math.floor((x - I.x0) / S)},${Math.floor((-z - I.y0) / S)}`;
    };
    if (hit) {
      const hx = e.x + d.x * hit.dist, hy = e.y + d.y * hit.dist, hz = e.z + d.z * hit.dist;
      aim = `${hx.toFixed(1)},${(-hz).toFixed(1)},${(hy - m.ground(hx, hz)).toFixed(1)} (${Math.round(hit.dist)} m)`;
      square = sq(hx, hz);
      what = hit.mover ? "vehicle" : hit.kind;
    } else square = sq(e.x, e.z);
    const t = timeOfDay() * 24, hh = Math.floor(t), mm = Math.floor((t - hh) * 60);
    const look = this.looks.id === "normal" ? "" : this.looks.name;
    const s: Snap = { n: ++this.count, time: `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`, at, aim, square, hit: what, look, note: "", pic: null };
    this.snaps.push(s);
    this.wanted = s;
    SFX.tick();
    this.osd?.classList.remove("flash");
    void this.osd?.offsetWidth;
    this.osd?.classList.add("flash");
    chatLine(`Snap ${s.n}${what === "sky" ? "" : `: ${what}, ${Math.round(hit!.dist)} m`}. Type here to add a note`);
    this.drawOsd();
  }

  /** main.ts, straight after drawing each frame: the picture for a snap that's waiting for one. */
  framed(canvas: HTMLCanvasElement) {
    const s = this.wanted;
    if (!s) return;
    this.wanted = null;
    const k = Math.min(1, PIC_W / canvas.width), w = Math.round(canvas.width * k), h = Math.round(canvas.height * k);
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = c.getContext("2d")!;
    // drawn in the same moment as the frame, before the browser clears it
    g.drawImage(canvas, 0, 0, w, h);
    crosshair(g, w / 2, h / 2, Math.max(6, h / 40));
    label(g, `${s.n}`, 6, 6, Math.max(14, h / 22));
    c.toBlob((b) => { s.pic = b; }, "image/jpeg", 0.85);
  }

  /** What you type on the phone while the drone's up: a note on the latest snap. False if there's none. */
  note(text: string): boolean {
    const s = this.snaps[this.snaps.length - 1];
    if (!s) return false;
    s.note = s.note ? `${s.note}; ${text}` : text;
    chatLine(`Note on snap ${s.n}: ${s.note}`);
    return true;
  }

  /** The snaps as text, for pasting to Claude Code. */
  text(): string {
    const url = location.origin + location.pathname;
    const lines = [
      `Drone snaps from Combe Downer: ${this.snaps.length} on map ${this.h.mapId}, build ${BUILT}, ${url}`,
      "at= is the camera as ?at= takes it (east, north, bearing, tilt, height off the ground: npm run shoot takes it too); aim= is the point under the crosshair (east, north, height off the ground there) and how far off; square is ti,tj; hit is what the game's solid ray met. The pictures (pasted separately, if they came) are numbered the same, the crosshair marking the spot.",
    ];
    for (const s of this.snaps) lines.push(`#${s.n} ${s.time} at=${s.at}${s.aim ? `  aim=${s.aim}` : ""}${s.square ? `  square ${s.square}` : ""}  hit ${s.hit}${s.look ? `  view ${s.look}` : ""}${s.note ? `  "${s.note}"` : ""}`);
    return lines.join("\n");
  }

  /** /drone copy: the text and the contact sheet on the clipboard together. */
  private async copy() {
    if (!this.snaps.length) { chatLine("No snaps yet: fly with /drone and shoot to take one"); return; }
    const text = this.text(), n = this.snaps.length;
    try {
      await navigator.clipboard.write([new ClipboardItem({
        "text/plain": new Blob([text], { type: "text/plain" }),
        "image/png": this.sheet(),
      })]);
      chatLine(`Copied ${n} snap${n === 1 ? "" : "s"}: paste for the text, Ctrl+V in Claude Code for the pictures`);
    } catch {
      try { await navigator.clipboard.writeText(text); chatLine(`Copied the text of ${n} snap${n === 1 ? "" : "s"} (the pictures wouldn't go: /drone pic 1)`); }
      catch { chatLine("Couldn't copy: the browser said no"); }
    }
  }

  /** /drone pic 3: one snap's picture on the clipboard, at full size (the latest if no number). */
  private async copyPic(n: number) {
    const s = n ? this.snaps.find((x) => x.n === n) : this.snaps[this.snaps.length - 1];
    if (!s) { chatLine(n ? `No snap ${n}` : "No snaps yet"); return; }
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": this.png([s], 1, PIC_W) })]);
      chatLine(`Copied snap ${s.n}'s picture`);
    } catch { chatLine("Couldn't copy the picture: the browser said no"); }
  }

  /** All the snaps' pictures on one sheet, as near square as they'll go, each numbered. */
  private sheet(): Promise<Blob> {
    return this.png(this.snaps, Math.ceil(Math.sqrt(this.snaps.length)), SHEET_W);
  }

  private async png(snaps: Snap[], cols: number, tw: number): Promise<Blob> {
    const pics = await Promise.all(snaps.map(async (s) => (s.pic ? createImageBitmap(s.pic) : null)));
    const first = pics.find(Boolean);
    const th = Math.round(tw * (first ? first.height / first.width : 9 / 16));
    const rows = Math.ceil(snaps.length / cols), gap = 4;
    const c = document.createElement("canvas");
    c.width = cols * tw + (cols + 1) * gap; c.height = rows * th + (rows + 1) * gap;
    const g = c.getContext("2d")!;
    g.fillStyle = "#111"; g.fillRect(0, 0, c.width, c.height);
    snaps.forEach((s, i) => {
      const x = gap + (i % cols) * (tw + gap), y = gap + Math.floor(i / cols) * (th + gap), pic = pics[i];
      if (pic) g.drawImage(pic, x, y, tw, th);
      label(g, s.note ? `${s.n} ${s.note}` : `${s.n}`, x + 4, y + 4, Math.max(14, th / 14), tw - 8);
    });
    for (const p of pics) p?.close();
    return new Promise((done, fail) => c.toBlob((b) => (b ? done(b) : fail(new Error("no picture"))), "image/png"));
  }

  // ---- the drone's screen: height, speed, and how many snaps ----

  private showOsd(on: boolean) {
    if (on && !this.osd) {
      this.osd = document.createElement("div");
      this.osd.id = "droneosd";
      document.body.append(this.osd);
      // on a touch screen, a tap on the view's name changes it
      this.osd.addEventListener("pointerdown", (e) => { if ((e.target as HTMLElement).closest(".look")) { e.preventDefault(); this.nextLook(); } });
    }
    if (this.osd) this.osd.hidden = !on;
    document.body.classList.toggle("droning", on);
    this.drawOsd();
  }

  private shownLook = "";

  private drawOsd(lookChanged = false) {
    const o = this.osd;
    if (!o || !this.on) return;
    const m = this.h.map, e = this.eye;
    const alt = Math.round(e.y - m.ground(e.x, e.z)), kmh = Math.round(this.v.length() * 3.6);
    const bar = `<div class="bar"><span class="rec">● REC</span><span>ALT ${alt} m</span><span>${kmh} km/h</span><span>SPD ${this.gear + 1}/5</span><span>SNAPS ${this.snaps.length}</span><span class="look">${this.looks.name} (${ctl("droneview")})</span></div>`;
    if (lookChanged || this.shownLook !== this.looks.id) {
      this.shownLook = this.looks.id;
      o.innerHTML = bar + (this.looks.id === "kinds" ? `<ul class="key">${(Object.keys(KINDS) as Kind[]).filter((k) => k !== "sky" && k !== "field")
        .map((k) => `<li><i style="background:${KINDS[k].col}"></i>${KINDS[k].name}</li>`).join("")}</ul>` : "");
    } else o.querySelector(".bar")!.outerHTML = bar;
  }

  /** The page is going (a new game, the train): put the screen away. */
  dispose() { this.on = false; this.osd?.remove(); this.osd = null; document.body.classList.remove("droning"); }
}

/** A crosshair at the middle of a snap, white with a dark edge, so it shows on sky and on stone. */
function crosshair(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  for (const [col, w] of [["rgba(0,0,0,0.8)", 4], ["#fff", 2]] as const) {
    g.strokeStyle = col; g.lineWidth = w;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
    g.moveTo(x - r * 2, y); g.lineTo(x - r * 0.5, y); g.moveTo(x + r * 0.5, y); g.lineTo(x + r * 2, y);
    g.moveTo(x, y - r * 2); g.lineTo(x, y - r * 0.5); g.moveTo(x, y + r * 0.5); g.lineTo(x, y + r * 2);
    g.stroke();
  }
}

/** A snap's number (and note) in its top left corner, on a dark band. */
function label(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, maxW = 400) {
  g.font = `bold ${Math.round(size)}px monospace`;
  g.textBaseline = "top";
  let t = text;
  while (t.length > 1 && g.measureText(t).width > maxW) t = t.slice(0, -2) + "…";
  const w = g.measureText(t).width;
  g.fillStyle = "rgba(0,0,0,0.65)"; g.fillRect(x - 3, y - 2, w + 6, size + 4);
  g.fillStyle = "#ffd23a"; g.fillText(t, x, y);
}
