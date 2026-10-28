// Tunnels you can walk through (tools/tunnels.py): an arched brick tube along each tunnel's floor, as
// wide as the road or path going in (boreHalf), with its pavements carried through where it has them,
// lit by lamps along the crown, with a stone headwall round the arch at each portal. The ground over
// a tunnel is the hill's, whole; the terrain inside the tube's mouth is hidden (world.ts asks
// mouths() where), so you can see in from the cutting, and further in the hill is over your head.
// The two bores of a dual carriageway coming out side by side share one headwall, square to them.
// Where the hill beside the cutting stands high, a wing wall holds it up, and the ground between
// the wing walls is dug to the floor (world.ts, from cuttings()). A tunnel cut at its square's edge,
// deep under the hill, has no portal there.
//
// Other looks for a portal can be tried by eye with ?portal= in the address (portalStyle): a
// concrete box, grassed banks over a lintel, a walled concrete trough, or a bare cut face. Every
// tunnel is drawn in Bath stone otherwise.
//
// The light inside is painted on: each vertex is as bright as its nearest lamp makes it, so it
// costs nothing at run time, and the tube ignores the sun. world.ts turns the fog dark while
// you're in one. Nothing here goes over the network: every player draws the same from the map.
import * as THREE from "three";
import { GameMap, TUNNEL, Tunnel, boreHalf } from "./map";
import * as TX from "./textures";

const WALL = 3.0;        // floor to where the arch springs
const LAMP = 14;         // metres between lamps
const STEP = 1.5;        // metres between rings of the tube
const CHUNK = 60;        // rings per mesh, so the far parts are skipped when out of view
const FACE_DEPTH = 1.0;  // how thick the portal's stone face is
/** How far into the tube the terrain is hidden, from each portal. */
const MOUTH = 40;
/** How far the opening in a face stands clear of the lining all round: flush, the two fought to be
 *  drawn, and the face's reveal showed through the brick in stripes. */
const HOLE = 0.04;
const LINTEL = 0.7;      // depth of the concrete band over the openings where grass banks come down to them

/** a: Bath stone, arched; b: a concrete box; c: grassed banks down to a concrete lintel; d: a
 *  concrete trough walled to the top; e: the hill cut off over a plain surround. */
export type PortalStyle = "a" | "b" | "c" | "d" | "e";
const STYLES = new Set<string>(["a", "b", "c", "d", "e"]);
/** The styles whose tube is a square concrete box rather than a brick arch. */
const BOXED = new Set<PortalStyle>(["b", "c", "d"]);

/** The tube's cross-section from one wall's foot over the top to the other's, [across, up], for a
 *  bore `half` wide each side, grown by e all round: an arch, or a box. */
function profile(box: boolean, half: number, e = 0): number[][] {
  const H = half + e;
  if (box) {
    const out = [[H, 0], [H, WALL * 0.5], [H, WALL]], top = TUNNEL.crown + e;
    for (let k = 0; k <= 10; k++) out.push([H - (2 * H * k) / 10, top]);
    out.push([-H, WALL], [-H, WALL * 0.5], [-H, 0]);
    return out;
  }
  const b = TUNNEL.crown + e - WALL, out = [[H, 0], [H, WALL * 0.5]];
  for (let k = 0; k <= 10; k++) { const t = (k / 10) * Math.PI; out.push([H * Math.cos(t), WALL + b * Math.sin(t)]); }
  out.push([-H, WALL * 0.5], [-H, 0]);
  return out;
}

/** Points every STEP metres along a tunnel's floor (data coords [x, y, z]), with distance along, the
 *  sideways unit normal, half the bore's width and the pavement each side. */
function resample(t: Tunnel) {
  const p = t.p, pv = (i: number) => t.pv?.[i] ?? 0;
  const pts: { x: number; y: number; z: number; s: number; nx: number; ny: number; h: number; pv: number }[] = [];
  let s = 0;
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i], b = p[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(l / STEP));
    const h0 = boreHalf(t, i), h1 = boreHalf(t, i + 1);
    for (let k = 0; k < n; k++) {
      const f = k / n;
      pts.push({ x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f, z: a[2] + (b[2] - a[2]) * f, s: s + l * f, nx: 0, ny: 0,
        h: h0 + (h1 - h0) * f, pv: pv(i) + (pv(i + 1) - pv(i)) * f });
    }
    s += l;
  }
  const e = p[p.length - 1];
  pts.push({ x: e[0], y: e[1], z: e[2], s, nx: 0, ny: 0, h: boreHalf(t, p.length - 1), pv: pv(p.length - 1) });
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
const sideBySide = (a: Portal, b: Portal) => a.h + b.h + 2 * TUNNEL.past + 4;

