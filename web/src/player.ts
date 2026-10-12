// First-person movement: mouse look, WASD, sprint, jump, crouch, gravity and collision.
import * as THREE from "three";

/** What the player walks on and bumps into: a map of Bath (map.ts) or a mine level (mines/level.ts). */
export interface Ground {
  ground(x: number, z: number): number;
  /** What feet at height y stand on at (x, z), where that isn't always the ground (a tunnel's floor). */
  floor?(x: number, z: number, y: number): number;
  collide(pos: { x: number; z: number }, y: number, r: number): unknown;
  /** Height above the feet of the tallest thing the last collide() pushed against (-1 if none). */
  readonly lastBlock: number;
}

export const EYE = 1.65;
export const CROUCH_EYE = 1.1;
const RADIUS = 0.35;
const GRAVITY = 22;
const JUMP = 7.2;
const WALK = 4.6, SPRINT = 7.4, CROUCH = 2.2;

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
  bob = 0;
  landKick = 0;
  speed = 0;
  /** Set for a frame when you leave the ground on purpose (a jump or a vault). */
  jumped = false;
  /** Set for a frame when you land: how fast you were falling, in m/s. */
  landed = 0;
  private wantJump = false;

  constructor(private map: Ground) {
    addEventListener("keydown", (e) => {
      this.keys.add(e.code);
      if (e.code === "Space") this.wantJump = true;
    });
    addEventListener("keyup", (e) => this.keys.delete(e.code));
    addEventListener("blur", () => this.keys.clear());
  }

  look(dx: number, dy: number, zoom: number) {
    const s = this.sensitivity * zoom;
    this.yaw -= dx * s;
    this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch - dy * s));
  }

  get eyeHeight() { return EYE + (CROUCH_EYE - EYE) * this.crouch; }
  get sprinting() {
    const stick = this.joy.y < -0.95;   // joystick pushed all the way forward
    return (stick || (this.keys.has("ShiftLeft") && this.keys.has("KeyW"))) && this.crouch < 0.5 && this.onGround;
  }

  jump() { this.wantJump = true; }

  /** The ground under the feet, or a tunnel's floor when they're in one. */
  private under(x: number, z: number) { return this.map.floor ? this.map.floor(x, z, this.pos.y) : this.map.ground(x, z); }

  spawn(x: number, z: number, yaw = Math.random() * Math.PI * 2) {
    this.pos.set(x, this.map.ground(x, z), z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw; this.pitch = 0;
  }

  update(dt: number, active: boolean) {
    const k = this.keys;
    this.jumped = false;
    this.landed = 0;
    let fx = 0, fz = 0;
    if (active) {
      if (k.has("KeyW") || k.has("ArrowUp")) fz -= 1;
      if (k.has("KeyS") || k.has("ArrowDown")) fz += 1;
      if (k.has("KeyA") || k.has("ArrowLeft")) fx -= 1;
      if (k.has("KeyD") || k.has("ArrowRight")) fx += 1;
      if (!fx && !fz && Math.hypot(this.joy.x, this.joy.y) > 0.15) { fx = this.joy.x; fz = this.joy.y; }
    }
    const crouching = active && (k.has("KeyC") || this.crouchLatch);   // not Ctrl: Ctrl+W would close the tab
    this.crouch += ((crouching ? 1 : 0) - this.crouch) * Math.min(1, dt * 12);
    const len = Math.hypot(fx, fz);
    const speed = (crouching ? CROUCH : this.sprinting ? SPRINT : WALK) * Math.min(1, len) * this.speedMul;
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

    if (this.wantJump && this.onGround && active && this.crouch < 0.5) {
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
    if (blocked > 0 && blocked < 1.45 && this.onGround && len > 0 && active && this.crouch < 0.5) {
      this.vel.y = Math.max(this.vel.y, 5.2 + blocked * 1.6);
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

  applyToCamera(cam: THREE.PerspectiveCamera) {
    const bobY = Math.sin(this.bob * 2) * 0.035 * Math.min(1, this.speed / 5);
    cam.position.set(this.pos.x, this.pos.y + this.eyeHeight + bobY - this.landKick, this.pos.z);
    cam.rotation.set(this.pitch, this.yaw, 0, "YXZ");
  }
}
