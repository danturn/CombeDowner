// The Balloon Tightrope, a team challenge (challenges.ts): two hot air balloons go up over the
// biggest open park on the map with a rope tied between their baskets, and everyone else walks
// across it, one at a time, while the rest watch. A and D (or the stick) lean you against a sway
// that builds the further out you get, gusts shove you, W edges you forward, and standing still
// steadies you a little. Lean too far and you're off: a long tumble into the grass, arms going,
// and you land in a heap, unhurt. The team shares its lives (hearts on the card: three, and one
// more for every two walkers past the first, so a big team has a little more room but each fall
// still hurts everyone). A fall costs one: the faller is put back in the first basket to go again
// after the others, and the rest carry on. With none left the balloons come down, a fail card goes
// up, and it starts again from scratch. It's won when every walker has got across.
//
// One player flies each balloon (with two players, one flies and the crew hold the other steady;
// alone, the crew fly both). The pilots keep the rope's span right with W and S: too far apart and
// it snaps taut and shakes, too close and it sags and wobbles. The wind drifts the pair along and
// worries at each balloon on its own. More players means more walkers, a longer rope, a higher
// climb and gustier wind.
//
// Who decides what: the host says when everyone's gathered and who does what ("go"), runs the
// balloons nobody's flying and the drift of the pair ("b", "rig"), says whose turn it is, keeps the
// team's lives ("lv" when one's lost, "back" when a faller's put back in the queue), and says when
// it's won or out of lives ("down"). Each pilot flies their own balloon and says where it is ("b"). The walker
// decides their own balance and fall, like their own movement, and says how they're doing ("w"),
// when they reach the far basket ("over") and when they come off ("fell"). All through "qe".
// Until someone takes it on, the two balloons stand ready on the grass with the rope slung between
// their baskets, the same pair the challenge then uses, built on each screen from the day alone.
import * as THREE from "three";
import * as SFX from "./audio";
import { View as BalloonView, BALLOON_DESIGNS, wind } from "./balloons";
import { registerChallenge, type ChallengeSpot } from "./challenges";
import { dayNumber } from "./daylight";
import { model } from "./furniture";
import { keyLabel } from "./gamepad";
import type { GameMap } from "./map";
import { openGround } from "./oddments";
import { hearts, missionEnd } from "./missionscreens";
import { hash, rng, shuffled, esc, type Card, type Job, type Perch, type QuestWorld, type Waiting } from "./quests";

const COLOUR = "#e8743b";
const GATHER = 40;             // how near the middle counts as being there
const WAIT = 40;               // seconds after the first arrives before it goes up without the rest
const RISE = 14, DOWN = 8;     // seconds going up, and coming down at the end
const HALF = 0.75;             // half a basket's width (balloons.ts)
const RIM = 1.1;               // the rope's tied to the basket's rim, this high
const TIP = 0.8;               // lean further than this (radians) and you're off
const FALL_G = 6.5;            // a slow, long tumble: the crowd want to see it
const SEND = 0.1;
const SEG = 28;                // pieces the rope's drawn in
const CLEAR = 30;              // open ground round the middle, for the baskets on the grass
const ACC = 0.35, DRAG = 0.4;  // a pilot's pull on their end of the rope, and the air's drag on it

/** The rope's length and height, and how gusty, for this many walkers. */
const ropeFor = (n: number) => Math.min(42, 22 + 4 * (n - 1));
const heightFor = (n: number) => Math.min(70, 55 + 3 * (n - 1));
const gustFor = (n: number) => 1 + 0.2 * (n - 1);
/** The team's lives for this many walkers: three, and one more for every two walkers past the first. */
const livesFor = (n: number) => 3 + Math.floor((Math.max(1, n) - 1) / 2);
const BACK_IN = 4.5;           // seconds in the grass before a faller's back in the first basket

const smooth = (t: number) => { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u); };
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const touchy = () => typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;

// ---- where it goes ------------------------------------------------------------------------------

function ringArea(r: number[][]) {
  let s = 0;
  for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; s += a[0] * b[1] - b[0] * a[1]; }
  return Math.abs(s / 2);
}
function inRing(r: number[][], x: number, y: number) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function segDist(px: number, py: number, a: number[], b: number[]) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy;
  const t = l ? clamp(((px - a[0]) * dx + (py - a[1]) * dy) / l, 0, 1) : 0;
  return Math.hypot(px - a[0] - dx * t, py - a[1] - dy * t);
}

const PARK = /\bpark\b/i;
const OPEN = /\b(common|green|meadows?|recreation|playing fields?|fields?|downs|lawns?)\b/i;
const NOT_OPEN = /\b(car park|business|retail|industrial|trading|holiday|caravan|hospital|cemetery|dock|basin|marina|stadium|yacht)\b/i;
const PATHS = new Set(["footway", "steps", "cycleway", "path", "pedestrian", "bridleway", "track"]);

/** The biggest open park on the map with a stretch of flat, treeless grass in it for the two baskets.
 *  Data coordinates; null if there's none. */