/** h: half the bore's width there. */
interface Portal { t: Tunnel; end: 0 | 1; x: number; y: number; z: number; dx: number; dy: number; h: number }
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
    if (Math.hypot(ox, oy) < sideBySide(a, b) && Math.abs(ox * a.dx + oy * a.dy) < 8) group[root(j)] = root(i);
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
      const q = [m.x - m.dx * by, m.y - m.dy * by, m.z], t = m.t;
      // (the bore's width carried out with it)
      if (m.end === 0) { t.p.unshift(q); t.hw?.unshift(t.hw[0]); t.pv?.unshift(t.pv[0]); }
      else { t.p.push(q); t.hw?.push(t.hw[t.hw.length - 1]); t.pv?.push(t.pv[t.pv.length - 1]); }
    }
  }
}

/** Where each portal is and which way the tunnel goes in from it, data coords. */
function portals(t: Tunnel) {
  const p = t.p, out: { x: number; y: number; z: number; dx: number; dy: number; h: number }[] = [];
  for (const [a, b, h] of [[p[0], p[1], boreHalf(t, 0)], [p[p.length - 1], p[p.length - 2], boreHalf(t, p.length - 1)]] as const) {
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    out.push({ x: a[0], y: a[1], z: a[2], dx: (b[0] - a[0]) / l, dy: (b[1] - a[1]) / l, h });
  }
  return out;
}

/** The style each tunnel's portals are drawn in. Bath stone unless the address asks for another,
 *  to try by eye: ?portal=b,east,north draws the tunnel nearest that spot (and the other bores of
 *  its name close by) in style b, and ?portal=b alone draws every tunnel so. */
const styled = new WeakMap<Tunnel[], Map<Tunnel, PortalStyle>>();
export function portalStyle(tn: Tunnel[], t: Tunnel): PortalStyle {
  let got = styled.get(tn);
  if (!got) {
    styled.set(tn, got = new Map());
    const q = typeof location === "undefined" ? null : new URLSearchParams(location.search).get("portal");
    const [s, ex, ny] = (q ?? "").split(",");
    if (STYLES.has(s)) {
      const at = ex !== undefined && ny !== undefined ? [+ex, +ny] : null;
      const near = (u: Tunnel) => at ? Math.min(...u.p.map((p) => Math.hypot(p[0] - at[0], p[1] - at[1]))) : 0;
      const best = tn.reduce<Tunnel | null>((b, u) => (!b || near(u) < near(b) ? u : b), null);
      for (const u of tn) if (best && u.n === best.n && near(u) < 300) got.set(u, s as PortalStyle);
    }
  }
  return got.get(t) ?? "a";
}

