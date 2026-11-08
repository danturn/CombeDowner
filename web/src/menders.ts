// The menders: an old couple who come and mend a hedge or fence you've driven through (gaps.ts). A
// little before the five minutes are up they come walking up, slowly, side by side, and set to work
// either side of the hole, him with a hammer and her with the twine, grumbling all the while: drivers
// today, no respect, and it's all those video games. When it's whole again they walk off the way they
// came and fade away once they're on their way, the way the naughty boys do, only at an old person's
// walk and quite content. You can't hurt them: shoot them and they've something to say about that too.
// They stand in your way like anyone else, a car included.
//
// Who decides what: nobody. Every player knows of the same gaps (gaps.ts), and each sends their own
// couple round by their own clock, so nothing more goes over the network. What they do and say is
// each player's own, and only ever for show.
import * as THREE from "three";
import { model, type Part } from "./furniture";
import type { GameMap } from "./map";
import { speechBubble } from "./naughtyboys";
import * as Posh from "./posh";
import * as SFX from "./audio";
import { gaps, mendGaps, MEND_SECS, type Gap } from "./gaps";

const WORK = 40;        // seconds they spend mending before it's whole again
const PACE = 0.75;      // an old couple's walk, m/s
const COME = 16;        // how far off they come from
const OUT = 14;         // seconds they walk off for, fading over the last FADE
const FADE = 4;
const HEAR = 30;        // they talk while you're this close
const SEE = 250;        // and are drawn this close
const SAME_JOB = 10;    // a gap this close to one they're on, they take on too
const BUBBLE = 4.2;
const HIM = { voice: 0, pitch: 0.8, rate: 0.82 };   // gruff and slow
const HER = { voice: 1, pitch: 1.0, rate: 0.85 };

// {it}: the hedge or the fence
const HIS = [
  "Look at this. Look at it. Thirty years that {it}'s stood.",
  "Drivers today. No respect. None.",
  "In my day you'd get a clip round the ear for this.",
  "It's those video games. Grand Theft whatsit.",
  "They think it's all a game. Well it isn't. It's my {it}.",
  "Pass us the twine, Maureen.",
  "Straight through it. Didn't even stop.",
  "I blame the parents. And the PlayStations.",
  "Nobody's got any respect any more. Nobody.",
  "I'm writing to the Chronicle about this.",
  "Hold that end. No, your other end.",
  "Do they even have to pass a test now? I doubt it.",
  "Twenty miles an hour. It's not difficult, is it?",
  "Back in my day we had conkers. Conkers!",
  "They'd never have got away with this in the Wing Commander's day.",
  "Joystick this, joystick that. Hands on the wheel!",
  "Third time this year. Third time.",
];
const HERS = [
  "Oh, Derek, look what they've done.",
  "It's those computer games, I've said it before.",
  "Our Kevin's boy plays them. Shooting all day. Shooting!",
  "They don't look where they're going. All on their phones.",
  "Mind your back, Derek.",
  "Nobody says sorry any more, do they?",
  "I'll put the kettle on when we're done.",
  "Honestly. Some people.",
  "They want locking up, the lot of them.",
  "It wasn't like this when we moved here.",
  "Respect. That's what's gone. Respect.",
  "Mrs Pritchard's fence went last month. Same thing.",
  "Hold still, Derek, I'm tying it.",
  "They learn it off the telly. And the games. Blowing things up.",
  "I've had this {it} since before decimalisation.",
];
const COMING = ["Here we go again.", "Come on, Maureen. Bring the bag.", "Oh, not again.", "Who's done it this time?"];
const DONE = ["There. Good as new.", "Come on then, Maureen. Kettle.", "Same time next week, I expect.", "That'll hold. Till the next one."];
const OUCH = [
  "Oh, very clever.",
  "Is that what they teach you on those games?",
  "Derek, they're shooting at us now!",
  "You'll have someone's eye out with that.",
  "I'm phoning the council. And your mother.",
  "We don't feel a thing, you know. We're from Combe Down.",
  "Go on, shoot the pensioners. Very brave.",
];

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (r: number, h: number, seg = 10) => new THREE.CylinderGeometry(r, r, h, seg);

function joint(mat: THREE.Material, x: number, y: number, parts: Part[]): THREE.Group {
  const j = new THREE.Group();
  j.position.set(x, y, 0);
  if (parts.length) j.add(new THREE.Mesh(model(parts), mat));
  return j;
}

