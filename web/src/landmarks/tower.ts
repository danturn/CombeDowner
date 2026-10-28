// A church's tower, as the lidar measured it (tools/towers.py): a plain stone shaft with a string
// course under the belfry, a pointed louvred opening in each face, battlements round the top, and,
// where the survey shows them, pinnacles at the corners and an octagonal spire. Its frame: x along
// the church, z across it, y up from the lowest ground at its foot.
// args: width (along x), depth (along z), height to the top of the battlements, spire, pinnacles.
// Nothing here goes over the network.
import * as THREE from "three";
import { Kit, stone, plain, pointedArch } from "./kit";

export function tower([w0, d0, h0, s0, p0]: (number | string)[]) {
  const w = +w0, d = +d0, h = +h0, spire = +s0, pin = +p0;
  const k = new Kit();
  const S = stone("#ecdcb4"), S2 = stone("#ddc79a"), dark = plain("#2a2d30"), lead = plain("#6d7378");
  const PAR = 0.9, T = 0.35, top = h - PAR;
  k.slab(S, -w / 2, w / 2, -1, top, -d / 2, d / 2, 3);
  k.slab(lead, -w / 2 + T, w / 2 - T, top, top + 0.05, -d / 2 + T, d / 2 - T, 2);

  // the belfry: its string course, and an opening in each face (two in a broad one)
  const bell = Math.max(top - 4.2, 2);
  k.slab(S2, -w / 2 - 0.15, w / 2 + 0.15, bell - 0.3, bell, -d / 2 - 0.15, d / 2 + 0.15, 1.5);
  const ow = Math.min(1.1, 0.22 * Math.min(w, d)), oh = Math.min(2.8, top - bell - 0.8);
  if (oh > 1) {
    const arch = new THREE.Shape();
    arch.moveTo(-ow / 2, 0);
    arch.lineTo(ow / 2, 0);
    arch.lineTo(ow / 2, oh - ow * 0.6);
    pointedArch(arch, 0, oh - ow * 0.6, ow, ow * 0.6);
    arch.lineTo(-ow / 2, 0);
    for (const [side, half, other] of [[0, d / 2, w], [Math.PI / 2, w / 2, d], [Math.PI, d / 2, w], [-Math.PI / 2, w / 2, d]] as const) {
      const n = other >= 6 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const u = n === 1 ? 0 : (i - 0.5) * other * 0.36;
        k.shape(dark, arch, 0.06, Math.cos(side) * u + Math.sin(side) * half, bell + 0.4, Math.cos(side) * half - Math.sin(side) * u, side, 3, 3);
      }
    }
  }

  // battlements: a parapet with merlons along it
  for (const [x0, x1, z0, z1] of [[-w / 2, w / 2, -d / 2, -d / 2 + T], [-w / 2, w / 2, d / 2 - T, d / 2],
    [-w / 2, -w / 2 + T, -d / 2, d / 2], [w / 2 - T, w / 2, -d / 2, d / 2]]) {
    k.slab(S2, x0 - 0.08, x1 + 0.08, top, top + PAR * 0.5, z0 - 0.08, z1 + 0.08, 1.5);
    const along = x1 - x0 > z1 - z0, len = along ? x1 - x0 : z1 - z0, n = Math.max(2, Math.round(len / 1.1));
    for (let i = 0; i < n; i++) {
      const c = -len / 2 + (i + 0.5) * (len / n), m = len / n / 2 * 0.55;
      if (along) k.slab(S2, c - m, c + m, top + PAR * 0.5, h, z0 - 0.08, z1 + 0.08, 1);
      else k.slab(S2, x0 - 0.08, x1 + 0.08, top + PAR * 0.5, h, c - m, c + m, 1);
    }
  }

  if (pin > 0) {
    const r = Math.min(0.42, 0.08 * Math.min(w, d)), shaft = pin * 0.4;
    for (const a of [-1, 1]) for (const b of [-1, 1]) {
      const x = a * (w / 2 - r), z = b * (d / 2 - r);
      k.slab(S2, x - r, x + r, top, h + shaft, z - r, z + r, 1);
      k.cyl(S2, x, h + shaft, z, r * 1.25, pin - shaft, 4, 0);
    }
  }

  if (spire > 0) {
    const r = 0.42 * Math.min(w, d);
    k.add(S, new THREE.CylinderGeometry(0, r, spire + PAR, 8, 1, true), 0, top + (spire + PAR) / 2, 0, Math.PI / 8, 2);
    k.cyl(dark, 0, h + spire - 0.1, 0, 0.05, 1.6, 4);
  }
  return k.build();
}