/** The tube's mouths, for the terrain shader: (x, z, into x, into z) and (floor, top, half width, depth), scene coords. */
export function mouths(map: GameMap): { a: THREE.Vector4[]; b: THREE.Vector4[] } {
  const a: THREE.Vector4[] = [], b: THREE.Vector4[] = [];
  alignPortals(map.d.tn ?? [], map.d.b);
  // (piece by piece along the tube, which bends: a straight cut from the portal left the hillside
  // standing in the tube a few metres round a bend; and no further than its far portal; each piece
  // to the top of its higher end, as the floor climbs along it, or a sliver of hill shows in the crown)
  for (const t of map.d.tn ?? []) for (const back of [false, true]) {
    const p = back ? [...t.p].reverse() : t.p, half = (i: number) => boreHalf(t, back ? p.length - 1 - i : i);
    if (p.length < 2 || onSeam(p[0][0], p[0][1], map.d.b)) continue;
    for (let i = 0, s = 0; i < p.length - 1 && s < MOUTH; i++) {
      const l = Math.hypot(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]);
      if (l < 1e-3) continue;
      const dx = (p[i + 1][0] - p[i][0]) / l, dy = (p[i + 1][1] - p[i][1]) / l;
      a.push(new THREE.Vector4(p[i][0], -p[i][1], dx, -dy));
      b.push(new THREE.Vector4(Math.min(p[i][2], p[i + 1][2]) - map.z0, TUNNEL.crown + Math.abs(p[i + 1][2] - p[i][2]) + 0.05, Math.max(half(i), half(i + 1)), l + 0.3));
      s += l;
    }
  }
  // and none of the hill's slope standing in the cutting in front of a headwall, out to the end of
  // its floor, where the apron is the ground (the ground's grid is too coarse to rise straight up the
  // wall); where grassed banks come down to the portal, none under them either
  for (const w of walls(map)) {
    const [l0, r0, back] = w.style === "c" ? [w.left - w.bank, w.right + w.bank, w.slope] : [w.left, w.right, 0.3];
    const c = (l0 + r0) / 2, o = w.reach - 0.3, x = w.cx + w.nx * c - w.dx * o, y = w.cy + w.ny * c - w.dy * o;
    a.push(new THREE.Vector4(x, -y, w.dx, -w.dy));
    b.push(new THREE.Vector4(w.z - map.z0, 60, (r0 - l0) / 2, o + back));
  }
  return { a, b };
}

let brickTex: THREE.Texture | null = null, groundTex: THREE.Texture | null = null;
const STONE = "#cdbb93", CONCRETE = "#b4b1a9", GRASS = "#6e7f4c", EARTH = "#6f5f45";