function findField(map: GameMap): { x: number; y: number; ax: number; ay: number; n: string } | null {
  const D = map.d, W = map.wide;
  const home = openGround(map);
  const ground = (x: number, y: number) => (W ? W.ground(x, -y) : map.ground(x, -y));
  const kindAt = (x: number, y: number) => {
    if (!W) return 0;
    const i = Math.round((x - W.x0) / W.dx), j = Math.round((y - W.y0) / W.dx);
    return i < 0 || j < 0 || i >= W.nx || j >= W.ny ? 0 : W.k[j * W.nx + i];
  };
  const trees = (x: number, y: number, r: number) =>
    (W ? W.treesNear(x, y, r).length : 0) + D.tr.filter((t) => Math.hypot(t[0] - x, t[1] - y) < r).length;
  const seen = new Set<string>();
  const places = [...(D.pl ?? []), ...(W?.d.pl ?? [])].filter((p) => p.n && p.r.length >= 3 && !NOT_OPEN.test(p.n)).map((p) => {
    const a = ringArea(p.r);
    const cx = p.r.reduce((s, q) => s + q[0], 0) / p.r.length, cy = p.r.reduce((s, q) => s + q[1], 0) / p.r.length;
    return { p, a, cx, cy, park: PARK.test(p.n) ? 2 : OPEN.test(p.n) ? 1 : 0 };
  }).filter((o) => {
    const key = `${o.p.n}|${Math.round(o.a)}`;
    if (o.a < 20000 || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => b.park - a.park || b.a - a.a || a.p.n.localeCompare(b.p.n));
  const roads = [...D.rd, ...(W?.rd ?? [])].filter((r) => !PATHS.has(r.c));
  for (const { p, cx, cy } of places.slice(0, 30)) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of p.r) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const segs: number[][] = [];
    for (const rd of roads) {
      const half = (rd.w ?? 6) / 2 + 18;
      for (let i = 1; i < rd.p.length; i++) {
        const a = rd.p[i - 1], b = rd.p[i];
        if (Math.max(a[0], b[0]) < x0 - 60 || Math.min(a[0], b[0]) > x1 + 60 || Math.max(a[1], b[1]) < y0 - 60 || Math.min(a[1], b[1]) > y1 + 60) continue;
        segs.push([a[0], a[1], b[0], b[1], half]);
      }
    }
    const water = [...D.wp, ...(W?.wp ?? [])].filter((w) => w.r[0]?.length);
    let best: { x: number; y: number; t: number; d: number } | null = null;
    for (let y = y0 + 15; y < y1; y += 12) for (let x = x0 + 15; x < x1; x += 12) {
      if (!inRing(p.r, x, y)) continue;
      if (map.fieldEdge(x, -y) < 150) continue;
      if (home && Math.hypot(home.x - x, home.y - y) < 90) continue;
      const k = kindAt(x, y);
      if (k !== 0 && k !== 1 && k !== 3) continue;
      if (W?.buildingsNear(x, y, CLEAR).length) continue;
      if (D.bl.some((b) => b.r[0]?.some((q) => Math.hypot(q[0] - x, q[1] - y) < CLEAR) || (b.r[0] && inRing(b.r[0], x, y)))) continue;
      if (segs.some((q) => segDist(x, y, [q[0], q[1]], [q[2], q[3]]) < q[4])) continue;
      if (water.some((w) => inRing(w.r[0], x, y) || w.r[0].some((q) => Math.hypot(q[0] - x, q[1] - y) < CLEAR))) continue;
      const g = [0, 1, 2, 3, 4, 5, 6, 7].map((n) => ground(x + Math.cos(n * 0.785) * 22, y + Math.sin(n * 0.785) * 22));
      if (Math.max(...g) - Math.min(...g) > 5) continue;
      const t = trees(x, y, 22), d = Math.hypot(x - cx, y - cy);
      if (t > 3) continue;
      if (!best || t < best.t || (t === best.t && d < best.d)) best = { x, y, t, d };
    }
    if (!best) continue;
    // the rope runs the way with the fewest trees by its two ends
    let ax = 1, ay = 0, fewest = Infinity;
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 8, cx2 = Math.cos(a), cy2 = Math.sin(a);
      const n = trees(best.x + cx2 * 24, best.y + cy2 * 24, 12) + trees(best.x - cx2 * 24, best.y - cy2 * 24, 12);
      if (n < fewest) { fewest = n; ax = cx2; ay = cy2; }
    }
    return { x: best.x, y: best.y, ax, ay, n: p.n };
  }
  return null;
}

// ---- the look ----------------------------------------------------------------------------------

let poleGeo: THREE.BufferGeometry | null = null;
function pole(): THREE.Mesh {
  poleGeo ??= model([
    [new THREE.CylinderGeometry(0.025, 0.025, 4, 6).rotateZ(Math.PI / 2), "#6b5a44", 0, 0, 0],
    [new THREE.CylinderGeometry(0.04, 0.04, 0.3, 6).rotateZ(Math.PI / 2), "#d8262e", 1.9, 0, 0],
    [new THREE.CylinderGeometry(0.04, 0.04, 0.3, 6).rotateZ(Math.PI / 2), "#d8262e", -1.9, 0, 0],
  ]);
  return new THREE.Mesh(poleGeo, new THREE.MeshLambertMaterial({ vertexColors: true }));
}

/** Where people stand in a basket, along the rope (+ away from it) and across: the pilot at the back. */
const STANDS: [number, number][] = [[0.4, 0], [-0.32, -0.34], [-0.32, 0.34], [0.05, -0.42], [0.05, 0.42], [-0.4, 0], [0.4, -0.4], [0.4, 0.4]];

// ---- the challenge -----------------------------------------------------------------------------

/** Where the pair goes from its spots: the middle, the way along the rope and across it. */
function rig(spots: ChallengeSpot[]) {
  const [, sa, sb] = spots.length >= 3 ? spots : [spots[0], { ...spots[0], x: spots[0].x - 12 }, { ...spots[0], x: spots[0].x + 12 }];
  const cx0 = (sa.x + sb.x) / 2, cz0 = (sa.z + sb.z) / 2;
  const al = Math.hypot(sb.x - sa.x, sb.z - sa.z) || 1, ax = (sb.x - sa.x) / al, az = (sb.z - sa.z) / al;
  return { cx0, cz0, ax, az, px: -az, pz: ax, yaw: Math.atan2(ax, az) };
}

