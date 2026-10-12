// Kicks at goal. Now and then, while you're on a rugby pitch, a ball turns up on a kicking tee
// somewhere in front of the posts. Walk up to it to line up a kick: A and D (or the stick) turn it,
// W and S set the power, Space or a click kicks it and E walks off. Put it between the uprights and
// over the bar, and a prize lands on the ground under the posts (see Pickups.bonus).
//
// Your ball is yours alone: nobody else sees it on its tee, but everyone sees it fly when you kick
// it. Whether it went over is the kicker's call (like hits, see game.ts); the host places the prize.
import * as THREE from "three";
import { GameMap, POST_GAP, POST_HEIGHT, rugbyLayout } from "./map";
import { Player } from "./player";

const G = 9.81;
const DRAG = 0.005;              // air drag, per m/s of speed
const BAR = 3;                   // crossbar height
const UPRIGHT = 0.08;            // upright radius
const HALF = 0.17, RAD = 0.11;   // the ball: half its length, and its radius
const TEE = 0.07;                // how tall the tee stands
const TILT = -0.3;               // a ball on a tee leans back a little
const REACH = 1.5;               // this close to the ball, you line up a kick
const LEAVE = 2.6;               // after walking off, this far away before it'll have you again
const ELEVATION = 0.6;           // kicks go up at about 35 degrees
const SPEED = [11, 30];          // m/s at no power and at full power
const TURN = 0.45, POWER = 0.7;  // how fast the kick turns (rad/s) and the power changes (per s)
const SETTLE = 0.3;              // seconds lined up before a click counts as a kick
const TEE_LIFE = 120;            // seconds a ball waits on its tee
const FADE = 3;                  // seconds a kicked ball lies about once it stops
const GHOSTS = 6;                // other players' kicks in the air at once
const rand = (a: number, b: number) => a + Math.random() * (b - a);

interface Frame { i: number; cx: number; cy: number; ux: number; uy: number; L: number; W: number; F: number }
interface Flight { obj: THREE.Object3D; tee?: THREE.Object3D; pos: THREE.Vector3; vel: THREE.Vector3; pitch: Frame | null; spin: number; yaw: number; rest: number; scored: boolean; mine: boolean }
interface Teed { obj: THREE.Object3D; tee: THREE.Object3D; x: number; y: number; z: number; age: number }
export interface KickInput { turn: number; power: number; kick: boolean; leave: boolean }
export type Thud = "kick" | "bounce" | "post";

export class Rugby {
  /** Lining up a kick: you stand still and WASD steers the kick instead. */
  lining = false;
  /** How hard you'll kick it, 0..1. */
  power = 0.5;
  /** You kicked a ball: tell everyone (scene position and velocity). */
  onKick?: (pos: THREE.Vector3, vel: THREE.Vector3) => void;
  /** Your kick went over: pitch index in map.d.pi, and which end (-1 or 1). */
  onOver?: (pitch: number, end: number) => void;
  onSound?: (what: Thud, x: number, y: number, z: number, vol: number) => void;
  onSay?: (text: string, secs: number) => void;

