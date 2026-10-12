// Builds the three.js scene from the map: terrain, roads, buildings, walls, trees, water and sky.
import * as THREE from "three";
import { BARRIER_HEIGHT, GameMap, Line, PATHS } from "./map";
import * as TX from "./textures";
import { buildFurniture } from "./furniture";

const CHUNK = 320;

/** Accumulates non-indexed triangles with normals, UVs and colours. */
class Geo {
  pos: number[] = []; nor: number[] = []; uv: number[] = []; col: number[] = [];
  tri(a: number[], b: number[], c: number[], n: number[], ua: number[], ub: number[], uc: number[], col: number[]) {
    this.pos.push(...a, ...b, ...c);
    this.nor.push(...n, ...n, ...n);
    this.uv.push(...ua, ...ub, ...uc);
    this.col.push(...col, ...col, ...col);
  }
  /** Quad a-b-c-d (counter-clockwise seen from the front). */
  quad(a: number[], b: number[], c: number[], d: number[], n: number[], ua: number[], ub: number[], uc: number[], ud: number[], col: number[]) {
    this.tri(a, b, c, n, ua, ub, uc, col);
    this.tri(a, c, d, n, ua, uc, ud, col);
  }
  build(): THREE.BufferGeometry | null {
    if (!this.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return g;
  }
}

function hash(n: number) {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

const sub = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: number[]) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Add a quad whose front faces along `out` (so winding never needs thinking about). */
function facing(g: Geo, a: number[], b: number[], c: number[], d: number[], out: number[], ua: number[], ub: number[], uc: number[], ud: number[], col: number[]) {
  const n = norm(cross(sub(b, a), sub(c, a)));
  if (dot(n, out) >= 0) g.quad(a, b, c, d, norm(out), ua, ub, uc, ud, col);
  else g.quad(a, d, c, b, norm(out), ua, ud, uc, ub, col);
}
function facingTri(g: Geo, a: number[], b: number[], c: number[], out: number[], ua: number[], ub: number[], uc: number[], col: number[]) {
  const n = norm(cross(sub(b, a), sub(c, a)));
  if (dot(n, out) >= 0) g.tri(a, b, c, norm(out), ua, ub, uc, col);
  else g.tri(a, c, b, norm(out), ua, uc, ub, col);
}

export interface World {
  scene: THREE.Scene;
  sun: THREE.DirectionalLight;
  update(px: number, py: number, pz: number): void;
}

export function buildWorld(map: GameMap): World {
  const D = map.d, T = D.t, Z0 = map.z0;
  const scene = new THREE.Scene();
  const fogCol = new THREE.Color("#c9d6df");
  scene.background = fogCol;
  scene.fog = new THREE.Fog(fogCol, 60, 480);

  // ---- light ------------------------------------------------------------------
  scene.add(new THREE.HemisphereLight("#cfe0f0", "#6b6a4a", 1.4));
  const sun = new THREE.DirectionalLight("#fff0d8", 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 400 });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  const SUN_DIR = new THREE.Vector3(-0.55, 0.62, 0.56).normalize(); // afternoon sun from the south-west