/** The pair ready on the grass, the rope slung between them as it hangs before they go up, till someone takes it on. */
function waitingPair(seed: number, spots: ChallengeSpot[], w: QuestWorld): Waiting {
  const map = w.map, { cx0, cz0, ax, az, yaw } = rig(spots), R = ropeFor(1);
  const designs = shuffled(rng(seed), Array.from({ length: BALLOON_DESIGNS }, (_, k) => k)).slice(0, 2);
  const views = designs.map((d) => new BalloonView(w.scene, d));
  const at = [0, 1].map((i) => {
    const d = (R * 0.4925 + HALF) * (i ? 1 : -1), x = cx0 + ax * d, z = cz0 + az * d;
    return { x, y: map.ground(x, z), z };
  });
  const rope = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 5), new THREE.MeshLambertMaterial({ color: "#e4d6b4" }), SEG);
  {
    const e0 = { x: at[0].x + ax * HALF, y: at[0].y + RIM, z: at[0].z + az * HALF }, e1 = { x: at[1].x - ax * HALF, y: at[1].y + RIM, z: at[1].z - az * HALF };
    const sag = R * 0.55 * Math.sqrt(0.015) + 0.05;
    const pt = (f: number, o: THREE.Vector3) => {
      o.set(e0.x + (e1.x - e0.x) * f, e0.y + (e1.y - e0.y) * f - sag * 4 * f * (1 - f), e0.z + (e1.z - e0.z) * f);
      o.y = Math.max(o.y, map.ground(o.x, o.z) + 0.04);
      return o;
    };
    const a = new THREE.Vector3(), b = new THREE.Vector3(), m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3();
    for (let i = 0; i < SEG; i++) {
      pt(i / SEG, a); pt((i + 1) / SEG, b);
      const len = a.distanceTo(b);
      b.sub(a); q.setFromUnitVectors(up, b.clone().normalize());
      rope.setMatrixAt(i, m.compose(a.addScaledVector(b, 0.5), q, sc.set(1, len, 1)));
    }
  }
  rope.frustumCulled = false;
  w.scene.add(rope);
  let t = 0;
  return {
    // anywhere along the line between the baskets
    dist(x, z) {
      const dx = at[1].x - at[0].x, dz = at[1].z - at[0].z, l = dx * dx + dz * dz || 1;
      const f = clamp(((x - at[0].x) * dx + (z - at[0].z) * dz) / l, 0, 1);
      return Math.max(0, Math.hypot(x - at[0].x - dx * f, z - at[0].z - dz * f) - 1);
    },
    update(dt) {
      t += dt;
      views.forEach((v, i) => v.pose(at[i].x, at[i].y, at[i].z, yaw + (i ? Math.PI : 0), 1, (t + i * 4.3) % 11 < 0.8, dt));
    },
    dispose() {
      for (const v of views) v.dispose();
      rope.removeFromParent(); rope.geometry.dispose(); (rope.material as THREE.Material).dispose();
    },
  };
}

type Phase = "gather" | "rise" | "cross" | "down";
interface Walk { d: number; th: number; om: number; sway: number; t: number; gustAt: number; gust: number; gustT: number; gustLen: number; step: number; jit: number; jitT: number; sent: number }
interface Fall { x: number; y: number; z: number; vx: number; vy: number; vz: number; t: number; side: number; heap: boolean }

