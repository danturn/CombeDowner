// The cinematic camera, for anything you drive, steer or fly: a car, a van, a bus, a narrowboat at
// its tiller or a hot air balloon (C, or View on a touch screen, past the chase camera). As in GTA V,
// it cuts every few seconds from one shot to another, as a film crew would set them up: low by the
// kerb as you sweep past, up on a crane or a rooftop, tracking alongside, out in front looking back,
// down by the back wheel, from a helicopter, and the long lens from a hillside across the valley.
// Where it can, it lines you up with one of Bath's landmarks behind you (the Abbey, Pulteney Bridge,
// Sham Castle...), and it looks for the dramatic angle: low and looking up, or high on a hill
// looking down. Under a balloon it stands in a field or a street looking up as you drift over,
// clings to the basket looking up into the envelope with the burner roaring, or hangs over the crown
// looking down past it to the city.
//
// With depth of field on in Settings (post.ts), it's focused on you, and the longer the lens the
// more what's in front and behind melts away; close shots keep more of the scene sharp.
//
// It has to be drivable, though, hard as that is. On the road and the water it works out where
// you're going (curving with you as you turn), and how far ahead you need to see at the speed
// you're doing: a couple of seconds' worth, so further the faster you go. Each shot is judged on
// whether that stretch of road is in the picture and not hidden behind something, and the faster
// you go the more that counts, so at speed most shots show the road ahead (low behind you, a drone
// or a helicopter above, high on a crane, or from the side with the road opening up beyond), with
// the odd one just for the drama (the car coming at you from the front, right by the kerb as it
// rushes past). After one of those, the next always shows the way ahead, and one that's lost sight
// of it cuts away sooner the faster you're going. It also watches for what you might hit: the
// traffic, parked cars, other vehicles and people on your path, and a wall or a building where
// the road bends. With something coming up, a shot that can't see it cuts at once to one that can.
//
// Every camera spot is checked before it's used: never inside a building (on its roof is fine),
// never under the ground or the water, and with a clear view of you. If a building, a hill or a tree
// gets in the way during a shot, or you've gone by and away, it cuts to the next one.
//
// Who decides what: nobody else. It's only your own view; nothing about it is sent.
import * as THREE from "three";
import type { GameMap } from "./map";
import { SET_PIECES } from "./landmarks/setpieces";
import type { Focus } from "./post";

/** What's being filmed: on the road, on the water, or in the air. */
export type Medium = "road" | "water" | "air";

/** What's being filmed, this frame: the bottom middle of it (scene coords), which way it faces (as
 *  the player's yaw: it goes along -sin, -cos), half its length and width, and its height; and how
 *  fast it's going, if that's known (otherwise it's worked out from where it's been). */
export interface Subject { x: number; y: number; z: number; yaw: number; len: number; wid: number; h: number; medium: Medium; vx?: number; vy?: number; vz?: number }

type Kind = "roadside" | "kerb" | "crane" | "track" | "lead" | "wheel" | "heli" | "backdrop" | "vista" | "orbit" | "trail" | "follow" | "top"
  | "below" | "basket" | "crown" | "alongside";

interface Shot {
  kind: Kind;
  /** Fixed shots stay where they're set up and turn to follow; the others go along with it. */
  fixed: boolean;
  /** Fixed: where the camera is. Moving: where, from the subject (x right, y up, z back), in its own frame. */
  at: THREE.Vector3;
  /** What it looks at, from the subject's bottom middle, in its own frame (x right, y up, z back). */
  aim: THREE.Vector3;
  fov: number; fovEnd: number;
  roll: number;
  spin: number;      // moving shots: how fast it circles round, radians a second
  len: number; t: number;
  /** Fixed shots: the furthest it'll still follow before it cuts. */
  reach: number;
  blocked: number;
  /** The landmark it lines up behind the subject, if any. */
  mark?: THREE.Vector3;
  /** It looks the way it's going, so you can drive by it (checked when it's chosen). */
  easy?: boolean;
  /** Fixed shots: how long since it went past the camera. */
  passed?: number;
  /** How long it's been unable to see the way ahead, while going. */
  blind?: number;
}

/** Something on the road or the water that could be hit (scene x and z). */
export interface Obstacle { x: number; z: number }

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _look = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const side = () => (Math.random() < 0.5 ? -1 : 1);

