// Where the Flag Lads' banner (scars.ts) goes: found from the map alone, so every player works out
// the same place. It stands clear of buildings, walls and tree crowns, faces the street, and every
// cable tie has a clear line from the pavement, so it can always be seen and shot.
import type { GameMap } from "./map";

export interface BannerSpot { x: number; z: number; yaw: number; cy: number }

const W = 3.6, H = 1.1;
const CROWN_R = 3.1, CROWN_CY = 4.9;   // as trees.ts draws a unit tree, with a little over

interface Crown { x: number; y: number; z: number; r: number }

function crownsNear(map: GameMap, x: number, z: number, r: number): Crown[] {
  const out: Crown[] = [];
  for (const a of map.areas()) {
    for (const [tx, ty, tz, s] of a.d.tr) {
      if (Math.abs(tx - x) > r || Math.abs(-ty - z) > r) continue;
      out.push({ x: tx, y: tz - a.z0 + CROWN_CY * s, z: -ty, r: CROWN_R * s });
    }
  }
  return out;
}

function streetPointsNear(map: GameMap, x: number, z: number, r: number): [number, number][] {
  const out: [number, number][] = [];
  for (const a of map.areas()) for (const rd of a.d.rd) {
    for (let k = 0; k < rd.p.length - 1; k++) {
      const [ax, ay] = rd.p[k], [bx, by] = rd.p[k + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 3));
      for (let s = 0; s <= n; s++) {
        const px = ax + ((bx - ax) * s) / n, pz = -(ay + ((by - ay) * s) / n);
        if (Math.abs(px - x) < r && Math.abs(pz - z) < r) out.push([px, pz]);
      }
    }
  }
  return out;
}

/** Does the segment a to b pass through the sphere c? */
function through(a: number[], b: number[], c: Crown) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], l2 = dx * dx + dy * dy + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((c.x - a[0]) * dx + (c.y - a[1]) * dy + (c.z - a[2]) * dz) / l2));
  return Math.hypot(a[0] + dx * t - c.x, a[1] + dy * t - c.y, a[2] + dz * t - c.z) < c.r;
}

export function bannerSpot(map: GameMap, x: number, z: number): BannerSpot {
  const crowns = crownsNear(map, x, z, 60), streets = streetPointsNear(map, x, z, 60);
  const best = { score: Infinity, spot: { x, z, yaw: 0, cy: 5.6 } };

  const offsets: [number, number][] = [[0, 0]];
  for (const d of [3, 6, 9, 12, 16]) for (let k = 0; k < 8; k++) offsets.push([Math.cos(k * Math.PI / 4) * d, Math.sin(k * Math.PI / 4) * d]);

  for (const [ox, oz] of offsets) {
    const px = x + ox, pz = z + oz;
    if (map.indoors(px, pz) || !map.detailedAt(px, pz)) continue;
    let post = 0;
    for (const [qx, qz] of [[px, pz], [px + 2, pz], [px - 2, pz], [px, pz + 2], [px, pz - 2]]) if (map.blocked(qx, qz, 0.3) || map.indoors(qx, qz)) post++;
    const ground = map.ground(px, pz);

    // where people would see it from: the nearest few street points, brought in onto the pavement
    const viewers = streets.map(([sx, sz]) => ({ sx, sz, d: Math.hypot(sx - px, sz - pz) })).filter((s) => s.d > 4 && s.d < 40).sort((a, b) => a.d - b.d).slice(0, 3);
    if (!viewers.length) for (let k = 0; k < 4; k++) viewers.push({ sx: px + Math.cos(k * Math.PI / 2) * 12, sz: pz + Math.sin(k * Math.PI / 2) * 12, d: 12 });

    for (const cy of [5.6, 8]) {
      for (let vi = 0; vi < viewers.length; vi++) {
        const vw = viewers[vi], ex = vw.sx + ((px - vw.sx) / vw.d) * 3, ez = vw.sz + ((pz - vw.sz) / vw.d) * 3;
        const yaw = Math.atan2(vw.sx - px, vw.sz - pz), cs = Math.cos(yaw), sn = Math.sin(yaw);
        const eye = [ex, map.ground(ex, ez) + 1.6, ez];
        const ties: number[][] = [];
        for (const [lx, ly] of [[-W / 2, H / 2], [W / 2, H / 2], [-W / 2, -H / 2], [W / 2, -H / 2], [0, 0]]) ties.push([px + lx * cs, ground + cy + ly, pz - lx * sn]);
        let bad = 0;
        for (const t of ties) {
          if (crowns.some((c) => Math.hypot(t[0] - c.x, t[1] - c.y, t[2] - c.z) < c.r + 0.4)) { bad += 100; continue; }
          if (crowns.some((c) => through(eye, t, c))) bad += 40;
          const dx = t[0] - eye[0], dy = t[1] - eye[1], dz = t[2] - eye[2], dist = Math.hypot(dx, dy, dz);
          const hit = map.raycast(eye[0], eye[1], eye[2], dx / dist, dy / dist, dz / dist, dist);
          if (hit && hit.dist < dist - 0.4) bad += 40;
        }
        const score = bad + post * 60 + (cy > 6 ? 15 : 0) + vi * 2 + Math.hypot(ox, oz) * 0.5 + Math.abs(vw.d - 14) * 0.3;
        if (score < best.score) { best.score = score; best.spot = { x: px, z: pz, yaw, cy }; }
      }
    }
  }
  return best.spot;
}