registerChallenge({
  id: "tightrope", name: "The Balloon Tightrope", blurb: "Walk a rope between two hot air balloons, one at a time, and nobody falls",
  glyph: "T", colour: COLOUR, tier: 2, stars: 3,
  goal: () => "Everyone walks the rope from one balloon to the other",
  place(map) {
    const f = findField(map);
    if (!f) return null;
    const px = -f.ay, py = f.ax, half = ropeFor(1) / 2 + HALF;
    const at = (x: number, y: number, name: string): ChallengeSpot => ({ x, z: -y, name });
    return [
      at(f.x + px * 16, f.y + py * 16, f.n),
      at(f.x - f.ax * half, f.y - f.ay * half, f.n),
      at(f.x + f.ax * half, f.y + f.ay * half, f.n),
    ];
  },
  waiting({ offer, spots, w }) { return waitingPair(offer.seed, spots, w); },
  start({ offer, spots, w }) {
    const map = w.map, me = w.selfId, R0 = rng(offer.seed);
    const { cx0, cz0, ax, az, px, pz, yaw } = rig(spots);
    const designs = shuffled(R0, Array.from({ length: BALLOON_DESIGNS }, (_, k) => k)).slice(0, 2);
    const names = shuffled(R0, ["Bladud", "Sulis", "Minerva", "Beau Nash", "Jane Austen", "King Offa", "Sally Lunn"]).slice(0, 2);

    let phase: Phase = "gather";
    let pilots = ["", ""], walkers: string[] = [], n = 0, crossed = new Set<string>(), fallen = "";
    let R = ropeFor(1), H = heightFor(1), G = gustFor(1);
    let t = 0, riseT = 0, downT = 0, won = false, firstT = 0, allT = 0, lostT = -1, goneT = 0, backT = -1;
    let lives = livesFor(1), most = lives;
    let cx = cx0, cz = cz0, cvx = 0, cvz = 0, rigTx = cx0, rigTz = cz0;
    const u = [0, 0], v = [0, 0], ut = [0, 0], vt = [0, 0], burn = [false, false], aiIn = [0, 0], aiT = [0, 0];
    const phi = [R0() * 6.3, R0() * 6.3, R0() * 6.3, R0() * 6.3];
    let endGust = [0, 0], endGustAt = [3, 5];
    let sendT = 0, rigT = 0;
    let lastMove: { x: number; y: number } | null = null, inBasket: boolean | null = null;
    let walk: Walk | null = null, fall: Fall | null = null, over = false;
    const others = new Map<string, { d: number; th: number; f: number }>();
    let basketView = false, eyeAt: THREE.Vector3 | null = null;
    let creakT = 0, taut = false, shake = 0, ohhT = -1;
    let gather = { near: 0, all: 0 };
    const posed = new Set<string>();
    const my = rng(hash(offer.seed, me));

    // the two balloons, the rope and the walker's pole
    const views = [new BalloonView(w.scene, designs[0]), new BalloonView(w.scene, designs[1])];
    const rope = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 5), new THREE.MeshLambertMaterial({ color: "#e4d6b4" }), SEG);
    rope.frustumCulled = false;
    w.scene.add(rope);
    const stick = pole();
    stick.visible = false;
    w.scene.add(stick);
    w.mark("@challenge", { x: cx0, z: cz0 }, offer.title, COLOUR);

    const say = (d: any) => { w.send("qe", { ...d, s: offer.seed }); job.event!(d, me); };
    const present = () => new Set(w.players().map((p) => p.id));
    const current = () => (phase === "cross" ? walkers[n] ?? "" : "");
    const pilotOf = (i: number, here: Set<string>) => (pilots[i] && here.has(pilots[i]) ? pilots[i] : "");
    const iFly = (i: number, here: Set<string>) => pilotOf(i, here) === me || (!pilotOf(i, here) && w.isHost);
    const height = () => (phase === "gather" ? 0 : phase === "rise" ? H * smooth(riseT / RISE) : phase === "cross" ? H : H * (1 - smooth(downT / DOWN)));
    const span = () => R * 0.985 + u[0] + u[1];
    const slack = () => 1 - span() / R;

    /** A basket's middle (the floor), and the rope's end at its rim. */
    const basket = (i: number) => {
      const sg = i ? 1 : -1, d = R * 0.4925 + HALF + u[i];
      const x = cx + ax * sg * d, z = cz + az * sg * d;
      const g = map.ground(x, z), gc = map.ground(cx, cz), k = H ? height() / H : 0;
      return { x, z, y: g + (gc + H - g) * k };
    };
    const ends = () => {
      const b0 = basket(0), b1 = basket(1);
      return [
        { x: b0.x + ax * HALF, y: b0.y + RIM, z: b0.z + az * HALF },
        { x: b1.x - ax * HALF, y: b1.y + RIM, z: b1.z - az * HALF },
      ];
    };
    /** A point on the rope, f of the way from the first balloon to the second. */
    const ropeAt = (f: number, out = new THREE.Vector3()) => {
      const [e0, e1] = ends(), s = Math.max(0, slack());
      const sag = R * 0.55 * Math.sqrt(s) + (current() ? 0.25 : 0.05);
      const th = current() === me ? walk?.th ?? 0 : others.get(current())?.th ?? 0;
      const mid = Math.sin(Math.PI * f), lat = (th * 0.35 + Math.sin(t * 1.7) * Math.max(0, s - 0.03) * 6) * mid;
      out.set(e0.x + (e1.x - e0.x) * f + px * lat, e0.y + (e1.y - e0.y) * f - sag * 4 * f * (1 - f) + Math.sin(t * 31) * shake * mid, e0.z + (e1.z - e0.z) * f + pz * lat);
      out.y = Math.max(out.y, map.ground(out.x, out.z) + 0.04);
      return out;
    };

    const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
    const drawRope = () => {
      for (let i = 0; i < SEG; i++) {
        ropeAt(i / SEG, _a); ropeAt((i + 1) / SEG, _b);
        const len = _a.distanceTo(_b);
        _b.sub(_a);
        _q.setFromUnitVectors(_up, _b.clone().normalize());
        _m.compose(_a.addScaledVector(_b, 0.5), _q, _s.set(1, len, 1));
        rope.setMatrixAt(i, _m);
      }
      rope.instanceMatrix.needsUpdate = true;
    };

    /** Where someone stands in a basket. */
    const standIn = (i: number, k: number): Perch => {
      const b = basket(i), sg = i ? 1 : -1, [s, c] = STANDS[k % STANDS.length];
      return { x: b.x + ax * sg * s + px * c, y: b.y + 0.08, z: b.z + az * sg * s + pz * c };
    };

    /** Who's walking, and where, as this screen knows it. */
    const walkerAt = (): { x: number; y: number; z: number; th: number; f: number } | null => {
      const id = fallen || current();
      if (!id) return null;
      if (id === me) {
        if (fall) return { x: fall.x, y: fall.y, z: fall.z, th: fall.t * 4 * fall.side, f: fall.heap ? 2 : 1 };
        if (walk) { const p = ropeAt(clamp(walk.d / span(), 0, 1)); return { x: p.x, y: p.y, z: p.z, th: walk.th, f: 0 }; }
        return null;
      }
      const o = others.get(id), p = w.players().find((q) => q.id === id);
      if (!o || !p) return null;
      return { x: p.x, y: p.y, z: p.z, th: o.th, f: o.f };
    };

    // ---- each balloon's end of the rope, flown by its pilot or the crew ----
    const flyEnds = (dt: number, move: { x: number; y: number } | null) => {
      const here = present();
      for (let i = 0; i < 2; i++) {
        if (!iFly(i, here)) {
          u[i] += vt[i] * dt; ut[i] += vt[i] * dt;
          u[i] += (ut[i] - u[i]) * Math.min(1, dt * 4); v[i] += (vt[i] - v[i]) * Math.min(1, dt * 4);
          continue;
        }
        let input = 0;
        if (pilotOf(i, here) === me && move && phase === "cross") input = clamp(move.y, -1, 1);
        else if (phase === "cross") {
          // the crew: with a pilot on the other end they just hold their own place; alone they keep the span
          if ((aiT[i] -= dt) <= 0) {
            aiT[i] = 0.45;
            const mate = pilotOf(1 - i, here);
            aiIn[i] = mate ? (Math.abs(u[i]) < 0.3 && Math.abs(v[i]) < 0.05 ? 0 : clamp(u[i] * 0.5 + v[i] * 1.6, -1, 1))
              : clamp((span() - R * 0.985) * 0.35 + (v[0] + v[1]) * 1.2, -1, 1);
          }
          input = aiIn[i];
        }
        burn[i] = Math.abs(input) > 0.3;
        // the wind worries at each balloon on its own, in slow swells and sharp gusts
        if (phase === "cross" && t > endGustAt[i]) { endGust[i] = (R0() < 0.5 ? -1 : 1) * (0.6 + R0() * 0.8); endGustAt[i] = t + (4 + R0() * 6) / G; }
        endGust[i] *= Math.exp(-dt * 0.8);
        const sw = phase === "cross" ? (0.1 + 0.03 * (walkers.length - 1)) * (0.6 * Math.sin(t * 0.27 + phi[i]) + 0.4 * Math.sin(t * 0.61 + phi[i + 2]) + endGust[i]) : 0;
        const stretch = span() - R;
        let a = -input * ACC + sw - DRAG * v[i] - (stretch > 0 ? 3 * stretch : 0);
        if (phase !== "cross") a = -u[i] * 0.5 - v[i] * 1.5;
        v[i] += a * dt;
        if (stretch > 0 && v[i] > 0) v[i] *= Math.exp(-dt * 4);
        u[i] = clamp(u[i] + v[i] * dt, -R * 0.3, R * 0.2);
      }
      if ((sendT -= dt) <= 0) {
        sendT = SEND;
        for (let i = 0; i < 2; i++) if (iFly(i, here) && phase !== "gather") w.send("qe", { k: "b", s: offer.seed, i, u: Math.round(u[i] * 100) / 100, v: Math.round(v[i] * 100) / 100, b: burn[i] ? 1 : 0 });
      }
    };

    // ---- your own go on the rope ----
    const balance = (dt: number, move: { x: number; y: number }): Perch => {
      const W = (walk ??= { d: 0.35, th: (my() - 0.5) * 0.06, om: 0, sway: 0.12, t: 0, gustAt: 2.5, gust: 0, gustT: -9, gustLen: 1, step: 0, jit: 0, jitT: 0, sent: 0 });
      const first = W.t === 0;
      W.t += dt;
      const L = span(), f = clamp(W.d / L, 0, 1), mid = Math.sin(Math.PI * f), s = slack();
      const fwd = clamp(move.y, -1, 1), lean = clamp(move.x, -1, 1), walking = Math.abs(fwd) > 0.2;
      // gusts, every few seconds, harder further out; you hear each one coming
      if (W.t > W.gustAt) {
        W.gust = (my() < 0.5 ? -1 : 1) * (0.7 + my() * 0.8) * G * (0.6 + 0.5 * mid);
        W.gustT = W.t; W.gustLen = 0.8 + my() * 1.0; W.gustAt = W.t + (3 + my() * 4) / G;
        SFX.whoosh();
      }
      const gu = W.t - W.gustT < W.gustLen ? W.gust * Math.sin((Math.PI * (W.t - W.gustT)) / W.gustLen) : 0;
      // the sway builds while you walk and dies back while you stand
      W.sway = clamp(W.sway + dt * (walking ? 0.045 : -0.07), 0.1, 1.3);
      const sw = W.sway * 1.1 * Math.sin(W.t * 3.6) * (0.4 + mid);
      // a rope pulled taut shakes, one gone slack wobbles
      if ((W.jitT -= dt) <= 0) { W.jitT = 0.08; W.jit = my() * 2 - 1; }
      const rough = (s < 0.004 ? 2.5 * clamp((0.004 - s) / 0.004, 0, 1.5) : 0) + (s > 0.03 ? (s - 0.03) * 22 * (0.3 + mid) : 0);
      // each step's a little wobble
      if (walking && (W.step += dt * Math.abs(fwd) * 1.4) > 1) { W.step = 0; W.om += (my() - 0.5) * 0.3; }
      const tip = (walking ? 2.5 : 2.0) * Math.sin(W.th), damp = walking ? 0.5 : 1.8;
      W.om += (tip + 3.4 * lean - damp * W.om + gu + sw + W.jit * rough) * dt;
      W.th += W.om * dt;
      // uphill out of a sag is slow going
      const ahead = ropeAt(Math.min(1, f + 0.02)).y - ropeAt(f).y, slope = ahead / (L * 0.02);
      let speed = fwd > 0.2 ? 0.7 * fwd * (1 - (Math.abs(W.th) / TIP) * 0.5) * (slope > 0 ? Math.max(0.35, 1 - slope * 2.5) : 1) : fwd < -0.2 ? 0.35 * fwd : 0;
      W.d = Math.max(0.3, W.d + speed * dt);
      const at = ropeAt(clamp(W.d / L, 0, 1));
      if (Math.abs(W.th) > TIP) {
        // off!
        const side = Math.sign(W.th) || 1;
        fall = { x: at.x + px * side * 0.3, y: at.y, z: at.z + pz * side * 0.3, vx: px * side * 2.4 + cvx, vy: 1.5, vz: pz * side * 2.4 + cvz, t: 0, side, heap: false };
        walk = null;
        say({ k: "fell", x: Math.round(at.x), z: Math.round(at.z) });
        return { x: fall.x, y: fall.y, z: fall.z, bare: true };
      }
      if (W.d >= L - 0.6) {
        over = true; walk = null;
        SFX.jobStep();
        say({ k: "over" });
        return standIn(1, 1 + crossed.size);
      }
      if ((W.sent -= dt) <= 0) { W.sent = SEND; w.send("qe", { k: "w", s: offer.seed, d: Math.round(W.d * 100) / 100, th: Math.round(W.th * 1000) / 1000, f: 0 }); }
      const side = Math.sin(W.th) * 0.25;
      return { x: at.x + px * side, y: at.y + 0.03, z: at.z + pz * side, roll: -W.th * 0.9, bare: true, face: first ? Math.atan2(-ax, -az) : undefined };
    };

    const tumble = (dt: number): Perch => {
      const F = fall!;
      F.t += dt;
      if (!F.heap) {
        F.vy = Math.max(-15, F.vy - FALL_G * dt);
        F.x += F.vx * dt; F.y += F.vy * dt; F.z += F.vz * dt;
        F.vx *= Math.exp(-dt * 0.3); F.vz *= Math.exp(-dt * 0.3);
        const g = map.ground(F.x, F.z);
        if (F.y <= g) {
          F.y = g; F.heap = true; F.t = 0;
          SFX.land(true, 1); SFX.crash(1, 0, 0);
          w.toast("Flat on your back in the grass. Not a scratch, but you're out", 3.5);
        }
      }
      if ((sendT -= dt) <= 0) { sendT = SEND; w.send("qe", { k: "w", s: offer.seed, d: 0, th: 0, f: F.heap ? 2 : 1 }); }
      return F.heap
        ? { x: F.x, y: F.y, z: F.z, roll: F.side * 1.25, pitch: -0.9, bare: true }
        : { x: F.x, y: F.y, z: F.z, roll: F.side * F.t * 3.2, pitch: Math.sin(F.t * 2.1) * 0.7 - 0.3, bare: true };
    };

    /** The view for someone watching: off to the side of the walker, a little above. */
    const watching = (dt: number): Perch["eye"] | undefined => {
      const at = walkerAt();
      if (!at || basketView) { eyeAt = null; return undefined; }
      const g = map.ground(at.x, at.z);
      const want = new THREE.Vector3(at.x + px * 11 - ax * 2.5, Math.max(at.y + 1.8, g + 2.5), at.z + pz * 11 - az * 2.5);
      if (!eyeAt) eyeAt = want.clone(); else eyeAt.lerp(want, Math.min(1, dt * 3));
      return { x: eyeAt.x, y: eyeAt.y, z: eyeAt.z, lx: at.x, ly: at.y + 1.1, lz: at.z };
    };

    const putDown = () => {
      if (fall || !(pilots.includes(me) || walkers.includes(me))) return;
      const b = basket(pilots[0] === me ? 0 : pilots[1] === me || crossed.has(me) || over ? 1 : 0);
      const k = (pilots.indexOf(me) + 1 || walkers.indexOf(me) + 3) * 1.1;
      w.moveTo(b.x + px * (2 + (k % 3)) + ax * (k % 2), b.z + pz * (2 + (k % 3)) + az * (k % 2), yaw + Math.PI / 2);
    };

    const finish = () => {
      if (job.done) return;
      putDown();
      const b = basket(1), name = fallen ? (fallen === me ? "You" : w.nameOf(fallen)) : "";
      job.done = won
        ? { won: true, text: walkers.length > 1 ? `All ${walkers.length} across the rope, and nobody off` : "Across the rope without coming off", x: b.x, z: b.z }
        : { won: false, text: `${name} came off the rope, so not everyone got across`, x: b.x, z: b.z };
    };

    const job: Job = {
      offer, done: null,

      update(dt) {
        t += dt;
        if (phase === "rise") { riseT += dt; if (riseT >= RISE) { phase = "cross"; riseT = RISE; } }
        if (phase === "down" && (downT += dt) >= DOWN) { if (won) finish(); else again(); }
        if (phase !== "gather") {
          // the pair drift with the wind, as the host says
          cx += cvx * dt; cz += cvz * dt;
          if (!w.isHost) { rigTx += cvx * dt; rigTz += cvz * dt; cx += (rigTx - cx) * Math.min(1, dt * 2); cz += (rigTz - cz) * Math.min(1, dt * 2); }
        }
        flyEnds(dt, lastMove);
        lastMove = null;
        // a rope snapping taut twangs and shakes
        const s = slack(), was = taut;
        taut = phase === "cross" && s < 0.004;
        if (taut && !was) {
          const hit = clamp((v[0] + v[1]) * 3, 0.2, 1.5);
          shake = 0.12 + hit * 0.15;
          const e = ends()[0], [d, pan] = w.hear?.(e.x, e.y, e.z) ?? [0, 0];
          SFX.ropeTwang(hit, d, pan);
          if (walk) walk.om += (my() < 0.5 ? -1 : 1) * hit * 0.9;
        }
        shake = taut ? Math.max(shake * Math.exp(-dt * 2), 0.03 * clamp((0.004 - s) / 0.004, 0, 2)) : shake * Math.exp(-dt * 4);
        for (let i = 0; i < 2; i++) {
          const b = basket(i);
          const flame = phase === "rise" || (phase === "down" && downT < 1.5) || burn[i] || (t + i * 4.3) % 11 < 0.8;
          views[i].pose(b.x, b.y, b.z, yaw + (i ? Math.PI : 0), 1, flame, dt);
        }
        drawRope();
        // the walker's pole, and how the others' bodies are drawn
        const at = walkerAt(), id = fallen || current();
        stick.visible = !!at && at.f < 2;
        if (at && stick.visible) {
          const ahead = id === me ? 0.8 : 0.3;
          stick.position.set(at.x + ax * ahead, at.y + (id === me ? 1.35 : 1.15), at.z + az * ahead);
          stick.rotation.set(at.f === 1 ? at.th : 0, yaw, at.f === 1 ? at.th * 1.7 : -at.th * 1.3);
          if (at.f === 1) { stick.position.y += 0.6; }
        }
        for (const p of posed) if (p !== id) { w.pose?.(p, 0, ""); posed.delete(p); }
        if (at && id && id !== me) {
          w.pose?.(id, at.f === 2 ? Math.PI / 2 : at.f === 1 ? at.th : -at.th, at.f === 2 ? "" : at.f === 1 ? "flail" : "pole");
          posed.add(id);
        }
        // the rope creaks under them, more the further they lean
        if (at && at.f === 0 && (creakT -= dt) <= 0) {
          const hard = clamp(Math.abs(at.th) / TIP, 0, 1);
          creakT = 0.95 - hard * 0.7 + Math.random() * 0.3;
          const [d, pan] = id === me ? [0, 0] : w.hear?.(at.x, at.y, at.z) ?? [0, 0];
          SFX.ropeCreak(hard, d, pan);
        }
        if (ohhT >= 0 && (ohhT -= dt) < 0) SFX.crowdOhh();
      },

      perch(dt, move) {
        const mine = walkers.includes(me) || pilots.includes(me);
        lastMove = move;
        if (phase === "gather" || !mine) return null;
        if (fall) return tumble(dt);
        if (phase === "cross" && current() === me && !over) return balance(dt, move);
        const pi = pilots.indexOf(me), far = pi === 1 || (pi < 0 && (crossed.has(me) || over));
        const spot = pi >= 0 ? standIn(pi, 0) : far ? standIn(1, 1 + [...crossed].indexOf(me)) : standIn(0, 1 + walkers.indexOf(me));
        if (pi < 0 && phase === "cross") spot.eye = watching(dt);
        // facing the other balloon, the first moment you're in a basket
        if (inBasket !== far) { inBasket = far; spot.face = far ? Math.atan2(ax, az) : Math.atan2(-ax, -az); }
        return spot;
      },

      host(dt) {
        if (job.done) return;
        const here = present();
        if (phase === "gather") {
          const ps = w.players().filter((p) => p.alive);
          const near = ps.filter((p) => Math.hypot(p.x - cx0, p.z - cz0) < GATHER);
          gather = { near: near.length, all: ps.length };
          if (near.length) firstT += dt; else firstT = 0;
          allT = near.length && near.length === ps.length ? allT + dt : 0;
          if (allT > 2.5 || (near.length && firstT > WAIT)) {
            const ids = shuffled(rng(hash(offer.seed, "roles")), near.map((p) => p.id).sort());
            const np = ids.length >= 4 ? 2 : ids.length >= 2 ? 1 : 0;
            const pl = np === 2 ? [ids[0], ids[1]] : np === 1 ? ["", ids[0]] : ["", ""];
            say({ k: "go", p: pl, wk: ids.slice(np) });
          }
          return;
        }
        // the drift: a slow pull downwind, held near the field by the crew's trail rope
        const [wx, wz] = wind(H, dayNumber());
        let tx = wx * 0.15, tz = wz * 0.15;
        const off = Math.hypot(cx - cx0, cz - cz0);
        if (off > 40) { tx -= ((cx - cx0) / off) * (off - 40) * 0.05; tz -= ((cz - cz0) / off) * (off - 40) * 0.05; }
        if (map.fieldEdge(cx, cz) < 80) { tx = (cx0 - cx) * 0.05; tz = (cz0 - cz) * 0.05; }
        cvx += (tx - cvx) * Math.min(1, dt * 0.3); cvz += (tz - cvz) * Math.min(1, dt * 0.3);
        if ((rigT -= dt) <= 0) { rigT = 0.25; w.send("qe", { k: "rig", s: offer.seed, x: Math.round(cx * 10) / 10, z: Math.round(cz * 10) / 10, vx: Math.round(cvx * 100) / 100, vz: Math.round(cvz * 100) / 100 }); }
        if (phase !== "cross") return;
        if (fallen) {
          if (lostT >= 0 && (lostT -= dt) < 0) say({ k: "down", won: 0 });
          if (backT >= 0 && (backT -= dt) < 0) backIn();
          return;
        }
        // a walker who's left the game is passed over
        const id = current();
        goneT = id && !here.has(id) ? goneT + dt : 0;
        if (goneT > 3) { goneT = 0; next(); }
      },

      event(d, from) {
        if (!d || typeof d !== "object" || job.done) return;
        switch (d.k) {
          case "go": {
            if (phase !== "gather" || !Array.isArray(d.p) || !Array.isArray(d.wk)) return;
            pilots = [String(d.p[0] ?? ""), String(d.p[1] ?? "")];
            walkers = d.wk.map(String);
            R = ropeFor(Math.max(1, walkers.length)); H = heightFor(Math.max(1, walkers.length)); G = gustFor(Math.max(1, walkers.length));
            phase = "rise"; riseT = 0; n = 0;
            lives = most = livesFor(walkers.length);
            w.mark("@challenge", null);
            SFX.jobStep();
            const pi = pilots.indexOf(me), wi = walkers.indexOf(me);
            const k = (c: string) => keyLabel(c);
            if (pi >= 0) w.toast(`You're flying ${names[pi]}. ${touchy() ? "Push the stick up to pull in and down to let out" : `${k("KeyW")} pulls in, ${k("KeyS")} lets out`}: keep the rope just right`, 6);
            else if (wi >= 0) w.toast(wi === 0 ? "You're first on the rope" : `You're number ${wi + 1} on the rope. Watch how the others do it`, 4);
            return;
          }
          case "b": {
            const i = d.i | 0;
            if ((i !== 0 && i !== 1) || iFly(i, present())) return;
            if (typeof d.u === "number" && typeof d.v === "number") { ut[i] = d.u; vt[i] = d.v; burn[i] = !!d.b; }
            return;
          }
          case "rig":
            if (!w.isHost && typeof d.x === "number" && typeof d.z === "number") { rigTx = d.x; rigTz = d.z; cvx = +d.vx || 0; cvz = +d.vz || 0; if (Math.hypot(cx - d.x, cz - d.z) > 20) { cx = d.x; cz = d.z; } }
            return;
          case "w":
            if (from !== me) others.set(from, { d: +d.d || 0, th: +d.th || 0, f: d.f | 0 });
            return;
          case "over":
            if (from !== current()) return;
            crossed.add(from);
            if (w.isHost) next();
            return;
          case "next":
            if (typeof d.n !== "number") return;
            n = d.n;
            if (Array.isArray(d.c)) crossed = new Set(d.c.map(String));
            if (current() === me) { over = false; w.toast("Your turn. Out you go", 2.5); }
            return;
          case "fell": {
            if (fallen) return;
            fallen = from;
            ohhT = 1.1;
            if (w.isHost) {
              say({ k: "lv", n: Math.max(0, lives - 1), id: from });
              if (lives > 0) backT = BACK_IN; else lostT = 6;
            }
            const at = walkerAt(), [dd, pan] = at && from !== me ? w.hear?.(at.x, at.y, at.z) ?? [0, 0] : [0, 0];
            SFX.scream(dd, pan, hash(from));
            return;
          }
          case "lv": {
            const k = Math.max(0, Math.floor(+d.n) || 0), id = String(d.id ?? "");
            if (k >= lives) return;
            lives = k;
            SFX.lifeLost();
            const who = id === me ? "You" : w.nameOf(id);
            w.feed(`<b style="color:${w.colourOf(id)}">${esc(who)}</b> fell off the rope: ${k ? `${k} ${k === 1 ? "life" : "lives"} left` : "no lives left"}`);
            if (id === me) w.toast(k ? `That's a life gone. Back to the first basket, and you go again after the others` : "That was the team's last life", 4);
            return;
          }
          case "back": {
            if (!fallen || !Array.isArray(d.wk) || typeof d.n !== "number") return;
            const was = fallen;
            fallen = ""; others.delete(was);
            walkers = d.wk.map(String); n = d.n;
            if (Array.isArray(d.c)) crossed = new Set(d.c.map(String));
            if (was === me) { fall = null; walk = null; over = false; inBasket = null; }
            if (current() === me) { over = false; w.toast(was === me ? "Your go again. Out you go" : "Your turn. Out you go", 2.5); }
            return;
          }
          case "down":
            if (phase === "down") return;
            won = !!d.won;
            phase = "down"; downT = 0;
            if (!won) {
              SFX.jobDone(false);
              missionEnd({ result: "failed", title: "Out of lives", lines: ["Everyone back down: the whole rope again, from the start", `${most} lives for the next go`], colour: COLOUR });
            }
            return;
        }
      },

      card(): Card {
        const total = walkers.length, done = crossed.size;
        if (phase === "gather") {
          const { near, all } = gather.all ? gather : { near: w.players().filter((p) => Math.hypot(p.x - cx0, p.z - cz0) < GATHER).length, all: w.players().length };
          return { line: `Everyone to ${esc(offer.where || "the field")}`, sub: "The balloons go up once you're all there", progress: `${near} / ${all}` };
        }
        const lv = hearts(lives, most);
        if (phase === "rise") return { line: `${lv} Up she goes`, sub: `${esc(names[0])} and ${esc(names[1])}, ${Math.round(H)} m up, ${Math.round(R)} m of rope`, bar: riseT / RISE, stage: { key: "rise", title: "Up she goes", sub: "Hold tight", colour: COLOUR } };
        if (phase === "down") return { line: won ? "Everyone made it across" : `${lv} Out of lives: coming down to start again`, bar: downT / DOWN, progress: `${done} / ${total}`, stage: { key: "down", title: won ? "Everyone across!" : "Out of lives", sub: won ? "Bringing her down" : "Down to start again", colour: COLOUR } };
        const id = current(), who = id === me ? "You" : esc(w.nameOf(id));
        const pi = pilots.indexOf(me);
        const stage = fallen
          ? { key: `fell${lives}`, title: "Off the rope!", sub: `${fallen === me ? "You" : esc(w.nameOf(fallen))} fell · ${lives} ${lives === 1 ? "life" : "lives"} left`, colour: "#d8262e" }
          : { key: `w${n}`, title: id === me ? "Your turn" : `${who} on the rope`, sub: `${n + 1} of ${total}`, colour: COLOUR };
        const f = id === me ? (walk ? walk.d / span() : over ? 1 : 0) : (others.get(id)?.d ?? 0) / span();
        if (pi >= 0) return { line: `${lv} Flying ${esc(names[pi])}: keep the rope just right`, sub: gauge() + (touchy() ? " Stick up to pull in, down to let out" : ` <b>${keyLabel("KeyW")}</b> pull in · <b>${keyLabel("KeyS")}</b> let out`), progress: `${done} / ${total}`, bar: f, stage };
        if (id === me && !fallen) return {
          line: `${lv} Your turn on the rope`,
          sub: touchy() ? "Stick left and right to lean, up to walk. Stand still to steady yourself" : `<b>${keyLabel("KeyA")}</b> <b>${keyLabel("KeyD")}</b> lean · <b>${keyLabel("KeyW")}</b> walk · stand still to steady yourself`,
          progress: `${done} / ${total}`, bar: f, stage,
        };
        const sub = walkers.includes(me) ? (crossed.has(me) ? "You're across. Cheer them on" : `You're number ${walkers.indexOf(me) + 1} of ${total}`) : "Everyone has to get across";
        return { line: `${lv} ${fallen ? `${fallen === me ? "You" : esc(w.nameOf(fallen))} came off the rope` : `${who} on the rope`}`, sub, progress: `${done} / ${total}`, bar: f, stage };
      },

      progress: () => ({ ph: phase, p: pilots, wk: walkers, n, c: [...crossed], f: fallen, lv: lives, mx: most, cx, cz, u: [...u], won: won ? 1 : 0 }),
      restore(p) {
        if (!p || typeof p !== "object") return;
        if (["gather", "rise", "cross", "down"].includes(p.ph)) phase = p.ph;
        if (Array.isArray(p.p)) pilots = [String(p.p[0] ?? ""), String(p.p[1] ?? "")];
        if (Array.isArray(p.wk)) walkers = p.wk.map(String);
        if (typeof p.n === "number") n = p.n;
        if (Array.isArray(p.c)) crossed = new Set(p.c.map(String));
        fallen = typeof p.f === "string" ? p.f : "";
        if (typeof p.cx === "number" && typeof p.cz === "number") { cx = rigTx = p.cx; cz = rigTz = p.cz; }
        if (Array.isArray(p.u)) { u[0] = ut[0] = +p.u[0] || 0; u[1] = ut[1] = +p.u[1] || 0; }
        won = !!p.won;
        if (+p.mx > 0) { most = Math.floor(+p.mx); lives = Math.max(0, Math.min(most, Math.floor(+p.lv) || 0)); }
        R = ropeFor(Math.max(1, walkers.length)); H = heightFor(Math.max(1, walkers.length)); G = gustFor(Math.max(1, walkers.length));
        if (phase === "rise") riseT = RISE * 0.9;
        if (phase !== "gather") w.mark("@challenge", null);
      },

      use() {
        if (phase !== "cross" || !walkers.includes(me) || current() === me || fall) return false;
        basketView = !basketView;
        return true;
      },
      hint() {
        if (phase !== "cross" || !walkers.includes(me) || current() === me || fall || !walkerAt()) return "";
        return `<b>E</b> ${basketView ? "Follow the walker" : "Watch from the basket"}`;
      },

      end() {
        if (!job.done) putDown();
        w.mark("@challenge", null);
        for (const p of posed) w.pose?.(p, 0, "");
        posed.clear();
        for (const v2 of views) v2.dispose();
        rope.removeFromParent(); rope.geometry.dispose(); (rope.material as THREE.Material).dispose();
        stick.removeFromParent(); (stick.material as THREE.Material).dispose();
      },
    };

    /** Host: a faller with lives still left goes to the back of the queue, and the next walker's up. */
    function backIn() {
      const here = present(), was = walkers[n], rest = walkers.filter((_id, i) => i !== n);
      const wk = was && here.has(was) ? [...rest, was] : rest;
      let k = n;
      while (k < wk.length && !here.has(wk[k])) k++;
      if (k >= wk.length) { say({ k: "down", won: 1 }); return; }
      say({ k: "back", wk, n: k, c: [...crossed] });
    }

    /** Out of lives and back on the grass: everyone stands by the baskets and it starts again from scratch. */
    function again() {
      fall = null; walk = null; over = false; inBasket = null; others.clear();
      phase = "gather"; fallen = ""; crossed = new Set(); n = 0; lives = most;
      riseT = downT = 0; firstT = allT = 0; lostT = backT = -1; goneT = 0;
      u[0] = u[1] = ut[0] = ut[1] = v[0] = v[1] = vt[0] = vt[1] = 0;
      // the crew walk the baskets back to where they started, so everyone's stood in the gathering
      cx = rigTx = cx0; cz = rigTz = cz0; cvx = cvz = 0;
      putDown();
    }

    /** Host: the walker's over (or gone): on to the next, or it's won. */
    function next() {
      const here = present();
      let k = n + 1;
      while (k < walkers.length && !here.has(walkers[k])) k++;
      if (k >= walkers.length) say({ k: "down", won: 1 });
      else say({ k: "next", n: k, c: [...crossed] });
    }

    /** The pilot's span gauge: taut on the left, slack on the right, just right in green. */
    function gauge() {
      const s = slack(), pos = clamp((s + 0.02) / 0.12, 0, 1);
      const word = s < 0.004 ? "Taut!" : s <= 0.03 ? "Just right" : s <= 0.07 ? "Slack" : "Sagging!";
      const col = s < 0.004 || s > 0.07 ? "#ff6a4a" : s <= 0.03 ? "#7be07b" : "#ffd84a";
      return `<span style="display:inline-block;position:relative;width:120px;height:8px;margin:0 6px 0 0;vertical-align:middle;background:linear-gradient(90deg,#c0392b 0 20%,#2e8b3e 20% 41%,#c9a227 41% 75%,#c0392b 75%);border-radius:4px">`
        + `<span style="position:absolute;top:-3px;left:${Math.round(pos * 116)}px;width:4px;height:14px;background:#fff;border-radius:2px"></span></span><b style="color:${col}">${word}</b>`;
    }

    return job;
  },
});