/** Triangles gathered for one mesh, in scene coords, with the ground's texture laid on them from above. */
class Sheet {
  pos: number[] = []; uv: number[] = []; idx: number[] = [];
  quad(a: number[], b: number[], c: number[], d: number[]) {
    const k = this.pos.length / 3;
    for (const q of [a, b, c, d]) { this.pos.push(q[0], q[1], q[2]); this.uv.push(q[0] / 7, q[2] / 7 + q[1] / 7); }
    this.idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
  }
  mesh(mat: THREE.Material) {
    if (!this.idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    return m;
  }
}

/** drawn: the ground's height as it's drawn at data (x, y), scene Y, so what's laid round a portal
 *  meets it with no gap. */
export function buildTunnels(map: GameMap, scene: THREE.Object3D, drawn: (x: number, y: number) => number = (x, y) => map.trueGround(x, -y)) {
  const tunnels = map.d.tn ?? [];
  if (!tunnels.length) return;
  alignPortals(tunnels, map.d.b);
  const Z0 = map.z0;
  brickTex ??= Object.assign(TX.wall("brick", false), { wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping });
  groundTex ??= TX.groundDetail();
  // (the lining is seen from inside; from outside, where the hill over it is thinner than the tube
  // is tall, it's the grass of a bank, not brick lying on the hill)
  const tubeMat = new THREE.MeshBasicMaterial({ map: brickTex, vertexColors: true, side: THREE.FrontSide });
  const boxMat = new THREE.MeshBasicMaterial({ color: CONCRETE, vertexColors: true, side: THREE.FrontSide });
  const skinMat = new THREE.MeshLambertMaterial({ color: GRASS, map: groundTex, side: THREE.BackSide });
  const floorMat = new THREE.MeshBasicMaterial({ map: TX.asphalt(), vertexColors: true, side: THREE.DoubleSide });
  const lampGeo = new THREE.BoxGeometry(0.5, 0.12, 0.3);
  const lampMat = new THREE.MeshBasicMaterial({ color: "#ffe2a0" });

  for (const t of tunnels) {
    const box = BOXED.has(portalStyle(tunnels, t));
    const pts = resample(t), len = pts[pts.length - 1].s;
    const P = profile(box, TUNNEL.half).length;
    for (let c0 = 0; c0 < pts.length - 1; c0 += CHUNK) {
      const ring = pts.slice(c0, Math.min(pts.length, c0 + CHUNK + 1));
      const pos: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = [];
      const fpos: number[] = [], fuv: number[] = [], fcol: number[] = [], fidx: number[] = [];
      for (const q of ring) {
        const prof = profile(box, q.h);
        let round = 0;
        prof.forEach(([o, h], k) => {
          if (k) round += Math.hypot(o - prof[k - 1][0], h - prof[k - 1][1]);
          pos.push(q.x + q.nx * o, q.z - Z0 + h, -(q.y + q.ny * o));
          uv.push(q.s / 3.4, round / 3.4);
          const l = light(q.s, h, o, len);
          col.push(l, l * 0.93, l * 0.82);
        });
        for (const [o, h] of floorAcross(t, q)) {
          fpos.push(q.x + q.nx * o, q.z - Z0 + h, -(q.y + q.ny * o));
          fuv.push(o / 4, q.s / 4 + h);
          const l = light(q.s, 0, o, len);
          fcol.push(l, l * 0.93, l * 0.82);
        }
      }
      const F = t.pv ? 6 : 2;
      for (let i = 0; i < ring.length - 1; i++) {
        for (let k = 0; k < P - 1; k++) { const a = i * P + k, b = a + P; idx.push(a, b, a + 1, a + 1, b, b + 1); }
        for (let k = 0; k < F - 1; k++) { const a = i * F + k, b = a + F; fidx.push(a, b, a + 1, a + 1, b, b + 1); }
      }
      for (const [p, u, c, ix, mats] of [[pos, uv, col, idx, [box ? boxMat : tubeMat, skinMat]], [fpos, fuv, fcol, fidx, [floorMat]]] as const) {
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(p as number[], 3));
        g.setAttribute("uv", new THREE.Float32BufferAttribute(u as number[], 2));
        g.setAttribute("color", new THREE.Float32BufferAttribute(c as number[], 3));
        g.setIndex(ix as number[]);
        g.computeVertexNormals();
        for (const m of mats) scene.add(new THREE.Mesh(g, m as THREE.Material));
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
  const mat = (color: string, map?: THREE.Texture) => new THREE.MeshLambertMaterial({ color, map: map ?? null, side: THREE.DoubleSide });
  const stone = mat(STONE), concrete = mat(CONCRETE), grass = mat(GRASS, groundTex), earth = mat(EARTH, groundTex);
  const apronGrass = mat("#647347"), slab = mat("#8f8d86", groundTex);
  for (const w of walls(map)) buildPortal(w, scene, Z0, drawn, { stone, concrete, grass, earth, apronGrass, slab });
}

const KERB = 0.15;       // a pavement's height over the carriageway, through the tunnel as outside it

/** Across the tube's floor at one ring, [across, up] from its left wall to its right: the
 *  carriageway, and up a kerb to a pavement each side where the bore has them. */
function floorAcross(t: Tunnel, q: { h: number; pv: number }): number[][] {
  if (!t.pv) return [[q.h, 0.02], [-q.h, 0.02]];
  const c = Math.max(0, q.h - q.pv), k = q.pv > 0.05 ? KERB : 0.02;
  return [[q.h, k], [c, k], [c, 0.02], [-c, 0.02], [-c, k], [-q.h, k]];
}

interface Mats { stone: THREE.Material; concrete: THREE.Material; grass: THREE.Material; earth: THREE.Material; apronGrass: THREE.Material; slab: THREE.Material }

/** One headwall's portal in its style: the face, what lines the cutting in front, and the cutting's floor. */
function buildPortal(w: Headwall, scene: THREE.Object3D, Z0: number, drawn: (x: number, y: number) => number, M: Mats) {
  const { g, dx, dy, nx, ny, cx, cy, z, at, mid, left, right, top, style } = w;
  const box = BOXED.has(style);
  /** scene coords of the spot s across (to the tunnel's left), out metres out from the face, at data height h */
  const P = (s: number, out: number, h: number) => [cx + nx * s - dx * out, h - Z0, -(cy + ny * s - dy * out)];
  const ground = (s: number, out: number) => drawn(cx + nx * s - dx * out, cy + ny * s - dy * out) + Z0;
  const add = (m: THREE.Mesh | null) => { if (m) { m.castShadow = true; scene.add(m); } };
  // the face's own frame: local +z goes into the tunnel, local +x is the tunnel's left, matching the profile
  const place = (o: THREE.Object3D) => { o.position.set(cx, z - Z0, -cy); o.rotation.y = Math.atan2(dx, -dy); return o; };
  // (a bore climbing, or slanting, through the face's thickness needs its opening that much bigger,
  // or the back edge of the opening shows inside the lining)
  const opening = (e: number, foot = -0.5) => g.map((m, k) => {
    const off = at[k] - mid, lift = m.z - z, p = m.end === 0 ? m.t.p : [...m.t.p].reverse();
    let rise = 0;
    for (let i = 1, s = 0; i < p.length && s < FACE_DEPTH + 0.5; i++) {
      s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
      rise = Math.max(rise, ((p[i][2] - m.z) * Math.min(1, (FACE_DEPTH + 0.1) / (s || 1))));
    }
    const skew = Math.abs(m.dx * dy - m.dy * dx) * FACE_DEPTH;
    return new THREE.Path(profile(box, m.h, e + skew).map(([u, h]) => new THREE.Vector2(off + u, lift + (h === 0 ? foot : h + rise))));
  });
  const slabMesh = (outline: number[][], holes: THREE.Path[], depth: number, m: THREE.Material, from = 0) => {
    const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
    shape.holes.push(...holes);
    const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false }).translate(0, 0, from), m);
    mesh.castShadow = mesh.receiveShadow = true;
    return mesh;
  };
  const lifts = g.map((m) => m.z - z), crown = Math.max(...lifts) + TUNNEL.crown + HOLE;
  const sideL = Math.min(...g.map((m, k) => at[k] - m.h)) - mid - HOLE, sideR = Math.max(...g.map((m, k) => at[k] + m.h)) - mid + HOLE;