  // ---- sky dome -----------------------------------------------------------------
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(500, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color("#6f9fd0") }, bottom: { value: fogCol } },
      vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: "uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = clamp(vP.y * 2.2, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, pow(h, 0.7)), 1.0); }",
    }),
  );
  sky.renderOrder = -1;
  scene.add(sky);

  // ---- terrain --------------------------------------------------------------------
  const GROUND = [
    new THREE.Color("#6e7f4c"), // garden and verge grass
    new THREE.Color("#678a45"), // sports pitch
    new THREE.Color("#5a5638"), // woodland floor
    new THREE.Color("#8e9160"), // farmland and meadow
    new THREE.Color("#687a55"), // cemetery
    new THREE.Color("#8f8b82"), // hard standing
  ];
  const earth = new THREE.Color("#7a6a4c");
  const RW: Record<string, number> = { primary: 8.5, secondary: 8, tertiary: 7, residential: 6, unclassified: 5.5, living_street: 5, service: 3.5, unknown: 4, pedestrian: 4, footway: 1.6, steps: 1.8, cycleway: 2, path: 1.4, track: 2.8, bridleway: 2 };
  const KERBED = new Set(["primary", "secondary", "tertiary", "residential", "unclassified"]);
  const PAVE = 1.7;   // pavement width each side of a kerbed street
  // Drawn terrain sits a little lower under streets and paths, so hillsides never poke through
  // them. The player still walks on the true ground height.
  const sink = new Float32Array(T.nx * T.ny);
  for (const r of D.rd) {
    const path = PATHS.has(r.c);
    const reach = (RW[r.c] ?? 4) / 2 + (path ? 0.9 : KERBED.has(r.c) ? PAVE + 0.8 : 0.8), depth = path ? 0.12 : 0.3;
    for (let k = 0; k < r.p.length - 1; k++) {
      const [ax, ay] = r.p[k], [bx, by] = r.p[k + 1], vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1;
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - reach - T.x0) / T.dx)), i1 = Math.min(T.nx - 1, Math.ceil((Math.max(ax, bx) + reach - T.x0) / T.dx));
      const j0 = Math.max(0, Math.floor((Math.min(ay, by) - reach - T.y0) / T.dy)), j1 = Math.min(T.ny - 1, Math.ceil((Math.max(ay, by) + reach - T.y0) / T.dy));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = T.x0 + i * T.dx, y = T.y0 + j * T.dy;
        const t = Math.min(1, Math.max(0, ((x - ax) * vx + (y - ay) * vy) / l2));
        if (Math.hypot(x - ax - vx * t, y - ay - vy * t) < reach) { const v = j * T.nx + i; sink[v] = Math.max(sink[v], depth); }
      }
    }
  }
  const tPos = new Float32Array(T.nx * T.ny * 3), tCol = new Float32Array(T.nx * T.ny * 3), tUv = new Float32Array(T.nx * T.ny * 2);
  const hAt = (i: number, j: number) => T.h[Math.min(T.ny - 1, Math.max(0, j)) * T.nx + Math.min(T.nx - 1, Math.max(0, i))] / 10;
  const c = new THREE.Color();
  for (let j = 0; j < T.ny; j++) for (let i = 0; i < T.nx; i++) {
    const v = j * T.nx + i, x = T.x0 + i * T.dx, z = -(T.y0 + j * T.dy);
    tPos.set([x, hAt(i, j) - sink[v], z], v * 3);
    tUv.set([x / 7, z / 7], v * 2);
    const slope = Math.hypot(hAt(i + 1, j) - hAt(i - 1, j), hAt(i, j + 1) - hAt(i, j - 1)) / (2 * T.dx);
    c.copy(GROUND[+T.k[v]] ?? GROUND[0]);
    c.lerp(earth, Math.min(0.75, Math.max(0, (slope - 0.45) * 1.4)));
    const n = 0.9 + hash(v) * 0.16;
    tCol.set([c.r * n, c.g * n, c.b * n], v * 3);
  }
  const tIdx: number[] = [];
  for (let j = 0; j < T.ny - 1; j++) for (let i = 0; i < T.nx - 1; i++) {
    const a = j * T.nx + i, b = a + 1, cc = a + T.nx, d = cc + 1;
    tIdx.push(a, b, cc, b, d, cc);
  }
  const terrGeo = new THREE.BufferGeometry();
  terrGeo.setAttribute("position", new THREE.BufferAttribute(tPos, 3));
  terrGeo.setAttribute("color", new THREE.BufferAttribute(tCol, 3));
  terrGeo.setAttribute("uv", new THREE.BufferAttribute(tUv, 2));
  terrGeo.setIndex(tIdx);
  terrGeo.computeVertexNormals();
  const groundTex = TX.groundDetail();
  const terrain = new THREE.Mesh(terrGeo, new THREE.MeshLambertMaterial({ vertexColors: true, map: groundTex }));
  terrain.receiveShadow = true;
  scene.add(terrain);

  // ground beyond the map edge, so the world doesn't end in a cliff
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: "#66774a" }));
  outer.position.y = 60;
  scene.add(outer);
  const skirt: number[] = [];
  const edgeLine = (pts: [number, number][]) => {
    for (let k = 0; k < pts.length - 1; k++) {
      const [i, j] = pts[k], [i2, j2] = pts[k + 1];
      const ax = T.x0 + i * T.dx, az = -(T.y0 + j * T.dy), bx = T.x0 + i2 * T.dx, bz = -(T.y0 + j2 * T.dy);
      skirt.push(ax, hAt(i, j), az, bx, hAt(i2, j2), bz, bx, 0, bz, ax, hAt(i, j), az, bx, 0, bz, ax, 0, az);
    }
  };
  const rng = (n: number) => [...Array(n).keys()];
  edgeLine(rng(T.nx).map((i) => [i, 0])); edgeLine(rng(T.nx).map((i) => [i, T.ny - 1]));
  edgeLine(rng(T.ny).map((j) => [0, j])); edgeLine(rng(T.ny).map((j) => [T.nx - 1, j]));
  const skirtGeo = new THREE.BufferGeometry();
  skirtGeo.setAttribute("position", new THREE.Float32BufferAttribute(skirt, 3));
  skirtGeo.computeVertexNormals();
  scene.add(new THREE.Mesh(skirtGeo, new THREE.MeshLambertMaterial({ color: "#5d6b3f", side: THREE.DoubleSide })));

  // ---- ribbons draped on the terrain -------------------------------------------------
  const ribbon = (lines: { p: number[][] }[], width: (l: any) => number, lift: number) => {
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (const L of lines) {
      const p = L.p, w = width(L) / 2, n = p.length, base = pos.length / 3;
      if (n < 2) continue;
      const seg: number[][] = [];
      for (let i = 0; i < n - 1; i++) {
        const dx = p[i + 1][0] - p[i][0], dy = p[i + 1][1] - p[i][1], l = Math.hypot(dx, dy) || 1;
        seg.push([-dy / l, dx / l, l]);
      }
      let along = 0;
      for (let i = 0; i < n; i++) {
        const a = seg[Math.max(0, i - 1)], b = seg[Math.min(seg.length - 1, i)];
        let nx = a[0] + b[0], ny = a[1] + b[1];
        const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
        const s = w / Math.max(0.5, nx * b[0] + ny * b[1]);
        const lx = p[i][0] + nx * s, ly = p[i][1] + ny * s, rx = p[i][0] - nx * s, ry = p[i][1] - ny * s;
        pos.push(lx, map.ground(lx, -ly) + lift, -ly, rx, map.ground(rx, -ry) + lift, -ry);
        uv.push(0, along / 4, w / 2, along / 4);
        if (i < n - 1) { const k = base + i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); along += seg[i][2]; }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };
  // Raised strips along lines, with vertical edges down into the ground: roads with kerbs,
  // pavements and paths. bands are [from, to] offsets across the line (left is positive).
  // skip(x, y) leaves gaps, e.g. where a pavement would cross another street.
  const strips = (lines: { p: number[][] }[], bands: (l: any) => [number, number][], lift: number,
    skip?: (l: any, x: number, y: number) => boolean, edges = true) => {
    const g = new Geo(), white = [1, 1, 1];
    for (const L of lines) {
      // resample every 2 m so the strip follows the ground closely
      const p: number[][] = [];
      for (let i = 0; i < L.p.length - 1; i++) {
        const [ax, ay] = L.p[i], [bx, by] = L.p[i + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 2));
        for (let s = 0; s < n; s++) p.push([ax + (bx - ax) * s / n, ay + (by - ay) * s / n]);
      }
      p.push(L.p[L.p.length - 1]);
      if (p.length < 2) continue;
      const nrm: number[][] = [], along: number[] = [0];
      for (let i = 0; i < p.length; i++) {
        const a = Math.max(0, i - 1), b = Math.min(p.length - 1, i + 1);
        const dx = p[b][0] - p[a][0], dy = p[b][1] - p[a][1], l = Math.hypot(dx, dy) || 1;
        nrm.push([-dy / l, dx / l]);
        if (i) along.push(along[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
      }
      for (const [o1, o2] of bands(L)) {
        const at = (i: number, o: number) => {
          const x = p[i][0] + nrm[i][0] * o, y = p[i][1] + nrm[i][1] * o, top = map.ground(x, -y) + lift;
          return { x, y, top, foot: top - lift - 0.35 };
        };
        for (let i = 0; i < p.length - 1; i++) {
          const a1 = at(i, o1), a2 = at(i, o2), b1 = at(i + 1, o1), b2 = at(i + 1, o2);
          if (skip && (skip(L, (a1.x + a2.x) / 2, (a1.y + a2.y) / 2) || skip(L, (b1.x + b2.x) / 2, (b1.y + b2.y) / 2))) continue;
          const u0 = along[i] / 4, u1 = along[i + 1] / 4;
          facing(g, [a1.x, a1.top, -a1.y], [b1.x, b1.top, -b1.y], [b2.x, b2.top, -b2.y], [a2.x, a2.top, -a2.y], [0, 1, 0],
            [o1 / 4, u0], [o1 / 4, u1], [o2 / 4, u1], [o2 / 4, u0], white);
          // kerb faces on both edges
          if (edges) for (const [e, side] of [[o1, -1], [o2, 1]] as const) {
            const ea = at(i, e), eb = at(i + 1, e), n = nrm[i];
            const out = [n[0] * side, 0, -n[1] * side];
            facing(g, [ea.x, ea.foot, -ea.y], [eb.x, eb.foot, -eb.y], [eb.x, eb.top, -eb.y], [ea.x, ea.top, -ea.y], out,
              [u0, 0], [u1, 0], [u1, 0.1], [u0, 0.1], white);
          }
        }
      }
    }
    return g.build();
  };
  const flatMat = (color: string, off: number, map?: THREE.Texture) =>
    new THREE.MeshLambertMaterial({ color, map, polygonOffset: true, polygonOffsetFactor: -off, polygonOffsetUnits: -off * 2 });
  const asphalt = TX.asphalt();
  const vehicle = D.rd.filter((r) => !PATHS.has(r.c));
  const kerbed = vehicle.filter((r) => KERBED.has(r.c));
  const addFlat = (g: THREE.BufferGeometry | null, m: THREE.Material) => {
    if (!g) return;
    const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; scene.add(mesh);
  };
  // street centrelines in a grid, so pavements can stop where they meet another street
  const streetCells = new Map<string, { r: unknown; a: number[]; b: number[]; w: number }[]>();
  for (const r of vehicle) for (let k = 0; k < r.p.length - 1; k++) {
    const a = r.p[k], b = r.p[k + 1], w = (RW[r.c] ?? 4) / 2;
    for (const [x, y] of [a, b, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]]) {
      const key = `${Math.floor(x / 10)},${Math.floor(y / 10)}`;
      (streetCells.get(key) ?? streetCells.set(key, []).get(key)!).push({ r, a, b, w });
    }
  }
  const onOtherStreet = (own: unknown, x: number, y: number) => {
    const cx = Math.floor(x / 10), cy = Math.floor(y / 10);
    for (let i = cx - 1; i <= cx + 1; i++) for (let j = cy - 1; j <= cy + 1; j++) {
      for (const s of streetCells.get(`${i},${j}`) ?? []) {
        if (s.r === own) continue;
        const vx = s.b[0] - s.a[0], vy = s.b[1] - s.a[1], l2 = vx * vx + vy * vy || 1;
        const t = Math.min(1, Math.max(0, ((x - s.a[0]) * vx + (y - s.a[1]) * vy) / l2));
        if (Math.hypot(x - s.a[0] - vx * t, y - s.a[1] - vy * t) < s.w + 0.4) return true;
      }
    }
    return false;
  };
  const half = (r: { c: string }) => (RW[r.c] ?? 4) / 2;
  addFlat(strips(D.rd.filter((r) => PATHS.has(r.c)), (r) => [[-half(r), half(r)]], 0.1), flatMat("#a59577", 1, groundTex));
  addFlat(strips(vehicle.filter((r) => r.c === "service" || r.c === "unknown"), (r) => [[-half(r), half(r)]], 0.05, undefined, false), flatMat("#55575b", 2, asphalt));
  // carriageways have no edge faces: they'd show as lines across junctions, and the pavement kerbs cover them
  addFlat(strips(kerbed, (r) => [[-half(r), half(r)]], 0.07, undefined, false), flatMat("#4f5155", 3, asphalt));
  addFlat(strips(kerbed, (r) => [[half(r), half(r) + PAVE], [-half(r) - PAVE, -half(r)]], 0.2, onOtherStreet), flatMat("#a29f97", 2, asphalt));
  addFlat(ribbon(D.wl, () => 1.6, 0.05), flatMat("#4c7b94", 2));

  // ponds and the lake
  for (const w of D.wp) {
    const shape = new THREE.Shape(w.r[0].map(([x, y]) => new THREE.Vector2(x, y)));
    for (const hole of w.r.slice(1)) shape.holes.push(new THREE.Path(hole.map(([x, y]) => new THREE.Vector2(x, y))));
    const g = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: "#46718a", polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
    m.position.y = w.z - Z0;
    scene.add(m);
  }

  // ---- buildings, merged into chunks -------------------------------------------------
  // Each chunk keeps one geometry per surface: walls by material (with or without windows),
  // and roofs. Vertex colours tint each building.
  type Surf = "s" | "k" | "y" | "r";
  const chunks = new Map<string, Map<string, Geo>>();
  const geoFor = (x: number, y: number, key: string) => {
    const k = `${Math.floor(x / CHUNK)},${Math.floor(y / CHUNK)}`;
    let c = chunks.get(k);
    if (!c) chunks.set(k, (c = new Map()));
    let g = c.get(key);
    if (!g) c.set(key, (g = new Geo()));
    return g;
  };
  const WALL_TINTS: Record<Surf, number[][]> = {
    s: [[0.96, 0.86, 0.66], [0.93, 0.82, 0.6], [0.9, 0.84, 0.72], [0.98, 0.9, 0.74], [0.88, 0.8, 0.66]],   // Bath stone
    k: [[0.74, 0.44, 0.33], [0.68, 0.4, 0.31], [0.78, 0.5, 0.38], [0.64, 0.42, 0.34]],                   // red brick
    y: [[0.9, 0.77, 0.55], [0.86, 0.72, 0.5], [0.92, 0.8, 0.6]],                                        // buff brick
    r: [[0.96, 0.95, 0.91], [0.93, 0.91, 0.85], [0.97, 0.93, 0.83], [0.9, 0.9, 0.88]],                  // render
  };
  const ROOF_TINTS: Record<string, number[][]> = {
    s: [[0.34, 0.36, 0.41], [0.3, 0.32, 0.37], [0.38, 0.39, 0.43]],   // slate
    p: [[0.7, 0.4, 0.26], [0.64, 0.36, 0.24], [0.74, 0.46, 0.3]],     // clay pantiles
    c: [[0.48, 0.38, 0.32], [0.42, 0.35, 0.31], [0.52, 0.45, 0.4]],   // concrete tiles
    g: [[0.42, 0.43, 0.46], [0.36, 0.37, 0.4]],                       // modern grey tiles
  };
  const pick = <T,>(a: T[], r: number) => a[Math.floor(r * a.length) % a.length];
  const POT = [0.62, 0.34, 0.24];
  /** Box from (x, y) footprint centre, half-sizes along u and across, from y0 to y1. */
  const boxAt = (g: Geo, x: number, y: number, u: number[], hu: number, hv: number, y0: number, y1: number, col: number[]) => {
    const v = [-u[1], u[0]];
    const C = (su: number, sv: number, h: number) => [x + u[0] * su + v[0] * sv, h, -(y + u[1] * su + v[1] * sv)];
    const corners: [number, number][] = [[-hu, -hv], [hu, -hv], [hu, hv], [-hu, hv]];
    for (let k = 0; k < 4; k++) {
      const [a1, b1] = corners[k], [a2, b2] = corners[(k + 1) % 4];
      const mx = (a1 + a2) / 2, my = (b1 + b2) / 2;
      const out = [u[0] * mx + v[0] * my, 0, -(u[1] * mx + v[1] * my)];
      facing(g, C(a1, b1, y0), C(a2, b2, y0), C(a2, b2, y1), C(a1, b1, y1), out, [0, 0], [1, 0], [1, 1], [0, 1], col);
    }
    facing(g, C(-hu, -hv, y1), C(hu, -hv, y1), C(hu, hv, y1), C(-hu, hv, y1), [0, 1, 0], [0, 0], [1, 0], [1, 1], [0, 1], col);
  };
  /** Triangle with its true normal, turned to face along `hint`. */
  const triAuto = (g: Geo, a: number[], b: number[], c: number[], hint: number[], ua: number[], ub: number[], uc: number[], col: number[]) => {
    let n = norm(cross(sub(b, a), sub(c, a)));
    if (dot(n, hint) < 0) n = n.map((k) => -k);
    facingTri(g, a, b, c, n, ua, ub, uc, col);
  };

  D.bl.forEach((b, bi) => {
    const outerRing = b.r[0];
    let cx = 0, cy = 0;
    for (const [x, y] of outerRing) { cx += x; cy += y; }
    cx /= outerRing.length; cy /= outerRing.length;
    const surf = ((b.m as Surf) in WALL_TINTS ? b.m : "s") as Surf;
    const walls = geoFor(cx, cy, surf + (b.w ? "w" : "p"));
    const plain = geoFor(cx, cy, surf + "p");
    const roofs = geoFor(cx, cy, "roof");
    const ground = b.g - Z0, eave = ground + b.h, base = ground - 0.6;
    const wallCol = pick(WALL_TINTS[surf], hash(bi * 3 + 1));
    const roofCol = pick(ROOF_TINTS[b.rc ?? "s"] ?? ROOF_TINTS.s, hash(bi * 5 + 2));

    b.r.forEach((ring, ri) => {
      let area = 0;
      for (let i = 0; i < ring.length; i++) { const a = ring[i], q = ring[(i + 1) % ring.length]; area += a[0] * q[1] - q[0] * a[1]; }
      const sign = (area > 0 ? 1 : -1) * (ri === 0 ? 1 : -1);
      let along = hash(bi + 3) * 3.4;
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], q = ring[(i + 1) % ring.length];
        const ex = q[0] - a[0], ey = q[1] - a[1], len = Math.hypot(ex, ey);
        if (len < 0.05) continue;
        const out = [sign * ey / len, 0, sign * ex / len]; // (x, north) normal (ey, -ex) -> scene (x, -north)
        const u0 = along / 3.4, u1 = (along + len) / 3.4;
        // windows sit at the same height on every storey: storeys are eaves / round(eaves / 3)
        const storey = b.h / Math.max(1, Math.round(b.h / 2.9));
        const v0 = (base - ground) / storey, v1 = b.h / storey;
        facing(walls, [a[0], base, -a[1]], [q[0], base, -q[1]], [q[0], eave, -q[1]], [a[0], eave, -a[1]], out,
          [u0, v0], [u1, v0], [u1, v1], [u0, v1], wallCol);
        along += len;
      }
    });

    if (b.rr && b.rp) {
      // pitched roof over a rectangle whose first edge (q0 -> q1) runs along the ridge
      const q = b.rr;
      const ux = q[1][0] - q[0][0], uy = q[1][1] - q[0][1], L = Math.hypot(ux, uy) || 1;
      const vx = q[3][0] - q[0][0], vy = q[3][1] - q[0][1], Wd = Math.hypot(vx, vy) || 1;
      const mx = (q[0][0] + q[2][0]) / 2, my = (q[0][1] + q[2][1]) / 2;
      const u = [ux / L, uy / L], v = [vx / Wd, vy / Wd];
      const attached = b.c === "terrace" || b.c === "semi";
      const OHs = 0.3, OHe = attached ? 0 : 0.3;          // overhang at the sides and at the ends
      const [hip0, hip1] = b.hp ?? [0, 0];
      const hl0 = L / 2 + (hip0 ? OHs : OHe), hl1 = L / 2 + (hip1 ? OHs : OHe), hw = Wd / 2 + OHs;
      const ridge = eave + b.rp, drop = (OHs * b.rp) / (Wd / 2);
      const P = (su: number, sv: number, h: number) => [mx + u[0] * su + v[0] * sv, h, -(my + u[1] * su + v[1] * sv)];
      // a hipped end pulls the ridge in by the half-width, so the hip slopes like the sides
      let ra = -hl0 + (hip0 ? hw : 0), rb = hl1 - (hip1 ? hw : 0);
      if (ra > rb) ra = rb = (ra + rb) / 2;
      const rA = P(ra, 0, ridge), rB = P(rb, 0, ridge);
      const slopeW = Math.hypot(hw, b.rp);
      for (const side of [-1, 1]) {
        const e0 = P(-hl0, side * hw, eave - drop), e1 = P(hl1, side * hw, eave - drop);
        const n = norm([v[0] * side * b.rp, hw, -(v[1] * side * b.rp)]);
        facing(roofs, e0, e1, rB, rA, n, [0, 0], [L / 2, 0], [(rb + hl0) / 2, slopeW / 2], [(ra + hl0) / 2, slopeW / 2], roofCol);
      }
      for (const [end, hip, hl, r] of [[-1, hip0, hl0, rA], [1, hip1, hl1, rB]] as const) {
        const hint = [u[0] * end, 0.5, -u[1] * end];
        if (hip) {
          const c0 = P(end * hl, -hw, eave - drop), c1 = P(end * hl, hw, eave - drop);
          triAuto(roofs, c0, c1, r as number[], hint, [0, 0], [Wd / 2, 0], [Wd / 4, slopeW / 2], roofCol);
        } else {
          // gable end: a wall triangle over the end wall
          const g0 = P(end * L / 2, -Wd / 2, eave), g1 = P(end * L / 2, Wd / 2, eave), top = P(end * L / 2, 0, ridge);
          const storey = b.h / Math.max(1, Math.round(b.h / 2.9));
          facingTri(plain, g0, g1, top, [u[0] * end, 0, -u[1] * end], [0, b.h / storey], [Wd / 3.4, b.h / storey], [Wd / 6.8, (b.h + b.rp) / storey], wallCol);
        }
      }
      // chimney stacks on the ridge, each with two pots
      for (const [x, y] of b.ch ?? []) {
        const s = (x - mx) * u[0] + (y - my) * u[1];
        const top = ridge + 0.95;
        // stacks off the ridge (on a hip) start lower so they still meet the roof
        const along = Math.min(1, Math.max(0, (s < ra ? (s + hl0) / Math.max(0.1, ra + hl0) : s > rb ? (hl1 - s) / Math.max(0.1, hl1 - rb) : 1)));
        boxAt(plain, x, y, u, 0.3, 0.55, eave + b.rp * along * 0.5, top, wallCol);
        for (const off of [-0.22, 0.22]) boxAt(roofs, x + v[0] * off, y + v[1] * off, u, 0.1, 0.1, top, top + 0.38, POT);
      }
    } else {
      // flat roof with a little parapet colour
      const contour = outerRing.map(([x, y]) => new THREE.Vector2(x, y));
      const holes = b.r.slice(1).map((h) => h.map(([x, y]) => new THREE.Vector2(x, y)));
      const tris = THREE.ShapeUtils.triangulateShape(contour, holes);
      const all = [...contour, ...holes.flat()];
      const fc = [0.42, 0.42, 0.43];
      for (const [i, j, k] of tris) {
        const A = all[i], B = all[j], C = all[k];
        facingTri(roofs, [A.x, eave, -A.y], [B.x, eave, -B.y], [C.x, eave, -C.y], [0, 1, 0], [A.x / 2, A.y / 2], [B.x / 2, B.y / 2], [C.x / 2, C.y / 2], fc);
      }
    }
  });
  const wallMats: Record<string, THREE.Material> = {};
  for (const sfc of ["s", "k", "y", "r"] as Surf[]) {
    const kind = sfc === "s" ? "stone" : sfc === "r" ? "render" : "brick";
    wallMats[sfc + "w"] = new THREE.MeshLambertMaterial({ map: TX.wall(kind, true), vertexColors: true });
    wallMats[sfc + "p"] = new THREE.MeshLambertMaterial({ map: TX.wall(kind, false), vertexColors: true });
  }
  wallMats.roof = new THREE.MeshLambertMaterial({ map: TX.roofTiles(), vertexColors: true, side: THREE.DoubleSide });  // undersides of the eaves show from the street
  for (const c of chunks.values()) {
    for (const [key, geo] of c) {
      const g = geo.build();
      if (!g) continue;
      const m = new THREE.Mesh(g, wallMats[key]);
      m.castShadow = m.receiveShadow = true;
      scene.add(m);
    }
  }

  // ---- walls, fences and hedges -------------------------------------------------------------
  // material, thickness and colour of each kind of wall, fence and hedge
  type BarMat = "stone" | "brick" | "leaf" | "wood" | "iron";
  const BAR: Record<string, { mat: BarMat; t: number; col: number[] }> = {
    wall: { mat: "stone", t: 0.45, col: [0.86, 0.78, 0.6] }, retaining_wall: { mat: "stone", t: 0.5, col: [0.8, 0.73, 0.57] },
    stone_wall: { mat: "stone", t: 0.45, col: [0.84, 0.76, 0.58] }, garden_wall: { mat: "stone", t: 0.35, col: [0.9, 0.82, 0.64] },
    brick_wall: { mat: "brick", t: 0.3, col: [0.7, 0.42, 0.32] }, brick_wall_low: { mat: "brick", t: 0.3, col: [0.72, 0.45, 0.34] },
    fence: { mat: "wood", t: 0.08, col: [0.55, 0.42, 0.3] },
    hedge: { mat: "leaf", t: 0.9, col: [0.42, 0.58, 0.3] }, hedge_low: { mat: "leaf", t: 0.7, col: [0.46, 0.62, 0.32] },
    railing: { mat: "iron", t: 0.05, col: [0.16, 0.17, 0.18] },
  };
  const barGeos = new Map<string, Geo>();
  const barGeo = (x: number, y: number, mat: BarMat) => {
    const k = `${mat}:${Math.floor(x / CHUNK)},${Math.floor(y / CHUNK)}`;
    let g = barGeos.get(k);
    if (!g) barGeos.set(k, (g = new Geo()));
    return g;
  };
  const barrierRun = (l: Line) => {
    const spec = BAR[l.c] ?? BAR.wall, hh = BARRIER_HEIGHT[l.c] ?? 1.5, t = spec.t / 2;
    const g = barGeo(l.p[0][0], l.p[0][1], spec.mat);
    const tint = hash(Math.round(l.p[0][0] * 7 + l.p[0][1] * 13)) * 0.12 + 0.94;
    const col = spec.col.map((c) => c * tint);
    let along = 0;
    for (let i = 0; i < l.p.length - 1; i++) {
      const a = l.p[i], q = l.p[i + 1];
      const ex = q[0] - a[0], ey = q[1] - a[1], len = Math.hypot(ex, ey);
      if (len < 0.05) continue;
      const nx = ey / len * t, ny = -ex / len * t;
      const ga = a[2] - Z0, gq = q[2] - Z0;
      const c4 = [[a[0] + nx, a[1] + ny, ga], [q[0] + nx, q[1] + ny, gq], [q[0] - nx, q[1] - ny, gq], [a[0] - nx, a[1] - ny, ga]];
      const P = (k: number, top: boolean) => [c4[k][0], top ? c4[k][2] + hh : c4[k][2] - 0.4, -c4[k][1]];
      const u0 = along / 2, u1 = (along + len) / 2, vt = (hh + 0.4) / 2;
      facing(g, P(0, false), P(1, false), P(1, true), P(0, true), [nx, 0, -ny], [u0, 0], [u1, 0], [u1, vt], [u0, vt], col);
      facing(g, P(3, false), P(2, false), P(2, true), P(3, true), [-nx, 0, ny], [u0, 0], [u1, 0], [u1, vt], [u0, vt], col);
      if (spec.mat !== "iron") {
        // stone and brick walls get a slightly darker coping along the top
        const top = spec.mat === "stone" || spec.mat === "brick" ? col.map((c) => c * 0.85) : col;
        facing(g, P(0, true), P(1, true), P(2, true), P(3, true), [0, 1, 0], [u0, 0], [u1, 0], [u1, t], [u0, t], top);
      }
      along += len;
    }
  };
  D.br.forEach(barrierRun);

  // garden gates: pillars either side, and a gate standing a little open
  for (const gt of D.gt ?? []) {
    const [x0, y0, x1, y1, z, style] = gt as [number, number, number, number, number, string];
    const spec = BAR[style] ?? BAR.garden_wall, hh = BARRIER_HEIGHT[style] ?? 1;
    const ux = x1 - x0, uy = y1 - y0, w = Math.hypot(ux, uy) || 1, u = [ux / w, uy / w];
    const ground = z - Z0;
    if (spec.mat === "stone" || spec.mat === "brick") {
      for (const [px, py] of [[x0, y0], [x1, y1]]) boxAt(barGeo(px, py, spec.mat), px, py, u, 0.2, 0.2, ground - 0.3, ground + hh + 0.22, spec.col.map((c) => c * 0.95));
    }
    // the gate itself, hinged at the first post and swung 35 degrees into the garden
    const ang = Math.atan2(u[1], u[0]) - 0.6;
    const gu = [Math.cos(ang), Math.sin(ang)], gl = Math.min(1.0, w - 0.1);
    const cx = x0 + gu[0] * gl / 2, cy = y0 + gu[1] * gl / 2;
    const iron = spec.mat === "iron" || hash(Math.round(x0 * 31)) < 0.4;
    boxAt(barGeo(cx, cy, iron ? "iron" : "wood"), cx, cy, gu, gl / 2, 0.025, ground + 0.08, ground + Math.min(1.0, hh + 0.05),
      iron ? [0.16, 0.17, 0.18] : [0.5, 0.38, 0.26]);
  }
  const barMats: Record<BarMat, THREE.Material> = {
    stone: new THREE.MeshLambertMaterial({ map: TX.wall("stone", false), vertexColors: true }),
    brick: new THREE.MeshLambertMaterial({ map: TX.wall("brick", false), vertexColors: true }),
    leaf: new THREE.MeshLambertMaterial({ map: TX.leaves(), vertexColors: true }),
    wood: new THREE.MeshLambertMaterial({ map: TX.boards(), vertexColors: true, side: THREE.DoubleSide }),
    iron: new THREE.MeshLambertMaterial({ map: TX.railings(), vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide }),
  };
  for (const [k, geo] of barGeos) {
    const g = geo.build();
    if (!g) continue;
    const m = new THREE.Mesh(g, barMats[k.split(":")[0] as BarMat]);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
  }

  // ---- trees: instanced, in chunks so each chunk can be culled --------------------------------
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.26, 1, 6).translate(0, 0.5, 0);
  const crownGeo = new THREE.IcosahedronGeometry(1, 1);
  const coneGeo = new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0);
  const trunkMat = new THREE.MeshLambertMaterial({ color: "#6b5340", map: TX.bark() });
  const leafMat = new THREE.MeshLambertMaterial({ color: "#ffffff", flatShading: true });
  const treeChunks = new Map<string, number[][]>();
  for (const t of D.tr) {
    const k = `${Math.floor(t[0] / 160)},${Math.floor(t[1] / 160)}`;
    (treeChunks.get(k) ?? treeChunks.set(k, []).get(k)!).push(t);
  }
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
  const LEAF = ["#4d6b2c", "#58772f", "#3f5f2a", "#647f35", "#4a6630", "#6b7b2f"].map((h) => new THREE.Color(h));
  let ti = 0;
  for (const list of treeChunks.values()) {
    const cones = list.filter((_, i) => hash(ti + i * 31) < 0.18);
    const rounds = list.filter((_, i) => !(hash(ti + i * 31) < 0.18));
    ti += list.length;
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, list.length);
    const crowns = new THREE.InstancedMesh(crownGeo, leafMat, rounds.length);
    const conesM = new THREE.InstancedMesh(coneGeo, leafMat, Math.max(1, cones.length));
    conesM.count = cones.length;
    list.forEach(([x, y, z, s], i) => {
      const h = (cones.includes(list[i]) ? 2.2 : 3.4) * s;
      mtx.compose(ps.set(x, z - Z0 - 0.2, -y), q.identity(), sc.set(s, h, s));
      trunks.setMatrixAt(i, mtx);
    });
    rounds.forEach(([x, y, z, s], i) => {
      const r = hash(i + x * 7);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r * 6.28);
      mtx.compose(ps.set(x, z - Z0 + 4.6 * s, -y), q, sc.set(2.7 * s * (0.85 + r * 0.3), 2.9 * s, 2.7 * s * (1.15 - r * 0.3)));
      crowns.setMatrixAt(i, mtx);
      crowns.setColorAt(i, LEAF[Math.floor(r * LEAF.length)]);
    });
    cones.forEach(([x, y, z, s], i) => {
      mtx.compose(ps.set(x, z - Z0 + 1.4 * s, -y), q.identity(), sc.set(2.1 * s, 8 * s, 2.1 * s));
      conesM.setMatrixAt(i, mtx);
      conesM.setColorAt(i, new THREE.Color("#2f4a2a"));
    });
    for (const m of [trunks, crowns, conesM]) {
      m.castShadow = true;
      m.receiveShadow = true;
      m.computeBoundingSphere();
      scene.add(m);
    }
  }

  buildFurniture(map, scene);

  // ---- the force field: a shimmering wall around the play area ------------------------------
  const fieldMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { time: { value: 0 }, player: { value: new THREE.Vector3() } },
    vertexShader: `varying vec3 vW; varying vec2 vUv;
      void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float time; uniform vec3 player; varying vec3 vW; varying vec2 vUv;
      void main(){
        float a = vUv.x * 1600.0, h = vW.y;
        vec2 g = vec2(a, h * 1.15 - a * 0.5);
        vec2 f = abs(fract(g / 4.0) - 0.5);
        float hex = smoothstep(0.42, 0.5, max(f.x, f.y));
        float scan = 0.5 + 0.5 * sin(h * 0.35 - time * 2.2);
        float near = 1.0 - smoothstep(10.0, 140.0, distance(vW.xz, player.xz));
        float fade = 1.0 - smoothstep(0.0, 1.0, vUv.y);
        float alpha = (0.07 + hex * 0.35 + scan * 0.06) * (0.35 + near * 0.9) * fade;
        gl_FragColor = vec4(vec3(0.35, 0.75, 1.0) * alpha, alpha);
      }`,
  });
  const fieldMesh = new THREE.Mesh(new THREE.CylinderGeometry(map.field, map.field, 260, 256, 1, true), fieldMat);
  fieldMesh.position.y = 100;
  fieldMesh.renderOrder = 5;
  scene.add(fieldMesh);
  const clock = new THREE.Clock();

  return {
    scene, sun,
    update(px: number, py: number, pz: number) {
      fieldMat.uniforms.time.value = clock.getElapsedTime();
      fieldMat.uniforms.player.value.set(px, py, pz);
      sky.position.set(px, py, pz);
      // keep the shadow camera on the player, snapped to texels so shadows don't shimmer
      const snap = 140 / 2048;
      const cx = Math.round(px / snap) * snap, cz = Math.round(pz / snap) * snap;
      sun.target.position.set(cx, py, cz);
      sun.position.set(cx + SUN_DIR.x * 200, py + SUN_DIR.y * 200, cz + SUN_DIR.z * 200);
    },
  };
}
