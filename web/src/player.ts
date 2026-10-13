// First-person movement: mouse look, WASD, sprint, jump, climbing walls, crouch, lying on your
// front (Z, the streets only), gravity and collision. And riding (rides.ts): on a bike, a board,
// blades and the rest you roll along the way you're heading rather than walking, steering towards
// where you look (or with A and D), speeding up downhill and bogging down on grass.
import * as THREE from "three";
import type { RideSpec } from "./rides";

/** What the player walks on and bumps into: a map of Bath (map.ts) or a mine level (mines/level.ts). */
export interface Ground {
  ground(x: number, z: number): number;
  /** What feet at height y stand on at (x, z), where that isn't always the ground (a tunnel's floor). */
  floor?(x: number, z: number, y: number): number;
  collide(pos: { x: number; z: number }, y: number, r: number): unknown;
  /** Height above the feet of the tallest thing the last collide() pushed against (-1 if none). */
  readonly lastBlock: number;
  /** What there is to stand on for feet at y, if not just the ground (car roofs). */
  floor?(x: number, z: number, y: number): number;
}

export const EYE = 1.65;
export const CROUCH_EYE = 1.1;
/** Eye height lying on your front, propped up on your elbows. */
export const PRONE_EYE = 0.5;
const RADIUS = 0.35;
const GRAVITY = 22;
const JUMP = 7.2;
const MANTLE = 2.6;       // a wall or a low roof up to this far above your feet can be climbed
const WALK = 4.6, SPRINT = 7.4, CROUCH = 2.2, CRAWL = 0.9;

export class Player {
  pos = new THREE.Vector3();      // feet
  vel = new THREE.Vector3();
  yaw = 0; pitch = 0;
  onGround = false;
  crouch = 0;                     // 0 standing .. 1 crouched, eased
  sensitivity = 0.0022;
  /** Multiplies walking speed (the mines' boots, or crawling when you're down). */
  speedMul = 1;
  /** How well your feet hold: 1 normally, much less on ice (the mines). */
  grip = 1;
  keys = new Set<string>();
  /** On-screen joystick, -1..1 each way (y down = backwards). */
  joy = { x: 0, y: 0 };
  /** Crouch toggled by the on-screen button. */
  crouchLatch = false;
  /** Lying on your front (Z, or the crouch button again): 0 up .. 1 flat out, eased. */
  prone = 0;
  proneLatch = false;
  /** Whether Z lies you down here (the streets, where other players see it). */
  canProne = false;
  bob = 0;
  landKick = 0;
  speed = 0;
  /** Set for a frame when you leave the ground on purpose (a jump or a vault). */
  jumped = false;
  /** Set for a frame when you land: how fast you were falling, in m/s. */
  landed = 0;
  /** What you're riding (rides.ts), if anything, which way it's pointing and how fast it's going (m/s, - backwards). */
  ride: RideSpec | null = null;
  heading = 0;
  rideV = 0;
  /** Set for a frame when you hit something too hard on a ride: how fast you were going. */
  crashed = 0;
  /** Whether the ground at (x, z) is hard (road, pavement) rather than grass, for riding. */
  paved: (x: number, z: number) => boolean = () => true;
  private wobble = 0;
  private wantJump = false;

  constructor(private map: Ground) {
    addEventListener("keydown", (e) => {
      this.keys.add(e.code);
      if (e.code === "Space") this.wantJump = true;
      if (e.code === "KeyZ" && !e.repeat && this.canProne) this.proneLatch = !this.proneLatch;
    });
    addEventListener("keyup", (e) => this.keys.delete(e.code));
    addEventListener("blur", () => this.keys.clear());
  }