export class Cinema {
  private shot: Shot | null = null;
  private last: Kind | null = null;
  private lastEasy = false;              // the last shot looked the way it was going
  private yaw = 0;                       // the way the shots are set out from: where it's going, smoothed
  private vel = new THREE.Vector3();     // how fast it's going, worked out from where it's been
  private was: THREE.Vector3 | null = null;
  private cam = new THREE.Vector3();
  private looking = new THREE.Vector3();
  private checkT = 0;
  private marks: THREE.Vector3[] | null = null;
  private bars: HTMLDivElement[] = [];
  /** The lens for this frame, degrees, while it's filming (game.ts uses it in place of its own). */
  fov: number | null = null;
  private focusD = 20;                   // how far off it is, for the focus
  private aspect = 16 / 9;
  private heading = 0;                   // the way it's going, this moment (not smoothed)
  private turn = 0;                      // how fast that's turning, radians a second, smoothed
  private danger = Infinity;             // seconds till it hits the nearest thing on its path
  private dangerT = 0;
  private aheadT = 0;
  /** What's about that could be hit within r metres of scene (x, z): the traffic, parked cars, other
   *  vehicles, people (game.ts says, leaving out what's being filmed). */
  obstacles: ((x: number, z: number, r: number) => Obstacle[]) | null = null;

  constructor(private map: GameMap) {}

  /** Stop filming (another view, or out of the vehicle): the next time starts afresh with a new shot. */
  stop() {
    this.shot = null;
    this.was = null;
    this.fov = null;
    this.letterbox(false);
  }

  /** Cut to a new shot now (the view's just been chosen, or something's teleported). */
  cut() { this.shot = null; }

  /** A frame: where the camera goes and what it looks at, for subject s. */
  film(dt: number, s: Subject, camera: THREE.PerspectiveCamera) {
    dt = Math.min(dt, 0.1);
    const here = new THREE.Vector3(s.x, s.y, s.z);
    if (s.vx !== undefined && s.vz !== undefined) {
      _v.set(s.vx, s.vy ?? 0, s.vz);
      if (this.was && here.distanceTo(this.was) > 60) this.shot = null;   // teleported: start again
      if (this.was) this.vel.lerp(_v, Math.min(1, dt * 8)); else this.vel.copy(_v);
    } else if (this.was && dt > 0) {
      const jump = here.distanceTo(this.was);
      if (jump > 60) this.shot = null;   // teleported: start again
      else this.vel.lerp(_v.copy(here).sub(this.was).divideScalar(dt), Math.min(1, dt * 4));
    } else this.vel.set(0, 0, 0);
    this.was = here.clone();
    const speed = Math.hypot(this.vel.x, this.vel.z);
    this.aspect = camera.aspect || this.aspect;
    if (speed > 1) {
      const h = Math.atan2(-this.vel.x, -this.vel.z), dh = Math.atan2(Math.sin(h - this.heading), Math.cos(h - this.heading));
      if (dt > 0) this.turn += (THREE.MathUtils.clamp(dh / dt, -1.5, 1.5) - this.turn) * Math.min(1, dt * 3);
      this.heading = h;
    } else { this.heading = s.yaw; this.turn = 0; }
    // what's coming up, a few times a second
    if (s.medium !== "air" && (this.dangerT -= dt) <= 0) { this.dangerT = 0.15; this.danger = this.lookOut(s, speed); }
    else if (s.medium === "air") this.danger = Infinity;
    // the shots are set out from the way it's going, or the way it faces when it's slow (a balloon from its basket)
    const want = s.medium !== "air" && speed > 2 ? Math.atan2(-this.vel.x, -this.vel.z) : s.yaw;
    const d = Math.atan2(Math.sin(want - this.yaw), Math.cos(want - this.yaw));
    this.yaw += this.shot ? d * Math.min(1, dt * 1.5) : d;

    const sh = this.shot;
    if (sh) {
      sh.t += dt;
      if (sh.t > sh.len) this.shot = null;
      else if (sh.fixed && this.where(sh, s, _w).distanceTo(this.centre(s)) > sh.reach) this.shot = null;
      else if (sh.fixed && s.medium !== "air" && speed > 2) {
        // gone past the camera: a moment to see it go, then cut, so you're not left driving away from it
        const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
        if ((sh.at.x - s.x) * fx + (sh.at.z - s.z) * fz < -(s.len + 3)) {
          sh.passed = (sh.passed ?? 0) + dt;
          if (sh.passed > 0.7) this.shot = null;
        }
      }
      // can't see where it's going: the faster it goes, the sooner it cuts, and at once if
      // something's coming up that it might hit
      if (this.shot && s.medium !== "air" && speed > 4 && (this.aheadT -= dt) <= 0) {
        this.aheadT = 0.2;
        const seen = this.fov === null ? 1 : this.seesAhead(this.cam, this.looking, this.fov, s, speed, 0);
        sh.blind = seen < 0.34 ? (sh.blind ?? 0) + 0.2 : 0;
        const allowed = this.danger < 2.5 ? 0.2 : THREE.MathUtils.clamp(4.5 - speed / 7, 1, 4);
        if (sh.blind > allowed && sh.t > 0.6) this.shot = null;
      }
    }
    if (!this.shot) {
      this.shot = this.choose(s, speed);
      this.last = this.shot.kind;
      this.lastEasy = !!this.shot.easy;
      this.where(this.shot, s, this.cam);
      this.aimAt(this.shot, s, this.looking);
      // a fixed shot follows it in from wherever it starts, and cuts once it's gone well past
      if (this.shot.fixed) this.shot.reach = Math.max(this.shot.reach, this.cam.distanceTo(this.centre(s)) * 1.3);
      this.checkT = 0;
    }
    const shot = this.shot;
    // where the camera is: a fixed one stays put; a moving one goes along, a touch behind, as on a car's arm
    this.where(shot, s, _w);
    if (shot.fixed) this.cam.copy(_w);
    else {
      this.cam.lerp(_w, Math.min(1, dt * (shot.kind === "basket" || shot.kind === "wheel" ? 14 : 6)));
      const g = this.lowest(this.cam.x, this.cam.z, s);
      if (this.cam.y < g + 0.25) this.cam.y = g + 0.25;
    }
    // and what it looks at, eased so it follows smoothly rather than locked on
    this.aimAt(shot, s, _look);
    this.looking.lerp(_look, Math.min(1, dt * (shot.fixed ? 5 : 9)));
    // lost sight of it, or the camera's gone inside something: cut
    if ((this.checkT -= dt) <= 0) {
      this.checkT = 0.12;
      const clear = this.sees(this.cam, this.centre(s), s) && !this.inside(this.cam);
      shot.blocked = clear ? 0 : shot.blocked + 0.12;
      if (shot.blocked > 0.36) this.shot = null;
    }
    this.focusD = this.cam.distanceTo(this.centre(s));
    camera.position.copy(this.cam);
    camera.up.set(0, 1, 0);
    camera.lookAt(this.looking);
    if (shot.roll) camera.rotateZ(shot.roll);
    const k = Math.min(1, shot.t / shot.len);
    this.fov = shot.fov + (shot.fovEnd - shot.fov) * k * k * (3 - 2 * k);
    this.letterbox(true);
  }

