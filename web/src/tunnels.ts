// Tunnels you can walk through (tools/tunnels.py): an arched brick tube along each tunnel's floor,
// lit by lamps along the crown, with a stone headwall round the arch at each portal. The ground over
// a tunnel is the hill's, whole; the terrain inside the tube's mouth is hidden (world.ts asks
// mouths() where), so you can see in from the cutting, and further in the hill is over your head.
// The two bores of a dual carriageway coming out side by side share one headwall, square to them.
// Where the hill beside the cutting stands high, a wing wall holds it up, and the ground between
// the wing walls is dug to the floor (world.ts, from cuttings()). A tunnel cut at its square's edge,
// deep under the hill, has no portal there.
//
// The light inside is painted on: each vertex is as bright as its nearest lamp makes it, so it
// costs nothing at run time, and the tube ignores the sun. world.ts turns the fog dark while
// you're in one.
import * as THREE from "three";
import { GameMap, TUNNEL, Tunnel } from "./map";
import * as TX from "./textures";

const WALL = 3.0;        // floor to where the arch springs
const LAMP = 14;         // metres between lamps
const STEP = 1.5;        // metres between rings of the tube
const CHUNK = 60;        // rings per mesh, so the far parts are skipped when out of view
const FACE_DEPTH = 1.0;  // how thick the portal's stone face is
/** How far into the tube the terrain is hidden, from each portal. */
const MOUTH = 40;

/** The tube's cross-section from one wall's foot over the arch to the other's: [across, up]. */
function profile(): number[][] {
  const H = TUNNEL.half, b = TUNNEL.crown - WALL, out = [[H, 0], [H, WALL * 0.5]];
  for (let k = 0; k <= 10; k++) { const t = (k / 10) * Math.PI; out.push([H * Math.cos(t), WALL + b * Math.sin(t)]); }
  out.push([-H, WALL * 0.5], [-H, 0]);
  return out;
}

/** Points every STEP metres along a tunnel's floor (data coords [x, y, z]), with distance along and the sideways unit normal. */
function resample(p: number[][]) {
  const pts: { x: number; y: number; z: number; s: number; nx: number; ny: number }[] = [];
  let s = 0;
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i], b = p[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(l / STEP));
    for (let k = 0; k < n; k++) {
      const f = k / n;
      pts.push({ x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f, z: a[2] + (b[2] - a[2]) * f, s: s + l * f, nx: 0, ny: 0 });
    }
    s += l;
  }
  const e = p[p.length - 1];
  pts.push({ x: e[0], y: e[1], z: e[2], s, nx: 0, ny: 0 });
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    pts[i].nx = -(b.y - a.y) / l; pts[i].ny = (b.x - a.x) / l;
  }
  return pts;
}

/** Light from the lamps at distance s along and height h above the floor, across o from the middle. */
function light(s: number, h: number, o: number, len: number) {
  const n = Math.max(1, Math.round(len / LAMP)), gap = len / n;
  const k = Math.round((s - gap / 2) / gap), along = s - (k * gap + gap / 2);
  const d2 = along * along + (TUNNEL.crown - 0.2 - h) ** 2 + o * o;
  return 0.035 + 0.9 * Math.exp(-d2 / 10);
}

/** Metres apart that two bores' portals share one headwall (read when called: map.ts imports this module). */
const sideBySide = () => 2 * TUNNEL.face + 4;

interface Portal { t: Tunnel; end: 0 | 1; x: number; y: number; z: number; dx: number; dy: number }
type Bounds = number[] | undefined;

/** A tunnel crossing into the next square is cut at the square's edge, deep under the hill: that end
 *  is no portal. b: the square's [west, south, east, north]. */
function onSeam(x: number, y: number, b: Bounds) {
  return !!b && Math.min(Math.abs(x - b[0]), Math.abs(y - b[1]), Math.abs(x - b[2]), Math.abs(y - b[3])) < 0.5;
}

/** Every portal, each with the tunnel it opens and which end. */
function allPortals(tn: Tunnel[], b: Bounds): Portal[] {
  const out: Portal[] = [];
  for (const t of tn) if (t.p.length > 1) portals(t).forEach((m, e) => { if (!onSeam(m.x, m.y, b)) out.push({ t, end: e as 0 | 1, ...m }); });
  return out;
}

