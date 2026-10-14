// Ranges: buildings a set piece (landmarks/setpieces.ts) rebuilds on the map's own outlines and
// heights, where the map knows their shape and height from the lidar but not what they look like
// (Prior Park's wings in priorpark.ts, Kingswood School in kingswood.ts). Each is dressed in a
// style: walls on its outline, windows to every storey along every side, a cornice and a parapet,
// and a roof, steep or low over a rectangular one and flat behind the parapet over the rest. A side
// against a taller neighbour has no windows below the neighbour's top.
// - palladian: a rusticated ground storey and sash windows above, a cornice and a balustrade, and
//   a pediment over the middle of the longest front looking north; a low one (a link) is an arcade.
// - gothic: Tudor windows under hood moulds, string courses, a battlemented parapet and steep slate.
// - tower: gothic, with tall belfry lancets at the top, battlements and pinnacles at the corners.
// - chapel: tall pointed windows between buttresses, a great window in each gabled end, steep slate.
// Nothing here goes over the network.
import * as THREE from "three";
import { Kit, stone, plain, sashGlass, archedGlass, gothicGlass, rustic, balusters, slate, glow } from "./kit";
import type { Solids } from "./solids";

/** [the foot of its walls, its eaves (metres above sea level), rectangular (1), its outline (x, z
 *  in the set piece's frame, anticlockwise), and for each side the height of the neighbour against
 *  it (0 if none)]. */
export type Range = [number, number, number, [number, number][], number[]];
export type Style = "palladian" | "gothic" | "tower" | "chapel";

const PAR = 1.0;   // a balustrade's height

/** The smallest rectangle round an outline: its middle, half its length and width, and the
 *  angle of its length (in the x, z plane). */
export function rectOf(ring: [number, number][]) {
  let best = { area: Infinity, cx: 0, cz: 0, hl: 0, hw: 0, ang: 0 };
  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % ring.length];
    const ang = Math.atan2(bz - az, bx - ax), c = Math.cos(ang), s = Math.sin(ang);
    const us = ring.map(([x, z]) => x * c + z * s), vs = ring.map(([x, z]) => -x * s + z * c);
    const u0 = Math.min(...us), u1 = Math.max(...us), v0 = Math.min(...vs), v1 = Math.max(...vs);
    const area = (u1 - u0) * (v1 - v0);
    if (area < best.area) {
      const um = (u0 + u1) / 2, vm = (v0 + v1) / 2;
      best = { area, cx: um * c - vm * s, cz: um * s + vm * c, hl: (u1 - u0) / 2, hw: (v1 - v0) / 2, ang };
    }
  }
  return best;
}

/** Each side of an outline: its ends, length, outward normal and the angle a picture on it turns by. */
export function sides(ring: [number, number][]) {
  return ring.map(([x0, z0], i) => {
    const [x1, z1] = ring[(i + 1) % ring.length], len = Math.hypot(x1 - x0, z1 - z0) || 1;
    const nx = (z1 - z0) / len, nz = -(x1 - x0) / len;          // outward, for an anticlockwise outline
    return { x0, z0, x1, z1, len, nx, nz, ry: Math.atan2(nx, nz) };
  });
}

/** The materials ranges share: make them once for a set piece. */
export function rangeMats() {
  return {
    S: stone("#efe1bf"), S2: stone("#dac79e"), R: rustic(), sash: sashGlass(), arched: archedGlass(), bal: balusters(),
    roof: slate(), lead: plain("#727a82"), tudor: gothicGlass(false, true, 3), lancet: gothicGlass(false, false, 3),
    great: gothicGlass(false, false, 5),
  };
}
type Mats = ReturnType<typeof rangeMats>;

/** Light a set piece's range windows after dark. */
export function glowRanges(grp: THREE.Group, m: Mats) {
  glow(grp, m.sash, 0, 0.85); glow(grp, m.arched, 0, 0.85);
  for (const g of [m.tudor, m.lancet, m.great]) glow(grp, g, 0, 0.8);
  return grp;
}