  /** Depth of field for this frame: focused on it, the aperture a share of that distance (so the blur
   *  either side looks alike near or far), a little wider for the shots made to look dreamy. */
  get lens(): Focus | null {
    if (this.fov === null || !this.shot) return null;
    const k = this.shot.kind, wide = k === "basket" || k === "crown" || k === "kerb" || k === "wheel" ? 0.006 : 0.01;
    return { focus: this.focusD, aperture: this.focusD * wide };
  }

  // ---- choosing a shot -------------------------------------------------------------------------

  /** Set up a few of each kind of shot that suits it, keep the ones that can see it from somewhere
   *  sensible, and pick among the most dramatic, not the same kind twice running. */
  private choose(s: Subject, speed: number): Shot {
    const moving = s.medium !== "air" && speed >= (s.medium === "water" ? 0.7 : 2.5);
    const kinds: [Kind, number][] = s.medium === "air"
      ? [["below", 5], ["vista", 4], ["backdrop", 5], ["basket", 4], ["crown", 3], ["alongside", 3], ["heli", 2]]
      : !moving
        ? [["orbit", 3], ["backdrop", 4], ["vista", 3], ["crane", 2], ["kerb", 2], ["follow", 2]]
        : s.medium === "water"
          ? [["trail", 4], ["follow", 4], ["top", 3], ["roadside", 3], ["kerb", 2], ["track", 3], ["lead", 2], ["crane", 4], ["backdrop", 4], ["vista", 3], ["heli", 3]]
          : [["trail", 4], ["follow", 4], ["top", 3], ["heli", 3], ["roadside", 3], ["kerb", 3], ["track", 3], ["lead", 3], ["wheel", 3], ["crane", 4], ["backdrop", 4], ["vista", 3]];
    const found: { shot: Shot; score: number }[] = [];
    for (const [kind, weight] of kinds) {
      if (kind === this.last) continue;
      for (let i = 0; i < 3; i++) {
        const shot = this.make(kind, s, speed);
        if (!shot) continue;
        const score = this.check(shot, s, speed);
        if (score > 0) { found.push({ shot, score: weight * score * rnd(0.6, 1.4) }); break; }
      }
    }
    if (!found.length) return this.fallback(s);
    // moving: after a shot that can't see the way ahead, or with something coming up, one that can
    // (and one of those to start with)
    if (moving && (!this.lastEasy || this.danger < 3.5) && found.some((f) => f.shot.easy)) found.splice(0, found.length, ...found.filter((f) => f.shot.easy));
    found.sort((a, b) => b.score - a.score);
    // mostly the best, sometimes the next one or two, so it doesn't settle into a pattern
    const pick = found[Math.min(found.length - 1, Math.floor(Math.random() ** 2 * 3))];
    return pick.shot;
  }

