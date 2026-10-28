// How high the game draws each building's roof at given points (map.ts roofsFit, as GameMap.roofAt
// reads it), for tools/roofs/errors.py to set against the survey. Run through esbuild:
//   node drawn.mjs <square.json> <points.json> <out.json>
// points.json: {"<building index>": [[x, y], ...]}; out: the same, with the absolute roof height.
import { readFileSync, writeFileSync } from "node:fs";
import * as M from "../../web/src/map";
import type { Building } from "../../web/src/map";
const { roofsFit } = M;
const roofMeshAt: (b: Building, x: number, y: number) => number | null = (M as any).roofMeshAt ?? (() => null);

const [sq, pts, out] = process.argv.slice(2);
const d = JSON.parse(readFileSync(sq, "utf8"));
const P: Record<string, number[][]> = JSON.parse(readFileSync(pts, "utf8"));
const res: Record<string, number[]> = {};
for (const [k, list] of Object.entries(P)) {
  const b: Building = d.bl[+k];
  const eave = b.g + b.h;
  res[k] = list.map(([x, y]) => {
    const m = roofMeshAt(b, x, y);
    if (m !== null) return m;
    let top = eave;
    for (const roof of roofsFit(b)) {
      const q = roof.q;
      const ux = q[1][0] - q[0][0], uy = q[1][1] - q[0][1], L = Math.hypot(ux, uy) || 1;
      const vx = q[3][0] - q[0][0], vy = q[3][1] - q[0][1], Wd = Math.hypot(vx, vy) || 1;
      const mx = (q[0][0] + q[2][0]) / 2, my = (q[0][1] + q[2][1]) / 2;
      const su = ((x - mx) * ux + (y - my) * uy) / L, sv = ((x - mx) * vx + (y - my) * vy) / Wd;
      const [hip0, hip1] = roof.hp;
      if ((!hip0 && su < -L / 2) || (!hip1 && su > L / 2)) continue;
      const slope = roof.rp / (Wd / 2), ridge = eave + roof.rp;
      let h = ridge - Math.abs(sv) * slope;
      if (hip0) h = Math.min(h, ridge - Math.max(0, -su - (L / 2 - Wd / 2)) * slope);
      if (hip1) h = Math.min(h, ridge - Math.max(0, su - (L / 2 - Wd / 2)) * slope);
      top = Math.max(top, h);
    }
    return Math.round(top * 100) / 100;
  });
}
writeFileSync(out, JSON.stringify(res));