/** One of them: a little stooped, in their outdoor things. He faces -z. */
class Old {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private legs: THREE.Group[] = [];
  private arms: THREE.Group[] = [];
  private fore: THREE.Group[] = [];
  private mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  private bubble: THREE.Sprite | null = null;
  private bubbleT = 0;
  private phase = Math.random() * 6;

  constructor(readonly her: boolean) {
    const SKIN = "#e8c0a4", m = this.mat;
    if (!her) {
      // Derek: flat cap, tweed jacket, grey slacks, glasses
      const TWEED = "#6d5a3e", SLACKS = "#6c6e70", SHOES = "#3a2618", CAP = "#5a4c38", HAIR = "#d8d6d0";
      this.body.add(new THREE.Mesh(model([
        [box(0.38, 0.16, 0.22), SLACKS, 0, 0.88, 0],
        [box(0.42, 0.5, 0.25), TWEED, 0, 1.2, 0], [box(0.16, 0.3, 0.02), "#d9d4c4", 0, 1.32, -0.126], [box(0.05, 0.24, 0.025), "#7a2c2c", 0, 1.3, -0.13],   // shirt and tie
        [box(0.1, 0.07, 0.1), SKIN, 0, 1.48, -0.01], [box(0.23, 0.25, 0.24), SKIN, 0, 1.63, -0.02],
        [box(0.24, 0.08, 0.2), HAIR, 0, 1.66, 0.04], [box(0.27, 0.06, 0.3), CAP, 0, 1.77, -0.03], [box(0.22, 0.03, 0.1), CAP, 0, 1.75, -0.2],   // the cap and its peak
        [box(0.2, 0.05, 0.02), "#2a2a2a", 0, 1.65, -0.145],   // glasses
        [box(0.08, 0.02, 0.02), "#9a6a5a", 0, 1.56, -0.142],
      ]), m));
      for (const side of [-1, 1]) {
        const leg = joint(m, side * 0.1, 0.84, [[box(0.15, 0.78, 0.17), SLACKS, 0, -0.41, 0], [box(0.14, 0.07, 0.27), SHOES, 0, -0.81, -0.04]]);
        const arm = joint(m, side * 0.26, 1.41, [[box(0.12, 0.3, 0.14), TWEED, 0, -0.14, 0]]);
        const hand: Part[] = [[box(0.1, 0.26, 0.12), TWEED, 0, -0.12, 0], [box(0.08, 0.09, 0.08), SKIN, 0, -0.29, 0]];
        if (side > 0) hand.push([cyl(0.015, 0.28), "#7a5530", 0, -0.33, -0.08, Math.PI / 2], [box(0.05, 0.05, 0.12), "#4a4c4e", 0, -0.33, -0.2]);   // a hammer
        const fore = joint(m, 0, -0.28, hand);
        arm.add(fore);
        this.legs.push(leg); this.arms.push(arm); this.fore.push(fore);
        this.body.add(leg, arm);
      }
    } else {
      // Maureen: a lilac perm, a beige mac, a tweed skirt and her handbag
      const MAC = "#c9b48e", SKIRT = "#7a5866", TIGHTS = "#d2b49a", SHOES = "#2c2020", HAIR = "#cbbfd8";
      this.body.add(new THREE.Mesh(model([
        [box(0.4, 0.42, 0.26), SKIRT, 0, 0.76, 0],
        [box(0.4, 0.62, 0.25), MAC, 0, 1.12, 0], [box(0.42, 0.04, 0.26), "#9a8566", 0, 0.99, 0],   // the mac and its belt
        [box(0.1, 0.07, 0.1), SKIN, 0, 1.45, -0.01], [box(0.22, 0.24, 0.23), SKIN, 0, 1.6, -0.02],
        [box(0.28, 0.16, 0.27), HAIR, 0, 1.72, 0.02], [box(0.26, 0.12, 0.06), HAIR, 0, 1.62, 0.12],   // the perm
        [box(0.19, 0.045, 0.02), "#7a5a8a", 0, 1.62, -0.14],   // glasses
        [box(0.07, 0.02, 0.02), "#b06a6a", 0, 1.53, -0.137],
      ]), m));
      for (const side of [-1, 1]) {
        const leg = joint(m, side * 0.09, 0.62, [[box(0.11, 0.58, 0.12), TIGHTS, 0, -0.3, 0], [box(0.11, 0.06, 0.22), SHOES, 0, -0.6, -0.03]]);
        const arm = joint(m, side * 0.24, 1.37, [[box(0.11, 0.3, 0.13), MAC, 0, -0.14, 0]]);
        const hand: Part[] = [[box(0.1, 0.26, 0.11), MAC, 0, -0.12, 0], [box(0.08, 0.08, 0.08), SKIN, 0, -0.29, 0]];
        if (side < 0) hand.push([box(0.26, 0.2, 0.09), "#3a2a22", 0, -0.42, 0], [box(0.02, 0.1, 0.02), "#3a2a22", 0, -0.29, 0]);   // her handbag
        const fore = joint(m, 0, -0.28, hand);
        arm.add(fore);
        this.legs.push(leg); this.arms.push(arm); this.fore.push(fore);
        this.body.add(leg, arm);
      }
    }
    this.body.rotation.x = 0.06;   // a little stooped
    this.body.traverse((o) => { o.castShadow = true; });
    this.root.add(this.body);
  }