  /** One shot of a kind, set out for where it's going. Null if there's no such shot here. */
  private make(kind: Kind, s: Subject, speed: number): Shot | null {
    const air = s.medium === "air", L = s.len, W = s.wid, slow = s.medium === "water" ? 3 : 1;
    const shot = (fixed: boolean, at: THREE.Vector3, aim: THREE.Vector3, fov: number, len: number, more: Partial<Shot> = {}): Shot =>
      ({ kind, fixed, at, aim, fov, fovEnd: more.fovEnd ?? fov, roll: 0, spin: 0, len, t: 0, reach: 1e9, blocked: 0, ...more });
    const mid = new THREE.Vector3(0, s.h * 0.45, 0);
    // where it'll be in t seconds, if it keeps going as it is
    const ahead = (t: number) => new THREE.Vector3(s.x + this.vel.x * t, s.y + this.vel.y * t, s.z + this.vel.z * t);
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)), right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    switch (kind) {
      case "roadside": {
        // by the kerb up ahead, at about head height, panning round as it goes by
        const t = rnd(1.4, 2.4) * slow, A = ahead(t), off = side() * (W + rnd(3, 8));
        const at = A.addScaledVector(right, off);
        at.y = this.lowest(at.x, at.z, s) + rnd(0.6, 1.6);
        return shot(true, at, mid, rnd(38, 50), t + rnd(1.2, 2), { reach: 40 + L * 2 });
      }
      case "kerb": {
        // right down on the ground, close to its path: it comes at you and rushes past, towering over
        const t = rnd(1.2, 2.2) * slow, A = ahead(t), off = side() * (W + rnd(1.2, 3));
        const at = A.addScaledVector(right, off);
        at.y = this.lowest(at.x, at.z, s) + rnd(0.18, 0.4);
        return shot(true, at, new THREE.Vector3(0, s.h * 0.6, 0), rnd(58, 70), t + rnd(1.2, 2), { reach: 30 + L * 2 });
      }
      case "crane": {
        // up high, on a crane or a rooftop, looking down on it, slowly closing in
        const t = rnd(1.5, 4), A = ahead(t);
        const at = A.addScaledVector(right, side() * rnd(8, 20)).addScaledVector(fwd, rnd(4, 18));
        at.y = Math.max(this.top(at.x, at.z), s.y) + rnd(8, 20);
        const f = rnd(34, 42);
        return shot(true, at, mid, f, rnd(4.5, 6.5), { fovEnd: f * 0.75, reach: 90 + L * 2 });
      }
      case "track":
        // alongside, as from a tracking car in the next lane, a little behind, so the road ahead shows past it
        return shot(false, new THREE.Vector3(side() * (W + rnd(2.5, 4.5)), rnd(0.8, 1.8), rnd(L * 0.2, L * 1.2)),
          new THREE.Vector3(0, s.h * 0.4, -L - 4), rnd(48, 58), rnd(3, 4.5), { roll: rnd(-0.03, 0.03) });
      case "lead":
        // out in front, low, looking back at it as it chases you down the road
        return shot(false, new THREE.Vector3(side() * rnd(0, 2), rnd(0.6, 1.4), -(L + rnd(4, 8))), mid, rnd(45, 58), rnd(2, 3));
      case "trail":
        // low behind it on a long arm, looking past it down the road ahead
        return shot(false, new THREE.Vector3(side() * rnd(0, 1.8), s.h * 0.6 + rnd(0.8, 2), L + rnd(5, 9)),
          new THREE.Vector3(0, s.h * 0.5, -(L + 12 + speed)), rnd(46, 56), rnd(5, 8), { roll: rnd(-0.02, 0.02) });
      case "follow":
        // a drone following above and behind, the road ahead laid out in front of it
        return shot(false, new THREE.Vector3(side() * rnd(0, 4), rnd(7, 13), L + rnd(9, 16)),
          new THREE.Vector3(0, 0, -(L + 10 + speed * 0.6)), rnd(56, 64), rnd(5, 8));
      case "top":
        // the helicopter, high up and wide, looking down on the streets it's heading into
        return shot(false, new THREE.Vector3(side() * rnd(0, 10), rnd(28, 45), rnd(6, 16)),
          new THREE.Vector3(0, 0, -(L + 4 + speed * 0.4)), rnd(56, 64), rnd(6, 9), { spin: side() * rnd(0, 0.02) });
      case "wheel":
        // down by the back wheel, looking along the side to the road ahead
        return shot(false, new THREE.Vector3(side() * (W + 0.55), rnd(0.25, 0.45), L * 0.75), new THREE.Vector3(0, s.h * 0.35, -L - 12),
          rnd(66, 76), rnd(2.5, 3.8), { roll: rnd(-0.07, 0.07) });
      case "heli": {
        // from the helicopter, high behind and to one side, circling slowly; on the ground, wide, and
        // looking ahead of it rather than at it
        if (air) return shot(false, new THREE.Vector3(side() * rnd(18, 48), rnd(5, 20), rnd(50, 80)), mid, rnd(30, 40), rnd(5, 7), { spin: side() * rnd(0.04, 0.09) });
        return shot(false, new THREE.Vector3(side() * rnd(8, 18), rnd(18, 30), L + rnd(14, 26)), new THREE.Vector3(0, 0, -(L + 10 + speed)),
          rnd(48, 58), rnd(5, 7), { spin: side() * rnd(0.01, 0.03) });
      }
      case "orbit":
        // stood still or nearly: a slow circle round it
        return shot(false, new THREE.Vector3(L * 1.6 + rnd(3, 6), rnd(1.2, 3.5), 0), mid, rnd(40, 50), rnd(6, 8), { spin: side() * rnd(0.2, 0.3) });
      case "backdrop": return this.backdrop(s, speed, mid, shot);
      case "vista": return this.vista(s, speed, mid, shot);
      case "below": {
        // stood in a field or a street under where it's drifting, looking up
        const t = rnd(5, 12), A = ahead(t);
        const at = A.addScaledVector(right, side() * rnd(15, 60)).addScaledVector(fwd, rnd(-10, 25));
        if (this.map.indoors(at.x, at.z)) return null;
        at.y = this.map.ground(at.x, at.z) + 1.7;
        if (s.y - at.y < 25) return null;   // not high enough to look up at
        return shot(true, at, new THREE.Vector3(0, s.h * 0.55, 0), rnd(35, 50), rnd(6, 9), { fovEnd: rnd(28, 34), reach: 900 });
      }
      case "basket":
        // clinging to the outside of the basket, looking up into the envelope over the burner
        return shot(false, new THREE.Vector3(side() * rnd(1.4, 2), rnd(-0.8, 0.2), side() * rnd(1.4, 2)), new THREE.Vector3(0, s.h * 0.62, 0),
          rnd(72, 80), rnd(4, 6), { roll: rnd(-0.12, 0.12) });
      case "crown":
        // over the top of the envelope, looking down past it at the basket and the ground far below
        return shot(false, new THREE.Vector3(side() * rnd(5, 9), s.h + rnd(8, 16), rnd(4, 10)), new THREE.Vector3(0, -6, 0),
          rnd(55, 66), rnd(4.5, 6.5), { spin: side() * rnd(0.05, 0.1) });
      case "alongside":
        // flying beside it, a little below, the envelope against the sky
        return shot(false, new THREE.Vector3(side() * rnd(28, 45), rnd(-8, 4), rnd(-10, 10)), mid, rnd(38, 46), rnd(5, 7), { spin: side() * rnd(0.03, 0.06) });
    }
  }

  /** A landmark behind it, lined up from the far side: the camera's low, so it's set against it. */
  private backdrop(s: Subject, speed: number, mid: THREE.Vector3, shot: (fixed: boolean, at: THREE.Vector3, aim: THREE.Vector3, fov: number, len: number, more?: Partial<Shot>) => Shot): Shot | null {
    const t = speed > 2.5 ? rnd(2, 4) : 0, air = s.medium === "air";
    const A = new THREE.Vector3(s.x + this.vel.x * t, s.y + this.vel.y * t, s.z + this.vel.z * t);
    const near = this.landmarks().filter((m) => { const d = Math.hypot(m.x - A.x, m.z - A.z); return d > (air ? 200 : 90) && d < (air ? 2500 : 1400); });
    if (!near.length) return null;
    const m = near[Math.floor(Math.random() * near.length)];
    const dx = A.x - m.x, dz = A.z - m.z, dh = Math.hypot(dx, dz), ux = dx / dh, uz = dz / dh;
    const back = air ? rnd(70, 150) : rnd(12, 30) + s.len * 1.5, sway = rnd(-0.25, 0.25);
    const at = new THREE.Vector3(A.x + (ux - uz * sway) * back, 0, A.z + (uz + ux * sway) * back);
    const g = this.lowest(at.x, at.z, s);
    // low, so it's set against the landmark (in the air, a little under the balloon)
    at.y = air ? Math.max(g + 2, s.y + rnd(-25, 5)) : g + rnd(0.8, 3);
    // a long lens, to stack the landmark up big behind it
    const dist = Math.hypot(at.x - A.x, at.z - A.z), f = THREE.MathUtils.clamp((Math.atan2(s.h * 2.2 + 8, dist) * 360) / Math.PI, 18, 45);
    return shot(true, at, mid, f * 1.1, rnd(4.5, 6.5), { fovEnd: f, reach: dist * 2.2 + 30, mark: m });
  }

  /** From higher ground across the way, on a long lens: Bath's hills looking down on it. */
  private vista(s: Subject, speed: number, mid: THREE.Vector3, shot: (fixed: boolean, at: THREE.Vector3, aim: THREE.Vector3, fov: number, len: number, more?: Partial<Shot>) => Shot): Shot | null {
    const t = speed > 2.5 ? rnd(2, 5) : 0, air = s.medium === "air";
    const A = new THREE.Vector3(s.x + this.vel.x * t, s.y, s.z + this.vel.z * t);
    let best: THREE.Vector3 | null = null, bestLift = air ? -40 : 6;
    const a0 = Math.random() * Math.PI * 2;
    for (let i = 0; i < 10; i++) {
      const a = a0 + (i / 10) * Math.PI * 2, r = air ? rnd(180, 450) : rnd(60, 220);
      const x = A.x + Math.sin(a) * r, z = A.z + Math.cos(a) * r;
      const g = this.top(x, z), lift = g - s.y;
      if (lift > bestLift && !this.map.indoors(x, z)) { bestLift = lift; best = new THREE.Vector3(x, g + 1.7, z); }
    }
    if (!best) return null;
    const dist = best.distanceTo(A), f = THREE.MathUtils.clamp((Math.atan2(s.h * 3 + 6, dist) * 360) / Math.PI, 9, 30);
    return shot(true, best, mid, f * 1.15, rnd(5, 7), { fovEnd: f, reach: dist * 1.6 + 40 });
  }

  /** Nothing else works (in a tunnel, hemmed in): close behind it, as the chase camera is. */
  private fallback(s: Subject): Shot {
    const back = s.len + 4;
    const at = new THREE.Vector3(0, s.h + 1.5, back);
    // pulled in short of anything behind it
    this.where({ fixed: false, at, spin: 0, t: 0 } as Shot, s, _w);
    const c = this.centre(s), dir = _v.copy(_w).sub(c), dist = dir.length();
    dir.divideScalar(dist || 1);
    const hit = this.map.raycast(c.x, c.y, c.z, dir.x, dir.y, dir.z, dist);
    if (hit) at.multiplyScalar(Math.max(0.3, (hit.dist - 0.4) / dist));
    return { kind: "track", fixed: false, at, aim: new THREE.Vector3(0, s.h * 0.5, -s.len), fov: 60, fovEnd: 60, roll: 0, spin: 0, len: 2, t: 0, reach: 1e9, blocked: -1 };
  }

  /** How good a shot is (0: no good): it must start somewhere sensible and see it, and a fixed one
   *  must still see where it's going. Low angles, a landmark and a long way to look score more. */
  private check(shot: Shot, s: Subject, speed: number): number {
    const at = this.where(shot, s, new THREE.Vector3());
    if (!Number.isFinite(at.x + at.y + at.z) || this.inside(at)) return 0;
    if (at.y < this.lowest(at.x, at.z, s) + 0.15) return 0;
    const c = this.centre(s);
    if (!this.sees(at, c, s)) return 0;
    let score = 1;
    if (shot.fixed) {
      // it must see it most of the way along: halfway through the shot, and as it passes
      for (const t of [shot.len * 0.5, shot.len * 0.8]) {
        _v.set(c.x + this.vel.x * t, c.y + this.vel.y * t, c.z + this.vel.z * t);
        if (!this.sees(at, _v, s)) return 0;
      }
    } else {
      // and a moving one must have room to go along: check the spot it'll be in, further on
      const later = this.where({ ...shot, t: shot.len * 0.6 }, s, new THREE.Vector3());
      later.addScaledVector(this.vel, shot.len * 0.6);
      if (this.inside(later) || later.y < this.lowest(later.x, later.z, s) + 0.15) return 0;
    }
    // looking up at it is dramatic; so's looking down from a great height
    const up = c.y - at.y, flat = Math.hypot(c.x - at.x, c.z - at.z) || 1, angle = Math.atan2(up, flat);
    if (angle > 0.15) score += Math.min(1, angle);
    if (angle < -0.5) score += 0.4;
    // a landmark that can be seen past it
    if (shot.mark) {
      const m = shot.mark, d = at.distanceTo(m);
      _v.copy(m).sub(at).divideScalar(d);
      const hit = this.map.raycast(at.x, at.y, at.z, _v.x, _v.y, _v.z, d);
      if (hit && hit.dist < d * 0.85 && !hit.mover) score *= 0.3;
      else score += 1;
    }
    if (speed < 2.5 && shot.kind === "roadside") score *= 0.2;
    // on the road or the water, a shot you can drive by shows the way ahead: judged as it starts and,
    // for a fixed camera, again as it comes by. The faster it's going (or with something coming up),
    // the more that counts
    if (s.medium !== "air") {
      let a: number;
      this.aimAt(shot, s, _look);
      const now = this.seesAhead(at, _look, shot.fov, s, speed, 0);
      if (shot.fixed) {
        const t = Math.min(shot.len * 0.6, 3), later = this.path(s, speed, t);
        a = (now + this.seesAhead(at, later.setY(s.y + s.h * 0.5), (shot.fov + shot.fovEnd) / 2, s, speed, t)) / 2;
      } else a = now;
      shot.easy = a >= 0.6;
      const need = this.danger < 3.5 ? 1 : THREE.MathUtils.clamp((speed - 4) / 22, 0, 0.85);
      score *= 1 - need + need * (0.12 + 0.88 * a);
    }
    return score;
  }

  // ---- the way ahead ---------------------------------------------------------------------------

  /** How far ahead it needs to see at this speed: a couple of seconds' worth, never less than 12 m. */
  private lookahead(speed: number): number { return Math.max(12, speed * THREE.MathUtils.clamp(1.4 + speed / 25, 1.6, 3)); }

  /** Where it'll be in t seconds, curving as it's turning (at most a quarter turn). */
  private path(s: Subject, speed: number, t: number): THREE.Vector3 {
    const w = this.turn, h0 = this.heading, sweep = THREE.MathUtils.clamp(w * t, -Math.PI / 2, Math.PI / 2);
    if (Math.abs(w) < 0.02 || speed < 0.5) return new THREE.Vector3(s.x - Math.sin(h0) * speed * t, s.y, s.z - Math.cos(h0) * speed * t);
    const r = speed / w;
    return new THREE.Vector3(s.x + r * (Math.cos(h0 + sweep) - Math.cos(h0)), s.y, s.z - r * (Math.sin(h0 + sweep) - Math.sin(h0)));
  }

  /** How much of the way ahead (from t seconds on) a camera at c looking at look with this lens can
   *  see, 0 to 1: three points along it, each in the picture and not hidden behind something. */
  private seesAhead(c: THREE.Vector3, look: THREE.Vector3, fov: number, s: Subject, speed: number, t: number): number {
    if (speed < 1) return 1;
    const T = this.lookahead(speed) / speed, f = _w.copy(look).sub(c);
    if (f.lengthSq() < 1e-4) return 0;
    f.normalize();
    const right = new THREE.Vector3().crossVectors(f, UP), up = new THREE.Vector3();
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
    right.normalize();
    up.crossVectors(right, f);
    const tv = Math.tan((fov * Math.PI) / 360) * 0.85, th = tv * this.aspect;
    let seen = 0;
    for (const k of [0.35, 0.7, 1]) {
      const p = this.path(s, speed, t + T * k);
      p.y = this.lowest(p.x, p.z, s) + 0.8;
      const d = p.sub(c), z = d.dot(f);
      if (z < 1 || Math.abs(d.dot(right) / z) > th || Math.abs(d.dot(up) / z) > tv) continue;
      const dist = d.length();
      d.divideScalar(dist);
      const hit = this.map.raycast(c.x, c.y, c.z, d.x, d.y, d.z, dist - 0.5);
      if (!hit || hit.mover) seen++;
    }
    return seen / 3;
  }

  /** Seconds till it hits something on its path (Infinity: nothing in the way): the traffic and
   *  anything else game.ts says is about, and a wall, building, fence or tree where the road bends. */
  private lookOut(s: Subject, speed: number): number {
    if (speed < 3) return Infinity;
    const T = this.lookahead(speed) / speed * 1.2, steps = 8, reach = s.wid + 1.2;
    let first = Infinity, prev = new THREE.Vector3(s.x, s.y, s.z);
    const near = this.obstacles?.(s.x, s.z, this.lookahead(speed) * 1.3 + s.len) ?? [];
    for (let i = 1; i <= steps && first === Infinity; i++) {
      const t = (T * i) / steps, p = this.path(s, speed, t);
      // anything standing on the path here
      for (const o of near) if (Math.hypot(o.x - p.x, o.z - p.z) < reach + 1) { first = Math.min(first, t); break; }
      // and anything solid across it between here and the last point, at bumper height
      const y = s.y + 0.8, dx = p.x - prev.x, dz = p.z - prev.z, dl = Math.hypot(dx, dz);
      if (first === Infinity && dl > 0.1) {
        const hit = this.map.raycast(prev.x, y, prev.z, dx / dl, 0, dz / dl, dl);
        if (hit && hit.kind !== "ground") first = t;
      }
      prev = p;
    }
    return first;
  }

  // ---- where things are ------------------------------------------------------------------------

  /** Where a shot's camera is this frame. */
  private where(shot: Shot, s: Subject, out: THREE.Vector3): THREE.Vector3 {
    if (shot.fixed) return out.copy(shot.at);
    const a = this.yaw + shot.spin * shot.t, c = Math.cos(a), sn = Math.sin(a);
    const { x, y, z } = shot.at;
    // the subject's frame: x to its right, z behind it
    return out.set(s.x + x * c + z * sn, s.y + y, s.z - x * sn + z * c);
  }

  /** What a shot looks at this frame (a moving one's aim turns with the subject). */
  private aimAt(shot: Shot, s: Subject, out: THREE.Vector3): THREE.Vector3 {
    const a = this.yaw, c = Math.cos(a), sn = Math.sin(a), { x, y, z } = shot.aim;
    out.set(s.x + x * c + z * sn, s.y + y, s.z - x * sn + z * c);
    // a fixed camera leads it a little, as a camera operator does
    if (shot.fixed) out.addScaledVector(this.vel, 0.25);
    // with a landmark behind, it frames the two together: mostly the subject, the landmark rising behind
    if (shot.mark) out.lerp(_v.copy(shot.mark), 0.04);
    return out;
  }

  /** The middle of it, to look at and to check it can be seen. */
  private centre(s: Subject): THREE.Vector3 { return new THREE.Vector3(s.x, s.y + s.h * 0.5, s.z); }

  /** The lowest a camera can go at (x, z): the ground (or a roof under it), and never under the water a boat's on. */
  private lowest(x: number, z: number, s: Subject): number {
    const g = this.map.floor(x, z, s.y + 2);
    return s.medium === "water" ? Math.max(g, s.y + 0.4) : g;
  }

  /** The highest thing to stand on at (x, z): the ground, or a roof. */
  private top(x: number, z: number): number { return this.map.floor(x, z, 5000); }

  /** Is a point inside a building (below its roof)? Up on the roof is fine. */
  private inside(p: THREE.Vector3): boolean {
    if (!this.map.indoors(p.x, p.z)) return false;
    return this.top(p.x, p.z) > p.y - 0.4;
  }

  /** Can a camera at c see the point t, past everything but the subject itself (and other vehicles)? */
  private sees(c: THREE.Vector3, t: THREE.Vector3, s: Subject): boolean {
    _v.copy(t).sub(c);
    const d = _v.length();
    if (d < 0.5) return true;
    _v.divideScalar(d);
    const hit = this.map.raycast(c.x, c.y, c.z, _v.x, _v.y, _v.z, Math.max(0.1, d - Math.min(d * 0.5, s.len + 0.5)));
    return !hit || !!hit.mover;
  }

  /** Bath's set pieces, as scene points near their tops, for lining shots up against. */
  private landmarks(): THREE.Vector3[] {
    if (this.marks) return this.marks;
    const c = this.map.d.centre, out: THREE.Vector3[] = [];
    if (c) {
      const kx = 111320 * Math.cos((c[1] * Math.PI) / 180), ky = 110574;
      for (const sp of SET_PIECES) {
        const x = (sp.at[0] - c[0]) * kx, z = -(sp.at[1] - c[1]) * ky;
        if (Math.abs(x) > 20000 || Math.abs(z) > 20000) continue;   // on another map
        const y = typeof sp.height === "number" ? sp.height - this.map.z0 : this.map.ground(x, z);
        out.push(new THREE.Vector3(x, y + 12, z));
      }
    }
    return (this.marks = out);
  }

  /** Thin black bars top and bottom, as at the pictures. */
  private letterbox(on: boolean) {
    if (!this.bars.length) {
      if (!on) return;
      for (const edge of ["top", "bottom"]) {
        const b = document.createElement("div");
        Object.assign(b.style, { position: "fixed", left: "0", right: "0", [edge]: "0", height: "0", background: "#000", zIndex: "4", pointerEvents: "none", transition: "height 0.6s ease" });
        document.body.appendChild(b);
        this.bars.push(b);
      }
    }
    const h = on ? "7vh" : "0";
    for (const b of this.bars) if (b.style.height !== h) b.style.height = h;
  }

  dispose() { for (const b of this.bars) b.remove(); this.bars = []; }
}