  if (style === "a" || style === "b" || style === "d") {
    const m = style === "a" ? M.stone : M.concrete;
    const face = place(slabMesh([[left, -1], [right, -1], [right, top], [left, top]], opening(HOLE), FACE_DEPTH, m));
    scene.add(face);
    // a coping along the top; a concrete one is a plain band, flush at the front
    const cope = style === "a" ? new THREE.BoxGeometry(right - left + 0.4, 0.35, FACE_DEPTH + 0.3) : new THREE.BoxGeometry(right - left, 0.25, FACE_DEPTH + 0.15);
    const cm = new THREE.Mesh(cope, m);
    cm.position.set((left + right) / 2, top + (style === "a" ? 0.17 : 0.12), FACE_DEPTH / 2 + (style === "a" ? 0 : -0.07));
    face.add(cm);
    // a concrete box's openings share one flat lintel beam, a little proud of the face
    if (style === "b") {
      const lb = new THREE.Mesh(new THREE.BoxGeometry(sideR - sideL + 0.8, 0.6, 0.2), M.concrete);
      lb.position.set((sideL + sideR) / 2, crown + 0.3, -0.1);
      face.add(lb);
    }
  }
  if (style === "c") {
    // a concrete face only up to a lintel band over the openings, coming down to the cutting's floor
    // at its sides, with the grassed bank laid over it from behind
    const band = crown + LINTEL;
    const outline = [[left, -1], [right, -1], [right, 0], [sideR + 0.4, band], [sideL - 0.4, band], [left, 0]];
    scene.add(place(slabMesh(outline, opening(HOLE), FACE_DEPTH, M.concrete)));
    bankLandform(w, P, ground, band, M.grass, add);
  }
  if (style === "e") {
    // the hill stops in a bare face over the openings, as surveyed, each opening in a plain surround
    const cols = Math.max(2, Math.ceil(right - left)), topLine: number[][] = [];
    for (let c = 0; c <= cols; c++) {
      const s = left + ((right - left) * c) / cols;
      topLine.push([s, Math.max(crown + 0.5, ground(s, -FACE_DEPTH - 0.5) - z)]);
    }
    scene.add(place(slabMesh([[left, -1], [right, -1], ...topLine.reverse()], opening(HOLE + 0.35), FACE_DEPTH, M.earth)));
    g.forEach((_, k) => {
      const outer = opening(HOLE + 0.35)[k], inner = opening(HOLE, -0.4)[k];
      scene.add(place(slabMesh(outer.getPoints().map((p) => [p.x, p.y]), [inner], FACE_DEPTH + 0.1, M.concrete, -0.1)));
    });
  }