  say(text: string) {
    this.unsay();
    this.bubble = speechBubble(text);
    this.bubble.position.y = this.her ? 2.0 : 2.1;
    this.root.add(this.bubble);
    this.bubbleT = BUBBLE;
  }

  unsay() {
    if (!this.bubble) return;
    this.root.remove(this.bubble);
    this.bubble.material.map?.dispose();
    this.bubble.material.dispose();
    this.bubble = null;
  }

  /** How solid they are, 1 down to 0 as they fade away. */
  fade(a: number) {
    this.mat.transparent = a < 1;
    this.mat.opacity = Math.max(0, a);
    this.mat.depthWrite = a >= 1;
    this.body.traverse((o) => { o.castShadow = a >= 1; });
  }

  /** Stand them at (x, y, z) facing yaw, walking at speed or working (him hammering, her tying), t: seconds. Returns true on a hammer blow. */
  pose(x: number, y: number, z: number, yaw: number, speed: number, working: boolean, t: number, dt: number): boolean {
    this.root.position.set(x, y, z);
    this.root.rotation.y = yaw;
    if (this.bubble) {
      this.bubbleT -= dt;
      if (this.bubbleT <= 0) this.unsay();
      else this.bubble.material.opacity = Math.min(1, this.bubbleT / 0.4);
    }
    this.phase += dt * speed * 4.6;
    const swing = Math.sin(this.phase) * Math.min(0.45, speed * 0.55);   // short, careful steps
    let want: number[][], blow = false;
    if (working && !this.her) {
      // knocking a post back in: the right arm up and down, a blow every 0.9 s or so
      const beat = (t * 1.1) % 1, up = beat < 0.7 ? beat / 0.7 : 1 - (beat - 0.7) / 0.3;
      blow = beat < 0.7 && (beat + dt * 1.1) >= 0.7;
      want = [[0.5, -0.1, 0.9, 0], [0.6 + up * 1.3, 0.05, 0.3 + up * 0.6, 0]];
    } else if (working) {
      // tying the twine: both hands out in front, working away
      const w = Math.sin(t * 5) * 0.15;
      want = [[0.9 + w, 0.15, 0.7, 0], [0.9 - w, -0.15, 0.7, 0]];
    } else want = [[-swing * 0.7, -0.06, 0.35, 0], [swing * 0.7, 0.06, 0.35, 0]];
    const k = Math.min(1, dt * 8);
    for (let s = 0; s < 2; s++) {
      const [ax, az, fx, fz] = want[s], a = this.arms[s], f = this.fore[s];
      a.rotation.x += (ax - a.rotation.x) * k; a.rotation.z += (az - a.rotation.z) * k;
      f.rotation.x += (fx - f.rotation.x) * k; f.rotation.z += (fz - f.rotation.z) * k;
    }
    this.legs[0].rotation.x = swing; this.legs[1].rotation.x = -swing;
    this.body.position.y = Math.abs(Math.sin(this.phase)) * 0.02 * Math.min(1, speed);
    this.body.rotation.x = working ? 0.25 : 0.06;   // bent to it
    return blow;
  }

  dispose() {
    this.unsay();
    this.root.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
    this.mat.dispose();
  }
}

/** A couple on a job: the gaps they're mending, where they work, the way they came and when it's done. */
interface Couple {
  him: Old; her: Old; jobs: Gap[];
  x: number; z: number;     // the middle of the hole they're mending
  ux: number; uz: number;   // which way the hedge runs
  nx: number; nz: number;   // the side they work from, out from it
  fx: number; fz: number;   // where they came from (and go back to)
  end: number;              // when it's whole again (s)
  out: number;              // when they set off home, once it's done (s)
  talkT: number; turn: boolean; said: boolean; grumbles: string[][];
  bx: number; bz: number;   // where they are now (the middle between them)
}