/** The portals that open side by side, facing the same way, in groups (a lone portal is a group of one). */
function headwalls(tn: Tunnel[], b: Bounds): Portal[][] {
  const ps = allPortals(tn, b), group = ps.map((_, i) => i);
  const root = (i: number): number => (group[i] === i ? i : (group[i] = root(group[i])));
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
    const a = ps[i], b = ps[j];
    if (a.t === b.t || a.dx * b.dx + a.dy * b.dy < 0.9) continue;
    const ox = b.x - a.x, oy = b.y - a.y;
    if (Math.hypot(ox, oy) < sideBySide() && Math.abs(ox * a.dx + oy * a.dy) < 8) group[root(j)] = root(i);
  }
  const out = new Map<number, Portal[]>();
  ps.forEach((p, i) => { const r = root(i); if (!out.has(r)) out.set(r, []); out.get(r)!.push(p); });
  return [...out.values()];
}

/** Bores coming out side by side are run out to the same line, square to them, so one headwall
 *  closes both: each one that stops short is carried on, level, to the outermost. Run before
 *  anything reads the tunnels; running it again changes nothing. */
export function alignPortals(tn: Tunnel[], b?: Bounds) {
  for (const g of headwalls(tn, b)) {
    if (g.length < 2) continue;
    let nx = 0, ny = 0;
    for (const m of g) { nx += m.dx; ny += m.dy; }
    const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    const out = Math.min(...g.map((m) => m.x * nx + m.y * ny));
    for (const m of g) {
      const by = (m.x * nx + m.y * ny - out) / Math.max(0.5, m.dx * nx + m.dy * ny);
      if (by < 0.05) continue;
      const q = [m.x - m.dx * by, m.y - m.dy * by, m.z];
      if (m.end === 0) m.t.p.unshift(q); else m.t.p.push(q);
    }
  }
}

/** Where each portal is and which way the tunnel goes in from it, data coords. */
function portals(t: Tunnel) {
  const p = t.p, out: { x: number; y: number; z: number; dx: number; dy: number }[] = [];
  for (const [a, b] of [[p[0], p[1]], [p[p.length - 1], p[p.length - 2]]]) {
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    out.push({ x: a[0], y: a[1], z: a[2], dx: (b[0] - a[0]) / l, dy: (b[1] - a[1]) / l });
  }
  return out;
}

/** The tube's mouths, for the terrain shader: (x, z, into x, into z) and (floor, arch, half width, depth), scene coords. */
export function mouths(map: GameMap): { a: THREE.Vector4[]; b: THREE.Vector4[] } {
  const a: THREE.Vector4[] = [], b: THREE.Vector4[] = [];
  alignPortals(map.d.tn ?? [], map.d.b);
  // (piece by piece along the tube, which bends: a straight cut from the portal left the hillside
  // standing in the tube a few metres round a bend; and no further than its far portal)
  for (const t of map.d.tn ?? []) for (const p of [t.p, [...t.p].reverse()]) {
    if (p.length < 2 || onSeam(p[0][0], p[0][1], map.d.b)) continue;
    for (let i = 0, s = 0; i < p.length - 1 && s < MOUTH; i++) {
      const l = Math.hypot(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]);
      if (l < 1e-3) continue;
      const dx = (p[i + 1][0] - p[i][0]) / l, dy = (p[i + 1][1] - p[i][1]) / l;
      a.push(new THREE.Vector4(p[i][0], -p[i][1], dx, -dy));
      b.push(new THREE.Vector4(Math.min(p[i][2], p[i + 1][2]) - map.z0, TUNNEL.crown, TUNNEL.half, l + 0.3));
      s += l;
    }
  }
  // and none of the hill's slope standing in the cutting in front of a headwall, between its wing
  // walls, where the apron is the ground (the ground's grid is too coarse to rise straight up the wall)
  for (const w of walls(map)) {
    const c = (w.left + w.right) / 2, x = w.cx + w.nx * c - w.dx * w.reach, y = w.cy + w.ny * c - w.dy * w.reach;
    a.push(new THREE.Vector4(x, -y, w.dx, -w.dy));
    b.push(new THREE.Vector4(w.z - map.z0, 60, (w.right - w.left) / 2, w.reach + 0.3));
  }
  return { a, b };
}