  look(dx: number, dy: number, zoom: number) {
    const s = this.sensitivity * zoom;
    this.yaw -= dx * s;
    this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch - dy * s));
  }

  get eyeHeight() { return EYE + (CROUCH_EYE - EYE) * this.crouch + (PRONE_EYE - EYE) * this.prone + (this.ride?.lift ?? 0); }
  get sprinting() {
    if (this.ride) return false;
    const stick = this.joy.y < -0.95;   // joystick pushed all the way forward
    return (stick || (this.keys.has("ShiftLeft") && this.keys.has("KeyW"))) && this.crouch < 0.5 && this.prone < 0.5 && this.onGround;
  }

  jump() { this.wantJump = true; }

  /** The ground under the feet, or a tunnel's floor when they're in one. */
  private under(x: number, z: number) { return this.map.floor ? this.map.floor(x, z, this.pos.y) : this.map.ground(x, z); }

  spawn(x: number, z: number, yaw = Math.random() * Math.PI * 2) {
    this.pos.set(x, this.map.ground(x, z), z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw; this.pitch = 0;
    this.proneLatch = false; this.prone = 0;
  }

  update(dt: number, active: boolean) {
    const k = this.keys;
    this.jumped = false;
    this.landed = 0;
    this.crashed = 0;
    if (this.ride) { this.rideUpdate(dt, active); return; }
    let fx = 0, fz = 0;
    if (active) {
      if (k.has("KeyW") || k.has("ArrowUp")) fz -= 1;
      if (k.has("KeyS") || k.has("ArrowDown")) fz += 1;
      if (k.has("KeyA") || k.has("ArrowLeft")) fx -= 1;
      if (k.has("KeyD") || k.has("ArrowRight")) fx += 1;
      if (!fx && !fz && Math.hypot(this.joy.x, this.joy.y) > 0.15) { fx = this.joy.x; fz = this.joy.y; }
    }
    if (!this.canProne) this.proneLatch = false;
    // jumping gets you up off your front
    if (this.proneLatch && this.wantJump) { this.proneLatch = false; this.wantJump = false; }
    const lying = active && this.proneLatch && this.onGround;
    const crouching = !lying && active && (k.has("KeyC") || this.crouchLatch);   // not Ctrl: Ctrl+W would close the tab
    this.crouch += ((crouching ? 1 : 0) - this.crouch) * Math.min(1, dt * 12);
    this.prone += ((lying ? 1 : 0) - this.prone) * Math.min(1, dt * 5);
    const len = Math.hypot(fx, fz);
    const speed = (lying ? CRAWL : crouching ? CROUCH : this.sprinting ? SPRINT : WALK) * Math.min(1, len) * this.speedMul;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    let wx = 0, wz = 0;
    if (len > 0) {
      fx /= len; fz /= len;   // speed already carries how far the joystick is pushed
      wx = (fx * cos + fz * sin) * speed;
      wz = (-fx * sin + fz * cos) * speed;
    }
    // steep ground slows you down when climbing
    if (len > 0) {
      const ahead = this.under(this.pos.x + wx * 0.15, this.pos.z + wz * 0.15) - this.under(this.pos.x, this.pos.z);
      const grade = ahead / (speed * 0.15);
      if (grade > 0.35) { const f = Math.max(0.35, 1 - (grade - 0.35) * 1.2); wx *= f; wz *= f; }
    }
    const accel = this.onGround ? 14 * this.grip : 2.5;
    this.vel.x += (wx - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (wz - this.vel.z) * Math.min(1, accel * dt);

    const jumpAsked = this.wantJump;
    if (this.wantJump && this.onGround && active && this.crouch < 0.5 && this.prone < 0.5) {
      this.vel.y = JUMP;
      this.onGround = false;
      this.jumped = true;
    }
    this.wantJump = false;
    this.vel.y -= GRAVITY * dt;

    const p = { x: this.pos.x + this.vel.x * dt, z: this.pos.z + this.vel.z * dt };
    this.map.collide(p, this.pos.y, RADIUS);
    // Auto-vault: walking into a wall, fence or hedge you could jump hops you over it.
    const blocked = this.map.lastBlock;
    if (blocked > 0 && blocked < 1.45 && this.onGround && len > 0 && active && this.crouch < 0.5 && this.prone < 0.1) {
      this.vel.y = Math.max(this.vel.y, 5.2 + blocked * 1.6);
      this.onGround = false;
      this.jumped = true;
    } else if (blocked >= 1.45 && len > 0 && active && this.crouch < 0.5 && this.prone < 0.1
      && ((jumpAsked && blocked <= MANTLE) || (!this.onGround && this.vel.y > -3 && blocked <= 1.7))) {
      // Climbing: jump at a wall too high to vault (or one you've jumped up to) and you pull
      // yourself up onto its top, then carry on over it.
      this.vel.y = Math.max(this.vel.y, Math.sqrt(2 * GRAVITY * (blocked + 0.3)));
      this.onGround = false;
      this.jumped = true;
    }
    // if collision stopped us, drop the velocity into the wall
    this.vel.x = (p.x - this.pos.x) / dt * 0.9 + this.vel.x * 0.1;
    this.vel.z = (p.z - this.pos.z) / dt * 0.9 + this.vel.z * 0.1;
    this.pos.x = p.x; this.pos.z = p.z;

    this.pos.y += this.vel.y * dt;
    const g = this.under(this.pos.x, this.pos.z);
    if (this.pos.y <= g) {
      if (!this.onGround && this.vel.y < -6) this.landKick = Math.min(0.25, -this.vel.y * 0.02);
      if (!this.onGround && this.vel.y < -3) this.landed = -this.vel.y;
      this.pos.y = g;
      this.vel.y = 0;
      this.onGround = true;
    } else if (this.onGround && this.pos.y - g < 0.6 && this.vel.y <= 0) {
      this.pos.y = g;   // stick to the ground going downhill
      this.vel.y = 0;
    } else {
      this.onGround = false;
    }
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround) this.bob += this.speed * dt * 1.9;
    this.landKick *= Math.max(0, 1 - dt * 8);
  }

  /** Get on (or off, with null) a ride, pointing the way you face, at a standstill. */
  mount(spec: RideSpec | null) {
    this.ride = spec;
    this.heading = this.yaw;
    this.rideV = 0;
    this.proneLatch = false; this.crouchLatch = false;
  }

  /** Riding: you roll the way the ride's heading, steered towards where you look. */
  private rideUpdate(dt: number, active: boolean) {
    const s = this.ride!, k = this.keys;
    this.crouch += (0 - this.crouch) * Math.min(1, dt * 12);
    this.prone += (0 - this.prone) * Math.min(1, dt * 8);
    this.proneLatch = false;
    let fwd = 0, side = 0;
    if (active) {
      if (k.has("KeyW") || k.has("ArrowUp")) fwd += 1;
      if (k.has("KeyS") || k.has("ArrowDown")) fwd -= 1;
      if (k.has("KeyA") || k.has("ArrowLeft")) side -= 1;
      if (k.has("KeyD") || k.has("ArrowRight")) side += 1;
      if (!fwd && !side && Math.hypot(this.joy.x, this.joy.y) > 0.15) { fwd = -this.joy.y; side = this.joy.x; }
    }
    const jumpAsked = this.wantJump && active;
    this.wantJump = false;
    const sx = this.pos.x, sz = this.pos.z;
    if (s.pogo) {
      // a pogo stick: you go where you press, like walking, but always bouncing
      this.heading = this.yaw;
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw), len = Math.hypot(fwd, side) || 1;
      const wx = ((side * cos - fwd * sin) / len) * s.top, wz = ((-side * sin - fwd * cos) / len) * s.top;
      this.vel.x += (wx - this.vel.x) * Math.min(1, dt * 5);
      this.vel.z += (wz - this.vel.z) * Math.min(1, dt * 5);
      if (this.onGround) {
        // hold Space (or the jump button) for a big one
        this.vel.y = active && (k.has("Space") || jumpAsked) ? s.jump : 6;
        this.onGround = false;
        this.jumped = true;
      }
      this.rideV = Math.hypot(this.vel.x, this.vel.z);
      const p = { x: this.pos.x + this.vel.x * dt, z: this.pos.z + this.vel.z * dt };
      this.map.collide(p, this.pos.y, RADIUS);
      this.vel.x = (p.x - this.pos.x) / dt * 0.9 + this.vel.x * 0.1;
      this.vel.z = (p.z - this.pos.z) / dt * 0.9 + this.vel.z * 0.1;
      this.pos.x = p.x; this.pos.z = p.z;
    } else {
      // steering: A and D turn you (and the view); otherwise it comes round to where you look
      const turn = s.turn * Math.min(1, 0.35 + Math.abs(this.rideV) / 4);
      if (side) this.yaw -= side * turn * dt;
      const diff = Math.atan2(Math.sin(this.yaw - this.heading), Math.cos(this.yaw - this.heading));
      this.heading += Math.max(-turn * dt, Math.min(turn * dt, diff));
      // a trolley's wonky wheel
      if (s.wobble) {
        this.wobble = this.wobble * Math.max(0, 1 - dt * 0.6) + (Math.random() - 0.5) * dt * 6;
        this.heading += this.wobble * s.wobble * dt * Math.min(1, Math.abs(this.rideV) / 4);
      }
      const hx = -Math.sin(this.heading), hz = -Math.cos(this.heading);
      let v = this.rideV;
      if (this.onGround) {
        const hard = this.paved(this.pos.x, this.pos.z), top = hard ? s.top : s.rough;
        if (fwd > 0 && v < top) v = Math.min(top, v + s.accel * fwd * dt);
        else if (fwd < 0) v = v > 0 ? Math.max(0, v - s.brake * -fwd * dt) : Math.max(-s.back, v - s.accel * dt);
        v -= v * s.coast * dt;
        // faster than you can push it on the flat (off a hill): it eases back, and soon stops on grass
        if (Math.abs(v) > top) v -= (v - Math.sign(v) * top) * (hard ? 0.15 : 1.6) * dt;
        // downhill it runs away with you; uphill it slows
        const ahead = this.under(this.pos.x + hx * 0.6, this.pos.z + hz * 0.6) - this.under(this.pos.x - hx * 0.6, this.pos.z - hz * 0.6);
        const grade = Math.max(-0.6, Math.min(0.6, ahead / 1.2));
        v -= 9.8 * grade * s.downhill * dt;
        v = Math.max(-Math.max(s.back, 2), Math.min(s.maxDown, v));
        if (Math.abs(v) < 0.05 && !fwd) v = 0;
        this.vel.x = hx * v; this.vel.z = hz * v;
        if (jumpAsked && s.jump) { this.vel.y = s.jump; this.onGround = false; this.jumped = true; }
      }
      const p = { x: this.pos.x + this.vel.x * dt, z: this.pos.z + this.vel.z * dt };
      this.map.collide(p, this.pos.y, RADIUS);
      // how much of the way we meant to go we got (1: nothing in the way)
      const blocked = this.map.lastBlock, sp = Math.hypot(this.vel.x, this.vel.z), want = sp * dt;
      const progress = want > 1e-4 ? Math.max(0, Math.min(1, ((p.x - this.pos.x) * this.vel.x + (p.z - this.pos.z) * this.vel.z) / sp / want)) : 1;
      if (blocked > 0 && blocked <= s.hop + 0.05 && this.onGround && Math.abs(v) > 1.5) {
        // a kerb or a low wall: up and over it
        this.vel.y = Math.max(this.vel.y, Math.sqrt(2 * GRAVITY * (blocked + 0.15)));
        this.onGround = false;
        this.jumped = true;
      } else if (Math.abs(v) > 2.5 && progress < 0.5) {
        if (Math.abs(v) >= s.crash) this.crashed = Math.abs(v);
        v = this.crashed ? 0 : v * Math.max(0.1, progress);
      }
      this.rideV = v;
      if (!this.onGround) { this.vel.x = (p.x - this.pos.x) / dt; this.vel.z = (p.z - this.pos.z) / dt; }
      this.pos.x = p.x; this.pos.z = p.z;
    }
    // up and down, as on foot
    this.vel.y -= GRAVITY * dt;
    this.pos.y += this.vel.y * dt;
    const g = this.under(this.pos.x, this.pos.z);
    if (this.pos.y <= g) {
      if (!this.onGround && this.vel.y < -6) this.landKick = Math.min(0.25, -this.vel.y * 0.02);
      if (!this.onGround && this.vel.y < -3) this.landed = -this.vel.y;
      this.pos.y = g; this.vel.y = 0; this.onGround = true;
    } else if (this.onGround && this.pos.y - g < 0.6 && this.vel.y <= 0) {
      this.pos.y = g; this.vel.y = 0;
    } else this.onGround = false;
    this.speed = Math.hypot(this.pos.x - sx, this.pos.z - sz) / Math.max(dt, 1e-4);
    if (s.pogo && this.onGround) this.bob += this.speed * dt * 1.9;
    this.landKick *= Math.max(0, 1 - dt * 8);
  }

  applyToCamera(cam: THREE.PerspectiveCamera) {
    const bobY = Math.sin(this.bob * 2) * 0.035 * Math.min(1, this.speed / 5);
    cam.position.set(this.pos.x, this.pos.y + this.eyeHeight + bobY - this.landKick, this.pos.z);
    cam.rotation.set(this.pitch, this.yaw, 0, "YXZ");
  }
}