  // what lines the cutting's sides
  for (const [end, side, run] of [[left, -1, w.wings[0]], [right, 1, w.wings[1]]] as const) {
    if (style === "c" || style === "e") break;
    const r = style === "d" ? troughRun(w) : run;
    if (r.length < 2) continue;
    const m = style === "a" ? M.stone : M.concrete;
    const tp = r.map(([o, h]) => new THREE.Vector2(o, h - z));
    const pts = [new THREE.Vector2(0, -1), ...tp, new THREE.Vector2(r[r.length - 1][0], -1)];
    const geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: WING_THICK, bevelEnabled: false });
    // a coping along its top, a little proud of the wall each side, as the headwall has (a concrete one flush)
    const proud = style === "a" ? 0.15 : 0;
    const cap = new THREE.ExtrudeGeometry(new THREE.Shape([...tp.map((q) => new THREE.Vector2(q.x, q.y + (style === "a" ? COPING : 0.2))), ...[...tp].reverse()]),
      { depth: WING_THICK + 2 * proud, bevelEnabled: false }).translate(0, 0, -proud);
    // local x out of the tunnel along the cutting, y up, z across to the tunnel's left
    const s0 = side < 0 ? end - WING_THICK : end;
    const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(-dx, 0, dy), new THREE.Vector3(0, 1, 0), new THREE.Vector3(nx, 0, -ny))
      .setPosition(cx + nx * s0, z - Z0, -(cy + ny * s0));
    for (const gg of [geo, cap]) {
      gg.applyMatrix4(basis);
      const wing = new THREE.Mesh(gg, m);
      wing.castShadow = wing.receiveShadow = true;
      scene.add(wing);
    }
  }

  // the cutting's floor in front of the face, just under the road on it, and where the ground beside
  // or beyond it stands higher than the floor, a bank face up to it, so there's no gap to see through
  const floor = new Sheet(), cols = Math.max(1, Math.ceil(right - left)), rows = Math.max(1, Math.ceil(w.reach));
  const fh: number[] = [];
  for (let r = 0; r <= rows; r++) {
    const o = (w.reach * r) / rows;
    fh.push(Math.min(z, ground((left + right) / 2, o)) - 0.03);
  }
  for (let r = 0; r < rows; r++) {
    const o0 = (w.reach * r) / rows, o1 = (w.reach * (r + 1)) / rows;
    for (let c = 0; c < cols; c++) {
      const s0 = left + ((right - left) * c) / cols, s1 = left + ((right - left) * (c + 1)) / cols;
      floor.quad(P(s0, o0, fh[r]), P(s1, o0, fh[r]), P(s1, o1, fh[r + 1]), P(s0, o1, fh[r + 1]));
    }
  }
  // (the ground just past the end, as the floor's own height runs up to it)
  const bank = new Sheet(), up = (s: number, o: number, h: number) => Math.max(h, ground(s, o >= w.reach ? o + 0.02 : o));
  for (let c = 0; c < cols; c++) {
    const s0 = left + ((right - left) * c) / cols, s1 = left + ((right - left) * (c + 1)) / cols, o = w.reach, h = fh[rows];
    bank.quad(P(s0, o, h), P(s1, o, h), P(s1, o, up(s1, o, h)), P(s0, o, up(s0, o, h)));
  }
  if (style !== "c" && style !== "d") for (const s of [left - 0.05, right + 0.05]) for (let r = 0; r < rows; r++) {
    const o0 = (w.reach * r) / rows, o1 = (w.reach * (r + 1)) / rows;
    bank.quad(P(s, o0, fh[r]), P(s, o1, fh[r + 1]), P(s, o1, up(s, o1, fh[r + 1])), P(s, o0, up(s, o0, fh[r])));
  }
  add(floor.mesh(style === "d" ? M.slab : M.apronGrass));
  add(bank.mesh(style === "c" ? M.grass : M.apronGrass));
}

/** Grassed banks round a portal with no headwall to speak of: from the lintel band over the
 *  openings back up the hill, and from the cutting's floor up each side, out to where the ground
 *  as drawn takes over. */