export function buildTunnels(map: GameMap, scene: THREE.Object3D) {
  const tunnels = map.d.tn ?? [];
  if (!tunnels.length) return;
  alignPortals(tunnels, map.d.b);
  const Z0 = map.z0, prof = profile();
  // distance round the profile, for the texture
  const round = [0];
  for (let i = 1; i < prof.length; i++) round.push(round[i - 1] + Math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]));
  const brick = TX.wall("brick", false);
  brick.wrapS = brick.wrapT = THREE.RepeatWrapping;
  const tubeMat = new THREE.MeshBasicMaterial({ map: brick, vertexColors: true, side: THREE.DoubleSide });
  const floorMat = new THREE.MeshBasicMaterial({ map: TX.asphalt(), vertexColors: true, side: THREE.DoubleSide });
  const lampGeo = new THREE.BoxGeometry(0.5, 0.12, 0.3);
  const lampMat = new THREE.MeshBasicMaterial({ color: "#ffe2a0" });
  const stone = new THREE.MeshLambertMaterial({ color: "#cdbb93" });

  for (const t of tunnels) {
    const pts = resample(t.p), len = pts[pts.length - 1].s;
    for (let c0 = 0; c0 < pts.length - 1; c0 += CHUNK) {
      const ring = pts.slice(c0, Math.min(pts.length, c0 + CHUNK + 1));
      const pos: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = [];
      const fpos: number[] = [], fuv: number[] = [], fcol: number[] = [], fidx: number[] = [];
      for (const q of ring) {
        prof.forEach(([o, h], k) => {
          pos.push(q.x + q.nx * o, q.z - Z0 + h, -(q.y + q.ny * o));
          uv.push(q.s / 3.4, round[k] / 3.4);
          const l = light(q.s, h, o, len);
          col.push(l, l * 0.93, l * 0.82);
        });
        for (const o of [TUNNEL.half, -TUNNEL.half]) {
          fpos.push(q.x + q.nx * o, q.z - Z0 + 0.02, -(q.y + q.ny * o));
          fuv.push(o / 4, q.s / 4);
          const l = light(q.s, 0, o, len);
          fcol.push(l, l * 0.93, l * 0.82);
        }
      }
      const P = prof.length;
      for (let i = 0; i < ring.length - 1; i++) {
        for (let k = 0; k < P - 1; k++) { const a = i * P + k, b = a + P; idx.push(a, b, a + 1, a + 1, b, b + 1); }
        const a = i * 2; fidx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
      for (const [p, u, c, ix, mat] of [[pos, uv, col, idx, tubeMat], [fpos, fuv, fcol, fidx, floorMat]] as const) {
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(p as number[], 3));
        g.setAttribute("uv", new THREE.Float32BufferAttribute(u as number[], 2));
        g.setAttribute("color", new THREE.Float32BufferAttribute(c as number[], 3));
        g.setIndex(ix as number[]);
        g.computeVertexNormals();
        scene.add(new THREE.Mesh(g, mat as THREE.Material));
      }
    }
    // lamps along the crown
    const n = Math.max(1, Math.round(len / LAMP)), gap = len / n;
    const lamps = new THREE.InstancedMesh(lampGeo, lampMat, n), m = new THREE.Matrix4(), q = new THREE.Quaternion();
    for (let k = 0, j = 0; k < n; k++) {
      const s = k * gap + gap / 2;
      while (j < pts.length - 2 && pts[j + 1].s < s) j++;
      const a = pts[j], b = pts[j + 1], f = (s - a.s) / ((b.s - a.s) || 1);
      const x = a.x + (b.x - a.x) * f, y = a.y + (b.y - a.y) * f, z = a.z + (b.z - a.z) * f;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(a.ny, a.nx));
      lamps.setMatrixAt(k, m.compose(new THREE.Vector3(x, z - Z0 + TUNNEL.crown - 0.12, -y), q, new THREE.Vector3(1, 1, 1)));
    }
    lamps.computeBoundingSphere();
    scene.add(lamps);
  }
  // the headwalls: one round the arch of each portal, or across the arches of bores side by side,
  // from below the floor to above the hill over them, with a wing wall holding up each side of the
  // cutting in front where the hill beside it is high
  const wingMat = stone, apronMat = new THREE.MeshLambertMaterial({ color: "#647347" });
  for (const w of walls(map)) {
    const { g, dx, dy, nx, ny, cx, cy, z, at, mid, left, right, top } = w;
    const shape = new THREE.Shape([[left, -1], [right, -1], [right, top], [left, top]].map(([x, y]) => new THREE.Vector2(x, y)));
    g.forEach((m, k) => {
      const off = at[k] - mid, lift = m.z - z;
      shape.holes.push(new THREE.Path(prof.map(([u, h]) => new THREE.Vector2(off + u, lift + Math.max(-0.5, h === 0 ? -0.5 : h)))));
    });
    const face = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: FACE_DEPTH, bevelEnabled: false }), stone);
    face.position.set(cx, z - Z0, -cy);
    // local +z goes into the tunnel; local +x is the tunnel's left, matching the profile
    face.rotation.y = Math.atan2(dx, -dy);
    face.castShadow = face.receiveShadow = true;
    scene.add(face);
    // a coping along the top
    const cope = new THREE.Mesh(new THREE.BoxGeometry(right - left + 0.4, 0.35, FACE_DEPTH + 0.3), stone);
    cope.position.set((left + right) / 2, top + 0.17, FACE_DEPTH / 2);
    face.add(cope);
    // the cutting's floor in front of the face, between the wing walls, just under the road on it
    const ap: number[] = [], ai: number[] = [], cols = Math.max(1, Math.ceil(right - left)), rows = Math.max(1, Math.ceil(w.reach));
    for (let r = 0; r <= rows; r++) {
      const o = (w.reach * r) / rows, mx = cx - dx * o, my = cy - dy * o;
      const h = Math.min(z, map.trueGround(mx + nx * (left + right) / 2, -(my + ny * (left + right) / 2)) + Z0) - 0.03;
      for (let c = 0; c <= cols; c++) {
        const sx = left + ((right - left) * c) / cols;
        ap.push(mx + nx * sx, h - Z0, -(my + ny * sx));
        if (r < rows && c < cols) { const k = r * (cols + 1) + c; ai.push(k, k + 1, k + cols + 1, k + 1, k + cols + 2, k + cols + 1); }
      }
    }
    const apGeo = new THREE.BufferGeometry();
    apGeo.setAttribute("position", new THREE.Float32BufferAttribute(ap, 3));
    apGeo.setIndex(ai);
    apGeo.computeVertexNormals();
    if (apGeo.attributes.normal.getY(0) < 0) apGeo.setIndex(ai.map((_, i) => ai[i - (i % 3) + [0, 2, 1][i % 3]]));
    apGeo.computeVertexNormals();
    const apron = new THREE.Mesh(apGeo, apronMat);
    apron.receiveShadow = true;
    scene.add(apron);
    for (const [end, side, run] of [[left, -1, w.wings[0]], [right, 1, w.wings[1]]] as const) {
      if (run.length < 2) continue;
      const top = run.map(([o, h]) => new THREE.Vector2(o, h - z));
      const pts = [new THREE.Vector2(0, -1), ...top, new THREE.Vector2(run[run.length - 1][0], -1)];
      const geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: WING_THICK, bevelEnabled: false });
      // a coping along its top, a little proud of the wall each side, as the headwall has
      const cap = new THREE.ExtrudeGeometry(new THREE.Shape([...top.map((q) => new THREE.Vector2(q.x, q.y + COPING)), ...[...top].reverse()]),
        { depth: WING_THICK + 0.3, bevelEnabled: false }).translate(0, 0, -0.15);
      // local x out of the tunnel along the cutting, y up, z across to the tunnel's left
      const ox = -dx, oy = -dy, s0 = side < 0 ? end - WING_THICK : end;
      const place = new THREE.Matrix4().makeBasis(new THREE.Vector3(ox, 0, -oy), new THREE.Vector3(0, 1, 0), new THREE.Vector3(nx, 0, -ny))
        .setPosition(cx + nx * s0, z - Z0, -(cy + ny * s0));
      for (const g of [geo, cap]) {
        g.applyMatrix4(place);
        const wing = new THREE.Mesh(g, wingMat);
        wing.castShadow = wing.receiveShadow = true;
        scene.add(wing);
      }
    }
  }
}