export class Menders {
  private couples: Couple[] = [];
  private taken = new Set<Gap>();

  constructor(private map: GameMap, private scene: THREE.Scene) {
    map.pushers.push(this.pusher);
  }

  /** Mend what's due and keep the couples going. now: seconds (performance.now's); (px, pz): where you are. */
  update(dt: number, now: number, px: number, pz: number) {
    mendGaps(now);
    for (const k of this.taken) if (!gaps().includes(k)) this.taken.delete(k);
    // a couple sets off for each gap in time to get there and mend it, or one already on a gap nearby takes it on too
    for (const g of gaps()) {
      if (this.taken.has(g) || now < g.at + MEND_SECS - WORK - COME / PACE) continue;
      this.taken.add(g);
      const near = this.couples.find((c) => now < c.end && Math.hypot(c.x - g.x, c.z - g.z) < SAME_JOB);
      if (near) { near.jobs.push(g); near.end = Math.max(near.end, g.at + MEND_SECS); continue; }
      this.couples.push(this.setOff(g));
    }
    for (const c of [...this.couples]) this.step(c, dt, now, px, pz);
  }

  /** A couple setting off for gap g: from somewhere they can walk straight to it from. */
  private setOff(g: Gap): Couple {
    const him = new Old(false), her = new Old(true);
    this.scene.add(him.root, her.root);
    // try the two sides, straight out and slantwise, for a clear walk in
    let pick: number[] | null = null;
    for (const a of [0, 0.5, -0.5, 1, -1]) for (const side of [1, -1]) {
      if (pick) break;
      const nx = -g.uz * side, nz = g.ux * side, c = Math.cos(a), s = Math.sin(a);
      const dx = nx * c + g.ux * s, dz = nz * c + g.uz * s;
      let clear = true;
      for (let d = 2.5; d <= COME && clear; d += 1.5) clear = !this.map.blocked(g.x + dx * d, g.z + dz * d, 0.35);
      if (clear) pick = [nx, nz, g.x + dx * COME, g.z + dz * COME];
    }
    // nowhere clear: they're just there, on whichever side, as if from round the corner
    pick ??= [-g.uz, g.ux, g.x - g.uz * 1.5, g.z + g.ux * 1.5];
    const [nx, nz, fx, fz] = pick, end = g.at + MEND_SECS;
    return { him, her, jobs: [g], x: g.x, z: g.z, ux: g.ux, uz: g.uz, nx, nz, fx, fz, end, out: end, talkT: 0, turn: Math.random() < 0.5, said: false,
      grumbles: [[], []], bx: fx, bz: fz };
  }

  private step(c: Couple, dt: number, now: number, px: number, pz: number) {
    const far = Math.hypot(px - c.bx, pz - c.bz), it = (c.jobs[0]?.leafy ?? true) ? "hedge" : "fence";
    // where they're each headed: either side of the hole, a step back from it
    const spot = (s: number) => [c.x + c.ux * s * 0.7 + c.nx * 0.85, c.z + c.uz * s * 0.7 + c.nz * 0.85];
    const [hx, hz] = spot(-1), [wx, wz] = spot(1);
    let phase: "in" | "work" | "out";
    const left = c.end - now;
    if (left > WORK) phase = "in";
    else if (left > 0) phase = "work";
    else phase = "out";
    if (phase === "out" && c.out === c.end) { c.out = now; this.say(c, DONE, false, far, it); }
    // the middle between them: walking in, at work, or walking off home
    let speed = 0, yaw: number;
    if (phase === "in") {
      const tx = (hx + wx) / 2, tz = (hz + wz) / 2, d = Math.hypot(tx - c.bx, tz - c.bz), step = Math.min(d, PACE * dt);
      if (d > 0.05) { c.bx += (tx - c.bx) / d * step; c.bz += (tz - c.bz) / d * step; speed = PACE; }
      yaw = Math.atan2(-(tx - c.bx), -(tz - c.bz));
      if (d <= 0.05) yaw = Math.atan2(c.nx, c.nz);   // there early: they stand and look at it
    } else if (phase === "work") {
      c.bx = (hx + wx) / 2; c.bz = (hz + wz) / 2;
      yaw = Math.atan2(c.nx, c.nz);   // facing the hedge (they face -z, and the hedge is back along -n)
    } else {
      const dx = c.fx - c.x, dz = c.fz - c.z, l = Math.hypot(dx, dz) || 1;
      c.bx += dx / l * PACE * dt; c.bz += dz / l * PACE * dt; speed = PACE;
      yaw = Math.atan2(-dx / l, -dz / l);
    }
    // side by side: him on the left of the way they face, her on the right
    const sx = Math.cos(yaw) * 0.38, sz = -Math.sin(yaw) * 0.38;
    const at = phase === "work" ? [[hx, hz], [wx, wz]] : [[c.bx - sx, c.bz - sz], [c.bx + sx, c.bz + sz]];
    const show = far < SEE;
    c.him.root.visible = c.her.root.visible = show;
    if (show) {
      const t = now;
      const blow = c.him.pose(at[0][0], this.map.ground(at[0][0], at[0][1]), at[0][1], yaw, speed, phase === "work", t, dt);
      c.her.pose(at[1][0], this.map.ground(at[1][0], at[1][1]), at[1][1], yaw, speed, phase === "work", t, dt);
      if (blow && far < 40) SFX.mendTap(far);
      const fade = phase === "out" ? Math.min(1, (OUT - (now - c.out)) / FADE) : 1;
      c.him.fade(fade); c.her.fade(fade);
    }
    // grumbling, turn and turn about, while you're about
    c.talkT -= dt;
    if (far < HEAR && c.talkT <= 0 && phase !== "out") {
      if (!c.said) { c.said = true; this.say(c, COMING, false, far, it); }
      else { c.turn = !c.turn; this.say(c, c.turn ? HERS : HIS, c.turn, far, it); }
      c.talkT = BUBBLE + 1 + Math.random() * 3;
    }
    if (phase === "out" && now - c.out > OUT) {
      this.scene.remove(c.him.root, c.her.root);
      c.him.dispose(); c.her.dispose();
      this.couples.splice(this.couples.indexOf(c), 1);
    }
  }