  private pitches: Frame[] = [];
  private ball: Teed | null = null;
  private flights: Flight[] = [];
  private aim = 0;
  private lineT = 0;
  private away = false;           // walked off: don't line up again until you've stepped back
  private wait = rand(4, 12);     // seconds on a pitch before the next ball turns up
  private group = new THREE.Group();
  private ballGeo: THREE.BufferGeometry;
  private ballMat: THREE.Material;
  private teeGeo = new THREE.CylinderGeometry(0.04, 0.09, TEE, 10).translate(0, TEE / 2, 0);
  private teeMat = new THREE.MeshLambertMaterial({ color: "#ff7a1a" });
  private arrow: THREE.Group;
  private shaft: THREE.Mesh;
  private head: THREE.Mesh;
  private arrowMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.8, depthWrite: false });

  constructor(private map: GameMap, scene: THREE.Scene) {
    (map.d.pi ?? []).forEach((p, i) => {
      if (p[0] !== "r") return;
      const { L, W, F } = rugbyLayout(p);
      this.pitches.push({ i, cx: p[1], cy: p[2], ux: Math.cos(p[5]), uy: Math.sin(p[5]), L, W, F });
    });
    scene.add(this.group);
    this.ballGeo = new THREE.SphereGeometry(1, 20, 14).scale(RAD, HALF, RAD);
    this.ballMat = new THREE.MeshLambertMaterial({ map: ballTexture() });
    // the aiming arrow on the grass: its shaft grows with the power
    this.shaft = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 1).rotateX(-Math.PI / 2).translate(0, 0, -0.5), this.arrowMat);
    const tri = new THREE.Shape([new THREE.Vector2(-0.3, 0), new THREE.Vector2(0.3, 0), new THREE.Vector2(0, 0.6)]);
    this.head = new THREE.Mesh(new THREE.ShapeGeometry(tri).rotateX(-Math.PI / 2), this.arrowMat);
    this.arrow = new THREE.Group();
    this.arrow.add(this.shaft, this.head);
    this.arrow.visible = false;
    this.arrow.renderOrder = 2;
    this.group.add(this.arrow);
  }

  // ---- pitch frames: s along the pitch from its middle, t across it --------------------------
  private toPitch(f: Frame, x: number, z: number): [number, number] {
    const dx = x - f.cx, dy = -z - f.cy;
    return [dx * f.ux + dy * f.uy, -dx * f.uy + dy * f.ux];
  }

  private fromPitch(f: Frame, s: number, t: number): [number, number] {
    return [f.cx + f.ux * s - f.uy * t, -(f.cy + f.uy * s + f.ux * t)];
  }

  /** The rugby pitch at scene (x, z), if any. */
  private pitchAt(x: number, z: number): Frame | null {
    for (const f of this.pitches) {
      const [s, t] = this.toPitch(f, x, z);
      if (Math.abs(s) < f.L / 2 + 2 && Math.abs(t) < f.W / 2 + 2) return f;
    }
    return null;
  }

  /** Under the middle of the posts at one end of a pitch (scene x, z), where the prize goes. */
  goalSpot(pitch: number, end: number): [number, number] | null {
    const f = this.pitches.find((p) => p.i === pitch);
    if (!f || (end !== 1 && end !== -1)) return null;
    return this.fromPitch(f, end * f.F, 0);
  }

  /** Where your ball is waiting, for the minimap. */
  get blip(): { x: number; z: number } | null {
    return this.ball && { x: this.ball.x, z: this.ball.z };
  }

  private makeBall(): THREE.Object3D {
    const m = new THREE.Mesh(this.ballGeo, this.ballMat);
    m.castShadow = true;
    this.group.add(m);
    return m;
  }

  // ---- your ball ------------------------------------------------------------------------------
  private spawn(f: Frame, p: THREE.Vector3): boolean {
    const [ps] = this.toPitch(f, p.x, p.z);
    const end = ps > 0.5 ? 1 : ps < -0.5 ? -1 : Math.random() < 0.5 ? 1 : -1;   // the posts you're nearer
    for (let k = 0; k < 10; k++) {
      const d = Math.max(6, f.F * rand(0.2, 0.65)), t = rand(-1, 1) * Math.max(0, f.W / 2 - 5) * 0.85;
      const [x, z] = this.fromPitch(f, end * (f.F - d), t);
      if (this.map.blocked(x, z, 0.5) || Math.hypot(x - p.x, z - p.z) < 3) continue;
      const y = this.map.ground(x, z);
      const tee = new THREE.Mesh(this.teeGeo, this.teeMat);
      tee.position.set(x, y, z);
      tee.castShadow = true;
      this.group.add(tee);
      const obj = this.makeBall();
      obj.position.set(x, y + TEE + HALF * 0.95, z);
      // face the posts to start with
      const [gx, gz] = this.fromPitch(f, end * f.F, 0);
      obj.rotation.set(TILT, Math.atan2(-(gx - x), -(gz - z)), 0, "YXZ");
      this.ball = { obj, tee, x, y, z, age: 0 };
      return true;
    }
    return false;
  }

  private dropBall(nextIn: number) {
    if (!this.ball) return;
    this.group.remove(this.ball.obj, this.ball.tee);
    this.ball = null;
    this.lining = false;
    this.wait = nextIn;
  }

  private kick() {
    const b = this.ball!;
    const speed = SPEED[0] + (SPEED[1] - SPEED[0]) * this.power, h = Math.cos(ELEVATION) * speed;
    const vel = new THREE.Vector3(-Math.sin(this.aim) * h, Math.sin(ELEVATION) * speed, -Math.cos(this.aim) * h);
    const pos = b.obj.position.clone();
    this.flights.push({ obj: b.obj, tee: b.tee, pos, vel, pitch: this.pitchAt(b.x, b.z), spin: TILT, yaw: this.aim, rest: 0, scored: false, mine: true });
    this.ball = null;
    this.lining = false;
    this.arrow.visible = false;
    this.onSound?.("kick", pos.x, pos.y, pos.z, 1);
    this.onKick?.(pos, vel);
  }

  /** Someone else kicked their ball: [x, y, z, vx, vy, vz]. */
  remoteKick(d: number[]) {
    if (!Array.isArray(d) || d.length < 6 || !d.every(Number.isFinite)) return;
    const pos = new THREE.Vector3(d[0], d[1], d[2]), vel = new THREE.Vector3(d[3], d[4], d[5]);
    if (vel.length() > 40 || Math.hypot(pos.x, pos.z) > this.map.field + 50) return;
    while (this.flights.filter((f) => !f.mine).length >= GHOSTS) this.land(this.flights.find((f) => !f.mine)!);
    const obj = this.makeBall();
    this.flights.push({ obj, pos, vel, pitch: this.pitchAt(pos.x, pos.z), spin: TILT, yaw: Math.atan2(-vel.x, -vel.z), rest: 0, scored: false, mine: false });
    this.onSound?.("kick", pos.x, pos.y, pos.z, 1);
  }

  private land(f: Flight) {
    this.group.remove(f.obj);
    if (f.tee) this.group.remove(f.tee);
    this.flights.splice(this.flights.indexOf(f), 1);
    // after a miss the next ball's not far off; after one that went over, there's a wait
    if (f.mine) this.wait = f.scored ? rand(40, 75) : rand(6, 14);
  }

  // ---- frame ----------------------------------------------------------------------------------
  /** canPlay: you're alive. input: what the keys or the stick are doing (zeros while paused). */
  update(dt: number, player: Player, canPlay: boolean, input: KickInput) {
    const p = player.pos;
    const busy = this.ball || this.flights.some((f) => f.mine);
    if (!busy) {
      const f = canPlay ? this.pitchAt(p.x, p.z) : null;
      if (!f) this.wait = Math.max(this.wait, 3);   // coming onto a pitch, it's a moment before a ball turns up
      else if ((this.wait -= dt) <= 0) {
        if (Math.random() < 0.75 && this.spawn(f, p)) this.onSay?.("A rugby ball! Kick it over the posts for a prize", 3);
        else this.wait = rand(5, 15);
      }
    }

    const b = this.ball;
    if (b) {
      const d = Math.hypot(b.x - p.x, b.z - p.z);
      if ((b.age += dt) > TEE_LIFE && !this.lining || d > 160) this.dropBall(rand(10, 25));
      else if (!this.lining) {
        if (d > LEAVE) this.away = false;
        if (!this.away && canPlay && d < REACH && Math.abs(b.y - p.y) < 1.5) {
          this.lining = true;
          this.lineT = 0;
          this.aim = player.yaw;
          this.power = 0.5;
          player.vel.x = player.vel.z = 0;
          player.pitch = Math.min(player.pitch, -0.35);   // look down at the ball, the posts still in view
        }
      }
    }
    if (this.lining && (!this.ball || !canPlay)) this.lining = false;
    if (this.lining) {
      this.lineT += dt;
      // the kick and your view turn together, so what's in the middle of the screen is where it's going
      const turn = Math.max(-1, Math.min(1, input.turn)) * TURN * dt;
      this.aim -= turn;
      player.yaw -= turn;
      this.power = Math.max(0, Math.min(1, this.power + Math.max(-1, Math.min(1, input.power)) * POWER * dt));
      this.ball!.obj.rotation.set(TILT, this.aim, 0, "YXZ");
      if (input.leave) { this.lining = false; this.away = true; }
      else if (input.kick && this.lineT > SETTLE) this.kick();
    }

    // the arrow: which way, and how hard
    this.arrow.visible = this.lining;
    if (this.lining && this.ball) {
      const len = 1.2 + this.power * 5;
      this.arrow.position.set(this.ball.x, this.ball.y + 0.06, this.ball.z);
      this.arrow.rotation.y = this.aim;
      this.shaft.scale.z = len;
      this.head.position.z = -len;
      this.arrowMat.color.setHSL((1 - this.power) * 0.33, 0.9, 0.5);
    }

    for (const f of [...this.flights]) {
      this.fly(f, dt);
      if (f.rest > FADE) this.land(f);
    }
  }

  private fly(f: Flight, dt: number) {
    if (f.rest > 0) { f.rest += dt; return; }
    const v = f.vel, map = this.map;
    // walls, fences and trees: bounce off whatever's in the way this frame
    const sp = v.length();
    if (sp > 0.5) {
      const hit = map.raycast(f.pos.x, f.pos.y, f.pos.z, v.x / sp, v.y / sp, v.z / sp, sp * dt + RAD);
      if (hit && hit.kind !== "ground") {
        const n = new THREE.Vector3(hit.nx, hit.ny, hit.nz);
        v.addScaledVector(n, -2 * v.dot(n)).multiplyScalar(0.45);
        this.onSound?.("bounce", f.pos.x, f.pos.y, f.pos.z, 0.5);
      }
    }
    const n = Math.max(1, Math.ceil(dt * 120)), h = dt / n;
    for (let k = 0; k < n && f.rest === 0; k++) {
      const s = v.length();
      v.multiplyScalar(Math.max(0, 1 - DRAG * s * h));
      v.y -= G * h;
      const ox = f.pos.x, oy = f.pos.y, oz = f.pos.z;
      f.pos.addScaledVector(v, h);
      if (f.pitch && this.posts(f, ox, oy, oz)) f.pos.set(ox, oy, oz);
      const g = map.ground(f.pos.x, f.pos.z) + RAD;
      const air = f.pos.y > g + 0.02;
      if (!air) {
        f.pos.y = g;
        if (v.y < -2) {
          // a bounce: a rugby ball goes wherever it likes
          v.y = -v.y * 0.45;
          const a = rand(-0.6, 0.6), c = Math.cos(a), si = Math.sin(a), vx = v.x, vz = v.z;
          v.x = (vx * c - vz * si) * 0.65;
          v.z = (vx * si + vz * c) * 0.65;
          this.onSound?.("bounce", f.pos.x, f.pos.y, f.pos.z, Math.min(1, -v.y / 6));
        } else {
          v.y = 0;
          v.x *= 1 - Math.min(1, 2.5 * h);
          v.z *= 1 - Math.min(1, 2.5 * h);
          if (Math.hypot(v.x, v.z) < 0.3) { v.set(0, 0, 0); f.rest = 1e-6; }
        }
      }
      // end over end in the air, rolling on the ground, on its side once it stops
      const hs = Math.hypot(v.x, v.z);
      if (hs > 0.5) f.yaw = Math.atan2(-v.x, -v.z);
      f.spin += h * (air ? 11 : hs * 4);
    }
    if (f.rest > 0) f.spin = Math.PI / 2;
    f.obj.position.copy(f.pos);
    f.obj.rotation.set(f.spin, f.yaw, 0, "YXZ");
  }

  /** The ball crossed a line of posts between (ox, oy, oz) and where it is now? Returns true if it hit them. */
  private posts(f: Flight, ox: number, oy: number, oz: number): boolean {
    const P = f.pitch!, [s0, t0] = this.toPitch(P, ox, oz), [s1, t1] = this.toPitch(P, f.pos.x, f.pos.z);
    for (const end of [-1, 1]) {
      const line = end * P.F;
      if ((s0 - line) * (s1 - line) > 0 || s0 === s1) continue;
      const a = (line - s0) / (s1 - s0), t = t0 + (t1 - t0) * a;
      const x = ox + (f.pos.x - ox) * a, z = oz + (f.pos.z - oz) * a;
      const h = oy + (f.pos.y - oy) * a - this.map.ground(x, z);
      const v = f.vel, ux = P.ux, uz = -P.uy, vs = v.x * ux + v.z * uz;   // speed along the pitch
      const bounce = (keep: number) => {
        v.x -= (1 + keep) * vs * ux;
        v.z -= (1 + keep) * vs * uz;
        this.onSound?.("post", x, oy, z, 1);
        return true;
      };
      if (Math.abs(Math.abs(t) - POST_GAP / 2) < UPRIGHT + RAD && h < POST_HEIGHT) return bounce(0.5);
      if (Math.abs(t) < POST_GAP / 2 && Math.abs(h - BAR) < UPRIGHT + RAD) { v.y = Math.abs(v.y) * 0.4; return bounce(0.35); }
      // between the posts and over the bar, going away from the field of play
      if (Math.abs(t) < POST_GAP / 2 && h > BAR && Math.sign(s1 - s0) === end && f.mine && !f.scored) {
        f.scored = true;
        this.onOver?.(P.i, end);
      }
    }
    return false;
  }
}

/** A white match ball with coloured bands round each end and a maker's panel. */
function ballTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 64; c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = "#f4f1e8";
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = "#c8202a";
  g.fillRect(0, 13, 64, 5); g.fillRect(0, 46, 64, 5);
  g.fillStyle = "#1d3f8f";
  g.fillRect(0, 19, 64, 2); g.fillRect(0, 43, 64, 2);
  g.fillRect(10, 27, 12, 10); g.fillRect(42, 27, 12, 10);
  // seams down the panels
  g.fillStyle = "rgba(0, 0, 0, 0.25)";
  for (const x of [0, 16, 32, 48]) g.fillRect(x, 0, 1, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}
