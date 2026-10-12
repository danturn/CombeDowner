// Builds the three.js scene from the map: terrain, roads, buildings, walls, trees, water and sky.
import * as THREE from "three";
import { BARRIER_HEIGHT, GameMap, Line, PATHS } from "./map";
import * as TX from "./textures";

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
  const tPos = new Float32Array(T.nx * T.ny * 3), tCol = new Float32Array(T.nx * T.ny * 3), tUv = new Float32Array(T.nx * T.ny * 2);
  const hAt = (i: number, j: number) => T.h[Math.min(T.ny - 1, Math.max(0, j)) * T.nx + Math.min(T.nx - 1, Math.max(0, i))] / 10;
  const c = new THREE.Color();
  for (let j = 0; j < T.ny; j++) for (let i = 0; i < T.nx; i++) {
    const v = j * T.nx + i, x = T.x0 + i * T.dx, z = -(T.y0 + j * T.dy);
    tPos.set([x, hAt(i, j), z], v * 3);
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
  const flatMat = (color: string, off: number, map?: THREE.Texture) =>
    new THREE.MeshLambertMaterial({ color, map, polygonOffset: true, polygonOffsetFactor: -off, polygonOffsetUnits: -off * 2 });
  const asphalt = TX.asphalt();
  const RW: Record<string, number> = { primary: 8.5, secondary: 8, tertiary: 7, residential: 6, unclassified: 5.5, living_street: 5, service: 3.5, unknown: 4, pedestrian: 4, footway: 1.6, steps: 1.8, cycleway: 2, path: 1.4, track: 2.8, bridleway: 2 };
  const vehicle = D.rd.filter((r) => !PATHS.has(r.c));
  const kerbed = vehicle.filter((r) => ["primary", "secondary", "tertiary", "residential", "unclassified"].includes(r.c));
  const addFlat = (g: THREE.BufferGeometry, m: THREE.Material) => { const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; scene.add(mesh); };
  addFlat(ribbon(D.rd.filter((r) => PATHS.has(r.c)), (r) => RW[r.c] ?? 1.5, 0.1), flatMat("#a59577", 1, groundTex));
  addFlat(ribbon(kerbed, (r) => (RW[r.c] ?? 5) + 3.4, 0.03), flatMat("#9a978f", 2, asphalt));
  addFlat(ribbon(vehicle, (r) => RW[r.c] ?? 4, 0.04), flatMat("#4f5155", 3, asphalt));
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
  const chunks = new Map<string, { win: Geo; plain: Geo; roof: Geo }>();
  const chunkOf = (x: number, y: number) => {
    const k = `${Math.floor(x / CHUNK)},${Math.floor(y / CHUNK)}`;
    let v = chunks.get(k);
    if (!v) chunks.set(k, (v = { win: new Geo(), plain: new Geo(), roof: new Geo() }));
    return v;
  };
  const STONES = [[0.96, 0.86, 0.66], [0.93, 0.82, 0.6], [0.9, 0.84, 0.72], [0.98, 0.9, 0.74], [0.86, 0.8, 0.7], [0.97, 0.96, 0.92]];
  const ROOFS = [[0.4, 0.42, 0.46], [0.36, 0.37, 0.4], [0.47, 0.47, 0.48], [0.62, 0.36, 0.26], [0.55, 0.33, 0.25], [0.3, 0.3, 0.33]];
  D.bl.forEach((b, bi) => {
    const outerRing = b.r[0];
    let cx = 0, cy = 0;
    for (const [x, y] of outerRing) { cx += x; cy += y; }
    cx /= outerRing.length; cy /= outerRing.length;
    const ch = chunkOf(cx, cy);
    const ground = b.g - Z0, eave = ground + b.h, base = ground - 0.6;
    const small = b.h < 3.6;
    const stone = STONES[Math.floor(hash(bi) * STONES.length)];
    const roofCol = small ? [0.38, 0.38, 0.4] : ROOFS[Math.floor(hash(bi + 7) * ROOFS.length)];
    const walls = small ? ch.plain : ch.win;

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
        const v0 = (base - ground) / 3, v1 = b.h / 3;
        facing(walls, [a[0], base, -a[1]], [q[0], base, -q[1]], [q[0], eave, -q[1]], [a[0], eave, -a[1]], out,
          [u0, v0], [u1, v0], [u1, v1], [u0, v1], stone);
        along += len;
      }
    });

    if (b.rr && b.rp) {
      // gabled roof over the oriented rectangle; q0-q1 is a long side, so the ridge runs along it
      const q = b.rr.map(([x, y]) => [x, y]);
      const ux = q[1][0] - q[0][0], uy = q[1][1] - q[0][1], L = Math.hypot(ux, uy);
      const vx = q[3][0] - q[0][0], vy = q[3][1] - q[0][1], Wd = Math.hypot(vx, vy);
      const mx = (q[0][0] + q[2][0]) / 2, my = (q[0][1] + q[2][1]) / 2;
      const u = [ux / L, uy / L], v = [vx / Wd, vy / Wd];
      const OH = 0.35, hl = L / 2 + OH, hw = Wd / 2 + OH;
      const ridge = eave + b.rp, drop = (OH * b.rp) / (Wd / 2);
      const P = (su: number, sv: number, h: number) => [mx + u[0] * su + v[0] * sv, h, -(my + u[1] * su + v[1] * sv)];
      const rA = P(-hl, 0, ridge), rB = P(hl, 0, ridge);
      const roofW = Math.hypot(hw, b.rp);
      for (const side of [-1, 1]) {
        const e0 = P(-hl, side * hw, eave - drop), e1 = P(hl, side * hw, eave - drop);
        const n = norm([v[0] * side * b.rp, hw, -(v[1] * side * b.rp)]);
        facing(ch.roof, e0, e1, rB, rA, n, [0, 0], [L / 2, 0], [L / 2, roofW / 2], [0, roofW / 2], roofCol);
      }
      // gable ends: stone triangles over the short walls
      for (const end of [-1, 1]) {
        const g0 = P(end * L / 2, -Wd / 2, eave), g1 = P(end * L / 2, Wd / 2, eave), top = P(end * L / 2, 0, ridge);
        const out = [u[0] * end, 0, -u[1] * end];
        facingTri(ch.plain, g0, g1, top, out, [0, b.h / 3], [Wd / 3.4, b.h / 3], [Wd / 6.8, (b.h + b.rp) / 3], stone);
      }
    } else {
      // flat roof
      const contour = outerRing.map(([x, y]) => new THREE.Vector2(x, y));
      const holes = b.r.slice(1).map((h) => h.map(([x, y]) => new THREE.Vector2(x, y)));
      const tris = THREE.ShapeUtils.triangulateShape(contour, holes);
      const all = [...contour, ...holes.flat()];
      const fc = [roofCol[0] * 0.9, roofCol[1] * 0.9, roofCol[2] * 0.9];
      for (const [i, j, k] of tris) {
        const A = all[i], B = all[j], C = all[k];
        facingTri(ch.roof, [A.x, eave, -A.y], [B.x, eave, -B.y], [C.x, eave, -C.y], [0, 1, 0], [A.x / 2, A.y / 2], [B.x / 2, B.y / 2], [C.x / 2, C.y / 2], fc);
      }
    }
  });
  const winMat = new THREE.MeshLambertMaterial({ map: TX.windowWall(), vertexColors: true });
  const plainMat = new THREE.MeshLambertMaterial({ map: TX.plainWall(), vertexColors: true });
  const roofMat = new THREE.MeshLambertMaterial({ map: TX.roofTiles(), vertexColors: true, side: THREE.DoubleSide });  // undersides of the eaves show from the street
  for (const ch of chunks.values()) {
    for (const [geo, mat] of [[ch.win, winMat], [ch.plain, plainMat], [ch.roof, roofMat]] as const) {
      const g = geo.build();
      if (!g) continue;
      const m = new THREE.Mesh(g, mat);
      m.castShadow = m.receiveShadow = true;
      scene.add(m);
    }
  }

  // ---- walls, fences and hedges -------------------------------------------------------------
  const BAR: Record<string, { t: number; col: number[] }> = {
    wall: { t: 0.45, col: [0.86, 0.78, 0.6] }, retaining_wall: { t: 0.5, col: [0.8, 0.73, 0.57] },
    fence: { t: 0.12, col: [0.42, 0.32, 0.22] }, hedge: { t: 0.9, col: [0.2, 0.33, 0.15] },
  };
  const barGeo = new Geo();
  const barrierRun = (l: Line) => {
    const spec = BAR[l.c] ?? BAR.wall, hh = BARRIER_HEIGHT[l.c] ?? 1.5, t = spec.t / 2;
    for (let i = 0; i < l.p.length - 1; i++) {
      const a = l.p[i], q = l.p[i + 1];
      const ex = q[0] - a[0], ey = q[1] - a[1], len = Math.hypot(ex, ey);
      if (len < 0.05) continue;
      const nx = ey / len * t, ny = -ex / len * t;
      const ga = a[2] - Z0, gq = q[2] - Z0;
      const c4 = [[a[0] + nx, a[1] + ny, ga], [q[0] + nx, q[1] + ny, gq], [q[0] - nx, q[1] - ny, gq], [a[0] - nx, a[1] - ny, ga]];
      const P = (k: number, top: boolean) => [c4[k][0], top ? c4[k][2] + hh : c4[k][2] - 0.4, -c4[k][1]];
      const uvs: number[][] = [[0, 0], [len / 2, 0], [len / 2, hh / 2], [0, hh / 2]];
      facing(barGeo, P(0, false), P(1, false), P(1, true), P(0, true), [nx, 0, -ny], uvs[0], uvs[1], uvs[2], uvs[3], spec.col);
      facing(barGeo, P(3, false), P(2, false), P(2, true), P(3, true), [-nx, 0, ny], uvs[0], uvs[1], uvs[2], uvs[3], spec.col);
      facing(barGeo, P(0, true), P(1, true), P(2, true), P(3, true), [0, 1, 0], uvs[0], uvs[1], [len / 2, t], [0, t], spec.col);
    }
  };
  D.br.forEach(barrierRun);
  const barG = barGeo.build();
  if (barG) {
    const m = new THREE.Mesh(barG, new THREE.MeshLambertMaterial({ map: TX.plainWall(), vertexColors: true }));
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