function bankLandform(w: Headwall, P: (s: number, out: number, h: number) => number[], ground: (s: number, out: number) => number,
  band: number, m: THREE.Material, add: (m: THREE.Mesh | null) => void) {
  const { left, right, reach, bank: W, slope: L, z } = w;
  const sheet = new Sheet();
  const sideL = Math.min(...w.g.map((m, k) => w.at[k] - m.h)) - w.mid - HOLE - 0.4, sideR = Math.max(...w.g.map((m, k) => w.at[k] + m.h)) - w.mid + HOLE + 0.4;
  // the face's top line, where the bank behind it starts (data height)
  const faceTop = (s: number) => z + (s <= sideL ? band * Math.max(0, (s - left) / (sideL - left || 1)) : s >= sideR ? band * Math.max(0, (right - s) / (right - sideR || 1)) : band);
  /** height at (s, out) on the banks: from the inner edge (the floor's side, or the face's top) out to the drawn ground */
  const at = (s: number, out: number) => {
    const fs = s < left ? (left - s) / W : s > right ? (s - right) / W : 0, fo = out < 0 ? -out / L : 0, t = Math.min(1, Math.max(fs, fo));
    if (t <= 0) return z;
    const inner = out >= 0 ? z : fs > 0 ? z : faceTop(s);
    const cs = s < left ? left : s > right ? right : s, co = out < 0 ? 0 : out;
    const os = cs + (s - cs) / t, oo = co + (out - co) / t;
    return inner + (ground(os, oo) - inner) * t;
  };
  const S = [left - W], O = [-L];
  for (let s = left - W; s < right + W - 0.01;) { s = Math.min(right + W, s + 1); S.push(s); }
  for (let o = -L; o < reach - 0.01;) { o = Math.min(reach, o + 1); O.push(o); }
  for (const s of [left, right, sideL, sideR]) if (!S.some((v) => Math.abs(v - s) < 0.05)) S.push(s);
  if (!O.some((v) => Math.abs(v) < 0.05)) O.push(0);
  S.sort((a, b) => a - b); O.sort((a, b) => a - b);
  for (let j = 0; j < O.length - 1; j++) for (let i = 0; i < S.length - 1; i++) {
    const s0 = S[i], s1 = S[i + 1], o0 = O[j], o1 = O[j + 1], ms = (s0 + s1) / 2, mo = (o0 + o1) / 2;
    if (ms > left && ms < right && mo > 0) continue;     // (the cutting's floor: the apron)
    // (behind the face, at the face's own line the bank starts from the face's top, not the floor)
    const h = (s: number, o: number) => (o === 0 && mo < 0 && s >= left && s <= right ? faceTop(s) : at(s, o === 0 && mo > 0 ? 0.001 : o));
    sheet.quad(P(s0, o0, h(s0, o0)), P(s1, o0, h(s1, o0)), P(s1, o1, h(s1, o1)), P(s0, o1, h(s0, o1)));
  }
  // (at the cutting's far end the banks' edge and the ground beyond it don't quite meet: a face between)
  for (let i = 0; i < S.length - 1; i++) {
    const s0 = S[i], s1 = S[i + 1], ms = (s0 + s1) / 2;
    if (ms > left && ms < right) continue;
    sheet.quad(P(s0, reach, at(s0, reach)), P(s1, reach, at(s1, reach)), P(s1, reach, ground(s1, reach + 0.02)), P(s0, reach, ground(s0, reach + 0.02)));
  }
  add(sheet.mesh(m));
}

/** One side of a walled concrete trough: level with the headwall's top by the portal, stepping down
 *  as the bank beside it falls away, out to the end of the cutting. */
/** A U-trough's side wall, as a wing's run: level with the headwall's top by the face, then
 *  falling smoothly with the hill beside it, never below a parapet's height over the floor. */
