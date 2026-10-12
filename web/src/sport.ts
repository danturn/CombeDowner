// Games on the pitches. Now and then a ball turns up for you:
// - On a rugby pitch, on a kicking tee somewhere in front of the posts: sometimes an easy one,
//   sometimes a long one from out wide. Put it between the uprights and over the bar.
// - On a cricket field, at the bowler's end of the wicket: bowl it down the wicket and knock the
//   stumps over at the other end. Too slow and it bounces over them, too quick and it's a full toss
//   over the bails.
// Walk up to the ball to line up: A and D (or the stick) aim, W and S set the power, Space or a click
// kicks or bowls it and E walks off. Do it and a prize lands on the ground under the posts or behind
// the stumps (see Pickups.bonus).
//
// Your ball is yours alone: nobody else sees it waiting, but everyone sees it fly when you kick or
// bowl it. Whether it went in is the kicker's call (like hits, see game.ts); the host places the prize.
import * as THREE from "three";
import { GameMap, POST_GAP, POST_HEIGHT, rugbyLayout } from "./map";
import { Player } from "./player";
import { STUMPS } from "./pitches";

/** Rugby ("r") or cricket ("c"), as in the map's pitch list. */
export type Sport = "r" | "c";
interface Rules { elevation: number; speed: [number, number]; turn: number; drag: number; rad: number }
const RULES: Record<Sport, Rules> = {
  // kicks go up at about 35 degrees; turning is quick, as the posts are wide
  r: { elevation: 0.6, speed: [11, 30], turn: 0.45, drag: 0.005, rad: 0.11 },
  // bowled nearly flat from above your head; turning is slow, as the stumps are narrow
  c: { elevation: 0.06, speed: [16, 32], turn: 0.15, drag: 0.002, rad: 0.05 },
};

const G = 9.81;
const BAR = 3;                   // crossbar height
const UPRIGHT = 0.08;            // upright radius
const HALF = 0.17;               // half a rugby ball's length
const TEE = 0.07;                // how tall the tee stands
const TILT = -0.3;               // a ball on a tee leans back a little
const CREASE = 10.06;            // from the middle of the wicket to the stumps
const STUMP_H = 0.73, STUMP_W = 0.132;   // stumps and bails: height, and half the width
const RELEASE = 2.1;             // a bowler lets go this high
const REACH = 1.5;               // this close to the ball, you line up
const LEAVE = 2.6;               // after walking off, this far away before it'll have you again
const POWER = 0.7;               // how fast the power changes (per s)
const SETTLE = 0.3;              // seconds lined up before a click counts
const WAIT_LIFE = 120;           // seconds a ball waits for you
const FADE = 3;                  // seconds a ball lies about once it stops
const DOWN = 8;                  // seconds before knocked-over stumps are put back up
const HARD = 0.35;               // chance a rugby kick is a long one from out wide
const GHOSTS = 6;                // other players' balls in the air at once
const rand = (a: number, b: number) => a + Math.random() * (b - a);

interface Frame { i: number; sport: Sport; cx: number; cy: number; ux: number; uy: number; L: number; W: number; F: number; ring: number[][] }
interface Flight {
  sport: Sport; obj: THREE.Object3D; mark?: THREE.Object3D; pos: THREE.Vector3; vel: THREE.Vector3; pitch: Frame | null;
  spin: number; yaw: number; rest: number; scored: boolean; mine: boolean; target: number; hard: boolean;
}
/** A ball waiting for you: on a tee (rugby) or on the grass at the bowler's end (cricket). */
interface Waiting { sport: Sport; obj: THREE.Object3D; mark: THREE.Object3D; x: number; y: number; z: number; age: number; target: number; hard: boolean }
interface Knocked { key: string; t: number; parts: { m: THREE.Mesh; p0: THREE.Vector3; r0: THREE.Euler; v?: THREE.Vector3; tilt?: [number, number] }[] }
export interface KickInput { turn: number; power: number; kick: boolean; leave: boolean }
export type Thud = "kick" | "bowl" | "bounce" | "post" | "stumps";

