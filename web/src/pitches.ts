// Sports pitches: rugby pitches on the rectangular ones, cricket fields on the round ones.
import * as THREE from "three";
import { GameMap, POST_GAP, POST_HEIGHT, SCREEN, rugbyLayout } from "./map";
import { Culler } from "./cull";

const LINE = 0.12;                      // painted line width
/** The stumps and bails at each end of each cricket wicket, by "pitch index:end" (end -1 or 1), for knocking over (see sport.ts). */
export const STUMPS = new Map<string, { stumps: THREE.Mesh[]; bails: THREE.Mesh[] }>();
const PAD = ["#1d3f8f", "#a3202a", "#14532d", "#1b1b1b", "#d9a400", "#5b2a86"].map((c) => new THREE.Color(c));

/** ground(x, z): height of the drawn terrain at scene (x, z). */
export function buildPitches(map: GameMap, scene: THREE.Object3D, culler: Culler, ground: (x: number, z: number) => number, groundTex: THREE.Texture) {
  const pitches = map.d.pi ?? [];
  STUMPS.clear();
  if (!pitches.length) return;
  const lines: number[] = [], stripes: number[] = [], squares: number[] = [], strips: number[] = [];
  const white = new THREE.MeshLambertMaterial({ color: "#f2f0e8" });
  const at = (x: number, y: number, lift: number) => [x, ground(x, -y) + lift, -y];

  /** A flat quad draped over the terrain: corner o, sides along e1 and e2 (data coords), cut into ~2 m cells. */
  const drape = (out: number[], ox: number, oy: number, e1: number[], e2: number[], lift: number, cell = 2) => {
    const n1 = Math.max(1, Math.ceil(Math.hypot(e1[0], e1[1]) / cell)), n2 = Math.max(1, Math.ceil(Math.hypot(e2[0], e2[1]) / cell));
    const P = (i: number, j: number) => at(ox + e1[0] * i / n1 + e2[0] * j / n2, oy + e1[1] * i / n1 + e2[1] * j / n2, lift);
    // wind so the quad faces up whichever way e1 and e2 turn
    const up = e1[0] * e2[1] - e1[1] * e2[0] > 0;
    for (let i = 0; i < n1; i++) for (let j = 0; j < n2; j++) {
      const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1);
      if (up) out.push(...a, ...b, ...c, ...a, ...c, ...d);
      else out.push(...a, ...c, ...b, ...a, ...d, ...c);
    }
  };
  const flat = (out: number[], color: THREE.Color | string, opts: THREE.MeshLambertMaterialParameters = {}) => {
    if (!out.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(out, 3));
    g.computeVertexNormals();
    const uv: number[] = [];
    for (let k = 0; k < out.length; k += 3) uv.push(out[k] / 7, out[k + 2] / 7);
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, ...opts }));
    m.receiveShadow = true;
    scene.add(m);
    culler.add(m, 420);
  };
  const solid = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, h: number, ang = 0, range = 260) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, ground(x, -y) + h, -y);
    m.rotation.y = ang;
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    culler.add(m, range);
    return m;
  };

  for (const [pi, p] of pitches.entries()) {
    const [, cx, cy] = p;
    const ang = p[0] === "r" ? p[5] : p[3];
    const ux = Math.cos(ang), uy = Math.sin(ang), vx = -uy, vy = ux;
    // pitch frame: s along the long axis, t across it
    const X = (s: number, t: number) => cx + ux * s + vx * t, Y = (s: number, t: number) => cy + uy * s + vy * t;
    const line = (s0: number, t0: number, s1: number, t1: number, w = LINE, out = lines) => {
      const ds = s1 - s0, dt = t1 - t0, l = Math.hypot(ds, dt) || 1, ns = -dt / l * w / 2, nt = ds / l * w / 2;
      drape(out, X(s0 - ns, t0 - nt), Y(s0 - ns, t0 - nt), [ux * ds + vx * dt, uy * ds + vy * dt], [(ux * ns + vx * nt) * 2, (uy * ns + vy * nt) * 2], 0.04);
    };
    const dashed = (s0: number, t0: number, s1: number, t1: number, on: number, off: number) => {
      const l = Math.hypot(s1 - s0, t1 - t0), n = Math.max(1, Math.round((l + off) / (on + off)));
      const step = (l + off) / n;
      for (let k = 0; k < n; k++) {
        const a = k * step / l, b = Math.min(1, (k * step + step - off) / l);
        line(s0 + (s1 - s0) * a, t0 + (t1 - t0) * a, s0 + (s1 - s0) * b, t0 + (t1 - t0) * b);
      }
    };

    if (p[0] === "r") {
      const { L, W, F } = rugbyLayout(p), sc = (F * 2) / 100, sw = W / 70;
      // mown stripes across the pitch
      const nStripe = Math.max(6, Math.round(L / 9) | 1), sl = L / nStripe;
      for (let k = 0; k < nStripe; k += 2) {
        const s = -L / 2 + k * sl;
        drape(stripes, X(s, -W / 2 - 1), Y(s, -W / 2 - 1), [ux * sl, uy * sl], [vx * (W + 2), vy * (W + 2)], 0.02, 3);
      }
      // touchlines, dead-ball lines, try lines, 22s and halfway
      for (const t of [-W / 2, W / 2]) line(-L / 2, t, L / 2, t);
      for (const s of [-L / 2, L / 2, -F, F, -(F - 22 * sc), F - 22 * sc, 0]) line(s, -W / 2, s, W / 2);
      // dashed 10 m lines, 5 m lines in front of the try lines, and 5 m and 15 m lines in from touch
      for (const s of [-10 * sc, 10 * sc]) dashed(s, -W / 2, s, W / 2, 2, 1.6);
      for (const s of [-(F - 5 * sc), F - 5 * sc]) dashed(s, -W / 2 + 5 * sw, s, W / 2 - 5 * sw, 1, 3);
      for (const t of [-W / 2 + 5 * sw, -W / 2 + 15 * sw, W / 2 - 15 * sw, W / 2 - 5 * sw]) dashed(-F + 5 * sc, t, F - 5 * sc, t, 1, 4.5);
      line(-0.5, 0, 0.5, 0);

      // H goalposts with padded bases, in a colour of the club's
      const pad = new THREE.MeshLambertMaterial({ color: PAD[Math.abs(Math.round(cx * 7 + cy * 3)) % PAD.length] });
      const upright = new THREE.CylinderGeometry(0.06, 0.08, POST_HEIGHT, 8).translate(0, POST_HEIGHT / 2, 0);
      const bar = new THREE.CylinderGeometry(0.06, 0.06, POST_GAP, 8).rotateX(Math.PI / 2).translate(0, 3, 0);
      const padGeo = new THREE.BoxGeometry(0.5, 2, 0.5).translate(0, 1, 0);
      for (const s of [-F, F]) {
        for (const t of [-POST_GAP / 2, POST_GAP / 2]) {
          solid(upright, white, X(s, t), Y(s, t), 0, 0, 380);
          solid(padGeo, pad, X(s, t), Y(s, t), -0.05, ang);
        }
        solid(bar, white, X(s, 0), Y(s, 0), 0, ang, 380);   // turned by the pitch angle, the bar runs across
      }
      // corner flags at the ends of the try lines and dead-ball lines
      const flagMat = new THREE.MeshLambertMaterial({ color: pad.color, side: THREE.DoubleSide });
      const pole = new THREE.CylinderGeometry(0.02, 0.02, 1.4, 5).translate(0, 0.7, 0);
      const flag = new THREE.PlaneGeometry(0.35, 0.25).translate(0.18, 1.25, 0);
      for (const s of [-L / 2, -F, F, L / 2]) for (const t of [-W / 2, W / 2]) {
        solid(pole, white, X(s, t), Y(s, t), 0, 0, 120);
        solid(flag, flagMat, X(s, t), Y(s, t), 0, ang, 120);
      }
    } else {
      // the square (closely mown) and the wicket (worn to straw) in the middle
      drape(squares, X(-14, -10), Y(-14, -10), [ux * 28, uy * 28], [vx * 20, vy * 20], 0.02);
      drape(strips, X(-11.2, -1.525), Y(-11.2, -1.525), [ux * 22.4, uy * 22.4], [vx * 3.05, vy * 3.05], 0.03, 1);
      for (const e of [-1, 1]) {
        const b = e * 10.06, pc = e * (10.06 - 1.22);   // bowling and popping creases
        line(b, -1.32, b, 1.32, 0.06);
        line(pc, -1.52, pc, 1.52, 0.06);
        for (const t of [-1.32, 1.32]) line(pc, t, b + e * 1.22, t, 0.06);
      }
      // stumps and bails
      const stump = new THREE.CylinderGeometry(0.018, 0.018, 0.71, 6).translate(0, 0.355, 0);
      const bail = new THREE.BoxGeometry(0.02, 0.02, 0.11).translate(0, 0.72, 0);
      const wood = new THREE.MeshLambertMaterial({ color: "#e6d6ad" });
      for (const s of [-10.06, 10.06]) {
        STUMPS.set(`${pi}:${Math.sign(s)}`, {
          stumps: [-0.114, 0, 0.114].map((t) => solid(stump, wood, X(s, t), Y(s, t), 0, 0, 90)),
          bails: [-0.057, 0.057].map((t) => solid(bail, wood, X(s, t), Y(s, t), 0, ang, 90)),
        });
      }
      // boundary rope, hugging the ground
      const ring = p[4], pts: THREE.Vector3[] = [];
      for (let k = 0; k < ring.length; k++) {
        const [ax, ay] = ring[k], [bx, by] = ring[(k + 1) % ring.length], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 2));
        for (let i = 0; i < n; i++) pts.push(new THREE.Vector3(...at(ax + (bx - ax) * i / n, ay + (by - ay) * i / n, 0.06)));
      }
      const rope = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), pts.length * 2, 0.05, 5, true), white);
      rope.receiveShadow = true;
      scene.add(rope);
      culler.add(rope, 300);
      // sightscreens behind each end of the wicket, on legs
      const board = new THREE.BoxGeometry(SCREEN[0], SCREEN[1] - 0.6, 0.15).translate(0, (SCREEN[1] + 0.6) / 2, 0);
      const leg = new THREE.BoxGeometry(0.12, 0.7, 0.12).translate(0, 0.35, 0);
      const screenYaw = ang + Math.PI / 2;   // the board stands across the line of the wicket
      for (const [sx, sy] of p[5]) {
        solid(board, white, sx, sy, -0.1, screenYaw, 380);
        for (const t of [-SCREEN[0] / 2 + 0.3, 0, SCREEN[0] / 2 - 0.3]) solid(leg, white, sx + vx * t, sy + vy * t, -0.1, screenYaw, 200);
      }
    }
  }

  flat(lines, "#eeeee6", { polygonOffsetFactor: -4, polygonOffsetUnits: -8 });
  flat(stripes, "#ffffff", { transparent: true, opacity: 0.07, depthWrite: false });
  flat(squares, "#7f9e52", { map: groundTex });
  flat(strips, "#c9b98a", { map: groundTex, polygonOffsetFactor: -3, polygonOffsetUnits: -6 });
}