function troughRun(w: Headwall): number[][] {
  const { reach, top, z } = w;
  const bankAt = (o: number) => {
    let h = 0;
    for (const r of w.wings) for (let k = 0; k + 1 < r.length; k++) if (r[k][0] <= o && r[k + 1][0] >= o) {
      const f = (o - r[k][0]) / ((r[k + 1][0] - r[k][0]) || 1);
      h = Math.max(h, r[k][1] + (r[k + 1][1] - r[k][1]) * f - z);
    }
    return h;
  };
  const run: number[][] = [];
  let level = top;
  for (let o = 0; ; o = Math.min(reach, o + 1)) {
    level = Math.min(level, Math.max(1.2, bankAt(o) + 0.6, top - o * 0.5));
    run.push([o, z + level]);
    if (o >= reach) return run;
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
  style: PortalStyle;
  /** where grassed banks come down to the portal (style c): how far out each side they reach, and how far back over the face */
  bank: number; slope: number;
}

/** Each headwall's place and size: across the arches of its portals, but only as far each way as
 *  the hill stands over them (a wall reaching out over low ground beside the cutting is a bare panel),
 *  and up to above the hill over them; and the wing walls along the cutting in front, as far out as
 *  the hill beside it stands over the road. Ground is the survey's (trueGround), not as drawn. */
function walls(map: GameMap): Headwall[] {
  const out: Headwall[] = [], Z0 = map.z0, ground = (x: number, y: number) => map.trueGround(x, -y) + Z0, tn = map.d.tn ?? [];
  for (const g of headwalls(tn, map.d.b)) {
    let dx = 0, dy = 0;
    for (const m of g) { dx += m.dx; dy += m.dy; }
    const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    const nx = -dy, ny = dx, F = TUNNEL.past;
    const at = g.map((m) => m.x * nx + m.y * ny), mid = (Math.min(...at) + Math.max(...at)) / 2;
    const o = g[0], cx = o.x + nx * (mid - at[0]), cy = o.y + ny * (mid - at[0]), z = Math.min(...g.map((m) => m.z));
    const behind = (s: number) => ground(cx + nx * s + dx * (FACE_DEPTH + 1), cy + ny * s + dy * (FACE_DEPTH + 1)) - z;
    const sideL = Math.min(...g.map((m, k) => at[k] - m.h)) - mid, sideR = Math.max(...g.map((m, k) => at[k] + m.h)) - mid;
    let left = sideL - F, right = sideR + F;
    const leftMost = sideL - 0.8, rightMost = sideR + 0.8;
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
    const style = portalStyle(tn, g[0].t);
    const highest = Math.max(HIGH, ...wings.flat().map((p) => p[1] - z));
    const bank = Math.min(8, Math.max(3, highest * 1.5)), slope = Math.min(10, Math.max(3, (top - TUNNEL.crown - LINTEL) * 1.5));
    out.push({ g, dx, dy, nx, ny, cx, cy, z, at, mid, left, right, top, wings, reach, style, bank, slope });
  }
  return out;
}

/** The cuttings in front of the headwalls, for the ground (world.ts): dug down to the floor between
 *  the wing walls, out as far as they run, so no slope of hillside stands in front of the arches.
 *  Each is [face's middle x, y, way in x, y, left, right, how far out, floor, headwall's top (data)]. */
export function cuttings(map: GameMap): number[][] {
  return walls(map).map((w) => [w.cx, w.cy, w.dx, w.dy, w.left, w.right, w.reach, w.z, w.z + w.top]);
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

/** The height (scene Y) of the arch's crown over (x, y) (data) where that is inside a bore, else
 *  -Infinity: a stone face down from a lane over the roof, or along a headwall's foot, stops there
 *  rather than hanging down inside the tube. */
export function boreRoof(map: GameMap): (x: number, y: number) => number {
  const tn = map.d.tn ?? [];
  alignPortals(tn, map.d.b);
  return (x, y) => {
    let top = -Infinity;
    for (const t of tn) for (let i = 0; i + 1 < t.p.length; i++) {
      const a = t.p[i], b = t.p[i + 1], vx = b[0] - a[0], vy = b[1] - a[1], l2 = vx * vx + vy * vy;
      const reach = Math.max(boreHalf(t, i), boreHalf(t, i + 1)) + 0.3;
      if (l2 < 1e-6) continue;
      const f = ((x - a[0]) * vx + (y - a[1]) * vy) / l2;
      if (f < 0 || f > 1 || Math.abs((x - a[0]) * vy - (y - a[1]) * vx) / Math.sqrt(l2) > reach) continue;
      top = Math.max(top, a[2] + (b[2] - a[2]) * f + TUNNEL.crown - map.z0);
    }
    return top;
  };
}