/** Build a range into kit k, in its set piece's frame, whose origin is oy above sea level. */
export function dressRange(k: Kit, m: Mats, [foot, eaves, rect, ring, cover]: Range, oy: number, style: Style) {
  const y0 = foot - oy, yt = eaves - oy, h = yt - y0, gothic = style !== "palladian", arcade = style === "palladian" && h < 6.5;
  const gf = arcade ? h - 0.8 : gothic ? Math.min(4.2, h * 0.45) : Math.min(4.0, h * 0.4);
  // the walls, on the outline
  const sh = new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(x, -z)));
  const wall = (mat: THREE.Material, a: number, b: number) =>
    k.add(mat, new THREE.ExtrudeGeometry(sh, { depth: b - a, bevelEnabled: false }), 0, a, 0, 0, 3, -Math.PI / 2);
  if (style === "palladian" && !arcade) { wall(m.R, y0, y0 + gf); wall(m.S, y0 + gf, yt); }
  else wall(m.S, y0, yt);
  const ss = sides(ring), r = rectOf(ring);
  const beamOut = (s: (typeof ss)[number], d: number, y: number, w: number, hh: number) =>
    k.beam(m.S2, [s.x0 + s.nx * d, y, s.z0 + s.nz * d], [s.x1 + s.nx * d, y, s.z1 + s.nz * d], w, hh, 1.5);
  for (const [i, s] of ss.entries()) {
    const free = (y: number) => cover[i] - oy < y;          // nothing taller against this side at height y
    const along = (t: number, d: number): [number, number] => [s.x0 + (s.x1 - s.x0) * t + s.nx * d, s.z0 + (s.z1 - s.z0) * t + s.nz * d];
    const dx = (s.x1 - s.x0) / s.len, dz = (s.z1 - s.z0) / s.len;
    // bands, the cornice, and the parapet along the top
    if (style === "palladian" && !arcade && free(y0 + gf)) beamOut(s, 0.2, y0 + gf, 0.4, 0.3);
    if (gothic && free(y0 + 0.8)) beamOut(s, 0.15, y0 + 0.8, 0.3, 0.25);
    if (free(yt)) {
      beamOut(s, 0.3, yt - 0.3, 0.6, 0.6);
      if (style === "palladian") {
        const [bx, bz] = along(0.5, 0.1);
        k.quad(m.bal, bx, yt + PAR / 2, bz, s.len, PAR, s.ry, 0, 0, s.len / 1.6, 1);
        k.beam(m.S2, [s.x0 + s.nx * 0.1, yt + PAR + 0.1, s.z0 + s.nz * 0.1], [s.x1 + s.nx * 0.1, yt + PAR + 0.1, s.z1 + s.nz * 0.1], 0.4, 0.2, 1.5);
      } else if (style !== "chapel") {
        // battlements: a low wall, and merlons along it
        beamOut(s, 0.1, yt + 0.3, 0.45, 0.6);
        const nm = Math.max(1, Math.floor(s.len / 1.6));
        for (let j = 0; j < nm; j++) {
          const [mx, mz] = along((j + 0.5) / nm, 0.1);
          k.add(m.S2, new THREE.BoxGeometry(0.75, 0.6, 0.45), mx, yt + 0.9, mz, s.ry, 1);
        }
      }
    }
    if (s.len < 2.8) continue;
    // the bays along this side
    const bay = style === "chapel" ? 3.6 : 3.2, n = Math.max(1, Math.floor(s.len / bay));
    if (style === "chapel") {
      const end = rect && s.len < r.hl * 1.4;   // a gabled end of the chapel
      if (end) {
        // a great window, and the gable over it
        const ww = Math.min(s.len * 0.55, 7), wh = h * 0.72, [wx, wz] = along(0.5, 0.06);
        if (free(y0 + 1)) {
          k.add(m.S2, new THREE.BoxGeometry(ww + 0.6, wh + 0.6, 0.1), wx, y0 + 1.2 + wh / 2, wz, s.ry, 1);
          const [gx, gz] = along(0.5, 0.12);
          k.quad(m.great, gx, y0 + 1.2 + wh / 2, gz, ww, wh, s.ry);
        }
        continue;
      }
      for (let j = 0; j < n; j++) {
        const [wx, wz] = along((j + 0.5) / n, 0.06), [fx, fz] = along((j + 0.5) / n, 0.12), wh = h - 3.0;
        if (free(y0 + 1.5) && wh > 2) {
          k.add(m.S2, new THREE.BoxGeometry(1.9, wh + 0.4, 0.1), wx, y0 + 1.6 + wh / 2, wz, s.ry, 1);
          k.quad(m.lancet, fx, y0 + 1.6 + wh / 2, fz, 1.5, wh, s.ry);
        }
        // a buttress at the end of each bay, stepped back near the top
        if (j < n - 1 || n === 1) {
          const [bx, bz] = along((j + 1) / n, 0.45);
          k.add(m.S2, new THREE.BoxGeometry(0.8, h - 1.2, 0.9), bx, y0 + (h - 1.2) / 2, bz, s.ry, 1.5);
          k.add(m.S2, new THREE.BoxGeometry(0.7, 1.0, 0.5), bx - s.nx * 0.2, y0 + h - 0.7, bz - s.nz * 0.2, s.ry, 1.5);
        }
      }
      continue;
    }
    for (let j = 0; j < n; j++) {
      const t = (j + 0.5) / n, [wx, wz] = along(t, 0.04), [fx, fz] = along(t, 0.1);
      if (arcade) {
        // an arched opening to each bay, in the arcade
        const ah = Math.min(3.2, gf - 0.6);
        if (free(y0 + 0.5)) k.quad(m.arched, fx, y0 + 0.4 + ah / 2, fz, Math.min(2.2, (s.len / n) * 0.62), ah, s.ry);
        continue;
      }
      const win = gothic ? m.tudor : m.sash, ww = gothic ? 1.5 : 1.25;
      const put = (y: number, w: number, wh: number) => {
        k.add(m.S2, new THREE.BoxGeometry(w + 0.4, wh + 0.4, 0.08), wx, y, wz, s.ry, 1);
        k.quad(win, fx, y, fz, w, wh, s.ry);
        if (gothic) k.add(m.S2, new THREE.BoxGeometry(w + 0.7, 0.2, 0.3), wx + s.nx * 0.1, y + wh / 2 + 0.3, wz + s.nz * 0.1, s.ry, 1);   // the hood mould
      };
      if (free(y0 + 0.5)) put(y0 + gf / 2 + 0.2, gothic ? ww : 1.05, gothic ? Math.min(2.2, gf * 0.5) : 1.35);
      const up = yt - 0.8 - (y0 + gf), ns = Math.max(1, Math.round(up / 3.4)), st = up / ns;
      for (let q = 0; q < ns; q++) {
        const y = y0 + gf + st * (q + 0.5), top = q === ns - 1 && style === "tower";
        const wh = top ? Math.min(4.5, st * 0.75) : Math.min(2.5, st * 0.62);
        if (!free(y - wh / 2)) continue;
        if (top) {
          // a pair of tall belfry lancets
          for (const o of [-0.55, 0.55]) {
            const [lx, lz] = [fx + dx * o * 1.5, fz + dz * o * 1.5];
            k.quad(m.lancet, lx, y, lz, 0.9, wh, s.ry);
          }
          k.add(m.S2, new THREE.BoxGeometry(2.6, wh + 0.4, 0.08), wx, y, wz, s.ry, 1);
          continue;
        }
        put(y, ww, wh);
        if (gothic && free(y - st / 2)) {
          const [cx, cz] = along(0.5, 0.15);
          if (j === 0) k.add(m.S2, new THREE.BoxGeometry(s.len, 0.2, 0.3), cx, y - st / 2, cz, s.ry, 1.5);   // the string course
        }
      }
    }
  }
  // corner pinnacles on a tower
  if (style === "tower") for (const [x, z] of ring) {
    k.add(m.S2, new THREE.BoxGeometry(0.9, 2.2, 0.9), x, yt + 1.1, z, 0, 1);
    k.cyl(m.S2, x, yt + 2.2, z, 0.45, 2.6, 4, 0);
  }
  // a pediment over the middle of the longest front looking north, on the bigger Palladian ranges
  const front = ss.filter((s, i) => s.nz > 0.4 && s.len > 14 && !cover[i]).sort((a, b) => b.len - a.len)[0];
  if (style === "palladian" && !arcade && h > 8 && front) {
    const w = Math.min(front.len * 0.4, 12), px = (front.x0 + front.x1) / 2 + front.nx * 0.2, pz = (front.z0 + front.z1) / 2 + front.nz * 0.2;
    const tri = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, 2.2)]);
    k.shape(m.S, tri, 1.2, px, yt, pz, front.ry, 2);
    const dx = (front.x1 - front.x0) / front.len, dz = (front.z1 - front.z0) / front.len;
    for (const sx of [-1, 1])
      k.beam(m.S2, [px + dx * sx * (w / 2 + 0.3) + front.nx * 0.5, yt, pz + dz * sx * (w / 2 + 0.3) + front.nz * 0.5],
        [px + front.nx * 0.5, yt + 2.4, pz + front.nz * 0.5], 0.4, 0.35, 1.5);
  }
  // the roof: over a rectangular range, low slate (Palladian) or steep (Gothic), built along x and
  // turned onto its rectangle; lead behind the parapet over the rest, and over a tower
  if (rect && style !== "tower") {
    const inset = style === "chapel" ? -0.3 : 0.7, steep = gothic;
    // (a deep block gets a hipped roof, its ridge kept down)
    const rise = steep ? Math.min(5.5, (r.hw - inset) * 0.95) : Math.min(3.2, (r.hw - inset) * 0.7), kk = new Kit();
    kk.roof(m.roof, -r.hl + inset, r.hl - inset, 0, -r.hw + inset, r.hw - inset, rise, false, !steep || (style !== "chapel" && r.hw > 8));
    for (const mesh of kk.build().children as THREE.Mesh[]) k.add(m.roof, mesh.geometry, r.cx, yt + (style === "chapel" ? 0 : 0.05), r.cz, -r.ang, 2);
    if (style === "chapel") {
      // stone gables at the ends, with a cross on each
      const tri = new THREE.Shape([new THREE.Vector2(-r.hw - 0.3, 0), new THREE.Vector2(r.hw + 0.3, 0), new THREE.Vector2(0, rise + 0.4)]);
      for (const e of [-1, 1]) {
        const nx = Math.cos(r.ang) * e, nz = Math.sin(r.ang) * e, gx = r.cx + nx * (r.hl + 0.05), gz = r.cz + nz * (r.hl + 0.05);
        k.shape(m.S, tri, 0.6, gx, yt, gz, Math.atan2(nx, nz), 2);
        k.add(m.S2, new THREE.BoxGeometry(0.25, 1.4, 0.25), gx, yt + rise + 1.1, gz, 0, 1);
        k.add(m.S2, new THREE.BoxGeometry(0.9, 0.25, 0.25), gx, yt + rise + 1.3, gz, Math.atan2(nx, nz), 1);
      }
    }
  } else k.add(m.lead, new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: false }), 0, yt, 0, 0, 3, -Math.PI / 2);
}

/** A wall along every side of every range, up to its eaves, into a set piece's solids. */
export function rangeSolids(S: Solids, ranges: Range[], oy: number) {
  for (const [, eaves, , ring] of ranges) for (const s of sides(ring))
    S.boxes.push({ x: (s.x0 + s.x1) / 2 - s.nx * 0.3, z: (s.z0 + s.z1) / 2 - s.nz * 0.3, hx: s.len / 2 + 0.3, hz: 0.3, top: eaves - oy, r: Math.atan2(-(s.z1 - s.z0), s.x1 - s.x0) });
}