export class Sports {
  /** Lining up: you stand still and WASD steers the ball instead. */
  lining = false;
  /** How hard you'll kick or bowl it, 0..1. */
  power = 0.5;
  /** You kicked or bowled: tell everyone (scene position and velocity). */
  onKick?: (pos: THREE.Vector3, vel: THREE.Vector3, sport: Sport) => void;
  /** Yours went over the posts or hit the stumps: pitch index in map.d.pi, which end (-1 or 1), and whether it was a hard one. */
  onScore?: (pitch: number, end: number, hard: boolean) => void;
  onSound?: (what: Thud, x: number, y: number, z: number, vol: number) => void;
  onSay?: (text: string, secs: number) => void;

  private pitches: Frame[] = [];
  private ball: Waiting | null = null;
  private flights: Flight[] = [];
  private knocked: Knocked[] = [];
  private aim = 0;
  private lineT = 0;
  private away = false;           // walked off: don't line up again until you've stepped back
  private wait = rand(4, 12);     // seconds on a pitch before the next ball turns up
  private group = new THREE.Group();
  private geo: Record<Sport, THREE.BufferGeometry>;
  private mat: Record<Sport, THREE.Material>;
  private teeGeo = new THREE.CylinderGeometry(0.04, 0.09, TEE, 10).translate(0, TEE / 2, 0);
  private teeMat = new THREE.MeshLambertMaterial({ color: "#ff7a1a" });
  private ringGeo = new THREE.RingGeometry(0.25, 0.36, 24).rotateX(-Math.PI / 2);
  private ringMat = new THREE.MeshBasicMaterial({ color: "#ff5a4a", transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
  private arrow: THREE.Group;
  private shaft: THREE.Mesh;
  private head: THREE.Mesh;
  private arrowMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.8, depthWrite: false });