  private say(c: Couple, pool: string[], her: boolean, far: number, it: string) {
    const hand = pool === HIS ? c.grumbles[0] : pool === HERS ? c.grumbles[1] : [];
    if (!hand.length) hand.push(...[...pool].sort(() => Math.random() - 0.5));
    const line = hand.pop()!.replace("{it}", it);
    (her ? c.her : c.him).say(line);
    Posh.speak(line, her ? 71 : 70, far, her ? HER : HIM, her);
  }

  /** Where a round along the ray from o (unit d) hits one of them, if it does before maxD. */
  hit(o: THREE.Vector3, d: THREE.Vector3, maxD: number): { dist: number; c: Couple; her: boolean } | null {
    let best: { dist: number; c: Couple; her: boolean } | null = null;
    for (const c of this.couples) for (const who of [c.him, c.her]) {
      if (!who.root.visible) continue;
      const p = who.root.position, ox = o.x - p.x, oz = o.z - p.z, a = d.x * d.x + d.z * d.z;
      if (a < 1e-9) continue;
      const b = ox * d.x + oz * d.z, cc = ox * ox + oz * oz - 0.28 * 0.28, disc = b * b - a * cc;
      if (disc < 0) continue;
      const t = (-b - Math.sqrt(disc)) / a;
      if (t < 0 || t > (best?.dist ?? maxD)) continue;
      const y = o.y + d.y * t - p.y;
      if (y >= 0 && y <= 1.85) best = { dist: t, c, her: who.her };
    }
    return best;
  }

  /** Someone's shot one of them, or thumped them. They're fine, but they've something to say about it. */
  ouch(h: { c: Couple; her: boolean }, far: number) {
    const line = OUCH[Math.floor(Math.random() * OUCH.length)];
    (h.her ? h.c.her : h.c.him).say(line);
    Posh.speak(line, h.her ? 71 : 70, far, h.her ? HER : HIM, h.her);
    h.c.talkT = BUBBLE + 2;
  }

  /** They stand in the way like anyone else: walkers and cars bump off them. */
  private pusher = (pos: { x: number; z: number }, y: number, r: number): number => {
    let block = -Infinity;
    for (const c of this.couples) for (const who of [c.him, c.her]) {
      if (!who.root.visible) continue;
      const p = who.root.position;
      if (p.y > y + 1.7 || p.y + 1.8 < y + 0.45) continue;
      const dx = pos.x - p.x, dz = pos.z - p.z, d = Math.hypot(dx, dz), m = r + 0.3;
      if (d >= m || d < 1e-6) continue;
      pos.x = p.x + (dx / d) * m; pos.z = p.z + (dz / d) * m;
      block = Math.max(block, 1.8);
    }
    return block;
  };
}
