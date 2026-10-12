// Tunnels you can walk through (tools/tunnels.py): an arched brick tube along each tunnel's floor,
// lit by lamps along the crown, with a stone face round the arch at each portal. The terrain inside
// the tube's mouth is hidden (world.ts asks mouths() where), so you can see in from the cutting;
// further in, the hill is over your head and its ground faces away from you.
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
const MOUTH = 18;

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
  for (const t of map.d.tn ?? []) for (const m of portals(t)) {
    a.push(new THREE.Vector4(m.x, -m.y, m.dx, -m.dy));
    b.push(new THREE.Vector4(m.z - map.z0, TUNNEL.crown, TUNNEL.half, MOUTH));
  }
  return { a, b };
}

export function buildTunnels(map: GameMap, scene: THREE.Scene) {
  const tunnels = map.d.tn ?? [];
  if (!tunnels.length) return;
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
    // the portals' stone faces, from below the floor to above the hill over the arch
    for (const p of portals(t)) {
      const nx = -p.dy, ny = p.dx, F = TUNNEL.face;
      let top = TUNNEL.crown + 1.2;
      for (let o = -F; o <= F; o += 1) for (const d of [0, FACE_DEPTH]) {
        const x = p.x + nx * o + p.dx * d, y = p.y + ny * o + p.dy * d;
        top = Math.max(top, map.ground(x, -y) + Z0 - p.z + 0.4);
      }
      top = Math.min(top, 16);
      const shape = new THREE.Shape([[-F, -1], [F, -1], [F, top], [-F, top]].map(([x, y]) => new THREE.Vector2(x, y)));
      const hole = prof.map(([o, h]) => new THREE.Vector2(o, Math.max(-0.5, h === 0 ? -0.5 : h)));
      shape.holes.push(new THREE.Path(hole));
      const g = new THREE.ExtrudeGeometry(shape, { depth: FACE_DEPTH, bevelEnabled: false });
      const face = new THREE.Mesh(g, stone);
      face.position.set(p.x, p.z - Z0, -p.y);
      // local +z goes into the tunnel; local +x is the tunnel's left, matching the profile
      face.rotation.y = Math.atan2(p.dx, -p.dy);
      face.castShadow = face.receiveShadow = true;
      scene.add(face);
      // a coping along the top
      const cope = new THREE.Mesh(new THREE.BoxGeometry(2 * F + 0.4, 0.35, FACE_DEPTH + 0.3), stone);
      cope.position.set(0, top + 0.17, FACE_DEPTH / 2);
      face.add(cope);
    }
  }
}