const WING = 12;         // metres out along the cutting a wing wall may run
const WING_THICK = 0.6;
const COPING = 0.3;
const HIGH = 1.0;        // metres over the floor the hill beside the cutting must stand to want a wall

interface Headwall {
  g: Portal[]; dx: number; dy: number; nx: number; ny: number; cx: number; cy: number; z: number;
  at: number[]; mid: number; left: number; right: number; top: number;
  /** each side's wing wall, left then right: [metres out from the face, top's height (data)] */
  wings: [number[][], number[][]];
  /** how far out in front of the face the cutting is dug to the floor */
  reach: number;
}

/** Each headwall's place and size: across the arches of its portals, but only as far each way as
 *  the hill stands over them (a wall reaching out over low ground beside the cutting is a bare panel),
 *  and up to above the hill over them; and the wing walls along the cutting in front, as far out as
 *  the hill beside it stands over the road. Ground is the survey's (trueGround), not as drawn. */
function walls(map: GameMap): Headwall[] {
  const out: Headwall[] = [], Z0 = map.z0, ground = (x: number, y: number) => map.trueGround(x, -y) + Z0;
  for (const g of headwalls(map.d.tn ?? [], map.d.b)) {
    let dx = 0, dy = 0;
    for (const m of g) { dx += m.dx; dy += m.dy; }
    const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    const nx = -dy, ny = dx, F = TUNNEL.face, H = TUNNEL.half;
    const at = g.map((m) => m.x * nx + m.y * ny), mid = (Math.min(...at) + Math.max(...at)) / 2;
    const o = g[0], cx = o.x + nx * (mid - at[0]), cy = o.y + ny * (mid - at[0]), z = Math.min(...g.map((m) => m.z));
    const behind = (s: number) => ground(cx + nx * s + dx * (FACE_DEPTH + 1), cy + ny * s + dy * (FACE_DEPTH + 1)) - z;
    let left = Math.min(...at) - mid - F, right = Math.max(...at) - mid + F;
    const leftMost = Math.min(...at) - mid - H - 0.8, rightMost = Math.max(...at) - mid + H + 0.8;
    while (left < leftMost && behind(left) < TUNNEL.crown * 0.6) left = Math.min(leftMost, left + 0.5);
    while (right > rightMost && behind(right) < TUNNEL.crown * 0.6) right = Math.max(rightMost, right - 0.5);
    let top = Math.max(...g.map((m) => m.z)) - z + TUNNEL.crown + 1.2;
    for (let s = left; s <= right; s += 1) for (const d of [0, FACE_DEPTH]) top = Math.max(top, ground(cx + nx * s + dx * d, cy + ny * s + dy * d) - z + 0.4);
    top = Math.min(top, 16);
    // The wall's top runs in straight slopes over the bank it holds, never below it: the survey's
    // every metre gave a lumpy top, a step for each bump in the bank.
    const wing = (s: number, side: number) => {
      const run: number[][] = [];
      let low = false;
      for (let k = 0; k <= WING && !low; k++) {
        const x = cx + nx * (s + side * 1.5) - dx * k, y = cy + ny * (s + side * 1.5) - dy * k, h = ground(x, y) - z;
        low = h < HIGH;
        if (low) { if (run.length) run.push([k, HIGH * 0.5]); }
        else run.push([k, Math.min(top, Math.max(HIGH, h + 0.3))]);
      }
      // (one still holding up a high bank where it may run no further comes down into the side of the
      // cutting there, not to a tall square end standing out over it)
      if (!low && run.length) {
        const k = WING + 3, x = cx + nx * s - dx * k, y = cy + ny * s - dy * k;
        run.push([k, Math.max(HIGH * 0.5, Math.min(run[run.length - 1][1], ground(x, y) - z))]);
      }
      return upperHull(run).map(([k, h]) => [k, z + h]);
    };
    const wings: [number[][], number[][]] = [wing(left, -1), wing(right, 1)];
    const reach = Math.max(2, ...wings.map((w) => (w.length ? w[w.length - 1][0] : 0)));
    out.push({ g, dx, dy, nx, ny, cx, cy, z, at, mid, left, right, top, wings, reach });
  }
  return out;
}

/** The cuttings in front of the headwalls, for the ground (world.ts): dug down to the floor between
 *  the wing walls, out as far as they run, so no slope of hillside stands in front of the arches.
 *  Each is [face's middle x, y, way in x, y, left, right, how far out, floor], data coords. */
export function cuttings(map: GameMap): number[][] {
  return walls(map).map((w) => [w.cx, w.cy, w.dx, w.dy, w.left, w.right, w.reach, w.z]);
}

/** The upper hull of points in order along x: straight runs over them, never below one. */
function upperHull(pts: number[][]): number[][] {
  const out: number[][] = [];
  for (const p of pts) {
    while (out.length >= 2) {
      const a = out[out.length - 2], b = out[out.length - 1];
      if ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= 0) out.pop(); else break;
    }
    out.push(p);
  }
  return out;
}