  constructor(private map: GameMap, scene: THREE.Scene) {
    (map.d.pi ?? []).forEach((p, i) => {
      if (p[0] === "r") {
        const { L, W, F } = rugbyLayout(p);
        this.pitches.push({ i, sport: "r", cx: p[1], cy: p[2], ux: Math.cos(p[5]), uy: Math.sin(p[5]), L, W, F, ring: [] });
      } else {
        this.pitches.push({ i, sport: "c", cx: p[1], cy: p[2], ux: Math.cos(p[3]), uy: Math.sin(p[3]), L: 0, W: 0, F: 0, ring: p[4] });
      }
    });
    scene.add(this.group);
    this.geo = { r: new THREE.SphereGeometry(1, 20, 14).scale(RULES.r.rad, HALF, RULES.r.rad), c: new THREE.SphereGeometry(RULES.c.rad, 14, 10) };
    this.mat = { r: new THREE.MeshLambertMaterial({ map: rugbyBall() }), c: new THREE.MeshLambertMaterial({ map: cricketBall(), emissive: "#2a0404" }) };
    // the aiming arrow on the grass: its colour (and for a kick, its length) is the power
    this.shaft = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 1).rotateX(-Math.PI / 2).translate(0, 0, -0.5), this.arrowMat);
    const tri = new THREE.Shape([new THREE.Vector2(-0.3, 0), new THREE.Vector2(0.3, 0), new THREE.Vector2(0, 0.6)]);
    this.head = new THREE.Mesh(new THREE.ShapeGeometry(tri).rotateX(-Math.PI / 2), this.arrowMat);
    this.arrow = new THREE.Group();
    this.arrow.add(this.shaft, this.head);
    this.arrow.visible = false;
    this.arrow.renderOrder = 2;
    this.group.add(this.arrow);
  }

  // ---- pitch frames: s along the pitch (or wicket) from its middle, t across it ---------------
  private toPitch(f: Frame, x: number, z: number): [number, number] {
    const dx = x - f.cx, dy = -z - f.cy;
    return [dx * f.ux + dy * f.uy, -dx * f.uy + dy * f.ux];
  }

  private fromPitch(f: Frame, s: number, t: number): [number, number] {
    return [f.cx + f.ux * s - f.uy * t, -(f.cy + f.uy * s + f.ux * t)];
  }

  /** The pitch or cricket field at scene (x, z), if any. */
  private pitchAt(x: number, z: number, sport?: Sport): Frame | null {
    for (const f of this.pitches) {
      if (sport && f.sport !== sport) continue;
      if (f.sport === "r") {
        const [s, t] = this.toPitch(f, x, z);
        if (Math.abs(s) < f.L / 2 + 2 && Math.abs(t) < f.W / 2 + 2) return f;
      } else if (inside(f.ring, x, -z)) return f;
    }
    return null;
  }

  /** Where the prize goes for a score at one end of a pitch (scene x, z): under the posts, or behind the stumps. */
  goalSpot(pitch: number, end: number): [number, number] | null {
    const f = this.pitches.find((p) => p.i === pitch);
    if (!f || (end !== 1 && end !== -1)) return null;
    return f.sport === "r" ? this.fromPitch(f, end * f.F, 0) : this.fromPitch(f, end * (CREASE + 3), 0);
  }

  /** The sport of the ball you're lined up on, or waiting for you. */
  get sport(): Sport | null { return this.ball?.sport ?? null; }

  /** Where your ball is waiting, for the minimap. */
  get blip(): { x: number; z: number } | null {
    return this.ball && { x: this.ball.x, z: this.ball.z };
  }

  private makeBall(sport: Sport): THREE.Object3D {
    const m = new THREE.Mesh(this.geo[sport], this.mat[sport]);
    m.castShadow = true;
    this.group.add(m);
    return m;
  }

  // ---- your ball ------------------------------------------------------------------------------
  private spawn(f: Frame, p: THREE.Vector3): boolean {
    const [ps] = this.toPitch(f, p.x, p.z);
    const end = ps > 0.5 ? 1 : ps < -0.5 ? -1 : Math.random() < 0.5 ? 1 : -1;   // the end you're nearer
    if (f.sport === "c") {
      // at the bowler's end, just past the stumps, to bowl at the far ones
      const [x, z] = this.fromPitch(f, end * (CREASE + 1.6), rand(-0.6, 0.6));
      if (Math.hypot(x - p.x, z - p.z) < 3) return false;
      const y = this.map.ground(x, z);
      const mark = new THREE.Mesh(this.ringGeo, this.ringMat);
      mark.position.set(x, y + 0.04, z);
      this.group.add(mark);
      const obj = this.makeBall("c");
      obj.position.set(x, y + RULES.c.rad, z);
      this.ball = { sport: "c", obj, mark, x, y, z, age: 0, target: -end, hard: false };
      this.onSay?.("A cricket ball! Bowl it at the far stumps for a prize", 3);
      return true;
    }
    const hard = Math.random() < HARD;
    for (let k = 0; k < 10; k++) {
      // an easy one in front of the posts, or a long one from out towards touch
      const d = hard ? f.F * rand(0.65, 0.95) : Math.max(6, f.F * rand(0.2, 0.6));
      const wide = Math.max(0, f.W / 2 - 4);
      const t = hard ? (Math.random() < 0.5 ? -1 : 1) * wide * rand(0.55, 0.95) : rand(-1, 1) * wide * 0.5;
      const [x, z] = this.fromPitch(f, end * (f.F - d), t);
      if (this.map.blocked(x, z, 0.5) || Math.hypot(x - p.x, z - p.z) < 3) continue;
      const y = this.map.ground(x, z);
      const mark = new THREE.Mesh(this.teeGeo, this.teeMat);
      mark.position.set(x, y, z);
      mark.castShadow = true;
      this.group.add(mark);
      const obj = this.makeBall("r");
      obj.position.set(x, y + TEE + HALF * 0.95, z);
      // face the posts to start with
      const [gx, gz] = this.fromPitch(f, end * f.F, 0);
      obj.rotation.set(TILT, Math.atan2(-(gx - x), -(gz - z)), 0, "YXZ");
      this.ball = { sport: "r", obj, mark, x, y, z, age: 0, target: end, hard };
      this.onSay?.(hard ? "A rugby ball, a long way out. Kick it over the posts for a better prize" : "A rugby ball! Kick it over the posts for a prize", 3);
      return true;
    }
    return false;
  }

  private dropBall(nextIn: number) {
    if (!this.ball) return;
    this.group.remove(this.ball.obj, this.ball.mark);
    this.ball = null;
    this.lining = false;
    this.wait = nextIn;
  }

  private kick(player: Player) {
    const b = this.ball!, R = RULES[b.sport];
    const speed = R.speed[0] + (R.speed[1] - R.speed[0]) * this.power, h = Math.cos(R.elevation) * speed;
    const fx = -Math.sin(this.aim), fz = -Math.cos(this.aim);
    const vel = new THREE.Vector3(fx * h, Math.sin(R.elevation) * speed, fz * h);
    // a kick goes from the tee; a ball's bowled from over your head
    const pos = b.sport === "r" ? b.obj.position.clone() : player.pos.clone().add(new THREE.Vector3(fx * 0.4, RELEASE, fz * 0.4));
    this.flights.push({
      sport: b.sport, obj: b.obj, mark: b.mark, pos, vel, pitch: this.pitchAt(b.x, b.z, b.sport),
      spin: b.sport === "r" ? TILT : 0, yaw: this.aim, rest: 0, scored: false, mine: true, target: b.target, hard: b.hard,
    });
    this.ball = null;
    this.lining = false;
    this.arrow.visible = false;
    this.onSound?.(b.sport === "r" ? "kick" : "bowl", pos.x, pos.y, pos.z, 1);
    this.onKick?.(pos, vel, b.sport);
  }

  /** Someone else kicked or bowled: [x, y, z, vx, vy, vz, cricket ? 1 : 0]. */
  remoteKick(d: number[]) {
    if (!Array.isArray(d) || d.length < 6 || !d.slice(0, 6).every(Number.isFinite)) return;
    const sport: Sport = d[6] === 1 ? "c" : "r";
    const pos = new THREE.Vector3(d[0], d[1], d[2]), vel = new THREE.Vector3(d[3], d[4], d[5]);
    if (vel.length() > 40 || Math.hypot(pos.x, pos.z) > this.map.field + 50) return;
    while (this.flights.filter((f) => !f.mine).length >= GHOSTS) this.land(this.flights.find((f) => !f.mine)!);
    this.flights.push({
      sport, obj: this.makeBall(sport), pos, vel, pitch: this.pitchAt(pos.x, pos.z, sport),
      spin: 0, yaw: Math.atan2(-vel.x, -vel.z), rest: 0, scored: false, mine: false, target: 0, hard: false,
    });
    this.onSound?.(sport === "r" ? "kick" : "bowl", pos.x, pos.y, pos.z, 1);
  }

  private land(f: Flight) {
    this.group.remove(f.obj);
    if (f.mark) this.group.remove(f.mark);
    this.flights.splice(this.flights.indexOf(f), 1);
    // after a miss the next ball's not far off; after a score, there's a wait
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
      else if ((this.wait -= dt) <= 0 && !(Math.random() < 0.75 && this.spawn(f, p))) this.wait = rand(5, 15);
    }

    const b = this.ball;
    if (b) {
      const d = Math.hypot(b.x - p.x, b.z - p.z);
      if (((b.age += dt) > WAIT_LIFE && !this.lining) || d > 160) this.dropBall(rand(10, 25));
      else if (!this.lining) {
        if (d > LEAVE) this.away = false;
        if (!this.away && canPlay && d < REACH && Math.abs(b.y - p.y) < 1.5) {
          this.lining = true;
          this.lineT = 0;
          this.aim = player.yaw;
          this.power = 0.5;
          player.vel.x = player.vel.z = 0;
          player.pitch = Math.min(player.pitch, -0.35);   // look down at the ball, with the posts or stumps still in view
        }
      }
    }
    if (this.lining && (!this.ball || !canPlay)) {
      this.lining = false;
      if (this.ball?.sport === "c") this.ball.obj.position.set(this.ball.x, this.ball.y + RULES.c.rad, this.ball.z);   // dropped it
    }
    if (this.lining) {
      const ball = this.ball!;
      this.lineT += dt;
      // the ball and your view turn together, so what's in the middle of the screen is where it's going
      const turn = Math.max(-1, Math.min(1, input.turn)) * RULES[ball.sport].turn * dt;
      this.aim -= turn;
      player.yaw -= turn;
      this.power = Math.max(0, Math.min(1, this.power + Math.max(-1, Math.min(1, input.power)) * POWER * dt));
      const fx = -Math.sin(this.aim), fz = -Math.cos(this.aim);
      if (ball.sport === "r") ball.obj.rotation.set(TILT, this.aim, 0, "YXZ");
      else ball.obj.position.set(p.x + fx * 0.55 - fz * 0.3, p.y + 1.25, p.z + fz * 0.55 + fx * 0.3);   // in your right hand
      if (input.leave) {
        this.lining = false;
        this.away = true;
        if (ball.sport === "c") ball.obj.position.set(ball.x, ball.y + RULES.c.rad, ball.z);
      } else if (input.kick && this.lineT > SETTLE) this.kick(player);
    }

    // the arrow: which way, and how hard. A kick's is short; a bowler's runs the length of the wicket
    this.arrow.visible = this.lining;
    if (this.lining && this.ball) {
      const kick = this.ball.sport === "r", len = kick ? 1.2 + this.power * 5 : 20;
      if (kick) this.arrow.position.set(this.ball.x, this.ball.y + 0.06, this.ball.z);
      else this.arrow.position.set(p.x, p.y + 0.06, p.z);
      this.arrow.rotation.y = this.aim;
      this.shaft.scale.set(kick ? 1 : 0.5, 1, len);
      this.head.position.z = -len;
      this.arrowMat.color.setHSL((1 - this.power) * 0.33, 0.9, 0.5);
    }

    for (const f of [...this.flights]) {
      this.fly(f, dt);
      if (f.rest > FADE) this.land(f);
    }
    this.fallen(dt);
  }

  private fly(f: Flight, dt: number) {
    if (f.rest > 0) { f.rest += dt; return; }
    const v = f.vel, map = this.map, R = RULES[f.sport], rugby = f.sport === "r";
    // walls, fences and trees: bounce off whatever's in the way this frame
    const sp = v.length();
    if (sp > 0.5) {
      const hit = map.raycast(f.pos.x, f.pos.y, f.pos.z, v.x / sp, v.y / sp, v.z / sp, sp * dt + R.rad);
      if (hit && hit.kind !== "ground") {
        const n = new THREE.Vector3(hit.nx, hit.ny, hit.nz);
        v.addScaledVector(n, -2 * v.dot(n)).multiplyScalar(0.45);
        this.onSound?.("bounce", f.pos.x, f.pos.y, f.pos.z, 0.5);
      }
    }
    const n = Math.max(1, Math.ceil(dt * 120)), h = dt / n;
    for (let k = 0; k < n && f.rest === 0; k++) {
      const s = v.length();
      v.multiplyScalar(Math.max(0, 1 - R.drag * s * h));
      v.y -= G * h;
      const ox = f.pos.x, oy = f.pos.y, oz = f.pos.z;
      f.pos.addScaledVector(v, h);
      if (f.pitch && (rugby ? this.posts(f, ox, oy, oz) : this.stumps(f, ox, oy, oz))) f.pos.set(ox, oy, oz);
      const g = map.ground(f.pos.x, f.pos.z) + R.rad;
      const air = f.pos.y > g + 0.02;
      if (!air) {
        f.pos.y = g;
        if (v.y < (rugby ? -2 : -1)) {
          // a rugby ball goes wherever it likes off the ground; a cricket ball holds its line, give or take the seam
          v.y = -v.y * (rugby ? 0.45 : 0.75);
          const a = rugby ? rand(-0.6, 0.6) : rand(-0.012, 0.012), c = Math.cos(a), si = Math.sin(a), vx = v.x, vz = v.z, keep = rugby ? 0.65 : 0.88;
          v.x = (vx * c - vz * si) * keep;
          v.z = (vx * si + vz * c) * keep;
          this.onSound?.("bounce", f.pos.x, f.pos.y, f.pos.z, Math.min(1, v.y / 6) * (rugby ? 1 : 0.5));
        } else {
          v.y = 0;
          v.x *= 1 - Math.min(1, 2.5 * h);
          v.z *= 1 - Math.min(1, 2.5 * h);
          if (Math.hypot(v.x, v.z) < 0.3) { v.set(0, 0, 0); f.rest = 1e-6; }
        }
      }
      // end over end in the air, rolling on the ground
      const hs = Math.hypot(v.x, v.z);
      if (hs > 0.5) f.yaw = Math.atan2(-v.x, -v.z);
      f.spin += h * (rugby ? (air ? 11 : hs * 4) : (air ? 25 : hs / R.rad));
    }
    if (f.rest > 0 && rugby) f.spin = Math.PI / 2;   // on its side once it stops
    f.obj.position.copy(f.pos);
    f.obj.rotation.set(f.spin, f.yaw, 0, "YXZ");
  }

  /** Did a crossing of the line at s = line between (ox, oz) and now happen? Where, across and how high. */
  private crossing(f: Flight, ox: number, oy: number, oz: number, line: number) {
    const P = f.pitch!, [s0, t0] = this.toPitch(P, ox, oz), [s1, t1] = this.toPitch(P, f.pos.x, f.pos.z);
    if ((s0 - line) * (s1 - line) > 0 || s0 === s1) return null;
    const a = (line - s0) / (s1 - s0), x = ox + (f.pos.x - ox) * a, z = oz + (f.pos.z - oz) * a;
    return { t: t0 + (t1 - t0) * a, h: oy + (f.pos.y - oy) * a - this.map.ground(x, z), x, z, way: Math.sign(s1 - s0) };
  }

  /** Knock the ball back along the pitch, keeping some of its speed. */
  private rebound(f: Flight, keep: number) {
    const P = f.pitch!, v = f.vel, ux = P.ux, uz = -P.uy, vs = v.x * ux + v.z * uz;
    v.x -= (1 + keep) * vs * ux;
    v.z -= (1 + keep) * vs * uz;
  }

  /** The ball crossed a line of posts? Returns true if it hit them. */
  private posts(f: Flight, ox: number, oy: number, oz: number): boolean {
    const P = f.pitch!, rad = RULES.r.rad;
    for (const end of [-1, 1]) {
      const c = this.crossing(f, ox, oy, oz, end * P.F);
      if (!c) continue;
      if (Math.abs(Math.abs(c.t) - POST_GAP / 2) < UPRIGHT + rad && c.h < POST_HEIGHT) {
        this.rebound(f, 0.5);
        this.onSound?.("post", c.x, oy, c.z, 1);
        return true;
      }
      if (Math.abs(c.t) < POST_GAP / 2 && Math.abs(c.h - BAR) < UPRIGHT + rad) {
        f.vel.y = Math.abs(f.vel.y) * 0.4;
        this.rebound(f, 0.35);
        this.onSound?.("post", c.x, oy, c.z, 1);
        return true;
      }
      // between the posts and over the bar, going away from the field of play
      if (Math.abs(c.t) < POST_GAP / 2 && c.h > BAR && c.way === end && f.mine && !f.scored) {
        f.scored = true;
        this.onScore?.(P.i, end, f.hard);
      }
    }
    return false;
  }

  /** The ball reached a set of stumps? Returns true if it hit them. */
  private stumps(f: Flight, ox: number, oy: number, oz: number): boolean {
    const P = f.pitch!, rad = RULES.c.rad;
    for (const end of [-1, 1]) {
      const c = this.crossing(f, ox, oy, oz, end * CREASE);
      if (!c || Math.abs(c.t) > STUMP_W + rad || c.h > STUMP_H + rad) continue;
      this.knock(P.i, end, c.way);
      this.rebound(f, 0.25);
      f.vel.multiplyScalar(0.6);
      this.onSound?.("stumps", c.x, oy, c.z, 1);
      if (f.mine && !f.scored && end === f.target) {
        f.scored = true;
        this.onScore?.(P.i, end, false);
      }
      return true;
    }
    return false;
  }

  /** Send the stumps at one end of a wicket flying, the ball going the way way along it. */
  private knock(pitch: number, end: number, way: number) {
    const key = `${pitch}:${end}`, set = STUMPS.get(key), P = this.pitches.find((p) => p.i === pitch);
    if (!set || !P || this.knocked.some((k) => k.key === key)) return;
    // which way is "along the wicket, the way the ball went", in the scene
    const ax = P.ux * way, az = -P.uy * way;
    const parts: Knocked["parts"] = [];
    for (const m of set.stumps) {
      // leaning back, away from the bowler, and splayed a bit
      const lean = rand(0.35, 0.9), side = rand(-0.4, 0.4);
      parts.push({ m, p0: m.position.clone(), r0: m.rotation.clone(), tilt: [az * lean + ax * side, -ax * lean + az * side] });
    }
    for (const m of set.bails) {
      const v = new THREE.Vector3(ax * rand(2, 4) + rand(-1.5, 1.5), rand(3, 5), az * rand(2, 4) + rand(-1.5, 1.5));
      parts.push({ m, p0: m.position.clone(), r0: m.rotation.clone(), v });
    }
    this.knocked.push({ key, t: 0, parts });
  }

  /** Knocked-over stumps fall, the bails fly, and after a while they're all put back up. */
  private fallen(dt: number) {
    for (const k of [...this.knocked]) {
      k.t += dt;
      if (k.t > DOWN) {
        for (const p of k.parts) { p.m.position.copy(p.p0); p.m.rotation.copy(p.r0); }
        this.knocked.splice(this.knocked.indexOf(k), 1);
        continue;
      }
      const ease = Math.min(1, k.t / 0.18);
      for (const p of k.parts) {
        if (p.tilt) p.m.rotation.set(p.r0.x + p.tilt[0] * ease, p.r0.y, p.r0.z + p.tilt[1] * ease);
        if (!p.v) continue;
        // the bails: up, over and down on the grass, spinning
        const g = this.map.ground(p.m.position.x, p.m.position.z) - 0.7;   // their mesh sits 0.72 up from its origin
        if (p.m.position.y <= g && p.v.y < 0) { p.m.position.y = g; p.v.set(0, 0, 0); continue; }
        p.v.y -= G * dt;
        p.m.position.addScaledVector(p.v, dt);
        p.m.rotation.y += dt * 14;   // about its foot, which is on the ground: so only round and round
      }
    }
  }
}

/** Point in polygon, in data coordinates. */
function inside(ring: number[][], x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** A white match ball with coloured bands round each end and a maker's panel. */
function rugbyBall(): THREE.CanvasTexture {
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
  return texture(c);
}

/** A red leather cricket ball with its stitched seam round the middle. */
function cricketBall(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 32; c.height = 32;
  const g = c.getContext("2d")!;
  g.fillStyle = "#9e1a16";
  g.fillRect(0, 0, 32, 32);
  g.fillStyle = "#e8dcc0";
  g.fillRect(0, 14, 32, 1); g.fillRect(0, 17, 32, 1);
  g.fillStyle = "#c23a2c";
  g.fillRect(0, 15, 32, 2);
  return texture(c);
}

function texture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}
